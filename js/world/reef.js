/* ------------------------------------------------------------------
   reef.js — the sunlit loch floor, and the light in it.

   The one rule this file exists to enforce: **the water is never
   dark.** Depth is dangerous, and it says so in colour and in
   pressure, not by taking the light away. A player who cannot see is
   not being threatened, they are being inconvenienced, and forty
   metres of murk is the fastest way to make a dive feel like a chore
   rather than a nerve.

   So the hour is always noon — the brightest light rig in the game —
   and everything below is arranged around three things it can do:

     * one depth ramp, driving fog colour, fog distance, caustic
       strength and vignette together, whose deep end is a *saturated*
       blue rather than a dark one
     * caustics, as a single `onBeforeCompile` patch shared by the
       seabed, the wreck, the rock and the kelp, so the whole floor is
       lit by the same moving lens for the cost of one program
     * the surface overhead, which the water shader now draws from
       underneath, doing the work a skybox would otherwise do

   The geography is a radial ramp with a lot of noise on it: shelf in
   the middle, the wreck on the slope, the trench out at the rim. Which
   tier you are working is therefore *where you are*, and the swim out
   to the deep water is a real decision made on a real clock.
------------------------------------------------------------------ */
const ReefKit = (() => {

  /* ---------------- palette ----------------
     Every one of these is a bright colour. The trench blue is darker
     than the shelf turquoise in hue, not in luminance. */
  const COL = {
    sand:      new THREE.Color('#e6d9a8'),
    sandWet:   new THREE.Color('#c9c089'),
    sandDeep:  new THREE.Color('#8fae9e'),
    silt:      new THREE.Color('#a9bfb2'),
    coral:     new THREE.Color('#ff8f6a'),
    coralPink: new THREE.Color('#ff9fd0'),
    coralGold: new THREE.Color('#ffd166'),
    weed:      new THREE.Color('#2f8f6a'),
    weedDeep:  new THREE.Color('#1f6f78'),
    kelp:      new THREE.Color('#3aa06a'),
    kelpGold:  new THREE.Color('#a8c452'),
    rock:      new THREE.Color('#6f7f8c'),
    rockDark:  new THREE.Color('#41525f'),
    hull:      new THREE.Color('#5a6b6e'),
    hullRust:  new THREE.Color('#8a5a3c'),
    hullWeed:  new THREE.Color('#3f7f5f'),
    timber:    new THREE.Color('#4a3b2c'),

    /* ---- and the half of the loch that is not underwater ----
       The shore is lit by the same noon rig as the water, so it is
       painted in the same register: bright, saturated, nothing muddy.
       Shingle at the tideline, machair above it, then heather and bare
       rock as the hill gets its head above the weather. */
    shingle:   new THREE.Color('#cfc4a6'),
    shingleWet:new THREE.Color('#9a9078'),
    grass:     new THREE.Color('#6fd06a'),
    grassLit:  new THREE.Color('#a8e878'),
    grassDeep: new THREE.Color('#3f9a56'),
    heather:   new THREE.Color('#9a6fc4'),
    bracken:   new THREE.Color('#c39a4e'),
    land:      new THREE.Color('#79808e'),
    landDark:  new THREE.Color('#5b6270'),
    snow:      new THREE.Color('#f3fbff'),
  };

  /* The three bands, and everything that changes between them. This
     table *is* the depth ramp — the mission lerps through it every
     frame against the camera's own depth and hands the result to the
     fog, the water and the vignette. */
  const BANDS = [
    /* `at` is a height, not a depth, so the first entry can legitimately
       be *above* the water: the ramp has to keep going once your head is
       out or breaking the surface changes nothing on screen, which is
       precisely the bug that made a gasp look like drowning. */
    { id: 'air',    at: 3,
      fog: '#c8ebff', near: 240, far: 2600, caustic: 0.00, vignette: 0.00, air: 1 },
    { id: 'shelf',  at: 0,
      fog: '#5fe6e0', near: 22, far: 260, caustic: 1.00, vignette: 0.00, air: 0 },
    { id: 'wreck',  at: -22,
      fog: '#2ec6dd', near: 18, far: 200, caustic: 0.55, vignette: 0.35, air: 0 },
    { id: 'trench', at: -46,
      fog: '#1f7ee0', near: 14, far: 150, caustic: 0.22, vignette: 0.80, air: 0 },
  ];
  // the three that are actually underwater, for anything reading tiers
  const WET = BANDS.slice(1);

  /* Where the depth ramp has got to at a given depth, as one object.
     Reused every frame, so it writes into `out` rather than allocating.
     A *negative* depth is a camera with its lens out of the water, and
     the ramp carries on through the surface into the air band rather
     than clamping at it — that continuity is the whole surface break. */
  const _fogA = new THREE.Color(), _fogB = new THREE.Color();
  function bandAt(depth, out) {
    const o = out || { colour: new THREE.Color(), near: 0, far: 0,
                       caustic: 0, vignette: 0, air: 0 };
    const y = U.clamp(-depth, BANDS[BANDS.length - 1].at, BANDS[0].at);
    let i = 0;
    while (i < BANDS.length - 2 && y < BANDS[i + 1].at) i++;
    const a = BANDS[i], b = BANDS[i + 1];
    const t = U.clamp((y - a.at) / (b.at - a.at), 0, 1);
    _fogA.set(a.fog); _fogB.set(b.fog);
    o.colour.copy(_fogA).lerp(_fogB, t);
    o.near = U.lerp(a.near, b.near, t);
    o.far = U.lerp(a.far, b.far, t);
    o.caustic = U.lerp(a.caustic, b.caustic, t);
    o.vignette = U.lerp(a.vignette, b.vignette, t);
    o.air = U.lerp(a.air, b.air, t);
    return o;
  }

  /* =============== noise, borrowed rather than re-derived =============== */
  const noise2 = (x, z, s) => ForestKit.noise2(x, z, s);
  const fbm2 = (x, z, o, s) => ForestKit.fbm2(x, z, o, s);

  /* =============== the floor, as a function =============== */

  /* Shelf in the middle, slope through the wreck, trench at the rim —
     with enough noise on top that no two seeds give the same gullies,
     and a guaranteed flat pad at the origin so the boat has somewhere
     to sit. Everything downstream (chest placing, kelp, the swimmer's
     collision) asks this and never the mesh. */
  /* The shore, as the four numbers everything downstream needs: which
     way inland is, and how far up the beach the landing sits. Exported
     because `makeFloor` cannot be called without one, and a test that
     had to write out `Math.sin(ang)` itself would be asserting against
     its own copy of the convention rather than against this one. */
  function shoreFor(ang, landAt = 7) {
    return { ang, nx: Math.sin(ang), nz: Math.cos(ang), landAt };
  }

  function makeFloor(rng, o) {
    const s1 = rng() * 900, s2 = rng() * 900, s3 = rng() * 900;
    const s4 = rng() * 900, s5 = rng() * 900, s6 = rng() * 900;
    const R = o.radius;
    // where the canyon runs: a chord across the reef, so the trench is
    // reachable from more than one bearing
    const cutA = rng() * Math.PI * 2;
    const cutOff = U.lerp(-0.35, 0.35, rng()) * R;
    const cutW = U.lerp(26, 40, rng());
    const cutDeep = U.lerp(6, 11, rng());

    /* ---------------- the shore ----------------

       The loch has a side you can stand on. `shore.n` points inland, so
       `e` — how far inland a point is, in metres — is one dot product,
       and every part of the coast is a function of that single number:
       shelving sand below zero, a shingle bank you jump off just above
       it, machair, hillside, and the highland shoulder behind.

       The coastline wanders, because a ruler-straight beach reads as a
       wall. It stops wandering within fifty metres of the landing, so
       the one part of it the player actually stands on is a clean flat
       platform in every seed rather than whatever the noise felt like. */
    const sh = o.shore || shoreFor(0);
    const nx = sh.nx, nz = sh.nz;
    const LAND_AT = sh.landAt;        // metres inland of the tideline you stand at

    /* Two dot products and, only if they land anywhere near the beach,
       one octave stack. Everything in this file calls `heightAt` in
       five-figure quantities — the seabed mesh, every chest that has to
       find a depth band, every tree that has to find a hillside — so
       the cheap test comes first and the noise is never evaluated for a
       point out in the middle of the loch. */
    const _pt = { e: 0, along: 0 };
    function coastE(x, z) {
      const s = x * nx + z * nz;                 // inland, in metres
      _pt.along = -x * nz + z * nx;              // along the beach, in metres
      if (s < -140) { _pt.e = s; return _pt; }
      const wob = fbm2(_pt.along * 0.0062, 11, 3, s6) * 30
                * U.smoothstep(34, 150, Math.abs(_pt.along));
      _pt.e = s + wob;
      return _pt;
    }

    function coastH(e) {
      if (e <= 0) return -0.75 + e * 0.19;       // shelving sand, waded not swum
      return -0.75
        + U.smoothstep(0, 8, e) * 3.4            // the shingle bank you jump off
        + U.smoothstep(12, 130, e) * 38          // machair, rising
        + U.smoothstep(90, 430, e) * 165         // the hillside
        + U.smoothstep(330, 900, e) * 430;       // and the highland behind it
    }

    return function heightAt(x, z) {
      /* Which half of the loch is this? The shore blend decides, and it
         decides first, because the two halves are expensive in
         completely different ways and almost no point needs both. */
      const shorePt = coastE(x, z);
      const e = shorePt.e, coastAlong = shorePt.along;
      const w = U.smoothstep(-78, -10, e);

      if (w >= 1) {
        let land = coastH(e);
        if (e > 0) {
          // the hill is not a ramp: two octaves of relief, gated so the
          // beach itself stays walkable and only the ground behind rolls
          land += fbm2(x * 0.0135, z * 0.0135, 4, s4) * U.smoothstep(6, 70, e) * 15
                + fbm2(x * 0.052, z * 0.052, 3, s5) * U.smoothstep(2, 34, e) * 2.6;
        }
        const padK = (1 - U.smoothstep(9, 26, Math.abs(coastAlong)))
                   * (1 - U.smoothstep(2.5, 9.5, Math.abs(e - LAND_AT)));
        return U.lerp(land, coastH(LAND_AT), padK * 0.85);
      }

      const r = Math.hypot(x, z);
      const t = U.clamp(r / R, 0, 1.25);
      /* Three terraces rather than a cone. The band widths are chosen
         against the chest counts, so the cheap tier is the one you are
         most often floating over and the trench is a rim you have to
         go and find. */
      const ramp = -(9
        + U.smoothstep(0.00, 0.50, t) * 5           // the shelf, barely tilted
        + U.smoothstep(0.50, 0.86, t) * 18          // the slope, and the wreck on it
        + U.smoothstep(0.84, 1.04, t) * 14);        // the drop into the trench

      // dunes and gullies
      const dune = fbm2(x * 0.0125, z * 0.0125, 4, s1) * 4.6
                 + fbm2(x * 0.041, z * 0.041, 3, s2) * 1.5;
      // coral heads: sparse, tall, and what makes the shelf a place
      const heads = Math.pow(Math.max(0, fbm2(x * 0.028, z * 0.028, 2, s3)), 2.4) * 9.5
                  * (1 - U.smoothstep(0.30, 0.72, t));

      /* The canyon: a trough cut across the reef, which is the fast
         way out to the deep water and the reason two seeds do not play
         the same. It fades out before the rim, so it is a *route* to
         the trench rather than a second one. */
      const along = x * Math.cos(cutA) + z * Math.sin(cutA);
      const across = -x * Math.sin(cutA) + z * Math.cos(cutA) - cutOff;
      const cut = -cutDeep * (1 - U.smoothstep(0, cutW, Math.abs(across)))
                * U.smoothstep(0.18, 0.5, Math.abs(along) / R + 0.2)
                * (1 - U.smoothstep(0.72, 1.0, t));

      // nothing on this reef is deeper than a diver can come back from
      const sea = Math.max(ramp + dune + heads + cut, -52);
      if (w <= 0) return sea;

      /* ---- and then the shore takes over.
         The blend is wide (seventy metres) so the loch shelves into the
         beach instead of ending at a step, and it is driven by distance
         from the tideline rather than by radius, which is what lets the
         reef stay a disc around the origin while the land is a coast. */
      let land = coastH(e);
      if (e > 0) {
        land += fbm2(x * 0.0135, z * 0.0135, 4, s4) * U.smoothstep(6, 70, e) * 15
              + fbm2(x * 0.052, z * 0.052, 3, s5) * U.smoothstep(2, 34, e) * 2.6;
      }
      /* The landing itself: a flat shingle platform, in every seed. It
         is deliberately asymmetric — it flattens the ground you stand
         on and stops before the water, because a pad that reached into
         the loch would push the tideline out and there would be nowhere
         to come ashore. */
      const padK = (1 - U.smoothstep(9, 26, Math.abs(coastAlong)))
                 * (1 - U.smoothstep(2.5, 9.5, Math.abs(e - LAND_AT)));
      land = U.lerp(land, coastH(LAND_AT), padK * 0.85);

      return U.lerp(sea, land, w);
    };
  }

  /* =============== the caustic patch =============== */

  /* Two crossed noise fields at different speeds, multiplied. One
     field is a texture; two moving against each other is a lens, and
     that difference is the entire effect. Patched into whatever
     Lambert it is given, in the same style as ForestKit.windMaterial,
     so seabed, rock, wreck and kelp all catch the same light from one
     compiled program rather than five. */
  function causticMaterial(uniforms, opts = {}) {
    const mat = new THREE.MeshLambertMaterial(Object.assign(
      { vertexColors: true, flatShading: opts.flat !== false }, opts.mat || {}));
    const key = 'caus' + (opts.gain || 1).toFixed(2) + (opts.sway ? 's' + opts.sway : '')
              + (opts.swash ? 'w' + opts.swash : '');
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCausT = uniforms.time;
      sh.uniforms.uCausGain = uniforms.caustic;
      sh.uniforms.uCurrent = uniforms.current;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uCausT; uniform vec3 uCurrent;
          varying vec3 vReefPos; varying float vUpFacing;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 iPos = vec3(0.0);
          #endif
          ${opts.sway ? `
          // the current, doing to kelp what wind does to grass
          float sway = smoothstep(0.0, SWAY_HI, transformed.y) * uCurrent.z * SWAY_GAIN;
          float ph = iPos.x * 0.08 + iPos.z * 0.06;
          float w = sin(uCausT * 0.85 + ph) * 0.66 + sin(uCausT * 1.7 + ph * 1.7) * 0.34;
          transformed.xz += uCurrent.xy * sway * w;` : ''}
          vec4 cw = modelMatrix * vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            cw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #endif
          vReefPos = cw.xyz;
          vUpFacing = max(normalize(mat3(modelMatrix) * objectNormal).y, 0.0);`)
        .replace(/SWAY_HI/g, (opts.sway || 1).toFixed(2))
        .replace(/SWAY_GAIN/g, (opts.swayGain || 1).toFixed(2));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uCausT; uniform float uCausGain;
          varying vec3 vReefPos; varying float vUpFacing;
          float rhash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float rnoise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = rhash(i), b = rhash(i + vec2(1.0, 0.0));
            float c = rhash(i + vec2(0.0, 1.0)), d = rhash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          {
            /* Two crossed fields at different speeds. One is a texture;
               two moving against each other is a lens. It stops dead at
               the tideline, because a hillside lit by ripples is the
               fastest way to tell somebody this is not a real place. */
            float wet = 1.0 - smoothstep(-1.6, 0.35, vReefPos.y);
            float c1 = rnoise(vReefPos.xz * 0.22 + vec2(uCausT * 0.10,  uCausT * 0.07));
            float c2 = rnoise(vReefPos.xz * 0.35 - vec2(uCausT * 0.13, -uCausT * 0.09));
            float caus = pow(max(c1 * c2, 0.0), 2.2) * uCausGain * vUpFacing * GAIN * wet;
            gl_FragColor.rgb += vec3(0.55, 0.95, 0.90) * caus * 1.6;

            /* The swash: a bright wet band that breathes up and down the
               shingle on the swell, so the beach meets the water instead
               of simply ending at it. Cheap, and it is the single line
               that sells the tideline. */
            float tide = sin(uCausT * 0.55) * 0.22 + cos(uCausT * 0.31) * 0.10;
            // written ascending on purpose: GLSL leaves smoothstep undefined
            // when edge0 >= edge1, however reliably drivers happen to do it
            float band = 1.0 - smoothstep(0.05, 0.9, abs(vReefPos.y - tide - 0.05));
            float lace = rnoise(vReefPos.xz * 0.5 + vec2(uCausT * 0.25, 0.0));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.93, 0.99, 1.0),
                                   band * vUpFacing * (0.20 + 0.34 * lace) * SWASH);
          }`)
        .replace(/SWASH/g, (opts.swash === undefined ? 0 : opts.swash).toFixed(2))
        .replace(/GAIN/g, (opts.gain === undefined ? 1 : opts.gain).toFixed(2));
    };
    // two materials that compile different code must not share a cache key
    mat.customProgramCacheKey = () => key;
    return mat;
  }

  /* =============== the seabed mesh =============== */

  function buildFloor(heightAt, rng, o) {
    const RINGS = 62, SECTORS = 104;
    const pos = [], col = [];
    const c = new THREE.Color();
    const fog = new THREE.Color(Sky.look ? Sky.look.fog : '#c8ebff');
    const sh = o.shore || shoreFor(0);

    /* How far the disc reaches on a given bearing. Seaward it only has
       to out-run the fog; inland it has to carry an entire hillside, so
       it reaches five times as far that way. One mesh covers both,
       which is what keeps the tideline a single continuous surface
       rather than two sheets fighting over the same metre of sand. */
    const reachAt = (a) => {
      const inland = Math.max(0, Math.sin(a) * sh.nx + Math.cos(a) * sh.nz);
      return o.radius * U.lerp(1.55, 5.4, Math.pow(inland, 1.15));
    };
    const radiusAt = (t, a) => reachAt(a) * (t * t * 0.78 + t * 0.22);

    /* ---- underwater paint: pale sand on the shelf, going green-grey as
       it falls away, with coral picked out on the shallow humps ---- */
    const paintSea = (x, y, z, slope) => {
      const r = Math.hypot(x, z);
      const t = U.clamp(r / o.radius, 0, 1);
      const n = fbm2(x * 0.03, z * 0.03, 3, 5);
      c.copy(COL.sand)
        .lerp(COL.sandWet, U.clamp(n * 0.5 + 0.4, 0, 1) * 0.7)
        .lerp(COL.sandDeep, U.smoothstep(0.28, 0.70, t))
        .lerp(COL.silt, U.smoothstep(0.66, 1.0, t) * 0.8)
        .lerp(COL.weed, U.clamp(fbm2(x * 0.06, z * 0.06, 2, 31) * 0.6 + 0.15, 0, 0.55))
        .lerp(COL.rock, U.smoothstep(0.55, 1.4, slope));
      if (t < 0.42) {
        const cor = Math.max(0, fbm2(x * 0.09, z * 0.09, 2, 71));
        c.lerp(cor > 0.28 ? COL.coral : COL.coralPink,
               U.smoothstep(0.20, 0.60, cor) * 0.55 * (1 - U.smoothstep(0.22, 0.45, t)));
      }
      const patch = fbm2(x * 0.16, z * 0.16, 2, 77);
      c.offsetHSL(patch * 0.014, patch * 0.06, patch * 0.05);
    };

    /* ---- and above the tideline. Wet shingle, dry shingle, machair,
       bracken, heather, bare rock, and snow on the tops. It is a long
       ramp on purpose: the whole point of a highland is that it keeps
       changing colour all the way up. ---- */
    const paintLand = (x, y, z, slope) => {
      const n = fbm2(x * 0.019, z * 0.019, 3, 11);
      const patch = fbm2(x * 0.105, z * 0.105, 2, 71);
      c.copy(COL.shingleWet)
        .lerp(COL.shingle, U.smoothstep(-0.2, 1.4, y))
        .lerp(COL.grass, U.smoothstep(1.8, 7.5, y))
        // the light catches the tops of the rolls and misses the hollows
        .lerp(COL.grassLit, U.clamp(n * 0.55 + 0.42, 0, 1)
                            * U.smoothstep(3, 14, y) * 0.66)
        .lerp(COL.grassDeep, U.smoothstep(0.30, 0.95, slope) * 0.6)
        .lerp(COL.bracken, U.clamp(fbm2(x * 0.031, z * 0.031, 2, 57) * 0.62, 0, 0.30)
                           * U.smoothstep(6, 34, y))
        .lerp(COL.heather, U.clamp(fbm2(x * 0.024, z * 0.024, 2, 41) * 0.85, 0, 0.46)
                           * U.smoothstep(22, 95, y))
        .lerp(COL.land, U.smoothstep(0.95, 1.9, slope))
        .lerp(COL.landDark, U.smoothstep(170, 330, y) * 0.7)
        .lerp(COL.snow, U.smoothstep(320, 445, y) * 0.9);
      c.offsetHSL(patch * 0.016, patch * 0.05, patch * 0.05);
      // the far hillside sits back into the weather of the day
      c.lerp(fog, U.smoothstep(o.radius * 1.4, o.radius * 4.4, Math.hypot(x, z)) * 0.62);
    };

    const paint = (x, y, z, slope) => {
      /* One surface, two palettes, and a wet strip where they meet: the
         sand does not stop at the tideline, it darkens through it. */
      const land = U.smoothstep(-2.4, 0.5, y);
      if (land <= 0) { paintSea(x, y, z, slope); }
      else if (land >= 1) { paintLand(x, y, z, slope); }
      else {
        paintSea(x, y, z, slope);
        const wet = c.clone();
        paintLand(x, y, z, slope);
        c.lerp(wet, 1 - land);
      }
      /* Both palettes face straight up into the brightest light rig in
         the game, under a renderer with no tone mapping. Left at face
         value every one of these clips to white — the same trick the
         forest floor already uses, and the same two numbers: the wood's
         for the hillside, the reef's for the sand, because one of them
         is being read through forty metres of blue and the other is
         not. */
      return c.multiplyScalar(U.lerp(0.42, 0.46, land));
    };

    const P = (t, k) => {
      const a = (k / SECTORS) * Math.PI * 2;
      const jr = 1 + (noise2(t * 977, k, 3) * 0.5) * 0.18;
      const r = radiusAt(t, a) * jr;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return { x, z, y: heightAt(x, z) };
    };

    const grid = [];
    for (let i = 0; i <= RINGS; i++) {
      const row = [];
      for (let k = 0; k < SECTORS; k++) row.push(P(i / RINGS, k));
      grid.push(row);
    }
    const centre = { x: 0, z: 0, y: heightAt(0, 0) };
    grid[0] = grid[0].map(() => centre);

    /* Indexed and painted per vertex, not per triangle.
       The header says this surface is smooth-shaded because "a surface
       this big rendered as flat facets reads as broken geometry" — and
       a *non-indexed* grid cannot be, whatever the material says, since
       computeVertexNormals has nothing to average across. Sharing the
       vertices buys the smooth shading the comment was asking for, four
       times fewer paint calls, and six times fewer vertices, all from
       the same edit.

       The slope each vertex is painted against comes off its own
       neighbours in the grid rather than from four more calls into the
       height function, which is what keeps a hillside this large inside
       a mission load rather than a loading screen. */
    const slopeAt = (i, k) => {
      const up = grid[Math.max(0, i - 1)][k], dn = grid[Math.min(RINGS, i + 1)][k];
      const lf = grid[i][(k + SECTORS - 1) % SECTORS], rt = grid[i][(k + 1) % SECTORS];
      const dr = Math.max(0.4, Math.hypot(dn.x - up.x, dn.z - up.z));
      const dk = Math.max(0.4, Math.hypot(rt.x - lf.x, rt.z - lf.z));
      return Math.abs(dn.y - up.y) / dr + Math.abs(rt.y - lf.y) / dk;
    };

    for (let i = 0; i <= RINGS; i++) {
      for (let k = 0; k < SECTORS; k++) {
        const p = grid[i][k];
        pos.push(p.x, p.y, p.z);
        paint(p.x, p.y, p.z, slopeAt(i, k));
        col.push(c.r, c.g, c.b);
      }
    }

    /* Wound so that the right-hand normal points *up*.
       This is not a detail. `(a, c, d)` — which is what a ring/sector
       grid reads like when you write it out in order — produces a
       downward normal, so the entire seabed was back-facing and the
       renderer culled the single largest object in the mission. The
       loch looked empty because its floor was inside out. */
    const idx = [];
    const at = (i, k) => i * SECTORS + k;
    for (let i = 0; i < RINGS; i++) {
      for (let k = 0; k < SECTORS; k++) {
        const k2 = (k + 1) % SECTORS;
        const A = at(i, k), B = at(i, k2), C = at(i + 1, k), D = at(i + 1, k2);
        idx.push(A, D, C, A, B, D);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* =============== boulders and coral heads =============== */

  /* The rock the wreck sits in, and the coral you have to swim round.
     Same idea as CourseKit.buildRocks — a displaced icosahedron whose
     radial displacement is a pure function of direction, so the shell
     never cracks — but placed against a floor function rather than a
     race line, and with no foam because there is no surface here. */
  function lumps(rng) {
    const out = [];
    for (let i = 0; i < 5; i++) {
      out.push({ x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(-1, 1),
                 a: rng.range(0.10, 0.30), f: rng.range(0.8, 2.4) });
    }
    return out;
  }
  function lumpAt(ls, x, y, z) {
    let s = 0;
    for (const l of ls) s += Math.sin((x * l.x + y * l.y + z * l.z) * l.f) * l.a;
    return s;
  }

  function buildRocks(heightAt, rng, o) {
    const geos = [], colliders = [];
    const c = new THREE.Color();
    let tries = 0;
    while (colliders.length < o.count && tries++ < o.count * 24) {
      const a = rng() * Math.PI * 2;
      const rad = U.lerp(o.r0, o.r1, Math.sqrt(rng()));
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const r = rng.range(o.size[0], o.size[1]);
      let ok = true;
      for (const cd of colliders) {
        if ((cd.x - x) ** 2 + (cd.z - z) ** 2 < (cd.r + r + 5) ** 2) { ok = false; break; }
      }
      for (const av of (o.avoid || [])) {
        if ((av.x - x) ** 2 + (av.z - z) ** 2 < (av.r + r + 4) ** 2) { ok = false; break; }
      }
      if (!ok) continue;

      const y = heightAt(x, z);
      const g = new THREE.IcosahedronGeometry(r, 1);
      const p = g.attributes.position;
      const ls = lumps(rng);
      const sx = rng.range(0.82, 1.34), sy = rng.range(0.55, 1.25), sz = rng.range(0.82, 1.34);
      const sink = r * rng.range(0.28, 0.55);
      for (let v = 0; v < p.count; v++) {
        const vx = p.getX(v), vy = p.getY(v), vz = p.getZ(v);
        const inv = 1 / (Math.hypot(vx, vy, vz) || 1);
        const dx = vx * inv, dy = vy * inv, dz = vz * inv;
        const rr = r * (1 + lumpAt(ls, dx * 2.2, dy * 2.2, dz * 2.2));
        p.setXYZ(v, dx * rr * sx, dy * rr * sy, dz * rr * sz);
      }
      g.computeVertexNormals();

      const cc = [];
      const coral = o.coral && rng() < 0.45;
      const top = coral ? (rng() < 0.5 ? COL.coral : COL.coralPink) : COL.rock;
      for (let v = 0; v < p.count; v++) {
        const tt = U.clamp((p.getY(v) + r * sy) / (2 * r * sy), 0, 1);
        c.copy(COL.rockDark).lerp(top, Math.pow(tt, 0.8));
        c.lerp(COL.weedDeep, U.smoothstep(0.75, 0.2, tt) * 0.55);
        if (coral && tt > 0.6) c.lerp(COL.coralGold, (tt - 0.6) * 0.9 * Math.abs(Math.sin(v * 0.41)));
        c.multiplyScalar(0.5);
        cc.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      g.rotateY(rng.range(0, 6.28));
      g.translate(x, y - sink + r * sy * 0.5, z);
      geos.push(g);
      colliders.push({ x, z, r: r * 0.78, y0: y - r, y1: y + r * sy * 1.4 });
    }
    return { geo: geos.length ? Sky.mergeGeometries(geos) : null, colliders };
  }

  /* =============== the wreck =============== */

  /* A broken trawler on the slope: a keel, ribs open to the water, a
     snapped mast to swim through and a scatter of her own cargo. It is
     the mission's one landmark, so it is hand-built rather than
     scattered, and its colliders are what the trench divers navigate by
     on the way down. */
  function buildWreck(heightAt, rng, o) {
    const geos = [], colliders = [];
    const c = new THREE.Color();
    const at = o.at;
    const heading = rng() * Math.PI * 2;
    const list = U.lerp(-0.45, 0.45, rng());         // how far she has rolled over
    const L = 44, halfBeam = 7.2;

    const push = (g, colour, shade) => {
      const p = g.attributes.position;
      const cc = [];
      for (let v = 0; v < p.count; v++) {
        c.copy(colour);
        const tt = U.clamp((p.getY(v) + 6) / 14, 0, 1);
        c.lerp(COL.hullWeed, (1 - tt) * 0.45);
        c.offsetHSL(0, 0, (Math.sin(v * 0.73) * 0.5) * 0.05);
        c.multiplyScalar(shade === undefined ? 0.46 : shade);
        cc.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      if (!g.attributes.normal) g.computeVertexNormals();
      geos.push(g);
    };

    // the keel: a long tapered box lying along the slope
    const keel = new THREE.BoxGeometry(2.2, 2.6, L, 1, 1, 12);
    {
      const p = keel.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const z = p.getZ(v), k = 1 - Math.pow(Math.abs(z) / (L / 2), 2.1) * 0.72;
        p.setXYZ(v, p.getX(v) * k, p.getY(v) * k, z);
      }
      keel.computeVertexNormals();
    }
    push(keel, COL.hull);

    // ribs, opening wider amidships, with a gap where her back broke
    for (let i = -6; i <= 6; i++) {
      if (i === 1 || i === 2) continue;                 // the break
      const z = i * (L / 14);
      const k = 1 - Math.pow(Math.abs(z) / (L / 2), 1.9) * 0.85;
      const w = halfBeam * k;
      const rib = new THREE.TorusGeometry(w, 0.30, 6, 14, Math.PI * 1.05);
      rib.rotateZ(-Math.PI * 0.02);
      rib.rotateY(Math.PI / 2);
      rib.translate(0, 0.6, z);
      push(rib, i > 2 ? COL.hullRust : COL.hull);
    }

    // plating still on the after half, so she is not only a skeleton
    for (const side of [1, -1]) {
      const plate = new THREE.BoxGeometry(0.5, 6.4, L * 0.42, 1, 2, 6);
      const p = plate.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const y = p.getY(v), z = p.getZ(v);
        const k = 1 - Math.pow(Math.abs(z) / (L * 0.21), 2.0) * 0.55;
        p.setXYZ(v, p.getX(v), y * k, z);
      }
      plate.computeVertexNormals();
      plate.translate(side * halfBeam * 0.86, 2.0, -L * 0.26);
      push(plate, COL.hull);
    }

    // the wheelhouse, sitting over her stern, and the funnel off it
    const house = new THREE.BoxGeometry(6.4, 4.2, 6.0);
    house.translate(0, 4.6, -L * 0.30);
    push(house, COL.hullRust);
    const funnel = new THREE.CylinderGeometry(1.0, 1.25, 4.0, 10);
    funnel.rotateX(0.22);
    funnel.translate(0, 8.0, -L * 0.36);
    push(funnel, COL.hullRust);

    // the mast, snapped and lying forward: the thing you swim through
    const mast = new THREE.CylinderGeometry(0.42, 0.55, 20, 8);
    mast.rotateX(Math.PI / 2 - 0.28);
    mast.translate(0, 5.2, L * 0.34);
    push(mast, COL.timber, 0.5);
    const spar = new THREE.CylinderGeometry(0.24, 0.24, 9, 6);
    spar.rotateZ(Math.PI / 2);
    spar.translate(0, 7.4, L * 0.20);
    push(spar, COL.timber, 0.5);

    // spilled crates on the sand beside her
    for (let i = 0; i < 9; i++) {
      const s = rng.range(1.0, 2.1);
      const box = new THREE.BoxGeometry(s, s * 0.7, s * 1.2);
      box.rotateY(rng() * 6.28);
      box.rotateZ(rng.range(-0.4, 0.4));
      box.translate(rng.range(-18, 18), rng.range(-1.2, 0.6), rng.range(-24, 24));
      push(box, COL.timber, 0.52);
    }

    const merged = Sky.mergeGeometries(geos);
    merged.rotateZ(list);
    merged.rotateY(heading);
    merged.translate(at.x, at.y + 1.6, at.z);

    /* Colliders: a chain of cylinders down the keel rather than one
       fat one, so a diver can get inside her ribs — which is where the
       best of the wreck tier's money lives. */
    for (let i = -3; i <= 3; i++) {
      const z = i * (L / 7);
      const lx = at.x + Math.sin(heading) * z, lz = at.z + Math.cos(heading) * z;
      colliders.push({ x: lx, z: lz, r: 2.4, y0: at.y - 2, y1: at.y + 5 });
    }
    return { geo: merged, colliders, at, heading, length: L, halfBeam };
  }

  /* =============== kelp =============== */

  /* Grass, re-read as a forest of it. The blade geometry is the
     highland's, the instancing is the forest's and the sway is the
     current — which is exactly the point of those three being exported
     rather than copied. */
  function buildKelp(heightAt, rng, o) {
    const geos = [];
    for (let i = 0; i < 4; i++) {
      const parts = [];
      const blades = 3 + (rng() * 3 | 0);
      for (let b = 0; b < blades; b++) {
        const g = HighlandKit.bladeGeometry(rng, 4);
        const a = (b / blades) * Math.PI * 2 + rng() * 0.9;
        g.rotateY(a);
        g.scale(1.5, rng.range(2.2, 5.4), 1.5);
        g.translate(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12);
        parts.push(g.toNonIndexed());
      }
      const g = Sky.mergeGeometries(parts);
      g.computeVertexNormals();
      geos.push(g);
    }

    const spots = [];
    for (let i = 0; i < o.count * 4 && spots.length < o.count; i++) {
      const a = rng() * Math.PI * 2;
      const r = U.lerp(o.r0, o.r1, Math.sqrt(rng()));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // kelp wants light: it thins out as the floor falls away, and it
      // does not grow above the tideline
      const y = heightAt(x, z);
      if (y > -2.4) continue;
      if (rng() > U.clamp(1 - U.smoothstep(-16, -40, y), 0.06, 1)) continue;
      spots.push({ x, z, y, s: rng.range(0.8, 2.0), rot: rng() * 6.28, kind: i % geos.length });
    }
    return { geos, spots };
  }

  /* =============== the shore, dressed =============== */

  /* Everything above the tideline that is not the ground itself: the
     wood on the hillside, the machair grass on the flat behind the
     beach, and the boulders on the shingle.

     None of it is new code. `ForestKit` already knows how to build a
     pine and instance ten thousand of them against a wind uniform, and
     `HighlandKit` already knows what a blade of grass looks like — the
     dive supplies a height function and a treeline and gets a Scottish
     hillside back. That reuse is the reason this is fifty lines rather
     than a second forest.js. */
  function buildLand(heightAt, rng, o) {
    const group = new THREE.Group();
    group.name = 'shore';
    const geos = [], mats = [];
    const uniforms = {
      time: { value: 0 },
      wind: { value: new THREE.Vector3(0.62, 0.34, 1.0) },
    };

    const R = o.reach;
    const TAU = Math.PI * 2;
    const c = new THREE.Color();

    /* ---- the wood. Thick along the shore where you see it, thinning
       out to a proper treeline as the hill gets its head above the
       weather, and never on the shingle itself. ---- */
    const treeMat = ForestKit.windMaterial(uniforms, 0.5, 13.0, 0.85);
    mats.push(treeMat);
    const trees = [];
    for (let i = 0; i < o.trees * 9 && trees.length < o.trees; i++) {
      const a = rng() * TAU;
      const r = U.lerp(14, R, Math.sqrt(rng()));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = heightAt(x, z);
      if (y < 4.2) continue;                       // not on the beach
      // the treeline: dense low down, gone by three hundred metres up
      if (rng() > U.clamp(1 - U.smoothstep(140, 320, y), 0.02, 1)) continue;
      // and never standing in the landing itself
      if (Math.hypot(x - o.landing.x, z - o.landing.z) < 16) continue;
      trees.push({ x, z, y, s: rng.range(0.75, 1.85), rot: rng() * TAU,
                   kind: rng() < 0.66 ? 'pine' : (rng() < 0.86 ? 'broadleaf' : 'dead') });
    }
    for (const kind of ['pine', 'broadleaf', 'dead']) {
      const list = trees.filter(t => t.kind === kind);
      if (!list.length) continue;
      const geo = ForestKit.speciesGeometry(kind, rng);
      geos.push(geo);
      const m = ForestKit.instance(geo, treeMat, list, rng, (col, sp, r) => {
        // a wood is not one green: hue, saturation and lightness all move,
        // and the far side of the hill sits back towards the haze
        const d = U.clamp(Math.hypot(sp.x, sp.z) / R, 0, 1);
        const alt = U.smoothstep(20, 260, sp.y);
        col.setHSL(0.29 + r.range(-0.035, 0.055) + alt * 0.02,
                   0.52 + r.range(-0.12, 0.10) - alt * 0.14,
                   0.50 + r.range(-0.10, 0.12) - alt * 0.06);
        col.multiplyScalar(U.lerp(0.92, 0.48, d));
      });
      if (m) { m.name = 'shore-' + kind; group.add(m); }
    }

    /* ---- machair: the grass on the flat behind the beach. Only where
       you can actually see it, which is the first hundred metres. ---- */
    const grassMat = ForestKit.windMaterial(uniforms, 0.05, 1.1, 1.5);
    mats.push(grassMat);
    const tufts = [];
    for (let i = 0; i < o.grass * 5 && tufts.length < o.grass; i++) {
      const a = rng() * TAU;
      const r = U.lerp(8, 190, Math.sqrt(rng()));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = heightAt(x, z);
      if (y < 1.9 || y > 90) continue;
      tufts.push({ x, z, y, s: rng.range(0.7, 1.5), rot: rng() * TAU });
    }
    if (tufts.length) {
      const geo = HighlandKit.tuftGeometry(rng, 4);
      geos.push(geo);
      const m = ForestKit.instance(geo, grassMat, tufts, rng, (col, sp, r) => {
        col.copy(sp.y < 3.4 ? COL.bracken : COL.grass)
           .offsetHSL(r.range(-0.03, 0.05), r.range(-0.12, 0.10), r.range(-0.08, 0.14))
           .multiplyScalar(0.72);
      });
      if (m) { m.name = 'shore-grass'; group.add(m); }
    }

    /* ---- and the boulders the beach is made of. Flat-shaded, sunk into
       the shingle, and the only thing on the shore with a collider. ---- */
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    mats.push(rockMat);
    const rockGeos = [];
    const colliders = [];
    for (let i = 0; i < o.boulders * 8 && rockGeos.length < o.boulders; i++) {
      const a = rng() * TAU;
      const r = U.lerp(9, 150, Math.sqrt(rng()));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = heightAt(x, z);
      if (y < -1.6 || y > 46) continue;
      if (Math.hypot(x - o.landing.x, z - o.landing.z) < 9) continue;
      const rad = rng.range(0.7, 3.4);
      const g = new THREE.IcosahedronGeometry(rad, 1);
      const p = g.attributes.position;
      const ls = lumps(rng);
      const sy = rng.range(0.5, 1.0);
      for (let v = 0; v < p.count; v++) {
        const vx = p.getX(v), vy = p.getY(v), vz = p.getZ(v);
        const inv = 1 / (Math.hypot(vx, vy, vz) || 1);
        const dx = vx * inv, dy = vy * inv, dz = vz * inv;
        const rr = rad * (1 + lumpAt(ls, dx * 2.4, dy * 2.4, dz * 2.4));
        p.setXYZ(v, dx * rr, dy * rr * sy, dz * rr);
      }
      g.computeVertexNormals();
      const cc = [];
      const lichen = rng() < 0.4;
      for (let v = 0; v < p.count; v++) {
        const tt = U.clamp((p.getY(v) + rad * sy) / (2 * rad * sy), 0, 1);
        c.copy(COL.landDark).lerp(COL.land, Math.pow(tt, 0.75));
        if (lichen && tt > 0.5) c.lerp(COL.grassLit, (tt - 0.5) * 0.5);
        c.lerp(COL.shingleWet, U.smoothstep(0.4, -1.2, y) * 0.5);
        c.multiplyScalar(0.5);
        cc.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      g.rotateY(rng() * TAU);
      g.translate(x, y - rad * sy * 0.35, z);
      rockGeos.push(g);
      if (rad > 1.5) colliders.push({ x, z, r: rad * 0.8, y0: y - rad, y1: y + rad * sy * 1.6 });
    }
    if (rockGeos.length) {
      const merged = Sky.mergeGeometries(rockGeos);
      geos.push(merged);
      const mesh = new THREE.Mesh(merged, rockMat);
      mesh.name = 'shore-rocks';
      group.add(mesh);
      for (const g of rockGeos) g.dispose();
    }

    return {
      group, colliders, uniforms,
      setWind(x, z, strength) { uniforms.wind.value.set(x, z, strength); },
      update(dt) { uniforms.time.value += dt; },
      dispose() {
        Engine.disposeObject(group);
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
      },
    };
  }

  /* =============== shafts of light =============== */

  /* Ten additive cones hanging off the sun's bearing, parked relative
     to the camera so the water always has light coming down through
     it. The same recipe as the boat race's hoop glow, which is to say:
     one texture, no depth write, and never anything cleverer. */
  function buildShafts(rng, o) {
    const grp = new THREE.Group();
    const tex = Sky.glowTexture('rgba(214,255,250,0.85)', 'rgba(120,225,235,0.22)');
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.16, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: '#cffcff',
    });
    const items = [];
    for (let i = 0; i < o.count; i++) {
      const h = rng.range(46, 78);
      const g = new THREE.PlaneGeometry(rng.range(9, 22), h, 1, 1);
      g.translate(0, -h / 2, 0);
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 3;
      m.frustumCulled = false;
      grp.add(m);
      items.push({ m, ox: rng.range(-60, 60), oz: rng.range(-60, 60),
                   ph: rng() * 6.28, spin: rng.range(-0.06, 0.06) });
    }
    grp.renderOrder = 3;
    return { group: grp, items, mat, tex };
  }

  /* =============== the shoal =============== */

  /* Fish, as one instanced mesh and a boids-lite update.

     A proper flock exists already in flyers.js, and it is the wrong
     tool here: it separates a *type* from a *behaviour* so that a
     raven and a lantern can share a sky, and every one of those birds
     is something you are trying to hit. Nothing in this loch is a
     target. What the shoal has to be is scenery that moves like a
     living thing and gets out of your way — three rules and a wander
     point, updated on one flat array with no allocation, which is why
     three hundred of them cost nothing.

     They also do a real job: a shoal that scatters is the only thing
     down here that tells you somebody else has just swum past. */
  function buildShoal(scene, rng, o = {}) {
    const count = o.count || 140;
    const R = o.radius || 150;
    const heightAt = o.heightAt || (() => -30);
    const home = o.home || { x: 0, z: 0 };

    // one fish: a flattened diamond with a tail, pointing +Z.
    // (`mergeGeometries` expands an index itself, and asking a geometry
    // that has none to drop one is a console warning per fish.)
    const parts = [];
    const body = new THREE.OctahedronGeometry(0.34, 0);
    body.scale(0.55, 0.75, 1.9);
    parts.push(body);
    const tail = new THREE.ConeGeometry(0.26, 0.42, 3);
    tail.rotateX(Math.PI / 2);
    tail.translate(0, 0, -0.72);
    parts.push(tail);
    const geo = Sky.mergeGeometries(parts);
    for (const p of parts) p.dispose();
    // the classic countershade: bright back, pale belly, so a shoal
    // flickers as it turns instead of reading as a cloud of triangles
    const p = geo.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const up = U.clamp(p.getY(i) / 0.3 * 0.5 + 0.5, 0, 1);
      c.setRGB(1, 1, 1).lerp(new THREE.Color('#2f7fa8'), up);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
      emissive: '#8fd9e8', emissiveIntensity: 0.18,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // schools rather than one cloud: each fish belongs to a group with
    // its own wander point, so the loch has places that are busy
    const SCHOOLS = Math.max(2, Math.round(count / 34));
    const schools = [];
    for (let i = 0; i < SCHOOLS; i++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 24; tries++) {
        const a = rng() * Math.PI * 2, r = U.lerp(20, R, Math.sqrt(rng()));
        x = Math.cos(a) * r; z = Math.sin(a) * r;
        if (heightAt(x, z) <= -7) break;
      }
      schools.push({ x, z, y: heightAt(x, z) + rng.range(3, 12), t: rng() * 10 });
    }
    // a couple of schools always live on the wreck, because that is
    // where the middle tier's money is and it should look inhabited
    if (schools.length) {
      schools[0].x = home.x; schools[0].z = home.z;
      schools[0].y = heightAt(home.x, home.z) + 7;
    }

    const px = new Float32Array(count), py = new Float32Array(count), pz = new Float32Array(count);
    const vx = new Float32Array(count), vy = new Float32Array(count), vz = new Float32Array(count);
    const grp = new Int16Array(count);
    for (let i = 0; i < count; i++) {
      const s = schools[i % schools.length];
      grp[i] = i % schools.length;
      px[i] = s.x + rng.range(-6, 6);
      py[i] = s.y + rng.range(-3, 3);
      pz[i] = s.z + rng.range(-6, 6);
      vx[i] = rng.range(-2, 2); vy[i] = rng.range(-0.4, 0.4); vz[i] = rng.range(-2, 2);
    }

    const d = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const look = new THREE.Vector3();
    let t = 0;

    scene.add(mesh);

    return {
      mesh, schools,
      update(dt, diverPos, camPos) {
        t += dt;
        const step = Math.min(dt, 0.05);
        for (let s = 0; s < schools.length; s++) {
          const sc = schools[s];
          sc.t -= step;
          if (sc.t <= 0) {
            // a new place to be, always over the seabed, never above it,
            // and never up the beach
            sc.t = 5 + Math.random() * 9;
            for (let tries = 0; tries < 12; tries++) {
              const a = Math.random() * Math.PI * 2;
              const r = U.lerp(15, R, Math.sqrt(Math.random()));
              const x = Math.cos(a) * r, z = Math.sin(a) * r;
              if (heightAt(x, z) > -7 && tries < 11) continue;
              sc.x = x; sc.z = z;
              sc.y = heightAt(x, z) + 3 + Math.random() * 12;
              break;
            }
          }
        }
        for (let i = 0; i < count; i++) {
          const sc = schools[grp[i]];
          // cohesion towards the school's wander point
          let ax = (sc.x - px[i]) * 0.55;
          let ay = (sc.y - py[i]) * 0.9;
          let az = (sc.z - pz[i]) * 0.55;
          // a little wander so a school is not a swarm of arrows
          const ph = i * 0.77;
          ax += Math.sin(t * 1.3 + ph) * 1.6;
          ay += Math.sin(t * 0.9 + ph * 1.7) * 0.7;
          az += Math.cos(t * 1.1 + ph * 1.3) * 1.6;
          // and the one rule that matters: get out of the diver's way
          if (diverPos) {
            const dx = px[i] - diverPos.x, dy = py[i] - diverPos.y, dz = pz[i] - diverPos.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < 90 && d2 > 1e-4) {
              const k = (90 - d2) / 90 * 46 / Math.sqrt(d2);
              ax += dx * k; ay += dy * k; az += dz * k;
            }
          }
          vx[i] = (vx[i] + ax * step) * 0.965;
          vy[i] = (vy[i] + ay * step) * 0.94;
          vz[i] = (vz[i] + az * step) * 0.965;
          const sp = Math.hypot(vx[i], vy[i], vz[i]);
          if (sp > 9) { const k = 9 / sp; vx[i] *= k; vy[i] *= k; vz[i] *= k; }
          px[i] += vx[i] * step; py[i] += vy[i] * step; pz[i] += vz[i] * step;
          const floor = heightAt(px[i], pz[i]) + 1.0;
          if (py[i] < floor) { py[i] = floor; vy[i] = Math.abs(vy[i]); }
          if (py[i] > -1.5) { py[i] = -1.5; vy[i] = -Math.abs(vy[i]); }

          d.position.set(px[i], py[i], pz[i]);
          look.set(px[i] + vx[i], py[i] + vy[i], pz[i] + vz[i]);
          d.lookAt(look);
          d.up.copy(up);
          // the tail beats faster the harder it is swimming
          const wag = Math.sin(t * (6 + sp) + i) * 0.16;
          d.rotation.z += wag;
          d.scale.set(1, 1, 1);
          d.updateMatrix();
          mesh.setMatrixAt(i, d.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      },
      dispose() {
        Engine.disposeObject(mesh);
        geo.dispose();
        mat.dispose();
      },
    };
  }

  /* =============== the whole reef =============== */

  function build(scene, rng, opts = {}) {
    const o = Object.assign({
      radius: 190,
      rocks: 54,
      kelp: 620,
      shafts: 9,
      motes: 340,
      trees: 900,
      grass: 1500,
      boulders: 70,
    }, opts);

    const uniforms = {
      time:    { value: 0 },
      caustic: { value: 1 },
      current: { value: new THREE.Vector3(0.7, 0.7, 1) },
    };

    /* ---- which way the land is ----
       One bearing decides the whole above-water half of the mission:
       where the beach is, which way home is, and which way you are
       facing when the countdown ends. Everything downstream reads it
       off `reef.shore` rather than knowing the number. */
    const shoreAng = opts.shoreAngle === undefined ? rng() * Math.PI * 2 : opts.shoreAngle;
    const shore = shoreFor(shoreAng);
    o.shore = shore;

    const heightAt = makeFloor(rng, o);

    /* The landing: the flat shingle platform you jump from and bring
       everything back to, and the tideline point in front of it that
       counts as "ashore". Both are on the shore bearing through the
       origin, so the reef's own geometry is untouched by any of this. */
    shore.landing = { x: shore.nx * shore.landAt, z: shore.nz * shore.landAt };
    shore.landing.y = heightAt(shore.landing.x, shore.landing.z);
    /* Where the water actually starts, found rather than assumed: walk
       seaward from the landing until the ground is a metre and a half
       under. Assuming it made the tideline a number in two places, and
       the two disagreed the moment the beach profile was touched. */
    shore.tide = { x: 0, z: 0, y: 0 };
    for (let e = shore.landAt; e > -60; e -= 0.5) {
      const x = shore.nx * e, z = shore.nz * e;
      const y = heightAt(x, z);
      shore.tide = { x, z, y };
      if (y < -1.5) break;
    }
    const group = new THREE.Group();
    const geos = [];
    const mats = [];

    // ---- the floor. Smooth-shaded: a surface this big rendered as
    // flat facets reads as broken geometry rather than as style.
    const floorGeo = buildFloor(heightAt, rng, o);
    const floorMat = causticMaterial(uniforms, { gain: 1.0, flat: false, swash: 1.0 });
    geos.push(floorGeo); mats.push(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.name = 'seabed';
    floor.frustumCulled = false;
    group.add(floor);

    // ---- the wreck, out on the slope where the middle tier lives
    /* She is out in the loch, never up the beach: the bearing is drawn
       in the seaward half-turn measured off the shore normal, so no seed
       can ever ground her on the shingle. */
    const wa = shoreAng + Math.PI + U.lerp(-1.15, 1.15, rng());
    const wr = U.lerp(o.radius * 0.42, o.radius * 0.56, rng());
    const wAt = { x: Math.sin(wa) * wr, z: Math.cos(wa) * wr };
    wAt.y = heightAt(wAt.x, wAt.z);
    const wreck = buildWreck(heightAt, rng, { at: wAt });
    const wreckMat = causticMaterial(uniforms, { gain: 0.7 });
    geos.push(wreck.geo); mats.push(wreckMat);
    const wreckMesh = new THREE.Mesh(wreck.geo, wreckMat);
    wreckMesh.name = 'wreck';
    group.add(wreckMesh);

    // ---- rock and coral heads
    const rocks = buildRocks(heightAt, rng, {
      count: o.rocks, r0: 18, r1: o.radius * 0.98, size: [3.2, 9.5], coral: true,
      avoid: [{ x: 0, z: 0, r: 16 }, { x: wAt.x, z: wAt.z, r: 30 }],
    });
    if (rocks.geo) {
      const rockMat = causticMaterial(uniforms, { gain: 0.75 });
      geos.push(rocks.geo); mats.push(rockMat);
      const rm = new THREE.Mesh(rocks.geo, rockMat);
      rm.name = 'rocks';
      group.add(rm);
    }

    // ---- kelp
    const kelp = buildKelp(heightAt, rng, { count: o.kelp, r0: 10, r1: o.radius * 0.85 });
    const kelpMat = causticMaterial(uniforms, {
      gain: 0.45, sway: 4.0, swayGain: 2.4,
      mat: { side: THREE.DoubleSide },
    });
    mats.push(kelpMat);
    const kelpMeshes = [];
    for (let k = 0; k < kelp.geos.length; k++) {
      const list = kelp.spots.filter(s => s.kind === k);
      if (!list.length) continue;
      const mesh = ForestKit.instance(kelp.geos[k], kelpMat, list, rng, (c, sp, r) => {
        c.copy(sp.y > -20 ? COL.kelp : COL.weedDeep)
         .offsetHSL(r.range(-0.03, 0.05), r.range(-0.1, 0.12), r.range(-0.10, 0.16))
         .multiplyScalar(0.62);
      });
      if (mesh) { group.add(mesh); kelpMeshes.push(mesh); }
      geos.push(kelp.geos[k]);
    }

    // ---- shafts of sun
    const shafts = buildShafts(rng, { count: o.shafts });
    group.add(shafts.group);

    /* ---- marine snow. The forest's motes with the fall reversed, so
       it drifts *up* past you — the single cheapest thing in the file
       and the one that makes the water read as water rather than as
       tinted air. */
    const motes = ForestKit.buildMotes(rng, o.motes, {
      color: '#dffaff', box: 90, size: 0.42, opacity: 0.55,
    });
    group.add(motes.points);

    // ---- and the half of it you can stand on
    const land = buildLand(heightAt, rng, {
      reach: o.radius * 3.4, trees: o.trees, grass: o.grass,
      boulders: o.boulders, landing: shore.landing,
    });
    group.add(land.group);

    scene.add(group);

    const colliders = rocks.colliders.concat(wreck.colliders, land.colliders);
    const moteOpacity = motes.points.material.opacity;

    return {
      group, heightAt, colliders, uniforms, radius: o.radius, shore,
      wreck: { at: wAt, heading: wreck.heading, length: wreck.length },
      bandAt,

      setCurrent(x, z, strength) {
        uniforms.current.value.set(x, z, strength);
        // the same weather moves the kelp and the trees on the hill
        land.setWind(x, z, 0.55 + strength * 0.35);
      },
      setCaustic(v) { uniforms.caustic.value = v; },

      update(dt, camPos) {
        uniforms.time.value += dt;
        land.update(dt);
        const t = uniforms.time.value;
        /* Everything in this block is *underwater* dressing, so all of
           it fades out as the lens leaves the water. Sunbeams hanging in
           the air over the beach is the kind of detail that reads as a
           bug rather than as atmosphere. */
        const wet = U.clamp(-camPos.y / 2.2, 0, 1);
        // the shafts hang off the sun's bearing and are parked near the
        // camera, so there is always light coming down wherever you are
        for (const it of shafts.items) {
          it.m.position.set(camPos.x + it.ox, 6, camPos.z + it.oz);
          it.m.rotation.set(0.12, t * it.spin + it.ph, -0.16);
          it.m.material.opacity = (0.10 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.4 + it.ph))) * wet;
        }
        shafts.group.visible = wet > 0.01;
        motes.points.material.opacity = moteOpacity * wet;
        motes.points.visible = wet > 0.01;
        const cur = uniforms.current.value;
        // snow drifts up, so the "fall" is negative
        motes.update(dt, { x: cur.x * 0.3, y: cur.y * 0.3 }, camPos, -0.6);
      },

      dispose() {
        land.dispose();
        Engine.disposeObject(group);
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
        shafts.mat.dispose();
        if (shafts.tex) shafts.tex.dispose();
      },
    };
  }

  return { build, COL, BANDS, WET, bandAt, shoreFor, makeFloor, buildFloor, causticMaterial,
           buildRocks, buildWreck, buildKelp, buildLand, buildShafts, buildShoal };
})();


/* ------------------------------------------------------------------
   DiveConditions — the dive's weather, which is one option long.

   `Conditions` already knows what noon looks like and how to hand a
   light rig out; forking it would guarantee two copies of that drift
   apart. What the dive adds is the thing the sea does not have: how
   clear the water is. Visibility is genuinely a difficulty dial — a
   trench you cannot see the bottom of is a different swim — so it
   pays, exactly like the wind does in the wood.

   There is no time-of-day option here at all, and that is the design.
   The water must never be dark.
------------------------------------------------------------------ */
const DiveConditions = (() => {

  const WATERS = [
    { id: 'gin', name: 'Gin clear', weight: 3, payout: 0.95, vis: 1.30, silt: 0.0,
      blurb: 'You can see the trench floor from the surface. Nothing is hiding.' },
    { id: 'bright', name: 'Bright water', weight: 3, payout: 1.00, vis: 1.00, silt: 0.1,
      blurb: 'A good day on the loch. Everything is exactly as far away as it looks.' },
    { id: 'plankton', name: 'Plankton bloom', weight: 2, payout: 1.14, vis: 0.72, silt: 0.5,
      blurb: 'Green, thick and full of drifting light. The wreck arrives late.' },
    { id: 'runoff', name: 'River runoff', weight: 2, payout: 1.22, vis: 0.58, silt: 0.8,
      blurb: 'Silt off the hills. You will be on top of the trench before you see it.' },
    { id: 'spring', name: 'Spring tide', weight: 2, payout: 1.16, vis: 0.92, silt: 0.3,
      current: 1.9,
      blurb: 'A current running across the whole loch. It moves the kelp and it moves you.' },
    { id: 'glassoff', name: 'Glass-off', weight: 1, payout: 1.08, vis: 1.15, silt: 0.05,
      calm: true,
      blurb: 'Dead flat overhead. The ceiling is a mirror and the sun is a hole in it.' },
  ];

  const byId = (id) => WATERS.find(w => w.id === id) || null;

  function weightedPick(list, rng) {
    let total = 0;
    for (const x of list) total += x.weight;
    let r = rng() * total;
    for (const x of list) { r -= x.weight; if (r <= 0) return x; }
    return list[list.length - 1];
  }

  function forSeed(seed) {
    const rng = U.makeRng((seed ^ 0x3c6ef372) >>> 0);
    return {
      water: weightedPick(WATERS, rng).id,
      current: rng() * Math.PI * 2,       // which way the whole loch is drifting
    };
  }

  function resolve(cond) {
    const c = cond || {};
    return {
      // always noon, and not negotiable: see the header of reef.js
      time: Conditions.TIMES[0],
      water: byId(c.water) || WATERS[1],
      current: c.current || 0,
    };
  }

  /* The dive's own water palette — twice, because there are now two
     completely different things to paint.

     From *underneath*, `sky` is a saturated aqua rather than a sky
     colour, because the surface's Fresnel down there is total internal
     reflection: it mirrors the water, not the air.

     From *above* it is a highland sea loch on a clear day, which is a
     dark green-blue with a hard white glitter on it — and if you leave
     the underwater palette on when the camera comes out, what you get
     is a swimming pool with mountains behind it. The mission lerps
     between them across the waterline, on the same ramp that drives the
     fog, so the surface break changes the sea as well as the air. */
  const PALETTE = {
    deep: '#1f7ee0', shallow: '#46dcf0', crest: '#b6fff2',
    sky: '#2fd8dd', sunCol: '#fff6de',
  };
  const PALETTE_AIR = {
    deep: '#0a3a55', shallow: '#1c8aa8', crest: '#cdf4ea',
    sky: '#a6e0ff', sunCol: '#fff6de',
  };
  const _pa = new THREE.Color(), _pb = new THREE.Color(), _pm = new THREE.Color();
  const _mixed = {};
  /* `t` is zero underwater and one in the air. Reuses one set of Colors
     rather than allocating five a frame for something that runs sixty
     times a second for three minutes. */
  function paletteFor(t) {
    for (const k of ['deep', 'shallow', 'crest', 'sky', 'sunCol']) {
      _pa.set(PALETTE[k]); _pb.set(PALETTE_AIR[k]);
      _mixed[k] = _pm.copy(_pa).lerp(_pb, t).getHex();
    }
    return _mixed;
  }

  /* Must run before Sky.build() by the same rule as its cousins — and
     after Water.build(), which resets the palette to the ocean's. */
  function apply(cond) {
    const r = resolve(cond);
    Sky.setPreset(r.time.sky);
    // a sea loch: enough movement overhead to catch the light, no chop
    Water.setSeaState(r.water.calm
      ? { swell: 0.16, chop: 0.10, wind: r.current }
      : { swell: 0.34, chop: 0.26, wind: r.current });
    Water.setPalette(PALETTE);
    return r;
  }

  const lights = () => Conditions.lights({ time: 'noon' });
  const describe = (cond) => resolve(cond).water.name;
  const payout = (cond) => resolve(cond).water.payout;

  // how far you can see, as a multiplier on the depth ramp's fog
  const visibility = (cond) => resolve(cond).water.vis;
  const currentVector = (cond) => {
    const r = resolve(cond);
    const s = r.water.current || 0.8;
    return { x: Math.cos(r.current), z: Math.sin(r.current), strength: s };
  };

  return { WATERS, PALETTE, PALETTE_AIR, paletteFor, forSeed, resolve, apply,
           lights, describe, payout, visibility, currentVector };
})();
