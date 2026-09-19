/* Real WebGL rendering plus archived pre-overhaul numerical fixtures. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createServer}=require('../server');
const fixture=require('../docs/boat/before/fixture.json');
const waveContracts=require('../docs/boat/before/wave-contracts.json');
const waveSource=fs.readFileSync(path.join(__dirname,'../js/world/water.js'),'utf8');
for(const key of ['COMMON','VERT']){
 const source=waveSource.split('  const '+key+' = ')[1].split('\n  `;')[0];
 assert.equal(require('node:crypto').createHash('sha256').update(source).digest('hex'),waveContracts.sha256[key],key+' wave displacement changed');
}
(async()=>{
 const out=process.env.BOAT_TEST_DIR||'/tmp/boat-render-checks';fs.mkdirSync(out,{recursive:true});
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 let browser;const errors=[],results={};
 try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 async function pageFor({fail=false,touch=false}={}){
  const p=await browser.newPage({viewport:touch?{width:390,height:844}:{width:1100,height:740},hasTouch:touch});
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
  await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  if(process.env.THREE_TEST_ASSET)await p.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
  if(fail)await p.route('**/assets/boat/**',r=>r.abort());
  await p.goto('http://127.0.0.1:'+app.server.address().port);await p.waitForFunction(()=>typeof BoatRaceMission!=='undefined'&&Engine.renderer);
  await p.evaluate(()=>{Tutorial.setOff(true);Engine.clearView();Engine.setPaused(true);Screens.hideAll();Engine.renderer.setPixelRatio(.7);});return p;
 }
 const delayed=await pageFor();
 results.delayed=await delayed.evaluate(async()=>{const mat=BoatMaterials.material('metal');mat.dispose();await BoatMaterials.preload();return {unbound:mat.map===null,ready:BoatMaterials.load('metal').status==='ready'};});
 assert.ok(results.delayed.unbound&&results.delayed.ready);await delayed.close();
 const p=await pageFor();
 const actual=await p.evaluate(async()=>{
  await BoatMaterials.preload();window.m=new BoatRaceMission({seed:42,ghost:false,tod:'auto'});m.build();Water.update(-Water.time);
  const waves=[0,1,17,100].map(x=>Water.sampleSurface(x,x*.7,{})),trajectory=[];
  for(let i=0;i<600;i++){Water.update(1/60);m.boat.update(1/60,{throttle:1,steer:Math.sin(i*.02)*.18,boost:i>120&&i<190},m.world);if(i%60===0)trajectory.push([m.boat.pos.toArray(),m.boat.vel.toArray(),m.boat.heading,m.boat.boost,m.boat.airborne]);}
  const r={waves,trajectory,path:m.path.pts.map(p=>p.toArray()),half:m.path.half,colliders:m.colliders,gates:m.hoops.map(h=>[h.x,h.z,h.radius,h.risk,h.gate.s])};m.dispose();return r;
 });assert.deepEqual(actual,fixture);results.baseline='Exact equality: 600 fixed steps, wave normals/heights, path, widths, colliders, safe/risk gates';console.log('PASS archived pre-overhaul simulation and course');
 results.shared=await p.evaluate(()=>{
  const path=CourseKit.makePath(U.makeRng(9)),aR=U.makeRng(42),bR=U.makeRng(42),a=CourseKit.buildCliffs(path,aR),b=CourseKit.buildCliffs(path,bR,{visualProfile:'highland'});
  const same=JSON.stringify([...a.children[0].geometry.attributes.position.array])===JSON.stringify([...b.children[0].geometry.attributes.position.array]);
  const rng=aR()===bR(),defaultFlat=a.children[0].material[0].flatShading,profileSmooth=!b.children[0].material[0].flatShading;
  Engine.disposeObject(a);Engine.disposeObject(b);
  const s=new THREE.Scene();Water.build(s,{visualProfile:'highland'});const h=Water.sampleHeight(17,18);Water.build(s);const reset=Water.uniforms.uHighland.value===0&&Water.uniforms.uDetail.value===1&&h===Water.sampleHeight(17,18);Engine.disposeObject(s);
  return {same,rng,defaultFlat,profileSmooth,reset};
 });assert.ok(Object.values(results.shared).every(Boolean),JSON.stringify(results.shared));
 results.ownership=await p.evaluate(async()=>{
  const first=BoatMaterials.material('metal'),second=BoatMaterials.material('metal');let disposed=0;first.map.addEventListener('dispose',()=>disposed++);Engine.disposeObject(new THREE.Mesh(new THREE.BoxGeometry(),first));
  const result={shared:first.map===second.map,survives:disposed===0,bounded:BoatMaterials.cache.size<=32};second.dispose();return result;
 });assert.ok(Object.values(results.ownership).every(Boolean));
 // Read expected payouts from fixed original constants, exercise real detection
 // and state transitions, with the conditions/mode/modifier keys intact.
 results.modes=[];
 for(const mode of ['prize','trial'])for(const modId of [null,'shrink','riptide','glasscannon']){
  const data=await p.evaluate(({mode,modId})=>{
   window.m=new BoatRaceMission({seed:42,mode,modId,ghost:false});m.build();m.start();m._updateCountdown(5);
   const started=m.state==='racing',h=m.hoops.find(h=>h.risk),before=m.money,clock=m.time;
   m._hitRing(h,0);const expected=Math.round(m.C.moneyPerHoop*m.C.moneyScale*m.C.riskMult*h.mult*m.C.perfectMult);
   const score=m.money-before===expected&&m.riskHits===1&&m.perfects===1;
   const timing=mode==='trial'?m.deduct===(m.C.trialGain+m.C.trialPerfectBonus)*m.C.riskMult*h.mult:m.time===clock+(m.C.timePerHoop+m.C.timePerfectBonus)*1.6;
   const hitStop=m.hitStop>0;m._scoreTrick({rolls:1,flips:0,spins:0,flat:1,landed:true,air:1});const trick=m.tricks===1&&m.trickMoney>0;
   m._pause();const paused=Engine.isPaused();m.restart();const restarted=m.money===0&&m.gatesHit===0&&m.hoops.every(h=>h.state==='pending');
   m.state='racing';m.elapsed=50;m._finish();const finished=m.result.completed&&m.timeScaleTarget===.35;clearTimeout(m._reportT);
   m.restart();m.state='racing';m._fail('TEST');const failed=!m.result.completed;m.dispose();Engine.setPaused(true);
   return {mode,modId,started,score,timing,hitStop,trick,paused,restarted,finished,failed};
  },{mode,modId});for(const [k,v]of Object.entries(data))if(!['mode','modId'].includes(k))assert.equal(v,true,k+' '+JSON.stringify(data));results.modes.push(data);
 }
 console.log('PASS Prize Run, Time Trial, modifiers, scoring, tricks, pause/restart/finish/fail');
 results.ghost=await p.evaluate(()=>{
  const data={n:3,dt:.1,x:[0,2,6],y:[1,3,5],z:[0,4,8],yaw:[3.1,-3.1,-3],s:[0,5,10]};
  window.m=new BoatRaceMission({seed:42});GameState.saveGhost('boat-race',m.key,data);m.build();m.ghostT=.05;m.state='racing';m._updateGhost(0);
  const r={pos:m.ghostGroup.position.toArray(),time:m._ghostTimeAt(7.5),transparent:true};m.ghostGroup.traverse(o=>{if(o.material)r.transparent&&=o.material.transparent&&o.material.depthWrite===false;});m.dispose();return r;
 });assert.deepEqual(results.ghost.pos,[1,2,2]);assert.ok(Math.abs(results.ghost.time-.15)<1e-9);assert.ok(results.ghost.transparent);
 results.renders=[];
 for(const phone of [false,true])for(const time of ['dawn','noon','dusk','night','squall']){
  await p.setViewportSize(phone?{width:390,height:844}:{width:1100,height:740});
  const data=await p.evaluate(async({phone,time})=>{
   GameState.settings.quality=phone?'low':'high';await BoatMaterials.preload();window.m=new BoatRaceMission({seed:42,ghost:false});m.cond={time,sea:time==='squall'?'storm':'moderate',wind:.6};m.build();
   const at=m.path.at(m.gates[0].s-50);m.boat.reset(at.point.x,at.point.z,Math.atan2(at.tangent.x,at.tangent.z));
   m.camera.aspect=innerWidth/innerHeight;m.camera.updateProjectionMatrix();m.state='racing';
   for(let i=0;i<50;i++){Water.update(1/60);m.boat.update(1/60,{throttle:1,steer:0,boost:true},m.world);m._spawnFx(1/60);m.fx.update(1/60);m.presentation.update(1/60,m.boat);m._updateCamera(1/60);}
   m._updateHoopVisuals(0,0);m.buoys.update();m.shoreFoam.update(0);m._updateHud(0);Screens.show('hud');Sky.update(0,m.camera.position,0);Water.follow(m.boat.pos.x,m.boat.pos.z);Engine.renderer.render(m.scene,m.camera);
   return {phone,time,calls:Engine.renderer.info.render.calls,triangles:Engine.renderer.info.render.triangles,memory:{...Engine.renderer.info.memory},wake:m.presentation.mesh.count,safe:m.hoops.find(h=>!h.risk).idle,risk:m.hoops.find(h=>h.risk).idle};
  },{phone,time});assert.ok(data.wake>0);assert.notEqual(data.safe,data.risk);assert.ok(data.calls<350);assert.ok(data.triangles<(phone?900000:1600000));results.renders.push(data);
  await p.screenshot({path:path.join(out,time+(phone?'-phone':'')+'.png')});await p.evaluate(()=>m.dispose());
 }
 console.log('PASS all five lighting palettes, storm, gate cues, boost, pooled wakes, portrait renders');
 results.repeat=[];
 for(let i=0;i<5;i++){
  results.repeat.push(await p.evaluate(async()=>{GameState.settings.quality='low';await BoatMaterials.preload();window.m=new BoatRaceMission({seed:42,ghost:false});m.build();m._updateCamera(1);m._updateHoopVisuals(0,0);Sky.update(0,m.camera.position,0);Engine.renderer.render(m.scene,m.camera);const r={...Engine.renderer.info.memory};m.dispose();return r;}));
 }
 assert.deepEqual(results.repeat[4],results.repeat[1],JSON.stringify(results.repeat));
 results.reduced=[];
 for(const os of [false,true]){
  await p.emulateMedia({reducedMotion:os?'reduce':'no-preference'});
  results.reduced.push(await p.evaluate(os=>{
   GameState.settings.reducedMotion=!os;window.m=new BoatRaceMission({seed:42,ghost:false});m.build();m.boat.boosting=true;m.boat.speed=60;m.boat.roll=.7;m.shake=2;m.fovKick=15;m.camDip=2;m.camPush=2;m.hitStop=.07;m.timeScaleTarget=.35;m._updateCamera(1);m._flash(.6,'red');
   const r={fov:m.camera.fov,roll:m._camRoll,shake:m.shake,flash:m.hud.flash.style.opacity,hitStop:m.hitStop,timeScaleTarget:m.timeScaleTarget};m.dispose();GameState.settings.reducedMotion=false;return r;
  },os));
 }
 for(const r of results.reduced){assert.equal(r.fov,62);assert.equal(r.roll,0);assert.equal(r.shake,0);assert.notEqual(r.flash,'0.6');assert.equal(r.hitStop,.07);assert.equal(r.timeScaleTarget,.35);}
 await p.emulateMedia({reducedMotion:'no-preference'});
 results.keyboard=await p.evaluate(()=>{window.m=new BoatRaceMission({seed:42,ghost:false});m.build();Screens.show('hud');window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));const r={throttle:Input.throttle(),steer:Input.steer(),boost:Input.held('boost')};for(const code of ['KeyW','KeyD','Space'])window.dispatchEvent(new KeyboardEvent('keyup',{code}));m.dispose();return r;});
 assert.equal(results.keyboard.throttle,1);assert.notEqual(results.keyboard.steer,0);assert.ok(results.keyboard.boost);
 const touch=await pageFor({touch:true});await touch.evaluate(async()=>{GameState.settings.quality='low';await BoatMaterials.preload();window.m=new BoatRaceMission({seed:42,ghost:false});m.build();m.start();m.camera.aspect=innerWidth/innerHeight;m._updateCamera(1);m._updateHud(0);Sky.update(0,m.camera.position,0);Engine.renderer.render(m.scene,m.camera);});
 const stick=await touch.locator('.stick-zone').boundingBox(),boost=await touch.locator('.boost-btn').boundingBox();assert.ok(stick&&boost);
 const cdp=await touch.context().newCDPSession(touch),a={x:stick.x+stick.width/2,y:stick.y+stick.height/2,id:1},b={x:boost.x+boost.width/2,y:boost.y+boost.height/2,id:2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...a,x:a.x+35,y:a.y-35},b]});
 results.touch=await touch.evaluate(()=>({steer:Input.steer(),throttle:Input.throttle(),boost:Input.held('boost'),overflow:document.documentElement.scrollWidth>innerWidth}));assert.ok(results.touch.steer>.5&&results.touch.throttle>.5&&results.touch.boost);assert.equal(results.touch.overflow,false);
 await touch.screenshot({path:path.join(out,'touch.png')});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.evaluate(()=>m.dispose());await touch.close();
 results.peers=await p.evaluate(()=>{
  const players=[{id:'a',name:'Ana',local:true},{id:'b',name:'Bo',look:{coat:1,accent:1}},{id:'c',name:'Cy',look:{coat:3,accent:3}}];window.m=new BoatRaceMission({seed:42,party:true,players,ghost:false});m.build();
  const peers=[...m.peers.values()],r={count:peers.length,names:peers.map(p=>p.name),family:peers.every(p=>p.group.children[0].name==='classic-highland-speedboat'),colors:peers.map(p=>p.group.children[0].userData.flag.material.color.getHexString()),poseKeys:Object.keys(m._sendPose())};
  peers.forEach((p,i)=>{p.group.visible=true;p.group.position.set((i?1:-1)*6,0,-256);});m._updateCamera(2);Sky.update(0,m.camera.position,0);Engine.renderer.render(m.scene,m.camera);return r;
 });await p.screenshot({path:path.join(out,'three-boats.png')});await p.evaluate(()=>m.dispose());assert.equal(results.peers.count,2);assert.deepEqual(results.peers.names,['Bo','Cy']);assert.ok(results.peers.family);assert.deepEqual(results.peers.colors,['d81e40','7dfcd0']);assert.deepEqual(results.peers.poseKeys,['x','y','z','h','p','r','s','b','v']);
 const fail=await pageFor({fail:true});
 results.fallback=await fail.evaluate(async()=>{
  const dead=BoatMaterials.material('metal');dead.dispose();await BoatMaterials.preload();window.m=new BoatRaceMission({seed:42,ghost:false});m.build();m._updateCamera(1);m._updateHoopVisuals(0,0);Sky.update(0,m.camera.position,0);Engine.renderer.render(m.scene,m.camera);
  const r={errors:[...BoatMaterials.cache.values()].every(e=>e.status==='error'),deadUnbound:dead.map===null,calls:Engine.renderer.info.render.calls};m.dispose();return r;
 });assert.ok(results.fallback.errors&&results.fallback.deadUnbound&&results.fallback.calls>30);await fail.screenshot({path:path.join(out,'asset-fallback.png')});await fail.close();
 results.audio=await p.evaluate(()=>{AudioBus.init();const b=new Boat({visualProfile:'highland'}),snd=BoatFeedback.audio();snd.set(b);const nodes=snd.nodes;snd.stop();snd.stop();Engine.disposeObject(b.group);return {nodes,ready:AudioBus.ready};});assert.equal(results.audio.nodes,18);assert.ok(results.audio.ready);
 results.transition=await p.evaluate(()=>{const scene=new THREE.Scene();Water.build(scene);const r={profile:Water.uniforms.uHighland.value,palette:Water.uniforms.uDeep.value.getHexString(),sea:Water.seaState(),classRemoved:!document.body.classList.contains('boat-race-active')};Engine.disposeObject(scene);return r;});assert.equal(results.transition.profile,0);assert.deepEqual(results.transition.sea,{swell:1,chop:1,wind:0});assert.ok(results.transition.classRemoved);
 assert.deepEqual(errors,[]);results.errors=errors;results.browser=await browser.version();results.renderer='SwiftShader; correctness and resource measurements only';results.host={platform:process.platform,cpu:require('node:os').cpus()[0].model};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS repeat disposal, both motion preferences, keyboard/touch, peers, fallback, scene reset');
 }finally{if(browser)await browser.close();await new Promise(r=>app.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
