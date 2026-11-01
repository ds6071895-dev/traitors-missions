/* ------------------------------------------------------------------
   slate.js — writing a name on your slate.

   At the round table a vote is not a button: you pick the name, and
   then you write it. The slate comes up, the chalk scrapes the name on
   to it letter by letter in your own uneven hand, and your finger or
   mouse can underline it, circle it, scrawl whatever you like. Then it
   is turned face down. The vote itself has already gone to the host the
   moment the name was chosen, so nothing here can hold the table up:
   the slate closes itself after a few seconds, or on "Done".

   `Slate.write(name)` resolves when the slate is put down.
   `Slate.html(name)` is the small chalk slate the reveal card shows.
------------------------------------------------------------------ */
const Slate = (() => {

  const HOLD_MS = 4200;            // closes itself, so a slow writer never holds the table
  let open = null;                 // { close } while a slate is up

  if (typeof AudioBus !== 'undefined' && AudioBus.define) {
    /* Chalk: a short, gritty scrape of band-passed noise. */
    AudioBus.define('chalk', (c, d, o) => {
      const t = c.currentTime;
      const n = AudioBus.noiseSource ? AudioBus.noiseSource() : null;
      if (!n) return;
      const f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'bandpass'; f.Q.value = 3.5;
      const hz = 2400 + Math.random() * 1600;
      f.frequency.setValueAtTime(hz, t);
      f.frequency.linearRampToValueAtTime(hz * (0.8 + Math.random() * 0.4), t + 0.12);
      n.connect(f); f.connect(g); g.connect(d);
      const len = o.len || 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      n.start(t); n.stop(t + len + 0.05);
    });
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function html(name) {
    return '<span class="slate-mini"><span>' + esc(name) + '</span></span>';
  }

  function write(name) {
    if (typeof document === 'undefined' || !document.body || !document.createElement) return Promise.resolve();
    if (open) open.close();
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'slate-wrap';
      wrap.innerHTML = '<div class="slate-board"><canvas class="slate-canvas"></canvas>'
        + '<div class="slate-hint">Underline it, circle it — then turn it over.</div>'
        + '<button type="button" class="slate-done">TURN IT OVER</button></div>';
      document.body.appendChild(wrap);
      const canvas = wrap.querySelector('.slate-canvas');
      const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
      const W = 560, H = 300;
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      if (canvas) { canvas.width = W * dpr; canvas.height = H * dpr; }
      if (ctx && ctx.scale) ctx.scale(dpr, dpr);

      let done = false, closeTimer = null;
      const timers = [];
      const close = () => {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        clearTimeout(closeTimer);
        if (wrap.classList) wrap.classList.add('turned');
        if (typeof AudioBus !== 'undefined') AudioBus.play('card-in', { tone: 'bad' });
        setTimeout(() => { if (wrap.remove) wrap.remove(); }, 380);
        if (open && open.close === close) open = null;
        resolve();
      };
      open = { close };
      const btn = wrap.querySelector('.slate-done');
      if (btn) btn.onclick = (e) => { if (e && e.preventDefault) e.preventDefault(); close(); };
      closeTimer = setTimeout(close, HOLD_MS);
      if (!ctx || !ctx.fillText) return;

      // the slate's own smudges
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let i = 0; i < 26; i++) {
        ctx.beginPath && ctx.beginPath();
        ctx.ellipse && ctx.ellipse(Math.random() * W, Math.random() * H, 20 + Math.random() * 60, 6 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill && ctx.fill();
      }

      /* The name, a letter at a time, each a little off the line, as a
         hand writes. Chalk is drawn as the glyph several times with a
         small jitter and low alpha, which gives it grain. */
      const text = String(name || '').toUpperCase().slice(0, 18);
      let size = 96;
      ctx.font = '700 ' + size + 'px Caveat, "Comic Sans MS", cursive';
      const measure = (s) => (ctx.measureText ? ctx.measureText(s).width : s.length * size * 0.5);
      while (size > 40 && measure(text) > W - 60) { size -= 6; ctx.font = '700 ' + size + 'px Caveat, "Comic Sans MS", cursive'; }
      let x = (W - measure(text)) / 2;
      const base = H / 2 + size * 0.32;
      const letter = (ch) => {
        const tilt = (Math.random() - 0.5) * 0.12, dy = (Math.random() - 0.5) * 6;
        ctx.save && ctx.save();
        ctx.translate && ctx.translate(x, base + dy);
        ctx.rotate && ctx.rotate(tilt);
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = 'rgba(240,238,228,' + (0.22 + Math.random() * 0.2) + ')';
          ctx.fillText(ch, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2);
        }
        ctx.restore && ctx.restore();
        x += measure(ch) + 2;
        if (typeof AudioBus !== 'undefined' && ch !== ' ') AudioBus.play('chalk', { len: 0.07 + Math.random() * 0.06 });
      };
      [...text].forEach((ch, i) => timers.push(setTimeout(() => { if (!done) letter(ch); }, 180 + i * 95)));

      // and whatever the hand adds: a line where the pointer drags
      let last = null;
      const at = (e) => {
        const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: W, height: H };
        return { x: (e.clientX - r.left) * (W / (r.width || W)), y: (e.clientY - r.top) * (H / (r.height || H)) };
      };
      const stroke = (a, b) => {
        ctx.strokeStyle = 'rgba(240,238,228,0.75)';
        ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      };
      if (canvas.addEventListener) {
        canvas.addEventListener('pointerdown', (e) => {
          e.preventDefault(); last = at(e);
          // drawing is a sign they are still writing: give them a moment more
          clearTimeout(closeTimer);
          closeTimer = setTimeout(close, 2500);
          try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
        });
        canvas.addEventListener('pointermove', (e) => {
          if (!last || done) return;
          const p = at(e);
          if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
          stroke(last, p);
          if (Math.random() < 0.25 && typeof AudioBus !== 'undefined') AudioBus.play('chalk', { len: 0.05 });
          last = p;
        });
        const up = () => { last = null; };
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
      }
    });
  }

  return { write, html, close: () => { if (open) open.close(); }, get open() { return !!open; } };
})();
