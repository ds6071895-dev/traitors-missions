/* Exercise the shared stage's character lifecycle without a GPU. The
   scene graph is real enough to distinguish removal from hiding a tag. */
const H = require('./harness');
const { test, eq, ok } = H;

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }
  addScaledVector(v, k) { return this.add(v.clone().multiplyScalar(k)); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp(v, k) { return this.addScaledVector(v.clone().sub(this), k); }
}

class Node {
  constructor() {
    this.position = new Vector3(); this.rotation = new Vector3();
    this.children = []; this.userData = {}; this.visible = true; this.fov = 64;
  }
  add(child) { if (child.parent) child.parent.remove(child); this.children.push(child); child.parent = this; }
  remove(child) { this.children = this.children.filter(c => c !== child); child.parent = null; }
  updateProjectionMatrix() {}
  getWorldDirection(v) { return v.set(0, 0, -1); }
  lookAt() {}
}

function fresh(players) {
  const listeners = new Set();
  const session = { state: { players }, playerById(id) { return this.state.players.find(p => p.id === id); } };
  const ctx = H.load(['js/core/util.js', 'js/scenes/stage.js'], {
    THREE: { Vector3, Scene: Node, Group: Node, PerspectiveCamera: Node },
    Session: session,
    Net: { on(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
    document: { getElementById: () => null },
    GameState: { data: { settings: {} } },
    CastleInterior: { build: () => ({ heightAt: () => 0, constrain() {}, update() {}, dispose() {} }) },
    EstateMaterials: { fabric() {}, figureLOD() {} },
    Figure: {
      build: () => new Node(), paletteFor: () => 'green',
      setSpeaking() {}, setLocomotion() {}, setSeated() {}, update() {}, lookAt() {},
      dispose(f) { if (f.parent) f.parent.remove(f); f.userData.disposed = true; },
    },
    Nametag: { make: () => new Node(), show(tag) { tag.visible = true; }, hide(tag) { tag.visible = false; }, setLit() {} },
    Engine: { disposeObject(o) { if (o && o.parent) o.parent.remove(o); } },
    Input: {
      setMouseAim() {}, setTouchMode() {}, onLockChange: () => () => {},
      aimDelta: () => ({ x: 0, y: 0 }), aimStick: () => ({ x: 0, y: 0 }),
      moveAxes: () => ({ x: 0, y: 0 }), held: () => false,
    },
  });
  return { ctx, session, listeners, emit() { listeners.forEach(fn => fn({ type: 'state' })); } };
}

const cast = () => [
  { id: 'me', name: 'Me', seat: 0, local: true, alive: true },
  { id: 'other', name: 'Other', seat: 1, alive: true },
  { id: 'survivor', name: 'Survivor', seat: 2, alive: true },
];

for (const out of ['murdered', 'banished', 'exposed', 'left']) {
  test(out + ' immediately removes the body, nametag and held item in free and scripted stages', () => {
    for (const free of [false, true]) {
      const f = fresh(cast());
      const stage = f.ctx.Stage.build({ room: 'hall', players: f.session.state.players, free });
      stage.update(0);
      const body = stage.figureOf('other'), tag = body.userData.tag;
      ok(body.visible && tag.visible, 'the living player starts visible');
      body.userData.keepVisible = true;      // an old reveal cannot override elimination
      const item = new Node(); stage.scene.add(item); body.userData.envelope = item;
      stage.walkPath('other', [body.position.clone(), new Vector3(2, 0, 3)]);
      stage.setCinematic(true); stage.track(body);

      // A guest adopts replacement player objects, rather than mutating
      // the objects supplied when this stage was built.
      f.session.state.players = f.session.state.players.map(p => p.id === 'other'
        ? Object.assign({}, p, { alive: false, out }) : p);
      f.emit();
      eq(stage.figureOf('other'), null, 'removed before the next animation frame');
      ok(!body.parent && !body.visible && body.userData.disposed, 'the full rig leaves the scene');
      ok(!tag.parent && !tag.visible && !item.visible, 'no label or held item remains');
      eq(body.userData.walk, null, 'pending movement is cancelled');
      ok(stage.figureOf('survivor').parent === stage.scene, 'survivors remain');
      eq(stage.walkIn('other', new Vector3()), 0, 'a late arrival cannot recreate them');
      stage.update(0.1); f.emit();
      eq(stage.figureOf('other'), null, 'later frames and snapshots keep them removed');
      stage.dispose();
      eq(f.listeners.size, 0, 'the stage releases its network listener');
    }
  });
}

test('a stage built after elimination never displays the eliminated character', () => {
  const players = cast(); players[1].alive = false;
  const f = fresh(players);
  const stage = f.ctx.Stage.build({ room: 'hall', players });
  eq(stage.figureOf('other'), null, 'removed during build, before any update');
  ok(stage.figureOf('survivor'), 'the living character is built');
  stage.dispose();
});

test('the frame also removes eliminations when no network event is delivered', () => {
  const f = fresh(cast());
  const stage = f.ctx.Stage.build({ room: 'hall', players: f.session.state.players });
  f.session.state.players[1].alive = false;
  stage.update(0);
  eq(stage.figureOf('other'), null);
  stage.dispose();
});

H.report();
