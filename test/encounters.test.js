/* Real navigation and poison rules during short, voice-led social detours. */
const H = require('./harness');
const { test, eq, ok } = H;

function world(carrier = false) {
  let now = 1.7e12;
  class FakeDate extends Date { static now() { return now; } }
  const talks = [], actions = [];
  const ctx = H.load(['js/core/util.js', 'js/core/state.js', 'js/world/castle-layout.js', 'js/core/chores.js',
    'js/core/session.js', 'js/core/castle-net.js', 'js/core/castle-bots.js'], {
    Date: FakeDate, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    Net: { send(action) { actions.push(action); ctx.Session.dispatch(action); } },
    Scenes: { botSpeechBlocked: false },
    AIDirector: { startEncounter(id, target, onSpoken) { talks.push({ id, target, onSpoken }); return true; } },
  });
  ctx.GameState.load();
  ctx.Session.startParty({ seed: 1, mode: 'host', players: [
    { id: 'ana', name: 'Ana', local: true }, { id: 'bo', name: 'Bo' },
    ...['morag', 'fergus', 'isla', 'struan'].map(id => ({ id, name: id, bot: true })),
  ] });
  ctx.Session.dispatch({ type: 'advance' });
  ctx.Session.state.chores.startedAt = now - 60000;
  ctx.Session.state.chores.endsAt = now + 120000;
  ctx.CastleNet.start('d0');
  ctx.Session.setEyes(ctx.CastleNet.eyes);
  const id = carrier ? 'isla' : 'morag';
  ctx.CastleBots.start([id], { seed: 1, spawn: () => ({ x: 0, z: 10 }) });
  const bot = ctx.CastleBots.bots[0];
  bot.stalkAfter = 0;
  ctx.CastleNet.publish('ana', 5, 10, 0);
  ctx.CastleBots.update(0);
  return { ctx, bot, talks, actions,
    step(seconds) { for (let i = 0; i < seconds * 10; i++) { now += 100; ctx.CastleBots.update(0.1); } },
  };
}

test('a bot walks over, faces the human, talks once and returns to its unfinished job', () => {
  const W = world();
  const b = W.bot;
  b.plan = { kind: 'station', sx: 0, sz: 6, work: 100, job: 'unfinished', arrived: false };
  ok(W.ctx.CastleBots.approach(b.id, 'ana'));
  eq(W.talks.length, 0, 'no speech from across the room');
  W.step(3);
  eq(W.talks.length, 1, 'starts one conversation after arriving');
  ok(Math.hypot(b.x - 5, b.z - 10) < 1.7, 'stands at conversational distance');
  ok(Math.sin(b.h) > 0.8, 'faces the person');
  W.step(16);
  eq(b.social, null, 'the visit is brief');
  eq(b.plan.job, 'unfinished', 'the task was not discarded');
  ok(b.route.length > 0 || b.plan.arrived, 'goes back to the job');
  eq(W.actions.filter(a => a.type === 'poison').length, 0, 'a Faithful only chats');
});

test('bots do not abandon an active puzzle, mob a player, or keep following somebody who leaves', () => {
  const W = world();
  W.bot.plan = { kind: 'station', arrived: true, work: 100 };
  ok(!W.ctx.CastleBots.approach(W.bot.id, 'ana'), 'finish the current puzzle first');
  W.bot.plan = null;
  ok(W.ctx.CastleBots.approach(W.bot.id, 'ana'));
  ok(!W.ctx.CastleBots.canApproach(W.bot.id), 'only one social detour at a time');
  W.step(3);
  W.ctx.CastleNet.publish('ana', 20, 13.5, 0);
  W.step(0.2);
  eq(W.bot.social, null, 'walking away ends the visit');
});

test('a carrier uses a real conversation to poison through the normal reach and hold rules', () => {
  const W = world(true);
  ok(W.ctx.Session.privateView(W.bot.id).poison.mine, 'the seeded bot carries the poison');
  ok(W.ctx.CastleBots.approach(W.bot.id, 'ana'));
  W.step(6);
  eq(W.talks.length, 1);
  eq(W.actions.filter(a => a.type === 'poison').length, 0, 'no poison before any actual speech');
  W.talks[0].onSpoken();
  W.step(3);
  eq(W.actions.filter(a => a.type === 'poison').length, 0, 'the full hand-over still takes time');
  W.step(3);
  eq(W.actions.filter(a => a.type === 'poison').length, 1, 'one attempt, using the real action');
  eq(W.ctx.Session.privateView(W.bot.id).poison.target, 'ana', 'the reducer accepted the close-range hand-over');
});

test('conversation does not bypass witnesses or Claudia’s speech guard', () => {
  const W = world(true);
  W.ctx.CastleNet.publish('bo', 4, 12, Math.PI);
  ok(W.ctx.CastleBots.approach(W.bot.id, 'ana'));
  W.step(3);
  W.talks[0].onSpoken();
  W.step(6);
  eq(W.actions.filter(a => a.type === 'poison').length, 0, 'a witness stops the early attempt');
  W.ctx.CastleNet.publish('bo', 0, -22, 0);
  W.step(6);
  eq(W.actions.filter(a => a.type === 'poison').length, 1, 'the carrier can act when the witness leaves');

  const quiet = world();
  ok(quiet.ctx.CastleBots.approach(quiet.bot.id, 'ana'));
  quiet.ctx.Scenes.botSpeechBlocked = true;
  quiet.step(3);
  eq(quiet.talks.length, 0, 'Claudia cancels the social detour');
  eq(quiet.bot.social, null);
});

H.report();
