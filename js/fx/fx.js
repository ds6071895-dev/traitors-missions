/* ------------------------------------------------------------------
   fx.js — reusable effects: spray, wake ribbon, shockwave rings and
   world-anchored floating labels. A mission news up one FXSystem.
------------------------------------------------------------------ */

const FXTex = (() => {
  let dot = null;
  function dotTexture() {
    if (dot) return dot;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    dot = new THREE.CanvasTexture(c);
    dot.colorSpace = THREE.SRGBColorSpace;
    return dot;
  }
  return { dotTexture };
})();

class ParticleField {
  constructor(scene, max = 900, opts = {}) {
    this.max = max;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.drag = opts.drag ?? 1.1;
    this.gravity = opts.gravity ?? 11;
    this.buoyant = opts.buoyant ?? false;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setDrawRange(0, max);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: FXTex.dotTexture() }, uScale: { value: 480 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        varying float vA; varying vec3 vC;
        uniform float uScale;
        void main(){
          vA = aAlpha; vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * (uScale / max(-mv.z, 1.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying float vA; varying vec3 vC;
        void main(){
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a * vA < 0.01) discard;
          gl_FragColor = vec4(vC, t.a * vA);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.geo = g;
  }

  emit(x, y, z, vx, vy, vz, size, life, color) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.alpha[i] = 1;
    const c = color || { r: 1, g: 1, b: 1 };
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
  }

  update(dt) {
    const d = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3] *= d; this.vel[i3 + 2] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.gravity * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = U.clamp(this.life[i] / this.maxLife[i], 0, 1);
      this.alpha[i] = t * t;
      if (this.buoyant) {
        const wy = Water.sampleHeight(this.pos[i3], this.pos[i3 + 2]);
        if (this.pos[i3 + 1] < wy) { this.pos[i3 + 1] = wy; this.vel[i3 + 1] *= -0.25; }
      }
      if (this.life[i] <= 0) this.alpha[i] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }

  dispose() { Engine.disposeObject(this.points); }
}

class WakeRibbon {
  constructor(scene, opts = {}) {
    this.max = opts.segments || 90;
    this.life = opts.life || 2.6;
    this.samples = [];
    /* Where the ribbon lies. A wake lies on the water and a ski track
       lies in the snow, and the only thing that differs between them is
       this function — so it is an argument rather than a second class.
       `min` keeps a track visible against ground it is nearly the same
       colour as; the sea did not need one because foam on water never
       had that problem. */
    this.heightAt = opts.heightAt || ((x, z) => Water.sampleHeight(x, z));
    this.lift = opts.lift ?? 0.10;
    this.conform = opts.conform === true;
    this.tint = new THREE.Color(opts.color || '#ffffff');
    this.alpha = opts.alpha ?? 0.24;
    // three vertices per sample (left / centre / right) so the ribbon can
    // fade out at its edges instead of ending in a hard white rectangle
    const verts = this.max * 3;
    this.posArr = new Float32Array(verts * 3);
    this.colArr = new Float32Array(verts * 4);
    const idx = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 3, b = a + 3;
      idx.push(a, a + 1, b, a + 1, b + 1, b);           // left half
      idx.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1); // right half
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.colArr, 4));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.NormalBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.geo = g;
    this._lastX = null; this._lastZ = null;
  }

  push(x, z, rightX, rightZ, width, strength) {
    if (this._lastX !== null) {
      const d = Math.hypot(x - this._lastX, z - this._lastZ);
      if (d < 1.1) return;
    }
    this._lastX = x; this._lastZ = z;
    this.samples.push({ x, z, rx: rightX, rz: rightZ, w: width, s: strength, age: 0 });
    while (this.samples.length > this.max) this.samples.shift();
  }

  update(dt) {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[0].age > this.life) this.samples.shift();

    const n = this.samples.length;
    for (let i = 0; i < this.max; i++) {
      const si = i < n ? this.samples[n - 1 - i] : null;
      const o = i * 3;
      if (!si) {
        for (let k = 0; k < 3; k++) this.colArr[(o + k) * 4 + 3] = 0;
        continue;
      }
      const t = U.clamp(si.age / this.life, 0, 1);
      // the wake spreads and fades as it ages behind you
      const w = si.w * (0.45 + t * 0.95);
      const y = this.heightAt(si.x, si.z) + this.lift;
      const set = (v, dx) => {
        this.posArr[v * 3] = si.x + si.rx * dx;
        this.posArr[v * 3 + 1] = this.conform
          ? this.heightAt(si.x + si.rx * dx, si.z + si.rz * dx) + this.lift : y;
        this.posArr[v * 3 + 2] = si.z + si.rz * dx;
        this.colArr[v * 4] = this.tint.r;
        this.colArr[v * 4 + 1] = this.tint.g;
        this.colArr[v * 4 + 2] = this.tint.b;
      };
      set(o, w); set(o + 1, 0); set(o + 2, -w);
      // fade in briefly at the stern, then out with age; edges always soft
      const a = (1 - t) * (1 - t) * this.alpha * si.s * U.smoothstep(0, 0.06, t);
      this.colArr[o * 4 + 3] = 0;
      this.colArr[(o + 1) * 4 + 3] = a;
      this.colArr[(o + 2) * 4 + 3] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear() { this.samples.length = 0; this._lastX = null; }
  dispose() { Engine.disposeObject(this.mesh); }
}

class RingBurst {
  constructor(scene, count = 12, opts = {}) {
    this.items = [];
    const geo = new THREE.RingGeometry(0.86, 1.0, opts.segments || 28);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: '#ffffff', transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      this.items.push({ mesh: m, life: 0, max: 1, from: 1, to: 8 });
    }
    this.head = 0;
    this.geo = geo;
  }
  fire(pos, quat, from, to, life, color) {
    const it = this.items[this.head];
    this.head = (this.head + 1) % this.items.length;
    it.mesh.position.copy(pos);
    if (quat) it.mesh.quaternion.copy(quat);
    it.mesh.material.color.set(color || '#ffffff');
    it.from = from; it.to = to; it.life = it.max = life;
    it.mesh.visible = true;
  }
  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      const t = 1 - U.clamp(it.life / it.max, 0, 1);
      const s = U.lerp(it.from, it.to, 1 - Math.pow(1 - t, 2.4));
      it.mesh.scale.setScalar(s);
      it.mesh.material.opacity = (1 - t) * 0.55;
      if (it.life <= 0) it.mesh.visible = false;
    }
  }
  dispose() { for (const it of this.items) Engine.disposeObject(it.mesh); this.geo.dispose(); }
}

class FloatingLabels {
  constructor(container, camera) {
    this.container = container;
    this.camera = camera;
    this.items = [];
    this._v = new THREE.Vector3();
  }
  add(text, worldPos, opts = {}) {
    const el = document.createElement('div');
    el.className = 'float-label ' + (opts.className || '');
    el.textContent = text;
    this.container.appendChild(el);
    this.items.push({
      el, pos: worldPos.clone(), life: opts.life || 1.5, max: opts.life || 1.5,
      rise: opts.rise ?? 9,
    });
  }
  update(dt) {
    const w = Engine.size.w, h = Engine.size.h;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) { it.el.remove(); this.items.splice(i, 1); continue; }
      const t = 1 - it.life / it.max;
      it.pos.y += it.rise * dt * (1 - t * 0.6);
      this._v.copy(it.pos).project(this.camera);
      const behind = this._v.z > 1;
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      it.el.style.opacity = behind ? 0 : String(U.clamp(1 - Math.pow(t, 2.2), 0, 1));
      it.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${U.lerp(0.7, 1.15, U.smoothstep(0, 0.25, t))})`;
    }
  }
  clear() { for (const it of this.items) it.el.remove(); this.items.length = 0; }
  dispose() { this.clear(); }
}

/* One bundle a mission can own and dispose in a single call. */
class FXSystem {
  constructor(scene, camera, labelContainer, opts = {}) {
    this.spray = new ParticleField(scene, opts.sprayMax || 1100,
      Object.assign({ drag: 1.4, gravity: 13, buoyant: false }, opts.spray || {}));
    this.sparks = new ParticleField(scene, opts.sparkMax || 400,
      Object.assign({ drag: 0.9, gravity: 4, additive: true }, opts.sparks || {}));
    this.wake = new WakeRibbon(scene,
      Object.assign({ segments: 96, life: 3.0 }, opts.wake || {}));
    this.rings = new RingBurst(scene, 14);
    this.labels = new FloatingLabels(labelContainer, camera);
    this._c = new THREE.Color();
  }
  update(dt) {
    this.spray.update(dt);
    this.sparks.update(dt);
    this.wake.update(dt);
    this.rings.update(dt);
    this.labels.update(dt);
  }
  dispose() {
    this.spray.dispose(); this.sparks.dispose(); this.wake.dispose();
    this.rings.dispose(); this.labels.dispose();
  }
}
