/* ------------------------------------------------------------------
   roundtable.js — the round table.

   The chamber behind the hall, a ring of chairs, a table with a brass
   inlay and candles round it, and Claudia at the head. This is where
   the programme happens: straight from breakfast, with the chair the
   poison emptied still warm and yesterday's hand-overs in every
   notebook.

     gather   everybody comes in and takes their own seat
     expose   a Traitor who never used the poison is named, and goes —
              that is the day's banishment, and there is no vote
     talk     every microphone open; the day's jobs are up; the host's
              moderator listens until everybody has had their say and
              the room falls quiet, and then Claudia calls it
     slates   everybody writes a name; then one by one, round the
              table, the slates are turned and the names said out loud
     tie      a tie is voted again between the tied; tied twice and
              Claudia draws
     banish   the banished get a few seconds to speak, then say what
              they were — and the room finds out if it was right

   And then back to work, or to the fire when the table is small
   enough. If the last Traitor has just gone, there is no more game to
   play and the verdict comes up here.
------------------------------------------------------------------ */
class RoundtableScene extends CastleScene {

  stageOptions() {
    const s = Session.state;
    this._seatedAtStart = false;
    return {
      seed: s.seed + 977 * (s.day + 1),
      hour: 'morning',
      room: 'round',
      dress: 'table',
      seated: true,
      players: Session.alive().slice().sort((a, b) => a.seat - b.seat),
    };
  }

  build() {
    const view = super.build();
    /* Everybody starts at the door and walks to their own chair; the
       others walk in around you. A spectator stands back by the wall. */
    const me = Session.state.players.find(p => p.local);
    this._spectator = !me || !me.alive;
    this.stage.setSeated(false);
    if (!this._spectator) {
      this.stage.rig.pos.set(0, 0, 7.2);
      this.stage.rig.yaw = 0;
      this.stage.setWalk(true);
    }
    this.stage.figures.forEach(f => { if (f) f.userData.hidden = true; });
    return view;
  }

  async drive() {
    this.music = Music.roundtable(Music.dayMusic(Session.state.seed, Session.state.day));
    this._quietCues = false;

    await this._gather();
    if (!this._alive) return;

    /* A carrier who never used the poison: Claudia deals with that
       first, and it is the table's banishment for the day. */
    const e = await this._exposure();
    if (!this._alive) return;
    if (e && e.playerId) {
      await Scenes.run(Exposed.beats(this, e, Session.state.seed + Session.state.day), this);
      if (!this._alive || Session.state.phase === 'verdict') return;
      await this._waitFor(() => Session.state.finale.stage === 'done' || Session.state.phase !== 'table', 4000);
      if (!this._alive || Session.state.phase !== 'table') return;
      return this._close();
    }

    // the body breakfast found is the first thing on the table
    const s = Session.state;
    const body = (s.murdered || []).find(m => m.day === s.day);
    // no body, because the shield held: the near-miss is the lead
    const saved = !body && s.breakfast && s.breakfast.day === s.day && s.breakfast.shielded
      ? Session.playerById(s.breakfast.shielded) : null;
    if (saved && saved.alive) await this._say(this._setFor('tableOpenShield', saved), { name: saved.name }, 'claudia');
    else await this._say(body ? 'tableOpenBody' : 'tableOpen', body ? { name: body.name } : {}, 'claudia');
    if (!this._alive) return;

    // the argument, with the day's jobs on the board
    RoomUI.showBoard(RoomUI.choreBoard());
    if (this.music) this.music.section('debate', { at: 'bar', glide: 3 });
    this._courtesy(true);
    const ai = typeof AIDirector !== 'undefined' && AIDirector.active ? AIDirector : null;
    await this._discussion(Session.tableSeconds(Session.alive().length), {
      judge: ai && ai.claudiaJudge ? ai.claudiaJudge('table') : undefined,
      extraLevels: ai ? () => ai.levels() : undefined,
      onModerator: ai ? () => ai.discussionStarted('table') : undefined,
    });
    this._courtesy(false);
    RoomUI.hideBoard();
    if (!this._alive) return;
    if (ai) ai.discussionEnded('table');

    // the slates
    let guard = 0;
    while (this._alive && Session.state.phase === 'table' && guard++ < 6) {
      const f = Session.state.finale;
      if (f.stage === 'name') await this._ballot();
      else if (f.stage === 'names') await this._turnSlates();
      else if (f.stage === 'reveal') await this._banish();
      else break;
    }
    if (!this._alive) return;
    if (Session.state.phase === 'verdict') return this._verdict();
    await this._close();
  }

  /* ---------------- sitting down ----------------
     You are already in your chair; the others come in round the table,
     not through it, and sit. A few seconds, not a procession. */

  async _gather() {
    const st = this.stage;
    const V = (x, z) => new THREE.Vector3(x, 0, z);
    const others = st.seats.filter(seat => !seat.local);
    others.forEach((seat, i) => {
      setTimeout(() => {
        if (!this._alive || !this.stage) return;
        const side = seat.home.x >= 0 ? 1 : -1;
        const a = Math.atan2(seat.home.z, seat.home.x);
        const out = V(Math.cos(a) * 3.5, Math.sin(a) * 3.5);
        st.walkIn(seat.id, V(side * 0.7, 7.6), { via: [V(side * 3.4, 3.2), out], speed: 2.2 });
      }, 150 + i * 260);
    });
    if (!this._spectator && st.mySeat) {
      const mine = st.mySeat;
      st.rig.pos.copy(mine.home);
      st.rig.yaw = Math.atan2(-(0 - mine.home.x), -(0 - mine.home.z));
      st.setSeated(true);
    }
    await this._sleep(2.2 + others.length * 0.26);
    if (!this._alive) return;
    await Scenes.barrier('table-sit-' + Session.state.day);
    // anybody who has not finished walking in is in their chair now
    st.figures.forEach((f, i) => {
      if (!f) return;
      if (f.userData.walk) {
        f.userData.walk = null;
        f.position.copy(st.seats[i].home);
        f.rotation.y = Math.atan2(-st.seats[i].home.x, -st.seats[i].home.z);
        Figure.setSeated(f, true, { instant: true });
      }
      f.userData.hidden = false;
    });
  }

  _exposure() {
    if (Session.state.exposure && Session.state.exposure.checked) return Promise.resolve(Session.state.exposure);
    return new Promise((resolve) => {
      let done = false;
      const finish = (ev) => { if (done) return; done = true; off(); resolve(ev); };
      const off = Net.on((ev) => { if (ev.type === 'expose') finish(ev); });
      this._waits.add(() => finish(null));
      Exposed.request();
      setTimeout(() => finish(Session.state.exposure), 4000);
    });
  }

  /* ---------------- the ballot ---------------- */

  async _ballot() {
    const f = Session.state.finale;
    const revote = f.nameRound > 0;
    if (this.music) this.music.section('slate', { at: 'bar', glide: 1.5 });
    if (revote) {
      const names = (f.tied || []).map(id => Session.playerById(id)).filter(Boolean)
        .map(p => p.local ? 'you' : p.name);
      await this._say('tableTie', { names: joinNames(names) }, 'claudia');
    } else {
      await this._say('tableClose', {}, 'claudia');
      if (!this._alive) return;
      await this._say('slateIntro', {}, 'claudia');
    }
    if (!this._alive || Session.state.finale.stage !== 'name') return;

    const you = Session.state.players.find(p => p.local);
    if (you && you.alive) {
      const fx = Session.state.finale;
      const targets = Session.alive().filter(p => p.id !== you.id
        && (!fx.tied || fx.tied.indexOf(p.id) >= 0));
      /* The Wise One's panel has a switch on it, and stays open: a name
         can be changed, and the overrule thrown or taken back, until the
         last slate is in. */
      const w = Session.state.wise;
      const wise = !!(Session.myPrivate() || {}).wiseOne && !(w && w.used);
      let over = false, chose = null;
      const sub = () => (over ? 'Overrule: they go' : 'Write their name');
      if (targets.length) {
        this._openVote({
          kicker: revote ? 'Revote' : 'The round table',
          title: 'Who do you want gone?',
          note: wise ? 'You are the Wise One. Overrule once, and your name is the only one that counts.'
               : revote ? 'Only the tied names can go.' : 'You cannot write your own name.',
          keepOpen: wise,
          options: targets.map(p => ({
            id: p.id, label: p.name.toUpperCase(), sub: sub(),
            tone: 'name', action: () => ({ type: 'name', targetId: p.id, overrule: over }),
          })),
          onPick: (opt) => { chose = opt.id; },
          toggle: wise ? {
            label: 'OVERRULE THE TABLE', sub: 'Wise One — once per game',
            onChange: (on) => {
              over = on;
              const root = document.getElementById('vote-options');
              [...((root && root.children) || [])].forEach((b) => {
                const el = b.querySelector && b.querySelector('.vb-sub');
                if (el) el.textContent = sub();
              });
              if (chose) Net.send({ type: 'name', playerId: you.id, targetId: chose, overrule: over });
            },
          } : null,
        });
      }
    }
    const offVote = Net.on((e) => {
      if (e.type !== 'vote') return;
      this._paintTally();
      // head down over the slate: who they wrote stays theirs until it turns
      if (e.stage === 'name' && this.stage && this.stage.act) this.stage.act(e.playerId, 'write');
    });
    await this._waitFor(() => Session.state.phase !== 'table' || Session.state.finale.stage !== 'name');
    offVote();
    this._closeVote();
    await this._sleep(0.8);
  }

  async _turnSlates() {
    await this._slates('table-' + Session.state.day);
    if (!this._alive) return;
    const f = Session.state.finale;
    if (f.stage === 'reveal' && f.lot) {
      await this._say('tableLot', {}, 'claudia');
    }
  }

  /* ---------------- the banishment ---------------- */

  /* The banishment, staged the way the programme stages it: the name,
     the chair pushed back, the walk to stand where everybody can see,
     their own last words — then a drumroll, and they say what they
     are. The stage removes their character at the reveal. */
  async _banish() {
    const f = Session.state.finale;
    const target = Session.playerById(f.pending);
    if (!target) return;
    const st = this.stage;
    const fig = st && st.figureOf ? st.figureOf(target.id) : null;
    // an overrule keeps its music under the name; any other ballot goes quiet
    const overruled = !!(f.lastTally && f.lastTally.overrule);
    if (this.music) {
      this.music.stinger('banish', { at: 'beat' });
      if (!overruled) this.music.section('reveal', { at: 'bar', glide: 2 });
    }
    if (st && st.act) { st.act(target.id, 'gasp'); st.setMood(target.id, 'nervous'); }
    await this._say(this._setFor('banishName', target), { name: target.name }, 'on:' + target.id);
    if (!this._alive) return;
    // the chair goes back, and they stand
    this._standUp(target, fig);
    await this._sleep(1.0);
    if (!this._alive) return;
    await this._say(this._setFor('lastWords', target), { name: target.name }, null);
    if (!this._alive) return;
    // a few seconds that belong to them and nobody else
    await this._turnFloor(target.id, Session.LAST_WORDS_SECONDS);
    if (!this._alive) return;
    await Scenes.barrier('table-banish-' + Session.state.day + '-' + target.id);
    if (!this._alive) return;
    // the drumroll, with the bars in and the room gone dark at the edges
    if (this.music) { this.music.section('drumroll', { at: 'beat', glide: 0.3 }); }
    Voice.show(target.local ? 'You' : target.name, 'I am…');
    await Scenes.Drama.hush(st, null, null, { hold: 2.2, silent: false, camera: false });
    if (!this._alive) return;
    const role = await this._burn(target.id);
    if (!this._alive || !role) return;
    Voice.show(target.local ? 'You' : target.name, role === 'traitor' ? 'I am a Traitor.' : 'I am a Faithful.');
    this._flare(role, target.id, role === 'traitor' ? 'banishTraitor' : 'banishFaithful');
    this._react(role === 'traitor' ? ['clap', 'relief', 'nod', 'relief'] : ['handsFace', 'gasp', 'shake', 'headDown'],
                target.id);
    await this._sleep(1.8);
    Scenes.Cine.card(null);
    Voice.clear();
    await this._say(this._setFor(role === 'traitor' ? 'banishedTraitor' : 'banishedFaithful', target),
                    { name: target.name }, null);
    Scenes.Drama.end(this.stage, null);
    // and out they go: the horns take the theme, and the door
    if (this.music) { this.music.stinger('walkout', { at: 'beat' }); this.music.section('walkout', { at: 'bar', glide: 0.5 }); }
    if (this._alive && this.stage) this.stage.setCinematic(false);
  }

  /* On their feet, a step back from the table, facing the room. */
  _standUp(target, fig) {
    const st = this.stage;
    if (!st) return;
    const seat = st.seats.find(x => x.id === target.id);
    if (!seat) return;
    /* Not behind the chair: that is where the chair back and the
       neighbours' chairs box them in. They step sideways along the ring,
       towards the door, into the gap between this chair and the next,
       and from there the way out is straight outward and clear. */
    const len = Math.hypot(seat.home.x, seat.home.z) || 1;
    const a0 = Math.atan2(seat.home.z, seat.home.x);
    const TAU = Math.PI * 2, norm = (d) => ((d % TAU) + TAU) % TAU;
    const toDoor = Math.atan2(1, 0) - a0;                   // the door is at +z
    const dir = Math.sin(toDoor) >= 0 ? 1 : -1;
    let gap = Infinity;
    for (const o of st.seats) {
      if (o === seat) continue;
      const d = norm(dir * (Math.atan2(o.home.z, o.home.x) - a0));
      if (d > 1e-3 && d < gap) gap = d;
    }
    if (!isFinite(gap)) gap = 1;
    const a1 = a0 + dir * Math.min(gap, 2.2) / 2;
    const out = new THREE.Vector3(Math.cos(a1) * len, 0, Math.sin(a1) * len);
    if (fig) {
      Figure.setSeated(fig, false);
      // out of the chair by its front (the table side), then along to the gap
      const fa = a0 + dir * 0.18;
      const front = new THREE.Vector3(Math.cos(fa) * (len - 0.4), 0, Math.sin(fa) * (len - 0.4));
      st.walkPath(target.id, [seat.home.clone(), front, out], { speed: 0.9, sit: false, face: new THREE.Vector3(0, 0, 0) });
      // the camera, out past the table, on them
      st.aim(new THREE.Vector3(-out.x * 0.55, 1.75, -out.z * 0.55 + 0.4),
             new THREE.Vector3(out.x, 1.5, out.z), { fov: 40, speed: 1.4 });
    } else {
      // it is you: up out of the chair (the camera rises to standing)
      st.rig.walk = true;
      st.setControls(false);
    }
  }

  /* ---------------- and then ---------------- */

  async _close() {
    if (Session.finaleNext()) await this._say('tableToFire', { count: Session.alive().length }, 'claudia');
    else await this._say('tableToWork', {}, 'claudia');
    if (!this._alive) return;
    await Scenes.barrier('table-close-' + Session.state.day);
    if (Session.isHost) Net.send({ type: 'advance' });
  }

  async _verdict() {
    const o = await Exposed.outcome(8000);
    if (!this._alive || !o) return;
    this._closeVote();
    if (this.music) {
      const V = Music.verdictCue(o);
      this.music.stop(0.8);
      this.music = Music.finale();
      this.music.stinger(V.sting);
      this.music.section(V.section, { at: 'bar', glide: 2 });
    }
    await this._say('traitorsGone', {}, 'claudia');
    if (!this._alive) return;
    const set = o.role === 'traitor' ? (o.won ? 'wonTraitor' : 'lostTraitorCaught')
              : (o.won ? 'wonFaithful' : 'lostBurned');
    await this._say(set, { pot: U.money(o.pot) }, 'claudia');
    if (!this._alive) return;
    Voice.clear();
    Show.showVerdict(o);
  }
}

function joinNames(list) {
  if (list.length <= 1) return list.join('');
  return list.slice(0, -1).join(', ') + ' or ' + list[list.length - 1];
}
