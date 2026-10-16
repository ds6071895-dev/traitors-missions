/* ------------------------------------------------------------------
   exposure.test.js — the poison nobody used, and the room it ends in.

   `session.test.js` proves the reducer half: a carrier who let the bell
   go with the poison still in their pocket is exposed at the round
   table, and is that table's banishment. This covers the scene half
   that is pure logic: the ceremony's last beat opens the verdict when
   it was the last Traitor, a guest opens the same panel off the packet
   it is waiting for, and a table with a Traitor left goes on without
   a vote.
------------------------------------------------------------------ */
const H = require('./harness');
const { atest, flush, eq, ok, section, report } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/session.js',
               'js/core/net.js', 'js/scenes/claudia-lines.js', 'js/scenes/exposed.js'];

let now = 1.7e12;
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(now); }
  static now() { return now; }
}

const roster = (n) => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].slice(0, n)
  .map((id, i) => ({ id, name: id.toUpperCase() + 'nn', local: i === 0 }));

/* The loopback the real solo night runs on, small enough to live here. */
function wire(ctx) {
  const EV = ['phase', 'expose', 'outcome', 'sync'];
  return {
    open(emit) {
      this._offs = EV.map(name => ctx.Session.on(name, (a) => {
        if (name === 'phase') return emit({ type: 'phase', phase: a });
        if (name === 'outcome') return emit({ type: 'outcome', outcome: a });
        if (name === 'sync') return emit(Object.assign({ type: 'sync' }, a));
        return emit(Object.assign({ type: 'expose' }, a));
      }));
    },
    close() { (this._offs || []).forEach(off => off()); this._offs = null; },
    send(action) { ctx.Session.dispatch(Object.assign({}, action, { authority: true })); },
  };
}

/* A day in which the carrier never used it, stopped at the round table. */
function owingACeremony(n = 5, seed = 4) {
  const ctx = H.load(FILES, { Date: FakeDate });
  ctx.GameState.load();
  ctx.Session.startParty({ seed, players: roster(n), mode: 'host' });
  const carrier = ctx.Session.playerById(ctx.Session._peek().carrier);
  ctx.Net.connect(wire(ctx));
  ctx.Session.dispatch({ type: 'advance', authority: true });
  now = ctx.Session.state.chores.endsAt + 50;
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
  eq(ctx.Session.state.phase, 'table');
  ok(ctx.Session.hasExposure(), 'the table owes a ceremony');
  return { ctx, carrier };
}

const scene = { stage: { setControls() {} }, takeEmbers() {} };

async function main() {

section('exposure — the last Traitor, exposed');

await atest('the last beat opens the verdict panel', async () => {
  const { ctx, carrier } = owingACeremony();
  let told = null;
  ctx.Net.on((e) => { if (e.type === 'expose') told = e; });
  ctx.Net.send({ type: 'expose' });
  await flush();
  ok(told && told.playerId === carrier.id, 'the room was told who');
  const beats = ctx.Exposed.beats(scene, told, ctx.Session.state.seed);
  ok(beats.some(b => b.line && /poison|pocket|nerve|bottle/i.test(b.line.text)), 'Claudia says what it was for');
  const last = beats[beats.length - 1];
  const shown = [];
  ctx.Show = { showVerdict: (o) => shown.push(o) };
  await last.then();
  eq(ctx.Session.state.phase, 'verdict', 'the game is over in the session');
  eq(shown.length, 1, 'and the panel was opened exactly once');
  eq(shown[0].reason, 'exposed', 'with the ending that actually happened');
  eq(shown[0].roles.length, 5, 'and every card face up');
});

await atest('a guest opens the same panel off the packet it is waiting for', async () => {
  const { ctx } = owingACeremony();
  ctx.Net.send({ type: 'expose' });
  await flush();
  let landed = null;
  const waiting = ctx.Exposed.outcome(3000).then(o => { landed = o; });
  await flush();
  eq(landed, null, 'nothing to show yet, and no guess made');
  ctx.Net.send({ type: 'exposeDone' });
  await waiting;
  ok(landed && landed.reason === 'exposed', 'the packet released it');
});

await atest('the waiter answers rather than hanging when nothing ever comes', async () => {
  const { ctx } = owingACeremony();
  eq(await ctx.Exposed.outcome(0), null, 'a game that never produced a verdict still lets the scene end');
});

section('exposure — a table of seven goes on without them');

await atest('one of two Traitors exposed: no vote today, and the castle goes to bed', async () => {
  const { ctx, carrier } = owingACeremony(7, 9);
  let told = null;
  ctx.Net.on((ev) => { if (ev.type === 'expose') told = ev; });
  ctx.Net.send({ type: 'expose' });
  await flush();
  eq(told.playerId, carrier.id, 'the carrier is named');
  ctx.Net.send({ type: 'exposeDone' });
  await flush();
  eq(ctx.Session.state.phase, 'table', 'still at the table');
  eq(ctx.Session.state.finale.stage, 'done', 'but there is nothing left to vote on');
  ok(!ctx.Session.state.outcome, 'nobody has won anything yet');
  ctx.Net.send({ type: 'advance' });
  await flush();
  eq(ctx.Session.state.phase, 'night', 'to bed');
});

section('exposure — a day the poison was used is not a ceremony');

await atest('the host answers a definite "nobody"', async () => {
  const ctx = H.load(FILES, { Date: FakeDate });
  ctx.GameState.load();
  ctx.Session.startParty({ seed: 4, players: roster(5), mode: 'host' });
  ctx.Session.setEyes({ reach: () => 1, witnesses: () => ({ ids: [], room: 'hall' }), presence: () => ({}) });
  ctx.Net.connect(wire(ctx));
  ctx.Session.dispatch({ type: 'advance', authority: true });
  const pk = ctx.Session._peek();
  const victim = ctx.Session.alive().find(p => pk.seats.indexOf(p.seat) < 0);
  ctx.Session.dispatch({ type: 'poison', playerId: pk.carrier, targetId: victim.id });
  now = ctx.Session.state.chores.endsAt + 50;
  ctx.Session.dispatch({ type: 'tasksTick', authority: true });
  let told = 'unset';
  ctx.Net.on((e) => { if (e.type === 'expose') told = e; });
  ctx.Net.send({ type: 'expose' });
  await flush();
  eq(told.playerId, null, 'the room got a definite "nobody"');
  ok(ctx.Session.state.phase !== 'verdict', 'and the game carries on');
});

}

main().then(report);
