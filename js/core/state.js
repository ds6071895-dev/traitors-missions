/* ------------------------------------------------------------------
   state.js — what survives between nights.

   The prize pot, the per-course records, the ghosts and the settings.
   Deliberately *not* the night in progress: a run is three people
   being in the same room at the same time, and there is nothing on
   this machine that could bring that back. `Session` owns the night
   and writes none of it down.

   It used to carry a twelve-person cast with roles and suspicion
   scores on it, drawn up before there was anything to play. Nothing
   ever read it, and a role field in the one file that *is* written to
   disk was a leak waiting for a careless line — so it went with the
   bots. The version is unchanged because none of it was ever used:
   an older save simply arrives with a few keys nobody asks for.
------------------------------------------------------------------ */
const GameState = (() => {

  const KEY = 'traitors.save.v1';
  const VERSION = 1;

  function fresh() {
    return {
      version: VERSION,
      createdAt: Date.now(),
      prizePot: 0,
      round: 1,
      phase: 'lobby',            // lobby | mission | roundtable | endgame
      missions: {},              // id -> { plays, completed, best:{...}, lastEarned }
      settings: { muted: false, camera: 'chase', quality: 'high' },
      log: [],                   // narrative events, for a future recap screen
    };
  }

  let data = fresh();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === VERSION) data = Object.assign(fresh(), parsed);
      }
    } catch (e) { /* corrupt or unavailable storage — start fresh */ }
    return data;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    listeners.forEach(fn => fn(data));
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function reset() { data = fresh(); save(); return data; }

  /* ---------------- prize pot ---------------- */

  function addToPot(amount) {
    data.prizePot = Math.max(0, Math.round(data.prizePot + amount));
    save();
    return data.prizePot;
  }

  /* ---------------- mission records ---------------- */

  function missionRecord(id) {
    if (!data.missions[id]) {
      data.missions[id] = { plays: 0, completed: 0, best: null, lastEarned: 0 };
    }
    return data.missions[id];
  }

  // result: { earned, completed, time, ...anything mission-specific }
  // A mission decides what "better" means via `betterFn`.
  function recordMission(id, result, betterFn) {
    const rec = missionRecord(id);
    rec.plays++;
    if (result.completed) rec.completed++;
    rec.lastEarned = result.earned || 0;
    const better = betterFn || ((a, b) => (a.earned || 0) > (b.earned || 0));
    const isBest = !rec.best || better(result, rec.best);
    if (isBest) rec.best = Object.assign({}, result);
    save();
    return { record: rec, isBest };
  }

  /* ---------------- per-course records ----------------
     A time set on the Cold Kraken in a storm at night with Glass Cannon
     running is not comparable to anything else, so a record is keyed by
     the whole setup: mode, seed and modifier. ------------------------- */

  const runKey = (mode, seed, modId) => `${mode}:${seed}:${modId || 'none'}`;

  function runRecord(id, key) {
    const rec = missionRecord(id);
    if (!rec.runs) rec.runs = {};
    if (!rec.runs[key]) rec.runs[key] = { plays: 0, best: null, medal: 0 };
    return rec.runs[key];
  }

  // result: whatever the mission wants to keep. `betterFn` decides what
  // "better" means for this mode (most money, or least time) and is asked
  // even about the very first run — a `b` of null means "nothing to beat",
  // which is not the same as "anything beats it": a time trial abandoned
  // after twelve seconds has not set a twelve-second time.
  function recordRun(id, key, result, betterFn) {
    const run = runRecord(id, key);
    run.plays++;
    const better = betterFn || ((a, b) => (a.earned || 0) > (b ? (b.earned || 0) : -1));
    const isBest = better(result, run.best);
    if (isBest) run.best = Object.assign({}, result);
    run.medal = Math.max(run.medal || 0, result.medal || 0);
    save();
    return { run, isBest };
  }

  /* ---------------- ghosts ----------------
     Kept in their own storage key: they are far bigger than the save and
     far less precious, so a quota failure here must never cost you the
     prize pot. Oldest ghosts are evicted first. */

  const GHOST_KEY = 'traitors.ghosts.v1';
  const GHOST_LIMIT = 12;
  let ghosts = null;

  function loadGhosts() {
    if (ghosts) return ghosts;
    try { ghosts = JSON.parse(localStorage.getItem(GHOST_KEY)) || {}; }
    catch (e) { ghosts = {}; }
    return ghosts;
  }

  function getGhost(id, key) {
    const g = loadGhosts()[id + '|' + key];
    return g ? g.data : null;
  }

  function saveGhost(id, key, data) {
    const g = loadGhosts();
    g[id + '|' + key] = { at: Date.now(), data };
    const keys = Object.keys(g);
    if (keys.length > GHOST_LIMIT) {
      keys.sort((a, b) => g[a].at - g[b].at);
      for (let i = 0; i < keys.length - GHOST_LIMIT; i++) delete g[keys[i]];
    }
    try { localStorage.setItem(GHOST_KEY, JSON.stringify(g)); }
    catch (e) { /* out of room — a ghost is not worth failing a run over */ }
  }

  /* ---------------- narrative hooks for later phases ---------------- */

  function logEvent(type, text, meta) {
    data.log.push({ t: Date.now(), round: data.round, type, text, meta: meta || null });
    if (data.log.length > 300) data.log.shift();
    save();
  }

  /* `assignTraitors`, `alive` and `traitors` used to live here, over a
     twelve-person cast that no run has ever used. Roles belong to
     `Session` — drawn from the seed, held in a closure, never written
     to disk — and a second, weaker copy of that idea in the file that
     *is* written to disk was an invitation. They are gone. */

  return {
    load, save, reset, subscribe,
    addToPot, missionRecord, recordMission, logEvent,
    runKey, runRecord, recordRun, getGhost, saveGhost,
    get data() { return data; },
    get prizePot() { return data.prizePot; },
    get settings() { return data.settings; },
  };
})();
