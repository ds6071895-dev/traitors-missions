/* ------------------------------------------------------------------
   state.js — what survives between nights.

   The prize pot, the settings and a short log. Deliberately *not* the
   night in progress: a run is a table of people
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
      phase: 'lobby',            // lobby | tasks | night | roundtable | endgame
      settings: { muted: false, quality: 'medium' },
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
    // the missions are gone, and so is everything they kept here
    let stale = false;
    for (const k of ['missions']) if (Object.hasOwn(data, k)) { delete data[k]; stale = true; }
    for (const k of ['setups', 'setup', 'camera']) if (data.settings && Object.hasOwn(data.settings, k)) { delete data.settings[k]; stale = true; }
    if (stale) save();
    try { localStorage.removeItem('traitors.ghosts.v1'); } catch (e) {}
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
    addToPot, logEvent,
    get data() { return data; },
    get prizePot() { return data.prizePot; },
    get settings() { return data.settings; },
  };
})();
