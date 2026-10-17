/* ------------------------------------------------------------------
   breakfast.js — finding out who is missing.

   The great hall in the morning, one long table, a chair for every
   person who went to bed. They come down one or two at a time, and it
   is staged like the programme stages it: the table turning to look
   every time the door opens, whoever it is pausing on
   the threshold, then walking the long way round to their own chair,
   pulling it out and sitting. Nobody is told who is dead; they are
   shown, by a chair that stays empty while everybody else arrives — and
   only when the last of them is through the door does Claudia say the
   name.

   The groups are released by the host one at a time, and the victim's
   id is not in anybody's state until the very end, so a screen cannot
   know any sooner than the table does. If the poison was never used,
   everybody comes down, and that is its own kind of news.
------------------------------------------------------------------ */
class BreakfastScene extends CastleScene {

  stageOptions() {
    const s = Session.state;
    /* Everybody who went to bed alive has a chair. The victim is still
       alive in the state until the reveal, so they are in this list,
       and their figure simply never walks in. Somebody already out of
       the game watches from the end of the room. */
    const me = s.players.find(p => p.local);
    this._spectator = !me || !me.alive || (Session.myPrivate() || {}).fate === 'murdered';
    const seated = s.players.filter(p => p.alive).sort((a, b) => a.seat - b.seat)
      .map(p => (this._spectator && p.local ? Object.assign({}, p, { local: false }) : p));
    return { seed: s.seed + 313 * (s.day + 1), hour: 'morning', room: 'great',
             dress: 'breakfast', seated: true, players: seated };
  }

  build() {
    const view = super.build();
    const arrived = new Set((Session.state.breakfast && Session.state.breakfast.arrived) || []);
    this.stage.figures.forEach((f, i) => {
      if (!f) return;
      const id = this.stage.seats[i].id;
      f.userData.hidden = !arrived.has(id);
      if (arrived.has(id)) Figure.setSeated(f, true);
    });
    if (this._spectator) {
      this.stage.rig.pos.set(0, 0, 5.4);
      this.stage.rig.yaw = 0;
      this.stage.setWalk(true);
    }
    return view;
  }

  onEvent(e) {
    super.onEvent(e);
    if (e.type === 'arrive') { this._arrive(e.ids || []); if (e.last) this._lastIn = true; }
  }

  /* Just outside the great hall's east door, in this room's frame, and
     the first step inside it. */
  _door() { return new THREE.Vector3(6.6, 0, 3.5); }

  /* The long way round: in through the door, down the near side, round
     the foot of the table if your chair is on the far side, and up to
     your own chair from behind it. */
  _route(id, k) {
    const V = (x, z) => new THREE.Vector3(x, 0, z);
    const seat = this.stage.seats.find(s => s.id === id);
    if (!seat) return null;
    const side = seat.home.x > 0 ? 1 : -1;
    const lane = side * 2.15;
    const step = k * 0.55;
    const pts = [this._door(), V(5.0, 3.5 + step * 0.4)];
    if (side > 0) pts.push(V(lane, 3.5));
    else { pts.push(V(2.15, 5.15)); pts.push(V(-2.15, 5.15)); }
    pts.push(V(lane, seat.home.z));
    pts.push(seat.home.clone());
    return pts;
  }

  _arrive(ids) {
    if (!this.stage) return;
    AudioBus.play('estate-door');
    const st = this.stage;
    // everybody at the table looks at the door
    st.setGaze(new THREE.Vector3(6.2, 1.5, 3.5));
    ids.forEach((id, k) => {
      const p = Session.playerById(id);
      if (!p || p.local) return;
      const pts = this._route(id, k);
      if (!pts) return;
      st.walkPath(id, pts, { speed: 1.45, pause: 0.55 + k * 0.7 });
    });
    clearTimeout(this._gazeT);
    this._gazeT = setTimeout(() => {
      if (!this._alive || !this.stage) return;
      this.stage.setGaze(null);
    }, 2600);
  }

  async drive() {
    const s = Session.state;
    this.music = Music.murder('dawn');
    await this._say('breakfastOpen', {}, null);
    if (!this._alive) return;
    if (this.music) this.music.section('breakfast', { at: 'bar', glide: 3 });

    /* The host lets them in. Everybody else watches them come. */
    if (Session.isHost) this._release();
    await this._waitFor(() => !!(Session.state.breakfast && Session.state.breakfast.revealed)
                              || Session.state.phase !== 'breakfast');
    if (!this._alive || Session.state.phase !== 'breakfast') return;
    if (this.stage) this.stage.setGaze(null);

    const b = Session.state.breakfast;
    if (b.victim) {
      if (this.music) { this.music.stinger('breakfast-absent'); this.music.section('absence', { at: 'bar', glide: 1 }); }
      // everybody looks at the empty chair
      const empty = this.stage && this.stage.seats.find(x => x.id === b.victim);
      if (empty && this.stage) this.stage.setGaze(empty.home.clone().setY(1.0));
      await this._sleep(1.2);
      await this._say('breakfastAbsent', { name: b.name }, null);
      if (this.stage) this.stage.setGaze(null);
    } else {
      if (this.music) { this.music.stinger('all-here'); this.music.section('saved', { at: 'bar', glide: 2 }); }
      await this._say(b.spared ? 'breakfastSpared' : 'breakfastNobody', {}, null);
    }
    if (!this._alive) return;
    void s;

    // the last morning does not send anybody back to work: the fire is next
    await this._say(Session.finaleNext() ? 'breakfastSendFinale' : 'breakfastSend', {}, null);
    if (!this._alive) return;
    await Scenes.barrier('breakfast-done-' + Session.state.day);
    if (Session.isHost) Net.send({ type: 'advance' });
  }

  /* One group at a time, each given time to be watched coming in, and
     then the long wait on the empty chair before the name. */
  async _release() {
    let guard = 0;
    while (this._alive && guard++ < 12 && !this._lastIn) {
      const b = Session.state.breakfast;
      if (!b || b.revealed || Session.state.phase !== 'breakfast') return;
      await this._sleep(guard === 1 ? 0.8 : 3.4);
      if (!this._alive) return;
      const before = b.groups;
      Net.send({ type: 'breakfastNext' });
      await this._waitFor(() => !Session.state.breakfast || Session.state.breakfast.groups !== before
                                || Session.state.breakfast.revealed, 3000);
    }
    if (!this._alive || !Session.state.breakfast || Session.state.breakfast.revealed) return;
    /* Everybody who is coming has come. Let the last of them sit down,
       and then a quiet look at the chair nobody is in. */
    await this._sleep(4.2);
    const b = Session.state.breakfast;
    if (b && b.arrived.length < Session.alive().length) {
      await this._say('breakfastWait', {}, null);
      await this._sleep(1.6);
    }
    if (!this._alive) return;
    Net.send({ type: 'breakfastNext' });
  }

  dispose() {
    clearTimeout(this._gazeT);
    super.dispose();
  }
}
