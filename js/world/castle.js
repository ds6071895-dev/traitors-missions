/* ------------------------------------------------------------------
   castle.js — the castle across the water.

   Every scene that is not a mission happens on one hill, and until now
   the thing you looked out at from it was hills and weather. This is
   the thing worth looking at: a tower house on a rock in the middle of
   the loch, with a curtain wall round it, a broken causeway reaching
   back towards the shore, and — after dark — windows.

   It is deliberately unreachable and deliberately unenterable. The
   stage clamps you to ten metres of summit, and this sits three or
   four hundred metres out in open water with the last two spans of its
   bridge in the loch. There is no door geometry to walk through and no
   interior to build: the gate arch is a hole cut into a dark recess,
   which from anywhere you can ever stand reads as a way in that is
   shut. A castle you can enter is a level. This is a horizon.

   The whole of it is one merged, flat-shaded, vertex-coloured mesh
   plus three small extras — windows, banners, and a single point light
   at the gate on a night build — because it is four hundred metres away
   and its entire job is silhouette. Nothing here is animated except the
   banners, which read at that distance precisely because they are the
   only thing that moves.

   Sizes are chosen against the shot rather than against a plan of a
   real castle: at 400m a metre is about three pixels, so merlons are a
   metre and a half and anything finer is left out.
------------------------------------------------------------------ */
const CastleKit = (() => {

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const COL = {
    stone:     new THREE.Color('#8d8b86'),
    stoneLit:  new THREE.Color('#b3ada2'),
    stoneDark: new THREE.Color('#5d5c5b'),
    roof:      new THREE.Color('#4a4f5c'),
    roofLit:   new THREE.Color('#646b7c'),
    rock:      new THREE.Color('#6f7480'),
    rockWet:   new THREE.Color('#3b4048'),
    turf:      new THREE.Color('#4f7f52'),
    window:    new THREE.Color('#ffcc74'),
    banner:    new THREE.Color('#8e1f33'),
    bannerAlt: new THREE.Color('#2b3f7a'),
  };

  /* ---------------- painted primitives ----------------
     Every piece is built at the origin, painted, moved, and thrown on a
     pile. `paint` bakes a face-relative shade into the vertex colours so
     the merged mesh still has some modelling in it under a light rig
     that, at this distance, is doing almost nothing. */

  function paint(geo, col, opts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const c = new THREE.Color();
    const arr = new Float32Array(pos.count * 3);
    const top = opts.top || null;          // a brighter colour for upward faces
    const jitter = opts.jitter === undefined ? 0.05 : opts.jitter;
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i += 3) {
      /* One shade per triangle, from its own normal: a flat-shaded box
         with three tones on it reads as masonry, and the same box with
         one reads as a crate. */
      const ny = nrm.getY(i);
      const nx = nrm.getX(i), nz = nrm.getZ(i);
      c.copy(col);
      if (top && ny > 0.55) c.lerp(top, 0.75);
      // south and west faces catch the last of the light on this hill
      c.multiplyScalar(1 + ny * 0.16 + nx * 0.07 - nz * 0.05);
      const j = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      c.offsetHSL(0, 0, j * jitter);
      for (let k = 0; k < 3; k++) {
        arr[(i + k) * 3] = c.r; arr[(i + k) * 3 + 1] = c.g; arr[(i + k) * 3 + 2] = c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  const place = (g, x, y, z, ry) => {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  };

  const box = (w, h, d, x, y, z, ry, col, opts) =>
    place(paint(new THREE.BoxGeometry(w, h, d), col, opts), x, y, z, ry);

  const cyl = (rt, rb, h, seg, x, y, z, col, opts) =>
    place(paint(new THREE.CylinderGeometry(rt, rb, h, seg), col, opts), x, y, z, 0);

  const cone = (r, h, seg, x, y, z, col, opts) =>
    place(paint(new THREE.ConeGeometry(r, h, seg), col, opts), x, y, z, 0);

  /* A pitched roof: a prism, which `BoxGeometry` cannot be talked into,
     so it is six triangles written out. `along` is the ridge axis. */
  function gable(w, h, d, x, y, z, ry, col) {
    const hw = w / 2, hd = d / 2;
    const p = [
      // ridge runs along x
      [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
      [-hw, h, 0], [hw, h, 0],
    ];
    const tri = [
      [0, 1, 5], [0, 5, 4],          // north pitch
      [3, 4, 5], [3, 5, 2],          // south pitch — wound the other way
      [0, 4, 3], [1, 2, 5],          // the two gable ends
    ];
    const pos = [];
    for (const t of tri) for (const i of t) pos.push(p[i][0], p[i][1], p[i][2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return place(paint(g, col), x, y, z, ry);
  }

  /* ---------------- walls ---------------- */

  /* A run of curtain wall from a to b, with a walkway and merlons on
     top. Everything is built lying along +x and rotated into place,
     because a wall is only ever a box that knows which way it is
     facing. */
  function wallRun(parts, a, b, o) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    const ang = Math.atan2(dx, dz);        // the y-rotation that lays +z along a→b
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const h = o.height, t = o.thick;

    parts.push(box(t, h, len, mx, o.baseY + h / 2, mz, ang, COL.stone,
                   { top: COL.stoneLit }));
    // a batter at the foot: castles are wider at the bottom and it is
    // the single cheapest thing that stops this reading as a fence
    parts.push(box(t * 1.5, h * 0.22, len, mx, o.baseY + h * 0.11, mz, ang,
                   COL.stoneDark));

    if (o.merlons === false) return;
    const step = o.step || 3.0;
    const n = Math.max(1, Math.floor(len / step));
    const mw = step * 0.55, mh = o.merlonH || 1.8;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5;
      const px = mx + Math.sin(ang) * (u * len);
      const pz = mz + Math.cos(ang) * (u * len);
      parts.push(box(t * 0.72, mh, mw, px, o.baseY + h + mh / 2, pz, ang,
                     COL.stone, { top: COL.stoneLit }));
    }
  }

  /* A round tower with a conical roof, and the ring of corbels under
     the roof that is the whole reason a Scottish tower reads as one. */
  function tower(parts, x, z, o) {
    const r = o.radius, h = o.height;
    parts.push(cyl(r, r * 1.16, h, o.sides || 10, x, o.baseY + h / 2, z, COL.stone,
                   { top: COL.stoneLit }));
    // the corbel course
    parts.push(cyl(r * 1.22, r * 1.10, h * 0.055, o.sides || 10,
                   x, o.baseY + h, z, COL.stoneDark));
    if (o.merlons) {
      const n = o.sides || 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        parts.push(box(r * 0.42, 1.7, r * 0.42,
                       x + Math.cos(a) * r * 1.02, o.baseY + h + 0.85,
                       z + Math.sin(a) * r * 1.02, -a, COL.stone,
                       { top: COL.stoneLit }));
      }
    }
    if (o.roof !== false) {
      const rh = o.roofH || r * 2.1;
      parts.push(cone(r * 1.26, rh, o.sides || 10,
                      x, o.baseY + h + rh / 2 + (o.merlons ? 1.7 : 0), z,
                      COL.roof, { top: COL.roofLit }));
    }
  }

  /* ---------------- the rock it stands on ----------------
     A radial mesh, same construction as the hill's ground, with a
     plateau on top for the castle to sit on and cliffs falling into the
     water. The waterline is painted wet rather than modelled wet: at
     this distance a dark band under a pale one is a tideline, and a
     shader that knows about the sea is a shader nobody will ever see. */

  function buildCrag(rng, o) {
    const RINGS = 22, SECT = 34;
    const fbm2 = ForestKit.fbm2;
    const heightAt = (x, z) => {
      const r = Math.hypot(x, z);
      const plateau = o.top * (1 - U.smoothstep(o.flat, o.radius * 0.94, r));
      const rough = fbm2(x * 0.045, z * 0.045, 3, 21) * o.rough
                  * U.smoothstep(o.flat * 0.6, o.radius, r);
      const spur = Math.max(0, fbm2(x * 0.02, z * 0.02, 2, 77)) * o.top * 0.30;
      return plateau + rough + spur * U.smoothstep(o.flat, o.radius, r) - o.sink
             * U.smoothstep(o.radius * 0.7, o.radius * 1.16, r);
    };

    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    const grid = [];
    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS;
      const row = [];
      for (let k = 0; k < SECT; k++) {
        const a = (k / SECT) * Math.PI * 2;
        // an irregular outline: an island shaped like a wheel is not one
        const jr = 1 + ForestKit.noise2(Math.cos(a) * 2.1, Math.sin(a) * 2.1, 5) * 0.30;
        const r = o.radius * (t * t * 0.7 + t * 0.3) * jr;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        row.push({ x, z, y: heightAt(x, z), r });
      }
      grid.push(row);
    }
    let v = 0;
    for (let i = 0; i <= RINGS; i++) {
      for (let k = 0; k < SECT; k++) {
        const p = grid[i][k];
        pos.push(p.x, p.y, p.z);
        const wet = U.smoothstep(3.4, -1.0, p.y);          // below the tideline
        const green = U.smoothstep(o.top * 0.55, o.top * 0.95, p.y)
                    * (0.4 + ForestKit.fbm2(p.x * 0.08, p.z * 0.08, 2, 9) * 0.4);
        c.copy(COL.rock)
          .lerp(COL.turf, U.clamp(green, 0, 0.55))
          .lerp(COL.rockWet, wet * 0.85)
          .multiplyScalar(0.52 + ForestKit.fbm2(p.x * 0.3, p.z * 0.3, 2, 3) * 0.10);
        col.push(c.r, c.g, c.b);
        v++;
      }
    }
    for (let i = 0; i < RINGS; i++) {
      for (let k = 0; k < SECT; k++) {
        const k2 = (k + 1) % SECT;
        const a = i * SECT + k, b = i * SECT + k2;
        const cc = (i + 1) * SECT + k, d = (i + 1) * SECT + k2;
        // right-handed and pointing up — the same winding the hill uses
        idx.push(a, b, cc, b, d, cc);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'castle-crag';
    return { mesh, heightAt };
  }

  /* ---------------- windows ----------------
     Not lights. Emissive quads, unlit and unfogged, sitting a hand's
     breadth proud of the stone so nothing z-fights: at four hundred
     metres a window is two pixels of warm colour and that is all it has
     ever needed to be. One real light hangs at the gate on a night
     build, because a gate that is the only lit thing is where the eye
     goes. */

  function windowPatch(list, x, y, z, ry, w, h) {
    list.push({ x, y, z, ry, w, h });
  }

  function buildWindows(list, colour) {
    if (!list.length) return null;
    const parts = [];
    for (const s of list) {
      const g = new THREE.PlaneGeometry(s.w, s.h);
      g.rotateY(s.ry);
      g.translate(s.x, s.y, s.z);
      parts.push(g.toNonIndexed());
    }
    const merged = Sky.mergeGeometries(parts);
    const mat = new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.95, fog: false,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'castle-windows';
    mesh.renderOrder = 2;
    return mesh;
  }

  /* ---------------- the whole thing ---------------- */

  function build(rng, opts = {}) {
    const o = Object.assign({
      x: 0, z: 0,               // where it stands, in world coordinates
      facing: 0,                // which way the gate looks
      scale: 1,
      seaLevel: 0,
      night: false,             // are the windows lit
      lit: 0.0,                 // 0 broad daylight, 1 every window burning
      causeway: true,
    }, opts);

    const group = new THREE.Group();
    group.name = 'castle';
    group.position.set(o.x, 0, o.z);
    group.rotation.y = o.facing;

    /* The rock. Everything above is placed against `plateau`, so moving
       the island up or down moves the castle with it. */
    const crag = buildCrag(rng, {
      radius: 48 * o.scale, flat: 17 * o.scale, top: 11 * o.scale,
      rough: 3.4 * o.scale, sink: 26 * o.scale,
    });
    crag.mesh.position.y = o.seaLevel;
    group.add(crag.mesh);
    const baseY = o.seaLevel + 10.4 * o.scale;

    const parts = [];
    const win = [];
    const S = o.scale;

    /* The curtain: a five-sided ward rather than a square, because an
       irregular plan is what you get when you build on a rock and it is
       what makes the silhouette read as a castle instead of a fort. */
    const R = 15.5 * S;
    const corners = [];
    const N = 5;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.32;
      const rr = R * (0.86 + (i % 2) * 0.22);
      corners.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, a });
    }

    const wallH = 8.2 * S, wallT = 1.9 * S;
    for (let i = 0; i < N; i++) {
      const a = corners[i], b = corners[(i + 1) % N];
      wallRun(parts, a, b, { height: wallH, thick: wallT, baseY,
                             step: 3.1 * S, merlonH: 1.7 * S });
    }
    for (let i = 0; i < N; i++) {
      const c = corners[i];
      tower(parts, c.x, c.z, {
        radius: (i === 0 ? 3.9 : 3.2) * S,
        height: (i === 0 ? 15.5 : 12.0) * S,
        baseY, roofH: (i === 0 ? 9 : 7) * S, sides: 10,
      });
      // arrow slits, four to a tower, warm after dark
      for (let k = 0; k < 3; k++) {
        const wa = c.a + (k - 1) * 0.7;
        const wr = (i === 0 ? 4.0 : 3.3) * S;
        windowPatch(win, c.x + Math.cos(wa) * wr,
                    baseY + (6 + k * 2.6) * S,
                    c.z + Math.sin(wa) * wr, -wa + Math.PI / 2,
                    0.55 * S, 1.5 * S);
      }
    }

    /* The keep. The tallest thing on the rock and the thing the eye
       actually reads at four hundred metres, so it gets the corner
       turrets and the steep roof and everything else stays plain. */
    const kx = -4.2 * S, kz = 2.2 * S;
    const kw = 11.5 * S, kd = 9.0 * S, kh = 22.5 * S;
    parts.push(box(kw, kh, kd, kx, baseY + kh / 2, kz, 0.24, COL.stone,
                   { top: COL.stoneLit }));
    parts.push(box(kw * 1.1, kh * 0.12, kd * 1.1, kx, baseY + kh * 0.06, kz, 0.24,
                   COL.stoneDark));
    // the parapet, corbelled out over the wall head
    parts.push(box(kw * 1.14, 1.6 * S, kd * 1.14, kx, baseY + kh + 0.8 * S, kz, 0.24,
                   COL.stoneDark, { top: COL.stoneLit }));
    // bartizans: the little pepperpot turrets on the corners
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const c0 = Math.cos(0.24), s0 = Math.sin(0.24);
      const lx = sx * kw * 0.5, lz = sz * kd * 0.5;
      const wx = kx + lx * c0 + lz * s0, wz = kz - lx * s0 + lz * c0;
      tower(parts, wx, wz, { radius: 1.5 * S, height: 4.2 * S,
                             baseY: baseY + kh - 1.4 * S, roofH: 3.4 * S, sides: 7 });
    }
    parts.push(gable(kw * 0.92, 5.6 * S, kd * 0.92, kx, baseY + kh + 1.6 * S, kz,
                     0.24, COL.roof));
    // its windows, in ranks, and bigger the higher up you go
    for (let f = 0; f < 4; f++) {
      for (let k = -1; k <= 1; k++) {
        const wy = baseY + (5.5 + f * 4.4) * S;
        const c0 = Math.cos(0.24), s0 = Math.sin(0.24);
        const lx = k * 3.2 * S, lz = kd * 0.5 + 0.16 * S;
        windowPatch(win, kx + lx * c0 + lz * s0, wy, kz - lx * s0 + lz * c0,
                    0.24, (0.75 + f * 0.12) * S, (1.5 + f * 0.25) * S);
      }
    }

    /* The hall, along the inside of the far wall: a long low block with
       a gable on it, which is the difference between a castle and a
       ring of walls with nothing in it. */
    const hx = 5.6 * S, hz = -4.6 * S;
    parts.push(box(13.0 * S, 8.4 * S, 6.6 * S, hx, baseY + 4.2 * S, hz, -0.55,
                   COL.stone, { top: COL.stoneLit }));
    parts.push(gable(13.0 * S, 3.6 * S, 6.6 * S, hx, baseY + 8.4 * S, hz,
                     -0.55, COL.roof));
    for (let k = -2; k <= 2; k++) {
      const c0 = Math.cos(-0.55), s0 = Math.sin(-0.55);
      const lx = k * 2.4 * S, lz = 3.4 * S;
      windowPatch(win, hx + lx * c0 + lz * s0, baseY + 5.2 * S,
                  hz - lx * s0 + lz * c0, -0.55, 0.9 * S, 2.4 * S);
    }

    /* The gatehouse, facing out along +z, which after the group's own
       rotation is whichever way `facing` said. Two half-towers, a
       shadowed recess, and a portcullis in it. There is no door behind
       the recess and there is not going to be one. */
    const gz = R * 1.02, gw = 8.6 * S;
    parts.push(box(gw, wallH * 1.42, 4.0 * S, 0, baseY + wallH * 0.71, gz, 0,
                   COL.stone, { top: COL.stoneLit }));
    for (const sx of [-1, 1]) {
      tower(parts, sx * gw * 0.5, gz, { radius: 2.5 * S, height: 13.5 * S,
                                        baseY, roofH: 6.0 * S, sides: 9 });
    }
    // the arch: a dark recess, not an opening you could ever walk into
    parts.push(box(3.0 * S, 4.6 * S, 1.2 * S, 0, baseY + 2.3 * S, gz + 1.6 * S, 0,
                   COL.stoneDark, { jitter: 0.01 }));
    for (let i = 0; i < 5; i++) {
      parts.push(box(0.22 * S, 4.2 * S, 0.22 * S,
                     (i - 2) * 0.62 * S, baseY + 2.1 * S, gz + 2.2 * S, 0,
                     COL.stoneDark));
    }
    windowPatch(win, 0, baseY + 9.0 * S, gz + 2.05 * S, 0, 1.1 * S, 1.4 * S);

    /* The causeway. It reaches back towards the shore and stops, two
       spans short, in open water — which says more about how far away
       this place is than any amount of fog. */
    if (o.causeway) {
      const spans = 6;
      /* It starts in the water, not on the rock. The crag's own
         shoreline is around forty units out; a span begun any closer
         is a pier buried in a cliff with its deck below the ground it
         is standing on. */
      for (let i = 0; i < spans; i++) {
        const z = 42 * S + i * 7.0 * S;
        const broken = i >= spans - 2;
        const deck = 5.2 * S - i * 0.55 * S;
        /* Every pier is sunk well past the surface. The rock under this
           stretch is fifteen metres down, and a pier that stopped at the
           waterline would be a column standing on water the first time
           a swell dropped under it. */
        const foot = 14 * S;
        if (broken) {
          // a stump of pier, and then nothing
          parts.push(box(2.6 * S, 3.0 * S + foot, 2.6 * S,
                         0, o.seaLevel + 1.0 * S - foot / 2, z, 0, COL.stoneDark));
          continue;
        }
        parts.push(box(4.4 * S, 1.2 * S, 7.0 * S, 0, o.seaLevel + deck, z, 0,
                       COL.stone, { top: COL.stoneLit }));
        parts.push(box(2.2 * S, deck + foot, 2.2 * S,
                       0, o.seaLevel + (deck - foot) / 2, z, 0, COL.stoneDark));
        for (const sx of [-1, 1]) {
          parts.push(box(0.4 * S, 1.0 * S, 7.0 * S, sx * 2.2 * S,
                         o.seaLevel + deck + 1.1 * S, z, 0, COL.stone));
        }
      }
    }

    /* The flagpoles go in with the stone rather than beside it. They are
       two thin static cylinders and they were costing two draw calls to
       be four hundred metres away. */
    const bannerAt = [];
    for (const sx of [-1, 1]) {
      const poleX = sx * gw * 0.5, poleZ = gz;
      const poleTop = baseY + 13.5 * S + 6.0 * S;
      parts.push(cyl(0.14 * S, 0.14 * S, 6.5 * S, 4,
                     poleX, poleTop + 3.0 * S, poleZ, COL.stoneDark));
      bannerAt.push({ sx, x: poleX, y: poleTop + 4.6 * S, z: poleZ });
    }

    const merged = Sky.mergeGeometries(parts);
    merged.computeVertexNormals();
    const stone = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true,
    }));
    stone.name = 'castle-stone';
    group.add(stone);
    for (const p of parts) p.dispose();

    /* Banners. Two of them, on the gate towers, and they are the only
       moving thing on the whole island — which is exactly why they are
       worth the two draw calls. */
    const banners = [];
    for (const b of bannerAt) {
      const geo = new THREE.PlaneGeometry(3.4 * S, 2.2 * S, 5, 1);
      const flag = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        color: b.sx < 0 ? COL.banner : COL.bannerAlt, side: THREE.DoubleSide,
      }));
      flag.position.set(b.x + 1.7 * S, b.y, b.z);
      flag.userData.base = geo.attributes.position.array.slice();
      flag.userData.phase = b.sx * 1.7;
      group.add(flag);
      banners.push(flag);
    }

    const windows = buildWindows(win, COL.window);
    if (windows) {
      windows.material.opacity = 0;
      group.add(windows);
    }

    /* One light, at the gate, and only after dark. Three would look no
       better from four hundred metres and would cost three. */
    let gateLight = null;
    if (o.night) {
      gateLight = new THREE.PointLight('#ffb761', 2.4, 60 * S, 2);
      gateLight.position.set(0, baseY + 3.0 * S, gz + 3.2 * S);
      group.add(gateLight);
    }

    let lit = 0;
    const setLit = (v) => {
      lit = U.clamp(v, 0, 1);
      if (windows) windows.material.opacity = 0.10 + lit * 0.88;
      if (gateLight) gateLight.intensity = 0.4 + lit * 2.6;
    };
    setLit(o.lit);

    const world = V(o.x, baseY, o.z);

    return {
      group, crag, world,
      // the top of the keep, which is what a camera should be aimed at
      peak: V(o.x, baseY + kh + 7 * S, o.z),
      setLit,
      get lit() { return lit; },
      update(dt, t) {
        for (const f of banners) {
          const p = f.geometry.attributes.position;
          const base = f.userData.base;
          for (let i = 0; i < p.count; i++) {
            const bx = base[i * 3];
            const k = (bx / (3.4 * S)) + 0.5;             // 0 at the pole, 1 at the fly
            p.setZ(i, Math.sin(t * 3.1 + k * 4.2 + f.userData.phase) * 0.55 * S * k);
            p.setY(i, base[i * 3 + 1] - k * k * 0.35 * S);
          }
          p.needsUpdate = true;
        }
        if (gateLight) {
          gateLight.intensity = (0.4 + lit * 2.6)
            * (1 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 2.9) * 0.04);
        }
      },
      dispose() { Engine.disposeObject(group); },
    };
  }

  return { build, buildCrag, COL };
})();
