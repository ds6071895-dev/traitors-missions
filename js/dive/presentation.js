/* ------------------------------------------------------------------
   DivePresentation — what the loch costs, and the light it is seen by.

   The Descent's arrangement (`js/ski/presentation.js`): one table of
   presets, read once at build, and a mission that puts the renderer
   back the way it found it on the way out.

   A rule the table must keep: **nothing in it may change what exists.**
   Every client in a party builds the reef from the seed, and a rock
   that one player's phone skipped is a collider the other two swim
   into. Quality is how finely the floor is cut and how much shadow
   there is — never how many things there are.
------------------------------------------------------------------ */
const DivePresentation = (() => {
  const presets = {
    /* The pixel ratio is set here, as the Descent sets its own. The
       engine's budget alone rendered the loch below native on any
       high-DPI screen, and its slow-frame fallback halves it for good
       after one compile stall on the way in. */
    low:    { rings: 84,  sectors: 128, shadow: 0,    resolution: 1   },
    medium: { rings: 120, sectors: 168, shadow: 1024, resolution: 1.5 },
    high:   { rings: 150, sectors: 208, shadow: 2048, resolution: 2   },
  };

  function resolve(q) {
    if (presets[q]) return q;
    const g = typeof GameState !== 'undefined' && GameState.settings && GameState.settings.quality;
    return presets[g] ? g : 'medium';
  }

  /* The light the Descent is seen by and the dive was not: a cold
     sky-down fill so one blue facet separates from the next, and a
     low-intensity sun whose only job is shadow. It is kept weak on
     purpose — the reef's founding rule is that the water is never
     dark, and a contact shadow under a coral head is a *shape*, not a
     darkness. Returns the shadow sun so the mission can walk it along
     with the diver. */
  function lights(scene, preset) {
    const fill = new THREE.HemisphereLight('#d6f6ff', '#2f7f9c', 0.5);
    scene.add(fill);
    const renderer = typeof Engine !== 'undefined' ? Engine.renderer : null;
    const prev = renderer ? renderer.shadowMap.enabled : false;
    const sun = new THREE.DirectionalLight('#fff1d2', 0.38);
    if (renderer) renderer.shadowMap.enabled = preset.shadow > 0;
    sun.castShadow = preset.shadow > 0;
    sun.shadow.mapSize.set(preset.shadow || 256, preset.shadow || 256);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 320 });
    sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.2;
    scene.add(sun, sun.target);
    return {
      sun, fill,
      /* Walked along with whoever is being watched, and snapped to the
         shadow map's own texels so the edges do not crawl as you swim. */
      follow(p) {
        const step = 120 / (preset.shadow || 256);
        const x = Math.round(p.x / step) * step, z = Math.round(p.z / step) * step;
        const d = typeof Sky !== 'undefined' && Sky.SUN_DIR ? Sky.SUN_DIR : { x: 0.42, y: 0.8, z: -0.4 };
        sun.position.set(x + d.x * 160, Math.max(p.y, 0) + Math.max(0.35, d.y) * 160, z + d.z * 160);
        sun.target.position.set(x, p.y, z);
      },
      restore() {
        if (renderer) renderer.shadowMap.enabled = prev;
        sun.shadow.dispose();
      },
    };
  }

  return { presets, resolve, lights };
})();
