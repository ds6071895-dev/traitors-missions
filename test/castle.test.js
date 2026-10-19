/* ------------------------------------------------------------------
   castle.test.js — the house by day: who can see what, and how the AI
   contestants get about.

   Three things the plain-sight murder rests on. A hand-over is seen by
   the people actually looking at it — in the room, facing it, near
   enough — and by nobody behind a wall. Every job in the catalogue is
   somewhere a person can walk to. And an AI contestant can walk from
   anywhere to anywhere, through the doors rather than through the
   walls.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/core/chores.js',
               'js/core/session.js', 'js/core/castle-net.js', 'js/core/castle-bots.js'];

function fresh() {
  const ctx = H.load(FILES);
  ctx.GameState.load();
  return ctx;
}

const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: id.toUpperCase(), local: i === 0 }));

function withPeople(ctx) {
  ctx.Session.startParty({ seed: 3, players: FIVE, mode: 'host' });
  ctx.CastleNet.start('d0');
  const put = (id, x, z, h) => ctx.CastleNet.publish(id, x, z, h);
  return put;
}

section('castle — the eyes');

test('people facing a hand-over in the same room see it; people with their backs to it do not', () => {
  const ctx = fresh();
  const put = withPeople(ctx);
  // a hands b something in the middle of the hall
  put('a', 0, 11, 0); put('b', 0, 12, Math.PI);
  put('c', 0, 16, Math.PI);          // further south, looking north at them
  put('d', 0, 6, Math.PI);           // to the north, looking further north: back to them
  put('e', -16, 7, 0);               // in the great hall
  const w = ctx.CastleNet.eyes.witnesses('a', 'b');
  eq(w.room, 'hall');
  eq(w.ids, ['c'], 'only the one looking');
});

test('right beside somebody, you notice whichever way you face', () => {
  const ctx = fresh();
  const put = withPeople(ctx);
  put('a', 0, 11, 0); put('b', 0.8, 11, 0);
  put('c', -0.8, 11, Math.PI);       // facing away, but at their elbow
  put('d', 0, 30, 0); put('e', 0, 30, 0);
  ok(ctx.CastleNet.eyes.witnesses('a', 'b').ids.includes('c'));
});

test('a wall is a wall; a doorway is not', () => {
  const ctx = fresh();
  const put = withPeople(ctx);
  // the hand-over just inside the hall's west door
  put('a', -6.2, 10.5, 0); put('b', -6.2, 11.3, 0);
  put('c', -8.6, 10.5, Math.PI / 2);   // in the west passage, looking east through the door
  put('d', -12, 10.5, Math.PI / 2);    // in the great hall, looking east down the passage — too far
  put('e', -16, 3, Math.PI / 2);       // in the great hall behind the wall
  const w = ctx.CastleNet.eyes.witnesses('a', 'b').ids;
  ok(w.includes('c'), 'through the doorway, close up');
  ok(!w.includes('e'), 'not through a wall');
});

test('presence says who is in which room with whom', () => {
  const ctx = fresh();
  const put = withPeople(ctx);
  put('a', 0, -22, 0); put('b', 1, -22, 0);       // the turret
  put('c', 0, 11, 0); put('d', 1, 11, 0); put('e', 16, 13.5, 0);
  const p = ctx.CastleNet.eyes.presence();
  eq([p.a.room, p.a.with], ['turret', ['b']]);
  eq([p.c.room, p.c.with.sort()], ['hall', ['d']]);
  eq([p.e.room, p.e.with], ['corridor', []]);
  ok(ctx.CastleNet.eyes.reach('a', 'b') < 1.01, 'and how far apart they are');
});

test('a pose from across the world is ignored', () => {
  const ctx = fresh();
  withPeople(ctx);
  ctx.CastleNet.publish('a', 5000, 0, 0);
  eq(ctx.CastleNet.get('a'), null);
});

section('castle — the jobs');

test('every station is on the floor plan, in the room it says it is in', () => {
  const ctx = fresh();
  for (const st of ctx.Chores.STATIONS) {
    const r = ctx.CastleLayout.roomAt(st.x, st.z);
    ok(r && r.id === st.room, st.id + ' is in ' + st.room + ', not ' + (r && r.id));
    ok(ctx.CastleLayout.walkable(st.x, st.z), st.id + ' is standing room');
    ok(ctx.Chores.TYPES[st.type], st.id + ' has a puzzle');
  }
  eq(new Set(ctx.Chores.STATIONS.map(s => s.type)).size, Object.keys(ctx.Chores.TYPES).length,
     'every kind of puzzle is somewhere in the house');
});

test('every kind of job is a puzzle you can play, and says how', () => {
  const ctx = fresh();
  const src = require('fs').readFileSync(require('path').join(H.ROOT, 'js/scenes/chore-games.js'), 'utf8');
  const body = src.slice(src.indexOf('const GAMES = {'), src.indexOf('/* A coin into the pot. */'));
  const games = new Set([...body.matchAll(/^    (\w+)\(\{[^}]*\}\) \{/gm)].map(m => m[1]));
  for (const [key, T] of Object.entries(ctx.Chores.TYPES)) {
    ok(games.has(key), key + ' has a game');
    ok(T.how && T.how.length < 120, key + ' says how, in a line');
    ok(T.goal && T.goal.split(' ').length <= 3, key + ' has a short goal');
    ok(Array.isArray(T.secs) && T.secs[0] > 0 && T.secs[1] > T.secs[0], key + ' has an AI time');
  }
  eq([...games].filter(g => !ctx.Chores.TYPES[g]), [], 'games with no job');
  ok(Object.keys(ctx.Chores.TYPES).length >= 20, 'twenty kinds of job');
});

section('castle — walking');

test('from the hall to every station, through doors', () => {
  const ctx = fresh();
  ctx.CastleBots.buildGrid([]);
  for (const st of ctx.Chores.STATIONS) {
    const route = ctx.CastleBots.path(0, 15, st.x, st.z);
    ok(route.length >= 1, st.id + ' has a route');
    let from = { x: 0, z: 15 }, len = 0;
    for (const p of route) {
      const d = Math.hypot(p.x - from.x, p.z - from.z);
      const n = Math.ceil(d / 0.2);
      for (let k = 1; k <= n; k++) {
        const x = from.x + (p.x - from.x) * k / n, z = from.z + (p.z - from.z) * k / n;
        if (!ctx.CastleLayout.walkable(x, z)) { ok(false, st.id + ': the route goes through a wall at ' + x.toFixed(1) + ',' + z.toFixed(1)); return; }
      }
      len += d; from = p;
    }
    ok(len < 120, st.id + ' is not a detour round the world: ' + len.toFixed(0) + 'm');
  }
});

test('a route goes round furniture, not through it', () => {
  const ctx = fresh();
  // the round table, solid, in the middle of its chamber
  ctx.CastleBots.buildGrid([{ x0: -2.7, x1: 2.7, z0: -8.7, z1: -3.3 }]);
  const route = ctx.CastleBots.path(0, 1, 0, -13.5);
  let from = { x: 0, z: 1 };
  for (const p of route) {
    const n = 40;
    for (let k = 1; k <= n; k++) {
      const x = from.x + (p.x - from.x) * k / n, z = from.z + (p.z - from.z) * k / n;
      ok(!(x > -2.7 && x < 2.7 && z > -8.7 && z < -3.3), 'the route crosses the table');
    }
    from = p;
  }
  ok(route.length >= 2, 'it bends');
});


section('castle — the pictures');

/* The jobs are drawn, never typed: an emoji is a different picture on
   every machine and a box on some, and the forgery is a puzzle about
   pictures that must not change between two copies of a painting. */
test('no job shows an emoji', () => {
  const fs = require('fs'), path = require('path');
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/u;
  for (const f of ['js/scenes/chore-games.js', 'js/core/chores.js', 'js/scenes/tasks.js']) {
    const lines = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      // the close button's cross is a plain typographic mark
      if (/cg-close/.test(line)) return;
      ok(!EMOJI.test(line), f + ':' + (i + 1) + ' has an emoji: ' + line.trim().slice(0, 60));
    });
  }
});

section('castle — the look');

test('nothing in the house is a flat colour: every material has a grain', () => {
  const ctx = H.load(['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/world/castle-interior.js']);
  for (const [id, m] of Object.entries(ctx.CastleInterior.MATS)) {
    ok(m.fam || m.tex || m.surf || m.book || m.plant, id + ' is textured');
  }
});

test('twice the jobs, and a day\'s list keeps to one part of the house', () => {
  const ctx = fresh(), C = ctx.Chores;
  eq(C.STATIONS.length, 88, 'eighty-eight stations');
  eq(new Set(C.STATIONS.map(s => s.id)).size, C.STATIONS.length, 'every station has its own id');
  let total = 0, n = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rng = ctx.U.makeRng(seed);
    const list = C.deal(rng, { id: 'p', seat: seed % 8 }, [], { letterChance: 0 });
    const spots = list.filter(j => j.kind === 'station').map(j => C.station(j.station));
    for (let i = 1; i < spots.length; i++) { total += Math.hypot(spots[i].x - spots[i - 1].x, spots[i].z - spots[i - 1].z); n++; }
  }
  ok(total / n < 16, 'next job is near the last: ' + (total / n).toFixed(1) + 'm on average');
});

H.report();
