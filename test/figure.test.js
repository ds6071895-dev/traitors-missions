/* ------------------------------------------------------------------
   figure.test.js — the people, built and moved with real maths.

   Everything else in this suite runs against a THREE that throws if
   touched. The figures are nothing but THREE, so this one needs the
   real library — and three is deliberately not a dependency of the
   game (it comes from a CDN). Point `THREE_CJS` at a `three.cjs`:

     npm pack three@0.160.0 && tar xzf three-0.160.0.tgz
     THREE_CJS=$PWD/package/build/three.cjs node test/figure.test.js

   Without it the suite says so and passes, rather than failing every
   machine that has not fetched it.
------------------------------------------------------------------ */
const H = require('./harness');
const { test, eq, ok, section, report } = H;

let THREE = null;
try { THREE = require(process.env.THREE_CJS || 'three'); } catch (e) { THREE = null; }

if (!THREE) {
  console.log('\nfigure — skipped: set THREE_CJS to a three.cjs to run it');
  report();
  return;
}

const ctx = H.load(['js/core/util.js', 'js/core/look.js', 'js/entities/figure-skeleton.js',
                    'js/entities/figure-body.js', 'js/entities/figure-clips.js',
                    'js/entities/figure-anim.js', 'js/entities/figure.js'], {
  THREE, GameState: { data: { settings: { quality: 'medium' } } },
  Engine: { disposeObject(o) { o.traverse(m => { if (m.geometry && m.geometry.userData.painted) m.geometry.dispose(); }); } },
});
const { Figure, Look, FigureSkeleton: SK } = ctx;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function place(fig) { const g = new THREE.Group(); g.add(fig); return g; }
function run(fig, secs, each) {
  let t = 0;
  for (let i = 0; i < secs * 60; i++) { if (each) each(t, i); Figure.update(fig, 1 / 60, t); t += 1 / 60; }
}
/* Every skinned vertex of one part, in world space. */
function skinned(fig, part) {
  fig.updateMatrixWorld(true);
  const m = fig.userData.rig.meshes[part];
  m.skeleton.update();
  const out = [], v = new THREE.Vector3();
  for (let i = 0; i < m.geometry.attributes.position.count; i++) {
    m.getVertexPosition(i, v);
    out.push(v.clone().applyMatrix4(m.matrixWorld));
  }
  return out;
}

section('figure — building');

test('sampled looks build sound geometry in at most six draw calls', () => {
  for (let i = 0; i < 24; i++) {
    const look = Look.random();
    const fig = Figure.build({ look });
    const meshes = Object.values(fig.userData.rig.meshes);
    ok(meshes.length <= 6, 'draw calls: ' + meshes.length);
    for (const m of meshes) {
      const g = m.geometry;
      const sw = g.attributes.skinWeight.array, p = g.attributes.position.array;
      for (let k = 0; k < sw.length; k += 4) {
        const s = sw[k] + sw[k + 1] + sw[k + 2] + sw[k + 3];
        if (Math.abs(s - 1) > 1e-3) throw new Error(m.name + ' weights sum to ' + s);
      }
      for (const x of p) if (!Number.isFinite(x)) throw new Error(m.name + ' has a non-finite position');
      ok(g.index.count % 3 === 0, m.name + ' index is not triangles');
    }
    Figure.dispose(fig);
  }
});

test('a height is the height you get, and the feet are on the floor', () => {
  for (const build of [0, 2, 3]) {
    const look = Object.assign(Look.fresh(), { build, hair: 7, hat: 0 });   // shaved, bare-headed
    const want = Look.resolve(look).height;
    const fig = Figure.build({ look });
    place(fig);
    run(fig, 0.5);
    const skin = skinned(fig, 'skin'), legs = skinned(fig, 'legs');
    const top = Math.max(...skin.map(v => v.y)), floor = Math.min(...legs.map(v => v.y));
    ok(Math.abs(top - want) < 0.03, 'build ' + build + ': top of the head at ' + top.toFixed(3) + ', wanted ' + want);
    ok(Math.abs(floor) < 0.015, 'build ' + build + ': soles at ' + floor.toFixed(3));
  }
});

test('the same build shares its buffers; only the paint is per person', () => {
  const a = Figure.build({ look: Object.assign(Look.fresh(), { coat: 1 }) });
  const b = Figure.build({ look: Object.assign(Look.fresh(), { coat: 4 }) });
  const ga = a.userData.rig.meshes.coat.geometry, gb = b.userData.rig.meshes.coat.geometry;
  ok(ga.attributes.position === gb.attributes.position, 'positions are shared');
  ok(ga.attributes.color !== gb.attributes.color, 'colours are not');
});

test('a look saved before faces existed still resolves, to the same face every time', () => {
  const old = { build: 2, skin: 3, hair: 1, hairColour: 2, coat: 5, accent: 1, hat: 0, scarf: 2 };
  const a = Look.resolve(old).face, b = Look.resolve(JSON.parse(JSON.stringify(old))).face;
  ok(typeof a === 'string' && a.length, 'a face: ' + a);
  eq(a, b, 'deterministic');
});

section('figure — moving');

test('a planted foot stays planted, at any pace, through changes of pace', () => {
  for (const base of [0.6, 1.3, 2.2, 4.2]) {
    const fig = Figure.build({ look: Look.fresh() });
    place(fig);
    Figure.setLocomotion(fig, base, 0);
    const toe = fig.userData.rig.by.toe_l;
    let prev = null, worst = 0, stanceRun = 0, run1 = 0;
    run(fig, 6, (t) => {
      // a jittery pace, the way a networked player arrives
      const v = base * (1 + 0.35 * Math.sin(t * 2.3) + 0.15 * Math.sin(t * 7.1));
      fig.position.z += v / 60;
      fig.updateMatrixWorld(true);
      const p = toe.getWorldPosition(new THREE.Vector3());
      const A = fig.userData.anim;
      const u = A.phase / A.fs;
      const stance = A.gait > 0.95 && u > 0.04 && u < 0.92 && p.y < 0.06;
      if (stance && prev) { run1 += Math.hypot(p.x - prev.x, p.z - prev.z); stanceRun++; }
      else { worst = Math.max(worst, run1); run1 = 0; }
      prev = stance ? p : null;
    });
    worst = Math.max(worst, run1);
    ok(stanceRun > 20, base + ' m/s: never saw a stance');
    ok(worst < 0.035, base + ' m/s: a planted foot slid ' + (worst * 100).toFixed(1) + ' cm');
  }
});

test('a reach lands where it was asked to', () => {
  const fig = Figure.build({ look: Look.fresh() });
  place(fig);
  const at = V(0.22, 1.12, 0.42);
  Figure.reachTo(fig, at);
  run(fig, 1.5);
  const hand = fig.userData.rig.by.hand_r.getWorldPosition(new THREE.Vector3());
  ok(hand.distanceTo(at) < 0.01, 'the wrist is ' + (hand.distanceTo(at) * 100).toFixed(1) + ' cm off');
});

test('pointing aims the arm at the target', () => {
  const fig = Figure.build({ look: Look.fresh() });
  place(fig);
  const at = V(2, 1.3, 2.5);
  Figure.pointAt(fig, at);
  run(fig, 1.5);
  const by = fig.userData.rig.by;
  const sh = by.arm_r.getWorldPosition(new THREE.Vector3()), wr = by.hand_r.getWorldPosition(new THREE.Vector3());
  const ang = wr.clone().sub(sh).normalize().angleTo(at.clone().sub(sh).normalize());
  ok(ang < 0.08, 'off by ' + ang.toFixed(3) + ' rad');
});

test('the pouch leaves the hand in front of the thrower', () => {
  const fig = Figure.build({ palette: 'claudia', height: 1.74, hair: 'long' });
  place(fig);
  Figure.setHolding(fig, true);
  run(fig, 1);
  Figure.throwNow(fig, 0.95);
  let at = null;
  run(fig, 1.2, () => { if (!at && Figure.throwProgress(fig) >= Figure.THROW_AT) at = Figure.handAt(fig); });
  ok(at, 'the throw never reached its release');
  const local = fig.worldToLocal(at.clone());
  ok(local.z > 0.15 && local.y > 1.0, 'released at ' + local.toArray().map(v => v.toFixed(2)));
});

test('seated, the feet are on the floor and the seat is on the cushion', () => {
  const fig = Figure.build({ look: Look.fresh() });
  place(fig);
  Figure.setSeated(fig, true, { table: true });
  run(fig, 2.5);
  const by = fig.userData.rig.by;
  for (const k of ['l', 'r']) {
    const a = by['foot_' + k].getWorldPosition(new THREE.Vector3());
    ok(Math.abs(a.y - SK.Y.ankle) < 0.02, k + ' ankle at ' + a.y.toFixed(3));
  }
  // the lowest of the trousers inside the chair's footprint: on the cushion (0.48), not through it
  const seat = skinned(fig, 'legs').filter(v => v.z > -0.22 && v.z < 0.2 && Math.abs(v.x) < 0.22 && v.y > 0.3);
  const low = Math.min(...seat.map(v => v.y));
  ok(low > 0.455 && low < 0.53, 'the seat of the trousers at ' + low.toFixed(3));
});

test('acts run, end and leave the figure as it was', () => {
  const fig = Figure.build({ look: Look.fresh() });
  place(fig);
  run(fig, 0.5);
  for (const name of Object.keys(ctx.FigureClips.ACTS)) {
    const dur = Figure.act(fig, name, { hold: false, loop: false });
    ok(dur > 0, name + ' has no length');
    run(fig, dur + 1.0);
    // an idle fidget may have started since; the act itself must be gone
    const left = fig.userData.anim.acts.filter(a => a.opts && a.opts.loop === false && a.name === name);
    ok(!left.length, name + ' is still running');
  }
  for (const b of fig.userData.rig.bones) {
    for (const x of b.quaternion.toArray()) if (!Number.isFinite(x)) throw new Error(b.name + ' went non-finite');
  }
});

test('disposing a figure does not take the shared buffers with it', () => {
  const a = Figure.build({ look: Look.fresh() });
  const shared = a.userData.rig.meshes.coat.geometry.attributes.position;
  Figure.dispose(a);
  const b = Figure.build({ look: Look.fresh() });
  ok(b.userData.rig.meshes.coat.geometry.attributes.position === shared, 'the cache survived');
});

report();
