/* ------------------------------------------------------------------
   stage.js — the hill, dressed three ways.

   The welcome, the round table and the fire all happen in the same
   place at three times of day, so they are one build with three
   dressings rather than three worlds. That is not only cheaper: it is
   why the night reads as one night. You recognise the stones behind
   Claudia at the fire because you walked past them in daylight.

   It also owns the first-person controller shared by all three scenes.
   The player owns the view throughout dialogue. The one exception is
   the pouch throw at the fire, where the finale explicitly hands the
   camera to this stage for a short scripted shot and then gives it back.
------------------------------------------------------------------ */
const Stage = (() => {

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* The three times of day the show uses, and what each one does to the
     hill. `sea` is forced calm everywhere: this is a loch. */
  const HOURS = {
    golden: { time: 'dusk',  wind: 0.42, moteColour: '#ffe6a8' },
    dusk:   { time: 'dusk',  wind: 0.30, moteColour: '#ffd9a0' },
    night:  { time: 'night', wind: 0.22, moteColour: '#9fc6ff' },
  };

  function build(opts = {}) {
    const o = Object.assign({
      seed: 1, hour: 'golden', dress: 'none', players: [],
    }, opts);

    const hour = HOURS[o.hour] || HOURS.golden;
    const rng = U.makeRng(((o.seed ^ 0x1d0c) >>> 0) || 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.3, 24000);
    scene.add(camera);

    // weather before sky, always: the haze on the far peaks is baked
    // into vertex colours against the fog colour of the hour
    // 'glass' is the calmest the sea kit has, which for a loch in the
    // evening is still slightly too much water; the highland kit dials
    // it down again after Water.build
    const cond = { time: hour.time, sea: 'glass', wind: rng() * 6.283 };
    const applied = Conditions.apply(cond);
    const fog = applied.time.fog;
    scene.fog = new THREE.Fog(Sky.PALETTE.fog, fog.near * 1.4, fog.far * 1.5);
    scene.add(Conditions.lights(cond));

    Sky.build(scene, U.makeRng(o.seed + 17), { birds: o.hour !== 'night' });

    const land = HighlandKit.build(scene, U.makeRng(o.seed + 31), {
      moteColor: hour.moteColour,
      /* The castle over the water lights its windows at the same hour
         the hill puts its fire out, which is the one thing that makes
         three dressings of one place read as one evening passing. */
      night: o.hour === 'night',
      evening: o.hour === 'dusk',
    });
    /* Order matters twice here. `Water.build` inside the highland kit
       resets the sea to its defaults, so the hour's palette has to be
       reapplied after it — and `apply` brings the *sea state* back with
       the palette, so the loch has to be calmed again after that. */
    Conditions.apply(cond);
    Water.setSeaState({ swell: 0.17, chop: 0.12, wind: cond.wind });
    land.setWind(Math.cos(cond.wind), Math.sin(cond.wind), hour.wind);
    const wFog = applied.time.waterFog;
    Water.setFog(wFog.near * 1.3, wFog.far * 1.6, Sky.PALETTE.fog);

    const summitY = land.heightAt(0, 0);

    /* ---------------- the cast ---------------- */

    /* Claudia stands slightly off the summit and downhill of the others,
       so the camera looking at her also looks out over the glen behind
       her. Every framing in every scene depends on that. */
    const claudia = Figure.build({ palette: 'claudia', height: 1.74, hair: 'long' });
    const cPos = V(0, 0, -3.4);
    cPos.y = land.heightAt(cPos.x, cPos.z);
    claudia.position.copy(cPos);
    claudia.rotation.y = Math.PI;
    scene.add(claudia);

    // the players, in a shallow arc facing her
    const figures = [];
    const seats = [];
    let mySeat = null;
    const n = Math.max(1, o.players.length);
    // close enough to reach the table, far enough back from a fire
    const ring = o.dress === 'table' ? 2.25 : 2.9;
    for (let i = 0; i < o.players.length; i++) {
      const p = o.players[i];
      const a = Math.PI * 0.5 + (i - (n - 1) / 2) * (n > 1 ? 0.62 : 0);
      const r = ring;
      const x = Math.cos(a) * r, z = Math.sin(a) * r + 0.6;
      const y = land.heightAt(x, z);
      const seat = { id: p.id, pos: V(x, y, z), angle: a, local: !!p.local };
      seats.push(seat);
      // The local contestant is the camera. Claudia and the two other
      // contestants are the three people visible in first person.
      if (p.local) { mySeat = seat; figures.push(null); continue; }
      /* How they dressed, which everybody agreed on in the lobby. A
         player who somehow arrived without a look still has to be
         somebody, so the old seat-derived palette is the fallback. */
      const fig = p.look
        ? Figure.build({ look: p.look, long: false })
        : Figure.build({ palette: Figure.paletteFor(p.seat),
                         height: 1.70 + (p.seat % 3) * 0.04,
                         hair: p.seat % 2 ? 'short' : 'bun', long: false });
      fig.position.set(x, y, z);
      fig.rotation.y = Math.atan2(cPos.x - x, cPos.z - z);
      fig.userData.playerId = p.id;
      scene.add(fig);
      /* Two other people, arranged in an arc, in the coats they chose
         in a dressing room half an hour ago. The whole of the round
         table is an argument about which of them did something, and it
         is not worth having if you cannot tell them apart — so the
         name goes over the head here as well as out in the missions.
         Close range, because nobody in this scene is more than five
         metres away and a label at forty would be a label on the loch. */
      const look = p.look ? Look.resolve(p.look) : null;
      const tag = Nametag.make(p.name || 'Player',
        { accent: look ? look.accent : '#f2c14e', near: 14, far: 40 });
      scene.add(tag);
      fig.userData.tag = tag;
      figures.push(fig);
    }

    /* ---------------- dressing ---------------- */

    const props = new THREE.Group();
    scene.add(props);
    let fire = null, table = null;

    if (o.dress === 'table') table = buildTable(land, props, seats);
    if (o.dress === 'fire') fire = buildFirePit(land, props);

    /* ---------------- first-person camera ---------------- */

    const spawn = mySeat ? mySeat.pos.clone() : V(0, summitY, 4.2);
    const toClaudiaX = cPos.x - spawn.x, toClaudiaZ = cPos.z - spawn.z;
    const firstPerson = {
      pos: spawn,
      vel: V(0, 0, 0),
      yaw: Math.atan2(-toClaudiaX, -toClaudiaZ),
      pitch: 0,
      bob: 0,
      controls: true,
      eye: o.dress === 'table' ? 1.38 : 1.62,
    };
    camera.fov = 64;
    camera.rotation.order = 'YXZ';
    Input.setMouseAim(true);
    Input.setTouchMode('walk');
    const controlHint = document.getElementById('stage-hint');
    const paintHint = (locked) => {
      if (controlHint) controlHint.classList.toggle('on', firstPerson.controls
        && !Input.isTouch && !locked);
    };
    const offLock = Input.onLockChange(paintHint);
    paintHint(Input.pointerLocked);

    /* Eye height, and how far out the props reach. At the table
       everybody is sitting down, so a camera at standing height is
       looking at the scene from where nobody is; and a lens closer to
       the middle than `PROP_R` is inside the candles or inside the
       fire, which is the difference between an intimate shot and a
       wall of wax. Every framing below is checked against both. */
    const EYE = o.dress === 'table' ? 1.22 : 1.60;
    const PROP_R = o.dress === 'fire' ? 2.05 : 1.85;

    /* Named shots are staging references during ordinary dialogue. They
       only move the camera while the finale has explicitly entered its
       pouch-to-fire cinematic. */
    function overYou(look, fov, out = 1.25, side = 0.55) {
      if (!mySeat) {
        return { pos: V(0.2, summitY + EYE + 0.34, ring + 2.4), look, fov, speed: 1.3 };
      }
      const len = Math.hypot(mySeat.pos.x, mySeat.pos.z) || 1;
      const ox = mySeat.pos.x / len, oz = mySeat.pos.z / len;
      return {
        pos: V(mySeat.pos.x + ox * out - oz * side,
               mySeat.pos.y + EYE + 0.34,
               mySeat.pos.z + oz * out + ox * side),
        look, fov, speed: 1.3,
      };
    }

    // where the other players are, averaged, at head height
    function othersAt() {
      const others = seats.filter(st => !st.local);
      if (!others.length) return V(0, summitY + EYE, 0);
      const v = V(0, 0, 0);
      others.forEach(st => v.add(st.pos));
      v.multiplyScalar(1 / others.length);
      v.y += o.dress === 'table' ? 1.02 : 1.42;
      return v;
    }

    const SHOTS = {
      // low in the grass, looking up the hill at her
      grass: () => ({ pos: V(2.1, land.heightAt(2.1, 7.4) + 0.28, 7.4),
                      look: V(0, summitY + 1.05, -3.0), fov: 52, speed: 0.42 }),
      // rising over the crest, the glen opening behind
      rise: () => ({ pos: V(-1.2, summitY + 3.4, 9.2),
                     look: V(0, summitY + 1.35, -3.4), fov: 50, speed: 0.34 }),
      // the wide one: the whole hill and the hills beyond it
      wide: () => ({ pos: V(9.5, summitY + 4.2, 12.5),
                     look: V(0, summitY + 1.2, -2.0), fov: 54, speed: 0.36 }),
      /* Out over the rim at the castle, with nobody in the frame. It is
         the one shot in the show that is about the place rather than
         the people in it, so it is long, slow and empty — and it is
         aimed at whatever the hill says its landmark is rather than at
         a hand-written point, so moving the castle does not silently
         re-aim the establishing shot at open water. */
      loch: () => {
        const mark = land.landmark || V(-132, 54, -378);
        /* Off to the west of the summit, so the line out to the castle
           passes nowhere near where Claudia is standing: this is the
           empty shot, and a presenter in the corner of it would make it
           a shot of a presenter. Aimed a little over the keep so the
           castle sits under the middle of the frame with sky above it. */
        const px = -9.0, pz = 2.0;
        /* A long lens, because it is four hundred metres away: at the
           46mm the rest of the show is shot on it is a smudge on the
           waterline, and at 28 it is a castle. Aimed fourteen metres
           over the keep, which puts the island in the lower third with
           the far hills and the sky above it. */
        return { pos: V(px, land.heightAt(px, pz) + 2.6, pz),
                 look: V(mark.x, mark.y + 14, mark.z),
                 fov: 28, speed: 0.75 };
      },
      /* Her, close, the way the show shoots her — but off to one side,
         so the sightline goes *past* the table or the fire rather than
         through it. Straight down the middle put a candle, or a metre
         of flame, in the middle of her face. */
      claudia: () => ({ pos: V(1.55, summitY + EYE + 0.30, 1.45),
                        look: V(cPos.x, cPos.y + 1.52, cPos.z), fov: 38, speed: 1.5 }),
      claudiaTight: () => ({ pos: V(1.85, summitY + EYE + 0.34, 0.45),
                             look: V(cPos.x, cPos.y + 1.55, cPos.z), fov: 30, speed: 1.9 }),
      /* Side on, from off to her left and back past the circle, so the
         handover has somewhere to happen: she is on one side of the
         frame and whoever is giving her the pouch is on the other, and
         the thing itself crosses between them. */
      claudiaSide: () => ({ pos: V(5.0, summitY + EYE + 0.28, 2.2),
                            look: V(0.35, cPos.y + 1.30, 0.15), fov: 52, speed: 1.0 }),
      // over your shoulder at the other two
      players: () => overYou(othersAt(), 46),
      // the fire, from your seat
      fire: () => ({ pos: V(0.4, summitY + 1.35, 4.4),
                     look: V(0, summitY + 0.75, 0.2), fov: 44, speed: 1.3 }),
      fireTight: () => ({ pos: V(0.15, summitY + 1.0, 2.6),
                          look: V(0, summitY + 0.6, 0.1), fov: 32, speed: 2.1 }),
      /* Down in the grass looking up the flame. The reveal is a colour
         that goes twenty feet in the air, and it is worth nothing shot
         from standing height. */
      fireHero: () => ({ pos: V(1.15, summitY + 0.42, 3.05),
                         look: V(0, summitY + 2.4, 0), fov: 62, speed: 0.55 }),
      table: () => overYou(V(0, summitY + 0.95, 0), 46, 1.05, 0.45),
    };

    /* Whoever is speaking gets looked at, which is most of the edit.
       The camera goes *outside* the circle and looks back in, so the
       table, the fire and Claudia are all behind the person talking
       rather than behind the lens. Two metres back: any closer and a
       40mm-equivalent lens is inside their face. */
    function shotOn(playerId) {
      const seat = seats.find(s => s.id === playerId);
      if (!seat) return SHOTS.players();
      const len = Math.hypot(seat.pos.x, seat.pos.z) || 1;
      const ox = seat.pos.x / len, oz = seat.pos.z / len;
      const from = V(seat.pos.x + ox * 2.0 + 0.3,
                     summitY + 1.58,
                     seat.pos.z + oz * 2.0);
      return { pos: from, look: V(seat.pos.x, seat.pos.y + 1.42, seat.pos.z),
               fov: 40, speed: 1.6 };
    }

    /* The one rule every framing has to obey. A lens inside `PROP_R` is
       inside the candles or inside the fire, and the shot it takes is a
       wall of wax or a sheet of flame rather than whatever it was aimed
       at. Rather than trust eleven hand-written positions to stay
       outside it while the dressing changes underneath them, push any
       that drift in back out along their own bearing: the framing is
       preserved, the obstruction is not. */
    function clearOfProps(p) {
      const r = Math.hypot(p.x, p.z);
      if (r >= PROP_R || r < 1e-4) return p;
      const k = PROP_R / r;
      p.x *= k; p.z *= k;
      return p;
    }

    const scripted = {
      active: false,
      pos: camera.position.clone(),
      look: V(0, summitY + 1.2, 0),
      targetPos: camera.position.clone(),
      targetLook: V(0, summitY + 1.2, 0),
      targetFov: camera.fov,
      speed: 1,
      shake: 0,
    };
    const cameraDir = V(0, 0, -1);

    function setShot(name, opts = {}) {
      if (!scripted.active) return;
      const make = typeof name === 'string' && name.startsWith('on:')
        ? () => shotOn(name.slice(3)) : SHOTS[name];
      if (!make) return;
      const shot = make();
      scripted.targetPos.copy(clearOfProps(shot.pos.clone()));
      scripted.targetLook.copy(shot.look);
      scripted.targetFov = shot.fov || 46;
      scripted.speed = opts.speed || shot.speed || 1;
      if (opts.cut) {
        scripted.pos.copy(scripted.targetPos);
        scripted.look.copy(scripted.targetLook);
        camera.fov = scripted.targetFov;
        camera.updateProjectionMatrix();
      }
    }

    function setCinematic(on, shot, opts = {}) {
      const next = !!on;
      if (next === scripted.active) {
        if (next && shot) setShot(shot, opts);
        return;
      }
      scripted.active = next;
      if (next) {
        scripted.pos.copy(camera.position);
        camera.getWorldDirection(cameraDir);
        scripted.look.copy(camera.position).addScaledVector(cameraDir, 8);
        scripted.targetPos.copy(scripted.pos);
        scripted.targetLook.copy(scripted.look);
        scripted.targetFov = camera.fov;
        setControls(false);
        if (shot) setShot(shot, opts);
      } else {
        scripted.shake = 0;
        setControls(true);
      }
    }

    function setControls(on) {
      firstPerson.controls = !!on;
      Input.setMouseAim(!!on);
      Input.setTouchMode(on ? 'walk' : 'off');
      paintHint(Input.pointerLocked);
      if (!on) firstPerson.vel.set(0, 0, 0);
    }

    let speakingId = null;
    let claudiaFocus = null;           // overrides who she is looking at
    function setSpeaking(who) {
      speakingId = who;
      Figure.setSpeaking(claudia, who === 'claudia');
      figures.forEach(f => f && Figure.setSpeaking(f, f.userData.playerId === who));
    }

    /* ---------------- the frame ---------------- */

    let t = 0;
    let fireBoost = 1;

    function update(dt) {
      t += dt;

      if (firstPerson.controls) {
        const d = Input.aimDelta();
        const stick = Input.aimStick();
        firstPerson.yaw -= d.x * 0.0022 + stick.x * 2.15 * dt;
        firstPerson.pitch -= d.y * 0.0022 + stick.y * 1.75 * dt;
        firstPerson.pitch = U.clamp(firstPerson.pitch, -1.25, 1.25);

        const mv = Input.moveAxes();
        const cy = Math.cos(firstPerson.yaw), sy = Math.sin(firstPerson.yaw);
        const wishX = -sy * mv.y + cy * mv.x;
        const wishZ = -cy * mv.y - sy * mv.x;
        firstPerson.vel.x = U.damp(firstPerson.vel.x, wishX * 3.4, 9, dt);
        firstPerson.vel.z = U.damp(firstPerson.vel.z, wishZ * 3.4, 9, dt);
      } else {
        firstPerson.vel.x = U.damp(firstPerson.vel.x, 0, 12, dt);
        firstPerson.vel.z = U.damp(firstPerson.vel.z, 0, 12, dt);
      }

      firstPerson.pos.x += firstPerson.vel.x * dt;
      firstPerson.pos.z += firstPerson.vel.z * dt;
      const roam = 10.5;
      const rr = Math.hypot(firstPerson.pos.x, firstPerson.pos.z);
      if (rr > roam) {
        firstPerson.pos.x *= roam / rr;
        firstPerson.pos.z *= roam / rr;
      }
      // Keep the table/fire and every visible person solid enough that
      // first person cannot walk through them.
      const blockers = (o.dress === 'none' ? []
        : [{ pos: V(0, 0, 0), r: PROP_R + 0.35 }])
        .concat([{ pos: cPos, r: 0.62 }])
        .concat(seats.filter(s => {
          if (s.local) return false;
          const p = typeof Session !== 'undefined' ? Session.playerById(s.id) : null;
          return !p || p.alive;
        }).map(s => ({ pos: s.pos, r: 0.58 })));
      blockers.forEach(b => {
        const dx = firstPerson.pos.x - b.pos.x, dz = firstPerson.pos.z - b.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-6 && d2 < b.r * b.r) {
          const len = Math.sqrt(d2);
          firstPerson.pos.x = b.pos.x + dx / len * b.r;
          firstPerson.pos.z = b.pos.z + dz / len * b.r;
        }
      });
      firstPerson.pos.y = land.heightAt(firstPerson.pos.x, firstPerson.pos.z);
      const speed = Math.hypot(firstPerson.vel.x, firstPerson.vel.z);
      firstPerson.bob += dt * (3.2 + speed * 1.3);
      const bob = speed > 0.15 ? Math.sin(firstPerson.bob) * 0.025 : 0;
      if (scripted.active) {
        const k = 1 - Math.exp(-scripted.speed * dt);
        scripted.pos.lerp(scripted.targetPos, k);
        scripted.look.lerp(scripted.targetLook, k);
        camera.fov = U.damp(camera.fov, scripted.targetFov, scripted.speed, dt);
        camera.updateProjectionMatrix();
        camera.position.copy(scripted.pos);
        if (scripted.shake > 0.001) {
          camera.position.x += (Math.random() - 0.5) * scripted.shake * 0.08;
          camera.position.y += (Math.random() - 0.5) * scripted.shake * 0.06;
          scripted.shake = U.damp(scripted.shake, 0, 4.5, dt);
        }
        camera.lookAt(scripted.look);
      } else {
        camera.fov = 64;
        camera.updateProjectionMatrix();
        camera.position.set(firstPerson.pos.x, firstPerson.pos.y + firstPerson.eye + bob,
                            firstPerson.pos.z);
        camera.rotation.set(firstPerson.pitch, firstPerson.yaw, 0, 'YXZ');
      }
      if (mySeat) mySeat.pos.copy(firstPerson.pos);

      land.update(dt, camera.position, t);
      Water.update(dt);
      Water.follow(camera.position.x, camera.position.z);
      Sky.update(dt, camera.position, t);

      Figure.update(claudia, dt, t);
      Figure.lookAt(claudia, claudiaFocus
        || (speakingId && speakingId !== 'claudia'
          ? (seats.find(s => s.id === speakingId) || { pos: camera.position }).pos
          : camera.position));
      for (const f of figures) {
        if (!f) continue;
        const player = typeof Session !== 'undefined'
          ? Session.playerById(f.userData.playerId) : null;
        f.visible = !player || player.alive;
        /* Not over a scripted shot. The pouch going into the fire is
           the one minute of this game that is direction rather than
           play, and a floating label in the middle of it would be a
           caption over a close-up. */
        if (f.visible && !scripted.active) {
          const h = f.userData.h || 1.74;
          const drop = (f.userData.seated || 0) * (f.userData.seatDrop || 0);
          Nametag.show(f.userData.tag, f.position.x,
                       f.position.y + h + 0.30 - drop, f.position.z, camera);
        } else Nametag.hide(f.userData.tag);
        if (!f.visible) continue;
        Figure.update(f, dt, t);
        Figure.lookAt(f, speakingId === 'claudia' || !speakingId
          ? cPos
          : (seats.find(s => s.id === speakingId) || { pos: cPos }).pos);
      }

      if (fire) {
        fireBoost = U.damp(fireBoost, fire.userData.want || 1, 3.4, dt);
        ForestKit.animateFire(fire, t, fireBoost);
      }
      if (table && table.userData.candles) {
        table.userData.candles.forEach((c, i) => {
          c.intensity = 0.85 + Math.sin(t * (6.1 + i * 1.7) + i) * 0.22;
        });
      }
    }

    function dispose() {
      Input.setMouseAim(false);
      Input.setTouchMode('drive');
      offLock();
      if (controlHint) controlHint.classList.remove('on');
      Figure.dispose(claudia);
      figures.forEach(f => f && Figure.dispose(f));
      Engine.disposeObject(props);
      land.dispose();
      Engine.disposeObject(scene);
    }

    return {
      view: { scene, camera }, scene, camera,
      land, claudia, figures, seats, props, fire, table,
      summitY, claudiaPos: cPos,
      mySeat,
      setShot, setSpeaking, setControls, setCinematic, shotOn, update, dispose,
      // for a scene that wants to flare the fire on a reveal
      flare(v) { if (fire) fire.userData.want = v; },
      // knock the camera about: 1 is the pouch answering
      shake(v = 1) { if (scripted.active) scripted.shake = Math.max(scripted.shake, v); },
      // point Claudia at something that is not the camera or a speaker
      lookAt(v) { claudiaFocus = v || null; },
      get rig() { return firstPerson; },
    };
  }

  /* ---------------- props ---------------- */

  function buildTable(land, props, seats) {
    const wood = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const g = new THREE.Group();
    const y = land.heightAt(0, 0);
    g.position.set(0, y, 0);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.5, 0.11, 16), wood('#5a3f2b'));
    top.position.y = 0.76;
    g.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.055, 4, 20), wood('#402c1e'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.74;
    g.add(rim);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 0.72, 8), wood('#402c1e'));
    pillar.position.y = 0.36;
    g.add(pillar);

    // a chair under each person, rather than a ring of its own that
    // they can then be standing in front of
    for (const s of seats) {
      const chair = new THREE.Group();
      chair.position.set(s.pos.x, s.pos.y - y, s.pos.z);
      chair.rotation.y = Math.atan2(-s.pos.x, -s.pos.z) + Math.PI;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.48), wood('#4a3323'));
      seat.position.y = 0.46;
      chair.add(seat);
      const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.08), wood('#4a3323'));
      backRest.position.set(0, 0.78, 0.22);
      chair.add(backRest);
      for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 4), wood('#3a2719'));
        leg.position.set(dx, 0.23, dz);
        chair.add(leg);
      }
      g.add(chair);
    }

    /* Candles rather than a floodlight. Three small point lights are the
       whole mood of the scene and cost less than one shadow map. */
    const candles = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const cx = Math.cos(a) * 0.85, cz = Math.sin(a) * 0.85;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.30, 6),
                                   wood('#e8e0cc'));
      stick.position.set(cx, 0.96, cz);
      g.add(stick);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 5),
        new THREE.MeshBasicMaterial({ color: '#ffd98a' }));
      flame.position.set(cx, 1.16, cz);
      g.add(flame);
      const L = new THREE.PointLight('#ffb85e', 0.95, 7.5, 2);
      L.position.set(cx, 1.20, cz);
      g.add(L);
      candles.push(L);
    }
    g.userData.candles = candles;
    props.add(g);
    return g;
  }

  function buildFirePit(land, props) {
    const y = land.heightAt(0, 0);
    const fire = ForestKit.buildFire({ scale: 1.45, light: 3.1, range: 34, logs: 6 });
    fire.position.set(0, y, 0);
    fire.userData.want = 1;
    props.add(fire);

    // stones to sit on, and something for the light to fall on
    const mat = new THREE.MeshLambertMaterial({ color: '#6e7583', flatShading: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const r = 2.5 + (i % 3) * 0.18;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 + (i % 4) * 0.05, 0), mat);
      s.position.set(x, land.heightAt(x, z) + 0.15, z);
      s.scale.set(1.2, 0.72, 1.0);
      s.rotation.y = a;
      props.add(s);
    }
    return fire;
  }

  return { build, HOURS };
})();
