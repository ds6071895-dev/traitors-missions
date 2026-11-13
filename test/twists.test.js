/* ------------------------------------------------------------------
   twists.test.js — the day the rules change, and what it may not leak.

   Each twist is forced (a rehearsal's lever) onto the second day of a
   seven-player game and played through the session reducer. The
   privacy half matters most: a sealed slate never reaches `state` or an
   event, a veiled role never leaves until the verdict, and the clue
   reaches its one Faithful and nobody else.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/twists.js', 'js/core/session.js'];

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
const SEVEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ id, name: id.toUpperCase() + 'nn', local: i === 0 }));
const EIGHT = SEVEN.concat([{ id: 'h', name: 'Hnn' }]);

function eyes(ctx) {
  const at = {};
  ctx.Session.state.players.forEach((p, i) => { at[p.id] = { x: i, z: 10, h: Math.PI, room: 'hall' }; });
  ctx.Session.setEyes({
    reach: (a, b) => (at[a] && at[b] ? Math.hypot(at[a].x - at[b].x, at[a].z - at[b].z) : null),
    witnesses: () => ({ ids: [], room: 'hall' }),
    presence: () => ({}),
  });
}
const S = (ctx) => ctx.Session;
const isTraitor = (ctx, id) => S(ctx).privateView(id).role === 'traitor';

function endDay(ctx) {
  clock = S(ctx).state.chores.endsAt + 50;
  S(ctx).dispatch({ type: 'tasksTick', authority: true });
}
function sleepAndWake(ctx) {
  clock += (S(ctx).nightSeconds(true) + 1) * 1000;
  S(ctx).dispatch({ type: 'nightTick', authority: true });
  clock += (S(ctx).nightSeconds(true) + 1) * 1000;
  S(ctx).dispatch({ type: 'nightTick', authority: true });
  let g = 0;
  while (S(ctx).state.phase === 'breakfast' && !S(ctx).state.breakfast.revealed && g++ < 20) S(ctx).dispatch({ type: 'breakfastNext', authority: true });
}
/* Start, and play the first day out with nobody poisoned and the table
   skipped, into the second day's castle — with `twist` forced. */
function toDayTwo(ctx, twist, players = EIGHT, seed = 41) {
  S(ctx).startParty({ seed, players, mode: 'host', rehearsal: true, forceTwist: twist });
  eyes(ctx);
  S(ctx).dispatch({ type: 'advance', authority: true });
  // a job for one Faithful, so day one has a shield
  endDay(ctx);
  sleepAndWake(ctx);
  S(ctx).dispatch({ type: 'advance', authority: true });
  const s = S(ctx).state;
  if (s.phase === 'table') { s.finale.stage = 'done'; S(ctx).dispatch({ type: 'advance', authority: true }); }
  eq(s.phase, 'tasks', 'into the second day');
  eq(s.day, 1);
}
function toTable(ctx) {
  endDay(ctx);
  sleepAndWake(ctx);
  S(ctx).dispatch({ type: 'advance', authority: true });
  const s = S(ctx).state;
  // a day with an unused poison opens on the exposure; that is its own banishment
  if (s.phase === 'table' && s.finale.stage !== 'name') s.finale.stage = 'name';
  eq(s.phase, 'table', 'to the table');
}
// everybody names `target`, who names somebody else
function voteFor(ctx, target) {
  const f = S(ctx).state.finale;
  for (const p of S(ctx).alive()) {
    const t = p.id === target ? S(ctx).alive().find(q => q.id !== p.id).id : target;
    S(ctx).dispatch({ type: 'name', playerId: p.id, targetId: t });
  }
  let g = 0;
  while (f.stage === 'names' && g++ < 20) S(ctx).dispatch({ type: 'speakName' });
}

section('twists — choosing them');

test('never the first day, never two running, never twice, about every other day', () => {
  const ctx = fresh();
  const T = ctx.Twists;
  let days = 0, hits = 0;
  for (let seed = 1; seed < 500; seed++) {
    eq(T.pick(seed, 0, {}), null, 'day one is the rules');
    const used = [];
    let yesterday = false;
    for (let d = 1; d < 7; d++) {
      const id = T.pick(seed, d, { used, yesterday });
      if (yesterday) eq(id, null, 'not two days running');
      if (id) { ok(used.indexOf(id) < 0, 'not twice'); used.push(id); hits++; }
      days++;
      yesterday = !!id;
    }
    eq(T.pick(seed, 3, { last: true }), null, 'not on the day of the last table');
  }
  const rate = hits / days;
  ok(rate > 0.25 && rate < 0.45, 'roughly every other day that may have one (' + rate.toFixed(2) + ')');
});

test('the host can switch them off', () => {
  const ctx = fresh();
  for (let seed = 1; seed < 40; seed++) {
    S(ctx).startParty({ seed, players: EIGHT, mode: 'host', twists: false });
    eq(S(ctx).state.twists, false);
  }
  toDayTwo(ctx, 'sealed');
  ok(S(ctx).state.twist && S(ctx).state.twist.id === 'sealed', 'forced on for the test');
  S(ctx).startParty({ seed: 3, players: EIGHT, mode: 'host', twists: false, rehearsal: true, forceTwist: 'sealed' });
  eyes(ctx);
  S(ctx).dispatch({ type: 'advance', authority: true });
  endDay(ctx); sleepAndWake(ctx); S(ctx).dispatch({ type: 'advance', authority: true });
  const s = S(ctx).state;
  if (s.phase === 'table') { s.finale.stage = 'done'; S(ctx).dispatch({ type: 'advance', authority: true }); }
  eq(s.twist, null, 'off is off');
});

section('twists — the rules');

test('sealed slates: no name in the state, no name on the wire, only the count', () => {
  const ctx = fresh();
  toDayTwo(ctx, 'sealed');
  toTable(ctx);
  const events = [];
  S(ctx).on('nameReveal', (e) => events.push(e));
  const target = S(ctx).alive()[2].id;
  const tallies = [];
  S(ctx).on('tally', (t) => tallies.push(t));
  for (const p of S(ctx).alive()) {
    const t = p.id === target ? S(ctx).alive().find(q => q.id !== p.id).id : target;
    S(ctx).dispatch({ type: 'name', playerId: p.id, targetId: t });
    const names = S(ctx).state.finale.names;
    ok(Object.values(names).every(v => v === 'sealed'), 'the ballot only says a slate is written');
  }
  eq(events.length, 0, 'no slate is turned');
  const s = S(ctx).state;
  eq(s.finale.stage, 'reveal', 'straight to the result');
  eq(s.finale.pending, target, 'the right one goes');
  ok(tallies[0] && tallies[0].counts[target] >= 6, 'the count is told');
  ok(Object.values(s.finale.names).every(v => v === 'sealed'), 'the ballot still holds no names');
  ok(!s.finale.namesShown.length, 'and none were shown');
});

test('veiled: the banished leave without a word, until the verdict', () => {
  const ctx = fresh();
  toDayTwo(ctx, 'veiled');
  toTable(ctx);
  const faithful = S(ctx).alive().find(p => !isTraitor(ctx, p.id));
  const reveals = [];
  S(ctx).on('reveal', (e) => reveals.push(e));
  voteFor(ctx, faithful.id);
  S(ctx).dispatch({ type: 'reveal' });
  eq(reveals[0].role, 'veiled', 'the room hears nothing');
  const b = S(ctx).state.banished.find(x => x.id === faithful.id);
  eq(b.role, 'veiled', 'the record says nothing');
  ok(!/faithful/i.test(JSON.stringify(S(ctx).state.finale.burned)), 'nor the burned list');
});

test('veiled never hides the banishment that ends the game', () => {
  const ctx = fresh();
  toDayTwo(ctx, 'veiled', SEVEN.slice(0, 6), 44);   // six: one Traitor
  toTable(ctx);
  const traitor = S(ctx).alive().find(p => isTraitor(ctx, p.id));
  if (!traitor) { ok(true, 'the traitor was exposed on day one'); return; }
  const reveals = [];
  S(ctx).on('reveal', (e) => reveals.push(e));
  voteFor(ctx, traitor.id);
  S(ctx).dispatch({ type: 'reveal' });
  eq(reveals[0].role, 'traitor', 'the last Traitor out says so');
});

test('heavy slate: the shield holder\'s name counts twice', () => {
  const ctx = fresh();
  toDayTwo(ctx, 'heavy');
  const s = S(ctx).state;
  // give one player the most jobs, so they hold the shield at the bell
  const holder = S(ctx).alive()[1];
  s.chores.done[holder.id] = 5; (s.chores.reached || (s.chores.reached = {}))[holder.id] = 10;
  toTable(ctx);
  eq(s.shield && s.shield.id, holder.id, 'they hold the shield');
  const tallies = [];
  S(ctx).on('tally', (t) => tallies.push(t));
  // the holder against everybody: 2 for X from the holder, the rest split
  const al = S(ctx).alive();
  const x = al.find(p => p.id !== holder.id), y = al.find(p => p.id !== holder.id && p.id !== x.id);
  for (const p of al) S(ctx).dispatch({ type: 'name', playerId: p.id, targetId: p.id === holder.id ? x.id : (p.id === x.id ? y.id : x.id) });
  let g = 0;
  while (s.finale.stage === 'names' && g++ < 20) S(ctx).dispatch({ type: 'speakName' });
  const plain = al.filter(p => p.id !== holder.id && p.id !== x.id).length;
  eq(tallies[0].counts[x.id], plain + 2, 'their slate is two');
});

test('a word in the ear: one Faithful, one safe name, and nobody else knows', () => {
  const ctx = fresh();
  toDayTwo(ctx, 'clue');
  const holders = S(ctx).alive().filter(p => S(ctx).privateView(p.id).clue);
  eq(holders.length, 1, 'exactly one person was told');
  const h = holders[0];
  ok(!isTraitor(ctx, h.id), 'a Faithful');
  const safe = S(ctx).privateView(h.id).clue.safeId;
  ok(safe !== h.id && !isTraitor(ctx, safe), 'and the name is a Faithful who is not them');
  eq(Object.keys(S(ctx).state.twist).sort(), ['day', 'id'], 'the public twist is only its name and day');
  ok(!('clue' in S(ctx).state), 'the state does not say who');
  for (const p of S(ctx).alive()) if (p.id !== h.id) eq(S(ctx).privateView(p.id).clue, null, p.name + ' was told nothing');
});

test('no shield: nobody is saved, however hard they worked', () => {
  const ctx = fresh();
  toDayTwo(ctx, 'noShield');
  const s = S(ctx).state;
  const worker = S(ctx).alive()[1];
  s.chores.done[worker.id] = 6;
  endDay(ctx);
  eq(s.shield, null, 'no shield today');
});

H.report();
