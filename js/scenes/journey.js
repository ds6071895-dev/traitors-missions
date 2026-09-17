/* Host-directed travel. One current world, one camera owner, cancellable work. */
const Journey = (() => {
  let active=null;
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  const BEATS={outbound:['Leaving the forecourt','Through the gatehouse','The estate road','Across the glen','Beyond the Highlands','The destination','Arriving'],
    return:['Leaving the mission','Returning together','Back through the glen','Dusk falls','The castle at night','Through the gates','The fire awaits']};
  function send(type,extra={}){if(active)Net.send({type,journeyId:active.id,...extra});}
  function elapsed(j){return j.startedAt===null?0:Math.max(0,(Date.now()-j.startedAt)/1000);}
  function valid(a){return active===a&&!a.abort.signal.aborted&&Session.state&&Session.state.phase==='travel'&&Session.state.travel.id===a.id;}
  function ui(a){
    const root=document.createElement('div');root.id='journey-ui';
    root.innerHTML='<div class="journey-caption"><small id="journey-direction"></small><div id="journey-title"></div><p id="journey-status" role="status" aria-live="polite"></p></div><div class="journey-actions"><button id="journey-enter">Enter car · E</button><button id="journey-join">Join the car</button><button id="journey-skip">Vote to skip travel</button><label><input id="journey-motion" type="checkbox"> Reduced motion</label></div><div id="journey-error" hidden><p>We could not prepare the destination.</p><button id="journey-retry">Retry</button><button id="journey-leave">Leave the night</button></div>';
    document.body.appendChild(root);a.ui=root;
    const el=id=>root.querySelector('#journey-'+id);a.el=el;
    el('motion').checked=!!GameState.data.settings.reducedMotion;
    el('motion').onchange=()=>{GameState.data.settings.reducedMotion=el('motion').checked;GameState.save();};
    el('enter').onclick=()=>board(a);el('join').onclick=()=>Session.state.travel.beat===7?send('travelGather'):board(a);
    el('skip').onclick=()=>send('travelSkip');
    el('retry').onclick=()=>{el('error').hidden=true;a.failed=false;a.beat=null;sync(a);};
    el('leave').onclick=()=>{Show.end({abandon:true});Screens.show('play');};
    a.key=e=>{if(e.code==='KeyE'&&!el('enter').hidden)board(a);};window.addEventListener('keydown',a.key);
  }
  function board(a){
    const j=Session.state.travel,me=Session.state.players.find(p=>p.local);
    if(j.beat!==-1||j.boarded.includes(me.id)||a.boarding)return;
    a.boarding={at:Engine.time,from:(a.stage?a.stage.rig.pos:a.walk).clone()};
    if(a.stage)a.stage.setControls(false);
    Input.setMouseAim(false);
    AudioBus.play('estate-door');
  }
  function releaseWorld(a){
    if(a.stage){a.stage.dispose();a.stage=null;}
    if(a.handle){a.handle.dispose();a.handle=null;}
    if(a.scene){Engine.disposeObject(a.scene);a.scene=null;}
    a.car=null;a.cinematic=null;a.staging=null;a.pickupFigures=null;a.fire=null;a.worldKind=null;
    Engine.clearView();
  }
  function worldFor(j){return j.direction==='outbound'?(j.beat>=4?'mission':'estate'):(j.beat<2?'mission':j.beat===2?'estate-dusk':'estate');}
  function install(a){Engine.setView({scene:a.scene,camera:a.camera},(dt,t)=>{if(valid(a))frame(a,dt,t);Input.endFrame();});}
  async function buildWorld(a,j){
    const kind=worldFor(j);if(a.worldKind===kind)return;
    const retained=a.handle;
    if(!(retained&&kind==='mission'&&!a.worldKind))releaseWorld(a);
    a.worldKind=kind;
    if(kind.startsWith('estate')){
      a.stage=Stage.build({seed:Session.state.seed,hour:j.direction==='return'?(kind==='estate-dusk'?'dusk':'night'):'golden',dress:'none',vehicleDirected:true,players:Session.state.players});
      a.scene=a.stage.scene;a.car=a.stage.parkedCar;a.stage.setControls(j.beat===-1||j.beat===7);
      if(j.direction==='return'){a.stage.claudia.visible=false;}
    }else{
      if(!a.handle)a.handle=Missions.prepare(j.destination,a.opts.missionOpts);
      a.scene=a.handle.view.scene;a.cinematic=a.handle.instance.cinematic();
      // A separate camera leaves mission camera attachments (bow, HUD) out of the shot.
      a.staging=MissionCinematics.buildPickup(a.scene,a.cinematic,j.direction==='return');
      a.car=EstateCar.build(Session.state.players);a.scene.add(a.car.group);
      a.car.group.position.copy(a.staging.point);a.car.group.updateMatrixWorld(true);
      a.walk=a.staging.point.clone().add(V(-4,0,5));a.yaw=0;a.pitch=0;
      a.pickupFigures=Session.state.players.map((p,i)=>{if(p.local)return null;const fig=Figure.build(p.look?{look:p.look,long:false}:{palette:Figure.paletteFor(p.seat),long:false});EstateMaterials.fabric(fig);fig.position.set(i===2?4:-4,0,3+i);a.staging.group.add(fig);return fig;});
      if(a.handle.instance.score&&a.handle.instance.score.stop){a.handle.instance.score.stop(.8);a.handle.instance.score=null;}
      if(a.handle.instance.music){a.handle.instance.music.stop(.8);a.handle.instance.music=null;}
      for(const key of ['engineSnd','ambSnd','windSnd','carveSnd'])if(a.handle.instance[key]){a.handle.instance[key].stop();a.handle.instance[key]=null;}
    }
    a.camera=new THREE.PerspectiveCamera(58,Engine.size.w/Engine.size.h,.12,24000);
    a.scene.add(a.camera);a.camera.position.copy(a.car.group.position).add(V(8,5,12));a.camera.lookAt(a.car.group.position);
    install(a);
  }
  async function sync(a,initial=false){
    if(!valid(a)||a.failed)return;
    const j=Session.state.travel;if(a.beat===j.beat)return;
    a.beat=j.beat;a.ready=false;const beat=j.beat;
    const work=async()=>{
      if(!valid(a)||Session.state.travel.beat!==beat)return;
      await EstateMaterials.preload();
      if(!valid(a)||Session.state.travel.beat!==beat)return;
      await buildWorld(a,j);
      if(!valid(a)||Session.state.travel.beat!==beat)return;
      if(a.stage){
        a.stage.setControls(j.beat===-1||j.beat===7);
        if(j.beat===7){a.stage.rig.pos.copy(a.stage.land.anchors.returnStop).add(V(3,0,0));a.stage.rig.yaw=-1.0;}
      }
      if(j.beat===7&&!a.fire){
        a.fire=EstateFire.build({scale:1.45,light:3.1,range:34,logs:6});a.fire.position.copy(a.stage.land.anchors.fire);a.scene.add(a.fire);
        a.stage.claudia.position.copy(a.stage.land.anchors.fire).add(V(0,0,-3.4));a.stage.claudia.visible=true;
      }
      Input.setMouseAim(j.beat===-1||j.beat===7||j.beat===2||j.beat===1);
      Input.setTouchMode(j.beat===-1||j.beat===7?'walk':'off');
      frame(a,0,Engine.time);
      Engine.renderer.render(a.scene,a.camera);
      if(valid(a)){a.ready=true;send('travelReady',{beat});}
    };
    const loading=setTimeout(()=>{if(valid(a)&&!a.ready)a.el('status').textContent='Preparing the destination…';},500);
    try{
      if(initial||a.worldKind===worldFor(j))await work();
      else await Screens.cover(work,a.abort.signal,650);
      if(valid(a)&&beat>=0)AudioBus.play(beat===0?'estate-door':beat===1?'estate-engine':beat===5?'estate-gate':'estate-gravel');
    }catch(error){
      if(!valid(a))return;
      console.error('Destination preparation failed',error);a.failed=true;a.ready=false;
      // Failed builds are retryable and never produce a result.
      releaseWorld(a);a.el('error').hidden=false;
    }finally{clearTimeout(loading);}
  }
  function paint(a,j){
    const me=Session.state.players.find(p=>p.local),aboard=j.boarded.includes(me.id),left=Math.max(0,Math.ceil(30-elapsed(j)));
    a.ui.querySelector('.journey-caption').hidden=j.beat>=0&&j.beat<7;
    a.el('direction').textContent=j.direction==='outbound'?'THE HIGHLAND ESTATE':'RETURN TO THE CASTLE';
    a.el('title').textContent=j.beat===-1?'Your car is waiting':j.beat===7?'Follow the lanterns':BEATS[j.direction][j.beat]||'';
    a.el('status').textContent=!a.ready?'Preparing the destination…':j.startedAt===null?'Waiting for everybody…':j.beat===-1?j.boarded.length+' of '+Session.alive().length+' aboard · '+left+'s'+(left<=5?' · Joining everyone now':''):j.beat===7?j.gathered.length+' of '+Session.alive().length+' at the fire · '+left+'s':j.votes.length?j.votes.length+' of '+Session.alive().length+' voted to skip':'';
    a.el('join').hidden=!(j.beat===-1&&!aboard||j.beat===7&&!j.gathered.includes(me.id));
    a.el('join').textContent=j.beat===7?'Join the fire':'Join the car';
    a.el('join').disabled=!!a.boarding;a.el('enter').disabled=!!a.boarding;
    a.el('skip').hidden=j.beat<0||j.beat>=6;a.el('skip').disabled=j.votes.includes(me.id);
    const myIndex=Session.state.players.findIndex(p=>p.local),pos=a.stage?a.stage.rig.pos:a.walk;
    a.el('enter').hidden=j.beat!==-1||aboard||!a.car||!pos||pos.distanceTo(a.car.doorWorld(myIndex))>2.8;
  }
  function frame(a,dt,t){
    const j=Session.state.travel;if(!a.scene||!a.camera)return;
    const players=Session.state.players,me=players.find(p=>p.local),seat=players.indexOf(me),aboard=j.boarded.includes(me.id),reduced=!!GameState.data.settings.reducedMotion;
    if(a.stage)a.stage.update(dt);else if(a.cinematic)a.cinematic.update(dt,t,a.camera);
    if(a.fire){ForestKit.animateFire(a.fire,t,1);EstateFire.update(a.fire,t);}
    if(!a.ready){paint(a,j);return;}
    if(a.boarding){
      const k=U.clamp((t-a.boarding.at)/1.1,0,1),point=a.boarding.from.clone().lerp(a.car.doorWorld(seat),k*k*(3-2*k));
      if(a.stage)a.stage.rig.pos.copy(point);else a.walk.copy(point);
      if(k>=1){a.boarding=null;send('travelBoard');}
    }
    if(aboard&&!a.wasAboard){a.wasAboard=true;a.seatTransition={at:t,from:a.camera.position.clone()};}
    const e=elapsed(j),p=U.clamp(e/(j.duration||1),0,1),smooth=p*p*(3-2*p);
    let pos,look;
    if(a.stage&&j.beat>=0&&j.beat<7){
      const road=a.stage.land.road;
      let distance=0;
      if(j.direction==='outbound')distance=road.length*([0,.04,.16,.34][Math.min(j.beat,3)]+[.04,.12,.18,.35][Math.min(j.beat,3)]*p);
      else {
        const end=EstateLayout.route.nearest(...[EstateLayout.anchors.returnStop[0],EstateLayout.anchors.returnStop[2]]).along/road.length;
        const ranges={2:[.69,.36],3:[.36,.36],4:[.36,.13],5:[.13,end+.02],6:[end+.02,end]},range=ranges[j.beat]||[end,end];
        distance=road.length*U.lerp(range[0],range[1],p);
      }
      a.car.pose(road.sample(distance),j.direction==='return');
    }
    if(!a.stage&&j.direction==='return'&&j.beat>=0){
      a.car.group.position.copy(a.staging.point).add(V(0,0,j.beat===0?smooth*7:7));a.car.group.updateMatrixWorld(true);
    }
    if(a.stage){
      const c=a.car.group.position;
      if(j.beat===-1&&!aboard||j.beat===7){a.camera.copy(a.stage.camera);a.camera.aspect=Engine.size.w/Engine.size.h;}
      else if(j.beat===-1||j.direction==='outbound'&&j.beat===2||j.direction==='return'&&j.beat===1){
        pos=a.car.seatWorld(seat);const aim=Input.aimDelta();a.lookYaw=U.clamp((a.lookYaw||0)-aim.x*.002-Input.aimStick().x*dt,-.65,.65);
        look=c.clone().add(V(Math.sin(a.car.group.rotation.y+a.lookYaw)*15,1.6,Math.cos(a.car.group.rotation.y+a.lookYaw)*15));
      }else{
        const high=j.direction==='outbound'?j.beat===3:j.beat===2||j.beat===4;
        pos=c.clone().add(V(high?65:7,high?45:3.4,high?65:-9));look=c.clone().add(V(0,1,0));
        if(j.direction==='return'&&j.beat===4){pos=V(85,65,102);look=V(0,37,-20);}
        if(reduced){pos=high?V(70,66,115):V(23,30,51);look=high?V(0,25,75):V(0,23,38);}
      }
      if(j.beat===7&&!j.gathered.includes(me.id)&&a.stage.rig.pos.distanceTo(a.stage.land.anchors.fire)<7)send('travelGather');
      for(let i=0;i<a.stage.figures.length;i++){
        const fig=a.stage.figures[i];if(!fig)continue;
        const player=players[i],remote=j.movement[player.id];
        if(j.beat===-1&&j.boarded.includes(player.id)){
          const door=a.car.doorWorld(i);fig.position.lerp(door,1-Math.exp(-dt*2));Figure.setLocomotion(fig,1);
          if(fig.position.distanceTo(door)<.4)fig.visible=false;
        }else if(remote&&(j.beat===-1||j.beat===7)){fig.position.x=U.damp(fig.position.x,remote.x,6,dt);fig.position.z=U.damp(fig.position.z,remote.z,6,dt);fig.position.y=a.stage.land.heightAt(fig.position.x,fig.position.z);a.stage.seats[i].pos.copy(fig.position);}
        else if(j.beat>=0&&j.beat<7)fig.visible=false;
      }
    }else if(a.cinematic){
      if(j.direction==='return'&&j.beat===-1&&!aboard){
        const d=Input.aimDelta(),mv=Input.moveAxes();a.yaw-=d.x*.002;a.pitch=U.clamp(a.pitch-d.y*.002,-1,1);
        const prev=a.walk.clone();a.walk.x+=(-Math.sin(a.yaw)*mv.y+Math.cos(a.yaw)*mv.x)*dt*3.4;a.walk.z+=(-Math.cos(a.yaw)*mv.y-Math.sin(a.yaw)*mv.x)*dt*3.4;
        if(Math.abs(a.walk.x-a.staging.point.x)>5.5||Math.abs(a.walk.z-a.staging.point.z)>10)a.walk.copy(prev);
        a.walk.y=a.staging.point.y;pos=a.walk.clone().add(V(0,1.62,0));look=pos.clone().add(V(-Math.sin(a.yaw)*10,Math.sin(a.pitch)*10,-Math.cos(a.yaw)*10));
      }else if(j.direction==='return'){
        pos=a.car.seatWorld(seat);look=a.car.group.position.clone().add(V(0,1.7,16));
        if(j.beat===0){pos=a.car.group.position.clone().add(V(7,3,9));look=a.car.group.position.clone();}
      }else{
        const shot=a.cinematic.view(j.beat===6?1:smooth,reduced);pos=shot.position;look=shot.look;
        a.el('title').textContent=a.cinematic.name;
        if(j.beat===6&&!reduced){const destination=a.cinematic.handover;pos.lerp(destination.position,smooth);look.lerp(destination.look,smooth);}
      }
    }
    if(a.pickupFigures){a.pickupFigures.forEach((fig,i)=>{if(!fig)return;const player=players[i],remote=j.movement[player.id];
      if(j.beat>=0){fig.visible=false;return;}
      if(j.boarded.includes(player.id)){const door=a.car.doorWorld(i).sub(a.staging.point);fig.position.lerp(door,1-Math.exp(-dt*3));Figure.setLocomotion(fig,1);fig.visible=fig.position.distanceTo(door)>.4;}
      else if(remote){fig.position.x=U.damp(fig.position.x,remote.x-a.staging.point.x,6,dt);fig.position.z=U.damp(fig.position.z,remote.z-a.staging.point.z,6,dt);}
      Figure.update(fig,dt,t);EstateMaterials.figureLOD(fig,a.camera);
    });}
    if(pos&&a.seatTransition&&!reduced){const k=U.clamp((t-a.seatTransition.at)/.7,0,1);pos.lerpVectors(a.seatTransition.from,pos,k*k*(3-2*k));if(k===1)a.seatTransition=null;}
    if(pos){if(a.stage&&j.beat>=0&&j.beat!==2)pos.y=Math.max(pos.y,a.stage.land.heightAt(pos.x,pos.z)+1.3);a.camera.position.copy(pos);a.camera.lookAt(look);}
    a.camera.updateProjectionMatrix();
    const seated=j.beat===-1?j.boarded.filter(id=>{const i=players.findIndex(p=>p.id===id),fig=a.stage?a.stage.figures[i]:a.pickupFigures&&a.pickupFigures[i];return !fig||!fig.visible;}):j.boarded;
    a.car.update(dt,t,seated,j.beat>=0&&j.beat<6,me.id,a.camera);
    if(aboard&&j.beat===-1){if(a.stage)a.stage.setControls(false);Input.setMouseAim(true);Input.setTouchMode('aim');}
    if(j.beat===7&&a.music)a.music.duck(.12,1);
    else if(a.music&&VoiceChat.loudest(.1))a.music.duck(.25,.8);
    if(j.beat>=0&&j.beat<6&&!a.motor)a.motor=AudioBus.play('estate-motor');
    if(a.motor){a.motor.set(j.beat>=0&&j.beat<6?.5:0);if(j.beat===7){a.motor.stop();a.motor=null;}}
    const walking=j.beat===7||j.beat===-1&&!aboard;
    if(walking&&t-(a.lastStep||0)>.46){const move=Input.moveAxes();if(Math.hypot(move.x,move.y)>.1){AudioBus.play(a.stage&&a.stage.rig.pos.z<12?'estate-stone-step':'estate-step');a.lastStep=t;}}
    if(a.stage&&j.beat>=0&&Math.abs(a.car.group.position.z-EstateLayout.anchors.bridge[2])<5&&!a.bridgeSound){AudioBus.play('estate-bridge');a.bridgeSound=true;}
    if(a.stage)a.stage.land.setGates(j.direction==='outbound'||j.beat>=5,dt);
    paint(a,j);
    if(a.cinematic&&j.direction==='outbound'&&j.beat>=5)a.el('title').textContent=a.cinematic.name;
  }
  async function start(opts,handle=null){
    stop();const j=Session.state.travel;
    const a={id:j.id,opts,handle,abort:new AbortController(),beat:null,ready:false,lookYaw:0,scene:null};active=a;
    ui(a);Screens.hideAll();RoomUI.hideAgenda();VoiceChat.openFloor();MissionNet.detach();
    a.music=Music.journey(j.direction==='return');a.wind=AudioBus.wind();if(a.wind)a.wind.set(.18);
    a.off=Net.on(e=>{if(e.type==='state'||e.type==='travel')sync(a);});
    a.timer=setInterval(()=>{
      if(!valid(a))return;
      sync(a);
      if(a.ready)send('travelReady',{beat:a.beat});
      if(Session.isHost)send('travelTick');
      const jj=Session.state.travel,position=a.stage?a.stage.rig.pos:a.walk;
      if(position&&(jj.beat===-1||jj.beat===7))send('travelMove',{x:position.x,z:position.z});
    },350);
    await sync(a,true);return a;
  }
  function takePrepared(){if(!active)return null;const h=active.handle;
    if(h){if(active.staging)active.staging.dispose();if(active.car)active.car.dispose();if(active.camera)active.scene.remove(active.camera);}
    active.handle=null;active.scene=null;return h;
  }
  function stop(){
    const a=active;if(!a)return;active=null;a.abort.abort();clearInterval(a.timer);if(a.off)a.off();
    window.removeEventListener('keydown',a.key);if(a.ui)a.ui.remove();if(a.music)a.music.stop(.8);if(a.wind)a.wind.stop();if(a.motor)a.motor.stop();
    releaseWorld(a);Input.setMouseAim(false);Input.setTouchMode('off');
  }
  return {start,stop,takePrepared,get active(){return active;}};
})();

for(const [name,freq,duration] of [['door',90,.28],['engine',48,1.4],['gravel',180,.7],['gate',65,.9],['bridge',110,.25],['step',200,.16],['stone-step',420,.12]]) {
  AudioBus.define('estate-'+name,(ctx,dest)=>{
    const t=ctx.currentTime,g=ctx.createGain(),filter=ctx.createBiquadFilter(),source=AudioBus.noiseSource();
    filter.type='lowpass';filter.frequency.value=freq*5;source.connect(filter);filter.connect(g);g.connect(dest);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.10,t+.03);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.start(t);source.stop(t+duration);
  });
}

AudioBus.define('estate-motor',(ctx,dest)=>{
  const oscillator=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
  oscillator.type='sawtooth';oscillator.frequency.value=42;filter.type='lowpass';filter.frequency.value=160;
  gain.gain.value=0;oscillator.connect(filter);filter.connect(gain);gain.connect(dest);oscillator.start();let stopped=false;
  return {set(v){if(!stopped){gain.gain.setTargetAtTime(v*.07,ctx.currentTime,.4);oscillator.frequency.setTargetAtTime(42+v*22,ctx.currentTime,.6);}},
    stop(){if(stopped)return;stopped=true;gain.gain.setTargetAtTime(0,ctx.currentTime,.15);oscillator.stop(ctx.currentTime+.8);oscillator.onended=()=>{oscillator.disconnect();filter.disconnect();gain.disconnect();};}};
});
