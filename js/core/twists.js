/* ------------------------------------------------------------------
   twists.js — the day the rules change.

   From the second day on, about every other day, Claudia opens the day
   with a twist: one rule that holds until tomorrow. Each is drawn from
   the run seed, so a shared seed is a shared game, and each comes up at
   most once a game, never two days running, and never on the day of the
   last table (the fire has rules enough).

   All of them are public, and Claudia says them out loud — the room
   plays round them. The one with a secret in it, `clue`, keeps the
   secret where every secret in this game lives: the session's `secret`,
   reaching its one owner through `privateView`. This file only knows
   the rules' names and words; `session.js` enforces them.

     sealed    the slates are never read out: only the count is told
     veiled    the banished leave without saying what they were
     heavy     the day's shield holder's slate counts twice
     clue      one Faithful is told one name that is not a Traitor
     noShield  nobody wins the shield today
     blackout  the castle's lights fail when the bell goes
------------------------------------------------------------------ */
const Twists = (() => {

  const DECK = ['sealed', 'veiled', 'heavy', 'clue', 'noShield', 'blackout'];
  const CHANCE = 0.5;

  /* What the day card says (interlude.js), and the one line the AI
     players are given about it. */
  const INFO = {
    sealed:   { card: 'Sealed slates: tonight’s votes are never read out',
                ai: 'TODAY\'S TWIST — SEALED SLATES: at the round table nobody\'s slate is read out; Claudia only says how many votes each name got. Nobody will ever know who voted for whom today.' },
    veiled:   { card: 'Veiled: the banished leave without a word',
                ai: 'TODAY\'S TWIST — VEILED: whoever is banished today leaves without saying whether they were a Traitor or a Faithful. The room will not find out until the end.' },
    heavy:    { card: 'Heavy slate: the shield holder’s vote counts twice',
                ai: 'TODAY\'S TWIST — HEAVY SLATE: whoever wins the shield today (most jobs at the bell) has a vote that counts twice at the round table.' },
    clue:     { card: 'A word in the ear: one Faithful knows a safe name',
                ai: 'TODAY\'S TWIST — A WORD IN THE EAR: Claudia has privately told one Faithful the name of somebody who is NOT a Traitor. Nobody knows which Faithful.' },
    noShield: { card: 'No shield today: nobody is safe tonight',
                ai: 'TODAY\'S TWIST — NO SHIELD: nobody wins the shield today, however many jobs they do. Anybody can be poisoned.' },
    blackout: { card: 'Blackout: the lights fail at the bell',
                ai: 'TODAY\'S TWIST — BLACKOUT: when the bell rings the castle\'s lights fail, and the last half-minute is played in the dark.' },
  };

  function hash(seed, day, salt) {
    let h = Math.imul(((seed | 0) ^ 0x7417) >>> 0, 0x85ebca6b) ^ Math.imul((day | 0) + 1, 0xc2b2ae35) ^ salt;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  /* Today's twist, or null. `ctx`: { used: [ids], yesterday: id|null,
     last: bool (this day ends at the last table) }. Only public things
     go in, so the choice can tell nobody anything. */
  function pick(seed, day, ctx = {}) {
    if ((day | 0) < 1 || ctx.last || ctx.yesterday) return null;
    if (hash(seed, day, 0x1) >= CHANCE) return null;
    const used = new Set(ctx.used || []);
    const open = DECK.filter(id => !used.has(id));
    if (!open.length) return null;
    return open[Math.floor(hash(seed, day, 0x2) * open.length) % open.length];
  }

  const has = (s, id) => !!(s && s.twist && s.twist.day === s.day && s.twist.id === id);
  const today = (s) => (s && s.twist && s.twist.day === s.day ? s.twist.id : null);
  const cardLine = (s) => { const id = today(s); return id ? INFO[id].card : null; };
  const aiLine = (s) => { const id = today(s); return id ? INFO[id].ai : null; };

  return { DECK, INFO, CHANCE, pick, has, today, cardLine, aiLine };
})();
