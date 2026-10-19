/* ------------------------------------------------------------------
   castle-scene.js — what every room in the castle has in common.

   The round table, the night and breakfast are three scenes with one
   set of manners: Claudia speaks from the line book, the host's
   interjections (`cue`) land on every screen at once, decisions are a
   panel of buttons, and nothing waits on a timer that hopes the session
   has caught up — every wait is on the session itself.

   Subclasses supply `stageOptions()` and `drive()`; this supplies the
   rest. It is deliberately a small class rather than a framework: the
   fire predates it and keeps its own copy of the same few habits.
------------------------------------------------------------------ */
class CastleScene {

  constructor(opts = {}) {
    this.opts = opts;
    this.stage = null;
    this.music = null;
    this._alive = true;
    this._waits = new Set();
    this._offNet = null;
    this._embers = null;
    this._settle = null;
  }

  build() {
    this.stage = Stage.build(this.stageOptions());
    this.stage.update(0);
    return this.stage.view;
  }

  stageOptions() { return { seed: Session.state.seed, hour: 'night', dress: 'none', players: [] }; }

  setShot(name, opts) { if (this.stage) this.stage.setShot(name, opts); }
  setSpeaking(who) { if (this.stage) this.stage.setSpeaking(who); }

  start() {
    Scenes.Cine.on(true);
    Scenes.Cine.bars(false);
    this._offNet = Net.on((e) => this.onEvent(e));
    this.drive().catch((err) => console.warn('castle scene:', err));
  }

  /* Claudia, interjecting on the host's say-so. Every client puts up
     the same words; the AI Claudia sends text, the moderator sends a
     line set. */
  onEvent(e) {
    if (e.type === 'cue' && !this._quietCues) this._cue(e);
  }

  _cue(e) {
    if (e.text) {
      if (e.voice) return;                       // live speech: the director captions it
      Voice.say(e.text, { speaker: 'Claudia' });
      return;
    }
    if (!e.set || !ClaudiaLines.has(e.set)) return;
    const vars = Object.assign({}, e.vars || {});
    if (vars.id) {
      const p = Session.playerById(vars.id);
      if (p) vars.name = p.local ? 'You' : p.name;
    }
    const lines = ClaudiaLines.beats(e.set, vars, Session.state.seed + this._salt());
    Voice.say(lines.map(b => b.text).join(' '), { speaker: 'Claudia' });
  }

  _salt() { const s = Session.state; return ((s && s.day) || 0) * 977; }

  /* ---------------- Claudia ---------------- */

  _say(set, vars, shot, salt) {
    if (!this._alive) return Promise.resolve(false);
    const seed = Session.state.seed + this._salt() + (salt | 0) * 101;
    const all = Object.assign({ count: Session.alive().length }, vars);
    const lines = ClaudiaLines.beats(set, all, seed);
    const pub = ClaudiaLines.isPublic(set);
    if (pub && typeof AIDirector !== 'undefined') AIDirector.claudiaLine(set, all, seed);
    return Scenes.run(lines.map((b, i) => ({
      shot: i === 0 ? shot : null,
      line: { text: b.text, who: 'claudia', public: pub },
      hold: i === lines.length - 1 ? 0.6 : 0.3,
    })), this);
  }

  _setFor(base, target) {
    if (target && target.local && ClaudiaLines.has(base + 'You')) return base + 'You';
    return base;
  }

  /* ---------------- waiting on the session ---------------- */

  _waitFor(pred, ms) {
    if (!this._alive) return Promise.resolve(false);
    if (pred()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let off = null, timer = null;
      const cancel = (ok) => {
        if (off) { off(); off = null; }
        if (timer) { clearTimeout(timer); timer = null; }
        this._waits.delete(cancel);
        resolve(ok);
      };
      off = Net.on(() => { if (pred()) cancel(true); });
      this._waits.add(cancel);
      if (ms) timer = setTimeout(() => cancel(pred()), ms);
    });
  }

  _sleep(s) { return this._alive ? Scenes.wait(s) : Promise.resolve(false); }

  /* ---------------- the open discussion ----------------
     Everybody's microphone live at once, the board up, and the host's
     moderator listening for the moment the room has said its piece. */
  async _discussion(seconds, opts = {}) {
    const s = Session.state;
    const finish = await new Promise((resolve) => {
      let done = false;
      const end = (ok) => {
        if (done) return;
        done = true;
        off();
        clearTimeout(guard);
        if (Session.isHost) Moderator.stop();
        RoomUI.hideFloor();
        if (this.stage) this.stage.setSpeaking(null);
        resolve(ok);
      };
      const off = Net.on((e) => {
        const f = e.type === 'floor' ? e : Session.state && Session.state.floor;
        if (!f) return;
        if (f.done) { end(true); return; }
        if (e.type === 'floor') RoomUI.showFloor(e);
      });
      this._waits.add(() => end(false));
      const floor = Session.state.floor;
      if (floor && floor.done) { end(true); return; }
      if (floor && floor.all) RoomUI.showFloor(floor);
      else if (Session.isHost) Net.send({ type: 'openFloor', all: true, seconds });
      if (Session.isHost) {
        Moderator.start({
          ids: () => Session.alive().map(p => p.id),
          ready: () => (Session.state.floor && Session.state.floor.ready) || [],
          mute: () => Session.alive().filter(p => !p.bot && !this._hasVoice(p.id)).map(p => p.id),
          minSeconds: opts.minSeconds || Math.min(60, 20 + 6 * Session.alive().length),
          maxSeconds: seconds,
          judge: opts.judge,
          judgeOnly: opts.judgeOnly !== undefined ? opts.judgeOnly : !!opts.judge,
          extraLevels: opts.extraLevels,
          /* A live Claudia draws the quiet one out in her own words; the
             show's line is for when she is not there to. */
          onInvite: (id) => {
            if (typeof AIDirector !== 'undefined' && AIDirector.claudiaLive) return;
            Net.send({ type: 'cue', set: 'inviteQuiet', vars: { id } });
          },
          onClose: () => Net.send({ type: 'yieldFloor', close: true }),
        });
        if (opts.onModerator) opts.onModerator();
      }
      const guard = setTimeout(() => end(true), (seconds + 15) * 1000);
      void s;
    });
    return finish;
  }

  /* Whether we have ever heard anything from this person's microphone.
     Somebody with no microphone cannot "have their say" by talking, so
     the moderator does not wait for them to. */
  _hasVoice(id) {
    if (typeof Party !== 'undefined' && Party.selfId && id === Party.selfId()) {
      return typeof VoiceChat !== 'undefined' && VoiceChat.available;
    }
    return typeof VoiceChat !== 'undefined' && VoiceChat.levels.has(id);
  }

  /* A turn floor: one name, a few seconds, nobody else live. Used for
     last words, and round the circle at the fire. */
  _turnFloor(only, seconds) {
    return new Promise((resolve) => {
      let done = false;
      const end = (ok) => {
        if (done) return;
        done = true;
        off();
        clearTimeout(guard);
        RoomUI.hideFloor();
        if (this.stage) this.stage.setSpeaking(null);
        resolve(ok);
      };
      const off = Net.on((e) => {
        const f = e.type === 'floor' ? e : Session.state && Session.state.floor;
        if (!f) return;
        if (f.done || (!f.playerId && !f.all)) { end(true); return; }
        if (e.type === 'floor') {
          RoomUI.showFloor(e);
          if (this.stage) this.stage.setSpeaking(e.playerId);
        }
      });
      this._waits.add(() => end(false));
      const f = Session.state.floor;
      if (f && f.playerId) { RoomUI.showFloor(f); if (this.stage) this.stage.setSpeaking(f.playerId); }
      else if (Session.isHost) Net.send({ type: 'openFloor', only, seconds });
      const n = Array.isArray(only) ? only.length : 1;
      const guard = setTimeout(() => end(true), (seconds * n + 10) * 1000);
    });
  }

  /* ---------------- the vote panel ---------------- */

  _openVote(spec) {
    const root = document.getElementById('vote-options');
    if (!root) return;
    document.getElementById('vote-kicker').textContent = spec.kicker || '';
    document.getElementById('vote-title').textContent = spec.title || '';
    document.getElementById('vote-note').textContent = spec.note || '';
    root.innerHTML = '';
    // how many there are decides the grid, so a full table of names fits
    // a phone without scrolling
    if (root.dataset) root.dataset.n = String(spec.options.length);
    if (root.parentElement) root.parentElement.classList.toggle('many', spec.options.length > 4);
    const you = Session.state.players.find(p => p.local);
    for (const opt of spec.options) {
      const b = document.createElement('button');
      b.className = 'btn vote-btn v-' + (opt.tone || 'name');
      b.innerHTML = '<span class="vb-label">' + castleEsc(opt.label) + '</span>'
                  + '<span class="vb-sub">' + castleEsc(opt.sub || '') + '</span>';
      b.addEventListener('mouseenter', () => AudioBus.play('ui-hover'));
      b.addEventListener('click', () => {
        if (b.disabled) return;
        if (!spec.keepOpen) [...root.children].forEach(c => { c.disabled = true; });
        [...root.children].forEach(c => c.classList.remove('chosen'));
        b.classList.add('chosen');
        AudioBus.play('ui-click');
        Net.send(Object.assign({ playerId: you ? you.id : null }, opt.action));
        if (spec.onPick) spec.onPick(opt);
      });
      root.appendChild(b);
    }
    this._paintTally();
    if (this.stage) this.stage.setControls(false);
    Screens.show('vote');
  }

  _closeVote() {
    if (Screens.current === 'vote') Screens.hideAll();
    if (this.stage) this.stage.setControls(true);
  }

  // who has answered, without ever saying what they answered
  _paintTally() {
    const wrap = document.getElementById('vote-tally');
    if (!wrap) return;
    const s = Session.state;
    if (!s || !s.finale) { wrap.innerHTML = ''; return; }
    const f = s.finale;
    const cast = f.stage === 'decide' ? f.votes : f.names;
    wrap.innerHTML = Session.alive().map(p => {
      const inYet = !!(cast && cast[p.id]);
      return '<span class="vt ' + (inYet ? 'in' : '') + '">' + castleEsc(p.local ? 'You' : p.name)
           + '<i>' + (inYet ? 'decided' : 'thinking…') + '</i></span>';
    }).join('');
  }

  /* ---------------- the slates ----------------
     A finished ballot, performed. Each voter in seat order turns their
     slate and the name is said out loud; the hits climb as they go. */
  async _slates(roomKey) {
    let guard = 0, said = 0;
    while (this._alive && guard++ < 10) {
      const s = Session.state;
      const f = s.finale;
      if (f.stage !== 'names' || !f.nameQueue.length) break;
      const voter = Session.playerById(f.nameQueue[0]);
      const target = voter && Session.playerById(f.names[voter.id]);
      if (!voter || !target) {
        if (Session.isHost) Net.send({ type: 'speakName', playerId: f.nameQueue[0] });
        await this._waitFor(() => Session.state.finale.nameQueue[0] !== (voter && voter.id), 4000);
        continue;
      }
      Scenes.Cine.card({ kicker: voter.local ? 'Your slate' : voter.name + '’s slate',
                         title: target.local ? 'YOU' : target.name.toUpperCase(), tone: 'bad' });
      this._accuse(voter.id, target.id);
      if (this.music) this.music.stinger('slate-turn', { n: said++ });
      // nobody announces their own vote: Claudia reads each slate out
      await Scenes.run([{
        line: { text: (voter.local ? 'You vote' : voter.name + ' votes') + ' for '
                      + (target.local ? 'you' : target.name) + '.' },
        hold: 0.2,
      }], this);
      if (!this._alive) return;
      await Scenes.barrier(roomKey + '-slate-' + f.nameRound + '-' + voter.id);
      if (!this._alive) return;
      const before = voter.id;
      if (Session.isHost) Net.send({ type: 'speakName', playerId: voter.id });
      await this._waitFor(() => Session.state.finale.stage !== 'names'
        || Session.state.finale.nameQueue[0] !== before, 6000);
      await this._sleep(0.3);
    }
    Scenes.Cine.card(null);
  }

  /* A slate turned: the voter points across the table at the name on
     it, and whoever it names takes it — a shake of the head, a hand to
     the chest — and stays uneasy for the rest of the table. */
  _accuse(voterId, targetId) {
    const st = this.stage;
    if (!st || !st.pointAt) return;
    const tf = st.figureOf(targetId);
    const who = Session.playerById(targetId);
    const at = tf ? tf.position.clone().setY(tf.position.y + 1.2 * (tf.scale.y || 1))
             : who && who.local ? st.camera.position.clone() : null;
    if (!at) return;
    st.pointAt(voterId, at);
    if (tf) {
      st.setMood(targetId, 'nervous');
      if (Math.random() < 0.7) st.act(targetId, Math.random() < 0.5 ? 'shake' : 'handChest');
    }
    clearTimeout(this._pointT);
    this._pointT = setTimeout(() => { if (st.pointAt) st.pointAt(voterId, null); }, 2400);
  }

  /* The room takes a reveal: a few of them at a time, not in unison. */
  _react(pool, exceptId, chance = 0.75) {
    const st = this.stage;
    if (!st || !st.figures) return;
    st.figures.forEach((f) => {
      if (!f || f.userData.hidden || f.userData.playerId === exceptId || Math.random() > chance) return;
      const name = pool[Math.floor(Math.random() * pool.length)];
      setTimeout(() => { if (this._alive) Figure.act(f, name, { hold: false }); }, 150 + Math.random() * 1100);
    });
  }

  /* The role, said by the room. The flare, the card, the score — and
     then Claudia's sentence about it. */
  _flare(role, playerId, after) {
    const out = Reveal.flare({ role, stage: this.stage, music: this.music, after, playerId });
    this._embers = out.embers;
    if (out.settle) this._settle = out.settle;
  }

  _burn(playerId) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (role) => { if (done) return; done = true; off(); resolve(role); };
      const off = Net.on((e) => {
        if (e.type === 'reveal' && e.playerId === playerId) finish(e.role);
        const b = (Session.state.banished || []).find(x => x.id === playerId);
        if (b) finish(b.role);
      });
      this._waits.add(() => finish(null));
      const b = (Session.state.banished || []).find(x => x.id === playerId);
      if (b) { finish(b.role); return; }
      if (Session.isHost) Net.send({ type: 'reveal' });
    });
  }

  /* ---------------- the frame ---------------- */

  update(dt) {
    if (!this.stage) return;
    this.stage.update(dt);
    if (this._embers) this._embers = Reveal.updateEmbers(this.stage, this._embers, dt);
  }

  dispose() {
    this._alive = false;
    this._waits.forEach(cancel => { try { cancel(false); } catch (e) {} });
    this._waits.clear();
    if (this._offNet) { this._offNet(); this._offNet = null; }
    if (Session.isHost && typeof Moderator !== 'undefined') Moderator.stop();
    this._closeVote();
    RoomUI.hideAll();
    Scenes.Cine.card(null);
    Scenes.Drama.end(this.stage, null);
    if (this.music) { this.music.stop(1.4); this.music = null; }
    if (this._embers) { this._embers = Reveal.clearEmbers(this.stage, this._embers); }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}

/* Names go into innerHTML in exactly one place, and this is it. */
function castleEsc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
