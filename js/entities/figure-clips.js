/* ------------------------------------------------------------------
   figure-clips.js — what a person can do, written down.

   Every act is a few keyed poses over normalised time. A key lists only
   the bones it cares about; anything it leaves out is whatever the
   figure was already doing underneath (walking, sitting, listening),
   so a nod works on somebody walking and a shrug works on somebody
   seated. Angles are radians on the bind pose of `figure-skeleton.js`:

     arm / thigh   x < 0 forward     z × side > 0 out from the body
     fore          x < 0 folds the forearm up     y twists it
     spine, neck   x > 0 forward     head x > 0 looks down
     clav          z × side > 0 lifts the shoulder

   A bone value is [x, y, z]. `S` in a value is the side (−1 left,
   +1 right), resolved when the clip is used, so one line writes both
   arms. Hands are [curl, index, thumb, spread]: 0 is open, 1 a fist.
   `face` carries { smile, frown, brow, browIn, jaw, lids, squint }.

   An act is `{ dur, fade: [in, out], keys, face, loop, mask, prio }`.
   `mask` says which part of the body it owns ('upper', 'head',
   'full', 'arms', 'r', 'l'); `prio` decides who wins when two overlap.
------------------------------------------------------------------ */
const FigureClips = (() => {

  /* A pose for both sides from one function of the side. */
  const both = (fn) => {
    const out = {};
    for (const [k, s] of [['l', -1], ['r', 1]]) Object.assign(out, fn(k, s));
    return out;
  };
  const arm = (k, x, y, z) => ({ ['arm_' + k]: [x, y, z] });

  /* ---------------- base poses ----------------
     Not acts: the poses the runtime blends between all the time. */
  const STAND = both((k, s) => ({
    ['arm_' + k]: [0.03, 0, s * 0.10], ['fore_' + k]: [-0.16, 0, 0], ['hand_' + k]: [0, 0, s * 0.06],
    ['clav_' + k]: [0, 0, 0],
  }));

  /* Hands resting on a table edge, and in a lap: arm targets for IK
     rather than angles, in root-local metres at 1.72. */
  const SEAT_HANDS = {
    table: { l: [-0.17, 0.785, 0.30], r: [0.17, 0.785, 0.30] },
    lap:   { l: [-0.105, 0.665, 0.215], r: [0.105, 0.665, 0.215] },
  };

  /* ---------------- talking ----------------
     Short gestures picked at random while somebody has the floor, so
     a speech is a run of different beats rather than one arm pumping.
     Seated people use them too, smaller. */
  const TALK = {
    open: { dur: 1.3, fade: [0.3, 0.4], mask: 'arms', keys: [
      [0.0, both((k, s) => ({ ['arm_' + k]: [-0.35, -s * 0.2, s * 0.22], ['fore_' + k]: [-1.25, s * 0.9, 0],
                              ['hand_' + k]: [0.15, 0, -s * 0.3], hand: [0.15, 0.1, 0.1, 0.4] }))],
      [0.5, both((k, s) => ({ ['arm_' + k]: [-0.42, -s * 0.2, s * 0.30], ['fore_' + k]: [-1.10, s * 1.0, 0],
                              ['hand_' + k]: [0.25, 0, -s * 0.35] }))],
      [1.0, both((k, s) => ({ ['arm_' + k]: [-0.32, -s * 0.2, s * 0.24], ['fore_' + k]: [-1.30, s * 0.9, 0] }))],
    ] },
    chop: { dur: 1.1, fade: [0.2, 0.35], mask: 'r', keys: [
      [0.0, { arm_r: [-0.45, -0.25, 0.12], fore_r: [-1.70, 0.1, 0], hand_r: [0.1, 0, 0], hand: [0.25, 0.2, 0.1, 0] }],
      [0.35, { arm_r: [-0.55, -0.25, 0.12], fore_r: [-1.35, 0.1, 0], hand_r: [-0.25, 0, 0] }],
      [0.6, { arm_r: [-0.42, -0.25, 0.12], fore_r: [-1.75, 0.1, 0], hand_r: [0.1, 0, 0] }],
      [1.0, { arm_r: [-0.50, -0.25, 0.12], fore_r: [-1.40, 0.1, 0], hand_r: [-0.2, 0, 0] }],
    ] },
    count: { dur: 1.4, fade: [0.3, 0.4], mask: 'arms', keys: [
      [0.0, { arm_l: [-0.45, 0.55, -0.12], fore_l: [-1.65, -0.5, 0], hand_l: [0.2, 0, 0], handL: [0.9, 0.0, 0.2, 0],
              arm_r: [-0.40, -0.75, 0.10], fore_r: [-1.75, 0.3, 0], handR: [0.9, 0.0, 0.8, 0] }],
      [0.5, { arm_r: [-0.42, -0.80, 0.10], fore_r: [-1.85, 0.3, 0] }],
      [1.0, { arm_l: [-0.45, 0.55, -0.12], arm_r: [-0.40, -0.75, 0.10], fore_r: [-1.75, 0.3, 0] }],
    ] },
    self: { dur: 1.3, fade: [0.3, 0.45], mask: 'r', keys: [
      [0.0, { arm_r: [-0.40, -1.00, 0.08], fore_r: [-2.15, 0, 0], hand_r: [0.1, 0, 0], hand: [0.2, 0.2, 0.1, 0.3] }],
      [0.6, { arm_r: [-0.44, -1.05, 0.08], fore_r: [-2.25, 0, 0] }],
      [1.0, { arm_r: [-0.40, -1.00, 0.08], fore_r: [-2.15, 0, 0] }],
    ] },
    spread: { dur: 1.2, fade: [0.25, 0.45], mask: 'arms', keys: [
      [0.0, both((k, s) => ({ ['arm_' + k]: [-0.25, 0, s * 0.30], ['fore_' + k]: [-0.95, s * 1.1, 0],
                              hand: [0.05, 0.0, 0.0, 0.6] }))],
      [0.4, both((k, s) => ({ ['arm_' + k]: [-0.30, 0, s * 0.48], ['fore_' + k]: [-0.80, s * 1.2, 0] }))],
      [1.0, both((k, s) => ({ ['arm_' + k]: [-0.25, 0, s * 0.36], ['fore_' + k]: [-0.95, s * 1.1, 0] }))],
    ] },
    point: { dur: 1.2, fade: [0.25, 0.4], mask: 'r', keys: [
      [0.0, { arm_r: [-0.85, -0.35, 0.05], fore_r: [-1.05, 0.0, 0], handR: [1.0, 0.0, 0.8, 0] }],
      [0.45, { arm_r: [-0.95, -0.35, 0.05], fore_r: [-0.85, 0.0, 0] }],
      [1.0, { arm_r: [-0.85, -0.35, 0.05], fore_r: [-1.0, 0.0, 0] }],
    ] },
  };

  /* ---------------- acts ---------------- */
  const ACTS = {
    nod: { dur: 0.9, fade: [0.12, 0.2], mask: 'head', keys: [
      [0.0, { head: [0, 0, 0] }], [0.25, { head: [0.20, 0, 0] }], [0.5, { head: [-0.02, 0, 0] }],
      [0.72, { head: [0.13, 0, 0] }], [1.0, { head: [0, 0, 0] }],
    ] },
    shake: { dur: 1.1, fade: [0.12, 0.2], mask: 'head', keys: [
      [0.0, { head: [0.03, 0, 0] }], [0.2, { head: [0.03, 0.24, 0] }], [0.45, { head: [0.03, -0.24, 0] }],
      [0.7, { head: [0.03, 0.18, 0] }], [1.0, { head: [0.03, 0, 0] }],
    ], face: [[0, { frown: 0.3 }], [1, { frown: 0.2 }]] },
    shrug: { dur: 1.5, fade: [0.25, 0.4], mask: 'upper', keys: [
      [0.0, {}],
      [0.35, Object.assign(both((k, s) => ({ ['clav_' + k]: [0, 0, s * 0.22], ['arm_' + k]: [-0.15, 0, s * 0.30],
                                              ['fore_' + k]: [-1.35, s * 1.25, 0], hand: [0.05, 0, 0, 0.5] })),
                           { head: [0.02, 0, 0.14] })],
      [0.7, Object.assign(both((k, s) => ({ ['clav_' + k]: [0, 0, s * 0.18], ['arm_' + k]: [-0.15, 0, s * 0.30],
                                             ['fore_' + k]: [-1.35, s * 1.25, 0] })),
                          { head: [0.02, 0, 0.12] })],
      [1.0, {}],
    ], face: [[0.3, { brow: 0.9, frown: 0.5 }], [0.8, { brow: 0.6, frown: 0.4 }]] },
    crossArms: { dur: 1.2, fade: [0.45, 0.5], mask: 'arms', hold: true, keys: [
      [0.0, both((k, s) => ({ ['arm_' + k]: [-0.26, -s * 1.10, s * 0.20], ['fore_' + k]: [-1.80, 0, 0],
                              ['hand_' + k]: [0, 0, -s * 0.2], hand: [0.6, 0.6, 0.5, 0] }))],
      [1.0, both((k, s) => ({ ['arm_' + k]: [-0.26, -s * 1.10, s * 0.20], ['fore_' + k]: [-1.80, 0, 0] }))],
    ] },
    handsHips: { dur: 1.2, fade: [0.45, 0.5], mask: 'arms', hold: true, keys: [
      [0.0, both((k, s) => ({ ['arm_' + k]: [0.25, s * 0.85, s * 0.62], ['fore_' + k]: [-1.55, 0, 0],
                              ['hand_' + k]: [0, 0, s * 0.3], hand: [0.5, 0.5, 0.2, 0] }))],
      [1.0, both((k, s) => ({ ['arm_' + k]: [0.25, s * 0.85, s * 0.62], ['fore_' + k]: [-1.55, 0, 0] }))],
    ] },
    think: { dur: 2.4, fade: [0.45, 0.5], mask: 'arms', keys: [
      [0.0, { arm_r: [-0.30, -0.95, 0.12], fore_r: [-2.55, 0, 0], handR: [0.8, 0.4, 0.3, 0],
              arm_l: [-0.35, 0.95, -0.10], fore_l: [-1.85, 0, 0], handL: [0.5, 0.5, 0.3, 0], head: [0.06, 0, 0.06] }],
      [1.0, { arm_r: [-0.30, -0.95, 0.12], fore_r: [-2.55, 0, 0],
              arm_l: [-0.35, 0.95, -0.10], fore_l: [-1.85, 0, 0], head: [0.04, 0, 0.08] }],
    ], face: [[0, { browIn: 0.5, squint: 0.3 }], [1, { browIn: 0.4, squint: 0.2 }]] },
    handChest: { dur: 1.4, fade: [0.25, 0.45], mask: 'r', keys: [
      [0.0, { arm_r: [-0.42, -1.05, 0.06], fore_r: [-2.25, 0, 0], hand: [0.15, 0.1, 0.1, 0.4] }],
      [1.0, { arm_r: [-0.42, -1.05, 0.06], fore_r: [-2.25, 0, 0] }],
    ], face: [[0, { brow: 0.7 }], [1, { brow: 0.5 }]] },
    neckRub: { dur: 2.0, fade: [0.4, 0.45], mask: 'r', keys: [
      [0.0, { arm_r: [-2.25, -0.4, 0.55], fore_r: [-2.25, 0, 0], head: [0.18, 0, -0.06] }],
      [0.5, { arm_r: [-2.30, -0.4, 0.60], fore_r: [-2.10, 0, 0], head: [0.20, 0, -0.08] }],
      [1.0, { arm_r: [-2.25, -0.4, 0.55], fore_r: [-2.25, 0, 0], head: [0.18, 0, -0.06] }],
    ], face: [[0, { browIn: 0.4, frown: 0.3, lids: 0.15 }]] },
    gasp: { dur: 1.6, fade: [0.08, 0.6], mask: 'upper', prio: 3, keys: [
      [0.0, {}],
      [0.15, Object.assign(both((k, s) => ({ ['arm_' + k]: [-0.75, -s * 0.55, s * 0.12], ['fore_' + k]: [-2.30, 0, 0],
                                              hand: [0.15, 0.1, 0.1, 0.5] })),
                           { spine2: [-0.10, 0, 0], head: [-0.12, 0, 0] })],
      [0.6, Object.assign(both((k, s) => ({ ['arm_' + k]: [-0.70, -s * 0.55, s * 0.12], ['fore_' + k]: [-2.25, 0, 0] })),
                          { spine2: [-0.06, 0, 0], head: [-0.05, 0, 0] })],
      [1.0, {}],
    ], face: [[0.1, { jaw: 0.75, brow: 1, lids: -0.3 }], [0.6, { jaw: 0.4, brow: 0.8 }], [1, { jaw: 0, brow: 0.2 }]] },
    handsFace: { dur: 2.6, fade: [0.3, 0.7], mask: 'upper', prio: 3, keys: [
      [0.0, {}],
      [0.2, Object.assign(both((k, s) => ({ ['arm_' + k]: [-1.10, -s * 0.62, s * 0.06], ['fore_' + k]: [-2.45, 0, 0],
                                             ['hand_' + k]: [-0.3, 0, 0], hand: [0.25, 0.15, 0.2, 0.2] })),
                          { head: [0.38, 0, 0], spine2: [0.18, 0, 0] })],
      [0.8, Object.assign(both((k, s) => ({ ['arm_' + k]: [-1.10, -s * 0.62, s * 0.06], ['fore_' + k]: [-2.45, 0, 0] })),
                          { head: [0.42, 0, 0], spine2: [0.22, 0, 0] })],
      [1.0, {}],
    ], face: [[0, { frown: 1, browIn: 1, lids: 0.5 }]] },
    relief: { dur: 1.8, fade: [0.25, 0.6], mask: 'upper', keys: [
      [0.0, {}],
      [0.3, Object.assign(both((k, s) => ({ ['clav_' + k]: [0, 0, s * 0.12] })), { head: [-0.12, 0, 0], spine2: [-0.06, 0, 0] })],
      [0.65, Object.assign(both((k, s) => ({ ['clav_' + k]: [0, 0, -s * 0.06] })), { head: [0.16, 0, 0], spine2: [0.10, 0, 0] })],
      [1.0, {}],
    ], face: [[0.2, { brow: 0.6, lids: 0.3 }], [0.7, { smile: 0.7, lids: 0.35 }], [1, { smile: 0.4 }]] },
    clap: { dur: 2.0, fade: [0.25, 0.4], mask: 'arms', keys: (() => {
      const k = [];
      for (let i = 0; i <= 8; i++) {
        const open = i % 2 ? 0 : 1;
        k.push([i / 8, both((kk, s) => ({ ['arm_' + kk]: [-0.70, -s * 0.70, s * (0.10 + 0.10 * open)],
                                          ['fore_' + kk]: [-1.55, s * 0.6, 0], hand: [0.1, 0.1, 0.2, 0] }))]);
      }
      return k;
    })(), face: [[0, { smile: 0.6 }]] },
    laugh: { dur: 1.8, fade: [0.15, 0.5], mask: 'upper', keys: [
      [0.0, {}], [0.2, { head: [-0.20, 0, 0.05], spine2: [-0.08, 0, 0] }], [0.35, { head: [-0.12, 0, 0.05], spine2: [-0.03, 0, 0] }],
      [0.5, { head: [-0.20, 0, 0.05], spine2: [-0.08, 0, 0] }], [0.65, { head: [-0.10, 0, 0.04] }], [1.0, {}],
    ], face: [[0, { smile: 1, jaw: 0.35, lids: 0.35 }], [0.35, { smile: 1, jaw: 0.15 }], [0.5, { smile: 1, jaw: 0.4 }], [1, { smile: 0.5, jaw: 0 }]] },
    smirk: { dur: 1.8, fade: [0.25, 0.5], mask: 'head', keys: [
      [0.0, { head: [-0.05, 0.05, 0.08] }], [1.0, { head: [-0.04, 0.04, 0.07] }],
    ], face: [[0, { smirk: 1, lids: 0.25, brow: 0.2 }]] },
    headDown: { dur: 3.0, fade: [0.6, 0.8], mask: 'upper', hold: true, keys: [
      [0.0, Object.assign({ head: [0.42, 0, 0], neck: [0.10, 0, 0], spine2: [0.10, 0, 0] },
                          both((k, s) => ({ ['clav_' + k]: [0, 0, -s * 0.08] })))],
      [1.0, { head: [0.40, 0, 0], neck: [0.10, 0, 0], spine2: [0.10, 0, 0] }],
    ], face: [[0, { frown: 0.8, browIn: 0.7, lids: 0.35 }]] },
    wave: { dur: 1.8, fade: [0.25, 0.4], mask: 'r', keys: (() => {
      const k = [];
      for (let i = 0; i <= 6; i++) k.push([i / 6, { arm_r: [-2.55, -0.3, 0.42], fore_r: [-0.95, 0, (i % 2 ? -0.35 : 0.30)],
                                                   hand: [0.05, 0, 0, 0.4] }]);
      return k;
    })(), face: [[0, { smile: 0.9, brow: 0.4 }]] },
    cheer: { dur: 1.6, fade: [0.2, 0.4], mask: 'arms', loop: true, keys: (() => {
      const k = [];
      for (let i = 0; i <= 4; i++) k.push([i / 4, both((kk, s) => ({ ['arm_' + kk]: [-2.70, 0, s * (0.30 + (i % 2 ? 0.08 : 0))],
                                                                      ['fore_' + kk]: [-0.35 - (i % 2) * 0.2, 0, 0], hand: [0.9, 0.9, 0.7, 0] }))]);
      return k;
    })(), face: [[0, { smile: 1, jaw: 0.5, brow: 0.6 }]] },
    present: { dur: 1.8, fade: [0.35, 0.5], mask: 'arms', keys: [
      [0.0, both((k, s) => ({ ['arm_' + k]: [-0.50, 0, s * 0.42], ['fore_' + k]: [-0.80, s * 1.2, 0], hand: [0.05, 0.05, 0, 0.6] }))],
      [1.0, both((k, s) => ({ ['arm_' + k]: [-0.45, 0, s * 0.38], ['fore_' + k]: [-0.90, s * 1.15, 0] }))],
    ] },
    comfort: { dur: 2.2, fade: [0.4, 0.5], mask: 'r', keys: [
      [0.0, { arm_r: [-1.25, -0.25, 0.10], fore_r: [-0.45, 0, 0], hand: [0.2, 0.2, 0.1, 0.3] }],
      [1.0, { arm_r: [-1.20, -0.25, 0.10], fore_r: [-0.50, 0, 0] }],
    ], face: [[0, { frown: 0.3, browIn: 0.5 }]] },
    leanIn: { dur: 2.0, fade: [0.5, 0.6], mask: 'spine', keys: [
      [0.0, { spine1: [0.10, 0, 0], spine2: [0.08, 0, 0], head: [-0.08, 0, 0] }],
      [1.0, { spine1: [0.10, 0, 0], spine2: [0.08, 0, 0], head: [-0.08, 0, 0] }],
    ] },
    leanBack: { dur: 2.0, fade: [0.5, 0.6], mask: 'spine', keys: [
      [0.0, { spine1: [-0.07, 0, 0], spine2: [-0.05, 0, 0], head: [0.04, 0, 0] }],
      [1.0, { spine1: [-0.07, 0, 0], spine2: [-0.05, 0, 0], head: [0.04, 0, 0] }],
    ] },
    glance: { dur: 1.2, fade: [0.15, 0.3], mask: 'head', keys: [
      [0.0, {}], [0.25, { head: [0.04, 0.45, 0] }], [0.75, { head: [0.04, 0.42, 0] }], [1.0, {}],
    ], face: [[0, { squint: 0.25 }]] },
    flinch: { dur: 0.7, fade: [0.04, 0.4], mask: 'upper', prio: 3, keys: [
      [0.0, {}], [0.2, Object.assign(both((k, s) => ({ ['clav_' + k]: [0, 0, s * 0.18] })),
                                   { spine2: [0.12, 0, 0], head: [0.25, 0, 0] })], [1.0, {}],
    ], face: [[0.15, { lids: 0.8, frown: 0.6 }], [1, {}]] },
    /* Writing a name on the slate: head down to the table, a hand that
       moves in small loops. The runtime keeps the hands on the table. */
    write: { dur: 3.2, fade: [0.4, 0.5], mask: 'upper', keys: (() => {
      const k = [];
      for (let i = 0; i <= 10; i++) {
        k.push([i / 10, { head: [0.38, 0, 0.02], spine2: [0.12, 0, 0], hand_r: [0.15 * Math.sin(i * 1.7), 0.1 * Math.cos(i * 2.3), 0],
                          handR: [0.8, 0.6, 0.6, 0] }]);
      }
      return k;
    })(), face: [[0, { browIn: 0.4, squint: 0.3 }]] },
    /* The hand-over. A letter and the poison are the same envelope and
       must be the same movement, so this is the only clip either uses. */
    handover: { dur: 1.4, fade: [0.25, 0.35], mask: 'r', reach: 'r', keys: [
      [0.0, { handR: [0.6, 0.5, 0.3, 0] }], [1.0, { handR: [0.6, 0.5, 0.3, 0] }],
    ] },
    work: { dur: 1.6, fade: [0.4, 0.5], mask: 'upper', loop: true, keys: (() => {
      const k = [];
      for (let i = 0; i <= 4; i++) {
        const a = i % 2 ? 1 : 0;
        k.push([i / 4, { head: [0.32, 0, 0], spine2: [0.12, 0, 0],
                         arm_l: [-0.70 - 0.08 * a, 0.40, -0.05], fore_l: [-1.20 + 0.1 * a, -0.3, 0],
                         arm_r: [-0.70 - 0.08 * (1 - a), -0.40, 0.05], fore_r: [-1.20 + 0.1 * (1 - a), 0.3, 0],
                         hand: [0.55, 0.45, 0.4, 0] }]);
      }
      return k;
    })(), face: [[0, { browIn: 0.35 }]] },
    pickUp: { dur: 1.6, fade: [0.3, 0.4], mask: 'upper', keys: [
      [0.0, {}], [0.45, { spine1: [0.35, 0, 0], spine2: [0.25, 0, 0], head: [0.15, 0, 0], arm_r: [-0.70, -0.1, 0.05],
                          fore_r: [-0.30, 0, 0], handR: [0.2, 0.2, 0.1, 0.3] }],
      [0.6, { spine1: [0.35, 0, 0], spine2: [0.25, 0, 0], head: [0.15, 0, 0], arm_r: [-0.70, -0.1, 0.05],
              fore_r: [-0.30, 0, 0], handR: [0.7, 0.6, 0.5, 0] }],
      [1.0, {}],
    ] },
  };
  /* Aliases the scenes may reach for. */
  ACTS.shock = Object.assign({}, ACTS.gasp, { prio: 4 });
  ACTS.distress = ACTS.handsFace;

  const MOODS = {
    calm:    { fidget: 0.5, slump: 0.00, smile: 0.30, brow: 0.0, browIn: 0.0, lids: 0.06 },
    nervous: { fidget: 1.8, slump: 0.03, smile: 0.00, brow: 0.3, browIn: 0.4, lids: 0.00 },
    smug:    { fidget: 0.4, slump: -0.03, smile: 0.35, brow: 0.0, browIn: 0.0, lids: 0.22, smirk: 0.5 },
    sad:     { fidget: 0.4, slump: 0.08, smile: 0.00, brow: 0.0, browIn: 0.6, lids: 0.25, frown: 0.5 },
    angry:   { fidget: 1.1, slump: -0.02, smile: 0.00, brow: 0.0, browIn: 0.9, lids: 0.15, frown: 0.3 },
    happy:   { fidget: 0.8, slump: -0.02, smile: 0.7, brow: 0.2, browIn: 0.0, lids: 0.1 },
  };

  return { STAND, SEAT_HANDS, TALK, ACTS, MOODS, TALK_NAMES: Object.keys(TALK) };
})();
