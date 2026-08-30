/* ------------------------------------------------------------------
   look.js — who you are before anybody has spoken.

   A look is a small plain object of enumerated choices. It is plain on
   purpose: it goes in localStorage, it goes down the wire to two other
   people, and it goes into `Figure.build` — three consumers that would
   otherwise all need to agree about a class.

   Every field is an index into a list here, never a raw colour. That
   means a look saved by an older build cannot ever produce a figure
   with no coat: an index that has gone out of range clamps, and the
   worst case is somebody's jacket changing shade between versions.
------------------------------------------------------------------ */
const Look = (() => {

  const KEY  = 'traitors.look.v1';
  const NKEY = 'traitors.name.v1';

  /* Skin tones span the range properly rather than offering four
     shades of the same one. */
  const SKIN = ['#f4d7c0', '#e9c3a4', '#dcae86', '#c68e63', '#a56b45',
                '#7d4a2d', '#5b3520', '#3f2416'];

  const HAIR_COLOUR = ['#1b1410', '#3b2a1e', '#6d4a2a', '#a06a2c', '#c9a227',
                       '#8d3b20', '#b7b0a6', '#e8e4dc', '#5a2440', '#2c4a6b'];

  const HAIR = [
    { id: 'crop',   name: 'Crop' },
    { id: 'short',  name: 'Short' },
    { id: 'bob',    name: 'Bob' },
    { id: 'long',   name: 'Long' },
    { id: 'bun',    name: 'Bun' },
    { id: 'braids', name: 'Braids' },
    { id: 'tail',   name: 'Ponytail' },
    { id: 'bald',   name: 'Shaved' },
  ];

  const COAT = [
    { name: 'Moss',    coat: '#2f5d4a', trim: '#8fc0a0' },
    { name: 'Rust',    coat: '#7a3b28', trim: '#d59a6a' },
    { name: 'Slate',   coat: '#3b4757', trim: '#9fb4c9' },
    { name: 'Plum',    coat: '#4c2a4e', trim: '#c095c4' },
    { name: 'Ochre',   coat: '#7d6524', trim: '#dcc06a' },
    { name: 'Ink',     coat: '#1b2028', trim: '#5d6b7e' },
    { name: 'Bracken', coat: '#5a4326', trim: '#b79a6a' },
    { name: 'Heather', coat: '#54406b', trim: '#a794c4' },
    { name: 'Bone',    coat: '#cfc6b4', trim: '#7a6f5c' },
    { name: 'Loch',    coat: '#1f4a58', trim: '#79bccb' },
  ];

  const ACCENT = ['#f2c14e', '#d81e40', '#3fe0ff', '#7dfcd0', '#ef7d3a',
                  '#b06ad6', '#eef4fb', '#6a8f2f'];

  const HAT = [
    { id: 'none',  name: 'Bare-headed' },
    { id: 'beanie',name: 'Beanie' },
    { id: 'flat',  name: 'Flat cap' },
    { id: 'wide',  name: 'Wide brim' },
    { id: 'band',  name: 'Headband' },
  ];

  const SCARF = [
    { id: 'none',  name: 'None' },
    { id: 'scarf', name: 'Scarf' },
    { id: 'sash',  name: 'Tartan sash' },
    { id: 'cowl',  name: 'Cowl' },
  ];

  const BUILD = [
    { id: 'slight', name: 'Slight', height: 1.68, girth: 0.92 },
    { id: 'lean',   name: 'Lean',   height: 1.75, girth: 0.97 },
    { id: 'solid',  name: 'Solid',  height: 1.80, girth: 1.06 },
    { id: 'tall',   name: 'Tall',   height: 1.88, girth: 1.00 },
    { id: 'broad',  name: 'Broad',  height: 1.83, girth: 1.14 },
  ];

  /* The rows the dressing room walks. Keeping them as data means the
     screen is a loop rather than a form, and adding a choice is adding
     a line here. */
  const ROWS = [
    { key: 'build',      label: 'Build',   list: BUILD,        show: (v) => BUILD[v].name },
    { key: 'skin',       label: 'Skin',    list: SKIN,         swatch: (v) => SKIN[v] },
    { key: 'hair',       label: 'Hair',    list: HAIR,         show: (v) => HAIR[v].name },
    { key: 'hairColour', label: 'Colour',  list: HAIR_COLOUR,  swatch: (v) => HAIR_COLOUR[v] },
    { key: 'coat',       label: 'Coat',    list: COAT,         show: (v) => COAT[v].name,
      swatch: (v) => COAT[v].coat },
    { key: 'accent',     label: 'Accent',  list: ACCENT,       swatch: (v) => ACCENT[v] },
    { key: 'hat',        label: 'Head',    list: HAT,          show: (v) => HAT[v].name },
    { key: 'scarf',      label: 'Neck',    list: SCARF,        show: (v) => SCARF[v].name },
  ];

  const LISTS = { SKIN, HAIR, HAIR_COLOUR, COAT, ACCENT, HAT, SCARF, BUILD };

  const clampIdx = (v, list) => {
    const i = Math.floor(Number(v));
    if (!isFinite(i) || i < 0) return 0;
    return i % list.length;
  };

  function fresh() {
    return { build: 1, skin: 1, hair: 1, hairColour: 1, coat: 0, accent: 0,
             hat: 0, scarf: 0 };
  }

  function random() {
    const pick = (list) => Math.floor(Math.random() * list.length);
    return { build: pick(BUILD), skin: pick(SKIN), hair: pick(HAIR),
             hairColour: pick(HAIR_COLOUR), coat: pick(COAT), accent: pick(ACCENT),
             hat: pick(HAT), scarf: pick(SCARF) };
  }

  function normalise(raw) {
    const o = Object.assign(fresh(), raw || {});
    for (const row of ROWS) o[row.key] = clampIdx(o[row.key], row.list);
    return o;
  }

  /* What `Figure.build` actually wants: resolved colours and ids, so
     nothing downstream has to know these lists exist. */
  function resolve(raw) {
    const o = normalise(raw);
    const coat = COAT[o.coat];
    const build = BUILD[o.build];
    return {
      skin: SKIN[o.skin],
      hair: HAIR[o.hair].id,
      hairColour: HAIR_COLOUR[o.hairColour],
      coat: coat.coat,
      trim: coat.trim,
      accent: ACCENT[o.accent],
      hat: HAT[o.hat].id,
      scarf: SCARF[o.scarf].id,
      height: build.height,
      girth: build.girth,
      boot: '#241f1a',
      glove: coat.trim,
    };
  }

  /* ---------------- storage ----------------
     Same discipline as the rest of the save layer: a corrupt or
     unavailable store is not an error, it is a fresh look. */

  let current = fresh();
  let name = '';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) current = normalise(JSON.parse(raw));
    } catch (e) { current = fresh(); }
    try { name = String(localStorage.getItem(NKEY) || '').slice(0, 16); }
    catch (e) { name = ''; }
    return current;
  }

  function save(next) {
    if (next) current = normalise(next);
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) {}
    return current;
  }

  function setName(v) {
    name = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    try { localStorage.setItem(NKEY, name); } catch (e) {}
    return name;
  }

  const get = () => current;
  const getName = () => name;
  const profile = () => ({ name: name || 'Player', look: normalise(current) });

  return { load, save, get, setName, getName, profile, fresh, random,
           normalise, resolve, ROWS, LISTS, KEY, NKEY };
})();
