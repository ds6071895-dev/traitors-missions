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
          // never more than the clock the host gave the table
          minSeconds: Math.min(seconds, opts.minSeconds || Math.min(60, 20 + 6 * Session.alive().length)),
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
    let guard = 0, said = 0, swingsTold = false;
    // the running count, as this screen has turned the slates (every screen turns the same ones)
    const tally = new Map();
    const counted = { n: 0, last: -9, key: '' };
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
      const last = f.nameQueue.length === 1;
      /* A revote, and this slate is not the name it was last time. The
         swing votes are turned last (see `beginNameReveal`), and each
         one is played as the moment it is: the old name shown while the
         room waits, a build, the breath, and the change of heart landing
         as the hardest hit of the night. */
      const was = Session.changedVote && Session.changedVote(f, voter.id) ? Session.playerById(f.prevNames[voter.id]) : null;
      const heat = was ? 1 : Math.min(1, (said + 1) / total);
      Scenes.Cine.card(null);
      if (was) {
        if (!swingsTold) {
          swingsTold = true;
          const n = f.nameQueue.filter(id => Session.changedVote(f, id)).length;
          Scenes.Drama.shot(this.stage, 'claudia', { cut: true, push: 0.1, speed: 0.5 });
          if (this.music && this.music.setTension) this.music.setTension(1, 0.8);
          await Scenes.run([{ line: { text: n > 1
            ? 'Not everybody has held their nerve. ' + n + ' of you have changed your vote.'
            : 'One of you has changed their vote.' }, hold: 0.5 }], this);
          if (!this._alive) return;
        }
        await this._swingSlate(voter, target, was, last);
        if (!this._alive) return;
        this._countIn(tally, voter.id, target.id);
        this._accuse(voter.id, target.id);
        if (typeof Notebook !== 'undefined') Notebook.vote(voter.id, target.id, f.nameRound);
        said++;
        await Scenes.barrier(roomKey + '-slate-' + f.nameRound + '-' + voter.id);
        if (!this._alive) return;
        const swung = voter.id;
        if (Session.isHost) Net.send({ type: 'speakName', playerId: voter.id });
        await this._waitFor(() => Session.state.finale.stage !== 'names'
          || Session.state.finale.nameQueue[0] !== swung, 6000);
        await this._sleep(0.3);
        continue;
      }
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
        // she asks the voter about the name on their slate — by name, even when it is yours
        await Scenes.run([{ line: { text: (voter.local ? 'You' : voter.name) + '. Why ' + target.name + '?' }, hold: 0.1 }], this);
        if (!this._alive) return;
        await this._turnFloor(voter.id, WHY_SECONDS);
        if (!this._alive) return;
      }
      this._countIn(tally, voter.id, target.id);
      await this._countMoment(tally, counted, said);
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
    Scenes.Drama.end(this.stage, null);
  }

  /* ---------------- the count ----------------
     With a big table, the vote is a race. After a slate, if the top two
     are level or a vote apart and the slates still to turn could
     overturn it, Claudia stops and reads the count out — under a build,
     the room's faces, and a hit as she finishes. Not every slate: three
     times a ballot at most, never two running unless the lead changed
     hands. Every screen counts the same slates, so every screen stops
     at the same one. */
  _slateWeight(voterId) {
    const s = Session.state, f = s.finale || {};
    const heavy = f.kind === 'table' && typeof Twists !== 'undefined' && Twists.has(s, 'heavy')
      && s.shield && s.shield.day === s.day ? s.shield.id : null;
    return voterId === heavy ? 2 : 1;
  }
  _countIn(tally, voterId, targetId) {
    tally.set(targetId, (tally.get(targetId) || 0) + this._slateWeight(voterId));
  }
  static countMoment(tally, left, said, alive, counted) {
    if (alive < 6 || said < 3 || left < 1 || counted.n >= 3) return null;
    const rows = [...tally.entries()].filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
    if (rows.length < 2) return null;
    const gap = rows[0][1] - rows[1][1];
    if (gap > 1 || gap > left) return null;
    const key = rows.filter(r => r[1] === rows[0][1]).map(r => r[0]).sort().join(',');
    if (said - counted.last < 2 && key === counted.key) return null;
    return { rows, gap, left, key };
  }
  async _countMoment(tally, counted, said) {
    const s = Session.state, f = s.finale;
    if (!f || f.sealed) return;
    // what is still to come: the slates behind this one, as they will count
    const rest = (f.nameQueue || []).slice(1);
    const left = rest.reduce((n, id) => n + this._slateWeight(id), 0);
    const m = CastleScene.countMoment(tally, left, said, Session.alive().length, counted);
    if (!m) return;
    counted.n++; counted.last = said; counted.key = m.key;
    const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const w = (n) => WORDS[n] || String(n);
    const nm = (id) => { const p = Session.playerById(id); return p ? (p.local ? 'you' : p.name) : 'somebody'; };
    const top = m.rows.filter(r => r[1] === m.rows[0][1]);
    const votes = (n) => w(n) + (n === 1 ? ' vote' : ' votes');
    let text;
    if (m.gap === 0) {
      text = top.map(r => votes(r[1]).replace(/^./, c => c.toUpperCase()) + ' for ' + nm(r[0]) + '.').join(' ')
        + (top.length > 2 ? ' Three of you, level.' : ' Level.')
        + ' And ' + w(m.left) + (m.left === 1 ? ' slate' : ' slates') + ' still to turn.';
    } else {
      const second = m.rows.filter(r => r[1] === m.rows[1][1]);
      text = 'That is ' + votes(m.rows[0][1]) + ' for ' + nm(m.rows[0][0]) + '. '
        + second.map(r => w(r[1]) + ' for ' + nm(r[0])).join(', ').replace(/^./, c => c.toUpperCase()) + '. '
        + (m.left === 1 ? 'One slate left. It could still go either way.' : 'With ' + w(m.left) + ' still to come, this could go anywhere.');
    }
    const board = m.rows.slice(0, 3).map(r => (Session.playerById(r[0]) || {}).local ? 'YOU ' + r[1]
      : String(nm(r[0])).toUpperCase() + ' ' + r[1]).join(' · ');
    if (this.music && this.music.setTension) this.music.setTension(1, 0.6);
    const build = this.music && this.music.build ? this.music.build({ shape: 'count' }) : null;
    Scenes.Cine.card({ kicker: 'The count', title: board, tone: 'slate', cls: 'count heat-3',
                       sub: m.left + (m.left === 1 ? ' slate' : ' slates') + ' to turn' });
    Scenes.Drama.shot(this.stage, 'claudia', { cut: true, push: 0.12, speed: 0.45 });
    await Scenes.run([{ line: { text }, hold: 0.2 }], this);
    if (!this._alive) { if (build) build.cancel(); return; }
    // the faces of whoever is in it, one breath each
    for (const r of top.slice(0, 2)) {
      const p = Session.playerById(r[0]);
      if (!p || p.local) continue;
      Scenes.Drama.shot(this.stage, 'on:' + p.id, { cut: true, push: 0.1, speed: 0.5 });
      await this._sleep(0.7);
      if (!this._alive) { if (build) build.cancel(); return; }
    }
    if (build) {
      const wait = build.release('slate-turn', { n: said + 2 });
      if (wait) await Scenes.wait(wait);
    }
    if (!this._alive) return;
    Scenes.Drama.hit(this.stage, null, null, { shake: 0.45, flash: 'rgba(210,12,24,0.45)', haptic: 70 });
    await this._sleep(0.4);
    Scenes.Cine.card(null);
  }

  /* A changed vote, turned. The camera finds the voter while the card
     still shows what they wrote last time; the band builds under the
     question; then the breath, and the slate. The one they abandoned
     breathes out, the one they turned on takes it in the face — and
     Claudia says it out loud. Ten seconds, not two: this is the vote
     the tie was waiting on. */
  async _swingSlate(voter, target, was, last) {
    const st = this.stage, music = this.music;
    const t0 = Date.now();
    const build = Scenes.Drama.build(st, music, 'slate', { shot: 'on:' + voter.id, speed: 0.5, cut: true });
    Scenes.Cine.card({ kicker: 'Last time, ' + (voter.local ? 'you' : voter.name) + ' wrote',
                       title: was.local ? 'YOU' : was.name.toUpperCase(), tone: 'slate', cls: 'heat-2',
                       sub: 'And now?' });
    Scenes.Drama.shot(st, 'on:' + voter.id, { cut: true, push: 0.22, speed: 0.35 });
    if (st && st.setMood) { st.setMood(was.id, 'nervous'); st.setMood(target.id, 'nervous'); }
    await Scenes.wait(1.3);
    if (!this._alive) { build.cancel(); return; }
    // the one they voted for last time, waiting to find out if they still are
    if (!was.local) Scenes.Drama.shot(st, 'on:' + was.id, { cut: true, push: 0.12, speed: 0.4 });
    await Scenes.wait(1.1);
    if (!this._alive) { build.cancel(); return; }
    Scenes.Cine.card(null);
    Scenes.Drama.shot(st, 'on:' + voter.id, { cut: true, push: 0.3, speed: 0.3 });
    await Scenes.Drama.peak(build, { since: t0, min: 3.2, max: 6 });
    if (!this._alive) { build.cancel(); return; }
    const wait = build.release('slate-turn', { n: 4 });
    if (wait) await Scenes.wait(wait);
    if (!this._alive) return;
    if (music && music.stinger) music.stinger('tie');
    Scenes.Drama.hit(st, null, null, { shake: 0.95, flash: 'rgba(230,20,32,.78)', haptic: 120 });
    Scenes.Cine.card({ kicker: (voter.local ? 'You' : voter.name) + ' changed their vote',
                       title: target.local ? 'YOU' : target.name.toUpperCase(), tone: 'bad',
                       cls: 'last heat-3', sub: 'Not ' + (was.local ? 'you' : was.name) + ' — not any more.' });
    if (st && st.setMood) { st.setMood(was.id, 'relief'); st.setMood(target.id, 'gasp'); }
    await this._sleep(1.1);
    if (!this._alive) return;
    if (!target.local) Scenes.Drama.shot(st, 'on:' + target.id, { cut: true, push: 0.14, speed: 0.4 });
    await Scenes.run([{
      line: { text: (voter.local ? 'You have' : voter.name + ' has') + ' changed ' + (voter.local ? 'your' : 'their')
                    + ' vote. Not ' + (was.local ? 'you' : was.name) + ' this time — '
                    + (target.local ? 'you' : target.name) + '.' },
      hold: 0.4,
    }], this);
    if (!this._alive) return;
    // and why the change of heart, from the person who had it
    if (!voter.bot && voter.alive) {
      Scenes.Drama.shot(st, 'on:' + voter.id, { cut: true, push: 0.08, speed: 0.4 });
      await Scenes.run([{ line: { text: (voter.local ? 'You' : voter.name) + '. What changed your mind?' }, hold: 0.1 }], this);
      if (!this._alive) return;
      await this._turnFloor(voter.id, WHY_SECONDS);
    }
    if (last) Scenes.Cine.card(null);
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
    if (real) {
      await this._wiseReveal(voter, target);
      Scenes.Drama.end(st, music);
      Scenes.Cine.card(null);
      return;
    }
    Scenes.Drama.hit(st, null, null, { shake: 0.3, haptic: 90 });
    Scenes.Cine.card({ kicker: voter.local ? 'Your slate' : voter.name + '’s slate',
                       title: target.local ? 'YOU' : target.name.toUpperCase(), tone: 'bad' });
    if (st && st.act) st.act(voter.id, 'nod');
    this._react(['gasp', 'handsFace', 'shake', 'handChest'], voter.id, 0.2);
    this._accuse(voter.id, target.id);
    await Scenes.run([{
      line: { text: (voter.local ? 'You vote' : voter.name + ' votes') + ' for '
                    + (target.local ? 'you' : target.name) + '.' },
      hold: 0.6,
    }], this);
    Scenes.Drama.end(st, music);
    Scenes.Cine.card(null);
  }

  /* The Wise One, unmasked. Played in four beats, each its own hit:

     the name    gold, the biggest shake of the night, and they stand up
                 out of their chair while the room turns to look
     the faces   a cut round the table: who saw that coming
     the void    what the table wrote, shown — and thrown out
     the word    a breath of silence, and the one name that counts

     Every screen has the same state by now (the slate was turned at a
     barrier), so this runs without waiting on anybody. */
  async _wiseReveal(voter, target) {
    const st = this.stage;
    const music = this.music;
    const f = Session.state.finale;
    const nm = (p) => (p.local ? 'YOU' : p.name.toUpperCase());
    const gone = () => !this._alive;

    // what the table wrote, without the Wise One's slate: the verdict being thrown out
    const counts = {};
    for (const id in (f.names || {})) {
      if (id === voter.id) continue;
      const t = f.names[id];
      counts[t] = (counts[t] || 0) + 1;
    }
    let top = null, n = 0, split = false;
    for (const id in counts) {
      if (counts[id] > n) { top = id; n = counts[id]; split = false; } else if (counts[id] === n) split = true;
    }
    const table = top && !split ? Session.playerById(top) : null;

    // 1. the name: gold, and they rise
    Scenes.Drama.shot(st, 'on:' + voter.id, { cut: true, push: 0.24, speed: 0.3 });
    Scenes.Drama.hit(st, null, null, { shake: 1.0, flash: 'rgba(240,196,90,.85)', haptic: 160 });
    Scenes.Cine.card({ kicker: 'The Wise One', title: nm(voter), tone: 'wise', cls: 'last heat-3',
                       sub: voter.local ? 'You were the Wise One all along.' : 'Hidden at this table all along.' });
    /* They stay in their chair: standing in place at the table, with
       hands held on the hips, read as a shuffle and a dance. One lean
       in and a nod says it. */
    if (st && st.act) setTimeout(() => { if (this._alive && this.stage) this.stage.act(voter.id, 'leanIn'); }, 500);
    if (st && st.act) setTimeout(() => { if (this._alive && this.stage) this.stage.act(voter.id, 'nod'); }, 1500);
    this._react(['gasp', 'handsFace', 'flinch', 'handChest', 'leanBack'], voter.id, 0.9);
    await this._sleep(1.8);
    if (gone()) return;

    // 2. the faces: the table, taking it
    const faces = Session.alive().filter(p => !p.local && p.id !== voter.id);
    const pickFaces = [target, table].filter(p => p && !p.local && p.id !== voter.id);
    for (const p of faces) if (pickFaces.length < 3 && pickFaces.indexOf(p) < 0) pickFaces.push(p);
    for (let i = 0; i < pickFaces.length; i++) {
      const p = pickFaces[i];
      Scenes.Drama.shot(st, 'on:' + p.id, { cut: true, push: 0.12, speed: 0.5 });
      if (st && st.act) st.act(p.id, ['gasp', 'handsFace', 'leanBack'][i % 3]);
      if (typeof Input !== 'undefined' && Input.haptic) Input.haptic(18);
      await this._sleep(0.8);
      if (gone()) return;
    }
    Scenes.Drama.shot(st, 'on:' + voter.id, { cut: true, push: 0.16, speed: 0.4 });
    await this._say(this._setFor('overruleName', voter), { name: voter.name }, null);
    if (gone()) return;

    // 3. the void: the table's own verdict, on the screen, and then not
    if (table && table.id !== target.id) {
      if (!table.local) Scenes.Drama.shot(st, 'on:' + table.id, { cut: true, push: 0.1, speed: 0.5 });
      Scenes.Cine.card({ kicker: 'The table wrote', title: nm(table), tone: 'slate', cls: 'heat-2',
                         sub: n + (n === 1 ? ' vote' : ' votes') });
      if (music && music.stinger) music.stinger('vote', { n: 3 });
      await this._sleep(1.5);
      if (gone()) return;
      Scenes.Drama.hit(st, null, null, { shake: 0.5, flash: 'rgba(240,196,90,.45)', haptic: 70 });
      Scenes.Cine.card({ kicker: 'Overruled', title: nm(table), tone: 'wise', sub: 'Every slate at this table: void.' });
      if (st && st.act) st.act(table.id, 'relief');
      if (st && st.setMood) st.setMood(table.id, 'calm');
      await this._say('overruleVoid', {}, null);
      if (gone()) return;
    } else {
      Scenes.Cine.card({ kicker: 'Overruled', title: 'THE ROUND TABLE', tone: 'wise', sub: 'Every slate at this table: void.' });
      await this._say('overruleVoid', {}, null);
      if (gone()) return;
    }

    // 4. the word: a breath of nothing, and the name
    Scenes.Cine.card(null);
    if (music && music.silence) music.silence(true);
    Scenes.Drama.shot(st, 'on:' + voter.id, { cut: true, push: 0.3, speed: 0.25 });
    await this._sleep(1.2);
    if (gone()) return;
    if (!target.local) Scenes.Drama.shot(st, 'on:' + target.id, { cut: true, push: 0.22, speed: 0.3 });
    this._accuse(voter.id, target.id);
    if (music && music.silence) music.silence(false);
    if (music && music.stinger) music.stinger('name', { n: 5 });
    Scenes.Drama.hit(st, null, null, { shake: 0.9, flash: 'rgba(220,10,24,.75)', haptic: 140 });
    Scenes.Cine.card({ kicker: voter.local ? 'You send home' : voter.name + ' sends home',
                       title: nm(target), tone: 'bad', cls: 'last heat-3', sub: 'On the Wise One’s word alone.' });
    if (st && st.act) st.act(target.id, 'handsFace');
    if (st && st.setMood) st.setMood(target.id, 'nervous');
    await this._say(this._setFor('overruleSends', target), { name: target.local ? 'You' : target.name }, null);
    if (gone()) return;
    await this._sleep(1.0);
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
