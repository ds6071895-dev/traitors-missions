/* ------------------------------------------------------------------
   shootout-rounds.js — what a round of the Shootout actually is.

   A round is data: what comes, how it is put into the air, how long you
   get, and one rule that bends the scoring. The mission owns the spawn
   *modes* (a sweep across the trees, a rise out of the undergrowth, a
   volley launched off the treeline) because those need the world; a
   round only picks one and hands it numbers.

   A run draws its rounds from here by tier, so the ten you get are
   never the ten someone else got — but they always start gently, always
   pay out somewhere in the middle, and always end with the owl.
------------------------------------------------------------------ */
const ShootoutRounds = (() => {

  /* tier 0 = opener, 1 = the body of the run, 2 = late and nasty.
     `kind` is what the schedule uses: normal, bonus or boss. */

  const ROUNDS = [
    {
      id: 'first-light', name: 'First Light', tier: 0, kind: 'normal',
      blurb: 'Ravens over the clearing. Get your eye in.',
      duration: 22, count: 8, interval: [1.25, 1.7], batch: [1, 1],
      spawn: { mode: 'sweep', types: ['raven'], behaviour: 'cruise',
               dist: [58, 84], height: [16, 26], arc: 1.5, speed: 0.85, curve: 0.06 },
      guards: 0,
    },
    {
      id: 'dawn-flight', name: 'Dawn Flight', tier: 1, kind: 'normal',
      blurb: 'More of them, further out, and not all of them are ravens.',
      duration: 24, count: 12, interval: [0.9, 1.35], batch: [1, 2],
      spawn: { mode: 'sweep', types: ['raven', 'raven', 'messenger'], behaviour: 'cruise',
               dist: [70, 115], height: [18, 34], arc: 2.1, speed: 1, curve: 0.1 },
      guards: 0.18,
    },
    {
      id: 'lantern-vigil', name: 'Lantern Vigil', tier: 0, kind: 'normal',
      blurb: 'Lanterns going up, doves going across. Only one of those is yours.',
      duration: 24, count: 12, interval: [1.0, 1.5], batch: [1, 2],
      spawn: { mode: 'rise', types: ['lantern'], behaviour: 'drift',
               dist: [40, 95], height: [2, 6], arc: 2.6, speed: 1 },
      guards: 0.34,
      rule: { guardHeavy: true },
    },
    {
      id: 'clay-volley', name: 'Clay Volley', tier: 1, kind: 'normal',
      blurb: 'Launched in pairs off the treeline. Lead them or lose them.',
      duration: 22, count: 14, interval: [1.5, 1.9], batch: [2, 2],
      spawn: { mode: 'launch', types: ['clay'], behaviour: 'arc',
               dist: [95, 130], height: [8, 14], arc: 0.9, speed: 1 },
      guards: 0,
      rule: { pierceDouble: true },
    },
    {
      id: 'bat-hollow', name: 'Bat Hollow', tier: 2, kind: 'normal',
      blurb: 'Small, close and completely unpredictable.',
      duration: 22, count: 14, interval: [0.85, 1.2], batch: [1, 2],
      spawn: { mode: 'sweep', types: ['bat'], behaviour: 'zigzag',
               dist: [38, 62], height: [12, 24], arc: 3.0, speed: 1 },
      guards: 0,
    },
    {
      id: 'wasp-nest', name: 'Wasp Nest', tier: 2, kind: 'normal',
      blurb: 'They are coming for you, and one that lands costs you seconds.',
      duration: 26, count: 11, interval: [1.5, 2.0], batch: [1, 2],
      spawn: { mode: 'swarm', types: ['wasp'], behaviour: 'dive',
               dist: [70, 95], height: [12, 24], arc: 2.4, speed: 0.8 },
      guards: 0,
      rule: { sting: true, pierceDouble: true },
    },
    {
      id: 'migration', name: 'Migration', tier: 1, kind: 'normal',
      blurb: 'Geese in a V. Take the leader and the shape falls apart.',
      duration: 24, count: 12, interval: [3.4, 4.2], batch: [4, 5],
      spawn: { mode: 'formation', types: ['goose'], behaviour: 'cruise',
               dist: [90, 130], height: [26, 40], arc: 1.2, speed: 1 },
      guards: 0.1,
    },
    {
      id: 'night-post', name: 'The Night Post', tier: 2, kind: 'normal',
      blurb: 'Messengers running the wood. Every one you drop lets go of a scroll — '
           + 'shoot that too, before it lands.',
      duration: 24, count: 10, interval: [1.6, 2.1], batch: [1, 2],
      spawn: { mode: 'sweep', types: ['messenger'], behaviour: 'cruise',
               dist: [80, 120], height: [22, 36], arc: 1.8, speed: 1.15, curve: 0.14 },
      guards: 0.2,
    },
    {
      id: 'moth-hour', name: 'Moth Hour', tier: 2, kind: 'normal',
      blurb: 'Tiny, slow and worth a fortune. No excuse for missing one.',
      duration: 22, count: 11, interval: [1.2, 1.6], batch: [1, 2],
      spawn: { mode: 'sweep', types: ['moth'], behaviour: 'zigzag',
               dist: [34, 58], height: [10, 20], arc: 3.0, speed: 0.8 },
      guards: 0,
    },
    {
      id: 'trick-shots', name: 'Trick Shots', tier: 2, kind: 'normal',
      blurb: 'Only a clean loose counts. A soft arrow goes straight through them.',
      duration: 24, count: 9, interval: [1.7, 2.2], batch: [1, 1],
      spawn: { mode: 'orbit', types: ['raven'], behaviour: 'circle',
               dist: [46, 72], height: [18, 30], arc: 6.28, speed: 1 },
      guards: 0,
      rule: { cleanOnly: true, valueMult: 2.4 },
    },
    {
      id: 'crossfire', name: 'Crossfire', tier: 2, kind: 'normal',
      blurb: 'Two flights, opposite sides. You cannot watch both.',
      duration: 24, count: 16, interval: [1.1, 1.5], batch: [2, 2],
      spawn: { mode: 'cross', types: ['raven', 'bat'], behaviour: 'cruise',
               dist: [60, 100], height: [16, 32], arc: 1.1, speed: 1.05, curve: 0.08 },
      guards: 0.15,
    },
    {
      id: 'long-flight', name: 'Long Flight', tier: 2, kind: 'normal',
      blurb: 'Right out over the treeline. Aim where they are going to be.',
      duration: 24, count: 11, interval: [1.4, 1.9], batch: [1, 2],
      spawn: { mode: 'sweep', types: ['raven', 'goose'], behaviour: 'cruise',
               dist: [140, 190], height: [34, 52], arc: 1.6, speed: 1.35 },
      guards: 0.1,
      rule: { valueMult: 1.6 },
    },
    {
      id: 'the-hunt', name: 'The Hunt', tier: 1, kind: 'normal',
      blurb: 'Everything the wood has, all at once.',
      duration: 24, count: 15, interval: [0.95, 1.3], batch: [1, 2],
      spawn: { mode: 'sweep', types: ['raven', 'bat', 'lantern', 'clay', 'messenger'],
               behaviour: 'cruise', dist: [50, 110], height: [14, 34], arc: 3.0, speed: 1 },
      guards: 0.22,
    },

    /* ---- the pause that pays ---- */
    {
      id: 'gilded', name: 'The Gilded Raven', tier: 1, kind: 'bonus',
      blurb: 'One bird. Nine seconds. Do not miss.',
      duration: 9.5, count: 1, interval: [9, 9], batch: [1, 1],
      spawn: { mode: 'orbit', types: ['gilded'], behaviour: 'circle',
               dist: [44, 60], height: [20, 30], arc: 6.28, speed: 1 },
      guards: 0,
      rule: { bonus: true, noChainBreak: true },
    },
    {
      id: 'flurry', name: 'Lantern Flurry', tier: 1, kind: 'bonus',
      blurb: 'Everything in the sky is yours. Empty the quiver.',
      duration: 12, count: 26, interval: [0.28, 0.45], batch: [1, 2],
      spawn: { mode: 'rise', types: ['lantern'], behaviour: 'drift',
               dist: [30, 80], height: [2, 8], arc: 6.28, speed: 1.4 },
      guards: 0,
      rule: { bonus: true, noChainBreak: true, valueMult: 0.85 },
    },

    /* ---- and the thing at the end of it ---- */
    {
      id: 'great-owl', name: 'The Great Owl', tier: 2, kind: 'boss',
      blurb: 'It has the lantern, it has the eyes, and it has a temper. '
           + 'Three fights in one bird.',
      duration: 130, count: 1, interval: [99, 99], batch: [1, 1],
      // close enough that it is the thing you are looking at, not a
      // shape over the far treeline
      spawn: { mode: 'boss', types: ['owl'], behaviour: 'bossCircle',
               dist: [72, 72], height: [34, 34], arc: 0, speed: 1 },
      guards: 0,
      rule: { boss: true },
    },
  ];

  const byId = (id) => ROUNDS.find(r => r.id === id) || null;
  const ofKind = (kind) => ROUNDS.filter(r => r.kind === kind);

  /* -------- the schedule --------
     Ten rounds: a gentle opener, a body drawn by tier so the run gets
     harder as it goes, a bonus round somewhere in the middle, and the
     owl at the end. Everything is drawn from the seed, so "Rowan Deep,
     8812" is one specific run and not a genre. */

  function schedule(seed, opts = {}) {
    const rng = U.makeRng((seed ^ 0x6b43a9c5) >>> 0);
    const length = opts.length || 10;
    const pool = ofKind('normal').slice();
    const out = [];

    // opener: always a tier 0
    const openers = pool.filter(r => r.tier === 0);
    const first = openers[(rng() * openers.length) | 0];
    out.push(first);
    pool.splice(pool.indexOf(first), 1);

    // body: bias towards higher tiers as the run goes on, without ever
    // repeating a round inside one run
    const bodyCount = length - 3;
    for (let i = 0; i < bodyCount; i++) {
      const want = i / Math.max(1, bodyCount - 1);        // 0 -> 1
      let best = null, bestScore = -1;
      for (const r of pool) {
        // a small random weight on top of the tier fit, so the same
        // seed is deterministic but the ordering is not mechanical
        const fit = 1 - Math.abs(r.tier / 2 - want);
        const score = fit * 1.6 + rng();
        if (score > bestScore) { bestScore = score; best = r; }
      }
      out.push(best);
      pool.splice(pool.indexOf(best), 1);
      if (!pool.length) break;
    }

    // the bonus goes in the middle third, where it is a breather rather
    // than a warm-up or a victory lap
    const bonuses = ofKind('bonus');
    const bonus = bonuses[(rng() * bonuses.length) | 0];
    const at = 3 + ((rng() * Math.max(1, out.length - 4)) | 0);
    out.splice(at, 0, bonus);

    out.push(byId('great-owl'));

    // difficulty ramps on top of whatever was drawn
    return out.map((r, i) => ({
      def: r,
      index: i,
      last: i === out.length - 1,
      // which quarter of the wood it comes from — a run should make you turn
      facing: rng() * Math.PI * 2,
      scale: r.kind === 'boss' ? 1 : 1 + (i / Math.max(1, out.length - 1)) * 0.55,
    }));
  }

  /* Gauntlet mode never ends, so it generates rounds on demand instead:
     draw from the whole pool, get harder forever, owl every sixth. */
  function endless(seed, index) {
    const rng = U.makeRng(((seed ^ 0x9e3779b1) + index * 2654435761) >>> 0);
    const boss = index > 0 && index % 6 === 5;
    const bonus = !boss && index > 0 && index % 4 === 3;
    const pool = boss ? ofKind('boss') : bonus ? ofKind('bonus') : ofKind('normal');
    const def = pool[(rng() * pool.length) | 0];
    return {
      def, index, last: false,
      facing: rng() * Math.PI * 2,
      scale: 1 + index * 0.16,
    };
  }

  return { ROUNDS, byId, ofKind, schedule, endless };
})();
