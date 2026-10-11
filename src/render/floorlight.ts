// The floodlights' light on the padel arena's floor, baked in Blender (art/blender/floorlight.py): the light of the 36
// lamps of the roof's ring over the whole floor inside the stands (the blue court evenly lit, falling off towards the
// walls and the stands), the soft crossed shadows of the cage's steel and wire mesh, the net, its posts, the boards
// and the furniture, the darkening at the foot of everything (the glass lets the light through: no shadow of its
// panes). A grey texture over the floor's rectangle, normalised to the middle of the court (stored ÷ RANGE): the
// floor's materials multiply their light by it. The key light's own sharp shadows stay live (the players', the
// ball's, the furniture's); with the bake loaded the venue's drawn contact decals go (the bake has the real ones).
//
// ?light=off leaves it out (to compare); ?light=1.2,0.9 tries another contrast and amount (look development). It
// loads after the venue, and until then the floor is as before.

import * as THREE from 'three';

/** the floor's rectangle (x, z, m) the texture covers: keep in step with art/blender/floorlight.py */
const X0 = -10.1;
const X1 = 10.1;
const Z0 = -15.0;
const Z1 = 15.0;
const RANGE = 1.6;
/** how much of the bake shows (1: all), and its contrast (a power on the light) */
let AMOUNT = 1.0;
let CONTRAST = 1.5;
try {
  const q = new URLSearchParams(location.search).get('light')?.split(',').map(Number);
  if (q && Number.isFinite(q[0])) CONTRAST = q[0];
  if (q && Number.isFinite(q[1])) AMOUNT = q[1];
} catch {
  // (no page: the tools)
}

const shared = {
  uPbFloorMap: { value: null as THREE.Texture | null },
  uPbFloorOn: { value: 0 },
  uPbFloorRect: { value: new THREE.Vector4(X0, Z0, 1 / (X1 - X0), 1 / (Z1 - Z0)) },
};

export function floorLightOff(): boolean {
  try {
    return new URLSearchParams(location.search).get('light') === 'off';
  } catch {
    return true;
  }
}

/**
 * Lights a material's floor with the bake. `floorOnly`: only where it faces up near the ground (a mesh that also has
 * walls and stands: the bowl, the furniture); otherwise everywhere (the court surface, its lines, its logos).
 */
export function litByFloor<T extends THREE.Material>(m: T, floorOnly: boolean): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    prev.call(m, s, r);
    s.uniforms.uPbFloorMap = shared.uPbFloorMap;
    s.uniforms.uPbFloorOn = shared.uPbFloorOn;
    s.uniforms.uPbFloorRect = shared.uPbFloorRect;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPbFW;\nvarying float vPbFUp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPbFW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vPbFUp = normalize( mat3( modelMatrix ) * objectNormal ).y;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uPbFloorMap; uniform float uPbFloorOn; uniform vec4 uPbFloorRect;
        varying vec3 vPbFW; varying float vPbFUp;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec2 fuv = ( vPbFW.xz - uPbFloorRect.xy ) * uPbFloorRect.zw;
          float inside = step( 0.0, fuv.x ) * step( fuv.x, 1.0 ) * step( 0.0, fuv.y ) * step( fuv.y, 1.0 );
          float k = uPbFloorOn * inside * ${AMOUNT.toFixed(2)}${floorOnly ? ' * step( 0.9, vPbFUp ) * step( vPbFW.y, 0.05 )' : ''};
          float lit = pow( texture2D( uPbFloorMap, fuv ).r * ${RANGE.toFixed(2)}, ${CONTRAST.toFixed(2)} );
          outgoingLight *= mix( 1.0, lit, k );
        }
        #include <opaque_fragment>`,
      );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + (floorOnly ? '-pbfl1' : '-pbfl0');
  return m;
}

/** loads the bake (assets/light/floor.webp) and turns it on; `ready` runs once it is in */
export function loadFloorLight(ready: () => void) {
  if (floorLightOff() || typeof document === 'undefined') return;
  new THREE.TextureLoader().load(
    'assets/light/floor.webp',
    (t) => {
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 4;
      shared.uPbFloorMap.value = t;
      shared.uPbFloorOn.value = 1;
      ready();
    },
    undefined,
    () => console.warn('floor light: assets/light/floor.webp missing'),
  );
}
