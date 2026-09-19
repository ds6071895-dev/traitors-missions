/* Model-only refinements. All dimensions come from Boat.HULL; no simulation state
   is changed here. Legacy construction remains available to other callers. */
const BoatVisual = (()=>{
  const M=(id,c,o)=>BoatMaterials.material(id,c,o);
  function rod(a,b,r,mat){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),8),mat);mesh.position.copy(av).add(bv).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return mesh;}
  function build(paint={},legacy,detail='player'){
    if (BoatMaterials.low() && detail === 'player') detail = 'peer';
    const group=legacy();group.name='classic-highland-speedboat';
    const P={stripe:'#a62f36',accent:'#c49a54',chrome:'#cad4d4',...paint};
    const shell=group.getObjectByName('hull');
    BoatMaterials.smooth(shell.geometry);BoatMaterials.uv(shell.geometry,2.4);shell.material.dispose();
    const deckGroup=shell.geometry.groups.find(g=>g.materialIndex===1),uv=shell.geometry.attributes.uv,positions=shell.geometry.attributes.position;
    for(let i=deckGroup.start;i<deckGroup.start+deckGroup.count;i++)uv.setXY(i,positions.getX(i)/2.4,positions.getZ(i)/2.4);
    shell.material=[M('paint','#ffffff',{vertexColors:true,side:THREE.DoubleSide}),M('timber','#c4a27a',{side:THREE.DoubleSide}),M('rubber','#44555a',{side:THREE.DoubleSide})];
    const metal=M('metal',P.chrome),rubber=M('rubber','#172a30'),wood=M('timber','#c5a37a'),leather=M('leather',paint.stripe||'#b98358');
    const replaced=new Set(),paints=new Map();
    const enamel=color=>{const key=color.getHex();if(!paints.has(key))paints.set(key,M('paint',color));return paints.get(key);};
    group.traverse(o=>{
      if(!o.isMesh||o===shell)return;
      const old=o.material;
      if(o.name==='flag'){o.material=M('paint',P.stripe,{side:THREE.DoubleSide});}
      else if(old.transparent){o.material=new THREE.MeshPhysicalMaterial({color:'#99b7b4',roughness:.1,metalness:.1,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false});}
      else if(old.emissive&&old.emissiveIntensity>1){o.material=new THREE.MeshBasicMaterial({color:old.emissive});}
      else if(/seat|bench/.test(o.name)){o.material=leather;
        const {width:w,height:h,depth:d}=o.geometry.parameters;
        if(w&&h&&d){o.geometry.dispose();o.geometry=rounded(w,h,d);}
      }
      else if(o.name==='wheel'){o.material=rubber;}
      else if(o.geometry.type==='CylinderGeometry'||o.name==='windscreen-frame'){o.material=metal;}
      else if(o.name==='hatch'){o.material=wood;}
      else {o.material=enamel(old.color);}
      replaced.add(old);
    });replaced.forEach(m=>m.dispose());
    group.userData.wheel=group.getObjectByName('wheel');group.userData.engine=group.getObjectByName('engine-cowl');
    const parts=new THREE.Group();parts.name='marine-hardware';group.add(parts);
    const box=(w,h,d,x,y,z,mat)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);parts.add(o);return o;};
    // Rubber sheer strip follows the original hull stations, panel joins lie flush.
    for(const side of [-1,1]){
      const points=[];for(let i=0;i<35;i++){const z=U.lerp(Boat.HULL.sternZ,Boat.HULL.bowZ-.04,i/34);points.push(new THREE.Vector3(side*Boat.beamAt(z)*1.044,Boat.deckAt(z,Boat.beamAt(z))-.06,z));}
      parts.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),40,.055,5,false),rubber));
      const zB=Boat.HULL.cockpit.z1+.06,zT=Boat.HULL.cockpit.z1-.62,xb=Boat.cockpitHalfAt(zB)+.16,xt=xb*.72,yb=Boat.deckAt(zB,xb)+.02,yt=Boat.deckAt(zB,0)+.68;
      parts.add(rod([side*xb,yb,zB],[side*xt,yt,zT],.035,metal));
      for(const z of [-4.25,2.8]){const x=side*Boat.beamAt(z)*.78,y=Boat.deckAt(z,x);box(.28,.045,.3,x,y+.025,z,metal);parts.add(rod([x-.2,y+.12,z],[x+.2,y+.12,z],.035,metal));}
      // Enamel engine vents and exhaust bezels, behind the original transom.
      for(let i=0;i<5;i++)box(.42,.018,.055,side*.55,1.74,-4.35+i*.16,rubber);
      const exhaust=new THREE.Mesh(new THREE.TorusGeometry(.18,.034,6,16),metal);exhaust.position.set(side*.78,.3,-4.96);parts.add(exhaust);
    }
    const dash=box(1.36,.3,.055,0,1.3,.78,wood);dash.rotation.x=.25;
    const glass=new THREE.MeshBasicMaterial({color:'#122326'}),dial=new THREE.MeshBasicMaterial({color:'#edddb6'});
    for(const [x,r]of [[-.4,.12],[-.07,.16],[.31,.1]]){
      const face=new THREE.Mesh(new THREE.CircleGeometry(r,detail==='player'?24:12),glass);face.rotation.y=Math.PI;face.position.set(x,1.31,.737);parts.add(face);
      const bezel=new THREE.Mesh(new THREE.TorusGeometry(r,.017,6,20),metal);bezel.position.copy(face.position);parts.add(bezel);
      if(detail==='player')for(let j=0;j<9;j++){const a=j*.57;box(.012,.025,.012,x+Math.sin(a)*r*.78,1.31+Math.cos(a)*r*.78,.72,dial);}
      parts.add(rod([x,1.31,.72],[x+r*.6,1.35,.72],.009,dial));
    }
    const wheel=group.userData.wheel;if(wheel){wheel.position.set(-.45,1.2,.48);for(let i=0;i<3;i++){const a=i*U.TAU/3;wheel.add(rod([0,0,0],[Math.cos(a)*.18,Math.sin(a)*.18,0],.016,metal));}}
    if(detail==='player'){
      for(const side of [-1,1])for(let i=0;i<5;i++)box(.007,.43,.007,side*.55-.22+i*.11,1.21,-.322,wood);
      // Fine foredeck seams and hatch screws, no change to hull envelope.
      for(const z of [2.64,3.67])for(const x of [-.39,.39]){const screw=new THREE.Mesh(new THREE.SphereGeometry(.024,6,4),metal);screw.position.set(x,Boat.deckAt(z,x)+.073,z);parts.add(screw);}
    }
    // Batch static hardware by material; steering remains an articulated part.
    batch(parts);
    const fixed=new THREE.Group();fixed.name='fixed-fittings';
    for(const o of [...group.children])if(o.isMesh&&o!==shell&&!['flag','wheel','engine-cowl'].includes(o.name)){group.remove(o);fixed.add(o);}
    batch(fixed);group.add(fixed);
    if(detail==='ghost'){
      const old=new Set(),ghost=new THREE.MeshBasicMaterial({color:'#9ae7ee',transparent:true,opacity:.24,depthWrite:false});
      group.traverse(o=>{if(o.isMesh){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>old.add(m));o.material=ghost;o.renderOrder=2;}});old.forEach(m=>m.dispose());
    }
    return group;
  }
  function batch(group){
    const buckets=new Map();group.updateMatrixWorld(true);
    for(const o of [...group.children]){if(!o.isMesh||o.children.length)continue;const list=buckets.get(o.material)||[];const g=o.geometry.clone();g.applyMatrix4(o.matrix);if(!g.attributes.uv)BoatMaterials.uv(g,1.5);if(g.index){const n=g.toNonIndexed();g.dispose();list.push(n);}else list.push(g);buckets.set(o.material,list);o.geometry.dispose();group.remove(o);}
    for(const [mat,geos]of buckets){
      const g=Sky.mergeGeometries(geos),uv=new Float32Array(g.attributes.position.count*2);let offset=0;
      for(const part of geos){uv.set(part.attributes.uv.array,offset);offset+=part.attributes.uv.array.length;}
      g.setAttribute('uv',new THREE.BufferAttribute(uv,2));group.add(new THREE.Mesh(g,mat));geos.forEach(g=>g.dispose());
    }
  }
  function rounded(w,h,d){
    const g=new THREE.BoxGeometry(w,h,d,BoatMaterials.low()?2:4,BoatMaterials.low()?2:4,BoatMaterials.low()?2:4),p=g.attributes.position,r=Math.min(w,h,d)*.22;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),cx=U.clamp(x,-w/2+r,w/2-r),cy=U.clamp(y,-h/2+r,h/2-r),cz=U.clamp(z,-d/2+r,d/2-r),len=Math.hypot(x-cx,y-cy,z-cz)||1;p.setXYZ(i,cx+(x-cx)*r/len,cy+(y-cy)*r/len,cz+(z-cz)*r/len);}
    BoatMaterials.smooth(g);return g;
  }
  function animate(boat,t){
    const d=boat.mesh.userData;
    if(d.wheel)d.wheel.rotation.z=-boat.steerIn*.7;
    if(d.engine)d.engine.rotation.z=BoatMaterials.reduced()?0:Math.sin(t*48)*.002*boat.speed01;
  }
  function exhaust(){
    const parts=[];
    for(const x of [-.78,.78]){const p=new THREE.CircleGeometry(.12,12);p.rotateY(Math.PI);p.translate(x,.30,-4.98);parts.push(p);}
    const mesh=new THREE.Mesh(Sky.mergeGeometries(parts),new THREE.MeshBasicMaterial({color:'#f5b967',transparent:true,opacity:.4,depthWrite:false}));parts.forEach(g=>g.dispose());mesh.visible=false;return mesh;
  }
  return {build,rod,batch,animate,exhaust};
})();
