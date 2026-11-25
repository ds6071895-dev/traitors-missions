/* ------------------------------------------------------------------
   figure-body.js — the surfaces a person is made of.

   The old figure was sixty primitives on a group tree: a cylinder per
   thigh, a ball per knee, a box per boot. Every join was a seam you
   could see, every part was its own draw call, and a table of eight
   cost five hundred of them before the castle had drawn a candle.

   This builds the same person as a handful of skinned surfaces on one
   skeleton (`figure-skeleton.js`):
     skin      head, neck, hands, ears
     coat      the jacket or long coat, with the shirt in its V
     legs      trousers and boots
     hair      the hair, and the brows
     features  eyes and their glints, the inside of the mouth
     accent    hat, scarf / sash / cowl, a brooch
   six draw calls a person, whatever they chose.

   Everything is a loft: rings swept along a bone chain, each ring a
   superellipse cut to that height of the body, read off a profile
   table of real proportions. A loft has no seams, its UVs come out in
   metres (so the weave in `figure-materials.js` is one size from collar
   to cuff), and every vertex knows where it is along the chain, which
   is what its skin weights are made of — a smooth crossfade across
   each joint, never more than four bones.

   Clothes are the surface. There is no body under the jacket to poke
   through it; the jacket is shaped like the body it covers, and the
   trousers are tucked inside its hem.

   Geometry depends only on build and choices, never on colour, so it
   is cached and shared: a table of eight in two builds is two sets of
   buffers. Colour arrives per figure as a vertex-colour attribute
   painted from each vertex's tag (coat, shirt, button…).
------------------------------------------------------------------ */
const FigureBody = (() => {

  const SK = () => FigureSkeleton;
  const TILE = 0.30;                 // metres per weave tile, as figure-materials
  const TAU = Math.PI * 2;
  const ss = (a, b, x) => U.smoothstep(a, b, x);
  const gauss = (d, s) => Math.exp(-(d / s) * (d / s));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- the builder ---------------- */

  class Builder {
    constructor() {
      this.p = []; this.n = []; this.uv = []; this.si = []; this.sw = [];
      this.tag = []; this.col = []; this.ix = [];
    }
    get count() { return this.p.length / 3; }

    /* Everything is drawn at design heights and lands at the figure's
       real ones (`FigureSkeleton.remap`: the short legs); weights are
       worked out before, from the design height. */
    add(P, u, v, w, tag, col) {
      this.p.push(P.x, SK().remap(P.y, this.rigid), P.z);
      this.n.push(0, 0, 0);
      this.uv.push(u, v);
      const W = norm4(w);
      this.si.push(W[0], W[1], W[2], W[3]);
      this.sw.push(W[4], W[5], W[6], W[7]);
      this.tag.push(tag || 0);
      const c = col || ONE;
      this.col.push(c[0], c[1], c[2]);
      return this.count - 1;
    }

    tri(a, b, c) { this.ix.push(a, b, c); }

    /* Area-weighted normals for one part: the triangles from `i0` and
       the vertices from `v0`. */
    normals(v0, i0) {
      const p = this.p, n = this.n, ix = this.ix;
      for (let i = i0; i < ix.length; i += 3) {
        const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
      }
      for (let k = v0 * 3; k < n.length; k += 3) {
        const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1;
        n[k] /= l; n[k + 1] /= l; n[k + 2] /= l;
      }
    }

    /* Flip a part inside out, when its winding came out backwards. */
    flip(v0, i0) {
      const ix = this.ix;
      for (let i = i0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      for (let k = v0 * 3; k < this.n.length; k++) this.n[k] = -this.n[k];
    }

    averageNormals(list) {
      let x = 0, y = 0, z = 0;
      for (const i of list) { x += this.n[i * 3]; y += this.n[i * 3 + 1]; z += this.n[i * 3 + 2]; }
      const l = Math.hypot(x, y, z) || 1;
      for (const i of list) { this.n[i * 3] = x / l; this.n[i * 3 + 1] = y / l; this.n[i * 3 + 2] = z / l; }
    }

    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.ix, 1)
                                    : new THREE.Uint16BufferAttribute(this.ix, 1));
      g.userData.tags = Uint8Array.from(this.tag);
      g.userData.shared = true;
      g.computeBoundingSphere();
      return g;
    }
  }

  const ONE = [1, 1, 1];

  /* Weights in, four out: duplicates merged, the strongest kept, and
     normalised to one. */
  function norm4(w) {
    const m = new Map();
    for (const [b, x] of w) if (x > 1e-4) m.set(b, (m.get(b) || 0) + x);
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0;
    for (const t of top) s += t[1];
    if (s <= 0) return [0, 0, 0, 0, 1, 0, 0, 0];
    const out = [0, 0, 0, 0, 0, 0, 0, 0];
    top.forEach((t, i) => { out[i] = t[0]; out[4 + i] = t[1] / s; });
    return out;
  }

  /* Piecewise-linear weights along a chain of [bone, y] nodes, which is
     a smooth bend at every joint and a rigid stretch between repeated
     nodes. `y` is whatever coordinate the chain runs along. */
  function chain(y, nodes) {
    if (y >= nodes[0][1]) return [[nodes[0][0], 1]];
    for (let i = 1; i < nodes.length; i++) {
      const [b0, y0] = nodes[i - 1], [b1, y1] = nodes[i];
      if (y >= y1) {
        const t = (y0 - y) / (y0 - y1 || 1);
        return [[b0, 1 - t], [b1, t]];
      }
    }
    return [[nodes[nodes.length - 1][0], 1]];
  }

  /* Blend a weight list toward another by `k`. */
  function mixW(a, b, k) {
    if (k <= 0) return a;
    if (k >= 1) return b;
    return a.map(([i, w]) => [i, w * (1 - k)]).concat(b.map(([i, w]) => [i, w * k]));
  }

  /* ---------------- profiles ---------------- */

  /* Catmull-Rom through key rows, `sub` samples per interval. Every
     column interpolates, including the first (the height), so a key
     table is a smooth surface rather than a stack of frusta. */
  function sample(rows, sub) {
    if (sub <= 1) return rows.map(r => r.slice());
    const out = [];
    const get = (i) => rows[Math.max(0, Math.min(rows.length - 1, i))];
    for (let i = 0; i < rows.length - 1; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let s = 0; s < sub; s++) {
        const t = s / sub, t2 = t * t, t3 = t2 * t;
        out.push(p1.map((_, c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t
          + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
          + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
      }
    }
    out.push(rows[rows.length - 1].slice());
    return out;
  }

  /* The same, leaving `a` rows at the start and `b` at the end alone:
     those are folds (a hem turned in, a collar folded to the neck) that
     double back, and a spline through a fold loops. */
  function sampleEnds(rows, sub, a, b) {
    const mid = sample(rows.slice(a, rows.length - b), sub);
    return rows.slice(0, a).map(r => r.slice()).concat(mid, rows.slice(rows.length - b).map(r => r.slice()));
  }

  /* Interpolate one row of a key table at height y (column 0), for the
     things that sit on a surface rather than being it. */
  function rowAt(rows, y) {
    const asc = rows[rows.length - 1][0] > rows[0][0];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (asc ? y <= b[0] : y >= b[0]) {
        const t = U.clamp((y - a[0]) / ((b[0] - a[0]) || 1), 0, 1);
        return a.map((v, c) => lerp(v, b[c], t));
      }
    }
    return (asc ? y > rows[0][0] : y < rows[0][0]) ? rows[rows.length - 1].slice() : rows[0].slice();
  }

  /* A superellipse ring point: θ = 0 is +ax, θ = π/2 is +az (the
     front). `f` and `b` are the extents in front and behind, `tp`
     narrows the front half toward its tip (a jaw, a toe). */
  function ringPoint(c, ax, az, w, f, b, n, tp, th, out) {
    const cs = Math.cos(th), sn = Math.sin(th);
    const e = 2 / (n || 2);
    const ex = Math.sign(cs) * Math.pow(Math.abs(cs), e);
    const ez = Math.sign(sn) * Math.pow(Math.abs(sn), e);
    const x = w * ex * (1 - (tp || 0) * Math.max(0, ez) * Math.max(0, ez));
    const z = ez > 0 ? f * ez : b * ez;
    return (out || new THREE.Vector3()).set(
      c.x + ax.x * x + az.x * z, c.y + ax.y * x + az.y * z, c.z + ax.z * x + az.z * z);
  }

  const X = new THREE.Vector3(1, 0, 0), Yv = new THREE.Vector3(0, 1, 0),
        Z = new THREE.Vector3(0, 0, 1);

  /* A ring from a profile row, as S+1 points (the last repeats the
     first, for the UV seam). `arc` limits it to part of a turn. */
  function ring(c, ax, az, w, f, b, n, tp, S, disp, arc) {
    const pts = [];
    const a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : TAU;
    for (let k = 0; k <= S; k++) {
      const th = a0 + (a1 - a0) * (k / S);
      const P = ringPoint(c, ax, az, w, f, b, n, tp, th);
      if (disp) disp(P, th, k);
      pts.push(P);
    }
    return { pts, c: c.clone() };
  }

  /* ---------------- the loft ----------------
     rings: [{ pts:[V3 × S+1], c:V3 }], all the same length.
     o.wt(P, j, k) → weights, o.tag(P, j, k) → tag, o.col(P) → rgb,
     o.skip(j, k) → leave the quad between ring j and j+1 at k open,
     o.closed: the ring is a full turn (seam normals are averaged). */
  function loft(B, rings, o) {
    const v0 = B.count, i0 = B.ix.length;
    const S = rings[0].pts.length - 1;
    const base = [];
    let vAcc = 0;
    for (let j = 0; j < rings.length; j++) {
      const R = rings[j];
      if (j > 0) vAcc += R.c.distanceTo(rings[j - 1].c);
      base.push(B.count);
      let uAcc = 0;
      for (let k = 0; k <= S; k++) {
        const P = R.pts[k];
        if (k > 0) uAcc += P.distanceTo(R.pts[k - 1]);
        const tg = R.tags ? R.tags[k] : o.tag ? o.tag(P, j, k) : 0;
        B.add(P, uAcc / TILE, vAcc / TILE, o.wt(P, j, k), tg, o.col ? o.col(P, j, k) : null);
      }
    }
    for (let j = 0; j < rings.length - 1; j++) {
      for (let k = 0; k < S; k++) {
        if (o.skip && o.skip(j, k)) continue;
        const a = base[j] + k, b = a + 1, c = base[j + 1] + k, d = c + 1;
        B.tri(a, c, b);
        B.tri(b, c, d);
      }
    }
    B.normals(v0, i0);
    // inside out? the sum of normals against the ring centres says
    let dot = 0;
    for (let j = 0; j < rings.length; j++) {
      const c = rings[j].c, cy = SK().remap(c.y, B.rigid);     // the points are at real heights
      for (let k = 0; k < S; k += Math.max(1, S >> 3)) {
        const i = base[j] + k;
        dot += B.n[i * 3] * (B.p[i * 3] - c.x) + B.n[i * 3 + 1] * (B.p[i * 3 + 1] - cy)
             + B.n[i * 3 + 2] * (B.p[i * 3 + 2] - c.z);
      }
    }
    if ((dot < 0) !== !!o.inward) B.flip(v0, i0);
    for (let j = 0; j < rings.length; j++) {
      const R = rings[j];
      // a ring shrunk to a point is a pole: one normal, along the axis
      let size = 0;
      for (const P of R.pts) size = Math.max(size, P.distanceTo(R.c));
      if (size < 1e-5) {
        const list = [];
        for (let k = 0; k <= S; k++) list.push(base[j] + k);
        const nb = rings[j === 0 ? 1 : j - 1].c;
        const ax = R.c.clone().sub(nb).normalize();
        if (o.inward) ax.negate();
        for (const i of list) { B.n[i * 3] = ax.x; B.n[i * 3 + 1] = ax.y; B.n[i * 3 + 2] = ax.z; }
      } else if (o.closed !== false) {
        B.averageNormals([base[j], base[j] + S]);
      }
    }
    return { v0, base, S };
  }

  /* A finished primitive, transformed into place and given weights. */
  function addGeom(B, geo, mat, wt, tag, col) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(mat);
    const P = new THREE.Vector3(), N = new THREE.Vector3();
    const v0 = B.count;
    for (let i = 0; i < p.count; i++) {
      P.fromBufferAttribute(p, i).applyMatrix4(mat);
      N.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      const w = typeof wt === 'function' ? wt(P) : wt;
      B.add(P, (P.x + P.z) / TILE, P.y / TILE, w, typeof tag === 'function' ? tag(P) : tag,
            typeof col === 'function' ? col(P) : col);
      const k = (B.count - 1) * 3;
      B.n[k] = N.x; B.n[k + 1] = N.y; B.n[k + 2] = N.z;
    }
    for (let i = v0; i < B.count; i += 3) B.tri(i, i + 1, i + 2);
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  /* A tube along a path of points, with a ring per point. `rad(t)`
     returns [half-width across, half-depth along the normal]; `nrm(t,
     P, T)` the ring's outward reference direction. */
  function tube(B, path, S, rad, o) {
    const rings = [];
    const n = path.length;
    for (let i = 0; i < n; i++) {
      const P = path[i];
      const T = path[Math.min(n - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize();
      const t = i / (n - 1);
      let N = o.nrm ? o.nrm(t, P, T) : Yv.clone();
      N = N.clone().sub(T.clone().multiplyScalar(N.dot(T))).normalize();
      const Bn = new THREE.Vector3().crossVectors(T, N).normalize();
      const [rw, rd] = rad(t);
      rings.push(ring(P, Bn, N, rw, rd, rd, o.n || 2, 0, S));
    }
    return loft(B, rings, o);
  }

  /* ---------------- the head ----------------
     Head rows: [y, w, f, b, taper, n] — half-width, front and back
     extents about z = 0. Two runs that meet at the mouth line, so the
     mouth can open: the ring there is built twice, once on the jaw and
     once on the skull, and the front of the seam between them is left
     open. Closed, the two rings coincide.

     The head is a toy's, not an anatomy lesson: nearly a ball, full and
     round in the cheeks, no jaw to speak of. The realistic skull — a
     nose, sockets, lips, cheekbones — read as uncanny on a person this
     simple however far it was softened, so it is gone. `figure.js`
     grows the head to a big one on a small body. */
  const HEAD_Y0 = 1.486, HEAD_Y1 = 1.722, HEAD_YC = 1.598;
  const supE = (u, q) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(u)), q)), 1 / q);
  function headRow(y) {
    const up = y > HEAD_YC;
    const u = (y - HEAD_YC) / (up ? HEAD_Y1 - HEAD_YC : HEAD_YC - HEAD_Y0);
    // fuller below the middle, where the cheeks are; rounder over the crown
    const k = supE(u, up ? 2.15 : 2.7);
    const cheek = up ? 0 : 0.006 * gauss(u + 0.45, 0.35);
    return [y, 0.091 * k + cheek, 0.090 * k + cheek * 0.6, 0.096 * supE(u, up ? 2.3 : 2.4), 0, 2.15];
  }
  function headRun(y0, y1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      // closer together near the poles, where the curve turns fastest,
      // and evenly at the mouth line so the two runs meet without a kink
      const t = i / n;
      const e = y0 === HEAD_Y0 ? Math.pow(t, 1.5) : 1 - Math.pow(1 - t, 1.5);
      out.push(headRow(lerp(y0, y1, e)));
    }
    return out;
  }
  const HEAD_LOW = headRun(HEAD_Y0, 1.542, 8);       // to the mouth line, SK.Y.mouth
  const HEAD_HIGH = headRun(1.542, HEAD_Y1, 14);
  const HEAD_ALL = HEAD_LOW.concat(HEAD_HIGH.slice(1));
  /* The eye: radius across, and how much of that it keeps in depth. */
  const EYE_R = 0.0168, EYE_FLAT = 0.55;
  /* The old head was this much narrower; things sized by hand to sit
     on it (a hat's crown, a cap's peak, braids) grow by it. */
  const HEAD_K = 1.18;
  /* Sleeves and trouser legs a size fuller than tailoring: under a big
     head, slim limbs read as spindly. */
  const ARM_K = 1.14, LEG_K = 1.2;

  /* Face shapes: small multipliers on the profile, chosen in the lobby.
     On a round head they are only a hint: a squarer chin, fuller
     cheeks, a longer face. */
  const FACES = [
    { id: 'oval',   jaw: 1.00, cheek: 1.00, nose: 1.00, chin: 1.00, brow: 1.00 },
    { id: 'square', jaw: 1.06, cheek: 1.00, nose: 1.05, chin: 1.10, brow: 1.10 },
    { id: 'heart',  jaw: 0.95, cheek: 1.04, nose: 0.92, chin: 0.90, brow: 0.95 },
    { id: 'round',  jaw: 1.04, cheek: 1.08, nose: 0.90, chin: 0.95, brow: 0.90 },
    { id: 'long',   jaw: 0.97, cheek: 0.97, nose: 1.10, chin: 1.05, brow: 1.05 },
  ];

  function headRows(rows, D, face) {
    return rows.map(r => {
      const [y, w, f, b, tp, n] = r;
      const low = ss(1.57, 1.50, y);           // the jaw
      const mid = gauss(y - 1.562, 0.03);      // the cheeks
      const wk = 1 + (face.jaw - 1) * low + (face.cheek - 1) * mid;
      // a square face is a squarer section low down
      return [y, w * D.hg * wk, f, b * (1 + (D.hg - 1) * 0.5), tp, n + (face.jaw - 1) * 3 * low];
    });
  }

  /* The features, as a forward push on the front of the head. In
     head-ish world metres; `x` across the face, `y` up it. Only what a
     toy has: a button of a nose, round cheeks, a soft chin. The eyes
     sit on the face rather than in sockets. */
  /* `soft` < 1 is for a coarse head: the nose comes down and spreads
     out, because a grid of a few vertices across cannot carry it. */
  function faceDz(x, y, face, soft = 1) {
    const ax = Math.abs(x);
    const wide = 1 / Math.sqrt(soft);
    let dz = 0;
    // the button nose
    dz += 0.0055 * face.nose * soft * gauss(x, 0.0085 * wide) * gauss(y - 1.566, 0.0075 * wide);
    // the apples of the cheeks
    dz += 0.0040 * face.cheek * gauss(ax - 0.052, 0.020) * gauss(y - 1.556, 0.016);
    // the chin, just a fullness
    dz += 0.0025 * face.chin * gauss(x, 0.025) * gauss(y - 1.508, 0.012);
    return dz;
  }

  /* The front of the bare head at (x, y), before features: where the
     eyes and brows have to sit. */
  function headFrontZ(rows, x, y) {
    const r = rowAt(rows, y);
    const [, w, f, b, tp, n] = r;
    const c = new THREE.Vector3(0, y, 0);
    let best = null, prev = null;
    for (let i = 0; i <= 200; i++) {
      const th = Math.PI * (i / 200);           // +x round the front to -x
      const P = ringPoint(c, X, Z, w, f, b, n, tp, th);
      if (prev && (prev.x - x) * (P.x - x) <= 0) {
        const t = (x - prev.x) / ((P.x - prev.x) || 1);
        best = lerp(prev.z, P.z, t);
        break;
      }
      prev = P;
    }
    return best === null ? f : best;
  }

  /* ---------------- torso ----------------
     Rows: [y, w, f, b, n]. The shoulders are part of the jacket — the
     sleeves come out of them below the seam, as a tailored sleeve does,
     so a raised arm never shows the end of a cylinder. */
  const TORSO = [
    [0.795, 0.160, 0.088, 0.096, 2.4],   // turned in under the hem
    [0.792, 0.186, 0.112, 0.114, 2.4],   // the hem
    [0.840, 0.184, 0.109, 0.114, 2.4],
    [0.900, 0.178, 0.104, 0.110, 2.4],
    [0.970, 0.168, 0.098, 0.100, 2.4],
    [1.050, 0.158, 0.099, 0.088, 2.4],
    [1.130, 0.160, 0.106, 0.088, 2.4],
    [1.210, 0.165, 0.114, 0.092, 2.4],
    [1.280, 0.170, 0.116, 0.095, 2.4],
    [1.330, 0.205, 0.110, 0.097, 2.4],
    [1.370, 0.238, 0.100, 0.096, 2.5],
    [1.395, 0.232, 0.090, 0.091, 2.5],
    [1.415, 0.205, 0.082, 0.085, 2.4],
    [1.435, 0.160, 0.074, 0.078, 2.3],
    [1.452, 0.110, 0.066, 0.071, 2.2],
    [1.466, 0.075, 0.060, 0.068, 2.1],
    [1.496, 0.068, 0.056, 0.066, 2.1],   // the collar's top edge
    [1.493, 0.049, 0.038, 0.058, 2.0],   // folded in to the neck
  ];
  const COAT_SKIRT = [
    [0.490, 0.206, 0.112, 0.124, 2.4],   // turned in
    [0.480, 0.220, 0.122, 0.134, 2.4],   // a long coat's hem
    [0.580, 0.208, 0.116, 0.128, 2.4],
    [0.700, 0.196, 0.110, 0.122, 2.4],
  ];

  function torsoRows(long) {
    return long ? COAT_SKIRT.concat(TORSO.slice(2)) : TORSO;
  }

  /* The jacket's front: where the shirt shows, and the lapels round it. */
  const BUTTON_TOP = 1.14;
  function vHalf(y) {
    if (y >= 1.466) return 0.040;
    if (y <= BUTTON_TOP) return 0;
    return 0.068 * (y - BUTTON_TOP) / (1.466 - BUTTON_TOP);
  }

  /* ---------------- limbs ---------------- */

  const SLEEVE = [   // [y, rx, rz]
    [1.392, 0.044, 0.047],
    [1.376, 0.056, 0.058],
    [1.350, 0.060, 0.062],
    [1.300, 0.056, 0.058],
    [1.220, 0.052, 0.054],
    [1.140, 0.049, 0.050],
    [1.100, 0.047, 0.049],
    [1.030, 0.046, 0.047],
    [0.950, 0.043, 0.044],
    [0.892, 0.041, 0.042],
    [0.880, 0.041, 0.042],   // the cuff's edge
  ];
  const SHIRT_CUFF = [
    [0.884, 0.037, 0.038],
    [0.869, 0.036, 0.037],
    [0.872, 0.024, 0.025],
    [0.874, 0.000, 0.000],
  ];
  const PALM = [     // [y, half-thickness (x), half-width (z), z]
    [0.888, 0.023, 0.025, 0.000],
    [0.866, 0.020, 0.028, 0.002],
    [0.845, 0.018, 0.036, 0.004],
    [0.822, 0.0175, 0.042, 0.004],
    [0.805, 0.0165, 0.044, 0.002],
    [0.795, 0.012, 0.040, 0.000],
    [0.791, 0.000, 0.000, 0.000],
  ];
  const FINGERS = [  // [bone base, z, radius, length, knuckle y]
    ['index', 0.024, 0.0082, 0.082, 0.803],
    ['fing', 0.008, 0.0088, 0.090, 0.803],
    ['fing', -0.008, 0.0083, 0.085, 0.801],
    ['fing', -0.023, 0.0072, 0.068, 0.797],
  ];
  const LEG = [      // [y, rx, rz, z]
    [1.000, 0.066, 0.074, 0.000],
    [0.900, 0.074, 0.080, 0.002],
    [0.800, 0.080, 0.081, 0.004],
    [0.700, 0.072, 0.076, 0.008],
    [0.600, 0.062, 0.066, 0.008],
    [0.500, 0.056, 0.060, 0.010],
    [0.420, 0.057, 0.060, -0.003],
    [0.320, 0.054, 0.057, -0.004],
    [0.220, 0.051, 0.053, 0.000],
    [0.140, 0.052, 0.057, 0.003],
    [0.105, 0.054, 0.061, 0.005],
    [0.110, 0.047, 0.052, 0.005],
  ];
  const SEAT = [     // [y, w, f, b]
    [1.020, 0.150, 0.090, 0.088],
    [0.960, 0.160, 0.092, 0.096],
    [0.900, 0.163, 0.090, 0.103],
    [0.840, 0.158, 0.088, 0.102],
    [0.800, 0.148, 0.082, 0.095],
    [0.778, 0.120, 0.062, 0.074],
    [0.768, 0.070, 0.035, 0.045],
    [0.764, 0.000, 0.000, 0.000],
  ];
  const SHAFT = [    // [y, rx, rz, z]
    [0.180, 0.048, 0.051, 0.000],
    [0.140, 0.050, 0.053, 0.000],
    [0.100, 0.050, 0.055, 0.004],
    [0.070, 0.046, 0.056, 0.010],
  ];
  const FOOT = [     // [z, yc, w, up, down]
    [-0.075, 0.048, 0.000, 0.000, 0.000],
    [-0.071, 0.048, 0.028, 0.034, 0.040],
    [-0.055, 0.050, 0.040, 0.044, 0.045],
    [0.000, 0.052, 0.045, 0.046, 0.047],
    [0.060, 0.043, 0.048, 0.036, 0.038],
    [0.120, 0.034, 0.050, 0.028, 0.029],
    [0.170, 0.031, 0.046, 0.022, 0.026],
    [0.200, 0.029, 0.036, 0.018, 0.024],
    [0.214, 0.029, 0.018, 0.010, 0.016],
    [0.219, 0.029, 0.000, 0.000, 0.000],
  ];
  const NECK = [     // [y, w, f, b]
    [1.400, 0.056, 0.050, 0.060],
    [1.450, 0.052, 0.047, 0.058],
    [1.500, 0.049, 0.040, 0.060],
    [1.530, 0.047, 0.030, 0.062],
    [1.556, 0.044, 0.018, 0.058],
  ];

  /* ---------------- quality ---------------- */

  const LEVELS = [
    { level: 0, seg: 40, sub: 2, head: 52, headSub: 2, limb: 16, hand: 10, finger: 6, eye: 16 },
    { level: 1, seg: 18, sub: 1, head: 30, headSub: 2, limb: 10, hand: 8, finger: 5, eye: 10, soft: 0.6 },
  ];

  /* ---------------- building one figure's surfaces ---------------- */

  const cache = new Map();

  /* `spec`: { girth, long, hair, hat, scarf, face, fringe, brooch }.
     Returns { parts: { skin, coat, legs, hair, features, accent }, eyeZ }
     for one level of detail, cached. */
  function surfaces(spec, level = 0) {
    const key = [level, spec.girth.toFixed(3), spec.long ? 1 : 0, spec.hair, spec.hat,
                 spec.scarf, spec.face || 'oval', spec.fringe ? 1 : 0, spec.brooch ? 1 : 0].join('|');
    if (cache.has(key)) return cache.get(key);
    const out = buildSurfaces(spec, LEVELS[level]);
    cache.set(key, out);
    return out;
  }

  function buildSurfaces(spec, L) {
    const I = SK().INDEX, D = SK().dims(spec.girth);
    const face = FACES.find(f => f.id === spec.face) || FACES[0];
    const g = D.g, gz = D.gz;
    const B = { skin: new Builder(), coat: new Builder(), legs: new Builder(),
                hair: new Builder(), features: new Builder(), accent: new Builder() };
    const side = (x) => (x < 0 ? 'l' : 'r');

    /* ----- torso ----- */
    const tRows = torsoRows(spec.long).map(([y, w, f, b, n]) => [y, w * g, f * gz, b * gz, n]);
    const tMain = tRows.slice(1, -1);
    const torsoAt = (th, y) => {
      const [, w, f, b, n] = rowAt(tMain, y);
      return ringPoint(new THREE.Vector3(0, y, 0), X, Z, w, f, b, n, 0, th);
    };
    const torsoFront = (x, y) => {
      const [, w, f, , n] = rowAt(tMain, y);
      const u = U.clamp(Math.abs(x) / w, 0, 0.999);
      return f * Math.pow(1 - Math.pow(u, n), 1 / n);
    };
    const spineW = (y) => chain(y, [[I.chest, 1.30], [I.spine2, 1.17], [I.spine1, 1.05], [I.pelvis, 0.94]]);
    const torsoWt = (P) => {
      let w = spineW(P.y);
      const ax = Math.abs(P.x), s = side(P.x);
      const arm = ss(0.125 * g, 0.205 * g, ax) * ss(1.27, 1.345, P.y) * (1 - ss(1.43, 1.46, P.y));
      const clav = ss(0.05, 0.14, ax) * ss(1.33, 1.40, P.y) * 0.5 * (1 - arm);
      const front = ss(-0.03, 0.05, P.z);
      let thigh = ss(0.93, 0.78, P.y) * front * (spec.long ? 0.55 : 0.40);
      if (spec.long) thigh = Math.max(thigh, ss(0.80, 0.50, P.y) * (0.35 + 0.4 * front));
      const keep = Math.max(0, 1 - arm * 0.85 - clav - thigh);
      w = w.map(([b, x]) => [b, x * keep]);
      w.push([I['arm_' + s], arm * 0.85], [I['clav_' + s], clav]);
      if (thigh > 0) {
        // the middle of the front goes with both legs
        const k = ss(-0.03, 0.03, P.x);
        w.push([I.thigh_l, thigh * (1 - k)], [I.thigh_r, thigh * k]);
      }
      return w;
    };
    /* The front of the jacket opens in a V over the shirt. Each ring
       gets samples exactly on the lapel's edges — the V edge twice, once
       in coat and once in shirt — so the line is crisp at any ring
       count, and the lapel stands a few millimetres proud of the shirt
       the way a real one does. Below the top button the extra samples
       all collapse onto the centre line and cost nothing. */
    const torsoRing = (y, w, f, b, n) => {
      const c = new THREE.Vector3(0, y, 0);
      const vx = vHalf(y), lap = y > BUTTON_TOP && y < 1.45 ? 0.024 * ss(BUTTON_TOP, BUTTON_TOP + 0.05, y) : 0;
      const thAt = (x) => {
        let lo = 0, hi = Math.PI;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          if (ringPoint(c, X, Z, w, f, b, n, 0, mid).x > x) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
      };
      const ta = thAt(vx + lap), tb = thAt(vx), tc = thAt(-vx), td = thAt(-vx - lap);
      const list = [];
      for (let k = 0; k <= L.seg; k++) list.push([TAU * (k / L.seg), 'u']);
      list.push([ta, 'a'], [tb, 'b'], [tb, 'B'], [tc, 'C'], [tc, 'c'], [td, 'd']);
      const order = { a: 0, b: 1, B: 2, u: 1.5, C: 3, c: 4, d: 5 };
      list.sort((p, q) => p[0] - q[0] || order[p[1]] - order[q[1]]);
      const pts = [], tags = [];
      let inV = false;
      for (const [th, kind] of list) {
        const P = ringPoint(c, X, Z, w, f, b, n, 0, th);
        if (kind === 'B') inV = true;
        const r = Math.hypot(P.x, P.z) || 1;
        let d = 0;
        const front = P.z > 0;
        if (front && vx > 0) {
          const ax = Math.abs(P.x);
          if (inV) d = -0.003;
          else if (lap > 0 && ax < vx + lap + 1e-6) d = 0.0035 * U.clamp((vx + lap - ax) / lap, 0, 1);
        }
        if (front && y < BUTTON_TOP && y > (spec.long ? 0.49 : 0.80)) d -= 0.0015 * gauss(P.x, 0.0025);
        P.x += (P.x / r) * d; P.z += (P.z / r) * d;
        pts.push(P);
        tags.push(inV ? 1 : 0);
        if (kind === 'C') inV = false;
      }
      return { pts, c, tags };
    };
    {
      const rows = sampleEnds(tRows, L.sub, 1, 1);
      loft(B.coat, rows.map(([y, w, f, b, n]) => torsoRing(y, w, f, b, n)), { wt: torsoWt });
    }
    // buttons, and pocket flaps, laid on the front
    {
      const ys = spec.long ? [1.105, 0.99, 0.875, 0.76, 0.645] : [1.105, 1.015];
      for (const y of ys) {
        const z = torsoFront(0, y);
        const geo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.004, 10).rotateX(Math.PI / 2);
        addGeom(B.coat, geo, new THREE.Matrix4().makeTranslation(0, y, z + 0.002),
                torsoWt(new THREE.Vector3(0, y, z)), 2);
      }
      for (const s of [-1, 1]) {
        const y = spec.long ? 0.86 : 0.93, x = s * 0.095 * g;
        const z = torsoFront(x, y);
        const yaw = -Math.atan2(torsoFront(x + 0.01, y) - torsoFront(x - 0.01, y), 0.02);
        const geo = new THREE.BoxGeometry(0.100 * g, 0.024, 0.004);
        const m = new THREE.Matrix4().makeRotationY(yaw)
          .premultiply(new THREE.Matrix4().makeTranslation(x, y, z + 0.002));
        addGeom(B.coat, geo, m, torsoWt(new THREE.Vector3(x, y, z)), 0);
      }
    }

    /* ----- sleeves and hands ----- */
    // the arms only come down with the shoulders; the short legs do not squeeze them
    B.coat.rigid = B.skin.rigid = true;
    for (const [k, s] of SK().SIDES) {
      const cx = s * D.armX;
      const armW = (P) => {
        let w = chain(P.y, [[I['arm_' + k], 1.19], [I['fore_' + k], 1.02]]);
        const top = ss(1.345, 1.39, P.y);
        if (top > 0) w = mixW(w, [[I['clav_' + k], 0.4], [I.chest, 0.6]], top * 0.25);
        return w;
      };
      const sl = sample(SLEEVE, L.sub).map(([y, rx, rz]) =>
        ring(new THREE.Vector3(cx, y, -0.008), X, Z, rx * ARM_K, rz * ARM_K, rz * ARM_K, 2.1, 0, L.limb));
      loft(B.coat, sl, { wt: armW, tag: () => 0 });
      const cuff = SHIRT_CUFF.map(([y, rx, rz]) =>
        ring(new THREE.Vector3(cx, y, -0.008), X, Z, rx * ARM_K, rz * ARM_K, rz * ARM_K, 2.0, 0, L.limb));
      loft(B.coat, cuff, { wt: armW, tag: () => 1 });

      // the palm: thickness across x (it faces the thigh), width along z
      const handW = (P) => chain(P.y, [[I['fore_' + k], 0.885], [I['hand_' + k], 0.855]]);
      const palm = sample(PALM, L.sub > 1 ? 2 : 1).map(([y, hx, hz, z]) =>
        ring(new THREE.Vector3(cx, y, z), X, Z, hx, hz, hz, 2.6, 0, L.hand));
      loft(B.skin, palm, { wt: handW });

      for (const [bone, z, r, len, ky] of FINGERS) {
        const fx = cx - s * 0.003;
        const tip = ky - len, mid = ky - len * 0.5;
        const rows = [[ky + 0.006, r], [ky - 0.004, r], [mid, r * 0.93], [tip + r * 0.9, r * 0.84],
                      [tip + r * 0.35, r * 0.6], [tip, 0]];
        const fr = rows.map(([y, rr]) =>
          ring(new THREE.Vector3(fx, y, z), X, Z, rr * 0.92, rr, rr, 2.0, 0, L.finger));
        const b1 = I[bone + '1_' + k], b2 = I[bone + '2_' + k];
        loft(B.skin, fr, { wt: (P) => chain(P.y, [[I['hand_' + k], ky + 0.002], [b1, ky - 0.010],
                                                  [b1, mid + 0.006], [b2, mid - 0.006]]) });
      }
      // the thumb, angled down and forward off the heel of the palm
      {
        const a = new THREE.Vector3(cx - s * 0.006, 0.866, 0.016);
        const b = new THREE.Vector3(cx - s * 0.016, 0.786, 0.046);
        const path = [];
        for (let i = 0; i <= 5; i++) path.push(a.clone().lerp(b, i / 5));
        const T = b.clone().sub(a).normalize();
        const along = (P) => P.clone().sub(a).dot(T) / b.distanceTo(a);
        tube(B.skin, path, L.finger, (t) => {
          const r = t > 0.97 ? 0 : t > 0.88 ? 0.0105 * Math.sqrt((0.97 - t) / 0.09) : lerp(0.0135, 0.0105, t);
          return [r, r * 0.9];
        }, {
          nrm: () => new THREE.Vector3(-s, 0, 0),
          wt: (P) => chain(-along(P), [[I['hand_' + k], -0.15], [I['thumb1_' + k], -0.32],
                                       [I['thumb1_' + k], -0.50], [I['thumb2_' + k], -0.62]]),
        });
      }
    }

    B.coat.rigid = B.skin.rigid = false;

    /* ----- trousers and boots ----- */
    {
      const rows = sample(SEAT, L.sub).map(([y, w, f, b]) =>
        ring(new THREE.Vector3(0, y, 0), X, Z, w * g, f * gz, b * gz, 2.4, 0, L.seg));
      loft(B.legs, rows, { wt: (P) => {
        const t = ss(0.92, 0.79, P.y) * 0.55 * ss(0.01, 0.06, Math.abs(P.x));
        return [[I.pelvis, 1 - t], [I['thigh_' + side(P.x)], t]];
      } });
    }
    for (const [k, s] of SK().SIDES) {
      const xAt = (y) => s * lerp(D.hipX, D.ankleX, U.clamp((SK().Y.hip - y) / (SK().Y.hip - SK().Y.ankle), 0, 1));
      const wt = (P) => chain(P.y, [[I.pelvis, 0.97], [I['thigh_' + k], 0.83], [I['thigh_' + k], 0.54],
                                    [I['shin_' + k], 0.43], [I['shin_' + k], 0.15], [I['foot_' + k], 0.085]]);
      // fuller toward the ankle, so the legs are sturdy rather than long
      const lk = (y) => lerp(LEG_K, 1.06, ss(0.75, 0.95, y));
      const lr = sampleEnds(LEG, L.sub, 0, 1).map(([y, rx, rz, z]) =>
        ring(new THREE.Vector3(xAt(y), y, z), X, Z, rx * g * lk(y), rz * gz * lk(y), rz * gz * lk(y), 2.1, 0, L.limb));
      loft(B.legs, lr, { wt });
      const sh = SHAFT.map(([y, rx, rz, z]) =>
        ring(new THREE.Vector3(xAt(y), y, z), X, Z, rx * g * LEG_K, rz * LEG_K, rz * LEG_K, 2.2, 0, L.limb));
      loft(B.legs, sh, { wt, tag: () => 1 });
      const fx = s * D.ankleX;
      const fr = sample(FOOT, L.sub > 1 ? 2 : 1).map(([z, yc, w, up, down]) =>
        ring(new THREE.Vector3(fx + s * 0.06 * Math.max(0, z) * 0.15, yc, z), X, Yv,
             w * (0.94 + 0.06 * g), up, down, 2.8, 0, L.limb));
      loft(B.legs, fr, {
        wt: (P) => { const t = ss(0.09, 0.15, P.z); return [[I['foot_' + k], 1 - t], [I['toe_' + k], t]]; },
        tag: (P) => (P.y < 0.013 ? 2 : 1),
      });
    }

    /* ----- neck and head ----- */
    {
      const rows = sample(NECK, L.sub).map(([y, w, f, b]) =>
        ring(new THREE.Vector3(0, y, -0.012), X, Z, w * (1 + (g - 1) * 0.5), f, b, 2.1, 0, L.limb + 4));
      loft(B.skin, rows, { wt: (P) => chain(P.y, [[I.head, 1.545], [I.neck, 1.49], [I.chest, 1.43]]) });
    }
    const hLow = headRows(HEAD_LOW, D, face), hHigh = headRows(HEAD_HIGH, D, face);
    const hAll = hLow.concat(hHigh.slice(1));
    /* The eyes are flattened domes sitting on the face, turned a little
       to follow its curve, and nearly all iris: big, dark and glossy,
       with the white only showing at a sideways glance. */
    const MY = SK().Y.mouth, EY = SK().Y.eye;
    const eyeX = SK().EYE_X * D.hg, eyeR = EYE_R, eyeZr = EYE_R * EYE_FLAT;
    const eyeFront = (x) => headFrontZ(hAll, x, EY) + faceDz(x, EY, face);
    const eyeZ = eyeFront(eyeX) - eyeZr * 0.45;
    const eyeYaw = 0.7 * Math.atan(-(eyeFront(eyeX + 0.003) - eyeFront(eyeX - 0.003)) / 0.006);
    const mouthHalf = 0.0150;
    const blush = [1.0, 0.64, 0.64];
    // round pink cheeks, a toy's; the mouth itself is a drawn line, below
    const headCol = (P) => {
      const c = 0.66 * gauss(Math.abs(P.x) - 0.053, 0.0125) * gauss(P.y - 1.561, 0.0085) * ss(0.03, 0.06, P.z);
      return [0, 1, 2].map(i => lerp(1, blush[i], c));
    };
    const soft = L.soft || 1;
    const headDisp = (P) => {
      const front = ss(0.02, 0.06, P.z);
      if (front > 0) P.z += faceDz(P.x, P.y, face, soft) * front;
    };
    const headWt = (jawSide) => (P) => {
      let w = [[I.head, 1]];
      // only the very bottom of the ball goes with the neck
      const nk = ss(1.515, 1.490, P.y) * ss(0.0, -0.03, P.z);
      if (nk > 0) w = mixW(w, [[I.neck, 1]], nk);
      if (jawSide) {
        const j = ss(-0.035, 0.02, P.z) * (1 - nk);
        w = mixW(w, [[I.jaw, 1]], j);
      } else {
        // the cheeks either side of the mouth stretch with the jaw a little
        const j = 0.3 * gauss(P.y - MY, 0.010) * ss(0.012, 0.026, Math.abs(P.x)) * ss(0.03, 0.06, P.z);
        if (j > 0) w = mixW(w, [[I.jaw, 1]], j);
      }
      // the corners of the mouth have bones of their own, to smile with
      const s = side(P.x);
      const mc = 0.85 * gauss(Math.abs(P.x) - mouthHalf, 0.008) * gauss(P.y - MY, 0.008) * ss(0.04, 0.07, P.z);
      if (mc > 0.01) w = mixW(w, [[I['mouth_' + s], 1]], mc);
      return w;
    };
    let lowBase = null;
    {
      const rows = sample(hLow, L.headSub);
      const rings = rows.map(([y, w, f, b, tp, n]) =>
        ring(new THREE.Vector3(0, y, 0), X, Z, w, f, b, n, tp, L.head, headDisp));
      const r = loft(B.skin, rings, { wt: headWt(true), col: headCol });
      lowBase = r;
      const rows2 = sample(hHigh, L.headSub);
      const rings2 = rows2.map(([y, w, f, b, tp, n]) =>
        ring(new THREE.Vector3(0, y, 0), X, Z, w, f, b, n, tp, L.head, headDisp));
      const r2 = loft(B.skin, rings2, { wt: headWt(false), col: headCol });
      /* Stitch the jaw's last ring to the skull's first, except across
         the mouth: that open seam is the mouth. */
      const jl = r.base[r.base.length - 1], sk = r2.base[0];
      const S = L.head;
      for (let k = 0; k < S; k++) {
        const th = TAU * ((k + 0.5) / S);
        const xm = Math.cos(th) * hLow[hLow.length - 1][1];
        if (Math.sin(th) > 0.5 && Math.abs(xm) < mouthHalf) continue;
        const a = jl + k, b = a + 1, c = sk + k, d = c + 1;
        B.skin.tri(a, c, b); B.skin.tri(b, c, d);
      }
      for (let k = 0; k <= S; k++) {
        const th = TAU * (k / S);
        const xm = Math.cos(th) * hLow[hLow.length - 1][1];
        if (Math.sin(th) > 0.3 && Math.abs(xm) < mouthHalf + 0.004) continue;
        B.skin.averageNormals([jl + k, sk + k]);
      }
    }
    // ears: plain round nubs, and none under hair that hangs over them
    const earsHidden = spec.hair === 'bob' || spec.hair === 'long';
    for (const [k, s] of earsHidden ? [] : SK().SIDES) {
      const y = 1.586, w = rowAt(hHigh, y)[1];
      const geo = new THREE.SphereGeometry(1, 14, 10);
      geo.scale(0.011, 0.021, 0.018);
      const m = new THREE.Matrix4().makeRotationY(s * 0.3)
        .premultiply(new THREE.Matrix4().makeTranslation(s * (w + 0.001), y, -0.008));
      addGeom(B.skin, geo, m, [[I.head, 1]], 0, [0.97, 0.84, 0.82]);
    }

    /* ----- eyes, mouth ----- */
    /* No lids: a blink squashes the eye flat on its bone, the way a
       cartoon's does (`figure-anim.js`). Latitude bands from the front
       pole — pupil, iris, the iris's dark rim, white — and two glints
       of light, both from the upper left on either eye. */
    for (const [k, s] of SK().SIDES) {
      const M = new THREE.Matrix4().makeRotationY(s * eyeYaw)
        .premultiply(new THREE.Matrix4().makeTranslation(s * eyeX, EY, eyeZ));
      const eyeWt = () => [[I['eye_' + k], 1]];
      const bands = [[0, 0.46, 2], [0.46, 0.86, 1], [0.86, 1.28, 5], [1.28, Math.PI, 0]];
      for (const [a0, a1, tag] of bands) {
        const n = tag === 0 ? Math.max(4, L.eye >> 1) : 3;
        const rings = [];
        for (let i = 0; i <= n; i++) {
          const a = lerp(a0, a1, i / n);
          const r = Math.sin(a) * eyeR;
          const R = ring(new THREE.Vector3(0, 0, Math.cos(a) * eyeZr), X, Yv, r, r, r, 2, 0, L.eye);
          R.pts.forEach(P => P.applyMatrix4(M));
          R.c.applyMatrix4(M);
          rings.push(R);
        }
        loft(B.features, rings, { wt: eyeWt, tag: () => tag });
      }
      for (const [gx, gy, gr] of [[-0.34, 0.36, 0.27], [0.30, -0.30, 0.12]]) {
        const gz = eyeZr * Math.sqrt(Math.max(0, 1 - gx * gx - gy * gy)) + 0.0004;
        const geo = new THREE.SphereGeometry(gr * eyeR, 10, 6);
        geo.scale(1, 1, 0.35);
        addGeom(B.features, geo, new THREE.Matrix4().makeTranslation(gx * eyeR, gy * eyeR, gz).premultiply(M),
                eyeWt, 6);
      }
    }
    {
      // a small dark mouth behind the seam, seen when it opens; no teeth
      const mz = headFrontZ(hAll, 0, MY) + faceDz(0, MY, face);
      const c = new THREE.Vector3(0, MY - 0.002, mz - 0.014);
      const geo = new THREE.SphereGeometry(1, 16, 10);
      geo.scale(0.016, 0.010, 0.012);
      flipIndex(geo);
      addGeom(B.features, geo, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z),
              (P) => (P.y > MY - 0.001 ? [[I.head, 1]] : [[I.jaw, 1]]), 3);
      /* The mouth, drawn: a little curve along the upper lip, ends up in
         a smile. Its ends ride the corner bones, so a mood bends it and a
         frown turns it over; when the jaw drops, the dark inside shows
         under it. A painted line cannot do this — there are only a few
         vertices across the mouth. */
      const path = [];
      for (let i = 0; i <= 10; i++) {
        const u = lerp(-1, 1, i / 10), x = u * mouthHalf;
        const y = MY + 0.0004 + 0.0030 * u * u;
        path.push(new THREE.Vector3(x, y, headFrontZ(hAll, Math.abs(x), y) + faceDz(x, y, face) + 0.0009));
      }
      tube(B.features, path, 6, (t) => [0.0013 * (0.55 + 0.45 * Math.sin(Math.PI * t)), 0.0008], {
        nrm: () => Z.clone(),
        wt: (P) => {
          const k = 0.85 * ss(0.25, 1.0, Math.abs(P.x) / mouthHalf);
          return mixW([[I.head, 1]], [[I['mouth_' + side(P.x)], 1]], k);
        },
        tag: () => 3,
      });
    }

    /* ----- hair and brows ----- */
    const headRing = (y, off) => {
      const [, w, f, b, tp, n] = rowAt(hAll, y);
      return { w: w + off, f: f + off, b: b + off, tp, n };
    };
    buildHair(B.hair, spec, hAll, headRing, I, L, D);
    for (const [k, s] of SK().SIDES) {
      const path = [];
      // short, soft and rounded at both ends
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const x = s * lerp(0.024, 0.050, t) * D.hg;
        const y = SK().Y.brow + 0.0030 * Math.sin(Math.PI * t) - 0.002 * t;
        const z = headFrontZ(hAll, Math.abs(x), y) + faceDz(x, y, face) + 0.0012;
        path.push(new THREE.Vector3(x, y, z));
      }
      tube(B.hair, path, 6, (t) => [0.0034 * Math.sqrt(Math.max(0.12, Math.sin(Math.PI * t))), 0.0014], {
        nrm: () => Z.clone(), wt: () => [[I['brow_' + k], 1]],
      });
    }

    /* ----- hats, scarves, a brooch ----- */
    buildHat(B.accent, spec, hAll, headRing, I, L);
    buildNeckwear(B.accent, spec, { tRows, torsoAt, torsoFront, torsoWt, I, L, g, gz });
    if (spec.brooch) {
      const x = -0.078 * g, y = 1.345, z = torsoFront(x, y);
      const geo = new THREE.SphereGeometry(0.011, 10, 8);
      geo.scale(1, 1, 0.45);
      addGeom(B.accent, geo, new THREE.Matrix4().makeTranslation(x, y, z + 0.004),
              torsoWt(new THREE.Vector3(x, y, z)), 0);
    }

    const parts = {};
    for (const k in B) parts[k] = B[k].count ? B[k].geometry() : null;
    return { parts, eyeZ };
  }

  function flipIndex(geo) {
    const ix = geo.index;
    if (!ix) return geo;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /* ---------------- hair ----------------
     A shell over the head that thins to nothing at the hairline and
     sinks under the skin past it, so there is never an edge to see. The
     hairline is a height per angle round the head, measured from the
     front: forehead, temples, the sideburn, over the ear, the nape. */
  const HAIRLINE = [
    [0.00, 1.668], [0.55, 1.655], [0.95, 1.632], [1.18, 1.604], [1.34, 1.603],
    [1.45, 1.630], [1.80, 1.628], [2.10, 1.578], [2.60, 1.546], [Math.PI, 1.536],
  ];
  function hairlineAt(a, fringe) {
    let y = HAIRLINE[HAIRLINE.length - 1][1];
    for (let i = 1; i < HAIRLINE.length; i++) {
      if (a <= HAIRLINE[i][0]) {
        const [a0, y0] = HAIRLINE[i - 1], [a1, y1] = HAIRLINE[i];
        y = lerp(y0, y1, (a - a0) / (a1 - a0));
        break;
      }
    }
    if (fringe) y -= 0.03 * gauss(a, 0.75);
    return y;
  }

  /* A point on the bare head at (θ, y), pushed out from the head's
     centre by `off`. */
  const HEAD_C = new THREE.Vector3(0, 1.612, -0.004);
  function shellOf(rows) {
    const dense = sample(rows.filter(r => r[0] >= 1.525), 6);
    return (th, y, off) => {
      const [, w, f, b, tp, n] = rowAt(dense, y);
      const P = ringPoint(new THREE.Vector3(0, y, 0), X, Z, w, f, b, n, tp, th);
      const d = P.clone().sub(HEAD_C);
      const l = d.length() || 1;
      return P.addScaledVector(d, off / l);
    };
  }

  /* The angle from the front of the face, 0..π, for a ring angle θ. */
  const fromFront = (th) => {
    const d = Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2));
    return Math.abs(d);
  };

  function buildHair(B, spec, rows, headRing, I, L, D) {
    const headShell = shellOf(rows);
    const style = spec.hair;
    const S = L.head;
    const thick = {
      bald: 0.0012, crop: 0.0035, short: 0.008, bob: 0.012, long: 0.010,
      bun: 0.007, tail: 0.006, braids: 0.0065,
    }[style] || 0.008;
    /* The shell is the bare head pushed out from its centre — along
       the surface's normal near enough on an egg. Its rings are laid
       from the hairline up, the first exactly on it and a lip tucked
       under the skin just below, so the hairline is a clean curve at
       any ring count rather than a staircase where a mask crossed the
       grid. Over the crown the push is straight up and the top of a
       head of hair is round. */
    const crownY = rows[rows.length - 1][0];
    const hlAt = (th) => hairlineAt(fromFront(th), spec.fringe);
    const offAt = (th, y, edge) => {
      const a = fromFront(th);
      let t = thick;
      if (style === 'short') t += 0.005 * ss(1.64, 1.71, y) + 0.004 * gauss(a, 0.6) * ss(1.65, 1.69, y);
      if (style === 'crop') t += 0.0015 * ss(1.65, 1.71, y);
      return t * (0.45 + 0.55 * ss(0, 0.012, edge));
    };
    const N = L.level === 1 ? 10 : 22;
    const us = [-1];
    for (let i = 0; i <= N; i++) us.push(Math.pow(i / N, 1.35));
    const rings = [];
    for (const u of us) {
      const pts = [];
      for (let k = 0; k <= S; k++) {
        const th = TAU * (k / S);
        const hl = hlAt(th);
        if (u < 0) { pts.push(headShell(th, hl - 0.004, -0.0025)); continue; }
        const y = u >= 1 ? crownY : lerp(hl, crownY, u);
        pts.push(headShell(th, y, offAt(th, y, y - hl)));
      }
      rings.push({ pts, c: new THREE.Vector3(0, pts[0].y, 0) });
    }
    const hairWt = (P) => {
      const k = ss(1.52, 1.45, P.y);
      return k > 0 ? [[I.head, 1 - k], [I.chest, k]] : [[I.head, 1]];
    };
    loft(B, rings, { wt: hairWt });

    /* Hair that hangs: a curtain round the back and sides, closed as a
       thin crescent so it has an inside and an outside. */
    const drape = (yTop, yEnd, a0Top, a0End, outFn, t = 0.010) => {
      const N = L.level === 1 ? 8 : 20;
      const cs = [];
      for (let i = 0; i <= N; i++) {
        const y = lerp(yTop, yEnd, i / N);
        const a0 = lerp(a0Top, a0End, i / N);
        const SA = Math.max(8, S >> 1);
        const outer = [], inner = [];
        for (let k = 0; k <= SA; k++) {
          // from one side's front edge, round the back, to the other's
          const th = Math.PI / 2 + a0 + (TAU - 2 * a0) * (k / SA);
          const [w, f, b, tp, nn] = outFn(y);
          outer.push(ringPoint(new THREE.Vector3(0, y, -0.004), X, Z, w, f, b, nn, tp, th));
          inner.push(ringPoint(new THREE.Vector3(0, y, -0.004), X, Z, w - t, f - t, b - t, nn, tp, th));
        }
        const pts = outer.concat(inner.reverse());
        pts.push(pts[0].clone());
        cs.push({ pts, c: new THREE.Vector3(0, y, -0.004) });
      }
      loft(B, cs, { wt: hairWt });
    };
    const widest = headRing(1.605, 0);
    if (style === 'bob') {
      drape(1.628, 1.528, 1.05, 1.10, (y) => {
        const r = headRing(Math.max(y, 1.60), 0), fl = 0.006 * ss(1.58, 1.53, y);
        return [Math.max(r.w, widest.w * 0.98) + 0.013 + fl, r.f + 0.012, Math.max(r.b, widest.b * 0.96) + 0.013 + fl, 0, 2.2];
      }, 0.011);
    }
    if (style === 'long') {
      drape(1.630, 1.320, 1.10, 1.75, (y) => {
        const r = headRing(Math.max(y, 1.60), 0);
        const below = ss(1.52, 1.42, y);
        const w = lerp(Math.max(r.w, widest.w * 0.98) + 0.013, 0.105, below);
        const b = Math.max(lerp(Math.max(r.b, widest.b * 0.96) + 0.013, 0.112, below),
                           0.104 + 0.02 * ss(1.40, 1.33, y));
        return [w, r.f + 0.012, b, 0, 2.2];
      }, 0.012);
    }
    if (spec.fringe) {
      const N = L.level === 1 ? 4 : 8, SA = Math.max(8, S >> 2);
      const cs = [];
      for (let i = 0; i <= N; i++) {
        const y = lerp(1.692, 1.636, i / N);
        const r = headRing(y, 0);
        const outer = [], inner = [];
        for (let k = 0; k <= SA; k++) {
          const th = Math.PI / 2 - 1.05 + 2.1 * (k / SA);
          const fall = gauss(th - Math.PI / 2, 0.9);
          const yy = y - 0.004 * (1 - fall);
          outer.push(ringPoint(new THREE.Vector3(0, yy, 0), X, Z, r.w + 0.012, r.f + 0.013, r.b, r.n, r.tp, th));
          inner.push(ringPoint(new THREE.Vector3(0, yy, 0), X, Z, r.w + 0.003, r.f + 0.004, r.b, r.n, r.tp, th));
        }
        const pts = outer.concat(inner.reverse());
        pts.push(pts[0].clone());
        cs.push({ pts, c: new THREE.Vector3(0, y, 0) });
      }
      loft(B, cs, { wt: () => [[I.head, 1]] });
    }
    if (style === 'bun') {
      const geo = new THREE.SphereGeometry(1, 16, 12);
      geo.scale(0.043, 0.039, 0.041);
      addGeom(B, geo, new THREE.Matrix4().makeTranslation(0, 1.690, -0.090), [[I.head, 1]], 0);
    }
    if (style === 'tail') {
      const path = [[0, 1.652, -0.090], [0, 1.632, -0.118], [0, 1.590, -0.128], [0, 1.540, -0.126],
                    [0, 1.490, -0.116], [0, 1.455, -0.106]].map(p => new THREE.Vector3(...p));
      tube(B, path, 10, (t) => {
        const r = t > 0.94 ? 0.012 * Math.sqrt(Math.max(0, 1 - t) / 0.06) : t < 0.12 ? lerp(0.018, 0.024, t / 0.12)
                : lerp(0.026, 0.014, (t - 0.12) / 0.82);
        return [r, r * 0.85];
      }, { nrm: () => new THREE.Vector3(0, 0, -1),
           wt: (P) => { const k = ss(1.56, 1.47, P.y) * 0.6; return [[I.head, 1 - k], [I.neck, k]]; } });
    }
    if (style === 'braids') {
      for (const s of [-1, 1]) {
        const path = [[0.070, 1.588, -0.032], [0.086, 1.525, -0.012], [0.108, 1.458, 0.040],
                      [0.108, 1.400, 0.098], [0.101, 1.340, 0.122], [0.095, 1.285, 0.128]]
          .map(([x, y, z]) => new THREE.Vector3(s * x * D.hg * (y > 1.47 ? HEAD_K : lerp(1, HEAD_K, ss(1.30, 1.47, y))), y, z));
        const smooth = sample(path.map(v => [v.x, v.y, v.z]), 4).map(r => new THREE.Vector3(...r));
        tube(B, smooth, 9, (t) => {
          const r = (t > 0.96 ? 0.6 : 1) * lerp(0.016, 0.011, t) * (1 + 0.14 * Math.cos(t * 22 * Math.PI));
          return [r, r];
        }, { nrm: () => new THREE.Vector3(s, 0, 0),
             wt: (P) => { const k = ss(1.52, 1.45, P.y); return [[I.head, 1 - k], [I.chest, k]]; } });
      }
    }
  }

  /* ---------------- hats ---------------- */
  function buildHat(B, spec, rows, headRing, I, L) {
    const style = spec.hat;
    if (!style || style === 'none') return;
    const S = L.head;
    const crownY = rows[rows.length - 1][0];
    const head = [[I.head, 1]];
    /* A shell over the head from a cut line, with offsets by height
       above the cut: [dy, offset, tag]. */
    const headShell = shellOf(rows);
    const shell = (cutFn, layers, topOff, shape) => {
      const rings = [];
      for (const [dy, off, tag] of layers) {
        const pts = [];
        for (let k = 0; k <= S; k++) {
          const th = TAU * (k / S);
          const y0 = cutFn(fromFront(th));
          const P = headShell(th, Math.min(crownY - 0.003, y0 + dy), off);
          if (shape) shape(P, y0, dy);
          pts.push(P);
        }
        rings.push({ pts, c: new THREE.Vector3(0, pts[0].y, 0), tag });
      }
      // up over the crown, at the top layer's offset, to the pole
      const lastDy = layers[layers.length - 1][0];
      const N = L.level === 1 ? 6 : 14;
      for (let i = 1; i <= N; i++) {
        const t = Math.sin((i / N) * Math.PI / 2);
        const pts = [];
        for (let k = 0; k <= S; k++) {
          const th = TAU * (k / S);
          const y0 = cutFn(fromFront(th)) + lastDy;
          const y = i === N ? crownY : lerp(y0, crownY, t);
          const P = headShell(th, y, topOff);
          if (shape) shape(P, y0, y - y0 + lastDy);
          pts.push(P);
        }
        rings.push({ pts, c: new THREE.Vector3(0, pts[0].y, 0), tag: 0 });
      }
      loft(B, rings, { wt: () => head, tag: (P, j) => rings[j].tag || 0 });
      return rings[rings.length - 1].pts[0].y;
    };

    if (style === 'beanie') {
      const cut = (a) => lerp(1.652, 1.598, ss(0.4, 2.2, a));
      const top = shell(cut, [[-0.002, 0.008, 1], [0.0, 0.021, 1], [0.032, 0.023, 1], [0.036, 0.017, 0]], 0.017,
        (P, y0, dy) => { P.y += 0.006 * ss(0.05, 0.12, dy); });
      const pom = new THREE.SphereGeometry(0.03, 12, 9);
      addGeom(B, pom, new THREE.Matrix4().makeTranslation(0, top + 0.028, -0.012), head, 1);
    } else if (style === 'flat') {
      const cut = (a) => lerp(1.664, 1.625, ss(0.3, 2.6, a));
      shell(cut, [[-0.002, 0.005, 0], [0.003, 0.012, 0]], 0.013, (P, y0, dy) => {
        P.z += 0.012 * ss(0.0, 0.05, dy);
        if (P.y > 1.70) P.y = 1.70 + (P.y - 1.70) * 0.35;
      });
      const fz = rowAt(rows, 1.664)[2];
      const peak = new THREE.CylinderGeometry(0.098 * HEAD_K, 0.098 * HEAD_K, 0.007, 18, 1, false, -Math.PI / 2, Math.PI);
      peak.scale(1, 1, 0.62);
      const m = new THREE.Matrix4().makeRotationX(0.14)
        .premultiply(new THREE.Matrix4().makeTranslation(0, 1.664, fz - 0.012));
      addGeom(B, peak, m, head, 0);
    } else if (style === 'wide') {
      const crown = [[1.650, 0.090, 0.106], [1.700, 0.085, 0.100], [1.762, 0.078, 0.092],
                     [1.776, 0.068, 0.082], [1.781, 0.035, 0.042], [1.782, 0, 0]];
      const rings = crown.map(([y, rx, rz]) => {
        const R = ring(new THREE.Vector3(0, y, -0.006), X, Z, rx * HEAD_K, rz * 1.04, rz * 1.04, 2.3, 0, S);
        return R;
      });
      loft(B, rings, { wt: () => head, tag: (P) => (P.y < 1.684 && P.y > 1.660 ? 1 : 0) });
      const prof = [[0.086, 1.664], [0.140, 1.661], [0.190, 1.671], [0.193, 1.665],
                    [0.140, 1.655], [0.088, 1.657], [0.086, 1.664]];
      // the brim's inner edge grows with the head, its outer one barely: a big head in a big hat is all hat
      const bk = (r) => r * lerp(HEAD_K, 0.88, ss(0.09, 0.19, r));
      const br = prof.map(([r, y]) => ring(new THREE.Vector3(0, y, -0.006), X, Z, bk(r), bk(r) * 1.06, bk(r) * 1.06, 2, 0, S));
      loft(B, br, { wt: () => head });
    } else if (style === 'band') {
      const layers = [[1.640, 0.001], [1.643, 0.007], [1.662, 0.007], [1.665, 0.001]];
      const rings = layers.map(([y, off]) => {
        const r = headRing(y, off);
        return ring(new THREE.Vector3(0, y, 0), X, Z, r.w, r.f, r.b, r.n, r.tp, S);
      });
      loft(B, rings, { wt: () => head });
    }
  }

  /* ---------------- scarves ---------------- */
  function buildNeckwear(B, spec, T) {
    const { torsoAt, torsoFront, torsoWt, I, L, g } = T;
    const style = spec.scarf;
    if (!style || style === 'none') return;
    const neckW = (P) => {
      const k = ss(1.50, 1.44, P.y);
      return [[I.neck, 1 - k], [I.chest, k]];
    };
    if (style === 'scarf') {
      const path = [];
      const N = L.level === 1 ? 16 : 32;
      for (let i = 0; i <= N; i++) {
        const th = TAU * (i / N);
        path.push(ringPoint(new THREE.Vector3(0, 1.478, -0.008), X, Z, 0.090 * g, 0.076, 0.082, 2, 0, th));
      }
      tube(B, path, 10, () => [0.026, 0.020], {
        nrm: (t, P) => new THREE.Vector3(P.x, 0, P.z + 0.008).normalize(), wt: neckW,
      });
      const tail = [];
      for (const y of [1.468, 1.43, 1.37, 1.31, 1.25, 1.19]) {
        const x = 0.040 + 0.008 * (1.468 - y);
        tail.push(new THREE.Vector3(x, y, torsoFront(x, y) + 0.020 + 0.012 * ss(1.40, 1.468, y)));
      }
      tube(B, tail, 8, (t) => [0.024, t > 0.96 ? 0.003 : 0.007], {
        nrm: () => Z.clone(), wt: (P) => torsoWt(P), n: 3,
      });
    } else if (style === 'sash') {
      const N = L.level === 1 ? 24 : 56;
      const path = [];
      for (let i = 0; i <= N; i++) {
        const th = TAU * (i / N);
        let y = 1.16;
        for (let it = 0; it < 4; it++) y = 1.16 + 0.55 * torsoAt(th, y).x;
        const P = torsoAt(th, y);
        const r = Math.hypot(P.x, P.z) || 1;
        P.x += (P.x / r) * 0.008; P.z += (P.z / r) * 0.008;
        path.push(P);
      }
      tube(B, path, 8, () => [0.036, 0.004], {
        n: 6, nrm: (t, P) => new THREE.Vector3(P.x, 0, P.z).normalize(), wt: (P) => torsoWt(P),
      });
    } else if (style === 'cowl') {
      const prof = [[0.115, 1.425], [0.108, 1.455], [0.098, 1.476], [0.086, 1.485],
                    [0.071, 1.477], [0.071, 1.450], [0.090, 1.423], [0.115, 1.425]];
      const rings = prof.map(([r, y]) =>
        ring(new THREE.Vector3(0, y, -0.008), X, Z, r * g, r * 0.88, r * 0.95, 2, 0, L.seg));
      loft(B, rings, { wt: neckW });
    }
  }

  /* ---------------- colour ----------------
     A figure's own colour attribute, painted from the shared geometry's
     tags, so the buffers stay shared and only the paint is per person. */
  function painted(geo, colours) {
    if (!geo) return null;
    const tags = geo.userData.tags;
    const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
      out.setAttribute(name, geo.attributes[name]);
    }
    out.setIndex(geo.index);
    const base = geo.attributes.color.array;
    const col = new Float32Array(tags.length * 3);
    for (let i = 0; i < tags.length; i++) {
      const c = colours[tags[i]] || colours[0];
      col[i * 3] = c.r * base[i * 3];
      col[i * 3 + 1] = c.g * base[i * 3 + 1];
      col[i * 3 + 2] = c.b * base[i * 3 + 2];
    }
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.boundingSphere = geo.boundingSphere;
    out.userData.painted = true;
    return out;
  }

  return { surfaces, painted, FACES, LEVELS, cache, TILE,
           _test: { chain, norm4, sample, rowAt, faceDz, HEAD_ALL, TORSO } };
})();
