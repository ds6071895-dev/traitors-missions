'use strict';
/* ------------------------------------------------------------------
   ai-bridge.js — Deepgram, on the server, for one room at a time.

   The host's browser owns the night: it knows the roles and decides
   who speaks and when. What it cannot do is hold the API key safely or
   set a header on a WebSocket, so the plumbing lives here:

     - one Deepgram Voice Agent socket per AI voice — Claudia, and each
       AI contestant — with its own Aura voice and its own tools;
     - one Deepgram streaming speech-to-text socket per human in the
       room, fed from the voice frames the server already relays, so the
       host gets "[Ana]: …" transcripts with the speaker known exactly;
     - the agents' speech, cut into the game's own 20 ms voice frames,
       paced at real time, and relayed into the room as if from a seat —
       so the same night/dead routing applies to an AI as to a person.

   Agents get no microphone audio at all. They speak only when the host
   injects a turn, which is what stops eight voices answering at once.

   The key arrives once from the host (or `DEEPGRAM_API_KEY`), lives in
   this room's memory, and is never sent to anybody. Every socket is
   closed when the room ends or the host says so, so nothing idles on
   somebody's free credit.
------------------------------------------------------------------ */
const { WebSocket } = require('ws');

const AGENT_URL = process.env.DEEPGRAM_AGENT_URL || 'wss://agent.deepgram.com/v1/agent/converse';
const LISTEN_URL = process.env.DEEPGRAM_LISTEN_URL || 'wss://api.deepgram.com/v1/listen';
const PROJECTS_URL = process.env.DEEPGRAM_PROJECTS_URL || 'https://api.deepgram.com/v1/projects';
const SPEAK_URL = process.env.DEEPGRAM_SPEAK_URL || 'https://api.deepgram.com/v1/speak';
const CLAUDIA_VOICE = 'aura-2-pandora-en';
const SPEAK_CHARS_PER_MIN = 5000;  // one listener's share of Claudia, generously
const THINK_MODEL = process.env.DEEPGRAM_THINK_MODEL || 'gpt-4o-mini';
const THINK_PROVIDER = process.env.DEEPGRAM_THINK_PROVIDER || 'open_ai';
const FRAME = 960;                 // 20 ms of 24 kHz mono PCM16
const MAX_SOCKETS = Number(process.env.DEEPGRAM_MAX_SOCKETS || 15);
const KEEPALIVE_MS = 5000;

const VOICES = new Set(['aura-2-pandora-en', 'aura-2-draco-en', 'aura-2-thalia-en', 'aura-2-andromeda-en',
  'aura-2-apollo-en', 'aura-2-arcas-en', 'aura-2-aries-en', 'aura-2-asteria-en', 'aura-2-athena-en',
  'aura-2-atlas-en', 'aura-2-aurora-en', 'aura-2-callista-en', 'aura-2-cora-en', 'aura-2-cordelia-en',
  'aura-2-delia-en', 'aura-2-electra-en', 'aura-2-harmonia-en', 'aura-2-helena-en', 'aura-2-hera-en',
  'aura-2-hermes-en', 'aura-2-hyperion-en', 'aura-2-iris-en', 'aura-2-janus-en', 'aura-2-juno-en',
  'aura-2-jupiter-en', 'aura-2-luna-en', 'aura-2-mars-en', 'aura-2-minerva-en', 'aura-2-neptune-en',
  'aura-2-odysseus-en', 'aura-2-ophelia-en', 'aura-2-orion-en', 'aura-2-orpheus-en', 'aura-2-phoebe-en',
  'aura-2-pluto-en', 'aura-2-saturn-en', 'aura-2-selene-en', 'aura-2-theia-en', 'aura-2-vesta-en',
  'aura-2-zeus-en', 'aura-2-amalthea-en']);

const AI_ID = /^[0-9a-f-]{36}$/i;
const CLAUDIA_ID = 'c1a0d1a0-0000-4000-8000-00000000c1a0';
/* Claudia's scripted lines are a voice of their own on the wire, so a
   line read to one person never shares a playback buffer with her live
   agent talking to the room. */
const CLAUDIA_LINE_ID = 'c1a0d1a0-0000-4000-8000-00000000c1a1';
const str = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n);

/* The tools an agent may call. They are only ever names and arguments:
   the host validates every call against the session before anything
   happens, and answers with what actually did. */
function cleanFunctions(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 12).map(f => ({
    name: str(f && f.name, 64).replace(/[^\w-]/g, ''),
    description: str(f && f.description, 600),
    parameters: f && f.parameters && typeof f.parameters === 'object' ? f.parameters : { type: 'object', properties: {} },
  })).filter(f => f.name);
}

function createAIBridge({ relayAudio, toHost, toMember = () => {}, audioTo = () => {},
  WebSocketImpl = WebSocket, fetchImpl = globalThis.fetch,
  agentUrl = AGENT_URL, listenUrl = LISTEN_URL, projectsUrl = PROJECTS_URL, speakUrl = SPEAK_URL,
  maxSockets = MAX_SOCKETS } = {}) {

  const rooms = new Map();         // room code -> state

  function stateOf(room) {
    let s = rooms.get(room.code);
    if (!s) {
      s = { room, key: null, agents: new Map(), ears: new Map(), names: new Map(), status: 'off',
            readers: new Map() };
      rooms.set(room.code, s);
    }
    return s;
  }

  const live = (s) => s.agents.size + s.ears.size;

  function say(s, msg) { try { toHost(s.room, Object.assign({ type: 'ai' }, msg)); } catch (e) { /* host gone */ } }

  /* ---------------- the key ---------------- */

  async function configure(s, msg) {
    const key = str(msg.key, 200).trim() || process.env.DEEPGRAM_API_KEY || '';
    if (!key) { s.key = null; s.status = 'off'; say(s, { op: 'status', ok: false, error: 'No Deepgram key.' }); return; }
    s.key = key;
    s.status = 'checking';
    say(s, { op: 'status', ok: null, status: 'checking' });
    if (!fetchImpl) { s.status = 'ready'; say(s, { op: 'status', ok: true }); return; }
    try {
      const res = await fetchImpl(projectsUrl, { headers: { Authorization: 'Token ' + key } });
      if (res.status === 401 || res.status === 403) {
        s.key = null; s.status = 'off';
        say(s, { op: 'status', ok: false, error: 'Deepgram did not accept that key.' });
        return;
      }
      s.status = 'ready';
      say(s, { op: 'status', ok: true });
    } catch (e) {
      // offline check failed: keep the key, and let the first socket say
      s.status = 'ready';
      say(s, { op: 'status', ok: true, warning: 'Could not reach Deepgram to check the key.' });
    }
  }

  /* ---------------- an agent ---------------- */

  function spawn(s, msg) {
    const id = str(msg.id, 36);
    if (!AI_ID.test(id)) return say(s, { op: 'error', id, message: 'Bad agent id.' });
    if (!s.key) return say(s, { op: 'error', id, message: 'Add a Deepgram key first.' });
    if (s.agents.has(id)) return say(s, { op: 'ready', id });
    if (live(s) >= maxSockets) return say(s, { op: 'error', id, message: 'Too many live AI voices for this plan.' });
    const voice = VOICES.has(msg.voice) ? msg.voice : 'aura-2-thalia-en';
    const agent = { id, voice, ws: null, ready: false, queue: [], pending: Buffer.alloc(0), pace: null,
                    keepalive: null, hushed: false, speaking: false, outbox: [], closed: false,
                    inflight: false, cancelTimer: null, deferred: null, lastInject: null, refusals: 0,
                    name: str(msg.name, 24) };
    s.agents.set(id, agent);
    s.names.set(id, agent.name);
    let ws;
    try {
      ws = new WebSocketImpl(agentUrl, { headers: { Authorization: 'Token ' + s.key } });
    } catch (e) {
      s.agents.delete(id);
      return say(s, { op: 'error', id, message: 'Could not open a Deepgram voice.' });
    }
    agent.ws = ws;
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'Settings',
        audio: { input: { encoding: 'linear16', sample_rate: 24000 },
                 output: { encoding: 'linear16', sample_rate: 24000, container: 'none' } },
        agent: {
          language: 'en',
          listen: { provider: { type: 'deepgram', model: 'nova-3' } },
          think: { provider: { type: THINK_PROVIDER, model: THINK_MODEL, temperature: 0.85 },
                   prompt: str(msg.prompt, 30000), functions: cleanFunctions(msg.functions) },
          speak: { provider: { type: 'deepgram', model: voice } },
        },
      }));
      agent.keepalive = setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }, KEEPALIVE_MS);
    });
    ws.on('message', (data, binary) => {
      if (binary) { audioIn(s, agent, data); return; }
      let m; try { m = JSON.parse(data.toString()); } catch { return; }
      switch (m.type) {
        case 'SettingsApplied':
          agent.ready = true;
          say(s, { op: 'ready', id });
          agent.outbox.splice(0).forEach(x => ws.send(x));
          break;
        case 'ConversationText':
          if (m.role === 'assistant') say(s, { op: 'text', id, text: str(m.content, 1200) });
          break;
        case 'AgentStartedSpeaking':
          agent.speaking = true; say(s, { op: 'speaking', id }); break;
        case 'AgentAudioDone':
          agent.inflight = false;
          /* The tail of a turn that was cut short: its audio was dropped,
             and it must not report "done" for whatever is asked next. */
          if (agent.hushed) { agent.audioDone = false; agent.speaking = false; settle(s, agent); break; }
          agent.audioDone = true; flushDone(s, agent); break;
        case 'FunctionCallRequest':
          say(s, { op: 'tool', id, calls: (m.functions || []).slice(0, 4).map(f => ({
            callId: str(f.id, 80), name: str(f.name, 64), arguments: str(f.arguments, 2000) })) });
          break;
        case 'InjectionRefused':
          /* Deepgram will not take a turn while the agent is still
             speaking or thinking. Try again in a moment; only a turn
             that keeps being refused is reported, so the director can
             give the floor to somebody else instead of waiting it out. */
          if (agent.lastInject && agent.refusals++ < 4) {
            const again = agent.lastInject;
            setTimeout(() => { if (!agent.closed && agent.lastInject === again && ws.readyState === 1) ws.send(again); }, 600);
          } else { agent.inflight = false; say(s, { op: 'refused', id, final: true }); }
          break;
        case 'Error':
          say(s, { op: 'error', id, message: str(m.description || m.message || 'Deepgram error', 300),
                   code: str(m.code, 60) });
          break;
        default: break;
      }
    });
    ws.on('error', (e) => say(s, { op: 'error', id, message: 'Deepgram voice failed: ' + str(e && e.message, 200) }));
    ws.on('close', (code) => {
      clearInterval(agent.keepalive);
      clearInterval(agent.pace);
      if (s.agents.get(id) === agent) s.agents.delete(id);
      if (!agent.closed) say(s, { op: 'closed', id, code });
    });
  }

  /* Deepgram sends speech faster than it is spoken. The room's playback
     buffer is a fifth of a second, so the frames are queued here and
     released one per 20 ms — the rate a person's microphone would send
     them — through the same router as everybody's voice. */
  function audioIn(s, agent, data) {
    if (agent.hushed) return;
    agent.pending = Buffer.concat([agent.pending, data]);
    while (agent.pending.length >= FRAME) {
      agent.queue.push(agent.pending.subarray(0, FRAME));
      agent.pending = agent.pending.subarray(FRAME);
    }
    if (!agent.pace) {
      agent.pace = setInterval(() => {
        const frame = agent.queue.shift();
        if (frame) { relayAudio(s.room, agent.id, Buffer.from(frame)); return; }
        clearInterval(agent.pace); agent.pace = null;
        flushDone(s, agent);
      }, 20);
    }
  }

  /* "Done" means the room has heard the last of it, not that Deepgram
     has sent the last of it — which can be seconds earlier. */
  function flushDone(s, agent) {
    if (!agent.audioDone || agent.queue.length || agent.pace) return;
    agent.audioDone = false;
    agent.speaking = false;
    say(s, { op: 'done', id: agent.id });
  }

  function send(s, msg, build, turn) {
    const agent = s.agents.get(str(msg.id, 36));
    if (!agent || !agent.ws) return;
    const payload = JSON.stringify(build(agent));
    /* A turn asked for while the last one is still being thrown away
       waits for it to end, or the two would be spoken together. Only
       the newest waiting turn is kept: it is the one that is current. */
    if (turn && agent.hushed) { agent.deferred = payload; return; }
    if (turn) { agent.inflight = true; agent.refusals = 0; agent.lastInject = payload; }
    if (agent.ready && agent.ws.readyState === 1) agent.ws.send(payload);
    else agent.outbox.push(payload);
  }

  /* The turn being thrown away has finished (or taken too long): the
     agent is clear, so the turn that was waiting goes now. */
  function settle(s, agent) {
    clearTimeout(agent.cancelTimer); agent.cancelTimer = null;
    agent.hushed = false;
    const next = agent.deferred;
    agent.deferred = null;
    if (next && agent.ws && agent.ws.readyState === 1) {
      agent.inflight = true; agent.refusals = 0; agent.lastInject = next;
      agent.ws.send(next);
    }
  }

  /* Cutting an agent off. Deepgram has no "stop talking", so the rest of
     the turn is simply not relayed: audio is dropped until the agent
     reports that turn finished, and the next turn waits behind it. */
  function hush(s, msg) {
    const agent = s.agents.get(str(msg.id, 36));
    if (!agent) return;
    agent.queue.length = 0; agent.pending = Buffer.alloc(0);
    if (agent.pace) { clearInterval(agent.pace); agent.pace = null; }
    agent.audioDone = false;
    if (msg.on === false) { if (agent.hushed) settle(s, agent); return; }
    // Claudia taking the room also cancels any next turn waiting behind this one.
    agent.deferred = null;
    if (agent.hushed) return;
    // only while Deepgram is still producing the turn: if it has finished, the queue was all there was
    if (agent.inflight) {
      agent.hushed = true;
      agent.speaking = false;
      agent.cancelTimer = setTimeout(() => settle(s, agent), 6000);
    }
  }

  function close(s, id) {
    const agent = s.agents.get(id);
    if (!agent) return;
    agent.closed = true;
    clearInterval(agent.keepalive); clearInterval(agent.pace); clearTimeout(agent.cancelTimer);
    try { agent.ws.close(1000); } catch (e) {}
    s.agents.delete(id);
  }

  /* ---------------- Claudia's lines, read to one person ----------------
     Every line Claudia speaks from the script — public or private — is
     read aloud by Deepgram's text-to-speech in her voice and sent to the
     one browser that asked for it. Each browser asks for its own lines,
     so "you are a Traitor" is heard by the Traitor and nobody else, and
     nobody's screen ever falls back to the browser's robot voice while
     a key is set.

     Lines for one listener are played strictly in order: they are
     fetched as soon as they are asked for, but each waits for the one
     before it to finish before its frames go out. */
  function readerOf(s, memberId) {
    let r = s.readers.get(memberId);
    if (!r) {
      r = { queue: [], pace: null, chain: Promise.resolve(), serial: 0, budget: [], current: null };
      s.readers.set(memberId, r);
    }
    return r;
  }

  function overBudget(r, n) {
    const now = Date.now();
    while (r.budget.length && now - r.budget[0].at > 60000) r.budget.shift();
    const used = r.budget.reduce((a, b) => a + b.n, 0);
    if (used + n > SPEAK_CHARS_PER_MIN) return true;
    r.budget.push({ at: now, n });
    return false;
  }

  /* Deepgram answers a busy moment with a 429 or a 5xx, and a socket can
     drop mid-request. None of that should reach the browser as "read it
     yourself": ask again, a few times, before giving up. */
  async function fetchLine(s, text) {
    const q = new URLSearchParams({ model: CLAUDIA_VOICE, encoding: 'linear16', sample_rate: '24000', container: 'none' });
    let last = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 250 * attempt * attempt));
      try {
        const res = await fetchImpl(speakUrl + '?' + q, {
          method: 'POST',
          headers: { Authorization: 'Token ' + (s.key || process.env.DEEPGRAM_API_KEY), 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res && res.ok) return Buffer.from(await res.arrayBuffer());
        last = new Error('Deepgram speak ' + (res ? res.status : 'failed'));
        if (res && res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) break;
      } catch (e) { last = e; }
    }
    throw last || new Error('Deepgram speak failed');
  }

  function speak(room, memberId, msg) {
    const s = rooms.get(room.code);
    const line = str(msg.line, 40);
    const text = str(msg.text, 1800).replace(/\s+/g, ' ').trim();
    const reply = (m) => { try { toMember(room, memberId, Object.assign({ type: 'claudia', line }, m)); } catch (e) {} };
    if (!text) return reply({ op: 'done' });
    if (!s || !(s.key || process.env.DEEPGRAM_API_KEY) || !fetchImpl) return reply({ op: 'error', message: 'No Deepgram key.' });
    const r = readerOf(s, memberId);
    if (overBudget(r, text.length)) return reply({ op: 'error', message: 'Too much speech this minute.' });
    const serial = r.serial;
    const audio = fetchLine(s, text);
    audio.catch(() => {});
    r.chain = r.chain.then(async () => {
      let pcm;
      try { pcm = await audio; } catch (e) { reply({ op: 'error', message: str(e && e.message, 200) }); return; }
      if (serial !== r.serial || !rooms.has(room.code)) return reply({ op: 'done', hushed: true });
      await play(room, memberId, r, pcm, line);
      reply({ op: 'done' });
    });
  }

  function play(room, memberId, r, pcm, line) {
    return new Promise((resolve) => {
      for (let i = 0; i + FRAME <= pcm.length; i += FRAME) r.queue.push(pcm.subarray(i, i + FRAME));
      const tail = pcm.length % FRAME;
      if (tail) { const last = Buffer.alloc(FRAME); pcm.copy(last, 0, pcm.length - tail); r.queue.push(last); }
      r.current = { line, resolve };
      clearInterval(r.pace);
      r.pace = setInterval(() => {
        const frame = r.queue.shift();
        if (frame) { audioTo(room, memberId, CLAUDIA_LINE_ID, Buffer.from(frame)); return; }
        clearInterval(r.pace); r.pace = null;
        const c = r.current; r.current = null;
        if (c) c.resolve();
      }, 20);
    });
  }

  /* A new scene, or a line cut short: whatever is queued for this one
     person is dropped, and anything still being fetched is thrown away
     when it lands. */
  function hushReader(room, memberId) {
    const s = rooms.get(room.code);
    const r = s && s.readers.get(memberId);
    if (!r) return;
    r.serial++;
    r.queue.length = 0;
    if (r.pace) { clearInterval(r.pace); r.pace = null; }
    const c = r.current; r.current = null;
    if (c) c.resolve();
  }

  /* ---------------- the room's ears ---------------- */

  function listen(s, msg) {
    const want = new Map();
    for (const h of (Array.isArray(msg.humans) ? msg.humans : []).slice(0, 8)) {
      const id = str(h && h.id, 36);
      if (s.room.members.has(id)) want.set(id, str(h.name, 24));
    }
    const keyterms = [...new Set([...want.values(), ...s.names.values()].filter(Boolean))].slice(0, 20);
    for (const [id, ear] of s.ears) if (!want.has(id)) { closeEar(ear); s.ears.delete(id); }
    for (const [id, name] of want) {
      s.names.set(id, name);
      if (s.ears.has(id) || !s.key) continue;
      if (live(s) >= maxSockets) { say(s, { op: 'error', id, message: 'Too many live AI sockets to transcribe everybody.' }); continue; }
      const q = new URLSearchParams({ model: 'nova-3', encoding: 'linear16', sample_rate: '24000',
        channels: '1', punctuate: 'true', smart_format: 'true', interim_results: 'true',
        endpointing: '400', utterance_end_ms: '1200' });
      keyterms.forEach(k => q.append('keyterm', k));
      let ws;
      try { ws = new WebSocketImpl(listenUrl + '?' + q, { headers: { Authorization: 'Token ' + s.key } }); }
      catch (e) { say(s, { op: 'error', id, message: 'Could not open transcription.' }); continue; }
      const ear = { id, ws, keepalive: null, closed: false };
      s.ears.set(id, ear);
      ws.on('open', () => {
        ear.keepalive = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'KeepAlive' })); }, KEEPALIVE_MS);
      });
      ws.on('message', (data, binary) => {
        if (binary) return;
        let m; try { m = JSON.parse(data.toString()); } catch { return; }
        if (m.type === 'Results') {
          const text = m.channel && m.channel.alternatives && m.channel.alternatives[0]
            && m.channel.alternatives[0].transcript;
          if (text && m.is_final) say(s, { op: 'heard', id, text: str(text, 600), final: !!m.speech_final });
          else if (text) say(s, { op: 'hearing', id, text: str(text, 200) });
        } else if (m.type === 'UtteranceEnd') say(s, { op: 'pause', id });
      });
      ws.on('error', (e) => say(s, { op: 'error', id, message: 'Transcription failed: ' + str(e && e.message, 200) }));
      ws.on('close', () => { clearInterval(ear.keepalive); if (s.ears.get(id) === ear) s.ears.delete(id); });
    }
  }

  function closeEar(ear) {
    ear.closed = true;
    clearInterval(ear.keepalive);
    try { if (ear.ws.readyState === 1) ear.ws.send(JSON.stringify({ type: 'CloseStream' })); ear.ws.close(1000); } catch (e) {}
  }

  /* A human's voice frame, on its way to the room anyway. */
  function heard(room, speakerId, pcm) {
    const s = rooms.get(room.code);
    if (!s) return;
    const ear = s.ears.get(speakerId);
    if (ear && ear.ws.readyState === 1) ear.ws.send(pcm);
  }

  /* ---------------- the host's control channel ---------------- */

  function handle(room, msg) {
    const s = stateOf(room);
    switch (msg && msg.op) {
      case 'configure': configure(s, msg); break;
      case 'spawn': spawn(s, msg); break;
      case 'prompt': send(s, msg, () => ({ type: 'UpdatePrompt', prompt: str(msg.text, 30000) })); break;
      case 'say':
        send(s, msg, () => ({ type: 'InjectAgentMessage', message: str(msg.text, 1200),
                              ...(msg.queue === false ? {} : { behavior: 'queue' }) }), true); break;
      case 'ask':
        send(s, msg, () => ({ type: 'InjectUserMessage', content: str(msg.text, 8000) }), true); break;
      case 'tool': send(s, msg, () => ({ type: 'FunctionCallResponse', id: str(msg.callId, 80),
                                           name: str(msg.name, 64), content: str(msg.content, 2000) })); break;
      case 'hush': hush(s, msg); break;
      case 'close': close(s, str(msg.id, 36)); break;
      case 'listen': listen(s, msg); break;
      case 'end': end(room); break;
      default: break;
    }
  }

  function end(room) {
    const s = rooms.get(room.code);
    if (!s) return;
    for (const id of [...s.agents.keys()]) close(s, id);
    for (const ear of s.ears.values()) closeEar(ear);
    s.ears.clear();
    for (const id of [...s.readers.keys()]) hushReader(room, id);
    s.readers.clear();
    rooms.delete(room.code);
  }

  function isAgent(room, id) {
    const s = rooms.get(room.code);
    return !!(s && s.agents.has(id));
  }

  /* Whether this room can read Claudia's lines aloud at all. */
  const canSpeak = (room) => { const s = rooms.get(room.code); return !!(s && s.key); };

  return { handle, heard, end, isAgent, speak, hushReader, canSpeak, rooms, VOICES };
}

module.exports = { createAIBridge, VOICES, AI_ID, CLAUDIA_ID, CLAUDIA_LINE_ID };
