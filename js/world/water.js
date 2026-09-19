/* ------------------------------------------------------------------
   water.js — Gerstner ocean.
   The exact same wave stack is evaluated on the GPU (for the mesh)
   and on the CPU (so the boat, the hoops and the spray all agree
   about where the surface actually is).
------------------------------------------------------------------ */
const Water = (() => {

  // dir is normalised on load. len = wavelength(m), amp = height(m),
  // steep = Gerstner Q (0..1, pinches the crests), speed = phase speed
  const WAVES = [
    { dx:  1.00, dz:  0.32, len: 96, amp: 1.85, steep: 0.62, speed: 0.85 },
    { dx:  0.72, dz: -0.70, len: 54, amp: 1.05, steep: 0.55, speed: 1.05 },
    { dx: -0.45, dz:  0.90, len: 29, amp: 0.40, steep: 0.50, speed: 1.35 },
    { dx:  0.15, dz:  1.00, len: 15, amp: 0.15, steep: 0.45, speed: 1.80 },
    { dx: -0.86, dz:  0.51, len:  8.5, amp: 0.085, steep: 0.40, speed: 2.20 },
    { dx:  0.55, dz:  0.83, len:  4.6, amp: 0.038, steep: 0.35, speed: 2.70 },
  ];

  // precompute per-wave constants
  const W = WAVES.map(w => {
    const l = Math.hypot(w.dx, w.dz);
    const dx = w.dx / l, dz = w.dz / l;
    const k = (Math.PI * 2) / w.len;              // angular wave number
    const phase = w.speed * Math.sqrt(9.81 * k);  // deep-water dispersion
    return { dx, dz, k, amp: w.amp, q: w.steep / (k * w.amp * WAVES.length), phase,
             dx0: dx, dz0: dz, amp0: w.amp, steep: w.steep, len: w.len };
  });
  const DEFAULT_SEA = { swell: 1, chop: 1, wind: 0 };
  const sea = Object.assign({}, DEFAULT_SEA);

  let time = 0;
  // One surface, three shells: a fine square under the boat and two polar
  // annuli that carry it out to the horizon. They butt up against each other
  // instead of stacking, so there is no overlapping-sheet seam.
  const nearGeo = { size: 620, seg: 310 };        // ~2 m quads under the boat
  const midGeo  = { inner: 250, outer: 3400, rings: 96, theta: 220 };
  const farGeo  = { inner: 3300, outer: 15000, rings: 40, theta: 140 };

  const uniforms = {
    uTime:      { value: 0 },
    uHighland:  { value: 0 },
    uDetail:    { value: 1 },
    uSunDir:    { value: new THREE.Vector3(0.42, 0.36, -0.83).normalize() },
    uSunCol:    { value: new THREE.Color('#fff0c4') },
    uDeep:      { value: new THREE.Color('#04304d') },
    uShallow:   { value: new THREE.Color('#12a6c6') },
    uCrest:     { value: new THREE.Color('#8df3e2') },
    uSky:       { value: new THREE.Color('#95dfff') },
    uFog:       { value: new THREE.Color('#bfe9ff') },
    uFogNear:   { value: 260 },
    uFogFar:    { value: 3200 },
    uWaveDir:   { value: W.map(w => new THREE.Vector2(w.dx, w.dz)) },
    uWaveParam: { value: W.map(w => new THREE.Vector4(w.k, w.amp, w.q, w.phase)) },
    uBoat:      { value: new THREE.Vector3() },
    uWakeAge:   { value: 0 },
  };

  const COMMON = `
    #define NW ${W.length}
    uniform float uTime;
    uniform vec2  uWaveDir[NW];
    uniform vec4  uWaveParam[NW]; // k, amp, q, phase

    // displacement + the analytic surface normal, in one pass
    vec3 gerstner(vec2 p, out float crest, out vec3 nrm) {
      vec3 d = vec3(0.0);
      vec3 n = vec3(0.0, 1.0, 0.0);
      crest = 0.0;
      float amps = 0.0;
      for (int i = 0; i < NW; i++) {
        vec2  dir = uWaveDir[i];
        float k = uWaveParam[i].x, a = uWaveParam[i].y;
        float q = uWaveParam[i].z, ph = uWaveParam[i].w;
        float th = k * dot(dir, p) + uTime * ph;
        float s = sin(th), c = cos(th);
        d.x += q * a * dir.x * c;
        d.z += q * a * dir.y * c;
        d.y += a * s;
        n.x -= dir.x * k * a * c;
        n.z -= dir.y * k * a * c;
        n.y -= q * k * a * s;
        crest += a * s;
        amps  += a;
      }
      crest = crest / max(amps, 0.001);
      nrm = normalize(n);
      return d;
    }
  `;

  const VERT = COMMON + `
    varying vec3  vWorld;
    varying vec3  vNormal;
    varying float vCrest;
    varying float vDist;

    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float crest;
      vec3 nrm;
      vec3 d = gerstner(wp.xz, crest, nrm);
      wp.xyz += d;
      vWorld = wp.xyz;
      vNormal = nrm;
      vCrest = crest;
      vec4 mv = viewMatrix * wp;
      vDist = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;

  const FRAG = `
    uniform vec3  uSunDir, uSunCol, uDeep, uShallow, uCrest, uSky, uFog;
    uniform float uFogNear, uFogFar, uTime, uHighland, uDetail;
    varying vec3  vWorld;
    varying vec3  vNormal;
    varying float vCrest;
    varying float vDist;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      // The facet normal from screen-space derivatives is what gives the
      // ocean its low-poly read; the analytic normal is what keeps it from
      // looking like crumpled paper. Blend, don't pick.
      vec3 facet = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      if (facet.y < 0.0) facet = -facet;
      vec3 smoothN = normalize(vNormal);
      // Close in the triangles are small, so faceting reads as style. Far out
      // they are enormous, and faceting would read as broken geometry — so the
      // further away a fragment is, the more it trusts the analytic normal.
      float near = 1.0 - smoothstep(90.0, 1100.0, vDist);
      vec3 n = normalize(mix(smoothN, facet, near * mix(0.62, 0.08, uHighland)));
      if (uHighland > 0.5) {
        vec2 p = vWorld.xz;
        float detail = near * uDetail * (1.0 - smoothstep(30.0, 190.0, vDist));
        vec2 ripples = vec2(sin(p.x * 2.3 + p.y * 1.4 + uTime * 2.6),
                            cos(p.y * 2.8 - p.x * 1.1 - uTime * 2.0));
        ripples += .45 * vec2(sin(p.y * 6.1 + uTime * 3.7), cos(p.x * 5.3 - uTime * 4.1));
        n = normalize(n + vec3(ripples.x, 0.0, ripples.y) * .022 * detail);
      }

      /* From below this is a ceiling, not a sea. Both normals above were
         forced upward, which would light the underside as if it were the
         top; flipping the blended one turns the light *through* the water
         instead of off it, and lets the Fresnel mirror the water rather
         than the sky. (Scaling the blend is the same as scaling both
         inputs — mix is linear and normalize does not care about sign.)
         gl_FrontFacing is the only thing in here that knows which side
         of the surface the eye is on. */
      float faceSign = gl_FrontFacing ? 1.0 : -1.0;
      n *= faceSign;

      vec3 V = normalize(cameraPosition - vWorld);
      vec3 L = normalize(uSunDir);
      vec3 H = normalize(L + V);

      float diff = max(dot(n, L), 0.0);
      float spec = pow(max(dot(n, H), 0.0), 140.0);
      float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
      // measured off whichever face we are looking at, so a wave is just
      // as steep seen from underneath it
      float slope = 1.0 - abs(n.y);            // how tilted this facet is

      float depth = smoothstep(-0.85, 1.0, vCrest);
      vec3 col = mix(uDeep, uShallow, depth);
      col = mix(col, uCrest, smoothstep(0.42, 1.0, vCrest) * 0.55);

      // light bleeding through the back of a wave face
      float sss = pow(max(dot(-L, V), 0.0), 2.0) * smoothstep(0.15, 0.95, vCrest);
      col += vec3(0.10, 0.42, 0.36) * sss * 0.55;

      col *= 0.58 + 0.74 * diff;
      col = mix(col, uSky, clamp(fres, 0.0, 1.0) * 0.42);
      col += uSunCol * spec * mix(2.4, 1.05, uHighland);

      // glitter: fine broken highlights riding the surface
      float gl = vnoise(vWorld.xz * 1.7 + uTime * 0.6) * vnoise(vWorld.xz * 0.9 - uTime * 0.35);
      float glint = pow(max(dot(n, H), 0.0), 26.0) * smoothstep(0.55, 1.0, gl);
      col += uSunCol * glint * mix(1.4, .45, uHighland) * near;

      // whitecaps: steep facets near the top of a swell
      float foam = smoothstep(0.09, 0.30, slope) * smoothstep(0.28, 0.80, vCrest);
      foam *= 0.55 + 0.45 * vnoise(vWorld.xz * 0.8 + uTime * 0.25);
      foam *= mix(1.0, smoothstep(.28, .76, vnoise(vWorld.xz * 2.4 + uTime * .4)), uHighland);
      col = mix(col, vec3(0.94, 0.99, 1.0), clamp(foam, 0.0, 1.0) * 0.92);

      float fog = smoothstep(uFogNear, uFogFar, vDist);
      col = mix(col, uFog, fog);

      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }
  `;

  /* The palette every scene starts from. It is global state on a
     singleton: `build()` resets it, but a mission that changes it
     mid-run owns putting it back, or its water follows the player into
     attract mode and every mission after it. The dive's dispose() is
     the worked example —

       Water.setPalette(Water.DEFAULTS);
       Water.setFog(340, 3600, Sky.PALETTE.fog);
       Water.setSeaState({ swell: 1, chop: 1, wind: 0 });
  */
  const DEFAULTS = {
    deep: '#04304d', shallow: '#12a6c6', crest: '#8df3e2', sky: '#95dfff',
    sunCol: '#fff0c4', sunDir: new THREE.Vector3(0.42, 0.36, -0.83).normalize(),
  };

  let mat, near, mid, far, group;

  function setVisualProfile(profile = null) {
    uniforms.uHighland.value = profile === 'highland' ? 1 : 0;
    uniforms.uDetail.value = profile === 'highland' && GameState.settings.quality === 'low' ? .25 : 1;
  }

  function build(scene, opts = {}) {
    setVisualProfile(opts.visualProfile);
    if (group) { Engine.disposeObject(group); group = null; }
    // a fresh scene starts from calm defaults; the mission dials it up after
    setSeaState(DEFAULT_SEA);
    setPalette(DEFAULTS);
    /* DoubleSide, permanently. All three shells are built in XY and
       rotated flat, so their normals point +Y and a front-face-only
       ocean is culled entirely from underneath — an underwater camera
       would see straight through to the sky dome. It costs no fill for
       geometry nothing ever gets behind (the boat race clamps its
       camera above the swell), and a `side` toggled per mission on a
       shared singleton is exactly the class of bug Sky.resetPreset()
       already exists to paper over. */
    mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });

    group = new THREE.Group();

    const square = (spec, y, order) => {
      const g = new THREE.PlaneGeometry(spec.size, spec.size, spec.seg, spec.seg);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.position.y = y;
      m.renderOrder = order;
      return m;
    };
    // a polar annulus: dense where it meets the shell inside it, coarse at the
    // horizon, which is exactly where the detail is worth spending
    const ring = (spec, y, order) => {
      const g = new THREE.RingGeometry(spec.inner, spec.outer, spec.theta, spec.rings);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), yy = p.getY(i);
        const r = Math.hypot(x, yy) || 1;
        // redistribute the rings so spacing grows with distance
        // clamp before the pow: a hair of float error under `inner` would
        // otherwise raise a negative base and poison the vertex with NaN
        const t = U.clamp((r - spec.inner) / (spec.outer - spec.inner), 0, 1);
        const nr = spec.inner + (spec.outer - spec.inner) * Math.pow(t, 2.2);
        p.setXYZ(i, x / r * nr, yy / r * nr, 0);
      }
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.position.y = y;
      m.renderOrder = order;
      return m;
    };

    near = square(opts.visualProfile === 'highland' ? {...nearGeo, seg: GameState.settings.quality === 'low' ? 156 : GameState.settings.quality === 'medium' ? 220 : nearGeo.seg} : nearGeo, 0, 0);
    mid = ring(midGeo, -0.05, -1);
    far = ring(farGeo, -0.10, -2);

    group.add(far, mid, near);
    scene.add(group);
    return group;
  }

  // keep the tiles under the camera, snapped to the grid so vertices
  // never "swim" as we move
  function follow(x, z) {
    // the fine square is snapped to its own grid so its vertices never slide
    // through the wave field; the smooth-shaded annuli just track the camera
    const q = nearGeo.size / nearGeo.seg;
    near.position.x = Math.round(x / q) * q;
    near.position.z = Math.round(z / q) * q;
    mid.position.x = x; mid.position.z = z;
    far.position.x = x; far.position.z = z;
  }

  function update(dt) { time += dt; uniforms.uTime.value = time; }

  /* ---------------- CPU side: identical maths ---------------- */

  function displace(x, z, out) {
    let dx = 0, dy = 0, dz = 0;
    for (let i = 0; i < W.length; i++) {
      const w = W[i];
      const th = w.k * (w.dx * x + w.dz * z) + time * w.phase;
      const s = Math.sin(th), c = Math.cos(th);
      dx += w.q * w.amp * w.dx * c;
      dz += w.q * w.amp * w.dz * c;
      dy += w.amp * s;
    }
    out.x = dx; out.y = dy; out.z = dz;
    return out;
  }

  const _d = { x: 0, y: 0, z: 0 };

  // Gerstner displaces horizontally too, so to find the surface *above*
  // a world (x,z) we invert the displacement with a couple of iterations.
  function sampleHeight(x, z) {
    let px = x, pz = z;
    for (let i = 0; i < 3; i++) {
      displace(px, pz, _d);
      px = x - _d.x; pz = z - _d.z;
    }
    displace(px, pz, _d);
    return _d.y;
  }

  // surface normal + height in one go (analytic Gerstner normal)
  function sampleSurface(x, z, out) {
    let px = x, pz = z;
    for (let i = 0; i < 3; i++) {
      displace(px, pz, _d);
      px = x - _d.x; pz = z - _d.z;
    }
    let nx = 0, ny = 1, nz = 0, y = 0;
    for (let i = 0; i < W.length; i++) {
      const w = W[i];
      const th = w.k * (w.dx * px + w.dz * pz) + time * w.phase;
      const s = Math.sin(th), c = Math.cos(th);
      const wa = w.k * w.amp;
      y  += w.amp * s;
      nx -= w.dx * wa * c;
      nz -= w.dz * wa * c;
      ny -= w.q * wa * s;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    out.height = y;
    out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
    return out;
  }

  /* ---------------- conditions ----------------
     One dial for the size of the swell, one for the short chop on top of
     it, one for the direction the whole field runs. Because the shader
     and the CPU sampler read the same `W`, changing these changes how the
     sea looks and how the boat behaves in the same frame. --------------- */

  // long waves are "swell", short ones are "chop"; anything over ~30 m is
  // the stuff you surf, anything under is the stuff that rattles the hull
  function setSeaState(opts = {}) {
    Object.assign(sea, DEFAULT_SEA, opts);
    const swell = Math.max(0.12, sea.swell);
    const chop = Math.max(0.12, sea.chop);
    const c = Math.cos(sea.wind), s2 = Math.sin(sea.wind);
    for (let i = 0; i < W.length; i++) {
      const w = W[i];
      const gain = w.len >= 30 ? swell : chop;
      w.amp = w.amp0 * gain;
      // q is normalised by amp, so the crests keep their shape (and never
      // loop back on themselves) however big the sea gets
      w.q = w.steep / (w.k * w.amp * W.length);
      w.dx = w.dx0 * c - w.dz0 * s2;
      w.dz = w.dx0 * s2 + w.dz0 * c;
      uniforms.uWaveDir.value[i].set(w.dx, w.dz);
      uniforms.uWaveParam.value[i].set(w.k, w.amp, w.q, w.phase);
    }
  }

  // deep/shallow/crest/sky tint the water; sun direction and colour have to
  // agree with whatever the sky is doing or the specular sits in the wrong place
  function setPalette(p = {}) {
    if (p.deep) uniforms.uDeep.value.set(p.deep);
    if (p.shallow) uniforms.uShallow.value.set(p.shallow);
    if (p.crest) uniforms.uCrest.value.set(p.crest);
    if (p.sky) uniforms.uSky.value.set(p.sky);
    if (p.sunCol) uniforms.uSunCol.value.set(p.sunCol);
    if (p.sunDir) uniforms.uSunDir.value.copy(p.sunDir).normalize();
  }

  // how big the sea currently is, 0..1-ish — the HUD and the boat's
  // launch tuning both want to know
  const seaState = () => Object.assign({}, sea);

  function setFog(near_, far_, col) {
    uniforms.uFogNear.value = near_;
    uniforms.uFogFar.value = far_;
    uniforms.uFog.value.set(col);
  }

  return { build, update, follow, sampleHeight, sampleSurface, uniforms, setFog,
           setSeaState, setPalette, setVisualProfile, seaState, DEFAULTS, surfaceShader: COMMON,
           get time() { return time; } };
})();
