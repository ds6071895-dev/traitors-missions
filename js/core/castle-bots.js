/* ------------------------------------------------------------------
   castle-bots.js — the AI contestants, loose in the castle by day.

   The host plays them. Each one walks the house like a person with a
   list: to a job, stands at it for a few seconds, on to the next; hands
   a letter over if it has one; drifts after somebody once the list is
   done. Its pose goes out in the host's one packet of AI poses, and its
   jobs and hand-overs go through the same actions a person's do, so the
   rules check them exactly as they check anybody's.

   An AI Traitor carrying the poison acts normally for a while — a
   Traitor who makes straight for somebody is a Traitor — and then picks
   somebody who is on their own, walks up to them, and only reaches out
   when nobody is looking. As the bell gets closer it gets less fussy
   about who is watching, because being seen is better than being
   exposed at the table.

   Walking is a grid over the floor plan, with the furniture taken out,
   and A* across it. It is built once per day from the interior the
   host's scene already has, with every door open: a shut door is
   something an AI opens when it gets to it, as a person does. And a
   Traitor about to do it, or anybody wanting a private word, may shut
   a door behind them.

   People can also ask an AI along. One that agrees walks behind them,
   through the doors they go through, and stands with them wherever they
   stop — a shut room included. One that wants a private word leads the
   way to a room with one door and shuts it once they are both in. And a
   Faithful who has come to suspect somebody does not stay to be
   poisoned: if they reach for it, or shut it in with them, it makes for
   the busiest room in the house.
------------------------------------------------------------------ */
const CastleBots = (() => {

  const CELL = 0.5;
  const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = CastleLayout.BOUNDS;
  const NX = Math.round((X1 - X0) / CELL), NZ = Math.round((Z1 - Z0) / CELL);
  const SPEED = 3.4;
  const FOLLOW_SECS = 120;         // how long an AI tags along before it gets back to its jobs
  const FLEE_SPEED = 5.8;

  let grid = null;                 // Uint8Array, 1 = walkable
  let bots = [];
  let running = false;
  let rng = null;
  let solid = [];

  /* ---------------- the floor ---------------- */

  function blocked(x, z) {
    for (const b of solid) if (x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3) return true;
    return false;
  }
  const free = (x, z) => CastleLayout.walkable(x, z) && !blocked(x, z);

  function buildGrid(solidBoxes) {
    solid = solidBoxes || [];
    grid = new Uint8Array(NX * NZ);
    for (let i = 0; i < NX; i++) {
      for (let k = 0; k < NZ; k++) {
        const x = X0 + (i + 0.5) * CELL, z = Z0 + (k + 0.5) * CELL;
        grid[i + k * NX] = free(x, z) ? 1 : 0;
      }
    }
  }

  const cellOf = (x, z) => [Math.floor((x - X0) / CELL), Math.floor((z - Z0) / CELL)];
  const ok = (i, k) => i >= 0 && k >= 0 && i < NX && k < NZ && grid[i + k * NX] === 1;

  function nearestOpen(i, k) {
    if (ok(i, k)) return [i, k];
    for (let r = 1; r < 8; r++) {
      for (let di = -r; di <= r; di++) for (let dk = -r; dk <= r; dk++) {
        if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
        if (ok(i + di, k + dk)) return [i + di, k + dk];
      }
    }
    return null;
  }

  /* A* on the grid, then straightened: any corner the walk can cut in a
     clear line is cut, so they walk like people rather than like rooks. */
  function path(ax, az, bx, bz) {
    if (!grid) return [{ x: bx, z: bz }];
    const a = nearestOpen(...cellOf(ax, az)), b = nearestOpen(...cellOf(bx, bz));
    if (!a || !b) return [{ x: bx, z: bz }];
    const start = a[0] + a[1] * NX, goal = b[0] + b[1] * NX;
    const g = new Float32Array(NX * NZ).fill(Infinity);
    const came = new Int32Array(NX * NZ).fill(-1);
    const shut = new Uint8Array(NX * NZ);
    g[start] = 0;
    const h = (n) => Math.hypot((n % NX) - b[0], Math.floor(n / NX) - b[1]);
    /* The open list is a binary heap of (f, cell); a cell already done
       with is skipped when it comes up again, so there is no decrease-key. */
    const heap = [], push = (fv, n) => {
      heap.push([fv, n]);
      for (let i = heap.length - 1; i > 0;) {
        const up = (i - 1) >> 1;
        if (heap[up][0] <= heap[i][0]) break;
        [heap[up], heap[i]] = [heap[i], heap[up]]; i = up;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    push(h(start), start);
    let guard = 0;
    while (heap.length && guard++ < 80000) {
      const cur = pop()[1];
      if (shut[cur]) continue;
      shut[cur] = 1;
      if (cur === goal) break;
      const ci = cur % NX, ck = Math.floor(cur / NX);
      for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
        if (!di && !dk) continue;
        const ni = ci + di, nk = ck + dk;
        if (!ok(ni, nk)) continue;
        if (di && dk && (!ok(ci + di, ck) || !ok(ci, ck + dk))) continue;   // no squeezing past a corner
        const n = ni + nk * NX;
        if (shut[n]) continue;
        const cost = g[cur] + (di && dk ? 1.414 : 1);
        if (cost < g[n]) {
          g[n] = cost; came[n] = cur;
          push(cost + h(n), n);
        }
      }
    }
    if (came[goal] < 0 && goal !== start) return [{ x: bx, z: bz }];
    const cells = [];
    for (let n = goal; n !== -1; n = came[n]) { cells.push(n); if (n === start) break; }
    cells.reverse();
    const pts = cells.map(n => ({ x: X0 + ((n % NX) + 0.5) * CELL, z: Z0 + (Math.floor(n / NX) + 0.5) * CELL }));
    pts.push({ x: bx, z: bz });
    // string-pull
    const out = [];
    let from = { x: ax, z: az };
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !clear(from, pts[j])) j--;
      out.push(pts[j]);
      from = pts[j];
      i = j + 1;
    }
    return out;
  }

  /* A straight line is clear if every cell under it is, and the floor
     itself is too: a doorway is narrower than two cells, and a line
     between cell centres can clip the jamb. */
  function clear(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / 0.12);
    for (let s = 1; s < n; s++) {
      const x = a.x + (b.x - a.x) * s / n, z = a.z + (b.z - a.z) * s / n;
      const [i, k] = cellOf(x, z);
      if (!ok(i, k) || !CastleLayout.walkable(x, z)) return false;
    }
    return true;
  }

  /* ---------------- the people ---------------- */

  function start(ids, opts = {}) {
    stop();
    if (!ids.length) return;
    buildGrid(opts.solid || []);
    rng = U.makeRng(((opts.seed || 1) ^ 0xb0b) >>> 0 || 1);
    bots = ids.map((id, n) => {
      const at = (opts.spawn && opts.spawn(id)) || { x: (n - ids.length / 2) * 1.2, z: 12 };
      return { id, x: at.x, z: at.z, h: Math.PI, route: [], plan: null, wait: rng.range(0.4, 2.2),
               g: null, hold: 0, social: null, stalkAfter: rng.range(28, 55), rethink: 0, repick: 0, speed: SPEED * rng.range(0.9, 1.1),
               follow: null, lead: null, flee: null, wary: new Map() };
    });
    running = true;
  }

  function stop() { running = false; bots = []; }

  const view = (id) => (typeof Session !== 'undefined' && Session.privateView ? Session.privateView(id) : null);
  const alive = (id) => { const p = Session.playerById(id); return !!(p && p.alive); };
  const poseOf = (id) => (typeof CastleNet !== 'undefined' ? CastleNet.get(id) : null);
  const left = () => {
    const c = Session.state && Session.state.chores;
    return c ? Math.max(0, (c.endsAt - Date.now()) / 1000) : 0;
  };
  const elapsed = () => {
    const c = Session.state && Session.state.chores;
    return c ? Math.max(0, (Date.now() - c.startedAt) / 1000) : 0;
  };

  function goTo(b, x, z) {
    b.route = path(b.x, b.z, x, z);
  }

  /* ---------------- doors ---------------- */

  const shutDoors = () => (Session.state && Session.state.doors) || {};
  const roomOfBot = (b) => { const r = CastleLayout.roomAt(b.x, b.z); return r ? r.id : null; };

  // does the leg from `a` to `t` go through the doorway `d`?
  function crosses(a, t, d) {
    const [pa, pt, qa, qt, line, c] = d.axis === 'x' ? [a.z, t.z, a.x, t.x, d.z, d.x] : [a.x, t.x, a.z, t.z, d.x, d.z];
    if ((pa - line) * (pt - line) > 0) return false;
    const k = Math.abs(pt - pa) < 1e-6 ? 0 : (line - pa) / (pt - pa);
    return Math.abs(qa + (qt - qa) * k - c) <= d.w / 2 + 0.3;
  }
  /* A shut door the route is about to go through. The AI stops at it
     and opens it, and asks again if the first go is refused. */
  function doorAhead(b) {
    const t = b.route[0];
    if (!t) return null;
    for (const id in shutDoors()) {
      const d = CastleLayout.doorById(id);
      if (d && Math.hypot(d.x - b.x, d.z - b.z) < 1.7 && crosses(b, t, d)) return d;
    }
    return null;
  }
  function openDoor(b, d, dt) {
    face(b, d.x, d.z);
    b.doorAsk = (b.doorAsk || 0) - dt;
    if (b.doorAsk > 0) return;
    b.doorAsk = 0.7;
    Net.send({ type: 'door', playerId: b.id, doorId: d.id, shut: false });
  }
  /* Walk to just inside a room's door and shut it. True while that is
     still going on; false once it is shut, or cannot be. */
  function shutBehind(b, dt, doorId, roomId) {
    const d = CastleLayout.doorById(doorId);
    if (!d || shutDoors()[d.id] || roomOfBot(b) !== roomId) return false;
    const n = CastleLayout.inward(d, roomId);
    const sx = d.x + n.x * 1.0, sz = d.z + n.z * 1.0;
    if (Math.hypot(sx - b.x, sz - b.z) > 0.45) {
      if (!b.route.length || (b.rethink -= dt) <= 0) { goTo(b, sx, sz); b.rethink = 1.0; }
      step(b, dt);
      return true;
    }
    b.route = [];
    face(b, d.x, d.z);
    Net.send({ type: 'door', playerId: b.id, doorId: d.id, shut: true });
    return false;
  }
  // a room with one door, and that door open: somewhere a door makes private
  function oneDoorRoom(roomId) {
    if (!roomId || !CastleLayout.SEALABLE.has(roomId)) return null;
    const ds = CastleLayout.doorsOf(roomId);
    return ds.length === 1 && !shutDoors()[ds[0].id] ? ds[0] : null;
  }

  function step(b, dt, speed) {
    if (!b.route.length) return true;
    const shut = doorAhead(b);
    if (shut) { openDoor(b, shut, dt); return false; }
    const t = b.route[0];
    const dx = t.x - b.x, dz = t.z - b.z;
    const d = Math.hypot(dx, dz);
    const mv = (speed || b.speed) * dt;
    if (d <= mv) { b.x = t.x; b.z = t.z; b.route.shift(); return !b.route.length; }
    b.x += dx / d * mv; b.z += dz / d * mv;
    b.h = Math.atan2(dx, dz);
    return false;
  }

  function face(b, x, z) { b.h = Math.atan2(x - b.x, z - b.z); }

  /* A short detour between jobs, requested by the voice director. Only one
     contestant approaches at a time; they never abandon a hand-over or a
     puzzle already in progress to do it. */
  function canApproach(id) {
    const b = bots.find(b => b.id === id);
    return running && !!b && alive(id) && !bots.some(b => b.social) && !b.hold
      && !b.follow && !b.lead && !b.flee
      && !(b.plan && b.plan.kind === 'station' && b.plan.arrived);
  }

  function approach(id, targetId) {
    const b = bots.find(b => b.id === id);
    const target = Session.playerById(targetId), pose = poseOf(targetId);
    if (!canApproach(id) || !target || target.bot || !target.alive || !pose
        || Session.state.phase !== 'tasks' || distrusts(b, targetId)) return false;
    b.social = { target: targetId, expires: Date.now() + 20000, arrived: false, talkingAt: 0, spokeAt: 0, poisonDone: false };
    b.rethink = 0;
    b.wait = 0;
    goTo(b, pose.x, pose.z);
    return true;
  }

  function endVisit(b) {
    b.social = null;
    b.route = [];
    b.rethink = 0;
    if (b.plan && b.plan.kind === 'station' && !b.plan.arrived) goTo(b, b.plan.sx, b.plan.sz);
  }

  function visit(b, dt, v, t) {
    const social = b.social, to = poseOf(social.target);
    if (!to || !alive(social.target) || Date.now() >= social.expires
        || (typeof Scenes !== 'undefined' && Scenes.botSpeechBlocked)) { endVisit(b); return; }
    const d = Math.hypot(to.x - b.x, to.z - b.z);
    // If somebody walks away, let them go rather than following them all day.
    if (social.arrived && d > 4) { endVisit(b); return; }
    if (social.shutDoor) {
      if (shutBehind(b, dt, social.shutDoor.id, social.shutDoor.room)) return;
      social.shutDoor = null;
    }
    if (d > 1.65) {
      if ((b.rethink -= dt) <= 0 || !b.route.length) { goTo(b, to.x, to.z); b.rethink = 1; }
      step(b, dt);
      return;
    }
    /* Just the two of them in a room with one door: half the time, a
       word in private — the AI shuts the door before it says anything. */
    if (!social.doorTried) {
      social.doorTried = true;
      const here = roomOfBot(b);
      const alone = here && to.room === here && !Session.alive()
        .some(p => p.id !== b.id && p.id !== social.target && (poseOf(p.id) || {}).room === here);
      const door = alone ? oneDoorRoom(here) : null;
      if (door && rng() < 0.5) social.shutDoor = { id: door.id, room: here };
    }
    if (social.shutDoor) return;
    b.route = [];
    face(b, to.x, to.z);
    if (!social.arrived) { social.arrived = true; social.expires = Date.now() + 16000; }
    if (!social.talkingAt && typeof AIDirector !== 'undefined'
        && AIDirector.startEncounter(b.id, social.target, () => {
          if (b.social === social) social.spokeAt = Date.now();
        })) social.talkingAt = Date.now();

    // A chat is cover, not a free kill: the carrier must still get close,
    // reach for the full hold time, and respect the usual witnesses.
    const carrier = v.poison && v.poison.mine && !v.poison.used;
    const faithful = (v.partners || []).indexOf(social.target) < 0;
    if (social.spokeAt && Date.now() - social.spokeAt > 1500 && carrier && faithful
        && !social.poisonDone && !shielded(social.target) && (elapsed() > b.stalkAfter || t < 75)) {
      if (!b.plan || b.plan.kind !== 'poison' || b.plan.target !== social.target) {
        b.plan = { kind: 'poison', target: social.target, wait: 0 };
      }
      chase(b, dt, t);
    }
  }

  /* ---------------- company ----------------
     Asked along, an AI walks a step or two behind whoever asked: close
     up through a doorway, so it is through before the door can shut
     behind them, and never stopping in one, so the door can shut at all.
     Asking for a private word, it goes the other way — leads them to a
     room with one door, waits inside for them, and shuts it. */

  const botById = (id) => bots.find(b => b.id === id) || null;
  function isWary(b, id) { const until = b.wary.get(id); return !!until && until > Date.now(); }
  // the director keeps the read on everybody; without it nobody is suspected
  const distrusts = (b, id) => isWary(b, id)
    || (typeof AIDirector !== 'undefined' && !!AIDirector.distrusts && AIDirector.distrusts(b.id, id));
  function tell(kind, b, other) {
    if (typeof AIDirector === 'undefined' || !AIDirector.moved) return;
    try { AIDirector.moved(kind, b.id, other); } catch (e) { console.warn('castle bot:', e); }
  }
  function inAnyDoorway(x, z) {
    for (const d of CastleLayout.DOORS) {
      const q = CastleLayout.doorBox(d, 0.32);
      if (x > q.x0 - 0.25 && x < q.x1 + 0.25 && z > q.z0 - 0.25 && z < q.z1 + 0.25) return true;
    }
    return false;
  }
  // whatever it was doing, it is doing this instead: the job is picked again after
  function dropEverything(b) {
    b.social = null; b.follow = null; b.lead = null;
    b.hold = 0; b.g = null; b.plan = null;
    b.route = []; b.wait = 0; b.rethink = 0;
  }
  const canKeepCompany = (b, otherId) => {
    const p = Session.playerById(otherId);
    return running && !!b && alive(b.id) && !!p && p.alive && p.id !== b.id && !!poseOf(otherId)
      && Session.state.phase === 'tasks' && !b.flee;
  };

  function follow(id, leaderId, secs) {
    const b = botById(id);
    if (!canKeepCompany(b, leaderId)) return false;
    if (b.follow && b.follow.leader === leaderId) { b.follow.until = Date.now() + (secs || FOLLOW_SECS) * 1000; return true; }
    dropEverything(b);
    b.follow = { leader: leaderId, since: Date.now(), until: Date.now() + (secs || FOLLOW_SECS) * 1000, rethink: 0 };
    return true;
  }

  function unfollow(id) {
    const b = botById(id);
    if (!b || (!b.follow && !b.lead)) return false;
    b.follow = null; b.lead = null; b.route = []; b.rethink = 0;
    return true;
  }

  function tail(b, dt, v, t) {
    const f = b.follow, to = poseOf(f.leader);
    if (!to || !alive(f.leader) || Date.now() >= f.until) { b.follow = null; b.route = []; return; }
    const d = Math.hypot(to.x - b.x, to.z - b.z);
    if (d > 32) { b.follow = null; b.route = []; tell('lost', b, f.leader); return; }
    // it went along trusting them; something since has changed its mind
    if (v.role !== 'traitor' && distrusts(b, f.leader)) { flee(b.id, f.leader); tell('fled', b, f.leader); return; }
    const here = roomOfBot(b), together = !!here && here === to.room;
    // shut in somewhere with whoever it followed: a private word, now
    if (together && !f.private && CastleLayout.sealed(here, shutDoors())) { f.private = true; tell('private', b, f.leader); }
    /* The carrier, asked along by a Faithful: a quiet room is the chance
       it was waiting for. Once it is done it does not hang about. */
    const p = v.poison;
    if (p && p.used && p.target === f.leader && !f.after) { f.after = true; f.until = Math.min(f.until, Date.now() + 8000); }
    if (p && p.mine && !p.used && (v.partners || []).indexOf(f.leader) < 0 && !shielded(f.leader) && together && Date.now() - f.since > 3000
        && (CastleLayout.sealed(here, shutDoors()) || elapsed() > b.stalkAfter || t < 75)) {
      if (!b.plan || b.plan.kind !== 'poison' || b.plan.target !== f.leader) b.plan = { kind: 'poison', target: f.leader, wait: 0 };
      chase(b, dt, t);
      return;
    }
    const gap = together ? 1.6 : 0.8;
    if (d > gap + 0.4 || (inAnyDoorway(b.x, b.z) && d > 0.9)) {
      if ((f.rethink -= dt) <= 0 || !b.route.length) { goTo(b, to.x, to.z); f.rethink = 0.5; }
      step(b, dt, d > 4 ? Math.max(b.speed, 5.2) : b.speed);
      return;
    }
    b.route = [];
    face(b, to.x, to.z);
  }

  /* A room for two: one door, open, nobody else in it, not far. Where it
     is standing will do, if it already is one. */
  function privateRoom(b, otherId) {
    const busy = (room) => Session.alive().some(p => p.id !== b.id && p.id !== otherId && (poseOf(p.id) || {}).room === room);
    const here = roomOfBot(b), mine = oneDoorRoom(here);
    if (mine && !busy(here)) return { room: here, door: mine };
    let best = null;
    for (const room of CastleLayout.SEALABLE) {
      const d = oneDoorRoom(room);
      if (!d || room === 'turret' || busy(room)) continue;
      const far = Math.hypot(d.x - b.x, d.z - b.z);
      if (far < 26 && (!best || far < best.far)) best = { room, door: d, far };
    }
    return best;
  }

  function lead(id, otherId) {
    const b = botById(id);
    if (!canKeepCompany(b, otherId)) return null;
    const spot = privateRoom(b, otherId);
    if (!spot) return null;
    const n = CastleLayout.inward(spot.door, spot.room);
    let wx = spot.door.x + n.x * 2.4, wz = spot.door.z + n.z * 2.4;
    for (const k of [1.8, 1.3]) if (!free(wx, wz)) { wx = spot.door.x + n.x * k; wz = spot.door.z + n.z * k; }
    dropEverything(b);
    b.lead = { target: otherId, room: spot.room, door: spot.door.id, stage: 'go', wx, wz,
               until: Date.now() + 30000, rethink: 0, again: 0, shutFor: 0 };
    goTo(b, wx, wz);
    return spot.room;
  }

  function guide(b, dt, v, t) {
    const L = b.lead, to = poseOf(L.target);
    const done = (why) => { b.lead = null; b.route = []; if (why) tell(why, b, L.target); };
    if (!to || !alive(L.target)) return done();
    const d = Math.hypot(to.x - b.x, to.z - b.z);
    if (L.stage === 'go' || L.stage === 'wait') {
      if (Date.now() >= L.until || d > 30) return done('stood-up');
      if (L.stage === 'go') {
        // wait up for them if they fall behind
        if (d > 7 && roomOfBot(b) !== L.room) { face(b, to.x, to.z); return; }
        if (step(b, dt) || Math.hypot(L.wx - b.x, L.wz - b.z) < 0.6) { L.stage = 'wait'; b.route = []; }
        return;
      }
      // inside, clear of the door, watching for them to come in
      const door = CastleLayout.doorById(L.door);
      face(b, to.x, to.z);
      if (to.room === L.room && Math.hypot(to.x - door.x, to.z - door.z) > 1.0 && !inAnyDoorway(to.x, to.z)) L.stage = 'shut';
      return;
    }
    if (L.stage === 'shut') {
      L.shutFor += dt;
      if (shutDoors()[L.door] || L.shutFor > 5) {
        L.stage = 'talk'; L.talkAt = Date.now(); L.until = Date.now() + 45000; b.route = [];
        tell('private', b, L.target);
        return;
      }
      if ((L.again -= dt) > 0) return;
      if (!shutBehind(b, dt, L.door, L.room)) L.again = 0.8;
      return;
    }
    // the talk: stand with them; it is over when they go
    if (Date.now() >= L.until || d > 6 || (to.room !== L.room && d > 3)) return done();
    const p = v.poison;
    if (p && p.mine && !p.used && (v.partners || []).indexOf(L.target) < 0 && !shielded(L.target) && Date.now() - L.talkAt > 4000) {
      if (!b.plan || b.plan.kind !== 'poison' || b.plan.target !== L.target) b.plan = { kind: 'poison', target: L.target, wait: 0 };
      chase(b, dt, t);
      return;
    }
    if (d > 1.7) {
      if ((L.rethink -= dt) <= 0 || !b.route.length) { goTo(b, to.x, to.z); L.rethink = 0.8; }
      step(b, dt);
      return;
    }
    b.route = [];
    face(b, to.x, to.z);
  }

  /* ---------------- getting away ----------------
     A Faithful does not stand still for somebody it suspects: not while
     they reach out to it, and not shut in a room with them. It goes
     where the people are — nobody poisons anybody in a crowd — and gives
     them a wide berth for a while after. */
  function flee(id, fromId, secs) {
    const b = botById(id);
    if (!running || !b || !alive(id) || !fromId) return false;
    b.wary.set(fromId, Date.now() + 90000);
    if (b.flee && b.flee.from === fromId) return true;
    dropEverything(b);
    b.flee = { from: fromId, until: Date.now() + (secs || 20) * 1000, rethink: 0 };
    const r = refuge(b, fromId);
    if (r) goTo(b, r.x, r.z);
    return true;
  }

  function refuge(b, fromId) {
    const from = poseOf(fromId);
    const rooms = new Map();
    for (const p of Session.alive()) {
      if (p.id === b.id || p.id === fromId) continue;
      const q = poseOf(p.id);
      if (q && q.room && !(from && from.room === q.room)) rooms.set(q.room, (rooms.get(q.room) || []).concat([q]));
    }
    let best = null;
    for (const qs of rooms.values()) {
      const c = qs[0];
      const away = from ? Math.hypot(c.x - from.x, c.z - from.z) : 10;
      const score = qs.length * 6 + Math.min(away, 25);
      if (!best || score > best.score) best = { x: c.x + rng.range(-1, 1), z: c.z + rng.range(-1, 1), score };
    }
    if (best) return best;
    // nobody about: as far across the house from them as the jobs go
    let far = null;
    for (const s of Chores.STATIONS) {
      const d = from ? Math.hypot(s.x - from.x, s.z - from.z) : 0;
      if (!far || d > far.d) far = { x: s.x, z: s.z, d };
    }
    return far;
  }

  function runAway(b, dt) {
    const F = b.flee, from = poseOf(F.from);
    const d = from ? Math.hypot(from.x - b.x, from.z - b.z) : 99;
    if (Date.now() >= F.until && d > 6) { b.flee = null; b.route = []; return; }
    if (!b.route.length && d < 6 && (F.rethink -= dt) <= 0) {
      const r = refuge(b, F.from);
      if (r) goTo(b, r.x, r.z);
      F.rethink = 1.5;
    }
    step(b, dt, FLEE_SPEED);
  }

  // somebody it suspects, reaching for it or shut in a room with it
  function danger(b, v) {
    if (v.role === 'traitor' || b.flee) return null;
    const here = roomOfBot(b);
    const shutIn = !!here && CastleLayout.sealed(here, shutDoors());
    for (const p of Session.alive()) {
      if (p.id === b.id) continue;
      const q = poseOf(p.id);
      if (!q) continue;
      const reaching = q.g === b.id && Math.hypot(q.x - b.x, q.z - b.z) < 3.5;
      if ((reaching || (shutIn && q.room === here)) && distrusts(b, p.id)) return p.id;
    }
    return null;
  }

  function nextJob(b, v) {
    const jobs = (v && v.jobs) || [];
    const todo = jobs.filter(j => !j.done);
    if (!todo.length) return null;
    // the nearest station, mostly; a letter when the person is handy
    const scored = todo.map(j => {
      if (j.kind === 'letter') {
        const p = poseOf(j.target);
        return { j, d: p ? Math.hypot(p.x - b.x, p.z - b.z) + 4 : 99 };
      }
      const s = Chores.station(Chores.placeOf(j));
      return { j, d: s ? Math.hypot(s.x - b.x, s.z - b.z) : 99 };
    }).sort((x, y) => x.d - y.d);
    return rng() < 0.75 ? scored[0].j : scored[rng.int(0, scored.length - 1)].j;
  }

  /* Whoever is leading the jobs would hold the shield if the bell went
     now. A carrier with any sense picks somebody else. */
  const shielded = (id) => { const L = Session.shieldLeader ? Session.shieldLeader() : null; return !!L && L.id === id; };

  /* Who to poison: a Faithful who is on their own, or as close to it as
     anybody is right now — and not the one leading the jobs. */
  function pickVictim(b, v) {
    const partners = new Set((v && v.partners) || []);
    const cands = Session.alive().filter(p => p.id !== b.id && !partners.has(p.id));
    let best = null;
    for (const p of cands) {
      const pose = poseOf(p.id);
      if (!pose) continue;
      const company = Session.alive().filter(q => q.id !== p.id && q.id !== b.id)
        .map(q => poseOf(q.id)).filter(q => q && q.room === pose.room).length;
      const d = Math.hypot(pose.x - b.x, pose.z - b.z);
      // somebody in a room with a door that shuts is worth the walk
      const score = company * 10 + d * 0.3 + rng() * 3 - (oneDoorRoom(pose.room) ? 4 : 0) + (shielded(p.id) ? 60 : 0);
      if (!best || score < best.score) best = { id: p.id, score };
    }
    return best ? best.id : null;
  }

  function think(b, dt) {
    const v = view(b.id);
    if (!v) return;
    const poison = v.poison && v.poison.mine && !v.poison.used;
    const t = left();

    // in the middle of handing something over: stand still, keep reaching
    if (b.plan && (b.plan.kind === 'letter' || b.plan.kind === 'poison') && b.hold > 0) {
      const p = poseOf(b.plan.target);
      if (!p || !alive(b.plan.target) || Math.hypot(p.x - b.x, p.z - b.z) > Chores.REACH) {
        b.hold = 0; b.g = null; b.plan = null; return;
      }
      face(b, p.x, p.z);
      if (b.plan.kind === 'poison') {
        const eyes = CastleNet.watchers(b.id, b.plan.target).length;
        if (eyes > allowedEyes(t)) { b.hold = 0; b.g = null; b.plan.wait = rng.range(1.5, 3); b.plan.reach = false; return; }
      }
      b.hold += dt;
      if (b.hold >= Chores.HOLD) {
        const target = b.plan.target;
        if (b.social && b.plan.kind === 'poison') b.social.poisonDone = true;
        Net.send({ type: b.plan.kind === 'poison' ? 'poison' : 'handover', playerId: b.id, targetId: target });
        b.hold = 0; b.g = null; b.plan = null;
        b.wait = rng.range(0.8, 2.0);
      }
      return;
    }

    const threat = danger(b, v);
    if (threat) { flee(b.id, threat); tell('fled', b, threat); }
    if (b.flee) { runAway(b, dt); return; }
    if (b.lead) { guide(b, dt, v, t); return; }
    if (b.follow) { tail(b, dt, v, t); return; }
    if (b.social) { visit(b, dt, v, t); return; }

    if (b.wait > 0) { b.wait -= dt; return; }

    // the carrier, when it is time
    if (poison && (elapsed() > b.stalkAfter || t < 75)) {
      b.repick -= dt;
      if (!b.plan || b.plan.kind !== 'poison' || !alive(b.plan.target) || b.repick <= 0) {
        const target = pickVictim(b, v);
        if (target && !(b.plan && b.plan.kind === 'poison' && b.plan.target === target)) b.plan = { kind: 'poison', target, wait: 0 };
        b.repick = 5;
      }
      if (b.plan && b.plan.kind === 'poison') return chase(b, dt, t);
    }

    if (!b.plan) {
      const j = nextJob(b, v);
      if (!j) {
        // nothing left: drift after somebody, as people do
        const others = Session.alive().filter(p => p.id !== b.id);
        const o = others.length ? poseOf(others[rng.int(0, others.length - 1)].id) : null;
        if (o) goTo(b, o.x + rng.range(-1.5, 1.5), o.z + rng.range(-1.5, 1.5));
        b.plan = { kind: 'drift', until: rng.range(6, 12) };
        return;
      }
      if (j.kind === 'letter') b.plan = { kind: 'letter', target: j.target, job: j.id };
      else {
        const s = Chores.station(Chores.placeOf(j));
        // an errand is a moment to pick up or put down; a puzzle takes as
        // long as that kind of puzzle takes a person
        const secs = (Chores.TYPES[j.type] || {}).secs || [4.5, 8.5];
        const work = j.kind === 'carry' ? rng.range(0.8, 1.6) : rng.range(secs[0], secs[1]);
        b.plan = { kind: 'station', job: j.id, sx: s.x, sz: s.z, work, arrived: false };
        goTo(b, s.x, s.z);
      }
    }

    const p = b.plan;
    if (p.kind === 'drift') {
      step(b, dt);
      p.until -= dt;
      if (p.until <= 0) b.plan = null;
      return;
    }
    if (p.kind === 'station') {
      if (!p.arrived) {
        if (step(b, dt) || Math.hypot(p.sx - b.x, p.sz - b.z) < 0.9) { p.arrived = true; b.route = []; face(b, p.sx, p.sz); }
        return;
      }
      p.work -= dt;
      if (p.work <= 0) {
        Net.send({ type: 'chore', playerId: b.id, jobId: p.job });
        b.plan = null;
        b.wait = rng.range(0.4, 1.6);
      }
      return;
    }
    if (p.kind === 'letter') {
      const to = poseOf(p.target);
      if (!to || !alive(p.target)) { b.plan = null; return; }
      const d = Math.hypot(to.x - b.x, to.z - b.z);
      if (d < 1.3) { b.route = []; b.hold = 0.0001; b.g = p.target; face(b, to.x, to.z); return; }
      if ((b.rethink -= dt) <= 0 || !b.route.length) { goTo(b, to.x, to.z); b.rethink = 1.2; }
      step(b, dt);
    }
  }

  /* Somebody is going to see eventually. Early on, nobody may; with a
     minute to go, one may; at the bell, it does not matter any more. */
  const allowedEyes = (t) => {
    // the thresholds were written for a three-minute day; a shorter one squeezes them
    const c = Session.state && Session.state.chores;
    const k = Math.max(0.3, Math.min(1, ((c && c.seconds) || 180) / 180));
    return t < 35 * k ? 9 : t < 70 * k ? 1 : 0;
  };

  function chase(b, dt, t) {
    const p = b.plan;
    const to = poseOf(p.target);
    if (!to || !alive(p.target)) { b.plan = null; return; }
    if (p.wait > 0) { p.wait -= dt; step(b, dt); return; }
    const d = Math.hypot(to.x - b.x, to.z - b.z);
    /* Alone with them in a room with one door: shut it first, most of
       the time. Nobody outside sees through a shut door — though
       anybody who sees it shut will remember who did. */
    const here = roomOfBot(b);
    if (!p.doorTried && d < 4 && here && to.room === here) {
      p.doorTried = true;
      const door = oneDoorRoom(here);
      if (door && rng() < 0.75) p.shutDoor = door.id;
    }
    if (p.shutDoor) {
      if (shutBehind(b, dt, p.shutDoor, here)) return;
      p.shutDoor = null;
      p.wait = 0.3;
      return;
    }
    if (d < 1.35) {
      b.route = [];
      face(b, to.x, to.z);
      const eyes = CastleNet.watchers(b.id, p.target).length;
      if (eyes <= allowedEyes(t)) { b.hold = 0.0001; b.g = p.target; return; }
      // too many eyes: loiter, pretend to look at something, try again
      p.wait = rng.range(1.5, 3.5);
      return;
    }
    if ((b.rethink -= dt) <= 0 || !b.route.length) { goTo(b, to.x, to.z); b.rethink = 1.0; }
    step(b, dt);
  }

  function update(dt) {
    if (!running) return;
    const rows = [];
    for (const b of bots) {
      if (!alive(b.id)) continue;
      try { think(b, Math.min(dt, 0.1)); } catch (e) { console.warn('castle bot:', e); }
      const working = b.plan && b.plan.kind === 'station' && b.plan.arrived;
      rows.push([b.id, b.x, b.z, b.h, b.g || 0, working ? 1 : 0]);
    }
    if (rows.length && typeof CastleNet !== 'undefined') CastleNet.publishBots(rows);
  }

  const company = (id) => {
    const b = botById(id);
    if (!b) return null;
    if (b.flee) return { kind: 'flee', with: b.flee.from };
    if (b.lead) return { kind: 'lead', with: b.lead.target, room: b.lead.room, stage: b.lead.stage };
    if (b.follow) return { kind: 'follow', with: b.follow.leader };
    return null;
  };

  return { start, stop, update, path, buildGrid, free, canApproach, approach,
           follow, unfollow, lead, flee, company, wary: (id, otherId) => { const b = botById(id); return !!b && isWary(b, otherId); },
           get running() { return running; }, get bots() { return bots; } };
})();
