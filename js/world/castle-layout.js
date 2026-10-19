/* ------------------------------------------------------------------
   castle-layout.js — the inside of the castle, as a floor plan.

   The house the night happens in. Authored rather than generated,
   because every room has a job and a camera that has to fit in it:

     hall       the entrance hall, where everybody gathers
     great      the great hall: breakfast, at one long table
     round      the round table chamber, behind the hall
     stair      a narrow stair up out of the back of the chamber
     turret     the Traitors' conclave, at the top of it
     corridor   the bedroom corridor, off the hall to the east
     bed0..7    one room per contestant

   and two wings either side of the round chamber, for the day:

     west       the library behind the great hall, the chapel, the
                kitchen and its scullery
     east       the long gallery, the billiard and drawing rooms, the
                laird's study, the gun room, and the conservatory at
                the end of the bedroom corridor

   Coordinates are castle-local metres: x east, z south, y up, with the
   ground floor at y = 0. A scene asks for a room by id and the interior
   is moved so that room's focus sits at the world origin, which is the
   point every framing in `stage.js` is written around.

   Walking is a union of shapes. Each room is walkable to within a hand
   of its walls; each door is a short connector that overlaps the rooms
   on both sides, so the only way between two rooms is through a door.

   Some doorways have doors in them (`DOORS`). A room whose every
   doorway has a door, all of them shut, is sealed: what is said in it
   stays in it, and nobody outside sees in.
------------------------------------------------------------------ */
const CastleLayout = (() => {

  const WALL = 0.42;              // how close to a wall line a person may stand
                                  // (walls are 0.5 thick, centred on the line)

  /* `doors` are spans along a side, in that side's own coordinate:
     x for the north and south walls, z for the east and west. A circle's
     doors are an angle (radians, 0 = +x, PI/2 = +z) and a width. A door
     onto a passage is exactly as wide as the passage between its walls
     (walls are half a metre thick, centred on these lines), so the
     passage's walls carry straight on as the sides of the doorway. */
  const ROOMS = [
    { id: 'hall', shape: 'rect', x0: -7, x1: 7, z0: 4, z1: 18, h: 9, floor: 'paving',
      doors: { n: [[-1.35, 1.35]], w: [[9.25, 11.75]], e: [[12.25, 14.75]], s: [] },
      gate: { side: 's', span: [-2, 2] } },
    { id: 'west-passage', shape: 'rect', x0: -10, x1: -7, z0: 9, z1: 12, h: 4.2, floor: 'paving',
      doors: { e: [[9, 12]], w: [[9, 12]], n: [], s: [] }, open: ['e', 'w'] },
    { id: 'great', shape: 'rect', x0: -22, x1: -10, z0: -2, z1: 20, h: 8, floor: 'timber',
      doors: { e: [[9.25, 11.75]], n: [], s: [], w: [] } },
    { id: 'north-passage', shape: 'rect', x0: -1.6, x1: 1.6, z0: 1.9, z1: 4, h: 4.2, floor: 'paving',
      doors: { n: [[-1.6, 1.6]], s: [[-1.6, 1.6]], e: [], w: [] }, open: ['n', 's'] },
    { id: 'round', shape: 'circle', cx: 0, cz: -6, r: 8, h: 10, floor: 'paving',
      doors: [{ a: Math.PI / 2, w: 2.7 }, { a: -Math.PI / 2, w: 1.9 },
              { a: Math.PI, w: 1.9 }, { a: 0, w: 1.9 }] },
    { id: 'stair', shape: 'rect', x0: -1.2, x1: 1.2, z0: -17.6, z1: -13.9, h: 5, floor: 'masonry',
      doors: { n: [[-1.2, 1.2]], s: [[-1.2, 1.2]], e: [], w: [] }, open: ['n', 's'],
      ramp: { from: -14.0, to: -17.5, rise: 3 } },
    { id: 'turret', shape: 'circle', cx: 0, cz: -22, r: 4.5, h: 6.5, y: 3, floor: 'timber', quiet: true,
      doors: [{ a: Math.PI / 2, w: 1.9 }] },
    { id: 'corridor', shape: 'rect', x0: 7, x1: 30, z0: 12, z1: 15, h: 4.2, floor: 'timber',
      doors: { w: [[12, 15]], n: [], s: [], e: [] }, open: ['w'] },
  ];

  const rect = (id, x0, x1, z0, z1, h, floor, more) =>
    Object.assign({ id, shape: 'rect', x0, x1, z0, z1, h, floor, doors: { n: [], s: [], e: [], w: [] } }, more || {});

  /* The west wing. The library runs the length of the great hall's
     north wall and on past it, with the chapel off its far end and the
     kitchen beyond; a short passage joins it to the round chamber. */
  ROOMS.push(
    rect('library', -30, -10, -9.5, -2, 5.5, 'timber'),
    rect('chapel', -30, -20, -21.5, -9.5, 8, 'paving', { quiet: true }),
    rect('kitchen', -42, -30, -14, 2, 5, 'paving'),
    rect('scullery', -42, -34, -22, -14, 4, 'paving', { quiet: true }),
    rect('west-link', -10, -7.9, -7.2, -4.8, 4.2, 'paving',
         { open: ['e', 'w'], doors: { e: [[-7.2, -4.8]], w: [[-7.2, -4.8]], n: [], s: [] } }),
  );

  /* The east wing. A passage out of the round chamber's east side to
     the long gallery; the billiard and drawing rooms behind it, the
     laird's study at its end, and the gun room down from it to the
     conservatory, which is also the end of the bedroom corridor. The
     courtyard between the gallery and the bedrooms is open sky, so the
     bedrooms keep their windows. */
  ROOMS.push(
    rect('east-link', 7.9, 16, -7.2, -4.8, 4.2, 'paving',
         { open: ['w', 'e'], doors: { w: [[-7.2, -4.8]], e: [[-7.2, -4.8]], n: [], s: [] } }),
    rect('gallery', 16, 40, -8, -2, 5, 'timber'),
    rect('billiard', 16, 28, -18, -8, 4.6, 'timber', { quiet: true }),
    rect('drawing', 28, 40, -18, -8, 5, 'timber', { quiet: true }),
    rect('study', 40, 48, -12, 0, 4.2, 'timber', { quiet: true }),
    rect('gun', 32, 40, -2, 7, 4.2, 'timber', { quiet: true }),
    rect('conservatory', 30, 42, 7, 20, 5.5, 'paving', { quiet: true }),
  );

  const byId = (id) => ROOMS.find(r => r.id === id) || null;

  /* ---------------- doors ----------------
     `link` cuts one doorway through the wall two rooms share, into both
     rooms' lists, so it is one opening in two walls. With `leaf` it
     also hangs a door in it, which swings into `into` and is hinged at
     the high end of the span unless `hinge` says 'lo'. */
  const DOORS = [];
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
  const INWARD = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] };
  function hang(id, rooms, x, z, axis, w, n, y, hinge) {
    DOORS.push({ id, rooms, x, z, y: y || 0, axis, w, nx: n[0], nz: n[1], hinge: hinge === 'lo' ? -1 : 1 });
  }
  function link(a, side, span, b, leaf) {
    const A = byId(a), B = byId(b);
    A.doors[side].push(span);
    if (B && B.shape === 'rect' && (B.open || []).indexOf(OPP[side]) < 0) B.doors[OPP[side]].push(span);
    if (!leaf) return;
    const line = side === 'n' ? A.z0 : side === 's' ? A.z1 : side === 'w' ? A.x0 : A.x1;
    const c = (span[0] + span[1]) / 2, axis = side === 'n' || side === 's' ? 'x' : 'z';
    let n = INWARD[side];
    if (leaf.into === b) n = [0 - n[0], 0 - n[1]];
    hang(leaf.id, leaf.into === b ? [b, a] : [a, b], axis === 'x' ? c : line, axis === 'x' ? line : c,
         axis, span[1] - span[0], n, A.y, leaf.hinge);
  }

  /* Eight bedrooms off the corridor, four each side, each with a door
     into it. The north row's doors are in their south walls and the
     south row's in their north walls; the corridor's walls get matching
     gaps, so a door is a single opening in two walls. Each door swings
     into its room and hangs on the side away from the bed. */
  for (let k = 0; k < 8; k++) {
    const north = k < 4, i = k % 4;
    const x0 = 8 + 4 * i, x1 = x0 + 4, c = (x0 + x1) / 2;
    ROOMS.push(rect('bed' + k, x0, x1, north ? 8 : 15, north ? 12 : 19, 3.8, 'timber', { quiet: true }));
    link('bed' + k, north ? 's' : 'n', [c - 0.8, c + 0.8], 'corridor', { id: 'bed' + k, into: 'bed' + k });
  }

  // the great hall: its door from the west passage, and two either side
  // of the high table into the library
  hang('great', ['great', 'west-passage'], -10, 10.5, 'z', 2.5, [-1, 0], 0);
  link('great', 'n', [-20.6, -19.0], 'library', { id: 'library-w', into: 'library', hinge: 'lo' });
  link('great', 'n', [-13.0, -11.4], 'library', { id: 'library-e', into: 'library' });
  // the west wing
  link('library', 'e', [-6.95, -5.05], 'west-link');
  link('library', 'n', [-25.8, -24.2], 'chapel', { id: 'chapel', into: 'chapel' });
  link('library', 'w', [-6.6, -5.0], 'kitchen', { id: 'kitchen', into: 'kitchen' });
  link('kitchen', 'n', [-38.8, -37.2], 'scullery', { id: 'scullery', into: 'scullery' });
  // the east wing
  link('gallery', 'w', [-6.95, -5.05], 'east-link');
  link('gallery', 'n', [21.2, 22.8], 'billiard', { id: 'billiard', into: 'billiard' });
  link('gallery', 'n', [33.2, 34.8], 'drawing', { id: 'drawing', into: 'drawing' });
  link('gallery', 'e', [-5.8, -4.2], 'study', { id: 'study', into: 'study' });
  link('gallery', 's', [35.2, 36.8], 'gun', { id: 'gun-n', into: 'gun' });
  link('gun', 's', [35.2, 36.8], 'conservatory', { id: 'gun-s', into: 'gun', hinge: 'lo' });
  link('corridor', 'e', [12.7, 14.3], 'conservatory', { id: 'conservatory', into: 'conservatory' });
  // the turret's door at the top of the stair, swinging in
  hang('turret', ['turret', 'stair'], 0, -17.5, 'x', 1.9, [0, -1], 3);

  const doorById = (id) => DOORS.find(d => d.id === id) || null;

  /* Which rooms can be shut up: every doorway in them has a door. A
     room with an archway, or a side open onto a passage, never can. */
  const LEAVES = {};
  for (const d of DOORS) for (const id of d.rooms) (LEAVES[id] || (LEAVES[id] = [])).push(d.id);
  const SEALABLE = new Set();
  for (const r of ROOMS) {
    let openings = 0;
    if (r.shape === 'circle') openings = r.doors.length;
    else if ((r.open || []).length) openings = Infinity;
    else for (const side of ['n', 's', 'e', 'w']) openings += (r.doors[side] || []).length;
    if (openings > 0 && (LEAVES[r.id] || []).length === openings) SEALABLE.add(r.id);
  }
  const isShut = (shut, id) => !!(shut && shut[id]);
  // the doors of a room, and the way into it through each
  const doorsOf = (roomId) => (LEAVES[roomId] || []).map(doorById);
  function inward(d, roomId) {
    const k = d.rooms[0] === roomId ? 1 : -1;
    return { x: d.nx * k, z: d.nz * k };
  }
  // `shut` is the set of shut doors, as `{ id: 1 }`
  function sealed(roomId, shut) {
    if (!roomId || !SEALABLE.has(roomId)) return false;
    return LEAVES[roomId].every(id => isShut(shut, id));
  }
  /* Two people the walls keep apart: in different rooms, one of them
     shut up. Somebody in a doorway is in no room and keeps nobody out. */
  function apart(roomA, roomB, shut) {
    if (roomA === roomB) return false;
    return sealed(roomA, shut) || sealed(roomB, shut);
  }

  /* Where each scene puts its centre. The stage stands Claudia 3.4 m
     north (-z) of the focus, so every focus is chosen with the room's
     head end to the north: the round table's stair door is behind her,
     the long table's head is at the north end of the great hall, and in
     the hall she stands with her back to the round chamber. */
  const FOCUS = {
    hall:      { x: 0,   z: 11,   y: 0 },
    round:     { x: 0,   z: -6,   y: 0 },
    great:     { x: -16, z: 7,    y: 0 },
    turret:    { x: 0,   z: -22,  y: 3 },
    corridor:  { x: 16,  z: 13.5, y: 0 },
  };
  for (let k = 0; k < 8; k++) {
    const r = byId('bed' + k);
    FOCUS['bed' + k] = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, y: 0 };
  }

  /* The long table in the great hall runs north–south down the middle
     of the room, its head at the north end where Claudia stands. Room
     centre (-16, 7); the table's own centre sits 0.7 m south of that. */

  function insideRoom(r, x, z, margin) {
    if (r.shape === 'rect') {
      return x > r.x0 + margin && x < r.x1 - margin && z > r.z0 + margin && z < r.z1 - margin;
    }
    const dx = x - r.cx, dz = z - r.cz;
    return dx * dx + dz * dz < (r.r - margin) * (r.r - margin);
  }

  /* A door's connector: a strip across the wall line, as wide as the
     door and deep enough to overlap the walkable interior on both
     sides. Built once, here, from the rooms' own door lists. */
  const CONNECT = [];
  for (const r of ROOMS) {
    if (r.shape === 'rect') {
      for (const side of ['n', 's', 'e', 'w']) {
        for (const [a, b] of (r.doors[side] || [])) {
          const wall = side === 'n' ? r.z0 : side === 's' ? r.z1 : side === 'w' ? r.x0 : r.x1;
          if (side === 'n' || side === 's') CONNECT.push({ x0: a + WALL, x1: b - WALL, z0: wall - 0.9, z1: wall + 0.9 });
          else CONNECT.push({ x0: wall - 0.9, x1: wall + 0.9, z0: a + WALL, z1: b - WALL });
        }
      }
    } else {
      for (const d of r.doors) {
        const px = r.cx + Math.cos(d.a) * r.r, pz = r.cz + Math.sin(d.a) * r.r;
        const along = Math.abs(Math.sin(d.a)) > 0.5;      // a door on the north/south of the circle
        const half = d.w / 2 - WALL;
        if (along) CONNECT.push({ x0: px - half, x1: px + half, z0: pz - 1.2, z1: pz + 1.2 });
        else CONNECT.push({ x0: px - 1.2, x1: px + 1.2, z0: pz - half, z1: pz + half });
      }
    }
  }

  function walkable(x, z) {
    for (const r of ROOMS) if (insideRoom(r, x, z, WALL)) return true;
    for (const c of CONNECT) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return true;
    return false;
  }

  function roomAt(x, z) {
    for (const r of ROOMS) if (insideRoom(r, x, z, 0)) return r;
    return null;
  }

  /* The doorway a door hangs in, as a box across its wall: what a shut
     door blocks, and where somebody standing would jam it. */
  function doorBox(d, depth = 0.32) {
    const h = d.w / 2 + 0.05;
    return d.axis === 'x' ? { x0: d.x - h, x1: d.x + h, z0: d.z - depth, z1: d.z + depth }
                          : { x0: d.x - depth, x1: d.x + depth, z0: d.z - h, z1: d.z + h };
  }
  // the nearest door to a point, within `r`
  function doorNear(x, z, r = 1.6) {
    let best = null, bd = r;
    for (const d of DOORS) {
      const dd = Math.hypot(x - d.x, z - d.z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  /* The floor. Flat everywhere except the stair, which climbs three
     metres from the chamber's north door to the turret's. */
  function heightAt(x, z) {
    const t = byId('turret');
    const dx = x - t.cx, dz = z - t.cz;
    if (dx * dx + dz * dz < (t.r + 0.6) * (t.r + 0.6) && z < -17.4) return t.y;
    if (x > -1.4 && x < 1.4 && z < -13.9 && z > -17.6) {
      return U.clamp((-14.0 - z) / 3.5, 0, 1) * 3;
    }
    return 0;
  }

  /* The whole house, with a margin: what the AIs' walking grid and the
     map cover. */
  const BOUNDS = (() => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const r of ROOMS) {
      const [a, b, c, d] = r.shape === 'rect' ? [r.x0, r.x1, r.z0, r.z1] : [r.cx - r.r, r.cx + r.r, r.cz - r.r, r.cz + r.r];
      x0 = Math.min(x0, a); x1 = Math.max(x1, b); z0 = Math.min(z0, c); z1 = Math.max(z1, d);
    }
    return { x0: Math.floor(x0) - 1, x1: Math.ceil(x1) + 1, z0: Math.floor(z0) - 1, z1: Math.ceil(z1) + 1 };
  })();

  /* Where somebody arrives when a scene puts them in a room without a
     seat — a free walk, or the start of a gathering. */
  const SPAWN = {
    hall: [0, 15.5], round: [0, 0.5], great: [-16, 17], turret: [0, -19.5], corridor: [9, 13.5],
  };

  /* Pools of warm light, as places rather than lamps. The interior has
     a handful of real point lights and moves them to whichever of these
     are nearest the camera, so every room is lit when you are in it and
     the scene never carries more than four. */
  const LIGHTS = [
    [0, 6.0, 11], [5.6, 1.3, 7.5], [0, 3.2, 15.5],                  // hall: chandelier, hearth, door
    [-16, 5.2, 3.6], [-16, 5.2, 12], [-20.4, 1.3, 9],                // great hall: two chandeliers, hearth
    [0, 6.4, -6], [0, 2.6, -1.4], [-5.2, 2.6, -9.5], [5.2, 2.6, -9.5], // the round chamber
    [0, 2.8, -15.5], [0, 6.6, -22], [-8.5, 3, 10.5], [0, 3, 3],
    [11, 3, 13.5], [19, 3, 13.5], [24, 3, 13.5], [28.5, 3, 13.5],
    // the west wing: library, chapel, kitchen, scullery
    [-25, 3.6, -5.75], [-15, 3.6, -5.75], [-25, 4.6, -15.5], [-36, 3.2, -9], [-36, 3.2, -1], [-38, 2.6, -18],
    // the east wing: passage, gallery, billiard, drawing, study, gun room, conservatory
    [12, 3, -6], [22, 3.4, -5], [34, 3.4, -5], [22, 3.2, -13], [34, 3.4, -13], [44, 2.8, -6],
    [36, 2.8, 2.5], [36, 3.8, 11], [36, 3.8, 16.5],
  ];
  for (let k = 0; k < 8; k++) {
    const r = byId('bed' + k);
    LIGHTS.push([(r.x0 + r.x1) / 2 + 0.4, 1.9, (r.z0 + r.z1) / 2 + (k < 4 ? -1.0 : 1.0)]);
  }

  return { ROOMS, FOCUS, SPAWN, LIGHTS, CONNECT, WALL, BOUNDS, DOORS, SEALABLE,
           byId, doorById, doorsOf, inward, walkable, heightAt, roomAt, insideRoom, sealed, apart, doorBox, doorNear };
})();
