/* ------------------------------------------------------------------
   engine.js — renderer, main loop and the "view" a mission plugs into.

   The engine owns nothing about gameplay. A mission hands it a
   { scene, camera } view and an update function; the engine renders it.
   That keeps missions completely independent of one another — a
   round-table scene and a boat race have nothing in common but this.
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
    }
  }

  function setView(v, frameFn) {
    view = v;
    onFrame = frameFn || null;
    if (view && view.camera) {
      view.camera.aspect = size.w / size.h;
      view.camera.updateProjectionMatrix();
    }
  }

  function clearView() { view = null; onFrame = null; }

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
    if (view) renderer.render(view.scene, view.camera);
  }

  // handy for missions: dispose an entire subtree's GPU resources
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
          if (v && v.isTexture && !(v.userData && (v.userData.estateShared || v.userData.shootoutShared))) v.dispose();
        }
        mm.dispose();
      }
    });
    if (root.parent) root.parent.remove(root);
  }

  return {
    init, start, setView, clearView, addUpdater, onResize, resize,
    setPaused, isPaused, disposeObject,
    get renderer() { return renderer; },
    get hasView() { return !!view; },
    get size() { return size; },
    get time() { return elapsed; },
  };
})();
