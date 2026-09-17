/* Authored section vocabulary. All placements are resolved once, before rendering. */
const SkiCourse = (() => {
  const RULES = 5;
  // Authored takeoff stations, rail approach, line width and traverse variation.
  // Entrances/exits retain the common centre and tangent; only the interior changes.
  const layouts = [
    [[130, 370], 260, 34, 3], [[170, 395], 285, 39, -5], [[140, 340], 250, 32, 6],
    [[185, 420], 300, 42, -3], [[125, 355], 245, 36, 5], [[205, 410], 315, 30, -6],
    [[145, 365], 260, 32, -4], [[175, 405], 290, 34, 5], [[120, 325], 225, 38, -6],
    [[190, 430], 305, 40, 4], [[155, 385], 270, 33, -3], [[165, 390], 280, 29, 6],
    [[135, 350], 240, 35, 4], [[180, 400], 290, 31, -6], [[145, 380], 265, 39, 5],
    [[200, 435], 310, 28, -4], [[160, 410], 285, 42, 3], [[125, 365], 245, 36, -5],
    [[150, 365], 255, 38, -3], [[195, 415], 300, 32, 5], [[170, 395], 285, 40, -4],
    [[125, 350], 240, 42, 6], [[185, 425], 305, 34, -5], [[145, 385], 270, 36, 4],
  ];
  const catalog = [
    ['summit', 'Crown Face', .27, 64, 'roller', 'hip'],
    ['summit', 'Wind Lip', .29, 58, 'hip', 'kicker'],
    ['summit', 'Eagle Cornice', .31, 62, 'drop', 'roller'],
    ['summit', 'Sun Bowl', .25, 76, 'bank', 'hip'],
    ['summit', 'Twin Peaks', .28, 66, 'kicker', 'roller'],
    ['summit', 'High Traverse', .26, 60, 'roller', 'bank'],
    ['glacier', 'Blue Cathedral', .27, 58, 'bank', 'kicker'],
    ['glacier', 'Ice Ribbon', .28, 54, 'roller', 'hip'],
    ['glacier', 'Serac Steps', .30, 60, 'drop', 'roller'],
    ['glacier', 'Frozen Wave', .26, 62, 'hip', 'bank'],
    ['glacier', 'Crystal Gap', .28, 58, 'kicker', 'drop'],
    ['glacier', 'Meltwater Gully', .25, 54, 'bank', 'roller'],
    ['forest', 'Pine Cathedral', .23, 62, 'roller', 'hip'],
    ['forest', 'Fox Cut', .25, 58, 'hip', 'roller'],
    ['forest', 'Timberline', .24, 60, 'kicker', 'bank'],
    ['forest', 'Needle Alley', .23, 56, 'bank', 'roller'],
    ['forest', 'Hidden Meadow', .22, 70, 'roller', 'kicker'],
    ['forest', 'Raven Hollow', .25, 64, 'drop', 'hip'],
    ['village', 'Chalet Row', .22, 64, 'kicker', 'roller'],
    ['village', 'Clocktower', .23, 62, 'hip', 'bank'],
    ['village', 'Market Square', .21, 72, 'roller', 'kicker'],
    ['village', 'Roof Garden', .24, 66, 'kicker', 'hip'],
    ['village', 'Station Approach', .22, 64, 'bank', 'roller'],
    ['village', 'Last Light', .23, 68, 'hip', 'kicker'],
  ].map(([region, name, grade, half, a, b], i) => ({ id: region + '-' + (i % 6), region, name,
    grade: [grade, grade], half: [half, half], trees: region === 'forest' ? .85 : region === 'village' ? .12 : .06,
    ramps: 1, rolls: .35, bank: region === 'glacier' ? 6 : 2.5, weight: 1,
    layout: { takeoffs: layouts[i][0], rail: layouts[i][1], width: layouts[i][2], warp: layouts[i][3], railKind: i % 3 },
    blurb: name + ' · ' + region, length: 600, features: [a, b], drops: a === 'drop' || b === 'drop' }));
  function order(seed) {
    const rng = U.makeRng(seed ^ 0x74af21), used = new Set();
    return ['summit', 'summit', 'glacier', 'forest', 'forest', 'village'].map(region => {
      const bag = catalog.filter(s => s.region === region && !used.has(s.id));
      const s = bag[Math.floor(rng() * bag.length)]; used.add(s.id); return s;
    });
  }
  // THREE.DodecahedronGeometry(1, 1) as a triangle soup, subdivided and pushed out to the
  // sphere the same way, so a boulder's collider is built from exactly the rock that is drawn.
  const DODECA = (() => {
    const t = (1 + Math.sqrt(5)) / 2, r = 1 / t;
    const v = [-1, -1, -1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, -1, -1, 1, -1, 1, 1, 1, -1, 1, 1, 1,
      0, -r, -t, 0, -r, t, 0, r, -t, 0, r, t, -r, -t, 0, -r, t, 0, r, -t, 0, r, t, 0, -t, 0, -r, t, 0, -r, -t, 0, r, t, 0, r];
    const f = [3, 11, 7, 3, 7, 15, 3, 15, 13, 7, 19, 17, 7, 17, 6, 7, 6, 15, 17, 4, 8, 17, 8, 10, 17, 10, 6,
      8, 0, 16, 8, 16, 2, 8, 2, 10, 0, 12, 1, 0, 1, 18, 0, 18, 16, 6, 10, 2, 6, 2, 13, 6, 13, 15,
      2, 16, 18, 2, 18, 3, 2, 3, 13, 18, 1, 9, 18, 9, 11, 18, 11, 3, 4, 14, 12, 4, 12, 0, 4, 0, 8,
      11, 9, 5, 11, 5, 19, 11, 19, 7, 19, 5, 14, 19, 14, 4, 19, 4, 17, 1, 12, 14, 1, 14, 5, 1, 5, 9];
    const at = i => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
    const mid = (a, b) => a.map((x, k) => (x + b[k]) / 2);
    const out = [];
    for (let i = 0; i < f.length; i += 3) {
      const a = at(f[i]), b = at(f[i + 1]), c = at(f[i + 2]), ab = mid(a, b), ac = mid(a, c), bc = mid(b, c);
      for (const p of [ab, ac, a, ab, bc, ac, b, bc, ab, bc, c, ac]) { const l = Math.hypot(...p); out.push(p[0] / l, p[1] / l, p[2] / l); }
    }
    return out;
  })();
  // Where a point of a boulder's unit sphere ends up in the world. Scenery and collider share it.
  function boulderPoint(b, px, py, pz) {
    if (b.kind === 'ice') {
      const x = px * 12, y = py * b.tall, c = Math.cos(.14), s = Math.sin(.14);
      return [b.x + x * c - y * s, b.y + 15 + x * s + y * c, b.z + pz * 16];
    }
    const w = 1 + .12 * Math.sin(px * 7 + pz * 3) + .08 * Math.cos(py * 9 - px * 4);
    const x = px * 24 * w + py * 6, z = pz * 20 * w, c = Math.cos(b.turn), s = Math.sin(b.turn);
    return [b.x + x * c + z * s, b.y + 19 + py * 48, b.z - x * s + z * c];
  }
  function convexHull(flat) {
    const p = [];
    for (let i = 0; i < flat.length; i += 2) p.push([flat[i], flat[i + 1]]);
    p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p.flat();
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const chain = list => {
      const h = [];
      for (const q of list) { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); }
      return h.slice(0, -1);
    };
    return [...chain(p), ...chain(p.slice().reverse())].flat();
  }
  /* A solid's collider: its convex outline (x, z pairs, anticlockwise) in horizontal bands,
     so a skier meets the rock at the height they are actually at and clears it only when
     they are above it. `soup` is world-space triangles, nine numbers each. */
  function footprint(soup, x, z, band = 1.5) {
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < soup.length; i += 3) { y0 = Math.min(y0, soup[i]); y1 = Math.max(y1, soup[i]); }
    const n = Math.max(1, Math.ceil((y1 - y0) / band)), pts = Array.from({ length: n }, () => []);
    const put = (k, px, pz) => { if (k >= 0 && k < n) pts[k].push(px, pz); };
    for (let t = 0; t < soup.length; t += 9) for (let e = 0; e < 3; e++) {
      const a = t + e * 3, b = t + (e + 1) % 3 * 3, ay = soup[a + 1], by = soup[b + 1];
      put(Math.min(n - 1, Math.floor((ay - y0) / band)), soup[a], soup[a + 2]);
      // an edge crossing a band boundary gives both bands that point of the section
      for (let k = Math.floor((Math.min(ay, by) - y0) / band) + 1; y0 + k * band < Math.max(ay, by); k++) {
        const u = (y0 + k * band - ay) / (by - ay);
        const px = soup[a] + (soup[b] - soup[a]) * u, pz = soup[a + 2] + (soup[b + 2] - soup[a + 2]) * u;
        put(k - 1, px, pz); put(k, px, pz);
      }
    }
    const layers = pts.map(convexHull);
    let r = 0;
    for (const l of layers) for (let i = 0; i < l.length; i += 2) r = Math.max(r, Math.hypot(l[i] - x, l[i + 1] - z));
    return { kind: 'rock', x, z, r, y0, band, layers };
  }
  function key(mode, seed, mod, conditions) { return JSON.stringify([RULES, mode, seed, mod || null,
    Object.keys(conditions).sort().map(k => [k, conditions[k]])]); }
  function makeFace(seed, top = 1180) {
    return MountainKit.makeFace(U.makeRng((seed ^ 0x51a3f7) >>> 0), { top, authored: order(seed) });
  }
  function resolve(face, seed, conditions, config) {
    // One full readable traverse per section; common endpoints guarantee compatible joins.
    face.cxAt = z => {
      const sec = face.sectionAt(z), u = U.clamp((z - sec.z0) / sec.len, 0, 1);
      return 42 * Math.sin(z / 600 * Math.PI * 2)
        + sec.def.layout.warp * Math.sin(u * Math.PI * 4) * Math.sin(u * Math.PI) ** 2;
    };
    face.cxSlopeAt = z => (face.cxAt(z + .25) - face.cxAt(z - .25)) / .5;
    const routes = [], rails = [], surfaces = [], checkpoints = [], buildings = [], solids = [];
    for (const [i, sec] of face.sections.entries()) {
      const a = sec.z0 + 60, b = sec.z1 - 60;
      const x0 = face.cxAt(a), x1 = face.cxAt(b);
      const layout = sec.def.layout;
      const side = ((seed >>> (i + 3)) & 1) ? -1 : 1;
      const styleX = z => face.cxAt(z) + side * layout.width * Math.sin(U.clamp((z - a) / (b - a), 0, 1) * Math.PI);
      const main = [], cut = [], style = [];
      for (let z = a; z <= b; z += 4) {
        const u = (z - a) / (b - a);
        main.push({ x: face.cxAt(z), z });
        cut.push({ x: U.lerp(x0, x1, u), z });
        style.push({ x: styleX(z), z });
      }
      const length = pts => pts.slice(1).reduce((s, p, j) => s + Math.hypot(p.x - pts[j].x, p.z - pts[j].z), 0);
      const gain = length(main) - length(cut);
      routes.push({ id: sec.id, side, width: layout.width, z0: a, z1: b, main, cut, style, saved: gain, difficulty: 'Technical', previewZ: a - 130 });
      face.addChute({ z0: a, z1: b, x0, x1, half: 15, depth: 1.2,
        gain, hard: .35, stray: 42, pay: 1.8, name: sec.name + ' Cut', gap: false,
        taken: false, entered: false });
      const featureKinds = config.rampSpacing >= 200 ? (i === 0 ? ['roller'] : []) : config.rampSpacing < 40 ? [...sec.def.features, 'kicker'] : sec.def.features;
      for (const [j, kind] of featureKinds.entries()) {
        const z = sec.z0 + (layout.takeoffs[j] || 465);
        face.addRamp({ kind, x: styleX(z), z, ax: Math.atan((styleX(z + .5) - styleX(z - .5))),
          len: kind === 'bank' ? 65 : 32, wide: 13, h: (kind === 'drop' ? 3 : kind === 'roller' ? 1.4 : 3.2) * (config.rampScale || 1),
          tail: kind === 'drop' ? 3.2 : 1.8, side, boost: 0.35 * (config.rampBoost ?? 1) });
      }
      const z = sec.z0 + layout.rail, x = styleX(z);
      const points = Array.from({ length: 13 }, (_, j) => {
        const zz = z + j * 7;
        return { x: x + (layout.railKind === 2 ? Math.sin(j / 12 * Math.PI) * 6 * side : layout.railKind === 1 ? Math.max(0, j - 6) * side * .6 : 0),
          z: zz, y: face.heightAt(x, zz) + .72 };
      });
      face.addRamp({kind:'roller',x,z:z-10,ax:0,len:10,wide:3.8,h:.45,boost:0});
      rails.push({ id: 'rail-' + i, kind: ['straight', 'kinked', 'curved'][layout.railKind], points });
      const end = points[points.length - 1];
      rails.push({ id: 'rail-' + i + '-transfer', kind: 'straight', transferFrom: 'rail-' + i,
        points: Array.from({ length: 8 }, (_, j) => {
          const zz = end.z + 10 + j * 7, xx = end.x + 3;
          return { x: xx, z: zz, y: face.heightAt(xx, zz) + .72 };
        }) });
      checkpoints.push({ id: sec.id, z: sec.z0, x: face.cxAt(sec.z0) });
      if (sec.def.region === 'village') {
        for (let j = 0; j < 10; j++) {
          const z = sec.z0 + 35 + j * 53, x = face.cxAt(z) + (j % 2 ? 1 : -1) * (100 + j % 3 * 12);
          const y = face.heightAt(x, z), id = sec.id + '-chalet-' + j;
          buildings.push({ id, x, y, z, color: j % 2 ? '#ab626b' : '#e7b67b' });
          solids.push({ id, min: { x: x - 7.5, y: y - 8, z: z - 9.5 }, max: { x: x + 7.5, y: y + 12, z: z + 9.5 } });
          surfaces.push({ id: id + '-roof', x, z, y: y + 12.6, halfX: 9.5, halfZ: 11.5, slope: 0, rise: 4, thickness: .65, material: 'roof', building: true });
        }
        const approachZ = sec.z0 + 80;
        face.addRamp({ kind: 'kicker', x: face.cxAt(sec.z0 + 140) + 42, z: approachZ,
          ax: 0, len: 30, wide: 12, h: 4.2, tail: 1.8, boost: .35 });
        for (let j = 0; j < 3; j++) {
          const zz = sec.z0 + 140 + j * 115, xx = face.cxAt(zz) + 42;
          const roof = { id: 'roof-' + j, x: xx, z: zz, halfX: 11, halfZ: 22,
            y: face.heightAt(xx, zz) + 5, slope: -.23, thickness: .7, material: 'roof' };
          surfaces.push(roof);
          for (const side of [-1, 1]) solids.push({ id: roof.id + '-support-' + side,
            min: { x: xx + side * 10 - .6, y: roof.y - 5.5, z: zz - 19.8 },
            max: { x: xx + side * 10 + .6, y: roof.y - .5, z: zz + 19.8 } });
        }
      }
    }
    // Pads down every cut: speed pads in pairs, then a launch pad that throws you.
    // Footprints stay clear of roofs, chalets, rails and ramps; a launch's flight only
    // has to miss the buildings and cliff drops, since sailing over a kicker is the fun.
    const padSpacing = config.padSpacing ?? 34, padScale = config.rampBoost ?? 1;
    if (padSpacing > 0 && padScale > 0) {
      const gap = Math.max(36, padSpacing * 1.7);
      const blocked = (x, z, margin, flight) => surfaces.some(s => Math.abs(x - s.x) < s.halfX + margin && Math.abs(z - s.z) < s.halfZ + margin)
        || solids.some(s => x > s.min.x - margin && x < s.max.x + margin && z > s.min.z - margin && z < s.max.z + margin)
        || !flight && rails.some(r => r.points.some(p => Math.hypot(x - p.x, z - p.z) < margin + 2))
        || face.ramps.some(r => (!flight || r.kind === 'drop') && Math.abs(x - r.x) < r.wide * 1.25 + margin && z > r.z - r.len * .3 - margin && z < r.z + r.len * (r.tail ?? 1.18) + margin);
      for (const [i, route] of routes.entries()) {
        const x0 = route.cut[0].x, x1 = route.cut[route.cut.length - 1].x;
        const cutX = z => U.lerp(x0, x1, U.clamp((z - route.z0) / (route.z1 - route.z0), 0, 1));
        const clear = (za, zb, step, margin, flight = false) => {
          for (let z = za; z <= zb; z += step) if (blocked(cutX(z), z, margin, flight)) return false;
          return true;
        };
        const ax = Math.atan((x1 - x0) / (route.z1 - route.z0));
        // every third slot wants a launch; a blocked one stays due until a slot clears
        for (let k = 0, due = 0, z = route.z0 + 100; z + 24 <= route.z1 - 60; k++, z += gap) {
          const speed = { kind: 'speed', x: cutX(z), z, ax, len: 24, wide: 5.5, boost: 1.2 * padScale, chute: face.chutes[i] };
          const launch = { kind: 'launch', x: cutX(z), z, ax, len: 16, wide: 6.5, boost: .55 * padScale,
            lift: 12 * Math.min(1.4, padScale), chute: face.chutes[i] };
          if (k % 3 === 2) due = 1;
          if (due && clear(z, z + 24, 6, 8) && clear(z, z + 110, 6, 8, true)) { face.addPad(launch); due = 0; }
          else if (clear(z, z + 24, 6, 8)) face.addPad(speed);
        }
      }
    }
    // True when a round footprint of `radius` would touch a line someone skis (the whole piste
    // too, with `piste`), a cut's corridor, a feature and its landing, a pad and its flight, a rail
    // or a building. Scenery that answers false can never be in the way of a route.
    face.clearLine = (x, z, radius = 5, piste = false) => {
      const step = Math.max(2, radius / 4);
      for (let dz = -radius; dz <= radius + 1e-6; dz += step) {
        const zz = z + dz, reach = Math.sqrt(Math.max(0, radius * radius - dz * dz)), cx = face.cxAt(zz);
        if (Math.abs(x - cx) < reach + (piste ? face.halfAt(zz) + 8 : 9)) return true;
        const route = routes.find(r => zz >= r.z0 && zz <= r.z1);
        if (!route) continue;
        const u = (zz - route.z0) / (route.z1 - route.z0);
        if (Math.abs(x - U.lerp(route.cut[0].x, route.cut[route.cut.length - 1].x, u)) < reach + face.chutes[routes.indexOf(route)].half + 2) return true;
        if (Math.abs(x - cx - route.side * Math.sin(u * Math.PI) * route.width) < reach + 9) return true;
      }
      return rails.some(r => r.points.some(p => Math.hypot(x - p.x, z - p.z) < radius + 12))
        || surfaces.some(s => Math.abs(x - s.x) < s.halfX + radius + 8 && Math.abs(z - s.z) < s.halfZ + radius + 10)
        || solids.some(s => x > s.min.x - radius - 6 && x < s.max.x + radius + 6 && z > s.min.z - radius - 6 && z < s.max.z + radius + 6)
        || face.ramps.some(r => Math.abs(x - r.x) < r.wide * 1.25 + radius + 4 && z > r.z - r.len * .3 - radius - 4 && z < r.z + r.len * (r.tail ?? 1.18) + radius + 4)
        || face.pads.some(p => Math.abs(x - p.x) < p.wide + radius + 4 && z > p.z - radius - 4 && z < p.z + (p.lift ? 110 : p.len) + radius + 4);
    };
    face.seal();
    // Region landmarks, summit granite and glacier seracs are resolved here so the mountain
    // collides with exactly what is drawn. Each walks outward from its authored spot until it is
    // off the piste and clear of everything clearLine protects.
    const settle = (z, side, lat, radius) => {
      while (lat < face.edge + 80 && face.clearLine(face.cxAt(z) + side * lat, z, radius, true)) lat += 4;
      return face.cxAt(z) + side * lat;
    };
    const landmarks = [], boulders = [];
    for (const sec of face.sections) {
      const z = sec.z1 - 45, x = settle(z, -1, 90, 6), y = face.heightAt(x, z), id = sec.id + '-landmark';
      landmarks.push({ id, x, y, z, region: sec.def.region });
      solids.push({ id, min: { x: x - 4, y: y - 8, z: z - 4 }, max: { x: x + 4, y: y + 32, z: z + 4 } });
    }
    for (const sec of face.sections) {
      const region = sec.def.region;
      if (region !== 'summit' && region !== 'glacier') continue;
      for (let j = 0; j < 12; j++) {
        const z = sec.z0 + 30 + j / 12 * 550;
        const b = { id: sec.id + '-boulder-' + j, kind: region === 'glacier' ? 'ice' : 'granite',
          tall: 24 + j % 3 * 6, turn: j * .71, shade: j % 2, x: 0, y: 0, z: 0 };
        let reach = 0;
        for (let i = 0; i < DODECA.length; i += 3) {
          const p = boulderPoint(b, DODECA[i], DODECA[i + 1], DODECA[i + 2]);
          reach = Math.max(reach, Math.hypot(p[0], p[2]));
        }
        b.x = settle(z, j % 2 ? 1 : -1, 95 + j % 3 * 15, reach); b.z = z; b.y = face.heightAt(b.x, z);
        const soup = [];
        for (let i = 0; i < DODECA.length; i += 3) soup.push(...boulderPoint(b, DODECA[i], DODECA[i + 1], DODECA[i + 2]));
        b.collider = footprint(soup, b.x, b.z, 2);
        boulders.push(b);
      }
    }
    for (const [i, route] of routes.entries()) {
      const surfaceLength = path => path.slice(1).reduce((sum, p, j) => {
        const q = path[j];
        return sum + Math.hypot(p.x - q.x, p.z - q.z, face.heightAt(p.x, p.z) - face.heightAt(q.x, q.z));
      }, 0);
      route.saved = surfaceLength(route.main) - surfaceLength(route.cut);
      face.chutes[i].gain = route.saved;
    }
    return { rulesVersion: RULES, seed, conditions: { ...conditions }, sectionIds: face.sections.map(s => s.id),
      sections: face.sections, routes, features: face.ramps, pads: face.pads, rails, surfaces, buildings, solids, checkpoints,
      landmarks, boulders, colliders: boulders.map(b => b.collider), total: face.total };
  }
  function validate(d) {
    const errors = [];
    if (d.sections.length !== 6 || new Set(d.sections.map(s => s.def.region)).size !== 4) errors.push('region order');
    for (const [i, section] of d.sections.entries()) {
      if (i && section.z0 !== d.sections[i - 1].z1) errors.push(section.id + ': incompatible entrance');
      if (section.def.layout.takeoffs.some(z => z < 90 || z > section.len - 100)) errors.push(section.id + ': feature clearance');
    }
    for (const r of d.routes) {
      if (!(r.saved > 0)) errors.push(r.id + ': cut is longer');
      for (const path of [r.cut, r.style]) for (const j of [0, path.length - 1])
        if (Math.hypot(path[j].x - r.main[j].x, path[j].z - r.main[j].z) > .01) errors.push(r.id + ': rejoin');
    }
    return errors;
  }
  return { RULES, catalog, order, key, makeFace, resolve, validate, boulderPoint, footprint, DODECA };
})();
