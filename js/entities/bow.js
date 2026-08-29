/* ------------------------------------------------------------------
   bow.js — the bow you hold and the arrows it puts in the air.

   The whole mission hangs off half a second. Pull for 0.5s and the bow
   is at full draw; let go inside the short window that follows and it is
   a *clean loose* — more money, and the arrow goes through what it hits
   and carries on. Hold past that and the string starts to fight you.

   Arrows are real: they have a speed that depends on how far you pulled,
   they fall, the wind pushes them, and they are tested as swept segments
   rather than points, because a 130 m/s arrow moves two metres between
   frames and would otherwise fly straight through a bird.
------------------------------------------------------------------ */
class Bow {

  static TUNE = {
    drawTime: 0.50,          // to full draw — the number the game is about
    perfectWindow: 0.13,     // how long the clean-loose window stays open
    holdGrace: 1.10,         // free hold at full draw before the arm complains
    strainEnd: 2.20,         // by here you are down to strainFloor and shaking
    strainFloor: 0.72,
    nockTime: 0.18,          // between loosing and being able to draw again
    minLoose: 0.10,          // a tap does not fire; it is not a trigger

    speedMin: 52,            // m/s at the very start of the draw
    speedMax: 134,           // at full draw
    gravity: 16,             // exaggerated so lead and drop are readable
    drag: 0.05,
    windScale: 5.5,          // how hard the weather pushes an arrow about
    arrowLife: 3.4,

    swayHold: 0.0012,        // radians of wander while merely holding
    swayStrain: 0.030,       // and once your arm is burning
    piercePerfect: 1,        // extra targets a clean loose goes through

    maxFlying: 28,
    maxStuck: 40,
    stuckLife: 7,
  };

  constructor(opts = {}) {
    this.tune = Object.assign({}, Bow.TUNE, opts.tune || {});
    this.state = 'ready';        // ready | drawing | nocking
    this.t = 0;                  // seconds into the current draw
    this.charge = 0;             // 0..1
    this.power = 0;              // charge after strain has eaten into it
    this.perfect = false;        // is the clean window open right now
    this.nockT = 0;
    this.sway = new THREE.Vector2();
    this._swayT = Math.random() * 100;
    this.shots = 0;
    this.cleanShots = 0;
    this.drawSnd = null;
  }

  /* -------- the thing you actually see -------- */

  build(camera) {
    const g = new THREE.Group();
    const mat = (c, opts) => new THREE.MeshLambertMaterial(
      Object.assign({ color: c, flatShading: true }, opts || {}));
    const wood = mat('#7a4f2a'), horn = mat('#3d2a1c'), steel = mat('#cfd8e3');

    // The limbs are one swept arc through the grip: a real curve, so the
    // silhouette reads as a bow at a glance instead of as a stack of boxes.
    // It bows away from you (−z), which is the way round you actually see
    // one when you are the person holding it.
    const R = 1.0, SWEEP = 1.18;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = U.lerp(-SWEEP, SWEEP, i / 12);
      pts.push(new THREE.Vector3(0, Math.sin(t) * R, (Math.cos(t) - 1) * R * 0.62));
    }
    const limbs = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.045, 5, false), wood);
    g.add(limbs);
    this.limbTips = [pts[0].clone(), pts[pts.length - 1].clone()];
    // horn nocks at the ends, where the string sits
    for (const tip of this.limbTips) {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.03, 0.1, 5), horn);
      n.position.copy(tip);
      g.add(n);
    }
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.15), horn);
    grip.position.z = -0.03;
    g.add(grip);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.1), wood);
    shelf.position.set(0.05, 0.02, -0.05);
    g.add(shelf);

    // the string is a real line between the two tips and the nock, so it
    // pulls back with the draw instead of pretending to
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    this.string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: '#efe6d0' }));
    this.string.frustumCulled = false;
    g.add(this.string);

    // the nocked arrow, which slides back as you pull
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.15, 5), mat('#dbc8a4'));
    shaft.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), steel);
    head.rotation.x = -Math.PI / 2;
    head.position.z = -0.66;
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.13, 0.24), mat('#e5133f'));
    fletch.position.z = 0.46;
    const fletch2 = fletch.clone(); fletch2.rotation.z = Math.PI / 2;
    arrow.add(shaft, head, fletch, fletch2);
    g.add(arrow);
    this.nocked = arrow;

    g.rotation.set(0, 0, 0);
    this.group = g;
    // A bow really is about as tall as you are, and held at arm's length
    // it would black out half the screen. Every first-person bow ever made
    // is a scale model, and so is this one.
    this.baseScale = 0.23;
    g.scale.setScalar(this.baseScale);
    camera.add(g);
    this._restPos = new THREE.Vector3(0.26, -0.22, -0.66);
    this._drawPos = new THREE.Vector3(0.11, -0.11, -0.54);
    this.setViewVisible(true);
    return g;
  }

  setViewVisible(v) { if (this.group) this.group.visible = v; }

  // the hand holding the bow rides the walk cycle too
  setBob(x, y) { this._bob = this._bob || new THREE.Vector2(); this._bob.set(x, y); }

  /* -------- the draw -------- */

  // called every frame with whether the player is holding the button
  update(dt, holding, opts = {}) {
    const T = this.tune;
    const out = { loosed: null };

    if (this.state === 'nocking') {
      this.nockT -= dt;
      if (this.nockT <= 0) this.state = 'ready';
    }

    if (this.state === 'ready' && holding) {
      this.state = 'drawing';
      this.t = 0;
      this.drawSnd = AudioBus.play('bow-draw');
    }

    if (this.state === 'drawing') {
      this.t += dt;
      this.charge = U.clamp(this.t / T.drawTime, 0, 1);
      // past the grace period the string starts winning
      const strain = U.smoothstep(T.holdGrace, T.strainEnd, this.t);
      this.power = this.charge * U.lerp(1, T.strainFloor, strain);
      this.perfect = this.charge >= 1 && this.t <= T.drawTime + T.perfectWindow;
      this.strain = strain;
      if (this.drawSnd) this.drawSnd.set(this.charge, strain);

      // the wander: nothing at all early, a slow drift while held, and a
      // real tremble once your arm is burning
      this._swayT += dt;
      const amp = U.lerp(T.swayHold, T.swayStrain, strain) * (opts.steady ? 0.35 : 1);
      this.sway.set(
        (Math.sin(this._swayT * 2.3) + Math.sin(this._swayT * 5.9) * 0.5) * amp,
        (Math.cos(this._swayT * 1.9) + Math.cos(this._swayT * 4.7) * 0.5) * amp * 0.8
      );

      if (!holding) {
        if (this.t >= T.minLoose) out.loosed = this.loose();
        else this._reset();
      }
    } else {
      this.sway.set(0, 0);
      this.charge = 0; this.power = 0; this.perfect = false; this.strain = 0;
    }

    this._animate(dt);
    return out;
  }

  loose() {
    const T = this.tune;
    const shot = {
      power: this.power,
      charge: this.charge,
      perfect: this.perfect,
      speed: U.lerp(T.speedMin, T.speedMax, Math.pow(this.power, 0.85)),
      pierce: this.perfect ? T.piercePerfect : 0,
      held: this.t,
    };
    this.shots++;
    if (this.perfect) this.cleanShots++;
    this._reset();
    this.state = 'nocking';
    this.nockT = T.nockTime;
    AudioBus.play('bow-loose', { power: shot.power, perfect: shot.perfect });
    return shot;
  }

  _reset() {
    this.state = 'ready';
    this.t = 0; this.charge = 0; this.power = 0; this.perfect = false; this.strain = 0;
    if (this.drawSnd) { this.drawSnd.stop(); this.drawSnd = null; }
  }

  _animate(dt) {
    if (!this.group) return;
    const c = this.charge;
    // the bow comes up and in as you draw, and the arm shakes with strain
    const shake = (this.strain || 0) * 0.014;
    this.group.position.lerpVectors(this._restPos, this._drawPos, U.smoothstep(0, 1, c));
    this.group.position.x += Math.sin(this._swayT * 21) * shake + (this._bob ? this._bob.x : 0);
    this.group.position.y += Math.cos(this._swayT * 17) * shake + (this._bob ? this._bob.y : 0);
    this.group.rotation.z = U.lerp(-0.28, -0.06, c);
    this.group.rotation.y = U.lerp(0.30, 0.06, c);
    this.group.scale.setScalar(this.baseScale * (this.state === 'nocking' ? 0.96 : 1));

    // string and nock follow the draw exactly
    const pull = c * 0.5;
    const p = this.string.geometry.attributes.position.array;
    const a = this.limbTips[0], b = this.limbTips[1];
    p[0] = a.x; p[1] = a.y; p[2] = a.z;
    p[3] = 0;   p[4] = 0;   p[5] = pull;
    p[6] = b.x; p[7] = b.y; p[8] = b.z;
    this.string.geometry.attributes.position.needsUpdate = true;
    this.nocked.position.set(0.05, 0.02, pull + 0.30);
    this.nocked.visible = this.state !== 'nocking';
  }

  dispose() {
    if (this.drawSnd) this.drawSnd.stop();
    if (this.group) Engine.disposeObject(this.group);
    this.group = null;
  }
}


/* ------------------------------------------------------------------
   ArrowSystem — a pool of arrows in flight, and a pool of arrows stuck
   in whatever stopped them.
------------------------------------------------------------------ */
class ArrowSystem {

  constructor(scene, tune) {
    this.T = tune;
    this.scene = scene;
    this.flying = [];
    this.stuck = [];
    this.wind = new THREE.Vector3();

    // one geometry, one material, many meshes: an arrow is four faces
    const shaft = new THREE.CylinderGeometry(0.022, 0.022, 0.9, 5);
    shaft.rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.05, 0.17, 4);
    head.rotateX(-Math.PI / 2);
    head.translate(0, 0, -0.52);
    const f1 = new THREE.BoxGeometry(0.008, 0.11, 0.2);
    f1.translate(0, 0, 0.36);
    const f2 = f1.clone(); f2.rotateZ(Math.PI / 2);
    this.geo = Sky.mergeGeometries([shaft, head, f1, f2].map(g => g.toNonIndexed()));
    this.geo.computeVertexNormals();
    this.matPlain = new THREE.MeshLambertMaterial({ color: '#e8d9b6', flatShading: true });
    this.matClean = new THREE.MeshLambertMaterial({
      color: '#ffd166', emissive: '#8a5a00', flatShading: true });

    // a short streak behind every arrow, which is most of what sells speed
    const maxTrail = this.T.maxFlying * 12;
    const tg = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(maxTrail * 6);
    this.trailCol = new Float32Array(maxTrail * 8);
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    tg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.trail = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 5;
    scene.add(this.trail);
    this.trailGeo = tg;

    this._up = new THREE.Vector3(0, 1, 0);
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
  }

  setWind(x, z, strength) { this.wind.set(x, 0, z).multiplyScalar(strength); }

  fire(origin, dir, shot) {
    if (this.flying.length >= this.T.maxFlying) this._retire(this.flying[0], 0);
    const mesh = new THREE.Mesh(this.geo, shot.perfect ? this.matClean : this.matPlain);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const a = {
      mesh,
      pos: origin.clone(),
      prev: origin.clone(),
      vel: dir.clone().multiplyScalar(shot.speed),
      life: this.T.arrowLife,
      pierce: shot.pierce,
      perfect: shot.perfect,
      power: shot.power,
      hits: 0,
      history: [origin.clone(), origin.clone(), origin.clone()],
    };
    this.flying.push(a);
    return a;
  }

  /* ctx = { targets, heightAt, colliders, onHit(target, arrow, info), onLand(arrow, what) } */
  update(dt, ctx) {
    const T = this.T;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const a = this.flying[i];
      a.life -= dt;
      a.prev.copy(a.pos);

      a.vel.y -= T.gravity * dt;
      a.vel.addScaledVector(this.wind, T.windScale * dt);
      a.vel.multiplyScalar(Math.max(0, 1 - T.drag * dt));
      a.pos.addScaledVector(a.vel, dt);

      const hit = this._collide(a, ctx);
      if (hit === 'gone' || a.life <= 0) { this._retire(a, i); continue; }

      a.mesh.position.copy(a.pos);
      this._point(a.mesh, a.vel);
      a.history.push(a.pos.clone());
      if (a.history.length > 4) a.history.shift();
    }

    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      s.life -= dt;
      if (s.life <= 0) { Engine.disposeObject(s.mesh); this.stuck.splice(i, 1); continue; }
      if (s.life < 1) {
        s.mesh.scale.setScalar(Math.max(0.001, s.life));
      }
    }
    this._updateTrail();
  }

  // swept tests, in the order they happen along this frame's segment
  _collide(a, ctx) {
    const seg = this._v.copy(a.pos).sub(a.prev);
    const len = seg.length();
    if (len < 1e-5) return null;

    let earliest = null;
    for (const t of ctx.targets) {
      if (!t.alive || t.dying) continue;
      if (a.hitSet && a.hitSet.has(t)) continue;
      const r = t.hitRadius(a.prev);
      const h = ArrowSystem.segmentSphere(a.prev, seg, len, t.pos, r);
      if (h !== null && (!earliest || h < earliest.t)) earliest = { t: h, target: t };
    }

    if (earliest) {
      const point = a.prev.clone().addScaledVector(seg, earliest.t / len);
      if (!a.hitSet) a.hitSet = new Set();
      a.hitSet.add(earliest.target);
      a.hits++;
      ctx.onHit(earliest.target, a, { point, dist: point.distanceTo(ctx.eye || point) });
      if (a.hits > a.pierce) return 'gone';
      // a pierce keeps going, slower and lower
      a.vel.multiplyScalar(0.86);
      return null;
    }

    // ground
    const gy = ctx.heightAt(a.pos.x, a.pos.z);
    if (a.pos.y <= gy) {
      a.pos.y = gy;
      this._stick(a);
      if (ctx.onLand) ctx.onLand(a, 'ground');
      return 'gone';
    }
    // trunks
    if (ctx.colliders) {
      for (const c of ctx.colliders) {
        if (a.pos.y < c.y0 || a.pos.y > c.y1) continue;
        const dx = a.pos.x - c.x, dz = a.pos.z - c.z;
        if (dx * dx + dz * dz < c.r * c.r) {
          this._stick(a);
          if (ctx.onLand) ctx.onLand(a, 'tree');
          return 'gone';
        }
      }
    }
    if (a.pos.y > 260 || a.pos.lengthSq() > 400 * 400) return 'gone';
    return null;
  }

  // distance along `seg` at which the segment first enters the sphere, or null
  static segmentSphere(from, seg, len, centre, radius) {
    const mx = from.x - centre.x, my = from.y - centre.y, mz = from.z - centre.z;
    const dx = seg.x / len, dy = seg.y / len, dz = seg.z / len;
    const b = mx * dx + my * dy + mz * dz;
    const c = mx * mx + my * my + mz * mz - radius * radius;
    if (c > 0 && b > 0) return null;              // pointing away and outside
    const disc = b * b - c;
    if (disc < 0) return null;
    let t = -b - Math.sqrt(disc);
    if (t < 0) t = 0;                             // started inside
    return t <= len ? t : null;
  }

  _stick(a) {
    a.mesh.position.copy(a.pos);
    this._point(a.mesh, a.vel);
    this.stuck.push({ mesh: a.mesh, life: this.T.stuckLife });
    a.mesh = null;
    while (this.stuck.length > this.T.maxStuck) {
      const s = this.stuck.shift();
      Engine.disposeObject(s.mesh);
    }
    AudioBus.play('arrow-thunk', { amount: U.clamp(a.vel.length() / 120, 0.3, 1) });
  }

  _retire(a, i) {
    if (a.mesh) Engine.disposeObject(a.mesh);
    const idx = i !== undefined && this.flying[i] === a ? i : this.flying.indexOf(a);
    if (idx >= 0) this.flying.splice(idx, 1);
  }

  _point(mesh, vel) {
    this._m.lookAt(ArrowSystem._zero, vel, this._up);
    mesh.quaternion.setFromRotationMatrix(this._m);
    mesh.rotateY(Math.PI);          // the model points down -Z
  }

  _updateTrail() {
    const P = this.trailPos, C = this.trailCol;
    let v = 0;
    for (const a of this.flying) {
      const h = a.history;
      for (let i = 1; i < h.length && v < P.length / 6; i++) {
        const o = v * 6, o4 = v * 8;
        P[o] = h[i - 1].x; P[o + 1] = h[i - 1].y; P[o + 2] = h[i - 1].z;
        P[o + 3] = h[i].x; P[o + 4] = h[i].y; P[o + 5] = h[i].z;
        const fade = (i / h.length) * (a.perfect ? 0.85 : 0.4);
        const cr = a.perfect ? 1 : 0.9, cg = a.perfect ? 0.82 : 0.9, cb = a.perfect ? 0.4 : 0.85;
        for (let k = 0; k < 2; k++) {
          C[o4 + k * 4] = cr; C[o4 + k * 4 + 1] = cg;
          C[o4 + k * 4 + 2] = cb; C[o4 + k * 4 + 3] = fade * (k ? 1 : 0.2);
        }
        v++;
      }
    }
    // park the unused vertices on top of each other so they draw nothing
    for (let i = v; i < P.length / 6; i++) {
      const o = i * 6, o4 = i * 8;
      for (let k = 0; k < 6; k++) P[o + k] = 0;
      for (let k = 0; k < 8; k++) C[o4 + k] = 0;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
  }

  clear() {
    for (const a of this.flying) if (a.mesh) Engine.disposeObject(a.mesh);
    for (const s of this.stuck) Engine.disposeObject(s.mesh);
    this.flying.length = 0; this.stuck.length = 0;
    this._updateTrail();
  }

  dispose() {
    this.clear();
    Engine.disposeObject(this.trail);
    this.geo.dispose();
    this.matPlain.dispose();
    this.matClean.dispose();
  }
}
ArrowSystem._zero = new THREE.Vector3();


/* ---- the bow's own noises ---- */

// A draw is a continuous thing, so this recipe hands back a handle the
// bow keeps talking to, the way AudioBus.engine() works for the boat.
AudioBus.define('bow-draw', (c, dest) => {
  const t = c.currentTime;
  const osc = c.createOscillator(), g = c.createGain();
  const f = c.createBiquadFilter();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(58, t);
  f.type = 'bandpass'; f.Q.value = 3.2; f.frequency.setValueAtTime(320, t);
  osc.connect(f); f.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.06);
  osc.start(t);
  let stopped = false;
  return {
    set(charge, strain) {
      if (stopped) return;
      const tt = c.currentTime;
      osc.frequency.setTargetAtTime(58 + charge * 96 + (strain || 0) * 22, tt, 0.05);
      f.frequency.setTargetAtTime(320 + charge * 900, tt, 0.05);
      // the creak gets louder and rougher as the arm starts to lose
      g.gain.setTargetAtTime(0.035 + charge * 0.05 + (strain || 0) * 0.05, tt, 0.06);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const tt = c.currentTime;
      g.gain.setTargetAtTime(0.0001, tt, 0.04);
      setTimeout(() => { try { osc.stop(); } catch (e) {} }, 260);
    },
  };
});

AudioBus.define('bow-loose', (c, dest, o) => {
  const t = c.currentTime;
  const p = U.clamp(o.power ?? 1, 0.2, 1);
  // the string snap
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220 + p * 240, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.16);
  osc.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.28 * p, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.start(t); osc.stop(t + 0.3);
  // and the air the shaft takes with it
  const n = AudioBus.noiseSource();
  const nf = c.createBiquadFilter(), ng = c.createGain();
  nf.type = 'highpass'; nf.frequency.setValueAtTime(900 + p * 1800, t);
  n.connect(nf); nf.connect(ng); ng.connect(dest);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.20 * p, t + 0.01);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  n.start(t); n.stop(t + 0.3);
  // a clean loose rings; that ring is the reward
  if (o.perfect) {
    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'sine'; o2.frequency.setValueAtTime(1760, t);
    o2.connect(g2); g2.connect(dest);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.13, t + 0.008);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o2.start(t); o2.stop(t + 0.4);
  }
});

AudioBus.define('arrow-thunk', (c, dest, o) => {
  const t = c.currentTime, amt = U.clamp(o.amount ?? 1, 0.2, 1);
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(58, t + 0.12);
  osc.connect(g); g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16 * amt, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.start(t); osc.stop(t + 0.25);
});
