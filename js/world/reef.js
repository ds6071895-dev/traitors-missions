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
  };

  /* The three bands, and everything that changes between them. This
     table *is* the depth ramp — the mission lerps through it every
     frame against the camera's own depth and hands the result to the
     fog, the water and the vignette. */
  const BANDS = [
    { id: 'shelf',  at: 0,
      fog: '#5fe6e0', near: 22, far: 260, caustic: 1.00, vignette: 0.00 },
    { id: 'wreck',  at: -22,
      fog: '#2ec6dd', near: 18, far: 200, caustic: 0.55, vignette: 0.35 },
    { id: 'trench', at: -46,
      fog: '#1f7ee0', near: 14, far: 150, caustic: 0.22, vignette: 0.80 },
  ];

  /* Where the depth ramp has got to at a given depth, as one object.
     Reused every frame, so it writes into `out` rather than allocating. */
  const _fogA = new THREE.Color(), _fogB = new THREE.Color();
  function bandAt(depth, out) {
    const o = out || { colour: new THREE.Color(), near: 0, far: 0, caustic: 0, vignette: 0 };
    const y = -Math.max(0, depth);
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
  function makeFloor(rng, o) {
    const s1 = rng() * 900, s2 = rng() * 900, s3 = rng() * 900;
    const R = o.radius;
    // where the canyon runs: a chord across the reef, so the trench is
    // reachable from more than one bearing
    const cutA = rng() * Math.PI * 2;
    const cutOff = U.lerp(-0.35, 0.35, rng()) * R;
    const cutW = U.lerp(26, 40, rng());
    const cutDeep = U.lerp(6, 11, rng());

    return function heightAt(x, z) {
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

      // and a flat pad under the mooring, or the boat sits in a dune
      const pad = 1 - U.smoothstep(6, 20, r);
      // nothing on this reef is deeper than a diver can come back from
      const h = Math.max(ramp + dune + heads + cut, -52);
      return U.lerp(h, -11.5, pad);
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
    const key = 'caus' + (opts.gain || 1).toFixed(2) + (opts.sway ? 's' + opts.sway : '');
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
            float c1 = rnoise(vReefPos.xz * 0.22 + vec2(uCausT * 0.10,  uCausT * 0.07));
            float c2 = rnoise(vReefPos.xz * 0.35 - vec2(uCausT * 0.13, -uCausT * 0.09));
            float caus = pow(max(c1 * c2, 0.0), 2.2) * uCausGain * vUpFacing * GAIN;
            gl_FragColor.rgb += vec3(0.55, 0.95, 0.90) * caus * 1.6;
          }`)
        .replace(/GAIN/g, (opts.gain === undefined ? 1 : opts.gain).toFixed(2));
    };
    // two materials that compile different code must not share a cache key
    mat.customProgramCacheKey = () => key;
    return mat;
  }

  /* =============== the seabed mesh =============== */

  function buildFloor(heightAt, rng, o) {
    const RINGS = 46, SECTORS = 84;
    const pos = [], col = [];
    const c = new THREE.Color();
    const radiusAt = (t) => o.radius * (t * t * 0.72 + t * 0.28) * 1.12;

    const paint = (x, y, z, slope) => {
      const r = Math.hypot(x, z);
      const t = U.clamp(r / o.radius, 0, 1);
      const n = fbm2(x * 0.03, z * 0.03, 3, 5);
      // pale sand on the shelf, going green-grey as it falls away, with
      // coral patches picked out on the shallow humps
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
      /* The floor faces straight up into the brightest light rig in the
         game, under a renderer with no tone mapping. Left at face value
         every one of these clips to white — the same trick, and the
         same number, the forest floor already uses. */
      return c.multiplyScalar(0.42);
    };

    const P = (t, k) => {
      const a = (k / SECTORS) * Math.PI * 2;
      const jr = 1 + (noise2(t * 977, k, 3) * 0.5) * 0.18;
      const r = radiusAt(t) * jr;
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

    const tri = (a, b, cc) => {
      const run = Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z));
      const slope = Math.abs(b.y - a.y) / run + Math.abs(cc.y - a.y) / run * 0.5;
      const mx = (a.x + b.x + cc.x) / 3, mz = (a.z + b.z + cc.z) / 3;
      const my = (a.y + b.y + cc.y) / 3;
      paint(mx, my, mz, slope);
      for (const p of [a, b, cc]) { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); }
    };

    for (let i = 0; i < RINGS; i++) {
      for (let k = 0; k < SECTORS; k++) {
        const k2 = (k + 1) % SECTORS;
        const A = grid[i][k], B = grid[i][k2], C = grid[i + 1][k], D = grid[i + 1][k2];
        tri(A, C, D); tri(A, D, B);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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
      // kelp wants light: it thins out as the floor falls away
      const y = heightAt(x, z);
      if (rng() > U.clamp(1 - U.smoothstep(-16, -40, y), 0.06, 1)) continue;
      spots.push({ x, z, y, s: rng.range(0.8, 2.0), rot: rng() * 6.28, kind: i % geos.length });
    }
    return { geos, spots };
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
      const a = rng() * Math.PI * 2, r = U.lerp(20, R, Math.sqrt(rng()));
      schools.push({ x: Math.cos(a) * r, z: Math.sin(a) * r,
                     y: heightAt(Math.cos(a) * r, Math.sin(a) * r) + rng.range(3, 12),
                     t: rng() * 10 });
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
            // a new place to be, always over the seabed and never above it
            sc.t = 5 + Math.random() * 9;
            const a = Math.random() * Math.PI * 2, r = U.lerp(15, R, Math.sqrt(Math.random()));
            sc.x = Math.cos(a) * r; sc.z = Math.sin(a) * r;
            sc.y = heightAt(sc.x, sc.z) + 3 + Math.random() * 12;
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
    }, opts);

    const uniforms = {
      time:    { value: 0 },
      caustic: { value: 1 },
      current: { value: new THREE.Vector3(0.7, 0.7, 1) },
    };

    const heightAt = makeFloor(rng, o);
    const group = new THREE.Group();
    const geos = [];
    const mats = [];

    // ---- the floor. Smooth-shaded: a surface this big rendered as
    // flat facets reads as broken geometry rather than as style.
    const floorGeo = buildFloor(heightAt, rng, o);
    const floorMat = causticMaterial(uniforms, { gain: 1.0, flat: false });
    geos.push(floorGeo); mats.push(floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.name = 'seabed';
    floor.frustumCulled = false;
    group.add(floor);

    // ---- the wreck, out on the slope where the middle tier lives
    const wa = rng() * Math.PI * 2, wr = U.lerp(o.radius * 0.42, o.radius * 0.56, rng());
    const wAt = { x: Math.cos(wa) * wr, z: Math.sin(wa) * wr };
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

    scene.add(group);

    const colliders = rocks.colliders.concat(wreck.colliders);

    return {
      group, heightAt, colliders, uniforms, radius: o.radius,
      wreck: { at: wAt, heading: wreck.heading, length: wreck.length },
      bandAt,

      setCurrent(x, z, strength) { uniforms.current.value.set(x, z, strength); },
      setCaustic(v) { uniforms.caustic.value = v; },

      update(dt, camPos) {
        uniforms.time.value += dt;
        const t = uniforms.time.value;
        // the shafts hang off the sun's bearing and are parked near the
        // camera, so there is always light coming down wherever you are
        for (const it of shafts.items) {
          it.m.position.set(camPos.x + it.ox, 6, camPos.z + it.oz);
          it.m.rotation.set(0.12, t * it.spin + it.ph, -0.16);
          it.m.material.opacity = 0.10 + 0.07 * (0.5 + 0.5 * Math.sin(t * 0.4 + it.ph));
        }
        const cur = uniforms.current.value;
        // snow drifts up, so the "fall" is negative
        motes.update(dt, { x: cur.x * 0.3, y: cur.y * 0.3 }, camPos, -0.6);
      },

      dispose() {
        Engine.disposeObject(group);
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
        shafts.mat.dispose();
        if (shafts.tex) shafts.tex.dispose();
      },
    };
  }

  return { build, COL, BANDS, bandAt, makeFloor, buildFloor, causticMaterial,
           buildRocks, buildWreck, buildKelp, buildShafts, buildShoal };
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

  /* The dive's own water palette. `sky` is a saturated aqua rather than
     a sky colour, because from underneath the surface's Fresnel is
     total internal reflection — it mirrors the water, not the air. */
  const PALETTE = {
    deep: '#1f7ee0', shallow: '#46dcf0', crest: '#b6fff2',
    sky: '#2fd8dd', sunCol: '#fff6de',
  };

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

  return { WATERS, PALETTE, forSeed, resolve, apply, lights, describe, payout,
           visibility, currentVector };
})();
