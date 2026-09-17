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
    nockTime: 0.10,          // between loosing and being able to draw again
    minLoose: 0.04,          // a click always sends *something*: a tap that
                             // silently does nothing is the single most
                             // unresponsive thing a shooter can do

    speedMin: 48,            // m/s at the very start of the draw
    speedMax: 112,           // at full draw — fast, but slow enough that the
                             // arrow is a thing you watch rather than a thing
                             // that has already arrived
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

  /* -------- the thing you actually see --------

     One bow, two places it can be. The first-person one is parented to
     the camera and scaled down to a model, because a real bow held at
     arm's length blacks out half the screen. The other two archers get
     the *same* mesh at world scale, standing in the wood beside you —
     which is the whole reason this is a static that hands back its
     moving parts rather than a method that quietly writes them onto
     `this`. A wood with two people in it and no bows between them
     reads as two people watching you shoot. */

  static parts() {
    if (typeof ShootoutBow !== 'undefined') return ShootoutBow.build();
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
    const limbTips = [pts[0].clone(), pts[pts.length - 1].clone()];
    // horn nocks at the ends, where the string sits
    for (const tip of limbTips) {
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
    const string = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: '#efe6d0' }));
    string.frustumCulled = false;
    g.add(string);

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

    g.rotation.set(0, 0, 0);
    return { group: g, string, nocked: arrow, limbTips };
  }

  /* Where the string and the nocked arrow sit at a given draw. Shared
     by both bows for the same reason the mesh is: an archer thirty
     metres away whose string does not move is an archer who never
     appears to shoot, and "how far back is it" is the single thing
     this mission asks you to read off somebody else. */
  static poseParts(parts, draw) {
    if (!parts) return;
    if (parts.limbs) { ShootoutBow.pose(parts, draw); return; }
    const pull = U.clamp(draw || 0, 0, 1) * 0.5;
    const p = parts.string.geometry.attributes.position.array;
    const a = parts.limbTips[0], b = parts.limbTips[1];
    p[0] = a.x; p[1] = a.y; p[2] = a.z;
    p[3] = 0;   p[4] = 0;   p[5] = pull;
    p[6] = b.x; p[7] = b.y; p[8] = b.z;
    parts.string.geometry.attributes.position.needsUpdate = true;
    parts.nocked.position.set(0.05, 0.02, pull + 0.30);
  }

  /* The bow the *other two* are holding. Same mesh, no camera, and
     life size rather than a model — it is being looked at from across
     a clearing rather than from behind the grip.

     It is deliberately not parented into the figure's arm chain. That
     chain is a walk cycle with an aim pose lerped over it, and a bow
     riding it would point wherever the elbow happened to be; the
     shooter's own aim is on the wire already, so the bow is placed at
     the hand and turned to face where the arrow is actually going. */
  static buildWorld(scale = 0.78) {
    const parts = Bow.parts();
    parts.group.scale.setScalar(scale);
    // the cant a hand puts on it, driven by the draw in `poseWorld`
    const hand = new THREE.Group();
    hand.add(parts.group);
    const aim = new THREE.Group();
    aim.rotation.order = 'YXZ';
    aim.add(hand);
    aim.userData.bowParts = parts;
    aim.userData.bowHand = hand;
    Bow.poseWorld(aim, 0, 0, 0, 0, 0, 0);
    return aim;
  }

  /* Point a world bow down an aim and pull its string. `draw` is the
     0..1 that came off the wire. */
  static poseWorld(aim, x, y, z, yaw, pitch, draw) {
    if (!aim) return;
    const c = U.clamp(draw || 0, 0, 1);
    aim.position.set(x, y, z);
    aim.rotation.set(pitch, yaw, 0);
    const hand = aim.userData.bowHand;
    /* The cant, and it is not decoration: a bow held dead square to
       the world reads as scenery, and the same bow rolled over at rest
       and squaring up as it comes to full draw reads as somebody about
       to shoot. The two ends are the ones the first-person bow settles
       between. The yaw term stays much smaller than its first-person
       twin, though — on your own bow that angle only sets the model
       across the screen, but out here the nocked arrow has to look
       like it is pointing at what they are pointing at. */
    hand.rotation.set(0, U.lerp(0.15, 0.03, c), U.lerp(-0.34, -0.07, c));
    const parts = aim.userData.bowParts;
    Bow.poseParts(parts, c);
    parts.nocked.visible = c > 0.02;
  }

  build(camera) {
    const parts = Bow.parts();
    const g = parts.group;
    this.parts = parts;
    if (parts.limbs) ShootoutBow.hands(parts);
    this.limbTips = parts.limbTips;
    this.string = parts.string;
    this.nocked = parts.nocked;
    this.group = g;
    // A bow really is about as tall as you are, and held at arm's length
    // it would black out half the screen. Every first-person bow ever made
    // is a scale model, and so is this one.
    this.baseScale = 0.23;
    g.scale.setScalar(this.baseScale);
    camera.add(g);
    this.camera = camera;
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
      if (this.nockT <= 0) { this.state = 'ready'; AudioBus.play('bow-nock'); }
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
    this._releaseAge = 0;
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
    const reduced = typeof ShootoutMaterials !== 'undefined' && ShootoutMaterials.reduced();
    this._visualCharge = U.damp(this._visualCharge || 0, this.charge, 24, dt);
    const c = reduced ? this.charge : this._visualCharge;
    this._releaseAge = (this._releaseAge ?? 10) + dt;
    // the bow comes up and in as you draw, and the arm shakes with strain
    const shake = reduced ? 0 : (this.strain || 0) * 0.008;
    const narrow = this.camera && this.camera.aspect < .85;
    this._restPos.x = narrow ? .12 : .26;
    this._drawPos.x = narrow ? .07 : .11;
    this.group.position.lerpVectors(this._restPos, this._drawPos, U.smoothstep(0, 1, c));
    this.group.position.x += Math.sin(this._swayT * 21) * shake + (this._bob ? this._bob.x : 0);
    this.group.position.y += Math.cos(this._swayT * 17) * shake + (this._bob ? this._bob.y : 0);
    this.group.rotation.z = U.lerp(-0.28, -0.06, c);
    this.group.rotation.y = U.lerp(0.30, 0.06, c);
    this.group.scale.setScalar(this.baseScale * (this.state === 'nocking' ? 0.96 : 1));

    // string and nock follow the draw exactly
    if (this.parts.limbs) {
      const vibration = reduced ? 0 : Math.sin(this._releaseAge * 105) * Math.exp(-this._releaseAge * 20) * .035;
      ShootoutBow.pose(this.parts, this.charge, vibration);
      this.parts.drawHand.visible = this.state === 'drawing' || this.state === 'nocking';
    } else Bow.poseParts(this.parts, this.charge);
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
    this.pool = [];
    this.wind = new THREE.Vector3();

    /* One geometry, one material, many meshes. The arrow is drawn a good
       deal chunkier than a real one: at a hundred metres a true-scale
       shaft is a third of a pixel, and an arrow you cannot see is a bow
       that does not appear to do anything. */
    const shaft = new THREE.CylinderGeometry(0.05, 0.05, 1.15, 5);
    shaft.rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.115, 0.34, 4);
    head.rotateX(-Math.PI / 2);
    head.translate(0, 0, -0.66);
    const f1 = new THREE.BoxGeometry(0.012, 0.2, 0.3);
    f1.translate(0, 0, 0.46);
    const f2 = f1.clone(); f2.rotateZ(Math.PI / 2);
    this.geo = Sky.mergeGeometries([shaft, head, f1, f2].map(g => g.toNonIndexed()));
    this.geo.computeVertexNormals();
    if (typeof ShootoutMaterials !== 'undefined') ShootoutMaterials.uv(this.geo, .35);
    // both lit *and* emissive, so an arrow crossing a shadowed treeline
    // does not disappear into it halfway
    this.matPlain = new THREE.MeshLambertMaterial({
      color: '#f4e7c6', emissive: '#6a5a34', flatShading: true });
    this.matClean = new THREE.MeshLambertMaterial({
      color: '#ffd166', emissive: '#b07400', flatShading: true });
    if (typeof ShootoutMaterials !== 'undefined') {
      ShootoutMaterials.dress(this.matPlain, 'timber');
      ShootoutMaterials.dress(this.matClean, 'timber');
    }

    /* The streak behind it, and the thing that actually sells the shot.

       It used to be GL lines, which are one pixel wide whatever you ask
       for and were invisible at any range worth shooting at. This is a
       ribbon instead: real triangles, turned to face the camera every
       frame and widened with distance, so a shot at eighty metres reads
       exactly as clearly as one at ten. */
    this.trailLen = 14;                       // segments kept per arrow
    this.ghosts = [];                         // streaks still fading after the
                                              // arrow itself has landed
    const quads = (this.T.maxFlying + 8) * this.trailLen;
    const tg = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(quads * 18);   // 6 verts per quad
    this.trailCol = new Float32Array(quads * 24);
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    tg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      // the wood's fog is thick enough to swallow a shot at a hundred
      // metres, and an additive surface mixed towards a pale fog colour
      // gets *brighter* with distance rather than fading — so the streak
      // opts out of it entirely and stays the one clean line on screen
      fog: false,
    }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 5;
    scene.add(this.trail);
    this.trailGeo = tg;
    this._eye = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._side = new THREE.Vector3();

    this._up = new THREE.Vector3(0, 1, 0);
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
  }

  setWind(x, z, strength) { this.wind.set(x, 0, z).multiplyScalar(strength); }

  /* Arrow meshes are pooled and *never* disposed. They all share one
     geometry and two materials, and handing those to the scene's usual
     disposeObject — which walks the tree and disposes everything it finds
     — threw away the shared buffers and the compiled shader every time an
     arrow retired, for the whole system to upload again on the next one.
     Half a dozen arrows a second is half a dozen re-uploads a second. */
  _acquire(mat) {
    const mesh = this.pool.pop() || new THREE.Mesh(this.geo, mat);
    mesh.material = mat;
    mesh.scale.setScalar(1);
    mesh.visible = true;
    this.scene.add(mesh);
    return mesh;
  }

  _release(mesh) {
    if (!mesh) return;
    this.scene.remove(mesh);
    if (this.pool.length < 64) this.pool.push(mesh);
  }

  fire(origin, dir, shot) {
    if (this.flying.length >= this.T.maxFlying) this._retire(this.flying[0], 0);
    const mesh = this._acquire(shot.perfect ? this.matClean : this.matPlain);
    mesh.position.copy(origin);
    const a = {
      mesh,
      pos: origin.clone(),
      prev: origin.clone(),
      vel: dir.clone().multiplyScalar(shot.speed),
      life: this.T.arrowLife,
      pierce: shot.pierce,
      perfect: shot.perfect,
      power: shot.power,
      remote: !!shot.remote,
      hits: 0,
      history: [origin.clone()],
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
      /* Held at true scale an arrow shrinks below a pixel within twenty
         metres. It is grown with range instead — the same trick the hit
         spheres use — so that the thing you loosed stays a thing you can
         follow all the way to what it hits. */
      if (ctx.eye) {
        const d = a.pos.distanceTo(ctx.eye);
        a.mesh.scale.set(1 + d * 0.022, 1 + d * 0.022, 1 + d * 0.010);
      }
      a.history.push(a.pos.clone());
      if (a.history.length > this.trailLen + 1) a.history.shift();
    }

    // the streak outlives the arrow for a moment, so that a shot which
    // buries itself in a trunk still draws the line it took to get there
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      if (g.life <= 0) this.ghosts.splice(i, 1);
    }

    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      s.life -= dt;
      if (s.life <= 0) { this._release(s.mesh); this.stuck.splice(i, 1); continue; }
      if (s.life < 1) {
        s.mesh.scale.setScalar(Math.max(0.001, s.life));
      }
    }
    this._updateTrail(ctx && ctx.eye);
  }

  // swept tests, in the order they happen along this frame's segment
  _collide(a, ctx) {
    const seg = this._v.copy(a.pos).sub(a.prev);
    const len = seg.length();
    if (len < 1e-5) return null;

    /* Somebody else's arrow. It is drawn because a bow that produces
       nothing visible is not a bow anybody can watch being fired, but
       it is *only* drawn: what it hit was decided on the machine that
       loosed it, and testing it against this client's flock as well
       would be a second opinion nobody asked for. */
    let earliest = null;
    if (!a.remote) {
      for (const t of ctx.targets) {
        if (!t.alive || t.dying) continue;
        if (a.hitSet && a.hitSet.has(t)) continue;
        const r = t.hitRadius(a.prev);
        const h = ArrowSystem.segmentSphere(a.prev, seg, len, t.pos, r);
        if (h !== null && (!earliest || h < earliest.t)) earliest = { t: h, target: t };
      }
    }

    if (earliest) {
      const point = a.prev.clone().addScaledVector(seg, earliest.t / len);
      if (!a.hitSet) a.hitSet = new Set();
      a.hitSet.add(earliest.target);
      a.hits++;
      /* `onHit` gets a veto. A round that only counts a clean loose
         says a soft arrow "goes straight through", and it could not:
         the hit was already banked and the arrow was already retired
         by the time the mission got a say, so a soft arrow stopped
         dead in mid-air on the one bird it was not allowed to touch.
         Refusing it puts the arrow back in the air with nothing on its
         conscience — it is still in `hitSet`, so it will not ask about
         the same bird twice. */
      if (ctx.onHit(earliest.target, a,
                    { point, dist: point.distanceTo(ctx.eye || point) }) === false) {
        a.hits--;
        return null;
      }
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
    // back to life size once it is in the ground: the range scaling is
    // there to keep an arrow *in flight* visible, and a fencepost-sized
    // arrow standing in the grass in front of you is not that
    a.mesh.scale.setScalar(1);
    this.stuck.push({ mesh: a.mesh, life: this.T.stuckLife });
    a.mesh = null;
    this._ghost(a);
    a.history = null;                 // _retire must not queue it twice
    while (this.stuck.length > this.T.maxStuck) {
      const s = this.stuck.shift();
      this._release(s.mesh);
    }
    AudioBus.play('arrow-thunk', { amount: U.clamp(a.vel.length() / 120, 0.3, 1) });
  }

  _ghost(a) {
    if (!a.history || a.history.length < 2) return;
    if (this.ghosts.length >= 8) this.ghosts.shift();
    this.ghosts.push({ history: a.history, perfect: a.perfect, life: 0.18, fade: 0.18 });
  }

  _retire(a, i) {
    this._ghost(a);
    if (a.mesh) this._release(a.mesh);
    const idx = i !== undefined && this.flying[i] === a ? i : this.flying.indexOf(a);
    if (idx >= 0) this.flying.splice(idx, 1);
  }

  _point(mesh, vel) {
    this._m.lookAt(ArrowSystem._zero, vel, this._up);
    mesh.quaternion.setFromRotationMatrix(this._m);
    mesh.rotateY(Math.PI);          // the model points down -Z
  }

  /* Build the ribbons. Each pair of history points becomes a quad lying
     in the plane that faces the camera, tapering and fading towards the
     tail, and widened in proportion to its distance from the eye so it
     holds a roughly constant width on screen. */
  _updateTrail(eye) {
    const P = this.trailPos, C = this.trailCol;
    const quads = P.length / 18;
    const e = eye ? this._eye.copy(eye) : this._eye.set(0, 0, 0);
    let q = 0;
    // live arrows first, then the fading ones — two passes rather than a
    // joined array, because this runs every frame
    for (let pass = 0; pass < 2; pass++) {
     const src = pass ? this.ghosts : this.flying;
     for (const a of src) {
      const h = a.history;
      if (!h) continue;
      const n = h.length;
      const alive = pass ? a.life / a.fade : 1;
      for (let i = 1; i < n && q < quads; i++) {
        const p0 = h[i - 1], p1 = h[i];
        const d = this._d.copy(p1).sub(p0);
        if (d.lengthSq() < 1e-8) continue;
        // towards the camera, crossed with the flight, gives the flat of
        // the ribbon; a segment seen exactly end-on has no width to give
        const side = this._side.set(e.x - p1.x, e.y - p1.y, e.z - p1.z).cross(d);
        if (side.lengthSq() < 1e-8) continue;
        side.normalize();

        // how far along the tail we are: 1 at the arrowhead, 0 at the end
        const t0 = (i - 1) / (n - 1), t1 = i / (n - 1);
        // width in world units chosen so the ribbon holds a roughly
        // constant half-degree on screen at any range, tapered to nothing
        // at the tail. Both ends use the same curve, so consecutive quads
        // meet exactly instead of stepping.
        const dist = eye ? p1.distanceTo(e) : 40;
        const w = 0.035 + dist * 0.0040;
        const w0 = w * t0 * t0, w1 = w * t1 * t1;

        const ax = p0.x + side.x * w0, ay = p0.y + side.y * w0, az = p0.z + side.z * w0;
        const bx = p0.x - side.x * w0, by = p0.y - side.y * w0, bz = p0.z - side.z * w0;
        const cx = p1.x + side.x * w1, cy = p1.y + side.y * w1, cz = p1.z + side.z * w1;
        const dx = p1.x - side.x * w1, dy = p1.y - side.y * w1, dz = p1.z - side.z * w1;

        const o = q * 18;
        // two triangles: a,b,c and b,d,c
        P[o] = ax; P[o + 1] = ay; P[o + 2] = az;
        P[o + 3] = bx; P[o + 4] = by; P[o + 5] = bz;
        P[o + 6] = cx; P[o + 7] = cy; P[o + 8] = cz;
        P[o + 9] = bx; P[o + 10] = by; P[o + 11] = bz;
        P[o + 12] = dx; P[o + 13] = dy; P[o + 14] = dz;
        P[o + 15] = cx; P[o + 16] = cy; P[o + 17] = cz;

        const cr = a.perfect ? 1 : 0.95, cg = a.perfect ? 0.84 : 0.93, cb = a.perfect ? 0.42 : 0.82;
        const peak = (a.perfect ? 1.15 : 0.8) * alive;
        const f0 = t0 * t0 * peak, f1 = t1 * t1 * peak;
        const o4 = q * 24;
        const put = (k, f) => {
          C[o4 + k * 4] = cr; C[o4 + k * 4 + 1] = cg;
          C[o4 + k * 4 + 2] = cb; C[o4 + k * 4 + 3] = f;
        };
        put(0, f0); put(1, f0); put(2, f1);
        put(3, f0); put(4, f1); put(5, f1);
        q++;
      }
     }
    }
    // park the unused vertices on top of each other so they draw nothing
    for (let i = q; i < quads; i++) {
      const o = i * 18, o4 = i * 24;
      for (let k = 0; k < 18; k++) P[o + k] = 0;
      for (let k = 0; k < 24; k++) C[o4 + k] = 0;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
  }

  clear() {
    for (const a of this.flying) this._release(a.mesh);
    for (const s of this.stuck) this._release(s.mesh);
    this.flying.length = 0; this.stuck.length = 0;
    this.ghosts.length = 0;
    this._updateTrail(null);
  }

  dispose() {
    this.clear();
    for (const m of this.pool) this.scene.remove(m);
    this.pool.length = 0;
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
