/* ------------------------------------------------------------------
   netstats.js — the line, on screen, for a playtest.

   "It's laggy" is three different problems: a slow machine, a slow
   network, or a voice buffer running dry. Open the game with `?net=1`
   (or set localStorage `netOverlay` to `1`) and a corner of the screen
   says which: the game socket's round trip and how much it wobbles, the
   voice socket's, bytes each way, and for every voice in the room how
   deep its buffer is and how often it has run dry.

   It reads, and never changes anything. Off, it costs nothing.
------------------------------------------------------------------ */
const NetStats = (() => {
  let el = null;
  let frames = 0, fps = 0, worst = 0, shown = 0, last = 0, since = 0;

  function wanted() {
    try {
      if (/[?&]net=1(?:&|$)/.test(location.search)) return true;
      return localStorage.getItem('netOverlay') === '1';
    } catch (e) { return false; }
  }

  const kb = (n) => (n >= 1024 ? (n / 1024).toFixed(1) + ' KB/s' : (n || 0) + ' B/s');
  const ms = (n) => Math.round(n || 0) + 'ms';

  function nameOf(id) {
    const s = typeof Session !== 'undefined' && Session.state;
    const p = s && s.players.find(x => x.id === id);
    if (p) return p.name;
    const r = typeof Party !== 'undefined' && Party.roster ? Party.roster().find(x => x.id === id) : null;
    if (r) return r.name;
    if (typeof ServerAudio !== 'undefined' && (id === ServerAudio.CLAUDIA || id === ServerAudio.CLAUDIA_LINE)) return 'Claudia';
    return id.slice(0, 6);
  }

  function render() {
    if (!el) return;
    const lines = [];
    const room = typeof Party !== 'undefined' && Party.netStats;
    if (room) {
      lines.push('room  ' + ms(room.rtt) + ' ±' + ms(room.jitter) + '  in ' + kb(room.inBps) + '  out ' + kb(room.outBps)
        + (room.backlog ? '  backlog ' + room.backlog : '') + (room.reconnects ? '  drops ' + room.reconnects : ''));
    } else lines.push('room  not connected');
    const audio = typeof ServerAudio !== 'undefined' && ServerAudio.stats ? ServerAudio.stats() : null;
    if (audio) {
      const v = audio.voice;
      lines.push('voice ' + audio.mode + (v ? ' ' + v.codec + (v.connected ? '' : ' (down)') + '  ' + ms(v.rtt) + ' ±' + ms(v.jitter)
        + '  in ' + kb(v.inBps) + '  out ' + kb(v.outBps) + (v.skipped ? '  skipped ' + v.skipped : '') : ''));
      for (const [id, p] of Object.entries(audio.peers || {})) {
        lines.push('  ' + nameOf(id).padEnd(10) + ' buffer ' + p.depth + '/' + p.target + 'ms  dry ' + p.underruns);
      }
    }
    // the device's half: if this is low, the lag is the machine, not the line
    lines.push('frame ' + fps + ' fps  worst ' + ms(shown));
    el.textContent = lines.join('\n');
  }

  function init() {
    if (el || !wanted() || typeof document === 'undefined') return;
    el = document.createElement('pre');
    el.id = 'netstats';
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:6px 8px;'
      + 'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#e8f0e8;background:rgba(0,0,0,.66);'
      + 'border-radius:4px;pointer-events:none;white-space:pre;max-width:calc(100vw - 16px);overflow:hidden';
    document.body.appendChild(el);
    const count = (t) => {
      if (last) worst = Math.max(worst, t - last);
      last = t; frames++;
      if (t - since >= 1000) { fps = Math.round(frames * 1000 / (t - since)); frames = 0; since = t; shown = worst; worst = 0; }
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    setInterval(render, 500);
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return { init, render };
})();
