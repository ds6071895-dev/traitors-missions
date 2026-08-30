/* ------------------------------------------------------------------
   fireplace.js — the endgame.

   Night, the crest, a fire, and the two questions the whole show is
   built to arrive at: end it, or banish one more. Everything that has
   happened up to here has been earning money; this is the only part
   where anything is at stake.

   The scene is a loop rather than a script, because the number of
   rounds depends on what burns, so it is written as an async driver
   over the session's own stages instead of a beat list. Every step
   waits on the *session* — never on a timer that hopes the session has
   caught up — which is also what will make it correct when the votes
   are arriving over a wire instead of from `bots.js` next door.

   The pouch is the one piece of real theatre, and it carries two kinds
   of answer. First Claudia burns every decision pouch, end-game choices
   first, to reveal the ballot person by person. A banishment later
   opens the role pouch of whoever was named. Ending the game opens
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
   physical event and a chord alone does not have a floor. */

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

/* The riser. Started when she winds up and left to climb until the
   pouch lands: a noise sweep going up under a saw doing the same, and
   the whole point of it is that it is cut off rather than resolved. */
AudioBus.define('pouch-riser', (ctx, dest, o = {}) => {
  const t = ctx.currentTime;
  const dur = o.dur || 4.0;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.75);
  g.gain.exponentialRampToValueAtTime(0.30, t + dur);
  g.connect(dest);

  const n = AudioBus.noiseSource();
  let bp = null;
  if (n) {
    bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 5.5;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(7200, t + dur);
    n.connect(bp); bp.connect(g);
    n.start(t); n.stop(t + dur + 0.6);
  }
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(41.2, t);
  osc.frequency.exponentialRampToValueAtTime(330, t + dur);
  const og = ctx.createGain(); og.gain.value = 0.22;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.exponentialRampToValueAtTime(4000, t + dur);
  osc.connect(lp); lp.connect(og); og.connect(g);
  osc.start(t); osc.stop(t + dur + 0.6);

  return {
    // cut, not faded: the silence is the point
    stop() {
      const tt = ctx.currentTime;
      g.gain.cancelScheduledValues(tt);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.07);
      try { if (n) n.stop(tt + 0.12); osc.stop(tt + 0.12); } catch (e) {}
    },
  };
});

AudioBus.define('heartbeat', (ctx, dest) => {
  const t = ctx.currentTime;
  for (const [at, amp] of [[0, 0.30], [0.21, 0.20]]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(78, t + at);
    o.frequency.exponentialRampToValueAtTime(34, t + at + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(amp, t + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.26);
    o.connect(g); g.connect(dest);
    o.start(t + at); o.stop(t + at + 0.3);
  }
});

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
    this._heart = 0;
    this._heartOn = false;
    this._riser = null;
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
    this.music = Music.verdict();
    if (this.music) this.music.setGear(0, 3);
    this.wind = AudioBus.wind();
    if (this.wind) this.wind.set(0.14);

    // the tally has to land vote by vote, so it is driven by events
    this._offNet = Net.on((e) => {
      if (e.type === 'vote') { AudioBus.play('vote-in', { index: this._tallyCount++ }); this._paintTally(); }
      else if (e.type === 'tally') this._paintTally();
    });
    this._tallyCount = 0;
    this._drive();
  }

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
    await this._say('fireOpen', { pot: U.money(s.pot) }, 'wide');
    if (!this._alive) return;
    await this._say('fireRules', {}, 'claudia');
    if (!this._alive) return;
    await this._say('fireWarn', {}, 'claudiaTight');

    let guard = 0;
    while (this._alive && Session.state.phase === 'finale' && guard++ < 32) {
      const stage = Session.state.finale.stage;
      if (stage === 'decide') await this._decide();
      else if (stage === 'decisions') await this._decisions();
      else if (stage === 'name') await this._name();
      else if (stage === 'names') await this._names();
      else if (stage === 'reveal') await this._reveal();
      else if (stage === 'pouches') await this._pouches();
      else break;
    }
    if (this._alive) await this._verdict();
  }

  async _decide() {
    if (this.music) this.music.setGear(Math.min(2, 1 + this._round()), 3);
    const two = Session.alive().length <= 2;
    await this._say(two ? 'voteDecideTwo' : 'voteDecide', {}, 'fire');
    if (!this._alive || Session.state.finale.stage !== 'decide') return;

    this._tallyCount = 0;
    this._openVote({
      kicker: 'Round ' + (this._round() + 1),
      title: 'End the game, or banish?',
      note: 'Everyone must choose End Game. One Banish vote continues. '
          + U.money(Session.state.pot) + ' on the table.',
      options: [
        { label: 'END THE GAME', sub: 'Split the pot with whoever is left',
          tone: 'end', action: { type: 'vote', choice: 'end' } },
        { label: 'BANISH', sub: 'Name one more, and open their pouch',
          tone: 'banish', action: { type: 'vote', choice: 'banish' } },
      ],
    });

    await this._waitFor(() => Session.state.finale.stage !== 'decide'
                           || Session.state.phase !== 'finale');
    this._closeVote();
    await Scenes.wait(1.1);
  }

  /* Nobody's decision is shown until the whole ballot is in. Claudia
     then takes every decision pouch herself, with END GAME pouches
     first and BANISH AGAIN pouches after them. The authority owns that
     ordering; this scene simply walks the queue it is given. */
  async _decisions() {
    await this._say('decisionPouches', {}, 'players');
    if (!this._alive || Session.state.finale.stage !== 'decisions') return;

    let guard = 0;
    while (this._alive && guard++ < 8
           && Session.state.phase === 'finale'
           && Session.state.finale.stage === 'decisions') {
      const f = Session.state.finale;
      const playerId = f.decisionQueue[0];
      const target = Session.playerById(playerId);
      const choice = f.votes[playerId];
      if (!target || (choice !== 'end' && choice !== 'banish')) break;
      await this._decisionCeremony(target, choice, f.decisionsShown.length + 1);
      if (!this._alive) return;
      await Scenes.wait(0.45);
    }
  }

  async _name() {
    const revote = Session.state.finale.nameRound > 0;
    await this._say(revote ? 'voteNameTie' : 'voteName', {}, 'players');
    if (!this._alive || Session.state.finale.stage !== 'name') return;

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
    let guard = 0;
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
        hold: 0.65,
      }], this);
      if (!this._alive) return;

      const before = voter.id;
      Net.send({ type: 'speakName', playerId: voter.id });
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
    });
    if (!this._alive) return;

    if (Session.state.phase === 'finale' && Session.state.finale.stage === 'decide') {
      await this._say('againAfterFaithful', {}, 'players');
    }
  }

  /* Ending the game: everybody's, one at a time, and yours last. The
     loop reads the queue back off the session every time round rather
     than snapshotting it, because the session is the thing that knows
     how many are left and it is the thing that will be a server. */
  async _pouches() {
    const f = Session.state.finale;
    if (this.music) { this.music.setGear(2, 2); }
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
      });
      if (!this._alive) return;
      await Scenes.wait(0.7);
    }
  }

  /* A decision pouch carries no role. Its colour only says whether its
     owner chose END GAME or BANISH AGAIN, so it gets a smaller reveal
     than a role pouch and never leaks hidden role information. */
  async _decisionCeremony(target, choice, salt) {
    const claudia = this.stage.claudia;
    const intro = this._setFor('decisionPouchIntro', target);

    await this._say(intro, { name: target.name }, 'on:' + target.id, salt);
    if (!this._alive) return;

    this._spawnPouch(target);
    this.stage.setShot('claudiaSide');
    const seat = this.stage.seats.find(st => st.id === target.id);
    this.stage.lookAt(seat ? seat.pos : null);
    await Scenes.wait(1.25);
    if (!this._alive) return this._abort();

    Figure.setHolding(claudia, true);
    if (this._pouch) this._pouch.state = 'held';
    await this._say('decisionPouchThrow', { name: target.name }, 'claudiaTight', salt);
    if (!this._alive) return this._abort();

    Voice.clear();
    if (this.music) { this.music.duck(0.14, 1.5); }
    this._heartOn = true;
    this._riser = AudioBus.play('pouch-riser', { dur: 2.0 });
    this.stage.setCinematic(true, 'fireTight', { speed: 0.45 });
    await Scenes.wait(0.75);
    if (!this._alive) return this._abort();

    this.stage.lookAt(this.stage.fire ? this.stage.fire.position : null);
    Figure.throwNow(claudia, 0.8);
    if (this._pouch) this._pouch.state = 'wind';
    await Scenes.wait(Figure.THROW_AT * 0.8);
    if (!this._alive) return this._abort();

    this._throwPouch();
    AudioBus.play('pouch-toss');
    Figure.setHolding(claudia, false);
    this.stage.setShot('fireHero', { speed: 0.9 });
    await Scenes.wait(0.78);

    await this._burnDecision(target.id);
    if (!this._alive) return this._abort();
    await Scenes.wait(1.35);
    Scenes.Cine.card(null);
    this.stage.setCinematic(false);
    await this._say(choice === 'end' ? 'decisionEnd' : 'decisionBanish',
                    { name: target.name }, 'on:' + target.id, salt);
    this.stage.lookAt(null);
  }

  _burnDecision(playerId) {
    return new Promise((resolve) => {
      let cancel = null;
      const off = Net.on((e) => {
        if (e.type !== 'decision' || e.playerId !== playerId) return;
        off();
        if (cancel) this._waits.delete(cancel);
        this._decisionFlare(e.choice, e);
        resolve(e.choice);
      });
      cancel = () => { off(); this._waits.delete(cancel); resolve('end'); };
      this._waits.add(cancel);
      Net.send({ type: 'decisionPouch', playerId });
    });
  }

  _decisionFlare(choice, e) {
    const ending = choice === 'end';
    const col = ending ? '#45e58c' : '#ef294c';
    const deep = ending ? '#178c55' : '#8c0a1c';
    this._endHeldBeat();
    AudioBus.play('fire-whoosh', { big: false });
    AudioBus.play('vote-in', { index: (e && e.index) || 0 });
    Input.rumble(0.42, 300);
    Input.haptic(35);
    if (this.music) this.music.duck(0.9, 0.16);

    const fire = this.stage.fire;
    if (fire) {
      fire.userData.want = 3.2;
      fire.userData.light.color.set(col);
      fire.userData.light.distance = 62;
      fire.userData.flames.forEach((fl, i) => {
        fl.material.color.set(i < 2 ? col : deep);
        fl.material.opacity = 1;
      });
      this._settle = { t: 0, from: new THREE.Color(col) };
      this._burstEmbers(col, 0.42);
    }
    this.stage.shake(0.48);

    const p = e && Session.playerById(e.playerId);
    Scenes.Cine.card({
      kicker: p ? p.name + ' chose' : 'The pouch says',
      title: ending ? 'END GAME' : 'BANISH AGAIN',
      tone: ending ? 'faithful' : 'traitor',
    });
  }

  /* ---------------- the ceremony ----------------
     One pouch, start to finish. Everything that differs between a
     banishment and the last pouches of the night is in `spec`. */

  async _ceremony(target, spec) {
    const claudia = this.stage.claudia;

    const salt = spec.salt | 0;

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

    /* The held beat. The score drops to a pulse, the subtitle goes, the
       riser starts, and the camera creeps in on the fire — four things
       all saying the same thing, which is that nothing else is going to
       happen until this does. */
    Voice.clear();
    if (this.music) { this.music.setGear(0, 0.5); this.music.duck(0.07, 4.2); }
    this._heartOn = true;
    this._riser = AudioBus.play('pouch-riser', { dur: 3.4 });
    this.stage.setCinematic(true, 'fireTight', { speed: 0.32 });
    await Scenes.wait(1.5);
    if (!this._alive) return this._abort();

    // the throw itself, with the pouch leaving her hand at the release
    this.stage.lookAt(this.stage.fire ? this.stage.fire.position : null);
    Figure.throwNow(claudia, 0.95);
    if (this._pouch) this._pouch.state = 'wind';
    await Scenes.wait(Figure.THROW_AT * 0.95);
    if (!this._alive) return this._abort();

    this._throwPouch();
    AudioBus.play('pouch-toss');
    Figure.setHolding(claudia, false);
    // down in the grass, looking up the flame, for what comes out of it
    this.stage.setShot('fireHero', { speed: 0.85 });
    await Scenes.wait(0.85);

    // the answer
    const role = await this._burn(spec.action);
    if (!this._alive) return this._abort();

    // it is allowed to just burn for a while
    await Scenes.wait(2.6);
    Scenes.Cine.card(null);
    await Scenes.wait(0.3);
    if (!this._alive) return;

    this.stage.setCinematic(false);
    await this._say(spec.reveal(role), { name: target.name }, 'claudia', salt);
    this.stage.lookAt(null);
  }

  /* The held beat, ended. It is its own method because three things end
     it — the answer arriving, the scene being torn down, and a
     ceremony abandoned part way through — and a riser left climbing
     after a scene has gone is the one that would be noticed. */
  _endHeldBeat() {
    this._heartOn = false;
    if (this._riser) { try { this._riser.stop(); } catch (e) {} this._riser = null; }
  }

  // a ceremony that will not be finishing: stop everything it started
  _abort() {
    this._endHeldBeat();
    this._clearPouch();
    if (this.stage) this.stage.setCinematic(false);
  }

  // dispatch the reveal and wait for the authority to say what it was
  _burn(action) {
    return new Promise((resolve) => {
      const off = Net.on((e) => {
        if (e.type !== 'reveal') return;
        off();
        this._flare(e.role, e);
        resolve(e.role);
      });
      this._waits.add(() => { off(); resolve('faithful'); });
      Net.send(action || { type: 'reveal' });
    });
  }

  /* The answer. Everything lands on the same frame — the colour, the
     column, the sub, the shake and the card — because a reveal that
     arrives in instalments is a reveal you have already guessed. What
     comes *after* it is staggered instead: the embers, the second
     flash, the settle. */
  _flare(role, e) {
    const traitor = role === 'traitor';
    const col = traitor ? '#ff1f3a' : '#5cffa0';
    const deep = traitor ? '#8c0a1c' : '#1f9c62';

    this._endHeldBeat();
    AudioBus.play('fire-whoosh', { big: true });
    AudioBus.play(traitor ? 'reveal-traitor' : 'reveal-faithful');
    Input.rumble(traitor ? 1 : 0.7, traitor ? 900 : 480);
    Input.haptic(traitor ? 110 : 50);

    if (this.music) {
      /* The held beat ducked the score to almost nothing over four
         seconds and it is only part way back. Undo that first — a
         reveal that lands while the band is still fading up is a reveal
         that lands on nothing — then straight to top gear with no
         glide, because a crossfade is a thing you notice. */
      this.music.duck(0.95, 0.18);
      this.music.setGear(3, 0.15);
      this.music.setProgression(traitor ? 'dread' : 'hymn');
      this.music.stinger('reveal');
    }

    const fire = this.stage.fire;
    if (fire) {
      // a column, not a campfire: it comes back down over five seconds
      fire.userData.want = traitor ? 6.5 : 4.8;
      fire.userData.light.color.set(col);
      fire.userData.light.distance = 90;
      fire.userData.flames.forEach((fl, i) => {
        fl.material.color.set(i < 2 ? col : deep);
        fl.material.opacity = 1;
      });
      this._settle = { t: 0, from: new THREE.Color(col) };
      this._burstEmbers(col, traitor ? 1 : 0.72);
    }

    this.stage.shake(traitor ? 1.35 : 0.95);

    /* Two flashes: a hard white-hot one on the frame itself, and the
       colour bleeding back in behind it a tenth of a second later.
       One flash reads as a glitch; two read as an explosion. */
    const flash = document.getElementById('screen-flash');
    if (flash) {
      flash.style.transition = 'none';
      flash.style.background = traitor ? 'rgba(255,235,238,0.92)' : 'rgba(238,255,246,0.85)';
      flash.style.opacity = '1';
      setTimeout(() => {
        flash.style.transition = 'opacity .5s ease-out';
        flash.style.background = traitor ? 'rgba(255,20,50,0.5)' : 'rgba(90,255,160,0.38)';
      }, 70);
      setTimeout(() => { flash.style.opacity = '0'; }, 190);
      setTimeout(() => { flash.style.transition = ''; }, 900);
    }

    // and the word itself, over the top of all of it
    const p = e && Session.playerById(e.playerId);
    const who = p ? (p.local ? 'You were' : p.name + ' was') : 'The fire says';
    Scenes.Cine.card({
      kicker: who,
      title: traitor ? 'TRAITOR' : 'FAITHFUL',
      tone: traitor ? 'traitor' : 'faithful',
    });
  }

  /* ---------------- embers ----------------
     One buffer of points thrown up out of the fire and left to fall
     back through it. It is built per reveal and disposed on the next
     one, because there is never more than one going at a time and a
     pool would be more code than the thing it pools. */

  _burstEmbers(colour, strength) {
    this._clearEmbers();
    const fire = this.stage.fire;
    if (!fire) return;
    const N = Math.round(180 * strength);
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.283;
      const r = Math.random() * 0.42;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.6 + Math.random() * 0.8;
      pos[i * 3 + 2] = Math.sin(a) * r;
      // mostly up: the spread is what makes it a burst rather than a jet
      const up = 4.2 + Math.random() * 7.5 * strength;
      vel[i * 3] = Math.cos(a) * (0.6 + Math.random() * 2.6);
      vel[i * 3 + 1] = up;
      vel[i * 3 + 2] = Math.sin(a) * (0.6 + Math.random() * 2.6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const mat = new THREE.PointsMaterial({
      color: colour, size: 0.13, transparent: true, opacity: 1,
      depthWrite: false, map: FXTex.dotTexture(), sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    pts.position.copy(fire.position);
    this.stage.scene.add(pts);
    this._embers = { pts, geo, mat, vel, t: 0, life: 3.4 };
  }

  _updateEmbers(dt) {
    const em = this._embers;
    if (!em) return;
    em.t += dt;
    const p = em.geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += em.vel[i] * dt;
      p[i + 1] += em.vel[i + 1] * dt;
      p[i + 2] += em.vel[i + 2] * dt;
      em.vel[i + 1] -= 6.2 * dt;                 // gravity, gently
      em.vel[i] *= 1 - 1.1 * dt;                 // and air
      em.vel[i + 2] *= 1 - 1.1 * dt;
    }
    em.geo.attributes.position.needsUpdate = true;
    const k = U.clamp(em.t / em.life, 0, 1);
    em.mat.opacity = 1 - k * k;
    em.mat.size = 0.13 * (1 - k * 0.55);
    if (k >= 1) this._clearEmbers();
  }

  _clearEmbers() {
    const em = this._embers;
    if (!em) return;
    this._embers = null;
    if (this.stage) this.stage.scene.remove(em.pts);
    em.geo.dispose();
    em.mat.dispose();
  }

  async _verdict() {
    const o = Session.state.outcome;
    if (!o) return;
    this._closeVote();
    if (this.music) {
      this.music.setGear(o.won ? 2 : 1, 2);
      this.music.setProgression(o.won ? 'hymn' : 'dread');
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
      new THREE.MeshLambertMaterial({ color: '#6b1226', flatShading: true }));
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

    // the held beat, made audible
    if (this._heartOn) {
      this._heart -= dt;
      if (this._heart <= 0) { AudioBus.play('heartbeat'); this._heart = 1.05; }
    }

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
    if (this.music) { this.music.stop(1.2); this.music = null; }
    if (this.wind) { this.wind.stop(); this.wind = null; }
    this._endHeldBeat();
    this._clearEmbers();
    if (this._pouch) { Engine.disposeObject(this._pouch.mesh); this._pouch = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
