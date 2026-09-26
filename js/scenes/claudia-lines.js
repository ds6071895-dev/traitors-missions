/* ------------------------------------------------------------------
   claudia-lines.js — everything anybody says, as data.

   The scenes hold camera and timing; none of them holds prose. That
   split is worth keeping: rewriting the show should be editing this
   file, and adding a language later should be adding a sibling to it.

   Most beats have several variants and are drawn from the run seed, so
   a second run is not a recital of the first — but a shared seed is
   still a shared night, which is the rule everywhere else in this
   codebase and there is no reason for the words to break it.

   `{name}`, `{mission}`, `{pot}` and `{count}` are filled by
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
        "One of you was given something to say out there tonight.",
        "It was never said."
      ],
      [
        "A Traitor gets one job on a night like this.",
        "This one went undone."
      ],
      [
        "There was a task tonight. A quiet one.",
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
        "The pot is yours."
      ],
      [
        "{name} was the Traitor, and has just handed you the money.",
        "That is the night."
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
        "One of the three of you is a Traitor."
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
    /* The task, spoken.

       It used to be a card and nothing else, on the grounds that two
       other people are standing right there. They are not: Claudia is
       heard on the browser she is talking to and on no other, exactly
       as the role line above is, and a Traitor who has to read their
       one instruction off a card in five seconds while the camera moves
       is a Traitor who arrives at the mission still guessing at it.
       So she says it, and `{task}` is the card itself, word for word.

       The alibi is deliberately not in here. It is the harder way to do
       the one task, not a second instruction, and a player handed it in
       words plays the sentence instead of the mission. */
    "taskGiven": [
      [
        "One thing you have to say out loud tonight, with both of them listening.",
        "{task}",
        "Say it, then mark your card. Unmarked and I tell them."
      ],
      [
        "Something quiet, before you go.",
        "{task}",
        "Out loud, while they can hear you. Then mark it."
      ],
      [
        "Only you are hearing this.",
        "{task}",
        "Say it, mark the card. Everything else you can lie about."
      ]
    ],
    /* The second card, at the table. She is shorter about it: they have
       done this once already and know exactly what it is. */
    "firstMission": [
      [
        "Your mission is {mission}."
      ]
    ],
    "sendOff": [
      [
        "Off you go."
      ]
    ],
    /* The open table. She says out loud that there are no turns,
       because a room that has spent the whole night being told to wait
       its turn will otherwise wait for one. */
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
        "One of you is a Traitor.",
        "You name somebody. The fire says what they were."
      ]
    ],
    "fireWarn": [
      [
        "One name. Get it wrong and they leave with all of it."
      ],
      [
        "You get one. Choose badly and you watch them take the pot."
      ]
    ],
    "voteName": [
      [
        "One name each. Somebody is going."
      ],
      [
        "Name somebody. There is a Traitor sitting here."
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
        "No Traitor left by this fire.",
        "{pot}. Yours."
      ]
    ],
    "wonFaithfulClean": [
      [
        "There was never a Traitor here at all.",
        "{pot} is yours."
      ]
    ],
    "wonTraitor": [
      [
        "You have all been very kind to a Traitor.",
        "{pot}. Not shared. Yours."
      ]
    ],
    "lostFaithful": [
      [
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
