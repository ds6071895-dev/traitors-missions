/* ------------------------------------------------------------------
   engine.js — renderer, main loop and the "view" a scene plugs into.

   The engine owns nothing about gameplay. A scene hands it a
   { scene, camera } view and an update function; the engine renders it.
------------------------------------------------------------------ */
const Engine = (() => {

  let renderer, canvas;
  let view = null;                 // { scene, camera }
  let running = false, paused = false;
  let last = 0, elapsed = 0, wallLast = null;
  const updaters = new Set();      // global updaters (run every frame)
  let onFrame = null;              // the active view's update fn
  let resolutionScale = 1, frameSeconds = 0, frameCount = 0;

  const size = { w: 1, h: 1, dpr: 1 };
  const listeners = { resize: new Set() };

  function init(canvasEl) {
    canvas = canvasEl;
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
    });
    renderer.setClearColor('#c8ebff', 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // flat, saturated colour beats filmic roll-off for this art style
    renderer.toneMapping = THREE.NoToneMapping;
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { last = 0; wallLast = null; frameSeconds = frameCount = 0; }
    });
    return renderer;
  }

  function resize() {
    const quality = GameState.settings.quality;
    const ceiling = quality === 'low' ? 1 : quality === 'medium' ? 1.25 : 1.5;
    const pixels = quality === 'low' ? 1000000 : quality === 'medium' ? 1600000 : 2400000;
    const dpr = Math.min(window.devicePixelRatio || 1, ceiling,
      Math.sqrt(pixels / Math.max(1, window.innerWidth * window.innerHeight))) * resolutionScale;
    size.w = window.innerWidth; size.h = window.innerHeight; size.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.w, size.h, false);
    if (view && view.camera) {
      view.camera.aspect = size.w / size.h;
      view.camera.updateProjectionMatrix();
    }
    listeners.resize.forEach(fn => fn(size));
  }

  function adaptResolution(seconds) {
    if (!view || paused || document.hidden || seconds <= 0 || seconds > 2) return;
    frameSeconds += seconds; frameCount++;
    if (frameSeconds < 2) return;
    const average = frameSeconds / frameCount;
    frameSeconds = frameCount = 0;
    // Reduce GPU work after sustained slow frames; keep DOM text full resolution.
    if (average > 1 / 28 && resolutionScale > .5) {
      resolutionScale = Math.max(.5, resolutionScale * .8); resize();
    } else if (average < 1 / 50 && resolutionScale < 1) {
      // and give it back once the stall has passed, or one shader
      // compile leaves every mission after it at half resolution
      resolutionScale = Math.min(1, resolutionScale * 1.25); resize();
    }
  }

  function setView(v, frameFn) {
    view = v;
    onFrame = frameFn || null;
    if (view && view.camera) {
      view.camera.aspect = size.w / size.h;
      view.camera.updateProjectionMatrix();
    }
    warm(v);
  }

  function clearView() { view = null; onFrame = null; warmUp = null; }

  /* A new view goes up to the GPU before it is drawn. Its shaders
     compile in parallel off the main thread and its textures upload a
     few at a time, while the last picture stays on screen. Drawn
     straight away, the castle's seventy textures and dozen shaders all
     land in one frame: a stall of seconds that stutters the whole
     machine, not just the tab. The scene itself keeps running, and the
     picture is held for four seconds at most. */
  let warmUp = null;
  function warm(v) {
    warmUp = null;
    if (!v || !v.scene || !v.camera || !renderer || typeof renderer.compileAsync !== 'function') return;
    const w = { view: v, textures: [], ready: false, until: performance.now() + 4000 };
    const seen = new Set();
    v.scene.traverse(o => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        for (const k in m) {
          const t = m[k];
          if (t && t.isTexture && !seen.has(t)) { seen.add(t); w.textures.push(t); }
        }
      }
    });
    try {
      renderer.compileAsync(v.scene, v.camera).then(() => { w.ready = true; }, () => { w.ready = true; });
    } catch (e) { w.ready = true; }
    warmUp = w;
  }
  // true while the view is still warming and should not be drawn yet
  function warming() {
    const w = warmUp;
    if (!w || w.view !== view) return false;
    const now = performance.now(), stop = now + 8;
    while (w.textures.length && performance.now() < stop) {
      const t = w.textures.pop();
      if (t.version > 0 && renderer.properties.get(t).__version !== t.version) renderer.initTexture(t);
    }
    if ((w.ready && !w.textures.length) || now > w.until) { warmUp = null; return false; }
    return true;
  }

  function addUpdater(fn) { updaters.add(fn); return () => updaters.delete(fn); }
  function onResize(fn) { listeners.resize.add(fn); return () => listeners.resize.delete(fn); }

  function start() {
    if (running) return;
    running = true; last = 0;
    requestAnimationFrame(loop);
  }

  function setPaused(p) { paused = p; if (!p) { last = 0; wallLast = null; } }
  function isPaused() { return paused; }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    now *= 0.001;
    if (!last) last = now;
    // clamp so an alt-tab or a stall never teleports the physics
    const wallDt = wallLast === null ? 0 : Math.max(0, now - wallLast);
    wallLast = now;
    adaptResolution(wallDt);
    const dt = Math.min(now - last, .2);
    last = now;
    // Catch up through bounded physics steps. One 10fps frame must cover the
    // same distance as six 60fps frames, while an alt-tab still stays bounded.
    const steps = Math.max(1, Math.ceil(dt / .05));
    const d = paused ? 0 : dt / steps;
    for (let i = 0; i < steps; i++) {
      elapsed += d;
      updaters.forEach(fn => fn(d, elapsed));
      if (onFrame) onFrame(d, elapsed, paused ? 0 : wallDt / steps);
    }
    if (view && !warming()) {
      renderer.render(view.scene, view.camera);
      // a second pass a scene may draw over its own frame
      if (view.after) view.after(renderer);
      if (drawnWaiters.length) drawnWaiters.splice(0).forEach(fn => fn());
    }
  }

  /* Resolves once the current view has really been drawn, warm-up and
     all, so a cover can stay up over the old picture until there is a
     new one to show. Capped, so a lost context never strands a fade. */
  const drawnWaiters = [];
  function drawn() {
    return new Promise(resolve => {
      const t = setTimeout(resolve, 5000);
      drawnWaiters.push(() => { clearTimeout(t); resolve(); });
    });
  }

  // dispose an entire subtree's GPU resources
  function disposeObject(root) {
    if (!root) return;
    root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (!m) return;
      const mats = Array.isArray(m) ? m : [m];
      for (const mm of mats) {
        for (const k in mm) {
          const v = mm[k];
          if (v && v.isTexture && !(v.userData && v.userData.estateShared)) v.dispose();
        }
        mm.dispose();
      }
    });
    if (root.parent) root.parent.remove(root);
  }

  return {
    init, start, setView, clearView, addUpdater, onResize, resize,
    setPaused, isPaused, disposeObject, drawn,
    get renderer() { return renderer; },
    get hasView() { return !!view; },
    get size() { return size; },
    get time() { return elapsed; },
  };
})();
