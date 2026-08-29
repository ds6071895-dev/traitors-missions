/* ------------------------------------------------------------------
   sky.js — sky dome, sun, clouds, and the distant mountain rings
   that give the horizon its depth.
------------------------------------------------------------------ */
const Sky = (() => {

  const SUN_DIR = new THREE.Vector3(0.42, 0.36, -0.83).normalize();

  const PALETTE = {
    zenith:  '#1668d4',
    middle:  '#79cdf4',
    horizon: '#dff2ff',
    glow:    '#ffe4a8',
    fog:     '#c8ebff',
  };

  /* The sky's whole appearance in one record. `setPreset` merges a partial
     over it; `build` then reads it. Time of day therefore has to be chosen
     *before* the sky is built — which is right, because the mountain haze is
     baked into vertex colours against `PALETTE.fog`. */
  const DEFAULT_LOOK = {
    id: 'noon',
    zenith: '#1668d4', middle: '#79cdf4', horizon: '#dff2ff',
    glow: '#ffe4a8', fog: '#c8ebff',
    sunDir: [0.42, 0.36, -0.83],
    sunInner: 'rgba(255,255,240,1)', sunOuter: 'rgba(255,214,140,0.55)', sunScale: 1400,
    cloud: '#ffffff', cloudEmissive: '#c6e4f9', cloudIntensity: 0.66, cloudOpacity: 0.95,
    bird: '#20344d',
    peakRock: '#5f6f86', peakGrass: '#2f9e6a', peakHaze: 0.42,
    nearRock: '#59697f', nearGrass: '#31a06c', nearHaze: 0.24,
    ridgeA: '#5f7fc4', ridgeB: '#b39ae0', ridgeHaze: 0.9,
    starCount: 0,
  };
  const look = Object.assign({}, DEFAULT_LOOK);

  const skyUniforms = {
    uZenith:  { value: new THREE.Color(PALETTE.zenith) },
    uMiddle:  { value: new THREE.Color(PALETTE.middle) },
    uHorizon: { value: new THREE.Color(PALETTE.horizon) },
    uGlow:    { value: new THREE.Color(PALETTE.glow) },
    uSunDir:  { value: SUN_DIR.clone() },
  };

  const SKY_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position.z = gl_Position.w; // always at the far plane
    }
  `;

  const SKY_FRAG = `
    uniform vec3 uZenith, uMiddle, uHorizon, uGlow, uSunDir;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y, -1.0, 1.0);
      vec3 col = mix(uHorizon, uMiddle, smoothstep(-0.02, 0.30, h));
      col = mix(col, uZenith, smoothstep(0.22, 0.85, h));

      float sun = max(dot(d, normalize(uSunDir)), 0.0);
      col += uGlow * pow(sun, 6.0) * 0.55;          // broad haze
      col += uGlow * pow(sun, 220.0) * 2.2;         // tight core bloom
      col = mix(col, uHorizon, smoothstep(0.06, -0.25, h)); // below the horizon

      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }
  `;

  // Merge a partial look and push it at everything that is already live.
  // Anything only used at build time (haze, peak colours) simply waits.
  function setPreset(p) {
    Object.assign(look, DEFAULT_LOOK, p || {});
    PALETTE.zenith = look.zenith; PALETTE.middle = look.middle;
    PALETTE.horizon = look.horizon; PALETTE.glow = look.glow; PALETTE.fog = look.fog;
    SUN_DIR.set(look.sunDir[0], look.sunDir[1], look.sunDir[2]).normalize();
    skyUniforms.uZenith.value.set(look.zenith);
    skyUniforms.uMiddle.value.set(look.middle);
    skyUniforms.uHorizon.value.set(look.horizon);
    skyUniforms.uGlow.value.set(look.glow);
    skyUniforms.uSunDir.value.copy(SUN_DIR);
    return look;
  }
  const resetPreset = () => setPreset(DEFAULT_LOOK);

  function glowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0.00, inner);
    grd.addColorStop(0.25, outer);
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ---------------- distant hazy ridge (the furthest layer) --------------- */
  function buildFarRidge(rng, radius, base, height, colA, colB) {
    const cols = 420;
    const pos = [], col = [];
    const cA = new THREE.Color(colA), cB = new THREE.Color(colB), tmp = new THREE.Color();
    const h = [];
    for (let i = 0; i <= cols; i++) {
      const t = i / cols;
      let v = U.fbm1(t * 9, 4, 7) * 0.5 + 0.5;
      v = Math.pow(v, 1.5);
      v += Math.max(0, U.fbm1(t * 3.1 + 40, 2, 3)) * 0.5;
      h.push(base + v * height);
    }
    h[cols] = h[0];
    for (let i = 0; i < cols; i++) {
      const a0 = (i / cols) * Math.PI * 2, a1 = ((i + 1) / cols) * Math.PI * 2;
      const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
      const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
      const y0 = h[i], y1 = h[i + 1];
      pos.push(x0, -80, z0,  x1, -80, z1,  x1, y1, z1);
      pos.push(x0, -80, z0,  x1, y1, z1,   x0, y0, z0);
      const shade = 0.85 + 0.3 * ((i * 7919) % 13) / 13;
      const push = (y) => {
        const t = U.clamp((y - base) / Math.max(height, 1), 0, 1);
        tmp.copy(cA).lerp(cB, t * shade);
        if (t > 0.72) tmp.lerp(new THREE.Color('#ffffff'), (t - 0.72) * 2.2);
        col.push(tmp.r, tmp.g, tmp.b);
      };
      push(-80); push(-80); push(y1);
      push(-80); push(y1);  push(y0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, fog: false, depthWrite: false,
    }));
  }

  /* ---------------- mid-distance peaks (real low-poly cones) -------------- */
  function buildPeaks(rng, radius, spread, count, opts = {}) {
    const geos = [];
    const rock = new THREE.Color(opts.rock || '#5f6f86');
    const grass = new THREE.Color(opts.grass || '#2f9e6a');
    const snow = new THREE.Color('#f3fbff');
    const haze = opts.haze ?? 0.42;
    const hMin = opts.hMin ?? 210, hMax = opts.hMax ?? 620;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.range(-0.08, 0.08);
      const r = radius + rng.range(-spread, spread);
      const h = rng.range(hMin, hMax);
      const rad = h * rng.range(0.55, 1.05);
      const seg = rng.int(14, 18);
      const g = new THREE.ConeGeometry(rad, h, seg, 7);
      // Rough the silhouette up so no two peaks look alike. The wobble is a
      // function of the vertex's own angle, not a fresh random per vertex, so
      // duplicated seam vertices move together and the cone stays sealed.
      const p = g.attributes.position;
      const w1 = rng.range(2, 4), w2 = rng.range(5, 9), w3 = rng.range(9, 15);
      const ph1 = rng.range(0, 6.28), ph2 = rng.range(0, 6.28), ph3 = rng.range(0, 6.28);
      const ridge = rng.range(0.18, 0.34);
      for (let v = 0; v < p.count; v++) {
        const y = p.getY(v), x = p.getX(v), z = p.getZ(v);
        const ang = Math.atan2(z, x);
        const t = U.clamp((y + h / 2) / h, 0, 1);
        // spurs running down from the summit: strong at the base, gone at the
        // top, which is what stops a cone from reading as a traffic cone
        const k = 1
          + ridge * Math.sin(ang * w1 + ph1) * (1 - t * 0.65)
          + 0.11 * Math.sin(ang * w2 + ph2) * (1 - t * 0.5)
          + 0.05 * Math.sin(ang * w3 + ph3);
        const shape = 1 - 0.30 * Math.pow(t, 1.6);
        p.setX(v, x * k * shape);
        p.setZ(v, z * k * shape);
        // notch the skyline so the summit is a ridge, not a point
        p.setY(v, y + Math.sin(ang * w1 * 1.4 + ph2) * h * 0.055 * (0.35 + t)
                 + Math.sin(ang * w2 + ph3) * h * 0.02);
      }
      g.computeVertexNormals();
      const cols = [];
      const c = new THREE.Color();
      for (let v = 0; v < p.count; v++) {
        const t = U.clamp((p.getY(v) + h / 2) / h, 0, 1);
        c.copy(grass).lerp(rock, U.smoothstep(0.05, 0.5, t));
        if (t > 0.60) c.lerp(snow, U.smoothstep(0.60, 0.88, t));
        // a touch of per-face variation so the flanks are not one flat wash
        c.multiplyScalar(0.93 + 0.14 * Math.abs(Math.sin(v * 0.7 + i)));
        // distance haze mixed straight into the vertex colour
        c.lerp(new THREE.Color(PALETTE.fog), haze);
        cols.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.translate(Math.cos(a) * r, h / 2 - 30, Math.sin(a) * r);
      geos.push(g);
    }
    const merged = mergeGeometries(geos);
    return new THREE.Mesh(merged, new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, fog: false,
    }));
  }

  // tiny geometry merge (avoids pulling in the BufferGeometryUtils addon)
  function mergeGeometries(geos) {
    let total = 0, hasCol = true;
    for (const g of geos) {
      // an indexed geometry expands to one vertex per index, not per position
      total += g.index ? g.index.count : g.attributes.position.count;
      hasCol = hasCol && !!g.attributes.color;
    }
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const col = hasCol ? new Float32Array(total * 3) : null;
    let o = 0;
    for (const g of geos) {
      const idx = g.index;
      const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
      const n0 = p.count;
      if (idx) {
        // expand indexed geometry so everything is a flat triangle soup
        for (let i = 0; i < idx.count; i++) {
          const v = idx.getX(i);
          pos[o * 3] = p.getX(v); pos[o * 3 + 1] = p.getY(v); pos[o * 3 + 2] = p.getZ(v);
          if (n) { nrm[o * 3] = n.getX(v); nrm[o * 3 + 1] = n.getY(v); nrm[o * 3 + 2] = n.getZ(v); }
          if (col && c) { col[o * 3] = c.getX(v); col[o * 3 + 1] = c.getY(v); col[o * 3 + 2] = c.getZ(v); }
          o++;
        }
      } else {
        for (let v = 0; v < n0; v++) {
          pos[o * 3] = p.getX(v); pos[o * 3 + 1] = p.getY(v); pos[o * 3 + 2] = p.getZ(v);
          if (n) { nrm[o * 3] = n.getX(v); nrm[o * 3 + 1] = n.getY(v); nrm[o * 3 + 2] = n.getZ(v); }
          if (col && c) { col[o * 3] = c.getX(v); col[o * 3 + 1] = c.getY(v); col[o * 3 + 2] = c.getZ(v); }
          o++;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm.subarray(0, o * 3), 3));
    if (col) g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, o * 3), 3));
    g.computeBoundingSphere();
    return g;
  }

  /* ---------------- clouds ---------------- */
  function buildClouds(rng, count) {
    const geos = [];
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(900, 4200);
      const y = rng.range(420, 900);
      const blobs = rng.int(5, 9);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const spread = rng.range(80, 170);
      for (let b = 0; b < blobs; b++) {
        const s = rng.range(30, 88);
        const g = new THREE.IcosahedronGeometry(s, 1);
        g.scale(rng.range(1.1, 1.9), rng.range(0.46, 0.70), rng.range(0.95, 1.5));
        g.translate(cx + rng.range(-spread, spread), y + rng.range(-16, 22),
                    cz + rng.range(-spread * 0.8, spread * 0.8));
        geos.push(g.index ? g.toNonIndexed() : g);
      }
    }
    for (const g of geos) g.computeVertexNormals();
    const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({
      color: look.cloud, emissive: look.cloudEmissive, emissiveIntensity: look.cloudIntensity,
      flatShading: false, fog: false, transparent: true, opacity: look.cloudOpacity,
      depthWrite: false,
    }));
    mesh.renderOrder = -2;
    return mesh;
  }

  /* ---------------- stars (night presets only) ---------------- */
  // Points on a dome that rides with the camera, drawn behind everything but
  // the sky itself. Only built when a preset actually asks for them.
  function buildStars(rng, count) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // bias towards the upper dome — stars on the horizon read as fireflies
      const y = Math.pow(rng.range(0, 1), 0.55);
      const r = Math.sqrt(1 - y * y);
      const a = rng.range(0, Math.PI * 2);
      pos[i * 3] = Math.cos(a) * r * 8000;
      pos[i * 3 + 1] = y * 8000 + 200;
      pos[i * 3 + 2] = Math.sin(a) * r * 8000;
      c.setHSL(rng.range(0.55, 0.68), rng.range(0.1, 0.5), rng.range(0.55, 1));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size: 26, sizeAttenuation: true, vertexColors: true, fog: false,
      transparent: true, opacity: 0.95, depthWrite: false,
    });
    const pts = new THREE.Points(g, m);
    pts.renderOrder = -900;
    pts.frustumCulled = false;
    return pts;
  }

  /* ---------------- birds ---------------- */
  function buildBirds(rng, count) {
    const pos = new Float32Array(count * 3 * 3 * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.MeshBasicMaterial({ color: look.bird, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    const birds = [];
    for (let i = 0; i < count; i++) {
      birds.push({
        a: rng.range(0, Math.PI * 2), r: rng.range(150, 620), y: rng.range(55, 165),
        sp: rng.range(0.05, 0.11) * rng.sign(), flap: rng.range(0, 6.28), fs: rng.range(7, 11),
        sz: rng.range(1.4, 2.6),
      });
    }
    return { mesh, birds, attr: g.attributes.position };
  }

  let group, farRing, midRing, nearRing, clouds, birdSys, sunSprite, dome, stars;

  function build(scene, rng, opts = {}) {
    if (group) { Engine.disposeObject(group); group = null; }
    if (dome) { Engine.disposeObject(dome); dome = null; }
    if (sunSprite) { Engine.disposeObject(sunSprite); sunSprite = null; }
    group = new THREE.Group();

    dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      })
    );
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    scene.add(dome);

    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(look.sunInner, look.sunOuter),
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
      transparent: true,
    }));
    sunSprite.scale.setScalar(look.sunScale);
    sunSprite.renderOrder = -999;
    scene.add(sunSprite);

    farRing = buildFarRidge(rng, 7600, -40, 900, look.ridgeA, look.ridgeB);
    midRing = buildPeaks(rng, 4600, 950, 30, {
      haze: look.peakHaze, rock: look.peakRock, grass: look.peakGrass,
    });
    nearRing = buildPeaks(rng, 2500, 520, 24, {
      hMin: 150, hMax: 380, haze: look.nearHaze, rock: look.nearRock, grass: look.nearGrass,
    });
    clouds  = buildClouds(rng, 30);
    // A mission where you shoot birds cannot also have birds you are not
    // allowed to shoot, so it asks for a sky without them.
    birdSys = opts.birds === false ? null : buildBirds(rng, 14);
    stars = look.starCount > 0 ? buildStars(rng, look.starCount) : null;

    group.add(farRing, midRing, nearRing, clouds);
    if (birdSys) group.add(birdSys.mesh);
    if (stars) group.add(stars);
    scene.add(group);
    return group;
  }

  const _v = new THREE.Vector3();
  function update(dt, camPos, t) {
    // parallax: the far ring barely moves, so it reads as genuinely distant
    group.position.set(camPos.x, 0, camPos.z);
    farRing.position.set(-camPos.x * 0.06, 0, -camPos.z * 0.06);
    midRing.position.set(-camPos.x * 0.12, 0, -camPos.z * 0.12);
    nearRing.position.set(-camPos.x * 0.20, 0, -camPos.z * 0.20);
    clouds.position.x = (t * 3.5) % 600 - camPos.x * 0.55;
    clouds.position.z = -camPos.z * 0.55;
    dome.position.copy(camPos);
    dome.scale.setScalar(1);
    sunSprite.position.copy(camPos).addScaledVector(SUN_DIR, 9000);

    // flap the birds
    if (birdSys) {
      const a = birdSys.attr; let o = 0;
      for (const b of birdSys.birds) {
        b.a += b.sp * dt;
        b.flap += b.fs * dt;
        const x = camPos.x + Math.cos(b.a) * b.r;
        const z = camPos.z + Math.sin(b.a) * b.r;
        const w = Math.sin(b.flap) * 0.55;
        const fx = -Math.sin(b.a) * b.sz, fz = Math.cos(b.a) * b.sz;
        const sx = Math.cos(b.a) * b.sz * 2.2, sz2 = Math.sin(b.a) * b.sz * 2.2;
        const set = (i, X, Y, Z) => { a.array[i * 3] = X; a.array[i * 3 + 1] = Y; a.array[i * 3 + 2] = Z; };
        set(o++, x, b.y, z);
        set(o++, x + sx, b.y + w * b.sz * 2, z + sz2);
        set(o++, x + fx * 0.4, b.y, z + fz * 0.4);
        set(o++, x, b.y, z);
        set(o++, x - sx, b.y + w * b.sz * 2, z - sz2);
        set(o++, x - fx * 0.4, b.y, z - fz * 0.4);
      }
      a.needsUpdate = true;
    }
  }

  return { build, update, setPreset, resetPreset, DEFAULT_LOOK,
           SUN_DIR, PALETTE, glowTexture, mergeGeometries,
           get look() { return look; } };
})();
