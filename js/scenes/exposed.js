/* ------------------------------------------------------------------
   exposed.js — the poison that was never used.

   Every day one Traitor carries the poison, and the rule is on the
   card they were handed on the first day: use it before the bell, or
   be exposed. Not hard — anybody standing next to anybody for a couple
   of seconds can do it. The risk was never the difficulty; it is that
   somebody might be watching when they do.

   Lose your nerve and this happens: at the round table, before anybody
   has sat down properly, in front of everybody you spent the day lying
   to. It is that table's banishment, and the Traitor's flare goes up.

   This is a list of beats rather than a scene, because it has to play
   inside a room that already exists, and that room should not have to
   know how this one stages it.
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
      const pub = ClaudiaLines.isPublic(set);
      return lines.map((b, i) => ({
        shot: shots && shots[i],
        then: i === 0 && pub && typeof AIDirector !== 'undefined'
          ? () => AIDirector.claudiaLine(set, vars, salt) : undefined,
        line: { text: b.text, who: 'claudia', public: pub },
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
         words; this is the one beat that is only silence — bars in,
         the camera on them — and it is the one doing the work. */
      { then: () => {
          if (scene.music && scene.music.section) scene.music.section('held', { at: 'beat', glide: 0.5 });
          return Scenes.Drama.hush(scene.stage, null, onThem, { hold: 1.2, silent: false });
        } },
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
        wait: 2.0,
      },
      { card: null },

      ...speak('exposeAfter', { name }, ['claudia', null, 'players']),
      { then: () => Scenes.Drama.end(scene.stage, null) },
      { then: () => Scenes.barrier('exposure-ceremony-complete') },

      /* And then the night is over, here, in this room.

         `exposeDone` is what ends it: the host's session pays the pot
         out and moves everybody to the verdict phase. Nothing used to
         open the verdict panel on the far side of that, though. The
         director only opens it for a client that arrives in the phase
         cold — a reconnect — because on an ordinary night the fire has
         a last line to say and owns the moment it goes up. An exposure
         ends the night from inside a scene that has no ballot in it and
         never reaches that code, so all three browsers sat looking at a
         table nobody could leave, with the game technically finished
         behind them.

         So this ceremony opens it, exactly as the fire opens its own.
         The wait is for the outcome to exist: on the host it is already
         there by the time `exposeDone` returns, and a guest is waiting
         on the snapshot that carries it. */
      {
        then: async () => {
          if (Session.isHost) Net.send({ type: 'exposeDone' });
          /* With five or more at the table, an exposure is a Traitor down
             and the night goes on; only the last Traitor's exposure ends
             it. The host knows at once; a guest waits for the snapshot
             that says which, and gives up on a verdict after a moment. */
          const out = await outcome(Session.isHost ? 50 : 2500);
          if (out && typeof Show !== 'undefined') Show.showVerdict(out);
        },
      },
    ];
  }

  /* The night's result, once it exists. Every client reaches this from
     a different direction — the host has already written it, a guest is
     waiting on a packet — so this asks the state, listens for anything
     at all to arrive, and gives up after `ms` with whatever is there.
     Answering with nothing is still better than never answering: the
     scene ends either way and `show.js` has its own backstop. */
  function outcome(ms) {
    const now = () => (Session.state && Session.state.outcome) || null;
    const have = now();
    if (have) return Promise.resolve(have);
    return new Promise((resolve) => {
      let done = false, off = null, timer = null;
      const finish = (o) => {
        if (done) return;
        done = true;
        if (off) off();
        clearTimeout(timer);
        resolve(o);
      };
      off = Net.on(() => { const o = now(); if (o) finish(o); });
      timer = setTimeout(() => finish(now()), Math.max(0, ms || 0));
    });
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

  return { beats, owed, request, outcome };
})();
