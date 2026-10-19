/* ------------------------------------------------------------------
   night.js — the poison takes.

   The house goes to bed, and everybody's screen goes somewhere
   different, which is the whole point of it:

     a Faithful        is in their own bedroom; the door swings shut
                       and locks, and that is the night — short, and
                       quiet, with the castle settling round them
     a Traitor         is in their own bedroom like everybody else, and a
                       quiet choice is put to them there: who carries
                       tomorrow's poison (if there are two of them), and —
                       only when they have lost one of their own —
                       whether to offer somebody a seat
     the offered       is woken with the offer, and may say no
     the poisoned      find out before anybody else does: a knock, and a
                       letter under the door
     the dead          watch the corridor, and hear nothing

   Nothing here decides anything. The buttons are actions, the session
   settles them in private, and every screen finds out only what its
   own private view says. The night is the same length every time,
   whatever was decided and whether or not anybody had to decide, so
   the clock is not a tell: a Faithful asleep and a Traitor deciding
   are on the same screen for the same time.
------------------------------------------------------------------ */
class NightScene extends CastleScene {

  stageOptions() {
    const s = Session.state;
    const me = s.players.find(p => p.local);
    const view = Session.myPrivate() || {};
    this._role = view.role || Session.myRole();
    this._dead = !me || !me.alive;
    this._traitor = !this._dead && this._role === 'traitor';
    const seed = s.seed + 4111 * (s.day + 1);
    if (this._dead) {
      return { seed, hour: 'night', room: 'corridor', dress: 'none', claudia: false, players: [] };
    }
    this._bed = 'bed' + (me.seat % 8);
    return { seed, hour: 'night', room: this._bed, dress: 'bedroom', claudia: false,
             players: [me] };
  }

  build() {
    const view = super.build();
    if (this._bed && this.stage) {
      // you walked in a moment ago: stand inside the door, facing the room
      const door = this.stage.land.doorAt && this.stage.land.doorAt(this._bed);
      if (door) {
        const into = Math.sign(-door.z) || 1;
        this.stage.rig.pos.set(door.x, 0, door.z + into * 1.0);
        this.stage.rig.yaw = into > 0 ? Math.PI : 0;
      }
    }
    return view;
  }

  async drive() {
    const s0 = Session.state;
    this.music = Music.murder('nightfall', Music.dayMusic(s0.seed, s0.day));
    this._quietCues = true;
    this._told = { offer: false, fate: false, recruited: false };

    if (this._bed) this._shut();
    /* The day's hardest worker is safe tonight, and the whole house is
       told so before anybody knows where the poison went. */
    const sh = s0.shield && s0.shield.day === s0.day ? Session.playerById(s0.shield.id) : null;
    if (sh) {
      if (this.music) this.music.stinger('shield', { at: 'beat' });
      Scenes.Cine.card({ kicker: 'The shield · ' + s0.shield.n + (s0.shield.n === 1 ? ' job' : ' jobs'),
                         title: sh.local ? 'YOU' : sh.name.toUpperCase(), tone: 'shield',
                         sub: sh.local ? 'The poison cannot take you tonight.' : 'The poison cannot take them tonight.' });
      await this._say(this._setFor('nightFallsShield', sh), { name: sh.name }, null);
      Scenes.Cine.card(null);
    } else await this._say('nightFalls', {}, null);
    if (!this._alive) return;

    if (this._dead) return this._watch();
    return this._bedroom();
  }

  /* The door, closing behind you, and the key. */
  _shut() {
    const land = this.stage && this.stage.land;
    if (!land || !land.setDoor) return;
    setTimeout(() => {
      if (!this._alive || !this.stage) return;
      land.setDoor(this._bed, true, false);
      AudioBus.play('door-shut');
      setTimeout(() => {
        if (!this._alive || !this.stage) return;
        land.setDoor(this._bed, true, true);
        AudioBus.play('key-turn');
        if (this.music) this.music.stinger('door-lock', { at: 'now' });
        Voice.show('', 'Your door is locked.');
        setTimeout(() => { if (this._alive && !Voice.speaking) Voice.clear(); }, 1800);
      }, 900);
    }, 600);
  }

  onEvent(e) {
    super.onEvent(e);
    if (e.type === 'private' || e.type === 'state') this._privateMoved();
  }

  /* Something only this screen may know has changed. */
  _privateMoved() {
    if (!this._alive) return;
    const v = Session.myPrivate() || {};
    if (this._traitor && v.night) this._paintChoice(v);
    if (v.offer && !this._told.offer) { this._told.offer = true; this._offer(v); }
    if (v.recruited && !this._told.recruited) { this._told.recruited = true; this._recruited(); }
    if (v.fate === 'murdered' && !this._told.fate) { this._told.fate = true; this._murdered(); }
  }

  /* ---------------- a Faithful's room ---------------- */

  async _bedroom() {
    /* A Traitor's choice comes up the moment the door is locked; it is
       not made to wait behind Claudia saying goodnight (the clock was
       running behind her and the choice was gone before it was asked). */
    const choice = this._traitor && (Session.myPrivate() || {}).night;
    if (choice && (choice.choose || choice.canRecruit)) return this._choose();
    await this._say('nightFaithful', {}, null);
    if (!this._alive) return;
    this._sleepCard();
    await this._waitFor(() => Session.state.phase !== 'night');
  }

  /* The dark, for as long as it lasts. It lasts the same time whether or
     not anybody is deciding anything, and this is what a Faithful sees
     all the way through it. */
  _sleepCard() {
    const s = Session.state;
    const safe = s.shield && s.shield.day === s.day && s.shield.id === (s.players.find(p => p.local) || {}).id;
    Scenes.Cine.card({ kicker: 'Night', title: 'THE CASTLE SLEEPS',
                       sub: safe ? 'You hold the shield. Whatever is in you, it will not take tonight.'
                                 : 'The poison is already in somebody.', tone: 'bad' });
    if (this.music) this.music.section('deed', { at: 'bar', glide: 4 });
  }

  _watch() {
    Scenes.Cine.card({ kicker: 'You are out of the game', title: 'NIGHT',
                       sub: 'The living cannot hear you. Watch.', tone: 'bad' });
    setTimeout(() => Scenes.Cine.card(null), 4000);
  }

  /* A seat, offered to the one person it is offered to. */
  async _offer(v) {
    Scenes.Cine.card(null);
    AudioBus.play('ui-click');
    if (this.music) this.music.stinger('murder-hit', { at: 'now' });
    // the answer is wanted while she is still talking: the offer is short
    const told = this._say('recruitOffer', {}, null);
    this._openVote({
      kicker: 'A knock at your door',
      title: 'Join the Traitors?',
      note: 'You may say no. Nobody will ever know you were asked.',
      options: [
        { label: 'JOIN THEM', sub: 'Become a Traitor', tone: 'end',
          action: { type: 'recruitAnswer', accept: true } },
        { label: 'REFUSE', sub: 'Stay Faithful', tone: 'banish',
          action: { type: 'recruitAnswer', accept: false } },
      ],
    });
    await this._waitFor(() => { const w = Session.myPrivate() || {}; return !w.offer; },
                        (v.offer && v.offer.endsAt ? Math.max(1000, v.offer.endsAt - Date.now()) : 20000) + 2000);
    this._closeVote();
    await told;
    if (this._alive && !this._told.recruited && Session.state.phase === 'night') this._sleepCard();
  }

  async _recruited() {
    this._closeVote();
    if (this.music) this.music.stinger('recruited', { at: 'now' });
    Scenes.Cine.card({ kicker: 'You accepted', title: 'YOU ARE A TRAITOR', tone: 'traitor',
                       sub: 'Look surprised at breakfast.' });
    await this._say('recruitedYou', {}, null);
    await this._sleep(2);
    Scenes.Cine.card(null);
  }

  async _murdered() {
    this._closeVote();
    await this._sleep(2);
    if (!this._alive) return;
    AudioBus.play('estate-door');
    await Scenes.Drama.hush(this.stage, this.music, null, { hold: 0.7 });
    if (!this._alive) return;
    Scenes.Drama.hit(this.stage, this.music, 'murder-hit', { shake: 0.5, flash: 'rgba(170,0,20,.6)', haptic: 60 });
    if (this.music) this.music.section('deed', { at: 'bar' });
    Scenes.Cine.card({ kicker: 'A letter, under your door', title: 'YOU HAVE BEEN POISONED',
                       sub: 'You can watch the rest. The living cannot hear you.', tone: 'traitor' });
    await this._say('murderedYou', {}, null);
    Scenes.Drama.end(this.stage, this.music);
  }

  /* ---------------- a Traitor's choice ---------------- */

  async _choose() {
    this._panelOpen = true;
    // the turret: the choir, low, and the drums under it
    if (this.music) this.music.section('conclave', { at: 'bar', glide: 2 });
    this._paintChoice(Session.myPrivate() || {});
    await this._waitFor(() => {
      const w = Session.myPrivate() || {};
      return !w.night || w.night.locked || Session.state.phase !== 'night';
    });
    this._panelOpen = false;
    this._closeVote();
    if (!this._alive || Session.state.phase !== 'night') return;
    const w = Session.myPrivate() || {};
    if (w.night && w.night.offer && w.night.offer.answer === null) {
      const t = Session.playerById(w.night.offer.targetId);
      Scenes.Cine.card({ kicker: 'The offer is made', title: (t ? t.name : 'They').toUpperCase(),
                         sub: 'Waiting for their answer…', tone: 'traitor' });
      await this._waitFor(() => { const x = Session.myPrivate() || {}; return !x.night || !x.night.offer || x.night.offer.answer !== null; });
    }
    if (!this._alive || Session.state.phase !== 'night') return;
    const after = Session.myPrivate() || {};
    if (after.poison && after.poison.carrier) {
      const c = Session.playerById(after.poison.carrier);
      Scenes.Cine.card({ kicker: 'Tomorrow', tone: 'traitor',
                         title: c && c.local ? 'YOU CARRY THE POISON' : (c ? c.name.toUpperCase() : 'YOUR PARTNER') + ' CARRIES IT' });
      await this._sleep(2.0);
    }
    if (!this._alive || Session.state.phase !== 'night') return;
    // and then the same dark as everybody else's, until the morning
    this._sleepCard();
    await this._waitFor(() => Session.state.phase !== 'night');
  }

  /* The panel. With two Traitors: who carries it tomorrow, each marked
     with what the other has pointed at. When a seat may be offered: an
     offer to each Faithful, or none. */
  _paintChoice(v) {
    if (!this._panelOpen || !v.night || v.night.locked) return;
    const me = Session.state.players.find(p => p.local);
    const partners = new Set(v.partners || []);
    const picks = v.night.picks || {};
    const mine = picks[me.id];
    const theirs = Object.keys(picks).filter(id => id !== me.id).map(id => ({ by: Session.playerById(id), pick: picks[id] }));
    const marked = (kind, targetId) => theirs.filter(t => t.pick.kind === kind && t.pick.targetId === targetId)
      .map(t => (t.by ? t.by.name : 'Your partner') + ' chose this');
    const chosen = (kind, targetId) => mine && mine.kind === kind && mine.targetId === targetId;
    const options = [];
    if (v.night.choose) {
      const traitors = [me].concat([...partners].map(id => Session.playerById(id)).filter(p => p && p.alive));
      for (const p of traitors) {
        options.push({ label: p.local ? 'I CARRY IT' : p.name.toUpperCase() + ' CARRIES IT',
                       sub: marked('carrier', p.id).join(' · ') || (chosen('carrier', p.id) ? 'Your choice' : 'Tomorrow’s poison'),
                       tone: 'banish', action: { type: 'turretPick', kind: 'carrier', targetId: p.id } });
      }
    }
    if (v.night.canRecruit) {
      const faithful = Session.alive().filter(p => p.id !== me.id && !partners.has(p.id));
      for (const p of faithful) {
        options.push({ label: 'OFFER ' + p.name.toUpperCase() + ' A SEAT',
                       sub: marked('recruit', p.id).join(' · ') || 'They may refuse',
                       tone: 'end', action: { type: 'turretPick', kind: 'recruit', targetId: p.id } });
      }
      if (!v.night.choose) {
        options.push({ label: 'NO OFFER', sub: marked('none', null).join(' · ') || 'Not tonight',
                       tone: 'name', action: { type: 'turretPick', kind: 'none' } });
      }
    }
    const left = Math.max(0, Math.round(((v.night.endsAt || Date.now()) - Date.now()) / 1000));
    this._openVote({
      kicker: 'Your room, in the dark',
      title: v.night.choose ? 'Who carries it tomorrow?' : 'Offer somebody a seat?',
      note: (partners.size ? 'You must both point at the same thing. ' : '') + left + 's before the castle decides for you.',
      options,
      keepOpen: true,
    });
    const tally = document.getElementById('vote-tally');
    if (tally) tally.innerHTML = '';
  }

  update(dt) {
    super.update(dt);
    this._noteClock = (this._noteClock || 0) - dt;
    if (this._traitor && this._panelOpen && this._noteClock <= 0) {
      this._noteClock = 1;
      const v = Session.myPrivate() || {};
      const note = document.getElementById('vote-note');
      if (note && v.night && v.night.endsAt) {
        const left = Math.max(0, Math.round((v.night.endsAt - Date.now()) / 1000));
        note.textContent = note.textContent.replace(/\d+s before/, left + 's before');
      }
    }
  }
}

/* A heavy door meeting its frame, and an old key going round in an old
   lock. */
AudioBus.define('door-shut', (ctx, dest, opts = {}) => {
  const t = ctx.currentTime;
  const len = 0.5;
  const k = opts.gain === undefined ? 1 : opts.gain;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const g = ctx.createGain(); g.gain.value = 0.9 * k;
  src.connect(lp); lp.connect(g); g.connect(dest);
  src.start(t);
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  const og = ctx.createGain(); og.gain.setValueAtTime(0.5 * k + 0.001, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(og); og.connect(dest); o.start(t); o.stop(t + 0.4);
});
AudioBus.define('key-turn', (ctx, dest) => {
  const t = ctx.currentTime;
  for (const [at, f, v] of [[0, 2400, 0.18], [0.12, 1900, 0.14], [0.32, 900, 0.35]]) {
    const len = 0.05;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = v;
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t + at);
  }
});
