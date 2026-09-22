/* ------------------------------------------------------------------
   ski-twists.js — the descent's pre-run draft.

   Same declarative shape as `modifiers.js` and `dive-twists.js`: a card
   is a bag of overrides, not a lump of code, so the mission stays the
   only thing that knows how to ski and a new card is usually four lines.

     config  — absolute overrides merged over SkiMission.CONFIG
     tune    — merged over Skier.TUNE for this run
     cond    — forces the hour or the snow
     fog     — scene fog distances
     flags   — behaviour the mission checks for by name
     payout  — multiplies everything you earn

   Every card pulls on one of exactly four things, because those four
   are the whole mission: what the snow does under you, what the
   mountain is shaped like, what the clock allows, and what counts as
   money. A card that changed a fifth thing would be a card for a
   different game.

   Avalanche used to be in this deck. It was taken out of the draw;
   `SkiAvalanche` and the mission's `flags.avalanche` path are still
   there, dormant, and nothing deals the card any more.
------------------------------------------------------------------ */
const SkiTwists = (() => {

  const DECK = [
    {
      id: 'night', name: 'Night Run', icon: '☾', payout: 1.30,
      blurb: 'Moonlit snow, warm village lights and reflective route markers.',
      cond: { time: 'night' },
    },
    {
      id: 'whiteout', name: 'Whiteout', icon: '❅', payout: 1.52,
      blurb: 'Heavy snowfall softens the mountain. Read the bright route markers ahead.',
      cond: { snow: 'powder', flakes: 2.4 },
      fog: { near: 90, far: 480 },
    },
    {
      id: 'ice', name: 'Boilerplate', icon: '◇', payout: 1.42,
      blurb: 'Sheet ice, top to bottom. The fastest snow on the mountain, and '
           + 'it will not hold a single turn you ask it for.',
      cond: { snow: 'ice' },
    },
    {
      id: 'dump', name: 'Overnight Dump', icon: '☁', payout: 1.20,
      blurb: 'Half a metre of fresh. Everything lands soft, nothing '
           + 'accelerates, and the trees have got closer together.',
      cond: { snow: 'powder' },
      config: { treeScale: 1.45 },
    },
    {
      id: 'noedges', name: 'No Edges', icon: '○', payout: 1.44,
      blurb: 'Your check does nothing. Every corner has to be carved, or gone '
           + 'round the outside of.',
      flags: { noBrake: true },
    },
    {
      id: 'racestock', name: 'Race Stock', icon: '⟳', payout: 1.26,
      blurb: 'Shorter, twitchier skis. They come round quicker than you meant '
           + 'them to and they let go sooner.',
      tune: { turnRate: 2.15, grip: 4.7, scrub: 0.17 },
    },
    {
      id: 'tight', name: 'Tight Hoops', icon: '◎', payout: 1.52,
      blurb: 'Every hoop shrinks to two thirds. Nothing gets threaded by luck.',
      config: { hoopRadiusScale: 0.66 },
    },
    {
      id: 'glasscannon', name: 'Glass Cannon', icon: '✸', payout: 2.00,
      blurb: 'Double money. One crash and the run is over where you fell.',
      flags: { oneCrash: true },
    },
    {
      id: 'sendit', name: 'Send It', icon: '▲', payout: 1.36,
      blurb: 'Every kicker on this mountain has been built half again as big, '
           + 'and pushes half again as hard. So has everything that follows.',
      config: { rampScale: 1.55, rampBoost: 1.35 },
      flags: { bigAir: true },
    },
    {
      id: 'park', name: 'Terrain Park', icon: '⧗', payout: 1.34,
      blurb: 'Extra kickers join the pink rail lines. Keep the chain alive between features.',
      config: { rampSpacing: 34, padSpacing: 20,
                spinnerSpacing: 130, rampBoost: 1.25, treeScale: 0.5 },
    },
    {
      id: 'groomed', name: 'Cat Track', icon: '▬', payout: 1.24,
      blurb: 'One gentle roller, quiet carving faces and unboosted rails. Carry your own speed.',
      config: { rampSpacing: 210, rampBoost: 0, padSpacing: 0,
                spinnerScale: 0 },
    },
    {
      id: 'bounty', name: 'Poacher’s Bounty', icon: '✦', payout: 1.38,
      blurb: 'The shortcuts pay three times over. The groomed run barely pays '
           + 'at all.',
      config: { moneyPerMetre: 0.62 },
      flags: { chuteBounty: 3 },
    },
    {
      id: 'lastlift', name: 'Last Lift', icon: '⏱', payout: 1.32,
      blurb: 'Thirty seconds less on the clock, and every hoop buys more of it '
           + 'back. Nobody is waiting at the bottom.',
      config: { startTime: 66, timePerHoop: 7.4 },
    },
    {
      id: 'treeline', name: 'Below the Treeline', icon: '⋀', payout: 1.46,
      blurb: 'Twice the wood, and it is standing in the run rather than beside '
           + 'it. Threading it pays double.',
      config: { treeScale: 2.2, grazeMoney: 240 },
    },
    {
      id: 'thinair', name: 'Thin Air', icon: '↑', payout: 1.28,
      blurb: 'The meter bleeds twice as fast. There is no coasting on this '
           + 'run — only working, or falling down the ladder.',
      config: { flowDecay: 0.19 },
    },
    {
      id: 'purse', name: 'Purse Strings', icon: '£', payout: 1.00,
      blurb: 'The descent pays almost nothing. The finish pays five times over '
           + '— if you are still on your feet when you reach it.',
      config: { moneyPerMetre: 0.30, finishBonus: 16000 },
      flags: { allOrNothing: true },
    },
  ];

  const byId = (id) => DECK.find(m => m.id === id) || null;

  // three distinct cards, dealt from the run's own seed, so a shared
  // seed deals a shared hand
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
