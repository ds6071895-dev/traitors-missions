/* ------------------------------------------------------------------
   bots.js — a whole night, on one machine, for working on it.

   The show needs three people and a room, which makes every part of it
   that is not a mission expensive to look at: to see the fire you need
   two other browsers, four letters read out loud, and twenty minutes of
   boat and bow first. This is the door round that. It seats you and two
   bots, deals whatever hand you asked for, and plays whichever parts of
   the running order you named — so "does the banishment ceremony still
   look right" is a page reload rather than an evening.

   It is deliberately not on any screen. There is no button, nothing in
   the menus mentions it, and a night started from the lobby cannot
   reach any of it: `Session` only honours a chosen Traitor or a partial
   running order when the call that started it declared itself a
   rehearsal, and this file is the only thing that ever does.

     ?bots=1                       the whole night, hand dealt from the seed
     ?bots=finale                  the fire and nothing else
     ?bots=intro,table,finale      no missions, all the talking
     ?bots=m1,finale               one mission, then the fire
     ?bots=all&traitor=you         you are the Traitor
     ?bots=all&traitor=2           the second bot is
     ?bots=all&traitor=none        nobody is, which is a real outcome
     ?bots=finale&decide=end       the bots vote to end it at once
     ?bots=finale&target=you       and they both name you when they do not

   Everything else is optional: `seed`, `names`, `pace`. A `#bots=…`
   works as well as a `?bots=…`, because a hash is what survives being
   typed into a phone.

   The bots are not players and are not pretending to be. They talk
   during the discussion, take their turn at the fire, and vote — and
   what they vote is a stated policy rather than a mind, because the
   point of them is to make the ceremony reproducible, not to be beaten.
------------------------------------------------------------------ */
const Bots = (() => {

  /* seat 0 is always you: `Session.fresh` seats the roster in the order
     it is handed, and `start` always hands itself first. */
  const SEAT_YOU = 0;

  const PART_ALIAS = {
    all: null,                                   // expands to everything
    intro: 'intro', hill: 'intro', welcome: 'intro', opening: 'intro',
    m1: 'm1', mission1: 'm1', 'mission-1': 'm1', first: 'm1',
    table: 'table', discussion: 'table', roundtable: 'table', talk: 'table',
    m2: 'm2', mission2: 'm2', 'mission-2': 'm2', second: 'm2',
    finale: 'finale', fire: 'finale', fireplace: 'finale', end: 'finale',
    missions: 'missions',                        // expands to m1 + m2
  };

  const PACE = {
    fast:   { turn: [1.6, 2.6], open: [7, 11],   vote: [0.7, 1.6], line: [1.0, 1.8] },
    normal: { turn: [6, 12],    open: [22, 38],  vote: [1.6, 4.2], line: [2.0, 3.4] },
    slow:   { turn: [14, 24],   open: [60, 110], vote: [4, 9],     line: [3.0, 5.0] },
  };

  let cfg = null;              // what the address bar asked for
  let running = false;
  let chatKey = null;          // which room the current chatter belongs to
  let rng = null;
  let offNet = null;
  let speaking = null;         // which bot the edit should be cutting to
  let chatToken = 0;
  const timers = new Set();
  const pending = new Set();   // action keys already scheduled, so nothing doubles

  const el = (id) => document.getElementById(id);

  /* ---------------- reading the address bar ---------------- */

  function params() {
    const out = new Map();
    const take = (raw) => {
      if (!raw) return;
      let q;
      try { q = new URLSearchParams(String(raw).replace(/^[?#]/, '')); }
      catch (e) { return; }
      q.forEach((v, k) => { if (!out.has(k)) out.set(k, v); });
    };
    take(location.search);
    take(location.hash);
    return out;
  }

  function parseParts(raw) {
    const words = String(raw || '').toLowerCase().split(/[,+\s]+/).filter(Boolean);
    const every = Session.PARTS;
    const out = [];
    const add = (p) => { if (p && out.indexOf(p) < 0) out.push(p); };
    for (const w of words) {
      // `?bots=1` and `?bots=on` are "the whole night"
      if (w === '1' || w === 'on' || w === 'yes' || w === 'true' || w === 'all') {
        every.forEach(add);
        continue;
      }
      const id = PART_ALIAS[w];
      if (id === null) { every.forEach(add); continue; }
      if (id === 'missions') { add('m1'); add('m2'); continue; }
      if (id) add(id);
    }
    // an argument that named nothing recognisable still wanted a night
    if (!out.length) every.forEach(add);
    // keep the running order's own order, whatever order they were typed in
    return every.filter(p => out.indexOf(p) >= 0);
  }

  /* Which chair the Traitor is in, or -1 for a night without one, or
     undefined to let the seed deal it as it always would. */
  function parseTraitor(raw) {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const w = String(raw).trim().toLowerCase();
    if (w === 'random' || w === 'seed' || w === 'auto') return undefined;
    if (w === 'none' || w === 'no' || w === 'off' || w === 'nobody'
        || w === 'clean' || w === '-1') return -1;
    if (w === 'you' || w === 'me' || w === 'self' || w === '0') return SEAT_YOU;
    if (w === 'bot1' || w === 'a' || w === '1') return 1;
    if (w === 'bot2' || w === 'b' || w === '2') return 2;
    return undefined;
  }

  function fromLocation() {
    const q = params();
    const raw = q.has('bots') ? q.get('bots')
              : (q.has('solo') ? q.get('solo') : null);
    if (raw === null) return null;

    const seedRaw = parseInt(String(q.get('seed') || '').replace(/[^0-9]/g, ''), 10);
    const names = String(q.get('names') || '').split(',')
      .map(s => s.replace(/\s+/g, ' ').trim().slice(0, 16)).filter(Boolean);

    return {
      parts: parseParts(raw),
      traitorSeat: parseTraitor(q.get('traitor')),
      seed: Number.isFinite(seedRaw) && seedRaw > 0 ? (seedRaw >>> 0) : U.randomSeed(),
      names,
      pace: PACE[String(q.get('pace') || '').toLowerCase()] || PACE.normal,
      // how the two of them vote at the fire, and who they name
      decide: ['end', 'banish', 'mix'].indexOf(String(q.get('decide') || '')) >= 0
        ? String(q.get('decide')) : 'mix',
      target: ['you', 'bots', 'random'].indexOf(String(q.get('target') || '')) >= 0
        ? String(q.get('target')) : 'random',
      quiet: q.get('chat') === 'off',
    };
  }

  /* ---------------- the two of them ---------------- */

  const FIRST = ['Morag', 'Ainsley', 'Struan', 'Isla', 'Fergus', 'Catriona',
                 'Hamish', 'Elspeth', 'Rab', 'Mhairi', 'Douglas', 'Senga'];

  function botLook(r) {
    const L = Look.LISTS;
    return Look.normalise({
      build: r.int(0, L.BUILD.length - 1),
      skin: r.int(0, L.SKIN.length - 1),
      hair: r.int(0, L.HAIR.length - 1),
      hairColour: r.int(0, L.HAIR_COLOUR.length - 1),
      coat: r.int(0, L.COAT.length - 1),
      accent: r.int(0, L.ACCENT.length - 1),
      hat: r.int(0, L.HAT.length - 1),
      scarf: r.int(0, L.SCARF.length - 1),
    });
  }

  function roster(c) {
    const r = U.makeRng(((c.seed ^ 0x51ed3) >>> 0) || 1);
    const pool = FIRST.slice();
    const players = [{
      id: 'you', name: Look.getName() || 'You', look: Look.get(), local: true,
    }];
    for (let i = 0; i < 2; i++) {
      const given = c.names[i];
      const name = given || pool.splice(r.int(0, pool.length - 1), 1)[0] || ('Bot ' + (i + 1));
      players.push({ id: 'bot' + (i + 1), name, look: botLook(r), local: false });
    }
    return players;
  }

  const isBot = (id) => id === 'bot1' || id === 'bot2';
  const botIds = () => (Session.state ? Session.state.players.filter(p => !p.local)
                        .map(p => p.id) : []);

  /* ---------------- scheduling ----------------
     Every bot act goes through here, so tearing the night down cancels
     all of them and nothing fires into a scene that has gone. `key`
     makes an act idempotent: the driver runs on every event and would
     otherwise queue four votes for one ballot. */

  function after(key, range, fn) {
    if (!running || pending.has(key)) return;
    pending.add(key);
    const ms = 1000 * (range[0] + rng() * (range[1] - range[0]));
    const t = setTimeout(() => {
      timers.delete(t);
      pending.delete(key);
      if (running) { try { fn(); } catch (e) { console.warn('bot:', e); } }
    }, ms);
    timers.add(t);
  }

  function clearAll() {
    timers.forEach(t => clearTimeout(t));
    timers.clear();
    pending.clear();
    chatToken++;
    speaking = null;
  }

  /* ---------------- what they say ----------------
     The old written table script, which has been sitting unused in
     `claudia-lines.js` since the round table became three live
     microphones. It is exactly right for this: nobody is being fooled
     by a bot, and a room where two people never say anything is a room
     you cannot judge the edit of. */

  function pickLine(who) {
    const others = Session.alive().filter(p => p.id !== who);
    const about = others.length ? others[rng.int(0, others.length - 1)] : null;
    const deck = ClaudiaLines.TABLE.filter(t => (about ? true : !t.accuse));
    const card = deck[rng.int(0, deck.length - 1)];
    return ClaudiaLines.fill(card.text, { name: about ? (about.local ? 'you' : about.name) : '' });
  }

  const voiceFor = (p) => ({ pitch: 0.80 + (p.seat % 3) * 0.16,
                             rate: 0.90 + (p.seat % 2) * 0.10 });

  /* One voice at a time, whoever is talking: `Voice.say` cancels
     whatever was speaking, so two overlapping bots would each cut the
     other off mid-word. A single loop is the whole of the fix. */
  async function chat(pick, mine) {
    if (cfg.quiet) return;
    while (running && mine === chatToken) {
      const p = pick();
      if (!p) return;
      speaking = p.id;
      const v = voiceFor(p);
      await Voice.say(pickLine(p.id), { speaker: p.name, pitch: v.pitch, rate: v.rate });
      speaking = null;
      if (mine !== chatToken || !running) return;
      await Scenes.wait(cfg.pace.line[0] + rng() * (cfg.pace.line[1] - cfg.pace.line[0]));
    }
  }

  function startChat(pick) {
    chatToken++;
    const mine = chatToken;
    chat(pick, mine);
    return mine;
  }

  function stopChat() {
    chatToken++;
    speaking = null;
  }

  /* ---------------- the driver ----------------
     One function, run on every event the session emits. It looks at
     where the night is and schedules whatever the two of them owe it.
     Nothing here holds state of its own: `pending` stops an act being
     queued twice, and the session is the only record of what has
     happened. */

  function think() {
    const s = Session.state;
    if (!running || !s) return;

    floorActs(s);
    if (s.phase === 'mission') resultActs(s);
    if (s.phase === 'finale') finaleActs(s);
  }

  /* The floor, both shapes. A turn at the fire is taken and handed
     back; the open table is two people talking until they have each had
     enough of it. */
  function floorActs(s) {
    const f = s.floor;
    if (!f || f.done) { hush(); return; }

    if (f.all) {
      const alive = Session.alive();
      startChatOnce('table', () => {
        const talkers = alive.filter(p => !p.local && (f.ready || []).indexOf(p.id) < 0);
        return talkers.length ? talkers[rng.int(0, talkers.length - 1)] : null;
      });
      for (const id of botIds()) {
        const p = Session.playerById(id);
        if (!p || !p.alive || (f.ready || []).indexOf(id) >= 0) continue;
        after('yield-open-' + id, cfg.pace.open,
              () => Net.send({ type: 'yieldFloor', playerId: id }));
      }
      return;
    }

    if (!isBot(f.playerId)) { hush(); return; }
    const who = f.playerId;
    startChatOnce('turn-' + who, () => Session.playerById(who));
    after('yield-' + who + '-' + f.endsAt, cfg.pace.turn, () => {
      hush();
      Net.send({ type: 'yieldFloor', playerId: who });
    });
  }

  function startChatOnce(key, pick) {
    if (chatKey === key) return;
    chatKey = key;
    startChat(pick);
  }
  function hush() { chatKey = null; stopChat(); }

  /* A mission the bots did not play. The board is published by whoever
     pressed Continue; all these two owe it is their readiness, and they
     give it the moment there is a result to be ready for. */
  function resultActs(s) {
    if (!s.pendingResult) return;
    for (const id of botIds()) {
      const p = Session.playerById(id);
      if (!p || !p.alive || s.resultReady.indexOf(id) >= 0) continue;
      after('ready-' + id, [0.3, 0.9],
            () => Net.send({ type: 'readyResult', playerId: id }));
    }
  }

  /* The fire. Both ballots, and both of them are a stated policy rather
     than a judgement — a bot that guessed would make the ceremony
     different every time it was looked at, which is the opposite of
     what this file is for. The default walks you through the whole
     thing: one banishment, and then they end it. */
  function finaleActs(s) {
    const f = s.finale;
    if (!f) return;

    if (f.stage === 'decide') {
      const choice = cfg.decide === 'mix'
        ? (f.round === 0 && Session.alive().length > 2 ? 'banish' : 'end')
        : cfg.decide;
      for (const id of botIds()) {
        const p = Session.playerById(id);
        if (!p || !p.alive || f.votes[id]) continue;
        after('vote-' + f.round + '-' + id, cfg.pace.vote,
              () => Net.send({ type: 'vote', playerId: id, choice }));
      }
      return;
    }

    if (f.stage === 'name') {
      for (const id of botIds()) {
        const p = Session.playerById(id);
        if (!p || !p.alive || f.names[id]) continue;
        const targetId = nameTarget(id);
        if (!targetId) continue;
        after('name-' + f.round + '-' + f.nameRound + '-' + id, cfg.pace.vote,
              () => Net.send({ type: 'name', playerId: id, targetId }));
      }
    }
  }

  function nameTarget(voterId) {
    const others = Session.alive().filter(p => p.id !== voterId);
    if (!others.length) return null;
    const you = others.find(p => p.local);
    const bots = others.filter(p => !p.local);
    if (cfg.target === 'you' && you) return you.id;
    if (cfg.target === 'bots' && bots.length) return bots[rng.int(0, bots.length - 1)].id;
    /* Seeded on the voter and the round, not on the call, so re-reading
       a ballot cannot produce a different name than the one that was
       cast — the driver runs again on every event. */
    const f = Session.state.finale;
    const r = U.makeRng(((cfg.seed ^ (f.round * 131) ^ (f.nameRound * 17)
                          ^ voterId.charCodeAt(voterId.length - 1) * 7919) >>> 0) || 3);
    return others[r.int(0, others.length - 1)].id;
  }

  /* ---------------- the board ----------------
     A mission the two of them were never in still has to produce three
     rows, because the round table is an argument about a board. Their
     numbers are drawn around yours: close enough to be worth arguing
     over, and never so far off that the board reads as broken. */

  const MONEY = /^£\s*([\d,]+)$/;
  const NUMBER = /^-?\d+(\.\d+)?$/;

  function fakeCell(v, r) {
    const m = MONEY.exec(v.trim());
    if (m) return U.money(Math.max(0, Math.round(Number(m[1].replace(/,/g, ''))
                                                 * r.range(0.6, 1.3))));
    if (NUMBER.test(v.trim())) {
      const n = Number(v) * r.range(0.6, 1.3);
      return v.indexOf('.') >= 0 ? n.toFixed(2) : String(Math.round(n));
    }
    return '—';
  }

  function board(myReport) {
    if (!running || !myReport) return null;
    const s = Session.state;
    if (!s) return null;
    const mine = Math.max(0, Math.round(myReport.earned || 0));
    const r = U.makeRng(((cfg.seed ^ (s.missionAt * 7717)) >>> 0) || 5);
    const cols = myReport.columns || [];
    const rows = s.players.map((p) => {
      if (p.local) {
        /* Your row keeps its `stats`, and theirs never get any. That is
           not tidiness: `Session.judgeAgenda` marks a Traitor's task off
           the stats on their row and treats a row without them as a
           report that never arrived, which is exactly the right answer
           for a contestant who was never out there. So a rehearsal can
           still expose *you* for an unfinished task, and can never
           expose a bot for one it had no way to do. */
        return { playerId: p.id, name: p.name, seat: p.seat, columns: cols,
                 earned: mine, completed: !!myReport.completed,
                 stats: myReport.stats || {},
                 cells: myReport.cells || [] };
      }
      const earned = Math.max(0, Math.round(mine * r.range(0.55, 1.35)
                                            + r.range(-400, 900)));
      return {
        playerId: p.id, name: p.name, seat: p.seat, earned, columns: cols,
        completed: r() < 0.7,
        /* Their cells have to line up with the mission's own columns,
           whatever those are, so they are shaped from yours rather than
           invented. Only two shapes are safely fakeable — money and a
           bare number — and everything else gets a dash, because a
           plausible-looking wrong value on a board people argue about
           is worse than an obvious blank. */
        cells: (myReport.cells || []).map(v => fakeCell(String(v), r)),
      };
    });
    rows.sort((a, b) => b.earned - a.earned).forEach((row, i) => { row.place = i + 1; });
    return {
      earned: rows.reduce((n, row) => n + row.earned, 0),
      completed: !!myReport.completed,
      columns: cols,
      rows,
      players: rows,
    };
  }

  /* ---------------- lifecycle ---------------- */

  function start(c) {
    if (running) stop();
    cfg = c;
    rng = U.makeRng(((cfg.seed ^ 0xb07) >>> 0) || 11);
    running = true;
    chatKey = null;

    /* Listen before the night starts. `Show.beginParty` builds the
       first scene inside its own call, and an act owed by that scene —
       a bot's turn on an opening floor — would otherwise be missed. */
    offNet = Net.on(() => think());

    AudioBus.resume();
    Voice.unlock();
    Game.enterShow();
    Show.beginParty({
      solo: true,
      host: true,
      seed: cfg.seed,
      players: roster(cfg),
      parts: cfg.parts,
      traitorSeat: cfg.traitorSeat,
    });
    think();
    banner();
    return true;
  }

  function stop() {
    running = false;
    clearAll();
    chatKey = null;
    if (offNet) { offNet(); offNet = null; }
    const b = el('bots-flag');
    if (b) b.remove();
  }

  /* A corner chip saying what was asked for, because a rehearsal that
     looks exactly like a real night is a rehearsal you will misread. */
  function banner() {
    let b = el('bots-flag');
    if (!b) {
      b = document.createElement('div');
      b.id = 'bots-flag';
      b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:60;'
        + 'font:600 10px/1.5 system-ui,sans-serif;letter-spacing:.08em;'
        + 'text-transform:uppercase;color:#ffd48a;background:rgba(12,10,18,.62);'
        + 'border:1px solid rgba(255,212,138,.35);border-radius:4px;'
        + 'padding:3px 7px;pointer-events:none;opacity:.75';
      document.body.appendChild(b);
    }
    const t = cfg.traitorSeat === undefined ? 'seed'
            : cfg.traitorSeat < 0 ? 'none'
            : (cfg.traitorSeat === SEAT_YOU ? 'you' : 'bot' + cfg.traitorSeat);
    b.textContent = 'bots · ' + cfg.parts.join(' ') + ' · traitor ' + t
                  + ' · seed ' + cfg.seed;
  }

  /* Read once at boot, after the mission registry is full — the run
     plan draws two missions out of it, and an empty registry is a night
     with nothing in it. */
  function openFromLink() {
    const c = fromLocation();
    if (!c) return false;
    console.info('[bots] rehearsal night:', c);
    start(c);
    return true;
  }

  return { openFromLink, start, stop, board, fromLocation, parseParts, parseTraitor,
           PART_ALIAS, PACE,
           get running() { return running; },
           get config() { return cfg; },
           // who the edit should be cutting to, when nobody has a microphone
           get speaking() { return speaking; } };
})();
