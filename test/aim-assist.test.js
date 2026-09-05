/* ------------------------------------------------------------------
   aim-assist.test.js — the shootout's touch aim assist, as numbers.

   The assist is the one place where the game moves the crosshair for
   the player, so the whole of its licence has to be written down and
   held to. It is a curve on the drag and nothing else: it never
   touches an arrow, it never turns a thumb that is not already
   turning, it never turns more than a third as far as the thumb did,
   and it never turns towards a dove.

   Those are the four properties below, plus the two that make it
   worth having at all: near a bird a drag is scaled down, and a drag
   in roughly the right direction closes on the bird faster than the
   same drag would on its own.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section, report } = H;

/* Just enough THREE for the scan: a vector with the seven methods the
   assist and `_dirFrom` use between them. */
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new V3(this.x, this.y, this.z); }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  divideScalar(s) { this.x /= s; this.y /= s; this.z /= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  length() { return Math.hypot(this.x, this.y, this.z); }
}

const ctx = H.load(['js/core/util.js', 'js/missions/shootout.js'], {
  THREE: { Vector3: V3, Quaternion: class {}, },
  ShootoutTwists: { byId: () => null, draw: () => [] },
  ForestConditions: {},
  Input: { isTouch: true },
  /* the file registers its sounds and its mission as it loads; neither
     has anything to do with the arithmetic under test */
  AudioBus: { define: () => {}, play: () => {} },
  Missions: { register: () => {}, add: () => {} },
  document: { getElementById: () => null, querySelector: () => null },
});
const { ShootoutMission, U } = ctx;
const A = ShootoutMission.CONFIG.assist;
const assist = ShootoutMission.prototype._aimAssist;

/* A mission reduced to exactly what the assist reads. */
function rig(birds, yaw = 0, pitch = 0) {
  return {
    C: ShootoutMission.CONFIG,
    state: 'live',
    flags: {},
    yaw, pitch,
    camera: { position: new V3(0, 0, 0) },
    flock: { list: birds },
    _tmpV: new V3(), _tmpV2: new V3(), _assistTo: new V3(), _fwd: new V3(),
    _dirFrom: ShootoutMission.prototype._dirFrom,
  };
}

/* A bird at a given angle off the crosshair, at a given range. Yaw
   zero looks down -z, which is what `_dirFrom` says. */
function bird(offYaw, offPitch, dist, extra = {}) {
  const cp = Math.cos(offPitch);
  return Object.assign({
    alive: true, dying: false, guard: false,
    type: { boss: false },
    pos: new V3(-Math.sin(offYaw) * cp * dist,
                Math.sin(offPitch) * dist,
                -Math.cos(offYaw) * cp * dist),
    vel: new V3(),
  }, extra);
}

const DT = 1 / 60;
const run = (r, dy, dp) => assist.call(r, DT, dy, dp);

section('the assist only ever helps a thumb that is moving');

test('a still thumb is never turned', () => {
  const r = rig([bird(0.01, 0, 60)]);
  const out = run(r, 0, 0);
  eq(out.yaw, 0, 'yaw untouched');
  eq(out.pitch, 0, 'pitch untouched');
});

test('a crawling thumb is under the idle floor and gets no magnet', () => {
  const r = rig([bird(0.03, 0, 60)]);
  const crawl = A.idle * DT * 0.5;
  const out = run(r, crawl, 0);
  // stickiness still applies — it can only ever make the drag smaller
  ok(Math.abs(out.yaw) <= Math.abs(crawl) + 1e-12, 'no magnet under the floor');
});

section('what it does near a bird');

test('a drag next to a bird counts for less than the same drag in the open', () => {
  const near = rig([bird(0, 0, 60)]);
  const open = rig([]);
  const drag = 0.05;
  const a = run(near, drag, 0), b = run(open, drag, 0);
  eq(b.yaw, drag, 'nothing in the cone leaves the drag exactly alone');
  ok(Math.abs(a.yaw) < Math.abs(b.yaw), 'inside the cone the drag is scaled down');
  ok(Math.abs(a.yaw) > Math.abs(b.yaw) * (1 - A.slow) - 1e-9,
     'and never scaled down by more than the config says');
});

test('a drag towards a bird closes on it faster than one without help', () => {
  const off = A.cone * 0.6;
  const withHelp = rig([bird(off, 0, 60)]);
  const alone = rig([]);
  // dragging the crosshair right, which is the way the bird is
  const a = run(withHelp, off * 0.25, 0);
  const b = run(alone, off * 0.25, 0);
  ok(a.yaw > b.yaw, 'the assist adds to a turn already going the right way');
});

/* At pitch zero a bird placed `off` radians to the side is exactly
   `off` off the crosshair, so the stickiness the assist will apply is
   known exactly and whatever is left over is the magnet. */
const stickyPart = (drag, off) => drag * (1 - A.slow * (1 - off / A.cone));
const magnetPart = (out, drag, off) => Math.abs(out.yaw) - stickyPart(drag, off);

test('the turn it adds is never more than its share of your own', () => {
  for (const off of [0.001, 0.01, 0.03, 0.07]) {
    for (const drag of [0.002, 0.02, 0.2]) {
      const added = magnetPart(run(rig([bird(off, 0, 60)]), drag, 0), drag, off);
      ok(added > 0, 'off ' + off + ' drag ' + drag + ': there is a magnet at all');
      ok(added <= drag * A.share + 1e-9,
         'off ' + off + ' drag ' + drag + ': added ' + added.toFixed(5));
    }
  }
});

test('and never more than the per-second ceiling', () => {
  // a drag far too big for the share cap to be the binding one
  const off = 0.02, drag = 1.0;
  const added = magnetPart(run(rig([bird(off, 0, 60)]), drag, 0), drag, off);
  ok(added <= A.pull * DT + 1e-9,
     'rad/s ceiling holds (' + added.toFixed(5) + ' <= ' + (A.pull * DT).toFixed(5) + ')');
});

section('what it will not do');

test('a dove is never assisted', () => {
  const drag = 0.05;
  const out = run(rig([bird(0.01, 0, 60, { guard: true })]), drag, 0);
  eq(out.yaw, drag, 'a dove in the cone is as if the sky were empty');
});

test('a bird outside the cone is not assisted', () => {
  const drag = 0.05;
  const out = run(rig([bird(A.cone * 1.2, 0, 60)]), drag, 0);
  eq(out.yaw, drag, 'past the rim there is nothing');
});

test('point blank and out of range are both left alone', () => {
  const drag = 0.05;
  eq(run(rig([bird(0.01, 0, A.minRange - 1)]), drag, 0).yaw, drag, 'too close');
  eq(run(rig([bird(0.01, 0, A.maxRange + 10)]), drag, 0).yaw, drag, 'too far');
});

test('a dead or dying bird is not a target', () => {
  const drag = 0.05;
  eq(run(rig([bird(0.01, 0, 60, { alive: false })]), drag, 0).yaw, drag, 'dead');
  eq(run(rig([bird(0.01, 0, 60, { dying: true })]), drag, 0).yaw, drag, 'dying');
});

test('nothing happens outside a live round, or when a twist forbids it', () => {
  const drag = 0.05;
  const between = rig([bird(0, 0, 60)]); between.state = 'between';
  eq(run(between, drag, 0).yaw, drag, 'between rounds');
  const off = rig([bird(0, 0, 60)]); off.flags = { noAssist: true };
  eq(run(off, drag, 0).yaw, drag, 'noAssist');
});

section('the lead stays the player\'s');

test('holding still ahead of a moving bird is not dragged back onto it', () => {
  // the crosshair is held ahead of the bird, thumb off the glass
  const b = bird(A.cone * 0.5, 0, 60);
  b.vel = new V3(-40, 0, 0);
  const out = run(rig([b]), 0, 0);
  eq(out.yaw, 0, 'no thumb, no turn');
});

test('the magnet aims at the bird, never at where the arrow would meet it', () => {
  /* A crossing bird: if the assist were solving the intercept it would
     pull *ahead* of the bird, which is up-range of its own position. It
     does not, so the turn is exactly towards where the bird is now. */
  const off = A.cone * 0.5;
  const b = bird(off, 0, 60);
  b.vel = new V3(-60, 0, 0);            // flying hard to the right
  const moving = run(rig([b]), 0.02, 0);
  const still = run(rig([bird(off, 0, 60)]), 0.02, 0);
  ok(Math.abs(moving.yaw - still.yaw) < 1e-12, 'velocity does not enter the sum');
});

section('the geometry holds up');

test('a bird above the crosshair pulls the aim up, not sideways', () => {
  const r = rig([bird(0, A.cone * 0.5, 60)]);
  const out = run(r, 0, 0.02);
  ok(out.pitch > 0.02 * (1 - A.slow), 'pitch is pulled towards the bird');
  ok(Math.abs(out.yaw) < 1e-12, 'and nothing sideways is invented');
});

test('looking steeply up does not blow the yaw correction up', () => {
  /* Yaw is a smaller circle the higher you look, so the assist works in
     real angles and divides back out at the end. The share cap is what
     that has to survive: a division by cos(pitch) inside a quantity that
     was multiplied by it cancels, and the added yaw stays a third of the
     drag at every pitch the mission allows. */
  const off = A.cone * 0.4, drag = 0.02;
  for (const pitch of [0, 0.6, 1.15]) {
    const r = rig([], 0, pitch);
    const cp = Math.cos(pitch);
    r.flock.list = [{
      alive: true, dying: false, guard: false, type: { boss: false },
      pos: new V3(-Math.sin(off) * cp * 60, Math.sin(pitch) * 60,
                  -Math.cos(off) * cp * 60),
      vel: new V3(),
    }];
    const out = run(r, drag, 0);
    const added = Math.abs(out.yaw) - stickyPart(drag, off);
    ok(added > 0, 'pitch ' + pitch + ': the magnet still acts');
    ok(added <= drag * A.share + 1e-9,
       'pitch ' + pitch + ': yaw stays bounded (' + added.toFixed(5) + ')');
    ok(Number.isFinite(out.yaw) && Number.isFinite(out.pitch), 'finite');
  }
});

test('the ceiling scales with the frame, so 30fps and 120fps agree', () => {
  const turnOver = (dt, steps) => {
    const r = rig([bird(A.cone * 0.7, 0, 60)]);
    let yaw = 0;
    for (let i = 0; i < steps; i++) {
      r.yaw = yaw;
      // the bird is fixed in the world, so re-place it about the new yaw
      const off = A.cone * 0.7 - yaw;
      r.flock.list = [bird(off, 0, 60)];
      yaw += assist.call(r, dt, 0.6 * dt, 0).yaw;
    }
    return yaw;
  };
  const slow = turnOver(1 / 30, 30);
  const fast = turnOver(1 / 120, 120);
  /* Not identical, and not meant to be: the curve is sampled once a
     frame, so a long frame samples a moving quantity more coarsely.
     A few percent over a whole second of unbroken drag is far below
     the bow's own sway, and it is one-sided — a slow machine is not
     handed a better assist than a fast one by any amount that matters. */
  ok(Math.abs(slow - fast) < 0.08 * Math.abs(slow),
     'a second of the same drag lands in the same place (' +
     slow.toFixed(4) + ' vs ' + fast.toFixed(4) + ')');
});

test('the assist alone can never reach a bird a thumb is not moving towards', () => {
  /* Dragging away from the bird: the magnet may bend the drag, but the
     crosshair still ends up further from the bird than it started. */
  const off = A.cone * 0.8;
  const r = rig([bird(off, 0, 60)]);
  const out = run(r, -0.05, 0);
  ok(out.yaw < 0, 'a turn away from the bird is still a turn away');
});

report();
