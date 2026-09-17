/* Matching seeded views, rendered by the real mission and renderer. */
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const { createServer } = require('../server');
(async () => {
  const out = process.env.SHOOTOUT_REVIEW_DIR || '/tmp/shootout-after';
  const baseline = process.env.SHOOTOUT_BASELINE_REF || 'd883d164f415eb48e8ed47717db2a2ea8f194338';
  fs.mkdirSync(out, {recursive:true});
  const app = createServer(); await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:1100,height:740}}), errors=[], metrics=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/.test(m.text())) errors.push(m.text());});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  if(process.env.THREE_TEST_ASSET) await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
  if(process.env.SHOOTOUT_BASELINE) await page.route('**/js/**',async r=>{const file=new URL(r.request().url()).pathname.slice(1);try{const body=require('node:child_process').execFileSync('git',['show',baseline+':'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']});await r.fulfill({body,contentType:'text/javascript'});}catch{await r.continue();}});
  try {
    await page.goto('http://127.0.0.1:'+app.server.address().port);
    await page.waitForFunction(()=>typeof ShootoutMission!=='undefined'&&Engine.renderer);
    await page.evaluate(()=>{Screens.hideAll();Engine.clearView();Engine.setPaused(true);Engine.renderer.setPixelRatio(1);window.review = new ShootoutMission({seed:42,ghost:false});review.cond={time:'day',weather:'still',windDir:.6};review.build();});
    async function capture(name, setup) {
      await page.evaluate(setup);await page.waitForTimeout(250);
      const data=await page.evaluate(()=>{const m=review;m.camera.aspect=innerWidth/innerHeight;m.camera.updateProjectionMatrix();Sky.update(0,m.camera.position,0);m.scene.updateMatrixWorld(true);Engine.renderer.render(m.scene,m.camera);return {calls:Engine.renderer.info.render.calls,triangles:Engine.renderer.info.render.triangles,memory:{...Engine.renderer.info.memory}};});
      await page.screenshot({path:path.join(out,name+'.png')});metrics.push({name,...data});console.log(name,data);
    }
    for(const mobile of [false,true]) {
      await page.setViewportSize(mobile?{width:390,height:844}:{width:1100,height:740});
      const suffix=mobile?'-phone':'';
      await capture('stand'+suffix,()=>{review.bow.setViewVisible(true);review.bow.charge=0;review.bow.state='ready';review.bow._animate(1);review.camera.position.set(0,2.82,0);review.camera.lookAt(0,4,-40);});
      await capture('floor'+suffix,()=>{review.bow.setViewVisible(false);review.camera.position.set(9,3,1);review.camera.lookAt(16,0,-9);});
      await capture('treeline'+suffix,()=>{review.camera.position.set(12,3,-24);review.camera.lookAt(38,10,-60);});
      await capture('draw'+suffix,()=>{review.bow.setViewVisible(true);review.bow.charge=1;review.bow.state='drawing';review.bow._animate(1);review.camera.position.set(0,2.82,0);review.camera.lookAt(0,4,-40);});
      await capture('animals'+suffix,()=>{review.bow.setViewVisible(false);window.specimens=new THREE.Group();let i=0;for(const id of ['raven','dove','deer','fox','rabbit','boar']) {if(!FlyerKit.TYPES[id])continue;const g=FlyerKit.TYPES[id].mesh();g.rotation.y=Math.PI;g.position.set((i%3-1)*4, i<3?4:0,-12);specimens.add(g);i++;}review.scene.add(specimens);review.camera.position.set(7,5,4);review.camera.lookAt(0,2,-12);});
      await page.evaluate(()=>Engine.disposeObject(specimens));
      await capture('owl'+suffix,()=>{window.specimens=FlyerKit.TYPES.owl.mesh();specimens.position.set(0,12,-35);specimens.rotation.y=Math.PI;review.scene.add(specimens);review.camera.position.set(7,10,-8);review.camera.lookAt(0,12,-35);});
      await page.evaluate(()=>Engine.disposeObject(specimens));
    }
    await page.evaluate(()=>review.dispose());
    fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify({browser:await browser.version(),renderer:'SwiftShader software rendering; no device FPS claim',errors,metrics},null,2));
    if(errors.length)throw new Error(errors.join('\n'));
  } finally {await browser.close();await new Promise(r=>app.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
