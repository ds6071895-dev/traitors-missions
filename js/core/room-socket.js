/* Server rooms: one authenticated socket per player, with ordered replay of
   game messages during a brief interruption. Voice frames are never replayed. */
const RoomSocket = (() => {
  // These snapshots are replaced by the next update. Actions/results are reliable.
  const livePost = (channel) => channel === 'sync';
  const LIVE_BUFFER = 16 * 1024;
  function create(options) {
    let socket = null, stopped = false, admitted = false, active = false;
    let token = null, seq = 0, received = 0, lastSeen = 0, retrySince = 0;
    let retryTimer = null, connectTimer = null, heartbeat = null;
    let resolveOpen, rejectOpen;
    const outgoing = new Map();
    let outgoingBytes = 0;
    const incoming = [];
    /* How the line is doing, for anybody who wants to tell a slow network
       from a slow machine: the round trip (smoothed), how much it wobbles,
       and bytes each way over the last second. */
    const stats = { rtt: 0, jitter: 0, inBps: 0, outBps: 0, backlog: 0, reconnects: 0 };
    let bytesIn = 0, bytesOut = 0, bytesAt = Date.now();
    function count(dir, n) {
      const now = Date.now();
      if (now - bytesAt >= 1000) {
        const secs = (now - bytesAt) / 1000;
        stats.inBps = Math.round(bytesIn / secs); stats.outBps = Math.round(bytesOut / secs);
        bytesIn = bytesOut = 0; bytesAt = now;
      }
      if (dir) bytesIn += n; else bytesOut += n;
    }
    function sampleRtt(t) {
      if (!Number.isFinite(t)) return;
      const rtt = Math.max(0, Date.now() - t);
      if (!stats.rtt) { stats.rtt = rtt; return; }
      stats.jitter += (Math.abs(rtt - stats.rtt) - stats.jitter) / 8;
      stats.rtt += (rtt - stats.rtt) / 8;
    }
    const ready = new Promise((resolve, reject) => { resolveOpen = resolve; rejectOpen = reject; });
    const room = {
      server: true, selfId: null, code: null, hostId: null, players: [],
      onRoster: null, onMessage: null, onStatus: null, onClose: null, onAudio: null,
      open() { connect(); return ready; },
      activate() { active = true; while (incoming.length && !stopped) dispatch(incoming.shift()); },
      post(channel, data, to) {
        if (livePost(channel, data)) {
          if (live() && socket.bufferedAmount < LIVE_BUFFER) send({ type: 'post', channel, data, to, live: true });
          return;
        }
        reliable({ type: 'post', channel, data, to });
      },
      updateProfile(profile) { reliable({ type: 'profile', profile }); },
      setLobby() { reliable({ type: 'lobby' }); },
      setRoutes(routes) { reliable({ type: 'routes', routes }); },
      sendAI(message) { reliable(Object.assign({}, message, { type: 'ai' })); },
      sendClaudia(message) { reliable(Object.assign({}, message, { type: 'claudia' })); },
      sendAudio(data) {
        if (live() && socket.bufferedAmount < LIVE_BUFFER) { socket.send(data); count(0, data.byteLength || 0); }
      },
      /* For the voice worker, which opens its own socket as this member. */
      get token() { return token; },
      get voiceUrl() {
        try {
          const url = new URL(window.ROOM_SERVER_URL || '/rooms', window.location.href);
          if (url.protocol === 'http:') url.protocol = 'ws:';
          if (url.protocol === 'https:') url.protocol = 'wss:';
          url.searchParams.set('voice', '1');
          return url.href;
        } catch (e) { return null; }
      },
      get stats() { stats.backlog = socket ? socket.bufferedAmount || 0 : 0; return stats; },
      leave() {
        if (stopped) return;
        send({ type: 'leave' });
        stop();
        const error = new Error('Room connection cancelled.'); error.name = 'AbortError';
        rejectOpen(error);
      },
      get reconnecting() { return admitted && !live() && !stopped; },
    };
    const live = () => admitted && socket && socket.readyState === 1 && !retrySince;
    function send(message) {
      if (socket && socket.readyState === 1) { const data = JSON.stringify(message); socket.send(data); count(0, data.length); }
    }
    function reliable(message) {
      if (stopped) return;
      const value = JSON.stringify({ ...message, seq: ++seq });
      outgoing.set(seq, value); outgoingBytes += value.length;
      if (outgoing.size > 1024 || outgoingBytes > 2 * 1024 * 1024) {
        fail('The connection fell too far behind. Please rejoin.'); return;
      }
      if (live()) { socket.send(value); count(0, value.length); }
    }
    function stop() {
      stopped = true;
      clearTimeout(retryTimer); clearTimeout(connectTimer); clearInterval(heartbeat);
      const old = socket; socket = null;
      if (old) { try { old.close(); } catch (e) {} }
      outgoing.clear(); incoming.length = 0;
    }
    function fail(message) {
      if (stopped) return;
      stop();
      rejectOpen(new Error(message));
      if (admitted && room.onClose) room.onClose(message);
    }
    function dispatch(msg) {
      if (msg.type === 'roster') {
        room.players = msg.players; room.hostId = msg.hostId;
        if (room.onRoster) room.onRoster(msg.players, msg.hostId);
      } else if (msg.type === 'post' && room.onMessage) room.onMessage(msg.channel, msg.data, msg.from);
      else if (msg.type === 'ai' && room.onAI) room.onAI(msg);
      else if (msg.type === 'claudia' && room.onClaudia) room.onClaudia(msg);
    }
    function connect() {
      if (stopped) return;
      let url;
      try {
        url = new URL(window.ROOM_SERVER_URL || '/rooms', window.location.href);
        if (url.protocol === 'http:') url.protocol = 'ws:';
        if (url.protocol === 'https:') url.protocol = 'wss:';
        if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error();
        socket = new window.WebSocket(url.href);
        socket.binaryType = 'arraybuffer';
      } catch (e) { fail('Could not open the room server. Open the game from its server URL.'); return; }
      const current = socket;
      const isCurrent = () => !stopped && current === socket;
      connectTimer = setTimeout(() => {
        if (!isCurrent()) return;
        if (!admitted) fail('The room server did not answer. Please try again.');
        else current.close();
      }, 10000);
      current.onopen = () => {
        if (!isCurrent()) return;
        lastSeen = Date.now();
        send({ type: 'join', token, host: options.host, code: options.code, profile: options.profile });
      };
      current.onmessage = event => {
        if (!isCurrent()) return;
        lastSeen = Date.now();
        count(1, typeof event.data === 'string' ? event.data.length : (event.data.byteLength || 0));
        if (typeof event.data !== 'string') {
          if (active && room.onAudio) room.onAudio(event.data);
          return;
        }
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { fail('Invalid response from the room server.'); return; }
        if (msg.type === 'error') { fail(msg.message || 'The room connection ended.'); return; }
        if (msg.type === 'welcome') {
          clearTimeout(connectTimer);
          const resumed = admitted;
          admitted = true; retrySince = 0; token = msg.token;
          room.selfId = msg.id; room.code = msg.code; room.hostId = msg.hostId;
          // A resume replays earlier messages before delivering a new roster.
          if (!resumed) room.players = msg.players;
          for (const data of outgoing.values()) current.send(data);
          send({ type: 'ack', seq: received });
          if (!heartbeat) heartbeat = setInterval(() => {
            if (!socket || socket.readyState !== 1) return;
            if (Date.now() - lastSeen > 12000) { socket.close(); return; }
            send({ type: 'ping', t: Date.now() });
          }, 4000);
          resolveOpen(room);
          if (room.onStatus) room.onStatus(false);
          return;
        }
        if (msg.type === 'pong') { sampleRtt(msg.t); return; }
        if (msg.type === 'ack') {
          for (const [id, value] of outgoing) {
            if (id <= msg.seq) { outgoing.delete(id); outgoingBytes -= value.length; }
          }
          return;
        }
        if (msg.seq) {
          if (msg.seq <= received) { send({ type: 'ack', seq: received }); return; }
          if (msg.seq !== received + 1) { fail('Room messages arrived out of order. Please rejoin.'); return; }
          received = msg.seq;
        }
        if (active) dispatch(msg); else incoming.push(msg);
        if (msg.seq) send({ type: 'ack', seq: received });
      };
      current.onerror = () => {}; // close or the connection timer supplies one clear error
      current.onclose = () => {
        if (!isCurrent()) return;
        clearTimeout(connectTimer);
        socket = null;
        if (!admitted) { fail('Could not reach the room server. Please try again.'); return; }
        if (!retrySince) { retrySince = Date.now(); stats.reconnects++; }
        if (Date.now() - retrySince >= 15000) { fail('The room connection was lost. Please rejoin.'); return; }
        if (room.onStatus) room.onStatus(true);
        retryTimer = setTimeout(connect, 500);
      };
    }
    return room;
  }
  return { create };
})();
