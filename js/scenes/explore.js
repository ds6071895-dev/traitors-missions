/* ------------------------------------------------------------------
   explore.js — the castle, with nobody in it.

   A walk round the house on your own, from the front screen: the hall,
   the great hall where breakfast is, the round table chamber, up the
   stair to the turret, and the bedroom corridor. Nothing is at stake;
   it is for knowing your way about before a night that will lock you
   in a chair in one of these rooms.

   It is also where the day's jobs can be practised. The same gold
   rings and blue errands as the day, at the same stations, with the
   same puzzles — and the list never runs out: finish one and another
   takes its place, always of a kind you have done least, so a walk
   round the house works through all twelve. No clock, no pot, no
   Traitor behind you.

   Each room says its name as you walk into it. Escape leaves.
------------------------------------------------------------------ */
class ExploreScene {

  constructor(opts = {}) {
    this.opts = opts;
    this.stage = null;
    this.music = null;
    this._room = null;
    this._myRoom = null;
    this._key = null;
    this._t = 0;
    this._roomClock = 0;
    this._jobs = [];
    this._practised = {};       // type -> how many times, so the deal works round all of them
    this._done = 0;
    this._next = 0;             // job ids
    this._busy = false;
    this._touchPressed = null;
    this._prompt = '';
    this._lastPaint = 0;
    this._dirty = true;
  }

  // practice has no session: the doors are this screen's own
  _doorState() { return this._shut || (this._shut = {}); }

  static OPEN = 4;              // puzzles on the list at once, besides the errand

  build() {
    const me = { id: 'you', name: Look.getName() || 'You', look: Look.get(), local: true, seat: 0, alive: true };
    this.stage = Stage.build({ seed: 7, hour: this.opts.hour || 'golden', room: 'hall', dress: 'none',
                               claudia: false, free: true, furnish: true, walkSpeed: 5.0, players: [me] });
    this.stage.setWalk(true);
    this._land = this.stage.land;
    this.stage.rig.pos.copy(this._land.roomAnchor('hall'));
    this.stage.rig.yaw = 0;
    // the day's stations, drawn exactly as the day draws them
    TasksScene.prototype._buildStations.call(this);
    this._rng = U.makeRng((Date.now() ^ 0x5bd1e995) >>> 0 || 7);
    this._refill();
    this.stage.update(0);
    return this.stage.view;
  }

  _clearSpot(x, z) { return TasksScene.prototype._clearSpot.call(this, x, z); }

  setShot() {}
  setSpeaking() {}

  start() {
    Scenes.Cine.on(false);
    this.music = Music.roundtable();
    this._key = (e) => {
      if (e.code === 'Escape' && !ChoreGames.active) { e.preventDefault(); this.leave(); }
    };
    window.addEventListener('keydown', this._key);
    this._hud();
    Voice.show('', Input.isTouch
      ? 'Explore the castle. Thumbstick to walk, drag to look. Walk into a gold ring and tap USE to practise a job.'
      : 'Explore the castle. WASD to walk, mouse to look. Walk into a gold ring and press E to practise a job. Escape to leave.');
    setTimeout(() => { if (this.stage) Voice.clear(); }, 6500);
  }

  leave() {
    if (this._left) return;
    this._left = true;
    ChoreGames.close(false);
    if (this.opts.onLeave) this.opts.onLeave();
  }

  /* ---------------- the practice list ---------------- */

  /* Topped back up to four puzzles and one errand. A new puzzle is the
     kind you have practised least, at a station not already on the
     list, and never your own bedroom's trunk twice running. */
  _refill() {
    const rng = this._rng;
    const open = this._jobs.filter(j => !j.done);
    const busy = new Set(open.map(j => j.station || j.from || null).concat(open.map(j => j.to || null)));
    const pool = Chores.STATIONS.filter(s => s.bed === undefined || s.bed === 0);
    let puzzles = open.filter(j => j.kind === 'station').length;
    // a puzzle gets first claim on a station; the errand takes what is left
    while (puzzles < ExploreScene.OPEN) {
      const types = new Set(open.filter(j => j.kind === 'station').map(j => j.type));
      const free = pool.filter(s => !busy.has(s.id) && !types.has(s.type));
      if (!free.length) break;
      const least = Math.min(...free.map(s => this._practised[s.type] || 0));
      const pick = free.filter(s => (this._practised[s.type] || 0) === least);
      const st = pick[rng.int(0, pick.length - 1)];
      const job = { id: 'p' + this._next++, kind: 'station', station: st.id, type: st.type,
                    seed: rng.int(1, 0x7ffffff), done: false };
      this._jobs.push(job); open.push(job); busy.add(st.id);
      puzzles++;
    }
    if (!open.some(j => j.kind === 'carry')) {
      // an errand never borrows the only station of its kind: the harp
      // taken up by a delivery is the harp nobody can practise on
      const kinds = {};
      pool.forEach(s => { kinds[s.type] = (kinds[s.type] || 0) + 1; });
      const spots = pool.filter(s => !busy.has(s.id) && kinds[s.type] > 1);
      const from = spots[rng.int(0, spots.length - 1)];
      const far = spots.filter(s => s.room !== from.room);
      const to = far.length ? far[rng.int(0, far.length - 1)] : spots.find(s => s !== from);
      if (from && to) {
        this._jobs.push({ id: 'p' + this._next++, kind: 'carry', from: from.id, to: to.id,
                          item: Chores.ITEMS[rng.int(0, Chores.ITEMS.length - 1)], step: 0, done: false });
      }
    }
    // what is left, then the two most recently finished
    const done = this._jobs.filter(j => j.done).slice(-2);
    this._jobs = this._jobs.filter(j => !j.done).concat(done);
    this._dirty = true;
  }

  _finish(job) {
    job.done = true;
    this._done++;
    if (job.kind === 'station') this._practised[job.type] = (this._practised[job.type] || 0) + 1;
    AudioBus.play('coin');
    this._pop(job.kind === 'carry' ? 'Delivered' : 'Done');
    // the done one moves to the bottom, and a fresh one joins the list
    this._jobs = this._jobs.filter(j => j !== job).concat([job]);
    this._refill();
  }

  /* ---------------- the HUD ---------------- */

  _hud() {
    const root = document.createElement('div');
    root.className = 'tk-hud explore' + (Input.isTouch ? ' touch' : '');
    root.innerHTML = `
      <div class="tk-practice"><small>PRACTICE</small><b>0 done</b><i class="tk-pot-pop"></i></div>
      <div class="tk-list">
        <div class="tk-list-head"><h4>PRACTICE JOBS<i class="tk-fold">▾</i></h4><span class="tk-count">refills</span></div>
        <ul></ul>
        <div class="tk-carry" hidden></div>
      </div>
      <canvas class="tk-map" width="472" height="256"></canvas>
      <button class="tk-notes-btn tk-leave" type="button"><b>Esc</b> Leave</button>
      <div class="tk-prompt"><div class="tk-ring"></div><span class="tk-prompt-text"></span></div>
      <div class="tk-touch"><button class="tk-use" type="button">USE</button></div>`;
    document.body.appendChild(root);
    const q = (sel) => root.querySelector(sel);
    this._dom = {
      root, list: q('.tk-list ul'), carry: q('.tk-carry'), count: q('.tk-practice b'), pop: q('.tk-pot-pop'),
      map: q('.tk-map'), prompt: q('.tk-prompt'), promptText: q('.tk-prompt-text'), use: q('.tk-use'),
    };
    q('.tk-leave').onclick = () => { AudioBus.play('ui-click'); this.leave(); };
    q('.tk-list-head').onclick = () => q('.tk-list').classList.toggle('min');
    this._dom.use.addEventListener('pointerdown', (e) => { e.preventDefault(); this._touchPressed = 'interact'; });
  }

  _pop(text) {
    const pop = this._dom && this._dom.pop;
    if (!pop) return;
    pop.textContent = text;
    pop.classList.remove('go');
    void pop.offsetWidth;
    pop.classList.add('go');
  }

  _paintHud() {
    const d = this._dom;
    if (!d || !this._dirty) return;
    this._dirty = false;
    d.count.textContent = this._done + ' done';
    const html = this._jobs.map(j => '<li class="' + (j.done ? 'done' : '') + (j.kind === 'carry' ? ' carry' : '')
        + (this._nearJob && this._nearJob.id === j.id ? ' near' : '') + '"><i>'
        + TasksScene.prototype._icon(j) + '</i><span>' + castleEsc(Chores.describe(j)) + '</span></li>').join('');
    if (html !== this._listHtml) { d.list.innerHTML = html; this._listHtml = html; }
    const carrying = this._jobs.find(j => j.kind === 'carry' && j.step && !j.done);
    d.carry.hidden = !carrying;
    if (carrying) d.carry.textContent = 'Carrying ' + carrying.item;
    const lit = new Map();
    for (const j of this._jobs) {
      if (j.done) continue;
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
  }

  _mapJobs() { return this._jobs; }
  _mapPeople() { return []; }
  _setPrompt(html, cls, use) { return TasksScene.prototype._setPrompt.call(this, html, cls, use); }

  /* The nearest place on the list, and E (or USE) to do it. */
  _interact(dt) {
    const d = this._dom;
    if (!d || this._busy) { if (d) this._setPrompt(''); return; }
    const me = this._myLocal;
    let job = null, jd = 1.7;
    for (const j of this._jobs) {
      if (j.done) continue;
      const st = this._stationAt.get(Chores.placeOf(j));
      if (!st) continue;
      const dd = Math.hypot(st.x - me.x, st.z - me.z);
      if (dd < jd) { jd = dd; job = j; }
    }
    if ((this._nearJob && this._nearJob.id) !== (job && job.id)) { this._nearJob = job; this._dirty = true; }
    this._cooldown = Math.max(0, (this._cooldown || 0) - dt);
    // a door within reach, unless a job is nearer: shut it, see what a shut room is like
    let door = CastleLayout.doorNear(me.x, me.z, 1.6);
    if (door && job && jd < Math.hypot(door.x - me.x, door.z - me.z)) door = null;
    if ((!job && !door) || this._cooldown > 0) { this._setPrompt(''); return; }
    const pressed = Input.pressed('interact') || this._touchPressed === 'interact';
    if (door) {
      const shut = !!this._doorState()[door.id];
      const b = CastleLayout.doorBox(door, 0.32);
      const jammed = !shut && me.x > b.x0 - 0.2 && me.x < b.x1 + 0.2 && me.z > b.z0 - 0.2 && me.z < b.z1 + 0.2;
      this._setPrompt('<kbd>E</kbd> ' + (shut ? 'Open the door' : jammed ? 'Step out of the doorway to shut it' : 'Shut the door'), '', true);
      if (pressed && !jammed) {
        if (shut) delete this._shut[door.id]; else this._shut[door.id] = 1;
        this._land.setDoor(door.id, !shut, false);
        AudioBus.play(shut ? 'door-open' : 'door-shut');
        this._cooldown = 0.5;
      }
      return;
    }
    const verb = job.kind === 'carry' ? (job.step ? 'Put down ' : 'Pick up ') + job.item
      : (Chores.TYPES[job.type] || {}).verb || 'Use';
    this._setPrompt('<kbd>E</kbd> ' + castleEsc(verb), '', true);
    if (pressed) this._doJob(job);
  }

  async _doJob(job) {
    if (job.kind === 'carry') {
      AudioBus.play('ui-click');
      this._cooldown = 0.6;
      if (!job.step) { job.step = 1; this._dirty = true; }
      else this._finish(job);
      return;
    }
    this._busy = true;
    this._setPrompt('');
    this.stage.setControls(false);
    const ok = await ChoreGames.open(job, { practice: true });
    if (!this.stage) return;
    this._busy = false;
    this.stage.setControls(true);
    this._cooldown = 0.4;
    if (ok) this._finish(job);
  }

  /* ---------------- the frame ---------------- */

  update(dt) {
    if (!this.stage) return;
    this.stage.update(dt);
    this._t += dt;
    const l = this._land.toLocal(this.stage.rig.pos.x, this.stage.rig.pos.z);
    this._myLocal = { x: l.x, z: l.z, h: this.stage.rig.yaw + Math.PI };
    this._interact(dt);
    TasksScene.prototype._animateStations.call(this, dt);
    TasksScene.prototype._paintMap.call(this);
    this._lastPaint -= dt;
    if (this._lastPaint <= 0) { this._lastPaint = 0.2; this._paintHud(); }
    this._touchPressed = null;
    this._roomClock += dt;
    if (this._roomClock < 0.3) return;
    this._roomClock = 0;
    // which room are we standing in? Say its name on the way in.
    const room = CastleLayout.roomAt(l.x, l.z);
    const id = room ? room.id : null;
    if (id) this._myRoom = id;
    if (id && id !== this._room) {
      this._room = id;
      const said = Chores.roomName(id);
      const name = said === 'the castle' ? '' : said.charAt(0).toUpperCase() + said.slice(1);
      if (name) {
        Voice.show('', name);
        clearTimeout(this._clear);
        this._clear = setTimeout(() => Voice.clear(), 2400);
        if (this.music && this.music.section) {
          this.music.section(id === 'turret' || id === 'stair' ? 'slate'
            : id === 'round' ? 'debate' : 'gather', { at: 'bar', glide: 2 });
        }
      }
    }
  }

  dispose() {
    if (this._key) window.removeEventListener('keydown', this._key);
    clearTimeout(this._clear);
    ChoreGames.close(false);
    Voice.clear();
    if (this._dom) { this._dom.root.remove(); this._dom = null; }
    if (this.music) { this.music.stop(1); this.music = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
