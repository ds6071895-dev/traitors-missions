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

   There are two kinds of client now and only one of them is in charge.
   A host owns this reducer outright: it draws the roles, it holds the
   clock, and it is the only place `dispatch` does anything. A guest
   runs the same file in `guest` mode, where `dispatch` is inert and
   `state` is a mirror installed by `adopt()` from whatever the host
   last sent. Scenes cannot tell the difference, which is the point —
   they read `state`, they call `Net.send`, and that is all they ever
   did.

   The roles, drawn once from the seed: there is always exactly one
   Traitor, uniform over all three players, which is a third of all
   nights each, you included. There used to be a quarter of nights with
   nobody in them at all, and a night where the answer is "there was
   never anyone here" is a night three people spent an evening on for
   no reason. You are told your own role and nobody else's.
------------------------------------------------------------------ */
const Session = (() => {

  const V = 3;
  const SEATS = 3;                 // exactly three, and the show is written for it
  const MISSION_COUNT = 1;         // one mission, and the rest of it is talking
  const FLOOR_SECONDS = 30;        // one turn, when the floor goes round
  const TABLE_SECONDS = 150;       // the whole open discussion, when it does not

  let state = null;
  let mode = 'host';               // 'host' owns the reducer, 'guest' mirrors it
  let rehearsal = false;           // a bot night, and the only thing that may
                                   // choose the roles or skip parts of the show
  let toldRole = null;             // what a guest was privately told it is
  let toldAgendas = null;          // and the tasks that came with it
  let floorTimer = null;

  /* The one thing that must never be serialised. `seat` is which chair
     the traitor is in, or -1 for a run that simply has no traitor. */
  let secret = { has: false, seat: -1, agendas: null, exposed: null,
                 taskDone: false };

  const listeners = {
    travel: new Set(),
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
    expose: new Set(),   // ({ playerId, role, agenda }) — an unfinished task
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
    agendas:  0xc2b2ae35,
  };

  /* `force` is the rehearsal door and nothing else uses it: a seat
     number puts the Traitor in that chair, and -1 deals a night with no
     Traitor in it at all. Left undefined — which is every real run —
     the hand is dealt from the seed exactly as it always was.

     It is unreachable except through `Bots`, and that is enforced one
     level up rather than here: `startParty` ignores a forced seat unless
     the same call also declared itself a rehearsal, and only the
     hidden bot argument ever declares that. A real party cannot ask for
     it, because nothing in the lobby knows how to say it. */
  function drawRoles(seed, force) {
    if (force !== undefined && force !== null) {
      const seat = Math.floor(force);
      return seat < 0 || seat >= SEATS ? { has: false, seat: -1 }
                                       : { has: true, seat };
    }
    /* Always one. The seed still chooses the chair, so a night is still
       replayable, but it no longer chooses whether there is a night. */
    const r = rngFor(SALT.roles, seed);
    return { has: true, seat: r.int(0, SEATS - 1) };
  }

  const roleOfSeat = (seat) => (secret.seat === seat ? 'traitor' : 'faithful');

  /* ---------------- the running order ----------------
     The night, as a list, because something had to be. It used to be
     three `if` statements spread over `doAdvance` and `doResult`, which
     was fine while every night played every part and impossible the
     moment one did not.

     `state.parts` is which of these are being played. It is the whole
     of the rehearsal door: a night that is only a fire is this list
     with four entries switched off, and everything downstream — the
     scenes, the transports, the verdict — cannot tell the difference
     between a mission that was skipped and one that was played badly,
     because a skipped one is marked done with money in it exactly as a
     played one is.

     Real nights pass no `parts` at all and get `ALL_PARTS`, which is
     every entry, which is the behaviour this file has always had. */

  /* The night is short on purpose. It used to be two missions with a
     round table between them, which is the shape of the television
     programme and the wrong shape for three people on a voice call:
     most of an evening went on missions, and the round table spent
     itself re-litigating a scoreboard. The deck is voice now, and the
     thing worth playing is the microphone, so the running order is a
     welcome, one mission with everybody talking through it, and the
     fire. Everything that is not traitoring has been taken out. */
  const RUN = [
    { part: 'intro',  phase: 'hill' },
    { part: 'm1',     phase: 'mission', at: 0 },
    { part: 'finale', phase: 'finale' },
  ];
  const ALL_PARTS = RUN.map(s => s.part);

  const partOn = (id) => !state || !state.parts || state.parts.indexOf(id) >= 0;

  /* A mission nobody is going to play still has to have happened: the
     round table argues about a board and the fire divides a pot, and
     both of those are worse than useless if they are empty. So it is
     marked done, paid at roughly what a decent run pays, and given a
     board with everybody on it. Deterministic from the seed, like
     everything else here, so a rehearsal can be repeated. */
  function skipMission(at) {
    const m = state.missions[at];
    if (!m || m.done) return;
    const r = rngFor(0x5eed5eed ^ (at * 977), state.seed);
    m.earned = 2600 + r.int(0, 9) * 700;
    m.completed = r() < 0.72;
    m.done = true;
    m.skipped = true;
    state.pot = Math.max(0, state.pot + m.earned);
    const order = state.players.slice().sort(() => r() - 0.5);
    state.debrief = {
      missionId: m.id,
      missionName: m.name + ' (not played)',
      columns: ['Place', 'Won'],
      rows: order.map((p, i) => ({
        playerId: p.id, name: p.name, seat: p.seat, place: i + 1,
        earned: Math.round(m.earned / 3),
        cells: [['1st', '2nd', '3rd'][i] || '—', U.money(Math.round(m.earned / 3))],
      })),
    };
  }

  /* Walk forward from a step index to the next part that is actually
     being played, marking anything stepped over as having happened.
     Running out of list is a night that is over. */
  function goToStep(from) {
    for (let i = from; i < RUN.length; i++) {
      const step = RUN[i];
      if (!partOn(step.part)) {
        if (step.phase === 'mission') skipMission(step.at);
        continue;
      }
      if (step.phase === 'mission') {
        state.missionAt = step.at;
        setPhase('mission', true);
      } else if (step.phase === 'finale') {
        state.finale = newFinale();
        setPhase('finale', true);
      } else setPhase(step.phase, true);
      return true;
    }
    /* Nothing left to play and nobody banished: the circle that is
       still sitting there is the circle that wins. */
    endGame('ended-by-vote');
    return true;
  }

  const stepIndexOf = (part) => RUN.findIndex(s => s.part === part);

  /* ---------------- the run plan ---------------- */

  function planMissions(seed) {
    const r = rngFor(SALT.missions, seed);
    const pool = (typeof Missions !== 'undefined' ? Missions.all() : [])
      .filter(m => !m.locked && typeof m.create === 'function');
    const bag = pool.slice();
    const out = [];

    for (let i = 0; i < MISSION_COUNT; i++) {
      if (!bag.length) bag.push(...pool);       // fewer than that exist: repeat
      if (!bag.length) break;
      const def = bag.splice(Math.floor(r() * bag.length), 1)[0];
      const missionSeed = r.int(1, 0x7ffffff) >>> 0;
      const mode = def.modes ? Object.keys(def.modes)[0] : null;

      out.push({ id: def.id, name: def.name, seed: missionSeed, mode,
                 earned: null, completed: null, done: false });
    }
    return out;
  }

  /* ---------------- the traitor's task ----------------
     One card for the night, drawn from the same seed as everything
     else so a night can be replayed. Only a traitor is ever dealt one,
     and it never touches `state` — it goes to that one client as a
     private message, exactly like the role it belongs to.

     It is still carried as a list because that is what the wire and
     the guest's mirror have always spoken, and a one-entry list is a
     much smaller change than a new private message. Nothing indexes
     into it any more: `myAgenda()` answers with the card whatever it
     is asked, because there is one. */

  function drawAgendas(seed) {
    if (typeof Agendas === 'undefined') return null;
    const card = Agendas.draw(rngFor(SALT.agendas, seed));
    return card ? [card] : null;
  }

  /* ---------------- lifecycle ---------------- */

  function fresh(seed, roster, parts) {
    const players = (roster || []).slice(0, SEATS).map((p, i) => ({
      id: p.id,
      seat: i,
      name: String(p.name || ('Player ' + (i + 1))).slice(0, 16),
      look: p.look || null,     // how they dressed, so everyone draws them the same
      local: !!p.local,
      alive: true,
    }));
    return {
      v: V,
      seed,
      startedAt: Date.now(),
      phase: 'hill',            // hill | mission | table | finale | verdict
      parts: parts && parts.length ? parts.slice() : ALL_PARTS.slice(),
      beat: 0,                  // shared scene beat, for when scenes sync
      missionAt: 0,
      resultReady: [],          // players who have left the shared scoreboard
      pendingResult: null,      // host-authored board while the others read it
      players,
      missions: planMissions(seed),
      pot: 0,
      floor: null,              // { all, queue, playerId, ready, endsAt, seconds, done }
      scene: { phase: 'hill', ready: [], started: false },
      syncReady: {},            // barrier key -> player ids that have arrived
      syncPassed: [],           // public scene barriers already released
      exposure: null,           // the public answer once Claudia has asked
      debrief: null,            // the numbers everybody argues over
      finale: newFinale(),
      outcome: null,
    };
  }

  /* `stage` runs decide -> decisions -> name -> names -> reveal round
     after round. The plural stages perform a completed ballot one
     person at a time. Once the game stops, `pouches` walks the surviving
     role pouches in turn; `reason` holds the verdict until the last one
     has burned. */
  const newFinale = () => ({ round: 0, stage: 'name', names: {},
                             nameQueue: [], namesShown: [], nameRound: 0,
                             pending: null, burned: [], lastTally: null,
                             queue: [], opened: [], reason: null });

  /* A night starts from a party, not from nothing. The host draws the
     roles and the tasks; a guest draws neither and is told its own by
     the only client entitled to say. Nothing here is written to disk:
     a run is three people being in the same place at the same time,
     and there is nothing on this machine that can bring that back. */

  function startParty(opts = {}) {
    const seed = Number.isFinite(opts.seed)
      ? (Math.floor(opts.seed) >>> 0) || U.randomSeed() : U.randomSeed();
    mode = opts.mode === 'guest' ? 'guest' : 'host';
    toldRole = null;
    toldAgendas = null;
    claimedOutcome = null;
    clearFloorTimer();
    /* Both of the rehearsal levers are gated on the same flag, and the
       flag is only ever set by `Bots`. A night with real people in it
       deals its own hand and plays its whole running order. */
    rehearsal = !!opts.rehearsal;
    const forcedSeat = rehearsal ? opts.traitorSeat : undefined;
    secret = mode === 'host'
      ? Object.assign(drawRoles(seed, forcedSeat),
                      { agendas: null, exposed: null, taskDone: false })
      : { has: false, seat: -1, agendas: null, exposed: null, taskDone: false };
    state = fresh(seed, opts.players || [], rehearsal ? opts.parts : null);
    if (mode === 'host') secret.agendas = drawAgendas(seed);
    /* A night that is not playing its welcome starts wherever it does
       start. This runs before anybody is listening — `Show` reads the
       phase off the state rather than waiting to be told about it — so
       the emits it makes on the way go nowhere, which is correct. */
    if (mode === 'host' && !partOn('intro')) goToStep(1);
    syncGameState();
    emit('phase', state.phase, null);
    emit('change', state);
    return state;
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

  function setMyRole(role, agendas) {
    toldRole = role === 'traitor' ? 'traitor' : 'faithful';
    if (agendas) toldAgendas = agendas;
  }

  function abandon() {
    clearFloorTimer();
    rehearsal = false;
    state = null;
    secret = { has: false, seat: -1, agendas: null, exposed: null };
    toldRole = null;
    toldAgendas = null;
    claimedOutcome = null;
    mode = 'host';
    GameState.data.phase = 'lobby';
    GameState.save();
    emit('change', null);
  }

  // keep the long-standing save model in step, so the recap log reads right
  function syncGameState() {
    if (!state) return;
    const map = { hill: 'lobby', mission: 'mission',
                  finale: 'endgame', verdict: 'endgame' };
    GameState.data.phase = map[state.phase] || 'lobby';
    GameState.data.round = state.missionAt + 1;
    GameState.save();
  }

  /* ---------------- what a client is allowed to know ---------------- */

  const localPlayer = () => (state ? state.players.find(p => p.local) : null);

  function myRole() {
    if (mode === 'guest') return toldRole;
    const me = localPlayer();
    return me ? roleOfSeat(me.seat) : null;
  }

  /* The card in your own pocket, or null — which is what a Faithful
     always gets. There is one card for the whole night, so the index
     callers still pass is accepted and ignored rather than made into a
     way of asking for a card that does not exist. */
  function myAgenda() {
    if (mode === 'guest') return (toldAgendas && toldAgendas[0]) || null;
    if (myRole() !== 'traitor') return null;
    return (secret.agendas && secret.agendas[0]) || null;
  }

  const alive = () => (state ? state.players.filter(p => p.alive) : []);
  const playerById = (id) => (state ? state.players.find(p => p.id === id) : null);

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
      case 'travelReady': case 'travelBoard': case 'travelSkip':
      case 'travelGather': case 'travelTick': case 'travelMove':
        moved = doTravel(action); break;
      case 'beat':    moved = doBeat(action); break;
      case 'advance': moved = doAdvance(); break;
      case 'result':  moved = doResult(action); break;
      case 'readyResult': moved = doReadyResult(action); break;
      case 'missionFinished':
        if (state.phase === 'mission' && action.authority) { state.taskClosed = true; moved = true; }
        break;
      case 'taskDone': moved = doTaskDone(action); break;
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
      default: return null;
    }
    if (moved) emit('change', state);
    return state;
  }

  // Public choreography only. No role, task or mission input belongs here.
  const TRAVEL_SECONDS = { outbound: [4, 6, 6, 8, 2, 8, 6], return: [5, 7, 8, 2, 9, 7, 8] };
  function beginTravel(direction) {
    state.travelSerial = (state.travelSerial || 0) + 1;
    state.travel = { id: state.startedAt + ':' + state.travelSerial,
      direction, destination: state.missions[state.missionAt].id,
      beat: -1, ready: [], boarded: [], gathered: [], votes: [], movement: {},
      startedAt: null, elapsed: 0, duration: 30, skip: false };
    setPhase('travel', true);
    return true;
  }
  function travelBeat(n) {
    const j = state.travel;
    j.beat = n; j.ready = []; j.startedAt = null; j.elapsed = 0;
    j.duration = n === 7 ? 30 : TRAVEL_SECONDS[j.direction][n];
    emit('travel', { id: j.id, beat: n });
  }
  function doTravel(a) {
    const j = state.travel;
    if (state.phase !== 'travel' || !j || a.journeyId !== j.id) return false;
    const p = a.playerId ? playerById(a.playerId) : localPlayer();
    if (a.type !== 'travelTick' && (!p || !p.alive)) return false;
    const all = list => alive().every(q => list.includes(q.id));
    const add = list => { if (list.includes(p.id)) return false; list.push(p.id); return true; };
    if (a.type === 'travelReady') {
      if (a.beat !== j.beat || !add(j.ready)) return false;
      if (all(j.ready) && j.startedAt === null) j.startedAt = Date.now();
      return true;
    }
    if (a.type === 'travelMove') {
      if (j.beat !== -1 && j.beat !== 7) return false;
      if (![a.x, a.z].every(Number.isFinite) || Math.abs(a.x) > 10000 || Math.abs(a.z) > 10000) return false;
      j.movement[p.id] = { x: a.x, z: a.z }; return true;
    }
    if (a.type === 'travelBoard') return j.beat === -1 && add(j.boarded);
    if (a.type === 'travelGather') return j.beat === 7 && add(j.gathered);
    if (a.type === 'travelSkip') {
      if (j.beat < 0 || j.beat >= 6 || !add(j.votes)) return false;
      j.skip = all(j.votes); return true;
    }
    if (a.type !== 'travelTick' || !a.authority || j.startedAt === null) return false;
    j.elapsed = Math.max(0, (Date.now() - j.startedAt) / 1000);
    if (j.beat === -1) {
      if (!all(j.boarded) && j.elapsed < 30) return false;
      j.boarded = alive().map(q => q.id); travelBeat(0); return true;
    }
    if (j.beat === 7) {
      if (!all(j.gathered) && j.elapsed < 30) return false;
      j.gathered = alive().map(q => q.id);
      goToStep(stepIndexOf('finale')); return true;
    }
    if (j.elapsed < j.duration) return false;
    if (j.beat === 6 && j.direction === 'outbound') {
      state.taskClosed = false; goToStep(stepIndexOf('m1')); return true;
    }
    travelBeat(j.skip && j.beat < 6 ? 6 : j.beat + 1);
    return true;
  }

  /* ---------------- the floor ----------------
     Two shapes, and the difference is the whole character of the room.

     A *turn* floor goes round the seats: one microphone, thirty
     seconds, nobody interrupts. That is the fire, where names are
     about to be said and the loudest voice must not be the one that
     decides.

     An *open* floor is the round table: every microphone live at once
     for the length of the discussion, anybody may cut in at any moment,
     and it ends when the clock runs out or everybody still in it has
     said they are finished. Nobody is banished at the table, so there
     is nothing there that needs protecting from an argument.

     Either way the clock belongs to the authority. A discussion timed
     in a player's own browser ends when their tab is throttled or their
     machine sleeps, which is precisely the moment they would rather it
     did not. Everyone else would sit there watching a countdown that
     had already stopped. */

  function doOpenFloor(a) {
    if (state.phase === 'travel') return false;
    if (state.floor && !state.floor.done && (state.floor.all || state.floor.playerId)) {
      return false;
    }
    const fallback = a.all ? TABLE_SECONDS : FLOOR_SECONDS;
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

    const order = alive().slice().sort((x, y) => x.seat - y.seat).map(p => p.id);
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
     and only the person standing up may do it. On an open floor nobody
     is holding anything, so it is not a turn being handed back — it is
     a vote to move on, and the table only moves when everybody still
     sitting at it has cast one. */
  function doYieldFloor(a) {
    const f = state.floor;
    if (!f || f.done) return false;

    if (f.all) {
      const p = a.playerId ? playerById(a.playerId) : localPlayer();
      if (!p || !p.alive) return false;
      if (f.ready.indexOf(p.id) < 0) {
        f.ready.push(p.id);
        emit('floor', { all: true, playerId: null, endsAt: f.endsAt,
                        seconds: f.seconds, ready: f.ready.slice(), done: false });
        emit('change', state);
      }
      if (alive().every(x => f.ready.indexOf(x.id) >= 0)) closeFloor();
      return false;
    }

    if (!f.playerId) return false;
    if (a.playerId && a.playerId !== f.playerId) return false;
    advanceFloor();
    return false;
  }

  /* `force` exists for one case: a night whose round table is switched
     off goes mission -> mission, and a phase change from 'mission' to
     'mission' still has to clear the floor, the barriers and the scene
     handshake or the second mission inherits the first one's. */
  function setPhase(next, force) {
    const prev = state.phase;
    if (prev === next && !force) return;
    state.phase = next;
    state.beat = 0;
    clearFloorTimer();
    state.floor = null;
    state.scene = { phase: next, ready: [], started: false };
    state.syncReady = {};
    state.syncPassed = [];
    state.exposure = null;
    state.resultReady = [];
    state.pendingResult = null;
    syncGameState();
    emit('phase', next, prev);
  }

  /* A scene begins only after all three browsers have built it. Without
     this, the fastest GPU can be a line of dialogue ahead before the
     slowest one has even installed its event listeners. */
  function doSceneReady(a) {
    const sc = state.scene || (state.scene = { phase: state.phase, ready: [], started: false });
    if (sc.phase !== state.phase || (a.phase && a.phase !== state.phase)) return false;
    if (sc.started) { emit('scene', { phase: state.phase }); return false; }
    const p = a.playerId ? playerById(a.playerId) : localPlayer();
    if (!p || sc.ready.indexOf(p.id) >= 0) return false;
    sc.ready.push(p.id);
    if (!sc.started && state.players.every(q => sc.ready.indexOf(q.id) >= 0)) {
      sc.started = true;
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
    if (state.players.every(q => ready.indexOf(q.id) >= 0)) {
      state.syncPassed.push(key);
      delete state.syncReady[key];
      emit('sync', { key });
    }
    return true;
  }

  function doBeat(a) {
    const n = Math.max(0, a.n | 0);
    if (n === state.beat) return false;
    state.beat = n;
    emit('beat', n);
    return true;
  }

  // the scene that is pure theatre ends by asking for the next phase
  function doAdvance() {
    if (state.phase === 'hill') {
      if (partOn('m1')) return beginTravel('outbound');
      return goToStep(stepIndexOf('intro') + 1);
    }
    return false;
  }

  /* A mission has finished. In real multiplayer this arrives from the
     server, not from the winner's browser — which is why the pot is
     added here rather than by whoever happened to be playing. */
  function doResult(a) {
    if (state.phase !== 'mission') return false;
    const m = state.missions[state.missionAt];
    if (!m || m.done) return false;
    const reports = Array.isArray(a.players) ? a.players : [];
    m.earned = Math.max(0, Math.round(a.earned || 0));
    m.completed = !!a.completed;
    m.done = true;
    state.pot = Math.max(0, state.pot + m.earned);
    state.debrief = buildDebrief(m, reports);
    judgeAgenda();
    GameState.logEvent('mission', `${m.name}: ${U.money(m.earned)} into the pot`, { id: m.id });
    if (partOn('finale')) beginTravel('return');
    else goToStep(stepIndexOf('m1') + 1);
    return true;
  }

  /* In a network run the board is shared but reading time is not. The
     host supplies the authoritative result; every player supplies only
     readiness. The next room opens once both facts are present. Direct
     `result` remains the solo/server seam used by tests and fallbacks. */
  function doReadyResult(a) {
    if (state.phase !== 'mission') return false;
    const p = a.playerId ? playerById(a.playerId) : localPlayer();
    if (!p || !p.alive) return false;
    let moved = false;
    if (state.resultReady.indexOf(p.id) < 0) {
      state.resultReady.push(p.id);
      moved = true;
    }
    if (a.authority) {
      state.pendingResult = {
        earned: Math.max(0, Math.round(a.earned || 0)),
        completed: !!a.completed,
        players: Array.isArray(a.players) ? a.players : [],
      };
      moved = true;
    }
    if (state.pendingResult
        && alive().every(q => state.resultReady.indexOf(q.id) >= 0)) {
      return doResult(state.pendingResult);
    }
    return moved;
  }

  /* ---------------- the board ----------------
     Everyone's numbers, side by side, and no opinion about them. It is
     public because it has to be: a task that leaves no trace anybody
     can point at is not a risk, it is a formality. What the board never
     does is accuse — it prints what happened and lets three people
     argue about what it means. */

  function buildDebrief(m, reports) {
    const byId = new Map(reports.map(r => [r.playerId, r]));
    return {
      missionId: m.id,
      missionName: m.name,
      columns: (reports[0] && reports[0].columns) || [],
      rows: state.players.map(p => {
        const r = byId.get(p.id) || {};
        return { playerId: p.id, name: p.name, seat: p.seat,
                 place: r.place || null, earned: Math.max(0, Math.round(r.earned || 0)),
                 cells: r.cells || [] };
      }).sort((x, y) => (x.place || 99) - (y.place || 99) || x.seat - y.seat),
    };
  }

  /* ---------------- the task, marked ----------------
     Nothing on this machine can hear a microphone, so nothing on this
     machine judges the card. The one person who knows marks it, on
     their own HUD, while the mission is still running — and that mark
     is what arrives here.

     Only the Traitor may send it, and only while the run it belongs to
     is still going. Both of those are the deadline rather than
     security theatre: a mark that could be sent from the fire is a
     card you get to settle up on after you have seen how the night is
     going, and the entire weight of an honour system is that you have
     to commit while you still have something to lose. */

  function doTaskDone(a) {
    if (mode !== 'host') return false;
    if (state.phase !== 'mission' || state.taskClosed) return false;
    if (!secret.has || secret.taskDone) return false;
    const p = a && a.playerId ? playerById(a.playerId) : localPlayer();
    if (!p || !p.alive || p.seat !== secret.seat) return false;
    if (!(secret.agendas || [])[0]) return false;
    secret.taskDone = true;
    /* Deliberately silent, and this is why it answers "nothing moved"
       having just moved something. Nothing went into `state`, so there
       is nothing to broadcast — and a snapshot going out at the exact
       moment somebody says the thing they were told to say is a tell
       on the wire that the other two can watch for. The Traitor's own
       chip has already answered locally; the host needed only to
       remember. */
    return false;
  }

  /* Marked here, and told to nobody. The Traitor walks into the fire
     believing they got away with it, which is the only version of this
     worth watching.

     An unmarked card is an exposure. That is the honest half of the
     bargain: a Traitor who bottled it and did not lie about it is the
     one the Faithfuls catch for free, and a Traitor who marked a card
     they never performed has to sit through the verdict panel printing
     the card, the mark, and their name, in front of the two people who
     were on the microphone with them. */

  function judgeAgenda() {
    if (mode !== 'host' || !secret.has) return;
    const card = (secret.agendas || [])[0];
    if (!card) return;
    const traitor = state.players.find(p => p.seat === secret.seat);
    if (!traitor || !traitor.alive) return;
    if (!secret.taskDone) secret.exposed = { playerId: traitor.id, card };
  }

  /* ---------------- exposure ----------------
     Claudia stops the room before anybody sits down. The reveal is an
     event, like every other role that ever escapes this file, and the
     verdict waits until the ceremony has actually played — `endGame`
     is called by `exposeDone`, not by this. */

  /* Always answers, even when the answer is "nobody". A guest that
     asked and heard nothing back cannot tell a clean night from a
     message still in flight, and would have to guess with a timer. */
  function doExpose() {
    if (mode !== 'host' || state.phase !== 'finale') return false;
    if (!secret.exposed) {
      state.exposure = { checked: true, playerId: null };
      emit('expose', { playerId: null });
      return true;
    }
    const { playerId, card } = secret.exposed;
    const p = playerById(playerId);
    if (!p || !p.alive) {
      secret.exposed = null;
      state.exposure = { checked: true, playerId: null };
      emit('expose', { playerId: null });
      return true;
    }
    secret.exposed = null;
    secret.exposedShown = playerId;
    p.alive = false;
    clearFloorTimer();
    state.floor = null;
    GameState.logEvent('expose', `${p.name} left a task unfinished`, { id: p.id });
    state.exposure = { checked: true, playerId: p.id, name: p.name,
                       agenda: card ? card.text : null,
                       tell: card ? card.tell : null };
    emit('expose', Object.assign({ role: 'traitor' }, state.exposure));
    return true;
  }

  function doExposeDone() {
    if (mode !== 'host' || !secret.exposedShown) return false;
    secret.exposedShown = null;
    endGame('agenda');
    return true;
  }

  /* ---------------- the finale ----------------
     One ballot: who. There used to be a Fire of Truth in front of it —
     end the game or banish again, unanimous to stop — which is the
     right ballot for a show where the table cannot be sure anybody is
     lying to them. There is always a Traitor here, so "shall we bother"
     was never a real question, and asking it twice a round only gave
     three people a way to end the night without playing it.

     So: everybody names somebody, the authority collects the whole
     ballot before revealing any of it, and the names are then spoken
     one at a time, so the result can never jump straight from a button
     press to a tally. Three contestants and one banishment leaves two,
     which is the closing walk. */

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

    /* Three contestants and one banishment leaves two, so on every
       real night this is the branch that runs and the closing walk
       starts here. The round below is kept for the seat count this
       file does not have yet: it costs four lines and it is the
       difference between "more seats one day" and "more seats and a
       finale that ends after the first name". A banished local player
       still watches the final pair reveal before the verdict. */
    if (alive().length <= 2) {
      /* Whose pouch this is is client-local. Store the shared reason and
         personalise it when each snapshot is installed. */
      openPouches('final-two');
      return true;
    }

    f.round++;
    f.stage = 'name';
    f.names = {};
    f.nameQueue = [];
    f.namesShown = [];
    f.nameRound = 0;
    return true;
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
    });
  }

  /* Host-only, and only ever read into an outcome that is already
     disclosing every role in the game. A night with nobody in it —
     which now only a rehearsal can deal — has nothing to print. */
  function agendaReckoning() {
    const card = (secret.agendas || [])[0];
    if (!secret.has || !card) return null;
    const traitor = state.players.find(p => p.seat === secret.seat);
    return {
      playerId: traitor ? traitor.id : null,
      name: traitor ? traitor.name : null,
      text: card.text || '',
      tell: card.tell || '',
      marked: !!secret.taskDone,
    };
  }

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
    if (me) {
      GameState.data.lastOutcomeClaim = String(state.startedAt) + ':' + me.id;
      GameState.save();
    }

    const publicOutcome = {
      won, reason, baseReason: reason, role, traitorAlive,
      hadTraitor: secret.has,
      pot: state.pot,
      banked,
      /* The reckoning. Nothing on this machine could judge a card that
         was performed on a microphone, so the verdict panel prints it
         instead: what the Traitor was told to say, and whether they
         claimed they said it. The two people who were on that
         microphone are the check, and this is the first and only
         moment they are handed what to check against. */
      agenda: agendaReckoning(),
      // the game is over: everyone's cards go face up
      roles: state.players.map(p => ({ id: p.id, name: p.name, seat: p.seat,
                                       role: roleOfSeat(p.seat), alive: p.alive,
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
    startParty, adopt, setMyRole, abandon, dispatch, on,
    myRole, myAgenda, alive, playerById,
    get isHost() { return mode === 'host'; },
    get mode() { return mode; },
    get state() { return state; },
    get active() { return !!state && state.phase !== 'verdict'; },
    get running() { return !!state; },
    // a serialised copy, which is exactly what a server would have sent
    snapshot() {
      if (!state) return null;
      const copy = JSON.parse(JSON.stringify(state));
      if (copy.phase === 'travel' && copy.travel.startedAt !== null) {
        copy.travel.elapsed = Math.max(0, (Date.now() - state.travel.startedAt) / 1000);
      }
      return copy;
    },
    TRAVEL_SECONDS,

    /* What the host has to tell each client about itself, and the one
       reason anything in here may read the role table on someone
       else's behalf. It is host-only and it is consumed by exactly one
       caller — `HostTransport`, which addresses each entry to the one
       person it belongs to. Nothing it returns ever goes in `state`. */
    privateRoles() {
      if (mode !== 'host' || !state) return [];
      return state.players.map(p => ({
        playerId: p.id,
        role: roleOfSeat(p.seat),
        agendas: roleOfSeat(p.seat) === 'traitor' ? (secret.agendas || null) : null,
      }));
    },

    // the running order, so a caller can validate a list of parts
    get PARTS() { return ALL_PARTS.slice(); },
    // whether this night was dealt by the rehearsal door rather than the seed
    get rehearsal() { return rehearsal; },

    /* Whether a ceremony is owed at the next gathering. Host-only, and
       deliberately a boolean: the name is not something a scene needs
       before the reveal it is about to play. */
    hasExposure() { return mode === 'host' && !!secret.exposed; },
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
        emit('change', state);
      }
      return state;
    },

    // test seam only: never call this from the game
    _peek() { return { has: secret.has, seat: secret.seat }; },
  };
})();
