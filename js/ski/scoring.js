/* Run-owned ledger: forward-only rewards and banked three-second chains. */
class SkiScoring {
  constructor(mode) {
    this.mode = mode; this.style = 0; this.bestChain = 0; this.chain = 0;
    this.until = -1; this.lastZ = -Infinity; this.progress = 0;
    this.families = new Set(); this.chainFamilies = new Set(); this.repeats = new Map();
    this.awards = new Set(); this.grindDistance = 0; this.splits = []; this.crashLocations = [];
  }
  advance(z) { const d = Math.max(0, z - this.progress); this.progress = Math.max(z, this.progress); return d; }
  once(id) { if (this.awards.has(id)) return false; this.awards.add(id); return true; }
  landing(tk, z, time, flow) {
    if (!tk.landed || tk.grade.id === 'sketchy' || z < this.lastZ + 8) return 0;
    if (!(tk.spins || tk.flips || tk.rolls || tk.grabbed || tk.grind)) return 0;
    if (time > this.until) { this.chain = 0; this.chainFamilies.clear(); }
    const family = tk.family || (tk.grind ? 'grind' : tk.flips ? 'flip' : tk.spins ? 'spin' : 'grab');
    const name = tk.name || family;
    const repeat = this.repeats.get(name) || 0;
    this.repeats.set(name, repeat + 1);
    this.families.add(family); this.chainFamilies.add(family);
    const base = 100 + tk.spins * 180 + tk.flips * 280 + tk.rolls * 320 + (tk.grabbed ? 100 : 0) + (tk.grind || 0) * 12;
    const points = Math.round(Math.min(2200, base * (1 + this.chainFamilies.size * 0.2) / (1 + repeat * 0.65)));
    this.style += points; this.chain += points; this.bestChain = Math.max(this.bestChain, this.chain);
    this.until = time + 3; this.lastZ = z;
    return this.mode === 'practice' ? 0 : Math.min(800, Math.round(points * (0.5 + flow * 0.16)));
  }
  crash(z) { this.chain = 0; this.until = -1; this.chainFamilies.clear(); this.crashLocations.push(Math.round(z)); }
}
