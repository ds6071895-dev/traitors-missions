/* ------------------------------------------------------------------
   agendas.test.js — the deck, at its edges.

   The old deck was arithmetic and this file was mostly thresholds: a
   card that wanted eight perfect passes was fed seven and nine, because
   an off-by-one there is a Traitor exposed for doing exactly what they
   were told. None of that applies now. The deck is voice, nothing
   checks it, and there is no boundary in the whole file to be off by
   one on.

   What is left is worth more than it looks, because the deck is
   generated. Two hundred-odd cards are built from a corpus at load, so
   the failure modes moved: a family whose template drops the phrase, a
   corpus entry with no cover written for it, two entries that collide
   on an id, a draw that cannot reach half the deck. Every one of those
   is invisible from any single card and obvious from all of them.

   Three sections, in order of how much they matter.

   The first is the design rule, enforced across the whole corpus: a
   card with no public tell does not belong in the deck, and neither
   does one with no way out. An unhearable task makes the fire
   unwinnable for the Faithfuls; an unsurvivable one makes it
   unwinnable for the Traitor, and the deck was rebuilt to sit between
   those two.

   The second is the deck being big and reachable, which is the entire
   reason it is generated. Three people play this more than once. A
   deck small enough to memorise is not a secret task — it is a quiz
   the Faithfuls already have the answers to.

   The third is the mark: the one assertion in this game that nothing
   can check, and the deadline that is the only thing holding it up.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const ctx = H.load(['js/core/util.js', 'js/missions/agendas.js']);
const A = ctx.Agendas;
const ALL = A.all();

const KINDS = ['aphorism', 'word', 'claim', 'formal', 'number', 'question', 'move'];

section('agendas — every card is a card');

test('the deck is hundreds of cards, not a handful', () => {
  ok(A.size >= 200, 'the deck is ' + A.size + ' cards');
  eq(ALL.length, A.size, 'and `all()` agrees with it');
});

test('every family is represented, and none of them is a token one', () => {
  const by = {};
  ALL.forEach(c => { by[c.kind] = (by[c.kind] || 0) + 1; });
  eq(Object.keys(by).sort(), KINDS.slice().sort(), 'the families are the families');
  for (const k of KINDS) {
    ok(by[k] >= 10, k + ' has only ' + by[k] + ' cards in it');
  }
});

/* The design rule. `text` is the task, `tell` is what the other two
   hear, `alibi` is the harder run that survives it — and a card
   missing any of the three is not a task, it is a formality. */
test('every card has a task, a tell and a way out', () => {
  for (const c of ALL) {
    ok(c.id, 'a card with no id');
    ok(KINDS.indexOf(c.kind) >= 0, c.id + ' has an unknown kind: ' + c.kind);
    for (const field of ['text', 'tell', 'alibi', 'hud']) {
      const v = c[field];
      ok(typeof v === 'string' && v.trim().length > 0,
         c.id + ' has no ' + field);
    }
    ok(c.text.length >= 12, c.id + ' has a task too short to be one: ' + c.text);
    ok(c.tell.length >= 40, c.id + ' has a tell too thin to play against');
    ok(c.alibi.length >= 40, c.id + ' has an alibi too thin to be a way out');
  }
});

/* A generated card whose template forgot to interpolate is the failure
   this whole family of bugs looks like: the card still renders, still
   has all four fields, and tells the Traitor to say nothing in
   particular. */
test('every phrase card actually contains its phrase', () => {
  const carried = ALL.filter(c => c.line);
  ok(carried.length >= 180, 'only ' + carried.length + ' cards carry a phrase');
  for (const c of carried) {
    ok(c.text.indexOf(c.line) >= 0,
       c.id + ' does not contain the thing it is asking for: ' + c.text);
  }
  ok(ALL.filter(c => !c.line).every(c => c.kind === 'move'),
     'only the behavioural family has no phrase of its own');
});

/* The cover is written per entry and the tell per family, and that
   split is the only reason a corpus this size could be written at all.
   So the covers have to be genuinely different from each other — a
   family that fell back to one shared sentence would pass every test
   above and have no game in it. */
test('the way out is written for the card, not for the family', () => {
  for (const k of KINDS) {
    const fam = ALL.filter(c => c.kind === k);
    if (k === 'number') continue;          // the only family with a shared cover
    const alibis = new Set(fam.map(c => c.alibi));
    ok(alibis.size === fam.length,
       k + ' repeats an alibi: ' + fam.length + ' cards, ' + alibis.size + ' ways out');
  }
});

test('no two cards are the same card', () => {
  eq(new Set(ALL.map(c => c.id)).size, ALL.length, 'ids collide');
  eq(new Set(ALL.map(c => c.text)).size, ALL.length, 'two cards ask for the same thing');
});

section('agendas — the draw');

test('drawing is a pure function of the seed', () => {
  const rng = (v) => () => v;
  for (const v of [0, 0.13, 0.5, 0.87, 0.999]) {
    const a = A.draw(rng(v));
    const b = A.draw(rng(v));
    ok(a && b, 'a card came out');
    eq(a.id, b.id, 'the same seed deals the same card');
  }
});

test('the draw stays inside the deck at both ends', () => {
  eq(A.draw(() => 0).id, ALL[0].id, 'the bottom of the range is the first card');
  eq(A.draw(() => 1).id, ALL[ALL.length - 1].id, 'and 1.0 does not fall off the end');
  eq(A.draw(() => 1.5).id, ALL[ALL.length - 1].id, 'nor does a broken generator');
  ok(A.draw(() => NaN), 'and NaN still deals something rather than crashing');
});

/* The point of a corpus is that the other two can know exactly how the
   deck works and still have no idea what you are carrying. That is
   only true if the draw can actually reach all of it. */
test('the seed reaches every card in the deck', () => {
  const seen = new Set();
  const r = ctx.U.makeRng(20260906);
  for (let i = 0; i < 40000; i++) seen.add(A.draw(r).id);
  eq(seen.size, ALL.length,
     'only ' + seen.size + ' of ' + ALL.length + ' cards are reachable');
});

test('a card can be found again from its id alone', () => {
  for (const c of ALL) eq(A.byId(c.id), c, 'byId lost ' + c.id);
  eq(A.byId('nope'), null, 'and an id from nowhere is null, not a throw');
  eq(A.byId(undefined), null, 'as is nothing at all');
});

/* A guest is sent the readable half and nothing else. There is no
   check on a card any more, so there is less to leak than there was —
   but `line`, the raw phrase, has no business crossing a wire when the
   text already carries it, and a wire shape that quietly grows fields
   is how private things escape. */
test('only the readable half of a card crosses the wire', () => {
  const c = A.byId(ALL[0].id);
  const w = A.wire(c);
  eq(Object.keys(w).sort(), ['alibi', 'hud', 'id', 'kind', 'tell', 'text'],
     'the wire shape is exactly these fields');
  eq(w.text, c.text, 'the task itself survives the crossing');
  eq(A.wire(null), null, 'and no card is still no card');
});

section('agendas — the mark');

/* The one assertion in this game with nothing behind it. Everything
   here is the deadline, because the deadline is the only thing that
   makes an honour system hold: a card you can mark after the run is a
   card you settle up on once you know how the night is going. */

test('a fresh night has an unmarked card and an open window', () => {
  A.begin();
  const c = ALL[0];
  eq(A.isClosed(), false, 'the window is open');
  eq(A.isMarked(c.id), false, 'and nothing is marked');
  eq(A.state(c.id, null, false).done, false, 'which the chip agrees with');
});

test('marking takes, and only for the card that was marked', () => {
  A.begin();
  const [c, other] = ALL;
  eq(A.mark(c.id), true, 'the mark took');
  eq(A.isMarked(c.id), true, 'and it is marked');
  eq(A.isMarked(other.id), false, 'and nothing else is');
  eq(A.state(c.id, null, false).done, true, 'the chip says so');
});

test('a card nobody was dealt cannot be marked', () => {
  A.begin();
  eq(A.mark('ap:99999'), false, 'an id from nowhere');
  eq(A.mark(null), false, 'or no id at all');
});

test('the window latches shut when the run stops, and never reopens', () => {
  A.begin();
  const c = ALL[3];
  A.state(c.id, null, true);                 // the run is over
  eq(A.isClosed(), true, 'the deadline passed');
  eq(A.mark(c.id), false, 'and the mark is refused');
  eq(A.isMarked(c.id), false, 'so it stays unmarked');
  A.state(c.id, null, false);                // a late non-final read
  eq(A.isClosed(), true, 'which cannot prise it back open');
});

/* An unmarked card at the deadline is an exposure, so the chip has to
   be able to say so — and must never say it while there is still a run
   left to do it in. */
test('failure is a fact only once the run has stopped', () => {
  A.begin();
  const c = ALL[4];
  const during = A.state(c.id, null, false);
  eq(during.failed, false, 'not done is not failed while the mission is on');
  eq(during.final, false, 'and the chip knows the numbers are still moving');
  const after = A.state(c.id, null, true);
  eq(after.failed, true, 'and it is a failure the moment they stop');
});

test('a marked card is never a failed one', () => {
  A.begin();
  const c = ALL[5];
  A.mark(c.id);
  const st = A.state(c.id, null, true);
  eq(st.done, true, 'marked');
  eq(st.failed, false, 'and so not failed');
});

test('the chip carries the task itself, not only its short form', () => {
  A.begin();
  for (const c of ALL) {
    const st = A.state(c.id, null, false);
    eq(st.task, c.text, c.id + ' lost its task on the way to the chip');
    eq(st.alibi, c.alibi, c.id + ' lost its way out');
  }
  eq(A.state('nope', null, false), null, 'and an unknown card has no state');
});

test('a new night clears the last one', () => {
  A.begin();
  const c = ALL[6];
  A.mark(c.id);
  A.state(c.id, null, true);
  A.begin();
  eq(A.isMarked(c.id), false, 'the mark is gone');
  eq(A.isClosed(), false, 'and the window is open again');
});

if (require.main === module) H.report();
