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

   Every panel says how it is played in one line under its title, so
   nobody has to work a puzzle out with a Traitor walking up behind
   them; the line under the puzzle is how it is going.

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
  const click = () => { if (typeof AudioBus !== 'undefined') AudioBus.play('ui-click'); };
  const good = () => tone(880, 0.18, 'sine', 0.14);
  const bad = () => tone(150, 0.22, 'square', 0.08);

  /* A spray of gold off the panel when a job is done. */
  function burst(panel) {
    for (let i = 0; i < 16; i++) {
      const sp = el('i', 'cg-spark');
      const a = (i / 16) * Math.PI * 2;
      sp.style.setProperty('--dx', (Math.cos(a) * (90 + Math.random() * 70)).toFixed(0) + 'px');
      sp.style.setProperty('--dy', (Math.sin(a) * (70 + Math.random() * 60)).toFixed(0) + 'px');
      panel.appendChild(sp);
      setTimeout(() => sp.remove(), 900);
    }
  }

  function shake(node) {
    node.classList.remove('cg-shake');
    void node.offsetWidth;
    node.classList.add('cg-shake');
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
    const hint = el('div', 'cg-hint', '');
    panel.append(head, how, body, hint);
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
          burst(panel);
          setTimeout(() => close(true), 750);
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
        cleanup = game({ body, hint, rng, done: () => finish(true), panel });
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
    safe({ body, hint, rng, done, panel }) {
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
       own colour across the box. Click one end, then the other. */
    wires({ body, hint, rng, done }) {
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
        const down = (e) => { e.preventDefault(); pick(side, idx); };
        hit.addEventListener('pointerdown', down);
        c.addEventListener('pointerdown', down);
        svg.append(hit, c);
        return c;
      };
      const stub = (x1, y, x2, col) => {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y); l.setAttribute('x2', x2); l.setAttribute('y2', y);
        l.setAttribute('stroke', col); l.setAttribute('stroke-width', 10); l.setAttribute('stroke-linecap', 'round');
        svg.appendChild(l);
      };
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
        if (right[ri] !== li) { bad(); return; }
        joined.add(li);
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', 30); l.setAttribute('y1', ys[li]); l.setAttribute('x2', 270); l.setAttribute('y2', ys[ri]);
        l.setAttribute('stroke', COLS[li][0]); l.setAttribute('stroke-width', 9); l.setAttribute('stroke-linecap', 'round');
        svg.insertBefore(l, svg.firstChild);
        tone(420 + joined.size * 110, 0.12, 'sine', 0.1);
        hint.textContent = joined.size + ' of 4 joined';
        if (joined.size === COLS.length) done();
      }
    },

    /* Six candles on the candelabra, each with a number scratched in the
       wax. Light them in order; a wrong one blows them all out. */
    candles({ body, hint, rng, done, panel }) {
      const n = 6;
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
            bad(); shake(panel); next = 1;
            nodes.forEach(x => x.classList.remove('lit'));
            hint.textContent = 'Blown out. Start again from 1.';
            return;
          }
          c.classList.add('lit');
          tone(320 + num * 70, 0.15, 'sine', 0.1);
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
    bells({ body, hint, rng, done, panel }) {
      const NOTES = [392, 494, 587, 698];
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
          if (round >= 2) { playing = true; done(); return; }
          timers.push(setTimeout(newRound, 700));
        }
      }
      newRound();
      return () => timers.forEach(clearTimeout);
    },

    /* The post has come in. Every letter into the pigeonhole of the
       family whose seal is on it. Click a letter, then its hole. */
    letters({ body, hint, rng, done }) {
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
          if (held.dataset.seal !== String(i)) { bad(); held.classList.remove('held'); held = null; hint.textContent = 'Wrong seal — check the colour.'; return; }
          click(); held.remove(); held = null; left--; say();
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
      say();
    },

    /* Which of these is the clan's tartan? Three of them, quickly. */
    tartan({ body, hint, rng, done, panel }) {
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
            click(); round++;
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
    bats({ body, hint, rng, done }) {
      const box = el('div', 'cg-rafters');
      body.appendChild(box);
      const n = 6 + rng.int(0, 2);
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
          tone(900 + left * 70, 0.08, 'square', 0.06);
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
      const place = () => { lo = 15 + rng.int(0, 55); hi = lo + 16 - set * 3; zone.style.left = lo + '%'; zone.style.width = (hi - lo) + '%'; };
      place();
      const step = (now) => {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
        pos += dir * dt * (70 + set * 35);
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
    bellows({ body, hint, done, panel }) {
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
          if (heat >= 4) done();
        } else {
          bad(); shake(panel); heat = Math.max(0, heat - 1);
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
    brew({ body, hint, rng, done, panel }) {
      const ALL = [['🌿', 'thistle'], ['🌸', 'heather'], ['🥃', 'whisky'], ['🍯', 'honey'], ['🧂', 'salt'], ['🍄', 'toadstool'], ['🫐', 'bramble'], ['💧', 'spring water']];
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
        const b = el('button', 'cg-ingredient', '<b>' + ing[0] + '</b><span>' + ing[1] + '</span>');
        b.type = 'button';
        b.onclick = () => {
          if (ing === recipe[at]) {
            marks[at].classList.add('in'); at++;
            pot.classList.remove('bubble'); void pot.offsetWidth; pot.classList.add('bubble');
            tone(300 + at * 90, 0.15, 'sine', 0.12);
            if (at >= recipe.length) done();
            else hint.textContent = 'Next: ' + recipe[at][1];
          } else {
            bad(); shake(panel); at = 0;
            hint.textContent = 'Spoilt. Start again: ' + recipe[0][1];
            marks.forEach(m => m.classList.remove('in'));
            pot.classList.add('spoilt'); setTimeout(() => pot.classList.remove('spoilt'), 500);
          }
        };
        row.appendChild(b);
      }
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
