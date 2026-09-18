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
        text: 'Here’s a 30-second tour. It shows you exactly what to click. '
            + 'Press <b>Next</b> to go on, or skip it if you know your way around.',
        nextLabel: 'Show me' },
      { target: '#play-go',
        title: 'Play the Night',
        text: 'The full game, for <b>3 friends on voice chat</b>. One of you is secretly '
            + 'the <b style="color:#ff6b82">Traitor</b>. Play a mission together, then decide '
            + 'at the fire who it was.' },
      { target: '#play-missions',
        title: 'Missions',
        text: 'Practise the four missions <b>on your own</b>. No lying, no pressure. '
            + 'This is the best place to start.' },
      { target: '#play-dressing',
        title: 'Dressing Room',
        text: 'Pick your name and how you look. The other players see exactly this.' },
      { target: '.play-foot',
        title: 'Settings',
        text: 'Your banked prize money, sound, reduced motion and scenery detail. '
            + 'Use <b>Low</b> scenery if the game feels slow.' },
      { target: '#play-missions', click: true,
        title: 'Your first move',
        text: 'Click <b>Missions</b> to try your first practice run.',
        touchText: 'Tap <b>Missions</b> to try your first practice run.',
        skipLabel: 'End tour' },
    ],

    title: [
      { target: '.mission-card-row .mission-card',
        title: 'Pick a mission',
        text: 'Each card is a mission. Clicking one opens its <b>briefing</b>, and nothing '
            + 'starts until you press Start.' },
      { target: '.mission-card-row .mission-invite',
        title: 'Invite friends',
        text: 'Want company? <b>Invite</b> opens a room for this mission and gives you a link '
            + 'for two friends.' },
      { target: '.mission-card-row .mission-card', click: true,
        title: 'Start with the Boat Race',
        text: 'Click it now. It’s the easiest mission to learn.',
        touchText: 'Tap it now. It’s the easiest mission to learn.',
        skipLabel: 'End tour' },
    ],

    brief: [
      { target: '#brief-setup',
        title: 'Set up your run',
        text: 'Choose a mode, a course and an optional <b>modifier card</b> that makes it harder '
            + 'but pays more. <b>The defaults are fine</b> for a first go.' },
      { target: '#brief-keys',
        title: 'Your controls',
        text: 'A reminder of the keys. You’ll practise each one in a moment.' },
      { target: '#brief-go', click: true,
        title: 'Start the mission',
        text: 'Click <b>Start Mission</b>. A short training run comes first, and the clock waits for you.',
        touchText: 'Tap <b>Start Mission</b>. A short training run comes first, and the clock waits for you.',
        skipLabel: 'End tour' },
    ],

    lobby: [
      { target: '.lobby-you .field',
        title: 'Your name',
        text: 'Type the name the other two will see. The <b>Dressing room</b> button changes your look.' },
      { target: '#lobby-host',
        title: 'Host a night',
        text: '<b>Create a room</b>, then read the four-letter code out loud to your two friends.' },
      { target: '.lobby-panel .code-entry',
        title: 'Or join one',
        text: 'Got a code from a friend? Type it here and press <b>JOIN ROOM</b>.' },
      { target: '#lobby-mic-btn',
        title: 'Turn your mic on',
        text: 'This is a <b>talking game</b>: the Traitor has a task they must say out loud. '
            + 'Once three of you are in, the host presses <b>START THE NIGHT</b>.' },
    ],

    mparty: [
      { target: '.mp-room',
        title: 'Your room',
        text: 'Read out the <b>code</b>, or press <b>Copy</b> and send the link. '
            + 'It opens the game straight into this room.' },
      { target: '#mp-mic',
        title: 'Mic on',
        text: 'Talk while you play. That’s half the fun, and the Traitor needs it.' },
      { target: '#mp-start',
        title: 'Start together',
        text: 'The host starts when everyone’s in. You’ll get quick control hints, '
            + 'but <b>the clock won’t wait</b> in multiplayer.' },
    ],
  };

  /* ---------------- missions ---------------- */

  const missions = {

    'boat-race': [
      ready(m => m.state === 'racing', 'boat race'),
      { title: 'Full throttle',
        text: 'Hold <b>W</b> to drive forward.',
        touchText: 'Push the <b>left stick up</b> to drive forward.',
        keys: K('W'), touchTarget: '#touch-controls .stick-zone', round: true,
        act: (m, I) => I.throttle() > 0.3, hold: 0.9 },
      { title: 'Steer',
        text: 'Use <b>A</b> and <b>D</b> to turn left and right.',
        touchText: 'Push the <b>stick left and right</b> to turn.',
        keys: K('A', 'D'), touchTarget: '#touch-controls .stick-zone', round: true,
        act: (m, I) => Math.abs(I.steer()) > 0.3, hold: 0.9 },
      { title: 'Boost',
        text: 'Hold <b>Space</b> for a burst of speed. Big air off a wave fills the tank again.',
        touchText: 'Hold <b>BOOST</b> for a burst of speed. Big air off a wave fills the tank again.',
        keys: K('Space'), touchTarget: '#touch-controls .boost-btn', round: true,
        act: (m, I) => I.held('boost'), hold: 0.5 },
      { title: 'Thread a gate',
        text: 'Drive through the <b>rings</b>. Every gate pays money and adds time. '
            + 'The <b style="color:#f2c14e">gold</b> one pays triple.',
        target: '#hud-hoops', glow: (m, I) => I.throttle() > 0.3,
        done: m => (m.gatesHit || 0) >= 1, hintTime: 10 },
      go('#hud-time', 'Beat the clock',
         'The clock is running now. Keep threading gates for more time. Go!'),
    ],

    shootout: [
      ready(m => m.state === 'live', 'shootout'),
      { title: 'Take aim',
        text: '<b>Click the screen</b> to grab the mouse, then move the mouse to look around.',
        touchTitle: 'Look around',
        touchText: '<b>Drag</b> anywhere on the right of the screen to look around.',
        keys: K('Mouse'), touchKeys: K('Drag'), touchAuto: 4,
        done: (m, I) => !I.isTouch && I.aimReady },
      { title: 'Walk',
        text: 'Move with <b>W A S D</b>. Hold <b>Q</b> to run.',
        touchText: 'Use the <b>left stick</b> to walk. Hold <b>RUN</b> to go faster.',
        keys: K('W', 'A', 'S', 'D'), touchTarget: '#touch-shoot .move-zone', round: true,
        act: (m, I) => len(I.moveAxes()) > 0.3, hold: 0.8 },
      { title: 'Draw and shoot',
        text: '<b>Hold</b> the left mouse button to pull the bow back, then <b>let go</b> to shoot. '
            + 'Full power takes half a second.',
        touchText: '<b>Hold DRAW</b> to pull the bow back, then <b>let go</b> to shoot. '
            + 'Full power takes half a second.',
        keys: K('LMB', '/', 'Space'), touchTarget: '#touch-shoot .draw-pad', round: true,
        glow: (m, I) => I.held('fire'), done: m => (m.shots || 0) >= 1 },
      { title: 'Steady your aim',
        text: 'Hold the <b>right mouse button</b> (or <b>Shift</b>) to slow time and steady your hand. It runs out, then slowly comes back.',
        touchText: 'Hold <b>FOCUS</b> to slow time and steady your hand. It runs out, then slowly comes back.',
        keys: K('RMB', '/', 'Shift'), touchTarget: '#touch-shoot .focus-pad', round: true,
        act: (m, I) => I.held('focus'), hold: 0.4 },
      { title: 'Hit something',
        text: 'Deer, birds, bottles and bells all pay. Lead moving targets, because arrows take time to land. '
            + '<b>Never shoot the white dove.</b>',
        target: '#sh-money', glow: (m, I) => I.held('fire'),
        done: m => (m.hits || 0) >= 1, hintTime: 10 },
      go('#sh-round', 'Clear the round',
         'The clock is running now. Every second you have left when a round is cleared is paid. Go!'),
    ],

    dive: [
      ready(m => m.state === 'live', 'dive'),
      { title: 'Take control',
        text: '<b>Click the screen</b>, then move the mouse to steer where you swim.',
        touchTitle: 'Steer',
        touchText: '<b>Drag</b> on the right of the screen to steer where you swim.',
        keys: K('Mouse'), touchKeys: K('Drag'), touchAuto: 4,
        done: (m, I) => !I.isTouch && I.aimReady },
      { title: 'Kick',
        text: 'Tap <b>Space</b> to kick. Kick just as the <b>ring</b> in the middle closes '
            + 'and your strokes chain: faster and cheaper on air.',
        touchText: 'Tap <b>KICK</b> to swim. Kick just as the <b>ring</b> in the middle closes '
            + 'and your strokes chain: faster and cheaper on air.',
        keys: K('Space'), target: '#dv-ring', touchTarget: '#touch-dive .kick-pad', round: true,
        act: (m, I) => I.held('fire'), count: 3 },
      { title: 'Fine moves',
        text: '<b>W A S D</b> paddles you gently, and walks you on land.',
        touchText: 'The <b>left stick</b> paddles you gently, and walks you on land.',
        keys: K('W', 'A', 'S', 'D'), touchTarget: '#touch-dive .scull-zone', round: true,
        act: (m, I) => len(I.moveAxes()) > 0.3, hold: 0.7 },
      { title: 'Watch your air',
        text: 'This bar is your <b>breath</b>. It drains underwater and refills at the surface. '
            + 'If it runs out you black out and drop everything.',
        target: '#dv-breath', auto: 6 },
      { title: 'Grab a chest',
        text: 'Swim down to a <b>glowing chest</b> and touch it. Deeper chests pay far more, '
            + 'but the swim back up is the hard part.',
        glow: (m, I) => I.held('fire'),
        done: m => !!(m.carry && m.carry.length), hintTime: 10 },
      go('#dv-compass', 'Bank it on the beach',
         'Follow the <b>compass</b> to the lit ring on the shore. Gold only counts once you’re standing in it. Go!'),
    ],

    ski: [
      ready(m => m.state === 'running', 'descent'),
      { title: 'Carve',
        text: 'Use <b>A</b> and <b>D</b> to turn. Leave yourself room before each bend.',
        touchText: 'Push the <b>stick left and right</b> to turn.',
        keys: K('A', 'D'), touchTarget: '#touch-controls .stick-zone', round: true,
        act: (m, I) => Math.abs(I.steer()) > 0.3, hold: 0.9 },
      { title: 'Tuck for speed',
        text: 'Hold <b>W</b> to tuck down and pick up speed.',
        touchText: 'Hold <b>TUCK</b> to crouch down and pick up speed.',
        keys: K('W'), touchTarget: '#touch-controls .aux-btn', round: true,
        act: (m, I) => I.throttle() > 0.3, hold: 0.7 },
      { title: 'Brake',
        text: 'Hold <b>S</b> to scrub off speed before a tight turn.',
        touchText: 'Pull the <b>stick down</b> to scrub off speed.',
        keys: K('S'), touchTarget: '#touch-controls .stick-zone', round: true,
        act: (m, I) => I.throttle() < -0.3, hold: 0.4 },
      { title: 'Jump',
        text: '<b>Hold Space</b> to crouch and charge up, then <b>let go</b> to jump.',
        touchText: '<b>Hold the jump button</b> to charge up, then <b>let go</b> to jump.',
        keys: K('Space'), touchTarget: '#touch-controls .boost-btn', round: true,
        glow: (m, I) => I.held('boost'),
        done: m => !!(m.skier && m.skier.airborne) },
      { title: 'Tricks',
        text: 'In the air, hold <b>Space</b> with <b>A/D</b> to spin or <b>W/S</b> to flip. '
            + '<b>Q/E</b> grab. Let go of Space to land. Land straight or you’ll crash!',
        touchText: 'In the air, keep holding the jump button and push the <b>stick</b> to spin or flip. '
            + '<b>MUTE</b> and <b>TAIL</b> grab. Let go to land. Land straight or you\u2019ll crash!',
        keys: K('Space', 'A', 'D'), touchKeys: null, auto: 6 },
      go('#sk-time', 'Race the mountain',
         'The clock is running now. Hoops, tricks and clean lines all pay. Go!'),
    ],
  };

  /* One card, only ever shown on the Traitor's own screen. */
  const traitorTask = [
    { target: '#agenda-chip', kicker: 'Only you can see this',
      title: 'Your secret task',
      text: 'Say it <b>out loud</b> during the mission without getting caught, then press '
          + '<b>I said it</b> (or <b>T</b>). Leave it unmarked and you’ll be exposed at the fire.',
      touchText: 'Say it <b>out loud</b> during the mission without getting caught, then tap '
          + '<b>I said it</b>. Leave it unmarked and you’ll be exposed at the fire.',
      hintTime: 10 },
  ];

  return { menus, missions, traitorTask };
})();
