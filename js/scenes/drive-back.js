/* ------------------------------------------------------------------
   drive-back.js — the car back to the castle, before breakfast.

   The programme drives them back in the morning and they come in one
   at a time. Until your own knock on the great hall's door you are in
   the back of a car: the glen going past the window, the weather on the
   glass, nobody at the table able to hear you and you able to hear
   none of them. Then the car slows, the castle comes round the bend,
   and the picture gives way to the door.

   Drawn in the page, not the 3D scene: an SVG car interior with the
   window cut out of it, and behind the glass four painted strips of
   landscape scrolled at their own speeds (far hills, the loch, the
   wood, the verge), moved from the scene's own update so the car can
   slow down smoothly rather than jump. Everything is generated here,
   so there is nothing to load.

   `show({ weather, day })`, `step(dt)`, `note(text)`, `arrive(secs)`
   (slow to a stop with the castle in view over `secs`), `hide()`.
------------------------------------------------------------------ */
const DriveBack = (() => {
  let root = null, layers = [], castle = null, noteEl = null;
  let speed = 0, want = 1, dist = 0, t = 0, arriving = null, on = false;

  const svgURI = (w, h, body) => 'url("data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + body + '</svg>') + '")';

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return s / 4294967296; };
  }

  /* A ridge line across a tile that wraps: whole-number sine terms, so
     the right edge meets the left. */
  function ridge(w, base, amp, terms, seed) {
    const r = rng(seed), ts = [];
    for (let k = 0; k < terms.length; k++) ts.push({ k: terms[k], a: 1 / terms[k], p: r() * 6.283 });
    const norm = ts.reduce((n, q) => n + q.a, 0);
    let d = 'M0 ' + 400;
    for (let x = 0; x <= w; x += 8) {
      let v = 0;
      for (const q of ts) v += q.a * Math.sin(6.283 * q.k * x / w + q.p);
      d += ' L' + x + ' ' + (base - amp * (0.5 + 0.5 * v / norm)).toFixed(1);
    }
    return d + ' L' + w + ' 400 Z';
  }

  function tiles(weather) {
    const wet = weather === 'rain' || weather === 'storm';
    const grey = weather === 'overcast' || wet;
    const far = grey ? '#8a96a3' : '#8ea4bc', far2 = grey ? '#9aa4ad' : '#a9bdd0';
    const mid = grey ? '#46594a' : '#41633f', near = grey ? '#4f6a38' : '#5b8238';
    // far hills: two ranges, the further paler
    const farT = svgURI(2400, 400,
      '<path d="' + ridge(2400, 250, 170, [1, 2, 3, 5, 8, 13], 11) + '" fill="' + far2 + '"/>'
      + '<path d="' + ridge(2400, 300, 130, [1, 2, 4, 7, 11], 23) + '" fill="' + far + '"/>');
    // the loch, with the light on it
    let glints = '';
    const rg = rng(5);
    for (let i = 0; i < 40; i++) {
      const x = rg() * 1600, y = 8 + rg() * 60, w = 10 + rg() * 50;
      glints += '<rect x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" width="' + w.toFixed(0) + '" height="1.6" fill="#fff" opacity="' + (0.15 + rg() * 0.35).toFixed(2) + '"/>';
    }
    const lochT = svgURI(1600, 80,
      '<defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (grey ? '#9fadb8' : '#a8c6dc') + '"/>'
      + '<stop offset="1" stop-color="' + (grey ? '#5f6f7c' : '#5c84a3') + '"/></linearGradient></defs>'
      + '<rect width="1600" height="80" fill="url(#w)"/>' + glints);
    // the wood: a rolling bank of pines, each tree its own little spire
    let pines = '';
    const rp = rng(41);
    const bank = (x) => 150 - 40 * (0.5 + 0.5 * Math.sin(6.283 * 2 * x / 1800 + 1.3)) - 18 * Math.sin(6.283 * 5 * x / 1800);
    for (let x = -20; x < 1820; x += 9 + rp() * 14) {
      const h = 40 + rp() * 55, w = h * (0.32 + rp() * 0.12), y = bank(((x % 1800) + 1800) % 1800) + 30;
      const c = rp() < 0.5 ? mid : (grey ? '#3c4d40' : '#365634');
      for (const o of [0, -1800, 1800]) {
        const X = x + o;
        if (X < -60 || X > 1860) continue;
        pines += '<path d="M' + X.toFixed(1) + ' ' + (y - h).toFixed(1) + ' L' + (X + w / 2).toFixed(1) + ' ' + y.toFixed(1)
          + ' L' + (X - w / 2).toFixed(1) + ' ' + y.toFixed(1) + 'Z" fill="' + c + '"/>';
      }
    }
    const midT = svgURI(1800, 260, '<rect y="170" width="1800" height="90" fill="' + mid + '"/>' + pines);
    // the verge: grass, a dry-stone dyke and a post now and then
    let stones = '';
    const rs = rng(77);
    for (let x = 0; x < 1400; x += 14 + rs() * 16) {
      const w = 16 + rs() * 22, h = 9 + rs() * 8, y = 64 + rs() * 22;
      stones += '<rect x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" width="' + w.toFixed(0) + '" height="' + h.toFixed(0) + '" rx="4" fill="'
        + ['#6d6a62', '#7d796f', '#5f5c55', '#888276'][Math.floor(rs() * 4)] + '"/>';
    }
    let posts = '';
    for (let x = 90; x < 1400; x += 350) posts += '<rect x="' + x + '" y="10" width="11" height="110" fill="#3a2d22"/>';
    const nearT = svgURI(1400, 160,
      '<rect y="40" width="1400" height="120" fill="' + near + '"/>' + stones
      + '<rect y="100" width="1400" height="60" fill="' + (grey ? '#43592f' : '#4c6e2e') + '"/>' + posts);
    return { farT, lochT, midT, nearT, wet, grey };
  }

  // a baronial house: round towers with candle-snuffer roofs, crow-stepped gables
  const CASTLE = '<svg viewBox="0 0 520 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<g fill="currentColor">'
    + '<rect x="120" y="120" width="290" height="180"/>'
    + '<path d="M150 120 v-22 h12 v-12 h12 v-12 h12 v-12 h12 v12 h12 v12 h12 v12 h12 v22z"/>'
    + '<path d="M300 120 v-30 h14 v-14 h14 v-14 h14 v14 h14 v14 h14 v30z"/>'
    + '<rect x="70" y="90" width="64" height="210"/><path d="M62 92 L102 10 L142 92z"/>'
    + '<rect x="398" y="70" width="76" height="230"/><path d="M390 72 L436 -6 L482 72z"/>'
    + '<rect x="250" y="60" width="40" height="80"/><path d="M244 62 L270 18 L296 62z"/>'
    + '</g><g fill="#f6e3b0" opacity=".55">'
    + '<rect x="160" y="160" width="12" height="22"/><rect x="200" y="160" width="12" height="22"/><rect x="330" y="150" width="12" height="22"/>'
    + '<rect x="360" y="150" width="12" height="22"/><rect x="95" y="140" width="12" height="20"/><rect x="428" y="120" width="12" height="20"/>'
    + '<rect x="240" y="220" width="40" height="80" opacity=".5"/></g></svg>';

  // the back of a car: the door, the rear window cut out of it, a headrest, the seal
  const FRAME = '<svg class="db-frame" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
    + '<defs><linearGradient id="dbTrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b231c"/><stop offset=".55" stop-color="#17120e"/><stop offset="1" stop-color="#0c0a08"/></linearGradient>'
    + '<linearGradient id="dbGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/>'
    + '<stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
    + '<radialGradient id="dbShade" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient></defs>'
    + '<path fill="url(#dbTrim)" fill-rule="evenodd" d="M-400 -400 H2000 V1300 H-400Z M230 150 Q236 118 270 116 H1250 Q1300 118 1330 160 L1440 560 Q1446 610 1396 612 H262 Q222 612 222 572Z"/>'
    + '<path fill="none" stroke="#060504" stroke-width="16" stroke-linejoin="round" d="M230 150 Q236 118 270 116 H1250 Q1300 118 1330 160 L1440 560 Q1446 610 1396 612 H262 Q222 612 222 572Z"/>'
    + '<path fill="url(#dbGlass)" d="M230 150 Q236 118 270 116 H1250 Q1300 118 1330 160 L1440 560 Q1446 610 1396 612 H262 Q222 612 222 572Z"/>'
    + '<path d="M1110 112 L1190 616" stroke="#0b0907" stroke-width="30"/>'
    + '<path d="M150 650 H1500" stroke="#5a4a3a" stroke-width="3" opacity=".7"/><path d="M150 656 H1500" stroke="#000" stroke-width="2" opacity=".5"/>'
    + '<rect x="260" y="720" width="150" height="26" rx="13" fill="#0a0806" stroke="#4d4033" stroke-width="2"/>'
    + '<path d="M-20 260 Q60 230 150 250 Q205 262 210 330 L214 520 Q212 570 150 578 L-20 590Z" fill="#100c0a"/>'
    + '<rect width="1600" height="900" fill="url(#dbShade)"/></svg>';

  function build(weather, day) {
    if (typeof document === 'undefined' || !document.createElement || !document.body) return null;
    const T = tiles(weather);
    const el = document.createElement('div');
    el.id = 'drive-back';
    el.className = 'db w-' + (weather || 'clear');
    el.innerHTML = '<div class="db-out">'
      + '<div class="db-sky"></div>'
      + '<div class="db-l db-far" style="background-image:' + T.farT + '"></div>'
      + '<div class="db-castle">' + CASTLE + '</div>'
      + '<div class="db-l db-loch" style="background-image:' + T.lochT + '"></div>'
      + '<div class="db-l db-mid" style="background-image:' + T.midT + '"></div>'
      + '<div class="db-haze"></div>'
      + '<div class="db-l db-near" style="background-image:' + T.nearT + '"></div>'
      + (T.wet ? '<div class="db-drops"></div><div class="db-streaks"></div>' : '')
      + '</div>' + FRAME
      + '<div class="db-card"><div class="db-kicker">Day ' + ((day | 0) + 1) + ' · Morning</div>'
      + '<div class="db-title">The drive back</div>'
      + '<div class="db-sub">Nobody at breakfast can hear you until you walk in.</div>'
      + '<div class="db-note"></div></div>';
    document.body.appendChild(el);
    layers = [
      [el.querySelector('.db-far'), 14],
      [el.querySelector('.db-loch'), 34],
      [el.querySelector('.db-mid'), 120],
      [el.querySelector('.db-near'), 1050],
    ];
    castle = el.querySelector('.db-castle');
    noteEl = el.querySelector('.db-note');
    return el;
  }

  function show(o = {}) {
    hide(true);
    root = build(o.weather, o.day);
    if (!root) return;
    on = true; speed = 1; want = 1; dist = Math.random() * 4000; t = 0; arriving = null;
    void root.offsetWidth;
    root.classList.add('on');
    paint();
  }

  function paint() {
    if (!root) return;
    const bob = Math.sin(t * 9.1) * 0.9 * speed + Math.sin(t * 2.3) * 1.4 * speed;
    for (const [l, k] of layers) {
      if (!l || !l.style) continue;
      l.style.backgroundPositionX = (-(dist * k) % 100000).toFixed(1) + 'px';
      l.style.transform = 'translateY(' + (bob * (k > 500 ? 1.6 : k > 100 ? 0.8 : 0.3)).toFixed(2) + 'px)';
    }
    if (castle && castle.style) {
      // it comes round the bend from ahead, and stops in the window
      const k = arriving ? U.clamp(arriving.t / arriving.secs, 0, 1) : 0;
      const e = 1 - Math.pow(1 - k, 3);
      castle.style.transform = 'translateX(' + (120 - 78 * e).toFixed(2) + 'vw)';
      castle.style.opacity = String(arriving ? Math.min(1, k * 4) : 0);
    }
  }

  function step(dt) {
    if (!on || !root) return;
    dt = Math.min(dt, 0.1);
    t += dt;
    if (arriving) {
      arriving.t += dt;
      want = Math.max(0, 1 - arriving.t / arriving.secs);
    }
    speed += (want - speed) * Math.min(1, dt * (arriving ? 2.2 : 0.8));
    dist += speed * dt;
    paint();
  }

  function note(text) { if (noteEl) noteEl.textContent = text || ''; }

  function arrive(secs = 2.4) {
    if (!root) return;
    arriving = { t: 0, secs: Math.max(0.6, secs) };
    root.classList.add('arriving');
    const tl = root.querySelector('.db-title'), sub = root.querySelector('.db-sub');
    if (tl) tl.textContent = 'The castle';
    if (sub) sub.textContent = 'Out you get. Knock, and go in.';
    note('');
  }

  function hide(now) {
    on = false;
    const el = root;
    root = null; layers = []; castle = null; noteEl = null;
    if (!el) return;
    if (now || !el.classList) { if (el.parentNode) el.parentNode.removeChild(el); return; }
    el.classList.remove('on');
    el.classList.add('off');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
  }

  return { show, step, note, arrive, hide, get on() { return on; } };
})();
