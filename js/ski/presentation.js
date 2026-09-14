/* Scenery consumes the same rail and surface coordinates as contact queries. */
const SkiPresentation = (() => {
  const presets = { low: { density: 1, particles: 450, tracks: 240, resolution: 1, shadow: 0 },
    medium: { density: 2, particles: 900, tracks: 480, resolution: 1.5, shadow: 512 },
    high: { density: 3, particles: 1500, tracks: 800, resolution: 2, shadow: 1024 } };
  function build(scene, face, d, quality) {
    const group = new THREE.Group(); group.name = 'Descent playground';
    const mats = {};
    const mat = (c, kind = 'stone') => mats[c+'|'+kind] ||= SkiMaterials.material(new THREE.MeshLambertMaterial({ color:c, flatShading:true }),kind);
    const box = (x, y, z, w, h, l, color, kind = 'stone') => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat(color,kind)); m.position.set(x, y, z); group.add(m); return m;
    };
    for (const rail of d.rails) for (let i = 1; i < rail.points.length; i++) {
      const a = rail.points[i - 1], b = rail.points[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const m = box((a.x + b.x) / 2, (a.y + b.y) / 2 - .16, (a.z + b.z) / 2, .55, .32, length, '#dce9f4', 'steel');
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize());
      if (i % 2) box(a.x, a.y - .6, a.z, .24, 1.2, .24, '#334b62', 'darkmetal');
    }
    for (const s of d.surfaces) {
      if (s.rise) {
        for (const [offset,thickness,color,kind] of [[-.23,.42,'#bb9274','shingles'],[0,.23,'#f6fbff','snow']]) {
          const shape=new THREE.Shape();
          shape.moveTo(-s.halfX,-thickness);shape.lineTo(-s.halfX,0);shape.lineTo(0,s.rise);
          shape.lineTo(s.halfX,0);shape.lineTo(s.halfX,-thickness);shape.lineTo(0,s.rise-thickness);shape.closePath();
          const geometry=new THREE.ExtrudeGeometry(shape,{depth:s.halfZ*2,bevelEnabled:true,bevelSize:.06,bevelThickness:.04,bevelSegments:2,steps:1});
          const roof=new THREE.Mesh(geometry,mat(color,kind));roof.position.set(s.x,s.y+offset,s.z-s.halfZ);group.add(roof);
        }
        continue;
      }
      const roof = box(s.x, s.y - s.thickness / 2, s.z, s.halfX * 2, s.thickness, s.halfZ * 2, '#f5fbff', 'snow');
      roof.rotation.x = Math.atan(-s.slope);
      if (s.building) continue;
      // Supports leave the space under the skiable platform open.
      for (const side of [-1, 1]) box(s.x + side * (s.halfX - 1), s.y - 3, s.z, 1.2, 5, s.halfZ * 1.8, '#d1aa8e', 'timber');
    }
    for (const b of d.buildings || []) {
      box(b.x, b.y + 6, b.z, 15, 12, 19, '#f4d4b6', 'timber');
      box(b.x, b.y + 1.4, b.z, 15.3, 2.8, 19.3, '#c1b7a9', 'stone');
      const gableShape=new THREE.Shape();
      gableShape.moveTo(-7.5,0);gableShape.lineTo(7.5,0);gableShape.lineTo(7.5,1.21);
      gableShape.lineTo(0,4.37);gableShape.lineTo(-7.5,1.21);gableShape.closePath();
      for(const side of [-1,1]) {
        const gable=new THREE.Mesh(new THREE.ShapeGeometry(gableShape),mat('#f4d4b6','timber'));
        gable.position.set(b.x,b.y+12,b.z+side*9.51);gable.rotation.y=side<0?Math.PI:0;group.add(gable);
        box(b.x,b.y+13.3,b.z+side*9.56,1.6,1.7,.13,'#654a3d','darkwood');
        box(b.x,b.y+13.3,b.z+side*9.65,1.25,1.35,.08,'#ffe1a0','glass');
      }

      for (const side of [-1,1]) {
        const x=b.x+side*7.58;
        for(const z of [b.z-5,b.z+5]) {
          box(x,b.y+7,z,.2,3.4,3.1,'#654a3d','darkwood');
          const glass=box(x+side*.13,b.y+7,z,.08,2.8,2.5,'#ffe1a0','glass');
          glass.material.emissive.set('#b57c27'); glass.material.emissiveIntensity=.35;
          box(x+side*.2,b.y+7,z,.1,.14,2.7,'#ccb296','timber');
          box(x+side*.2,b.y+7,z,.1,2.9,.14,'#ccb296','timber');
          for(const shutter of [-1,1]) box(x+side*.08,b.y+7,z+shutter*2,.18,3.2,.7,b.color,'timber');
        }
        box(x,b.y+3,b.z,.25,4.8,2.2,'#735442','darkwood');
        box(x+side*.2,b.y+1,b.z,.8,.35,3,'#d8dbe1','stone');
      }
      for(const z of [b.z-9.6,b.z+9.6]) {
        box(b.x,b.y+10.9,z,15.6,.42,.3,'#715343','darkwood');
        for(const x of [b.x-6,b.x+6]) box(x,b.y+7,z,.36,8,.35,'#715343','darkwood');
      }
      // Layered eaves and end fascia give the roof depth without losing the clean silhouette.
      box(b.x,b.y+12.3,b.z,18.5,.4,22,'#a97758','shingles');
    }
    for (const sec of d.sections) {
      const region = sec.def.region;
      for (let j = 0; j < 6 * presets[quality].density; j++) {
        const z = sec.z0 + 30 + j / (6 * presets[quality].density) * 550;
        const x = face.cxAt(z) + (j % 2 ? 1 : -1) * (95 + (j % 3) * 15);
        const y = face.heightAt(x, z);
        if (region === 'village') {
          continue;
        } else if (region === 'glacier') {
          const ice = new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),mat(j%2 ? '#b2e2f3' : '#85bedb','ice')); ice.scale.set(12,24+j%3*6,16); ice.position.set(x,y+15,z);ice.rotation.z=.14;group.add(ice);
        } else if (region === 'summit') {
          const geometry = new THREE.DodecahedronGeometry(1,1);
          const positions=geometry.attributes.position;
          for(let k=0;k<positions.count;k++) {
            const px=positions.getX(k),py=positions.getY(k),pz=positions.getZ(k);
            const weathering=1+.12*Math.sin(px*7+pz*3)+.08*Math.cos(py*9-px*4);
            positions.setXYZ(k,px*24*weathering+py*6,py*48,pz*20*weathering);
          }
          geometry.computeVertexNormals();
          const m = new THREE.Mesh(geometry, mat(j % 2 ? '#a9b7ca' : '#d0dce6','granite'));
          m.position.set(x, y + 19, z); m.rotation.y=j*.71; group.add(m);
        }
      }
      // Landmark visible at the region transition.
      const z = sec.z1 - 45, x = face.cxAt(z) - 90, y = face.heightAt(x, z);
      box(x, y + 16, z, 8, 32, 8, region === 'village' ? '#b47b70' : '#d4e7f7');
      box(x, y + 33, z, 16, 3, 16, '#ffcf78');
    }
    // Route information belongs on a few entrance signs, not a carpet of rectangles.
    for (const route of d.routes) {
      const z=route.z0-18,x=face.cxAt(z)-face.halfAt(z)*.65,y=face.heightAt(x,z);
      box(x,y+1.8,z,.2,3.6,.2,'#927356','timber');
      const sign=box(x,y+3.4,z,3.6,.7,.16,'#f8d48b','timber');
      sign.rotation.z=route.side*.12;
    }
    // Merge static meshes by material to bound draw calls on mobile GPUs.
    const batches = new Map();
    for (const mesh of group.children) {
      mesh.updateMatrix();
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrix);
      if (!batches.has(mesh.material)) batches.set(mesh.material, []);
      batches.get(mesh.material).push(geometry); mesh.geometry.dispose();
    }
    group.clear();
    for (const [material, geometries] of batches) {
      const merged = Sky.mergeGeometries(geometries);
      for (const geometry of geometries) geometry.dispose();
      SkiMaterials.uv(merged, 9);
      const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
    scene.add(group); return group;
  }
  return { presets, build };
})();
