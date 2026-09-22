/* ------------------------------------------------------------------
   DiveMaterials — the loch's one atlas.

   `assets/dive/loch-materials.png` is a 4 × 4 sheet of surface scans
   (see `loch-materials.prompt.txt` beside it). Each cell is cropped
   into its own repeating canvas, so mipmaps repeat inside a material
   and can never bleed across the grid — the same arrangement as the
   mountain's atlas (`js/ski/materials.js`), with the quality tiers and
   the error handling of the boat's and the woodland's.

   Two rules the rest of the file hangs off:

   - **Grain, never colour.** Every surface in the loch is painted by
     hand in `reef.js` and every one of those colours is premultiplied
     to survive a renderer with no tone mapping. The atlas multiplies
     over the top of them, normalised by each tile's own mean, so a
     textured seabed has exactly the brightness of the untextured one.
   - **Nothing waits for it.** A tile is a white canvas until the sheet
     arrives, and white is the identity of a multiply — so a missing or
     slow download is a loch without grain, never a black one.
------------------------------------------------------------------ */
const DiveMaterials = (() => {
  const SRC = 'assets/dive/loch-materials.png';
  const TILES = {
    sand: 0, maerl: 1, silt: 2, bedrock: 3,
    coral: 4, coralline: 5, kelp: 6, barnacle: 7,
    steel: 8, hullPaint: 9, timber: 10, iron: 11,
    shingle: 12, machair: 13, heather: 14, granite: 15,
  };

  const low = () => typeof GameState !== 'undefined' && GameState.settings
                    && GameState.settings.quality === 'low';

  const maps = {};           // id -> CanvasTexture, one per tile, shared by every material
  const gains = {};          // id -> { value } uniform: 1 / the tile's mean, in linear light
  let started = false, loaded = false, failed = false;

  function texture(id) {
    if (!Object.hasOwn(TILES, id)) id = 'sand';
    if (!maps[id]) {
      const size = low() ? 128 : 256;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const cx = canvas.getContext('2d');
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, size, size);
      const t = new THREE.CanvasTexture(canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      const r = typeof Engine !== 'undefined' && Engine.renderer;
      t.anisotropy = r ? Math.min(low() ? 2 : 8, r.capabilities.getMaxAnisotropy()) : 1;
      /* Survives `Engine.disposeObject(scene)`: the tile belongs to this
         module, not to the scene that borrowed it, and a dispose on every
         dive would re-upload sixteen textures on the next one. */
      t.userData.diveShared = true;
      maps[id] = t;
      gains[id] = { value: 1 };
    }
    load();
    return maps[id];
  }

  function gain(id) { texture(id); return gains[Object.hasOwn(TILES, id) ? id : 'sand']; }

  // sRGB byte -> linear, for the mean the shader will actually see
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

  function load() {
    if (started || typeof Image === 'undefined') return;
    started = true;
    const img = new Image();
    img.onerror = () => { failed = true; };
    img.onload = () => {
      const cell = img.width / 4;
      for (const [id, i] of Object.entries(TILES)) {
        const t = texture(id), canvas = t.image, cx = canvas.getContext('2d');
        // two pixels in from each edge: a generated sheet always has a
        // hairline where two cells meet, and it repeats as a grid line
        cx.drawImage(img, (i % 4) * cell + 2, Math.floor(i / 4) * cell + 2,
                     cell - 4, cell - 4, 0, 0, canvas.width, canvas.height);
        let sum = 0;
        try {
          const d = cx.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let p = 0; p < d.length; p += 16) {
            sum += 0.2126 * lin(d[p]) + 0.7152 * lin(d[p + 1]) + 0.0722 * lin(d[p + 2]);
          }
          sum /= d.length / 16;
        } catch (e) { sum = 0; }
        gains[id].value = sum > 0.02 ? U.clamp(1 / sum, 0.6, 6) : 1;
        t.needsUpdate = true;
      }
      loaded = true;
    };
    img.src = SRC;
  }

  /* ---------------- the shader side ----------------

     `chunk(recipe)` returns the uniforms and GLSL for one recipe, for
     `ReefKit.causticMaterial` to splice into the program it already
     compiles — so the loch is still one patched program per material,
     not a second patch fighting the first for `onBeforeCompile`.

     A recipe names the tiles it samples and the GLSL that mixes them.
     Everything it can read:
       vReefPos    world position
       vReefN      world normal
       vReefLocal  object-space position (for things that sway)
       vColor      the vertex / instance colour, when there is one
     and it must leave the result in `vec3 detail` (1.0 = no change). */
  const RECIPES = {
    /* The floor is five materials in one draw: sand by default, coral
       wherever the paint already put coral, bedrock on anything steep,
       shingle along the tideline and turf, then granite, up the hill. */
    floor: {
      tiles: ['sand', 'coral', 'bedrock', 'shingle', 'machair', 'granite'],
      strength: 0.62,
      glsl: `
        float land = smoothstep(-1.4, 1.2, vReefPos.y);
        float beach = land * (1.0 - smoothstep(2.6, 7.5, vReefPos.y));
        float high = land * smoothstep(150.0, 330.0, vReefPos.y);
        float steep = 1.0 - smoothstep(0.58, 0.86, abs(vReefN.y));
        vec2 top = vReefPos.xz;
        vec3 detail = TILE_TOP(sand, top / 7.0);
        #ifdef USE_COLOR
          float hi = max(vColor.r, max(vColor.g, vColor.b));
          float sat = (hi - min(vColor.r, min(vColor.g, vColor.b))) / max(hi, 0.001);
          detail = mix(detail, TILE_TOP(coral, top / 5.0), smoothstep(0.34, 0.62, sat) * (1.0 - land));
        #endif
        detail = mix(detail, TILE_TOP(shingle, top / 4.0), beach);
        detail = mix(detail, TILE_TOP(machair, top / 9.0), land * (1.0 - beach));
        detail = mix(detail, TILE_TOP(granite, top / 22.0), high);
        vec3 rock = mix(TILE_TRI(bedrock, 9.0), TILE_TRI(granite, 16.0), land);
        detail = mix(detail, rock, steep);`,
    },
    // boulders and coral heads: rock, grown over where the paint is bright
    rock: {
      tiles: ['bedrock', 'coral', 'barnacle'],
      strength: 0.72,
      glsl: `
        vec3 detail = TILE_TRI(bedrock, 5.0);
        #ifdef USE_COLOR
          float hi = max(vColor.r, max(vColor.g, vColor.b));
          float sat = (hi - min(vColor.r, min(vColor.g, vColor.b))) / max(hi, 0.001);
          detail = mix(detail, TILE_TRI(coral, 3.0), smoothstep(0.30, 0.60, sat));
        #endif
        detail = mix(detail, TILE_TRI(barnacle, 2.5), smoothstep(0.7, 0.95, vReefN.y) * 0.45);`,
    },
    cave: {
      tiles: ['bedrock', 'silt'],
      strength: 0.75,
      glsl: `
        vec3 detail = mix(TILE_TRI(bedrock, 5.0), TILE_TRI(silt, 6.0),
                          smoothstep(0.75, 0.95, vReefN.y));`,
    },
    /* The wreck picks its tile off its own paint, the way the mountain's
       pines pick bark or frost: the timber is the dark brown, the rust is
       the warm one, and everything else is the hull's painted plate. */
    wreck: {
      tiles: ['hullPaint', 'steel', 'timber', 'barnacle'],
      strength: 0.8,
      glsl: `
        vec3 detail = TILE_TRI(hullPaint, 4.0);
        #ifdef USE_COLOR
          float lum = dot(vColor.rgb, vec3(0.299, 0.587, 0.114));
          if (vColor.r > vColor.g * 1.18 && lum > 0.12) detail = TILE_TRI(steel, 3.0);
          else if (vColor.r >= vColor.g && lum <= 0.12) detail = TILE_TRI(timber, 2.5);
        #endif
        detail = mix(detail, TILE_TRI(barnacle, 2.0), smoothstep(0.8, 0.98, vReefN.y) * 0.5);`,
    },
    // things that sway sample in their own space, or the grain would slide
    kelp: {
      tiles: ['kelp'],
      strength: 0.7,
      glsl: `vec3 detail = TILE_TOP(kelp, vec2(vReefLocal.x + vReefLocal.z, vReefLocal.y) / 1.6);`,
    },
    fan: {
      tiles: ['coralline'],
      strength: 0.55,
      glsl: `vec3 detail = TILE_TOP(coralline, vec2(vReefLocal.x + vReefLocal.z, vReefLocal.y) / 1.2);`,
    },
  };

  function chunk(name) {
    const r = RECIPES[name];
    if (!r || typeof document === 'undefined') return null;
    const uniforms = {};
    let decl = '';
    for (const id of r.tiles) {
      uniforms['uDiveTile_' + id] = { value: texture(id) };
      uniforms['uDiveGain_' + id] = gain(id);
      decl += `uniform sampler2D uDiveTile_${id}; uniform float uDiveGain_${id};\n`;
    }
    /* Low quality projects everything from above: one fetch per tile
       rather than three, and the only surfaces it gets wrong are cliffs
       nobody on a phone is looking at closely. */
    const tri = !low();
    decl += `
      vec3 diveTop(sampler2D t, float g, vec2 uv) { return texture2D(t, uv).rgb * g; }
      vec3 diveTri(sampler2D t, float g, vec3 p, vec3 n, float s) {
        ${tri ? `vec3 w = pow(abs(n), vec3(4.0)); w /= max(dot(w, vec3(1.0)), 0.001);
        return (texture2D(t, p.zy / s).rgb * w.x + texture2D(t, p.xz / s).rgb * w.y
              + texture2D(t, p.xy / s).rgb * w.z) * g;`
        : `return texture2D(t, p.xz / s).rgb * g;`}
      }`;
    const body = r.glsl
      .replace(/TILE_TOP\((\w+),\s*/g, (m, id) => `diveTop(uDiveTile_${id}, uDiveGain_${id}, `)
      .replace(/TILE_TRI\((\w+),\s*([\d.]+)\)/g,
               (m, id, s) => `diveTri(uDiveTile_${id}, uDiveGain_${id}, vReefPos, vReefN, ${s})`);
    const apply = `
      {
        ${body}
        diffuseColor.rgb *= mix(vec3(1.0), clamp(detail, 0.0, 2.2), ${r.strength.toFixed(2)});
      }`;
    return { uniforms, decl, apply, key: name + (tri ? 't' : 'p') };
  }

  /* For the handful of plain Lambert/Standard materials outside the
     reef — the shore boulders, the chests — the mountain's approach:
     patch the material in place, keep its colour, add the grain. */
  function patch(mat, id, metres = 2) {
    if (!mat || mat.userData.diveTile || typeof document === 'undefined') return mat;
    mat.userData.diveTile = id;
    const map = texture(id), g = gain(id);
    const before = mat.onBeforeCompile;
    mat.onBeforeCompile = function (sh, renderer) {
      if (before) before.call(this, sh, renderer);
      sh.uniforms.uDivePatch = { value: map };
      sh.uniforms.uDivePatchGain = g;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDivePos; varying vec3 vDiveN;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          #ifdef USE_INSTANCING
            vDivePos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          #else
            vDivePos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          #endif
          vDiveN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uDivePatch; uniform float uDivePatchGain;
          varying vec3 vDivePos; varying vec3 vDiveN;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            vec3 w = pow(abs(vDiveN), vec3(4.0)); w /= max(dot(w, vec3(1.0)), 0.001);
            vec3 detail = (texture2D(uDivePatch, vDivePos.zy / ${metres.toFixed(2)}).rgb * w.x
                         + texture2D(uDivePatch, vDivePos.xz / ${metres.toFixed(2)}).rgb * w.y
                         + texture2D(uDivePatch, vDivePos.xy / ${metres.toFixed(2)}).rgb * w.z)
                         * uDivePatchGain;
            diffuseColor.rgb *= mix(vec3(1.0), clamp(detail, 0.0, 2.2), 0.7);
          }`);
    };
    // the scale is baked into the source, so it has to be in the key
    const key = mat.customProgramCacheKey.bind(mat);
    mat.customProgramCacheKey = () => key() + '|dive-' + id + '@' + metres;
    mat.needsUpdate = true;
    return mat;
  }

  const preload = () => { load(); };

  return { TILES, RECIPES, SRC, texture, gain, chunk, patch, preload,
           get ready() { return loaded; }, get failed() { return failed; } };
})();
