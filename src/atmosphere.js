// Aerial perspective: replaces three.js's exponential fog with haze that is
// thicker low down (the Kidron, the Dead Sea rift) and brighter toward the sun.
// The extra uniforms are shared, so moving the sun updates every material.
import * as THREE from 'three';

export const atmo = {
  fogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  fogSunColor: { value: new THREE.Color(1, 0.9, 0.75) },
  fogFalloff: { value: 1 / 700 },     // 1 / scale height in metres
};

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;

// World position from the view-space position, without needing `transformed`
// (sprites do not have it).
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  mat3 fogR = mat3( viewMatrix );
  vec3 fogD = mvPosition.xyz - viewMatrix[ 3 ].xyz;
  vFogWorld = vec3( dot( fogR[ 0 ], fogD ), dot( fogR[ 1 ], fogD ), dot( fogR[ 2 ], fogD ) );
#endif`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  uniform float fogFalloff;
#endif`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    vec3 fogRay = vFogWorld - cameraPosition;
    float fogDist = length( fogRay );
    float fogK = max( fogFalloff, 1e-6 );
    float fogH0 = cameraPosition.y;
    // Density integrated along the ray through air thinning with height.
    float fogLine = abs( fogRay.y ) > 0.5
      ? ( exp( - fogK * fogH0 ) - exp( - fogK * ( fogH0 + fogRay.y ) ) ) / ( fogK * fogRay.y )
      : exp( - fogK * fogH0 );
    float fogFactor = 1.0 - exp( - fogDensity * fogDist * fogLine );
    float fogSun = pow( max( dot( fogRay / max( fogDist, 1e-3 ), fogSunDir ), 0.0 ), 6.0 );
    vec3 fogCol = mix( fogColor, fogSunColor, fogSun * 0.75 );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    vec3 fogCol = fogColor;
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`;

// Give a material the shared haze and cloud uniforms. Built-in materials that
// are not patched still render, just without the sun glow, height falloff and
// cloud shadows.
export function patchMaterial(m) {
  if (!m || m.userData.atmo || m.isShaderMaterial || m.fog === false) return;
  m.userData.atmo = true;
  const prev = m.onBeforeCompile;
  const hasPrev = m.hasOwnProperty('onBeforeCompile');
  m.onBeforeCompile = function (shader, renderer) {
    if (hasPrev) prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, atmo, clouds, { cloudSun: atmo.fogSunDir });
  };
  if (!m.hasOwnProperty('customProgramCacheKey')) m.customProgramCacheKey = () => 'atmo-v1';
}

export function patchScene(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) patchMaterial(m);
  });
}

// --- Clouds -------------------------------------------------------------------
// Scattered fair-weather cumulus about 2 km above the city. The same noise
// darkens the ground where their shadows fall (see terrain.js).
export const clouds = {
  cloudTime: { value: 0 },
  cloudCover: { value: 0.6 },      // higher means fewer clouds
  cloudY: { value: 2200 },
  cloudLight: { value: 1 },
  cloudOn: { value: 1 },           // cloud shadows on lit materials
};

export const CLOUD_GLSL = /* glsl */ `
uniform float cloudTime;
uniform float cloudCover;
uniform float cloudY;
float cHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * cNoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s;
}
float cloudAt(vec2 xz) {
  vec2 p = xz / 2600.0 + vec2(cloudTime * 0.0016, cloudTime * 0.0007);
  return smoothstep(cloudCover, cloudCover + 0.22, cFbm(p));
}`;

// Cloud shadows: dim the sunlight (the scene's only directional light) where
// a cloud lies between the surface and the sun. Needs the fog's world position.
THREE.ShaderChunk.lights_pars_begin += /* glsl */ `
uniform float cloudOn;
uniform vec3 cloudSun;
${CLOUD_GLSL}
float cloudShade() {
  #ifdef USE_FOG
    if ( cloudOn < 0.5 || cloudSun.y < 0.05 ) return 1.0;
    vec2 cxz = vFogWorld.xz + cloudSun.xz / cloudSun.y * ( cloudY - vFogWorld.y );
    return 1.0 - 0.62 * cloudAt( cxz ) * smoothstep( 0.05, 0.25, cloudSun.y );
  #else
    return 1.0;
  #endif
}`;
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= cloudShade();');

export function buildClouds() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...clouds, sunDir: atmo.fogSunDir, sunColor: atmo.fogSunColor },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float cloudLight;
      varying vec3 vW;
      ${CLOUD_GLSL}
      void main() {
        float c = cloudAt(vW.xz);
        if (c < 0.01) discard;
        // Thinner toward the sun = lit edge; the body is lit from the sky below.
        float toward = cloudAt(vW.xz + normalize(sunDir.xz + 1e-4) * 260.0);
        float lit = clamp(0.55 + (c - toward) * 1.6 + 0.25 * sunDir.y, 0.2, 1.0);
        vec3 col = mix(vec3(0.62, 0.66, 0.72), sunColor * 1.15 + 0.25, lit) * cloudLight;
        float d = length(vW.xz - cameraPosition.xz);
        float a = c * 0.92 * (1.0 - smoothstep(14000.0, 40000.0, d));
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(90000, 90000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.userData.follow = (cam) => mesh.position.set(cam.position.x, clouds.cloudY.value, cam.position.z);
  return mesh;
}
