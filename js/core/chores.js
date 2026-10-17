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
     is the shortcut a keyboard gets on top. Every type plays
     differently; a day's list never repeats one if it can help it. */
  const TYPES = {
    safe:    { title: 'Crack the portrait safe',   verb: 'Crack the safe',
               how: 'A four-digit code flashes on the note. Remember it, then tap it in. ↺ shows it again.',
               keys: 'Number keys, Enter' },
    wires:   { title: 'Rewire the chandelier',     verb: 'Rewire it',
               how: 'Tap a wire end on the left, then the same colour on the right. Join all four.' },
    candles: { title: 'Light the candelabra',      verb: 'Light the candles',
               how: 'Tap the candles in number order, 1 to 6. A wrong one blows them all out.' },
    pour:    { title: 'Pour a dram for the laird', verb: 'Pour the dram',
               how: 'Hold POUR to fill the glass. Let go while the whisky is inside the green band.',
               keys: 'Hold Space' },
    bells:   { title: 'Ring the bells in order',   verb: 'Ring the bells',
               how: 'Watch the bells ring a tune, then tap them back in the same order. Two tunes.' },
    letters: { title: 'Sort the post by its seal', verb: 'Sort the post',
               how: 'Tap a letter, then the pigeonhole with the same colour seal. Post them all.' },
    tartan:  { title: 'Find the clan tartan',      verb: 'Match the tartan',
               how: 'Tap the pattern that matches the one at the top exactly. Three in a row.' },
    tune:    { title: 'Tune the clàrsach',         verb: 'Tune the harp',
               how: 'Drag the peg until the gold wave sits on the faint one, then hold it still.' },
    bats:    { title: 'Shoo the bats from the rafters', verb: 'Shoo the bats',
               how: 'Tap every bat as it swoops past to chase it out of the window.' },
    lock:    { title: 'Pick the old lock',         verb: 'Pick the lock',
               how: 'Tap SET when the white pick is inside the gold. Three pins, each one faster.',
               keys: 'Space' },
    bellows: { title: 'Work the bellows',          verb: 'Stoke the fire',
               how: 'Tap PUMP each time the glow swells out to the ring. Four good pumps.',
               keys: 'Space' },
    brew:    { title: 'Brew the laird’s tonic',    verb: 'Brew the tonic',
               how: 'Tap the ingredients in the order on the recipe. A wrong one spoils the pot.' },
  };

  /* Things to fetch and carry: pick it up in one room, put it down in
     another. They send people across the house on errands, which is
     the best alibi there is — and the best excuse to be somewhere. */
  const ITEMS = ['the decanter', 'a basket of logs', 'the laird’s ledger', 'a silver candelabrum',
                 'the bagpipes', 'a stack of tartan blankets', 'the old map', 'a tray of oatcakes'];

  /* Where they are. Rooms off the beaten track — the turret, the
     bedrooms, the far end of the corridor — are deliberate: a job that
     takes you somewhere quiet is a job that might get you killed. */
  const STATIONS = [
    { id: 'hall-desk',       room: 'hall',          x: -5.6, z: 16.4, type: 'letters', label: 'the porter’s desk' },
    { id: 'hall-clock',      room: 'hall',          x: -5.8, z: 6.0,  type: 'bells',   label: 'the long-case clock' },
    { id: 'hall-hearth',     room: 'hall',          x: 4.6,  z: 9.4,  type: 'bellows', label: 'the hall fire' },
    { id: 'passage-armour',  room: 'west-passage',  x: -8.5, z: 9.7,  type: 'tartan',  label: 'the suit of armour' },
    { id: 'great-sideboard', room: 'great',         x: -11.2, z: 0.4, type: 'pour',    label: 'the sideboard' },
    { id: 'great-portrait',  room: 'great',         x: -20.8, z: 17.0, type: 'safe',   label: 'the laird’s portrait' },
    { id: 'great-harp',      room: 'great',         x: -11.2, z: 18.6, type: 'tune',   label: 'the harp' },
    { id: 'great-hearth',    room: 'great',         x: -19.4, z: 5.6,  type: 'candles', label: 'the great hearth' },
    { id: 'round-chart',     room: 'round',         x: -5.4, z: -10.2, type: 'wires',  label: 'the chandelier winch' },
    { id: 'round-cabinet',   room: 'round',         x: 5.4,  z: -10.2, type: 'safe',   label: 'the strong cabinet' },
    { id: 'turret-bell',     room: 'turret',        x: -2.2, z: -24.4, type: 'bells',  label: 'the turret bell' },
    { id: 'turret-desk',     room: 'turret',        x: 2.2,  z: -24.4, type: 'candles', label: 'the conspirators’ desk' },
    { id: 'corridor-linen',  room: 'corridor',      x: 24.6, z: 13.5, type: 'letters', label: 'the linen press' },
    { id: 'corridor-lamp',   room: 'corridor',      x: 15.0, z: 12.6, type: 'wires',   label: 'the corridor lamps' },
    { id: 'corridor-door',   room: 'corridor',      x: 9.0,  z: 14.4, type: 'lock',    label: 'the locked press' },
    { id: 'great-rafters',   room: 'great',         x: -20.6, z: -0.8, type: 'bats',   label: 'the rafters' },
    { id: 'round-door',      room: 'round',         x: 6.4,  z: -3.0, type: 'lock',    label: 'the chamber strongbox' },
    { id: 'turret-brew',     room: 'turret',        x: 0.0,  z: -25.6, type: 'brew',   label: 'the still' },
    { id: 'hall-rafters',    room: 'hall',          x: 5.8,  z: 16.6, type: 'bats',    label: 'the minstrels’ gallery' },
  ];
  for (let k = 0; k < 8; k++) {
    const north = k < 4, i = k % 4, x0 = 8 + 4 * i;
    STATIONS.push({ id: 'bed' + k + '-trunk', room: 'bed' + k, x: x0 + 1.2, z: north ? 10.9 : 16.1,
                    type: 'tartan', label: 'the trunk at the foot of the bed', bed: k });
  }

  const ROOM_NAMES = {
    hall: 'the Entrance Hall', 'west-passage': 'the West Passage', great: 'the Great Hall',
    'north-passage': 'the North Passage', round: 'the Round Table Chamber', stair: 'the Turret Stair',
    turret: 'the Turret', corridor: 'the Bedroom Corridor',
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
     of them in `avoid`. */
  function pickStations(rng, player, n, avoid, wantQuiet) {
    const pool = poolFor(player).filter(s => !avoid.has(s.id));
    const picked = [];
    const usedTypes = new Set();
    const take = (s) => { picked.push(s); usedTypes.add(s.type); };
    if (wantQuiet) {
      const quiet = pool.filter(s => s.room === 'turret' || s.room === 'corridor' || s.bed !== undefined);
      if (quiet.length) take(quiet[rng.int(0, quiet.length - 1)]);
    }
    const shuffled = shuffle(rng, pool);
    for (const s of shuffled) if (picked.length < n && !picked.includes(s) && !usedTypes.has(s.type)) take(s);
    for (const s of shuffled) if (picked.length < n && !picked.includes(s)) take(s);
    return picked;
  }

  function carry(rng, player, id, avoid) {
    const pool = shuffle(rng, poolFor(player).filter(s => !avoid.has(s.id)));
    const from = pool[0];
    const to = pool.find(s => s.room !== from.room) || pool[1];
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
    const picked = pickStations(rng, player, 2, recent, false);
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
