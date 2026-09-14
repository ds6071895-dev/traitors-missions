/* Uses the real Skier and Three math, not a scalar terrain approximation.
   THREE_TEST_ASSET points to the same r160 script used by index.html. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const H = require('./harness');
const asset = process.env.THREE_TEST_ASSET;
if (!asset) throw new Error('Set THREE_TEST_ASSET to a local copy of the Three.js r160 browser dependency');
const THREE = require(asset);
const c = H.load(['js/core/util.js', 'js/world/conditions.js', 'js/world/forest.js', 'js/world/mountain.js',
  'js/ski/tricks.js', 'js/ski/scoring.js', 'js/ski/progression.js', 'js/ski/course.js',
  'js/ski/surfaces.js', 'js/entities/skier.js'], { THREE });
const { U, Skier, SkiCourse, SkiTricks, SkiScoring, SkiSurfaces, SkiProgression } = c;
const faceFor = seed => { const face = SkiCourse.makeFace(seed); const descriptor = SkiCourse.resolve(face, seed, {}, {}); return { face, descriptor }; };
const plane = { heightAt: (x, z) => 0 - z * .24, normalAt: () => ({ nx: 0, ny: .9724, nz: .2334, gx: 0, gz: .24 }), cxAt: () => 0, cxSlopeAt: () => 0, edge: 200, sectionAt: () => ({ def: { region: 'summit' } }) };
function skier(world = { face: plane }) { const s = new Skier({ figure: false }); s.place(0, 0, 0, world); return s; }
const a = skier(), b = skier();
a.speed = b.speed = 20; a.vel.set(0, 20); b.vel.set(0, 20);
a._launch({ face: plane }, 1, true); b._launch({ face: plane }, 1, true);
for (let i = 0; i < 40; i++) {
  a.update(1 / 90, { steer: 0, throttle: 0, trick: false }, { face: plane });
  b.update(1 / 90, { steer: 1, throttle: 1, trick: true }, { face: plane });
  assert.ok(Math.abs(a.pos.y - b.pos.y) < 1e-8, 'tricks must never add lift');
}
assert.equal(a.airYaw, 0, 'no automatic tricks');
const rotation = { airYaw: 1.4, airPitch: 1.2, airRoll: 0, grab: 0, vy: -10 };
SkiTricks.step(rotation, 1 / 60, { trick: false });
assert.equal(rotation.airPitch, 1.2, 'outside assist window stays incomplete');
assert.equal(rotation.vy, -10);
const switchSkier = skier(); switchSkier.airTime = 1; switchSkier.airYaw = Math.PI; switchSkier.vel.set(0, 20); switchSkier.vy = -10;
switchSkier._touchdown({ face: plane }, plane.normalAt());
assert.equal(switchSkier.switch, true); assert.equal(switchSkier.lastTrick.spins, .5); assert.equal(switchSkier.lastTrick.landed, true);
const roof = { id: 'roof', x: 0, z: 0, y: 5, slope: 0, thickness: 1, halfX: 10, halfZ: 10, material: 'roof' };
const surfaces = new SkiSurfaces(plane, { surfaces: [roof], rails: [{ id: 'test', points: [{x:0,y:2,z:0},{x:0,y:2,z:20}] }] });
assert.equal(surfaces.query(0, 0, 0).height, 0, 'roof above cannot become ground');
assert.equal(surfaces.query(0, 0, 6).height, 5);
assert.equal(surfaces.query(11, 0, 6).height, 0, 'platform edge');
const pitched = new SkiSurfaces(plane,{surfaces:[{...roof,rise:4}],rails:[]});
assert.equal(pitched.query(0,0,10).height,9,'gable ridge matches the visible roof');
assert.equal(pitched.query(5,0,10).height,7,'gable slopes down to the eaves');
assert.ok(pitched.query(5,0,10).normal.nx>0,'roof normal follows the pitched surface');
assert.equal(pitched.query(0,0,0).height,0,'pitched roof cannot pull a skier up from below');
assert.equal(surfaces.underside({y:1}, {x:0,y:3,z:0}), 2.4);
assert.ok(surfaces.railAt({x:0,y:3,z:5},{x:0,y:1.9,z:6},0,0));
assert.equal(surfaces.railAt({x:0,y:3,z:5},{x:0,y:1.9,z:6},Math.PI/2,0),null);
const grind = skier(); grind.grinding = surfaces.rails[0]; grind.grindBalance = 0; grind.grindDistance = 0; grind.speed = 15; grind.pos.set(0,2,1);
grind._grindStep(.1,{trick:true},{face:plane}); grind._grindStep(.1,{trick:false},{face:plane});
assert.equal(grind.airborne,true); assert.ok(grind.grindExit>0);
const easyRail={id:'easy',points:[{x:0,y:.7,z:0},{x:0,y:-9,z:40},{x:4,y:-18,z:80}]};
const railWorld={face:plane,surfaces:new SkiSurfaces(plane,{surfaces:[],rails:[easyRail]})};
const rider=skier(railWorld);rider.place(1,0,0,railWorld);rider.vel.set(0,20);rider.speed=20;
for(let i=0;i<10&&!rider.grinding;i++)rider.update(1/90,{steer:0,throttle:0,trick:false},railWorld);
assert.ok(rider.grinding,'skiing onto an aligned low rail engages it');
for(let i=0;i<90;i++)rider.update(1/90,{steer:0,throttle:0,trick:false},railWorld);
assert.ok(rider.grinding&&!rider.crashed,'neutral input holds a smooth grind');
assert.ok(rider.grindDistance>18,'rail ride makes real progress');
assert.ok(Math.abs(rider.grindBalance)<.3,'neutral input recentres the skis');
for(let i=0;i<35;i++)rider.update(1/90,{steer:0,throttle:0,trick:true},railWorld);
rider.update(1/90,{steer:0,throttle:0,trick:false},railWorld);
assert.ok(rider.airborne&&!rider.grinding,'charged pop exits a real grind');
const walls = new SkiSurfaces(plane, { surfaces: [], rails: [], solids: [
  { id: 'wall', min: { x: 2, y: 0, z: 3 }, max: { x: 3, y: 5, z: 10 } },
] });
assert.ok(walls.solidContact({x:0,y:1,z:5},{x:10,y:1,z:5}), 'swept wall blocks even when the final point passes beyond it');
assert.equal(walls.solidContact({x:0,y:7,z:5},{x:10,y:7,z:5}), null, 'clear air above wall');
assert.equal(walls.solidContact({x:0,y:1,z:0},{x:10,y:1,z:0}), null, 'open passage');
const {face: descriptorFace, descriptor: descriptorCheck} = faceFor(42);
assert.ok(descriptorCheck.solids.length > 10);
assert.equal(new Set(SkiCourse.catalog.map(s => JSON.stringify(s.layout))).size, 24, 'all sections have authored placements');
assert.notEqual(JSON.stringify(faceFor(43).descriptor.routes[0].style), JSON.stringify(descriptorCheck.routes[0].style));
for (const section of descriptorFace.sections.slice(1)) {
  assert.ok(Math.abs(descriptorFace.cxAt(section.z0-.001)-descriptorFace.cxAt(section.z0+.001))<.01);
  assert.ok(Math.abs(descriptorFace.cxSlopeAt(section.z0-.01)-descriptorFace.cxSlopeAt(section.z0+.01))<.01);
}
const ledger = new SkiScoring('prize'), trick = { landed:true,grade:{id:'clean'},spins:1,flips:0,rolls:0,grabbed:false,name:'360',family:'spin' };
const first = ledger.landing(trick, 10, 1, 3);
assert.equal(ledger.landing(trick, 10, 2, 3), 0);
assert.ok(ledger.landing(trick, 30, 3, 3) < first);
assert.equal(ledger.advance(100), 100); assert.equal(ledger.advance(30), 0); assert.equal(ledger.advance(100), 0);
assert.ok(ledger.once('gate')); assert.equal(ledger.once('gate'), false);
const banked = ledger.style; ledger.crash(100); assert.equal(ledger.style, banked); assert.equal(ledger.chain, 0);
assert.equal(new SkiScoring('practice').landing(trick,10,1,3),0);
assert.equal(SkiProgression.challenges.length,24); assert.equal(SkiProgression.rewards.length,12);
assert.equal(SkiProgression.complete({mode:'practice',completed:true,carveMetres:9999}).length,0);
assert.equal(SkiProgression.complete({mode:'prize',completed:true,carveMetres:9999}).length,6);
assert.equal(SkiProgression.complete({mode:'prize',completed:true,carveMetres:9999}).length,0);
c.localStorage.setItem = () => { throw Error('quota'); }; assert.equal(SkiProgression.favourite(1),false);
for (const hz of [30,60,120]) {
  const s = skier();
  for(let i=0;i<hz*10;i++)s.update(1/hz,{steer:0,throttle:.5,trick:false},{face:plane});
  if(hz===30) global.reference = s.pos.z;
  else assert.ok(Math.abs(s.pos.z-global.reference)<.2, 'frame-rate trajectory');
}
const results=[];
for(let i=0;i<(process.env.DESCENT_BRANCHES_ONLY ? 0 : 100);i++) {
  const seed=1+i*104729, {face,descriptor}=faceFor(seed);
  assert.deepEqual(Array.from(SkiCourse.validate(descriptor)),[]);
  assert.equal(new Set(descriptor.sectionIds).size,6);
  const world={face,surfaces:new SkiSurfaces(face,descriptor),colliders:[]};
  const s=new Skier({figure:false});s.place(face.cxAt(0),0,Math.atan(face.cxSlopeAt(0)),world);
  let crashes=0, previousCrash=false, elapsed=0;
  for(;elapsed<220 && s.pos.z<face.total;elapsed+=1/30){
    const look=18+s.speed*.6, target=face.cxAt(s.pos.z+look);
    const desired=Math.atan2(target-s.pos.x,look);
    const error=U.wrapAngle(desired-s.heading);
    s.update(1/30,{steer:U.clamp(-error*2.8,-1,1),throttle:0,trick:false},world);
    if(s.crashed&&!previousCrash)crashes++;
    previousCrash=s.crashed;
    assert.ok(Number.isFinite(s.pos.y));
    if(s.crashed)assert.ok(s.pos.z>=0);
  }
  results.push({seed,completed:s.pos.z>=face.total,elapsed:Math.round(elapsed*10)/10,crashes,z:Math.round(s.pos.z)});
  assert.ok(s.pos.z>=face.total, 'main route failed '+JSON.stringify(results[results.length-1]));
  if(i%20===0)console.log('simulated '+(i+1)+' seeds');
}
const branchResults = [];
for (const routeKind of ['cut','style']) for (const snow of c.SkiConditions.SNOW) {
  const seed = 42, {face,descriptor} = faceFor(seed);
  const world = {face, surfaces:new SkiSurfaces(face,descriptor),colliders:[]};
  const s = new Skier({figure:false,snow}); s.place(face.cxAt(0),0,Math.atan(face.cxSlopeAt(0)),world);
  let elapsed=0,crashes=0,wasCrash=false;
  for (;elapsed<260 && s.pos.z<face.total;elapsed+=1/30) {
    const look=18+s.speed*.6,z=s.pos.z+look;
    const route=descriptor.routes.find(r=>z>=r.z0&&z<=r.z1);
    const path=route&&route[routeKind];
    const target=path ? path[Math.min(path.length-1,Math.round((z-route.z0)/4))].x : face.cxAt(z);
    const desired=Math.atan2(target-s.pos.x,look);
    s.update(1/30,{steer:U.clamp(-U.wrapAngle(desired-s.heading)*2.8,-1,1),throttle:0,trick:false},world);
    if(s.crashed&&!wasCrash)crashes++;wasCrash=s.crashed;
  }
  const result={route:routeKind,snow:snow.id,completed:s.pos.z>=face.total,elapsed,crashes};
  branchResults.push(result);assert.ok(result.completed,'branch failed '+JSON.stringify(result));
}
fs.writeFileSync('/tmp/descent-branches.json',JSON.stringify(branchResults,null,2));
if(results.length)fs.writeFileSync('/tmp/descent-simulations.json',JSON.stringify(results,null,2));
console.log('PASS: manual tricks, frame rates, rail entry/exit, switch, surfaces, rewards, progression; '+results.length+' main descents and '+branchResults.length+' branch/snow descents');
if(results.length)console.log('Seconds '+Math.min(...results.map(r=>r.elapsed))+'–'+Math.max(...results.map(r=>r.elapsed))+'; crashes '+results.reduce((s,r)=>s+r.crashes,0));
