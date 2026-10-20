/* ------------------------------------------------------------------
   castle-net.js — where everybody is in the house, while it is day.

   During the tasks everybody walks round the castle on their own, and
   every screen has to draw everybody else where they actually are. So
   each browser says where its own person is fifteen times a second while
   they move (twice a second while they stand still), the host says where
   every AI contestant is in one packet, and everybody keeps the latest of
   each. Poses ride the room's `sync` channel, which the server relays
   live and never replays: a position from a second ago is worth nothing.

   The rules use the latest pose. The screen draws somebody a little in
   the past instead — `DELAY` behind — between the two poses either side
   of that moment, using the time each was sent, not the time it landed.
   Over the internet packets arrive in clumps, and drawing the newest one
   carried forward made every clump a lurch; drawing between two known
   poses is smooth whatever the line does.

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
     nearDoor(a, door)  whether somebody is standing at a door
     inDoorway(door)    whether anybody is standing in its way
------------------------------------------------------------------ */
const CastleNet = (() => {

  const SEND_MS = 66;               // while moving
  const IDLE_MS = 500;              // while standing still
  const DELAY = 120;                // ms behind now that somebody else is drawn
  const EXTRAPOLATE = 100;          // ms past their newest pose we will guess
  const HISTORY = 8;
  const SIGHT = 15;                 // metres: further than this, a reach is a blur
  const NEAR = 4.5;                 // metres: this close, you notice through a doorway
  const FOV = 62 * Math.PI / 180;   // half-angle a person is looking across

  const poses = new Map();          // id -> { x, z, h, g, t, room }
  const trail = new Map();          // id -> [{ at, x, z, h }], oldest first, on our clock
  const clocks = new Map();         // id -> { off, at }: their clock to ours
  let day = null;
  let offSync = null;
  let lastSend = 0;
  let lastSent = null;
  let botSend = 0;

  function start(key) {
    stop();
    day = key;
    poses.clear();
    trail.clear();
    clocks.clear();
    lastSent = null;
    if (typeof Party !== 'undefined' && Party.on) {
      offSync = Party.on('sync', (msg, from) => {
        if (!msg || msg.d !== day) return;
        if (msg.k === 'cpose' && from) take(from, msg.p, msg.t);
        else if (msg.k === 'cposes' && Array.isArray(msg.list)
                 && typeof Party !== 'undefined' && from === Party.hostId) {
          for (const row of msg.list) if (Array.isArray(row)) take(row[0], row.slice(1), msg.t);
        }
      });
    }
  }

  function stop() {
    if (offSync) { offSync(); offSync = null; }
    day = null;
  }

  function take(id, p, sentAt) {
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
    if (Number.isFinite(sentAt)) remember(id, p, sentAt, now);
  }

  /* When a pose was true, on our clock. Their clock and ours differ by an
     unknown amount plus however long the packet took; the least-delayed
     packet so far is the best guess at the first, and the guess is let
     creep up slowly so a clock that drifts is followed. */
  function remember(id, p, sentAt, now) {
    let c = clocks.get(id);
    const gap = now - sentAt;
    if (!c) c = { off: gap, at: now };
    else c.off = Math.min(gap, c.off + (now - c.at) * 0.002);
    c.at = now;
    clocks.set(id, c);
    const at = sentAt + c.off;
    let list = trail.get(id);
    if (!list) trail.set(id, list = []);
    const last = list[list.length - 1];
    // a jump across the castle is a teleport, not a walk: start again from here
    if (last && Math.hypot(p[0] - last.x, p[1] - last.z) > 6) list.length = 0;
    if (last && list.length && at <= last.at) list.pop();
    list.push({ at, x: p[0], z: p[1], h: p[2] });
    if (list.length > HISTORY) list.shift();
  }

  /* Rooms are where you are standing; a doorway is still the room you
     were in until you are through it. */
  function roomOf(x, z, fallback) {
    const r = typeof CastleLayout !== 'undefined' ? CastleLayout.roomAt(x, z) : null;
    return r ? r.id : (fallback || null);
  }

  const wire = (v) => Math.round(v * 100) / 100;

  /* Our own person: kept here at once, sent fifteen times a second while
     they move and twice a second while they do not. */
  function publish(id, x, z, h, g, w) {
    take(id, [x, z, h, g || 0, w ? 1 : 0]);
    const now = Date.now();
    const p = [wire(x), wire(z), wire(h), g || 0, w ? 1 : 0];
    const still = lastSent && p.every((v, i) => (typeof v === 'number' && typeof lastSent[i] === 'number'
      ? Math.abs(v - lastSent[i]) < (i === 2 ? 0.02 : 0.01) : v === lastSent[i]));
    if (now - lastSend < (still ? IDLE_MS : SEND_MS)) return;
    lastSend = now;
    if (typeof Party === 'undefined' || !Party.connected || !Party.post) return;
    lastSent = p;
    Party.post('sync', { k: 'cpose', d: day, t: now, p });
  }

  /* The host's AI contestants, in one packet. */
  function publishBots(rows) {
    for (const r of rows) take(r[0], r.slice(1));
    const now = Date.now();
    if (now - botSend < SEND_MS) return;
    botSend = now;
    if (typeof Party === 'undefined' || !Party.connected || !Party.isHost || !Party.post) return;
    Party.post('sync', { k: 'cposes', d: day, t: now,
                         list: rows.map(r => [r[0], wire(r[1]), wire(r[2]), wire(r[3]), r[4] || 0, r[5] ? 1 : 0]) });
  }

  const get = (id) => poses.get(id) || null;

  /* Where to draw somebody: `DELAY` ago, between the poses either side of
     it. Past their newest pose — a late packet — they are carried on by
     how fast they were going, but only a tenth of a second, so a lost
     packet cannot walk them through a wall. A pose with no send time (our
     own, or an older page's) is the newest carried forward, as before. */
  function now(id) {
    const p = poses.get(id);
    if (!p) return null;
    const list = trail.get(id);
    if (!list || list.length < 2) {
      const ahead = Math.min(0.2, Math.max(0, (Date.now() - p.t) / 1000));
      return { x: p.x + (p.vx || 0) * ahead, z: p.z + (p.vz || 0) * ahead, h: p.h, g: p.g, w: p.w, room: p.room };
    }
    const at = Date.now() - DELAY;
    const pose = (x, z, h) => ({ x, z, h, g: p.g, w: p.w, room: p.room });
    if (at <= list[0].at) return pose(list[0].x, list[0].z, list[0].h);
    const last = list[list.length - 1];
    if (at >= last.at) {
      const prev = list[list.length - 2];
      const dt = Math.max(30, last.at - prev.at) / 1000;
      const vx = U.clamp((last.x - prev.x) / dt, -9, 9), vz = U.clamp((last.z - prev.z) / dt, -9, 9);
      const ahead = Math.min(EXTRAPOLATE, at - last.at) / 1000;
      return pose(last.x + vx * ahead, last.z + vz * ahead, last.h);
    }
    let i = list.length - 2;
    while (i > 0 && list[i].at > at) i--;
    const a = list[i], b = list[i + 1];
    const f = b.at > a.at ? (at - a.at) / (b.at - a.at) : 1;
    const turn = Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h));
    return pose(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, a.h + turn * f);
  }

  /* ---------------- the host's eyes ---------------- */

  const living = () => (typeof Session !== 'undefined' ? Session.alive() : []);

  function reach(a, b) {
    const p = poses.get(a), q = poses.get(b);
    if (!p || !q) return null;
    return Math.hypot(p.x - q.x, p.z - q.z);
  }

  // the castle's shut doors, as the session keeps them
  const shutDoors = () => (typeof Session !== 'undefined' && Session.state && Session.state.doors) || null;

  /* Could `w` see `a`? Near enough, looking the right way, and either in
     the same room or close enough to notice through a door. Walls are
     the rooms: two people in different rooms see each other only when
     they are standing either side of the same doorway — and not when
     the door between is shut. */
  function sees(w, a) {
    const dx = a.x - w.x, dz = a.z - w.z;
    const d = Math.hypot(dx, dz);
    if (d > SIGHT) return false;
    const sameRoom = w.room && a.room && w.room === a.room;
    if (!sameRoom && d > NEAR) return false;
    if (!sameRoom && typeof CastleLayout !== 'undefined' && CastleLayout.apart(w.room, a.room, shutDoors())) return false;
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

  /* Close enough to a door to swing it: a long arm's length past the
     doorway, either side. */
  function nearDoor(id, doorId) {
    const p = poses.get(id), d = typeof CastleLayout !== 'undefined' ? CastleLayout.doorById(doorId) : null;
    return !!(p && d && Math.hypot(p.x - d.x, p.z - d.z) <= 2.5);
  }
  // somebody standing where the door would swing shut on them
  function inDoorway(doorId) {
    const d = typeof CastleLayout !== 'undefined' ? CastleLayout.doorById(doorId) : null;
    if (!d) return false;
    const b = CastleLayout.doorBox(d, 0.32);
    for (const p of living()) {
      const q = poses.get(p.id);
      if (q && q.x > b.x0 - 0.2 && q.x < b.x1 + 0.2 && q.z > b.z0 - 0.2 && q.z < b.z1 + 0.2) return true;
    }
    return false;
  }

  const eyes = { reach, witnesses, presence, nearDoor, inDoorway };

  return { start, stop, publish, publishBots, get, now, roomOf, eyes, watchers, sees,
           all: () => poses, SEND_MS, IDLE_MS, DELAY, SIGHT, NEAR, FOV,
           get day() { return day; } };
})();
