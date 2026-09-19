/* Boat Race's opt-in coastline dressing. Never consumes a gameplay RNG. */
const BoatScenery = (()=>{
  const M=BoatMaterials.material;
  function surface(mesh,id,scale=6){
    const old=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    BoatMaterials.uv(mesh.geometry,scale);
    mesh.material=old.map((m,i)=>M(i===1?'moss':id,'#c4c2b5',{vertexColors:!!mesh.geometry.attributes.color,side:m.side}));
    if(mesh.material.length===1)mesh.material=mesh.material[0];old.forEach(m=>m.dispose());
    const c=mesh.geometry.attributes.color;
    if(c)for(let i=0;i<c.count;i++){const r=c.getX(i),g=c.getY(i),b=c.getZ(i),grey=(r+g+b)/3;c.setXYZ(i,r*.68+grey*.32,g*.58+grey*.34,b*.68+grey*.24);} // heather/olive, away from fluorescent grass
  }
  function cliffs(group){
    const mesh=group.children.find(o=>o.name==='cliffs');surface(mesh,'rock',8);
    // Preserve the original tree placement stream in full, including instance
    // matrices and its RNG continuation. The replacement uses fixed geometry.
    const old=group.children.find(o=>o.isInstancedMesh);if(!old)return;
    const stems=[],leaves=[];
    const trunk=new THREE.CylinderGeometry(.22,.55,9,6);trunk.translate(0,4,0);stems.push(trunk);
    const temp=M('metal','#ffffff');
    for(let level=0;level<4;level++)for(let j=0;j<4;j++){
      const a=j*U.TAU/4+level*1.8,y=2.4+level*1.2,r=3.1-level*.48;
      const branch=BoatVisual.rod([0,y,0],[Math.cos(a)*r,y+.65,Math.sin(a)*r],.065,temp);branch.updateMatrix();const bg=branch.geometry;bg.applyMatrix4(branch.matrix);stems.push(bg);
      const leaf=new THREE.IcosahedronGeometry(1,0);leaf.scale(r*.75,.55,r*.42);leaf.rotateY(-a);leaf.translate(Math.cos(a)*r*.68,y+.7,Math.sin(a)*r*.68);leaves.push(leaf);
    }temp.dispose();
    for(const [geos,id,col]of [[stems,'dock','#807c66'],[leaves,'pine','#677c67']]){
      const geo=Sky.mergeGeometries(geos);BoatMaterials.uv(geo,2);
      const step=BoatMaterials.low()?5:2,clusters=new Map(),matrix=new THREE.Matrix4(),mat=M(id,col);
      for(let i=0;i<old.count;i+=step){old.getMatrixAt(i,matrix);const e=matrix.elements,key=Math.floor(e[12]/256)+','+Math.floor(e[14]/256);const list=clusters.get(key)||[];list.push(matrix.clone());clusters.set(key,list);}
      for(const list of clusters.values()){const tree=new THREE.InstancedMesh(geo,mat,list.length);list.forEach((matrix,i)=>tree.setMatrixAt(i,matrix));tree.name='highland-pines';tree.computeBoundingSphere();group.add(tree);}
      geos.forEach(g=>g.dispose());
    }
    Engine.disposeObject(old);
  }
  function equipment(m){
    surface(m.buoys.mesh,'paint',2);
    const paint=M('paint','#aebbb5',{vertexColors:true});m._hoopFrameMat.dispose();m._hoopFrameMat=paint;
    for(const h of m.hoops){
      h.group.children[2].material=paint;BoatMaterials.uv(h.group.children[2].geometry,3);
      const old=h.ring.material;h.ring.material=M('metal',h.risk?'#7d653b':'#386772',{emissive:h.idle,emissiveIntensity:.68});old.dispose();
      h.glow.material.opacity=.055;
      // External brackets, bolts and safety markings never narrow the opening.
      const hardware=new THREE.Group(),metal=M('metal','#a8b2ad'),rubber=M('rubber','#263638'),rope=M('rope','#afa182');
      for(const side of [-1,1]){
        const r=h.radius;
        for(let i=0;i<3;i++){
          const band=new THREE.Mesh(new THREE.TorusGeometry(.68,.09,6,12),metal);band.rotation.x=Math.PI/2;band.position.set(side*(r+.9),-i*2.8,0);hardware.add(band);
        }
        const float=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,5,12),rubber);float.rotation.x=Math.PI/2;float.position.set(side*(r+1.6),-m.C.hoopHeight,0);hardware.add(float);
        hardware.add(BoatVisual.rod([side*(r+1.6),-m.C.hoopHeight,2.4],[side*(r+.9),-2,0],.085,rope));
        for(let i=0;i<(h.risk?2:1);i++){
          const plate=new THREE.Mesh(new THREE.BoxGeometry(1.5,.36,.2),new THREE.MeshBasicMaterial({color:h.risk?'#efc16d':'#97e1dd'}));plate.position.set(side*(r+1.15),2+i*.65,-.65);plate.rotation.z=side*(h.risk?.65:0);hardware.add(plate);
        }
      }
      for(let i=0;i<12;i++){const a=i*U.TAU/12,r=h.radius+.12;const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.16,6),metal);bolt.rotation.x=Math.PI/2;bolt.position.set(Math.sin(a)*r,Math.cos(a)*r,-.84);hardware.add(bolt);}
      BoatVisual.batch(hardware);h.group.add(hardware);
    }
    for(const arch of [m.startGate,m.finishGate])arch.traverse(o=>{if(o.isMesh&&!o.material.map){const old=o.material;o.material=M('metal','#85958d',{emissive:old.emissive||'#000000',emissiveIntensity:.3});old.dispose();}});
  }
  function landmarks(m){
    const root=new THREE.Group();root.name='highland-landmarks';m.scene.add(root);
    const rng=U.makeRng(m.seed^0x67c019),ray=new THREE.Raycaster(),terrain=m.cliffs.children[0];m.cliffs.updateMatrixWorld(true);
    const rock=M('masonry','#a6a498'),wood=M('dock','#aba493'),metal=M('metal','#586665'),lamp=new THREE.MeshBasicMaterial({color:'#ffd598'});
    function anchor(s,side,off=30){const f=m.path.at(s),x=f.point.x-f.tangent.z*side*(f.half+off),z=f.point.z+f.tangent.x*side*(f.half+off);ray.set(new THREE.Vector3(x,400,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(terrain)[0];return new THREE.Vector3(x,hit?hit.point.y:20,z);}
    function box(g,w,h,d,x,y,z,mat){const geo=new THREE.BoxGeometry(w,h,d);BoatMaterials.uv(geo,3);const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);g.add(mesh);return mesh;}
    function tower(s,side,lighthouse){
      const g=new THREE.Group();g.name=lighthouse?'bay-lighthouse':'ruined-watchtower';g.position.copy(anchor(s,side,28));root.add(g);
      const h=lighthouse?24:16;
      // Foundation sinks into sampled cliff top. Open battlements make a ruin.
      box(g,13,5,13,0,-1,0,rock);
      const geo=new THREE.CylinderGeometry(lighthouse?3.6:5,lighthouse?5.4:6,h,12,1,!lighthouse);BoatMaterials.uv(geo,5);
      const body=new THREE.Mesh(geo,rock);body.position.y=h/2;g.add(body);
      if(lighthouse){
        const gallery=new THREE.Mesh(new THREE.CylinderGeometry(5.4,5.4,.7,16),metal);gallery.position.y=h;g.add(gallery);
        const light=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,3.2,12),lamp);light.position.y=h+2;g.add(light);
        for(let i=0;i<8;i++){const a=i*U.TAU/8;g.add(BoatVisual.rod([Math.sin(a)*2.6,h,Math.cos(a)*2.6],[Math.sin(a)*2.6,h+4,Math.cos(a)*2.6],.16,metal));}
        const roof=new THREE.Mesh(new THREE.ConeGeometry(4.5,3,12),metal);roof.position.y=h+5;g.add(roof);
      }else{
        for(let i=0;i<12;i++){const a=i*U.TAU/12,hh=rng.range(.4,3);box(g,2,hh,2,Math.cos(a)*5,h+hh/2,Math.sin(a)*5,rock);}
        for(let i=0;i<10;i++){const a=rng()*U.TAU,r=rng.range(7,13);box(g,2,rng.range(1,3),2,Math.sin(a)*r,0,Math.cos(a)*r,rock);}
      }
      BoatVisual.batch(g);return g;
    }
    const throat=m.path.features.find(f=>f.scale<1),bay=m.path.features.find(f=>f.scale>1);
    tower(throat?(throat.s0+throat.s1)/2:m.path.total*.3,1,false);
    tower(bay?(bay.s0+bay.s1)/2:m.path.total*.65,-1,true);
    for(const s of [15,m.path.total-35]){
      const g=new THREE.Group();g.name='timber-landing';g.position.copy(anchor(s,-1,9));g.rotation.y=Math.atan2(m.path.at(s).tangent.x,m.path.at(s).tangent.z);root.add(g);
      box(g,9,.6,25,0,0,0,wood);
      for(const x of [-4,4])for(const z of [-11,0,11]){
        box(g,.55,7,.55,x,-1.7,z,wood);box(g,.85,.16,.85,x,1.83,z,metal);box(g,.4,.65,.4,x,2.25,z,lamp);
      }
      for(const x of [-4,4])g.add(BoatVisual.rod([x,1.35,-11],[x,1.35,11],.09,M('rope','#bcb398')));
      BoatVisual.batch(g);
    }
    // Clustered heather on existing tree sites, already safely above the shore.
    const trees=m.cliffs.children.find(o=>o.isInstancedMesh),count=trees?Math.min(trees.count,BoatMaterials.low()?90:250):0;
    if(count){const geo=new THREE.IcosahedronGeometry(1,0);geo.scale(2,.7,2);BoatMaterials.uv(geo,2);const plants=new THREE.InstancedMesh(geo,M('heather','#a19686'),count),matrix=new THREE.Matrix4();for(let i=0;i<count;i++){trees.getMatrixAt(i,matrix);plants.setMatrixAt(i,matrix);}plants.name='coastal-heather';root.add(plants);}
    return root;
  }
  function environment(scene, cond){
    const c=document.createElement('canvas');c.width=BoatMaterials.low()?256:512;c.height=c.width/2;
    const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,0,c.height),night=cond.time==='night';
    g.addColorStop(0,night?'#294152':'#95aeb3');g.addColorStop(.42,night?'#637b89':'#e6e3d2');g.addColorStop(.51,night?'#1c343c':'#466866');g.addColorStop(1,'#102a31');ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;scene.environment=texture;
    return texture;
  }
  function sky(scene, group){
    // Replace polygonal cloud blobs with a softly layered cloud field on the
    // existing dome. No new full-screen render target or post-processing pass.
    for(const o of group.children)if(o.material?.transparent&&o.material?.isMeshLambertMaterial&&!o.material.fog)o.visible=false;
    const dome=scene.children.find(o=>o.renderOrder===-1000);if(!dome)return;
    dome.material.fragmentShader=dome.material.fragmentShader.replace('    void main()',`
      float bn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        vec4 h=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
        return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);}
      void main()`);
    dome.material.fragmentShader=dome.material.fragmentShader.replace('      gl_FragColor =',`
      vec2 cp=d.xz/max(.18,d.y+.15)*2.4;
      float cloud=bn(cp)*.55+bn(cp*2.03)*.28+bn(cp*4.1)*.12+bn(cp*8.2)*.05;
      float veil=smoothstep(.4,.72,cloud)*smoothstep(.01,.3,d.y);
      col=mix(col,mix(uHorizon,uMiddle,.3)*.83,veil*.72);
      gl_FragColor =`);
    dome.material.needsUpdate=true;
  }
  function atmosphere(cond){
    const night=cond.time==='night',dawn=cond.time==='dawn',dusk=cond.time==='dusk',storm=cond.time==='squall'||cond.sea==='storm';
    const fog=night?'#233b48':dawn?'#b6b4a5':dusk?'#aaa49c':storm?'#849d9e':'#acbfc0';
    Sky.setPreset({...Conditions.resolve(cond).time.sky,zenith:night?'#081b2b':storm?'#294950':'#426978',middle:night?'#183543':'#829e9f',horizon:fog,fog,cloud:night?'#34505a':storm?'#9caaaa':'#d8d4c4',cloudEmissive:'#647c7c',cloudIntensity:.18,peakGrass:'#4d6651',nearGrass:'#4c6250',nearRock:'#657775',peakRock:'#687c7d'});
    Water.setPalette({sunDir:Sky.SUN_DIR,deep:night?'#061a23':'#0b343b',shallow:night?'#17404a':'#2a6669',crest:night?'#65928d':'#a6c7b6',sky:night?'#344e60':fog});return fog;
  }
  return {cliffs,surface,equipment,landmarks,atmosphere,sky,environment};
})();
