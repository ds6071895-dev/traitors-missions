/* Bounded, scene-owned mesh particles. Only confirmed hits call burst(). */
class ShootoutFeedback {
  constructor(scene,seed) {
    this.rng=U.makeRng(seed^0x7a13);this.scene=scene;this.pools=[];this.dummy=new THREE.Object3D();
    const max=ShootoutMaterials.low()?48:112;
    for(const kind of ['feather','shard']) {
      const geo=kind==='feather'?ShootoutModels.featherGeo(.12,.65):new THREE.TetrahedronGeometry(.15);
      const mat=ShootoutMaterials.material(kind==='feather'?'feather':'rock','#ffffff',{side:THREE.DoubleSide});
      const mesh=new THREE.InstancedMesh(geo,mat,max);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);
      this.pools.push({kind,mesh,max,items:[]});
    }
  }
  burst(point,type) {
    const pool=this.pools[type.death==='feathers'?0:1],r=this.rng;
    const n=ShootoutMaterials.reduced()?4:ShootoutMaterials.low()?8:15;
    for(let i=0;i<n;i++){
      if(pool.items.length===pool.max)pool.items.shift();
      pool.items.push({pos:point.clone(),vel:new THREE.Vector3(r.range(-5,5),r.range(2,8),r.range(-5,5)),
        life:1.6,rot:r()*6.28,color:new THREE.Color(type.deathColor||'#b69774')});
    }
  }
  update(dt) {
    for(const p of this.pools){
      for(let i=p.items.length-1;i>=0;i--){const f=p.items[i];f.life-=dt;if(f.life<=0){p.items.splice(i,1);continue;}
        f.vel.y-=dt*(p.kind==='feather'?3:9);f.pos.addScaledVector(f.vel,dt);f.rot+=dt*(p.kind==='feather'?3:7);}
      p.mesh.count=p.items.length;
      p.items.forEach((f,i)=>{const d=this.dummy;d.position.copy(f.pos);d.rotation.set(f.rot,f.rot*.7,f.rot*.3);d.scale.setScalar(Math.min(1,f.life*3));d.updateMatrix();p.mesh.setMatrixAt(i,d.matrix);p.mesh.setColorAt(i,f.color);});
      p.mesh.instanceMatrix.needsUpdate=true;if(p.mesh.instanceColor)p.mesh.instanceColor.needsUpdate=true;
    }
  }
  clear(){this.pools.forEach(p=>{p.items.length=0;p.mesh.count=0;});}
  dispose(){this.pools.forEach(p=>Engine.disposeObject(p.mesh));this.pools.length=0;}
}

AudioBus.define('shootout-surface',(c,dest,o)=>{
  const t=c.currentTime,metal=o.surface==='bell',tree=o.surface==='tree';
  for(let i=0;i<(metal?4:1);i++){
    const osc=c.createOscillator(),gain=c.createGain();osc.type=metal?'sine':'triangle';
    const f=metal?[620,1247,1732,2495][i]:tree?245:95;osc.frequency.setValueAtTime(f,t);
    if(!metal)osc.frequency.exponentialRampToValueAtTime(40,t+.1);
    osc.connect(gain);gain.connect(dest);gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime((metal?.14:.12)/(i+1),t+.004);
    gain.gain.exponentialRampToValueAtTime(.0001,t+(metal?2.4-i*.35:.2));osc.start(t);osc.stop(t+(metal?2.6:.25));
  }
});

AudioBus.define('bow-nock',(c,dest)=>{
  const t=c.currentTime,osc=c.createOscillator(),gain=c.createGain();
  osc.type='triangle';osc.frequency.setValueAtTime(950,t);osc.frequency.exponentialRampToValueAtTime(280,t+.035);
  osc.connect(gain);gain.connect(dest);gain.gain.setValueAtTime(.035,t);gain.gain.exponentialRampToValueAtTime(.0001,t+.055);
  osc.start(t);osc.stop(t+.07);
});
