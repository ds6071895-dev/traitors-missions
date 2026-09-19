/* Additional model/state views and fixed-step real-physics gameplay frames.
   Encoding at 30 fps is for review playback, never a device performance claim. */
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),{createServer}=require('../server'),{execFileSync}=require('node:child_process');
(async()=>{
 const out='docs/boat/showcase',frames='/tmp/boat-review-frames',frameCount=Number(process.env.BOAT_VIDEO_FRAMES)||120;fs.mkdirSync(out,{recursive:true});fs.mkdirSync(frames,{recursive:true});
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));let browser;const errors=[],metrics=[];
 try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 const p=await browser.newPage({viewport:{width:960,height:640}});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/.test(m.text()))errors.push(m.text());});
 await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));if(process.env.THREE_TEST_ASSET)await p.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
 await p.goto('http://127.0.0.1:'+app.server.address().port);await p.waitForFunction(()=>typeof BoatRaceMission!=='undefined'&&Engine.renderer);
 await p.evaluate(async()=>{Tutorial.setOff(true);Engine.clearView();Engine.setPaused(true);Screens.hideAll();GameState.settings.quality='high';Engine.renderer.setPixelRatio(1);await BoatMaterials.preload();window.m=new BoatRaceMission({seed:42,ghost:false});m.cond={time:'dusk',sea:'moderate',wind:.6};m.build();m.state='racing';m.camera.aspect=innerWidth/innerHeight;m.camera.updateProjectionMatrix();Water.update(-Water.time);});
 async function snap(name,setup){
  await p.evaluate(setup);metrics.push(await p.evaluate(name=>{m.boat.group.updateMatrixWorld(true);m._updateHoopVisuals(0,0);m.buoys.update();m.shoreFoam.update(0);Sky.update(0,m.camera.position,0);Water.follow(m.camera.position.x,m.camera.position.z);m.camera.updateProjectionMatrix();Engine.renderer.render(m.scene,m.camera);return {name,calls:Engine.renderer.info.render.calls,triangles:Engine.renderer.info.render.triangles,memory:{...Engine.renderer.info.memory}};},name));await p.screenshot({path:path.join(out,name+'.png')});console.log(name);
 }
 await snap('cockpit',()=>{m.boat.reset(0,-260,0);m.boat.group.position.copy(m.boat.pos);const y=m.boat.pos.y;m.camera.fov=42;m.camera.position.set(1.6,y+3.3,-262.6);m.camera.lookAt(-.2,y+1.2,-259.4);});
 await snap('watchtower',()=>{const g=m.landmarks.getObjectByName('ruined-watchtower');m.camera.fov=56;m.camera.position.copy(g.position).add(new THREE.Vector3(-45,25,-40));m.camera.lookAt(g.position.clone().add(new THREE.Vector3(0,8,0)));});
 await snap('lighthouse',()=>{const g=m.landmarks.getObjectByName('bay-lighthouse');m.camera.position.copy(g.position).add(new THREE.Vector3(45,24,-45));m.camera.lookAt(g.position.clone().add(new THREE.Vector3(0,12,0)));});
 await snap('landing',()=>{const g=m.landmarks.getObjectByName('timber-landing');m.camera.position.copy(g.position).add(new THREE.Vector3(24,15,-24));m.camera.lookAt(g.position);});
 for(const state of ['surf','airborne','impact','finish','failure']){
  await p.evaluate(state=>{
   m.restart();m.state='racing';m.camera.fov=62;const f=m.path.at(m.gates[0].s-45);m.boat.reset(f.point.x,f.point.z,Math.atan2(f.tangent.x,f.tangent.z));m.boat.group.position.copy(m.boat.pos);m.boat.group.rotation.set(0,m.boat.heading,0);m.boat.speed=32;
   if(state==='surf'){m.boat.surf=.8;m.boat.boosting=true;}
   if(state==='airborne'){m.boat.airborne=true;m.boat.pos.y+=8;m.boat.group.position.copy(m.boat.pos);m.boat.group.rotation.z=.85;}
   if(state==='impact'){m.boat.impact=.8;m.boat.landed=.8;}
   if(state==='finish')m._finish();if(state==='failure')m._fail('TIME’S UP');clearTimeout(m._reportT);
   m._spawnFx(1/30);m.fx.update(1/30);m.presentation.update(1/30,m.boat);m._updateCamera(2);m._updateHud(0);Screens.show('hud');
  },state);await snap(state,()=>{});
 }
 if(process.env.BOAT_STILLS_ONLY){
  await p.evaluate(()=>m.dispose());
  const previous=JSON.parse(fs.readFileSync(out+'/metrics.json','utf8'));
  fs.writeFileSync(out+'/metrics.json',JSON.stringify({...previous,metrics,errors},null,2));
  if(errors.length)throw Error(errors.join('\n'));
  return;
 }
 await p.evaluate(()=>{m.restart();m.state='racing';m._setCenter('','');m.boat.reset(0,-260,0);m.boat.vel.set(0,24);m.boat.speed=24;m.camera.fov=62;Water.update(-Water.time);});
 const timings=[];
 for(let i=0;i<frameCount;i++){
  timings.push(await p.evaluate(i=>{
   const start=performance.now(),b=m.boat,f=m.path.frame(b.pos.x,b.pos.z),ahead=m.path.at(f.s+35),desired=Math.atan2(ahead.point.x-b.pos.x,ahead.point.z-b.pos.z),ctl={throttle:1,steer:U.clamp(-U.wrapAngle(desired-b.heading)*1.5,-.6,.6),boost:i>30&&i<65};
   for(let j=0;j<2;j++){Water.update(1/60);m._prevPos.copy(b.pos);b.update(1/60,ctl,m.world);m.elapsed+=1/60;m.time-=1/60;m._checkGates();m._spawnFx(1/60);m.fx.update(1/60);m.presentation.update(1/60,b);m._updateCamera(1/60);}b.animateFlag(i/30);m._updateHoopVisuals(1/30,i/30);m.buoys.update();m.shoreFoam.update(1/30);m._updateHud(1/30);Water.follow(b.pos.x,b.pos.z);Sky.update(1/30,m.camera.position,i/30);Engine.renderer.render(m.scene,m.camera);return performance.now()-start;
  },i));await p.screenshot({path:path.join(frames,String(i).padStart(4,'0')+'.png')});
 }
 execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','30','-i',frames+'/%04d.png','-frames:v',String(frameCount),'-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','4','-crf','34','-b:v','0',out+'/gameplay.webm']);
 await p.evaluate(()=>m.dispose());fs.writeFileSync(out+'/metrics.json',JSON.stringify({errors,metrics,video:{frames:frameCount,fixedStep:1/60,duration:frameCount/30,renderer:'SwiftShader',cpuSubmitMs:{min:Math.min(...timings),mean:timings.reduce((a,b)=>a+b,0)/timings.length,max:Math.max(...timings)},note:'CPU submission timing, not GPU or device FPS; frames encoded at 30 fps for playback.'}},null,2));if(errors.length)throw Error(errors.join('\n'));
 }finally{if(browser)await browser.close();await new Promise(r=>app.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
