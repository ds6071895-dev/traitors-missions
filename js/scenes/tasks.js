/* ------------------------------------------------------------------
   tasks.js — the day, loose in the castle.

   Everybody gets the house for a few minutes and a list of little
   jobs. Walk into a glowing gold ring, solve its puzzle, and the pot
   goes up. A blue ring is an errand: pick something up there, carry it
   across the house, put it down at the next blue ring. Finish your list
   and you are given more — there is always somewhere you are meant to
   be, which is exactly what makes "where were you?" a question.

   Some lists have a sealed letter on them for somebody: walk up to them
   and hold E beside them for a couple of seconds. That looks, to
   anybody watching, exactly like what the Traitor carrying the poison
   has to do to a Faithful before the bell — hold F beside them for the
   same couple of seconds. Nobody is told when it happens.

   What you do see goes in your notebook (N): who you were with, and
   where; and anybody you saw hand anybody anything. That is the
   evidence the round table has to work with, along with how many jobs
   each person managed.

   Voices carry the way they would in a stone house: a whisper in the
   turret is a whisper. Somebody across the castle is barely there.

   The host also plays the AI contestants here (`CastleBots`) and is the
   rules' eyes (`CastleNet.eyes`). Every screen draws everybody from the
   poses `CastleNet` keeps.
------------------------------------------------------------------ */
class TasksScene {

  constructor(opts = {}) {
    this.opts = opts;
    this.stage = null;
    this.music = null;
    this._alive = true;
    this._offs = [];
    this._hold = null;          // { kind: 'letter'|'poison', target, t }
    this._busy = false;         // a puzzle is open
    this._notesOpen = false;
    this._touchHeld = new Set();
    this._lastPaint = 0;
    this._prompt = '';          // what the prompt says, so it is only redrawn when that changes
    this._facing = null;        // who you are facing, held for a moment so it does not flicker
    this._facingT = 0;
    this._t = 0;
  }

  /* ---------------- building ---------------- */

  build() {
    const s = Session.state;
    const me = s.players.find(p => p.local);
    this._dead = !me || !me.alive;
    this._meId = me ? me.id : null;
    const cast = s.players.filter(p => p.alive || p.local).sort((a, b) => a.seat - b.seat);
    this.stage = Stage.build({
      seed: s.seed + 131 * (s.day + 1), hour: 'morning', room: 'hall', dress: 'none',
      claudia: false, free: true, furnish: true, players: cast, walkSpeed: 5.0,
    });
    this.stage.setWalk(true);
    this._land = this.stage.land;
    // where everybody starts: the seat the stage gave them, in castle terms
    this._spawns = new Map(this.stage.seats.map(seat => {
      const l = this._land.toLocal(seat.pos.x, seat.pos.z);
      return [seat.id, { x: l.x, z: l.z }];
    }));
    this._buildStations();
    this.stage.update(0);
    return this.stage.view;
  }

  /* A station sits on clear floor. The catalogue's spot is nudged out
     of any furniture it landed in. */
  _clearSpot(x, z) {
    const solid = this._land.solid || [];
    const blocked = (px, pz) => solid.some(b => px > b.x0 - 0.35 && px < b.x1 + 0.35 && pz > b.z0 - 0.35 && pz < b.z1 + 0.35);
    const okAt = (px, pz) => CastleLayout.walkable(px, pz) && !blocked(px, pz);
    if (okAt(x, z)) return { x, z };
    for (let r = 0.25; r <= 2.5; r += 0.25) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (okAt(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }

  /* Every station gets a marker; only the ones on your list are lit. A
     gold ring and a turning diamond for a puzzle, blue and a box for an
     errand, and a beam of light up from either so you can find it from
     the doorway. */
  _buildStations() {
    this._stationAt = new Map();
    const group = new THREE.Group();
    this.stage.scene.add(group);
    this._markers = group;
    const ringGeo = new THREE.RingGeometry(0.42, 0.58, 40);
    const orbGeo = new THREE.OctahedronGeometry(0.14, 0);
    const boxGeo = new THREE.BoxGeometry(0.22, 0.16, 0.22);
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.32, 2.6, 16, 1, true);
    const mk = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
      side: THREE.DoubleSide, depthWrite: false });
    this._mats = { gold: mk('#ffd66b', 0.9), goldBeam: mk('#ffd66b', 0.16), goldOrb: new THREE.MeshBasicMaterial({ color: '#fff0b8' }),
                   blue: mk('#7cc8ff', 0.9), blueBeam: mk('#7cc8ff', 0.16), blueOrb: new THREE.MeshBasicMaterial({ color: '#d6efff' }) };
    for (const st of Chores.STATIONS) {
      const spot = this._clearSpot(st.x, st.z);
      const w = this._land.toWorld(spot.x, spot.z);
      const y = this._land.heightAt(w.x, w.z);
      const m = new THREE.Group();
      m.position.set(w.x, y, w.z);
      const ring = new THREE.Mesh(ringGeo, this._mats.gold);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
      const orb = new THREE.Mesh(orbGeo, this._mats.goldOrb);
      orb.position.y = 1.35;
      const box = new THREE.Mesh(boxGeo, this._mats.blueOrb);
      box.position.y = 1.3;
      const beam = new THREE.Mesh(beamGeo, this._mats.goldBeam);
      beam.position.y = 1.3;
      m.add(ring, orb, box, beam);
      m.visible = false;
      m.userData = { id: st.id, orb, box, ring, beam };
      group.add(m);
      this._stationAt.set(st.id, { x: spot.x, z: spot.z, world: m.position, mesh: m });
    }
  }

  setShot() {}
  setSpeaking() {}

  /* ---------------- starting ---------------- */

  start() {
    const s = Session.state;
    Scenes.Cine.on(true);
    Scenes.Cine.bars(false);
    CastleNet.start('d' + s.day);
    if (Session.isHost) {
      Session.setEyes(CastleNet.eyes);
      const bots = Session.alive().filter(p => p.bot || (typeof Bots !== 'undefined' && Bots.running && !p.local))
        .map(p => p.id);
      CastleBots.start(bots, { solid: this._land.solid || [], seed: s.seed + s.day * 31,
                               spawn: (id) => this._spawns.get(id) });
    }
    this.music = Music.tasks ? Music.tasks() : Music.ceremony();
    this._hud();
    this._offs.push(Net.on((e) => this._onNet(e)));
    this._intro();
  }

  async _intro() {
    const s = Session.state;
    const say = (set, vars) => this._say(set, vars);
    const secs = (s.chores && s.chores.seconds) || s.taskSeconds || 180;
    const words = secs % 60 === 0
      ? ['one', 'two', 'three'][secs / 60 - 1] + (secs === 60 ? ' minute' : ' minutes')
      : secs === 90 ? 'a minute and a half' : ({ 30: 'thirty seconds', 45: 'forty-five seconds', 120: 'two minutes' }[secs] || secs + ' seconds');
    await say(s.day === 0 ? 'tasksFirst' : 'tasksOpen',
              { count: Session.alive().length, time: words, Time: words.charAt(0).toUpperCase() + words.slice(1) });
    if (!this._alive) return;
    const v = Session.myPrivate() || {};
    if (v.role === 'traitor' && v.poison && !this._dead) {
      if (v.poison.mine) {
        Scenes.Cine.card({ kicker: 'In your pocket', title: 'THE POISON', tone: 'traitor',
                           sub: 'Hold <b>F</b> beside a Faithful for a moment. Do it before the bell, or be exposed at the round table.' });
        await say('poisonYou', {});
      } else {
        const c = Session.playerById(v.poison.carrier);
        Scenes.Cine.card({ kicker: 'Tonight', title: (c ? c.name : 'Your partner').toUpperCase() + ' CARRIES IT', tone: 'traitor',
                           sub: 'Keep the room looking the other way.' });
        await say('poisonPartner', { name: c ? c.name : 'your partner' });
      }
      Scenes.Cine.card(null);
    }
  }

  _say(set, vars = {}) {
    if (!this._alive) return Promise.resolve(false);
    const s = Session.state;
    const seed = s.seed + s.day * 977;
    const all = Object.assign({ count: Session.alive().length }, vars);
    const lines = ClaudiaLines.beats(set, all, seed);
    const pub = ClaudiaLines.isPublic(set);
    if (pub && typeof AIDirector !== 'undefined') AIDirector.claudiaLine(set, all, seed);
    return Scenes.run(lines.map((b, i) => ({
      line: { text: b.text, who: 'claudia', public: pub },
      hold: i === lines.length - 1 ? 0.3 : 0.15,
    })), this);
  }

  _onNet(e) {
    if (!this._alive) return;
    if (e.type === 'bell') {
      AudioBus.play('estate-door');
      if (this.music && this.music.stinger) this.music.stinger('bell', { at: 'beat' });
      if (this.music && this.music.section) this.music.section('bell', { at: 'bar', glide: 1 });
      const bl = Session.state.chores && Session.state.chores.bellAt || Session.BELL_AT;
      Scenes.Cine.card({ kicker: 'The bell', title: (bl === 30 ? 'THIRTY' : String(bl)) + ' SECONDS', tone: 'bad' });
      setTimeout(() => { if (this._alive) Scenes.Cine.card(null); }, 2200);
    }
    if (e.type === 'chore' && e.playerId === this._meId) this._popup('+' + U.money(Chores.VALUE));
    if (e.type === 'private' || e.type === 'state' || e.type === 'chore') this._dirty = true;
  }

  /* ---------------- the HUD ---------------- */

  _hud() {
    const root = document.createElement('div');
    root.className = 'tk-hud' + (Input.isTouch ? ' touch' : '');
    root.innerHTML = `
      <div class="tk-top">
        <div class="tk-clock"><i class="tk-clock-ring"></i><span>3:00</span></div>
        <div class="tk-pot"><small>THE POT</small><b>£0</b><i class="tk-pot-pop"></i></div>
      </div>
      <div class="tk-list">
        <div class="tk-list-head"><h4>YOUR JOBS</h4><span class="tk-count">0 done</span></div>
        <ul></ul>
        <div class="tk-carry" hidden></div>
      </div>
      <div class="tk-role" hidden></div>
      <canvas class="tk-map" width="300" height="300"></canvas>
      <button class="tk-notes-btn" type="button"><b>N</b> Notebook</button>
      <div class="tk-notes"><h4>WHAT YOU HAVE SEEN</h4><div class="tk-notes-body"></div></div>
      <div class="tk-prompt"><div class="tk-ring"></div><span class="tk-prompt-text"></span></div>
      <div class="tk-touch"><button class="tk-use" type="button">USE</button><button class="poison tk-poison" type="button" hidden>POISON</button></div>`;
    document.body.appendChild(root);
    const q = (sel) => root.querySelector(sel);
    this._dom = {
      root, list: q('.tk-list ul'), count: q('.tk-count'), carry: q('.tk-carry'),
      clock: q('.tk-clock span'), clockBox: q('.tk-clock'), clockRing: q('.tk-clock-ring'),
      pot: q('.tk-pot b'), pop: q('.tk-pot-pop'),
      role: q('.tk-role'), map: q('.tk-map'), notes: q('.tk-notes'), notesBody: q('.tk-notes-body'),
      prompt: q('.tk-prompt'), promptText: q('.tk-prompt-text'), use: q('.tk-use'), poison: q('.tk-poison'),
    };
    q('.tk-notes-btn').onclick = () => this._toggleNotes();
    const hold = (btn, key) => {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._touchHeld.add(key); this._touchPressed = key; });
      const up = () => this._touchHeld.delete(key);
      btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
    };
    hold(this._dom.use, 'interact');
    hold(this._dom.poison, 'poison');
    this._dirty = true;
  }

  /* "+£500", rising off the pot. */
  _popup(text) {
    const pop = this._dom && this._dom.pop;
    if (!pop) return;
    pop.textContent = text;
    pop.classList.remove('go');
    void pop.offsetWidth;
    pop.classList.add('go');
    AudioBus.play('coin');
  }

  _toggleNotes(on) {
    this._notesOpen = on === undefined ? !this._notesOpen : !!on;
    this._dom.notes.classList.toggle('on', this._notesOpen);
    if (this._notesOpen) this._paintNotes();
  }

  _name(id) {
    const p = Session.playerById(id);
    return p ? (p.local ? 'you' : p.name) : 'somebody';
  }

  _paintNotes() {
    const v = Session.myPrivate() || {};
    const notes = (v.notes || []).slice().reverse();
    const fmt = (t) => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    const day = (n) => (n.day === Session.state.day ? '' : 'Day ' + (n.day + 1) + ' ');
    this._dom.notesBody.innerHTML = notes.length ? notes.map(n => {
      const where = castleEsc(Chores.roomName(n.room));
      if (n.kind === 'handover') {
        return '<p class="hand"><i>' + day(n) + fmt(n.t) + '</i>You saw <b>' + castleEsc(this._name(n.a))
          + '</b> hand something to <b>' + castleEsc(this._name(n.b)) + '</b> in ' + where + '.</p>';
      }
      const who = (n.ids || []).map(id => castleEsc(this._name(id)));
      return '<p><i>' + day(n) + fmt(n.t) + '</i>' + (who.length ? 'In ' + where + ' with ' + joinNames(who) : 'Alone in ' + where) + '.</p>';
    }).join('') : '<p><i></i>Nothing yet. Keep your eyes open.</p>';
  }

  _icon(j) {
    if (j.kind === 'letter') return '✉';
    if (j.kind === 'carry') return '⬢';
    return '◆';
  }

  _paintHud() {
    const s = Session.state;
    const c = s.chores;
    const v = Session.myPrivate() || {};
    const d = this._dom;
    if (!d) return;
    const left = c ? Math.max(0, Math.ceil(((c.closed ? Date.now() : c.endsAt) - Date.now()) / 1000)) : 0;
    d.clock.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    d.clockBox.classList.toggle('bell', !!(c && left <= (c.bellAt || Session.BELL_AT)));
    d.clockRing.style.setProperty('--p', c ? U.clamp(left / (c.seconds || 180), 0, 1).toFixed(3) : '0');
    d.pot.textContent = U.money(s.pot || 0);
    if (!this._dirty) return;
    this._dirty = false;
    const jobs = this._dead ? [] : (v.jobs || []);
    const open = jobs.filter(j => !j.done);
    const done = jobs.length - open.length;
    d.count.textContent = done + ' done';
    /* What is left, in order, and the last two you finished — a list
       that grows all day is a list nobody reads. */
    const shown = open.concat(jobs.filter(j => j.done).slice(-2).reverse());
    const html = this._dead
      ? '<li class="done">You are out of the game. Watch.</li>'
      : shown.map(j => '<li class="' + (j.done ? 'done' : '') + (j.kind === 'carry' ? ' carry' : j.kind === 'letter' ? ' letter' : '')
          + (this._nearJob && this._nearJob.id === j.id ? ' near' : '') + '"><i>' + this._icon(j) + '</i><span>'
          + castleEsc(Chores.describe(j, (id) => this._name(id))) + '</span></li>').join('');
    if (html !== this._listHtml) { d.list.innerHTML = html; this._listHtml = html; }
    const carrying = jobs.find(j => j.kind === 'carry' && j.step && !j.done);
    d.carry.hidden = !carrying;
    if (carrying) d.carry.textContent = 'Carrying ' + carrying.item;
    const p = v.poison;
    if (p && !this._dead) {
      d.role.hidden = false;
      d.role.classList.toggle('used', !!p.used);
      const carrier = Session.playerById(p.carrier);
      d.role.innerHTML = p.used
        ? '<b>DONE.</b> The poison is in ' + castleEsc(this._name(p.target)) + '. It takes tonight. Act normal.'
        : p.mine ? '<b>YOU CARRY THE POISON.</b> Hold <b>F</b> beside a Faithful. Before the bell — or you are exposed.'
        : '<b>' + castleEsc(carrier ? carrier.name.toUpperCase() : 'YOUR PARTNER') + ' CARRIES IT.</b> Cover for them.';
      d.poison.hidden = !(p.mine && !p.used);
    } else d.role.hidden = true;
    // which markers are lit, and in which colour
    const lit = new Map();
    for (const j of open) {
      const place = Chores.placeOf(j);
      if (place) lit.set(place, j.kind === 'carry' ? 'blue' : 'gold');
    }
    for (const [id, st] of this._stationAt) {
      const kind = lit.get(id);
      st.mesh.visible = !!kind;
      if (!kind) continue;
      const u = st.mesh.userData;
      u.ring.material = kind === 'blue' ? this._mats.blue : this._mats.gold;
      u.beam.material = kind === 'blue' ? this._mats.blueBeam : this._mats.goldBeam;
      u.orb.visible = kind === 'gold';
      u.box.visible = kind === 'blue';
    }
    if (this._notesOpen) this._paintNotes();
  }

  /* The floor plan, you, your jobs, and anybody in the room with you —
     drawn every frame, so you glide across it rather than hop. */
  _paintMap() {
    const cv = this._dom && this._dom.map;
    if (!cv) return;
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const minX = -24, maxX = 28, minZ = -28, maxZ = 21;
    const k = Math.min(W / (maxX - minX), H / (maxZ - minZ));
    const ox = (W - (maxX - minX) * k) / 2, oz = (H - (maxZ - minZ) * k) / 2;
    const X = (x) => (x - minX) * k + ox;
    const Z = (z) => (z - minZ) * k + oz;
    g.clearRect(0, 0, W, H);
    const me = this._myLocal;
    const myRoom = this._myRoom;
    for (const r of CastleLayout.ROOMS) {
      g.fillStyle = r.id === myRoom ? 'rgba(242,193,78,.30)' : 'rgba(205,220,240,.14)';
      g.strokeStyle = 'rgba(225,235,250,.38)';
      g.lineWidth = 1.2;
      g.beginPath();
      if (r.shape === 'rect') g.rect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
      else g.arc(X(r.cx), Z(r.cz), r.r * k, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
    const v = Session.myPrivate() || {};
    const pulse = 3.6 + Math.sin(this._t * 5) * 1.1;
    for (const j of (v.jobs || [])) {
      if (j.done) continue;
      const st = this._stationAt.get(Chores.placeOf(j));
      if (!st) continue;
      g.fillStyle = j.kind === 'carry' ? '#7cc8ff' : '#ffd66b';
      g.beginPath(); g.arc(X(st.x), Z(st.z), pulse, 0, Math.PI * 2); g.fill();
    }
    // the people you can actually see: those in your room
    for (const p of Session.alive()) {
      if (p.id === this._meId) continue;
      const q = CastleNet.now(p.id);
      if (!q || !myRoom || q.room !== myRoom) continue;
      g.fillStyle = '#eef3fb';
      g.beginPath(); g.arc(X(q.x), Z(q.z), 3, 0, Math.PI * 2); g.fill();
    }
    if (me) {
      g.save();
      g.translate(X(me.x), Z(me.z));
      g.rotate(-me.h);
      g.fillStyle = '#7fe0a0';
      g.beginPath(); g.moveTo(0, 7); g.lineTo(-4.5, -4); g.lineTo(4.5, -4); g.closePath(); g.fill();
      g.restore();
    }
  }

  /* ---------------- the frame ---------------- */

  update(dt) {
    if (!this.stage) return;
    this._t += dt;
    this.stage.update(dt);
    const rig = this.stage.rig;
    const l = this._land.toLocal(rig.pos.x, rig.pos.z);
    const h = rig.yaw + Math.PI;
    this._myLocal = { x: l.x, z: l.z, h };
    this._myRoom = CastleNet.roomOf(l.x, l.z, this._myRoom);
    if (!this._dead && this._meId) CastleNet.publish(this._meId, l.x, l.z, h, this._hold ? this._hold.target : 0);
    if (Session.isHost) CastleBots.update(dt);
    this._drawOthers(dt);
    this._voices();
    this._interact(dt);
    this._animateStations(dt);
    this._paintMap();
    this._lastPaint -= dt;
    if (this._lastPaint <= 0) {
      this._lastPaint = 0.2;
      this._paintHud();
    }
    if (Input.pressed('notes')) this._toggleNotes();
    this._touchPressed = null;
  }

  _animateStations(dt) {
    for (const st of this._stationAt.values()) {
      if (!st.mesh.visible) continue;
      const u = st.mesh.userData;
      u.orb.position.y = 1.35 + Math.sin(this._t * 2.4 + st.x) * 0.08;
      u.orb.rotation.y += dt * 1.6;
      u.box.position.y = 1.3 + Math.sin(this._t * 2.0 + st.z) * 0.07;
      u.box.rotation.y -= dt * 1.1;
      const near = this._myLocal ? Math.hypot(st.x - this._myLocal.x, st.z - this._myLocal.z) : 99;
      u.ring.scale.setScalar(near < 1.6 ? 1.15 + Math.sin(this._t * 8) * 0.05 : 1);
    }
    const a = 0.65 + Math.sin(this._t * 3) * 0.22;
    this._mats.gold.opacity = a; this._mats.blue.opacity = a;
  }

  /* Everybody else, where their pose says they are now — carried forward
     by their speed, then eased — so ten updates a second reads as one
     smooth walk. A reach is drawn as a reach. */
  _drawOthers(dt) {
    for (const f of this.stage.figures) {
      if (!f) continue;
      const id = f.userData.playerId;
      const q = CastleNet.now(id);
      if (!q) continue;
      const w = this._land.toWorld(q.x, q.z);
      const before = f.position.clone();
      const k = 1 - Math.exp(-16 * dt);
      f.position.x += (w.x - f.position.x) * k;
      f.position.z += (w.z - f.position.z) * k;
      if (Math.hypot(w.x - f.position.x, w.z - f.position.z) > 6) f.position.set(w.x, f.position.y, w.z);
      f.position.y = this._land.heightAt(f.position.x, f.position.z);
      const speed = dt > 0 ? Math.hypot(f.position.x - before.x, f.position.z - before.z) / dt : 0;
      f.userData.pace = U.damp(f.userData.pace || 0, speed, 8, dt);
      Figure.setLocomotion(f, f.userData.pace > 0.3 ? f.userData.pace : 0, 0);
      f.rotation.y = U.angLerp(f.rotation.y, q.h, 1 - Math.exp(-10 * dt));
      Figure.setHolding(f, !!q.g);
      /* Something small and pale in the reaching hand. A letter and the
         poison are the same envelope: that is the whole point. */
      const env = this._envelope(f);
      env.visible = !!q.g && f.visible && (f.userData.holding || 0) > 0.45;
      if (env.visible) {
        Figure.handAt(f, env.position);
        env.rotation.y = f.rotation.y;
      }
      const tgt = q.g ? this.stage.figures.find(o => o && o.userData.playerId === q.g) : null;
      if (tgt) Figure.lookAt(f, tgt.position.clone().setY(tgt.position.y + 1.2));
      else if (q.g === this._meId) Figure.lookAt(f, this.stage.camera.position);
    }
  }

  _envelope(f) {
    if (f.userData.envelope) return f.userData.envelope;
    if (!this._envGeo) {
      this._envGeo = new THREE.BoxGeometry(0.15, 0.012, 0.1);
      this._envMat = new THREE.MeshStandardMaterial({ color: '#efe6d4', roughness: 0.7 });
    }
    const m = new THREE.Mesh(this._envGeo, this._envMat);
    m.visible = false;
    this.stage.scene.add(m);
    f.userData.envelope = m;
    return m;
  }

  /* A stone house: loud beside you, a murmur through a door, nearly
     nothing from the other end of the castle. */
  _voices() {
    if (typeof VoiceChat === 'undefined' || !VoiceChat.setVolume || !this._myLocal) return;
    this._volClock = (this._volClock || 0) - 1;
    if (this._volClock > 0) return;
    this._volClock = 6;
    for (const p of Session.state.players) {
      if (p.local) continue;
      const q = CastleNet.get(p.id);
      if (!q) { VoiceChat.setVolume(p.id, 0.5); continue; }
      const d = Math.hypot(q.x - this._myLocal.x, q.z - this._myLocal.z);
      let v = U.clamp(1 - (d - 4) / 24, 0.15, 1);
      if (q.room && this._myRoom && q.room !== this._myRoom) v *= 0.6;
      VoiceChat.setVolume(p.id, v);
    }
  }

  _setPrompt(html, cls) {
    const d = this._dom;
    if (!html) {
      if (this._prompt) { d.prompt.classList.remove('on'); this._prompt = ''; }
      return;
    }
    const key = cls + '|' + html;
    if (key === this._prompt) return;
    this._prompt = key;
    d.promptText.innerHTML = html;
    d.prompt.className = 'tk-prompt on' + (cls ? ' ' + cls : '');
  }

  /* Who you are facing, close enough to touch. Once somebody is picked
     they stay picked while they are still roughly in front of you, so a
     step or a glance does not make the prompt flicker between people. */
  _facingWho(dt) {
    const me = this._myLocal;
    const fx = Math.sin(me.h), fz = Math.cos(me.h);
    const score = (p) => {
      const q = CastleNet.now(p.id);
      if (!q) return null;
      const dx = q.x - me.x, dz = q.z - me.z;
      const dd = Math.hypot(dx, dz);
      if (dd > Chores.REACH + 0.3 || dd < 0.01) return null;
      return { dd, dot: (dx * fx + dz * fz) / dd };
    };
    if (this._facing) {
      const p = Session.playerById(this._facing);
      const sc = p && p.alive ? score(p) : null;
      if (sc && sc.dot > 0.1) { this._facingT = 0.35; return p; }
      this._facingT -= dt;
      if (this._facingT > 0 && sc) return p;
      this._facing = null;
    }
    let best = null, bd = Chores.REACH;
    for (const p of Session.alive()) {
      if (p.id === this._meId) continue;
      const sc = score(p);
      if (!sc || sc.dd > bd || sc.dot < 0.4) continue;
      bd = sc.dd; best = p;
    }
    if (best) { this._facing = best.id; this._facingT = 0.35; }
    return best;
  }

  /* What is in front of you: one of your stations, or a person. */
  _interact(dt) {
    const d = this._dom;
    if (!d || this._dead || this._busy) { if (d) this._setPrompt(''); this._hold = null; return; }
    const v = Session.myPrivate() || {};
    const c = Session.state.chores;
    if (!c || c.closed) { this._setPrompt(''); this._hold = null; return; }
    const me = this._myLocal;

    // the nearest place on your list: a puzzle, or an end of an errand
    let job = null, jd = 1.7;
    for (const j of (v.jobs || [])) {
      if (j.done || j.kind === 'letter') continue;
      const st = this._stationAt.get(Chores.placeOf(j));
      if (!st) continue;
      const dd = Math.hypot(st.x - me.x, st.z - me.z);
      if (dd < jd) { jd = dd; job = j; }
    }
    if ((this._nearJob && this._nearJob.id) !== (job && job.id)) { this._nearJob = job; this._dirty = true; }

    const who = this._facingWho(dt);
    const letter = who && (v.jobs || []).find(j => j.kind === 'letter' && !j.done && j.target === who.id);
    const partners = new Set(v.partners || []);
    const canPoison = who && v.poison && v.poison.mine && !v.poison.used && !partners.has(who.id);

    const want = (key) => Input.held(key) || this._touchHeld.has(key);
    const pressed = (key) => Input.pressed(key) || this._touchPressed === key;

    // holding: keep going while the key is held and they are in reach
    if (this._hold) {
      const h = this._hold;
      const still = who && who.id === h.target && want(h.kind === 'poison' ? 'poison' : 'interact');
      if (!still) this._hold = null;
      else {
        h.t += dt;
        d.prompt.style.setProperty('--p', Math.min(1, h.t / Chores.HOLD).toFixed(3));
        if (h.t >= Chores.HOLD) {
          Net.send({ type: h.kind === 'poison' ? 'poison' : 'handover', targetId: h.target });
          AudioBus.play('ui-click');
          this._hold = null;
          this._cooldown = 1.0;
          d.prompt.style.setProperty('--p', '0');
        }
        return;
      }
    }
    this._cooldown = Math.max(0, (this._cooldown || 0) - dt);
    if (this._cooldown > 0) { this._setPrompt(''); return; }

    const rows = [];
    if (letter) rows.push(['E', 'Hold to hand ' + who.name + ' the letter']);
    if (canPoison) rows.push(['F', 'Hold to slip ' + who.name + ' the poison']);
    if (!letter && job) {
      if (job.kind === 'carry') rows.push(['E', (job.step ? 'Put down ' : 'Pick up ') + job.item]);
      else rows.push(['E', (Chores.TYPES[job.type] || {}).verb || 'Use']);
    }
    if (!rows.length) { this._setPrompt(''); return; }
    this._setPrompt(rows.map(r => '<kbd>' + r[0] + '</kbd> ' + castleEsc(r[1])).join('<em></em>'),
                    canPoison ? 'poison' : '');
    if (canPoison && want('poison')) { this._hold = { kind: 'poison', target: who.id, t: 0 }; return; }
    if (letter && want('interact')) { this._hold = { kind: 'letter', target: who.id, t: 0 }; return; }
    if (job && pressed('interact')) this._doJob(job);
  }

  async _doJob(job) {
    // an errand is a moment: pick it up, put it down
    if (job.kind === 'carry') {
      Net.send({ type: 'chore', jobId: job.id });
      AudioBus.play(job.step ? 'coin' : 'ui-click');
      this._cooldown = 0.6;
      this._dirty = true;
      return;
    }
    this._busy = true;
    this._setPrompt('');
    this.stage.setControls(false);
    const ok = await ChoreGames.open(job);
    if (!this._alive) return;
    this._busy = false;
    if (this.stage) this.stage.setControls(true);
    if (ok) Net.send({ type: 'chore', jobId: job.id });
  }

  dispose() {
    this._alive = false;
    this._offs.forEach(off => { try { off(); } catch (e) {} });
    this._offs = [];
    ChoreGames.close(false);
    if (Session.isHost) { CastleBots.stop(); Session.setEyes(null); }
    CastleNet.stop();
    if (typeof VoiceChat !== 'undefined' && VoiceChat.resetVolumes) VoiceChat.resetVolumes();
    if (this._dom) { this._dom.root.remove(); this._dom = null; }
    Scenes.Cine.card(null);
    if (this.music) { this.music.stop(1.0); this.music = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
