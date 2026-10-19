/* ------------------------------------------------------------------
   shield.test.js — the day's hardest worker cannot be poisoned that night.

   Whoever has done the most jobs when the day ends holds the shield,
   and a tie goes to whoever got there first. If the poison went into
   them, nobody dies, breakfast says so, and the carrier is not exposed
   (they did use it). It is for that one night: the next day starts
   with nobody holding it.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/session.js'];

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

function start(ctx, players, seed) {
  ctx.Session.startParty({ seed, players, mode: 'host' });
  const at = {};
  ctx.Session.state.players.forEach((p, i) => { at[p.id] = { x: i, z: 10, room: 'hall' }; });
  ctx.Session.setEyes({
    reach: (a, b) => Math.hypot(at[a].x - at[b].x, at[a].z - at[b].z),
    witnesses: () => ({ ids: [], room: 'hall' }),
  });
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.state.phase, 'tasks', 'into the castle');
  return at;
}

const traitorsOf = (ctx) => ctx.Session.alive().filter(p => ctx.Session.privateView(p.id).role === 'traitor');
const faithfulOf = (ctx) => ctx.Session.alive().filter(p => ctx.Session.privateView(p.id).role !== 'traitor');

// one job off somebody's own list: a station in one go, an errand in two
function work(ctx, id, n = 1) {
  for (let i = 0; i < n; i++) {
    clock += 1000;
    const before = ctx.Session.state.chores.done[id] || 0;
    const job = ctx.Session.privateView(id).jobs.find(j => !j.done && (j.kind === 'station' || j.kind === 'carry'));
    ok(job, 'there is always a job to do');
    ctx.Session.dispatch({ type: 'chore', playerId: id, jobId: job.id });
    if (job.kind === 'carry') ctx.Session.dispatch({ type: 'chore', playerId: id, jobId: job.id });
    eq(ctx.Session.state.chores.done[id], before + 1, 'paid');
  }
}

function poison(ctx, at, targetId) {
  const carrier = ctx.Session._peek().carrier;
  at[targetId] = { x: at[carrier].x + 1, z: at[carrier].z, room: 'hall' };
  ctx.Session.dispatch({ type: 'poison', playerId: carrier, targetId });
  eq(ctx.Session._peek().poison && ctx.Session._peek().poison.target, targetId, 'the poison went in');
}

function endDay(ctx) {
  clock = ctx.Session.state.chores.endsAt + 50;
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
  eq(ctx.Session.state.phase, 'night', 'to bed');
}

function toBreakfast(ctx) {
  for (const t of traitorsOf(ctx)) ctx.Session.dispatch({ type: 'turretPick', playerId: t.id, kind: 'carrier', targetId: t.id });
  clock += (ctx.Session.NIGHT_SECONDS + 1) * 1000;
  ctx.Session.dispatch({ type: 'nightTick', authority: true });
  clock += (ctx.Session.NIGHT_SECONDS + 1) * 1000;
  ctx.Session.dispatch({ type: 'nightTick', authority: true });
  eq(ctx.Session.state.phase, 'breakfast', 'down to breakfast');
}

function reveal(ctx) {
  let guard = 0;
  while (!ctx.Session.state.breakfast.revealed && guard++ < 20) {
    eq(ctx.Session.state.breakfast.shielded, null, 'nobody is told whose glass it was before the end');
    ctx.Session.dispatch({ type: 'breakfastNext', authority: true });
  }
}

section('the shield');

test('most jobs leads; a tie goes to whoever got there first; nobody leads on nothing', () => {
  const ctx = fresh();
  start(ctx, SEVEN, 21);
  eq(ctx.Session.shieldLeader(), null, 'no jobs, no shield');
  work(ctx, 'c', 2);
  work(ctx, 'd', 2);
  eq(ctx.Session.shieldLeader().id, 'c', 'tied on two: c got there first');
  work(ctx, 'd');
  eq(ctx.Session.shieldLeader().id, 'd', 'd goes ahead');
  eq(ctx.Session.shieldLeader().n, 3, 'with the count');
  endDay(ctx);
  eq(ctx.Session.state.shield.id, 'd', 'and holds it at the bell');
  eq(ctx.Session.state.shield.day, 0, 'for tonight');
  ctx.Session.abandon();
});

test('the poison in the shield holder does not take, and breakfast says so', () => {
  const ctx = fresh();
  const at = start(ctx, SEVEN, 22);
  const holder = faithfulOf(ctx)[0];
  work(ctx, holder.id, 3);
  poison(ctx, at, holder.id);
  endDay(ctx);
  eq(ctx.Session.privateView(holder.id).fate, null, 'no letter under their door');
  eq(ctx.Session._peek().victim, null, 'nobody dies tonight');
  toBreakfast(ctx);
  reveal(ctx);
  const b = ctx.Session.state.breakfast;
  eq(b.victim, null, 'no body');
  eq(b.shielded, holder.id, 'whose glass it was in');
  eq(b.shieldName, holder.name, 'by name');
  ok(ctx.Session.playerById(holder.id).alive, 'they are at the table');
  eq(ctx.Session.state.murdered.length, 0, 'nobody murdered');
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.state.phase, 'table', 'to the round table');
  ctx.Session.dispatch({ type: 'expose', authority: true });
  eq(ctx.Session.state.exposure.playerId, null, 'the carrier used it: nobody is exposed');
  ctx.Session.abandon();
});

test('the shield protects only its holder', () => {
  const ctx = fresh();
  const at = start(ctx, SEVEN, 23);
  const [holder, victim] = faithfulOf(ctx);
  work(ctx, holder.id, 3);
  work(ctx, victim.id, 1);
  poison(ctx, at, victim.id);
  endDay(ctx);
  eq(ctx.Session.state.shield.id, holder.id, 'the holder');
  eq(ctx.Session.privateView(victim.id).fate, 'murdered', 'the poisoned die as ever');
  toBreakfast(ctx);
  reveal(ctx);
  eq(ctx.Session.state.breakfast.victim, victim.id, 'and are found missing');
  eq(ctx.Session.state.breakfast.shielded, null, 'the shield did nothing');
  ctx.Session.abandon();
});

test('it is for one night: the next day starts with nobody holding it', () => {
  const ctx = fresh();
  const at = start(ctx, SEVEN, 24);
  const [holder, other] = faithfulOf(ctx);
  work(ctx, holder.id, 3);
  endDay(ctx);
  eq(ctx.Session.state.shield.id, holder.id, 'holds it tonight');
  toBreakfast(ctx);
  reveal(ctx);
  ctx.Session.dispatch({ type: 'advance', authority: true });
  // banish a Faithful who is neither, and on to the next day
  const out = faithfulOf(ctx).find(p => p.id !== holder.id && p.id !== other.id);
  for (const p of ctx.Session.alive()) {
    ctx.Session.dispatch({ type: 'name', playerId: p.id, targetId: p.id === out.id ? holder.id : out.id });
  }
  let guard = 0;
  while (ctx.Session.state.finale.stage === 'names' && guard++ < 20) ctx.Session.dispatch({ type: 'speakName' });
  ctx.Session.dispatch({ type: 'reveal' });
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.state.phase, 'tasks', 'another day');
  eq(ctx.Session.state.shield, null, 'nobody holds it any more');
  // yesterday's holder, poisoned today while somebody else leads, dies
  work(ctx, other.id, 2);
  work(ctx, holder.id, 1);
  poison(ctx, at, holder.id);
  endDay(ctx);
  eq(ctx.Session.state.shield.id, other.id, 'a new holder');
  eq(ctx.Session.privateView(holder.id).fate, 'murdered', 'and last night\'s shield is gone');
  ctx.Session.abandon();
});

test('a guest sees the shield in the shared state, and nothing before breakfast says who was poisoned', () => {
  const ctx = fresh();
  const at = start(ctx, SEVEN, 25);
  const holder = faithfulOf(ctx)[0];
  work(ctx, holder.id, 2);
  poison(ctx, at, holder.id);
  endDay(ctx);
  const snap = ctx.Session.snapshot();
  eq(snap.shield.id, holder.id, 'the holder is public');
  ok(!JSON.stringify(snap).includes('shieldHeld'), 'whether it was used is not');
  toBreakfast(ctx);
  const b = ctx.Session.snapshot().breakfast;
  ok(b.shielded === null && b.shieldName === null, 'not even at breakfast, until the reveal');
  ctx.Session.abandon();
});

H.report();
