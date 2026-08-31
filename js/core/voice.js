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
     truncating anything past about fifteen seconds.
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
  let live = null;            // { resolve, timer, keepalive }
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

  // a readable hold, for when there is no voice or it is muted
  const readTime = (text) => Math.min(9000, 1100 + String(text).length * 44);

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
    if (l.keepalive) clearInterval(l.keepalive);
    resolve();
  }

  /* Always resolves, exactly once, whatever the browser does. */
  function say(text, opts = {}) {
    const t = ++token;
    if (live) { const l = live; live = null; if (l.timer) clearTimeout(l.timer);
                if (l.keepalive) clearInterval(l.keepalive); l.resolve(); }
    if (supported) { try { synth.cancel(); } catch (e) {} }

    const body = String(text || '').trim();
    show(opts.speaker || '', body);
    if (!body) return Promise.resolve();

    return new Promise((resolve) => {
      const done = () => settle(t, resolve);
      live = { resolve, timer: null, keepalive: null };

      /* Speech engines and installed voices have wildly different
         `onend` timing. Resolve the beat on one text-derived clock on
         every machine; the synthesiser is presentation, never the show
         clock. This is what keeps subtitles, cameras and public actions
         together when one player has a neural voice and another has no
         speech synthesis at all. */
      const duration = readTime(body);

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

      // The same deadline is used with or without a synthesiser.
      live.timer = setTimeout(() => {
        if (t !== token) return;
        try { synth.cancel(); } catch (e) {}
        done();
      }, duration);

      // Chrome stops speaking after ~15s unless nudged
      live.keepalive = setInterval(() => {
        if (t !== token) return;
        try { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } } catch (e) {}
      }, 7000);

      const next = () => {
        if (t !== token || finished) return;
        if (i >= parts.length) { finished = true; return; }
        const u = new SpeechSynthesisUtterance(parts[i++]);
        u.voice = voice;
        u.lang = voice.lang || 'en-GB';
        u.rate = opts.rate === undefined ? 0.94 : opts.rate;
        u.pitch = opts.pitch === undefined ? 1.0 : opts.pitch;
        u.volume = opts.volume === undefined ? 1 : opts.volume;
        u.onend = () => { if (t === token) setTimeout(next, 190); };
        u.onerror = () => { if (t === token) setTimeout(next, 60); };
        try { synth.speak(u); } catch (e) { setTimeout(next, 30); }
      };
      next();
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
      if (l.keepalive) clearInterval(l.keepalive);
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
           get supported() { return supported; },
           get muted() { return muted; },
           get current() { const v = best(); return v ? { uri: v.voiceURI, name: v.name, lang: v.lang } : null; } };
})();
