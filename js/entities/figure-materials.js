/* ------------------------------------------------------------------
   figure-materials.js — cloth, hair and skin for the people.

   The same arrangement as the mountain's atlas (`js/ski/materials.js`):
   one local 4x4 sheet, cut into its own canvas per tile once it lands
   so mipmaps repeat inside a material and never bleed across the grid.

   The difference is that a contestant's colours are theirs. They were
   chosen in the dressing room and have to survive the trip, so every
   tile is painted near-neutral and applied as *luminance only*,
   normalised by the tile's own average — the weave adds light and
   shade, the coat stays the colour on the swatch.

   Until the sheet loads, or if it never does, every tile is plain
   white and multiplies to nothing: a figure is never waiting on this.
------------------------------------------------------------------ */
const FigureMaterials = (() => {
  const SRC = 'assets/figure/character-materials.png';
  const TILES = {
    tweed: 0, waxed: 1, quilted: 2, fleece: 3,
    cable: 4, rib: 5, tartan: 6, corduroy: 7,
    leather: 8, suede: 9, twill: 10, neoprene: 11,
    hair: 12, wavy: 13, skin: 14, yarn: 15,
  };
  const TILE_METRES = 0.30;       // one tile across this much of a body

  const maps = {}, gain = {};
  let status = 'idle';            // idle | loading | ready | failed
  let settle;
  const settled = new Promise((res) => { settle = res; });

  const usable = () => typeof document !== 'undefined' && typeof Image !== 'undefined'
    && typeof THREE !== 'undefined' && typeof Engine !== 'undefined' && Engine.renderer;

  /* The tile's mean in linear light, so dividing by it keeps the
     average brightness of a textured coat equal to its flat colour. */
  function meanOf(ctx) {
    const px = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      sum += Math.pow(l / 255, 2.2);
    }
    return Math.max(0.05, sum / (px.length / 4));
  }

  function load() {
    if (status !== 'idle') return;
    status = 'loading';
    const img = new Image();
    img.onload = () => {
      const cell = img.width / 4;
      for (const [name, i] of Object.entries(TILES)) {
        const map = texture(name);
        const ctx = map.image.getContext('2d');
        ctx.drawImage(img, (i % 4) * cell, Math.floor(i / 4) * cell, cell, cell, 0, 0, 256, 256);
        const small = document.createElement('canvas');
        small.width = small.height = 64;
        const sctx = small.getContext('2d');
        sctx.drawImage(map.image, 0, 0, 64, 64);
        gain[name].value = 1 / meanOf(sctx);
        map.needsUpdate = true;
      }
      status = 'ready';
      settle(true);
    };
    img.onerror = () => { status = 'failed'; settle(false); };
    img.src = SRC;
  }

  function texture(name) {
    if (!maps[name]) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 256);
      const map = new THREE.CanvasTexture(canvas);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(8, Engine.renderer.capabilities.getMaxAnisotropy());
      maps[name] = map;
      gain[name] = { value: 1 };
    }
    load();
    return maps[name];
  }

  /* `strength` is how much of the weave shows: most of it on a coat,
     a breath of it on skin. */
  function material(m, tile, strength = 0.7) {
    if (!usable() || !m || m.userData.figureTile || !(tile in TILES)) return m;
    m.userData.figureTile = tile;
    m.map = texture(tile);
    const g = gain[tile];
    m.onBeforeCompile = (shader) => {
      shader.uniforms.figureGain = g;
      shader.fragmentShader = 'uniform float figureGain;\n' + shader.fragmentShader.replace(
        '#include <map_fragment>', `
        #ifdef USE_MAP
        vec4 weave = texture2D(map, vMapUv);
        float lum = dot(weave.rgb, vec3(0.2126, 0.7152, 0.0722)) * figureGain;
        diffuseColor.rgb *= mix(1.0, lum, ${strength.toFixed(2)});
        #endif`);
    };
    m.customProgramCacheKey = () => 'figure-weave-' + strength.toFixed(2);
    m.needsUpdate = true;
    return m;
  }

  /* Primitive UVs run 0..1 around a whole part, so a sleeve and a coat
     would get one tile each at wildly different sizes. Rescale each
     geometry's UVs to metres, from its own parameters and the mesh's
     own scale, so the weave is one size everywhere on the body. */
  function metric(mesh) {
    const geo = mesh.geometry, uv = geo && geo.attributes.uv;
    if (!uv || geo.userData.figureMetric) return;
    const p = geo.parameters || {}, s = mesh.scale;
    const sx = Math.max(s.x, s.z);
    let u = 0, v = 0;
    if (mesh.userData.metric) [u, v] = mesh.userData.metric;
    else switch (geo.type) {
      case 'CylinderGeometry':
        u = Math.PI * 2 * Math.max(p.radiusTop, p.radiusBottom) * sx * (p.thetaLength / (Math.PI * 2));
        v = p.height * s.y;
        break;
      case 'SphereGeometry':
        u = Math.PI * 2 * p.radius * sx * (p.phiLength / (Math.PI * 2));
        v = Math.PI * p.radius * s.y * (p.thetaLength / Math.PI);
        break;
      case 'TorusGeometry':
        u = p.radius * p.arc * sx;
        v = Math.PI * 2 * p.tube * sx;
        break;
      case 'BoxGeometry':
        u = Math.max(p.width * s.x, p.depth * s.z);
        v = p.height * s.y;
        break;
      default: return;
    }
    const ku = Math.max(0.25, u / TILE_METRES), kv = Math.max(0.25, v / TILE_METRES);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv);
    uv.needsUpdate = true;
    geo.userData.figureMetric = true;
  }

  function dress(root) {
    if (!usable()) return false;
    root.traverse((o) => {
      if (o.isMesh && o.material && o.material.userData && o.material.userData.figureTile) metric(o);
    });
    return true;
  }

  /* `settled` resolves true once the atlas is on the figures, or false
     if it never will be — which is what lets the estate's own fabric
     step in for a build that shipped without the sheet. */
  return { material, dress, TILES, settled, get ready() { return status === 'ready'; },
           get failed() { return status === 'failed'; } };
})();
