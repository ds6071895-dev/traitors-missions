/* Cancellation and failed loading use the real director and DOM, without GPU work. */
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{createServer}=require('../server');
(async()=>{
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage(),errors=[];page.on('console',m=>{if(m.type()==='log')console.log(m.text());});page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 if(process.env.THREE_TEST_ASSET)await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
 try{
  await page.goto('http://127.0.0.1:'+app.server.address().port);
  await page.evaluate(()=>{Game.enterShow();Engine.renderer.render=()=>{};GameState.data.settings.quality='low';});
  const result=await page.evaluate(async()=>{
   const delay=ms=>new Promise(r=>setTimeout(r,ms));
   let work=0;const aborted=new AbortController();const fading=Screens.cover(()=>work++,aborted.signal,100);aborted.abort();
   if(await fading!==false||work!==0)throw new Error('Aborted fade ran its callback');
   const inFlight=new AbortController();let finish;const loading=Screens.cover(async()=>{await new Promise(r=>finish=r);if(!inFlight.signal.aborted)work++;},inFlight.signal,0);
   await delay(10);inFlight.abort();finish();await loading;if(work!==0)throw new Error('Loading activated after cancellation');
   const players=[{id:'a',name:'Ana',local:true},{id:'b',name:'Bo'},{id:'c',name:'Cy'}];
   const reset=()=>{Session.startParty({seed:42,mode:'host',players});Session.dispatch({type:'advance'});Net.connect(Transports.SoloTransport);};
   reset();const preload=EstateMaterials.preload;let loaded;
   EstateMaterials.preload=()=>new Promise(r=>loaded=r);
   const pending=Journey.start({missionOpts:{seed:42}});await delay(10);Journey.stop();loaded();await pending;
   if(Journey.active||Missions.active||Engine.hasView||document.getElementById('journey-ui'))throw new Error('Cancelled preparation retained ownership');
   EstateMaterials.preload=preload;
   reset();await Journey.start({missionOpts:{seed:42}});
   const stage=Journey.active.stage,terrain=stage.land.group.getObjectByName('estate-terrain'),ray=new THREE.Raycaster();stage.scene.updateMatrixWorld(true);
   let minimum=Infinity,maximum=-Infinity;
   for(let d=0;d<stage.land.road.length;d+=4){const p=stage.land.road.sample(d).position;if(Math.abs(p.z-220)<15)continue;
     ray.set(new THREE.Vector3(p.x,p.y+100,p.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(terrain,false)[0];if(!hit)throw new Error('Missing road ground');
     const clearance=p.y-hit.point.y;minimum=Math.min(minimum,clearance);maximum=Math.max(maximum,clearance);
   }
   console.log('Rendered terrain road clearance',minimum,maximum);
   if(minimum<-.35||maximum>1)throw new Error('Road is not grounded: '+minimum+' / '+maximum);
   Journey.stop();
   if(Journey.active||Engine.hasView)throw new Error('Boarding cancellation left a world');
   reset();const j=Session.state.travel;j.beat=6;j.duration=6;j.ready=[];j.startedAt=null;
   const original=Missions.prepare;let builds=0;
   Missions.prepare=()=>{builds++;throw new Error('Expected test build failure');};
   await Journey.start({missionOpts:{seed:42}});
   if(!Journey.active.failed||Missions.active||Session.state.pot!==0)throw new Error('Failed build fabricated gameplay or results');
   document.getElementById('journey-retry').click();for(let i=0;i<40&&builds<2;i++)await delay(50);
   if(builds!==2)throw new Error('Retry did not try preparation again');
   Journey.stop();Missions.prepare=original;
   reset();Session.state.travel.beat=6;Session.state.travel.duration=6;Session.state.travel.ready=[];Session.state.travel.startedAt=null;
   await Journey.start({missionOpts:{seed:42,mode:'prize'}});
   const handle=Journey.active.handle;if(!handle||handle.status!=='prepared')throw new Error('Missing prepared handover');
   Journey.stop();if(handle.status!=='disposed'||Missions.activate(handle)!==null)throw new Error('Cancelled handover could activate');
   Net.disconnect();Session.abandon();return {work,builds,fade:document.getElementById('fade').classList.contains('on')};
  });
  assert.deepEqual(result,{work:0,builds:2,fade:false});assert.deepEqual(errors,[]);
  console.log('PASS: cancellation during fade, loading, boarding and handover; failed builds retry without results');
 }finally{await page.evaluate(()=>{Journey.stop();Missions.end();}).catch(()=>{});await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
