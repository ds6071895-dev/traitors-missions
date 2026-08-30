/* ------------------------------------------------------------------
   modifiers.js — the pre-race draft.

   Before a run you are dealt three of these and keep one. They are
   deliberately *declarative*: a modifier is a bag of overrides, not a
   lump of code, so the mission stays the only thing that knows how to
   race and a new modifier is usually four lines.

     config  — absolute overrides merged over the mission's CONFIG
     tune    — merged over Boat.TUNE for this run
     cond    — forces a time of day (the sea is no longer a card: every
               race is run on a storm sea, so there is nothing to draw)
     fog     — scene fog distances
     flags   — behaviour the mission checks for by name
     payout  — multiplies everything you earn

   Payouts are the whole point: a modifier has to be worth the pain.
------------------------------------------------------------------ */
const Modifiers = (() => {

  const DECK = [
    {
      id: 'night', name: 'Night Run', icon: '☾', payout: 1.30,
      blurb: 'Race it by moonlight. The rings are the only thing you can see clearly.',
      cond: { time: 'night' },
    },
    {
      id: 'fog', name: 'Fog Bank', icon: '≡', payout: 1.40,
      blurb: 'You will see the next gate about a second before you have to commit.',
      fog: { near: 60, far: 620 }, waterFog: { near: 40, far: 560 },
    },
    {
      id: 'riptide', name: 'Riptide', icon: '⇄', payout: 1.25,
      blurb: 'A cross-current shoves you at the wall the whole way down.',
      flags: { riptide: 5.5 },
    },
    {
      id: 'glasscannon', name: 'Glass Cannon', icon: '✸', payout: 2.00,
      blurb: 'Double money. One hard crash and the run is over.',
      flags: { oneCrash: true },
    },
    {
      id: 'noboost', name: 'Cold Engine', icon: '○', payout: 1.35,
      blurb: 'No boost. Every metre of speed has to come off a wave.',
      flags: { noBoost: true },
    },
    {
      id: 'hairtrigger', name: 'Hair Trigger', icon: '⟳', payout: 1.20,
      blurb: 'A twitchier, looser hull. Quicker through the gates, harder to hold.',
      tune: { turnRate: 2.35, gripLambda: 2.1 },
    },
    {
      id: 'tight', name: 'Tight Rings', icon: '◎', payout: 1.50,
      blurb: 'Every ring shrinks to two-thirds. Perfects get much harder to fluke.',
      config: { hoopRadiusScale: 0.68 },
    },
    {
      id: 'shrink', name: 'Closing In', icon: '◈', payout: 1.55,
      blurb: 'The rings shrink as your chain grows. Greed has a price.',
      flags: { shrinkRings: true },
    },
    {
      id: 'rush', name: 'Rush', icon: '⏱', payout: 1.30,
      blurb: 'Twenty-five seconds less on the clock, and rings give more back.',
      config: { startTime: 54, timePerHoop: 9.2 },
    },
    {
      id: 'slalom', name: 'Slalom', icon: '▲', payout: 1.30,
      blurb: 'Twice the rock in the water. Pick your line early.',
      config: { rockCount: 150 },
    },
    {
      id: 'feather', name: 'Featherweight', icon: '↑', payout: 1.20,
      blurb: 'A hull that barely wants to stay wet. Everything is a launch ramp.',
      tune: { launchSurf: 0.85, gravity: 11.5, minLaunchVy: 2.0 },
    },
    {
      id: 'highstakes', name: 'High Stakes', icon: '£', payout: 1.00,
      blurb: 'Rings pay double, but the multiplier caps low and a DNF pays nothing.',
      config: { moneyScale: 2.2, maxCombo: 6 },
      flags: { allOrNothing: true },
    },
    {
      id: 'purse', name: 'Purse Strings', icon: '⚑', payout: 1.00,
      blurb: 'Rings barely pay. The finish line pays four times over.',
      config: { moneyScale: 0.45, finishBonus: 10000 },
    },
    {
      id: 'bonushunt', name: 'Bonus Hunt', icon: '✦', payout: 1.45,
      blurb: 'Every gate gets a gold ring tucked against the rocks.',
      flags: { allRisk: true },
    },
  ];

  const byId = (id) => DECK.find(m => m.id === id) || null;

  // three distinct cards, dealt from the run's own seed so a shared seed
  // deals a shared hand
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
