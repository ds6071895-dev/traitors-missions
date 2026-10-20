/* ------------------------------------------------------------------
   voice-worker.js — the room's voices, off the main thread.

   The castle is a heavy page. When a frame takes 150 ms to draw, the
   main thread is not there to read a socket or hand audio to a worklet,
   and in the old wiring that was a gap in somebody's voice. So voice has
   its own socket, opened here in a worker, and its own ports straight
   into the capture and playback worklets: from microphone to wire to
   speaker, nothing waits on a render.

   It also speaks Opus when the whole room can. Raw PCM is 48 KB/s a
   voice, which is seven voices into a phone on hotel wifi at 2.7 Mbit/s
   and every frame of it queued in TCP; Opus is about 3 KB/s. The room
   server decides which, from what every browser said it can decode, and
   tells everybody (`codec`); a frame says what it is, so a switch mid-
   sentence is only ever a switch.

   Wire, both ways: [codec: 0 PCM, 1 Opus; | 0x80 first of a talkspurt]
   [seq, u16 LE][payload], with the speaker's 36-byte id in front of it
   on the way in.

   When the voice socket is down the worker does not go quiet: captured
   frames go to the main thread to send the old way on the game socket,
   and the server sends this browser PCM that way too, which the main
   thread hands back here.
------------------------------------------------------------------ */
const RATE = 24000;
const FRAME = 480;
const PENDING_MAX = 25;            // frames held for a voice still waiting for its speaker
const ASK_AGAIN_MS = 3000;

let url = null, token = null, ws = null, closed = false;
let codec = 'pcm';                 // what the room last asked us to send
let canOpus = false;
let encoder = null, encRate = RATE, encConfig = null, decRate = RATE;
let ts = 0, seq = 0;
const sentMeta = new Map();        // encoder timestamp -> { seq, start }
const peers = new Map();           // id -> { port, decoder, pending, asked, denied, meta, lastSeq }
let retry = 0, retryTimer = null, pingTimer = null, statsTimer = null;
const stats = { rtt: 0, jitter: 0, codec: 'pcm', connected: false, sent: 0, received: 0, skipped: 0,
                inBps: 0, outBps: 0, reconnects: 0 };
let bytesIn = 0, bytesOut = 0, bytesAt = Date.now();

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

/* ---------------- what this browser can do ---------------- */

async function supported(Kind, config) {
  try { return !!(Kind && (await Kind.isConfigSupported(config)).supported); } catch (e) { return false; }
}

async function probe() {
  if (typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined') return false;
  for (const sampleRate of [RATE, 48000]) {
    const base = { codec: 'opus', sampleRate, numberOfChannels: 1, bitrate: 24000 };
    for (const config of [Object.assign({ opus: { frameDuration: 20000, complexity: 5 } }, base), base]) {
      if (await supported(AudioEncoder, config)) { encConfig = config; encRate = sampleRate; break; }
    }
    if (encConfig) break;
  }
  for (const sampleRate of [RATE, 48000]) {
    if (await supported(AudioDecoder, { codec: 'opus', sampleRate, numberOfChannels: 1 })) { decRate = sampleRate; return !!encConfig; }
  }
  return false;
}

/* ---------------- the socket ---------------- */

function connect() {
  if (closed || !url || !token) return;
  clearTimeout(retryTimer);
  let socket;
  try { socket = new WebSocket(url); } catch (e) { schedule(); return; }
  socket.binaryType = 'arraybuffer';
  ws = socket;
  socket.onopen = () => {
    if (ws !== socket) return;
    socket.send(JSON.stringify({ type: 'voice', token, opus: canOpus }));
  };
  socket.onmessage = (event) => {
    if (ws !== socket) return;
    count(1, typeof event.data === 'string' ? event.data.length : event.data.byteLength);
    if (typeof event.data !== 'string') { incoming(event.data); return; }
    let msg; try { msg = JSON.parse(event.data); } catch (e) { return; }
    if (msg.type === 'voiced') {
      retry = 0;
      stats.connected = true;
      setCodec(msg.codec);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      }, 2000);
      post({ op: 'status', connected: true });
    } else if (msg.type === 'codec') setCodec(msg.codec);
    else if (msg.type === 'pong') sampleRtt(msg.t);
    // the seat is gone: knocking again will not bring it back
    else if (msg.type === 'error') { closed = true; post({ op: 'status', connected: false, error: msg.message }); }
  };
  socket.onerror = () => {};
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    clearInterval(pingTimer);
    if (stats.connected) { stats.connected = false; stats.reconnects++; post({ op: 'status', connected: false }); }
    schedule();
  };
}

function schedule() {
  if (closed) return;
  retry++;
  retryTimer = setTimeout(connect, Math.min(5000, 300 * Math.pow(2, Math.min(retry, 5))));
}

const open = () => ws && ws.readyState === 1 && stats.connected;

function setCodec(next) {
  codec = next === 'opus' && canOpus ? 'opus' : 'pcm';
  stats.codec = codec;
  if (codec === 'opus' && !encoder) makeEncoder();
}

function count(dir, n) {
  const now = Date.now();
  if (now - bytesAt >= 1000) {
    const secs = (now - bytesAt) / 1000;
    stats.inBps = Math.round(bytesIn / secs); stats.outBps = Math.round(bytesOut / secs);
    bytesIn = bytesOut = 0; bytesAt = now;
  }
  if (dir) bytesIn += n; else bytesOut += n;
}

function sampleRtt(t) {
  if (!Number.isFinite(t)) return;
  const rtt = Math.max(0, Date.now() - t);
  if (!stats.rtt) { stats.rtt = rtt; return; }
  stats.jitter += (Math.abs(rtt - stats.rtt) - stats.jitter) / 8;
  stats.rtt += (rtt - stats.rtt) / 8;
}

/* ---------------- our own voice, out ---------------- */

function makeEncoder() {
  try {
    encoder = new AudioEncoder({
      output: (chunk) => {
        const meta = sentMeta.get(chunk.timestamp) || { seq: (seq = (seq + 1) & 0xffff), start: false };
        sentMeta.delete(chunk.timestamp);
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        transmit(1, meta.seq, meta.start, bytes);
      },
      error: () => { encoder = null; },
    });
    encoder.configure(encConfig);
  } catch (e) { encoder = null; }
}

function transmit(kind, n, start, payload) {
  if (!open()) return;
  if (ws.bufferedAmount > 16 * 1024) { stats.skipped++; return; }
  const out = new Uint8Array(3 + payload.byteLength);
  out[0] = kind | (start ? 0x80 : 0);
  out[1] = n & 0xff; out[2] = (n >> 8) & 0xff;
  out.set(payload instanceof Uint8Array ? payload : new Uint8Array(payload), 3);
  ws.send(out.buffer);
  stats.sent++;
  count(0, out.byteLength);
}

function captured(data) {
  if (!data || !(data.pcm instanceof ArrayBuffer) || data.pcm.byteLength !== FRAME * 2) return;
  if (!open()) { post({ op: 'send', pcm: data.pcm }, [data.pcm]); return; }
  seq = (seq + 1) & 0xffff;
  if (codec === 'opus' && encoder && encoder.state === 'configured') {
    const pcm = new Int16Array(data.pcm);
    const input = encRate === RATE ? pcm : upsample(pcm, encRate / RATE);
    ts += 20000;
    sentMeta.set(ts, { seq, start: !!data.start });
    if (sentMeta.size > 50) sentMeta.delete(sentMeta.keys().next().value);
    try {
      const frame = new AudioData({ format: 's16', sampleRate: encRate, numberOfFrames: input.length,
                                    numberOfChannels: 1, timestamp: ts, data: input });
      encoder.encode(frame);
      frame.close();
      return;
    } catch (e) { sentMeta.delete(ts); }
  }
  transmit(0, seq, !!data.start, new Uint8Array(data.pcm));
}

/* ---------------- everybody else's, in ---------------- */

function incoming(buffer) {
  if (buffer.byteLength < 40) return;
  const bytes = new Uint8Array(buffer);
  const id = String.fromCharCode.apply(null, bytes.subarray(0, 36)).trim();
  const head = bytes[36];
  const n = bytes[37] | (bytes[38] << 8);
  frame(id, head & 0x7f, n, !!(head & 0x80), buffer.slice(39));
}

function peerOf(id) {
  let p = peers.get(id);
  if (!p) {
    p = { port: null, decoder: null, pending: [], asked: 0, denied: false, meta: new Map() };
    peers.set(id, p);
  }
  if (!p.port && Date.now() - p.asked > ASK_AGAIN_MS) { p.asked = Date.now(); post({ op: 'peer', id }); }
  return p;
}

function frame(id, kind, n, start, payload) {
  stats.received++;
  const p = peerOf(id);
  if (p.denied && Date.now() - p.asked < ASK_AGAIN_MS) return;
  if (kind === 0) {
    if (payload.byteLength !== FRAME * 2) return;
    deliver(p, { seq: n, start, pcm: int16ToFloat(new Int16Array(payload)) });
  } else if (kind === 1) decode(p, n, start, payload);
}

function decode(p, n, start, payload) {
  if (!p.decoder || p.decoder.state === 'closed') {
    try {
      p.decoder = new AudioDecoder({
        output: (data) => {
          const meta = p.meta.get(data.timestamp) || { seq: null, start: null };
          p.meta.delete(data.timestamp);
          let pcm = new Float32Array(data.numberOfFrames);
          try { data.copyTo(pcm, { planeIndex: 0, format: 'f32-planar' }); } catch (e) { data.close(); return; }
          const rate = data.sampleRate;
          data.close();
          if (rate !== RATE) pcm = resample(pcm, rate);
          deliver(p, { seq: meta.seq, start: meta.start, pcm });
        },
        error: () => { p.decoder = null; },
      });
      p.decoder.configure({ codec: 'opus', sampleRate: decRate, numberOfChannels: 1 });
    } catch (e) { p.decoder = null; return; }
  }
  // timestamps only have to be unique and rising; the seq is what is real
  p.ts = (p.ts || 0) + 20000;
  p.meta.set(p.ts, { seq: n, start });
  if (p.meta.size > 50) p.meta.delete(p.meta.keys().next().value);
  try { p.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: p.ts, data: payload })); }
  catch (e) { p.meta.delete(p.ts); }
}

function deliver(p, msg) {
  if (!p.port) {
    p.pending.push(msg);
    if (p.pending.length > PENDING_MAX) p.pending.shift();
    return;
  }
  p.port.postMessage(msg, [msg.pcm.buffer]);
}

function int16ToFloat(pcm) {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}

function upsample(pcm, k) {
  const out = new Int16Array(Math.round(pcm.length * k));
  for (let i = 0; i < out.length; i++) {
    const at = i / k, j = Math.floor(at), f = at - j;
    const a = pcm[j], b = pcm[Math.min(pcm.length - 1, j + 1)];
    out[i] = Math.round(a + (b - a) * f);
  }
  return out;
}

function resample(pcm, from) {
  const k = RATE / from, out = new Float32Array(Math.round(pcm.length * k));
  if (from === RATE * 2) {
    for (let i = 0; i < out.length; i++) out[i] = (pcm[2 * i] + (pcm[2 * i + 1] || 0)) / 2;
    return out;
  }
  for (let i = 0; i < out.length; i++) {
    const at = i / k, j = Math.floor(at), f = at - j;
    const a = pcm[j] || 0, b = pcm[Math.min(pcm.length - 1, j + 1)] || 0;
    out[i] = a + (b - a) * f;
  }
  return out;
}

function forget(id) {
  const p = peers.get(id);
  if (!p) return;
  try { if (p.decoder && p.decoder.state !== 'closed') p.decoder.close(); } catch (e) {}
  try { if (p.port) p.port.close(); } catch (e) {}
  peers.delete(id);
}

/* ---------------- the main thread ---------------- */

self.onmessage = async (event) => {
  const m = event.data || {};
  if (m.op === 'open') {
    url = m.url; token = m.token; closed = false;
    canOpus = await probe();
    post({ op: 'caps', opus: canOpus });
    connect();
    clearInterval(statsTimer);
    statsTimer = setInterval(() => post({ op: 'stats', stats }), 1000);
  } else if (m.op === 'capture' && m.port) {
    m.port.onmessage = (e) => captured(e.data);
  } else if (m.op === 'port' && m.port) {
    const p = peers.get(m.id) || peerOf(m.id);
    p.port = m.port; p.denied = false;
    for (const msg of p.pending.splice(0)) p.port.postMessage(msg, [msg.pcm.buffer]);
  } else if (m.op === 'deny') {
    const p = peers.get(m.id);
    if (p) { p.denied = true; p.pending.length = 0; }
  } else if (m.op === 'detach') forget(m.id);
  else if (m.op === 'legacy' && m.packet) {
    // PCM that came the old way, on the game socket, while ours was down
    const bytes = new Uint8Array(m.packet);
    if (bytes.length !== 36 + FRAME * 2) return;
    const id = String.fromCharCode.apply(null, bytes.subarray(0, 36)).trim();
    const p = peerOf(id);
    if (p.denied && Date.now() - p.asked < ASK_AGAIN_MS) return;
    deliver(p, { seq: null, start: null, pcm: int16ToFloat(new Int16Array(m.packet, 36)) });
  } else if (m.op === 'close') {
    closed = true;
    clearTimeout(retryTimer); clearInterval(pingTimer); clearInterval(statsTimer);
    if (ws) { try { ws.close(1000); } catch (e) {} ws = null; }
    for (const id of [...peers.keys()]) forget(id);
    try { if (encoder && encoder.state !== 'closed') encoder.close(); } catch (e) {}
    encoder = null;
    self.close();
  }
};
