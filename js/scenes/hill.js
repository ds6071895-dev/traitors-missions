/* ------------------------------------------------------------------
   hill.js — the welcome.

   The first thing anybody sees of the show, so it does three jobs and
   then gets out of the way: it establishes the place, it tells you what
   you are, and it sends you up to the house.

   One more thing before it does: the Traitors choose a Wise One.
   Everybody sees the same ceremony for the same length of time — the
   band turning, ten seconds on the clock, the rise — and one of three
   cards at the end of it: the Wise One's, the Traitors', and everybody
   else's, which says only that it has been done.

   Players arrive beside Claudia with control of their view, and the
   welcome starts immediately. Boarding opens after the shared send-off.
------------------------------------------------------------------ */
class HillScene {

  constructor(opts = {}) {
    this.opts = opts;
    this.music = null;
    this.stage = null;
  }

  build() {
    const s = Session.state;
    this.stage = Stage.build({
      seed: s.seed,
      hour: 'golden',
      dress: 'none',
      players: s.players,
    });
    this.stage.update(0);
    return this.stage.view;
  }

  setShot(name, opts) { this.stage.setShot(name, opts); }
  setSpeaking(who) { this.stage.setSpeaking(who); }

  /* A guest is *told* what it is, by the one client entitled to say.
     That message arrives a round trip after the scene opens, so the
     hill waits for it rather than reading `myRole()` on the frame it
     was built — which on a guest would reliably return null and hand
     every Traitor in the game a Faithful card. */
  _role() {
    if (Session.myRole()) return Promise.resolve(Session.myRole());
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (done) return; done = true; off(); resolve(r); };
      const off = Net.on(() => { if (Session.myRole()) finish(Session.myRole()); });
      this._offRole = () => finish('faithful');
      // a host that never says is a host that has gone; play it straight
      setTimeout(() => finish(Session.myRole() || 'faithful'), 6000);
    });
  }

  start() {
    this._role().then((role) => { if (this.stage) this._run(role); });
  }

  _run(role) {
    const s = Session.state;
    const seed = s.seed;
    const L = (set, vars) => ClaudiaLines.beats(set, vars, seed);

    Scenes.Cine.on(true);
    Scenes.Cine.bars(false);
    this.music = Music.ceremony();
    this.wind = AudioBus.wind();
    if (this.wind) this.wind.set(0.34);

    // one beat per sentence, so a shot can change on a full stop
    const speak = (set, vars, shots) => {
      const lines = L(set, vars);
      const pub = ClaudiaLines.isPublic(set);
      return lines.map((b, i) => ({
        shot: shots && shots[i],
        // a public line is voiced once, to the room, by an AI Claudia if there is one
        then: i === 0 && pub && typeof AIDirector !== 'undefined'
          ? () => AIDirector.claudiaLine(set, vars, seed) : undefined,
        line: { text: b.text, who: 'claudia', public: pub },
        hold: i === lines.length - 1 ? 0.7 : 0.35,
      }));
    };

    const count = s.players.length;
    const two = (s.dealt || 1) > 1;
    // a night with a Traitor and a round table in it has a Wise One
    const wiseOn = (s.dealt || 0) > 0 && (!s.parts || s.parts.indexOf('table') >= 0);
    const partners = role === 'traitor'
      ? ((Session.myPrivate() || {}).partners || []).map(id => Session.playerById(id)).filter(Boolean)
      : [];

    Scenes.run([
      ...speak('welcome', { count }, ['grass', 'rise', 'loch']),
      ...(count >= Session.MIN_PLAYERS ? speak('theRules', {}, ['claudia', null, null]) : []),
      ...speak(two ? 'roleIntroTwo' : 'roleIntro', { count }, ['claudiaTight', null, null]),

      // the one card that only you ever see
      { shot: 'claudiaTight',
        card: () => ({
          kicker: 'And you are',
          title: role === 'traitor' ? 'A TRAITOR' : 'A FAITHFUL',
          sub: role === 'traitor'
            ? 'Nobody else is told. Poison them in plain sight, lie at the table, and be sitting there at the end.'
            : 'Nobody else is told. Find the Traitor' + (two ? 's' : '') + ' before they find you.',
          tone: role === 'traitor' ? 'traitor' : 'faithful',
        }),
        // and a sting that only you hear: a braam, or bells
        then: () => { if (this.music) this.music.stinger('role-' + (role === 'traitor' ? 'traitor' : 'faithful'), { at: 'beat' }); },
        wait: 1.5 },
      ...speak(role === 'traitor' ? 'roleTraitor' : 'roleFaithful'),
      { card: null, wait: 0.5 },
      // the other Traitor, if there is one: only the Traitors see this
      ...(partners.length ? [
        { shot: 'claudiaTight',
          card: () => ({ kicker: 'Your fellow Traitor', tone: 'traitor',
                         title: partners.map(p => p.name.toUpperCase()).join(' & '),
                         sub: 'You will meet in the turret tonight.' }),
          wait: 1.2 },
        ...speak('traitorPartner', { name: partners.map(p => p.name).join(' and ') }),
        { card: null, wait: 0.4 },
      ] : []),

      { then: () => Scenes.barrier('hill-private-complete') },

      ...(wiseOn ? [{ then: () => this._wise(role, speak) }] : []),

      ...speak('toCastle', {}, ['wide', 'claudia', null]),
      { then: () => { if (Session.isHost) Net.send({ type: 'advance' }); } },
    ].filter(Boolean), this);
  }

  /* ---------------- the Wise One ----------------
     Music first, then Claudia, then ten seconds that are the same ten
     seconds on every screen: the Traitors get the names, everybody else
     gets the clock. Then the rise, the hit, and the card. */
  async _wise(role, speak) {
    const music = this.music;
    const alive = () => !!this.stage;
    const say = (set, vars) => Scenes.run(speak(set, vars), this);

    // the band turns before she says a word
    if (music) {
      music.stinger('wise-call');
      music.section('wiseCall', { at: 'beat', glide: 0.4 });
    }
    this.setShot('claudiaTight');
    await Scenes.wait(1.8);
    if (!alive()) return;
    await say('wiseIntro');
    if (!alive()) return;
    await say('wiseRules');
    if (!alive()) return;
    await say('wiseChoose');
    if (!alive()) return;

    if (Session.isHost) Net.send({ type: 'wiseOpen' });
    if (music) music.section('wiseClock', { at: 'beat', glide: 0.3 });
    await this._until(() => !!Session.state.wise, 4000);
    if (!alive() || !Session.state.wise) {
      if (music) music.section('title', { at: 'bar', glide: 2 });
      return;
    }

    // the ten seconds
    this._wiseOpenedAt = Date.now();
    this._wiseSecs = Session.state.wise.seconds || Session.WISE_SECONDS;
    if (role === 'traitor') {
      this._choosing = true;
      this._paintWise();
    } else {
      Scenes.Cine.card({ kicker: 'The Traitors are choosing', title: String(this._wiseSecs),
                         sub: 'Eyes front. Give nothing away.', tone: 'bad' });
      this._counting = true;
    }
    await this._until(() => !Session.state.wise || Session.state.wise.done, (this._wiseSecs + 6) * 1000);
    this._choosing = false;
    this._counting = false;
    if (role === 'traitor') this._closeVote();
    if (!alive()) return;

    // the rise: nothing resolves until the name lands
    Scenes.Cine.card(null);
    if (music) {
      music.section('wiseRise', { at: 'beat', glide: 0.2 });
      music.stinger('wise-rise');
      music.riser(3.0);
    }
    await Scenes.Drama.hush(this.stage, null, null, { hold: 3.0, silent: false, camera: false });
    if (!alive()) return;

    /* The private view that follows the closing snapshot has landed by
       now, so this is the moment to read it. */
    const v = Session.myPrivate() || {};
    const chosen = v.wise && v.wise.id ? Session.playerById(v.wise.id) : null;
    Scenes.Drama.hit(this.stage, music, 'wise-reveal', { shake: 0.45, flash: 'rgba(230,186,80,.55)', haptic: 50 });
    if (music) music.section('wiseReveal', { at: 'beat', glide: 0.2 });
    if (v.wiseOne) {
      Scenes.Cine.card({ kicker: 'A Traitor has chosen you', title: 'YOU ARE THE WISE ONE', tone: 'wise',
                         sub: 'Once, at a round table, you may overrule the vote: whoever you name is banished. Only the Traitors know.' });
    } else if (role === 'traitor' && chosen) {
      Scenes.Cine.card({ kicker: 'Your Wise One', title: chosen.name.toUpperCase(), tone: 'traitor',
                         sub: 'Nobody else knows. Once, their vote can overrule the whole table.' });
    } else {
      Scenes.Cine.card({ kicker: 'The Wise One', title: 'HAS BEEN CHOSEN', tone: 'wise',
                         sub: 'Only the Traitors know who. Their vote can overrule yours.' });
    }
    await Scenes.wait(1.4);
    if (!alive()) return;
    await say('wiseChosen');
    if (!alive()) return;
    if (v.wiseOne) await say('wiseYou');
    else if (role === 'traitor' && chosen) await say('wiseTraitor', { name: chosen.name });
    if (!alive()) return;
    Scenes.Drama.end(this.stage, null);
    Scenes.Cine.card(null);
    if (music) music.section('title', { at: 'bar', glide: 2.5 });
    await Scenes.barrier('hill-wise-complete');
  }

  /* The Traitors' panel: every Faithful, with the current pick marked —
     a partner's as well as your own. It stays open, because a pick can
     change until the clock runs out. */
  _wiseOptions() {
    const v = Session.myPrivate() || {};
    const partners = new Set(v.partners || []);
    return Session.alive().filter(p => !p.local && !partners.has(p.id));
  }

  _paintWise() {
    if (!this._choosing) return;
    const v = Session.myPrivate() || {};
    const pick = v.wise ? v.wise.pick : null;
    const by = pick && v.wise.by ? Session.playerById(v.wise.by) : null;
    const two = (v.partners || []).length > 0;
    const options = this._wiseOptions();
    this._openVote({
      kicker: 'Choose the Wise One',
      title: 'Whose vote will overrule the table?',
      note: (two ? 'Either of you can choose; the last pick stands. ' : '') + this._wiseLeft() + 's left.',
      keepOpen: true,
      options: options.map(p => ({
        label: p.name.toUpperCase(),
        sub: pick === p.id ? (by && !by.local ? by.name + ' chose them' : 'Your choice') : 'Make them wise',
        tone: 'wise', action: { type: 'wisePick', targetId: p.id },
      })),
    });
    const i = options.findIndex(p => p.id === pick);
    const root = document.getElementById('vote-options');
    if (i >= 0 && root && root.children && root.children[i]) root.children[i].classList.add('chosen');
  }

  _wiseLeft() {
    return Math.max(0, Math.ceil(this._wiseSecs - (Date.now() - (this._wiseOpenedAt || Date.now())) / 1000));
  }

  /* The panel is the castle's, borrowed. (castle-scene.js loads after
     this file, so the borrowing is done when it is used.) */
  _openVote(spec) { CastleScene.prototype._openVote.call(this, spec); }
  _voteToggle(root, toggle) { CastleScene.prototype._voteToggle.call(this, root, toggle); }
  _closeVote() { CastleScene.prototype._closeVote.call(this); }
  _paintTally() {
    const wrap = document.getElementById('vote-tally');
    if (wrap) wrap.innerHTML = '';
  }

  // wait on the session, repainting the panel as the private view moves
  _until(pred, ms) {
    if (pred()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        off();
        clearTimeout(timer);
        if (this._untilOff === finish) this._untilOff = null;
        resolve(pred());
      };
      const off = Net.on((e) => {
        if (e.type === 'private' && this._choosing) this._paintWise();
        if (pred()) finish();
      });
      const timer = setTimeout(finish, ms);
      this._untilOff = finish;
    });
  }

  update(dt) {
    if (!this.stage) return;
    this.stage.update(dt);
    // the clock, on the card or in the panel's note
    if (!this._choosing && !this._counting) return;
    this._tick = (this._tick || 0) - dt;
    if (this._tick > 0) return;
    this._tick = 0.25;
    const left = this._wiseLeft();
    if (this._counting) {
      const el = document.getElementById('cine-card-title');
      if (el && el.textContent !== String(left)) {
        el.textContent = String(left);
        if (left > 0) AudioBus.play('ui-hover');
      }
      return;
    }
    const note = document.getElementById('vote-note');
    if (note) note.textContent = note.textContent.replace(/\d+s left/, left + 's left');
  }

  dispose() {
    this._choosing = false;
    this._counting = false;
    if (this._untilOff) this._untilOff();
    if (Screens.current === 'vote') Screens.hideAll();
    if (this._offRole) { this._offRole(); this._offRole = null; }

    if (this.music) { this.music.stop(0.9); this.music = null; }
    if (this.wind) { this.wind.stop(); this.wind = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
