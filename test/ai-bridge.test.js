/* ------------------------------------------------------------------
   ai-bridge.test.js — Deepgram, without Deepgram.

   A fake Deepgram on localhost speaks just enough of the Voice Agent
   and streaming-listen protocols, and the real room server is pointed
   at it. Then real WebSocket clients do what the game does: the host
   pastes a key, wakes voices, injects turns, and a guest hears the
   agents' speech arrive as ordinary 20 ms voice frames — routed like
   anybody's. No key, no credit, no network.
------------------------------------------------------------------ */
const http = require('node:http');
const { WebSocketServer, WebSocket } = require('ws');
const { createServer } = require('../server');
const { CLAUDIA_ID, CLAUDIA_LINE_ID } = require('../server/ai-bridge');
const H = require('./harness');
const { atest, eq, ok, report } = H;

const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('Timed out'); await delay(5); }
}

/* ---------------- the fake Deepgram ---------------- */

const speaks = [];
function fakeDeepgram() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/v1/speak')) {
      let body = '';
      req.on('data', d => { body += d; });
      req.on('end', () => {
        const text = JSON.parse(body).text;
        speaks.push({ auth: req.headers.authorization, url: req.url, text });
        if (req.headers.authorization !== 'Token good-key') { res.writeHead(401); return res.end(); }
        // 40 ms of speech per word, so a longer line is a longer line; the
        // first one is slow to arrive, to prove lines still play in order
        const words = text.split(' ').length;
        setTimeout(() => { res.writeHead(200); res.end(Buffer.alloc(words * 1920, words)); },
                   speaks.length === 1 ? 120 : 5);
      });
      return;
    }
    if (req.url.startsWith('/v1/projects')) {
      const ok = req.headers.authorization === 'Token good-key';
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      return res.end(ok ? '{"projects":[]}' : '{"err":"bad"}');
    }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ server });
  const seen = { agents: [], ears: [], settings: [], injected: [], toolResults: [], audioIn: 0, keepalives: 0, closed: 0 };
  wss.on('connection', (ws, req) => {
    const auth = req.headers.authorization;
    if (req.url.startsWith('/v1/agent')) {
      seen.agents.push({ auth });
      ws.on('message', (data, binary) => {
        if (binary) return;
        const m = JSON.parse(data.toString());
        if (m.type === 'Settings') { seen.settings.push(m); ws.send(JSON.stringify({ type: 'SettingsApplied' })); }
        if (m.type === 'KeepAlive') seen.keepalives++;
        if (m.type === 'InjectAgentMessage' || m.type === 'InjectUserMessage') {
          seen.injected.push(m);
          ws.send(JSON.stringify({ type: 'AgentStartedSpeaking' }));
          // 100 ms of speech, sent all at once the way TTS arrives
          ws.send(Buffer.alloc(4800, 1), { binary: true });
          ws.send(JSON.stringify({ type: 'ConversationText', role: 'assistant',
            content: m.message || 'I have a feeling about Bo.' }));
          if (m.type === 'InjectUserMessage' && /vote/i.test(m.content)) {
            ws.send(JSON.stringify({ type: 'FunctionCallRequest', functions: [
              { id: 'call-1', name: 'vote_banish', arguments: '{"name":"Bo"}', client_side: true }] }));
          }
          if (m.type === 'InjectUserMessage' && /^SLOW/.test(m.content)) {
            // a turn still being produced when the host cuts it off
            setTimeout(() => {
              ws.send(JSON.stringify({ type: 'AgentStartedSpeaking' }));
              ws.send(Buffer.alloc(4800, 2), { binary: true });
              ws.send(JSON.stringify({ type: 'ConversationText', role: 'assistant', content: 'The cancelled tail.' }));
            }, 160);
            setTimeout(() => ws.send(JSON.stringify({ type: 'AgentAudioDone' })), 250);
          } else ws.send(JSON.stringify({ type: 'AgentAudioDone' }));
        }
        if (m.type === 'FunctionCallResponse') seen.toolResults.push(m);
      });
      ws.on('close', () => seen.closed++);
    } else if (req.url.startsWith('/v1/listen')) {
      seen.ears.push({ auth, url: req.url });
      let pending = false, silence = 0, utterances = 0;
      ws.on('message', (data, binary) => {
        if (!binary) return;
        seen.audioIn++;
        if (data.some(byte => byte !== 0)) {
          pending = true; silence = 0;
        } else if (pending) {
          silence += data.length / 48; // milliseconds at 24 kHz PCM16
          if (silence >= 400) {
            pending = false;
            ws.send(JSON.stringify({ type: 'Results', is_final: true, speech_final: true,
              channel: { alternatives: [{ transcript: utterances++ ? 'Morag!' : 'I think Morag is lying' }] } }));
          }
        }
      });
    }
  });
  return { server, wss, seen };
}

(async () => {
  const dg = fakeDeepgram();
  await new Promise(r => dg.server.listen(0, '127.0.0.1', r));
  const base = '127.0.0.1:' + dg.server.address().port;
  const app = createServer({ reconnectMs: 1200, ai: {
    agentUrl: 'ws://' + base + '/v1/agent/converse',
    listenUrl: 'ws://' + base + '/v1/listen',
    projectsUrl: 'http://' + base + '/v1/projects',
    speakUrl: 'http://' + base + '/v1/speak',
    maxSockets: 4,
  } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const clients = [];
  function client() {
    const c = H.load(['js/core/room-socket.js', 'js/core/party.js'], { WebSocket, URL, location: { href: origin } });
    clients.push(c); return c;
  }
  const A = client(), B = client();
  const fromHost = [];
  try {
    await atest('the host opens a room and only the host hears from the bridge', async () => {
      const code = await A.Party.host({ name: 'Ana' });
      await B.Party.join(code, { name: 'Bo' });
      await until(() => A.Party.roster().length === 2);
      A.Party.on('ai', (m) => fromHost.push(m));
      const guestHeard = [];
      B.Party.on('ai', (m) => guestHeard.push(m));
      A.Party.ai({ op: 'configure', key: 'bad-key' });
      await until(() => fromHost.some(m => m.op === 'status' && m.ok === false));
      ok(/did not accept/.test(fromHost.find(m => m.ok === false).error), 'a bad key is refused, in words');
      A.Party.ai({ op: 'configure', key: 'good-key' });
      await until(() => fromHost.some(m => m.op === 'status' && m.ok === true));
      B.Party.ai({ op: 'configure', key: 'stolen' });
      await delay(60);
      eq(guestHeard.length, 0, 'a guest never sees the bridge, and cannot drive it');
    });

    const BOT = '11111111-2222-4333-8444-555555555555';
    await atest('a voice wakes with its settings, voice and tools, behind the key', async () => {
      A.Party.ai({ op: 'spawn', id: BOT, name: 'Morag', voice: 'aura-2-thalia-en', prompt: 'You are Morag.',
                   functions: [{ name: 'vote_banish', description: 'vote', parameters: { type: 'object', properties: {} } }] });
      await until(() => fromHost.some(m => m.op === 'ready' && m.id === BOT));
      eq(dg.seen.agents[0].auth, 'Token good-key', 'authenticated server-side, with the room’s key');
      const st = dg.seen.settings[0];
      eq(st.audio.output.encoding, 'linear16');
      eq(st.audio.output.sample_rate, 24000, 'the game’s own voice format, so nothing is resampled');
      eq(st.agent.speak.provider.model, 'aura-2-thalia-en', 'its own voice');
      eq(st.agent.think.prompt, 'You are Morag.');
      eq(st.agent.think.functions[0].name, 'vote_banish', 'with its tools');
    });

    await atest('an agent’s speech reaches the room as paced 20 ms voice frames', async () => {
      const heard = [];
      B.Party.room.onAudio = (p) => heard.push(Buffer.from(p));
      const t0 = Date.now();
      A.Party.ai({ op: 'ask', id: BOT, text: 'Say something.' });
      await until(() => fromHost.some(m => m.op === 'done' && m.id === BOT));
      eq(heard.length, 5, '100 ms of speech is five frames');
      ok(heard.every(p => p.length === 996), 'each one an ordinary voice packet');
      eq(heard[0].subarray(0, 36).toString(), BOT, 'from the AI seat');
      ok(Date.now() - t0 >= 80, 'and paced, not dumped: ' + (Date.now() - t0) + 'ms');
      ok(fromHost.some(m => m.op === 'text' && m.id === BOT), 'the host is told what was said');
    });

    await atest('a turn that is cut off ends quietly, and the next waits for it instead of speaking over it', async () => {
      const before = dg.seen.injected.length;
      const doneBefore = fromHost.filter(m => m.op === 'done' && m.id === BOT).length;
      A.Party.ai({ op: 'ask', id: BOT, text: 'SLOW first' });
      await until(() => dg.seen.injected.length === before + 1);
      A.Party.ai({ op: 'hush', id: BOT, on: true });
      A.Party.ai({ op: 'ask', id: BOT, text: 'second' });
      await new Promise(r => setTimeout(r, 120));
      eq(dg.seen.injected.length, before + 1, 'the second turn is held back while the first is still being produced');
      await until(() => dg.seen.injected.length === before + 2);
      await until(() => fromHost.filter(m => m.op === 'done' && m.id === BOT).length > doneBefore);
      await new Promise(r => setTimeout(r, 200));
      eq(fromHost.filter(m => m.op === 'done' && m.id === BOT).length, doneBefore + 1,
        'one "done", for the turn that was actually finished — not one for the one thrown away');
    });

    await atest('hushing again cancels a deferred turn before Claudia speaks', async () => {
      const before = dg.seen.injected.length;
      A.Party.ai({ op: 'ask', id: BOT, text: 'SLOW interrupted' });
      await until(() => dg.seen.injected.length === before + 1);
      A.Party.ai({ op: 'hush', id: BOT, on: true });
      A.Party.ai({ op: 'ask', id: BOT, text: 'A queued comment' });
      A.Party.ai({ op: 'hush', id: BOT, on: true });
      await delay(400);
      eq(dg.seen.injected.length, before + 1, 'the deferred comment never starts during her speech');
    });

    await atest('cancelled speech cannot keep sending text or speaking notifications after its audio is dropped', async () => {
      const before = dg.seen.injected.length;
      const heard = [];
      B.Party.room.onAudio = p => heard.push(p);
      A.Party.ai({ op: 'ask', id: BOT, text: 'SLOW cancelled response' });
      await until(() => dg.seen.injected.length === before + 1);
      A.Party.ai({ op: 'hush', id: BOT, on: true });
      await delay(60);
      const start = fromHost.length, frames = heard.length;
      await delay(250);
      eq(heard.length, frames, 'the cancelled tail is silent');
      eq(fromHost.slice(start).filter(m => m.id === BOT && ['text', 'speaking', 'done'].includes(m.op)), [],
        'its text and lifecycle events are dropped with its audio');
    });

    await atest('voice routes apply to an AI exactly as to a person', async () => {
      const room = app.rooms.get(A.Party.code);
      const heard = [];
      B.Party.room.onAudio = (p) => heard.push(p);
      room.routes = { open: [A.Party.selfId(), B.Party.selfId()], night: null };   // the AI is out of the game
      A.Party.ai({ op: 'say', id: BOT, text: 'From beyond.' });
      await delay(250);
      eq(heard.length, 0, 'the living do not hear a banished AI');
      room.routes = { open: [A.Party.selfId(), B.Party.selfId()], night: [A.Party.selfId()] };
      const before = heard.length;
      app.relayAudio(room, CLAUDIA_ID, Buffer.alloc(960));
      await until(() => heard.length > before);
      ok(true, 'Claudia is heard everywhere, even at night');
      room.routes = null;
    });

    await atest('Claudia’s lines are read to the one person who asked, in order, in her voice', async () => {
      const toB = [], toA = [], doneB = [];
      B.Party.room.onAudio = (p) => toB.push(Buffer.from(p));
      A.Party.room.onAudio = (p) => toA.push(Buffer.from(p));
      B.Party.on('claudia', (m) => doneB.push(m));
      B.Party.claudia({ op: 'say', text: 'You are a Traitor.', line: 'l1' });
      B.Party.claudia({ op: 'say', text: 'Tell nobody.', line: 'l2' });
      await until(() => doneB.length === 2);
      eq(doneB.map(m => [m.line, m.op]), [['l1', 'done'], ['l2', 'done']], 'each line reports back, in order');
      eq(speaks.slice(-2).map(x => x.text), ['You are a Traitor.', 'Tell nobody.']);
      ok(/model=aura-2-pandora-en/.test(speaks[0].url) && speaks[0].auth === 'Token good-key', 'her voice, the room’s key');
      eq(toA.filter(p => p.subarray(0, 36).toString() === CLAUDIA_LINE_ID).length, 0, 'the host never hears a guest’s private line');
      const mine = toB.filter(p => p.subarray(0, 36).toString() === CLAUDIA_LINE_ID);
      eq(mine.length, 4 * 2 + 2 * 2, 'every frame of both lines arrives');
      eq(mine[0][36], 4, 'and the slow first line plays before the quick second one');
      eq(mine[mine.length - 1][36], 2);
    });

    await atest('a hushed line stops at once, and a line nobody can read says so', async () => {
      const doneB = [];
      B.Party.on('claudia', (m) => doneB.push(m));
      B.Party.claudia({ op: 'say', text: 'One two three four five six seven eight nine ten eleven twelve.', line: 'long' });
      await delay(60);
      B.Party.claudia({ op: 'hush' });
      await until(() => doneB.some(m => m.line === 'long'));
      const room = app.rooms.get(A.Party.code);
      const r = app.ai.rooms.get(room.code).readers.get(B.Party.selfId());
      eq(r.queue.length, 0, 'nothing left queued');
      const C = client();
      const code = A.Party.code;
      await C.Party.join(code, { name: 'Cal' }).catch(() => {});
      const doneC = [];
      C.Party.on('claudia', (m) => doneC.push(m));
      app.ai.rooms.get(room.code).key = null;
      C.Party.claudia({ op: 'say', text: 'Hello.', line: 'x' });
      await until(() => doneC.length === 1);
      eq(doneC[0].op, 'error', 'no key is an error the browser can fall back on');
      app.ai.rooms.get(room.code).key = 'good-key';
      C.Party.leave();
    });

    await atest('a tool call reaches the host, and the answer reaches the agent', async () => {
      A.Party.ai({ op: 'ask', id: BOT, text: 'Time to vote.' });
      await until(() => fromHost.some(m => m.op === 'tool'));
      const call = fromHost.find(m => m.op === 'tool').calls[0];
      eq([call.name, JSON.parse(call.arguments).name], ['vote_banish', 'Bo']);
      A.Party.ai({ op: 'tool', id: BOT, callId: call.callId, name: call.name, content: '{"ok":true}' });
      await until(() => dg.seen.toolResults.length === 1);
      eq(dg.seen.toolResults[0].id, 'call-1', 'answered to the call it came from');
    });

    await atest('each person is transcribed separately, and the host is told who said it', async () => {
      A.Party.ai({ op: 'listen', humans: [{ id: B.Party.selfId(), name: 'Bo' }, { id: 'not-in-room', name: 'X' }] });
      await until(() => dg.seen.ears.length === 1);
      ok(/keyterm=Bo/.test(dg.seen.ears[0].url) && /keyterm=Morag/.test(dg.seen.ears[0].url), 'names are key terms');
      for (let i = 0; i < 3; i++) B.Party.room.sendAudio(new Int16Array(480).fill(1000).buffer);
      await until(() => fromHost.some(m => m.op === 'heard'));
      const h = fromHost.find(m => m.op === 'heard');
      eq([h.id, h.text], [B.Party.selfId(), 'I think Morag is lying'], 'labelled with the speaker');
    });

    await atest('a short name finalizes after capture stops, and transcription padding ends when idle', async () => {
      const heard = [];
      A.Party.room.onAudio = p => heard.push(Buffer.from(p));
      B.Party.room.sendAudio(new Int16Array(480).fill(1000).buffer);
      await until(() => fromHost.some(m => m.op === 'heard' && m.text === 'Morag!'));
      const h = fromHost.find(m => m.op === 'heard' && m.text === 'Morag!');
      eq(h.id, B.Party.selfId(), 'the final name reaches the director without another spoken word');
      eq(heard.length, 1, 'recogniser silence is never relayed to players');
      await delay(1600);
      const frames = dg.seen.audioIn;
      await delay(100);
      eq(dg.seen.audioIn, frames, 'padding is bounded, not an endless silent stream');
    });

    await atest('the socket cap holds, and is said', async () => {
      // one voice and one ear so far; Claudia makes three, one more makes the cap of four
      A.Party.ai({ op: 'spawn', id: CLAUDIA_ID, name: 'Claudia', voice: 'aura-2-pandora-en', prompt: 'Host.' });
      await until(() => fromHost.some(m => m.op === 'ready' && m.id === CLAUDIA_ID));
      const fourth = '88888888-2222-4333-8444-555555555555';
      A.Party.ai({ op: 'spawn', id: fourth, name: 'Fourth' });
      await until(() => fromHost.some(m => m.op === 'ready' && m.id === fourth));
      const extra = '99999999-2222-4333-8444-555555555555';
      A.Party.ai({ op: 'spawn', id: extra, name: 'Too many' });
      await until(() => fromHost.some(m => m.op === 'error' && m.id === extra));
      ok(/Too many/.test(fromHost.find(m => m.op === 'error' && m.id === extra).message), 'refused in words');
    });

    await atest('everything closes when the host ends it, so nothing bills', async () => {
      const before = dg.seen.closed;
      A.Party.ai({ op: 'end' });
      await until(() => dg.seen.closed >= before + 2);
      eq(app.ai.rooms.size, 0, 'the room’s AI state is gone');
    });

    await atest('the key goes with the room; and the host simply leaving ends it too', async () => {
      A.Party.ai({ op: 'spawn', id: BOT, name: 'Morag', prompt: 'x' });
      await until(() => fromHost.some(m => m.op === 'error' && /key/i.test(m.message)));
      ok(true, 'an ended room forgot its key');
      A.Party.ai({ op: 'configure', key: 'good-key' });
      await until(() => fromHost.filter(m => m.op === 'status' && m.ok === true).length >= 2);
      A.Party.ai({ op: 'spawn', id: BOT, name: 'Morag', prompt: 'x' });
      await until(() => fromHost.filter(m => m.op === 'ready' && m.id === BOT).length >= 2);
      const before = dg.seen.closed;
      A.Party.leave();
      await until(() => dg.seen.closed >= before + 1);
      eq(app.ai.rooms.size, 0);
    });
  } finally {
    clients.forEach(c => { try { c.Party.leave(); } catch (e) {} });
    await app.close();
    dg.wss.clients.forEach(ws => ws.terminate());
    await new Promise(r => dg.wss.close(r));
    await new Promise(r => dg.server.close(r));
  }
  report();
})();
