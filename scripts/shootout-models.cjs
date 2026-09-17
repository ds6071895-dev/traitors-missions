/* Isolated model review: consistent light, full texture loading, no gameplay. */
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),{createServer}=require('../server');
(async()=>{
 const out=process.env.SHOOTOUT_MODEL_DIR||'/tmp/shootout-models';fs.mkdirSync(out,{recursive:true});
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:700,height:700}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|shader error/.test(m.text()))errors.push(m.text());});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 if(process.env.THREE_TEST_ASSET)await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
 try{
  await page.goto('http://127.0.0.1:'+app.server.address().port);await page.waitForFunction(()=>typeof ShootoutModels!=='undefined'&&Engine.renderer);
  const ids=await page.evaluate(async()=>{Engine.clearView();Engine.setPaused(true);Screens.hideAll();Engine.renderer.setPixelRatio(1);await ShootoutMaterials.preload();return Object.keys(FlyerKit.TYPES);});
  for(const id of [...ids,'bow']){
   const stats=await page.evaluate(id=>{
    const scene=new THREE.Scene();scene.background=new THREE.Color('#24382e');
    scene.add(new THREE.HemisphereLight('#e7f2ff','#59613a',2));
    const key=new THREE.DirectionalLight('#ffe1b1',2.7);key.position.set(-4,7,6);scene.add(key);
    const rim=new THREE.DirectionalLight('#b9d9df',1.1);rim.position.set(5,3,-6);scene.add(rim);
    const model=id==='bow'?Bow.parts().group:FlyerKit.TYPES[id].mesh();scene.add(model);
    if(model.userData.wings)for(const w of model.userData.wings){w.pivot.rotation.z=-w.side*.42;if(w.fore)w.fore.rotation.z=-w.side*.18;}
    model.rotation.y=id==='bow'?.9:Math.PI+.45;
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const camera=new THREE.PerspectiveCamera(38,1,.01,1000),span=Math.max(size.x,size.y);
    camera.position.copy(center).add(new THREE.Vector3(span*.18,span*.18,span*1.9));camera.lookAt(center);
    const plinth=new THREE.Mesh(new THREE.CylinderGeometry(span*.48,span*.50,.07,48),ShootoutMaterials.material('timber','#8c815f'));
    plinth.position.set(center.x,box.min.y-.06,center.z);scene.add(plinth);
    Engine.renderer.render(scene,camera);window.reviewModel=scene;
    return {id,calls:Engine.renderer.info.render.calls,triangles:Engine.renderer.info.render.triangles};
   },id);
   await page.screenshot({path:path.join(out,id+'.png')});await page.evaluate(()=>Engine.disposeObject(reviewModel));console.log(stats);
  }
  fs.writeFileSync(path.join(out,'errors.json'),JSON.stringify(errors));if(errors.length)throw new Error(errors.join('\n'));
 }finally{await browser.close();await new Promise(r=>app.server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
