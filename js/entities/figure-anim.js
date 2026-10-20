/* ------------------------------------------------------------------
   figure-anim.js — how the people move.

   The old rig was one long function of sines. It walked on a clock, so
   anybody whose speed changed — every networked player, every bot that
   slowed for a door — slid across the floor; it sat by snapping between
   two poses; and its only acting was an arm that pumped while its owner
   talked.

   This is a small layered pose blender, run once a frame per figure:

     1. locomotion  feet placed by two-bone IK on a gait whose phase is
                    driven by how far the figure has actually moved, so
                    a planted foot stays planted at any speed, through
                    any stop, start or change of pace
     2. posture     standing at ease, or sitting — a real transition
                    that leans forward, lowers onto the chair and
                    settles, with the feet planted throughout
     3. acts        keyed clips from `figure-clips.js` — nods, shrugs,
                    gasps, a hand-over — blended over whatever is
                    underneath and owning only the bones they name
     4. talk        while somebody has the floor, a run of different
                    gestures and a jaw that moves in syllables
     5. layers      breathing, weight shifts and fidgets on noise, a
                    mood that tilts the whole posture and face
     6. gaze        eyes first, then head, neck and chest, each with a
                    lag and a limit, and saccades while it is idle
     7. IK          legs always; arms for hands on a table or a lap,
                    reaching to a point, pointing at a person

   It only ever reads `want`s the façade (`figure.js`) writes, and does
   all the smoothing itself, so a caller cannot fight it.
------------------------------------------------------------------ */
const FigureAnim = (() => {

  const SK = FigureSkeleton;
  const I = SK.INDEX;
  const NB = SK.NAMES.length;
  const SIDES = SK.SIDES;
  const Y = SK.Y;
  const LEG_A = SK.THIGH, LEG_B = SK.SHIN;
  const ARM_A = SK.UPPER, ARM_B = SK.FORE + 0.004;
  const PELVIS_OVER_HIP = Y.pelvis - Y.hip;     // 0.075
  const TAU = Math.PI * 2;
  const ss = (a, b, x) => U.smoothstep(a, b, x);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* scratch */
  const V = () => new THREE.Vector3();
  const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _p = V(), _t = V(), _k = V();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  const _eu = new THREE.Euler();
  const X1 = new THREE.Vector3(1, 0, 0);

  /* Value noise, smooth, per figure: fidgets that do not move in step
     across a table of eight. */
  function noise(x, seed) {
    const i = Math.floor(x), f = x - i;
    const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
    const u = f * f * (3 - 2 * f);
    return lerp(h(i), h(i + 1), u) * 2 - 1;
  }

  function create(fig) {
    const seed = Math.random() * 1000;
    return {
      seed,
      rot: new Float32Array(NB * 3),
      pel: new THREE.Vector3(0, Y.pelvis, 0),
      phase: Math.random(), gait: 0, speed: 0, dirX: 0, dirZ: 1, turn: 0,
      lastPos: null, lastYaw: 0, parent: null,
      seatT: 0, chairW: 0,
      acts: [], talk: null, talkNext: 1.2,
      jaw: 0, jawWant: 0, jawNext: 0,
      blink: 1.5 + Math.random() * 3, lid: 0,
      sacc: [0, 0], saccNext: 1, eyeY: 0, eyeX: 0,
      neckY: 0, neckX: 0, chestY: 0,
      face: { smile: 0, frown: 0, brow: 0, browIn: 0, jaw: 0, lids: 0, squint: 0, smirk: 0 },
      hands: { l: [0.35, 0.3, 0.2, 0.1], r: [0.35, 0.3, 0.2, 0.1] },
      seatVariant: 0, seatVarNext: 20 + Math.random() * 20, seatPose: [0, 0, 0],
      fidgetNext: 15 + Math.random() * 20,
      gazeRate: 0.7 + Math.random() * 0.6,
      reachW: 0, pointW: 0, armIK: { l: 0, r: 0 },
      cheerAct: null,
    };
  }

  /* ---------------- acts ---------------- */

  function maskBones(clip) {
    if (clip._bones) return clip._bones;
    const set = new Set(), hands = new Set();
    for (const [, pose] of clip.keys) {
      for (const k in pose) {
        if (k === 'hand') { hands.add('l'); hands.add('r'); }
        else if (k === 'handL') hands.add('l');
        else if (k === 'handR') hands.add('r');
        else if (k in I) set.add(k);
      }
    }
    if (clip.reach) hands.add(clip.reach);
    clip._bones = set;
    clip._hands = hands;
    clip._arms = { l: set.has('arm_l') || set.has('fore_l') || clip.reach === 'l',
                   r: set.has('arm_r') || set.has('fore_r') || clip.reach === 'r' };
    return set;
  }

  function startAct(A, name, opts = {}) {
    const clip = FigureClips.ACTS[name] || FigureClips.TALK[name];
    if (!clip) return 0;
    maskBones(clip);
    const prio = clip.prio || 1;
    // anything this one overlaps, at no higher priority, gives way
    for (const a of A.acts) {
      if (a.out) continue;
      const shared = [...clip._bones].some(b => a.clip._bones.has(b))
        || (clip.reach && a.clip.reach);
      if (shared && (a.clip.prio || 1) <= prio) a.out = true;
    }
    const dur = clip.dur * (opts.speed ? 1 / opts.speed : 1);
    A.acts.push({ name, clip, t: 0, dur, w: 0, out: false, opts,
                  hold: opts.hold !== undefined ? opts.hold : !!clip.hold,
                  loop: opts.loop !== undefined ? opts.loop : !!clip.loop });
    return dur;
  }

  function stopAct(A, name) {
    for (const a of A.acts) if (!name || a.name === name) a.out = true;
  }

  /* A cubic through the keys rather than an ease into each one: a
     smoothstep per span brought the hand to a dead stop at every key,
     several times a second. A key that is a turning point (both
     neighbours on the same side) still stops, as a real reversal does;
     anything on the way through keeps its speed. `val(m)` is the value
     at key m. */
  function through(keys, i, u, val) {
    const n = keys.length;
    const u0 = keys[i - 1][0], u1 = keys[i][0], h = u1 - u0;
    const v0 = val(i - 1), v1 = val(i);
    if (h <= 0) return v1;
    const tan = (m) => {
      if (m <= 0 || m >= n - 1) return 0;
      const a = val(m - 1), b = val(m), c = val(m + 1);
      if ((b - a) * (c - b) <= 0) return 0;
      return (c - a) / (keys[m + 1][0] - keys[m - 1][0]);
    };
    const s = U.clamp((u - u0) / h, 0, 1), s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * tan(i - 1)
         + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * tan(i);
  }

  /* Sample a clip at u in [0, 1]: per bone, through the keys, a key
     that leaves the bone out meaning "what is underneath". */
  function sampleInto(A, clip, u, w, R) {
    const keys = clip.keys;
    let i = 1;
    while (i < keys.length - 1 && keys[i][0] < u) i++;
    if (keys.length < 2) i = 0;
    for (const name of clip._bones) {
      const j = I[name] * 3;
      for (let c = 0; c < 3; c++) {
        const base = R[j + c];
        const val = (m) => { const v = keys[m][1][name]; return v ? v[c] : base; };
        R[j + c] = lerp(base, i ? through(keys, i, u, val) : val(0), w);
      }
    }
    for (const side of ['l', 'r']) {
      const nm = side === 'l' ? 'handL' : 'handR';
      if (!keys.some(([, p]) => p[nm] || p.hand)) continue;
      const H = A.handWant[side];
      for (let c = 0; c < 4; c++) {
        const base = H[c];
        const val = (m) => { const v = keys[m][1][nm] || keys[m][1].hand; return v ? v[c] : base; };
        H[c] = lerp(base, i ? through(keys, i, u, val) : val(0), w);
      }
    }
    if (clip.face) {
      const fk = clip.face;
      let j = 1;
      while (j < fk.length - 1 && fk[j][0] < u) j++;
      const [f0, q0] = fk[j - 1], [f1, q1] = fk[Math.min(j, fk.length - 1)];
      const kk = f1 > f0 ? U.clamp((u - f0) / (f1 - f0), 0, 1) : 1;
      for (const key in A.faceWant) {
        const a = q0[key] || 0, b = q1[key] || 0;
        const v = lerp(a, b, kk);
        if (v) A.faceWant[key] = lerp(A.faceWant[key], v, w);
      }
    }
  }

  /* ---------------- the two-bone solver ----------------
     In the first bone's parent space: `root` is that bone's joint, the
     target is where the end should be, `pole` is where the middle joint
     should point. Returns the first bone's local quaternion (its bind
     points down -y) and the bend angle at the middle joint. `away`
     means the limb folds away from the pole (an arm: the elbow points
     back and the forearm comes forward) rather than toward it. */
  function solve2(root, target, a, b, pole, away, outQ) {
    _d.copy(target).sub(root);
    let L = _d.length();
    const min = Math.abs(a - b) + 1e-4, max = (a + b) * 0.9995;
    L = U.clamp(L, min, max);
    const dir = _d.normalize();
    const cosA = U.clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    _e.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (_e.lengthSq() < 1e-8) _e.set(0, 0, 1).addScaledVector(dir, -dir.z);
    _e.normalize();
    // the upper bone's direction
    _k.copy(dir).multiplyScalar(cosA).addScaledVector(_e, sinA).normalize();
    const yAx = _a.copy(_k).negate();
    const zAx = _b.copy(_e).multiplyScalar(away ? -1 : 1);
    zAx.addScaledVector(yAx, -zAx.dot(yAx)).normalize();
    const xAx = _c.crossVectors(yAx, zAx).normalize();
    _m.makeBasis(xAx, yAx, zAx);
    outQ.setFromRotationMatrix(_m);
    const cosB = U.clamp((a * a + b * b - L * L) / (2 * a * b), -1, 1);
    return Math.PI - Math.acos(cosB);
  }

  /* ---------------- the frame ---------------- */

  function update(fig, dt, t) {
    const d = fig.userData;
    const A = d.anim, rig = d.rig;
    if (!A || !rig) return;
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    const R = A.rot;
    const B = rig.bones;
    const s = fig.scale.y || 1;

    /* -------- wants, smoothed -------- */
    d.speaking = U.damp(d.speaking || 0, d.speakWant || 0, 6, dt);
    d.holding = U.damp(d.holding || 0, d.holdWant || 0, 7, dt);
    d.lean = U.damp(d.lean || 0, d.leanWant || 0, 5, dt);
    const seatRate = 1 / 1.05;
    const sw = d.seatWant || 0;
    A.seatT = sw > A.seatT ? Math.min(sw, A.seatT + dt * seatRate) : Math.max(sw, A.seatT - dt * seatRate * 1.15);
    const seat = ss(0, 1, A.seatT);
    const bump = Math.sin(Math.PI * A.seatT);
    d.seated = A.seatT;            // the nametag reads this
    const sp = d.speaking, hold = d.holding;

    if (d.cheerWant && !A.cheerAct) A.cheerAct = startAct(A, 'cheer', { loop: true }) && true;
    if (!d.cheerWant && A.cheerAct) { stopAct(A, 'cheer'); A.cheerAct = null; }
    d.cheering = d.cheerWant ? 1 : 0;

    /* -------- root motion --------
       Measured, in the figure's own frame and at its own scale, so the
       gait knows how far it has really gone. A jump of more than a
       metre in a frame is a teleport, not a stride. */
    let moved = 0, lx = 0, lz = 0, dyaw = 0;
    if (!A.lastPos || A.parent !== fig.parent) {
      A.lastPos = fig.position.clone(); A.lastYaw = fig.rotation.y; A.parent = fig.parent;
    } else {
      const dx = fig.position.x - A.lastPos.x, dz = fig.position.z - A.lastPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.0) {
        const ry = fig.rotation.y, c = Math.cos(ry), sn = Math.sin(ry);
        lz = (dx * sn + dz * c) / s;
        lx = (dx * c - dz * sn) / s;
        moved = dist / s;
      }
      dyaw = U.wrapAngle(fig.rotation.y - A.lastYaw);
      A.lastPos.copy(fig.position); A.lastYaw = fig.rotation.y;
    }
    const cmd = Math.max(0, d.moveCmd || 0) / s;
    let travel = moved, speedNow = dt > 0 ? moved / dt : 0;
    if (moved < 1e-5 && cmd > 0.05) {
      // a treadmill: told to walk, going nowhere (the dressing room)
      travel = cmd * dt; speedNow = cmd; lx = 0; lz = travel;
    }
    A.speed = U.damp(A.speed, speedNow, speedNow > A.speed ? 6 : 4, dt);
    if (travel > 1e-6) {
      const l = Math.hypot(lx, lz) || 1;
      A.dirX = U.damp(A.dirX, lx / l, 10, dt);
      A.dirZ = U.damp(A.dirZ, lz / l, 10, dt);
      const n = Math.hypot(A.dirX, A.dirZ) || 1;
      A.dirX /= n; A.dirZ /= n;
    }
    A.turn = U.damp(A.turn, dt > 0 ? dyaw / dt : 0, 8, dt);
    const v = A.speed;
    const turning = v < 0.3 && Math.abs(A.turn) > 0.7 ? 1 : 0;
    const walking = (v > 0.08 ? 1 : 0) * (1 - seat);
    A.gait = U.damp(A.gait, Math.max(walking, turning * 0.8 * (1 - seat)), walking ? 7 : 5, dt);
    const gw = A.gait;
    const run = ss(2.4, 5.0, v);
    const k1 = U.clamp(v / 1.4, 0, 1), k2 = U.clamp((v - 1.4) / 3.6, 0, 1);
    const cycle = SK.H0 * (0.30 + 0.50 * k1 + 0.90 * k2);
    if (travel > 1e-6) A.phase = (A.phase + travel / Math.max(0.3, cycle)) % 1;
    if (turning && v < 0.3) A.phase = (A.phase + Math.abs(dyaw) * 0.35) % 1;
    const ph = A.phase;
    const stepLen = turning && v < 0.3 ? 0.10 : cycle;
    /* The share of the cycle a foot spends down is whatever the leg can
       actually cover from in front of the hips to behind them, over the
       cycle's length: at a stroll most of it, at a run little more than
       a third. A fixed share is how a fast walk asked a planted foot to
       be a metre behind the hips, and the IK dragged it instead. */
    const front0 = 0.27 + 0.18 * run, back0 = 0.40 + 0.12 * run;
    const fs = U.clamp((front0 + back0) / Math.max(0.3, stepLen), 0.32, 0.62);
    A.fs = fs;

    /* chair: someone standing at a chair stands in front of it */
    if (moved > 0.002 || v > 0.3) d.chair = d.seatWant ? d.chair : false;
    A.chairW = U.damp(A.chairW, d.chair && v < 0.3 ? 1 : 0, 4, dt);
    const chairZ = 0.30 * A.chairW;

    /* -------- base pose -------- */
    R.fill(0);
    const set = (name, x, y, z) => { const j = I[name] * 3; R[j] = x; R[j + 1] = y; R[j + 2] = z; };
    const add = (name, x, y, z) => { const j = I[name] * 3; R[j] += x; R[j + 1] += y; R[j + 2] += z; };
    for (const name in FigureClips.STAND) set(name, ...FigureClips.STAND[name]);

    A.handWant = { l: [0.35, 0.3, 0.2, 0.1], r: [0.35, 0.3, 0.2, 0.1] };
    A.faceWant = { smile: 0, frown: 0, brow: 0, browIn: 0, jaw: 0, lids: 0, squint: 0, smirk: 0 };
    const mood = FigureClips.MOODS[d.mood] || FigureClips.MOODS.calm;
    for (const k in A.faceWant) if (mood[k]) A.faceWant[k] = mood[k];

    /* idle: weight from foot to foot, breathing, the odd shift. Kept
       small and slow — people at rest are mostly still, and a body that
       never stops drifting reads as something wrong with it. */
    const idle = 1 - gw;
    const sway = noise(t * 0.11, A.seed) * idle * (1 - seat);
    const breath = Math.sin(t * (0.9 + run * 1.8) + A.seed);
    const fid = mood.fidget;
    A.pel.set(sway * 0.008, Y.pelvis, 0);
    add('pelvis', 0, noise(t * 0.08, A.seed + 3) * 0.015 * idle, sway * 0.018);
    add('spine1', 0, 0, -sway * 0.012);
    add('spine2', breath * 0.008 + mood.slump, noise(t * 0.09, A.seed + 5) * 0.010 * idle, -sway * 0.01);
    add('chest', breath * 0.007, 0, 0);
    add('neck', mood.slump * 0.5, 0, 0);
    add('head', mood.slump * 0.4, 0, 0);
    for (const [k, sd] of SIDES) {
      add('clav_' + k, 0, 0, sd * (breath * 0.012 - mood.slump * 0.6));
      add('arm_' + k, noise(t * 0.12 * fid, A.seed + 7 + sd) * 0.012 * idle, 0, 0);
      add('fore_' + k, noise(t * 0.10 * fid, A.seed + 11 + sd) * 0.018 * idle, 0, 0);
    }

    /* -------- the walk -------- */
    const feet = { l: _p.set(0, 0, 0).clone(), r: _p.set(0, 0, 0).clone() };
    const footPitch = { l: 0, r: 0 }, toeBend = { l: 0, r: 0 };
    let drop = 0;
    /* Each foot is planted by the ball of the foot. The ball is state,
       not a formula: once down it moves only by exactly how far the
       figure itself moved this frame (and turns against the figure's
       own turn), so it stays put on the floor whatever the pace does —
       a networked player who speeds up mid-stride does not drag a foot.
       The heel comes up as the foot falls behind, and the ankle, which
       is what the IK places, rises and rolls forward over that ball;
       that roll is most of why a stride reaches as far as it does. */
    const BALL_Z = 0.135, BALL_Y = 0.026, ANK_Y = Y.ankle - BALL_Y;
    const ankleOverBall = (pitch, out) => {
      const c = Math.cos(pitch), sn = Math.sin(pitch);
      out.y = BALL_Y + ANK_Y * c + BALL_Z * sn;
      out.z = -BALL_Z * c + ANK_Y * sn;
      return out;
    };
    const D = SK.dims(d.girth || 1);
    const front = Math.min(front0, stepLen * fs * 0.45);
    const heelMax = 0.85 + 0.25 * run;
    const width = D.ankleX * (1 - 0.25 * run);
    const tmp = { y: 0, z: 0 };
    if (!A.feet) {
      A.feet = {};
      for (const [k, sd] of SIDES) A.feet[k] = { bx: sd * width, bz: BALL_Z, stance: true, ax: 0, ay: 0, az: 0 };
    }
    // the figure turned: everything planted turns the other way in its frame
    if (dyaw) {
      const c = Math.cos(-dyaw), sn = Math.sin(-dyaw);
      for (const k in A.feet) {
        const F = A.feet[k];
        const x = F.bx, z = F.bz;
        F.bx = x * c + z * sn; F.bz = -x * sn + z * c;
      }
    }
    // how far the floor moved under a planted foot, in the figure's frame
    const slideX = travel > 1e-6 ? (moved > 1e-5 ? lx : 0) : 0;
    const slideZ = travel > 1e-6 ? (moved > 1e-5 ? lz : travel) : 0;
    for (const [k, sd] of SIDES) {
      const F = A.feet[k];
      const p = (ph + (k === 'l' ? 0 : 0.5)) % 1;
      let ax, ay, az, pitch = 0, toe = 0;
      if (p < fs) {
        const u = p / fs;
        if (!F.stance) {
          // down: where the swing put it
          F.stance = true;
          F.bx = sd * width + A.dirX * front;
          F.bz = A.dirZ * front + BALL_Z;
        } else {
          F.bx -= slideX; F.bz -= slideZ;
        }
        const heel = ss(0.45, 1.0, u) * heelMax;
        ankleOverBall(heel, tmp);
        ax = F.bx; ay = tmp.y; az = F.bz + tmp.z;
        pitch = -heel + ss(0.14, 0, u) * 0.18;          // heel strike: toe still up
        toe = heel * 0.85;
        F.ax = ax; F.ay = ay; F.az = az;
      } else {
        const u = (p - fs) / (1 - fs);
        if (F.stance) { F.stance = false; F.sx = F.ax; F.sy = F.ay; F.sz = F.az; }
        const e = ss(0, 1, u);
        ax = lerp(F.sx, sd * width + A.dirX * front, e);
        az = lerp(F.sz, A.dirZ * front, e);
        const lift = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (turning && v < 0.3 ? 0.05 : 0.07 + 0.12 * run)
                   * Math.min(1, v / 0.5 + turning);
        ay = lerp(F.sy, Y.ankle, ss(0, 0.8, u)) + lift;
        pitch = lerp(-heelMax, 0.20, ss(0.1, 0.85, u));
        toe = (1 - ss(0.0, 0.35, u)) * heelMax * 0.6;
      }
      // standing still, the feet are under the hips; walking, where the gait put them
      feet[k].set(lerp(sd * D.ankleX, ax, gw), lerp(Y.ankle, ay, gw), lerp(0, az, gw) + chairZ);
      footPitch[k] = pitch * gw;
      toeBend[k] = toe * gw;
      // how far the hips must come down for this foot to stay reachable
      const hx = feet[k].x - sd * D.hipX, hz = feet[k].z - chairZ;
      const reach = (LEG_A + LEG_B) * 0.992;
      const h2 = reach * reach - hx * hx - hz * hz;
      const maxHip = feet[k].y + Math.sqrt(Math.max(0.01, h2));
      drop = Math.max(drop, Y.hip - maxHip);
    }
    // a capped drop: past it the foot gives a little rather than the hips
    drop = Math.min(drop, 0.0065 + (0.028 + 0.05 * run) * gw);
    const bob = (0.5 - 0.5 * Math.cos(ph * TAU * 2)) * (0.012 + 0.035 * run) * gw;
    A.pel.y -= drop + bob;
    A.pel.z += chairZ;
    const sw1 = Math.cos(ph * TAU);   // +1 when the left foot is forward
    add('pelvis', 0.04 * gw + 0.10 * run * gw, 0.11 * sw1 * gw * (1 - run * 0.4), -0.035 * Math.sin(ph * TAU * 2 + 0.6) * gw);
    add('spine1', 0.03 * gw + 0.05 * run * gw, -0.05 * sw1 * gw, -d.lean * 0.10 * gw);
    add('spine2', 0.02 * run * gw, -0.04 * sw1 * gw, -d.lean * 0.06 * gw);
    add('chest', 0, -0.06 * sw1 * gw, 0);
    add('head', -0.03 * gw - 0.06 * run * gw, 0.05 * sw1 * gw, 0);
    const armSwing = (0.22 + 0.40 * run) * gw * Math.min(1, v / 0.9 + 0.2);
    for (const [k, sd] of SIDES) {
      const a = (k === 'l' ? 1 : -1) * sw1 * armSwing;
      add('arm_' + k, a, 0, sd * 0.04 * gw);
      add('fore_' + k, -(0.10 + 0.20 * Math.max(0, -a) / Math.max(0.05, armSwing) + 1.2 * run) * gw, 0, 0);
    }

    /* -------- sitting -------- */
    let seatHands = null;
    if (A.seatT > 0.001) {
      const so = d.seatOpts || {};
      const S0 = SK.SEAT;
      const seatHip = so.hip || S0.hip, seatZ = so.hipZ !== undefined ? so.hipZ : S0.hipZ;
      const footZ = so.footZ || S0.footZ, footX = so.footX || S0.footX;
      A.pel.x = lerp(A.pel.x, 0, seat);
      A.pel.y = lerp(A.pel.y, seatHip + PELVIS_OVER_HIP, seat) - bump * 0.02;
      A.pel.z = lerp(A.pel.z, seatZ, ss(0.1, 0.9, A.seatT)) + bump * 0.05;
      for (const [k, sd] of SIDES) {
        feet[k].x = lerp(feet[k].x, sd * footX, seat);
        feet[k].y = lerp(feet[k].y, Y.ankle, seat);
        feet[k].z = lerp(feet[k].z, footZ, seat);
        footPitch[k] *= 1 - seat; toeBend[k] *= 1 - seat;
      }
      // the lean forward to get up or down, and the settle
      add('pelvis', -0.03 * seat, 0, 0);
      add('spine1', 0.03 * seat, 0, 0);
      add('spine1', 0.32 * bump, 0, 0);
      add('spine2', 0.24 * bump, 0, 0);
      add('head', -0.30 * bump, 0, 0);
      for (const [k, sd] of SIDES) add('arm_' + k, -0.45 * bump, 0, sd * 0.06 * bump);
      // seated idles: upright, lean back, lean in on the elbows
      A.seatVarNext -= dt;
      if (seat > 0.95 && A.seatVarNext < 0) {
        A.seatVariant = Math.floor(Math.random() * 3);
        A.seatVarNext = 25 + Math.random() * 30;
      }
      const target = [[0, 0, 0], [-0.06, 0.03, 0], [0.08, -0.01, 0.04]][A.seatVariant];
      for (let c = 0; c < 3; c++) A.seatPose[c] = U.damp(A.seatPose[c], target[c], 0.8, dt);
      add('spine1', A.seatPose[0] * seat, 0, 0);
      add('spine2', A.seatPose[2] * seat, 0, 0);
      add('head', -A.seatPose[0] * 0.6 * seat, 0, 0);
      const H = FigureClips.SEAT_HANDS[so.table ? 'table' : 'lap'];
      seatHands = { l: H.l, r: H.r, w: seat * (1 - bump * 0.7) };
      for (const [k] of SIDES) A.handWant[k] = [0.25, 0.2, 0.2, 0.15];
    }

    /* -------- carrying, and the throw -------- */
    let th = 0;
    if (d.throwT >= 0) {
      d.throwT += dt;
      const k = d.throwT / d.throwDur;
      if (k >= 1) d.throwT = -1;
      else if (k < WIND) th = -Math.sin((k / WIND) * Math.PI * 0.5);
      else th = Math.sin(((k - WIND) / (1 - WIND)) * Math.PI);
    }
    d.throwPhase = th;
    const back = Math.max(0, -th), thru = Math.max(0, th);
    if (hold > 0.001 || back > 0 || thru > 0) {
      const j = I.arm_r * 3, f = I.fore_r * 3;
      const hx = lerp(R[j], -1.15, hold), hz = lerp(R[j + 2], 0.12, hold), hf = lerp(R[f], -0.95, hold);
      R[j] = hx + back * 1.5 - thru * 1.2;
      R[j + 1] = lerp(R[j + 1], -0.25, hold) + back * 0.3;
      R[j + 2] = hz + back * 0.25;
      R[f] = hf - back * 0.7 + thru * 0.6;
      add('chest', back * 0.10 - thru * 0.16, -back * 0.30 + thru * 0.22, 0);
      add('spine2', back * -0.06 + thru * 0.10, 0, 0);
      A.handWant.r = [0.85, 0.85, 0.6, 0];
      add('arm_l', -0.25 * hold, 0, 0);
      add('fore_l', -0.45 * hold, 0, 0);
    }

    /* -------- talking --------
       The odd gesture, not one after another: most of a sentence is
       said with the hands still, and a gesture is a half-size beat
       (smaller again seated) rather than the full clip. */
    if (sp > 0.05) {
      A.talkNext -= dt;
      if (A.talkNext <= 0) {
        const names = FigureClips.TALK_NAMES;
        const busy = A.acts.some(a => !a.out && a.clip._arms && (a.clip._arms.r || a.clip._arms.l) && a.clip !== A.talkClip);
        if (!busy && hold < 0.3 && Math.random() < 0.45) {
          const name = names[Math.floor(Math.random() * names.length)];
          A.talkClip = FigureClips.TALK[name];
          startAct(A, name, { speed: 0.75 + Math.random() * 0.25, amp: seat > 0.5 ? 0.4 : 0.55 });
        }
        A.talkNext = 3 + Math.random() * 4;
      }
      // the head moves a little with the words
      add('head', 0.012 * noise(t * 0.9, A.seed + 13) * sp - 0.015 * sp, 0.018 * noise(t * 0.6, A.seed + 17) * sp, 0);
      A.faceWant.brow += sp * 0.10 * (0.5 + 0.5 * noise(t * 0.5, A.seed + 19));
    }

    /* -------- fidgets -------- */
    A.fidgetNext -= dt * fid;
    if (A.fidgetNext < 0 && sp < 0.1 && gw < 0.2 && !A.acts.some(a => !a.out)) {
      const pool = d.mood === 'nervous' ? ['neckRub', 'glance', 'shake', 'glance']
                 : seat > 0.5 ? ['glance', 'nod', 'leanIn', 'leanBack'] : ['glance', 'crossArms', 'nod', 'handsHips'];
      const name = pool[Math.floor(Math.random() * pool.length)];
      if (name === 'crossArms' || name === 'handsHips') startAct(A, name, { hold: false, speed: 0.35 });
      else startAct(A, name, { speed: 0.7, amp: 0.6 });
      A.fidgetNext = 20 + Math.random() * 30;
    }

    /* Seated, the arms' own pose underneath is the hands-on-the-table
       one the IK last found, not arms hanging at the sides; otherwise a
       gesture blends up from the hanging pose while the IK lets go, and
       the hand sags halfway up before it rises. */
    if (seatHands && A.seatArm) {
      for (const [k] of SIDES) {
        const C = A.seatArm[k];
        if (!C) continue;
        for (const [bone, e] of [['arm_' + k, C.arm], ['fore_' + k, C.fore]]) {
          const j = I[bone] * 3;
          for (let c = 0; c < 3; c++) R[j + c] = lerp(R[j + c], e[c], seatHands.w);
        }
      }
    }

    /* -------- acts -------- */
    const armOver = { l: 0, r: 0 };
    let reach = null;
    for (const a of A.acts) {
      a.t += dt;
      // an arm never snaps into a gesture: a quarter of a second at the least (0.35 s)
      const [fi0, fo] = a.clip.fade;
      const fi = a.clip._arms && (a.clip._arms.l || a.clip._arms.r) ? Math.max(0.35, fi0) : fi0;
      let u = a.t / a.dur;
      if (a.loop) u %= 1;
      else if (u >= 1) { u = 1; if (!a.hold) a.out = true; }
      const want = a.out ? 0 : 1;
      // at full weight it stays there: a bare else here took a fade-out
      // step every other frame and shook every act at 30 Hz
      if (want > a.w) a.w = Math.min(1, a.w + dt / Math.max(0.01, fi));
      else if (want < a.w) a.w = Math.max(0, a.w - dt / Math.max(0.01, fo));
      if (a.w <= 0) continue;
      const w = ss(0, 1, a.w) * (a.opts.amp !== undefined ? a.opts.amp : 1);
      sampleInto(A, a.clip, u, w, R);
      for (const k of ['l', 'r']) if (a.clip._arms[k]) armOver[k] = Math.max(armOver[k], w);
      if (a.clip.reach) reach = { side: a.clip.reach, w, target: a.opts.target || null };
    }
    A.acts = A.acts.filter(a => !(a.out && a.w <= 0));

    /* -------- gaze --------
       The head turns at its own unhurried pace (each figure a little
       different, so a table does not swivel as one) and never further
       than a neck goes; past that the eyes do the rest, and past those
       the person simply is not looking. */
    const yawWant = U.clamp(U.wrapAngle(d.yawWant || 0), -1.4, 1.4);
    const pitchWant = U.clamp(d.pitchWant || 0, -0.4, 0.4);
    const gr = A.gazeRate || 1;
    A.eyeY = U.damp(A.eyeY, yawWant, 12, dt);
    A.eyeX = U.damp(A.eyeX, pitchWant, 12, dt);
    A.neckY = U.damp(A.neckY, U.clamp(yawWant, -1.05, 1.05), 2.4 * gr, dt);
    A.neckX = U.damp(A.neckX, pitchWant, 2.4 * gr, dt);
    A.chestY = U.damp(A.chestY, yawWant, 1.2 * gr, dt);
    const chestShare = 0.22 * (1 - gw), headY = A.neckY;
    add('chest', 0, A.chestY * chestShare, 0);
    add('neck', -A.neckX * 0.35, (headY - A.chestY * chestShare) * 0.40, 0);
    add('head', -A.neckX * 0.65, (headY - A.chestY * chestShare) * 0.60, 0);
    // what the eyes still have to do once the head has turned
    A.saccNext -= dt;
    if (A.saccNext < 0) {
      A.sacc = [(Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.025];
      A.saccNext = 1.5 + Math.random() * 3.5;
    }
    const eyeY = U.clamp(A.eyeY - headY + A.sacc[0] * (1 - sp * 0.5), -0.3, 0.3);
    const eyeX = U.clamp(A.eyeX - A.neckX + A.sacc[1], -0.22, 0.22);
    for (const [k] of SIDES) set('eye_' + k, -eyeX, eyeY, 0);

    /* -------- the face -------- */
    const F = A.face;
    for (const key in F) F[key] = U.damp(F[key], A.faceWant[key] || 0, key === 'jaw' ? 20 : 6, dt);
    // syllables
    A.jawNext -= dt;
    if (A.jawNext <= 0) {
      const lv = d.voiceLevel;
      A.jawWant = sp > 0.1
        ? (lv !== null && lv !== undefined ? U.clamp(lv * 1.4, 0, 1) * (0.55 + 0.45 * Math.random())
                                            : (Math.random() < 0.18 ? 0 : 0.25 + 0.75 * Math.pow(Math.random(), 0.8)))
        : 0;
      A.jawNext = 0.09 + Math.random() * 0.12;
    }
    A.jaw = U.damp(A.jaw, A.jawWant * sp, 16, dt);
    set('jaw', (A.jaw * 0.17 + F.jaw * 0.32), 0, 0);
    // blink, and lids that follow the eyes down a little
    A.blink -= dt;
    const shut = A.blink < 0 ? 1 : 0;
    if (A.blink < -0.12) A.blink = (d.mood === 'nervous' ? 1.0 : 2.0) + Math.random() * 4.0;
    A.lid = U.damp(A.lid, shut, 32, dt);
    const lidX = Math.max(-0.2, A.lid * 1.0 + F.lids * 0.45 + F.squint * 0.25 + eyeX * 0.55) + Math.min(0, F.lids * 0.3);
    for (const [k] of SIDES) set('lid_' + k, lidX, 0, 0);

    /* -------- hands -------- */
    const pointTo = d.pointAt || null, reachTo = d.reachAt || null;
    A.pointW = U.damp(A.pointW, pointTo ? 1 : 0, 5, dt);
    A.reachW = U.damp(A.reachW, reachTo ? 1 : 0, 5, dt);
    if (A.pointW > 0.05) {
      const H = A.handWant.r;
      H[0] = lerp(H[0], 1.15, A.pointW); H[1] = lerp(H[1], 0, A.pointW);
      H[2] = lerp(H[2], 0.85, A.pointW); H[3] = lerp(H[3], 0, A.pointW);
    }
    for (const k of ['l', 'r']) {
      const H = A.hands[k], W = A.handWant[k];
      for (let c = 0; c < 4; c++) H[c] = U.damp(H[c], W[c], 9, dt);
    }

    /* -------- write it to the bones -------- */
    for (let i = 0; i < NB; i++) {
      const b = B[i];
      b.rotation.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
    }
    for (const [k, sd] of SIDES) {
      const [curl, idx, thumb, spread] = A.hands[k];
      const cz = -sd;
      B[I['fing1_' + k]].rotation.set(spread * 0.12, 0, cz * curl * 1.05);
      B[I['fing2_' + k]].rotation.set(0, 0, cz * curl * 1.25);
      B[I['index1_' + k]].rotation.set(-spread * 0.16, 0, cz * idx * 1.0);
      B[I['index2_' + k]].rotation.set(0, 0, cz * idx * 1.2);
      B[I['thumb1_' + k]].rotation.set(-0.1 * thumb, sd * 0.55 * thumb, cz * 0.35 * thumb);
      B[I['thumb2_' + k]].rotation.set(0, 0, cz * 0.6 * thumb);
      // the face's own little bones
      const bind = rig.bind;
      const mb = bind['mouth_' + k], mh = bind.head;
      const smile = F.smile + (k === 'r' ? F.smirk : F.smirk * 0.15);
      B[I['mouth_' + k]].position.set(
        mb[0] - mh[0] + sd * 0.0025 * smile, mb[1] - mh[1] + 0.0032 * smile - 0.0030 * F.frown, mb[2] - mh[2] - 0.0015 * smile);
      const bb = bind['brow_' + k];
      const browUp = F.brow + (k === 'l' && F.smirk ? 0.4 * F.smirk : 0);
      B[I['brow_' + k]].position.set(bb[0] - mh[0] - sd * 0.0018 * F.browIn, bb[1] - mh[1] + 0.0038 * browUp - 0.0016 * F.browIn,
                                     bb[2] - mh[2]);
      B[I['brow_' + k]].rotation.set(0, 0, sd * (0.28 * F.browIn - 0.08 * browUp));
    }
    B[I.pelvis].position.copy(A.pel);

    /* -------- the legs, by IK -------- */
    const pelvis = B[I.pelvis];
    pelvis.updateMatrix();
    _q.copy(pelvis.quaternion);
    _qa.copy(_q).invert();
    for (const [k, sd] of SIDES) {
      const thigh = B[I['thigh_' + k]], shin = B[I['shin_' + k]], foot = B[I['foot_' + k]];
      // the foot target into pelvis space
      _t.copy(feet[k]).sub(A.pel).applyQuaternion(_qa);
      // knee forward, a little out; up as well when seated
      _p.set(sd * 0.08, seat * 0.6, 1).applyQuaternion(_qa);
      const flex = solve2(thigh.position, _t, LEG_A, LEG_B, _p, false, thigh.quaternion);
      shin.quaternion.setFromAxisAngle(X1, flex);
      // the foot, flat to the floor in the figure's frame, pitched for the step
      _q2.setFromEuler(_eu.set(-footPitch[k], 0, 0));
      _q3.copy(_q).multiply(thigh.quaternion).multiply(shin.quaternion).invert();
      foot.quaternion.copy(_q3.multiply(_q2));
      B[I['toe_' + k]].rotation.set(-toeBend[k], 0, 0);
    }

    /* -------- the arms, by IK, where something asks -------- */
    const anyArm = (seatHands && seatHands.w > 0.01) || A.pointW > 0.01 || A.reachW > 0.01 || reach;
    if (anyArm) {
      fig.updateMatrixWorld(true);
      for (const [k, sd] of SIDES) {
        let w = 0;
        const target = _t;
        if (seatHands && seatHands.w > 0.01) {
          const h = seatHands[k];
          target.set(h[0], h[1], h[2]);
          // a seated person leans over the table a little with their posture
          target.z += A.seatPose[2] * 0.4;
          fig.localToWorld(target);
          // let go of the table ahead of the gesture taking the arm,
          // or the two blends pull the hand down halfway up
          w = seatHands.w * (1 - ss(0, 0.6, armOver[k]));
        }
        const shoulderW = _c;
        B[I['arm_' + k]].getWorldPosition(shoulderW);
        if (k === 'r' && A.pointW > 0.01 && (d.pointAt || A.lastPoint)) {
          if (d.pointAt) A.lastPoint = d.pointAt.clone();
          const P = A.lastPoint;
          _e.copy(P).sub(shoulderW).normalize();
          const len = (ARM_A + ARM_B) * s * 0.985;
          _k.copy(shoulderW).addScaledVector(_e, len);
          target.lerp(_k, w > 0 ? A.pointW : 1);
          w = Math.max(w, A.pointW);
        }
        if (reach && reach.side === k || (k === 'r' && A.reachW > 0.01)) {
          const rw = reach && reach.side === k ? reach.w : A.reachW;
          const P = (reach && reach.target) || reachTo;
          if (P) {
            _e.copy(P).sub(shoulderW);
            const max = (ARM_A + ARM_B) * s * 0.985;
            if (_e.length() > max) _e.setLength(max);
            _k.copy(shoulderW).add(_e);
          } else {
            _k.set(sd * 0.12, 1.12, 0.48);
            fig.localToWorld(_k);
          }
          target.lerp(_k, w > 0 ? rw : 1);
          w = Math.max(w, rw);
        }
        if (w <= 0.001) continue;
        const clav = B[I['clav_' + k]], arm = B[I['arm_' + k]], fore = B[I['fore_' + k]];
        _m2.copy(clav.matrixWorld).invert();
        const local = _d.copy(target).applyMatrix4(_m2);
        // the elbow points back, out and down
        _p.set(sd * 0.55, -0.45, -1).transformDirection(fig.matrixWorld).transformDirection(_m2);
        _qb.copy(arm.quaternion);
        const flex = solve2(arm.position, local.clone(), ARM_A, ARM_B, _p, true, _qa);
        arm.quaternion.slerpQuaternions(_qb, _qa, w);
        _q2.setFromAxisAngle(X1, -flex);
        fore.quaternion.slerp(_q2, w);
        A.armIK[k] = w;
        // the table pose, kept for the next frame's base (above) — only
        // while nothing but the table has the arm
        if (seatHands && seatHands.w > 0.9 && armOver[k] < 0.01 && A.pointW < 0.01 && A.reachW < 0.01 && !reach) {
          A.seatArm = A.seatArm || {};
          const C = A.seatArm[k] || (A.seatArm[k] = { arm: [0, 0, 0], fore: [0, 0, 0] });
          _eu.setFromQuaternion(_qa, 'XYZ'); C.arm[0] = _eu.x; C.arm[1] = _eu.y; C.arm[2] = _eu.z;
          _eu.setFromQuaternion(_q2, 'XYZ'); C.fore[0] = _eu.x; C.fore[1] = _eu.y; C.fore[2] = _eu.z;
        }
      }
    }
  }

  const WIND = 0.52;

  return { create, update, startAct, stopAct, WIND, _solve2: solve2 };
})();
