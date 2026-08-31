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
    "floorOpen": [
      [
        "You will speak one at a time.",
        "Thirty seconds each. Nobody interrupts."
      ],
      [
        "The room is going to go round.",
        "Thirty seconds. Use them or waste them."
      ],
      [
        "One voice at a time tonight.",
        "Half a minute each, and then I want a decision."
      ]
    ],
    "floorTo": [
      [ "{name}. The room is yours." ],
      [ "{name}. Go on." ],
      [ "Thirty seconds, {name}." ],
      [ "{name}. Say something worth hearing." ]
    ],
    "floorEnd": [
      [ "Time." ],
      [ "That is your thirty." ],
      [ "Enough." ]
    ],
    "floorBoard": [
      [
        "The numbers from out there are in front of you.",
        "They do not accuse anybody. You will have to do that yourselves."
      ],
      [
        "Everything that happened on that mission is on the board.",
        "Read it properly. It is all you are getting."
      ]
    ],
    "exposeOpen": [
      [
        "Before anybody sits down.",
        "Stay exactly where you are."
      ],
      [
        "Nobody sit.",
        "This will not take long."
      ],
      [
        "Stop there.",
        "All three of you."
      ]
    ],
    "exposeTask": [
      [
        "One of you was given something to do out there tonight.",
        "Something small. Something nobody was meant to notice.",
        "It was not done."
      ],
      [
        "A Traitor is asked for one thing on a night like this.",
        "One quiet piece of work, out where you could all see it.",
        "It went unfinished."
      ],
      [
        "There was a task tonight. A private one.",
        "It needed doing before you walked back in here.",
        "It was left."
      ]
    ],
    "exposeName": [
      [ "{name}.", "You had one job, and you did not do it." ],
      [ "It was you, {name}.", "And you left it undone." ],
      [ "{name}.", "Look at me. You know exactly what this is." ]
    ],
    "exposeAfter": [
      [
        "{name} was a Traitor.",
        "And a Traitor who cannot do the work is no use to anybody.",
        "The Faithfuls have it. The pot is theirs."
      ],
      [
        "There it is.",
        "{name} was the Traitor, and {name} has just handed you the money.",
        "The night is over."
      ]
    ],
    "exposeNone": [
      [
        "Nothing.",
        "Whatever was asked for tonight, it was done properly.",
        "Sit down."
      ]
    ],
    "welcome": [
      [
        "Welcome to the Highlands."
      ],
      [
        "Three of you. One pot. And a whole evening to get through."
      ],
      [
        "Good. You made it up the hill."
      ]
    ],
    "theRules": [
      [
        "It's time for the first mission."
      ]
    ],
    "roleIntro": [
      [
        "Among the three of you there may (or may not) be a Traitor."
      ]
    ],
    "roleFaithful": [
      [
        "You are a Faithful."
      ]
    ],
    "roleTraitor": [
      [
        "You are a Traitor."
      ]
    ],
    "firstMission": [
      [
        "Your first mission is {mission}."
      ]
    ],
    "twist": [
      [
        "The twist is {twist}."
      ]
    ],
    "noTwist": [
      [
        "No twists this time."
      ]
    ],
    "sendOff": [
      [
        "Off you go."
      ]
    ],
    "tableOpen": [
      [
        "Sit down."
      ]
    ],
    "tablePrompt": [
      [
        "So. Talk to each other.",
        "Somebody at this table might be lying to you, and you have no way at all of knowing."
      ],
      [
        "Look at the two faces opposite you.",
        "One of them may have spent all afternoon deciding how to say nothing."
      ]
    ],
    /* The open table. She says out loud that there are no turns,
       because a room that has spent the whole night being told to wait
       its turn will otherwise wait for one. */
    "tableTalk": [
      [
        "Nobody has a turn here.",
        "Talk. All three of you. Over each other if you have to."
      ],
      [
        "No order. No thirty seconds. No waiting to be asked.",
        "If somebody says a thing you do not believe, say so while they are still saying it."
      ],
      [
        "The table is open and it stays open.",
        "Interrupt each other. I am not refereeing this."
      ]
    ],
    "tableYourTurn": [
      [
        "And you. What do you make of them?"
      ],
      [
        "Your turn."
      ]
    ],
    "tableNoBanish": [
      [
        "Discussion is over. It is now time for the second mission"
      ]
    ],
    "secondMission": [
      [
        "The second mission is {mission}."
      ]
    ],
    "fireOpen": [
      [
        "The pot is at {pot}. This is where you find out who it belongs to."
      ],
      [
        "Here we are, then. {pot}, and a fire.",
        "Everything from here is a choice you make out loud."
      ]
    ],
    "fireRules": [
      [
        "You have two options, and only two.",
        "If every pouch says End Game, the game stops.",
        "If even one pouch says Banish Again, all of you must vote someone out."
      ]
    ],
    "fireWarn": [
      [
        "Be careful. If you end this game with a Traitor still sitting here, they take all of it.",
        "And if there was never a Traitor at all — you will have burnt each other for nothing."
      ],
      [
        "One warning. Ending it with a Traitor in the circle means they leave with everything.",
        "Ending it too late means there is nobody left to share it with."
      ]
    ],
    "voteDecide": [
      [
        "Decide. End it, or banish."
      ]
    ],
    "voteDecideTwo": [
      [
        "Two left.",
        "End it and share, or banish again."
      ]
    ],
    "decisionPouches": [
      [
        "The decisions are in."
      ]
    ],
    "decisionPouchIntro": [
      [
        "{name}. Your decision pouch, please."
      ],
      [
        "First, {name}. Hand me your decision."
      ],
      [
        "{name}. Let us see what you chose."
      ]
    ],
    "decisionPouchIntroYou": [
      [
        "And yours. Hand it over."
      ]
    ],
    "decisionPouchThrow": [
      [
        "Into the fire."
      ],
      [
        "Here we go."
      ]
    ],
    "decisionEnd": [
      [
        "{name} chose to end the game."
      ],
      [
        "End game. That was {name}."
      ]
    ],
    "decisionBanish": [
      [
        "{name} chose to banish again."
      ],
      [
        "Banish again. That was {name}."
      ]
    ],
    "voteName": [
      [
        "Banish it is."
      ],
      [
        "Then somebody has to go."
      ]
    ],
    "voteNameTie": [
      [
        "The vote is tied.",
        "You will vote again. Write a name."
      ]
    ],
    "pouchIntro": [
      [
        "{name}. Give me your pouch."
      ]
    ],
    "pouchThrow": [
      [
        "Let's see."
      ]
    ],
    "revealFaithful": [
      [
        "{name}...",
        "was a Faithful."
      ],
      [
        "Green.",
        "{name} was a Faithful."
      ]
    ],
    "revealTraitor": [
      [
        "{name}...",
        "was a Traitor."
      ]
    ],
    "endPouches": [
      [
        "It is decided. The game is over.",
        "But you do not get to go home not knowing."
      ]
    ],
    "endPouchesCaught": [
      [
        "That is one Traitor accounted for."
      ]
    ],
    "finalTwoReveal": [
      [
        "Two players remain. The game ends here.",
        "You will reveal your identities one at a time."
      ]
    ],
    "finalPouchIntro": [
      [
        "{name}.",
        "Your pouch."
      ],
      [
        "Next. {name}.",
        "Hand it over."
      ]
    ],
    "finalPouchLast": [
      [
        "One pouch left.",
        "{name}."
      ],
      [
        "And the last one.",
        "{name}."
      ]
    ],
    "finalFaithful": [
      [
        "{name}...",
        "Faithful."
      ]
    ],
    "finalTraitor": [
      [
        "{name}...",
        "TRAITOR."
      ]
    ],
    "pouchIntroYou": [
      [
        "Your pouch now."
      ]
    ],
    "finalPouchYou": [
      [
        "Hand me your pouch."
      ]
    ],
    "finalPouchYouLast": [
      [
        "One left. Yours."
      ]
    ],
    "finalTraitorYou": [
      [
        "Red.",
        "You have been the Traitor all night."
      ],
      [
        "It is red.",
        "You sat there. You lied. And they let you."
      ]
    ],
    "finalFaithfulYou": [
      [
        "Green.",
        "You were Faithful. Exactly what you said you were."
      ],
      [
        "Green, of course.",
        "You told the truth all night and it very nearly cost you."
      ]
    ],
    "revealTraitorYou": [
      [
        "Red.",
        "You were the Traitor."
      ]
    ],
    "revealFaithfulYou": [
      [
        "Green.",
        "You were a Faithful."
      ]
    ],
    "againAfterFaithful": [
      [
        "Same question. End it, or go again."
      ]
    ],
    "wonFaithful": [
      [
        "It is over.",
        "There is no Traitor left by this fire.",
        "The pot is yours. {pot}."
      ]
    ],
    "wonFaithfulClean": [
      [
        "It is over.",
        "There was never a Traitor here at all.",
        "{pot} is yours."
      ]
    ],
    "wonTraitor": [
      [
        "It is over.",
        "And you have all been extremely kind to a Traitor.",
        "{pot}. Not shared. Yours."
      ]
    ],
    "lostFaithful": [
      [
        "It is over.",
        "You ended the night with a Traitor at your side.",
        "They take the pot. You take the drive home."
      ]
    ],
    "lostBurned": [
      [
        "You were named.",
        "The pot goes on without you."
      ]
    ],
    "lostTraitorCaught": [
      [
        "They found you.",
        "The Faithfuls take the pot, and you take the long walk."
      ]
    ]
  };

  /* ---------------- the old table script ----------------
     These were the bots' lines, and then briefly a menu of things you
     could say. The round table has three microphones on it now, and a
     list of pre-written opinions is what you build for players who
     cannot talk to each other. Nothing in the game reads either of
     these any more.

     They are kept because `dialogue-editor.html` loads this file and
     edits them, and because a show that grows a written-dialogue mode
     later would want them back. If that never happens, delete both. */

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
