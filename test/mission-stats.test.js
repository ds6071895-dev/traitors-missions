/* ------------------------------------------------------------------
   mission-stats.test.js — the other half of the agenda deck.

   `agendas.test.js` proves the cards judge a hand correctly. This file
   proves the missions produce the hand. Between them there used to be a
   gap wide enough to lose a whole card down: a counter can sit in a
   stats object, be read by a check, and never once be written by the
   code that plays the game.

   Nothing here draws anything. The trackers are called directly with a
   hand-built `this` — which is only possible because they are honest
   functions over the state they are given, and if that ever stops being
   true this file is where it will show.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

/* Enough of a browser and a game to get two mission files to parse and
   register themselves. None of it is called by the trackers below. */
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new V3(this.x, this.y, this.z); }
}
const noop = () => {};
const stubs = {
  THREE: new Proxy({ Vector3: V3 }, {
    get: (t, k) => (k in t ? t[k] : function () { return {}; }),
  }),
  Missions: { register: noop, get: () => null, all: () => [] },
  AudioBus: { play: noop, define: noop, stop: noop },
  Music: { boss: () => null },
  Input: { held: () => false, pressed: () => false, rumble: noop, haptic: noop },
  RoomUI: { showAgenda: noop, showField: noop, hideField: noop },
  MissionNet: { event: noop, pose: noop, on: () => noop, at: () => null,
                attach: noop, update: noop },
  GameState: { recordRun: () => ({ isBest: false }), getGhost: () => null,
               saveGhost: noop, runKey: () => 'k', logEvent: noop },
  ForestConditions: { describe: () => '' },
};

const ctx = H.load(['js/core/util.js', 'js/missions/agendas.js', 'js/missions/shootout-rounds.js',
                    'js/missions/boat-race.js', 'js/missions/shootout.js'], stubs);
const BR = ctx.BoatRaceMission;
const SH = ctx.ShootoutMission;
const U = ctx.U;

section('boat race — the counters the deck reads');

/* A boat, a channel and two rivals, with nothing in it that the tracker
   does not actually touch. */
function racer(o = {}) {
  return Object.assign({
    stats: BR.freshStats(),
    world: { lastFrame: { s: 0 } },
    path: { total: 1000 },
    boat: { boost: 1, boosting: false, speed: 20 },
    peers: new Map(),
    elapsed: 0, perfects: 0, riskHits: 0,
    _prevBoost: 1, _stopT: 0, _splitTaken: false,
  }, o);
}
// one frame: put the boat where the test says it is, then track it
function tick(r, dt, at = {}) {
  if (at.s !== undefined) r.world.lastFrame.s = at.s;
  if (at.boost !== undefined) r.boat.boost = at.boost;
  if (at.boosting !== undefined) r.boat.boosting = at.boosting;
  if (at.speed !== undefined) r.boat.speed = at.speed;
  if (at.peers) for (const [id, s] of Object.entries(at.peers)) r.peers.set(id, { s });
  r.elapsed += dt;
  BR.prototype._trackAgenda.call(r, dt);
  return r.stats;
}

test('a meter spent before halfway is the only meter that counts', () => {
  const r = racer();
  tick(r, 0.5, { s: 100, boost: 0.7 });      // 0.3 gone, first half
  tick(r, 0.5, { s: 300, boost: 0.4 });      // 0.3 more, still first half
  eq(Math.round(r.stats.boostSpentEarly * 100), 60, 'six tenths of a meter, early');
  tick(r, 0.5, { s: 700, boost: 0.1 });      // spent after halfway
  eq(Math.round(r.stats.boostSpentEarly * 100), 60, 'and nothing past halfway counts');
  eq(Math.round(r.stats.boostInLastThird * 10), 0, 'not boosting is not burning');
  tick(r, 0.5, { s: 800, boosting: true });
  eq(Math.round(r.stats.boostInLastThird * 10), 5, 'half a second held, in the last third');
});

test('a meter refilled off the waves is not a meter you arrived dry with', () => {
  const r = racer();
  tick(r, 0.5, { s: 100, boost: 0.2 });
  tick(r, 0.5, { s: 400, boost: 0.9 });      // air time paid it back
  eq(Math.round(r.stats.boostSpentEarly * 100), 80, 'refills do not undo the spend');
  const card = ctx.Agendas.byId('br-burn-early');
  ok(!card.check(Object.assign({}, r.stats, { finished: true, boostAtFinish: 0.9 })),
     'but the card still says no, because you did not arrive dry');
});

test('lead time is time in front of everybody, and solo is nobody', () => {
  const r = racer();
  tick(r, 1, { s: 500, peers: { a: 400, b: 300 } });
  eq(r.stats.leadTime, 1, 'a second out in front');
  eq(r.stats.place, 1, 'and the standing agrees');
  tick(r, 1, { s: 600, peers: { a: 900 } });
  eq(r.stats.leadTime, 1, 'a second behind adds nothing');
  eq(r.stats.place, 2, 'and the standing agrees about that too');
  eq(r.stats.of, 3, 'three boats');

  const solo = racer();
  tick(solo, 3, { s: 500 });
  eq(solo.stats.leadTime, 0, 'you cannot lead a field of one');
  eq(solo.stats.of, 1, 'and there is no field');
});

test('the stall the card wants is one stall, not six little ones', () => {
  const r = racer();
  tick(r, 1.2, { s: 0, speed: 1 });
  eq(r.stats.longestStop, 0, 'waiting on the start line is not open water');
  tick(r, 0.6, { s: 100, speed: 1 });
  tick(r, 0.6, { s: 110, speed: 20 });        // moving again
  tick(r, 0.6, { s: 200, speed: 1 });
  eq(Math.round(r.stats.longestStop * 10), 6, 'two sixths of a stop is not a stop');
  const card = ctx.Agendas.byId('br-dead-stop');
  ok(!card.check(r.stats), 'and the card is not fooled by the total');
  tick(r, 0.6, { speed: 1 });
  eq(Math.round(r.stats.longestStop * 10), 12, 'holding it is');
  ok(card.check(r.stats), 'and now the card says yes');
});

test('the last split is taken once, with whatever was in the meter', () => {
  const r = racer();
  tick(r, 1, { s: 600, boost: 0.9 });
  eq(r.stats.boostAtSplit, 0, 'six tenths down the channel is not the split');
  tick(r, 1, { s: 700, boost: 0.8, peers: { a: 100 } });
  eq(Math.round(r.stats.boostAtSplit * 10), 8, 'taken at two thirds');
  ok(r.stats.ledAtSplit, 'and it remembers you led into it');
  tick(r, 1, { s: 900, boost: 0.1 });
  eq(Math.round(r.stats.boostAtSplit * 10), 8, 'and it is not taken twice');
});

test('the run reports what the deck asks for', () => {
  const s = BR.freshStats();
  for (const c of ctx.Agendas.DECKS['boat-race']) {
    // every card must be judgeable against a freshly started race
    ok(typeof c.check(s) === 'boolean', c.id + ' cannot judge a fresh run');
    ok(!c.check(s), c.id + ' passes a race nobody has driven');
  }
});

test('every generated channel offers at least three optional gold lines', () => {
  const generate = (seed, half = 64) => {
    const r = {
      C: BR.CONFIG, seed, flags: {}, scene: { add: noop },
      path: {
        total: 4200,
        at: (s) => ({ point: { x: 0, z: s }, tangent: { x: 0, z: 1 }, half }),
        featureAt: () => null,
      },
      _buildHoopFrame: () => ({}),
      _curvature: () => 0.5,
      _moveRing: BR.prototype._moveRing,
      _makeRing(gate, at, lat, variant) {
        return { gate, lat, risk: variant === 'risk' || variant === 'finalRisk' };
      },
    };
    return BR.prototype._buildGates.call(r);
  };
  for (let seed = 1; seed <= 200; seed++) {
    const gates = generate(seed);
    const choices = gates.filter(g => g.rings.some(h => h.risk) && g.rings.some(h => !h.risk));
    ok(choices.length >= 3, 'seed ' + seed + ' offers only ' + choices.length + ' choices');
  }
  const narrow = generate(1, 25)
    .filter(g => g.rings.some(h => h.risk) && g.rings.some(h => !h.risk));
  ok(narrow.length >= 3, 'even an all-narrows synthetic channel keeps three choices');
});

section('shootout — the counters the deck reads');

function shooter(o = {}) {
  const st = { escapedNearMe: 0, missed: 0, perfectsLate: 0, lateShots: 0,
               roundsOffLine: 0, offLineT: 0, roundT: 0, doves: 0, bestChain: 0,
               topOfField: false, doveRecovered: false, doveRecoverT: 0,
               cleanRoundAfterWalk: false, finished: false };
  return Object.assign({
    stats: st, state: 'live', money: 0, penalty: 0, elapsed: 0, bestChain: 0,
    pos: { x: 0, z: 0 }, _doveMark: null, _walkPending: false,
    _roundShots: 0, _roundMisses: 0,
    // the real one: the dove clock is judged against the same number
    // the other two are reading off the strip
    _net: SH.prototype._net,
    _finishRoundAgenda: SH.prototype._finishRoundAgenda,
    /* The real one, because what a finished round pays is now a shared
       sum rather than something only the host can reach — and "the
       guest was paid the same" is exactly the kind of claim that has
       to be checked rather than assumed. */
    _awardRound: SH.prototype._awardRound,
  }, o);
}

test('the strip is money less fines, and it can go backwards', () => {
  const s = shooter({ money: 1000, penalty: 0 });
  eq(SH.prototype._net.call(s), 1000, 'what you have taken');
  s.penalty = 400;
  eq(SH.prototype._net.call(s), 600, 'less what the dove cost you');
  s.penalty = 5000;
  eq(SH.prototype._net.call(s), 0, 'and it never reads as a debt');
});

test('a dove paid back inside eight seconds is an alibi; nine is not', () => {
  const fast = shooter({ money: 1000, penalty: 400, elapsed: 10 });
  fast._doveMark = { at: 1000, t: 10 };       // the strip was at 1000 when it fell
  fast.elapsed = 13; fast.money = 1100;       // still 700 net: not back yet
  SH.prototype._trackDove.call(fast);
  ok(!fast.stats.doveRecovered, 'three seconds in and still below it');
  eq(Math.round(fast.stats.doveRecoverT), 3, 'the clock is running');
  fast.elapsed = 15; fast.money = 1500;       // 1100 net: above where it fell
  SH.prototype._trackDove.call(fast);
  ok(fast.stats.doveRecovered, 'back above it in five seconds');
  eq(fast._doveMark, null, 'and the clock is put away');

  const slow = shooter({ money: 1000, penalty: 400, elapsed: 10 });
  slow._doveMark = { at: 1000, t: 10 };
  slow.elapsed = 19; slow.money = 1500;
  SH.prototype._trackDove.call(slow);
  ok(!slow.stats.doveRecovered, 'nine seconds is long enough for anybody to read it');
  ok(slow.stats.doveRecoverT > 8, 'and the chip says how late it was');
});

test('time off the line is time off the line, and the chain is live', () => {
  const s = shooter({ bestChain: 7 });
  SH.prototype._trackLine.call(s, 1);
  eq(s.stats.offLineT, 0, 'standing on the line costs nothing');
  eq(s.stats.roundT, 1, 'but the round clock runs');
  eq(s.stats.bestChain, 7, 'and the chain is on the chip while it matters');
  s.pos = { x: 50, z: 0 };
  SH.prototype._trackLine.call(s, 2);
  eq(s.stats.offLineT, 2, 'and wandering off does');
  s.state = 'between';
  SH.prototype._trackLine.call(s, 5);
  eq(s.stats.roundT, 3, 'nothing accrues between rounds');
});

/* The alibi on the long-walk card is the round *after* the walk, which
   is a small state machine and therefore the thing most likely to be
   quietly wrong. */
function endRound(s, o) {
  Object.assign(s, {
    C: SH.CONFIG, flags: {}, mode: 'prize', schedule: [1, 2, 3, 4, 5],
    roundIndex: 0, roundsCleared: 0, perfectRounds: 0, bossesDown: 0,
    bossMoney: 0, bonusMoney: 0, payout: 1, timeScaleTarget: 1,
    flock: { list: [] }, arrowsLeft: Infinity, boss: null,
    round: { def: { kind: 'normal' }, time: 5, killed: o.killed === undefined ? 5 : o.killed,
             total: 5, escaped: o.escaped || 0 },
    _boonPay: () => 1, _banner: noop, _fail: noop, _loseLife: noop, _finish: noop,
  });
  s.stats.roundT = o.roundT === undefined ? 30 : o.roundT;
  s.stats.offLineT = o.offLineT || 0;
  s._roundShots = o.shots === undefined ? 6 : o.shots;
  s._roundMisses = o.misses || 0;
  SH.prototype._endRound.call(s, o.cleared !== false);
}

test('a walk is four fifths of a round away from the line', () => {
  const s = shooter();
  endRound(s, { roundT: 30, offLineT: 23 });
  eq(s.stats.roundsOffLine, 0, 'most of a round is not a round');
  endRound(s, { roundT: 30, offLineT: 25 });
  eq(s.stats.roundsOffLine, 1, 'four fifths of it is');
});

test('the alibi is the very next round, cleared without a miss', () => {
  const s = shooter();
  endRound(s, { roundT: 30, offLineT: 28 });          // the walk
  ok(!s.stats.cleanRoundAfterWalk, 'nothing is owed yet');
  endRound(s, { shots: 6, misses: 0 });               // and the answer
  ok(s.stats.cleanRoundAfterWalk, 'came back and cleared one clean');

  const missed = shooter();
  endRound(missed, { roundT: 30, offLineT: 28 });
  endRound(missed, { shots: 6, misses: 1 });
  ok(!missed.stats.cleanRoundAfterWalk, 'one arrow in the trees and the story is gone');

  const lost = shooter();
  endRound(lost, { roundT: 30, offLineT: 28 });
  endRound(lost, { shots: 6, misses: 0, cleared: false, killed: 2 });
  ok(!lost.stats.cleanRoundAfterWalk, 'and a round that got away is not an answer');

  const late = shooter();
  endRound(late, { roundT: 30, offLineT: 28 });
  endRound(late, { shots: 6, misses: 2 });            // the round that answered, badly
  endRound(late, { shots: 6, misses: 0 });            // a clean one, too late
  ok(!late.stats.cleanRoundAfterWalk, 'it has to be the next round, not a later one');

  const before = shooter();
  endRound(before, { shots: 6, misses: 0 });          // clean, but nothing to answer for
  ok(!before.stats.cleanRoundAfterWalk, 'and a clean round before a walk answers nothing');
});

test('sitting one out and coming back clean is the whole card', () => {
  const s = shooter();
  endRound(s, { roundT: 30, offLineT: 28 });
  endRound(s, { shots: 6, misses: 0 });
  const card = ctx.Agendas.byId('sh-long-walk');
  ok(card.check(s.stats), 'the task is done');
  ok(card.cover(s.stats), 'and the alibi is standing up');
});

test('a guest finalizes their own walk telemetry from host round results', () => {
  const s = shooter({ isHost: false, roundIndex: 0, _agendaRoundSeen: -1,
                      round: { index: 0 }, state: 'live',
                      C: SH.CONFIG, payout: 1, timeScaleTarget: 1,
                      roundsCleared: 0, perfectRounds: 0, bossesDown: 0,
                      bossMoney: 0, bonusMoney: 0, money: 0,
                      _boonPay: () => 1, _banner: noop, _fail: noop, _finish: noop,
                      boss: null, flock: { list: [] } });
  s.stats.roundT = 30; s.stats.offLineT = 28;
  SH.prototype._applyWorldState.call(s, {
    lastRound: { index: 0, cleared: true }, roundIndex: 0,
    round: null, state: 'between', betweenT: 2,
  });
  eq(s.stats.roundsOffLine, 1, 'the guest records the round they sat out');

  s.roundIndex = 1; s.round = { index: 1 }; s.state = 'live';
  s.stats.roundT = 30; s.stats.offLineT = 0;
  s._roundShots = 6; s._roundMisses = 0;
  SH.prototype._applyWorldState.call(s, {
    lastRound: { index: 1, cleared: true }, roundIndex: 1,
    round: null, state: 'between', betweenT: 2,
  });
  ok(s.stats.cleanRoundAfterWalk, 'the guest can earn the clean return alibi');
});

/* The money half of the same message. A round's clear bonus, its
   perfect bonus and the bounty on the owl used to be paid inside
   `_endRound`, which only the host ever runs — so two people who
   played a round identically walked out of it thousands apart, on the
   strip both of them were staring at. */
test('a guest is paid for a cleared round exactly as the host is', () => {
  const host = shooter();
  endRound(host, { cleared: true, killed: 5, escaped: 0 });

  const guest = shooter({ isHost: false, roundIndex: 0, _agendaRoundSeen: -1,
                          round: { index: 0 }, state: 'live',
                          C: SH.CONFIG, payout: 1, timeScaleTarget: 1,
                          roundsCleared: 0, perfectRounds: 0, bossesDown: 0,
                          bossMoney: 0, bonusMoney: 0, money: 0,
                          _boonPay: () => 1, _banner: noop, _fail: noop, _finish: noop,
                          boss: null, flock: { list: [] } });
  SH.prototype._applyWorldState.call(guest, {
    lastRound: { index: 0, cleared: true, perfect: true, boss: false,
                 timeLeft: 5, killed: 5, total: 5 },
    roundIndex: 0, round: null, state: 'between', betweenT: 2,
  });

  eq(Math.round(guest.money), Math.round(host.money), 'the same money');
  eq(guest.roundsCleared, host.roundsCleared, 'the same rounds cleared');
  eq(guest.perfectRounds, host.perfectRounds, 'the same perfect rounds');
  ok(host.money > 0, 'and it is not zero on either of them');
});

test('the owl bounty reaches a guest that helped bring it down', () => {
  const guest = shooter({ isHost: false, roundIndex: 0, _agendaRoundSeen: -1,
                          round: { index: 0 }, state: 'live',
                          C: SH.CONFIG, payout: 1, timeScaleTarget: 1,
                          roundsCleared: 0, perfectRounds: 0, bossesDown: 0,
                          bossMoney: 0, bonusMoney: 0, money: 0,
                          _boonPay: () => 1, _banner: noop, _fail: noop, _finish: noop,
                          boss: null, flock: { list: [] } });
  SH.prototype._applyWorldState.call(guest, {
    lastRound: { index: 0, cleared: true, perfect: false, boss: true,
                 timeLeft: 0, killed: 1, total: 1 },
    roundIndex: 0, round: null, state: 'between', betweenT: 2,
  });
  eq(guest.bossesDown, 1, 'the owl is on their card');
  ok(guest.bossMoney >= SH.CONFIG.bossBounty, 'and the bounty is in their money',
     guest.bossMoney);
});

test('every guard round produces a dove even at hostile RNG edges', () => {
  for (const random of [() => 0, () => 1]) {
    const seen = [];
    const s = shooter({
      round: {
        def: { guards: 0.2, spawn: { mode: 'sweep', types: ['raven'], behaviour: 'cruise' },
               waves: ['scatter'] },
        wave: 0, spawned: 0, total: 2, guardSpawned: 0, time: 10,
      },
      _wavePlacement: () => ({}),
      _spawnOne: (id) => { seen.push(id); return {}; },
    });
    const old = ctx.Math.random;
    ctx.Math.random = random;
    SH.prototype._spawnWave.call(s, 2);
    ctx.Math.random = old;
    eq(s.round.spawned, 2, 'both quarry still spawn');
    ok(seen.includes('dove'), 'a dove is guaranteed');
    ok(seen.length <= 4, 'the wave is bounded');
  }
});

test('every prize schedule contains a round that can offer the guaranteed dove', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const eligible = ctx.ShootoutRounds.schedule(seed).some(r =>
      r.def.guards > 0 && r.def.spawn.mode !== 'formation');
    ok(eligible, 'seed ' + seed + ' contains no dove-capable round');
  }
});

test('the final report preserves actual missed arrows', () => {
  const s = shooter({
    C: SH.CONFIG, shots: 12, hits: 9, doves: 0, bestChain: 0, kills: 0,
    opts: {}, modeDef: { name: 'Prize' }, mode: 'prize', peers: new Map(),
    scores: new Map(), key: 'k', money: 0, bonusMoney: 0, bossMoney: 0,
    roundIndex: 0, roundCount: 10, roundsCleared: 0, perfectRounds: 0,
    bossesDown: 0, boonsTaken: 0, elapsed: 1, par: 0, payout: 1,
  });
  s.stats.missed = 10; // piercing/twin arrows make shots - hits an invalid substitute
  const result = SH.prototype._buildResult.call(s, {});
  eq(result.stats.missed, 10, 'reporting does not replace the event counter');
});

if (require.main === module) H.report();
