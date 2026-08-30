/* ------------------------------------------------------------------
   session.js — the authority for a PLAY run.

   This is written as if a server already owned it, because one shortly
   will. Three rules make that true, and all three are load-bearing:

   1. Every change goes through `dispatch(action)`, and an action is a
      plain serialisable object. Nothing else may touch `state`.
   2. `state` is plain JSON. It is what a server would send you, so it
      is also what survives a refresh.
   3. The role table lives in this closure and is *never* in `state`.
      A client is told its own role and nothing else; the fire is an
      event the authority emits, not a lookup the UI does.

   Randomness is never held as a live generator, because a live
   generator cannot survive a reload. Everything random is a pure
   function of (seed, purpose) via `rngFor()`, so resuming a saved run
   deals exactly the hand it dealt before.

   The run:
     hill -> mission 0 -> round table -> mission 1 -> finale -> verdict

   The roles, drawn once from the seed:
     50% the run has no traitor at all;
     otherwise exactly one, uniform over all three players — you too.
   You are told your own role. Nobody is ever told whether a traitor
   exists.
------------------------------------------------------------------ */
const Session = (() => {

  const KEY = 'traitors.session.v2';
  const V = 2;
  const SEATS = 3;                 // you + two, for now

  let state = null;

  /* The one thing that must never be serialised. `seat` is which chair
     the traitor is in, or -1 for a run that simply has no traitor. */
  let secret = { has: false, seat: -1 };

  const listeners = {
    change: new Set(),   // (state) — anything at all moved
    phase:  new Set(),   // (phase, prev)
    beat:   new Set(),   // (n)
    vote:   new Set(),   // ({ playerId, stage, choice|targetId })
    decision:new Set(),  // ({ playerId, choice }) — a decision pouch has burned
    nameReveal:new Set(),// ({ playerId, targetId }) — a name has been said aloud
    tally:  new Set(),   // ({ stage, result, counts })
    reveal: new Set(),   // ({ playerId, role }) — the only role that escapes
    outcome:new Set(),   // (outcome)
  };

  function on(evt, fn) {
    if (!listeners[evt]) return () => {};
    listeners[evt].add(fn);
    return () => listeners[evt].delete(fn);
  }
  function emit(evt, a, b) { listeners[evt].forEach(fn => { try { fn(a, b); } catch (e) { console.warn(e); } }); }

  /* ---------------- deterministic draws ----------------
     One generator per purpose, derived from the seed alone, so nothing
     here depends on how many times anything has been called. */

  function rngFor(salt, seed) {
    const s = seed === undefined ? (state ? state.seed : 0) : seed;
    return U.makeRng((((s ^ salt) >>> 0) || 1));
  }

  const SALT = {
    roles:    0x5f3759df,
    cast:     0x2545f491,
    missions: 0x9e3779b9,
    tie:      0x85ebca6b,
  };

  function drawRoles(seed) {
    const r = rngFor(SALT.roles, seed);
    const has = r() < 0.5;                      // half of all runs are clean
    return { has, seat: has ? r.int(0, SEATS - 1) : -1 };
  }

  const roleOfSeat = (seat) => (secret.seat === seat ? 'traitor' : 'faithful');

  /* ---------------- the run plan ----------------
     Generic on purpose: any mission that registers with a `create` and
     a setup deck joins the rotation without this file learning its name.
     The twist is drawn from the mission's *own* hand — the same three
     cards the briefing screen would have offered you, except tonight
     you do not get to choose. */

  function planMissions(seed) {
    const r = rngFor(SALT.missions, seed);
    const pool = (typeof Missions !== 'undefined' ? Missions.all() : [])
      .filter(m => !m.locked && typeof m.create === 'function');
    const bag = pool.slice();
    const out = [];

    for (let i = 0; i < 2; i++) {
      if (!bag.length) bag.push(...pool);       // fewer than two exist: repeat
      if (!bag.length) break;
      const def = bag.splice(Math.floor(r() * bag.length), 1)[0];
      const missionSeed = r.int(1, 0x7ffffff) >>> 0;
      const mode = def.modes ? Object.keys(def.modes)[0] : null;

      let modId = null, modName = null, modBlurb = null, payout = 1;
      if (def.setup && typeof def.preview === 'function') {
        try {
          const p = def.preview({ seed: missionSeed, mode, tod: 'auto', modId: null, ghost: false });
          const hand = (p && p.hand) || [];
          if (hand.length) {
            const card = hand[Math.floor(r() * hand.length)];
            modId = card.id; modName = card.name; modBlurb = card.blurb;
            payout = card.payout || 1;
          }
        } catch (e) { /* a mission that cannot preview simply gets no twist */ }
      }

      out.push({ id: def.id, name: def.name, seed: missionSeed, mode,
                 modId, modName, modBlurb, payout,
                 earned: null, completed: null, done: false });
    }
    return out;
  }

  function castNames(seed) {
    const r = rngFor(SALT.cast, seed);
    const pool = ((GameState.data && GameState.data.cast) || [])
      .map(c => c.name).filter(Boolean);
    const fallback = ['Bex', 'Dev', 'Alina', 'Fitz', 'Greta', 'Luca'];
    const bag = (pool.length >= SEATS - 1 ? pool : fallback).slice();
    const out = [];
    for (let i = 0; i < SEATS - 1 && bag.length; i++) {
      out.push(bag.splice(Math.floor(r() * bag.length), 1)[0]);
    }
    return out;
  }

  /* ---------------- lifecycle ---------------- */

  function fresh(seed) {
    const names = castNames(seed);
    const players = [{ id: 'you', seat: 0, name: 'You', local: true, bot: false, alive: true }];
    for (let i = 1; i < SEATS; i++) {
      players.push({ id: 'p' + i, seat: i, name: names[i - 1] || ('Player ' + i),
                     local: false, bot: true, alive: true });
    }
    return {
      v: V,
      seed,
      startedAt: Date.now(),
      phase: 'hill',            // hill | mission | table | finale | verdict
      beat: 0,                  // shared scene beat, for when scenes sync
      missionAt: 0,
      players,
      missions: planMissions(seed),
      pot: 0,
      said: [],                 // round-table lines, in order
      finale: newFinale(),
      outcome: null,
    };
  }

  /* `stage` runs decide -> decisions -> name -> names -> reveal round
     after round. The plural stages perform a completed ballot one
     person at a time. Once the game stops, `pouches` walks the surviving
     role pouches in turn; `reason` holds the verdict until the last one
     has burned. */
  const newFinale = () => ({ round: 0, stage: 'decide', votes: {}, names: {},
                             decisionQueue: [], decisionsShown: [],
                             nameQueue: [], namesShown: [], nameRound: 0,
                             pending: null, burned: [], lastTally: null,
                             queue: [], opened: [], reason: null });

  function start(seed) {
    const s = Number.isFinite(seed) ? (Math.floor(seed) >>> 0) || U.randomSeed() : U.randomSeed();
    secret = drawRoles(s);
    state = fresh(s);
    syncGameState();
    save();
    emit('phase', state.phase, null);
    emit('change', state);
    return state;
  }

  function resume() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== V || !parsed.state) return null;
      state = parsed.state;
      // roles are a pure function of the seed, so they are not saved and
      // cannot drift: a resumed run is the same run
      secret = drawRoles(state.seed);
      if (!state.finale) state.finale = newFinale();
      syncGameState();
      emit('phase', state.phase, null);
      emit('change', state);
      return state;
    } catch (e) { return null; }
  }

  function saved() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || p.v !== V || !p.state || p.state.phase === 'verdict') return null;
      return { seed: p.state.seed, phase: p.state.phase, pot: p.state.pot,
               startedAt: p.state.startedAt };
    } catch (e) { return null; }
  }

  function save() {
    if (!state) return;
    try { localStorage.setItem(KEY, JSON.stringify({ v: V, state })); } catch (e) {}
  }

  function abandon() {
    state = null;
    secret = { has: false, seat: -1 };
    try { localStorage.removeItem(KEY); } catch (e) {}
    GameState.data.phase = 'lobby';
    GameState.save();
    emit('change', null);
  }

  // keep the long-standing save model in step, so the recap log reads right
  function syncGameState() {
    if (!state) return;
    const map = { hill: 'lobby', mission: 'mission', table: 'roundtable',
                  finale: 'endgame', verdict: 'endgame' };
    GameState.data.phase = map[state.phase] || 'lobby';
    GameState.data.round = state.missionAt + 1;
    GameState.save();
  }

  /* ---------------- what a client is allowed to know ---------------- */

  const localPlayer = () => (state ? state.players.find(p => p.local) : null);

  function myRole() {
    const me = localPlayer();
    return me ? roleOfSeat(me.seat) : null;
  }

  const alive = () => (state ? state.players.filter(p => p.alive) : []);
  const playerById = (id) => (state ? state.players.find(p => p.id === id) : null);

  /* ---------------- the reducer ----------------
     The only mutator. Everything a scene wants to do arrives here as an
     action, which is exactly what will go down the wire. */

  function dispatch(action) {
    if (!state || !action) return null;
    let moved = false;
    switch (action.type) {
      case 'beat':    moved = doBeat(action); break;
      case 'advance': moved = doAdvance(); break;
      case 'say':     moved = doSay(action); break;
      case 'result':  moved = doResult(action); break;
      case 'vote':    moved = doVote(action); break;
      case 'decisionPouch': moved = doDecisionPouch(action); break;
      case 'name':    moved = doName(action); break;
      case 'speakName': moved = doSpeakName(action); break;
      case 'reveal':  moved = doReveal(); break;
      case 'pouch':   moved = doPouch(); break;
      default: return null;
    }
    if (moved) { save(); emit('change', state); }
    return state;
  }

  function setPhase(next) {
    const prev = state.phase;
    if (prev === next) return;
    state.phase = next;
    state.beat = 0;
    syncGameState();
    emit('phase', next, prev);
  }

  function doBeat(a) {
    const n = Math.max(0, a.n | 0);
    if (n === state.beat) return false;
    state.beat = n;
    emit('beat', n);
    return true;
  }

  // the scenes that are pure theatre end by asking for the next phase
  function doAdvance() {
    if (state.phase === 'hill') { setPhase('mission'); state.missionAt = 0; return true; }
    if (state.phase === 'table') { setPhase('mission'); state.missionAt = 1; return true; }
    return false;
  }

  function doSay(a) {
    if (state.phase !== 'table') return false;
    if (!a.lineId || !playerById(a.playerId)) return false;
    state.said.push({ playerId: a.playerId, lineId: a.lineId, text: a.text || null });
    if (state.said.length > 60) state.said.shift();
    return true;
  }

  /* A mission has finished. In real multiplayer this arrives from the
     server, not from the winner's browser — which is why the pot is
     added here rather than by whoever happened to be playing. */
  function doResult(a) {
    if (state.phase !== 'mission') return false;
    const m = state.missions[state.missionAt];
    if (!m || m.done) return false;
    m.earned = Math.max(0, Math.round(a.earned || 0));
    m.completed = !!a.completed;
    m.done = true;
    state.pot = Math.max(0, state.pot + m.earned);
    GameState.logEvent('mission', `${m.name}: ${U.money(m.earned)} into the pot`, { id: m.id });
    if (state.missionAt === 0) setPhase('table');
    else { state.finale = newFinale(); setPhase('finale'); }
    return true;
  }

  /* ---------------- the finale ----------------
     Two ballots per round: whether to banish at all, and then who. The
     authority collects a whole ballot before revealing it. Decision
     pouches burn one by one (all end-game pouches first), and names are
     then spoken one by one, so neither result can jump straight from a
     button press to a tally. */

  function doVote(a) {
    const f = state.finale;
    if (state.phase !== 'finale' || f.stage !== 'decide') return false;
    const p = playerById(a.playerId);
    if (!p || !p.alive) return false;
    if (a.choice !== 'end' && a.choice !== 'banish') return false;
    if (f.votes[p.id] === a.choice) return false;
    f.votes[p.id] = a.choice;
    emit('vote', { playerId: p.id, stage: 'decide', choice: a.choice });
    if (alive().every(q => f.votes[q.id])) beginDecisionReveal();
    return true;
  }

  function beginDecisionReveal() {
    const f = state.finale;
    const living = alive().slice().sort((a, b) => {
      const ac = f.votes[a.id] === 'end' ? 0 : 1;
      const bc = f.votes[b.id] === 'end' ? 0 : 1;
      return ac - bc || a.seat - b.seat;
    });
    f.stage = 'decisions';
    f.decisionQueue = living.map(p => p.id);
    f.decisionsShown = [];
  }

  function doDecisionPouch(a) {
    const f = state.finale;
    if (state.phase !== 'finale' || f.stage !== 'decisions' || !f.decisionQueue.length) return false;
    const playerId = f.decisionQueue[0];
    if (a.playerId && a.playerId !== playerId) return false;
    const p = playerById(playerId);
    if (!p || !p.alive) return false;
    const choice = f.votes[playerId];
    if (choice !== 'end' && choice !== 'banish') return false;
    f.decisionQueue.shift();
    f.decisionsShown.push({ playerId, choice });
    emit('decision', { playerId, choice, last: f.decisionQueue.length === 0 });
    if (!f.decisionQueue.length) resolveDecide();
    return true;
  }

  function resolveDecide() {
    const f = state.finale;
    const living = alive();
    let end = 0, banish = 0;
    for (const p of living) (f.votes[p.id] === 'end' ? end++ : banish++);
    // a tie is only reachable at two players; Claudia breaks it, seeded
    // The Fire of Truth is unanimous: one red pouch is enough to force
    // another banishment. This is not a majority ballot.
    const result = end === living.length ? 'end' : 'banish';
    f.lastTally = { stage: 'decide', result, counts: { end, banish }, tied: false };
    emit('tally', f.lastTally);
    if (result === 'end') openPouches('ended-by-vote');
    else {
      f.stage = 'name'; f.names = {}; f.nameQueue = []; f.namesShown = [];
      f.nameRound = 0;
    }
  }

  function doName(a) {
    const f = state.finale;
    if (state.phase !== 'finale' || f.stage !== 'name') return false;
    const p = playerById(a.playerId);
    const t = playerById(a.targetId);
    if (!p || !p.alive || !t || !t.alive) return false;
    if (t.id === p.id) return false;                  // nobody names themselves
    if (f.names[p.id] === t.id) return false;
    f.names[p.id] = t.id;
    emit('vote', { playerId: p.id, stage: 'name', targetId: t.id });
    if (alive().every(q => f.names[q.id])) beginNameReveal();
    return true;
  }

  function beginNameReveal() {
    const f = state.finale;
    f.stage = 'names';
    f.nameQueue = alive().slice().sort((a, b) => a.seat - b.seat).map(p => p.id);
    f.namesShown = [];
  }

  function doSpeakName(a) {
    const f = state.finale;
    if (state.phase !== 'finale' || f.stage !== 'names' || !f.nameQueue.length) return false;
    const playerId = f.nameQueue[0];
    if (a.playerId && a.playerId !== playerId) return false;
    const targetId = f.names[playerId];
    const p = playerById(playerId);
    const t = playerById(targetId);
    if (!p || !p.alive || !t || !t.alive) return false;
    f.nameQueue.shift();
    f.namesShown.push({ playerId, targetId });
    emit('nameReveal', { playerId, targetId, last: f.nameQueue.length === 0 });
    if (!f.nameQueue.length) resolveName();
    return true;
  }

  function resolveName() {
    const f = state.finale;
    const counts = {};
    for (const p of alive()) {
      const t = f.names[p.id];
      counts[t] = (counts[t] || 0) + 1;
    }
    let top = -1;
    for (const id in counts) top = Math.max(top, counts[id]);
    const tied = Object.keys(counts).filter(id => counts[id] === top).sort();
    const pick = tied.length === 1 ? tied[0] : null;
    f.lastTally = { stage: 'name', result: pick, counts, tied: tied.length > 1 };
    emit('tally', f.lastTally);
    // A tied banishment is voted again; Claudia never chooses a random
    // contestant to break it.
    if (!pick) {
      f.stage = 'name';
      f.names = {};
      f.nameQueue = [];
      f.namesShown = [];
      f.nameRound = (f.nameRound || 0) + 1;
      return;
    }
    f.pending = pick;
    f.stage = 'reveal';
  }

  /* ---------------- the last pouches ----------------
     Ending the game does not end it. Everybody still sitting there has
     a pouch, and they go in the fire one at a time before anybody is
     told who won — which is the only order the night can be told in,
     because the answer *is* what is in them.

     Nobody is banished by this. It discloses and nothing else: the
     verdict it was called with is held until the last one has burned,
     so `endGame` still sees exactly the circle that voted. Yours goes
     last, so the night always finishes on the pouch that settles it. */

  function openPouches(reason) {
    const f = state.finale;
    const living = alive();
    // Final identities are revealed Faithful-first. A surviving Traitor,
    // if there is one, is held until last for the decisive reveal.
    const order = living.slice().sort((a, b) => {
      const ar = roleOfSeat(a.seat) === 'traitor' ? 1 : 0;
      const br = roleOfSeat(b.seat) === 'traitor' ? 1 : 0;
      return ar - br || Number(a.local) - Number(b.local) || a.seat - b.seat;
    });
    f.stage = 'pouches';
    f.reason = reason;
    f.queue = order.map(p => p.id);
    f.opened = [];
    f.pending = f.queue[0] || null;
    if (!f.pending) { endGame(reason); return; }
    emit('tally', { stage: 'pouches', result: reason, counts: {}, tied: false });
  }

  function doPouch() {
    const f = state.finale;
    if (state.phase !== 'finale' || f.stage !== 'pouches' || !f.pending) return false;
    const p = playerById(f.pending);
    if (!p) return false;
    const role = roleOfSeat(p.seat);
    const rest = f.queue.filter(id => id !== p.id);
    const last = rest.length === 0;

    f.opened.push({ id: p.id, name: p.name, role });
    f.queue = rest;
    f.pending = rest[0] || null;
    GameState.logEvent('pouch', `${p.name} was a ${role}`, { id: p.id, role });
    emit('reveal', { playerId: p.id, name: p.name, role, final: true, last,
                     index: f.opened.length, of: f.opened.length + rest.length });

    if (last) endGame(f.reason || 'ended-by-vote');
    return true;
  }

  /* The pouch goes in the fire. This is the only place a role other
     than your own is ever disclosed, and it leaves as an event. */
  function doReveal() {
    const f = state.finale;
    if (state.phase !== 'finale' || f.stage !== 'reveal' || !f.pending) return false;
    const p = playerById(f.pending);
    if (!p) return false;
    const role = roleOfSeat(p.seat);

    p.alive = false;
    f.burned.push({ id: p.id, name: p.name, role });
    f.pending = null;
    GameState.logEvent('banish', `${p.name} was a ${role}`, { id: p.id, role });
    emit('reveal', { playerId: p.id, name: p.name, role });

    /* The End Game stops automatically at two contestants. Finding a
       Traitor does not otherwise stop it, and a banished local player
       still watches the final pair reveal before the verdict. */
    if (alive().length <= 2) {
      openPouches(p.local ? 'you-burned' : 'final-two');
      return true;
    }

    f.round++;
    f.stage = 'decide';
    f.votes = {};
    f.names = {};
    f.decisionQueue = [];
    f.decisionsShown = [];
    f.nameQueue = [];
    f.namesShown = [];
    f.nameRound = 0;
    return true;
  }

  /* ---------------- the verdict ---------------- */

  function endGame(reason) {
    const living = alive();
    const survivingTraitors = living.filter(p => roleOfSeat(p.seat) === 'traitor');
    const traitorAlive = survivingTraitors.length > 0;
    const me = localPlayer();
    const role = me ? roleOfSeat(me.seat) : 'faithful';

    // Surviving Traitors take the pot. With none left, only the Faithfuls
    // still standing share it; every banished contestant receives zero.
    const winners = traitorAlive ? survivingTraitors : living;
    const winnerIds = new Set(winners.map(p => p.id));
    const payoutById = new Map();
    if (winners.length) {
      const share = Math.floor(state.pot / winners.length);
      let remainder = state.pot - share * winners.length;
      winners.slice().sort((a, b) => a.seat - b.seat).forEach(p => {
        payoutById.set(p.id, share + (remainder-- > 0 ? 1 : 0));
      });
    }
    const won = !!(me && winnerIds.has(me.id));
    const banked = me ? (payoutById.get(me.id) || 0) : 0;
    if (banked > 0) GameState.addToPot(banked);

    state.outcome = {
      won, reason, role, traitorAlive,
      hadTraitor: secret.has,
      pot: state.pot,
      banked,
      // the game is over: everyone's cards go face up
      roles: state.players.map(p => ({ id: p.id, name: p.name, seat: p.seat,
                                       role: roleOfSeat(p.seat), alive: p.alive,
                                       winner: winnerIds.has(p.id),
                                       payout: payoutById.get(p.id) || 0 })),
    };
    state.finale.stage = 'over';
    GameState.logEvent('verdict', won ? 'Won the pot' : 'Lost the pot',
                       { reason, role, banked });
    setPhase('verdict');
    emit('outcome', state.outcome);
  }

  return {
    start, resume, saved, save, abandon, dispatch, on,
    myRole, alive, playerById,
    get state() { return state; },
    get active() { return !!state && state.phase !== 'verdict'; },
    get running() { return !!state; },
    // a serialised copy, which is exactly what a server would have sent
    snapshot() { return state ? JSON.parse(JSON.stringify(state)) : null; },

    /* The bots' own roles. This exists only because the other two
       clients happen to live in this process: each of them is entitled
       to know what it is, exactly as you are entitled to know what you
       are. It refuses on the local player so nothing can launder your
       own hidden information through it, and it leaves with bots.js the
       day those two clients are real people. */
    _clientRole(playerId) {
      const p = playerById(playerId);
      if (!p || !p.bot) return null;
      return roleOfSeat(p.seat);
    },
    /* Test seam. Fast-forwards a fresh run to a later phase with the
       missions marked as played and the pot filled in, so the fire can
       be worked on without driving a boat twice to get to it. It goes
       through `setPhase` like everything else, so what it produces is a
       state the rest of the game cannot tell from an earned one. */
    jumpTo(phase) {
      if (!state) return null;
      if (phase === 'finale') {
        state.missions.forEach((m, i) => {
          if (m.done) return;
          m.earned = 4500 + i * 3500;
          m.completed = true;
          m.done = true;
          state.pot += m.earned;
        });
        state.missionAt = Math.max(0, state.missions.length - 1);
        state.finale = newFinale();
        setPhase('finale');
        save();
        emit('change', state);
      }
      return state;
    },

    // test seam only: never call this from the game
    _peek() { return { has: secret.has, seat: secret.seat }; },
  };
})();
