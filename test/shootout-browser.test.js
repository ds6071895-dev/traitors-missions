/* Real rendered mission; invariants cover both the default forest and the opt-in
   profile. SwiftShader numbers are resource budgets, not device FPS claims. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{createServer}=require('../server');
(async()=>{
 const out=process.env.SHOOTOUT_TEST_DIR||'/tmp/shootout-checks';fs.mkdirSync(out,{recursive:true});
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 const errors=[],results={};
 async function pageFor(fail=false){
  const p=await browser.newPage({viewport:{width:1100,height:740}});
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
  await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  if(process.env.THREE_TEST_ASSET)await p.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
  if(fail)await p.route('**/assets/**',r=>r.abort());
  await p.goto('http://127.0.0.1:'+app.server.address().port);await p.waitForFunction(()=>typeof ShootoutMission!=='undefined'&&Engine.renderer);
  await p.evaluate(()=>{Engine.clearView();Engine.setPaused(true);Screens.hideAll();Engine.renderer.setPixelRatio(.7);});return p;
 }
 try{
  const page=await pageFor();
  results.forest=await page.evaluate(()=>{
   const scene=new THREE.Scene(),aR=U.makeRng(45),bR=U.makeRng(45),cR=U.makeRng(45);
   const opts={radius:440,clearing:15,standHeight:.75,motes:220};
   const a=ForestKit.build(scene,aR,opts),b=ForestKit.build(scene,bR,{...opts,visualProfile:'shootout',visualSeed:42}),c=ForestKit.build(scene,cR,opts);
   const ground=g=>g.group.getObjectByName('forest-ground').geometry;
   const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   const heights=[];for(let x=-100;x<=100;x+=13)for(let z=-100;z<=100;z+=19)heights.push(a.heightAt(x,z)===b.heightAt(x,z)&&a.walkAt(x,z)===b.walkAt(x,z));
   const result={heights:heights.every(Boolean),colliders:equal(a.colliders,b.colliders),rng:aR()===bR(),
    positions:equal(Array.from(ground(a).attributes.position.array),Array.from(ground(b).attributes.position.array)),
    defaults:equal(Array.from(ground(a).attributes.color.array),Array.from(ground(c).attributes.color.array)),
    defaultFlat:a.group.getObjectByName('forest-ground').material.flatShading,
    profileSmooth:!b.group.getObjectByName('forest-ground').material.flatShading};
   a.dispose();b.dispose();c.dispose();return result;
  });assert.ok(Object.values(results.forest).every(Boolean),JSON.stringify(results.forest));
  console.log('PASS terrain, colliders, RNG continuation and shared forest defaults');
  results.bow=await page.evaluate(()=>{
   const shots=[];for(const held of [.2,.5,.64]){const bow=new Bow();bow.update(held,true);shots.push(bow.update(0,false).loosed);bow.dispose();}
   const bow=new Bow();bow.build(new THREE.PerspectiveCamera());bow.update(.5,true);const before=bow.parts.limbTips[0].clone();bow.update(0,false);
   const nocking=bow.state;bow.update(.099,true);const blocked=bow.state;bow.update(.0011,true);const ready=bow.state;
   const world=Bow.buildWorld();Bow.poseWorld(world,0,0,0,0,0,1);const same=before.distanceTo(world.userData.bowParts.limbTips[0])<1e-9;
   Engine.disposeObject(world);bow.dispose();return {shots,nocking,blocked,ready,same};
  });
  assert.equal(results.bow.shots[0].charge,.4);assert.equal(results.bow.shots[0].perfect,false);
  assert.equal(results.bow.shots[1].perfect,true);assert.equal(results.bow.shots[1].speed,112);assert.equal(results.bow.shots[1].pierce,1);
  assert.equal(results.bow.shots[2].perfect,false);assert.equal(results.bow.nocking,'nocking');assert.equal(results.bow.blocked,'nocking');assert.equal(results.bow.ready,'drawing');assert.ok(results.bow.same);
  results.arrows=await page.evaluate(()=>{
   const s=new THREE.Scene(),arrows=new ArrowSystem(s,Bow.TUNE),shot={speed:112,power:1,perfect:true,pierce:1};
   const hits=[],land=[],ctx={targets:[],heightAt:()=>-100,colliders:[],onHit:t=>{hits.push(t.id);},onLand:(a,w)=>land.push(w)};
   arrows.setWind(.3,-.2,.5);const a=arrows.fire(new THREE.Vector3(0,20,0),new THREE.Vector3(0,0,-1),shot);
   for(let i=0;i<60;i++)arrows.update(1/60,ctx);const trajectory=a.pos.toArray();arrows.clear();
   arrows.setWind(0,0,0);ctx.targets=[-8,-16].map((z,i)=>({id:i,pos:new THREE.Vector3(0,20,z),alive:true,hitRadius:()=>2}));
   arrows.fire(new THREE.Vector3(0,20,0),new THREE.Vector3(0,0,-1),shot);for(let i=0;i<30;i++)arrows.update(1/60,ctx);const piercing=[...hits];
   hits.length=0;arrows.fire(new THREE.Vector3(0,20,0),new THREE.Vector3(0,0,-1),{...shot,remote:true});for(let i=0;i<30;i++)arrows.update(1/60,ctx);const remote=hits.length;
   arrows.clear();ctx.targets=[];ctx.heightAt=()=>0;arrows.fire(new THREE.Vector3(0,.1,0),new THREE.Vector3(0,-1,0),shot);arrows.update(1/60,ctx);
   arrows.dispose();return {trajectory,piercing,remote,land};
  });
  assert.deepEqual(results.arrows.piercing,[0,1]);assert.equal(results.arrows.remote,0);assert.deepEqual(results.arrows.land,['ground']);
  // Archived numerical trajectory: 60 fixed steps, full draw, stated crosswind.
  for(const [i,want]of [0,1,2].map((i)=>[i,[.4122403565388584,12.005035509549403,-109.47425552321735][i]]))assert.ok(Math.abs(results.arrows.trajectory[i]-want)<1e-7,JSON.stringify(results.arrows.trajectory));
  console.log('PASS draw windows, nocking, world rig, trajectory, piercing and remote authority');
  await page.evaluate(async()=>{await ShootoutMaterials.preload();window.m=new ShootoutMission({seed:42,ghost:false});m.build();});
  results.ownership=await page.evaluate(async()=>{
   const late=ShootoutMaterials.material('disposal-probe','#ffffff');late.dispose();await ShootoutMaterials.load('disposal-probe').ready;
   const first=ShootoutMaterials.material('feather','#ffffff'),second=ShootoutMaterials.material('feather','#ffffff');
   const texture=first.map;let disposed=0;texture.addEventListener('dispose',()=>disposed++);
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(),first);Engine.disposeObject(mesh);
   const result={lateUnbound:late.map===null,shared:first.map===second.map,textureSurvives:disposed===0};second.dispose();return result;
  });assert.ok(Object.values(results.ownership).every(Boolean),JSON.stringify(results.ownership));
  results.score=await page.evaluate(()=>{
   const target=new FlyerKit.Flyer(FlyerKit.TYPES.raven,{pos:new THREE.Vector3(0,5,-20),speed:18});
   const info={point:target.pos.clone(),dist:20},arrow={power:1,perfect:true,hits:1,pos:target.pos.clone(),prev:target.pos.clone().add(new THREE.Vector3(0,0,2))};
   m._onHit(target,arrow,info);const reward={money:m.money,chain:m.chain,kills:m.kills,hits:m.hits};Engine.disposeObject(target.mesh);
   const dove=new FlyerKit.Flyer(FlyerKit.TYPES.dove,{pos:new THREE.Vector3(0,5,-20),speed:14});m._onHit(dove,arrow,info);const penalty={cost:m.penalty,doves:m.doves,chain:m.chain};Engine.disposeObject(dove.mesh);
   const owl=new FlyerKit.Flyer(FlyerKit.TYPES.owl,{pos:new THREE.Vector3(0,12,-35),speed:15});m.scene.add(owl.mesh);owl.mesh.updateMatrixWorld(true);
   const weak=Object.fromEntries(Object.entries(owl.weak).map(([k,w])=>[k,{radius:w.radius,position:w.obj.position.toArray()}]));
   const tests=[];for(const key of Object.keys(owl.weak)){owl.weakName=key;const p=owl.aimPoint(new THREE.Vector3()),from=p.clone().add(new THREE.Vector3(0,0,10));tests.push(!!owl.weakSegHit(from,new THREE.Vector3(0,0,-20),20));}
   Engine.disposeObject(owl.mesh);return {reward,penalty,weak,tests};
  });
  assert.equal(results.score.reward.money,112.5);assert.equal(results.score.reward.chain,1);assert.equal(results.score.reward.kills,1);assert.equal(results.score.penalty.cost,400);assert.equal(results.score.penalty.doves,1);assert.equal(results.score.penalty.chain,0);assert.ok(results.score.tests.every(Boolean));
  assert.deepEqual(results.score.weak.lantern.position,[0,-4.8100000000000005,-.52]);assert.equal(results.score.weak.chest.radius,2.6);assert.deepEqual(results.score.weak.eyes.position,[0,2.3920000000000003,-1.3]);assert.deepEqual(results.score.weak.talons.position,[0,-2.7300000000000004,-.52]);
  console.log('PASS confirmed rewards, dove cost and owl weak points');
  await page.evaluate(()=>{m.dispose();});
  results.renders=[];
  for(const mobile of [false,true])for(const weather of ['still','drizzle','snow','night']){
   await page.setViewportSize(mobile?{width:390,height:844}:{width:1100,height:740});
   const data=await page.evaluate(({weather,mobile})=>{
    GameState.data.settings.quality=mobile?'low':'high';window.m=new ShootoutMission({seed:42,ghost:false});m.cond={time:weather==='night'?'night':'day',weather:weather==='night'?'mist':weather,windDir:.5};m.build();
    m.camera.aspect=innerWidth/innerHeight;m.camera.updateProjectionMatrix();m.camera.lookAt(0,5,-40);m.bow.charge=1;m.bow.state='drawing';m.bow._animate(1);
    m._beginRound(0);m.hud.banner.classList.remove('show');window.dispatchEvent(new PointerEvent('pointerdown',{pointerType:mobile?'touch':'mouse'}));Input.setTouchMode('aim');m._updateHud(0);Screens.show('hud-shoot');Sky.update(0,m.camera.position,0);m.forest.update(.1,m.camera.position);
    const costs=[];m.scene.traverse(o=>{if(o.isMesh){const n=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);costs.push({name:o.name||o.geometry.type,n});}});costs.sort((a,b)=>b.n-a.n);
    Engine.renderer.render(m.scene,m.camera);return {costs:costs.slice(0,8),weather,mobile,calls:Engine.renderer.info.render.calls,triangles:Engine.renderer.info.render.triangles,memory:{...Engine.renderer.info.memory}};
   },{weather,mobile});
   assert.ok(data.triangles<(mobile?550000:750000),JSON.stringify(data));
   await page.screenshot({path:path.join(out,weather+(mobile?'-phone':'')+'.png')});results.renders.push(data);
   await page.evaluate(()=>m.dispose());
  }
  results.boss=[];
  for(const mobile of [false,true]){
   await page.setViewportSize(mobile?{width:390,height:844}:{width:1100,height:740});
   await page.evaluate(mobile=>{
    GameState.data.settings.quality=mobile?'low':'high';window.m=new ShootoutMission({seed:42,ghost:false});m.build();m._beginRound(9);m._updateRound(.7);
    const f=m.boss.flyer;f.pos.set(0,12,-32);f.mesh.position.copy(f.pos);f.mesh.rotation.set(0,Math.PI,0);f.vel.set(0,0,10);
    m.camera.aspect=innerWidth/innerHeight;m.camera.updateProjectionMatrix();m.camera.lookAt(f.pos);m.bow._animate(1);
    window.dispatchEvent(new PointerEvent('pointerdown',{pointerType:mobile?'touch':'mouse'}));Input.setTouchMode('aim');Screens.show('hud-shoot');
   },mobile);
   for(let phase=0;phase<4;phase++){
    const data=await page.evaluate(phase=>{
     m._bossPhase(phase);m._updateBoss(0);const f=m.boss.flyer;f.flap=.8;f.animateParts(.03);m.hud.banner.classList.remove('show');m._updateHud(0);
     Sky.update(0,m.camera.position,0);m.scene.updateMatrixWorld(true);Engine.renderer.render(m.scene,m.camera);
     return {phase,weak:f.weakName,cue:m.hud.bossPhase.textContent};
    },phase);
    assert.ok(data.weak&&data.cue);results.boss.push({...data,mobile});
    await page.screenshot({path:path.join(out,'owl-phase-'+phase+(mobile?'-phone':'')+'.png')});
   }
   const damage=await page.evaluate(()=>{
    m._bossPhase(0);const f=m.boss.flyer;m.scene.updateMatrixWorld(true);const p=f.aimPoint(new THREE.Vector3());
    const arrow={power:1,perfect:true,hits:1,pos:p.clone().add(new THREE.Vector3(0,0,-3)),prev:p.clone().add(new THREE.Vector3(0,0,10))};
    m.boss.open=false;m._onHit(f,arrow,{point:p});const closed=m.money;
    m.boss.open=true;m._onHit(f,arrow,{point:p});const open=m.money;m.dispose();return {closed,open};
   });assert.equal(damage.closed,0);assert.equal(damage.open,400);
  }
  results.repeat=[];
  for(let i=0;i<5;i++){
   await page.evaluate(async()=>{GameState.data.settings.quality='low';await ShootoutMaterials.preload();window.m=new ShootoutMission({seed:42,ghost:false});m.build();m.camera.lookAt(0,4,-40);Sky.update(0,m.camera.position,0);Engine.renderer.render(m.scene,m.camera);});
   results.repeat.push(await page.evaluate(()=>({...Engine.renderer.info.memory})));
   await page.evaluate(()=>m.dispose());
  }
  assert.ok(results.repeat[4].geometries<=results.repeat[1].geometries+2,JSON.stringify(results.repeat));assert.ok(results.repeat[4].textures<=results.repeat[1].textures+2,JSON.stringify(results.repeat));
  results.comfort=await page.evaluate(()=>{
   GameState.data.settings.reducedMotion=true;window.m=new ShootoutMission({seed:42});m.build();m.aimYaw=0;m.aimPitch=0;m.shake=5;m.fovKick=3;m.speed01=1;m.bobT=2;m.sprinting=true;m._updateCamera(1);m.forest.update(.5,m.camera.position);
   const result={fov:m.camera.fov,roll:m.camera.rotation.z,eye:m.camera.position.y-m.pos.y,windTime:m.forest.uniforms.time.value};m.dispose();return result;
  });assert.equal(results.comfort.fov,64);assert.equal(results.comfort.roll,0);assert.ok(Math.abs(results.comfort.eye-1.72)<1e-9);assert.equal(results.comfort.windTime,0);
  await page.close();
  const fail=await pageFor(true);
  results.fallback=await fail.evaluate(async()=>{
   await ShootoutMaterials.preload();const m=new ShootoutMission({seed:42});m.build();m.camera.lookAt(0,4,-40);Sky.update(0,m.camera.position,0);Engine.renderer.render(m.scene,m.camera);
   const result={states:[...ShootoutMaterials.cache.values()].map(e=>e.status),calls:Engine.renderer.info.render.calls};m.dispose();return result;
  });assert.ok(results.fallback.states.every(s=>s==='error'));assert.ok(results.fallback.calls>40);await fail.screenshot({path:path.join(out,'asset-fallback.png')});await fail.close();
  assert.deepEqual(errors,[]);results.browser=await browser.version();results.renderer='SwiftShader; no device FPS claim';results.host={platform:process.platform,cpu:require('node:os').cpus()[0].model};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  console.log('PASS weather, phone layout, reduced motion, texture failure and repeat disposal');
 }finally{await browser.close();await new Promise(r=>app.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
