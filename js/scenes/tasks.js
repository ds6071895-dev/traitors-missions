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
   each person managed. Whoever has done the most when the bell goes
   holds the shield that night, and the HUD shows who is leading.

   Voices carry the way they would in a stone house: a whisper in the
   turret is a whisper. Somebody across the castle is barely there. And
   any door can be shut (E, at the door): a room with every door shut
   is private — nobody outside sees in or hears a word, and nobody in it
   hears anybody outside. Anybody can open it again.

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
    this.botIntroPending = true;
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
      seed: s.seed + 131 * (s.day + 1), hour: 'golden', room: 'hall', dress: 'none',
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
    // the day's own arrangement and key, and one hit as the doors open
    this.music = Music.tasks(Music.dayMusic(s.seed, s.day));
    if (this.music.stinger) this.music.stinger('castle-open', { at: 'beat' });
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
    // Private poison instructions can outlast the public welcome on another screen.
    await Scenes.barrier('tasksIntro:' + s.day);
    if (this._alive) this.botIntroPending = false;
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
        <div class="tk-shield" title="Most jobs at the bell: the poison cannot take them tonight">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/></svg>
          <span><small>SHIELD</small><b>Nobody yet</b></span>
        </div>
      </div>
      <div class="tk-list">
        <div class="tk-list-head"><h4>YOUR JOBS<i class="tk-fold">▾</i></h4><span class="tk-count">0 done</span></div>
        <ul></ul>
        <div class="tk-carry" hidden></div>
      </div>
      <div class="tk-role" hidden></div>
      <div class="tk-room"><b></b><small>Door shut — only this room can hear you</small></div>
      <canvas class="tk-map" width="472" height="256"></canvas>
      <button class="tk-notes-btn" type="button"><b>N</b> Notebook</button>
      <div class="tk-notes"><h4>WHAT YOU HAVE SEEN</h4><div class="tk-notes-body"></div></div>
      <div class="tk-prompt"><div class="tk-ring"></div><span class="tk-prompt-text"></span></div>
      <div class="tk-touch"><button class="tk-use" type="button">USE</button><button class="poison tk-poison" type="button" hidden>POISON</button></div>`;
    document.body.appendChild(root);
    const q = (sel) => root.querySelector(sel);
    this._dom = {
      root, list: q('.tk-list ul'), count: q('.tk-count'), carry: q('.tk-carry'),
      clock: q('.tk-clock span'), clockBox: q('.tk-clock'), clockRing: q('.tk-clock-ring'),
      pot: q('.tk-pot b'), pop: q('.tk-pot-pop'), shield: q('.tk-shield'), shieldWho: q('.tk-shield b'),
      role: q('.tk-role'), map: q('.tk-map'), notes: q('.tk-notes'), notesBody: q('.tk-notes-body'),
      prompt: q('.tk-prompt'), promptText: q('.tk-prompt-text'), use: q('.tk-use'), poison: q('.tk-poison'),
      room: q('.tk-room'), roomName: q('.tk-room b'),
    };
    q('.tk-notes-btn').onclick = () => this._toggleNotes();
    // on a phone the list folds down to the next job, out of the view
    q('.tk-list-head').onclick = () => q('.tk-list').classList.toggle('min');
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
      if (n.kind === 'door') {
        return '<p class="door"><i>' + day(n) + fmt(n.t) + '</i>You saw <b>' + castleEsc(this._name(n.who))
          + '</b> ' + (n.shut ? 'shut' : 'open') + ' the door of ' + where + '.</p>';
      }
      const who = (n.ids || []).map(id => castleEsc(this._name(id)));
      const behind = n.shut ? 'behind a shut door ' : '';
      return '<p' + (n.shut ? ' class="door"' : '') + '><i>' + day(n) + fmt(n.t) + '</i>'
        + (who.length ? (n.shut ? 'Behind a shut door in ' : 'In ') + where + ' with ' + joinNames(who) : 'Alone ' + behind + 'in ' + where) + '.</p>';
    }).join('') : '<p><i></i>Nothing yet. Keep your eyes open.</p>';
  }

  _icon(j) {
    // drawn rather than typed: on most phones this character is an emoji
    if (j.kind === 'letter') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">'
      + '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
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
    // where you are, and whether the door is shut on it
    const here = this._myRoom ? Chores.roomName(this._myRoom) : '';
    const roomText = here ? here.charAt(0).toUpperCase() + here.slice(1) : '';
    if (d.roomName.textContent !== roomText) d.roomName.textContent = roomText;
    d.room.classList.toggle('shut', !this._dead && CastleLayout.sealed(this._myRoom, s.doors));
    if (!this._dirty) return;
    this._dirty = false;
    // who would hold the shield if the bell went now
    const lead = Session.shieldLeader();
    const leadText = lead ? (lead.id === this._meId ? 'You' : lead.name) + ' · ' + lead.n : 'Nobody yet';
    if (d.shieldWho.textContent !== leadText) d.shieldWho.textContent = leadText;
    d.shield.classList.toggle('mine', !!lead && lead.id === this._meId);
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
     drawn every frame, so you glide across it rather than hop. The plan
     itself only changes when you change room or a door opens or shuts,
     so it is drawn once into a canvas of its own and copied. */
  _paintMap() {
    const cv = this._dom && this._dom.map;
    if (!cv) return;
    // the canvas takes the size the stylesheet gives it, at the screen's density
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!this._mapFit || this._t - this._mapFit > 1) {
      this._mapFit = this._t || 1e-6;
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    }
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const u = dpr * U.clamp(W / dpr / 236, 0.75, 1);          // one "pixel" of mark, at this size
    const B = CastleLayout.BOUNDS, pad = 6 * u;
    const k = Math.min((W - 2 * pad) / (B.x1 - B.x0), (H - 2 * pad) / (B.z1 - B.z0));
    const ox = (W - (B.x1 - B.x0) * k) / 2, oz = (H - (B.z1 - B.z0) * k) / 2;
    const X = (x) => (x - B.x0) * k + ox;
    const Z = (z) => (z - B.z0) * k + oz;
    const shut = this._doorState();
    const key = W + ':' + H + ':' + this._myRoom + ':' + CastleLayout.DOORS.filter(d => shut[d.id]).map(d => d.id).join();
    if (!this._plan || this._plan.key !== key) {
      const pc = (this._plan && this._plan.cv) || document.createElement('canvas');
      pc.width = W; pc.height = H;
      TasksScene._paintPlan(pc.getContext('2d'), X, Z, k, u, this._myRoom, shut);
      this._plan = { cv: pc, key };
    }
    g.clearRect(0, 0, W, H);
    g.drawImage(this._plan.cv, 0, 0);
    const dot = (x, z, r, fill) => {
      g.beginPath(); g.arc(x, z, r, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
      g.lineWidth = 1.2 * u; g.strokeStyle = 'rgba(8,10,16,.85)'; g.stroke();
    };
    const pulse = 0.5 + Math.sin(this._t * 4) * 0.5;
    for (const j of this._mapJobs()) {
      if (j.done) continue;
      const st = this._stationAt.get(Chores.placeOf(j));
      if (!st) continue;
      const blue = j.kind === 'carry';
      g.fillStyle = blue ? 'rgba(124,200,255,.28)' : 'rgba(255,214,107,.28)';
      g.beginPath(); g.arc(X(st.x), Z(st.z), (4 + pulse * 3) * u, 0, Math.PI * 2); g.fill();
      dot(X(st.x), Z(st.z), 2.6 * u, blue ? '#7cc8ff' : '#ffd66b');
    }
    for (const q of this._mapPeople()) dot(X(q.x), Z(q.z), 2.3 * u, '#eef3fb');
    const me = this._myLocal;
    if (me) {
      g.save();
      g.translate(X(me.x), Z(me.z));
      g.fillStyle = 'rgba(127,224,160,.22)';
      g.beginPath(); g.arc(0, 0, 8 * u, 0, Math.PI * 2); g.fill();
      g.rotate(-me.h);
      g.beginPath(); g.moveTo(0, 6.5 * u); g.lineTo(-4.2 * u, -4 * u); g.lineTo(0, -2 * u); g.lineTo(4.2 * u, -4 * u); g.closePath();
      g.lineJoin = 'round'; g.lineWidth = 1.6 * u; g.strokeStyle = 'rgba(8,10,16,.9)'; g.stroke();
      g.fillStyle = '#7fe0a0'; g.fill();
      g.restore();
    }
  }

  /* The plan as an architect would draw it: one silhouette with a gilt
     edge, each room a floor with the walls left as the dark between
     them, a gap in the wall wherever there is a doorway, and a red bar
     only across a door that is shut. Built up in layers, each a little
     smaller than the last, so nothing is ever outlined twice. */
  static _paintPlan(g, X, Z, k, u, myRoom, shut) {
    const L = CastleLayout;
    const inset = 0.9 * u;                    // half an inside wall
    const shape = (r, grow) => {
      if (r.shape === 'rect') {
        g.rect(X(r.x0) - grow, Z(r.z0) - grow, (r.x1 - r.x0) * k + 2 * grow, (r.z1 - r.z0) * k + 2 * grow);
      } else {
        g.moveTo(X(r.cx) + r.r * k + grow, Z(r.cz));
        g.arc(X(r.cx), Z(r.cz), r.r * k + grow, 0, Math.PI * 2);
      }
    };
    const layer = (grow, fill, only) => {
      g.beginPath();
      for (const r of L.ROOMS) if (!only || only(r)) shape(r, grow);
      g.fillStyle = fill; g.fill();
    };
    layer(3.2 * u, 'rgba(0,0,0,.35)');       // a soft footing under the whole house
    layer(2.4 * u, '#8a7444');                // the gilt edge
    layer(1.4 * u, '#141a24');                // the walls
    layer(-inset, '#4a463d', r => r.id !== myRoom);
    if (myRoom) layer(-inset, '#a8843a', r => r.id === myRoom);
    /* Doorways: each room paints its own half of the opening, from the
       middle of the wall in, so the room you are in lights only its
       side of the threshold. */
    const across = inset + 0.6 * u, seam = 0.4 * u;
    const IN = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] };
    for (const r of L.ROOMS) {
      g.fillStyle = r.id === myRoom ? '#a8843a' : '#4a463d';
      if (r.shape === 'rect') {
        for (const side of ['n', 's', 'e', 'w']) for (const [a, b] of r.doors[side]) {
          const along = side === 'n' || side === 's';
          const lo = (along ? X(a) : Z(a)) + inset, hi = (along ? X(b) : Z(b)) - inset;
          if (hi <= lo) continue;
          const line = side === 'n' ? Z(r.z0) : side === 's' ? Z(r.z1) : side === 'w' ? X(r.x0) : X(r.x1);
          const dir = IN[side][along ? 1 : 0];
          const d0 = Math.min(line - dir * seam, line + dir * across), d1 = Math.max(line - dir * seam, line + dir * across);
          if (along) g.fillRect(lo, d0, hi - lo, d1 - d0);
          else g.fillRect(d0, lo, d1 - d0, hi - lo);
        }
      } else {
        for (const d of r.doors) {
          const half = d.w / 2 * k - inset;
          if (half <= 0) continue;
          g.save();
          g.translate(X(r.cx) + Math.cos(d.a) * r.r * k, Z(r.cz) + Math.sin(d.a) * r.r * k);
          g.rotate(d.a);
          g.fillRect(-across, -half, across + seam, 2 * half);
          g.restore();
        }
      }
    }
    // the shut doors
    g.lineCap = 'round';
    for (const dr of L.DOORS) {
      if (!shut[dr.id]) continue;
      const h = Math.max(dr.w / 2 * k - inset, 1.5 * u);
      const seg = () => {
        g.beginPath();
        if (dr.axis === 'x') { g.moveTo(X(dr.x) - h, Z(dr.z)); g.lineTo(X(dr.x) + h, Z(dr.z)); }
        else { g.moveTo(X(dr.x), Z(dr.z) - h); g.lineTo(X(dr.x), Z(dr.z) + h); }
      };
      seg(); g.lineWidth = 4 * u; g.strokeStyle = 'rgba(8,10,16,.9)'; g.stroke();
      seg(); g.lineWidth = 2.4 * u; g.strokeStyle = '#e0524a'; g.stroke();
    }
  }

  _mapJobs() { return (Session.myPrivate() || {}).jobs || []; }

  // the shut doors, as the session keeps them
  _doorState() { return (Session.state && Session.state.doors) || {}; }

  // the people you can actually see: those in your room
  _mapPeople() {
    const out = [];
    for (const p of Session.alive()) {
      if (p.id === this._meId) continue;
      const q = CastleNet.now(p.id);
      if (q && this._myRoom && q.room === this._myRoom) out.push(q);
    }
    return out;
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
    if (!this._dead && this._meId) CastleNet.publish(this._meId, l.x, l.z, h, this._hold ? this._hold.target : 0, this._busy);
    if (Session.isHost) CastleBots.update(dt);
    this._doors();
    if (Session.isHost && (this._routeClock = (this._routeClock || 0) - dt) <= 0) {
      // people walk in and out of rooms between events: look at who hears whom again
      this._routeClock = 0.5;
      Net.refreshRoutes();
    }
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
      // at a station, head down over the job
      if (!!q.w !== !!f.userData.working) {
        f.userData.working = !!q.w;
        if (q.w) Figure.act(f, 'work', { loop: true }); else Figure.stopAct(f, 'work');
      }
      /* Something small and pale in the reaching hand. A letter and the
         poison are the same envelope: that is the whole point — and the
         same reach, toward the same place on the person, either way. */
      const env = this._envelope(f);
      env.visible = !!q.g && f.visible && (f.userData.holding || 0) > 0.45;
      if (env.visible) {
        Figure.handAt(f, env.position);
        env.rotation.y = f.rotation.y;
      }
      const tgt = q.g ? this.stage.figures.find(o => o && o.userData.playerId === q.g) : null;
      if (tgt) {
        const at = tgt.position.clone().setY(tgt.position.y + 1.05 * (tgt.scale.y || 1));
        Figure.lookAt(f, at);
        Figure.reachTo(f, at);
      } else if (q.g === this._meId) {
        Figure.lookAt(f, this.stage.camera.position);
        Figure.reachTo(f, this.stage.camera.position.clone().setY(this.stage.camera.position.y - 0.5));
      } else Figure.reachTo(f, null);
    }
  }

  _envelope(f) {
    if (f.userData.envelope) return f.userData.envelope;
    if (!this._envGeo) {
      this._envGeo = new THREE.BoxGeometry(0.15, 0.012, 0.1);
      this._envMat = CastleSurfaces.material('plaster', { color: '#f2eadb', roughness: 0.7 });
    }
    const m = new THREE.Mesh(this._envGeo, this._envMat);
    m.visible = false;
    this.stage.scene.add(m);
    f.userData.envelope = m;
    return m;
  }

  /* A stone house: loud beside you, a murmur through a doorway, nearly
     nothing from the other end of the castle, and nothing through a shut
     door. The server keeps the shut ones shut for real; this is how the
     open house sounds. */
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
      // through a shut door, nothing at all
      if (CastleLayout.apart(this._myRoom, q.room, Session.state.doors)) v = 0;
      VoiceChat.setVolume(p.id, v);
    }
  }

  /* `use` lights the USE button on a touchscreen: there is something
     in front of you it would do. */
  _setPrompt(html, cls, use) {
    const d = this._dom;
    if (!html) {
      if (this._prompt) { d.prompt.classList.remove('on'); this._prompt = ''; d.use.classList.remove('ready'); }
      return;
    }
    const key = cls + '|' + html + '|' + !!use;
    if (key === this._prompt) return;
    this._prompt = key;
    d.use.classList.toggle('ready', !!use);
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

    // a door within reach, unless a job is nearer
    let door = CastleLayout.doorNear(me.x, me.z, 1.6);
    if (door && job && jd < Math.hypot(door.x - me.x, door.z - me.z)) door = null;

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
    const doorShut = door && !!(Session.state.doors || {})[door.id];
    // a door does not shut on somebody standing in it — you included
    const jammed = door && !doorShut && this._inDoorway(door);
    if (!letter && door) rows.push(['E', doorShut ? 'Open the door' : jammed ? 'Step out of the doorway to shut it' : 'Shut the door']);
    else if (!letter && job) {
      if (job.kind === 'carry') rows.push(['E', (job.step ? 'Put down ' : 'Pick up ') + job.item]);
      else rows.push(['E', (Chores.TYPES[job.type] || {}).verb || 'Use']);
    }
    if (!rows.length) { this._setPrompt(''); return; }
    this._setPrompt(rows.map(r => '<kbd>' + r[0] + '</kbd> ' + castleEsc(r[1])).join('<em></em>'),
                    canPoison ? 'poison' : '', rows.some(r => r[0] === 'E'));
    if (canPoison && want('poison')) { this._hold = { kind: 'poison', target: who.id, t: 0 }; return; }
    if (letter && want('interact')) { this._hold = { kind: 'letter', target: who.id, t: 0 }; return; }
    if (door && pressed('interact')) {
      if (!jammed) Net.send({ type: 'door', doorId: door.id, shut: !doorShut });
      this._cooldown = 0.5;
      return;
    }
    if (job && pressed('interact')) this._doJob(job);
  }

  // anybody in the way of a door, as this screen sees them
  _inDoorway(door) {
    const b = CastleLayout.doorBox(door, 0.32);
    const inside = (q) => q && q.x > b.x0 - 0.2 && q.x < b.x1 + 0.2 && q.z > b.z0 - 0.2 && q.z < b.z1 + 0.2;
    if (inside(this._myLocal)) return true;
    return Session.alive().some(p => p.id !== this._meId && inside(CastleNet.now(p.id)));
  }

  /* The doors stand as the session says. One that moves near you is
     heard — unless it is the far side of another shut door. */
  _doors() {
    const shut = Session.state.doors || {};
    const key = Object.keys(shut).sort().join(',');
    if (key === this._doorKey) return;
    const before = new Set((this._doorKey || '').split(',').filter(Boolean));
    this._doorKey = key;
    this._land.syncDoors(shut);
    if (!this._myLocal) return;
    for (const dr of CastleLayout.DOORS) {
      if (before.has(dr.id) === !!shut[dr.id]) continue;
      const far = Math.hypot(dr.x - this._myLocal.x, dr.z - this._myLocal.z);
      if (far > 16) continue;
      const gain = U.clamp(1.2 - far / 14, 0.15, 1);
      AudioBus.play(shut[dr.id] ? 'door-shut' : 'door-open', { gain });
    }
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

/* An old door coming open: the latch, then the hinge complaining. */
AudioBus.define('door-open', (ctx, dest, opts = {}) => {
  const t = ctx.currentTime;
  const k = opts.gain === undefined ? 1 : opts.gain;
  const len = 0.04;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.006));
  const click = ctx.createBufferSource(); click.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 3;
  const cg = ctx.createGain(); cg.gain.value = 0.3 * k;
  click.connect(bp); bp.connect(cg); cg.connect(dest);
  click.start(t);
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(210, t + 0.06); o.frequency.linearRampToValueAtTime(340, t + 0.4); o.frequency.linearRampToValueAtTime(260, t + 0.7);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t + 0.06); og.gain.linearRampToValueAtTime(0.05 * k + 0.0001, t + 0.15);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
  o.connect(f); f.connect(og); og.connect(dest);
  o.start(t + 0.06); o.stop(t + 0.8);
});
