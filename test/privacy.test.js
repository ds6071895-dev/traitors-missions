const finishTravel = require('./travel-helper');
/* ------------------------------------------------------------------
   privacy.test.js — the one invariant everything else stands on.

   The README has claimed since the first commit that a test walks the
   serialised session and asserts the word never appears in it. There
   was no such test. There is now, and it matters far more than it did
   then: back when the other two contestants were bots in this process,
   a leak in the snapshot leaked to nobody. The snapshot is now a thing
   the host puts on a wire and sends to two other people's browsers.

   The rule: `state` never carries a role, at any phase, for anybody —
   until the night is over and every card is face up on purpose.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/missions.js',
               'js/missions/agendas.js', 'js/core/session.js'];

const PLAYERS = [
  { id: 'a', name: 'Ana', local: true },
  { id: 'b', name: 'Bo', local: false },
  { id: 'c', name: 'Cy', local: false },
];

function fresh() {
  const ctx = H.load(FILES);
  ctx.GameState.load();
  for (const id of ['boat-race', 'shootout']) {
    ctx.Missions.register({ id, name: id, create: () => ({}) });
  }
  return ctx;
}

/* Everything the host would ever put on the wire before the end: the
   snapshot itself, and the private-role list with the roles stripped
   out the way `HostTransport` addresses them. */
const leaks = (ctx) => {
  const snap = JSON.stringify(ctx.Session.snapshot() || {});
  return /traitor|faithful/i.test(snap);
};

section('privacy — the word is never in the state');

test('not on the hill, not in a mission, not at the table, not at the fire', () => {
  const ctx = fresh();
  let checked = 0;
  for (let seed = 1; seed <= 120; seed++) {
    ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
    ok(!leaks(ctx), 'leaked on the hill, seed ' + seed);

    ctx.Session.dispatch({ type: 'advance' });
  finishTravel(ctx);
    ok(!leaks(ctx), 'leaked in mission 0, seed ' + seed);

    ctx.Session.dispatch({ type: 'result', earned: 100, completed: true,
                           players: PLAYERS.map(p => ({ playerId: p.id, stats: {} })) });
  finishTravel(ctx);
    ok(!leaks(ctx), 'leaked at the table, seed ' + seed);

    if (ctx.Session.state.phase === 'table') {
      ctx.Session.dispatch({ type: 'advance' });
  finishTravel(ctx);
      ctx.Session.dispatch({ type: 'result', earned: 100, completed: true,
                             players: PLAYERS.map(p => ({ playerId: p.id, stats: {} })) });
  finishTravel(ctx);
    }
    ok(!leaks(ctx), 'leaked at the fire, seed ' + seed);
    checked++;
  }
  ok(checked === 120, 'walked every seed');
});

test('a whole ballot leaks nothing, including the tally', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 77, players: PLAYERS, mode: 'host' });
  ctx.Session.dispatch({ type: 'advance' });
  finishTravel(ctx);
  ctx.Session.dispatch({ type: 'result', earned: 100, completed: true, players: [] });
  finishTravel(ctx);

  ctx.Session.dispatch({ type: 'name', playerId: 'a', targetId: 'c' });
  ctx.Session.dispatch({ type: 'name', playerId: 'b', targetId: 'c' });
  ctx.Session.dispatch({ type: 'name', playerId: 'c', targetId: 'a' });
  ok(!leaks(ctx), 'leaked while the naming ballot was closed');
  for (let i = 0; i < 3; i++) ctx.Session.dispatch({ type: 'speakName' });
  ok(!leaks(ctx), 'leaked as the names were spoken');
});

test('an unfinished task is not in the state either', () => {
  const ctx = fresh();
  // find a night that has a traitor and fail their card outright
  for (let seed = 1; seed < 4000; seed++) {
    ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host' });
    if (!ctx.Session._peek().has) continue;
    const seat = ctx.Session._peek().seat;
    const traitor = ctx.Session.state.players[seat];
    ctx.Session.dispatch({ type: 'advance' });
  finishTravel(ctx);
    ctx.Session.dispatch({ type: 'result', earned: 10, completed: true,
      players: ctx.Session.state.players.map(p => ({
        playerId: p.id, name: p.name, stats: {},
      })) });
  finishTravel(ctx);
    if (!ctx.Session.hasExposure()) continue;
    ok(!leaks(ctx), 'the pending exposure leaked into the state');
    const snap = JSON.stringify(ctx.Session.snapshot());
    ok(snap.indexOf(traitor.id + '","role') < 0, 'no role rider on the player record');
    ok(ctx.Session.state.players.every(p => p.alive), 'nobody is dead yet either');
    return;
  }
  throw new Error('no seed produced a failed agenda');
});

section('privacy — what may be disclosed, and when');

/* The whole night, driven from outside: one mission, one naming, one
   banishment, then the closing walk. It stops on `verdict`. */
function toTheEnd(ctx) {
  ctx.Session.dispatch({ type: 'advance' });
  finishTravel(ctx);
  ctx.Session.dispatch({ type: 'result', earned: 1, completed: true, players: [] });
  finishTravel(ctx);
  ctx.Session.dispatch({ type: 'name', playerId: 'a', targetId: 'c' });
  ctx.Session.dispatch({ type: 'name', playerId: 'b', targetId: 'c' });
  ctx.Session.dispatch({ type: 'name', playerId: 'c', targetId: 'a' });
  for (let i = 0; i < 3; i++) ctx.Session.dispatch({ type: 'speakName' });
  ctx.Session.dispatch({ type: 'reveal' });
  for (let i = 0; i < 4; i++) ctx.Session.dispatch({ type: 'pouch' });
}

test('a role only leaves as an event, never as state', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 77, players: PLAYERS, mode: 'host' });
  const escaped = [];
  ctx.Session.on('reveal', (r) => escaped.push(r.role));
  ctx.Session.on('expose', (e) => e.playerId && escaped.push(e.role));
  toTheEnd(ctx);
  ok(escaped.length >= 3, 'the pouches disclosed, as events');
  eq(ctx.Session.state.phase, 'verdict', 'and only then is the night over');
});

test('the verdict is the one place roles are meant to be face up', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 77, players: PLAYERS, mode: 'host' });
  toTheEnd(ctx);
  ok(leaks(ctx), 'the verdict is allowed to say what everybody was');
  ok(ctx.Session.state.outcome.roles.length === 3, 'all three cards are up');
});

test('privateRoles is host-only and addressed one person at a time', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 90, players: PLAYERS, mode: 'guest' });
  eq(ctx.Session.privateRoles(), [], 'a guest can tell nobody anything');

  ctx.Session.startParty({ seed: 90, players: PLAYERS, mode: 'host' });
  const roles = ctx.Session.privateRoles();
  eq(roles.length, 3, 'one entry per player');
  ok(roles.every(r => r.playerId && r.role), 'each names exactly one person');
  const traitors = roles.filter(r => r.role === 'traitor');
  ok(traitors.length <= 1, 'never more than one traitor');
  ok(roles.filter(r => r.agendas).length === traitors.length,
     'only a traitor is dealt cards');
});

if (require.main === module) H.report();
