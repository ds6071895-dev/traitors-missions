/* ------------------------------------------------------------------
   voice-worker.test.js — the voice worker, with everything round it faked.

   No browser: the worker script runs in a vm with a fake `self`, a fake
   WebSocket, fake message ports and, when a test wants Opus, a fake
   WebCodecs that "encodes" by copying. What is checked is the worker's
   own job: it joins the voice socket as this member, tags what it sends
   (codec, sequence, first-of-a-talkspurt), sends Opus only when the room
   says so, hands each voice to the port the page gave it for that voice,
   and when its socket is down passes the microphone to the page to send
   the old way.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness');
const { atest, eq, ok, report } = H;

const tick = () => new Promise(r => setTimeout(r, 5));

function worker({ opus = false } = {}) {
  const outbox = [], sockets = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.sent = []; this.readyState = 0; this.bufferedAmount = 0; sockets.push(this); }
    send(d) { this.sent.push(d); }
    close() { this.readyState = 3; if (this.onclose) this.onclose(); }
    open() { this.readyState = 1; this.onopen(); }
    server(msg) { this.onmessage({ data: typeof msg === 'string' || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg) }); }
  }
  const ctx = {
    console, Math, JSON, Date, Promise, Map, Set, Object, Array, String, Number, Uint8Array, Int16Array, Float32Array,
    ArrayBuffer, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, WebSocket: FakeSocket,
  };
  if (opus) {
    ctx.AudioEncoder = class {
      static async isConfigSupported(c) { return { supported: c.sampleRate === 24000 } ; }
      constructor(init) { this.init = init; this.state = 'unconfigured'; }
      configure(c) { this.config = c; this.state = 'configured'; }
      encode(data) {
        // "encode" to four bytes: the first two samples
        const bytes = new Uint8Array(new Int16Array(data.data.slice(0, 2)).buffer);
        queueMicrotask(() => this.init.output({ timestamp: data.timestamp, byteLength: 4, copyTo: (b) => b.set(bytes) }));
      }
      close() { this.state = 'closed'; }
    };
    ctx.AudioDecoder = class {
      static async isConfigSupported(c) { return { supported: c.sampleRate === 48000 }; }
      constructor(init) { this.init = init; this.state = 'unconfigured'; }
      configure(c) { this.config = c; this.state = 'configured'; }
      decode(chunk) {
        // "decode" to 20 ms at 48 kHz, every sample the packet's first byte
        const v = new Uint8Array(chunk.data)[0] / 100;
        queueMicrotask(() => this.init.output({ timestamp: chunk.timestamp, numberOfFrames: 960, sampleRate: 48000,
          copyTo: (dest) => dest.fill(v), close() {} }));
      }
      close() { this.state = 'closed'; }
    };
    ctx.AudioData = class { constructor(init) { Object.assign(this, init); } close() {} };
    ctx.EncodedAudioChunk = class { constructor(init) { Object.assign(this, init); } };
  }
  ctx.self = { postMessage: (m) => outbox.push(m), close() {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(H.ROOT, 'js/core/voice-worker.js'), 'utf8'), ctx);
  const port = () => ({ got: [], postMessage(m) { this.got.push(m); }, close() {}, onmessage: null });
  return { ctx, outbox, sockets, port, send: (m) => ctx.self.onmessage({ data: m }) };
}

function framed(id, head, seq, payload) {
  const out = new Uint8Array(39 + payload.length);
  for (let i = 0; i < 36; i++) out[i] = (id.padEnd(36).charCodeAt(i));
  out[36] = head; out[37] = seq & 0xff; out[38] = seq >> 8;
  out.set(payload, 39);
  return out.buffer;
}

const BO = '22222222-2222-4222-8222-222222222222';

(async () => {
  await atest('it joins the voice socket as this member, and says what it can decode', async () => {
    const w = worker();
    w.send({ op: 'open', url: 'wss://x/rooms?voice=1', token: 'tok' });
    await tick();
    eq(w.outbox.find(m => m.op === 'caps').opus, false, 'no WebCodecs here: PCM only');
    const s = w.sockets[0];
    eq(s.url, 'wss://x/rooms?voice=1');
    s.open();
    eq(JSON.parse(s.sent[0]), { type: 'voice', token: 'tok', opus: false });
    w.send({ op: 'close' });
  });

  await atest('the microphone goes out tagged: PCM, a sequence, and the first of a talkspurt marked', async () => {
    const w = worker();
    w.send({ op: 'open', url: 'u', token: 't' });
    await tick();
    const s = w.sockets[0]; s.open(); s.server({ type: 'voiced', codec: 'pcm' });
    const mic = w.port();
    w.send({ op: 'capture', port: mic });
    const pcm = (v) => new Int16Array(480).fill(v).buffer;
    mic.onmessage({ data: { pcm: pcm(5), start: true } });
    mic.onmessage({ data: { pcm: pcm(6), start: false } });
    const sent = s.sent.slice(1).map(b => new Uint8Array(b));
    eq(sent.map(b => [b[0], b[1] | (b[2] << 8), b.length]), [[0x80, 1, 963], [0x00, 2, 963]]);
    eq(new Int16Array(sent[1].slice(3).buffer)[0], 6, 'the samples as they were');
    w.send({ op: 'close' });
  });

  await atest('a voice from the room is handed to the port the page gave for it', async () => {
    const w = worker();
    w.send({ op: 'open', url: 'u', token: 't' });
    await tick();
    const s = w.sockets[0]; s.open(); s.server({ type: 'voiced', codec: 'pcm' });
    const pcm = new Int16Array(480).fill(16384);
    s.server(framed(BO, 0x80, 40, new Uint8Array(pcm.buffer)));
    s.server(framed(BO, 0x00, 41, new Uint8Array(pcm.buffer)));
    eq(w.outbox.filter(m => m.op === 'peer').map(m => m.id), [BO], 'it asks the page for a way to play Bo, once');
    const out = w.port();
    w.send({ op: 'port', id: BO, port: out });
    eq(out.got.map(m => [m.seq, m.start, m.pcm.length, m.pcm[0]]), [[40, true, 480, 0.5], [41, false, 480, 0.5]],
      'the frames that came while it waited, in order, as samples');
    w.send({ op: 'close' });
  });

  await atest('a voice the page refuses is dropped', async () => {
    const w = worker();
    w.send({ op: 'open', url: 'u', token: 't' });
    await tick();
    const s = w.sockets[0]; s.open(); s.server({ type: 'voiced', codec: 'pcm' });
    s.server(framed('stranger', 0, 1, new Uint8Array(960)));
    w.send({ op: 'deny', id: 'stranger' });
    s.server(framed('stranger', 0, 2, new Uint8Array(960)));
    const out = w.port();
    w.send({ op: 'port', id: 'stranger', port: out });
    eq(out.got.length, 0, 'nothing held for it');
    w.send({ op: 'close' });
  });

  await atest('with the socket down, the microphone goes to the page and the old PCM comes back through it', async () => {
    const w = worker();
    w.send({ op: 'open', url: 'u', token: 't' });
    await tick();
    const mic = w.port();
    w.send({ op: 'capture', port: mic });
    mic.onmessage({ data: { pcm: new Int16Array(480).buffer, start: true } });
    eq(w.outbox.filter(m => m.op === 'send').length, 1, 'handed to the page to send on the game socket');
    const legacy = new Uint8Array(996);
    for (let i = 0; i < 36; i++) legacy[i] = BO.charCodeAt(i);
    new Int16Array(legacy.buffer, 36).fill(-16384);
    w.send({ op: 'legacy', packet: legacy.buffer });
    const out = w.port();
    w.send({ op: 'port', id: BO, port: out });
    eq(out.got.map(m => [m.seq, m.start, m.pcm[0]]), [[null, null, -0.5]], 'played, with nothing known about its timing');
    w.send({ op: 'close' });
  });

  await atest('Opus only when the room says so, and decoded back to 24 kHz samples', async () => {
    const w = worker({ opus: true });
    w.send({ op: 'open', url: 'u', token: 't' });
    await tick();
    eq(w.outbox.find(m => m.op === 'caps').opus, true);
    const s = w.sockets[0]; s.open();
    eq(JSON.parse(s.sent[0]).opus, true, 'it tells the server it can');
    s.server({ type: 'voiced', codec: 'pcm' });
    const mic = w.port();
    w.send({ op: 'capture', port: mic });
    mic.onmessage({ data: { pcm: new Int16Array(480).fill(3).buffer, start: true } });
    await tick();
    eq(new Uint8Array(s.sent[1])[0] & 0x7f, 0, 'PCM while the room is PCM');
    s.server({ type: 'codec', codec: 'opus' });
    mic.onmessage({ data: { pcm: new Int16Array(480).fill(9).buffer, start: false } });
    mic.onmessage({ data: { pcm: new Int16Array(480).fill(8).buffer, start: true } });
    await tick();
    const opusSent = s.sent.slice(2).map(b => new Uint8Array(b));
    eq(opusSent.map(b => [b[0], b[1] | (b[2] << 8), b.length]), [[0x01, 2, 7], [0x81, 3, 7]],
      'Opus, its own sequence and talkspurt marks carried through the encoder');
    eq(new Int16Array(opusSent[0].slice(3).buffer)[0], 9);
    s.server(framed(BO, 0x81, 5, new Uint8Array([50, 0, 0, 0])));
    const out = w.port();
    w.send({ op: 'port', id: BO, port: out });
    await tick();
    eq(out.got.map(m => [m.seq, m.start, m.pcm.length, Math.round(m.pcm[0] * 100)]), [[5, true, 480, 50]],
      'decoded at 48 kHz and brought down to the 24 kHz the worklet plays');
    w.send({ op: 'close' });
  });

  report();
})().catch(e => { console.error(e); process.exitCode = 1; });
