/* ------------------------------------------------------------------
   agendas.test.js — the deck, at its edges.

   Every card is a threshold, and a threshold that is off by one is a
   Traitor exposed for doing exactly what they were told. So each card
   is fed a hand either side of its own boundary.

   The second half of this file is the design rule, enforced: a card
   with no public tell does not belong in the deck. That is not a
   stylistic check. An agenda nobody can observe being performed makes
   the round table unwinnable for the Faithfuls, which is the failure
   the whole mechanic was rebuilt to avoid.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const ctx = H.load(['js/core/util.js', 'js/missions/agendas.js']);
const A = ctx.Agendas;

const card = (id) => {
  const c = A.byId(id);
  if (!c) throw new Error('no such card: ' + id);
  return c;
};

/* A hand that satisfies nothing, so each test only has to set the one
   field it is actually about. */
const base = {
  place: 1, of: 3, finishGap: 0, finished: true,
  wideGates: [], buoysClipped: 0, boostInLastThird: 0, boostAtSplit: 0,
  gatesMissed: 0,
  escapedNearMe: 0, missed: 0, perfectsLate: 0, lateShots: 0, roundsOffLine: 0,
};
const hand = (o) => Object.assign({}, base, o);

section('agendas — boat race');

test('finish last, within four seconds', () => {
  const c = card('br-last-but-close');
  ok(c.check(hand({ place: 3, of: 3, finishGap: 3.9 })), 'last and close');
  ok(c.check(hand({ place: 3, of: 3, finishGap: 4.0 })), 'exactly four is inside');
  ok(!c.check(hand({ place: 3, of: 3, finishGap: 4.1 })), 'four and a bit is not');
  ok(!c.check(hand({ place: 2, of: 3, finishGap: 1 })), 'second is not last');
  ok(!c.check(hand({ place: 3, of: 3, finishGap: 1, finished: false })),
     'never crossing the line is not finishing last');
});

test('three gates round the outside', () => {
  const c = card('br-wide-gates');
  ok(!c.check(hand({ wideGates: [1, 2] })), 'two is not three');
  ok(c.check(hand({ wideGates: [1, 2, 3] })), 'three is');
  ok(c.check(hand({ wideGates: [1, 2, 3, 4] })), 'and more still counts');
});

test('bank the boost, then refuse to spend it', () => {
  const c = card('br-cold-engine');
  ok(c.check(hand({ boostAtSplit: 0.6, boostInLastThird: 0 })), 'full meter, unspent');
  ok(c.check(hand({ boostAtSplit: 0.9, boostInLastThird: 0.04 })),
     'a fumbled tap is forgiven');
  ok(!c.check(hand({ boostAtSplit: 0.9, boostInLastThird: 0.5 })),
     'half a second of it is not');
  /* The reason this card was rewritten: arriving at the split with
     nothing banked is what happens if you simply never think about it,
     and a task you pass by forgetting is not a task. */
  ok(!c.check(hand({ boostAtSplit: 0.2, boostInLastThird: 0 })),
     'an empty meter is not a refusal, it is an accident');
  ok(!c.check(hand({ boostAtSplit: 0.9, boostInLastThird: 0, finished: false })),
     'and you have to actually cross the line');
});

test('exactly two buoys, no more and no fewer', () => {
  const c = card('br-buoy-kiss');
  ok(!c.check(hand({ buoysClipped: 1 })), 'one is short');
  ok(c.check(hand({ buoysClipped: 2 })), 'two is the card');
  ok(!c.check(hand({ buoysClipped: 3 })), 'three is greedy');
});

section('agendas — shootout');

test('let three birds through', () => {
  const c = card('sh-let-them-fly');
  ok(!c.check(hand({ escapedNearMe: 2 })), 'two is not enough');
  ok(c.check(hand({ escapedNearMe: 3 })), 'three is');
});

test('miss eight arrows', () => {
  const c = card('sh-empty-quiver');
  ok(!c.check(hand({ missed: 7 })), 'seven is short');
  ok(c.check(hand({ missed: 8 })), 'eight is the card');
});

test('keep shooting after round four, and stop ringing', () => {
  const c = card('sh-no-perfects');
  ok(c.check(hand({ lateShots: 6, perfectsLate: 0 })), 'six loosed, none perfect');
  ok(!c.check(hand({ lateShots: 6, perfectsLate: 1 })), 'one ring is one too many');
  // same rewrite, same reason: putting the bow down used to pass this
  ok(!c.check(hand({ lateShots: 5, perfectsLate: 0 })), 'five is not keeping shooting');
  ok(!c.check(hand({ lateShots: 0, perfectsLate: 0 })), 'and nor is stopping');
});

test('a whole round off the line', () => {
  const c = card('sh-off-the-line');
  ok(!c.check(hand({ roundsOffLine: 0 })), 'staying put fails it');
  ok(c.check(hand({ roundsOffLine: 1 })), 'one round does it');
});

section('agendas — the rules of the deck');

test('every card has a public tell', () => {
  for (const missionId in A.DECKS) {
    for (const c of A.DECKS[missionId]) {
      ok(typeof c.tell === 'string' && c.tell.length > 20,
         c.id + ' has no public tell — the Faithfuls could never catch it');
    }
  }
});

test('every card is complete and callable', () => {
  for (const missionId in A.DECKS) {
    for (const c of A.DECKS[missionId]) {
      ok(c.id && c.text && c.hud, c.id + ' is missing a field');
      ok(typeof c.check === 'function', c.id + ' cannot be judged');
      ok(typeof c.progress === 'function', c.id + ' cannot be tracked');
      // a card must be failable, or it is not a risk
      ok(!c.check(hand({})), c.id + ' passes on a hand that did nothing');
      // and it must never throw on a hand it has not seen
      c.check({});
      c.progress({});
    }
  }
});

test('a card id is unique across the whole deck', () => {
  const seen = new Set();
  for (const missionId in A.DECKS) {
    for (const c of A.DECKS[missionId]) {
      ok(!seen.has(c.id), 'duplicate card id ' + c.id);
      seen.add(c.id);
    }
  }
});

test('drawing is a pure function of the seed', () => {
  const rngA = ctx.U.makeRng(1234);
  const rngB = ctx.U.makeRng(1234);
  eq(A.draw('boat-race', rngA).id, A.draw('boat-race', rngB).id, 'same seed, same card');
  eq(A.draw('no-such-mission', rngA), null, 'a mission with no deck deals nothing');
});

test('only the readable half of a card crosses the wire', () => {
  const w = A.wire(card('br-buoy-kiss'));
  eq(Object.keys(w).sort(), ['hud', 'id', 'tell', 'text'], 'no check function on the wire');
});

if (require.main === module) H.report();
