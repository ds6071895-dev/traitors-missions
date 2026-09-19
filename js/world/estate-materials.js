/* Texture cache owns textures; scene-owned materials only borrow them. */
const EstateMaterials = (() => {
  const families={bark:['#685748',2,.98],foliage:['#435841',3,1],masonry:['#918a7c',3,.95],paving:['#858780',3,.96],slate:['#39434a',2,.8],
    gravel:['#8b8271',2,1],ground:['#535c39',7,1],heather:['#746746',5,1],rock:['#76776e',4,.98],
    timber:['#655141',2,.86],iron:['#292d2d',1,.72],paint:['#1e3029',2,.32],rubber:['#222626',1,1],upholstery:['#343c3a',1,.98]};
  const cache=new Map();
  function load(id,low=false){
    const key=id+(low?'-low':'');if(cache.has(key))return cache.get(key);
    const entry={status:'loading',textures:{},error:null};cache.set(key,entry);
    entry.ready=Promise.all(['color','bump'].map(kind=>new Promise(resolve=>{
      new THREE.TextureLoader().load('assets/estate/'+(id==='paint'?'paint-v2':id)+(low?'-256':'')+(kind==='color'?'':'-bump')+'.jpg',tex=>{
        tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=low?2:4;
        tex.colorSpace=kind==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
        tex.userData.estateShared=true;entry.textures[kind]=tex;resolve();
      },undefined,error=>{entry.error=error;resolve();});
    }))).then(()=>{entry.status=entry.error?'error':'ready';return {status:entry.status,error:entry.error};});
    return entry;
  }
  function material(id,opts={}){
    const f=families[id]||families.rock;
    const mat=new THREE.MeshStandardMaterial({color:f[0],roughness:f[2],metalness:id==='iron'||id==='paint'?.35:0,...opts});
    const e=load(id,GameState.data.settings.quality==='low');let live=true;
    mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness;\n#ifdef USE_ROUGHNESSMAP\n roughnessFactor *= .85 + .15 * texture2D(roughnessMap, vRoughnessMapUv).g;\n#endif');};
    mat.addEventListener('dispose',()=>{live=false;});
    const apply=()=>{if(!live)return;mat.map=e.textures.color||null;mat.bumpMap=e.textures.bump||null;
      mat.bumpScale=id==='masonry'?.065:id==='paving'?.035:.015;
      mat.roughnessMap=e.textures.bump||null;if(mat.map&&!opts.color)mat.color.set('#ffffff');mat.needsUpdate=true;};
    if(e.status!=='loading')apply();else e.ready.then(apply);
    return mat;
  }
  function uv(geometry,scale=3){
    const p=geometry.attributes.position,n=geometry.attributes.normal,u=[];
    for(let i=0;i<p.count;i++){
      const x=Math.abs(n.getX(i)),y=Math.abs(n.getY(i)),z=Math.abs(n.getZ(i));
      if(y>=x&&y>=z)u.push(p.getX(i)/scale,p.getZ(i)/scale);
      else if(x>z)u.push(p.getZ(i)/scale,p.getY(i)/scale);
      else u.push(p.getX(i)/scale,p.getY(i)/scale);
    }geometry.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));return geometry;
  }
  // Add surface detail to existing rigs without changing their chosen colours.
  function fabric(figure){
    if(!figure||!figure.userData.mats)return;
    // a figure wearing the character atlas keeps its own weave, unless
    // the atlas turns out not to be there
    const own=figure.userData.figureTextured&&typeof FigureMaterials!=='undefined'
      ?FigureMaterials.settled:Promise.resolve(false);
    const m=figure.userData.mats,entry=load('upholstery',GameState.data.settings.quality==='low');
    for(const key of ['coat','trim','glove','accent']){
      const material=m[key];if(!material)continue;let live=true;
      material.addEventListener('dispose',()=>live=false);
      Promise.all([entry.ready,own]).then(([,atlas])=>{
        if(!live||atlas)return;
        material.map=entry.textures.color;material.bumpMap=entry.textures.bump;material.bumpScale=.003;
        material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\n diffuseColor.rgb *= .85 + .4 * texture2D(map, vMapUv).g;\n#endif');};
        material.customProgramCacheKey=()=>'estate-fabric';
        material.needsUpdate=true;
      });
    }
  }
  function figureLOD(figure,camera){
    if(!figure||!figure.userData.rig)return;
    const pos=figure.getWorldPosition(new THREE.Vector3()),far=pos.distanceTo(camera.position)>(GameState.data.settings.quality==='low'?5:14);
    figure.userData.rig.head.traverse(o=>{
      if(!o.isMesh||!o.geometry)return;
      if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();
      if(o.geometry.boundingSphere.radius<.09&&!o.userData.keepLOD)o.visible=!far;
    });
  }
  function dress(root,classify){
    const replaced=new Set();
    root.traverse(object=>{
      if(!object.isMesh||!object.geometry||!object.material)return;
      const id=classify(object);if(!id)return;
      uv(object.geometry,families[id][1]);
      const clone=(old,index)=>{
        if(old.isShaderMaterial||old.map)return old;
        const surface=object.name==='cliffs'&&index===1?'ground':id;
        const m=old.clone(),hook=old.onBeforeCompile,entry=load(surface,GameState.data.settings.quality==='low');
        const key=old.customProgramCacheKey();m.customProgramCacheKey=()=>surface+':estate:'+key;replaced.add(old);
        let live=true;m.addEventListener('dispose',()=>live=false);
        m.onBeforeCompile=shader=>{if(hook)hook.call(m,shader);shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\n diffuseColor.rgb *= .55 + .9 * texture2D(map, vMapUv).rgb;\n#endif');};
        entry.ready.then(()=>{if(!live)return;m.map=entry.textures.color;m.bumpMap=entry.textures.bump;m.bumpScale=.035;m.needsUpdate=true;});
        return m;
      };
      object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material,0);
    });
    root.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])replaced.delete(m);});
    replaced.forEach(m=>m.dispose());
  }
  function merge(geometries) {
    const parts=geometries.map(g=>g.index?g.toNonIndexed():g);
    const result=new THREE.BufferGeometry();
    for(const key of ['position','normal','uv']){
      const size=key==='uv'?2:3,total=parts.reduce((n,g)=>n+g.attributes.position.count,0),values=new Float32Array(total*size);
      let at=0;for(const g of parts){const attr=g.attributes[key];if(attr)values.set(attr.array,at);at+=g.attributes.position.count*size;}
      result.setAttribute(key,new THREE.BufferAttribute(values,size));
    }
    parts.forEach((g,i)=>{if(g!==geometries[i])g.dispose();});result.computeBoundingSphere();return result;
  }
  const preload=()=>Promise.all(Object.keys(families).map(id=>load(id,GameState.data.settings.quality==='low').ready));
  return {material,uv,merge,fabric,figureLOD,dress,preload,families,cache};
})();
