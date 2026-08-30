/* ------------------------------------------------------------------
   coming-soon.js — placeholder entries so the mission series reads as
   a series. They also double as the worked example for adding a real
   mission: fill in `create()` with a class that implements
   build/start/update/dispose and drop `locked`.

   The round table used to be listed here. It is not a mission any more
   — it is a phase of a PLAY run, in `js/scenes/roundtable.js` — so it
   has gone. Anything left in this list is genuinely unbuilt.

   A PLAY run draws its two missions from whatever is registered and
   unlocked, so unlocking one here puts it into the rotation as well as
   onto the practice menu.
------------------------------------------------------------------ */
[
  {
    id: 'lighthouse-climb',
    name: 'Lighthouse Climb',
    tagline: 'Haul the lanterns. Beat the tide.',
    icon: '03',
    maxPrize: 18000,
    players: 'Solo',
    duration: '~3 min',
    order: 2,
  },
  {
    id: 'shield-wall',
    name: 'Shield Wall',
    tagline: 'Hold the line while the coins fall.',
    icon: '04',
    maxPrize: 22000,
    players: 'Squad',
    duration: '~4 min',
    order: 3,
  },
].forEach(def => Missions.register(Object.assign({
  locked: true,
  description: 'Not yet built.',
  create: () => { throw new Error(def.id + ' is not implemented yet'); },
}, def)));
