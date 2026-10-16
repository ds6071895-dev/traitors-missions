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

   The run is the shape of the programme, with one change that makes it
   a game rather than a menu: the murder happens in daylight.

     hill
       -> [ tasks -> round table -> night -> breakfast ] x days
       -> the Fire of Truth -> verdict

   TASKS is a few minutes loose in the castle. Everybody has a list of
   little jobs that pay into the pot, scattered round the house. One
   Traitor carries the poison, and has until the bell to slip it to a
   Faithful — standing right next to them, holding still for a couple of
   seconds, where anybody looking can see one person hand another
   something. Faithfuls hand each other letters the same way, so what a
   witness saw is a lead and not a verdict. A carrier who never uses it
   is exposed at the round table and goes out on the spot.

   The poison is the only murder there is. It takes in the night, and
   breakfast finds out who. Days repeat until the table is small enough
   for the fire.

   There are two kinds of client now and only one of them is in charge.
   A host owns this reducer outright: it draws the roles, it holds the
   clock, and it is the only place `dispatch` does anything. A guest
   runs the same file in `guest` mode, where `dispatch` is inert and
   `state` is a mirror installed by `adopt()` from whatever the host
   last sent. Scenes cannot tell the difference, which is the point —
   they read `state`, they call `Net.send`, and that is all they ever
   did.

   The roles, drawn once from the seed: one Traitor at five or six, two
   at seven or eight. You are told your own role and nobody else's. A
   Traitor is also told who the other Traitor is. Everything private —
   the role, the partner, the poison, your list of jobs, what you have
   seen with your own eyes, a recruit's offer — leaves this file as a
   per-player `privateView()` that the transport addresses to that one
   person, never as part of `state`.

   Geometry is not this file's business. Who is standing next to whom,
   and who can see it, is answered by `eyes` — a hook the host's castle
   scene installs (`setEyes`) — so the rules stay plain JSON and a test
   can hand them a table of positions.
------------------------------------------------------------------ */
const Session = (() => {

  const V = 5;
  const SEATS = 8;                 // the most the castle seats
  const MIN_PLAYERS = 5;           // the fewest the show is written for
  const FINALE_AT = 4;             // four or fewer alive after breakfast: the fire
  const MAX_DAYS = 8;              // a guard, never a plan: the table count decides
  const FLOOR_SECONDS = 30;        // one turn, when the floor goes round
  const LAST_WORDS_SECONDS = 12;   // the banished, before their pouch
  const TASK_SECONDS = 180;        // the day loose in the castle
  const BELL_AT = 30;              // seconds left when the bell goes
  const NOTE_EVERY = 4;            // seconds between looks round the room
  const NIGHT_SECONDS = 20;        // every night lasts exactly this, whatever was decided
  const PICK_SECONDS = 12;         // the Traitors have this long (from lights out) to agree
  const RECRUIT_SECONDS = 7;       // an offer is answered or refused
  const tableSeconds = (n) => Math.min(240, 50 + 22 * n);

  let state = null;
  let mode = 'host';               // 'host' owns the reducer, 'guest' mirrors it
  let rehearsal = false;           // a bot night, and the only thing that may
                                   // choose the roles or skip parts of the show
  let told = null;                 // what a guest was privately told: its view
  let floorTimer = null;
  let nightTimer = null;
  let taskTimer = null;
  let eyes = null;                 // { reach(a, b), witnesses(a, b), presence() }

  /* The one thing that must never be serialised. */
  let secret = blankSecret();

  function blankSecret() {
    return {
      traitors: new Set(),         // seats
      carrier: null,               // playerId holding today's poison
      poison: null,                // { by, target, at } once it is used
      owed: null,                  // a carrier who never used it: exposed at the table
      exposedShown: null,
      lists: new Map(),            // playerId -> today's jobs
      notes: new Map(),            // playerId -> what they have seen, today and before
      lastLook: new Map(),         // playerId -> the last presence note's key
      picks: {},                   // traitorId -> { kind: 'carrier'|'recruit'|'none', targetId }
      offer: null,                 // { targetId, endsAt, answer }
      victim: null,                // dies tonight, found at breakfast
      spared: false,               // the poisoned were banished before it could take
      recruited: null,             // playerId turned tonight
      resolvedAt: 0,
      pickBy: 0,                   // when the clock decides for the Traitors
      queue: [],                   // breakfast arrival groups, still to come
      fate: {},                    // playerId -> 'murdered' (told before breakfast)
    };
  }

  const listeners = {
    change: new Set(),   // (state) — anything at all moved
    phase:  new Set(),   // (phase, prev)
    beat:   new Set(),   // (n)
    vote:   new Set(),   // ({ playerId, stage, choice|targetId })
    decision:new Set(),  // ({ playerId, choice }) — a decision pouch has burned
    nameReveal:new Set(),// ({ playerId, targetId }) — a name has been said aloud
    tally:  new Set(),   // ({ stage, result, counts })
    reveal: new Set(),   // ({ playerId, role }) — the only role that escapes
    floor:  new Set(),   // ({ playerId, endsAt, seconds, done }) — who may speak
    scene:  new Set(),   // ({ phase }) — every client has built the new room
    sync:   new Set(),   // ({ key }) — every client reached a public scene barrier
    expose: new Set(),   // ({ playerId, role }) — the poison was never used
    chore:  new Set(),   // ({ playerId, pot }) — a job is done and paid
    bell:   new Set(),   // ({ left }) — the day is nearly over
    night:  new Set(),   // ({ done }) — the night has been decided
    arrive: new Set(),   // ({ ids }) — a group has come down to breakfast
    murder: new Set(),   // ({ playerId|null, name }) — who never came down
    private:new Set(),   // () — something only one person may know has moved
    cue:    new Set(),   // ({ set, vars, text }) — Claudia says this, everywhere, now
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
    chores:   0x9e3779b9,
    tie:      0x85ebca6b,
    carrier:  0xc2b2ae35,
    night:    0x27d4eb2f,
    breakfast:0x165667b1,
  };

  const traitorCount = (n) => (n >= 7 ? 2 : 1);

  /* `force` is the rehearsal door and nothing else uses it: a seat
     number (or a list of them) puts the Traitors in those chairs, and
     -1 deals a night with no Traitor in it at all. Left undefined —
     which is every real run — the hand is dealt from the seed. */
  function drawRoles(seed, n, force) {
    if (force !== undefined && force !== null) {
      const want = (Array.isArray(force) ? force : [force]).map(Math.floor);
      return new Set(want.filter(s => s >= 0 && s < n));
    }
    const r = rngFor(SALT.roles, seed);
    const seats = [];
    for (let i = 0; i < n; i++) seats.push(i);
    const out = new Set();
    const k = Math.min(traitorCount(n), Math.max(1, n - 1));
    while (out.size < k) out.add(seats.splice(r.int(0, seats.length - 1), 1)[0]);
    return out;
  }

  const roleOfSeat = (seat) => (secret.traitors.has(seat) ? 'traitor' : 'faithful');
  const isTraitor = (p) => !!p && secret.traitors.has(p.seat);

  /* ---------------- the running order ----------------
     Five parts, and a night is a selection of them. Real nights play
     all of them; a rehearsal may switch any off. Switched-off tasks
     still pay something into the pot, because the fire divides one; a
     switched-off night murders nobody and a switched-off table banishes
     nobody. */
  const PARTS = ['intro', 'tasks', 'table', 'night', 'finale'];
  const partOn = (id) => !state || !state.parts || state.parts.indexOf(id) >= 0;
  const bigNight = () => !!state && state.players.length >= MIN_PLAYERS;

  /* ---------------- the jobs, and the poison ---------------- */

  function dealChores(day) {
    secret.lists = new Map();
    if (typeof Chores === 'undefined') return;
    const r = rngFor(SALT.chores ^ (day * 0x9e37), state.seed);
    for (const p of alive()) {
      const others = alive().filter(q => q.id !== p.id);
      secret.lists.set(p.id, Chores.deal(r, p, others));
    }
  }

  /* Who carries it. On the first day the seed decides; after that the
     turret does (`picks`), and a carrier who is no longer there hands it
     to whichever Traitor is. */
  function chooseCarrier(day) {
    const living = traitorsAlive().sort((a, b) => a.seat - b.seat);
    if (!living.length) { secret.carrier = null; return; }
    if (secret.carrier && living.some(p => p.id === secret.carrier)) return;
    const r = rngFor(SALT.carrier ^ (day * 0x3d), state.seed);
    secret.carrier = living[r.int(0, living.length - 1)].id;
  }

  /* ---------------- lifecycle ---------------- */

  function fresh(seed, roster, parts, opts) {
    const players = (roster || []).slice(0, SEATS).map((p, i) => {
      const out = {
        id: p.id,
        seat: i,
        name: String(p.name || ('Player ' + (i + 1))).slice(0, 16),
        look: p.look || null,     // how they dressed, so everyone draws them the same
        local: !!p.local,
        alive: true,
        out: null,                // how they left: murdered | banished | exposed | left
      };
      if (p.bot) { out.bot = true; if (p.voice) out.voice = String(p.voice).slice(0, 40); }
      return out;
    });
    return {
      v: V,
      seed,
      startedAt: Date.now(),
      phase: 'hill',            // hill | tasks | table | night | breakfast | finale | verdict
      parts: parts && parts.length ? parts.slice() : PARTS.slice(),
      ai: opts && opts.ai ? { claudia: !!opts.ai.claudia } : null,
      dealt: players.length ? Math.min(traitorCount(players.length), players.length - 1) : 0,  // how many were dealt, which the room is told
      beat: 0,                  // shared scene beat, for when scenes sync
      day: 0,
      players,
      pot: 0,
      chores: null,             // { day, startedAt, endsAt, seconds, bell, done: { id: n }, closed }
      floor: null,              // { all, queue, playerId, ready, endsAt, seconds, done }
      scene: { phase: 'hill', ready: [], started: false },
      syncReady: {},            // barrier key -> player ids that have arrived
      syncPassed: [],           // public scene barriers already released
      exposure: null,           // the public answer once Claudia has asked
      night: null,              // { day, done, startedAt }
      breakfast: null,          // { day, arrived, revealed, victim }
      murdered: [],             // [{ id, name, day }]
      banished: [],             // [{ id, name, day, role }] — public once burned
      finale: newBallot('fire'),
      outcome: null,
    };
  }

  /* The ballot in progress, at the round table or at the fire. It is
     still called `finale` on the wire because that is what every client
     has always read; `kind` says which room it belongs to.

     `stage` runs, at the fire: decide -> decisions -> name -> names ->
     reveal, round after round; at the table it starts at `name`. The
     plural stages perform a completed ballot one person at a time. Once
     the game stops, `pouches` walks the surviving role pouches in turn;
     `reason` holds the verdict until the last one has burned. */
  const newBallot = (kind) => ({ kind, round: 0, stage: kind === 'fire' ? 'decide' : 'name',
                                 votes: {}, decisionQueue: [], decisionsShown: [],
                                 names: {}, nameQueue: [], namesShown: [], nameRound: 0,
                                 tied: null, lot: false,
                                 pending: null, burned: [], lastTally: null,
                                 queue: [], opened: [], reason: null });

  /* A night starts from a party, not from nothing. The host draws the
     roles; a guest draws nothing and is told its own by the only client
     entitled to say. Nothing here is written to disk: a run is people
     being in the same place at the same time, and there is nothing on
     this machine that can bring that back. */

  function startParty(opts = {}) {
    const seed = Number.isFinite(opts.seed)
      ? (Math.floor(opts.seed) >>> 0) || U.randomSeed() : U.randomSeed();
    mode = opts.mode === 'guest' ? 'guest' : 'host';
    told = null;
    claimedOutcome = null;
    clearFloorTimer();
    clearNightTimer();
    clearTaskTimer();
    /* Both of the rehearsal levers are gated on the same flag, and the
       flag is only ever set by `Bots`. A night with real people in it
       deals its own hand and plays its whole running order. */
    rehearsal = !!opts.rehearsal;
    const forced = rehearsal ? opts.traitorSeat : undefined;
    const parts = rehearsal ? normaliseParts(opts.parts) : null;
    state = fresh(seed, opts.players || [], parts, opts);
    secret = blankSecret();
    if (mode === 'host') {
      secret.traitors = drawRoles(seed, state.players.length, forced);
      state.dealt = secret.traitors.size;
      chooseCarrier(0);
    }
    /* A night that is not playing its welcome starts wherever it does
       start. This runs before anybody is listening — `Show` reads the
       phase off the state rather than waiting to be told about it — so
       the emits it makes on the way go nowhere, which is correct. */
    if (mode === 'host' && !partOn('intro')) beginDay(0);
    syncGameState();
    emit('phase', state.phase, null);
    emit('change', state);
    return state;
  }

  /* Older rehearsal links named the day's part `mission`. */
  function normaliseParts(parts) {
    if (!Array.isArray(parts) || !parts.length) return null;
    const out = [];
    for (const p of parts) {
      const id = p === 'm1' || p === 'mission' ? 'tasks' : p;
      if (PARTS.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id);
    }
    return out.length ? PARTS.filter(p => out.indexOf(p) >= 0) : null;
  }

  /* ---------------- the guest's mirror ----------------
     Installed, not reduced. It emits nothing: on a guest the events
     that drive the scenes arrive from the host over `Net`, and firing
     a second set from here would run every transition twice. */

  function adopt(next, playerId) {
    if (!next) return null;
    /* `local` is a point of view, not shared state. The authority's
       snapshot naturally marks the authority as local; installing that
       marker unchanged made every guest vote, camera and "you" line act
       as though it belonged to the host. Keep the id we were launched
       with, or take the transport's explicit peer id on a reconnect. */
    const mine = playerId || (state && state.players
      && (state.players.find(p => p.local) || {}).id) || null;
    if (Array.isArray(next.players) && mine) {
      next.players.forEach(p => { p.local = p.id === mine; });
    }
    if (next.outcome && mine) next.outcome = personalizeOutcome(next.outcome, mine, next);
    state = next;
    claimGuestOutcome(mine);
    syncGameState();
    return state;
  }

  let claimedOutcome = null;

  function claimGuestOutcome(playerId) {
    if (mode !== 'guest' || !state || !state.outcome || !playerId) return;
    const key = String(state.startedAt) + ':' + playerId;
    if (claimedOutcome === key || GameState.data.lastOutcomeClaim === key) return;
    claimedOutcome = key;
    const amount = Math.max(0, Math.round(state.outcome.banked || 0));
    if (amount > 0) GameState.addToPot(amount);
    GameState.data.lastOutcomeClaim = key;
    GameState.save();
  }

  /* What the host told this guest about itself. The old wire said only
     a role; it is kept so an older host still seats us. */
  function setMyRole(role) {
    told = Object.assign({}, told || {}, { role: role === 'traitor' ? 'traitor' : 'faithful' });
  }

  function setPrivate(view) {
    if (!view || typeof view !== 'object') return;
    told = view;
  }

  function abandon() {
    clearFloorTimer();
    clearNightTimer();
    clearTaskTimer();
    rehearsal = false;
    state = null;
    secret = blankSecret();
    told = null;
    claimedOutcome = null;
    eyes = null;
    mode = 'host';
    GameState.data.phase = 'lobby';
    GameState.save();
    emit('change', null);
  }

  // keep the long-standing save model in step, so the recap log reads right
  function syncGameState() {
    if (!state) return;
    const map = { hill: 'lobby', tasks: 'tasks', night: 'night',
                  breakfast: 'night', table: 'roundtable',
                  finale: 'endgame', verdict: 'endgame' };
    GameState.data.phase = map[state.phase] || 'lobby';
    GameState.data.round = state.day + 1;
    GameState.save();
  }

  /* ---------------- what a client is allowed to know ---------------- */

  const localPlayer = () => (state ? state.players.find(p => p.local) : null);

  /* Everything one person may know that the others may not, as one
     object. The transport addresses it to that person and to nobody
     else, and a guest installs it with `setPrivate`. It is recomputed,
     never patched, so a reconnect is told the whole of it again. */
  function privateView(playerId) {
    if (mode !== 'host' || !state) return null;
    const p = playerById(playerId);
    if (!p) return null;
    const traitor = isTraitor(p);
    const view = {
      role: traitor ? 'traitor' : 'faithful',
      partners: traitor ? state.players.filter(q => q.id !== p.id && q.alive && isTraitor(q)).map(q => q.id) : [],
      fate: secret.fate[p.id] || null,
      recruited: secret.recruited === p.id,
      jobs: (secret.lists.get(p.id) || []).map(t => Object.assign({}, t)),
      notes: (secret.notes.get(p.id) || []).slice(-40),
      poison: null,
      night: null,
      offer: null,
    };
    /* Both Traitors know who carries it and whether it has been used —
       and on whom, because the other one has to be ready to lie about it. */
    if (traitor && p.alive) {
      view.poison = {
        carrier: secret.carrier,
        mine: secret.carrier === p.id,
        used: !!secret.poison,
        target: secret.poison ? secret.poison.target : null,
      };
    }
    if (state.phase === 'night' && state.night && traitor && p.alive) {
      view.night = {
        canRecruit: !!state.night.canRecruit,
        choose: !!state.night.choose,
        picks: Object.assign({}, secret.picks),
        endsAt: secret.pickBy,
        locked: !!(secret.offer || secret.resolvedAt),
        offer: secret.offer ? { targetId: secret.offer.targetId, answer: secret.offer.answer } : null,
      };
    }
    if (secret.offer && secret.offer.targetId === p.id && secret.offer.answer === null) {
      view.offer = { endsAt: secret.offer.endsAt };
    }
    return view;
  }

  function myPrivate() {
    if (mode === 'guest') return told;
    const me = localPlayer();
    return me ? privateView(me.id) : null;
  }

  function myRole() {
    if (mode === 'guest') return told ? told.role : null;
    const me = localPlayer();
    return me ? roleOfSeat(me.seat) : null;
  }

  const alive = () => (state ? state.players.filter(p => p.alive) : []);
  const playerById = (id) => (state ? state.players.find(p => p.id === id) : null);
  /* Who a barrier waits for. AI contestants build no scenes and press
     no buttons — the host acts for them — so a room never waits on one. */
  const present = () => alive().filter(p => !p.bot);
  const traitorsAlive = () => alive().filter(isTraitor);

  /* ---------------- the reducer ----------------
     The only mutator. Everything a scene wants to do arrives here as an
     action, which is exactly what will go down the wire. */

  function dispatch(action) {
    /* A guest asks; it does not decide. Its actions have already gone
       down the wire by the time they get here, and running them locally
       as well would give it a private, divergent copy of the night. */
    if (mode !== 'host') return null;
    if (!state || !action) return null;
    let moved = false;
    switch (action.type) {
      case 'beat':    moved = doBeat(action); break;
      case 'advance': moved = doAdvance(action); break;
      case 'chore':   moved = doChore(action); break;
      case 'handover': moved = doHandover(action); break;
      case 'poison':  moved = doPoison(action); break;
      case 'tasksTick': moved = action.authority ? tasksTick() : false; break;
      case 'decide':  moved = doDecide(action); break;
      case 'decisionPouch': moved = doDecisionPouch(action); break;
      case 'name':    moved = doName(action); break;
      case 'speakName': moved = doSpeakName(action); break;
      case 'reveal':  moved = doReveal(); break;
      case 'pouch':   moved = doPouch(); break;
      case 'openFloor':  moved = doOpenFloor(action); break;
      case 'yieldFloor': moved = doYieldFloor(action); break;
      case 'sceneReady': moved = doSceneReady(action); break;
      case 'syncReady':  moved = doSyncReady(action); break;
      case 'expose':     moved = doExpose(); break;
      case 'exposeDone': moved = doExposeDone(); break;
      case 'turretPick': moved = doTurretPick(action); break;
      case 'recruitAnswer': moved = doRecruitAnswer(action); break;
      case 'nightTick':  moved = action.authority ? nightTick() : false; break;
      case 'breakfastNext': moved = action.authority ? doBreakfastNext() : false; break;
      case 'leave':      moved = action.authority ? doLeave(action) : false; break;
      case 'cue':        if (action.authority) doCue(action); break;
      default: return null;
    }
    if (moved) emit('change', state);
    return state;
  }

  /* ---------------- the days ----------------
     A day is the tasks, the round table, a night and a breakfast. What
     comes after breakfast is either another day or the fire, and that is
     decided by how many are left, never by a count fixed at the start —
     a poison that went unused means a night with no body in it, and the
     show simply goes round again. */

  function beginDay(d) {
    state.day = d;
    chooseCarrier(d);
    if (!partOn('tasks')) {
      // a rehearsal without the castle: the day still paid something
      state.pot += 4000 + rngFor(0x5eed ^ d, state.seed).int(0, 6) * 500;
      return afterTasks();
    }
    return beginTasks();
  }

  function beginTasks() {
    secret.poison = null;
    secret.owed = null;
    secret.lastLook = new Map();
    dealChores(state.day);
    const now = Date.now();
    const done = {};
    for (const p of alive()) done[p.id] = 0;
    state.chores = { day: state.day, startedAt: now, endsAt: now + TASK_SECONDS * 1000,
                     seconds: TASK_SECONDS, bell: false, done, closed: false };
    setPhase('tasks', true);
    armTasks();
    emit('private');
    return true;
  }

  /* The clock, and a look round the house every few seconds. Who was in
     which room with whom is the most ordinary evidence there is, and it
     is written into each person's own notebook: what *they* saw. */
  function tasksTick() {
    const c = state && state.chores;
    if (!state || state.phase !== 'tasks' || !c || c.closed) return false;
    const now = Date.now();
    let moved = false;
    lookRound();
    if (!c.bell && now >= c.endsAt - BELL_AT * 1000) {
      c.bell = true;
      emit('bell', { left: Math.max(0, Math.round((c.endsAt - now) / 1000)) });
      moved = true;
    }
    if (now >= c.endsAt) { endTasks(); return true; }
    return moved;
  }

  function armTasks() {
    clearTaskTimer();
    taskTimer = setInterval(() => {
      if (!state || state.phase !== 'tasks') { clearTaskTimer(); return; }
      if (tasksTick()) emit('change', state);
    }, NOTE_EVERY * 1000);
    if (taskTimer && typeof taskTimer.unref === 'function') taskTimer.unref();
    // the end of the day lands on its second, not on the next look round
    const end = setTimeout(() => {
      if (state && state.phase === 'tasks' && tasksTick()) emit('change', state);
    }, Math.max(50, state.chores.endsAt - Date.now() + 30));
    if (end && typeof end.unref === 'function') end.unref();
    taskTimerEnd = end;
  }
  let taskTimerEnd = null;
  function clearTaskTimer() {
    if (taskTimer) { clearInterval(taskTimer); taskTimer = null; }
    if (taskTimerEnd) { clearTimeout(taskTimerEnd); taskTimerEnd = null; }
  }

  const clock = () => {
    const c = state && state.chores;
    return c ? Math.max(0, Math.round((Date.now() - c.startedAt) / 1000)) : 0;
  };

  function note(playerId, n) {
    const list = secret.notes.get(playerId) || [];
    list.push(Object.assign({ day: state.day, t: clock() }, n));
    if (list.length > 80) list.splice(0, list.length - 80);
    secret.notes.set(playerId, list);
  }

  function lookRound() {
    if (!eyes || !eyes.presence) return;
    let seen;
    try { seen = eyes.presence(); } catch (e) { return; }
    if (!seen) return;
    let changed = false;
    for (const p of alive()) {
      const here = seen[p.id];
      if (!here || !here.room) continue;
      const company = (here.with || []).filter(id => (playerById(id) || {}).alive).sort();
      const key = here.room + ':' + company.join(',');
      if (secret.lastLook.get(p.id) === key) continue;
      secret.lastLook.set(p.id, key);
      note(p.id, { kind: 'with', room: here.room, ids: company });
      changed = true;
    }
    if (changed) emit('private');
  }

  /* Somebody handed somebody something. Everybody who could see it
     writes down what they saw — and it reads the same whether it was a
     letter or the poison, because from across a room it looks the same. */
  function witnessed(actorId, targetId) {
    if (!eyes || !eyes.witnesses) return;
    let w;
    try { w = eyes.witnesses(actorId, targetId); } catch (e) { return; }
    if (!w) return;
    for (const id of w.ids || []) {
      if (id === actorId || id === targetId || !(playerById(id) || {}).alive) continue;
      note(id, { kind: 'handover', room: w.room || null, a: actorId, b: targetId });
    }
  }

  const within = (a, b, metres) => {
    if (!eyes || !eyes.reach) return true;
    const d = eyes.reach(a, b);
    return d === null || d === undefined || d <= metres;
  };

  function myJob(p, jobId) {
    const list = secret.lists.get(p.id) || [];
    return list.find(t => t.id === jobId) || null;
  }

  function pay(p) {
    const c = state.chores;
    c.done[p.id] = (c.done[p.id] || 0) + 1;
    state.pot += typeof Chores !== 'undefined' ? Chores.VALUE : 500;
    // a finished list is dealt more, so there is always somewhere to be
    const list = secret.lists.get(p.id) || [];
    if (typeof Chores !== 'undefined' && list.length && list.every(j => j.done)) {
      const r = rngFor(SALT.chores ^ (state.day * 0x9e37) ^ (p.seat * 0x2f1) ^ (list.length * 0x71), state.seed);
      list.push(...Chores.more(r, p, list));
    }
    emit('chore', { playerId: p.id, pot: state.pot });
    emit('private');
  }

  /* A station job, reported by the person who did it. Nothing here can
     watch a puzzle being solved, and nothing needs to: it is a few
     hundred pounds and it was always on their own list. */
  function doChore(a) {
    if (state.phase !== 'tasks' || !state.chores || state.chores.closed) return false;
    const p = playerById(a.playerId);
    if (!p || !p.alive) return false;
    const t = myJob(p, a.jobId);
    if (!t || t.done) return false;
    // an errand: picked up first, then put down somewhere else
    if (t.kind === 'carry') {
      if (!t.step) { t.step = 1; emit('private'); return false; }
      t.done = true;
      pay(p);
      return true;
    }
    if (t.kind !== 'station') return false;
    t.done = true;
    pay(p);
    return true;
  }

  /* A letter, handed over. It has to be the right person and they have
     to be standing next to you. */
  function doHandover(a) {
    if (state.phase !== 'tasks' || !state.chores || state.chores.closed) return false;
    const p = playerById(a.playerId);
    const t = playerById(a.targetId);
    if (!p || !p.alive || !t || !t.alive || t.id === p.id) return false;
    const job = (secret.lists.get(p.id) || []).find(j => j.kind === 'letter' && !j.done && j.target === t.id);
    if (!job || !within(p.id, t.id, (typeof Chores !== 'undefined' ? Chores.REACH : 2) + 1)) return false;
    job.done = true;
    witnessed(p.id, t.id);
    pay(p);
    return true;
  }

  /* The murder. Only the carrier, only once, only on a Faithful, only
     standing next to them. It answers "nothing moved": a snapshot going
     out the instant it lands is a tell on the wire, so the only thing
     that leaves is private. */
  function doPoison(a) {
    if (state.phase !== 'tasks' || !state.chores || state.chores.closed || secret.poison) return false;
    const p = playerById(a.playerId);
    const t = playerById(a.targetId);
    if (!p || !p.alive || !isTraitor(p) || p.id !== secret.carrier) return false;
    if (!t || !t.alive || isTraitor(t)) return false;
    if (!within(p.id, t.id, (typeof Chores !== 'undefined' ? Chores.REACH : 2) + 1)) return false;
    secret.poison = { by: p.id, target: t.id, at: clock() };
    witnessed(p.id, t.id);
    GameState.logEvent('poison', 'The poison found somebody', {});
    emit('private');
    return false;
  }

  function endTasks() {
    clearTaskTimer();
    const c = state.chores;
    c.closed = true;
    c.endsAt = Date.now();
    secret.victim = secret.poison ? secret.poison.target : null;
    if (!secret.poison && secret.carrier && (playerById(secret.carrier) || {}).alive) {
      secret.owed = secret.carrier;
    }
    GameState.logEvent('tasks', `The day paid the pot ${U.money(state.pot)}`, {});
    return afterTasks();
  }

  function afterTasks() {
    if (partOn('table')) return beginTable();
    return afterTable();
  }

  function afterTable() {
    if (traitorsAlive().length === 0) { endGame('all-found'); return true; }
    if (partOn('night')) return beginNight();
    return afterBreakfast();
  }

  function afterBreakfast() {
    if (traitorsAlive().length === 0) { endGame('all-found'); return true; }
    const next = state.day + 1;
    if (!bigNight() || alive().length <= FINALE_AT || next >= MAX_DAYS) return beginFinale();
    return beginDay(next);
  }

  function beginFinale() {
    if (!partOn('finale')) { endGame('ended-by-vote'); return true; }
    state.finale = newBallot('fire');
    setPhase('finale', true);
    return true;
  }

  /* ---------------- the night ----------------
     Everybody goes to their room and the door is locked. The poison is
     already in somebody; the night is when it takes. The Traitors meet
     in the turret, and there are only two things left to decide there:
     which of them carries it tomorrow, if there are two, and — only when
     one of them has been banished, another survives, and there are
     Faithfuls enough to spare one — whether to offer somebody a seat.

     A seat offered is a seat that may be refused, and refusing it costs
     nothing: the poison is the only way anybody dies in this house.

     Nothing of the choice is in `state`. The night's public face is
     that it is happening and, later, that it is over. */

  function canRecruit() {
    const t = traitorsAlive().length;
    const f = alive().length - t - (secret.victim ? 1 : 0);
    const lost = state.banished.some(b => b.role === 'traitor');
    // too few Faithfuls and nobody gets a seat at the turret
    return lost && t >= 1 && t < state.dealt + 1 && (f - 1) >= (t + 1) + 2;
  }

  function beginNight() {
    // a carrier exposed or banished today hands it on before the turret meets
    if (secret.carrier && !(playerById(secret.carrier) || {}).alive) secret.carrier = null;
    chooseCarrier(state.day + 1);
    secret.picks = {};
    secret.offer = null;
    secret.recruited = null;
    secret.resolvedAt = 0;
    const tr = traitorsAlive();
    const choose = tr.length > 1;
    const recruit = canRecruit();
    /* The night is the same length every time, so how long the house
       sleeps says nothing about whether anybody had anything to decide. */
    const t0 = Date.now();
    state.night = { day: state.day, done: false, startedAt: t0,
                    endsAt: t0 + NIGHT_SECONDS * 1000,
                    canRecruit: recruit, choose };
    secret.pickBy = t0 + PICK_SECONDS * 1000;
    secret.spared = !!secret.victim && !(playerById(secret.victim) || {}).alive;
    if (secret.victim && !secret.spared) secret.fate[secret.victim] = 'murdered';
    else secret.victim = null;
    setPhase('night', true);
    if (!choose && !recruit) secret.resolvedAt = Date.now();
    armNight();
    emit('private');
    return true;
  }

  /* One Traitor's say in the turret: who carries tomorrow (`carrier`),
     a seat to offer (`recruit`), or nothing more to do (`none`). With
     two of them, the night is decided when they agree; the clock
     decides when they do not. */
  function doTurretPick(a) {
    if (state.phase !== 'night' || !state.night || state.night.done) return false;
    if (secret.offer || secret.resolvedAt) return false;
    const p = playerById(a.playerId);
    if (!p || !p.alive || !isTraitor(p)) return false;
    const kind = a.kind === 'recruit' ? 'recruit' : a.kind === 'carrier' ? 'carrier' : 'none';
    const t = a.targetId ? playerById(a.targetId) : null;
    if (kind === 'recruit' && (!state.night.canRecruit || !t || !t.alive || isTraitor(t) || t.id === secret.victim)) return false;
    if (kind === 'carrier' && (!t || !t.alive || !isTraitor(t))) return false;
    const pick = { kind, targetId: t ? t.id : null };
    const before = secret.picks[p.id];
    if (before && before.kind === pick.kind && before.targetId === pick.targetId) return false;
    secret.picks[p.id] = pick;
    emit('private');
    const picks = traitorsAlive().map(q => secret.picks[q.id]);
    if (picks.every(x => x && x.kind === pick.kind && x.targetId === pick.targetId)) lockNight(pick);
    return nightIsPublic();
  }

  /* A pick moves nothing anybody else may see, so it sends no snapshot:
     a packet leaving the host the instant a Traitor chooses is a tell.
     Only the night's end is public, and that is the one thing that is
     allowed to go out from here. */
  const nightIsPublic = () => state.phase !== 'night' || !!(state.night && state.night.done);

  function lockNight(pick) {
    if (pick.kind === 'carrier') secret.carrier = pick.targetId;
    if (pick.kind === 'recruit') {
      // an offer is never allowed to run past the end of the night
      const by = Math.min(Date.now() + RECRUIT_SECONDS * 1000, state.night.endsAt - 1500);
      secret.offer = { targetId: pick.targetId, endsAt: by, answer: null };
      armNight();
      emit('private');
      return;
    }
    resolveNight();
  }

  function doRecruitAnswer(a) {
    if (state.phase !== 'night' || !secret.offer || secret.offer.answer !== null) return false;
    if (a.playerId !== secret.offer.targetId) return false;
    settleOffer(!!a.accept);
    return nightIsPublic();
  }

  /* A seat, offered. Taking it makes you a Traitor from this moment;
     refusing it leaves you exactly as you were. */
  function settleOffer(accept) {
    const t = playerById(secret.offer.targetId);
    secret.offer.answer = accept;
    if (accept && t && t.alive) {
      secret.traitors.add(t.seat);
      secret.recruited = t.id;
    }
    resolveNight();
  }

  function resolveNight() {
    secret.resolvedAt = Date.now();
    emit('private');
    armNight();
    nightTick();
  }

  /* The clock decides. Two Traitors who never agreed on a carrier get
     the seed's choice between them; an offer nobody agreed on is never
     made. */
  function forceNight() {
    const r = rngFor(SALT.night ^ (state.day * 0x51), state.seed);
    const picks = traitorsAlive().map(q => secret.picks[q.id]).filter(Boolean)
      .filter(x => x.kind === 'carrier' && (playerById(x.targetId) || {}).alive);
    if (picks.length) secret.carrier = picks[r.int(0, picks.length - 1)].targetId;
    resolveNight();
  }

  function nightTick() {
    if (!state || state.phase !== 'night' || !state.night) return false;
    const now = Date.now();
    if (!secret.resolvedAt) {
      if (secret.offer && secret.offer.answer === null) {
        if (now >= secret.offer.endsAt) settleOffer(false);
        return false;
      }
      if (now >= secret.pickBy) forceNight();
      return false;
    }
    /* Decided is not the same as over. The night always runs its full
       length, so the moment the Traitors agreed is never on the wire. */
    if (now >= state.night.endsAt) {
      clearNightTimer();
      state.night.done = true;
      emit('night', { done: true });
      toBreakfast();
      return true;
    }
    return false;
  }

  function armNight() {
    clearNightTimer();
    if (!state || state.phase !== 'night' || !state.night) return;
    const now = Date.now();
    let at = secret.pickBy;
    if (secret.offer && secret.offer.answer === null) at = secret.offer.endsAt;
    if (secret.resolvedAt) at = Math.max(now, state.night.endsAt);
    nightTimer = setTimeout(() => {
      nightTimer = null;
      if (state && state.phase === 'night' && nightTick()) emit('change', state);
      else if (state && state.phase === 'night') armNight();
    }, Math.max(50, at - now + 20));
    // node test runs should not be held open by a night nobody finishes
    if (nightTimer && typeof nightTimer.unref === 'function') nightTimer.unref();
  }

  function clearNightTimer() {
    if (nightTimer) { clearTimeout(nightTimer); nightTimer = null; }
  }

  /* ---------------- breakfast ----------------
     The survivors come down in small groups, and nobody is told who is
     missing until the last group is through the door. The groups are
     dealt from the seed on the host and released one at a time, so the
     victim's absence is not in anybody's state until it is announced. */

  function toBreakfast() {
    const r = rngFor(SALT.breakfast ^ (state.day * 0x3b), state.seed);
    const coming = alive().filter(p => p.id !== secret.victim).map(p => p.id);
    for (let i = coming.length - 1; i > 0; i--) {
      const k = r.int(0, i);
      [coming[i], coming[k]] = [coming[k], coming[i]];
    }
    const groups = [];
    while (coming.length) groups.push(coming.splice(0, Math.min(coming.length, r.int(1, 2))));
    secret.queue = groups;
    state.breakfast = { day: state.day, arrived: [], groups: 0, revealed: false,
                        victim: null, name: null, spared: false };
    setPhase('breakfast', true);
    return true;
  }

  function doBreakfastNext() {
    const b = state.breakfast;
    if (state.phase !== 'breakfast' || !b || b.revealed) return false;
    if (secret.queue.length) {
      const ids = secret.queue.shift();
      b.arrived.push(...ids);
      b.groups++;
      emit('arrive', { ids: ids.slice(), last: !secret.queue.length });
      return true;
    }
    b.revealed = true;
    const v = secret.victim ? playerById(secret.victim) : null;
    if (v && v.alive) {
      v.alive = false;
      v.out = 'murdered';
      b.victim = v.id;
      b.name = v.name;
      state.murdered.push({ id: v.id, name: v.name, day: state.day });
      GameState.logEvent('murder', `${v.name} was murdered`, { id: v.id });
    }
    b.spared = !b.victim && secret.spared;
    secret.victim = null;
    secret.spared = false;
    secret.fate = {};
    if (secret.carrier && !(playerById(secret.carrier) || {}).alive) secret.carrier = null;
    emit('murder', { playerId: b.victim, name: b.name, day: state.day });
    emit('private');
    return true;
  }

  function beginTable() {
    state.finale = newBallot('table');
    setPhase('table', true);
    return true;
  }

  /* A seat that empties mid-night, because a browser left. They are out
     of the game as surely as if they had been banished, and the night
     goes on round them — unless it was the last Traitor, in which case
     there is nothing left to find. */
  function doLeave(a) {
    const p = playerById(a.playerId);
    if (!p || !p.alive) return false;
    p.alive = false;
    p.out = 'left';
    const f = state.finale;
    if (f) {
      delete f.names[p.id];
      delete f.votes[p.id];
      f.nameQueue = f.nameQueue.filter(id => id !== p.id);
      f.decisionQueue = f.decisionQueue.filter(id => id !== p.id);
      if (f.pending === p.id && f.stage === 'reveal') f.pending = null;
    }
    if (secret.victim === p.id) secret.victim = null;
    if (secret.poison && secret.poison.target === p.id) secret.poison = null;
    if (secret.carrier === p.id) { secret.carrier = null; chooseCarrier(state.day); }
    if (secret.owed === p.id) secret.owed = null;
    delete secret.picks[p.id];
    if (state.phase === 'verdict') return true;
    if (traitorsAlive().length === 0 || alive().length < 2) {
      endGame(traitorsAlive().length ? 'final-two' : 'all-found');
      return true;
    }
    if (f && f.stage === 'name' && alive().every(q => f.names[q.id])) beginNameReveal();
    if (f && f.stage === 'decide' && alive().every(q => f.votes[q.id])) beginDecisionReveal();
    if (f && f.stage === 'reveal' && !f.pending) afterBanishment();
    return true;
  }

  /* ---------------- the floor ----------------
     Two shapes, and the difference is the whole character of the room.

     A *turn* floor goes round the seats: one microphone, thirty
     seconds, nobody interrupts. That is the fire, where names are
     about to be said and the loudest voice must not be the one that
     decides. A turn floor with a single name in it is the last words of
     somebody about to burn.

     An *open* floor is the round table: every microphone live at once
     for the length of the discussion, anybody may cut in at any moment,
     and it ends when the clock runs out, when Claudia calls it, or when
     everybody still in it has said they are finished.

     Either way the clock belongs to the authority. A discussion timed
     in a player's own browser ends when their tab is throttled or their
     machine sleeps, which is precisely the moment they would rather it
     did not. */

  function doOpenFloor(a) {
    if (state.floor && !state.floor.done && (state.floor.all || state.floor.playerId)) {
      return false;
    }
    const fallback = a.all ? tableSeconds(alive().length) : FLOOR_SECONDS;
    const seconds = Math.max(5, Math.min(600, a.seconds || fallback));

    if (a.all) {
      const f = { all: true, queue: [], playerId: null, ready: [],
                  endsAt: Date.now() + seconds * 1000, seconds, done: false };
      state.floor = f;
      clearFloorTimer();
      emit('floor', { all: true, playerId: null, endsAt: f.endsAt,
                      seconds, ready: [], done: false });
      emit('change', state);
      floorTimer = setTimeout(() => {
        if (state && state.floor === f) closeFloor();
      }, seconds * 1000);
      return false;                     // the emits above have already gone
    }

    let order = alive().slice().sort((x, y) => x.seat - y.seat).map(p => p.id);
    if (Array.isArray(a.only)) order = order.filter(id => a.only.indexOf(id) >= 0);
    else if (a.only) order = order.filter(id => id === a.only);
    if (!order.length) return false;
    state.floor = { all: false, queue: order, playerId: null, ready: [],
                    endsAt: 0, seconds, done: false };
    advanceFloor();
    return false;                       // advanceFloor has already emitted
  }

  function advanceFloor() {
    clearFloorTimer();
    const f = state.floor;
    if (!f) return;
    let next = f.queue.shift();
    while (next && !(playerById(next) || {}).alive) next = f.queue.shift();
    if (!next) { closeFloor(); return; }
    f.playerId = next;
    f.endsAt = Date.now() + f.seconds * 1000;
    emit('floor', { playerId: next, endsAt: f.endsAt, seconds: f.seconds, done: false });
    emit('change', state);
    floorTimer = setTimeout(() => {
      if (state && state.floor && state.floor.playerId === next) advanceFloor();
    }, f.seconds * 1000);
  }

  /* The one way a floor of either shape ends. */
  function closeFloor() {
    clearFloorTimer();
    const f = state ? state.floor : null;
    if (!f || f.done) return;
    f.done = true; f.playerId = null; f.endsAt = 0;
    emit('floor', { playerId: null, all: !!f.all, done: true });
    emit('change', state);
  }

  function clearFloorTimer() {
    if (floorTimer) { clearTimeout(floorTimer); floorTimer = null; }
  }

  /* "I have said enough." On a turn floor that is sitting down early,
     and only the person standing up may do it — or the authority, which
     is how Claudia moves a turn on. On an open floor nobody is holding
     anything, so it is a vote to move on, and the table only moves when
     everybody still sitting at it has cast one. The authority may close
     an open floor outright: that is Claudia calling time. */
  function doYieldFloor(a) {
    const f = state.floor;
    if (!f || f.done) return false;

    if (f.all) {
      if (a.authority && a.close) { closeFloor(); return false; }
      const p = a.playerId ? playerById(a.playerId) : localPlayer();
      if (!p || !p.alive) return false;
      if (f.ready.indexOf(p.id) < 0) {
        f.ready.push(p.id);
        emit('floor', { all: true, playerId: null, endsAt: f.endsAt,
                        seconds: f.seconds, ready: f.ready.slice(), done: false });
        emit('change', state);
      }
      if (present().every(x => f.ready.indexOf(x.id) >= 0)) closeFloor();
      return false;
    }

    if (!f.playerId) return false;
    if (a.playerId && a.playerId !== f.playerId && !(a.authority && a.close)) return false;
    advanceFloor();
    return false;
  }

  /* `force` exists for the phases that follow themselves — one day's
     tasks to the next — where a change of phase still has to clear
     the floor, the barriers and the scene handshake. */
  function setPhase(next, force) {
    const prev = state.phase;
    if (prev === next && !force) return;
    state.phase = next;
    state.beat = 0;
    clearFloorTimer();
    if (next !== 'night') clearNightTimer();
    if (next !== 'tasks') clearTaskTimer();
    state.floor = null;
    state.scene = { phase: next, ready: [], started: false };
    state.syncReady = {};
    state.syncPassed = [];
    state.exposure = null;
    syncGameState();
    emit('phase', next, prev);
  }

  /* A scene begins only after every browser in the room has built it.
     Without this, the fastest GPU can be a line of dialogue ahead before
     the slowest one has even installed its event listeners. The dead
     still watch, but nobody waits for them. */
  function doSceneReady(a) {
    const sc = state.scene || (state.scene = { phase: state.phase, ready: [], started: false });
    if (sc.phase !== state.phase || (a.phase && a.phase !== state.phase)) return false;
    if (sc.started) { emit('scene', { phase: state.phase }); return false; }
    const p = a.playerId ? playerById(a.playerId) : localPlayer();
    if (!p || sc.ready.indexOf(p.id) >= 0) return false;
    sc.ready.push(p.id);
    if (!sc.started && present().every(q => sc.ready.indexOf(q.id) >= 0)) {
      sc.started = true;
      /* The day's clock starts when the last browser has the castle
         built, not when the host asked for it: loading is not time
         anybody got to spend. */
      if (state.phase === 'tasks' && state.chores && !state.chores.closed) {
        const now = Date.now();
        state.chores.startedAt = now;
        state.chores.endsAt = now + state.chores.seconds * 1000;
        armTasks();
      }
      emit('scene', { phase: state.phase });
    }
    return true;
  }

  /* Explicit barriers cover the places where private material gives
     clients different-length beat lists (the role/task cards) before
     they return to shared dialogue. */
  function doSyncReady(a) {
    const key = String(a.key || '').slice(0, 80);
    if (!key) return false;
    if (state.syncPassed.indexOf(key) >= 0) { emit('sync', { key }); return false; }
    const p = a.playerId ? playerById(a.playerId) : localPlayer();
    if (!p) return false;
    const ready = state.syncReady[key] || (state.syncReady[key] = []);
    if (ready.indexOf(p.id) >= 0) return false;
    ready.push(p.id);
    if (present().every(q => ready.indexOf(q.id) >= 0)) {
      state.syncPassed.push(key);
      delete state.syncReady[key];
      emit('sync', { key });
    }
    return true;
  }

  /* Claudia interjecting: the host decided she says something now —
     to draw out the quiet one, or because an AI Claudia spoke — and
     every client has to put the same words on the screen. It moves
     nothing in the state; it is an event and only an event. */
  function doCue(a) {
    const set = a.set ? String(a.set).slice(0, 40) : null;
    const text = a.text ? String(a.text).slice(0, 600) : null;
    if (!set && !text) return;
    const vars = {};
    for (const k of Object.keys(a.vars || {}).slice(0, 8)) vars[k] = String(a.vars[k]).slice(0, 80);
    const near = Array.isArray(a.near) ? a.near.slice(0, 8).map(x => String(x).slice(0, 40)) : undefined;
    emit('cue', { set, text, vars, voice: !!a.voice, quiet: !!a.quiet, id: String(a.id || '').slice(0, 40), near });
  }

  function doBeat(a) {
    const n = Math.max(0, a.n | 0);
    if (n === state.beat) return false;
    state.beat = n;
    emit('beat', n);
    return true;
  }

  /* The scenes that are pure theatre end by asking for the next phase.
     Only the authority's ask counts; a guest's is never forwarded. */
  function doAdvance() {
    if (state.phase === 'hill') return beginDay(0);
    if (state.phase === 'breakfast') {
      if (!state.breakfast || !state.breakfast.revealed) return false;
      return afterBreakfast();
    }
    if (state.phase === 'table') {
      if (state.finale.stage !== 'done') return false;
      return afterTable();
    }
    return false;
  }

  /* ---------------- exposure ----------------
     The carrier who never used the poison. Claudia stops the room
     before anybody sits down at the round table, says it, and they are
     gone: no vote, no last words, a Traitor's flare. Every Traitor knew
     the rule; it was on the card they were handed on the first day.

     The reveal is an event, like every other role that ever escapes
     this file. It always answers, even when the answer is "nobody": a
     guest that asked and heard nothing back cannot tell a clean day
     from a message in flight. */

  function doExpose() {
    if (mode !== 'host') return false;
    if (state.phase !== 'table') return false;
    if (state.exposure && state.exposure.checked) { emit('expose', state.exposure); return false; }
    const p = secret.owed ? playerById(secret.owed) : null;
    secret.owed = null;
    if (!p || !p.alive) {
      state.exposure = { checked: true, playerId: null };
      emit('expose', { playerId: null });
      return true;
    }
    secret.exposedShown = p.id;
    p.alive = false;
    p.out = 'exposed';
    state.banished.push({ id: p.id, name: p.name, day: state.day, role: 'traitor', exposed: true });
    if (secret.carrier === p.id) secret.carrier = null;
    clearFloorTimer();
    state.floor = null;
    GameState.logEvent('expose', `${p.name} never used the poison`, { id: p.id });
    state.exposure = { checked: true, playerId: p.id, name: p.name };
    emit('expose', Object.assign({ role: 'traitor' }, state.exposure));
    emit('private');
    return true;
  }

  /* After the ceremony. If that was the last Traitor, the game is over;
     if not, there is no vote today — the table has had its banishment —
     and the castle goes to bed. */
  function doExposeDone() {
    if (mode !== 'host' || !secret.exposedShown) return false;
    secret.exposedShown = null;
    if (traitorsAlive().length === 0) { endGame('exposed'); return true; }
    if (alive().length < 2) { endGame('final-two'); return true; }
    if (state.phase === 'table' && state.finale) state.finale.stage = 'done';
    return true;
  }

  /* ---------------- the Fire of Truth ----------------
     At the fire the first question is whether to stop at all. Everybody
     answers End or Banish Again; the answers are collected whole, then
     burned one at a time. Ending needs every living voice — one Banish
     is enough to send the circle round again. */

  function doDecide(a) {
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
    const result = end === living.length ? 'end' : 'banish';
    f.lastTally = { stage: 'decide', result, counts: { end, banish }, tied: false };
    emit('tally', f.lastTally);
    if (result === 'end') openPouches('ended-by-vote');
    else {
      f.stage = 'name'; f.names = {}; f.nameQueue = []; f.namesShown = [];
      f.nameRound = 0; f.tied = null; f.lot = false;
    }
  }

  /* ---------------- the banishment ballot ----------------
     The same at the table and at the fire. Everybody writes a name; the
     authority collects the whole ballot before any of it is revealed;
     the names are then said one at a time, in seat order, before the
     tally. A tie is voted again with only the tied names on the slate.
     Tied again, and Claudia draws a lot between them — a table of eight
     can deadlock forever, and the programme does exactly this. */

  function doName(a) {
    const f = state.finale;
    if ((state.phase !== 'finale' && state.phase !== 'table') || f.stage !== 'name') return false;
    const p = playerById(a.playerId);
    const t = playerById(a.targetId);
    if (!p || !p.alive || !t || !t.alive) return false;
    if (t.id === p.id) return false;                  // nobody names themselves
    if (f.tied && f.tied.indexOf(t.id) < 0) return false;
    if (f.names[p.id] === t.id) return false;
    f.names[p.id] = t.id;
    emit('vote', { playerId: p.id, stage: 'name', targetId: t.id });
    if (alive().every(q => f.names[q.id] || !canName(q, f))) beginNameReveal();
    return true;
  }

  /* On a revote between two, each of them can only name the other —
     and if somebody's only choice would be themselves, they abstain. */
  function canName(p, f) {
    if (!f.tied) return true;
    return f.tied.some(id => id !== p.id);
  }

  function beginNameReveal() {
    const f = state.finale;
    f.stage = 'names';
    f.nameQueue = alive().filter(p => f.names[p.id])
      .sort((a, b) => a.seat - b.seat).map(p => p.id);
    f.namesShown = [];
  }

  function doSpeakName(a) {
    const f = state.finale;
    if ((state.phase !== 'finale' && state.phase !== 'table') || f.stage !== 'names' || !f.nameQueue.length) return false;
    const playerId = f.nameQueue[0];
    if (a.playerId && a.playerId !== playerId) return false;
    const targetId = f.names[playerId];
    const p = playerById(playerId);
    const t = playerById(targetId);
    if (!p || !p.alive || !t || !t.alive) {
      f.nameQueue.shift();
      if (!f.nameQueue.length) resolveName();
      return true;
    }
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
      if (!t || !(playerById(t) || {}).alive) continue;
      counts[t] = (counts[t] || 0) + 1;
    }
    let top = -1;
    for (const id in counts) top = Math.max(top, counts[id]);
    const tied = Object.keys(counts).filter(id => counts[id] === top).sort();
    let pick = tied.length === 1 ? tied[0] : null;
    let lot = false;
    if (!pick && tied.length && f.nameRound >= 1) {
      const r = rngFor(SALT.tie ^ (state.day * 131) ^ (f.round * 17), state.seed);
      pick = tied[r.int(0, tied.length - 1)];
      lot = true;
    }
    f.lastTally = { stage: 'name', result: pick, counts, tied: tied.length > 1, lot,
                    between: tied.length > 1 ? tied : null };
    emit('tally', f.lastTally);
    if (!pick) {
      f.stage = 'name';
      f.names = {};
      f.nameQueue = [];
      f.namesShown = [];
      f.tied = tied.length > 1 ? tied : null;
      f.nameRound = (f.nameRound || 0) + 1;
      return;
    }
    f.pending = pick;
    f.lot = lot;
    f.stage = 'reveal';
  }

  /* ---------------- the last pouches ----------------
     Ending the game does not end it. Everybody still sitting there has
     a pouch, and they go in the fire one at a time before anybody is
     told who won. Nobody is banished by this. A surviving Traitor is
     held for last, so the night always finishes on the pouch that
     settles it. */

  function openPouches(reason) {
    const f = state.finale;
    const living = alive();
    const order = living.slice().sort((a, b) => {
      const ar = isTraitor(a) ? 1 : 0;
      const br = isTraitor(b) ? 1 : 0;
      /* Shared ordering must never depend on which browser calls someone
         local. Hold a surviving Traitor for last, then use fixed seats. */
      return ar - br || a.seat - b.seat;
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

  /* The banished say who they were. This is the only place a role other
     than your own is ever disclosed mid-game, and it leaves as an event
     and as the public record of the banished. */
  function doReveal() {
    const f = state.finale;
    if ((state.phase !== 'finale' && state.phase !== 'table') || f.stage !== 'reveal' || !f.pending) return false;
    const p = playerById(f.pending);
    if (!p) return false;
    const role = roleOfSeat(p.seat);

    p.alive = false;
    p.out = 'banished';
    f.burned.push({ id: p.id, name: p.name, role });
    state.banished.push({ id: p.id, name: p.name, day: state.day, role });
    f.pending = null;
    GameState.logEvent('banish', `${p.name} was a ${role}`, { id: p.id, role });
    emit('reveal', { playerId: p.id, name: p.name, role, table: f.kind === 'table' });
    afterBanishment();
    return true;
  }

  function afterBanishment() {
    const f = state.finale;
    if (f.kind === 'table') {
      /* The last Traitor burned at a table: there is nobody left to
         find. The verdict waits for the ceremony to finish saying so. */
      if (traitorsAlive().length === 0) { endGame('all-found'); return; }
      f.stage = 'done';
      return;
    }
    /* At the fire: two left is the end, whatever is in the pouches. */
    if (alive().length <= 2 || traitorsAlive().length === 0) {
      openPouches(alive().length <= 2 ? 'final-two' : 'all-found');
      return;
    }
    f.round++;
    f.stage = 'decide';
    f.votes = {};
    f.decisionQueue = [];
    f.decisionsShown = [];
    f.names = {};
    f.nameQueue = [];
    f.namesShown = [];
    f.nameRound = 0;
    f.tied = null;
    f.lot = false;
  }

  /* ---------------- the verdict ---------------- */

  function personalizeOutcome(outcome, playerId, sourceState) {
    if (!outcome) return outcome;
    const card = (outcome.roles || []).find(p => p.id === playerId);
    if (!card) return outcome;
    const st = sourceState || state;
    const burned = st && st.finale && st.finale.burned;
    const lastBurned = burned && burned.length ? burned[burned.length - 1].id : null;
    const personalReason = outcome.baseReason === 'final-two' && lastBurned === playerId
      ? 'you-burned' : (outcome.baseReason || outcome.reason);
    return Object.assign({}, outcome, {
      reason: personalReason,
      role: card.role,
      won: !!card.winner,
      banked: Math.max(0, Math.round(card.payout || 0)),
      fate: card.out || null,
    });
  }

  function endGame(reason) {
    clearNightTimer();
    clearTaskTimer();
    const living = alive();
    const survivingTraitors = living.filter(isTraitor);
    const traitorAlive = survivingTraitors.length > 0;
    const me = localPlayer();
    const role = me ? roleOfSeat(me.seat) : 'faithful';

    // Surviving Traitors take the pot. With none left, only the Faithfuls
    // still standing share it; every banished or murdered contestant
    // receives nothing.
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
    if (me) {
      GameState.data.lastOutcomeClaim = String(state.startedAt) + ':' + me.id;
      GameState.save();
    }

    const publicOutcome = {
      won, reason, baseReason: reason, role, traitorAlive,
      hadTraitor: secret.traitors.size > 0,
      pot: state.pot,
      banked,
      // the game is over: everyone's cards go face up
      roles: state.players.map(p => ({ id: p.id, name: p.name, seat: p.seat,
                                       role: roleOfSeat(p.seat), alive: p.alive,
                                       out: p.out || null,
                                       winner: winnerIds.has(p.id),
                                       payout: payoutById.get(p.id) || 0 })),
    };
    state.outcome = personalizeOutcome(publicOutcome, me && me.id, state);
    state.finale.stage = 'over';
    GameState.logEvent('verdict', won ? 'Won the pot' : 'Lost the pot',
                       { reason, role, banked });
    setPhase('verdict');
    emit('outcome', state.outcome);
  }

  return {
    startParty, adopt, setMyRole, setPrivate, abandon, dispatch, on,
    myRole, myPrivate, alive, playerById,
    get isHost() { return mode === 'host'; },
    get mode() { return mode; },
    get state() { return state; },
    get active() { return !!state && state.phase !== 'verdict'; },
    get running() { return !!state; },
    // a serialised copy, which is exactly what a server would have sent
    snapshot() {
      if (!state) return null;
      return JSON.parse(JSON.stringify(state));
    },
    SEATS, MIN_PLAYERS, FINALE_AT, NIGHT_SECONDS, PICK_SECONDS, TASK_SECONDS, BELL_AT,
    RECRUIT_SECONDS, LAST_WORDS_SECONDS, FLOOR_SECONDS,
    tableSeconds, traitorCount,

    /* Host-only: who is standing next to whom, and who can see it. The
       castle scene answers; the rules only ask. */
    setEyes(e) { eyes = e || null; },

    /* What the host has to tell each client about itself, and the one
       reason anything in here may read the role table on someone
       else's behalf. It is host-only and consumed by `HostTransport`,
       which addresses each view to the one person it belongs to.
       Nothing it returns ever goes in `state`. */
    privateView,
    privateRoles() {
      if (mode !== 'host' || !state) return [];
      return state.players.map(p => {
        const v = privateView(p.id);
        return { playerId: p.id, role: v.role, view: v };
      });
    },
    /* Host-only: who may hear whom right now. The server enforces it, so
       a Faithful's browser is never even sent a Traitor's voice in the
       turret, and nobody alive hears the dead. `null` is open. */
    voiceRoutes() {
      if (mode !== 'host' || !state) return null;
      const living = alive().map(p => p.id);
      const routes = { open: living, deaf: [] };
      if (state.phase === 'night') {
        routes.night = traitorsAlive().map(p => p.id);
      }
      return routes;
    },

    // the running order, so a caller can validate a list of parts
    get PARTS() { return PARTS.slice(); },
    // whether this night was dealt by the rehearsal door rather than the seed
    get rehearsal() { return rehearsal; },

    /* Whether a ceremony is owed at the next round table. Host-only, and
       deliberately a boolean: the name is not something a scene needs
       before the reveal it is about to play. */
    hasExposure() {
      return mode === 'host' && !!secret.owed && !!(playerById(secret.owed) || {}).alive;
    },
    /* Test seam. Fast-forwards a fresh run to the fire with a day's pot
       in it. It goes through `setPhase` like everything else. */
    jumpTo(phase) {
      if (!state) return null;
      if (phase === 'finale') {
        if (!state.pot) state.pot = 12000;
        beginFinale();
        emit('change', state);
      }
      return state;
    },

    // test seams only: never call these from the game
    _peek() {
      const seats = [...secret.traitors].sort((a, b) => a - b);
      return { has: seats.length > 0, seat: seats.length ? seats[0] : -1, seats,
               carrier: secret.carrier, poison: secret.poison ? Object.assign({}, secret.poison) : null,
               victim: secret.victim, owed: secret.owed, picks: Object.assign({}, secret.picks),
               lists: Object.fromEntries([...secret.lists].map(([k, v]) => [k, v.map(t => Object.assign({}, t))])) };
    },
  };
})();
