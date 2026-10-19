/* ------------------------------------------------------------------
   castle-props.js — what the castle is dressed in.

   The look of the place on the programme, rather than the shape of it:
   tartan, the marquetry on the round table, oil portraits in gilt, red
   and green damask, and the view out of every window — the loch, the
   far shore and the hills behind it, at whatever hour the scene is.

   Everything here is painted once on a canvas and cached for the life
   of the page (marked shared, so `Engine.disposeObject` leaves it be),
   which is why the house can be torn down and rebuilt between scenes
   without repainting a single thread.

   The other half is the furniture that more than one file needs: the
   high-backed chair everybody sits in, built once per material and
   handed out as merged geometry, and a turned leg or candlestick.
------------------------------------------------------------------ */
const CastleProps = (() => {

  const TAU = Math.PI * 2;
  const low = () => GameState.data.settings.quality === 'low';
  const cache = new Map();

  function canvasTexture(key, w, h, paint, opts = {}) {
    const k = key + (low() ? '-low' : '');
    if (cache.has(k)) return cache.get(k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = opts.clampS ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.wrapT = opts.repeatT === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.anisotropy = low() ? 2 : 8;
    t.userData.estateShared = true;
    cache.set(k, t);
    return t;
  }

  const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

  /* ---------------- tartan ----------------
     A sett is a list of stripes, mirrored about its last one the way a
     real tartan pivots. Warp first, then the weft over it at half
     strength, which is what makes the checks; then a twill hatch. */
  const SETTS = {
    stewart: [['#9a1b24', 26], ['#15204a', 8], ['#9a1b24', 3], ['#121212', 2], ['#9a1b24', 3],
              ['#1f4d33', 10], ['#e3c75e', 1.4], ['#1f4d33', 10], ['#9a1b24', 3], ['#f3ead6', 1.2]],
    watch:   [['#1e4230', 18], ['#121c3b', 12], ['#0c0c0d', 3], ['#121c3b', 3], ['#0c0c0d', 3],
              ['#121c3b', 12], ['#1e4230', 18], ['#0c0c0d', 8]],
    hunting: [['#35512f', 20], ['#6b2a1f', 6], ['#35512f', 4], ['#cfae52', 1.2], ['#35512f', 4],
              ['#18264a', 10]],
  };
  function tartan(kind = 'stewart') {
    const S = low() ? 128 : 256;
    return canvasTexture('tartan-' + kind, S, S, (g) => {
      const sett = SETTS[kind] || SETTS.stewart;
      const full = sett.concat(sett.slice(1, -1).reverse());
      const total = full.reduce((n, s) => n + s[1], 0);
      const k = S / total;
      let at = 0;
      for (const [c, w] of full) { g.fillStyle = c; g.fillRect(at * k, 0, w * k + 0.6, S); at += w; }
      g.globalAlpha = 0.52;
      at = 0;
      for (const [c, w] of full) { g.fillStyle = c; g.fillRect(0, at * k, S, w * k + 0.6); at += w; }
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(0,0,0,0.13)';
      g.lineWidth = 1;
      for (let i = -S; i < S; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      for (let i = -S + 1; i < S; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); }
    });
  }

  /* ---------------- damask ----------------
     Wallpaper: a ground colour and a paler, flatter version of it in a
     half-drop of stylised leaves. */
  function damask(kind = 'red') {
    const S = low() ? 128 : 256;
    const pal = kind === 'green' ? ['#29483a', '#3b604d'] : ['#6a1a22', '#86303a'];
    return canvasTexture('damask-' + kind, S, S, (g) => {
      g.fillStyle = pal[0]; g.fillRect(0, 0, S, S);
      g.fillStyle = pal[1];
      const motif = (cx, cy, s) => {
        g.beginPath();
        g.moveTo(cx, cy - s);
        g.bezierCurveTo(cx + s * 0.7, cy - s * 0.5, cx + s * 0.55, cy + s * 0.3, cx, cy + s);
        g.bezierCurveTo(cx - s * 0.55, cy + s * 0.3, cx - s * 0.7, cy - s * 0.5, cx, cy - s);
        g.fill();
        g.beginPath(); g.arc(cx, cy - s * 1.15, s * 0.14, 0, TAU); g.fill();
        for (const sx of [-1, 1]) {
          g.beginPath();
          g.ellipse(cx + sx * s * 0.62, cy + s * 0.55, s * 0.28, s * 0.12, sx * 0.6, 0, TAU);
          g.fill();
        }
      };
      const s = S * 0.17;
      for (const [x, y] of [[0.25, 0.25], [0.75, 0.75], [-0.25, 0.75], [1.25, 0.25], [0.25, 1.25], [0.75, -0.25]]) {
        motif(x * S, y * S, s);
      }
      g.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = 0; y < S; y += 2) g.fillRect(0, y, S, 1);
    });
  }

  /* ---------------- wood, painted ---------------- */
  function grain(g, rng, S, base, angle, n, cx = S / 2, cy = S / 2) {
    g.fillStyle = base;
    g.fillRect(-S, -S, S * 3, S * 3);
    g.save();
    g.translate(cx, cy); g.rotate(angle); g.translate(-cx, -cy);
    for (let i = 0; i < n; i++) {
      const y = -S * 0.5 + rng() * S * 2;
      const dark = rng() < 0.6;
      g.strokeStyle = dark ? 'rgba(25,12,4,' + (0.06 + rng() * 0.12) + ')'
                           : 'rgba(255,220,170,' + (0.04 + rng() * 0.07) + ')';
      g.lineWidth = 0.6 + rng() * 2.2;
      const f = 0.004 + rng() * 0.01, ph = rng() * TAU, amp = 1 + rng() * 5;
      g.beginPath();
      for (let x = -S * 0.5; x <= S * 1.5; x += 16) {
        const yy = y + Math.sin(x * f + ph) * amp;
        if (x === -S * 0.5) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.stroke();
    }
    g.restore();
  }

  /* The round table's top. A walnut field, a band of alternating oak
     and burr segments laid with the grain running outward, two brass
     rings, and an eight-pointed star in the middle — the one shape in
     the room everything else is arranged round. */
  function marquetry() {
    const S = low() ? 512 : 1024;
    return canvasTexture('marquetry', S, S, (g) => {
      const rng = U.makeRng(4242);
      const c = S / 2;
      const clipDisc = (r0, r1, a0 = 0, a1 = TAU) => {
        g.beginPath();
        g.arc(c, c, r1, a0, a1, false);
        if (r0 > 0) g.arc(c, c, r0, a1, a0, true); else g.lineTo(c, c);
        g.closePath();
      };
      grain(g, rng, S, '#4a2a17', 0, 320);
      // the segmented band
      const N = 24;
      for (let i = 0; i < N; i++) {
        const a0 = i / N * TAU, a1 = (i + 1) / N * TAU;
        g.save();
        clipDisc(c * 0.66, c * 0.94, a0, a1);
        g.clip();
        grain(g, rng, S, i % 2 ? '#a8733f' : '#6d4022', (a0 + a1) / 2, 60);
        g.restore();
        g.strokeStyle = 'rgba(20,10,4,0.55)'; g.lineWidth = S * 0.002;
        g.beginPath();
        g.moveTo(c + Math.cos(a0) * c * 0.66, c + Math.sin(a0) * c * 0.66);
        g.lineTo(c + Math.cos(a0) * c * 0.94, c + Math.sin(a0) * c * 0.94);
        g.stroke();
      }
      // the heart, darker and laid across
      g.save(); clipDisc(0, c * 0.645); g.clip();
      grain(g, rng, S, '#3a2112', 0.5, 200);
      g.restore();
      // the star
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU - Math.PI / 2;
        const tip = k % 2 ? 0.42 : 0.58;
        for (const side of [-1, 1]) {
          g.beginPath();
          g.moveTo(c + Math.cos(a) * c * tip, c + Math.sin(a) * c * tip);
          g.lineTo(c + Math.cos(a + side * Math.PI / 8) * c * 0.15, c + Math.sin(a + side * Math.PI / 8) * c * 0.15);
          g.lineTo(c, c);
          g.closePath();
          g.fillStyle = side > 0 ? (k % 2 ? '#a77a48' : '#d6a666') : (k % 2 ? '#6b4426' : '#8f5f33');
          g.fill();
        }
      }
      // brass
      const ring = (r, w, col) => {
        g.strokeStyle = col; g.lineWidth = w;
        g.beginPath(); g.arc(c, c, r, 0, TAU); g.stroke();
      };
      ring(c * 0.948, S * 0.009, '#d0a752');
      ring(c * 0.652, S * 0.008, '#d0a752');
      ring(c * 0.16, S * 0.006, '#d0a752');
      ring(c * 0.62, S * 0.002, 'rgba(20,10,4,0.6)');
      g.fillStyle = '#2b170c';
      g.beginPath(); g.arc(c, c, c * 0.155, 0, TAU); g.fill();
      g.fillStyle = '#d0a752';
      g.beginPath(); g.arc(c, c, c * 0.05, 0, TAU); g.fill();
      // the edge band
      g.save(); clipDisc(c * 0.955, c * 1.01); g.clip();
      grain(g, rng, S, '#2e1a0e', 0, 80);
      g.restore();
    }, { clampS: true, repeatT: false });
  }

  /* ---------------- the view ----------------
     A painted panorama on the inside of a great cylinder round the
     house: sky, cloud, three ranges of hills going blue with distance,
     a loch, a wooded shore and the lawn. Everything that crosses the
     seam uses whole-number frequencies, so it wraps without a join.

     World height maps to rows linearly: the canvas spans `Y_BOT` to
     `Y_TOP` on a cylinder of radius `RADIUS`. */
  const RADIUS = 120, Y_TOP = 64, Y_BOT = -14;
  const SKIES = {
    golden: {
      top: '#35578f', mid: '#b48e86', low: '#f2c88f', sunU: 0.75, sunY: 9, sun: '#fff1c8', glow: 'rgba(255,214,150,',
      cloud: '#f7dcbc', cloudShade: '#8b7480', far: '#8a7f98', mid2: '#5f6567', near: '#4b5636', shore: '#27331f',
      water: '#d7ab80', deep: '#4b5a6c', lawn: '#4f6b33', lawnFar: '#64813f', light: '#ffd29c', lightI: 1.8, hemi: 3.2,
    },
    morning: {
      top: '#4b84c9', mid: '#9ec0df', low: '#e9f0f0', sunU: 0.25, sunY: 24, sun: '#ffffff', glow: 'rgba(255,250,235,',
      cloud: '#ffffff', cloudShade: '#a9b6c6', far: '#8b9db2', mid2: '#677c6c', near: '#4b6739', shore: '#2c4225',
      water: '#a7c0d4', deep: '#3d5a6e', lawn: '#5a873a', lawnFar: '#73a04a', light: '#fff4e2', lightI: 2.2, hemi: 3.6,
    },
    night: {
      top: '#04070f', mid: '#0d1a33', low: '#22345a', sunU: 0.6, sunY: 34, sun: '#eef1ff', glow: 'rgba(170,190,255,',
      cloud: '#34425f', cloudShade: '#0f1626', far: '#253049', mid2: '#1a2336', near: '#121a20', shore: '#090e12',
      water: '#2b3e62', deep: '#0a1322', lawn: '#0f170f', lawnFar: '#152015', light: '#9fb4ff', lightI: 0.6, hemi: 2.0,
      moon: true, stars: true,
    },
  };
  const skyFor = (hour) => SKIES[hour === 'night' ? 'night' : hour === 'morning' ? 'morning' : 'golden'];

  function panorama(hour) {
    const P = skyFor(hour);
    const key = hour === 'night' ? 'night' : hour === 'morning' ? 'morning' : 'golden';
    const W = low() ? 2048 : 6144, H = low() ? 256 : 768;
    return canvasTexture('panorama-' + key, W, H, (g) => {
      const rng = U.makeRng(key === 'night' ? 91 : key === 'morning' ? 37 : 53);
      const Y = (y) => (Y_TOP - y) / (Y_TOP - Y_BOT) * H;
      const wrap = (fn) => { fn(0); fn(-W); fn(W); };

      // sky
      const sky = g.createLinearGradient(0, 0, 0, Y(0));
      sky.addColorStop(0, P.top);
      sky.addColorStop(0.55, P.mid);
      sky.addColorStop(1, P.low);
      g.fillStyle = sky; g.fillRect(0, 0, W, Y(-2));

      if (P.stars) {
        for (let i = 0; i < 900; i++) {
          const x = rng() * W, y = rng() * Y(8);
          g.fillStyle = 'rgba(255,255,255,' + (0.25 + rng() * 0.7) + ')';
          g.fillRect(x, y, rng() < 0.08 ? 2 : 1, rng() < 0.08 ? 2 : 1);
        }
      }
      // sun or moon, and the glow round it
      const sx = P.sunU * W, sy = Y(P.sunY);
      wrap((o) => {
        const gl = g.createRadialGradient(sx + o, sy, 0, sx + o, sy, H * 0.9);
        gl.addColorStop(0, P.glow + '0.75)');
        gl.addColorStop(0.25, P.glow + '0.25)');
        gl.addColorStop(1, P.glow + '0)');
        g.fillStyle = gl; g.fillRect(sx + o - H, 0, H * 2, Y(-2));
      });
      g.fillStyle = P.sun;
      g.beginPath(); g.arc(sx, sy, H * (P.moon ? 0.028 : 0.035), 0, TAU); g.fill();

      // cloud
      for (let i = 0; i < (low() ? 26 : 44); i++) {
        const cx = rng() * W, cy = Y(14 + rng() * 40);
        const w = W * (0.025 + rng() * 0.06), h = H * (0.018 + rng() * 0.035);
        // the puffs are drawn once each side of the seam, identically
        const puffs = [];
        for (let j = 0; j < 5; j++) {
          puffs.push([(rng() - 0.5) * w, (rng() - 0.5) * h * 0.8, w * (0.25 + rng() * 0.3), 0.32 + rng() * 0.2]);
        }
        wrap((o) => {
          for (const [dx, dy, rr, alpha] of puffs) {
            const px = cx + o + dx, py = cy + dy;
            const grd = g.createRadialGradient(px, py - h * 0.2, 0, px, py, rr);
            grd.addColorStop(0, mix(P.cloud, P.mid, 0.1));
            grd.addColorStop(0.6, mix(P.cloudShade, P.mid, 0.3));
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            g.globalAlpha = alpha;
            g.fillStyle = grd;
            g.save(); g.translate(px, py); g.scale(1, h / rr); g.translate(-px, -py);
            g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
            g.restore();
          }
        });
      }
      g.globalAlpha = 1;

      // the hills
      const ridge = (seed, base, amp, rough, sharp) => {
        const r = U.makeRng(seed);
        const terms = [1, 2, 3, 4, 5, 7, 9, 12, 16, 21, 29, 37, 50].map(k => ({
          k, a: Math.pow(k, -rough) * (0.5 + r()), p: r() * TAU }));
        const norm = terms.reduce((n, t) => n + t.a, 0);
        return (u) => {
          let s = 0;
          for (const t of terms) s += t.a * Math.sin(TAU * t.k * u + t.p);
          const v = U.clamp(0.5 + 1.5 * s / norm, 0, 1);
          return base + amp * Math.pow(v, sharp);
        };
      };
      const LOCH = 1.2;
      const layer = (fn, top, bottom, peak, strokes, snow, heather, forest) => {
        g.beginPath();
        g.moveTo(0, Y(LOCH - 0.5));
        for (let px = 0; px <= W; px += 3) g.lineTo(px, Y(fn(px / W)));
        g.lineTo(W, Y(LOCH - 0.5));
        g.closePath();
        const grd = g.createLinearGradient(0, Y(peak), 0, Y(LOCH));
        grd.addColorStop(0, top); grd.addColorStop(1, bottom);
        g.fillStyle = grd; g.fill();
        g.save(); g.clip();
        // light on one flank and heather on the slopes
        for (let i = 0; i < strokes; i++) {
          const x = rng() * W, h = fn(x / W);
          const y = Y(LOCH + rng() * (h - LOCH));
          const light = rng() < 0.45;
          g.strokeStyle = light ? 'rgba(255,235,200,0.07)' : (rng() < 0.5 ? 'rgba(20,10,25,0.09)' : 'rgba(110,70,90,0.08)');
          g.lineWidth = 1 + rng() * 2.5;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.3) * 30, y + 6 + rng() * 14); g.stroke();
        }
        // the flanks: lit where they face the sun, in shadow where they turn away
        for (let px = 0; px < W; px += 2) {
          const u = px / W, h = fn(u), slope = (fn(u + 0.0015) - fn(u - 0.0015)) / 0.003;
          let toSun = sx - px; if (toSun > W / 2) toSun -= W; if (toSun < -W / 2) toSun += W;
          const lit = -slope * Math.sign(toSun) / (peak - LOCH) * 0.06;
          if (Math.abs(lit) < 0.01) continue;
          g.fillStyle = lit > 0 ? 'rgba(255,232,190,' + Math.min(0.2, lit) + ')' : 'rgba(15,12,35,' + Math.min(0.26, -lit) + ')';
          g.fillRect(px, Y(h), 2, (h - LOCH) * H / (Y_TOP - Y_BOT) * 0.85);
        }
        if (heather) {
          for (let i = 0; i < (low() ? 160 : 520); i++) {
            const x = rng() * W, h = fn(x / W), y = Y(LOCH + rng() * (h - LOCH) * 0.8);
            g.fillStyle = rng() < 0.6 ? 'rgba(110,60,95,0.14)' : 'rgba(150,120,60,0.12)';
            g.beginPath(); g.ellipse(x, y, 10 + rng() * 40, 2 + rng() * 6, 0, 0, TAU); g.fill();
          }
        }
        if (forest) {
          // belts of pine on the lower slopes, in clumps
          for (let c = 0; c < (low() ? 20 : 46); c++) {
            const x0 = rng() * W, span = 30 + rng() * 160;
            for (let x = x0; x < x0 + span; x += 1.5 + rng() * 2.5) {
              const px = x % W, h = fn(px / W);
              const base = LOCH + (h - LOCH) * (0.05 + rng() * 0.4);
              const th = (0.5 + rng() * 0.9) * H / 300, tw = th * 0.35;
              g.fillStyle = forest;
              g.beginPath();
              g.moveTo(px - tw, Y(base)); g.lineTo(px, Y(base) - th * 3); g.lineTo(px + tw, Y(base)); g.closePath();
              g.fill();
            }
          }
        }
        if (snow) {
          g.fillStyle = snow;
          for (let px = 0; px <= W; px += 2) {
            const h = fn(px / W);
            if (h > peak * 0.82) g.fillRect(px, Y(h), 2, (h - peak * 0.82) / (Y_TOP - Y_BOT) * H * 0.6);
          }
        }
        g.restore();
      };
      const haze = (c, t) => mix(c, P.low, t);
      const far = ridge(11, LOCH, 30, 0.85, 1.6);
      layer(far, haze(P.far, 0.25), haze(P.far, 0.6), LOCH + 30, low() ? 600 : 1400,
            P.moon ? 'rgba(200,210,235,0.35)' : 'rgba(250,248,240,0.75)');
      const midR = ridge(23, LOCH, 17, 1.0, 1.3);
      layer(midR, haze(P.mid2, 0.12), haze(P.mid2, 0.4), LOCH + 17, low() ? 700 : 2400, null, true,
            mix(haze(P.mid2, 0.3), '#000000', 0.25));
      const nearR = ridge(37, LOCH, 7, 1.1, 1.1);
      layer(nearR, haze(P.near, 0.05), haze(P.near, 0.22), LOCH + 7, low() ? 600 : 2200, null, true,
            mix(P.near, '#000000', 0.35));
      // mist lying along the far shore
      const mist = g.createLinearGradient(0, Y(LOCH + 3), 0, Y(LOCH));
      mist.addColorStop(0, P.glow + '0)'); mist.addColorStop(1, P.glow + (P.moon ? '0.12)' : '0.28)'));
      g.fillStyle = mist; g.fillRect(0, Y(LOCH + 3), W, Y(LOCH) - Y(LOCH + 3));
      // a wooded far shore along the water
      const shore = ridge(51, LOCH, 1.6, 0.4, 1);
      g.fillStyle = P.shore;
      g.beginPath(); g.moveTo(0, Y(LOCH - 0.2));
      for (let px = 0; px <= W; px += 3) g.lineTo(px, Y(shore(px / W)));
      g.lineTo(W, Y(LOCH - 0.2)); g.closePath(); g.fill();
      for (let px = 0; px < W; px += 2 + rng() * 5) {
        const h = shore(px / W) + 0.2 + rng() * 1.6, w = 2 + rng() * 4;
        g.beginPath();
        g.moveTo(px - w, Y(LOCH)); g.lineTo(px, Y(h)); g.lineTo(px + w, Y(LOCH)); g.closePath();
        g.fill();
      }

      // a croft or two, whitewashed, on the far shore
      for (let i = 0; i < 4; i++) {
        const x = rng() * W, y = Y(LOCH + 0.25), w = H * 0.012, h = H * 0.006;
        g.fillStyle = P.moon ? '#4a5168' : mix('#f2eee2', P.low, 0.3);
        g.fillRect(x, y - h, w, h);
        g.fillStyle = P.moon ? '#141a26' : '#3a3634';
        g.beginPath(); g.moveTo(x - w * 0.1, y - h); g.lineTo(x + w / 2, y - h * 1.9); g.lineTo(x + w * 1.1, y - h); g.fill();
        if (P.moon) { g.fillStyle = '#ffd27a'; g.fillRect(x + w * 0.3, y - h * 0.7, Math.max(1, w * 0.12), Math.max(1, h * 0.3)); }
      }

      // the loch, and the hills upside down in it
      const top = Y(LOCH), bot = Y(-7);
      const wat = g.createLinearGradient(0, top, 0, bot);
      wat.addColorStop(0, mix(P.water, P.low, 0.25)); wat.addColorStop(1, P.deep);
      g.fillStyle = wat; g.fillRect(0, top, W, bot - top);
      if (g.canvas && g.canvas.width === W) {
        const band = Math.round(top - Y(LOCH + 30));
        const tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = band;
        tmp.getContext('2d').drawImage(g.canvas, 0, top - band, W, band, 0, 0, W, band);
        g.save();
        g.beginPath(); g.rect(0, top, W, bot - top); g.clip();
        g.globalAlpha = P.moon ? 0.3 : 0.42;
        g.setTransform(1, 0, 0, -1, 0, 2 * top);
        g.drawImage(tmp, 0, top - band);
        g.restore();
        const fade = g.createLinearGradient(0, top, 0, bot);
        fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, P.deep);
        g.fillStyle = fade; g.fillRect(0, top, W, bot - top);
      }
      for (let i = 0; i < (low() ? 400 : 900); i++) {
        const y = top + Math.pow(rng(), 1.6) * (bot - top);
        g.fillStyle = rng() < 0.6 ? 'rgba(255,240,215,0.10)' : 'rgba(0,0,0,0.10)';
        g.fillRect(rng() * W, y, 8 + rng() * 40, 1);
      }
      // the sun (or moon) on the water
      for (let i = 0; i < 160; i++) {
        const y = top + rng() * (bot - top);
        const spread = 6 + (y - top) * 0.9;
        g.fillStyle = P.glow + (0.18 + rng() * 0.3) + ')';
        g.fillRect(sx + (rng() - 0.5) * spread * 2, y, 4 + rng() * 18, 1.5);
      }

      // our own shore: a lawn, and a few trees standing in it
      const lawn = g.createLinearGradient(0, bot, 0, H);
      lawn.addColorStop(0, P.lawnFar); lawn.addColorStop(1, P.lawn);
      g.fillStyle = lawn; g.fillRect(0, bot, W, H - bot);
      g.fillStyle = mix(P.shore, P.lawn, 0.25);
      for (let i = 0; i < 18; i++) {
        const x = rng() * W, base = Y(-7.5 - rng() * 2), h = H * (0.06 + rng() * 0.08), w = h * 0.32;
        wrap((o) => {
          g.beginPath();
          g.moveTo(x + o - w, base); g.lineTo(x + o, base - h); g.lineTo(x + o + w, base); g.closePath();
          g.fill();
        });
      }
    }, { repeatT: false });
  }

  /* The view: the painted cylinder, a dome of sky over it, and the
     ground the house stands in — a striped lawn down to a pebble shore
     where the painted loch begins, long grass and wild flowers thick
     along the walls and the water's edge, a few trees, the gravel drive
     from the front door. In castle coordinates round `cx, cz`. Unlit
     and unfogged: it is the light, not lit by it, so every colour in
     it is the hour's own. */
  /* The house's footprint round the view's centre, on a grid, as the
     distance of each cell from the nearest wall in cells (255: far).
     The plan never changes, so it is worked out once. */
  const footprints = new Map();
  function footprint(cx, cz, GX0, GZ0, GC, GN) {
    const key = cx + ',' + cz;
    if (footprints.has(key)) return footprints.get(key);
    const L = CastleLayout;
    const dist = new Uint8Array(GN * GN).fill(255);
    const queue = [];
    for (let k = 0; k < GN; k++) for (let i = 0; i < GN; i++) {
      const x = GX0 + (i + 0.5) * GC, z = GZ0 + (k + 0.5) * GC;
      if (Math.hypot(x - cx, z - cz) > 56) continue;
      let inside = !!L.roomAt(x, z);
      if (!inside) for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) if (L.roomAt(x + dx, z + dz)) { inside = true; break; }
      if (inside) { dist[i + k * GN] = 0; queue.push(i + k * GN); }
    }
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q], i = c % GN, k = (c - i) / GN, d = dist[c];
      if (d >= 12) continue;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nk = k + dk;
        if (ni < 0 || nk < 0 || ni >= GN || nk >= GN) continue;
        const n = ni + nk * GN;
        if (dist[n] > d + 1) { dist[n] = d + 1; queue.push(n); }
      }
    }
    footprints.set(key, dist);
    return dist;
  }

  /* `lawn`, `rough`, `shore`, `gravel` and `trunk` are colours; the
     grass and the trees are painted green already, so `light` is only
     the hour's light on them. */
  const TINTS = {
    golden:  { lawn: '#7f9d48', rough: '#8f9548', shore: '#9a8a6a', gravel: '#c9b48e', light: '#ffe9c4', trunk: '#8a7560' },
    morning: { lawn: '#77a64a', rough: '#86a050', shore: '#a29a86', gravel: '#cfc6b2', light: '#f4f8ff', trunk: '#80705e' },
    night:   { lawn: '#18261a', rough: '#1b261a', shore: '#1e2228', gravel: '#2c3038', light: '#26324c', trunk: '#1a1a1c' },
  };
  function view(hour, cx, cz) {
    const P = skyFor(hour);
    const key = hour === 'night' ? 'night' : hour === 'morning' ? 'morning' : 'golden';
    const Tn = TINTS[key];
    const g = new THREE.Group();
    g.name = 'castle-view';
    const H = Y_TOP - Y_BOT;
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(RADIUS, RADIUS, H, low() ? 48 : 128, 1, true),
      new THREE.MeshBasicMaterial({ map: panorama(hour), side: THREE.BackSide, fog: false }));
    cyl.position.set(cx, Y_BOT + H / 2, cz);
    cyl.name = 'panorama';
    g.add(cyl);
    // the sky over it, deepening to the zenith
    const dome = new THREE.Mesh(new THREE.SphereGeometry(RADIUS - 0.5, 48, 12, 0, TAU, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: CastleSurfaces.sky(key, P), side: THREE.BackSide, fog: false }));
    dome.scale.y = 0.4;
    dome.position.set(cx, Y_TOP - 0.02, cz);
    dome.name = 'sky';
    g.add(dome);

    /* Where the house is, on a half-metre grid, and how far each cell
       is from it in cells: grass grows up to the walls, never in them. */
    const L = CastleLayout, GX0 = cx - 66, GZ0 = cz - 66, GC = 0.5, GN = Math.ceil(132 / GC);
    const dist = footprint(cx, cz, GX0, GZ0, GC, GN);
    const wallDist = (x, z) => {
      const i = Math.floor((x - GX0) / GC), k = Math.floor((z - GZ0) / GC);
      if (i < 0 || k < 0 || i >= GN || k >= GN) return 99;
      const d = dist[i + k * GN];
      return d === 255 ? 99 : d * GC;
    };
    // the shore wanders in and out a little
    const rim = (a) => 60 + 3 * Math.sin(3 * a + 1) + 2 * Math.sin(7 * a + 2) + Math.sin(13 * a);
    const patch = (x, z) => 0.5 + 0.25 * (Math.sin(x * 0.13 + 1.7) * Math.sin(z * 0.11 - 0.4) + Math.sin(x * 0.041 - z * 0.057 + 2));

    /* The lawn: rings out to the shore, mown in stripes, rougher and
       yellower toward the water, darker in the lee of the walls. */
    const SEG = low() ? 96 : 192, RINGS = low() ? 28 : 56;
    const pos = [], col = [], uv = [], idx = [];
    const lawnC = new THREE.Color(Tn.lawn), roughC = new THREE.Color(Tn.rough), c3 = new THREE.Color();
    for (let r = 0; r <= RINGS; r++) {
      const f = Math.pow(r / RINGS, 0.8);
      for (let sgm = 0; sgm <= SEG; sgm++) {
        const a = sgm / SEG * TAU, R = f * rim(a);
        const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
        pos.push(x, -0.04, z); uv.push(x / 2.6, z / 2.6);
        const edge = U.smoothstep(rim(a) - 9, rim(a) - 1, R);
        const stripe = (Math.floor((x + 200) / 3.2) % 2) ? 1.0 : 0.86;
        c3.copy(lawnC).multiplyScalar(stripe * (1 - edge) + edge).lerp(roughC, edge);
        c3.multiplyScalar(0.88 + 0.24 * patch(x, z));
        const wd = wallDist(x, z);
        if (wd < 4) c3.multiplyScalar(0.72 + 0.28 * wd / 4);
        col.push(c3.r, c3.g, c3.b);
      }
    }
    for (let r = 0; r < RINGS; r++) for (let sgm = 0; sgm < SEG; sgm++) {
      const a = r * (SEG + 1) + sgm, b = a + SEG + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const lawnGeo = new THREE.BufferGeometry();
    lawnGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lawnGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    lawnGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    lawnGeo.setIndex(idx);
    // the vertex colours are the hour's; the tile multiplies about 0.55 off them
    const lawn = new THREE.Mesh(lawnGeo, new THREE.MeshBasicMaterial({
      map: CastleSurfaces.lawn(), vertexColors: true, color: new THREE.Color(1.75, 1.75, 1.75), fog: false, side: THREE.DoubleSide }));
    lawn.name = 'lawn';
    g.add(lawn);

    // a pebble shore, two or three metres wide, where the loch begins
    const sp = [], su = [], si = [];
    for (let sgm = 0; sgm <= SEG; sgm++) {
      const a = sgm / SEG * TAU, R = rim(a);
      for (const [rr, y] of [[R - 0.6, -0.065], [R + 2.6 + Math.sin(a * 5) * 0.6, -0.12]]) {
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        sp.push(x, y, z); su.push(x / 1.6, z / 1.6);
      }
    }
    for (let sgm = 0; sgm < SEG; sgm++) { const a = sgm * 2; si.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
    const shoreGeo = new THREE.BufferGeometry();
    shoreGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    shoreGeo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    shoreGeo.setIndex(si);
    g.add(new THREE.Mesh(shoreGeo, new THREE.MeshBasicMaterial({ map: CastleSurfaces.gravel(), color: Tn.shore, fog: false, side: THREE.DoubleSide })));

    // the drive, from the great door down to the water
    const hall = L.byId('hall');
    if (hall) {
      const z0 = hall.z1 + 0.26, z1 = cz + rim(Math.PI / 2) - 1.5, w = 4.6;
      const drive = new THREE.PlaneGeometry(w, z1 - z0).rotateX(-Math.PI / 2).translate(0, -0.02, (z0 + z1) / 2);
      const du = drive.attributes.uv;
      for (let i = 0; i < du.count; i++) du.setXY(i, du.getX(i) * w / 1.4, du.getY(i) * (z1 - z0) / 1.4);
      g.add(new THREE.Mesh(drive, new THREE.MeshBasicMaterial({ map: CastleSurfaces.gravel(), color: Tn.gravel, fog: false })));
    }

    /* Long grass: tufts, one draw for thousands, thick along the walls
       and the water's edge and sparse on the mown lawn. */
    const rng = U.makeRng(key === 'night' ? 7 : 11);
    const tuftGeo = CastleSurfaces.cross(0.8, 0.42, 3);
    const tint = new THREE.Color(Tn.light).multiplyScalar(1.5);
    const spots = (want, keep) => {
      const out = [];
      for (let tries = 0; out.length < want && tries < want * 30; tries++) {
        const a = rng() * TAU, R = Math.sqrt(rng()) * (rim(a) - 0.4);
        const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
        const wd = wallDist(x, z);
        if (wd < 0.4) continue;
        if (Math.abs(x) < 2.6 && z > (hall ? hall.z1 : 18)) continue;   // the drive
        if (rng() > keep(wd, rim(a) - R)) continue;
        out.push([x, z]);
      }
      return out;
    };
    const instance = (geo, map, n, keep, scale) => {
      const at = spots(n, keep);
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map, color: tint, alphaTest: 0.4,
        side: THREE.DoubleSide, fog: false }), at.length);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      at.forEach(([x, z], i) => {
        const s = scale[0] + rng() * (scale[1] - scale[0]);
        q.setFromEuler(e.set((rng() - 0.5) * 0.15, rng() * TAU, (rng() - 0.5) * 0.15));
        M.compose(v.set(x, -0.05, z), q, sc.set(s, s * (0.8 + rng() * 0.5), s));
        m.setMatrixAt(i, M);
        m.setColorAt(i, c3.setRGB(0.8 + rng() * 0.35, 0.85 + rng() * 0.3, 0.75 + rng() * 0.3));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.frustumCulled = false;
      g.add(m);
      return m;
    };
    const grassKeep = (wd, shore) => (wd < 1.6 ? 1 : shore < 7 ? 0.9 : 0.12);
    instance(tuftGeo, CastleSurfaces.plant('tuft'), low() ? 2200 : 7500, grassKeep, [0.8, 1.6]);
    instance(tuftGeo, CastleSurfaces.plant('tuftFlowers'), low() ? 300 : 1300,
             (wd, shore) => (wd < 2.2 ? 0.8 : shore < 9 ? 0.6 : 0.05), [0.8, 1.3]);

    /* Trees, built of cards: an oak or a beech where the lawn is wide
       enough, and Scots pines along the shore. */
    const cards = [], needles = [], trunks = [];
    const cardAt = (list, x, y, z, w, h, yaw, tilt) => {
      list.push(new THREE.PlaneGeometry(w, h).rotateX(tilt).rotateY(yaw).translate(x, y, z));
    };
    const tree = (x, z, pine) => {
      const h = pine ? 10 + rng() * 4 : 7 + rng() * 3;
      const trunk = new THREE.CylinderGeometry(pine ? 0.16 : 0.22, pine ? 0.3 : 0.42, h * (pine ? 0.92 : 0.6), 8).translate(x, h * (pine ? 0.46 : 0.3), z);
      const tu = trunk.attributes.uv;
      for (let i = 0; i < tu.count; i++) tu.setXY(i, tu.getX(i) * 2, tu.getY(i) * h / 2.2);
      trunks.push(trunk);
      const n = pine ? 9 : 14;
      for (let k = 0; k < n; k++) {
        if (pine) {
          const y = h * (0.62 + 0.38 * k / n), r = (1.4 + rng() * 1.2) * (1 - 0.4 * k / n);
          cardAt(needles, x + (rng() - 0.5) * 0.6, y, z + (rng() - 0.5) * 0.6, r * 2.2, r * 1.1, rng() * Math.PI, -Math.PI / 2 + (rng() - 0.5) * 0.5);
          cardAt(needles, x, y + 0.2, z, r * 2, r, rng() * Math.PI, (rng() - 0.5) * 0.4);
        } else {
          const a = rng() * TAU, r = rng() * 2.6, y = h * (0.55 + rng() * 0.4);
          const s = 2.6 + rng() * 1.6;
          for (const yaw of [0, Math.PI / 2]) cardAt(cards, x + Math.cos(a) * r, y, z + Math.sin(a) * r * 0.9, s, s * 0.9, yaw + a, (rng() - 0.5) * 0.4);
        }
      }
    };
    for (let k = 0, made = 0; k < 400 && made < (low() ? 10 : 22); k++) {
      const a = rng() * TAU, shore = rng() < 0.55;
      const R = shore ? rim(a) - 2 - rng() * 4 : 36 + rng() * (rim(a) - 46);
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      if (wallDist(x, z) < 6 || (Math.abs(x) < 6 && z > 18)) continue;
      tree(x, z, shore);
      made++;
    }
    const light = new THREE.Color(Tn.light).multiplyScalar(1.6);
    for (const [list, kind] of [[cards, 'canopy'], [needles, 'pine']]) {
      if (!list.length) continue;
      const leaves = EstateMaterials.merge(list);
      list.forEach(c => c.dispose());
      g.add(new THREE.Mesh(leaves, new THREE.MeshBasicMaterial({ map: CastleSurfaces.plant(kind), color: light,
        alphaTest: 0.45, side: THREE.DoubleSide, fog: false })));
    }
    if (trunks.length) {
      const bark = EstateMaterials.merge(trunks);
      trunks.forEach(c => c.dispose());
      g.add(new THREE.Mesh(bark, new THREE.MeshBasicMaterial({ map: CastleSurfaces.bark(), color: Tn.trunk, fog: false })));
    }

    g.userData.sun = new THREE.Vector3(Math.sin(P.sunU * TAU), 0.55, Math.cos(P.sunU * TAU)).normalize();
    return g;
  }

  /* ---------------- portraits ----------------
     An atlas of eight canvases, four across and two down: six sitters
     in the dark of an old varnish, and two views of the glen. */
  function portraits() {
    const T = low() ? 128 : 256;
    return canvasTexture('portraits', T * 4, T * 2, (g) => {
      const rng = U.makeRng(808);
      const coats = ['#1b2433', '#4a1a1c', '#1e3326', '#2b2b2b', '#4b3a20', '#2f2036'];
      const hairs = ['#3a2516', '#1a1410', '#8a8580', '#5a3a1e', '#2a1c12', '#bfb7aa'];
      for (let i = 0; i < 8; i++) {
        const x0 = (i % 4) * T, y0 = Math.floor(i / 4) * T;
        g.save();
        g.beginPath(); g.rect(x0, y0, T, T); g.clip();
        if (i < 6) {
          const bg = g.createRadialGradient(x0 + T * 0.45, y0 + T * 0.35, 0, x0 + T / 2, y0 + T / 2, T * 0.8);
          bg.addColorStop(0, ['#5d4a2c', '#4a3f2a', '#3d3a2c'][i % 3]); bg.addColorStop(1, '#130e09');
          g.fillStyle = bg; g.fillRect(x0, y0, T, T);
          const cx = x0 + T * (0.47 + (rng() - 0.5) * 0.06), fy = y0 + T * 0.36;
          // shoulders and coat
          g.fillStyle = coats[i];
          g.beginPath(); g.ellipse(cx, y0 + T * 1.02, T * 0.42, T * 0.38, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.beginPath(); g.ellipse(cx - T * 0.14, y0 + T * 0.86, T * 0.12, T * 0.2, 0.3, 0, TAU); g.fill();
          // collar
          g.fillStyle = i % 2 ? '#e8e0cc' : '#c9b78f';
          g.beginPath(); g.moveTo(cx - T * 0.09, y0 + T * 0.6); g.lineTo(cx, y0 + T * 0.74);
          g.lineTo(cx + T * 0.09, y0 + T * 0.6); g.closePath(); g.fill();
          // neck and face
          const skin = ['#d8ae8a', '#c99a76', '#e2bf9f', '#b88763', '#d6a986', '#e6c4a6'][i];
          g.fillStyle = mix(skin, '#000000', 0.25);
          g.fillRect(cx - T * 0.05, fy + T * 0.12, T * 0.1, T * 0.14);
          const face = g.createRadialGradient(cx - T * 0.03, fy - T * 0.03, 0, cx, fy, T * 0.15);
          face.addColorStop(0, skin); face.addColorStop(1, mix(skin, '#2a1408', 0.45));
          g.fillStyle = face;
          g.beginPath(); g.ellipse(cx, fy, T * 0.1, T * 0.135, 0, 0, TAU); g.fill();
          // hair
          g.fillStyle = hairs[i];
          g.beginPath(); g.ellipse(cx, fy - T * 0.07, T * 0.115, T * 0.08, 0, Math.PI, TAU); g.fill();
          if (i % 3 === 1) { g.beginPath(); g.ellipse(cx, fy + T * 0.02, T * 0.13, T * 0.17, 0, Math.PI * 0.95, Math.PI * 2.05); g.fill(); }
          // eyes, nose, mouth, barely
          g.fillStyle = 'rgba(30,15,8,0.7)';
          g.fillRect(cx - T * 0.045, fy - T * 0.01, T * 0.022, T * 0.01);
          g.fillRect(cx + T * 0.022, fy - T * 0.01, T * 0.022, T * 0.01);
          g.fillStyle = 'rgba(110,40,30,0.55)';
          g.fillRect(cx - T * 0.025, fy + T * 0.07, T * 0.05, T * 0.008);
        } else {
          // the glen: sky, hills, water, a stag on the near bank
          const sk = g.createLinearGradient(0, y0, 0, y0 + T * 0.55);
          sk.addColorStop(0, i === 6 ? '#6f7f86' : '#8c7a5a'); sk.addColorStop(1, i === 6 ? '#c9b88e' : '#d7b072');
          g.fillStyle = sk; g.fillRect(x0, y0, T, T);
          const hill = (base, amp, col, seed) => {
            const r = U.makeRng(seed);
            const a = [r(), r(), r()];
            g.fillStyle = col; g.beginPath(); g.moveTo(x0, y0 + T);
            for (let x = 0; x <= T; x += 4) {
              const u = x / T;
              g.lineTo(x0 + x, y0 + T * (base - amp * (0.5 + 0.3 * Math.sin(u * 5 + a[0] * 6) + 0.2 * Math.sin(u * 13 + a[1] * 6))));
            }
            g.lineTo(x0 + T, y0 + T); g.closePath(); g.fill();
          };
          hill(0.62, 0.3, '#5c5a5e', i * 3 + 1);
          hill(0.68, 0.18, '#4b4a3a', i * 3 + 2);
          g.fillStyle = '#9aa8a6'; g.fillRect(x0, y0 + T * 0.68, T, T * 0.08);
          hill(0.98, 0.22, '#2f3420', i * 3 + 3);
          g.fillStyle = '#1a140e';
          const sx = x0 + T * 0.62, sy = y0 + T * 0.8;
          g.fillRect(sx, sy, T * 0.12, T * 0.05);
          g.fillRect(sx + T * 0.1, sy - T * 0.06, T * 0.025, T * 0.08);
          for (const lx of [0.005, 0.03, 0.085, 0.105]) g.fillRect(sx + T * lx, sy + T * 0.05, T * 0.012, T * 0.07);
          g.strokeStyle = '#1a140e'; g.lineWidth = Math.max(1, T / 128);
          g.beginPath(); g.moveTo(sx + T * 0.11, sy - T * 0.06); g.lineTo(sx + T * 0.08, sy - T * 0.14);
          g.moveTo(sx + T * 0.12, sy - T * 0.06); g.lineTo(sx + T * 0.16, sy - T * 0.14); g.stroke();
        }
        // varnish and craquelure
        g.fillStyle = 'rgba(150,110,40,0.13)'; g.fillRect(x0, y0, T, T);
        const vg = g.createRadialGradient(x0 + T / 2, y0 + T / 2, T * 0.3, x0 + T / 2, y0 + T / 2, T * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
        g.fillStyle = vg; g.fillRect(x0, y0, T, T);
        g.restore();
      }
    }, { clampS: true, repeatT: false });
  }

  /* Plane UVs onto tile `i` of the portrait atlas. */
  function portraitUV(geometry, i) {
    const uv = geometry.attributes.uv;
    const col = i % 4, row = Math.floor(i / 4);
    const inset = 0.01;
    for (let k = 0; k < uv.count; k++) {
      const u = uv.getX(k), v = uv.getY(k);
      uv.setXY(k, (col + inset + u * (1 - 2 * inset)) / 4, 1 - (row + 1) / 2 + (inset + v * (1 - 2 * inset)) / 2);
    }
    return geometry;
  }

  /* ---------------- turned and carved pieces ---------------- */

  function lathe(profile, seg = 12) {
    return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg);
  }

  /* A turned leg, `h` tall, standing on y = 0. */
  function turnedLeg(h, r = 0.032, seg = 10) {
    return lathe([
      [r * 0.8, 0], [r, h * 0.04], [r * 0.9, h * 0.1], [r * 0.75, h * 0.3], [r * 1.25, h * 0.42],
      [r * 1.3, h * 0.48], [r * 0.85, h * 0.56], [r * 0.95, h * 0.8], [r * 1.15, h * 0.86],
      [r * 1.15, h], [0, h],
    ], seg);
  }

  /* A cylinder from `a` to `b`. */
  function stick(a, b, r0, r1 = r0, seg = 6) {
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r1, r0, d.length(), seg);
    g.translate(0, d.length() / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.applyQuaternion(q);
    g.translate(a.x, a.y, a.z);
    return g;
  }

  function merged(list, uvScale) {
    const parts = list.map(g => {
      const n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      if (uvScale) EstateMaterials.uv(n, uvScale);
      else if (!n.attributes.uv) EstateMaterials.uv(n, 1);
      return n;
    });
    const out = EstateMaterials.merge(parts);
    parts.forEach(p => p.dispose());
    return out;
  }

  /* The high-backed chair: turned front legs, a padded seat, an
     upholstered back between two posts with finials, and a carved crest
     on top. Built facing -z (the table), its back at +z. Returns merged
     geometry per surface, so a ring of eight chairs is three draw calls
     each, sharing one set of buffers. `back` is the height of the top
     rail; a carver at the head of a table gets a taller one. */
  const chairCache = new Map();
  function chair(opts = {}) {
    const back = opts.back || 1.32, arms = !!opts.arms;
    const key = back + ':' + arms;
    if (chairCache.has(key)) return chairCache.get(key);
    const wood = [], cloth = [], brass = [];
    const box = (list, w, h, d, x, y, z) => list.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    // seat frame and cushion
    box(wood, 0.54, 0.07, 0.5, 0, 0.385, 0);
    box(cloth, 0.5, 0.06, 0.46, 0, 0.45, -0.01);
    box(wood, 0.56, 0.035, 0.035, 0, 0.36, -0.25);
    // front legs, turned
    for (const sx of [-1, 1]) {
      const leg = turnedLeg(0.35, 0.03).translate(sx * 0.235, 0, -0.215);
      wood.push(leg);
    }
    // back posts, the full height, with finials
    for (const sx of [-1, 1]) {
      box(wood, 0.055, back + 0.02, 0.055, sx * 0.235, (back + 0.02) / 2, 0.225);
      wood.push(lathe([[0.04, 0], [0.042, 0.02], [0.022, 0.035], [0.045, 0.075], [0.03, 0.11], [0.0, 0.13]], 10)
        .translate(sx * 0.235, back + 0.02, 0.225));
      brass.push(new THREE.SphereGeometry(0.014, 6, 4).translate(sx * 0.235, back + 0.15, 0.225));
    }
    // stretchers
    box(wood, 0.47, 0.03, 0.03, 0, 0.12, -0.215);
    box(wood, 0.47, 0.03, 0.03, 0, 0.12, 0.225);
    for (const sx of [-1, 1]) box(wood, 0.03, 0.03, 0.44, sx * 0.235, 0.16, 0.005);
    // the back: rails, an upholstered panel, brass nails round it
    box(wood, 0.44, 0.06, 0.05, 0, 0.6, 0.225);
    box(wood, 0.5, 0.09, 0.06, 0, back - 0.03, 0.225);
    const ph = back - 0.75;
    box(cloth, 0.4, ph, 0.04, 0, 0.63 + ph / 2 + 0.005, 0.215);
    for (let i = 0; i < 7; i++) {
      const y = 0.66 + i * (ph - 0.06) / 6;
      for (const sx of [-1, 1]) brass.push(new THREE.SphereGeometry(0.009, 5, 3).translate(sx * 0.2, y, 0.192));
    }
    // the crest: a half-round with a scroll each side
    wood.push(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 18, 1, false, Math.PI / 2, Math.PI)
      .rotateX(Math.PI / 2).translate(0, back + 0.015, 0.225));
    for (const sx of [-1, 1]) {
      wood.push(new THREE.TorusGeometry(0.04, 0.014, 5, 10).translate(sx * 0.17, back + 0.05, 0.225));
    }
    brass.push(new THREE.SphereGeometry(0.02, 8, 6).translate(0, back + 0.09, 0.2));
    if (arms) {
      for (const sx of [-1, 1]) {
        box(wood, 0.055, 0.045, 0.48, sx * 0.25, 0.66, 0.0);
        wood.push(turnedLeg(0.24, 0.022).translate(sx * 0.25, 0.42, -0.2));
        box(cloth, 0.06, 0.02, 0.3, sx * 0.25, 0.69, 0.02);
      }
    }
    const out = { wood: merged(wood, 0.6), cloth: merged(cloth, 0.45), brass: merged(brass, 0.3) };
    chairCache.set(key, out);
    return out;
  }

  /* Meshes for one chair from the cached geometry. The geometry is
     shared, so the meshes are marked to leave it alone on dispose. */
  function chairMeshes(mats, opts) {
    const geo = chair(opts);
    const g = new THREE.Group();
    for (const k of ['wood', 'cloth', 'brass']) {
      const m = new THREE.Mesh(geo[k], mats[k]);
      g.add(m);
    }
    return g;
  }

  /* A church candle, with its flame: wax and glow geometry, in place. */
  function pillar(x, y, z, h = 0.3, r = 0.05) {
    return {
      wax: new THREE.CylinderGeometry(r, r * 1.04, h, 12).translate(x, y + h / 2, z),
      wick: new THREE.CylinderGeometry(0.004, 0.004, 0.025, 4).translate(x, y + h + 0.012, z),
      flame: new THREE.ConeGeometry(r * 0.38, r * 1.6, 7).translate(x, y + h + r * 0.95, z),
      core: new THREE.SphereGeometry(r * 0.22, 6, 4).translate(x, y + h + r * 0.5, z),
    };
  }

  return {
    tartan, damask, marquetry, panorama, view, portraits, portraitUV,
    lathe, turnedLeg, stick, merged, chair, chairMeshes, pillar,
    skyFor, SKIES, RADIUS,
  };
})();
