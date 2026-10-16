/* ------------------------------------------------------------------
   explore.js — the castle, with nobody in it.

   A walk round the house on your own, from the front screen: the hall,
   the great hall where breakfast is, the round table chamber, up the
   stair to the turret, and the bedroom corridor. Nothing happens here
   and nothing is at stake; it is for knowing your way about before a
   night that will lock you in a chair in one of these rooms.

   Each room says its name as you walk into it. Escape leaves.
------------------------------------------------------------------ */
class ExploreScene {

  constructor(opts = {}) {
    this.opts = opts;
    this.stage = null;
    this.music = null;
    this._room = null;
    this._key = null;
    this._t = 0;
  }

  static ROOM_NAMES = {
    hall: 'The Entrance Hall', 'west-passage': 'The West Passage', great: 'The Great Hall',
    'north-passage': 'The North Passage', round: 'The Round Table Chamber', stair: 'The Turret Stair',
    turret: 'The Turret', corridor: 'The Bedroom Corridor',
  };

  build() {
    const me = { id: 'you', name: Look.getName() || 'You', look: Look.get(), local: true, seat: 0, alive: true };
    this.stage = Stage.build({ seed: 7, hour: this.opts.hour || 'golden', room: 'hall', dress: 'none',
                               claudia: false, players: [me] });
    this.stage.rig.pos.copy(this.stage.land.roomAnchor('hall'));
    this.stage.rig.yaw = 0;
    this.stage.update(0);
    return this.stage.view;
  }

  setShot() {}
  setSpeaking() {}

  start() {
    Scenes.Cine.on(false);
    this.music = Music.roundtable();
    this._key = (e) => {
      if (e.code === 'Escape') { e.preventDefault(); this.leave(); }
    };
    window.addEventListener('keydown', this._key);
    Voice.show('', 'Explore the castle. WASD to walk, mouse to look. Escape to leave.');
    setTimeout(() => { if (this.stage) Voice.clear(); }, 5000);
  }

  leave() {
    if (this._left) return;
    this._left = true;
    if (this.opts.onLeave) this.opts.onLeave();
  }

  update(dt) {
    if (!this.stage) return;
    this.stage.update(dt);
    this._t += dt;
    if (this._t < 0.3) return;
    this._t = 0;
    // which room are we standing in? Say its name on the way in.
    const land = this.stage.land;
    const l = land.toLocal(this.stage.rig.pos.x, this.stage.rig.pos.z);
    const room = CastleLayout.roomAt(l.x, l.z);
    const id = room ? room.id : null;
    if (id && id !== this._room) {
      this._room = id;
      const name = ExploreScene.ROOM_NAMES[id] || (id.startsWith('bed') ? 'A Bedroom' : '');
      if (name) {
        Voice.show('', name);
        clearTimeout(this._clear);
        this._clear = setTimeout(() => Voice.clear(), 2400);
        if (this.music && this.music.section) {
          this.music.section(id === 'turret' || id === 'stair' ? 'slate'
            : id === 'round' ? 'debate' : 'gather', { at: 'bar', glide: 2 });
        }
      }
    }
  }

  dispose() {
    if (this._key) window.removeEventListener('keydown', this._key);
    clearTimeout(this._clear);
    Voice.clear();
    if (this.music) { this.music.stop(1); this.music = null; }
    if (this.stage) { this.stage.dispose(); this.stage = null; }
  }
}
