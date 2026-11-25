/* ------------------------------------------------------------------
   figure-skeleton.js — the bones every person is hung on.

   One table of joints, in metres at a height of 1.72 with the figure
   facing +z, and every figure is then scaled to the height it asked
   for — the same convention the old rig used, so a `height` is still
   the height you get and every camera framed against it still works.

   The proportions are realistic now rather than chunky: seven heads
   tall, shoulders at about a quarter of the height across, the wrist
   level with the crotch and the fingertips at mid-thigh. The old
   figures were five and three-quarter heads of cylinders and read as
   toys inside a castle that had become a real place around them.

   Bind pose: every bone at zero rotation, standing straight, arms
   hanging at the sides with the palms turned in to the thighs. All
   limb geometry is built along -y from its joint, which is what lets
   `figure-anim.js` pose the whole thing with small, readable angles:
     - shoulder / hip  x < 0 swings the limb forward
     - elbow           x < 0 folds the forearm forward
     - knee            x > 0 folds the shin back
     - spine / neck    x > 0 leans forward
   and z on an arm or leg multiplied by its side is abduction.

   Sides are keyed 'l' at -x and 'r' at +x, as before.
------------------------------------------------------------------ */
const FigureSkeleton = (() => {

  const H0 = 1.72;
  const SIDES = [['l', -1], ['r', 1]];

  /* Heights of the things the body is built around, at H0. */
  const Y = {
    ankle: 0.075, knee: 0.480, hip: 0.885, crotch: 0.775,
    pelvis: 0.960, spine1: 1.030, spine2: 1.160, chest: 1.290,
    shoulder: 1.385, neck: 1.465, head: 1.548,
    elbow: 1.100, wrist: 0.858, knuckle: 0.800,
    eye: 1.603, brow: 1.627, mouth: 1.525, chin: 1.495, crown: 1.722,
  };

  /* Seated: the castle chairs have their cushion at 0.48, so the hip
     joint is about a hand above it and the feet are planted forward. */
  const SEAT = { hip: 0.605, hipZ: -0.045, footZ: 0.330, footX: 0.115 };

  const THIGH = Y.hip - Y.knee;            // 0.405
  const SHIN = Y.knee - Y.ankle;           // 0.405
  const UPPER = Y.shoulder - Y.elbow;      // 0.285
  const FORE = Y.elbow - Y.wrist;          // 0.242

  /* Half-widths that girth reaches. A broad build is broad in the
     shoulders and hips, and only a little in the depth. */
  function dims(girth = 1) {
    const g = girth;
    const gz = 1 + (g - 1) * 0.6;
    return {
      g, gz,
      armX: 0.180 * g,       // shoulder joint
      hipX: 0.092 * g,       // hip joint
      kneeX: 0.090 * g,
      ankleX: 0.087 * g,
      hg: 1 + (g - 1) * 0.30,  // the skull, barely
    };
  }

  /* The bone table: name, parent, absolute bind position. */
  function table(girth = 1) {
    const D = dims(girth);
    const rows = [
      ['pelvis', null,     [0, Y.pelvis, 0]],
      ['spine1', 'pelvis', [0, Y.spine1, -0.005]],
      ['spine2', 'spine1', [0, Y.spine2, -0.005]],
      ['chest',  'spine2', [0, Y.chest, 0]],
      ['neck',   'chest',  [0, Y.neck, -0.012]],
      ['head',   'neck',   [0, Y.head, 0]],
      ['jaw',    'head',   [0, 1.574, 0.006]],
    ];
    for (const [k, s] of SIDES) {
      const hx = s * D.hg;
      rows.push(['eye_' + k,   'head', [s * 0.0315 * D.hg, Y.eye, 0.0]]);   // z set by the body
      rows.push(['lid_' + k,   'head', [s * 0.0315 * D.hg, Y.eye, 0.0]]);
      rows.push(['brow_' + k,  'head', [hx * 0.033, Y.brow, 0.0]]);
      rows.push(['mouth_' + k, 'head', [hx * 0.024, Y.mouth, 0.0]]);
    }
    for (const [k, s] of SIDES) {
      const ax = s * D.armX;
      rows.push(['clav_' + k,  'chest',       [s * 0.022, 1.425, 0.004]]);
      rows.push(['arm_' + k,   'clav_' + k,   [ax, Y.shoulder, -0.008]]);
      rows.push(['fore_' + k,  'arm_' + k,    [ax, Y.elbow, -0.008]]);
      rows.push(['hand_' + k,  'fore_' + k,   [ax, Y.wrist, -0.004]]);
      rows.push(['thumb1_' + k, 'hand_' + k,  [ax - s * 0.008, 0.846, 0.024]]);
      rows.push(['thumb2_' + k, 'thumb1_' + k, [ax - s * 0.013, 0.812, 0.037]]);
      rows.push(['index1_' + k, 'hand_' + k,  [ax - s * 0.003, Y.knuckle, 0.024]]);
      rows.push(['index2_' + k, 'index1_' + k, [ax - s * 0.003, 0.757, 0.024]]);
      rows.push(['fing1_' + k, 'hand_' + k,   [ax - s * 0.003, Y.knuckle, -0.008]]);
      rows.push(['fing2_' + k, 'fing1_' + k,  [ax - s * 0.003, 0.755, -0.008]]);
    }
    for (const [k, s] of SIDES) {
      rows.push(['thigh_' + k, 'pelvis',      [s * D.hipX, Y.hip, 0]]);
      rows.push(['shin_' + k,  'thigh_' + k,  [s * D.kneeX, Y.knee, 0]]);
      rows.push(['foot_' + k,  'shin_' + k,   [s * D.ankleX, Y.ankle, 0]]);
      rows.push(['toe_' + k,   'foot_' + k,   [s * D.ankleX, 0.026, 0.135]]);
    }
    return rows;
  }

  /* Index of every bone by name, for the geometry's skinIndex. The
     order is the table's and does not depend on girth. */
  const NAMES = table(1).map(r => r[0]);
  const INDEX = {};
  NAMES.forEach((n, i) => { INDEX[n] = i; });

  /* Real THREE.Bones in bind pose, parented, positioned relative to
     their parents. `eyeZ` comes from the head the body built, because
     the eyes sit where the face actually is. */
  function build(girth = 1, eyeZ = 0.07) {
    const rows = table(girth);
    const bones = [], by = {}, bind = {};
    for (const [name, parent, at] of rows) {
      const p = at.slice();
      if (/^(eye|lid)_/.test(name)) p[2] = eyeZ;
      bind[name] = p;
      const b = new THREE.Bone();
      b.name = name;
      if (parent) {
        const q = bind[parent];
        b.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        by[parent].add(b);
      } else {
        b.position.set(p[0], p[1], p[2]);
      }
      bones.push(b);
      by[name] = b;
    }
    return { bones, by, bind };
  }

  return { H0, Y, SEAT, THIGH, SHIN, UPPER, FORE, SIDES, NAMES, INDEX, dims, table, build };
})();
