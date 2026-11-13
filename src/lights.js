// Fire and lamp light. There are far more flames (altars, hearths, house
// fires, gate torches, the temple lamps) than a renderer can light at once,
// so a fixed pool of point lights moves each frame to the flames nearest the
// camera. The pool never changes size, so no shader has to be rebuilt.
import * as THREE from 'three';

// --- Sun shadows in two cascades -------------------------------------------------
// The sun is two directional lights in main.js: light 0 lights the scene and
// casts a wide shadow map; light 1 has no light of its own and casts a tight
// map round the viewer. Here the shader takes the tight map's shadow where it
// covers the point and blends to the wide map toward its edge. With only one
// shadow (low quality, or the governor dropped the tight map) three.js's own
// code runs unchanged.
const CASCADE = /* glsl */ `
#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS == 2 ) && defined( RE_Direct )
{
  DirectionalLight directionalLight = directionalLights[ 0 ];
  getDirectionalLightInfo( directionalLight, directLight );
  directLight.color *= cloudShade();
  if ( directLight.visible && receiveShadow ) {
    vec4 nc = vDirectionalShadowCoord[ 1 ];
    vec2 q = abs( nc.xy / nc.w - 0.5 ) * 2.0;
    float k = smoothstep( 0.72, 0.96, max( q.x, q.y ) );
    float sNear = k < 1.0 ? getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, nc ) : 1.0;
    float sFar = k > 0.0 ? getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
    directLight.color *= mix( sNear, sFar, k );
  }
  RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
#elif`;

let cascadeDone = false;
export function installSunCascade() {
  if (cascadeDone) return;
  cascadeDone = true;
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const start = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
  if (!chunk.includes(start) || !chunk.includes('cloudShade()')) { console.warn('sun cascade not installed'); return; }
  // "#if A ... #else-if B (the original block)": the original stays the fallback.
  THREE.ShaderChunk.lights_fragment_begin = chunk.replace(start, CASCADE + ' ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
}

// Place a directional light's shadow camera over `focus`, `ext` metres each
// side, looking along `dir` (toward the light). The centre is snapped to
// whole texels in the light's frame so the shadow edges stay still while the
// camera moves; the extent changes in steps for the same reason. Bias is set
// from the texel size: about a texel and a half along the normal, so a
// person's shadow starts at their feet and walls show no acne.
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export function placeShadow(light, dir, focus, ext) {
  const sc = light.shadow.camera;
  const step = Math.pow(1.25, Math.ceil(Math.log(ext) / Math.log(1.25)));
  if (Math.abs(sc.right - step) > 1e-3) {
    sc.left = -step; sc.right = step; sc.top = step; sc.bottom = -step;
    // Depth range: enough above and below the focus for hills and towers.
    const depth = Math.max(300, step * 3);
    sc.near = 1; sc.far = depth * 2;
    sc.updateProjectionMatrix();
    const texel = 2 * step / light.shadow.mapSize.x;
    light.shadow.normalBias = texel * 1.5;
    light.shadow.bias = -texel * 0.5 / sc.far;
    light.userData.depth = depth;
  }
  _z.copy(dir).normalize();
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(_z, _x);
  const texel = 2 * step / light.shadow.mapSize.x;
  const a = focus.dot(_x), b = focus.dot(_y);
  _p.copy(focus).addScaledVector(_x, Math.round(a / texel) * texel - a).addScaledVector(_y, Math.round(b / texel) * texel - b);
  light.target.position.copy(_p);
  light.position.copy(_p).addScaledVector(_z, light.userData.depth);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();
}

const FIRE = new THREE.Color(1, 0.55, 0.22);
const LAMP = new THREE.Color(1, 0.72, 0.4);

export class LightPool {
  constructor(scene, size = 8) {
    this.sources = [];
    this.lights = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(FIRE, 0, 30, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.tick = 0;
  }

  // s: { pos (world), power (candela), range, lamp, nightOnly, shown(), color, priority }
  add(s) {
    this.sources.push({ range: 28, lamp: false, nightOnly: false, phase: Math.random() * 10, ...s });
  }

  update(camera, time, night) {
    // Re-choose the nearest flames a few times a second.
    if (this.tick++ % 8 === 0) {
      const c = camera.position;
      const live = [];
      for (const s of this.sources) {
        if (s.nightOnly && night < 0.05) continue;
        if (s.shown && !s.shown()) continue;
        s.d2 = (s.pos.x - c.x) ** 2 + (s.pos.y - c.y) ** 2 + (s.pos.z - c.z) ** 2;
        if (s.d2 < 450 * 450) live.push(s);
      }
      live.sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || a.d2 - b.d2);
      this.active = live.slice(0, this.lights.length);
    }
    this.lights.forEach((l, i) => {
      const s = this.active?.[i];
      if (!s) { l.intensity = 0; return; }
      const flick = s.lamp ? 0.95 + 0.05 * Math.sin(time * 9 + s.phase) : 0.82 + 0.12 * Math.sin(time * 11 + s.phase) * Math.sin(time * 7.3 + s.phase * 2) + 0.06 * Math.sin(time * 23 + s.phase);
      l.position.copy(s.pos);
      l.color.copy(s.color || (s.lamp ? LAMP : FIRE));
      l.distance = s.range;
      // Fires matter little against the sun; at night they carry the scene.
      l.intensity = s.power * flick * (s.lamp ? 1 : 0.35 + 0.65 * night);
    });
  }
}
