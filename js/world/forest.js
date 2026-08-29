/* ------------------------------------------------------------------
   forest.js — the woodland kit: ground, trees, undergrowth, the
   hunter's stand you shoot from, and the weather over all of it.

   The sea kit in course.js builds a corridor you travel down. This one
   builds a *place you stand in* and look around from, so everything here
   is polar: bands of density around the clearing, a rim that lifts at
   the edge so the horizon is trees rather than sky, and a ground
   function you can ask about any (x, z) without touching the mesh —
   which is what arrows need when they land.
------------------------------------------------------------------ */
const ForestKit = (() => {

  /* =============== noise =============== */

  // 2D value noise. U.noise1 is one-dimensional, and two of those crossed
  // gives you visible stripes along the axes, which reads as a bug.
  function hash2(i, j, seed) {
    let t = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return t - Math.floor(t);
  }
  function noise2(x, z, seed) {
    const i = Math.floor(x), j = Math.floor(z);
    const fx = x - i, fz = z - j;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash2(i, j, seed), b = hash2(i + 1, j, seed);
    const c = hash2(i, j + 1, seed), d = hash2(i + 1, j + 1, seed);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v) * 2 - 1;
  }
  function fbm2(x, z, oct, seed) {
    let a = 0.5, s = 0, f = 1;
    for (let i = 0; i < oct; i++) { s += a * noise2(x * f, z * f, seed + i * 17); a *= 0.5; f *= 2.07; }
    return s;
  }

  const COL = {
    grass:     new THREE.Color('#4fae54'),
    grassDry:  new THREE.Color('#8fb355'),
    grassDeep: new THREE.Color('#2f7f45'),
    moss:      new THREE.Color('#3f9a5e'),
    dirt:      new THREE.Color('#7a5a3c'),
    rock:      new THREE.Color('#6d7482'),
    bark:      new THREE.Color('#4a3526'),
    barkPale:  new THREE.Color('#7d6a55'),
    pine:      new THREE.Color('#2c6e42'),
    leaf:      new THREE.Color('#59a83f'),
    leafGold:  new THREE.Color('#c9963f'),
  };

  /* =============== ground =============== */

  /* The shape of the wood, as a plain function. The mesh is built from
     it, and so is every question an arrow or a spawner asks later. */
  function makeGround(rng, o) {
    const s1 = rng() * 900, s2 = rng() * 900;
    const clear = o.clearing, rim = o.radius;
    return function heightAt(x, z) {
      const r = Math.hypot(x, z);
      const rolls = fbm2(x * 0.0062, z * 0.0062, 4, s1) * 15
                  + fbm2(x * 0.021, z * 0.021, 3, s2) * 2.6;
      // the bowl: ground lifts towards the treeline so you are looking
      // slightly up into the wood wherever you turn
      const bowl = Math.pow(U.smoothstep(0.30, 1.0, r / rim), 1.6) * 34;
      // and it is dead flat where you stand, or the stand would float
      const flat = U.smoothstep(clear * 0.55, clear * 1.5, r);
      return (rolls + bowl) * flat;
    };
  }

  function buildGround(heightAt, rng, o) {
    const RINGS = 40, SECTORS = 76;
    const pos = [], col = [];
    const c = new THREE.Color();
    const radiusAt = (t) => o.radius * (t * t * 0.86 + t * 0.14);

    const paint = (x, y, z, slope) => {
      const r = Math.hypot(x, z);
      const n = fbm2(x * 0.03, z * 0.03, 3, 5);
      // grass by default, drying out in the open and going dark under
      // the canopy, with dirt on anything steep
      c.copy(COL.grass)
        .lerp(COL.grassDry, U.clamp(n * 0.5 + 0.35, 0, 1) * U.smoothstep(o.radius * 0.5, 0, r))
        .lerp(COL.grassDeep, U.smoothstep(o.clearing * 2.2, o.radius * 0.75, r) * 0.75)
        .lerp(COL.moss, U.clamp(fbm2(x * 0.08, z * 0.08, 2, 31) * 0.5 + 0.2, 0, 0.4))
        .lerp(COL.dirt, U.smoothstep(0.45, 1.1, slope))
        .lerp(COL.rock, U.smoothstep(0.9, 1.7, slope));
      // a worn ring of bare earth around the stand
      c.lerp(COL.dirt, U.smoothstep(o.clearing * 1.25, o.clearing * 0.7, r) * 0.55);
      // and a fine patchiness on top, so a five-metre triangle does not
      // read as a five-metre triangle
      const patch = fbm2(x * 0.14, z * 0.14, 2, 77);
      c.offsetHSL(patch * 0.012, patch * 0.05, patch * 0.055);
      // The ground is the one big surface here that faces straight up into
      // the sun, and the light rig is built for a sea with a shader of its
      // own: left at face value every one of these colours clips to white.
      return c.multiplyScalar(0.40);
    };

    const P = (t, k) => {
      const a = (k / SECTORS) * Math.PI * 2;
      // jitter the lattice so the ground does not read as a dartboard
      const jr = 1 + (hash2(Math.round(t * 977), k, 3) - 0.5) * 0.22;
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
    grid[0] = grid[0].map(p => ({ x: 0, z: 0, y: heightAt(0, 0) }));

    const tri = (a, b, cc) => {
      const nx = (b.y - a.y), nz = (cc.y - a.y);
      const run = Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z));
      const slope = Math.abs(nx) / run + Math.abs(nz) / run * 0.5;
      const mx = (a.x + b.x + cc.x) / 3, mz = (a.z + b.z + cc.z) / 3;
      const my = (a.y + b.y + cc.y) / 3;
      const cl = paint(mx, my, mz, slope);
      for (const p of [a, b, cc]) {
        pos.push(p.x, p.y, p.z);
        col.push(cl.r, cl.g, cl.b);
      }
    };

    for (let i = 0; i < RINGS; i++) {
      const A = grid[i], B = grid[i + 1];
      for (let k = 0; k < SECTORS; k++) {
        const k2 = (k + 1) % SECTORS;
        // wound so the normals come out pointing at the sky; the other way
        // round the whole wood is face-culled and you see straight through
        // the floor into the sky dome
        tri(A[k], B[k2], B[k]);
        tri(A[k], A[k2], B[k2]);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
    }));
    mesh.name = 'forest-ground';

    // a skirt so the world does not end in a visible edge under the fog
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(o.radius * 0.995, o.radius * 1.9, 90, SECTORS, 1, true),
      new THREE.MeshLambertMaterial({ color: '#12291b', side: THREE.DoubleSide, flatShading: true })
    );
    skirt.position.y = heightAt(o.radius, 0) - 44;
    const group = new THREE.Group();
    group.add(mesh, skirt);
    return group;
  }

  /* =============== flora =============== */

  function paintGeo(geo, color) {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    return geo;
  }

  function speciesGeometry(kind, rng) {
    const parts = [];
    const trunkCol = COL.bark.clone().offsetHSL(0, 0, rng.range(-0.04, 0.04));

    if (kind === 'pine') {
      const t = new THREE.CylinderGeometry(0.34, 0.62, 6.5, 6);
      t.translate(0, 3.25, 0);
      parts.push(paintGeo(t.toNonIndexed(), trunkCol));
      const tiers = [[3.9, 7.4, 6.6], [3.0, 6.4, 10.6], [2.0, 5.2, 14.2], [1.1, 3.4, 17.4]];
      for (const [rad, h, y] of tiers) {
        const cone = new THREE.ConeGeometry(rad, h, 8, 1);
        cone.translate(0, y, 0);
        parts.push(paintGeo(cone.toNonIndexed(), COL.pine));
      }
    } else if (kind === 'broadleaf') {
      const t = new THREE.CylinderGeometry(0.42, 0.85, 8.4, 6);
      t.translate(0, 4.2, 0);
      parts.push(paintGeo(t.toNonIndexed(), trunkCol));
      const blobs = [[4.4, 0, 10.4, 0], [3.1, -3.0, 9.0, 1.4], [2.9, 2.7, 9.4, -1.6],
                     [2.6, 0.4, 13.6, 0.8]];
      for (const [rad, dx, y, dz] of blobs) {
        const b = new THREE.IcosahedronGeometry(rad, 0);
        b.scale(1, 0.82, 1);
        b.translate(dx, y, dz);
        parts.push(paintGeo(b.toNonIndexed(), COL.leaf));
      }
    } else if (kind === 'dead') {
      const t = new THREE.CylinderGeometry(0.22, 0.72, 11.5, 5);
      t.translate(0, 5.75, 0);
      parts.push(paintGeo(t.toNonIndexed(), COL.barkPale));
      for (const [ang, y, len] of [[0.5, 7.4, 3.4], [3.6, 5.6, 2.8], [2.1, 9.0, 2.2]]) {
        const b = new THREE.CylinderGeometry(0.12, 0.24, len, 4);
        b.rotateZ(1.05);
        b.rotateY(ang);
        b.translate(Math.cos(ang) * len * 0.35, y, Math.sin(ang) * len * 0.35);
        parts.push(paintGeo(b.toNonIndexed(), COL.barkPale));
      }
    } else if (kind === 'bush') {
      for (const [rad, dx, y, dz] of [[1.5, 0, 1.1, 0], [1.1, 1.3, 0.9, 0.5], [1.0, -0.9, 1.0, -0.9]]) {
        const b = new THREE.IcosahedronGeometry(rad, 0);
        b.scale(1.15, 0.8, 1.15);
        b.translate(dx, y, dz);
        parts.push(paintGeo(b.toNonIndexed(), COL.leaf.clone().offsetHSL(0.02, 0, -0.08)));
      }
    } else { // fern
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const f = new THREE.ConeGeometry(0.30, 1.9, 4, 1);
        f.rotateZ(0.55);
        f.rotateY(a);
        f.translate(Math.cos(a) * 0.42, 0.95, Math.sin(a) * 0.42);
        parts.push(paintGeo(f.toNonIndexed(), COL.grassDeep.clone().offsetHSL(0, 0.05, 0.03)));
      }
    }
    for (const p of parts) p.computeVertexNormals();
    return Sky.mergeGeometries(parts);
  }

  /* Wind lives in the material, not in the update loop: 700 swaying trees
     is one uniform and a line of GLSL, or 700 matrix rebuilds a frame. */
  function windMaterial(uniforms, lo = 0.4, hi = 14.0, gain = 1) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWindT = uniforms.time;
      sh.uniforms.uWind = uniforms.wind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uWindT; uniform vec3 uWind;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 iPos = vec3(0.0);
          #endif
          float sway = smoothstep(SWAY_LO, SWAY_HI, transformed.y) * uWind.z * SWAY_GAIN;
          float ph = iPos.x * 0.09 + iPos.z * 0.07;
          float w = sin(uWindT * 1.35 + ph) * 0.62 + sin(uWindT * 2.7 + ph * 1.7) * 0.38;
          transformed.xz += uWind.xy * sway * w;`)
        .replace(/SWAY_LO/g, lo.toFixed(2))
        .replace(/SWAY_HI/g, hi.toFixed(2))
        .replace(/SWAY_GAIN/g, gain.toFixed(2));
    };
    // two materials that compile different code must not share a cache key
    mat.customProgramCacheKey = () => 'wind' + lo + '_' + hi + '_' + gain;
    return mat;
  }

  function scatter(rng, heightAt, o) {
    const spots = [];
    const cell = 9;                     // a crude spatial hash keeps trees apart
    const taken = new Map();
    const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    const free = (x, z, minD) => {
      const i0 = Math.floor((x - minD) / cell), i1 = Math.floor((x + minD) / cell);
      const j0 = Math.floor((z - minD) / cell), j1 = Math.floor((z + minD) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const list = taken.get(i + ',' + j);
        if (!list) continue;
        for (const p of list) if ((p.x - x) ** 2 + (p.z - z) ** 2 < minD * minD) return false;
      }
      return true;
    };
    const mark = (x, z) => {
      const k = key(x, z);
      if (!taken.has(k)) taken.set(k, []);
      taken.get(k).push({ x, z });
    };

    /* Three bands, because sightlines are gameplay: nothing at all where
       you stand, scattered cover in the field you shoot across, and a
       proper wall of wood behind that to hold the horizon. */
    const bands = [
      { r0: o.clearing * 1.6, r1: 78, n: 52, minD: 12, kinds: ['broadleaf', 'dead', 'pine'], s: [0.6, 1.0] },
      { r0: 72, r1: 168, n: 240, minD: 8.5, kinds: ['pine', 'broadleaf', 'pine', 'dead'], s: [0.85, 1.35] },
      { r0: 168, r1: o.radius * 0.97, n: 460, minD: 9.5, kinds: ['pine', 'pine', 'broadleaf'], s: [1.0, 1.7] },
    ];
    for (const b of bands) {
      let placed = 0;
      for (let i = 0; i < b.n * 4 && placed < b.n; i++) {
        const a = rng() * Math.PI * 2;
        const r = U.lerp(b.r0, b.r1, Math.sqrt(rng()));
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!free(x, z, b.minD)) continue;
        mark(x, z);
        placed++;
        spots.push({
          x, z, y: heightAt(x, z), band: b,
          kind: b.kinds[(rng() * b.kinds.length) | 0],
          s: rng.range(b.s[0], b.s[1]),
          rot: rng() * Math.PI * 2,
        });
      }
    }
    return spots;
  }

  function instance(geo, mat, list, rng, tintFn) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const d = new THREE.Object3D();
    const colors = new Float32Array(list.length * 3);
    const c = new THREE.Color();
    list.forEach((sp, i) => {
      d.position.set(sp.x, sp.y - 0.3, sp.z);
      d.rotation.set(rng.range(-0.05, 0.05), sp.rot, rng.range(-0.05, 0.05));
      d.scale.set(sp.s * rng.range(0.9, 1.1), sp.s * rng.range(0.92, 1.18), sp.s * rng.range(0.9, 1.1));
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      tintFn(c, sp, rng);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* Ground detail: the difference between "a green field with trees on
     it" and somewhere that looks like it grew. All instanced, all inside
     the range you actually walk and look at. */
  function detailGeometry(kind, rng) {
    const parts = [];
    if (kind === 'grass') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rng() * 0.5;
        const blade = new THREE.ConeGeometry(0.055, 0.62 + rng() * 0.4, 3, 1);
        blade.translate(0, 0.3, 0);
        blade.rotateX(Math.sin(a) * 0.4);
        blade.rotateZ(Math.cos(a) * 0.4);
        blade.translate(Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11);
        parts.push(paintGeo(blade.toNonIndexed(), COL.grassDeep.clone().offsetHSL(0, 0.06, 0.06)));
      }
    } else if (kind === 'flower') {
      const stem = new THREE.CylinderGeometry(0.018, 0.022, 0.42, 3);
      stem.translate(0, 0.21, 0);
      parts.push(paintGeo(stem.toNonIndexed(), COL.grassDeep));
      const head = new THREE.IcosahedronGeometry(0.09, 0);
      head.translate(0, 0.46, 0);
      parts.push(paintGeo(head.toNonIndexed(), new THREE.Color('#ffffff')));
    } else if (kind === 'mushroom') {
      const stalk = new THREE.CylinderGeometry(0.05, 0.07, 0.22, 5);
      stalk.translate(0, 0.11, 0);
      parts.push(paintGeo(stalk.toNonIndexed(), new THREE.Color('#e8dfc8')));
      const cap = new THREE.SphereGeometry(0.15, 6, 4, 0, 6.28, 0, Math.PI / 2);
      cap.scale(1, 0.7, 1);
      cap.translate(0, 0.21, 0);
      parts.push(paintGeo(cap.toNonIndexed(), new THREE.Color('#c0392b')));
    } else if (kind === 'rock') {
      const r = new THREE.IcosahedronGeometry(0.42, 0);
      r.scale(1.3, 0.7, 1.1);
      r.translate(0, 0.16, 0);
      parts.push(paintGeo(r.toNonIndexed(), COL.rock));
    } else { // log
      const l = new THREE.CylinderGeometry(0.36, 0.42, 3.6, 6);
      l.rotateZ(Math.PI / 2);
      l.translate(0, 0.36, 0);
      parts.push(paintGeo(l.toNonIndexed(), COL.bark.clone().offsetHSL(0, 0, 0.08)));
      for (const dx of [-1.1, 0.9]) {
        const stub = new THREE.CylinderGeometry(0.1, 0.13, 0.8, 4);
        stub.rotateZ(0.7);
        stub.translate(dx, 0.7, 0.15);
        parts.push(paintGeo(stub.toNonIndexed(), COL.bark));
      }
    }
    for (const p of parts) p.computeVertexNormals();
    return Sky.mergeGeometries(parts);
  }

  /* A dark disc under everything that stands up. There are no shadow maps
     here — three lights and eight hundred instances would not survive one —
     but the eye only really wants to know where a thing meets the ground,
     and a soft blob does that for nothing. */
  function buildContactShadows(spots) {
    if (!spots.length) return null;
    const geo = new THREE.CircleGeometry(1, 12);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      // the same soft dot the particles use, tinted to the colour of shade:
      // a hard-edged disc on a flat-shaded field reads as a hole in it
      map: FXTex.dotTexture(),
      color: '#12301d', transparent: true, opacity: 0.34, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const d = new THREE.Object3D();
    spots.forEach((sp, i) => {
      d.position.set(sp.x, sp.y + 0.05, sp.z);
      d.rotation.set(0, Math.random() * 6.28, 0);
      d.scale.setScalar(sp.r);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    return mesh;
  }

  /* =============== the stand =============== */

  function buildStand(heightAt, o) {
    const g = new THREE.Group();
    const wood = (col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true });
    const deckMat = wood('#6b4b32'), postMat = wood('#4f3624');

    const deck = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.0, 0.7, 10), deckMat);
    deck.position.y = o.standHeight;
    g.add(deck);

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, o.standHeight + 1.1, 5), postMat);
      post.position.set(Math.cos(a) * 4.6, (o.standHeight + 0.5) * 0.5, Math.sin(a) * 4.6);
      g.add(post);
      // A rail, low enough to frame the bottom of the view rather than
      // fence off the treeline, with a gap at the front — which is the way
      // you are facing when the run starts.
      if (Math.abs(U.wrapAngle(a - Math.PI * 1.5)) > 0.8) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 5), postMat);
        rail.position.set(Math.cos(a) * 4.6, o.standHeight + 0.8, Math.sin(a) * 4.6);
        rail.rotation.set(Math.PI / 2, 0, -a);
        g.add(rail);
      }
    }
    // legs down to whatever the ground is doing under each one
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const x = Math.cos(a) * 3.4, z = Math.sin(a) * 3.4;
      const gy = heightAt(x, z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, o.standHeight - gy + 1, 5), postMat);
      leg.position.set(x, gy + (o.standHeight - gy) * 0.5, z);
      g.add(leg);
    }

    // A quiver of spare arrows, out at the deck edge and knee height: it
    // has to say "this is your spot" from the corner of your eye without
    // ever standing between you and something you were about to shoot.
    const qx = 3.9, qz = 2.4;
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.26, 0.85, 7), wood('#7a5230'));
    quiver.position.set(qx, o.standHeight + 0.75, qz);
    g.add(quiver);
    for (let i = 0; i < 6; i++) {
      const dx = (i % 3 - 1) * 0.11, dz = (((i / 3) | 0) - 0.5) * 0.13;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.1, 4), wood('#d9c9a8'));
      shaft.position.set(qx + dx, o.standHeight + 1.5, qz + dz);
      shaft.rotation.z = (i - 2.5) * 0.035;
      g.add(shaft);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), wood(i % 2 ? '#e5133f' : '#f2c14e'));
      fl.position.set(shaft.position.x + (i - 2.5) * 0.02, o.standHeight + 2.02, shaft.position.z);
      g.add(fl);
    }
    // A fire on the ground beside the stand: somewhere for the eye to
    // rest, and the only warm light in the wood at night.
    const fire = new THREE.Group();
    fire.position.set(-5.6, heightAt(-5.6, 3.2), 3.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.22, 4, 9),
                                new THREE.MeshLambertMaterial({ color: '#6d7482', flatShading: true }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.14;
    fire.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.5, 4), wood('#4a3526'));
      log.position.set(Math.cos(a) * 0.35, 0.45, Math.sin(a) * 0.35);
      log.rotation.set(Math.cos(a) * 0.7, a, Math.sin(a) * 0.7);
      fire.add(log);
    }
    const flames = [];
    for (let i = 0; i < 4; i++) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.34 - i * 0.06, 1.0 + i * 0.25, 5),
                                new THREE.MeshBasicMaterial({
                                  color: i < 2 ? '#ffd166' : '#ff7a2c',
                                  transparent: true, opacity: 0.85 - i * 0.12 }));
      fl.position.y = 0.7 + i * 0.16;
      fire.add(fl);
      flames.push(fl);
    }
    const fireLight = new THREE.PointLight('#ff9c42', 2.4, 26, 2);
    fireLight.position.y = 1.2;
    fire.add(fireLight);
    fire.userData.flames = flames;
    fire.userData.light = fireLight;
    g.add(fire);
    g.userData.fire = fire;

    return g;
  }

  /* =============== drifting motes =============== */

  /* Leaves near the player, wrapped into a box that follows the camera —
     the cheapest thing in the world that makes air feel like air. */
  function buildMotes(rng, count, opts) {
    const pos = new Float32Array(count * 3);
    const seedv = new Float32Array(count);
    const box = opts.box || 70;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rng() - 0.5) * box;
      pos[i * 3 + 1] = rng() * 26;
      pos[i * 3 + 2] = (rng() - 0.5) * box;
      seedv[i] = rng() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.PointsMaterial({
      color: opts.color || '#cfe6a8', size: opts.size || 0.5,
      transparent: true, opacity: opts.opacity ?? 0.75, depthWrite: false,
      map: FXTex.dotTexture(), sizeAttenuation: true,
    });
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    points.renderOrder = 3;

    return {
      points,
      update(dt, wind, centre, fall) {
        const a = g.attributes.position.array;
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          a[i3] += (wind.x * 2.2 + Math.sin(seedv[i] + a[i3 + 1] * 0.2) * 0.5) * dt;
          a[i3 + 2] += (wind.y * 2.2 + Math.cos(seedv[i] * 1.3) * 0.5) * dt;
          a[i3 + 1] -= fall * dt;
          // wrap around the listener instead of respawning
          const half = box * 0.5;
          if (a[i3] - centre.x > half) a[i3] -= box; else if (a[i3] - centre.x < -half) a[i3] += box;
          if (a[i3 + 2] - centre.z > half) a[i3 + 2] -= box; else if (a[i3 + 2] - centre.z < -half) a[i3 + 2] += box;
          if (a[i3 + 1] < centre.y - 12) a[i3 + 1] = centre.y + 26;
          if (a[i3 + 1] > centre.y + 30) a[i3 + 1] = centre.y - 10;
        }
        g.attributes.position.needsUpdate = true;
      },
    };
  }

  /* =============== the whole wood =============== */

  function build(scene, rng, opts = {}) {
    const o = Object.assign({
      radius: 440,
      clearing: 15,
      standHeight: 3.4,
      motes: 240,
      moteColor: '#d6e8a6',
      moteFall: 1.1,
    }, opts);

    const heightAt = makeGround(rng, o);
    const group = new THREE.Group();

    group.add(buildGround(heightAt, rng, o));

    const uniforms = {
      time: { value: 0 },
      wind: { value: new THREE.Vector3(0.6, 0.2, 1) },   // xz direction, z = strength
    };
    const mat = windMaterial(uniforms);

    const spots = scatter(rng, heightAt, o);
    const geos = {};
    const meshes = [];
    for (const kind of ['pine', 'broadleaf', 'dead']) {
      const list = spots.filter(s => s.kind === kind);
      if (!list.length) continue;
      geos[kind] = speciesGeometry(kind, rng);
      const m = instance(geos[kind], mat, list, rng, (c, sp, r) => {
        // far trees drift towards the fog, near ones keep their colour
        const d = Math.hypot(sp.x, sp.z) / o.radius;
        c.setHSL(0.30 + r.range(-0.04, 0.05), 0.48 + r.range(-0.1, 0.12), 0.52 + r.range(-0.1, 0.1));
        c.multiplyScalar(U.lerp(0.85, 0.5, d));
      });
      if (m) { m.name = 'trees-' + kind; meshes.push(m); group.add(m); }
    }

    // undergrowth only where you can see it — inside the near bands
    const underSpots = [];
    for (let i = 0; i < 520; i++) {
      const a = rng() * Math.PI * 2;
      const r = U.lerp(o.clearing * 1.1, 155, Math.sqrt(rng()));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      underSpots.push({ x, z, y: heightAt(x, z), s: rng.range(0.7, 1.6), rot: rng() * 6.28,
                        kind: rng() < 0.55 ? 'bush' : 'fern' });
    }
    const underMat = windMaterial(uniforms, 0.1, 2.4, 0.5);
    for (const kind of ['bush', 'fern']) {
      const list = underSpots.filter(s => s.kind === kind);
      geos[kind] = speciesGeometry(kind, rng);
      const m = instance(geos[kind], underMat, list, rng, (c, sp, r) => {
        c.setHSL(0.28 + r.range(-0.03, 0.06), 0.5, 0.42 + r.range(-0.08, 0.12));
        c.multiplyScalar(0.8);
      });
      if (m) { m.name = 'under-' + kind; meshes.push(m); group.add(m); }
    }

    /* The floor of the wood: grass, flowers, mushrooms, stones and fallen
       timber, thickest where you walk and thinning out towards the trees.
       This is most of the difference between a green field and a place. */
    const detailMat = windMaterial(uniforms, 0.05, 1.0, 0.35);
    const DETAIL = [
      { kind: 'grass', n: 2400, r0: 2.5, r1: 98, s: [0.9, 2.6],
        tint: (c, r) => c.setHSL(0.29 + r.range(-0.04, 0.05), 0.5, 0.36 + r.range(-0.06, 0.12)) },
      { kind: 'flower', n: 620, r0: 5, r1: 82, s: [0.9, 1.9],
        tint: (c, r) => c.setHSL(r.pick([0.10, 0.13, 0.75, 0.86, 0.55]), 0.62, 0.66) },
      { kind: 'mushroom', n: 220, r0: 10, r1: 110, s: [0.8, 1.8],
        tint: (c, r) => c.setHSL(r.pick([0.02, 0.09, 0.0]), 0.5, 0.5 + r.range(-0.1, 0.1)) },
      { kind: 'rock', n: 170, r0: 7, r1: 140, s: [0.6, 2.4],
        tint: (c, r) => c.setHSL(0.6, 0.06, 0.34 + r.range(-0.08, 0.12)) },
      { kind: 'log', n: 42, r0: 12, r1: 125, s: [0.7, 1.6],
        tint: (c, r) => c.setHSL(0.08, 0.28, 0.26 + r.range(-0.05, 0.08)) },
    ];
    for (const d of DETAIL) {
      const list = [];
      for (let i = 0; i < d.n; i++) {
        const a = rng() * Math.PI * 2;
        const r = U.lerp(d.r0, d.r1, Math.sqrt(rng()));
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        list.push({ x, z, y: heightAt(x, z) + 0.3, s: rng.range(d.s[0], d.s[1]),
                    rot: rng() * 6.28 });
      }
      geos[d.kind] = detailGeometry(d.kind, rng);
      const m = instance(geos[d.kind], d.kind === 'rock' || d.kind === 'log' ? mat : detailMat,
                         list, rng, (c, sp, r) => { d.tint(c, r); c.multiplyScalar(0.75); });
      if (m) { m.name = 'detail-' + d.kind; meshes.push(m); group.add(m); }
    }

    // and a shadow under everything with a trunk
    const shadowSpots = spots.map(sp => ({ x: sp.x, z: sp.z, y: sp.y, r: sp.s * 2.0 }))
      .concat(underSpots.filter(s => s.kind === 'bush')
        .map(sp => ({ x: sp.x, z: sp.z, y: sp.y, r: sp.s * 1.1 })));
    const shadows = buildContactShadows(shadowSpots);
    if (shadows) { shadows.name = 'contact-shadows'; group.add(shadows); }

    const stand = buildStand(heightAt, o);
    group.add(stand);
    const fire = stand.userData.fire;

    const motes = buildMotes(rng, o.motes, { color: o.moteColor, box: 80 });
    group.add(motes.points);

    // Trunks an arrow can bury itself in. Only the near ones: nothing is
    // going to reach the treeline, and 700 cylinder tests a frame is waste.
    const colliders = spots
      .filter(s => Math.hypot(s.x, s.z) < 190 && s.kind !== 'bush' && s.kind !== 'fern')
      .map(s => ({ x: s.x, z: s.z, r: (s.kind === 'dead' ? 0.7 : 0.95) * s.s,
                   y0: s.y - 1, y1: s.y + 14 * s.s }));

    scene.add(group);

    /* What you can stand on: the ground, or the deck when you are on it,
       with the last half-metre of the edge ramped so you walk up onto it
       instead of stepping through a wall. */
    function walkAt(x, z) {
      const g = heightAt(x, z);
      const r = Math.hypot(x, z);
      const on = 1 - U.smoothstep(4.4, 5.4, r);
      return U.lerp(g, Math.max(g, o.standHeight + 0.35), on);
    }

    return {
      group, heightAt, walkAt, colliders, uniforms,
      standY: o.standHeight,
      radius: o.radius,
      setWind(dirX, dirZ, strength) {
        uniforms.wind.value.set(dirX, dirZ, strength);
      },
      fire,
      update(dt, camPos) {
        uniforms.time.value += dt;
        motes.update(dt, { x: uniforms.wind.value.x, y: uniforms.wind.value.y },
                     camPos, o.moteFall);
        // the fire never repeats itself, which is what makes it read as fire
        if (fire) {
          const t = uniforms.time.value;
          fire.userData.flames.forEach((fl, i) => {
            const w = Math.sin(t * (7 + i * 2.3) + i) * 0.5 + Math.sin(t * 3.1 + i * 2) * 0.5;
            fl.scale.set(1 + w * 0.16, 1 + w * 0.3, 1 + w * 0.16);
            fl.rotation.z = w * 0.09;
          });
          fire.userData.light.intensity = 2.2 + Math.sin(t * 9.3) * 0.5 + Math.sin(t * 4.1) * 0.3;
        }
      },
      dispose() {
        Engine.disposeObject(group);
        for (const k in geos) geos[k].dispose();
        mat.dispose();
      },
    };
  }

  return { build, COL, noise2, fbm2 };
})();


/* ------------------------------------------------------------------
   ForestConditions — the weather dial for a wood.

   Time of day is borrowed wholesale from Conditions.TIMES: a sky preset
   and a light rig are not remotely nautical, and having two copies of
   "what does dusk look like" would guarantee they drift apart. The
   second dial is the one the sea does not have — what the air is doing —
   and it is real: wind pushes arrows and bends trees.
------------------------------------------------------------------ */
const ForestConditions = (() => {

  const WEATHERS = [
    { id: 'still', name: 'Still air', weight: 3, payout: 0.95, wind: 0.10, gust: 0.05,
      fog: { near: 90, far: 900 }, precip: null,
      blurb: 'Nothing moving but the quarry. No excuses either.' },
    { id: 'breeze', name: 'Light breeze', weight: 3, payout: 1.00, wind: 0.45, gust: 0.25,
      fog: { near: 80, far: 820 }, precip: null,
      blurb: 'Enough air to nudge a long shot off the mark.' },
    { id: 'mist', name: 'Ground mist', weight: 2, payout: 1.18, wind: 0.25, gust: 0.10,
      fog: { near: 45, far: 430 }, precip: null,
      blurb: 'You will hear them before you see them.' },
    { id: 'drizzle', name: 'Drizzle', weight: 2, payout: 1.12, wind: 0.55, gust: 0.30,
      fog: { near: 70, far: 620 }, precip: 'rain',
      blurb: 'Wet string, poor light, and quarry that will not sit still.' },
    { id: 'gale', name: 'Gale', weight: 1, payout: 1.32, wind: 1.55, gust: 0.85,
      fog: { near: 70, far: 700 }, precip: null,
      blurb: 'The wood is bending. Everything you loose gets shoved sideways.' },
    { id: 'snow', name: 'Snowfall', weight: 1, payout: 1.20, wind: 0.60, gust: 0.35,
      fog: { near: 60, far: 520 }, precip: 'snow',
      blurb: 'Big soft flakes between you and everything worth hitting.' },
  ];

  const byId = (id) => WEATHERS.find(w => w.id === id) || null;

  function weightedPick(list, rng) {
    let total = 0;
    for (const x of list) total += x.weight;
    let r = rng() * total;
    for (const x of list) { r -= x.weight; if (r <= 0) return x; }
    return list[list.length - 1];
  }

  function forSeed(seed) {
    const rng = U.makeRng((seed ^ 0x27d4eb2f) >>> 0);
    return {
      time: weightedPick(Conditions.TIMES, rng).id,
      weather: weightedPick(WEATHERS, rng).id,
      windDir: rng() * Math.PI * 2,
    };
  }

  function resolve(cond) {
    const c = cond || {};
    const time = Conditions.TIMES.find(t => t.id === c.time) || Conditions.TIMES[0];
    return {
      time,
      weather: byId(c.weather) || WEATHERS[1],
      windDir: c.windDir || 0,
    };
  }

  // must run before Sky.build(), like its seagoing cousin, because the
  // mountain haze is baked against the fog colour of the day
  function apply(cond) {
    const r = resolve(cond);
    Sky.setPreset(r.time.sky);
    return r;
  }

  const lights = (cond) => Conditions.lights({ time: resolve(cond).time.id });
  const describe = (cond) => {
    const r = resolve(cond);
    return r.weather.name + ' · ' + r.time.name;
  };
  const payout = (cond) => {
    const r = resolve(cond);
    return r.weather.payout * r.time.payout;
  };
  // the wind as a vector the arrows and the trees both read
  function windVector(cond) {
    const r = resolve(cond);
    return { x: Math.cos(r.windDir) * r.weather.wind, z: Math.sin(r.windDir) * r.weather.wind,
             strength: r.weather.wind, gust: r.weather.gust };
  }

  return { WEATHERS, forSeed, resolve, apply, lights, describe, payout, windVector };
})();
