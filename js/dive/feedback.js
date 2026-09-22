/* ------------------------------------------------------------------
   DiveFeedback — what the tide looks like.

   `DiveTide` decides where the water runs and where the air is; this
   draws it, and nothing here can change a rule. Two things:

   - **The races.** A mechanic nobody can see is a mechanic nobody
     uses, so each lane gets a ribbon of scrolling chevrons laid on the
     floor along it — the Descent's boost pads, under water — and a
     stream of silt drifting down it at the water's own speed. Both
     brighten and quicken as the tide builds, so the stage is legible
     from the bottom of the loch without a single label.
   - **The pockets.** A shimmering skin of water under each roof while
     the ebb holds, which is the only way anybody finds out a cave has
     air in it before they need it.
------------------------------------------------------------------ */
const DiveFeedback = (() => {

  function chevrons() {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 128;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 64, 128);
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const y of [30, 94]) {
      c.beginPath(); c.moveTo(10, y + 18); c.lineTo(32, y - 6); c.lineTo(54, y + 18); c.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* A strip laid on the floor from the seaward end of a lane to the
     shoreward one, sampled every few metres so it follows the ground
     down the slope. `v` runs along it in metres / 8, so the chevrons
     keep their shape whatever the lane's length. */
  function ribbon(lane, heightAt, width) {
    const pos = [], uv = [], idx = [];
    const step = 3, n = Math.max(2, Math.ceil(lane.len / step));
    const px = -lane.dz, pz = lane.dx;              // across the lane
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * lane.len;
      const cx = lane.x0 + lane.dx * a, cz = lane.z0 + lane.dz * a;
      for (const side of [-1, 1]) {
        const x = cx + px * side * width * 0.5, z = cz + pz * side * width * 0.5;
        pos.push(x, heightAt(x, z) + 0.35, z);
        uv.push(side < 0 ? 0 : 1, -a / 8);
      }
      if (i < n) {
        const b = i * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  function build(scene, tide, reef, graphics) {
    const group = new THREE.Group();
    group.name = 'tide';
    const heightAt = reef.heightAt;

    // ---- the ribbons
    const tex = chevrons();
    const ribbonMat = new THREE.MeshBasicMaterial({
      map: tex, color: '#9ff4ff', transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    for (const lane of tide.lanes) {
      const m = new THREE.Mesh(ribbon(lane, heightAt, 6.5), ribbonMat);
      m.frustumCulled = false; m.renderOrder = 2;
      group.add(m);
    }

    // ---- the silt running down them
    const PER = 150;
    const N = tide.lanes.length * PER;
    const pts = new Float32Array(N * 3);
    const seed = new Float32Array(N * 3);          // along, across, height, all 0..1
    const rng = U.makeRng(0x7ac3);
    for (let i = 0; i < N; i++) { seed[i * 3] = rng(); seed[i * 3 + 1] = rng() - 0.5; seed[i * 3 + 2] = rng(); }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pts, 3).setUsage(THREE.DynamicDrawUsage));
    const silt = new THREE.Points(pg, new THREE.PointsMaterial({
      color: '#e6fdff', size: 0.34, transparent: true, opacity: 0,
      map: Sky.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.0)'),
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    silt.frustumCulled = false;
    group.add(silt);
    const floorOf = tide.lanes.map(l => {
      // the floor under each lane, sampled once, for the silt to hug
      const s = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * l.len;
        s.push(heightAt(l.x0 + l.dx * a, l.z0 + l.dz * a));
      }
      return s;
    });

    // ---- the pockets
    const pocketMat = new THREE.MeshBasicMaterial({
      color: '#d4fbff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    });
    const pockets = [];
    for (const cave of (reef.caves ? reef.caves.list : [])) {
      const g = new THREE.CircleGeometry(cave.R * DiveTide.POCKET_R, 36);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, pocketMat);
      m.position.set(cave.x, DiveTide.pocketY(cave) + 0.05, cave.z);
      m.renderOrder = 3;
      group.add(m);
      pockets.push(m);
    }

    scene.add(group);

    let travel = 0, race = 0, air = 0;
    return {
      group,
      update(dt, t, stage, cam, sw, raceK) {
        race = U.damp(race, stage.race, 1.2, dt);
        air = U.damp(air, stage.pockets ? 1 : 0, 1.5, dt);
        const speed = DiveTide.RACE.speed * race;
        travel += speed * dt;

        // chevrons crawl shoreward at the water's own pace, and the
        // ribbon brightens a touch while you are actually in a race
        tex.offset.y -= (speed / 8) * dt;
        ribbonMat.opacity = U.clamp(0.10 + race * 0.22 + raceK * 0.12, 0, 0.55);

        for (let li = 0; li < tide.lanes.length; li++) {
          const l = tide.lanes[li], fl = floorOf[li];
          for (let j = 0; j < PER; j++) {
            const i = li * PER + j;
            const f = (seed[i * 3] + travel / l.len) % 1;
            const a = f * l.len;
            const across = seed[i * 3 + 1] * DiveTide.RACE.half * 2.2;
            const fy = fl[Math.min(24, Math.round(f * 24))];
            const top = -DiveTide.RACE.fullDepth;
            pts[i * 3] = l.x0 + l.dx * a - l.dz * across;
            pts[i * 3 + 1] = U.lerp(fy + 0.6, Math.max(fy + 1, top), seed[i * 3 + 2]);
            pts[i * 3 + 2] = l.z0 + l.dz * a + l.dx * across;
          }
        }
        pg.attributes.position.needsUpdate = true;
        silt.material.opacity = U.clamp(race * 0.55, 0, 0.7);

        // the pockets breathe while there is air in them
        pocketMat.opacity = air * (0.30 + Math.sin(t * 2.1) * 0.06);
        for (const p of pockets) p.visible = air > 0.01;
      },
    };
  }

  return { build };
})();
