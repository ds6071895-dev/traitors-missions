const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { createServer } = require('../server');
const H = require('./harness');
const { atest, eq, ok, report } = H;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  const end = Date.now() + 3000;
  while (!fn()) { if (Date.now() > end) throw new Error('Timed out'); await delay(5); }
}

(async () => {
  const app = createServer({ reconnectMs: 1200 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const clients = [];
  function client() {
    const sockets = [];
    class ObservedSocket extends WebSocket { constructor(url) { super(url); sockets.push(this); } }
    const c = H.load(['js/core/room-socket.js', 'js/core/party.js'], {
      WebSocket: ObservedSocket, URL, location: { href: origin },
    });
    c.sockets = sockets; clients.push(c); return c;
  }
  try {
    const A = client(), B = client(), C = client();
    let code;
    await atest('three real WebSockets join through the Party API without Trystero', async () => {
      code = await A.Party.host({ name: 'Ana' });
      await B.Party.join(code, { name: 'Bo' });
      await C.Party.join(code, { name: 'Cy' });
      await until(() => A.Party.roster().length === 3);
      eq(A.Party.roster().map(p => p.name), ['Ana', 'Bo', 'Cy']);
      eq(B.Party.hostId, A.Party.selfId());
      eq(C.Party.roster().length, 3);
    });
    await atest('full and nonexistent rooms return explicit errors', async () => {
      const D = client();
      await assert.rejects(D.Party.join(code, {}), /full/);
      ok(!D.Party.connected && !D.Party.connecting);
      await assert.rejects(D.Party.join('ZZZZ', {}), /not found/);
    });
    await atest('private roles reach only their target, with server-stamped identity', async () => {
      const b = [], c = [];
      const offB = B.Party.on('wire', (data, from) => b.push({ data, from }));
      const offC = C.Party.on('wire', data => c.push(data));
      A.Party.post('wire', { ev: { type: 'role', role: 'traitor' } }, B.Party.selfId());
      await until(() => b.length === 1);
      eq(c.length, 0);
      eq(b[0].from, A.Party.selfId());
      offB(); offC();
    });
    await atest('guests cannot broadcast fake game state or start the game', async () => {
      let forged = 0;
      const off = C.Party.on('wire', () => forged++);
      const offGo = A.Party.on('go', () => forged++);
      B.Party.post('wire', { ev: { type: 'state', state: {} } });
      B.Party.post('go', { seed: 1 });
      await delay(30);
      eq(forged, 0);
      off(); offGo();
    });
    await atest('mission poses, setup, and actions keep their existing channels', async () => {
      const heard = [];
      const offs = ['sync', 'mp', 'mev'].map(channel => B.Party.on(channel, (data, from) => heard.push([channel, data, from])));
      A.Party.post('sync', { k: 'pose', p: { x: 4 } });
      A.Party.post('mp', { k: 'setup', missionId: 'shootout' });
      A.Party.post('mev', { k: 'start', m: 'shootout' });
      await until(() => heard.length === 3);
      eq(heard.map(x => x[0]), ['sync', 'mp', 'mev']);
      offs.forEach(off => off());
    });
    await atest('voice frames travel through the server to the other two players only', async () => {
      const heard = [[], [], []];
      [A, B, C].forEach((c, i) => { c.Party.room.onAudio = packet => heard[i].push(packet); });
      const pcm = new Int16Array(480).fill(1234);
      A.Party.room.sendAudio(pcm.buffer);
      await until(() => heard[1].length && heard[2].length);
      eq(heard[0].length, 0);
      const bytes = Buffer.from(heard[1][0]);
      eq(bytes.subarray(0, 36).toString(), A.Party.selfId());
      eq(bytes.readInt16LE(36), 1234);
    });
    await atest('live snapshots are unsequenced and skipped behind a congested sender', async () => {
      const socket = A.sockets.at(-1), sent = [], original = socket.send;
      socket.send = function(data, ...args) { sent.push(JSON.parse(data)); return original.call(this, data, ...args); };
      try {
        A.Party.post('sync', { k: 'pose', p: { x: 10 } });
        A.Party.post('mev', { k: 'event', data: { kind: 'flock', a: [] } });
        eq(sent.length, 2);
        ok(sent.every(msg => msg.live === true && msg.seq === undefined));
        Object.defineProperty(socket, 'bufferedAmount', { configurable: true, value: 20000 });
        A.Party.post('sync', { k: 'pose', p: { x: 20 } });
        A.Party.post('mev', { k: 'event', data: { kind: 'reef' } });
        eq(sent.length, 2);
        A.Party.post('wire', { ev: { type: 'vote' } }, B.Party.selfId());
        ok(Number.isSafeInteger(sent[2].seq), 'votes remain reliable during congestion');
      } finally { delete socket.bufferedAmount; socket.send = original; }
    });
    await atest('a congested receiver drops live state but retains important events', async () => {
      const room = app.rooms.get(code), member = room.members.get(B.Party.selfId());
      const socket = member.ws, heard = [];
      const off = B.Party.on('sync', data => heard.push(data));
      try {
        Object.defineProperty(socket, 'bufferedAmount', { configurable: true, value: 20000 });
        A.Party.post('sync', { k: 'pose', p: { x: 99 } });
        await delay(40); eq(heard.length, 0);
        ok(!member.queue.some(item => JSON.parse(item.data).channel === 'sync'));
      } finally { delete socket.bufferedAmount; off(); }
    });
    await atest('brief interruption retains the seat and replays private messages once', async () => {
      const id = B.Party.selfId();
      let departed = 0;
      const offLeft = A.Party.on('left', () => departed++);
      const heard = [];
      const offWire = B.Party.on('wire', data => heard.push(data));
      B.sockets.at(-1).terminate();
      await until(() => B.Party.reconnecting);
      A.Party.post('wire', { ev: { type: 'role', role: 'faithful' } }, id);
      B.Party.post('wire', { type: 'hello' }, A.Party.selfId());
      await until(() => !B.Party.reconnecting && heard.length === 1);
      eq(B.Party.selfId(), id);
      eq(departed, 0);
      eq(A.Party.roster().length, 3);
      offLeft(); offWire();
    });
    await atest('profile updates and explicit leave are reflected immediately', async () => {
      B.Party.setProfile({ name: 'Bobby', look: { coat: 2 } });
      await until(() => A.Party.roster().some(p => p.name === 'Bobby'));
      C.Party.leave();
      await until(() => A.Party.roster().length === 2);
      await C.Party.join(code, { name: 'Cy again' });
      await until(() => A.Party.roster().length === 3);
    });
    await atest('cancelled server joins stay cancelled and a fresh retry succeeds', async () => {
      const D = client();
      const opening = D.Party.host({ name: 'D' });
      D.Party.leave();
      await assert.rejects(opening, error => error.name === 'AbortError');
      await delay(20);
      ok(!D.Party.connected);
      await D.Party.host({ name: 'D' });
      ok(D.Party.connected);
      D.Party.leave();
    });
    await atest('host departure closes the room and allows a new room on the same pages', async () => {
      A.Party.leave();
      await until(() => !B.Party.connected && !C.Party.connected);
      const next = await B.Party.host({ name: 'New host' });
      await A.Party.join(next, { name: 'Returning player' });
      await until(() => B.Party.roster().length === 2);
    });
    await atest('HTTP serves the game but never server files or secrets', async () => {
      eq((await fetch(origin + '/')).status, 200);
      eq((await fetch(origin + '/js/core/room-socket.js')).status, 200);
      for (const file of ['/server/index.js', '/.git/config', '/package-lock.json', '/.env', '/js/%2e%2e/server/index.js']) {
        eq((await fetch(origin + file)).status, 404, file);
      }
    });
    await atest('static files compress and revalidate instead of downloading again', async () => {
      const url = origin + '/js/core/input.js';
      const response = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
      eq(response.headers.get('content-encoding'), 'gzip');
      ok((await response.text()).includes('const Input'));
      const cached = await fetch(url, { headers: { 'If-None-Match': response.headers.get('etag') } });
      eq(cached.status, 304); eq(await cached.text(), '');
      const plain = await fetch(url, { headers: { 'Accept-Encoding': 'gzip;q=0' } });
      eq(plain.headers.get('content-encoding'), null);
      ok((await plain.text()).includes('const Input'));
    });
  } finally {
    clients.forEach(c => c.Party.leave());
    await delay(20);
    await app.close();
  }
  report();
})().catch(error => { console.error(error); process.exitCode = 1; });
