/* Read the built terrain. This interface never runs mission simulation. */
const MissionCinematics = (() => {
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  function forMission(id,m){
    let arrival,pickup,target,heightAt,name;
    if(!m._estateDressed&&id!=='ski'&&id!=='boat-race'){
      m._estateDressed=true;
      const root=id==='shootout'?m.forest.group:m.scene;
      EstateMaterials.dress(root,o=>{
        const n=o.name||'';
        if(/rock|cliff|cave|seabed/.test(n))return 'rock';
        if(/log|wreck|dead/.test(n))return 'timber';
        if(/pine|broadleaf|trees|bush/.test(n))return 'foliage';
        if(/grass|fern/.test(n))return 'ground';
        if(id==='shootout'&&o===m.forest.group.children[0])return 'ground';
        return null;
      });
    }
    if(id==='boat-race'){
      const start=m.path.at(8),end=m.path.at(m.path.total-8);
      const surfaces=[];m.cliffs.traverse(o=>{if(o.isMesh&&o.name==='cliffs')surfaces.push(o);});m.scene.updateMatrixWorld(true);
      const ray=new THREE.Raycaster();
      heightAt=(x,z)=>{ray.set(V(x,1000,z),V(0,-1,0));const hit=ray.intersectObjects(surfaces,false)[0];return hit?hit.point.y:2;};
      const pad=frame=>{const x=frame.point.x+frame.tangent.z*(frame.half+35),z=frame.point.z-frame.tangent.x*(frame.half+35);return V(x,heightAt(x,z)+.15,z);};
      arrival=pad(start);pickup=pad(end);
      target=m.boat.pos.clone().add(V(0,1,0));name='The Highland launch';
    }else if(id==='shootout'){
      heightAt=(x,z)=>m.forest.walkAt(x,z);arrival=V(0,heightAt(0,19),19);pickup=arrival.clone();target=V(0,heightAt(0,0)+2,0);name='The woodland clearing';
    }else if(id==='dive'){
      heightAt=(x,z)=>m.reef.heightAt(x,z);const shore=m.reef.shore;
      arrival=V(shore.landing.x+shore.nx*8,0,shore.landing.z+shore.nz*8);arrival.y=heightAt(arrival.x,arrival.z);
      pickup=arrival.clone();target=V(shore.tide.x,0,shore.tide.z);name='The loch jetty';
    }else if(id==='ski'){
      heightAt=(x,z)=>m.face.heightAt(x,z);const z=m.face.total-15;
      arrival=V(m.face.cxAt(0)+10,0,0);arrival.y=heightAt(arrival.x,0);
      pickup=V(m.face.cxAt(z)+10,0,z);pickup.y=heightAt(pickup.x,z);target=V(m.face.cxAt(100),m.face.heightAt(m.face.cxAt(100),100),100);name='The summit settlement';
    }else throw new Error('Missing destination staging: '+id);
    return {arrival,pickup,target,heightAt,name,
      handover:{position:(m._camPos||m.camera.position).clone(),look:(m._camLook||target).clone()},
      view(progress,reduced=false){const p=reduced?.35:progress;
        if(id==='boat-race'){const b=m.boat.pos;return {position:b.clone().add(V(18-p*8,9-p*3,14-p*20)),look:b.clone().add(V(0,1,2+p*12))};}
        return {position:arrival.clone().add(V(35-p*26,32-p*20,42-p*26)),look:target.clone().lerp(arrival,.35*p)};},
      update(dt,t,camera){m.updateEnvironment(dt,t,camera);}
    };
  }
  // A short road-accessible apron, independent of the mission's scoring course.
  function buildPickup(scene,anchors,returning){
    const point=returning?anchors.pickup:anchors.arrival,group=new THREE.Group();group.name='mission-transfer';
    group.position.copy(point);scene.add(group);
    const mat=EstateMaterials.material('gravel'),geo=new THREE.BoxGeometry(12,.35,22);EstateMaterials.uv(geo,3);
    const deck=new THREE.Mesh(geo,mat);deck.position.y=-.22;group.add(deck);
    for(const side of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.22,1,.22),EstateMaterials.material('timber'));p.position.set(side*5.5,.5,-8);group.add(p);}
    return {group,point,dispose(){Engine.disposeObject(group);}};
  }
  return {forMission,buildPickup};
})();
