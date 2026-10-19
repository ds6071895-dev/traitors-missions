/* ------------------------------------------------------------------
   chores.js — the jobs round the castle, as data.

   The day is spent doing things for the pot, the way a crew in a
   spaceship game fixes the ship: little two-to-ten-second puzzles at
   fixed places round the house, each one worth a little money. They
   are not the point. The point is that they send people to different
   rooms, at different times, in ones and twos — which is what makes a
   murder in plain sight possible, and what gives everybody something
   to have been seen doing.

   This file is only the catalogue and the dealing, and it is pure: the
   host's session deals from it with the night's seed, and the scenes
   read it to draw the stations and open the right puzzle. The puzzles
   themselves are in `scenes/chore-games.js`.

   Stations are in castle-local metres (see `castle-layout.js`). The
   scene nudges each one to the nearest clear floor, so a station that
   lands a hand inside a sideboard still works.

   Two kinds of job:

     a station   go there, solve the puzzle, paid
     a letter    hand a sealed letter to somebody — hold the key next
                 to them for a couple of seconds. It looks exactly like
                 the Traitor's poison going into a pocket, which is the
                 whole reason it exists: a hand-over somebody saw is a
                 lead, not proof.
------------------------------------------------------------------ */
const Chores = (() => {

  const VALUE = 500;               // into the pot, per job done
  const HOLD = 2.4;                // seconds a hand-over takes, letter or poison
  const REACH = 2.0;               // metres: close enough to hand somebody something

  /* What the puzzles are called, the verb on the prompt, and how to do
     one: `how` is a sentence for anybody, finger or mouse, and `keys`
     is the shortcut a keyboard gets on top. `goal` is the two or three
     words stamped on the panel as it opens, so the job is understood
     before the how is read; `secs` is how long an AI player takes over
     it. Every type plays differently; a day's list never repeats one if
     it can help it. */
  const TYPES = {
    safe:    { title: 'Crack the portrait safe',   verb: 'Crack the safe', goal: 'Open the safe', secs: [5, 8],
               how: 'A four-digit code flashes on the note. Remember it, then tap it in. ↺ shows it again.',
               keys: 'Number keys, Enter' },
    wires:   { title: 'Rewire the chandelier',     verb: 'Rewire it', goal: 'Join 4 wires', secs: [4.5, 7.5],
               how: 'Drag from a wire end on the left to the same colour on the right. Join all four.' },
    candles: { title: 'Light the candelabra',      verb: 'Light the candles', goal: 'Light in order', secs: [4, 7],
               how: 'Tap the candles in number order, 1 to 6. A wrong one blows them all out.' },
    pour:    { title: 'Pour a dram for the laird', verb: 'Pour the dram', goal: 'Stop on green', secs: [3.5, 6],
               how: 'Hold POUR to fill the glass. Let go while the whisky is inside the green band.',
               keys: 'Hold Space' },
    bells:   { title: 'Ring the bells in order',   verb: 'Ring the bells', goal: 'Copy 2 tunes', secs: [6, 9],
               how: 'Watch the bells ring a tune, then tap them back in the same order. Two tunes.' },
    letters: { title: 'Sort the post by its seal', verb: 'Sort the post', goal: 'Post 6 letters', secs: [5, 8],
               how: 'Tap a letter, then the pigeonhole with the same colour seal. Post them all.' },
    tartan:  { title: 'Find the clan tartan',      verb: 'Match the tartan', goal: 'Match 3 tartans', secs: [4.5, 7.5],
               how: 'Tap the pattern that matches the one at the top exactly. Three in a row.' },
    tune:    { title: 'Tune the clàrsach',         verb: 'Tune the harp', goal: 'Match the wave', secs: [4, 7],
               how: 'Drag the peg until the gold wave sits on the faint one, then hold it still.' },
    bats:    { title: 'Shoo the bats from the rafters', verb: 'Shoo the bats', goal: 'Shoo every bat', secs: [4, 7],
               how: 'Tap every bat as it swoops past to chase it out of the window.' },
    lock:    { title: 'Pick the old lock',         verb: 'Pick the lock', goal: 'Set 3 pins', secs: [4.5, 7.5],
               how: 'Tap SET when the white pick is inside the gold. Three pins, each one faster.',
               keys: 'Space' },
    bellows: { title: 'Work the bellows',          verb: 'Stoke the fire', goal: 'Pump 4 times', secs: [4, 6.5],
               how: 'Tap PUMP each time the glow swells out to the ring. Four good pumps.',
               keys: 'Space' },
    brew:    { title: 'Brew the laird’s tonic',    verb: 'Brew the tonic', goal: 'Follow the recipe', secs: [5, 8],
               how: 'Tap the ingredients in the order on the recipe. A wrong one spoils the pot.' },
    pairs:   { title: 'Set the place cards',       verb: 'Set the table', goal: 'Find 3 pairs', secs: [5, 8],
               how: 'Remember the crests, then tap two cards at a time to find the three matching pairs.' },
    frames:  { title: 'Straighten the portraits',  verb: 'Straighten them', goal: 'Level 3 portraits', secs: [4, 7],
               how: 'Tap ⟲ or ⟳ under each crooked portrait until it hangs level.' },
    spot:    { title: 'Spot the forgery',          verb: 'Find the fakes', goal: 'Find 3 differences', secs: [6, 10],
               how: 'Compare the two paintings. Tap the three things on the right one that are different.' },
    bottles: { title: 'Rack the claret',           verb: 'Rack the wine', goal: 'Oldest to newest', secs: [5, 9],
               how: 'Tap two bottles to swap them. Put the years in order, oldest on the left.' },
    mouse:   { title: 'Catch the kitchen mouse',   verb: 'Catch the mouse', goal: 'Catch it 5×', secs: [4, 7],
               how: 'The mouse pops out of a hole. Tap it before it hides again. Five catches.' },
    pipes:   { title: 'Fix the cistern pipes',     verb: 'Fix the pipes', goal: 'Tap to tank', secs: [6, 10],
               how: 'Tap a pipe to turn it. Make one path from the tap on the left to the tank on the right.' },
    scales:  { title: 'Balance the laird’s scales', verb: 'Balance them', goal: 'Make it level', secs: [4, 8],
               how: 'Tap weights onto the right pan until it matches the gold one. Tap a weight again to take it off.' },
    window:  { title: 'Clean the window',          verb: 'Clean it', goal: 'Wipe it clean', secs: [4, 7],
               how: 'Rub the glass with your finger or mouse until you can see the loch.' },
  };

  /* Things to fetch and carry: pick it up in one room, put it down in
     another. They send people across the house on errands, which is
     the best alibi there is — and the best excuse to be somewhere. */
  const ITEMS = ['the decanter', 'a basket of logs', 'the laird’s ledger', 'a silver candelabrum',
                 'the bagpipes', 'a stack of tartan blankets', 'the old map', 'a tray of oatcakes',
                 'the laird’s sword', 'a crate of claret', 'the guest book', 'a storm lantern'];

  /* Where they are, all over the house. Rooms off the beaten track —
     the turret, the chapel, the study, the bedrooms, anywhere with a
     door that shuts — are deliberate: a job that takes you somewhere
     quiet is a job that might get you killed. */
  const STATIONS = [
    { id: 'hall-desk',       room: 'hall',          x: -5.6, z: 16.4, type: 'letters', label: 'the porter’s desk' },
    { id: 'hall-clock',      room: 'hall',          x: -5.8, z: 6.0,  type: 'bells',   label: 'the long-case clock' },
    { id: 'hall-hearth',     room: 'hall',          x: 4.6,  z: 9.4,  type: 'bellows', label: 'the hall fire' },
    { id: 'passage-armour',  room: 'west-passage',  x: -8.5, z: 9.7,  type: 'tartan',  label: 'the suit of armour' },
    { id: 'great-harp',      room: 'great',         x: -11.2, z: 18.6, type: 'tune',   label: 'the harp' },
    { id: 'great-hearth',    room: 'great',         x: -19.4, z: 5.6,  type: 'candles', label: 'the great hearth' },
    { id: 'great-table',     room: 'great',         x: -13.6, z: 9.0, type: 'pairs',   label: 'the long table' },
    { id: 'round-chart',     room: 'round',         x: -5.4, z: -10.2, type: 'wires',  label: 'the chandelier winch' },
    { id: 'round-cabinet',   room: 'round',         x: 5.4,  z: -10.2, type: 'safe',   label: 'the strong cabinet' },
    { id: 'round-scales',    room: 'round',         x: -3.2, z: -12.2, type: 'scales', label: 'the factor’s scales' },
    { id: 'turret-bell',     room: 'turret',        x: -2.2, z: -24.4, type: 'bells',  label: 'the turret bell' },
    { id: 'turret-desk',     room: 'turret',        x: 2.2,  z: -24.4, type: 'candles', label: 'the conspirators’ desk' },
    { id: 'turret-brew',     room: 'turret',        x: 0.0,  z: -25.6, type: 'brew',   label: 'the still' },
    { id: 'corridor-linen',  room: 'corridor',      x: 24.6, z: 13.5, type: 'letters', label: 'the linen press' },
    { id: 'corridor-lamp',   room: 'corridor',      x: 15.0, z: 12.6, type: 'wires',   label: 'the corridor lamps' },
    { id: 'corridor-portraits', room: 'corridor',   x: 20.5, z: 12.6, type: 'frames',  label: 'the corridor portraits' },
    // the west wing
    { id: 'library-safe',    room: 'library',       x: -20.9, z: -8.2, type: 'safe',   label: 'the safe behind the shelves' },
    { id: 'chapel-belfry',   room: 'chapel',        x: -28.6, z: -10.6, type: 'bats',  label: 'the chapel belfry' },
    { id: 'kitchen-rack',    room: 'kitchen',       x: -31.3, z: -0.4, type: 'bottles', label: 'the kitchen wine rack' },
    { id: 'kitchen-larder',  room: 'kitchen',       x: -32.6, z: -12.9, type: 'mouse',  label: 'the larder' },
    { id: 'scullery-pipes',  room: 'scullery',      x: -38.6, z: -20.6, type: 'pipes',  label: 'the scullery pipes' },
    // the east wing
    { id: 'gallery-portraits', room: 'gallery',     x: 18.0, z: -7.0, type: 'frames',  label: 'the long gallery' },
    { id: 'gallery-twins',   room: 'gallery',       x: 26.6, z: -7.0, type: 'spot',    label: 'the twin paintings' },
    { id: 'billiard-decanters', room: 'billiard',   x: 25.4, z: -9.8, type: 'bottles', label: 'the decanters' },
    { id: 'drawing-tea',     room: 'drawing',       x: 34.0, z: -12.9, type: 'pour',   label: 'the tea tray' },
    { id: 'study-bureau',    room: 'study',         x: 43.9, z: -6.0, type: 'lock',    label: 'the laird’s bureau' },
    { id: 'gun-cabinet',     room: 'gun',           x: 38.6, z: 1.2,  type: 'lock',    label: 'the gun cabinet' },
    { id: 'conservatory-vines', room: 'conservatory', x: 40.2, z: 18.2, type: 'bats',  label: 'the vine-house roof' },
    /* A second job in every corner, so there is always one a few steps
       away and the day is spent working, not walking. */
    { id: 'hall-console',    room: 'hall',          x: 4.3,  z: 16.3, type: 'candles', label: 'the console table' },
    { id: 'hall-armour',     room: 'hall',          x: -2.2, z: 5.8,  type: 'lock',    label: 'the armour’s gauntlet' },
    { id: 'great-sideboard', room: 'great',         x: -16.0, z: -0.6, type: 'pour',   label: 'the high table sideboard' },
    { id: 'great-landscape', room: 'great',         x: -16.0, z: 18.8, type: 'frames', label: 'the great landscape' },
    { id: 'great-silver',    room: 'great',         x: -11.6, z: 14.4, type: 'bottles', label: 'the silver sideboard' },
    { id: 'round-banners',   room: 'round',         x: 4.5,  z: -1.8, type: 'tartan',  label: 'the clan banners' },
    { id: 'turret-cloaks',   room: 'turret',        x: -2.9, z: -20.5, type: 'pairs',  label: 'the cloak pegs' },
    { id: 'corridor-press',  room: 'corridor',      x: 9.5,  z: 14.4, type: 'lock',    label: 'the locked press' },
    { id: 'corridor-window', room: 'corridor',      x: 27.0, z: 14.3, type: 'window',  label: 'the corridor window' },
    { id: 'library-globe',   room: 'library',       x: -12.2, z: -7.4, type: 'spot',   label: 'the old map' },
    { id: 'library-tables',  room: 'library',       x: -20.0, z: -4.3, type: 'letters', label: 'the reading tables' },
    { id: 'chapel-altar',    room: 'chapel',        x: -25.0, z: -19.0, type: 'candles', label: 'the altar' },
    { id: 'chapel-harmonium', room: 'chapel',       x: -25.0, z: -12.6, type: 'tune',  label: 'the harmonium' },
    { id: 'kitchen-hearth',  room: 'kitchen',       x: -40.2, z: -5.75, type: 'bellows', label: 'the roasting hearth' },
    { id: 'kitchen-table',   room: 'kitchen',       x: -34.0, z: -5.75, type: 'brew',  label: 'the kitchen table' },
    { id: 'kitchen-dresser', room: 'kitchen',       x: -31.0, z: -11.2, type: 'pairs', label: 'the plate dresser' },
    { id: 'scullery-window', room: 'scullery',      x: -40.4, z: -16.6, type: 'window', label: 'the scullery window' },
    { id: 'gallery-armour',  room: 'gallery',       x: 38.2, z: -5.0, type: 'tartan',  label: 'the gallery armour' },
    { id: 'gallery-seat',    room: 'gallery',       x: 32.3, z: -3.7, type: 'window',  label: 'the window seat' },
    { id: 'billiard-table',  room: 'billiard',      x: 22.0, z: -15.2, type: 'scales', label: 'the billiard table' },
    { id: 'billiard-cues',   room: 'billiard',      x: 17.2, z: -12.5, type: 'spot',   label: 'the cue rack' },
    { id: 'drawing-piano',   room: 'drawing',       x: 31.2, z: -11.6, type: 'tune',   label: 'the grand piano' },
    { id: 'drawing-fire',    room: 'drawing',       x: 34.0, z: -16.3, type: 'bellows', label: 'the drawing-room fire' },
    { id: 'study-shelves',   room: 'study',         x: 46.6, z: -9.8,  type: 'letters', label: 'the study shelves' },
    { id: 'study-strongbox', room: 'study',         x: 44.0, z: -1.0, type: 'safe',    label: 'the strongbox' },
    { id: 'gun-map',         room: 'gun',           x: 34.0, z: 4.4,  type: 'spot',    label: 'the map table' },
    { id: 'conservatory-fountain', room: 'conservatory', x: 36.0, z: 11.4, type: 'pipes', label: 'the fountain' },
    { id: 'conservatory-palms', room: 'conservatory', x: 32.6, z: 9.6, type: 'pour',   label: 'the palms' },
  ];
  for (let k = 0; k < 8; k++) {
    const north = k < 4, i = k % 4, x0 = 8 + 4 * i;
    STATIONS.push({ id: 'bed' + k + '-trunk', room: 'bed' + k, x: x0 + 1.2, z: north ? 10.9 : 16.1,
                    type: 'tartan', label: 'the trunk at the foot of the bed', bed: k });
    STATIONS.push({ id: 'bed' + k + '-window', room: 'bed' + k, x: x0 + 3, z: north ? 8.7 : 18.3,
                    type: 'window', label: 'the bedroom window', bed: k });
    STATIONS.push({ id: 'bed' + k + '-wardrobe', room: 'bed' + k, x: x0 + 2.75, z: north ? 10.4 : 16.6,
                    type: 'lock', label: 'the wardrobe', bed: k });
    STATIONS.push({ id: 'bed' + k + '-portrait', room: 'bed' + k, x: x0 + 0.7, z: north ? 11.1 : 15.9,
                    type: 'frames', label: 'the bedroom portrait', bed: k });
  }

  const ROOM_NAMES = {
    hall: 'the Entrance Hall', 'west-passage': 'the West Passage', great: 'the Great Hall',
    'north-passage': 'the North Passage', round: 'the Round Table Chamber', stair: 'the Turret Stair',
    turret: 'the Turret', corridor: 'the Bedroom Corridor',
    library: 'the Library', chapel: 'the Chapel', kitchen: 'the Kitchen', scullery: 'the Scullery',
    'west-link': 'the Library Passage', 'east-link': 'the Gallery Passage', gallery: 'the Long Gallery',
    billiard: 'the Billiard Room', drawing: 'the Drawing Room', study: 'the Laird’s Study',
    gun: 'the Gun Room', conservatory: 'the Conservatory',
  };
  const roomName = (id) => ROOM_NAMES[id] || (/^bed\d$/.test(id || '') ? 'a bedroom' : 'the castle');

  const station = (id) => STATIONS.find(s => s.id === id) || null;

  const shuffle = (rng, arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const poolFor = (player) => STATIONS.filter(s => s.bed === undefined || s.bed === player.seat % 8);

  /* `n` stations of as many different kinds as the deck allows, none
     of them in `avoid`. After the first, each is one of the nearest few
     to the one before (or to `from`), in the next room along where it
     can be, so a list is a round of one part of the house rather than a
     march from wing to wing. */
  const NEAREST = 8;
  function pickStations(rng, player, n, avoid, wantQuiet, from) {
    const pool = poolFor(player).filter(s => !avoid.has(s.id));
    const picked = [];
    const usedTypes = new Set();
    const take = (s) => { picked.push(s); usedTypes.add(s.type); };
    if (wantQuiet) {
      const quiet = pool.filter(s => (typeof CastleLayout !== 'undefined' && (CastleLayout.byId(s.room) || {}).quiet)
                                     || s.room === 'turret' || s.bed !== undefined);
      if (quiet.length) take(quiet[rng.int(0, quiet.length - 1)]);
    }
    const shuffled = shuffle(rng, pool);
    while (picked.length < n) {
      const last = picked.length ? picked[picked.length - 1] : from;
      let left = shuffled.filter(s => !picked.includes(s));
      if (!left.length) break;
      if (last) {
        left = left.map(s => [Math.hypot(s.x - last.x, s.z - last.z) + rng() * 4, s])
          .sort((a, b) => a[0] - b[0]).map(e => e[1]).slice(0, NEAREST);
      }
      // next door rather than the same room: a list still moves you about
      take(left.find(s => !usedTypes.has(s.type) && (!last || s.room !== last.room))
        || left.find(s => !usedTypes.has(s.type)) || left[0]);
    }
    return picked;
  }

  /* An errand crosses the house, but not the whole of it: the far end
     is another room within a short walk, not the other wing. */
  const ERRAND = 24;
  function carry(rng, player, id, avoid) {
    const pool = shuffle(rng, poolFor(player).filter(s => !avoid.has(s.id)));
    const from = pool[0];
    const to = pool.find(s => s.room !== from.room && Math.hypot(s.x - from.x, s.z - from.z) <= ERRAND)
      || pool.find(s => s.room !== from.room) || pool[1];
    return { id, kind: 'carry', from: from.id, to: to.id, item: ITEMS[rng.int(0, ITEMS.length - 1)],
             step: 0, done: false };
  }

  /* One player's list for one day. Four puzzles, every one of a
     different kind where the deck allows and at least one of them in a
     quiet room, never somebody else's bedroom; an errand that carries
     something across the house; and, for about half of the room, a
     letter for somebody. A Traitor's list looks exactly like anybody's,
     because it is drawn exactly like anybody's. */
  function deal(rng, player, others, opts = {}) {
    const n = opts.count || 4;
    const picked = pickStations(rng, player, n, new Set(), true);
    const list = picked.map((s, i) => ({ id: 'c' + i, kind: 'station', station: s.id, type: s.type,
                                         seed: rng.int(1, 0x7ffffff), done: false }));
    list.splice(rng.int(1, list.length), 0, carry(rng, player, 'c' + list.length, new Set(picked.map(s => s.id))));
    if (others.length && rng() < (opts.letterChance === undefined ? 0.55 : opts.letterChance)) {
      const to = others[rng.int(0, others.length - 1)];
      list.splice(rng.int(1, list.length), 0, { id: 'c' + list.length, kind: 'letter', target: to.id, done: false });
    }
    return list;
  }

  /* A finished list gets more. Nobody stands about with nothing to do,
     and nobody can say they had nothing to do. */
  function more(rng, player, list) {
    const recent = new Set(list.slice(-4).map(j => j.station || j.to).filter(Boolean));
    // carry on from wherever the last job left them
    const last = list.slice().reverse().map(placeOf).find(Boolean);
    const picked = pickStations(rng, player, 2, recent, false, last ? station(last) : null);
    const out = picked.map((s, i) => ({ id: 'c' + (list.length + i), kind: 'station', station: s.id, type: s.type,
                                         seed: rng.int(1, 0x7ffffff), done: false }));
    out.push(carry(rng, player, 'c' + (list.length + out.length), new Set(picked.map(s => s.id))));
    return out;
  }

  /* Where a job is right now: its station, or the end of its errand. */
  const placeOf = (task) => (!task ? null : task.kind === 'station' ? task.station
    : task.kind === 'carry' ? (task.step ? task.to : task.from) : null);

  function describe(task, nameOf) {
    if (!task) return '';
    if (task.kind === 'letter') return 'Hand the sealed letter to ' + (nameOf ? nameOf(task.target) : 'them');
    if (task.kind === 'carry') {
      const a = station(task.from), b = station(task.to);
      return task.step ? 'Take ' + task.item + ' to ' + (b ? b.label + ' in ' + roomName(b.room) : 'its place')
                       : 'Fetch ' + task.item + ' from ' + (a ? a.label + ' in ' + roomName(a.room) : 'somewhere');
    }
    const s = station(task.station);
    return (TYPES[task.type] || {}).title + (s ? ' — ' + s.label : '');
  }

  return { VALUE, HOLD, REACH, TYPES, ITEMS, STATIONS, ROOM_NAMES, roomName, station, deal, more, placeOf, describe };
})();
