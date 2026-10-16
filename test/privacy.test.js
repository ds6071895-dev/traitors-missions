/* ------------------------------------------------------------------
   privacy.test.js — the one invariant everything else stands on.

   The snapshot is a thing the host puts on a wire and sends to every
   other browser in the room. The rule: `state` never carries a role,
   for anybody, at any phase — except the roles the game has publicly
   disclosed on purpose (a banished or exposed player says what they
   were; the last pouches and the verdict put every card face up).

   The private half — your role, your partner, the poison and who it
   went into, your list of jobs, what you saw, the turret's choice, an
   offered seat — leaves only as `privateView(id)`, addressed to that
   one person. These tests walk whole games of five to eight and look
   at every snapshot and every view along the way.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section } = H;

const FILES = ['js/core/util.js', 'js/core/state.js', 'js/core/chores.js', 'js/core/session.js'];

const NAMES = ['Ana', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal'];
const roster = (n) => NAMES.slice(0, n).map((name, i) => ({ id: name.toLowerCase(), name, local: i === 0 }));

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

/* What the host would put on the wire, minus what the game discloses
   on purpose: the banished, the pouches already burned, the verdict. */
function leaks(ctx) {
  const snap = ctx.Session.snapshot() || {};
  const copy = JSON.parse(JSON.stringify(snap));
  delete copy.banished;
  delete copy.outcome;
  if (copy.finale) { delete copy.finale.burned; delete copy.finale.opened; }
  return /traitor|faithful|poison|carrier|jobs|notes|letter/i.test(JSON.stringify(copy));
}

function openHouse(S) {
  S.setEyes({
    reach: () => 1,
    witnesses: (a, b) => ({ ids: S.alive().map(p => p.id).filter(id => id !== a && id !== b), room: 'hall' }),
    presence: () => Object.fromEntries(S.alive().map(p => [p.id, { room: 'hall', with: S.alive().map(q => q.id).filter(id => id !== p.id) }])),
  });
}

/* A whole game of random legal play, calling `check` after every step
   the host would broadcast. */
function walk(ctx, seed, n, check) {
  const S = ctx.Session;
  const r = ctx.U.makeRng(seed * 31 + 7);
  S.startParty({ seed, players: roster(n), mode: 'host' });
  openHouse(S);
  const pick = (a) => a[r.int(0, a.length - 1)];
  for (let guard = 0; S.state.phase !== 'verdict' && guard < 600; guard++) {
    check('step ' + guard + ' ' + S.state.phase);
    const st = S.state, living = S.alive();
    const peek = S._peek();
    if (st.phase === 'hill') S.dispatch({ type: 'advance', authority: true });
    else if (st.phase === 'tasks') {
      for (const p of living) {
        for (const j of S.privateView(p.id).jobs) {
          if (j.kind === 'station') S.dispatch({ type: 'chore', playerId: p.id, jobId: j.id });
          else S.dispatch({ type: 'handover', playerId: p.id, targetId: j.target });
          check('after a job');
        }
      }
      const faithful = living.filter(p => peek.seats.indexOf(p.seat) < 0);
      if (peek.carrier && r() < 0.8 && faithful.length) {
        S.dispatch({ type: 'poison', playerId: peek.carrier, targetId: pick(faithful).id });
        check('after the poison');
      }
      S.dispatch({ type: 'tasksTick', authority: true });
      check('a look round');
      now = st.chores.endsAt + 50;
      S.dispatch({ type: 'tasksTick', authority: true });
    } else if (st.phase === 'night') {
      const traitors = living.filter(p => peek.seats.indexOf(p.seat) >= 0);
      for (const tr of traitors) {
        S.dispatch({ type: 'turretPick', playerId: tr.id, kind: 'carrier', targetId: traitors[0].id });
        check('after a pick');
      }
      for (let k = 0; k < 6 && S.state.phase === 'night'; k++) {
        now += 40000;
        S.dispatch({ type: 'nightTick', authority: true });
        check('night tick');
      }
    } else if (st.phase === 'breakfast') {
      for (let k = 0; k < 12 && !S.state.breakfast.revealed; k++) {
        S.dispatch({ type: 'breakfastNext', authority: true });
        check('breakfast arrival');
      }
      S.dispatch({ type: 'advance', authority: true });
    } else if (st.phase === 'table' || st.phase === 'finale') {
      const f = st.finale;
      if (st.phase === 'table' && !(st.exposure && st.exposure.checked)) {
        S.dispatch({ type: 'expose', authority: true });
        check('the exposure');
        if (S.state.exposure.playerId) S.dispatch({ type: 'exposeDone', authority: true });
        continue;
      }
      if (f.stage === 'decide') for (const p of living) S.dispatch({ type: 'decide', playerId: p.id, choice: r() < 0.5 ? 'end' : 'banish' });
      else if (f.stage === 'decisions') S.dispatch({ type: 'decisionPouch' });
      else if (f.stage === 'name') {
        for (const p of living) {
          const o = living.filter(q => q.id !== p.id && (!f.tied || f.tied.indexOf(q.id) >= 0));
          if (o.length) S.dispatch({ type: 'name', playerId: p.id, targetId: pick(o).id });
        }
      } else if (f.stage === 'names') S.dispatch({ type: 'speakName' });
      else if (f.stage === 'reveal') S.dispatch({ type: 'reveal' });
      else if (f.stage === 'pouches') S.dispatch({ type: 'pouch' });
      else if (f.stage === 'done') S.dispatch({ type: 'advance', authority: true });
      else break;
    } else break;
  }
}

section('privacy — the word is never in the state');

test('not on the hill, not in the castle, not at night, not at the table, not at the fire', () => {
  let checked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const ctx = fresh();
    walk(ctx, seed, 5 + (seed % 4), (where) => {
      ok(!leaks(ctx), 'leaked: ' + where + ', seed ' + seed);
      checked++;
    });
  }
  ok(checked > 1500, 'looked at a lot of snapshots: ' + checked);
});

test('the poison leaves nothing in the state — not who carried it, not who it went into', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const ctx = fresh();
    const S = ctx.Session;
    walk(ctx, seed, 6 + (seed % 3), () => {
      const s = S.snapshot();
      if (!s) return;
      const pk = S._peek();
      if (pk.poison && s.phase !== 'verdict') {
        const json = JSON.stringify(Object.assign({}, s, { banished: [], murdered: [], outcome: null, players: [] }));
        ok(json.indexOf('"' + pk.poison.target + '"') < 0 || (s.chores && s.chores.done[pk.poison.target] !== undefined),
           'the victim is not singled out in the state');
      }
      if (s.phase === 'breakfast' && s.breakfast && !s.breakfast.revealed) {
        eq(s.breakfast.victim, null, 'nobody is named dead before the last group is in');
        if (pk.victim) ok(s.breakfast.arrived.indexOf(pk.victim) < 0, 'and the dead never arrive');
      }
    });
  }
});

test('an owed exposure is not in the state until it happens', () => {
  for (let seed = 1; seed < 200; seed++) {
    const ctx = fresh();
    const S = ctx.Session;
    S.startParty({ seed, players: roster(6), mode: 'host' });
    openHouse(S);
    S.dispatch({ type: 'advance', authority: true });
    now = S.state.chores.endsAt + 50;
    S.dispatch({ type: 'tasksTick', authority: true });
    ok(S.hasExposure(), 'nobody poisoned anybody: somebody is owed');
    ok(!leaks(ctx), 'the pending exposure leaked into the state');
    eq(S.state.exposure, null, 'and nothing about it is in the state');
    return;
  }
});

section('privacy — what each person is told');

test('a Faithful is told only their own role and jobs; a Traitor also who the Traitors are and the poison', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const ctx = fresh();
    const S = ctx.Session;
    S.startParty({ seed, players: roster(5 + (seed % 4)), mode: 'host' });
    S.dispatch({ type: 'advance', authority: true });
    const seats = S._peek().seats;
    for (const p of S.state.players) {
      const v = S.privateView(p.id);
      const traitor = seats.indexOf(p.seat) >= 0;
      eq(v.role, traitor ? 'traitor' : 'faithful', 'their own role');
      ok(v.jobs.length >= 5, 'their own jobs');
      if (!traitor) {
        eq(v.partners, [], 'a Faithful learns nobody');
        eq(v.night, null, 'nothing of the turret');
        eq(v.poison, null, 'and nothing of the poison');
      } else {
        ok(v.partners.every(id => seats.indexOf(S.playerById(id).seat) >= 0), 'partners are Traitors');
        eq(v.partners.length, seats.length - 1, 'and all of them');
        ok(seats.indexOf(S.playerById(v.poison.carrier).seat) >= 0, 'who carries it');
      }
    }
  }
});

test('your notebook is yours: nobody is told what somebody else saw', () => {
  const ctx = fresh();
  const S = ctx.Session;
  S.startParty({ seed: 5, players: roster(6), mode: 'host' });
  const at = { ana: 'hall', bo: 'hall', cy: 'turret', di: 'turret', ed: 'great', flo: 'great' };
  S.setEyes({ reach: () => 1, witnesses: () => ({ ids: [], room: null }),
              presence: () => Object.fromEntries(S.alive().map(p => [p.id, { room: at[p.id], with: S.alive().filter(q => q.id !== p.id && at[q.id] === at[p.id]).map(q => q.id) }])) });
  S.dispatch({ type: 'advance', authority: true });
  S.dispatch({ type: 'tasksTick', authority: true });
  eq(S.privateView('ana').notes.map(n => n.room), ['hall']);
  eq(S.privateView('cy').notes.map(n => n.ids), [['di']]);
  ok(JSON.stringify(S.privateView('ana').notes).indexOf('turret') < 0, 'Ana saw nothing of the turret');
});

test('a role only leaves as an event, never as state', () => {
  const ctx = fresh();
  const S = ctx.Session;
  const escaped = [];
  S.on('reveal', (r) => escaped.push(r.role));
  walk(ctx, 77, 6, () => {});
  ok(escaped.length >= 2, 'banishments and pouches disclosed, as events: ' + escaped.length);
  eq(S.state.phase, 'verdict', 'and only then is the game over');
});

test('the verdict is the one place every role is meant to be face up', () => {
  const ctx = fresh();
  walk(ctx, 78, 7, () => {});
  eq(ctx.Session.state.outcome.roles.length, 7, 'all seven cards are up');
  ok(ctx.Session.state.outcome.roles.every(r => r.role === 'traitor' || r.role === 'faithful'), 'each says what it was');
});

test('privateRoles is host-only and addressed one person at a time', () => {
  const ctx = fresh();
  ctx.Session.startParty({ seed: 90, players: roster(8), mode: 'guest' });
  eq(ctx.Session.privateRoles(), [], 'a guest can tell nobody anything');
  eq(ctx.Session.privateView('ana'), null, 'nor build anybody a view');
  ctx.Session.startParty({ seed: 90, players: roster(8), mode: 'host' });
  const roles = ctx.Session.privateRoles();
  eq(roles.length, 8, 'one entry per player');
  ok(roles.every(r => r.playerId && r.role), 'each names exactly one person');
  eq(roles.filter(r => r.role === 'traitor').length, 2, 'two at eight');
});

if (require.main === module) H.report();
