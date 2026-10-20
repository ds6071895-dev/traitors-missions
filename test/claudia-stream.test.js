/* ------------------------------------------------------------------
   claudia-stream.test.js — Claudia without the wait.

   A fake Deepgram that streams its speech the way the real one does, a
   chunk at a time, and the real room server pointed at it. Checks that a
   line everybody asks for at once is read once, that her first frame goes
   out before the reading has finished, that a long line's first sentence
   is fetched on its own, that a prefetched line costs nothing when it is
   asked for, that the server's one clock keeps a voice in time through a
   stalled event loop, and that the Ogg an Opus ear is fed is well formed.
------------------------------------------------------------------ */
const http = require('node:http');
const { WebSocket } = require('ws');
const { createServer } = require('../server');
const { CLAUDIA_LINE_ID, oggCrc, oggOpus } = require('../server/ai-bridge');
const H = require('./harness');
const { atest, test, eq, ok, report } = H;

const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error('Timed out'); await delay(3); }
}

/* 20 ms of speech a word. "SLOW" lines send their first 100 ms at once
   and the rest 400 ms later, like a long line still being read. */
const speaks = [];
const fake = http.createServer((req, res) => {
  if (req.url.startsWith('/v1/projects')) { res.writeHead(200); return res.end('{}'); }
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    const text = JSON.parse(body).text;
    speaks.push({ text, at: Date.now() });
    const words = text.split(' ').length;
    const pcm = Buffer.alloc(words * 960, 7);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    if (/^SLOW/.test(text)) {
      res.write(pcm.subarray(0, 4800));
      setTimeout(() => { res.end(pcm.subarray(4800)); speaks[speaks.length - 1].ended = Date.now(); }, 400);
    } else setTimeout(() => res.end(pcm), 30);
  });
});

(async () => {
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  const dg = 'http://127.0.0.1:' + fake.address().port;
  const app = createServer({ ai: { speakUrl: dg + '/v1/speak', projectsUrl: dg + '/v1/projects' } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const url = 'ws://127.0.0.1:' + app.server.address().port + '/rooms';
  const sockets = [];

  async function member(opts) {
    const ws = new WebSocket(url);
    sockets.push(ws);
    const m = { ws, seq: 0, texts: [], frames: [] };
    ws.on('message', (data, binary) => {
      if (binary) { m.frames.push({ at: Date.now(), data: Buffer.from(data) }); return; }
      const msg = JSON.parse(data.toString());
      m.texts.push(Object.assign({ at: Date.now() }, msg));
    });
    await new Promise(r => ws.once('open', r));
    ws.send(JSON.stringify(Object.assign({ type: 'join', profile: { name: opts.name } }, opts.host ? { host: true } : { code: opts.code })));
    await until(() => m.texts.some(x => x.type === 'welcome'));
    Object.assign(m, (({ id, code }) => ({ id, code }))(m.texts.find(x => x.type === 'welcome')));
    m.send = (msg) => ws.send(JSON.stringify(Object.assign({ seq: ++m.seq }, msg)));
    m.claudia = (line) => m.texts.filter(x => x.type === 'claudia' && x.line === line);
    m.lineFrames = () => m.frames.filter(f => f.data.subarray(0, 36).toString() === CLAUDIA_LINE_ID);
    return m;
  }

  try {
    const A = await member({ host: true, name: 'Ana' });
    const B = await member({ code: A.code, name: 'Bo' });
    const C = await member({ code: A.code, name: 'Cy' });
    A.send({ type: 'ai', op: 'configure', key: 'good-key' });
    await until(() => A.texts.some(x => x.type === 'ai' && x.op === 'status' && x.ok === true));

    await atest('a line the whole room asks for at once is read once', async () => {
      const before = speaks.length;
      for (const m of [A, B, C]) m.send({ type: 'claudia', op: 'say', text: 'Welcome to the castle.', line: 'w' });
      await until(() => [A, B, C].every(m => m.claudia('w').some(x => x.op === 'done')));
      eq(speaks.length - before, 1, 'one fetch for three listeners');
      eq([A, B, C].map(m => m.lineFrames().length), [4, 4, 4], 'and every listener heard all of it');
    });

    await atest('her first frame goes out while the rest is still being read', async () => {
      const text = 'SLOW one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
      const f0 = B.lineFrames().length;
      B.send({ type: 'claudia', op: 'say', text, line: 's' });
      await until(() => B.claudia('s').some(x => x.op === 'done'));
      const fetched = speaks.find(x => x.text === text);
      const first = B.lineFrames()[f0];
      ok(first.at < fetched.ended, 'first frame ' + (fetched.ended - first.at) + 'ms before the reading finished');
      const start = B.claudia('s').find(x => x.op === 'start');
      ok(start && start.at < fetched.ended, 'and "start" said so then');
      eq(B.lineFrames().length - f0, 15, 'none of it lost');
    });

    await atest('a long line fetches its first sentence on its own, and plays the parts in order', async () => {
      const text = 'Welcome. Tonight one of you will be murdered in your bed and nobody will hear a thing.';
      const f0 = C.lineFrames().length;
      C.send({ type: 'claudia', op: 'say', text, line: 'p' });
      await until(() => C.claudia('p').some(x => x.op === 'done'));
      const asked = speaks.slice(-2).map(x => x.text);
      eq(asked, ['Welcome.', 'Tonight one of you will be murdered in your bed and nobody will hear a thing.']);
      const got = C.lineFrames().slice(f0);
      eq(got.length, 1 + 6 + 16, 'first sentence, a breath, the rest');
      ok(got.slice(1, 7).every(f => f.data.subarray(36).every(b => b === 0)), 'the breath is silence');
    });

    await atest('a prefetched line is read before it is asked for, and not read again', async () => {
      const text = 'The Traitors have made their choice.';
      B.send({ type: 'claudia', op: 'prefetch', text });
      await until(() => speaks.some(x => x.text === text));
      await delay(80);
      const before = speaks.length;
      const t0 = Date.now();
      B.send({ type: 'claudia', op: 'say', text, line: 'f' });
      await until(() => B.claudia('f').some(x => x.op === 'start'));
      eq(speaks.length, before, 'no second fetch');
      ok(Date.now() - t0 < 60, 'and it started at once: ' + (Date.now() - t0) + 'ms');
      eq(B.claudia('f').filter(x => x.op === 'done').length, 0, 'prefetch itself never plays or replies');
      await until(() => B.claudia('f').some(x => x.op === 'done'));
    });

    await atest('one clock keeps a second of speech to a second, through a stalled event loop', async () => {
      const text = Array.from({ length: 50 }, (_, i) => 'w' + i).join(' ');
      const f0 = A.lineFrames().length;
      A.send({ type: 'claudia', op: 'say', text, line: 'c' });
      await until(() => A.claudia('c').some(x => x.op === 'start'));
      await delay(300);
      const spin = Date.now() + 150;
      while (Date.now() < spin) { /* a slow frame on the server */ }
      await until(() => A.claudia('c').some(x => x.op === 'done'));
      const start = A.claudia('c').find(x => x.op === 'start').at, done = A.claudia('c').find(x => x.op === 'done').at;
      eq(A.lineFrames().length - f0, 50, 'all fifty frames');
      ok(done - start >= 930 && done - start <= 1090, 'start to done ' + (done - start) + 'ms for 1000ms of speech');
    });
  } finally {
    sockets.forEach(ws => { try { ws.terminate(); } catch (e) {} });
    await app.close();
    await new Promise(r => fake.close(r));
  }

  test('an Opus ear’s Ogg pages are well formed', () => {
    const ogg = oggOpus(0x1234);
    const pages = ogg.headers().concat([ogg.packet(Buffer.from([0xf8, 0xff, 0xfe])), ogg.packet(Buffer.alloc(300, 1))]);
    pages.forEach((page, i) => {
      eq(page.subarray(0, 4).toString(), 'OggS', 'page ' + i + ' magic');
      const stored = page.readUInt32LE(22);
      const blank = Buffer.from(page); blank.writeUInt32LE(0, 22);
      eq(oggCrc(blank), stored, 'page ' + i + ' checksum');
      eq(page.readUInt32LE(18), i, 'page ' + i + ' sequence');
      eq(page.readUInt32LE(14), 0x1234, 'one stream');
      const n = page[26];
      let size = 0;
      for (let k = 0; k < n; k++) size += page[27 + k];
      eq(page.length, 27 + n + size, 'page ' + i + ' lacing adds up');
    });
    eq(pages[0][5], 0x02, 'the first page begins the stream');
    eq(pages[0].subarray(28, 36).toString(), 'OpusHead');
    eq(pages[1].subarray(28, 36).toString(), 'OpusTags');
    eq([pages[2].readBigUInt64LE(6), pages[3].readBigUInt64LE(6)].map(Number), [960, 1920], '20 ms a packet at 48 kHz');
    eq([pages[3][26], pages[3][27], pages[3][28]], [2, 255, 45], 'a 300-byte packet laces as 255 + 45');
  });

  // the classic Ogg check value: CRC of "123456789" with this polynomial
  test('the Ogg checksum is the standard one', () => {
    eq(oggCrc(Buffer.from('123456789')).toString(16), '89a1897f');
  });
  report();
})().catch(e => { console.error(e); process.exitCode = 1; });
