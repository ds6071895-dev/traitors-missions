/* ------------------------------------------------------------------
   fireplace.js — the endgame.

   Night, the crest, a fire, and the one question the whole show is
   built to arrive at: which of the three of you is it. Everything that
   has happened up to here has been earning money; this is the only
   part where anything is at stake.

   There used to be a Fire of Truth in front of that — end the game, or
   banish again, unanimous to stop — and it went when the last night
   with no Traitor in it did. "Shall we bother" is not a question worth
   asking twice a round when the answer is always yes.

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
    this.stage = Stage.build({
      seed: s.seed + 404,
      hour: 'night',
      dress: 'fire',
      players: s.players,
    });
    this.stage.setShot('wide', { cut: true });
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
    this.music = Music.finale();
    this.wind = AudioBus.wind();
    if (this.wind) this.wind.set(0.14);

    // the tally has to land vote by vote, so it is driven by events
    this._offNet = Net.on((e) => {
      if (e.type === 'vote') {
        // a vote is a string stab in the key, one chord tone higher
        // each time; the old blip is for a night with no band
        const n = this._tallyCount++;
        if (this.music && this.music.ok) this.music.stinger('vote', { at: 'beat', n });
        else AudioBus.play('vote-in', { index: n });
        this._paintTally();
      }
      else if (e.type === 'tally') this._paintTally();
    });
    this._tallyCount = 0;

    /* Everything waits on one question, exactly as it does at the round
       table: is anybody about to be exposed? If somebody left a task
       unfinished out on that mission, the fire never gets lit as a
       ballot at all — Claudia stops the room and the night is over. */
    this._exposure().then((e) => {
      if (!this._alive) return;
      if (e && e.playerId) {
        Scenes.run(Exposed.beats(this, e, Session.state.seed), this);
        return;
      }
      this._drive();
    });
  }

  _exposure() {
    if (Session.state.exposure && Session.state.exposure.checked) {
      return Promise.resolve(Session.state.exposure);
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (ev) => { if (done) return; done = true; off(); resolve(ev); };
      const off = Net.on((ev) => {
        if (ev.type === 'expose') finish(ev);
        else if (Session.state.exposure && Session.state.exposure.checked) {
          finish(Session.state.exposure);
        }
      });
      this._waits.add(() => finish(null));
      Exposed.request();
      if (Session.state.exposure && Session.state.exposure.checked) {
        finish(Session.state.exposure);
      }
      setTimeout(() => finish(null), 4000);
    });
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
    this.music.setIntensity(0.7 + 0.2 * (n - 1));
    if (n > 1) this.music.stinger('floor-next', { at: 'bar' });
  }

  // a section of the fire's score, by name
  _cue(name, o) { if (this.music) this.music.section(name, o); }

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
    const lines = ClaudiaLines.beats(set, vars, seed);
    return Scenes.run(lines.map((b, i) => ({
      shot: i === 0 ? shot : null,
      line: { text: b.text, who: 'claudia' },
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
    await Scenes.run([{ shot: 'loch', cut: true, wait: 2.8 }], this);
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
    while (this._alive && Session.state.phase === 'finale' && guard++ < 32) {
      const stage = Session.state.finale.stage;
      if (stage === 'name') await this._name();
      else if (stage === 'names') await this._names();
      else if (stage === 'reveal') await this._reveal();
      else if (stage === 'pouches') await this._pouches();
      else break;
    }
    if (this._alive) await this._verdict();
  }

  /* The one ballot of the night. There used to be a Fire of Truth in
     front of it — end the game, or banish again — and the thirty
     seconds each lived inside that. There is always a Traitor now, so
     the only question left is who, and the floor moved here with it:
     everyone talks, then everyone names. */
  async _name() {
    const revote = Session.state.finale.nameRound > 0;
    if (revote) {
      // nobody knows, and the harmony does not either
      this._cue('ballot', { at: 'bar' });
      if (this.music) { this.music.setIntensity(1.1); this.music.stinger('tie', { at: 'beat' }); }
    }
    await this._say(revote ? 'voteNameTie' : 'voteName', {}, 'players');
    if (!this._alive || Session.state.finale.stage !== 'name') return;

    /* Talk first, name second — and one at a time. The board from the
       mission is up while they do it. A revote has already had its
       floor and goes straight back to the ballot. */
    if (!revote) {
      RoomUI.showBoard(Session.state.debrief);
      /* The floor: plucked, low, and ducking under anybody who talks.
         Every new speaker pushes it up a notch — see `_floorTurn`. */
      this._floorWho = null;
      this._floorN = 0;
      this._cue('floor', { at: 'bar', glide: 3 });
      if (this.music) { this.music.setIntensity(0.7); this.music.speakerDuck(true); }
      await this._say('floorOpen', {}, 'players');
      if (!this._alive) return;
      await this._floorRound();
      if (this.music) this.music.speakerDuck(false);
      RoomUI.hideBoard();
      if (!this._alive || Session.state.finale.stage !== 'name') return;
    }

    /* The ballot. The cello goes to sixteenths on the next bar line,
       with a cymbal swelling into it. */
    this._cue('ballot', { at: 'bar', fill: !revote });
    if (this.music && !revote) this.music.setIntensity(1);

    this._tallyCount = 0;
    const you = Session.state.players.find(p => p.local);
    const targets = Session.alive().filter(p => p.id !== you.id);
    this._openVote({
      kicker: (revote ? 'Banishment revote' : 'Round '
              + (this._round() + 1)),
      title: 'Who goes to the fire?',
      note: 'You cannot name yourself.',
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

      const voice = { pitch: 0.84 + (voter.seat % 3) * 0.15,
                      rate: 0.90 + (voter.seat % 2) * 0.09 };
      await Scenes.run([{
        shot: 'on:' + voter.id,
        line: { text: 'My vote is for ' + (target.local ? 'you' : target.name) + '.',
                speaker: voter.name, who: voter.id,
                pitch: voice.pitch, rate: voice.rate },
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
        role === 'traitor' ? 'revealTraitor' : 'revealFaithful', target),
      action: { type: 'reveal' },
      // a Traitor caught is a triumph; a Faithful burned is a lament
      after: (role) => role === 'traitor' ? 'afterTraitor' : 'afterFaithful',
    });
    if (!this._alive) return;

    if (Session.state.phase === 'finale' && Session.state.finale.stage === 'name') {
      await this._say('againAfterFaithful', {}, 'players');
    }
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
        after: () => last ? 'afterTraitor' : 'lastPouches',
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

    // she asks for it, and it comes to her
    await this._say(spec.intro, { name: target.name }, 'on:' + target.id, salt);
    if (!this._alive) return;

    this._spawnPouch(target);
    this.stage.setShot('claudiaSide');
    // she watches whoever is handing it over, right up until she has it
    const seat = this.stage.seats.find(st => st.id === target.id);
    this.stage.lookAt(seat ? seat.pos : null);
    await Scenes.wait(1.5);
    if (!this._alive) return this._abort();

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
       on the fire — four things all saying the same thing, which is
       that nothing else is going to happen until this does. The last
       pouch of the night is held longest. */
    Voice.clear();
    const hold = spec.last ? 2.4 : 1.5;
    this._cue('held', { at: 'now', glide: 0.3 });
    this._riser = this.music ? this.music.riser(hold + Figure.THROW_AT * 0.95) : null;
    this.stage.setCinematic(true, 'fireTight', { speed: 0.32 });
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

    // it is allowed to just burn for a while
    await Scenes.wait(2.6);
    Scenes.Cine.card(null);
    await Scenes.wait(0.3);
    if (!this._alive) return;

    this.stage.setCinematic(false);
    await this._say(spec.reveal(role), { name: target.name }, 'claudia', salt);
    await Scenes.barrier(ceremonyKey + '-complete');
    this.stage.lookAt(null);
  }

  /* The held beat, ended. It is its own method because three things end
     it — the answer arriving, the scene being torn down, and a
     ceremony abandoned part way through — and a riser left climbing
     after a scene has gone is the one that would be noticed. */
  _endHeldBeat() {
    if (this._riser) { try { this._riser.stop(); } catch (e) {} this._riser = null; }
  }

  // a ceremony that will not be finishing: stop everything it started
  _abort() {
    this._endHeldBeat();
    if (this.music) this.music.silence(false);
    this._clearPouch();
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
    const out = Reveal.flare({
      role,
      stage: this.stage,
      music: this.music,
      after: this._after ? this._after(role) : undefined,
      playerId: e && e.playerId,
    });
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
                  : (o.won ? (o.hadTraitor ? 'wonFaithful' : 'wonFaithfulClean') : 'lostFaithful'));

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
        Net.send(Object.assign({ playerId: you.id }, opt.action));
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
    const cast = f.stage === 'name' ? f.names : f.votes;
    wrap.innerHTML = Session.alive().map(p => {
      const inYet = !!cast[p.id];
      return `<span class="vt ${inYet ? 'in' : ''}">${p.name}`
           + `<i>${inYet ? 'decided' : 'thinking…'}</i></span>`;
    }).join('');
  }

  /* ---------------- the pouch ---------------- */

  _spawnPouch(target) {
    const seat = this.stage.seats.find(s => s.id === target.id);
    const from = seat ? seat.pos.clone() : this.stage.claudiaPos.clone();
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.10, 0),
      EstateMaterials.material('upholstery', { color: '#b52d4b', roughness: .9 }));
    EstateMaterials.uv(mesh.geometry,.12);
    mesh.material.bumpScale=.002;
    const tie = new THREE.Mesh(
      new THREE.TorusGeometry(0.062, 0.016, 3, 7),
      new THREE.MeshLambertMaterial({ color: '#d8b24a', flatShading: true }));
    tie.rotation.x = Math.PI / 2;
    tie.position.y = 0.085;
    mesh.add(tie);
    mesh.scale.set(1, 1.25, 1);
    mesh.position.copy(from).setY(from.y + 1.05);
    this.stage.scene.add(mesh);
    this._pouch = { mesh, t: 0, state: 'carry', from: mesh.position.clone() };
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
      // out of their hands and into hers, over a second and a half
      const k = U.clamp(p.t / 1.5, 0, 1);
      const e = k * k * (3 - 2 * k);
      p.mesh.position.lerpVectors(p.from, this._claudiaHand(), e);
      p.mesh.position.y += Math.sin(e * Math.PI) * 0.16;
      p.mesh.rotation.y += dt * 1.1;
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
    if (this.music) { this.music.stop(1.2); this.music = null; }
    if (this.wind) { this.wind.stop(); this.wind = null; }
    this._endHeldBeat();
    this._clearEmbers();
    if (this._pouch) { Engine.disposeObject(this._pouch.mesh); this._pouch = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
