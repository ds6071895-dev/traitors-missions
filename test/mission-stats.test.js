/* ------------------------------------------------------------------
   mission-stats.test.js — what the missions actually count.

   This file was written as the other half of the agenda deck, back
   when a card was arithmetic over a stats object and the two halves
   could drift apart without either one looking wrong. The deck is
   voice now and judges nothing, so the cards are gone from here — but
   the counting is not. Every mission still keeps its own telemetry for
   its own scoreboard and its own live strip, and a tracker that
   silently stops writing a field is exactly as wrong as it ever was.

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
  AudioBus: { play: noop, define: noop, stop: noop, wind: () => ({ set: noop, stop: noop }),
              noiseSource: () => null, bus: () => null, ready: false, ctx: null },
  Music: { boss: () => null, descent: () => null, SKI_GEARS: [0, 1, 2, 3, 4] },
  Look: { resolve: () => ({ accent: '#fff', trim: '#f00', coat: '#123' }), get: () => null },
  Figure: { build: () => ({ userData: {} }), dispose: noop, paletteFor: () => 'a' },
  Input: { held: () => false, pressed: () => false, rumble: noop, haptic: noop },
  RoomUI: { showAgenda: noop, showField: noop, hideField: noop },
  MissionNet: { event: noop, pose: noop, on: () => noop, at: () => null,
                attach: noop, update: noop },
  GameState: { recordRun: () => ({ isBest: false }), getGhost: () => null,
               saveGhost: noop, runKey: () => 'k', logEvent: noop,
               runRecord: () => ({ best: null, runs: 0 }), data: {} },
  ForestConditions: { describe: () => '' },
  Water: { setPalette: noop, setFog: noop, setSeaState: noop, DEFAULTS: {},
           sampleHeight: () => 0, build: noop, update: noop, follow: noop },
  Sky: { setPreset: noop, resetPreset: noop, PALETTE: { fog: '#fff' },
         mergeGeometries: () => ({}), glowTexture: () => ({}) },
  // The real thing rather than a one-hour stub: `SkiTwists` names hours
  // by id, and a stub that only knows about midday cannot tell a typo
  // from a card that works.
  Engine: { disposeObject: noop, isPaused: () => false, setPaused: noop },
  Screens: { show: noop },
  Party: { hostId: 'h', selfId: () => 'me', isHost: true },
};

const ctx = H.load(['js/core/util.js', 'js/core/missions.js', 'js/world/conditions.js',
                    'js/missions/agendas.js', 'js/missions/shootout-rounds.js',
                    'js/world/forest.js', 'js/world/reef.js', 'js/entities/swimmer.js',
                    'js/missions/boat-race.js', 'js/missions/shootout.js',
                    'js/missions/dive-twists.js', 'js/missions/dive.js',
                    'js/world/mountain.js', 'js/entities/skier.js',
                    'js/missions/ski-twists.js', 'js/missions/ski.js'], stubs);
const BR = ctx.BoatRaceMission;
const SH = ctx.ShootoutMission;
const DV = ctx.DiveMission;
const SK = ctx.SkiMission;
const MK = ctx.MountainKit;
const U = ctx.U;

/* The switch itself is still worth a test even with nothing currently
   off: it is the mechanism every future "ship it next week" mission
   will hang on, and the failure it prevents — a half-finished mission
   reachable from a stale invitation link — is silent. */
section('mission registry — the feature switch, and the dive back through it');

test('the descent is available through every route', () => {
  ok(SK, 'the ski implementation is loaded');
  ok(ctx.Missions.get('ski'), 'a direct lookup finds it');
  ok(ctx.Missions.all().some(m => m.id === 'ski'),
     'the menu and full-game planner offer it');
});

test('the dive is available through every route again', () => {
  ok(DV, 'the dive implementation is loaded');
  ok(ctx.Missions.get('dive'), 'a direct lookup finds it');
  ok(ctx.Missions.all().some(m => m.id === 'dive'),
     'the menu and full-game planner offer it');
});

test('a mission switched off is unavailable through every route', () => {
  ctx.Missions.register({ id: 'off-test', name: 'Off', enabled: false, create: () => ({}) });
  eq(ctx.Missions.get('off-test'), undefined,
     'direct lookups cannot expose a disabled mission');
  ok(!ctx.Missions.all().some(m => m.id === 'off-test'),
     'the menu and full-game planner cannot see it');
  eq(ctx.Missions.launch('off-test'), null,
     'a stale button or invitation cannot launch it');
});

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

test('the longest stop is one stop, not six little ones', () => {
  const r = racer();
  tick(r, 1.2, { s: 0, speed: 1 });
  eq(r.stats.longestStop, 0, 'waiting on the start line is not open water');
  tick(r, 0.6, { s: 100, speed: 1 });
  tick(r, 0.6, { s: 110, speed: 20 });        // moving again
  tick(r, 0.6, { s: 200, speed: 1 });
  eq(Math.round(r.stats.longestStop * 10), 6, 'two sixths of a stop is not a stop');
  tick(r, 0.6, { speed: 1 });
  eq(Math.round(r.stats.longestStop * 10), 12, 'holding it is');
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

test('sitting one out and coming back clean is both facts, kept', () => {
  const s = shooter();
  endRound(s, { roundT: 30, offLineT: 28 });
  endRound(s, { shots: 6, misses: 0 });
  ok(s.stats.roundsOffLine >= 1, 'the walk was counted');
  ok(s.stats.cleanRoundAfterWalk, 'and so was the round that answered it');
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



section('the dive — the counters the deck reads');

/* A diver, with nothing in it that the trackers do not actually touch.
   Everything below runs the mission's own methods against this, which
   is only possible because they are honest functions over the state
   they are given. */
function diver(o = {}) {
  return Object.assign({
    C: DV.CONFIG,
    stats: DV.freshStats(),
    carry: [],
    money: 0,
    payout: 1,
    mode: 'salvage',
    timeLeft: 180,
    state: 'live',
    peers: new Map(),
    inTrip: false, tripDeepest: 0, tripTook: 0, deepest: 0,
    swimmer: { flow: 0, carried: 0, pos: { x: 0, y: -10, z: 0 }, grabbed: false,
               tune: Object.assign({}, ctx.Swimmer.TUNE) },
    elapsed: 0,
    bankLog: [],
    _carryValue: DV.prototype._carryValue,
    _respawnFor: DV.prototype._respawnFor,
    _bankedSince: DV.prototype._bankedSince,
    _tierAt: DV.prototype._tierAt,
  }, o);
}

// one chest, as the mission models it
const chest = (tier, mult = 1, dropped = false) => ({
  id: 1, tier, value: DV.CONFIG.tiers[tier].value, mult, dropped,
  depth: -DV.CONFIG.tiers[tier].top, mesh: null, glow: null,
});

// a whole trip: down to `deep`, take `took` chests, come back up
function trip(d, deep, took) {
  d.inTrip = true;
  d.tripDeepest = deep;
  d.tripTook = took;
  d.deepest = Math.max(d.deepest, deep);
  d.stats.deepest = Math.round(d.deepest * 10) / 10;
  DV.prototype._endTrip.call(d);
  return d.stats;
}

test('a trip is counted where it went and whether it came back with anything', () => {
  const d = diver();
  trip(d, 12, 2);
  trip(d, 40, 0);
  trip(d, 41, 1);
  eq(d.stats.trips, 3, 'three trips');
  eq(d.stats.emptyTrips, 1, 'one of them empty');
  eq(d.stats.trenchTrips, 2, 'two of them to the trench');
  eq(d.stats.trenchEmpty, 1, 'and the empty one was a trench trip');
  eq(d.stats.deepest, 41, 'deepest is the deepest');
});

test('a shallow empty trip is not a trench confession', () => {
  const d = diver();
  trip(d, 9, 0);
  eq(d.stats.trenchTrips, 0, 'the shelf is not the trench');
  eq(d.stats.trenchEmpty, 0, 'and neither is coming back off it empty');
  eq(d.stats.emptyTrips, 1, 'but it is still an empty trip');
});

test('what you are holding is worth the chain you took it on', () => {
  const d = diver();
  d.carry = [chest(2, 1.55), chest(0, 1)];
  const v = d._carryValue();
  eq(v, Math.round(DV.CONFIG.tiers[2].value * 1.55 + DV.CONFIG.tiers[0].value),
     'the flow multiplier is banked with the chest, not with the run');
});

test('"the last minute" is a rolling window, so The Deep has one too', () => {
  const d = diver({ elapsed: 100 });
  d.bankLog = [{ t: 10, v: 5000 }, { t: 35, v: 900 }, { t: 92, v: 1200 }];
  DV.prototype._trackAgenda.call(d, 0.1);
  eq(d.stats.lastMinuteBanked, 1200, 'only the money banked inside the window counts');
  d.elapsed = 200;
  DV.prototype._trackAgenda.call(d, 0.1);
  eq(d.stats.lastMinuteBanked, 0, 'and it falls out of the window as the run goes on');
});

test('the biggest carry of the night is remembered even after it is banked', () => {
  const d = diver();
  d.carry = [chest(2, 1.5), chest(2, 1.5), chest(1, 1)];
  d.stats.peakCarry = Math.max(d.stats.peakCarry, d.carry.length);
  d.stats.peakCarryValue = Math.max(d.stats.peakCarryValue, d._carryValue());
  const held = d.stats.peakCarryValue;
  d.carry = [];
  ok(held > 0 && d.stats.peakCarryValue === held, 'the peak survives the bank');
  eq(d.stats.peakCarry, 3, 'and so does the count');
});

test('which tier a depth is in comes from CONFIG, not from a hard-coded 34', () => {
  const d = diver();
  eq(d._tierAt(0), 0, 'the surface is the shelf');
  eq(d._tierAt(15.9), 0, 'and so is anything above the shelf floor');
  eq(d._tierAt(16.1), 1, 'past it is the wreck');
  eq(d._tierAt(34.1), 2, 'and past that is the trench');
  eq(d._tierAt(999), 2, 'nothing is deeper than the deepest tier');
});

test('each tier comes back on its own clock', () => {
  const d = diver();
  ok(d._respawnFor(0) < d._respawnFor(1), 'the shelf refills faster than the wreck');
  ok(d._respawnFor(1) < d._respawnFor(2), 'and the wreck faster than the trench');
  ok(DV.CONFIG.cave.respawn > d._respawnFor(2),
     'and the caves slowest of all, or a cave is just a better trench');
});

/* ---- the caves ----
   Cave salvage is a trench chest wearing violet: it uses the trench's
   tier index everywhere so the depth bands, the tape and the music
   gears keep working, and the *only* places it differs are the slot it
   travels in and the column it lands in. Both of those are one-line
   decisions and both are exactly the kind that rot silently. */

test('cave salvage travels in its own slot and nothing else moves', () => {
  eq(DV._packIndex({ tier: 0 }), 0, 'the shelf is slot nought');
  eq(DV._packIndex({ tier: 2 }), 2, 'the trench is slot two');
  eq(DV._packIndex({ tier: 2, cave: true }), 3, 'and a cave chest is slot three');
  eq(DV._packIndex({ tier: 0, cave: true }), 3, 'whatever tier it was found in');
  ok('cave' in DV.freshStats().tierBanked,
     'the card has a column for it, or the money lands nowhere');
});

test('what a cave chest is worth is not what the trench is worth', () => {
  const d = diver();
  d.carry = [Object.assign(chest(2), { cave: true, value: DV.CONFIG.cave.value })];
  eq(d._carryValue(), DV.CONFIG.cave.value, 'it is priced off CONFIG.cave');
  ok(DV.CONFIG.cave.value > DV.CONFIG.tiers[2].value * 2,
     'and it is worth going under a roof for');
});

/* The conservation rule, which is the one sentence this mission cannot
   afford to lose: money taken off the reef comes back, money dropped on
   the floor was never taken off it. The caves have to obey it too, or a
   diver bitten in a cave mints violet gold. */
test('the caves keep their own population, and a dropped one still counts', () => {
  const spawned = [];
  const base = () => ({
    C: DV.CONFIG,
    party: false, isHost: true,
    caves: { list: [{ x: 0, z: 0, R: 12 }] },
    _tierT: DV.CONFIG.tiers.map(() => 0),
    _caveT2: 0,
    _spawnChest: (t, at, o) => { spawned.push({ t, cave: !!(o && o.cave) }); return {}; },
    _respawnFor: DV.prototype._respawnFor,
  });

  // a full loch asks for nothing, however long it waits
  const full = Object.assign(base(), {
    chests: [].concat(
      DV.CONFIG.tiers.map((t, i) => Array.from({ length: t.chests }, () => ({ tier: i }))).flat(),
      Array.from({ length: DV.CONFIG.cave.chests }, () => ({ tier: 2, cave: true }))),
  });
  DV.prototype._tickRespawn.call(full, DV.CONFIG.cave.respawn * 3);
  eq(spawned.length, 0, 'nothing respawns while the reef is stocked');

  // a cave chest lying on the sand where a shark knocked it is still
  // cave money in the loch: the ground does not replace it
  spawned.length = 0;
  const dropped = Object.assign(base(), {
    chests: [].concat(
      DV.CONFIG.tiers.map((t, i) => Array.from({ length: t.chests }, () => ({ tier: i }))).flat(),
      Array.from({ length: DV.CONFIG.cave.chests },
                 (_, i) => ({ tier: 2, cave: true, dropped: i === 0 }))),
  });
  DV.prototype._tickRespawn.call(dropped, DV.CONFIG.cave.respawn * 3);
  eq(spawned.length, 0, 'a dropped cave chest is not a missing one');

  // ...but one actually carried out of the loch is
  spawned.length = 0;
  const short = Object.assign(base(), {
    chests: [].concat(
      DV.CONFIG.tiers.map((t, i) => Array.from({ length: t.chests }, () => ({ tier: i }))).flat(),
      Array.from({ length: DV.CONFIG.cave.chests - 1 }, () => ({ tier: 2, cave: true }))),
  });
  DV.prototype._tickRespawn.call(short, DV.CONFIG.cave.respawn + 0.1);
  eq(spawned.length, 1, 'a cave that is short refills');
  eq(spawned[0].cave, true, 'and it refills with cave salvage, not with a trench chest');

  // and cave chests must not be counted as trench stock, or the trench
  // quietly stops refilling the moment somebody works the caves
  spawned.length = 0;
  const trenchShort = Object.assign(base(), {
    chests: [].concat(
      DV.CONFIG.tiers.map((t, i) => Array.from({ length: t.chests }, () => ({ tier: i }))).flat()
        .filter((c, i, all) => !(c.tier === 2 && i === all.findIndex(x => x.tier === 2))),
      Array.from({ length: DV.CONFIG.cave.chests + 4 }, () => ({ tier: 2, cave: true }))),
  });
  DV.prototype._tickRespawn.call(trenchShort, DV.CONFIG.tiers[2].respawn + 0.1);
  ok(spawned.some(x => x.t === 2 && !x.cave),
     'the trench refills even with a loch full of cave salvage');
});

test('what the other two are doing is read off their poses, not guessed', () => {
  const d = diver();
  d.peers.set('a', { deepest: 44, money: 9000, value: 6200, trips: 7 });
  d.peers.set('b', { deepest: 12, money: 14000, value: 900, trips: 11 });
  DV.prototype._trackAgenda.call(d, 0.1);
  eq(d.stats.maxOtherDeepest, 44, 'the deepest of them');
  eq(d.stats.maxOtherBanked, 14000, 'the richest of them');
  eq(d.stats.maxOtherPeakCarry, 6200, 'and the biggest carry out there');
  eq(d.stats.otherTrips, 18, 'their trips are pooled, because the card compares to the field');
});

section('the dive — the reef the seed draws');

/* Every seed has to give all three tiers somewhere to put a chest, and
   it has to keep the deepest sand inside what a diver can come back
   from. Both are properties of the floor function alone, so two
   thousand of them cost nothing. */
/* Half of this reef is a hillside now, so every one of these samples
   the *seaward* half-turn measured off the shore bearing — which is
   exactly the arc `_spawnChest` draws its own bearings from. Sampling
   the whole disc would be asserting that the mountain has chests in it. */
function seaward(h, shore, R, n) {
  const pts = [];
  /* Two *independent* low-discrepancy sequences. The obvious pair —
     0.618034 for the bearing and 0.381966 for the radius — are the same
     sequence reversed, so every sample at maximum radius landed at the
     extreme bearing, which on this reef is straight along the beach.
     The trench was never sampled once. */
  for (let i = 0; i < n; i++) {
    const a = shore.ang + Math.PI + (((i * 0.618034) % 1) - 0.5) * 3.24;
    const r = R * Math.sqrt((i * 0.7548776662 + 0.137) % 1);
    pts.push(h(Math.sin(a) * r, Math.cos(a) * r));
  }
  return pts;
}

test('every seed lays down all three tiers, and none of them out of reach', () => {
  const R = DV.CONFIG.reefRadius;
  const T = DV.CONFIG.tiers;
  for (let seed = 1; seed <= 2000; seed++) {
    const shore = ctx.ReefKit.shoreFor((seed * 0.7913) % (Math.PI * 2));
    const h = ctx.ReefKit.makeFloor(U.makeRng(seed), { radius: R, shore });
    const share = [0, 0, 0];
    let deepest = 0;
    for (const y of seaward(h, shore, R * 0.96, 420)) {
      deepest = Math.min(deepest, y);
      for (let t = 0; t < T.length; t++) {
        if (y <= T[t].top && y > T[t].bottom) { share[t]++; break; }
      }
    }
    ok(share[0] > 8 && share[1] > 8 && share[2] > 8,
       'seed ' + seed + ' has a tier with nowhere to put a chest: ' + share.join('/'));
    ok(deepest > -56,
       'seed ' + seed + ' has sand at ' + deepest.toFixed(1) + 'm, past what a diver survives');
  }
});

test('the shelf is the tier you are most often floating over', () => {
  const R = DV.CONFIG.reefRadius;
  let shelf = 0, n = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const shore = ctx.ReefKit.shoreFor((seed * 1.213) % (Math.PI * 2));
    const h = ctx.ReefKit.makeFloor(U.makeRng(seed), { radius: R, shore });
    for (const y of seaward(h, shore, R * 0.96, 600)) {
      if (y > -16 && y < 0) shelf++;
      n++;
    }
  }
  const pct2 = shelf / n;
  ok(pct2 > 0.15 && pct2 < 0.60,
     'the shelf covers ' + Math.round(pct2 * 100) + '% of the reef, which is the wrong shape');
});

/* The shore is a *contract* with the mission, not just scenery: there
   has to be dry ground to stand on, a tideline to come back to, and no
   seed where either is somewhere you cannot swim. */
test('every seed puts a beach at the origin with the loch in front of it', () => {
  const R = DV.CONFIG.reefRadius;
  for (let seed = 1; seed <= 600; seed++) {
    const shore = ctx.ReefKit.shoreFor((seed * 0.3971) % (Math.PI * 2));
    const h = ctx.ReefKit.makeFloor(U.makeRng(seed), { radius: R, shore });
    const at = (e) => h(shore.nx * e, shore.nz * e);

    const landing = at(shore.landAt);
    ok(landing > 1.2 && landing < 5,
       'seed ' + seed + ' has a landing at ' + landing.toFixed(2) + 'm, which is not a beach');
    // and it is flat enough to stand on rather than a slope you slide off
    ok(Math.abs(at(shore.landAt + 3) - landing) < 1.2,
       'seed ' + seed + ' has a landing on a slope');
    // walking seaward has to reach water, and keep going down
    ok(at(-6) < -0.5, 'seed ' + seed + ' has no water in front of the beach');
    ok(at(-70) < at(-30) && at(-30) < at(-8),
       'seed ' + seed + ' does not shelve away from the shore');
    // and the hill behind it has to actually be a hill
    ok(at(400) > 120, 'seed ' + seed + ' has no highland behind the beach');
  }
});

section('the dive — the briefing, before anything is built');

/* `preview` runs on every keystroke in the seed box, with no GPU and
   whatever the user has typed. It has to answer with the full key set
   or the briefing renders holes. */
test('the briefing survives junk and answers with everything', () => {
  const KEYS = ['opts', 'mod', 'cond', 'name', 'conditionText', 'hand', 'mode',
                'payout', 'key', 'record', 'bestText', 'hasGhost', 'tiers'];
  for (const opts of [{}, { seed: 'nonsense' }, { seed: -4 }, { seed: 1e18 },
                      { mode: 'nope' }, { modId: 'nothing' },
                      { seed: 7, mode: 'deep', modId: 'cold' }]) {
    const p = DV.preview(opts);
    for (const k of KEYS) ok(k in p, 'preview(' + JSON.stringify(opts) + ') has no ' + k);
    ok(p.hand.length === 3, 'a hand is three cards');
    ok(p.payout > 0, 'a payout is a number');
    ok(p.mode && p.mode.id, 'a mode is always resolved');
  }
});

test('a run repeats exactly, and a different seed does not', () => {
  const a = DV.preview({ seed: 4242, mode: 'salvage' });
  const b = DV.preview({ seed: 4242, mode: 'salvage' });
  eq(a.hand.map(c => c.id), b.hand.map(c => c.id), 'the same seed deals the same hand');
  eq(a.name, b.name, 'and the same loch');
  const c = DV.preview({ seed: 4243, mode: 'salvage' });
  ok(c.name !== a.name || c.hand[0].id !== a.hand[0].id, 'a different seed is a different run');
});

test('every twist is a bag of overrides and nothing else', () => {
  const ALLOWED = new Set(['id', 'name', 'icon', 'payout', 'blurb',
                           'config', 'tune', 'cond', 'flags']);
  const seen = new Set();
  for (const t of ctx.DiveTwists.DECK) {
    ok(!seen.has(t.id), 'duplicate twist id ' + t.id);
    seen.add(t.id);
    for (const k in t) ok(ALLOWED.has(k), t.id + ' carries code, not overrides: ' + k);
    ok(typeof t.payout === 'number' && t.payout > 0, t.id + ' has no payout');
    ok(t.blurb && t.blurb.length > 20, t.id + ' does not say what it does');
    // a tune override has to name a dial the swimmer actually has, or
    // it is a card that silently does nothing
    for (const k in (t.tune || {})) {
      ok(k in ctx.Swimmer.TUNE, t.id + ' tunes something the diver has not got: ' + k);
    }
    for (const k in (t.config || {})) {
      ok(k in DV.CONFIG, t.id + ' overrides a config key that does not exist: ' + k);
    }
  }
});

/* ==================================================================
   The Descent — the counters the deck reads, and the mountain itself.

   The mission half is the same trick as the dive's: the trackers are
   honest functions over the state they are handed, so they can be run
   directly against a mission built with `Object.create` — real
   prototype, real getters, no scene.

   The mountain half is different and is the more important of the two.
   `mountain.js` generates terrain from a seed, and the two ways that
   goes wrong are both silent: a hill with an uphill in it strands a
   skier where the run simply stops, and a hill with no shortcuts on it
   is missing half the mission. Neither shows up as an exception. Both
   are checked here across a spread of seeds, because "it looked fine
   on the seed I was testing" is exactly how both of them shipped.
   ================================================================== */

section('the descent — the counters the deck reads');

/* A run, with nothing in it the trackers do not touch. Built on the
   real prototype so `_mult` and the rest of the getters are the real
   ones rather than a second copy of the rule. */
function skier(o = {}) {
  const v = { x: 0, y: 0, z: 0,
    copy(p) { this.x = p.x; this.y = p.y; this.z = p.z; return this; },
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    setY(y) { this.y = y; return this; } };
  return Object.assign(Object.create(SK.prototype), {
    C: SK.CONFIG,
    stats: SK.freshStats(),
    flags: {},
    mode: 'prize',
    payout: 1,
    state: 'running',
    money: 0, descentMoney: 0, hoopMoney: 0, trickMoney: 0,
    grazeMoney: 0, chuteMoney: 0,
    flow: 0, flowLevel: 1, peakFlow: 1,
    hoopsHit: 0, perfects: 0, golds: 0, tricks: 0, stomps: 0, crashes: 0,
    chutesDone: 0, chutes: [],
    vertical: 0, topSpeed: 0, airTotal: 0, biggestAir: 0,
    elapsed: 0, time: 96, deduct: 0,
    hitStop: 0, shake: 0, fovKick: 0, camDip: 0, camPush: 0,
    timeScaleTarget: 1, _inFinal: false, _grazing: false,
    _grazeT: 0, _slowT: 0, _straightT: 0, _atTopT: 0, _atOneT: 0, _stuckT: 0,
    _curChute: null, _tmpV: v, _prevPos: { x: 0, y: 0, z: 0 },
    world: { colliders: [] },
    hud: {},                    // every writer checks its element first
    fx: { labels: { add: noop }, rings: { fire: noop }, spray: { emit: noop },
          wake: { clear: noop } },
    camera: { quaternion: {} },
    score: null,
    skier: { crashed: false, airborne: false, speed: 30, carve: 0, tuck: 0,
             slip: 0, pos: { x: 0, y: 100, z: 0 }, airHeight: 0 },
  }, o);
}

test('the ladder climbs on carving and air, and not on standing still', () => {
  const m = skier();
  m.skier.carve = 1; m.skier.speed = 40;
  for (let i = 0; i < 60; i++) m._updateFlow(1 / 60);
  ok(m.flow > 0.1, 'a second of clean carving moves the bar: ' + m.flow.toFixed(3));

  const air = skier();
  air.skier.airborne = true;
  for (let i = 0; i < 60; i++) air._updateFlow(1 / 60);
  ok(air.flow > m.flow, 'air pays the bar faster than carving does');

  const idle = skier({ flow: 0.5 });
  idle.skier.speed = 2;                     // below the floor
  for (let i = 0; i < 60; i++) idle._updateFlow(1 / 60);
  ok(idle.flow < 0.5, 'crawling drains it: ' + idle.flow.toFixed(3));
});

test('a rung is a rung: the bar carries over, and six is the ceiling', () => {
  const m = skier({ flow: 0.9 });
  m.skier.airborne = true;
  for (let i = 0; i < 30; i++) m._updateFlow(1 / 60);
  eq(m.flowLevel, 2, 'filling the bar climbs exactly one rung');
  ok(m.flow > 0 && m.flow < 1, 'and the overflow carries into the next one');

  const top = skier({ flow: 0.99, flowLevel: SK.CONFIG.flowLevels });
  top.skier.airborne = true;
  for (let i = 0; i < 600; i++) top._updateFlow(1 / 60);
  eq(top.flowLevel, SK.CONFIG.flowLevels, 'the ladder has a top');
  ok(top.flow <= 1, 'and the bar does not run past it');
  ok(top._atTopT > 9, 'time spent at the top is counted for the deck');
});

test('the meter multiplies the descent, which is the whole economy', () => {
  const one = skier({ flowLevel: 1 });
  const six = skier({ flowLevel: 6 });
  for (let i = 0; i < 60; i++) { one._earnDescent(1 / 60); six._earnDescent(1 / 60); }
  ok(one.money > 0, 'moving at speed pays');
  const ratio = six.money / one.money;
  ok(Math.abs(ratio - 6) < 0.01, 'six rungs is six times the money, got ×' + ratio.toFixed(2));

  const slow = skier({ flowLevel: 6 });
  slow.skier.speed = SK.CONFIG.speedFloor - 1;
  for (let i = 0; i < 60; i++) slow._earnDescent(1 / 60);
  eq(slow.money, 0, 'and below the floor the mountain pays nothing at all');
});

test('a crash costs three rungs and seconds, and never more than the ladder has', () => {
  const m = skier({ flowLevel: 6, flow: 0.8, time: 60 });
  m._onCrash('TREE');
  eq(m.flowLevel, 3, 'six rungs becomes three');
  eq(m.flow, 0, 'and the bar with it');
  eq(m.crashes, 1, 'the deck can count it');
  eq(m.stats.crashes, 1, '...and so can the board');
  ok(m.time < 60, 'it costs clock too');

  const low = skier({ flowLevel: 2 });
  low._onCrash('ROCK');
  eq(low.flowLevel, 1, 'and it can never take you below the bottom rung');
});

test('the shortcut pays for coming out of the bottom and not for bailing', () => {
  const c = { name: 'The Snare', z0: 100, z1: 500, hard: 0.5, half: 18, depth: 5,
              taken: false, entered: true };
  const done = skier({ _curChute: c, chutes: [c] });
  done.skier.pos.z = 500;
  done._leaveChute();
  ok(done.chuteMoney > 0, 'getting out of the far end pays');
  eq(done.stats.chutesTaken, ['The Snare'], 'and the board says which one');
  eq(done.chutesDone, 1, 'and it counts');

  const bail = skier({ _curChute: Object.assign({}, c, { taken: false }), flow: 0.9 });
  bail.skier.pos.z = 300;                   // out of the side, halfway down
  bail._leaveChute();
  eq(bail.chuteMoney, 0, 'coming out of the side pays nothing');
  eq(bail.stats.chutesBailed, 1, 'and the deck can see that you did');
  ok(bail.flow < 0.9, 'and it costs meter');
});

test('the wood pays while you hold it, and only while you are quick', () => {
  const m = skier({ world: { colliders: [{ x: 1, y: 0, z: 0, r: 0.8, kind: 'tree' }] } });
  m.skier.speed = 30;
  for (let i = 0; i < 120; i++) m._checkGraze(1 / 60);
  ok(m.grazeMoney > 0, 'two seconds inside a tree pays');
  ok(m.stats.trees >= 2, 'and the board counts the payments: ' + m.stats.trees);

  const slow = skier({ world: { colliders: [{ x: 1, y: 0, z: 0, r: 0.8, kind: 'tree' }] } });
  slow.skier.speed = 3;
  for (let i = 0; i < 120; i++) slow._checkGraze(1 / 60);
  eq(slow.grazeMoney, 0, 'drifting past one at walking pace does not');
});

test('the two counters nothing else in the mission would have kept', () => {
  const m = skier();
  // stopped: the one the "stall for five seconds" card is judged on
  m.skier.speed = 4;
  for (let i = 0; i < 360; i++) { m._prevPos = { x: 0, y: 100, z: 0 }; m._trackFlags(1 / 60); }
  ok(m.stats.slowestStretch >= 5.9,
     'the longest stop is timed: ' + m.stats.slowestStretch.toFixed(1) + 's');

  // straight-lining: quick, and doing nothing at all with it
  const st = skier();
  st.skier.speed = 34; st.skier.carve = 0;
  for (let i = 0; i < 180; i++) { st._prevPos = { x: 0, y: 100, z: 0 }; st._trackFlags(1 / 60); }
  ok(st.stats.straightLined >= 2.9,
     'and so is a long straight line: ' + st.stats.straightLined.toFixed(1) + 's');
});

test('a landing is graded, and the grades are ordered', () => {
  const S = ctx.Skier;
  eq(S.gradeOf(1.0).id, 'stomped', 'a perfect landing is stomped');
  eq(S.gradeOf(0.5).id, 'clean', 'a good one is clean');
  eq(S.gradeOf(0.3).id, 'sketchy', 'a poor one is a wobble');
  eq(S.gradeOf(0).id, 'crash', 'and a bad one is a crash');
  let prevKeep = -1;
  for (const g of S.LANDINGS) {
    ok(g.keep >= prevKeep, 'a better landing never keeps less speed: ' + g.id);
    prevKeep = g.keep;
  }
});

test('rails are absent from the descent and its modifier deck', () => {
  ok(!Object.keys(SK.CONFIG).some(k => /rail|grind/i.test(k)),
     'the mission still exposes rail configuration');
  ok(!ctx.SkiTwists.DECK.some(t => t.id === 'ironworks'),
     'the rail-only modifier is still dealt');
  for (const t of ctx.SkiTwists.DECK) {
    ok(!Object.keys(t.config || {}).some(k => /rail|grind/i.test(k)),
       t.id + ' still configures rails');
  }
});

section('the descent — the mountain the seed draws');

/* Ten mountains, and the two invariants that are silent when broken. */
const FACES = [];
for (let i = 0; i < 10; i++) {
  const seed = (1 + i * 104729) >>> 0;
  const f = MK.makeFace(ctx.U.makeRng((seed ^ 0x51a3f7) >>> 0),
                        { top: SK.CONFIG.top, sections: SK.CONFIG.sections });
  const chutes = MK.findChutes(f, ctx.U.makeRng(seed + 31), { count: SK.CONFIG.chutes });
  f.seal();
  FACES.push({ seed, f, chutes });
}

/* A body with momentum, reading nothing but `heightAt`. Not a skier —
   no edges, no steering, no jumping — deliberately, because the thing
   being tested is the *mountain*: if the dumbest possible object that
   obeys gravity and drag can get from the top to the bottom of a face,
   then no shape in that face is a trap, and if it cannot then no amount
   of skiing was going to help.

   Momentum is the whole point of using one. A pure downhill walk stops
   on the first roller crest, which is a feature rather than a fault;
   only a closed basin stops something that is already moving. */
function marble(f, lat0, cap = 600) {
  let x = f.cxAt(0) + lat0, z = 0, vx = 0, vz = 8;
  const dt = 1 / 40;
  for (let i = 0; i < cap / dt; i++) {
    const hx = (f.heightAt(x + 1, z) - f.heightAt(x - 1, z)) / 2;
    const hz = (f.heightAt(x, z + 1) - f.heightAt(x, z - 1)) / 2;
    const m2 = hx * hx + hz * hz;
    const k = 19.5 / (1 + m2);
    vx += -k * hx * dt;
    vz += -k * hz * dt;
    const v = Math.hypot(vx, vz);
    const drag = (0.05 * v + 0.006 * v * v) * dt;
    if (v > 1e-6) { vx -= (vx / v) * drag; vz -= (vz / v) * drag; }
    x += vx * dt; z += vz * dt;
    if (z >= f.total) return { got: z, stuck: false, t: i * dt };
  }
  return { got: z, stuck: true, t: cap };
}

test('nothing on any mountain can trap something that is already moving', () => {
  for (const { seed, f } of FACES) {
    for (const lat of [0, -0.5, 0.5]) {
      const r = marble(f, lat * f.halfAt(0));
      ok(!r.stuck, 'seed ' + seed + ' at lat ' + lat + ' stopped '
         + Math.round(r.got) + 'm down a ' + Math.round(f.total) + 'm face');
    }
  }
});

test('no mountain has a broad uphill in the middle of the run', () => {
  /* Measured over sixty metres, which is longer than any roller or
     kicker on the hill and shorter than any section of it — so a crest
     you are meant to launch off averages out and a basin does not.

     The bug this exists for: terrain noise contributes gradient of its
     own, and where that exceeded the pitch it sat on, flat sections had
     genuine uphills in them. A skier coasted into one, stopped, and the
     run was over with the clock still running. */
  let worst = 0, where = null;
  for (const { seed, f } of FACES) {
    for (let z = 70; z < f.total - 80; z += 10) {
      const half = f.halfAt(z), cx = f.cxAt(z);
      for (const k of [-0.4, 0, 0.4]) {
        const x = cx + k * half;
        const g = (f.heightAt(x, z + 30) - f.heightAt(x, z - 30)) / 60;
        if (g > worst) { worst = g; where = { seed, z: Math.round(z), k }; }
      }
    }
  }
  /* Five per cent is not "flat" — it is "gentle enough that the run
     never argues with you". The long wavelength of the fold is allowed
     to roll the ground a metre or two over sixty on the flattest
     sections and that reads as terrain rather than as a fault; the
     guarantee that nothing *stops* you is the marble above, which is
     the test that would actually fail if this went wrong again. */
  ok(worst <= 0.05, 'worst sixty-metre gradient ' + worst.toFixed(4)
     + (where ? ' at ' + JSON.stringify(where) : ''));
});

test('every mountain has shortcuts on it, and they save real metres', () => {
  for (const { seed, f, chutes } of FACES) {
    ok(chutes.length >= 2, 'seed ' + seed + ' drew ' + chutes.length + ' shortcuts');
    for (const c of chutes) {
      ok(c.gain > 15, 'a shortcut that saves nothing is not one: ' + c.gain.toFixed(0) + 'm');
      ok(c.z1 > c.z0, 'and it runs down the hill');
      ok(c.z1 <= f.total, 'and finishes on the mountain');
    }
    // no two of them overlap: a fork inside a fork cannot be read at speed
    const sorted = chutes.slice().sort((a, b) => a.z0 - b.z0);
    for (let i = 1; i < sorted.length; i++) {
      ok(sorted[i].z0 >= sorted[i - 1].z1, 'shortcuts on seed ' + seed + ' overlap');
    }
  }
});

test('a cliff has a landing under it, not a wall', () => {
  /* The other silent one. A `drop` used to snap from its full depth
     back to the mountain at the end of its tail, which is a vertical
     step across the landing of every cliff on the hill. */
  const f = FACES[0].f;
  const r = { kind: 'drop', x: 0, z: 0, ax: 0, len: 12, wide: 40, h: 8, tail: 3,
              c: 1, s: 0 };
  const at = (u) => f.rampY(r, 0, u * r.len);
  ok(at(0.6) < -3, 'the floor does leave: ' + at(0.6).toFixed(1));
  ok(Math.abs(at(2.95)) < 0.6, 'and it comes back smoothly: ' + at(2.95).toFixed(2));
  let worstStep = 0;
  for (let u = -0.3; u < 3.3; u += 0.01) {
    worstStep = Math.max(worstStep, Math.abs(at(u + 0.01) - at(u)));
  }
  ok(worstStep < 0.9, 'and there is no step in it: worst ' + worstStep.toFixed(2) + 'm');
});

section('the descent — the twists');

test('every card names something that exists', () => {
  for (const t of ctx.SkiTwists.DECK) {
    ok(t.id && t.name && t.blurb, 'a card needs all three: ' + t.id);
    ok(t.payout >= 1 || t.flags, t.id + ' has to be worth taking');
    for (const k in (t.tune || {})) {
      ok(k in ctx.Skier.TUNE, t.id + ' tunes a dial the skier has not got: ' + k);
    }
    for (const k in (t.config || {})) {
      ok(k in SK.CONFIG, t.id + ' overrides a config key that does not exist: ' + k);
    }
    if (t.cond && t.cond.snow) {
      ok(ctx.SkiConditions.byId(t.cond.snow), t.id + ' names snow that does not exist');
    }
    if (t.cond && t.cond.time) {
      ok(ctx.Conditions.TIMES.some(x => x.id === t.cond.time),
         t.id + ' names an hour that does not exist');
    }
  }
});

test('the hand is three distinct cards and the seed owns it', () => {
  const a = SK.hand(4242), b = SK.hand(4242), c = SK.hand(99);
  eq(a.map(x => x.id), b.map(x => x.id), 'the same seed deals the same hand');
  eq(new Set(a.map(x => x.id)).size, 3, 'three distinct cards');
  ok(a.map(x => x.id).join() !== c.map(x => x.id).join(), 'a different seed deals differently');
});


if (require.main === module) H.report();
