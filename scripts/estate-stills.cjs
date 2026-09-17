/* A small, deterministic still-image review using real WebGL draws. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createServer}=require('../server');
(async()=>{
 const out=process.env.ESTATE_REVIEW_DIR||'/tmp/estate-review';fs.mkdirSync(out,{recursive:true});
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1100,height:740}}),errors=[],metrics=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/.test(m.text()))errors.push(m.text());});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 if(process.env.THREE_TEST_ASSET)await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
 try{
  await page.goto('http://127.0.0.1:'+app.server.address().port);await page.evaluate(()=>{Game.enterShow();Engine.clearView();Engine.renderer.setPixelRatio(.8);Session.startParty({seed:42,mode:'host',players:[{id:'a',name:'Ana',local:true},{id:'b',name:'Bo'},{id:'c',name:'Cy'}]});});
  for(const quality of ['high','low']){
   await page.evaluate(async quality=>{GameState.data.settings.quality=quality;await EstateMaterials.preload();},quality);
   for(const night of [false,true]){
    await page.evaluate(night=>{window.still=Stage.build({seed:42,hour:night?'night':'golden',dress:night?'fire':'none',players:Session.state.players});still.update(.016);Engine.clearView();},night);
    const shots=night?['fire-terrace','night-castle','pouch-held']:['forecourt','car','bridge'];
    for(const shot of shots){
     const stat=await page.evaluate(({shot,night})=>{
      const c=still.camera,V=(x,y,z)=>new THREE.Vector3(x,y,z);still.setControls(false);c.fov=58;
      if(shot==='forecourt'){still.setCinematic(false);still.update(.016);}
      if(shot==='car'){const p=still.parkedCar.group.position;c.position.copy(p).add(V(-4,2.2,6));c.lookAt(p.clone().add(V(0,1,0)));}
      if(shot==='bridge'){c.position.set(-5,60,278);c.lookAt(V(-20,14,220));}
      if(shot==='fire-terrace'){still.setCinematic(false);still.update(.016);}
      if(shot==='night-castle'){const p=still.land.anchors.castle.clone().add(V(0,15,0));c.position.copy(p).add(V(90,45,-100));c.lookAt(p);}
      if(shot==='pouch-held'){still.setCinematic(true,'claudia',{cut:true});window.pouch=new FinaleScene();pouch.stage=still;pouch._hand=V(0,0,0);pouch._spawnPouch(Session.state.players[0]);pouch._pouch.state='held';Figure.setHolding(still.claudia,true);for(let i=0;i<40;i++){still.update(.025);pouch._updatePouch(.025);}}
      still.claudia.visible=still.claudia.position.distanceTo(c.position)<65;
      still.figures.forEach(f=>{if(f){f.visible=f.position.distanceTo(c.position)<65;EstateMaterials.figureLOD(f,c);}});
      if(still.parkedCar)still.parkedCar.update(.016,1,[],false,null,c);
      c.aspect=Engine.size.w/Engine.size.h;c.updateProjectionMatrix();Sky.update(.016,c.position,1);still.land.update(.016,c.position,1);
      if(still.fire)EstateFire.update(still.fire,1);
      Engine.renderer.render(still.scene,c);
      return {calls:Engine.renderer.info.render.calls,triangles:Engine.renderer.info.render.triangles,memory:{...Engine.renderer.info.memory}};
     },{shot,night});
     const name=(quality==='low'?'low-':'')+shot;await page.screenshot({path:path.join(out,name+'.png'),timeout:90000});metrics.push({name,...stat});console.log(name,stat);
     if(shot==='pouch-held')await page.evaluate(()=>pouch._clearPouch());
    }
    await page.evaluate(()=>{still.dispose();Engine.clearView();});
   }
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'still-metrics.json'),JSON.stringify({browser:await browser.version(),renderer:'Software WebGL; not a device FPS measurement',metrics},null,2));
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
