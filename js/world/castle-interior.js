/* ------------------------------------------------------------------
   castle-interior.js — the rooms the night happens in.

   Builds `CastleLayout` into a Scottish baronial house: stone walls with
   real openings, oak panelling to the dado with damask or bare stone
   above, plaster cornices, coffered ceilings, a ribbed vault over the
   round table, tall leaded windows looking out over the loch to the
   hills, carved fireplaces, stag heads, portraits in gilt, tartan, and
   candles everywhere. Everything static is merged per material, as
   `estate.js` batches the outside — and per wing, so a wing behind you
   is not drawn — which makes the whole house a few dozen draw calls.

   Two rules keep it from flickering. Walls are centred on the room
   lines in the layout, so two rooms that share a wall share one wall,
   not two overlapping ones; and every surface laid on another — panel,
   paper, rail, rug, sill — stands proud of it by a real distance, so no
   two faces of different stuff ever sit in the same plane.

   It answers the same questions the estate answers — `heightAt`,
   `walkable`, `constrain`, `update`, `dispose` — so `stage.js` can
   stand a scene in a room the way it stands one on the hill.

   Light: daylight (or moonlight) from the windows as a hemisphere and
   one directional; warm pools from a list of places (`CastleLayout.
   LIGHTS`), with a handful of real point lights following the camera
   to the nearest of them. Flames and the view are unlit and cost
   nothing.
------------------------------------------------------------------ */
const CastleInterior = (() => {

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const T = 0.5;                  // wall thickness, centred on the layout's lines
  const DOOR_H = 3.2;             // the top of an ordinary doorway
  const LAP = 0.004;              // how far trim laps over the edge it covers
  const TAU = Math.PI * 2;

  const POOL = 6;                 // real point lights, wherever you are
  const POOL_RANGE = 20;

  /* How each room is finished: oak panelling to `wains`, then `upper`
     to the ceiling, and what the ceiling is. */
  const FINISH = {
    hall:            { wains: 1.3, upper: 'masonry', ceil: 'coffered' },
    great:           { wains: 1.1, upper: 'masonry', ceil: 'coffered' },
    round:           { wains: 1.4, upper: 'masonry', ceil: 'vault' },
    corridor:        { wains: 1.0, upper: 'damaskRed', ceil: 'beams' },
    'west-passage':  { wains: 1.0, upper: 'masonry', ceil: 'beams' },
    'north-passage': { wains: 1.0, upper: 'masonry', ceil: 'beams' },
    stair:           { wains: 0, upper: 'masonry', ceil: 'beams' },
    turret:          { wains: 0, upper: 'masonry', ceil: 'cone' },
    bed:             { wains: 0.9, upper: 'damaskGreen', ceil: 'plain' },
    library:         { wains: 1.0, upper: 'damaskGreen', ceil: 'coffered' },
    chapel:          { wains: 1.2, upper: 'masonry', ceil: 'beams' },
    kitchen:         { wains: 0, upper: 'masonry', ceil: 'beams' },
    scullery:        { wains: 0, upper: 'masonry', ceil: 'beams' },
    'west-link':     { wains: 1.0, upper: 'masonry', ceil: 'beams' },
    'east-link':     { wains: 1.0, upper: 'masonry', ceil: 'beams' },
    gallery:         { wains: 1.1, upper: 'damaskRed', ceil: 'coffered' },
    billiard:        { wains: 1.2, upper: 'damaskGreen', ceil: 'coffered' },
    drawing:         { wains: 0.9, upper: 'damaskRed', ceil: 'plain' },
    study:           { wains: 1.3, upper: 'damaskGreen', ceil: 'beams' },
    gun:             { wains: 1.2, upper: 'masonry', ceil: 'beams' },
    conservatory:    { wains: 0, upper: 'masonry', ceil: 'glass' },
  };
  const finishOf = (r) => FINISH[r.id] || (r.id.startsWith('bed') ? FINISH.bed : FINISH.stair);

  /* Windows, on walls with nothing outside them but the view. Rect
     rooms by side and span; round rooms by angle and width. */
  function windowsFor(r) {
    const P = Math.PI;
    if (r.id === 'hall') return [
      { side: 's', span: [-1.6, 1.6], y: [5.2, 8.3], arch: true },
      { side: 's', span: [-5.3, -3.3], y: [4.6, 7.9], arch: true },
      { side: 's', span: [3.3, 5.3], y: [4.6, 7.9], arch: true },
    ];
    if (r.id === 'great') return [
      [0.2, 2.2], [3.8, 5.8], [12.2, 14.2], [15.8, 17.8],
    ].map(span => ({ side: 'w', span, y: [1.0, 6.2], arch: true, curtains: true })).concat(
      [[-20.8, -18.8], [-13.2, -11.2]].map(span => ({ side: 's', span, y: [1.0, 6.2], arch: true, curtains: true })));
    // the north side looks into the library now: the windows there are doors
    if (r.id === 'corridor') return ['n', 's'].map(side => ({ side, span: [26.4, 27.6], y: [1.0, 3.5], arch: true }));
    if (r.id === 'round') return [-7 * P / 8, -5 * P / 8, -3 * P / 8, -P / 8]
      .map(a => ({ a, w: 1.7, y: [1.6, 8.2], arch: true, candles: true }));
    /* The wings. Windows only on walls with nothing behind them but the
       view or the courtyard; a wall two rooms share has none. */
    const run = (side, spans, y, more) => spans.map(span => Object.assign({ side, span, y, arch: true }, more || {}));
    if (r.id === 'library') return run('n', [[-17.5, -16], [-13.5, -12]], [1.1, 4.3])
      .concat(run('s', [[-28, -26.5], [-25, -23.5]], [1.1, 4.3]));
    if (r.id === 'chapel') return run('n', [[-26, -24]], [2.4, 7.2])
      .concat(run('e', [[-19, -18], [-16, -15], [-13, -12]], [2.2, 6.4]), run('w', [[-19.5, -18.5], [-16.5, -15.5]], [2.2, 6.4]));
    if (r.id === 'kitchen') return run('w', [[-10, -8.5], [-3, -1.5]], [1.2, 3.8])
      .concat(run('s', [[-39, -37.5], [-34.5, -33]], [1.2, 3.8]));
    if (r.id === 'scullery') return run('w', [[-19, -17.5]], [1.3, 3.1]);
    if (r.id === 'gallery') return run('s', [[17.5, 19.5], [22, 24], [26.5, 28.5]], [1.0, 3.9], { curtains: true });
    if (r.id === 'billiard') return run('n', [[19, 20.5], [23.5, 25]], [1.0, 3.5])
      .concat(run('w', [[-15, -13.5], [-11.5, -10]], [1.0, 3.5]));
    if (r.id === 'drawing') return run('n', [[29.5, 31], [37, 38.5]], [1.0, 3.9], { curtains: true })
      .concat(run('e', [[-16, -14]], [1.0, 3.9], { curtains: true }));
    if (r.id === 'study') return run('n', [[43.2, 44.8]], [1.0, 3.2])
      .concat(run('e', [[-9, -7.5], [-4.5, -3]], [1.0, 3.2]), run('s', [[43.2, 44.8]], [1.0, 3.2]));
    if (r.id === 'gun') return run('w', [[0.5, 2], [3.5, 5]], [1.0, 3.2]).concat(run('e', [[4.5, 6]], [1.0, 3.2]));
    if (r.id === 'conservatory') return run('e', [[8.2, 10.2], [11.2, 13.2], [14.2, 16.2], [17.2, 19.2]], [0.5, 4.6])
      .concat(run('s', [[31.4, 33.4], [35, 37], [38.6, 40.6]], [0.5, 4.6]),
              run('w', [[8.4, 10.4], [16.4, 18.4]], [0.5, 4.6]));
    if (r.id === 'turret') return [-P / 2, -P / 2 - 1.1, -P / 2 + 1.1, 0.25, P - 0.25]
      .map(a => ({ a, w: 0.9, y: [1.3, 3.9], arch: true }));
    if (r.id.startsWith('bed')) {
      const k = +r.id.slice(3), cx = (r.x0 + r.x1) / 2;
      return [{ side: k < 4 ? 'n' : 's', span: [cx + 0.3, cx + 1.4], y: [1.0, 2.9], arch: true }];
    }
    return [];
  }

  /* What everything is made of. `fam` borrows an estate texture family;
     `tex` is one of the castle's painted cloths; `uv` is metres per tile. */
  const MATS = {
    masonry:  { fam: 'masonry', uv: 2.6, opts: { color: '#f4e8d6' } },
    dressed:  { fam: 'masonry', uv: 1.4, opts: { color: '#fff3df' } },
    flags:    { fam: 'paving', uv: 2.4, opts: { color: '#efe4d2' } },
    boards:   { fam: 'timber', uv: 1.8, opts: { color: '#f0c9a0', roughness: 0.62 } },
    oak:      { fam: 'timber', uv: 1.4, opts: { color: '#ffe2c2', roughness: 0.5 } },
    darkoak:  { fam: 'timber', uv: 1.2, opts: { color: '#e2b690', roughness: 0.45 } },
    beam:     { fam: 'timber', uv: 2.0, opts: { color: '#d6ad86', roughness: 0.7 } },
    /* The rest have a grain of their own (`CastleSurfaces`), tinted by
       `flat`; `uv` is metres per tile, as for the stone. */
    iron:     { surf: 'iron', flat: '#2d2b2a', rough: 0.55, metal: 0.4, uv: 0.5 },
    plaster:  { surf: 'plaster', flat: '#e3d6bc', rough: 0.92, uv: 2.2 },
    gold:     { surf: 'metal', flat: '#d4ab55', rough: 0.35, metal: 0.45, uv: 0.4 },
    steel:    { surf: 'metal', flat: '#b4b8bc', rough: 0.3, metal: 0.45, uv: 0.4 },
    wax:      { surf: 'wax', flat: '#f2ead6', rough: 0.65, uv: 0.25 },
    soot:     { surf: 'soot', flat: '#1f1816', rough: 1, uv: 0.8 },
    linen:    { surf: 'linen', flat: '#ece5d6', rough: 1, uv: 0.3 },
    velvet:   { surf: 'velvet', flat: '#801826', rough: 0.85, side: true, uv: 0.5 },
    green:    { surf: 'wool', flat: '#21422f', rough: 0.85, side: true, uv: 0.4 },
    cloak:    { surf: 'wool', flat: '#191314', rough: 1, side: true, uv: 0.5 },
    slate:    { fam: 'slate', uv: 1.6 },
    bone:     { surf: 'bone', flat: '#e2d3b2', rough: 0.75, uv: 0.3 },
    fur:      { surf: 'fur', flat: '#7a5a3d', rough: 1, uv: 0.3 },
    lead:     { surf: 'metal', flat: '#2a2a2c', rough: 0.5, metal: 0.3, uv: 0.5 },
    china:    { surf: 'china', flat: '#f2efe8', rough: 0.3, uv: 0.4 },
    silver:   { surf: 'metal', flat: '#d6d8da', rough: 0.25, metal: 0.5, uv: 0.4 },
    log:      { fam: 'bark', uv: 0.8 },
    ink:      { surf: 'leather', flat: '#22314a', rough: 0.7, uv: 0.4 },
    leather:  { surf: 'leather', flat: '#62331f', rough: 0.55, uv: 0.4 },
    baize:    { surf: 'baize', flat: '#21733e', rough: 0.95, uv: 0.6 },
    lacquer:  { surf: 'lacquer', flat: '#16110f', rough: 0.2, metal: 0.1, uv: 1.0 },
    copper:   { surf: 'copper', rough: 0.35, metal: 0.55, uv: 0.5 },
    leaf:     { surf: 'leafy', flat: '#3d6a35', rough: 0.8, side: true, uv: 0.4 },
    terracotta: { surf: 'terracotta', flat: '#b5654a', rough: 0.85, uv: 0.5 },
    water:    { surf: 'water', flat: '#4f6f7c', rough: 0.06, metal: 0.25, uv: 0.8 },
    parchment: { surf: 'parchment', rough: 0.8, uv: 0.5 },
    soil:     { surf: 'soil', rough: 1, uv: 0.6 },
    bookRed:   { book: 'red', uv: 0.38 },
    bookGreen: { book: 'green', uv: 0.38 },
    bookBlue:  { book: 'blue', uv: 0.38 },
    bookBrown: { book: 'brown', uv: 0.38 },
    bookTan:   { book: 'tan', uv: 0.38 },
    bookBlack: { book: 'black', uv: 0.38 },
    // living things: a leaf to a quad, its outline in the alpha
    frond:     { plant: 'frond', keepUV: true, rough: 0.6 },
    fern:      { plant: 'fern', keepUV: true, rough: 0.75 },
    broadleaf: { plant: 'broadleaf', keepUV: true, rough: 0.45 },
    ivy:       { plant: 'ivy', keepUV: true, rough: 0.6 },
    flowers:   { plant: 'flowers', keepUV: true, rough: 0.8 },
    tartanRed:   { tex: () => CastleProps.tartan('stewart'), uv: 0.7 },
    tartanGreen: { tex: () => CastleProps.tartan('watch'), uv: 0.7 },
    tartanHunt:  { tex: () => CastleProps.tartan('hunting'), uv: 1.0 },
    damaskRed:   { tex: () => CastleProps.damask('red'), uv: 0.7 },
    damaskGreen: { tex: () => CastleProps.damask('green'), uv: 0.7 },
    portrait:    { tex: () => CastleProps.portraits(), keepUV: true, rough: 0.55 },
  };

  function build(scene, opts = {}) {
    const L = CastleLayout;
    const focus = L.FOCUS[opts.room] || L.FOCUS.hall;
    const hour = opts.hour === 'night' ? 'night' : opts.hour === 'morning' ? 'morning' : 'golden';
    const night = hour === 'night';
    const low = GameState.data.settings.quality === 'low';
    const SKY = CastleProps.skyFor(hour);

    /* The castle is built in its own coordinates and moved so the room
       being used is centred on the world origin. */
    const group = new THREE.Group();
    group.name = 'castle-interior';
    group.position.set(-focus.x, 0, -focus.z);
    scene.add(group);
    const toWorld = (x, z) => V(x - focus.x, 0, z - focus.z);
    const toLocal = (x, z) => ({ x: x + focus.x, z: z + focus.z });

    const mats = {};
    const batches = new Map();
    /* Which part of the house a piece is in, by the room its middle is
       in: the west wing, the east wing, or the core. */
    const WING = {};
    for (const id of ['library', 'chapel', 'kitchen', 'scullery', 'west-link']) WING[id] = 'w';
    for (const id of ['east-link', 'gallery', 'billiard', 'drawing', 'study', 'gun', 'conservatory']) WING[id] = 'e';
    function wingOf(g) {
      g.computeBoundingBox();
      const b = g.boundingBox;
      const r = L.roomAt((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
      return (r && WING[r.id]) || 'c';
    }
    const mat = (id) => mats[id] || (mats[id] = makeMaterial(id));
    function makeMaterial(id) {
      const m = MATS[id];
      if (id === 'glass') {
        return new THREE.MeshBasicMaterial({ color: night ? '#9fb0d0' : '#f4f1e8', transparent: true,
          opacity: night ? 0.07 : 0.1, depthWrite: false, side: THREE.DoubleSide, fog: false });
      }
      if (!m) return new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.9 });
      if (m.fam) return EstateMaterials.material(m.fam, Object.assign({}, m.opts || {}));
      if (m.tex) return new THREE.MeshStandardMaterial({ map: m.tex(), roughness: m.rough || 0.9 });
      if (m.book) return CastleSurfaces.bookMaterial(m.book);
      if (m.plant) {
        return new THREE.MeshStandardMaterial({ map: CastleSurfaces.plant(m.plant), roughness: m.rough,
          alphaTest: 0.45, side: THREE.DoubleSide });
      }
      const side = m.side ? THREE.DoubleSide : THREE.FrontSide;
      if (m.surf) {
        return CastleSurfaces.material(m.surf, { color: m.flat || '#ffffff', roughness: m.rough, metalness: m.metal || 0, side });
      }
      return new THREE.MeshStandardMaterial({ color: m.flat, roughness: m.rough, metalness: m.metal || 0, side });
    }
    /* Into a batch, in castle coordinates. UVs are projected after the
       move, so two faces in the same place get the same texture. */
    function add(g, id, x = 0, y = 0, z = 0, ry = 0) {
      if (ry) g.rotateY(ry);
      g.translate(x, y, z);
      const spec = MATS[id] || {};
      if (!spec.keepUV) EstateMaterials.uv(g, spec.uv || 2);
      else if (!g.attributes.uv) EstateMaterials.uv(g, 1);
      const key = id + '@' + wingOf(g);
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(g.index ? g.toNonIndexed() : g);
    }
    const box = (id, w, h, d, x, y, z, ry = 0) => add(new THREE.BoxGeometry(w, h, d), id, x, y, z, ry);
    const cyl = (id, rt, rb, h, seg, x, y, z) => add(new THREE.CylinderGeometry(rt, rb, h, seg), id, x, y, z);
    const sph = (id, r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 10) =>
      add(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 3)).scale(sx, sy, sz), id, x, y, z);

    /* Glowing things: flames, embers. Unlit, so they read as the light
       source whatever the pool of real lights is doing. */
    const glowBatches = new Map();
    function glow(g, colour, x = 0, y = 0, z = 0, ry = 0) {
      if (ry) g.rotateY(ry);
      g.translate(x, y, z);
      if (!g.attributes.uv) EstateMaterials.uv(g, 1);
      if (!glowBatches.has(colour)) glowBatches.set(colour, []);
      glowBatches.get(colour).push(g.index ? g.toNonIndexed() : g);
    }
    function candle(x, y, z, h = 0.2, r = 0.028) {
      const c = CastleProps.pillar(x, y, z, h, r);
      add(c.wax, 'wax');
      add(c.wick, 'soot');
      glow(c.flame, '#ffb54d');
      glow(c.core, '#fff3c4');
    }

    /* A local frame on a wall: x along it, z out into the room, origin on
       the wall's inner face at floor level. Build a piece in that frame
       and hand it here to put it on the wall. */
    function onWall(W, s, g, id, y = 0, glowColour) {
      const f = W.frame(s);
      if (glowColour) glow(g, glowColour, f.x, W.fy + y, f.z, f.ry);
      else add(g, id, f.x, W.fy + y, f.z, f.ry);
    }
    const lbox = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    // a point in a wall's local frame, in castle coordinates
    function wallPoint(W, s, lx, lz) {
      const f = W.frame(s);
      return { x: f.x + Math.cos(f.ry) * lx + Math.sin(f.ry) * lz, z: f.z - Math.sin(f.ry) * lx + Math.cos(f.ry) * lz };
    }

    /* ---------------- walls ---------------- */

    function rectWall(r, side) {
      const ns = side === 'n' || side === 's';
      const fy = r.y || 0;
      const open = r.open || [];
      const [lo, hi] = ns ? [r.x0, r.x1] : [r.z0, r.z1];
      const loOpen = open.indexOf(ns ? 'w' : 'n') >= 0, hiOpen = open.indexOf(ns ? 'e' : 's') >= 0;
      const line = side === 'n' ? r.z0 : side === 's' ? r.z1 : side === 'w' ? r.x0 : r.x1;
      const inward = side === 'n' || side === 'w' ? 1 : -1;
      const face = line + inward * T / 2;
      const ry = side === 'n' ? 0 : side === 's' ? Math.PI : side === 'w' ? Math.PI / 2 : -Math.PI / 2;
      return {
        kind: 'rect', room: r, side, fy, h: r.h, ns,
        a0: lo - (loOpen ? 0 : T / 2), a1: hi + (hiOpen ? 0 : T / 2),
        in0: lo + T / 2, in1: hi - T / 2,
        metres: (ds) => ds, toS: (m) => m, outer: (ds) => ds,
        band(id, s0, s1, y0, y1, d0, d1) {
          if (s1 - s0 < 0.003 || y1 - y0 < 0.003) return;
          const len = s1 - s0, hh = y1 - y0, dep = d1 - d0;
          const sm = (s0 + s1) / 2, dm = face + inward * (d0 + d1) / 2;
          if (ns) box(id, len, hh, dep, sm, fy + y0 + hh / 2, dm);
          else box(id, dep, hh, len, dm, fy + y0 + hh / 2, sm);
        },
        frame(s) { return ns ? { x: s, z: face, ry } : { x: face, z: s, ry }; },
      };
    }

    function circleWall(r) {
      const fy = r.y || 0;
      const Ri = r.r - T / 2;
      const A0 = Math.PI / 4;
      return {
        kind: 'circle', room: r, fy, h: r.h,
        a0: A0, a1: A0 + TAU, in0: A0, in1: A0 + TAU,
        metres: (ds) => ds * Ri, toS: (m) => m / Ri, outer: (ds) => ds * (r.r + T / 2),
        norm(a) { while (a < A0) a += TAU; while (a >= A0 + TAU) a -= TAU; return a; },
        band(id, s0, s1, y0, y1, d0, d1) {
          if (s1 - s0 < 1e-4 || y1 - y0 < 0.003) return;
          const R0 = Ri - d0, R1 = Ri - d1;
          const n = Math.max(1, Math.ceil((s1 - s0) * R0 / 0.7));
          const dt = (s1 - s0) / n, hh = y1 - y0;
          for (let k = 0; k < n; k++) {
            const m = s0 + (k + 0.5) * dt;
            const Rc = (R0 + R1) / 2;
            add(new THREE.BoxGeometry(2 * R0 * Math.tan(dt / 2) + 0.004, hh, R0 - R1), id,
                r.cx + Math.cos(m) * Rc, fy + y0 + hh / 2, r.cz + Math.sin(m) * Rc,
                Math.atan2(-Math.cos(m), -Math.sin(m)));
          }
        },
        frame(s) {
          return { x: r.cx + Math.cos(s) * Ri, z: r.cz + Math.sin(s) * Ri, ry: Math.atan2(-Math.cos(s), -Math.sin(s)) };
        },
      };
    }

    function openingsOf(W) {
      const r = W.room, ops = [];
      if (W.kind === 'rect') {
        for (const [g0, g1] of (r.doors[W.side] || [])) {
          ops.push({ a: g0, b: g1, y0: 0, y1: Math.min(r.h - 0.6, DOOR_H + (g1 - g0 > 2.4 ? 0.8 : 0)), kind: 'door' });
        }
        if (r.gate && r.gate.side === W.side) ops.push({ a: r.gate.span[0], b: r.gate.span[1], y0: 0, y1: 4.4, kind: 'gate' });
        for (const w of windowsFor(r)) {
          if (w.side === W.side) ops.push({ a: w.span[0], b: w.span[1], y0: w.y[0], y1: w.y[1], kind: 'window', w });
        }
      } else {
        const Ri = r.r - T / 2;
        for (const d of r.doors) {
          const half = d.w / 2 / Ri, c = W.norm(d.a);
          ops.push({ a: c - half, b: c + half, y0: 0, y1: d.w > 2.4 ? 4.0 : DOOR_H, kind: 'door' });
        }
        for (const w of windowsFor(r)) {
          const half = w.w / 2 / Ri, c = W.norm(w.a);
          ops.push({ a: c - half, b: c + half, y0: w.y[0], y1: w.y[1], kind: 'window', w });
        }
      }
      return ops;
    }

    // [0, h] less every opening that covers this stretch
    function freeSpans(ops, s0, s1, h) {
      let free = [[0, h]];
      for (const o of ops) {
        if (!(o.a <= s0 + 1e-5 && o.b >= s1 - 1e-5)) continue;
        const next = [];
        for (const [y0, y1] of free) {
          if (o.y1 <= y0 || o.y0 >= y1) { next.push([y0, y1]); continue; }
          if (o.y0 > y0) next.push([y0, o.y0]);
          if (o.y1 < y1) next.push([o.y1, y1]);
        }
        free = next;
      }
      return free;
    }

    const doneThresholds = new Set();

    function buildWall(W) {
      const r = W.room, f = finishOf(r);
      const ops = openingsOf(W);
      W.ops = ops;
      const cuts = [W.a0, W.a1];
      for (const o of ops) cuts.push(o.a, o.b);
      if (W.kind === 'circle') {
        const n = Math.ceil(TAU * r.r / 0.9);
        for (let i = 1; i < n; i++) cuts.push(W.a0 + i / n * TAU);
      }
      cuts.sort((p, q) => p - q);
      const stretches = [];
      for (let i = 0; i < cuts.length - 1; i++) {
        const s0 = cuts[i], s1 = cuts[i + 1];
        if (s1 - s0 < 1e-4) continue;
        stretches.push([s0, s1, freeSpans(ops, s0, s1, r.h)]);
      }
      // the stone
      for (const [s0, s1, free] of stretches) {
        for (const [y0, y1] of free) W.band('masonry', s0, s1, y0, y1, -T, 0);
      }
      // what is laid on it, on the room side only
      const wains = f.wains;
      const fieldGap = W.toS(0.07);
      for (const [a, b, free] of stretches) {
        const s0 = Math.max(a, W.in0), s1 = Math.min(b, W.in1);
        if (s1 - s0 < 1e-4) continue;
        for (const [y0, y1] of free) {
          if (wains > 0 && y0 < wains) {
            const top = Math.min(wains, y1);
            W.band('oak', s0, s1, y0, top, 0, 0.05);
            if (y0 < 0.01) W.band('darkoak', s0, s1, 0, 0.16, 0, 0.075);
            // the rail, unless a window sill sits on the panelling here instead
            if (top >= wains - 0.01 && y1 > wains + 0.05) W.band('darkoak', s0, s1, wains - 0.06, wains + 0.03, 0, 0.09);
            // raised fields, about ninety centimetres apiece
            if (y0 < 0.01 && wains > 0.7) {
              const len = W.metres(s1 - s0);
              const n = Math.max(1, Math.round(len / 0.9));
              const step = (s1 - s0) / n;
              if (W.metres(step) > 0.3) {
                for (let k = 0; k < n; k++) {
                  W.band('darkoak', s0 + k * step + fieldGap, s0 + (k + 1) * step - fieldGap,
                         0.28, wains - 0.15, 0.05, 0.072);
                }
              }
            }
          }
          if (f.upper !== 'masonry') {
            const b0 = Math.max(y0, wains);
            if (y1 > b0) W.band(f.upper, s0, s1, b0, y1, 0, 0.02);
          }
        }
      }
      /* Where a passage's wall runs out into the next room's doorway, a
         casing covers the ends of its panelling and paper. */
      if (W.kind === 'rect' && (wains > 0 || f.upper !== 'masonry')) {
        const open = r.open || [];
        const loOpen = open.indexOf(W.ns ? 'w' : 'n') >= 0, hiOpen = open.indexOf(W.ns ? 'e' : 's') >= 0;
        if (loOpen) W.band('darkoak', W.in0 - LAP, W.in0 + 0.12, 0, r.h, 0, 0.1);
        if (hiOpen) W.band('darkoak', W.in1 - 0.12, W.in1 + LAP, 0, r.h, 0, 0.1);
      }
      // the cornice, all the way round
      const cMat = f.ceil === 'beams' || f.ceil === 'cone' ? 'beam' : 'plaster';
      W.band(cMat, W.in0, W.in1, r.h - 0.3, r.h, 0, 0.16);
      W.band(cMat, W.in0, W.in1, r.h - 0.4, r.h - 0.3, 0, 0.08);

      for (const o of ops) {
        if (o.kind === 'window') windowIn(W, o);
        else doorIn(W, o);
      }
    }

    /* A doorway: a carved oak case on this room's face, and a stone
       threshold across the wall's thickness. */
    function doorIn(W, o) {
      const c = (o.a + o.b) / 2;
      const w = W.metres(o.b - o.a), wo = W.outer(o.b - o.a);
      const stone = o.kind === 'gate' || W.room.id === 'stair' || W.room.id === 'turret';
      const id = stone ? 'dressed' : 'darkoak';
      const jw = W.toS(o.kind === 'gate' ? 0.32 : 0.16), lap = W.toS(LAP);
      /* The case laps a few millimetres into the opening, so the ends of
         the panelling and paper finish inside it rather than flush with
         its face. */
      W.band(id, o.a - jw, o.a + lap, 0, o.y1 + 0.2, 0, 0.1);
      W.band(id, o.b - lap, o.b + jw, 0, o.y1 + 0.2, 0, 0.1);
      W.band(id, o.a + lap, o.b - lap, o.y1 - 0.012, o.y1 + 0.2, 0, 0.1);
      W.band(id, o.a - jw - W.toS(0.1), o.b + jw + W.toS(0.1), o.y1 + 0.2, o.y1 + 0.29, 0, 0.16);
      void w;
      const f = W.frame(c);
      const key = Math.round(f.x * 10) + ':' + Math.round(f.z * 10) + ':' + W.fy;
      if (!doneThresholds.has(key)) {
        doneThresholds.add(key);
        onWall(W, c, lbox(wo + 0.02, 0.112, T + 0.06, 0, -0.044, -T / 2), 'dressed');
      }
    }

    /* A window: an arched head of stone, stone mullions and a transom,
       leaded lights, a moulded surround and a deep sill — and the view. */
    function windowIn(W, o) {
      const spec = o.w;
      const c = (o.a + o.b) / 2;
      const w = W.metres(o.b - o.a), wo = W.outer(o.b - o.a);
      const y0 = o.y0, y1 = o.y1, h = y1 - y0;
      const hw = wo / 2 + 0.01;
      const rise = spec.arch ? Math.min(hw + 0.12, h * 0.45) : 0;
      // glass, in the middle of the wall
      onWall(W, c, new THREE.PlaneGeometry(wo, h).translate(0, y0 + h / 2, -T / 2), 'glass');
      if (spec.arch) {
        const s = new THREE.Shape();
        const ar = Math.min(hw, rise - 0.04);
        s.moveTo(hw, 0); s.lineTo(hw, rise); s.lineTo(-hw, rise); s.lineTo(-hw, 0);
        if (ar < hw) s.lineTo(-ar, 0);
        s.absarc(0, 0, ar, Math.PI, 0, true);
        if (ar < hw) s.lineTo(hw, 0);
        const g = new THREE.ExtrudeGeometry(s, { depth: T + 0.01, bevelEnabled: false, curveSegments: 16 });
        g.translate(0, y1 - rise, -T - 0.01);
        onWall(W, c, g, 'masonry');
      }
      const spring = y1 - rise;
      // mullion and transom, in dressed stone
      if (wo > 1.25) onWall(W, c, lbox(0.11, spring - y0 + 0.02, T * 0.7, 0, y0 + (spring - y0) / 2, -T / 2), 'dressed');
      const transom = y0 + (spring - y0) * 0.68;
      if (h > 2.6) onWall(W, c, lbox(wo, 0.1, T * 0.7, 0, transom, -T / 2), 'dressed');
      // leading
      const bars = [];
      const nv = Math.max(1, Math.round(wo / 0.27));
      for (let i = 1; i < nv; i++) bars.push(lbox(0.014, h, 0.014, -wo / 2 + i * wo / nv, y0 + h / 2, -T / 2 + 0.05));
      for (let y = y0 + 0.34; y < y1 - 0.05; y += 0.34) bars.push(lbox(wo, 0.014, 0.014, 0, y, -T / 2 + 0.05));
      for (const b of bars) onWall(W, c, b, 'lead');
      // the surround on the room side
      const jw = 0.17;
      for (const sx of [-1, 1]) {
        onWall(W, c, lbox(jw + LAP, spring - y0 + 0.1, 0.08, sx * (w / 2 + (jw - LAP) / 2), y0 - 0.05 + (spring - y0 + 0.1) / 2, 0.04), 'dressed');
      }
      if (spec.arch) {
        onWall(W, c, new THREE.TorusGeometry(Math.min(w / 2, rise - 0.04) + jw / 2, 0.075, 6, 22, Math.PI)
          .translate(0, spring, 0.05), 'dressed');
      } else {
        onWall(W, c, lbox(w + jw * 2, 0.18, 0.08, 0, y1 + 0.09, 0.04), 'dressed');
      }
      // the sill stands proud of the stone it sits on, so they never share a plane
      onWall(W, c, lbox(w + 0.42, 0.085, T / 2 + 0.27, 0, y0 + 0.0025, 0.27 - (T / 2 + 0.27) / 2), 'dressed');
      if (spec.candles) {
        [[-0.28, 0.24, 0.05], [0.0, 0.34, 0.06], [0.26, 0.18, 0.045]].forEach(([dx, hh, rr]) => {
          const p = wallPoint(W, c, dx, 0.12);
          candle(p.x, W.fy + y0 + 0.03, p.z, hh, rr);
        });
      }
      if (spec.curtains) curtains(W, c, w, y1);
    }

    /* Velvet curtains on a pole, with a tartan pelmet over them. They
       hang from the pole to the floor, so they are held, not hovering. */
    function curtains(W, c, w, top) {
      const poleY = top + 0.28;
      onWall(W, c, new THREE.CylinderGeometry(0.025, 0.025, w + 1.3, 10).rotateZ(Math.PI / 2).translate(0, poleY, 0.17), 'iron');
      for (const sx of [-1, 1]) {
        onWall(W, c, lbox(0.04, 0.04, 0.17, sx * (w / 2 + 0.55), poleY, 0.085), 'iron');
        onWall(W, c, new THREE.SphereGeometry(0.045, 10, 7).translate(sx * (w / 2 + 0.68), poleY, 0.17), 'gold');
        const H = poleY - 0.04;
        const g = new THREE.PlaneGeometry(0.62, H, 16, 1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const u = p.getX(i) / 0.62 + 0.5, v = (p.getY(i) + H / 2) / H;
          const gather = 1 - 0.35 * Math.max(0, 0.45 - Math.abs(v - 0.35)) * 2;   // tied back a little
          p.setX(i, p.getX(i) * gather);
          p.setZ(i, Math.sin(u * Math.PI * 7) * 0.045);
        }
        g.computeVertexNormals();
        g.translate(sx * (w / 2 + 0.22), H / 2 + 0.02, 0.24);
        onWall(W, c, g, 'velvet');
        onWall(W, c, new THREE.TorusGeometry(0.1, 0.018, 5, 12).rotateX(Math.PI / 2).translate(sx * (w / 2 + 0.22), 1.1, 0.24), 'gold');
      }
      onWall(W, c, lbox(w + 1.45, 0.36, 0.1, 0, poleY + 0.06, 0.3), 'tartanRed');
      onWall(W, c, lbox(w + 1.5, 0.05, 0.11, 0, poleY - 0.13, 0.325), 'gold');
    }

    /* ---------------- floors and ceilings ---------------- */

    const walls = {};
    const flip = (g) => {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      const n = g.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
      return g;
    };
    const FLOOR = { paving: 'flags', timber: 'boards', masonry: 'dressed' };

    for (const r of L.ROOMS) {
      const fy = r.y || 0, f = finishOf(r);
      const floorId = FLOOR[r.floor] || 'flags';
      if (r.shape === 'rect') {
        const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        box(floorId, w, 0.2, d, cx, fy - 0.1, cz);
        const ceilId = f.ceil === 'beams' ? 'beam' : 'plaster';
        // over the walls, except on an open side, where it stops on the
        // line inside the next room's wall instead of poking through it.
        // It stops a centimetre short of the wall's far face too: a lower
        // room's ceiling ending exactly on a taller neighbour's wall face
        // would flicker against it.
        const op = (sd) => ((r.open || []).indexOf(sd) >= 0 ? 0 : T / 2 - 0.01);
        const sx0 = r.x0 - op('w'), sx1 = r.x1 + op('e'), sz0 = r.z0 - op('n'), sz1 = r.z1 + op('s');
        if (f.ceil === 'glass') glassRoof(r, fy);
        else box(ceilId, sx1 - sx0, 0.3, sz1 - sz0, (sx0 + sx1) / 2, fy + r.h + 0.15, (sz0 + sz1) / 2);
        if (f.ceil === 'coffered' || f.ceil === 'beams') {
          const across = w < d, span = across ? d : w, other = across ? w : d;
          const n = Math.max(1, Math.round(span / 2.6));
          for (let i = 1; i < n; i++) {
            const s = (across ? r.z0 : r.x0) + i * span / n;
            if (across) box('beam', w - T, 0.34, 0.28, cx, fy + r.h - 0.17, s);
            else box('beam', 0.28, 0.34, d - T, s, fy + r.h - 0.17, cz);
          }
          if (f.ceil === 'coffered') {
            const m = Math.max(1, Math.round(other / 2.6));
            for (let i = 1; i < m; i++) {
              const s = (across ? r.x0 : r.z0) + i * other / m;
              if (across) box('beam', 0.22, 0.26, d - T, s, fy + r.h - 0.13, cz);
              else box('beam', w - T, 0.26, 0.22, cx, fy + r.h - 0.13, s);
            }
          }
        }
        if (r.ramp) buildStair(r);
        walls[r.id] = {};
        for (const side of ['n', 's', 'e', 'w']) {
          if ((r.open || []).indexOf(side) >= 0) continue;
          const W = rectWall(r, side);
          walls[r.id][side] = W;
          buildWall(W);
        }
      } else {
        add(new THREE.CylinderGeometry(r.r, r.r, 0.2, 64), floorId, r.cx, fy - 0.1, r.cz);
        const W = circleWall(r);
        walls[r.id] = { circle: W };
        // Raised towers need stone below the floor too: this is visible
        // through neighbouring windows. Carry the walls below the lawn.
        if (fy > 0) W.band('masonry', W.a0, W.a1, -fy - 0.5, -0.01, -T, 0);
        buildWall(W);
        if (f.ceil === 'vault') vault(r, fy);
        else cone(r, fy);
      }
    }

    /* The round chamber's ceiling: a shallow plaster dome on twelve oak
       ribs, springing from the cornice, with a gilt boss at the crown. */
    function vault(r, fy) {
      const R = r.r + T / 2, rise = 3.2, top = fy + r.h;
      add(flip(new THREE.SphereGeometry(R, 56, 14, 0, TAU, 0, Math.PI / 2)).scale(1, rise / R, 1), 'plaster', r.cx, top, r.cz);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU;
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12 * Math.PI / 2;
          const rr = (r.r - T / 2 - 0.05) * Math.cos(t);
          pts.push(V(Math.cos(a) * rr, Math.sin(t) * (rise - 0.08), Math.sin(a) * rr));
        }
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.085, 6), 'darkoak', r.cx, top, r.cz);
      }
      add(new THREE.TorusGeometry(r.r - T / 2 - 0.08, 0.12, 8, 64).rotateX(Math.PI / 2), 'darkoak', r.cx, top + 0.02, r.cz);
      sph('gold', 0.32, r.cx, top + rise - 0.12, r.cz, 1, 0.6, 1, 16);
      add(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 32), 'plaster', r.cx, top + rise - 0.06, r.cz);
      r._crown = top + rise - 0.2;
      add(new THREE.ConeGeometry(R + 0.35, 5.5, 40, 1, true), 'slate', r.cx, top + 2.75, r.cz);
    }

    /* The conservatory's: glass on white-painted iron, a ridge down the
       middle and the panes either side of it, on a rafter every metre
       and a half. You see the sky through it. */
    function glassRoof(r, fy) {
      const top = fy + r.h, w = r.x1 - r.x0 + T, d = r.z1 - r.z0 + T, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const rise = 1.6, slope = Math.atan2(rise, w / 2), run = Math.hypot(w / 2, rise);
      for (const sx of [-1, 1]) {
        add(new THREE.PlaneGeometry(run, d).rotateX(-Math.PI / 2).rotateZ(-sx * slope)
          .translate(cx + sx * w / 4, top + rise / 2, cz), 'glass');
        for (let z = r.z0; z <= r.z1 + 0.01; z += (r.z1 - r.z0) / 8) {
          add(new THREE.BoxGeometry(run, 0.08, 0.06).rotateZ(-sx * slope).translate(cx + sx * w / 4, top + rise / 2 - 0.05, z), 'linen');
        }
        // the eaves: a white beam along each long wall
        box('linen', 0.14, 0.16, d, cx + sx * (w / 2 - 0.07), top + 0.08, cz);
      }
      box('linen', 0.12, 0.14, d, cx, top + rise - 0.04, cz);
      // the gable ends, glazed too
      for (const z of [r.z0 - T / 2 - 0.01, r.z1 + T / 2 + 0.01]) {
        const s = new THREE.Shape();
        s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rise); s.lineTo(-w / 2, 0);
        add(new THREE.ShapeGeometry(s).translate(cx, top, z), 'glass');
      }
    }

    /* The turret's: a cone of boards on rafters. */
    function cone(r, fy) {
      const R = r.r + T / 2, rise = 2.6, top = fy + r.h;
      add(flip(new THREE.ConeGeometry(R, rise, 40, 1, true)), 'beam', r.cx, top + rise / 2, r.cz);
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU, rr = r.r - T / 2 - 0.12;
        add(CastleProps.stick(V(Math.cos(a) * rr, 0, Math.sin(a) * rr), V(0, rise - 0.15, 0), 0.07, 0.05, 6),
            'darkoak', r.cx, top, r.cz);
      }
      add(new THREE.TorusGeometry(r.r - T / 2 - 0.1, 0.1, 6, 40).rotateX(Math.PI / 2), 'darkoak', r.cx, top + 0.02, r.cz);
      r._crown = top + rise - 0.2;
      add(new THREE.ConeGeometry(R + 0.4, 4.6, 32, 1, true), 'slate', r.cx, top + 2.3, r.cz);
    }

    function buildStair(r) {
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const z = -14.0 - (i + 0.5) * (3.6 / steps);
        const y = (i + 1) * (3 / steps);
        box('dressed', r.x1 - r.x0, y, 3.6 / steps + 0.004, 0, y / 2, z);
        box('tartanRed', 1.0, 0.009, 3.6 / steps - 0.04, 0, y + 0.0045, z + 0.01);
      }
    }

    /* ---------------- furniture ---------------- */

    function chandelier(x, y, z, r, n, ceilY) {
      box('iron', 0.035, ceilY - (y + 0.55), 0.035, x, (ceilY + y + 0.55) / 2, z);
      add(CastleProps.lathe([[0.02, -0.4], [0.07, -0.33], [0.05, -0.2], [0.11, -0.05], [0.12, 0.05],
                             [0.06, 0.15], [0.05, 0.45], [0.09, 0.5], [0.03, 0.56]], 14), 'iron', x, y, z);
      add(new THREE.TorusGeometry(r, 0.035, 6, 48).rotateX(Math.PI / 2), 'iron', x, y, z);
      add(new THREE.TorusGeometry(r * 0.5, 0.03, 6, 32).rotateX(Math.PI / 2), 'iron', x, y + 0.42, z);
      const cnt = low ? Math.ceil(n * 0.6) : n;
      for (let i = 0; i < cnt; i++) {
        const a = i / cnt * TAU;
        const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
        if (i % 2 === 0) add(CastleProps.stick(V(x, y, z), V(cx, y, cz), 0.018), 'iron');
        cyl('iron', 0.045, 0.03, 0.035, 10, cx, y + 0.02, cz);
        candle(cx, y + 0.035, cz, 0.17, 0.024);
      }
      const inner = Math.ceil(cnt / 2);
      for (let i = 0; i < inner; i++) {
        const a = (i + 0.5) / inner * TAU;
        const cx = x + Math.cos(a) * r * 0.5, cz = z + Math.sin(a) * r * 0.5;
        cyl('iron', 0.04, 0.028, 0.03, 10, cx, y + 0.44, cz);
        candle(cx, y + 0.455, cz, 0.15, 0.022);
      }
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU;
        add(CastleProps.stick(V(x + Math.cos(a) * r * 0.5, y + 0.42, z + Math.sin(a) * r * 0.5),
                              V(x, y + 0.55, z), 0.014), 'iron');
      }
    }

    /* A twin-candle sconce with a backplate on the wall. `d` is how far
       the wall's surface stands proud of its stone at that height. */
    function sconce(W, s, y, d = 0.02) {
      onWall(W, s, lbox(0.13, 0.34, 0.03, 0, y, d + 0.015), 'gold');
      onWall(W, s, lbox(0.03, 0.03, 0.18, 0, y - 0.05, d + 0.11), 'iron');
      for (const sx of [-1, 1]) {
        onWall(W, s, lbox(0.26, 0.022, 0.022, sx * 0.13, y - 0.05, d + 0.2), 'iron');
        const p = wallPoint(W, s, sx * 0.24, d + 0.2);
        cyl('gold', 0.045, 0.025, 0.04, 10, p.x, W.fy + y - 0.03, p.z);
        candle(p.x, W.fy + y - 0.01, p.z, 0.18, 0.022);
      }
    }

    /* How far a flat thing `w` wide must stand off a curved wall so its
       edges clear the stone. Nothing, on a straight one. */
    const sag = (W, w) => W.kind === 'circle'
      ? (W.room.r - T / 2) * (1 - Math.cos((w / 2) / (W.room.r - T / 2))) + 0.006 : 0;

    /* An oil portrait in a gilt frame. */
    function portrait(W, s, y, w, h, tile, d = 0.02) {
      d += sag(W, w + 0.2);
      const g = CastleProps.portraitUV(new THREE.PlaneGeometry(w, h), tile).translate(0, y, d + 0.035);
      onWall(W, s, g, 'portrait');
      const fw = 0.09;
      onWall(W, s, lbox(w + fw * 2, fw, 0.07, 0, y + h / 2 + fw / 2, d + 0.035), 'gold');
      onWall(W, s, lbox(w + fw * 2, fw, 0.07, 0, y - h / 2 - fw / 2, d + 0.035), 'gold');
      for (const sx of [-1, 1]) onWall(W, s, lbox(fw, h, 0.07, sx * (w / 2 + fw / 2), y, d + 0.035), 'gold');
      onWall(W, s, lbox(w + 0.06, 0.012, 0.012, 0, y + h / 2 + 0.003, d + 0.075), 'darkoak');
    }

    /* A stag's head on a shield of oak: neck, muzzle, ears, and a royal
       of antlers. */
    function stagHead(W, s, y, d = 0.0, scale = 1) {
      d += sag(W, 0.55 * scale);
      const k = scale;
      const parts = { darkoak: [], fur: [], bone: [], soot: [] };
      parts.darkoak.push(new THREE.CylinderGeometry(0.26 * k, 0.26 * k, 0.05, 20).rotateX(Math.PI / 2).scale(1, 1.25, 1).translate(0, 0, d + 0.025));
      parts.fur.push(new THREE.CylinderGeometry(0.12 * k, 0.17 * k, 0.3 * k, 12).rotateX(Math.PI / 2 - 0.35).translate(0, -0.04 * k, d + 0.18 * k));
      parts.fur.push(new THREE.SphereGeometry(0.11 * k, 12, 9).scale(1, 1, 1.7).rotateX(0.5).translate(0, -0.02 * k, d + 0.38 * k));
      parts.fur.push(new THREE.SphereGeometry(0.06 * k, 10, 7).scale(1, 0.9, 1.3).translate(0, -0.12 * k, d + 0.5 * k));
      parts.soot.push(new THREE.SphereGeometry(0.03 * k, 8, 6).translate(0, -0.12 * k, d + 0.57 * k));
      for (const sx of [-1, 1]) {
        parts.soot.push(new THREE.SphereGeometry(0.018 * k, 6, 5).translate(sx * 0.075 * k, 0.03 * k, d + 0.42 * k));
        parts.fur.push(new THREE.ConeGeometry(0.045 * k, 0.16 * k, 6).rotateZ(-sx * 1.2).translate(sx * 0.14 * k, 0.06 * k, d + 0.3 * k));
        // the beam, then tines off it
        const base = V(sx * 0.06 * k, 0.08 * k, d + 0.34 * k);
        const p1 = V(sx * 0.22 * k, 0.3 * k, d + 0.3 * k);
        const p2 = V(sx * 0.32 * k, 0.56 * k, d + 0.22 * k);
        const p3 = V(sx * 0.3 * k, 0.8 * k, d + 0.2 * k);
        parts.bone.push(CastleProps.stick(base, p1, 0.026 * k, 0.022 * k));
        parts.bone.push(CastleProps.stick(p1, p2, 0.022 * k, 0.018 * k));
        parts.bone.push(CastleProps.stick(p2, p3, 0.018 * k, 0.01 * k));
        parts.bone.push(CastleProps.stick(p1, V(sx * 0.18 * k, 0.36 * k, d + 0.52 * k), 0.016 * k, 0.006 * k));
        parts.bone.push(CastleProps.stick(p2, V(sx * 0.42 * k, 0.66 * k, d + 0.34 * k), 0.014 * k, 0.005 * k));
        parts.bone.push(CastleProps.stick(V(sx * 0.31 * k, 0.7 * k, d + 0.21 * k), V(sx * 0.4 * k, 0.86 * k, d + 0.3 * k), 0.012 * k, 0.004 * k));
        parts.bone.push(CastleProps.stick(V(sx * 0.31 * k, 0.72 * k, d + 0.21 * k), V(sx * 0.22 * k, 0.9 * k, d + 0.26 * k), 0.011 * k, 0.004 * k));
      }
      for (const id in parts) for (const g of parts[id]) onWall(W, s, g.translate(0, y, 0), id);
    }

    /* A hanging banner on an iron pole with brackets to the wall. */
    function banner(W, s, top, w, len, id, d = 0.0) {
      d += sag(W, w + 0.45);
      onWall(W, s, new THREE.CylinderGeometry(0.022, 0.022, w + 0.3, 8).rotateZ(Math.PI / 2).translate(0, top, d + 0.14), 'iron');
      for (const sx of [-1, 1]) {
        onWall(W, s, lbox(0.03, 0.03, 0.14, sx * (w / 2 + 0.05), top, d + 0.07), 'iron');
        onWall(W, s, new THREE.SphereGeometry(0.04, 8, 6).translate(sx * (w / 2 + 0.17), top, d + 0.14), 'gold');
      }
      onWall(W, s, lbox(w, len, 0.025, 0, top - len / 2 - 0.02, d + 0.14), id);
      onWall(W, s, lbox(w, 0.06, 0.035, 0, top - len - 0.05, d + 0.14), 'gold');
      onWall(W, s, lbox(w * 0.35, w * 0.35, 0.035, 0, top - len * 0.4, d + 0.14).rotateZ(0), 'gold');
    }

    function candleStand(x, z, fy = 0, h = 1.45) {
      add(CastleProps.lathe([[0.02, 0.06], [0.06, 0.1], [0.035, 0.25], [0.025, h * 0.5], [0.05, h * 0.55],
                             [0.025, h * 0.6], [0.022, h - 0.06], [0.12, h - 0.03], [0.13, h], [0.0, h]], 12), 'iron', x, fy, z);
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU;
        add(CastleProps.stick(V(0, 0.12, 0), V(Math.cos(a) * 0.3, 0.0, Math.sin(a) * 0.3), 0.018), 'iron', x, fy, z);
        sph('iron', 0.03, x + Math.cos(a) * 0.3, fy + 0.02, z + Math.sin(a) * 0.3);
      }
      candle(x, fy + h, z, 0.34, 0.065);
    }

    function rug(id, x, z, w, d, fy = 0, ry = 0) {
      box(id, w, 0.02, d, x, fy + 0.01, z, ry);
      const fr = (dx, dz, ww, dd) => box('linen', ww, 0.012, dd, x + dx, fy + 0.006, z + dz, ry);
      if (ry) return;
      fr(0, -d / 2 - 0.04, w, 0.08); fr(0, d / 2 + 0.04, w, 0.08);
    }

    function sideboard(W, s, len, d = 0.0, items = true) {
      const g = (w, h, dd, x, y, z) => lbox(w, h, dd, x, y, z);
      onWall(W, s, g(len, 0.1, 0.5, 0, 0.05, d + 0.27), 'darkoak');
      onWall(W, s, g(len - 0.04, 0.78, 0.52, 0, 0.49, d + 0.27), 'oak');
      onWall(W, s, g(len + 0.08, 0.05, 0.6, 0, 0.905, d + 0.3), 'darkoak');
      const n = Math.max(2, Math.round(len / 0.7));
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + (i + 0.5) * len / n;
        onWall(W, s, g(len / n - 0.08, 0.6, 0.03, x, 0.48, d + 0.545), 'darkoak');
        onWall(W, s, new THREE.SphereGeometry(0.02, 8, 6).translate(x + (i % 2 ? -1 : 1) * (len / n / 2 - 0.12), 0.5, d + 0.57), 'gold');
      }
      if (!items) return;
      // a pair of candelabra and a row of plates stood on edge
      for (const sx of [-1, 1]) {
        const x = sx * (len / 2 - 0.35);
        onWall(W, s, CastleProps.lathe([[0.08, 0], [0.07, 0.03], [0.025, 0.06], [0.02, 0.32], [0.04, 0.34], [0, 0.35]], 12)
          .translate(x, 0.93, d + 0.3), 'silver');
        onWall(W, s, lbox(0.3, 0.018, 0.018, x, 1.255, d + 0.3), 'silver');
        for (const ax of [-0.14, 0, 0.14]) {
          const p = wallPoint(W, s, x + ax, d + 0.3);
          cyl('silver', 0.03, 0.02, 0.04, 8, p.x, W.fy + 1.284, p.z);
          candle(p.x, W.fy + 1.304, p.z, 0.2, 0.022);
        }
      }
      for (let i = -2; i <= 2; i++) {
        onWall(W, s, new THREE.CylinderGeometry(0.16, 0.16, 0.02, 20).rotateX(Math.PI / 2 - 0.15).translate(i * 0.36, 1.085, d + 0.12), 'china');
      }
    }

    function fireplace(W, s, opts = {}) {
      const w = opts.w || 3.6, d = opts.d || 0.0, top = W.h;
      const g = lbox;
      // the hearth stone, standing just proud of the floor
      onWall(W, s, g(w + 0.6, 0.05, 1.0, 0, 0.025, d + 0.5), 'dressed');
      // jambs, lintel and mantel shelf
      for (const sx of [-1, 1]) {
        onWall(W, s, g(0.5, 1.75, 0.62, sx * (w / 2 - 0.25), 0.875, d + 0.31), 'dressed');
        onWall(W, s, g(0.6, 0.12, 0.7, sx * (w / 2 - 0.25), 0.06, d + 0.35), 'dressed');
        onWall(W, s, g(0.36, 1.2, 0.08, sx * (w / 2 - 0.25), 0.95, d + 0.64), 'dressed');
      }
      onWall(W, s, g(w, 0.42, 0.66, 0, 1.96, d + 0.33), 'dressed');
      onWall(W, s, g(w + 0.3, 0.1, 0.82, 0, 2.22, d + 0.41), 'dressed');
      // the chimney breast, to the ceiling, with a carved shield
      onWall(W, s, g(w - 0.5, top - 2.27, 0.48, 0, 2.27 + (top - 2.27) / 2, d + 0.24), 'masonry');
      onWall(W, s, g(w - 0.3, 0.14, 0.56, 0, 2.34, d + 0.28), 'dressed');
      onWall(W, s, new THREE.CylinderGeometry(0.45, 0.45, 0.08, 6).rotateX(Math.PI / 2).scale(1, 1.25, 1)
        .translate(0, 3.5, d + 0.52), 'gold');
      onWall(W, s, new THREE.CylinderGeometry(0.36, 0.36, 0.08, 6).rotateX(Math.PI / 2).scale(1, 1.25, 1)
        .translate(0, 3.5, d + 0.55), 'velvet');
      // the firebox: soot at the back and sides, logs, and the fire
      const ow = w - 1.0;
      onWall(W, s, g(ow, 1.55, 0.06, 0, 0.8, d + 0.13), 'soot');
      for (const sx of [-1, 1]) onWall(W, s, g(0.05, 1.55, 0.5, sx * (ow / 2 - 0.02), 0.8, d + 0.36), 'soot');
      onWall(W, s, g(ow - 0.1, 0.05, 0.55, 0, 0.07, d + 0.32), 'soot');
      onWall(W, s, g(ow * 0.7, 0.03, 0.04, 0, 0.18, d + 0.52), 'iron');
      for (let i = 0; i < 3; i++) {
        onWall(W, s, new THREE.CylinderGeometry(0.08, 0.09, ow * 0.6, 10).rotateZ(Math.PI / 2).rotateY((i - 1) * 0.25)
          .translate((i - 1) * 0.1, 0.19 + (i === 1 ? 0.13 : 0), d + 0.3 + (i - 1) * 0.06), 'log');
      }
      for (let i = 0; i < 7; i++) {
        const x = -ow * 0.3 + i * ow * 0.1, hh = 0.35 + (i % 3) * 0.15;
        onWall(W, s, new THREE.ConeGeometry(0.1 + (i % 2) * 0.04, hh, 6).translate(x, 0.32 + hh / 2, d + 0.3 + (i % 2 ? 0.05 : -0.05)),
               null, 0, i % 2 ? '#ff8a2a' : '#ffc062');
      }
      onWall(W, s, g(ow * 0.6, 0.04, 0.3, 0, 0.11, d + 0.3), null, 0, '#ff6a1a');
      if (opts.overmantel === 'stag') stagHead(W, s, 4.8, d + 0.48, 1.2);
      else if (opts.overmantel === 'portrait') portrait(W, s, 4.9, 1.3, 1.6, opts.tile || 0, d + 0.48);
      const hw = (w + 0.6) / 2;
      const cs = [[-hw, 0], [hw, 0], [-hw, d + 1.0], [hw, d + 1.0]].map(([lx, lz]) => wallPoint(W, s, lx, lz));
      solid.push({ x0: Math.min(...cs.map(p => p.x)), x1: Math.max(...cs.map(p => p.x)),
                   z0: Math.min(...cs.map(p => p.z)), z1: Math.max(...cs.map(p => p.z)) });
    }

    function armour(x, z, ry) {
      const p = { dressed: [], steel: [], soot: [], darkoak: [], velvet: [] };
      const at = (g) => g;
      p.dressed.push(lbox(0.7, 0.42, 0.7, 0, 0.21, 0));
      p.dressed.push(lbox(0.8, 0.06, 0.8, 0, 0.45, 0));
      for (const sx of [-1, 1]) {
        p.steel.push(lbox(0.12, 0.06, 0.24, sx * 0.1, 0.51, 0.04));
        p.steel.push(CastleProps.lathe([[0.055, 0], [0.065, 0.12], [0.075, 0.3], [0.06, 0.42], [0.075, 0.48], [0.07, 0.8], [0.05, 0.82]], 12)
          .translate(sx * 0.1, 0.54, 0));
        p.steel.push(new THREE.SphereGeometry(0.075, 10, 8).translate(sx * 0.1, 0.98, 0.02));
      }
      p.steel.push(CastleProps.lathe([[0.2, 0], [0.17, 0.2], [0.15, 0.24]], 16).translate(0, 1.32, 0));
      p.steel.push(CastleProps.lathe([[0.15, 0], [0.17, 0.12], [0.19, 0.3], [0.17, 0.46], [0.12, 0.52], [0.06, 0.54]], 16)
        .scale(1, 1, 0.8).translate(0, 1.54, 0));
      for (const sx of [-1, 1]) {
        p.steel.push(new THREE.SphereGeometry(0.12, 10, 8).scale(1, 0.8, 1).translate(sx * 0.22, 1.98, 0));
        p.steel.push(CastleProps.stick(V(sx * 0.25, 1.95, 0), V(sx * 0.28, 1.62, 0.04), 0.055, 0.05, 10));
        p.steel.push(CastleProps.stick(V(sx * 0.28, 1.62, 0.04), V(sx * 0.26, 1.36, 0.16), 0.05, 0.045, 10));
        p.steel.push(new THREE.SphereGeometry(0.055, 8, 6).translate(sx * 0.26, 1.33, 0.18));
      }
      p.steel.push(new THREE.SphereGeometry(0.13, 14, 10).scale(1, 1.15, 1.05).translate(0, 2.2, 0));
      p.steel.push(lbox(0.2, 0.03, 0.1, 0, 2.06, 0.08));
      p.soot.push(lbox(0.16, 0.025, 0.02, 0, 2.2, 0.135));
      p.velvet.push(new THREE.ConeGeometry(0.035, 0.24, 8).translate(0, 2.42, -0.02));
      // a halberd in the right hand
      p.darkoak.push(CastleProps.stick(V(0.3, 0.48, 0.2), V(0.3, 2.8, 0.2), 0.02));
      p.steel.push(lbox(0.02, 0.32, 0.18, 0.3, 2.5, 0.28));
      p.steel.push(new THREE.ConeGeometry(0.03, 0.26, 6).translate(0.3, 2.93, 0.2));
      for (const id in p) for (const g of p[id]) add(at(g), id, x, 0, z, ry);
      solid.push({ x0: x - 0.42, x1: x + 0.42, z0: z - 0.42, z1: z + 0.42 });
    }

    /* ---------------- the house, room by room ---------------- */

    const solid = [];
    const P = Math.PI;

    /* The entrance hall: a stone hall with a grand stair up the west side,
       a fire in the east wall, armour either side of the way through to
       the round table, and the great door shut behind you. */
    {
      const hall = L.byId('hall'), Wn = walls.hall.n, We = walls.hall.e, Ww = walls.hall.w, Ws = walls.hall.s;
      // the great door, shut, with its studs and straps
      for (const sx of [-1, 1]) {
        box('darkoak', 1.99, 4.4, 0.14, sx * 1.0, 2.2, hall.z1);
        for (const y of [0.7, 2.2, 3.7]) box('iron', 1.8, 0.07, 0.03, sx * 1.0, y, hall.z1 - 0.085);
        for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
          sph('iron', 0.03, sx * (0.35 + j * 0.6), 0.4 + i * 0.85, hall.z1 - 0.08, 1, 1, 0.6, 6);
        }
        add(new THREE.TorusGeometry(0.12, 0.022, 6, 16), 'iron', sx * 0.32, 1.25, hall.z1 - 0.1);
      }
      rug('tartanRed', 0, 11, 2.4, 11.6);
      // armour, either side of the round chamber's door
      for (const sx of [-1, 1]) armour(sx * 3.1, 4.95, 0);
      portrait(Wn, -4.9, 4.4, 1.3, 1.7, 0, 0);
      portrait(Wn, 4.9, 4.4, 1.3, 1.7, 1, 0);
      stagHead(Wn, 0, 5.3, 0, 1.25);
      banner(Wn, -3.1, 8.1, 1.0, 2.6, 'tartanRed');
      banner(Wn, 3.1, 8.1, 1.0, 2.6, 'tartanGreen');
      sconce(Wn, -2.3, 2.7, 0); sconce(Wn, 2.3, 2.7, 0);
      // the fire in the east wall
      fireplace(We, 7.8, { w: 3.4, overmantel: 'portrait', tile: 2 });
      sconce(We, 5.0, 2.8, 0); sconce(We, 10.7, 2.8, 0);
      portrait(We, 16.4, 4.0, 1.0, 1.3, 3, 0);
      // the west wall: a portrait, then the stair
      portrait(Ww, 6.6, 3.6, 1.1, 1.45, 4, 0);
      sconce(Ww, 8.3, 2.7, 0);
      portrait(Ww, 14.2, 4.6, 1.0, 1.3, 5, 0);
      // the stair: eight stone steps up to a landing and a shut door
      /* Seven risers and the landing. The handrail follows the nosings,
         and every baluster is cut to meet it. */
      const sx0 = -6.75, sx1 = -4.6, rise = 0.375, run = 0.45, z0 = 12.6, bx = sx1 - 0.12;
      const top7 = z0 + 7 * run;                               // the last nosing: the landing's edge
      const railY = (z) => z >= top7 ? 3.0 + 0.9 : rise + 0.9 + (z - z0) * rise / run;
      for (let i = 0; i < 8; i++) {
        const top = (i + 1) * rise;
        box('dressed', sx1 - sx0, top, run + 0.002, (sx0 + sx1) / 2, top / 2, z0 + (i + 0.5) * run);
        if (i < 7) box('tartanRed', 1.2, 0.014, run - 0.03, (sx0 + sx1) / 2, top + 0.007, z0 + (i + 0.5) * run + 0.01);
        if (i < 7) for (const k of [0.3, 0.75]) {
          const z = z0 + (i + k) * run;
          add(CastleProps.turnedLeg(railY(z) - top, 0.026), 'darkoak', bx, top, z);
        }
      }
      const land0 = z0 + 8 * run;
      box('dressed', sx1 - sx0, 3.0, 17.75 - land0, (sx0 + sx1) / 2, 1.5, (land0 + 17.75) / 2);
      for (let z = top7 + 0.25; z < 17.6; z += 0.24) add(CastleProps.turnedLeg(0.9, 0.026), 'darkoak', bx, 3.0, z);
      add(CastleProps.stick(V(bx, railY(z0), z0), V(bx, railY(top7), top7), 0.04, 0.04, 8), 'darkoak');
      add(CastleProps.stick(V(bx, railY(top7), top7), V(bx, railY(top7), 17.75), 0.04, 0.04, 8), 'darkoak');
      box('darkoak', 0.2, railY(z0) + 0.1, 0.2, bx, (railY(z0) + 0.1) / 2, z0 - 0.02);
      add(CastleProps.lathe([[0.1, 0], [0.11, 0.04], [0.05, 0.1], [0.09, 0.2], [0.0, 0.28]], 12), 'darkoak', bx, railY(z0) + 0.1, z0 - 0.02);
      box('darkoak', 0.18, 1.0, 0.18, bx, 3.5, top7);
      add(CastleProps.lathe([[0.09, 0], [0.1, 0.04], [0.04, 0.1], [0.08, 0.18], [0.0, 0.26]], 12), 'darkoak', bx, 4.0, top7);
      onWall(Ww, 16.95, lbox(1.0, 2.3, 0.06, 0, 3.0 + 1.15, 0.03), 'oak');
      for (const y of [3.5, 4.6]) onWall(Ww, 16.95, lbox(0.8, 0.5, 0.03, 0, y, 0.075), 'darkoak');
      for (const sx of [-1, 1]) onWall(Ww, 16.95, lbox(0.14, 2.45, 0.1, sx * 0.57, 3.0 + 1.225, 0.05), 'darkoak');
      onWall(Ww, 16.95, lbox(1.28, 0.16, 0.1, 0, 5.53, 0.05), 'darkoak');
      onWall(Ww, 16.95, new THREE.SphereGeometry(0.035, 8, 6).translate(0.35, 4.1, 0.1), 'gold');
      solid.push({ x0: sx0, x1: sx1 + 0.05, z0: z0 - 0.2, z1: 17.75 });
      // a console table under the east window, with a pair of candlesticks
      {
        const x = 4.3, z = 17.4;
        box('oak', 1.4, 0.05, 0.5, x, 0.82, z);
        box('darkoak', 1.3, 0.12, 0.42, x, 0.74, z);
        for (const [dx, dz] of [[-0.6, -0.17], [0.6, -0.17], [-0.6, 0.17], [0.6, 0.17]]) add(CastleProps.turnedLeg(0.68, 0.03), 'darkoak', x + dx, 0, z + dz);
        for (const dx of [-0.4, 0.4]) {
          add(CastleProps.lathe([[0.07, 0], [0.03, 0.04], [0.02, 0.3], [0.04, 0.32], [0, 0.33]], 12), 'silver', x + dx, 0.845, z);
          candle(x + dx, 1.17, z, 0.22, 0.024);
        }
        add(CastleProps.lathe([[0.06, 0], [0.12, 0.08], [0.13, 0.2], [0.07, 0.34], [0.09, 0.4], [0, 0.4]], 16), 'china', x, 0.845, z - 0.02);
        solid.push({ x0: x - 0.72, x1: x + 0.72, z0: z - 0.3, z1: 17.75 });
      }
      chandelier(0, 6.2, 11, 1.6, 12, hall.h);
      chandelier(0, 6.6, 6.2, 0.9, 8, hall.h);
    }

    /* The great hall: breakfast. Panelled, tall windows down the west
       side onto the loch, a fire between them, and the long table under
       two chandeliers. */
    {
      const great = L.byId('great'), Ww = walls.great.w, We = walls.great.e, Wn = walls.great.n, Ws = walls.great.s;
      fireplace(Ww, 9.0, { w: 3.8, overmantel: 'stag' });
      sconce(Ww, 3.0, 2.6, 0); sconce(Ww, 15.0, 2.6, 0);
      // behind Claudia: a great portrait over a sideboard, banners either side
      sideboard(Wn, -16, 3.0, 0.09);
      solid.push({ x0: -17.6, x1: -14.4, z0: great.z0, z1: great.z0 + 0.95 });
      portrait(Wn, -16, 3.9, 1.6, 2.1, 0, 0);
      banner(Wn, -17.6, 7.3, 0.8, 2.6, 'tartanRed');
      banner(Wn, -14.4, 7.3, 0.8, 2.6, 'tartanRed');
      // the east wall: portraits, a sideboard of silver, stag heads
      for (const [z, t] of [[1.6, 1], [5.4, 3], [14.2, 4]]) portrait(We, z, 3.5, 1.1, 1.45, t, 0);
      sideboard(We, 17.0, 2.6, 0.09);
      solid.push({ x0: great.x1 - 0.95, x1: great.x1, z0: 15.6, z1: 18.4 });
      portrait(We, 17.0, 3.4, 2.0, 1.3, 6, 0.0);
      for (const z of [3.5, 15.8]) stagHead(We, z, 5.6, 0);
      sconce(We, 7.6, 2.6, 0); sconce(We, 13.0, 2.6, 0); sconce(We, 0.0, 2.6, 0);
      // the south wall: a landscape and a dresser
      portrait(Ws, -16, 3.6, 2.4, 1.6, 7, 0);
      sconce(Ws, -17.9, 2.6, 0); sconce(Ws, -14.1, 2.6, 0);
      rug('tartanHunt', -16, 7.85, 4.6, 9.8);
      chandelier(-16, 5.6, 3.6, 1.35, 10, great.h);
      chandelier(-16, 5.6, 12.0, 1.35, 10, great.h);
    }

    /* The round table chamber, under its vault. Panelled low, stone
       above, six tall windows round the north side where the hills are,
       stag heads and portraits on the south side, a circle of tartan
       under the table, and tall church candles on iron stands. */
    {
      const round = L.byId('round'), W = walls.round.circle;
      add(new THREE.CylinderGeometry(4.3, 4.3, 0.02, 72), 'tartanRed', round.cx, 0.01, round.cz);
      add(new THREE.TorusGeometry(4.3, 0.03, 4, 72).rotateX(P / 2), 'gold', round.cx, 0.02, round.cz);
      const wallAt = (a) => W.norm(a);
      for (const a of [-3 * P / 4, -P / 4]) stagHead(W, wallAt(a), 5.6, 0, 1.15);
      for (const a of [-3 * P / 4, -P / 4, -P / 16, -15 * P / 16]) sconce(W, wallAt(a), 2.8, 0);
      // the south side, round the door
      portrait(W, wallAt(P / 5), 4.0, 1.3, 1.75, 0, 0);
      portrait(W, wallAt(4 * P / 5), 4.0, 1.3, 1.75, 1, 0);
      stagHead(W, wallAt(P / 5), 6.6, 0, 1.0);
      stagHead(W, wallAt(4 * P / 5), 6.6, 0, 1.0);
      banner(W, wallAt(0.38 * P), 8.4, 1.0, 3.6, 'tartanRed');
      banner(W, wallAt(0.62 * P), 8.4, 1.0, 3.6, 'tartanRed');
      for (const a of [P / 10, 0.3 * P, 0.7 * P, 0.9 * P]) sconce(W, wallAt(a), 2.8, 0);
      // the candles, on tall stands round the room
      for (const a of [-3 * P / 4, -P / 4, P / 12, P / 3.2, P - P / 3.2, P - P / 12, -15 * P / 16, -P / 16]) {
        const rr = round.r - 1.05;
        const x = round.cx + Math.cos(a) * rr, z = round.cz + Math.sin(a) * rr;
        candleStand(x, z, 0, 1.5);
        solid.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 });
      }
      chandelier(0, 6.4, -6, 2.0, 16, round._crown);
      chandelier(0, 7.4, -6, 1.0, 8, round._crown);
    }

    /* The turret: where the Traitors meet. Bare stone, lancet windows,
       black cloaks on pegs either side of the door, iron stands of
       candles, red velvet. */
    {
      const turret = L.byId('turret'), W = walls.turret.circle, ty = turret.y;
      const at = (a) => W.norm(a);
      for (const [a0, a1] of [[0.45, 1.22], [1.92, 2.69]]) {
        W.band('darkoak', at(a0), at(a0) + (a1 - a0), 2.0, 2.1, 0, 0.05);
        for (let k = 0; k < 3; k++) {
          const a = at(a0 + (k + 0.5) / 3 * (a1 - a0));
          onWall(W, a, CastleProps.stick(V(0, 2.04, 0.05), V(0, 2.1, 0.2), 0.015), 'iron');
          onWall(W, a, new THREE.ConeGeometry(0.32, 1.48, 12, 1, true).scale(1, 1, 0.55).translate(0, 2.05 - 0.74, 0.24), 'cloak');
          onWall(W, a, new THREE.SphereGeometry(0.17, 12, 9).scale(1, 1.15, 0.9).translate(0, 1.98, 0.24), 'cloak');
        }
      }
      for (const a of [-P / 2 - 0.55, -P / 2 + 0.55]) banner(W, at(a), 5.4, 0.75, 2.2, 'velvet');
      for (const a of [-P / 2 - 0.55, -P / 2 + 0.55, 3.27, -0.1]) {
        const rr = turret.r - 0.95;
        const x = turret.cx + Math.cos(a) * rr, z = turret.cz + Math.sin(a) * rr;
        candleStand(x, z, ty, 1.3);
        solid.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 });
      }
      add(new THREE.CylinderGeometry(2.2, 2.2, 0.02, 48), 'velvet', turret.cx, ty + 0.01, turret.cz);
      chandelier(turret.cx, ty + 4.4, turret.cz, 0.8, 8, turret._crown);
    }

    /* The stair up: two sconces on its walls. */
    {
      const Ws = walls.stair;
      if (Ws.e) sconce(Ws.e, -15.0, 3.2, 0);
      if (Ws.w) sconce(Ws.w, -16.4, 4.2, 0);
      for (const id of ['north-passage', 'west-passage', 'west-link', 'east-link']) {
        const ws = walls[id];
        for (const k in ws) {
          const W = ws[k];
          sconce(W, (W.in0 + W.in1) / 2, 2.7, 0);
        }
      }
    }

    /* The bedroom corridor: a red damask passage, portraits between the
       doors, a tartan runner and a window at the end. */
    {
      const corridor = L.byId('corridor'), Wn = walls.corridor.n, Ws = walls.corridor.s;
      rug('tartanGreen', 18.5, 13.5, 21.6, 1.3);
      [12, 16, 20].forEach((x, i) => {
        portrait(Wn, x, 2.3, 0.75, 0.95, i, 0.02);
        portrait(Ws, x, 2.3, 0.75, 0.95, 3 + i, 0.02);
      });
      for (const x of [8.1, 24.0, 28.8]) { sconce(Wn, x, 2.4, 0.02); sconce(Ws, x, 2.4, 0.02); }
      void corridor;
    }

    /* The bedrooms: a four-poster in tartan against the outside wall, a
       candle by it, a wardrobe, a rug, a window onto the dark. */
    for (let k = 0; k < 8; k++) {
      const r = L.byId('bed' + k), north = k < 4, ws = walls['bed' + k];
      const cx = (r.x0 + r.x1) / 2;
      const wallZ = north ? r.z0 + T / 2 : r.z1 - T / 2, dir = north ? 1 : -1;
      const bx = r.x0 + T / 2 + 0.95, len = 2.15, bw = 1.55;
      const bz = wallZ + dir * len / 2;
      box('darkoak', bw, 0.3, len, bx, 0.25, bz);
      box('linen', bw - 0.1, 0.22, len - 0.12, bx, 0.51, bz + dir * 0.04);
      box('tartanGreen', bw + 0.04, 0.1, len * 0.62, bx, 0.6, bz + dir * len * 0.2);
      for (const sx of [-0.35, 0.35]) box('linen', 0.6, 0.14, 0.36, bx + sx, 0.69, wallZ + dir * 0.32);
      box('darkoak', bw + 0.1, 1.25, 0.08, bx, 0.62, wallZ + dir * 0.04);
      for (const [px, pz] of [[-1, 0.06], [1, 0.06], [-1, len - 0.04], [1, len - 0.04]]) {
        add(CastleProps.turnedLeg(2.25, 0.04), 'darkoak', bx + px * (bw / 2 + 0.02), 0, wallZ + dir * pz);
      }
      box('darkoak', bw + 0.14, 0.1, len + 0.04, bx, 2.3, bz);
      for (const sx of [-1, 1]) box('tartanGreen', 0.025, 0.32, len, bx + sx * (bw / 2 + 0.08), 2.12, bz);
      box('tartanGreen', bw + 0.18, 0.32, 0.025, bx, 2.12, wallZ + dir * (len + 0.06));
      // bedside table and its candle, under the window
      const tx = bx + bw / 2 + 0.45, tz = wallZ + dir * 0.3;
      box('oak', 0.5, 0.04, 0.42, tx, 0.62, tz);
      box('darkoak', 0.44, 0.5, 0.38, tx, 0.35, tz);
      box('darkoak', 0.46, 0.1, 0.4, tx, 0.05, tz);
      add(CastleProps.lathe([[0.06, 0], [0.025, 0.03], [0.02, 0.1], [0.035, 0.11], [0, 0.12]], 10), 'silver', tx, 0.64, tz);
      candle(tx, 0.76, tz, 0.16, 0.022);
      // a wardrobe on the far side wall
      const wx = r.x1 - T / 2 - 0.32, wz = north ? r.z1 - T / 2 - 1.4 : r.z0 + T / 2 + 1.4;
      box('darkoak', 0.6, 2.1, 1.2, wx, 1.05, wz);
      box('oak', 0.03, 1.7, 0.5, wx - 0.31, 1.1, wz - 0.28);
      box('oak', 0.03, 1.7, 0.5, wx - 0.31, 1.1, wz + 0.28);
      box('darkoak', 0.68, 0.1, 1.3, wx + 0.02, 2.15, wz);
      rug('tartanRed', bx + 1.25, bz + dir * 0.3, 1.0, 1.6);
      const Wside = ws.w, Wout = north ? ws.n : ws.s;
      if (Wside) portrait(Wside, north ? r.z0 + 2.8 : r.z1 - 2.8, 2.0, 0.6, 0.78, k % 6, 0.02);
      if (Wside) sconce(Wside, wallZ + dir * 1.15, 1.75, 0.02);
      void Wout;
      solid.push({ x0: bx - bw / 2 - 0.1, x1: bx + bw / 2 + 0.1, z0: Math.min(wallZ, wallZ + dir * len), z1: Math.max(wallZ, wallZ + dir * len) });
      solid.push({ x0: wx - 0.35, x1: wx + 0.35, z0: wz - 0.65, z1: wz + 0.65 });
    }

    /* ---------------- the wings ---------------- */

    // a thing against a wall, as a box in the walking: `w` along it, from `d0` out to `depth`
    function wallSolid(W, s, w, depth, d0 = 0) {
      const cs = [[-w / 2, d0], [w / 2, d0], [-w / 2, depth], [w / 2, depth]].map(([lx, lz]) => wallPoint(W, s, lx, lz));
      solid.push({ x0: Math.min(...cs.map(p => p.x)), x1: Math.max(...cs.map(p => p.x)),
                   z0: Math.min(...cs.map(p => p.z)), z1: Math.max(...cs.map(p => p.z)) });
    }
    // a piece built round its own origin, facing -z, stood at x,z and turned
    function piece(parts, x, z, ry = 0, fy = 0) {
      for (const [id, g] of parts) add(g, id, x, fy, z, ry);
    }
    function seat(x, z, ry, cloth = 'velvet', arms = false) {
      const g = CastleProps.chair({ arms });
      piece([['darkoak', g.wood.clone()], [cloth, g.cloth.clone()], ['gold', g.brass.clone()]], x, z, ry);
    }
    /* Furniture stands off the panelling by more than the rail, so its
       back never shares a plane with anything on the wall. */
    const OFF = 0.1;

    const BINDINGS = ['bookRed', 'bookGreen', 'bookBlue', 'bookBrown', 'bookTan', 'bookBlack'];
    function bookcase(W, s, len, h = 3.0, seed = 1) {
      const rng = U.makeRng(seed);
      const dep = 0.4;
      onWall(W, s, lbox(len, h, 0.03, 0, h / 2, OFF + 0.015), 'darkoak');
      for (const sx of [-1, 1]) onWall(W, s, lbox(0.05, h, dep, sx * (len / 2 - 0.025), h / 2, OFF + dep / 2), 'darkoak');
      onWall(W, s, lbox(len + 0.1, 0.1, dep + 0.06, 0, h + 0.05, OFF + (dep + 0.06) / 2), 'darkoak');
      onWall(W, s, lbox(len - 0.11, 0.12, dep - 0.03, 0, 0.06, OFF + 0.03 + (dep - 0.03) / 2), 'darkoak');
      const shelves = Math.floor((h - 0.2) / 0.38);
      for (let i = 0; i < shelves; i++) {
        const y = 0.1075 + i * 0.38;
        if (i) onWall(W, s, lbox(len - 0.11, 0.025, dep - 0.04, 0, y, OFF + 0.03 + (dep - 0.04) / 2), 'oak');
        // runs of books in one binding, short of the shelf above, with gaps
        let x = -len / 2 + 0.07;
        while (x < len / 2 - 0.12) {
          const w = Math.min(0.12 + rng() * 0.3, len / 2 - 0.07 - x);
          const bh = 0.22 + rng() * 0.1;
          if (rng() > 0.08) {
            onWall(W, s, lbox(w - 0.012, bh, dep - 0.14, x + w / 2, y + 0.0125 + bh / 2, OFF + 0.05 + (dep - 0.14) / 2),
                   BINDINGS[Math.floor(rng() * BINDINGS.length)]);
          }
          x += w;
        }
      }
      wallSolid(W, s, len + 0.1, OFF + dep + 0.06);
    }

    function table(x, z, w, d, h = 0.76, top = 'oak') {
      box(top, w, 0.05, d, x, h - 0.025, z);
      box('darkoak', w - 0.12, 0.1, d - 0.12, x, h - 0.1, z);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        add(CastleProps.turnedLeg(h - 0.05, 0.035), 'darkoak', x + sx * (w / 2 - 0.1), 0, z + sz * (d / 2 - 0.1));
      }
    }
    // a table and the chairs round it, as one thing to walk round
    function tableSet(x, z, w, d, along, cloth) {
      table(x, z, w, d);
      const n = Math.max(1, Math.floor((along ? w : d) / 0.75));
      for (let i = 0; i < n; i++) {
        const t = -((along ? w : d) / 2) + ((along ? w : d) / n) * (i + 0.5);
        for (const side of [-1, 1]) {
          if (along) seat(x + t, z + side * (d / 2 + 0.3), side > 0 ? 0 : Math.PI, cloth);
          else seat(x + side * (w / 2 + 0.3), z + t, side > 0 ? Math.PI / 2 : -Math.PI / 2, cloth);
        }
      }
      const px = along ? 0.1 : 0.62, pz = along ? 0.62 : 0.1;
      solid.push({ x0: x - w / 2 - px, x1: x + w / 2 + px, z0: z - d / 2 - pz, z1: z + d / 2 + pz });
    }

    function readingLamp(x, y, z) {
      add(CastleProps.lathe([[0.07, 0], [0.06, 0.02], [0.012, 0.05], [0.012, 0.36], [0.03, 0.38], [0, 0.39]], 10), 'gold', x, y, z);
      add(new THREE.ConeGeometry(0.16, 0.14, 14, 1, true), 'green', x, y + 0.42, z);
      glow(new THREE.SphereGeometry(0.035, 8, 6), '#ffe0a0', x, y + 0.38, z);
    }

    function globe(x, z) {
      add(CastleProps.lathe([[0.22, 0], [0.2, 0.04], [0.05, 0.08], [0.04, 0.55], [0.08, 0.6], [0, 0.62]], 12), 'darkoak', x, 0, z);
      sph('parchment', 0.3, x, 0.95, z, 1, 1, 1, 18);
      add(new THREE.TorusGeometry(0.33, 0.015, 6, 28).rotateY(0.4).rotateZ(0.41), 'gold', x, 0.95, z);
      solid.push({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 });
    }

    function pew(x, z, len) {
      box('oak', len, 0.06, 0.44, x, 0.45, z);
      box('darkoak', len, 0.62, 0.05, x, 0.82, z + 0.22);
      box('darkoak', len, 0.05, 0.08, x, 1.15, z + 0.23);
      box('darkoak', len, 0.05, 0.05, x, 0.12, z - 0.12);
      for (const sx of [-1, 1]) box('darkoak', 0.07, 1.0, 0.52, x + sx * (len / 2 + 0.035), 0.5, z + 0.03);
    }

    // built facing -z, its back to +z
    function sofa(x, z, len, ry, cloth = 'velvet') {
      piece([
        [cloth, lbox(len, 0.35, 0.86, 0, 0.265, 0)],
        [cloth, lbox(len - 0.06, 0.12, 0.62, 0, 0.5, -0.1)],
        [cloth, lbox(len, 0.52, 0.2, 0, 0.66, 0.33)],
        [cloth, lbox(0.16, 0.26, 0.86, -(len / 2 + 0.08), 0.57, 0)],
        [cloth, lbox(0.16, 0.26, 0.86, len / 2 + 0.08, 0.57, 0)],
        ['darkoak', lbox(len + 0.36, 0.08, 0.9, 0, 0.04, 0)],
      ], x, z, ry);
    }

    /* A pot of `r` and `h`, thrown in terracotta, its rim turned over
       and its earth a hand below the rim. */
    function pot(x, z, r, h) {
      add(CastleProps.lathe([[r * 0.72, 0], [r * 0.78, 0.02], [r, h * 0.84], [r * 1.07, h * 0.86], [r * 1.1, h],
                             [r * 0.98, h], [r * 0.95, h - 0.05]], 20), 'terracotta', x, 0, z);
      add(new THREE.CircleGeometry(r * 0.955, 20).rotateX(-Math.PI / 2), 'soil', x, h - 0.05, z);
      return h - 0.05;
    }

    /* A palm in a pot: a ringed trunk leaning a little, a crown of long
       drooping fronds, and two young ones still standing up. */
    function palm(x, z, seed = 1) {
      const rng = U.makeRng(seed);
      const earth = pot(x, z, 0.34, 0.56);
      const h = 2.0 + rng() * 0.6, lean = (rng() - 0.5) * 0.3, leanZ = (rng() - 0.5) * 0.3;
      const prof = [];
      const n = Math.round((h - earth) / 0.09);
      for (let k = 0; k <= n; k++) prof.push([0.095 - k * 0.0018 + (k % 2 ? 0.014 : 0), k * (h - earth) / n]);
      prof.push([0, h - earth]);
      const trunk = CastleProps.lathe(prof, 10);
      const tp = trunk.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const t = tp.getY(i) / (h - earth);
        tp.setX(i, tp.getX(i) + lean * t * t); tp.setZ(i, tp.getZ(i) + leanZ * t * t);
      }
      trunk.computeVertexNormals();
      add(trunk, 'log', x, earth, z);
      const tx = x + lean, tz = z + leanZ;
      const N = 11;
      for (let i = 0; i < N; i++) {
        const yaw = i / N * TAU + rng() * 0.4, len = 1.4 + rng() * 0.6;
        add(CastleSurfaces.frond(len, 0.62, 0.2 + rng() * 0.55, 0.55 + rng() * 0.45, yaw, 10), 'frond', tx, h - 0.04, tz);
      }
      for (let i = 0; i < 3; i++) {
        add(CastleSurfaces.frond(0.9 + rng() * 0.3, 0.42, 1.15 + rng() * 0.2, 0.12, rng() * TAU, 6), 'frond', tx, h - 0.06, tz);
      }
      solid.push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4 });
    }

    /* A clump of fern: fronds arching out of one crown. */
    function fern(x, y, z, size, rng) {
      const n = 7 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        add(CastleSurfaces.frond(size * (0.7 + rng() * 0.45), size * 0.42, 0.45 + rng() * 0.7, size * 0.35, i / n * TAU + rng() * 0.5, 6),
            'fern', x, y, z);
      }
    }
    // broad leaves or a geranium, as crossed cards standing in the earth
    function clump(id, x, y, z, w, h, rng) {
      const yaw = rng() * Math.PI;
      for (let k = 0; k < 3; k++) add(CastleSurfaces.card(w, h, yaw + k * Math.PI / 3, (rng() - 0.5) * 0.25), id, x, y, z);
    }

    /* A long planter: terracotta with a rolled rim, earth, and a row of
       ferns, broad-leaved things and geraniums in flower. */
    function trough(x0, x1, z0, z1, seed) {
      const rng = U.makeRng(seed);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
      box('terracotta', w, 0.5, d, cx, 0.25, cz);
      for (const sx of [-1, 1]) {
        box('terracotta', 0.06, 0.06, d + 0.04, cx + sx * (w / 2 - 0.01), 0.53, cz);
        box('terracotta', w - 0.08, 0.06, 0.06, cx, 0.53, cz + sx * (d / 2 - 0.01));
      }
      box('soil', w - 0.08, 0.02, d - 0.08, cx, 0.51, cz);
      const len = Math.max(w, d), along = w > d;
      let k = 0;
      for (let t = 0.3; t < len - 0.2; t += 0.5 + rng() * 0.15, k++) {
        const px = along ? x0 + t : cx + (rng() - 0.5) * 0.1, pz = along ? cz + (rng() - 0.5) * 0.1 : z0 + t;
        const what = k % 3;
        if (what === 0) fern(px, 0.52, pz, 0.85 + rng() * 0.3, rng);
        else if (what === 1) clump('broadleaf', px, 0.5, pz, 0.75 + rng() * 0.2, 0.75 + rng() * 0.25, rng);
        else clump('flowers', px, 0.5, pz, 0.6, 0.55 + rng() * 0.1, rng);
      }
      solid.push({ x0, x1, z0, z1 });
    }

    // a fern in a pot, for a corner or either side of a door
    function pottedFern(x, z, seed) {
      const rng = U.makeRng(seed);
      const earth = pot(x, z, 0.26, 0.5);
      fern(x, earth, z, 0.95, rng);
      solid.push({ x0: x - 0.32, x1: x + 0.32, z0: z - 0.32, z1: z + 0.32 });
    }

    /* ---- the library: books from the floor to the picture rail, two
       reading tables under green lamps, a globe, a ladder ---- */
    {
      const lib = L.byId('library'), w = walls.library;
      [[w.n, -27.95, 3.3], [w.n, -20.9, 5.6], [w.n, -14.75, 1.5], [w.s, -22.1, 2.2], [w.s, -16, 5.0],
       [w.e, -8.35, 1.7], [w.e, -3.65, 1.7], [w.w, -7.8, 1.5], [w.w, -3.6, 1.6]]
        .forEach(([W, s, len], i) => bookcase(W, s, len, 3.2, 40 + i));
      // the ladder, leaning on the long case
      for (const dx of [-0.22, 0.22]) add(CastleProps.stick(V(-21.8 + dx, 0, -8.15), V(-21.8 + dx, 3.25, -8.72), 0.025), 'oak');
      for (let k = 1; k < 10; k++) {
        const t = k / 10;
        add(CastleProps.stick(V(-22.02, 3.25 * t, -8.15 - 0.57 * t), V(-21.58, 3.25 * t, -8.15 - 0.57 * t), 0.014), 'oak');
      }
      for (const x of [-25, -15.5]) {
        tableSet(x, -5.75, 2.2, 1.1, true, 'leather');
        readingLamp(x - 0.6, 0.76, -5.75);
        for (const [dx, k] of [[0.2, 0], [0.5, 1]]) box(k ? 'velvet' : 'ink', 0.24, 0.05, 0.32, x + dx, 0.785 + k * 0.05, -5.7);
      }
      rug('tartanHunt', -20, -5.75, 15, 3.4);
      globe(-11.3, -8.4);
      sconce(w.s, -25.75, 2.6, 0.02);
      chandelier(-25, 4.2, -5.75, 0.8, 8, lib.h);
      chandelier(-15.5, 4.2, -5.75, 0.8, 8, lib.h);
    }

    /* ---- the chapel: pews either side of an aisle, an altar under the
       east-facing lancet, candles ---- */
    {
      const ch = L.byId('chapel'), w = walls.chapel;
      box('dressed', 4.0, 0.18, 1.65, -25, 0.09, -20.42);
      box('dressed', 2.0, 0.95, 0.9, -25, 0.18 + 0.475, -20.6);
      box('linen', 2.1, 0.02, 1.0, -25, 1.14, -20.6);
      box('velvet', 0.7, 0.6, 0.012, -25, 0.8, -20.149);
      box('gold', 0.06, 0.62, 0.06, -25, 1.46, -20.7);
      box('gold', 0.34, 0.06, 0.06, -25, 1.6, -20.7);
      for (const dx of [-0.7, 0.7]) {
        add(CastleProps.lathe([[0.07, 0], [0.03, 0.04], [0.02, 0.32], [0.05, 0.34], [0, 0.35]], 12), 'gold', -25 + dx, 1.15, -20.75);
        candle(-25 + dx, 1.5, -20.75, 0.32, 0.035);
      }
      for (const x of [-27.6, -22.4]) candleStand(x, -20.1, 0, 1.6);
      solid.push({ x0: -27.9, x1: -22.1, z0: ch.z0, z1: -19.55 });
      for (const z of [-18.2, -16.9, -15.6, -14.3, -13.0, -11.7]) {
        pew(-27.8, z, 3.2); pew(-22.2, z, 3.2);
      }
      solid.push({ x0: -29.5, x1: -26.1, z0: -18.5, z1: -11.4 }, { x0: -23.9, x1: -20.5, z0: -18.5, z1: -11.4 });
      box('velvet', 1.3, 0.02, 9.0, -25, 0.01, -15.05);
      // the bell rope, out of the roof by the door
      add(CastleProps.stick(V(-29, 1.0, -10.4), V(-29, ch.h, -10.4), 0.02), 'linen');
      add(CastleProps.stick(V(-29, 1.3, -10.4), V(-29, 1.7, -10.4), 0.045), 'velvet');
      for (const s of [-17.5, -14.5]) sconce(w.e, s, 2.4, 0);
      sconce(w.w, -17.5, 2.4, 0);
      chandelier(-25, 5.6, -15.5, 1.0, 10, ch.h);
    }

    /* ---- the kitchen: a roasting hearth, a long scrubbed table, copper
       on a rack over it, a dresser of plates, the wine rack ---- */
    {
      const k = L.byId('kitchen'), w = walls.kitchen;
      fireplace(w.w, -5.75, { w: 3.2 });
      onWall(w.w, -5.75, new THREE.CylinderGeometry(0.018, 0.018, 2.0, 6).rotateZ(Math.PI / 2).translate(0, 0.95, 0.45), 'iron');
      table(-36, -5.75, 1.2, 5.0, 0.8, 'boards');
      for (const sx of [-1, 1]) {
        box('oak', 0.32, 0.05, 4.6, -36 + sx * 0.95, 0.45, -5.75);
        for (const dz of [-2.0, 2.0]) box('darkoak', 0.26, 0.42, 0.06, -36 + sx * 0.95, 0.21, -5.75 + dz);
      }
      solid.push({ x0: -37.3, x1: -34.7, z0: -8.35, z1: -3.15 });
      // the pan rack, on chains from the ceiling
      box('iron', 0.05, 0.05, 4.0, -36, 2.7, -5.75);
      for (const dz of [-1.9, 1.9]) add(CastleProps.stick(V(-36, 2.7, -5.75 + dz), V(-36, k.h, -5.75 + dz), 0.012), 'iron');
      for (let i = 0; i < 7; i++) {
        const z = -5.75 - 1.65 + i * 0.55, r = 0.12 + (i % 3) * 0.03;
        add(CastleProps.stick(V(-36, 2.42, z), V(-36, 2.7, z), 0.008), 'iron');
        cyl('copper', r, r * 0.9, 0.12 + (i % 2) * 0.06, 16, -36, 2.3, z);
      }
      // the dresser: a sideboard with plates racked above it
      sideboard(w.e, -11.2, 2.6, OFF, false);
      onWall(w.e, -11.2, lbox(2.5, 1.5, 0.03, 0, 1.75, OFF + 0.015), 'oak');
      for (const y of [1.45, 1.95, 2.45]) {
        onWall(w.e, -11.2, lbox(2.46, 0.03, 0.22, 0, y, OFF + 0.11), 'darkoak');
        for (let i = 0; i < 9; i++) {
          onWall(w.e, -11.2, new THREE.CylinderGeometry(0.11, 0.11, 0.015, 18).rotateX(Math.PI / 2 - 0.2)
            .translate(-1.08 + i * 0.27, y + 0.125, OFF + 0.08), i % 3 === 1 ? 'copper' : 'china');
        }
      }
      wallSolid(w.e, -11.2, 2.7, OFF + 0.62);
      // the wine rack: a lattice of bottle ends
      onWall(w.e, -0.4, lbox(1.8, 1.9, 0.04, 0, 0.95, OFF + 0.02), 'darkoak');
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 7; j++) {
          onWall(w.e, -0.4, new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8).rotateX(Math.PI / 2)
            .translate(-0.75 + i * 0.3, 0.2 + j * 0.25, OFF + 0.2), (i + j) % 4 ? 'green' : 'lacquer');
        }
      }
      for (const sx of [-1, 1]) onWall(w.e, -0.4, lbox(0.05, 1.9, 0.36, sx * 0.9, 0.95, OFF + 0.18), 'darkoak');
      wallSolid(w.e, -0.4, 1.9, OFF + 0.4);
      // the larder, a painted door in the north wall
      onWall(w.n, -32.6, lbox(1.2, 2.25, 0.04, 0, 1.125, 0.03), 'darkoak');
      onWall(w.n, -32.6, lbox(1.0, 2.1, 0.04, 0, 1.05, 0.05), 'oak');
      onWall(w.n, -32.6, lbox(0.2, 0.03, 0.03, 0.3, 1.05, 0.085), 'iron');
      chandelier(-36, 3.6, -1.0, 0.7, 6, k.h);
      for (const z of [-7.5, -4.0]) candle(-36, 0.8, z, 0.2, 0.03);
    }

    /* ---- the scullery: a stone sink under the window, a pump, the
       boiler and its pipes ---- */
    {
      const sc = L.byId('scullery'), w = walls.scullery;
      onWall(w.w, -18.25, lbox(1.8, 0.85, 0.65, 0, 0.425, OFF + 0.325), 'dressed');
      onWall(w.w, -18.25, lbox(1.6, 0.02, 0.5, 0, 0.8, OFF + 0.33), 'water');
      onWall(w.w, -18.25, CastleProps.stick(V(0.6, 0.85, OFF + 0.2), V(0.6, 1.6, OFF + 0.2), 0.04), 'iron');
      onWall(w.w, -18.25, CastleProps.stick(V(0.6, 1.5, OFF + 0.2), V(0.6, 1.62, OFF + 0.55), 0.025), 'iron');
      onWall(w.w, -18.25, CastleProps.stick(V(0.6, 1.6, OFF + 0.2), V(0.95, 1.85, OFF + 0.2), 0.015), 'iron');
      wallSolid(w.w, -18.25, 1.9, OFF + 0.7);
      // the copper, and its pipes up the wall and along under the ceiling
      cyl('copper', 0.42, 0.45, 1.3, 20, -36.2, 0.65, -21.0);
      sph('copper', 0.42, -36.2, 1.3, -21.0, 1, 0.4, 1, 16);
      solid.push({ x0: -36.7, x1: -35.7, z0: -21.75, z1: -20.5 });
      for (const x of [-41.0, -39.6, -38.2]) {
        add(CastleProps.stick(V(x, 0, -21.62), V(x, 3.3, -21.62), 0.045, 0.045, 10), 'copper');
        sph('copper', 0.06, x, 3.3, -21.62, 1, 1, 1, 8);
      }
      add(CastleProps.stick(V(-41.0, 3.3, -21.62), V(-36.2, 3.3, -21.62), 0.045, 0.045, 10), 'copper');
      add(CastleProps.stick(V(-36.2, 1.45, -21.0), V(-36.2, 3.3, -21.62), 0.04, 0.04, 10), 'copper');
      for (const x of [-40.3, -38.9]) {
        add(new THREE.TorusGeometry(0.06, 0.018, 6, 12).rotateX(Math.PI / 2), 'iron', x + 0.7, 1.4, -21.62);
      }
      // a shelf of crocks
      onWall(w.e, -18, lbox(2.0, 0.04, 0.32, 0, 1.6, OFF + 0.16), 'oak');
      for (let i = 0; i < 6; i++) {
        onWall(w.e, -18, CastleProps.lathe([[0.09, 0], [0.12, 0.08], [0.1, 0.22], [0.06, 0.26], [0, 0.26]], 10)
          .translate(-0.8 + i * 0.32, 1.62, OFF + 0.16), i % 2 ? 'terracotta' : 'china');
      }
      chandelier(-38, 2.9, -18, 0.5, 6, sc.h);
    }

    /* ---- the long gallery: portraits of the family down one side,
       windows onto the courtyard the other, velvet benches, armour at
       the end ---- */
    {
      const g = L.byId('gallery'), w = walls.gallery;
      [[18.0, 1.2, 1.6, 2], [25.6, 1.0, 1.3, 4], [27.6, 1.0, 1.3, 4], [30.6, 1.2, 1.6, 0], [37.4, 1.2, 1.6, 5]]
        .forEach(([x, pw, ph, t]) => portrait(w.n, x, 2.65, pw, ph, t, 0.02));
      for (const x of [20.75, 25.25]) portrait(w.s, x, 2.6, 0.62, 0.82, 1, 0.02);
      for (const x of [31.2, 33.4]) {
        box('velvet', 1.3, 0.14, 0.48, x, 0.46, g.z1 - T / 2 - OFF - 0.3);
        box('darkoak', 1.36, 0.06, 0.5, x, 0.36, g.z1 - T / 2 - OFF - 0.3);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          add(CastleProps.turnedLeg(0.34, 0.025), 'darkoak', x + sx * 0.6, 0, g.z1 - T / 2 - OFF - 0.3 + sz * 0.19);
        }
        solid.push({ x0: x - 0.7, x1: x + 0.7, z0: g.z1 - T / 2 - OFF - 0.6, z1: g.z1 });
      }
      for (const z of [-7.25, -2.75]) armour(39.15, z, -Math.PI / 2);
      rug('tartanRed', 28, -5, 22, 1.5);
      for (const x of [19.9, 24.2, 32.0]) sconce(w.n, x, 2.5, 0.02);
      for (const x of [20, 28, 36]) chandelier(x, 3.8, -5, 0.75, 8, g.h);
    }

    /* ---- the billiard room: the table under its three lamps, the cue
       rack, a fire and two leather chairs by it ---- */
    {
      const b = L.byId('billiard'), w = walls.billiard;
      const tx = 22, tz = -13.2, tw = 3.2, td = 1.7, th = 0.8;
      box('darkoak', tw, 0.22, td, tx, th - 0.13, tz);
      box('baize', tw - 0.2, 0.04, td - 0.2, tx, th, tz);
      for (const sx of [-1, 1]) {
        box('darkoak', tw, 0.09, 0.1, tx, th + 0.025, tz + sx * (td / 2 - 0.05));
        box('darkoak', 0.1, 0.09, td - 0.2, tx + sx * (tw / 2 - 0.05), th + 0.025, tz);
      }
      for (const [px, pz] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) {
        add(CastleProps.turnedLeg(th - 0.24, 0.07), 'darkoak', tx + px * (tw / 2 - 0.15), 0, tz + pz * (td / 2 - 0.15));
        sph('soot', 0.055, tx + px * (tw / 2 - 0.1), th + 0.035, tz + pz * (td / 2 - 0.1), 1, 0.4, 1, 8);
      }
      [[-0.6, 0.1, 'china'], [0.3, -0.25, 'velvet'], [0.9, 0.3, 'china']].forEach(([dx, dz, id]) => sph(id, 0.03, tx + dx, th + 0.05, tz + dz, 1, 1, 1, 10));
      add(CastleProps.stick(V(tx - 1.0, th + 0.07, tz + 0.5), V(tx + 0.4, th + 0.07, tz + 0.2), 0.009), 'oak');
      solid.push({ x0: tx - tw / 2, x1: tx + tw / 2, z0: tz - td / 2, z1: tz + td / 2 });
      box('iron', tw - 0.4, 0.04, 0.04, tx, 2.05, tz);
      for (const dx of [-1.0, 0, 1.0]) {
        add(new THREE.ConeGeometry(0.26, 0.2, 16, 1, true), 'green', tx + dx, 1.95, tz);
        glow(new THREE.SphereGeometry(0.05, 8, 6), '#fff0c8', tx + dx, 1.9, tz);
      }
      for (const dx of [-1.2, 1.2]) add(CastleProps.stick(V(tx + dx, 2.05, tz), V(tx + dx, b.h, tz), 0.01), 'iron');
      // the cue rack, between the west windows
      onWall(w.w, -12.5, lbox(0.9, 0.08, 0.12, 0, 0.35, OFF + 0.06), 'darkoak');
      onWall(w.w, -12.5, lbox(0.9, 0.08, 0.12, 0, 1.55, OFF + 0.06), 'darkoak');
      for (let i = 0; i < 6; i++) onWall(w.w, -12.5, CastleProps.stick(V(-0.36 + i * 0.145, 0.3, OFF + 0.08), V(-0.36 + i * 0.145, 1.6, OFF + 0.08), 0.014, 0.008), 'oak');
      wallSolid(w.w, -12.5, 1.0, OFF + 0.2);
      fireplace(w.e, -13.0, { w: 2.6 });
      seat(26.2, -15.3, -Math.PI / 2, 'leather', true);
      seat(26.2, -10.7, -Math.PI / 2, 'leather', true);
      solid.push({ x0: 25.9, x1: 26.5, z0: -15.6, z1: -15.0 }, { x0: 25.9, x1: 26.5, z0: -11.0, z1: -10.4 });
      // the decanters, on a table by the door
      table(25.4, -8.75 - OFF, 0.8, 0.45, 0.8);
      solid.push({ x0: 25.0, x1: 25.8, z0: -9.3, z1: b.z1 });
      add(CastleProps.lathe([[0.12, 0], [0.12, 0.012], [0, 0.012]], 18), 'silver', 25.4, 0.8, -8.85);
      for (const [dx, dz] of [[-0.06, 0.03], [0.07, -0.03]]) {
        add(CastleProps.lathe([[0.04, 0], [0.05, 0.08], [0.03, 0.16], [0.012, 0.2], [0.02, 0.23], [0, 0.24]], 10), 'glass', 25.4 + dx, 0.812, -8.85 + dz);
        add(CastleProps.lathe([[0.035, 0], [0.045, 0.06], [0.025, 0.1], [0, 0.1]], 10), 'leather', 25.4 + dx, 0.813, -8.85 + dz);
      }
      sconce(w.e, -9.6, 2.3, 0.02); sconce(w.e, -16.4, 2.3, 0.02);
    }

    /* ---- the drawing room: a pair of sofas at the fire, the tea tray
       between them, a grand piano in the corner ---- */
    {
      const dr = L.byId('drawing'), w = walls.drawing;
      fireplace(w.n, 34, { w: 2.6 });
      sofa(32.0, -14.2, 2.0, -Math.PI / 2);
      sofa(36.0, -14.2, 2.0, Math.PI / 2);
      solid.push({ x0: 31.5, x1: 32.5, z0: -15.4, z1: -13.0 }, { x0: 35.5, x1: 36.5, z0: -15.4, z1: -13.0 });
      table(34, -14.2, 1.0, 0.6, 0.45);
      solid.push({ x0: 33.5, x1: 34.5, z0: -14.5, z1: -13.9 });
      add(CastleProps.lathe([[0.22, 0], [0.22, 0.015], [0, 0.015]], 20).scale(1.2, 1, 0.8), 'silver', 34, 0.45, -14.2);
      add(CastleProps.lathe([[0.05, 0], [0.09, 0.05], [0.09, 0.12], [0.05, 0.16], [0.02, 0.17], [0.03, 0.19], [0, 0.2]], 14), 'china', 33.9, 0.465, -14.2);
      for (const [dx, dz] of [[0.12, -0.08], [0.14, 0.09]]) cyl('china', 0.035, 0.028, 0.05, 12, 34 + dx, 0.49, -14.2 + dz);
      rug('tartanHunt', 34, -14.2, 5.2, 3.8);
      // the piano: a curved case on three legs, the keyboard to the room
      const s = new THREE.Shape();
      s.moveTo(-0.72, 0); s.lineTo(0.72, 0); s.lineTo(0.72, 0.85);
      s.bezierCurveTo(0.72, 1.45, 0.25, 1.85, -0.2, 1.85); s.lineTo(-0.72, 1.85); s.lineTo(-0.72, 0);
      const caseG = new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: false, curveSegments: 18 }).rotateX(-Math.PI / 2);
      const px = 30.6, pz = -10.0, pry = Math.PI / 2;
      piece([
        ['lacquer', caseG.translate(0, 0.62, 0)],
        ['china', lbox(1.3, 0.02, 0.16, 0, 0.68, 0.1)],
        ['lacquer', lbox(1.44, 0.1, 0.2, 0, 0.62, 0.1)],
        ['lacquer', lbox(1.44, 0.3, 0.04, 0, 0.92, 0.0)],
      ], px, pz, pry);
      // turned a quarter, the case runs west into the corner and the keys face the room
      for (const [lx, lz] of [[-0.6, -0.15], [0.6, -0.15], [-0.4, -1.6]]) {
        add(CastleProps.turnedLeg(0.62, 0.05), 'lacquer', px + lz, 0, pz - lx);
      }
      solid.push({ x0: px - 1.9, x1: px + 0.25, z0: pz - 0.8, z1: pz + 0.8 });
      sideboard(w.w, -13.0, 2.0, OFF, false);
      wallSolid(w.w, -13.0, 2.1, OFF + 0.62);
      add(CastleProps.lathe([[0.08, 0], [0.13, 0.12], [0.14, 0.24], [0.06, 0.38], [0.08, 0.44], [0, 0.44]], 14), 'china', 28.65, 0.93, -13.0);
      portrait(w.w, -13.0, 2.6, 1.3, 0.9, 7, 0.02);
      sconce(w.e, -10.0, 2.5, 0.02);
      chandelier(34, 3.8, -13, 1.0, 10, dr.h);
    }

    /* ---- the laird's study: his bureau facing the door, books, a
       stag, a globe ---- */
    {
      const st = L.byId('study'), w = walls.study;
      bookcase(w.n, 41.6, 2.4, 3.0, 60);
      bookcase(w.n, 46.4, 2.4, 3.0, 61);
      // the bureau: two pedestals of drawers under a leather top
      box('oak', 0.9, 0.05, 1.7, 45.0, 0.76, -6.0);
      box('leather', 0.6, 0.006, 1.2, 45.0, 0.788, -6.0);
      for (const dz of [-0.6, 0.6]) {
        box('darkoak', 0.8, 0.7, 0.45, 45.0, 0.38, -6.0 + dz);
        for (const y of [0.18, 0.4, 0.62]) sph('gold', 0.018, 44.59, y, -6.0 + dz, 1, 1, 1, 6);
      }
      add(CastleProps.lathe([[0.1, 0], [0.1, 0.03], [0, 0.03]], 12).scale(1.6, 1, 1), 'silver', 44.85, 0.785, -6.45);
      cyl('soot', 0.025, 0.025, 0.05, 8, 44.85, 0.84, -6.4);
      box('linen', 0.3, 0.008, 0.4, 44.8, 0.795, -5.65);
      candle(45.2, 0.785, -6.7, 0.18, 0.026);
      seat(45.85, -6.0, Math.PI / 2, 'leather', true);
      solid.push({ x0: 44.5, x1: 46.2, z0: -6.9, z1: -5.1 });
      globe(41.2, -10.4);
      stagHead(w.e, -6.0, 2.85, 0, 0.9);
      portrait(w.s, 46.4, 2.3, 1.1, 0.8, 6, 0.02);
      rug('tartanGreen', 44, -6, 3.2, 4.4);
      chandelier(44, 3.2, -6, 0.6, 6, st.h);
    }

    /* ---- the gun room: the cabinet, antlers, a map table ---- */
    {
      const gr = L.byId('gun'), w = walls.gun;
      const W = w.e, s = 1.2, len = 2.0, ch = 2.2, dep = 0.45;
      onWall(W, s, lbox(len, ch, 0.03, 0, ch / 2, OFF + 0.015), 'darkoak');
      for (const sx of [-1, 1]) onWall(W, s, lbox(0.06, ch, dep, sx * (len / 2 - 0.03), ch / 2, OFF + dep / 2), 'darkoak');
      onWall(W, s, lbox(len + 0.1, 0.1, dep + 0.05, 0, ch + 0.05, OFF + (dep + 0.05) / 2), 'darkoak');
      onWall(W, s, lbox(len - 0.12, 0.5, dep - 0.02, 0, 0.25, OFF + dep / 2), 'darkoak');
      onWall(W, s, new THREE.PlaneGeometry(len - 0.12, ch - 0.6).translate(0, 0.5 + (ch - 0.6) / 2, OFF + dep - 0.02), 'glass');
      onWall(W, s, lbox(0.04, ch - 0.6, 0.03, 0, 0.5 + (ch - 0.6) / 2, OFF + dep - 0.02), 'darkoak');
      for (let i = 0; i < 7; i++) {
        const x = -0.78 + i * 0.26;
        onWall(W, s, CastleProps.stick(V(x, 0.55, OFF + 0.15), V(x, 1.55, OFF + 0.15), 0.026, 0.02, 6), 'darkoak');
        onWall(W, s, CastleProps.stick(V(x, 1.55, OFF + 0.15), V(x, 2.0, OFF + 0.15), 0.012, 0.012, 6), 'steel');
      }
      wallSolid(W, s, len + 0.1, OFF + dep + 0.05);
      stagHead(w.w, 2.75, 2.7, 0, 0.9);
      stagHead(W, 1.2, 3.25, 0, 0.75);
      tableSet(34.0, 2.6, 0.9, 1.6, false, 'tartanGreen');
      box('parchment', 0.7, 0.006, 1.0, 34.0, 0.763, 2.6);
      rug('tartanRed', 36, 2.5, 2.4, 5.6);
      sconce(w.w, -0.6, 2.3, 0); sconce(w.w, 6.0, 2.3, 0);
      chandelier(36, 3.2, 2.5, 0.6, 6, gr.h);
    }

    /* ---- the conservatory: glass to the roof, palms, troughs of green
       under the windows, a fountain, two iron benches ---- */
    {
      const c = L.byId('conservatory');
      const fx = 36, fz = 13.5;
      // the basin, its rim rolled over and down into the water
      add(CastleProps.lathe([[1.52, 0], [1.5, 0.46], [1.55, 0.5], [1.55, 0.56], [1.42, 0.58], [1.38, 0.52], [1.38, 0.3]], 56),
          'dressed', fx, 0, fz);
      add(new THREE.CircleGeometry(1.39, 56).rotateX(-Math.PI / 2), 'water', fx, 0.43, fz);
      // the pedestal and the bowl it carries, with water standing in it
      add(CastleProps.lathe([[0.3, 0], [0.2, 0.1], [0.12, 0.7], [0.5, 0.85], [0.57, 0.95], [0.5, 0.96], [0.46, 0.9], [0, 0.88]], 28),
          'dressed', fx, 0.4, fz);
      add(new THREE.CircleGeometry(0.47, 28).rotateX(-Math.PI / 2), 'water', fx, 1.32, fz);
      add(CastleProps.lathe([[0.08, 0], [0.07, 0.3], [0.2, 0.38], [0.14, 0.44], [0.02, 0.52]], 16), 'dressed', fx, 1.28, fz);
      // and a ring of ferns round its foot, in the water's edge
      solid.push({ x0: fx - 1.6, x1: fx + 1.6, z0: fz - 1.6, z1: fz + 1.6 });
      trough(c.x1 - T / 2 - OFF - 0.6, c.x1 - T / 2 - OFF, 8.0, 19.4, 71);
      trough(31.2, 40.6, c.z1 - T / 2 - OFF - 0.6, c.z1 - T / 2 - OFF, 72);
      [[31.4, 8.4], [31.4, 18.6], [39.4, 8.4]].forEach(([x, z], i) => palm(x, z, 5 + i));
      // a fern either side of the door from the corridor
      pottedFern(31.0, 11.9, 81); pottedFern(31.0, 15.1, 82);
      for (const [x, z, ry] of [[36, 17.4, 0], [33.0, 13.5, -Math.PI / 2]]) {
        piece([
          ['iron', lbox(1.5, 0.05, 0.44, 0, 0.44, 0)],
          ['iron', lbox(1.5, 0.45, 0.03, 0, 0.75, 0.21)],
          ['iron', lbox(0.05, 0.44, 0.44, -0.72, 0.22, 0)],
          ['iron', lbox(0.05, 0.44, 0.44, 0.72, 0.22, 0)],
        ], x, z, ry);
      }
      solid.push({ x0: 35.2, x1: 36.8, z0: 17.1, z1: 17.7 }, { x0: 32.7, x1: 33.3, z0: 12.7, z1: 14.3 });
      // ivy trailing down from under the cornice, over the window heads
      const rng = U.makeRng(77), hang = c.h - 0.32, off = T / 2 + 0.2;
      for (let z = c.z0 + 0.7; z < c.z1 - 0.5; z += 0.55 + rng() * 0.3) {
        for (const x of [c.x0 + off, c.x1 - off]) {
          add(CastleSurfaces.strand(0.42, 0.7 + rng() * 1.1, Math.PI / 2, (x < fx ? 1 : -1) * 0.08), 'ivy', x, hang, z);
        }
      }
      for (let x = c.x0 + 0.9; x < c.x1 - 0.7; x += 0.55 + rng() * 0.3) {
        add(CastleSurfaces.strand(0.42, 0.7 + rng() * 1.1, 0, -0.08), 'ivy', x, hang, c.z1 - off);
      }
      // hanging baskets from the ridge, trailing ivy, geraniums on top
      for (const [bx, bz] of [[33.4, 10.6], [38.6, 10.6], [33.4, 16.4], [38.6, 16.4]]) {
        const by = 3.75;
        add(CastleProps.stick(V(bx, by + 0.2, bz), V(bx, c.h + 1.2, bz), 0.008), 'iron');
        add(CastleProps.lathe([[0.02, 0], [0.16, 0.05], [0.25, 0.16], [0.27, 0.2]], 16), 'iron', bx, by, bz);
        add(new THREE.TorusGeometry(0.27, 0.012, 5, 20).rotateX(Math.PI / 2), 'iron', bx, by + 0.2, bz);
        add(new THREE.CircleGeometry(0.25, 16).rotateX(-Math.PI / 2), 'soil', bx, by + 0.17, bz);
        clump('flowers', bx, by + 0.15, bz, 0.5, 0.4, rng);
        for (let k = 0; k < 6; k++) {
          const a = k / 6 * TAU;
          add(CastleSurfaces.strand(0.26, 0.5 + rng() * 0.6, Math.PI / 2 - a, 0.06), 'ivy', bx + Math.cos(a) * 0.25, by + 0.19, bz + Math.sin(a) * 0.25);
        }
      }
      // lanterns hung from the ridge
      for (const z of [10.0, 17.0]) chandelier(fx, 3.7, z, 0.45, 6, c.h + 1.55);
    }

    /* The doors: real ones, on hinges, standing open all day — every
       room in the wings, the bedrooms, the great hall and the turret.
       Anybody may shut one by day, and a shut door is a wall until
       somebody opens it; at night yours swings shut and locks. A leaf
       swings into its room, so it stands back against the wall inside
       rather than across the passage. A doorway wider than a man's
       reach gets a pair. */
    const doors = new Map();
    const doorMats = { darkoak: mat('darkoak'), oak: mat('oak'),
                       gold: CastleSurfaces.material('metal', { color: '#d4ab55', roughness: 0.35, metalness: 0.5 }) };
    const leafCache = new Map();
    /* One leaf, `len` long and `h` tall, along +x from its hinge:
       merged geometry per material, shared between leaves of a size. */
    function leafGeo(len, h) {
      const key = len.toFixed(2) + ':' + h.toFixed(2);
      if (leafCache.has(key)) return leafCache.get(key);
      const parts = { darkoak: [], oak: [], gold: [] };
      parts.darkoak.push(lbox(len, h, 0.07, len / 2, h / 2, 0));
      const cols = len > 1.2 ? 2 : 1, pw = (len - 0.22 - (cols - 1) * 0.12) / cols;
      const ph = (h - 0.6) / 2;
      for (let c = 0; c < cols; c++) {
        const px = 0.11 + pw / 2 + c * (pw + 0.12);
        for (const py of [0.2 + ph / 2, 0.4 + ph * 1.5]) {
          for (const z of [0.047, -0.047]) parts.oak.push(lbox(pw, ph, 0.02, px, py, z));
        }
      }
      for (const z of [0.07, -0.07]) parts.gold.push(new THREE.SphereGeometry(0.05, 10, 8).translate(len - 0.16, 1.1, z));
      const out = {};
      for (const id in parts) out[id] = CastleProps.merged(parts[id], 1.2);
      leafCache.set(key, out);
      return out;
    }
    // the direction a leaf at rest along `dx,dz` is turned to: rotation.y
    const turnTo = (dx, dz) => Math.atan2(-dz, dx);
    for (const d of L.DOORS) {
      const walled = d.rooms.map(L.byId).filter(r => r && !(r.open || []).length);
      const tall = d.w > 2.4 ? DOOR_H + 0.8 : DOOR_H;
      const h = Math.min(tall, ...walled.filter(r => r.shape === 'rect').map(r => r.h - 0.6)) - 0.1;
      const ax = d.axis === 'x' ? [1, 0] : [0, 1];
      const ends = d.w > 1.95 ? [1, -1] : [d.hinge];
      const len = d.w / ends.length - (ends.length > 1 ? 0.04 : 0.06);
      const leaves = ends.map(end => {
        const pivot = new THREE.Group();
        pivot.position.set(d.x + ax[0] * end * (d.w / 2 - 0.02), d.y, d.z + ax[1] * end * (d.w / 2 - 0.02));
        const geo = leafGeo(len, h);
        for (const id in geo) {
          pivot.add(new THREE.Mesh(geo[id], doorMats[id]));
        }
        const shut = turnTo(-ax[0] * end, -ax[1] * end);
        let open = turnTo(d.nx, d.nz);
        while (open - shut > Math.PI) open -= Math.PI * 2;
        while (open - shut < -Math.PI) open += Math.PI * 2;
        pivot.rotation.y = open;
        group.add(pivot);
        return { pivot, open, shut, want: open };
      });
      doors.set(d.id, { d, leaves, shut: false, locked: false, block: null });
    }
    /* Shut, or open; `locked` is the night's key, which only matters
       to the scene that turns it — shut is already a wall. */
    function setDoor(id, shut, locked) {
      const e = doors.get(id);
      if (!e) return;
      shut = !!shut;
      e.locked = shut && !!locked;
      if (shut === e.shut) return;
      e.shut = shut;
      for (const l of e.leaves) l.want = shut ? l.shut : l.open;
      if (shut) { e.block = L.doorBox(e.d); solid.push(e.block); }
      else {
        const at = solid.indexOf(e.block);
        if (at >= 0) solid.splice(at, 1);
        e.block = null;
      }
    }
    function stepDoors(dt) {
      for (const e of doors.values()) {
        for (const l of e.leaves) {
          const r = l.pivot.rotation.y;
          if (Math.abs(r - l.want) < 0.001) continue;
          l.pivot.rotation.y = U.damp(r, l.want, 5.5, dt);
        }
      }
    }

    /* ---------------- merge ---------------- */

    const meshes = [];
    for (const [key, geos] of batches) {
      if (!geos.length) continue;
      const id = key.slice(0, key.indexOf('@'));
      const merged = EstateMaterials.merge(geos);
      geos.forEach(g => g.dispose());
      const m = new THREE.Mesh(merged, mat(id));
      m.name = key;
      m.matrixAutoUpdate = false;
      if (id === 'glass') m.renderOrder = 2;
      group.add(m); meshes.push(m);
    }
    for (const [colour, geos] of glowBatches) {
      const merged = EstateMaterials.merge(geos);
      geos.forEach(g => g.dispose());
      const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, fog: false }));
      m.matrixAutoUpdate = false;
      group.add(m);
    }

    /* The view out: the loch and the hills, round the whole house. */
    const outside = CastleProps.view(hour, 2, -3.5);
    group.add(outside);
    group.updateMatrixWorld(true);

    /* ---------------- light ---------------- */

    const hemi = new THREE.HemisphereLight('#fff1de', '#7c5e45', SKY.hemi);
    const sun = new THREE.DirectionalLight(SKY.light, SKY.lightI);
    sun.position.copy(outside.userData.sun).multiplyScalar(60);
    scene.add(hemi, sun, sun.target);
    /* The pool follows you round, but never jumps: a light whose place
       is no longer among the nearest fades out before it moves, and
       fades in where it lands, so a wall never pops bright or dark. */
    const pool = [];
    const poolSize = low ? 3 : POOL;
    const poolI = night ? 26 : hour === 'morning' ? 12 : 18;
    for (let i = 0; i < poolSize; i++) {
      const l = new THREE.PointLight('#ffb877', 0, POOL_RANGE, 2);
      l.userData.at = -1; l.userData.w = 0;
      scene.add(l); pool.push(l);
    }
    const anchors = L.LIGHTS.map(([x, y, z]) => V(x - focus.x, y, z - focus.z));
    let lightClock = 0, wanted = new Set();
    function pickLights(camPos) {
      const order = anchors.map((a, i) => [a.distanceToSquared(camPos), i]).sort((p, q) => p[0] - q[0]);
      wanted = new Set(order.slice(0, poolSize).map(o => o[1]));
      // a free light goes straight to a wanted place nobody holds
      const held = new Set(pool.map(l => l.userData.at));
      for (const l of pool) {
        if (wanted.has(l.userData.at) || l.userData.w > 0.001) continue;
        const next = order.slice(0, poolSize).find(o => !held.has(o[1]));
        if (!next) continue;
        held.delete(l.userData.at);
        l.userData.at = next[1]; held.add(next[1]);
        l.position.copy(anchors[next[1]]);
      }
    }
    function stepLights(dt, t) {
      pool.forEach((l, k) => {
        const u = l.userData, on = u.at >= 0 && wanted.has(u.at);
        u.w = U.clamp(u.w + (on ? 1 : -1) * dt * 2.5, 0, 1);
        const ease = u.w * u.w * (3 - 2 * u.w);
        l.intensity = poolI * ease * (0.92 + Math.sin(t * (5.3 + k * 1.9) + k) * 0.05);
      });
    }
    function placeLights(camPos, t) {
      pickLights(camPos);
      pool.forEach(l => { if (wanted.has(l.userData.at)) l.userData.w = 1; });
      stepLights(0, t);
    }

    scene.background = new THREE.Color(SKY.top);
    scene.fog = null;

    /* ---------------- walking ---------------- */

    function heightAt(x, z) {
      const l = toLocal(x, z);
      return L.heightAt(l.x, l.z);
    }
    function walkable(x, z) {
      const l = toLocal(x, z);
      return L.walkable(l.x, l.z);
    }
    const inBox = (b, lx, lz) => lx > b.x0 - 0.25 && lx < b.x1 + 0.25 && lz > b.z0 - 0.25 && lz < b.z1 + 0.25;
    // how far inside a box a point is: the shortest way out
    const depthIn = (b, lx, lz) => Math.min(lx - b.x0 + 0.25, b.x1 + 0.25 - lx, lz - b.z0 + 0.25, b.z1 + 0.25 - lz);
    /* Blocked, unless the box was already round you and this step takes
       you further out of it: a door shut on somebody in the doorway
       lets them step out of its way, not stand stuck in it. */
    function blocked(lx, lz, from) {
      for (const b of solid) {
        if (!inBox(b, lx, lz)) continue;
        if (from && inBox(b, from.x, from.z) && depthIn(b, lx, lz) < depthIn(b, from.x, from.z)) continue;
        return true;
      }
      return false;
    }
    function constrain(pos, prev) {
      const l = toLocal(pos.x, pos.z), from = toLocal(prev.x, prev.z);
      if (L.walkable(l.x, l.z) && !blocked(l.x, l.z, from)) return true;
      // slide along whichever axis still works, so walls are not sticky
      const lx = toLocal(pos.x, prev.z), lz = toLocal(prev.x, pos.z);
      if (L.walkable(lx.x, lx.z) && !blocked(lx.x, lx.z, from)) { pos.z = prev.z; return true; }
      if (L.walkable(lz.x, lz.z) && !blocked(lz.x, lz.z, from)) { pos.x = prev.x; return true; }
      pos.x = prev.x; pos.z = prev.z;
      return false;
    }

    function update(dt, camPos, t) {
      stepDoors(dt);
      lightClock -= dt;
      if (lightClock <= 0) { pickLights(camPos); lightClock = 0.12; }
      stepLights(Math.min(dt, 0.1), t);
    }

    function dispose() {
      scene.remove(group, hemi, sun, sun.target);
      pool.forEach(l => scene.remove(l));
      Engine.disposeObject(group);
      Object.values(mats).forEach(m => m.dispose());
    }

    const roomAnchor = (id) => {
      const s = L.SPAWN[id];
      if (s) return toWorld(s[0], s[1]);
      const r = L.byId(id);
      if (!r) return toWorld(0, 11);
      return r.shape === 'rect' ? toWorld((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2) : toWorld(r.cx, r.cz);
    };
    placeLights(V(0, 1.6, 0), 0);

    return {
      group, interior: true, room: opts.room || 'hall', solid,
      heightAt, walkable, constrain, update, dispose,
      toWorld, toLocal, roomAnchor, setDoor,
      doorAt: (id) => { const e = doors.get(id); return e ? toWorld(e.d.x, e.d.z) : null; },
      isShut: (id) => { const e = doors.get(id); return !!(e && e.shut); },
      // the shut doors, as the session keeps them: `{ id: 1 }`
      shutDoors: () => { const o = {}; for (const [id, e] of doors) if (e.shut) o[id] = 1; return o; },
      /* Make the doors match a set of shut ones. A locked door is the
         night's business and stays as it is. */
      syncDoors(shut) {
        for (const [id, e] of doors) if (!e.locked) setDoor(id, !!(shut && shut[id]), false);
      },
      landmark: V(0, 6, -8),
      anchors: {},
      road: null,
      colliders: [],
      setWind() {}, setGates() {}, setNight() {},
    };
  }

  return { build, FINISH, windowsFor, MATS };
})();
