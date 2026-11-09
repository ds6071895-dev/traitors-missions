/* ------------------------------------------------------------------
   music/mood.js — what the castle's music should know, and nothing more.

   Loose in the castle the band follows two things: the clock, and
   danger. The clock is the same for everybody. Danger is what your own
   screen can already see — the door shut on you and one other person,
   somebody keeping behind you room after room — plus, for a Traitor
   with the poison in their pocket, a private pulse that tightens as
   they close on somebody.

   That last part is the one with a rule. Music is heard by whoever is
   near your speakers, and so by whoever is on the other end of your
   microphone. So:

     - the private flags come only from your own private view (the
       poison in *your* pocket), never from anybody else's;
     - everything the private flags drive is soft and low (see the
       `private` layers in cues.js), and the flags are dropped the
       moment your microphone opens, or while you whisper;
     - the tension — which drives layers everybody plays — is computed
       from public things only, so a Traitor without the poison and a
       Faithful in the same place at the same time hear the same band.
       `test/music-direction.test.js` checks exactly that.

   `compute(view, prev)` is a pure function. The scene builds the view
   from what it already has (tasks.js `_musicMood`) and keeps the
   returned `state` to pass back next time.
------------------------------------------------------------------ */
const TaskMood = (() => {

  const FOLLOW_SECS = 4;       // somebody behind you this long, while you move, is following you
  const FOLLOW_NEAR = 7;       // metres
  const MOVING = 0.5;          // metres a second
  const SEALED_RAMP = 40;      // seconds shut in with somebody before it is as tight as it gets
  const POISON_NEAR = 3;       // metres: close enough to do it
  const COUNTDOWN = 10;        // the last seconds of the day are a build

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function compute(v = {}, prev = null) {
    const dt = v.dt > 0 ? v.dt : 0.25;
    const st = {
      behind: {},
      sealedFor: prev ? prev.sealedFor || 0 : 0,
      at: v.me ? { x: v.me.x, z: v.me.z } : null,
    };

    // ---- the clock ----
    const total = Math.max(30, v.seconds || 180);
    const bell = clamp(v.bellAt || 30, 5, total);
    const left = v.closed ? 0 : Math.max(0, ((v.endsAt || v.now || 0) - (v.now || 0)) / 1000);
    const toBell = Math.max(0.01, total - bell);
    /* A thin start — the tune and not much else — that fills in as the
       day goes, then everything from the bell, and the last of it in
       the final seconds. */
    let tension = left <= bell
      ? 0.8 + 0.15 * (1 - left / bell)
      : 0.12 + 0.56 * clamp((total - left) / toBell, 0, 1);

    // ---- who is in here with me (the minimap's rule: the same room) ----
    const me = v.dead ? null : v.me;
    const here = me && me.room ? (v.others || []).filter(o => o && o.room === me.room) : [];

    // shut in with exactly one other person
    const sealed = !!(me && v.sealed && here.length === 1);
    st.sealedFor = sealed ? st.sealedFor + dt : 0;
    if (sealed) tension = Math.max(tension, 0.55 + 0.35 * clamp(st.sealedFor / SEALED_RAMP, 0, 1));

    /* Somebody who stays behind you while you move. Standing still
       neither counts nor forgets: they may be waiting. */
    let followed = false;
    if (me) {
      const was = prev && prev.at;
      const moving = was ? Math.hypot(me.x - was.x, me.z - was.z) / dt > MOVING : false;
      const fx = Math.sin(me.h || 0), fz = Math.cos(me.h || 0);
      for (const o of here) {
        const dx = o.x - me.x, dz = o.z - me.z;
        const d = Math.hypot(dx, dz);
        const behind = d > 0.3 && d < FOLLOW_NEAR && (dx * fx + dz * fz) / d < -0.2;
        const had = (prev && prev.behind && prev.behind[o.id]) || 0;
        const t = behind ? (moving ? had + dt : had) : Math.max(0, had - 2 * dt);
        if (t > 0) st.behind[o.id] = t;
        if (t >= FOLLOW_SECS) followed = true;
      }
    }
    if (followed) tension = Math.max(tension, 0.6);

    // ---- private: the poison in my own pocket ----
    const P = v.poison;
    const carrying = !!(P && P.mine && !P.used && !v.dead);
    const priv = carrying && !v.micLive;
    let near = false;
    if (priv && me) {
      const partners = new Set(v.partners || []);
      for (const o of here) {
        if (!partners.has(o.id) && Math.hypot(o.x - me.x, o.z - me.z) <= POISON_NEAR) near = true;
      }
    }

    return {
      tension: clamp(tension, 0, 1),
      flags: {
        sealed, followed,
        private: priv,
        poison: priv,
        poisonNear: priv && near,
        poisonLate: priv && left <= bell,
        poisonHold: priv && v.holding === 'poison',
      },
      countdown: !v.closed && left > 0 && left <= COUNTDOWN,
      left,
      dead: !!v.dead,
      micLive: !!v.micLive,
      state: st,
    };
  }

  return { compute, FOLLOW_SECS, FOLLOW_NEAR, SEALED_RAMP, POISON_NEAR, COUNTDOWN };
})();
