/* ------------------------------------------------------------------
   night.js — the poison takes.

   The house goes to bed, and everybody's screen goes somewhere
   different, which is the whole point of it:

     a Faithful        is in their own bedroom; the door swings shut
                       and locks, and that is the night — short, and
                       quiet, with the castle settling round them
     a Traitor         climbs to the turret, where Claudia waits with
                       the other Traitor (if there is one); what is left
                       to decide is who carries tomorrow's poison, and —
                       only when they have lost one of their own —
                       whether to offer somebody a seat
     the offered       is woken with the offer, and may say no
     the poisoned      find out before anybody else does: a knock, and a
                       letter under the door
     the dead          watch the corridor, and hear nothing

   Nothing here decides anything. The turret's buttons are actions, the
   session settles them in private, and every screen finds out only
   what its own private view says. The night always lasts its full
   length whatever the turret did, so the clock is not a tell either.
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
    if (this._traitor) {
      const turret = s.players.filter(p => p.alive && (p.local || (view.partners || []).indexOf(p.id) >= 0))
        .sort((a, b) => a.seat - b.seat);
      return { seed, hour: 'night', room: 'turret', dress: 'conclave', seated: true, players: turret };
    }
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
    this.music = Music.murder('nightfall');
    this._quietCues = true;
    this._told = { offer: false, fate: false, recruited: false };

    if (this._bed) this._shut();
    await this._say('nightFalls', {}, null);
    if (!this._alive) return;

    if (this._traitor) return this._turret();
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
    if (this._traitor && v.night) this._paintTurret(v);
    if (v.offer && !this._told.offer) { this._told.offer = true; this._offer(v); }
    if (v.recruited && !this._told.recruited) { this._told.recruited = true; this._recruited(); }
    if (v.fate === 'murdered' && !this._told.fate) { this._told.fate = true; this._murdered(); }
  }

  /* ---------------- a Faithful's room ---------------- */

  async _bedroom() {
    await this._say('nightFaithful', {}, null);
    if (!this._alive) return;
    Scenes.Cine.card({ kicker: 'Night', title: 'THE CASTLE SLEEPS',
                       sub: 'The poison is already in somebody.', tone: 'bad' });
    await this._sleep(3);
    Scenes.Cine.card(null);
    if (this.music) this.music.section('deed', { at: 'bar', glide: 4 });
    this._privateMoved();
  }

  _watch() {
    Scenes.Cine.card({ kicker: 'You are out of the game', title: 'NIGHT',
                       sub: 'The living cannot hear you. Watch.', tone: 'bad' });
    setTimeout(() => Scenes.Cine.card(null), 4000);
  }

  /* A seat, offered to the one person it is offered to. */
  async _offer(v) {
    AudioBus.play('ui-click');
    if (this.music) this.music.stinger('murder-hit', { at: 'now' });
    await this._say('recruitOffer', {}, null);
    if (!this._alive) return;
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
    await this._sleep(4);
    if (!this._alive) return;
    AudioBus.play('estate-door');
    if (this.music) { this.music.stinger('murder-hit', { at: 'now' }); this.music.section('deed', { at: 'bar' }); }
    await this._sleep(1.0);
    Scenes.Cine.card({ kicker: 'A letter, under your door', title: 'YOU HAVE BEEN POISONED',
                       sub: 'You can watch the rest. The living cannot hear you.', tone: 'traitor' });
    await this._say('murderedYou', {}, null);
  }

  /* ---------------- the turret ---------------- */

  async _turret() {
    if (this.music) this.music.section('conclave', { at: 'bar', glide: 3 });
    const v = Session.myPrivate() || {};
    await this._say('conclaveOpen', {}, 'claudia');
    if (!this._alive) return;
    const n = v.night || {};
    if (n.choose) await this._say('conclaveAgree', {}, 'claudia');
    if (!this._alive) return;
    if (n.canRecruit) await this._say('conclaveRecruit', {}, 'claudia');
    if (!this._alive) return;
    if (n.choose || n.canRecruit) {
      this._panelOpen = true;
      this._paintTurret(Session.myPrivate() || {});
      await this._waitFor(() => {
        const w = Session.myPrivate() || {};
        return !w.night || w.night.locked || Session.state.phase !== 'night';
      });
      this._panelOpen = false;
      this._closeVote();
    }
    if (!this._alive || Session.state.phase !== 'night') return;
    const w = Session.myPrivate() || {};
    if (w.night && w.night.offer && w.night.offer.answer === null) {
      const t = Session.playerById(w.night.offer.targetId);
      Scenes.Cine.card({ kicker: 'The offer is made', title: (t ? t.name : 'They').toUpperCase(),
                         sub: 'Waiting for their answer…', tone: 'traitor' });
      await this._waitFor(() => { const x = Session.myPrivate() || {}; return !x.night || !x.night.offer || x.night.offer.answer !== null; });
      Scenes.Cine.card(null);
    }
    const after = Session.myPrivate() || {};
    if (after.poison && after.poison.carrier) {
      const c = Session.playerById(after.poison.carrier);
      Scenes.Cine.card({ kicker: 'Tomorrow', tone: 'traitor',
                         title: c && c.local ? 'YOU CARRY THE POISON' : (c ? c.name.toUpperCase() : 'YOUR PARTNER') + ' CARRIES IT' });
      setTimeout(() => { if (this._alive) Scenes.Cine.card(null); }, 2600);
    }
    await this._say('conclaveDone', {}, 'claudia');
  }

  /* The turret's panel. With two of them: who carries it tomorrow, each
     marked with what the other has pointed at. When a seat may be
     offered: an offer to each Faithful, or none. */
  _paintTurret(v) {
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
      kicker: 'The turret',
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
AudioBus.define('door-shut', (ctx, dest) => {
  const t = ctx.currentTime;
  const len = 0.5;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const g = ctx.createGain(); g.gain.value = 0.9;
  src.connect(lp); lp.connect(g); g.connect(dest);
  src.start(t);
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  const og = ctx.createGain(); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
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
