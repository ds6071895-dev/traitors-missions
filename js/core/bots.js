/* ------------------------------------------------------------------
   bots.js — the two players who are not real yet.

   This file is scaffolding and is meant to be deleted. It talks to the
   game the same way you do — through `Net.send()` — and it knows only
   what a remote client would know: its own role, the public state, and
   nothing else. So when two humans replace it, nothing above it
   changes.

   A bot's whole job is to arrive late. A vote that lands the instant
   you cast yours reads as a dialog box; a vote that lands a second and
   a half later reads as somebody deciding.
------------------------------------------------------------------ */
const Bots = (() => {

  let off = null;
  const timers = new Set();
  let running = false;

  const rngFor = (salt, extra) => U.makeRng(
    ((((Session.state ? Session.state.seed : 1) ^ salt ^ (extra | 0)) >>> 0) || 1));

  // a stable hash of a string, so a bot's opinion of a name is its own
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function later(fn, lo = 900, hi = 2300) {
    const t = setTimeout(() => { timers.delete(t); if (running) fn(); },
                         lo + Math.random() * (hi - lo));
    timers.add(t);
  }

  function clearTimers() { timers.forEach(t => clearTimeout(t)); timers.clear(); }

  /* ---------------- opinions ----------------
     A faithful bot has no information, which is the honest position, so
     it runs on a fixed prejudice drawn from the run seed rather than
     pretending to deduce something. A traitor bot has exactly one piece
     of information and plays it: end the night while it still can. */

  function suspicion(botId, targetId) {
    const s = Session.state;
    const base = hash(botId + '>' + targetId + '#' + (s ? s.seed : 0)) / 4294967295;
    // whoever has been quietest at the table draws a little more of it
    const said = s ? s.said.filter(l => l.playerId === targetId).length : 0;
    return base + (said === 0 ? 0.18 : 0) - Math.min(said, 3) * 0.04;
  }

  function decideChoice(bot) {
    const s = Session.state;
    const role = Session._clientRole(bot.id);
    const twoLeft = Session.alive().length <= 2;
    const r = rngFor(0xb07 ^ hash(bot.id), s.finale.round);
    const wantBanish = role === 'traitor'
      ? (twoLeft ? 0.20 : 0.28)      // it is winning by stopping; it stalls
      : (twoLeft ? 0.58 : 0.80);     // and a faithful cannot afford to stop
    return r() < wantBanish ? 'banish' : 'end';
  }

  function nameTarget(bot) {
    const others = Session.alive().filter(p => p.id !== bot.id);
    if (!others.length) return null;
    const role = Session._clientRole(bot.id);
    const runoff = Session.state.finale.nameRound || 0;
    if (role === 'traitor') {
      // it points at the human, because the human is the one who can be
      // talked round, and because the other bot might be its own kind
      const human = others.find(p => !p.bot);
      const r = rngFor(0x7a1 ^ hash(bot.id), Session.state.finale.round);
      if (human && r() < 0.68) return human.id;
    }
    const runoffJitter = (target) => runoff
      ? rngFor(0x91e ^ hash(bot.id + '>' + target.id), runoff)() * 0.45 : 0;
    return others.slice().sort((a, b) =>
      (suspicion(bot.id, b.id) + runoffJitter(b))
      - (suspicion(bot.id, a.id) + runoffJitter(a)))[0].id;
  }

  /* ---------------- reacting ---------------- */

  function think() {
    const s = Session.state;
    if (!running || !s || s.phase !== 'finale') return;
    const f = s.finale;
    for (const bot of Session.alive()) {
      if (!bot.bot) continue;
      if (f.stage === 'decide' && !f.votes[bot.id]) {
        const id = bot.id;
        later(() => {
          const st = Session.state;
          if (!st || st.phase !== 'finale' || st.finale.stage !== 'decide') return;
          if (st.finale.votes[id]) return;
          Net.send({ type: 'vote', playerId: id, choice: decideChoice(bot) });
        });
      } else if (f.stage === 'name' && !f.names[bot.id]) {
        const id = bot.id;
        later(() => {
          const st = Session.state;
          if (!st || st.phase !== 'finale' || st.finale.stage !== 'name') return;
          if (st.finale.names[id]) return;
          const t = nameTarget(bot);
          if (t) Net.send({ type: 'name', playerId: id, targetId: t });
        }, 1100, 2600);
      }
    }
  }

  /* ---------------- the round table ----------------
     Returns an ordered script the scene plays. Lines are ids into
     ClaudiaLines.TABLE; the bots never speak prose of their own, so
     rewriting the show means editing one data file. */

  function tableScript() {
    const s = Session.state;
    if (!s) return [];
    const bots = s.players.filter(p => p.bot && p.alive);
    const you = s.players.find(p => p.local);
    const r = rngFor(0x7ab1e, 0);
    const out = [];
    const pool = (typeof ClaudiaLines !== 'undefined' && ClaudiaLines.TABLE)
      ? ClaudiaLines.TABLE.slice() : [];

    for (let round = 0; round < 2; round++) {
      for (const bot of bots) {
        if (!pool.length) break;
        const role = Session._clientRole(bot.id);
        // a traitor is likelier to reach for a line that points somewhere
        const wantAccuse = role === 'traitor' ? r() < 0.62 : r() < 0.34;
        const wanted = pool.filter(l => !!l.accuse === wantAccuse);
        const from = wanted.length ? wanted : pool;
        const line = from[Math.floor(r() * from.length)];
        pool.splice(pool.indexOf(line), 1);
        const others = s.players.filter(p => p.id !== bot.id && p.alive);
        const at = others[Math.floor(r() * others.length)] || you;
        out.push({ playerId: bot.id, speaker: bot.name, lineId: line.id,
                   text: line.text.replace(/\{name\}/g, at ? at.name : 'you') });
      }
    }
    return out;
  }

  /* ---------------- lifecycle ---------------- */

  function attach() {
    if (running) return;
    running = true;
    off = Net.on((e) => {
      if (e.type === 'state' || e.type === 'phase' || e.type === 'tally'
          || e.type === 'reveal' || e.type === 'vote') think();
    });
    think();
  }

  function detach() {
    running = false;
    clearTimers();
    if (off) { off(); off = null; }
  }

  return { attach, detach, tableScript,
           get running() { return running; } };
})();
