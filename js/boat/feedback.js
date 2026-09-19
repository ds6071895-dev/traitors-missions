/* Pooled persistent surface foam and mission-owned audio. No timers or inputs
   alter the race; all values are observations of the existing boat state. */
class BoatFeedback {
  constructor(scene, seed, cond) {
    this.rng=U.makeRng(seed^0x12aaf3);this.head=0;this.acc=0;
    this.max=BoatMaterials.low()?64:160;
    this.items=Array.from({length:this.max},()=>({x:0,z:0,age:0,life:0,yaw:0,width:0}));
    const geo=new THREE.PlaneGeometry(1,1);geo.rotateX(-Math.PI/2);
    const mat=new THREE.MeshBasicMaterial({color:'#c2d7cd',transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide});
    mat.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float foamAlpha; varying float vFoamAlpha;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFoamAlpha=foamAlpha;');
      shader.fragmentShader='varying float vFoamAlpha;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= vFoamAlpha;');
    };
    mat.customProgramCacheKey=()=> 'boat-persistent-foam';
    this.alphas=new Float32Array(this.max);geo.setAttribute('foamAlpha',new THREE.InstancedBufferAttribute(this.alphas,1));
    BoatMaterials.bind(mat,'foam');
    BoatMaterials.followWater(mat, .12);
    this.mesh=new THREE.InstancedMesh(geo,mat,this.max);this.mesh.name='persistent-stern-foam';this.mesh.frustumCulled=false;this.mesh.count=0;scene.add(this.mesh);this.dummy=new THREE.Object3D();
    this.rain=null;
    if(cond.time==='squall'||cond.sea==='storm'){
      const n=BoatMaterials.low()?70:220,p=new Float32Array(n*6);this.rainPositions=p;
      for(let i=0;i<n;i++){p[i*6]=this.rng.range(-55,55);p[i*6+1]=this.rng.range(0,35);p[i*6+2]=this.rng.range(-55,55);p[i*6+3]=p[i*6]+.5;p[i*6+4]=p[i*6+1]-1.5;p[i*6+5]=p[i*6+2]-.3;}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
      this.rain=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#bccfce',transparent:true,opacity:.14,depthWrite:false}));this.rain.frustumCulled=false;this.rain.visible=false;scene.add(this.rain);
    }
  }
  update(dt,b){
    this.acc+=dt;
    if(this.acc>.055&&!b.airborne&&b.speed>3){
      this.acc=0;
      for(const side of [-1,1]){const f=this.items[this.head++%this.max],sin=Math.sin(b.heading),cos=Math.cos(b.heading);Object.assign(f,{x:b.pos.x-sin*4.8+cos*side*1.3,z:b.pos.z-cos*4.8-sin*side*1.3,age:0,life:4.2,yaw:b.heading+side*.16,width:1.4+b.speed01*.7});}
    }
    let n=0;
    for(const f of this.items){if(f.life<=0)continue;f.age+=dt;f.life-=dt;if(f.life<=0)continue;
      const d=this.dummy,spread=f.width+f.age*1.6,fade=Math.min(1,f.life);
      d.position.set(f.x,Water.sampleHeight(f.x,f.z)+.12,f.z);d.rotation.set(0,f.yaw,0);d.scale.set(spread*fade,1,(2.5+f.age)*fade);d.updateMatrix();this.alphas[n]=Math.min(1,f.age*8)*Math.min(1,f.life/1.5);this.mesh.setMatrixAt(n++,d.matrix);
    }
    this.mesh.count=n;this.mesh.instanceMatrix.needsUpdate=true;this.mesh.geometry.attributes.foamAlpha.needsUpdate=true;
    if(this.rain){this.rain.visible=!BoatMaterials.reduced();const p=this.rainPositions;for(let i=0;i<p.length;i+=6){p[i+1]-=dt*22;if(p[i+1]<0)p[i+1]+=35;p[i+3]=p[i]+.5;p[i+4]=p[i+1]-1.5;p[i+5]=p[i+2]-.3;}this.rain.geometry.attributes.position.needsUpdate=true;this.rain.position.copy(b.pos);}
  }
  clear(){this.items.forEach(f=>f.life=0);this.mesh.count=0;this.head=0;this.acc=0;}
  dispose(){Engine.disposeObject(this.mesh);Engine.disposeObject(this.rain);}
  static audio(){
    if(!AudioBus.ready)return {set(){},stop(){}};
    const c=AudioBus.ctx,dest=AudioBus.bus('sfx'),nodes=[],sources=[],layers=[];
    function layer(type,f,gain){const source=type==='noise'?AudioBus.noiseSource():c.createOscillator(),filter=c.createBiquadFilter(),g=c.createGain();
      if(type!=='noise'){source.type=type;source.frequency.value=f;}filter.type=type==='noise'?'bandpass':'lowpass';filter.frequency.value=f;filter.Q.value=.55;g.gain.value=0;source.connect(filter);filter.connect(g);g.connect(dest);source.start();nodes.push(source,filter,g);sources.push(source);const l={source,filter,g,max:gain};layers.push(l);return l;
    }
    const engine=layer('triangle',65,.065),harmonic=layer('sawtooth',130,.025),rush=layer('noise',1200,.045),wind=layer('noise',450,.028),boost=layer('noise',2300,.035),slap=layer('noise',180,.04);
    let stopped=false;
    return {set(b,paused=false){if(stopped)return;const t=c.currentTime,s=Math.min(1,b.speed/b.tune.boostTop),duck=paused?0:1;
      engine.source.frequency.setTargetAtTime(42+s*100+b.throttleIn*12,t,.12);harmonic.source.frequency.setTargetAtTime(84+s*200,t,.12);
      engine.filter.frequency.setTargetAtTime(450+s*650,t,.15);harmonic.filter.frequency.setTargetAtTime(400+s*900,t,.15);
      const values=[.45+s*.55,.3+s*.7,s*s*(b.airborne?.1:1),s*s,b.boosting?1:0,Math.min(1,b.landed+b.impact*.6)];
      layers.forEach((l,i)=>l.g.gain.setTargetAtTime(l.max*values[i]*duck,t,i===5?.025:.16));
    },stop(){if(stopped)return;stopped=true;sources.forEach(s=>{try{s.stop();}catch{}});nodes.forEach(n=>n.disconnect());},get nodes(){return nodes.length;}};
  }
}
AudioBus.define('boat-cue',(c,dest,o)=>{
 const tones={safe:[440,660],perfect:[660,880,1320],risk:[392,587,784],landing:[220,440,880],surf:[330,495]};
 const fs=tones[o.kind]||tones.safe,t=c.currentTime;
 fs.forEach((f,i)=>{const osc=c.createOscillator(),g=c.createGain();osc.type='sine';osc.frequency.value=f;osc.connect(g);g.connect(dest);g.gain.setValueAtTime(.0001,t);g.gain.setValueAtTime(.0001,t+i*.065);g.gain.exponentialRampToValueAtTime(.045,t+i*.065+.008);g.gain.exponentialRampToValueAtTime(.0001,t+i*.065+.24);osc.start(t);osc.stop(t+.5);osc.onended=()=>{osc.disconnect();g.disconnect();};});
});
