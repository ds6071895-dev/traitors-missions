/* ------------------------------------------------------------------
   castle-surfaces.js — the grain of things.

   `castle-props.js` paints the cloths and pictures; this paints what
   everything else is made of, so nothing in the house is a flat colour:
   trowelled plaster, crushed velvet, a linen weave, the pebbled grain
   of leather, brushed and tarnished metal, hammered iron, glazed china
   with its crazing, guttered wax, foxed parchment, thrown terracotta,
   gilt-tooled book spines. Each is a tile, a colour map and a bump map,
   painted once per page from periodic noise so it repeats without a
   seam. A tinted surface is a near-white texture the material's own
   colour shows through; a baked one carries its colours itself.

   Then the living things — palm fronds, ferns, broad leaves, ivy and
   geraniums for the conservatory, painted with their outlines in the
   alpha so a single quad is a whole leaf — and the outdoors: the lawn,
   tufts of long grass, the leaf and needle cards trees are built from,
   bark, gravel and the dome of the sky.

   Like the props, every texture is cached for the page and marked
   shared, so `Engine.disposeObject` leaves it alone.
------------------------------------------------------------------ */
const CastleSurfaces = (() => {

  const TAU = Math.PI * 2;
  const low = () => GameState.data.settings.quality === 'low';
  const cache = new Map();
  const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function texture(c, opts = {}) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.wrapT = opts.clamp || opts.clampT ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.anisotropy = low() ? 2 : 8;
    t.userData.estateShared = true;
    return t;
  }
  function once(key, make) {
    const k = key + (low() ? '-low' : '');
    if (!cache.has(k)) cache.set(k, make());
    return cache.get(k);
  }
  const size = (S) => (low() ? S >> 1 : S);

  /* ---------------- noise that tiles ----------------
     Octaves of value noise on a lattice that wraps: `[across, down,
     weight]` each, whole numbers, so the tile meets itself. Unequal
     counts stretch it: few across and many down is a horizontal grain. */
  const fieldMemo = new Map();
  function field(W, H, seed, octs) {
    const key = W + 'x' + H + ':' + seed + ':' + octs.join('|');
    if (fieldMemo.has(key)) return fieldMemo.get(key);
    const keep = W * H <= 256 * 256;
    const rng = U.makeRng(seed);
    const out = new Float32Array(W * H);
    let total = 0;
    for (const [cx, cy, amp] of octs) {
      const lat = new Float32Array(cx * cy);
      for (let i = 0; i < lat.length; i++) lat[i] = rng();
      for (let y = 0; y < H; y++) {
        const fy = y / H * cy, y0 = Math.floor(fy), ty0 = fy - y0, ty = ty0 * ty0 * (3 - 2 * ty0), y1 = (y0 + 1) % cy;
        for (let x = 0; x < W; x++) {
          const fx = x / W * cx, x0 = Math.floor(fx), tx0 = fx - x0, tx = tx0 * tx0 * (3 - 2 * tx0), x1 = (x0 + 1) % cx;
          const a = lat[x0 + y0 * cx], b = lat[x1 + y0 * cx], c = lat[x0 + y1 * cx], d = lat[x1 + y1 * cx];
          const top = a + (b - a) * tx, bot = c + (d - c) * tx;
          out[x + y * W] += amp * (top + (bot - top) * ty);
        }
      }
      total += amp;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    if (keep) fieldMemo.set(key, out);
    return out;
  }

  /* Cells: the distance to the nearest and next-nearest of `n` by `n`
     jittered points, wrapping, in cell widths. The pebbling of leather,
     the dents of hammered iron, the stones of gravel. */
  const cellMemo = new Map();
  function cells(S, n, seed) {
    const key = S + ':' + n + ':' + seed;
    if (cellMemo.has(key)) return cellMemo.get(key);
    const rng = U.makeRng(seed);
    const pts = new Float32Array(n * n * 2);
    for (let i = 0; i < n * n; i++) { pts[i * 2] = rng(); pts[i * 2 + 1] = rng(); }
    const f1 = new Float32Array(S * S), f2 = new Float32Array(S * S), id = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const gx = x / S * n, gy = y / S * n, cx = Math.floor(gx), cy = Math.floor(gy);
        let d1 = 9, d2 = 9, who = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const ix = (cx + dx + n) % n, iy = (cy + dy + n) % n, k = ix + iy * n;
          const px = cx + dx + pts[k * 2], py = cy + dy + pts[k * 2 + 1];
          const ex = px - gx, ey = py - gy, d = Math.sqrt(ex * ex + ey * ey);
          if (d < d1) { d2 = d1; d1 = d; who = k; } else if (d < d2) d2 = d;
        }
        const o = x + y * S;
        f1[o] = d1; f2[o] = d2; id[o] = (who * 0.618034) % 1;
      }
    }
    const out = { f1, f2, id };
    if (S <= 256) cellMemo.set(key, out);
    return out;
  }

  /* A map and a bump from a function of the pixel: `fn(out, x, y, i)`
     writes r, g, b and a height into `out`, all 0..1. */
  function paint(S, fn) {
    const map = canvas(S, S), bump = canvas(S, S);
    const gm = map.getContext('2d'), gb = bump.getContext('2d');
    const im = gm.getImageData(0, 0, S, S), ib = gb.getImageData(0, 0, S, S);
    const out = [1, 1, 1, 0.5];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = x + y * S;
        fn(out, x, y, i);
        const o = i * 4;
        im.data[o] = c01(out[0]) * 255; im.data[o + 1] = c01(out[1]) * 255; im.data[o + 2] = c01(out[2]) * 255; im.data[o + 3] = 255;
        const h = c01(out[3]) * 255;
        ib.data[o] = h; ib.data[o + 1] = h; ib.data[o + 2] = h; ib.data[o + 3] = 255;
      }
    }
    gm.putImageData(im, 0, 0);
    gb.putImageData(ib, 0, 0);
    return { map, bump, gm, gb, S };
  }
  const grey = (out, v, h) => { out[0] = out[1] = out[2] = v; out[3] = h; };
  const hex = (c) => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };
  // sRGB components of a colour, for painting; `t` lerps a to b
  const rgb = (c) => { const k = new THREE.Color(c); return [Math.pow(k.r, 1 / 2.2), Math.pow(k.g, 1 / 2.2), Math.pow(k.b, 1 / 2.2)]; };
  const lerp3 = (out, a, b, t) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; };
  void hex;

  /* Wrap-safe strokes: draw `fn(dx, dy)` at each offset that might show. */
  const wrapped = (S, x, y, r, fn) => {
    for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) {
      if (x + dx < -r || x + dx > S + r || y + dy < -r || y + dy > S + r) continue;
      fn(dx, dy);
    }
  };

  /* ---------------- the surfaces ----------------
     Each recipe returns a painted tile; `bump` is how hard the bump map
     presses, `baked` that the colours are in the tile. */
  const RECIPES = {
    plaster: { S: 512, bump: 0.02, make(S) {
      const n = field(S, S, 11, [[4, 4, 1], [9, 9, 0.55], [23, 23, 0.3], [64, 64, 0.18], [160, 160, 0.12]]);
      return paint(S, (o, x, y, i) => grey(o, 0.8 + 0.2 * n[i], n[i]));
    } },
    metal: { S: 128, bump: 0.008, make(S) {
      const st = field(S, S, 21, [[2, 40, 1], [3, 90, 0.6], [6, 180, 0.35]]);
      const tar = field(S, S, 22, [[3, 3, 1], [7, 7, 0.5], [17, 17, 0.25]]);
      const pit = field(S, S, 23, [[64, 64, 1], [128, 128, 0.7]]);
      return paint(S, (o, x, y, i) => grey(o, 0.8 + 0.2 * st[i] - 0.24 * sm(0.55, 0.78, tar[i]) - 0.05 * sm(0.7, 0.9, pit[i]),
                                           0.5 * st[i] + 0.5 * pit[i]));
    } },
    iron: { S: 128, bump: 0.03, make(S) {
      const c = cells(S, 9, 31), n = field(S, S, 32, [[8, 8, 1], [32, 32, 0.6], [96, 96, 0.4]]);
      return paint(S, (o, x, y, i) => {
        const dent = Math.min(1, c.f1[i] / 0.75);
        grey(o, 0.76 + 0.14 * dent + 0.1 * n[i], 1 - dent * dent * 0.8 + 0.2 * n[i]);
      });
    } },
    copper: { S: 128, bump: 0.01, baked: true, make(S) {
      const st = field(S, S, 41, [[2, 36, 1], [4, 80, 0.5]]), pat = field(S, S, 42, [[4, 4, 1], [9, 9, 0.6], [21, 21, 0.3]]);
      const A = rgb('#c7784a'), B = rgb('#6e3a1f'), V = rgb('#62a08a');
      return paint(S, (o, x, y, i) => {
        lerp3(o, A, B, 0.25 + 0.5 * (1 - st[i]) * 0.6 + 0.4 * sm(0.5, 0.7, pat[i]));
        const v = sm(0.68, 0.8, pat[i]);
        if (v > 0) lerp3(o, o, V, v * 0.85);
        o[3] = 0.5 * st[i] + 0.5 * v;
      });
    } },
    velvet: { S: 256, bump: 0.012, make(S) {
      const cr = field(S, S, 51, [[3, 5, 1], [7, 11, 0.7], [17, 27, 0.4], [41, 61, 0.2]]);
      const fib = field(S, S, 52, [[256, 256, 1]]);
      return paint(S, (o, x, y, i) => grey(o, 0.64 + 0.4 * cr[i] + 0.06 * (fib[i] - 0.5), cr[i]));
    } },
    linen: { S: 256, bump: 0.01, make(S) {
      const T = S / 4;
      const sx = field(S, S, 61, [[3, 64, 1], [5, 128, 0.5]]), sy = field(S, S, 62, [[64, 3, 1], [128, 5, 0.5]]);
      return paint(S, (o, x, y, i) => {
        const gx = x / S * T, gy = y / S * T, ix = Math.floor(gx), iy = Math.floor(gy);
        const over = (ix + iy) & 1;
        const p = over ? Math.sin(Math.PI * (gx - ix)) : Math.sin(Math.PI * (gy - iy));
        const slub = over ? sy[i] : sx[i];
        grey(o, 0.8 + 0.12 * p + 0.1 * slub, p);
      });
    } },
    wool: { S: 256, bump: 0.015, make(S) {
      const T = 40, fz = field(S, S, 71, [[64, 64, 1], [128, 128, 0.6], [12, 12, 0.5]]);
      return paint(S, (o, x, y, i) => {
        const gx = x / S * T, gy = y / S * T, ix = Math.floor(gx), iy = Math.floor(gy);
        const p = ((ix + iy) & 1) ? Math.sin(Math.PI * (gx - ix)) : Math.sin(Math.PI * (gy - iy));
        grey(o, 0.74 + 0.12 * p + 0.16 * fz[i], 0.6 * p + 0.4 * fz[i]);
      });
    } },
    leather: { S: 256, bump: 0.02, make(S) {
      const c = cells(S, 30, 81), n = field(S, S, 82, [[3, 3, 1], [7, 7, 0.6], [15, 15, 0.3]]);
      return paint(S, (o, x, y, i) => {
        const crack = 1 - sm(0, 0.14, c.f2[i] - c.f1[i]);
        grey(o, 0.74 + 0.22 * n[i] - 0.14 * crack + 0.04 * c.id[i], 1 - crack * 0.7);
      });
    } },
    fur: { S: 256, bump: 0.03, make(S) {
      const n = field(S, S, 91, [[4, 4, 1], [11, 11, 0.5]]);
      const p = paint(S, (o, x, y, i) => grey(o, 0.7 + 0.25 * n[i], n[i]));
      const rng = U.makeRng(92), g = p.gm;
      for (let k = 0; k < (low() ? 1800 : 4200); k++) {
        const x = rng() * S, y = rng() * S, l = 4 + rng() * 9, a = Math.PI / 2 + (rng() - 0.5) * 0.7;
        g.strokeStyle = rng() < 0.5 ? 'rgba(255,240,220,0.22)' : 'rgba(30,18,8,0.22)';
        g.lineWidth = 0.6 + rng() * 0.8;
        wrapped(S, x, y, l, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); });
      }
      return p;
    } },
    baize: { S: 128, bump: 0.006, make(S) {
      const n = field(S, S, 101, [[8, 8, 0.5], [64, 64, 1], [128, 128, 0.7]]);
      return paint(S, (o, x, y, i) => grey(o, 0.86 + 0.14 * n[i], n[i]));
    } },
    china: { S: 128, bump: 0.004, make(S) {
      const n = field(S, S, 111, [[3, 3, 1], [9, 9, 0.4]]);
      const p = paint(S, (o, x, y, i) => grey(o, 0.94 + 0.06 * n[i], 0.5));
      const rng = U.makeRng(112);
      for (const g of [p.gm, p.gb]) {
        g.strokeStyle = g === p.gm ? 'rgba(90,80,60,0.12)' : 'rgba(0,0,0,0.6)';
        g.lineWidth = 0.7;
        for (let k = 0; k < 40; k++) {
          let x = rng() * S, y = rng() * S;
          g.beginPath(); g.moveTo(x, y);
          for (let s = 0; s < 6; s++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; g.lineTo(x, y); }
          g.stroke();
        }
      }
      return p;
    } },
    wax: { S: 128, bump: 0.01, make(S) {
      const n = field(S, S, 121, [[3, 2, 1], [20, 3, 0.6], [40, 6, 0.3]]);
      return paint(S, (o, x, y, i) => grey(o, 0.87 + 0.13 * n[i], n[i]));
    } },
    parchment: { S: 256, bump: 0.008, baked: true, make(S) {
      const st = field(S, S, 131, [[3, 3, 1], [7, 7, 0.6], [19, 19, 0.3], [64, 64, 0.15]]);
      const A = rgb('#ddc99f'), B = rgb('#a8895a');
      const p = paint(S, (o, x, y, i) => { lerp3(o, A, B, sm(0.45, 0.85, st[i]) * 0.8); o[3] = st[i]; });
      const rng = U.makeRng(132), g = p.gm;
      // foxing, and the brown ink of a coastline or two
      for (let k = 0; k < 60; k++) {
        const x = rng() * S, y = rng() * S, r = 1 + rng() * 4;
        g.fillStyle = 'rgba(120,80,35,' + (0.1 + rng() * 0.2) + ')';
        wrapped(S, x, y, r, (dx, dy) => { g.beginPath(); g.arc(x + dx, y + dy, r, 0, TAU); g.fill(); });
      }
      g.strokeStyle = 'rgba(90,55,25,0.45)'; g.lineWidth = 1.2;
      for (let k = 0; k < 5; k++) {
        let x = rng() * S, y = rng() * S, a = rng() * TAU;
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 40; s++) { a += (rng() - 0.5) * 1.2; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
        g.stroke();
      }
      return p;
    } },
    terracotta: { S: 256, bump: 0.015, make(S) {
      const n = field(S, S, 141, [[4, 4, 1], [16, 16, 0.5], [96, 96, 0.4]]);
      const ring = field(S, S, 142, [[2, 40, 1], [3, 70, 0.5]]);
      return paint(S, (o, x, y, i) => grey(o, 0.76 + 0.14 * n[i] + 0.1 * ring[i] - 0.08 * sm(0.75, 0.85, n[i]), 0.6 * ring[i] + 0.4 * n[i]));
    } },
    soot: { S: 128, bump: 0.02, make(S) {
      const n = field(S, S, 151, [[4, 4, 1], [16, 16, 0.6], [64, 64, 0.4]]);
      return paint(S, (o, x, y, i) => grey(o, 0.6 + 0.4 * n[i], n[i]));
    } },
    bone: { S: 128, bump: 0.015, make(S) {
      const n = field(S, S, 161, [[40, 3, 1], [90, 5, 0.5], [6, 6, 0.4]]);
      return paint(S, (o, x, y, i) => grey(o, 0.8 + 0.2 * n[i], n[i]));
    } },
    water: { S: 128, bump: 0.02, make(S) {
      const n = field(S, S, 171, [[5, 5, 1], [11, 11, 0.5]]);
      return paint(S, (o, x, y, i) => {
        const r = 0.5 + 0.5 * Math.sin(n[i] * TAU * 4);
        grey(o, 0.82 + 0.18 * r, r);
      });
    } },
    lacquer: { S: 128, bump: 0.003, make(S) {
      const n = field(S, S, 181, [[3, 3, 1], [8, 8, 0.4]]);
      const p = paint(S, (o, x, y, i) => grey(o, 0.86 + 0.14 * n[i], 0.5));
      const rng = U.makeRng(182), g = p.gm;
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 0.6;
      for (let k = 0; k < 70; k++) {
        const x = rng() * S, y = rng() * S, a = rng() * TAU, l = 8 + rng() * 30;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      return p;
    } },
    leafy: { S: 128, bump: 0.01, make(S) {
      const n = field(S, S, 191, [[6, 6, 1], [14, 14, 0.5]]);
      return paint(S, (o, x, y, i) => {
        const vein = Math.abs(Math.sin((x + y * 0.6) / S * TAU * 9)) < 0.06 ? 0.12 : 0;
        grey(o, 0.75 + 0.2 * n[i] + vein, n[i]);
      });
    } },
    skin: { S: 128, bump: 0.006, make(S) {
      const n = field(S, S, 201, [[4, 4, 1], [32, 32, 0.4], [64, 64, 0.3]]);
      return paint(S, (o, x, y, i) => grey(o, 0.86 + 0.14 * n[i] - 0.1 * sm(0.8, 0.9, n[i]), n[i]));
    } },
    crust: { S: 128, bump: 0.03, make(S) {
      const c = cells(S, 6, 211), n = field(S, S, 212, [[6, 6, 1], [24, 24, 0.5]]);
      return paint(S, (o, x, y, i) => {
        const crack = 1 - sm(0, 0.08, c.f2[i] - c.f1[i]);
        grey(o, 0.8 + 0.2 * n[i] - 0.3 * crack, 1 - crack);
      });
    } },
    soil: { S: 256, bump: 0.04, baked: true, make(S) {
      const n = field(S, S, 221, [[6, 6, 1], [24, 24, 0.6], [96, 96, 0.4]]), c = cells(S, 22, 222);
      const A = rgb('#3a2818'), B = rgb('#1c130b'), P = rgb('#7d705c');
      return paint(S, (o, x, y, i) => {
        lerp3(o, A, B, n[i]);
        const peb = c.f1[i] < 0.16 && c.id[i] < 0.3;
        if (peb) lerp3(o, o, P, 0.7);
        o[3] = peb ? 0.9 : n[i] * 0.6;
      });
    } },
  };

  function surface(kind) {
    const R = RECIPES[kind] || RECIPES.plaster;
    return once('surface-' + kind, () => {
      const p = R.make(size(R.S));
      return { map: texture(p.map), bump: texture(p.bump, { data: true }), bumpScale: R.bump, baked: !!R.baked };
    });
  }

  /* A material of `kind`. Tinted kinds take `opts.color`; baked ones
     are white underneath, whatever colour was asked for. */
  function material(kind, opts = {}) {
    const s = surface(kind);
    const o = Object.assign({ roughness: 0.8 }, opts, { map: s.map, bumpMap: s.bump, bumpScale: s.bumpScale });
    if (s.baked) o.color = '#ffffff';
    return new THREE.MeshStandardMaterial(o);
  }

  /* ---------------- book spines ----------------
     Leather in a colour, tooled in gilt. The bands are laid at the
     heights a book stands on the library shelves (a shelf every 38 cm,
     from 12 cm up), so with UVs of 38 cm a tile, every spine on every
     shelf has its bands in the right place. */
  const SHELF = 0.38, SHELF0 = 0.12;
  const BOOK = { red: '#6e1a1c', green: '#1d3d2a', blue: '#1b2840', brown: '#4d2c18', tan: '#8a6338', black: '#18120f' };
  function binding(kind) {
    return once('binding-' + kind, () => {
      const S = size(256);
      const c = cells(S, 26, 231), n = field(S, S, 232, [[3, 3, 1], [9, 9, 0.5]]);
      const base = rgb(BOOK[kind] || BOOK.brown), dark = base.map(v => v * 0.6), gilt = rgb('#cfa54e');
      const rowOf = (h) => Math.round((1 - ((SHELF0 + h) / SHELF) % 1) * S);
      const bands = [[0.025, 0.033], [0.045, 0.05], [0.1, 0.104], [0.15, 0.154], [0.19, 0.198], [0.205, 0.21]]
        .map(([a, b]) => [rowOf(b), rowOf(a)]);
      const label = [rowOf(0.15), rowOf(0.104)];
      const p = paint(S, (o, x, y, i) => {
        const crack = 1 - sm(0, 0.12, c.f2[i] - c.f1[i]);
        lerp3(o, base, dark, 0.35 * n[i] + 0.3 * crack);
        let h = 1 - crack * 0.6;
        if (y > label[0] && y < label[1]) { lerp3(o, o, [0.08, 0.05, 0.04], 0.7); h = 0.4; }
        for (const [a, b] of bands) if (y >= a && y <= b) { lerp3(o, gilt, [gilt[0] * 0.7, gilt[1] * 0.6, gilt[2] * 0.4], n[i]); h = 1; }
        o[3] = h;
      });
      return { map: texture(p.map), bump: texture(p.bump, { data: true }), bumpScale: 0.01, baked: true };
    });
  }
  const bookMaterial = (kind) => {
    const s = binding(kind);
    return new THREE.MeshStandardMaterial({ map: s.map, bumpMap: s.bump, bumpScale: s.bumpScale, roughness: 0.62 });
  };

  /* ---------------- leaves ----------------
     Painted with their outlines in the alpha, base at the bottom of the
     canvas (v = 0) and tip at the top. */
  function cutout(key, W, H, fn) {
    return once('plant-' + key, () => {
      const c = canvas(size(W), size(H));
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.save(); g.scale(c.width / W, c.height / H);
      fn(g, U.makeRng(key.length * 977 + W + H), W, H);
      g.restore();
      return texture(c, { clamp: true });
    });
  }
  const green = (rng, light = 0) => {
    const h = 95 + rng() * 30, s = 38 + rng() * 22, l = 22 + rng() * 14 + light;
    return 'hsl(' + h.toFixed(0) + ',' + s.toFixed(0) + '%,' + l.toFixed(0) + '%)';
  };
  /* A pointed leaf from (x, y) at angle `a`, `len` long, `w` wide. */
  function blade(g, x, y, a, len, w, fill, vein) {
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const tx = x + ca * len, ty = y + sa * len;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + ca * len * 0.45 + px * w, y + sa * len * 0.45 + py * w, tx, ty);
    g.quadraticCurveTo(x + ca * len * 0.45 - px * w, y + sa * len * 0.45 - py * w, x, y);
    g.fillStyle = fill; g.fill();
    if (vein) {
      g.strokeStyle = vein; g.lineWidth = Math.max(0.6, w * 0.12);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + ca * len * 0.92, y + sa * len * 0.92); g.stroke();
    }
  }
  const PLANTS = {
    // a palm's frond: a midrib and long leaflets swept toward the tip
    frond: [128, 512, (g, rng, W, H) => {
      for (let t = 0.04; t < 0.98; t += 0.022) {
        const y = H * (1 - t), L = W * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.6);
        for (const s of [-1, 1]) {
          const a = -Math.PI / 2 + s * (1.0 + (rng() - 0.5) * 0.25);
          blade(g, W / 2, y, a, Math.max(6, L * (0.85 + rng() * 0.2)), 2.4 + rng() * 1.5, green(rng, 6), 'rgba(220,235,170,0.35)');
        }
      }
      g.strokeStyle = '#6f7a3a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, H * 0.02); g.stroke();
    }],
    // a fern: pinnae of little lobes, shortening to the tip
    fern: [128, 512, (g, rng, W, H) => {
      for (let t = 0.03; t < 0.97; t += 0.035) {
        const y = H * (1 - t), L = W * 0.48 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)), 0.8);
        for (const s of [-1, 1]) {
          const a = -Math.PI / 2 + s * 1.15;
          const ca = Math.cos(a), sa = Math.sin(a);
          g.fillStyle = green(rng, 8);
          for (let k = 0; k < 7; k++) {
            const f = k / 7, r = (1 - f * 0.75) * L * 0.13;
            g.beginPath(); g.arc(W / 2 + ca * L * f, y + sa * L * f, r, 0, TAU); g.fill();
          }
        }
      }
      g.strokeStyle = '#4d5d2a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, H * 0.03); g.stroke();
    }],
    // broad leaves from one root: an aspidistra, a clivia
    broadleaf: [256, 256, (g, rng, W, H) => {
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.26 + (rng() - 0.5) * 0.15;
        const len = H * (0.62 + rng() * 0.32), w = 22 + rng() * 12;
        blade(g, W / 2 + (k - 3) * 3, H, a, len, w, green(rng, 2), 'rgba(200,225,150,0.45)');
        // side veins and a gloss down one side
        const ca = Math.cos(a), sa = Math.sin(a);
        g.strokeStyle = 'rgba(10,30,5,0.25)'; g.lineWidth = 1;
        for (let v = 0.2; v < 0.85; v += 0.09) {
          const x = W / 2 + (k - 3) * 3 + ca * len * v, y = H + sa * len * v;
          for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (ca * 0.6 - sa * s) * w * 0.6, y + (sa * 0.6 + ca * s) * w * 0.6); g.stroke(); }
        }
      }
    }],
    // a strand of ivy, hanging: heart-shaped leaves either side of a stem
    ivy: [128, 512, (g, rng, W, H) => {
      let x = W / 2;
      const pts = [];
      for (let y = 0; y <= H; y += 8) { x += (rng() - 0.5) * 6; x = Math.max(W * 0.3, Math.min(W * 0.7, x)); pts.push([x, y]); }
      g.strokeStyle = '#5a4a2a'; g.lineWidth = 2.2;
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      for (let i = 2; i < pts.length; i += 2) {
        const [px, py] = pts[i], s = i % 4 ? 1 : -1, r = 9 + rng() * 8 * (1 - py / H * 0.5);
        const cx = px + s * r * 0.9, cy = py + r * 0.3;
        g.fillStyle = green(rng, rng() < 0.3 ? 12 : 0);
        for (const [dx, dy, rr] of [[0, 0, 0.62], [-0.45, -0.35, 0.5], [0.45, -0.35, 0.5], [0, 0.45, 0.42]]) {
          g.beginPath(); g.arc(cx + dx * r, cy + dy * r, rr * r, 0, TAU); g.fill();
        }
        g.strokeStyle = 'rgba(220,230,170,0.35)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(cx, cy - r * 0.5); g.lineTo(cx, cy + r * 0.6); g.stroke();
      }
    }],
    // a geranium: a mound of round leaves under heads of red flowers
    flowers: [256, 256, (g, rng, W, H) => {
      for (let k = 0; k < 70; k++) {
        const a = -Math.PI / 2 + (rng() - 0.5) * 2.2, r = rng() * H * 0.5;
        const x = W / 2 + Math.cos(a) * r, y = H - 6 + Math.sin(a) * r * 0.9;
        g.fillStyle = green(rng, 4);
        g.beginPath(); g.arc(x, y, 9 + rng() * 9, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(40,30,10,0.25)'; g.lineWidth = 1;
        g.beginPath(); g.arc(x, y, 6, 0, TAU); g.stroke();
      }
      const reds = ['#c8202a', '#e0384a', '#b0182a', '#f06070', '#f2f0f0'];
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + (rng() - 0.5) * 1.8, r = H * (0.35 + rng() * 0.25);
        const x = W / 2 + Math.cos(a) * r * 0.9, y = H + Math.sin(a) * r;
        const col = reds[Math.floor(rng() * (rng() < 0.85 ? 4 : 5))];
        g.strokeStyle = '#4d6a2a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (W / 2 - x) * 0.3, y + 30); g.stroke();
        for (let f = 0; f < 14; f++) {
          const fa = rng() * TAU, fr = rng() * 13;
          g.fillStyle = col;
          g.beginPath(); g.arc(x + Math.cos(fa) * fr, y + Math.sin(fa) * fr * 0.8, 3.5 + rng() * 2.5, 0, TAU); g.fill();
        }
        g.fillStyle = 'rgba(255,240,200,0.5)';
        g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
      }
    }],
    // long grass, for tufts on the lawn: blades from the root, lighter at the tips
    tuft: [256, 128, (g, rng, W, H) => {
      for (let k = 0; k < 90; k++) {
        const x = W * (0.12 + rng() * 0.76), lean = (rng() - 0.5) * 0.9, len = H * (0.45 + rng() * 0.55);
        const grd = g.createLinearGradient(0, H, 0, H - len);
        const hue = 70 + rng() * 40;
        grd.addColorStop(0, 'hsl(' + hue + ',35%,16%)');
        grd.addColorStop(1, 'hsl(' + (hue - 15) + ',45%,' + (42 + rng() * 18) + '%)');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(x - 2.4, H);
        g.quadraticCurveTo(x + lean * len * 0.3, H - len * 0.6, x + lean * len * 0.6, H - len);
        g.quadraticCurveTo(x + lean * len * 0.3 + 1.5, H - len * 0.55, x + 2.4, H);
        g.fill();
      }
    }],
    tuftFlowers: [256, 128, (g, rng, W, H) => {
      PLANTS.tuft[2](g, rng, W, H);
      for (let k = 0; k < 9; k++) {
        const x = W * (0.15 + rng() * 0.7), y = H * (0.1 + rng() * 0.45);
        g.strokeStyle = '#4b6a2a'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 6, H); g.stroke();
        const col = rng() < 0.5 ? '#f4f2e8' : rng() < 0.6 ? '#f2d23a' : '#b88ad8';
        g.fillStyle = col;
        for (let p = 0; p < 6; p++) { const a = p / 6 * TAU; g.beginPath(); g.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2.4, 0, TAU); g.fill(); }
        g.fillStyle = '#e8b020'; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill();
      }
    }],
    // a spray of leaves, for the crown of a broadleaf tree
    canopy: [256, 256, (g, rng, W, H) => {
      for (let k = 0; k < 520; k++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * W * 0.46;
        const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r * 0.85;
        const shade = (y - H / 2) / H;   // darker underneath
        g.fillStyle = 'hsl(' + (90 + rng() * 30).toFixed(0) + ',' + (30 + rng() * 20).toFixed(0) + '%,' + (24 + rng() * 14 - shade * 18).toFixed(0) + '%)';
        g.save(); g.translate(x, y); g.rotate(rng() * TAU);
        g.beginPath(); g.ellipse(0, 0, 5 + rng() * 4, 2.5 + rng() * 2, 0, 0, TAU); g.fill();
        g.restore();
      }
    }],
    // a bough of a Scots pine: tufts of needles off a twig
    pine: [256, 256, (g, rng, W, H) => {
      g.strokeStyle = '#4a3020'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, H * 0.55); g.quadraticCurveTo(W * 0.5, H * 0.45, W, H * 0.5); g.stroke();
      for (let k = 0; k < 46; k++) {
        const x = rng() * W, y = H * 0.5 + (rng() - 0.5) * H * 0.25;
        for (let n = 0; n < 16; n++) {
          const a = rng() * TAU, l = 10 + rng() * 22;
          g.strokeStyle = 'hsl(' + (120 + rng() * 30).toFixed(0) + ',28%,' + (18 + rng() * 14).toFixed(0) + '%)';
          g.lineWidth = 1.3;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.8); g.stroke();
        }
      }
    }],
  };
  const plant = (kind) => cutout(kind, PLANTS[kind][0], PLANTS[kind][1], PLANTS[kind][2]);

  /* ---------------- the outdoors ---------------- */

  // a close-mown lawn, a tile about two and a half metres across
  function lawn() {
    return once('lawn', () => {
      const S = size(512);
      const n = field(S, S, 241, [[4, 4, 1], [11, 11, 0.6], [32, 32, 0.4], [128, 128, 0.3]]);
      const p = paint(S, (o, x, y, i) => {
        const v = 0.62 + 0.3 * n[i];
        o[0] = v * 0.94; o[1] = v; o[2] = v * 0.84; o[3] = n[i];
      });
      const rng = U.makeRng(242), g = p.gm;
      for (let k = 0; k < (low() ? 3000 : 9000); k++) {
        const x = rng() * S, y = rng() * S, a = -Math.PI / 2 + (rng() - 0.5) * 1.2, l = 3 + rng() * 6;
        const l2 = rng();
        g.strokeStyle = l2 < 0.45 ? 'rgba(255,255,210,0.22)' : l2 < 0.9 ? 'rgba(10,30,0,0.22)' : 'rgba(255,240,150,0.3)';
        g.lineWidth = 0.8 + rng() * 0.8;
        wrapped(S, x, y, l, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); });
      }
      // a few clover leaves and daisies in it
      for (let k = 0; k < 140; k++) {
        const x = rng() * S, y = rng() * S, daisy = rng() < 0.3;
        g.fillStyle = daisy ? 'rgba(250,250,240,0.85)' : 'rgba(40,80,20,0.4)';
        wrapped(S, x, y, 4, (dx, dy) => {
          for (let q = 0; q < (daisy ? 5 : 3); q++) {
            const a = q / (daisy ? 5 : 3) * TAU;
            g.beginPath(); g.arc(x + dx + Math.cos(a) * 2, y + dy + Math.sin(a) * 2, daisy ? 1.4 : 2.2, 0, TAU); g.fill();
          }
        });
      }
      return texture(p.map);
    });
  }

  function gravel() {
    return once('gravel', () => {
      const S = size(256), c = cells(S, 40, 251), n = field(S, S, 252, [[8, 8, 1], [32, 32, 0.5]]);
      const p = paint(S, (o, x, y, i) => {
        // round pebbles: lit on top, dark in the gaps between them
        const gap = sm(0.32, 0.62, c.f1[i]), top = 1 - sm(0, 0.35, c.f1[i]);
        const v = (0.58 + 0.34 * c.id[i] + 0.08 * n[i]) * (1 - 0.65 * gap) + 0.08 * top;
        const warm = c.id[i] > 0.7 ? 0.9 : 1;
        o[0] = v; o[1] = v * 0.96 * (2 - warm); o[2] = v * 0.86 * warm; o[3] = 1 - gap;
      });
      return texture(p.map);
    });
  }

  function bark() {
    return once('bark', () => {
      const S = size(256);
      const n = field(S, S, 261, [[24, 2, 1], [48, 4, 0.6], [6, 6, 0.4]]);
      const p = paint(S, (o, x, y, i) => {
        const fis = sm(0.55, 0.75, n[i]);
        const v = 0.45 + 0.35 * n[i] - 0.25 * fis;
        o[0] = v; o[1] = v * 0.85; o[2] = v * 0.7; o[3] = 1 - fis;
      });
      return texture(p.map);
    });
  }

  /* The dome of the sky over the view: `top` at the horizon (where the
     panorama's own sky ends) deepening to the zenith, a few high wisps,
     and stars at night. v = 0 is the horizon. */
  function sky(key, P) {
    return once('sky-' + key, () => {
      const W = size(1024), H = size(256);
      const c = canvas(W, H), g = c.getContext('2d');
      const grd = g.createLinearGradient(0, H, 0, 0);
      const zen = '#' + new THREE.Color(P.top).multiplyScalar(P.stars ? 0.55 : 0.78).getHexString();
      grd.addColorStop(0, P.top); grd.addColorStop(1, zen);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      const rng = U.makeRng(key.length * 31 + 7);
      if (P.stars) {
        for (let i = 0; i < 700; i++) {
          g.fillStyle = 'rgba(255,255,255,' + (0.3 + rng() * 0.6) + ')';
          g.fillRect(rng() * W, rng() * H * 0.9, 1, 1);
        }
      } else {
        for (let i = 0; i < 36; i++) {
          const x = rng() * W, y = H * (0.55 + rng() * 0.42), w = W * (0.04 + rng() * 0.09), h = H * (0.02 + rng() * 0.04);
          for (const dx of [0, -W, W]) {
            const r = g.createRadialGradient(x + dx, y, 0, x + dx, y, w);
            r.addColorStop(0, 'rgba(255,255,255,' + (0.12 + rng() * 0.16) + ')'); r.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = r;
            g.save(); g.translate(x + dx, y); g.scale(1, h / w); g.translate(-(x + dx), -y);
            g.beginPath(); g.arc(x + dx, y, w, 0, TAU); g.fill(); g.restore();
          }
        }
      }
      return texture(c, { clampT: true });
    });
  }

  /* ---------------- shapes for growing things ---------------- */

  /* A frond leaving the origin `pitch` above the level, drooping by
     `droop` metres at its tip, folded down along its rib, then turned
     `yaw` about the vertical. UVs run along it, v = 0 at the base. */
  function frond(len, w, pitch, droop, yaw, segs = 8) {
    const g = new THREE.PlaneGeometry(w, len, 2, segs);
    const p = g.attributes.position;
    const c = Math.cos(pitch), s = Math.sin(pitch);
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w, t = p.getY(i) / len + 0.5, d = t * len;
      p.setXYZ(i, d * c, d * s - droop * t * t - Math.abs(u) * w * 0.35, u * w);
    }
    g.rotateY(yaw);
    g.computeVertexNormals();
    return g;
  }
  /* A card standing on the origin, `w` by `h`, turned `yaw`; several of
     them crossed is a bush or a tuft. */
  function card(w, h, yaw, lean = 0) {
    const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
    if (lean) g.rotateX(lean);
    return g.rotateY(yaw);
  }
  function cross(w, h, n = 2, yaw = 0) {
    const parts = [];
    for (let k = 0; k < n; k++) parts.push(card(w, h, yaw + k * Math.PI / n));
    const out = EstateMaterials.merge(parts);
    parts.forEach(q => q.dispose());
    return out;
  }
  /* A strand hanging `len` from the origin, swaying a little out of true. */
  function strand(w, len, yaw, sway = 0.08) {
    const g = new THREE.PlaneGeometry(w, len, 1, 6).translate(0, -len / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = -p.getY(i) / len;
      p.setZ(i, Math.sin(t * Math.PI * 0.9) * sway + t * t * sway);
    }
    g.rotateY(yaw);
    g.computeVertexNormals();
    return g;
  }

  return {
    surface, material, binding, bookMaterial, BOOK, plant, lawn, gravel, bark, sky,
    frond, card, cross, strand, field, cells,
  };
})();
