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

H.atest('tied once: a stand-off between the tied, then the revote', async () => {
  const people = [{ id: 'a', name: 'Isla', seat: 2 }, { id: 'b', name: 'Ross', seat: 0 }, { id: 'c', name: 'Me', seat: 1, local: true }];
  const said = [], cards = [], shots = [], acts = [];
  let released = null, ended = 0;
  const c = H.load(['js/core/util.js', 'js/scenes/tie-draw.js'], {
    Session: {
      state: { seed: 5, day: 2, finale: { nameRound: 1, tied: ['a', 'b'], lastTally: { counts: { a: 2, b: 2, c: 1 } } } },
      playerById: (id) => people.find(p => p.id === id) || null,
    },
    Scenes: {
      wait: () => Promise.resolve(),
      Cine: { card: (x) => cards.push(x) },
      Drama: {
        hush: () => Promise.resolve(), hit() {}, end() { ended++; },
        shot: (st, s) => shots.push(s),
        build: () => ({ live: true, holding: true, release: (s) => { released = s; return 0; }, cancel() {} }),
        peak: () => Promise.resolve(),
      },
    },
  });
  const scene = {
    _alive: true, music: { silence() {}, stinger() {} },
    stage: { act: (id, a) => acts.push(id + ':' + a), setMood() {} },
    _say: (set, vars) => { said.push(set + ':' + (vars.names || '')); return Promise.resolve(); },
  };
  await c.TieDraw.standoff(scene, { line: 'tableTie' });
  eq(said, ['tableTie:Ross and Isla', 'tieStandoff:Ross and Isla'], 'names the tied, in seat order');
  ok(shots.indexOf('on:b') >= 0 && shots.indexOf('on:a') >= 0, 'a cut to each tied face');
  ok(cards.some(x => x && x.title === 'A TIE' && /2 votes each/.test(x.sub)), 'A TIE, with the count');
  eq(released, 'name', 'the revote lands on a hit');
  eq(ended, 1, 'the camera is given back');
  eq(cards[cards.length - 1], null, 'and the card is cleared');
}).then(() => H.atest('split at the fire: one vote each, played long and big', async () => {
  const people = [{ id: 'a', name: 'Isla', seat: 2 }, { id: 'b', name: 'Ross', seat: 0 }, { id: 'c', name: 'Me', seat: 1, local: true }];
  const said = [], cards = [], shots = [], flares = [];
  let released = null, ended = 0;
  const c = H.load(['js/core/util.js', 'js/scenes/tie-draw.js'], {
    Session: {
      state: { seed: 5, day: 4, finale: { nameRound: 1, tied: ['a', 'b', 'c'], lastTally: { counts: { a: 1, b: 1, c: 1 } } } },
      playerById: (id) => people.find(p => p.id === id) || null,
    },
    Scenes: {
      wait: () => Promise.resolve(),
      Cine: { card: (x) => cards.push(x) },
      Drama: {
        hush: () => Promise.resolve(), hit() {}, end() { ended++; },
        shot: (st, s) => shots.push(s),
        build: () => ({ live: true, holding: true, release: (s) => { released = s; return 0; }, cancel() {} }),
        peak: () => Promise.resolve(),
      },
    },
  });
  const scene = {
    _alive: true, music: { silence() {}, stinger() {} },
    stage: { act() {}, setMood() {}, flare: (v) => flares.push(v), shake() {} },
    _say: (set, vars) => { said.push(set); return Promise.resolve(); },
  };
  await c.TieDraw.fireStandoff(scene, { line: 'voteNameTie' });
  eq(said, ['voteNameTie', 'fireTieStakes', 'fireTieFaces', 'fireTieAgain'], 'the split, the stakes, the face-off, the revote');
  ok(cards.some(x => x && x.title === 'ONE VOTE EACH'), 'ONE VOTE EACH');
  ok(cards.some(x => x && x.title === 'ROSS  vs  YOU  vs  ISLA'), 'every name on one card, in seat order');
  ok(shots.indexOf('on:a') >= 0 && shots.indexOf('on:b') >= 0 && shots.indexOf('on:c') < 0, 'a cut to each tied face but yours');
  ok(Math.min(...flares) < 0.3 && Math.max(...flares) > 1.2, 'the fire dies, then roars');
  eq(released, 'name', 'the revote lands on a hit');
  eq(ended, 1, 'the camera is given back');
  eq(cards[cards.length - 1], null, 'and the card is cleared');
})).then(() => H.report());
