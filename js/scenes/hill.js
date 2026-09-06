/* ------------------------------------------------------------------
   hill.js — the welcome.

   The first thing anybody sees of the show, so it does three jobs and
   then gets out of the way: it establishes the place, it tells you what
   you are, and it names the first mission.

   The camera does all the acting. It opens with its lens in the grass
   because that is the detail the whole hill is built around and you
   should see it before you see anything else, rises over the crest to
   let the glen open behind Claudia, holds once on the castle out in the
   loch so you know where you are, and then goes to her and stays there.
   Nothing here is interactive: the only input is "go on", and the beat
   runner already owns that.
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
    this.stage.setShot('grass', { cut: true });
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
    const m = s.missions[0] || {};
    const L = (set, vars) => ClaudiaLines.beats(set, vars, seed);

    Scenes.Cine.on(true);
    Scenes.Cine.bars(false);
    this.music = Music.ceremony();
    this.wind = AudioBus.wind();
    if (this.wind) this.wind.set(0.34);

    // one beat per sentence, so a shot can change on a full stop
    const speak = (set, vars, shots) => {
      const lines = L(set, vars);
      return lines.map((b, i) => ({
        shot: shots && shots[i],
        line: { text: b.text, who: 'claudia' },
        hold: i === lines.length - 1 ? 0.7 : 0.35,
      }));
    };

    const twistVars = {
      mission: m.name || 'the first mission',
      twist: m.modName || '',
      twistBlurb: m.modBlurb || '',
    };

    Scenes.run([
      { wait: 1.6 },
      ...speak('welcome', {}, ['grass', 'rise', 'loch']),
      ...speak('theRules', {}, ['claudia', null, null]),
      ...speak('roleIntro', {}, ['claudiaTight', null, null]),

      // the one card that only you ever see
      { shot: 'claudiaTight',
        card: () => ({
          kicker: 'And you are',
          title: role === 'traitor' ? 'A TRAITOR' : 'A FAITHFUL',
          sub: role === 'traitor'
            ? 'Nobody else is told. Get to the end of the night still sitting there.'
            : 'Nobody else is told. Find the Traitor — if there is one.',
          tone: role === 'traitor' ? 'traitor' : 'faithful',
        }),
        wait: 1.5 },
      ...speak(role === 'traitor' ? 'roleTraitor' : 'roleFaithful'),
      { card: null, wait: 0.5 },

      /* The task, for the one person who has one — said as well as
         shown. Claudia is heard on the Traitor's browser and on no
         other, the same way the role line above is, so there was never
         anybody in the room to overhear it; and a card read in five
         seconds while the camera moves is not an instruction anybody
         carries into a mission. The card stays up for the whole of it,
         because hearing a sentence once is not the same as having it in
         front of you. */
      ...(role === 'traitor' && Session.myAgenda() ? [
        { shot: 'claudiaTight',
          card: () => ({
            kicker: 'And one more thing, quietly',
            title: 'YOUR TASK',
            /* The second line is not flavour. Nothing in this game can
               hear a microphone, so the only record that the task
               happened is the button on the chip — and a Traitor who
               performs the card beautifully and never marks it is
               exposed for it. That has to be said in words, once, here,
               before anybody is out on the water. */
            sub: Session.myAgenda().text
               + '<br><span style="opacity:.7">Say it out loud during the mission, then mark it '
               + 'on your task card before the run ends. Nobody can hear you but them.</span>',
            tone: 'traitor',
          }),
          wait: 1.2 },
        ...speak('taskGiven', { task: Session.myAgenda().text },
                 ['claudiaTight', 'claudiaTight', 'claudiaTight', 'claudiaTight', 'claudia']),
        { card: null, wait: 0.4 },
        { then: () => RoomUI.showAgenda() },
      ] : []),

      { then: () => Scenes.barrier('hill-private-complete') },

      ...speak('firstMission', twistVars, ['wide', 'claudia', null]),

      // the twist, announced rather than chosen
      m.modName ? { card: { kicker: 'Tonight', title: m.modName,
                            sub: m.modBlurb || '', tone: 'twist' } } : null,
      ...speak(m.modName ? 'twist' : 'noTwist', twistVars),
      m.modName ? { card: null } : null,

      ...speak('sendOff'),
      { then: () => { if (Session.isHost) Net.send({ type: 'advance' }); } },
    ].filter(Boolean), this);
  }

  update(dt) {
    if (!this.stage) return;
    this.stage.update(dt);
  }

  dispose() {
    if (this._offRole) { this._offRole(); this._offRole = null; }
    RoomUI.hideAgenda();
    if (this.music) { this.music.stop(0.9); this.music = null; }
    if (this.wind) { this.wind.stop(); this.wind = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
