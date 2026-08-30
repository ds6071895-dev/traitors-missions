/* ------------------------------------------------------------------
   exposed.js — the task that was left undone.

   A Traitor is given one small thing to do inside each mission. Not
   hard: the deck in `agendas.js` is written so that anybody who reads
   their card and pays attention will manage it. The risk was never the
   difficulty — it is that every task has a public tell, and the other
   two are out there watching.

   Fail it and this happens. Not out on the water where it could be
   argued about, and not privately either: at the next gathering,
   before anybody has sat down, in front of both of the people you have
   spent the evening lying to. The Faithfuls win on the spot.

   The Traitor is not told they failed. They walk into this room
   believing they got away with it, which is the only version of it
   worth watching.

   This is a list of beats rather than a scene, because it has to play
   inside two rooms that already exist — a table with candles on it and
   a fire — and neither of them should have to know how the other one
   stages this.
------------------------------------------------------------------ */
const Exposed = (() => {

  /* `scene` needs `stage`, optionally `music`, and optionally
     `takeEmbers` if it is a room with something burning in it. */
  function beats(scene, e, seed) {
    const s = Session.state;
    const p = (e && e.playerId && Session.playerById(e.playerId)) || null;
    const name = p ? (p.local ? 'You' : p.name) : (e && e.name) || 'Somebody';
    const salt = (seed || (s ? s.seed : 0)) + 0x5ade;

    const L = (set, vars) => ClaudiaLines.beats(set, vars, salt);
    const speak = (set, vars, shots) => {
      const lines = L(set, vars);
      return lines.map((b, i) => ({
        shot: shots && shots[i],
        line: { text: b.text, who: 'claudia' },
        hold: i === lines.length - 1 ? 0.7 : 0.3,
      }));
    };

    const onThem = e && e.playerId ? 'on:' + e.playerId : 'players';

    return [
      { then: () => { if (scene.stage) scene.stage.setControls(false); } },
      { shot: 'claudiaTight', wait: 1.0 },
      ...speak('exposeOpen', {}, ['claudiaTight', 'players']),
      ...speak('exposeTask', {}, ['claudia', 'players', 'claudiaTight']),

      /* The pause before the name. Everything else in this file is
         words; this is the one beat that is only silence, and it is
         the one doing the work. */
      { shot: onThem, wait: 2.2 },
      ...speak('exposeName', { name }, [onThem, onThem]),

      {
        shot: onThem,
        then: () => {
          const out = Reveal.flare({
            role: 'traitor',
            stage: scene.stage,
            music: scene.music,
            playerId: e && e.playerId,
          });
          if (scene.takeEmbers) scene.takeEmbers(out.embers, out.settle);
        },
        wait: 3.4,
      },
      { card: null },

      ...speak('exposeAfter', { name }, ['claudia', null, 'players']),
      { then: () => Net.send({ type: 'exposeDone' }) },
    ];
  }

  /* Whether this room owes a ceremony. Host-only, and not what decides
     whether to ask — see `request`. */
  const owed = () => (typeof Session !== 'undefined'
                      && Session.isHost && Session.hasExposure());

  /* The host asks *every* time, including on the nights when the
     answer is nobody. Asking only when there is something to reveal
     would mean a clean night sends nothing at all — and a guest that
     asked and heard nothing back cannot tell "nobody" from "still in
     flight", so all three clients would sit through the timeout before
     every single round table. `doExpose` always answers; this always
     asks. Guests do nothing and wait. */
  function request() {
    if (typeof Session === 'undefined' || !Session.isHost) return false;
    Net.send({ type: 'expose' });
    return true;
  }

  return { beats, owed, request };
})();
