/* ------------------------------------------------------------------
   roundtable.js — the talking.

   The same hill at dusk with a table on it, three people sitting round
   it, and candles doing all the lighting. Nobody is banished here and
   Claudia says so out loud, because a round table that ends without a
   banishment has to explain itself or it reads as a bug.

   What used to happen here was a script: two bots read lines at each
   other and you picked one of three replies. That is gone, and what
   replaced it is the reason the room exists. The floor here is open —
   all three microphones live at once, for as long as the discussion
   lasts — and what gets said is whatever three people actually say to
   each other.

   No turns, deliberately. Nobody is banished at this table, so there
   is nothing here that needs protecting from an argument, and an
   argument is the thing the room is for: cut in, talk over each other,
   answer the accusation the second it is made rather than two turns
   later when it has stopped mattering. The clock is on the discussion
   as a whole, and any of you may say you are finished with it; when
   all three have, the table moves on early. The fire is where it goes
   back to one voice at a time, because that is where names are said.

   The board is up the whole time. That is the other half of it: an
   accusation with nothing behind it is noise, so everybody can see
   everybody's numbers from the mission they have just come off, and
   the argument has something to be about.

   There is nothing to click but "I've said enough". The three canned
   statements that used to be here went with the bots that read them: a
   menu of things to say is what you build when the players cannot
   speak, and these ones can.

   Nobody is announced, so the edit listens instead: whoever has been
   the loudest voice for a moment gets the camera, and a quiet room
   widens back out to the pair of them. It holds a shot for a few
   seconds either way, because an edit that chases every interruption
   is unwatchable.

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
    this._open = false;          // is the table's open discussion running
    this._onWho = null;          // who the camera is on, or null for the pair
    this._leadWho = null;        // who has been loudest, and for how long
    this._leadT = 0;
    this._holdT = 0;             // since the last cut
    this._quietT = 0;
    this._speaking = null;
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
    if (Session.state.exposure && Session.state.exposure.checked) {
      return Promise.resolve(Session.state.exposure);
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (e) => { if (done) return; done = true; off(); resolve(e); };
      const off = Net.on((ev) => {
        if (ev.type === 'expose') finish(ev);
        else if (Session.state.exposure && Session.state.exposure.checked) {
          finish(Session.state.exposure);
        }
      });
      this._offExpose = () => finish(null);
      Exposed.request();
      if (Session.state.exposure && Session.state.exposure.checked) {
        finish(Session.state.exposure);
      }
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
      ...speak('tableTalk', {}, ['claudia', null]),

      { shot: 'players', until: () => this._openTable() },

      { then: () => { RoomUI.hideFloor(); RoomUI.hideBoard(); } },
      ...speak('tableNoBanish', {}, ['claudiaTight', null, null]),
      ...speak('secondMission', { mission: m.name || 'the second mission' }, ['claudia', null]),
      m.modName ? { card: { kicker: 'Tonight', title: m.modName,
                            sub: m.modBlurb || '', tone: 'twist' }, wait: 2.2 } : null,
      m.modName ? { card: null } : null,
      ...speak('sendOff'),
      { then: () => { if (Session.isHost) Net.send({ type: 'advance' }); } },
    ].filter(Boolean);
  }

  /* ---------------- the open floor ----------------
     The host opens it and owns the clock. Every client just reacts to
     what it is told: hold the pair of them in frame, leave every
     microphone open, and offer the one button there is to press. */

  _listen() {
    this._offNet = Net.on((e) => {
      if (e.type === 'floor') this._onFloor(e);
      else if (Session.state.floor && Session.state.floor.done && this._floorDone) {
        this._onFloor(Session.state.floor);
      }
    });
  }

  _onFloor(e) {
    if (!this.stage) return;
    if (e.done || (!e.playerId && !e.all)) {
      this._open = false;
      RoomUI.hideFloor();
      this.stage.setSpeaking(null);
      this._speaking = null;
      if (this._floorDone) { const f = this._floorDone; this._floorDone = null; f(true); }
      return;
    }
    RoomUI.showFloor(e);
    if (e.all) {
      /* Only the first one of these opens the room — the rest are
         somebody pressing the button, and a camera that cut on those
         would be cutting on the wrong thing entirely. */
      if (!this._open) {
        this._open = true;
        this._onWho = null; this._leadWho = null;
        this._leadT = 0; this._holdT = 0; this._quietT = 0;
        this.stage.setShot('players');
      }
      /* The backstop now knows what the host's clock actually says, so
         it stops guessing and simply outlives it. */
      if (e.endsAt) this._guard(e.endsAt - Date.now() + 15000);
      return;
    }
    this._open = false;
    this.stage.setShot('on:' + e.playerId);
    this.stage.setSpeaking(e.playerId);
  }

  _openTable() {
    return new Promise((resolve) => {
      this._floorDone = resolve;
      const floor = Session.state.floor;
      if (floor && floor.done) {
        this._floorDone = null;
        resolve(true);
        return;
      }
      if (floor && floor.all) this._onFloor(floor);
      else if (Session.isHost) Net.send({ type: 'openFloor', all: true });
      /* If the host vanishes — before the discussion opens, or in the
         middle of it — the table must still end. This is a backstop,
         not the clock; the clock is the host's, and once the host has
         said how long it is, `_onFloor` sets this from that. */
      this._guard(1000 * (RoundtableScene.TALK_SECONDS + 30));
    });
  }

  _guard(ms) {
    clearTimeout(this._floorGuard);
    this._floorGuard = setTimeout(() => {
      if (this._floorDone) { const f = this._floorDone; this._floorDone = null; f(true); }
    }, Math.max(1000, ms));
  }

  /* ---------------- the edit ----------------
     Nobody is announced at an open table, so the only thing that knows
     who has the room is the room. Mouths follow the voices frame by
     frame; the camera follows them slowly, and holds. */

  _followVoices(dt) {
    const loud = VoiceChat.loudest(0.14);

    if (loud !== this._speaking) {
      this._speaking = loud;
      this.stage.setSpeaking(loud);
    }

    this._holdT += dt;

    if (!loud) {
      this._leadWho = null; this._leadT = 0;
      this._quietT += dt;
      if (this._onWho && this._quietT > 2.5 && this._holdT > 3.5) {
        this._onWho = null; this._holdT = 0;
        this.stage.setShot('players');
      }
      return;
    }

    this._quietT = 0;
    if (loud === this._onWho) { this._leadWho = loud; this._leadT = 0; return; }
    this._leadT = loud === this._leadWho ? this._leadT + dt : 0;
    this._leadWho = loud;
    /* A second and a bit of leading the room, and a shot that has been
       up for three and a half. Below that the camera starts cutting on
       one-word interjections, which reads as a fault rather than an
       edit. */
    if (this._leadT > 1.2 && this._holdT > 3.5) {
      this._onWho = loud; this._leadT = 0; this._holdT = 0;
      this.stage.setShot('on:' + loud);
    }
  }

  update(dt) {
    if (!this.stage) return;
    if (this._open) this._followVoices(dt);
    this.stage.update(dt);
  }

  dispose() {
    this._open = false;
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

/* How long the table talks for. The session clamps and owns the real
   clock; this is here so the local backstop knows what it is backing
   up. */
RoundtableScene.TALK_SECONDS = 150;
