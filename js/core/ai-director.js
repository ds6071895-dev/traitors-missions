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
   has said least, in a gap the people have left — and stops it the
   moment a person starts talking over it.

   AI Claudia speaks the show's own lines word for word, so subtitles and
   voice agree, and judges the open discussions: when everybody has had
   their say and the room has gone quiet, she is asked whether this is
   the moment, and either closes it or turns to whoever has been
   hiding.
------------------------------------------------------------------ */
const AIDirector = (() => {

  const TICK_MS = 400;
  const QUIET_BEFORE_BOT = 0.8;      // seconds of human silence before an AI may answer
  const BOT_COOLDOWN = 9;            // an AI does not speak twice in this many seconds
  const TURN_TIMEOUT = 26;           // a reply that never finishes is abandoned
  const VOTE_DEADLINE = 16;          // seconds before a vote falls back to the seed
  const TRANSCRIPT = 46;             // lines kept in a prompt

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

  /* ---------------- the tools ---------------- */

  const BOT_FUNCTIONS = [
    { name: 'vote_banish', description: 'Write a name on your slate at the round table or the fire. Only when Claudia or the game asks you to vote.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Exactly one of the names you were offered.' } }, required: ['name'] } },
    { name: 'fire_decision', description: 'At the Fire of Truth: end the game, or banish again.',
      parameters: { type: 'object', properties: { choice: { type: 'string', enum: ['end', 'banish'], description: 'end or banish' } }, required: ['choice'] } },
    { name: 'turret_choice', description: 'Traitors only, in the turret at night: who carries tomorrow\'s poison (kind carrier, with a Traitor\'s name), offer a Faithful a seat (kind recruit, with their name), or nothing (kind none).',
      parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['carrier', 'recruit', 'none'], description: 'carrier, recruit or none' },
                                                  name: { type: 'string', description: 'Who, for carrier or recruit.' } }, required: ['kind'] } },
    { name: 'recruit_answer', description: 'Answer the Traitors’ offer of a seat: join them, or refuse and stay Faithful.',
      parameters: { type: 'object', properties: { accept: { type: 'boolean', description: 'true to become a Traitor' } }, required: ['accept'] } },
    { name: 'done_talking', description: 'Say you have said enough at the round table, so the table can move on.',
      parameters: { type: 'object', properties: {} } },
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
    offs.push(AI.on('hearing', (m) => { lastHuman = Date.now(); interrupt(m.id); }));
    offs.push(AI.on('text', onText));
    offs.push(AI.on('tool', onTool));
    offs.push(AI.on('done', onDone));
    offs.push(AI.on('error', (m) => { if (speaking && m.id === speaking.id) speaking = null; }));
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
    out.push('Traitors dealt at the start: ' + (s.dealt || 1) + '. Prize pot: ' + U.money(s.pot) + '.');
    if (s.chores && s.chores.done) {
      out.push('Jobs done round the castle today: '
        + Session.alive().map(p => p.name + ' ' + (s.chores.done[p.id] || 0)).join(', ') + '.');
    }
    const f = s.finale;
    if (f && f.namesShown && f.namesShown.length) {
      out.push('Votes said aloud so far: ' + f.namesShown.map(v => nameOf(v.playerId) + ' named ' + nameOf(v.targetId)).join('; ') + '.');
    }
    return out.join('\n');
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
    return notes.slice(-14).map(n => {
      const when = (n.day === now ? 'today' : 'day ' + (n.day + 1)) + ' at ' + Math.floor(n.t / 60) + ':' + String(n.t % 60).padStart(2, '0');
      const where = typeof Chores !== 'undefined' ? Chores.roomName(n.room) : (n.room || 'somewhere');
      if (n.kind === 'handover') return '- ' + when + ': you saw ' + nameOf(n.a) + ' hand something to ' + nameOf(n.b) + ' in ' + where + '.';
      const who = (n.ids || []).map(nameOf);
      return '- ' + when + ': you were in ' + where + (who.length ? ' with ' + who.join(', ') : ' alone') + '.';
    }).join('\n');
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
      '',
      traitor
        ? 'SECRET: You are a TRAITOR. ' + (partner ? 'Your fellow Traitor is ' + partner + '. Protect them without being obvious. ' : 'You are the only Traitor. ')
          + 'Win by still being in the game at the end. Lie convincingly, steer suspicion onto Faithfuls, never admit it.'
          + (p ? (p.used ? ' Today the poison went into ' + nameOf(p.target) + ' — they die tonight. Act as if you know nothing.'
                         : (p.mine ? ' You are carrying the poison today.' : ' ' + nameOf(p.carrier) + ' is carrying the poison today.')) : '')
        : 'SECRET: You are FAITHFUL. Win by finding and banishing every Traitor. You do not know who they are. Every day a Traitor slips poison to somebody by standing next to them and handing something over — but Faithfuls hand each other letters for their jobs the same way, so a hand-over is a lead, not proof. Reason from what you saw, who was alone with whom, how many jobs people did, who defends whom, and the votes.',
      dead ? 'You are OUT of the game now: stay silent unless spoken to.' : '',
      '',
      'HOW THE GAME WORKS: by day everybody walks the castle for three minutes doing little jobs that pay into the pot; one Traitor carries poison and must slip it to a Faithful before the bell or be exposed. The poisoned person dies in the night and is found missing at breakfast. At the round table everyone discusses then votes to banish one person, who reveals if they were Faithful or Traitor. When four or fewer remain, the Fire of Truth: everyone votes to END the game or BANISH AGAIN; ending must be unanimous. If any Traitor is left at the end, the Traitors take all the money.',
      '',
      'WHAT EVERYBODY KNOWS:', publicPicture(),
      '',
      'WHAT YOU SAW WITH YOUR OWN EYES:', notesFor(v),
      jobs.length && Session.state && Session.state.phase === 'tasks' ? 'Your jobs still to do: ' + jobs.join('; ') + '.' : '',
      '',
      'RECENT CONVERSATION:', transcriptFor(b.id, traitor),
      '',
      'TOOLS: Only call vote_banish, fire_decision, turret_choice or recruit_answer when the game asks you to decide. When you call a tool, do not read your choice out loud unless asked.',
    ].filter(x => x !== '').join('\n');
  }

  function claudiaPrompt() {
    return [
      'You are Claudia, the host of The Traitors: warm, witty, theatrical, very British, fond of a dramatic pause. You are hosting live on a voice call with real contestants in a Scottish castle.',
      'You never reveal who the Traitors are. You keep comments short — one or two sentences — and you speak to the room.',
      'When asked to speak a line word for word, say exactly that line and nothing else.',
      'When asked whether to end a discussion, decide by calling exactly one tool: end_discussion (then close it with one dramatic sentence), invite_player (then say one sentence to them), or keep_going (and say nothing).',
      '',
      'WHAT EVERYBODY KNOWS:', publicPicture(),
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
     turret stays in the turret, exactly as it does for the people. */
  const EARSHOT = 11;
  function inEarshot(aId, bId) {
    const s = Session.state;
    if (!s || s.phase !== 'tasks' || typeof CastleNet === 'undefined') return true;
    const a = CastleNet.get(aId), b = CastleNet.get(bId);
    if (!a || !b) return true;
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    return d <= EARSHOT && (a.room === b.room || d <= 5);
  }
  function earsOf(id) {
    const s = Session.state;
    if (!s || s.phase !== 'tasks') return null;
    return Session.alive().filter(p => p.id !== id && inEarshot(id, p.id)).map(p => p.id);
  }

  function onHeard(m) {
    if (!active) return;
    lastHuman = Date.now();
    const s = Session.state;
    const p = Session.playerById(m.id);
    if (!p) return;
    const turret = s.phase === 'night';
    if (turret && Session.privateView(p.id).role !== 'traitor') return;    // asleep
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
    if (!turret) {
      const same = heardLast && heardLast.id === p.id && Date.now() - heardLast.at < 8000;
      heardLast = {
        id: p.id, name: p.name, at: Date.now(),
        text: ((same ? heardLast.text + ' ' : '') + m.text).slice(-400),
        named: same ? [...new Set(heardLast.named.concat(named))] : named,
      };
    }
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

  /* A person started talking: anybody AI who is mid-sentence stops. */
  function interrupt(humanId) {
    if (thread && Session.playerById(humanId) && Session.playerById(humanId).alive) thread = null;
    if (!speaking || speaking.id === AI.CLAUDIA) return;
    const p = Session.playerById(humanId);
    if (!p || !p.alive) return;
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
    const turret = s.phase === 'night';
    note(b.id, b.name, m.text, turret ? 'turret' : 'room', turret ? null : earsOf(b.id));
    if (thread && thread.waiting === b.id) thread.said.push({ id: b.id, name: b.name, text: m.text });
    /* Captions follow the voice: by day a line from across the house is
       not something your screen should print. */
    if (!turret) Net.send({ type: 'cue', text: m.text, voice: true, id: b.id,
                            near: s.phase === 'tasks' ? (earsOf(b.id) || []) : undefined });
  }

  function onDone(m) {
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

  function speak(id, cue, after) {
    speaking = { id, since: Date.now(), after: after || null };
    freshen(id, false);
    AI.ask(id, cue);
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
      Net.send({ type: 'name', playerId: botId, targetId: t.id });
      return { ok: true, voted: t.name };
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
    let loud = 0;
    if (typeof VoiceChat !== 'undefined') {
      for (const [id, v] of VoiceChat.levels) {
        const p = Session.playerById(id);
        if (p && !p.bot && v > 0.12) loud = Math.max(loud, v);
      }
      if (VoiceChat.selfLevel > 0.12) loud = Math.max(loud, VoiceChat.selfLevel);
    }
    if (loud > 0) lastHuman = Date.now();
    return (Date.now() - lastHuman) / 1000;
  }

  function tick() {
    if (!active || !Session.state) return;
    const s = Session.state;
    refreshPrompts(false);
    if (speaking && Date.now() - speaking.since > TURN_TIMEOUT * 1000) finishTurn(speaking.id);
    const quiet = humansQuietFor();

    // the floor: a turn that belongs to an AI is spoken, then handed back
    const f = s.floor;
    if (f && !f.done && f.playerId && isBot(f.playerId)) {
      const key = 'floor:' + f.playerId + ':' + f.endsAt;
      if (!asked.has(key) && !speaking) {
        asked.add(key);
        const lastWords = s.finale && s.finale.stage === 'reveal' && s.finale.pending === f.playerId;
        speak(f.playerId, lastWords
          ? 'You have just been banished by the table. Say your last words to them in two sentences. Never say or hint whether you were a Traitor or a Faithful — no "I am a…", no "I was a…" — because the castle reveals it right after you finish.'
          : 'It is your turn to speak by the fire, and nobody may interrupt. Make your case in three sentences: who you suspect and why, or why you should be trusted.',
        () => setTimeout(() => {
          const st = Session.state;
          if (st && st.floor && st.floor.playerId === f.playerId) Net.send({ type: 'yieldFloor', playerId: f.playerId });
        }, 600));
      }
      return;
    }

    // the open table: one AI at a time, in the gaps people leave
    if (f && !f.done && f.all) {
      if (!speaking && quiet >= QUIET_BEFORE_BOT) {
        const b = nextSpeaker(s);
        if (b) speak(b.id, cueFor(b, s));
      }
      // an AI that has spoken its piece says so
      for (const b of bots) {
        const st = state.get(b.id), me = Session.playerById(b.id);
        if (!me || !me.alive || (f.ready || []).indexOf(b.id) >= 0) continue;
        if (st.said >= 3 && Date.now() - st.last > 12000) Net.send({ type: 'yieldFloor', playerId: b.id });
      }
      return;
    }

    if (s.phase === 'night') return nightTick(s);
    if ((s.phase === 'table' || s.phase === 'finale') && s.finale) return ballotTick(s);
    // everywhere else — the hill, the castle by day, breakfast — the
    // AIs talk back when they are talked to
    chatTick(s, quiet);
  }

  /* ---------------- ordinary conversation ----------------
     Talk to the room and the room talks back — the way a room does. One
     of them answers first, after the beat it takes a person to realise
     they are the one answering. Then, as often as not, somebody else
     picks it up; and with a full house, sometimes a third. Never two at
     once, never all of them, and the moment a person speaks the AIs
     stop and listen.

     Whoever was named answers. A remark aimed at another person by name
     is left to them. By day only the AIs in earshot can hear it at all. */
  let thread = null;     // { origin, said: [{ id, name, text }], left, waiting, nextAt, used: Set }
  let lastBanter = 0;

  function chatTick(s, quiet) {
    if (speaking) return;
    // Claudia has the room; nobody talks over her
    if (claudiaLive && AI.speaking(AI.CLAUDIA)) return;
    if (typeof Voice !== 'undefined' && Voice.speaking) return;
    if (thread && !thread.waiting) return followUp(s, quiet);
    const h = heardLast;
    if (!h) return banter(s, quiet);
    if (Date.now() - h.at > 20000) { heardLast = null; return; }
    if (quiet < QUIET_BEFORE_BOT) return;
    heardLast = null;
    const b = replier(h, s);
    if (!b) return;
    const st = state.get(b.id);
    st.with = h.id;
    st.addressed = 0;
    const pool = listeners(h.id, s).filter(x => x.id !== b.id);
    const n = pool.length;
    // how many more voices this deserves: often one, with a crowd sometimes two
    let left = 0;
    if (n >= 1 && Math.random() < (h.named.length ? 0.4 : 0.65)) left++;
    if (left && n >= 3 && Math.random() < 0.35) left++;
    thread = { origin: h, said: [], left, waiting: b.id, nextAt: 0, used: new Set([b.id]) };
    speak(b.id, chatCue(b, h, s));
  }

  /* The AIs who could have heard this person: everybody, or by day
     whoever is near enough. */
  function listeners(humanId, s) {
    return bots.filter(b => {
      const p = Session.playerById(b.id);
      return p && p.alive && inEarshot(humanId, b.id);
    });
  }

  function replier(h, s) {
    const now = Date.now();
    const mine = bots.filter(b => Session.playerById(b.id));
    const named = mine.filter(b => h.named.indexOf(b.id) >= 0);
    if (named.length) return named[0];
    const living = listeners(h.id, s);
    if (!living.length) return null;
    const others = s.players.filter(p => !p.bot && p.alive && p.id !== h.id && inEarshot(h.id, p.id));
    // talking to a person, by name: theirs to answer
    if (others.some(p => mentions(h.text, p.name))) return null;
    // whoever this person was just talking with keeps the thread
    const partner = living.find(b => { const st = state.get(b.id); return st.with === h.id && now - st.last < 45000; });
    if (partner && Math.random() < 0.7) return partner;
    const pool = living.slice().sort((a, b) => state.get(a.id).last - state.get(b.id).last);
    return Math.random() < 0.6 ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
  }

  function chatCue(b, h, s) {
    const me = Session.playerById(b.id);
    const where = s.phase === 'tasks' ? 'You are walking round the castle doing your jobs.'
      : 'Right now: ' + phaseWords(s) + '.';
    const toYou = h.named.indexOf(b.id) >= 0;
    return where + ' ' + h.name + ' just said' + (toYou ? ' to you' : '') + ': "' + h.text + '". '
      + (me && !me.alive ? 'You are out of the game, but answer them kindly. ' : '')
      + 'Answer ' + h.name + ' out loud, naturally, as yourself — react like a person would, in one short sentence'
      + (s.phase === 'table' || s.phase === 'finale' ? ', two at most.' : '.');
  }

  /* The second and third voices. Each one hears what was said before it
     and adds a little of its own — agrees, teases, disagrees, asks. */
  function followUp(s, quiet) {
    const t = thread;
    if (!t.left || !t.said.length) { thread = null; return; }
    if (Date.now() < t.nextAt) return;
    if (quiet < 0.6) { thread = null; return; }          // a person is talking: let them
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
      + 'Do not repeat what they said, and do not start with their name every time.');
  }

  /* By day, when a person is near and nobody has said anything for a
     while, an AI may say something itself — about the job, the house,
     or somebody it saw. Rarely, and only to somebody actually there. */
  function banter(s, quiet) {
    if (s.phase !== 'tasks' || quiet < 14 || Date.now() - lastBanter < 30000) return;
    lastBanter = Date.now();
    if (Math.random() < 0.45) return;
    const humans = Session.alive().filter(p => !p.bot);
    const pairs = [];
    for (const b of bots) {
      const bp = Session.playerById(b.id);
      if (!bp || !bp.alive) continue;
      for (const h of humans) if (inEarshot(b.id, h.id) && CastleNet.get(h.id) && CastleNet.get(b.id)
                                  && Math.hypot(CastleNet.get(h.id).x - CastleNet.get(b.id).x,
                                                CastleNet.get(h.id).z - CastleNet.get(b.id).z) < 6) pairs.push([b, h]);
    }
    if (!pairs.length) return;
    const [b, h] = pairs[Math.floor(Math.random() * pairs.length)];
    const pose = CastleNet.get(b.id);
    const where = typeof Chores !== 'undefined' ? Chores.roomName(pose && pose.room) : 'the castle';
    thread = { origin: { id: h.id, name: h.name, text: '(nothing — you started this)', named: [] },
               said: [], left: 0, waiting: b.id, nextAt: 0, used: new Set([b.id]) };
    speak(b.id, 'You are in ' + where + ' doing your jobs, and ' + h.name + ' is right next to you. '
      + 'Say something casual to them — about your job, this room, the castle, or somebody you have seen today. One short sentence, like a real person.');
  }

  const isBot = (id) => bots.some(b => b.id === id);

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

  function cueFor(b, s) {
    const last = lines.slice(-1)[0];
    const st = state.get(b.id);
    if (st.said === 0) return 'The round table discussion is open. Say what you think — who seems suspicious and why — in two or three sentences, as yourself.';
    if (last && last.who !== b.id) return 'React to what ' + last.name + ' just said, and push the discussion forward. Two sentences at most.';
    return 'Add one new point to the discussion, or ask someone a pointed question by name. Two sentences at most.';
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
        askOnce(b.id, key, 'Time to vote. Call vote_banish with exactly one of these names: '
          + options.map(p => p.name).join(', ') + '. Do not say it out loud yet.',
          () => Net.send({ type: 'name', playerId: b.id, targetId: fallbackVote(b.id, options).id }));
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
    const go = () => { if (speaking && speaking.id !== botId) { setTimeout(go, 500); return; } speak(botId, cue); };
    go();
    setTimeout(() => {
      if (!active) return;
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
    list.sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
    return (counts.get(list[0].id) ? list[0] : list[Math.floor(Math.random() * list.length)]);
  }

  function fallbackDecide(botId) {
    const v = Session.privateView(botId) || {};
    if (v.role === 'traitor') return 'end';
    const s = Session.state;
    const caught = s.banished.filter(b => b.role === 'traitor').length;
    return caught >= (s.dealt || 1) ? 'end' : (Math.random() < 0.45 ? 'end' : 'banish');
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
      for (const st of state.values()) st.said = 0;
      const s = Session.state;
      AI.listen(s.players.filter(p => !p.bot && p.alive).map(p => ({ id: p.id, name: p.name })));
    }
    if (e.type === 'murder' && e.name) note('system', 'Claudia', e.name + ' was poisoned yesterday and died in the night. They were a Faithful.', 'room');
    if (e.type === 'expose' && e.name) note('system', 'Claudia', e.name + ' carried the poison and never used it, so Claudia exposed them as a TRAITOR.', 'room');
    if (e.type === 'reveal' && e.name) note('system', 'Claudia', e.name + ' was ' + (e.role === 'traitor' ? 'a TRAITOR.' : 'a Faithful.'), 'room');
    if (e.type === 'nameReveal') note('system', 'Claudia', nameOf(e.playerId) + ' voted for ' + nameOf(e.targetId) + '.', 'room');
  }

  return {
    start, stop, claudiaLine, claudiaJudge, discussionStarted, discussionEnded, mentions,
    levels: () => new Map(),
    BOT_FUNCTIONS, CLAUDIA_FUNCTIONS,
    get active() { return active; },
    get claudiaLive() { return active && claudiaLive; },
  };
})();
