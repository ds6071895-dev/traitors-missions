/* Visual rigs only: no mission RNG, hit volumes, target IDs or motion paths. */
const ShootoutModels = (() => {
  const M = () => ShootoutMaterials;
  const vec = (x,y,z) => new THREE.Vector3(x,y,z);
  function mesh(parent, geo, mat, x=0,y=0,z=0) {
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;
  }
  function oval(parent,mat,x,y,z,sx,sy,sz) {
    const m=mesh(parent,new THREE.SphereGeometry(1,10,7),mat,x,y,z);m.scale.set(sx,sy,sz);return m;
  }
  function rod(parent,mat,a,b,r0,r1) {return mesh(parent,ShootoutForest.limb(vec(...a),vec(...b),r0,r1,6),mat);}
  function featherGeo(width,length) {
    const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-width, length*.2,-width*.5,length*.85,0,length);
    shape.bezierCurveTo(width*.45,length*.82,width,length*.2,0,0);
    const g=new THREE.ShapeGeometry(shape,4);g.rotateX(Math.PI/2);
    const p=g.attributes.position,uv=[];for(let i=0;i<p.count;i++)uv.push(.5+p.getX(i)/(width*2),p.getZ(i)/length);
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return g;
  }
  // Merge static siblings by material while keeping the rig's named pivots.
  function batch(group) {
    for(const c of [...group.children])if(c.isGroup||c.type==='Object3D')batch(c);
    const bins=new Map();
    for(const c of group.children){if(!c.isMesh||c.userData.keep)continue;
      if(!bins.has(c.material))bins.set(c.material,[]);bins.get(c.material).push(c);}
    bins.forEach((list,mat)=>{if(list.length<2)return;
      const geos=list.map(m=>{m.updateMatrix();return m.geometry.clone().applyMatrix4(m.matrix);});
      const combined=ShootoutForest.merge(geos);list.forEach(m=>{group.remove(m);m.geometry.dispose();});mesh(group,combined,mat);
    });return group;
  }
  function bird(o) {
    const g=new THREE.Group(),S=o.size,id=o.species;
    const body=M().material(id==='pheasant'?'pheasant':'feather',o.body),wing=M().material('flight',o.wing||o.body,{side:THREE.DoubleSide});
    const horn=M().material('leather',o.beak),eye=new THREE.MeshBasicMaterial({color:'#11120e'});
    const goose=id==='goose',pheasant=id==='pheasant',dove=id==='dove';
    oval(g,body,0,0,0,S,S*.82,S*1.55);
    if(goose)rod(g,body,[0,S*.15,-S],[0,S*.7,-S*2.1],S*.38,S*.27);
    const hz=-S*(goose?2.1:1.5),hy=S*(goose?.7:.42);
    oval(g,body,0,hy,hz,S*.5,S*.5,S*.56);
    const beak=mesh(g,new THREE.ConeGeometry(S*(goose?.19:.16),S*(dove?.4:.65),6),horn,0,hy-S*.04,hz-S*.64);beak.rotation.x=-Math.PI/2;
    for(const side of [-1,1])oval(g,eye,side*S*.43,hy+S*.1,hz-S*.24,S*.085,S*.085,S*.085);
    const tail=new THREE.Group();tail.position.set(0,0,S*1.05);g.add(tail);
    for(let i=-2;i<=2;i++){
      const f=mesh(tail,featherGeo(S*.22,S*(pheasant?3.5:dove?1.4:1.7)),wing,i*S*.14,0,0);f.rotation.y=i*.14;
    }
    const wings=[];
    for(const side of [1,-1]){
      const pivot=new THREE.Object3D();pivot.position.set(side*S*.5,S*.2,0);g.add(pivot);
      oval(pivot,wing,side*S*1.05,0,0,S*1.25,S*.16,S*.68);
      const fore=new THREE.Object3D();fore.position.set(side*S*1.7,0,0);pivot.add(fore);
      const feathers=M().low()?5:8;
      for(let i=0;i<feathers;i++){
        const t=i/(feathers-1),f=mesh(fore,featherGeo(S*.24,S*(1.45-t*.5)),wing,side*S*t*1.55,-S*.02,-S*.3+t*S*.3);f.rotation.y=side*(.25+t*.45);
      }
      if(!M().low())for(let i=0;i<6;i++)mesh(pivot,featherGeo(S*.23,S*.95),body,side*S*(.2+i*.25),S*.10,-S*.3);
      wings.push({pivot,side,fore,cosmeticWrist:true});
      rod(g,horn,[side*S*.32,-S*.5,S*.6],[side*S*.32,-S*.85,S*.9],S*.065,S*.04);
    }
    if(id==='messenger'){
      const paper=M().material('paper','#eee0b4');const scroll=mesh(g,new THREE.CylinderGeometry(S*.16,S*.16,S*.7,8),paper,0,-S*.76,0);scroll.rotation.z=Math.PI/2;
    }
    if(pheasant){const collar=mesh(g,new THREE.TorusGeometry(S*.40,S*.06,5,12),M().material('feather','#eee5ca'),0,hy,hz);collar.rotation.x=Math.PI/2;}
    g.userData.wings=wings;g.userData.tail=tail;return batch(g);
  }
  function mammal(o) {
    const g=new THREE.Group(),S=o.size,id=o.species;
    const fur=M().material('fur',o.body),dark=M().material('leather',o.legCol||'#332b24'),pale=M().material('fur',o.tailCol||'#c9b393');
    const fox=id==='fox',rabbit=id==='rabbit',boar=id==='boar',leg=S*(o.legLen||1.1);
    oval(g,fur,0,leg+S*.35,0,S*(boar?.85:fox?.57:.68),S*(boar?.72:rabbit?.78:.58),S*(rabbit?1.25:1.65));
    const neck=o.neck??1.1,hy=leg+S*(boar?.38:rabbit?.55:fox?.72:1.18),hz=-S*1.95;
    rod(g,fur,[0,leg+S*.35,-S*1.2],[0,hy,hz],S*(boar?.48:.32),S*.25);
    oval(g,fur,0,hy,hz,S*(boar?.47:.37),S*(rabbit?.44:.37),S*(fox?.56:.50));
    if(fox){
      const muzzle=mesh(g,new THREE.CylinderGeometry(S*.07,S*.26,S*.8,10),fur,0,hy-S*.1,hz-S*.61);muzzle.rotation.x=-Math.PI/2;
    }else oval(g,boar?dark:fur,0,hy-S*.12,hz-S*.48,S*.23,S*.20,S*.35);
    oval(g,dark,0,hy-S*.08,hz-S*(fox?1.03:.75),S*(fox?.10:.16),S*.085,S*.09);
    const eyes=new THREE.MeshStandardMaterial({color:'#100e0c',roughness:.12});
    for(const side of [-1,1]){
      oval(g,eyes,side*S*(boar?.42:.33),hy+S*.12,hz-S*.26,S*.060,S*.065,S*.06);
      if(fox||boar){
        const ear=mesh(g,new THREE.ConeGeometry(S*(fox?.23:.2),S*(fox?.65:.36),3),fur,side*S*.29,hy+S*(fox?.51:.36),hz+S*.13);ear.rotation.y=Math.PI;ear.rotation.z=-side*.15;
        const inside=mesh(g,new THREE.ConeGeometry(S*.12,S*(fox?.38:.2),3),pale,side*S*.29,hy+S*(fox?.52:.38),hz+S*.035);inside.rotation.y=Math.PI;inside.rotation.z=-side*.15;
      }else{
        const ear=oval(g,fur,side*S*.30,hy+S*(rabbit?.9:.35),hz+S*.12,S*(rabbit?.16:.15),S*(rabbit?.85:.33),S*.10);ear.rotation.z=side*.48;
        const inside=oval(g,pale,side*S*.31,hy+S*(rabbit?.94:.37),hz+.025*S,S*.08,S*(rabbit?.55:.20),S*.025);inside.rotation.z=side*.48;
      }
      if(boar){
        rod(g,pale,[side*S*.21,hy-S*.16,hz-S*.46],[side*S*.34,hy+S*.02,hz-S*.62],S*.075,S*.038);
        rod(g,pale,[side*S*.34,hy+S*.02,hz-S*.62],[side*S*.36,hy+S*.25,hz-S*.67],S*.038,S*.004);
      }
      if(o.antlers){
        rod(g,pale,[side*S*.23,hy+S*.3,hz],[side*S*.6,hy+S*1.25,hz+S*.4],S*.085,S*.025);
        for(let i=0;i<3;i++)rod(g,pale,[side*S*(.3+i*.1),hy+S*(.5+i*.22),hz+S*i*.12],[side*S*(.65+i*.1),hy+S*(.8+i*.22),hz-S*.15+S*i*.12],S*.05,S*.01);
      }
    }
    if(fox){
      oval(g,pale,0,leg+S*.05,-S*.8,S*.41,S*.28,S*.7);
      for(const side of [-1,1])oval(g,pale,side*S*.24,hy-S*.20,hz-S*.12,S*.19,S*.11,S*.31);
    } else if(id==='deer') oval(g,pale,0,hy-S*.37,hz+S*.12,S*.22,S*.5,S*.25);
    if(boar){
      const mane=new THREE.Group();g.add(mane);
      for(let i=0;i<9;i++){const bristle=mesh(mane,new THREE.ConeGeometry(S*.14,S*.35,5),dark,0,leg+S*.83,-S*.9+i*S*.22);bristle.rotation.x=-.35;}
    }
    const tail=new THREE.Group();tail.position.set(0,leg+S*.3,S*1.5);g.add(tail);
    if(fox){oval(tail,fur,0,-S*.1,S*.58,S*.32,S*.32,S*1.05);oval(tail,pale,0,-S*.17,S*1.42,S*.23,S*.24,S*.38);}
    else oval(tail,pale,0,0,S*.15,S*.2,S*.22,S*(rabbit?.23:.45));
    const legs=[];
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const pivot=new THREE.Object3D();pivot.position.set(sx*S*.55,leg,sz*S*.95);g.add(pivot);
      oval(pivot,fur,0,-leg*.22,0,S*(rabbit&&sz>0?.32:.14),leg*.38,S*.18);
      rod(pivot,dark,[0,-leg*.4,0],[0,-leg*.88,S*.06],S*.10,S*.07);
      oval(pivot,dark,0,-leg*.91,-S*.09,S*.12,S*.085,S*(rabbit?.34:.19));
      legs.push({pivot,phase:(sx*sz>0?0:Math.PI),cosmetic:true});
    }
    g.userData.legs=legs;g.userData.tail=tail;return batch(g);
  }
  function membrane(o,kind) {
    const g=new THREE.Group(),S=o.size;
    const fur=M().material('fur',o.body,{emissive:kind==='moth'?o.glow:'#000000',emissiveIntensity:.35}),wing=M().material('membrane',o.wing||o.body,{side:THREE.DoubleSide,transparent:kind==='wasp',opacity:kind==='wasp'?.65:1,emissive:kind==='moth'?o.glow:'#000000',emissiveIntensity:.25});
    oval(g,fur,0,0,0,S*.65,S*.8,S*1.2);
    const dark=M().material('leather','#282423');
    const wings=[];
    for(const side of [-1,1]){
      if(kind==='bat'){
        const ear=mesh(g,new THREE.ConeGeometry(S*.2,S*.8,6),fur,side*S*.35,S*.85,-S*.35);ear.rotation.z=side*.2;
        oval(g,dark,side*S*.25,S*.2,-S*.9,S*.09,S*.09,S*.08);
      }
      const pivot=new THREE.Object3D();g.add(pivot);
      if(kind==='bat'){
        const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(S*1.3,-S*.9);shape.lineTo(S*3.2,-S*.5);
        shape.quadraticCurveTo(S*2,S*.3,S*2.3,S*1);shape.quadraticCurveTo(S*1.3,S*.4,S*1.2,S*1.1);shape.lineTo(0,S*.6);
        const geo=new THREE.ShapeGeometry(shape,5);geo.rotateX(Math.PI/2);geo.scale(side,1,1);const p=geo.attributes.position,uv=[];for(let i=0;i<p.count;i++)uv.push(Math.abs(p.getX(i))/(S*3.2),(p.getZ(i)/S+1)/2.2);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));mesh(pivot,geo,wing);
        for(const end of [[3.2,-.5],[2.3,1],[1.2,1.1]])rod(pivot,dark,[0,0,0],[side*S*end[0],0,S*end[1]],S*.055,S*.018);
      } else {
        oval(pivot,wing,side*S*.95,0,-S*.25,S*(kind==='moth'?1.25:1),S*.035,S*(kind==='moth'?.9:.45));
        if(kind==='moth'){oval(pivot,wing,side*S*.65,0,S*.65,S*.8,S*.035,S*.7);oval(pivot,dark,side*S*1.15,S*.04,-S*.3,S*.25,S*.012,S*.3);}
        for(let i=0;i<3;i++)rod(g,dark,[side*S*.3,0,i*S*.4],[side*S*.8,-S*.6,i*S*.4],S*.035,S*.02);
        rod(g,dark,[side*S*.2,S*.2,-S*.6],[side*S*.45,S*.55,-S*1.5],S*.025,S*.012);
      }
      wings.push({pivot,side});
    }
    if(kind==='wasp')for(let i=0;i<3;i++)oval(g,i%2?dark:fur,0,0,S*(.6+i*.4),S*(.55-i*.09),S*(.55-i*.09),S*.27);
    g.userData.wings=wings;return batch(g);
  }
  function enrichProp(g,kind,o) {
    const S=o.size||1,metal=M().material('iron','#645c42',{metalness:.7,roughness:.4}),paper=M().material('paper','#eedcb0');
    const surfaces={lantern:['paper','timber'],clay:['rock','iron'],bottle:['bark',null,null],
      bell:['leather','timber','timber','timber','iron','iron'],scroll:['paper','leather']};
    g.children.forEach((m,i)=>{
      if(!m.isMesh||m.material.isMeshBasicMaterial)return;
      const surface=surfaces[kind]?surfaces[kind][i]:'iron';
      if(kind==='bottle'&&i>0){
        const old=m.material;m.material=new THREE.MeshStandardMaterial({color:o.body,roughness:.19,metalness:.08,transparent:true,opacity:.84});old.dispose();
      }else if(surface)M().dress(m.material,surface);
    });
    if(kind==='lantern'){
      for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(g,metal,[Math.cos(a)*S*.8,-S*.9,Math.sin(a)*S*.8],[Math.cos(a)*S,S*.9,Math.sin(a)*S],S*.025,S*.025);}
      for(const y of [-.88,.88]){const hoop=mesh(g,new THREE.TorusGeometry(S*.9,S*.035,5,16),metal,0,y*S,0);hoop.rotation.x=Math.PI/2;}
    } else if(kind==='bell'){
      const old=g.children[4];g.remove(old);old.geometry.dispose();old.material.dispose();
      const points=[[.18,.58],[.31,.5],[.34,.1],[.48,-.3],[.84,-.55],[.89,-.61],[.76,-.61],[.4,-.3],[.28,.1],[.24,.44]].map(p=>new THREE.Vector2(p[0]*S,p[1]*S));
      metal.color.set('#bfa15c');g.children[4].material.dispose();g.children[4].material=metal;
      mesh(g,new THREE.LatheGeometry(points,20),metal);rod(g,metal,[0,S*.2,0],[0,-S*.6,0],S*.065,S*.065);oval(g,metal,0,-S*.58,0,S*.16,S*.16,S*.16);
    } else if(kind==='bottle'){
      const label=mesh(g,new THREE.CylinderGeometry(S*.51,S*.54,S*.5,12,1,true),paper,0,-S*.1,0);
      label.rotation.y=.3;mesh(g,new THREE.CylinderGeometry(S*.19,S*.19,S*.16,10),metal,0,S*1.4,0);
    } else if(kind==='clay'){
      for(const r of [.5,.72]){const ring=mesh(g,new THREE.TorusGeometry(S*r,S*.025,4,20),metal,0,S*.18,0);ring.rotation.x=Math.PI/2;}
    } else if(kind==='scroll'){
      const sheet=mesh(g,new THREE.PlaneGeometry(S*1.3,S*.7),paper,0,-S*.4,-S*.26);sheet.material.side=THREE.DoubleSide;
      oval(g,M().material('leather','#ad3e2b'),0,-S*.2,-S*.54,S*.2,S*.2,S*.05);
    } else if(kind==='boon'){
      const filigree=new THREE.Group();g.add(filigree);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;oval(filigree,metal,Math.cos(a)*S,Math.sin(a)*S,0,S*.075,S*.075,S*.075);}
    }
    // Unused branch materials never reach a scene's disposer.
    if(!['lantern','bell','bottle','clay','boon'].includes(kind))metal.dispose();
    if(!['bottle','scroll'].includes(kind))paper.dispose();
    return g;
  }
  function owl(g,o) {
    const S=o.size,feather=M().material('feather',o.body,{side:THREE.DoubleSide}),pale=M().material('flight','#ddcfac',{side:THREE.DoubleSide}),flight=M().material('flight',o.wing,{side:THREE.DoubleSide});
    const originals=new Set();g.traverse(m=>{if(m.isMesh&&!m.material.isMeshBasicMaterial)originals.add(m.material);});originals.forEach(m=>M().dress(m,'feather'));
    for(const w of g.userData.wings){
      // Replace the square flight surfaces with overlapping rows; retain pivots.
      for(const parent of [w.pivot,w.fore])for(const c of [...parent.children])if(c.isMesh){parent.remove(c);c.geometry.dispose();}
      for(let row=0;row<2;row++)for(let i=0;i<(M().low()?7:12);i++){
        const t=i/(M().low()?6:11),f=mesh(row?w.fore:w.pivot,featherGeo(S*.38,S*(row?2.4:2.6)),flight,w.side*S*t*(row?3.5:2.4),S*(.12-row*.08),-S*.95);
        f.rotation.y=w.side*(row?.35+t*.45:t*.12);
      }
    }
    const detail=new THREE.Group();g.add(detail);g.userData.detail=detail;
    for(let row=0;row<3;row++)for(let i=0;i<10;i++){
      const a=i/10*6.28,f=mesh(detail,featherGeo(S*.2,S*.72),feather,Math.cos(a)*S*.85,S*(.6-row*.5),Math.sin(a)*S*.95);f.rotation.x=-Math.PI/2;f.rotation.y=-a;
    }
    // A rounded breast follows the original weak-point object and radius.
    const chest=g.userData.weak.chest.obj;
    chest.geometry.dispose();chest.geometry=new THREE.SphereGeometry(S*.62,20,14);
    const head=g.userData.head, face=new THREE.Group();head.add(face);
    head.children.forEach(m=>{
      if(m.isMesh && m.material.isMeshBasicMaterial && m.material.color.getHex()===0x120c04) m.position.z=-S*.94;
    });
    for(const side of [-1,1])for(let i=0;i<16;i++){
      const a=i/16*6.28,f=mesh(face,featherGeo(S*.045,S*.23),pale,side*S*.3+Math.cos(a)*S*.38,S*.06+Math.sin(a)*S*.38,-S*.70);f.rotation.x=-Math.PI/2;f.rotation.z=a+Math.PI/2;
    }
    const claws=g.userData.talons.children.filter(m=>m.geometry&&m.geometry.type==='ConeGeometry');
    g.userData.claws=claws.map(obj=>({obj,rest:obj.rotation.x}));
    // Do not merge the four weak-point objects: their local transforms are law.
    batch(detail);batch(face);
    for(const w of g.userData.wings){
      oval(w.pivot,feather,w.side*S*1.15,0,0,S*1.3,S*.16,S*1.05);
      oval(w.fore,feather,w.side*S*1.1,0,S*.1,S*1.2,S*.12,S*.72);
      batch(w.pivot);
      w.cosmeticWrist=true;
    }
    return g;
  }
  return {bird,mammal,membrane,enrichProp,owl,featherGeo,batch,oval,rod,mesh};
})();
