/* Opt-in presentation. Reuses the original placement matrices, so the forest's
   random stream, walking surface and arrow colliders are exactly unchanged. */
const ShootoutForest = (() => {
  const M = () => ShootoutMaterials;
  function merge(parts) {
    const g = EstateMaterials.merge(parts); parts.forEach(p=>p.dispose()); return g;
  }
  function limb(a, b, r0, r1, segments = 7) {
    const direction = new THREE.Vector3().subVectors(b,a);
    const g = new THREE.CylinderGeometry(r1,r0,direction.length(),segments);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2); return g;
  }
  const v = (x,y,z) => new THREE.Vector3(x,y,z);
  function tree(kind, seed, simple) {
    const rng = U.makeRng(seed), wood=[], leaves=[];
    const pine = kind==='pine', dead=kind==='dead';
    const h=pine?18:dead?11.5:12, bend=rng.range(-.55,.55);
    const nodes=[v(0,0,0),v(bend,3.5,.1),v(-bend,7,-.2),v(bend*.6,h,0)];
    for(let i=0;i<3;i++)wood.push(limb(nodes[i],nodes[i+1],.7-i*.2,.48-i*.2,simple?5:7));
    if(!simple)for(let i=0;i<5;i++){
      const a=i*1.256+rng();wood.push(limb(v(0,.7,0),v(Math.cos(a)*1.8,.06,Math.sin(a)*1.8),.27,.06,5));
    }
    const n=dead?3:pine?(simple?9:20):(simple?8:15);
    for(let i=0;i<n;i++){
      const a=i*2.399+rng()*.3, y=dead?5+i*2:pine?4+i/n*12:7+i%3*1.9;
      const rad=dead?2.7:pine?(1-(y-3)/18)*3.8:2.5+rng()*1.5;
      const tip=v(Math.cos(a)*rad,y+(pine?-.3:1.1),Math.sin(a)*rad);
      if(!simple||dead||i%3===0)wood.push(limb(v(0,y,0),tip,.18,.035,simple?4:5));
      if(dead)continue;
      if(pine){
        // Flattened, serrated fans spread along each bough, not solid cones.
        for(let j=0;j<2;j++){
          const t=(j+1)/2,fan=new THREE.ConeGeometry(rad*(.65-t*.16),2.1*(1-y/24),simple?4:5,1);
          fan.scale(1,.65,1.15);fan.rotateY(a+j);
          fan.translate(tip.x*t,y+.28+(1-t)*.4,tip.z*t);leaves.push(fan);
        }
      }else{
        for(let j=0;j<(simple?2:4);j++){
          const leaf=new THREE.IcosahedronGeometry(1.1+rng()*.55,0);
          leaf.scale(1.25,.85,1);leaf.rotateY(rng()*6.28);
          leaf.translate(tip.x+rng.range(-1,1),tip.y+rng.range(.1,1.5),tip.z+rng.range(-1,1));leaves.push(leaf);
        }
      }
    }
    if(pine){
      const core=new THREE.ConeGeometry(1.7,12,7,1);core.translate(0,11,0);leaves.push(core);
    }
    const trunk=merge(wood);M().uv(trunk,2.5);
    const crown=leaves.length?merge(leaves):null;if(crown)M().uv(crown,3);
    return {trunk,crown};
  }
  function fern() {
    const parts=[];
    for(let j=0;j<7;j++)for(let k=0;k<7;k++)for(const side of [-1,1]){
      const a=j*Math.PI*2/7,t=(k+1)/8,r=t*1.4;
      const leaf=new THREE.PlaneGeometry(.16*(1-t*.6),.5*(1-t*.7));leaf.rotateX(-Math.PI/2);
      leaf.rotateY(side*.65);leaf.translate(side*.13,Math.sin(t*Math.PI*.8)*.85,r);leaf.rotateY(a);parts.push(leaf);
    }
    return merge(parts);
  }
  function instanced(geo,mat,matrices,name) {
    if(!matrices.length){geo.dispose();return null;}
    const mesh=new THREE.InstancedMesh(geo,mat,matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.name=name;return mesh;
  }
  function ground(root,heightAt,time,weather) {
    const mesh=root.getObjectByName('forest-ground'),g=mesh.geometry,p=g.attributes.position;
    const colors=[],normals=[],uv=[],c=new THREE.Color();
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i),n=ForestKit.fbm2(x*.09,z*.09,3,71);
      c.set('#829454').lerp(new THREE.Color('#8b7552'),U.smoothstep(18,3,Math.hypot(x,z))*.8)
        .lerp(new THREE.Color('#557641'),U.clamp(n+.2,0,.6));
      if(weather==='snow') c.lerp(new THREE.Color('#c4cdc1'),.65);
      if(weather==='rain') c.multiplyScalar(.88);
      // Match the strong daylight rig without flattening shaded detail.
      c.multiplyScalar(.82);colors.push(c.r,c.g,c.b);
      const normal=v(heightAt(x-.25,z)-heightAt(x+.25,z),.5,heightAt(x,z-.25)-heightAt(x,z+.25)).normalize();
      normals.push(normal.x,normal.y,normal.z);uv.push(x/3.5,z/3.5);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    // Dress once with a world-scale moving canopy pattern.
    mesh.material.dispose();mesh.material=M().dress(new THREE.MeshLambertMaterial({vertexColors:true}), 'ground',{dapple:time});
  }
  function stand(group, o) {
    const wood=M().material('timber','#a78d66'),iron=M().material('iron','#51554e',{metalness:.65,roughness:.58});
    const rope=M().material('leather','#b5a077'),endgrain=M().material('endgrain','#cbb189');
    // Replace the solid polygon with individually fitted boards at its exact top.
    const deck=group.children[0];group.remove(deck);Engine.disposeObject(deck);
    const boards=[];
    for(let i=-10;i<=10;i++){
      const x=i*.47,len=Math.sqrt(Math.max(0,25-x*x))*2;
      if(len<.4)continue;
      const plank=new THREE.BoxGeometry(.455,.32,len);plank.translate(x,o.standHeight+.19,0);M().uv(plank,2);boards.push(plank);
    }
    group.add(new THREE.Mesh(merge(boards),wood));
    const fittings=[],lashings=[],cuts=[];
    for(let i=0;i<10;i++){
      const a=i/10*Math.PI*2,x=Math.cos(a)*4.6,z=Math.sin(a)*4.6;
      for(let j=0;j<3;j++){
        const ring=new THREE.TorusGeometry(.275,.025,4,10);ring.rotateX(Math.PI/2);ring.translate(x,o.standHeight+.55+j*.065,z);lashings.push(ring);
      }
      const cap=new THREE.CylinderGeometry(.26,.26,.06,8);cap.translate(x,o.standHeight+1.09,z);cuts.push(cap);
      for(const dx of [-.1,.1]){
        const nail=new THREE.SphereGeometry(.035,5,3);nail.translate(x+dx,o.standHeight+.365,z);fittings.push(nail);
      }
    }
    group.add(new THREE.Mesh(merge(fittings),iron),new THREE.Mesh(merge(lashings),rope),new THREE.Mesh(merge(cuts),endgrain));
    const mats=new Map();
    group.traverse(obj=>{
      if(!obj.isMesh||obj.material===wood||obj.material===iron||obj.material===rope||obj.material===endgrain||obj.material.isMeshBasicMaterial)return;
      const old=obj.material;
      if(!mats.has(old)){const m=old.clone();M().dress(m,'timber');mats.set(old,m);}
      obj.material=mats.get(old);M().uv(obj.geometry,1.5);
    });
    mats.forEach((_,m)=>m.dispose());
    // Embers and curled translucent flames retain the existing animation hook.
    const fire=group.userData.fire;
    fire.userData.flames.forEach((fl,i)=>{
      fl.geometry.dispose();const shape=new THREE.Shape();shape.moveTo(-.24,0);
      shape.bezierCurveTo(-.8,.65,.25,.9,.12,1.9);shape.bezierCurveTo(.85,.8,.55,.1,-.24,0);
      fl.geometry=new THREE.ShapeGeometry(shape,8);fl.material.transparent=true;fl.material.opacity=.65;fl.material.side=THREE.DoubleSide;fl.material.depthWrite=false;
      fl.rotation.y=i*1.6;fl.position.y=.3;fl.scale.setScalar(.9+i*.12);
    });
    const embers=[];for(let i=0;i<20;i++){
      const pebble=new THREE.IcosahedronGeometry(.08,0);pebble.translate(Math.sin(i*4.3)*.65,.22,Math.cos(i*2.7)*.65);embers.push(pebble);
    }
    fire.add(new THREE.Mesh(merge(embers),new THREE.MeshBasicMaterial({color:'#ff7f26'})));
  }
  function apply(group,heightAt,uniforms,o) {
    const originalMaterials=new Set();group.traverse(obj=>{if(obj.material)originalMaterials.add(obj.material);});
    const rng=U.makeRng((o.visualSeed||42)^0x53a11), low=M().low();
    ground(group,heightAt,uniforms.time,o.precip);
    const source=group.children.filter(c=>c.isInstancedMesh&&c.name.startsWith('trees-'));
    for(const old of source){
      const kind=old.name.slice(6), bins=Array.from({length:4},()=>[]), matrix=new THREE.Matrix4();
      for(let i=0;i<old.count;i++){
        old.getMatrixAt(i,matrix);const p=v(0,0,0).setFromMatrixPosition(matrix);
        bins[Math.hypot(p.x,p.z)>(low?55:90)?3:i%3].push(matrix.clone());
      }
      bins.forEach((list,j)=>{
        if(!list.length)return;
        const model=tree(kind,Math.floor(rng()*1e8),low||j===3);
        const bark=M().dress(ForestKit.windMaterial(uniforms), 'bark');bark.vertexColors=false;bark.color.set('#765b3e');
        const trunk=instanced(model.trunk,bark,list,old.name+'-trunk-'+j);if(trunk)group.add(trunk);
        if(model.crown){const leaf=M().dress(ForestKit.windMaterial(uniforms), kind==='pine'?'pine':'foliage');leaf.vertexColors=false;leaf.color.set(kind==='pine'?'#4d7540':'#839b48');
          const crown=instanced(model.crown,leaf,list,old.name+'-crown-'+j);if(crown)group.add(crown);}
      });
      group.remove(old);old.geometry.dispose();
    }
    const fernMesh=group.getObjectByName('under-fern');
    if(fernMesh){fernMesh.geometry.dispose();fernMesh.geometry=fern();fernMesh.material= M().dress(ForestKit.windMaterial(uniforms,.1,2.4,.5),'foliage');fernMesh.material.vertexColors=false;fernMesh.material.side=THREE.DoubleSide;fernMesh.material.color.set('#4d703a');}
    const bushes=group.getObjectByName('under-bush');
    if(bushes){
      const crowns=[];
      for(let i=0;i<5;i++){
        const a=i*2.399,leaf=new THREE.SphereGeometry(.75,6,4);
        leaf.scale(1.2,.85,1);leaf.translate(Math.cos(a)*.9,.6+(i%3)*.25,Math.sin(a)*.8);crowns.push(leaf);
      }
      bushes.geometry.dispose();bushes.geometry=merge(crowns);
    }
    for(const name of ['under-bush','detail-rock','detail-log']){
      const obj=group.getObjectByName(name);if(!obj)continue;
      const oldMat=obj.material;obj.material=oldMat.clone();obj.material.onBeforeCompile=oldMat.onBeforeCompile;obj.material.customProgramCacheKey=oldMat.customProgramCacheKey;M().uv(obj.geometry,name==='detail-rock'?1:2);
      M().dress(obj.material,name==='detail-rock'?'rock':name==='detail-log'?'bark':'foliage');
      if(name==='under-bush'){obj.material.vertexColors=false;obj.material.color.set('#8b9e63');}
    }
    const logs=group.getObjectByName('detail-log');
    if(logs){
      const caps=[];for(const side of [-1,1]){const cap=new THREE.CircleGeometry(side>0?.36:.42,8);cap.rotateY(side*Math.PI/2);cap.translate(side*1.806,.36,0);caps.push(cap);}
      const matrices=[],matrix=new THREE.Matrix4();for(let i=0;i<logs.count;i++){logs.getMatrixAt(i,matrix);matrices.push(matrix.clone());}
      group.add(instanced(merge(caps),M().material('endgrain','#d8c6a0'),matrices,'fallen-log-ends'));
    }
    const grass=group.getObjectByName('detail-grass');
    if(grass){
      const blades=[];
      for(let i=0;i<6;i++){
        const h=.35+(i%3)*.13,a=i*2.399,shape=new THREE.Shape();
        shape.moveTo(-.025,0);shape.lineTo(-.02,h*.5);shape.lineTo(.14,h);shape.lineTo(.035,h*.5);shape.lineTo(.025,0);
        const blade=new THREE.ShapeGeometry(shape,3);blade.rotateY(a);blade.translate(Math.cos(a)*.08,0,Math.sin(a)*.08);blades.push(blade);
      }
      grass.geometry.dispose();grass.geometry=merge(blades);
      grass.material=M().dress(ForestKit.windMaterial(uniforms,.05,1,.35),'foliage');
      grass.material.vertexColors=false;grass.material.side=THREE.DoubleSide;grass.material.color.set('#9bad61');
    }
    if(low)for(const name of ['detail-grass','detail-flower','detail-mushroom','under-fern']){
      const obj=group.getObjectByName(name);if(obj)obj.count=Math.ceil(obj.count*.5);
    }
    // Tiny leaf litter is instanced and avoids the open centre of the stand.
    const leafGeo=new THREE.SphereGeometry(1,5,3);leafGeo.scale(.13,.013,.26);
    const leafMat=M().material('ground','#ab8645');
    const matrices=[],d=new THREE.Object3D();
    for(let i=0;i<(low?220:650);i++){
      const a=rng()*6.28,r=6+rng()*62;d.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
      d.position.y=heightAt(d.position.x,d.position.z)+.055;d.rotation.y=rng()*6.28;d.scale.setScalar(.7+rng());d.updateMatrix();matrices.push(d.matrix.clone());
    }
    group.add(instanced(leafGeo,leafMat,matrices,'leaf-litter'));
    const motes=group.children.find(c=>c.isPoints);
    if(motes&&o.precip==='rain'){
      const canvas=document.createElement('canvas');canvas.width=16;canvas.height=64;
      const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,64);
      gradient.addColorStop(0,'rgba(190,215,229,0)');gradient.addColorStop(.65,'rgba(190,215,229,.7)');gradient.addColorStop(1,'rgba(190,215,229,0)');
      ctx.fillStyle=gradient;ctx.fillRect(7,0,2,64);
      motes.material.map=new THREE.CanvasTexture(canvas);motes.material.size=.55;motes.material.opacity=.5;motes.material.needsUpdate=true;
    }else if(motes){motes.material.size=o.precip==='snow'?.3:.13;motes.material.opacity=o.precip==='snow'?.7:.48;}
    stand(group.children.find(c=>c.userData.fire),o);
    group.traverse(obj=>originalMaterials.delete(obj.material));
    originalMaterials.forEach(mat=>mat.dispose());
  }
  return {apply,limb,merge};
})();
