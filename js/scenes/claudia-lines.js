/* ------------------------------------------------------------------
   claudia-lines.js — everything anybody says, as data.

   The scenes hold camera and timing; none of them holds prose. That
   split is worth keeping: rewriting the show should be editing this
   file, and adding a language later should be adding a sibling to it.

   Most beats have several variants and are drawn from the run seed, so
   a second run is not a recital of the first — but a shared seed is
   still a shared night, which is the rule everywhere else in this
   codebase and there is no reason for the words to break it.

   `{name}`, `{pot}` and `{count}` are filled by
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
        "All of you."
      ]
    ],
    "exposeTask": [
      [
        "Yesterday, one of you was carrying poison.",
        "It never left their pocket."
      ],
      [
        "A Traitor had one job today.",
        "Nobody died of it."
      ],
      [
        "There was poison in this castle today.",
        "It is still in the bottle."
      ]
    ],
    "exposeName": [
      [
        "{name}.",
        "You had it all day, and you did nothing with it."
      ],
      [
        "It was you, {name}.",
        "And you lost your nerve."
      ],
      [
        "{name}.",
        "Turn out your pocket."
      ]
    ],
    "exposeAfter": [
      [
        "{name} was a Traitor.",
        "And now every one of you knows it."
      ],
      [
        "{name} was a Traitor, and has just handed you that for nothing.",
        "No vote today. Go to bed."
      ]
    ],
    "welcome": [
      [
        "Welcome to the Highlands.",
        "Welcome to my castle."
      ],
      [
        "{count} of you. One pot. And a castle full of secrets."
      ],
      [
        "You made it. Look at that view.",
        "Enjoy it. It is the last easy thing you will do."
      ]
    ],
    "theRules": [
      [
        "Here is how it works.",
        "By day, you work the castle. Every job you finish puts money in the pot.",
        "But the Traitors carry poison. And they use it in broad daylight, right under your noses.",
        "At the round table, you banish the one you think did it."
      ],
      [
        "Every day, the castle needs work, and the work pays.",
        "Every day, a Traitor slips poison to one of you, in plain sight.",
        "Watch each other. Then decide who goes."
      ]
    ],
    "roleIntro": [
      [
        "Among the {count} of you, there is a Traitor."
      ],
      [
        "One of you is a Traitor. Only one of you knows it."
      ]
    ],
    "roleIntroTwo": [
      [
        "Among the {count} of you, there are two Traitors."
      ],
      [
        "Two of you are Traitors. They are about to meet each other."
      ]
    ],
    "traitorPartner": [
      [
        "You are not alone.",
        "Your fellow Traitor is {name}."
      ],
      [
        "Look for {name} tonight.",
        "You are in this together."
      ]
    ],
    "roleFaithful": [
      [
        "You are a Faithful.",
        "Keep your eyes open. Whoever hands you something today may be killing you."
      ]
    ],
    "roleTraitor": [
      [
        "You are a Traitor.",
        "Every day, one of you carries the poison.",
        "Get it into a Faithful before the bell. Fail, and I will expose you myself."
      ]
    ],
    "toCastle": [
      [
        "The castle is yours.",
        "In you go."
      ],
      [
        "Up to the house. Your jobs are waiting."
      ]
    ],
    "nightFalls": [
      [
        "That is the day done.",
        "Go to your rooms."
      ],
      [
        "The castle is going to sleep.",
        "Go to bed. Some of you will not need to."
      ]
    ],
    "nightFaithful": [
      [
        "Your door is locked.",
        "Whatever was done today, it is done.",
        "Sleep, if you can."
      ],
      [
        "Lock it. Good.",
        "It will not help. The poison is already in somebody."
      ]
    ],
    "conclaveOpen": [
      [
        "Traitors.",
        "Welcome to the turret.",
        "It is done for today. Now, tomorrow."
      ],
      [
        "Sit down.",
        "Somebody downstairs is not waking up.",
        "Let us talk about tomorrow."
      ]
    ],
    "conclaveRecruit": [
      [
        "You have lost one of your own.",
        "You may offer a Faithful a seat at this table.",
        "They are allowed to say no."
      ]
    ],
    "conclaveAgree": [
      [
        "One of you carries it tomorrow.",
        "Agree on who."
      ]
    ],
    "conclaveDone": [
      [
        "It is decided.",
        "Go back to bed. Look surprised at breakfast."
      ],
      [
        "Done.",
        "Get some sleep. You will need your face in the morning."
      ]
    ],
    "murderedYou": [
      [
        "There is a letter under your door.",
        "Whatever you were handed today, it was poison.",
        "You may watch the rest of it. You may not speak to the living."
      ],
      [
        "A knock. Nobody there.",
        "Just a letter. You were poisoned, and you never felt it."
      ]
    ],
    "recruitOffer": [
      [
        "The Traitors have chosen you.",
        "Join them.",
        "Or say no, and go back to sleep a Faithful."
      ]
    ],
    "recruitedYou": [
      [
        "Welcome to the turret.",
        "You are a Traitor now."
      ]
    ],
    "breakfastOpen": [
      [
        "Good morning.",
        "Come down for breakfast. Not all of you will."
      ],
      [
        "Breakfast.",
        "Let us see who made it through the night."
      ]
    ],
    "breakfastWait": [
      [ "Somebody is late." ],
      [ "Still a chair empty." ],
      [ "We wait." ]
    ],
    "breakfastAbsent": [
      [
        "{name} will not be joining us.",
        "Somebody handed {name} the poison yesterday. It took in the night.",
        "{name} was a Faithful."
      ],
      [
        "That chair is staying empty.",
        "{name} was poisoned. In front of some of you, probably.",
        "A Faithful."
      ]
    ],
    "breakfastSpared": [
      [
        "Everybody is here.",
        "Somebody was poisoned yesterday.",
        "You banished them before it could take."
      ],
      [
        "Every chair is full.",
        "The poison found somebody yesterday. The round table found them first."
      ]
    ],
    "breakfastNobody": [
      [
        "Everybody is here.",
        "Nobody died in the night.",
        "Which means the poison never left its bottle."
      ]
    ],
    "breakfastSend": [
      [
        "Eat.",
        "Then back to work. Somebody has poison again."
      ],
      [
        "Finish your coffee.",
        "The castle is waiting. So are they."
      ]
    ],
    "tableOpen": [
      [
        "Sit down.",
        "Today somebody handed one of you poison.",
        "Who was where? Who was with whom? Talk."
      ],
      [
        "Take your seats.",
        "You were all in that house today. Somebody saw something.",
        "Speak."
      ]
    ],
    "inviteQuiet": [
      [
        "{name}. You have been very quiet.",
        "What do you think?"
      ],
      [
        "{name}, we have not heard from you.",
        "Who are you looking at?"
      ],
      [
        "{name}. Say something. Silence is a choice, too."
      ]
    ],
    "tableClose": [
      [
        "That is enough talking.",
        "Pick up your slates."
      ],
      [
        "I have heard enough.",
        "Write a name."
      ]
    ],
    "slateIntro": [
      [
        "Write a name.",
        "When I come to you, turn it over and say it out loud."
      ]
    ],
    "tableTie": [
      [
        "It is a tie.",
        "Only {names} can go now. Vote again."
      ]
    ],
    "tableLot": [
      [
        "Still tied.",
        "Then the castle decides. I will draw."
      ]
    ],
    "banishName": [
      [
        "{name}.",
        "The table has spoken. You have been banished."
      ]
    ],
    "banishNameYou": [
      [
        "The table has spoken.",
        "You have been banished."
      ]
    ],
    "lastWords": [
      [
        "{name}. Before you go.",
        "Who are you?"
      ]
    ],
    "lastWordsYou": [
      [
        "Before you go.",
        "Tell them who you are."
      ]
    ],
    "banishedTraitor": [
      [
        "{name}...",
        "was a Traitor."
      ],
      [
        "{name} was a Traitor.",
        "Well done. Do not get comfortable."
      ]
    ],
    "banishedFaithful": [
      [
        "{name}...",
        "was a Faithful.",
        "You have sent home an innocent person."
      ],
      [
        "{name} was Faithful.",
        "And the Traitors thank you for it."
      ]
    ],
    "banishedTraitorYou": [
      [
        "You were a Traitor.",
        "And now everybody knows."
      ]
    ],
    "banishedFaithfulYou": [
      [
        "You were a Faithful.",
        "And they sent you home anyway."
      ]
    ],
    "tableNight": [
      [
        "Go to bed.",
        "The poison is already in somebody."
      ],
      [
        "That is the table.",
        "Sleep well. Some of you."
      ]
    ],
    "tableToFire": [
      [
        "{count} of you left.",
        "Tonight we go to the fire."
      ]
    ],
    "traitorsGone": [
      [
        "That was the last Traitor in this castle.",
        "It is over."
      ]
    ],
    "sendOff": [
      [
        "Go."
      ],
      [
        "Off you go."
      ]
    ],
    "tasksFirst": [
      [
        "Three minutes. Every job you finish is five hundred pounds.",
        "Somebody in this house is carrying poison.",
        "When they hand it to you, you will not feel a thing."
      ],
      [
        "The castle is yours for three minutes. Jobs on your list, money in the pot.",
        "And watch who stands too close to whom."
      ]
    ],
    "tasksOpen": [
      [
        "Another day. {count} of you.",
        "The jobs are waiting. So is the poison."
      ],
      [
        "Morning has been and gone.",
        "Three minutes. Work, and watch."
      ],
      [
        "Back to work.",
        "Somebody is carrying it again."
      ]
    ],
    "poisonYou": [
      [
        "It is in your pocket.",
        "Stand beside a Faithful and hold still. Nobody will know.",
        "Before the bell."
      ],
      [
        "The poison is yours today.",
        "Pick your moment. Pick your Faithful.",
        "Do it before the bell, or I will."
      ]
    ],
    "poisonPartner": [
      [
        "{name} has the poison today.",
        "Keep them covered."
      ],
      [
        "Today it is {name}'s turn.",
        "Make sure nobody is watching."
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
        "There may still be a Traitor sitting at this fire.",
        "First, you decide whether to end the game. It must be unanimous.",
        "If it is not, you banish again."
      ]
    ],
    "fireOfTruth": [
      [
        "End the game. Or banish again.",
        "Put it in the pouch."
      ],
      [
        "Are you done?",
        "Or is there still a Traitor here?"
      ]
    ],
    "decideEnd": [
      [
        "It is unanimous.",
        "The game is over."
      ]
    ],
    "decideBanish": [
      [
        "Not unanimous.",
        "Somebody here is not sure. Then we banish again."
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
        "No Traitor left in this castle.",
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
    "lostOut": [
      [
        "You did not make it to the end.",
        "The Faithfuls who did take {pot} between them."
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
    { id: 't-watch', text: 'I watched {name} all day in that house. I did not like what I saw.', accuse: true },
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
      text: 'I am not naming anyone yet. I want to see who goes where tomorrow.' },
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

  /* What only one screen may hear. Everything else Claudia says, she
     says to the room — which matters once she is a live AI voice, since
     then the room is exactly who hears it. */
  const PRIVATE = new Set(['roleTraitor', 'roleFaithful', 'traitorPartner', 'poisonYou', 'poisonPartner',
    'murderedYou', 'recruitOffer', 'recruitedYou', 'conclaveOpen', 'conclaveAgree',
    'conclaveRecruit', 'conclaveDone', 'nightFaithful']);
  /* A "You" twin is the second-person version of a public line: the room
     hears the third-person one, and the person it is about reads theirs. */
  const baseOf = (setName) => (setName && setName.endsWith('You') && SETS[setName.slice(0, -3)]
    ? setName.slice(0, -3) : setName);
  const isPublic = (setName) => !!setName && !PRIVATE.has(setName) && !PRIVATE.has(baseOf(setName));

  return { SETS, TABLE, YOU, beats, line, fill, has, isPublic, baseOf, PRIVATE };
})();
