/* ------------------------------------------------------------------
   agendas.test.js — the deck, at its edges.

   Three jobs here, in order of how much they matter.

   The first is the ordinary one: every card is a threshold, and a
   threshold that is off by one is a Traitor exposed for doing exactly
   what they were told. So each card is fed a hand either side of its
   own boundary, and each *alibi* is too — an alibi that is easier than
   it reads is a card with no risk in it at all.

   The second is the design rule, enforced: a card with no public tell
   does not belong in the deck, and neither does one with no way out.
   An unobservable task makes the round table unwinnable for the
   Faithfuls. An unsurvivable one makes it unwinnable for the Traitor,
   and the whole deck was rebuilt to sit between those two.

   The third is the one that would actually have caught the bug this
   file was written after: every field a card reads must be a field the
   mission genuinely writes. `boostAtSplit` once sat in a stats object
   that nothing ever assigned to, so the card that read it could only
   ever fail. That is not visible from either side alone, so the last
   section reads the mission sources and checks the two halves meet.
------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');
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
  // boat race
  place: 1, of: 3, finishGap: 40, finished: false, elapsed: 100,
  leadTime: 0, longestStop: 0, boostSpentEarly: 0, boostAtFinish: 1,
  goldDeclined: 0, perfects: 0, gatesMissed: 0,
  // shootout
  escapedNearMe: 0, missed: 0, doves: 0, doveRecovered: false, doveRecoverT: 0,
  bestChain: 0, roundsOffLine: 0, offLineT: 0, topOfField: false,
  cleanRoundAfterWalk: false,
};
const hand = (o) => Object.assign({}, base, o);

section('agendas — boat race');

test('finish last', () => {
  const c = card('br-thrown-line');
  ok(c.check(hand({ finished: true, place: 3, of: 3 })), 'last of three');
  ok(!c.check(hand({ finished: true, place: 2, of: 3 })), 'second is not last');
  ok(!c.check(hand({ finished: false, place: 3, of: 3 })), 'never crossing is not finishing');
  // a solo run has nobody to come last to, and must never pass by default
  ok(!c.check(hand({ finished: true, place: 1, of: 1 })), 'alone is not last');
});

test('...and the alibi is having led it', () => {
  const c = card('br-thrown-line');
  const last = { finished: true, place: 3, of: 3, elapsed: 100 };
  ok(c.cover(hand(Object.assign({ leadTime: 50, finishGap: 1.5 }, last))),
     'half the race in front, beaten by a second and a half');
  ok(!c.cover(hand(Object.assign({ leadTime: 49, finishGap: 1.0 }, last))),
     'just under half is not leading it');
  ok(!c.cover(hand(Object.assign({ leadTime: 80, finishGap: 1.6 }, last))),
     'and a gap that big is not a photo finish');
  ok(!c.cover(hand({ leadTime: 100, elapsed: 100, finishGap: 0, finished: false })),
     'a race you never finished proves nothing either way');
});

test('burn the meter early and arrive dry', () => {
  const c = card('br-burn-early');
  ok(c.check(hand({ finished: true, boostSpentEarly: 0.8, boostAtFinish: 0.05 })),
     'a meter spent before halfway and nothing left at the line');
  ok(!c.check(hand({ finished: true, boostSpentEarly: 0.79, boostAtFinish: 0 })),
     'not quite the whole meter');
  ok(!c.check(hand({ finished: true, boostSpentEarly: 1, boostAtFinish: 0.2 })),
     'air time refilled it, so you did not arrive dry');
  ok(!c.check(hand({ finished: false, boostSpentEarly: 1, boostAtFinish: 0 })),
     'and you have to cross the line');
  ok(c.cover(hand({ finished: true, place: 1, of: 3 })), 'winning it anyway is the alibi');
  ok(!c.cover(hand({ finished: true, place: 2, of: 3 })), 'second is not winning');
  ok(!c.cover(hand({ finished: true, place: 1, of: 1 })), 'and beating nobody is not either');
});

test('decline three gold rings', () => {
  const c = card('br-cold-gold');
  ok(!c.check(hand({ goldDeclined: 2 })), 'two is not three');
  ok(c.check(hand({ goldDeclined: 3 })), 'three is');
  ok(c.cover(hand({ perfects: 8, gatesMissed: 0 })), 'eight perfect and a clean sheet');
  ok(!c.cover(hand({ perfects: 7, gatesMissed: 0 })), 'seven is not eight');
  ok(!c.cover(hand({ perfects: 20, gatesMissed: 1 })), 'and one fumble ends the story');
});

test('a full second dead in the water', () => {
  const c = card('br-dead-stop');
  ok(!c.check(hand({ longestStop: 0.9 })), 'nine tenths is traffic');
  ok(c.check(hand({ longestStop: 1.0 })), 'a whole second is a decision');
  ok(c.cover(hand({ finished: true, place: 2, finishGap: 2 })), 'stalled and still on their tail');
  ok(!c.cover(hand({ finished: true, place: 3, finishGap: 0.2 })), 'third has nothing to show');
  ok(!c.cover(hand({ finished: true, place: 2, finishGap: 2.1 })), 'nor has a gap you never closed');
});

section('agendas — shootout');

test('let five birds through', () => {
  const c = card('sh-open-net');
  ok(!c.check(hand({ escapedNearMe: 4 })), 'four is not five');
  ok(c.check(hand({ escapedNearMe: 5 })), 'five is');
  ok(c.cover(hand({ topOfField: true, finished: true })), 'finishing top of the strip covers it');
  ok(!c.cover(hand({ topOfField: false })), 'and nothing else does');
  ok(!c.cover(hand({ topOfField: true, finished: false })), 'leading early is not an alibi');
});

test('a dove, paid back before anybody reads it', () => {
  const c = card('sh-dove');
  ok(!c.check(hand({ doves: 0 })), 'no dove, no task');
  ok(c.check(hand({ doves: 1 })), 'one dove is the card');
  ok(c.cover(hand({ doves: 1, doveRecovered: true })), 'and back above it in time');
  ok(!c.cover(hand({ doves: 1, doveRecovered: false })), 'a dip still showing is no alibi');
  ok(!c.cover(hand({ doves: 0, doveRecovered: true })), 'and a recovery with no dove is nothing');
});

test('ten arrows into the trees', () => {
  const c = card('sh-cold-quiver');
  ok(!c.check(hand({ missed: 9 })), 'nine is short');
  ok(c.check(hand({ missed: 10 })), 'ten is the card');
  ok(c.cover(hand({ bestChain: 12 })), 'a chain of twelve is the style defence');
  ok(!c.cover(hand({ bestChain: 11 })), 'eleven is not twelve');
});

test('a round away from the line, answered for', () => {
  const c = card('sh-long-walk');
  ok(!c.check(hand({ roundsOffLine: 0 })), 'staying put fails it');
  ok(c.check(hand({ roundsOffLine: 1 })), 'one round does it');
  ok(c.cover(hand({ cleanRoundAfterWalk: true })), 'coming back clean is the alibi');
  ok(!c.cover(hand({ cleanRoundAfterWalk: false })), 'and walking back in quietly is not');
});

section('agendas — the rules of the deck');

test('every card has a public tell and a way out', () => {
  for (const missionId in A.DECKS) {
    for (const c of A.DECKS[missionId]) {
      ok(typeof c.tell === 'string' && c.tell.length > 20,
         c.id + ' has no public tell — the Faithfuls could never catch it');
      ok(typeof c.alibi === 'string' && c.alibi.length > 20,
         c.id + ' has no alibi — the Traitor could never survive it');
      ok(typeof c.cover === 'function', c.id + ' has an alibi nothing can judge');
    }
  }
});

test('every card is complete, callable, failable and coverable', () => {
  for (const missionId in A.DECKS) {
    for (const c of A.DECKS[missionId]) {
      ok(c.id && c.text && c.hud, c.id + ' is missing a field');
      ok(typeof c.check === 'function', c.id + ' cannot be judged');
      ok(typeof c.progress === 'function', c.id + ' cannot be tracked');
      // a task must be failable, or it is not a risk
      ok(!c.check(hand({})), c.id + ' passes on a hand that did nothing');
      // an alibi must be earnable, or it is not a defence
      ok(!c.cover(hand({})), c.id + ' covers a run that did nothing');
      // and none of them may throw on a hand they have not seen
      c.check({}); c.cover({}); c.progress({});
      ok(typeof c.progress({}) === 'string', c.id + ' has no line for the chip');
      if (c.needs) ok(typeof c.needs({}) === 'boolean', c.id + ' has an unreadable needs()');
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

section('agendas — dealing');

test('drawing is a pure function of the seed', () => {
  const rngA = ctx.U.makeRng(1234);
  const rngB = ctx.U.makeRng(1234);
  eq(A.draw('boat-race', rngA).id, A.draw('boat-race', rngB).id, 'same seed, same card');
  eq(A.draw('no-such-mission', rngA), null, 'a mission with no deck deals nothing');
});

/* The one thing worse than a task nobody can see is a task nobody can
   do. A twist that makes a card impossible must take it out of the
   deck, or the Traitor is exposed for the run's own rules. */
test('a twist that makes a card impossible takes it out of the deck', () => {
  for (let s = 1; s < 400; s++) {
    const r = ctx.U.makeRng(s);
    ok(A.draw('boat-race', r, { noBoost: true }).id !== 'br-burn-early',
       'dealt "burn the meter" into a run with no meter');
    ok(A.draw('shootout', r, { suddenDeath: true }).id !== 'sh-dove',
       'dealt "shoot a dove" into a run a dove ends');
  }
});

test('Bonus Hunt keeps the safe line beside every gold ring', () => {
  const cold = A.byId('br-cold-gold');
  ok(!cold.needs || cold.needs({ allRisk: true }),
     'Bonus Hunt wrongly removes a task whose safe alternatives still exist');
});

/* The gate is for cards a twist makes *impossible*, never for cards it
   makes hard — a Sudden Death run where five birds have to get past you
   is the best version of that card, not a broken one. So no single
   twist may ever empty a deck. */
test('no twist ever empties a deck', () => {
  const flags = ['noBoost', 'allRisk', 'suddenDeath', 'quiver', 'oneCrash',
                 'riptide', 'shrinkRings', 'allOrNothing', 'twinShot',
                 'cleanOnly', 'noFocus', 'alwaysPierce', 'doveMult'];
  for (const missionId in A.DECKS) {
    for (const f of flags) {
      const pool = A.DECKS[missionId]
        .filter(c => typeof c.needs !== 'function' || c.needs({ [f]: true }));
      ok(pool.length, missionId + ' has nothing left to deal under ' + f);
      ok(A.draw(missionId, ctx.U.makeRng(3), { [f]: true }),
         missionId + ' dealt nothing under ' + f);
    }
  }
});

section('agendas — what the Traitor is told');

test('only the readable half of a card crosses the wire', () => {
  const w = A.wire(card('br-dead-stop'));
  eq(Object.keys(w).sort(), ['alibi', 'hud', 'id', 'tell', 'text'],
     'no check, no cover, no needs on the wire');
  eq(A.wire(null), null, 'and no card is no card');
});

test('the private chip knows the task, the progress and the alibi', () => {
  const s = A.state('sh-cold-quiver', hand({ missed: 10, bestChain: 12 }));
  ok(s.done, 'the task is done');
  ok(s.covered, 'and the alibi is holding');
  ok(s.prog.indexOf('10') >= 0, 'the line says where you are');
  ok(s.alibi.length > 20, 'and what the way out is');

  const half = A.state('sh-cold-quiver', hand({ missed: 10, bestChain: 3 }));
  ok(half.done && !half.covered, 'done and exposed is a state the chip must show');
  eq(A.state('no-such-card', {}), null, 'a card that does not exist has no state');
});

/* A card the chip cannot describe is a card a Traitor plays blind. */
test('every card says something useful on an untouched run', () => {
  for (const missionId in A.DECKS) {
    for (const c of A.DECKS[missionId]) {
      const s = A.state(c.id, hand({}));
      ok(s && s.prog && s.prog.length > 3, c.id + ' has nothing to say at the start');
      ok(!s.done && !s.covered, c.id + ' starts already done');
    }
  }
});

section('agendas — the deck and the missions actually meet');

/* Read the mission sources and check that every field a card asks
   about is a field that mission assigns to. This is the check that the
   old `boostAtSplit` card would have failed: it read a counter that
   existed in the stats object and was never once written. */

const SOURCE = {
  'boat-race': fs.readFileSync(path.join(H.ROOT, 'js/missions/boat-race.js'), 'utf8'),
  shootout: fs.readFileSync(path.join(H.ROOT, 'js/missions/shootout.js'), 'utf8'),
  dive: fs.readFileSync(path.join(H.ROOT, 'js/missions/dive.js'), 'utf8'),
  ski: fs.readFileSync(path.join(H.ROOT, 'js/missions/ski.js'), 'utf8'),
};

// every `s.something` a card's own source reads
function fieldsRead(c) {
  const src = [c.check, c.cover, c.progress].map(f => f.toString()).join('\n');
  const out = new Set();
  for (const m of src.matchAll(/\bs\.([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  return [...out];
}

// ...and whether the mission ever puts a value in it
function isWritten(src, field) {
  /* Pushing onto an array counts. A list of the shortcuts you took is
     written by `stats.chutesTaken.push(name)` and never by an
     assignment, and a check that could not see that would have called
     a field the mission demonstrably fills in "never written". */
  const w = new RegExp('(?:st|this\\.stats)\\.' + field
                       + '\\s*(?:=[^=]|\\+\\+|\\+=|-=|\\.push\\()');
  return w.test(src);
}

test('every field a card reads is a field its mission writes', () => {
  for (const missionId in A.DECKS) {
    const src = SOURCE[missionId];
    ok(src, 'no source for ' + missionId);
    for (const c of A.DECKS[missionId]) {
      for (const f of fieldsRead(c)) {
        ok(isWritten(src, f),
           c.id + ' reads stats.' + f + ', which ' + missionId + ' never writes');
      }
    }
  }
});

test('the boat race declares every counter it keeps', () => {
  const src = SOURCE['boat-race'];
  const block = src.slice(src.indexOf('static freshStats()'));
  const declared = new Set([...block.slice(0, block.indexOf('\n  }'))
    .matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map(m => m[1]));
  for (const c of A.DECKS['boat-race']) {
    for (const f of fieldsRead(c)) {
      ok(declared.has(f), 'freshStats() forgets ' + f + ', which ' + c.id + ' reads');
    }
  }
});

if (require.main === module) H.report();
