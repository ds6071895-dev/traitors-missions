/* ------------------------------------------------------------------
   chore-games.js — the little puzzles at the stations.

   Each is a few seconds of something to do with your hands while the
   room carries on round you — and it does carry on: the panel is small,
   the castle stays live behind it, and anybody can walk up behind you
   while your eyes are on a safe dial. That is the other half of why
   they exist.

   Every puzzle is different to play, and seeded from the job, so the
   same station on another day is a different safe, a different tune.
   None of them can be failed for good: a mistake costs a second, never
   the job.

     safe     a combination glimpsed on the back of the frame, then keyed
     wires    four coloured wires, joined to their partners
     candles  six candles, lit in the order they are numbered
     pour     hold to pour; stop in the band
     bells    the bells ring a tune; ring it back
     letters  each letter into the pigeonhole of its seal
     tartan   which of these is the clan's
     tune     slide the string until the wave sits on the line
     bats     shoo the bats out of the rafters before they settle
     lock     stop each pin as it passes the sweet spot
     bellows  pump the fire up, in time with its breath
     brew     the tonic: the ingredients, in the order of the recipe
     pairs    place cards: remember the crests, then turn up the pairs
     frames   three crooked portraits, nudged until they hang level
     spot     two paintings, and the three things the forger changed
     bottles  five bottles of claret, swapped into the order of their years
     mouse    a mouse in the pantry wall, caught as it peeks out
     pipes    a few pipe sections, turned until the water runs through
     scales   weights onto a pan until it balances the gold one
     window   grime on the glass, rubbed off until the loch shows
     darts    a wobbling sight, thrown when it crosses the gold
     pot      the red, pulled back and let go, off the cushions
     cups     three quaichs and a ring, followed through the shuffle
     stack    logs swung over the pile and dropped square
     reel     notes down three lanes, struck on the line
     lantern  a dark room, a lantern, and three things on a list
     clock    two hands dragged to the time on the card
     fish     a float that nibbles, then goes under: strike
     tray     a tureen on a tipping tray, kept in the gold
     parry    a blade from one side, sometimes a feint: parry it
     trace    a dotted crest in the hoop, traced in gold thread
     bagpipes the bag kept in a wandering band, and the pipes play
     ledger   a column of pounds, and the right total
     crank    a handle wound round to haul the dumbwaiter up

   Every panel says how it is played in one line under its title, so
   nobody has to work a puzzle out with a Traitor walking up behind
   them, and stamps its goal across the top as it opens. The pips and
   the line under the puzzle are how it is going. A right move rings, a
   wrong one thumps and flashes red, and a finished job pays out where
   you can see it.

   `open(task, opts)` puts one up and resolves true when it is done,
   false if it was walked away from. Escape closes it. `opts.practice`
   marks it as a practice run, for the empty castle.
------------------------------------------------------------------ */
const ChoreGames = (() => {

  let current = null;            // { root, cleanup, resolve }

  const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  /* A small tone for the puzzles that have a sound of their own. */
  function tone(freq, dur = 0.25, type = 'triangle', vol = 0.18) {
    try {
      const ctx = (typeof AudioBus !== 'undefined' && (AudioBus.ctx || AudioBus.init())) || null;
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur + 0.05);
    } catch (e) { /* a puzzle without sound is still a puzzle */ }
  }
  /* A falling tone: the thump of a wrong move, rather than a buzzer. */
  function thud(from = 150, to = 52, dur = 0.2, vol = 0.24) {
    try {
      const ctx = (typeof AudioBus !== 'undefined' && (AudioBus.ctx || AudioBus.init())) || null;
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(from, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur + 0.05);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur + 0.1);
    } catch (e) { /* silence is a fine wrong answer too */ }
  }
  const buzz = (ms) => { if (typeof Input !== 'undefined' && Input.haptic) Input.haptic(ms); };
  const click = () => { if (typeof AudioBus !== 'undefined') AudioBus.play('ui-click'); };
  // a right move: a short rising note, higher the further along you are
  const step = (k = 0) => tone(440 * Math.pow(2, Math.min(k, 12) / 12 * 2), 0.14, 'sine', 0.11);
  // done: a little fanfare in D minor, up to the octave
  const good = () => [587, 698, 880, 1175].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'triangle', 0.13), i * 75));
  const bad = () => { thud(); buzz(25); };

  /* A spray of gold off the panel when a job is done. */
  function burst(panel) {
    for (let i = 0; i < 28; i++) {
      const sp = el('i', 'cg-spark' + (i % 3 ? '' : ' big'));
      const a = (i / 28) * Math.PI * 2 + Math.random() * 0.2;
      sp.style.setProperty('--dx', (Math.cos(a) * (110 + Math.random() * 110)).toFixed(0) + 'px');
      sp.style.setProperty('--dy', (Math.sin(a) * (90 + Math.random() * 90)).toFixed(0) + 'px');
      panel.appendChild(sp);
      setTimeout(() => sp.remove(), 1000);
    }
  }

  // the panel jolts and its edge flashes red
  function shake(node) {
    node.classList.remove('cg-shake', 'cg-miss');
    void node.offsetWidth;
    node.classList.add('cg-shake', 'cg-miss');
  }

  function shuffled(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ---------------- the pictures ----------------

     Drawn, not typed. An emoji is whatever the player's machine says it
     is — a different toadstool on every phone, a box on an old laptop —
     and a puzzle about spotting the one thing that changed cannot have
     its things change under it. So each one is a few lines of SVG on a
     24-unit grid, sized in `em` so it drops in where the emoji was.

     `c` is the colour it is painted in; `class="s"` marks a stroked
     line rather than a filled shape. A picture with no `c` takes the
     colour of whatever it sits on, which is how the crests go from ink
     on the card to green when the pair is found. */
  const PICS = {
    // the forgery
    moon:   { c: '#f2e3a0', d: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' },
    tree:   { c: '#5fae68', d: '<path d="M12 2 5 11h4l-5 7h16l-5-7h4z"/><path fill="#8a5a34" d="M11 18h2v4h-2z"/>' },
    castle: { c: '#c4bcac', d: '<path d="M3 21V8h2v2h2V8h2v4h6V8h2v2h2V8h2v13h-7v-4a2 2 0 0 0-4 0v4z"/>' },
    stag:   { c: '#d9b77a', d: '<path class="s" d="M8 3v4L5 5M8 7l2.5 3M16 3v4l3-2M16 7l-2.5 3"/><path d="M9.5 10h5l1 4-3.5 7-3.5-7z"/>' },
    gull:   { c: '#eef3f7', d: '<path class="s" style="stroke-width:2.6" d="M2 9c3.5 0 6.5 2 10 6 3.5-4 6.5-6 10-6"/>' },
    boat:   { c: '#ece4d0', d: '<path d="M11 3v12H4z"/><path d="M13 6l6 9h-6z"/><path fill="#8a5a34" d="M3 17h18l-3 4H6z"/>' },
    candle: { c: '#efe6d4', d: '<path d="M9 10h6v11H9z"/><path fill="#ffb347" d="M12 3c2.2 2 2.2 4.5 0 6-2.2-1.5-2.2-4 0-6z"/>' },
    key:    { c: '#e9c46a', d: '<circle class="s" cx="7.5" cy="7.5" r="4"/><path class="s" d="M10.5 10.5 20 20M16 16l2.5-2.5M18.5 18.5 21 16"/>' },
    wine:   { c: '#c23a55', d: '<path d="M7 3h10c0 5-2 8.5-5 8.5S7 8 7 3z"/><path class="s" d="M12 11.5V20M8.5 21h7"/>' },
    rose:   { c: '#e04a64', d: '<circle cx="12" cy="8" r="5"/><path class="s" style="stroke:#5fae68" d="M12 13v9M12 18c-2 0-3.5-1-4.5-2.5M12 16.5c2 0 3.5-1 4.5-2.5"/>' },
    owl:    { c: '#c9a36a', d: '<path class="s" d="M6 5l3 3h6l3-3v10a6 6 0 0 1-12 0z"/><circle class="s" cx="9.5" cy="11.5" r="2"/><circle class="s" cx="14.5" cy="11.5" r="2"/>' },
    anchor: { c: '#a9bdd0', d: '<circle class="s" cx="12" cy="5" r="2"/><path class="s" d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/>' },
    shoe:   { c: '#b3b9c1', d: '<path class="s" style="stroke-width:3.2" d="M7 4v8a5 5 0 0 0 10 0V4"/>' },
    apple:  { c: '#8cc34a', d: '<path d="M12 7.5c-4-2-8 0-8 5 0 5 3 9 6 9 .9 0 1.2-.5 2-.5s1.1.5 2 .5c3 0 6-4 6-9 0-5-4-7-8-5z"/><path class="s" style="stroke:#8a5a34" d="M12 7.5c0-2 1-4 3-4.5"/>' },
    star:   { c: '#f2c14e', d: '<path d="M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5L5.5 21l2-7.5L2 9h7z"/>' },
    bell:   { c: '#c8873a', d: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z"/><circle cx="12" cy="21" r="1.7"/>' },

    // the laird's tonic
    thistle: { c: '#a978d6', d: '<path class="s" d="M8 3.5l1.5 4M12 2v5.5M16 3.5l-1.5 4"/><path d="M8 8h8l-1.2 4H9.2z"/>'
                                + '<path fill="#5f9a3e" d="M9.2 12h5.6l-1.4 4h-2.8z"/><path class="s" style="stroke:#5f9a3e" d="M12 16v6"/>' },
    heather: { c: '#d080d2', d: '<path class="s" style="stroke:#5f9a3e" d="M12 22V5"/><circle cx="12" cy="4" r="2"/><circle cx="9" cy="7.5" r="2.2"/>'
                                + '<circle cx="15" cy="10" r="2.2"/><circle cx="9" cy="12.5" r="2.2"/><circle cx="15" cy="15" r="2.2"/><circle cx="9" cy="17.5" r="2.2"/>' },
    whisky:  { c: '#d4e3ec', d: '<path class="s" d="M5.5 6h13L17 21H7z"/><path fill="#d08a2a" d="M7.1 12h9.8l-.7 7.5H7.8z"/>' },
    honey:   { c: '#e8a92a', d: '<rect x="6" y="9" width="12" height="12" rx="2.5"/><rect fill="#8a5a34" x="5" y="5" width="14" height="4" rx="1"/>'
                                + '<path fill="#fff3c4" opacity=".5" d="M8.5 12h2v6h-2z"/>' },
    salt:    { c: '#e8eef4', d: '<path d="M6.5 10h11l1.3 12H5.2z"/><path fill="#9aa6b2" d="M6.5 10a5.5 5.5 0 0 1 11 0z"/>'
                                + '<circle fill="#3a4a5a" cx="10" cy="7.2" r="1"/><circle fill="#3a4a5a" cx="14" cy="7.2" r="1"/><circle fill="#3a4a5a" cx="12" cy="5.6" r="1"/>' },
    toadstool: { c: '#de4632', d: '<path d="M2.5 12a9.5 7.5 0 0 1 19 0z"/><path fill="#efe6d4" d="M10 12h4l1 9H9z"/>'
                                + '<circle fill="#fff" cx="8" cy="8.5" r="1.4"/><circle fill="#fff" cx="13" cy="6.5" r="1.2"/><circle fill="#fff" cx="16.5" cy="9.5" r="1.3"/>' },
    bramble: { c: '#9b5cc4', d: '<path fill="#5f9a3e" d="M12 8.5C9 8 7 5.5 7.5 3c3 .3 4.5 2.5 4.5 5.5z"/>'
                                + '<circle cx="10" cy="11" r="2.4"/><circle cx="14" cy="11" r="2.4"/><circle cx="8" cy="14.5" r="2.4"/><circle cx="12" cy="14.5" r="2.4"/>'
                                + '<circle cx="16" cy="14.5" r="2.4"/><circle cx="10" cy="18" r="2.4"/><circle cx="14" cy="18" r="2.4"/>' },
    water:   { c: '#5fb4e8', d: '<path d="M12 2.5c4 5.5 7 9 7 12.5a7 7 0 0 1-14 0c0-3.5 3-7 7-12.5z"/>'
                                + '<path fill="#d8f0ff" opacity=".7" d="M9 15a3 3 0 0 0 3 3v-1.6A1.4 1.4 0 0 1 10.6 15z"/>' },

    // place-card crests: ink, so no colour of their own
    crown:  { d: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>' },
    cross:  { d: '<path d="M9.5 2h5l-1 7.5 7.5-1v5l-7.5-1 1 7.5h-5l1-7.5-7.5 1v-5l7.5 1z"/>' },
    fleur:  { d: '<path d="M12 2c2.6 2.6 3 6.4 0 10-3-3.6-2.6-7.4 0-10z"/>'
                 + '<path class="s" d="M11.5 12.5C9 8.5 3.5 9 4 13c.4 2.5 3.4 2.6 4.4.6M12.5 12.5C15 8.5 20.5 9 20 13c-.4 2.5-3.4 2.6-4.4.6M7 15h10M12 15v6"/>' },
    sun:    { d: '<circle cx="12" cy="12" r="4.5"/><path class="s" d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>' },
    sword:  { d: '<path d="M10.5 3.5 12 1.5l1.5 2V15h-3z"/><path class="s" d="M7.5 16h9M12 16v5"/>' },

    // the pantry and the cistern
    mouse:  { c: '#9a8a7a', d: '<circle cx="6.5" cy="8" r="3.6"/><circle cx="17.5" cy="8" r="3.6"/>'
                 + '<circle fill="#d9a0a0" cx="6.5" cy="8" r="1.8"/><circle fill="#d9a0a0" cx="17.5" cy="8" r="1.8"/>'
                 + '<ellipse cx="12" cy="14.5" rx="6.5" ry="6"/><circle fill="#0b0806" cx="9.6" cy="13.5" r="1.1"/><circle fill="#0b0806" cx="14.4" cy="13.5" r="1.1"/>'
                 + '<circle fill="#e58a9a" cx="12" cy="17" r="1.3"/>'
                 + '<path class="s" style="stroke:#e2d9ce;stroke-width:.8" d="M10 17.5 4.5 16.5M10 18l-5.5 1.5M14 17.5l5.5-1M14 18l5.5 1.5"/>' },
    tap:    { c: '#a9bdd0', d: '<circle class="s" cx="9" cy="6.5" r="3.5"/><path class="s" d="M9 10v3"/><path d="M2 13h20v5H2z"/>' },
    tank:   { c: '#8a6a4a', d: '<path d="M6 3h12c1.5 3 1.5 15 0 18H6c-1.5-3-1.5-15 0-18z"/><path class="s" style="stroke:#3a2a1a" d="M5 8h14M5 16h14"/>' },
  };

  function pic(name) {
    const p = PICS[name];
    if (!p) return '';
    return '<svg class="cg-pic" viewBox="0 0 24 24" aria-hidden="true"' + (p.c ? ' style="color:' + p.c + '"' : '') + '>' + p.d + '</svg>';
  }

  /* ---------------- the boards ----------------

     A canvas for the puzzles that are drawn rather than built: `w` × `h`
     in the units the puzzle thinks in, painted at the screen's own
     sharpness and shrunk to fit whatever the panel has room for (the
     CSS does that with --w and --ar). `at(e)` is a pointer event in
     those units. */
  function board(parent, cls, w, h) {
    const cv = el('canvas', 'cg-canvas ' + (cls || ''));
    const dpr = Math.max(1, Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.setProperty('--w', w + 'px');
    cv.style.setProperty('--ar', String(w / h));
    cv.style.aspectRatio = w + ' / ' + h;
    parent.appendChild(cv);
    const g = cv.getContext('2d');
    if (g && g.setTransform) g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const at = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * w / (r.width || w), y: (e.clientY - r.top) * h / (r.height || h) };
    };
    return { cv, g, w, h, at };
  }

  /* A frame loop for a puzzle: `fn(dt, t)` every frame until the
     returned stop is called (the puzzle's cleanup does that). A frame
     that throws stops the loop rather than the castle. */
  function loop(fn) {
    let raf = 0, last = 0, t = 0, live = true;
    const tick = (now) => {
      if (!live) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now; t += dt;
      try { fn(dt, t); } catch (e) { console.warn('puzzle frame failed:', e); live = false; return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { live = false; cancelAnimationFrame(raf); };
  }

  /* ---------------- the frame ---------------- */

  function open(task, opts = {}) {
    close(false);
    const type = task.type;
    const game = GAMES[type];
    if (!game) return Promise.resolve(false);
    const rng = U.makeRng(((task.seed || 7) >>> 0) || 7);
    const meta = (typeof Chores !== 'undefined' && Chores.TYPES[type]) || { title: type };
    const touch = typeof Input !== 'undefined' && Input.isTouch;
    const root = el('div', 'cg-wrap' + (touch ? ' touch' : ''));
    const panel = el('div', 'cg-panel cg-game-' + type);
    const head = el('div', 'cg-head');
    head.appendChild(el('div', 'cg-title', (opts.practice ? '<small>Practice</small>' : '') + esc(meta.title)));
    const shut = el('button', 'cg-close', '✕');
    shut.type = 'button';
    shut.title = 'Walk away (Esc)';
    shut.setAttribute('aria-label', 'Walk away');
    head.appendChild(shut);
    const how = el('div', 'cg-how', '<b>How</b><span>' + esc(meta.how || '') + '</span>'
      + (meta.keys && !touch ? '<kbd>' + esc(meta.keys) + '</kbd>' : ''));
    if (!meta.how) how.hidden = true;
    const body = el('div', 'cg-body');
    const row = el('div', 'cg-steps');
    row.hidden = true;
    const hint = el('div', 'cg-hint', '');
    panel.append(head, how, body, row, hint);
    if (meta.goal) panel.appendChild(el('div', 'cg-goal', esc(meta.goal)));
    /* Progress as pips: `pips(n)` puts up n of them and returns a
       setter, `set(k)` lights the first k. A pip that lights pops. */
    const pips = (n) => {
      row.innerHTML = '';
      row.hidden = false;
      const dots = Array.from({ length: n }, () => row.appendChild(el('i')));
      let lit = 0;
      return (k) => {
        dots.forEach((d, i) => {
          d.classList.toggle('on', i < k);
          if (i < k && i >= lit) { d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop'); }
        });
        lit = k;
      };
    };
    root.appendChild(panel);
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('on'));

    return new Promise((resolve) => {
      let finished = false;
      const finish = (ok) => {
        if (finished) return;
        finished = true;
        if (ok) {
          panel.classList.add('cg-done');
          good();
          buzz(40);
          burst(panel);
          const pay = typeof Chores !== 'undefined' && !opts.practice ? '+' + U.money(Chores.VALUE) : 'Done';
          panel.appendChild(el('div', 'cg-reward', esc(pay)));
          const medal = rate(type, (now() - t0) / 1000, meta);
          if (medal) panel.appendChild(el('div', 'cg-medal' + (medal.best ? ' best' : '') + (medal.fast ? ' fast' : ''), medal.html));
          setTimeout(() => close(true), medal && (medal.best || medal.fast) ? 1150 : 900);
        } else close(false);
      };
      // stopped here, so the Escape that shuts a puzzle does not also
      // leave the castle behind it
      const onKey = (e) => {
        if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      };
      window.addEventListener('keydown', onKey, true);
      shut.onclick = () => { click(); finish(false); };
      let cleanup = null;
      const t0 = now();
      try {
        cleanup = game({ body, hint, rng, done: () => finish(true), panel, pips });
      } catch (e) {
        console.warn('chore game failed:', e);
        finish(true);                     // never strand a job behind a broken puzzle
      }
      current = {
        root,
        resolve,
        cleanup: () => {
          window.removeEventListener('keydown', onKey, true);
          if (typeof cleanup === 'function') { try { cleanup(); } catch (e) {} }
        },
      };
      if (opts.signal) opts.signal.addEventListener('abort', () => finish(false), { once: true });
    });
  }

  /* How quick that was: a stamp under the money for beating the AI's
     own time, and your best for each kind of job, kept on this machine. */
  const BEST_KEY = 'traitors.jobBests';
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  function rate(type, secs, meta) {
    if (!(secs > 0.3)) return null;
    let bests = {};
    try { bests = JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch (e) { bests = {}; }
    const prev = Number(bests[type]) || 0;
    const best = !prev || secs < prev;
    if (best) {
      bests[type] = Math.round(secs * 10) / 10;
      try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch (e) {}
    }
    const s = meta && meta.secs;
    const fast = s ? (secs <= s[0] ? 'Lightning!' : secs <= s[1] ? 'Nimble fingers' : '') : '';
    const time = secs.toFixed(1) + ' s';
    const tail = best && prev ? ' · new best!' : prev ? ' · best ' + prev.toFixed(1) + ' s' : '';
    return { fast: !!fast, best: best && !!prev,
             html: (fast ? '<b>' + esc(fast) + '</b>' : '') + '<span>' + esc(time + tail) + '</span>' };
  }

  function close(ok) {
    const c = current;
    if (!c) return;
    current = null;
    c.cleanup();
    c.root.classList.remove('on');
    setTimeout(() => c.root.remove(), 220);
    c.resolve(!!ok);
  }

  /* ---------------- the puzzles ---------------- */

  const GAMES = {

    /* The combination is pencilled on the back of the portrait. You get
       a look at it, the frame swings back, and you key it in. */
    safe({ body, hint, rng, done, panel, pips }) {
      const P = pips(4);
      const code = Array.from({ length: 4 }, () => rng.int(0, 9)).join('');
      const note = el('div', 'cg-note', '<span>Pencilled on the back of the frame</span><b>' + code + '</b>');
      const screen = el('div', 'cg-screen', '····');
      const pad = el('div', 'cg-pad');
      body.append(note, screen, pad);
      let entry = '';
      let peekT = null;
      const peek = (ms) => {
        note.classList.add('on');
        clearTimeout(peekT);
        peekT = setTimeout(() => note.classList.remove('on'), ms);
      };
      peek(2300);
      hint.textContent = 'Watch the note…';
      setTimeout(() => { if (entry === '') hint.textContent = 'Now key it in.'; }, 2300);
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '↺', '0', '⏎'];
      const press = (k) => {
        click();
        if (k === '↺') { entry = ''; peek(1400); }
        else if (k === '⏎') {
          if (entry === code) { screen.textContent = 'OPEN'; done(); return; }
          bad(); shake(panel); entry = ''; peek(1200);
        } else if (entry.length < 4) {
          entry += k;
          tone(500 + Number(k) * 40, 0.08, 'square', 0.05);
          if (entry.length === 4 && entry === code) { screen.textContent = 'OPEN'; done(); return; }
          if (entry.length === 4) { bad(); shake(panel); entry = ''; peek(1200); }
        }
        screen.textContent = (entry + '····').slice(0, 4);
        P(entry.length);
      };
      for (const k of keys) {
        const b = el('button', 'cg-key', k);
        b.type = 'button';
        b.onclick = () => press(k);
        pad.appendChild(b);
      }
      const onKey = (e) => {
        if (/^Digit\d$/.test(e.code)) press(e.code.slice(5));
        else if (/^Numpad\d$/.test(e.code)) press(e.code.slice(6));
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') press('⏎');
        else if (e.code === 'Backspace') press('↺');
      };
      window.addEventListener('keydown', onKey);
      return () => { window.removeEventListener('keydown', onKey); clearTimeout(peekT); };
    },

    /* Four coloured wires hang loose from the winch; join each to its
       own colour across the box. Drag one end to the other, or tap one
       and then the other. */
    wires({ body, hint, rng, done, pips }) {
      const P = pips(4);
      const COLS = [['#e04848', 'red'], ['#3d7fe0', 'blue'], ['#f2c14e', 'gold'], ['#d057d0', 'heather']];
      const right = COLS.map((c, i) => i);
      for (let i = right.length - 1; i > 0; i--) { const j = rng.int(0, i); [right[i], right[j]] = [right[j], right[i]]; }
      const box = el('div', 'cg-wires');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 300 220');
      svg.classList.add('cg-wire-svg');
      box.appendChild(svg);
      body.appendChild(box);
      hint.textContent = '0 of 4 joined';
      const ys = [30, 85, 140, 195];
      const joined = new Set();
      let held = null;
      const dot = (x, y, col, side, idx) => {
        // a fingertip is wider than the brass terminal it is aiming at
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hit.setAttribute('cx', x); hit.setAttribute('cy', y); hit.setAttribute('r', 26);
        hit.setAttribute('class', 'cg-whit');
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 14);
        c.setAttribute('fill', col); c.setAttribute('class', 'cg-wdot');
        const down = (e) => {
          e.preventDefault();
          pick(side, idx);
          if (held) { drag.setAttribute('x1', x); drag.setAttribute('y1', y); drag.setAttribute('stroke', col); }
        };
        for (const n of [hit, c]) {
          n.setAttribute('data-side', side); n.setAttribute('data-idx', idx);
          n.addEventListener('pointerdown', down);
        }
        svg.append(hit, c);
        return c;
      };
      const stub = (x1, y, x2, col) => {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y); l.setAttribute('x2', x2); l.setAttribute('y2', y);
        l.setAttribute('stroke', col); l.setAttribute('stroke-width', 10); l.setAttribute('stroke-linecap', 'round');
        svg.appendChild(l);
      };
      // the wire you are holding follows your finger
      const drag = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      drag.setAttribute('class', 'cg-drag'); drag.setAttribute('stroke-width', 8); drag.setAttribute('stroke-linecap', 'round');
      svg.appendChild(drag);
      const toSvg = (e) => {
        const m = svg.getScreenCTM && svg.getScreenCTM();
        if (!m || !svg.createSVGPoint) return null;
        const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
        return p.matrixTransform(m.inverse());
      };
      const move = (e) => {
        if (!held) return;
        const p = toSvg(e);
        if (!p) return;
        drag.setAttribute('x2', p.x); drag.setAttribute('y2', p.y);
        drag.classList.add('on');
      };
      const up = (e) => {
        drag.classList.remove('on');
        if (!held) return;
        const t = document.elementFromPoint && document.elementFromPoint(e.clientX, e.clientY);
        const side = t && t.getAttribute && t.getAttribute('data-side');
        if (side && side !== held.side) pick(side, Number(t.getAttribute('data-idx')));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      const lefts = COLS.map((c, i) => { stub(0, ys[i], 30, c[0]); return dot(30, ys[i], c[0], 'l', i); });
      const rights = right.map((ci, i) => { stub(270, ys[i], 300, COLS[ci][0]); return dot(270, ys[i], COLS[ci][0], 'r', i); });
      function pick(side, idx) {
        click();
        if (!held) {
          if (side === 'l' && !joined.has(idx)) { held = { side, idx }; lefts[idx].classList.add('held'); }
          if (side === 'r') { const ci = right[idx]; if (!joined.has(ci)) { held = { side, idx: ci, r: idx }; rights[idx].classList.add('held'); } }
          return;
        }
        const a = held; held = null;
        lefts.forEach(d => d.classList.remove('held')); rights.forEach(d => d.classList.remove('held'));
        if (a.side === side) { pick(side, side === 'l' ? idx : idx); return; }
        const li = a.side === 'l' ? a.idx : idx;
        const ri = a.side === 'r' ? a.r : idx;
        if (right[ri] !== li) { bad(); hint.textContent = 'Not that one — match the colour.'; return; }
        joined.add(li);
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', 30); l.setAttribute('y1', ys[li]); l.setAttribute('x2', 270); l.setAttribute('y2', ys[ri]);
        l.setAttribute('stroke', COLS[li][0]); l.setAttribute('stroke-width', 9); l.setAttribute('stroke-linecap', 'round');
        svg.insertBefore(l, svg.firstChild);
        step(joined.size * 2);
        P(joined.size);
        hint.textContent = joined.size + ' of 4 joined';
        if (joined.size === COLS.length) done();
      }
      return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    },

    /* Six candles on the candelabra, each with a number scratched in the
       wax. Light them in order; a wrong one blows them all out. */
    candles({ body, hint, rng, done, panel, pips }) {
      const n = 6;
      const P = pips(n);
      const order = Array.from({ length: n }, (_, i) => i + 1);
      for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
      const row = el('div', 'cg-candles');
      body.appendChild(row);
      let next = 1;
      const say = () => { hint.textContent = 'Next: candle ' + next; };
      say();
      const nodes = order.map((num) => {
        const c = el('button', 'cg-candle', '<i class="cg-flame"></i><span>' + num + '</span>');
        c.type = 'button';
        c.style.height = (50 + rng.int(0, 28)) + '%';
        c.onclick = () => {
          if (c.classList.contains('lit')) return;
          if (num !== next) {
            bad(); shake(panel); next = 1; P(0);
            nodes.forEach(x => x.classList.remove('lit'));
            hint.textContent = 'Blown out. Start again from 1.';
            return;
          }
          c.classList.add('lit');
          step(num * 2);
          P(num);
          next++;
          if (next > n) done(); else say();
        };
        row.appendChild(c);
        return c;
      });
    },

    /* Hold to pour. The laird likes it to the line, not over it. */
    pour({ body, hint, rng, done, panel }) {
      const lo = 48 + rng.int(0, 22), hi = lo + 12;
      const glass = el('div', 'cg-glass', '<div class="cg-band"></div><div class="cg-dram"></div>');
      const btn = el('button', 'cg-pour-btn', 'HOLD TO POUR');
      btn.type = 'button';
      body.append(glass, btn);
      const band = glass.querySelector('.cg-band'), dram = glass.querySelector('.cg-dram');
      band.style.bottom = lo + '%'; band.style.height = (hi - lo) + '%';
      hint.textContent = 'Steady…';
      let level = 0, pouring = false, raf = 0, last = 0;
      const step = (t) => {
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
        last = t;
        if (pouring) level += dt * 38;
        dram.style.height = Math.min(100, level) + '%';
        if (level > 100) { pouring = false; bad(); shake(panel); level = 0; hint.textContent = 'Spilt. Again — gently.'; }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      const down = (e) => { e.preventDefault(); pouring = true; btn.classList.add('on'); };
      const up = () => {
        if (!pouring) return;
        pouring = false; btn.classList.remove('on');
        if (level >= lo && level <= hi) done();
        else if (level > hi) { bad(); shake(panel); level = 0; hint.textContent = 'Too much. Again.'; }
      };
      btn.addEventListener('pointerdown', down);
      window.addEventListener('pointerup', up);
      const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); if (e.type === 'keydown' && !e.repeat) down(e); if (e.type === 'keyup') up(); } };
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
      };
    },

    /* The bells ring a short tune; ring it back. Two rounds, the second
       a note longer. */
    bells({ body, hint, rng, done, panel, pips }) {
      const NOTES = [392, 466, 587, 698];
      const P = pips(2);
      const row = el('div', 'cg-bells');
      body.appendChild(row);
      const bells = NOTES.map((f, i) => {
        const b = el('button', 'cg-bell b' + i, '<i></i>');
        b.type = 'button';
        b.onclick = () => ring(i);
        row.appendChild(b);
        return b;
      });
      let round = 0, tune = [], at = 0, playing = true;
      const timers = [];
      const flash = (i) => {
        bells[i].classList.add('on');
        tone(NOTES[i], 0.5, 'sine', 0.18);
        timers.push(setTimeout(() => bells[i].classList.remove('on'), 300));
      };
      const play = () => {
        playing = true; at = 0;
        hint.textContent = 'Listen… (tune ' + (round + 1) + ' of 2)';
        tune.forEach((n, k) => timers.push(setTimeout(() => flash(n), 500 + k * 520)));
        timers.push(setTimeout(() => { playing = false; hint.textContent = 'Your turn — ring it back'; }, 500 + tune.length * 520));
      };
      const newRound = () => {
        tune = Array.from({ length: 3 + round }, () => rng.int(0, 3));
        play();
      };
      function ring(i) {
        if (playing) return;
        flash(i);
        if (tune[at] !== i) { bad(); shake(panel); timers.push(setTimeout(play, 600)); return; }
        at++;
        if (at >= tune.length) {
          round++;
          P(round);
          if (round >= 2) { playing = true; done(); return; }
          timers.push(setTimeout(newRound, 700));
        }
      }
      newRound();
      return () => timers.forEach(clearTimeout);
    },

    /* The post has come in. Every letter into the pigeonhole of the
       family whose seal is on it. Click a letter, then its hole. */
    letters({ body, hint, rng, done, pips }) {
      const SEALS = [['#b8323a', 'MacLeod'], ['#2f7d4a', 'Campbell'], ['#2f5fa8', 'Stewart']];
      const holes = el('div', 'cg-holes');
      const pile = el('div', 'cg-pile');
      body.append(holes, pile);
      let held = null, left = 0;
      const say = () => { hint.textContent = left + (left === 1 ? ' letter' : ' letters') + ' to post'; };
      SEALS.forEach((s, i) => {
        const h = el('button', 'cg-hole', '<i style="background:' + s[0] + '"></i><span>' + s[1] + '</span>');
        h.type = 'button';
        h.onclick = () => {
          if (!held) return;
          if (held.dataset.seal !== String(i)) { bad(); h.classList.add('miss'); setTimeout(() => h.classList.remove('miss'), 300); held.classList.remove('held'); held = null; hint.textContent = 'Wrong seal — check the colour.'; return; }
          held.remove(); held = null; left--; say();
          step((6 - left) * 2); P(6 - left);
          h.classList.add('fed'); setTimeout(() => h.classList.remove('fed'), 200);
          if (left <= 0) done();
        };
        holes.appendChild(h);
      });
      for (let k = 0; k < 6; k++) {
        const si = k < 3 ? k : rng.int(0, 2);
        const l = el('button', 'cg-letter', '<i style="background:' + SEALS[si][0] + '"></i>');
        l.type = 'button';
        l.dataset.seal = String(si);
        l.style.transform = 'rotate(' + rng.range(-12, 12).toFixed(1) + 'deg)';
        l.onclick = () => {
          if (held) held.classList.remove('held');
          held = l; l.classList.add('held'); click();
        };
        pile.appendChild(l); left++;
      }
      [...pile.children].sort(() => rng() - 0.5).forEach(c => pile.appendChild(c));
      const P = pips(left);
      say();
    },

    /* Which of these is the clan's tartan? Three of them, quickly. */
    tartan({ body, hint, rng, done, panel, pips }) {
      const P = pips(3);
      const PAL = ['#b8323a', '#2f7d4a', '#2f5fa8', '#f2c14e', '#1d1d24', '#e8e1cf', '#7a3f8f', '#d9772b'];
      const make = () => {
        const a = PAL[rng.int(0, PAL.length - 1)];
        let b = PAL[rng.int(0, PAL.length - 1)]; if (b === a) b = PAL[(PAL.indexOf(a) + 3) % PAL.length];
        let c = PAL[rng.int(0, PAL.length - 1)]; if (c === a || c === b) c = PAL[(PAL.indexOf(b) + 2) % PAL.length];
        return { a, b, c, w: 14 + rng.int(0, 3) * 4, t: 3 + rng.int(0, 2) * 2 };
      };
      const css = (p) => 'background-color:' + p.a + ';background-image:'
        + 'repeating-linear-gradient(0deg,transparent 0 ' + p.w + 'px,' + p.b + 'aa ' + p.w + 'px ' + (p.w * 2) + 'px),'
        + 'repeating-linear-gradient(90deg,transparent 0 ' + p.w + 'px,' + p.b + 'aa ' + p.w + 'px ' + (p.w * 2) + 'px),'
        + 'repeating-linear-gradient(0deg,transparent 0 ' + (p.w * 2 - p.t) + 'px,' + p.c + ' ' + (p.w * 2 - p.t) + 'px ' + (p.w * 2) + 'px),'
        + 'repeating-linear-gradient(90deg,transparent 0 ' + (p.w * 2 - p.t) + 'px,' + p.c + ' ' + (p.w * 2 - p.t) + 'px ' + (p.w * 2) + 'px)';
      const target = el('div', 'cg-tartan-target');
      const opts = el('div', 'cg-tartan-opts');
      body.append(target, opts);
      let round = 0;
      const next = () => {
        hint.textContent = 'Tartan ' + (round + 1) + ' of 3';
        const want = make();
        target.setAttribute('style', css(want));
        const choices = [want];
        while (choices.length < 4) {
          const c = make();
          // close but not the same: swap the stripe or the line
          if (rng() < 0.6) { c.a = want.a; if (rng() < 0.5) c.b = want.b; }
          if (c.a === want.a && c.b === want.b && c.c === want.c) continue;
          choices.push(c);
        }
        choices.sort(() => rng() - 0.5);
        opts.innerHTML = '';
        for (const c of choices) {
          const b = el('button', 'cg-tartan');
          b.type = 'button';
          b.setAttribute('style', css(c));
          b.onclick = () => {
            if (c !== want) { bad(); shake(panel); return; }
            round++; step(round * 3); P(round);
            if (round >= 3) done(); else next();
          };
          opts.appendChild(b);
        }
      };
      next();
    },

    /* Slide the tuning peg until the string's wave sits on the ghost of
       the right one, and hold it there for a moment. */
    tune({ body, hint, rng, done }) {
      const cv = el('canvas', 'cg-wave');
      cv.width = 320; cv.height = 120;
      const slider = el('input', 'cg-slider');
      slider.type = 'range'; slider.min = '0'; slider.max = '1000'; slider.value = String(rng() < 0.5 ? 80 : 920);
      body.append(cv, slider);
      hint.textContent = 'Closer…';
      const want = 0.25 + rng() * 0.5;
      const g = cv.getContext('2d');
      let raf = 0, held = 0, last = 0, t = 0, fin = false;
      const draw = (now) => {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now; t += dt;
        const v = Number(slider.value) / 1000;
        const off = Math.abs(v - want);
        g.clearRect(0, 0, cv.width, cv.height);
        const wave = (f, col, w) => {
          g.strokeStyle = col; g.lineWidth = w; g.beginPath();
          for (let x = 0; x <= cv.width; x += 3) {
            const y = 60 + Math.sin(x / cv.width * Math.PI * 2 * (2 + f * 6) + t * 3) * 38;
            if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        };
        wave(want, 'rgba(255,255,255,.28)', 7);
        wave(v, off < 0.02 ? '#7fe0a0' : '#f2c14e', 3);
        if (off < 0.02 && !fin) {
          held += dt;
          if (held > 0.8) { fin = true; done(); }
        } else held = 0;
        const say = fin ? 'In tune.' : off < 0.02 ? 'Hold it there…' : off < 0.08 ? 'Nearly…' : 'Further ' + (v < want ? 'right' : 'left');
        if (hint.textContent !== say) hint.textContent = say;
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
      let lastNote = 0;
      slider.oninput = () => {
        const now = performance.now();
        if (now - lastNote > 90) { lastNote = now; tone(220 + Number(slider.value) * 0.5, 0.08, 'triangle', 0.05); }
      };
      return () => cancelAnimationFrame(raf);
    },

    /* Bats in the rafters. They swoop about; tap each one to send it out
       of the window. Miss and they settle for a moment. */
    bats({ body, hint, rng, done, pips }) {
      const box = el('div', 'cg-rafters');
      body.appendChild(box);
      const n = 5 + rng.int(0, 1);
      const P = pips(n);
      let left = n, raf = 0, t0 = performance.now();
      const say = () => { hint.textContent = left + (left === 1 ? ' bat' : ' bats') + ' left'; };
      say();
      const bats = [];
      for (let i = 0; i < n; i++) {
        const b = el('button', 'cg-bat', '<i></i><i></i>');
        b.type = 'button';
        const bat = { b, x: rng.range(30, 290), y: rng.range(30, 170), ph: rng.range(0, 6.28), sp: rng.range(0.7, 1.4), gone: false };
        b.onclick = () => {
          if (bat.gone) return;
          bat.gone = true; left--;
          b.classList.add('gone');
          step(n - left);
          P(n - left);
          say();
          if (left <= 0) done();
        };
        bats.push(bat);
        box.appendChild(b);
      }
      // the flight is drawn on a 340 × 230 loft and stretched to whatever
      // box the screen gave it, so a short phone still has room to swoop
      const step = (now) => {
        const t = (now - t0) / 1000;
        const W = box.clientWidth || 340, H = box.clientHeight || 230;
        for (const bat of bats) {
          if (bat.gone) continue;
          const x = 160 + Math.sin(t * bat.sp + bat.ph) * 120 + Math.sin(t * 2.3 * bat.sp + bat.ph * 2) * 22;
          const y = 100 + Math.cos(t * bat.sp * 1.3 + bat.ph) * 62;
          const px = Math.max(20, Math.min(W - 20, x * W / 340));
          const py = Math.max(14, Math.min(H - 14, (y + 12) * H / 230));
          bat.b.style.transform = 'translate(' + px.toFixed(0) + 'px,' + py.toFixed(0) + 'px)';
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    },

    /* An old lock with three pins. A marker sweeps back and forth; stop
       it in the gold to set a pin. Each pin is quicker than the last. */
    lock({ body, hint, rng, done, panel }) {
      const pins = el('div', 'cg-pins');
      const bar = el('div', 'cg-lockbar', '<div class="cg-zone"></div><div class="cg-pick"></div>');
      const btn = el('button', 'cg-pour-btn', 'SET THE PIN');
      btn.type = 'button';
      body.append(pins, bar, btn);
      hint.textContent = 'Pin 1 of 3';
      const pinEls = [0, 1, 2].map(() => { const p = el('i', 'cg-pin'); pins.appendChild(p); return p; });
      const zone = bar.querySelector('.cg-zone'), pick = bar.querySelector('.cg-pick');
      let set = 0, pos = 0, dir = 1, raf = 0, last = 0, lo = 0, hi = 0;
      const place = () => { lo = 15 + rng.int(0, 55); hi = lo + 19 - set * 3; zone.style.left = lo + '%'; zone.style.width = (hi - lo) + '%'; };
      place();
      const step = (now) => {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
        pos += dir * dt * (55 + set * 30);
        if (pos > 100) { pos = 100; dir = -1; } if (pos < 0) { pos = 0; dir = 1; }
        pick.style.left = pos + '%';
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      const press = () => {
        if (set >= 3) return;
        if (pos >= lo && pos <= hi) {
          pinEls[set].classList.add('up'); set++;
          tone(500 + set * 160, 0.12, 'triangle', 0.12);
          if (set >= 3) { done(); return; }
          hint.textContent = 'Pin ' + (set + 1) + ' of 3 — quicker now';
          place();
        } else {
          bad(); shake(panel);
          if (set > 0) { set--; pinEls[set].classList.remove('up'); }
          hint.textContent = 'Slipped. Pin ' + (set + 1) + ' of 3';
        }
      };
      btn.onclick = press;
      const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(); } };
      window.addEventListener('keydown', onKey);
      return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
    },

    /* The fire is breathing. Pump the bellows each time the glow swells
       to the ring — too early or too late and it coughs. Four good
       pumps and it roars. */
    bellows({ body, hint, done, panel, pips }) {
      const P = pips(4);
      const hearth = el('div', 'cg-hearth', '<div class="cg-target"></div><div class="cg-glow"></div><div class="cg-flames"></div>');
      const btn = el('button', 'cg-pour-btn', 'PUMP');
      btn.type = 'button';
      body.append(hearth, btn);
      hint.textContent = '0 of 4 pumps';
      const glow = hearth.querySelector('.cg-glow'), flames = hearth.querySelector('.cg-flames');
      let heat = 0, raf = 0, t0 = performance.now(), size = 0;
      const step = (now) => {
        const t = (now - t0) / 1000;
        size = 0.5 + 0.5 * Math.sin(t * 2.6);
        glow.style.transform = 'scale(' + (0.35 + size * 0.75).toFixed(3) + ')';
        flames.style.transform = 'scaleY(' + (0.35 + heat * 0.18 + Math.sin(t * 13) * 0.04).toFixed(3) + ')';
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      const pump = () => {
        if (size > 0.78) {
          heat++;
          tone(120 + heat * 40, 0.25, 'sawtooth', 0.05);
          hearth.classList.add('puff'); setTimeout(() => hearth.classList.remove('puff'), 200);
          hint.textContent = heat + ' of 4 pumps';
          P(heat);
          if (heat >= 4) done();
        } else {
          bad(); shake(panel); heat = Math.max(0, heat - 1); P(heat);
          hint.textContent = 'Too soon — wait for the ring. ' + heat + ' of 4';
        }
      };
      btn.onclick = pump;
      const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) pump(); } };
      window.addEventListener('keydown', onKey);
      return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
    },

    /* The laird's tonic, from a recipe in a cramped hand. Add the four
       things in order; get one wrong and the pot boils over. */
    brew({ body, hint, rng, done, panel, pips }) {
      const P = pips(4);
      const ALL = [['thistle', 'thistle'], ['heather', 'heather'], ['whisky', 'whisky'], ['honey', 'honey'], ['salt', 'salt'], ['toadstool', 'toadstool'], ['bramble', 'bramble'], ['water', 'spring water']];
      const shelf = ALL.slice().sort(() => rng() - 0.5).slice(0, 6);
      const recipe = shelf.slice().sort(() => rng() - 0.5).slice(0, 4);
      const card = el('div', 'cg-recipe', recipe.map((r, i) => '<span>' + (i + 1) + '. ' + r[1] + '</span>').join(''));
      const pot = el('div', 'cg-cauldron', '<i></i>');
      const row = el('div', 'cg-shelf');
      body.append(card, pot, row);
      let at = 0;
      hint.textContent = 'First: ' + recipe[0][1];
      const marks = [...card.children];
      for (const ing of shelf) {
        const b = el('button', 'cg-ingredient', '<b>' + pic(ing[0]) + '</b><span>' + ing[1] + '</span>');
        b.type = 'button';
        b.onclick = () => {
          if (ing === recipe[at]) {
            marks[at].classList.add('in'); at++; P(at);
            pot.classList.remove('bubble'); void pot.offsetWidth; pot.classList.add('bubble');
            tone(300 + at * 90, 0.15, 'sine', 0.12);
            if (at >= recipe.length) done();
            else hint.textContent = 'Next: ' + recipe[at][1];
          } else {
            bad(); shake(panel); at = 0; P(0);
            hint.textContent = 'Spoilt. Start again: ' + recipe[0][1];
            marks.forEach(m => m.classList.remove('in'));
            pot.classList.add('spoilt'); setTimeout(() => pot.classList.remove('spoilt'), 500);
          }
        };
        row.appendChild(b);
      }
    },

    /* Place cards for dinner, each with a family crest. You get a look
       at them all face up, then they turn over: find the three pairs. */
    pairs({ body, hint, rng, done, pips }) {
      const CRESTS = ['crown', 'cross', 'fleur', 'sun', 'sword', 'moon', 'castle', 'key'];
      const three = shuffled(rng, CRESTS).slice(0, 3);
      const deck = shuffled(rng, three.concat(three));
      const grid = el('div', 'cg-cards');
      body.appendChild(grid);
      const P = pips(3);
      const timers = [];
      let open = [], found = 0, busy = true;
      const cards = deck.map((crest) => {
        const b = el('button', 'cg-card up', '<i>' + pic(crest) + '</i>');
        b.type = 'button';
        b.onclick = () => flip(b, crest);
        grid.appendChild(b);
        return b;
      });
      hint.textContent = 'Remember them…';
      timers.push(setTimeout(() => {
        cards.forEach(b => b.classList.remove('up'));
        busy = false;
        hint.textContent = 'Find the pairs';
      }, 1500));
      function flip(b, crest) {
        if (busy || b.classList.contains('up')) return;
        click();
        b.classList.add('up');
        open.push([b, crest]);
        if (open.length < 2) return;
        const [[b1, c1], [b2, c2]] = open;
        open = [];
        if (c1 === c2) {
          found++;
          b1.classList.add('got'); b2.classList.add('got');
          step(found * 3); P(found);
          hint.textContent = found + ' of 3 pairs';
          if (found >= 3) done();
          return;
        }
        busy = true;
        thud(220, 140, 0.12, 0.12);
        hint.textContent = 'Not a pair';
        timers.push(setTimeout(() => {
          b1.classList.remove('up'); b2.classList.remove('up');
          busy = false;
        }, 650));
      }
      return () => timers.forEach(clearTimeout);
    },

    /* Three ancestors hanging crooked. Each turn button moves a frame a
       notch; a frame that is level settles and glows. */
    frames({ body, hint, rng, done, pips }) {
      const NOTCH = 7;
      const row = el('div', 'cg-frames');
      body.appendChild(row);
      const P = pips(3);
      let level = 0;
      const FACES = ['#6b3a2a', '#2f4a6b', '#4a5a2f'];
      for (let i = 0; i < 3; i++) {
        let tilt = (rng() < 0.5 ? -1 : 1) * rng.int(1, 3);
        const box = el('div', 'cg-frame-box');
        const art = el('div', 'cg-frame', '<i style="background:' + FACES[i] + '"></i>');
        const ctl = el('div', 'cg-frame-ctl');
        const l = el('button', 'cg-key', '⟲'), r = el('button', 'cg-key', '⟳');
        l.type = r.type = 'button';
        ctl.append(l, r);
        box.append(art, ctl);
        row.appendChild(box);
        const draw = () => { art.style.transform = 'rotate(' + (tilt * NOTCH) + 'deg)'; };
        draw();
        const nudge = (d) => {
          if (tilt === 0) return;
          tilt = Math.max(-4, Math.min(4, tilt + d));
          draw();
          if (tilt === 0) {
            box.classList.add('level');
            level++; step(level * 3); P(level);
            hint.textContent = level + ' of 3 straight';
            if (level >= 3) done();
          } else {
            tone(420 - Math.abs(tilt) * 40, 0.07, 'triangle', 0.07);
            hint.textContent = 'A little more ' + (tilt > 0 ? '⟲' : '⟳');
          }
        };
        l.onclick = () => nudge(-1);
        r.onclick = () => nudge(1);
      }
      hint.textContent = '0 of 3 straight';
    },

    /* The same painting twice, except one is a forgery: three things in
       it are not what they are in the real one. Tap them on the copy. */
    spot({ body, hint, rng, done, panel, pips }) {
      const THINGS = ['moon', 'tree', 'castle', 'stag', 'gull', 'boat', 'candle', 'key', 'wine', 'rose', 'owl', 'anchor', 'shoe', 'apple', 'star', 'bell'];
      const pool = shuffled(rng, THINGS);
      const real = pool.slice(0, 9);
      const spare = pool.slice(9);
      const changed = new Set(shuffled(rng, [0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3));
      const fake = real.map((t, i) => (changed.has(i) ? spare.pop() : t));
      const wrap = el('div', 'cg-paintings');
      const A = el('div', 'cg-painting real'), B = el('div', 'cg-painting fake');
      wrap.append(A, B);
      body.appendChild(wrap);
      const P = pips(3);
      let found = 0;
      real.forEach((t) => A.appendChild(el('span', 'cg-thing', pic(t))));
      fake.forEach((t, i) => {
        const b = el('button', 'cg-thing', pic(t));
        b.type = 'button';
        b.onclick = () => {
          if (b.classList.contains('got')) return;
          if (!changed.has(i)) { bad(); shake(panel); hint.textContent = 'That one matches. Look again.'; return; }
          b.classList.add('got');
          found++; step(found * 3); P(found);
          hint.textContent = found + ' of 3 found';
          if (found >= 3) done();
        };
        B.appendChild(b);
      });
      hint.textContent = 'Left: the real one. Right: the fake.';
    },

    /* Five bottles of claret, racked any old how. Tap two to swap them
       until the years run oldest to newest. The pips are how many are
       already in the right slot. */
    bottles({ body, hint, rng, done, pips }) {
      const years = [1780 + rng.int(0, 40)];
      while (years.length < 5) years.push(years[years.length - 1] + 2 + rng.int(0, 6));
      const want = years.slice().sort((a, b) => a - b);
      let order = shuffled(rng, years);
      while (order.every((y, i) => y === want[i])) order = shuffled(rng, years);
      const rack = el('div', 'cg-rack');
      const ends = el('div', 'cg-rack-ends', '<span>← oldest</span><span>newest →</span>');
      body.append(rack, ends);
      const P = pips(5);
      let held = -1;
      const draw = () => {
        rack.innerHTML = '';
        let right = 0;
        order.forEach((y, i) => {
          const ok = y === want[i];
          if (ok) right++;
          const b = el('button', 'cg-bottle' + (ok ? ' ok' : '') + (i === held ? ' held' : ''), '<i></i><span>' + y + '</span>');
          b.type = 'button';
          b.onclick = () => tap(i);
          rack.appendChild(b);
        });
        P(right);
        return right;
      };
      function tap(i) {
        if (held < 0) { held = i; click(); draw(); return; }
        if (held === i) { held = -1; draw(); return; }
        [order[held], order[i]] = [order[i], order[held]];
        held = -1;
        const right = draw();
        step(right * 2);
        hint.textContent = right + ' of 5 in place';
        if (right === 5) done();
      }
      hint.textContent = draw() + ' of 5 in place';
    },

    /* A mouse in the pantry wall. It looks out of one hole, then another;
       tap it while it is out. Each catch it gets a little quicker. */
    mouse({ body, hint, rng, done, pips }) {
      const N = 6, NEED = 5;
      const wall = el('div', 'cg-mousewall');
      body.appendChild(wall);
      const P = pips(NEED);
      const holes = Array.from({ length: N }, () => {
        const h = el('button', 'cg-mhole', '<i>' + pic('mouse') + '</i>');
        h.type = 'button';
        wall.appendChild(h);
        return h;
      });
      let at = -1, caught = 0, timer = null, live = true;
      const pop = () => {
        if (!live) return;
        if (at >= 0) holes[at].classList.remove('out');
        let n = rng.int(0, N - 1);
        if (n === at) n = (n + 1 + rng.int(0, N - 2)) % N;
        at = n;
        holes[at].classList.add('out');
        timer = setTimeout(() => { holes[at].classList.remove('out'); at = -1; timer = setTimeout(pop, 260); },
                           1150 - caught * 90);
      };
      holes.forEach((h, i) => {
        h.onclick = () => {
          if (i !== at) { thud(200, 120, 0.1, 0.1); return; }
          clearTimeout(timer);
          h.classList.remove('out');
          h.classList.add('caught');
          setTimeout(() => h.classList.remove('caught'), 300);
          at = -1;
          caught++; step(caught * 2); P(caught);
          hint.textContent = caught + ' of ' + NEED + ' caught';
          if (caught >= NEED) { live = false; done(); return; }
          timer = setTimeout(pop, 380);
        };
      });
      hint.textContent = 'Watch the holes…';
      timer = setTimeout(pop, 600);
      return () => { live = false; clearTimeout(timer); };
    },

    /* A run of pipe from the tap to the tank, with some sections turned
       the wrong way. Tap one to turn it a quarter. Water runs as far as
       the pipe is joined, so you can see where it stops. */
    pipes({ body, hint, rng, done, pips }) {
      const NS = 1, E = 2, S = 4, W = 8;
      const R = 3, C = 3;
      const turn = (m) => ((m << 1) | (m >> 3)) & 15;            // a quarter clockwise
      const opp = (d) => ({ 1: 4, 2: 8, 4: 1, 8: 2 })[d];
      const step2 = { 1: [-1, 0], 2: [0, 1], 4: [1, 0], 8: [0, -1] };
      // the true path: across the columns, up or down within each
      const r0 = rng.int(0, R - 1);
      const want = Array.from({ length: R }, () => Array(C).fill(0));
      const onPath = Array.from({ length: R }, () => Array(C).fill(false));
      let r = r0, inDir = W;
      for (let c = 0; c < C; c++) {
        const to = rng.int(0, R - 1);
        while (true) {
          let out;
          if (r === to) out = E; else out = r < to ? S : NS;
          want[r][c] = inDir | out;
          onPath[r][c] = true;
          if (out === E) { inDir = W; break; }
          r += out === S ? 1 : -1;
          inDir = opp(out);
        }
      }
      const r1 = r;
      // what is actually there: the right pieces, turned wrong, and junk
      const tiles = [];
      const grid = el('div', 'cg-pipes');
      body.appendChild(grid);
      for (let i = 0; i < R; i++) {
        grid.appendChild(el('span', 'cg-pipe-end' + (i === r0 ? ' tap' : ''), i === r0 ? pic('tap') : ''));
        for (let c = 0; c < C; c++) {
          let m = onPath[i][c] ? want[i][c] : [NS | S, NS | E][rng.int(0, 1)];
          // a straight piece turned twice is the same piece, so the path
          // ones turn an odd number of times: it never starts solved
          const straight = m === (NS | S) || m === (E | W);
          const spins = !onPath[i][c] ? rng.int(0, 3) : straight ? (rng() < 0.5 ? 1 : 3) : rng.int(1, 3);
          for (let k = 0; k < spins; k++) m = turn(m);
          const b = el('button', 'cg-pipe');
          b.type = 'button';
          const t = { i, c, m, b };
          b.onclick = () => { t.m = turn(t.m); click(); draw(); };
          tiles.push(t);
          grid.appendChild(b);
        }
        grid.appendChild(el('span', 'cg-pipe-end' + (i === r1 ? ' tank' : ''), i === r1 ? pic('tank') : ''));
      }
      const at = (i, c) => tiles.find(t => t.i === i && t.c === c);
      const P = pips(1);
      let fin = false, ready = false;
      function draw() {
        // follow the water from the tap
        const wet = new Set();
        let i = r0, c = 0, from = W, out = false;
        for (let guard = 0; guard < 12; guard++) {
          const t = at(i, c);
          if (!t || !(t.m & from)) break;
          wet.add(t);
          const go = t.m & ~from;
          if (c === C - 1 && i === r1 && (go & E)) { out = true; break; }
          const d = step2[go];
          if (!d) break;
          i += d[0]; c += d[1]; from = opp(go);
        }
        // the junk can make a lucky route of its own; never open solved
        if (out && !ready) { const t0 = at(r0, 0); t0.m = turn(t0.m); return draw(); }
        for (const t of tiles) {
          t.b.className = 'cg-pipe' + (wet.has(t) ? ' wet' : '');
          t.b.innerHTML = '<b></b>' + [[NS, 'n'], [E, 'e'], [S, 's'], [W, 'w']]
            .filter(([d]) => t.m & d).map(([, k]) => '<i class="' + k + '"></i>').join('');
        }
        hint.textContent = out ? 'Running!' : wet.size ? 'Water reaches ' + wet.size + (wet.size === 1 ? ' pipe' : ' pipes') : 'Turn the pipe by the tap';
        if (out && !fin) { fin = true; P(1); step(10); done(); }
      }
      draw();
      ready = true;
    },

    /* The factor's scales: a gold weight on the left pan, and a tray of
       brass ones. Put brass on the right until the beam is level. */
    scales({ body, hint, rng, done, pips }) {
      const TRAY = [1, 2, 3, 5, 8];
      const pickN = 2 + rng.int(0, 1);
      const target = shuffled(rng, TRAY).slice(0, pickN).reduce((a, b) => a + b, 0);
      const rig = el('div', 'cg-scales', '<div class="cg-beam"><div class="cg-pan l"><b>' + target + '</b></div>'
        + '<div class="cg-pan r"></div></div><div class="cg-post"></div>');
      const tray = el('div', 'cg-tray');
      body.append(rig, tray);
      const beam = rig.querySelector('.cg-beam'), pan = rig.querySelector('.cg-pan.r');
      const P = pips(1);
      const on = new Set();
      let fin = false;
      const draw = () => {
        const sum = [...on].reduce((a, b) => a + b, 0);
        const d = Math.max(-1, Math.min(1, (target - sum) / 8));
        beam.style.transform = 'rotate(' + (-d * 14).toFixed(1) + 'deg)';
        pan.innerHTML = [...on].map(w => '<i>' + w + '</i>').join('');
        hint.textContent = sum === target ? 'Level!' : sum < target ? 'Needs ' + (target - sum) + ' more'
          : (sum - target) + ' too heavy';
        if (sum === target && !fin) { fin = true; P(1); done(); }
      };
      for (const w of TRAY) {
        const b = el('button', 'cg-weight', '<b>' + w + '</b>');
        b.type = 'button';
        b.onclick = () => {
          if (on.has(w)) { on.delete(w); b.classList.remove('on'); tone(260, 0.08, 'triangle', 0.07); }
          else { on.add(w); b.classList.add('on'); step(w); }
          draw();
        };
        tray.appendChild(b);
      }
      draw();
    },

    /* A window gone brown with peat smoke. Rub it clean: the loch is on
       the other side of it. */
    window({ body, hint, done, pips }) {
      const box = el('div', 'cg-window');
      const cv = el('canvas', 'cg-grime');
      cv.width = 300; cv.height = 190;
      box.appendChild(cv);
      body.appendChild(box);
      const P = pips(5);
      const g = cv.getContext('2d');
      g.fillStyle = '#5a4630';
      g.fillRect(0, 0, cv.width, cv.height);
      for (let k = 0; k < 140; k++) {
        g.fillStyle = 'rgba(' + (60 + (k * 37) % 50) + ',' + (45 + (k * 13) % 30) + ',25,0.5)';
        g.beginPath();
        g.arc((k * 97) % 300, (k * 61) % 190, 8 + (k * 7) % 22, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'destination-out';
      let down = false, last = null, fin = false, checkT = 0, lastShown = -1;
      const at = (e) => {
        const r = cv.getBoundingClientRect();
        return { x: (e.clientX - r.left) * cv.width / (r.width || cv.width),
                 y: (e.clientY - r.top) * cv.height / (r.height || cv.height) };
      };
      const clean = () => {
        let clear = 0, n = 0;
        try {
          const d = g.getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 3; i < d.length; i += 4 * 37) { n++; if (d[i] < 40) clear++; }
        } catch (e) { return 1; }
        return n ? clear / n : 0;
      };
      const rub = (p) => {
        g.lineWidth = 44; g.lineCap = 'round';
        g.beginPath();
        g.moveTo((last || p).x, (last || p).y);
        g.lineTo(p.x, p.y);
        g.stroke();
        last = p;
        const now = performance.now();
        if (now - checkT < 120 || fin) return;
        checkT = now;
        const k = clean();
        const shown = Math.min(5, Math.floor(k / 0.17));
        if (shown !== lastShown) { lastShown = shown; P(shown); if (shown > 0) step(shown * 2); }
        hint.textContent = Math.round(Math.min(1, k / 0.85) * 100) + '% clean';
        if (k >= 0.85) { fin = true; box.classList.add('clean'); done(); }
      };
      cv.addEventListener('pointerdown', (e) => { e.preventDefault(); down = true; last = null; rub(at(e)); });
      cv.addEventListener('pointermove', (e) => { if (down) rub(at(e)); });
      const up = () => { down = false; last = null; };
      window.addEventListener('pointerup', up);
      hint.textContent = '0% clean';
      return () => window.removeEventListener('pointerup', up);
    },

    /* ---------------- the second wing of puzzles ----------------
       Fourteen more, each a different thing to do with your hands: aim,
       timing, a flick, a watched shuffle, a stack, a rhythm, a search in
       the dark, a dial, patience, balance, reflexes, a traced line, a
       held breath, a sum and a crank. Most draw on a small canvas
       (`board`) and run on `loop`. */

    /* The dartboard in the billiard room. Your hand is not steady: the
       sight drifts over the board, and you throw when it crosses the
       gold. Three in the gold, and the drift quickens with each. */
    darts({ body, hint, rng, done, panel, pips }) {
      const NEED = 3;
      const P = pips(NEED);
      const B = board(body, 'cg-darts', 260, 230);
      const btn = el('button', 'cg-pour-btn', 'THROW');
      btn.type = 'button';
      body.appendChild(btn);
      const { g, w, h } = B;
      const cx = w / 2, cy = h / 2 + 4, R = 98, GOLD = 27, BULL = 9;
      const ph = [rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0.85, 1.15)];
      let hits = 0, t = 0, busy = 0, over = false;
      const thrown = [];
      let pop = null;
      const sight = () => {
        const k = (1 + hits * 0.32) * ph[2];
        return { x: cx + Math.sin(t * 1.55 * k + ph[0]) * 62 + Math.sin(t * 4.1 * k) * 9,
                 y: cy + Math.sin(t * 2.15 * k + ph[1]) * 56 + Math.cos(t * 3.4 * k) * 8 };
      };
      hint.textContent = 'Throw when the sight is on the gold';
      const draw = () => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#20150e'; g.fillRect(0, 0, w, h);
        // the board: twenty wedges, the rings, the gold and the bull
        g.save(); g.translate(cx, cy);
        g.fillStyle = '#0d0d0d'; g.beginPath(); g.arc(0, 0, R + 10, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 20; i++) {
          const a0 = (i - 0.5) / 20 * Math.PI * 2, a1 = (i + 0.5) / 20 * Math.PI * 2;
          g.fillStyle = i % 2 ? '#e9dcc0' : '#1b1b1b';
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.closePath(); g.fill();
          g.fillStyle = i % 2 ? '#2f7d4a' : '#b8323a';
          g.beginPath(); g.arc(0, 0, R, a0, a1); g.arc(0, 0, R - 7, a1, a0, true); g.closePath(); g.fill();
          g.beginPath(); g.arc(0, 0, 62, a0, a1); g.arc(0, 0, 55, a1, a0, true); g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(242,193,78,.85)'; g.beginPath(); g.arc(0, 0, GOLD, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#fff3c4'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = '#b8323a'; g.beginPath(); g.arc(0, 0, BULL, 0, Math.PI * 2); g.fill();
        g.restore();
        // the darts that are in, flights up
        for (const d of thrown) {
          const k = Math.min(1, d.t / 0.16);
          const x = U.lerp(w / 2, d.x, k), y = U.lerp(h + 20, d.y, k);
          g.strokeStyle = '#c9ced6'; g.lineWidth = 2.5;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + 7, y + 13); g.stroke();
          g.fillStyle = d.good ? '#f2c14e' : '#7cc8ff';
          g.beginPath(); g.moveTo(x + 7, y + 13); g.lineTo(x + 14, y + 14); g.lineTo(x + 9, y + 21); g.closePath(); g.fill();
        }
        if (!over) {
          const s = sight();
          g.strokeStyle = busy > 0 ? 'rgba(255,255,255,.35)' : '#ffffff'; g.lineWidth = 2;
          g.beginPath(); g.arc(s.x, s.y, 9, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.moveTo(s.x - 15, s.y); g.lineTo(s.x - 5, s.y); g.moveTo(s.x + 5, s.y); g.lineTo(s.x + 15, s.y);
          g.moveTo(s.x, s.y - 15); g.lineTo(s.x, s.y - 5); g.moveTo(s.x, s.y + 5); g.lineTo(s.x, s.y + 15); g.stroke();
        }
        if (pop) {
          g.globalAlpha = Math.max(0, 1 - pop.t / 0.8);
          g.fillStyle = pop.c; g.font = '700 20px sans-serif'; g.textAlign = 'center';
          g.fillText(pop.text, pop.x, pop.y - 18 - pop.t * 30);
          g.globalAlpha = 1;
        }
      };
      const stop = loop((dt) => {
        t += dt; busy -= dt;
        for (const d of thrown) d.t += dt;
        if (pop) { pop.t += dt; if (pop.t > 0.8) pop = null; }
        draw();
      });
      const shoot = () => {
        if (over || busy > 0) return;
        busy = 0.4;
        const s = sight();
        const d = Math.hypot(s.x - cx, s.y - cy);
        const good = d <= GOLD;
        thrown.push({ x: s.x, y: s.y, t: 0, good });
        if (thrown.length > 7) thrown.shift();
        tone(good ? 900 : 300, 0.08, 'square', 0.05);
        if (!good) { bad(); pop = { text: d > R ? 'Wall!' : 'Wide', c: '#7cc8ff', x: s.x, y: s.y, t: 0 }; hint.textContent = 'Wide — wait for the gold'; return; }
        hits++; P(hits); step(hits * 3);
        pop = { text: d <= BULL ? 'BULL!' : 'Gold!', c: '#f2c14e', x: s.x, y: s.y, t: 0 };
        hint.textContent = hits + ' of ' + NEED + ' in the gold' + (hits < NEED ? ' — steadier now…' : '');
        if (hits >= NEED) { over = true; setTimeout(done, 380); }
      };
      btn.onclick = shoot;
      B.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); shoot(); });
      const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) shoot(); } };
      window.addEventListener('keydown', onKey);
      return () => { stop(); window.removeEventListener('keydown', onKey); };
    },

    /* The billiard table. Pull back from the red and let go: it runs,
       bounces off the cushions and drops if it finds a pocket. Two pots. */
    pot({ body, hint, rng, done, pips }) {
      const NEED = 2;
      const P = pips(NEED);
      const B = board(body, 'cg-pool', 320, 184);
      const { g, w, h } = B;
      const M = 18, BR = 8, PR = 13;
      const pockets = [[M, M], [w / 2, M - 3], [w - M, M], [M, h - M], [w / 2, h - M + 3], [w - M, h - M]];
      const ball = { x: 0, y: 0, vx: 0, vy: 0, sink: 0, in: null };
      let potted = 0, aim = null, over = false, moving = false;
      const place = () => {
        for (let k = 0; k < 40; k++) {
          ball.x = rng.range(M + 40, w - M - 40); ball.y = rng.range(M + 30, h - M - 30);
          if (pockets.every(p => Math.hypot(p[0] - ball.x, p[1] - ball.y) > 70)) break;
        }
        ball.vx = ball.vy = 0; ball.sink = 0; ball.in = null;
      };
      place();
      hint.textContent = 'Drag back from the ball, aim, and let go';
      const draw = () => {
        g.fillStyle = '#5a3418'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#1f6b3d'; g.fillRect(M - 6, M - 6, w - 2 * M + 12, h - 2 * M + 12);
        g.fillStyle = 'rgba(255,255,255,.05)';
        g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.32, h * 0.3, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(w * 0.25, M); g.lineTo(w * 0.25, h - M); g.stroke();
        for (const p of pockets) { g.fillStyle = '#050505'; g.beginPath(); g.arc(p[0], p[1], PR, 0, Math.PI * 2); g.fill(); }
        if (aim && !moving) {
          const dx = ball.x - aim.x, dy = ball.y - aim.y, L = Math.min(110, Math.hypot(dx, dy));
          if (L > 6) {
            const ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy);
            g.setLineDash([5, 6]); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
            g.beginPath(); g.moveTo(ball.x, ball.y); g.lineTo(ball.x + ux * (40 + L * 1.6), ball.y + uy * (40 + L * 1.6)); g.stroke();
            g.setLineDash([]);
            // the cue, drawn back behind the ball
            g.strokeStyle = '#d9b77a'; g.lineWidth = 5;
            g.beginPath(); g.moveTo(ball.x - ux * (12 + L * 0.5), ball.y - uy * (12 + L * 0.5));
            g.lineTo(ball.x - ux * (140 + L * 0.5), ball.y - uy * (140 + L * 0.5)); g.stroke();
            g.fillStyle = L > 80 ? '#ff8a5a' : '#f2c14e';
            g.fillRect(M, h - 8, (w - 2 * M) * L / 110, 4);
          }
        }
        const r = BR * (1 - ball.sink);
        if (r > 0.5) {
          g.fillStyle = '#c4162c'; g.beginPath(); g.arc(ball.x, ball.y, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(ball.x - r * 0.35, ball.y - r * 0.35, r * 0.3, 0, Math.PI * 2); g.fill();
        }
      };
      const stop = loop((dt) => {
        if (ball.in) {
          ball.sink = Math.min(1, ball.sink + dt * 4);
          ball.x = U.lerp(ball.x, ball.in[0], 0.3); ball.y = U.lerp(ball.y, ball.in[1], 0.3);
        } else if (moving) {
          const sub = 4;
          for (let i = 0; i < sub; i++) {
            ball.x += ball.vx * dt / sub; ball.y += ball.vy * dt / sub;
            let jaw = false;
            for (const p of pockets) {
              const d = Math.hypot(p[0] - ball.x, p[1] - ball.y);
              // a pocket's lip draws in a ball that is passing close
              if (d < PR + 9) { ball.vx += (p[0] - ball.x) * 8 * dt / sub; ball.vy += (p[1] - ball.y) * 8 * dt / sub; }
              if (d < PR + 2) { ball.in = p; break; }
              // in the jaws of a pocket there is no cushion to bounce off
              if (d < PR + BR + 8) jaw = true;
            }
            if (ball.in) break;
            if (jaw) continue;
            if (ball.x < M + BR) { ball.x = M + BR; ball.vx = Math.abs(ball.vx) * 0.8; tone(180, 0.05, 'sine', 0.06); }
            if (ball.x > w - M - BR) { ball.x = w - M - BR; ball.vx = -Math.abs(ball.vx) * 0.8; tone(180, 0.05, 'sine', 0.06); }
            if (ball.y < M + BR) { ball.y = M + BR; ball.vy = Math.abs(ball.vy) * 0.8; tone(180, 0.05, 'sine', 0.06); }
            if (ball.y > h - M - BR) { ball.y = h - M - BR; ball.vy = -Math.abs(ball.vy) * 0.8; tone(180, 0.05, 'sine', 0.06); }
          }
          const f = Math.exp(-1.1 * dt);
          ball.vx *= f; ball.vy *= f;
          if (ball.in) {
            moving = false;
            tone(220, 0.25, 'sine', 0.16);
            potted++; P(potted); step(potted * 4);
            if (potted >= NEED) { over = true; hint.textContent = 'Both down!'; setTimeout(done, 450); }
            else { hint.textContent = 'Potted! One more'; setTimeout(() => { if (!over) place(); }, 650); }
          } else if (Math.hypot(ball.vx, ball.vy) < 7) {
            moving = false; ball.vx = ball.vy = 0;
            hint.textContent = 'Shoot again from there';
          }
        }
        draw();
      });
      const down = (e) => {
        if (moving || over || ball.in) return;
        e.preventDefault();
        aim = B.at(e);
        try { B.cv.setPointerCapture(e.pointerId); } catch (err) {}
      };
      const move = (e) => { if (aim) aim = B.at(e); };
      const up = () => {
        if (!aim) return;
        const dx = ball.x - aim.x, dy = ball.y - aim.y, L = Math.hypot(dx, dy);
        aim = null;
        if (L < 8 || moving || over) return;
        const pow = Math.min(110, L) * 5.2;
        ball.vx = dx / L * pow; ball.vy = dy / L * pow;
        moving = true;
        tone(420, 0.06, 'triangle', 0.12);
      };
      B.cv.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return () => { stop(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    },

    /* Three silver quaichs and the laird's ring. Watch which one it goes
       under, watch them shuffle, and lift the right one. Twice; the
       second shuffle is quicker and longer. */
    cups({ body, hint, rng, done, panel, pips }) {
      const NEED = 2;
      const P = pips(NEED);
      const table = el('div', 'cg-cups');
      const ring = el('i', 'cg-ring');
      table.appendChild(ring);
      body.appendChild(table);
      const SLOT = [18, 50, 82];
      const pos = [0, 1, 2];                 // the slot each cup is in
      const cups = [0, 1, 2].map((c) => {
        const b = el('button', 'cg-cup', '<i></i>');
        b.type = 'button';
        b.onclick = () => pick(c);
        table.appendChild(b);
        return b;
      });
      let won = 0, ringCup = 0, phase = 'show';
      const timers = [];
      const later = (fn, ms) => timers.push(setTimeout(fn, ms));
      const lay = (ms) => cups.forEach((b, c) => {
        b.style.transitionDuration = ms + 'ms, 220ms';
        b.style.left = SLOT[pos[c]] + '%';
      });
      lay(0);
      const round = () => {
        phase = 'show';
        ringCup = rng.int(0, 2);
        ring.style.left = SLOT[pos[ringCup]] + '%';
        ring.classList.add('on');
        cups.forEach(b => b.classList.add('up'));
        hint.textContent = 'Watch the ring…';
        later(() => { cups.forEach(b => b.classList.remove('up')); }, 850);
        later(() => {
          ring.classList.remove('on');
          phase = 'shuffle';
          const swaps = 4 + won * 3, ms = Math.max(170, 320 - won * 100);
          for (let k = 0; k < swaps; k++) later(() => {
            const a = rng.int(0, 2), b = (a + 1 + rng.int(0, 1)) % 3;
            const ca = pos.indexOf(a), cb = pos.indexOf(b);
            pos[ca] = b; pos[cb] = a;
            cups[ca].classList.add('lift'); cups[cb].classList.remove('lift');
            lay(ms);
            tone(260 + k * 14, 0.05, 'sine', 0.05);
          }, k * (ms + 40));
          later(() => { phase = 'pick'; cups.forEach(b => b.classList.remove('lift')); hint.textContent = 'Which quaich has the ring?'; },
                swaps * (ms + 40) + 80);
        }, 1150);
      };
      function pick(c) {
        if (phase !== 'pick') return;
        phase = 'reveal';
        ring.style.left = SLOT[pos[ringCup]] + '%';
        ring.classList.add('on');
        cups[c].classList.add('up');
        if (c === ringCup) {
          won++; P(won); step(won * 4);
          hint.textContent = won >= NEED ? 'Sharp eyes.' : 'Found it! Again — quicker';
          if (won >= NEED) { later(done, 500); return; }
          later(round, 1100);
        } else {
          bad(); shake(panel);
          cups[ringCup].classList.add('up');
          hint.textContent = 'It was under that one. Again —';
          later(round, 1400);
        }
      }
      later(round, 300);
      return () => timers.forEach(clearTimeout);
    },

    /* The log basket by the kitchen fire. A log swings across over the
       pile; drop it on top. Whatever hangs over the edge falls off, so
       a sloppy pile gets narrower. Six high. */
    stack({ body, hint, rng, done, panel, pips }) {
      const NEED = 6;
      const P = pips(NEED);
      const B = board(body, 'cg-logs', 240, 240);
      const btn = el('button', 'cg-pour-btn', 'DROP');
      btn.type = 'button';
      body.appendChild(btn);
      const { g, w, h } = B;
      const LH = 22, GROUND = h - 18;
      const pile = [{ x: w / 2 - 60, w: 120 }];
      const bits = [];
      let mv = { x: 0, w: 120, dir: 1 }, over = false, flash = null;
      const speed = () => 120 + (pile.length - 1) * 22;
      const yOf = (i) => GROUND - (i + 1) * LH;
      hint.textContent = 'Drop each log square on the pile';
      const logAt = (x, y, lw, a = 1) => {
        g.globalAlpha = a;
        g.fillStyle = '#7a4a26';
        g.beginPath(); g.roundRect ? g.roundRect(x, y + 2, lw, LH - 4, 9) : g.rect(x, y + 2, lw, LH - 4); g.fill();
        g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 6, y + 8, Math.max(0, lw - 12), 2);
        g.fillStyle = '#d8a86a';
        g.beginPath(); g.ellipse(x + lw - 4, y + LH / 2, 4, (LH - 4) / 2, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#8a5a34'; g.lineWidth = 1;
        g.beginPath(); g.ellipse(x + lw - 4, y + LH / 2, 2, (LH - 8) / 3, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
      };
      const stop = loop((dt) => {
        if (!over) {
          mv.x += mv.dir * speed() * dt;
          if (mv.x + mv.w > w - 4) { mv.x = w - 4 - mv.w; mv.dir = -1; }
          if (mv.x < 4) { mv.x = 4; mv.dir = 1; }
        }
        for (const b of bits) { b.vy += 700 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.a -= dt * 0.9; }
        while (bits.length && bits[0].a <= 0) bits.shift();
        g.fillStyle = '#1c130d'; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,140,40,.12)'; g.beginPath(); g.arc(w / 2, h + 40, 170, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3a2a1b'; g.fillRect(0, GROUND, w, h - GROUND);
        pile.forEach((p, i) => logAt(p.x, yOf(i), p.w));
        for (const b of bits) logAt(b.x, b.y, b.w, Math.max(0, b.a));
        if (!over) logAt(mv.x, yOf(pile.length) - 24, mv.w);
        if (flash) {
          flash.t += dt;
          g.globalAlpha = Math.max(0, 1 - flash.t);
          g.fillStyle = '#f2c14e'; g.font = '700 18px sans-serif'; g.textAlign = 'center';
          g.fillText(flash.text, w / 2, 26);
          g.globalAlpha = 1;
          if (flash.t > 1) flash = null;
        }
      });
      const drop = () => {
        if (over) return;
        const top = pile[pile.length - 1];
        const l = Math.max(mv.x, top.x), r = Math.min(mv.x + mv.w, top.x + top.w);
        const y = yOf(pile.length) - 24;
        if (r - l < 6) {
          bad(); shake(panel);
          bits.push({ x: mv.x, y, w: mv.w, vx: mv.dir * 40, vy: 0, a: 1 });
          hint.textContent = 'Missed the pile — again';
          mv.x = mv.dir > 0 ? 4 : w - 4 - mv.w;
          return;
        }
        if (Math.abs(mv.x - top.x) < 5) {
          pile.push({ x: top.x, w: Math.min(120, top.w + 6) });
          flash = { text: 'Perfect!', t: 0 };
          tone(1046, 0.16, 'triangle', 0.12);
        } else {
          if (mv.x < l) bits.push({ x: mv.x, y, w: l - mv.x, vx: -50, vy: 0, a: 1 });
          if (mv.x + mv.w > r) bits.push({ x: r, y, w: mv.x + mv.w - r, vx: 50, vy: 0, a: 1 });
          pile.push({ x: l, w: r - l });
          thud(120, 70, 0.12, 0.14);
        }
        const n = pile.length - 1;
        P(n); step(n * 2);
        if (n >= NEED) { over = true; hint.textContent = 'A fine pile.'; setTimeout(done, 400); return; }
        const top2 = pile[pile.length - 1];
        // a pile gone thin gets a fresh, wide log to save it
        mv = { x: mv.dir > 0 ? 4 : w - 4 - Math.max(top2.w, 34), w: Math.max(top2.w, 34), dir: mv.dir };
        hint.textContent = n + ' of ' + NEED + ' logs';
      };
      btn.onclick = drop;
      B.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); drop(); });
      const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) drop(); } };
      window.addEventListener('keydown', onKey);
      return () => { stop(); window.removeEventListener('keydown', onKey); };
    },

    /* A reel on the piano. Notes fall down three lanes; tap a lane as its
       note reaches the line and the tune plays. Eight good notes. */
    reel({ body, hint, rng, done, pips }) {
      const NEED = 8;
      const P = pips(NEED);
      const B = board(body, 'cg-reel', 240, 250);
      const { g, w, h } = B;
      const LANES = 3, LW = w / LANES, HIT = h - 38, FALL = 1.5;
      const TUNE = [587, 698, 880, 784, 698, 659, 587, 523, 587, 698, 880, 1047, 932, 880, 784, 698, 659, 587];
      const KEYS = (typeof Input !== 'undefined' && Input.isTouch) ? ['', '', ''] : ['A', 'S', 'D'];
      let t = 0, hits = 0, over = false, nextAt = 0.7, made = 0;
      const notes = [], rings = [], lit = [0, 0, 0], miss = [0, 0, 0];
      const speed = (HIT + 12) / FALL;
      hint.textContent = 'Tap each lane as its note hits the line';
      const stop = loop((dt) => {
        t += dt;
        if (!over && t >= nextAt) {
          let lane = rng.int(0, LANES - 1);
          const last = notes[notes.length - 1];
          if (last && last.lane === lane && rng() < 0.6) lane = (lane + 1 + rng.int(0, 1)) % LANES;
          notes.push({ lane, y: -12, k: made++, hit: false, gone: false });
          nextAt = t + (hits > 4 ? 0.42 : 0.52) + rng() * 0.12;
        }
        for (const n of notes) {
          if (n.hit || n.gone) continue;
          n.y += speed * dt;
          if (n.y > HIT + 30) { n.gone = true; }
        }
        while (notes.length && (notes[0].hit || notes[0].gone) && notes.length > 12) notes.shift();
        for (let i = 0; i < 3; i++) { lit[i] = Math.max(0, lit[i] - dt * 4); miss[i] = Math.max(0, miss[i] - dt * 4); }
        for (const r of rings) r.t += dt;
        while (rings.length && rings[0].t > 0.5) rings.shift();
        // draw
        g.fillStyle = '#120c08'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < LANES; i++) {
          g.fillStyle = i % 2 ? '#1f1610' : '#251a12';
          g.fillRect(i * LW, 0, LW, h);
          if (lit[i]) { g.fillStyle = 'rgba(242,193,78,' + (lit[i] * 0.25) + ')'; g.fillRect(i * LW, 0, LW, h); }
          if (miss[i]) { g.fillStyle = 'rgba(255,80,80,' + (miss[i] * 0.22) + ')'; g.fillRect(i * LW, 0, LW, h); }
        }
        g.strokeStyle = 'rgba(242,193,78,.7)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, HIT); g.lineTo(w, HIT); g.stroke();
        for (let i = 0; i < LANES; i++) {
          g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
          g.beginPath(); g.arc(i * LW + LW / 2, HIT, 15, 0, Math.PI * 2); g.stroke();
          if (KEYS[i]) { g.fillStyle = 'rgba(255,255,255,.45)'; g.font = '700 11px sans-serif'; g.textAlign = 'center'; g.fillText(KEYS[i], i * LW + LW / 2, h - 8); }
        }
        for (const n of notes) {
          if (n.hit || n.gone) continue;
          const x = n.lane * LW + LW / 2;
          g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(x, n.y, 12, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#5a3a10'; g.beginPath(); g.arc(x - 2, n.y + 2, 4.5, 0, Math.PI * 2); g.fill();
          g.fillRect(x + 1.5, n.y - 9, 2, 11);
        }
        for (const r of rings) {
          g.strokeStyle = 'rgba(255,240,180,' + (1 - r.t * 2) + ')'; g.lineWidth = 3;
          g.beginPath(); g.arc(r.x, HIT, 15 + r.t * 50, 0, Math.PI * 2); g.stroke();
        }
      });
      const play = (lane) => {
        if (over) return;
        let best = null;
        for (const n of notes) {
          if (n.hit || n.gone || n.lane !== lane) continue;
          if (Math.abs(n.y - HIT) < 28 && (!best || Math.abs(n.y - HIT) < Math.abs(best.y - HIT))) best = n;
        }
        if (!best) { miss[lane] = 1; thud(170, 110, 0.08, 0.08); return; }
        best.hit = true;
        lit[lane] = 1;
        rings.push({ x: lane * LW + LW / 2, t: 0 });
        tone(TUNE[hits % TUNE.length], 0.3, 'triangle', 0.16);
        hits++; P(hits);
        hint.textContent = hits + ' of ' + NEED + ' notes';
        if (hits >= NEED) { over = true; setTimeout(done, 300); }
      };
      B.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); play(Math.max(0, Math.min(LANES - 1, Math.floor(B.at(e).x / LW)))); });
      const LANE_OF = { KeyA: 0, ArrowLeft: 0, Digit1: 0, KeyS: 1, ArrowDown: 1, ArrowUp: 1, Digit2: 1, KeyD: 2, ArrowRight: 2, Digit3: 2 };
      const onKey = (e) => { if (e.code in LANE_OF) { e.preventDefault(); if (!e.repeat) play(LANE_OF[e.code]); } };
      window.addEventListener('keydown', onKey);
      return () => { stop(); window.removeEventListener('keydown', onKey); };
    },

    /* The library stacks with the lamps out. Your lantern is the only
       light; find the three things on the list among the clutter. */
    lantern({ body, hint, rng, done, panel, pips }) {
      const NEED = 3;
      const P = pips(NEED);
      const KINDS = shuffled(rng, ['key', 'candle', 'owl', 'rose', 'apple', 'star', 'bell', 'anchor', 'moon', 'wine', 'shoe', 'boat', 'stag']);
      const want = KINDS.slice(0, NEED), decoys = KINDS.slice(NEED, NEED + 6);
      const list = el('div', 'cg-find', '<span>Find</span>' + want.map(k => '<b data-k="' + k + '">' + pic(k) + '</b>').join(''));
      const room = el('div', 'cg-dark');
      body.append(list, room);
      const W = 300, H = 196;
      const spots = [];
      const items = want.concat(decoys).map((k) => {
        let x = 0, y = 0;
        for (let n = 0; n < 60; n++) {
          x = rng.range(22, W - 22); y = rng.range(22, H - 22);
          if (spots.every(s => Math.hypot(s[0] - x, s[1] - y) > 44)) break;
        }
        spots.push([x, y]);
        const b = el('button', 'cg-thing-lit', pic(k));
        b.type = 'button';
        b.style.left = (x / W * 100) + '%'; b.style.top = (y / H * 100) + '%';
        room.appendChild(b);
        return { k, b, x, y, found: false };
      });
      const cv = el('canvas', 'cg-gloom');
      cv.width = W; cv.height = H;
      room.appendChild(cv);
      const g = cv.getContext('2d');
      let lx = W / 2, ly = H / 2, t = 0, got = 0;
      const toRoom = (e) => {
        const r = room.getBoundingClientRect();
        return { x: (e.clientX - r.left) * W / (r.width || W), y: (e.clientY - r.top) * H / (r.height || H) };
      };
      const stop = loop((dt) => {
        t += dt;
        const R = 50 + Math.sin(t * 7) * 1.6 + Math.sin(t * 13.3) * 1.1;
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, W, H);
        g.fillStyle = 'rgba(4,3,2,.965)'; g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'destination-out';
        const grad = g.createRadialGradient(lx, ly, R * 0.25, lx, ly, R);
        grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad; g.beginPath(); g.arc(lx, ly, R, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(255,170,60,.10)'; g.beginPath(); g.arc(lx, ly, R * 0.9, 0, Math.PI * 2); g.fill();
      });
      const seek = (e) => { const p = toRoom(e); lx = p.x; ly = p.y; };
      room.addEventListener('pointermove', seek);
      room.addEventListener('pointerdown', seek);
      hint.textContent = 'Move the lantern about. Tap what is on the list.';
      for (const it of items) {
        it.b.onclick = (e) => {
          if (it.found) return;
          const p = e && e.clientX !== undefined && e.clientX !== 0 ? toRoom(e) : { x: lx, y: ly };
          if (Math.hypot(p.x - it.x, p.y - it.y) > 40 && Math.hypot(lx - it.x, ly - it.y) > 56) return;
          if (want.indexOf(it.k) < 0) {
            bad(); shake(panel);
            hint.textContent = 'Not that — check the list';
            return;
          }
          it.found = true;
          it.b.classList.add('got');
          const tick = list.querySelector('[data-k="' + it.k + '"]');
          if (tick) tick.classList.add('got');
          got++; P(got); step(got * 4);
          hint.textContent = got + ' of ' + NEED + ' found';
          if (got >= NEED) setTimeout(done, 300);
        };
      }
      return () => stop();
    },

    /* The long-case clock has stopped. Set it to the time on the card:
       drag the long hand for the minutes and the short one for the hour.
       Two clocks. */
    clock({ body, hint, rng, done, panel, pips }) {
      const NEED = 2;
      const P = pips(NEED);
      const card = el('div', 'cg-timecard');
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '-100 -100 200 200');
      svg.classList.add('cg-clock');
      const mk = (tag, attrs) => {
        const n = document.createElementNS(NS, tag);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        svg.appendChild(n);
        return n;
      };
      mk('circle', { r: 94, class: 'cg-clock-rim' });
      mk('circle', { r: 86, class: 'cg-clock-face' });
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * Math.PI * 2, big = i % 5 === 0;
        mk('line', { x1: Math.sin(a) * (big ? 72 : 78), y1: -Math.cos(a) * (big ? 72 : 78),
                     x2: Math.sin(a) * 82, y2: -Math.cos(a) * 82, class: big ? 'cg-tick big' : 'cg-tick' });
      }
      for (let i = 1; i <= 12; i++) {
        const a = i / 12 * Math.PI * 2;
        const tx = mk('text', { x: Math.sin(a) * 60, y: -Math.cos(a) * 60 + 6, class: 'cg-numeral' });
        tx.textContent = String(i);
      }
      const hourH = mk('line', { x1: 0, y1: 8, x2: 0, y2: -46, class: 'cg-hand hour' });
      const minH = mk('line', { x1: 0, y1: 12, x2: 0, y2: -72, class: 'cg-hand min' });
      mk('circle', { r: 6, class: 'cg-hub' });
      body.append(card, svg);
      const WORD = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
      const say = (hh, mm) => {
        const H = WORD[hh % 12], N = WORD[(hh + 1) % 12];
        if (mm === 0) return H + ' o’clock';
        if (mm === 15) return 'quarter past ' + H;
        if (mm === 30) return 'half past ' + H;
        if (mm === 45) return 'quarter to ' + N;
        return mm < 30 ? mm + ' past ' + H : (60 - mm) + ' to ' + N;
      };
      let hh = 0, mm = 0, target = null, won = 0, grab = null, live = true;
      const paint = () => {
        minH.setAttribute('transform', 'rotate(' + (mm * 6) + ')');
        hourH.setAttribute('transform', 'rotate(' + ((hh % 12 + mm / 60) * 30) + ')');
      };
      const deal = () => {
        hh = rng.int(0, 11); mm = rng.int(0, 11) * 5;
        do { target = { h: rng.int(0, 11), m: rng.int(0, 11) * 5 }; } while (target.h === hh || target.m === mm);
        const digital = (target.h || 12) + ':' + String(target.m).padStart(2, '0');
        card.innerHTML = '<small>Set it to</small><b>' + esc(say(target.h, target.m)) + '</b><span>' + digital + '</span>';
        paint();
      };
      deal();
      const check = () => {
        if (!live || hh !== target.h || mm !== target.m) return;
        won++; P(won); step(won * 5);
        svg.classList.add('right');
        tone(784, 0.4, 'sine', 0.14);
        grab = null;
        if (won >= NEED) { live = false; hint.textContent = 'Right on time.'; setTimeout(done, 350); return; }
        hint.textContent = 'That one’s going. The next…';
        live = false;
        setTimeout(() => { svg.classList.remove('right'); live = true; deal(); hint.textContent = 'Drag the hands'; }, 700);
      };
      const angleOf = (e) => {
        const r = svg.getBoundingClientRect();
        const x = (e.clientX - r.left) / (r.width || 200) * 200 - 100, y = (e.clientY - r.top) / (r.height || 200) * 200 - 100;
        let a = Math.atan2(x, -y) * 180 / Math.PI; if (a < 0) a += 360;
        return { a, r: Math.hypot(x, y) };
      };
      const set = (e) => {
        const p = angleOf(e);
        const before = hh * 60 + mm;
        if (grab === 'min') {
          const m2 = Math.round(p.a / 30) * 5 % 60;
          // winding past twelve carries the hour along, the way a real clock does
          if (mm >= 45 && m2 <= 10) hh = (hh + 1) % 12;
          else if (mm <= 10 && m2 >= 45) hh = (hh + 11) % 12;
          mm = m2;
        } else if (grab === 'hour') hh = ((Math.round(p.a / 30 - mm / 60) % 12) + 12) % 12;
        if (hh * 60 + mm !== before) { tone(1500, 0.03, 'square', 0.04); paint(); check(); }
      };
      svg.addEventListener('pointerdown', (e) => {
        if (!live) return;
        e.preventDefault();
        const p = angleOf(e);
        grab = p.r < 54 ? 'hour' : 'min';
        try { svg.setPointerCapture(e.pointerId); } catch (err) {}
        set(e);
      });
      const move = (e) => { if (grab && live) set(e); };
      const up = () => { grab = null; };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      const onKey = (e) => {
        if (!live) return;
        const k = { ArrowRight: [0, 5], ArrowLeft: [0, -5], ArrowUp: [1, 0], ArrowDown: [-1, 0] }[e.code];
        if (!k) return;
        e.preventDefault();
        let total = (hh * 60 + mm + k[0] * 60 + k[1] + 720) % 720;
        hh = Math.floor(total / 60); mm = total % 60;
        tone(1500, 0.03, 'square', 0.04); paint(); check();
      };
      window.addEventListener('keydown', onKey);
      hint.textContent = 'Long hand: minutes. Short hand: the hour.';
      return () => { live = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', onKey); };
    },

    /* The fountain's goldfish. The float bobs; little nibbles are
       nothing. When it goes right under, strike — too soon and the fish
       is gone for a moment. Three fish. */
    fish({ body, hint, rng, done, panel, pips }) {
      const NEED = 3;
      const P = pips(NEED);
      const B = board(body, 'cg-pond', 280, 190);
      const btn = el('button', 'cg-pour-btn', 'STRIKE');
      btn.type = 'button';
      body.appendChild(btn);
      const { g, w, h } = B;
      let t = 0, caught = 0, state = 'wait', until = 0, dip = 0, nibbles = [], leap = null, over = false;
      const ripples = [];
      const fx = w * 0.56, fy = h * 0.52;
      const arm = () => {
        state = 'wait';
        until = t + rng.range(1.3, 2.8);
        nibbles = [];
        const n = rng.int(caught ? 1 : 0, 2);
        for (let i = 0; i < n; i++) nibbles.push(t + rng.range(0.4, until - t - 0.3));
      };
      arm();
      hint.textContent = 'Wait for the float to go right under…';
      const stop = loop((dt) => {
        t += dt;
        let want = 0;
        if (state === 'wait') {
          for (const n of nibbles) if (t > n && t < n + 0.22) want = 4;
          if (nibbles.some(n => Math.abs(t - n) < dt)) ripples.push({ x: fx, y: fy, t: 0, s: 0.5 });
          if (t >= until) {
            state = 'bite'; until = t + Math.max(0.5, 0.8 - caught * 0.08);
            ripples.push({ x: fx, y: fy, t: 0, s: 1.2 });
            tone(240, 0.12, 'sine', 0.14);
          }
        } else if (state === 'bite') {
          want = 14;
          if (t >= until) { state = 'late'; until = t + 0.8; hint.textContent = 'It got away — strike on the big dip'; }
        } else if ((state === 'late' || state === 'scared' || state === 'reel') && t >= until) {
          if (state === 'reel' && caught >= NEED) { over = true; done(); }
          else { arm(); hint.textContent = caught + ' of ' + NEED + ' — watch the float'; }
        }
        dip = U.lerp(dip, want, 1 - Math.exp(-16 * dt));
        for (const r of ripples) r.t += dt;
        while (ripples.length && ripples[0].t > 1.4) ripples.shift();
        // the pond
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#16384a'); grd.addColorStop(1, '#0a1c28');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
        g.fillStyle = '#2f6b3a';
        for (const [px, py, pr] of [[46, 150, 20], [230, 40, 16], [250, 160, 22]]) {
          g.beginPath(); g.arc(px, py, pr, 0.4, Math.PI * 2); g.lineTo(px, py); g.fill();
        }
        for (const r of ripples) {
          g.strokeStyle = 'rgba(200,230,255,' + Math.max(0, 0.6 - r.t * 0.45) + ')'; g.lineWidth = 1.5;
          g.beginPath(); g.ellipse(r.x, r.y + 6, 8 + r.t * 40 * r.s, (8 + r.t * 40 * r.s) * 0.35, 0, 0, Math.PI * 2); g.stroke();
        }
        // the line and the float
        const bob = Math.sin(t * 2.4) * 1.5;
        g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(8, 4); g.quadraticCurveTo(fx - 60, fy - 70, fx, fy - 8 + dip + bob); g.stroke();
        g.save(); g.beginPath(); g.rect(0, 0, w, fy + 6); g.clip();
        g.fillStyle = '#f4f0e6'; g.beginPath(); g.ellipse(fx, fy + dip + bob, 5, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e0352e'; g.beginPath(); g.ellipse(fx, fy - 5 + dip + bob, 5, 5, 0, Math.PI, Math.PI * 2); g.fill();
        g.restore();
        if (state === 'bite') { g.fillStyle = '#ffd66b'; g.font = '800 22px sans-serif'; g.textAlign = 'center'; g.fillText('!', fx, fy - 22); }
        if (leap) {
          leap.t += dt;
          const k = Math.min(1, leap.t / 0.8);
          const x = U.lerp(fx, 30, k), y = fy - Math.sin(k * Math.PI) * 80;
          g.save(); g.translate(x, y); g.rotate(-0.6 + k * 1.4);
          g.fillStyle = '#ff8c2a'; g.beginPath(); g.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.moveTo(12, 0); g.lineTo(22, -7); g.lineTo(22, 7); g.closePath(); g.fill();
          g.fillStyle = '#111'; g.beginPath(); g.arc(-8, -2, 1.6, 0, Math.PI * 2); g.fill();
          g.restore();
          if (k >= 1) leap = null;
        }
      });
      const strike = () => {
        if (over) return;
        if (state === 'bite') {
          caught++; P(caught); step(caught * 4);
          state = 'reel'; until = t + 0.9;
          leap = { t: 0 };
          ripples.push({ x: fx, y: fy, t: 0, s: 1.6 });
          hint.textContent = caught >= NEED ? 'Three fine fish!' : 'Got one!';
          return;
        }
        if (state === 'wait') {
          bad(); shake(panel);
          state = 'scared'; until = t + 1.1;
          ripples.push({ x: fx, y: fy, t: 0, s: 1 });
          hint.textContent = 'Too soon — you scared it off';
        }
      };
      btn.onclick = strike;
      B.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); strike(); });
      const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) strike(); } };
      window.addEventListener('keydown', onKey);
      return () => { stop(); window.removeEventListener('keydown', onKey); };
    },

    /* Soup up the back stairs. The tray tips with every step; tilt it to
       keep the tureen in the gold. Fill the bar without a spill — a
       spill only costs you some of it. */
    tray({ body, hint, rng, done, panel, pips }) {
      const P = pips(4);
      const B = board(body, 'cg-tray', 280, 170);
      const { g, w, h } = B;
      const ph = [rng.range(0, 6.28), rng.range(0, 6.28)];
      const ZONE = 0.3;
      let t = 0, x = 0, v = 0, tilt = 0, want = 0, fill = 0, held = false, keys = 0, over = false, splash = null, shown = 0;
      const steer = (e) => { const p = B.at(e); want = U.clamp((p.x - w / 2) / (w * 0.38), -1, 1); };
      B.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); held = true; steer(e); try { B.cv.setPointerCapture(e.pointerId); } catch (err) {} });
      B.cv.addEventListener('pointermove', (e) => { if (held || e.pointerType === 'mouse') steer(e); });
      const up = () => { held = false; };
      window.addEventListener('pointerup', up);
      const kd = (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); keys = e.type === 'keydown' ? -1 : (keys < 0 ? 0 : keys); }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); keys = e.type === 'keydown' ? 1 : (keys > 0 ? 0 : keys); }
      };
      window.addEventListener('keydown', kd); window.addEventListener('keyup', kd);
      hint.textContent = 'Tilt to keep the tureen in the gold';
      const stop = loop((dt) => {
        t += dt;
        const aim = keys ? keys : want;
        tilt = U.lerp(tilt, aim, 1 - Math.exp(-6 * dt));
        const late = Math.min(1, t / 6);
        const gust = (Math.sin(t * 0.85 + ph[0]) * 0.9 + Math.sin(t * 2.2 + ph[1]) * 0.45) * (0.8 + late * 0.5);
        if (!over && !splash) {
          v += (tilt * 2.6 + gust) * dt;
          v *= Math.exp(-0.9 * dt);
          x += v * dt;
          if (Math.abs(x) < ZONE) fill = Math.min(1, fill + dt / 4.2);
          if (Math.abs(x) > 1) {
            bad(); shake(panel);
            splash = { t: 0, x };
            fill = Math.max(0, fill - 0.25);
            hint.textContent = 'Spilt! Steady…';
          }
          if (fill >= 1) { over = true; hint.textContent = 'Not a drop spilt.'; setTimeout(done, 250); }
        } else if (splash) {
          splash.t += dt;
          if (splash.t > 0.8) { splash = null; x = 0; v = 0; hint.textContent = 'Tilt to keep the tureen in the gold'; }
        }
        const k = Math.floor(fill * 4 + 1e-6);
        if (k !== shown) { if (k > shown) step(k * 3); shown = k; P(k); }
        // draw
        g.fillStyle = '#1a1410'; g.fillRect(0, 0, w, h);
        g.save(); g.translate(w / 2, h * 0.62); g.rotate(tilt * 0.22);
        const TW = w * 0.78;
        g.fillStyle = '#b8b2a4'; g.fillRect(-TW / 2, 0, TW, 8);
        g.fillStyle = '#8a8478'; g.fillRect(-TW / 2 - 8, -4, 10, 14); g.fillRect(TW / 2 - 2, -4, 10, 14);
        g.fillStyle = 'rgba(242,193,78,.55)'; g.fillRect(-TW / 2 * ZONE, 0, TW * ZONE, 3);
        const bx = U.clamp(x, -1.1, 1.1) * TW / 2;
        if (!splash) {
          g.fillStyle = '#e8e1cf'; g.beginPath(); g.ellipse(bx, -12, 26, 13, 0, 0, Math.PI); g.fill();
          g.fillStyle = '#d0b070'; g.beginPath(); g.ellipse(bx, -12, 24, 5, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.15 * Math.sin(t * 3)) + ')'; g.lineWidth = 2;
          for (let s = -1; s <= 1; s++) {
            g.beginPath(); g.moveTo(bx + s * 9, -20);
            g.quadraticCurveTo(bx + s * 9 + 6 * Math.sin(t * 2 + s), -32, bx + s * 9, -44); g.stroke();
          }
        } else {
          g.fillStyle = 'rgba(208,176,112,' + (1 - splash.t) + ')';
          for (let i = 0; i < 9; i++) {
            const a = i / 9 * Math.PI;
            g.beginPath(); g.arc(bx + Math.cos(a) * splash.t * 60 * Math.sign(splash.x), -10 - Math.sin(a) * splash.t * 40 + splash.t * splash.t * 60, 4, 0, Math.PI * 2); g.fill();
          }
        }
        g.restore();
        g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(20, h - 16, w - 40, 6);
        g.fillStyle = '#f2c14e'; g.fillRect(20, h - 16, (w - 40) * fill, 6);
      });
      return () => { stop(); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', kd); };
    },

    /* The fencing master in the gallery. Watch the blade: it comes from
       one side, sometimes after a feint, and you parry that way before
       it lands. Six parries, each a little quicker. */
    parry({ body, hint, rng, done, panel, pips }) {
      const NEED = 6;
      const P = pips(NEED);
      const arena = el('div', 'cg-arena');
      const core = el('div', 'cg-foil', '<i></i>');
      arena.appendChild(core);
      const DIRS = ['up', 'left', 'right', 'down'];
      const ARROW = { up: '↑', left: '←', right: '→', down: '↓' };
      const btns = {};
      for (const d of DIRS) {
        const b = el('button', 'cg-dir ' + d, ARROW[d]);
        b.type = 'button';
        b.onclick = () => parry(d);
        arena.appendChild(b);
        btns[d] = b;
      }
      body.appendChild(arena);
      let done_ = 0, threat = null, live = true;
      const timers = [];
      const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
      let strikeT = null;
      const clear = () => { for (const d of DIRS) btns[d].classList.remove('threat', 'feint', 'good', 'hurt'); core.className = 'cg-foil'; };
      const attack = () => {
        if (!live) return;
        clear(); threat = null;
        core.classList.add('wind');
        hint.textContent = 'En garde…';
        later(() => {
          if (!live) return;
          let d = DIRS[rng.int(0, 3)];
          const windowMs = Math.max(520, 1050 - done_ * 90);
          const go = (dir) => {
            clear(); threat = dir;
            btns[dir].classList.add('threat');
            core.classList.add('at-' + dir);
            core.style.setProperty('--win', windowMs + 'ms');
            tone(660, 0.05, 'square', 0.05);
            clearTimeout(strikeT);
            strikeT = later(() => { if (threat === dir) hit('Too slow — touché!'); }, windowMs);
          };
          if (done_ >= 2 && rng() < 0.4) {
            // the feint: it shows one side, then comes from another
            const f = d;
            d = DIRS[(DIRS.indexOf(f) + 1 + rng.int(0, 2)) % 4];
            clear(); threat = 'feint:' + f;
            btns[f].classList.add('feint');
            later(() => { if (live && threat === 'feint:' + f) go(d); }, 260);
          } else go(d);
          hint.textContent = 'Parry!';
        }, 500 + rng.int(0, 450));
      };
      const hit = (why) => {
        clearTimeout(strikeT);
        threat = null;
        bad(); shake(panel);
        arena.classList.add('touched'); later(() => arena.classList.remove('touched'), 300);
        hint.textContent = why;
        later(attack, 800);
      };
      function parry(d) {
        if (!live || !threat) return;
        if (threat.startsWith('feint:')) { hit('A feint — you bit. Touché!'); return; }
        if (d !== threat) { hit('Wrong side — touché!'); return; }
        clearTimeout(strikeT);
        btns[d].classList.add('good');
        threat = null;
        tone(1320, 0.07, 'square', 0.06); tone(1760, 0.12, 'triangle', 0.08);
        done_++; P(done_);
        hint.textContent = done_ + ' of ' + NEED + ' parried';
        if (done_ >= NEED) { live = false; setTimeout(done, 300); return; }
        later(attack, 380);
      }
      const KEY = { ArrowUp: 'up', KeyW: 'up', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down' };
      const onKey = (e) => { if (KEY[e.code]) { e.preventDefault(); if (!e.repeat) parry(KEY[e.code]); } };
      window.addEventListener('keydown', onKey);
      later(attack, 400);
      return () => { live = false; timers.forEach(clearTimeout); window.removeEventListener('keydown', onKey); };
    },

    /* A crest in the embroidery hoop, half sewn. Trace the dotted line
       with your finger to stitch it in gold. Wander off it and you are
       sewing air. */
    trace({ body, hint, rng, done, pips }) {
      const P = pips(5);
      const B = board(body, 'cg-hoop', 230, 220);
      const { g, w, h } = B;
      const cx = w / 2, cy = h / 2, N = 140;
      const SHAPES = [
        (t) => [16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))].map(v => v * 5),
        (t) => { const r = 62 + 18 * Math.cos(5 * t); return [Math.sin(t) * r, -Math.cos(t) * r]; },
        (t) => [Math.sin(t) * 82, Math.sin(2 * t) * 44],
        (t) => { const k = (t / (Math.PI * 2)) * 10, i = Math.floor(k) % 10, f = k - Math.floor(k);
                 const pt = (j) => { const a = j / 10 * Math.PI * 2, r = j % 2 ? 34 : 84; return [Math.sin(a) * r, -Math.cos(a) * r]; };
                 const a = pt(i), b = pt(i + 1); return [U.lerp(a[0], b[0], f), U.lerp(a[1], b[1], f)]; },
      ];
      const shape = SHAPES[rng.int(0, SHAPES.length - 1)];
      const pts = Array.from({ length: N }, (_, i) => { const p = shape(i / N * Math.PI * 2); return { x: cx + p[0], y: cy + p[1] + 4, on: false }; });
      let down = false, last = null, done_ = false, sewn = 0, needle = null, stray = 0;
      const draw = () => {
        g.fillStyle = '#2a1c12'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#efe6d4'; g.beginPath(); g.arc(cx, cy, 104, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(120,100,70,.12)'; g.lineWidth = 1;
        for (let i = -104; i < 104; i += 6) { g.beginPath(); g.moveTo(cx + i, cy - 104); g.lineTo(cx + i, cy + 104); g.moveTo(cx - 104, cy + i); g.lineTo(cx + 104, cy + i); g.stroke(); }
        g.strokeStyle = '#9a6e50'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, 106, 0, Math.PI * 2); g.stroke();
        g.setLineDash([3, 5]); g.strokeStyle = 'rgba(80,60,40,.6)'; g.lineWidth = 2;
        g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.stroke();
        g.setLineDash([]);
        g.strokeStyle = '#d4a017'; g.lineWidth = 4.5; g.lineCap = 'round';
        for (let i = 0; i < N; i++) {
          const a = pts[i], b = pts[(i + 1) % N];
          if (a.on && b.on) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
        }
        if (needle) {
          g.strokeStyle = stray > 0 ? '#ff8a9a' : '#c9ced6'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(needle.x, needle.y); g.lineTo(needle.x + 14, needle.y - 14); g.stroke();
        }
      };
      const sew = (p) => {
        const from = last || p, d = Math.hypot(p.x - from.x, p.y - from.y), n = Math.max(1, Math.ceil(d / 4));
        let near = false;
        for (let s = 1; s <= n; s++) {
          const q = { x: U.lerp(from.x, p.x, s / n), y: U.lerp(from.y, p.y, s / n) };
          for (const pt of pts) {
            const dd = Math.hypot(pt.x - q.x, pt.y - q.y);
            if (dd < 22) near = true;
            if (dd < 15 && !pt.on) { pt.on = true; sewn++; }
          }
        }
        last = p; needle = p;
        stray = near ? 0 : stray + 1;
        const k = sewn / N;
        P(Math.min(5, Math.floor(k / 0.88 * 5)));
        hint.textContent = stray > 6 ? 'Back onto the dotted line' : Math.round(Math.min(1, k / 0.88) * 100) + '% sewn';
        if (k >= 0.88 && !done_) { done_ = true; for (const pt of pts) pt.on = true; good(); setTimeout(done, 200); }
      };
      const stop = loop(draw);
      B.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); down = true; last = null; try { B.cv.setPointerCapture(e.pointerId); } catch (err) {} sew(B.at(e)); });
      B.cv.addEventListener('pointermove', (e) => { if (down) sew(B.at(e)); else needle = B.at(e); });
      const up = () => { down = false; last = null; };
      window.addEventListener('pointerup', up);
      hint.textContent = 'Trace the dotted line';
      return () => { stop(); window.removeEventListener('pointerup', up); };
    },

    /* The clan pipes, flat on the console. Blow to fill the bag and keep
       it in the gold as the gold wanders — while it is, they play. */
    bagpipes({ body, hint, rng, done, panel, pips }) {
      const P = pips(4);
      const wrap = el('div', 'cg-pipesbag');
      const gauge = el('div', 'cg-gauge', '<i class="cg-gband"></i><i class="cg-glevel"></i>');
      const bag = el('div', 'cg-bag', '<i></i><i></i><i></i>');
      wrap.append(bag, gauge);
      const btn = el('button', 'cg-pour-btn', 'HOLD TO BLOW');
      btn.type = 'button';
      body.append(wrap, btn);
      const band = gauge.querySelector('.cg-gband'), lvl = gauge.querySelector('.cg-glevel');
      const ph = rng.range(0, 6.28);
      let t = 0, p = 0.3, blowing = false, fill = 0, shown = 0, over = false;
      // the drone and the chanter: real oscillators, faded in while in tune
      let ctx = null, gain = null, osc = [], chanter = null;
      try {
        ctx = (typeof AudioBus !== 'undefined' && (AudioBus.ctx || AudioBus.init())) || null;
        if (ctx) {
          gain = ctx.createGain(); gain.gain.value = 0;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
          lp.connect(gain); gain.connect(ctx.destination);
          for (const f of [73.4, 146.8, 147.3]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); osc.push(o); }
          chanter = ctx.createOscillator(); chanter.type = 'sawtooth'; chanter.frequency.value = 587; chanter.connect(lp); chanter.start(); osc.push(chanter);
        }
      } catch (e) { ctx = null; }
      const MEL = [587, 659, 698, 880, 784, 698, 659, 587, 523, 587];
      const blowOn = (e) => { if (e) e.preventDefault(); blowing = true; btn.classList.add('on'); };
      const blowOff = () => { blowing = false; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', blowOn);
      window.addEventListener('pointerup', blowOff);
      const onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); if (e.type === 'keydown') { if (!e.repeat) blowOn(); } else blowOff(); } };
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
      hint.textContent = 'Keep the bag in the gold';
      const stop = loop((dt) => {
        t += dt;
        p += (blowing ? 0.62 : -0.34) * dt;
        const c = 0.55 + Math.sin(t * 0.75 + ph) * 0.2 + Math.sin(t * 1.9) * 0.05, hw = 0.12;
        let inTune = false;
        if (p > 1) { bad(); shake(panel); p = 0.55; hint.textContent = 'Squeal! Gentler…'; }
        p = Math.max(0, p);
        if (!over && Math.abs(p - c) < hw) { inTune = true; fill = Math.min(1, fill + dt / 4.5); }
        band.style.bottom = ((c - hw) * 100) + '%'; band.style.height = (hw * 200) + '%';
        lvl.style.height = (Math.min(1, p) * 100) + '%';
        gauge.classList.toggle('in', inTune);
        bag.style.transform = 'scale(' + (0.75 + Math.min(1, p) * 0.35).toFixed(3) + ')';
        if (gain && ctx) {
          gain.gain.setTargetAtTime(inTune ? 0.05 : 0, ctx.currentTime, 0.04);
          if (chanter) chanter.frequency.setTargetAtTime(MEL[Math.floor(t * 3.2) % MEL.length], ctx.currentTime, 0.01);
        }
        const k = Math.floor(fill * 4 + 1e-6);
        if (k !== shown) { shown = k; P(k); if (k) hint.textContent = ['', 'They’re skirling!', 'Keep it up…', 'Nearly a tune'][Math.min(3, k)] || hint.textContent; }
        if (!over && fill >= 1) { over = true; hint.textContent = 'A proper lament.'; setTimeout(done, 200); }
      });
      return () => {
        stop();
        window.removeEventListener('pointerup', blowOff);
        window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
        try { if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03); osc.forEach(o => o.stop(ctx.currentTime + 0.2)); } catch (e) {}
      };
    },

    /* The laird's account book. Add up the column and pick the total.
       Three pages, a line longer each time. */
    ledger({ body, hint, rng, done, panel, pips }) {
      const NEED = 3;
      const P = pips(NEED);
      const page = el('div', 'cg-ledger');
      const opts = el('div', 'cg-sums');
      body.append(page, opts);
      const GOODS = ['Candles', 'Claret', 'Oats', 'Peat', 'Tartan', 'Venison', 'Coal', 'Wax', 'Salt', 'Whisky', 'Hay', 'Lamp oil'];
      let won = 0, live = true, choices = [];
      const deal = () => {
        const n = 2 + won;
        const goods = shuffled(rng, GOODS).slice(0, n);
        const sums = goods.map(() => rng.int(2, 9 + won * 4));
        const total = sums.reduce((a, b) => a + b, 0);
        page.innerHTML = goods.map((gd, i) => '<div><span>' + esc(gd) + '</span><b>£' + sums[i] + '</b></div>').join('')
          + '<div class="cg-total"><span>Total</span><b>£ ?</b></div>';
        const set = new Set([total]);
        const near = [1, -1, 2, -2, 10, -10, 3];
        for (const d of shuffled(rng, near)) { if (set.size >= 4) break; if (total + d > 0) set.add(total + d); }
        choices = shuffled(rng, [...set]);
        opts.innerHTML = '';
        choices.forEach((v, i) => {
          const b = el('button', 'cg-sum', '£' + v + ((typeof Input !== 'undefined' && Input.isTouch) ? '' : '<kbd>' + (i + 1) + '</kbd>'));
          b.type = 'button';
          b.onclick = () => pick(v, b, total, page);
          opts.appendChild(b);
        });
        hint.textContent = 'Page ' + (won + 1) + ' of ' + NEED;
      };
      const pick = (v, b, total, pg) => {
        if (!live || b.disabled) return;
        if (v !== total) { bad(); shake(panel); b.disabled = true; b.classList.add('wrong'); hint.textContent = 'Not that — tot it up again'; return; }
        b.classList.add('right');
        const tl = pg.querySelector('.cg-total b'); if (tl) tl.textContent = '£' + total;
        won++; P(won); step(won * 4);
        live = false;
        if (won >= NEED) { hint.textContent = 'The books balance.'; setTimeout(done, 350); return; }
        setTimeout(() => { live = true; deal(); }, 600);
      };
      const onKey = (e) => {
        const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
        if (!m) return;
        const b = opts.children[Number(m[1]) - 1];
        if (b) { e.preventDefault(); b.click(); }
      };
      window.addEventListener('keydown', onKey);
      deal();
      return () => { live = false; window.removeEventListener('keydown', onKey); };
    },

    /* The dumbwaiter in the scullery: wind the handle round and round to
       haul the box up the shaft. Stop winding and it creeps back down. */
    crank({ body, hint, rng, done, pips }) {
      const P = pips(4);
      const TURNS = 3.2;
      const wrap = el('div', 'cg-winch');
      const shaft = el('div', 'cg-shaft', '<i class="cg-box"></i><i class="cg-rope"></i>');
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '-80 -80 160 160');
      svg.classList.add('cg-wheel');
      svg.innerHTML = '<circle r="70" class="cg-wheel-rim"/><circle r="10" class="cg-hub"/>'
        + '<g class="cg-arm"><line x1="0" y1="0" x2="0" y2="-54"/><circle cy="-54" r="13" class="cg-knob"/></g>'
        + '<path class="cg-wheel-arrow" d="M 44 -56 A 72 72 0 0 1 70 -16" />';
      wrap.append(svg, shaft);
      body.appendChild(wrap);
      const arm = svg.querySelector('.cg-arm'), box = shaft.querySelector('.cg-box'), rope = shaft.querySelector('.cg-rope');
      let ang = 0, prog = 0, grab = null, lastA = 0, clickAt = 0, idle = 0, over = false, keyTurn = false, shown = 0;
      const angleOf = (e) => {
        const r = svg.getBoundingClientRect();
        const x = (e.clientX - r.left) / (r.width || 160) * 160 - 80, y = (e.clientY - r.top) / (r.height || 160) * 160 - 80;
        return Math.atan2(x, -y);
      };
      const turn = (d) => {
        if (over) return;
        if (d > 0) { prog = Math.min(1, prog + d / (Math.PI * 2 * TURNS)); idle = 0; }
        ang += d;
        if (Math.abs(ang - clickAt) > 0.5) { clickAt = ang; tone(d > 0 ? 900 : 500, 0.025, 'square', 0.04); }
      };
      svg.addEventListener('pointerdown', (e) => { e.preventDefault(); grab = true; lastA = angleOf(e); try { svg.setPointerCapture(e.pointerId); } catch (err) {} });
      const move = (e) => {
        if (!grab) return;
        const a = angleOf(e);
        let d = a - lastA;
        if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        lastA = a;
        turn(d);
      };
      const up = () => { grab = null; };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      const onKey = (e) => {
        if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); keyTurn = e.type === 'keydown'; }
      };
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
      hint.textContent = 'Wind it clockwise, round and round';
      const stop = loop((dt) => {
        if (keyTurn) turn(dt * 5.2);
        idle += dt;
        if (!over && idle > 0.35 && prog > 0) prog = Math.max(0, prog - dt * 0.05);
        arm.setAttribute('transform', 'rotate(' + (ang * 180 / Math.PI).toFixed(1) + ')');
        box.style.bottom = (prog * 78) + '%';
        rope.style.height = ((1 - prog) * 78 + 4) + '%';
        const k = Math.floor(prog * 4 + 1e-6);
        if (k !== shown) { if (k > shown) step(k * 3); shown = k; P(k); }
        hint.textContent = over ? 'Up it comes.' : idle > 0.35 && prog > 0 ? 'It’s slipping — keep winding!' : Math.round(prog * 100) + '% of the way up';
        if (!over && prog >= 1) { over = true; hint.textContent = 'Up it comes.'; setTimeout(done, 250); }
      });
      return () => { stop(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
    },
  };

  /* A coin into the pot. */
  if (typeof AudioBus !== 'undefined' && AudioBus.define) {
    AudioBus.define('coin', (ctx, dest) => {
      const t = ctx.currentTime;
      for (const [at, f] of [[0, 1318], [0.07, 1975]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(0.12, t + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.25);
        o.connect(g); g.connect(dest); o.start(t + at); o.stop(t + at + 0.3);
      }
    });
  }

  return { open, close, TYPES: Object.keys(GAMES),
           get open_() { return !!current; },
           get active() { return !!current; } };
})();
