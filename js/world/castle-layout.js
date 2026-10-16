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

   Coordinates are castle-local metres: x east, z south, y up, with the
   ground floor at y = 0. A scene asks for a room by id and the interior
   is moved so that room's focus sits at the world origin, which is the
   point every framing in `stage.js` is written around.

   Walking is a union of shapes. Each room is walkable to within a hand
   of its walls; each door is a short connector that overlaps the rooms
   on both sides, so the only way between two rooms is through a door.
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
      doors: [{ a: Math.PI / 2, w: 2.7 }, { a: -Math.PI / 2, w: 1.9 }] },
    { id: 'stair', shape: 'rect', x0: -1.2, x1: 1.2, z0: -17.6, z1: -13.9, h: 5, floor: 'masonry',
      doors: { n: [[-1.2, 1.2]], s: [[-1.2, 1.2]], e: [], w: [] }, open: ['n', 's'],
      ramp: { from: -14.0, to: -17.5, rise: 3 } },
    { id: 'turret', shape: 'circle', cx: 0, cz: -22, r: 4.5, h: 6.5, y: 3, floor: 'timber',
      doors: [{ a: Math.PI / 2, w: 1.9 }] },
    { id: 'corridor', shape: 'rect', x0: 7, x1: 26, z0: 12, z1: 15, h: 4.2, floor: 'timber',
      doors: { w: [[12, 15]], n: [], s: [], e: [] }, open: ['w'] },
  ];

  /* Eight bedrooms off the corridor, four each side, each with a door
     into it. The north row's doors are in their south walls and the
     south row's in their north walls; the corridor's walls get matching
     gaps, so a door is a single opening in two walls. */
  for (let k = 0; k < 8; k++) {
    const north = k < 4, i = k % 4;
    const x0 = 8 + 4 * i, x1 = x0 + 4, c = (x0 + x1) / 2;
    const room = north
      ? { id: 'bed' + k, shape: 'rect', x0, x1, z0: 8, z1: 12, h: 3.8, floor: 'timber',
          doors: { s: [[c - 0.8, c + 0.8]], n: [], e: [], w: [] } }
      : { id: 'bed' + k, shape: 'rect', x0, x1, z0: 15, z1: 19, h: 3.8, floor: 'timber',
          doors: { n: [[c - 0.8, c + 0.8]], s: [], e: [], w: [] } };
    ROOMS.push(room);
    const corridor = ROOMS.find(r => r.id === 'corridor');
    corridor.doors[north ? 'n' : 's'].push([c - 0.8, c + 0.8]);
  }

  const byId = (id) => ROOMS.find(r => r.id === id) || null;

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
    [11, 3, 13.5], [19, 3, 13.5], [24, 3, 13.5],
  ];
  for (let k = 0; k < 8; k++) {
    const r = byId('bed' + k);
    LIGHTS.push([(r.x0 + r.x1) / 2 + 0.4, 1.9, (r.z0 + r.z1) / 2 + (k < 4 ? -1.0 : 1.0)]);
  }

  return { ROOMS, FOCUS, SPAWN, LIGHTS, CONNECT, WALL, byId, walkable, heightAt, roomAt, insideRoom };
})();
