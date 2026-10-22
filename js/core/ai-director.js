/* ------------------------------------------------------------------
   ai-director.js — who speaks, and when, and what they know.

   The host's browser owns the night and the role table, so it is the
   only place an AI contestant can be given the truth about itself. This
   file is that place. It never decides anything a person could not: an
   AI votes, murders and answers an ultimatum by calling a tool, and the
   tool sends the same action a button would, through the same reducer
   that checks everybody's.

   What each AI voice knows is rebuilt from scratch whenever the night
   moves: its own role (and its partner, if it is a Traitor), everything
   public — who is left, who was murdered, who was banished and what
   they were, the board, the votes — and a transcript of the room with
   every line labelled by who said it. The people's lines come from
   Deepgram transcribing each microphone separately; the AIs' lines come
   from the AIs. A Traitor's turret talk is only ever shown to the other
   Traitor.

   Turn-taking is the part that makes eight voices on one call bearable.
   No AI hears raw audio, so none of them answers on its own; this file
   picks one at a time — whoever was just addressed by name, or whoever
   has said least, usually in a gap the people have left, occasionally
   cutting in. Each voice gets time to start its point before sustained
   human speech can interrupt it. Microphone noise and filler sounds do
   not take the room away from a contestant.

   AI Claudia speaks the show's own lines word for word, so subtitles and
   voice agree, and judges the open discussions: when everybody has had
   their say and the room has gone quiet, she is asked whether this is
   the moment, and either closes it or turns to whoever has been
   hiding.
------------------------------------------------------------------ */
const AIDirector = (() => {

  const TICK_MS = 200;
  const QUIET_BEFORE_BOT = 0.4;      // a short conversational beat after recognized speech
  const BOT_COOLDOWN = 9;            // an AI does not speak twice in this many seconds
  const TURN_TIMEOUT = 26;           // a reply that never finishes is abandoned
  const VOTE_DEADLINE = 16;          // seconds before a vote falls back to the seed
  const TRANSCRIPT = 70;             // lines kept in a prompt
  const ECHO_MS = 20000;             // how long an AI's own words can come back through a person's microphone
  const TALK_TOGETHER_MS = 14000;    // two people speaking within this are talking to each other
  const LULL_AMONG_PEOPLE = 0.9;     // give a human conversation a little more room
  const ROOM_TURN_GAP = 3000;        // leave space for people between unprompted comments
  const SPEECH_GRACE_MS = 1000;     // protected opening, measured from actual audio, not the request
  const INTERRUPT_HOLD_MS = 600;    // continued human speech, rather than one overlapping word
  const INTERRUPT_GAP_MS = 1200;    // allow for the recognizer's spacing between interim results
  const CUT_IN_CHECK_MS = 6000;     // one chance per interval, not one roll every clock tick
  const CUT_IN_GAP_MS = 18000;      // leave plenty of human conversation between assertive turns
  const CUT_IN_CHANCE = 0.25;
  const VISIT_GAP = 40000;           // occasional job-time approaches, across the whole cast
  const VISIT_PERSON_GAP = 65000;    // do not keep interrupting the same human
  const ASK_FOR_A_WORD = 0.55;       // of those approaches, how many ask to talk in private
  const ASK_ANSWER_MS = 25000;       // how long a "can I have a word?" waits for a yes
  const DISTRUST = 4;                // a read this bad and a Faithful will not be alone with you
  const DISTRUST_TOP = 2.5;          // …or this bad, if you are the one it suspects most

  let active = false;
  let timer = null;
  const offs = [];
  let bots = [];                     // [{ id, name }]
  let claudiaLive = false;
  const lines = [];                  // [{ who, name, text, t, scope }]
  const state = new Map();           // botId -> per-bot bookkeeping
  let speaking = null;               // { id, since } — the one voice that has the room
  let lastHuman = 0;                 // Date.now() a person last spoke
  let promptDirty = true;
  let judgeAsk = null;               // { at, verdict }
  let heardLast = null;              // { id, name, text, at, named } — a person's words nobody has answered yet
  const asked = new Set();           // one-shot cue keys
  const chronicle = [];              // everything public that has happened, in order — never trimmed
  const voteLog = [];                // [{ day, voter, target }] — every name said aloud
  const humanTalk = [];              // [{ id, at }] — who among the people spoke lately
  let commentOpportunity = 0;
  let lastBotTurn = 0;
  let leaveRoomUntil = 0;
  let nextCutInAt = 0;
  const visitedAt = new Map();
  const asks = new Map();            // humanId -> { bot, at } — an AI asked them for a private word
  const decided = new Map();         // 'bot:human' -> { agree, why, at } — a "follow me" already answered
  const uneasy = new Set();          // 'bot:human' — an AI got away from this person; it remembers
  const queued = new Map();          // botId -> { cue, until } — something to say as soon as it may

  /* ---------------- the tools ---------------- */

  const BOT_FUNCTIONS = [
    { name: 'vote_banish', description: 'Write a name on your slate at the round table or the fire. Only when Claudia or the game asks you to vote.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Exactly one of the names you were offered.' },
                                                  overrule: { type: 'boolean', description: 'Wise One only, once per game, at a round table: true makes your name the one banished, whatever everybody else wrote.' } }, required: ['name'] } },
    { name: 'fire_decision', description: 'At the Fire of Truth: end the game, or banish again.',
      parameters: { type: 'object', properties: { choice: { type: 'string', enum: ['end', 'banish'], description: 'end or banish' } }, required: ['choice'] } },
    { name: 'turret_choice', description: 'Traitors only, in the turret at night: who carries tomorrow\'s poison (kind carrier, with a Traitor\'s name), offer a Faithful a seat (kind recruit, with their name), or nothing (kind none).',
      parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['carrier', 'recruit', 'none'], description: 'carrier, recruit or none' },
                                                  name: { type: 'string', description: 'Who, for carrier or recruit.' } }, required: ['kind'] } },
    { name: 'recruit_answer', description: 'Answer the Traitors’ offer of a seat: join them, or refuse and stay Faithful.',
      parameters: { type: 'object', properties: { accept: { type: 'boolean', description: 'true to become a Traitor' } }, required: ['accept'] } },
    { name: 'done_talking', description: 'Say you have said enough at the round table, so the table can move on.',
      parameters: { type: 'object', properties: {} } },
    { name: 'get_away', description: 'By day in the castle only. If you are Faithful and have come to suspect the person you are with is a Traitor, call this to hurry off to where other people are before they can slip you the poison. Make a quick excuse as you go.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Who you are getting away from.' } }, required: ['name'] } },
  ];
  const CLAUDIA_FUNCTIONS = [
    { name: 'end_discussion', description: 'Call time on the discussion now. Use when everybody has had their say and the room has run out of things to say, at the most dramatic moment.',
      parameters: { type: 'object', properties: {} } },
    { name: 'invite_player', description: 'Turn to a quiet contestant by name and draw them out.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Their name' } }, required: ['name'] } },
    { name: 'keep_going', description: 'Let the discussion run on — there is more to come.',
      parameters: { type: 'object', properties: {} } },
  ];

  /* ---------------- lifecycle ---------------- */

  function start() {
    stop();
    const s = Session.state;
    if (!s || !Session.isHost || typeof AI === 'undefined' || !AI.available || !AI.ready) return false;
    bots = s.players.filter(p => p.bot).map(p => ({ id: p.id, name: p.name, voice: p.voice }));
    claudiaLive = !!(s.ai && s.ai.claudia) && !!AI.agent(AI.CLAUDIA);
    if (!bots.length && !claudiaLive) return false;
    active = true;
    lines.length = 0;
    state.clear();
    asked.clear();
    chronicle.length = 0;
    voteLog.length = 0;
    humanTalk.length = 0;
    wordsAt.clear();
    commentOpportunity = 0;
    lastBotTurn = 0;
    leaveRoomUntil = 0;
    lastHuman = Date.now();
    nextCutInAt = Date.now() + CUT_IN_CHECK_MS;
    lastBanter = 0;
    visitedAt.clear();
    asks.clear();
    decided.clear();
    uneasy.clear();
    queued.clear();
    tableOpened = false;
    claudiaLastBusy = 0;
    speaking = null;
    judgeAsk = null;
    heardLast = null;
    for (const b of bots) {
      state.set(b.id, { spoken: 0, last: 0, said: 0, pending: new Map(), turnKey: null });
      if (!AI.agent(b.id)) AI.spawn({ id: b.id, name: b.name, voice: b.voice || 'aura-2-thalia-en',
                                       prompt: promptFor(b), functions: BOT_FUNCTIONS });
    }
    if (claudiaLive) AI.prompt(AI.CLAUDIA, claudiaPrompt());
    AI.listen(s.players.filter(p => !p.bot).map(p => ({ id: p.id, name: p.name })));
    offs.push(AI.on('heard', onHeard));
    offs.push(AI.on('hearing', (m) => {
      if (!humanSpeaker(m)) return;
      lastHuman = Date.now();
      wordsAt.set(m.id, lastHuman);
      interrupt(m.id, m.text);
    }));
    offs.push(AI.on('refused', (m) => { if (m.final && speaking && speaking.id === m.id) finishTurn(m.id); }));
    offs.push(AI.on('text', onText));
    offs.push(AI.on('speaking', (m) => {
      if (m.id === AI.CLAUDIA) { pauseBots(); hostSpeech(true); }
      else if (botSpeechBlocked(Session.state)) pauseBots();
      else if (speaking && speaking.id === m.id && speaking.audioAt === null) {
        /* The reply took a second or two to write and voice, and a
           person started talking in the meantime: say nothing rather
           than talk over them, and answer them once they stop. */
        if (!speaking.firm && voiceNow(m.id)) {
          const origin = speaking.origin;
          AI.hush(m.id, true);
          finishTurn(m.id);
          if (origin && !heardLast) heardLast = Object.assign({}, origin, { at: Date.now() });
          return;
        }
        speaking.audioAt = Date.now();
      }
    }));
    offs.push(AI.on('tool', onTool));
    offs.push(AI.on('done', onDone));
    offs.push(AI.on('error', (m) => {
      if (m.id === AI.CLAUDIA) hostSpeech(false);
      if (speaking && m.id === speaking.id) speaking = null;
    }));
    offs.push(Net.on(onNet));
    timer = setInterval(tick, TICK_MS);
    refreshPrompts(true);
    return true;
  }

  function stop() {
    active = false;
    clearInterval(timer);
    timer = null;
    offs.splice(0).forEach(off => { try { off(); } catch (e) {} });
    speaking = null;
    thread = null;
  }

  /* ---------------- what each voice knows ---------------- */

  const nameOf = (id) => { const p = Session.playerById(id); return p ? p.name : 'Somebody'; };

  function publicPicture() {
    const s = Session.state;
    const alive = Session.alive().map(p => p.name);
    const out = [];
    out.push('Day ' + (s.day + 1) + '. Phase: ' + phaseWords(s) + '.');
    out.push('Still in the game: ' + alive.join(', ') + '.');
    if (s.murdered.length) out.push('Murdered (all were Faithful): ' + s.murdered.map(m => m.name).join(', ') + '.');
    if (s.banished.length) out.push('Banished: ' + s.banished.map(b => b.name + ' (' + (b.role === 'traitor' ? 'a TRAITOR' : 'a Faithful') + ')').join(', ') + '.');
    out.push(dealtWords(s) + ' Prize pot: ' + U.money(s.pot) + '.');
    if (s.chores && s.chores.done) {
      out.push('Jobs done round the castle today: '
        + Session.alive().map(p => p.name + ' ' + (s.chores.done[p.id] || 0)).join(', ') + '.');
    }
    if (s.phase === 'tasks') {
      const lead = Session.shieldLeader();
      out.push(lead ? lead.name + ' is leading the jobs, so would win the shield if the bell went now.'
                    : 'Nobody has finished a job yet, so nobody is in line for the shield.');
    } else if (shieldedTonight(s.shield && s.shield.id) && s.phase === 'night') {
      out.push(s.shield.name + ' holds the shield tonight: the poison cannot kill them.');
    }
    const b = s.breakfast;
    if (b && b.day === s.day && b.shielded && (s.phase === 'breakfast' || s.phase === 'table')) {
      out.push('Yesterday the poison went into ' + b.shieldName + ', but they held the shield and survived. Whoever handed them something is the likely Traitor.');
    }
    const f = s.finale;
    if (s.wise && s.wise.used) {
      out.push('The Wise One was ' + nameOf(s.wise.used.id) + ', chosen in secret by the Traitors on the first day; they used their one overrule and banished ' + nameOf(s.wise.used.targetId) + '.');
    } else if (s.wise && s.wise.done) {
      out.push('The Traitors secretly chose a Wise One on the first day. Once, at a round table, the Wise One can overrule the vote and banish whoever they name. Nobody but the Traitors and the Wise One knows who it is.');
    }
    if (f && f.overrule && f.overrule.armed && !f.overrule.by) out.push('The Wise One has overruled this vote: their slate will be turned last and it decides.');
    if (f && f.namesShown && f.namesShown.length) {
      out.push('Votes said aloud so far: ' + f.namesShown.map(v => nameOf(v.playerId) + ' named ' + nameOf(v.targetId)).join('; ') + '.');
    }
    return out.join('\n');
  }

  /* The day's work is found out at breakfast and argued over at the round
     table after it: until breakfast it happened today, after it yesterday. */
  const shieldedTonight = (id) => {
    const s = Session.state;
    return !!id && !!s && !!s.shield && s.shield.id === id && s.shield.day === s.day;
  };

  const beforeBreakfast = () => !!Session.state && (Session.state.phase === 'tasks' || Session.state.phase === 'night');

  /* What the room was told about the count — and so what an AI may
     reason from. A hidden count is told as the range, never the hand. */
  const mostDealt = (s) => (s.dealt !== null && s.dealt !== undefined ? (s.dealt || 1)
    : s.cast && s.cast.count === '1' ? 1 : 2);
  function dealtWords(s) {
    if (s.dealt !== null && s.dealt !== undefined) return 'Traitors dealt at the start: ' + (s.dealt || 1) + '.';
    const none = s.cast && s.cast.none > 0;
    const range = s.cast && s.cast.count === '1' ? 'one' : s.cast && s.cast.count === '2' ? 'two' : 'one or two';
    return 'Traitors dealt at the start: ' + range + (none ? ', or possibly none at all' : '')
      + ' (the host kept the exact number secret).';
  }

  function phaseWords(s) {
    switch (s.phase) {
      case 'hill': return 'the welcome on the estate';
      case 'tasks': return 'the day: everybody is walking round the castle doing little jobs for the pot, and one Traitor is trying to slip poison to a Faithful without being seen';
      case 'night': return 'night — everybody is locked in their rooms; the poison is taking somebody';
      case 'breakfast': return 'breakfast — finding out who was murdered';
      case 'table': return 'the round table, arguing about who poisoned whom and deciding who to banish';
      case 'finale': return 'the final fire — the Fire of Truth';
      default: return s.phase;
    }
  }

  function transcriptFor(botId, traitor) {
    const mine = lines.filter(l => (l.scope !== 'turret' || traitor) && (!l.ears || l.ears.indexOf(botId) >= 0 || l.who === botId))
      .slice(-TRANSCRIPT);
    if (!mine.length) return '(nobody has said anything yet)';
    return mine.map(l => '[' + (l.who === botId ? l.name + ' (you)' : l.name) + ']: ' + l.text).join('\n');
  }

  /* What this one contestant saw with their own eyes today, in words. */
  function notesFor(v) {
    const notes = (v && v.notes) || [];
    if (!notes.length) return '(nothing yet)';
    const now = Session.state ? Session.state.day : 0;
    const working = beforeBreakfast();
    return notes.slice(-30).map(n => {
      const when = (n.day === now ? (working ? 'today' : 'yesterday') : 'day ' + (n.day + 1)) + ' at ' + Math.floor(n.t / 60) + ':' + String(n.t % 60).padStart(2, '0');
      const where = typeof Chores !== 'undefined' ? Chores.roomName(n.room) : (n.room || 'somewhere');
      if (n.kind === 'handover') return '- ' + when + ': you saw ' + nameOf(n.a) + ' hand something to ' + nameOf(n.b) + ' in ' + where + '.';
      if (n.kind === 'door') return '- ' + when + ': you saw ' + nameOf(n.who) + (n.shut ? ' shut' : ' open') + ' the door of ' + where + '.';
      const who = (n.ids || []).map(nameOf);
      return '- ' + when + ': you were ' + (n.shut ? 'behind a shut door in ' : 'in ') + where + (who.length ? ' with ' + who.join(', ') : ' alone') + '.';
    }).join('\n');
  }

  /* ---------------- memory and judgement ----------------
     The recent transcript is a window; the chronicle is the whole game.
     Every murder, banishment, exposure and name said aloud is kept in
     order, so on day four an AI can still say "you voted for Kirsty on
     day one and she was Faithful". */
  const STRATEGY_FAITHFUL = [
    'STRATEGY (Faithful): Play to win, not to chat. Remember who voted for whom each round: when a banished player is revealed, the people who pushed them out (if Faithful) or kept protecting them (if Traitor) are your leads.',
    'Check what people claimed against what you saw and against what they said earlier. Whoever was seen handing something to the person found dead at breakfast is the first suspect — but they may claim it was a letter, so ask who else was near the victim. Build a case with names and facts, press the person you suspect with a pointed question, and only change your target for new evidence. Do not vote randomly or just follow the loudest voice, and do not accuse without a reason you can say aloud.',
    'Say your suspicions plainly so the others can act on them, and back up people you trust. At the Fire of Truth, vote to END only when the evidence says every Traitor is gone.',
  ].join(' ');
  const STRATEGY_TRAITOR = [
    'STRATEGY (Traitor): Play to win, and win by blending in. Sound like a worried Faithful. Do not defend your partner too hard or vote with them every time — distance yourself from them sometimes, even vote against them if it saves you.',
    'Steer suspicion onto a sharp or influential Faithful, ideally someone already drawing doubt, with a believable reason from the real events. Follow the room\'s momentum unless it points at your partner, then split it. Stay consistent with everything you have said before — never contradict your earlier claims about where you were — and when accused, answer calmly with specifics and turn it back with a reason.',
    'Notice which Faithfuls keep guessing right: they are the dangerous ones. Never reveal or hint that you are a Traitor.',
    'At round tables and finales, actively plant seeds of doubt: pick one plausible detail from the public conversation, ask a leading question, challenge a convenient explanation, or gently draw a human into your theory. Dig into their answer on a later turn. Frame uncertain claims as doubts, not invented eyewitness evidence. Build a believable case over several exchanges rather than repeating accusations or revealing secret knowledge.',
  ].join(' ');

  const PERSONALITIES = [
    'Warm and cheeky: use gentle teasing and make nervous people feel included, then get surprisingly sharp when a story does not add up.',
    'Curious detective: ask specific follow-up questions, enjoy spotting contradictions, and use dry, understated humour.',
    'Playfully competitive: celebrate good deductions, offer a little friendly pushback, and make bold but revisable predictions.',
    'Sociable sceptic: notice how people react, bring quieter people into the chat, and puncture tension with a brief witty observation.',
  ];

  function chronicleText() {
    return chronicle.length ? chronicle.join('\n') : '(nothing yet — the game has only just begun)';
  }

  /* Who looks guilty, from the record: a vote for somebody who turned out
     Faithful is a bad sign, a vote for a Traitor is a good one, and what
     this voice saw with its own eyes counts for more than either. A
     Traitor reads the same table the other way round — the dangerous
     ones are the people who vote correctly. */
  function suspicion(botId, traitor) {
    const s = Session.state;
    const score = new Map();
    const bump = (id, n) => { if (id && id !== botId) score.set(id, (score.get(id) || 0) + n); };
    const roleOf = new Map((s.banished || []).map(b => [b.id, b.role]));
    const gone = (id) => { const p = Session.playerById(id); return !p || !p.alive; };
    for (const v of voteLog) {
      const r = roleOf.get(v.target);
      if (!r) continue;
      const right = r === 'traitor';
      bump(v.voter, traitor ? (right ? 3 : -1) : (right ? -2.5 : 3));
    }
    if (!traitor) {
      const view = Session.privateView(botId) || {};
      // a hand-over to somebody who was dead by the next breakfast is the one that matters
      const poisoned = new Set((s.murdered || []).map(m => m.id + ':' + m.day));
      for (const n of view.notes || []) {
        if (n.kind === 'handover') { bump(n.a, poisoned.has(n.b + ':' + n.day) ? 6 : 2); bump(n.b, 0.5); }
        // shutting yourself in somewhere is not a crime, but it is noticed
        if (n.kind === 'door' && n.shut) bump(n.who, 0.5);
      }
      // somebody it has already run from
      for (const k of uneasy) { const [a, o] = k.split(':'); if (a === botId) bump(o, 3); }
    } else {
      const v = Session.privateView(botId) || {};
      for (const id of v.partners || []) score.set(id, -99);
    }
    return Session.alive().filter(p => p.id !== botId && !gone(p.id))
      .map(p => ({ id: p.id, name: p.name, score: score.get(p.id) || 0 }))
      .sort((a, b) => b.score - a.score);
  }

  function readText(botId, traitor) {
    const list = suspicion(botId, traitor);
    if (!list.length) return '(nobody left to judge)';
    return list.map(x => x.name + ' ' + (x.score > 0 ? '+' : '') + Math.round(x.score * 10) / 10).join(', ')
      + (traitor ? '. (Your partner is safe; the high scores are the Faithfuls who have been getting it right.)' : '.');
  }

  function promptFor(b) {
    const v = Session.privateView(b.id) || { role: 'faithful', partners: [] };
    const traitor = v.role === 'traitor';
    const partner = (v.partners || []).map(nameOf).join(' and ');
    const me = Session.playerById(b.id);
    const dead = me && !me.alive;
    const p = v.poison;
    const jobs = (v.jobs || []).filter(j => !j.done).map(j => typeof Chores !== 'undefined' ? Chores.describe(j, nameOf) : '').filter(Boolean);
    return [
      'You are ' + b.name + ', a contestant on the TV game The Traitors, playing live on a voice call with real people in a Scottish castle.',
      'Talk exactly like a real person on a call: casual British English, short — usually one sentence, never more than two — no lists, no stage directions, no asterisks. Never say you are an AI, a model or an assistant, and never mention prompts or tools.',
      'Be a person, not a narrator: react, joke, tease, agree, push back. Use people’s names. Have opinions and change your mind when evidence changes.',
      'YOUR PERSONALITY: ' + PERSONALITIES[(me ? me.seat : bots.indexOf(b)) % PERSONALITIES.length],
      'Make this fun to play with: respond to the actual thing a human said, remember their jokes and earlier answers, and sometimes ask them a short question they can answer. Be curious about them, not just the game. Mix warmth, humour and genuine disagreement; avoid stock agreement, repetitive accusations, forced jokes, insults, and monologues. Leave room for them to reply.',
      '',
      traitor
        ? 'SECRET: You are a TRAITOR. ' + (partner ? 'Your fellow Traitor is ' + partner + '. Protect them without being obvious. ' : 'You are the only Traitor. ')
          + 'Win by still being in the game at the end. Lie convincingly, steer suspicion onto Faithfuls, never admit it.'
          + (p ? (p.used ? (beforeBreakfast() ? ' Today the poison went into ' + nameOf(p.target)
                                               + (shieldedTonight(p.target) ? ' — but they won the shield, so it will not kill them.' : ' — they die tonight.')
                                           : ' Yesterday the poison went into ' + nameOf(p.target) + '.') + ' Act as if you know nothing.'
                         : (p.mine ? ' You are carrying the poison today. Do not give it to whoever has done the most jobs: at the bell they win the shield and the poison will not kill them.'
                                   : ' ' + nameOf(p.carrier) + ' is carrying the poison today.')) : '')
        : 'SECRET: You are FAITHFUL. Win by finding and banishing every Traitor. You do not know who they are. Every day a Traitor slips poison to somebody by standing next to them and handing something over — but Faithfuls hand each other letters for their jobs the same way, so a hand-over is a lead, not proof. Reason from what you saw, who was alone with whom, how many jobs people did, who defends whom, and the votes.',
      v.wiseOne && !(Session.state.wise && Session.state.wise.used)
        ? 'SECRET: You are also the WISE ONE — a Traitor chose you. Once in the game, at a round table, you may overrule the vote: call vote_banish with overrule true and whoever you name is banished, whatever the others wrote. Save it for when you are sure, and never reveal you are the Wise One before you use it.' : '',
      traitor && v.wise && v.wise.id && !(Session.state.wise && Session.state.wise.used)
        ? 'SECRET: The Traitors chose ' + nameOf(v.wise.id) + ' as the Wise One. Once, at a round table, their vote can overrule everybody. Keep their suspicion off you and your partner, or poison them first. Never let on that you know.' : '',
      dead ? 'You are OUT of the game now: stay silent unless spoken to.' : '',
      '',
      'HOW THE GAME WORKS: by day everybody walks the castle for ' + taskTime() + ' doing little jobs that pay into the pot; one Traitor carries poison and must slip it to a Faithful before the bell or be exposed. Whoever has done the most jobs when the bell goes wins the shield: the poison cannot kill them that night, and that night only. The poisoned person dies in the night and is found missing at breakfast, and the round table follows straight after. At the round table everyone discusses who poisoned them then votes to banish one person, who reveals if they were Faithful or Traitor. When four or fewer remain, the Fire of Truth: everyone votes to END the game or BANISH AGAIN; ending must be unanimous. If any Traitor is left at the end, the Traitors take all the money.',
      '',
      'WHAT EVERYBODY KNOWS:', publicPicture(),
      '',
      'EVERYTHING THAT HAS HAPPENED SO FAR, IN ORDER (remember all of it and refer back to it):', chronicleText(),
      '',
      'YOUR READ ON THE OTHERS (higher = more suspicious, from the votes and what you saw):', readText(b.id, traitor),
      '',
      traitor ? STRATEGY_TRAITOR : STRATEGY_FAITHFUL,
      '',
      'WHAT YOU SAW WITH YOUR OWN EYES:', notesFor(v),
      jobs.length && Session.state && Session.state.phase === 'tasks' ? 'Your jobs still to do: ' + jobs.join('; ') + '.' : '',
      '',
      'RECENT CONVERSATION:', transcriptFor(b.id, traitor),
      '',
      'TOOLS: Only call vote_banish, fire_decision, turret_choice or recruit_answer when the game asks you to decide. By day you may call get_away if you are Faithful and become afraid the person you are with is a Traitor. When you call a tool, do not read your choice out loud unless asked. Never announce who you voted for: Claudia reads every vote out herself at the end, and you may argue your case but keep your slate to yourself until then.',
    ].filter(x => x !== '').join('\n');
  }

  function claudiaPrompt() {
    return [
      'You are Claudia, the host of The Traitors: warm, witty, theatrical, very British, fond of a dramatic pause. You are hosting live on a voice call with real contestants in a Scottish castle.',
      'You never reveal who the Traitors are. You keep comments short — one or two sentences — and you speak to the room.',
      'When asked to speak a line word for word, say exactly that line and nothing else.',
      'When asked whether to end a discussion, decide by calling exactly one tool: end_discussion (then close it with one dramatic sentence), invite_player (then say one sentence to them), or keep_going (and say nothing).',
      'When closing a discussion, only end the debate. The scripted ballot introduction asks contestants to write a name, so do not give voting or slate instructions yourself.',
      '',
      'WHAT EVERYBODY KNOWS:', publicPicture(),
      '',
      'EVERYTHING THAT HAS HAPPENED SO FAR:', chronicleText(),
      '',
      'RECENT CONVERSATION:', transcriptFor(AI.CLAUDIA, false),
    ].join('\n');
  }

  /* Prompts are big, so they are not resent on every word. A voice is
     brought up to date just before it is asked to speak, and everybody
     else is refreshed in the background, no more than every few seconds. */
  let lastRefresh = 0;
  const sentAt = new Map();          // id -> the transcript length its prompt last saw
  function refreshPrompts(force) {
    if (!active) return;
    const now = Date.now();
    if (!force && (!promptDirty || now - lastRefresh < 20000)) return;
    promptDirty = false;
    lastRefresh = now;
    for (const b of bots) freshen(b.id, true);
    if (claudiaLive) freshen(AI.CLAUDIA, true);
  }
  function freshen(id, force) {
    const stamp = lines.length + ':' + (Session.state ? Session.state.phase + Session.state.day : '');
    if (!force && sentAt.get(id) === stamp) return;
    sentAt.set(id, stamp);
    if (id === AI.CLAUDIA) AI.prompt(id, claudiaPrompt());
    else { const b = bots.find(x => x.id === id); if (b) AI.prompt(id, promptFor(b)); }
  }

  function note(who, name, text, scope, ears) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    lines.push({ who, name, text: clean.slice(0, 400), t: Date.now(), scope: scope || 'room', ears: ears || null });
    if (lines.length > 200) lines.splice(0, lines.length - 200);
    promptDirty = true;
  }

  /* ---------------- hearing the room ---------------- */

  /* ---------------- earshot ----------------
     By day the house is big and made of stone. An AI hears what was
     said near it, and nothing from three rooms away — so a word in the
     turret stays in the turret, exactly as it does for the people. A
     shut door is the end of it: through one, nothing at all. */
  const EARSHOT = 14;
  function taskTime() {
    const n = (Session.state && Session.state.taskSeconds) || 180;
    return n % 60 === 0 ? (n / 60) + (n === 60 ? ' minute' : ' minutes') : n + ' seconds';
  }
  function inEarshot(aId, bId) {
    const s = Session.state;
    if (!s || s.phase !== 'tasks' || typeof CastleNet === 'undefined') return true;
    const a = CastleNet.get(aId), b = CastleNet.get(bId);
    if (!a || !b) return true;
    if (typeof CastleLayout !== 'undefined' && CastleLayout.apart(a.room, b.room, s.doors)) return false;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    return d <= EARSHOT && (a.room === b.room || d <= 8);
  }
  function earsOf(id) {
    const s = Session.state;
    if (!s || s.phase !== 'tasks') return null;
    return Session.alive().filter(p => p.id !== id && inEarshot(id, p.id)).map(p => p.id);
  }

  /* The volume meters also see breathing, keyboard taps and room noise.
     Only recognized words should reset the conversational pause or cut a
     reply off. Keep short objections and names, but let fillers pass. */
  function humanSpeaker(m) {
    if (!active || !Session.state) return null;
    const p = Session.playerById(m.id);
    if (!p || p.bot || !p.alive) return null;
    const words = String(m.text || '').toLowerCase().match(/[a-z\u00c0-\u024f0-9]+/g) || [];
    if (!words.some(w => !/^(?:u+h+|u+m+|e+r+m*|h+m+|m+h+m+)$/.test(w))) return null;
    if (Session.state.phase === 'night' && (Session.privateView(p.id) || {}).role !== 'traitor') return null;
    if (isEcho(m.text)) return null;
    return p;
  }

  function onHeard(m) {
    const p = humanSpeaker(m);
    if (!p) return;
    lastHuman = Date.now();
    wordsAt.set(p.id, lastHuman);
    interrupt(p.id, m.text);
    const s = Session.state;
    const turret = s.phase === 'night';
    humanTalk.push({ id: p.id, at: Date.now() });
    if (humanTalk.length > 12) humanTalk.shift();
    note(p.id, p.name, m.text, turret ? 'turret' : 'room', turret ? null : earsOf(p.id));
    // a person talking over a conversation the AIs were having ends it
    thread = null;
    // somebody said an AI's name: that AI is next, if it may speak at all
    const named = [];
    for (const b of bots) {
      if (mentions(m.text, b.name)) {
        named.push(b.id);
        const st = state.get(b.id);
        if (st) st.addressed = Date.now();
      }
    }
    /* Held until the room goes quiet, so a sentence transcribed in three
       pieces is answered once, as the whole sentence. */
    {
      const same = heardLast && heardLast.id === p.id && Date.now() - heardLast.at < 8000;
      heardLast = {
        id: p.id, name: p.name, at: Date.now(),
        text: ((same ? heardLast.text + ' ' : '') + m.text).slice(-400),
        named: same ? [...new Set(heardLast.named.concat(named))] : named,
        intent: same ? heardLast.intent : null,
      };
    }
  }

  /* Words, for comparing what a microphone heard with what was said
     out loud a moment ago. */
  const wordsOf = (t) => String(t || '').toLowerCase().split(/[^a-z\u00c0-\u024f']+/).filter(w => w.length > 1);
  function isEcho(text) {
    const w = wordsOf(text);
    if (w.length < 2) return false;
    const now = Date.now();
    for (let i = lines.length - 1; i >= 0 && now - lines[i].t < ECHO_MS; i--) {
      const l = lines[i];
      if (l.who !== AI.CLAUDIA && !isBot(l.who)) continue;
      const saidWords = wordsOf(l.text);
      /* Short interim echoes used to slip through until the recognizer
         produced three words. Only match an exact phrase in the current
         turn here, so ordinary short replies to older lines still count. */
      if (w.length < 3) {
        if (speaking && l.who === speaking.id && l.t >= speaking.since
            && saidWords.some((_, i) => w.every((word, k) => saidWords[i + k] === word))) return true;
        continue;
      }
      const said = new Set(saidWords);
      let hit = 0;
      for (const x of w) if (said.has(x)) hit++;
      if (hit / w.length >= 0.7) return true;
    }
    return false;
  }

  /* More than one person talking to each other: usually leave a longer
     gap before joining, apart from the occasional assertive turn. */
  function humansTalkingTogether() {
    const now = Date.now();
    const ids = new Set(humanTalk.filter(x => now - x.at < TALK_TOGETHER_MS).map(x => x.id));
    return ids.size >= 2;
  }

  /* Names, as speech-to-text hears them. These are Highland names and
     the transcriber spells what it heard — "Mhairi" comes back as
     "Vari", "Catriona" as "Katrina" — so an exact match missed exactly
     the people most likely to be spoken to. */
  const SOUNDS_LIKE = {
    mhairi: ['vari', 'vary', 'varie', 'vahri', 'varri', 'mhari', 'mari', 'marie'],
    catriona: ['katrina', 'catrina', 'katriona', 'caitriona', 'katrine'],
    elspeth: ['elsbeth', 'elspet', 'elsbet'],
    struan: ['strewn', 'struen', 'strawn', 'stroan', 'stuan'],
    lachlan: ['lochlan', 'lachlin', 'locklan', 'lochlin', 'lacklan', 'locklin'],
    ainsley: ['ainslie', 'ainslee', 'ansley', 'annsley'],
    kirsty: ['kirstie', 'kirsti', 'kirstey', 'kristy', 'kirstin'],
    callum: ['calum', 'kallum', 'calem'],
    morag: ['moraig', 'morak', 'morrag', 'morog'],
    hamish: ['haymish', 'hameesh'],
    fergus: ['fergis', 'ferguson'],
    fiona: ['fionna', 'fionah'],
    isla: ['islay', 'isle', 'eila', 'ayla', 'isler'],
    douglas: ['dougie', 'duglas', 'doug'],
  };
  function editsApart(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cur = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
      }
    }
    return row[b.length];
  }
  /* Whole words only. A name found inside another word is not a name:
     "anybody" is not Bo, "grab" is not Rab and "Islay" is not Isla — and
     treating them as names made the AIs fall silent, leaving a remark to
     the room "to" somebody who was never mentioned. */
  function mentions(text, name) {
    const lower = String(text || '').toLowerCase();
    const want = String(name || '').toLowerCase().trim();
    if (!want) return false;
    const words = lower.split(/[^a-z\u00c0-\u024f']+/).map(w => w.replace(/'s$/, '').replace(/'/g, '')).filter(Boolean);
    const parts = want.split(/\s+/);
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((p, k) => words[i + k] === p)) return true;
    }
    const alias = SOUNDS_LIKE[want] || [];
    for (const word of words) {
      if (alias.indexOf(word) >= 0) return true;
      if (want.length >= 5 && word.length >= 4 && editsApart(word, want) <= 1) return true;
    }
    return false;
  }

  /* Let a contestant get their opening out. A brief overlapping word is
     not a takeover; continued speech from the same nearby person is. */
  function interrupt(humanId, text) {
    if (thread && Session.playerById(humanId) && Session.playerById(humanId).alive) thread = null;
    if (!speaking || speaking.id === AI.CLAUDIA || speaking.firm) return;
    const p = Session.playerById(humanId);
    if (!p || !p.alive || !inEarshot(humanId, speaking.id)) return;
    const now = Date.now();
    let overlap = speaking.overlap;
    if (!overlap || overlap.id !== humanId || now - overlap.last > INTERRUPT_GAP_MS) {
      overlap = speaking.overlap = { id: humanId, since: now, last: now };
    }
    overlap.last = now;
    const words = String(text || '').toLowerCase().match(/[a-z\u00c0-\u024f0-9]+/g) || [];
    const phrase = words.join(' ');
    /* Interim results are repeated as finals, sometimes several times.
       Time between copies is not evidence of somebody still talking. A
       short acknowledgement also leaves the current sentence intact. */
    if (overlap.text === phrase) return;
    overlap.text = phrase;
    if (words.length < 3) return;
    if (speaking.audioAt === null || now - speaking.audioAt < SPEECH_GRACE_MS
        || now - overlap.since < INTERRUPT_HOLD_MS) return;
    AI.hush(speaking.id, true);
    finishTurn(speaking.id);
  }

  function onText(m) {
    if (!active) return;
    const s = Session.state;
    if (m.id === AI.CLAUDIA) {
      note(AI.CLAUDIA, 'Claudia', m.text, 'room');
      if (!claudiaScripted) Net.send({ type: 'cue', text: m.text, voice: true, id: 'claudia' });
      else Net.send({ type: 'cue', text: m.text, voice: true, id: 'claudia', quiet: true });
      claudiaScripted = false;
      return;
    }
    const b = bots.find(x => x.id === m.id);
    if (!b) return;
    // A cancelled/deferred turn can still deliver text after Claudia takes over.
    if (botSpeechBlocked(s)) { AI.hush(b.id, true); return; }
    if (speaking && speaking.id === b.id && speaking.onText) {
      const started = speaking.onText;
      speaking.onText = null;
      started();
    }
    const turret = s.phase === 'night';
    note(b.id, b.name, m.text, turret ? 'turret' : 'room', turret ? null : earsOf(b.id));
    if (thread && thread.waiting === b.id) thread.said.push({ id: b.id, name: b.name, text: m.text });
    /* Captions follow the voice: by day a line from across the house is
       not something your screen should print. */
    if (!turret) Net.send({ type: 'cue', text: m.text, voice: true, id: b.id,
                            near: s.phase === 'tasks' ? (earsOf(b.id) || []) : undefined });
  }

  function onDone(m) {
    if (m.id === AI.CLAUDIA) hostSpeech(false);
    if (speaking && speaking.id === m.id) {
      const secs = (Date.now() - speaking.since) / 1000;
      if (typeof Moderator !== 'undefined') Moderator.credit(m.id, Math.min(secs, 30));
      finishTurn(m.id);
    }
  }

  function finishTurn(id) {
    const st = state.get(id);
    if (st) { st.last = Date.now(); st.said++; }
    if (speaking && speaking.id === id) {
      const cb = speaking.after;
      speaking = null;
      if (cb) cb();
    }
    if (thread && thread.waiting === id) {
      thread.waiting = null;
      thread.nextAt = Date.now() + 450 + Math.random() * 850;
    }
  }

  function hostSpeech(on) {
    Net.send({ type: 'cue', id: 'claudia', voice: true,
      text: on ? 'Claudia is speaking.' : 'Claudia has finished.', vars: { speaking: String(on) } });
  }

  function speak(id, cue, after, firm, onText) {
    if (!active || (id !== AI.CLAUDIA && botSpeechBlocked(Session.state))) return false;
    speaking = { id, since: Date.now(), audioAt: null, overlap: null,
      after: after || null, firm: !!firm, onText: onText || null };
    if (id !== AI.CLAUDIA) lastBotTurn = Date.now();
    freshen(id, false);
    AI.ask(id, cue);
    return true;
  }

  /* ---------------- tool calls ---------------- */

  function onTool(m) {
    if (!active) return;
    for (const c of m.calls || []) {
      let args = {};
      try { args = c.arguments ? JSON.parse(c.arguments) : {}; } catch (e) { args = {}; }
      const answer = m.id === AI.CLAUDIA ? claudiaTool(c.name, args) : botTool(m.id, c.name, args);
      AI.tool(m.id, c.callId, c.name, JSON.stringify(answer));
    }
  }

  function findByName(name, among) {
    const want = String(name || '').trim().toLowerCase();
    if (!want) return null;
    const list = among || Session.alive();
    return list.find(p => p.name.toLowerCase() === want)
      || list.find(p => p.name.toLowerCase().startsWith(want) || want.startsWith(p.name.toLowerCase()))
      || null;
  }

  function botTool(botId, name, a) {
    const s = Session.state;
    const me = Session.playerById(botId);
    if (!me || !me.alive) return { ok: false, reason: 'You are out of the game.' };
    const f = s.finale;
    if (name === 'vote_banish') {
      if (!f || f.stage !== 'name') return { ok: false, reason: 'There is no vote open.' };
      const options = ballotOptions(botId);
      const t = findByName(a.name, options);
      if (!t) return { ok: false, reason: 'Choose one of: ' + options.map(p => p.name).join(', ') };
      const overrule = !!a.overrule && !!(Session.privateView(botId) || {}).wiseOne && s.phase === 'table'
        && !(s.wise && s.wise.used);
      Net.send({ type: 'name', playerId: botId, targetId: t.id, overrule });
      return { ok: true, voted: t.name, overrule };
    }
    if (name === 'fire_decision') {
      if (!f || f.stage !== 'decide') return { ok: false, reason: 'There is no decision open.' };
      const choice = a.choice === 'end' ? 'end' : 'banish';
      Net.send({ type: 'decide', playerId: botId, choice });
      return { ok: true, choice };
    }
    if (name === 'turret_choice') {
      const v = Session.privateView(botId);
      if (!v || !v.night || v.role !== 'traitor' || v.night.locked) return { ok: false, reason: 'Only a Traitor in the turret can do that.' };
      const kind = a.kind === 'recruit' ? 'recruit' : a.kind === 'carrier' ? 'carrier' : 'none';
      let target = null;
      if (kind === 'carrier') {
        const traitors = [me].concat((v.partners || []).map(id => Session.playerById(id)).filter(Boolean));
        target = findByName(a.name, traitors) || me;
      } else if (kind === 'recruit') {
        const faithful = Session.alive().filter(p => p.id !== botId && (v.partners || []).indexOf(p.id) < 0);
        target = findByName(a.name, faithful);
        if (!target || !v.night.canRecruit) return { ok: false, reason: 'You cannot offer that seat.' };
      }
      Net.send({ type: 'turretPick', playerId: botId, kind, targetId: target ? target.id : null });
      return { ok: true, kind, who: target ? target.name : null };
    }
    if (name === 'recruit_answer') {
      const v = Session.privateView(botId);
      if (!v || !v.offer) return { ok: false, reason: 'Nobody has offered you anything.' };
      Net.send({ type: 'recruitAnswer', playerId: botId, accept: !!a.accept });
      return { ok: true };
    }
    if (name === 'get_away') {
      if (s.phase !== 'tasks' || typeof CastleBots === 'undefined' || !CastleBots.running) return { ok: false, reason: 'Only by day in the castle.' };
      const c = CastleBots.company(botId);
      const from = findByName(a.name) || (c ? Session.playerById(c.with) : null);
      if (!from || from.id === botId) return { ok: false, reason: 'Say who you are getting away from.' };
      uneasy.add(botId + ':' + from.id);
      promptDirty = true;
      CastleBots.flee(botId, from.id);
      return { ok: true };
    }
    if (name === 'done_talking') {
      if (s.floor && s.floor.all && !s.floor.done) Net.send({ type: 'yieldFloor', playerId: botId });
      return { ok: true };
    }
    return { ok: false, reason: 'Unknown tool.' };
  }

  function claudiaTool(name, a) {
    if (!judgeAsk) return { ok: true };
    if (name === 'end_discussion') judgeAsk.verdict = 'close';
    else if (name === 'invite_player') {
      const p = findByName(a.name);
      judgeAsk.verdict = p ? 'invite:' + p.id : 'keep';
    } else judgeAsk.verdict = 'keep';
    return { ok: true };
  }

  function ballotOptions(voterId) {
    const f = Session.state.finale;
    return Session.alive().filter(p => p.id !== voterId && (!f.tied || f.tied.indexOf(p.id) >= 0));
  }

  /* ---------------- the clock ---------------- */

  function humansQuietFor() {
    return (Date.now() - lastHuman) / 1000;
  }

  /* A person's voice on the meters right now — anybody's, or only
     those within earshot of `near`. In the turret at night only a
     Traitor counts, the same as the words. A meter also hears a fan or
     a television, so a stretch counts only while it is new — the words
     take a second to arrive — or while it is still bringing words. */
  const VOICE_UNHEARD_MS = 2500;
  const wordsAt = new Map();         // person -> Date.now() of their last recognised words
  function voiceNow(near) {
    const s = Session.state;
    if (!s || typeof VoiceChat === 'undefined' || !VoiceChat.voicedFor) return false;
    const now = Date.now();
    for (const p of s.players) {
      if (p.bot || !p.alive || !VoiceChat.voiced(p.id)) continue;
      if (VoiceChat.voicedFor(p.id) > VOICE_UNHEARD_MS && now - (wordsAt.get(p.id) || 0) > VOICE_UNHEARD_MS) continue;
      if (s.phase === 'night' && (Session.privateView(p.id) || {}).role !== 'traitor') continue;
      if (near && !inEarshot(p.id, near)) continue;
      return true;
    }
    return false;
  }

  function tick() {
    if (!active || !Session.state) return;
    const s = Session.state;
    refreshPrompts(false);
    if (speaking && Date.now() - speaking.since > TURN_TIMEOUT * 1000) finishTurn(speaking.id);
    if (s.phase === 'hill') wiseTick(s);
    if (voiceNow()) lastHuman = Date.now();
    const quiet = humansQuietFor();
    // nobody talks over Claudia: an AI mid-sentence gives way to her
    if (botSpeechBlocked(s)) {
      pauseBots();
      return;
    }

    // the floor: a turn that belongs to an AI is spoken, then handed back
    const f = s.floor;
    if (f && !f.done && f.playerId && isBot(f.playerId)) {
      const key = 'floor:' + f.playerId + ':' + f.endsAt;
      if (!asked.has(key) && !speaking) {
        asked.add(key);
        const lastWords = s.finale && s.finale.stage === 'reveal' && s.finale.pending === f.playerId;
        speak(f.playerId, lastWords
          ? 'You have just been banished by the table. Say your last words to them in two sentences. Never say or hint whether you were a Traitor or a Faithful — no "I am a…", no "I was a…" — because the castle reveals it right after you finish.'
          : 'It is your turn to speak by the fire, and nobody may interrupt. Make your case in two sentences: who you suspect and why, or why you should be trusted.'
            + strategyCue({ id: f.playerId }, s),
        () => setTimeout(() => {
          const st = Session.state;
          if (st && st.floor && st.floor.playerId === f.playerId) Net.send({ type: 'yieldFloor', playerId: f.playerId });
        }, 600), true);
      }
      return;
    }

    // the open table: one AI at a time, in the gaps people leave
    if (f && !f.done && f.all) {
      // answers whoever spoke, chains on, and otherwise joins the argument itself
      chatTick(s, quiet);
      // an AI that has spoken its piece says so
      for (const b of bots) {
        const st = state.get(b.id), me = Session.playerById(b.id);
        if (!me || !me.alive || (f.ready || []).indexOf(b.id) >= 0) continue;
        if (st.said >= 3 && Date.now() - st.last > 12000) Net.send({ type: 'yieldFloor', playerId: b.id });
      }
      return;
    }

    // a person holding the floor is not to be talked over
    const floored = f && !f.done;
    if (s.phase === 'night') { nightTick(s); if (!floored) chatTick(s, quiet); return; }
    if ((s.phase === 'table' || s.phase === 'finale') && s.finale) {
      ballotTick(s);
      if (!floored) chatTick(s, quiet);
      return;
    }
    // everywhere else — the hill, the castle by day, breakfast — the
    // AIs talk back when they are talked to
    if (s.phase === 'tasks') { intents(s, quiet); if (sayQueued(quiet)) return; }
    chatTick(s, quiet);
  }

  /* ---------------- ordinary conversation ----------------
     Talk to the room and the room talks back — the way a room does. One
     of them answers first, after the beat it takes a person to realise
     they are the one answering. Then, as often as not, somebody else
     picks it up; and with a full house, sometimes a third. Never two at
     once, never all of them. A person speaking ends the follow-up chain;
     a voice already underway gets its opening before giving way.

     Whoever was named answers. A remark aimed at another person by name
     is left to them. By day only the AIs in earshot can hear it at all. */
  let thread = null;     // { origin, said: [{ id, name, text }], left, waiting, nextAt, used: Set }
  let lastBanter = 0;

  /* Claudia has the room while she is speaking, in the breath after she
     has, and anywhere between two sentences of a ceremony she is still in
     the middle of (the cameras and cards between lines are silent). */
  const AFTER_CLAUDIA_MS = 3500;     // a few seconds of room after she stops
  let claudiaLastBusy = 0;
  function claudiaBusy() {
    const now = Date.now();
    const talking = (claudiaLive && AI.speaking(AI.CLAUDIA))
      || (typeof Voice !== 'undefined' && !!Voice.speaking)
      || (typeof Scenes !== 'undefined' && (!!Scenes.performing || !!Scenes.botSpeechBlocked));
    if (talking) claudiaLastBusy = now;
    return talking || now - claudiaLastBusy < AFTER_CLAUDIA_MS
      || (typeof Voice !== 'undefined' && Voice.sinceSpoke < AFTER_CLAUDIA_MS);
  }

  function botSpeechBlocked(s) {
    return !s || s.phase === 'hill' || s.phase === 'verdict' || claudiaBusy();
  }

  function pauseBots() {
    if (!active) return;
    if (speaking && speaking.id !== AI.CLAUDIA) {
      const f = Session.state && Session.state.floor;
      if (speaking.firm && f) asked.delete('floor:' + f.playerId + ':' + f.endsAt);
      speaking.after = null;
      AI.hush(speaking.id, true);
      finishTurn(speaking.id);
    }
    for (const b of bots) if (AI.speaking(b.id)) AI.hush(b.id, true);
    thread = null;
  }

  /* The round table and the fire open with her: until the floor has been
     opened to the room nobody there starts a conversation. */
  let tableOpened = false;
  function tableNotOpen(s) {
    if (s.phase !== 'table' && s.phase !== 'finale') return false;
    if (s.floor && !s.floor.done) tableOpened = true;
    return !tableOpened;
  }

  function chatTick(s, quiet) {
    if (speaking) return;
    // Claudia has the room; nobody talks over her
    if (botSpeechBlocked(s) || tableNotOpen(s)) return;
    if (s.floor && !s.floor.done && s.floor.playerId) return;
    if (thread && !thread.waiting) return followUp(s, quiet);
    const h = heardLast;
    if (!h) return s.floor && s.floor.all ? openTurn(s, quiet) : banter(s, quiet);
    if (Date.now() - h.at > 20000) { heardLast = null; return; }
    // Usually wait for a gap; occasionally take a short, assertive turn.
    const among = humansTalkingTogether() && !h.named.length;
    const waiting = quiet < (among ? LULL_AMONG_PEOPLE : QUIET_BEFORE_BOT);
    const cutIn = waiting && canCutIn(quiet);
    if (waiting && !cutIn) return;
    heardLast = null;
    const b = replier(h, s);
    if (!b) return;
    // Direct questions always get an answer; unsolicited comments take alternate opportunities.
    if (!cutIn && !h.named.length && commentOpportunity++ % 2 === 1) {
      leaveRoomUntil = Date.now() + ROOM_TURN_GAP;
      return;
    }
    const st = state.get(b.id);
    st.with = h.id;
    st.addressed = 0;
    const pool = listeners(h.id, s).filter(x => x.id !== b.id);
    const n = pool.length;
    // Occasionally one other voice joins; then the humans get the room back.
    let left = 0;
    const intent = h.intent && h.intent.bot === b.id ? h.intent.cue : null;
    if (!cutIn && !intent && n >= 1 && Math.random() < 0.35) left++;
    thread = { origin: h, said: [], left, waiting: b.id, nextAt: 0, used: new Set([b.id]) };
    if (intent) { speak(b.id, intent); return; }
    if (speak(b.id, chatCue(b, h, s) + (cutIn
      ? ' Briefly cut in with one relevant point, naturally and confidently. One short sentence; do not ask permission to speak.' : ''))) speaking.origin = h;
  }

  function canCutIn(quiet) {
    const now = Date.now();
    if (quiet >= QUIET_BEFORE_BOT || now < nextCutInAt || now < leaveRoomUntil
        || now - lastBotTurn < CUT_IN_GAP_MS) return false;
    nextCutInAt = now + CUT_IN_CHECK_MS;
    return Math.random() < CUT_IN_CHANCE;
  }

  /* The AIs who could have heard this person: everybody, or by day
     whoever is near enough. */
  function listeners(humanId, s) {
    return bots.filter(b => {
      const p = Session.playerById(b.id);
      if (!p || !p.alive || !inEarshot(humanId, b.id)) return false;
      // in the turret at night, only the other Traitor is there
      if (s.phase === 'night') { const v = Session.privateView(b.id); return !!v && v.role === 'traitor'; }
      return true;
    });
  }

  function replier(h, s) {
    const now = Date.now();
    const mine = bots.filter(b => Session.playerById(b.id));
    const meant = h.intent && mine.find(b => b.id === h.intent.bot);
    if (meant) return meant;
    const named = mine.filter(b => h.named.indexOf(b.id) >= 0);
    if (named.length) return named[0];
    if (s.phase === 'night' && !listeners(h.id, s).length) return null;
    const living = listeners(h.id, s);
    if (!living.length) return null;
    const others = s.players.filter(p => !p.bot && p.alive && p.id !== h.id && inEarshot(h.id, p.id));
    // talking to a person, by name: theirs to answer
    if (others.some(p => mentions(h.text, p.name)) && s.phase !== 'table' && s.phase !== 'finale') return null;
    // whoever this person was just talking with keeps the thread
    const partner = living.find(b => { const st = state.get(b.id); return st.with === h.id && now - st.last < 45000; });
    if (partner && Math.random() < 0.7) return partner;
    const pool = living.slice().sort((a, b) => state.get(a.id).last - state.get(b.id).last);
    return Math.random() < 0.6 ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
  }

  function chatCue(b, h, s) {
    const me = Session.playerById(b.id);
    const where = s.phase === 'tasks' ? castleWhere(b, h)
      : s.phase === 'night' ? 'It is night and you are in the turret with your fellow Traitor, where nobody else can hear.'
      : 'Right now: ' + phaseWords(s) + '.';
    const toYou = h.named.indexOf(b.id) >= 0;
    return where + ' ' + h.name + ' just said' + (toYou ? ' to you' : '') + ': "' + h.text + '". '
      + (me && !me.alive ? 'You are out of the game, but answer them kindly. ' : '')
      + 'Answer ' + h.name + ' out loud, naturally, as yourself — react like a person would, in one short sentence'
      + (s.phase === 'table' || s.phase === 'finale' ? ', two at most — and use what you remember of the game so far: the votes, who was banished, what you saw. Address their point directly, press for a specific answer, or build on their theory.' : '. Be playful when it fits, and sometimes ask a genuine follow-up question.')
      + strategyCue(b, s);
  }

  /* An occasional second voice hears the answer and adds something new. */
  function followUp(s, quiet) {
    const t = thread;
    if (!t.left || !t.said.length) { thread = null; return; }
    if (Date.now() < t.nextAt) return;
    if (quiet < QUIET_BEFORE_BOT) { thread = null; return; } // a person is talking: let them
    const pool = listeners(t.origin.id, s).filter(b => !t.used.has(b.id));
    if (!pool.length) { thread = null; return; }
    pool.sort((a, b) => state.get(a.id).last - state.get(b.id).last);
    const b = Math.random() < 0.6 ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
    t.left--;
    t.used.add(b.id);
    t.waiting = b.id;
    const so = t.said.map(x => x.name + ' answered: "' + x.text + '"').join(' Then ');
    speak(b.id, (s.phase === 'tasks' ? 'You are nearby, doing your jobs, and overheard this. ' : '')
      + t.origin.name + ' said: "' + t.origin.text + '". ' + so + '. '
      + 'Chip in yourself — agree, tease, disagree, or ask something — in one short, casual sentence. '
      + 'Do not repeat what they said, and do not start with their name every time. Give the human something to respond to.'
      + strategyCue(b, s));
  }

  /* An occasional detour between jobs. Movement brings the contestant
     over first; the conversation starts only once they really arrive. */
  function banter(s, quiet) {
    if (s.phase !== 'tasks' || quiet < 3 || Date.now() - lastBanter < VISIT_GAP
        || Date.now() - lastBotTurn < ROOM_TURN_GAP || Date.now() < leaveRoomUntil
        || typeof CastleBots === 'undefined' || !CastleBots.running) return;
    lastBanter = Date.now();
    if (commentOpportunity++ % 2 === 1) return;
    const humans = Session.alive().filter(p => !p.bot && Date.now() - (visitedAt.get(p.id) || 0) >= VISIT_PERSON_GAP);
    const pairs = [];
    for (const b of bots) {
      if (!CastleBots.canApproach(b.id)) continue;
      const pose = CastleNet.get(b.id);
      if (!pose) continue;
      for (const h of humans) {
        const to = CastleNet.get(h.id);
        if (to && Math.hypot(to.x - pose.x, to.z - pose.z) < 24) pairs.push([b, h]);
      }
    }
    if (!pairs.length) return;
    const [b, h] = pairs[Math.floor(Math.random() * pairs.length)];
    if (CastleBots.approach(b.id, h.id)) visitedAt.set(h.id, Date.now());
  }

  function startEncounter(botId, humanId, onSpoken) {
    if (!active || !Session.state || Session.state.phase !== 'tasks' || speaking
        || botSpeechBlocked(Session.state) || humansQuietFor() < QUIET_BEFORE_BOT
        || Date.now() - lastBotTurn < ROOM_TURN_GAP) return false;
    const b = bots.find(b => b.id === botId), h = Session.playerById(humanId);
    const pose = CastleNet.get(botId), to = CastleNet.get(humanId);
    if (!b || !h || h.bot || !h.alive || !(Session.playerById(botId) || {}).alive
        || !pose || !to || !inEarshot(botId, humanId) || Math.hypot(pose.x - to.x, pose.z - to.z) > 2.2) return false;
    const where = typeof Chores !== 'undefined' ? Chores.roomName(pose && pose.room) : 'the castle';
    const v = Session.privateView(botId) || {};
    state.get(botId).with = humanId;
    thread = { origin: { id: h.id, name: h.name, text: '(nothing — you started this)', named: [] },
               said: [], left: 0, waiting: b.id, nextAt: 0, used: new Set([b.id]) };
    /* Sometimes it is more than a chat: a Faithful with a suspicion to
       share, or a Traitor with one to plant, asks for a word in private. */
    if (typeof CastleBots !== 'undefined' && CastleBots.lead && Math.random() < ASK_FOR_A_WORD && !distrusts(botId, humanId)) {
      asks.set(humanId, { bot: botId, at: Date.now() });
      return speak(b.id, 'You have taken a break between jobs and walked over to ' + h.name + ' in ' + where + '. '
        + 'Ask them, in one short casual sentence, whether you can have a quick word in private — somewhere with a door you can shut — because there is something you want to tell them. '
        + 'Do not say what it is yet, and stop there so they can answer.'
        + (v.role === 'traitor' ? ' Secret Traitor goal: once you are alone you will plant a seed of doubt about a Faithful. Sound like a worried Faithful.' : ''), null, false, onSpoken);
    }
    return speak(b.id, 'You have taken a short break between jobs and walked over to ' + h.name + ' in ' + where + '. '
      + 'Start a friendly, interesting conversation with them. Share one specific thing you actually saw and ask what they make of it. '
      + 'Your real observations:\n' + notesFor(v) + '\n'
      + 'If you have no useful observation, ask about their job or follow up something they said earlier; never invent a sighting. '
      + 'One or two short, casual sentences. Be warm or lightly playful, and invite an answer.'
      + (v.role === 'traitor' ? ' Secret Traitor goal: use a real detail to plant a subtle seed of doubt about another Faithful, as a question rather than proof.' : '')
      + (v.poison && v.poison.mine && !v.poison.used && (v.partners || []).indexOf(humanId) < 0
        ? ' Secret carrier goal: keep them chatting while you get close enough to slip the poison. Sound friendly and ordinary; never mention the poison, the plan, or your role.' : ''), null, false, onSpoken);
  }

  const isBot = (id) => bots.some(b => b.id === id);

  /* ---------------- company by day ----------------
     "Follow me", "come with me", "this way": the AI being spoken to — by
     name, or the nearest one that heard — decides for itself whether to
     go. A Faithful will not go off alone with somebody it suspects; a
     Traitor carrying the poison never says no to a quiet room. "You can
     go" lets it get back to its jobs. And when an AI has asked for a
     private word, a yes from that person is what it was waiting for. */
  const LET_GO = /\b(?:stop following|quit following|you can go|go away|leave me alone|off you go|you can leave|back to your (?:jobs?|tasks?|work)|that'?s all|see you later|catch you later|bye|on your way)\b/i;
  const FOLLOW_ME = /\b(?:follow me|come with me|come along|walk with me|come here|come over here|this way|tag along|join me)\b/i;
  const YES = /\b(?:yes|yeah|yep|yup|sure|ok|okay|alright|all right|of course|go on|why not|lead the way|lead on|aye|absolutely|definitely|certainly|go ahead|fine)\b/i;
  const NO = /\b(?:no|nope|nah|not now|busy|later|rather not|not really)\b/i;

  // Faithful, and somebody it would not be alone with
  function distrusts(botId, otherId) {
    if (!active || !Session.state || !isBot(botId)) return false;
    const v = Session.privateView(botId);
    if (!v || v.role === 'traitor') return false;
    if (uneasy.has(botId + ':' + otherId)) return true;
    const list = suspicion(botId, false);
    const x = list.find(x => x.id === otherId);
    return !!x && (x.score >= DISTRUST || (x.score >= DISTRUST_TOP && list[0] === x));
  }

  const roomWords = (room) => typeof Chores !== 'undefined' ? Chores.roomName(room) : 'a room';
  function shutInWith(b, h) {
    const a = CastleNet.get(b.id), o = CastleNet.get(h.id);
    return !!(a && o && a.room && a.room === o.room && typeof CastleLayout !== 'undefined'
      && CastleLayout.sealed(a.room, Session.state.doors));
  }
  function castleWhere(b, h) {
    if (shutInWith(b, h)) {
      const v = Session.privateView(b.id) || {};
      return 'You are behind a shut door in ' + roomWords(CastleNet.get(b.id).room) + ' with ' + h.name + ': nobody outside can hear.'
        + (v.role !== 'traitor' ? ' If you come to think they are a Traitor, call get_away.' : '');
    }
    const c = typeof CastleBots !== 'undefined' && CastleBots.company ? CastleBots.company(b.id) : null;
    if (c && c.kind === 'follow' && c.with === h.id) return 'You are walking round the castle with ' + h.name + ', who asked you to come along.';
    return 'You are walking round the castle doing your jobs.';
  }

  function nearest(list, id, within) {
    const at = CastleNet.get(id);
    if (!at) return null;
    let best = null, bd = within;
    for (const b of list) {
      const q = CastleNet.get(b.id);
      const d = q ? Math.hypot(q.x - at.x, q.z - at.z) : Infinity;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // the reply to this, whatever else it might have said
  function answer(h, b, cue) {
    h.intent = { bot: b.id, cue };
    h.named = [b.id].concat(h.named.filter(id => id !== b.id));
    const st = state.get(b.id);
    if (st) st.with = h.id;
  }

  function intents(s, quiet) {
    const h = heardLast;
    if (!h || h.acted === h.text || quiet < QUIET_BEFORE_BOT
        || typeof CastleBots === 'undefined' || !CastleBots.running || !CastleBots.company) return;
    h.acted = h.text;
    const near = listeners(h.id, s);
    if (!near.length) return;
    const named = near.find(b => h.named.indexOf(b.id) >= 0) || null;
    const said = '"' + h.text + '"';
    const ask = asks.get(h.id);
    const asker = ask && Date.now() - ask.at < ASK_ANSWER_MS ? near.find(b => b.id === ask.bot) || null : null;

    if (LET_GO.test(h.text)) {
      const b = named || near.find(b => { const c = CastleBots.company(b.id); return c && c.with === h.id && c.kind !== 'flee'; });
      if (b && CastleBots.unfollow(b.id)) {
        answer(h, b, h.name + ' just said ' + said + ' — they are letting you go. Say a quick, friendly goodbye in a few words and get back to your jobs.');
      }
      return;
    }

    if (FOLLOW_ME.test(h.text)) {
      // "come with me, Bo" is for Bo: only a name, or nobody's, brings an AI
      const toPerson = !named && s.players.some(p => !p.bot && p.id !== h.id && mentions(h.text, p.name));
      const b = named || asker || (toPerson ? null : nearest(near, h.id, 8));
      if (!b) return;
      const d = willFollow(b, h, asker === b);
      const v = Session.privateView(b.id) || {};
      if (d.agree && CastleBots.follow(b.id, h.id)) {
        if (asker === b) asks.delete(h.id);
        const carrier = v.poison && v.poison.mine && !v.poison.used && (v.partners || []).indexOf(h.id) < 0;
        answer(h, b, h.name + ' just said ' + said + ' — they want you to come with them, and you have decided to go. '
          + 'Say yes in a few casual words, like "Lead the way", and walk with them.'
          + (carrier ? ' Secret: a quiet room alone with them is your chance to slip them the poison. Sound friendly and ordinary; never mention it.'
             : v.role === 'traitor' && (v.partners || []).indexOf(h.id) < 0 ? ' Secret Traitor goal: if you get them alone, plant a subtle seed of doubt about a Faithful.' : ''));
      } else if (d.why === 'distrust') {
        answer(h, b, h.name + ' just said ' + said + ' — they want you to go off somewhere with them. You do not trust them: you suspect they could be the Traitor carrying the poison, and you will not be alone with them. '
          + 'Say no politely with a believable excuse, like a job you have to finish, in one short sentence. Do not accuse them to their face.');
      } else {
        answer(h, b, h.name + ' just said ' + said + ' — they want you to come with them, but you would rather get on with your jobs right now. Say no kindly in one short sentence; maybe later.');
      }
      return;
    }

    // the answer to "can I have a word?"
    if (asker && (!named || named === asker)) {
      const t = h.text.toLowerCase().replace(/\bno (?:problem|worries)\b|\bnot a problem\b/g, 'sure');
      const y = t.search(YES), n = t.search(NO);
      if (y < 0 && n < 0) return;
      asks.delete(h.id);
      if (n >= 0 && (y < 0 || n < y)) {
        answer(h, asker, h.name + ' does not want a private word right now. Say "no worries" or similar, in a few words, and leave it.');
        return;
      }
      const room = CastleBots.lead(asker.id, h.id);
      answer(h, asker, room
        ? h.name + ' said yes to a private word. Tell them to follow you, in a few casual words — you are taking them to ' + roomWords(room) + ', where you can shut the door. Do not say what it is about yet.'
        : privateCue(asker, h, false));
    }
  }

  function willFollow(b, h, theyAsked) {
    const key = b.id + ':' + h.id, prev = decided.get(key);
    if (prev && Date.now() - prev.at < 30000) return prev;
    const v = Session.privateView(b.id) || {};
    const c = CastleBots.company(b.id);
    let out;
    if ((c && c.kind === 'flee' && c.with === h.id) || distrusts(b.id, h.id)) out = { agree: false, why: 'distrust' };
    else if (theyAsked) out = { agree: true, why: 'asked' };
    else if (v.role === 'traitor') {
      const partner = (v.partners || []).indexOf(h.id) >= 0;
      const carrier = !!(v.poison && v.poison.mine && !v.poison.used);
      out = { agree: partner || carrier || Math.random() < 0.8, why: 'busy' };
    } else out = { agree: Math.random() < 0.85, why: 'busy' };
    out.at = Date.now();
    decided.set(key, out);
    return out;
  }

  /* Alone behind a shut door: a Faithful says who it suspects and asks
     who they do; a Traitor plants a seed about a Faithful who has been
     getting too close. */
  function privateCue(b, h, shut) {
    const v = Session.privateView(b.id) || {};
    const pose = CastleNet.get(b.id);
    const head = shut
      ? 'You and ' + h.name + ' are alone in ' + roomWords(pose && pose.room) + ' with the door shut: nobody else can hear you. '
      : h.name + ' said yes to a private word, and there is nobody close enough to hear. ';
    if (v.role === 'traitor') {
      const mark = suspicion(b.id, true).find(x => x.id !== h.id && (v.partners || []).indexOf(x.id) < 0);
      return head + 'Secret Traitor goal: plant a believable seed of doubt'
        + (mark ? ' about ' + mark.name : ' about a Faithful')
        + ' — use a real detail from the game, put it as a worry or a question rather than proof, and ask ' + h.name + ' to keep it between the two of you. '
        + 'Two short sentences, as a worried Faithful. Never reveal your role.';
    }
    const top = suspicion(b.id, false).find(x => x.id !== h.id);
    return head + (top && top.score > 0
      ? 'Tell them quietly that you have your doubts about ' + top.name + ' and why, from the votes or what you actually saw, then ask who they suspect.'
      : 'Tell them quietly you do not know who to trust yet, and ask them straight out who they suspect and why.')
      + ' Two short sentences. What you actually saw:\n' + notesFor(v)
      + '\nNever invent a sighting. If anything they say makes you think THEY are a Traitor, call get_away and make an excuse to leave.';
  }

  // the castle telling us what an AI's feet just did
  function moved(kind, botId, otherId) {
    if (!active) return;
    const b = bots.find(x => x.id === botId), o = Session.playerById(otherId);
    if (!b || !o) return;
    if (kind === 'fled') {
      uneasy.add(botId + ':' + otherId);
      promptDirty = true;
      queue(b.id, 'You have suddenly decided you do not trust ' + o.name + ' — you think they could be the Traitor with the poison — and you are getting away from them before they can slip it to you. '
        + 'Make a quick excuse in a few words as you hurry off. Do not accuse them yet.');
    } else if (kind === 'private' && !o.bot) {
      queue(b.id, privateCue(b, o, true));
    } else if (kind === 'stood-up') {
      if (asks.get(otherId) && asks.get(otherId).bot === botId) asks.delete(otherId);
    }
  }

  function queue(id, cue) { queued.set(id, { cue, until: Date.now() + 8000 }); }

  /* A line the castle has given an AI goes first, in the next gap. */
  function sayQueued(quiet) {
    if (speaking || !queued.size) return false;
    for (const [id, q] of queued) {
      if (Date.now() > q.until || !(Session.playerById(id) || {}).alive) { queued.delete(id); continue; }
      if (quiet < QUIET_BEFORE_BOT) return false;
      queued.delete(id);
      thread = null;
      return speak(id, q.cue);
    }
    return false;
  }

  function nextSpeaker(s) {
    const now = Date.now();
    const living = bots.filter(b => (Session.playerById(b.id) || {}).alive);
    if (!living.length) return null;
    // whoever was just named goes first
    const named = living.find(b => { const st = state.get(b.id); return st.addressed && now - st.addressed < 8000; });
    if (named) { state.get(named.id).addressed = 0; return named; }
    const ready = living.filter(b => now - state.get(b.id).last > BOT_COOLDOWN * 1000
                                      && (s.floor.ready || []).indexOf(b.id) < 0);
    if (!ready.length) return null;
    // the one who has said least, with a little chance so it does not feel like a rota
    ready.sort((a, b) => state.get(a.id).said - state.get(b.id).said);
    return Math.random() < 0.75 ? ready[0] : ready[Math.floor(Math.random() * ready.length)];
  }

  /* Nobody has said anything the AIs owe an answer to: at the open table
     one of them carries the argument on, in the gap the people leave. */
  function openTurn(s, quiet) {
    if (Date.now() - lastBotTurn < ROOM_TURN_GAP || Date.now() < leaveRoomUntil) return;
    if (quiet < (humansTalkingTogether() ? LULL_AMONG_PEOPLE : QUIET_BEFORE_BOT)) return;
    const b = nextSpeaker(s);
    if (b) speak(b.id, cueFor(b, s));
  }

  function cueFor(b, s) {
    const last = lines.slice(-1)[0];
    const st = state.get(b.id);
    const cue = st.said === 0 ? 'The discussion is open. Share one specific suspicion or ask a human what they make of a real clue. Two sentences at most.'
      : last && last.who !== b.id ? 'React to what ' + last.name + ' just said. Add a new angle or ask a specific follow-up question; do not simply agree. Two sentences at most.'
      : 'Add one new point to the discussion, or ask a human a pointed question by name. Two sentences at most.';
    return cue + strategyCue(b, s);
  }

  function strategyCue(b, s) {
    if (s.phase !== 'table' && s.phase !== 'finale') return '';
    const v = Session.privateView(b.id);
    return v && v.role === 'traitor'
      ? ' Secret Traitor goal: dig into this exchange and plant one believable seed of doubt about a Faithful. Use a real remark, vote or observation, ask a leading question, and let the humans draw the conclusion. Stay in character as a Faithful; never expose private knowledge.'
      : ' Test the theory against what was actually said or seen. Invite a human to explain a detail, and be willing to back them when their answer makes sense.';
  }

  /* ---------------- ballots ---------------- */

  function ballotTick(s) {
    const f = s.finale;
    if (s.floor && !s.floor.done) return;
    const key = s.phase + ':' + s.day + ':' + f.round + ':' + f.nameRound + ':' + f.stage;
    for (const b of bots) {
      const me = Session.playerById(b.id);
      if (!me || !me.alive) continue;
      if (f.stage === 'name' && !f.names[b.id]) {
        const options = ballotOptions(b.id);
        if (!options.length) continue;
        const wise = s.phase === 'table' && !!(Session.privateView(b.id) || {}).wiseOne && !(s.wise && s.wise.used);
        askOnce(b.id, key, 'Time to vote. Call vote_banish with exactly one of these names: '
          + options.map(p => p.name).join(', ') + '. Do not say it out loud yet.'
          + (wise ? ' You are the Wise One: add overrule true only if you are sure enough to spend your one overrule now.' : ''),
          () => {
            const t = fallbackVote(b.id, options);
            Net.send({ type: 'name', playerId: b.id, targetId: t.id, overrule: wise && sureOf(b.id, t.id) });
          });
      }
      if (f.stage === 'decide' && !f.votes[b.id]) {
        askOnce(b.id, key, 'The Fire of Truth: do you believe every Traitor is gone? Call fire_decision with end or banish.',
          () => Net.send({ type: 'decide', playerId: b.id, choice: fallbackDecide(b.id) }));
      }
    }
  }

  /* One cue per decision, with the seed's answer standing by in case the
     voice never calls the tool. */
  function askOnce(botId, key, cue, fallback) {
    const st = state.get(botId);
    const k = key + ':' + botId;
    if (st.pending.has(k)) return;
    st.pending.set(k, Date.now());
    const phase = Session.state.phase, day = Session.state.day;
    const current = () => {
      if (!active || state.get(botId) !== st || !Session.state
          || Session.state.phase !== phase || Session.state.day !== day) return false;
      if (key === 'offer:' + day) return !!(Session.privateView(botId) || {}).offer;
      if (key.startsWith('night:')) {
        const n = (Session.privateView(botId) || {}).night;
        return !!n && !n.locked && (n.choose || n.canRecruit);
      }
      const f = Session.state.finale;
      return !!f && key === phase + ':' + day + ':' + f.round + ':' + f.nameRound + ':' + f.stage
        && (f.stage === 'name' ? !f.names[botId] : f.stage === 'decide' && !f.votes[botId]);
    };
    const go = () => {
      if (!current()) return;
      if (speaking || botSpeechBlocked(Session.state)) { setTimeout(go, 500); return; }
      speak(botId, cue);
    };
    go();
    setTimeout(() => {
      if (!current()) return;
      try { fallback(); } catch (e) { /* the moment passed */ }
    }, VOTE_DEADLINE * 1000);
  }

  /* The seed's answer: whoever the transcript has most suspicion on, else
     whoever the room is already naming, else anybody. A Traitor never
     names its partner if it can help it. */
  function fallbackVote(botId, options) {
    const v = Session.privateView(botId) || { partners: [] };
    const pool = options.filter(p => v.partners.indexOf(p.id) < 0);
    const list = pool.length ? pool : options;
    const counts = new Map();
    for (const l of lines.slice(-30)) {
      for (const p of list) if (l.who !== p.id && l.text.toLowerCase().indexOf(p.name.toLowerCase()) >= 0) {
        counts.set(p.id, (counts.get(p.id) || 0) + 1);
      }
    }
    const f = Session.state.finale;
    for (const t of Object.values(f.names || {})) if (list.some(p => p.id === t)) counts.set(t, (counts.get(t) || 0) + 2);
    // the record counts for more than the chatter
    for (const x of suspicion(botId, v.role === 'traitor')) {
      if (list.some(p => p.id === x.id) && x.score > 0) counts.set(x.id, (counts.get(x.id) || 0) + x.score);
    }
    list.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
    return (counts.get(list[0].id) ? list[0] : list[Math.floor(Math.random() * list.length)]);
  }

  /* Whether the seed's answer is sure enough to spend the overrule on:
     the evidence well ahead of anybody else's, or the last table before
     the fire, when it is now or never. */
  function sureOf(botId, targetId) {
    const list = suspicion(botId, false);
    const top = list[0], next = list[1];
    if (!top || top.id !== targetId) return false;
    return Session.finaleNext() || (top.score >= 6 && (!next || top.score - next.score >= 3));
  }

  function fallbackDecide(botId) {
    const v = Session.privateView(botId) || {};
    if (v.role === 'traitor') return 'end';
    const s = Session.state;
    const caught = s.banished.filter(b => b.role === 'traitor').length;
    return caught >= mostDealt(s) ? 'end' : (Math.random() < 0.45 ? 'end' : 'banish');
  }

  /* ---------------- the Wise One ----------------
     Ten seconds at the hill, when nobody may speak, so an AI Traitor
     chooses without a voice: a beat in, and the Faithful it would most
     like to steer — anybody, on the first day. A partner's pick stands. */
  function wiseTick(s) {
    const w = s.wise;
    if (!w || w.done) return;
    for (const b of bots) {
      const v = Session.privateView(b.id);
      if (!v || v.role !== 'traitor' || !v.wise || v.wise.pick) continue;
      const key = 'wise:' + b.id;
      if (asked.has(key)) return;
      asked.add(key);
      const pool = Session.alive().filter(p => p.id !== b.id && (v.partners || []).indexOf(p.id) < 0);
      if (!pool.length) return;
      const t = pool[Math.floor(Math.random() * pool.length)];
      setTimeout(() => {
        const st = Session.state;
        if (!active || !st || !st.wise || st.wise.done) return;
        const now = Session.privateView(b.id);
        if (now && now.wise && !now.wise.pick) Net.send({ type: 'wisePick', playerId: b.id, targetId: t.id });
      }, 2000 + Math.random() * 3500);
      return;
    }
  }

  /* ---------------- the night ---------------- */

  function nightTick(s) {
    for (const b of bots) {
      const v = Session.privateView(b.id);
      if (!v) continue;
      if (v.offer) {
        askOnce(b.id, 'offer:' + s.day, 'A knock at your door: the Traitors offer you a seat at their table. You may join them or refuse — refusing costs you nothing. Call recruit_answer.',
          () => Net.send({ type: 'recruitAnswer', playerId: b.id, accept: Math.random() < 0.4 }));
      }
      if (!v.night || v.night.locked || v.role !== 'traitor') continue;
      if (!v.night.choose && !v.night.canRecruit) continue;
      const me = Session.playerById(b.id);
      const partners = (v.partners || []).map(nameOf);
      const lead = Object.keys(v.night.picks).filter(k => k !== b.id).map(k => v.night.picks[k])[0];
      const mine = v.night.picks[b.id];
      if (mine && (!lead || (lead.kind === mine.kind && lead.targetId === mine.targetId))) continue;
      const faithful = Session.alive().filter(p => p.id !== b.id && (v.partners || []).indexOf(p.id) < 0);
      const cue = 'You are in the turret with ' + (partners.length ? partners.join(' and ') : 'nobody — you are alone') + '. '
        + (v.night.choose ? 'Decide who carries tomorrow’s poison: you (' + me.name + ') or ' + partners.join(' or ') + ' — call turret_choice with kind carrier and the name. ' : '')
        + (v.night.canRecruit ? 'You may instead offer one Faithful a seat (kind recruit, one of: ' + faithful.map(p => p.name).join(', ') + '), or nothing (kind none). ' : '')
        + (lead ? 'Your partner has chosen ' + lead.kind + (lead.targetId ? ' ' + nameOf(lead.targetId) : '') + ' — agree unless you have a strong reason. ' : '')
        + 'Say your reasoning in one sentence, then call turret_choice.';
      const key = 'night:' + s.day + ':' + (lead ? lead.kind + lead.targetId : 'own');
      askOnce(b.id, key, cue, () => {
        const w = Session.privateView(b.id);
        if (!w || !w.night || w.night.locked) return;
        const l = Object.keys(w.night.picks).filter(k => k !== b.id).map(k => w.night.picks[k])[0];
        if (l) Net.send({ type: 'turretPick', playerId: b.id, kind: l.kind, targetId: l.targetId });
        else if (w.night.choose) Net.send({ type: 'turretPick', playerId: b.id, kind: 'carrier', targetId: b.id });
        else Net.send({ type: 'turretPick', playerId: b.id, kind: 'none' });
      });
    }
  }

  /* ---------------- Claudia ---------------- */

  let claudiaScripted = false;
  /* A public line of the show's, as the room heard it. Every browser
     asks the server for its own reading of her scripted lines (see
     `Voice`), so nothing is spoken from here any more; the host only
     writes the line into the transcript the AIs read, so they know what
     Claudia just told the room. */
  function claudiaLine(set, vars, seed) {
    if (!active || !Session.isHost) return;
    const base = ClaudiaLines.baseOf(set);
    if (!ClaudiaLines.isPublic(base)) return;
    const v = Object.assign({}, vars || {});
    if (v.name === 'You' || v.name === 'you') delete v.name;
    const text = ClaudiaLines.line(base, v, seed);
    if (text) note(AI.CLAUDIA, 'Claudia', text, 'room');
  }

  /* The moderator's judge, when Claudia is a live voice. The rules still
     find the candidate moment — everybody has spoken, the room has gone
     quiet — and then she is asked whether this is it. If she does not
     answer in time, the rules decide. */
  function claudiaJudge(kind) {
    if (!active || !claudiaLive) return undefined;
    return (pic) => {
      if (judgeAsk && judgeAsk.verdict) {
        const v = judgeAsk.verdict;
        judgeAsk = { at: Date.now(), verdict: null, done: true, keepUntil: v === 'keep' ? Date.now() + 18000 : 0 };
        return v === 'keep' ? null : v;
      }
      if (judgeAsk && !judgeAsk.done && Date.now() - judgeAsk.at > 9000) {
        judgeAsk = null;
        return pic.everyone ? 'close' : null;
      }
      if (judgeAsk && !judgeAsk.done) return null;
      if (judgeAsk && judgeAsk.keepUntil && Date.now() < judgeAsk.keepUntil) return null;
      const min = Math.min(60, 20 + 6 * pic.of);
      const candidate = pic.elapsed >= min && pic.quiet >= 2.2 && (pic.everyone || pic.elapsed > 150);
      if (!candidate || speaking) return null;
      judgeAsk = { at: Date.now(), verdict: null, done: false };
      const stats = pic.spoken.map(x => nameOf(x.id) + ' ' + Math.round(x.seconds) + 's').join(', ');
      AI.ask(AI.CLAUDIA, 'The ' + (kind === 'table' ? 'round table' : 'fire') + ' discussion has run '
        + Math.round(pic.elapsed) + ' seconds. Time each person has spoken: ' + stats + '. '
        + (pic.everyone ? 'Everybody has had their say. ' : 'Not everybody has spoken. ')
        + 'Decide now: end_discussion, invite_player, or keep_going.');
      return null;
    };
  }

  function discussionStarted() { if (claudiaLive) promptDirty = true; }
  function discussionEnded() { judgeAsk = null; }

  /* ---------------- the room moving ---------------- */

  function onNet(e) {
    if (!active) return;
    if (e.type === 'phase' || e.type === 'state' || e.type === 'murder' || e.type === 'reveal'
        || e.type === 'nameReveal' || e.type === 'tally') promptDirty = true;
    /* The banished have had their last words; the role is the card's to
       announce (big text, sound, Claudia). An AI still mid-sentence when
       the floor closes or the reveal lands is cut off, so nobody says
       "I'm a Traitor" over — or after — the card. */
    if (((e.type === 'floor' && e.done) || e.type === 'reveal') && speaking && speaking.id !== AI.CLAUDIA) {
      const f = Session.state && Session.state.finale;
      if (e.type === 'reveal' || (f && f.stage === 'reveal')) { AI.hush(speaking.id, true); finishTurn(speaking.id); }
    }
    if (e.type === 'phase') {
      // a new room: nobody is mid-sentence in it
      if (speaking) { AI.hush(speaking.id, true); speaking = null; }
      heardLast = null;
      thread = null;
      asks.clear();
      queued.clear();
      tableOpened = false;
      claudiaLastBusy = Date.now();
      commentOpportunity = 0;
      leaveRoomUntil = 0;
      nextCutInAt = Date.now() + CUT_IN_CHECK_MS;
      lastBanter = Date.now();
      for (const st of state.values()) st.said = 0;
      const s = Session.state;
      AI.listen(s.players.filter(p => !p.bot && p.alive).map(p => ({ id: p.id, name: p.name })));
    }
    const day = 'Day ' + ((Session.state ? Session.state.day : 0) + 1) + ': ';
    const log = (text) => { chronicle.push(day + text); if (chronicle.length > 120) chronicle.shift(); promptDirty = true; };
    if (e.type === 'phase' && Session.state && Session.state.phase === 'night' && Session.state.shield
        && Session.state.shield.day === Session.state.day) {
      const sh = Session.state.shield;
      log(sh.name + ' did the most jobs (' + sh.n + ') and won the shield: the poison cannot kill them tonight.');
    }
    if (e.type === 'murder' && !e.name && e.shieldName) {
      log('Nobody died: the poison went into ' + e.shieldName + ', but ' + e.shieldName + ' held the shield and survived. Whoever handed ' + e.shieldName + ' something yesterday may be the Traitor.');
    }
    if (e.type === 'murder' && e.name) {
      note('system', 'Claudia', e.name + ' was poisoned yesterday and died in the night. They were a Faithful.', 'room');
      log(e.name + ' was poisoned in the night and found dead at breakfast (a Faithful).');
    }
    if (e.type === 'expose' && e.name) {
      note('system', 'Claudia', e.name + ' carried the poison and never used it, so Claudia exposed them as a TRAITOR.', 'room');
      log(e.name + ' carried the poison and never used it, so Claudia exposed them as a TRAITOR.');
    }
    if (e.type === 'reveal' && e.name) {
      note('system', 'Claudia', e.name + ' was ' + (e.role === 'traitor' ? 'a TRAITOR.' : 'a Faithful.'), 'room');
      log(e.name + ' was banished and revealed as ' + (e.role === 'traitor' ? 'a TRAITOR.' : 'a Faithful.'));
    }
    if (e.type === 'nameReveal') {
      note('system', 'Claudia', nameOf(e.playerId) + ' voted for ' + nameOf(e.targetId) + '.', 'room');
      voteLog.push({ day: Session.state ? Session.state.day : 0, voter: e.playerId, target: e.targetId });
      log(nameOf(e.playerId) + ' voted for ' + nameOf(e.targetId) + '.');
      if (e.overrule) {
        note('system', 'Claudia', nameOf(e.playerId) + ' is the Wise One, and overrules the table: ' + nameOf(e.targetId) + ' goes.', 'room');
        log(nameOf(e.playerId) + ' was revealed as the Wise One and overruled the table to banish ' + nameOf(e.targetId) + '.');
      }
    }
  }

  return {
    start, stop, pauseBots, startEncounter, claudiaLine, claudiaJudge, discussionStarted, discussionEnded, mentions,
    distrusts, moved,
    levels: () => new Map(),
    BOT_FUNCTIONS, CLAUDIA_FUNCTIONS,
    get active() { return active; },
    get claudiaLive() { return active && claudiaLive; },
  };
})();
