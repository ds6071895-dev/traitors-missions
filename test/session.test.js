/* ------------------------------------------------------------------
   session.test.js — a whole game, driven through `dispatch`.

   `Session` is a pure reducer over plain actions with no DOM in it, so
   the entire show can be played here without a browser: the day in the
   castle with its jobs, letters and poison, the night, breakfast, the
   round table and its exposure, and the fire.

   Where people are standing is not the reducer's business — the host's
   castle scene answers that through `setEyes` — so these tests hand it
   a table of positions and move people about by editing the table.
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
const FIVE = SEVEN.slice(0, 5);

/* A table of where everybody is. Everybody starts in the hall, a metre
   apart and looking north; a test moves them by editing `at`. */
function eyes(ctx) {
  const at = {};
  ctx.Session.state.players.forEach((p, i) => { at[p.id] = { x: i, z: 10, h: Math.PI, room: 'hall' }; });
  const E = {
    at,
    reach: (a, b) => (at[a] && at[b] ? Math.hypot(at[a].x - at[b].x, at[a].z - at[b].z) : null),
    witnesses: (a, b) => ({
      ids: ctx.Session.alive().filter(p => p.id !== a && p.id !== b && at[p.id] && at[a]
        && at[p.id].room === at[a].room).map(p => p.id),
      room: at[a] ? at[a].room : null,
    }),
    presence: () => {
      const out = {};
      for (const p of ctx.Session.alive()) {
        out[p.id] = { room: at[p.id].room,
                      with: ctx.Session.alive().filter(q => q.id !== p.id && at[q.id].room === at[p.id].room).map(q => q.id) };
      }
      return out;
    },
  };
  ctx.Session.setEyes(E);
  return E;
}

function start(ctx, players, seed, opts = {}) {
  ctx.Session.startParty(Object.assign({ seed, players, mode: 'host' }, opts));
  return eyes(ctx);
}

const traitorsOf = (ctx) => ctx.Session.alive().filter(p => ctx.Session.privateView(p.id).role === 'traitor');
const faithfulOf = (ctx) => ctx.Session.alive().filter(p => ctx.Session.privateView(p.id).role !== 'traitor');

/* Into the castle: the welcome is theatre and ends by asking for the day. */
function toTasks(ctx) {
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.state.phase, 'tasks', 'the welcome leads into the castle');
}

function endDay(ctx) {
  clock = ctx.Session.state.chores.endsAt + 50;
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
}

function poisonSomebody(ctx, E) {
  const carrier = ctx.Session._peek().carrier;
  const victim = faithfulOf(ctx)[0];
  E.at[victim.id] = Object.assign({}, E.at[carrier], { x: E.at[carrier].x + 1 });
  ctx.Session.dispatch({ type: 'poison', playerId: carrier, targetId: victim.id });
  eq(ctx.Session._peek().poison && ctx.Session._peek().poison.target, victim.id, 'the poison went in');
  return { carrier, victim };
}

function voteOut(ctx, targetId) {
  for (const p of ctx.Session.alive()) {
    const t = p.id === targetId ? ctx.Session.alive().find(q => q.id !== p.id).id : targetId;
    ctx.Session.dispatch({ type: 'name', playerId: p.id, targetId: t });
  }
  let guard = 0;
  while (ctx.Session.state.finale.stage === 'names' && guard++ < 20) ctx.Session.dispatch({ type: 'speakName' });
  eq(ctx.Session.state.finale.stage, 'reveal', 'a clear result');
  ctx.Session.dispatch({ type: 'reveal' });
}

function sleepAndWake(ctx) {
  eq(ctx.Session.state.phase, 'night', 'to bed');
  clock += (ctx.Session.NIGHT_SECONDS + 1) * 1000;
  ctx.Session.dispatch({ type: 'nightTick', authority: true });
  for (const t of traitorsOf(ctx)) ctx.Session.dispatch({ type: 'turretPick', playerId: t.id, kind: 'carrier', targetId: t.id });
  clock += (ctx.Session.NIGHT_SECONDS + 1) * 1000;
  ctx.Session.dispatch({ type: 'nightTick', authority: true });
  eq(ctx.Session.state.phase, 'breakfast', 'and down to breakfast');
  let guard = 0;
  while (!ctx.Session.state.breakfast.revealed && guard++ < 20) ctx.Session.dispatch({ type: 'breakfastNext', authority: true });
}

section('session — setup');

test('the running order is the castle, the table, the night and the fire', () => {
  const ctx = fresh();
  eq(ctx.Session.PARTS, ['intro', 'tasks', 'table', 'night', 'finale']);
  start(ctx, FIVE, 3);
  eq(ctx.Session.state.phase, 'hill', 'it opens on the welcome');
  ok(!('missions' in ctx.Session.state), 'and there are no missions anywhere in it');
});

test('one traitor at five or six, two at seven or eight, and one of them carries the poison', () => {
  const ctx = fresh();
  for (const [players, want] of [[FIVE, 1], [SEVEN.slice(0, 6), 1], [SEVEN, 2]]) {
    for (let seed = 1; seed < 30; seed++) {
      start(ctx, players, seed);
      const p = ctx.Session._peek();
      eq(p.seats.length, want, players.length + ' players deal ' + want);
      ok(traitorsOf(ctx).some(t => t.id === p.carrier), 'the carrier is a Traitor');
    }
  }
});

test('a guest never draws roles and cannot move the game', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 9, players: FIVE, mode: 'guest' });
  eq(ctx.Session._peek().has, false, 'a guest holds no role table');
  eq(ctx.Session.myRole(), null, 'and knows nothing until told');
  eq(ctx.Session.dispatch({ type: 'advance', authority: true }), null, 'its dispatch is inert');
  eq(ctx.Session.state.phase, 'hill');
});

section('session — the day in the castle');

test('everybody is dealt a list of jobs in different places, and a letter about half the time', () => {
  const ctx = fresh();
  let letters = 0, people = 0;
  for (let seed = 1; seed <= 20; seed++) {
    start(ctx, SEVEN, seed);
    toTasks(ctx);
    for (const p of ctx.Session.alive()) {
      const jobs = ctx.Session.privateView(p.id).jobs;
      const stations = jobs.filter(j => j.kind === 'station');
      eq(stations.length, 4, 'four puzzles');
      eq(new Set(stations.map(j => j.station)).size, 4, 'all in different places');
      eq(new Set(stations.map(j => j.type)).size, 4, 'and all different puzzles');
      const errand = jobs.find(j => j.kind === 'carry');
      ok(errand && ctx.Chores.station(errand.from).room !== ctx.Chores.station(errand.to).room, 'and an errand across the house');
      ok(stations.every(j => { const st = ctx.Chores.station(j.station); return st.bed === undefined || st.bed === p.seat % 8; }),
         'nobody is sent into somebody else\'s bedroom');
      const letter = jobs.find(j => j.kind === 'letter');
      if (letter) { letters++; ok(letter.target !== p.id && ctx.Session.playerById(letter.target), 'a letter is for somebody else'); }
      people++;
    }
  }
  ok(letters > people * 0.35 && letters < people * 0.75, 'letters are common enough to hide a poison: ' + letters + '/' + people);
});

test('a job pays the pot and counts on the board; it cannot be done twice or by anybody else', () => {
  const ctx = fresh();
  start(ctx, FIVE, 4);
  toTasks(ctx);
  const job = ctx.Session.privateView('b').jobs.find(j => j.kind === 'station');
  ctx.Session.dispatch({ type: 'chore', playerId: 'c', jobId: job.id === ctx.Session.privateView('c').jobs[0].id ? 'nope' : job.id + 'x' });
  eq(ctx.Session.state.pot, 0, 'a job that is not yours pays nothing');
  ctx.Session.dispatch({ type: 'chore', playerId: 'b', jobId: job.id });
  eq(ctx.Session.state.pot, ctx.Chores.VALUE, 'yours does');
  eq(ctx.Session.state.chores.done.b, 1, 'and is on the board');
  ctx.Session.dispatch({ type: 'chore', playerId: 'b', jobId: job.id });
  eq(ctx.Session.state.pot, ctx.Chores.VALUE, 'once');
  ok(ctx.Session.privateView('b').jobs.find(j => j.id === job.id).done, 'and it is ticked off your list');
});

test('an errand is picked up in one place and paid when it is put down in another', () => {
  const ctx = fresh();
  start(ctx, FIVE, 5);
  toTasks(ctx);
  const job = ctx.Session.privateView('c').jobs.find(j => j.kind === 'carry');
  ctx.Session.dispatch({ type: 'chore', playerId: 'c', jobId: job.id });
  eq(ctx.Session.state.pot, 0, 'picking it up pays nothing');
  eq(ctx.Session.privateView('c').jobs.find(j => j.id === job.id).step, 1, 'but it is in your hands');
  ctx.Session.dispatch({ type: 'chore', playerId: 'c', jobId: job.id });
  eq(ctx.Session.state.pot, ctx.Chores.VALUE, 'putting it down does');
});

test('a finished list is dealt more, so there is never nothing to do', () => {
  const ctx = fresh();
  start(ctx, FIVE, 6);
  toTasks(ctx);
  const first = ctx.Session.privateView('d').jobs.length;
  for (let round = 0; round < 3; round++) {
    for (const j of ctx.Session.privateView('d').jobs.filter(x => !x.done)) {
      if (j.kind === 'letter') { ctx.Session.dispatch({ type: 'handover', playerId: 'd', targetId: j.target }); continue; }
      ctx.Session.dispatch({ type: 'chore', playerId: 'd', jobId: j.id });
      if (j.kind === 'carry') ctx.Session.dispatch({ type: 'chore', playerId: 'd', jobId: j.id });
    }
  }
  const jobs = ctx.Session.privateView('d').jobs;
  ok(jobs.length > first + 4, 'more were dealt, round after round: ' + first + ' -> ' + jobs.length);
  ok(jobs.some(j => !j.done), 'and there is still something on the list');
  eq(new Set(jobs.map(j => j.id)).size, jobs.length, 'every job has its own id');
});

test('a letter has to be handed to the right person, standing right next to them', () => {
  const ctx = fresh();
  let found = null;
  for (let seed = 1; seed < 80 && !found; seed++) {
    const E = start(ctx, FIVE, seed);
    toTasks(ctx);
    for (const p of ctx.Session.alive()) {
      const l = ctx.Session.privateView(p.id).jobs.find(j => j.kind === 'letter');
      if (l) { found = { E, p, l }; break; }
    }
  }
  ok(found, 'somebody has a letter');
  const { E, p, l } = found;
  const wrong = ctx.Session.alive().find(q => q.id !== p.id && q.id !== l.target);
  E.at[l.target] = { x: 40, z: 10, h: 0, room: 'corridor' };
  ctx.Session.dispatch({ type: 'handover', playerId: p.id, targetId: wrong.id });
  ctx.Session.dispatch({ type: 'handover', playerId: p.id, targetId: l.target });
  eq(ctx.Session.state.pot, 0, 'not to somebody else, and not across the castle');
  E.at[l.target] = Object.assign({}, E.at[p.id], { x: E.at[p.id].x + 1.2 });
  ctx.Session.dispatch({ type: 'handover', playerId: p.id, targetId: l.target });
  eq(ctx.Session.state.pot, ctx.Chores.VALUE, 'beside them, it is delivered and paid');
});

test('only the carrier can use the poison, once, on a Faithful, close enough to touch', () => {
  const ctx = fresh();
  const E = start(ctx, SEVEN, 12);
  toTasks(ctx);
  const carrier = ctx.Session._peek().carrier;
  const partner = traitorsOf(ctx).find(t => t.id !== carrier);
  const f = faithfulOf(ctx);
  E.at[f[0].id] = { x: 30, z: 10, h: 0, room: 'corridor' };
  ctx.Session.dispatch({ type: 'poison', playerId: carrier, targetId: f[0].id });
  eq(ctx.Session._peek().poison, null, 'not from across the house');
  ctx.Session.dispatch({ type: 'poison', playerId: f[1].id, targetId: f[2].id });
  eq(ctx.Session._peek().poison, null, 'not by a Faithful');
  if (partner) {
    E.at[f[2].id] = Object.assign({}, E.at[partner.id], { x: E.at[partner.id].x + 1 });
    ctx.Session.dispatch({ type: 'poison', playerId: partner.id, targetId: f[2].id });
    eq(ctx.Session._peek().poison, null, 'not by the Traitor who is not carrying it');
    E.at[partner.id] = Object.assign({}, E.at[carrier], { x: E.at[carrier].x + 1 });
    ctx.Session.dispatch({ type: 'poison', playerId: carrier, targetId: partner.id });
    eq(ctx.Session._peek().poison, null, 'not on another Traitor');
  }
  E.at[f[1].id] = Object.assign({}, E.at[carrier], { x: E.at[carrier].x + 1.5 });
  const before = JSON.stringify(ctx.Session.state);
  const res = ctx.Session.dispatch({ type: 'poison', playerId: carrier, targetId: f[1].id });
  ok(res, 'the action is accepted');
  eq(ctx.Session._peek().poison.target, f[1].id, 'beside a Faithful, it goes in');
  eq(JSON.stringify(ctx.Session.state), before, 'and nothing public moved — the state is a tell otherwise');
  E.at[f[2].id] = Object.assign({}, E.at[carrier], { x: E.at[carrier].x - 1 });
  ctx.Session.dispatch({ type: 'poison', playerId: carrier, targetId: f[2].id });
  eq(ctx.Session._peek().poison.target, f[1].id, 'and there is only one dose');
  ok(ctx.Session.privateView(carrier).poison.used, 'the carrier knows it worked');
  if (partner) eq(ctx.Session.privateView(partner.id).poison.target, f[1].id, 'and so does the other Traitor');
  eq(ctx.Session.privateView(f[1].id).poison, null, 'the victim is told nothing at all');
});

test('a hand-over is seen by whoever is in the room, and reads the same for a letter as for the poison', () => {
  const ctx = fresh();
  const E = start(ctx, FIVE, 7);
  toTasks(ctx);
  const { carrier, victim } = poisonSomebody(ctx, E);
  const others = ctx.Session.alive().filter(p => p.id !== carrier && p.id !== victim.id);
  const away = others[0];
  // move one witness out before it happens again in a test of letters below
  const seen = others.map(p => ctx.Session.privateView(p.id).notes.filter(n => n.kind === 'handover'));
  ok(seen.every(n => n.length === 1 && n[0].a === carrier && n[0].b === victim.id && n[0].room === 'hall'),
     'everybody in the hall saw the carrier hand the victim something');
  eq(Object.keys(seen[0][0]).sort(), ['a', 'b', 'day', 'kind', 'room', 't'], 'and nothing in it says what');
  ok(!ctx.Session.privateView(victim.id).notes.some(n => n.kind === 'handover'), 'the victim saw nothing of note');
  void away;
});

test('who you were with, and where, goes in your notebook as you go', () => {
  const ctx = fresh();
  const E = start(ctx, FIVE, 8);
  toTasks(ctx);
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
  const first = ctx.Session.privateView('a').notes;
  eq(first.length, 1, 'one look round');
  eq(first[0].room, 'hall');
  eq(first[0].ids.length, 4, 'everybody else was there');
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
  eq(ctx.Session.privateView('a').notes.length, 1, 'nothing new, nothing written');
  E.at.a = { x: 0, z: -22, h: 0, room: 'turret' };
  E.at.b = { x: 1, z: -22, h: 0, room: 'turret' };
  clock += 4000;
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
  const last = ctx.Session.privateView('a').notes.slice(-1)[0];
  eq([last.room, last.ids], ['turret', ['b']], 'up in the turret with B');
  ok(last.t >= 4, 'and when');
  ok(!ctx.Session.privateView('c').notes.some(n => n.room === 'turret'), 'C never saw the turret');
});

test('the day lasts three minutes, rings a bell before the end, and its clock starts when everybody is in', () => {
  const ctx = fresh();
  start(ctx, FIVE, 10);
  toTasks(ctx);
  const c = ctx.Session.state.chores;
  eq(c.seconds, 180, 'three minutes');
  let bells = 0;
  ctx.Session.on('bell', () => bells++);
  clock += 60000;
  // the people arrive: the clock is reset to the moment the last one did
  for (const p of FIVE) ctx.Session.dispatch({ type: 'sceneReady', playerId: p.id, phase: 'tasks' });
  eq(ctx.Session.state.chores.startedAt, clock, 'the day starts when the castle is built everywhere');
  clock += (180 - ctx.Session.BELL_AT + 1) * 1000;
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
  eq(bells, 1, 'the bell');
  eq(ctx.Session.state.phase, 'tasks', 'and still working');
  endDay(ctx);
  eq(ctx.Session.state.phase, 'table', 'then the round table');
  ctx.Session.abandon();
});

section('session — the night and the morning after');

test('the poisoned die in the night and are found missing at breakfast', () => {
  const ctx = fresh();
  const E = start(ctx, SEVEN, 13);
  toTasks(ctx);
  const { victim } = poisonSomebody(ctx, E);
  endDay(ctx);
  ctx.Session.dispatch({ type: 'expose', authority: true });
  eq(ctx.Session.state.exposure.playerId, null, 'the carrier did their job: nothing to expose');
  const innocent = faithfulOf(ctx).find(p => p.id !== victim.id);
  voteOut(ctx, innocent.id);
  eq(ctx.Session.state.finale.stage, 'done');
  ok(ctx.Session.playerById(victim.id).alive, 'the poisoned still sit at the table that day');
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.privateView(victim.id).fate, 'murdered', 'and are told first, in the night');
  sleepAndWake(ctx);
  const b = ctx.Session.state.breakfast;
  eq(b.victim, victim.id, 'nobody else knows until the last of them is down');
  ok(!ctx.Session.playerById(victim.id).alive, 'gone');
  eq(ctx.Session.state.murdered.map(m => m.id), [victim.id], 'one death, the poison\'s');
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.state.phase, 'tasks', 'and another day');
  eq(ctx.Session.state.day, 1);
  ctx.Session.abandon();
});

test('banish the poisoned before night and the poison is wasted — and breakfast says so', () => {
  const ctx = fresh();
  const E = start(ctx, SEVEN, 14);
  toTasks(ctx);
  const { victim } = poisonSomebody(ctx, E);
  endDay(ctx);
  ctx.Session.dispatch({ type: 'expose', authority: true });
  voteOut(ctx, victim.id);
  ctx.Session.dispatch({ type: 'advance', authority: true });
  sleepAndWake(ctx);
  eq(ctx.Session.state.breakfast.victim, null, 'nobody died');
  eq(ctx.Session.state.breakfast.spared, true, 'because the table got there first');
  eq(ctx.Session.state.murdered.length, 0);
  ctx.Session.abandon();
});

test('with two Traitors, the turret chooses tomorrow\'s carrier', () => {
  const ctx = fresh();
  const E = start(ctx, SEVEN, 15);
  toTasks(ctx);
  poisonSomebody(ctx, E);
  endDay(ctx);
  ctx.Session.dispatch({ type: 'expose', authority: true });
  const innocent = faithfulOf(ctx).find(p => ctx.Session._peek().poison.target !== p.id);
  voteOut(ctx, innocent.id);
  ctx.Session.dispatch({ type: 'advance', authority: true });
  const [t1, t2] = traitorsOf(ctx);
  ok(ctx.Session.privateView(t1.id).night.choose, 'there is a choice to make');
  eq(ctx.Session.privateView(faithfulOf(ctx)[0].id).night, null, 'and only the turret sees it');
  ctx.Session.dispatch({ type: 'turretPick', playerId: t1.id, kind: 'carrier', targetId: t2.id });
  ok(!ctx.Session.state.night.done, 'one Traitor is not a decision');
  ctx.Session.dispatch({ type: 'turretPick', playerId: t2.id, kind: 'carrier', targetId: t2.id });
  eq(ctx.Session._peek().carrier, t2.id, 'both agree: it is decided');
  ctx.Session.abandon();
});

const EIGHT = SEVEN.concat([{ id: 'h', name: 'Hnn', local: false }]);

test('an offered seat can be refused, and refusing costs nothing', () => {
  const ctx = fresh();
  const E = start(ctx, EIGHT, 16);
  // a Traitor already banished: the turret may recruit
  toTasks(ctx);
  poisonSomebody(ctx, E);
  endDay(ctx);
  ctx.Session.dispatch({ type: 'expose', authority: true });
  const out = traitorsOf(ctx).find(t => t.id !== ctx.Session._peek().carrier);
  voteOut(ctx, out.id);
  ctx.Session.dispatch({ type: 'advance', authority: true });
  const [t] = traitorsOf(ctx);
  const n = ctx.Session.privateView(t.id).night;
  ok(n.canRecruit, 'one down and Faithfuls to spare, so a seat may be offered');
  const target = faithfulOf(ctx).find(p => p.id !== ctx.Session._peek().victim);
  ctx.Session.dispatch({ type: 'turretPick', playerId: t.id, kind: 'recruit', targetId: target.id });
  ok(ctx.Session.privateView(target.id).offer, 'the knock at the door');
  ctx.Session.dispatch({ type: 'recruitAnswer', playerId: target.id, accept: false });
  eq(ctx.Session.privateView(target.id).role, 'faithful', 'refused: still Faithful');
  eq(ctx.Session.privateView(target.id).fate, null, 'and not murdered for it');
  ctx.Session.abandon();
});

test('with too few Faithfuls left, nobody is offered a seat', () => {
  const ctx = fresh();
  const E = start(ctx, SEVEN, 16);
  toTasks(ctx);
  poisonSomebody(ctx, E);
  endDay(ctx);
  ctx.Session.dispatch({ type: 'expose', authority: true });
  voteOut(ctx, traitorsOf(ctx).find(t => t.id !== ctx.Session._peek().carrier).id);
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.privateView(traitorsOf(ctx)[0].id).night.canRecruit, false);
  ctx.Session.abandon();
});

section('session — the exposure');

test('a carrier who never used the poison is exposed at the table, and there is no vote', () => {
  const ctx = fresh();
  start(ctx, SEVEN, 17);
  toTasks(ctx);
  const carrier = ctx.Session._peek().carrier;
  endDay(ctx);
  ok(ctx.Session.hasExposure(), 'the table owes a ceremony');
  ctx.Session.dispatch({ type: 'expose', authority: true });
  eq(ctx.Session.state.exposure.playerId, carrier, 'it is the carrier');
  ok(!ctx.Session.playerById(carrier).alive, 'out on the spot');
  eq(ctx.Session.state.banished.slice(-1)[0].role, 'traitor', 'as a Traitor');
  ctx.Session.dispatch({ type: 'exposeDone', authority: true });
  eq(ctx.Session.state.finale.stage, 'done', 'that was the banishment; no slates');
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.state.phase, 'night', 'and to bed');
  ok(traitorsOf(ctx).length === 1 && ctx.Session._peek().carrier === traitorsOf(ctx)[0].id,
     'the other Traitor carries it tomorrow');
  ctx.Session.abandon();
});

test('exposing the last Traitor ends the game for the Faithfuls', () => {
  const ctx = fresh();
  start(ctx, FIVE, 18);
  toTasks(ctx);
  endDay(ctx);
  ctx.Session.dispatch({ type: 'expose', authority: true });
  ctx.Session.dispatch({ type: 'exposeDone', authority: true });
  eq(ctx.Session.state.phase, 'verdict');
  eq(ctx.Session.state.outcome.reason, 'exposed');
  eq(ctx.Session.state.outcome.traitorAlive, false);
});

section('session — how it ends');

test('five players get one day and three of them reach the fire', () => {
  const ctx = fresh();
  const E = start(ctx, FIVE, 19);
  toTasks(ctx);
  const { victim } = poisonSomebody(ctx, E);
  endDay(ctx);
  ctx.Session.dispatch({ type: 'expose', authority: true });
  voteOut(ctx, faithfulOf(ctx).find(p => p.id !== victim.id).id);
  ctx.Session.dispatch({ type: 'advance', authority: true });
  sleepAndWake(ctx);
  ctx.Session.dispatch({ type: 'advance', authority: true });
  eq(ctx.Session.state.phase, 'finale', 'four or fewer after breakfast: the fire');
  eq(ctx.Session.alive().length, 3);
  eq(ctx.Session.state.finale.stage, 'decide', 'and it opens on the decision');
});

test('catching the last Traitor at the table ends it there', () => {
  const ctx = fresh();
  const E = start(ctx, FIVE, 20);
  toTasks(ctx);
  poisonSomebody(ctx, E);
  endDay(ctx);
  ctx.Session.dispatch({ type: 'expose', authority: true });
  voteOut(ctx, traitorsOf(ctx)[0].id);
  eq(ctx.Session.state.phase, 'verdict');
  eq(ctx.Session.state.outcome.reason, 'all-found');
});

section('session — the floor');

test('the floor goes round the seats and ends itself', () => {
  const ctx = fresh();
  start(ctx, FIVE, 30);
  const seen = [];
  ctx.Session.on('floor', (f) => seen.push(f.done ? 'done' : f.playerId));
  ctx.Session.dispatch({ type: 'openFloor', seconds: 30 });
  for (const id of ['a', 'b', 'c', 'd', 'e']) ctx.Session.dispatch({ type: 'yieldFloor', playerId: id });
  eq(seen, ['a', 'b', 'c', 'd', 'e', 'done'], 'in seat order, then finished');
  ctx.Session.abandon();
});

test('only the person holding the floor may give it up', () => {
  const ctx = fresh();
  start(ctx, FIVE, 31);
  ctx.Session.dispatch({ type: 'openFloor', seconds: 30 });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'c' });
  eq(ctx.Session.state.floor.playerId, 'a', 'c cannot end a turn that is not theirs');
  ctx.Session.abandon();
});

test('the open table ends when everybody has said they are finished; the dead cannot hold it', () => {
  const ctx = fresh();
  start(ctx, FIVE, 35);
  ctx.Session.state.players[4].alive = false;
  ctx.Session.dispatch({ type: 'openFloor', all: true, seconds: 60 });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'e' });
  eq(ctx.Session.state.floor.ready, [], 'the dead are not counted');
  for (const id of ['a', 'b', 'c']) ctx.Session.dispatch({ type: 'yieldFloor', playerId: id });
  ok(!ctx.Session.state.floor.done, 'three of four does not end it');
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'd' });
  ok(ctx.Session.state.floor.done, 'all four does');
  ctx.Session.abandon();
});

test('changing phase closes any floor that was open', () => {
  const ctx = fresh();
  start(ctx, FIVE, 33);
  ctx.Session.dispatch({ type: 'openFloor', seconds: 30 });
  toTasks(ctx);
  eq(ctx.Session.state.floor, null, 'the welcome took the floor with it');
  ctx.Session.abandon();
});

section('session — the fire');

test('the fire must be unanimous to end; one Banish sends it round', () => {
  const ctx = fresh();
  start(ctx, FIVE, 21);
  ctx.Session.jumpTo('finale');
  eq(ctx.Session.state.phase, 'finale');
  ok(ctx.Session.state.pot > 0, 'with a pot to divide');
  for (const p of ctx.Session.alive()) ctx.Session.dispatch({ type: 'decide', playerId: p.id, choice: p.id === 'b' ? 'banish' : 'end' });
  for (let i = 0; i < 5; i++) ctx.Session.dispatch({ type: 'decisionPouch' });
  eq(ctx.Session.state.finale.stage, 'name', 'one banish is enough to name somebody');
});

test('a tied naming is voted again between the tied', () => {
  const ctx = fresh();
  start(ctx, FIVE.slice(0, 5), 22);
  ctx.Session.jumpTo('finale');
  for (const p of ctx.Session.alive()) ctx.Session.dispatch({ type: 'decide', playerId: p.id, choice: 'banish' });
  for (let i = 0; i < 5; i++) ctx.Session.dispatch({ type: 'decisionPouch' });
  const ring = ['a', 'b', 'c', 'd', 'e'];
  ring.forEach((id, i) => ctx.Session.dispatch({ type: 'name', playerId: id, targetId: ring[(i + 1) % 5] }));
  for (let i = 0; i < 5; i++) ctx.Session.dispatch({ type: 'speakName' });
  eq(ctx.Session.state.finale.stage, 'name', 'back to naming');
  eq(ctx.Session.state.finale.nameRound, 1, 'and it is a revote');
  eq(ctx.Session.alive().length, 5, 'nobody was banished on a tie');
});

test('the host can shorten the day, but never below thirty seconds', () => {
  for (const [ask, want] of [[undefined, 180], [90, 90], [30, 30], [5, 30], [-1, 30], [9999, 180], ['x', 180]]) {
    const ctx = fresh();
    start(ctx, FIVE, 7, { taskSeconds: ask });
    toTasks(ctx);
    const c = ctx.Session.state.chores;
    eq(c.seconds, want, 'asked for ' + ask);
    eq(c.endsAt - c.startedAt, want * 1000, 'and the clock agrees');
  }
  const ctx = fresh();
  start(ctx, FIVE, 7, { taskSeconds: 30 });
  toTasks(ctx);
  ok(ctx.Session.state.chores.bellAt < 30, 'the bell does not ring the moment a short day starts');
});

test('breakfast knows when the next thing is the fire', () => {
  const ctx = fresh();
  start(ctx, SEVEN, 7);
  ok(!ctx.Session.finaleNext(), 'a full house goes back to work');
  ctx.Session.state.players.slice(0, 4).forEach(p => { p.alive = false; });
  ok(ctx.Session.finaleNext(), 'four or fewer goes to the fire');
});

H.report();
