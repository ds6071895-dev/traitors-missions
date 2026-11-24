/* ------------------------------------------------------------------
   fireplace.js — the endgame.

   Night, the terrace, a fire, and the question the whole show is
   built to arrive at: is there still a Traitor sitting here?

   The Fire of Truth, as on the programme. Everybody speaks in turn;
   then everybody puts End or Banish Again in a pouch, and the pouches
   burn one at a time. Ending needs every pouch. One Banish and the
   circle names somebody, burns their pouch, and asks again — down to
   two, where the game stops whatever anybody wants.

   The scene is a loop rather than a script, because the number of
   rounds depends on what burns, so it is written as an async driver
   over the session's own stages instead of a beat list. Every step
   waits on the *session* — never on a timer that hopes the session has
   caught up — which is also what will make it correct when the votes
   are arriving over a wire instead of from `bots.js` next door.

   The pouch is the one piece of real theatre. The banishment opens the
   role pouch of whoever was named; reaching the final two then opens
   *every* remaining role pouch — one at a time, yours last — before
   anyone is told who won.

   The ceremony is six beats and they are all timing:

     she takes it   the pouch leaves their hands and reaches hers
     she holds it   arm up, everyone looking at it, camera close
     the held beat  music down to a pulse, subtitle cleared, a riser
     the throw      a real wind-up, and the pouch leaves at the release
     the answer     the colour, and everything the band has, at once
     the name       and only then does she say what it was

   The pause between the throw and the colour is the most important
   second in the game, so nothing is allowed to fill it.
------------------------------------------------------------------ */

/* ---------------- the sounds of the fire ---------------- */

/* Bringing her the pouch: a walking pace, a beat before they set off
   (she is still asking), and the half second it takes hand to hand. */
const POUCH_WALK_SPEED = 2.0, POUCH_WALK_PAUSE = 0.7, POUCH_PASS_SECS = 0.55;

AudioBus.define('pouch-toss', (ctx, dest) => {
  const t = ctx.currentTime;
  const n = AudioBus.noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
  n.connect(bp); bp.connect(g); g.connect(dest);
  n.start(t); n.stop(t + 0.4);
});

AudioBus.define('fire-whoosh', (ctx, dest, o = {}) => {
  const t = ctx.currentTime;
  const n = AudioBus.noiseSource();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.exponentialRampToValueAtTime(2600, t + 0.22);
  lp.frequency.exponentialRampToValueAtTime(420, t + 1.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.big ? 0.42 : 0.24, t + 0.10);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
  n.connect(lp); lp.connect(g); g.connect(dest);
  n.start(t); n.stop(t + 2.1);
});

/* The answer: a low horn for a traitor, a bright bell for a faithful.
   Both now sit on top of a sub drop, because the colour arrives as a
   physical event and a chord alone does not have a floor.

   These are the answer for a room with no band in it. When a score is
   playing, the reveal is its stinger instead (`reveal-traitor` and
   `reveal-faithful` in `music/cues.js`), in the key the band is in —
   these two are pitched in A and C and would fight it. */

const fireSubDrop = (ctx, dest, t, from, to, dur, peak) => {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.55);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.1);
};

AudioBus.define('reveal-traitor', (ctx, dest) => {
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.44, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4.6);
  g.connect(dest);
  // a minor cluster with a tritone in it, an octave apart from itself
  for (const [f, ty] of [[55, 'sawtooth'], [82.5, 'sawtooth'], [110, 'square'],
                         [58.3, 'sawtooth'], [77.8, 'sawtooth'], [220, 'square']]) {
    const o = ctx.createOscillator();
    o.type = ty; o.frequency.value = f;
    // a slow downward bend under the whole thing: it sags as it rings
    o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 4.4);
    const og = ctx.createGain(); og.gain.value = f > 200 ? 0.10 : 0.28;
    o.connect(og); og.connect(g);
    o.start(t); o.stop(t + 4.7);
  }
  fireSubDrop(ctx, dest, t, 120, 26, 3.4, 0.5);
  // and the room itself: a wash of noise that decays over four seconds
  const n = AudioBus.noiseSource();
  if (n) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 3.2);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.20, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    n.connect(lp); lp.connect(ng); ng.connect(dest);
    n.start(t); n.stop(t + 3.8);
  }
});

AudioBus.define('reveal-faithful', (ctx, dest) => {
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.34, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
  g.connect(dest);
  // a major stack, struck in an arpeggio so it opens rather than lands
  const notes = [[523.25, 1, 0], [659.25, 0.7, 0.035], [783.99, 0.55, 0.07],
                 [1046.5, 0.4, 0.105], [1318.5, 0.24, 0.14]];
  for (const [f, a, at] of notes) {
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t + at);
    og.gain.exponentialRampToValueAtTime(a * 0.42, t + at + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + at + 3.6);
    o.connect(og); og.connect(g);
    o.start(t + at); o.stop(t + at + 3.8);
  }
  fireSubDrop(ctx, dest, t, 160, 65, 2.4, 0.30);
});

/* The riser and the heartbeat used to live here as sound effects on
   their own timers. They are in the band now (`music/instruments.js`,
   `shepard` and `heartbeat`), so they land on its beat and are cut with
   it at the release. */

AudioBus.define('vote-in', (ctx, dest, o = {}) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320 + (o.index || 0) * 70, t);
  osc.frequency.exponentialRampToValueAtTime(640 + (o.index || 0) * 70, t + 0.09);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  osc.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + 0.36);
});

/* ---------------- the scene ---------------- */

class FinaleScene {

  constructor(opts = {}) {
    this.opts = opts;
    this.stage = null;
    this.music = null;
    this._waits = new Set();
    this._offNet = null;
    this._alive = true;
    this._pouch = null;
    this._riser = null;
    this._after = null;
    this._embers = null;
    this._hand = new THREE.Vector3();
  }

  build() {
    const s = Session.state;
    // the same weather the card on the way in showed (interlude.js)
    this.weather = typeof Weather !== 'undefined' ? Weather.forFinale(s.seed, s.day) : 'clear';
    this.stage = Stage.build({
      seed: s.seed + 404,
      hour: 'night',
      dress: 'fire',
      players: s.players,
      weather: this.weather,
    });
    this.stage.setShot('wide', { cut: true });
    this._wx = typeof Weather !== 'undefined' ? Weather.fx(this.stage, this.weather) : null;
    return this.stage.view;
  }

  setShot(name, opts) { this.stage.setShot(name, opts); }
  setSpeaking(who) { this.stage.setSpeaking(who); }

  start() {
    Scenes.Cine.on(true);
    Scenes.Cine.bars(false);
    /* The fire has its own score, and every stage of the night below
       calls a section of it by name — see `music/cues.js`. It opens on
       the loch: a fifth on the low strings and the theme on a piano. */
    // the night's own arrangement of the verdicts, the same on every screen
    this.music = Music.finale(Music.dayMusic(Session.state.seed, Session.state.day));
    this.wind = AudioBus.wind();
    if (this.wind) this.wind.set(0.32);

    // the tally has to land vote by vote, so it is driven by events
    this._offNet = Net.on((e) => {
      if (e.type === 'vote') {
        // a vote is a string stab in the key, one chord tone higher
        // each time; the old blip is for a night with no band
        const n = this._tallyCount++;
        // every vote in winds the ostinato up another notch
        if (this.music && this.music.ok) {
          this.music.stinger('vote', { at: 'beat', n });
          this.music.setIntensity(Math.min(1.4, 1 + 0.07 * (n + 1)));
        }
        else AudioBus.play('vote-in', { index: n });
        this._paintTally();
      }
      else if (e.type === 'tally') this._paintTally();
    });
    this._tallyCount = 0;

    /* The fire has nothing to expose any more — an unused poison is the
       round table's business, and the day ended before anybody walked
       down here — so it goes straight to the question. */
    this._drive();
  }

  /* `exposed.js` plays in two rooms and only one of them has something
     burning in it. This is the one that does. */
  takeEmbers(embers, settle) {
    this._embers = embers;
    if (settle) this._settle = settle;
  }

  /* ---------------- the floor ----------------
     Thirty seconds each before the ballot, exactly as at the table. It
     is the same machinery and deliberately so: a fire where everybody
     talks over each other is a fire where the loudest person wins, and
     that is not the game. */
  _floorRound() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        off();
        RoomUI.hideFloor();
        if (this.stage) this.stage.setSpeaking(null);
        resolve(ok);
      };
      const off = Net.on((e) => {
        const current = e.type === 'floor' ? e : Session.state.floor;
        if (!current) return;
        if (current.done || !current.playerId) {
          finish(true);
          return;
        }
        if (e.type !== 'floor') return;
        RoomUI.showFloor(current);
        this._floorTurn(current.playerId);
        if (this.stage) {
          this.stage.setShot('on:' + e.playerId);
          this.stage.setSpeaking(e.playerId);
        }
      });
      const floor = Session.state.floor;
      if (floor && floor.done) { finish(true); return; }
      if (floor && floor.playerId) {
        RoomUI.showFloor(floor);
        this._floorTurn(floor.playerId);
        if (this.stage) {
          this.stage.setShot('on:' + floor.playerId);
          this.stage.setSpeaking(floor.playerId);
        }
      } else if (Session.isHost) Net.send({ type: 'openFloor', seconds: 30 });
      this._waits.add(() => finish(false));
      setTimeout(() => finish(true),
                 30000 * (Session.alive().length + 1));
    });
  }

  /* A new voice has the floor. The first one gets the underscore as it
     is; each after that gets a bell on the bar line and one more layer,
     so the third speaker is talking over a room that has noticed. */
  _floorTurn(playerId) {
    if (!playerId || playerId === this._floorWho) return;
    this._floorWho = playerId;
    const n = ++this._floorN;
    if (!this.music) return;
    // each round at the fire starts where the last one left off
    this.music.setIntensity(Math.min(1.4, 0.7 + 0.2 * (n - 1) + 0.08 * this._round()));
    if (n > 1) this.music.stinger('floor-next', { at: 'bar' });
  }

  // a section of the fire's score, by name
  _cue(name, o) { if (this.music) this.music.section(name, o); }
  // the first voice has the room; see VoiceChat's courtesy
  _courtesy(on) { if (typeof VoiceChat !== 'undefined' && VoiceChat.setCourtesy) VoiceChat.setCourtesy(on); }

  /* ---------------- waiting on the session ---------------- */

  _waitFor(pred) {
    if (!this._alive) return Promise.resolve(false);
    if (pred()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let off = null;
      const cancel = (ok) => {
        if (off) { off(); off = null; }
        this._waits.delete(cancel);
        resolve(ok);
      };
      off = Net.on(() => { if (pred()) cancel(true); });
      this._waits.add(cancel);
    });
  }

  /* `salt` moves the draw on within a round. Without it every pouch in
     the closing walk asks for the same set at the same round number and
     gets the same words three times running. */
  _say(set, vars, shot, salt) {
    const seed = Session.state.seed + this._round() * 13 + (salt | 0) * 101;
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

  _round() { const s = Session.state; return (s && s.finale && s.finale.round) || 0; }

  /* The pouch on the fire can be your own, and every line that puts the
     name inside a clause breaks when the name is "You". Each of those
     sets has a `…You` twin written in the second person; this picks it
     when there is one and the pouch is yours. */
  _setFor(base, target) {
    if (target && target.local && ClaudiaLines.has(base + 'You')) return base + 'You';
    return base;
  }

  /* ---------------- the loop ---------------- */

  async _drive() {
    const s = Session.state;
    /* One long empty beat on the loch before anybody speaks. It is the
       only time all night the castle is fully lit, and the fire behind
       the lens is doing the rest of the work. */
    await Scenes.run([{ shot: 'loch', cut: true, wait: 1.8 }], this);
    if (!this._alive) return;
    await this._say('fireOpen', { pot: U.money(s.pot) }, 'wide');
    if (!this._alive) return;
    this._cue('warn', { glide: 3 });
    await this._say('fireRules', {}, 'claudia');
    if (!this._alive) return;
    // a timpani roll into the warning, landing on a beat
    if (this.music) this.music.stinger('warn', { at: 'beat' });
    await this._say('fireWarn', {}, 'claudiaTight');

    let guard = 0;
    while (this._alive && Session.state.phase === 'finale' && guard++ < 48) {
      const stage = Session.state.finale.stage;
      if (stage === 'decide') await this._decide();
      else if (stage === 'decisions') await this._decisions();
      else if (stage === 'name') await this._name();
      else if (stage === 'names') await this._names();
      else if (stage === 'reveal') {
        // tied twice at the fire: the castle draws before the pouch
        const fz = Session.state.finale;
        if (fz.lot && this._drawn !== fz.pending + ':' + fz.round) {
          this._drawn = fz.pending + ':' + fz.round;
          await TieDraw.play(this, { key: 'fire-tie', claudiaShot: 'claudiaSide', sub: 'The fire cannot choose.' });
          if (!this._alive) return;
        } else if (!fz.lot && typeof Wildcard !== 'undefined' && this._wild !== fz.pending + ':' + fz.round) {
          // the fire's own wild card: a name that went by one slate, or on a change of heart
          this._wild = fz.pending + ':' + fz.round;
          await Wildcard.play(this, Wildcard.detect(Session.state));
          if (!this._alive) return;
        }
        await this._reveal();
      }
      else if (stage === 'pouches') await this._pouches();
      else break;
    }
    if (this._alive) await this._verdict();
  }

  /* ---------------- the Fire of Truth ----------------
     The floor goes round, the board is up, and then one question:
     end it, or banish again. */
  async _decide() {
    const f = Session.state.finale;
    if (f.round > 0) await this._say('againAfterFaithful', {}, 'players');
    if (!this._alive || Session.state.finale.stage !== 'decide') return;
    RoomUI.hideBoard();
    this._floorWho = null;
    this._floorN = 0;
    /* A second round at the fire is not the first one again: the floor
       is a step up in key and starts hotter. The verdict comes home to
       D, whatever the night climbed to. */
    if (this.music) this.music.setKey(Math.min(3, f.round));
    this._cue('floor', { at: 'bar', glide: 3 });
    if (this.music) this.music.setIntensity(0.7 + 0.08 * f.round);
    this._courtesy(true);
    await this._say('floorOpen', {}, 'players');
    if (!this._alive) return;
    await this._floorRound();
    this._courtesy(false);
    RoomUI.hideBoard();
    if (!this._alive || Session.state.finale.stage !== 'decide') return;

    this._cue('ballot', { at: 'bar', fill: true });
    if (this.music) this.music.setIntensity(1);
    await this._say('fireOfTruth', {}, 'claudia');
    if (!this._alive || Session.state.finale.stage !== 'decide') return;
    this._tallyCount = 0;
    const you = Session.state.players.find(p => p.local);
    if (you && you.alive) {
      this._openVote({
        kicker: 'The Fire of Truth · round ' + (this._round() + 1),
        title: 'End the game, or banish again?',
        note: 'Ending needs every pouch. One Banish and somebody else goes.',
        options: [
          { label: 'END THE GAME', sub: 'I believe there is no Traitor left', tone: 'end',
            action: { type: 'decide', choice: 'end' } },
          { label: 'BANISH AGAIN', sub: 'There is still a Traitor here', tone: 'banish',
            action: { type: 'decide', choice: 'banish' } },
        ],
      });
    }
    await this._waitFor(() => Session.state.finale.stage !== 'decide' || Session.state.phase !== 'finale');
    this._closeVote();
    await Scenes.wait(0.7);
  }

  /* The pouches of the decision, burned one by one: the Ends first, so
     the room hears hope before it hears the Banish that kills it.

     Every pouch is a beat — the camera on whoever threw it, the room
     holding still, the word, the fire answering in gold or blood — and
     the count is kept on screen, because ending needs every one. One
     pouch is the one that decides: the first Banish, which kills the
     hope, or the last End of a unanimous fire, which ends the game. That
     one gets the whole build, the breath and the biggest hit; the
     Banishes after it are only the rest of the count. */
  async _decisions() {
    this._cue('names', { at: 'beat', glide: 0.6 });
    let guard = 0, said = 0, ends = 0, banishes = 0;
    const f0 = Session.state.finale;
    const total = Math.max(1, (f0.decisionQueue || []).length);
    const count = () => 'END ' + ends + '  ·  BANISH ' + banishes + '  ·  ' + total + ' pouches';
    await Scenes.Drama.hush(this.stage, null, 'claudia', { hold: 0.4, silent: false, cut: true, push: 0.08, speed: 0.5 });
    if (!this._alive) return;
    await Scenes.run([{ line: { text: 'Ending the game needs every pouch. One Banish, and it goes on.' }, hold: 0.3 }], this);
    if (!this._alive) return;
    while (this._alive && guard++ < 10 && Session.state.phase === 'finale'
           && Session.state.finale.stage === 'decisions') {
      const f = Session.state.finale;
      const voter = Session.playerById(f.decisionQueue[0]);
      if (!voter) break;
      const choice = f.votes[voter.id];
      const end = choice === 'end';
      const lastPouch = f.decisionQueue.length === 1;
      // the pouch that settles it: the first Banish, or the last of an all-End fire
      const decides = (!end && banishes === 0) || (end && lastPouch);
      const after = banishes > 0;               // already settled: only the count is left
      const heat = decides ? 1 : after ? 0.35 : Math.min(0.9, 0.3 + 0.6 * (said + 1) / total);
      if (this.music && this.music.setTension) this.music.setTension(0.3 + 0.7 * heat, 1.0);
      const t0 = Date.now();
      const build = decides ? Scenes.Drama.build(this.stage, this.music, 'pouch', { shot: 'on:' + voter.id, speed: 0.5, cut: true })
                            : null;
      Scenes.Cine.card({ kicker: voter.local ? 'Your pouch' : voter.name + '\u2019s pouch',
                         title: '· · ·', tone: 'slate', cls: 'heat-' + Math.min(3, Math.round(heat * 3)),
                         sub: decides && ends === total - 1 ? 'Every pouch so far says End.' : count() });
      if (!build) await Scenes.Drama.hush(this.stage, null, 'on:' + voter.id,
                                          { hold: after ? 0.35 : 0.5 + 0.7 * heat, silent: false, cut: true, push: 0.12, speed: 0.5 });
      else {
        Scenes.Drama.shot(this.stage, 'on:' + voter.id, { cut: true, push: 0.25, speed: 0.3 });
        await Scenes.Drama.peak(build, { since: t0, min: 2.6, max: 5 });
      }
      if (!this._alive) { if (build) build.cancel(); return; }
      if (build) {
        const wait = build.release(end ? 'vote' : 'name', { n: 4 });
        if (wait) await Scenes.wait(wait);
        if (!this._alive) return;
      } else if (this.music) this.music.stinger(end ? 'vote' : 'name', { n: said });
      else AudioBus.play('vote-in', { index: said });
      said++;
      if (end) ends++; else banishes++;
      // the fire answers: gold for an End, blood for a Banish
      this._burstEmbers(end ? '#ffcf6a' : '#d4142a', decides ? 1 : 0.35 + 0.4 * heat);
      if (this.stage && this.stage.flare) this.stage.flare(decides ? 1 : 0.3 + 0.4 * heat);
      Scenes.Drama.hit(this.stage, null, null, {
        shake: decides ? 0.9 : 0.1 + 0.4 * heat,
        flash: end ? 'rgba(255,196,90,' + (decides ? 0.7 : 0.15 + 0.25 * heat).toFixed(2) + ')'
                   : 'rgba(210,16,30,' + (decides ? 0.8 : 0.2 + 0.3 * heat).toFixed(2) + ')',
        haptic: decides ? 140 : 20 + Math.round(50 * heat),
      });
      Scenes.Cine.card({ kicker: voter.local ? 'Your pouch' : voter.name + '\u2019s pouch',
                         title: end ? 'END' : 'BANISH', tone: end ? 'faithful' : 'traitor',
                         cls: (decides ? 'last ' : '') + 'heat-' + Math.min(3, Math.round(heat * 3)),
                         sub: count() });
      if (this.stage && this.stage.setMood) this.stage.setMood(voter.id, decides ? 'nervous' : 'calm');
      await Scenes.wait(decides ? 1.6 : after ? 0.8 : 1.3);
      if (!this._alive) return;
      if (decides) {
        // and Claudia says what it means, on her face
        Scenes.Drama.shot(this.stage, 'claudia', { cut: true, push: 0.1, speed: 0.5 });
        await Scenes.run([{ line: { text: end
          ? 'Every single pouch says End.'
          : (ends ? ends + (ends === 1 ? ' End, and then ' : ' Ends, and then ') : '')
            + (voter.local ? 'yours' : voter.name + '\u2019s') + ' says Banish. The game goes on.' }, hold: 0.4 }], this);
        if (!this._alive) return;
      }
      await Scenes.barrier('decision-' + this._round() + '-' + voter.id);
      const before = voter.id;
      if (Session.isHost) Net.send({ type: 'decisionPouch', playerId: voter.id });
      await this._waitFor(() => Session.state.phase !== 'finale'
        || Session.state.finale.stage !== 'decisions'
        || Session.state.finale.decisionQueue[0] !== before);
      await Scenes.wait(0.3);
    }
    Scenes.Cine.card(null);
    Scenes.Drama.end(this.stage, null);
    if (!this._alive || Session.state.phase !== 'finale') return;
    const t = Session.state.finale.lastTally;
    if (t && t.stage === 'decide') {
      await this._say(t.result === 'end' ? 'decideEnd' : 'decideBanish', {}, 'claudia');
    }
  }

  /* The banishment ballot at the fire. The floor has already gone round
     in the decision, so this goes straight to the names. */
  async _name() {
    const revote = Session.state.finale.nameRound > 0;
    if (revote) {
      // the split, played as the fire's own long stand-off between the tied (tie-draw.js)
      await TieDraw.fireStandoff(this, { line: 'voteNameTie', claudiaShot: 'claudiaSide' });
      if (!this._alive) return;
      // nobody knows, and the harmony does not either
      this._cue('ballot', { at: 'bar' });
      if (this.music) this.music.setIntensity(1.1);
    } else await this._say('voteName', {}, 'players');
    if (!this._alive || Session.state.finale.stage !== 'name') return;

    /* Talk first, name second — and one at a time. At the fire the
       floor went round before the decision; it is only run here for a
       night whose finale opens straight on the names. */
    if (!revote && Session.state.finale.round === 0 && !Session.state.finale.decisionsShown.length) {
      RoomUI.hideBoard();
      /* The floor: plucked, low, and ducking under anybody who talks.
         Every new speaker pushes it up a notch — see `_floorTurn`. */
      this._floorWho = null;
      this._floorN = 0;
      this._cue('floor', { at: 'bar', glide: 3 });
      if (this.music) this.music.setIntensity(0.7);
      this._courtesy(true);
      // the second time round, the rules need no repeating
      await this._say((Session.state.finale.round | 0) > 0 ? 'floorOpenAgain' : 'floorOpen', {}, 'players');
      if (!this._alive) return;
      await this._floorRound();
      this._courtesy(false);
      RoomUI.hideBoard();
      if (!this._alive || Session.state.finale.stage !== 'name') return;
    }

    /* The ballot. The cello goes to sixteenths on the next bar line,
       with a cymbal swelling into it. */
    this._cue('ballot', { at: 'bar', fill: !revote });
    if (this.music && !revote) this.music.setIntensity(1);

    this._tallyCount = 0;
    const you = Session.state.players.find(p => p.local);
    const tied = Session.state.finale.tied;
    const targets = Session.alive().filter(p => p.id !== you.id && (!tied || tied.indexOf(p.id) >= 0));
    if (you && you.alive && targets.length) this._openVote({
      kicker: (revote ? 'Banishment revote' : 'Round '
              + (this._round() + 1)),
      title: 'Who goes to the fire?',
      note: tied ? 'Only the tied names can go.' : 'You cannot name yourself.',
      options: targets.map(p => ({
        label: p.name.toUpperCase(), sub: 'Send them to the fire',
        tone: 'name', action: { type: 'name', targetId: p.id },
      })),
    });

    await this._waitFor(() => Session.state.finale.stage !== 'name'
                           || Session.state.phase !== 'finale');
    this._closeVote();
    await Scenes.wait(0.9);
  }

  /* The written banishment ballot is performed after it is complete.
     Each contestant says exactly one name, in seat order, before the
     tally resolves and Claudia takes the selected person's role pouch. */
  async _names() {
    // stop-time: a tremolo and a heart, and one hit per name
    this._cue('names', { at: 'beat', glide: 0.6 });
    let guard = 0, said = 0;
    while (this._alive && guard++ < 8
           && Session.state.phase === 'finale'
           && Session.state.finale.stage === 'names') {
      const f = Session.state.finale;
      const voter = Session.playerById(f.nameQueue[0]);
      const target = voter && Session.playerById(f.names[voter.id]);
      if (!voter || !target) break;

      // nobody announces their own vote: Claudia reads each one out
      await Scenes.run([{
        shot: 'on:' + voter.id,
        line: { text: (voter.local ? 'You vote' : voter.name + ' votes') + ' for '
                      + (target.local ? 'you' : target.name) + '.' },
        hold: 0,
      }], this);
      if (!this._alive) return;
      // the name has been said: it lands, a step higher than the last
      if (this.music) this.music.stinger('name', { n: said++ });
      await Scenes.wait(0.65);
      if (!this._alive) return;

      await Scenes.barrier('name-' + this._round() + '-'
        + Session.state.finale.nameRound + '-' + voter.id);
      if (!this._alive) return;

      const before = voter.id;
      if (Session.isHost) Net.send({ type: 'speakName', playerId: voter.id });
      await this._waitFor(() => Session.state.phase !== 'finale'
        || Session.state.finale.stage !== 'names'
        || Session.state.finale.nameQueue[0] !== before);
      await Scenes.wait(0.35);
    }
  }

  /* A banishment: the named person's pouch, and nobody else's. */
  async _reveal() {
    const f = Session.state.finale;
    const target = Session.playerById(f.pending);
    if (!target) return;

    await this._ceremony(target, {
      intro: this._setFor('pouchIntro', target),
      reveal: (role) => this._setFor(
        role === 'veiled' ? 'revealVeiled' : role === 'traitor' ? 'revealTraitor' : 'revealFaithful', target),
      action: { type: 'reveal' },
      // a Traitor caught is a triumph; a Faithful burned is a lament
      after: (role) => role === 'traitor' ? 'afterTraitor' : 'afterFaithful',
    });
    if (!this._alive) return;

  }

  /* Ending the game: everybody's, one at a time, and yours last. The
     loop reads the queue back off the session every time round rather
     than snapshotting it, because the session is the thing that knows
     how many are left and it is the thing that will be a server. */
  async _pouches() {
    const f = Session.state.finale;
    this._cue('lastPouches', { at: 'bar', glide: 2 });
    await this._say(f.reason === 'final-two' || f.reason === 'you-burned'
                    ? 'finalTwoReveal' : 'endPouches', {}, 'claudiaSide');

    let guard = 0;
    while (this._alive && guard++ < 8
           && Session.state.phase === 'finale'
           && Session.state.finale.stage === 'pouches') {
      const st = Session.state.finale;
      const target = Session.playerById(st.pending);
      if (!target) break;
      const last = st.queue.length <= 1;
      // each pouch opened winds the room tighter
      if (this.music && this.music.setTension) this.music.setTension(Math.min(1, 0.35 + 0.15 * st.opened.length), 3);
      await this._ceremony(target, {
        intro: target.local ? (last ? 'finalPouchYouLast' : 'finalPouchYou')
                            : (last ? 'finalPouchLast' : 'finalPouchIntro'),
        reveal: (role) => this._setFor(
          role === 'traitor' ? 'finalTraitor' : 'finalFaithful', target),
        action: { type: 'pouch' },
        salt: st.opened.length + 1,
        /* Every pouch a semitone higher than the last, and the last one
           held the longest — the night is climbing to the verdict. The
           suspense only resolves on the last pouch: a Faithful opened
           before it goes straight back to waiting. The last pouch drives
           into the verdict whatever it is — a Faithful there means no
           Traitor survived, and that is not a lament. */
        section: 'lastPouches',
        key: st.opened.length,
        last,
        /* …and a Traitor in the very last pouch got away with it: that is
           the villain's anthem, everything the band owns. */
        after: (role) => last ? (role === 'traitor' ? 'finalBurn' : 'afterTraitor') : 'lastPouches',
      });
      if (!this._alive) return;
      await Scenes.wait(0.7);
    }
  }


  /* ---------------- the ceremony ----------------
     One pouch, start to finish. Everything that differs between a
     banishment and the last pouches of the night is in `spec`. */

  async _ceremony(target, spec) {
    const claudia = this.stage.claudia;

    const salt = spec.salt | 0;

    // she asks for it: tremolo strings, and the choir on "oo"
    if (this.music && spec.key != null) this.music.setKey(spec.key);
    this._cue(spec.section || 'pouch', { at: 'bar', glide: 2 });

    /* She asks for it, and they bring it to her: up from their place,
       round the back of the circle and in at her elbow — a pouch is
       carried, by hand, never thrown across the fire to her. They set
       off a beat into her asking, so the walk overlaps the line. */
    this._spawnPouch(target);
    const walk = this._bringPouch(target);
    await this._say(spec.intro, { name: target.name }, 'on:' + target.id, salt);
    if (!this._alive) return this._abort();
    this.stage.setShot('claudiaSide');
    await Scenes.wait(Math.max(0.2, walk - (this._pouch ? this._pouch.t : walk)));
    if (!this._alive) return this._abort();

    // hand to hand, and they go back to their place
    this._passPouch();
    await Scenes.wait(POUCH_PASS_SECS);
    if (!this._alive) return this._abort();
    this._walkBack(target);

    // and she holds it up, where everybody has to look at it
    Figure.setHolding(claudia, true);
    if (this._pouch) this._pouch.state = 'held';
    this.stage.setShot('claudiaTight');
    await this._say('pouchThrow', { name: target.name }, 'claudiaTight', salt);
    if (!this._alive) return this._abort();

    const ceremonyKey = 'pouch-' + this._round() + '-'
      + ((spec.action && spec.action.type) || 'reveal') + '-' + target.id;
    await Scenes.barrier(ceremonyKey + '-throw');
    if (!this._alive) return this._abort();

    /* The held beat. The band drops to a heart and a low D, the
       subtitle goes, a riser starts climbing, and the camera creeps in
       on the fire, with the bars in and the edges gone dark — all
       saying the same thing, which is that nothing else is going to
       happen until this does. The last pouch of the night is held
       longest. */
    Voice.clear();
    const hold = spec.last ? 2.4 : 1.5;
    this._cue('held', { at: 'now', glide: 0.3 });
    /* The build is timed to the throw: it reaches the top as the pouch
       leaves her hand, and the throw is what cuts it. */
    this._riser = this.music && this.music.build
      ? this.music.build({ shape: 'pouch', secs: hold + Figure.THROW_AT * 0.95, gain: spec.last ? 1.15 : 1 }) : null;
    this._big = !!spec.last;
    // bars in, the edges of the frame go dark, the camera creeps in
    Scenes.Drama.hush(this.stage, null, 'fireTight', { hold: 0, silent: false, speed: 0.32 });
    await Scenes.wait(hold);
    if (!this._alive) return this._abort();

    // the throw itself, with the pouch leaving her hand at the release
    this.stage.lookAt(this.stage.fire ? this.stage.fire.position : null);
    Figure.throwNow(claudia, 0.95);
    if (this._pouch) this._pouch.state = 'wind';
    await Scenes.wait(Figure.THROW_AT * 0.95);
    if (!this._alive) return this._abort();

    this._throwPouch();
    /* The release. The riser is cut and the band with it — true
       silence, not a duck — so the only sounds in the second before
       the answer are the pouch in the air and the fire. The reveal
       stinger is what ends it. */
    this._endHeldBeat();
    if (this.music) this.music.silence(true);
    AudioBus.play('pouch-toss');
    Figure.setHolding(claudia, false);
    // down in the grass, looking up the flame, for what comes out of it
    this.stage.setShot('fireHero', { speed: 0.85 });
    await Scenes.wait(0.85);

    // the answer
    this._after = spec.after || null;
    const role = await this._burn(spec.action, target.id);
    if (!this._alive) return this._abort();

    // it is allowed to just burn, for a moment
    await Scenes.wait(1.8);
    Scenes.Cine.card(null);
    await Scenes.wait(0.3);
    if (!this._alive) return;

    Scenes.Drama.end(this.stage, null);
    await this._say(spec.reveal(role), { name: target.name }, 'claudia', salt);
    if (role === 'veiled' && this.stage) this.stage.flare(1);
    await Scenes.barrier(ceremonyKey + '-complete');
    this.stage.lookAt(null);
  }

  /* The held beat, ended. It is its own method because three things end
     it — the answer arriving, the scene being torn down, and a
     ceremony abandoned part way through — and a riser left climbing
     after a scene has gone is the one that would be noticed. */
  _endHeldBeat() {
    const r = this._riser;
    this._riser = null;
    if (r) { try { if (r.cancel) r.cancel(0.04); else r.stop(); } catch (e) {} }
  }

  // a ceremony that will not be finishing: stop everything it started
  _abort() {
    this._endHeldBeat();
    this._meWalk = null;
    if (this.music) this.music.silence(false);
    this._clearPouch();
    Scenes.Drama.end(this.stage, null);
    if (this.stage) this.stage.setCinematic(false);
  }

  // dispatch the reveal and wait for the authority to say what it was
  _burn(action, playerId) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (role, e) => {
        if (done) return;
        done = true;
        off();
        this._flare(role, e || { playerId, role });
        resolve(role);
      };
      const off = Net.on((e) => {
        if (e.type === 'reveal' && (!playerId || e.playerId === playerId)) {
          finish(e.role, e);
          return;
        }
        const f = Session.state.finale;
        const recovered = (f.opened || []).concat(f.burned || []).find(x => x.id === playerId);
        if (recovered) finish(recovered.role, { playerId, role: recovered.role });
      });
      this._waits.add(() => {
        if (done) return;
        done = true; off(); resolve('faithful');
      });
      const f = Session.state.finale;
      const shown = (f.opened || []).concat(f.burned || []).find(x => x.id === playerId);
      if (shown) { finish(shown.role, { playerId, role: shown.role }); return; }
      if (Session.isHost) Net.send(action || { type: 'reveal' });
    });
  }

  /* The answer, delegated. Everything that makes a reveal land lives
     in `reveal.js` now, because the fire is no longer the only room
     one can happen in — see the header there. What stays here is the
     part that is about *this* scene: the held beat has to be released
     first, and the fire's colour has to be walked back down over the
     next five seconds by the frame loop below. */
  _flare(role, e) {
    this._endHeldBeat();
    this._clearEmbers();
    /* Hidden roles: the pouch goes in and the fire gives nothing back —
       it sinks, smokes grey, and the room is left with its guess. */
    if (role === 'veiled') {
      this._big = false;
      if (this.music) { this.music.silence(false); this._cue('afterFaithful', { at: 'bar', glide: 1.2 }); }
      AudioBus.play('ui-click');
      if (this.stage) { this.stage.flare(0.45); this.stage.shake(0.35); }
      this._burstEmbers('#9aa0aa', 0.5);
      const p = e && e.playerId ? Session.playerById(e.playerId) : null;
      Scenes.Cine.card({ kicker: p ? (p.local ? 'You' : p.name) : '', title: 'VEILED',
                         sub: 'Traitor or Faithful — not until the end.', tone: 'slate' });
      return;
    }
    const out = Reveal.flare({
      role,
      stage: this.stage,
      music: this.music,
      after: this._after ? this._after(role) : undefined,
      playerId: e && e.playerId,
      // the last pouch of the night gets the biggest hit there is
      big: !!this._big,
    });
    this._big = false;
    this._embers = out.embers;
    if (out.settle) this._settle = out.settle;
  }

  _burstEmbers(colour, strength) {
    this._clearEmbers();
    this._embers = Reveal.burstEmbers(this.stage, this.stage.fire, colour, strength);
  }

  _updateEmbers(dt) {
    this._embers = Reveal.updateEmbers(this.stage, this._embers, dt);
  }

  _clearEmbers() {
    this._embers = Reveal.clearEmbers(this.stage, this._embers);
  }

  async _verdict() {
    const o = Session.state.outcome;
    if (!o) return;
    this._closeVote();
    /* The verdict is the whole theme, eight bars, in whichever of three
       versions the night earned: a hymn, a lament, or the Traitor's
       anthem. Back in D for it, whatever the pouches climbed to. */
    if (this.music) {
      const V = Music.verdictCue(o);
      this.music.setKey(0);
      this.music.stinger(V.sting);
      this.music.section(V.section, { at: 'bar', glide: 2 });
    }

    const set = o.reason === 'you-burned' ? 'lostBurned'
              : (o.role === 'traitor'
                  ? (o.won ? 'wonTraitor' : 'lostTraitorCaught')
                  : (o.won ? (o.hadTraitor ? 'wonFaithful' : 'wonFaithfulClean')
                     : (o.fate && !o.traitorAlive ? 'lostOut' : 'lostFaithful')));

    await this._say(set, { pot: U.money(o.pot) }, 'claudia');
    if (!this._alive) return;
    Voice.clear();
    if (this.stage) this.stage.setControls(false);
    Show.showVerdict(o);
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
      b.innerHTML = `<span class="vb-label">${opt.label}</span>`
                  + `<span class="vb-sub">${opt.sub || ''}</span>`;
      b.addEventListener('mouseenter', () => AudioBus.play('ui-hover'));
      b.addEventListener('click', () => {
        if (b.disabled) return;
        [...root.children].forEach(c => { c.disabled = true; });
        b.classList.add('chosen');
        AudioBus.play('ui-click');
        Net.send(Object.assign({ playerId: you ? you.id : null }, opt.action));
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
    if (!s || !s.finale) return;
    const f = s.finale;
    const cast = (f.stage === 'name' ? f.names : f.votes) || {};
    wrap.innerHTML = Session.alive().map(p => {
      const inYet = !!cast[p.id];
      return `<span class="vt ${inYet ? 'in' : ''}">${castleEsc(p.local ? 'You' : p.name)}`
           + `<i>${inYet ? 'decided' : 'thinking…'}</i></span>`;
    }).join('');
  }

  /* ---------------- the pouch ---------------- */

  _spawnPouch(target) {
    const fig = this.stage.figureOf(target.id);
    const seat = this.stage.seats.find(s => s.id === target.id);
    const from = fig ? fig.position.clone() : seat ? seat.pos.clone() : this.stage.claudiaPos.clone();
    const mesh = FinaleScene.pouchModel();
    mesh.position.copy(from).setY(from.y + 1.05);
    this.stage.scene.add(mesh);
    // `holder` is whoever has it: a figure, 'me' (the camera), or Claudia
    this._pouch = { mesh, t: 0, state: 'carry', from: mesh.position.clone(), holder: fig || (target.local ? 'me' : null) };
    if (fig) Figure.setHolding(fig, true);
  }

  /* The pouch itself: a velvet drawstring bag, gathered into folds at a
     cinched neck with a ruffle above it, a gold cord tied round the neck
     with its two ends hanging down the front to little tassels, a band
     of gold thread round the belly and a red wax seal on the front with
     the dagger pressed into it. About the size of two fists. */
  static pouchModel() {
    const g = new THREE.Group();
    g.name = 'pouch';
    const prof = [[0.001, -0.112], [0.045, -0.109], [0.078, -0.096], [0.098, -0.066], [0.104, -0.03], [0.1, 0.006],
                  [0.088, 0.036], [0.066, 0.06], [0.04, 0.078], [0.027, 0.086], [0.03, 0.093], [0.046, 0.104],
                  [0.064, 0.121], [0.07, 0.132], [0.058, 0.136], [0.044, 0.13]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(prof, 36);
    // gathered folds: deepest at the neck and in the ruffle, gone at the bottom
    const pos = body.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.z, v.x), r = Math.hypot(v.x, v.z);
      if (r < 1e-4) continue;
      const gather = THREE.MathUtils.smoothstep(v.y, -0.07, 0.08) * (v.y > 0.09 ? 1.6 : 1);
      const k = 1 + gather * (0.09 * Math.sin(a * 11 + v.y * 18) + 0.04 * Math.sin(a * 5 - v.y * 30))
              + 0.025 * Math.sin(a * 3 + 1.7) * (1 - gather);
      pos.setXYZ(i, v.x * k, v.y + gather * 0.004 * Math.sin(a * 11), v.z * k);
    }
    body.computeVertexNormals();
    const velvet = EstateMaterials.material('upholstery', { color: '#8f1d35', roughness: .88 });
    EstateMaterials.uv(body, .12);
    if (velvet.bumpScale !== undefined) velvet.bumpScale = .002;
    const bag = new THREE.Mesh(body, velvet);
    g.add(bag);
    const gold = new THREE.MeshStandardMaterial({ color: '#d4ab4c', roughness: .45, metalness: .55 });
    const cordMat = new THREE.MeshStandardMaterial({ color: '#cfa64a', roughness: .7, metalness: .25 });
    // the cord round the neck, pulled tight, and the knot at the front
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0065, 6, 28), cordMat);
    neck.rotation.x = Math.PI / 2; neck.position.y = 0.086;
    g.add(neck);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), cordMat);
    knot.position.set(0, 0.084, 0.033);
    g.add(knot);
    // its two ends, hanging down the front and swinging out a little
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.084, 0.034),
        new THREE.Vector3(side * 0.014, 0.06, 0.06),
        new THREE.Vector3(side * 0.024, 0.02, 0.09),
        new THREE.Vector3(side * 0.03, -0.022, 0.104),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.0045, 6, false), cordMat));
      const end = curve.getPoint(1);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0075, 0.012, 8), gold);
      cap.position.copy(end).add(new THREE.Vector3(0, -0.006, 0));
      g.add(cap);
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.03, 10, 1, true), cordMat);
      tassel.position.copy(end).add(new THREE.Vector3(0, -0.026, 0.001));
      tassel.rotation.x = Math.PI;
      g.add(tassel);
    }
    // a band of gold thread round the belly
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.0028, 4, 48), gold);
    band.rotation.x = Math.PI / 2; band.position.y = -0.045;
    band.scale.set(1.03, 1.03, 1);
    g.add(band);
    // the seal: an uneven puddle of red wax with a rim, and a dagger in it
    const wax = new THREE.MeshStandardMaterial({ color: '#74101c', roughness: .38, metalness: .05 });
    const sealG = new THREE.CylinderGeometry(0.026, 0.028, 0.008, 18);
    const sp = sealG.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      v.fromBufferAttribute(sp, i);
      const a = Math.atan2(v.z, v.x), r = Math.hypot(v.x, v.z);
      if (r > 0.02) { const k = 1 + 0.08 * Math.sin(a * 5 + 0.6) + 0.05 * Math.sin(a * 9); sp.setX(i, v.x * k); sp.setZ(i, v.z * k); }
    }
    sealG.computeVertexNormals();
    const seal = new THREE.Group();
    seal.add(new THREE.Mesh(sealG, wax));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0018, 4, 24), wax);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.0045;
    seal.add(rim);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.002, 0.026), wax);
    blade.position.set(0, 0.0048, 0.002);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.003), wax);
    guard.position.set(0, 0.0048, -0.008);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 6, 4), wax);
    pommel.position.set(0, 0.0045, -0.013);
    seal.add(blade, guard, pommel);
    // stood on the front of the bag, tipped to its curve, the dagger point down
    seal.rotation.set(Math.PI / 2 - 0.12, 0, Math.PI);
    seal.position.set(0, -0.012, 0.1);
    g.add(seal);
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return g;
  }

  /* The way round to her. Out behind the circle, round its back on
     whichever side they stand, and in at her elbow on that side: the
     fire, the stones round it and everybody else in the circle stay
     inside the path. The same on every screen, from the seating alone. */
  _routeTo(from, side) {
    const st = this.stage, c = st.claudiaPos;
    const out = Math.max(3.4, ...st.seats.map(s => Math.hypot(s.home.x, s.home.z))) + 0.6;
    const spot = new THREE.Vector3(c.x + side * 0.82, c.y, c.z + 0.22);
    const a0 = Math.atan2(from.z, from.x), a1 = Math.atan2(spot.z, spot.x);
    const TAU = Math.PI * 2;
    // +1 goes round through +x (the angle falling), -1 through -x (rising)
    let d = a1 - a0;
    if (side > 0) { while (d > 0) d -= TAU; while (d <= -TAU) d += TAU; }
    else { while (d < 0) d += TAU; while (d >= TAU) d -= TAU; }
    const pts = [from.clone()];
    const steps = Math.max(2, Math.ceil(Math.abs(d) / 0.28));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + d * k / steps;
      pts.push(new THREE.Vector3(Math.cos(a) * out, 0, Math.sin(a) * out));
    }
    pts.push(spot);
    return pts;
  }

  /* Off they go, with it in their hand. Returns how long until they are
     at her elbow. Somebody else walks as a figure; you walk as the
     camera, still free to look about. */
  _bringPouch(target) {
    const st = this.stage;
    const seat = st.seats.find(s => s.id === target.id);
    if (!seat) return 1.5;
    const fig = st.figureOf(target.id);
    const from = fig ? fig.position.clone() : seat.home.clone();
    const side = from.x >= 0 ? 1 : -1;
    const pts = this._routeTo(from, side);
    this._handSide = side;
    const c = st.claudiaPos;
    if (fig) {
      st.lookAt(fig.position);                 // she watches them come, all the way
      return st.walkPath(target.id, pts, { speed: POUCH_WALK_SPEED, pause: POUCH_WALK_PAUSE, sit: false, face: c });
    }
    if (target.local && st.rig) {
      st.lookAt(st.rig.pos);
      return this._walkMe(pts);
    }
    return 1.5;
  }

  _walkBack(target) {
    const st = this.stage;
    const seat = st.seats.find(s => s.id === target.id);
    if (!seat) return;
    const fig = st.figureOf(target.id);
    const here = fig ? fig.position.clone() : st.rig ? st.rig.pos.clone() : null;
    if (!here) return;
    const pts = this._routeTo(seat.home.clone(), this._handSide || 1).reverse();
    pts[0] = here;
    pts[pts.length - 1] = seat.home.clone();
    if (fig) {
      Figure.setHolding(fig, false);
      Figure.reachTo(fig, null);
      st.walkPath(target.id, pts, { speed: POUCH_WALK_SPEED, pause: 0.35, sit: false, face: st.claudiaPos });
    } else if (target.local) this._walkMe(pts, 0.35);
    st.lookAt(null);
  }

  /* You, walked: the first-person rig carried along the path at a
     walking pace, the view turning gently toward her as you go. */
  _walkMe(pts, pause = POUCH_WALK_PAUSE) {
    let dist = 0;
    for (let k = 1; k < pts.length; k++) dist += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
    this._meWalk = { pts: pts.map(q => q.clone()), k: 1, pause };
    return dist / POUCH_WALK_SPEED + pause + 0.2;
  }

  _stepMe(dt) {
    const w = this._meWalk, st = this.stage;
    if (!w || !st || !st.rig) return;
    const rig = st.rig;
    if (w.pause > 0) { w.pause -= dt; return; }
    let mv = POUCH_WALK_SPEED * dt;
    while (mv > 0 && w.k < w.pts.length) {
      const to = w.pts[w.k];
      const dx = to.x - rig.pos.x, dz = to.z - rig.pos.z, d = Math.hypot(dx, dz);
      if (d <= mv) { rig.pos.x = to.x; rig.pos.z = to.z; w.k++; mv -= d; }
      else { rig.pos.x += dx / d * mv; rig.pos.z += dz / d * mv; mv = 0; }
    }
    rig.pos.y = st.land.heightAt(rig.pos.x, rig.pos.z);
    rig.vel.set(0, 0, 0);
    const c = st.claudiaPos;
    const want = Math.atan2(-(c.x - rig.pos.x), -(c.z - rig.pos.z));
    rig.yaw = U.angLerp(rig.yaw, want, 1 - Math.exp(-1.6 * dt));
    if (w.k >= w.pts.length) this._meWalk = null;
  }

  // from their hand into hers, over half a second
  _passPouch() {
    const p = this._pouch;
    if (!p) return;
    p.state = 'pass';
    p.t = 0;
    p.from = p.mesh.position.clone();
    if (p.holder && p.holder !== 'me') Figure.reachTo(p.holder, this._claudiaHand().clone());
    Figure.reachTo(this.stage.claudia, p.from.clone());
  }

  // where the pouch is in your hand, held out a little in front of your eyes
  _myHand(out) {
    const st = this.stage;
    // over a scripted shot the camera is not you: hold it where your hand would be
    if (st.cinematic && st.rig) {
      const c = st.claudiaPos, r = st.rig.pos;
      const dx = c.x - r.x, dz = c.z - r.z, d = Math.hypot(dx, dz) || 1;
      return out.set(r.x + dx / d * 0.32, r.y + 1.05, r.z + dz / d * 0.32);
    }
    const cam = st.camera;
    cam.getWorldDirection(this._dir || (this._dir = new THREE.Vector3()));
    const dir = this._dir;
    const right = (this._right || (this._right = new THREE.Vector3())).set(-dir.z, 0, dir.x).normalize();
    return out.copy(cam.position).addScaledVector(dir, 0.55).addScaledVector(right, 0.16).add(new THREE.Vector3(0, -0.3, 0));
  }

  // where the thing in her hand is this frame, whatever she is doing
  _claudiaHand() {
    return Figure.handAt(this.stage.claudia, this._hand);
  }

  _throwPouch() {
    const p = this._pouch;
    if (!p) return;
    p.state = 'throw';
    p.t = 0;
    p.from = p.mesh.position.clone();
    const fire = this.stage.fire;
    p.to = fire ? fire.position.clone().setY(fire.position.y + 0.55)
                : new THREE.Vector3(0, this.stage.summitY + 0.5, 0);
  }

  _clearPouch() {
    const p = this._pouch;
    if (!p) return;
    this._pouch = null;
    if (this.stage) {
      this.stage.scene.remove(p.mesh);
      Figure.setHolding(this.stage.claudia, false);
      Figure.reachTo(this.stage.claudia, null);
      if (p.holder && p.holder !== 'me') { Figure.setHolding(p.holder, false); Figure.reachTo(p.holder, null); }
    }
    Engine.disposeObject(p.mesh);
  }

  /* Four states, and three of them are just "wherever her hand is".
     Tracking the hand rather than a fixed point is what makes the throw
     read: the pouch goes back with the wind-up and comes through with
     the arm, because it is being carried by it. */
  _updatePouch(dt) {
    const p = this._pouch;
    if (!p) return;
    p.t += dt;

    if (p.state === 'carry') {
      // in the hand of whoever is bringing it, wherever they have got to
      if (p.holder === 'me') this._myHand(p.mesh.position);
      else if (p.holder) Figure.handAt(p.holder, p.mesh.position);
      p.mesh.rotation.y += dt * 0.8;
    } else if (p.state === 'pass') {
      // hand to hand: a short reach, never a throw
      const k = U.clamp(p.t / POUCH_PASS_SECS, 0, 1);
      const e = k * k * (3 - 2 * k);
      p.mesh.position.lerpVectors(p.from, this._claudiaHand(), e);
      p.mesh.position.y += Math.sin(e * Math.PI) * 0.05;
      if (k >= 1) {
        p.state = 'held';
        if (p.holder && p.holder !== 'me') Figure.reachTo(p.holder, null);
        Figure.reachTo(this.stage.claudia, null);
      }
    } else if (p.state === 'held' || p.state === 'wind') {
      p.mesh.position.copy(this._claudiaHand());
      p.mesh.rotation.y += dt * 0.55;
    } else if (p.state === 'throw') {
      const k = U.clamp(p.t / 0.72, 0, 1);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * 1.15;      // a real arc
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.z += dt * 5;
      if (k >= 1) this._clearPouch();
    }
  }

  update(dt, t) {
    if (!this.stage) return;
    this.stage.update(dt);
    if (this._wx) this._wx.step(dt);
    this._stepMe(dt);
    this._updatePouch(dt);
    this._updateEmbers(dt);

    /* The fire cools back to firelight after a reveal. It holds the
       colour for a beat first — a column that starts shrinking while
       she is still drawing breath undoes the whole thing. */
    if (this._settle && this.stage.fire) {
      this._settle.t += dt;
      const k = U.clamp((this._settle.t - 1.1) / 5.5, 0, 1);
      const fire = this.stage.fire;
      fire.userData.light.color.copy(this._settle.from).lerp(fire.userData.base.colour, k);
      fire.userData.light.distance = U.lerp(90, 34, k);
      if (this._settle.t > 0.9) {
        fire.userData.want = U.lerp(fire.userData.want, 1.25, 1 - Math.exp(-1.1 * dt));
      }
      if (k >= 1) this._settle = null;
    }
  }

  dispose() {
    this._alive = false;
    this._waits.forEach(cancel => { try { cancel(false); } catch (e) {} });
    this._waits.clear();
    if (this._offNet) { this._offNet(); this._offNet = null; }
    this._closeVote();
    RoomUI.hideAll();
    Scenes.Drama.end(this.stage, null);
    if (this.music) { this.music.stop(1.2); this.music = null; }
    if (this.wind) { this.wind.stop(); this.wind = null; }
    if (this._wx) { this._wx.stop(); this._wx = null; }
    this._endHeldBeat();
    this._clearEmbers();
    if (this._pouch) { Engine.disposeObject(this._pouch.mesh); this._pouch = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
