/* ------------------------------------------------------------------
   tutorial-steps.js — what every tour says, and what it waits for.

   Pure data, read by `tutorial.js`. A step is:

     title / text           the card; `touchTitle` / `touchText` on a phone,
                            `hintTitle` / `hintText` when others are playing
     keys                   big keycaps: 'W', 'Space', 'LMB', 'RMB', 'Mouse',
                            '/' for "or". A touchscreen shows a thumb instead.
     target / touchTarget   what the gold ring goes round
     act (m, Input)         the thing to do — done once it has been true for
                            `hold` seconds, or has started `count` times
     glow (m, Input)        just lights the keycap; `done` finishes the step
     done (m, Input)        finishes the step the moment it is true
     click                  finishes when the ringed element is clicked
     auto                   seconds before it moves on by itself
     go                     from this step on, the mission clock runs
     guidedOnly             left out when anybody else is in the room
     welcome / offer        the big first card / its "turn tutorials off"

   A step with none of act, done, click or auto gets a Next button.
   Every check reads public fields only; one that throws counts as done.
------------------------------------------------------------------ */
const TutorialSteps = (() => {

  const K = (...k) => k;
  const len = (v) => Math.hypot(v.x, v.y);

  // the start line: the card that waits out the countdown
  const ready = (live, what) => ({
    kicker: 'Training run',
    title: 'Your first ' + what,
    text: 'A few quick steps first. <b>The clock is paused</b> until you’ve tried each control.',
    hintTitle: 'First time here?',
    hintText: 'Quick control hints are coming. The clock is running, so learn as you go.',
    done: live,
  });

  const go = (target, title, text) => ({
    kicker: 'Go!', title, text, target, go: true, auto: 3.4, pad: 6,
  });

  /* ---------------- menus ---------------- */

  const menus = {
    play: [
      { welcome: true, offer: true, kicker: 'Welcome',
        title: 'Welcome to The Traitors',
        text: 'Here’s a 20-second tour. Press <b>Next</b> to go on, or skip it if you know your way around.',
        nextLabel: 'Show me' },
      { target: '#play-go',
        title: 'Play the Game',
        text: 'The full game, for <b>5 to 8 people on voice chat</b> — fill empty chairs with AI players. '
            + 'Work the castle for the pot while a <b style="color:#ff6b82">Traitor</b> slips poison to '
            + 'somebody in plain sight. Then banish who you think did it.' },
      { target: '#play-dressing',
        title: 'Dressing Room',
        text: 'Pick your name and how you look. The other players see exactly this.' },
      { target: '#play-castle',
        title: 'Explore the castle',
        text: 'Walk the house on your own before a game: the hall, the great hall, the round table and the turret.' },
      { target: '.play-foot',
        title: 'Settings',
        text: 'Your banked prize money, sound, reduced motion and scenery detail. '
            + 'Use <b>Low</b> scenery if the game feels slow.',
        skipLabel: 'End tour' },
    ],

    lobby: [
      { target: '.lobby-you .field',
        title: 'Your name',
        text: 'Type the name the others will see. The <b>Dressing room</b> button changes your look.' },
      { target: '#lobby-host',
        title: 'Host a game',
        text: '<b>Create a room</b>, then read the four-letter code out loud to your friends.' },
      { target: '.lobby-panel .code-entry',
        title: 'Or join one',
        text: 'Got a code from a friend? Type it here and press <b>JOIN ROOM</b>.' },
      { target: '#lobby-mic-btn',
        title: 'Turn your mic on',
        text: 'This is a <b>talking game</b>. Once five seats are filled, the host presses <b>START THE NIGHT</b>.' },
    ],
  };

  // the missions are gone; nothing asks for these any more
  const missions = {};
  const traitorTask = [];

  return { menus, missions, traitorTask };
})();
