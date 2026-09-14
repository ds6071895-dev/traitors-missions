/* Manual rotations are independent of launch physics and simulation clocks. */
const SkiTricks = (() => {
  const TAU = Math.PI * 2;
  const wrap = (a, period) => a - Math.round(a / period) * period;
  function step(s, dt, ctl) {
    const held = !!ctl.trick;
    s._rotation ||= { yaw: 0, pitch: 0, roll: 0 };
    const diagonal = Math.abs(ctl.steer || 0) > 0.3 && Math.abs(ctl.throttle || 0) > 0.3;
    for (const [axis, input, rate, period] of [
      ['Yaw', -(ctl.steer || 0), 5.6, Math.PI],
      ['Pitch', ctl.throttle || 0, 4.5, TAU],
      ['Roll', diagonal ? -(ctl.steer || 0) * 0.55 : 0, 4.5, TAU],
    ]) {
      const key = axis.toLowerCase();
      const target = held ? input * rate : 0;
      s._rotation[key] += (target - s._rotation[key]) * (1 - Math.exp(-dt * (held ? 12 : 20)));
      s['air' + axis] += s._rotation[key] * dt;
      // Assist only inside 24 degrees, and at most 1.2 rad/s. Never touch vy.
      const error = wrap(s['air' + axis], period);
      if (!held && Math.abs(error) < 0.42) {
        s['air' + axis] -= Math.sign(error) * Math.min(Math.abs(error), 1.2 * dt);
      }
    }
    s.grab = ctl.grab ? Math.min(1, s.grab + dt * 8) : Math.max(0, s.grab - dt * 12);
    if (ctl.grab) { s.grabKind = ctl.grab; s._grabTime = (s._grabTime || 0) + dt; }
  }
  function describe(s) {
    const spins = Math.floor((Math.abs(s.airYaw) + 0.04) / Math.PI) / 2;
    const flips = Math.floor((Math.abs(s.airPitch) + 0.04) / TAU);
    const rolls = Math.floor((Math.abs(s.airRoll) + 0.04) / TAU);
    const grabbed = (s._grabTime || 0) >= 0.18;
    const parts = [];
    if (rolls) parts.push((rolls > 1 ? rolls + '× ' : '') + 'CORK');
    if (flips) parts.push((flips > 1 ? flips + '× ' : '') + (s.airPitch > 0 ? 'FRONTFLIP' : 'BACKFLIP'));
    if (spins) parts.push(String(spins * 360));
    if (grabbed) parts.push(s.grabKind === 2 ? 'TAIL' : 'MUTE');
    return { spins, flips, rolls, grabbed, name: parts.join(' ') || 'AIR',
      family: rolls ? 'cork' : flips ? 'flip' : spins ? 'spin' : grabbed ? 'grab' : 'air' };
  }
  return { step, describe, wrap };
})();
