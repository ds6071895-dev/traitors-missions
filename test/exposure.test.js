const finishTravel = require('./travel-helper');
/* ------------------------------------------------------------------
   exposure.test.js — the night ends in the room it ended in.

   `session.test.js` already proves the reducer half: a Traitor who
   left their task undone is exposed, the pot goes to the Faithfuls and
   the phase becomes `verdict`. All of that was correct and none of it
   was ever visible, because nothing on the far side of `exposeDone`
   put a verdict panel on the screen. The director only opens one for a
   client that arrives in the phase cold; on an ordinary night the fire
   opens its own after Claudia's last line, and an exposure never
   reaches that code — it ends the night from inside a room that has no
   ballot in it. So three browsers sat looking at a table nobody could
   leave, with the game finished behind them.

   This covers the two halves of the fix that are pure logic: the
   ceremony's last beat, and the waiter it is built on.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, atest, flush, eq, ok, section, report } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/missions.js',
               'js/missions/agendas.js', 'js/core/session.js', 'js/core/net.js',
               'js/scenes/claudia-lines.js', 'js/scenes/exposed.js'];

const PLAYERS = [
  { id: 'a', name: 'Ana', local: true },
  { id: 'b', name: 'Bo', local: false },
  { id: 'c', name: 'Cy', local: false },
];

/* The loopback the real solo night runs on, small enough to live here:
   everything a scene sends is stamped as the authority and handed
   straight to the reducer, and everything the reducer emits comes back
   out on `Net`. It is `Transports.SoloTransport` with the parts this
   file does not need left out. */
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

/* A night with a Traitor in it who did not do the work, stopped one
   beat before the ceremony. */
function owingACeremony() {
  const ctx = H.load(FILES);
  ctx.GameState.load();
  for (const id of ['boat-race', 'shootout', 'dive']) {
    ctx.Missions.register({ id, name: id, create: () => ({}) });
  }
  ctx.Session.startParty({ seed: 4, players: PLAYERS, mode: 'host' });
  const traitor = ctx.Session.state.players[ctx.Session._peek().seat];

  ctx.Net.connect(wire(ctx));
  ctx.Session.dispatch({ type: 'advance' });
  finishTravel(ctx);
  /* The card is never marked, which is what an unfinished task is now:
     nothing on the host can hear a microphone, so an unmarked card at
     the deadline is the whole of the evidence. */
  ctx.Session.dispatch({
    type: 'result', earned: 2000, completed: true,
    players: ctx.Session.state.players.map(p => ({
      playerId: p.id, name: p.name, earned: 600, columns: ['A'], cells: ['x'],
      stats: {},
    })),
  });
  finishTravel(ctx);
  ok(ctx.Session.hasExposure(), 'the night owes a ceremony');
  return { ctx, traitor };
}

/* Enough of a room for the beat list to be built: it reads the stage
   only through these, and never during the beat this file runs. */
const scene = { stage: { setControls() {} }, takeEmbers() {} };

async function main() {

section('exposure — the ceremony ends the night');

await atest('the last beat opens the verdict panel', async () => {
  const { ctx, traitor } = owingACeremony();

  let told = null;
  ctx.Net.on((e) => { if (e.type === 'expose') told = e; });
  ctx.Net.send({ type: 'expose' });
  await flush();
  ok(told && told.playerId === traitor.id, 'the room was told who');

  const beats = ctx.Exposed.beats(scene, told, ctx.Session.state.seed);
  const last = beats[beats.length - 1];
  ok(last && typeof last.then === 'function', 'the ceremony ends in an action');

  // the panel, stubbed: this file is about whether it is asked for
  const shown = [];
  ctx.Show = { showVerdict: (o) => shown.push(o) };

  await last.then();

  eq(ctx.Session.state.phase, 'verdict', 'the night is over in the session');
  eq(shown.length, 1, 'and the panel was opened exactly once');
  eq(shown[0].reason, 'agenda', 'with the ending that actually happened');
  ok(shown[0].roles.length === 3, 'and every card face up');
});

await atest('a guest opens the same panel off the packet it is waiting for', async () => {
  const { ctx } = owingACeremony();

  ctx.Net.send({ type: 'expose' });
  await flush();

  /* A guest never sends `exposeDone` — it waits for the outcome to
     arrive. Nothing has produced one yet, so the waiter must still be
     pending here and must finish the moment one exists. */
  let landed = null;
  const waiting = ctx.Exposed.outcome(3000).then(o => { landed = o; });
  await flush();
  eq(landed, null, 'nothing to show yet, and no guess made');

  ctx.Net.send({ type: 'exposeDone' });
  await waiting;
  ok(landed && landed.reason === 'agenda', 'the packet released it');
});

await atest('the waiter answers rather than hanging when nothing ever comes', async () => {
  const { ctx } = owingACeremony();
  const out = await ctx.Exposed.outcome(0);
  eq(out, null, 'a night that never produced a verdict still lets the scene end');
});

section('exposure — a clean night is not a ceremony');

/* Every night has a Traitor now, so a clean night is not one with
   nobody in it — it is one where the Traitor marked their card. The
   host still has to answer "nobody", promptly, because a guest that
   asked and heard nothing cannot tell a clean night from a packet
   still in flight. */
await atest('a marked task means no beats and no panel', async () => {
  const ctx = H.load(FILES);
  ctx.GameState.load();
  for (const id of ['boat-race', 'shootout', 'dive']) {
    ctx.Missions.register({ id, name: id, create: () => ({}) });
  }
  ctx.Session.startParty({ seed: 4, players: PLAYERS, mode: 'host' });
  const traitor = ctx.Session.state.players[ctx.Session._peek().seat];
  ctx.Net.connect(wire(ctx));
  ctx.Session.dispatch({ type: 'advance' });
  finishTravel(ctx);
  ctx.Session.dispatch({ type: 'taskDone', playerId: traitor.id });
  ctx.Session.dispatch({ type: 'result', earned: 10, completed: true,
    players: PLAYERS.map(p => ({ playerId: p.id, stats: {} })) });
  finishTravel(ctx);

  let told = 'unset';
  ctx.Net.on((e) => { if (e.type === 'expose') told = e; });
  ctx.Net.send({ type: 'expose' });
  await flush();
  eq(told.playerId, null, 'the room got a definite "nobody"');
  ok(ctx.Session.state.phase !== 'verdict', 'and the night carries on');
});

}

main().then(report);
