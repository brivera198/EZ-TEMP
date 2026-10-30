// Water: two layers of moving ripples, Fresnel reflection of the sky (and,
// for the pool nearest the camera, a true mirror image of its surroundings),
// sun glints, and a body colour that darkens with depth of view.
// Built on MeshStandardMaterial so shadows, haze and cloud shadows still apply.
import * as THREE from 'three';

export const waterShared = {
  wTime: { value: 0 },
  reflMap: { value: null },
  reflMatrix: { value: new THREE.Matrix4() },
  reflOn: { value: 0 },
  reflY: { value: 0 },
  reflMin: { value: new THREE.Vector2() },
  reflMax: { value: new THREE.Vector2() },
};

const VERT_HEAD = /* glsl */ `
uniform mat4 reflMatrix;
varying vec3 vWaterPos;
varying vec4 vReflUv;
varying vec2 vFlowUv;`;
const VERT_BODY = /* glsl */ `
{
  vec4 wPos = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  vWaterPos = wPos.xyz;
  vReflUv = reflMatrix * wPos;
  vFlowUv = uv;
}`;

const FRAG_HEAD = /* glsl */ `
uniform float wTime;
uniform sampler2D reflMap;
uniform float reflOn;
uniform float reflY;
uniform vec2 reflMin;
uniform vec2 reflMax;
uniform float wScale;
uniform float wStrength;
varying vec3 vWaterPos;
varying vec4 vReflUv;
varying vec2 vFlowUv;
vec3 waterN;`;

// Ripples: two scrolling layers blended, turned into a view-space normal.
const FRAG_NORMAL = /* glsl */ `
{
  #ifdef WATER_FLOW
    vec2 p1 = vec2(vFlowUv.x * 0.6, vFlowUv.y * 1.6 - wTime * 0.55);
    vec2 p2 = vec2(vFlowUv.x * 1.3 + 0.37, vFlowUv.y * 2.7 - wTime * 0.9);
  #else
    vec2 q = vWaterPos.xz * wScale;
    vec2 p1 = q * 0.11 + vec2(wTime * 0.012, wTime * 0.007);
    vec2 p2 = q * 0.27 + vec2(-wTime * 0.009, wTime * 0.016);
  #endif
  vec3 n1 = texture2D(normalMap, p1).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(normalMap, p2).xyz * 2.0 - 1.0;
  vec2 slope = (n1.xy + n2.xy * 0.7) * wStrength;
  waterN = normalize(vec3(slope.x, 1.0, slope.y));
  normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);
}`;

// Mirror image for the active pool, disturbed by the ripples.
const FRAG_REFLECT = /* glsl */ `
#if defined( RE_IndirectSpecular )
  if (reflOn > 0.5 && abs(vWaterPos.y - reflY) < 0.15 && all(greaterThan(vWaterPos.xz, reflMin)) && all(lessThan(vWaterPos.xz, reflMax))) {
    vec2 ruv = vReflUv.xy / vReflUv.w + waterN.xz * 0.035;
    radiance = mix(radiance, texture2D(reflMap, ruv).rgb, 0.92);
  }
#endif`;

// still: pools, the Sea, the Dead Sea. flow: the channel and the river.
export function makeWater(normalMap, { flow = false, color = 0x123f47, opacity = 0.9, scale = 1, strength = 0.18 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.03, metalness: 0, normalMap, transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
  });
  m.envMapIntensity = 1;
  m.userData.water = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterShared, { wScale: { value: scale }, wStrength: { value: strength } });
    if (flow) shader.defines = { ...shader.defines, WATER_FLOW: '' };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + FRAG_REFLECT);
  };
  m.customProgramCacheKey = () => 'water-' + (flow ? 'flow' : 'still');
  return m;
}

// Planar reflection for one flat water surface at a time: the nearest one in
// view. Renders the scene from a camera mirrored in the water plane, with an
// oblique near plane so nothing below the surface shows (as Reflector.js).
export class Reflections {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.bodies = [];
    this.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
    waterShared.reflMap.value = this.rt.texture;
    this.cam = new THREE.PerspectiveCamera();
    this.enabled = true;
    // Bound in place of the mirror texture while the mirror itself is drawn,
    // so other water in view never samples the target being rendered.
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blank.needsUpdate = true;
  }

  // Flat water meshes: anything with a water material whose top is level.
  collect(root) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material?.userData?.water) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (b.max.y - b.min.y > 0.3) return;     // sloping: a channel or river
      this.bodies.push({ mesh: o, box: b, y: b.max.y });
    });
  }

  setSize(w, h) { this.rt.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))); }

  update(camera, isShown) {
    waterShared.reflOn.value = 0;
    if (!this.enabled) return;
    let best = null, bestD = 320;
    const c = camera.position;
    for (const b of this.bodies) {
      if (c.y < b.y + 0.3 || !isShown(b.mesh)) continue;
      const dx = Math.max(b.box.min.x - c.x, 0, c.x - b.box.max.x), dz = Math.max(b.box.min.z - c.z, 0, c.z - b.box.max.z);
      const d = Math.hypot(dx, dz, c.y - b.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (!best) return;
    // Mirror the camera in the plane y = best.y.
    const y = best.y, v = this.cam;
    v.position.set(c.x, 2 * y - c.y, c.z);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const target = c.clone().add(f);
    target.y = 2 * y - target.y;
    v.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    v.up.y = -v.up.y;
    v.lookAt(target);
    v.fov = camera.fov; v.aspect = camera.aspect; v.near = camera.near; v.far = camera.far;
    v.updateProjectionMatrix();
    v.updateMatrixWorld();
    // Is the water in front of the camera at all?
    const proj = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(proj);
    if (!frustum.intersectsBox(best.box)) return;
    // Oblique near plane at the water surface (Lengyel), in mirror-camera space.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y).applyMatrix4(v.matrixWorldInverse);
    const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = v.projectionMatrix;
    const q = new THREE.Vector4(
      (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0],
      (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5],
      -1, (1 + pm.elements[10]) / pm.elements[14]);
    cp.multiplyScalar(2 / cp.dot(q));
    pm.elements[2] = cp.x; pm.elements[6] = cp.y; pm.elements[10] = cp.z + 1; pm.elements[14] = cp.w;
    waterShared.reflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(pm).multiply(v.matrixWorldInverse);
    // Render without the water itself.
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    best.mesh.visible = false;
    waterShared.reflMap.value = this.blank;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, v);
    r.setRenderTarget(prevTarget);
    waterShared.reflMap.value = this.rt.texture;
    best.mesh.visible = true;
    waterShared.reflOn.value = 1;
    waterShared.reflY.value = y;
    waterShared.reflMin.value.set(best.box.min.x - 0.5, best.box.min.z - 0.5);
    waterShared.reflMax.value.set(best.box.max.x + 0.5, best.box.max.z + 0.5);
  }
}
