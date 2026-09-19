/* Reproducible real-renderer gallery. Run before edits, then with BOAT_REVIEW_DIR. */
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),{createServer}=require('../server');
(async()=>{
 const out=process.env.BOAT_REVIEW_DIR||'docs/boat/after';fs.mkdirSync(out,{recursive:true});
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1100,height:740}}),errors=[],metrics=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/.test(m.text()))errors.push(m.text());});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 if(process.env.THREE_TEST_ASSET)await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
 try{
 await page.goto('http://127.0.0.1:'+app.server.address().port);await page.waitForFunction(()=>typeof BoatRaceMission!=='undefined'&&Engine.renderer);
 const fixture=await page.evaluate(async()=>{
  Engine.clearView();Engine.setPaused(true);Screens.hideAll();Engine.renderer.setPixelRatio(1);
  if(typeof BoatMaterials!=='undefined')await BoatMaterials.preload();
  window.m=new BoatRaceMission({seed:42,ghost:false,tod:'auto'});m.build();
  Water.update(-Water.time);const waves=[0,1,17,100].map(x=>Water.sampleSurface(x,x*.7,{}));
  const trajectory=[];for(let i=0;i<600;i++){Water.update(1/60);m.boat.update(1/60,{throttle:1,steer:Math.sin(i*.02)*.18,boost:i>120&&i<190},m.world);if(i%60===0)trajectory.push([m.boat.pos.toArray(),m.boat.vel.toArray(),m.boat.heading,m.boat.boost,m.boat.airborne]);}
  const result={waves,trajectory,path:m.path.pts.map(p=>p.toArray()),half:m.path.half,colliders:m.colliders,gates:m.hoops.map(h=>[h.x,h.z,h.radius,h.risk,h.gate.s])};
  m.boat.reset(0,-260,0);Water.update(-Water.time);return result;
 });fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify(fixture));
 for(const phone of [false,true]){
  await page.setViewportSize(phone?{width:390,height:844}:{width:1100,height:740});
  for(const shot of ['launch','hull','channel','gate','race']){
   const data=await page.evaluate(({shot,phone})=>{
    const at=m.path.at(shot==='channel'?m.path.total*.3:shot==='gate'||shot==='race'?m.gates[0].s:0),p=at.point,t=at.tangent;
    Water.update(-Water.time);m._updateHoopVisuals(0,0);m.buoys.update();m.shoreFoam.update(0);
    Screens.hideAll();m.boat.reset(0,-260,0);m.boat.group.position.copy(m.boat.pos);m.boat.group.rotation.set(0,0,0);m.boat.mesh.rotation.set(0,0,0);m.boat.mesh.position.y=0;
    if(shot==='hull'){m.camera.position.set(10,7,-248);m.camera.lookAt(0,1,-260);}
    else if(shot==='race'){m.boat.reset(p.x-t.x*45,p.z-t.z*45,Math.atan2(t.x,t.z));m.boat.group.position.copy(m.boat.pos);m.boat.group.rotation.y=m.boat.heading;m.state='racing';m._updateCamera(10);m._updateHud(0);Screens.show('hud');}
    else {m.camera.position.set(p.x-t.x*48+18,shot==='channel'?22:12,p.z-t.z*48);m.camera.lookAt(p.x,8,p.z+35);}
    m.camera.aspect=innerWidth/innerHeight;m.camera.fov=shot==='hull'?42:62;m.camera.updateProjectionMatrix();Water.follow(m.camera.position.x,m.camera.position.z);Sky.update(0,m.camera.position,0);m.scene.updateMatrixWorld(true);Engine.renderer.render(m.scene,m.camera);
    return {shot,phone,calls:Engine.renderer.info.render.calls,triangles:Engine.renderer.info.render.triangles,memory:{...Engine.renderer.info.memory}};
   },{shot,phone});
   await page.screenshot({path:path.join(out,shot+(phone?'-phone':'')+'.png')});metrics.push(data);console.log(shot,phone,data.calls);
  }
 }
 await page.evaluate(()=>m.dispose());fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify({browser:await browser.version(),renderer:'SwiftShader (correctness only)',errors,metrics},null,2));if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser.close();await new Promise(r=>app.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
