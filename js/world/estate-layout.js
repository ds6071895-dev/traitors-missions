/* Authored metres, independent of rendering and random decoration. */
const EstateLayout = (() => {
  const anchors = Object.freeze({ welcome: [0,22,0], boarding: [8,22,-14],
    castle: [-3,22,-43], gate: [0,22,38], bridge: [-20,14,220],
    overlook: [65,18,302], terraceEntrance: [34,17,17], fire: [48,14,-8],
    returnStop: [14,22,8], loch: [195,1,130] });
  // Finish the forecourt turn before the wall, then stay centred through
  // both the gatehouse and its narrow, walled causeway.
  const controls = [[8,22,-14],[14,22,8],[0,22,24],[0,22,32],[0,22,44],[0,22,60],[0,22,76],[0,22,86],[-30,20,100],
    [-70,17,165],[-20,14,220],[35,15,250],[80,18,320],[30,24,430],[-90,30,480]];
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  function road() {
    const points = [],samples=[]; let length = 0;
    function curve(i,t,derivative=false) {
      const a=controls[Math.max(0,i-1)],b=controls[i],c=controls[i+1],d=controls[Math.min(controls.length-1,i+2)];
      return b.map((v,j)=>{
        const linear=-a[j]+c[j],quadratic=2*a[j]-5*v+4*c[j]-d[j],cubic=-a[j]+3*v-3*c[j]+d[j];
        return derivative ? .5*(linear+2*quadratic*t+3*cubic*t*t) : .5*(2*v+linear*t+quadratic*t*t+cubic*t*t*t);
      });
    }
    // A denser distance lookup keeps speed even without increasing terrain
    // queries or the number of vertices in the visible road ribbon.
    for (let i=0;i<controls.length-1;i++) for(let k=0;k<192;k++) {
      const t=k/192,p=curve(i,t);
      const prev=samples[samples.length-1]; if(prev) length+=Math.hypot(p[0]-prev.x,p[1]-prev.y,p[2]-prev.z);
      const point={x:p[0],y:p[1],z:p[2],distance:length,segment:i,t};
      samples.push(point);if(k%8===0)points.push(point);
    }
    const last=controls[controls.length-1], prev=samples[samples.length-1];
    length+=Math.hypot(last[0]-prev.x,last[1]-prev.y,last[2]-prev.z);
    points.push({x:last[0],y:last[1],z:last[2],distance:length,segment:controls.length-2,t:1});
    samples.push(points[points.length-1]);
    function sample(distance) {
      distance=clamp(distance,0,length); let lo=0, hi=samples.length-1;
      while(hi-lo>1){const m=(hi+lo)>>1;if(samples[m].distance<distance)lo=m;else hi=m;}
      const a=samples[lo],b=samples[hi],t=(distance-a.distance)/(b.distance-a.distance||1);
      // Arc-length lookup chooses a point on the original curve. Its analytic
      // tangent turns continuously instead of snapping at each ribbon segment.
      const u=a.t+((b.segment===a.segment?b.t:1)-a.t)*t;
      const p=curve(a.segment,u),v=curve(a.segment,u,true),n=Math.hypot(...v)||1;
      const tangent={x:v[0]/n,y:v[1]/n,z:v[2]/n};
      const h=Math.hypot(tangent.x,tangent.z)||1;
      return {position:{x:p[0],y:p[1],z:p[2]},tangent,
        normal:{x:-tangent.x*tangent.y/h,y:h,z:-tangent.z*tangent.y/h}};
    }
    function nearest(x,z) {
      let best={distance:Infinity,y:0,along:0};
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z;
        const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
        const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
        if(distance<best.distance)best={distance,y:a.y+(b.y-a.y)*t,along:a.distance+(b.distance-a.distance)*t};
      }return best;
    }
    return {points,length,width:4.8,sample,nearest};
  }
  const route=road();
  // Stay level until clear of the courtyard paving and its east wall.
  const path=[anchors.returnStop,[24,22,11.3333333333],[34,17,17],[43,14,8],[48,14,-8]];
  const lakes=[{x:195,z:130,rx:115,rz:230,y:1},{x:-480,z:580,rx:90,rz:150,y:5},{x:490,z:670,rx:120,rz:85,y:5}];
  function basin(x,z,l){return Math.hypot((x-l.x)/l.rx,(z-l.z)/l.rz);}
  function heightAt(x,z) {
    let h=18+Math.sin(x*.009)*12+Math.cos(z*.013)*8+Math.sin(x*.025+z*.014)*4;
    for(const l of lakes){const d=basin(x,z,l);if(d<1.18)h=h*clamp((d-.90)/.28,0,1)+(l.y-6)*(1-clamp((d-.90)/.28,0,1));}
    const courtDistance=Math.hypot(Math.max(Math.abs(x)-27,0),Math.max(z-32,-63-z,0));
    const courtBlend=clamp(courtDistance/32,0,1);h=22+(h-22)*courtBlend;
    const beforeTerrace=h;
    const fire=Math.hypot(x-48,z+8);if(fire<55)h=14+(h-14)*clamp((fire-12)/43,0,1);
    // The terrace opens down toward the shore instead of sitting in a steep bowl.
    const along=((x-48)*60+(z+8)*56)/(60*60+56*56),lateral=Math.abs((x-48)*56-(z+8)*60)/Math.hypot(60,56);
    if(along>0&&along<1.2&&lateral<38){const slope=14-clamp(along,0,1)*12,blend=clamp((lateral-14)/24,0,1);h=Math.min(h,slope+(h-slope)*blend);}
    if(fire<12)h=14;
    h=beforeTerrace+(h-beforeTerrace)*clamp(courtDistance/18,0,1);
    const creek=Math.abs(z-220);
    if(x>-60&&x<20&&creek<10){const bank=6+(h-6)*clamp((creek-4.5)/5.5,0,1),ends=clamp((Math.abs(x+20)-30)/10,0,1);h=bank+(h-bank)*ends;}
    const r=route.nearest(x,z);
    if(r.distance<16 && !(x>-55&&x<18&&creek<10))h=r.y+(h-r.y)*clamp((r.distance-7)/9,0,1);
    // The footpath owns its grade, including where it leaves the road.
    // Blend its shoulders so the terrain cannot rise through the paving.
    let nearest=Infinity,grade=0;
    for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2];
      const t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz),0,1);
      const distance=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t);
      if(distance<nearest){nearest=distance;grade=a[1]+(b[1]-a[1])*t;}
    }
    if(nearest<6)h=grade+(h-grade)*clamp((nearest-3)/3,0,1);
    return h;
  }
  function walkable(x,z){
    if(x>-22&&x<22&&z>-23&&z<31)return true;
    if(Math.abs(x)<2.7&&z>=-31&&z<=-23)return true;
    if(Math.abs(x)<3&&z>=31&&z<70)return true;
    if(Math.hypot(x-48,z+8)<11.5)return true;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2],t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz),0,1);
      if(Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t)<3)return true;
    }return false;
  }
  return {anchors,route,path,lakes,heightAt,walkable,basin};
})();
