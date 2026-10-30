// The sky over the day: sun and moon positions, stars, and volumetric
// clouds. The clouds are raymarched through a slab of 3D Perlin–Worley noise,
// shaped by a 2D weather map (the same map darkens the ground under them),
// lit by marching toward the sun, at half resolution with temporal blending.
import * as THREE from 'three';
import { clouds } from './atmosphere.js';

const LAT = THREE.MathUtils.degToRad(31.8);   // Jerusalem

// Sun and (full) moon for an hour of the day. y up, x east, z south.
export function celestial(hours) {
  const t = (hours - 6) / 12;
  const el = Math.sin(t * Math.PI) * THREE.MathUtils.degToRad(64);
  const az = THREE.MathUtils.degToRad(90 + t * 180);       // east → south → west
  const sun = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  // A full moon rises as the sun sets (the feasts of Passover and Tabernacles
  // fell at full moon), a little lower in the sky.
  const mel = -el * 0.85, maz = az + Math.PI;
  const moon = new THREE.Vector3(Math.sin(maz) * Math.cos(mel), Math.sin(mel), -Math.cos(maz) * Math.cos(mel)).normalize();
  const day = THREE.MathUtils.smoothstep(sun.y, -0.02, 0.3);
  const night = 1 - THREE.MathUtils.smoothstep(sun.y, -0.2, -0.02);
  return { sun, moon, el, day, night };
}

// --- Noise textures -------------------------------------------------------------
function hash3(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Tileable value noise (period p) and Worley distance, for an N³ grid.
function valueNoise3(N, p, seed) {
  const out = new Float32Array(N * N * N);
  const s = p / N;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x * s, fy = y * s, fz = z * s;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;
    const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty), uz = tz * tz * (3 - 2 * tz);
    const h = (a, b, c) => hash3(((ix + a) % p + p) % p, ((iy + b) % p + p) % p, ((iz + c) % p + p) % p, seed);
    const x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * ux, x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * ux;
    const x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * ux, x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * ux;
    const y0 = x00 + (x10 - x00) * uy, y1 = x01 + (x11 - x01) * uy;
    out[(z * N + y) * N + x] = y0 + (y1 - y0) * uz;
  }
  return out;
}

function worley3(N, cells, seed) {
  const pts = new Float32Array(cells * cells * cells * 3);
  for (let i = 0; i < cells * cells * cells; i++) for (let k = 0; k < 3; k++) pts[i * 3 + k] = hash3(i, k, 7, seed);
  const out = new Float32Array(N * N * N);
  const s = cells / N;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x + 0.5) * s, fy = (y + 0.5) * s, fz = (z + 0.5) * s;
    const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy, gz = cz + dz;
      const wx = (gx % cells + cells) % cells, wy = (gy % cells + cells) % cells, wz = (gz % cells + cells) % cells;
      const k = ((wz * cells + wy) * cells + wx) * 3;
      const px = gx + pts[k] - fx, py = gy + pts[k + 1] - fy, pz = gz + pts[k + 2] - fz;
      const d = px * px + py * py + pz * pz;
      if (d < best) best = d;
    }
    out[(z * N + y) * N + x] = Math.min(1, Math.sqrt(best));
  }
  return out;
}

// Billowy cloud noise: Perlin-like fbm carved by inverted Worley cells.
function cloudNoise3D(N = 64) {
  const v1 = valueNoise3(N, 4, 1), v2 = valueNoise3(N, 8, 2), v3 = valueNoise3(N, 16, 3);
  const w1 = worley3(N, 4, 4), w2 = worley3(N, 8, 5), w3 = worley3(N, 16, 6);
  const data = new Uint8Array(N * N * N);
  for (let i = 0; i < data.length; i++) {
    const perlin = v1[i] * 0.57 + v2[i] * 0.29 + v3[i] * 0.14;
    const worley = (1 - w1[i]) * 0.62 + (1 - w2[i]) * 0.25 + (1 - w3[i]) * 0.13;
    const pw = Math.min(1, Math.max(0, (perlin - (1 - worley)) / Math.max(0.05, worley) * 0.5 + worley * 0.55));
    data[i] = Math.round(pw * 255);
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// Weather map: where clouds can form. Tileable fbm, clumped into fields.
export function weatherTexture(N = 256) {
  const data = new Uint8Array(N * N * 4);
  const oct = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]];
  const vn = (x, y, p, seed) => {
    const fx = x * p / N, fy = y * p / N;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
    const h = (a, b) => hash3((ix + a) % p, (iy + b) % p, 0, seed);
    const a0 = h(0, 0) + (h(1, 0) - h(0, 0)) * ux, a1 = h(0, 1) + (h(1, 1) - h(0, 1)) * ux;
    return a0 + (a1 - a0) * uy;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    oct.forEach(([p, a], k) => { v += vn(x, y, p, 11 + k) * a; });
    const i = (y * N + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.round(Math.min(1, v) * 255);
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// --- Volumetric clouds -----------------------------------------------------------
const MARCH = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D noiseTex;
uniform sampler2D cloudMap;
uniform sampler2D prevTex;
uniform mat4 invProjView;
uniform mat4 prevProjView;
uniform vec3 camPos;
uniform vec3 lightDir;
uniform vec3 lightCol;
uniform vec3 ambTop;
uniform vec3 ambLow;
uniform vec3 hazeCol;
uniform float cloudTime;
uniform float cloudCover;
uniform float cloudBase;
uniform float cloudTop;
uniform float frame;
uniform float history;
varying vec2 vUv;

float weather(vec2 xz) {
  return texture2D(cloudMap, xz / 24000.0 + vec2(cloudTime * 0.00025, cloudTime * 0.0001)).r;
}
float density(vec3 p, bool fine) {
  float h = (p.y - cloudBase) / (cloudTop - cloudBase);
  if (h < 0.0 || h > 1.0) return 0.0;
  float cov = smoothstep(cloudCover, cloudCover + 0.22, weather(p.xz));
  if (cov < 0.01) return 0.0;
  float shapeH = smoothstep(0.0, 0.14, h) * (1.0 - smoothstep(0.45 + 0.4 * cov, 1.0, h));
  vec3 q = p / 2600.0 + vec3(cloudTime * 0.0021, 0.0, cloudTime * 0.0009);
  float base = texture(noiseTex, q).r * shapeH;
  float d = clamp((base - (1.0 - cov)) / max(cov, 0.05), 0.0, 1.0);
  if (fine && d > 0.0) {
    float det = texture(noiseTex, q * 4.7 + vec3(0.0, cloudTime * 0.004, 0.0)).r;
    d = clamp(d - (1.0 - det) * (0.32 - 0.18 * h), 0.0, 1.0);
  }
  return d;
}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

void main() {
  vec4 wp = invProjView * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(wp.xyz / wp.w - camPos);
  float t0, t1;
  if (camPos.y < cloudBase) {
    if (dir.y < 0.004) { gl_FragColor = vec4(0.0); return; }
    t0 = (cloudBase - camPos.y) / dir.y; t1 = (cloudTop - camPos.y) / dir.y;
  } else if (camPos.y > cloudTop) {
    if (dir.y > -0.004) { gl_FragColor = vec4(0.0); return; }
    t0 = (cloudTop - camPos.y) / dir.y; t1 = (cloudBase - camPos.y) / dir.y;
  } else {
    t0 = 0.0; t1 = dir.y > 0.0 ? (cloudTop - camPos.y) / max(dir.y, 1e-3) : (cloudBase - camPos.y) / min(dir.y, -1e-3);
  }
  if (t0 > 70000.0) { gl_FragColor = vec4(0.0); return; }
  t1 = min(t1, t0 + 16000.0);
  const int STEPS = 40;
  float stepLen = (t1 - t0) / float(STEPS);
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy + frame * vec2(5.588238, 3.12345), vec2(0.06711056, 0.00583715))));
  float cosA = dot(dir, lightDir);
  float phase = mix(hg(cosA, 0.62), hg(cosA, -0.25), 0.28) * 12.566;
  float T = 1.0;
  vec3 L = vec3(0.0);
  float tHit = t1;
  const float SIGMA = 0.035;
  for (int i = 0; i < STEPS; i++) {
    float t = t0 + (float(i) + jitter) * stepLen;
    vec3 p = camPos + dir * t;
    float d = density(p, true);
    if (d > 0.002) {
      tHit = min(tHit, t);
      float ld = 0.0;
      for (int j = 0; j < 5; j++) ld += density(p + lightDir * (float(j) + 0.5) * 110.0, false);
      float sunT = exp(-ld * 110.0 * SIGMA * 0.6);
      float powder = 1.0 - exp(-d * 6.0);
      float h = clamp((p.y - cloudBase) / (cloudTop - cloudBase), 0.0, 1.0);
      vec3 S = lightCol * sunT * phase * mix(1.0, powder, 0.5) + mix(ambLow, ambTop, h);
      float e = d * SIGMA;
      float Ts = exp(-e * stepLen);
      L += T * S * (1.0 - Ts);
      T *= Ts;
      if (T < 0.02) break;
    }
  }
  float a = 1.0 - T;
  // Thin with distance into the haze of the horizon.
  float haze = 1.0 - exp(-tHit / 30000.0);
  L = mix(L, hazeCol * a, haze);
  a *= 1.0 - smoothstep(0.75, 1.0, haze);
  L *= 1.0 - smoothstep(0.75, 1.0, haze);
  vec4 cur = vec4(L, a);
  // Blend with last frame, reprojected, to smooth the jitter.
  vec4 prev = prevProjView * vec4(camPos + dir * (t0 + t1) * 0.5, 1.0);
  vec2 puv = prev.xy / prev.w * 0.5 + 0.5;
  if (history > 0.0 && prev.w > 0.0 && all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0)))) {
    cur = mix(cur, texture2D(prevTex, puv), history);
  }
  gl_FragColor = cur;
}`;

export class VolumetricClouds {
  constructor(renderer, weather) {
    this.renderer = renderer;
    this.noise = cloudNoise3D(64);
    const rt = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rts = [rt(), rt()];
    this.flip = 0;
    this.frame = 0;
    this.prevPV = new THREE.Matrix4();
    this.u = {
      noiseTex: { value: this.noise }, cloudMap: { value: weather }, prevTex: { value: null },
      invProjView: { value: new THREE.Matrix4() }, prevProjView: { value: new THREE.Matrix4() },
      camPos: { value: new THREE.Vector3() }, lightDir: { value: new THREE.Vector3(0, 1, 0) }, lightCol: { value: new THREE.Color(1, 1, 1) },
      ambTop: { value: new THREE.Color(0.5, 0.6, 0.75) }, ambLow: { value: new THREE.Color(0.35, 0.33, 0.3) }, hazeCol: { value: new THREE.Color(0.7, 0.75, 0.8) },
      cloudTime: clouds.cloudTime, cloudCover: clouds.cloudCover, cloudBase: { value: 1700 }, cloudTop: { value: 3300 },
      frame: { value: 0 }, history: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: MARCH,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // Drawn behind everything: only where nothing else covers the sky.
    this.composite = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tClouds: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
      fragmentShader: `uniform sampler2D tClouds; varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tClouds, vUv);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    }));
    this.composite.frustumCulled = false;
    this.composite.renderOrder = -1;
    this.composite.name = 'clouds';
    this.composite.layers.set(1);
    this.scale = 0.5;
  }

  setSize(w, h) {
    for (const rt of this.rts) rt.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale)));
    this.u.history.value = 0;
  }

  render(camera) {
    const u = this.u;
    const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.invProjView.value.copy(pv).invert();
    u.prevProjView.value.copy(this.prevPV);
    u.camPos.value.copy(camera.position);
    u.frame.value = this.frame++ % 64;
    const src = this.rts[this.flip], dst = this.rts[1 - this.flip];
    u.prevTex.value = src.texture;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(dst);
    r.render(this.scene, this.ortho);
    r.setRenderTarget(prev);
    this.flip = 1 - this.flip;
    this.composite.material.uniforms.tClouds.value = dst.texture;
    this.prevPV.copy(pv);
    u.history.value = 0.82;
  }
}

// --- Stars and moon ---------------------------------------------------------------
export function buildStars(count = 2600) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let s = 12345;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos.set([r * Math.cos(a), z, r * Math.sin(a)], i * 3);
    const b = 0.35 + Math.pow(rand(), 3) * 1.6, tint = rand();
    col.set([b * (tint < 0.2 ? 0.8 : 1), b * 0.95, b * (tint > 0.85 ? 0.75 : 1.05)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(g, m);
  stars.frustumCulled = false;
  stars.renderOrder = -2;
  stars.scale.setScalar(60000);
  // The sky turns about the celestial pole, due north and 31.8° up.
  const axis = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT)).normalize();
  stars.userData.follow = (cam, hours, night) => {
    stars.position.copy(cam.position);
    stars.quaternion.setFromAxisAngle(axis, hours / 24 * Math.PI * 2);
    m.opacity = night;
    stars.visible = night > 0.01;
  };
  return stars;
}

export function buildMoon() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 40, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,250,1)');
  grd.addColorStop(0.92, 'rgba(240,238,228,1)');
  grd.addColorStop(1, 'rgba(240,238,228,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(150,150,145,0.35)';
  for (const [x, y, r] of [[50, 46, 16], [78, 58, 12], [62, 84, 18], [40, 72, 9], [86, 82, 8]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(2.2, 2.2, 2.1), transparent: true, depthWrite: false, fog: false }));
  moon.renderOrder = -2;
  moon.userData.follow = (cam, dir, night) => {
    moon.position.copy(cam.position).addScaledVector(dir, 40000);
    moon.scale.setScalar(700);
    moon.visible = night > 0.02 && dir.y > -0.05;
    moon.material.opacity = Math.min(1, night * 1.5);
  };
  return moon;
}
