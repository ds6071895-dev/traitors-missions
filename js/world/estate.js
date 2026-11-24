/* Close-range estate. All scene locations share the same authored geography. */
const Estate = (() => {
  const V=(x,y,z)=>new THREE.Vector3(x,y,z);
  function build(scene,opts={}) {
    const low=opts.lightweight||GameState.data.settings.quality==='low';
    const medium=GameState.data.settings.quality==='medium';
    const rng=U.makeRng(opts.seed||4242),origin=EstateLayout.anchors[opts.location||'welcome']||[0,22,0];
    const turn=opts.location==='fire'?Math.PI-Math.atan2(147,138):0,axisY=V(0,1,0);
    const toLocal=p=>p.applyAxisAngle(axisY,turn),toWorld=(x,z)=>V(x,0,z).applyAxisAngle(axisY,-turn).add(V(origin[0],0,origin[2]));
    const group=new THREE.Group();group.name='highland-estate';group.rotation.y=turn;group.position.copy(toLocal(V(-origin[0],0,-origin[2])));scene.add(group);
    const mats={}, batches=new Map(),lights=[],windows=[],gates=[];
    // a fixed hash of a place: the same stone, tree and hill every game
    const hash2=(x,z)=>{const h=Math.sin(x*127.1+z*311.7)*43758.5453;return h-Math.floor(h);};
    const mat=id=>mats[id]||(mats[id]=EstateMaterials.material(id));
    function mesh(g,id,x=0,y=0,z=0,ry=0,staticMesh=true){
      EstateMaterials.uv(g,EstateMaterials.families[id][1]);
      g.rotateY(ry);g.translate(x,y,z);
      if(staticMesh){if(!batches.has(id))batches.set(id,[]);batches.get(id).push(g.toNonIndexed());g.dispose();return;}
      const m=new THREE.Mesh(g,mat(id));group.add(m);return m;
    }
    const box=(id,w,h,d,x,y,z,ry=0)=>mesh(new THREE.BoxGeometry(w,h,d),id,x,y,z,ry);
    function roof(x,z,w,d,y,h){
      const shape=new THREE.Shape();shape.moveTo(-d/2,0);shape.lineTo(0,h);shape.lineTo(d/2,0);shape.closePath();
      const g=new THREE.ExtrudeGeometry(shape,{depth:w,bevelEnabled:false,steps:1});g.rotateY(Math.PI/2);g.translate(-w/2,0,0);mesh(g,'slate',x,y,z);
    }
    function wing(x,z,w,d,h){
      box('masonry',w,h,d,x,22+h/2,z);box('rock',w+.2,1.6,d+.2,x,22.8,z);roof(x,z,w+1,d+1,22+h,5);
      for(let floor=0;floor<Math.floor(h/3.7);floor++)for(let xx=x-w/2+2;xx<x+w/2-1;xx+=3.4){
        const yy=25.1+floor*3.5,zz=z+d/2+.03;
        box('iron',1.15,1.75,.12,xx,yy,zz);
        for(const side of [-1,1])box('masonry',.18,1.95,.35,xx+side*.66,yy,zz+.1);
        box('masonry',1.6,.2,.5,xx,yy-.94,zz+.1);box('masonry',1.5,.22,.35,xx,yy+.94,zz+.1);
        const pane=new THREE.Mesh(new THREE.PlaneGeometry(.82,1.4),new THREE.MeshBasicMaterial({color:'#d1b285'}));
        pane.position.set(xx,yy,zz+.08);group.add(pane);windows.push(pane);
        box('timber',.06,1.4,.07,xx,yy,zz+.15);box('timber',.9,.06,.07,xx,yy,zz+.15);
      }
      for(const side of [-1,1])box('masonry',1.2,3,1.3,x+side*w*.3,22+h+4,z);
    }
    // Asymmetrical tower and lower residential wings, seen from a playable forecourt.
    wing(-12,-43,15,16,27);wing(8,-42,24,13,13);wing(-20,-28,8,17,10);
    for(const x of [-19,-5])for(const z of [-50,-36]){
      mesh(new THREE.CylinderGeometry(1.5,1.7,5,8),'masonry',x,49,z);
      mesh(new THREE.ConeGeometry(2,5,8),'slate',x,54,z);
    }
    function arch(z){
      for(let i=0;i<13;i++){
        const a=i/13*Math.PI,b=(i+1)/13*Math.PI,shape=new THREE.Shape();
        shape.moveTo(Math.cos(a)*2.95,Math.sin(a)*2.95);
        shape.lineTo(Math.cos(b)*2.95,Math.sin(b)*2.95);
        shape.lineTo(Math.cos(b)*3.65,Math.sin(b)*3.65);
        shape.lineTo(Math.cos(a)*3.65,Math.sin(a)*3.65);shape.closePath();
        const g=new THREE.ExtrudeGeometry(shape,{depth:6,bevelEnabled:false,steps:1});
        mesh(g,'masonry',0,25.5,z-3);
      }
    }
    arch(-24);arch(38);
    // Recessed entrance: a real 6m gap through the gate block, no hidden wall.
    for(const x of [-6,6]){box('masonry',6,10,6,x,27,-24);roof(x,-24,6.7,7,32,5);}
    box('masonry',6,3,6,0,30.5,-24);
    for(const x of [-2.9,2.9])box('timber',.24,5.3,2.6,x,24.65,-23);
    /* The forecourt is where everybody stands at the start, at the ground's
       own height (22): the paving's top is laid at it, and the gravel just
       proud of the paving. It used to stand 9 cm (paving) and 14 cm (gravel)
       above, and the whole opening cast had their feet in the stone. */
    // the joints: a darker bed 1.5 cm under the flags, seen between them
    box('masonry',45,.2,55,0,21.885,3);
    /* The flags themselves, laid in courses, each stone its own shade of
       weathered sandstone — and where the cast gathers at the start, a
       ring of radial setts with a dark border and an eight-point star let
       into the middle, so the opening stands somewhere, not on a car park. */
    {
      const pos=[],col=[],c=new THREE.Color(),Y=22.0,G=.035;
      const shade=(x,z,k)=>{const h=hash2(x*1.7+k,z*2.3-k);const tones=['#9a9384','#8e877a','#a59e8e','#857f74','#b0a796','#938a7a'];
        c.set(tones[Math.floor(h*tones.length)]);c.multiplyScalar(.92+.16*hash2(z,x));return c;};
      const quad=(pts,cc)=>{for(const i of [0,1,2,0,2,3]){pos.push(pts[i][0],Y,pts[i][1]);col.push(cc.r,cc.g,cc.b);}};
      const CX=0,CZ=0,RING=6.2,BORDER=6.75;
      // the courses, clear of the circle
      for(let z=-24.4,row=0;z<30.4;row++){
        const d=row%3===1?.62:.88;
        for(let x=-22.4+hash2(row,1)*.6;x<22.4;){
          const w=.85+hash2(x,z)*.85,x1=Math.min(22.4,x+w),z1=Math.min(30.4,z+d);
          const mx=(x+x1)/2-CX,mz=(z+z1)/2-CZ;
          if(Math.hypot(mx,mz)>BORDER+.55)quad([[x+G,z+G],[x1-G,z+G],[x1-G,z1-G],[x+G,z1-G]],shade(x,z,0));
          x=x1;
        }
        z+=d;
      }
      // the ring of setts, and the border
      const arcQuad=(r0,r1,a0,a1,cc)=>quad([[CX+Math.cos(a0)*r0,CZ+Math.sin(a0)*r0],[CX+Math.cos(a0)*r1,CZ+Math.sin(a0)*r1],
                                           [CX+Math.cos(a1)*r1,CZ+Math.sin(a1)*r1],[CX+Math.cos(a1)*r0,CZ+Math.sin(a1)*r0]],cc);
      for(let r=1.4;r<RING-.01;r+=.62){
        const r1=Math.min(RING,r+.62),n=Math.max(8,Math.round(2*Math.PI*r/0.95));
        for(let k=0;k<n;k++){const a0=k/n*Math.PI*2+G/r,a1=(k+1)/n*Math.PI*2-G/r;arcQuad(r+G,r1-G,a0,a1,shade(r,k,3).multiplyScalar(1.04));}
      }
      for(let k=0;k<72;k++){const a0=k/72*Math.PI*2+.006,a1=(k+1)/72*Math.PI*2-.006;arcQuad(RING+G,BORDER-G,a0,a1,c.set(k%2?'#4f4b46':'#5c5751'));}
      // the star in the middle: eight points, dark and pale by turns
      for(let k=0;k<16;k++){
        const a=k/16*Math.PI*2,b=(k+1)/16*Math.PI*2,tipA=k%2?.62:1.36,tipB=k%2?1.36:.62;
        const cc=c.set(k%2?'#c8bfae':'#5a554f');
        for(const i of [0,1,2]){const pt=[[CX,CZ],[CX+Math.cos(a)*tipA,CZ+Math.sin(a)*tipA],[CX+Math.cos(b)*tipB,CZ+Math.sin(b)*tipB]][i];pos.push(pt[0],Y,pt[1]);col.push(cc.r,cc.g,cc.b);}
      }
      // the plain ring the star sits in
      const n0=24;for(let k=0;k<n0;k++)arcQuad(1.36+G,1.4-G+0.0001,k/n0*Math.PI*2,(k+1)/n0*Math.PI*2,c.set('#4f4b46'));
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
      // flat, facing up, whichever way each quad was wound
      const nrm=new Float32Array(pos.length);for(let i=1;i<nrm.length;i+=3)nrm[i]=1;g.setAttribute('normal',new THREE.BufferAttribute(nrm,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(Array.from({length:pos.length/3*2},(_,i)=>i%2?pos[(i>>1)*3+2]/2.5:pos[(i>>1)*3]/2.5),2));
      const flags=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93,side:THREE.DoubleSide}));
      flags.name='estate-forecourt';group.add(flags);
    }
    box('gravel',11,.12,17,10,21.944,-10);box('gravel',12,.12,17,14,21.944,20);
    box('masonry',1,1.3,55,-23,22.65,3);
    // The lantern path leaves through a gateway in the east wall, cut exactly
    // to its kerbs: piers either side and a threshold stone level with both.
    const gate=EstateLayout.footpath.gate,gap=EstateLayout.footpath.width/2+.45;
    for(const [from,to] of [[-24.5,gate.z-gap],[gate.z+gap,30.5]])box('masonry',1,1.3,to-from,gate.x,22.65,(from+to)/2);
    for(const side of [-1,1]){
      const z=gate.z+side*(gap+.5);
      box('masonry',1.3,2.3,1.1,gate.x,23.15,z);box('masonry',1.5,.18,1.3,gate.x,24.39,z);box('masonry',.9,.12,.9,gate.x,24.54,z);
    }
    box('masonry',1.4,.2,gap*2,gate.x,22,gate.z);
    for(const x of [-14,14])box('masonry',22,1.4,1,x,22.7,31);
    // Gatehouse and connected causeway: five metres clear between towers.
    for(const x of [-5.5,5.5]){
      box('masonry',5,10,7,x,27,38);roof(x,38,6,8,32,5);
      box('rock',5.2,1.4,7.2,x,22.7,38);
      const hinge=new THREE.Group();hinge.position.set(x<0?-3:3,22,38);
      const sign=x<0?1:-1;
      const panel=new THREE.Mesh(EstateMaterials.uv(new THREE.BoxGeometry(2.85,3.5,.18),2),mat('timber'));panel.position.set(sign*1.425,1.75,0);hinge.add(panel);
      for(const yy of [.5,2.7]){const strap=new THREE.Mesh(new THREE.BoxGeometry(2.8,.12,.22),mat('iron'));strap.position.set(sign*1.425,yy,0);hinge.add(strap);}
      hinge.rotation.y=-sign*Math.PI/2;hinge.userData.sign=sign;group.add(hinge);gates.push(hinge);
    }
    box('masonry',6,2,7,0,30,38);
    for(const x of [-3.15,3.15])box('masonry',.5,1.0,24,x,22.5,57);
    // Road ribbon uses precisely the samples that orient the vehicle.
    const rp=[],uv=[],ind=[];
    for(let i=0;i<EstateLayout.route.points.length;i++){
      const p=EstateLayout.route.points[i],s=EstateLayout.route.sample(p.distance),t=s.tangent;
      for(const side of [-1,1]){rp.push(p.x+t.z*side*2.4,p.y+.13,p.z-t.x*side*2.4);uv.push(side<0?0:1,p.distance/4.8);}
      if(i){const a=(i-1)*2;ind.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
    const road=new THREE.BufferGeometry();road.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));road.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));road.setIndex(ind);road.computeVertexNormals();
    const roadMesh=new THREE.Mesh(road,mat('gravel'));roadMesh.name='estate-road';group.add(roadMesh);
    // A masonry deck bridges the tributary, with parapets parallel to the road.
    const bs=EstateLayout.route.nearest(-20,220),bf=EstateLayout.route.sample(bs.along),ang=Math.atan2(bf.tangent.x,bf.tangent.z);
    box('masonry',6,.8,22,-20,13.7,220,ang);
    for(const sign of [-1,1])box('masonry',.45,1.15,22,-20+Math.cos(ang)*sign*2.9,14.65,220-Math.sin(ang)*sign*2.9,ang);
    for(const dz of [-7,7])box('rock',4,8,1.8,-20+Math.sin(ang)*dz,10,220+Math.cos(ang)*dz,ang);
    // Terrace, then the lantern walk down to it: flagstone steps set between
    // castle-stone kerbs, with a planted retaining wall on the uphill bend.
    const T=EstateLayout.terrace,TW=T.wall;
    mesh(new THREE.CylinderGeometry(TW.inner+.02,TW.inner+.35,.6,72),'paving',T.x,T.y-.25,T.z);
    const F=EstateLayout.footpath,half=F.width/2,rise=.16,flights=Math.round((F.grade(0)-F.grade(F.length))/rise);
    const pathTufts=[],pathLanterns=[];
    // Rows of [x,y,z,u,v]; each row runs along the path, columns across it.
    function sheet(id,rows){
      const pos=[],uvs=[];
      for(let i=1;i<rows.length;i++)for(let j=1;j<rows[i].length;j++){
        const a=rows[i-1][j-1],b=rows[i-1][j],c=rows[i][j-1],d=rows[i][j];
        for(const v of [a,c,b,b,c,d]){pos.push(v[0],v[1],v[2]);uvs.push(v[3],v[4]);}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();
      if(!batches.has(id))batches.set(id,[]);batches.get(id).push(g);
    }
    const across=(s,o,y)=>{const p=F.sample(s);return [p.x+p.tz*o,y,p.z-p.tx*o];};
    const spans=(from,to,step)=>{const out=[from];for(let s=from+step;s<to;s+=step)out.push(s);out.push(to);return out;};
    // Each tread sits where the smooth grade is half a riser above or below it,
    // so the walking grade never leaves the stone by more than 8cm.
    const breaks=[];
    for(let k=0;k<flights;k++){
      const target=F.grade(0)-(k+.5)*rise;let lo=F.level,hi=F.rim;
      for(let n=0;n<40;n++){const m=(lo+hi)/2;if(F.grade(m)>target)lo=m;else hi=m;}breaks.push((lo+hi)/2);
    }
    const start=F.nearest(gate.x+.6,gate.z).along,end=F.rim+.1,edge=half+.1;
    for(let k=0;k<=flights;k++){
      const from=k?breaks[k-1]:start,to=k<flights?breaks[k]:end,y=F.grade(0)-k*rise+.03;
      sheet('paving',spans(from,to,.5).map(s=>[-edge,edge].map(o=>[...across(s,o,y),o/2.5,s/2.5])));
      if(k<flights)sheet('masonry',[-edge,edge].map(o=>[y-rise,y].map(yy=>[...across(to,o,yy),o/1.5,yy/1.5])));
    }
    // Kerbs follow the smooth grade; on the uphill side one swells into a wall.
    const kerbFrom=F.nearest(gate.x+.66,gate.z).along,kerbTo=F.rim-.2,smooth=t=>{t=U.clamp(t,0,1);return t*t*(3-2*t);};
    const wallAt=s=>smooth((s-F.level-3)/2.5)*smooth((F.rim-1-s)/2.5),wallTop=(s,w)=>F.grade(s)+.18+.62*w;
    for(const side of [-1,1]){
      const wall=s=>side>0?wallAt(s):0;
      const rows=spans(kerbFrom,kerbTo,.4).map(s=>{
        const w=wall(s),g=F.grade(s),outer=half+.45+.3*w,top=wallTop(s,w)+.035*w*Math.sin(s*5.3)*Math.sin(s*2.1+side);
        return {s,g,w,inner:half*side,outer:outer*side,top};
      });
      // Top, path-facing and outer faces, wound so each faces outward.
      sheet('masonry',rows.map(r=>(side<0?[r.outer,r.inner]:[r.inner,r.outer]).map(o=>[...across(r.s,o,r.top),r.s/1.5,Math.abs(o)/1.5])));
      sheet('masonry',rows.map(r=>(side<0?[r.top,r.g-.15]:[r.g-.15,r.top]).map(y=>[...across(r.s,r.inner,y),r.s/1.5,y/1.5])));
      sheet('masonry',rows.map(r=>(side<0?[r.g-.45,r.top]:[r.top,r.g-.45]).map(y=>[...across(r.s,r.outer,y),r.s/1.5,y/1.5])));
      for(const [r,dir] of [[rows[0],-1],[rows[rows.length-1],1]]){
        const cols=dir>0?[r.g-.45,r.top]:[r.top,r.g-.45],ends=side<0?[r.outer,r.inner]:[r.inner,r.outer];
        sheet('masonry',ends.map(o=>cols.map(y=>[...across(r.s,o,y),o/1.5,y/1.5])));
      }
      // Heather crowns the wall; a softer fringe spills down the open side.
      for(const r of rows){
        if(r.w>.8&&rng()<.75)pathTufts.push(across(r.s,(half+.2+.15*r.w)*side+rng.range(-.12,.12),r.top+.04));
        if(side<0&&r.s>F.level-2&&rng()<.8){const p=across(r.s,-(half+.8+rng()*1.3),0);p[1]=EstateLayout.heightAt(p[0],p[2]);pathTufts.push(p);}
      }
    }
    for(let s=F.level+1,i=0;s<F.rim-2;s+=6.5,i++){
      const p=i%2?across(s,half+.62,wallTop(s,wallAt(s))):across(s,-(half+.95),0);
      if(!(i%2))p[1]=EstateLayout.heightAt(p[0],p[2]);pathLanterns.push(p);
    }
    // The terrace: a stone border, an inner ring round the hearth tied to it
    // by radial bands, and on the uphill arc a curved seat wall with coping.
    for(const [a,b] of [[T.radius-.55,TW.inner+.02],[4.3,4.75]]){const g=new THREE.RingGeometry(a,b,96,1);g.rotateX(-Math.PI/2);mesh(g,'masonry',T.x,T.y+.062,T.z);}
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2+Math.PI/8,r=(4.75+T.radius-.55)/2;box('masonry',.28,.02,T.radius-.55-4.75,T.x+Math.cos(a)*r,T.y+.06,T.z+Math.sin(a)*r,Math.PI/2-a);}
    const ring=(a,r,y,u,v)=>[T.x+Math.cos(a)*r,y,T.z+Math.sin(a)*r,u,v];
    function arc(id,from,to,rin,rout,y0,y1){
      const angles=spans(from,to,.02);
      sheet(id,angles.map(a=>[rin,rout].map(r=>ring(a,r,y1,a*r/1.5,r/1.5))));
      sheet(id,angles.map(a=>[y1,y0].map(y=>ring(a,rout,y,a*rout/1.5,y/1.5))));
      sheet(id,angles.map(a=>[y0,y1].map(y=>ring(a,rin,y,a*rin/1.5,y/1.5))));
      sheet(id,[rin,rout].map(r=>[y1,y0].map(y=>ring(from,r,y,r/1.5,y/1.5))));
      sheet(id,[rin,rout].map(r=>[y0,y1].map(y=>ring(to,r,y,r/1.5,y/1.5))));
    }
    const seat=T.y+TW.height;
    arc('masonry',TW.from,TW.to,TW.inner,TW.outer,T.y-.4,seat-.12);
    arc('paving',TW.from-.004,TW.to+.004,TW.inner-.08,TW.outer+.08,seat-.12,seat);
    for(const a of [TW.from-.05,TW.to+.05]){
      const r=(TW.inner+TW.outer)/2,x=T.x+Math.cos(a)*r,z=T.z+Math.sin(a)*r;
      box('masonry',1,1.5,1,x,T.y+.55,z,-a);box('paving',1.2,.14,1.2,x,T.y+1.37,z,-a);pathLanterns.push([x,T.y+1.44,z]);
    }
    for(const a of [.25,5.95]){pathLanterns.push([T.x+Math.cos(a)*11.75,T.y,T.z+Math.sin(a)*11.75]);}
    for(let a=TW.from+.03;a<TW.to-.03;a+=.035)if(rng()<.7){
      const r=TW.outer+.3+rng()*1.4,x=T.x+Math.cos(a)*r,z=T.z+Math.sin(a)*r;pathTufts.push([x,EstateLayout.heightAt(x,z),z]);
    }
    for(const x of [-16,18]){box('timber',3,.15,.6,x,22.55,4);for(const sx of [-1,1])box('iron',.14,.6,.5,x+sx*1.2,22.25,4);}
    function lantern(x,y,z){
      box('iron',.12,2,.12,x,y+1,z);box('iron',.5,.1,.5,x,y+2.4,z);
      const glow=new THREE.Mesh(new THREE.BoxGeometry(.28,.42,.28),new THREE.MeshBasicMaterial({color:'#ffd497'}));glow.position.set(x,y+2.12,z);group.add(glow);
      if(!low&&lights.length<(medium?3:5)){const l=new THREE.PointLight('#ffbd73',1.4,16,2);l.position.set(x,y+2.2,z);group.add(l);lights.push(l);}
    }
    for(const a of [[-4,22,42],[4,22,42],[-8,22,-19],[8,22,-19],...pathLanterns])lantern(...a);
    // Basin-shaped terrain with authored flat areas and graded shoulders.
    // One graded surface: adaptive grid lines stay shared at detail boundaries.
    // Overlapping coarse and fine patches exposed cliffs at the road shoulders.
    const axis=(from,to,nearA,nearB,middleA,middleB)=>{
      const out=[from];let v=from;
      while(v<to){const step=v>=nearA&&v<nearB?(low?2.5:1.5):v>=middleA&&v<middleB?(low?7:4):32;
        v=Math.min(to,v+step,...[nearA,nearB,middleA,middleB].filter(x=>x>v));out.push(v);}
      return out;
    };
    const xs=axis(-800,800,-35,90,-280,420),zs=axis(-500,1200,-65,75,-100,650);
    const positions=[],uvs=[],colors=[],indices=[],c=new THREE.Color();
    // The hill stands ~.7m proud of the paving right behind the seat wall, and
    // one grid cell interpolates that rise back under the stone. Every vertex
    // within a cell of the wall is held below the paving, and the wall hides it.
    const reach=(low?2.5:1.5)*.8;
    for(let j=0;j<zs.length;j++)for(let i=0;i<xs.length;i++){
      const x=xs[i],z=zs[j],tr=Math.hypot(x-T.x,z-T.z),pad=tr<12.4+reach*EstateLayout.terraceWall(Math.atan2(z-T.z,x-T.x));
      const bed=F.nearest(x,z,2.45).distance<2.45||pad?.38:.08,h=EstateLayout.heightAt(x,z);
      positions.push(x,(pad?Math.min(h,T.y):h)-bed,z);uvs.push(x/7,z/7);
      /* A lit summer glen: bright grass, with drifts of purple heather and
         golden gorse where two slow waves agree. */
      const heath=Math.sin(x*.031+z*.012)*Math.sin(z*.027-x*.009),gorse=Math.sin(x*.019-z*.024)*Math.cos(z*.015+x*.02);
      c.set(heath>.42?'#f2dcf6':gorse>.5?'#fff6c8':'#f4fbe6').multiplyScalar(.96+.08*Math.sin(x*.021)*Math.sin(z*.018));colors.push(c.r,c.g,c.b);
      if(i&&j){const n=j*xs.length+i;indices.push(n-xs.length-1,n-1,n-xs.length,n-xs.length,n-1,n);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
    const terrain=new THREE.Mesh(g,EstateMaterials.material('ground',{vertexColors:true}));terrain.name='estate-terrain';group.add(terrain);
    // Enclosed lake meshes, never a following ocean plane with exposed edges.
    const water=[];
    for(const l of EstateLayout.lakes){
      const shape=new THREE.Shape();for(let i=0;i<=96;i++){const a=i/96*Math.PI*2,rr=1+.025*Math.sin(a*7);const x=Math.cos(a)*l.rx*rr,z=Math.sin(a)*l.rz*rr;if(!i)shape.moveTo(x,z);else shape.lineTo(x,z);}
      const geo=new THREE.ShapeGeometry(shape,1);geo.rotateX(-Math.PI/2);
      const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#435f67',metalness:.35,roughness:.25,transparent:true,opacity:.91,side:THREE.DoubleSide}));m.position.set(l.x,l.y,l.z);group.add(m);water.push(m);
    }
    const streamShape=new THREE.Shape();for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,x=Math.cos(a)*39,z=Math.sin(a)*(4.5+.4*Math.sin(a*5));if(!i)streamShape.moveTo(x,z);else streamShape.lineTo(x,z);}
    const stream=new THREE.Mesh(new THREE.ShapeGeometry(streamShape),water[0].material);stream.rotation.x=-Math.PI/2;stream.position.set(-20,8,220);group.add(stream);
    // Spatially grouped instancing gives the forest broken edges and cheap distant silhouettes.
    const cells=new Map();
    const woods=[[-90,115],[-110,280],[125,355],[-150,430],[155,470],[-260,130],[310,450],[-380,320],[-120,-90],[110,-145]];
    for(let i=0;i<(low?1000:medium?2100:3600);i++){
      const center=woods[i%woods.length],a=rng()*Math.PI*2,rr=Math.sqrt(rng())*65;
      const x=center[0]+Math.cos(a)*rr,z=center[1]+Math.sin(a)*rr,r=EstateLayout.route.nearest(x,z);
      if(r.distance<8||EstateLayout.walkable(x,z)||F.nearest(x,z,6).distance<6||Math.abs(x)<40&&z<55||Math.hypot(x-48,z+8)<20||EstateLayout.lakes.some(l=>EstateLayout.basin(x,z,l)<1.14))continue;
      if(Math.sin(x*.016)*Math.cos(z*.018)<-.1)continue;
      const key=Math.floor(x/100)+':'+Math.floor(z/100);if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push([x,EstateLayout.heightAt(x,z),z,rng.range(5,14),rng.range(.7,1.4)]);
    }
    /* Two Highland trees, not one green cone. A Scots pine: a long bare
       trunk going red-brown towards the top, and dark flat crowns of
       needles held out at the top in two or three clumps. A spruce: a
       dark narrow spire in three tiers. */
    const trunkGeo=new THREE.CylinderGeometry(.12,.25,1,7),leafGeo=new THREE.ConeGeometry(1,1,8),dummy=new THREE.Object3D();
    const crownGeo=(()=>{const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position;
      for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=1+.18*Math.sin(x*5.1+z*3.7);p.setXYZ(i,x*k,y*.42*(y<0?.55:1),z*k);}
      g.computeVertexNormals();return g;})();
    // tints over the needle texture (already a dark green): a cooler spruce, a warmer pine; the bark map is pine bark already
    const leaves=EstateMaterials.material('foliage',{color:'#5e9a6a',roughness:1});
    const pineLeaves=EstateMaterials.material('foliage',{color:'#73a552',roughness:1});
    const pineBark=EstateMaterials.material('bark',{color:'#ffe2cc'});
    const wind={value:0},leafSurface=leaves.onBeforeCompile;leaves.onBeforeCompile=shader=>{leafSurface(shader);shader.uniforms.estateTime=wind;shader.vertexShader='uniform float estateTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += sin(estateTime * 1.5 + instanceMatrix[3].x * .14) * .018 * (position.y + .5);');};
    pineLeaves.onBeforeCompile=leaves.onBeforeCompile;
    for(const all of cells.values()){
      // which is which: the same every game, from where the tree stands
      const pines=all.filter(p=>hash2(p[0]*.37,p[2]*.37)<.58),firs=all.filter(p=>hash2(p[0]*.37,p[2]*.37)>=.58);
      if(firs.length){
        const trunks=new THREE.InstancedMesh(trunkGeo,mat('bark'),firs.length),canopies=new THREE.InstancedMesh(leafGeo,leaves,firs.length*3);
        firs.forEach((p,i)=>{
          dummy.rotation.set(0,0,0);
          dummy.position.set(p[0],p[1]+p[3]/2,p[2]);dummy.scale.set(p[4],p[3],p[4]);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
          for(let k=0;k<3;k++){dummy.position.y=p[1]+p[3]*(.42+k*.2);const w=p[3]*(.26-k*.06);dummy.scale.set(w,p[3]*(.5-k*.08),w);dummy.updateMatrix();canopies.setMatrixAt(i*3+k,dummy.matrix);}
        });trunks.computeBoundingSphere();canopies.computeBoundingSphere();group.add(trunks,canopies);
      }
      if(pines.length){
        const trunks=new THREE.InstancedMesh(trunkGeo,pineBark,pines.length),crowns=new THREE.InstancedMesh(crownGeo,pineLeaves,pines.length*3);
        pines.forEach((p,i)=>{
          const H=p[3]*1.25,lean=(hash2(p[0],p[2])-.5)*.12;
          dummy.rotation.set(lean,0,lean*.6);
          dummy.position.set(p[0],p[1]+H*.42,p[2]);dummy.scale.set(p[4]*.75,H*.84,p[4]*.75);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
          for(let k=0;k<3;k++){
            const a=hash2(p[0]+k,p[2]-k)*6.28,off=k?H*.11:0,w=H*(k?.16:.22);
            dummy.rotation.set(0,a,0);
            dummy.position.set(p[0]+Math.cos(a)*off+lean*H*.8,p[1]+H*(.86-k*.1),p[2]+Math.sin(a)*off+lean*H*.5);
            dummy.scale.set(w,w*.9,w*(.8+.3*hash2(k,p[0])));dummy.updateMatrix();crowns.setMatrixAt(i*3+k,dummy.matrix);
          }
        });trunks.computeBoundingSphere();crowns.computeBoundingSphere();group.add(trunks,crowns);
      }
    }
    // Fixed mountain shoulders; seed variation never shifts the estate geography.
    /* Highland bens, not cones: a ridged fractal over a falling profile
       gives knife-edge arêtes and gullies, one shoulder is scooped into a
       corrie, and the colour comes from height and steepness — grass and
       bracken at the foot, a band of purple heather, bare schist on the
       steep faces, scree above, and snow lying where the high ground is
       flat enough to hold it. The highest, facing the forecourt, has a
       waterfall down its gully. Fixed noise: every game sees the same hills. */
    const vnoise=(x,z)=>{const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
      const a=hash2(xi,zi),b=hash2(xi+1,zi),c=hash2(xi,zi+1),d=hash2(xi+1,zi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;};
    const ridged=(x,z)=>{let sum=0,amp=.55,f=1,w=1;for(let o=0;o<5;o++){let n=1-Math.abs(vnoise(x*f,z*f)*2-1);n*=n*w;w=Math.min(1,n*1.6);sum+=n*amp;amp*=.5;f*=2.03;}return sum;};
    const benMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
    const BENS=[[-510,100,195,210],[-520,450,230,285],[-280,780,250,320],[120,1000,280,360],[620,210,230,270],[740,700,230,335],[-330,-270,190,210],[160,-380,230,270]];
    const benAt=[];
    BENS.forEach(([bx,bz,radius,h],bi)=>{
      const RINGS=low?14:30,SEG=low?36:84;
      const toCourt=Math.atan2(-bz,-bx),corrie=toCourt+(bi%2?.9:-.9);
      const sumX=radius*.18*Math.cos(bi*1.7),sumZ=radius*.14*Math.sin(bi*2.3);
      const height=(u,a)=>{
        // a falling profile, with the summit off-centre
        const prof=Math.pow(Math.max(0,1-Math.pow(u,1.2)),1.75)*(1+.16*Math.cos(a*2+bi));
        const px=Math.cos(a)*u*radius,pz=Math.sin(a)*u*radius;
        const r=ridged(px/150+bi*7.3,pz/150-bi*3.1);
        let y=h*prof*(.62+.62*r);
        // the corrie: a bowl bitten out of one high shoulder, with a lip
        const da=Math.atan2(Math.sin(a-corrie),Math.cos(a-corrie));
        const bowl=Math.exp(-(da*da)/.18)*Math.exp(-Math.pow((u-.42)/.17,2));
        y-=h*.24*bowl;
        return Math.max(0,y);
      };
      const pos=[],col=[],ind=[],c=new THREE.Color();
      for(let ri=0;ri<=RINGS;ri++){
        const u=ri/RINGS;
        for(let si=0;si<SEG;si++){
          const a=si/SEG*Math.PI*2,y=height(u,a)+(ri===RINGS?-40:0),pull=1-u;
          pos.push(Math.cos(a)*u*radius+sumX*pull*pull,y,Math.sin(a)*u*radius+sumZ*pull*pull);
        }
      }
      for(let ri=0;ri<RINGS;ri++)for(let si=0;si<SEG;si++){
        const a=ri*SEG+si,b=ri*SEG+(si+1)%SEG,cI=(ri+1)*SEG+si,d=(ri+1)*SEG+(si+1)%SEG;
        ind.push(a,b,cI,b,d,cI);
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(ind);geo.computeVertexNormals();
      const nrm=geo.attributes.normal,snowLine=h>300?.5:h>260?.58:.7;
      for(let i=0;i<pos.length/3;i++){
        if(i>=RINGS*SEG){c.set('#5f8a47');col.push(c.r,c.g,c.b);continue;}   // the skirt, under the grass
        const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2],t=y/h,up=nrm.getY(i),nz=vnoise(x*.05,z*.05),fine=vnoise(x*.21+3,z*.21-5);
        if(t>snowLine+(nz-.5)*.12&&up>.5)c.set('#f3f6fa').lerp(new THREE.Color('#c9d3e0'),(1-up)*.8);
        else if(up<.62)c.set('#5f6266').lerp(new THREE.Color('#878a8c'),fine);              // bare schist
        else if(t>.52)c.set('#8c897e').lerp(new THREE.Color('#a29d8f'),fine);              // scree
        else if(t>.2+(nz-.5)*.12)c.set(nz>.5?'#6e4f72':'#7d6550').lerp(new THREE.Color('#5d6b48'),fine*.5); // heather, bracken
        else c.set('#5f8a47').lerp(new THREE.Color('#7a9a52'),fine);                       // grass at the foot
        c.multiplyScalar(.86+.18*up);col.push(c.r,c.g,c.b);
      }
      geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));EstateMaterials.uv(geo,8);
      // untextured: from the forecourt a tiled rock map is only noise, and it greyed the snow
      const mountain=new THREE.Mesh(geo,benMat);mountain.name='estate-ben';
      // its foot just under the lowest ground round it, so it rises out of the glen with no seam
      let foot=Infinity;for(let k=0;k<24;k++){const a=k/24*Math.PI*2;foot=Math.min(foot,EstateLayout.heightAt(bx+Math.cos(a)*radius*.97,bz+Math.sin(a)*radius*.97));}
      foot=Math.min(15,foot-1.5);mountain.position.set(bx,foot,bz);group.add(mountain);
      benAt.push({bx,bz,radius,h,height,toCourt,sumX,sumZ,foot});
    });
    // a waterfall down the gully of the tallest ben the forecourt can see
    {
      const b=benAt.reduce((m,x)=>x.h>m.h&&Math.hypot(x.bx,x.bz)<900?x:m,benAt[0]),pts=[],uvs=[],ix=[];
      const a=b.toCourt+.12,N=40;
      for(let k=0;k<=N;k++){
        const u=.22+.5*k/N,wob=.025*Math.sin(k*1.3),aa=a+wob,y=b.height(u,aa)+b.foot+1.2,pull=1-u,w=1.2+k*.11;
        const cx=b.bx+Math.cos(aa)*u*b.radius+b.sumX*pull*pull,cz=b.bz+Math.sin(aa)*u*b.radius+b.sumZ*pull*pull;
        const sx=-Math.sin(aa)*w,sz=Math.cos(aa)*w;
        pts.push(cx-sx,y,cz-sz,cx+sx,y,cz+sz);uvs.push(0,k/N,1,k/N);
        if(k)ix.push((k-1)*2,(k-1)*2+1,k*2,k*2,(k-1)*2+1,k*2+1);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(ix);g.computeVertexNormals();
      const fall=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:opts.night?'#6c7a92':opts.evening?'#d6dde8':'#eef6ff',transparent:true,opacity:.82,side:THREE.DoubleSide,depthWrite:false,fog:true}));
      fall.name='estate-waterfall';fall.renderOrder=2;group.add(fall);
    }
    /* A circle of standing stones on the brae above the forecourt, older
       than the castle; and a few lone pines on the margins, so the first
       shots of the night have something between the cast and the bens. */
    {
      const ring=[],SC=[-62,24],R=7.5,stoneGeo=(()=>{const g=new THREE.BoxGeometry(1,1,1,1,3,1),p=g.attributes.position;
        for(let i=0;i<p.count;i++){const y=p.getY(i)+.5,k=1-.32*y;p.setX(i,p.getX(i)*k);p.setZ(i,p.getZ(i)*(k+.08*Math.sin(y*4)));p.setY(i,y);}
        g.computeVertexNormals();return EstateMaterials.uv(g,1.2);})();
      for(let k=0;k<11;k++){
        if(k===7)continue;           // a gap where one fell
        const a=k/11*Math.PI*2+hash2(k,3)*.2,x=SC[0]+Math.cos(a)*R,z=SC[1]+Math.sin(a)*R,hh=1.8+hash2(k,9)*1.7;
        ring.push([x,EstateLayout.heightAt(x,z)-.25,z,hh,.6+hash2(k,5)*.35,a,(hash2(k,1)-.5)*.14]);
      }
      // the one that fell, lying in the grass, and the tall one at the head
      ring.push([SC[0]+Math.cos(7/11*Math.PI*2)*(R+1.2),EstateLayout.heightAt(SC[0]+Math.cos(7/11*Math.PI*2)*(R+1.2),SC[1]+Math.sin(7/11*Math.PI*2)*(R+1.2))+.15,
                 SC[1]+Math.sin(7/11*Math.PI*2)*(R+1.2),2.6,.7,0,1.5]);
      ring.push([SC[0],EstateLayout.heightAt(SC[0],SC[1])-.3,SC[1]+R+3.5,4.2,.9,0,.04]);
      const stones=new THREE.InstancedMesh(stoneGeo,mat('rock'),ring.length);
      ring.forEach((r,i)=>{dummy.position.set(r[0],r[1],r[2]);dummy.rotation.set(r[6],r[5]+Math.PI/2,r[6]>1?0:r[6]*.5);
        dummy.scale.set(r[4]*(r[6]>1?1.1:1),r[3],r[4]*.55);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);});
      stones.computeBoundingSphere();stones.name='estate-stone-circle';group.add(stones);
      const lone=[[-34,-12,13],[-39,22,11],[37,44,12],[-31,47,15],[44,-30,10],[-46,-34,14]]
        .filter(([x,z])=>!EstateLayout.walkable(x,z)&&EstateLayout.route.nearest(x,z).distance>6&&F.nearest(x,z,5).distance>=5);
      const lt=new THREE.InstancedMesh(trunkGeo,pineBark,lone.length),lc=new THREE.InstancedMesh(crownGeo,pineLeaves,lone.length*4);
      lone.forEach(([x,z,H],i)=>{
        const y=EstateLayout.heightAt(x,z);dummy.rotation.set(.05,0,-.04);
        dummy.position.set(x,y+H*.42,z);dummy.scale.set(.55,H*.86,.55);dummy.updateMatrix();lt.setMatrixAt(i,dummy.matrix);
        for(let k=0;k<4;k++){const a=k*1.9+i,off=k?H*.12:0,w=H*(k?.15:.2);dummy.rotation.set(0,a,0);
          dummy.position.set(x+Math.cos(a)*off,y+H*(.88-k*.09),z+Math.sin(a)*off);dummy.scale.set(w,w*.9,w*.85);dummy.updateMatrix();lc.setMatrixAt(i*4+k,dummy.matrix);}
      });lt.computeBoundingSphere();lc.computeBoundingSphere();group.add(lt,lc);
    }
    // Exposed schist outcrops and rough ridgelines interrupt the soft glen.
    const crags=[];
    for(let i=0;i<(low?35:90);i++){
      const x=rng.range(-280,380),z=rng.range(90,690);
      if(EstateLayout.route.nearest(x,z).distance<12||EstateLayout.lakes.some(l=>EstateLayout.basin(x,z,l)<1.18))continue;
      crags.push([x,EstateLayout.heightAt(x,z),z,rng.range(1.8,6)]);
    }
    const cg=EstateMaterials.uv(new THREE.IcosahedronGeometry(1,1),2),rocks=new THREE.InstancedMesh(cg,mat('rock'),crags.length);
    crags.forEach((p,i)=>{dummy.position.set(p[0],p[1]+p[3]*.2,p[2]);dummy.rotation.set(.1,rng()*6.28,.3);dummy.scale.set(p[3]*1.3,p[3]*.8,p[3]);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);});rocks.computeBoundingSphere();group.add(rocks);
    // Close grass/heather and reeds are silhouettes with textured surfaces.
    const cover=[];
    for(let i=0;i<(low?300:1200);i++){
      const x=rng.range(-65,125),z=rng.range(-65,120);
      if(EstateLayout.walkable(x,z)||F.nearest(x,z,3.4).distance<3.4||Math.hypot(x-T.x,z-T.z)<13.3||Math.abs(x)<30&&z<40||EstateLayout.route.nearest(x,z).distance<3.5||EstateLayout.lakes.some(l=>EstateLayout.basin(x,z,l)<1.02))continue;
      cover.push([x,EstateLayout.heightAt(x,z),z]);
    }
    cover.push(...pathTufts);
    const blades=[],bladeUV=[];
    for(let k=0;k<5;k++){const a=k*2.4,h=.32+k*.065,x=Math.cos(a)*.11,z=Math.sin(a)*.11;
      blades.push(x-.035,0,z,x+.035,0,z,x+Math.cos(a)*.14,h,z+Math.sin(a)*.14);bladeUV.push(0,0,.3,0,.15,1);}
    const grassGeo=new THREE.BufferGeometry();grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));grassGeo.setAttribute('uv',new THREE.Float32BufferAttribute(bladeUV,2));grassGeo.computeVertexNormals();
    mat('heather').side=THREE.DoubleSide;const grass=new THREE.InstancedMesh(grassGeo,mat('heather'),cover.length);
    cover.forEach((p,i)=>{dummy.position.set(p[0],p[1]-.06,p[2]);dummy.rotation.set(0,rng()*6.28,0);dummy.scale.setScalar(rng.range(.6,1.5));dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);});grass.computeBoundingSphere();group.add(grass);
    /* Wildflowers among the grass: heather, gorse, harebells and the odd
       white daisy, each a small bright head on the tuft it grew from. */
    {
      const FLOWERS=['#b35bc4','#c46fd6','#f2c230','#ffd84a','#6f8fe8','#ffffff','#e85b7a'];
      const heads=[];
      for(const p of cover){ if(rng()<.55) heads.push(p); }
      for(let i=0;i<(low?200:700);i++){
        const x=rng.range(-60,120),z=rng.range(-60,115);
        if(EstateLayout.walkable(x,z)||Math.hypot(x-T.x,z-T.z)<13.3||Math.abs(x)<30&&z<40||EstateLayout.route.nearest(x,z).distance<3||EstateLayout.lakes.some(l=>EstateLayout.basin(x,z,l)<1.02))continue;
        heads.push([x,EstateLayout.heightAt(x,z),z]);
      }
      const fg=new THREE.IcosahedronGeometry(.09,0);
      const fm=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.6,emissive:'#222222'});
      const flowers=new THREE.InstancedMesh(fg,fm,heads.length);
      const fc=new THREE.Color();
      heads.forEach((p,i)=>{
        dummy.position.set(p[0]+rng.range(-.3,.3),p[1]+rng.range(.18,.42),p[2]+rng.range(-.3,.3));
        dummy.rotation.set(0,0,0);dummy.scale.set(1,.6,1).multiplyScalar(rng.range(.8,1.6));dummy.updateMatrix();
        flowers.setMatrixAt(i,dummy.matrix);
        flowers.setColorAt(i,fc.set(FLOWERS[Math.floor(rng()*FLOWERS.length)]));
      });
      flowers.computeBoundingSphere();group.add(flowers);
    }
    for(const [id,parts]of batches){const merged=EstateMaterials.merge(parts);group.add(new THREE.Mesh(merged,mat(id)));parts.forEach(p=>p.dispose());}
    const paneParts=windows.map(w=>{const g=w.geometry.clone();g.translate(w.position.x,w.position.y,w.position.z);group.remove(w);w.geometry.dispose();w.material.dispose();return g;});
    windows.length=0;
    if(paneParts.length){const m=new THREE.Mesh(EstateMaterials.merge(paneParts),new THREE.MeshBasicMaterial({color:'#d1b285'}));group.add(m);windows.push(m);paneParts.forEach(g=>g.dispose());}
    let night=!!opts.night;
    function setNight(on){night=!!on;windows.forEach(w=>w.material.color.set(night?'#ffc887':'#777469'));lights.forEach(l=>l.intensity=night?2.2:.15);water.forEach(w=>w.material.color.set(night?'#1e394b':'#3d86a3'));}
    setNight(night);
    const local=p=>toLocal(V(p[0]-origin[0],p[1],p[2]-origin[2]));
    const anchors=Object.fromEntries(Object.entries(EstateLayout.anchors).map(([k,p])=>[k,local(p)]));
    const heightAt=(x,z)=>{const p=toWorld(x,z);return EstateLayout.heightAt(p.x,p.z);};
    return {group,anchors,origin,landmark:anchors.castle.clone().add(V(0,27,0)),heightAt,setNight,
      walkable:(x,z)=>{const p=toWorld(x,z);return EstateLayout.walkable(p.x,p.z);},
      constrain(pos,prev){
        const bad=(q)=>!EstateLayout.walkable(q.x,q.z) || q.x>-24&&q.x<-16&&q.z<-19.5;
        // a step from somewhere already out of bounds is let through, or you would be stuck there
        if(bad(toWorld(pos.x,pos.z)) && !bad(toWorld(prev.x,prev.z))){pos.x=prev.x;pos.z=prev.z;}},
      road:{length:EstateLayout.route.length,sample(distance){const s=EstateLayout.route.sample(distance);s.position=local([s.position.x,s.position.y,s.position.z]);s.tangent=toLocal(V(s.tangent.x,s.tangent.y,s.tangent.z));s.normal=toLocal(V(s.normal.x,s.normal.y,s.normal.z));return s;}},
      colliders:[{minX:-24-origin[0],maxX:-16-origin[0],minZ:-36-origin[2],maxZ:-19.5-origin[2]}],
      setGates(open,dt){gates.forEach(g=>{g.rotation.y=U.damp(g.rotation.y,-g.userData.sign*(open?Math.PI/2:0),2,dt);});},
      setWind(){},update(dt,cam,t){wind.value=t||0;water.forEach((w,i)=>w.material.roughness=.25+Math.sin((t||0)*.3+i)*.015);},
      dispose(){Engine.disposeObject(group);}
    };
  }
  function atmosphere(night=false){
    Sky.setPreset(night?{id:'estate-night',zenith:'#101f34',middle:'#263b51',horizon:'#586676',fog:'#4c5c6a',glow:'#93b1c6',sunDir:[-.4,.52,-.6],sunScale:750,
      sunInner:'rgba(217,234,245,.8)',sunOuter:'rgba(133,170,211,.12)',cloud:'#455769',cloudEmissive:'#233244',cloudIntensity:.12,
      peakRock:'#4c5a68',peakGrass:'#344852',nearRock:'#425361',nearGrass:'#344c4c'}:
      {id:'estate-golden',zenith:'#2d7fda',middle:'#86c8f0',horizon:'#e3f3ff',fog:'#cde6f4',glow:'#fff0c2',sunDir:[-.55,.6,-.58],sunScale:1150,
      sunInner:'rgba(255,251,236,.95)',sunOuter:'rgba(255,238,196,.24)',cloud:'#ffffff',cloudEmissive:'#e4edf6',cloudIntensity:.42,
      peakRock:'#8f9ead',peakGrass:'#5f9c66',nearRock:'#86928f',nearGrass:'#5fa05c'});
  }
  return {build,atmosphere};
})();
