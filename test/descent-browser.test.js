const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { createServer } = require('../server');
(async () => {
  const app = createServer(); await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1100,height:740}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  if(process.env.THREE_TEST_ASSET) await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
  fs.mkdirSync('/tmp/descent-visuals',{recursive:true});
  try {
    await page.goto('http://127.0.0.1:'+app.server.address().port);
    await page.waitForFunction(()=>typeof Missions!=='undefined'&&Engine.renderer);
    await page.evaluate(()=>{Engine.renderer.setPixelRatio(.65);});
    for(const mode of (process.env.DESCENT_VISUAL_ONLY ? ['prize'] : ['prize','trial','freestyle','practice'])) {
      console.log('mode '+mode);
      await page.evaluate(mode=>{Missions.end();Screens.hideAll();Missions.launch('ski',{seed:42,mode,tod:'day',quality:'low',section:mode==='practice'?'village-3':null});},mode);
      await page.waitForFunction(()=>SkiMaterials.ready);
      await page.waitForTimeout(300);
      const data=await page.evaluate(()=>{const m=Missions.active; m.state='running';m._setCenter('',''); return {mode:m.mode,rails:m.course.rails.length,rules:m.opts.rulesVersion,key:m.key};});
      assert.equal(data.mode,mode); assert.equal(data.rules,4); assert.ok(data.rails>0);
      if(mode==='practice') {
        const reset=await page.evaluate(()=>{const m=Missions.active;m.skier.pos.z=200;m.resetSection();return {z:m.skier.pos.z,mode:m.mode};});
        assert.ok(reset.z<2); await page.screenshot({path:'/tmp/descent-visuals/practice.png'});
      } else {
        if(mode==='prize') for(const [region,z] of [['summit',150],['glacier',1450],['forest',2200],['village',3220]]) {
          await page.evaluate(z=>{const m=Missions.active;m.skier.place(m.face.cxAt(z),z,0,m.world);m.state='running';m.skier.speed=20;m.skier.vel.set(0,20);m._camPos.copy(m.skier.pos).add(new THREE.Vector3(0,8,-15));m._camLook.copy(m.skier.pos);for(let i=0;i<60;i++)m._updateCamera(1/60);},z);
          await page.waitForTimeout(450); await page.screenshot({path:'/tmp/descent-visuals/'+region+'.png'});
        }
      }
      if(mode==='prize') {
        const ride=await page.evaluate(()=>{
          const m=Missions.active,s=m.skier,rail=m.course.rails[0],a=rail.points[0],b=rail.points[1];
          const heading=Math.atan2(b.x-a.x,b.z-a.z);
          s.place(a.x,a.z,heading,m.world);s.speed=20;s.vel.set(Math.sin(heading)*20,Math.cos(heading)*20);
          for(let i=0;i<20&&!s.grinding;i++)s.update(1/90,{steer:0,throttle:0,trick:false},m.world);
          const captured=!!s.grinding;
          for(let i=0;i<90;i++)s.update(1/90,{steer:0,throttle:0,trick:false},m.world);
          m._camPos.copy(s.pos).add(new THREE.Vector3(7,4,-10));m._camLook.copy(s.pos);
          for(let i=0;i<45;i++)m._updateCamera(1/60);
          m._updateHud(1/60);
          return {captured,grinding:!!s.grinding,distance:s.grindDistance};
        });
        assert.ok(ride.captured&&ride.grinding&&ride.distance>15,'actual course rail accepts an aligned approach and sustained slide');
        await page.screenshot({path:'/tmp/descent-visuals/rail.png'});
      }
      await page.evaluate(()=>{const m=Missions.active;m.state='running';m._finish();clearTimeout(m._reportT);m._report();});
      await page.waitForTimeout(200);
      if(mode==='practice') assert.equal(await page.evaluate(()=>Missions.active.result.earned),0);
      assert.equal(await page.evaluate(()=>Missions.active.result.rulesVersion),5);
    }
    const resources=[];
    for(let i=0;i<(process.env.DESCENT_VISUAL_ONLY ? 0 : 20);i++) {
      console.log('retry '+i);
      resources.push(await page.evaluate(i=>{Missions.end();Screens.hideAll();const m=Missions.launch('ski',{seed:42,mode:'practice',section:'summit-0',tod:'day',quality:['low','medium','high'][i%3]});Engine.renderer.render(Missions.active.scene,Missions.active.camera);return {...Engine.renderer.info.memory};},i));
    }
    if(resources.length) {
    fs.writeFileSync('/tmp/descent-visuals/resources.json',JSON.stringify(resources,null,2));
    assert.ok(resources.at(-1).geometries<=resources[1].geometries+5,'retry geometry leak');
    assert.ok(resources.at(-1).textures<=resources[1].textures+2,'retry texture leak');
    }
    assert.deepEqual(errors,[]);
    console.log(process.env.DESCENT_VISUAL_ONLY ? 'PASS: four regions and real course rail slide rendered without shader errors' : 'PASS: rendered four regions, rail slide, four modes, Practice reset, results, 20 retries');
  } finally { await browser.close(); await app.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
