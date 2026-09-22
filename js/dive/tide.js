/* ------------------------------------------------------------------
   DiveTide — the three minutes, given a shape.

   The dive used to be the same thirty seconds sixty times: down, grab,
   up, and then a long float home on a surface where nothing could
   reach you and nothing happened. Two things change that, and both
   live here as pure functions of the seed and the clock:

   **The way home is the mission.** The surface is slow — the loch
   runs a chop that grows through the run — and the *floor* is fast:
   every seed cuts three tide races, lanes of water running shoreward
   along the bottom from the trench rim to the shelf. Kick down one and
   nothing in the loch is faster — a fifth to a quarter off a trench
   trip home — but all of it spent under water, loaded, on the breath
   you came up with, below the depth where the sharks stop leaving you
   alone. The chop is slower and it is safe. So every trip home is a
   route, and it is a bet about your own air.

   **The tide turns twice.** ("Still", not "slack": Slack Water is
   already a card in the deck, and the clock and the briefing must never
   use one name for two things.)
     STILL  the races barely run; learn the reef, bank what you can
     EBB    the races open, and the caves hold air — a pocket under
            every roof you can breathe in, with a shark at the door
     FLOOD  the pockets flood, the races and the chop both grow, every
            chest pays more, and the animals can taste it

   Nothing in here touches the renderer or the DOM: the mission asks
   it questions and `DiveFeedback` draws the answers, so every rule in
   this file is testable in node.
------------------------------------------------------------------ */
const DiveTide = (() => {

  const STAGES = [
    { id: 'still', name: 'Still water', from: 0,
      race: 0.25, chop: 0.45, pockets: false, pay: 1.00, din: 0.00,
      title: 'STILL WATER', line: 'Learn the reef. The races are barely running' },
    { id: 'ebb', name: 'The ebb', from: 1 / 3,
      race: 1.00, chop: 1.00, pockets: true, pay: 1.00, din: 0.15,
      title: 'THE EBB', line: 'The races are running home along the floor, and the caves are holding air' },
    { id: 'flood', name: 'The flood', from: 2 / 3,
      race: 1.45, chop: 1.60, pockets: false, pay: 1.35, din: 0.40,
      title: 'THE FLOOD', line: 'Every chest is worth more. The caves are flooding, and the loch can taste it' },
  ];

  const RACE = {
    lanes: 3,
    speed: 7.5,         // m/s of water, at full strength
    half: 5.0,          // metres either side of the line at full strength...
    edge: 11.0,         // ...fading to nothing by here
    fromDepth: 4.0,     // the surface does not run: it starts this far down...
    fullDepth: 8.0,     // ...and is at full strength by here
    inner: 0.26,        // the shoreward end, as a fraction of the reef radius
    outer: 0.97,        // the seaward end
  };

  /* Which stage the clock is in. `runTime` is the mission's own, so a
     card that changes the length of a run moves the tide with it. */
  function stageAt(elapsed, runTime = 180) {
    const f = runTime > 0 ? elapsed / runTime : 0;
    let s = STAGES[0];
    for (const st of STAGES) if (f >= st.from) s = st;
    return s;
  }

  /* The races, drawn from the seed and never from the geometry, so all
     three clients agree on them without a byte on the wire. They start
     on the seaward half-turn — the one `_spawnChest` draws from — and
     run straight at the shore. */
  function build(seed, radius, shoreAng) {
    const rng = U.makeRng(((seed >>> 0) ^ 0x51ed27) >>> 0);
    const sea = shoreAng + Math.PI;
    const lanes = [];
    for (let i = 0; i < RACE.lanes; i++) {
      const a = sea + (i - (RACE.lanes - 1) / 2) * 0.95 + (rng() - 0.5) * 0.4;
      const ox = Math.sin(a), oz = Math.cos(a);
      const r0 = radius * RACE.inner, r1 = radius * RACE.outer;
      const lane = {
        x0: ox * r1, z0: oz * r1,        // seaward end: where you join it
        x1: ox * r0, z1: oz * r0,        // shoreward end: where it lets go
      };
      const dx = lane.x1 - lane.x0, dz = lane.z1 - lane.z0;
      lane.len = Math.hypot(dx, dz);
      lane.dx = dx / lane.len; lane.dz = dz / lane.len;
      lanes.push(lane);
    }
    return { lanes, radius };
  }

  /* How much of lane `l` a point is in, 0..1, and how far along it. */
  function _laneAt(l, x, z) {
    const px = x - l.x0, pz = z - l.z0;
    const along = px * l.dx + pz * l.dz;
    if (along < -RACE.edge || along > l.len + RACE.edge) return 0;
    const off = Math.abs(px * -l.dz + pz * l.dx);
    const across = 1 - U.smoothstep(RACE.half, RACE.edge, off);
    const ends = U.smoothstep(-RACE.edge, 4, along) * (1 - U.smoothstep(l.len - 6, l.len + RACE.edge, along));
    return across * ends;
  }

  /* The water's own velocity at a point, written into `out`. The
     swimmer's drag works on its speed *through* the water, so a diver
     who stops kicking in a race goes where the race goes — which is the
     whole of how riding one feels. Zero at the surface, by design. */
  function currentAt(t, stage, x, y, z, surfaceY, out) {
    out.x = 0; out.y = 0; out.z = 0; out.k = 0;
    if (!t || !stage || stage.race <= 0) return out;
    const depth = surfaceY - y;
    const dg = U.smoothstep(RACE.fromDepth, RACE.fullDepth, depth);
    if (dg <= 0) return out;
    for (const l of t.lanes) {
      const k = _laneAt(l, x, z) * dg;
      if (k <= 0) continue;
      const s = k * RACE.speed * stage.race;
      out.x += l.dx * s; out.z += l.dz * s;
      out.k = Math.max(out.k, k);
    }
    return out;
  }

  /* The air under a roof. Inside the middle half of a chamber, while
     the ebb holds, the water stops a little short of the rock and there
     is a flat surface up there you can put your head through. It is
     reported as a *surface*, so the swimmer breathes, floats and gasps
     exactly as it does in the open — nothing in the physics had to
     learn what a pocket is. */
  const POCKET_R = 0.5;          // fraction of the chamber's radius that holds air
  function pocketAt(caves, stage, x, z) {
    if (!caves || !stage || !stage.pockets) return null;
    for (const s of caves.list) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz >= (s.R * POCKET_R) ** 2) continue;
      return pocketY(s);
    }
    return null;
  }
  /* The roof at the pocket's own edge, less a hand's width of air —
     off the same dome `ReefKit.buildCaves` places its rock against, so
     the pocket can never poke through the lid it is under. */
  const pocketY = (s) => s.floorY + s.H * ReefKit.CAVE_ROOF(POCKET_R) - 0.7;

  return { STAGES, RACE, POCKET_R, stageAt, build, currentAt, pocketAt, pocketY };
})();
