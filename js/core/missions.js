/* ------------------------------------------------------------------
   missions.js — mission registry + lifecycle.

   Adding a mission is one call:

     Missions.register({
       id: 'shield-wall', name: 'Shield Wall', tagline: '…',
       maxPrize: 12000, create: () => new MyMission(),
     });

   Set `enabled: false` on a definition to keep its implementation in
   place while removing it from every playable route. Switching it back
   to `true` makes it available again.

   A mission instance implements:
     build()             -> { scene, camera }   (called once, before start)
     start()                                     (countdown / go)
     update(dt, t)                               (per frame)
     dispose()                                   (free GPU + audio)
   and calls this module's onComplete callback when it finishes.
------------------------------------------------------------------ */
const Missions = (() => {

  const registry = new Map();
  let active = null, activeDef = null, activeOpts = null;
  const listeners = { complete: new Set(), exit: new Set() };

  /* Where a mission's winnings go. Practising banks straight into the
     permanent pot; a PLAY run puts them in that night's pot instead and
     only banks it if the night is survived. In multiplayer the server
     owns this, which is the shape it already has: one function, swapped
     for the duration of a run. */
  let potSink = (amount) => GameState.addToPot(amount);
  function setPotSink(fn) {
    const prev = potSink;
    potSink = fn || ((a) => GameState.addToPot(a));
    return () => { potSink = prev; };
  }

  function register(def) {
    registry.set(def.id, Object.assign({
      order: registry.size,
      enabled: true,
      locked: false,
      tagline: '',
      description: '',
      icon: '◆',
      maxPrize: 0,
      players: '1',
      duration: '',
    }, def));
  }

  function enabled(def) { return !!def && def.enabled !== false; }

  function all() {
    return [...registry.values()]
      .filter(enabled)
      .sort((a, b) => a.order - b.order);
  }

  function get(id) {
    const def = registry.get(id);
    return enabled(def) ? def : undefined;
  }

  // `opts` is whatever the mission's setup screen produced — seed, mode,
  // modifier. It is kept so "race again" can repeat the exact same run.
  function launch(id, opts) {
    if (active) end();
    const def = get(id);
    if (!def || def.locked) return null;
    activeDef = def;
    activeOpts = opts || {};
    active = def.create(activeOpts);
    if (id === 'ski') activeOpts = Object.assign({}, activeOpts, active.opts);
    active.def = def;
    const view = active.build();
    Engine.setView(view, (dt, t, wallDt) => {
      active.update(id === 'ski' && wallDt !== undefined ? wallDt : dt, t);
      Input.endFrame();
    });
    GameState.data.phase = 'mission';
    GameState.save();
    active.start();
    return active;
  }

  // called by the mission itself when the run is over
  function complete(result) {
    if (!activeDef) return;
    const def = activeDef;
    const earned = Math.max(0, Math.round(result.earned || 0));
    if (earned > 0) potSink(earned);
    const { isBest } = def.id === 'ski' && result.mode === 'practice' ? { isBest: false } : GameState.recordMission(def.id, Object.assign({ earned }, result), def.better);
    GameState.logEvent('mission', `${def.name}: ${U.money(earned)} added to the pot`, { id: def.id });
    listeners.complete.forEach(fn => fn({
      def, opts: activeOpts || {}, result: Object.assign({ earned }, result), isBest,
    }));
  }

  function end() {
    if (active) {
      try { active.dispose(); } catch (e) { console.warn(e); }
      active = null; activeDef = null;
    }
    Engine.clearView();
    GameState.data.phase = 'lobby';
    GameState.save();
  }

  function on(evt, fn) { listeners[evt].add(fn); return () => listeners[evt].delete(fn); }

  return { register, all, get, launch, complete, end, on, setPotSink,
           get active() { return active; }, get activeDef() { return activeDef; },
           get activeOpts() { return activeOpts; } };
})();
