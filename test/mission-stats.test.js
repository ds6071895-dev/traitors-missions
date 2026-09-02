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
  AudioBus: { play: noop, define: noop, stop: noop },
  Music: { boss: () => null },
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
  Conditions: { TIMES: [{ id: 'noon', name: 'Midday', sky: {}, payout: 1 }],
                lights: () => ({}) },
  Engine: { disposeObject: noop, isPaused: () => false, setPaused: noop },
  Screens: { show: noop },
  Party: { hostId: 'h', selfId: () => 'me', isHost: true },
};

const ctx = H.load(['js/core/util.js', 'js/core/missions.js',
                    'js/missions/agendas.js', 'js/missions/shootout-rounds.js',
                    'js/world/forest.js', 'js/world/reef.js', 'js/entities/swimmer.js',
                    'js/missions/boat-race.js', 'js/missions/shootout.js',
                    'js/missions/dive-twists.js', 'js/missions/dive.js'], stubs);
const BR = ctx.BoatRaceMission;
const SH = ctx.ShootoutMission;
const DV = ctx.DiveMission;
const U = ctx.U;

/* The switch itself is still worth a test even with nothing currently
   off: it is the mechanism every future "ship it next week" mission
   will hang on, and the failure it prevents — a half-finished mission
   reachable from a stale invitation link — is silent. */
section('mission registry — the feature switch, and the dive back through it');

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

section('the dive — the deck, driven end to end');

/* Each card, performed and then covered, against the real check and
   the real cover. This is the pattern that catches a card whose alibi
   nothing in the mission can actually produce. */
function card(id) { return ctx.Agendas.byId(id); }

test('the empty trench trip, with and without its alibi', () => {
  const c = card('dv-empty-trench');
  const d = diver();
  trip(d, 44, 0);
  d.peers.set('a', { deepest: 30, money: 8000, value: 100, trips: 4 });
  d.money = 12000;
  DV.prototype._trackAgenda.call(d, 0.1);
  ok(c.check(d.stats), 'an empty trench trip is the task');
  ok(c.cover(d.stats), 'deepest and top of the strip is the alibi');

  const shallowRich = diver();
  trip(shallowRich, 44, 0);
  shallowRich.peers.set('a', { deepest: 52, money: 3000, value: 0, trips: 2 });
  shallowRich.money = 9000;
  DV.prototype._trackAgenda.call(shallowRich, 0.1);
  ok(c.check(shallowRich.stats), 'still the task');
  ok(!c.cover(shallowRich.stats), 'but somebody went deeper — no alibi');
});

test('two blackouts, covered only by having been the richest hands in the water', () => {
  const c = card('dv-two-blackouts');
  const d = diver();
  d.stats.blackouts = 2;
  d.stats.peakCarryValue = 15000;
  d.peers.set('a', { deepest: 0, money: 0, value: 9000, trips: 0 });
  DV.prototype._trackAgenda.call(d, 0.1);
  ok(c.check(d.stats), 'two is the task');
  ok(c.cover(d.stats), 'and the biggest carry of the three is the alibi');
  d.stats.peakCarryValue = 800;
  ok(!c.cover(d.stats), 'drowning cheap has no alibi');
  d.stats.blackouts = 1;
  ok(!c.check(d.stats), 'one is not two');
});

test('the quiet bell, covered by coming up on it holding the night', () => {
  const c = card('dv-quiet-bell');
  const d = diver({ elapsed: 180 });
  d.stats.finished = true;
  d.stats.lastMinuteBanked = 0;
  d.stats.finalCarryValue = 9000;
  d.stats.maxOtherPeakCarry = 5000;
  ok(c.check(d.stats), 'nothing banked late is the task');
  ok(c.cover(d.stats), 'and a huge final carry is the alibi');
  d.stats.lastMinuteBanked = 400;
  ok(!c.check(d.stats), 'banking anything at all fails it');
});

test('never going deep, covered by out-working the field', () => {
  const c = card('dv-never-deep');
  const d = diver();
  d.stats.finished = true;
  d.stats.deepest = 21;
  d.stats.trips = 14;
  d.stats.otherTrips = 18;
  d.stats.banked = 12000;
  d.stats.maxOtherBanked = 14000;
  ok(c.check(d.stats), 'staying above the trench is the task');
  ok(c.cover(d.stats), 'more trips and close on money is the alibi');
  d.stats.deepest = 40;
  ok(!c.check(d.stats), 'going down there fails it');
});

test('the pile you swam past, covered by having your hands full', () => {
  const c = card('dv-passed-drop');
  const d = diver();
  d.stats.passedDrops = 1;
  d.stats.peakCarry = 4;
  ok(c.check(d.stats), 'leaving a pile is the task');
  ok(c.cover(d.stats), 'being full when you did is the alibi');
  d.stats.peakCarry = 2;
  ok(!c.cover(d.stats), 'half-empty hands have no excuse');
});

test('a twist that rules a card out takes it out of the deck', () => {
  const pool = ctx.Agendas.DECKS.dive.filter(
    c => typeof c.needs !== 'function' || c.needs({ deepestOnly: true }));
  ok(pool.length > 0, 'Salvage Rights must not empty the deck');
  ok(!pool.some(c => c.id === 'dv-never-deep'),
     'staying shallow under Salvage Rights is a forfeit, not a task');
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

if (require.main === module) H.report();
