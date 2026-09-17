/* Shootout owns this cache for the application lifetime. Materials borrow maps;
   disposing a mission must never invalidate another prepared scene's textures. */
const ShootoutMaterials = (() => {
  const cache = new Map();
  const tiles = {
    feather:0, flight:1, fur:2, leather:3, paper:4, membrane:5, timber:6, bark:7,
    ground:8, moss:9, rock:10, iron:11, pine:12, foliage:13, endgrain:14, pheasant:15,
  };
  const low = () => GameState.data.settings.quality === 'low';
  const motionPreference = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!GameState.data.settings.reducedMotion || !!(motionPreference && motionPreference.matches);
  let atlasReady;
  function atlas() {
    if (!atlasReady) atlasReady = new Promise(resolve => {
      const source = new Image();
      source.onload = () => resolve(source); source.onerror = () => resolve(null);
      source.src = 'assets/shootout/woodland-atlas.png';
    });
    return atlasReady;
  }
  function load(id) {
    const small = low(), key = id + (small ? ':low' : ':full');
    if (cache.has(key)) return cache.get(key);
    const entry = {status:'loading', texture:null}; cache.set(key, entry);
    entry.ready = atlas().then(source => {
      if (!source) { entry.status = 'error'; return entry; }
      // Crop into independent tiles so mipmaps and repeating UVs cannot bleed
      // neighbouring atlas materials. One decoded source, bounded quality cache.
      const tile = tiles[id] ?? tiles.rock, cell = source.width / 4;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = small ? 128 : 256;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, (tile % 4) * cell + 2, Math.floor(tile / 4) * cell + 2,
        cell - 4, cell - 4, 0, 0, canvas.width, canvas.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = ['ground','moss','rock','timber','bark'].includes(id) ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      texture.anisotropy = small ? 2 : 8;
      texture.userData.shootoutShared = true;
      entry.texture = texture; entry.status = 'ready'; return entry;
    });
    return entry;
  }
  function dress(mat, id, {bump = .015, dapple = null} = {}) {
    const entry = load(id), hook = mat.onBeforeCompile;
    const oldKey = mat.customProgramCacheKey();
    let live = true; mat.addEventListener('dispose', () => { live = false; });
    mat.flatShading = false;
    mat.onBeforeCompile = shader => {
      if (hook) hook.call(mat, shader);
      // Preserve the art-directed colour, including instanced tints, in shade.
      const neutral = ['feather','flight','fur','membrane','iron'].includes(id);
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        '#ifdef USE_MAP\n vec3 surface = texture2D(map, vMapUv).rgb;\n' +
        (neutral ? 'diffuseColor.rgb *= .32 + 2.1 * dot(surface, vec3(.299,.587,.114));' :
          'diffuseColor.rgb *= .38 + 1.6 * surface;') + '\n#endif');
      if (dapple) {
        shader.uniforms.uCanopyTime = dapple;
        shader.fragmentShader = 'uniform float uCanopyTime;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
          '#ifdef USE_MAP\n float shade = sin(vMapUv.x * 2.7 + sin(vMapUv.y * 3.1 + uCanopyTime * .12)) * sin(vMapUv.y * 2.3 - uCanopyTime * .08);\n gl_FragColor.rgb *= .94 + .06 * smoothstep(-.3, .8, shade);\n#endif\n#include <dithering_fragment>');
      }
    };
    mat.customProgramCacheKey = () => `shootout:${id}:${!!dapple}:${oldKey}`;
    const apply = () => {
      if (!live || !entry.texture) return;
      mat.map = entry.texture;
      // Restrained colour-map relief avoids extra image downloads on phones.
      if (mat.isMeshStandardMaterial || mat.isMeshPhongMaterial) { mat.bumpMap = entry.texture; mat.bumpScale = bump; }
      mat.needsUpdate = true;
    };
    if (entry.status === 'loading') entry.ready.then(apply); else apply();
    return mat;
  }
  function material(id, color, opts = {}) {
    return dress(new THREE.MeshStandardMaterial({color, roughness:.87, ...opts}), id);
  }
  const uv = (geometry, scale) => EstateMaterials.uv(geometry, scale);
  const preload = () => Promise.all(Object.keys(tiles).map(id=>load(id).ready));
  return {cache, tiles, load, dress, material, uv, low, reduced, preload};
})();
