const assert=require('node:assert/strict');
const H=require('./harness');const {test,section}=H;
const finishTravel=require('./travel-helper');
function fresh(parts){
 let time=10000;
 class Clock extends Date {static now(){return time;}}
 const ctx=H.load(['js/core/util.js','js/core/state.js','js/core/missions.js','js/missions/agendas.js','js/core/session.js','js/world/estate-layout.js'],{Date:Clock});
 ctx.GameState.load();for(const id of ['boat-race','shootout','dive','ski'])ctx.Missions.register({id,name:id,create:()=>({})});
 ctx.Session.startParty({seed:42,mode:'host',players:[{id:'a',local:true},{id:'b'},{id:'c'}],rehearsal:!!parts,parts});
 ctx.advance=s=>{time+=s*1000;};ctx.act=(type,id='a',extra={})=>ctx.Session.dispatch({type,playerId:id,journeyId:ctx.Session.state.travel?.id,...extra});
 ctx.ready=()=>ctx.Session.alive().forEach(p=>ctx.act('travelReady',p.id,{beat:ctx.Session.state.travel.beat}));
 ctx.tick=()=>ctx.act('travelTick','a',{authority:true});return ctx;
}
section('travel authority');
test('boarding starts only when every client has built; auto boarding is host owned',()=>{
 const c=fresh();c.Session.dispatch({type:'advance'});const j=c.Session.state.travel;
 assert.equal(j.direction,'outbound');assert.equal(j.beat,-1);
 c.act('travelReady','a',{beat:-1});c.act('travelReady','b',{beat:-1});c.advance(60);c.tick();assert.equal(j.startedAt,null);
 c.act('travelReady','c',{beat:-1});c.act('travelBoard');c.act('travelBoard');assert.deepEqual([...j.boarded],['a']);
 c.advance(29);c.tick();assert.equal(j.beat,-1);c.advance(1);c.act('travelTick','b',{authority:false});assert.equal(j.beat,-1);
 c.tick();assert.equal(j.beat,0);assert.equal(j.boarded.length,3);
});
test('unanimous skip finishes the safe beat and still waits at destination readiness',()=>{
 const c=fresh();c.Session.dispatch({type:'advance'});c.ready();for(const id of ['a','b','c'])c.act('travelBoard',id);c.tick();c.ready();
 const j=c.Session.state.travel;
 c.act('travelSkip','a');c.act('travelSkip','a');c.act('travelSkip','b');assert.equal(j.skip,false);c.act('travelSkip','c');assert.equal(j.skip,true);
 c.advance(3);c.tick();assert.equal(j.beat,0);c.advance(1);c.tick();assert.equal(j.beat,6);
 c.advance(100);c.tick();assert.equal(c.Session.state.phase,'travel');
 c.ready();c.advance(6);c.tick();assert.equal(c.Session.state.phase,'mission');
});
test('return IDs reject stale votes; the fire cannot expose or discuss during gathering',()=>{
 const c=fresh();c.Session.dispatch({type:'advance'});const id=c.Session.state.travel.id;finishTravel(c);
 c.Session.dispatch({type:'result',earned:40,completed:true});const j=c.Session.state.travel;
 assert.equal(j.direction,'return');assert.equal(c.Session.state.pot,40);
 c.act('travelBoard','a',{journeyId:id});assert.equal(j.boarded.length,0);
 c.Session.dispatch({type:'openFloor'});c.Session.dispatch({type:'expose'});assert.equal(c.Session.state.floor,null);assert.equal(c.Session.state.exposure,null);
 finishTravel(c);assert.equal(c.Session.state.phase,'finale');assert.equal(c.Session.state.pot,40);
});
test('travel snapshots contain only public choreography and elapsed host time',()=>{
 const c=fresh();c.Session.dispatch({type:'advance'});c.ready();c.advance(5);
 const snap=c.Session.snapshot();assert.equal(snap.travel.elapsed,5);
 assert.doesNotMatch(JSON.stringify(snap),/"role"|"agenda"|"secret"|"taskDone"/);
});
test('partial rehearsals insert journeys only between enabled adjacent sections',()=>{
 for(const parts of [['finale'],['intro','finale'],['m1'],['intro','m1'],['m1','finale']]){
  const c=fresh(parts);if(parts.includes('intro'))c.Session.dispatch({type:'advance'});
  if(parts.includes('intro')&&parts.includes('m1'))assert.equal(c.Session.state.travel.direction,'outbound');
  finishTravel(c);
  if(parts.includes('m1')){c.Session.dispatch({type:'result',earned:1});assert.equal(c.Session.state.phase,parts.includes('finale')?'travel':'verdict');}
  c.Session.abandon();
 }
});
section('authored estate geometry');
test('the lantern walk is one smooth, walkable, graded path from the forecourt to the fire',()=>{
 const l=fresh().EstateLayout,f=l.footpath;
 assert.ok(Math.hypot(f.points[0].x-l.path[0][0],f.points[0].z-l.path[0][2])<.01,'starts at the return stop');
 const last=f.points[f.points.length-1];assert.ok(Math.hypot(last.x-l.anchors.fire[0],last.z-l.anchors.fire[2])<.01,'ends at the fire');
 for(let i=1;i<f.points.length;i++){
  const a=f.points[i-1],b=f.points[i],run=Math.hypot(b.x-a.x,b.z-a.z);
  assert.ok((a.y-b.y)/run<.4,'too steep at '+a.along);assert.ok(b.y<=a.y+1e-9,'climbs at '+a.along);
  if(i>1&&a.along<=f.rim){const p=f.points[i-2],turn=Math.abs(Math.atan2(b.x-a.x,b.z-a.z)-Math.atan2(a.x-p.x,a.z-p.z));assert.ok(turn<.06,'kink at '+a.along);}
  const s=f.sample(a.along);
  // The graded bed is level across the paving, so nothing floats or buries it.
  for(const side of [-2,0,2]){const x=s.x+s.tz*side,z=s.z-s.tx*side;
   assert.ok(l.walkable(x,z),`unwalkable at ${x},${z}`);
   // Where the path meets the terrace, the level paving owns the ground.
   const onTerrace=Math.hypot(x-l.terrace.x,z-l.terrace.z)<12.4,h=l.heightAt(x,z);
   assert.ok(onTerrace?h<=a.y+1e-9:Math.abs(h-a.y)<.05,`bed off grade at ${x},${z}`);}
 }
 // The old lantern anchors still lie on the paving, so straight walks between them work.
 for(let i=1;i<l.path.length;i++)for(let t=0;t<=1;t+=.05){
  const a=l.path[i-1],b=l.path[i];assert.ok(l.walkable(a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t));
 }
});
test('road samples are continuous, finite and orthonormal over the whole route',()=>{
 const c=fresh(),road=c.EstateLayout.route;let prev=road.sample(0).position;
 for(let d=.5;d<road.length;d+=.5){const s=road.sample(d),p=s.position,t=s.tangent,n=s.normal;
  assert.ok(Object.values(p).every(Number.isFinite));assert.ok(Math.hypot(p.x-prev.x,p.y-prev.y,p.z-prev.z)<.51);
  assert.ok(Math.abs(t.x*n.x+t.y*n.y+t.z*n.z)<1e-8);assert.ok(Math.abs(Math.hypot(n.x,n.y,n.z)-1)<1e-8);prev=p;
 }
});
test('the fire terrace is level to its rim and nothing rises through it',()=>{
 const l=fresh().EstateLayout,t=l.terrace;
 for(let r=0;r<=12.35;r+=.25)for(let a=0;a<Math.PI*2;a+=.05)assert.equal(l.heightAt(t.x+Math.cos(a)*r,t.z+Math.sin(a)*r),t.y,`terrace off level at r=${r} a=${a}`);
 // Just outside, the ground only climbs where the seat wall holds it back.
 for(let a=0;a<Math.PI*2;a+=.05){const x=t.x+Math.cos(a)*12.5,z=t.z+Math.sin(a)*12.5,h=l.heightAt(x,z);if(l.footpath.nearest(x,z).distance<4)continue;assert.ok(h<=t.y+.05+t.wall.height*l.terraceWall(a),`bank over the rim at ${a}`);}
});
test('welcome, boarding, gate and terrace anchors are walkable; lakes are enclosed basins',()=>{
 const c=fresh(),l=c.EstateLayout;
 for(const key of ['welcome','boarding','gate','fire','returnStop','terraceEntrance']){const p=l.anchors[key];assert.ok(l.walkable(p[0],p[2]),key);assert.ok(Math.abs(l.heightAt(p[0],p[2])-p[1])<.2,key+' grounded');}
 for(const lake of l.lakes){assert.ok(l.heightAt(lake.x,lake.z)<lake.y);assert.ok(l.heightAt(lake.x+lake.rx*1.3,lake.z)>lake.y);}
});
test('steering is continuous across road sample boundaries',()=>{
 const road=fresh().EstateLayout.route;
 for(const point of road.points.slice(1,-1)){
  const a=road.sample(point.distance-.0001).tangent,b=road.sample(point.distance+.0001).tangent;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.001,'steering jump at '+point.distance);
 }
});
test('the whole car clears the forecourt wall, gatehouse and causeway in either direction',()=>{
 const l=fresh().EstateLayout,road=l.route;
 // Sweep a padded 2.26m by 5.2m footprint, including bumpers and tyres.
 for(let d=0;d<road.nearest(0,80).along;d+=.1){
  const {position:p,tangent:t}=road.sample(d),h=Math.hypot(t.x,t.z);
  for(let side=-1.13;side<=1.13;side+=.113)for(let forward=-2.6;forward<=2.6;forward+=.13){
   const x=p.x+(t.z*side+t.x*forward)/h,z=p.z+(-t.x*side+t.z*forward)/h;
   const clearance=z>=30.5&&z<=31.5?3:z>=34.4&&z<=41.6?2.9:z>=45&&z<=69?2.9:null;
   if(clearance)assert.ok(Math.abs(x)<clearance,'car clips masonry at '+x+','+z);
  }
 }
 const stop=l.anchors.returnStop;
 assert.ok(road.nearest(stop[0],stop[2]).distance<.01,'return stop stays on the road');
});
section('prepared mission ownership');
test('preparation never starts gameplay, activation and result accounting happen exactly once',()=>{
 let starts=0,updates=0,disposed=0,banked=0;
 const c=H.load(['js/core/util.js','js/core/state.js','js/core/missions.js'],{Engine:{setView(v,fn){this.frame=fn;},clearView(){}},Input:{endFrame(){}}});c.GameState.load();
 c.Missions.register({id:'test',name:'test',create:()=>({build(){return {scene:{},camera:{}};},start(){starts++;},update(){updates++;},dispose(){disposed++;}})});
 c.Missions.setPotSink(n=>banked+=n);
 const abandoned=c.Missions.prepare('test');assert.equal(starts,0);assert.equal(updates,0);abandoned.dispose();abandoned.dispose();assert.equal(disposed,1);
 assert.equal(c.Missions.activate(abandoned),null);
 const h=c.Missions.prepare('test');c.Missions.complete({earned:30});assert.equal(banked,0);
 c.Missions.activate(h);c.Missions.activate(h);assert.equal(starts,1);c.Engine.frame(.1,0);assert.equal(updates,1);
 c.Missions.complete({earned:30});c.Missions.complete({earned:30});assert.equal(banked,30);c.Missions.end();assert.equal(disposed,2);
});
H.report();
