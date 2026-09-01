/* ------------------------------------------------------------------
   swim.test.js — the dive's feel, as numbers.

   There is no browser here and there is not meant to be one. The swim
   is a closed piece of arithmetic — a shaped impulse, some drag, a
   breath that empties — so it can be integrated offline and *asserted*
   rather than played and hoped about. This file is where the stroke,
   the chain and the air were tuned, and it is what stops the next
   person moving one of those numbers by accident.

   Four properties, in the order they matter:

     1. a stroke is a burst you can feel arrive, and the glide after it
        is long
     2. the chain is worth exactly what the TUNE block says it is —
        `topSpeed` unchained, `flowTop` chained — and off the beat is
        slower but never broken
     3. the same swim happens at 20 fps and at 120 fps
     4. the dive profile: the shelf is cheap, the wreck is comfortable,
        and the bottom of the trench is only reachable on the beat
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section, report } = H;

/* Just enough THREE for a body in water: vectors, a transform node and
   an Euler. Nothing in swimmer.js's physics path touches anything
   else, and if that ever changes this is where it will say so. */
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  length() { return Math.hypot(this.x, this.y, this.z); }
}
class Euler {
  constructor() { this.x = this.y = this.z = 0; }
  set(x, y, z, o) { this.x = x; this.y = y; this.z = z; this.order = o; return this; }
}
class Quat { setFromEuler() { return this; } }
class Group {
  constructor() {
    this.position = new V3(); this.rotation = new Euler();
    this.quaternion = new Quat(); this.children = []; this.userData = {};
  }
  add(o) { this.children.push(o); return this; }
}

const ctx = H.load(['js/core/util.js', 'js/entities/swimmer.js'], {
  THREE: new Proxy({ Vector3: V3, Group, Euler, Quaternion: Quat, Object3D: Group },
                   { get: (t, k) => (k in t ? t[k] : function () { return new Group(); }) }),
  // a swimmer built with `figure:false` never reaches for the rig
  Figure: { build: () => { throw new Error('the maths tests do not build a body'); } },
});
const Swimmer = ctx.Swimmer;
const T = Swimmer.TUNE;
const BPM = 96, SPB = 60 / BPM;

/* ---------------- the rig ---------------- */

// open water: a flat lid at zero, a seabed a long way under it
const sea = (floor = -90) => ({ heightAt: () => floor, surfaceAt: () => 0 });

function diver(tune) {
  const sw = new Swimmer({ figure: false, tune: tune || {} });
  sw.place(0, -8, 0, 0);
  return sw;
}

/* Drive one for `secs`. `strokes(t)` returns the time of the next
   stroke after `t`, or null for none; `aim(sw, t)` may point them
   somewhere. Everything is expressed against the clock rather than
   against the frame, which is what makes the same script runnable at
   any frame rate. */
function swim(sw, o) {
  const opt = Object.assign({ secs: 10, dt: 1 / 60, world: sea(), phase: 0,
                              strokes: null, aim: null, onFrame: null }, o);
  const ctl = { move: null, yaw: 0, pitch: 0, stroke: false,
                beat: { spb: SPB, sinceBeat: 0 } };
  let t = 0, next = opt.strokes ? opt.strokes(-1e-9) : null;
  const seen = { peak: 0, sum: 0, n: 0, strokes: 0, onBeat: 0, drowned: false };
  while (t < opt.secs - 1e-9) {
    const dt = Math.min(opt.dt, opt.secs - t);
    ctl.stroke = false;
    if (next !== null && t + 1e-9 >= next) { ctl.stroke = true; next = opt.strokes(next); }
    ctl.beat.sinceBeat = (t + opt.phase) % SPB;
    ctl.yaw = 0; ctl.pitch = 0; ctl.move = null;
    if (opt.aim) opt.aim(sw, t, ctl);
    sw.update(dt, ctl, opt.world);
    // the stroke is a rising edge: let the button go before the next frame
    ctl.stroke = false; sw.wasStroke = false;
    if (sw.stroked) seen.strokes++;
    if (sw.onBeat) seen.onBeat++;
    if (sw.air <= 0) seen.drowned = true;
    seen.peak = Math.max(seen.peak, sw.speed);
    seen.sum += sw.speed * dt; seen.n += dt;
    t += dt;
    if (opt.onFrame) opt.onFrame(t, sw);
  }
  seen.avg = seen.n ? seen.sum / seen.n : 0;
  return seen;
}

// a stroke every `p` seconds, for ever
const every = (p) => (t) => Math.ceil((t + 1e-9) / p) * p;
// no air, no drowning: for measuring speed and nothing else
const noAir = { airDrain: 0, airStroke: 0 };

/* ================================================================== */

section('the stroke: a burst, then a long glide');

test('one kick delivers exactly the impulse the TUNE block promises', () => {
  // the shape is sin(pi*u), whose integral over the kick is 2/pi of a
  // flat one — so a kick from rest is worth kickAccel * kickTime * 2/pi
  const want = T.kickAccel * T.kickTime * (2 / Math.PI);
  const sw = diver(noAir);
  const r = swim(sw, { secs: T.kickTime, strokes: (t) => (t < 0 ? 0 : null) });
  ok(Math.abs(r.peak - want) / want < 0.06,
     'one kick peaked at ' + r.peak.toFixed(2) + ', wanted about ' + want.toFixed(2));
});

test('a stroke from rest is worth about half of top speed', () => {
  const sw = diver(noAir);
  const r = swim(sw, { secs: 1.0, strokes: (t) => (t < 0 ? 0 : null) });
  const frac = r.peak / T.topSpeed;
  ok(frac > 0.42 && frac < 0.62,
     'a single stroke reached ' + Math.round(frac * 100) + '% of top speed');
});

test('the glide is long: half the speed is still there two seconds later', () => {
  const sw = diver(noAir);
  swim(sw, { secs: T.kickTime, strokes: (t) => (t < 0 ? 0 : null) });
  const after = sw.speed;
  swim(sw, { secs: 2.0, strokes: () => null });
  const kept = sw.speed / after;
  ok(kept > 0.42, 'only ' + Math.round(kept * 100) + '% of the burst survived the glide');
  ok(kept < 0.85, 'the glide never gives anything back: ' + Math.round(kept * 100) + '%');
});

test('a stroke inside the cooldown does not fire', () => {
  const sw = diver(noAir);
  const r = swim(sw, { secs: 1.0, dt: 1 / 120, strokes: every(T.strokeCd * 0.5) });
  ok(r.strokes <= Math.ceil(1.0 / T.strokeCd) + 1,
     'the mash guard let ' + r.strokes + ' strokes through in a second');
});

section('the chain: the beat is a ceiling, never a gate');

test('an on-beat run settles at flowTop', () => {
  const sw = diver(noAir);
  const r = swim(sw, { secs: 40, strokes: every(SPB) });
  const err = Math.abs(r.avg - T.flowTop) / T.flowTop;
  ok(err < 0.05, 'chained average was ' + r.avg.toFixed(2) + ', flowTop is ' + T.flowTop);
  eq(Math.round(sw.flow * 100) / 100, 1, 'the chain should be pinned at full');
});

test('an off-beat run settles at topSpeed and never lights the chain', () => {
  const sw = diver(noAir);
  const r = swim(sw, { secs: 40, strokes: every(SPB), phase: SPB * 0.5 });
  const err = Math.abs(r.avg - T.topSpeed) / T.topSpeed;
  ok(err < 0.06, 'unchained average was ' + r.avg.toFixed(2) + ', topSpeed is ' + T.topSpeed);
  ok(sw.flow < 0.05, 'an off-beat run lit the chain: ' + sw.flow.toFixed(2));
  ok(r.avg > T.topSpeed * 0.85, 'off the beat still has to swim properly');
});

/* Mashing is *allowed* — strokeCd sits just under the eighth at 96 BPM
   on purpose, so a panicking player can double-stroke. What it must
   not be is the best play. Half of a double-time spray lands on the
   beat by arithmetic, so the masher keeps a third of a chain; they
   simply swim slower than someone playing the tune and pay twice over
   for the privilege. */
const MASH = every(1 / 30);           // a button pressed as fast as a hand can

test('mashing beats nothing and loses to the beat', () => {
  const mash = diver(noAir);
  const rm = swim(mash, { secs: 40, strokes: MASH });
  const beat = diver(noAir);
  const rb = swim(beat, { secs: 40, strokes: every(SPB) });
  ok(rm.avg < rb.avg * 0.88,
     'mashing (' + rm.avg.toFixed(2) + ') came too close to the chain (' + rb.avg.toFixed(2) + ')');
  ok(rm.avg > T.topSpeed * 0.9, 'mashing has to still work: ' + rm.avg.toFixed(2));
  ok(mash.flow < 0.6, 'a spray should never hold most of a chain: ' + mash.flow.toFixed(2));
});

test('mashing costs far more air than swimming on the beat', () => {
  const mash = diver();
  swim(mash, { secs: 12, strokes: MASH });
  const beat = diver();
  swim(beat, { secs: 12, strokes: every(SPB) });
  ok(mash.air < beat.air - 0.08,
     'mash left ' + mash.air.toFixed(2) + ', beat left ' + beat.air.toFixed(2));
});

test('the chain builds in a few beats and is gone a couple of seconds after you stop', () => {
  const sw = diver(noAir);
  let full = null;
  swim(sw, { secs: 8, strokes: every(SPB),
             onFrame: (t, s) => { if (full === null && s.flow >= 0.999) full = t; } });
  ok(full !== null && full < 3, 'the chain took ' + full + 's to light');
  swim(sw, { secs: 2.5, strokes: () => null });
  ok(sw.flow < 0.05, 'the chain outlived the swimming: ' + sw.flow.toFixed(2));
});

test('one missed beat costs most of the chain, not all of it', () => {
  const sw = diver(noAir);
  swim(sw, { secs: 4, strokes: every(SPB) });
  const before = sw.flow;
  // a single stroke landed square between two beats, far enough after
  // the last one that the cooldown is not what stops it
  swim(sw, { secs: 1.0, strokes: (t) => (t < 0 ? SPB * 0.5 : null) });
  ok(sw.flow < before * 0.5, 'a missed beat barely dented it');
  ok(sw.flow > 0.01, 'a missed beat wiped the chain out entirely');
});

section('frame rate: the same swim at 20 fps and at 120');

/* Strokes land on exact multiples of 0.05 s, which is a whole frame at
   every rate under test, and the aim is driven as a *rate* — so all
   three runs are being given the identical script rather than three
   different ones that happen to look alike. */
function scripted(dt) {
  const sw = diver();
  const world = sea(-70);
  const ctl = { move: null, yaw: 0, pitch: 0, stroke: false,
                beat: { spb: SPB, sinceBeat: 0 } };
  let t = 0;
  while (t < 12 - 1e-9) {
    const tick = Math.round(t / 0.05);
    ctl.stroke = Math.abs(t / 0.05 - tick) < 1e-9 && tick % 13 === 0;
    ctl.beat.sinceBeat = t % SPB;
    ctl.yaw = 0.45 * dt;
    ctl.pitch = 0.10 * dt * Math.sin(t * 0.7);
    sw.update(dt, ctl, world);
    ctl.stroke = false; sw.wasStroke = false;
    t += dt;
  }
  return sw;
}

test('position after twelve scripted seconds agrees inside 1%', () => {
  const a = scripted(1 / 120), b = scripted(1 / 60), c = scripted(1 / 20);
  const travel = Math.hypot(a.pos.x, a.pos.y + 8, a.pos.z);
  const gap = (x, y) => Math.hypot(x.pos.x - y.pos.x, x.pos.y - y.pos.y, x.pos.z - y.pos.z);
  ok(travel > 20, 'the script has to actually go somewhere: ' + travel.toFixed(1) + 'm');
  ok(gap(a, b) / travel < 0.01, '120 vs 60 drifted ' + (gap(a, b) / travel * 100).toFixed(2) + '%');
  ok(gap(a, c) / travel < 0.01, '120 vs 20 drifted ' + (gap(a, c) / travel * 100).toFixed(2) + '%');
});

test('the breath empties at the same rate however fast the frames come', () => {
  const a = scripted(1 / 120), c = scripted(1 / 20);
  ok(Math.abs(a.air - c.air) < 0.002,
     'air ' + a.air.toFixed(4) + ' vs ' + c.air.toFixed(4));
});

section('the dive profile: where the air actually goes');

/* A whole trip, played the way a diver plays one: a few strokes to get
   pointed down, a free fall once the water stops holding you up, a
   pause at the bottom to find the thing, then a climb out carrying it.
   This is the test the tier depths and the air constants were tuned
   against, so moving either should light it up. */
function trip(o) {
  const opt = Object.assign({ target: -14, chests: 1, dwell: 3,
                              onBeat: true, tune: {} }, o);
  const sw = new Swimmer({ figure: false, tune: opt.tune });
  sw.place(0, T.surfaceY, 0, 0);
  const world = sea(opt.target - 8);
  const ctl = { move: null, yaw: 0, pitch: 0, stroke: false,
                beat: { spb: SPB, sinceBeat: 0 } };
  const dt = 1 / 60;
  let t = 0, phase = 'down', dwell = 0, next = 0, down = 0, strokes = 0;
  while (t < 120) {
    let fire = t + 1e-9 >= next;
    if (fire) next += SPB;
    // on the way down you stop working once the fall has taken over
    if (fire && phase === 'down' && down >= 3 && sw.vel.y < -3.5) fire = false;
    ctl.stroke = fire;
    if (fire) { strokes++; if (phase === 'down') down++; }
    ctl.beat.sinceBeat = (t + (opt.onBeat ? 0 : SPB * 0.5)) % SPB;
    sw.pitchAim = phase === 'down' ? -1.25 : (phase === 'up' ? 1.25 : 0);
    sw.update(dt, ctl, world);
    ctl.stroke = false; sw.wasStroke = false;
    if (sw.air <= 0) return { t, air: -1, drowned: true, strokes };
    if (phase === 'down' && sw.pos.y <= opt.target) { phase = 'grab'; dwell = 0; }
    else if (phase === 'grab') {
      dwell += dt;
      if (dwell >= opt.dwell) { sw.carried = opt.chests; phase = 'up'; }
    } else if (phase === 'up' && sw.pos.y >= T.surfaceY - 0.05) break;
    t += dt;
  }
  return { t, air: sw.air, drowned: false, strokes };
}

test('the shelf is cheap enough to work all day', () => {
  const r = trip({ target: -12, chests: 4, dwell: 2, onBeat: false });
  ok(!r.drowned, 'a full carry off the shelf drowned');
  ok(r.air > 0.55, 'a shelf trip left only ' + r.air.toFixed(2) + ' of the bar');
  ok(r.t < 9, 'a shelf trip took ' + r.t.toFixed(1) + 's; the loop has to be quick');
});

test('the wreck is comfortable on the beat and survivable off it', () => {
  const on = trip({ target: -28, chests: 2, dwell: 3, onBeat: true });
  const off = trip({ target: -28, chests: 2, dwell: 3, onBeat: false });
  ok(!on.drowned && on.air > 0.35, 'chained wreck trip left ' + on.air.toFixed(2));
  ok(!off.drowned, 'the wreck must not be gated behind the beat');
  ok(off.air < on.air - 0.06, 'the beat has to be worth something at the wreck');
});

test('the trench is only a round trip if you are on the beat', () => {
  const on = trip({ target: -46, chests: 1, dwell: 4, onBeat: true });
  const off = trip({ target: -46, chests: 1, dwell: 4, onBeat: false });
  ok(!on.drowned, 'a chained trench trip should come home');
  ok(on.air < 0.35, 'a trench trip left ' + on.air.toFixed(2) + '; it must not be comfortable');
  ok(off.drowned || off.air < 0.06,
     'swimming the trench off the beat left ' + off.air.toFixed(2) + ' — far too safe');
});

test('the bottom of the trench with a full carry is a coin-flip', () => {
  const quick = trip({ target: -50, chests: 4, dwell: 1.5, onBeat: true });
  const slow = trip({ target: -50, chests: 4, dwell: 4.5, onBeat: true });
  ok(!quick.drowned, 'found fast, a full trench carry has to be possible');
  ok(quick.air < 0.32, 'even the perfect trench run left ' + quick.air.toFixed(2));
  ok(slow.drowned || slow.air < 0.05,
     'dithering at fifty metres left ' + slow.air.toFixed(2) + ' — there is no risk here');
});

test('every extra chest is paid for in air, drag and kick length', () => {
  const one = trip({ target: -42, chests: 1, dwell: 3 });
  const four = trip({ target: -42, chests: 4, dwell: 3 });
  ok(four.air < one.air - 0.03,
     'four chests cost only ' + (one.air - four.air).toFixed(3) + ' of the bar');
});

test('a gasp at the surface refills fast, but not instantly', () => {
  const sw = diver();
  sw.air = 0.1;
  sw.place(0, T.surfaceY, 0, 0);
  swim(sw, { secs: 0.4, strokes: () => null });
  ok(sw.air > 0.4 && sw.air < 0.85, 'after four tenths of a second: ' + sw.air.toFixed(2));
  swim(sw, { secs: 1.6, strokes: () => null });
  ok(sw.air > 0.95, 'two seconds up top has to be a full bar: ' + sw.air.toFixed(2));
});

test('blacking out is a single event, not a stream of them', () => {
  const sw = diver();
  sw.air = 0.004;
  let fired = 0;
  swim(sw, { secs: 2, world: sea(-60), strokes: () => null,
             aim: (s) => { s.pos.y = -40; },
             onFrame: (t, s) => { if (s.blackout) fired++; } });
  eq(fired, 1, 'blackout should be raised exactly once');
});

section('the world pushes back');

test('the surface is a lid: you break it, you do not leave through it', () => {
  const sw = diver();
  sw.place(0, -6, 0, 0);
  sw.pitchAim = 1.3;
  const r = swim(sw, { secs: 4, strokes: every(SPB),
                       aim: (s) => { s.pitchAim = 1.3; } });
  ok(sw.pos.y <= T.surfaceY + 1e-6, 'the diver flew: y = ' + sw.pos.y.toFixed(2));
  ok(r.strokes > 3, 'the diver never actually swam up');
  ok(sw.air > 0.9, 'surfacing has to give the bar back');
});

test('skimming the seabed keeps your speed; you never go through it', () => {
  const sw = diver(noAir);
  sw.place(0, -12.6, 0, 0);
  // a shallow run just over the sand, which is how the shelf is worked
  swim(sw, { secs: 4, world: sea(-14), strokes: every(SPB),
             aim: (s) => { s.pitchAim = -0.22; } });
  ok(sw.pos.y >= -14 + T.bodyRadius - 1e-6, 'the diver went through the sand');
  ok(sw.speed > T.topSpeed * 0.6,
     'skimming the sand cost too much speed: ' + sw.speed.toFixed(2));
});

test('a glancing boulder turns you rather than pinning you', () => {
  const world = Object.assign(sea(-60), { colliders: [{ x: 5.6, z: 30, r: 6 }] });
  const sw = diver(noAir);
  sw.place(0, -20, 0, 0);
  swim(sw, { secs: 6, world, strokes: every(SPB) });
  const d = Math.hypot(sw.pos.x - 5.6, sw.pos.z - 30);
  ok(d >= 6 + T.bodyRadius - 0.01, 'the diver ended up inside the rock: ' + d.toFixed(2));
  ok(sw.speed > 4, 'a graze should barely slow a diver: ' + sw.speed.toFixed(2));
  ok(Math.abs(sw.pos.x) > 0.5, 'the rock should have pushed the line out');
});

test('swimming head-on into rock stops you, and says so', () => {
  const world = Object.assign(sea(-60), { colliders: [{ x: 0, z: 26, r: 6 }] });
  const sw = diver(noAir);
  sw.place(0, -20, 0, 0);
  let bumps = 0;
  swim(sw, { secs: 5, world, strokes: every(SPB),
             onFrame: (t, s) => { if (s.bumped) bumps++; } });
  ok(bumps > 0, 'running into a wreck has to raise a bump');
  ok(sw.pos.z <= 26 - 6 - T.bodyRadius + 0.01, 'the diver ended up inside the rock');
});

/* ------------------------------------------------------------------
   The loch got a shore, and a shore is a set of cases the water alone
   never produced: ground above the waterline, a body out of the water
   entirely, and a diver at rest who has to still be there a minute
   later. Each of these is a bug that shipped.
   ------------------------------------------------------------------ */
section('the shore, and the surface as a place rather than a ceiling');

// a beach: ground that rises through the waterline going +z, and
// shelves away into the loch going -z
const beach = (slope = 0.25) => ({
  heightAt: (x, z) => (z > 0 ? -1 + z * slope : -1 + z * 0.5),
  surfaceAt: () => 0,
});

test('a diver at rest floats instead of quietly sinking away', () => {
  const sw = diver(noAir);
  sw.place(0, T.surfaceY, 0, 0);
  // no strokes at all, on a sea that is moving under them
  let t = 0;
  const ctl = { move: null, yaw: 0, pitch: 0, stroke: false, beat: null };
  const world = { heightAt: () => -40, surfaceAt: () => Math.sin(t * 1.7) * 0.5 };
  while (t < 45) { sw.update(1 / 60, ctl, world); t += 1 / 60; }
  ok(sw.up, 'a diver doing nothing sank: y = ' + sw.pos.y.toFixed(2));
  ok(sw.depth < 1.0, 'drifted under: depth = ' + sw.depth.toFixed(2));
});

test('the lift is gone by two metres, so no part of the dive moves', () => {
  const sw = diver(noAir);
  sw.place(0, -9, 0, 0);
  let t = 0;
  const ctl = { move: null, yaw: 0, pitch: 0, stroke: false, beat: null };
  while (t < 8) { sw.update(1 / 60, ctl, sea(-90)); t += 1 / 60; }
  ok(sw.pos.y < -8.9, 'the surface lift reached nine metres down: y = ' + sw.pos.y.toFixed(2));
});

test('ground above the waterline is standable, not a lid at -0.55', () => {
  const sw = diver(noAir);
  const world = beach();
  sw.place(0, world.heightAt(0, 20) + T.bodyRadius, 20, 0);
  let t = 0;
  const ctl = { move: null, yaw: 0, pitch: 0, stroke: false, beat: null };
  while (t < 3) { sw.update(1 / 60, ctl, world); t += 1 / 60; }
  ok(sw.pos.y > 3, 'the diver was pulled under a beach: y = ' + sw.pos.y.toFixed(2));
  ok(sw.pos.y > 0, 'a lid at -0.55 would have clamped them below the sea');
  ok(sw.onLand, 'stood on shingle and did not know it');
  ok(sw.up, 'stood in the air with their head under the water');
  ok(Math.abs(sw.pos.y - (world.heightAt(0, 20) + T.bodyRadius)) < 0.05,
     'the diver did not settle on the ground: y = ' + sw.pos.y.toFixed(2));
});

test('thrown off the bank you arc into the water rather than hovering', () => {
  const sw = diver(noAir);
  const world = beach();
  sw.place(0, world.heightAt(0, 14) + T.bodyRadius, 14, Math.PI);
  sw.vel.set(0, 3.6, -8.4);           // the leap: seaward and up
  let t = 0, peak = -99;
  const ctl = { move: null, yaw: 0, pitch: 0, stroke: false, beat: null };
  while (t < 3) {
    sw.update(1 / 60, ctl, world);
    peak = Math.max(peak, sw.pos.y);
    t += 1 / 60;
  }
  ok(peak > world.heightAt(0, 14) + T.bodyRadius + 0.4, 'the jump had no arc in it');
  ok(sw.pos.z < 6, 'the diver never made it off the beach: z = ' + sw.pos.z.toFixed(2));
  ok(!sw.aloft && sw.pos.y <= T.surfaceY + 1e-6, 'the diver never landed in the loch');
});

test('spending the last of the bar on a stroke still blacks you out', () => {
  /* The bug: air is spent in two places — by time, and by the stroke
     itself — and only one of them raised the flag. At thirty metres a
     stroke costs more than a frame of drain, so the commonest way to
     empty a bar was the way that silently did nothing. */
  const sw = diver();
  sw.place(0, -30, 0, 0);
  sw.air = T.airStroke * (1 + 30 / T.pressureRef) * 0.6;   // one stroke's worth, minus a bit
  let blackouts = 0;
  const r = swim(sw, { secs: 3, world: sea(-60), strokes: every(SPB),
                       onFrame: (t, s) => { if (s.blackout) blackouts++; } });
  eq(blackouts, 1, 'the blackout must fire exactly once');
  ok(r.strokes >= 1, 'the diver never stroked, so this proved nothing');
});

test('a blackout is re-armed by a breath, not by a frame', () => {
  const sw = diver();
  sw.place(0, -20, 0, 0);
  sw.air = 0.02;
  let blackouts = 0;
  // drown, then be carried to the surface the way the mission does it
  swim(sw, { secs: 2, world: sea(-40), strokes: () => null,
             onFrame: (t, s) => { if (s.blackout) blackouts++; } });
  eq(blackouts, 1, 'one blackout on the way down');
  sw.pos.y = T.surfaceY;
  swim(sw, { secs: 3, world: sea(-40), strokes: () => null });
  ok(sw.air > 0.5, 'the bar has to come back at the surface');
  sw.pos.y = -20;
  sw.air = 0.02;
  swim(sw, { secs: 2, world: sea(-40), strokes: () => null,
             onFrame: (t, s) => { if (s.blackout) blackouts++; } });
  eq(blackouts, 2, 'a second breath has to be able to be lost too');
});

/* Signs. Every one of these was wrong at some point in this file's
   life and none of them would have shown up in a speed or an air
   number — they are the difference between a diver who goes where you
   point and one who does the opposite, which is a bug you can only
   find by asserting it or by playing it. */
section('the directions, which nothing else in here would catch');

test('the mouse moved right turns the diver right', () => {
  const sw = diver(noAir);
  // screen-right is cross(forward, up), which at yaw 0 (forward +Z) is -X
  swim(sw, { secs: 2, strokes: every(SPB),
             aim: (s, t, c) => { c.yaw = 0.8 / 60; } });
  ok(sw.pos.x < -1, 'a rightward sweep took the diver to x = ' + sw.pos.x.toFixed(2));
});

test('the mouse moved down points the diver down', () => {
  const sw = diver(noAir);
  swim(sw, { secs: 2, strokes: every(SPB),
             aim: (s, t, c) => { c.pitch = 0.5 / 60; } });
  ok(sw.pos.y < -8.5, 'looking down should dive: y = ' + sw.pos.y.toFixed(2));
});

test('sculling right goes right, and sculling forward goes forward', () => {
  const right = diver(noAir);
  swim(right, { secs: 3, strokes: () => null,
                aim: (s, t, c) => { c.move = { x: 1, y: 0 }; } });
  ok(right.pos.x < -0.5, 'strafing right went to x = ' + right.pos.x.toFixed(2));

  const fwd = diver(noAir);
  swim(fwd, { secs: 3, strokes: () => null,
              aim: (s, t, c) => { c.move = { x: 0, y: 1 }; } });
  ok(fwd.pos.z > 0.5, 'sculling forward went to z = ' + fwd.pos.z.toFixed(2));
});

test('the body points the way it is travelling, not the opposite way', () => {
  /* Three's YXZ euler reads a positive X as nose-*down*, and the physics
     reads a positive pitch as swimming *up*. Handing one straight to
     the other put the diver a hundred and fifty degrees out at full
     pitch: swimming for the surface lying on their back. Nothing in a
     speed or an air number would ever have caught it. */
  const sw = diver(noAir);
  sw.place(0, -30, 0, 0);
  swim(sw, { secs: 2.5, world: sea(-60), strokes: every(SPB),
             aim: (s) => { s.pitchAim = 1.0; } });
  ok(sw.pos.y > -28, 'the diver did not actually climb');
  /* Where the *mesh* is pointing. Three's YXZ euler sends local +Z to
     (.., -sin x, ..), so the body's forward-Y is -sin(euler.x); the
     physics forward-Y is sin(pitch). They have to agree in sign. */
  const e = sw._e;
  const meshUp = -Math.sin(e.x);
  const swimUp = Math.sin(sw.pitch);
  ok(swimUp > 0.3, 'the diver was not actually pitched up: ' + swimUp.toFixed(2));
  ok(Math.sign(meshUp) === Math.sign(swimUp),
     'the body is pitched the opposite way to the swim: euler.x = '
     + e.x.toFixed(2) + ', pitch = ' + sw.pitch.toFixed(2));
});

test('turning keeps most of your speed — the carve is the whole reward', () => {
  const straight = diver(noAir);
  swim(straight, { secs: 8, strokes: every(SPB) });
  const turning = diver(noAir);
  swim(turning, { secs: 8, strokes: every(SPB),
                  aim: (s, t, c) => { c.yaw = 0.9 / 60; } });
  ok(turning.speed > straight.speed * 0.75,
     'a held turn cost ' + Math.round((1 - turning.speed / straight.speed) * 100) + '% of the speed');
});

report();
