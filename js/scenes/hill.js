/* ------------------------------------------------------------------
   hill.js — the welcome.

   The first thing anybody sees of the show, so it does three jobs and
   then gets out of the way: it establishes the place, it tells you what
   you are, and it sends you up to the house.

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

      ...speak('toCastle', {}, ['wide', 'claudia', null]),
      { then: () => { if (Session.isHost) Net.send({ type: 'advance' }); } },
    ].filter(Boolean), this);
  }

  update(dt) {
    if (!this.stage) return;
    this.stage.update(dt);
  }

  dispose() {
    if (this._offRole) { this._offRole(); this._offRole = null; }
    if (this.music) { this.music.stop(0.9); this.music = null; }
    if (this.wind) { this.wind.stop(); this.wind = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
