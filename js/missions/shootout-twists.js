/* ------------------------------------------------------------------
   shootout-twists.js — the hand you are dealt before a Shootout.

   Same idea as modifiers.js, and deliberately the same declarative
   shape, so the briefing screen can render either without knowing which
   game it is looking at:

     config  — merged over ShootoutMission.CONFIG
     tune    — merged over Bow.TUNE for this run
     cond    — forces a time of day and/or a weather
     fog     — scene fog distances
     flags   — behaviour the mission checks for by name
     payout  — multiplies everything you earn

   A card that only makes the run harder is a card nobody picks, so the
   payout has to be worth the pain — and one card here makes it *easier*
   and pays less, because having that choice is what makes the rest of
   them feel like choices.
------------------------------------------------------------------ */
const ShootoutTwists = (() => {

  const DECK = [
    {
      id: 'night', name: 'Night Watch', icon: '☾', payout: 1.30,
      blurb: 'Shoot it by moonlight. Everything worth hitting glows a little.',
      cond: { time: 'night' },
    },
    {
      id: 'mist', name: 'Ground Mist', icon: '≡', payout: 1.35,
      blurb: 'You will hear the wings before you see them.',
      cond: { weather: 'mist' },
    },
    {
      id: 'gale', name: 'Gale', icon: '≋', payout: 1.42,
      blurb: 'A cross-wind that shoves every arrow off line. Watch the trees.',
      cond: { weather: 'gale' },
    },
    {
      id: 'quiver', name: 'One Quiver', icon: '⇊', payout: 1.75,
      blurb: 'Sixteen arrows a round. A clean loose gets you two of them back.',
      flags: { quiver: 16, quiverPerClean: 2 },
    },
    {
      id: 'heavy', name: 'Heavy Bow', icon: '⌁', payout: 1.28,
      blurb: 'Slower to draw, but it hits like a falling tree and always pierces.',
      tune: { drawTime: 0.85, speedMax: 168, piercePerfect: 2 },
      flags: { alwaysPierce: true },
    },
    {
      id: 'iron', name: 'Iron String', icon: '⊘', payout: 1.45,
      blurb: 'No holding your breath. Whatever you can hit at full speed is what you get.',
      flags: { noFocus: true },
    },
    {
      id: 'twin', name: 'Twin Nock', icon: '⑂', payout: 1.34,
      blurb: 'Two arrows every loose, slightly apart. Misses cost you double.',
      flags: { twinShot: true, missPenalty: 2 },
    },
    {
      id: 'far', name: 'Long Range', icon: '⤢', payout: 1.55,
      blurb: 'Everything spawns half again as far out. Lead, or watch it fly off.',
      flags: { rangeScale: 1.55 },
    },
    {
      id: 'glass', name: 'Glass Arrows', icon: '✧', payout: 1.62,
      blurb: 'Only a clean loose does anything at all. Anything softer just falls.',
      flags: { cleanOnly: true },
    },
    {
      id: 'blind', name: 'Blind Draw', icon: '◍', payout: 1.38,
      blurb: 'The draw meter is gone. You will have to feel the half second.',
      flags: { hideDraw: true },
    },
    {
      id: 'sudden', name: 'Sudden Death', icon: '✸', payout: 2.10,
      blurb: 'Double money. One dove, or one round you fail to clear, and it is over.',
      flags: { suddenDeath: true },
    },
    {
      id: 'rich', name: 'Rich Quarry', icon: '✦', payout: 1.40,
      blurb: 'A gilded raven joins every round. Worth a great deal, and never still.',
      flags: { gildedEveryRound: true },
    },
    {
      id: 'swarm', name: 'Swarm', icon: '⁂', payout: 1.48,
      blurb: 'Half again as much quarry, arriving half again as fast.',
      config: { countScale: 1.5, intervalScale: 0.66 },
    },
    {
      id: 'poacher', name: "Poacher's Purse", icon: '£', payout: 1.22,
      blurb: 'Quarry pays double. A dove costs you three times as much.',
      config: { moneyScale: 2.0 },
      flags: { doveMult: 3 },
    },
    {
      id: 'steady', name: 'Steady Hand', icon: '⊙', payout: 0.88,
      blurb: 'A longer breath, a wider clean window, and quarry that flies straighter. '
           + 'Easier — and it pays like it.',
      tune: { perfectWindow: 0.2 },
      config: { breathMax: 5.2, speedScale: 0.85 },
    },
    {
      id: 'metronome', name: 'Metronome', icon: '⏱', payout: 1.44,
      blurb: 'The chain goes cold in two and a half seconds. Keep shooting.',
      config: { chainWindow: 2.5 },
    },
  ];

  const byId = (id) => DECK.find(m => m.id === id) || null;

  // three distinct cards, dealt from the run's own seed
  function draw(rng, n = 3) {
    const pool = DECK.slice();
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return out;
  }

  return { DECK, byId, draw };
})();
