/* ------------------------------------------------------------------
   tie-draw.test.js — tied twice, the castle draws.

   The wheel of faces must run down to the near miss and stop one short
   of the pick (the cut to the pick is the hit), whatever the seed; and
   it must stay short enough to be drama, not a wait.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok } = H;

const ctx = H.load(['js/core/util.js', 'js/scenes/tie-draw.js']);
const T = ctx.TieDraw;

test('the wheel always stops one face before the pick', () => {
  let bad = 0;
  for (let seed = 1; seed < 500; seed++) {
    for (const tied of [['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
      for (const pick of tied) {
        const w = T.wheel(tied, pick, seed);
        const last = w.steps[w.steps.length - 1].id;
        if (last === pick || tied[(tied.indexOf(last) + 1) % tied.length] !== pick) bad++;
      }
    }
  }
  eq(bad, 0, 'near miss, then the pick');
});

test('it runs down: quick at first, the near miss held longest, under eight seconds', () => {
  const w = T.wheel(['a', 'b', 'c'], 'c', 42);
  const d = w.steps.map(s => s.dwell);
  ok(d[0] < 0.3, 'starts at a flicker');
  for (let i = 1; i < d.length; i++) ok(d[i] >= d[i - 1], 'never speeds up');
  eq(d[d.length - 1], 1.5, 'the near miss is held');
  ok(d.reduce((a, b) => a + b, 0) < 8, 'short enough to be drama');
  ok(w.steps.length >= 9, 'passes enough faces to feel like a wheel');
});

test('every screen spins the same wheel', () => {
  const a = T.wheel(['x', 'y'], 'y', 99), b = T.wheel(['x', 'y'], 'y', 99);
  eq(JSON.stringify(a), JSON.stringify(b));
});

H.report();
