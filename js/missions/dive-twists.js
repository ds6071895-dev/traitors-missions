/* ------------------------------------------------------------------
   dive-twists.js — the dive's pre-run draft.

   Same declarative shape as `modifiers.js`: a card is a bag of
   overrides, not a lump of code, so the mission stays the only thing
   that knows how to swim and a new card is usually four lines.

     config  — absolute overrides merged over DiveMission.CONFIG
     tune    — merged over Swimmer.TUNE for this run
     cond    — forces the water (visibility, current)
     flags   — behaviour the mission checks for by name
     payout  — multiplies everything you earn

   The dive's cards all pull on the same three things — how long your
   breath lasts, how fast you can move it about, and what counts as
   money — because those are the three numbers the whole mission is
   made of. A card that changed something else would be changing a
   different game.
------------------------------------------------------------------ */
const DiveTwists = (() => {

  const DECK = [
    {
      id: 'cold', name: 'Cold Water', icon: '❄', payout: 1.40,
      blurb: 'Four degrees. Your breath goes half again as fast and the trench '
           + 'stops being a round trip.',
      tune: { airDrain: 0.026 },
    },
    {
      id: 'weightbelt', name: 'Weight Belt', icon: '⚓', payout: 1.35,
      blurb: 'Lead on your hips. You fall to the bottom like a stone and you '
           + 'climb back out like a man carrying one.',
      // the real thing rather than a thrust tweak: negative buoyancy is
      // what "sink fast, rise slow" actually is
      tune: { buoyancy: -1.6, sinkFrom: 6, vertBias: 0.68, kickAccel: 31 },
    },
    {
      id: 'salvagerights', name: 'Salvage Rights', icon: '§', payout: 1.60,
      blurb: 'Only the deepest chest of each trip is legally yours. Everything '
           + 'else in your hands is somebody’s paperwork.',
      flags: { deepestOnly: true },
    },
    {
      id: 'neap', name: 'Neap Tide', icon: '☾', payout: 1.30,
      blurb: 'The water has dropped. Every tier is shallower and the trench '
           + 'pays double for being reachable at all.',
      config: {
        tiers: [
          { id: 'shelf',  top:   0, bottom: -16, chests: 12, value:  330,
            colour: '#ffd166', name: 'Shelf' },
          { id: 'wreck',  top: -16, bottom: -34, chests:  9, value: 1300,
            colour: '#ff9f4a', name: 'Wreck' },
          { id: 'trench', top: -34, bottom: -60, chests:  4, value: 10400,
            colour: '#39e6ff', name: 'Trench' },
        ],
      },
    },
    {
      id: 'buddyline', name: 'Buddy Line', icon: '∞', payout: 1.25,
      blurb: 'You are roped to whoever is nearest. Inside five metres you '
           + 'breathe off the same bar — and out of range you are on your own.',
      flags: { sharedAir: 5 },
    },
    {
      id: 'freediver', name: 'Freediver', icon: '○', payout: 0.95,
      blurb: 'No beat, no chain, no rhythm to keep. Just you, the water and '
           + 'the bar — and it pays a little less, because it asks a little less.',
      flags: { noBeat: true },
      cond: { water: 'gin' },
    },
    {
      id: 'shoal', name: 'Shoal', icon: '≈', payout: 1.30,
      blurb: 'The wreck is thick with fish. They break your line, they hide '
           + 'the glow, and they scatter when somebody else swims through.',
      flags: { shoal: true },
      cond: { water: 'plankton' },
    },
    {
      id: 'spring', name: 'Spring Tide', icon: '⇉', payout: 1.45,
      blurb: 'Two minutes ten instead of three minutes, and a kick with real '
           + 'weight behind it. Everything happens faster, including drowning.',
      config: { runTime: 130 },
      tune: { kickAccel: 40 },
      cond: { water: 'spring' },
    },
    {
      id: 'hoard', name: 'The Hoard', icon: '◈', payout: 1.30,
      blurb: 'Six chests will fit in your hands. Whether six chests will fit '
           + 'back up to the surface is a different question.',
      config: { carryMax: 6 },
      tune: { carryDrain: 0.22, carryBuoy: -0.40 },
    },
    /* The three cards the caves and the sharks brought with them. They
       pull on the same three things every other card does — how long
       your breath lasts, how fast you can move it about, and what
       counts as money — because the animals and the roof are only ever
       a tax on the first two. */
    {
      id: 'bloodwater', name: 'Blood in the Water', icon: '⌁', payout: 1.55,
      blurb: 'Six of them, and they are hungry. Everything you take makes more '
           + 'noise than it is worth — right up until you land it.',
      config: { sharks: 6 },
    },
    {
      id: 'spelunker', name: 'Spelunker', icon: '⌂', payout: 1.34,
      blurb: 'The caves are full and they refill fast. Nothing else about them '
           + 'has changed, including the part with no up in it.',
      config: {
        cave: { chests: 9, value: 11500, colour: '#c77dff', respawn: 16, name: 'Cave' },
      },
      cond: { water: 'gin' },
    },
    {
      id: 'slack', name: 'Slack Water', icon: '·', payout: 0.88,
      blurb: 'Nothing in the loch but you and the fish. It is the prettiest dive '
           + 'in the deck and it is the one that pays the least.',
      flags: { noSharks: true },
      cond: { water: 'glassoff' },
    },
    {
      id: 'silt', name: 'Silt Out', icon: '≡', payout: 1.38,
      blurb: 'Runoff off the hills. You will be on top of the trench before '
           + 'you see it, and the glow is the only thing you can navigate by.',
      cond: { water: 'runoff' },
    },
  ];

  const byId = (id) => DECK.find(m => m.id === id) || null;

  // three distinct cards, dealt from the run's own seed so a shared
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
