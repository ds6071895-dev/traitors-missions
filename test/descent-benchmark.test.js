/* Reproducible controller benchmarks; these do not substitute for human playtests. */
const fs=require('node:fs');
const {chromium}=require('playwright');
const {createServer}=require('../server');
(async()=>{
 const app=createServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage();
 try{
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
  await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>r.fulfill({path:process.env.THREE_TEST_ASSET,contentType:'text/javascript'}));
  await page.goto('http://127.0.0.1:'+app.server.address().port);
  await page.waitForFunction(()=>typeof Missions!=='undefined'&&Engine.renderer);
  await page.evaluate(()=>{Engine.renderer.render=()=>{};});
  const rows=[];
  for(const level of ['novice','competent','expert']){
   const row=await page.evaluate(level=>{
    Missions.end();Screens.hideAll();const m=Missions.launch('ski',{seed:42,mode:'prize',tod:'day',quality:'low',conditions:{time:'midday',snow:'packed',windDir:0,flakes:0}});
    m.state='running';
    for(const fn of ['_updateCamera','_updateHud','_updateAudio','_spawnFx','_updateRings','_updatePeers','_updateField','_flash','_confetti'])m[fn]=()=>{};
    m.fx.labels.add=()=>{};m.fx.spray.emit=()=>{};m.fx.rings.fire=()=>{};m.fx.update=()=>{};
    const old={steer:Input.steer,throttle:Input.throttle,held:Input.held,pressed:Input.pressed};
    let steer=0,trick=false,grab=false,tuck=0;
    Input.steer=()=>steer;Input.throttle=()=>tuck;Input.held=action=>action==='boost'?trick:action==='grabMute'?grab:false;Input.pressed=()=>false;
    let forcedCrash=false, declined=0;
    const hit=m._hitRing.bind(m);
    m._hitRing=(gate,ring,d)=>{
      // Calibrate with only about half the applicable gates and one forced crash.
      if(level==='competent'&&!gate.route&&gate.kind==='ground'&&declined<2){declined++;gate.state='skipped';m._dimGate(gate);return;}
      hit(gate,ring,d);
    };
    try{
     for(let i=0;i<30*240&&m.state==='running';i++){
      const s=m.skier,look=18+s.speed*.6;
      let target=m.face.cxAt(s.pos.z+look);
      if(level==='competent') {
       const gate=m.gates.find(g=>g.kind==='ground'&&!g.route&&g.index%2===0&&g.z>s.pos.z+4&&g.z<s.pos.z+75);
       if(gate) target=gate.rings[0].x;
      }
      if(level==='expert'){
       const route=m.course.routes.find((r,j)=>j%2===0&&s.pos.z+look>=r.z0&&s.pos.z+look<=r.z1);
       if(route){const u=(s.pos.z+look-route.z0)/(route.z1-route.z0);target=U.lerp(route.cut[0].x,route.cut.at(-1).x,u);}
      }
      const desired=Math.atan2(target-s.pos.x,look);
      steer=U.clamp(-U.wrapAngle(desired-s.heading)*(level==='novice'?1.6:2.8),-1,1);
      tuck=level==='novice'?-.12:level==='expert'?.2:0;
      trick=false;grab=level==='expert'&&s.airborne;
      if(level==='competent'&&!forcedCrash&&s.pos.z>1400){s._crash('BENCHMARK');m._onCrash('BENCHMARK');forcedCrash=true;}
      m.update(1/30,i/30);
     }
     clearTimeout(m._reportT); clearTimeout(m._slowmoT); clearTimeout(m._crashT);
     return {level,completed:m.state==='finished',elapsed:m.elapsed,timeLeft:m.time,earned:m.result?.earned||0,progress:m.skier.pos.z,
      gates:m.hoopsHit,groundGates:m.gates.filter(g=>g.kind==='ground').length,applicableMainGates:m.gates.filter(g=>g.kind==='ground'&&!g.route).length,crashes:m.crashes,routes:m.chutesDone,
      sources:{descent:m.descentMoney,tricks:m.trickMoney,gates:m.hoopMoney,routes:m.chuteMoney,trees:m.grazeMoney},style:m.ledger.style};
    }finally{Object.assign(Input,old);}
   },level);
   rows.push(row);console.log(JSON.stringify(row));
  }
  fs.writeFileSync('/tmp/descent-benchmarks.json',JSON.stringify(rows,null,2));
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
