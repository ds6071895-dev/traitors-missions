/* ------------------------------------------------------------------
   boost.js — what a lit afterburner looks like, from any boat.

   One of these is built for your own hull and one for each of the
   other two, so a boost is the same event whichever screen it lands
   on: a coloured jet off the transom, a glowing streak laid on the
   water for as long as the meter burns, and a shockwave on the spot
   it lit. It reads nothing but what it is handed each frame — a
   transform and a flag — which is all a remote boat ever is.
------------------------------------------------------------------ */
class BoatBoost {
  constructor(scene, parent, fx, color) {
    this.fx = fx;
    this.color = new THREE.Color(color);
    this.spark = this.color.clone().multiplyScalar(0.55);
    this.strength = 0;
    this.on = false;
    this.laying = false;
    this.t = 0;
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();

    const low = BoatMaterials.low();
    const add = (c, opacity) => new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    // a unit cone, base on the transom and tip one metre aft: scaled in
    // z it is the length of the jet, in x/y its throat
    const cone = (r) => {
      const g = new THREE.ConeGeometry(r, 1, 14, 1, true);
      g.translate(0, 0.5, 0);
      g.rotateX(-Math.PI / 2);
      return g;
    };
    this.plume = new THREE.Group();
    this.plume.position.set(0, 0.5, Boat.HULL.sternZ - 0.1);
    this.outer = new THREE.Mesh(cone(0.7), add(this.color, 0));
    this.core = new THREE.Mesh(cone(0.32), add('#ffffff', 0));
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: FXTex.dotTexture(), color: this.color, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.outer.renderOrder = this.core.renderOrder = this.glow.renderOrder = 4;
    this.plume.add(this.outer, this.core, this.glow);
    this.plume.visible = false;
    parent.add(this.plume);

    // the streak on the water: a wake ribbon, lit rather than foamed
    this.trail = new WakeRibbon(scene, {
      segments: low ? 36 : 64, life: 1.25, color: this.color, alpha: 0.9, lift: 0.22,
    });
    this.trail.mesh.material.blending = THREE.AdditiveBlending;
  }

  /* `st` is { x, y, z, heading, boosting, airborne, water } — `water` is
     the height of the sea under the boat, where the shockwave and the
     streak are laid. Returns true on the frame the burner lights. */
  update(dt, st) {
    this.t += dt;
    const reduced = BoatMaterials.reduced();
    const lit = !!st.boosting;
    this.strength = U.damp(this.strength, lit ? 1 : 0, lit ? 18 : 5, dt);
    const k = this.strength;

    this.plume.visible = k > 0.03;
    if (this.plume.visible) {
      const flicker = reduced ? 1 : 1 + Math.sin(this.t * 57) * 0.07 + (Math.random() - 0.5) * 0.18;
      const w = 0.5 + k * 0.6;
      this.outer.scale.set(w, w, (1.8 + k * 4.6) * flicker);
      this.core.scale.set(w, w, (1.2 + k * 2.6) * flicker);
      this.outer.material.opacity = 0.5 * k;
      this.core.material.opacity = 0.85 * k;
      this.glow.scale.setScalar((2.6 + k * 3.2) * (reduced ? 1 : 0.94 + Math.random() * 0.12));
      this.glow.material.opacity = 0.75 * k;
    }

    const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
    const rx = fz, rz = -fx;
    const sx = st.x - fx * 5.2, sz = st.z - fz * 5.2;

    const ignited = lit && !this.on;
    this.on = lit;
    if (ignited) this._ignite(st, fx, fz, sx, sz);

    // lay the streak only while lit and wet; each end is capped with a
    // dark sample so a boost that stops and restarts is two streaks,
    // not one bridged across the gap between them
    const lay = lit && !st.airborne;
    if (lay !== this.laying) {
      this._cap(sx, sz, rx, rz);
      this.laying = lay;
    }
    if (lay) this.trail.push(sx, sz, rx, rz, 0.9, 1);
    this.trail.update(dt);

    // a thin stream of embers while it burns
    if (lit && !reduced && this.fx) {
      const n = BoatMaterials.low() ? 1 : 2;
      for (let i = 0; i < n; i++) {
        this.fx.sparks.emit(
          sx + (Math.random() - 0.5) * 1.2, st.y + 0.6, sz + (Math.random() - 0.5) * 1.2,
          -fx * (10 + Math.random() * 8) + (Math.random() - 0.5) * 4, 1 + Math.random() * 3,
          -fz * (10 + Math.random() * 8) + (Math.random() - 0.5) * 4,
          0.14 + Math.random() * 0.22, 0.22 + Math.random() * 0.16, this.spark);
      }
    }
    return ignited;
  }

  _ignite(st, fx, fz, sx, sz) {
    if (!this.fx) return;
    const water = st.water ?? st.y;
    // a sonic ring punched out of the transom, and a shockwave flat on
    // the water that everybody in the channel can see go
    this._e.set(0, st.heading, 0);
    this.fx.rings.fire(this._v.set(sx, st.y + 0.5, sz),
      this._q.setFromEuler(this._e), 1.4, 13, 0.5, '#' + this.color.getHexString());
    this._e.set(-Math.PI / 2, 0, 0);
    this.fx.rings.fire(this._v.set(sx, water + 0.35, sz),
      this._q.setFromEuler(this._e), 2, 24, 0.8, '#' + this.color.getHexString());
    this.fx.rings.fire(this._v.set(sx, water + 0.4, sz),
      this._q.setFromEuler(this._e), 1, 11, 0.45, '#ffffff');
    if (BoatMaterials.reduced()) return;
    const n = BoatMaterials.low() ? 10 : 26;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 8 + Math.random() * 10;
      this.fx.sparks.emit(
        sx, st.y + 0.5, sz,
        Math.cos(a) * sp - fx * 10, 2 + Math.random() * 5, Math.sin(a) * sp - fz * 10,
        0.25 + Math.random() * 0.35, 0.3 + Math.random() * 0.3, this.color);
    }
  }

  _cap(x, z, rx, rz) {
    const tr = this.trail;
    tr.samples.push({ x, z, rx, rz, w: 0.9, s: 0, age: 0 });
    while (tr.samples.length > tr.max) tr.samples.shift();
    tr._lastX = x; tr._lastZ = z;
  }

  reset() {
    this.strength = 0; this.on = false; this.laying = false;
    this.plume.visible = false;
    this.trail.clear();
  }

  dispose() {
    if (this.plume.parent) this.plume.parent.remove(this.plume);
    Engine.disposeObject(this.plume);
    this.trail.dispose();
  }
}
