/* Textured fuel and stone; translucent tongues keep ballots and faces readable. */
const EstateFire = (() => {
  function build(opts={}){
    const fire=ForestKit.buildFire(opts);
    for(const child of fire.children){
      if(!child.isMesh)continue;
      const kind=child.geometry.type;
      if(kind==='CylinderGeometry'||kind==='TorusGeometry'){
        child.material.dispose();child.material=EstateMaterials.material(kind==='CylinderGeometry'?'timber':'rock',{color:kind==='CylinderGeometry'?'#4b3025':'#aaa49b'});
        EstateMaterials.uv(child.geometry,kind==='CylinderGeometry'?.7:2);
      }
    }
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=128;const c=canvas.getContext('2d');
    const gradient=c.createRadialGradient(32,98,2,32,76,52);gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.35,'rgba(255,255,255,.8)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=gradient;c.beginPath();c.moveTo(7,125);c.bezierCurveTo(2,75,34,53,34,0);c.bezierCurveTo(63,54,40,68,57,125);c.closePath();c.fill();
    const map=new THREE.CanvasTexture(canvas);
    fire.userData.flames.forEach((fl,i)=>{
      fl.geometry.dispose();fl.material.dispose();fl.geometry=new THREE.PlaneGeometry(.65-i*.06,1.45+i*.18);
      fl.material=new THREE.MeshBasicMaterial({map,color:i<2?'#ffd57b':'#ff7628',transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
      fl.rotation.y=i*Math.PI/4;fl.position.y=.85+i*.10;
    });
    const n=GameState.data.settings.quality==='low'?22:55,pos=new Float32Array(n*3);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const embers=new THREE.Points(g,new THREE.PointsMaterial({map,color:'#ff9c42',size:.045,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending}));
    embers.frustumCulled=false;fire.add(embers);fire.userData.estateEmbers=embers;
    return fire;
  }
  function update(fire,t){
    const embers=fire.userData.estateEmbers;if(!embers)return;
    const p=embers.geometry.attributes.position;
    for(let i=0;i<p.count;i++){const noise=Math.sin(i*127.1+3.7)*43758.5453,phase=(t*.25+noise-Math.floor(noise))%1,a=i*2.4,r=.35+phase*.3;p.setXYZ(i,Math.cos(a+phase)*r,.35+phase*phase*1.9,Math.sin(a)*r);}
    p.needsUpdate=true;embers.material.color.copy(fire.userData.light.color);
  }
  return {build,update};
})();
