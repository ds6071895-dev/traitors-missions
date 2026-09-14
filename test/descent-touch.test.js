const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../server');
(async()=>{
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:820,height:640}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:'+app.server.address().port);
  await page.waitForFunction(()=>typeof Missions!=='undefined'&&Engine.renderer);
  await page.evaluate(()=>{Screens.hideAll();Missions.launch('ski',{seed:42,mode:'practice',section:'summit-0',quality:'low',tod:'day'});});
  const point=async(selector,id)=>{const b=await page.locator(selector).boundingBox();assert.ok(b,selector);return {x:b.x+b.width/2,y:b.y+b.height/2,id};};
  const pop=await point('.boost-btn',1),mute=await point('.ski-mute',2),stick=await point('.stick-zone',3);
  const session=await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pop,mute,stick]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pop,mute,{...stick,x:stick.x+24,y:stick.y-24}]});
  const input=await page.evaluate(()=>({pop:Input.held('boost'),mute:Input.held('grabMute'),steer:Input.steer(),tuck:Input.throttle()}));
  assert.equal(input.pop,true);assert.equal(input.mute,true);assert.ok(Math.abs(input.steer)>.3);assert.ok(input.tuck>.3);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const tail=await point('.ski-tail',4);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tail]});
  assert.equal(await page.evaluate(()=>Input.held('grabTail')),true);
  await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.equal(await page.evaluate(()=>Input.held('grabTail')||Input.held('grabMute')||Input.held('boost')),false);
  await page.evaluate(()=>Missions.end());assert.equal(await page.locator('.ski-tail').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('PASS: simultaneous touch stick, pop and grab; tail grab; cancellation; teardown');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
