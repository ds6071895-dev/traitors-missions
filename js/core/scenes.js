/* ------------------------------------------------------------------
   scenes.js — the parts of the night that are not a mission.

   A scene plugs into the engine exactly the way a mission does —
   build() -> { scene, camera }, then start/update/dispose — but it has
   no registry, no score and no prize, because a welcome is not a thing
   you can be bad at.

   On top of that sits a beat sequencer, which is the part that matters.
   A scene written as control flow becomes a thicket of timers and
   half-finished callbacks the moment it is interrupted. Written as a
   list of beats it stays readable, and cancelling and "she is still
   talking" are handled once, here, instead of in three scene files
   that each get it slightly wrong.

     Scenes.run([
       { shot: 'crest' },
       { line: () => Lines.pick('welcome'), hold: 0.8 },
       { card: { kicker:'Your role', title:'FAITHFUL' }, wait: 3 },
       { then: () => Net.send({ type:'advance' }) },
     ]);

   Dialogue and its staging are deliberately not skippable. The same
   click that captures the pointer for first-person look must never also
   cut Claudia off. Every wait is still cancellable by scene teardown,
   so leaving mid-sentence cannot leave anything running.
------------------------------------------------------------------ */
const Scenes = (() => {

  const dom = {};
  let active = null;          // the live scene instance
  let token = 0;              // bumps on every stop, orphaning old beats

  function cache() {
    if (dom.root) return;
    dom.root = document.getElementById('cine');
    dom.card = document.getElementById('cine-card');
    dom.cardKicker = document.getElementById('cine-card-kicker');
    dom.cardTitle = document.getElementById('cine-card-title');
    dom.cardSub = document.getElementById('cine-card-sub');
  }

  /* ---------------- the overlay ---------------- */

  const Cine = {
    on(v = true) {
      cache();
      if (dom.root) dom.root.classList.toggle('on', !!v);
      if (!v) { Cine.card(null); Voice.clear(); }
    },
    // letterbox is separate from the overlay: the finale keeps its bars
    // while a vote panel is up, and the vote panel is not cinematic
    bars(v = true) {
      cache();
      if (dom.root) dom.root.classList.toggle('bars', !!v);
    },
    card(spec) {
      cache();
      if (!dom.card) return;
      if (!spec) { dom.card.classList.remove('on'); return; }
      dom.card.className = 'cine-card on' + (spec.tone ? ' t-' + spec.tone : '');
      if (dom.cardKicker) dom.cardKicker.textContent = spec.kicker || '';
      if (dom.cardTitle) dom.cardTitle.textContent = spec.title || '';
      if (dom.cardSub) dom.cardSub.innerHTML = spec.sub || '';
      AudioBus.play('card-in', { tone: spec.tone });
    },
  };

  /* ---------------- cancellable waiting ---------------- */

  const pending = new Set();   // every in-flight wait, so a teardown can end them

  function wait(seconds) {
    if (!(seconds > 0)) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        pending.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, seconds * 1000);
      // a scene torn down mid-wait must not leave this hanging
      pending.add(finish);
    });
  }

  /* ---------------- the beat runner ---------------- */

  async function run(beats, scene) {
    const mine = token;
    for (const raw of beats) {
      if (mine !== token) return false;
      const b = typeof raw === 'function' ? raw() : raw;
      if (!b) continue;
      if (b.when && !b.when()) continue;

      if (b.shot && scene && scene.setShot) scene.setShot(b.shot, b);
      if (b.card !== undefined) Cine.card(typeof b.card === 'function' ? b.card() : b.card);
      if (b.then) { const r = b.then(); if (r && typeof r.then === 'function') await r; }
      if (mine !== token) return false;

      if (b.line) {
        const l = typeof b.line === 'function' ? b.line() : b.line;
        if (l && l.text) {
          if (scene && scene.setSpeaking) scene.setSpeaking(l.who || 'claudia');
          await Voice.say(l.text, { speaker: l.speaker === undefined ? 'Claudia' : l.speaker,
                                    rate: l.rate, pitch: l.pitch });
          if (scene && scene.setSpeaking) scene.setSpeaking(null);
        }
      }
      if (mine !== token) return false;

      const hold = b.hold === undefined ? (b.line ? 0.5 : 0) : b.hold;
      if (hold) await wait(hold);
      if (b.wait) await wait(b.wait);
      if (mine !== token) return false;

      if (b.line && b.keep !== true) Voice.clear();
      if (b.until) {
        // park here until something outside says otherwise
        const ok = await b.until();
        if (mine !== token || ok === false) return false;
      }
    }
    return mine === token;
  }

  /* ---------------- lifecycle ---------------- */

  function play(instance) {
    stop();
    cache();
    token++;
    active = instance;
    const view = instance.build();
    Engine.setView(view, (dt, t) => {
      if (active === instance) instance.update(dt, t);
      Input.endFrame();
    });
    if (instance.start) instance.start();
    return instance;
  }

  function stop() {
    token++;
    pending.forEach(fn => { try { fn(); } catch (e) {} });
    pending.clear();
    Voice.stop();
    if (active) {
      try { if (active.dispose) active.dispose(); } catch (e) { console.warn(e); }
      active = null;
    }
    Cine.on(false);
    Cine.bars(false);
    Engine.clearView();
  }

  /* A soft swell under a card landing. Its brightness is the tone, so a
     role card and a mission card do not sound like the same event. */
  AudioBus.define('card-in', (ctx, dest, o = {}) => {
    const t = ctx.currentTime;
    const dark = o.tone === 'traitor' || o.tone === 'bad';
    const base = dark ? 88 : 176;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(dark ? 900 : 3200, t + 0.5);
    lp.connect(dest);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(dark ? 0.30 : 0.22, t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dark ? 2.2 : 1.5));
    g.connect(lp);

    for (const [mult, det] of [[1, 0], [1.5, 3], [2, -4], [dark ? 1.06 : 3, 6]]) {
      const o1 = ctx.createOscillator();
      o1.type = dark ? 'sawtooth' : 'triangle';
      o1.frequency.value = base * mult;
      o1.detune.value = det;
      const gg = ctx.createGain();
      gg.gain.value = 1 / (mult * 2.2);
      o1.connect(gg); gg.connect(g);
      o1.start(t); o1.stop(t + 2.4);
    }
  });

  return { play, stop, run, wait, Cine,
           get active() { return active; },
           get running() { return !!active; } };
})();
