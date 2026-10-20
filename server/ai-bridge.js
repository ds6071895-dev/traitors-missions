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
       paced at real time by one clock for the whole server, and relayed
       into the room as if from a seat — so the same night/dead routing
       applies to an AI as to a person.

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
const LISTEN_TAIL_MS = 1500;        // enough audio silence for endpointing and UtteranceEnd
const SILENCE = Buffer.alloc(FRAME);
/* The smallest valid Opus packet: 20 ms of nothing. What keeps an Opus
   ear's clock moving through a pause, as zero PCM does for a PCM one. */
const OPUS_SILENCE = Buffer.from([0xf8, 0xff, 0xfe]);
const LEAD_MS = 60;                 // how far ahead of real time a voice is sent
const CATCH_UP_MS = 200;            // how much lost time a late tick may make up at once
const LINE_TTL_MS = 120000;         // how long a read line is kept for the next listener
const LINE_CACHE_BYTES = 24 * 1024 * 1024;
const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now());

/* ---------------- one clock for every voice ----------------
   Each voice the server speaks — an agent's turn, one of Claudia's lines
   to one listener — is a queue of frames with a time each is due. One
   timer sends whatever is due, a little ahead of time so the listener's
   buffer never runs dry on a timer that fired late, and makes up lost
   time after a stall rather than letting the voice drift slower and
   slower. Twenty separate 20 ms intervals did drift, and stuttered. */
const streams = new Set();
let pacer = null;
function pace(stream) {
  stream.due = 0; stream.started = false;
  streams.add(stream);
  if (!pacer) { pacer = setInterval(tick, 10); if (pacer.unref) pacer.unref(); }
}
function unpace(stream) { if (stream) streams.delete(stream); }
function tick() {
  const t = now();
  for (const st of streams) {
    if (st.queue.length) {
      if (!st.due) st.due = t;
      else if (st.due < t - CATCH_UP_MS) st.due = t - CATCH_UP_MS;
      while (st.queue.length && st.due <= t + LEAD_MS) {
        const frame = st.queue.shift();
        const first = !st.started;
        st.started = true;
        st.due += 20;
        try { st.send(frame, first); } catch (e) { /* a listener gone mid-line */ }
      }
    } else if (st.finished() && (!st.due || t >= st.due)) {
      // "done" when the last frame has been heard, not when it was sent
      streams.delete(st);
      try { st.drained(); } catch (e) { /* ditto */ }
    }
  }
  if (!streams.size) { clearInterval(pacer); pacer = null; }
}

/* ---------------- Ogg, for an Opus ear ----------------
   Deepgram reads Opus in an Ogg container (and works out the format
   itself), so an ear fed from Opus voices gets each packet in a page of
   its own behind the two header pages. */
const OGG_CRC = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
  OGG_CRC[i] = r >>> 0;
}
function oggCrc(buf) {
  let c = 0;
  for (let i = 0; i < buf.length; i++) c = ((c << 8) ^ OGG_CRC[((c >>> 24) ^ buf[i]) & 0xff]) >>> 0;
  return c;
}
function oggPage(serial, sequence, granule, type, packet) {
  const segments = [];
  let n = packet.length;
  while (n >= 255) { segments.push(255); n -= 255; }
  segments.push(n);
  const head = Buffer.alloc(27 + segments.length);
  head.write('OggS', 0, 'ascii');
  head[5] = type;
  head.writeBigUInt64LE(BigInt(granule), 6);
  head.writeUInt32LE(serial >>> 0, 14);
  head.writeUInt32LE(sequence >>> 0, 18);
  head[26] = segments.length;
  segments.forEach((v, i) => { head[27 + i] = v; });
  const page = Buffer.concat([head, packet]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}
function oggOpus(serial) {
  let sequence = 0, granule = 0;
  const opusHead = Buffer.alloc(19);
  opusHead.write('OpusHead', 0, 'ascii');
  opusHead[8] = 1; opusHead[9] = 1;               // version, mono
  opusHead.writeUInt16LE(312, 10);                // pre-skip
  opusHead.writeUInt32LE(24000, 12);              // what was said into it
  const vendor = Buffer.from('traitors', 'ascii');
  const opusTags = Buffer.alloc(16 + vendor.length);
  opusTags.write('OpusTags', 0, 'ascii');
  opusTags.writeUInt32LE(vendor.length, 8);
  vendor.copy(opusTags, 12);
  return {
    headers: () => [oggPage(serial, sequence++, 0, 0x02, opusHead), oggPage(serial, sequence++, 0, 0, opusTags)],
    packet: (data) => { granule += 960; return oggPage(serial, sequence++, granule, 0, data); },
  };
}

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
    const agent = { id, voice, ws: null, ready: false, queue: [], pending: Buffer.alloc(0), stream: null,
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
          if (!agent.hushed && m.role === 'assistant') say(s, { op: 'text', id, text: str(m.content, 1200) });
          break;
        case 'AgentStartedSpeaking':
          if (agent.hushed) break;
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
      unpace(agent.stream); agent.stream = null;
      if (s.agents.get(id) === agent) s.agents.delete(id);
      if (!agent.closed) say(s, { op: 'closed', id, code });
    });
  }

  /* Deepgram sends speech faster than it is spoken. The frames are queued
     here and released on the server's one clock — the rate a person's
     microphone would send them — through the same router as everybody's
     voice. */
  function audioIn(s, agent, data) {
    if (agent.hushed) return;
    agent.pending = Buffer.concat([agent.pending, data]);
    while (agent.pending.length >= FRAME) {
      agent.queue.push(agent.pending.subarray(0, FRAME));
      agent.pending = agent.pending.subarray(FRAME);
    }
    if (!agent.stream && agent.queue.length) {
      const stream = {
        queue: agent.queue,
        send: (frame, first) => relayAudio(s.room, agent.id, Buffer.from(frame), 0, null, first),
        finished: () => agent.audioDone,
        drained: () => { if (agent.stream === stream) agent.stream = null; flushDone(s, agent); },
      };
      agent.stream = stream;
      pace(stream);
    }
  }

  /* "Done" means the room has heard the last of it, not that Deepgram
     has sent the last of it — which can be seconds earlier. */
  function flushDone(s, agent) {
    if (!agent.audioDone || agent.queue.length || agent.stream) return;
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
    unpace(agent.stream); agent.stream = null;
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
    clearInterval(agent.keepalive); unpace(agent.stream); agent.stream = null; clearTimeout(agent.cancelTimer);
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

     A public line is asked for by everybody at once, so what Deepgram
     reads is kept for the room: the first ask fetches it, every other
     joins that fetch, and nobody waits for anybody. It is streamed — the
     first frames go out while the rest is still being read — and a line
     of several sentences fetches its first sentence on its own, so the
     wait before her first word is one sentence long, not the whole line.

     Lines for one listener are played strictly in order: they are
     fetched as soon as they are asked for, but each waits for the one
     before it to finish before its frames go out. */
  function readerOf(s, memberId) {
    let r = s.readers.get(memberId);
    if (!r) {
      r = { queue: [], stream: null, chain: Promise.resolve(), serial: 0, budget: [], current: null };
      s.readers.set(memberId, r);
    }
    return r;
  }

  function overBudget(r, n) {
    const t = Date.now();
    while (r.budget.length && t - r.budget[0].at > 60000) r.budget.shift();
    const used = r.budget.reduce((a, b) => a + b.n, 0);
    if (used + n > SPEAK_CHARS_PER_MIN) return true;
    r.budget.push({ at: t, n });
    return false;
  }

  // the first sentence, and the rest: her first word waits only for the first
  function parts(text) {
    const m = /^(.+?[.!?…])\s+(\S.*)$/s.exec(text);
    return m && m[1].length < text.length * 0.8 ? [m[1], m[2]] : [text];
  }

  /* One read line, shared by everybody who asks for it: frames as they
     arrive, whether it is finished, and who is waiting on more. */
  function lineEntry(s, text, r) {
    const lines = s.lines || (s.lines = new Map());
    const key = CLAUDIA_VOICE + '|' + text;
    let e = lines.get(key);
    if (e && !e.error) {
      lines.delete(key); lines.set(key, e);          // most recently used last
      e.at = Date.now();
      return e;
    }
    if (r && overBudget(r, text.length)) return null;
    e = { frames: [], done: false, error: null, waiters: new Set(), at: Date.now(), bytes: 0 };
    lines.set(key, e);
    fetchLine(s, text, e).catch(() => {});
    trimLines(s);
    return e;
  }

  function trimLines(s) {
    const lines = s.lines;
    let total = 0;
    for (const e of lines.values()) total += e.bytes;
    const t = Date.now();
    for (const [key, e] of lines) {
      if (!e.done || e.waiters.size) continue;
      if (total <= LINE_CACHE_BYTES && t - e.at < LINE_TTL_MS) continue;
      lines.delete(key); total -= e.bytes;
    }
  }

  const wake = (e) => { for (const fn of [...e.waiters]) fn(); };

  /* Deepgram answers a busy moment with a 429 or a 5xx, and a socket can
     drop mid-request. None of that should reach the browser as "read it
     yourself": ask again, a few times, before giving up — unless some of
     it has already been heard, in which case what was heard is the line. */
  async function fetchLine(s, text, e) {
    const q = new URLSearchParams({ model: CLAUDIA_VOICE, encoding: 'linear16', sample_rate: '24000', container: 'none' });
    let last = null;
    const push = (buf) => { e.frames.push(buf); e.bytes += buf.length; };
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 250 * attempt * attempt));
      let pending = Buffer.alloc(0);
      try {
        const res = await fetchImpl(speakUrl + '?' + q, {
          method: 'POST',
          headers: { Authorization: 'Token ' + (s.key || process.env.DEEPGRAM_API_KEY), 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res && res.ok) {
          const take = (chunk) => {
            pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
            let any = false;
            while (pending.length >= FRAME) { push(pending.subarray(0, FRAME)); pending = pending.subarray(FRAME); any = true; }
            if (any) wake(e);
          };
          if (res.body && typeof res.body.getReader === 'function') {
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value && value.length) take(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
            }
          } else take(Buffer.from(await res.arrayBuffer()));
          if (pending.length) { const tail = Buffer.alloc(FRAME); pending.copy(tail); push(tail); }
          e.done = true; wake(e);
          return;
        }
        last = new Error('Deepgram speak ' + (res ? res.status : 'failed'));
        if (res && res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) break;
      } catch (err) {
        last = err;
        if (e.frames.length) { e.done = true; wake(e); return; }
      }
    }
    e.error = last || new Error('Deepgram speak failed');
    e.done = true;
    wake(e);
  }

  function speak(room, memberId, msg) {
    const s = rooms.get(room.code);
    const line = str(msg.line, 40);
    const text = str(msg.text, 1800).replace(/\s+/g, ' ').trim();
    const prefetch = msg.op === 'prefetch';
    const reply = (m) => { if (!prefetch) try { toMember(room, memberId, Object.assign({ type: 'claudia', line }, m)); } catch (e) {} };
    if (!text) return reply({ op: 'done' });
    if (!s || !(s.key || process.env.DEEPGRAM_API_KEY) || !fetchImpl) return reply({ op: 'error', message: 'No Deepgram key.' });
    const r = readerOf(s, memberId);
    const entries = parts(text).map(t => lineEntry(s, t, r));
    if (entries.some(e => !e)) return reply({ op: 'error', message: 'Too much speech this minute.' });
    if (prefetch) return;
    const serial = r.serial;
    r.chain = r.chain.then(async () => {
      if (serial !== r.serial || !rooms.has(room.code)) return reply({ op: 'done', hushed: true });
      const result = await play(room, memberId, r, entries, () => reply({ op: 'start' }));
      if (result === 'error') reply({ op: 'error', message: str(entries[0].error && entries[0].error.message, 200) });
      else reply({ op: 'done' });
    });
  }

  /* One line to one listener: its parts' frames, in order, as they arrive,
     with a breath between parts. Resolves when the last has been heard,
     or 'error' if nothing could be read at all. */
  function play(room, memberId, r, entries, started) {
    return new Promise((resolve) => {
      let part = 0, idx = 0, produced = false, sent = false, over = false;
      const cur = { resolve: () => finish() };
      const finish = (v) => {
        if (over) return;
        over = true;
        entries.forEach(e => e.waiters.delete(pump));
        if (r.current === cur) r.current = null;
        resolve(v);
      };
      function pump() {
        while (part < entries.length) {
          const e = entries[part];
          while (idx < e.frames.length) r.queue.push(e.frames[idx++]);
          if (!e.done) return;
          if (e.error && !e.frames.length) {
            if (part === 0) { unpace(stream); r.stream = null; finish('error'); produced = true; return; }
          }
          part++; idx = 0;
          if (part < entries.length) for (let i = 0; i < 6; i++) r.queue.push(SILENCE);
        }
        produced = true;
      }
      const stream = {
        queue: r.queue,
        send: (frame, first) => {
          if (first && !sent) { sent = true; started(); }
          audioTo(room, memberId, CLAUDIA_LINE_ID, Buffer.from(frame), first);
        },
        finished: () => produced,
        drained: () => { if (r.stream === stream) r.stream = null; finish(); },
      };
      r.current = cur;
      entries.forEach(e => e.waiters.add(pump));
      r.stream = stream;
      pace(stream);
      pump();
    });
  }

  /* A new scene, or a line cut short: whatever is queued for this one
     person is dropped, and anything still being fetched is thrown away
     when it lands. The read line stays in the room's keeping for anybody
     else who is still hearing it. */
  function hushReader(room, memberId) {
    const s = rooms.get(room.code);
    const r = s && s.readers.get(memberId);
    if (!r) return;
    r.serial++;
    r.queue.length = 0;
    unpace(r.stream); r.stream = null;
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
    s.keyterms = [...new Set([...want.values(), ...s.names.values()].filter(Boolean))].slice(0, 20);
    for (const [id, ear] of s.ears) if (!want.has(id)) { closeEar(ear); s.ears.delete(id); }
    for (const [id, name] of want) {
      s.names.set(id, name);
      if (s.ears.has(id) || !s.key) continue;
      openEar(s, id, s.room.voiceCodec === 'opus' ? 'opus' : 'pcm');
    }
  }

  /* One person's transcription. A PCM ear is told the format; an Opus ear
     is sent Ogg pages and left to recognise them. */
  function openEar(s, id, codec) {
    if (live(s) >= maxSockets) { say(s, { op: 'error', id, message: 'Too many live AI sockets to transcribe everybody.' }); return; }
    const q = new URLSearchParams(codec === 'opus' ? {} : { encoding: 'linear16', sample_rate: '24000', channels: '1' });
    for (const [k, v] of Object.entries({ model: 'nova-3', punctuate: 'true', smart_format: 'true', interim_results: 'true',
      endpointing: '400', utterance_end_ms: '1200' })) q.set(k, v);
    (s.keyterms || []).forEach(k => q.append('keyterm', k));
    let ws;
    try { ws = new WebSocketImpl(listenUrl + '?' + q, { headers: { Authorization: 'Token ' + s.key } }); }
    catch (e) { say(s, { op: 'error', id, message: 'Could not open transcription.' }); return; }
    const ear = { id, ws, codec, ogg: codec === 'opus' ? oggOpus((Math.random() * 0xffffffff) >>> 0) : null,
                  headed: false, keepalive: null, silence: null, lastAudio: 0, closed: false };
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
    ws.on('close', () => {
      clearInterval(ear.keepalive); clearInterval(ear.silence);
      if (s.ears.get(id) === ear) s.ears.delete(id);
    });
    return ear;
  }

  function closeEar(ear) {
    ear.closed = true;
    clearInterval(ear.keepalive);
    clearInterval(ear.silence);
    try { if (ear.ws.readyState === 1) ear.ws.send(JSON.stringify({ type: 'CloseStream' })); ear.ws.close(1000); } catch (e) {}
  }

  function feed(ear, data) {
    if (!ear.ogg) { ear.ws.send(data); return; }
    if (!ear.headed) { ear.headed = true; ear.ogg.headers().forEach(page => ear.ws.send(page)); }
    ear.ws.send(ear.ogg.packet(data));
  }

  /* A human's voice frame, on its way to the room anyway. */
  function heard(room, speakerId, payload, codec = 0) {
    const s = rooms.get(room.code);
    if (!s) return;
    let ear = s.ears.get(speakerId);
    if (!ear || ear.closed) return;
    // the room changed what it speaks: this person needs an ear for the other format
    const want = codec === 1 ? 'opus' : 'pcm';
    if (ear.codec !== want) {
      closeEar(ear); s.ears.delete(speakerId);
      if (s.key) openEar(s, speakerId, want);
      return;
    }
    if (ear.ws.readyState !== 1) return;
    feed(ear, payload);
    ear.lastAudio = Date.now();
    /* Capture drops silence after its hangover, before the recogniser's
       endpoint. Keep its audio clock moving after a short name or question,
       without sending silent packets to players or streaming them forever. */
    if (!ear.silence) ear.silence = setInterval(() => {
      const gap = Date.now() - ear.lastAudio;
      if (ear.closed || ear.ws.readyState !== 1 || gap > LISTEN_TAIL_MS) {
        clearInterval(ear.silence); ear.silence = null;
      } else if (gap >= 40) feed(ear, ear.ogg ? OPUS_SILENCE : SILENCE);
    }, 20);
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

module.exports = { createAIBridge, VOICES, AI_ID, CLAUDIA_ID, CLAUDIA_LINE_ID, oggCrc, oggOpus };
