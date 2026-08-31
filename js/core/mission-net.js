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
  const REPORT_TIMEOUT = 14000;     // how long the host waits for a straggler

  let live = false;
  let offs = [];
  let acc = 0;
  let missionId = null;

  const remotes = new Map();        // playerId -> { prev, next, t, pose }
  const reports = new Map();        // playerId -> report
  let boardWaiters = [];
  let board = null;
  let reportTimer = null;

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

    offs.push(Party.on('sync', (msg, peerId) => {
      if (!msg || msg.k !== 'pose') return;
      takePose(peerId, msg);
    }));

    offs.push(Party.on('mev', (msg, peerId) => {
      if (!msg) return;
      if (msg.k === 'event') { emit('event', msg.data, peerId); return; }
      if (msg.k === 'report') { takeReport(peerId, msg.data); return; }
      if (msg.k === 'board') { settle(msg.board); return; }
    }));

    offs.push(Party.on('left', (peerId) => { remotes.delete(peerId); }));
    return true;
  }

  function detach() {
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
    acc = 0;
  }

  /* ---------------- poses ----------------
     `pose` is whatever the mission wants it to be — a boat sends a
     position and a quaternion, an archer sends a position and a yaw.
     This file does not care, which is why it can serve both. */

  function pose(dt, make) {
    if (!live) return;
    acc += dt;
    if (acc < RATE) return;
    acc = 0;
    const p = make();
    if (!p) return;
    Party.post('sync', { k: 'pose', p, n: Date.now() });
  }

  function takePose(playerId, msg) {
    let r = remotes.get(playerId);
    if (!r) { r = { prev: null, next: null, t: 0, span: RATE }; remotes.set(playerId, r); }
    r.prev = r.next || msg.p;
    r.next = msg.p;
    r.span = Math.max(0.03, Math.min(0.5, r.t || RATE));
    r.t = 0;
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
    Party.post('mev', { k: 'event', data }, toPeer);
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
      Party.post('mev', { k: 'report', data: mine }, Party.hostId);
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
    const expected = Session.state
      ? Session.state.players.filter(p => p.alive).length
      : Math.max(1, Party.roster().length);
    if (reports.size >= expected) { publish(); return; }
    if (!reportTimer) reportTimer = setTimeout(publish, REPORT_TIMEOUT);
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
    Party.post('mev', { k: 'board', board: built });
    settle(built);
  }

  function settle(b) {
    board = b;
    const waiting = boardWaiters;
    boardWaiters = [];
    waiting.forEach(fn => { try { fn(b); } catch (e) { console.warn(e); } });
    emit('board', b);
  }

  return { attach, detach, pose, update, at, seen, others, event, toHost,
           report, on,
           get live() { return live; },
           get board() { return board; } };
})();
