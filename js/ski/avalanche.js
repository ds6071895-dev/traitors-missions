/* ------------------------------------------------------------------
   SkiAvalanche — the wall of snow the Avalanche card deals.

   It used to be a white plane and ninety low-poly balls, and because
   it chases you from behind it spent the whole run off screen. Now it
   is four things and a way of seeing them:

     the cloud     lit, billowing powder: soft billboards born at the toe
                   that climb eighty metres, lean over the front and fall
                   away behind it as the head outruns them
     the front     tumbling snow boulders churning along the toe
     the debris    ice slabs and snapped pines thrown out ahead of it,
                   the only part that ever overtakes you
     the mirror    a rear camera under the AVALANCHE bar, so the thing
                   you are running from is on screen for the whole run

   and, close up, a white-out veil, snow blasting past the camera and a
   rumble you feel before you see anything.

   Everything here is presentation. The gameplay is still one number,
   `avZ`, owned by the mission: this module draws whatever is at it.
------------------------------------------------------------------ */
const SkiAvalanche = (() => {

  const TIERS = {
    low:    { puffs: 170, boulders: 44,  slabs: 10, trunks: 6,  mirror: false },
    medium: { puffs: 320, boulders: 72,  slabs: 16, trunks: 10, mirror: true  },
    high:   { puffs: 480, boulders: 100, slabs: 22, trunks: 14, mirror: true  },
  };

  /* ---------------- the puff ----------------
     Four cauliflower heads in a 2 × 2 sheet: a dozen soft discs piled
     inside a falloff, so one billboard already reads as a knot of
     cloud and the rotation hides that there are only four. */
  function puffTexture() {
    const S = 256, C = S / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const cx = canvas.getContext('2d');
    const rng = U.makeRng(7331);
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2) * C, oy = Math.floor(cell / 2) * C;
      for (let i = 0; i < 14; i++) {
        const a = rng() * U.TAU, d = Math.sqrt(rng()) * C * 0.22;
        const x = ox + C / 2 + Math.cos(a) * d, y = oy + C / 2 + Math.sin(a) * d * 0.85;
        const r = C * (0.14 + rng() * 0.16);
        const g = cx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.32)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = g;
        cx.beginPath(); cx.arc(x, y, r, 0, U.TAU); cx.fill();
      }
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  const VERT = `
    attribute vec3 aPos;
    attribute vec4 aData;   // size, rotation, alpha, shade
    attribute float aCell;
    varying vec2 vUv;
    varying vec2 vCorner;
    varying float vAlpha;
    varying float vShade;
    varying float vDepth;
    void main() {
      vec4 mv = viewMatrix * vec4(aPos, 1.0);
      float c = cos(aData.y), s = sin(aData.y);
      vec2 r = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
      mv.xy += r * aData.x;
      float d = -mv.z;
      // a puff the camera is inside is a white screen, not a cloud
      vAlpha = aData.z * smoothstep(aData.x * 0.12, aData.x * 0.7, d);
      vUv = (uv + vec2(mod(aCell, 2.0), floor(aCell / 2.0))) * 0.5;
      vCorner = r * 2.0;
      vShade = aData.w;
      vDepth = d;
      gl_Position = projectionMatrix * mv;
    }`;

  const FRAG = `
    uniform sampler2D uMap;
    uniform vec3 uLit, uShadow, uCore, uFogColor;
    uniform float uFogNear, uFogFar;
    varying vec2 vUv;
    varying vec2 vCorner;
    varying float vAlpha;
    varying float vShade;
    varying float vDepth;
    void main() {
      float dens = texture2D(uMap, vUv).a;
      float a = clamp(dens * 1.7, 0.0, 1.0) * vAlpha;
      if (a < 0.004) discard;
      // lit from above and a little from the sun side; thick = darker core
      float l = clamp(0.5 + 0.55 * dot(vCorner, vec2(0.28, 0.96)), 0.0, 1.0);
      l = l * l * (3.0 - 2.0 * l);
      vec3 col = mix(uShadow, uLit, clamp(l * 0.8 + vShade * 0.5 - 0.12, 0.0, 1.0));
      col = mix(col, uCore, smoothstep(0.45, 0.95, dens) * (1.0 - l) * 0.55);
      col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth) * 0.85);
      gl_FragColor = vec4(col, a);
      #include <colorspace_fragment>
    }`;

  function build(scene, face, opts = {}) {
    const tier = TIERS[opts.quality] || TIERS.medium;
    const rng = U.makeRng((opts.seed || 1) + 909);
    const W = face.edge * 2 + 60;
    const root = new THREE.Group();
    root.visible = false;
    scene.add(root);
    const geos = [], mats = [], texs = [];

    /* ---------------- the cloud ---------------- */
    const N = tier.puffs;
    const quad = new THREE.PlaneGeometry(1, 1);
    const pgeo = new THREE.InstancedBufferGeometry();
    pgeo.index = quad.index;
    pgeo.setAttribute('position', quad.getAttribute('position'));
    pgeo.setAttribute('uv', quad.getAttribute('uv'));
    const aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    const aData = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    const aCell = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    aPos.setUsage(THREE.DynamicDrawUsage); aData.setUsage(THREE.DynamicDrawUsage);
    aCell.setUsage(THREE.DynamicDrawUsage);
    pgeo.setAttribute('aPos', aPos); pgeo.setAttribute('aData', aData); pgeo.setAttribute('aCell', aCell);
    pgeo.instanceCount = N;
    const map = puffTexture();
    const pmat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uLit: { value: new THREE.Color('#ffffff') },
        uShadow: { value: new THREE.Color('#8fa6c8') },
        uCore: { value: new THREE.Color('#6d86ab') },
        uFogColor: { value: new THREE.Color('#c8ebff') },
        uFogNear: { value: 400 }, uFogFar: { value: 3000 },
      },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const cloud = new THREE.Mesh(pgeo, pmat);
    cloud.frustumCulled = false;
    cloud.renderOrder = 5;
    root.add(cloud);
    geos.push(quad, pgeo); mats.push(pmat); texs.push(map);

    const puffs = [];
    for (let i = 0; i < N; i++) {
      puffs.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 0,
                   s0: 1, s1: 1, rot: 0, rotV: 0, cell: i % 4, a: 0, shade: 0, surge: false, d: 0 });
    }
    const order = new Uint16Array(N);
    for (let i = 0; i < N; i++) order[i] = i;

    /* ---------------- the front: boulders rolling at the toe ---------------- */
    const bgeo = new THREE.IcosahedronGeometry(1, 1);
    {
      const p = bgeo.getAttribute('position');
      const brng = U.makeRng(4242);
      const seen = new Map();
      for (let v = 0; v < p.count; v++) {
        const key = p.getX(v).toFixed(3) + p.getY(v).toFixed(3) + p.getZ(v).toFixed(3);
        if (!seen.has(key)) seen.set(key, 0.78 + brng() * 0.4);
        const k = seen.get(key);
        p.setXYZ(v, p.getX(v) * k, p.getY(v) * k * 0.86, p.getZ(v) * k);
      }
      bgeo.computeVertexNormals();
    }
    const bmat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
    const NB = tier.boulders;
    const bmesh = new THREE.InstancedMesh(bgeo, bmat, NB);
    bmesh.frustumCulled = false;
    const boulders = [];
    const tint = new THREE.Color();
    for (let i = 0; i < NB; i++) {
      boulders.push({ lx: rng.range(-W / 2, W / 2), lz: rng.range(-14, 6), r: rng.range(2.6, 8.5),
                      ph: rng() * U.TAU, wob: rng() * U.TAU, spin: rng.range(0.7, 1.3) });
      tint.set('#ffffff').lerp(new THREE.Color('#c9d9ee'), rng() * 0.6);
      bmesh.setColorAt(i, tint);
    }
    root.add(bmesh);
    geos.push(bgeo); mats.push(bmat);

    /* ---------------- the debris ---------------- */
    const sgeo = new THREE.BoxGeometry(1, 1, 1);
    const smat = new THREE.MeshLambertMaterial({ color: '#dff0ff', flatShading: true });
    const tgeo = new THREE.CylinderGeometry(0.32, 0.5, 1, 6);
    const tmat = new THREE.MeshLambertMaterial({ color: '#3b2a1e', flatShading: true });
    const needle = new THREE.ConeGeometry(2.1, 5.5, 6);
    needle.translate(0, 2.2, 0);
    const nmat = new THREE.MeshLambertMaterial({ color: '#1f4a36', flatShading: true });
    const smesh = new THREE.InstancedMesh(sgeo, smat, tier.slabs);
    const tmesh = new THREE.InstancedMesh(tgeo, tmat, tier.trunks);
    const nmesh = new THREE.InstancedMesh(needle, nmat, tier.trunks);
    for (const m of [smesh, tmesh, nmesh]) { m.frustumCulled = false; root.add(m); }
    geos.push(sgeo, tgeo, needle); mats.push(smat, tmat, nmat);
    const debris = [];
    for (let i = 0; i < tier.slabs + tier.trunks; i++) {
      const trunk = i >= tier.slabs;
      debris.push({
        trunk, slot: trunk ? i - tier.slabs : i, live: false,
        x: 0, y: -1e5, z: 0, vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0,
        sx: trunk ? 1 : rng.range(2.4, 6.5), sy: trunk ? rng.range(9, 15) : rng.range(1.2, 2.8),
        sz: trunk ? 1 : rng.range(2.4, 5.5),
      });
    }

    /* ---------------- the mirror ---------------- */
    const mirrorCam = tier.mirror ? new THREE.PerspectiveCamera(52, 3, 1, 1600) : null;

    const d = new THREE.Object3D();
    const q = new THREE.Quaternion(), e = new THREE.Euler(), up = new THREE.Vector3();
    const ground = new Float32Array(17);   // heights across the front, sampled once a frame
    const groundBack = new Float32Array(17);

    const A = {
      root, cloud, mirrorCam, W, tier,
      released: false, releaseT: 0, spawnAcc: 0, debrisAcc: 0, prevZ: null, speed: 0,
      reset() {
        A.released = false; A.releaseT = 0; A.spawnAcc = 0; A.debrisAcc = 0;
        A.prevZ = null; A.speed = 0;
        for (const p of puffs) { p.age = 1; p.life = 0; }
        for (const b of debris) { b.live = false; b.y = -1e5; }
        root.visible = false;
      },

      /* The frame. `z` is the mission's avZ, `running` whether the wall
         is moving, `view` the camera the cloud is sorted for, `focus`
         the skier it is chasing. */
      update(dt, z, running, view, focus) {
        if (running && !A.released) { A.released = true; A.releaseT = 0; }
        if (!A.released) { root.visible = false; return; }
        A.releaseT += dt;
        if (A.prevZ !== null && dt > 0) A.speed = U.damp(A.speed, (z - A.prevZ) / dt, 4, dt);
        A.prevZ = z;
        const near = focus.z - z < 900;
        root.visible = near;
        if (!near) return;
        const cx = face.cxAt(z);

        // the ground across the front, 17 columns, at the toe and behind it
        for (let i = 0; i < 17; i++) {
          const x = cx - W / 2 + (W * i) / 16;
          ground[i] = face.heightAt(x, z + 4);
          groundBack[i] = face.heightAt(x, z - 16);
        }
        const groundAt = (lx, lz) => {
          const f = U.clamp((lx + W / 2) / W * 16, 0, 16);
          const i = Math.min(15, Math.floor(f)), t = f - i;
          const a = U.lerp(ground[i], ground[i + 1], t), b = U.lerp(groundBack[i], groundBack[i + 1], t);
          return U.lerp(b, a, U.clamp((lz + 16) / 20, -3, 2));
        };

        /* ---- spawn: a burst on release, then enough to keep it full ---- */
        const burst = A.releaseT < 2.2 ? 3.2 : 1;
        A.spawnAcc += dt * (N / 4.3) * burst;
        let guard = 0;
        while (A.spawnAcc >= 1 && guard++ < N) {
          A.spawnAcc -= 1;
          let best = 0, bestAge = -1;
          for (let k = 0; k < 6; k++) {             // an old or dead slot
            const j = (Math.random() * N) | 0, p = puffs[j];
            const ag = p.life > 0 ? p.age / p.life : 9;
            if (ag > bestAge) { bestAge = ag; best = j; }
          }
          const p = puffs[best];
          // most of the cloud is where the skier is; the rest fills the width
          const lx = Math.random() < 0.55
            ? U.clamp(focus.x - cx + (Math.random() - 0.5) * 220, -W / 2, W / 2)
            : (Math.random() - 0.5) * W;
          p.surge = Math.random() < 0.3;
          const lz = p.surge ? 2 + Math.random() * 14 : -8 + Math.random() * 12;
          p.x = cx + lx; p.z = z + lz;
          p.y = groundAt(lx, lz) + (p.surge ? Math.random() * 3 : Math.random() * 9);
          const sp = Math.max(A.speed, 0);
          if (p.surge) {
            p.vx = (Math.random() - 0.5) * 8; p.vy = 2 + Math.random() * 5;
            p.vz = sp * (1.0 + Math.random() * 0.28);
            p.life = 1.3 + Math.random() * 1.1; p.s0 = 5 + Math.random() * 4; p.s1 = 16 + Math.random() * 10;
            p.shade = 0.75;
          } else {
            const tall = Math.random() < 0.22;
            p.vx = (Math.random() - 0.5) * 6;
            p.vy = tall ? 30 + Math.random() * 12 : 12 + Math.random() * 18;
            p.vz = sp * (0.9 + Math.random() * 0.25);
            p.life = 3.6 + Math.random() * 3.2;
            p.s0 = 9 + Math.random() * 9; p.s1 = 34 + Math.random() * 34;
            p.shade = Math.random();
          }
          p.age = 0; p.rot = Math.random() * U.TAU; p.rotV = (Math.random() - 0.5) * 0.9;
          p.cell = (Math.random() * 4) | 0; p.a = 0.75 + Math.random() * 0.25;
        }

        /* ---- advance and sort ---- */
        const cam = view.position;
        const sp = Math.max(A.speed, 0);
        const lag = Math.exp(-0.42 * dt);
        for (let i = 0; i < N; i++) {
          const p = puffs[i];
          if (p.age >= p.life) { p.d = -1; continue; }
          p.age += dt;
          p.vy *= lag;
          // the head leans over the front, then the front outruns it
          const want = p.surge ? sp * 0.8 : sp * (0.38 + 0.4 * Math.max(0, 1 - p.age / 1.6));
          p.vz = U.damp(p.vz, want, 0.9, dt);
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.rot += p.rotV * dt;
          const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
          p.d = dx * dx + dy * dy + dz * dz;
        }
        order.sort((a, b) => puffs[b].d - puffs[a].d);
        const P = aPos.array, D = aData.array, Cl = aCell.array;
        for (let k = 0; k < N; k++) {
          const p = puffs[order[k]];
          const o3 = k * 3, o4 = k * 4;
          if (p.d < 0) { D[o4 + 2] = 0; D[o4] = 0; P[o3 + 1] = -1e5; continue; }
          const t = Math.min(1, p.age / p.life);
          const grow = 1 - Math.pow(1 - t, 2.2);
          P[o3] = p.x; P[o3 + 1] = p.y; P[o3 + 2] = p.z;
          D[o4] = U.lerp(p.s0, p.s1, grow);
          D[o4 + 1] = p.rot;
          D[o4 + 2] = p.a * U.smoothstep(0, 0.12, t) * (1 - U.smoothstep(0.62, 1, t));
          // higher = lit; the toe is in its own shadow
          D[o4 + 3] = U.clamp(p.shade * 0.4 + t * 0.6, 0, 1);
          Cl[k] = p.cell;
        }
        aPos.needsUpdate = true; aData.needsUpdate = true; aCell.needsUpdate = true;
        const fog = scene.fog;
        if (fog) {
          pmat.uniforms.uFogColor.value.copy(fog.color);
          pmat.uniforms.uFogNear.value = fog.near; pmat.uniforms.uFogFar.value = fog.far;
        }

        /* ---- the toe: boulders churning over each other ---- */
        for (let i = 0; i < NB; i++) {
          const b = boulders[i];
          b.ph += dt * (sp / b.r) * 0.55 * b.spin + dt * 0.6;
          b.wob += dt * 2.3;
          const bounce = Math.abs(Math.sin(b.ph * 0.9 + b.wob * 0.3)) * b.r * 0.7;
          const lz = b.lz + Math.sin(b.wob * 0.5) * 3;
          d.position.set(cx + b.lx + Math.sin(b.wob * 0.37) * 2, groundAt(b.lx, lz) + b.r * 0.55 + bounce, z + lz);
          d.rotation.set(b.ph, b.wob * 0.2, Math.sin(b.wob * 0.4) * 0.5);
          d.scale.setScalar(b.r * (1 + Math.sin(b.wob) * 0.06));
          d.updateMatrix();
          bmesh.setMatrixAt(i, d.matrix);
        }
        bmesh.instanceMatrix.needsUpdate = true;

        /* ---- debris: thrown out ahead, swallowed again ---- */
        const gap = focus.z - z;
        A.debrisAcc += dt * (gap < 320 ? 5.5 : 1.5) * (A.releaseT < 2.2 ? 2.5 : 1);
        for (const b of debris) {
          if (!b.live && A.debrisAcc >= 1) {
            A.debrisAcc -= 1;
            b.live = true;
            b.x = Math.random() < 0.7 ? focus.x + (Math.random() - 0.5) * 90 : cx + (Math.random() - 0.5) * W * 0.9;
            b.z = z + 2 + Math.random() * 6;
            b.y = face.heightAt(b.x, b.z) + 6 + Math.random() * 10;
            b.vx = (Math.random() - 0.5) * 10;
            b.vy = 12 + Math.random() * 16;
            b.vz = sp + 10 + Math.random() * 20;
            b.rx = Math.random() * U.TAU; b.ry = Math.random() * U.TAU; b.rz = Math.random() * U.TAU;
            b.wx = (Math.random() - 0.5) * 7; b.wy = (Math.random() - 0.5) * 4; b.wz = (Math.random() - 0.5) * 7;
          }
          if (!b.live) continue;
          b.vy -= 24 * dt;
          b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
          const g = face.heightAt(b.x, b.z) + (b.trunk ? 0.8 : b.sy * 0.5);
          if (b.y < g) {
            b.y = g; b.vy = Math.abs(b.vy) * 0.38; b.vz *= 0.62; b.vx *= 0.7;
            b.wx *= 0.7; b.wz *= 0.7;
          }
          if (b.z < z - 12 || b.z > z + 240) b.live = false;
        }
        let si = 0, ti = 0;
        for (const b of debris) {
          d.position.set(b.x, b.live ? b.y : -1e5, b.z);
          d.rotation.set(b.rx, b.ry, b.rz);
          if (b.trunk) {
            d.scale.set(1.3, b.sy, 1.3);
            d.updateMatrix(); tmesh.setMatrixAt(ti, d.matrix);
            // the crown rides the top end of the trunk
            e.set(b.rx, b.ry, b.rz); q.setFromEuler(e);
            d.scale.set(1, 1, 1);
            d.position.add(up.set(0, b.sy * 0.15, 0).applyQuaternion(q));
            d.updateMatrix(); nmesh.setMatrixAt(ti, d.matrix);
            ti++;
          } else {
            d.scale.set(b.sx, b.sy, b.sz);
            d.updateMatrix(); smesh.setMatrixAt(si, d.matrix);
            si++;
          }
        }
        smesh.instanceMatrix.needsUpdate = true;
        tmesh.instanceMatrix.needsUpdate = true;
        nmesh.instanceMatrix.needsUpdate = true;
      },

      /* Where the rear camera sits: ahead of the skier and above, looking
         straight back up the fall line (not the heading, or it would
         swing on every turn) at the snow the wall is on. */
      aimMirror(focus, aspect) {
        if (!mirrorCam) return null;
        const bz = focus.z - 150;
        mirrorCam.aspect = aspect;
        mirrorCam.position.set(focus.x, focus.y + 7, focus.z + 12);
        mirrorCam.lookAt(focus.x, Math.max(focus.y + 4, face.heightAt(face.cxAt(bz), bz) - 4), bz);
        mirrorCam.updateProjectionMatrix();
        return mirrorCam;
      },

      dispose() {
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
        for (const t of texs) t.dispose();
        bmesh.dispose(); smesh.dispose(); tmesh.dispose(); nmesh.dispose();
        if (root.parent) root.parent.remove(root);
      },
    };
    return A;
  }

  /* ---------------- the noise ----------------
     A floor of rumble from the moment it lets go, a sub under it that
     shakes as it closes, and the crack of the slab going at the start. */
  function rumble() {
    const ctx = AudioBus.ctx, dest = AudioBus.bus && AudioBus.bus('sfx');
    if (!AudioBus.ready || !ctx || !dest) return { set() {}, stop() {} };
    const t = ctx.currentTime;
    const n = AudioBus.noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; lp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    n.connect(lp); lp.connect(g); g.connect(dest); n.start(t);
    const n2 = AudioBus.noiseSource();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const g2 = ctx.createGain(); g2.gain.value = 0.0001;
    n2.connect(bp); bp.connect(g2); g2.connect(dest); n2.start(t);
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 34;
    const trem = ctx.createOscillator(); trem.type = 'sine'; trem.frequency.value = 7;
    const tremG = ctx.createGain(); tremG.gain.value = 0;
    const sg = ctx.createGain(); sg.gain.value = 0.0001;
    trem.connect(tremG); tremG.connect(sg.gain);
    sub.connect(sg); sg.connect(dest); sub.start(t); trem.start(t);
    return {
      // near01: 0 far away .. 1 on top of you
      set(near01) {
        const tt = ctx.currentTime, k = U.clamp(near01, 0, 1);
        g.gain.setTargetAtTime(0.05 + k * k * 0.55, tt, 0.25);
        lp.frequency.setTargetAtTime(110 + k * 260, tt, 0.25);
        g2.gain.setTargetAtTime(0.0001 + k * k * k * 0.16, tt, 0.2);
        sg.gain.setTargetAtTime(0.0001 + k * k * 0.30, tt, 0.25);
        tremG.gain.setTargetAtTime(k * k * 0.18, tt, 0.25);
      },
      stop() {
        const tt = ctx.currentTime;
        for (const gg of [g, g2, sg]) gg.gain.setTargetAtTime(0.0001, tt, 0.35);
        tremG.gain.setTargetAtTime(0, tt, 0.2);
        setTimeout(() => { try { n.stop(); n2.stop(); sub.stop(); trem.stop(); } catch (e) {} }, 1600);
      },
    };
  }

  if (typeof AudioBus !== 'undefined' && AudioBus.define) {
    // the slab letting go: a crack like a rifle, then the mountain
    AudioBus.define('avRelease', (c, dest) => {
      const t = c.currentTime;
      const n = AudioBus.noiseSource();
      if (n) {
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        n.connect(hp); hp.connect(g); g.connect(dest); n.start(t); n.stop(t + 0.3);
      }
      const os = c.createOscillator(), og = c.createGain();
      os.type = 'sine';
      os.frequency.setValueAtTime(70, t + 0.05);
      os.frequency.exponentialRampToValueAtTime(24, t + 2.2);
      og.gain.setValueAtTime(0.0001, t + 0.05);
      og.gain.exponentialRampToValueAtTime(0.55, t + 0.12);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      os.connect(og); og.connect(dest); os.start(t + 0.05); os.stop(t + 2.5);
    });
    // and taken by it
    AudioBus.define('avBury', (c, dest) => {
      const t = c.currentTime;
      const n = AudioBus.noiseSource();
      if (!n) return;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(80, t + 1.8);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      n.connect(lp); lp.connect(g); g.connect(dest); n.start(t); n.stop(t + 2.3);
    });
  }

  return { TIERS, build, rumble };
})();
