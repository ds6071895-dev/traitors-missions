/* ------------------------------------------------------------------
   voice-socket.test.js — the second socket, the one that is only voice.

   Real room server, raw WebSocket clients speaking its protocol: join on
   the game socket, then prove who you are on `/rooms?voice=1` with the
   token you were given. Checks the room only speaks Opus while everybody
   in it can take Opus, that a frame goes where the host's routes say and
   nowhere else, that somebody without a voice socket still hears PCM the
   old way, and that a voice socket that falls behind skips frames instead
   of being thrown out of the room.
------------------------------------------------------------------ */
const { WebSocket } = require('ws');
const { createServer } = require('../server');
const H = require('./harness');
const { atest, eq, ok, report } = H;

const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('Timed out'); await delay(5); }
}

function socket(url) {
  const ws = new WebSocket(url);
  ws.texts = []; ws.binaries = [];
  ws.on('message', (data, binary) => {
    if (binary) ws.binaries.push(Buffer.from(data));
    else ws.texts.push(JSON.parse(data.toString()));
  });
  return new Promise((resolve, reject) => { ws.once('open', () => resolve(ws)); ws.once('error', reject); });
}

function frame(head, seq, payload) {
  const out = Buffer.alloc(3 + payload.length);
  out[0] = head; out.writeUInt16LE(seq, 1); payload.copy(out, 3);
  return out;
}

(async () => {
  const app = createServer({ reconnectMs: 1200 });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = 'ws://127.0.0.1:' + app.server.address().port + '/rooms';
  const open = [];

  async function member(opts) {
    const ws = await socket(base); open.push(ws);
    ws.send(JSON.stringify(Object.assign({ type: 'join', profile: { name: opts.name } }, opts.host ? { host: true } : { code: opts.code })));
    await until(() => ws.texts.some(m => m.type === 'welcome'));
    const w = ws.texts.find(m => m.type === 'welcome');
    return { ws, id: w.id, token: w.token, code: w.code };
  }
  async function voice(m, opus = true) {
    const v = await socket(base + '?voice=1'); open.push(v);
    v.send(JSON.stringify({ type: 'voice', token: m.token, opus }));
    await until(() => v.texts.some(x => x.type === 'voiced'));
    m.voice = v;
    return v;
  }
  const codecOf = (v) => { const c = v.texts.filter(x => x.type === 'codec' || x.type === 'voiced'); return c.length ? c[c.length - 1].codec : null; };

  try {
    let A, B, C, D, room;
    await atest('a voice socket is bound by the session token, and a bad token is refused', async () => {
      A = await member({ host: true, name: 'Ana' });
      B = await member({ code: A.code, name: 'Bo' });
      C = await member({ code: A.code, name: 'Cy' });
      room = app.rooms.get(A.code);
      await voice(A); await voice(B);
      eq(room.members.get(A.id).voiceWs !== null, true, 'bound');
      const bad = await socket(base + '?voice=1'); open.push(bad);
      bad.send(JSON.stringify({ type: 'voice', token: 'nope' }));
      await until(() => bad.readyState === WebSocket.CLOSED);
      ok(bad.texts.some(m => m.type === 'error'), 'told why');
    });

    await atest('the room speaks Opus only once everybody in it can', async () => {
      eq(room.voiceCodec, 'pcm', 'Cy has no voice socket yet');
      await voice(C);
      await until(() => room.voiceCodec === 'opus');
      await until(() => [A, B, C].every(m => codecOf(m.voice) === 'opus'));
      ok(true, 'and every voice socket was told');
    });

    await atest('an Opus frame reaches the others, tagged, and only by their voice sockets', async () => {
      const payload = Buffer.from(Array.from({ length: 60 }, (_, i) => i + 1));
      A.voice.send(frame(0x81, 7, payload));
      await until(() => B.voice.binaries.length && C.voice.binaries.length);
      const got = B.voice.binaries[0];
      eq(got.subarray(0, 36).toString().trim(), A.id, 'from Ana');
      eq(got[36], 0x81, 'Opus, first of a talkspurt');
      eq(got.readUInt16LE(37), 7, 'her own sequence number');
      ok(got.subarray(39).equals(payload), 'the payload untouched');
      await delay(30);
      eq(A.voice.binaries.length, 0, 'not echoed to herself');
      eq(B.ws.binaries.length + C.ws.binaries.length, 0, 'and nothing on the game sockets');
    });

    await atest('the host’s routes hold on the voice socket: the turret hears only itself', async () => {
      room.routes = { open: [A.id, B.id, C.id], night: [A.id, C.id], rooms: null };
      const b0 = B.voice.binaries.length, c0 = C.voice.binaries.length;
      A.voice.send(frame(0x01, 8, Buffer.alloc(40, 9)));
      await until(() => C.voice.binaries.length > c0);
      await delay(30);
      eq(B.voice.binaries.length, b0, 'the Faithful in bed hears nothing');
      room.routes = null;
    });

    await atest('somebody without a voice socket makes it PCM, and hears PCM the old way', async () => {
      D = await member({ code: A.code, name: 'Di' });
      await until(() => room.voiceCodec === 'pcm');
      await until(() => codecOf(A.voice) === 'pcm');
      A.voice.send(frame(0x01, 9, Buffer.alloc(40, 5)));         // a late Opus frame from before the switch
      const pcm = Buffer.alloc(960); pcm.writeInt16LE(1234, 0);
      A.voice.send(frame(0x00, 10, pcm));
      await until(() => D.ws.binaries.length >= 1);
      await delay(30);
      eq(D.ws.binaries.length, 1, 'Opus is never sent to a page that cannot play it');
      eq(D.ws.binaries[0].length, 996, 'the old packet: id and PCM');
      eq(D.ws.binaries[0].readInt16LE(36), 1234);
      const last = B.voice.binaries[B.voice.binaries.length - 1];
      eq([last[36], last.readUInt16LE(37), last.length], [0, 10, 999], 'the voice socket gets it tagged');
    });

    await atest('an old bare frame on the game socket still goes everywhere it should', async () => {
      const b0 = B.voice.binaries.length;
      const pcm = Buffer.alloc(960); pcm.writeInt16LE(-77, 0);
      D.ws.send(pcm);
      await until(() => B.voice.binaries.length > b0);
      const got = B.voice.binaries[B.voice.binaries.length - 1];
      eq(got.subarray(0, 36).toString().trim(), D.id);
      eq(got.readInt16LE(39), -77);
    });

    await atest('a congested voice socket skips frames and stays in the room', async () => {
      const server = room.members.get(B.id).voiceWs;
      const b0 = B.voice.binaries.length;
      Object.defineProperty(server, 'bufferedAmount', { configurable: true, value: 64 * 1024 });
      try {
        for (let i = 0; i < 20; i++) A.voice.send(frame(0x00, 20 + i, Buffer.alloc(960)));
        await until(() => C.voice.binaries.length >= 10);
        await delay(40);
        eq(B.voice.binaries.length, b0, 'nothing queued behind the backlog');
        eq(server.readyState, WebSocket.OPEN, 'and never terminated for it');
        eq(B.ws.readyState, WebSocket.OPEN, 'nor its game socket');
      } finally { delete server.bufferedAmount; }
    });

    await atest('a malformed frame is dropped, not relayed', async () => {
      const c0 = C.voice.binaries.length;
      A.voice.send(frame(0x00, 1, Buffer.alloc(100)));          // PCM that is not 20 ms
      A.voice.send(frame(0x01, 2, Buffer.alloc(900)));          // Opus far too big
      A.voice.send(frame(0x05, 3, Buffer.alloc(10)));           // no such codec
      await delay(60);
      eq(C.voice.binaries.length, c0);
    });

    await atest('when a voice socket drops, its owner hears PCM on the game socket meanwhile', async () => {
      D.ws.close();                                   // gone for good once the seat is not reclaimed
      await until(() => !room.members.has(D.id), 4000);
      await until(() => room.voiceCodec === 'opus');
      B.voice.close();
      await until(() => room.members.get(B.id).voiceWs === null);
      eq(room.voiceCodec, 'pcm', 'back to PCM while Bo is between sockets');
      const b0 = B.ws.binaries.length;
      A.voice.send(frame(0x00, 50, Buffer.alloc(960, 3)));
      await until(() => B.ws.binaries.length > b0);
      eq(B.ws.binaries[B.ws.binaries.length - 1].length, 996);
      await voice(B);
      await until(() => room.voiceCodec === 'opus');
    });

    await atest('both sockets echo a ping’s clock, so the page can time the round trip', async () => {
      A.ws.send(JSON.stringify({ type: 'ping', t: 12345 }));
      A.voice.send(JSON.stringify({ type: 'ping', t: 678 }));
      await until(() => A.ws.texts.some(m => m.type === 'pong' && m.t === 12345)
        && A.voice.texts.some(m => m.type === 'pong' && m.t === 678));
    });

    await atest('leaving closes the voice socket too', async () => {
      C.ws.send(JSON.stringify({ type: 'leave' }));
      await until(() => C.voice.readyState === WebSocket.CLOSED);
    });
  } finally {
    open.forEach(ws => { try { ws.terminate(); } catch (e) {} });
    await app.close();
  }
  report();
})().catch(e => { console.error(e); process.exitCode = 1; });
