/* ------------------------------------------------------------------
   nametag.js — whose head that is.

   Three people in a wood in the same coat is a problem the strip at
   the side of the screen cannot solve: it tells you what everybody is
   worth, and nothing at all about which of the two figures under the
   trees is the one you have been talking to. Every accusation in this
   game is about a person, so a person has to be nameable at a glance
   and from across a channel.

   So a name is a sprite and nothing else. Deliberately:

   - `sizeAttenuation` is off, so it is the same size on screen whether
     they are four metres away or four hundred. A label that shrinks
     with distance is unreadable exactly when you most want to know who
     that is — the boat two gates ahead, the archer on the far side of
     the clearing.
   - `depthTest` is off, so a name is never eaten by a tree. It is not
     an x-ray: the figure itself is still hidden, and all you learn is
     that somebody with that name is over there, which is the thing you
     would know from their voice anyway.
   - It fades out rather than switching off, over a distance each
     mission chooses for itself. A dive has thirty metres of visibility
     and a ski run has half a mountain.

   Nothing here is cached between missions. Two labels per run is not
   worth a cache that outlives the scene it was drawn for, and the
   sprite is an ordinary child of the mission's scene, so the same
   `Engine.disposeObject` that frees the rest of it frees these too.
------------------------------------------------------------------ */
const Nametag = (() => {

  /* Metres of screen, not metres of world. `H` is the height of the
     label as a fraction of the viewport at a 46° lens — the same units
     the guard mark in `flyers.js` is measured in. */
  const H = 0.030;
  const FONT_PX = 60;
  const PAD_X = 30;
  const DOT_R = 13;
  const GAP = 20;
  const CANVAS_H = 96;
  const MAX_CHARS = 16;

  const clip = (s) => {
    const t = String(s || 'Player').trim() || 'Player';
    return t.length > MAX_CHARS ? t.slice(0, MAX_CHARS - 1) + '…' : t;
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  /* The label, drawn once. A dot in their accent colour on the left so
     the name and the coat you can see under it are the same person. */
  function texture(name, accent) {
    const font = '800 ' + FONT_PX + 'px Inter, system-ui, -apple-system, sans-serif';
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;
    const textW = Math.ceil(probe.measureText(name).width);
    const w = Math.max(96, PAD_X * 2 + DOT_R * 2 + GAP + textW);

    const c = document.createElement('canvas');
    c.width = w; c.height = CANVAS_H;
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, CANVAS_H);

    const inset = 4;
    roundRect(g, inset, inset, w - inset * 2, CANVAS_H - inset * 2,
              (CANVAS_H - inset * 2) / 2);
    g.fillStyle = 'rgba(8,12,18,0.62)';
    g.fill();
    g.strokeStyle = accent;
    g.globalAlpha = 0.55;
    g.lineWidth = 3;
    g.stroke();
    g.globalAlpha = 1;

    g.beginPath();
    g.arc(PAD_X + DOT_R, CANVAS_H / 2, DOT_R, 0, 6.2832);
    g.fillStyle = accent;
    g.fill();

    g.font = font;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.75)';
    g.shadowBlur = 6;
    g.fillStyle = '#eef4fb';
    g.fillText(name, PAD_X + DOT_R * 2 + GAP, CANVAS_H / 2 + 2);

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 2;
    return { map: t, aspect: w / CANVAS_H };
  }

  /* `near` is the last distance at which the name is fully opaque and
     `far` is where it has gone. A mission that names neither gets the
     numbers a clearing wants. */
  function make(name, opts = {}) {
    const { map, aspect } = texture(clip(name), opts.accent || '#f2c14e');
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map, transparent: true, depthTest: false, depthWrite: false,
      sizeAttenuation: false,
      /* Fog is for the wood, not for the writing. A dive has thirty
         metres of visibility and a channel at dusk has a horizon of
         haze, and a label the fog had eaten would vanish at exactly
         the distance you needed it — this thing's own fade is the one
         that should decide when a name is too far to read. */
      fog: false,
    }));
    /* Anchored at its own bottom edge, so a caller positions the point
       the label sits above rather than the middle of the label. */
    sprite.center.set(0.5, 0);
    const h = opts.size || H;
    sprite.scale.set(h * aspect, h, 1);
    sprite.renderOrder = 24;
    sprite.frustumCulled = false;
    sprite.visible = false;
    sprite.userData.near = opts.near === undefined ? 60 : opts.near;
    sprite.userData.far = opts.far === undefined ? 260 : opts.far;
    return sprite;
  }

  /* Put it above a head and work out how much of it there is to see.
     One call per peer per frame, which is the whole per-frame cost of
     the feature. */
  function show(tag, x, y, z, camera) {
    if (!tag) return;
    tag.position.set(x, y, z);
    const u = tag.userData;
    let a = 1;
    if (camera) {
      const d = camera.position.distanceTo(tag.position);
      a = d <= u.near ? 1
        : (d >= u.far ? 0 : 1 - (d - u.near) / Math.max(1e-3, u.far - u.near));
    }
    tag.material.opacity = a;
    tag.visible = a > 0.02;
  }

  function hide(tag) { if (tag) tag.visible = false; }

  return { make, show, hide };
})();
