/* Rendered review: the renderer is never replaced or disabled in this suite. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const {createServer}=require('../server');
(async()=>{
 const out=process.env.ESTATE_REVIEW_DIR||'/tmp/estate-review';fs.mkdirSync(out,{recursive:true});
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,channel:'chromium',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1100,height:740},recordVideo:{dir:out,size:{width:1100,height:740}}});
 const page=await context.newPage(),errors=[],stats=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
 page.on('console',m=>{if(m.type()==='error')console.error(m.text());if(m.type()==='error'&&/WebGLProgram|shader error/.test(m.text()))errors.push(m.text());});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 if(process.env.THREE_TEST_ASSET)await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
 async function capture(name){await page.waitForTimeout(350);await page.screenshot({path:path.join(out,name+'.png'),timeout:90000});stats.push({name,...await page.evaluate(()=>({calls:Engine.renderer.info.render.calls,triangles:Engine.renderer.info.render.triangles,memory:Engine.renderer.info.memory}))});console.log(name,stats.at(-1));}
 try {
  await page.goto('http://127.0.0.1:'+app.server.address().port);await page.waitForFunction(()=>typeof Estate!=='undefined'&&Engine.renderer);
  await page.evaluate(async()=>{Engine.onResize(()=>Engine.renderer.setPixelRatio(.65));Engine.renderer.setPixelRatio(.65);await EstateMaterials.preload();});await capture('menu');
  await page.setViewportSize({width:390,height:844});await capture('mobile-menu');await page.setViewportSize({width:1100,height:740});
  await page.evaluate(()=>{
    Game.enterShow();Session.startParty({seed:42,mode:'host',players:[{id:'a',name:'Ana',local:true},{id:'b',name:'Bo'},{id:'c',name:'Cy'}]});
    window.reviewStage=Stage.build({seed:42,players:Session.state.players});
    Engine.setView(reviewStage.view,(dt)=>reviewStage.update(dt));
  });await capture('forecourt');
  for(const [name,pos,look]of [['masonry',[10,24,-32],[8,27,-35]],['paving',[4,22.6,6],[0,22,0]],['gate',[10,29,60],[0,27,38]],['bridge',[-5,60,278],[-20,14,220]],['car',[4,24.2,-8],[8,23,-14]]]){
    await page.evaluate(({pos,look})=>{reviewStage.setControls(false);const c=reviewStage.camera;c.position.fromArray(pos);c.lookAt(new THREE.Vector3(...look));Engine.setView(reviewStage.view,(dt,t)=>{reviewStage.land.update(dt,c.position,t);Sky.update(dt,c.position,t);reviewStage.figures.forEach(f=>{if(f)f.visible=f.position.distanceTo(c.position)<65;});reviewStage.claudia.visible=reviewStage.claudia.position.distanceTo(c.position)<65;reviewStage.parkedCar.update(dt,t,[],false,null,c);});},{pos,look});await capture(name);
  }
  await page.evaluate(()=>{Engine.clearView();reviewStage.dispose();window.reviewStage=null;});
  for(const id of ['boat-race','shootout','dive','ski']){
    const before=await page.evaluate(id=>{
      window.reviewHandle=Missions.prepare(id,{seed:42,mode:'prize',quality:'low',party:false});const h=reviewHandle;
      window.reviewCine=h.instance.cinematic();window.reviewCamera=new THREE.PerspectiveCamera(58,1100/740,.1,24000);
      const shot=reviewCine.view(.2);reviewCamera.position.copy(shot.position);reviewCamera.lookAt(shot.look);
      Engine.setView({scene:h.view.scene,camera:reviewCamera},(dt,t)=>reviewCine.update(dt,t,reviewCamera));
      return {state:h.instance.state,active:!!Missions.active};
    },id);assert.equal(before.active,false);await capture('arrival-'+id);
    const after=await page.evaluate(()=>({state:reviewHandle.instance.state,active:!!Missions.active}));assert.deepEqual(after,before);
    await page.evaluate(()=>{reviewHandle.dispose();Engine.clearView();});
  }
  await page.evaluate(()=>{window.reviewStage=Stage.build({seed:42,hour:'night',dress:'fire',players:Session.state.players});Engine.setView(reviewStage.view,dt=>reviewStage.update(dt));});
  await capture('fire-terrace');
  await page.evaluate(()=>{reviewStage.setControls(false);const look=reviewStage.land.anchors.castle.clone().add(new THREE.Vector3(0,15,0));reviewStage.camera.position.copy(look).add(new THREE.Vector3(90,45,-100));reviewStage.camera.lookAt(look);Engine.setView(reviewStage.view,(dt,t)=>{reviewStage.land.update(dt,reviewStage.camera.position,t);Sky.update(dt,reviewStage.camera.position,t);reviewStage.figures.forEach(f=>{if(f)f.visible=f.position.distanceTo(reviewStage.camera.position)<65;});if(reviewStage.parkedCar)reviewStage.parkedCar.update(dt,t,[],false,null,reviewStage.camera);});});await capture('night-castle');
  await page.evaluate(()=>{Engine.setView(reviewStage.view,dt=>reviewStage.update(dt));});
  await page.evaluate(()=>{reviewStage.setCinematic(true,'fireHero',{cut:true});reviewStage.flare(3);});await capture('fire-reveal');
  await page.evaluate(()=>{reviewStage.flare(1);window.reviewFinale=new FinaleScene();reviewFinale.stage=reviewStage;reviewFinale._hand=new THREE.Vector3();reviewFinale._spawnPouch(Session.state.players[0]);reviewFinale._pouch.state='held';Figure.setHolding(reviewStage.claudia,true);reviewStage.setShot('claudia',{cut:true});Engine.setView(reviewStage.view,(dt)=>{reviewStage.update(dt);reviewFinale._updatePouch(dt);});});await capture('pouch-held');
  await page.evaluate(()=>{reviewFinale._clearPouch();});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{GameState.data.settings.reducedMotion=true;reviewStage.setCinematic(false);});await capture('mobile-fire');
  await page.evaluate(()=>{reviewStage.dispose();Engine.clearView();});
  // Cached textures must survive scene disposal. Check allocations settle.
  const counts=[];for(let i=0;i<3;i++){
    await page.evaluate(()=>{window.reviewStage=Stage.build({seed:42,players:Session.state.players});Engine.setView(reviewStage.view,dt=>reviewStage.update(dt));});
    await page.waitForTimeout(200);counts.push(await page.evaluate(()=>({...Engine.renderer.info.memory})));
    await page.evaluate(()=>{reviewStage.dispose();Engine.clearView();});
  }
  assert.ok(counts[2].geometries<=counts[1].geometries+2,JSON.stringify(counts));
  assert.ok(counts[2].textures<=counts[1].textures+2,JSON.stringify(counts));
  await page.setViewportSize({width:1100,height:740});
  await page.evaluate(async()=>{GameState.data.settings.quality='low';await EstateMaterials.preload();window.reviewStage=Stage.build({seed:42,players:Session.state.players});Engine.setView(reviewStage.view,dt=>reviewStage.update(dt));});await capture('low-forecourt');
  await page.evaluate(()=>{reviewStage.setControls(false);reviewStage.camera.position.set(-5,60,278);reviewStage.camera.lookAt(new THREE.Vector3(-20,14,220));Engine.setView(reviewStage.view,(dt,t)=>{reviewStage.land.update(dt,reviewStage.camera.position,t);Sky.update(dt,reviewStage.camera.position,t);reviewStage.figures.forEach(f=>{if(f)f.visible=f.position.distanceTo(reviewStage.camera.position)<65;});if(reviewStage.parkedCar)reviewStage.parkedCar.update(dt,t,[],false,null,reviewStage.camera);});});await capture('low-bridge');
  await page.evaluate(()=>{reviewStage.dispose();Engine.clearView();});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{Session.startParty({seed:42,mode:'host',players:[{id:'a',name:'Ana',local:true},{id:'b',name:'Bo'},{id:'c',name:'Cy'}]});Session.dispatch({type:'advance'});Net.connect(Transports.SoloTransport);await Journey.start({missionOpts:{seed:42}});clearInterval(Journey.active.timer);});await capture('mobile-boarding');
  await page.evaluate(async()=>{Journey.stop();const j=Session.state.travel;j.beat=3;j.duration=8;j.startedAt=Date.now()-3000;j.boarded=['a','b','c'];GameState.data.settings.reducedMotion=true;await Journey.start({missionOpts:{seed:42}});clearInterval(Journey.active.timer);});await capture('reduced-motion-glen');
  await page.evaluate(()=>{Journey.stop();Net.disconnect();Session.abandon();});

  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'render-metrics.json'),JSON.stringify({browser:await browser.version(),renderer:'Chromium software rendering; not a device FPS claim',stats,repeat:counts},null,2));
  await page.goto('http://127.0.0.1:'+app.server.address().port+'/assets/estate/preview.html');await page.setViewportSize({width:1200,height:850});await page.waitForSelector('article:nth-child(14)');await page.screenshot({path:path.join(out,'material-tiles.png'),fullPage:true});
 }finally{await context.close();await browser.close();await new Promise(r=>app.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
