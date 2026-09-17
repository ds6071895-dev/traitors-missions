/* Same rig for the view bow and remote archers. Flex and release are cosmetic. */
const ShootoutBow = (() => {
  function build() {
    const g=new THREE.Group(),M=ShootoutMaterials,V=ShootoutModels;
    const wood=M.material('timber','#ad7943',{roughness:.54}),horn=M.material('leather','#443b2a'),leather=M.material('leather','#705035');
    const steel=M.material('iron','#c5c3b3',{metalness:.8,roughness:.3});
    const limbs=[],tips=[],nocks=[];
    for(const side of [-1,1]){
      const geo=new THREE.BufferGeometry(),pos=new Float32Array(17*4*3),uv=[],indices=[];
      for(let i=0;i<=16;i++)for(let j=0;j<4;j++){uv.push(j/3,i/8);if(i<16){const a=i*4+j,b=i*4+(j+1)%4;indices.push(a,b,a+4,b,b+4,a+4);}}
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);
      const limb=V.mesh(g,geo,wood);limb.frustumCulled=false;limbs.push({limb,side});
      const tip=new THREE.Vector3();tips.push(tip);
      const nock=V.mesh(g,new THREE.CylinderGeometry(.018,.038,.13,8),horn);nocks.push(nock);
    }
    V.oval(g,leather,0,0,-.025,.065,.18,.085);
    const wraps=[];
    for(let i=0;i<9;i++){
      const ring=new THREE.TorusGeometry(.069,.0065,4,12);ring.rotateX(Math.PI/2);ring.rotateZ(.12);ring.scale(1,1,1.25);ring.translate(0,-.145+i*.036,-.025);wraps.push(ring);
    }
    V.mesh(g,ShootoutForest.merge(wraps),leather);
    V.mesh(g,new THREE.BoxGeometry(.15,.026,.10),horn,.05,.025,-.05);
    const strings=[];
    for(let i=0;i<3;i++){
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(33*3),3));
      const string=new THREE.Line(geo,new THREE.LineBasicMaterial({color:i===1?'#e4d8b6':'#9f947b'}));string.frustumCulled=false;g.add(string);strings.push(string);
    }
    const arrow=new THREE.Group();g.add(arrow);
    const shaft=V.mesh(arrow,new THREE.CylinderGeometry(.013,.017,1.15,8),wood);shaft.rotation.x=Math.PI/2;
    const head=new THREE.BufferGeometry();head.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-.78,-.065,0,-.57,0,.018,-.59, .065,0,-.57,0,0,-.78,0,.018,-.59, -.065,0,-.57,0,0,-.78,0,-.018,-.59, 0,0,-.78,.065,0,-.57,0,-.018,-.59],3));head.computeVertexNormals();V.mesh(arrow,head,steel);
    const feather=M.material('flight','#efe1bd',{side:THREE.DoubleSide});
    for(let i=0;i<3;i++){
      const vane=new THREE.Group();vane.rotation.z=i*Math.PI*2/3;arrow.add(vane);
      const f=V.mesh(vane,V.featherGeo(.035,.23),feather,0,.025,.33);f.rotation.z=Math.PI/2;
    }
    V.mesh(arrow,new THREE.TorusGeometry(.019,.006,4,8),horn,0,0,.57);
    const parts={group:g,string:strings[0],strings,nocked:arrow,limbTips:tips,limbs,nocks};pose(parts,0);return parts;
  }
  function pose(parts,draw,vibration=0) {
    const c=U.clamp(draw||0,0,1),pull=c*.5;
    if (parts.lastFlex !== c) parts.limbs.forEach(({limb,side},index)=>{
      const p=limb.geometry.attributes.position;
      for(let i=0;i<=16;i++){
        const t=i/16,y=side*(.16+t*.78-c*t*t*.075),z=-.02-t*t*.35+c*t*t*.20;
        const width=.047*(1-t*.67),depth=.025*(1-t*.65);
        for(let j=0;j<4;j++)p.setXYZ(i*4+j,(j<2?-1:1)*width,y,z+(j===0||j===3?-1:1)*depth);
        if(i===16){parts.limbTips[index].set(0,y,z);parts.nocks[index].position.set(0,y,z);parts.nocks[index].rotation.x=side*(-.5+c*.2);}
      }
      p.needsUpdate=true;limb.geometry.computeVertexNormals();
    });
    parts.lastFlex = c;
    parts.strings.forEach((line,k)=>{
      const p=line.geometry.attributes.position,a=parts.limbTips[0],b=parts.limbTips[1];
      for(let i=0;i<33;i++){
        const t=i/32,half=t<.5?t*2:(t-.5)*2;
        p.setXYZ(i,Math.sin(i*2.4+k*2.094)*.002+Math.sin(t*Math.PI)*vibration,
          t<.5?U.lerp(a.y,0,half):U.lerp(0,b.y,half),
          (t<.5?U.lerp(a.z,pull,half):U.lerp(pull,b.z,half))+Math.cos(i*2.4+k*2.094)*.002);
      }p.needsUpdate=true;
    });
    // Nock at the string, point and fletching slide back as one object.
    parts.nocked.position.set(.045,.025,pull-.57);
    if(parts.drawHand)parts.drawHand.position.set(.10,-.08,pull);
  }
  function hands(parts) {
    const V=ShootoutModels,M=ShootoutMaterials,glove=M.material('leather','#775c3a'),cloth=M.material('fur','#45533f');
    function hand(draw) {
      const g=new THREE.Group();parts.group.add(g);
      V.oval(g,glove,0,-.055,0,.085,.14,.075);
      for(let i=0;i<4;i++){
        const finger=V.oval(g,glove,-.055,-.135+i*.057,-.065,.057,.024,.06);finger.rotation.y=-.5;
      }
      V.oval(g,glove,.075,.01,-.015,.035,.08,.04);
      V.rod(g,cloth,[.01,-.16,.02],[draw?.36:.20,-.65,.55],.07,.14);
      V.rod(g,glove,[.01,-.16,.02],[.06,-.28,.13],.088,.10);
      V.batch(g);return g;
    }
    parts.gripHand=hand(false);parts.gripHand.position.set(.055,-.04,.045);
    parts.drawHand=hand(true);parts.drawHand.position.set(.10,-.08,0);
  }
  return {build,pose,hands};
})();
