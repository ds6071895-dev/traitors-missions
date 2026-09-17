/* Three independent clients: travel orchestration, loading, and mission handover.
   GPU drawing is covered separately by estate-browser.test.js. */
const assert=require('node:assert/strict');const {chromium}=require('playwright');const {createServer}=require('../server');
(async()=>{
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
 const browser=await chromium.launch({headless:true,channel:'chromium',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 const pages=[],errors=[];
 try{
  for(let i=0;i<3;i++){
    const page=await browser.newPage({viewport:{width:i===2?390:800,height:i===2?844:600}});pages.push(page);page.on('pageerror',e=>{errors.push(e.message);console.error(i,e.stack);});
    page.on('console',m=>{if(m.type()==='error')console.error(i,m.text());});
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    if(process.env.THREE_TEST_ASSET)await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
    await page.goto(origin);await page.evaluate(i=>{
      window.testDefs=Missions.all();Engine.renderer.render=()=>{};GameState.data.settings.quality=['high','medium','low'][i];GameState.data.settings.reducedMotion=i===2;
      Voice.say=()=>Promise.resolve();const run=Scenes.run;
      // Inspect the actual opening before shortening dialogue holds for coverage.
      Scenes.run=(beats,scene)=>{
        if(scene instanceof HillScene){
          window.welcomeCheck={immediate:!!beats[0].line,controls:scene.stage.rig.controls,
            distance:scene.stage.rig.pos.distanceTo(scene.stage.claudia.position),
            cameraDistance:scene.stage.camera.position.distanceTo(scene.stage.rig.pos)};
          beats=beats.map(b=>typeof b==='object'?{...b,wait:0,hold:0}:b);
        }
        return run(beats,scene);
      };
      window.testOff=Net.on(()=>{
        const s=Session.state;if(!s||s.phase!=='finale')return;
        const me=s.players.find(p=>p.local);if(s.floor&&!s.floor.done&&s.floor.playerId===me.id)Net.send({type:'yieldFloor',playerId:me.id});
      });
      if(i===2){const send=Net.send;Net.send=a=>{
        if(a.type==='travelReady'&&a.beat===6){const key=a.journeyId+':'+a.beat;if(window.delayKey!==key){window.delayKey=key;window.delayUntil=Date.now()+1800;}if(Date.now()<window.delayUntil)return;}
        send(a);
      };}
    },i);
    await page.click('#play-go');await page.fill('#lobby-name',['Ana','Bo','Cy'][i]);
  }
  const [a,b,c]=pages;await a.click('#lobby-host');await a.waitForFunction(()=>Party.connected);const code=await a.evaluate(()=>Party.code);
  for(const p of [b,c]){await p.fill('#code-input',code);await p.click('#lobby-join');await p.waitForFunction(()=>Party.self());}
  await a.waitForFunction(()=>Party.roster().length===3);
  for(const id of (process.env.TRAVEL_MISSION?[process.env.TRAVEL_MISSION]:['boat-race','shootout','dive','ski'])){
    console.log('Full-night destination',id);
    for(const p of pages)await p.evaluate(id=>{testDefs.forEach(d=>d.enabled=d.id===id);const selected=Missions.get(id);if(!selected)throw new Error('Mission registry was not restored');},id);
    await a.click('#lobby-start');
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Session.state?.phase==='travel'&&Journey.active?.ready&&Session.state.travel.beat===-1,null,{timeout:45000})));
    for(const p of pages){
      const welcome=await p.evaluate(()=>window.welcomeCheck);
      assert.ok(welcome.immediate&&welcome.controls,JSON.stringify(welcome));
      assert.ok(welcome.distance<=3&&Math.abs(welcome.cameraDistance-1.62)<.01,JSON.stringify(welcome));
      assert.ok(await p.locator('.journey-caption').isVisible());
      assert.equal(await p.evaluate(()=>Missions.active),null);await p.click('#journey-join');
    }
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Session.state.travel.beat===0)));
    for(const p of pages)await p.waitForFunction(()=>document.querySelector('.journey-caption').hidden);
    if(!process.env.FULL_TRAVEL)for(const p of pages)await p.click('#journey-skip');
    await a.waitForFunction(()=>Session.state.travel.beat===6,null,{timeout:55000});
    assert.equal(await a.evaluate(()=>Missions.active),null);
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Session.state.phase==='mission'&&Missions.active&&['racing','live','running'].includes(Missions.active.state),null,{timeout:45000})));
    console.log('Mission activated together',id);
    for(const p of pages)await p.evaluate(()=>{if(Session.myRole()==='traitor')Net.send({type:'taskDone'});});
    await a.waitForTimeout(100);
    for(const p of pages)await p.evaluate(()=>Missions.active._finish());
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Screens.current==='results'&&MissionNet.board&&!document.getElementById('result-continue').disabled,null,{timeout:30000})));
    for(const p of pages)assert.match(await p.locator('#result-continue').textContent(),/Return to the castle/);
    await a.click('#result-continue');await b.click('#result-continue');await a.waitForTimeout(400);assert.equal(await a.evaluate(()=>Session.state.phase),'mission');await c.click('#result-continue');
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Session.state.phase==='travel'&&Session.state.travel.direction==='return'&&Journey.active?.ready,null,{timeout:30000})));
    for(const p of pages)await p.click('#journey-join');
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Session.state.travel.beat===0)));
    if(!process.env.FULL_TRAVEL)for(const p of pages)await p.click('#journey-skip');
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Session.state.travel.beat===7&&Journey.active?.ready,null,{timeout:70000})));
    for(const p of pages)assert.ok(await p.locator('.journey-caption').isVisible());
    await a.click('#journey-join');await b.click('#journey-join');await a.waitForTimeout(700);
    assert.deepEqual(await a.evaluate(()=>({phase:Session.state.phase,floor:Session.state.floor,exposure:Session.state.exposure})),{phase:'travel',floor:null,exposure:null});await c.click('#journey-join');
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Session.state.phase==='finale'&&Scenes.active instanceof FinaleScene,null,{timeout:15000})));
    console.log('Room gathered before finale',id);
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Screens.current==='vote',null,{timeout:60000})));
    const ids=await a.evaluate(()=>Session.state.players.map(p=>p.id));
    for(let i=0;i<3;i++)await pages[i].evaluate(target=>Net.send({type:'name',targetId:target,playerId:Session.state.players.find(p=>p.local).id}),i===0?ids[1]:ids[0]);
    await Promise.all(pages.map(p=>p.waitForFunction(()=>Session.state.phase==='verdict'&&Screens.current==='verdict',null,{timeout:90000})));
    console.log('Complete night passed',id);
    for(const p of pages)await p.evaluate(()=>{Show.end({abandon:true});testDefs.forEach(d=>d.enabled=true);
      Screens.show('lobby');});

  }
  assert.deepEqual(errors,[]);
 }catch(e){console.error(await Promise.all(pages.map(p=>p.evaluate(()=>({phase:Session.state?.phase,travel:Session.state?.travel,screen:Screens.current,journey:!!Journey.active,ready:Journey.active?.ready,failed:Journey.active?.failed,mission:Missions.active?.state,scene:Scenes.active?.constructor.name})).catch(()=>null))));throw e;
 }finally{for(const p of pages)await p.evaluate(()=>{Show.end({abandon:true});Lobby.leave();}).catch(()=>{});await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
