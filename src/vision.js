// Ezekiel's vision drawn as light: the temple measured in Ezek 40–42, laid
// over the historical scene as a glowing, see-through, colour-coded overlay.
// Each part type has its own colour so the two plans can be read together.
import * as THREE from 'three';

export const VISION_PARTS = [
  { tag: 'house', color: '#ffd27a', fill: 0.10, rim: 0.55, label: 'The house', note: 'Nave 40 × 20 and inner room 20 × 20 cubits, the same as Solomon\'s' },
  { tag: 'altar', color: '#ff7a3d', fill: 0.14, rim: 0.55, label: 'Altar', note: 'Stepped, 18 to 12 cubits square, steps on the east (43:13–17)' },
  { tag: 'gate', color: '#4fe0d6', fill: 0.08, rim: 0.45, label: 'Six gates', note: '50 × 25 cubits each, three guard rooms a side (40:6–37)' },
  { tag: 'chamber', color: '#c39bff', fill: 0.07, rim: 0.4, label: 'Chambers and kitchens', note: 'For the priests, the people and the offerings (40:17; 42; 46:19–24)' },
  { tag: 'binyan', color: '#ff8fb8', fill: 0.07, rim: 0.4, label: 'Western building', note: '70 × 90 cubits inside; purpose not stated (41:12)' },
  { tag: 'wall', color: '#93b7ff', fill: 0.06, rim: 0.35, label: 'Walls', note: 'A square of 500 × 500 cubits (42:15–20)' },
  { tag: 'court', color: '#6f9cff', fill: 0.035, rim: 0, xray: false, label: 'Courts', note: 'Outer court 7 steps up, inner court 8 more (40:22, 31)' },
  { tag: 'river', color: '#55c8ff', label: 'River', note: 'From under the threshold to the Dead Sea (47:1–12)' },
];

const FACE_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FACE_FRAG = /* glsl */ `
uniform vec3 color;
uniform float fill;
uniform float rim;
uniform float strength;
uniform float time;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float f = 1.0 - abs(dot(normalize(vN), v));
  // Faint bands of light drifting upward.
  float band = 0.82 + 0.18 * sin(vW.y * 1.3 - time * 1.2);
  // Fade walls right beside the camera, so rooms can be seen from inside.
  float near = mix(0.22, 1.0, smoothstep(3.0, 16.0, length(cameraPosition - vW)));
  float a = clamp((fill + rim * f * f) * band * near * strength, 0.0, 1.0);
  gl_FragColor = vec4(color, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function faceMat(color, fill, rim, shared, xray) {
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: color.clone() }, fill: { value: fill }, rim: { value: rim }, strength: shared.strength, time: shared.time },
    vertexShader: FACE_VERT,
    fragmentShader: FACE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: !xray,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  m.userData.base = color.clone();
  return m;
}

function lineMat(color, opacity, xray) {
  const m = new THREE.LineBasicMaterial({
    color: color.clone(), transparent: true, opacity,
    depthWrite: false, depthTest: !xray, blending: THREE.AdditiveBlending, fog: false,
  });
  m.userData.base = opacity;
  m.userData.col = color.clone();
  m.userData.hot = xray ? 0.7 : 1;
  return m;
}

// Living water: bands of light flowing downstream along the ribbon (uv.y is
// distance along the course in tens of metres).
function riverMat(color, shared) {
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: color.clone() }, strength: shared.strength, time: shared.time },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float strength; uniform float time;
      varying vec2 vUv;
      void main() {
        float flow = 0.5 + 0.5 * sin(vUv.y * 2.5 - time * 2.4);
        float edge = 1.0 - smoothstep(0.55, 1.0, abs(vUv.x * 2.0 - 1.0));
        float a = clamp((0.22 + 0.3 * flow) * (0.4 + 0.6 * edge) * strength, 0.0, 1.0);
        gl_FragColor = vec4(color, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  m.userData.base = color.clone();
  return m;
}

// Materials for every part type, sharing strength and time uniforms.
export function makeVisionLooks() {
  const shared = { strength: { value: 0.85 }, time: { value: 0 } };
  const looks = {};
  const lines = [], faces = [];
  for (const p of VISION_PARTS) {
    const col = new THREE.Color(p.color);
    if (p.tag === 'river') { looks.river = { face: riverMat(col, shared) }; faces.push(looks.river.face); continue; }
    looks[p.tag] = {
      face: faceMat(col, p.fill, p.rim, shared, false),
      xray: p.xray === false ? null : faceMat(col, p.fill * 0.4, p.rim * 0.45, shared, true),
      line: lineMat(col, p.tag === 'court' ? 0.35 : 0.85, false),
      lineX: lineMat(col, 0.2, true),
    };
    lines.push(looks[p.tag].line, looks[p.tag].lineX);
    faces.push(looks[p.tag].face);
    if (looks[p.tag].xray) faces.push(looks[p.tag].xray);
  }
  return {
    shared,
    looks,
    setStrength(s) {
      shared.strength.value = s;
      for (const m of lines) m.opacity = m.userData.base * Math.min(1, s * 1.15);
    },
    // Colour gain: above 1 the glow passes the bloom threshold.
    setGain(g) {
      for (const m of faces) m.uniforms.color.value.copy(m.userData.base).multiplyScalar(0.7 + 0.4 * g);
      for (const m of lines) m.color.copy(m.userData.col).multiplyScalar(g * m.userData.hot);
    },
  };
}

// Keys left out of the vision: thin panels and fittings that only add noise.
export const VISION_SKIP = new Set(['window', 'ember', 'palmStone', 'cedarCarved', 'water', 'fire', 'linen', 'veil', 'goldCarved']);
