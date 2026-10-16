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

H.report();
