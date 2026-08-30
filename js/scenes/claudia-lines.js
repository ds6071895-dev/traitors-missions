/* ------------------------------------------------------------------
   claudia-lines.js — everything anybody says, as data.

   The scenes hold camera and timing; none of them holds prose. That
   split is worth keeping: rewriting the show should be editing this
   file, and adding a language later should be adding a sibling to it.

   Most beats have several variants and are drawn from the run seed, so
   a second run is not a recital of the first — but a shared seed is
   still a shared night, which is the rule everywhere else in this
   codebase and there is no reason for the words to break it.

   `{name}`, `{mission}`, `{twist}`, `{pot}` and `{count}` are filled by
   the caller. Sentences are kept short on purpose: `Voice` speaks one
   at a time and puts a real pause at every full stop, so full stops are
   the timing, and a line written as one long clause is a line delivered
   in a rush.
------------------------------------------------------------------ */
const ClaudiaLines = (() => {

  const SETS = {

    /* ---------------- the hill ---------------- */

    welcome: [
      ['Welcome to the Highlands.',
       'Somewhere below us there is a castle, a fire, and a great deal of money.',
       'Getting to it is the easy part.'],
      ['There you are. Come up — the view is the best part of the day.',
       'Three of you. One pot. And a whole evening to get through.'],
      ['Good. You made it up the hill.',
       'Look at it. Miles of nothing, and every bit of it is watching you.'],
    ],

    theRules: [
      ['Here is how tonight works.',
       'You will play for the pot. You will sit at the table and talk.',
       'And then, by the fire, you will decide what you believe.'],
      ['Two missions. One round table. One fire.',
       'Everything you earn goes in the pot. The pot goes to whoever is still standing at the end of the night.'],
    ],

    roleIntro: [
      ['But first — the only thing that matters.',
       'Among the three of you there may be a Traitor.',
       'There may not. I am not going to tell you which.'],
      ['Before anything else, you should know what you are.',
       'One of you may be a Traitor. It is possible that none of you is.',
       'That is the last honest thing anybody will say tonight.'],
    ],

    roleFaithful: [
      ['You are a Faithful.',
       'You want the pot, and you want it clean. Find the Traitor — if there is one at all.'],
      ['You are a Faithful. Ordinary, honest, and completely in the dark.',
       'Welcome to the worst seat in the game.'],
    ],

    roleTraitor: [
      ['You are a Traitor.',
       'Say nothing. Earn with them, sit with them, and be there at the end when the fire goes out.'],
      ['You are the Traitor.',
       'The pot is already yours. All you have to do is survive two other people deciding otherwise.'],
    ],

    firstMission: [
      ['Now. Your first mission.',
       '{mission}.',
       'Everything you take from it goes into the pot.'],
      ['Down you go. Tonight it is {mission}.',
       'Earn well. You will want the money to be worth arguing about.'],
    ],

    twist: [
      ['One more thing. Tonight it is {twist}.',
       '{twistBlurb}'],
      ['And the Highlands have an opinion. {twist}.',
       '{twistBlurb}'],
      ['Oh — and {twist} is in play.',
       '{twistBlurb}'],
    ],

    noTwist: [
      ['No complications tonight. Just the mission.'],
      ['Nothing clever this time. Go and earn.'],
    ],

    sendOff: [
      ['Off you go.'],
      ['Good luck. You will need some of it.'],
      ['Go on, then.'],
    ],

    /* ---------------- the round table ---------------- */

    tableOpen: [
      ['Sit down.',
       'The pot stands at {pot}.',
       'That is the good news out of the way.'],
      ['Come to the table.',
       'You have {pot} between you, and one evening left to keep it.'],
    ],

    tablePrompt: [
      ['So. Talk to each other.',
       'Somebody at this table might be lying to you, and you have no way at all of knowing.'],
      ['Look at the two faces opposite you.',
       'One of them may have spent all afternoon deciding how to say nothing.'],
    ],

    tableYourTurn: [
      ['And you. What do you make of them?'],
      ['Your turn. Say something, or say nothing — both are answers.'],
    ],

    tableNoBanish: [
      ['Now. Normally this is where somebody leaves us.',
       'Not tonight. Nobody is banished at this table.',
       'You will all go into the second mission, and you will all come to the fire.'],
      ['You are expecting me to send one of you home.',
       'I am not going to. Nobody leaves this table.',
       'Whatever you have decided about each other, you take it to the fire with you.'],
    ],

    secondMission: [
      ['Which brings us to your second mission. {mission}.',
       'Add to the pot. It is the last chance you get.'],
      ['One more mission. {mission}.',
       'Whatever you bring back is what you will be fighting over by the fire.'],
    ],

    /* ---------------- the fire ---------------- */

    fireOpen: [
      ['Sit down. Closer to the fire.',
       'The pot is {pot}. This is where you find out who it belongs to.'],
      ['Here we are, then. {pot}, and a fire.',
       'Everything from here is a choice you make out loud.'],
    ],

    fireRules: [
      ['You have two options, and only two.',
       'If every pouch says End Game, the game stops.',
       'If even one pouch says Banish Again, all of you must vote someone out.'],
      ['This is the endgame.',
       'Ending has to be unanimous. One red flame means another banishment.',
       'And when only two of you remain, the game ends automatically.'],
    ],

    fireWarn: [
      ['Be careful. If you end this game with a Traitor still sitting here, they take all of it.',
       'And if there was never a Traitor at all — you will have burnt each other for nothing.'],
      ['One warning. Ending it with a Traitor in the circle means they leave with everything.',
       'Ending it too late means there is nobody left to share it with.'],
    ],

    voteDecide: [
      ['So. End the game, or banish.',
       'Choose.'],
      ['End it, or one more name.',
       'It is entirely up to the three of you.'],
      ['Decide. End it, or banish.'],
    ],

    voteDecideTwo: [
      ['Two of you left.',
       'End it now and share it — or name each other one last time.'],
      ['Just the two of you.',
       'One of you may be about to walk away with all of it.'],
    ],

    decisionPouches: [
      ['The decisions are in.',
       'I will take each pouch and put it in the fire, one person at a time.',
       'End game first. Then anyone who chose to banish again.'],
    ],

    decisionPouchIntro: [
      ['{name}. Your decision pouch, please.'],
      ['First, {name}. Hand me your decision.'],
      ['{name}. Let us see what you chose.'],
    ],

    decisionPouchIntroYou: [
      ['Your decision pouch. Give it to me.'],
      ['And yours. Hand it over.'],
    ],

    decisionPouchThrow: [
      ['Into the fire.'],
      ['Let the flame answer.'],
      ['Here we go.'],
    ],

    decisionEnd: [
      ['{name} chose to end the game.'],
      ['End game. That was {name}.'],
    ],

    decisionBanish: [
      ['{name} chose to banish again.'],
      ['Banish again. That was {name}.'],
    ],

    voteName: [
      ['Banish it is.',
       'Write a name. Say it out loud.'],
      ['Then somebody has to go.',
       'Name them.'],
    ],

    voteNameTie: [
      ['The vote is tied.',
       'You will vote again. Write a name.'],
      ['It is a tie.',
       'Nobody leaves on a tied vote. Vote again.'],
    ],

    pouchIntro: [
      ['{name}. Take your pouch.',
       'Give it to me.'],
      ['{name}. Your pouch, please.',
       'Whatever is in it, we all see it together.'],
    ],

    pouchThrow: [
      ['I am going to put this in the fire.',
       'And then we will all know.'],
      ['Watch the flame.',
       'It has never once been wrong.'],
      ['Nobody move. Nobody say a word.',
       'Watch what colour this burns.'],
    ],

    revealFaithful: [
      ['{name}...',
       'was a Faithful.'],
      ['Green.',
       '{name} was a Faithful. You have burnt one of your own.'],
    ],

    revealTraitor: [
      ['{name}...',
       'was a Traitor.'],
      ['Red.',
       '{name} was a Traitor. You found them.'],
    ],

    /* ---------------- the last pouches ----------------
       The game is over and nobody knows it yet. These are the only
       lines in the show that are not asking anybody for anything. */

    endPouches: [
      ['It is decided. The game is over.',
       'But you do not get to go home not knowing.',
       'Every one of you still standing has a pouch. We are going to open all of them.'],
      ['Then that is that. Nobody else goes to the fire.',
       'Except that every one of you is still carrying a pouch.',
       'And I am going to burn them. One. At. A. Time.'],
    ],

    endPouchesCaught: [
      ['That is one Traitor accounted for.',
       'But I am not sending you home on a guess.',
       'Everyone still standing hands me their pouch. All of them go in.'],
    ],

    finalTwoReveal: [
      ['Two players remain. The game ends here.',
       'You will reveal your identities one at a time.',
       'Faithful first. And if a Traitor is still here, they will reveal last.'],
    ],

    finalPouchIntro: [
      ['{name}.',
       'Your pouch. In my hand.'],
      ['{name}. Stand up.',
       'Give it to me.'],
      ['Next. {name}.',
       'Hand it over.'],
    ],

    finalPouchLast: [
      ['One pouch left.',
       '{name}. This is the whole night, in my hand.'],
      ['And the last one.',
       '{name}. Everything comes down to this.'],
    ],

    finalFaithful: [
      ['{name}...',
       'Faithful.'],
      ['Green.',
       '{name} was exactly what they said they were.'],
    ],

    finalTraitor: [
      ['{name}...',
       'TRAITOR.'],
      ['Red. Red, all night.',
       '{name} has been sitting there lying to your faces.'],
    ],

    /* ---------------- when the pouch is yours ----------------
       `{name}` is "You" for the local player, and "You was a Traitor"
       is not a sentence. Every set that puts the name inside a clause
       therefore has a `…You` twin, and the scene reaches for it when
       the pouch on the fire is your own. */

    pouchIntroYou: [
      ['And you.',
       'Your pouch. Give it to me.'],
      ['That leaves you.',
       'Hand it over.'],
    ],

    finalPouchYou: [
      ['You reveal first.',
       'Your pouch. Give it to me.'],
      ['We start with you.',
       'Hand me your pouch.'],
    ],

    finalPouchYouLast: [
      ['And the last pouch is yours.',
       'Give it to me. Everything is on this.'],
      ['One left. Yours.',
       'Hand it over, and we will all find out together.'],
    ],

    finalTraitorYou: [
      ['Red.',
       'You have been the Traitor all night.'],
      ['It is red.',
       'You sat there. You lied. And they let you.'],
    ],

    finalFaithfulYou: [
      ['Green.',
       'You were Faithful. Exactly what you said you were.'],
      ['Green, of course.',
       'You told the truth all night and it very nearly cost you.'],
    ],

    revealTraitorYou: [
      ['Red.',
       'You were the Traitor. And they found you.'],
    ],

    revealFaithfulYou: [
      ['Green.',
       'You were a Faithful. They burnt one of their own.'],
    ],

    againAfterFaithful: [
      ['So.',
       'That is one of you gone, and nothing settled.',
       'Same question. End it, or go again.'],
      ['Well. That did not help.',
       'Two of you now. And the same choice.'],
    ],

    /* ---------------- the verdict ---------------- */

    wonFaithful: [
      ['It is over.',
       'There is no Traitor left by this fire.',
       'The pot is yours. {pot}. Every penny of it, honestly won.'],
    ],
    wonFaithfulClean: [
      ['It is over.',
       'And I should tell you — there was never a Traitor here at all.',
       'Three Faithfuls, all night, terrified of each other. {pot} is yours.'],
    ],
    wonTraitor: [
      ['It is over.',
       'And you have all been extremely kind to a Traitor.',
       '{pot}. Not shared. Yours.'],
    ],
    lostFaithful: [
      ['It is over.',
       'You ended the night with a Traitor at your side.',
       'They take the pot. You take the drive home.'],
    ],
    lostBurned: [
      ['You were named, and the fire answered.',
       'The pot goes on without you.'],
    ],
    lostTraitorCaught: [
      ['They found you.',
       'The Faithfuls take the pot, and you take the long walk.'],
    ],
  };

  /* ---------------- what the others say at the table ----------------
     `accuse: true` means the line points at somebody. The bots weight
     their pick on it, so a Traitor bot spends its evening directing
     traffic and a Faithful bot spends it worrying out loud. */

  const TABLE = [
    { id: 't-quiet', text: '{name} has been very quiet. That is usually something.', accuse: true },
    { id: 't-keen', text: 'I think {name} was a bit too keen to agree with everyone out there.', accuse: true },
    { id: 't-watch', text: 'I watched {name} the whole way through that mission. I did not like what I saw.', accuse: true },
    { id: 't-name', text: 'If I had to say a name right now it would be {name}. I am sorry.', accuse: true },
    { id: 't-trust', text: 'I trust {name}. I do not know why, and that worries me.', accuse: true },
    { id: 't-late', text: '{name} was the last one to say anything last time. I noticed.', accuse: true },
    { id: 't-defend', text: 'You are all looking at me. I would like it noted that I have done nothing.', accuse: false },
    { id: 't-lost', text: 'Honestly? I have no idea. None. I am guessing like everybody else.', accuse: false },
    { id: 't-money', text: 'I think we should talk about the money and stop talking about each other.', accuse: false },
    { id: 't-feel', text: 'Something is off tonight. I have felt it since the hill.', accuse: false },
    { id: 't-none', text: 'What if there is nobody? What if we are all just Faithfuls being horrible?', accuse: false },
    { id: 't-ready', text: 'When we get to that fire I will know. I will.', accuse: false },
  ];

  /* What you can say. Three, and they are choices about how you want to
     be seen rather than moves with an effect — the bots read them, and
     nothing else does. */
  const YOU = [
    { id: 'y-accuse', label: 'Point at somebody',
      text: 'I have been watching {name}, and I do not believe a word of it.' },
    { id: 'y-hold', label: 'Give nothing away',
      text: 'I am not naming anyone yet. I want to see the second mission first.' },
    { id: 'y-open', label: 'Say you are lost',
      text: 'I genuinely do not know. I would rather say that than pretend.' },
  ];

  /* ---------------- picking and filling ---------------- */

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) =>
      (vars && vars[k] !== undefined && vars[k] !== null) ? String(vars[k]) : '');
  }

  /* A set is a list of takes; a take is a list of sentences. Returns one
     beat per sentence so the caller can hold, cut or change shot between
     them — the pauses are where the drama is. */
  function beats(setName, vars, seed) {
    const set = SETS[setName];
    if (!set || !set.length) return [];
    const r = U.makeRng((((seed || 0) ^ hash(setName)) >>> 0) || 1);
    const take = set[Math.floor(r() * set.length)];
    return take.map(t => ({ text: fill(t, vars) })).filter(b => b.text);
  }

  const line = (setName, vars, seed) =>
    beats(setName, vars, seed).map(b => b.text).join(' ');

  const has = (setName) => !!SETS[setName];

  return { SETS, TABLE, YOU, beats, line, fill, has };
})();
