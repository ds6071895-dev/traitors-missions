/* ------------------------------------------------------------------
   roundtable.js — the talking.

   The same hill at dusk with a table on it, three people sitting round
   it, and candles doing all the lighting. Nobody is banished here and
   Claudia says so out loud, because a round table that ends without a
   banishment has to explain itself or it reads as a bug.

   The scene has exactly one interactive moment: you choose what to say.
   It changes nothing mechanically — the bots read it, and that is all
   — and it is deliberately not dressed up as a move. You are not
   solving anything at this table. You are deciding how you want to
   look while you have no idea what is going on.

   Your line is the one thing here that is not spoken aloud. Everyone
   else is performed; yours is read. Being dubbed by the host's voice
   in your own mouth is worse than silence.
------------------------------------------------------------------ */
class RoundtableScene {

  constructor(opts = {}) {
    this.opts = opts;
    this.music = null;
    this.stage = null;
    this._resolveSay = null;
    this._sayTimer = null;
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

  // a bot's voice, off the same synthesiser: a different pitch and pace
  // is a cheap impression of a different person, and it is enough
  _voiceFor(seat) {
    return { pitch: 0.84 + (seat % 3) * 0.15, rate: 0.90 + (seat % 2) * 0.09 };
  }

  start() {
    const s = Session.state;
    const seed = s.seed;
    const m = s.missions[1] || {};
    const L = (set, vars) => ClaudiaLines.beats(set, vars, seed + 5);

    Scenes.Cine.on(true);
    Scenes.Cine.bars(false);
    this.music = Music.ceremony();
    if (this.music) this.music.setGear(1, 4);
    this.wind = AudioBus.wind();
    if (this.wind) this.wind.set(0.18);

    const speak = (set, vars, shots) => {
      const lines = L(set, vars);
      return lines.map((b, i) => ({
        shot: shots && shots[i],
        line: { text: b.text, who: 'claudia' },
        hold: i === lines.length - 1 ? 0.65 : 0.3,
      }));
    };

    // what the other two have decided to say tonight
    const script = Bots.tableScript();
    const botBeats = [];
    script.forEach((entry, i) => {
      const p = Session.playerById(entry.playerId);
      if (!p) return;
      const v = this._voiceFor(p.seat);
      botBeats.push({
        shot: 'on:' + p.id,
        line: { text: entry.text, speaker: entry.speaker, who: p.id,
                pitch: v.pitch, rate: v.rate },
        hold: 0.45,
        then: () => Net.send({ type: 'say', playerId: p.id,
                               lineId: entry.lineId, text: entry.text }),
      });
      // your turn falls in the middle, where an interruption belongs
      if (i === Math.floor(script.length / 2) - 1) botBeats.push({ ask: true });
    });
    if (!botBeats.some(b => b.ask)) botBeats.push({ ask: true });

    const beats = [
      { shot: 'wide', wait: 1.4 },
      ...speak('tableOpen', { pot: U.money(s.pot) }, ['table', 'claudia', null]),
      ...speak('tablePrompt', {}, ['players', null]),
      ...botBeats.map(b => (b.ask ? {
        shot: 'players',
        until: () => this._ask(),
      } : b)),
      ...speak('tableNoBanish', {}, ['claudiaTight', null, null]),
      ...speak('secondMission', { mission: m.name || 'the second mission' }, ['claudia', null]),
      m.modName ? { card: { kicker: 'Tonight', title: m.modName,
                            sub: m.modBlurb || '', tone: 'twist' }, wait: 2.2 } : null,
      m.modName ? { card: null } : null,
      ...speak('sendOff'),
      { then: () => Net.send({ type: 'advance' }) },
    ].filter(Boolean);

    Scenes.run(beats, this);
  }

  /* ---------------- your line ---------------- */

  _ask() {
    const s = Session.state;
    const you = s.players.find(p => p.local);
    const others = s.players.filter(p => p.id !== you.id && p.alive);
    const target = others[Math.floor(Math.random() * others.length)] || { name: 'them' };

    const panel = document.getElementById('say-options');
    if (!panel) return Promise.resolve(true);

    const options = ClaudiaLines.YOU.map(o => ({
      id: o.id, label: o.label,
      text: ClaudiaLines.fill(o.text, { name: target.name }),
    }));

    panel.innerHTML = '';
    for (const o of options) {
      const b = document.createElement('button');
      b.className = 'btn say-btn';
      b.innerHTML = `<span class="say-label">${o.label}</span><span class="say-text">“${o.text}”</span>`;
      b.addEventListener('mouseenter', () => AudioBus.play('ui-hover'));
      b.addEventListener('click', () => this._choose(o));
      panel.appendChild(b);
    }

    if (this.stage) this.stage.setControls(false);
    Screens.show('say');
    return new Promise((resolve) => {
      this._resolveSay = resolve;
      /* Never let a cutscene wait for ever on somebody who has walked
         away from the keyboard. Saying nothing is one of the answers, so
         the timeout is a real choice rather than a failure. */
      this._sayTimer = setTimeout(() => {
        this._choose(options.find(o => o.id === 'y-hold') || options[0]);
      }, 22000);
    });
  }

  _choose(option) {
    if (!this._resolveSay) return;
    clearTimeout(this._sayTimer);
    this._sayTimer = null;
    const resolve = this._resolveSay;
    this._resolveSay = null;

    AudioBus.play('ui-click');
    Screens.hideAll();
    if (this.stage) this.stage.setControls(true);

    const you = Session.state.players.find(p => p.local);
    Net.send({ type: 'say', playerId: you.id, lineId: option.id, text: option.text });

    // read, not performed
    this.stage.setShot('players');
    this.stage.setSpeaking(null);
    Voice.say(option.text, { speaker: 'You', silent: true })
      .then(() => { Voice.clear(); resolve(true); });
  }

  update(dt) {
    if (!this.stage) return;
    this.stage.update(dt);
  }

  dispose() {
    clearTimeout(this._sayTimer);
    this._sayTimer = null;
    if (this._resolveSay) { const r = this._resolveSay; this._resolveSay = null; r(false); }
    if (this.music) { this.music.stop(0.9); this.music = null; }
    if (this.wind) { this.wind.stop(); this.wind = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
