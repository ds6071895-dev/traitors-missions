/* ------------------------------------------------------------------
   stage.js — the estate and the castle, dressed for each scene.

   The welcome and the fire happen outside on the estate; the round
   table, breakfast, the turret and the bedrooms happen inside the
   castle (`room`). Either way a scene gets the same thing: a world with
   its focus at the origin, Claudia standing 3.4 m to the north of it,
   the contestants seated or standing round it, and a camera.

   Dressings: `none` (standing in an arc), `fire`, `table` (the round
   table, a full ring of chairs), `breakfast` (the long table),
   `conclave` (the Traitors' small table in the turret), `bedroom`.

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
    // a bright Highland afternoon: the welcome, and every day after it
    golden: { time: 'noon',  wind: 0.42, moteColour: '#fff6d0' },
    dusk:   { time: 'dusk',  wind: 0.30, moteColour: '#ffd9a0' },
    night:  { time: 'night', wind: 0.22, moteColour: '#9fc6ff' },
  };

  function build(opts = {}) {
    const o = Object.assign({
      seed: 1, hour: 'golden', dress: 'none', players: [],
    }, opts);

    const hour = HOURS[o.hour] || HOURS.golden;
    const rng = U.makeRng(((o.seed ^ 0x1d0c) >>> 0) || 1);
    const indoors = !!o.room && typeof CastleInterior !== 'undefined';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.3, 24000);
    scene.add(camera);

    let land;
    if (indoors) {
      /* Inside, there is no sky and no loch to set up: the house brings
         its own light, and its windows say what hour it is. */
      land = CastleInterior.build(scene, { seed: o.seed, room: o.room, hour: o.hour });
      // a house, not a glen: a short far plane keeps the depth buffer
      // fine enough that nothing laid on anything else can shimmer
      camera.near = 0.1; camera.far = 400; camera.updateProjectionMatrix();
    } else {
      // weather before sky, always: the haze on the far peaks is baked
      // into vertex colours against the fog colour of the hour
      // 'glass' is the calmest the sea kit has, which for a loch in the
      // evening is still slightly too much water; the highland kit dials
      // it down again after Water.build
      const cond = { time: hour.time, sea: 'glass', wind: rng() * 6.283 };
      const applied = Conditions.apply(cond);
      Estate.atmosphere(o.hour === 'night');
      const fog = applied.time.fog;
      scene.fog = new THREE.Fog(Sky.PALETTE.fog, fog.near * 1.4, fog.far * 1.5);
      scene.add(Conditions.lights(cond));
      const castFill=new THREE.DirectionalLight(o.hour==='night'?'#c6d4ff':'#fff4e0',o.hour==='night'?.62:1.0);castFill.position.set(8,16,20);scene.add(castFill);
      /* By day, a sky-blue from above and a grass-green bounce from
         below: the difference between a lit glen and a grey one. */
      if(o.hour!=='night')scene.add(new THREE.HemisphereLight('#fff9e6','#8fc25e',.75));

      Sky.build(scene, U.makeRng(o.seed + 17), { birds: o.hour !== 'night' });

      land = Estate.build(scene, {
        seed: o.seed, location: o.location || (o.dress === 'fire' ? 'fire' : 'welcome'),
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
      Water.setSeaState({ swell: 0.17, chop: 0.12, wind: cond.wind });
      land.setWind(Math.cos(cond.wind), Math.sin(cond.wind), hour.wind);
      const wFog = applied.time.waterFog;
      Water.setFog(wFog.near * 1.3, wFog.far * 1.6, Sky.PALETTE.fog);
    }

    const summitY = land.heightAt(0, 0);
    const parkedCar = !indoors && o.dress === 'none' && !o.noCar ? EstateCar.build(o.players) : null;
    if (parkedCar) { parkedCar.pose(land.road.sample(0)); scene.add(parkedCar.group); }
    const seatedDress = o.dress === 'table' || o.dress === 'breakfast' || o.dress === 'conclave';

    /* ---------------- the cast ---------------- */

    /* Claudia stands slightly off the summit and downhill of the others,
       so the camera looking at her also looks out over the glen behind
       her. Every framing in every scene depends on that. */
    const claudia = Figure.build({ palette: 'claudia', height: 1.74, hair: 'long' });
    const cPos = V(0, 0, -3.4);
    cPos.y = land.heightAt(cPos.x, cPos.z);
    claudia.position.copy(cPos);
    claudia.rotation.y = 0;
    claudia.visible = o.claudia !== false;
    EstateMaterials.fabric(claudia);
    scene.add(claudia);

    // the players: in an arc facing her, or round whatever table this is
    const figures = [];
    const seats = [];
    let mySeat = null;
    const n = Math.max(1, o.players.length);
    const layout = seatLayout(o.dress, n, cPos, indoors);
    // close enough to reach the table, far enough back from a fire
    const ring = layout.ring;
    for (let i = 0; i < o.players.length; i++) {
      const p = o.players[i];
      const spot = layout.at(i);
      const x = spot.x, z = spot.z, a = spot.a;
      const y = land.heightAt(x, z);
      const seat = { id: p.id, pos: V(x, y, z), angle: a, local: !!p.local,
                     home: V(x, y, z), face: spot.face };
      seats.push(seat);
      // The local contestant is the camera. Claudia and everybody else
      // are the people visible in first person.
      if (p.local) { mySeat = seat; figures.push(null); continue; }
      /* How they dressed, which everybody agreed on in the lobby. A
         player who somehow arrived without a look still has to be
         somebody, so the old seat-derived palette is the fallback. */
      const fig = p.look
        ? Figure.build({ look: p.look, long: false })
        : Figure.build({ palette: Figure.paletteFor(p.seat),
                         height: 1.70 + (p.seat % 3) * 0.04,
                         hair: p.seat % 2 ? 'short' : 'bun', long: false });
      EstateMaterials.fabric(fig);
      fig.position.set(x, y, z);
      const facing = spot.face || cPos;
      fig.rotation.y = Math.atan2(facing.x - x, facing.z - z);
      fig.userData.playerId = p.id;
      // at a table the hands rest on it; anywhere else, in the lap
      fig.userData.seatOpts = { table: o.dress === 'table' || o.dress === 'breakfast' };
      if (o.seated && seatedDress) Figure.setSeated(fig, true, { instant: true });
      scene.add(fig);
      /* Two other people, arranged in an arc, in the coats they chose
         in a dressing room half an hour ago. The whole of the round
         table is an argument about which of them did something, and it
         is not worth having if you cannot tell them apart — so the
         name goes over the head here as well.
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

    if (o.dress === 'table') table = buildTable(land, props, seats, indoors);
    if (o.dress === 'breakfast') table = buildLongTable(land, props, seats);
    if (o.dress === 'conclave') table = buildConclave(land, props, seats);
    if (o.dress === 'fire') fire = buildFirePit(land, props);

    /* A free walk round the house wants the house furnished: the round
       table in its chamber and the long table in the great hall, each
       in its own room and solid to walk into. */
    if (o.furnish && indoors && typeof CastleLayout !== 'undefined') {
      const kit = [['round', 'table', buildTable, 2.7, 2.7], ['great', 'breakfast', buildLongTable, 1.45, 4.3]];
      for (const [room, dress, make, hx, hz] of kit) {
        if (room === o.room) continue;
        const lay = seatLayout(dress, 8, V(0, 0, -3.4), true);
        const fake = Array.from({ length: 8 }, (_, i) => {
          const sp = lay.at(i);
          return { pos: V(sp.x, 0, sp.z), face: sp.face };
        });
        const g = make(land, props, fake, true);
        const f = CastleLayout.FOCUS[room];
        const w = land.toWorld(f.x, f.z);
        g.position.x += w.x; g.position.z += w.z;
        const cz = room === 'great' ? 0.85 : 0;
        if (land.solid) land.solid.push({ x0: f.x - hx, x1: f.x + hx, z0: f.z + cz - hz, z1: f.z + cz + hz });
      }
    }

    /* ---------------- first-person camera ---------------- */

    const spawn = mySeat ? mySeat.pos.clone()
      : (indoors && land.roomAnchor ? land.roomAnchor(o.room).setY(land.heightAt(0, 0)) : V(0, summitY, 4.2));
    const toClaudiaX = cPos.x - spawn.x, toClaudiaZ = cPos.z - spawn.z;
    const lookAtFirst = mySeat && mySeat.face && seatedDress
      ? Math.atan2(-(mySeat.face.x - spawn.x), -(mySeat.face.z - spawn.z))
      : Math.atan2(-toClaudiaX, -toClaudiaZ);
    const firstPerson = {
      pos: spawn,
      vel: V(0, 0, 0),
      yaw: lookAtFirst,
      pitch: 0,
      bob: 0,
      controls: true,
      // seated at a table you can look round, but you cannot walk off
      walk: !(o.seated && seatedDress),
      eye: o.seated && seatedDress ? 1.22 : 1.62,
    };
    camera.fov = 64;
    camera.rotation.order = 'YXZ';
    Input.setMouseAim(true);
    Input.setTouchMode('walk');
    const controlHint = document.getElementById('stage-hint');
    const paintHint = () => {
      if (controlHint) controlHint.classList.toggle('on',
        firstPerson.controls && !Input.aimReady);
    };
    const offLock = Input.onLockChange(paintHint);
    paintHint();

    /* Eye height, and how far out the props reach. At the table
       everybody is sitting down, so a camera at standing height is
       looking at the scene from where nobody is; and a lens closer to
       the middle than `PROP_R` is inside the candles or inside the
       fire, which is the difference between an intimate shot and a
       wall of wax. Every framing below is checked against both. */
    const EYE = seatedDress ? 1.22 : 1.60;
    const PROP_R = o.dress === 'fire' ? 2.05 : o.dress === 'conclave' ? 1.0
                 : o.dress === 'table' && table ? table.userData.radius + 0.3 : 1.85;

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
      handover: () => ({pos: firstPerson.pos.clone().add(V(0, firstPerson.eye, 0)), look: cPos.clone().add(V(0,1.52,0)), fov:64, speed:2}),
      estate: () => ({pos: V(65,64,95),look: V(8,24,0),fov:55,speed:.45}),
      castle: () => ({pos: V(16,34,24),look:land.landmark.clone().add(V(0,-10,0)),fov:58,speed:.65}),
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
      /* Breakfast: from the head of the long table, down the room to the
         door everybody has to come through. */
      door: () => ({ pos: V(-1.9, summitY + 1.75, -3.0), look: V(4.6, summitY + 1.35, 3.4), fov: 44, speed: 2.2 }),
      // and the whole table, from the far end, once they are sitting down
      longTable: () => ({ pos: V(3.6, summitY + 2.3, 6.6), look: V(0, summitY + 0.9, 0.2), fov: 50, speed: 1.4 }),
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
      paintHint();
      if (!on) firstPerson.vel.set(0, 0, 0);
    }

    let tracking = null;               // a figure the scripted camera keeps its eye on
    let speakingId = null;
    let voiceId = null;                // whoever is audibly talking, floor or no floor
    let claudiaFocus = null;           // overrides who she is looking at
    let gaze = null;                   // overrides who everybody is looking at
    /* Somebody new has the floor. Everybody turns to them anyway (the
       gaze below); a few of the listeners also react, a beat later and
       not all at once — a nod, a glance, a lean in — which is most of
       what makes a table of people look like it is listening. */
    const reactions = [];
    function setSpeaking(who) {
      const changed = who !== speakingId;
      speakingId = who;
      Figure.setSpeaking(claudia, who === 'claudia');
      figures.forEach(f => f && Figure.setSpeaking(f, f.userData.playerId === who));
      if (!changed || !who) return;
      for (const f of figures) {
        if (!f || f.userData.playerId === who || Math.random() > 0.12) continue;
        const pool = who === 'claudia' ? ['nod', 'leanIn', 'glance'] : ['nod', 'glance', 'leanIn', 'leanBack', 'think'];
        reactions.push({ f, at: 0.8 + Math.random() * 2.5, name: pool[Math.floor(Math.random() * pool.length)] });
      }
    }

    /* Elimination belongs to the stage, whatever scene is using it.
       Remove the whole rig as soon as the public state changes; hiding
       a label or waiting for an exit animation can leave a frozen body. */
    function removeEliminated() {
      if (typeof Session === 'undefined') return;
      figures.forEach((f, i) => {
        if (!f) return;
        const player = Session.playerById(f.userData.playerId);
        if (!player || player.alive !== false) return;
        figures[i] = null;                 // late arrivals cannot bring them back
        f.visible = false;
        f.userData.walk = null;
        if (tracking === f) tracking = null;
        if (f.userData.envelope) f.userData.envelope.visible = false;
        Nametag.hide(f.userData.tag);
        Engine.disposeObject(f.userData.tag);
        Figure.dispose(f);
      });
    }

    /* ---------------- the frame ---------------- */

    let t = 0;
    let fireBoost = 1;

    function update(dt) {
      removeEliminated();
      t += dt;

      if (firstPerson.controls) {
        const d = Input.aimDelta();
        const stick = Input.aimStick();
        firstPerson.yaw -= d.x * 0.0022 + stick.x * 2.15 * dt;
        firstPerson.pitch -= d.y * 0.0022 + stick.y * 1.75 * dt;
        firstPerson.pitch = U.clamp(firstPerson.pitch, -1.25, 1.25);

        const mv = firstPerson.walk ? Input.moveAxes() : { x: 0, y: 0 };
        const cy = Math.cos(firstPerson.yaw), sy = Math.sin(firstPerson.yaw);
        const wishX = -sy * mv.y + cy * mv.x;
        const wishZ = -cy * mv.y - sy * mv.x;
        const pace = (o.walkSpeed || 4.2) * (Input.held('run') ? 1.45 : 1);
        firstPerson.vel.x = U.damp(firstPerson.vel.x, wishX * pace, 10, dt);
        firstPerson.vel.z = U.damp(firstPerson.vel.z, wishZ * pace, 10, dt);
      } else {
        firstPerson.vel.x = U.damp(firstPerson.vel.x, 0, 12, dt);
        firstPerson.vel.z = U.damp(firstPerson.vel.z, 0, 12, dt);
      }

      const previous = firstPerson.pos.clone();
      firstPerson.pos.x += firstPerson.vel.x * dt;
      firstPerson.pos.z += firstPerson.vel.z * dt;
      land.constrain(firstPerson.pos, previous);
      // Keep the table/fire and every visible person solid enough that
      // first person cannot walk through them.
      const blockers = (o.dress === 'none' || o.dress === 'bedroom' ? []
        : o.dress === 'breakfast' ? [-1.7, -0.6, 0.5, 1.6, 2.7, 3.4].map(z => ({ pos: V(0, 0, z), r: 0.95 }))
        : [{ pos: V(0, 0, 0), r: PROP_R + 0.35 }])
        .concat(claudia.visible ? [{ pos: cPos, r: 0.62 }] : [])
        /* In a free scene people move, so it is where they are standing
           that is solid, not the chair they were given. */
        .concat(o.free
          ? figures.filter(f => f && f.visible && !f.userData.hidden).map(f => ({ pos: f.position, r: 0.45 }))
          : seats.filter(s => {
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
      if (parkedCar && Math.abs(firstPerson.pos.x-parkedCar.group.position.x)<1.6 && Math.abs(firstPerson.pos.z-parkedCar.group.position.z)<2.8) firstPerson.pos.copy(previous);
      firstPerson.pos.y = land.heightAt(firstPerson.pos.x, firstPerson.pos.z);
      const speed = Math.hypot(firstPerson.vel.x, firstPerson.vel.z);
      firstPerson.bob += dt * (3.2 + speed * 1.3);
      const bob = !GameState.data.settings.reducedMotion && speed > 0.15 ? Math.sin(firstPerson.bob) * 0.025 : 0;
      firstPerson.eye = U.damp(firstPerson.eye, firstPerson.walk || !seatedDress ? 1.62 : 1.22, 5, dt);
      if (scripted.active) {
        if (tracking) scripted.targetLook.set(tracking.position.x, tracking.position.y + 1.45, tracking.position.z);
        const k = 1 - Math.exp(-scripted.speed * dt);
        scripted.pos.lerp(scripted.targetPos, k);
        scripted.look.lerp(scripted.targetLook, k);
        camera.fov = U.damp(camera.fov, scripted.targetFov, scripted.speed, dt);
        camera.updateProjectionMatrix();
        camera.position.copy(scripted.pos);
        if (!GameState.data.settings.reducedMotion && scripted.shake > 0.001) {
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

      if (parkedCar && !o.vehicleDirected) parkedCar.update(dt,t,[],false,null,camera);
      land.update(dt, camera.position, t);
      if (!indoors) Sky.update(dt, camera.position, t);

      /* Who you can hear, whether or not anybody gave them the floor.
         At the open table, on the hill and round the castle the AIs
         just talk, and three voices with no face moving are three
         voices you cannot tell apart. The one with the most recent
         claim keeps the room until they stop, so two people talking
         at once does not whip every head between them. */
      const hearing = typeof VoiceChat !== 'undefined' && VoiceChat.talking;
      if (!hearing || !VoiceChat.talking(voiceId)) {
        voiceId = null;
        if (hearing) for (const id of VoiceChat.talkers()) {
          if (seats.some(s => s.id === id && !s.local)) { voiceId = id; break; }
        }
      }
      const focusId = speakingId || voiceId;

      Figure.update(claudia, dt, t);
      EstateMaterials.figureLOD(claudia,camera);
      Figure.lookAt(claudia, claudiaFocus
        || (focusId && focusId !== 'claudia'
          ? (seats.find(s => s.id === focusId) || { pos: camera.position }).pos
          : camera.position));
      for (let i = reactions.length - 1; i >= 0; i--) {
        const r = reactions[i];
        r.at -= dt;
        if (r.at > 0) continue;
        reactions.splice(i, 1);
        if (figures.includes(r.f) && !r.f.userData.walk) Figure.act(r.f, r.name);
      }
      for (const f of figures) {
        if (!f) continue;
        stepWalk(f, dt);
        const pid = f.userData.playerId;
        const heard = !!hearing && VoiceChat.talking(pid);
        Nametag.setLit(f.userData.tag, heard);
        f.visible = !f.userData.hidden
          && f.position.distanceTo(camera.position)<65;
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
        /* The jaw follows the real voice when there is one; a floor
           holder who is quiet still gets the made-up syllables. */
        const lv = heard ? VoiceChat.level(pid) : 0;     // 0: an offline bot, no meter
        Figure.setSpeaking(f, heard || speakingId === pid, lv > 0 ? lv : undefined);
        Figure.update(f, dt, t);
        EstateMaterials.figureLOD(f,camera);
        if (f.userData.walk || o.free) continue;
        const restFocus = claudia.visible ? cPos : V(0, f.position.y + 1.2, 0);
        if (gaze) { Figure.lookAt(f, gaze); continue; }
        Figure.lookAt(f, focusId === 'claudia' || !focusId || focusId === pid
          ? restFocus
          : (seats.find(s => s.id === focusId) || { pos: restFocus }).pos);
      }

      if (fire) {
        fireBoost = U.damp(fireBoost, fire.userData.want || 1, 3.4, dt);
        ForestKit.animateFire(fire, t, fireBoost);
        EstateFire.update(fire,t);
      }
      if (table && table.userData.candles) {
        table.userData.candles.forEach((c, i) => {
          c.intensity = (c.userData.base || 1) * (0.9 + Math.sin(t * (6.1 + i * 1.7) + i) * 0.1);
        });
      }
    }

    function dispose() {
      if (offEliminated) offEliminated();
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

    /* Somebody walking in from a door to their seat — breakfast is a
       room people arrive at one at a time. The figure is put at the
       first point and walks the rest at a walking pace, round the
       table rather than through it; at the end it turns to the table,
       stands a beat, and then sits, the way a person does. */
    function walkIn(playerId, from, opts2 = {}) {
      const i = seats.findIndex(s => s.id === playerId);
      if (i < 0) return 0;
      return walkPath(playerId, [from].concat(opts2.via || []).concat([seats[i].home]), opts2);
    }
    function walkPath(playerId, points, opts2 = {}) {
      const i = seats.findIndex(s => s.id === playerId);
      if (i < 0 || points.length < 2) return 0;
      const seat = seats[i], f = figures[i];
      if (!f) return 0;
      const pts = points.map(p => { const q = p.clone(); q.y = land.heightAt(q.x, q.z); return q; });
      const speed = opts2.speed || 1.25;
      const sit = opts2.sit === undefined ? o.seated && seatedDress : !!opts2.sit;
      const face = opts2.face || seat.face || cPos;
      /* Somebody who is going to sit walks to the front of the chair,
         not into it; arriving, the figure's root moves back to the seat
         and its body is held where it stood, so nothing jumps. */
      let home = null;
      if (sit && pts.length >= 2) {
        home = pts[pts.length - 1].clone();
        const fwd = face.clone().sub(home).setY(0);
        if (fwd.lengthSq() > 1e-6) {
          const s = f.scale.y || 1;
          pts[pts.length - 1] = home.clone().addScaledVector(fwd.normalize(), 0.30 * s);
        }
      }
      let dist = 0;
      for (let k = 1; k < pts.length; k++) dist += pts[k].distanceTo(pts[k - 1]);
      // getting out of a chair takes a moment before the first step
      const rise = Math.min(1.1, (f.userData.seated || 0) * 1.1);
      f.userData.hidden = false;
      Figure.setSeated(f, false);
      f.position.copy(pts[0]);
      const first = pts[1].clone().sub(pts[0]);
      if (!rise) f.rotation.y = Math.atan2(first.x, first.z);
      f.userData.walk = { pts, k: 1, speed, pause: (opts2.pause || 0) + rise, sit, home,
                          face, settle: 0, onArrive: opts2.onArrive || null };
      return dist / speed + (opts2.pause || 0) + rise + 0.8;
    }
    function stepWalk(f, dt) {
      const w = f.userData.walk;
      if (!w) return;
      if (w.pause > 0) { w.pause -= dt; Figure.setLocomotion(f, 0, 0); return; }
      if (!w.cleared) { w.cleared = true; Figure.leaveChair(f); }
      if (w.k < w.pts.length) {
        const to = w.pts[w.k];
        const dx = to.x - f.position.x, dz = to.z - f.position.z;
        const d = Math.hypot(dx, dz);
        const mv = w.speed * dt;
        if (d <= mv) { f.position.copy(to); w.k++; }
        else { f.position.x += dx / d * mv; f.position.z += dz / d * mv; }
        f.position.y = land.heightAt(f.position.x, f.position.z);
        if (d > 1e-4) f.rotation.y = U.angLerp(f.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
        Figure.setLocomotion(f, w.speed, 0);
        return;
      }
      // there: turn to the table, a breath, and sit
      Figure.setLocomotion(f, 0, 0);
      const want = Math.atan2(w.face.x - f.position.x, w.face.z - f.position.z);
      f.rotation.y = U.angLerp(f.rotation.y, want, 1 - Math.exp(-7 * dt));
      w.settle += dt;
      if (w.settle > 0.55) {
        f.userData.walk = null;
        f.rotation.y = want;
        if (w.sit) {
          if (w.home) f.position.copy(w.home);
          Figure.setSeated(f, true, { fromFront: !!w.home });
        }
        if (w.onArrive) w.onArrive(f);
      }
    }
    function hideFigure(playerId, on) {
      const i = seats.findIndex(s => s.id === playerId);
      if (i >= 0 && figures[i]) figures[i].userData.hidden = !!on;
    }
    function setSeatedAll(on) {
      figures.forEach(f => f && Figure.setSeated(f, !!on && seatedDress));
      firstPerson.walk = !(on && seatedDress);
    }
    function setWalk(on) { firstPerson.walk = !!on; }

    removeEliminated();
    const offEliminated = typeof Net !== 'undefined' ? Net.on(removeEliminated) : null;

    return {
      view: { scene, camera }, scene, camera,
      land, claudia, figures, seats, props, fire, table, parkedCar,
      summitY, claudiaPos: cPos, indoors,
      mySeat,
      setShot, setSpeaking, setControls, setCinematic, shotOn, update, dispose,
      walkIn, walkPath, hideFigure, setSeated: setSeatedAll, setWalk,
      // point everybody's eyes at something: a door, a chair, a name
      setGaze(v) { gaze = v || null; },
      // the scripted camera: put it somewhere, and keep it on somebody
      aim(pos, look, opts3 = {}) {
        if (!scripted.active) setCinematic(true);
        scripted.targetPos.copy(pos);
        if (look) scripted.targetLook.copy(look);
        scripted.targetFov = opts3.fov || scripted.targetFov;
        scripted.speed = opts3.speed || 1.2;
        if (opts3.cut) { scripted.pos.copy(pos); if (look) scripted.look.copy(look); }
      },
      track(fig) { tracking = fig || null; },
      figureOf(id) { const i = seats.findIndex(x => x.id === id); return i >= 0 ? figures[i] : null; },
      // acting: an act from figure-clips.js, a mood, a pointed finger
      act(id, name, opts3) {
        const f = id === 'claudia' ? claudia : this.figureOf(id);
        return f ? Figure.act(f, name, opts3) : 0;
      },
      actAll(name, filter) {
        figures.forEach(f => { if (f && (!filter || filter(f.userData.playerId))) Figure.act(f, name, { speed: 0.85 + Math.random() * 0.3 }); });
      },
      setMood(id, mood) { const f = this.figureOf(id); if (f) Figure.setMood(f, mood); },
      pointAt(id, target) {
        const f = id === 'claudia' ? claudia : this.figureOf(id);
        if (f) Figure.pointAt(f, target);
      },
      // for a scene that wants to flare the fire on a reveal
      flare(v) { if (fire) fire.userData.want = v; },
      // knock the camera about: 1 is the pouch answering
      shake(v = 1) { if (scripted.active) scripted.shake = Math.max(scripted.shake, v); },
      // point Claudia at something that is not the camera or a speaker
      lookAt(v) { claudiaFocus = v || null; },
      get rig() { return firstPerson; },
      get cinematic() { return scripted.active; },
    };
  }

  /* ---------------- where everybody sits ----------------
     Every layout answers `at(i)` with a position, a bearing and what
     that person faces. Eight is the design case for all of them. */
  function seatLayout(dress, n, cPos, indoors) {
    const TAU = Math.PI * 2;
    if (dress === 'table') {
      /* A full ring, open only where Claudia stands at its head. */
      const radius = n > 6 ? 1.85 : n > 4 ? 1.65 : 1.5;
      const ring = radius + 0.72;
      const gap = 1.1;
      const step = (TAU - gap) / Math.max(1, n);
      return { ring, radius, at(i) {
        const a = -Math.PI / 2 + gap / 2 + step * (i + 0.5);
        return { x: Math.cos(a) * ring, z: Math.sin(a) * ring, a, face: V(0, 0, 0) };
      } };
    }
    if (dress === 'breakfast') {
      /* Two rows down the long table, filled from the head. */
      return { ring: 2.0, at(i) {
        const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
        const z = -1.35 + row * 1.2;
        return { x: side * 1.18, z, a: side > 0 ? 0 : Math.PI, face: V(0, 0, z) };
      } };
    }
    if (dress === 'conclave') {
      return { ring: 1.35, at(i) {
        const a = -Math.PI / 2 + (i + 0.5) / Math.max(1, n) * TAU;
        return { x: Math.cos(a) * 1.35, z: Math.sin(a) * 1.35, a, face: V(0, 0, 0) };
      } };
    }
    if (dress === 'bedroom') {
      return { ring: 1, at() { return { x: 0.6, z: 0.4, a: 0, face: V(0, 1, -2) }; } };
    }
    // standing: a shallow arc facing her, closing up as the room fills
    const ring = dress === 'fire' ? 2.9 + Math.max(0, n - 5) * 0.12 : 2.9;
    const spread = Math.min(0.62, (TAU - 1.7) / Math.max(1, n - 1));
    return { ring, at(i) {
      const a = Math.PI * 0.5 + (i - (n - 1) / 2) * (n > 1 ? spread : 0);
      const z = Math.sin(a) * ring + (dress === 'none' ? cPos.z + (indoors ? 6.4 : 0) : 0.6);
      return { x: Math.cos(a) * ring, z, a, face: null };
    } };
  }

  /* ---------------- props ---------------- */

  /* What the furniture inside is made of: polished oak, tartan or
     velvet upholstery, brass. One set per table, shared by every chair. */
  function furnitureMats(cloth) {
    return {
      wood: EstateMaterials.material('timber', { color: '#9a6e50', roughness: 0.42 }),
      cloth: cloth === 'velvet'
        ? CastleSurfaces.material('velvet', { color: '#741521', roughness: 0.82 })
        : new THREE.MeshStandardMaterial({ map: CastleProps.tartan(cloth || 'stewart'), roughness: 0.9 }),
      brass: CastleSurfaces.material('metal', { color: '#d4ab55', roughness: 0.35, metalness: 0.45 }),
    };
  }

  /* A chair at a seat, turned to face `face` (the table's centre, or
     straight across a long table). */
  function seatChair(g, mats, s, groundY, opts, offset) {
    const chair = CastleProps.chairMeshes(mats, opts);
    const f = s.face || V(0, 0, 0);
    const dx = f.x - s.pos.x, dz = f.z - s.pos.z;
    const ox = offset ? offset.x : 0, oz = offset ? offset.z : 0;
    chair.position.set(s.pos.x + ox, s.pos.y - groundY, s.pos.z + oz);
    chair.rotation.y = Math.atan2(-dx, -dz);
    g.add(chair);
    return chair;
  }

  /* Candles with a real light among them. The light's resting intensity
     is kept on it, so the flicker in `update` is a multiple of it. */
  function candleLight(g, x, y, z, intensity, range) {
    const L = new THREE.PointLight('#ffb85e', intensity, range, 2);
    L.position.set(x, y, z);
    L.userData.base = intensity;
    g.add(L);
    return L;
  }
  function pillarCandles(g, list, waxMat, flameMat, coreMat) {
    for (const [x, y, z, h, r] of list) {
      const c = CastleProps.pillar(x, y, z, h, r);
      g.add(new THREE.Mesh(c.wax, waxMat));
      g.add(new THREE.Mesh(c.flame, flameMat));
      g.add(new THREE.Mesh(c.core, coreMat));
    }
  }
  const flameMats = () => [
    CastleSurfaces.material('wax', { color: '#f2ead6', roughness: 0.6 }),
    new THREE.MeshBasicMaterial({ color: '#ffb54d' }),
    new THREE.MeshBasicMaterial({ color: '#fff3c4' }),
  ];

  /* The round table. A marquetry top — walnut, a band of oak and burr
     segments, brass rings and a star — on a moulded edge and an apron,
     carried on one great turned pedestal with four carved feet. A ring
     of high-backed chairs in tartan, and candles in the middle. The
     inlay is the top's own texture, not a disc laid on it, so there is
     nothing for it to flicker against. */
  function buildTable(land, props, seats, indoors) {
    const g = new THREE.Group();
    const y = land.heightAt(0, 0);
    g.position.set(0, y, 0);
    const n = seats.length;
    const R = n > 6 ? 1.85 : n > 4 ? 1.65 : 1.5;
    g.userData.radius = R;
    const m = furnitureMats('stewart');
    const dark = EstateMaterials.material('timber', { color: '#6e4c36', roughness: 0.45 });
    const topMat = new THREE.MeshStandardMaterial({ map: CastleProps.marquetry(), roughness: 0.3, metalness: 0.04 });

    const TOP = 0.8, TH = 0.075;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, TH, 96), [m.wood, topMat, m.wood]);
    top.position.y = TOP - TH / 2;
    g.add(top);
    // a rounded edge under the inlaid face, well clear of its plane
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R, 0.042, 10, 120), m.wood);
    lip.rotation.x = Math.PI / 2; lip.position.y = TOP - 0.05;
    g.add(lip);
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.12, R - 0.12, 0.15, 72, 1, true), dark);
    apron.position.y = TOP - TH - 0.075; g.add(apron);
    const bead = new THREE.Mesh(new THREE.TorusGeometry(R - 0.12, 0.018, 6, 96), m.brass);
    bead.rotation.x = Math.PI / 2; bead.position.y = TOP - TH - 0.15; g.add(bead);
    const under = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.13, R - 0.13, 0.03, 48), dark);
    under.position.y = TOP - TH - 0.015; g.add(under);
    const ped = new THREE.Mesh(CastleProps.lathe([
      [0.5, 0], [0.52, 0.05], [0.46, 0.09], [0.3, 0.13], [0.21, 0.2], [0.25, 0.27], [0.3, 0.36],
      [0.27, 0.43], [0.18, 0.5], [0.15, 0.56], [0.2, 0.6], [0.34, 0.64], [0.5, 0.67], [0.0, 0.69],
    ], 32), dark);
    g.add(ped);
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2 + Math.PI / 4;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.62), dark);
      foot.position.set(Math.cos(a) * 0.62, 0.075, Math.sin(a) * 0.62);
      foot.rotation.y = -a + Math.PI / 2;
      g.add(foot);
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), dark);
      toe.scale.set(1, 0.75, 1.2);
      toe.position.set(Math.cos(a) * 0.92, 0.07, Math.sin(a) * 0.92);
      g.add(toe);
    }

    for (const s of seats) seatChair(g, m, s, y, { back: 1.36 });

    /* The middle: a brass tray of church candles, the only light on the
       table itself. */
    const [wax, flame, core] = flameMats();
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.025, 40), m.brass);
    tray.position.y = TOP + 0.0125; g.add(tray);
    const trayRim = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.012, 6, 40), m.brass);
    trayRim.rotation.x = Math.PI / 2; trayRim.position.y = TOP + 0.028; g.add(trayRim);
    pillarCandles(g, [
      [0, TOP + 0.025, 0, 0.36, 0.06], [0.16, TOP + 0.025, 0.1, 0.26, 0.05], [-0.15, TOP + 0.025, 0.12, 0.2, 0.05],
      [0.02, TOP + 0.025, -0.17, 0.3, 0.055],
    ], wax, flame, core);
    const candles = [candleLight(g, 0, TOP + 0.55, 0, indoors ? 3.2 : 4.0, 7)];
    g.userData.candles = candles;
    props.add(g);
    return g;
  }

  /* Breakfast: one long table down the middle of the great hall, a
     chair for everybody at the start of the game whether or not they
     come down, the table laid — plates, silver, goblets, bread and fruit
     — and candelabra lit because it is that kind of house. */
  function buildLongTable(land, props, seats) {
    const g = new THREE.Group();
    const y = land.heightAt(0, 0);
    g.position.set(0, y, 0);
    const m = furnitureMats('stewart');
    const dark = EstateMaterials.material('timber', { color: '#6e4c36', roughness: 0.45 });
    const len = 6.6, width = 1.5, cz = 0.85, TOP = 0.8;
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, len), m.wood);
    EstateMaterials.uv(top.geometry, 1.4);
    top.position.set(0, TOP - 0.04, cz); g.add(top);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(width - 0.16, 0.14, len - 0.3), dark);
    apron.position.set(0, TOP - 0.15, cz); g.add(apron);
    const runner = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.008, len - 0.5),
      new THREE.MeshStandardMaterial({ map: CastleProps.tartan('stewart'), roughness: 0.9 }));
    EstateMaterials.uv(runner.geometry, 0.5);
    runner.position.set(0, TOP + 0.004, cz); g.add(runner);
    for (const sz of [-1, 0, 1]) for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(CastleProps.turnedLeg(TOP - 0.08, 0.055, 14), dark);
      leg.position.set(sx * (width / 2 - 0.12), 0, cz + sz * (len / 2 - 0.25));
      g.add(leg);
    }
    const china = CastleSurfaces.material('china', { color: '#f2efe8', roughness: 0.3 });
    const silver = CastleSurfaces.material('metal', { color: '#d6d8da', metalness: 0.5, roughness: 0.25 });
    const linen = CastleSurfaces.material('linen', { color: '#ece5d6', roughness: 1 });
    const plateG = CastleProps.lathe([[0.0, 0], [0.1, 0], [0.12, 0.008], [0.17, 0.018], [0.175, 0.024], [0.16, 0.02], [0.11, 0.012], [0, 0.012]], 24);
    const gobletG = CastleProps.lathe([[0.04, 0], [0.035, 0.008], [0.008, 0.02], [0.008, 0.09], [0.035, 0.11], [0.045, 0.17], [0.041, 0.17], [0.03, 0.115], [0, 0.11]], 14);
    for (const s of seats) {
      const side = s.pos.x > 0 ? 1 : -1;
      seatChair(g, m, s, y, { back: 1.2 }, V(side * 0.05, 0, 0));
      const plate = new THREE.Mesh(plateG, china);
      plate.position.set(side * 0.44, TOP, s.pos.z); g.add(plate);
      const napkin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.15), linen);
      napkin.position.set(side * 0.44, TOP + 0.022, s.pos.z); napkin.rotation.y = 0.6; g.add(napkin);
      for (const dz of [-0.23, 0.23]) {
        const k = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.2), silver);
        k.position.set(side * 0.44, TOP + 0.003, s.pos.z + dz * (dz < 0 ? 1.12 : 1)); g.add(k);
      }
      const goblet = new THREE.Mesh(gobletG, silver);
      goblet.position.set(side * 0.27, TOP, s.pos.z + 0.26); g.add(goblet);
    }
    // down the middle: candelabra, bread on boards, bowls of fruit, jugs
    const [wax, flame, core] = flameMats();
    const candles = [];
    const bread = CastleSurfaces.material('crust', { color: '#b8803f', roughness: 0.9 });
    const fruitCols = ['#a8241e', '#6f9a2a', '#e08a1e', '#b5302a', '#7aa232'];
    const fruits = fruitCols.map(c => CastleSurfaces.material('skin', { color: c, roughness: 0.5 }));
    for (let i = 0; i < 4; i++) {
      const z = cz - len / 2 + 0.95 + i * ((len - 1.9) / 3);
      if (i === 1 || i === 2) {
        const stem = new THREE.Mesh(CastleProps.lathe([[0.1, 0], [0.09, 0.03], [0.03, 0.06], [0.022, 0.36], [0.045, 0.38], [0, 0.39]], 16), silver);
        stem.position.set(0, TOP, z); g.add(stem);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.44), silver);
        arm.position.set(0, TOP + 0.33, z); g.add(arm);
        const pts = [];
        for (const dz of [-0.22, 0, 0.22]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.022, 0.04, 10), silver);
          const cy = TOP + (dz ? 0.34 : 0.39);
          cup.position.set(0, cy + 0.02, z + dz); g.add(cup);
          pts.push([0, cy + 0.04, z + dz, 0.22, 0.024]);
        }
        pillarCandles(g, pts, wax, flame, core);
        candles.push(candleLight(g, 0, TOP + 0.75, z, 2.6, 6.5));
      } else {
        const board = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 24), m.wood);
        board.position.set(0, TOP + 0.0125, z - 0.3); g.add(board);
        const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 9), bread);
        loaf.scale.set(1.35, 0.6, 0.9); loaf.position.set(0, TOP + 0.09, z - 0.3); g.add(loaf);
        const bowl = new THREE.Mesh(CastleProps.lathe([[0.05, 0], [0.04, 0.02], [0.07, 0.04], [0.16, 0.1], [0.155, 0.105], [0, 0.06]], 20), silver);
        bowl.position.set(0, TOP, z + 0.3); g.add(bowl);
        for (let f = 0; f < 6; f++) {
          const a = f / 6 * Math.PI * 2;
          const fr = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 7), fruits[(f + i) % fruits.length]);
          fr.position.set(Math.cos(a) * 0.075, TOP + 0.1 + (f % 2) * 0.02, z + 0.3 + Math.sin(a) * 0.075); g.add(fr);
        }
        const jug = new THREE.Mesh(CastleProps.lathe([[0.06, 0], [0.075, 0.05], [0.07, 0.14], [0.045, 0.2], [0.05, 0.24], [0, 0.23]], 16), china);
        jug.position.set(0.18, TOP, z + 0.02); g.add(jug);
      }
    }
    g.userData.candles = candles;
    props.add(g);
    return g;
  }

  /* The turret: a small round table under a red cloth, a map of the
     house on it, a candelabrum, a goblet at each place, and the tall
     chairs of the people who decide. */
  function buildConclave(land, props, seats) {
    const g = new THREE.Group();
    const y = land.heightAt(0, 0);
    g.position.set(0, y, 0);
    const m = furnitureMats('velvet');
    const dark = EstateMaterials.material('timber', { color: '#5a3c2a', roughness: 0.45 });
    const TOP = 0.8;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.06, 48), dark);
    top.position.y = TOP - 0.03; g.add(top);
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.006, 48),
      CastleSurfaces.material('velvet', { color: '#661220', roughness: 0.85 }));
    cloth.position.y = TOP + 0.003; g.add(cloth);
    const ped = new THREE.Mesh(CastleProps.lathe([[0.32, 0], [0.33, 0.04], [0.16, 0.1], [0.11, 0.3], [0.15, 0.45],
                                                  [0.1, 0.62], [0.26, 0.7], [0, 0.74]], 24), dark);
    g.add(ped);
    const map = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.4),
      CastleSurfaces.material('parchment', { roughness: 1, side: THREE.DoubleSide }));
    map.rotation.x = -Math.PI / 2; map.rotation.z = 0.3; map.position.set(0.12, TOP + 0.0075, 0.1); g.add(map);
    // rolled ends, in the map's own frame so they sit on it
    for (const e of [-1, 1]) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 10),
        CastleSurfaces.material('parchment', { roughness: 1 }));
      roll.position.set(e * 0.28, 0, 0.022);
      map.add(roll);
    }
    const iron = CastleSurfaces.material('iron', { color: '#2d2b2a', metalness: 0.4, roughness: 0.55 });
    const stem = new THREE.Mesh(CastleProps.lathe([[0.12, 0], [0.1, 0.03], [0.03, 0.06], [0.025, 0.32], [0.05, 0.34], [0, 0.35]], 14), iron);
    stem.position.set(-0.22, TOP, -0.12); g.add(stem);
    const [wax, flame, core] = flameMats();
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const x = -0.22 + Math.cos(a) * 0.16, z = -0.12 + Math.sin(a) * 0.16;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.016, 0.016), iron);
      arm.position.set(-0.22 + Math.cos(a) * 0.08, TOP + 0.3, -0.12 + Math.sin(a) * 0.08); arm.rotation.y = -a; g.add(arm);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.02, 0.035, 10), iron);
      cup.position.set(x, TOP + 0.325, z); g.add(cup);
      pts.push([x, TOP + 0.342, z, 0.14 + (i % 3) * 0.05, 0.022]);
    }
    pillarCandles(g, pts, wax, flame, core);
    const silver = CastleSurfaces.material('metal', { color: '#c9a24c', metalness: 0.45, roughness: 0.35 });
    const gobletG = CastleProps.lathe([[0.04, 0], [0.035, 0.008], [0.008, 0.02], [0.008, 0.09], [0.035, 0.11], [0.045, 0.17], [0.041, 0.17], [0.03, 0.115], [0, 0.11]], 14);
    for (const s of seats) {
      seatChair(g, m, s, y, { back: 1.55, arms: true });
      const d = Math.hypot(s.pos.x, s.pos.z) || 1;
      const goblet = new THREE.Mesh(gobletG, silver);
      goblet.position.set(s.pos.x / d * 0.55, TOP + 0.006, s.pos.z / d * 0.55);
      g.add(goblet);
    }
    g.userData.candles = [candleLight(g, -0.22, TOP + 0.75, -0.12, 4.5, 6)];
    props.add(g);
    return g;
  }

  function buildFirePit(land, props) {
    const y = land.heightAt(0, 0);
    const fire = EstateFire.build({ scale: 1.45, light: 3.1, range: 34, logs: 6 });
    fire.position.set(0, y, 0);
    fire.userData.want = 1;
    props.add(fire);

    const apron = new THREE.Mesh(new THREE.CylinderGeometry(2.3,2.35,.12,36),EstateMaterials.material('rock',{color:'#34312d'}));
    apron.position.set(0,y+.03,0);props.add(apron);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.65,.09,8,40),EstateMaterials.material('iron'));
    rim.rotation.x=Math.PI/2;rim.position.set(0,y+.38,0);props.add(rim);
    // stones to sit on, and something for the light to fall on
    const mat = EstateMaterials.material('rock', { color: '#aaa9a0', flatShading: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const r = 2.5 + (i % 3) * 0.18;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 + (i % 4) * 0.05, 0), mat);
      EstateMaterials.uv(s.geometry,.7);s.position.set(x, land.heightAt(x, z) + 0.15, z);
      s.scale.set(1.2, 0.72, 1.0);
      s.rotation.y = a;
      props.add(s);
    }
    return fire;
  }

  return { build, HOURS };
})();
