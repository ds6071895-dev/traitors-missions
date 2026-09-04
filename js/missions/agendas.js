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
        cover: (s) => s.finished === true && s.topOfField === true,
        progress: (s) => n(s.escapedNearMe) + ' / 5 let through · '
                       + (s.finished && s.topOfField
                          ? 'finished top, alibi holding'
                          : s.topOfField ? 'top now — hold it to the finish'
                          : 'not top of the strip'),
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

    /* ---------------- The Dive ----------------
       The best deck in the game to write, because the mission was
       built backwards from the thing that makes it possible: **every
       way of losing money down there is also what the best diver at
       the table does.** Coming up empty is what greed looks like.
       Blacking out is what a fourth chest looks like. And the money
       does not vanish when you drop it — it moves — so "the pot is
       short" is not evidence of anything.

       So the tells here are all *numbers on the board that also
       describe an ambitious run*, and every alibi is the harder version
       of the same act. The only card that breaks the pattern is the
       last one, and it breaks it on purpose: it is the first agenda in
       the game about something the other two physically watched you
       not do. */

    dive: [
      {
        id: 'dv-empty-trench',
        text: 'Go to the trench and come back with nothing.',
        tell: 'An empty trip is the loudest thing on that board, and it is sitting '
            + 'next to the deepest number anybody posted. Forty metres down and back '
            + 'with your hands open is a decision, not an accident.',
        alibi: 'Be the deepest diver of the three *and* out-bank both of them. Nobody '
             + 'audits the empty trip of the person who took the most money and went '
             + 'the furthest down to do it.',
        hud: 'One empty trench trip',
        check: (s) => n(s.trenchTrips) >= 1 && n(s.trenchEmpty) >= 1,
        cover: (s) => n(s.deepest) >= n(s.maxOtherDeepest)
                      && n(s.banked) >= n(s.maxOtherBanked)
                      && n(s.maxOtherBanked) > 0,
        progress: (s) => {
          if (n(s.trenchTrips) < 1) return 'No trench trip yet · deepest ' + Math.round(n(s.deepest)) + 'm';
          if (n(s.trenchEmpty) < 1) return 'Trench trips ' + n(s.trenchTrips) + ' · none empty yet';
          const deep = n(s.deepest) >= n(s.maxOtherDeepest);
          const rich = n(s.banked) >= n(s.maxOtherBanked);
          return 'Empty trench trip logged · '
               + (deep && rich ? 'deepest and top of the strip — alibi holding'
                  : (deep ? 'deepest, but ' + U.money(n(s.maxOtherBanked) - n(s.banked))
                            + ' short on money'
                          : 'not the deepest (' + Math.round(n(s.maxOtherDeepest)) + 'm out there)'));
        },
      },
      {
        id: 'dv-two-blackouts',
        text: 'Black out twice.',
        tell: 'Both of them are on the board, and both times everything in your hands '
            + 'went onto the sand where anybody could take it. Two is not bad luck, '
            + 'two is a habit.',
        alibi: 'Be holding more than either of them ever held when you do it. You did '
             + 'not drown lazy — you drowned rich, and the biggest carry of the night '
             + 'is in the last column.',
        hud: 'Black out twice',
        check: (s) => n(s.blackouts) >= 2,
        cover: (s) => n(s.peakCarryValue) > n(s.maxOtherPeakCarry)
                      && n(s.maxOtherPeakCarry) > 0,
        progress: (s) => n(s.blackouts) + ' / 2 blackouts · biggest carry '
                       + U.money(n(s.peakCarryValue))
                       + (n(s.peakCarryValue) > n(s.maxOtherPeakCarry)
                          ? ' — biggest of the three, alibi holding'
                          : ' vs ' + U.money(n(s.maxOtherPeakCarry)) + ' out there'),
      },
      {
        id: 'dv-quiet-bell',
        text: 'Bank nothing in the last minute.',
        tell: 'Your row stops climbing with sixty seconds left while two other rows '
            + 'keep going. Everyone can see the end of a run coming, and everyone '
            + 'can see who stopped earning before it.',
        alibi: 'Surface on the bell holding the single biggest thing anybody carried '
             + 'all night. A minute underwater with a trench chest in your hands is '
             + 'not idling, it is the boldest thing at the table.',
        hud: 'Nothing banked in the last minute',
        check: (s) => s.finished === true && n(s.lastMinuteBanked) === 0,
        cover: (s) => n(s.finalCarryValue) >= 4000
                      && n(s.finalCarryValue) > n(s.maxOtherPeakCarry),
        progress: (s) => (n(s.lastMinuteBanked) > 0
          ? U.money(n(s.lastMinuteBanked)) + ' banked in the last minute — task failed'
          : 'Nothing banked late · holding ' + U.money(n(s.finalCarryValue))
            + (n(s.finalCarryValue) >= 4000 ? ' — come up on the bell with it' : ' (need a big one)')),
      },
      {
        id: 'dv-never-deep',
        text: 'Never go below the wreck.',
        tell: 'Deepest is a column, and yours is the shallow one. Two people went to '
            + 'the trench and you did not, and the pot is short by exactly the '
            + 'difference.',
        alibi: 'Make more trips than either of them and still out-earn one. A diver '
             + 'who never stopped moving and came home ahead of somebody was working '
             + 'the shelf, not avoiding the deep.',
        hud: 'Stay above 34m',
        needs: (f) => !f.deepestOnly,
        check: (s) => s.finished === true && n(s.deepest) < 34,
        cover: (s) => n(s.trips) > n(s.otherTrips) / 2 && n(s.trips) >= 8
                      && n(s.banked) > 0 && n(s.banked) >= n(s.maxOtherBanked) * 0.75,
        progress: (s) => (n(s.deepest) >= 34
          ? 'You went to ' + Math.round(n(s.deepest)) + 'm — task failed'
          : 'Deepest ' + Math.round(n(s.deepest)) + 'm / 34m · ' + n(s.trips)
            + ' trips, ' + U.money(n(s.banked))
            + (n(s.trips) >= 8 && n(s.banked) >= n(s.maxOtherBanked) * 0.75
               ? ' — alibi holding' : ' (work harder)')),
      },
      {
        id: 'dv-passed-drop',
        text: 'Swim past a dropped chest and leave it there.',
        tell: 'This is the one they *watch*. A pile on the sand is lit from across the '
            + 'loch, and you went by it close enough to touch. Everything else in this '
            + 'game is a number read afterwards; this is a thing two people saw you '
            + 'not do.',
        alibi: 'Have your hands full when you do it. Nobody argues with a diver '
             + 'carrying everything they can already carry.',
        hud: 'Leave a dropped pile',
        check: (s) => n(s.passedDrops) >= 1,
        cover: (s) => n(s.passedDrops) >= 1 && n(s.peakCarry) >= 4,
        progress: (s) => (n(s.passedDrops) < 1
          ? 'No pile passed yet · wait for somebody to drown'
          : n(s.passedDrops) + ' pile(s) left on the sand · '
            + (n(s.peakCarry) >= 4 ? 'you were full, alibi holding'
                                   : 'your hands were not full — no alibi')),
      },
    ],

    /* ---------------- The Descent ----------------
       Three people on one mountain, all of them on the same strip with
       everybody's position and — the number this whole deck turns on —
       everybody's meter, live, at five frames a second. The meter is
       the mission: it is the multiplier on every pound, it climbs when
       you ski well and it empties when you stop, and it is a single
       digit that two other people can read at a glance from anywhere
       on the hill.

       So there is nowhere on this mountain to be slow quietly. There is
       only being slow somewhere that makes sense — in the trees, off a
       cliff, or down a line nobody else had the nerve to take. Every
       alibi in this deck is the same shape: do the damage in the most
       expensive place on the mountain and let the board argue about
       whether that was bravery. */

    'ski': [
      {
        id: 'sk-bottom-rung',
        text: 'Cross the finish line on the bottom rung of the meter.',
        tell: 'Everybody’s meter is on the shared strip the whole way down. Arriving at ×1 is a skier who stopped trying somewhere, and the strip says roughly where.',
        alibi: 'Have it at ×5 or better first. A meter that was the highest on the mountain and is the lowest at the line is a terrible last thirty seconds, not a decision — and everyone watched you earn it.',
        hud: 'Finish on ×1',
        check: (s) => s.finished === true && n(s.flowAtFinish) <= 1,
        cover: (s) => s.finished === true && n(s.peakFlow) >= 5,
        progress: (s) => {
          const peak = n(s.peakFlow) || 1;
          if (!s.finished) {
            return 'On ×' + (n(s.flowAtFinish) || 1) + ' · peaked ×' + peak
                 + (peak >= 5 ? ' — alibi ready' : ' (need ×5 for the alibi)');
          }
          return (n(s.flowAtFinish) <= 1 ? 'Finished on ×1 — ' : 'NOT on ×1 — ')
               + (peak >= 5 ? 'and you had ×' + peak + '. Alibi holding.'
                            : 'no alibi: you never got above ×' + peak + '.');
        },
      },
      {
        id: 'sk-never-cut',
        text: 'Get to the bottom without taking a single shortcut.',
        tell: 'Every mouth on the mountain is lit and announced, and the board has a Cuts column. Nought out of five next to two people on four is not a line choice, it is a refusal.',
        alibi: 'Beat them anyway. The groomed run is the long way round and everybody knows it, so arriving first having taken none of them is the best skiing anybody at that table will see this year.',
        hud: 'Take no shortcuts',
        check: (s) => s.finished === true && arr(s.chutesTaken).length === 0
                      && arr(s.chutesPassed).length >= 3,
        cover: (s) => s.finished === true && s.place === 1 && n(s.of) >= 2,
        progress: (s) => {
          const took = arr(s.chutesTaken).length, past = arr(s.chutesPassed).length;
          if (!s.finished) {
            return took ? 'You took ' + arr(s.chutesTaken)[0] + ' — task failed'
                        : 'Clean · ' + past + ' passed up'
                          + (past >= 3 ? '' : ' (need 3)');
          }
          return (took === 0 ? 'None taken — ' : 'You took ' + took + ' — ')
               + (s.place === 1 ? 'and you won it. Alibi holding.'
                                : 'P' + (s.place || '?') + ', no alibi');
        },
      },
      {
        id: 'sk-stall',
        text: 'Come to a near-standstill for five seconds in one go.',
        tell: 'The strip is everybody’s position on the mountain, live. Yours simply stops, and there is no gate, no tree and no landing near where it stopped.',
        alibi: 'Do it in the wood. A skier who spent that five seconds inside the trees was picking a line through them, and the board will see eight tree bonuses in the same run to prove it.',
        hud: 'Five seconds at a standstill',
        needs: (f) => !f.avalanche,
        check: (s) => n(s.slowestStretch) >= 5,
        cover: (s) => n(s.trees) >= 8,
        progress: (s) => {
          const st = n(s.slowestStretch);
          if (st < 5) return 'Longest stop ' + st.toFixed(1) + 's (need 5s) · '
                            + n(s.trees) + ' tree bonuses banked';
          return 'Stopped for ' + st.toFixed(1) + 's · '
               + (n(s.trees) >= 8 ? n(s.trees) + ' in the wood. Alibi holding.'
                                  : 'only ' + n(s.trees) + ' in the wood — no alibi (need 8)');
        },
      },
      {
        id: 'sk-miss-ten',
        text: 'Miss ten hoops.',
        tell: 'A missed hoop makes a noise, drops your meter a step and costs the run seconds — three things two other people are looking at while it happens.',
        alibi: 'Take four gold ones. Every gold hoop on this mountain is off the natural line, so nobody who was hunting them threaded everything, and a board with four golds and ten misses on the same row reads as greed rather than sabotage.',
        hud: 'Miss ten hoops',
        check: (s) => n(s.gatesMissed) >= 10,
        cover: (s) => n(s.golds) >= 4,
        progress: (s) => 'Missed ' + n(s.gatesMissed) + '/10 · '
                       + n(s.golds) + ' gold taken'
                       + (n(s.golds) >= 4 ? ' — alibi holding' : ' (need 4)'),
      },
      {
        id: 'sk-yardsale',
        text: 'Fall over three times.',
        tell: 'A crash is the loudest thing that happens on this mountain: the strip stops dead, your meter goes to ×1, and it does all of that three times.',
        alibi: 'Put all three of them in the trees. Three falls in the open is a bad skier; three falls inside the wood, with the tree bonuses on the board to show for it, is somebody who was going for the money.',
        hud: 'Three crashes',
        needs: (f) => !f.oneCrash,
        check: (s) => n(s.crashes) >= 3,
        cover: (s) => n(s.trees) >= 10,
        progress: (s) => 'Down ' + n(s.crashes) + '/3 · '
                       + n(s.trees) + ' tree bonuses'
                       + (n(s.trees) >= 10 ? ' — alibi holding' : ' (need 10)'),
      },
      {
        id: 'sk-bail',
        text: 'Enter a shortcut and come out of the side of it instead of the bottom.',
        tell: 'Entering one is announced to the mountain and bailing out of it drops your meter half a rung. On the strip it is a line that leaves the run, slows down, and comes back.',
        alibi: 'Complete two others. A skier who bailed one line and cleaned two more was reading them, not avoiding them — and the Cuts column is the only place on that board anybody looks twice.',
        hud: 'Bail out of a shortcut',
        check: (s) => n(s.chutesBailed) >= 1,
        cover: (s) => arr(s.chutesTaken).length >= 2,
        progress: (s) => {
          const done = arr(s.chutesTaken).length;
          if (!n(s.chutesBailed)) return 'No bail yet · ' + done + ' completed';
          return 'Bailed ' + n(s.chutesBailed) + ' · ' + done + ' completed'
               + (done >= 2 ? ' — alibi holding' : ' (need 2)');
        },
      },
      {
        id: 'sk-no-air',
        text: 'Get to the bottom without landing a single trick.',
        tell: 'This mountain is nothing but kickers and the board has an Air column. A run with nothing in it is a run somebody skied round the whole thing.',
        alibi: 'Take two shortcuts instead. A line with no air in it and two cuts nobody else dared is a purist picking the fastest way down, and it is a genuinely defensible way to ski this hill.',
        hud: 'Land no tricks',
        needs: (f) => !f.bigAir,
        check: (s) => s.finished === true && n(s.tricks) === 0 && n(s.airTime) < 2.0,
        cover: (s) => arr(s.chutesTaken).length >= 2,
        progress: (s) => {
          const cut = arr(s.chutesTaken).length;
          if (n(s.tricks) > 0) return n(s.tricks) + ' landed — task failed';
          return 'Clean · ' + n(s.airTime).toFixed(1) + 's off the snow (under 2.0s) · '
               + cut + ' cuts' + (cut >= 2 ? ' — alibi holding' : ' (need 2)');
        },
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
     If a future combination rules out the whole deck, no card is dealt. */
  function draw(missionId, rng, flags) {
    const deck = DECKS[missionId];
    if (!deck || !deck.length) return null;
    const f = flags || {};
    const pool = deck.filter(c => typeof c.needs !== 'function' || c.needs(f));
    // Never fall back to cards the run explicitly ruled out. Current
    // twists always leave something in each deck, but returning no card is
    // still fairer than exposing somebody for an impossible instruction.
    if (!pool.length) return null;
    const use = pool;
    const r = n(typeof rng === 'function' ? rng() : Math.random());
    const i = Math.max(0, Math.min(use.length - 1, Math.floor(r * use.length)));
    return use[i];
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
