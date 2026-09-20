/* ------------------------------------------------------------------
   voice.js — Claudia, out loud.

   `speechSynthesis` sounds like a robot mostly for reasons you can fix
   from here, and this module is those fixes:

   - Pick the voice properly. The OS voice list is a junk drawer with a
     couple of very good neural voices in it. Score the list rather than
     taking getVoices()[0], and let the player override, because what is
     installed varies wildly between machines.
   - Speak a sentence at a time. Queueing short utterances puts real
     pauses at full stops, which is most of the difference between
     reading and presenting — and it sidesteps Chrome's habit of
     truncating anything past about fifteen seconds, without the
     pause/resume nudge that swallows words on half the platforms.
   - Never let the show depend on it. No synthesiser, muted, a refused
     gesture, a voice that fires no events: every one of those falls
     through to subtitles held for a readable time, and the scene above
     cannot tell the difference. `say()` always resolves, exactly once.

   Nothing here routes through AudioBus — the browser will not let it —
   so muting is handled separately and deliberately.
------------------------------------------------------------------ */
const Voice = (() => {

  const synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
  const supported = !!(synth && typeof SpeechSynthesisUtterance === 'function');

  let voices = [];
  let chosenURI = null;
  let muted = false;
  let token = 0;              // bumps on cancellation to orphan old callbacks
  let live = null;            // { resolve, timer }
  let held = [];              // the utterances of the line in the air — see `next`
  let started = false;

  const dom = {};

  /* ---------------- choosing a voice ---------------- */

  const GOOD = /natural|neural|premium|enhanced|online/i;
  const NAMED = /libby|sonia|serena|kate|martha|amy|emma|fiona|moira|hazel|stephanie|isabella/i;
  const POOR = /compact|eloquence|espeak|festival|pico/i;
  const MALE = /\bmale\b|daniel|arthur|ryan|george|oliver|james|thomas|brian/i;

  function score(v) {
    const n = v.name || '';
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    let s = 0;
    if (lang.startsWith('en-gb')) s += 120;
    else if (lang.startsWith('en-ie') || lang.startsWith('en-au')) s += 70;
    else if (lang.startsWith('en')) s += 45;
    else return -1000;                        // she is not going to be French
    if (/google uk english female/i.test(n)) s += 60;
    if (GOOD.test(n)) s += 60;
    if (NAMED.test(n)) s += 45;
    if (/google/i.test(n)) s += 18;
    if (MALE.test(n)) s -= 30;                // a preference, not a rule
    if (POOR.test(n)) s -= 50;
    return s;
  }

  function refresh() {
    if (!supported) return;
    try { voices = synth.getVoices() || []; } catch (e) { voices = []; }
  }

  function best() {
    if (!voices.length) return null;
    if (chosenURI) {
      const want = voices.find(v => v.voiceURI === chosenURI);
      if (want) return want;
    }
    return voices.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }

  function list() {
    refresh();
    return voices.slice()
      .sort((a, b) => score(b) - score(a))
      .filter(v => score(v) > -500)
      .map(v => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
  }

  function setVoice(uri) {
    chosenURI = uri || null;
    GameState.settings.voiceURI = chosenURI;
    GameState.save();
  }

  /* ---------------- the subtitle line ---------------- */

  function cache() {
    dom.wrap = document.getElementById('cine-caption');
    dom.speaker = document.getElementById('cine-speaker');
    dom.text = document.getElementById('cine-sub');
  }

  function show(speaker, text) {
    if (!dom.text) cache();
    if (dom.speaker) dom.speaker.textContent = speaker || '';
    if (dom.text) dom.text.textContent = text || '';
    if (dom.wrap) dom.wrap.classList.toggle('on', !!text);
  }

  function clear() { show('', ''); }

  /* ---------------- speaking ---------------- */

  /* The hand-off between one sentence and the next. It is a full stop,
     so it is charged for in `readTime` below rather than being time the
     clock does not know about. */
  const GAP = 190;

  /* How long the line takes out loud, which is also how long it is held
     for a player with no voice or muted: one clock for everybody. It has
     to be honest, and honest here means erring long. The beat ends when
     this says it does and the *next* line opens with `synth.cancel()`,
     so a clock that is a word short takes that word off the end of the
     line — which is exactly what it sounded like.

     Installed voices are not one speed. Across the neural ones a
     character is somewhere between fifty-five and seventy-two
     milliseconds at rate 1, and the old sixty was the middle of that
     range: right on average, and therefore short on half the lines.
     Sixty-eight is the slow end, which is the number this wants. The
     rest is what happens either side of the words — the wait before the
     first phoneme, the breath an engine leaves at a full stop on top of
     our own hand-off, and a margin so the deadline lands after the last
     word rather than on it. */
  const MS_PER_CHAR = 68;   // at rate 1, the slowest voice rather than the mean
  const OVERHEAD = 820;     // speak() to first phoneme, plus the busy beat
  const BREATH = 250;       // what the engine itself leaves at a full stop
  const TAIL = 260;         // margin: the deadline lands after her, not on her

  const readTime = (text, rate = 0.94) => {
    const body = String(text);
    const gaps = Math.max(0, sentences(body).length - 1);
    return Math.min(26000, OVERHEAD + TAIL
                         + (body.length * MS_PER_CHAR) / (rate || 1)
                         + gaps * (GAP + BREATH));
  };

  // full stops, question marks and the em dashes she actually pauses on
  function sentences(text) {
    return String(text)
      .split(/(?<=[.!?…])\s+|\s+—\s+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function settle(t, resolve) {
    if (t !== token || !live) return;
    const l = live;
    live = null;
    if (l.timer) clearTimeout(l.timer);
    resolve();
  }

  /* Always resolves, exactly once, whatever the browser does. */
  function say(text, opts = {}) {
    const t = ++token;
    if (live) { const l = live; live = null; if (l.timer) clearTimeout(l.timer); l.resolve(); }
    // Chrome drops or clips an utterance spoken in the same tick as a
    // cancel that interrupted something, so a busy synthesiser gets a beat
    let busy = false;
    if (supported) { try { busy = synth.speaking || synth.pending; synth.cancel(); } catch (e) {} }

    const body = String(text || '').trim();
    show(opts.speaker || '', body);
    if (!body) return Promise.resolve();

    return new Promise((resolve) => {
      const done = () => settle(t, resolve);
      live = { resolve, timer: null };

      /* Speech engines and installed voices have wildly different
         `onend` timing. Resolve the beat on one text-derived clock on
         every machine; the synthesiser is presentation, never the show
         clock. This is what keeps subtitles, cameras and public actions
         together when one player has a neural voice and another has no
         speech synthesis at all. */
      const duration = readTime(body, opts.rate === undefined ? 0.94 : opts.rate);

      /* `silent` is not a fallback, it is a choice: your own line at the
         table is read, not performed, because hearing yourself dubbed by
         the host's voice is worse than reading it. */
      const voice = supported && !opts.silent
        ? (opts.voiceURI ? (voices.find(v => v.voiceURI === opts.voiceURI) || best()) : best())
        : null;
      if (!supported || muted || opts.silent || !voice) {
        live.timer = setTimeout(done, duration);
        return;
      }

      if (typeof Music !== 'undefined' && Music.duckAll) Music.duckAll(0.45, 0.6);

      const parts = sentences(body);
      let i = 0, finished = false;
      held = [];

      /* The same deadline is used with or without a synthesiser. It ends
         the beat but does not cut the sentence she is in the middle of:
         nothing further is queued once `live` is gone, and the next line
         cancels whatever is left. */
      live.timer = setTimeout(done, duration);

      const next = () => {
        if (t !== token || !live || finished) return;
        if (i >= parts.length) { finished = true; return; }
        const u = new SpeechSynthesisUtterance(parts[i++]);
        u.voice = voice;
        u.lang = voice.lang || 'en-GB';
        u.rate = opts.rate === undefined ? 0.94 : opts.rate;
        u.pitch = opts.pitch === undefined ? 1.0 : opts.pitch;
        u.volume = opts.volume === undefined ? 1 : opts.volume;
        /* One hand-off per utterance, whichever event arrives. Engines
           differ on whether a cancelled or failed sentence gets `onend`
           as well as `onerror`, and two hand-offs from one sentence
           queue two more behind it — at which point the one in the
           middle is spoken over and lost. */
        const advance = (ms) => {
          if (u._handed) return;
          u._handed = true;
          if (t === token) setTimeout(next, ms);
        };
        u.onend = () => advance(GAP);
        u.onerror = () => advance(60);
        // Chrome garbage-collects an utterance nothing holds, and its
        // `onend` never fires — which silently drops every later
        // sentence. Hold the whole line, not just the newest of it:
        // the one still speaking is the one that must not be collected.
        held.push(u);
        try { synth.speak(u); } catch (e) { advance(30); }
      };
      if (busy) setTimeout(next, 80); else next();
    });
  }

  // Cancellation is reserved for teardown and browser lifecycle events;
  // ordinary show input never calls this or cuts a line short.
  function skip() {
    token++;
    if (supported) { try { synth.cancel(); } catch (e) {} }
    if (live) {
      const l = live; live = null;
      if (l.timer) clearTimeout(l.timer);
      l.resolve();
    }
  }

  function stop() { skip(); clear(); }

  function setMuted(m) {
    muted = !!m;
    if (muted && supported) { try { synth.cancel(); } catch (e) {} }
  }

  /* ---------------- boot ---------------- */

  function init() {
    if (started) return;
    started = true;
    chosenURI = GameState.settings.voiceURI || null;
    if (!supported) return;
    refresh();
    // Chrome hands back an empty list on the first ask
    try { synth.addEventListener('voiceschanged', refresh); }
    catch (e) { synth.onvoiceschanged = refresh; }
    setTimeout(refresh, 250);
    setTimeout(refresh, 1200);
    // a tab going away with speech queued comes back talking over itself
    document.addEventListener('visibilitychange', () => { if (document.hidden) skip(); });
    window.addEventListener('pagehide', stop);
  }

  // Safari will not speak until it has seen a gesture; this is the same
  // one-shot unlock AudioBus uses
  function unlock() {
    if (!supported) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0; synth.speak(u);
    } catch (e) {}
  }

  return { init, unlock, say, stop, clear, show, list, setVoice, setMuted, refresh,
           /* Whether a line is still running its clock. Not "is the
              synthesiser making a noise" — a muted player and a machine
              with no speech in it still hold the beat for the reading
              time, and that is the thing anybody outside here wants to
              know. Used as a liveness signal: a room that is still
              talking is a room whose ceremony has not stalled. */
           get speaking() { return !!live; },
           get supported() { return supported; },
           get muted() { return muted; },
           get current() { const v = best(); return v ? { uri: v.voiceURI, name: v.name, lang: v.lang } : null; } };
})();
