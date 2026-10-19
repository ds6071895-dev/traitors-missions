/* ------------------------------------------------------------------
   doors.test.js — the big house, and the doors in it.

   A room with every door in it shut is private: nobody outside sees in,
   or hears a word, and nobody in it hears anybody outside. That rests on
   a few things being true together — the floor plan says which rooms
   can be shut up, the session keeps which doors are shut and lets only
   somebody standing at a door move it, the eyes stop at a shut door,
   and the voice routes the host hands the server put the people in a
   shut room in a world of their own.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/core/chores.js',
               'js/core/session.js', 'js/core/castle-net.js', 'js/core/castle-bots.js'];

let clock = 1.7e12;
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(clock); }
  static now() { return clock; }
}

function fresh() {
  const ctx = H.load(FILES, { Date: FakeDate });
  ctx.GameState.load();
  return ctx;
}

const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: id.toUpperCase() + 'nn', local: i === 0 }));

/* A day in the castle, with the real eyes: everybody in the hall. */
function day(ctx) {
  ctx.Session.startParty({ seed: 5, players: FIVE, mode: 'host' });
  ctx.CastleNet.start('d0');
  ctx.Session.setEyes(ctx.CastleNet.eyes);
  FIVE.forEach((p, i) => ctx.CastleNet.publish(p.id, -2 + i, 11, Math.PI));
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.state.phase, 'tasks', 'into the castle');
  return (id, x, z, h = 0) => ctx.CastleNet.publish(id, x, z, h);
}

const door = (ctx, id, shut, by) => ctx.Session.dispatch({ type: 'door', playerId: by, doorId: id, shut });

section('doors — the floor plan');

test('every door hangs in a doorway the two rooms share, and fits it', () => {
  const L = fresh().CastleLayout;
  for (const d of L.DOORS) {
    eq(d.rooms.length, 2, d.id + ' joins two rooms');
    const [a, b] = d.rooms.map(L.byId);
    ok(a && b, d.id + ': both rooms exist');
    // a step either side of the door, along its swing, is in each room
    const inA = L.roomAt(d.x + d.nx * 0.6, d.z + d.nz * 0.6), inB = L.roomAt(d.x - d.nx * 0.6, d.z - d.nz * 0.6);
    eq([inA && inA.id, inB && inB.id], d.rooms, d.id + ' swings into its room');
    ok(L.walkable(d.x + d.nx * 0.6, d.z + d.nz * 0.6) && L.walkable(d.x - d.nx * 0.6, d.z - d.nz * 0.6),
       d.id + ' can be walked through');
    ok(d.w >= 1.5 && d.w <= 2.6, d.id + ' is a door, not a gap in the wall: ' + d.w);
  }
  for (let k = 0; k < 8; k++) ok(L.doorById('bed' + k), 'the bedroom doors keep their names, for the night');
});

test('which rooms can be shut up: the ones with a door in every doorway', () => {
  const L = fresh().CastleLayout;
  for (const id of ['chapel', 'study', 'billiard', 'drawing', 'scullery', 'turret', 'bed0', 'gun', 'conservatory', 'kitchen']) {
    ok(L.SEALABLE.has(id), id + ' can be shut up');
  }
  for (const id of ['hall', 'round', 'corridor', 'gallery', 'library', 'west-passage', 'stair']) {
    ok(!L.SEALABLE.has(id), id + ' is a way through, with an archway in it');
  }
  eq(L.sealed('chapel', {}), false, 'not with its door open');
  eq(L.sealed('chapel', { chapel: 1 }), true, 'shut');
  eq(L.sealed('gun', { 'gun-n': 1 }), false, 'a room with two doors needs both shut');
  eq(L.sealed('gun', { 'gun-n': 1, 'gun-s': 1 }), true);
  eq(L.apart('chapel', 'library', { chapel: 1 }), true, 'the shut door is between them');
  eq(L.apart('chapel', 'chapel', { chapel: 1 }), false, 'the same side of it');
  eq(L.apart('library', 'hall', { chapel: 1 }), false, 'nothing to do with them');
  eq(L.apart(null, 'chapel', { chapel: 1 }), true, 'a doorway is outside');
});

test('every room is a walk from the hall', () => {
  const ctx = fresh(), L = ctx.CastleLayout;
  ctx.CastleBots.buildGrid([]);
  for (const r of L.ROOMS) {
    const x = r.shape === 'rect' ? (r.x0 + r.x1) / 2 : r.cx, z = r.shape === 'rect' ? (r.z0 + r.z1) / 2 : r.cz;
    const route = ctx.CastleBots.path(0, 15, x, z);
    const end = route[route.length - 1];
    // walked in small steps, never through a wall (no route at all is a straight line)
    let from = { x: 0, z: 15 }, through = true;
    for (const p of route) {
      const n = Math.ceil(Math.hypot(p.x - from.x, p.z - from.z) / 0.2);
      for (let k = 1; k <= n; k++) if (!L.walkable(from.x + (p.x - from.x) * k / n, from.z + (p.z - from.z) * k / n)) through = false;
      from = p;
    }
    ok(through, r.id + ' is reached through doors');
    eq(L.roomAt(end.x, end.z) && L.roomAt(end.x, end.z).id, r.id, r.id + ' is where the route ends');
  }
});

test('the house is much bigger, and the jobs are the same jobs', () => {
  const ctx = fresh(), L = ctx.CastleLayout;
  let area = 0;
  for (const r of L.ROOMS) area += r.shape === 'rect' ? (r.x1 - r.x0) * (r.z1 - r.z0) : Math.PI * r.r * r.r;
  ok(area > 2000, 'over two thousand square metres: ' + Math.round(area));
  eq(ctx.Chores.STATIONS.length, 88, 'twice the old forty-four stations');
  const rooms = new Set(ctx.Chores.STATIONS.map(s => s.room));
  for (const id of ['library', 'chapel', 'kitchen', 'scullery', 'gallery', 'billiard', 'drawing', 'study', 'gun', 'conservatory']) {
    ok(rooms.has(id), 'a job in the ' + id);
  }
});

section('doors — the session');

test('a door is shut by somebody standing at it, and opened again by anybody', () => {
  const ctx = fresh();
  const put = day(ctx);
  const d = ctx.CastleLayout.doorById('chapel');
  door(ctx, 'chapel', true, 'b');
  eq(ctx.Session.state.doors, {}, 'not from the hall');
  put('b', d.x, d.z - 1.2);                         // just inside the chapel
  const heard = [];
  ctx.Session.on('door', (e) => heard.push(e));
  door(ctx, 'chapel', true, 'b');
  eq(ctx.Session.state.doors, { chapel: 1 }, 'shut');
  eq(heard, [{ doorId: 'chapel', shut: true }], 'every screen is told which door, never who');
  put('c', d.x, d.z + 1.2);                         // in the library, at the other side of it
  door(ctx, 'chapel', false, 'c');
  eq(ctx.Session.state.doors, { chapel: 1 }, 'not twice in half a second');
  clock += 600;
  door(ctx, 'chapel', false, 'c');
  eq(ctx.Session.state.doors, {}, 'anybody can open it');
});

test('a door does not shut on somebody in the doorway, or for the dead, or for a door that is not there', () => {
  const ctx = fresh();
  const put = day(ctx);
  const d = ctx.CastleLayout.doorById('study');
  put('b', d.x + 1.0, d.z);
  put('c', d.x, d.z);                               // standing in it
  door(ctx, 'study', true, 'b');
  eq(ctx.Session.state.doors, {}, 'jammed');
  put('c', d.x - 2, d.z);
  clock += 600;
  door(ctx, 'study', true, 'b');
  eq(ctx.Session.state.doors, { study: 1 }, 'out of the way: shut');
  door(ctx, 'cellar-trapdoor', true, 'b');
  eq(Object.keys(ctx.Session.state.doors), ['study'], 'no such door');
});

test('the doors are all open again when the next day starts', () => {
  const ctx = fresh();
  const put = day(ctx);
  const d = ctx.CastleLayout.doorById('bed2');
  put('b', d.x, d.z - 1);
  door(ctx, 'bed2', true, 'b');
  eq(ctx.Session.state.doors, { bed2: 1 });
  clock = ctx.Session.state.chores.endsAt + 50;
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
  eq(ctx.Session.state.doors, {}, 'the bell opens every door');
});

test('nobody sees through a shut door, even from right beside it', () => {
  const ctx = fresh();
  const put = day(ctx);
  const d = ctx.CastleLayout.doorById('billiard');
  put('a', d.x - 0.3, d.z - 1.0, 0);                // in the billiard room, by the door
  put('b', d.x + 0.3, d.z - 1.2, 0);
  put('c', d.x, d.z + 1.4, Math.PI);                // in the gallery, looking in
  ok(ctx.CastleNet.eyes.witnesses('a', 'b').ids.includes('c'), 'through the open doorway, close up');
  door(ctx, 'billiard', true, 'a');
  eq(ctx.Session.state.doors, { billiard: 1 });
  ok(!ctx.CastleNet.eyes.witnesses('a', 'b').ids.includes('c'), 'not through the shut door');
});

test('somebody who sees a door shut writes down who shut it', () => {
  const ctx = fresh();
  const put = day(ctx);
  const d = ctx.CastleLayout.doorById('drawing');
  put('a', d.x, d.z - 1.0, Math.PI);                // inside, facing the door
  put('b', d.x + 1.0, d.z + 1.5, Math.PI);          // outside in the gallery, facing it
  put('c', 0, 11, 0);                               // the hall: saw nothing
  door(ctx, 'drawing', true, 'a');
  const seen = ctx.Session.privateView('b').notes.filter(n => n.kind === 'door');
  eq(seen.map(n => [n.who, n.room, n.shut]), [['a', 'drawing', true]], 'B saw A shut it');
  eq(ctx.Session.privateView('c').notes.filter(n => n.kind === 'door'), [], 'C did not');
});

test('behind a shut door is a note of its own', () => {
  const ctx = fresh();
  const put = day(ctx);
  const d = ctx.CastleLayout.doorById('chapel');
  put('a', d.x - 0.5, d.z - 2); put('b', d.x + 0.5, d.z - 2);
  door(ctx, 'chapel', true, 'a');
  clock += 4000;
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
  const last = ctx.Session.privateView('a').notes.slice(-1)[0];
  eq([last.room, last.ids, last.shut], ['chapel', ['b'], true], 'shut in the chapel with B');
});

section('doors — who hears whom');

test('the people in a shut room are a voice route of their own', () => {
  const ctx = fresh();
  const put = day(ctx);
  eq(ctx.Session.voiceRoutes().rooms, undefined, 'every door open: nothing to say');
  const d = ctx.CastleLayout.doorById('study'), t = ctx.CastleLayout.doorById('turret');
  put('a', d.x + 1.5, d.z); put('b', d.x + 2.5, d.z + 1);
  put('c', t.x, t.z - 1.5);
  door(ctx, 'study', true, 'a');
  door(ctx, 'turret', true, 'c');
  const r = ctx.Session.voiceRoutes();
  eq(r.rooms, [['a', 'b'], ['c']], 'the study, and the turret');
  eq(r.open.length, 5, 'still all alive');
});

section('doors — the server');

test('the server keeps a shut room\'s voices in it, both ways', async () => {
  const { createServer } = require('../server');
  const app = createServer({});
  try {
    const room = { routes: { open: ['a', 'b', 'c', 'd'], night: null, rooms: [['a', 'b']] } };
    eq(app.hears(room, 'b', 'a'), true, 'the two shut in together hear each other');
    eq(app.hears(room, 'c', 'a'), false, 'nobody outside hears in');
    eq(app.hears(room, 'a', 'c'), false, 'nobody inside hears out');
    eq(app.hears(room, 'd', 'c'), true, 'and the open house carries on');
    room.routes.open = ['a', 'b', 'c'];
    eq(app.hears(room, 'd', 'c'), true, 'the dead still hear the living outside');
    eq(app.hears(room, 'c', 'd'), false, 'and the living still do not hear the dead');
  } finally {
    await app.close();
  }
});

H.report();
