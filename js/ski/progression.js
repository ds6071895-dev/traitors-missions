const SkiProgression = (() => {
  const KEY = 'traitors.descent.progress.v2';
  const rewards = ['Sunrise outfit', 'Glacier outfit', 'Pine outfit', 'Village outfit', 'Coral skis', 'Cobalt skis', 'Gold skis', 'Ink skis', 'Pearl trail', 'Azure trail', 'Rose trail', 'Amber trail'];
  const challenges = ['carving', 'air', 'rails', 'exploration'].flatMap((family, f) =>
    Array.from({ length: 6 }, (_, i) => ({ id: family + '-' + i, family,
      name: ['Carve metres', 'Land tricks', 'Grind metres', 'Complete routes'][f] + ' ' + (i + 1),
      target: [150, 2, 12, 1][f] * (i + 1), reward: Math.floor((f * 6 + i) / 2) })));
  function read() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.version === 2) return { version: 2,
        done: Array.isArray(d.done) ? d.done.filter(id => challenges.some(c => c.id === id)) : [],
        favourites: Array.isArray(d.favourites) ? d.favourites.filter(Number.isInteger).slice(0, 30) : [],
        equipped: Number.isInteger(d.equipped) ? d.equipped : -1 };
    } catch (_) {}
    return { version: 2, done: [], favourites: [], equipped: -1 };
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (_) { return false; } }
  function complete(r) {
    if (r.mode === 'practice' || !r.completed) return [];
    const d = read(), added = [];
    const values = { carving: r.carveMetres || 0, air: r.tricks || 0,
      rails: r.grindDistance || 0, exploration: r.chutes || 0 };
    for (const c of challenges) if (!d.done.includes(c.id) && values[c.family] >= c.target) {
      d.done.push(c.id); added.push(c.id);
    }
    save(d); return added;
  }
  function favourite(seed) { const d = read(); d.favourites = [...new Set([...d.favourites, seed])].slice(-30); return save(d); }
  function daily(day = U.dailySeed()) { return ['prize', 'trial', 'freestyle'].map((mode, i) => ({ seed: (day + i * 104729) >>> 0, mode, tod: 'day', daily: true, rulesVersion: 2 })); }
  return { read, save, complete, favourite, daily, challenges, rewards };
})();
