/* ------------------------------------------------------------------
   reveal.js — the moment a role stops being a secret.

   This was inside `fireplace.js`, which was the right place for it
   while the fire was the only thing that ever revealed anybody. It is
   not any more: a Traitor who leaves their task unfinished is exposed
   at whichever room the show walks into next, and half the time that
   room has no fire in it.

   So the mechanism moved out and the fire became optional. Everything
   that does not need one — the two-stage flash, the buzz, the score
   change, the card — happens either way. The column of flame and the
   embers happen when there is something to burn.

   The staging rule is unchanged and is the whole reason this reads as
   a reveal: everything lands on the same frame. Colour, sound, shake
   and card together, because a reveal delivered in instalments is one
   the audience has already worked out. Only the aftermath is
   staggered.
------------------------------------------------------------------ */
const Reveal = (() => {

  const TONE = {
    traitor:  { col: '#ff1f3a', deep: '#8c0a1c', word: 'TRAITOR',
                flashA: 'rgba(255,235,238,0.92)', flashB: 'rgba(255,20,50,0.5)',
                column: 6.5, shake: 1.35, haptic: 110,
                progression: 'dread', embers: 1 },
    faithful: { col: '#5cffa0', deep: '#1f9c62', word: 'FAITHFUL',
                flashA: 'rgba(238,255,246,0.85)', flashB: 'rgba(90,255,160,0.38)',
                column: 4.8, shake: 0.95, haptic: 50,
                progression: 'hymn', embers: 0.72 },
  };

  const toneFor = (role) => TONE[role === 'traitor' ? 'traitor' : 'faithful'];

  /* Two flashes: a hard white-hot one on the frame itself, and the
     colour bleeding back in behind it a tenth of a second later. One
     flash reads as a glitch; two read as an explosion. */
  function flash(T) {
    const el = document.getElementById('screen-flash');
    if (!el) return;
    el.style.transition = 'none';
    el.style.background = T.flashA;
    el.style.opacity = '1';
    setTimeout(() => {
      el.style.transition = 'opacity .5s ease-out';
      el.style.background = T.flashB;
    }, 70);
    setTimeout(() => { el.style.opacity = '0'; }, 190);
    setTimeout(() => { el.style.transition = ''; }, 900);
  }

  function card(kicker, role, title) {
    Scenes.Cine.card({
      kicker,
      title: title || toneFor(role).word,
      tone: role === 'traitor' ? 'traitor' : 'faithful',
    });
  }

  /* Who the card is about, in the second person when it is you. */
  function nameOf(playerId, fallback) {
    const p = playerId && typeof Session !== 'undefined'
      ? Session.playerById(playerId) : null;
    if (!p) return fallback || 'The fire says';
    return p.local ? 'You were' : p.name + ' was';
  }

  /* ---------------- the reveal ----------------
     `stage` is required; `fire` is not. Returns the ember burst so the
     scene that owns the frame can keep updating it, and the settle
     clock for the fire colour coming back down. */

  function flare(o = {}) {
    const role = o.role === 'traitor' ? 'traitor' : 'faithful';
    const T = toneFor(role);
    const stage = o.stage;
    const fire = o.fire || (stage && stage.fire) || null;

    AudioBus.play('fire-whoosh', { big: true });
    AudioBus.play(role === 'traitor' ? 'reveal-traitor' : 'reveal-faithful');
    Input.haptic(T.haptic);

    if (o.music) {
      /* Whatever ducked the score on the way in is only part way back.
         Undo it first — a reveal landing while the band fades up lands
         on nothing — then straight to top gear with no glide, because
         a crossfade is a thing you notice. */
      o.music.duck(0.95, 0.18);
      o.music.setGear(3, 0.15);
      o.music.setProgression(T.progression);
      o.music.stinger('reveal');
    }

    let embers = null, settle = null;
    if (fire) {
      // a column, not a campfire: it comes back down over five seconds
      fire.userData.want = T.column;
      fire.userData.light.color.set(T.col);
      fire.userData.light.distance = 90;
      fire.userData.flames.forEach((fl, i) => {
        fl.material.color.set(i < 2 ? T.col : T.deep);
        fl.material.opacity = 1;
      });
      settle = { t: 0, from: new THREE.Color(T.col) };
      embers = burstEmbers(stage, fire, T.col, T.embers);
    }

    if (stage && stage.shake) stage.shake(T.shake);
    flash(T);

    if (o.card !== false) {
      card(o.kicker || nameOf(o.playerId), role, o.title);
    }
    return { embers, settle, tone: T };
  }

  /* ---------------- embers ----------------
     One buffer of points thrown up out of the fire and left to fall
     back through it. Built per reveal and disposed on the next one:
     there is never more than one going at a time, and a pool would be
     more code than the thing it pools. */

  function burstEmbers(stage, fire, colour, strength) {
    if (!stage || !fire) return null;
    const N = Math.round(180 * strength);
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.283;
      const r = Math.random() * 0.42;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.6 + Math.random() * 0.8;
      pos[i * 3 + 2] = Math.sin(a) * r;
      // mostly up: the spread is what makes it a burst rather than a jet
      const up = 4.2 + Math.random() * 7.5 * strength;
      vel[i * 3] = Math.cos(a) * (0.6 + Math.random() * 2.6);
      vel[i * 3 + 1] = up;
      vel[i * 3 + 2] = Math.sin(a) * (0.6 + Math.random() * 2.6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const mat = new THREE.PointsMaterial({
      color: colour, size: 0.13, transparent: true, opacity: 1,
      depthWrite: false, map: FXTex.dotTexture(), sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    pts.position.copy(fire.position);
    stage.scene.add(pts);
    return { pts, geo, mat, vel, t: 0, life: 3.4 };
  }

  /* Returns the burst, or null once it has burned out and cleaned up
     after itself — so a caller can write `em = Reveal.updateEmbers(...)`
     and never think about the end of it. */
  function updateEmbers(stage, em, dt) {
    if (!em) return null;
    em.t += dt;
    const p = em.geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += em.vel[i] * dt;
      p[i + 1] += em.vel[i + 1] * dt;
      p[i + 2] += em.vel[i + 2] * dt;
      em.vel[i + 1] -= 6.2 * dt;                 // gravity, gently
      em.vel[i] *= 1 - 1.1 * dt;                 // and air
      em.vel[i + 2] *= 1 - 1.1 * dt;
    }
    em.geo.attributes.position.needsUpdate = true;
    const k = U.clamp(em.t / em.life, 0, 1);
    em.mat.opacity = 1 - k * k;
    em.mat.size = 0.13 * (1 - k * 0.55);
    if (k < 1) return em;
    clearEmbers(stage, em);
    return null;
  }

  function clearEmbers(stage, em) {
    if (!em) return null;
    if (stage && stage.scene) stage.scene.remove(em.pts);
    em.geo.dispose();
    em.mat.dispose();
    return null;
  }

  return { flare, card, flash, nameOf, toneFor,
           burstEmbers, updateEmbers, clearEmbers, TONE };
})();
