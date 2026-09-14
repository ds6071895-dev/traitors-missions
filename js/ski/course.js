/* Authored section vocabulary. All placements are resolved once, before rendering. */
const SkiCourse = (() => {
  const RULES = 4;
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
    face.clearLine = (x, z, radius = 5) => {
      const route = routes.find(r => z >= r.z0 && z <= r.z1);
      const lines = [face.cxAt(z)];
      if (route) {
        const u = (z - route.z0) / (route.z1 - route.z0);
        lines.push(U.lerp(route.cut[0].x, route.cut[route.cut.length - 1].x, u), face.cxAt(z) + route.side * Math.sin(u * Math.PI) * route.width);
      }
      if (lines.some(line => Math.abs(x - line) < radius + 9)) return true;
      return rails.some(r => r.points.some(p => Math.hypot(x - p.x, z - p.z) < radius + 12))
        || surfaces.some(s => Math.abs(x - s.x) < s.halfX + radius + 8 && Math.abs(z - s.z) < s.halfZ + radius + 10);
    };
    face.seal();
    for (const [i, route] of routes.entries()) {
      const surfaceLength = path => path.slice(1).reduce((sum, p, j) => {
        const q = path[j];
        return sum + Math.hypot(p.x - q.x, p.z - q.z, face.heightAt(p.x, p.z) - face.heightAt(q.x, q.z));
      }, 0);
      route.saved = surfaceLength(route.main) - surfaceLength(route.cut);
      face.chutes[i].gain = route.saved;
    }
    return { rulesVersion: RULES, seed, conditions: { ...conditions }, sectionIds: face.sections.map(s => s.id),
      sections: face.sections, routes, features: face.ramps, rails, surfaces, buildings, solids, checkpoints, colliders: [], total: face.total };
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
  return { RULES, catalog, order, key, makeFace, resolve, validate };
})();
