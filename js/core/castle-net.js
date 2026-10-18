/* ------------------------------------------------------------------
   castle-net.js — where everybody is in the house, while it is day.

   During the tasks everybody walks round the castle on their own, and
   every screen has to draw everybody else where they actually are. So
   each browser says where its own person is ten times a second, the
   host says where every AI contestant is in one packet, and everybody
   keeps the latest of each. Poses ride the room's `sync` channel, which
   the server relays live and never replays: a position from a second
   ago is worth nothing.

   A pose is castle-local (see `castle-layout.js`): x, z, the way they
   are facing as a heading (forward is (sin h, cos h), the same as a
   figure's `rotation.y`), and `g` — whoever they are reaching out to
   hand something to, while they are doing it. The reach is the only
   thing a witness can see, and it is the same for a letter as it is for
   the poison.

   It is also the host's eyes. The rules (`Session.setEyes`) ask three
   questions and this answers them from the poses:

     reach(a, b)        how far apart two people are
     witnesses(a, b)    who could see a hand a thing to b, and where
     presence()         who is in which room, with whom
------------------------------------------------------------------ */
const CastleNet = (() => {

  const SEND_MS = 100;
  const SIGHT = 15;                 // metres: further than this, a reach is a blur
  const NEAR = 4.5;                 // metres: this close, you notice through a doorway
  const FOV = 62 * Math.PI / 180;   // half-angle a person is looking across

  const poses = new Map();          // id -> { x, z, h, g, t, room }
  let day = null;
  let offSync = null;
  let lastSend = 0;
  let botSend = 0;

  function start(key) {
    stop();
    day = key;
    poses.clear();
    if (typeof Party !== 'undefined' && Party.on) {
      offSync = Party.on('sync', (msg, from) => {
        if (!msg || msg.d !== day) return;
        if (msg.k === 'cpose' && from) take(from, msg.p);
        else if (msg.k === 'cposes' && Array.isArray(msg.list)
                 && typeof Party !== 'undefined' && from === Party.hostId) {
          for (const row of msg.list) if (Array.isArray(row)) take(row[0], row.slice(1));
        }
      });
    }
  }

  function stop() {
    if (offSync) { offSync(); offSync = null; }
    day = null;
  }

  function take(id, p) {
    if (!id || !Array.isArray(p) || !p.slice(0, 3).every(Number.isFinite)) return;
    if (Math.abs(p[0]) > 200 || Math.abs(p[1]) > 200) return;
    const prev = poses.get(id);
    const room = roomOf(p[0], p[1], prev && prev.room);
    const now = Date.now();
    /* How fast they were going, so a screen can draw them where they
       are now rather than where they were a tenth of a second ago. */
    let vx = 0, vz = 0;
    if (prev && now > prev.t) {
      const dt = Math.max(0.03, (now - prev.t) / 1000);
      vx = U.clamp((p[0] - prev.x) / dt, -9, 9);
      vz = U.clamp((p[1] - prev.z) / dt, -9, 9);
      if (prev.vx !== undefined) { vx = prev.vx * 0.35 + vx * 0.65; vz = prev.vz * 0.35 + vz * 0.65; }
    }
    /* `w`, a fifth field, is "working at a station" — only how they are
       drawn. A build that predates it sends four and ignores a fifth. */
    poses.set(id, { x: p[0], z: p[1], h: p[2], g: typeof p[3] === 'string' ? p[3] : null,
                    w: p[4] === 1, t: now, room, vx, vz });
  }

  /* Rooms are where you are standing; a doorway is still the room you
     were in until you are through it. */
  function roomOf(x, z, fallback) {
    const r = typeof CastleLayout !== 'undefined' ? CastleLayout.roomAt(x, z) : null;
    return r ? r.id : (fallback || null);
  }

  const wire = (v) => Math.round(v * 100) / 100;

  /* Our own person: kept here at once, sent at ten a second. */
  function publish(id, x, z, h, g, w) {
    take(id, [x, z, h, g || 0, w ? 1 : 0]);
    const now = Date.now();
    if (now - lastSend < SEND_MS) return;
    lastSend = now;
    if (typeof Party === 'undefined' || !Party.connected || !Party.post) return;
    Party.post('sync', { k: 'cpose', d: day, p: [wire(x), wire(z), wire(h), g || 0, w ? 1 : 0] });
  }

  /* The host's AI contestants, in one packet. */
  function publishBots(rows) {
    for (const r of rows) take(r[0], r.slice(1));
    const now = Date.now();
    if (now - botSend < SEND_MS) return;
    botSend = now;
    if (typeof Party === 'undefined' || !Party.connected || !Party.isHost || !Party.post) return;
    Party.post('sync', { k: 'cposes', d: day,
                         list: rows.map(r => [r[0], wire(r[1]), wire(r[2]), wire(r[3]), r[4] || 0, r[5] ? 1 : 0]) });
  }

  const get = (id) => poses.get(id) || null;

  /* Where somebody is now: their last pose, carried forward by how fast
     they were going for as long as it has been — but never more than a
     fifth of a second, so a lost packet cannot walk them through a wall. */
  function now(id) {
    const p = poses.get(id);
    if (!p) return null;
    const ahead = Math.min(0.2, Math.max(0, (Date.now() - p.t) / 1000));
    return { x: p.x + (p.vx || 0) * ahead, z: p.z + (p.vz || 0) * ahead, h: p.h, g: p.g, w: p.w, room: p.room };
  }

  /* ---------------- the host's eyes ---------------- */

  const living = () => (typeof Session !== 'undefined' ? Session.alive() : []);

  function reach(a, b) {
    const p = poses.get(a), q = poses.get(b);
    if (!p || !q) return null;
    return Math.hypot(p.x - q.x, p.z - q.z);
  }

  /* Could `w` see `a`? Near enough, looking the right way, and either in
     the same room or close enough to notice through a door. Walls are
     the rooms: two people in different rooms see each other only when
     they are standing either side of the same doorway. */
  function sees(w, a) {
    const dx = a.x - w.x, dz = a.z - w.z;
    const d = Math.hypot(dx, dz);
    if (d > SIGHT) return false;
    const sameRoom = w.room && a.room && w.room === a.room;
    if (!sameRoom && d > NEAR) return false;
    if (d < 1.2) return true;                 // right beside them: you know
    const fx = Math.sin(w.h), fz = Math.cos(w.h);
    const cos = (fx * dx + fz * dz) / d;
    return cos >= Math.cos(FOV);
  }

  function witnesses(actorId, targetId) {
    const a = poses.get(actorId);
    if (!a) return { ids: [], room: null };
    const ids = [];
    for (const p of living()) {
      if (p.id === actorId || p.id === targetId) continue;
      const w = poses.get(p.id);
      if (w && sees(w, a)) ids.push(p.id);
    }
    return { ids, room: a.room };
  }

  function presence() {
    const out = {};
    const here = living().map(p => ({ id: p.id, pose: poses.get(p.id) })).filter(x => x.pose && x.pose.room);
    for (const x of here) {
      out[x.id] = { room: x.pose.room,
                    with: here.filter(y => y.id !== x.id && y.pose.room === x.pose.room).map(y => y.id) };
    }
    return out;
  }

  /* Who is looking at `actorId` right now: what an AI Traitor checks
     before it reaches into somebody's pocket. */
  const watchers = (actorId, targetId) => witnesses(actorId, targetId).ids;

  const eyes = { reach, witnesses, presence };

  return { start, stop, publish, publishBots, get, now, roomOf, eyes, watchers, sees,
           all: () => poses, SEND_MS, SIGHT, NEAR, FOV,
           get day() { return day; } };
})();
