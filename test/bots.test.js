/* ------------------------------------------------------------------
   bots.test.js — the rehearsal door.

   Two things have to be true about it and neither is about the bots.

   1. It cannot be reached from a real night. Choosing who the Traitor
      is and skipping half the show are both catastrophic if a lobby can
      ask for them, so `Session` ignores both unless the call that
      started the night declared itself a rehearsal — and only `Bots`
      does that.
   2. A night with parts switched off still ends up somewhere a scene
      can be played from: a skipped mission is *done*, with money in the
      pot and a board on the table, because the round table is an
      argument about a board and the fire divides a pot.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/missions.js',
               'js/missions/agendas.js', 'js/core/look.js', 'js/core/session.js',
               'js/core/net.js', 'js/core/transports.js',
               'js/scenes/claudia-lines.js', 'js/core/bots.js'];

/* Everything `Bots` reaches for that is a screen rather than a rule.
   `Show` is the interesting one: the real director drags in the whole
   front end, so what stands in for it here is the two lines of it that
   matter — start the session as a rehearsal, and put the solo transport
   on the wire. Everything the bots then do goes through the real
   reducer and the real transport. */
function stubs() {
  return {
    location: { search: '', hash: '', href: 'http://x/' },
    document: { getElementById: () => null, createElement: () => ({ style: {} }),
                body: { appendChild: () => {} } },
    URLSearchParams,
    console,
    Party: { connected: false, selfId: () => null, post: () => {}, on: () => (() => {}) },
    AudioBus: { resume: () => {} },
    Voice: { unlock: () => {}, say: () => Promise.resolve() },
    Game: { enterShow: () => {} },
  };
}

function fresh() {
  const ctx = H.load(FILES, stubs());
  ctx.GameState.load();
  ctx.Look.load();
  for (const id of ['boat-race', 'shootout', 'dive']) {
    ctx.Missions.register({ id, name: id, create: () => ({}) });
  }
  ctx.Scenes = { wait: (s) => new Promise(r => setTimeout(r, Math.min(20, s * 1000))) };
  ctx.Show = {
    running: false,
    solo: false,
    beginParty(o) {
      ctx.Session.startParty({
        seed: o.seed, players: o.players, mode: 'host',
        rehearsal: !!o.solo, parts: o.parts, traitorSeat: o.traitorSeat,
      });
      ctx.Net.connect(ctx.Transports.SoloTransport);
      this.running = true; this.solo = true;
    },
  };
  return ctx;
}

// far below anything a person would notice, so a night runs in a tick
const SNAP = { turn: [0.005, 0.01], open: [0.005, 0.01],
               vote: [0.005, 0.01], line: [0.005, 0.01] };
const RIG = { seed: 31, parts: ['finale'], names: ['Morag', 'Struan'], pace: SNAP,
              target: 'random', quiet: true };

const PLAYERS = [
  { id: 'you', name: 'You', local: true },
  { id: 'bot1', name: 'Morag', local: false },
  { id: 'bot2', name: 'Struan', local: false },
];

const startRehearsal = (ctx, opts) => ctx.Session.startParty(Object.assign(
  { seed: 21, players: PLAYERS, mode: 'host', rehearsal: true }, opts));

/* ---------------- the argument ---------------- */

section('bots — reading the argument');

test('a bare flag is the whole night', () => {
  const ctx = fresh();
  eq(ctx.Bots.parseParts('1'), ctx.Session.PARTS, 'bots=1');
  eq(ctx.Bots.parseParts('all'), ctx.Session.PARTS, 'bots=all');
  eq(ctx.Bots.parseParts('on'), ctx.Session.PARTS, 'bots=on');
});

test('parts are named, aliased, and come back in running order', () => {
  const ctx = fresh();
  eq(ctx.Bots.parseParts('finale'), ['finale']);
  eq(ctx.Bots.parseParts('finale,intro'), ['intro', 'finale'],
     'typed backwards, played forwards');
  eq(ctx.Bots.parseParts('fire'), ['finale'], 'fire is the finale');
  eq(ctx.Bots.parseParts('m1,finale'), ['m1', 'finale']);
  eq(ctx.Bots.parseParts('mission'), ['m1'], 'there is one of them now');
  eq(ctx.Bots.parseParts('intro m1 finale'), ['intro', 'm1', 'finale'],
     'spaces separate as well as commas');
});

test('an argument that names nothing still asks for a night', () => {
  const ctx = fresh();
  eq(ctx.Bots.parseParts('rhubarb'), ctx.Session.PARTS);
  eq(ctx.Bots.parseParts(''), ctx.Session.PARTS);
});

test('the traitor can be named, refused, or left to the seed', () => {
  const ctx = fresh();
  eq(ctx.Bots.parseTraitor('you'), 0);
  eq(ctx.Bots.parseTraitor('me'), 0);
  eq(ctx.Bots.parseTraitor('1'), 1);
  eq(ctx.Bots.parseTraitor('bot2'), 2);
  eq(ctx.Bots.parseTraitor('none'), -1);
  eq(ctx.Bots.parseTraitor('random'), undefined);
  eq(ctx.Bots.parseTraitor(undefined), undefined);
  eq(ctx.Bots.parseTraitor('nonsense'), undefined, 'unreadable is left to the seed');
});

test('the door is shut unless the address bar opened it', () => {
  const ctx = fresh();
  eq(ctx.Bots.fromLocation(), null, 'no argument, no rehearsal');
  ctx.location.search = '?bots=finale&traitor=you&seed=99';
  const c = ctx.Bots.fromLocation();
  eq(c.parts, ['finale']);
  eq(c.traitorSeat, 0);
  eq(c.seed, 99);
});

test('a hash works as well as a query, because a phone is typing it', () => {
  const ctx = fresh();
  ctx.location.hash = '#bots=intro,finale&traitor=none';
  const c = ctx.Bots.fromLocation();
  eq(c.parts, ['intro', 'finale']);
  eq(c.traitorSeat, -1);
});

/* ---------------- the gate ---------------- */

section('bots — what a real night refuses');

test('a night that is not a rehearsal deals its own hand', () => {
  const ctx = fresh();
  // seat 2, asked for, and ignored — the seed decides for a real party
  const forced = [];
  for (let seed = 1; seed <= 60; seed++) {
    ctx.Session.startParty({ seed, players: PLAYERS, mode: 'host', traitorSeat: 2 });
    forced.push(ctx.Session._peek().seat);
  }
  ok(new Set(forced).size > 1,
     'sixty nights asked for seat 2 and did not all get it');
  ok(!ctx.Session.rehearsal, 'and none of them was a rehearsal');
});

test('a night that is not a rehearsal plays the whole running order', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 5, players: PLAYERS, mode: 'host',
                           parts: ['finale'] });
  eq(ctx.Session.state.phase, 'hill', 'it still opens on the hill');
  eq(ctx.Session.state.parts, ctx.Session.PARTS, 'and it still plays everything');
});

test('a rehearsal is honoured, and says so', () => {
  const ctx = fresh();
  startRehearsal(ctx, { traitorSeat: 2 });
  eq(ctx.Session._peek(), { has: true, seat: 2 });
  ok(ctx.Session.rehearsal, 'the flag is readable');
  startRehearsal(ctx, { traitorSeat: -1 });
  eq(ctx.Session._peek(), { has: false, seat: -1 }, 'and a clean night is askable');
  startRehearsal(ctx, { traitorSeat: 0 });
  eq(ctx.Session.myRole(), 'traitor', 'seat 0 is you');
});

test('abandoning a rehearsal closes the door behind it', () => {
  const ctx = fresh();
  startRehearsal(ctx, { traitorSeat: 0 });
  ctx.Session.abandon();
  ok(!ctx.Session.rehearsal);
});

/* ---------------- the running order ---------------- */

section('bots — a night with parts switched off');

test('only the fire opens straight into the fire', () => {
  const ctx = fresh();
  const s = startRehearsal(ctx, { parts: ['finale'] });
  eq(s.phase, 'finale', 'no hill and no mission');
  ok(s.missions.every(m => m.done), 'the mission counted as played');
  ok(s.pot > 0, 'and paid into the pot: ' + s.pot);
  ok(!!s.debrief && s.debrief.rows.length === 3,
     'with a board the fire can put up');
  eq(s.finale.stage, 'name', 'and the one ballot ready to open');
});

test('a skipped mission is indistinguishable from a played one', () => {
  const ctx = fresh();
  const s = startRehearsal(ctx, { parts: ['finale'] });
  for (const m of s.missions) {
    ok(m.done && m.earned > 0, m.id + ' was marked done with money on it');
  }
  eq(s.pot, s.missions.reduce((n, m) => n + m.earned, 0),
     'the pot is exactly what it paid');
});

test('the welcome then the fire skips everything between', () => {
  const ctx = fresh();
  const s = startRehearsal(ctx, { parts: ['intro', 'finale'] });
  eq(s.phase, 'hill');
  ctx.Session.dispatch({ type: 'advance' });
  eq(ctx.Session.state.phase, 'finale', 'the hill hands straight to the fire');
});

test('the mission hands straight to the fire', () => {
  const ctx = fresh();
  const s = startRehearsal(ctx, { parts: ['m1', 'finale'] });
  eq(s.phase, 'mission');
  eq(s.missionAt, 0);
  ctx.Session.dispatch({ type: 'result', earned: 1000, completed: true, players: [] });
  eq(ctx.Session.state.phase, 'finale', 'and there is nothing between them');
  ok(ctx.Session.state.scene.phase === 'finale' && !ctx.Session.state.scene.started,
     'and the scene handshake was reset rather than inherited');
});

/* The rehearsal door is the only thing left that can deal a night with
   nobody in it. A real night always has a Traitor. */
test('the welcome alone, and then the night is simply over', () => {
  const ctx = fresh();
  const s = startRehearsal(ctx, { parts: ['intro'], traitorSeat: -1 });
  eq(s.phase, 'hill');
  ctx.Session.dispatch({ type: 'advance' });          // hill -> nothing left
  eq(ctx.Session.state.phase, 'verdict');
  const o = ctx.Session.state.outcome;
  ok(o && o.won, 'a Faithful still sitting there with no Traitor in the game won');
  eq(o.hadTraitor, false);
});

test('a rehearsal fire still plays a whole finale', () => {
  const ctx = fresh();
  startRehearsal(ctx, { parts: ['finale'], traitorSeat: 1 });
  const S = ctx.Session;
  eq(S.state.finale.stage, 'name', 'straight onto the naming');
  S.dispatch({ type: 'name', playerId: 'you', targetId: 'bot1' });
  S.dispatch({ type: 'name', playerId: 'bot1', targetId: 'you' });
  S.dispatch({ type: 'name', playerId: 'bot2', targetId: 'bot1' });
  eq(S.state.finale.stage, 'names');
  for (let i = 0; i < 3; i++) S.dispatch({ type: 'speakName' });
  eq(S.state.finale.stage, 'reveal');
  S.dispatch({ type: 'reveal' });
  eq(S.state.finale.stage, 'pouches', 'two left, so the night stops itself');
  let guard = 0;
  while (S.state.phase === 'finale' && guard++ < 6) S.dispatch({ type: 'pouch' });
  eq(S.state.phase, 'verdict');
  ok(S.state.outcome.won, 'the named Traitor burned and the Faithfuls took it');
});

/* ---------------- the board they argue about ---------------- */

section('bots — the board');

test('the two of them get rows shaped like yours, and no stats', () => {
  const ctx = fresh();
  ctx.Bots.start(Object.assign({}, RIG, { parts: ['m1', 'table', 'finale'] }));
  const board = ctx.Bots.board({
    name: 'You', earned: 4000, completed: true,
    columns: ['Place', 'Won', 'Gates'],
    cells: ['1st', '£4,000', '12'],
    stats: { gates: 12 },
  });
  ctx.Bots.stop();
  eq(board.rows.length, 3, 'three rows');
  eq(board.columns, ['Place', 'Won', 'Gates']);
  ok(board.rows.every(r => r.cells.length === 3), 'and every row fills them');
  const me = board.rows.find(r => r.playerId === 'you');
  const them = board.rows.filter(r => r.playerId !== 'you');
  ok(me.stats && me.stats.gates === 12, 'your own stats survive, so a task can be judged');
  ok(them.every(r => !r.stats),
     'and theirs never exist, so a bot is never exposed for a task it could not do');
  eq(board.earned, board.rows.reduce((n, r) => n + r.earned, 0),
     'the pot is the three of you');
  ok(board.rows.every((r, i) => r.place === i + 1), 'placed by what they won');
});

/* ---------------- the two of them, actually playing ---------------- */

section('bots — driving a fire');

/* The finale's own scene walks the ceremony; there is no scene in here,
   so the test plays that part. Everything a *contestant* does — both
   ballots, from both bots — is the real driver reacting to the real
   session over the real transport. */
async function ceremony(ctx, myName) {
  const S = ctx.Session;
  const send = (a) => ctx.Net.send(a);
  await H.flush();
  let guard = 0;
  while (S.state.phase === 'finale' && guard++ < 24) {
    const f = S.state.finale;
    if (f.stage === 'name') {
      if (!f.names.you) send({ type: 'name', playerId: 'you', targetId: myName(ctx) });
      await settle(ctx, () => S.state.finale.stage !== 'name');
      continue;
    } else if (f.stage === 'names') send({ type: 'speakName' });
    else if (f.stage === 'reveal') send({ type: 'reveal' });
    else if (f.stage === 'pouches') send({ type: 'pouch' });
    else break;
    await H.flush();
  }
  return S.state;
}

// the bots answer on a timer, so the test has to be able to wait on them
async function settle(ctx, done, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (done()) return true;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error('the bots never answered');
}

const A1 = () => H.atest('an open floor talks itself out without anybody chairing it', async () => {
  const ctx = fresh();
  ctx.Bots.start(Object.assign({}, RIG, { parts: ['finale'] }));
  const S = ctx.Session;
  eq(S.state.phase, 'finale');
  ctx.Net.send({ type: 'openFloor', all: true });
  await settle(ctx, () => (S.state.floor && S.state.floor.ready.length) >= 2);
  eq(S.state.floor.ready.slice().sort(), ['bot1', 'bot2'],
     'both of them said they had said enough');
  ok(!S.state.floor.done, 'and the floor waits for you before it moves on');
  ctx.Net.send({ type: 'yieldFloor', playerId: 'you' });
  await settle(ctx, () => S.state.floor.done);
  ctx.Bots.stop();
});

const A2 = () => H.atest('a turn floor at the fire goes round on its own after you', async () => {
  const ctx = fresh();
  ctx.Bots.start(Object.assign({}, RIG, { traitorSeat: -1 }));
  const S = ctx.Session;
  ctx.Net.send({ type: 'openFloor', seconds: 30 });
  await H.flush();
  eq(S.state.floor.playerId, 'you', 'seat order puts you first');
  ctx.Net.send({ type: 'yieldFloor', playerId: 'you' });
  await settle(ctx, () => S.state.floor.done, 400);
  ok(S.state.floor.done, 'and it walked through both of them to the end');
  ctx.Bots.stop();
});

const A3 = () => H.atest('both bots name somebody, and the fire reaches a verdict', async () => {
  const ctx = fresh();
  ctx.Bots.start(Object.assign({}, RIG, { traitorSeat: 1 }));
  const S = ctx.Session;
  eq(S.state.phase, 'finale', 'straight to the fire');
  await settle(ctx, () => Object.keys(S.state.finale.names).length >= 2);
  eq(Object.keys(S.state.finale.names).sort(), ['bot1', 'bot2'],
     'both of them answered without being asked');
  const st = await ceremony(ctx, () => 'bot1');
  ctx.Bots.stop();
  eq(st.phase, 'verdict');
  ok(st.outcome, 'and it produced one');
});

// one at a time: each builds its own night, and a report printed while
// another is still running is a report of the wrong thing
(async () => { await A2(); await A1(); await A3(); H.report(); })();
