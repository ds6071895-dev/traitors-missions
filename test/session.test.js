/* ------------------------------------------------------------------
   session.test.js — a whole night, driven through `dispatch`.

   `Session` is a pure reducer over plain actions with no DOM in it, so
   the entire show can be played here without a browser: both ballots,
   a tie and its revote, the auto-stop at two, and both endings the
   agenda can produce.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/missions.js',
               'js/missions/agendas.js', 'js/core/session.js'];

function fresh() {
  const ctx = H.load(FILES);
  ctx.GameState.load();
  // the real three-mission pool, including the dive
  for (const id of ['boat-race', 'shootout', 'dive']) {
    ctx.Missions.register({ id, name: id, create: () => ({}) });
  }
  return ctx;
}

const PLAYERS = [
  { id: 'a', name: 'Ana', local: true },
  { id: 'b', name: 'Bo', local: false },
  { id: 'c', name: 'Cy', local: false },
];

/* Roles come from the seed, so finding a seed with a traitor in a known
   seat is a search rather than a fixture — and it stays true if the
   draw is ever retuned. */
function seedWhere(ctx, want) {
  for (let s = 1; s < 4000; s++) {
    ctx.Session.startParty({ seed: s, players: PLAYERS, mode: 'host' });
    const peek = ctx.Session._peek();
    if (want(peek)) return { seed: s, peek };
  }
  throw new Error('no seed matched');
}

section('session — setup');

test('the dive can be drawn into a night', () => {
  const ctx = fresh();
  let found = null;
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
    const ids = ctx.Session.state.missions.map(m => m.id);
    eq(ids.length, 1, 'a night plans exactly one mission');
    ids.forEach(id => seen.add(id));
    if (!found && ids.includes('dive')) found = { seed, ids };
  }
  ok(found, 'the dive appeared in the plan');
  ok(seen.size >= 3, 'and the seed reaches every mission across nights: '
                     + [...seen].join(', '));
});

test('a party of three is seated in order, with looks and no bots', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 7, players: PLAYERS, mode: 'host' });
  const st = ctx.Session.state;
  eq(st.players.map(p => p.id), ['a', 'b', 'c'], 'ids');
  eq(st.players.map(p => p.seat), [0, 1, 2], 'seats');
  ok(st.players.every(p => !('bot' in p)), 'no bot flag survives anywhere');
  eq(st.phase, 'hill', 'starts on the hill');
});

/* There used to be a quarter of nights with nobody in them, and a
   night whose answer is "there was never anyone here" is an evening
   three people spent for no reason. The seed still picks the chair. It
   no longer picks whether there is a game. */
test('every night has exactly one traitor, and any of the three may be it', () => {
  const ctx = fresh();
  let withTraitor = 0;
  const N = 600;
  const seats = [0, 0, 0];
  for (let s = 1; s <= N; s++) {
    ctx.Session.startParty({ seed: s, players: PLAYERS, mode: 'host' });
    const peek = ctx.Session._peek();
    if (peek.has) { withTraitor++; seats[peek.seat]++; }
  }
  eq(withTraitor, N, 'every single night had a traitor in it');
  for (let i = 0; i < 3; i++) {
    const f = seats[i] / N;
    ok(f > 0.27 && f < 0.40, 'seat ' + i + ' was the traitor on ' + f.toFixed(3));
  }
});

test('a guest never draws roles and is told nothing until it is told', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 11, players: PLAYERS, mode: 'guest' });
  eq(ctx.Session._peek(), { has: false, seat: -1 }, 'guest has no role table');
  eq(ctx.Session.myRole(), null, 'and no role of its own yet');
  ctx.Session.setMyRole('traitor', [{ id: 'x', text: 'do a thing' }]);
  eq(ctx.Session.myRole(), 'traitor', 'until the host says so');
  eq(ctx.Session.myAgenda().id, 'x', 'and the card comes with it');
});

test('a guest cannot move the game on its own', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 12, players: PLAYERS, mode: 'guest' });
  const before = ctx.Session.state.phase;
  ctx.Session.dispatch({ type: 'advance' });
  eq(ctx.Session.state.phase, before, 'dispatch is inert on a guest');
});

section('session — the run');

/* The whole night, and it is short on purpose: a welcome, one mission
   with everybody on an open microphone, and the fire. The round table
   and the second mission are gone — what is worth playing is the
   channel, and most of an evening used to go on everything else. */
function toFinale(ctx, seed) {
  ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
  ctx.Session.dispatch({ type: 'advance' });                 // hill -> mission
  ctx.Session.dispatch({ type: 'result', earned: 10000, completed: true, players: [] });
  eq(ctx.Session.state.phase, 'finale', 'the mission leads straight to the fire');
  eq(ctx.Session.state.pot, 10000, 'the mission banked');
}

test('the run walks hill -> mission -> finale, and nothing else', () => {
  const ctx = fresh();
  toFinale(ctx, 21);
  eq(ctx.Session.PARTS, ['intro', 'm1', 'finale'], 'three parts, in order');
});

/* There is always a Traitor, so "shall we bother" was never a real
   question. The fire opens on the only one left. */
test('the fire opens straight onto the naming, with no decision ballot', () => {
  const ctx = fresh();
  toFinale(ctx, 21);
  eq(ctx.Session.state.finale.stage, 'name', 'no decide stage in front of it');
  eq(ctx.Session.dispatch({ type: 'vote', playerId: 'a', choice: 'end' }),
     null, 'a decision vote is not an action any more');
  eq(ctx.Session.state.finale.stage, 'name', 'and it moved nothing');
});

test('a tied naming is voted again, never broken at random', () => {
  const ctx = fresh();
  toFinale(ctx, 21);

  // a three-way split: everybody names somebody different
  ctx.Session.dispatch({ type: 'name', playerId: 'a', targetId: 'b' });
  ctx.Session.dispatch({ type: 'name', playerId: 'b', targetId: 'c' });
  ctx.Session.dispatch({ type: 'name', playerId: 'c', targetId: 'a' });
  for (let i = 0; i < 3; i++) ctx.Session.dispatch({ type: 'speakName' });

  eq(ctx.Session.state.finale.stage, 'name', 'back to naming');
  eq(ctx.Session.state.finale.nameRound, 1, 'and it is a revote');
  eq(ctx.Session.alive().length, 3, 'nobody was banished on a tie');
});

test('banishing the third player stops the game at two', () => {
  const ctx = fresh();
  toFinale(ctx, 21);
  ctx.Session.dispatch({ type: 'name', playerId: 'a', targetId: 'c' });
  ctx.Session.dispatch({ type: 'name', playerId: 'b', targetId: 'c' });
  ctx.Session.dispatch({ type: 'name', playerId: 'c', targetId: 'a' });
  for (let i = 0; i < 3; i++) ctx.Session.dispatch({ type: 'speakName' });
  eq(ctx.Session.state.finale.stage, 'reveal', 'a clear result');
  ctx.Session.dispatch({ type: 'reveal' });
  eq(ctx.Session.alive().length, 2, 'one is out');
  eq(ctx.Session.state.finale.stage, 'pouches', 'and the night stops itself');
});

section('session — the floor');

test('the floor goes round the seats and ends itself', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 30, players: PLAYERS, mode: 'host' });
  const seen = [];
  ctx.Session.on('floor', (f) => seen.push(f.done ? 'done' : f.playerId));
  ctx.Session.dispatch({ type: 'openFloor', seconds: 30 });
  eq(seen, ['a'], 'the first seat gets it');
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'a' });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'b' });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'c' });
  eq(seen, ['a', 'b', 'c', 'done'], 'in seat order, then finished');
  ok(!ctx.Session.state.floor.playerId, 'and nobody is left holding it');
});

test('only the person holding the floor may give it up', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 31, players: PLAYERS, mode: 'host' });
  ctx.Session.dispatch({ type: 'openFloor', seconds: 30 });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'c' });
  eq(ctx.Session.state.floor.playerId, 'a', 'c cannot end a turn that is not theirs');
  /* The host owns a real clock, so a floor left open really does keep
     ticking — through every remaining turn. Leaving one running at the
     end of a test held this suite open for a minute and a half. */
  ctx.Session.abandon();
});

test('abandoning a night stops the clock with it', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 32, players: PLAYERS, mode: 'host' });
  ctx.Session.dispatch({ type: 'openFloor', seconds: 30 });
  ok(ctx.Session.state.floor.playerId, 'a turn is running');
  ctx.Session.abandon();
  eq(ctx.Session.state, null, 'and the night is gone, timer and all');
});

/* The round table does not go round. Everybody's microphone is live at
   once, the clock is on the discussion rather than on a turn, and
   "I've said enough" is a vote to move on rather than a turn handed
   back. */

test('an open table opens once, for everybody, and runs on one clock', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 34, players: PLAYERS, mode: 'host' });
  const seen = [];
  ctx.Session.on('floor', (f) => seen.push(f));
  ctx.Session.dispatch({ type: 'openFloor', all: true, seconds: 60 });
  eq(seen.length, 1, 'one event, not one per seat');
  ok(seen[0].all && !seen[0].playerId, 'and it names nobody');
  eq(ctx.Session.state.floor.seconds, 60, 'the clock is on the discussion');
  ok(ctx.Session.state.floor.endsAt > Date.now(), 'and it is running');
  ctx.Session.dispatch({ type: 'openFloor', all: true, seconds: 60 });
  eq(seen.length, 1, 'a second open while one is running is ignored');
  ctx.Session.abandon();
});

test('the table ends when everybody has said they are finished', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 35, players: PLAYERS, mode: 'host' });
  const seen = [];
  ctx.Session.on('floor', (f) => seen.push(f));
  ctx.Session.dispatch({ type: 'openFloor', all: true, seconds: 60 });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'b' });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'b' });
  eq(ctx.Session.state.floor.ready, ['b'], 'saying it twice says it once');
  ok(!ctx.Session.state.floor.done, 'and one of three does not end it');
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'a' });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'c' });
  ok(ctx.Session.state.floor.done, 'all three does');
  ok(seen[seen.length - 1].done, 'and the room is told');
  ctx.Session.abandon();
});

test('a dead player cannot hold the table open', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 36, players: PLAYERS, mode: 'host' });
  ctx.Session.state.players[2].alive = false;
  ctx.Session.dispatch({ type: 'openFloor', all: true, seconds: 60 });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'c' });
  eq(ctx.Session.state.floor.ready, [], 'their vote is not counted');
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'a' });
  ctx.Session.dispatch({ type: 'yieldFloor', playerId: 'b' });
  ok(ctx.Session.state.floor.done, 'and the living two end it between them');
  ctx.Session.abandon();
});

test('changing phase closes any floor that was open', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 33, players: PLAYERS, mode: 'host' });
  ctx.Session.dispatch({ type: 'openFloor', seconds: 30 });
  ctx.Session.dispatch({ type: 'advance' });
  eq(ctx.Session.state.floor, null, 'the hill took the floor with it');
  ctx.Session.abandon();
});

section('session — the agenda');

/* The whole mechanic, both ways round.

   Nothing on the host can hear a microphone, so nothing on the host
   judges the card. The Traitor marks it themselves, during the run,
   and that mark is what arrives here. A marked task is silent and the
   night continues; an unmarked one ends it at the fire with the
   Faithfuls holding the pot.

   Which means the reducer's whole job is the deadline and the sender,
   and that is what these cover. */

function runWithTraitor(ctx, marks) {
  const { seed } = seedWhere(ctx, (p) => p.has);
  ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
  const traitor = ctx.Session.state.players[ctx.Session._peek().seat];
  const dealt = (ctx.Session.privateRoles().find(r => r.role === 'traitor') || {}).agendas;
  ok(dealt && dealt[0], 'a traitor was dealt a card');
  ok(dealt.length === 1, 'exactly one card for the whole night');

  ctx.Session.dispatch({ type: 'advance' });
  if (marks) ctx.Session.dispatch({ type: 'taskDone', playerId: traitor.id });
  const reports = ctx.Session.state.players.map(p => ({
    playerId: p.id, name: p.name, earned: 1000, columns: ['A'], cells: ['x'], stats: {},
  }));
  ctx.Session.dispatch({ type: 'result', earned: 3000, completed: true, players: reports });
  return { traitor, seed, card: dealt[0] };
}

test('a marked task is silent — nothing is owed at the fire', () => {
  const ctx = fresh();
  runWithTraitor(ctx, true);
  eq(ctx.Session.state.phase, 'finale', 'the night carries on');
  eq(ctx.Session.hasExposure(), false, 'and nobody is owed a ceremony');
});

test('an unmarked task is owed, but the traitor is told nothing', () => {
  const ctx = fresh();
  const { traitor } = runWithTraitor(ctx, false);
  eq(ctx.Session.hasExposure(), true, 'the host knows');
  const snap = JSON.stringify(ctx.Session.snapshot());
  ok(snap.indexOf('expose') < 0, 'and the state says nothing about it');
  ok(ctx.Session.playerById(traitor.id).alive, 'they are still standing');
});

/* The mark is the only thing in the game a player asserts about
   themselves with nothing to check it, so the two things that keep it
   honest are who may send it and when. Neither is security — three
   people in a voice call can cheat this game in a dozen easier ways —
   but a mark that could arrive from the fire is a card you settle up
   on after you have seen how the night is going, and the whole weight
   of an honour system is having to commit while you still have
   something to lose. */
test('only the traitor can mark the task, and only during the mission', () => {
  const ctx = fresh();
  const { seed } = seedWhere(ctx, (p) => p.has);
  ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
  const traitor = ctx.Session.state.players[ctx.Session._peek().seat];
  const faithful = ctx.Session.state.players.find(p => p.id !== traitor.id);

  ctx.Session.dispatch({ type: 'taskDone', playerId: traitor.id });
  ctx.Session.dispatch({ type: 'advance' });
  ctx.Session.dispatch({ type: 'taskDone', playerId: faithful.id });
  const reports = ctx.Session.state.players.map(p => ({
    playerId: p.id, name: p.name, earned: 1000, stats: {} }));
  ctx.Session.dispatch({ type: 'result', earned: 1, completed: true, players: reports });

  eq(ctx.Session.hasExposure(), true,
     'a mark from the hill and a mark from a faithful are both nothing');
});

test('marking is silent on the wire', () => {
  const ctx = fresh();
  const { seed } = seedWhere(ctx, (p) => p.has);
  ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
  const traitor = ctx.Session.state.players[ctx.Session._peek().seat];
  ctx.Session.dispatch({ type: 'advance' });

  let changes = 0;
  ctx.Session.on('change', () => { changes++; });
  ctx.Session.dispatch({ type: 'taskDone', playerId: traitor.id });
  /* A snapshot going out at the exact moment somebody says the thing
     they were told to say is a tell the other two could watch for. */
  eq(changes, 0, 'nothing was broadcast');
  eq(JSON.stringify(ctx.Session.snapshot()).indexOf('taskDone'), -1,
     'and nothing about it is in the shared state');
});

test('the exposure ends the night with the faithfuls holding the pot', () => {
  const ctx = fresh();
  const { traitor } = runWithTraitor(ctx, false);

  let told = null;
  ctx.Session.on('expose', (e) => { told = e; });
  ctx.Session.dispatch({ type: 'expose' });
  ok(told && told.playerId === traitor.id, 'the room is told who');
  eq(told.role, 'traitor', 'and what they were');
  eq(ctx.Session.playerById(traitor.id).alive, false, 'they are out');

  ctx.Session.dispatch({ type: 'exposeDone' });
  const o = ctx.Session.state.outcome;
  ok(o, 'there is a verdict');
  eq(o.reason, 'agenda', 'and it says why');
  eq(ctx.Session.state.phase, 'verdict', 'the night is over');

  const winners = o.roles.filter(r => r.winner);
  eq(winners.length, 2, 'both faithfuls won');
  ok(winners.every(r => r.role === 'faithful'), 'and only faithfuls');
  eq(o.roles.find(r => r.id === traitor.id).payout, 0, 'the traitor gets nothing');
});

/* The reckoning. Nothing could check the card all night, so the
   verdict panel prints it — the card and the mark — for the two people
   who were on the microphone and can check it themselves. */
test('the verdict prints the card and the mark, once, at the end', () => {
  const ctx = fresh();
  const { traitor, card } = runWithTraitor(ctx, true);

  const mid = JSON.stringify(ctx.Session.snapshot());
  ok(mid.indexOf(card.text) < 0, 'the card is nowhere in the state before the end');

  ctx.Session.dispatch({ type: 'name', playerId: 'a', targetId: 'c' });
  ctx.Session.dispatch({ type: 'name', playerId: 'b', targetId: 'c' });
  ctx.Session.dispatch({ type: 'name', playerId: 'c', targetId: 'a' });
  for (let i = 0; i < 3; i++) ctx.Session.dispatch({ type: 'speakName' });
  ctx.Session.dispatch({ type: 'reveal' });
  let guard = 0;
  while (ctx.Session.state.phase === 'finale' && guard++ < 8) {
    ctx.Session.dispatch({ type: 'pouch' });
  }

  const a = ctx.Session.state.outcome.agenda;
  ok(a, 'the outcome carries the reckoning');
  eq(a.text, card.text, 'the card, word for word');
  eq(a.marked, true, 'and whether they claimed they said it');
  eq(a.playerId, traitor.id, 'attached to the person who was carrying it');
});

section('session — the board');

test('the board carries every player, in finishing order', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 44, players: PLAYERS, mode: 'host' });
  ctx.Session.dispatch({ type: 'advance' });
  ctx.Session.dispatch({ type: 'result', earned: 900, completed: true, players: [
    { playerId: 'c', name: 'Cy', place: 1, earned: 500, columns: ['Place'], cells: ['P1'] },
    { playerId: 'a', name: 'Ana', place: 3, earned: 100, columns: ['Place'], cells: ['P3'] },
    { playerId: 'b', name: 'Bo', place: 2, earned: 300, columns: ['Place'], cells: ['P2'] },
  ] });
  const d = ctx.Session.state.debrief;
  eq(d.rows.map(r => r.playerId), ['c', 'b', 'a'], 'sorted by place');
  eq(d.columns, ['Place'], 'columns come from the mission');
});

module.exports = { run: () => H.report() };
if (require.main === module) H.report();
