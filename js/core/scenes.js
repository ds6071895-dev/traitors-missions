/* ------------------------------------------------------------------
   scenes.js — every room of the game.

   A scene plugs into the engine as build() -> { scene, camera }, then
   start/update/dispose.

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
  let startOff = null;
  let startTimer = null;

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

  /* How many beat lists are mid-ceremony right now. A list parked on an
     `until` is waiting for the room, not performing, so it does not
     count. This is what the AI players ask before they speak: Claudia's
     pauses between sentences are silent, and a gate that only watched for
     her voice let them in. */
  let performing = 0;
  async function run(beats, scene) {
    performing++;
    try { return await runBeats(beats, scene); } finally { performing--; }
  }

  async function runBeats(beats, scene) {
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
                                    rate: l.rate, pitch: l.pitch, public: !!l.public });
          if (mine !== token) return false;
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
        performing--;
        let ok;
        try { ok = await b.until(); } finally { performing++; }
        if (mine !== token || ok === false) return false;
      }
    }
    return mine === token;
  }

  /* A named rendezvous inside a scene. It is mostly invisible because
     public beat lists have deterministic timing; the hill uses it after
     the private role/task material, where those lists intentionally
     differ from one player to the next. */
  function barrier(key) {
    const s = typeof Session !== 'undefined' ? Session.state : null;
    const shared = typeof Party !== 'undefined' && Party.connected;
    if (!s || !s.players || s.players.length < 2 || !Net.connected || !shared) {
      return Promise.resolve(true);
    }
    if ((s.syncPassed || []).indexOf(key) >= 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        off();
        clearInterval(retry);
        pending.delete(cancel);
        resolve(true);
      };
      const cancel = () => {
        if (done) return;
        done = true;
        off();
        clearInterval(retry);
        pending.delete(cancel);
        resolve(false);
      };
      const off = Net.on(e => { if (e.type === 'sync' && e.key === key) finish(); });
      pending.add(cancel);
      const ready = () => Net.send({ type: 'syncReady', key });
      ready();
      const retry = setInterval(ready, 600);
      /* Cover an event that crossed between the state check and listener. */
      Promise.resolve().then(() => {
        if (Session.state && (Session.state.syncPassed || []).indexOf(key) >= 0) finish();
      });
    });
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
    const begin = () => {
      if (active !== instance) return;
      clearInterval(startTimer); startTimer = null;
      if (startOff) { startOff(); startOff = null; }
      if (instance.start) instance.start();
    };
    const s = typeof Session !== 'undefined' ? Session.state : null;
    const shared = typeof Party !== 'undefined' && Party.connected;
    if (s && s.players && s.players.length > 1 && Net.connected && shared
        && s.phase !== 'verdict') {
      if (s.scene && s.scene.phase === s.phase && s.scene.started) begin();
      else {
        const phase = s.phase;
        startOff = Net.on(e => { if (e.type === 'scene' && e.phase === phase) begin(); });
        const ready = () => {
          if (active === instance) Net.send({ type: 'sceneReady', phase });
        };
        ready();
        startTimer = setInterval(ready, 600);
      }
    } else begin();
    return instance;
  }

  function stop() {
    token++;
    clearInterval(startTimer); startTimer = null;
    if (startOff) { startOff(); startOff = null; }
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
     role card and a calmer card do not sound like the same event. */
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

  /* ---------------- the big beat ----------------
     A name, a body, a colour. Each of them used to be announced with a
     long wait, which is not the same thing as drama: drama is the band
     cutting out, the bars coming in and the camera finding a face, and
     then a hit — and all of that is under a second. `hush` is the
     breath before, `hit` is the blow, `end` gives the player their eyes
     back. A scene that was already cinematic (the fire's pouch, a
     banished player on their feet) stays cinematic. */
  const drama = new WeakMap();
  let vig = null;
  const vignette = (on) => {
    if (!vig && typeof document !== 'undefined') vig = document.getElementById('drama-vignette');
    if (vig && vig.classList) vig.classList.toggle('on', !!on);
  };
  const Drama = {
    hush(stage, music, shot, o = {}) {
      Cine.bars(true);
      vignette(true);
      if (stage && stage.setCinematic && o.camera !== false) {
        if (!drama.has(stage)) {
          drama.set(stage, { was: !!stage.cinematic, controls: !!(stage.rig && stage.rig.controls) });
        }
        stage.setCinematic(true, shot || null, { speed: o.speed || 2.2, cut: !!o.cut });
      }
      if (music && music.silence && o.silent !== false) music.silence(true);
      return wait(o.hold != null ? o.hold : 0.6);
    },
    hit(stage, music, sting, o = {}) {
      if (music && sting && music.stinger) music.stinger(sting);
      else if (music && music.silence) music.silence(false);
      if (stage && stage.shake && o.shake !== 0) stage.shake(o.shake || 0.45);
      if (o.flash && typeof document !== 'undefined') {
        const el = document.getElementById('screen-flash');
        if (el && el.style) {
          el.style.transition = 'none';
          el.style.background = o.flash;
          el.style.opacity = '1';
          setTimeout(() => { el.style.transition = 'opacity .6s ease-out'; el.style.opacity = '0'; }, 80);
          setTimeout(() => { el.style.transition = ''; }, 900);
        }
      }
      if (typeof Input !== 'undefined' && Input.haptic) Input.haptic(o.haptic || 30);
    },
    shot(stage, shot, o = {}) {
      if (stage && stage.setShot) stage.setShot(shot, { speed: o.speed || 1.6, cut: !!o.cut });
    },
    end(stage, music) {
      Cine.bars(false);
      vignette(false);
      if (music && music.silent && music.silence) music.silence(false);
      const was = stage && drama.get(stage);
      if (!was) return;
      drama.delete(stage);
      if (!was.was && stage.setCinematic) {
        stage.setCinematic(false);
        if (!was.controls && stage.setControls) stage.setControls(false);
      }
    },
  };

  return { play, stop, run, wait, barrier, Cine, Drama,
           get active() { return active; },
           get running() { return !!active; },
           get performing() { return performing > 0; },
           get botSpeechBlocked() {
             const s = typeof Session !== 'undefined' && Session.state;
             return performing > 0 || !!(active && active.botIntroPending) || !!(s && s.phase === 'hill');
           } };
})();
