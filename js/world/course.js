/* ------------------------------------------------------------------
   course.js — reusable "channel through the sea" world kit.

   Generates a winding path, the highland cliffs that wall it in, the
   rocks scattered inside it, and the channel-marker buoys. Any future
   racing/chase mission can reuse this by passing different options.
------------------------------------------------------------------ */
const CourseKit = (() => {

  const COL = {
    rockLow:   '#546071',
    rockHigh:  '#9aa0a6',
    rockWarm:  '#a08b6f',
    grass:     '#46cf72',
    grassDark: '#249a55',
    heather:   '#a06fd4',
    sand:      '#d9c48d',
    snow:      '#f2fbff',
  };

  /* =============== path =============== */

  class CoursePath {
    constructor(points, opts = {}) {
      this.curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
      this.length = this.curve.getLength();
      this.step = opts.step || 8;
      const n = Math.max(8, Math.ceil(this.length / this.step));
      this.n = n;
      this.pts = [];
      this.tans = [];
      this.half = [];               // channel half-width at each sample
      this.halfBase = [];           // ...before the structure squeezes it
      this.features = [];           // the throats and bays down its length
      this.cum = [];                // arc length at each sample
      const spaced = this.curve.getSpacedPoints(n);
      let acc = 0;
      for (let i = 0; i <= n; i++) {
        const p = spaced[i];
        this.pts.push(p);
        if (i > 0) acc += p.distanceTo(spaced[i - 1]);
        this.cum.push(acc);
        const t = this.curve.getTangentAt(Math.min(i / n, 1)).setY(0).normalize();
        this.tans.push(t);
        const w = opts.halfWidth || 62;
        const vary = opts.widthVary ?? 22;
        this.halfBase.push(w + U.fbm1(i * 0.055, 3, 91) * vary);
        this.half.push(this.halfBase[i]);
      }
      this.total = acc;
      if (opts.features) this.setFeatures(opts.features);
    }

    /* The channel's *structure*: a list of stretches that squeeze or open the
       water out. It is stored as a width profile rather than as objects, so
       the cliffs, the rocks, the buoys and the shore foam all follow the
       water without any of them having to know what a throat is. */
    setFeatures(list) {
      this.features = list || [];
      for (let i = 0; i <= this.n; i++) {
        this.half[i] = Math.max(MIN_HALF, this.halfBase[i] * this.widthScale(this.cum[i]));
      }
      return this;
    }

    widthScale(s) {
      let k = 1;
      for (const f of this.features) {
        // taper in and out over a third of the stretch, so a throat is a
        // funnel you can read from a long way off, not a wall that appears
        const b = Math.min(95, (f.s1 - f.s0) * 0.34);
        const e = U.smoothstep(f.s0 - b, f.s0 + b, s)
                * (1 - U.smoothstep(f.s1 - b, f.s1 + b, s));
        k *= U.lerp(1, f.scale, e);
      }
      return k;
    }

    // which stretch, if any, is s inside? Used by whoever is placing things.
    featureAt(s) {
      for (const f of this.features) if (s >= f.s0 && s <= f.s1) return f;
      return null;
    }

    // nearest sample to (x,z); `hint` makes this O(1) for a moving boat
    nearest(x, z, hint = -1) {
      let bi = 0, bd = Infinity;
      const search = (a, b) => {
        for (let i = Math.max(0, a); i <= Math.min(this.n, b); i++) {
          const p = this.pts[i];
          const dx = p.x - x, dz = p.z - z;
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; bi = i; }
        }
      };
      if (hint >= 0) {
        search(hint - 28, hint + 28);
        if (bd > 90000) { bd = Infinity; search(0, this.n); }   // lost — full scan
      } else search(0, this.n);
      return bi;
    }

    // full local frame: arc length, signed lateral offset, heading
    frame(x, z, hint = -1, out = {}) {
      const i = this.nearest(x, z, hint);
      const p = this.pts[i], t = this.tans[i];
      const dx = x - p.x, dz = z - p.z;
      const along = dx * t.x + dz * t.z;
      out.index = i;
      out.s = this.cum[i] + along;
      out.lateral = dx * -t.z + dz * t.x;   // +ve = right of the direction of travel
      out.half = this.half[i];
      out.point = p;
      out.tangent = t;
      out.heading = Math.atan2(t.x, t.z);
      return out;
    }

    at(s) {
      const u = U.clamp(s / this.total, 0, 1);
      const i = U.clamp(Math.round(u * this.n), 0, this.n);
      return { point: this.pts[i], tangent: this.tans[i], half: this.half[i], index: i };
    }
  }

  /* =============== structure ===============
     A corridor that is the same width from end to end is the same drive
     however the seed bends it: you hold the middle and steer. These are the
     exceptions to the corridor — a throat you have to thread and an open bay
     where the line is yours to choose — and they are what makes one channel
     a different job from another rather than the same one repainted.

     `rock` is a density multiplier: a bay wants a field of rock in it to be
     a decision at all, and a throat with rock in it is just unfair. */

  const FEATURES = [
    { kind: 'narrows', name: 'The Throat',  weight: 3,
      scale: [0.40, 0.55], len: [170, 290], rock: 0.25 },
    { kind: 'bay',     name: 'Open Water',  weight: 3,
      scale: [1.55, 1.95], len: [320, 470], rock: 2.4 },
  ];
  // however hard a throat squeezes, there has to be a line through it
  const MIN_HALF = 25;
  // plain corridor is 1, so the busiest stretch sets the scale for the rest
  const ROCK_DENSITY_MAX = FEATURES.reduce((m, f) => Math.max(m, f.rock), 1);

  // 2-4 stretches down the middle of the channel, with ordinary corridor
  // between them: structure you notice is structure you meet occasionally
  function planFeatures(rng, total) {
    const out = [];
    const guard = total * 0.90;
    let s = total * rng.range(0.13, 0.24);
    let weightTotal = 0;
    for (const f of FEATURES) weightTotal += f.weight;
    while (s < guard && out.length < 3) {
      let r = rng() * weightTotal, def = FEATURES[FEATURES.length - 1];
      for (const f of FEATURES) { r -= f.weight; if (r <= 0) { def = f; break; } }
      const len = rng.range(def.len[0], def.len[1]);
      if (s + len > guard) break;
      // three at most, with a long stretch of ordinary corridor between them:
      // structure you meet occasionally is structure you notice
      out.push({
        kind: def.kind, name: def.name, s0: s, s1: s + len,
        scale: rng.range(def.scale[0], def.scale[1]), rock: def.rock,
      });
      s += len + rng.range(330, 620);
    }
    return out;
  }

  function makePath(rng, opts = {}) {
    const segs = opts.segments || 20;
    const step = opts.segmentLength || 230;
    const pts = [];
    let x = 0, z = 0, h = 0;
    // a short straight run-up so the start line reads clearly
    pts.push(new THREE.Vector3(0, 0, -260));
    pts.push(new THREE.Vector3(0, 0, -90));
    let turn = 0;
    for (let i = 0; i < segs; i++) {
      pts.push(new THREE.Vector3(x, 0, z));
      // smooth the heading changes so there are sweepers, not kinks
      turn = U.lerp(turn, rng.range(-0.52, 0.52), 0.55);
      h += turn;
      h = U.clamp(h, -1.25, 1.25);
      x += Math.sin(h) * step;
      z += Math.cos(h) * step;
    }
    pts.push(new THREE.Vector3(x, 0, z));
    const path = new CoursePath(pts, opts);
    // the total is only known once the curve is sampled, so the structure is
    // planned against the channel that actually came out
    if (opts.features !== false && !opts.features) {
      path.setFeatures(planFeatures(rng, path.total));
    }
    return path;
  }

  /* =============== cliffs =============== */

  /* The wall is one indexed grid: columns follow the path, rows step outward
     and upward. Splitting it into two material groups is what fixes the
     "ugly slab" look — the rock rows stay hard-faceted (that is the style),
     while the hills behind them get smooth normals, because a 200 m hillside
     rendered as eight flat triangles reads as a bug, not as art. */

  // off = metres outward from the channel edge, hf = fraction of the local
  // wall height, kind = which palette the row is painted from
  const ROWS = [
    { off:    0, hf: -0.34, kind: 'rock' },   // below the waterline
    { off:  2.5, hf: -0.12, kind: 'rock' },
    { off:    5, hf:  0.08, kind: 'rock' },   // splash shelf
    { off:  8.5, hf:  0.30, kind: 'rock' },
    { off:   12, hf:  0.52, kind: 'rock' },
    { off: 15.5, hf:  0.71, kind: 'rock' },
    { off:   19, hf:  0.86, kind: 'rock' },
    { off:   23, hf:  0.96, kind: 'rock' },
    { off:   28, hf:  1.00, kind: 'edge' },   // the lip
    { off:   36, hf:  0.99, kind: 'land' },
    { off:   48, hf:  1.03, kind: 'land' },
    { off:   66, hf:  0.98, kind: 'land' },
    { off:   92, hf:  1.08, kind: 'land' },
    { off:  128, hf:  1.24, kind: 'land' },
    { off:  175, hf:  1.36, kind: 'land' },   // highland ridge
    { off:  235, hf:  1.20, kind: 'land' },
    { off:  310, hf:  0.96, kind: 'land' },
    { off:  400, hf:  0.74, kind: 'land' },
    { off:  510, hf:  0.55, kind: 'land' },
    { off:  650, hf:  0.38, kind: 'land' },
    { off:  830, hf:  0.24, kind: 'land' },
    { off: 1060, hf:  0.10, kind: 'land' },
  ];
  const LIP = 8;                       // first row that belongs to the land mesh

  function buildCliffs(path, rng, opts = {}) {
    const stride = opts.stride || 1;
    const baseH = opts.baseHeight ?? 26;
    const varH = opts.heightVary ?? 46;
    const wantTrees = opts.trees !== false;

    const pos = [], col = [], idxRock = [], idxLand = [];
    const c = new THREE.Color();
    const cStoneLo = new THREE.Color('#414f61'), cStoneHi = new THREE.Color('#9fa8b4');
    const cStoneWarm = new THREE.Color('#9c876b');
    const cWet = new THREE.Color('#1d3040'), cSplash = new THREE.Color('#dcf1ff');
    const cGrass = new THREE.Color('#4ecf78'), cGrassDk = new THREE.Color('#218c50');
    const cHeather = new THREE.Color('#9a6ac9'), cBracken = new THREE.Color('#c19a4e');
    const cSnow = new THREE.Color('#f4fbff'), cScree = new THREE.Color('#7d8494');

    const cols = [];
    for (let i = 0; i <= path.n; i += stride) cols.push(i);
    const NC = cols.length;

    const treeSpots = [];
    const grids = [];                  // one [row][col] vertex grid per side

    for (const side of [-1, 1]) {
      const base = pos.length / 3;
      const grid = ROWS.map(() => []);

      for (let ci = 0; ci < NC; ci++) {
        const i = cols[ci];
        const p = path.pts[i], t = path.tans[i];
        const nx = -t.z * side, nz = t.x * side;      // outward normal
        const u = i / path.n;
        const sd = side > 0 ? 100 : 0;

        // the wall's own height: a long roll plus a shorter, sharper term
        let hn = U.fbm1(i * 0.021 + sd, 4, 17) * 0.5 + 0.5;
        hn = Math.pow(U.clamp(hn, 0, 1), 1.25);
        let h = baseH + hn * varH;
        // open the walls out at the start and finish so both read as gates
        const ends = U.smoothstep(0, 0.05, u) * U.smoothstep(1, 0.95, u);
        h *= U.lerp(0.35, 1, ends);

        // Columnar jointing: a wobble that depends only on the column, so it
        // runs straight up the face like real basalt rather than smearing.
        const flute = (U.fbm1(i * 0.62 + sd, 2, 3) * 2.6 + Math.sin(i * 1.9 + sd) * 1.1);
        const buttress = U.fbm1(i * 0.13 + sd, 3, 61);

        for (let r = 0; r < ROWS.length; r++) {
          const row = ROWS[r];
          const rock = r <= LIP;
          // outward wobble: coarse for the land, fine + fluted for the rock
          const wob = U.fbm1(i * 0.14 + r * 7.3 + sd, 3, r * 5) * (5 + row.off * 0.17);
          const rib = rock ? flute * U.smoothstep(-0.25, 0.5, row.hf) * 2.8 : 0;
          // whole columns of stone pushed proud of the face, so the wall has
          // buttresses and gullies instead of one continuous ramp
          const bulk = rock ? buttress * 7.5 * U.smoothstep(-0.3, 0.7, row.hf) : 0;
          const off = path.half[i] + row.off + wob + rib + bulk;

          // height: the row's share of the wall, then a per-row undulation so
          // the hills roll in both directions instead of extruding
          let y = h * row.hf;
          if (rock) {
            y += U.fbm1(i * 0.34 + r * 2.1 + sd, 2, 5) * h * 0.10
               + U.fbm1(i * 0.88 + r * 5.9 + sd, 2, 41) * h * 0.045
               + buttress * h * 0.09 * U.smoothstep(0, 0.9, row.hf);
          } else {
            const relief = 14 + row.off * 0.16;
            y += U.fbm1(i * 0.055 + r * 3.7 + sd, 4, 23) * relief
               + U.fbm1(i * 0.017 + r * 1.3 + sd, 3, 71) * relief * 1.5;
            y = Math.max(y, 4);
          }

          const vx = p.x + nx * off, vz = p.z + nz * off;
          pos.push(vx, y, vz);
          grid[r].push({ x: vx, y, z: vz, off });

          // ---- colour ----
          const hy = U.clamp(y / Math.max(h, 1), -0.4, 1.6);
          const grain = Math.abs(U.noise1(i * 0.9 + r * 4.7 + sd, 13));
          if (rock) {
            c.copy(cStoneLo).lerp(cStoneHi, U.smoothstep(-0.15, 0.9, hy));
            c.lerp(cStoneWarm, grain * 0.45);
            // strata: horizontal banding is what makes stone look bedded
            const strata = 0.5 + 0.5 * Math.sin(y * 0.30 + U.fbm1(i * 0.09, 2, 3) * 2.5);
            c.multiplyScalar(U.lerp(0.80, 1.14, strata));
            // and a per-column tint so no two buttresses are the same grey
            c.multiplyScalar(U.lerp(0.90, 1.08, Math.abs(U.noise1(i * 0.37 + sd, 7))));
            // lichen and grass creeping down from the lip
            c.lerp(cGrassDk, U.smoothstep(0.62, 1.0, hy) * (0.30 + grain * 0.5));
            if (r === LIP) c.lerp(cGrass, 0.55 + grain * 0.3);
          } else {
            c.copy(cGrassDk).lerp(cGrass, U.clamp(0.30 + grain * 0.7, 0, 1));
            if (grain > 0.68) c.lerp(cHeather, (grain - 0.68) * 1.5);
            if (grain < 0.22) c.lerp(cBracken, (0.22 - grain) * 1.6);
            // bare rock where the hillside gets steep, snow on the tops
            const steep = U.clamp((y - (h * 0.9)) / Math.max(h, 1), 0, 1);
            c.lerp(cScree, steep * 0.55);
            if (y > baseH + varH * 0.95) {
              c.lerp(cSnow, U.smoothstep(baseH + varH * 0.95, baseH + varH * 1.5, y));
            }
          }
          // wet stone at the waterline, then a bright splash line above it
          if (y < 7) c.lerp(cWet, U.smoothstep(7, -3, y) * 0.72);
          if (y > 0.3 && y < 3.2) c.lerp(cSplash, 0.26);
          const ao = U.smoothstep(-8, 20, y);
          c.multiplyScalar(U.lerp(0.78, 1.06, ao));
          col.push(c.r, c.g, c.b);
        }
      }

      // ---- indices ----
      const vid = (ci, r) => base + ci * ROWS.length + r;
      for (let r = 0; r < ROWS.length - 1; r++) {
        const target = r < LIP ? idxRock : idxLand;
        for (let ci = 0; ci < NC - 1; ci++) {
          const a0 = vid(ci, r), a1 = vid(ci + 1, r);
          const b0 = vid(ci, r + 1), b1 = vid(ci + 1, r + 1);
          // wind so the front faces point back down the channel
          if (side > 0) target.push(a0, b0, b1, a0, b1, a1);
          else target.push(a0, b1, b0, a0, a1, b1);
        }
      }
      grids.push({ side, grid });
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idxRock.concat(idxLand));
    g.addGroup(0, idxRock.length, 0);
    g.addGroup(idxRock.length, idxLand.length, 1);
    g.computeVertexNormals();
    g.computeBoundingSphere();

    const rockMat = new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, side: THREE.DoubleSide,
    });
    const landMat = new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, [rockMat, landMat]);
    mesh.name = 'cliffs';

    const group = new THREE.Group();
    group.name = 'cliffs';
    group.add(mesh);

    if (wantTrees) {
      // somewhere to plant: gentle ground, above the spray, below the snow
      for (const { grid } of grids) {
        for (let r = LIP + 1; r < ROWS.length - 6; r++) {
          const A = grid[r], B = grid[r + 1];
          for (let ci = 0; ci < A.length - 1; ci++) {
            const a = A[ci], a2 = A[ci + 1], b = B[ci];
            const run = Math.hypot(b.x - a.x, b.z - a.z) || 1;
            const slope = Math.abs(b.y - a.y) / run;
            if (slope > 0.75) continue;
            if (a.y < 12 || a.y > baseH + varH * 1.05) continue;
            const density = 0.32 * U.clamp(1 - (r - LIP) / 12, 0.15, 1);
            if (rng() > density) continue;
            const u = rng(), v = rng() * 0.85;
            const x = U.lerp(U.lerp(a.x, a2.x, u), b.x, v);
            const z = U.lerp(U.lerp(a.z, a2.z, u), b.z, v);
            const y = U.lerp(U.lerp(a.y, a2.y, u), b.y, v);
            treeSpots.push({ x, y: y - 0.6, z, s: rng.range(0.55, 1.35) });
          }
        }
      }
      if (treeSpots.length) group.add(buildTrees(treeSpots, rng));
    }

    return group;
  }

  /* Pines, instanced. They do more for how the shoreline reads than any
     amount of extra polygons in the cliff itself. */
  function buildTrees(spots, rng) {
    const parts = [];
    const paint = (geo, r, gg, b) => {
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = gg; arr[i * 3 + 2] = b; }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
      return geo;
    };
    const trunk = new THREE.CylinderGeometry(0.42, 0.72, 5.2, 6);
    trunk.translate(0, 2.6, 0);
    parts.push(paint(trunk.toNonIndexed(), 0.31, 0.22, 0.16));
    const tiers = [[4.3, 7.2, 6.4], [3.3, 6.2, 10.2], [2.1, 5.0, 13.6]];
    for (const [rad, hh, y] of tiers) {
      const cone = new THREE.ConeGeometry(rad, hh, 9, 2);
      cone.translate(0, y, 0);
      parts.push(paint(cone.toNonIndexed(), 0.16, 0.44, 0.26));
    }
    for (const p of parts) p.computeVertexNormals();
    const geo = Sky.mergeGeometries(parts);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const dummy = new THREE.Object3D();
    const colors = new Float32Array(spots.length * 3);
    const tint = new THREE.Color();
    spots.forEach((sp, i) => {
      dummy.position.set(sp.x, sp.y, sp.z);
      dummy.rotation.set(rng.range(-0.06, 0.06), rng.range(0, 6.28), rng.range(-0.06, 0.06));
      dummy.scale.set(sp.s * rng.range(0.85, 1.15), sp.s * rng.range(0.9, 1.25), sp.s * rng.range(0.85, 1.15));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.30 + rng.range(-0.045, 0.045), 0.55 + rng.range(-0.1, 0.1), 0.5 + rng.range(-0.12, 0.14));
      colors[i * 3] = tint.r * 1.35; colors[i * 3 + 1] = tint.g * 1.35; colors[i * 3 + 2] = tint.b * 1.35;
    });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'trees';
    return mesh;
  }

  /* =============== rocks =============== */

  /* A rock is a subdivided icosahedron pushed around by a *deterministic*
     function of the vertex direction. That last part matters: three.js
     polyhedra come back as a triangle soup with every shared vertex
     duplicated, so displacing each vertex by its own random number pulls
     the faces apart and leaves the rock full of holes. Same direction in,
     same displacement out — the shell stays welded. */
  function rockLumps(rng) {
    const h = [];
    for (let i = 0; i < 4; i++) {
      h.push({
        a: rng.range(0.06, 0.20) / (i * 0.55 + 1),
        fx: rng.range(-2.6, 2.6) * (i + 1.4),
        fy: rng.range(-2.6, 2.6) * (i + 1.4),
        fz: rng.range(-2.6, 2.6) * (i + 1.4),
        p: rng.range(0, 6.283),
      });
    }
    return h;
  }
  function lumpAt(h, x, y, z) {
    let s = 0;
    for (let i = 0; i < h.length; i++) {
      const w = h[i];
      s += w.a * Math.sin(x * w.fx + y * w.fy + z * w.fz + w.p);
    }
    return s;
  }

  function buildRocks(path, rng, opts = {}) {
    const count = opts.count || 90;
    const avoid = opts.avoid || [];
    const detail = opts.detail ?? 2;
    const geos = [];
    const colliders = [];
    const foamAt = [];
    const cDark = new THREE.Color('#39465a'), cLight = new THREE.Color('#98a3b2');
    const cMoss = new THREE.Color('#3aa86a'), cWet = new THREE.Color('#1d2c3c');
    const cl = new THREE.Color();

    let tries = 0;
    while (colliders.length < count && tries++ < count * 30) {
      const s = rng.range(path.total * 0.06, path.total * 0.965);
      // Rock follows the structure: a bay wants a field of it in there to be
      // a choice of line at all, and a throat with rock in it is not a line,
      // it is a coin toss. The loop places `count` either way, so this moves
      // the rock about rather than changing how much of it there is.
      const feat = path.featureAt ? path.featureAt(s) : null;
      if (rng() > (feat ? feat.rock : 1) / ROCK_DENSITY_MAX) continue;
      const at = path.at(s);
      const lat = rng.range(-1, 1) * at.half * rng.range(0.35, 0.94);
      const nx = -at.tangent.z, nz = at.tangent.x;
      const x = at.point.x + nx * lat, z = at.point.z + nz * lat;
      const r = rng.range(3.4, 10.5);
      let ok = true;
      for (const a of avoid) {
        if ((a.x - x) ** 2 + (a.z - z) ** 2 < (a.r + r + 6) ** 2) { ok = false; break; }
      }
      if (!ok) continue;
      for (const cdr of colliders) {
        if ((cdr.x - x) ** 2 + (cdr.z - z) ** 2 < (cdr.r + r + 4) ** 2) { ok = false; break; }
      }
      if (!ok) continue;

      const g = new THREE.IcosahedronGeometry(r, detail);
      const p = g.attributes.position;
      const lumps = rockLumps(rng);
      // one squash/stretch for the whole rock, so it stays a closed shell
      const sx = rng.range(0.82, 1.30), sy = rng.range(0.62, 1.15), sz = rng.range(0.82, 1.30);
      const tilt = rng.range(-0.18, 0.18);
      const sink = r * rng.range(0.30, 0.62);

      for (let v = 0; v < p.count; v++) {
        let vx = p.getX(v), vy = p.getY(v), vz = p.getZ(v);
        const inv = 1 / (Math.hypot(vx, vy, vz) || 1);
        const dx = vx * inv, dy = vy * inv, dz = vz * inv;
        // radial displacement is a pure function of direction -> no cracks
        let rad = r * (1 + lumpAt(lumps, dx * 2.2, dy * 2.2, dz * 2.2));
        // flatten the very bottom so it reads as sitting in the seabed
        rad *= 1 - 0.22 * U.smoothstep(-0.55, -1.0, dy);
        p.setXYZ(v, dx * rad * sx, dy * rad * sy, dz * rad * sz);
      }
      g.computeVertexNormals();

      const cc = [];
      for (let v = 0; v < p.count; v++) {
        const wy = p.getY(v) - sink;                 // height above the still waterline
        const t = U.clamp((p.getY(v) + r * sy) / (2 * r * sy), 0, 1);
        cl.copy(cDark).lerp(cLight, Math.pow(t, 0.85));
        // sun-bleached crown, mossy shoulders, dark wet base
        if (t > 0.70) cl.lerp(cMoss, (t - 0.70) * 1.5 * (0.35 + 0.65 * Math.abs(Math.sin(v * 0.37))));
        if (wy < 2.2) cl.lerp(cWet, U.smoothstep(2.2, -1.5, wy) * 0.85);
        if (wy > 0.1 && wy < 1.6) cl.lerp(new THREE.Color('#e8f7ff'), 0.16);
        cc.push(cl.r, cl.g, cl.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      g.rotateY(rng.range(0, 6.28));
      g.rotateX(tilt);
      g.translate(x, -sink, z);
      geos.push(g);
      colliders.push({ x, z, r: r * 0.82 });
      foamAt.push({ x, z, r: r * Math.max(sx, sz) * 1.35 });
    }

    const mesh = new THREE.Mesh(Sky.mergeGeometries(geos), new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
    }));
    mesh.name = 'rocks';

    const foam = buildFoamCollars(foamAt);
    return { mesh, colliders, foam: foam.mesh, update: foam.update };
  }

  /* A soft white collar riding the swell around each rock, so they meet the
     water instead of being stabbed into it. */
  function foamTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0.00, 'rgba(255,255,255,0)');
    grd.addColorStop(0.52, 'rgba(255,255,255,0)');
    grd.addColorStop(0.72, 'rgba(232,250,255,0.85)');
    grd.addColorStop(0.88, 'rgba(232,250,255,0.30)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildFoamCollars(items, opts = {}) {
    if (!items.length) return { mesh: new THREE.Group(), update() {} };
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: foamTexture(), transparent: true, depthWrite: false,
      blending: THREE.NormalBlending, opacity: opts.opacity ?? 0.9,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    const dummy = new THREE.Object3D();
    let phase = 0;
    function update(dt = 0) {
      phase += dt;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const y = Water.sampleHeight(it.x, it.z);
        const pulse = 1 + Math.sin(phase * 1.7 + i) * 0.045;
        dummy.position.set(it.x, y + 0.18, it.z);
        dummy.scale.set(it.r * pulse, 1, it.r * pulse);
        dummy.rotation.y = i * 1.7;
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    update(0);
    return { mesh, update };
  }

  /* Breaking water along the foot of the cliffs. Cheap, and it does more for
     "this is a real coast" than any amount of extra cliff geometry. */
  function buildShoreFoam(path, opts = {}) {
    const spacing = opts.spacing || 16;
    const spots = [];
    const step = Math.max(1, Math.round(spacing / (path.total / path.n)));
    for (let i = 0; i <= path.n; i += step) {
      const p = path.pts[i], t = path.tans[i];
      for (const side of [-1, 1]) {
        const nx = -t.z * side, nz = t.x * side;
        const jitter = U.fbm1(i * 0.3 + side * 9, 2, 17) * 4;
        const d = path.half[i] + 3 + jitter;
        spots.push({
          x: p.x + nx * d, z: p.z + nz * d,
          r: 11 + U.fbm1(i * 0.5 + side * 3, 2, 5) * 5,
        });
      }
    }
    return buildFoamCollars(spots, { opacity: 0.72 });
  }

  /* =============== channel marker buoys =============== */

  function buildBuoys(path, opts = {}) {
    const spacing = opts.spacing || 130;
    const items = [];
    for (let s = spacing; s < path.total - spacing * 0.5; s += spacing) {
      const at = path.at(s);
      const nx = -at.tangent.z, nz = at.tangent.x;
      for (const side of [-1, 1]) {
        const d = at.half * 0.96;
        items.push({ x: at.point.x + nx * d * side, z: at.point.z + nz * d * side, side });
      }
    }
    // cone body + a float collar + a lamp on top, merged into one instance
    const parts = [];
    const cone = new THREE.ConeGeometry(1.6, 5.0, 14, 2);
    cone.translate(0, 2.5, 0);
    parts.push(cone.toNonIndexed());
    const collar = new THREE.TorusGeometry(1.72, 0.42, 8, 18);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 0.55, 0);
    parts.push(collar.toNonIndexed());
    const lamp = new THREE.IcosahedronGeometry(0.52, 1);
    lamp.translate(0, 5.35, 0);
    parts.push(lamp);                       // polyhedra come back non-indexed
    for (const p of parts) {
      p.computeVertexNormals();
      const n = p.attributes.position.count;
      p.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
    const g = Sky.mergeGeometries(parts);

    const mat = new THREE.MeshLambertMaterial({
      color: '#ffffff', emissive: '#ff3b5c', emissiveIntensity: 0.45, flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(g, mat, items.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const colors = new Float32Array(items.length * 3);
    const cL = new THREE.Color('#ff3b5c'), cR = new THREE.Color('#22d3ee');
    items.forEach((it, i) => {
      const c = it.side > 0 ? cR : cL;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.material.vertexColors = true;

    const dummy = new THREE.Object3D();
    const surf = {};
    function update() {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        Water.sampleSurface(it.x, it.z, surf);
        dummy.position.set(it.x, surf.height - 0.7, it.z);
        dummy.rotation.set(Math.atan2(surf.nz, surf.ny) * 0.7, 0, -Math.atan2(surf.nx, surf.ny) * 0.7);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    return { mesh, update, items };
  }

  return { COL, CoursePath, makePath, buildCliffs, buildRocks, buildBuoys,
           buildShoreFoam, ROWS, FEATURES };
})();
