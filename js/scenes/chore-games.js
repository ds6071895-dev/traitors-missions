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
          setTimeout(() => close(true), 820);
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
