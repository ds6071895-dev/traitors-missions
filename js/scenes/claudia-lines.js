/* ------------------------------------------------------------------
   claudia-lines.js — everything anybody says, as data.

   The scenes hold camera and timing; none of them holds prose. That
   split is worth keeping: rewriting the show should be editing this
   file, and adding a language later should be adding a sibling to it.

   Most beats have several variants and are drawn from the run seed, so
   a second run is not a recital of the first — but a shared seed is
   still a shared night, which is the rule everywhere else in this
   codebase and there is no reason for the words to break it.

   `{name}`, `{names}`, `{pot}`, `{count}`, `{time}` and `{Time}` are
   filled by the caller. Keep her short: a take is two or three
   sentences, ten words at most each and sixteen in all (the two rules
   sets may run to twenty-two). She is the host of a show, not its
   narrator, and every second she talks is a second nobody else is
   playing. `test/claudia-lines.test.js` holds the line.
------------------------------------------------------------------ */
const ClaudiaLines = (() => {

  const SETS = {
    "floorOpen": [
      [ "One at a time.", "Thirty seconds each. Nobody interrupts." ],
      [ "The room goes round.", "Thirty seconds. Use them." ],
      [ "One voice at a time.", "Half a minute each. Then a decision." ]
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
      [ "Nobody sits down.", "Not yet." ],
      [ "Nobody sit.", "This will not take long." ],
      [ "Stop there.", "All of you." ]
    ],
    "exposeTask": [
      [ "Yesterday, somebody carried poison.", "It never left their pocket." ],
      [ "A Traitor had one job today.", "Nobody died of it." ],
      [ "There was poison in this castle today.", "It is still in the bottle." ]
    ],
    "exposeName": [
      [ "{name}.", "You had it all day. And did nothing." ],
      [ "It was you, {name}.", "You lost your nerve." ],
      [ "{name}.", "Turn out your pocket." ]
    ],
    "exposeAfter": [
      [ "{name} was a Traitor.", "Now every one of you knows it." ],
      [ "A Traitor, handed to you for nothing.", "No vote today. Go to bed." ]
    ],
    "welcome": [
      [ "Welcome to my castle." ],
      [ "{count} of you. One pot.", "A castle full of secrets." ],
      [ "Enjoy the view.", "It is the last easy thing you do." ]
    ],
    "theRules": [
      [ "By day, you work. Every job fills the pot.", "A Traitor poisons in plain sight. You banish who did it." ],
      [ "Work the castle. Fill the pot.", "Somebody will be poisoned in plain sight. Find who." ]
    ],
    "roleIntro": [
      [ "Among the {count} of you, there is a Traitor." ],
      [ "One of you is a Traitor.", "Only one of you knows it." ]
    ],
    "roleIntroTwo": [
      [ "Among the {count} of you, there are two Traitors." ],
      [ "Two of you are Traitors.", "They are about to meet." ]
    ],
    "traitorPartner": [
      [ "You are not alone.", "Your fellow Traitor is {name}." ],
      [ "Look for {name} tonight.", "You are in this together." ]
    ],
    "roleFaithful": [
      [ "You are Faithful.", "Watch who hands you anything." ],
      [ "Faithful.", "Trust nobody who gets too close." ]
    ],
    "roleTraitor": [
      [ "You are a Traitor.", "Poison a Faithful before the bell. Or I expose you." ],
      [ "Traitor.", "The poison goes into a Faithful before the bell." ]
    ],
    "toCastle": [
      [ "The castle is yours.", "In you go." ],
      [ "Up to the house.", "Your jobs are waiting." ]
    ],
    "nightFalls": [
      [ "That is the day done.", "Go to your rooms." ],
      [ "The castle is going to sleep.", "Some of you will not wake." ],
      [ "Bed.", "Lock your door. For what it is worth." ]
    ],
    "nightFaithful": [
      [ "Your door is locked.", "Sleep, if you can." ],
      [ "Lock it. Good.", "It will not help." ]
    ],
    "conclaveOpen": [
      [ "Traitors.", "Welcome to the turret." ],
      [ "Sit down.", "Somebody downstairs is not waking up." ]
    ],
    "conclaveRecruit": [
      [ "You lost one of your own.", "Offer a Faithful their seat." ]
    ],
    "conclaveAgree": [
      [ "One of you carries it tomorrow.", "Agree on who." ]
    ],
    "conclaveDone": [
      [ "It is decided.", "Look surprised at breakfast." ],
      [ "Done.", "Sleep. You need your face tomorrow." ]
    ],
    "murderedYou": [
      [ "A letter under your door.", "It was poison. You may watch, not speak." ],
      [ "A knock. Nobody there.", "You were poisoned. Watch in silence." ]
    ],
    "recruitOffer": [
      [ "The Traitors want you.", "Join them, or sleep." ]
    ],
    "recruitedYou": [
      [ "Welcome to the turret.", "You are a Traitor now." ]
    ],
    "breakfastOpen": [
      [ "Good morning.", "Not all of you will come down." ],
      [ "Breakfast.", "Let us see who made it." ],
      [ "Morning.", "Count the chairs." ],
      [ "Come down.", "Slowly." ]
    ],
    "breakfastWait": [
      [ "Somebody is late." ],
      [ "Still a chair empty." ],
      [ "We wait." ]
    ],
    "breakfastAbsent": [
      [ "{name} will not be joining us.", "Poisoned. A Faithful." ],
      [ "That chair stays empty.", "{name}. Faithful. Poisoned in front of you." ],
      [ "{name} is dead.", "And {name} was Faithful." ]
    ],
    "breakfastSpared": [
      [ "Everybody is here.", "The poison found someone. You banished them first." ],
      [ "Every chair is full.", "The round table beat the poison." ]
    ],
    "breakfastNobody": [
      [ "Everybody is here.", "The poison never left its bottle." ],
      [ "Nobody died.", "Somebody lost their nerve." ]
    ],
    "breakfastSendFinale": [
      [ "Eat.", "No more work. Tonight, the Fire of Truth." ],
      [ "Finish your coffee.", "Next, you face the fire." ]
    ],
    "breakfastSend": [
      [ "Eat.", "Then work. Somebody has poison again." ],
      [ "Finish your coffee.", "The castle is waiting. So are they." ],
      [ "Back to work.", "Watch your backs." ]
    ],
    "tableOpen": [
      [ "Sit.", "Somebody handed out poison today. Who saw it?" ],
      [ "Take your seats.", "Somebody saw something. Speak." ],
      [ "Sit down.", "Who was where? Talk." ]
    ],
    "inviteQuiet": [
      [ "{name}. You have been very quiet." ],
      [ "{name}. Who are you looking at?" ],
      [ "{name}. Silence is a choice too." ]
    ],
    "tableClose": [
      [ "Enough talking.", "Pick up your slates." ],
      [ "I have heard enough.", "Slates." ],
      [ "Time.", "Write a name." ]
    ],
    "slateIntro": [
      [ "Write a name.", "Turn it when I come to you." ],
      [ "One name each.", "Show it when I ask." ]
    ],
    "tableTie": [
      [ "A tie.", "Only {names} can go now. Again." ]
    ],
    "tableLot": [
      [ "Still tied.", "Then the castle decides." ]
    ],
    "banishName": [
      [ "{name}.", "You have been banished." ],
      [ "{name}.", "The table has spoken." ],
      [ "The table has chosen.", "{name}." ]
    ],
    "banishNameYou": [
      [ "The table has spoken.", "You have been banished." ]
    ],
    "lastWords": [
      [ "{name}. Before you go.", "Who are you?" ],
      [ "{name}.", "Tell them what you are." ]
    ],
    "lastWordsYou": [
      [ "Before you go.", "Tell them who you are." ]
    ],
    "banishedTraitor": [
      [ "{name}...", "was a Traitor." ],
      [ "{name} was a Traitor.", "Do not get comfortable." ],
      [ "A Traitor.", "Finally." ]
    ],
    "banishedFaithful": [
      [ "{name}...", "was Faithful." ],
      [ "{name} was Faithful.", "The Traitors thank you." ],
      [ "Faithful.", "You sent home an innocent." ]
    ],
    "banishedTraitorYou": [
      [ "You were a Traitor.", "Now everybody knows." ]
    ],
    "banishedFaithfulYou": [
      [ "You were Faithful.", "They sent you home anyway." ]
    ],
    "tableNight": [
      [ "Go to bed.", "The poison is already in somebody." ],
      [ "That is the table.", "Sleep well. Some of you." ]
    ],
    "tableToFire": [
      [ "{count} of you left.", "Tonight, the fire." ]
    ],
    "traitorsGone": [
      [ "That was the last Traitor.", "It is over." ]
    ],
    "sendOff": [
      [ "Go." ],
      [ "Off you go." ]
    ],
    "tasksFirst": [
      [ "{Time}. Every job is five hundred pounds.", "Somebody here carries poison." ],
      [ "The castle is yours for {time}.", "Work. And watch who gets close." ]
    ],
    "tasksOpen": [
      [ "Another day. {count} of you.", "The jobs are waiting. So is the poison." ],
      [ "{Time}.", "Work, and watch." ],
      [ "Back to work.", "Somebody is carrying it again." ],
      [ "{count} left.", "One of them has poison." ]
    ],
    "poisonYou": [
      [ "It is in your pocket.", "Stand by a Faithful. Hold still. Before the bell." ],
      [ "The poison is yours today.", "Pick your moment. Before the bell." ]
    ],
    "poisonPartner": [
      [ "{name} has the poison today.", "Keep them covered." ],
      [ "Today it is {name}.", "Make sure nobody is watching." ]
    ],
    /* The open table. She says out loud that there are no turns,
       because a room that has spent the whole night being told to wait
       its turn will otherwise wait for one. */
    "fireOpen": [
      [ "{pot}, and a fire.", "Now we find out whose it is." ],
      [ "Here we are. {pot}.", "Everything from here is out loud." ]
    ],
    "fireRules": [
      [ "There may still be a Traitor here.", "End the game, all of you agreeing. Or banish again." ],
      [ "First, do you end it?", "It must be unanimous. If not, somebody goes." ]
    ],
    "fireOfTruth": [
      [ "End the game. Or banish again.", "Into the pouch." ],
      [ "Are you done?", "Or is a Traitor still here?" ]
    ],
    "decideEnd": [
      [ "Unanimous.", "The game is over." ]
    ],
    "decideBanish": [
      [ "Not unanimous.", "Then we banish again." ],
      [ "Somebody is not sure.", "Again." ]
    ],
    "fireWarn": [
      [ "One name.", "Get it wrong, they take everything." ],
      [ "Choose badly and they take the pot." ]
    ],
    "voteName": [
      [ "One name each. Somebody is going." ],
      [ "Name somebody.", "A Traitor is sitting here." ]
    ],
    "voteNameTie": [
      [ "Tied.", "Vote again." ]
    ],
    "pouchIntro": [
      [ "{name}. Your pouch." ],
      [ "{name}. Give it to me." ]
    ],
    "pouchThrow": [
      [ "Let's see." ],
      [ "Now." ]
    ],
    "revealFaithful": [
      [ "{name}...", "was Faithful." ],
      [ "Green.", "{name} was Faithful." ]
    ],
    "revealTraitor": [
      [ "{name}...", "was a Traitor." ],
      [ "Red.", "{name}. Traitor." ]
    ],
    "endPouches": [
      [ "The game is over.", "But you will not leave not knowing." ]
    ],
    "endPouchesCaught": [
      [ "One Traitor accounted for." ]
    ],
    "finalTwoReveal": [
      [ "Two remain. The game ends here.", "Reveal yourselves. One at a time." ]
    ],
    "finalPouchIntro": [
      [ "{name}.", "Your pouch." ],
      [ "Next. {name}.", "Hand it over." ]
    ],
    "finalPouchLast": [
      [ "One pouch left.", "{name}." ],
      [ "And the last.", "{name}." ]
    ],
    "finalFaithful": [
      [ "{name}...", "Faithful." ]
    ],
    "finalTraitor": [
      [ "{name}...", "TRAITOR." ]
    ],
    "pouchIntroYou": [
      [ "Your pouch now." ]
    ],
    "finalPouchYou": [
      [ "Hand me your pouch." ]
    ],
    "finalPouchYouLast": [
      [ "One left. Yours." ]
    ],
    "finalTraitorYou": [
      [ "Red.", "Traitor all night." ],
      [ "Red.", "You lied. And they let you." ]
    ],
    "finalFaithfulYou": [
      [ "Green.", "Exactly what you said you were." ],
      [ "Green, of course.", "The truth nearly cost you." ]
    ],
    "revealTraitorYou": [
      [ "Red.", "You were the Traitor." ]
    ],
    "revealFaithfulYou": [
      [ "Green.", "You were Faithful." ]
    ],
    "againAfterFaithful": [
      [ "Same question. End it, or go again." ]
    ],
    "wonFaithful": [
      [ "No Traitor left.", "{pot}. Yours." ]
    ],
    "wonFaithfulClean": [
      [ "There was never a Traitor here.", "{pot} is yours." ]
    ],
    "wonTraitor": [
      [ "You were all so kind to a Traitor.", "{pot}. Yours alone." ]
    ],
    "lostFaithful": [
      [ "A Traitor sat beside you to the end.", "They take the pot." ]
    ],
    "lostOut": [
      [ "You did not make the end.", "The Faithful share {pot}." ]
    ],
    "lostBurned": [
      [ "You were named.", "The pot goes on without you." ]
    ],
    "lostTraitorCaught": [
      [ "They found you.", "The Faithful take the pot." ]
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
     beat for the whole take: every beat is its own voice read, and each
     read pays a second and a half of start-up and hold that nobody hears
     as drama, only as a gap. The voice still pauses at the full stops.
     `split` gives one beat per sentence, for a caller that cuts between
     them. */
  function beats(setName, vars, seed, opts) {
    const set = SETS[setName];
    if (!set || !set.length) return [];
    const r = U.makeRng((((seed || 0) ^ hash(setName)) >>> 0) || 1);
    const take = set[Math.floor(r() * set.length)];
    const said = take.map(t => fill(t, vars)).filter(Boolean);
    if (opts && opts.split) return said.map(text => ({ text }));
    return said.length ? [{ text: said.join(' ') }] : [];
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
