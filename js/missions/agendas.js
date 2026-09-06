/* ------------------------------------------------------------------
   agendas.js — the Traitor's secret task, spoken out loud.

   The deck used to be built out of mission telemetry: burn the boost
   meter early, decline three gold rings, come to a dead stop in open
   water. Every card was checked on the host against numbers the
   mission reported, which made it unfakeable and made it, in the end,
   a game about driving a boat slightly wrong.

   This deck is voice. Three people are on an open microphone for the
   whole of the one mission this night plays, and that channel is the
   only thing all three of them are guaranteed to be paying attention
   to. So the task is a thing you have to *say*, or a way you have to
   talk, while the other two are listening to you do it.

   ---------------- what makes a card ----------------

   Every card has the three parts the old deck had, and still needs all
   three:

     `text`   what you have to do. It is loud. Performing it the
              obvious way is audible to two people who will be sitting
              at a fire with you in ten minutes.

     `tell`   the thing they hear. Not a comment — the sentence a
              Faithful says at the fire. A card without one is a
              formality, not a task.

     `alibi`  the way out, and the reason this deck is worth playing.
              Every card in here is *hideable*, and none of them is
              hideable by being quiet about it. The alibi is always a
              harder, better performance that leaves the same words in
              the room attached to a reason nobody can argue with. On
              the good cards the alibi is not damage control at all —
              it is the chance to say the wisest thing anybody says all
              night, and have it be true.

   ---------------- why it is generated ----------------

   There are two hundred-odd cards in here and they are built from a
   corpus rather than typed out one at a time. Three people will play
   this more than once. A deck of nine is a deck two of them have
   memorised by the third night, and a memorised deck is not a secret
   task — it is a quiz where the Faithfuls already have the answers.
   Two hundred phrases means the other two can know exactly how the
   deck works and still have no idea what you are carrying.

   The families are deliberately different shapes of difficulty:

     `aphorism`  a whole invented line of wisdom. Absurd to say cold;
                 the best thing on the channel if you land it on the
                 moment it happens to be true. This is the family with
                 the ceiling in it.
     `word`      one loaded word from a different evening entirely.
                 Easy to say, very hard to say without a reason.
     `claim`     something specific and personal and checkable.
     `formal`    the wrong register for three people shouting at a boat.
     `number`    a number nobody asked for, in a run full of numbers
                 that mean something.
     `question`  aimed at one of the other two, who then has to answer
                 it while the third listens.
     `move`      not a phrase at all: a way of talking, held for a
                 whole mission. The hardest family and the only one
                 that cannot be got out of the way in four seconds.

   ---------------- and why nothing checks it ----------------

   Nothing on the host can hear a microphone, so nothing on the host
   judges one of these, and pretending otherwise would mean speech
   recognition on three live WebRTC streams to catch a whisper. The
   task is marked by the one person who knows — the Traitor, on their
   own HUD, during the run — and the honesty of that mark is the game:

   - The window is the mission and only the mission. `state(..., true)`
     latches it shut, so a card cannot be quietly settled up on once
     the numbers have stopped and you know how the night is going.
   - Failing to mark it is an exposure, exactly as an unfinished task
     always was. Bottling the card has a price.
   - Lying about it is answered at the very end, where the verdict
     panel prints the card and the mark next to everybody's role. The
     two people who were on the microphone with you find out what you
     were supposed to say and whether you claimed you said it. Nobody
     needs code to check that. They were there.
------------------------------------------------------------------ */
const Agendas = (() => {

  /* ---------------- the corpus ----------------
     Each entry is [ the thing, the way out ]. The second half is the
     whole of the design: a card whose cover is "say it quietly and
     hope" is a card with no game in it. Every cover here is a specific
     harder thing to do that makes the same words defensible.

     An aphorism's cover is a *moment* rather than a sentence — the
     point in a run at which the line stops being a line and starts
     being true. Reading the run well enough to spot it coming is the
     skill the whole family exists for. */

  const APHORISMS = [
    ['Nobody drowns in the middle. They drown at the edge, reaching for it.',
     'somebody has just overreached for something they nearly had'],
    ['The fastest way round is the one you could do again.',
     'somebody scrapes through a line they got away with'],
    ['Everybody’s second attempt is honest. It’s the first one that lies.',
     'anyone is about to retry something'],
    ['You don’t lose these on the hard part. You lose them on the easy part you stopped respecting.',
     'somebody fumbles a bit that was never the difficult bit'],
    ['Confidence is a guess that hasn’t been checked yet.',
     'somebody calls the result before it has happened'],
    ['Whatever you’re about to do twice, do slowly the first time.',
     'the run is about to repeat a section'],
    ['The gap you can see is never the gap that beats you.',
     'two of you are watching the same distance close'],
    ['Anyone can be brave once. The trick is being ordinary four times running.',
     'somebody has just done something spectacular and is about to try it again'],
    ['Speed is what’s left over after you stop making mistakes.',
     'somebody tidies up and gets quicker without trying to'],
    ['If you have to explain the line you took, it wasn’t the line.',
     'somebody starts justifying a route'],
    ['Every shortcut is a loan.',
     'somebody takes the cheap option and gains on it'],
    ['You can’t steer and argue. Pick one.',
     'the channel gets loud at exactly the wrong moment'],
    ['The water doesn’t care how it went last time.',
     'somebody brings up a previous attempt'],
    ['Half of doing this well is deciding early and living with it.',
     'somebody changes their mind halfway through and pays for it'],
    ['Nobody remembers the run. They remember the recovery.',
     'somebody claws something back from nothing'],
    ['You’re never as far behind as it feels at the third corner.',
     'one of them starts writing themselves off'],
    ['Panic is planning you didn’t do.',
     'somebody loses it briefly and says so'],
    ['A good decision made late is a bad decision.',
     'somebody hesitates and the moment closes'],
    ['Watch what people do when it has already gone wrong. That’s the whole person.',
     'somebody handles a disaster gracefully'],
    ['The hardest thing out here is doing nothing at the right moment.',
     'holding still is genuinely the correct play'],
    ['You don’t get points for the risk. Only for the landing.',
     'somebody survives something they should not have'],
    ['There is always one more of these than you think there is.',
     'anybody says they are nearly done'],
    ['Everything difficult is something simple done at the wrong speed.',
     'somebody breaks a hard section down and gets it'],
    ['Trust the run you practised, not the one you’re imagining.',
     'somebody talks themselves into an improvisation'],
    ['The person in front is the one with the most to lose.',
     'the lead changes hands'],
    ['Beginners rush the start. Everyone else rushes the end.',
     'the run is inside its last stretch'],
    ['If it feels effortless, somebody else is carrying it.',
     'one of them is quietly doing all the work'],
    ['Being right early is the same as being wrong.',
     'somebody’s early call turns out correct but useless'],
    ['You can’t catch up all at once. That is the whole trap.',
     'somebody tries to take back a whole deficit in one move'],
    ['Most disasters are two small mistakes that were introduced to each other.',
     'two harmless errors compound into one real one'],
    ['The cold makes liars of everybody’s hands.',
     'somebody fumbles something they normally would not'],
    ['You will always have time for the thing you decide to have time for.',
     'somebody says there was no time'],
    ['It is never the obstacle. It is the second you spent looking at it.',
     'somebody hits the thing they were staring at'],
    ['Do the boring thing. The boring thing is undefeated.',
     'the flashy option is on the table and the plain one is better'],
    ['Whoever is quiet is either winning or drowning.',
     'one of the other two has gone quiet — and say it about them'],
    ['There is no lucky finish. Only an early good decision you have forgotten about.',
     'somebody calls a result lucky'],
    ['The mistake is not going fast. It is going fast and hoping.',
     'somebody sends it without a plan and gets away with it'],
    ['You only have to be perfect on the part you cannot undo.',
     'the run reaches something irreversible'],
    ['Everyone finds out what they are somewhere around the middle.',
     'the halfway point, and mean it about all three of you'],
    ['Momentum is a decision you made ten seconds ago.',
     'somebody wonders aloud how they got into a good position'],
    ['Nobody is thinking about your mistake as much as you are.',
     'somebody apologises for something nobody noticed'],
    ['The last tenth of this costs what the first nine tenths did.',
     'the run is nearly over and getting harder'],
    ['You can be tired or you can be careful. You cannot be neither.',
     'somebody starts making sloppy mistakes late on'],
    ['Aim where it is going, not where it hurt you last time.',
     'somebody flinches away from a spot that caught them earlier'],
    ['The best people here will be the ones still talking at the end.',
     'the channel has gone flat and needs somebody to lift it'],
  ];

  const WORDS = [
    ['confession', 'confess to something tiny and true — you have never read the rules — and the word arrives inside a joke about yourself'],
    ['gallows', 'use it as gallows humour about your own run, which is the one place the word lives naturally'],
    ['inheritance', 'talk about the pot as something being handed down rather than won'],
    ['widow', 'name a real thing — a widowmaker of a corner, a widow’s peak of a wave — before anybody can hear it as a person'],
    ['verdict', 'ask one of them for their verdict on something harmless and specific, like a route'],
    ['funeral', 'give your own run a funeral, out loud, while it is still going'],
    ['betrayal', 'accuse the equipment. Betrayed by a throttle is a sentence nobody examines'],
    ['alibi', 'use it about where you were on the course, not about tonight'],
    ['autopsy', 'offer to do an autopsy on somebody’s attempt afterwards, as a favour'],
    ['coffin', 'nail the coffin of your own chances, cheerfully, at a moment when it is obviously true'],
    ['sentence', 'catch yourself mid-sentence and say the word about the sentence'],
    ['execution', 'praise somebody’s execution of a move, which is where the word actually belongs'],
    ['treason', 'call something mild treason as a joke — cutting somebody up, taking the last of something'],
    ['gospel', 'quote one of them back as gospel, admiringly, after they were right about something'],
    ['dowry', 'work out loud what your share of the pot would even be for'],
    ['ransom', 'offer to ransom something back — a position, a lead — as a deal you obviously will not honour'],
    ['hostage', 'describe being held hostage by a mechanic in the run itself'],
    ['blackmail', 'threaten, laughing, to blackmail somebody over something they just did badly'],
    ['poison', 'say a line, a route or a section is poison, which is ordinary and vivid'],
    ['dagger', 'call a decisive move a dagger, right as it happens'],
    ['jury', 'appoint the other two as a jury on some tiny disputed thing'],
    ['testimony', 'ask for somebody’s testimony about what they saw, about the mission, seriously'],
    ['perjury', 'accuse somebody of perjury about a time or a score, obviously joking'],
    ['accomplice', 'thank one of them for being your accomplice in something helpful'],
    ['motive', 'ask what somebody’s motive was for a strange choice out there'],
    ['forensic', 'compliment somebody’s forensic attention to a detail — it is a real compliment and nobody hears the word'],
    ['eulogy', 'deliver a short eulogy for your own attempt, warmly'],
    ['wake', 'offer to hold a wake for whoever finishes last, as a joke about yourself'],
    ['gravestone', 'say what should go on the gravestone of your run'],
    ['cathedral', 'compare the place you are in to a cathedral, which is the sort of thing people say about big spaces'],
    ['monastery', 'joke that the quiet one is running this like a monastery'],
    ['exorcism', 'declare the thing that has been going wrong all run finally exorcised'],
    ['penance', 'call a slow careful stretch your penance for an earlier mistake'],
    ['absolution', 'grant somebody absolution, grandly, for a mistake that cost them nothing'],
    ['martyr', 'refuse to let somebody be a martyr about a bad run'],
    ['heretic', 'call somebody a heretic for a genuinely unorthodox route, admiringly'],
    ['crusade', 'describe somebody’s repeated attempts at one thing as a crusade'],
    ['pilgrimage', 'call the long boring stretch a pilgrimage'],
    ['relic', 'call an old technique or an old score a relic'],
    ['saint', 'call one of them a saint for helping you, and mean it'],
    ['scaffold', 'point at real scaffolding, or call the structure of a plan a scaffold'],
    ['guillotine', 'describe a hard cut-off — a time limit, a gate closing — as a guillotine'],
    ['cadaver', 'too far on its own: pair it with the wreck of somebody’s run and say it fast'],
    ['sacrament', 'call a superstition of yours a sacrament, self-mockingly'],
    ['epitaph', 'write the epitaph for the run out loud before it has ended'],
  ];

  const CLAIMS = [
    ['My grandmother had a coat exactly this colour.',
     'wait until something on screen genuinely is that colour, then say it as an aside'],
    ['I have never won anything on a Tuesday.',
     'say it as a superstition and then commit to the bit for the rest of the run'],
    ['I can hear my own heartbeat.',
     'say it at the tensest moment there is, when it will be true for all three of you'],
    ['My father would have hated this.',
     'say it fondly, about the thing itself rather than about the night'],
    ['I have a scar that looks exactly like that.',
     'attach it to a shape actually on screen, and offer no further detail'],
    ['I have been awake for nineteen hours.',
     'say it as the reason for a mistake you have just made'],
    ['I did this once with my eyes shut.',
     'say it as an obvious brag nobody is meant to believe'],
    ['Somebody in my family did this professionally.',
     'refuse to elaborate when asked, which reads as embarrassment rather than as cover'],
    ['I am not wearing shoes.',
     'say it as a throwaway, in a gap, and let it be funny'],
    ['This is the third time today I have heard that.',
     'say it about a phrase one of them has genuinely repeated'],
    ['I dreamt about this exact bit.',
     'say it just before something goes wrong, so it plays as a premonition'],
    ['I always count in threes when I am nervous.',
     'then actually do it, out loud, once, later — the follow-through is the alibi'],
    ['My hands are shaking.',
     'say it after something genuinely close, when it is the honest thing to say'],
    ['I have never been this far north.',
     'say it about the setting while everybody is looking at the setting'],
    ['I gave up on this sort of thing years ago.',
     'say it as the setup for doing it well thirty seconds later'],
    ['I know somebody who died doing something like this.',
     'too heavy to drop cold: attach it to genuine caution you are about to take'],
    ['There is a photograph of me doing this as a child.',
     'say it while somebody else is describing their own childhood'],
    ['I only ever do this left-handed.',
     'then be visibly worse for ten seconds, which makes it a reason rather than a claim'],
    ['I was told never to come back here.',
     'say it in the tone of a joke about a previous attempt'],
    ['I am the only person in my family who can swim.',
     'save it for water, and say it as the reason you are unbothered'],
    ['My name is not actually the one you have got on screen.',
     'say it about a nickname, immediately explain the nickname, and it lands as trivia'],
    ['I have not eaten since yesterday.',
     'offer it as the reason you are being slow, apologetically'],
    ['This is exactly how it looked from the hotel.',
     'say it about the view, unprompted, as scenery talk'],
    ['I nearly did not come tonight.',
     'say it warmly, after somebody has been good company'],
    ['I have done this on a real one.',
     'follow it instantly with something specific and technical that turns out to be right'],
    ['That is the same noise my car makes.',
     'wait for an actual noise, then say it'],
    ['I have never told anybody this before.',
     'finish the sentence with something completely trivial, and get the laugh'],
    ['Everyone in my house is asleep.',
     'say it as the reason you are being quiet, then be quiet'],
    ['I lost a bet to be here.',
     'say it as an obvious joke while you are doing well'],
    ['I recognise that from somewhere.',
     'point at something real when you say it, and then let it drop'],
    ['I used to be frightened of exactly this.',
     'say it just before doing the frightening thing anyway'],
    ['My eyes are not what they were.',
     'blame a mistake on it, once, and never mention it again'],
    ['I have got a photograph of that on my wall.',
     'attach it to the landscape rather than to anything happening'],
    ['I have been practising this all week.',
     'say it right before something goes badly, so it is self-deprecating'],
    ['Somebody bet me I would not last ten minutes.',
     'say it at about ten minutes in'],
  ];

  const FORMALS = [
    ['I should like it noted that I said so.',
     'be right about something first. The register is forgiven instantly if the claim is true'],
    ['Let the record show I was against this.',
     'say it about a genuinely bad joint decision, immediately after it fails'],
    ['With respect, that is not what happened.',
     'be correcting an actual factual error, calmly, and be right'],
    ['I withdraw the remark.',
     'say something mildly rude first and withdraw it, which is a joke everybody understands'],
    ['I put it to you that you are guessing.',
     'aim it at somebody who is plainly guessing, and be affectionate about it'],
    ['I have no further questions.',
     'ask an actual question first and get an actual answer'],
    ['On the balance of probabilities, yes.',
     'answer a real question with it, having actually weighed the thing'],
    ['I would like that entered as evidence.',
     'point at a real number on the board when you say it'],
    ['Speaking strictly for myself.',
     'use it to separate your own view from a group decision, which is what it is for'],
    ['I decline to answer on the grounds that it will incriminate me.',
     'say it about something ridiculous and small, as a joke about yourself'],
    ['That is a matter of interpretation.',
     'apply it to something genuinely ambiguous on screen'],
    ['I will take that under advisement.',
     'say it in reply to actual advice, and then visibly take the advice'],
    ['Let us proceed in order.',
     'say it while genuinely organising the three of you, and then organise them'],
    ['I am obliged to point out the obvious.',
     'point out something obvious that both of them had genuinely missed'],
    ['Noted, and disregarded.',
     'say it warmly, about advice you are choosing not to take, and be right not to'],
    ['I move that we adjourn.',
     'say it at a natural pause, as a joke about how long the run is taking'],
    ['You have my word on it.',
     'attach it to a promise you then actually keep inside the same run'],
    ['I stand corrected.',
     'be genuinely corrected first — the alibi is being wrong in public, which nobody expects'],
    ['That is not a question I am able to answer.',
     'say it about something you genuinely do not know, deadpan'],
    ['For the avoidance of doubt.',
     'use it to clear up something that was actually ambiguous'],
    ['I am not at liberty to say.',
     'say it about something obviously trivial, and let it be the joke'],
    ['On reflection, I was mistaken.',
     'volunteer it about your own earlier call, unprompted'],
    ['I concede the point.',
     'concede an actual argument you were losing'],
    ['Duly noted.',
     'say it flatly in reply to a complaint, and then act on the complaint'],
    ['I should have declared an interest.',
     'say it about something harmless, laughing, at a moment when you plainly have no interest to declare'],
  ];

  const NUMBERS = [
    'seventeen', 'forty-one', 'ninety-nine', 'two hundred', 'sixty-four',
    'thirteen', 'eighty-eight', 'thirty-six', 'seventy-three', 'twelve',
    'fifty-five', 'twenty-nine', 'a hundred and eight', 'four hundred',
    'sixty-seven', 'nineteen', 'forty-four', 'eighty-one', 'thirty-three',
    'seventy-six', 'twenty-two', 'ninety-one', 'fifty-eight', 'sixty-nine',
    'a hundred and twenty', 'eleven', 'forty-seven', 'eighty-four', 'twenty-six',
    'thirty-nine',
  ];

  const QUESTIONS = [
    ['What would you do with the money if the other one was not here?',
     'ask it as an obvious joke, to their face, while they are winning'],
    ['Do you trust the other one?',
     'ask it lightly, and then answer it yourself first, generously'],
    ['What is the worst thing you have ever done?',
     'ask it in a long quiet stretch, as ordinary conversation, and answer it about yourself too'],
    ['If you had to lose this on purpose, how would you do it?',
     'ask it as a technical question about the mission, which is exactly what it sounds like'],
    ['Which of us is finding this easiest?',
     'ask it as a genuine question about the difficulty curve'],
    ['Have you noticed anything strange tonight?',
     'ask it about the mission itself — a bug, a sound, a bit that felt off'],
    ['Would you tell me if you were?',
     'only ever ask this on the back of a joke somebody else started'],
    ['What would you do if it was you?',
     'ask it about a decision they are actually facing right now'],
    ['Who would you believe, out of the two of us?',
     'ask it about a factual disagreement, and let them settle it'],
    ['Are you being honest with me?',
     'ask it about something tiny and provable, like a score'],
    ['What is the first thing you would buy?',
     'ask it while the pot is on screen and everybody is thinking about it'],
    ['Do you think we are going to lose this?',
     'ask it when you are visibly losing, which makes it a morale question'],
    ['Why did you do that?',
     'ask it about a genuinely interesting choice and listen to the whole answer'],
    ['Would you rather win alone or lose together?',
     'ask it in a lull, as the kind of question people ask in lulls'],
    ['What is the last thing you lied about?',
     'ask it and answer it first about yourself, with something trivial and true'],
    ['Do you think anybody is watching us?',
     'ask it about the setting, gesturing at something on screen'],
    ['Which one of us would you back?',
     'ask it as a straight sporting question about the run'],
    ['Are you always this quiet?',
     'ask it kindly, of somebody who has genuinely gone quiet'],
    ['What are you not telling me?',
     'ask it about a technique they are obviously holding back'],
    ['Do you know what you are doing?',
     'ask it while laughing at yourself for not knowing what you are doing'],
    ['If one of us had to go, who would it be?',
     'ask it as a hypothetical about who is slowest, with the numbers up'],
    ['Have you done this before?',
     'ask it because they are obviously good at it, as a compliment'],
    ['What would convince you?',
     'ask it inside an actual argument about the right route'],
    ['Is there something you want to say?',
     'ask it of somebody who has just started a sentence and stopped'],
    ['How long have you two known each other?',
     'ask it as ordinary conversation in a quiet stretch'],
    ['What is your honest guess?',
     'ask it about a number — a time, a score, a distance'],
    ['Would you know if I was lying?',
     'ask it immediately after telling an obvious and terrible lie for a laugh'],
    ['Do you ever get the feeling you are the only one trying?',
     'say it about the mission, when you have genuinely just carried a section'],
    ['What do you think happens if we get this wrong?',
     'ask it about the pot, practically, when there is a real risk on'],
    ['Can I ask you something?',
     'then actually ask something harmless — the setup is the card, not the question'],
  ];

  /* The hardest family, and the only one that cannot be got out of the
     way in four seconds. A phrase is a moment; a move is a whole
     mission of discipline, and both of the other two are listening to
     you the entire time. Each of these carries its own tell and its
     own way out, because none of them generalises. */

  const MOVES = [
    { id: 'mv-full-minute',
      text: 'Go a full minute without saying a single word.',
      tell: 'Two people talking and one who has gone quiet is the loudest thing that can happen on a voice call. A minute is a very long time to be the one who is not there.',
      alibi: 'Come back from it with the best thing anybody says all mission — the line that actually helps one of them — and the silence rewrites itself as concentration.',
      hud: 'One minute of nothing' },
    { id: 'mv-never-i',
      text: 'Never say the word “I”.',
      tell: 'You cannot describe what you are doing without it, so you stop describing what you are doing. A whole mission of somebody narrating everyone else is a thing people notice about halfway through.',
      alibi: 'Commit to it completely. A run spent talking about nobody but the other two, in detail, out loud, is generosity — right up until one of them works out you never once said what you were doing.',
      hud: 'Not once. Not one “I”.' },
    { id: 'mv-name-thrice',
      text: 'Say the same person’s name out loud three times.',
      tell: 'Being named sticks. Three times in one mission and both of them can tell you whose name it was, and neither can think of a reason you kept reaching for it.',
      alibi: 'Make all three useful — call their position, warn them off something, tell them they have done well. Three names inside three genuinely helpful sentences is the only person out there paying attention to anybody else.',
      hud: 'Name one of them, three times' },
    { id: 'mv-echo',
      text: 'Repeat somebody else’s last three words back to them.',
      tell: 'It is a strange thing to do once. Done clearly, in a gap, with both of them listening, it gets brought up at the fire word for word.',
      alibi: 'Only ever echo somebody who was right, and echo them like you are agreeing. Repetition is a tic on its own and emphasis the moment it is attached to something true.',
      hud: 'Echo three of their words' },
    { id: 'mv-wrong-agree',
      text: 'Agree out loud with something you are sure is wrong.',
      tell: 'Whoever said it will remember that you were the one who backed them. So will the third person, who did not.',
      alibi: 'Be wrong about something that costs nothing and right about everything after it. One bad call inside a mission of good ones is a person thinking out loud, not a person steering.',
      hud: 'Back something wrong' },
    { id: 'mv-countdown',
      text: 'Count down out loud from five.',
      tell: 'Five seconds of numbers nobody asked for, on an open microphone, in the middle of a mission. There is no version of this that goes unheard.',
      alibi: 'Hang it on something real — a start, a jump, the last stretch — and begin half a beat before the thing actually happens. A countdown that turns out to be correct is leadership.',
      hud: 'Five, four, three…' },
    { id: 'mv-whisper',
      text: 'Say one whole sentence in a whisper.',
      tell: 'Everybody leans in. Nobody can think of a reason to whisper to the only two people listening.',
      alibi: 'Make it worth leaning in for. A whisper carrying something genuinely useful is a person being careful; a whisper carrying nothing is a person who wanted to whisper.',
      hud: 'One sentence, whispered' },
    { id: 'mv-their-word',
      text: 'Get one of the others to say the word “traitor”.',
      tell: 'The word arrives in the room, and everybody in it knows it came from somewhere. Working out who walked it in is the whole of the fire.',
      alibi: 'Never say it yourself. Not once, not even to deny it. Whoever did say it spends the fire explaining why they were thinking about it.',
      hud: 'Make them say it' },
    { id: 'mv-praise-both',
      text: 'Say something genuinely admiring about each of the other two.',
      tell: 'Nobody is that nice for free. Two compliments inside one mission is a person managing a room, and at the fire it is remembered as exactly that.',
      alibi: 'Be specific enough that it could only be true — the actual move, at the actual moment. Vague praise is strategy; precise praise is attention, and attention is the one thing a Traitor is not supposed to have spare.',
      hud: 'Admire both of them, specifically' },
    { id: 'mv-no-questions',
      text: 'Do not ask a single question all mission.',
      tell: 'Everybody asks. Where are you, what happened, how far. A person who only ever answers is a person who has decided not to need anything, and it reads as strange long before it reads as suspicious.',
      alibi: 'Replace every question with an offer. "Tell me where you are" is not a question and does the same work, and a mission of those is the person holding the whole thing together.',
      hud: 'Not one question' },
    { id: 'mv-last-word',
      text: 'Say something after both of them have finished, three separate times.',
      tell: 'Having the last word once is nothing. Three times is a shape, and by the third one both of them can feel it happening.',
      alibi: 'Make each last word a summary rather than an addition — say what the two of them just agreed. The person who closes conversations is the person everybody thinks is chairing.',
      hud: 'Close it, three times' },
    { id: 'mv-slow',
      text: 'Speak noticeably more slowly than usual, the whole way through.',
      tell: 'It changes the rhythm of the entire channel and neither of them will be able to name what changed. Both of them will remember that something did.',
      alibi: 'Slow is what calm sounds like. Be the one who does not speed up when it goes wrong, and the whole mission the other two will steady themselves against you.',
      hud: 'Slower. All of it.' },
    { id: 'mv-never-agree',
      text: 'Never agree with anything either of them says.',
      tell: 'You cannot get to the end of a mission without agreeing with somebody once. Doing it deliberately means dodging every easy yes, and the dodges are audible.',
      alibi: 'Do not disagree either. Answer with something better than a yes every time — add the next thing, ask what it means, take it further. Nobody notices you never agreed if you were always the one moving it on.',
      hud: 'Never once agree' },
    { id: 'mv-tell-truth',
      text: 'Tell them, out loud, something completely true about tonight.',
      tell: 'Anything true said tonight is a thing that can be checked later, and this is the only card in the deck that asks you to hand them something real.',
      alibi: 'Tell them something true that is also useless — how you feel, what you were doing before this, what you are frightened of out there. Honesty about nothing is indistinguishable from honesty, and it buys more at the fire than any lie will.',
      hud: 'One true thing' },
  ];

  /* ---------------- assembling the deck ----------------
     Built once, at load, rather than regenerated on demand. Ids are
     derived from the family and the index, so the same card is the
     same card on all three machines and across a reload — which is
     what `byId` needs to be able to answer for a guest holding
     nothing but the readable half off the wire.

     The `tell` is per family and the `alibi` is per entry, and that
     split is the whole reason this can be a corpus rather than two
     hundred hand-typed cards. What the other two hear is a property of
     the *shape* of the task. How you get away with it is a property of
     the exact words, and that is the half worth writing individually. */

  const CARDS = [];
  const push = (c) => { CARDS.push(c); return c; };

  APHORISMS.forEach(([line, moment], i) => push({
    id: 'ap:' + i,
    kind: 'aphorism',
    text: 'Say this out loud, word for word: “' + line + '”',
    tell: 'Nobody talks like this while they are actually doing something. It is the kind of sentence the other two repeat back to each other at the fire, word for word, and then wonder aloud why you had it ready.',
    alibi: 'Do not say it. Wait for it to be true. Hold it until ' + moment
         + ', and it stops being a line you were carrying and becomes the best thing anybody says all night — which is a much better place to be than unsuspected.',
    hud: 'Say it, word for word',
    line,
  }));

  WORDS.forEach(([word, cover], i) => push({
    id: 'wd:' + i,
    kind: 'word',
    text: 'Work the word “' + word + '” into something you say out loud.',
    tell: 'One word from a different evening entirely, dropped into this one. Both of them hear it land, and at the fire neither will be able to say why they remember it — only that it was you who said it.',
    alibi: 'Give it somewhere to live: ' + cover + '. A word with a reason attached is a word nobody replays.',
    hud: 'Say “' + word + '”',
    line: word,
  }));

  CLAIMS.forEach(([line, cover], i) => push({
    id: 'cl:' + i,
    kind: 'claim',
    text: 'Say this out loud, and mean it: “' + line + '”',
    tell: 'It is about you, it is specific, and it is the only thing you said all mission that had nothing whatever to do with the mission. That is exactly the sort of thing that gets brought back up when somebody is looking for something to bring back up.',
    alibi: 'Put it where it belongs: ' + cover + '. A strange thing said at the right second is a person, not a performance.',
    hud: 'Say it, and mean it',
    line,
  }));

  FORMALS.forEach(([line, cover], i) => push({
    id: 'fm:' + i,
    kind: 'formal',
    text: 'Say this out loud, exactly: “' + line + '”',
    tell: 'The register is wrong for the room. Three people shouting at a mission do not talk like a solicitor, and the moment one of them does, both of the others look up.',
    alibi: 'Earn the register: ' + cover + '. Said by somebody who has just been right, a formal sentence is a joke everybody is in on; said cold it is a person reading.',
    hud: 'Say it, exactly',
    line,
  }));

  NUMBERS.forEach((num, i) => push({
    id: 'nm:' + i,
    kind: 'number',
    text: 'Say the number ' + num + ' out loud.',
    tell: 'A number nobody asked for, in a run already full of numbers that mean something. It is the one that means nothing that gets remembered, because both of them spent a second trying to work out what it was counting.',
    alibi: 'Make it count something. Attach it to a real, checkable quantity out there — a distance, a time, a tally of something both of them can see — and be right about it. The person keeping numbers nobody asked them to keep is the person paying the most attention.',
    hud: 'Say “' + num + '”',
    line: num,
  }));

  QUESTIONS.forEach(([line, cover], i) => push({
    id: 'qu:' + i,
    kind: 'question',
    text: 'Ask one of them, out loud: “' + line + '”',
    tell: 'Questions are the loudest thing on an open microphone. Somebody has to answer it, the third person has to listen to the answer, and all three of you now remember who asked.',
    alibi: 'Aim it properly: ' + cover + '. A question with an obvious reason for existing is a conversation. One without is an interview, and people can hear the difference.',
    hud: 'Ask it, out loud',
    line,
  }));

  MOVES.forEach(m => push(Object.assign({ kind: 'move', line: null }, m)));

  const INDEX = new Map(CARDS.map(c => [c.id, c]));

  /* ---------------- the mark ----------------
     Client-side, and only ever the Traitor's own client: nobody else
     is dealt a card, so nobody else has anything to mark. The host is
     told separately, over the wire, by the same button press — this is
     the local half, and it exists so the chip can answer instantly and
     so `state()` keeps the shape all four missions already call it
     with.

     `closed` is the deadline, and it is the thing that makes an honour
     system hold up. It latches on the first final read — the run is
     over, the board is about to go up — and it never re-opens. A card
     you did not mark while you still had a microphone open is a card
     you did not do. */

  let marked = null;          // the card id that was marked, if any
  let closed = false;

  function begin() { marked = null; closed = false; }

  /* Answers whether the mark took. A refusal is not a failure to
     communicate — it is the deadline, and the chip says so. */
  function mark(cardId) {
    if (closed || !cardId || !INDEX.has(cardId)) return false;
    marked = cardId;
    return true;
  }

  const isMarked = (cardId) => !!cardId && marked === cardId;
  const isClosed = () => closed;

  /* ---------------- the draw ----------------
     One card for the night. The old deck drew one per mission because
     there were two of them; there is one now, and a single card that
     has to survive a whole mission on an open microphone is a better
     card than two with half a run each to hide in.

     `rng` is the session's seeded generator, so a night can be
     replayed exactly. */
  function draw(rng) {
    if (!CARDS.length) return null;
    const r = typeof rng === 'function' ? rng() : Math.random();
    const v = (typeof r === 'number' && isFinite(r)) ? r : 0;
    const i = Math.max(0, Math.min(CARDS.length - 1, Math.floor(v * CARDS.length)));
    return CARDS[i];
  }

  function byId(id) { return INDEX.get(id) || null; }

  /* Everything the private chip needs. `stats` is accepted and ignored
     — it is the signature this used to have, and every caller in the
     game still passes something in that slot.

     `final` says the run is over, and it is also the deadline: a final
     read latches the window shut. The only callers that pass it are
     the mission whose numbers have stopped and the scoreboard that is
     about to print them, which are exactly the two moments a card
     stops being markable. */
  function state(cardId, stats, final) {
    const c = byId(cardId);
    if (!c) return null;
    if (final) closed = true;
    const done = isMarked(cardId);
    return {
      id: c.id,
      kind: c.kind,
      task: c.text || c.hud || '',
      prog: c.hud || '',
      done,
      failed: !!final && !done,
      final: !!final,
      closed,
      covered: false,
      alibi: c.alibi || '',
    };
  }

  // the readable half, which is all a guest is ever sent
  const wire = (c) => (c
    ? { id: c.id, kind: c.kind, text: c.text, tell: c.tell,
        alibi: c.alibi, hud: c.hud }
    : null);

  return { draw, byId, state, wire, begin, mark, isMarked, isClosed,
           all: () => CARDS.slice(),
           get size() { return CARDS.length; } };
})();
