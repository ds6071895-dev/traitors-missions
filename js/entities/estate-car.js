/* One unbranded estate SUV. +z is forward; seat order follows session seating. */
const EstateCar = (() => {
  function build(players=[]) {
    const group=new THREE.Group();group.name='estate-suv';
    const mats={};const mat=id=>mats[id]||(mats[id]=EstateMaterials.material(id));
    const cube=(parent,id,w,h,d,x,y,z)=>{
      const geo=new THREE.BoxGeometry(w,h,d);EstateMaterials.uv(geo,1);
      const m=new THREE.Mesh(geo,mat(id));m.position.set(x,y,z);parent.add(m);return m;
    };
    cube(group,'paint',1.95,.65,4.7,0,.85,0);
    cube(group,'paint',1.95,.24,1.35,0,1.3,1.62);
    cube(group,'paint',1.93,.15,2.8,0,2.13,-.45);
    cube(group,'iron',2,.18,.18,0,.7,2.42);cube(group,'iron',1.2,.32,.1,0,1,2.38);
    cube(group,'upholstery',1.7,.3,.35,0,1.5,1.1);
    for(const x of [-.88,.88])for(const z of [-1.82,.96])cube(group,'paint',.10,.95,.12,x,1.68,z);
    const glass=new THREE.MeshStandardMaterial({color:'#a7bfba',transparent:true,opacity:.17,roughness:.12,side:THREE.DoubleSide,depthWrite:false});
    for(const z of [-1.86,1.08]){const m=new THREE.Mesh(new THREE.PlaneGeometry(1.65,.7),glass);m.position.set(0,1.7,z);group.add(m);}
    const doors=[],seats=[[-.49,0,.38],[-.49,0,-.83],[.49,0,-.83]],doorAt=[[-1.28,0,.48],[-1.28,0,-.93],[1.28,0,-.93]],figures=[];
    for(let i=0;i<3;i++){
      const p=seats[i],side=i===2?1:-1;
      const hinge=new THREE.Group();hinge.position.set(side*.99,1.23,p[2]+.54);
      cube(hinge,'paint',.08,.5,1,0,0,-.5);
      const window=new THREE.Mesh(new THREE.PlaneGeometry(1,.65),glass);window.rotation.y=Math.PI/2;window.position.set(0,.6,-.5);hinge.add(window);group.add(hinge);doors.push(hinge);
    }
    for(const p of [...seats,[.49,0,.38]]){
      cube(group,'upholstery',.63,.18,.68,p[0],.95,p[2]);cube(group,'upholstery',.63,.68,.15,p[0],1.25,p[2]-.32);
      cube(group,'upholstery',.4,.23,.15,p[0],1.68,p[2]-.32);
    }
    const driver=Figure.build({palette:'slate',height:1.65,long:false});EstateMaterials.fabric(driver);driver.position.set(.49,.68,.38);Figure.setSeated(driver,true);group.add(driver);
    const wheelGeo=new THREE.CylinderGeometry(.42,.42,.25,16);wheelGeo.rotateZ(Math.PI/2);
    const wheels=[];
    for(const x of [-1,1])for(const z of [-1.48,1.48]){
      const pivot=new THREE.Group();pivot.position.set(x,.43,z);const w=new THREE.Mesh(wheelGeo,mat('rubber'));pivot.add(w);group.add(pivot);wheels.push({pivot,w,front:z>0});
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.21,.21,.26,8),mat('iron'));hub.rotation.z=Math.PI/2;pivot.add(hub);
    }
    for(const x of [-.73,.73]){const m=new THREE.Mesh(new THREE.BoxGeometry(.38,.18,.06),new THREE.MeshBasicMaterial({color:'#ffe9b0'}));m.position.set(x,1.12,2.36);group.add(m);}
    const light=new THREE.SpotLight('#ffe6b3',2.5,42,.55,.6,1);light.position.set(0,1.2,2);light.target.position.set(0,0,30);group.add(light,light.target);
    for(let i=0;i<players.length;i++){
      const p=players[i],fig=Figure.build(p.look?{look:p.look,long:false}:{palette:Figure.paletteFor(p.seat),long:false});
      EstateMaterials.fabric(fig);fig.visible=false;group.add(fig);figures.push(fig);
    }
    const seatWorld=i=>group.localToWorld(new THREE.Vector3(seats[i%3][0],1.72,seats[i%3][2]));
    const doorWorld=i=>group.localToWorld(new THREE.Vector3(...doorAt[i%3]));
    let rotation=0;
    return {group,seats,figures,doors,seatWorld,doorWorld,
      pose(sample,reverse=false){group.position.copy(sample.position);group.rotation.set((reverse?1:-1)*Math.atan2(sample.tangent.y,Math.hypot(sample.tangent.x,sample.tangent.z)),Math.atan2(sample.tangent.x,sample.tangent.z)+(reverse?Math.PI:0),0,'YXZ');group.updateMatrixWorld(true);},
      update(dt,t,boarded=[],moving=false,localId,camera){
        rotation+=moving?dt*8:0;
        wheels.forEach(({pivot,w,front})=>{w.rotation.x=rotation;if(front)pivot.rotation.y=moving?Math.sin(t*.4)*.08:0;});
        players.forEach((p,i)=>{const aboard=boarded.includes(p.id),fig=figures[i],seat=seats[i%3];fig.visible=aboard&&p.id!==localId;
          fig.position.set(seat[0],.68,seat[2]);Figure.setSeated(fig,true);Figure.update(fig,dt,t);if(camera)EstateMaterials.figureLOD(fig,camera);
          doors[i%3].rotation.y=U.damp(doors[i%3].rotation.y,!moving&&!aboard?(i===2?-1:1)*1.05:0,4,dt);
        });Figure.update(driver,dt,t);if(camera){driver.visible=driver.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position)<55;EstateMaterials.figureLOD(driver,camera);}
      },dispose(){Engine.disposeObject(group);}
    };
  }
  return {build};
})();
