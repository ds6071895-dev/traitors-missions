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
   host's scene already has.
------------------------------------------------------------------ */
const CastleBots = (() => {

  const CELL = 0.5;
  const X0 = -23, X1 = 27, Z0 = -27, Z1 = 20;
  const NX = Math.round((X1 - X0) / CELL), NZ = Math.round((Z1 - Z0) / CELL);
  const SPEED = 3.4;

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
    const open = [start];
    const inOpen = new Uint8Array(NX * NZ);
    g[start] = 0; inOpen[start] = 1;
    const h = (n) => Math.hypot((n % NX) - b[0], Math.floor(n / NX) - b[1]);
    const f = new Float32Array(NX * NZ).fill(Infinity);
    f[start] = h(start);
    let guard = 0;
    while (open.length && guard++ < 20000) {
      let bi = 0;
      for (let j = 1; j < open.length; j++) if (f[open[j]] < f[open[bi]]) bi = j;
      const cur = open[bi];
      open[bi] = open[open.length - 1]; open.pop(); inOpen[cur] = 0;
      if (cur === goal) break;
      const ci = cur % NX, ck = Math.floor(cur / NX);
      for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
        if (!di && !dk) continue;
        const ni = ci + di, nk = ck + dk;
        if (!ok(ni, nk)) continue;
        if (di && dk && (!ok(ci + di, ck) || !ok(ci, ck + dk))) continue;   // no squeezing past a corner
        const n = ni + nk * NX;
        const cost = g[cur] + (di && dk ? 1.414 : 1);
        if (cost < g[n]) {
          g[n] = cost; came[n] = cur; f[n] = cost + h(n);
          if (!inOpen[n]) { open.push(n); inOpen[n] = 1; }
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

  function clear(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(d / 0.25);
    for (let s = 1; s < n; s++) {
      const x = a.x + (b.x - a.x) * s / n, z = a.z + (b.z - a.z) * s / n;
      const [i, k] = cellOf(x, z);
      if (!ok(i, k)) return false;
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
               g: null, hold: 0, social: null, stalkAfter: rng.range(28, 55), rethink: 0, repick: 0, speed: SPEED * rng.range(0.9, 1.1) };
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

  function step(b, dt) {
    if (!b.route.length) return true;
    const t = b.route[0];
    const dx = t.x - b.x, dz = t.z - b.z;
    const d = Math.hypot(dx, dz);
    const mv = b.speed * dt;
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
      && !(b.plan && b.plan.kind === 'station' && b.plan.arrived);
  }

  function approach(id, targetId) {
    const b = bots.find(b => b.id === id);
    const target = Session.playerById(targetId), pose = poseOf(targetId);
    if (!canApproach(id) || !target || target.bot || !target.alive || !pose
        || Session.state.phase !== 'tasks') return false;
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
    if (d > 1.65) {
      if ((b.rethink -= dt) <= 0 || !b.route.length) { goTo(b, to.x, to.z); b.rethink = 1; }
      step(b, dt);
      return;
    }
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
        && !social.poisonDone && (elapsed() > b.stalkAfter || t < 75)) {
      if (!b.plan || b.plan.kind !== 'poison' || b.plan.target !== social.target) {
        b.plan = { kind: 'poison', target: social.target, wait: 0 };
      }
      chase(b, dt, t);
    }
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

  /* Who to poison: a Faithful who is on their own, or as close to it as
     anybody is right now. */
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
      const score = company * 10 + d * 0.3 + rng() * 3;
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
        // an errand is a moment to pick up or put down; a puzzle takes a while
        const work = j.kind === 'carry' ? rng.range(0.8, 1.6) : rng.range(4.5, 8.5);
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
      rows.push([b.id, b.x, b.z, b.h, b.g || 0]);
    }
    if (rows.length && typeof CastleNet !== 'undefined') CastleNet.publishBots(rows);
  }

  return { start, stop, update, path, buildGrid, free, canApproach, approach,
           get running() { return running; }, get bots() { return bots; } };
})();
