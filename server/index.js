'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, randomInt } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { createGzip } = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CHANNELS = new Set(['go', 'wire', 'sync', 'mev', 'mp']);
const LIVE_BUFFER = 16 * 1024;
const livePost = msg => msg.channel === 'sync'
  || (msg.channel === 'mev' && msg.data?.k === 'event' && ['flock', 'reef'].includes(msg.data.data?.kind));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

// One process owns all live rooms. Run one instance (see README for deployment).
function createServer({ reconnectMs = 15000, heartbeatMs = 10000, maxRooms = 1000,
  allowedOrigins = [], root = ROOT } = {}) {
  const rooms = new Map();
  const sessions = new Map();
  let stopping = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    let name;
    try { name = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    if (name === '/') name = '/index.html';
    // Never serve server code, tests, node_modules, git, or deployment secrets.
    const parts = name.split('/');
    const publicFile = ['/index.html', '/dialogue-editor.html', '/jukebox.html'].includes(name)
      || /^\/(js|css|assets)\//.test(name);
    if (!publicFile || parts.some(p => p.startsWith('.')) || name.includes('\\')) {
      res.writeHead(404); return res.end();
    }
    const file = path.join(root, name);
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); return res.end(); }
      const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
      const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache', 'ETag': etag, 'Vary': 'Accept-Encoding',
        'X-Content-Type-Options': 'nosniff' };
      if (req.headers['if-none-match']?.split(/\s*,\s*/).includes(etag)) {
        res.writeHead(304, headers); return res.end();
      }
      const gzip = /\.(html|js|css|svg)$/.test(file) && stat.size > 1024
        && (req.headers['accept-encoding'] || '').split(',').some(part => {
          const [encoding, ...params] = part.trim().split(';');
          return encoding === 'gzip' && !params.some(p => /^\s*q=0(?:\.0*)?\s*$/.test(p));
        });
      if (gzip) headers['Content-Encoding'] = 'gzip';
      else headers['Content-Length'] = stat.size;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(file).on('error', () => res.destroy());
      if (gzip) stream.pipe(createGzip()).on('error', () => res.destroy()).pipe(res);
      else stream.pipe(res);
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024,
    perMessageDeflate: false });

  server.on('upgrade', (req, socket, head) => {
    let valid = false;
    try {
      const url = new URL(req.url, 'http://localhost');
      const origin = req.headers.origin;
      valid = url.pathname === '/rooms' && (!origin || allowedOrigins.includes(origin)
        || new URL(origin).host === req.headers.host);
    } catch { /* malformed request */ }
    if (!valid) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });

  const list = room => [...room.members.values()].map(p => ({
    id: p.id, name: p.profile.name, look: p.profile.look, seat: p.seat, host: p.id === room.hostId,
  }));
  const raw = (ws, data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return; }
      ws.send(data);
    }
  };
  function deliver(member, message) {
    const data = JSON.stringify({ ...message, seq: ++member.outSeq });
    member.queue.push({ seq: member.outSeq, data });
    member.bytes += Buffer.byteLength(data);
    // Never silently drop a vote or role if a client cannot keep up.
    if (member.queue.length > 1024 || member.bytes > 2 * 1024 * 1024) {
      remove(member, 'The connection fell too far behind. Please rejoin.');
      return;
    }
    raw(member.ws, data);
  }
  const roster = room => {
    const players = list(room);
    for (const p of room.members.values()) deliver(p, { type: 'roster', players, hostId: room.hostId });
  };
  function endSocket(p, reason) {
    clearTimeout(p.expiry);
    sessions.delete(p.token);
    const ws = p.ws;
    p.ws = null;
    if (ws) { raw(ws, JSON.stringify({ type: 'error', message: reason })); ws.close(1000); }
  }
  function remove(p, reason = 'You left the room.') {
    const room = p.room;
    if (!room.members.has(p.id)) return;
    room.members.delete(p.id);
    endSocket(p, reason);
    if (p.id === room.hostId) {
      rooms.delete(room.code);
      for (const other of room.members.values()) endSocket(other, 'The host left the room.');
      room.members.clear();
    } else roster(room);
  }
  function profile(data) {
    return { name: String(data?.name || 'Player').slice(0, 16),
      look: data?.look && typeof data.look === 'object' && JSON.stringify(data.look).length < 4096
        ? data.look : null };
  }
  function permitted(p, msg) {
    const isHost = p.id === p.room.hostId;
    if (!CHANNELS.has(msg.channel)) return false;
    if (msg.channel === 'go') return isHost;
    if (msg.channel === 'wire') {
      if (msg.data?.ev?.type === 'role' && !p.room.members.has(msg.to)) return false;
      return isHost || (msg.to === p.room.hostId && ['action', 'hello'].includes(msg.data?.type));
    }
    if (msg.channel === 'mp') return isHost || (msg.to === p.room.hostId && msg.data?.k === 'want');
    if (msg.channel === 'mev' && ['board', 'start'].includes(msg.data?.k)) return isHost;
    return true;
  }
  function relay(member, msg) {
    const data = { type: 'post', channel: msg.channel, data: msg.data, from: member.id };
    for (const p of member.room.members.values()) {
      if (p === member || (msg.to && msg.to !== p.id)) continue;
      if (livePost(msg)) {
        if (p.ws?.readyState === WebSocket.OPEN && p.ws.bufferedAmount < LIVE_BUFFER) raw(p.ws, JSON.stringify(data));
      } else deliver(p, data);
    }
  }

  wss.on('connection', ws => {
    let member = null;
    let count = 0, bytes = 0, since = Date.now();
    ws.alive = true;
    const admissionTimer = setTimeout(() => ws.close(1008, 'Join required'), 10000);
    ws.on('error', () => {});
    ws.on('pong', () => { ws.alive = true; });
    const fail = message => { raw(ws, JSON.stringify({ type: 'error', message })); ws.close(1008); };
    ws.on('message', (data, binary) => {
      if (Date.now() - since >= 1000) { since = Date.now(); count = bytes = 0; }
      if (++count > 500 || (bytes += data.length) > 2 * 1024 * 1024) return ws.close(1008, 'Rate limit');
      if (member && member.ws !== ws) return; // replaced by an authenticated resume
      if (binary) {
        if (!member || data.length !== 960) return; // 20 ms of 24 kHz, mono PCM16
        const packet = Buffer.concat([Buffer.from(member.id, 'ascii'), data]);
        for (const p of member.room.members.values()) {
          if (p !== member && p.ws?.readyState === WebSocket.OPEN && p.ws.bufferedAmount < LIVE_BUFFER) {
            p.ws.send(packet, { binary: true }); // audio is live; never replay it on reconnect
          }
        }
        return;
      }
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return fail('Invalid room message.'); }
      if (!msg || typeof msg !== 'object') return fail('Invalid room message.');
      if (msg.type === 'ping') return raw(ws, JSON.stringify({ type: 'pong' }));
      if (!member) {
        if (msg.type !== 'join') return fail('Join a room first.');
        if (msg.token) {
          member = sessions.get(msg.token);
          if (!member) return fail('Your room connection expired. Please rejoin.');
          clearTimeout(member.expiry);
          const old = member.ws;
          member.ws = ws;
          if (old && old !== ws) old.close(1000, 'Reconnected');
        } else {
          let room;
          if (msg.host === true) {
            if (rooms.size >= maxRooms) return fail('The room server is busy. Please try again.');
            let code;
            do { code = Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join(''); }
            while (rooms.has(code));
            room = { code, members: new Map(), hostId: null, started: false };
            rooms.set(code, room);
          } else {
            room = rooms.get(msg.code);
            if (!room) return fail('Room not found. Check the four letters.');
            if (room.members.size >= 3) return fail('That room is already full.');
            if (room.started) return fail('That game has already started.');
          }
          const occupied = new Set([...room.members.values()].map(p => p.seat));
          let seat = 0;
          while (occupied.has(seat)) seat++;
          member = { id: randomUUID(), token: randomBytes(32).toString('hex'), room, seat,
            profile: profile(msg.profile), ws, queue: [], bytes: 0, outSeq: 0, inSeq: 0, expiry: null };
          if (msg.host === true) room.hostId = member.id;
          room.members.set(member.id, member);
          sessions.set(member.token, member);
        }
        clearTimeout(admissionTimer);
        raw(ws, JSON.stringify({ type: 'welcome', id: member.id, token: member.token,
          code: member.room.code, hostId: member.room.hostId, players: list(member.room) }));
        for (const item of member.queue) raw(ws, item.data);
        roster(member.room);
        return;
      }
      if (msg.type === 'leave') { remove(member); return; }
      if (msg.type === 'ack') {
        if (!Number.isSafeInteger(msg.seq) || msg.seq > member.outSeq) return;
        while (member.queue.length && member.queue[0].seq <= msg.seq) {
          member.bytes -= Buffer.byteLength(member.queue.shift().data);
        }
        return;
      }
      // Live updates have no replay sequence or per-frame acknowledgement.
      // Validate the channel/type here; clients cannot make a vote disposable.
      if (msg.type === 'post' && msg.live === true && livePost(msg)) {
        if (permitted(member, msg)) relay(member, msg);
        return;
      }
      if (!Number.isSafeInteger(msg.seq) || msg.seq < 1) return;
      if (msg.seq <= member.inSeq) return raw(ws, JSON.stringify({ type: 'ack', seq: member.inSeq }));
      if (msg.seq !== member.inSeq + 1) return fail('Room messages arrived out of order. Please rejoin.');
      member.inSeq = msg.seq;
      if (msg.type === 'profile') {
        member.profile = profile(msg.profile);
        roster(member.room);
      } else if (msg.type === 'lobby' && member.id === member.room.hostId) {
        member.room.started = false;
      } else if (msg.type === 'post' && permitted(member, msg)) {
        if (msg.channel === 'go') member.room.started = true;
        relay(member, msg);
      }
      raw(ws, JSON.stringify({ type: 'ack', seq: member.inSeq }));
    });
    ws.on('close', () => {
      clearTimeout(admissionTimer);
      if (stopping || !member || member.ws !== ws) return;
      member.ws = null;
      member.expiry = setTimeout(() => remove(member, 'The connection timed out.'), reconnectMs);
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();
  return { server, rooms, wss, async close() {
    stopping = true;
    clearInterval(heartbeat);
    for (const p of sessions.values()) clearTimeout(p.expiry);
    sessions.clear(); rooms.clear();
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  } };
}

if (require.main === module) {
  const app = createServer({ allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean) });
  const port = Number(process.env.PORT || 8080);
  app.server.listen(port, process.env.HOST || '0.0.0.0', () => console.log('The Traitors listening on port ' + port));
  const stop = () => app.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
module.exports = { createServer };
