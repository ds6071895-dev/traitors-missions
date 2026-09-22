/* ------------------------------------------------------------------
   mission-net.js — three people inside the same mission.

   The world is already the same on all three machines: courses,
   forests, wave schedules and flock spawns are all pure functions of
   the mission seed, and every client was handed the same one. So this
   does not synchronise the world. It synchronises the three things the
   seed cannot know about — where each person is, what they just did,
   and what they scored.

   Three kinds of traffic, and they are deliberately different:

   - `pose` is every client shouting its own transform on a timer.
     Lossy by nature; a dropped one is replaced 60ms later. Remotes are
     drawn a tick behind and interpolated, because the alternative is
     two boats that teleport.
   - `event` is anything that must not be lost — an arrow loosed, a
     gate taken, a bird killed. Host arbitrated where it is contested.
   - `report` is the end of it: everyone's numbers, collected by the
     host into one board that all three then argue about.

   Nothing here trusts a clock but its own. Timestamps arriving from
   another machine are used for ordering, never for timing.
------------------------------------------------------------------ */
const MissionNet = (() => {

  const RATE = 1 / 15;              // pose broadcasts per second

  /* How long the host waits for a report that has not come.

     It used to be a single fourteen-second fuse lit by the first
     report to arrive, which is correct for a mission all three people
     finish at the same moment and wrong for every other kind. A boat
     race ends when each boat crosses the line, and a driver forty
     seconds behind the winner was not slow — they were racing. The
     fuse burned while they did, and they arrived to find the board
     published, their name missing from it and their money not in the
     pot.

     So the wait is now for somebody who has gone *quiet*. A player who
     is still broadcasting poses is still playing and is not a
     straggler; the fuse only burns for peers that have stopped saying
     anything at all, which is what a closed tab looks like. The hard
     cap is there because "still posing" is a heuristic and a
     scoreboard that never arrives is worse than an incomplete one. */
  const REPORT_TIMEOUT = 14000;     // silence from a missing player
  const REPORT_ALIVE_GRACE = 4000;  // a pose this recent means still playing
  /* Longer than any single mission can run, because "still posing" is
     the *correct* answer for somebody still out on the water or still
     fighting the owl, and the cap must never be the thing that ends a
     wait somebody is legitimately in the middle of. It is a backstop
     against a wedged client, not a schedule. */
  const REPORT_MAX_WAIT = 360000;   // and the end of the host's patience

  let live = false;
  let offs = [];
  let acc = 0;
  let missionId = null;

  const remotes = new Map();        // playerId -> { prev, next, t, pose }
  const reports = new Map();        // playerId -> report
  let boardWaiters = [];
  let board = null;
  let reportTimer = null;
  let reportsOpenedAt = 0;
  let started = false;
  let startWaiters = [];
  let readyTimer = null;
  const readyPeers = new Set();

  const listeners = { pose: new Set(), event: new Set(), board: new Set() };
  function on(evt, fn) {
    if (!listeners[evt]) return () => {};
    listeners[evt].add(fn);
    return () => listeners[evt].delete(fn);
  }
  const emit = (evt, a, b) => listeners[evt].forEach(fn => {
    try { fn(a, b); } catch (e) { console.warn(e); }
  });

  /* Two things can put three people inside one mission: a whole night,
     which `Session` owns, and a mission party, which is one mission and
     nothing else. This file does not care which — it only needs to know
     that there is a room and that the run inside it is a shared one. */
  const partyRun = () => (typeof Party !== 'undefined' && Party.connected
    && ((typeof Session !== 'undefined' && Session.running)
     || (typeof MissionParty !== 'undefined' && MissionParty.running)));

  /* ---------------- lifecycle ---------------- */

  function attach(id) {
    detach();
    if (!partyRun()) return false;
    live = true;
    missionId = id;
    board = null;
    boardWaiters = [];
    remotes.clear();
    reports.clear();
    started = false;
    startWaiters = [];
    reportsOpenedAt = 0;
    readyPeers.clear();

    offs.push(Party.on('sync', (msg, peerId) => {
      if (!msg || msg.k !== 'pose' || msg.m !== missionId) return;
      takePose(peerId, msg);
    }));

    offs.push(Party.on('mev', (msg, peerId) => {
      if (!msg || msg.m !== missionId) return;
      if (msg.k === 'event') { emit('event', msg.data, peerId); return; }
      if (msg.k === 'report') { takeReport(peerId, msg.data); return; }
      if (msg.k === 'board') {
        if (!Party.isHost && (!Party.hostId || peerId === Party.hostId)) settle(msg.board);
        return;
      }
      if (msg.k === 'ready') { if (Party.isHost) takeReady(peerId); return; }
      if (msg.k === 'start') {
        if (!Party.isHost && (!Party.hostId || peerId === Party.hostId)) settleStart();
        return;
      }
    }));

    offs.push(Party.on('left', (peerId) => {
      remotes.delete(peerId);
      if (!Party.isHost) {
        /* The host is the only client that builds a board. If it has
           walked out there is not one coming, and a guest waiting on
           the promise would wait until its own backstop fired —
           several minutes of "waiting for the others" in a room that
           has nobody left to wait for. Settle with nothing and let the
           scoreboard draw the one row it does have. */
        if (peerId === Party.hostId && !board && boardWaiters.length) settle(null);
        return;
      }
      /* Mission parties may continue after a guest leaves. Re-evaluate
         both gates immediately: if the departing guest was the only
         device still loading or the only report still outstanding,
         nobody should sit through an infinite ready screen or timeout. */
      takeReady(Party.selfId());
      if (reports.size && reports.size >= expectedReportCount()) publish();
    }));
    if (Party.isHost) {
      takeReady(Party.selfId());
    } else {
      const ready = () => {
        if (!live || started) return;
        Party.post('mev', { k: 'ready', m: missionId }, Party.hostId);
      };
      ready();
      readyTimer = setInterval(ready, 600);
    }
    return true;
  }

  function detach() {
    const abandonedStarts = startWaiters;
    offs.forEach(off => { try { off(); } catch (e) {} });
    offs = [];
    live = false;
    missionId = null;
    remotes.clear();
    reports.clear();
    boardWaiters = [];
    board = null;
    clearTimeout(reportTimer);
    reportTimer = null;
    reportsOpenedAt = 0;
    clearInterval(readyTimer);
    readyTimer = null;
    started = false;
    startWaiters = [];
    abandonedStarts.forEach(fn => { try { fn(false); } catch (e) {} });
    readyPeers.clear();
    acc = 0;
  }

  /* ---------------- poses ----------------
     `pose` is whatever the mission wants it to be — a boat sends a
     position and a quaternion, an archer sends a position and a yaw.
     This file does not care, which is why it can serve both. */

  /* `rate` lets a mission that moves faster than walking pace ask for
     more; the remainder is carried rather than dropped, so the sends
     land on a steady beat instead of wherever the frames happen to. */
  function pose(dt, make, rate = RATE) {
    if (!live) return;
    acc += dt;
    if (acc < rate) return;
    acc = Math.min(acc - rate, rate);
    const p = make();
    if (!p) return;
    Party.post('sync', { k: 'pose', m: missionId, p, n: Date.now() });
  }

  function takePose(playerId, msg) {
    let r = remotes.get(playerId);
    if (!r) { r = { prev: null, next: null, t: 0, span: RATE }; remotes.set(playerId, r); }
    r.prev = r.next || msg.p;
    r.next = msg.p;
    r.span = Math.max(0.03, Math.min(0.5, r.t || RATE));
    r.t = 0;
    r.at = Date.now();          // the only evidence that they are still there
    emit('pose', playerId, msg.p);
  }

  /* Advance the interpolation clocks. Missions call this once a frame
     and then read `at()` for each remote they are drawing. */
  function update(dt) {
    for (const r of remotes.values()) r.t += dt;
  }

  /* Where a remote is *now*, one tick behind where they said they
     were. Being a frame late and smooth beats being current and
     jumping, every time. */
  function at(playerId) {
    const r = remotes.get(playerId);
    if (!r || !r.next) return null;
    const k = U.clamp(r.t / r.span, 0, 1.35);
    return { a: r.prev || r.next, b: r.next, k };
  }

  const seen = (playerId) => remotes.has(playerId);
  const others = () => [...remotes.keys()];

  /* ---------------- events ---------------- */

  function event(data, toPeer) {
    if (!live) return;
    Party.post('mev', { k: 'event', m: missionId, data }, toPeer);
  }

  const toHost = (data) => event(data, Party.hostId);

  /* ---------------- the board ----------------
     Every client reports its own run. The host waits for all of them,
     or gives up on a straggler after a while rather than leaving two
     people staring at a scoreboard that never arrives. */

  function report(mine) {
    if (!live) return Promise.resolve(null);
    const me = Party.selfId();
    if (Party.isHost) {
      takeReport(me, mine);
    } else {
      Party.post('mev', { k: 'report', m: missionId, data: mine }, Party.hostId);
    }
    if (board) return Promise.resolve(board);
    return new Promise((resolve) => { boardWaiters.push(resolve); });
  }

  function takeReport(playerId, data) {
    if (!Party.isHost || !data) return;
    reports.set(playerId, Object.assign({}, data, { playerId }));
    /* Who the host is still waiting on. In a night that is everybody
       still alive; in a mission party it is whoever is in the room,
       which may well be two. Falling back to `Party.MAX` made a pair
       sit through the straggler timeout every single time. */
    if (reports.size >= expectedReportCount()) { publish(); return; }
    if (!reportsOpenedAt) reportsOpenedAt = Date.now();
    armReportTimer();
  }

  function expectedReportCount() {
    return Session.state
      ? Session.state.players.filter(p => p.alive).length
      : Math.max(1, Party.roster().length);
  }

  /* Anybody expected who has neither reported nor gone quiet. While
     there is one of these the board is not late, it is early. */
  function stillPlaying() {
    const now = Date.now();
    return expectedPlayers().some(id => !reports.has(id)
      && id !== Party.selfId()
      && remotes.has(id)
      && now - (remotes.get(id).at || 0) < REPORT_ALIVE_GRACE);
  }

  function armReportTimer() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      reportTimer = null;
      if (!live || !Party.isHost) return;
      if (Date.now() - reportsOpenedAt < REPORT_MAX_WAIT && stillPlaying()) {
        armReportTimer();
        return;
      }
      publish();
    }, REPORT_TIMEOUT);
  }

  function publish() {
    if (!Party.isHost) return;
    clearTimeout(reportTimer);
    reportTimer = null;
    const rows = [...reports.values()];
    const built = {
      missionId,
      columns: (rows[0] && rows[0].columns) || [],
      earned: rows.reduce((n, r) => n + Math.max(0, Math.round(r.earned || 0)), 0),
      completed: rows.some(r => r.completed),
      players: rows,
    };
    Party.post('mev', { k: 'board', m: missionId, board: built });
    settle(built);
  }

  /* Loading a forest and compiling its shaders takes a very different
     amount of time on three devices. Nobody's countdown begins until all
     current players have attached to this mission. Guests repeat Ready
     until the host releases the gate, so attach order cannot lose it. */
  function expectedPlayers() {
    if (typeof Session !== 'undefined' && Session.state) {
      return Session.state.players.filter(p => p.alive).map(p => p.id);
    }
    return Party.roster().map(p => p.id);
  }

  function takeReady(playerId) {
    if (!live || !Party.isHost || !playerId) return;
    if (expectedPlayers().indexOf(playerId) < 0) return;
    if (started) {
      if (playerId !== Party.selfId()) {
        Party.post('mev', { k: 'start', m: missionId }, playerId);
      }
      return;
    }
    readyPeers.add(playerId);
    const expected = expectedPlayers();
    if (!started && expected.length && expected.every(id => readyPeers.has(id))) {
      Party.post('mev', { k: 'start', m: missionId });
      settleStart();
    }
  }

  function settleStart() {
    if (started) return;
    started = true;
    clearInterval(readyTimer);
    readyTimer = null;
    const waiting = startWaiters;
    startWaiters = [];
    waiting.forEach(fn => { try { fn(true); } catch (e) { console.warn(e); } });
  }

  function waitForStart() {
    if (!live || started) return Promise.resolve(true);
    return new Promise(resolve => { startWaiters.push(resolve); });
  }

  function settle(b) {
    board = b;
    const waiting = boardWaiters;
    boardWaiters = [];
    waiting.forEach(fn => { try { fn(b); } catch (e) { console.warn(e); } });
    emit('board', b);
  }

  return { attach, detach, pose, update, at, seen, others, event, toHost,
           report, waitForStart, on,
           /* How long a client should be prepared to wait for a board
              before giving up and drawing its own row alone. It has to
              outlast the host's own patience, or the two of them race
              and the loser is the player who gets no scoreboard. */
           BOARD_WAIT: REPORT_MAX_WAIT + REPORT_TIMEOUT + 5000,
           get live() { return live; },
           get board() { return board; } };
})();
