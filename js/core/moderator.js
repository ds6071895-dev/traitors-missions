/* ------------------------------------------------------------------
   moderator.js — knowing when the room has said enough.

   An open discussion at the round table (and the floor round at the
   fire) has a hard clock, and a clock is the worst way to end one: it
   cuts somebody off mid-accusation, or it leaves eight people staring
   at each other for a minute after everything worth saying was said.

   So the host listens. Every living person's voice is metered — the
   remote ones by `VoiceChat.levels`, the host's own by its self meter,
   an AI contestant's by how long its last reply took to say — and this
   keeps a running total of how long each of them has actually spoken.
   It ends the discussion when three things are true together:

     - it has run long enough to be a discussion at all,
     - everybody alive has had their say (spoken for a few seconds, or
       pressed "I've said enough", or has no microphone to say it with),
     - and the room has just gone quiet — the natural pause after the
       last point lands, which is the moment the programme cuts.

   Before that, if one person has said nothing while everybody else has
   been talking, Claudia turns to them by name. Once.

   It decides; it does not speak. `onInvite` and `onClose` are the
   scene's to stage. An AI Claudia can take the decision over entirely
   with `judge`, which is handed the same picture this file sees.
------------------------------------------------------------------ */
const Moderator = (() => {

  const TICK = 0.25;              // seconds between looks at the room
  const SPEAKING = 0.14;          // a level this loud is somebody talking
  const QUIET_FOR = 2.6;          // a pause this long is a natural break
  const HAD_SAY = 6;              // seconds spoken to count as having had a say

  let active = null;

  function start(opts = {}) {
    stop();
    const ids = () => (typeof opts.ids === 'function' ? opts.ids() : opts.ids || []);
    const run = {
      startedAt: Date.now(),
      spoken: new Map(),          // id -> seconds spoken
      quiet: 0,                   // seconds since anybody spoke
      invited: new Set(),
      timer: null,
      closed: false,
      minSeconds: opts.minSeconds || 40,
      maxSeconds: opts.maxSeconds || 300,
      opts,
      ids,
    };
    run.timer = setInterval(() => tick(run), TICK * 1000);
    active = run;
    return run;
  }

  function stop() {
    if (!active) return;
    clearInterval(active.timer);
    active = null;
  }

  /* The levels this machine can hear right now, by player id. */
  function levelsNow() {
    const out = new Map();
    if (typeof VoiceChat === 'undefined') return out;
    for (const [id, v] of VoiceChat.levels) out.set(id, v);
    const me = typeof Party !== 'undefined' && Party.selfId ? Party.selfId() : null;
    if (me) out.set(me, VoiceChat.selfLevel || 0);
    if (active && active.opts.extraLevels) {
      for (const [id, v] of active.opts.extraLevels()) out.set(id, Math.max(out.get(id) || 0, v));
    }
    return out;
  }

  /* An AI contestant has no microphone to meter: its speech is booked
     here by whoever played it. */
  function credit(id, seconds) {
    if (!active || !id) return;
    active.spoken.set(id, (active.spoken.get(id) || 0) + Math.max(0, seconds));
    active.quiet = 0;
  }

  function picture(run) {
    const living = run.ids();
    const elapsed = (Date.now() - run.startedAt) / 1000;
    const ready = new Set(run.opts.ready ? run.opts.ready() : []);
    const mute = new Set(run.opts.mute ? run.opts.mute() : []);
    const spoken = living.map(id => ({ id, seconds: Math.round((run.spoken.get(id) || 0) * 10) / 10,
                                       done: ready.has(id), mute: mute.has(id) }));
    const heard = spoken.filter(s => s.seconds >= HAD_SAY || s.done || s.mute).length;
    return { elapsed, quiet: run.quiet, spoken, heard, of: living.length,
             everyone: heard >= living.length };
  }

  function tick(run) {
    if (run !== active || run.closed) return;
    const levels = levelsNow();
    let anyone = false;
    for (const id of run.ids()) {
      const v = levels.get(id) || 0;
      if (v > SPEAKING) {
        run.spoken.set(id, (run.spoken.get(id) || 0) + TICK);
        anyone = true;
      }
    }
    run.quiet = anyone ? 0 : run.quiet + TICK;
    const pic = picture(run);

    /* A judge — an AI Claudia — sees what this sees and may decide for
       it. It answers 'close', 'invite:<id>', or nothing; anything else
       falls through to the rules below. */
    if (run.opts.judge) {
      const verdict = run.opts.judge(pic);
      if (verdict === 'close') return close(run, 'judge');
      if (typeof verdict === 'string' && verdict.startsWith('invite:')) {
        const id = verdict.slice(7);
        if (!run.invited.has(id)) { run.invited.add(id); run.opts.onInvite && run.opts.onInvite(id); }
      }
      if (run.opts.judgeOnly) {
        if (pic.elapsed >= run.maxSeconds) close(run, 'clock');
        return;
      }
    }

    // somebody has said nothing while the room has been going for a while
    if (pic.elapsed > Math.max(25, run.minSeconds * 0.6) && run.quiet > 1.4) {
      const silent = pic.spoken.filter(s => s.seconds < 2 && !s.done && !s.mute
                                           && !run.invited.has(s.id));
      const talkers = pic.spoken.filter(s => s.seconds >= HAD_SAY).length;
      if (silent.length && talkers >= Math.min(2, pic.of - 1)) {
        const id = silent[0].id;
        run.invited.add(id);
        run.quiet = -4;                       // give them a moment to start
        if (run.opts.onInvite) run.opts.onInvite(id);
        return;
      }
    }

    if (pic.elapsed >= run.minSeconds && pic.everyone && run.quiet >= QUIET_FOR) {
      return close(run, 'said');
    }
    /* Everybody has spoken a lot and the clock is mostly gone: the next
       pause will do, even a short one. */
    if (pic.elapsed >= run.maxSeconds * 0.8 && pic.everyone && run.quiet >= 1.2) {
      return close(run, 'said');
    }
  }

  function close(run, why) {
    if (run.closed) return;
    run.closed = true;
    clearInterval(run.timer);
    if (active === run) active = null;
    if (run.opts.onClose) run.opts.onClose(why, picture(run));
  }

  return { start, stop, credit, picture: () => (active ? picture(active) : null),
           get active() { return !!active; }, HAD_SAY, QUIET_FOR };
})();
