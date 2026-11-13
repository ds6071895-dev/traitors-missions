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
    breakfast: ['night', 'dawn'],
    table:     ['dawn', 'morning'],
    finale:    ['dusk', 'night'],
  };
  const MIN = 1.6;          // seconds, a plain cut
  const MIN_CARD = 2.8;     // seconds, with the day's card on it
  const SWAP_AT = 0.4;      // the room is built underneath at this share of the minimum
  const DRAWN_CAP = 4000;   // never hold for a lost GPU longer than this

  let el = null;
  let owner = null;

  /* ---------------- the painting ---------------- */

  // a crenellated block: x0..x1, top at y, merlons every `step`
  function battlement(x0, x1, y, step = 14, h = 9) {
    let d = `M${x0} 420 V${y}`;
    for (let x = x0, up = true; x < x1; x += step / 2, up = !up) {
      const nx = Math.min(x1, x + step / 2);
      d += up ? ` V${y - h} H${nx}` : ` V${y} H${nx}`;
    }
    return d + ` V420 Z`;
  }
  // a round tower with a cone roof
  const cone = (x0, x1, y, peak) => `M${x0} 420 V${y} L${(x0 + x1) / 2} ${peak} L${x1} ${y} V420 Z`;

  const WINDOWS = [
    [492, 330], [520, 330], [548, 330], [652, 330], [680, 330], [708, 330],
    [492, 370], [548, 370], [652, 370], [708, 370],
    [440, 280], [440, 330], [592, 290], [608, 290], [752, 250], [752, 300], [752, 350],
  ];

  function svg() {
    const castle = [
      battlement(470, 730, 300),
      battlement(560, 640, 262, 12, 8),
      cone(422, 478, 250, 196),
      cone(722, 782, 222, 150),
      cone(586, 614, 262, 214),
      battlement(380, 470, 360, 12, 7),
      battlement(730, 840, 352, 12, 7),
    ].map(d => `<path d="${d}"/>`).join('');
    const wins = WINDOWS.map(([x, y], i) =>
      `<rect class="il-win" style="--i:${i}" x="${x - 4}" y="${y - 9}" width="8" height="14" rx="4"/>`).join('');
    return `<svg class="il-land" viewBox="0 0 1200 500" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path class="il-hills-far" d="M0 330 C150 282 300 300 420 272 C560 238 700 292 820 262 C960 226 1080 282 1200 256 V500 H0Z"/>
      <path class="il-hills" d="M0 392 C180 360 300 382 400 372 C520 360 700 378 860 366 C1000 356 1100 380 1200 370 V500 H0Z"/>
      <g class="il-castle">${castle}</g>
      <g class="il-windows">${wins}</g>
      <rect class="il-loch" x="0" y="420" width="1200" height="80"/>
      <g class="il-reflect" transform="translate(0 840) scale(1 -1)">${castle}</g>
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
      <div class="il-orb"></div>
      ${svg()}
      <div class="il-veil"></div>
      <div class="il-mist"><i></i><i></i><i></i></div>
      <div class="il-rain"></div>
      <div class="il-bolt"></div>
      <div class="il-card">
        <div class="il-kicker"></div>
        <div class="il-title"></div>
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
    c.querySelector('.il-title').textContent = (card && card.title) || '';
    c.querySelector('.il-chips').innerHTML = card && card.chips
      ? card.chips.map(p => `<span class="il-chip${p.gone ? ' gone' : ''}${p.you ? ' you' : ''}">${esc(p.name)}`
          + (p.gone ? `<em>${esc(p.gone)}</em>` : '') + '</span>').join('')
      : '';
    const sub = [];
    if (card && card.full && card.pot !== undefined) sub.push('<b>' + money(card.pot) + '</b> in the pot');
    if (card && card.twist) sub.push('<span class="il-twist">' + esc(card.twist) + '</span>');
    c.querySelector('.il-sub').innerHTML = sub.join('');
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
    // a swell of rain against the windows
    AudioBus.define('il-rain', (ctx, dest, o = {}) => {
      const t = ctx.currentTime;
      const src = noiseBurst(ctx, 2.6, 4);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.storm ? 5200 : 4200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.storm ? 0.22 : 0.15, t + 0.6);
      g.gain.setValueAtTime(o.storm ? 0.22 : 0.15, t + 1.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest); src.start(t);
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
    root.className = `h-${from} to-${hour} w-${weather} for-${to}`;
    paintCard(card);
    void root.offsetWidth;            // restart every animation from its first frame
    root.classList.add('on');
    /* The band needs no help here: the old room's cue fades out over a
       second and a half as it is torn down underneath, and the new one
       fades in over as long when the room begins — a crossfade across
       the painting, with these sounds in the middle of it. */
    sound(to, weather);
    const t0 = Date.now();
    try {
      if (!await sleep(min * SWAP_AT, signal)) return false;
      root.classList.add('turn');     // the hour starts to change
      await work(lifted);
      if (signal && signal.aborted) return false;
      const drawn = typeof Engine !== 'undefined' && Engine.drawn ? Engine.drawn() : Promise.resolve();
      await Promise.race([drawn, sleep(DRAWN_CAP)]);
      if (!await sleep(Math.max(0, min - (Date.now() - t0)), signal)) return false;
      return true;
    } finally {
      lift();
      if (owner === me) { owner = null; root.classList.remove('on', 'turn'); }
    }
  }

  return { play, cardFor, weatherFor, HOURS, MIN, MIN_CARD,
           get showing() { return !!owner; } };
})();
