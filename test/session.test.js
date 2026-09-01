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
  // two missions the planner can draw, so a run has a shape
  for (const id of ['boat-race', 'shootout']) {
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

test('a party of three is seated in order, with looks and no bots', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 7, players: PLAYERS, mode: 'host' });
  const st = ctx.Session.state;
  eq(st.players.map(p => p.id), ['a', 'b', 'c'], 'ids');
  eq(st.players.map(p => p.seat), [0, 1, 2], 'seats');
  ok(st.players.every(p => !('bot' in p)), 'no bot flag survives anywhere');
  eq(st.phase, 'hill', 'starts on the hill');
});

test('a quarter of all nights have no traitor at all', () => {
  const ctx = fresh();
  let withTraitor = 0;
  const N = 600;
  const seats = [0, 0, 0];
  for (let s = 1; s <= N; s++) {
    ctx.Session.startParty({ seed: s, players: PLAYERS, mode: 'host' });
    const peek = ctx.Session._peek();
    if (peek.has) { withTraitor++; seats[peek.seat]++; }
  }
  const frac = withTraitor / N;
  ok(frac > 0.70 && frac < 0.80, 'traitor fraction was ' + frac.toFixed(3));
  /* And the other three quarters are split evenly, which is the half
     of the draw a player can actually feel: any one of the three of
     you, you included, is the Traitor on a quarter of all nights. */
  for (let i = 0; i < 3; i++) {
    const f = seats[i] / N;
    ok(f > 0.18 && f < 0.32, 'seat ' + i + ' was the traitor on ' + f.toFixed(3));
  }
});

test('a guest never draws roles and is told nothing until it is told', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 11, players: PLAYERS, mode: 'guest' });
  eq(ctx.Session._peek(), { has: false, seat: -1 }, 'guest has no role table');
  eq(ctx.Session.myRole(), null, 'and no role of its own yet');
  ctx.Session.setMyRole('traitor', [{ id: 'x', text: 'do a thing' }]);
  eq(ctx.Session.myRole(), 'traitor', 'until the host says so');
  eq(ctx.Session.myAgenda(0).id, 'x', 'and the card comes with it');
});

test('a guest cannot move the game on its own', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 12, players: PLAYERS, mode: 'guest' });
  const before = ctx.Session.state.phase;
  ctx.Session.dispatch({ type: 'advance' });
  eq(ctx.Session.state.phase, before, 'dispatch is inert on a guest');
});

section('session — the run');

function toFinale(ctx, seed) {
  ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
  ctx.Session.dispatch({ type: 'advance' });                 // hill -> mission 0
  ctx.Session.dispatch({ type: 'result', earned: 4000, completed: true, players: [] });
  eq(ctx.Session.state.phase, 'table', 'mission 0 leads to the table');
  ctx.Session.dispatch({ type: 'advance' });                 // table -> mission 1
  ctx.Session.dispatch({ type: 'result', earned: 6000, completed: true, players: [] });
  eq(ctx.Session.state.phase, 'finale', 'mission 1 leads to the fire');
  eq(ctx.Session.state.pot, 10000, 'both missions banked');
}

test('the run walks hill -> mission -> table -> mission -> finale', () => {
  const ctx = fresh();
  toFinale(ctx, 21);
});

test('one banish vote beats two end votes — the fire is unanimous', () => {
  const ctx = fresh();
  toFinale(ctx, 21);
  ctx.Session.dispatch({ type: 'vote', playerId: 'a', choice: 'end' });
  ctx.Session.dispatch({ type: 'vote', playerId: 'b', choice: 'end' });
  ctx.Session.dispatch({ type: 'vote', playerId: 'c', choice: 'banish' });
  eq(ctx.Session.state.finale.stage, 'decisions', 'the ballot closed');
  for (let i = 0; i < 3; i++) ctx.Session.dispatch({ type: 'decisionPouch' });
  eq(ctx.Session.state.finale.stage, 'name', 'and it went to a naming');
});

test('a tied naming is voted again, never broken at random', () => {
  const ctx = fresh();
  toFinale(ctx, 21);
  ctx.Session.dispatch({ type: 'vote', playerId: 'a', choice: 'banish' });
  ctx.Session.dispatch({ type: 'vote', playerId: 'b', choice: 'banish' });
  ctx.Session.dispatch({ type: 'vote', playerId: 'c', choice: 'banish' });
  for (let i = 0; i < 3; i++) ctx.Session.dispatch({ type: 'decisionPouch' });

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
  ctx.Session.dispatch({ type: 'vote', playerId: 'a', choice: 'banish' });
  ctx.Session.dispatch({ type: 'vote', playerId: 'b', choice: 'banish' });
  ctx.Session.dispatch({ type: 'vote', playerId: 'c', choice: 'banish' });
  for (let i = 0; i < 3; i++) ctx.Session.dispatch({ type: 'decisionPouch' });
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

/* The whole mechanic, both ways round. A completed task is silent and
   the night continues; a failed one ends it at the next gathering with
   the Faithfuls holding the pot. */

function runWithTraitor(ctx, agendaPasses) {
  const { seed } = seedWhere(ctx, (p) => p.has);
  ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
  const traitorSeat = ctx.Session._peek().seat;
  const traitor = ctx.Session.state.players[traitorSeat];
  const card = ctx.Session.myAgenda
    ? (ctx.Session.privateRoles().find(r => r.role === 'traitor') || {}).agendas
    : null;
  ok(card && card[0], 'a traitor was dealt a card for mission 0');

  ctx.Session.dispatch({ type: 'advance' });
  const reports = ctx.Session.state.players.map(p => ({
    playerId: p.id, name: p.name, earned: 1000, columns: ['A'], cells: ['x'],
    /* A hand that satisfies every card in the deck, and one that
       satisfies none of them — which card the seed happened to deal is
       not this file's business. */
    stats: p.id === traitor.id
      ? (agendaPasses ? { finished: true, place: 3, of: 3, finishGap: 1,
                          elapsed: 100, leadTime: 60, longestStop: 1.4,
                          boostSpentEarly: 1, boostAtFinish: 0, goldDeclined: 3,
                          escapedNearMe: 5, missed: 10, doves: 1,
                          roundsOffLine: 1 }
                      : { finished: true, place: 1, of: 3, finishGap: 40,
                          elapsed: 100, leadTime: 0, longestStop: 0,
                          boostSpentEarly: 0, boostAtFinish: 1, goldDeclined: 0,
                          escapedNearMe: 0, missed: 0, doves: 0,
                          roundsOffLine: 0 })
      : {},
  }));
  ctx.Session.dispatch({ type: 'result', earned: 3000, completed: true, players: reports });
  return { traitor, seed };
}

test('a completed task is silent — nothing is owed at the table', () => {
  const ctx = fresh();
  runWithTraitor(ctx, true);
  eq(ctx.Session.state.phase, 'table', 'the night carries on');
  eq(ctx.Session.hasExposure(), false, 'and nobody is owed a ceremony');
});

test('a failed task is owed, but the traitor is told nothing', () => {
  const ctx = fresh();
  const { traitor } = runWithTraitor(ctx, false);
  eq(ctx.Session.hasExposure(), true, 'the host knows');
  const snap = JSON.stringify(ctx.Session.snapshot());
  ok(snap.indexOf('expose') < 0, 'and the state says nothing about it');
  ok(ctx.Session.playerById(traitor.id).alive, 'they are still standing');
});

/* A dropped packet is not a confession. Every card in the deck reads
   an empty stat sheet as a task nobody attempted, so a board published
   without the Traitor's row on it used to convict them of a network
   fault — at the round table, in front of everyone, ending the night. */
test('a report that never arrived is not a failed task', () => {
  const ctx = fresh();
  const { seed } = seedWhere(ctx, (p) => p.has);
  ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
  const traitor = ctx.Session.state.players[ctx.Session._peek().seat];
  ctx.Session.dispatch({ type: 'advance' });
  const reports = ctx.Session.state.players
    .filter(p => p.id !== traitor.id)
    .map(p => ({ playerId: p.id, name: p.name, earned: 1000, stats: {} }));
  ctx.Session.dispatch({ type: 'result', earned: 2000, completed: true, players: reports });
  eq(ctx.Session.state.phase, 'table', 'the night carries on');
  eq(ctx.Session.hasExposure(), false, 'and nobody is owed a ceremony');
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

test('a clean night is never owed an exposure', () => {
  const ctx = fresh();
  const { seed } = seedWhere(ctx, (p) => !p.has);
  ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
  ctx.Session.dispatch({ type: 'advance' });
  ctx.Session.dispatch({ type: 'result', earned: 1, completed: true,
                         players: PLAYERS.map(p => ({ playerId: p.id, stats: {} })) });
  eq(ctx.Session.hasExposure(), false, 'nothing to expose');

  let told = 'unset';
  ctx.Session.on('expose', (e) => { told = e; });
  ctx.Session.dispatch({ type: 'expose' });
  eq(told, { playerId: null }, 'and the room is still given a definite answer');
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
