/* ------------------------------------------------------------------
   ai.js — the host's line to the room's AI bridge.

   Everything here is host-only and goes through the room server, which
   holds the Deepgram key and the sockets (`server/ai-bridge.js`). The
   browser never touches Deepgram directly: it asks for a voice, tells a
   voice what is going on and when to speak, and hears back what was
   said, what was transcribed, and what tools were called.

   It knows nothing about the game. `AIPlayers` decides who exists and
   `AIDirector` decides who speaks; this is only the wire.
------------------------------------------------------------------ */
const AI = (() => {

  const CLAUDIA = (typeof ServerAudio !== 'undefined' && ServerAudio.CLAUDIA)
    || 'c1a0d1a0-0000-4000-8000-00000000c1a0';
  const KEY_STORE = 'traitors.deepgram';

  let status = 'off';                // off | checking | ready | error
  let error = null;
  const agents = new Map();          // id -> { ready, speaking, since, error }
  const listeners = new Map();
  let wired = false;

  function on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt).delete(fn);
  }
  function emit(evt, a) {
    (listeners.get(evt) || []).forEach(fn => { try { fn(a); } catch (e) { console.warn(e); } });
  }

  function wire() {
    if (wired || typeof Party === 'undefined') return;
    wired = true;
    Party.on('ai', (m) => {
      if (!m || !m.op) return;
      const a = m.id ? agents.get(m.id) : null;
      switch (m.op) {
        case 'status':
          status = m.ok === true ? 'ready' : m.ok === false ? 'error' : 'checking';
          error = m.ok === false ? (m.error || 'The key did not work.') : (m.warning || null);
          break;
        case 'ready': if (a) { a.ready = true; a.error = null; } break;
        case 'speaking': if (a) { a.speaking = true; a.since = Date.now(); } break;
        case 'done': if (a) a.speaking = false; break;
        case 'error': if (a) a.error = m.message; else error = m.message; break;
        case 'closed': agents.delete(m.id); break;
        default: break;
      }
      emit(m.op, m);
      emit('any', m);
    });
  }

  const send = (msg) => { wire(); if (typeof Party !== 'undefined' && Party.ai) Party.ai(msg); };

  /* ---------------- the key ---------------- */

  function storedKey() {
    try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
  }
  function remember(key, keep) {
    try { if (keep && key) localStorage.setItem(KEY_STORE, key); else localStorage.removeItem(KEY_STORE); } catch (e) {}
  }

  function configure(key) {
    wire();
    status = 'checking';
    error = null;
    send({ op: 'configure', key: String(key || '').trim() });
    emit('status', { ok: null });
  }

  /* ---------------- voices ---------------- */

  function spawn(spec) {
    if (!spec || !spec.id) return;
    agents.set(spec.id, { ready: false, speaking: false, since: 0, error: null, name: spec.name || '' });
    send({ op: 'spawn', id: spec.id, name: spec.name, voice: spec.voice,
           prompt: spec.prompt || '', functions: spec.functions || [] });
  }
  const prompt = (id, text) => send({ op: 'prompt', id, text });
  /* Word for word, queued behind anything already being said. */
  const say = (id, text) => { const a = agents.get(id); if (a) a.speaking = true; send({ op: 'say', id, text }); };
  /* A turn: something the voice should answer, in its own words. */
  const ask = (id, text) => { const a = agents.get(id); if (a) a.speaking = true; send({ op: 'ask', id, text }); };
  const tool = (id, callId, name, content) => send({ op: 'tool', id, callId, name, content: String(content) });
  const hush = (id, on) => { const a = agents.get(id); if (a && on) a.speaking = false; send({ op: 'hush', id, on: !!on }); };
  const close = (id) => { agents.delete(id); send({ op: 'close', id }); };
  const listen = (humans) => send({ op: 'listen', humans });
  function end() { send({ op: 'end' }); agents.clear(); }

  /* A fresh id for a new voice, in the shape the room's audio expects. */
  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    const h = () => Math.floor(Math.random() * 16).toString(16);
    const s = (n) => Array.from({ length: n }, h).join('');
    return s(8) + '-' + s(4) + '-4' + s(3) + '-8' + s(3) + '-' + s(12);
  }

  return {
    CLAUDIA, on, configure, spawn, prompt, say, ask, tool, hush, close, listen, end, newId,
    storedKey, remember,
    agent: (id) => agents.get(id) || null,
    speaking: (id) => !!(agents.get(id) && agents.get(id).speaking),
    anySpeaking: () => [...agents.values()].some(a => a.speaking),
    get status() { return status; },
    get error() { return error; },
    get ready() { return status === 'ready'; },
    get available() { return typeof Party !== 'undefined' && Party.connected && Party.isHost && !!Party.serverRoom; },
  };
})();
