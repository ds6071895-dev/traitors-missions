/* ------------------------------------------------------------------
   interlude.js — the castle between one room and the next.

   Every change of room used to be a quarter of a second of black. Now
   it is a painted shot of the castle over the loch while the hour turns
   — dusk falling into night, the night giving way to dawn — with the
   day's weather over it and, at the start of a day and at the fire, a
   card: which day it is, who is still here, who is not and how they
   left, and the pot.

   It is DOM and CSS, not a scene. The next room is built underneath it,
   and that build holds the main thread for most of a second, so every
   moving thing here is a CSS animation of `transform` or `opacity`: the
   compositor keeps those running while the page itself is busy.

   The sound comes first. A bell, a door, footsteps on the stair start
   with the painting, about a second before the room itself is seen —
   the oldest trick there is for making a cut feel meant.

   Everything on the card is public: names, how the gone left (and as
   what, when the room was told), the pot, the day's weather and twist.
   `test/interlude.test.js` holds it to that.
------------------------------------------------------------------ */
const Interlude = (() => {

  /* The hour the painting turns from and to, for each room it leads in. */
  const HOURS = {
    tasks:     ['morning', 'golden'],
    night:     ['dusk', 'night'],
    breakfast: ['night', 'morning'],   // all the way up: the hall it opens on is a morning
    table:     ['dawn', 'morning'],
    finale:    ['dusk', 'night'],
  };
  const MIN = 1.6;          // seconds, a plain cut
  const MIN_CARD = 2.8;     // seconds, with the day's card on it
  const SWAP_AT = 0.4;      // the room is built underneath at this share of the minimum
  const TURN_MS = 1700;     // the hour finishes turning (sky 1.3 s, sun 1.6 s) before it lifts
  const DRAWN_CAP = 4000;   // never hold for a lost GPU longer than this

  let el = null;
  let owner = null;

  /* ---------------- the painting ----------------
     A baronial castle on a rock in a Highland loch, drawn once as SVG in
     a 1600×900 frame and scaled to cover the screen from its middle, so
     a phone held upright still sees the keep and the great tower. Every
     colour is a CSS variable set by the hour, so one drawing serves
     dawn, noon, dusk and night; the windows light one by one as the
     dark comes on. Silhouettes, shading and stone are layered with
     <use>, so the castle itself is drawn exactly once. */

  const W = 1600, H = 900, SHORE = 600;

  // the same picture every time: a little LCG, not Math.random
  function rngOf(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  const f1 = (n) => Math.round(n * 10) / 10;

  // a jagged ridge: a few named peaks, and noise between them
  function ridge(seed, base, peaks, rough, step = 14) {
    const r = rngOf(seed);
    let d = `M-20 ${H} V${base}`;
    for (let x = -20; x <= W + 20; x += step) {
      let y = base;
      for (const [px, ph, pw] of peaks) {
        const t = Math.max(0, 1 - Math.abs(x - px) / pw);
        y -= ph * Math.pow(t, 1.35);
      }
      y += (r() - 0.5) * rough;
      d += ` L${x} ${f1(y)}`;
    }
    return { d: d + ` L${W + 20} ${H} Z`, at: (x) => {
      let y = base;
      for (const [px, ph, pw] of peaks) { const t = Math.max(0, 1 - Math.abs(x - px) / pw); y -= ph * Math.pow(t, 1.35); }
      return y;
    } };
  }

  // a Scots pine in silhouette: tiers of ragged boughs on a thin trunk
  function pine(x, base, h, w, r) {
    const tiers = 5;
    let right = '', left = '';
    for (let i = 1; i <= tiers; i++) {
      const y = base - h + h * (i / tiers) * 0.9;
      const hw = (w / 2) * (0.35 + 0.65 * i / tiers) * (0.85 + r() * 0.3);
      const up = h * 0.05;
      right += ` L${f1(x + hw)} ${f1(y)} L${f1(x + hw * 0.42)} ${f1(y - up)}`;
      left = ` L${f1(x - hw * 0.42)} ${f1(y - up)} L${f1(x - hw)} ${f1(y)}` + left;
    }
    const tw = Math.max(1.2, w * 0.05);
    return `M${f1(x)} ${f1(base - h)}${right} L${f1(x + tw)} ${f1(base - h * 0.1)} L${f1(x + tw)} ${base}`
      + ` L${f1(x - tw)} ${base} L${f1(x - tw)} ${f1(base - h * 0.1)}${left} Z`;
  }
  function forest(seed, x0, x1, groundAt, hMin, hMax, gap) {
    const r = rngOf(seed);
    let d = '';
    for (let x = x0; x < x1; x += gap * (0.6 + r() * 0.8)) {
      const h = hMin + r() * (hMax - hMin);
      d += pine(x, groundAt(x) + 4, h, h * (0.42 + r() * 0.16), r);
    }
    return d;
  }

  /* ---- the castle, in parts ---- */
  const rect = (x0, x1, top, base) => `M${x0} ${base} V${top} H${x1} V${base} Z`;
  // merlons standing on a parapet line
  function merlons(x0, x1, y, mw = 9, gap = 7, mh = 9) {
    let d = '';
    for (let x = x0; x + mw <= x1 + 0.5; x += mw + gap) d += `M${f1(x)} ${y} V${y - mh} H${f1(x + mw)} V${y} Z`;
    return d;
  }
  // a corbelled parapet: wider than the wall, on a row of brackets
  function parapet(x0, x1, y, out = 6, hgt = 14) {
    let d = rect(x0 - out, x1 + out, y - hgt, y) + merlons(x0 - out, x1 + out, y - hgt);
    for (let x = x0 - out + 3; x < x1 + out - 4; x += 9) d += `M${x} ${y} H${x + 5} L${x + 4} ${y + 7} H${x + 1} Z`;
    return d;
  }
  // a candle-snuffer roof, a little concave, with a finial
  function cone(cx, r, top, peak) {
    const k = (top - peak) * 0.32;
    return `M${cx - r - 3} ${top} Q${cx - r * 0.35} ${top - k} ${cx} ${peak} Q${cx + r * 0.35} ${top - k} ${cx + r + 3} ${top} Z`
      + `M${cx - 1.2} ${peak + 2} V${peak - 14} H${cx + 1.2} V${peak + 2} Z`
      + `M${cx} ${peak - 18} m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0`;
  }
  // a turret hung on a corner, on a cone of corbels
  function bartizan(cx, y, r, len = 38, roof = 46) {
    return rect(cx - r, cx + r, y, y + len) + `M${cx - r} ${y + len} L${cx} ${y + len + r * 1.6} L${cx + r} ${y + len} Z`
      + cone(cx, r, y, y - roof);
  }
  // a crow-stepped gable between two eaves
  function crowGable(x0, x1, eave, peak, steps = 5) {
    const mid = (x0 + x1) / 2, sw = (mid - x0) / steps, sh = (eave - peak) / steps;
    let d = `M${x0} ${eave}`;
    for (let i = 0; i < steps; i++) d += ` V${f1(eave - sh * (i + 1))} H${f1(x0 + sw * (i + 1))}`;
    d += ` H${f1(mid + 4)}`;
    for (let i = steps - 1; i >= 0; i--) d += ` V${f1(eave - sh * i)} H${f1(x1 - sw * i)}`;
    return d + ` V${eave} Z`;
  }
  const chimney = (x, w, top, base) => rect(x, x + w, top, base) + rect(x - 2, x + w + 2, top - 4, top)
    + rect(x + 2, x + 6, top - 10, top - 4) + rect(x + w - 6, x + w - 2, top - 10, top - 4);
  const roof = (x0, x1, eave, top) => `M${x0} ${eave} L${x0 + 14} ${top} H${x1 - 14} L${x1} ${eave} Z`;

  // the rock the house stands on: a ragged shelf out into the water
  const ROCK = `M462 ${SHORE + 3} L478 590 L500 584 L512 574 L534 570 L548 562 L600 560 L700 557 L860 556 L1000 556`
    + ` L1072 558 L1098 562 L1118 570 L1140 578 L1160 588 L1186 ${SHORE + 3} Z`;

  /* Three layers, back to front: the roofs behind parapets and gables,
     the harled walls, and the slate cones and caps in front of them.
     Ardross is white by day with grey slate on its turrets; the hour's
     variables do the rest. */
  function castleParts() {
    const back = [], walls = [], roofs = [];
    // the curtain wall round the terrace (the rock under it is drawn on its own)
    walls.push(rect(540, 1110, 528, 566) + merlons(540, 1110, 528, 10, 8, 8));
    for (const x of [560, 700, 900, 1040, 1090]) walls.push(`M${x} 566 V532 H${x + 12} V566 Z`);
    // the far west tower, small, with its cap — standing on the rock itself, beyond the curtain wall
    back.push(cone(512, 17, 432, 384));
    walls.push(`M492 588 V436 H532 V572 Z` + parapet(492, 532, 436, 3, 8));
    // the west wing: two crow-stepped gables to the front, a ridge behind, a chimney on each
    back.push(roof(530, 646, 452, 410));
    walls.push(rect(528, 648, 452, 540) + crowGable(528, 588, 452, 398, 4) + crowGable(588, 648, 452, 404, 4));
    walls.push(chimney(552, 14, 370, 452) + chimney(612, 14, 378, 452));
    // the keep: a tall block, a steep roof behind its parapet, turrets on its corners
    back.push(`M666 358 L700 318 H816 L850 358 Z`);
    walls.push(rect(648, 868, 372, 540) + parapet(648, 868, 372));
    walls.push(chimney(690, 16, 276, 358) + chimney(812, 16, 284, 358));
    for (const x of [724, 760, 796]) {                       // dormers on the keep roof
      walls.push(rect(x + 4, x + 20, 326, 344));
      roofs.push(`M${x + 1} 327 L${x + 12} 311 L${x + 23} 327 Z`);
    }
    for (const cx of [662]) {                                // a corner turret, on the keep's face (the other corner is the stair)
      walls.push(rect(cx - 13, cx + 13, 342, 404) + `M${cx - 13} 404 L${cx} 425 L${cx + 13} 404 Z`);
      roofs.push(cone(cx, 13, 342, 296));
    }
    // the stair tower, slim, with an ogee cap
    walls.push(rect(866, 888, 330, 540));
    roofs.push(`M864 331 Q867 302 877 290 Q887 302 890 331 Z` + rect(876, 878, 272, 292));
    // the great round tower, the tallest thing in the glen
    back.push(cone(934, 42, 292, 168) + rect(933, 935.4, 104, 152));
    walls.push(rect(890, 978, 300, 540) + parapet(890, 978, 300, 7, 12));
    // the east wing: lower, a long roof and dormers, a gable at the end
    back.push(`M978 462 L992 430 H1070 L1098 462 Z`);
    walls.push(rect(978, 1098, 462, 540) + crowGable(1060, 1098, 462, 420, 3));
    for (const x of [1000, 1032]) {
      walls.push(rect(x + 2, x + 16, 444, 462));
      roofs.push(`M${x} 446 L${x + 9} 432 L${x + 18} 446 Z`);
    }
    walls.push(chimney(1016, 12, 404, 450));
    // the gatehouse and its arch, at the front of the terrace
    walls.push(rect(738, 812, 486, 566) + merlons(734, 816, 486, 8, 6, 8) + rect(734, 816, 480, 486));
    return { back, walls, roofs };
  }

  // the lights: [x, y, w, h, arched]
  const LIGHTS = (() => {
    const L = [];
    for (const y of [400, 446, 494]) for (let x = 668; x <= 840; x += 30) L.push([x, y, 9, 18, y === 400]);
    for (const y of [330, 384, 440, 496]) L.push([926, y, 9, 20, true], [952, y + 6, 6, 14, true]);
    for (const y of [350, 400, 452]) L.push([874.5, y, 5, 12, false]);
    for (const y of [470, 506]) for (const x of [540, 566, 600, 626]) L.push([x, y, 8, 16, y === 470]);
    for (const y of [484, 512]) for (const x of [992, 1018, 1046, 1074]) L.push([x, y, 8, 14, false]);
    L.push([563, 432, 6, 10, true], [623, 438, 6, 10, true], [509, 470, 6, 14, true], [509, 506, 6, 14, true]);
    L.push([1004, 436, 6, 8, false], [1036, 436, 6, 8, false], [1077, 440, 6, 9, true]);
    L.push([733, 330, 6, 9, true], [769, 330, 6, 9, true], [805, 330, 6, 9, true]);
    L.push([660, 362, 4, 10, true]);
    return L;
  })();
  const winPath = (x, y, w, h, arch) => arch
    ? `M${x} ${y + h} V${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} V${y + h} Z`
    : rect(x, x + w, y, y + h);

  function svg() {
    const far = ridge(11, 452, [[180, 150, 260], [520, 110, 230], [1180, 190, 300], [1500, 130, 220]], 10);
    const far2 = ridge(23, 500, [[60, 70, 200], [380, 90, 200], [760, 60, 260], [1320, 110, 240], [1580, 60, 160]], 8, 12);
    const mid = ridge(37, 572, [[150, 66, 260], [420, 30, 180], [1260, 58, 260], [1520, 74, 220]], 4, 18);
    const bankL = ridge(41, 600, [[0, 70, 360], [300, 18, 180]], 3, 20);
    const bankR = ridge(43, 600, [[1600, 80, 380], [1330, 22, 200]], 3, 20);
    const midTrees = forest(5, -10, 470, mid.at, 18, 34, 13) + forest(6, 1160, 1620, mid.at, 18, 36, 13);
    const bankTrees = forest(7, -20, 360, bankL.at, 30, 70, 17) + forest(8, 1270, 1620, bankR.at, 30, 76, 17);
    // the frame: tall pines close to the lens, either side
    const rf = rngOf(91);
    let frame = '';
    for (const [x, h] of [[-30, 760], [40, 620], [118, 540], [1500, 600], [1575, 780], [1440, 470]]) {
      frame += pine(x, H + 10, h, h * 0.36, rf);
    }
    const parts = castleParts();
    const paths = (list) => list.map(d => `<path d="${d}"/>`).join('');
    // one layer of the house: its colour, then stone, light and the shade at its foot
    const layer = (id, cls) => `<use href="#${id}" class="${cls}"/><use href="#${id}" class="il-stone" fill="url(#ilStone)"/>`
      + `<use href="#${id}" fill="url(#ilShade)"/><use href="#${id}" fill="url(#ilFoot)"/>`;
    const house = layer('ilRoofsBack', 'il-roof') + layer('ilWalls', 'il-castle') + layer('ilRoofs', 'il-roof');
    const houseFlat = '<use href="#ilRoofsBack" class="il-roof"/><use href="#ilWalls" class="il-castle"/><use href="#ilRoofs" class="il-roof"/>';
    const panes = LIGHTS.map(([x, y, w, h, a]) => `<path d="${winPath(x, y, w, h, a)}"/>`).join('');
    const lights = LIGHTS.map(([x, y, w, h, a], i) =>
      `<g class="il-win" style="--i:${(i * 7) % LIGHTS.length}"><ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w * 1.9}" ry="${h * 1.1}" fill="url(#ilGlow)"/>`
      + `<path d="${winPath(x, y, w, h, a)}"/></g>`).join('');
    // the clouds: soft heaps of ellipses that drift
    const cloud = (cx, cy, s) => [[0, 0, 70, 18], [-46, 6, 46, 14], [44, 5, 52, 15], [10, -12, 40, 16], [-20, -6, 34, 12]]
      .map(([dx, dy, rx, ry]) => `<ellipse cx="${cx + dx * s}" cy="${cy + dy * s}" rx="${rx * s}" ry="${ry * s}"/>`).join('');
    const glints = (cx, n, seed) => {
      const r = rngOf(seed);
      let g = '';
      for (let i = 0; i < n; i++) {
        const y = SHORE + 8 + i * i * 1.15 + i * 6, w = 8 + i * 3.2 + r() * 10;
        g += `<rect x="${f1(cx - w / 2 + (r() - 0.5) * (8 + i * 3))}" y="${f1(y)}" width="${f1(w)}" height="${f1(1.6 + i * 0.12)}" rx="1"/>`;
      }
      return g;
    };
    const birds = [[0, 0, 1], [26, 10, 0.8], [-22, 14, 0.7], [48, 22, 0.6]]
      .map(([dx, dy, s]) => `<path d="M${dx - 9 * s} ${dy} Q${dx - 4 * s} ${dy - 5 * s} ${dx} ${dy} Q${dx + 4 * s} ${dy - 5 * s} ${dx + 9 * s} ${dy}"/>`).join('');
    const stop = (o, v, a = 1) => `<stop offset="${o}" style="stop-color:var(${v});stop-opacity:${a}"/>`;
    return `<svg class="il-land" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="ilFarG" x1="0" y1="0" x2="0" y2="1">${stop(0, '--far-top')}${stop(1, '--far')}</linearGradient>
        <linearGradient id="ilFar2G" x1="0" y1="0" x2="0" y2="1">${stop(0, '--far2-top')}${stop(1, '--far2')}</linearGradient>
        <linearGradient id="ilLochG" x1="0" y1="0" x2="0" y2="1">${stop(0, '--loch-a')}${stop(0.55, '--loch-b')}${stop(1, '--loch-c')}</linearGradient>
        <linearGradient id="ilShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset=".55" stop-color="#000" stop-opacity=".05"/>
          <stop offset=".8" stop-color="#fff" stop-opacity=".0"/>${stop(1, '--rim', 0.55)}</linearGradient>
        <linearGradient id="ilFoot" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
        <radialGradient id="ilGlow">${stop(0, '--win', 0.55)}${stop(1, '--win', 0)}</radialGradient>
        <radialGradient id="ilHalo">${stop(0, '--orb', 0.55)}${stop(0.35, '--orb', 0.16)}${stop(1, '--orb', 0)}</radialGradient>
        <pattern id="ilStone" width="36" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 0.5H36M0 7.5H36M10 0.5V7.5M28 7.5V14" stroke="#000" stroke-opacity=".28" stroke-width=".9" fill="none"/>
          <path d="M0 1.5H36M0 8.5H36" stroke="#fff" stroke-opacity=".06" stroke-width=".8" fill="none"/></pattern>
        <pattern id="ilRipple" width="220" height="9" patternUnits="userSpaceOnUse">
          <path d="M0 2H90M120 6H200M60 8H110" stroke="var(--loch-a)" stroke-opacity=".5" stroke-width="1.2"/></pattern>
        <clipPath id="ilBelow"><rect x="0" y="${SHORE}" width="${W}" height="${H - SHORE}"/></clipPath>
        <g id="ilRoofsBack">${paths(parts.back)}</g><g id="ilWalls">${paths(parts.walls)}</g><g id="ilRoofs">${paths(parts.roofs)}</g>
        <g id="ilHills"><path class="il-far" d="${far.d}"/><path class="il-far2" d="${far2.d}"/>
          <path class="il-mid" d="${mid.d}"/><path class="il-mid" d="${midTrees}"/></g>
      </defs>
      <g class="il-push">
        <g class="il-clouds il-c1" fill="var(--cloud)">${cloud(260, 150, 1.4)}${cloud(980, 96, 1.1)}</g>
        <g class="il-sun"><circle cx="1210" cy="205" r="160" fill="url(#ilHalo)"/><circle cx="1210" cy="205" r="34" fill="var(--orb)"/></g>
        <g class="il-moon"><circle cx="380" cy="170" r="120" fill="url(#ilHalo)"/><circle cx="380" cy="170" r="27" fill="#f3efe2"/>
          <circle cx="371" cy="163" r="6" fill="#d8d2c2"/><circle cx="388" cy="179" r="4" fill="#dcd6c6"/><circle cx="392" cy="160" r="3" fill="#ddd8c8"/></g>
        <g class="il-clouds il-c2" fill="var(--cloud)">${cloud(620, 210, 1.0)}${cloud(1420, 180, 1.3)}${cloud(80, 260, 0.8)}</g>
        <g transform="translate(1010 310)"><g class="il-flock" fill="none" stroke="var(--fg)" stroke-width="2.2" stroke-linecap="round">${birds}</g></g>
        <use href="#ilHills"/>
        <path class="il-near" d="${bankL.d}"/><path class="il-near" d="${bankR.d}"/><path class="il-near" d="${bankTrees}"/>
        <path class="il-rock" d="${ROCK}"/>
        <path d="${ROCK}" fill="url(#ilShade)"/>
        ${house}
        <g class="il-panes">${panes}</g>
        <g class="il-windows">${lights}</g>
        <g transform="translate(935.4 106)"><path class="il-flag" d="M0 0 Q14 -5 27 2 Q40 9 54 2 V22 Q40 29 27 22 Q14 15 0 21 Z"/></g>
        <rect class="il-loch" x="0" y="${SHORE}" width="${W}" height="${H - SHORE}" fill="url(#ilLochG)"/>
        <g clip-path="url(#ilBelow)"><g class="il-reflect" transform="translate(0 ${SHORE * 2}) scale(1 -1)">
          <use href="#ilHills"/><path class="il-rock" d="${ROCK}"/>${houseFlat}<g class="il-panes">${panes}</g><g class="il-windows">${lights}</g></g></g>
        <rect class="il-ripple" x="-220" y="${SHORE}" width="${W + 440}" height="${H - SHORE}" fill="url(#ilRipple)"/>
        <g class="il-glint il-glint-sun" fill="var(--orb)">${glints(1210, 18, 3)}</g>
        <g class="il-glint il-glint-moon" fill="#e8eefc">${glints(380, 16, 4)}</g>
        <path class="il-shore" d="M0 ${SHORE + 1} H${W} V${SHORE + 3} H0Z"/>
        <path class="il-fg" d="${frame}"/>
      </g>
    </svg>`;
  }

  function ensure() {
    if (el) return el;
    if (typeof document === 'undefined') return null;
    el = document.getElementById('interlude');
    if (!el) return null;
    el.innerHTML = `
      <div class="il-sky il-sky-a"></div><div class="il-sky il-sky-b"></div>
      <div class="il-stars"></div>
      ${svg()}
      <div class="il-veil"></div>
      <div class="il-mist"><i></i><i></i><i></i></div>
      <div class="il-rain"></div>
      <div class="il-bolt"></div>
      <div class="il-vignette"></div>
      <div class="il-scrim"></div>
      <div class="il-card">
        <div class="il-kicker"></div>
        <div class="il-title"></div>
        <div class="il-rule" aria-hidden="true"><i></i><b></b><i></i></div>
        <div class="il-chips"></div>
        <div class="il-sub"></div>
      </div>`;
    return el;
  }

  /* ---------------- the card ---------------- */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => '£' + Math.round(n || 0).toLocaleString('en-GB');

  /* How somebody left, in the words the room was told. A banishment
     whose role was kept back (a veiled day) says only that. */
  function gone(p, s) {
    if (p.alive) return null;
    if (p.out === 'murdered') return 'poisoned';
    if (p.out === 'left') return 'left';
    const b = (s.banished || []).find(x => x.id === p.id);
    if (p.out === 'exposed' || (b && b.exposed)) return 'Traitor';
    if (b && (b.role === 'traitor' || b.role === 'faithful')) return b.role === 'traitor' ? 'Traitor' : 'Faithful';
    return 'banished';
  }

  const ROMAN = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

  /* What the card says on the way into `to`, from the public state
     alone. `chips` is only drawn at the start of a day and at the fire. */
  function cardFor(to, s, o = {}) {
    if (!s) return null;
    const day = (s.day | 0);
    const dayWord = 'Day ' + (day + 1);
    const weather = o.weather && typeof Weather !== 'undefined' ? Weather.word(o.weather) : '';
    const last = typeof Session !== 'undefined' && Session.finaleNext ? Session.finaleNext() : false;
    const chips = () => (s.players || []).slice().sort((a, b) => a.seat - b.seat)
      .map(p => ({ name: p.name, gone: gone(p, s), you: !!p.local }));
    if (to === 'tasks') {
      return { kicker: day === 0 ? 'The first day' : weather, title: 'DAY ' + (ROMAN[day] || day + 1),
               chips: chips(), pot: s.pot | 0, twist: o.twist || null, full: true };
    }
    if (to === 'finale') {
      return { kicker: 'The last night', title: 'THE FIRE OF TRUTH', chips: chips(), pot: s.pot | 0, full: true };
    }
    if (to === 'night') return { kicker: dayWord, title: 'NIGHT FALLS' };
    if (to === 'breakfast') return { kicker: dayWord + (weather ? ' · ' + weather : ''), title: 'MORNING' };
    if (to === 'table') return { kicker: last ? 'The last table' : dayWord, title: 'THE ROUND TABLE' };
    return null;
  }

  function paintCard(card) {
    const c = el.querySelector('.il-card');
    if (!c) return;
    c.classList.toggle('full', !!(card && card.full));
    c.querySelector('.il-kicker').textContent = (card && card.kicker) || '';
    const title = (card && card.title) || '';
    c.querySelector('.il-title').textContent = title;
    // long titles ("THE FIRE OF TRUTH") are sized down to stay on one line
    if (c.style && c.style.setProperty) c.style.setProperty('--il-n', String(Math.max(8, title.length)));
    c.querySelector('.il-chips').innerHTML = card && card.chips
      ? card.chips.map(p => `<span class="il-chip${p.gone ? ' gone' : ''}${p.you ? ' you' : ''}">${esc(p.name)}`
          + (p.gone ? `<em>${esc(p.gone)}</em>` : '') + '</span>').join('')
      : '';
    const sub = [];
    if (card && card.full && card.pot !== undefined) sub.push('<b>' + money(card.pot) + '</b> in the pot');
    if (card && card.twist) sub.push('<span class="il-twist">' + esc(card.twist) + '</span>');
    c.querySelector('.il-sub').innerHTML = sub.join('');
  }

  /* The shade under the card grows to hold it: a card with a long
     title and two rows of names must never stand above its own shade. */
  function fitScrim(root) {
    const scrim = root.querySelector && root.querySelector('.il-scrim');
    const c = root.querySelector && root.querySelector('.il-card');
    if (!scrim || !c || !c.getBoundingClientRect || !root.getBoundingClientRect) return;
    scrim.style.height = '';
    const box = root.getBoundingClientRect(), r = c.getBoundingClientRect();
    if (!box.height) return;
    const need = box.bottom - r.top + 0.12 * box.height;
    if (need > scrim.getBoundingClientRect().height) scrim.style.height = Math.min(box.height, need) + 'px';
  }

  /* ---------------- sound ---------------- */

  /* What you hear before you see the room. */
  const SOUNDS = {
    tasks: ['il-bell', 'il-creak'],
    night: ['il-steps', 'key-turn'],
    breakfast: ['il-dawn'],
    table: ['il-chairs'],
    finale: ['il-crackle'],
  };

  function sound(to, weather) {
    if (typeof AudioBus === 'undefined' || !AudioBus.ready) return;
    (SOUNDS[to] || []).forEach((n, i) => setTimeout(() => AudioBus.play(n), i * 650));
    if (weather === 'rain' || weather === 'storm') AudioBus.play('il-rain', { bus: 'ambience', storm: weather === 'storm' });
    if (weather === 'storm') setTimeout(() => AudioBus.play('il-thunder', { bus: 'ambience' }), 900);
  }

  const noiseBurst = (ctx, len, decay) => {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * decay));
    const src = ctx.createBufferSource(); src.buffer = buf;
    return src;
  };
  const gainAt = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };

  if (typeof AudioBus !== 'undefined') {
    // a big bell, far off: a few inharmonic partials, a long ring
    AudioBus.define('il-bell', (ctx, dest) => {
      const t = ctx.currentTime;
      for (const [m, v, len] of [[1, 0.16, 3.6], [2.0, 0.08, 2.6], [2.76, 0.06, 2.0], [5.4, 0.03, 1.1], [0.5, 0.10, 4.0]]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 196 * m;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + len + 0.1);
      }
    });
    // an old door on its hinges: noise through a sweeping narrow band
    AudioBus.define('il-creak', (ctx, dest) => {
      const t = ctx.currentTime;
      const src = noiseBurst(ctx, 1.2, 0.9);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 18;
      bp.frequency.setValueAtTime(520, t); bp.frequency.linearRampToValueAtTime(880, t + 0.5);
      bp.frequency.linearRampToValueAtTime(610, t + 1.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
      src.connect(bp); bp.connect(g); g.connect(dest); src.start(t);
    });
    // footsteps on a stone stair
    AudioBus.define('il-steps', (ctx, dest) => {
      const t = ctx.currentTime;
      for (let k = 0; k < 5; k++) {
        const src = noiseBurst(ctx, 0.12, 0.025);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420 + (k % 2) * 90;
        const g = gainAt(ctx, 0.55 - k * 0.07);
        src.connect(lp); lp.connect(g); g.connect(dest); src.start(t + k * 0.42);
      }
    });
    // the first bird, and a cup set down
    AudioBus.define('il-dawn', (ctx, dest) => {
      const t = ctx.currentTime;
      for (const [at, f0, f1] of [[0, 2600, 3900], [0.18, 3100, 2500], [0.9, 2800, 4100], [1.05, 3300, 2700]]) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(0.05, t + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.14);
        o.connect(g); g.connect(dest); o.start(t + at); o.stop(t + at + 0.2);
      }
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 2350;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + 1.5); g.gain.exponentialRampToValueAtTime(0.07, t + 1.505);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      o.connect(g); g.connect(dest); o.start(t + 1.5); o.stop(t + 2);
    });
    // chairs drawn back on a stone floor
    AudioBus.define('il-chairs', (ctx, dest) => {
      const t = ctx.currentTime;
      for (const at of [0, 0.35, 0.8]) {
        const src = noiseBurst(ctx, 0.4, 0.2);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
        bp.frequency.setValueAtTime(300, t + at); bp.frequency.linearRampToValueAtTime(700, t + at + 0.3);
        const g = gainAt(ctx, 0.32);
        src.connect(bp); bp.connect(g); g.connect(dest); src.start(t + at);
      }
    });
    // a fire catching: a low roar and a scatter of cracks
    AudioBus.define('il-crackle', (ctx, dest) => {
      const t = ctx.currentTime;
      const roar = noiseBurst(ctx, 2.4, 1.6);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      roar.connect(lp); lp.connect(g); g.connect(dest); roar.start(t);
      for (let k = 0; k < 9; k++) {
        const c = noiseBurst(ctx, 0.03, 0.004);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
        const cg = gainAt(ctx, 0.12 + Math.random() * 0.14);
        c.connect(hp); hp.connect(cg); cg.connect(dest); c.start(t + 0.2 + Math.random() * 1.8);
      }
    });
    /* Rain against the windows: a soft, dark wash with a scatter of
       drops on the glass. Kept low and under 2 kHz — a bright hiss
       across the whole band is what made it grate. */
    AudioBus.define('il-rain', (ctx, dest, o = {}) => {
      const t = ctx.currentTime, len = 2.8;
      const peak = o.storm ? 0.05 : 0.035;
      const src = noiseBurst(ctx, len, 6);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.storm ? 1700 : 1300; lp.Q.value = 0.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.9);
      g.gain.setValueAtTime(peak, t + 1.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest); src.start(t);
      // drops: short, soft, mid-pitched taps, thinning as the wash fades
      const drops = o.storm ? 22 : 14;
      for (let k = 0; k < drops; k++) {
        const at = 0.25 + Math.pow(Math.random(), 1.4) * 2.1;
        const d = noiseBurst(ctx, 0.02, 0.004);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
        bp.frequency.value = 900 + Math.random() * 1300;
        const dg = gainAt(ctx, 0.012 + Math.random() * 0.018);
        d.connect(bp); bp.connect(dg); dg.connect(dest); d.start(t + at);
      }
    });
    // thunder rolling round the glen
    AudioBus.define('il-thunder', (ctx, dest, o = {}) => {
      const t = ctx.currentTime;
      const len = 3.2;
      const src = noiseBurst(ctx, len, 1.3);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + len);
      const g = ctx.createGain();
      const v = o.gain === undefined ? 0.7 : o.gain;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.12);
      g.gain.exponentialRampToValueAtTime(v * 0.5, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(lp); lp.connect(g); g.connect(dest); src.start(t);
    });
  }

  /* ---------------- playing it ---------------- */

  const sleep = (ms, signal) => new Promise(resolve => {
    if (signal && signal.aborted) return resolve(false);
    const done = () => { clearTimeout(t); if (signal) signal.removeEventListener('abort', done); resolve(!(signal && signal.aborted)); };
    const t = setTimeout(done, ms);
    if (signal) signal.addEventListener('abort', done, { once: true });
  });

  /* The day's weather for the room being entered: the fire has its own. */
  function weatherFor(to, s) {
    if (!s || typeof Weather === 'undefined') return 'clear';
    return to === 'finale' ? Weather.forFinale(s.seed, s.day) : Weather.forDay(s.seed, s.day);
  }

  /* Paint the castle, run `work(lifted)` underneath it, hold until the
     new room has been drawn, then lift. `lifted` resolves as the
     painting starts to clear, which is when the new room may begin: a
     scene waits on it, so Claudia's first word is never said under the
     card. Returns false if it was cancelled. */
  async function play(o, work) {
    const signal = o.signal;
    const root = ensure();
    let lift;
    const lifted = new Promise(r => { lift = r; });
    if (!root) { await work(lifted); lift(); return true; }
    const me = {};
    owner = me;
    const s = typeof Session !== 'undefined' ? Session.state : null;
    const to = o.to;
    const [from, hour] = HOURS[to] || ['golden', 'golden'];
    const weather = o.weather || weatherFor(to, s);
    const card = o.card !== undefined ? o.card : cardFor(to, s, { weather, twist: o.twist });
    const min = (card && card.full ? MIN_CARD : MIN) * 1000;
    /* The hour it turns from is painted at once, without transitions,
       so last time's colours never slide into this time's. */
    root.className = `il-reset h-${from} to-${hour} w-${weather} for-${to}${card && card.full ? ' full' : ''}`;
    paintCard(card);
    void root.offsetWidth;            // restart every animation from its first frame
    root.classList.remove('il-reset');
    void root.offsetWidth;
    root.classList.add('on');
    fitScrim(root);
    /* The band needs no help here: the old room's cue fades out over a
       second and a half as it is torn down underneath, and the new one
       fades in over as long when the room begins — a crossfade across
       the painting, with these sounds in the middle of it. */
    sound(to, weather);
    const t0 = Date.now();
    try {
      if (!await sleep(min * SWAP_AT, signal)) return false;
      root.classList.add('turn');     // the hour starts to change
      const turned = Date.now();
      await work(lifted);
      if (signal && signal.aborted) return false;
      const drawn = typeof Engine !== 'undefined' && Engine.drawn ? Engine.drawn() : Promise.resolve();
      await Promise.race([drawn, sleep(DRAWN_CAP)]);
      if (!await sleep(Math.max(0, min - (Date.now() - t0), TURN_MS - (Date.now() - turned)), signal)) return false;
      return true;
    } finally {
      lift();
      if (owner === me) { owner = null; root.classList.remove('on', 'turn'); }
    }
  }

  return { play, cardFor, weatherFor, HOURS, MIN, MIN_CARD,
           get showing() { return !!owner; } };
})();
