/* ------------------------------------------------------------------
   agendas.js — the Traitor's secret task.

   One card per mission, dealt only to a Traitor, and the single hardest
   thing to get right in the whole design. The old deck was built to be
   *catchable*. This one is built to be catchable and then survivable,
   which is a different game and a much better one.

   Every card here has three parts and needs all three:

     `check`  what you actually have to do. It is loud. Performing it
              the obvious way moves a number two other people are
              staring at, live, while you move it.

     `tell`   the thing they see. Not a comment — the sentence a
              Faithful will say at the table. A card without one is a
              formality, not a task, and does not go in the deck.

     `cover`  the way out. A second, far harder run of play that leaves
              the same number in a place nobody can argue with: last
              place after leading all race, ten misses inside a chain of
              twelve, a dove paid back before the strip finished
              falling. The task is never optional. The alibi always is.

   So the deck reads: any Traitor can complete these. Only a very good
   one completes them and walks into the round table with the board on
   their side. The gap between those two is the entire evening.

   `check(stats)` and `cover(stats)` run on the host against the stats
   that mission reported. `progress(stats)` is the private line on the
   Traitor's own HUD — the task, how far along it is, and whether the
   alibi is currently holding, because an alibi you cannot see the state
   of is one you would never dare go for.
------------------------------------------------------------------ */
const Agendas = (() => {

  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const pct = (v) => Math.round(U.clamp(n(v), 0, 1) * 100) + '%';

  const DECKS = {

    /* ---------------- Boat Race ----------------
       Three boats on one course, all of them in each other's mirrors
       the whole way round, and a strip along the edge of the screen
       carrying everybody's position and everybody's boost meter at
       twenty frames a second. There is nowhere in this mission to do
       anything quietly. There is only doing it beautifully. */

    'boat-race': [
      {
        id: 'br-thrown-line',
        text: 'Cross the line last.',
        tell: 'Last is the first column on the board, and two people spent the whole channel watching how you got there.',
        alibi: 'Lead the field for half the race and lose it by under a second and a half. Nobody has ever suspected the boat that was winning.',
        hud: 'Finish last',
        check: (s) => s.finished === true && n(s.of) >= 2 && s.place === s.of,
        cover: (s) => s.finished === true && n(s.elapsed) > 0
                      && n(s.leadTime) >= n(s.elapsed) * 0.5
                      && n(s.finishGap) <= 1.5,
        progress: (s) => {
          const led = n(s.elapsed) > 0 ? n(s.leadTime) / n(s.elapsed) : 0;
          if (!s.finished) {
            return (s.place === s.of ? 'Last · ' : 'P' + (s.place || '?') + ' · ')
                 + pct(led) + ' of it in front (need 50%)';
          }
          return (s.place === s.of ? 'Last — ' : 'NOT LAST — ')
               + (led >= 0.5 && n(s.finishGap) <= 1.5
                  ? 'and you led it. Alibi holding.'
                  : 'no alibi: ' + pct(led) + ' in front, ' + n(s.finishGap).toFixed(1) + 's back');
        },
      },
      {
        id: 'br-burn-early',
        text: 'Spend your entire boost meter before the halfway marker — and cross the line with it still empty.',
        tell: 'Everyone’s meter is on the shared strip all race. Yours empties early and never comes back, and a flat bar in the home stretch is a boat that has stopped trying.',
        alibi: 'Win it anyway. A dry meter and a hull in front is the best drive anybody at that table will see this year.',
        hud: 'Burn it early, arrive dry',
        needs: (f) => !f.noBoost,
        check: (s) => s.finished === true && n(s.boostSpentEarly) >= 0.8
                      && n(s.boostAtFinish) <= 0.05,
        cover: (s) => s.finished === true && s.place === 1 && n(s.of) >= 2,
        progress: (s) => {
          if (n(s.boostSpentEarly) < 0.8) {
            return 'Burned ' + pct(s.boostSpentEarly) + ' of a meter before halfway (need 80%)';
          }
          if (n(s.boostAtFinish) > 0.05 && s.finished) return 'You refilled it — meter was not dry';
          return 'Meter spent · run it home dry'
               + (s.place === 1 ? ' · leading, alibi holding' : ' · P' + (s.place || '?') + ', no alibi');
        },
      },
      {
        id: 'br-cold-gold',
        text: 'Three times, line up a gold ring — then take the safe one beside it instead.',
        tell: 'Gold is most of the money in this channel. Three declined and you come back short of two people who ran the same water, which is arithmetic anybody can do at a table.',
        alibi: 'Thread everything else dead centre and drop nothing. Eight perfect passes and a clean sheet pays the gold back, and the board shows an immaculate run rather than a cheap one.',
        hud: 'Decline 3 gold rings',
        // Golden Channel puts a gold ring in every gate and no safe one
        // beside it, so there is nothing to decline in favour of
        needs: (f) => !f.allRisk,
        check: (s) => n(s.goldDeclined) >= 3,
        cover: (s) => n(s.perfects) >= 8 && n(s.gatesMissed) === 0,
        progress: (s) => n(s.goldDeclined) + ' / 3 gold left on the water · '
                       + (n(s.gatesMissed) > 0
                          ? 'alibi gone (' + n(s.gatesMissed) + ' fumbled)'
                          : n(s.perfects) + ' / 8 perfect'),
      },
      {
        id: 'br-dead-stop',
        text: 'Come to a dead stop in open water — a full second at walking pace, with the race still running.',
        tell: 'Your marker stops on the shared strip while two boats keep going. A second is six boat lengths, and it opens up live in front of both of them.',
        alibi: 'Take the second back. Stall, then still come home inside two seconds of the boat ahead, and the whole thing becomes a story about the recovery.',
        hud: 'Stop dead for one second',
        check: (s) => n(s.longestStop) >= 1.0,
        cover: (s) => s.finished === true && n(s.place) <= 2 && n(s.finishGap) <= 2.0,
        progress: (s) => (n(s.longestStop) >= 1
          ? 'Stalled · ' + (n(s.place) <= 2 ? 'P' + n(s.place) + ' — claw back to within 2s'
                                            : 'P' + (s.place || '?') + ', no alibi left')
          : 'Longest stop ' + n(s.longestStop).toFixed(1) + 's / 1.0s'),
      },
    ],

    /* ---------------- Shootout ----------------
       One clearing, one flock, three people facing the same sky — and a
       strip down the side with everybody's money on it, updated from
       each player's own bow twenty times a second. It is the only
       number in the game that can go backwards. */

    shootout: [
      {
        id: 'sh-open-net',
        text: 'Let five birds leave the clearing past you.',
        tell: 'Every escape is called out to all three of you, where it happened. Five at your end of the wood, and your row on the strip sitting still while they go.',
        alibi: 'Finish top of the strip regardless. Nobody counts the ones that got away from the person who took the most.',
        hud: 'Let 5 through',
        check: (s) => n(s.escapedNearMe) >= 5,
        cover: (s) => s.topOfField === true,
        progress: (s) => n(s.escapedNearMe) + ' / 5 let through · '
                       + (s.topOfField ? 'top of the strip, alibi holding' : 'not top of the strip'),
      },
      {
        id: 'sh-dove',
        text: 'Put an arrow through a dove.',
        tell: 'A dove is protected, and the fine comes off your total in front of everyone. It is the one number out there that can go backwards, and it just did, on your row.',
        alibi: 'Take it back before anybody reads it. Shoot it into the middle of a flock and be above your old total within eight seconds — a dip that short is a flicker nobody can swear to.',
        hud: 'One dove',
        // under Sudden Death a dove ends the night on the spot: the task
        // would be complete and the run would be over, which is not a
        // risk, it is a forfeit
        needs: (f) => !f.suddenDeath,
        check: (s) => n(s.doves) >= 1,
        cover: (s) => n(s.doves) >= 1 && s.doveRecovered === true,
        progress: (s) => (n(s.doves) < 1 ? 'No dove yet · line one up inside a flock'
          : (s.doveRecovered === true
              ? 'Dove taken and paid back in ' + n(s.doveRecoverT).toFixed(1) + 's — alibi holding'
              : 'Dove taken · ' + n(s.doveRecoverT).toFixed(1) + 's and still below it')),
      },
      {
        id: 'sh-cold-quiver',
        text: 'Put ten arrows into empty air.',
        tell: 'Ten arrows that hit nothing is a hole in the board and ten whistles the other two can hear from where they are standing.',
        alibi: 'Hold a chain of twelve while you do it. Ten misses inside a hail of arrows is a style; ten in a quiet wood is a confession.',
        hud: 'Miss 10',
        check: (s) => n(s.missed) >= 10,
        cover: (s) => n(s.bestChain) >= 12,
        progress: (s) => n(s.missed) + ' / 10 into the trees · best chain '
                       + n(s.bestChain) + ' / 12',
      },
      {
        id: 'sh-long-walk',
        text: 'Spend an entire round away from the shooting line.',
        tell: 'Your figure is missing from the line for a whole round and your row stops climbing, and both of them are looking at the clearing you are not standing in.',
        alibi: 'Walk back in and clear the next round without a single miss. Nobody asks where you were if that is what you do when you return.',
        hud: 'Sit one round out',
        check: (s) => n(s.roundsOffLine) >= 1,
        cover: (s) => s.cleanRoundAfterWalk === true,
        progress: (s) => (n(s.roundsOffLine) < 1
          ? 'Still on the line · ' + Math.round(n(s.offLineT)) + 's away this round'
          : 'One round sat out · '
            + (s.cleanRoundAfterWalk === true ? 'came back clean, alibi holding'
                                              : 'now clear one without a miss')),
      },
    ],
  };

  /* Any mission without a deck deals nothing, which is the correct
     behaviour and not a bug: a mission whose sabotage nobody could see
     should not have one invented for it.

     `flags` are the twist the night drew for that mission. A card whose
     `needs` says no to them is not dealt, because being handed a task
     the run has made impossible is not a risk — it is a sentence, and
     the Traitor would be exposed for something nobody could have done.
     If the twist rules out everything, the whole deck comes back: a
     hard card beats no card at all. */
  function draw(missionId, rng, flags) {
    const deck = DECKS[missionId];
    if (!deck || !deck.length) return null;
    const f = flags || {};
    const pool = deck.filter(c => typeof c.needs !== 'function' || c.needs(f));
    const use = pool.length ? pool : deck;
    const r = typeof rng === 'function' ? rng() : Math.random();
    return use[Math.floor(r * use.length) % use.length];
  }

  const forMission = (missionId) => DECKS[missionId] || [];
  const byId = (id) => {
    for (const k in DECKS) {
      const hit = DECKS[k].find(c => c.id === id);
      if (hit) return hit;
    }
    return null;
  };

  /* Everything a mission needs to draw the private chip: how far along
     the task is, and whether the alibi is standing up right now. Both
     are read from the same stats the host will judge on, so the chip
     can never be telling you something the verdict disagrees with. */
  function state(cardId, stats) {
    const c = byId(cardId);
    if (!c) return null;
    const s = stats || {};
    const safe = (fn, dflt) => { try { return fn(s); } catch (e) { return dflt; } };
    return {
      id: c.id,
      prog: safe(c.progress, c.hud) || c.hud || '',
      done: !!safe(c.check, false),
      covered: !!safe(c.cover, false),
      alibi: c.alibi || '',
    };
  }

  // the readable half, which is all a guest is ever sent
  const wire = (c) => (c
    ? { id: c.id, text: c.text, tell: c.tell, alibi: c.alibi, hud: c.hud }
    : null);

  return { draw, forMission, byId, state, wire, DECKS };
})();
