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
  let active = null, activeDef = null, activeOpts = null, resultRecorded = false;
  const prepared = new Set();
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
  // and other normal options. It is kept so "race again" can repeat the exact same run.
  function prepare(id, opts) {
    if (active || prepared.size) throw new Error('Release the current world before preparing a mission');
    const def = get(id);
    if (!def || def.locked) throw new Error('Destination unavailable: ' + id);
    let instance;
    try {
      instance = def.create(opts || {});
      instance.def = def;
      const view = instance.build();
      if (instance._camPos && view.camera) view.camera.position.copy(instance._camPos);
      if (instance._camLook && view.camera) view.camera.lookAt(instance._camLook);
      const handle = { id, def, instance, view,
        opts: id === 'ski' ? Object.assign({}, opts, instance.opts) : (opts || {}),
        status: 'prepared', dispose() { disposePrepared(handle); } };
      prepared.add(handle);
      return handle;
    } catch (error) {
      if (instance) { try { instance.dispose(); } catch (_) {} }
      throw error;
    }
  }

  function disposePrepared(handle) {
    if (!prepared.delete(handle)) return;
    handle.status = 'disposed';
    handle.instance.dispose();
  }

  function activate(handle) {
    if (!handle || handle.status !== 'prepared' || !prepared.has(handle)) return null;
    if (active) throw new Error('A mission is already active');
    prepared.delete(handle); handle.status = 'active';
    active = handle.instance; activeDef = handle.def; activeOpts = handle.opts;
    resultRecorded = false;
    const instance = active, id = handle.id;
    Engine.setView(handle.view, (dt, t, wallDt) => {
      if (active === instance) instance.update(id === 'ski' && wallDt !== undefined ? wallDt : dt, t);
      // the tutorial reads this frame's presses, so before they are cleared
      if (typeof Tutorial !== 'undefined' && active === instance && !Engine.isPaused()) Tutorial.frame(instance, dt);
      Input.endFrame();
    });
    GameState.data.phase = 'mission'; GameState.save();
    instance.start();
    if (typeof Tutorial !== 'undefined') Tutorial.missionStarted(id, instance);
    return instance;
  }

  function launch(id, opts) {
    if (!get(id) || get(id).locked) return null;
    end();
    return activate(prepare(id, opts));
  }

  // The completed mission can supply the return pickup without building
  // two worlds against the shared Sky/Water singletons.
  function releaseForTravel() {
    if (!active) return null;
    if (typeof Tutorial !== 'undefined') Tutorial.missionEnded();
    const instance = active;
    const handle = { id: activeDef.id, def: activeDef, instance,
      opts: activeOpts, view: { scene: instance.scene, camera: instance.camera },
      status: 'presentation', dispose() { disposePrepared(handle); } };
    active = null; activeDef = null; activeOpts = null;
    prepared.add(handle);
    return handle;
  }

  // called by the mission itself when the run is over
  function complete(result) {
    if (!activeDef || resultRecorded) return;
    resultRecorded = true;
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
    if (typeof Tutorial !== 'undefined') Tutorial.missionEnded();
    for (const handle of [...prepared]) disposePrepared(handle);
    if (active) {
      try { active.dispose(); } catch (e) { console.warn(e); }
      active = null; activeDef = null;
    }
    Engine.clearView();
    GameState.data.phase = 'lobby';
    GameState.save();
  }

  function on(evt, fn) { listeners[evt].add(fn); return () => listeners[evt].delete(fn); }

  return { register, all, get, prepare, activate, disposePrepared, releaseForTravel, launch, complete, end, on, setPotSink,
           get preparedCount() { return prepared.size; },
           get active() { return active; }, get activeDef() { return activeDef; },
           get activeOpts() { return activeOpts; } };
})();
