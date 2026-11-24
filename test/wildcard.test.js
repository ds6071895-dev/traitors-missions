/* ------------------------------------------------------------------
   wildcard.test.js — swing votes last, wild cards found, a playbook.

   On a revote the people who changed their vote are turned after the
   ones who held firm. A result that turned on one slate or on a change
   of heart is found the same way on every screen. And the AIs' plays
   suit the moment and push their votes the way the play says.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/session.js',
               'js/scenes/wildcard.js', 'js/core/ai-strategy.js'];

let clock = 1.7e12;
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(clock); }
  static now() { return clock; }
}
const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: id.toUpperCase() + 'nn', local: i === 0 }));

function atFire(seed) {
  const ctx = H.load(FILES, { Date: FakeDate });
  ctx.GameState.load();
  ctx.Session.startParty({ seed, players: FIVE, mode: 'host' });
  ctx.Session.jumpTo('finale');
  for (const p of ctx.Session.alive()) ctx.Session.dispatch({ type: 'decide', playerId: p.id, choice: 'banish' });
  for (let i = 0; i < 5; i++) ctx.Session.dispatch({ type: 'decisionPouch' });
  return ctx;
}
function ballot(ctx, names) {
  for (const [who, whom] of names) ctx.Session.dispatch({ type: 'name', playerId: who, targetId: whom });
}
function turnAll(ctx) {
  for (let i = 0; i < 8 && ctx.Session.state.finale.stage === 'names'; i++) ctx.Session.dispatch({ type: 'speakName' });
}

section('the revote');

test('swing voters are turned last, and the change of heart that decided it is a wild card', () => {
  const ctx = atFire(31);
  const S = ctx.Session;
  eq(S.state.finale.stage, 'name');
  // c and d tie on two each
  ballot(ctx, [['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'c'], ['e', 'b']]);
  turnAll(ctx);
  eq(S.state.finale.nameRound, 1, 'a revote');
  eq(JSON.stringify(S.state.finale.tied), JSON.stringify(['c', 'd']));
  ok(S.state.finale.prevNames && S.state.finale.prevNames.b === 'd', 'the first slates are remembered');
  // b swings from d to c; e had to change (b is off the slate)
  ballot(ctx, [['a', 'c'], ['b', 'c'], ['c', 'd'], ['d', 'c'], ['e', 'd']]);
  const f = S.state.finale;
  eq(f.stage, 'names');
  eq(f.nameQueue.slice(-2).sort().join(','), 'b,e', 'the changed votes come last');
  ok(S.changedVote(f, 'b') && !S.changedVote(f, 'a'), 'and the scene can tell which they are');
  turnAll(ctx);
  eq(f.stage, 'reveal');
  eq(f.pending, 'c');
  const w = ctx.Wildcard.detect(S.state);
  ok(w && w.kind === 'swing', 'found: ' + (w && w.kind));
  eq(w.by, 'b', 'the swing that counted was b (e had no choice)');
  ok(/would be going/.test(w.line), w.line);
});

test('a name that goes by a single vote is a wild card; a clear one is not', () => {
  const ctx = atFire(32);
  ballot(ctx, [['a', 'c'], ['b', 'c'], ['d', 'c'], ['c', 'd'], ['e', 'd']]);
  turnAll(ctx);
  const w = ctx.Wildcard.detect(ctx.Session.state);
  ok(w && w.kind === 'knife', 'three to two');
  eq(w.other, 'd');
  const ctx2 = atFire(33);
  ballot(ctx2, [['a', 'c'], ['b', 'c'], ['d', 'c'], ['e', 'c'], ['c', 'd']]);
  turnAll(ctx2);
  eq(ctx2.Wildcard.detect(ctx2.Session.state), null, 'four to one is the table, not luck');
});

section('the playbook');

const base = { seed: 5, phase: 'table', day: 1, alive: 6 };
test('two AIs at one table do not all play the same signature strategy', () => {
  const ctx = H.load(FILES, { Date: FakeDate });
  const A = ctx.AIStrategy;
  ok(A.FAITHFUL.length >= 12 && A.TRAITOR.length >= 12, 'loads of plays');
  const sigs = new Set(['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map(id => A.signature(Object.assign({ botId: id }, base)).id));
  ok(sigs.size >= 3, 'varied: ' + [...sigs].join(', '));
});

test('the moment picks the play: a revote, a doomed partner, the fire', () => {
  const ctx = H.load(FILES, { Date: FakeDate });
  const A = ctx.AIStrategy;
  const ids = (c) => A.situational(c, 2).map(s => s.id);
  ok(ids(Object.assign({ botId: 'x', revote: true }, base)).indexOf('swing-reader') >= 0, 'Faithful reads the swings');
  ok(ids(Object.assign({ botId: 'x', traitor: true, revote: true }, base)).indexOf('revote-push') >= 0, 'Traitor works the revote');
  ok(ids(Object.assign({ botId: 'x', traitor: true, partnerHeat: true, partnerDoomed: true }, base)).indexOf('bus') >= 0, 'bus a lost partner');
  ok(ids(Object.assign({ botId: 'x', traitor: true, atFire: true }, base, { phase: 'finale' })).indexOf('close-it') >= 0, 'close the game at the fire');
  const p = A.promptText(Object.assign({ botId: 'x' }, base));
  ok(/signature strategy/.test(p) && /Never name a strategy/.test(p), 'prompt text');
});

test('a Traitor splitting the vote pushes a second Faithful name, never the partner', () => {
  const ctx = H.load(FILES, { Date: FakeDate });
  const A = ctx.AIStrategy;
  const c = Object.assign({ botId: 'x', traitor: true, partnerHeat: true, partnerDoomed: false }, base);
  ok(A.voteBias(c, { id: 'f', n: 1, score: 0, partner: false }) > A.voteBias(c, { id: 'p', n: 3, score: 0, partner: true }));
});

H.report();
