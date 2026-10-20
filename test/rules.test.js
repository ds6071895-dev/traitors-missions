/* ------------------------------------------------------------------
   rules.test.js — the programme's shape, played thousands of times.

   Five to eight contestants, one Traitor at five or six and two at
   seven or eight. Each day is three minutes in the castle — jobs,
   letters and, somewhere, the poison — then the round table, a night
   in which the poison takes, and a breakfast at which the body is
   found. Days run until four or fewer are left, and then the Fire of
   Truth: end it, unanimously, or banish again.

   Every game here is driven through `dispatch` by players who do
   random legal things — including a carrier who sometimes loses their
   nerve — on a clock this file owns, and every one of them has to
   terminate with the pot paid to the right people.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/session.js'];

let now = 1.7e12;
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(now); }
  static now() { return now; }
}

function fresh() {
  const ctx = H.load(FILES, { Date: FakeDate });
  ctx.GameState.load();
  return ctx;
}

const NAMES = ['Ana', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal'];
const roster = (n) => NAMES.slice(0, n).map((name, i) => ({ id: name.toLowerCase(), name, local: i === 0 }));

/* Everybody in one room, a step apart: reach and witnesses are always
   true, which is the hardest case for the rules (everything is legal,
   everything is seen). */
function openHouse(S) {
  S.setEyes({
    reach: () => 1,
    witnesses: (a, b) => ({ ids: S.alive().map(p => p.id).filter(id => id !== a && id !== b), room: 'hall' }),
    presence: () => Object.fromEntries(S.alive().map(p => [p.id, { room: 'hall', with: S.alive().map(q => q.id).filter(id => id !== p.id) }])),
  });
}

/* One whole game of random legal play. Returns what happened. */
function playGame(ctx, seed, n, opts = {}) {
  const S = ctx.Session;
  const r = ctx.U.makeRng((seed * 7919) >>> 0 || 1);
  const pick = (arr) => arr[r.int(0, arr.length - 1)];
  const log = { days: 0, deaths: [], poisons: [], exposed: [], recruits: [], recruitAllowed: [],
                fireRounds: 0, decides: [], aliveAtFire: null, steps: 0, deathsPerNight: [],
                victimsWereTraitors: 0, startTraitors: 0 };
  S.startParty({ seed, players: roster(n), mode: 'host', cast: opts.cast, wants: opts.wants });
  openHouse(S);
  log.startTraitors = S._peek().seats.length;
  for (let guard = 0; S.state.phase !== 'verdict' && guard < 800; guard++) {
    log.steps++;
    const st = S.state;
    const living = S.alive();
    const peek = S._peek();
    if (st.phase === 'hill') S.dispatch({ type: 'advance', authority: true });
    else if (st.phase === 'tasks') {
      log.days++;
      // some jobs, some letters
      for (const p of living) {
        for (const j of S.privateView(p.id).jobs) {
          if (r() < 0.6) continue;
          if (j.kind === 'station') S.dispatch({ type: 'chore', playerId: p.id, jobId: j.id });
          else S.dispatch({ type: 'handover', playerId: p.id, targetId: j.target });
        }
      }
      // the carrier, mostly
      const carrier = peek.carrier && S.playerById(peek.carrier);
      if (carrier && r() < (opts.nerve === undefined ? 0.85 : opts.nerve)) {
        const faithful = living.filter(p => peek.seats.indexOf(p.seat) < 0);
        if (faithful.length) {
          const victim = pick(faithful);
          S.dispatch({ type: 'poison', playerId: carrier.id, targetId: victim.id });
          log.poisons.push(victim.id);
        }
      }
      now = st.chores.endsAt + 50;
      S.dispatch({ type: 'tasksTick', authority: true });
    } else if (st.phase === 'night') {
      const traitors = living.filter(p => peek.seats.indexOf(p.seat) >= 0);
      const v = traitors.length ? S.privateView(traitors[0].id) : null;
      log.recruitAllowed.push(!!(v && v.night && v.night.canRecruit));
      if (v && v.night && (v.night.choose || v.night.canRecruit) && r() < 0.85) {
        const faithful = living.filter(p => peek.seats.indexOf(p.seat) < 0 && p.id !== peek.victim);
        const kind = v.night.canRecruit && r() < 0.5 ? 'recruit' : v.night.choose ? 'carrier' : 'none';
        const target = kind === 'recruit' ? pick(faithful) : kind === 'carrier' ? pick(traitors) : null;
        for (const tr of traitors) S.dispatch({ type: 'turretPick', playerId: tr.id, kind, targetId: target && target.id });
      }
      for (let k = 0; k < 8 && S.state.phase === 'night'; k++) {
        const offer = traitors.map(tr => S.privateView(tr.id)).find(x => x.night && x.night.offer);
        if (offer && offer.night.offer.answer === null) {
          const target = S.playerById(offer.night.offer.targetId);
          if (!log.recruits.some(x => x.id === target.id && x.day === log.days)) {
            log.recruits.push({ id: target.id, allowed: !!(v && v.night.canRecruit), day: log.days });
          }
          if (r() < 0.7) S.dispatch({ type: 'recruitAnswer', playerId: target.id, accept: r() < 0.5 });
        }
        now += 40000;
        S.dispatch({ type: 'nightTick', authority: true });
      }
    } else if (st.phase === 'breakfast') {
      const before = new Set(S.alive().map(p => p.id));
      const seatsNow = S._peek().seats.slice();
      for (let k = 0; k < 12 && !S.state.breakfast.revealed; k++) S.dispatch({ type: 'breakfastNext', authority: true });
      const b = S.state.breakfast;
      log.deathsPerNight.push(b.victim ? 1 : 0);
      if (b.victim) {
        log.deaths.push(b.victim);
        ok(before.has(b.victim), 'the victim was alive at nightfall');
        if (seatsNow.indexOf(S.playerById(b.victim).seat) >= 0) log.victimsWereTraitors++;
      }
      S.dispatch({ type: 'advance', authority: true });
    } else if (st.phase === 'table' || st.phase === 'finale') {
      const f = st.finale;
      if (st.phase === 'table' && !(st.exposure && st.exposure.checked)) {
        S.dispatch({ type: 'expose', authority: true });
        if (S.state.exposure.playerId) {
          log.exposed.push(S.state.exposure.playerId);
          S.dispatch({ type: 'exposeDone', authority: true });
        }
        continue;
      }
      if (st.phase === 'finale' && log.aliveAtFire === null) log.aliveAtFire = living.length;
      if (f.stage === 'decide') {
        log.fireRounds++;
        const allEnd = r() < 0.4;
        const votes = {};
        for (const p of living) {
          const c = allEnd || r() < 0.5 ? 'end' : 'banish';
          votes[p.id] = c;
          S.dispatch({ type: 'decide', playerId: p.id, choice: c });
        }
        log.decides.push(votes);
      } else if (f.stage === 'decisions') S.dispatch({ type: 'decisionPouch', authority: true });
      else if (f.stage === 'name') {
        for (const p of living) {
          const options = living.filter(q => q.id !== p.id && (!f.tied || f.tied.indexOf(q.id) >= 0));
          if (options.length) S.dispatch({ type: 'name', playerId: p.id, targetId: pick(options).id });
        }
      } else if (f.stage === 'names') S.dispatch({ type: 'speakName', authority: true });
      else if (f.stage === 'reveal') S.dispatch({ type: 'reveal', authority: true });
      else if (f.stage === 'pouches') S.dispatch({ type: 'pouch', authority: true });
      else if (f.stage === 'done') S.dispatch({ type: 'advance', authority: true });
      else break;
    } else break;
  }
  log.outcome = S.state.outcome;
  log.phase = S.state.phase;
  return log;
}

section('rules — the cast');

test('one Traitor at five or six, two at seven or eight, and every chair can be one', () => {
  const ctx = fresh();
  for (const [n, k] of [[5, 1], [6, 1], [7, 2], [8, 2]]) {
    const seen = new Set();
    for (let seed = 1; seed <= 200; seed++) {
      ctx.Session.startParty({ seed, players: roster(n), mode: 'host' });
      const peek = ctx.Session._peek();
      eq(peek.seats.length, k, n + ' players deal ' + k);
      peek.seats.forEach(s => seen.add(s));
      eq(ctx.Session.state.dealt, k, 'and the room is told how many');
    }
    eq(seen.size, n, 'every chair can be a Traitor at ' + n);
  }
});

test('the host may choose one, two, or one-or-two; a hidden count is not told', () => {
  const ctx = fresh();
  const S = ctx.Session;
  const sizes = (n, cast) => {
    const out = {};
    for (let seed = 1; seed <= 400; seed++) {
      S.startParty({ seed, players: roster(n), mode: 'host', cast });
      const k = S._peek().seats.length;
      out[k] = (out[k] || 0) + 1;
      eq(S.state.dealt, cast.count === 'random' || cast.none ? null : k, 'told only a fixed count');
    }
    return out;
  };
  eq(Object.keys(sizes(8, { count: '1' })), ['1'], 'one at eight');
  eq(Object.keys(sizes(5, { count: '2' })), ['2'], 'two at five');
  const both = sizes(6, { count: 'random' });
  ok(both[1] > 140 && both[2] > 140, 'one or two, about evenly: ' + JSON.stringify(both));
  const none = sizes(7, { count: '2', none: 0.25 });
  ok(none[0] > 60 && none[0] < 140 && none[2] > 260, 'a quarter with nobody: ' + JSON.stringify(none));
  eq(S.state.cast, { count: '2', none: 0.25 }, 'the choice is public');
  S.startParty({ seed: 3, players: roster(6), mode: 'host', cast: { count: 'bogus', none: 9 } });
  eq(S.state.cast, { count: 'auto', none: 0.5 }, 'and cleaned');
});

test('wants lean the deal and never decide it', () => {
  const ctx = fresh();
  const S = ctx.Session;
  const chances = (w, k) => Array.from(S.castChances(w.map(x => ({ '-2': 0.1, '-1': 0.4, 0: 1, 1: 2.5, 2: 10 })[x]), k));
  for (const [w, k] of [[[-2, -2, 0, 0, 0], 1], [[2, 2, 0, 0, 0], 1], [[2, 0, 0, 0, 0, 0, 0], 2],
                        [[-2, -2, -2, -2, -2, -2, -2, 0], 2], [[2, 2, 2, 2, 2], 1], [[-2, 2, -1, 1, 0, 0], 2]]) {
    const c = chances(w, k);
    ok(Math.abs(c.reduce((a, b) => a + b, 0) - k) < 1e-6, 'adds up to ' + k);
    ok(c.every(x => x >= S.WANT_MIN - 1e-9 && x <= S.WANT_MAX + 1e-9), 'never certain either way: ' + c.map(x => x.toFixed(3)));
  }
  // the asked-for case: two people who would rather not, three AIs, one Traitor
  const people = ['ana', 'bo'];
  const players = roster(5).map((p, i) => (i >= 2 ? Object.assign(p, { bot: true }) : p));
  let humans = 0, games = 4000;
  for (let seed = 1; seed <= games; seed++) {
    S.startParty({ seed, players, mode: 'host', cast: { count: '1' }, wants: { ana: -2, bo: -2 } });
    const seats = S._peek().seats;
    eq(seats.length, 1, 'still exactly one');
    if (seed === 1) ok(!/want|-2/.test(JSON.stringify(S.state)), 'and nobody\'s want is in the state');
    if (seats.some(x => x < 2)) humans++;
  }
  ok(humans > 0, 'a person who said no is still dealt it now and then: ' + humans);
  ok(humans / games < 0.1, 'but rarely: ' + humans + '/' + games);
  // and a person who wants it gets it most of the time, an AI's want is ignored
  let keen = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    S.startParty({ seed, players, mode: 'host', cast: { count: '1' }, wants: { ana: 2, cy: -2 } });
    if (S._peek().seats[0] === 0) keen++;
  }
  ok(keen / 2000 > 0.6 && keen / 2000 < 0.9, 'desperate, most of the time: ' + keen);
  // indifference deals exactly the hand it always dealt
  S.startParty({ seed: 77, players: roster(7), mode: 'host' });
  const plain = S._peek().seats.slice().sort();
  S.startParty({ seed: 77, players: roster(7), mode: 'host', wants: { ana: 0, bo: 0 } });
  eq(S._peek().seats.slice().sort(), plain, 'same seed, same hand');
});

test('a night dealt nobody plays on to the fire and the Faithfuls take the pot', () => {
  let played = 0;
  for (let seed = 1; seed <= 400 && played < 25; seed++) {
    const ctx = fresh();
    ctx.Session.startParty({ seed, players: roster(6), mode: 'host', cast: { count: '1', none: 0.5 } });
    if (ctx.Session._peek().seats.length) continue;
    played++;
    const log = playGame(ctx, seed, 6, { cast: { count: '1', none: 0.5 } });
    eq(log.startTraitors, 0, 'nobody dealt');
    eq(log.phase, 'verdict', 'it finished');
    ok(log.aliveAtFire !== null, 'at the fire, not at the first breakfast');
    ok(log.outcome.reason !== 'all-found', 'nobody was "found": ' + log.outcome.reason);
    ok(!log.outcome.hadTraitor && log.outcome.roles.every(p => p.role === 'faithful'), 'all Faithful');
    ok(log.outcome.roles.filter(p => p.alive).every(p => p.winner), 'the living win');
  }
  ok(played >= 10, 'enough empty nights: ' + played);
});

test('a hidden empty night still holds the Wise One\'s ten seconds, and chooses nobody', () => {
  const ctx = fresh();
  const S = ctx.Session;
  let seed = 1;
  for (; seed < 400; seed++) {
    S.startParty({ seed, players: roster(6), mode: 'host', cast: { count: 'random', none: 0.5 } });
    if (!S._peek().seats.length) break;
  }
  eq(S.state.dealt, null, 'the room is not told');
  S.dispatch({ type: 'wiseOpen', authority: true });
  ok(S.state.wise && !S.state.wise.done, 'the window opens');
  now = S.state.wise.endsAt + 50;
  S.dispatch({ type: 'wiseTick', authority: true });
  ok(S.state.wise.done, 'and closes on the clock');
  ok(roster(6).every(p => !S.privateView(p.id).wiseOne), 'and nobody is the Wise One');
  // a known empty night (the rehearsal door) has no window at all
  S.startParty({ seed: 5, players: roster(6), mode: 'host', rehearsal: true, traitorSeat: -1 });
  eq(S.state.dealt, 0);
  S.dispatch({ type: 'wiseOpen', authority: true });
  ok(!S.state.wise, 'no window');
});

test('two Traitors know each other; Faithfuls know nothing', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 11, players: roster(8), mode: 'host' });
  const S = ctx.Session;
  const seats = S._peek().seats;
  for (const p of S.state.players) {
    const v = S.privateView(p.id);
    if (seats.indexOf(p.seat) >= 0) {
      eq(v.role, 'traitor');
      eq(v.partners.length, 1, 'one partner');
      ok(v.poison, 'and is told about the poison');
    } else {
      eq(v.role, 'faithful');
      eq(v.partners.length, 0);
      eq(v.poison, null, 'a Faithful is told nothing about it');
    }
  }
});

test('eight seats, and a ninth is never seated', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 3, players: roster(8).concat([{ id: 'ivy', name: 'Ivy' }]), mode: 'host' });
  eq(ctx.Session.state.players.length, 8);
});

section('rules — the shape of a game');

test('every game terminates, and the days match the table size', () => {
  for (const n of [5, 6, 7, 8]) {
    let fires = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const ctx = fresh();
      const log = playGame(ctx, seed * 13 + n, n);
      eq(log.phase, 'verdict', n + 'p seed ' + seed + ' reaches a verdict');
      ok(log.outcome && log.outcome.roles.length === n, 'with every card face up');
      if (log.aliveAtFire !== null) { fires++; ok(log.aliveAtFire <= 4, 'the fire with four or fewer, saw ' + log.aliveAtFire); }
      ok(log.days >= 1 && log.days <= 8, 'between one and eight days, saw ' + log.days);
    }
    ok(fires > 0, n + ' players reach the fire on some games');
  }
});

test('the poison is the only way anybody dies, and never more than one a night', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const ctx = fresh();
    const log = playGame(ctx, seed, 5 + (seed % 4));
    ok(log.deathsPerNight.every(d => d <= 1), 'one death a night at most, seed ' + seed);
    ok(log.deaths.every(id => log.poisons.indexOf(id) >= 0), 'every death was poisoned first, seed ' + seed);
    eq(log.victimsWereTraitors, 0, 'and no Traitor ever died of it');
    const murdered = log.outcome.roles.filter(p => p.out === 'murdered').map(p => p.id).sort();
    eq(murdered, log.deaths.slice().sort(), 'the record agrees');
  }
});

test('a carrier who loses their nerve is always exposed, and nobody dies that night', () => {
  let exposures = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const ctx = fresh();
    const log = playGame(ctx, seed, 7 + (seed % 2), { nerve: 0 });
    eq(log.deaths.length, 0, 'no poison, no death');
    ok(log.exposed.length >= 1, 'and somebody was exposed, seed ' + seed);
    exposures += log.exposed.length;
    for (const id of log.exposed) eq(log.outcome.roles.find(p => p.id === id).role, 'traitor', 'only ever a Traitor');
  }
  ok(exposures > 200, 'two Traitors who never act are both found: ' + exposures);
});

test('a recruit is only ever offered when the Faithfuls can spare one', () => {
  let offered = 0, allowedNights = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const ctx = fresh();
    const log = playGame(ctx, seed, 8);
    allowedNights += log.recruitAllowed.filter(Boolean).length;
    for (const x of log.recruits) { offered++; ok(x.allowed, 'offered only when allowed'); }
  }
  ok(allowedNights > 0, 'some nights allow a recruit: ' + allowedNights);
  ok(offered > 0, 'and some recruits were offered: ' + offered);
});

test('recruitment never opens at five or six', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const ctx = fresh();
    const log = playGame(ctx, seed, 5 + (seed % 2));
    ok(log.recruitAllowed.every(x => !x), 'never at ' + (5 + (seed % 2)));
  }
});

test('the Fire of Truth only ends on a unanimous vote', () => {
  let ended = 0, sentRound = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const ctx = fresh();
    const log = playGame(ctx, seed, 5 + (seed % 4));
    if (log.outcome.baseReason === 'ended-by-vote' && log.decides.length) {
      ok(Object.values(log.decides[log.decides.length - 1]).every(v => v === 'end'), 'every pouch said end');
      ended++;
    }
    log.decides.slice(0, -1).forEach(v => { ok(Object.values(v).some(c => c === 'banish'), 'a round that went on had a banish'); sentRound++; });
  }
  ok(ended > 0 && sentRound > 0, 'both happen: ' + ended + ' ended, ' + sentRound + ' sent round');
});

test('the pot is earned in the castle, and goes to surviving Traitors, else to surviving Faithfuls', () => {
  let paidOut = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const ctx = fresh();
    const log = playGame(ctx, seed, 5 + (seed % 4));
    const o = log.outcome;
    ok(o.pot > 0 && o.pot % 500 === 0, 'the pot is jobs at five hundred each: ' + o.pot);
    const living = o.roles.filter(p => p.alive);
    const traitors = living.filter(p => p.role === 'traitor');
    const winners = o.roles.filter(p => p.winner);
    if (traitors.length) eq(winners.map(p => p.id).sort(), traitors.map(p => p.id).sort(), 'Traitors take it');
    else eq(winners.map(p => p.id).sort(), living.map(p => p.id).sort(), 'Faithfuls share it');
    eq(o.roles.reduce((a, p) => a + p.payout, 0), winners.length ? o.pot : 0, 'all of the pot, exactly');
    ok(o.roles.filter(p => !p.alive).every(p => p.payout === 0), 'the dead are paid nothing');
    paidOut++;
  }
  ok(paidOut === 300);
});

section('rules — the round table');

test('a tie is revoted between the tied; tied again, a lot is drawn', () => {
  const ctx = fresh();
  const S = ctx.Session;
  S.startParty({ seed: 5, players: roster(6), mode: 'host', rehearsal: true, parts: ['table', 'finale'] });
  eq(S.state.phase, 'table', 'straight to the table');
  const [a, b, c, d, e, f] = S.alive();
  const vote = (p, q) => S.dispatch({ type: 'name', playerId: p.id, targetId: q.id });
  vote(a, b); vote(b, a); vote(c, a); vote(d, b); vote(e, a); vote(f, b);
  while (S.state.finale.stage === 'names') S.dispatch({ type: 'speakName' });
  eq(S.state.finale.stage, 'name', 'voted again');
  eq(S.state.finale.tied.slice().sort(), [a.id, b.id].sort(), 'between the two of them');
  vote(c, c); ok(!S.state.finale.names[c.id], 'nobody names themselves');
  vote(c, d); ok(!S.state.finale.names[c.id], 'nor anybody off the slate');
  vote(a, b); vote(b, a); vote(c, a); vote(d, b); vote(e, a); vote(f, b);
  while (S.state.finale.stage === 'names') S.dispatch({ type: 'speakName' });
  eq(S.state.finale.stage, 'reveal', 'tied twice: the lot decides');
  ok(S.state.finale.lot, 'and says it was a lot');
});

test('the banished say who they were, and the table carries on to the next day', () => {
  const ctx = fresh();
  const S = ctx.Session;
  S.startParty({ seed: 9, players: roster(8), mode: 'host', rehearsal: true, parts: ['table', 'finale'] });
  eq(S.state.phase, 'table', 'straight to the table');
  const seats = S._peek().seats;
  const faithful = S.alive().find(p => seats.indexOf(p.seat) < 0);
  let told = null;
  S.on('reveal', (e) => { told = e; });
  for (const p of S.alive()) {
    const target = p.id === faithful.id ? S.alive().find(q => q.id !== p.id) : faithful;
    S.dispatch({ type: 'name', playerId: p.id, targetId: target.id });
  }
  while (S.state.finale.stage === 'names') S.dispatch({ type: 'speakName' });
  S.dispatch({ type: 'reveal' });
  eq(told.role, 'faithful');
  eq(S.state.banished[0].role, 'faithful', 'on the record');
  S.dispatch({ type: 'advance' });
  eq([S.state.phase, S.state.day], ['table', 1], 'and on to the next day\'s table');
});

H.report();
