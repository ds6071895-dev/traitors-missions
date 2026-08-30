/* ------------------------------------------------------------------
   agendas.js — the Traitor's secret task.

   One card per mission, dealt only to a Traitor, and the single hardest
   thing to get right in the whole design: a sabotage that can be done
   without anyone noticing is not a game, it is a formality. So every
   card in this deck carries a `tell`, and `tell` is not a comment. It
   names the thing the other two people can physically see or hear
   happen when the task is performed. A card without one does not go in
   the deck.

   The thresholds are deliberately generous. A Traitor who reads their
   card and pays attention will complete it. The risk was never meant to
   be the difficulty — it is being watched doing it, and then having to
   sit at a table afterwards and explain the numbers.

   `check(stats)` runs on the host, against the stats that mission
   reported. `progress(stats)` is the private line on the Traitor's own
   HUD, so nobody ever fails a task by forgetting it was there.
------------------------------------------------------------------ */
const Agendas = (() => {

  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const arr = (v) => (Array.isArray(v) ? v : []);

  const DECKS = {

    /* ---------------- Boat Race ----------------
       Three boats on one course, all of them in each other's mirrors
       the whole way round. Everything here happens in open water. */

    'boat-race': [
      {
        id: 'br-last-but-close',
        text: 'Cross the line last — but within four seconds of the boat ahead.',
        tell: 'You finish last, in full view. Close enough to look like a bad line, not a thrown race.',
        hud: 'Finish last, within 4s',
        check: (s) => s.finished === true && s.place === s.of && n(s.finishGap) <= 4.0,
        progress: (s) => (s.place === s.of ? 'Last — hold the gap under 4s'
                                           : 'Currently P' + (s.place || '?') + ' — drop back'),
      },
      {
        id: 'br-wide-gates',
        text: 'Take three separate gates on the outside of the marker.',
        tell: 'The boat swings wide, three times, where two other people are watching the same gates.',
        hud: 'Wide gates',
        check: (s) => arr(s.wideGates).length >= 3,
        progress: (s) => arr(s.wideGates).length + ' / 3 taken wide',
      },
      {
        /* This card used to read "use no boost in the final third",
           which a Traitor completed by doing nothing at all — and a
           task you pass by forgetting it is not a risk, it is a free
           pass with no tell on it. So it now takes an act: arrive at
           the last split with a meter you have deliberately banked,
           and then visibly refuse to spend it while two people watch
           you lose ground. */
        id: 'br-cold-engine',
        text: 'Reach the last split with a full boost meter — then cross the line without spending a drop of it.',
        tell: 'Everyone can see everyone’s boost on the shared strip. Yours sits full while you drift backwards.',
        hud: 'Bank boost, then refuse to use it',
        check: (s) => s.finished === true && n(s.boostAtSplit) >= 0.6
                      && n(s.boostInLastThird) <= 0.05,
        progress: (s) => (n(s.boostAtSplit) < 0.6
          ? 'Bank boost before the last split (' + Math.round(n(s.boostAtSplit) * 100) + '%)'
          : (n(s.boostInLastThird) <= 0.05 ? 'Full meter — now coast it home'
                                           : 'You spent it after the split')),
      },
      {
        id: 'br-buoy-kiss',
        text: 'Clip exactly two marker buoys. No more, no fewer.',
        tell: 'A clipped buoy knocks, splashes and swings. It is heard as often as it is seen.',
        hud: 'Clip exactly 2 buoys',
        check: (s) => n(s.buoysClipped) === 2,
        progress: (s) => n(s.buoysClipped) + ' / 2 clipped',
      },
    ],

    /* ---------------- Shootout ----------------
       One clearing, one flock, three people facing the same sky. */

    shootout: [
      {
        id: 'sh-let-them-fly',
        text: 'Let at least three birds leave the clearing untouched.',
        tell: 'They fly out over everybody’s heads. Nobody has to be looking at you to see it.',
        hud: 'Let 3 escape',
        check: (s) => n(s.escapedNearMe) >= 3,
        progress: (s) => n(s.escapedNearMe) + ' / 3 let through',
      },
      {
        id: 'sh-empty-quiver',
        text: 'Finish the night having missed eight arrows or more.',
        tell: 'Accuracy is a column on the shared board. Yours will be the one with a hole in it.',
        hud: 'Miss 8+',
        check: (s) => n(s.missed) >= 8,
        progress: (s) => n(s.missed) + ' / 8 missed',
      },
      {
        /* Same fix as `br-cold-engine`: "loose no perfect draws" was
           passed by not shooting, so it now requires that you keep
           shooting and simply stop being good at it. Six arrows is
           enough that the silence where the chime used to be is the
           thing everybody notices. */
        id: 'sh-no-perfects',
        text: 'Keep shooting after the fourth round — six arrows at least — and never find a perfect draw again.',
        tell: 'A perfect draw rings, and three people hear every one. What they notice is yours going quiet.',
        hud: 'Keep shooting, stop ringing',
        check: (s) => n(s.lateShots) >= 6 && n(s.perfectsLate) === 0,
        progress: (s) => (n(s.perfectsLate) > 0 ? 'A perfect draw already rang'
          : n(s.lateShots) + ' / 6 loosed since round four'),
      },
      {
        id: 'sh-off-the-line',
        text: 'Spend one entire round away from the shooting line.',
        tell: 'Your marker is missing from the line on everyone’s HUD for a whole round.',
        hud: 'Sit one round out',
        check: (s) => n(s.roundsOffLine) >= 1,
        progress: (s) => (n(s.roundsOffLine) >= 1 ? 'Done — one round sat out'
                                                  : 'Still on the line'),
      },
    ],
  };

  /* Any mission without a deck deals nothing, which is the correct
     behaviour and not a bug: a mission whose sabotage nobody could see
     should not have one invented for it. */
  function draw(missionId, rng) {
    const deck = DECKS[missionId];
    if (!deck || !deck.length) return null;
    const r = typeof rng === 'function' ? rng() : Math.random();
    return deck[Math.floor(r * deck.length) % deck.length];
  }

  const forMission = (missionId) => DECKS[missionId] || [];
  const byId = (id) => {
    for (const k in DECKS) {
      const hit = DECKS[k].find(c => c.id === id);
      if (hit) return hit;
    }
    return null;
  };

  // the readable half, which is all a guest is ever sent
  const wire = (c) => (c ? { id: c.id, text: c.text, tell: c.tell, hud: c.hud } : null);

  return { draw, forMission, byId, wire, DECKS };
})();
