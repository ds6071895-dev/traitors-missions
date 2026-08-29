/* ------------------------------------------------------------------
   coming-soon.js — placeholder entries so the mission series reads as
   a series. They also double as the worked example for adding a real
   mission: fill in `create()` with a class that implements
   build/start/update/dispose and drop `locked`.
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
  {
    id: 'round-table',
    name: 'The Round Table',
    tagline: 'Somebody at this table is lying.',
    icon: '05',
    maxPrize: 0,
    players: 'All',
    duration: 'Nightly',
    order: 4,
  },
].forEach(def => Missions.register(Object.assign({
  locked: true,
  description: 'Not yet built.',
  create: () => { throw new Error(def.id + ' is not implemented yet'); },
}, def)));
