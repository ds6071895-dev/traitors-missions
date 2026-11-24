/* ------------------------------------------------------------------
   ghost-jobs.test.js — the dead can still play the jobs.

   A human who is out keeps a list: stations and errands, never a letter
   (there is nobody to hand one to). Doing one pays nothing into the pot,
   counts for no shield, and moves nothing anybody else can see. An AI
   that is out is dealt nothing.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/twists.js', 'js/core/session.js'];
let clock = 1.7e12;
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(clock); }
  static now() { return clock; }
}
const SEVEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ id, name: id.toUpperCase() + 'nn', local: i === 0, bot: id === 'f' }));

section('ghost jobs');

test('a ghost gets a list, with no letters, and it pays nothing', () => {
  for (const seed of [3, 11, 29, 41]) {
    const ctx = H.load(FILES, { Date: FakeDate });
    ctx.GameState.load();
    const S = ctx.Session;
    S.startParty({ seed, players: SEVEN, mode: 'host' });
    S.setEyes({ reach: () => 1, witnesses: () => ({ ids: [], room: 'hall' }) });
    S.playerById('g').alive = false;
    S.playerById('f').alive = false;
    S.dispatch({ type: 'advance', authority: true });
    eq(S.state.phase, 'tasks');
    const jobs = S.privateView('g').jobs;
    ok(jobs.length > 0, 'the ghost has jobs');
    ok(jobs.every(j => j.kind !== 'letter'), 'never a hand-over');
    eq((S.privateView('f').jobs || []).length, 0, 'a dead AI is dealt nothing');
    const pot = S.state.pot;
    let did = 0;
    for (let i = 0; i < 6; i++) {
      clock += 1000;
      const job = S.privateView('g').jobs.find(j => !j.done);
      ok(job, 'more keep coming');
      S.dispatch({ type: 'chore', playerId: 'g', jobId: job.id });
      if (job.kind === 'carry') S.dispatch({ type: 'chore', playerId: 'g', jobId: job.id });
      did++;
    }
    eq(S.state.pot, pot, 'nothing in the pot');
    ok(!S.state.chores.done.g, 'no shield count');
    eq(S.state.chores.ghost.g, did, 'their own count');
    eq(S.shieldLeader(), null, 'nobody holds the shield on a ghost\'s work');
    S.abandon();
  }
});

section('twist chance');

test('how often: off never, every day every allowed day, and in between in proportion', () => {
  const ctx = H.load(['js/core/twists.js'], {});
  const T = ctx.Twists;
  let none = 0, every = 0, rare = 0, often = 0;
  for (let seed = 1; seed <= 400; seed++) {
    if (T.pick(seed, 2, { chance: 0 })) none++;
    if (T.pick(seed, 2, { chance: 1, yesterday: 'sealed' })) every++;
    if (T.pick(seed, 2, { chance: 0.25 })) rare++;
    if (T.pick(seed, 2, { chance: 0.75 })) often++;
  }
  eq(none, 0, 'zero is never');
  eq(every, 400, 'every day, even straight after one');
  ok(rare > 60 && rare < 140, 'rare is about a quarter (' + rare + ')');
  ok(often > 260 && often < 340, 'often is about three quarters (' + often + ')');
  eq(T.pick(5, 2, { chance: 0.5, yesterday: 'sealed' }), null, 'below every day, never two running');
});

section('the count, read out when it could go anywhere');

test('a close race at a big table is counted; a runaway or a small table is not', () => {
  const ctx = H.load(['js/scenes/castle-scene.js'], {});
  const M = ctx.CastleScene.countMoment;
  const c = () => ({ n: 0, last: -9, key: '' });
  const T = (o) => new Map(Object.entries(o));
  ok(M(T({ bo: 2, isla: 2 }), 3, 4, 8, c()), 'level with three to come');
  ok(M(T({ bo: 3, isla: 2 }), 2, 5, 8, c()), 'a vote apart, still open');
  ok(!M(T({ bo: 4, isla: 1 }), 2, 5, 8, c()), 'a runaway is not a race');
  ok(!M(T({ bo: 2, isla: 1 }), 2, 3, 5, c()), 'five at the table: no count');
  ok(!M(T({ bo: 2, isla: 2 }), 0, 4, 8, c()), 'nothing left to turn');
  ok(!M(T({ bo: 1, isla: 1 }), 5, 2, 8, c()), 'too early to call');
  const k = c();
  const first = M(T({ bo: 2, isla: 2 }), 3, 4, 8, k);
  Object.assign(k, { n: 1, last: 4, key: first.key });
  ok(M(T({ bo: 3, isla: 2 }), 2, 5, 8, k), 'the lead changing hands is told, even the next slate');
  ok(!M(T({ bo: 2, isla: 2, mo: 1 }), 2, 5, 8, k), 'the same standing, the very next slate, is not told twice');
  ok(!M(T({ bo: 3, isla: 3 }), 1, 6, 8, { n: 3, last: 0, key: '' }), 'three times a ballot at most');
});

H.report();
