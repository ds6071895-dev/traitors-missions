/* ------------------------------------------------------------------
   breakfast.js — finding out who is missing.

   The great hall in the morning, one long table, a chair for every
   person who went to bed. They are driven back in cars and come in one
   at a time, staged like the programme stages it: a knock, the table
   turning to look as the door opens, whoever it is pausing on the
   threshold, then walking the long way round to their own chair,
   pulling it out and sitting. Until your own knock you are in the back
   of a car (drive-back.js), and the hall only hears — and you only
   hear — whoever has already come in. Nobody is told who is dead; they are
   shown, by a chair that stays empty while everybody else arrives — and
   only when the last of them is through the door does Claudia say the
   name.

   The groups are released by the host one at a time, and the victim's
   id is not in anybody's state until the very end, so a screen cannot
   know any sooner than the table does. If the poison was never used,
   everybody comes down, and that is its own kind of news — and if it
   went into the day's shield holder, everybody comes down too, and
   Claudia says whose glass it was in.
------------------------------------------------------------------ */
class BreakfastScene extends CastleScene {

  // the long table with its empty place, as the room goes down
  _outroShot() { return 'longTable'; }

  stageOptions() {
    const s = Session.state;
    /* Everybody who went to bed alive has a chair. The victim is still
       alive in the state until the reveal, so they are in this list,
       and their figure simply never walks in. Somebody already out of
       the game watches from the end of the room. */
    const me = s.players.find(p => p.local);
    this._spectator = !me || !me.alive || (Session.myPrivate() || {}).fate === 'murdered';
    const seated = s.players.filter(p => p.alive).sort((a, b) => a.seat - b.seat)
      .map(p => (this._spectator && p.local ? Object.assign({}, p, { local: false }) : p));
    return { seed: s.seed + 313 * (s.day + 1), hour: 'morning', room: 'great',
             dress: 'breakfast', seated: true, players: seated };
  }

  build() {
    const view = super.build();
    const me0 = Session.state.players.find(p => p.local);
    this._myId = me0 ? me0.id : null;
    this._myHome = this.stage.mySeat ? this.stage.mySeat.pos.clone() : null;
    this._doorOpen = 0;
    // the door to the west passage is shut until somebody knocks on it
    if (this.stage.land && this.stage.land.setDoor) this.stage.land.setDoor('great', true, false);
    const arrived = new Set((Session.state.breakfast && Session.state.breakfast.arrived) || []);
    this.stage.figures.forEach((f, i) => {
      if (!f) return;
      const id = this.stage.seats[i].id;
      f.userData.hidden = !arrived.has(id);
      if (arrived.has(id)) Figure.setSeated(f, true, { instant: true });
    });
    if (this._spectator) {
      this.stage.rig.pos.set(0, 0, 5.4);
      this.stage.rig.yaw = 0;
      this.stage.setWalk(true);
    } else if (this._myId && !arrived.has(this._myId) && !(Session.state.breakfast || {}).revealed) {
      // still on the road: the car until your knock
      this._inCar = true;
      if (this.stage.setControls) this.stage.setControls(false);
      if (typeof DriveBack !== 'undefined') DriveBack.show({ weather: this.stage.land && this.stage.land.weather, day: Session.state.day });
    }
    return view;
  }

  /* Who can hear whom: the hall is the people in it. Somebody still in
     a car hears none of it and is heard by nobody there; the dead and
     everybody after the reveal hear as usual. */
  _hallVoices(dt) {
    if (typeof VoiceChat === 'undefined' || !VoiceChat.setVolume) return;
    this._volT = (this._volT || 0) - dt;
    if (this._volT > 0) return;
    this._volT = 0.25;
    const b = Session.state.breakfast;
    if (!b || b.revealed) { if (this._gated) { this._gated = false; VoiceChat.resetVolumes && VoiceChat.resetVolumes(); } return; }
    this._gated = true;
    const arrived = new Set(b.arrived || []);
    const meIn = this._spectator || !this._myId || (arrived.has(this._myId) && !this._inCar);
    for (const p of Session.state.players) {
      if (p.local) continue;
      const theyIn = arrived.has(p.id) || !p.alive;
      VoiceChat.setVolume(p.id, meIn && theyIn ? 1 : 0);
    }
  }

  update(dt, t) {
    this._stepWalkIn(dt);
    super.update(dt, t);
    this._hallVoices(dt);
    if (this._inCar && typeof DriveBack !== 'undefined') {
      DriveBack.step(dt);
      const b = Session.state.breakfast;
      const n = b ? b.arrived.length : 0;
      const note = n ? n + (n === 1 ? ' is' : ' are') + ' already at the table' : 'The first car is nearly there';
      if (note !== this._carNote) { this._carNote = note; DriveBack.note(note); }
    }
  }

  /* Your own way in: from the doorway, the long way round, to your
     chair — walked for you, at a walking pace, looking where you go. */
  _comeIn(delay) {
    const st = this.stage;
    if (!st || !this._myId) return;
    const pts = this._route(this._myId, 0);
    if (!pts) return;
    const home = this._myHome || pts[pts.length - 1];
    pts[pts.length - 1] = home.clone();
    this._walkIn = { pts, k: 1, wait: delay, pos: pts[0].clone(), started: false };
  }
  _stepWalkIn(dt) {
    const w = this._walkIn, st = this.stage;
    if (!w || !st || !st.rig) return;
    const rig = st.rig;
    if (w.wait > 0) { w.wait -= dt; if (w.wait > 0) return; }
    if (!w.started) {
      w.started = true;
      this._inCar = false;
      if (typeof DriveBack !== 'undefined') DriveBack.hide();
      if (st.setWalk) st.setWalk(true);
      rig.yaw = Math.atan2(-(w.pts[1].x - w.pts[0].x), -(w.pts[1].z - w.pts[0].z));
      rig.pitch = -0.04;
      w.hold = 0.7;   // a breath on the threshold, the room looking back at you
    }
    if (w.hold > 0) { w.hold -= dt; rig.pos.copy(w.pos); return; }
    const to = w.pts[w.k];
    const dx = to.x - w.pos.x, dz = to.z - w.pos.z, d = Math.hypot(dx, dz);
    const step = 1.35 * Math.min(dt, 0.1);
    if (d <= step) {
      w.pos.x = to.x; w.pos.z = to.z;
      w.k++;
      if (w.k >= w.pts.length) {
        // at your chair: sit, face the table, and the room is yours to look round
        this._walkIn = null;
        rig.pos.copy(w.pos);
        if (st.setWalk) st.setWalk(false);
        const seat = st.mySeat;
        if (seat && seat.face) rig.yaw = Math.atan2(-(seat.face.x - w.pos.x), -(seat.face.z - w.pos.z));
        rig.pitch = 0;
        AudioBus.play('bf-chair');
        if (st.setControls) st.setControls(true);
        return;
      }
    } else {
      w.pos.x += dx / d * step; w.pos.z += dz / d * step;
    }
    rig.pos.copy(w.pos);
    const want = Math.atan2(-dx, -dz);
    let dy = want - rig.yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    rig.yaw += dy * Math.min(1, dt * 3.2);
  }

  /* The door: opened for a knock, shut again behind them — unless the
     next is already coming through it. */
  _openDoor(secs) {
    const land = this.stage && this.stage.land;
    if (!land || !land.setDoor) return;
    this._doorOpen++;
    land.setDoor('great', false, false);
    AudioBus.play('estate-door');
    this._later(secs, () => {
      this._doorOpen = Math.max(0, this._doorOpen - 1);
      if (!this._doorOpen && this.stage && this.stage.land) this.stage.land.setDoor('great', true, false);
    });
  }
  _later(secs, fn) {
    const id = setTimeout(() => { this._timers.delete(id); if (this._alive && this.stage) fn(); }, secs * 1000);
    (this._timers || (this._timers = new Set())).add(id);
  }

  onEvent(e) {
    super.onEvent(e);
    if (e.type === 'arrive') { this._lastArrive = e; this._arrive(e.ids || [], e); if (e.last) this._lastIn = true; }
  }

  /* Just outside the great hall's east door, in this room's frame, and
     the first step inside it. */
  _door() { return new THREE.Vector3(6.6, 0, 3.5); }

  /* The long way round: in through the door, down the near side, round
     the foot of the table if your chair is on the far side, and up to
     your own chair from behind it. */
  _route(id, k) {
    const V = (x, z) => new THREE.Vector3(x, 0, z);
    const seat = this.stage.seats.find(s => s.id === id);
    if (!seat) return null;
    const side = seat.home.x > 0 ? 1 : -1;
    const lane = side * 2.15;
    const step = k * 0.55;
    const pts = [this._door(), V(5.0, 3.5 + step * 0.4)];
    if (side > 0) pts.push(V(lane, 3.5));
    else { pts.push(V(2.15, 5.15)); pts.push(V(-2.15, 5.15)); }
    pts.push(V(lane, seat.home.z));
    pts.push(seat.home.clone());
    return pts;
  }

  /* One of them is back: a car on the gravel if it is the first out of
     it, a knock, the table turning to the door, the door, and them. */
  _arrive(ids, e = {}) {
    if (!this.stage) return;
    if (!this._timers) this._timers = new Set();
    const knockAt = e.carFirst ? 2.0 : 0.9;
    const openAt = knockAt + 1.15;
    if (e.carFirst) AudioBus.play('bf-car');
    const mine = ids.indexOf(this._myId) >= 0 && !this._spectator;
    if (mine && typeof DriveBack !== 'undefined' && DriveBack.on) DriveBack.arrive(knockAt + 0.2);
    this._later(knockAt, () => {
      AudioBus.play('bf-knock');
      // everybody at the table looks at the door
      this.stage.setGaze(new THREE.Vector3(6.2, 1.5, 3.5));
      // the roll call: she says who, and they come
      const b = Session.state.breakfast;
      if (b && b.style === 'rollcall') {
        const names = ids.map(id => Session.playerById(id)).filter(Boolean).map(p => (p.local ? 'you' : p.name));
        if (names.length) {
          const text = ClaudiaLines.line('rollcallName', { names: joinNames(names), name: names[0] }, Session.state.seed + (this._arrivals | 0) * 31);
          if (text) Voice.say(text, { speaker: 'Claudia', public: true });
        }
      }
    });
    this._later(openAt, () => {
      this._openDoor(3.4);
      /* Each one through the door adds a note to a chord that will not
         resolve — it cannot know yet whether a chair stays empty, so it
         never says. The reveal is what resolves it, one way or the other. */
      this._arrivals = (this._arrivals | 0) + 1;
      if (this.music) this.music.stinger('arrive', { n: Math.min(this._arrivals - 1, 5) });
      ids.forEach((id) => {
        const p = Session.playerById(id);
        if (!p || p.local) return;
        const pts = this._route(id, 0);
        if (!pts) return;
        this.stage.walkPath(id, pts, { speed: 1.4, pause: 0.6 });
      });
      // somebody you were afraid for has walked in: a breath out, a nod
      this._react(['relief', 'nod', 'relief'], null, 0.3);
      clearTimeout(this._gazeT);
      this._gazeT = setTimeout(() => {
        if (!this._alive || !this.stage) return;
        this.stage.setGaze(null);
      }, 3200);
    });
    if (mine) this._comeIn(openAt + 0.2);
  }

  async drive() {
    const s = Session.state;
    // back in the day's key, as if nothing had happened
    this.music = Music.murder('dawn', Music.sceneMusic('breakfast', s.seed, s.day));
    await this._say(s.breakfast && s.breakfast.style === 'rollcall' ? 'rollcallOpen' : 'breakfastOpen', {}, null);
    if (!this._alive) return;
    if (this.music) this.music.section('breakfast', { at: 'bar', glide: 3 });

    /* The host lets them in. Everybody else watches them come. */
    if (Session.isHost) this._release();
    await this._waitFor(() => !!(Session.state.breakfast && Session.state.breakfast.revealed)
                              || Session.state.phase !== 'breakfast');
    if (!this._alive || Session.state.phase !== 'breakfast') return;
    if (this.stage) this.stage.setGaze(null);

    const b = Session.state.breakfast;
    if (b.victim) {
      // everybody looks at the empty chair, and so does the camera
      const empty = this.stage && this.stage.seats.find(x => x.id === b.victim);
      if (empty && this.stage) this.stage.setGaze(empty.home.clone().setY(1.0));
      // the breath is the band's: cut, held, and the hit with the lament under it on bar one
      const wait = this.music && this.music.ok ? this.music.strike('breakfast-absent', { then: 'absence', breath: 0.7 }) : 0.7;
      await Scenes.Drama.hush(this.stage, null, 'on:' + b.victim, { hold: wait, silent: false });
      if (!this._alive) return;
      Scenes.Drama.hit(this.stage, null, null, { shake: 0.35, flash: 'rgba(150,10,20,.5)' });
      this._react(['handsFace', 'gasp', 'headDown', 'shake'], b.victim);
      await this._sleep(0.5);
      Scenes.Drama.shot(this.stage, 'claudiaTight');
      await this._say('breakfastAbsent', { name: b.name }, null);
      Scenes.Drama.end(this.stage, this.music);
      if (this.stage) this.stage.setGaze(null);
    } else if (b.shielded) {
      // the poison was in them, and the shield held: everybody looks at them
      const saved = Session.playerById(b.shielded);
      const chair = this.stage && this.stage.seats.find(x => x.id === b.shielded);
      if (chair && this.stage) this.stage.setGaze(chair.home.clone().setY(1.2));
      Scenes.Drama.hit(this.stage, this.music, 'shield-held', { shake: 0.2, flash: 'rgba(150,200,255,.35)' });
      if (this.music) this.music.section('saved', { at: 'bar', glide: 2 });
      Scenes.Cine.card({ kicker: 'Poisoned — and the shield held', title: saved && saved.local ? 'YOU' : (b.shieldName || '').toUpperCase(),
                         tone: 'shield', sub: 'Somebody here put it in them.' });
      this._react(['gasp', 'relief', 'shake', 'handsFace'], b.shielded);
      await this._say(this._setFor('breakfastShield', saved), { name: b.shieldName }, null);
      Scenes.Cine.card(null);
      if (this.stage) this.stage.setGaze(null);
    } else {
      if (this.music) { this.music.stinger('all-here'); this.music.section('saved', { at: 'bar', glide: 2 }); }
      this._react(['relief', 'clap', 'laugh', 'relief'], null);
      await this._say('breakfastNobody', {}, null);
    }
    if (!this._alive) return;
    void s;

    // straight from the empty chair to the round table
    await this._say('breakfastSend', {}, null);
    if (!this._alive) return;
    await Scenes.barrier('breakfast-done-' + Session.state.day);
    if (Session.isHost) Net.send({ type: 'advance' });
  }

  /* One group at a time, each given time to be watched coming in, and
     then a short, quiet look at the empty chair before the name. */
  async _release() {
    let guard = 0;
    while (this._alive && guard++ < 24 && !this._lastIn) {
      const b = Session.state.breakfast;
      if (!b || b.revealed || Session.state.phase !== 'breakfast') return;
      // one at a time: a knock and a door each, and a new car takes a moment to pull up
      const call = Session.state.breakfast && Session.state.breakfast.style === 'rollcall';
      const last = this._lastArrive;
      await this._sleep(guard === 1 ? 0.6 : (last && last.carDone ? 5.2 : 3.6) + (call ? 0.8 : 0));
      if (!this._alive) return;
      const before = b.groups;
      Net.send({ type: 'breakfastNext' });
      await this._waitFor(() => !Session.state.breakfast || Session.state.breakfast.groups !== before
                                || Session.state.breakfast.revealed, 3000);
    }
    if (!this._alive || !Session.state.breakfast || Session.state.breakfast.revealed) return;
    /* Everybody who is coming has come. Let the last of them sit down,
       and then a quiet look at the chair nobody is in. */
    await this._sleep(5.5);
    const b = Session.state.breakfast;
    if (b && b.arrived.length < Session.alive().length) {
      await this._say('breakfastWait', {}, null);
      await this._sleep(0.8);
    }
    if (!this._alive) return;
    Net.send({ type: 'breakfastNext' });
  }

  dispose() {
    clearTimeout(this._gazeT);
    if (this._timers) { this._timers.forEach(clearTimeout); this._timers.clear(); }
    if (typeof DriveBack !== 'undefined') DriveBack.hide(true);
    if (this._gated && typeof VoiceChat !== 'undefined' && VoiceChat.resetVolumes) VoiceChat.resetVolumes();
    super.dispose();
  }
}

/* The morning's own sounds: a car pulling up on the gravel, three
   knocks on an oak door, a chair drawn back. */
if (typeof AudioBus !== 'undefined' && AudioBus.define) {
  const burst = (ctx, len, decay) => {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * decay));
    const src = ctx.createBufferSource(); src.buffer = buf; return src;
  };
  AudioBus.define('bf-knock', (ctx, dest) => {
    const t = ctx.currentTime;
    [0, 0.26, 0.5].forEach((at, i) => {
      // the knuckle: a short thud with the wood ringing under it
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150 - i * 6, t + at); o.frequency.exponentialRampToValueAtTime(80, t + at + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(0.5, t + at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.16);
      o.connect(g); g.connect(dest); o.start(t + at); o.stop(t + at + 0.2);
      const n = burst(ctx, 0.05, 0.008);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.value = 0.35;
      n.connect(bp); bp.connect(ng); ng.connect(dest); n.start(t + at);
    });
  });
  AudioBus.define('bf-car', (ctx, dest) => {
    const t = ctx.currentTime, len = 2.6;
    // tyres on gravel, slowing
    const n = burst(ctx, len, 3);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(900, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(bp); bp.connect(g); g.connect(dest); n.start(t);
    // the engine, idling down
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.07, t + 0.4);
    og.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(lp); lp.connect(og); og.connect(dest); o.start(t); o.stop(t + len + 0.1);
    // and the door of it, shutting
    const d = burst(ctx, 0.25, 0.05);
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 500;
    const dg = ctx.createGain(); dg.gain.value = 0.4;
    d.connect(dl); dl.connect(dg); dg.connect(dest); d.start(t + len - 0.4);
  });
  AudioBus.define('bf-chair', (ctx, dest) => {
    const t = ctx.currentTime;
    const n = burst(ctx, 0.5, 0.25);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0.18;
    n.connect(bp); bp.connect(g); g.connect(dest); n.start(t);
  });
}
