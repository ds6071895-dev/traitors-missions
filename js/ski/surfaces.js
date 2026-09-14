/* Spatially indexed, one-way top contacts. A roof above the skier is never ground. */
class SkiSurfaces {
  constructor(face, descriptor) {
    this.solidBuckets = new Map();
    for (const solid of descriptor.solids || []) for (let b = Math.floor(solid.min.z / 64); b <= Math.floor(solid.max.z / 64); b++) {
      if (!this.solidBuckets.has(b)) this.solidBuckets.set(b, []); this.solidBuckets.get(b).push(solid);
    }
    this.face = face; this.rails = descriptor.rails; this.buckets = new Map();
    for (const s of descriptor.surfaces) for (let b = Math.floor((s.z - s.halfZ) / 64); b <= Math.floor((s.z + s.halfZ) / 64); b++) {
      if (!this.buckets.has(b)) this.buckets.set(b, []); this.buckets.get(b).push(s);
    }
  }
  solidContact(previous, next, radius = 1.05, bodyHeight = 1.6) {
    let hit = null;
    const checked = new Set();
    for (let bucket = Math.floor((Math.min(previous.z, next.z) - radius) / 64); bucket <= Math.floor((Math.max(previous.z, next.z) + radius) / 64); bucket++) {
      for (const box of this.solidBuckets.get(bucket) || []) {
        if (checked.has(box.id)) continue; checked.add(box.id);
        let enter = 0, leave = 1, valid = true;
        for (const axis of ['x', 'y', 'z']) {
          const lo = box.min[axis] - (axis === 'y' ? bodyHeight : radius);
          const hi = box.max[axis] + (axis === 'y' ? 0 : radius);
          const v = next[axis] - previous[axis];
          if (Math.abs(v) < 1e-9) { if (previous[axis] < lo || previous[axis] > hi) valid = false; continue; }
          let a = (lo - previous[axis]) / v, b = (hi - previous[axis]) / v;
          if (a > b) [a, b] = [b, a];
          enter = Math.max(enter, a); leave = Math.min(leave, b);
        }
        if (valid && enter <= leave && leave >= 0 && enter <= 1 && (!hit || enter < hit.t)) hit = { id: box.id, t: enter };
      }
    }
    return hit;
  }
  near(z) { return this.buckets.get(Math.floor(z / 64)) || []; }
  height(s, x, z) {
    return s.y + (z-s.z)*s.slope + (s.rise || 0) * Math.max(0,1-Math.abs(x-s.x)/s.halfX);
  }
  query(x, z, previousY = -Infinity) {
    let height = this.face.heightAt(x, z), id = 'snow', material = this.face.sectionAt(z).def.region === 'glacier' ? 'ice' : 'snow';
    let normal = this.face.normalAt(x, z, {});
    for (const s of this.near(z)) {
      const y = this.height(s,x,z);
      if (Math.abs(x - s.x) <= s.halfX && Math.abs(z - s.z) <= s.halfZ && previousY >= y - .15 && y > height) {
        height = y; id = s.id; material = s.material;
        const gx = (s.rise || 0) * Math.sign(x-s.x) / s.halfX;
        const len = Math.hypot(1, s.slope,gx); normal = { nx: gx/len, ny: 1 / len, nz: -s.slope / len, gx, gz: -s.slope };
      }
    }
    return { height, normal, material, id };
  }
  underside(previous, next) {
    for (const s of this.near(next.z)) {
      if (Math.abs(next.x - s.x) > s.halfX || Math.abs(next.z - s.z) > s.halfZ) continue;
      const bottom = this.height(s,next.x,next.z) - s.thickness;
      if (previous.y + 1.6 < bottom && next.y + 1.6 >= bottom) return bottom - 1.6;
    }
    return null;
  }
  edge(previous, next) {
    for (const s of this.near(next.z)) {
      const inside = p => Math.abs(p.x - s.x) < s.halfX && Math.abs(p.z - s.z) < s.halfZ;
      if (inside(previous) || !inside(next)) continue;
      const top = this.height(s,next.x,next.z);
      if (next.y < top - .15 && next.y + 1.6 > top - s.thickness) return s.id;
    }
    return null;
  }
  railAt(previous, next, heading, cooldown, grounded = false) {
    if (cooldown > 0) return null;
    for (const rail of this.rails) for (let i = 1; i < rail.points.length; i++) {
      const a = rail.points[i - 1], b = rail.points[i];
      if (next.z < a.z - 1 || previous.z > b.z + 1) continue;
      const u = U.clamp((next.z - a.z) / (b.z - a.z), 0, 1);
      const x = U.lerp(a.x, b.x, u), y = U.lerp(a.y, b.y, u);
      const angle = Math.atan2(b.x - a.x, b.z - a.z);
      const lateral = Math.abs(next.x-x);
      const entry = grounded && next.z <= rail.points[0].z+12 && next.z >= rail.points[0].z-2 && next.y >= y-1.5 && next.y <= y+.35;
      const landing = !grounded && previous.y >= y-.55 && next.y <= y+.35;
      if (lateral < (entry ? 2.4 : 2.1) && (entry || landing)
          && Math.abs(SkiTricks.wrap(heading-angle,Math.PI)) < .72) return {rail,x,y,angle};
    }
    return null;
  }
}
