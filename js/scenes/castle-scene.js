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
// how long each person has to say why they wrote the name they wrote
const WHY_SECONDS = 10;

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
    this.stage = Stage.build(CastleScene.dressDay(this.stageOptions()));
    this.stage.update(0);
    this._wx = typeof Weather !== 'undefined' ? Weather.fx(this.stage, this.stage.land && this.stage.land.weather) : null;
    return this.stage.view;
  }

  /* Today's weather and how late in the game it is, onto a room's stage
     options (unless the room chose its own). */
  static dressDay(o) {
    const s = Session.state;
    if (!s) return o;
    if (o.weather === undefined && typeof Weather !== 'undefined') o.weather = Weather.forDay(s.seed, s.day);
    if (o.late === undefined && Session.stakes) o.late = Session.stakes();
    return o;
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

  /* The open argument: the first voice has the room, and anybody
     talking over it is turned down (see VoiceChat's courtesy). */
  _courtesy(on) {
    if (typeof VoiceChat !== 'undefined' && VoiceChat.setCourtesy) VoiceChat.setCourtesy(on);
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
    this._voteToggle(root, spec.toggle);
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
        const action = typeof opt.action === 'function' ? opt.action() : opt.action;
        Net.send(Object.assign({ playerId: you ? you.id : null }, action));
        if (spec.onPick) spec.onPick(opt);
      });
      root.appendChild(b);
    }
    this._paintTally();
    if (this.stage) this.stage.setControls(false);
    Screens.show('vote');
  }

  /* One switch above the names, for a panel that has a mode as well as
     a choice — the Wise One's overrule. It lives outside the grid so the
     grid's count of names still decides its shape. */
  _voteToggle(root, toggle) {
    const panel = root.parentElement;
    const old = document.getElementById('vote-extra');
    if (old && old.parentElement) old.parentElement.removeChild(old);
    if (panel && panel.classList) panel.classList.remove('overrule');
    if (!toggle || !panel || !panel.insertBefore) return;
    const b = document.createElement('button');
    b.id = 'vote-extra';
    b.className = 'btn vote-toggle';
    b.innerHTML = '<span class="vt-label">' + castleEsc(toggle.label) + '</span>'
                + '<span class="vt-sub">' + castleEsc(toggle.sub || '') + '</span>';
    b.addEventListener('mouseenter', () => AudioBus.play('ui-hover'));
    b.addEventListener('click', () => {
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      panel.classList.toggle('overrule', on);
      AudioBus.play(on ? 'card-in' : 'ui-click', { tone: 'traitor' });
      toggle.onChange(on, b);
    });
    panel.insertBefore(b, root);
  }

  _closeVote() {
    const extra = document.getElementById('vote-extra');
    if (extra && extra.parentElement) extra.parentElement.removeChild(extra);
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
    const total = Math.max(1, (Session.state.finale.nameQueue || []).length);
    // a Wise One's overruling slate is turned last, and only then is it said
    const armed = () => { const o = Session.state.finale.overrule; return !!(o && o.armed && !o.by); };
    /* No warning up front any more: the room is not told a Wise One has
       acted until their slate — the last — is turned (see `_overrule`). */
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
      if (armed() && f.nameQueue.length === 1) {
        await this._overrule(voter, target, roomKey + '-slate-' + f.nameRound + '-' + voter.id);
        break;
      }
      /* Each slate lands harder than the one before — a shorter breath,
         a bigger hit, a redder flash — and the last is the biggest. Never
         long: under two seconds of theatre a slate. */
      const heat = Math.min(1, (said + 1) / total), last = f.nameQueue.length === 1;
      Scenes.Cine.card(null);
      /* The room winds up a notch a slate. The last one gets a build of
         its own — short, dry, a clock tripping over itself — and the
         breath it ends on is the beat before the name. */
      if (this.music && this.music.setTension) this.music.setTension(0.3 + 0.65 * heat, 1.2);
      const build = last && this.music && this.music.build ? this.music.build({ shape: 'slate' }) : null;
      /* Cut to whoever wrote it and creep in on their face while the
         room waits. Cuts, not swings: the camera used to whip across
         the room three times a slate and then snap back to your eyes
         between them. Now the bars stay up from the first slate to the
         last and the edit is a cut to a face, a push in, a cut. */
      await Scenes.Drama.hush(this.stage, null, 'on:' + voter.id,
                              { hold: last ? 1.6 : 0.35 + 0.45 * heat, silent: false, cut: true, push: 0.14, speed: 0.55 });
      if (!this._alive) { if (build) build.cancel(); return; }
      if (this.music) {
        const wait = build ? build.release('slate-turn', { n: said }) : (this.music.stinger('slate-turn', { n: said }), 0);
        if (wait) await Scenes.wait(wait);
        if (!this._alive) return;
      }
      Scenes.Drama.hit(this.stage, null, null, {
        shake: 0.12 + 0.55 * heat + (last ? 0.2 : 0),
        flash: 'rgba(' + (150 + Math.round(70 * heat)) + ',12,24,' + (0.18 + 0.42 * heat).toFixed(2) + ')',
        haptic: 20 + Math.round(60 * heat),
      });
      Scenes.Cine.card({ kicker: voter.local ? 'Your slate' : voter.name + '’s slate',
                         title: target.local ? 'YOU' : target.name.toUpperCase(), tone: 'slate',
                         cls: (last ? 'last ' : '') + 'heat-' + Math.min(3, Math.round(heat * 3)),
                         sub: last ? 'The last slate.' : (said + 1) + ' of ' + total });
      this._accuse(voter.id, target.id);
      if (typeof Notebook !== 'undefined') Notebook.vote(voter.id, target.id, f.nameRound);
      said++;
      // the slate turns on the writer's face; then the name's face, as it lands on them
      await this._sleep(0.9);
      if (!this._alive) return;
      if (!target.local) Scenes.Drama.shot(this.stage, 'on:' + target.id, { cut: true, push: 0.08, speed: 0.5 });
      // nobody announces their own vote: Claudia reads each slate out
      await Scenes.run([{
        line: { text: (voter.local ? 'You vote' : voter.name + ' votes') + ' for '
                      + (target.local ? 'you' : target.name) + '.' },
        hold: 0.2,
      }], this);
      if (!this._alive) return;
      /* Then Claudia turns to them: why? Up to ten seconds, theirs alone,
         and they can finish early. The AIs are not asked. */
      if (!voter.bot && voter.alive) {
        Scenes.Drama.shot(this.stage, 'on:' + voter.id, { cut: true, push: 0.06, speed: 0.4 });
        await Scenes.run([{ line: { text: 'Why ' + (target.local ? 'me' : target.name) + ', ' + (voter.local ? 'you' : voter.name) + '?' }, hold: 0.1 }], this);
        if (!this._alive) return;
        await this._turnFloor(voter.id, WHY_SECONDS);
        if (!this._alive) return;
      }
      await Scenes.barrier(roomKey + '-slate-' + f.nameRound + '-' + voter.id);
      if (!this._alive) return;
      const before = voter.id;
      if (Session.isHost) Net.send({ type: 'speakName', playerId: voter.id });
      await this._waitFor(() => Session.state.finale.stage !== 'names'
        || Session.state.finale.nameQueue[0] !== before, 6000);
      await this._sleep(0.3);
    }
    Scenes.Cine.card(null);
    Scenes.Drama.end(this.stage, null);
  }

  /* The last slate, and the one that decides. The roll and the riser
     under Claudia, the camera on the voter, the slate turned by the
     authority — and then silence, and the biggest hit the band has, and
     the Wise One's name, and the name they wrote. */
  async _overrule(voter, target, key) {
    const st = this.stage;
    const music = this.music;
    Scenes.Cine.card(null);
    // the build climbs under Claudia for as long as she holds it
    const t0 = Date.now();
    const build = Scenes.Drama.build(st, music, 'banish', { shot: 'on:' + voter.id, speed: 1.4, bed: 'overruleRise' });
    await Scenes.wait(0.3);
    if (!this._alive) { build.cancel(); return; }
    await this._say('overruleTurn', {}, null);
    if (!this._alive) { build.cancel(); return; }
    await Scenes.barrier(key);
    if (!this._alive) { build.cancel(); return; }
    if (Session.isHost) Net.send({ type: 'speakName', playerId: voter.id });
    await this._waitFor(() => Session.state.finale.stage !== 'names'
      || Session.state.finale.nameQueue[0] !== voter.id, 6000);
    if (!this._alive) { build.cancel(); return; }
    const o = Session.state.finale.overrule;
    const real = !!(o && o.by === voter.id);

    // the camera goes in, the build tops out, the breath — and the blow
    Scenes.Drama.shot(st, 'on:' + voter.id, { speed: 2.4 });
    await Scenes.Drama.peak(build, { since: t0, min: 1.2, max: 6 });
    if (!this._alive) { build.cancel(); return; }
    const wait = build.release(real ? 'overrule' : 'slate-turn', real ? { then: 'overrule' } : { n: 4 });
    if (wait) await Scenes.wait(wait);
    if (!this._alive) return;
    Scenes.Drama.hit(st, null, null,
                     { shake: real ? 0.8 : 0.3, flash: real ? 'rgba(230,186,80,.7)' : null, haptic: 90 });
    Scenes.Cine.card(real
      ? { kicker: 'The Wise One', title: voter.local ? 'YOU' : voter.name.toUpperCase(), tone: 'wise',
          sub: (voter.local ? 'You overrule' : 'Overrules') + ' the round table.' }
      : { kicker: voter.local ? 'Your slate' : voter.name + '’s slate',
          title: target.local ? 'YOU' : target.name.toUpperCase(), tone: 'bad' });
    if (st && st.act) st.act(voter.id, 'nod');
    this._react(['gasp', 'handsFace', 'shake', 'handChest'], voter.id, real ? 0.6 : 0.2);
    if (real) {
      await this._sleep(1.0);
      if (!this._alive) return;
      await this._say(this._setFor('overruleName', voter), { name: voter.name }, null);
      if (!this._alive) return;
      Scenes.Drama.shot(st, 'on:' + target.id);
      this._accuse(voter.id, target.id);
      if (music) music.stinger('name', { n: 4 });
      Scenes.Cine.card({ kicker: (voter.local ? 'You name' : voter.name + ' names'),
                         title: target.local ? 'YOU' : target.name.toUpperCase(), tone: 'bad',
                         sub: 'The table’s vote does not count.' });
    } else this._accuse(voter.id, target.id);
    await Scenes.run([{
      line: { text: (voter.local ? 'You vote' : voter.name + ' votes') + ' for '
                    + (target.local ? 'you' : target.name) + '.' },
      hold: 0.6,
    }], this);
    Scenes.Drama.end(st, music);
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
      if (Math.random() < 0.35) st.act(targetId, Math.random() < 0.5 ? 'shake' : 'handChest');
    }
    clearTimeout(this._pointT);
    this._pointT = setTimeout(() => { if (st.pointAt) st.pointAt(voterId, null); }, 2400);
  }

  /* The room takes a reveal: a few of them at a time, not in unison. */
  _react(pool, exceptId, chance = 0.5) {
    const st = this.stage;
    if (!st || !st.figures) return;
    st.figures.forEach((f) => {
      if (!f || f.userData.hidden || f.userData.playerId === exceptId || Math.random() > chance) return;
      const name = pool[Math.floor(Math.random() * pool.length)];
      setTimeout(() => { if (this._alive) Figure.act(f, name, { hold: false }); }, 300 + Math.random() * 2000);
    });
  }

  /* The role, said by the room. The flare, the card, the score — and
     then Claudia's sentence about it. */
  _flare(role, playerId, after) {
    const out = Reveal.flare({ role, stage: this.stage, music: this.music, after, playerId });
    this._embers = out.embers;
    if (out.settle) this._settle = out.settle;
  }

  // the same, after the breath that ends a build
  async _strike(role, playerId, after, build) {
    const out = await Reveal.strike({ role, stage: this.stage, music: this.music, after, playerId, build,
                                      alive: () => this._alive && !!this.stage });
    if (!this._alive) return;
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
    if (this._dim) this._dim.step(dt);
    if (this._wx) this._wx.step(dt);
    if (this._embers) this._embers = Reveal.updateEmbers(this.stage, this._embers, dt);
  }

  /* The room's last shot before the interlude: the lights going down
     on whatever `_outroShot` frames, and a sound to cut on. A subclass
     names the shot and the sound; the dimming is the same everywhere. */
  outro() {
    if (!this.stage || !this._alive) return Promise.resolve();
    const shot = this._outroShot ? this._outroShot() : null;
    if (shot && this.stage.setCinematic) this.stage.setCinematic(true, shot, { speed: 0.7 });
    if (this._outroSound && typeof AudioBus !== 'undefined') AudioBus.play(this._outroSound);
    this._dim = SceneOutro.dim(this.stage, 1.1, this._outroDimTo === undefined ? 0.2 : this._outroDimTo);
    return this._dim.done;
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
    if (this._wx) { this._wx.stop(); this._wx = null; }
    if (this._embers) { this._embers = Reveal.clearEmbers(this.stage, this._embers); }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}

/* Lights down, for the last shot of a room. Every light in the scene
   eases to `to` of its own brightness over `secs`, stepped from the
   scene's own update so it keeps time with the frames. `done` resolves
   at the bottom. Nothing is restored: the room is about to be torn down. */
const SceneOutro = {
  /* `stage` is a Stage: inside the castle its land re-lights itself every
     frame, so it is asked for a level; outside, the lights are eased
     directly. */
  dim(stage, secs, to) {
    const land = stage && stage.land;
    const lights = [];
    if (!(land && land.setLevel) && stage && stage.scene) {
      stage.scene.traverse(o => { if (o.isLight && o.intensity > 0) lights.push([o, o.intensity]); });
    }
    let t = 0, finish;
    const done = new Promise(r => { finish = r; });
    return {
      done,
      step(dt) {
        if (t >= secs) return;
        t = Math.min(secs, t + dt);
        const u = t / secs;
        const k = 1 - (1 - to) * u * u * (3 - 2 * u);
        if (land && land.setLevel) land.setLevel(k);
        for (const [l, i0] of lights) l.intensity = i0 * k;
        if (t >= secs) finish();
      },
    };
  },
};
if (typeof AudioBus !== 'undefined') {
  // a candle pinched out: a short breath of air
  AudioBus.define('snuff', (ctx, dest) => {
    const t = ctx.currentTime;
    const len = 0.35;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.32;
    src.connect(bp); bp.connect(g); g.connect(dest); src.start(t);
  });
}

/* Names go into innerHTML in exactly one place, and this is it. */
function castleEsc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
