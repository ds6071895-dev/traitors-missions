/* One locally shipped atlas, shared by the entire mountain. No remote texture requests. */
const SkiMaterials = (() => {
  const tiles = { snow:0, ice:1, rock:2, granite:3, timber:4, darkwood:5, shingles:6,
    plaster:7, pine:8, frostedPine:9, bark:10, stone:11, steel:12, darkmetal:13, glass:14, cloth:15 };
  // Extract cells once so mipmaps repeat within a material, never across atlas borders.
  // This avoids distant grid artefacts while keeping a single local download.
  const maps = {};
  let loaded = false, started = false;
  function texture(kind) {
    if (!maps[kind]) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,256,256);
      const map = new THREE.CanvasTexture(canvas);
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(8, Engine.renderer.capabilities.getMaxAnisotropy());
      maps[kind] = map;
    }
    if (!started) {
      started = true;
      const source = new Image();
      source.onload = () => {
        for (const [name, index] of Object.entries(tiles)) {
          const map = texture(name), cell = source.width / 4;
          map.image.getContext('2d').drawImage(source,(index%4)*cell,Math.floor(index/4)*cell,cell,cell,0,0,256,256);
          map.needsUpdate = true;
        }
        loaded = true;
      };
      source.src = 'assets/descent/alpine-materials.png';
    }
    return maps[kind];
  }
  function material(base, kind = 'snow') {
    if (base.userData.descentMaterial) return base;
    base.userData.descentMaterial = kind; base.map = texture(kind);
    const oldCompile = base.onBeforeCompile;
    base.onBeforeCompile = function(shader, renderer) {
      oldCompile.call(this, shader, renderer);
      shader.vertexShader = 'varying float vDescentSlope;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDescentSlope = 1.0 - smoothstep(0.48, 0.72, abs(normal.y));');
      shader.fragmentShader = 'varying float vDescentSlope;\n' + shader.fragmentShader;
      let extra = '';
      if (kind === 'snow' && base.vertexColors) {
        shader.uniforms.descentRock = { value: texture('rock') };
        shader.fragmentShader = 'uniform sampler2D descentRock;\n' + shader.fragmentShader;
        extra = 'detail = mix(detail,texture2D(descentRock,vMapUv),vDescentSlope * .8);';
      }
      if (kind === 'pine') {
        shader.uniforms.descentBark = { value: texture('bark') };
        shader.uniforms.descentFrost = { value: texture('frostedPine') };
        shader.fragmentShader = 'uniform sampler2D descentBark;\nuniform sampler2D descentFrost;\n' + shader.fragmentShader;
        extra = '#ifdef USE_COLOR\nif(vColor.r > vColor.g * 1.12) detail = texture2D(descentBark,vMapUv);\nelse if(vColor.r > .55) detail = texture2D(descentFrost,vMapUv);\n#endif';
      }
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
        vec4 detail = texture2D(map,vMapUv);
        ${extra}
        ${kind === 'cloth' ? 'detail.rgb = vec3(dot(detail.rgb,vec3(.299,.587,.114)) * 2.0 + .35);' : ''}
        diffuseColor.rgb *= mix(vec3(1.0),detail.rgb,${kind === 'snow' ? '.42' : '.78'});
        #endif
      `);
    };
    base.customProgramCacheKey = () => 'descent-material-2-' + kind;
    base.needsUpdate = true; return base;
  }
  function uv(geometry, metres = 12) {
    if (geometry.attributes.uv) return;
    const p = geometry.attributes.position, n = geometry.attributes.normal;
    const data = new Float32Array(p.count * 2);
    for (let i=0;i<p.count;i++) {
      const x = n ? Math.abs(n.getX(i)) : 0, y = n ? Math.abs(n.getY(i)) : 1, z = n ? Math.abs(n.getZ(i)) : 0;
      data[i*2] = (y >= x && y >= z ? p.getX(i) : x > z ? p.getZ(i) : p.getX(i)) / metres;
      data[i*2+1] = (y >= x && y >= z ? p.getZ(i) : p.getY(i)) / metres;
    }
    geometry.setAttribute('uv',new THREE.BufferAttribute(data,2));
  }
  function apply(root, kind, scale = 12) {
    root.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry) return;
      uv(mesh.geometry,scale);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!m || m.isShaderMaterial || m.map || m.userData.descentMaterial) continue;
        material(m,kind);
      }
    });
  }
  return { material, uv, apply, get ready() { return loaded; } };
})();
