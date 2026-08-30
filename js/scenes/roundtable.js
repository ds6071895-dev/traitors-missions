/* ------------------------------------------------------------------
   roundtable.js — the talking.

   The same hill at dusk with a table on it, three people sitting round
   it, and candles doing all the lighting. Nobody is banished here and
   Claudia says so out loud, because a round table that ends without a
   banishment has to explain itself or it reads as a bug.

   What used to happen here was a script: two bots read lines at each
   other and you picked one of three replies. That is gone, and what
   replaced it is the reason the room exists. The floor goes round the
   table — thirty seconds each, one microphone live at a time, everyone
   else muted at the source — and what gets said is whatever three
   people actually say to each other.

   The board is up the whole time. That is the other half of it: an
   accusation with nothing behind it is noise, so everybody can see
   everybody's numbers from the mission they have just come off, and
   the argument has something to be about.

   There is nothing to click. The three canned statements that used to
   be here went with the bots that read them: a menu of things to say
   is what you build when the players cannot speak, and these ones can.
   Your turn is your turn — talk, or do not, and press the button when
   you are finished with it.

   The fire is untouched by any of this. Its ballot is still the full
   thing: end the game or banish again, unanimity to stop, names spoken
   one at a time, and a tie voted over rather than broken.

   And if somebody left a task unfinished out there, none of the above
   happens. See `exposed.js`.
------------------------------------------------------------------ */
class RoundtableScene {

  constructor(opts = {}) {
    this.opts = opts;
    this.music = null;
    this.stage = null;
    this._offNet = null;
    this._floorDone = null;
  }

  build() {
    const s = Session.state;
    this.stage = Stage.build({
      seed: s.seed + 91,
      hour: 'dusk',
      dress: 'table',
      players: s.players,
    });
    // the two visible contestants sit; the local player is the camera
    this.stage.figures.forEach(f => f && Figure.setSeated(f, true));
    this.stage.setShot('wide', { cut: true });
    return this.stage.view;
  }

  setShot(name, opts) { this.stage.setShot(name, opts); }
  setSpeaking(who) { this.stage.setSpeaking(who); }

  /* A room with no fire in it, so there is nothing for a reveal to
     burn — but the hook has to exist, because `exposed.js` plays in
     here and at the fireplace and should not know which. */
  takeEmbers() {}

  start() {
    const s = Session.state;
    const seed = s.seed;
    const m = s.missions[1] || {};

    Scenes.Cine.on(true);
    Scenes.Cine.bars(false);
    this.music = Music.ceremony();
    if (this.music) this.music.setGear(1, 4);
    this.wind = AudioBus.wind();
    if (this.wind) this.wind.set(0.18);

    this._listen();

    /* One question first, and everything else waits on the answer:
       is anybody about to be exposed? The host asks the session; all
       three clients hear the same reply. */
    this._exposure().then((e) => {
      if (!this.stage) return;
      if (e && e.playerId) {
        Scenes.run(Exposed.beats(this, e, seed), this);
        return;
      }
      Scenes.run(this._tableBeats(s, m, seed), this);
    });
  }

  /* ---------------- the exposure question ---------------- */

  _exposure() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (e) => { if (done) return; done = true; off(); resolve(e); };
      const off = Net.on((ev) => { if (ev.type === 'expose') finish(ev); });
      this._offExpose = () => finish(null);
      Exposed.request();
      /* A guest whose host has gone quiet still has to get a table.
         The wait is generous because it is once per gathering. */
      setTimeout(() => finish(null), 4000);
    });
  }

  /* ---------------- the ordinary table ---------------- */

  _tableBeats(s, m, seed) {
    const L = (set, vars) => ClaudiaLines.beats(set, vars, seed + 5);
    const speak = (set, vars, shots) => {
      const lines = L(set, vars);
      return lines.map((b, i) => ({
        shot: shots && shots[i],
        line: { text: b.text, who: 'claudia' },
        hold: i === lines.length - 1 ? 0.65 : 0.3,
      }));
    };

    return [
      { shot: 'wide', wait: 1.4 },
      ...speak('tableOpen', { pot: U.money(s.pot) }, ['table', 'claudia', null]),

      // the numbers go up before anybody is asked to talk about them
      { then: () => RoomUI.showBoard(s.debrief), shot: 'table', wait: 1.2 },
      ...speak('floorBoard', {}, ['table', null]),

      ...speak('tablePrompt', {}, ['players', null]),
      ...speak('floorOpen', {}, ['claudia', null]),

      { shot: 'players', until: () => this._floorRound() },

      { then: () => { RoomUI.hideFloor(); RoomUI.hideBoard(); } },
      ...speak('tableNoBanish', {}, ['claudiaTight', null, null]),
      ...speak('secondMission', { mission: m.name || 'the second mission' }, ['claudia', null]),
      m.modName ? { card: { kicker: 'Tonight', title: m.modName,
                            sub: m.modBlurb || '', tone: 'twist' }, wait: 2.2 } : null,
      m.modName ? { card: null } : null,
      ...speak('sendOff'),
      { then: () => Net.send({ type: 'advance' }) },
    ].filter(Boolean);
  }

  /* ---------------- the floor ----------------
     The host opens it and owns the clock. Every client just reacts to
     what it is told: cut to whoever is up, open that one microphone,
     and offer the statement panel when it is your turn. */

  _listen() {
    this._offNet = Net.on((e) => {
      if (e.type !== 'floor') return;
      this._onFloor(e);
    });
  }

  _onFloor(e) {
    if (!this.stage) return;
    if (e.done || !e.playerId) {
      RoomUI.hideFloor();
      this.stage.setSpeaking(null);
      if (this._floorDone) { const f = this._floorDone; this._floorDone = null; f(true); }
      return;
    }
    RoomUI.showFloor(e);
    this.stage.setShot('on:' + e.playerId);
    this.stage.setSpeaking(e.playerId);
  }

  _floorRound() {
    if (Session.isHost) Net.send({ type: 'openFloor', seconds: 30 });
    return new Promise((resolve) => {
      this._floorDone = resolve;
      /* If the host vanishes mid-round the table must still end. This
         is a backstop, not the clock — the clock is the host's. */
      this._floorGuard = setTimeout(() => {
        if (this._floorDone) { const f = this._floorDone; this._floorDone = null; f(true); }
      }, 30000 * (Session.state.players.length + 1));
    });
  }

  update(dt) {
    if (!this.stage) return;
    this.stage.update(dt);
  }

  dispose() {
    clearTimeout(this._floorGuard);
    if (this._offNet) { this._offNet(); this._offNet = null; }
    if (this._offExpose) { this._offExpose(); this._offExpose = null; }
    if (this._floorDone) { const f = this._floorDone; this._floorDone = null; f(false); }
    RoomUI.hideAll();
    if (this.music) { this.music.stop(0.9); this.music = null; }
    if (this.wind) { this.wind.stop(); this.wind = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
