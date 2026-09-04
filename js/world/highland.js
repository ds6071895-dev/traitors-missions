/* ------------------------------------------------------------------
   highland.js — the hill the show happens on.

   `CourseKit` builds a corridor you travel down and `ForestKit` builds
   a place you stand in and look around from. This builds a place you
   look *out* from: one soft crest, grass to the ankle, and a horizon
   of hills and water with nothing between you and it.

   It is the same machinery as the wood — `ForestKit` exports its
   instancer, its wind material and its fire — under a different palette
   and one different rule: nothing here is flat-shaded. Hard facets read
   as style on a two-metre rock and as broken geometry on a two-hundred
   metre hillside, which is exactly the split `CourseKit.buildCliffs`
   makes when it puts its rock rows and its hills in separate groups.

   The grass is the whole point of the place, so it gets the budget: one
   instanced mesh of small three-blade clumps, thick where you can see
   individual blades and thinning out into painted ground before the eye
   can tell the difference. Each blade carries a base-to-tip brightness
   gradient in its vertex colours, and each clump a hue of its own on
   top — the two together are what stop forty thousand identical objects
   reading as a texture.

   The scenes dress it: a table at dusk, a fire at night. The hill does
   not know which night it is.
------------------------------------------------------------------ */
const HighlandKit = (() => {

  const COL = {
    grass:     new THREE.Color('#6fd06a'),   // the light vibrant one
    grassLit:  new THREE.Color('#a8e878'),
    grassDeep: new THREE.Color('#3f9a56'),
    heather:   new THREE.Color('#9a6fc4'),
    bracken:   new THREE.Color('#c39a4e'),
    rock:      new THREE.Color('#79808e'),
    rockDark:  new THREE.Color('#5b6270'),
    peat:      new THREE.Color('#6b533a'),
    farHill:   new THREE.Color('#57a86b'),
  };

  const fbm2 = (x, z, o, s) => ForestKit.fbm2(x, z, o, s);

  /* =============== the shape of the hill =============== */

  /* One broad crest with rolling shoulders, falling away past the rim
     into the glen the water sits in. A gaussian is used for the crest
     rather than a cone because its gradient is zero at the top, so the
     summit is naturally flat and nothing has to be levelled by hand.

     The rolls are gated on how far the crest has already fallen, and
     that is not a cosmetic choice. The camera settles on the summit and
     looks out; if any shoulder can out-top it, the shot is of a lump of
     grass. The gate makes that impossible rather than unlikely:

       height   = base + crest(r) + rolls · allow(r)
       allow(r) = clamp((peak − crest(r)) / gate, 0, 1)

     so a point is above the summit only if rolls · allow > peak − crest,
     and with allow = drop/gate that needs rolls > gate. Keep `gate` at
     or above the total roll amplitude and the summit is provably the
     highest ground on the hill, for every seed. `ROLL` is that budget,
     and ROLL_MAX is what fbm2 can actually reach: its octaves start at
     a half and halve, so it is bounded by just under one. */
  const ROLL = [
    { f: 0.0042, oct: 4, amp: 24 },     // the shoulders you see from the top
    { f: 0.016,  oct: 3, amp: 3.2 },    // ground you would notice walking
    { f: 0.058,  oct: 2, amp: 0.55 },   // and tussock
  ];
  const FBM_MAX = 0.9375;               // 0.5 + 0.25 + 0.125 + 0.0625
  const ROLL_MAX = ROLL.reduce((s, r) => s + r.amp * FBM_MAX, 0);

  function makeHill(rng, o) {
    const seeds = ROLL.map(() => rng() * 900);
    const gate = Math.max(o.rollGate || 0, ROLL_MAX);
    return function heightAt(x, z) {
      const r = Math.hypot(x, z);
      const crest = o.crest * Math.exp(-(r * r) / (2 * o.spread * o.spread));
      let rolls = 0;
      for (let i = 0; i < ROLL.length; i++) {
        rolls += fbm2(x * ROLL[i].f, z * ROLL[i].f, ROLL[i].oct, seeds[i]) * ROLL[i].amp;
      }
      const allow = U.clamp((o.crest - crest) / gate, 0, 1);
      const fall = -U.smoothstep(o.radius * 0.42, o.radius * 1.25, r) * o.fall;
      /* `base` lifts the whole hill clear of the water rather than
         sinking the water under the hill: the sea kit draws at y=0 and
         everything in it — the shells, the sampling, the fog — assumes
         so. Raising the land instead gets a real shoreline for free
         wherever the shoulders drop back through zero. */
      return o.base + crest + rolls * allow + fall;
    };
  }

  /* =============== ground =============== */

  function buildGround(heightAt, rng, o) {
    const RINGS = 54, SECTORS = 96;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    const fog = new THREE.Color(Sky.look ? Sky.look.fog : '#c8ebff');

    // rings bunch up close in, where you can see the triangles
    const radiusAt = (t) => o.radius * (t * t * 0.88 + t * 0.12);

    const paint = (x, y, z, slope, r) => {
      const n = fbm2(x * 0.019, z * 0.019, 3, 11);
      const patch = fbm2(x * 0.11, z * 0.11, 2, 71);
      c.copy(COL.grass)
        // the light catches the tops of the rolls and misses the hollows
        .lerp(COL.grassLit, U.clamp(n * 0.55 + 0.42, 0, 1) * 0.7)
        .lerp(COL.grassDeep, U.smoothstep(0.15, 0.75, slope) * 0.55)
        // heather where it is boggy and out of the wind
        .lerp(COL.heather, U.clamp(fbm2(x * 0.026, z * 0.026, 2, 41) * 0.7 + 0.12, 0, 0.34)
                           * U.smoothstep(o.flat * 1.4, o.radius * 0.6, r))
        .lerp(COL.bracken, U.clamp(fbm2(x * 0.033, z * 0.033, 2, 57) * 0.5, 0, 0.22))
        .lerp(COL.rock, U.smoothstep(0.85, 1.7, slope));
      c.offsetHSL(patch * 0.014, patch * 0.05, patch * 0.05);
      // and it fades into the weather like everything else out here
      c.lerp(fog, U.smoothstep(o.radius * 0.45, o.radius * 1.05, r) * 0.55);
      // the light rig is built for open water; taken at face value every
      // one of these clips to white
      return c.multiplyScalar(0.46);
    };

    const P = (t, k) => {
      const a = (k / SECTORS) * Math.PI * 2;
      const jr = 1 + (ForestKit.noise2(t * 61.7, k * 3.1, 3) * 0.5) * 0.14;
      const r = radiusAt(t) * jr;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return { x, z, y: heightAt(x, z), r };
    };

    // the centre point, then a ring per row
    const grid = [];
    for (let i = 0; i <= RINGS; i++) {
      const row = [];
      const t = i / RINGS;
      for (let k = 0; k < SECTORS; k++) row.push(i === 0 ? { x: 0, z: 0, y: heightAt(0, 0), r: 0 } : P(t, k));
      grid.push(row);
    }

    const slopeAt = (x, z) => {
      const d = 3.0;
      const dy = Math.abs(heightAt(x + d, z) - heightAt(x - d, z))
               + Math.abs(heightAt(x, z + d) - heightAt(x, z - d));
      return dy / (2 * d);
    };

    let v = 0;
    const index = new Map();
    for (let i = 0; i <= RINGS; i++) {
      for (let k = 0; k < SECTORS; k++) {
        const p = grid[i][k];
        pos.push(p.x, p.y, p.z);
        const cc = paint(p.x, p.y, p.z, slopeAt(p.x, p.z), p.r);
        col.push(cc.r, cc.g, cc.b);
        index.set(i + ':' + k, v++);
      }
    }
    for (let i = 0; i < RINGS; i++) {
      for (let k = 0; k < SECTORS; k++) {
        const k2 = (k + 1) % SECTORS;
        const a = index.get(i + ':' + k), b = index.get(i + ':' + k2);
        const cc = index.get((i + 1) + ':' + k), d = index.get((i + 1) + ':' + k2);
        /* Wound so the right-hand normal points *up*. `(a, c, b)` reads
           like the natural order for a ring/sector grid and is exactly
           backwards: it hands computeVertexNormals a downward normal,
           and a front-side hillside with downward normals is culled from
           anywhere you could stand on it. (The reef's seabed had the
           same inversion and it made the whole loch floor invisible.) */
        idx.push(a, b, cc, b, d, cc);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    // indexed and smooth: a hillside is not a diamond
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'hill-ground';
    return mesh;
  }

  /* =============== the grass =============== */

  /* One blade, built tall (a unit high) and scaled down per instance, so
     the wind material's height threshold means the same thing whatever
     size the blade ends up. The colour gradient from base to tip is
     baked in here; the per-instance colour multiplies over it. */
  function bladeGeometry(rng, segments = 3) {
    const w0 = 0.055;
    const bend = rng.range(0.18, 0.42) * (rng() < 0.5 ? -1 : 1);
    const lean = rng.range(0.0, 0.10);
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const w = w0 * (1 - t) * (1 - t * 0.35);
      const y = t;
      const z = bend * t * t + lean * t;
      pos.push(-w, y, z, w, y, z);
      // dark at the root where no light reaches, bright at the tip
      const b = 0.42 + t * t * 0.72;
      c.setRGB(b, b, b);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2, b = a + 1, cc = a + 2, d = a + 3;
      idx.push(a, cc, b, b, cc, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // three blades leaning different ways: one instance that reads as a tuft
  function tuftGeometry(rng, blades = 3) {
    const parts = [];
    for (let i = 0; i < blades; i++) {
      const b = bladeGeometry(rng, 3);
      const a = (i / blades) * Math.PI * 2 + rng() * 0.9;
      b.rotateY(a);
      b.scale(1, rng.range(0.72, 1.15), 1);
      b.translate(Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035);
      parts.push(b.toNonIndexed());
    }
    const g = Sky.mergeGeometries(parts);
    g.computeVertexNormals();
    return g;
  }

  /* Scatter, with a density that falls off outward: thick where a blade
     is a blade, thinning to nothing where it would be a pixel. Placed on
     a jittered lattice rather than uniformly at random, because true
     random clumps and gaps, and grass does neither. */
  function scatterGrass(heightAt, rng, o) {
    const list = [];
    const n = o.count;
    const R = o.radius;
    for (let i = 0; i < n; i++) {
      // sqrt keeps the area density even; the extra power biases inward
      const t = Math.pow(rng(), 0.68);
      const r = o.inner + (R - o.inner) * t;
      const a = rng() * Math.PI * 2;
      const jx = (rng() - 0.5) * 0.9, jz = (rng() - 0.5) * 0.9;
      const x = Math.cos(a) * r + jx, z = Math.sin(a) * r + jz;
      // a bald patch here and there, so it is a hillside and not a lawn
      if (fbm2(x * 0.045, z * 0.045, 2, 97) < -0.42) continue;
      list.push({ x, z, y: heightAt(x, z), rot: rng() * 6.283,
                  s: rng.range(o.size[0], o.size[1]) });
    }
    return list;
  }

  function instanceGrass(geo, mat, list, rng) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const d = new THREE.Object3D();
    const colors = new Float32Array(list.length * 3);
    const c = new THREE.Color();
    list.forEach((sp, i) => {
      d.position.set(sp.x, sp.y - 0.012, sp.z);
      d.rotation.set(rng.range(-0.06, 0.06), sp.rot, rng.range(-0.09, 0.09));
      d.scale.set(sp.s * rng.range(0.85, 1.15), sp.s * rng.range(0.8, 1.3),
                  sp.s * rng.range(0.85, 1.15));
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      /* Vibrant and light is the whole brief: a high lightness and a
         hue that stays on the yellow side of green. The spread is wide
         enough that no two neighbours match and narrow enough that it
         still reads as one field. */
      c.setHSL(0.255 + rng.range(-0.022, 0.038),
               0.58 + rng.range(-0.08, 0.14),
               0.60 + rng.range(-0.09, 0.10));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = 'grass';
    return mesh;
  }

  /* =============== the highlands round the edge =============== */

  /* A ring of overlapping smooth domes between the hill and the peak
     rings the sky already draws. They are hazed towards the fog by
     distance in their vertex colours, which is the same trick Sky uses
     and the reason they sit in the same air as it. */
  function buildHills(rng, o) {
    const parts = [];
    const c = new THREE.Color();
    const fog = new THREE.Color(Sky.look ? Sky.look.fog : '#c8ebff');
    const n = o.count;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.16, 0.16);
      const dist = rng.range(o.near, o.far);
      const h = rng.range(o.height[0], o.height[1]) * (1 - (dist - o.near) / (o.far - o.near) * 0.25);
      const w = rng.range(h * 2.1, h * 4.4);

      const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
      g.scale(w, h, w * rng.range(0.7, 1.25));
      g.rotateY(rng() * 6.283);
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      g.translate(x, o.baseY - h * 0.12, z);

      const pos = g.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const haze = U.smoothstep(o.near * 0.8, o.far * 1.25, dist);
      for (let v = 0; v < pos.count; v++) {
        const vy = (pos.getY(v) - o.baseY) / Math.max(1, h);
        c.copy(COL.farHill)
          .lerp(COL.heather, U.clamp(rng() * 0.16 + vy * 0.16, 0, 0.30))
          .lerp(COL.rock, U.smoothstep(0.72, 1.02, vy) * 0.55)
          .multiplyScalar(0.52)
          .lerp(fog, 0.24 + haze * 0.58);
        col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g.toNonIndexed());
    }
    const merged = Sky.mergeGeometries(parts);
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'far-hills';
    return mesh;
  }

  /* =============== dressing =============== */

  /* Everything below is one merged, flat-shaded, vertex-coloured mesh
     per kind. None of it moves and none of it is ever closer than the
     ten metres the stage lets you walk, so the only thing that matters
     about any of it is what it does to the silhouette between you and
     the water. */

  function paintPart(geo, col, shade = 0.14) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const pos = g.attributes.position, nrm = g.attributes.normal;
    const arr = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      c.copy(col).multiplyScalar(1 + nrm.getY(i) * shade + nrm.getX(i) * 0.06);
      for (let k = 0; k < 3; k++) {
        arr[(i + k) * 3] = c.r; arr[(i + k) * 3 + 1] = c.g; arr[(i + k) * 3 + 2] = c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  const merge = (parts, name) => {
    if (!parts.length) return null;
    const geo = Sky.mergeGeometries(parts);
    geo.computeVertexNormals();
    parts.forEach(p => p.dispose());
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true }));
    m.name = name;
    return m;
  };

  /* The circle. It was seven boxes in a ring and it now has the two
     things that make a stone circle read as one from a distance: stones
     of wildly different heights, and one pair with a lintel still across
     it. A fallen stone lying in the grass does the rest — a ring of
     upright stones all the same age looks installed. */
  function buildStones(heightAt, rng, o) {
    const parts = [];
    const rock = COL.rock.clone().multiplyScalar(0.62);
    const rockLo = COL.rockDark.clone().multiplyScalar(0.62);
    const put = (geo, x, y, z, rx, ry, rz, col) => {
      geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz);
      geo.translate(x, y, z);
      parts.push(paintPart(geo, col));
    };
    for (let i = 0; i < o.count; i++) {
      const a = (i / o.count) * Math.PI * 2 + rng.range(-0.22, 0.22);
      const r = rng.range(o.ring * 0.88, o.ring * 1.12);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const fallen = i === 2;
      const h = fallen ? rng.range(3.2, 4.2) : rng.range(2.6, 6.4);
      const w = rng.range(0.9, 1.9), d = rng.range(0.5, 1.0);
      const g = new THREE.BoxGeometry(w, h, d, 1, 2, 1);
      // taper the head of each stone so none of them is a pillar
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const t = (pos.getY(v) + h / 2) / h;
        pos.setX(v, pos.getX(v) * (1 - t * rng.range(0.10, 0.34)));
        pos.setZ(v, pos.getZ(v) * (1 - t * 0.18));
        pos.setY(v, pos.getY(v) + (rng() - 0.5) * 0.25);
      }
      if (fallen) {
        put(g, x, heightAt(x, z) + d * 0.6, z, Math.PI / 2 - 0.12, a, 0, rockLo);
      } else {
        put(g, x, heightAt(x, z) + h * 0.44, z,
            rng.range(-0.10, 0.10), a + rng.range(-0.4, 0.4), rng.range(-0.09, 0.09),
            rng() < 0.4 ? rockLo : rock);
      }
    }
    /* The trilithon: two uprights and a lintel, set just inside the ring
       and turned across the shot rather than along it. */
    const ta = -1.15, tr = o.ring * 0.74;
    const tx = Math.cos(ta) * tr, tz = Math.sin(ta) * tr;
    const ty = heightAt(tx, tz);
    for (const sx of [-1, 1]) {
      const px = tx + Math.cos(ta + Math.PI / 2) * sx * 1.5;
      const pz = tz + Math.sin(ta + Math.PI / 2) * sx * 1.5;
      put(new THREE.BoxGeometry(1.3, 5.4, 0.85), px, heightAt(px, pz) + 2.6, pz,
          0, ta, 0.02 * sx, rock);
    }
    put(new THREE.BoxGeometry(4.6, 0.85, 1.05), tx, ty + 5.5, tz, 0, ta, 0, rockLo);
    return merge(parts, 'stones');
  }

  /* Glacial erratics: single big boulders sitting on open grass where
     nothing put them. They are the cheapest possible sense of scale —
     three metres of rock at forty metres tells you how big the hill is
     in a way an unbroken sheet of green never can. */
  function buildErratics(heightAt, rng, o) {
    const parts = [];
    for (let i = 0; i < o.count; i++) {
      const a = rng() * Math.PI * 2;
      const r = o.inner + Math.pow(rng(), 0.6) * (o.outer - o.inner);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = rng.range(o.size[0], o.size[1]);
      const g = new THREE.IcosahedronGeometry(s, 0);
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const k = 1 + fbm2(pos.getX(v) * 1.4, pos.getZ(v) * 1.4, 2, i * 7) * 0.34;
        pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k * 0.72, pos.getZ(v) * k);
      }
      g.rotateY(rng() * 6.283);
      g.rotateZ(rng.range(-0.2, 0.2));
      g.translate(x, heightAt(x, z) + s * 0.32, z);
      const c = COL.rock.clone().lerp(COL.rockDark, rng()).multiplyScalar(0.58);
      parts.push(paintPart(g, c));
      // and a smaller one leaning on it, most of the time
      if (rng() < 0.6) {
        const s2 = s * rng.range(0.28, 0.5);
        const g2 = new THREE.IcosahedronGeometry(s2, 0);
        const ax = x + Math.cos(a + 1.9) * s * 1.1, az = z + Math.sin(a + 1.9) * s * 1.1;
        g2.translate(ax, heightAt(ax, az) + s2 * 0.4, az);
        parts.push(paintPart(g2, c.clone().multiplyScalar(1.08)));
      }
    }
    return merge(parts, 'erratics');
  }

  /* A dry-stone dyke: a run of them, following a wandering line over the
     shoulder and dropping out of sight over the rim. Built as one course
     of overlapping blocks rather than individual stones — from anywhere
     you can stand it is a grey line with texture in it, and forty
     thousand pebbles would be the same grey line. */
  function buildWalls(heightAt, rng, o) {
    const parts = [];
    for (let w = 0; w < o.runs; w++) {
      let a = rng() * Math.PI * 2;
      let r = rng.range(o.inner, o.inner * 1.8);
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      let dir = a + rng.range(-0.5, 0.5);
      const len = rng.int(o.length[0], o.length[1]);
      for (let i = 0; i < len; i++) {
        dir += fbm2(i * 0.22, w * 3.1, 2, 31) * 0.22;
        const step = 1.5;
        const nx = x + Math.cos(dir) * step, nz = z + Math.sin(dir) * step;
        const rr = Math.hypot(nx, nz);
        if (rr > o.outer) break;
        const y = heightAt(nx, nz);
        const h = 1.05 + fbm2(nx * 0.3, nz * 0.3, 2, 5) * 0.22;
        const g = new THREE.BoxGeometry(step * 1.18, h, 0.55, 1, 1, 1);
        g.rotateY(-dir);
        g.translate(nx, y + h * 0.42, nz);
        const c = COL.rock.clone().lerp(COL.rockDark, 0.25 + rng() * 0.5)
                                  .multiplyScalar(0.6);
        parts.push(paintPart(g, c));
        // the coping stones on top, set on edge, which is what a dyke is
        if (i % 2 === 0) {
          const g2 = new THREE.BoxGeometry(0.5, 0.4, 0.62);
          g2.rotateY(-dir);
          g2.rotateZ(rng.range(-0.3, 0.3));
          g2.translate(nx, y + h + 0.16, nz);
          parts.push(paintPart(g2, c.clone().multiplyScalar(1.12)));
        }
        x = nx; z = nz;
      }
    }
    return merge(parts, 'dykes');
  }

  /* The broch: a broken drum of a tower on the shoulder, roofless and
     half fallen, with the stair still in it. Every Scottish hill has
     one of these and it is the near-field thing that gives the castle
     out on the water something to rhyme with. */
  function buildRuin(heightAt, rng, o) {
    const parts = [];
    const cx = o.x, cz = o.z;
    const y0 = heightAt(cx, cz);
    const rock = COL.rock.clone().multiplyScalar(0.60);
    const dark = COL.rockDark.clone().multiplyScalar(0.60);
    const SEG = 22;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      // the wall stands tall on one side and is down to its footings on
      // the other, so it reads as a ruin from every angle
      const fall = 0.5 + 0.5 * Math.cos(a - 1.1);
      const h = o.height * (0.16 + fall * 0.84)
              * (1 + fbm2(i * 0.7, 0, 2, 13) * 0.16);
      const g = new THREE.BoxGeometry(o.thick, h, (Math.PI * 2 * o.radius / SEG) * 1.25);
      g.rotateY(-a);
      g.translate(cx + Math.cos(a) * o.radius, y0 + h / 2, cz + Math.sin(a) * o.radius);
      parts.push(paintPart(g, i % 3 ? rock : dark));
    }
    // a doorway you can see straight through, because there is nothing
    // behind it
    const da = 1.9;
    parts.push(paintPart((() => {
      const g = new THREE.BoxGeometry(o.thick * 1.4, 0.8, 2.4);
      g.rotateY(-da);
      g.translate(cx + Math.cos(da) * o.radius, y0 + 2.6, cz + Math.sin(da) * o.radius);
      return g;
    })(), dark));
    // fallen stone piled against the low side
    for (let i = 0; i < 14; i++) {
      const a = da + rng.range(-1.5, 1.5);
      const r = o.radius * rng.range(1.05, 1.7);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = rng.range(0.28, 0.75);
      const g = new THREE.IcosahedronGeometry(s, 0);
      g.rotateY(rng() * 6.283);
      g.translate(x, heightAt(x, z) + s * 0.4, z);
      parts.push(paintPart(g, rng() < 0.5 ? rock : dark));
    }
    return merge(parts, 'broch');
  }

  /* Pines, in copses. Scots pine grows in tight stands with open grass
     between them, so they are scattered around a handful of centres
     rather than over the whole hill — and every one of them is outside
     the grass radius, so the near ground is still nothing but grass. */
  function scatterPines(heightAt, rng, o) {
    const list = [];
    for (let c = 0; c < o.copses; c++) {
      const a = (c / o.copses) * Math.PI * 2 + rng.range(-0.5, 0.5);
      const r = rng.range(o.inner, o.outer);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const spread = rng.range(9, 22);
      const n = rng.int(o.per[0], o.per[1]);
      for (let i = 0; i < n; i++) {
        const ta = rng() * Math.PI * 2;
        const tr = Math.pow(rng(), 0.55) * spread;
        const x = cx + Math.cos(ta) * tr, z = cz + Math.sin(ta) * tr;
        const rr = Math.hypot(x, z);
        if (rr < o.inner * 0.8 || rr > o.outer * 1.35) continue;
        list.push({ x, z, y: heightAt(x, z), rot: rng() * 6.283,
                    s: rng.range(o.size[0], o.size[1]) });
      }
    }
    return list;
  }

  /* =============== the whole place =============== */

  function build(scene, rng, opts = {}) {
    const q = (GameState.settings && GameState.settings.quality) || 'high';
    const budget = q === 'low' ? 0.28 : q === 'medium' ? 0.58 : 1;

    const o = Object.assign({
      radius: 320,          // how far the walkable hill goes
      base: 40,             // how far the whole hill stands above the loch
      crest: 55,            // how high the summit stands over the shoulders
      spread: 135,          // how broad it is
      fall: 112,            // how far the ground drops past the rim
      flat: 16,             // the level patch at the top
      grassRadius: 120,
      grassInner: 0.6,
      grassCount: Math.round(13000 * budget),
      tuftCount: Math.round(1600 * budget),
      flowerCount: Math.round(700 * budget),
      motes: Math.round(220 * budget),
      moteColor: '#e8f7b0',
      hills: { count: 18, near: 520, far: 1750, height: [90, 260], baseY: -14 },
      stones: { count: 9, ring: 74 },
      erratics: { count: Math.round(26 * budget) || 8, inner: 20, outer: 180,
                  size: [1.1, 3.4] },
      dykes: { runs: Math.round(5 * budget) || 2, inner: 46, outer: 250,
               length: [40, 110] },
      ruin: { x: 58, z: -52, radius: 6.4, height: 7.6, thick: 1.5 },
      pines: { copses: Math.round(7 * budget) || 3, inner: 52, outer: 185,
               per: [7, 18], size: [0.5, 0.95] },
      /* The castle. It stands off the far shore, in the quarter of the
         loch the summit shots all look into — every named shot in
         `stage.js` looks roughly down −z, so this sits down −z and a
         little to the left of it, which puts it a third of the way
         across the frame rather than dead centre behind Claudia's
         head. */
      castle: { x: -132, z: -378, facing: 0.95, scale: 1.35 },
      night: false,
      water: true,
    }, opts);

    const heightAt = makeHill(rng, o);
    const group = new THREE.Group();
    group.name = 'highland';

    group.add(buildGround(heightAt, rng, o));
    group.add(buildHills(rng, o.hills));

    const dressing = [
      buildStones(heightAt, rng, o.stones),
      o.erratics && o.erratics.count ? buildErratics(heightAt, rng, o.erratics) : null,
      o.dykes && o.dykes.runs ? buildWalls(heightAt, rng, o.dykes) : null,
      o.ruin ? buildRuin(heightAt, rng, o.ruin) : null,
    ];
    dressing.forEach(m => { if (m) group.add(m); });

    /* One shared wind, exactly as the wood does it: the grass, the
       tufts and the flowers all read the same two uniforms, so the
       whole hillside moves as one weather rather than three. */
    const uniforms = {
      time: { value: 0 },
      wind: { value: new THREE.Vector3(0.7, 0.25, 1) },
    };

    const geos = [];
    const meshes = [];

    // the grass itself: short, dense, and the only thing here with a
    // vertex gradient of its own
    const grassMat = ForestKit.windMaterial(uniforms, 0.18, 1.0, 0.42);
    // the wood's kit flat-shades; grass wants the gradient it was built
    // with, and flatShading is a shader define rather than a uniform
    grassMat.flatShading = false;
    grassMat.side = THREE.DoubleSide;      // a blade seen edge-on is not a hole
    grassMat.needsUpdate = true;
    const tuftGeo = tuftGeometry(rng, 3);
    geos.push(tuftGeo);
    const blades = scatterGrass(heightAt, rng, {
      count: o.grassCount, radius: o.grassRadius, inner: o.grassInner, size: [0.13, 0.30] });
    const grass = instanceGrass(tuftGeo, grassMat, blades, rng);
    if (grass) { meshes.push(grass); group.add(grass); }

    // taller wisps, sparser and further out, to break the ankle line
    const wispGeo = tuftGeometry(rng, 4);
    geos.push(wispGeo);
    const wisps = scatterGrass(heightAt, rng, {
      count: o.tuftCount, radius: o.grassRadius * 1.7, inner: 3, size: [0.38, 0.78] });
    const wisp = instanceGrass(wispGeo, grassMat, wisps, rng);
    if (wisp) { wisp.name = 'wisps'; meshes.push(wisp); group.add(wisp); }

    // and wildflowers, which are what stop it being a golf course
    const flowerMat = ForestKit.windMaterial(uniforms, 0.05, 0.9, 0.30);
    const flowerGeo = ForestKit.detailGeometry('flower', rng);
    geos.push(flowerGeo);
    const flowerSpots = scatterGrass(heightAt, rng, {
      count: o.flowerCount, radius: o.grassRadius * 0.85, inner: 2.2, size: [0.5, 1.1] });
    const flowers = ForestKit.instance(flowerGeo, flowerMat, flowerSpots.map(
      s => ({ ...s, y: s.y + 0.3 })), rng, (c, sp, r) => {
        c.setHSL(r.pick([0.13, 0.16, 0.75, 0.86, 0.02, 0.55]), 0.55, 0.72);
        c.multiplyScalar(0.8);
      });
    if (flowers) { flowers.name = 'flowers'; meshes.push(flowers); group.add(flowers); }

    /* Pines. They share the grass's wind so the whole hillside moves as
       one weather, but they get their own material because a twenty
       metre tree that sways as hard as a blade of grass is a cartoon:
       the sway threshold starts at head height and the gain is a
       fraction of the grass's. */
    const treeMat = ForestKit.windMaterial(uniforms, 3.0, 20.0, 0.06);
    const pineGeo = ForestKit.speciesGeometry('pine', rng);
    geos.push(pineGeo);
    const pineSpots = scatterPines(heightAt, rng, o.pines);
    const pines = ForestKit.instance(pineGeo, treeMat, pineSpots, rng, (c, sp, r) => {
      c.setHSL(0.32 + r.range(-0.02, 0.03), 0.42 + r.range(-0.06, 0.10),
               0.36 + r.range(-0.06, 0.08));
    });
    if (pines) { pines.name = 'pines'; meshes.push(pines); group.add(pines); }

    // pollen in the light
    const motes = ForestKit.buildMotes(rng, o.motes, { color: o.moteColor, box: 70 });
    group.add(motes.points);

    /* The castle across the water. It is built last because it wants to
       know whether it is night, and it is added to the hill's own group
       so it goes away with everything else. */
    let castle = null;
    if (o.castle) {
      castle = CastleKit.build(U.makeRng(((rng() * 1e9) | 0) >>> 0 || 7), {
        x: o.castle.x, z: o.castle.z, facing: o.castle.facing,
        scale: o.castle.scale, night: !!o.night,
        lit: o.night ? 1 : (o.evening ? 0.45 : 0.06),
      });
      group.add(castle.group);
    }

    /* The loch in the glen. It is the sea kit, calmed right down and
       sunk below the rim, because a real moving surface out there is
       worth more than any amount of painted blue — and it is already
       written. */
    if (o.water) {
      Water.build(scene);
      // a loch, not a sea: enough movement to catch the light and no more
      Water.setSeaState({ swell: 0.17, chop: 0.12, wind: rng() * 6.283 });
    }

    scene.add(group);

    return {
      group, heightAt, uniforms, meshes, castle,
      radius: o.radius,
      hasWater: !!o.water,
      // where the eye goes: the top of the hill
      crest: { x: 0, y: heightAt(0, 0), z: 0 },
      // and where it goes when it wants somewhere to look *out* at
      landmark: castle ? castle.peak : null,
      setWind(x, z, strength) { uniforms.wind.value.set(x, z, strength); },
      update(dt, camPos, t) {
        uniforms.time.value += dt;
        motes.update(dt, { x: uniforms.wind.value.x, y: uniforms.wind.value.y }, camPos, 0.55);
        if (castle) castle.update(dt, t === undefined ? uniforms.time.value : t);
      },
      dispose() {
        Engine.disposeObject(group);
        for (const g of geos) g.dispose();
        grassMat.dispose();
        treeMat.dispose();
        flowerMat.dispose();
      },
    };
  }

  return { build, makeHill, buildGround, buildHills, buildStones, buildErratics,
           buildWalls, buildRuin, scatterPines, tuftGeometry, bladeGeometry,
           COL, ROLL_MAX };
})();
