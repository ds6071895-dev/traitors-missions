/* Application-owned, bounded atlas cache: 16 cells × 2 quality tiers. Scene
   materials borrow textures and unsubscribe from delayed loads on disposal. */
const BoatMaterials = (() => {
  const tiles={paint:0,timber:1,leather:2,rubber:3,metal:4,rock:5,moss:6,pine:7,dock:8,heather:9,wet:10,masonry:11,foam:12,spray:13,water:14,rope:15};
  const cache=new Map();
  const preference=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
  const low=()=>GameState.settings.quality==='low';
  const reduced=()=>!!GameState.settings.reducedMotion||!!preference?.matches;
  let source;
  function atlas(){return source||(source=new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>resolve(null);im.src='assets/boat/highland-atlas.png';}));}
  function load(id){
    if(!Object.hasOwn(tiles,id))id='paint';
    const small=low(),key=id+(small?':low':':full');if(cache.has(key))return cache.get(key);
    const e={status:'loading',texture:null};cache.set(key,e);
    e.ready=atlas().then(im=>{
      if(!im){e.status='error';return e;}
      const canvas=document.createElement('canvas');canvas.width=canvas.height=small?128:256;
      const c=canvas.getContext('2d'),w=im.width/4,h=im.height/4,i=tiles[id];
      c.drawImage(im,(i%4)*w+2,Math.floor(i/4)*h+2,w-4,h-4,0,0,canvas.width,canvas.height);
      const mask=id==='foam'||id==='spray';
      if(mask){const data=c.getImageData(0,0,canvas.width,canvas.height);for(let p=0;p<data.data.length;p+=4){const x=(p/4)%canvas.width,y=Math.floor(p/4/canvas.width),edge=Math.min(x,y,canvas.width-1-x,canvas.height-1-y)/(canvas.width*.16);const a=data.data[p+1]*Math.min(1,edge);data.data[p]=data.data[p+1]=data.data[p+2]=255;data.data[p+3]=a;}c.putImageData(data,0,0);}
      const t=new THREE.CanvasTexture(canvas);t.colorSpace=mask?THREE.NoColorSpace:THREE.SRGBColorSpace;
      t.wrapS=t.wrapT=mask?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping;t.anisotropy=small?2:4;t.userData.boatShared=true;
      e.texture=t;e.status='ready';return e;
    });return e;
  }
  function bind(mat,id,slot='map'){
    const e=load(id);let live=true;mat.addEventListener('dispose',()=>{live=false;});
    const apply=()=>{if(live&&e.texture){mat[slot]=e.texture;mat.needsUpdate=true;}};
    if(e.status==='loading')e.ready.then(apply);else apply();return mat;
  }
  function material(id,color='#ffffff',opts={}){
    const roughness={paint:.26,timber:.7,leather:.74,rubber:.95,metal:.38,wet:.36};
    const tri=['rock','wet','moss'].includes(id);
    const mat=new THREE.MeshStandardMaterial({color,envMapIntensity:.4,roughness:roughness[id]??.9,metalness:id==='metal'?.65:.02,...opts});
    // Neutral relief preserves competitor paint identity; wood/rock keep their hue.
    const neutral=['paint','metal','leather','rubber'].includes(id);
    mat.onBeforeCompile=s=>{
      if(tri){s.vertexShader='varying vec3 vBoatWorld;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvBoatWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');s.fragmentShader='varying vec3 vBoatWorld;\n'+s.fragmentShader;}
      s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      ${tri ? `vec3 weights=pow(abs(normalize(cross(dFdx(vBoatWorld),dFdy(vBoatWorld)))),vec3(4.0));weights/=max(dot(weights,vec3(1.0)),.001);
      vec3 grain=texture2D(map,vBoatWorld.yz/8.0).rgb*weights.x+texture2D(map,vBoatWorld.xz/8.0).rgb*weights.y+texture2D(map,vBoatWorld.xy/8.0).rgb*weights.z;` : 'vec3 grain=texture2D(map,vMapUv).rgb;'}
      diffuseColor.rgb *= ${neutral?'(.82 + .25 * dot(grain,vec3(.299,.587,.114)))':'(.38 + 1.2 * grain)'};
      #endif`);};
    mat.customProgramCacheKey=()=>`boat-material:${id}`;
    return bind(mat,id);
  }
  function followWater(mat,lift=.12){
    const before=mat.onBeforeCompile,key=mat.customProgramCacheKey();
    mat.onBeforeCompile=shader=>{
      before.call(mat,shader);
      for(const k of ['uWaveTime','uWaveDir','uWaveParam'])shader.uniforms[k]=Water.uniforms[k];
      shader.vertexShader=Water.surfaceShader+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
        vec4 waterWorld=modelMatrix*instanceMatrix*vec4(transformed,1.0);
        vec2 inversePoint=waterWorld.xz;float crest;vec3 normalAtWater;
        for(int i=0;i<3;i++){vec3 delta=gerstner(inversePoint,crest,normalAtWater);inversePoint=waterWorld.xz-delta.xz;}
        waterWorld.y=gerstner(inversePoint,crest,normalAtWater).y+${lift.toFixed(3)};
        vec4 mvPosition=viewMatrix*waterWorld;
        gl_Position=projectionMatrix*mvPosition;`);
    };
    mat.customProgramCacheKey=()=>key+':wave-following';return mat;
  }
  function uv(g,scale=1){
    const p=g.attributes.position,n=g.attributes.normal,a=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){const top=n&&Math.abs(n.getY(i))>.65;const side=n&&Math.abs(n.getX(i))>Math.abs(n.getZ(i));a[i*2]=(top?p.getX(i):side?p.getZ(i):p.getX(i))/scale;a[i*2+1]=(top?p.getZ(i):p.getY(i))/scale;}
    g.setAttribute('uv',new THREE.BufferAttribute(a,2));return g;
  }
  function smooth(g){
    g.computeVertexNormals();const p=g.attributes.position,n=g.attributes.normal,sums=new Map(),keys=[];
    for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*10000)).join(',');keys.push(key);const a=sums.get(key)||[0,0,0];a[0]+=n.getX(i);a[1]+=n.getY(i);a[2]+=n.getZ(i);sums.set(key,a);}
    for(let i=0;i<p.count;i++){const a=sums.get(keys[i]),l=Math.hypot(...a)||1;n.setXYZ(i,a[0]/l,a[1]/l,a[2]/l);}n.needsUpdate=true;return g;
  }
  const preload=()=>Promise.all(Object.keys(tiles).map(k=>load(k).ready));
  return {tiles,cache,load,bind,material,followWater,uv,smooth,preload,low,reduced};
})();
