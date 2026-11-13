// Birds and wild animals, small life near the viewer, and the dust and chaff
// the afternoon wind lifts. Every creature is an instance of one of a few
// shapes whose wings, legs, necks and tails are posed in the vertex shader
// from a handful of numbers per instance; the CPU only places each one (a
// few hundred matrices a frame). Insects, dust and chaff move entirely in
// the shader. Species and behaviour follow the birds and beasts the Bible
// names in and around Jerusalem, in spring (Ezek 40:1, the first month).
import * as THREE from 'three';
import { terrainY, rng, insidePolygon, distToLine, cityPoly, LATE_POLY } from './terrain.js';
import { STREETS, ROADS, GATES, KINGS_GARDEN, BASE_Y } from './data.js';

const TAU = Math.PI * 2;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mod = (a, n) => ((a % n) + n) % n;
const within = (h, a, b) => (a < b ? h >= a && h < b : h >= a || h < b);
const BIT = { early: 1, late: 2, ruin: 4 };
const ALL = 7;

// Shared by every material here: the clock, how big a pixel is, and the wind.
const U = {
  fTime: { value: 0 }, fPx: { value: 0.0013 }, fWind: { value: 0.3 }, fWinnow: { value: 0 },
  fDevil: { value: 0 }, fLight: { value: 1 }, fBug: { value: 1 },
};

// --- Shaders -------------------------------------------------------------------------
const BASIS = /* glsl */ `
vec3 basisR(vec3 f) { vec3 r = cross(vec3(0.0, 1.0, 0.0), f); float l = length(r); return l > 1e-4 ? r / l : vec3(1.0, 0.0, 0.0); }
vec3 bCol;`;

// A bird facing +z, body length 1. aB = (part, s, c, side): the part, and
// where on it the vertex lies (wing: s along the span, c across the chord).
const BIRD_GLSL = /* glsl */ `
attribute vec4 aB;
attribute vec4 iA;      // wing: half-span, chord, taper, sweep
attribute vec4 iB;      // tail length, tail fork, neck length, leg length
attribute vec4 iC;      // beak length, plumpness, splayed primaries, head size
attribute vec4 iD;      // -, pecking, legs trailing in flight, bill and leg colour
attribute vec4 iAnim;   // wing or stride phase, amplitude, dihedral, folded
attribute vec3 iCol2;   // flight feathers and tail
attribute vec3 iCol3;   // belly and face
uniform float fTime;
uniform float fPx;
${BASIS}
void birdShape(out vec3 p, out vec3 n) {
  float part = aB.x;
  float fat = iC.y;
  float bw = 0.16 * fat, bh = 0.17 * fat;
  float fold = iAnim.w;
  vec3 col1 = instanceColor;
  float bk = iD.w;
  vec3 horn = bk < 0.5 ? vec3(0.05, 0.045, 0.04) : bk < 1.5 ? vec3(0.62, 0.07, 0.03) : bk < 2.5 ? vec3(0.72, 0.46, 0.12) : vec3(0.6, 0.3, 0.3);
  vec3 iPos = instanceMatrix[3].xyz;
  float seed = fract(sin(dot(iPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float peck = iD.y * pow(max(0.0, sin(fTime * (1.1 + seed) + seed * 40.0)), 6.0);
  vec3 nd = normalize(mix(vec3(0.0, -0.05, 1.0), mix(vec3(0.0, 0.8, 0.6), vec3(0.0, -0.75, 0.66), peck), fold));
  vec3 hf = normalize(mix(vec3(0.0, -0.12, 1.0), mix(vec3(0.0, -0.05, 1.0), vec3(0.0, -0.9, 0.45), peck), fold));
  float headR = 0.13 * iC.w;
  vec3 neckBase = vec3(0.0, 0.05 * fat, 0.36);
  vec3 headC = neckBase + nd * (iB.z + headR * 0.45);
  if (part < 0.5) {                       // body
    vec3 s = vec3(bw, bh, 0.5);
    p = position * s;
    n = normalize(position / s);
    bCol = mix(iCol3, col1, smoothstep(-0.35, 0.35, position.y));
  } else if (part < 1.5) {                // head
    p = headC + position * headR;
    n = position;
    bCol = mix(col1, iCol3, step(0.55, dot(position, hf)) * 0.5);
  } else if (part < 2.5) {                // bill
    vec3 hr = basisR(hf), hu = cross(hf, hr);
    p = headC + hf * (headR * 0.8 + position.z * iC.x) + (hr * position.x + hu * position.y) * headR * 0.32;
    n = normalize(hr * position.x + hu * position.y + hf * 0.2);
    bCol = horn;
  } else if (part < 3.5) {                // tail, forked or wedged
    float u = aB.y, v = aB.z;
    vec3 td = normalize(vec3(0.0, mix(0.04, -0.5, fold), -1.0));
    float tl = iB.x * (1.0 + iB.y * (abs(u) * 1.4 - 0.5));
    float w = mix(0.07 * fat, 0.08 + 0.3 * iB.x, v);
    p = vec3(0.0, 0.02 * fat, -0.4) + td * tl * v + vec3(u * w, 0.0, 0.0);
    n = cross(vec3(1.0, 0.0, 0.0), td);
    bCol = mix(col1, iCol2, 0.3 + 0.6 * v);
  } else if (part < 5.5) {                // wing panel (4) or the splayed primaries (5)
    float side = sign(aB.w);
    float fing = iC.z;
    float hasF = step(0.01, fing);
    float S, c;
    if (part < 4.5) { S = aB.y * mix(1.0, 0.8, hasF); c = aB.z; }
    else {
      float k = abs(aB.w) - 1.0;
      float ck = (k + 0.5) / 4.0;
      ck = mix(ck, (ck - 0.5) * 1.3 + 0.5, aB.y);
      c = mix(0.5, ck + (aB.z - 0.5) * mix(0.25, 0.13, fing) * (1.0 - 0.4 * aB.y), hasF);
      S = mix(1.0, 0.8 + 0.2 * aB.y, hasF);
    }
    float span = iA.x;
    float ch = iA.y * (1.0 - iA.z * S * S);
    float lead = iA.y * 0.35 - iA.w * S * S * span * 0.45;
    float z = lead - c * ch;
    float d = S * span, de = 0.42 * span;
    // Inner and outer wing beat a little out of step, so the wing bends.
    float th1 = iAnim.z + iAnim.y * sin(iAnim.x);
    float th2 = th1 + iAnim.y * 0.5 * sin(iAnim.x - 0.9) - 0.05;
    float d1 = min(d, de), d2 = max(d - de, 0.0);
    vec3 fl = vec3(side * (bw * 0.6 + d1 * cos(th1) + d2 * cos(th2)), 0.07 * fat + d1 * sin(th1) + d2 * sin(th2),
                   0.06 + z + 0.08 * iAnim.y * d * cos(iAnim.x));
    float th = d > de ? th2 : th1;
    vec3 fo = vec3(side * (bw + 0.012), 0.1 * fat - c * 0.24 * fat, 0.22 - S * min(0.5 * span, 1.0));
    p = mix(fl, fo, fold);
    n = normalize(mix(vec3(-side * sin(th), cos(th), 0.0), vec3(side, 0.0, 0.0), fold));
    bCol = mix(col1, iCol2, part > 4.5 ? 1.0 : max(smoothstep(0.4, 0.95, c), smoothstep(0.55, 0.95, S)));
  } else if (part < 6.5) {                // neck
    vec3 nr = basisR(nd), nu = cross(nd, nr);
    p = neckBase + nd * position.y * (iB.z + headR * 0.3) + (nr * position.x + nu * position.z) * 0.075 * fat;
    n = normalize(nr * position.x + nu * position.z);
    bCol = col1;
  } else {                                // legs: tucked, trailing (storks) or striding
    float side = sign(aB.w);
    float sw = iAnim.y * 0.6 * sin(iAnim.x + (side > 0.0 ? 0.0 : 3.14159)) * fold;
    vec3 ld = normalize(mix(vec3(0.0, -0.3, -1.0), vec3(0.0, -cos(sw), sin(sw)), fold));
    float len = iB.w * mix(iD.z, 1.0, fold);
    p = vec3(side * 0.045 * fat, -0.1 * fat, -0.02) + ld * (-position.y) * len + vec3(position.x, 0.0, position.z) * 0.022;
    n = normalize(vec3(position.x, 0.0, position.z) + 1e-4);
    bCol = horn;
  }
  // A bird in the air is never drawn smaller than a few pixels across, so a
  // vulture a kilometre off is still a speck against the sky.
  float L = length(instanceMatrix[0].xyz);
  float k = clamp(distance(iPos, cameraPosition) * fPx * 3.0 / max(L * (2.0 * iA.x + 0.3), 1e-5), 1.0, 4.0);
  p *= mix(k, 1.0, fold);
}`;

// A four-legged animal facing +z, body length 1, standing on y = 0.
const BEAST_GLSL = /* glsl */ `
attribute vec4 aB;
attribute vec4 iA;      // body depth, leg length, neck length, head size
attribute vec4 iB;      // muzzle length, ear length, tail length, tail thickness
attribute vec4 iC;      // horn length, horn curl, sprawl (lizards), tail angle
attribute vec4 iAnim;   // stride phase, stride amplitude, head down, tail wag
attribute vec3 iCol2;   // belly and legs
attribute vec3 iCol3;   // head
uniform float fTime;
${BASIS}
void beastShape(out vec3 p, out vec3 n) {
  float part = aB.x;
  float bh = iA.x, sprawl = iC.z;
  float bw = bh * mix(0.8, 1.5, sprawl);
  float bob = 0.05 * iAnim.y * abs(sin(iAnim.x)) * bh;
  float hip = iA.y + bh * 0.5;
  vec3 bc = vec3(0.0, hip + bob, 0.0);
  float hd = iAnim.z;
  vec3 up0 = normalize(mix(vec3(0.0, 0.75, 0.66), vec3(0.0, 0.2, 1.0), sprawl));
  vec3 nd = normalize(mix(up0, vec3(0.0, -0.8, 0.6), hd));
  vec3 hf = normalize(mix(mix(vec3(0.0, -0.3, 1.0), vec3(0.0, 0.0, 1.0), sprawl), vec3(0.0, -0.95, 0.3), hd));
  vec3 hr = basisR(hf), hu = cross(hf, hr);
  float hs = iA.w;
  vec3 nb = bc + vec3(0.0, bh * 0.35, 0.4);
  vec3 headC = nb + nd * (iA.z + hs * 0.15);
  if (part < 0.5) {                       // body
    vec3 s = vec3(bw, bh, 0.5);
    p = bc + position * s;
    n = normalize(position / s);
    bCol = mix(iCol2, instanceColor, smoothstep(-0.55, 0.0, position.y));
  } else if (part < 1.5) {                // neck
    vec3 nr = basisR(nd), nu = cross(nd, nr);
    float r = bh * 0.5 * (1.0 - 0.3 * position.y);
    p = nb + nd * position.y * (iA.z + hs * 0.2) + (nr * position.x + nu * position.z) * r;
    n = normalize(nr * position.x + nu * position.z);
    bCol = instanceColor;
  } else if (part < 2.5) {                // head
    vec3 q = position * vec3(0.55, 0.6, 1.0) * hs * 0.5;
    p = headC + hr * q.x + hu * q.y + hf * q.z;
    n = normalize(hr * position.x / 0.55 + hu * position.y / 0.6 + hf * position.z);
    bCol = iCol3;
  } else if (part < 3.5) {                // muzzle, dark at the nose
    p = headC + hf * (hs * 0.3 + position.z * iB.x) + (hr * position.x + hu * position.y) * hs * 0.22;
    n = normalize(hr * position.x + hu * position.y + 1e-4);
    bCol = mix(iCol3 * 0.8, vec3(0.05, 0.04, 0.035), step(0.9, position.z));
  } else if (part < 4.5) {                // ears
    float side = aB.w;
    vec3 eb = headC + hu * hs * 0.22 - hf * hs * 0.12 + hr * side * hs * 0.16;
    vec3 ed = normalize(hu + hr * side * 0.4 - hf * 0.25);
    vec3 ex = normalize(cross(ed, hf));
    p = eb + ed * position.y * iB.y + (hf * position.z + ex * position.x) * iB.y * 0.32;
    n = normalize(ex * position.x + hf * position.z + 1e-4);
    bCol = instanceColor;
  } else if (part < 5.5) {                // legs, trotting in diagonal pairs
    float idx = aB.w;
    float sx = (idx < 0.5 || (idx > 1.5 && idx < 2.5)) ? 1.0 : -1.0;
    float front = idx < 1.5 ? 1.0 : -1.0;
    float sw = iAnim.y * 0.55 * sin(iAnim.x + ((idx < 0.5 || idx > 2.5) ? 0.0 : 3.14159));
    vec3 hp = vec3(sx * bw * 0.55, hip, front * 0.3);
    vec3 ld = normalize(vec3(sx * sprawl * 1.3, -1.0, 0.0));
    ld = vec3(ld.x, ld.y * cos(sw), -ld.y * sin(sw));
    float len = hp.y / max(-ld.y, 0.2);
    p = hp + ld * (-position.y) * len + vec3(position.x, 0.0, position.z) * bh * mix(0.16, 0.28, sprawl);
    n = normalize(vec3(position.x, 0.0, position.z) + 1e-4);
    bCol = mix(instanceColor, iCol2, 0.5 + 0.4 * (-position.y));
  } else if (part < 6.5) {                // tail
    float wag = iAnim.w * sin(fTime * 9.0 + iAnim.x * 0.3);
    float a = iC.w;
    vec3 td = normalize(vec3(sin(wag) * 0.7, sin(a), -cos(a)));
    vec3 tr = basisR(td), tu = cross(td, tr);
    p = bc + vec3(0.0, bh * 0.25, -0.47) + td * position.y * iB.z + (tr * position.x + tu * position.z) * iB.w;
    n = normalize(tr * position.x + tu * position.z + 1e-4);
    bCol = mix(instanceColor, iCol2, step(0.85, position.y) * 0.7);
  } else {                                // horns, curving back over the neck
    float side = aB.w;
    float t = position.y;
    float curl = max(iC.y, 0.01);
    float R = iC.x / curl, a = t * curl;
    vec3 hb = headC + hu * hs * 0.26 + hr * side * hs * 0.12 - hf * hs * 0.02;
    vec3 c = hb + hu * (R * sin(a)) - hf * (R * (1.0 - cos(a))) + hr * side * t * iC.x * 0.25;
    vec3 T = normalize(hu * cos(a) - hf * sin(a));
    vec3 B2 = normalize(cross(T, hr));
    p = c + (hr * position.x + B2 * position.z) * hs * 0.09 * step(0.001, iC.x);
    n = normalize(hr * position.x + B2 * position.z + 1e-4);
    bCol = vec3(0.13, 0.11, 0.09);
  }
}`;

// Butterflies, bees and flies on looping paths round a point; ants along a line.
const INSECT_GLSL = /* glsl */ `
attribute vec4 aB;
attribute vec4 iI;      // centre, radius (ants: line length)
attribute vec4 iP;      // kind (+ heading for ants), phase, size, speed
uniform float fTime;
uniform float fBug;
${BASIS}
vec3 iPath(float m, float t, float r) {
  if (m < 0.5) return r * vec3(sin(t * 0.53) + 0.5 * sin(t * 1.31 + 1.7), 0.3 * sin(t * 1.7) + 0.2 * sin(t * 2.9), cos(t * 0.47) + 0.5 * cos(t * 1.13 + 0.4));
  if (m < 1.5) return r * vec3(sin(t * 1.3) + 0.3 * sin(t * 4.1), 0.35 * sin(t * 2.3), cos(t * 1.1) + 0.3 * cos(t * 3.7));
  return r * vec3(sin(t * 2.1) + 0.6 * sin(t * 5.3 + 1.0), 0.5 * sin(t * 3.3) + 0.3 * sin(t * 7.1), cos(t * 1.9) + 0.6 * cos(t * 4.7));
}
void insectShape(out vec3 p, out vec3 n) {
  float m = floor(iP.x);
  float size = iP.z * fBug;
  float t = fTime * iP.w + iP.y * 37.0;
  vec3 o, f;
  float flap;
  if (m < 2.5) {
    o = iPath(m, t, iI.w);
    f = normalize(iPath(m, t + 0.05, iI.w) - o + vec3(1e-5, 0.0, 0.0));
    flap = m < 0.5 ? 0.2 + 1.2 * (0.5 + 0.5 * sin(fTime * 11.0 + iP.y * 50.0)) : 0.25 + 0.35 * sin(fTime * 60.0 + iP.y * 50.0);
  } else {
    float a = fract(iP.x) * 10.0;
    f = vec3(cos(a), 0.0, sin(a));
    o = f * fract(fTime * 0.035 / iI.w + iP.y) * iI.w;
    flap = 0.0;
  }
  vec3 r = basisR(f), u = cross(f, r);
  vec3 lp, ln;
  if (aB.x < 0.5) {
    lp = position * vec3(0.14, 0.14, 0.5) * size * (m > 2.5 ? 1.6 : 1.0);
    ln = position;
    bCol = m < 0.5 ? vec3(0.08, 0.07, 0.06) : m < 1.5 ? vec3(0.35, 0.22, 0.05) : vec3(0.03);
  } else {
    float side = aB.w, s = aB.y, c = aB.z;
    float chord = m < 0.5 ? 0.95 - 0.3 * s : 0.4;
    lp = vec3(side * s * cos(flap), s * sin(flap), c * chord) * size * step(m, 2.5);
    ln = vec3(-side * sin(flap), cos(flap), 0.0);
    bCol = instanceColor;
  }
  p = iI.xyz + o + r * lp.x + u * lp.y + f * lp.z;
  n = normalize(r * ln.x + u * ln.y + f * ln.z);
}`;

// Chaff from the winnowing, and petals and leaves, tumbling east on the wind.
const FLAKE_GLSL = /* glsl */ `
attribute vec4 iE;      // where it starts, kind
attribute vec4 iQ;      // phase, life, size, spin
uniform float fTime;
uniform float fWind;
uniform float fWinnow;
vec3 bCol;
void flakeShape(out vec3 p, out vec3 n) {
  float age = fract(fTime / iQ.y + iQ.x);
  vec3 c = iE.xyz;
  float size = iQ.z;
  if (iE.w < 0.5) {
    // Tossed up with the fork, then carried off while the grain falls back.
    float up = 2.4 * sin(3.14159 * min(age * 1.7, 1.0)) * (1.0 - 0.5 * age);
    c += vec3(age * iQ.y * (0.4 + 1.8 * fWind), up, sin(age * 9.0 + iQ.x * 40.0) * 0.7 * age);
    size *= fWinnow;
  } else {
    c += vec3(age * iQ.y * (0.25 + 1.2 * fWind), -age * 4.5, sin(age * 11.0 + iQ.x * 30.0) * 0.5);
  }
  size *= smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.92, 1.0, age));
  float a1 = fTime * iQ.w + iQ.x * 20.0, a2 = fTime * iQ.w * 0.7 + iQ.x * 9.0;
  float c1 = cos(a1), s1 = sin(a1), c2 = cos(a2), s2 = sin(a2);
  vec3 q = position * size;
  q = vec3(q.x, q.y * c1, q.y * s1);
  q = vec3(q.x * c2 + q.z * s2, q.y, -q.x * s2 + q.z * c2);
  vec3 nn = vec3(0.0, -s1, c1);
  nn = vec3(nn.x * c2 + nn.z * s2, nn.y, -nn.x * s2 + nn.z * c2);
  p = c + q;
  n = nn;
  bCol = instanceColor;
}`;

// Soft dust puffs, always facing the camera.
const DUST_GLSL = /* glsl */ `
attribute vec4 iE;      // where it rises, kind: 0 road, 1 threshing floor, 2 dust devil
attribute vec4 iQ;      // phase, life, size, opacity
uniform float fTime;
uniform float fWind;
uniform float fWinnow;
uniform float fDevil;
uniform float fLight;
varying vec2 vDuv;
varying float vDa;`;
const DUST_PROJECT = /* glsl */ `
  float age = fract(fTime / iQ.y + iQ.x);
  vec3 c = iE.xyz;
  float sz, a;
  if (iE.w < 1.5) {
    float gust = iE.w < 0.5 ? fWind : fWinnow;
    c += vec3(age * iQ.y * (0.6 + 2.4 * fWind), 0.2 + age * iQ.z * 0.9, sin(age * 5.0 + iQ.x * 30.0) * 1.2);
    sz = iQ.z * (0.45 + age * 1.2);
    a = iQ.w * sin(3.14159 * age) * gust;
  } else {
    float h = age * 24.0;
    float ang = fTime * 3.2 + iQ.x * 50.0 + h * 0.25;
    float r = 0.5 + h * 0.2;
    c += vec3(cos(ang) * r + h * 0.25, h, sin(ang) * r);
    sz = iQ.z * (0.6 + h * 0.06);
    a = iQ.w * fDevil * (1.0 - age) * smoothstep(0.0, 0.08, age);
  }
  vec4 mvPosition = viewMatrix * vec4(c, 1.0);
  mvPosition.xy += position.xy * sz;
  gl_Position = projectionMatrix * mvPosition;
  vDuv = position.xy;
  vDa = a * fLight;`;

// Extend a built-in material: the shape function sets position, normal and colour.
// With `grain`, feathers and fur get a broken, streaky shading instead of flat
// colour: value noise over the part's own coordinates (wings are banded along
// the span, so the flight feathers read as separate feathers).
const GRAIN_FRAG = /* glsl */ `
varying vec3 vGrain;
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
function shaped(mat, decl, fn, key, grain = false) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${decl}${grain ? '\nvarying vec3 vGrain;' : ''}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\nvec3 fP, fN;\n${fn}(fP, fN);\nvColor.rgb = bCol;${grain ? '\nvGrain = position * vec3(7.0, 9.0, 7.0) + vec3(aB.y * 26.0, aB.z * 3.0, aB.x * 1.7);' : ''}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = fN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = fP;');
    if (grain) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GRAIN_FRAG}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float gr = gNoise(vGrain) * 0.65 + gNoise(vGrain * 2.7 + 5.0) * 0.35;
          diffuseColor.rgb *= 0.74 + 0.4 * gr;`);
    }
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

function dustMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.78, 0.68, 0.53), transparent: true, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DUST_GLSL}`)
      .replace('#include <project_vertex>', DUST_PROJECT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDuv;\nvarying float vDa;\nuniform float fLight;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.a *= vDa * (1.0 - smoothstep(0.1, 0.5, length(vDuv)));
        if (diffuseColor.a < 0.002) discard;
        diffuseColor.rgb *= 0.35 + 0.65 * fLight;`);
  };
  m.customProgramCacheKey = () => 'fauna-dust-v1';
  return m;
}

// --- Geometry ------------------------------------------------------------------------
// Concatenate parts, each tagged per vertex with [part, a, b, c] for the shader.
function pack(list) {
  const P = [], N = [], B = [];
  for (const [g0, fn] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      P.push(x, y, z);
      N.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      B.push(...fn(x, y, z));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('aB', new THREE.Float32BufferAttribute(B, 4));
  return geo;
}
const tube = (r0, r1, seg, segH = 1, up = true) => {
  const g = new THREE.CylinderGeometry(r1, r0, 1, seg, segH, true);
  g.translate(0, up ? 0.5 : -0.5, 0);
  return g;
};

function birdGeometry(low) {
  const L = [];
  L.push([new THREE.SphereGeometry(1, low ? 6 : 8, low ? 4 : 6), () => [0, 0, 0, 0]]);
  L.push([new THREE.SphereGeometry(1, low ? 5 : 6, 4), () => [1, 0, 0, 0]]);
  const bill = new THREE.ConeGeometry(1, 1, 4, 1, true);
  bill.translate(0, 0.5, 0);
  bill.rotateX(Math.PI / 2);
  L.push([bill, () => [2, 0, 0, 0]]);
  L.push([new THREE.PlaneGeometry(1, 1, 4, 1), (x, y) => [3, x * 2, y + 0.5, 0]]);
  for (const side of [1, -1]) {
    L.push([new THREE.PlaneGeometry(1, 1, low ? 3 : 4, 2), (x, y) => [4, x + 0.5, y + 0.5, side]]);
    for (let k = 0; k < 4; k++) L.push([new THREE.PlaneGeometry(1, 1), (x, y) => [5, x + 0.5, y + 0.5, side * (k + 1)]]);
    L.push([tube(1, 1, 3, 1, false), () => [7, 0, 0, side]]);
  }
  L.push([tube(1, 1, 5), () => [6, 0, 0, 0]]);
  return pack(L);
}

function beastGeometry(low) {
  const L = [];
  L.push([new THREE.SphereGeometry(1, low ? 7 : 9, low ? 5 : 6), () => [0, 0, 0, 0]]);
  L.push([tube(1, 1, 5), () => [1, 0, 0, 0]]);
  L.push([new THREE.SphereGeometry(1, 7, 5), () => [2, 0, 0, 0]]);
  const muzzle = new THREE.CylinderGeometry(0.55, 1, 1, 5, 1, false);
  muzzle.translate(0, 0.5, 0);
  muzzle.rotateX(Math.PI / 2);
  L.push([muzzle, () => [3, 0, 0, 0]]);
  for (const side of [1, -1]) {
    const ear = new THREE.ConeGeometry(1, 1, 4, 1, true);
    ear.translate(0, 0.5, 0);
    L.push([ear, () => [4, 0, 0, side]]);
    L.push([tube(1, 0.25, 4, low ? 3 : 5), (x, y) => [7, y, 0, side]]);
  }
  for (let i = 0; i < 4; i++) L.push([tube(1, 0.6, 4, 1, false), () => [5, 0, 0, i]]);
  L.push([tube(1, 0.3, 4), () => [6, 0, 0, 0]]);
  return pack(L);
}

function insectGeometry() {
  const L = [[new THREE.OctahedronGeometry(1), () => [0, 0, 0, 0]]];
  for (const side of [1, -1]) L.push([new THREE.PlaneGeometry(1, 1), (x, y) => [1, x + 0.5, y, side]]);
  return pack(L);
}

// Instances start hidden (zero matrices). Their shapes move in the shader,
// so the bounds three.js would cache are useless: cull nothing.
function instanced(geo, mat, n, attrs) {
  for (const [k, s] of Object.entries(attrs)) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * s), s);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(k, a);
  }
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.array.fill(0);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  m.frustumCulled = false;
  m.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return m;
}

// A click on an instance opens the card of its species: main.js reads the
// instance's matrix just before it reads userData.infoId.
function infoPerInstance(mesh, ids, fallback) {
  let last = -1;
  const get = mesh.getMatrixAt.bind(mesh);
  mesh.getMatrixAt = (i, out) => { last = i; return get(i, out); };
  Object.defineProperty(mesh.userData, 'infoId', { get: () => (last >= 0 && ids[last]) || fallback, enumerable: true });
}

// Rotation (yaw about y, then pitch, then bank about the body axis), scale, position.
function writeBasis(e, o, s, px, py, pz, yaw, pitch, bank) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fx = sy * cp, fy = sp, fz = cy * cp;
  let xx = cy, xy = 0, xz = -sy;
  let yx = fy * xz - fz * xy, yy = fz * xx - fx * xz, yz = fx * xy - fy * xx;
  if (bank) {
    const cb = Math.cos(bank), sb = Math.sin(bank);
    const ax = xx * cb + yx * sb, ay = xy * cb + yy * sb, az = xz * cb + yz * sb;
    yx = yx * cb - xx * sb; yy = yy * cb - xy * sb; yz = yz * cb - xz * sb;
    xx = ax; xy = ay; xz = az;
  }
  e[o] = xx * s; e[o + 1] = xy * s; e[o + 2] = xz * s; e[o + 3] = 0;
  e[o + 4] = yx * s; e[o + 5] = yy * s; e[o + 6] = yz * s; e[o + 7] = 0;
  e[o + 8] = fx * s; e[o + 9] = fy * s; e[o + 10] = fz * s; e[o + 11] = 0;
  e[o + 12] = px; e[o + 13] = py; e[o + 14] = pz; e[o + 15] = 1;
}
// Forward f and an up hint u (a lizard on a wall: up is the wall's normal).
function writeFrame(e, o, s, px, py, pz, fx, fy, fz, ux, uy, uz) {
  let xx = uy * fz - uz * fy, xy = uz * fx - ux * fz, xz = ux * fy - uy * fx;
  const l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = fy * xz - fz * xy, yy = fz * xx - fx * xz, yz = fx * xy - fy * xx;
  e[o] = xx * s; e[o + 1] = xy * s; e[o + 2] = xz * s; e[o + 3] = 0;
  e[o + 4] = yx * s; e[o + 5] = yy * s; e[o + 6] = yz * s; e[o + 7] = 0;
  e[o + 8] = fx * s; e[o + 9] = fy * s; e[o + 10] = fz * s; e[o + 11] = 0;
  e[o + 12] = px; e[o + 13] = py; e[o + 14] = pz; e[o + 15] = 1;
}
const hide = (e, o) => { for (let k = 0; k < 16; k++) e[o + k] = 0; };

// --- Species -------------------------------------------------------------------------
// Proportions are in body lengths (L, metres). Wing: half-span, chord, taper,
// sweep. Tail length and fork, neck, legs. Bill, plumpness, splayed primaries,
// head. Colours: back, flight feathers and tail, belly. tint: bill and legs
// (0 dark, 1 red, 2 yellow, 3 pink). rate: wingbeats (radians a second).
const BIRDS = {
  dove: { L: 0.2, a: [1.6, 0.52, 0.55, 0.35], b: [0.55, -0.1, 0.06, 0.22], c: [0.07, 1.1, 0, 0.8], col: [0x8d929c, 0x45474d, 0xb0b4bb], tint: 3, rate: 34, amp: 0.85, pitch: 0.3, peck: 0.3, info: 'fauna-dove' },
  swallow: { L: 0.09, a: [1.7, 0.4, 0.85, 0.7], b: [0.9, 1.0, 0, 0.1], c: [0.04, 0.85, 0, 0.9], col: [0x1d2433, 0x161a22, 0xe8dcc8], tint: 0, rate: 40, amp: 0.75, pitch: 0.4, info: 'fauna-swallow' },
  swift: { L: 0.1, a: [2.0, 0.28, 0.9, 0.9], b: [0.4, 0.6, 0, 0.05], c: [0.03, 0.85, 0, 0.9], col: [0x2a2622, 0x221f1c, 0x3a3530], tint: 0, rate: 50, amp: 0.5, pitch: 0.3, info: 'fauna-swallow' },
  sparrow: { L: 0.09, a: [1.3, 0.5, 0.5, 0.2], b: [0.6, 0.1, 0.02, 0.3], c: [0.08, 1.15, 0, 1.0], col: [0x7a5a3a, 0x3b2a1c, 0xb9b2a4], tint: 0, rate: 70, amp: 0.9, pitch: 0.35, peck: 0.9, info: 'fauna-sparrow' },
  stork: { L: 0.5, a: [2.1, 0.62, 0.15, 0.0], b: [0.35, -0.2, 0.55, 1.3], c: [0.42, 1.0, 0.7, 0.7], col: [0xf0eee8, 0x111111, 0xf4f2ec], tint: 1, trail: 1, rate: 11, amp: 0.5, pitch: 0.05, info: 'fauna-stork' },
  vulture: { L: 0.6, a: [2.25, 0.85, 0.1, 0.0], b: [0.3, -0.3, 0.12, 0.4], c: [0.12, 1.3, 1.0, 0.8], col: [0x9c7a52, 0x2e2117, 0xb08c62], tint: 0, rate: 7.5, amp: 0.3, dih: 0.15, pitch: 0.45, peck: 0.4, info: 'fauna-vulture' },
  eagle: { L: 0.5, a: [1.9, 0.68, 0.2, 0.05], b: [0.5, -0.1, 0.08, 0.35], c: [0.1, 1.15, 0.8, 0.9], col: [0x6b4f36, 0x2c2118, 0xd8d0c0], tint: 2, rate: 9, amp: 0.35, dih: 0.08, pitch: 0.4, info: 'fauna-eagle' },
  raven: { L: 0.33, a: [1.75, 0.6, 0.3, 0.1], b: [0.55, -0.45, 0.1, 0.35], c: [0.15, 1.0, 0.5, 0.9], col: [0x111214, 0x0b0b0c, 0x151618], tint: 0, rate: 20, amp: 0.65, pitch: 0.35, peck: 0.5, info: 'fauna-raven' },
  partridge: { L: 0.2, a: [1.25, 0.55, 0.45, 0.15], b: [0.3, 0, 0.08, 0.45], c: [0.07, 1.5, 0, 0.9], col: [0x8b8174, 0x6b4a32, 0xc9b58f], tint: 1, rate: 70, amp: 0.9, pitch: 0.1, peck: 0.5, info: 'fauna-partridge' },
  chicken: { L: 0.3, a: [1.1, 0.55, 0.4, 0.1], b: [0.6, 0.3, 0.2, 0.6], c: [0.07, 1.5, 0, 0.9], col: [0x8a4a22, 0x1e2a1e, 0xa0602a], tint: 2, rate: 50, amp: 0.9, pitch: 0.15, peck: 0.8, info: 'fauna-rooster' },
  owl: { L: 0.15, a: [1.8, 0.65, 0.35, 0.1], b: [0.25, 0, 0, 0.3], c: [0.05, 1.5, 0.2, 1.6], col: [0x6e5a44, 0x4a3a2a, 0xb8a888], tint: 2, rate: 22, amp: 0.7, pitch: 1.0, info: 'fauna-owl' },
  bat: { L: 0.06, a: [2.0, 0.6, 0.35, 0.25], b: [0.3, 0, 0, 0], c: [0.01, 0.9, 0, 0.9], col: [0x3a2e26, 0x2a211b, 0x4a3c30], tint: 0, rate: 55, amp: 1.0, pitch: 0, info: 'fauna-bat' },
};

// Body length L; depth, legs, neck, head | muzzle, ears, tail, tail thickness |
// horns, curl, sprawl, tail angle. Colours: back, belly and legs, head.
const BEASTS = {
  dog: { L: 0.75, a: [0.17, 0.5, 0.22, 0.32], b: [0.2, 0.13, 0.4, 0.05], c: [0, 0, 0, 0.9], col: [0xb8955e, 0xe0d0b0, 0xb08a55], walk: 1.1, info: 'fauna-dog' },
  fox: { L: 0.6, a: [0.15, 0.42, 0.2, 0.3], b: [0.22, 0.17, 0.62, 0.11], c: [0, 0, 0, -0.25], col: [0xb36a33, 0xe6e0d6, 0xb87038], walk: 1.2, info: 'fauna-fox' },
  gazelle: { L: 0.9, a: [0.17, 0.8, 0.35, 0.3], b: [0.2, 0.15, 0.15, 0.04], c: [0.32, 0.6, 0, -1.0], col: [0xb48a5c, 0xf2ede4, 0xa98057], walk: 0.9, info: 'fauna-gazelle' },
  ibex: { L: 1.1, a: [0.2, 0.62, 0.3, 0.32], b: [0.18, 0.1, 0.12, 0.05], c: [0.75, 2.4, 0, 0.5], col: [0x9a8062, 0xd6c8b0, 0x6e5a44], walk: 0.8, info: 'fauna-ibex' },
  hyrax: { L: 0.45, a: [0.24, 0.13, 0.05, 0.38], b: [0.08, 0.05, 0.0, 0.0], c: [0, 0, 0.15, 0], col: [0x7a6a58, 0xb0a08a, 0x6e5f50], walk: 0.6, info: 'fauna-hyrax' },
  lizard: { L: 0.18, a: [0.1, 0.12, 0.05, 0.3], b: [0.2, 0.0, 1.4, 0.07], c: [0, 0, 1, -0.1], col: [0x6e6658, 0xa89c88, 0x5f6878], walk: 1.2, info: 'fauna-lizard' },
};

// --- Bird behaviour ------------------------------------------------------------------
// Each role gives a bird's position at time t as a function of t alone, so
// flight is smooth at any frame rate; heading and bank come from where the
// bird was a moment earlier.
function perch(b, o) {
  o.x = b.px; o.y = b.py; o.z = b.pz; o.yaw = b.pyaw; o.pitch = b.sp.pitch;
  o.fold = 1; o.amp = 0; o.dih = 0; o.rate = 0;
  return true;
}

// Doves: rest on their roofs, then the whole flock takes off, wheels round
// its quarter of the city and comes back (Isa 60:8).
function roleFlock(b, t, o) {
  const g = b.g;
  if (!g.on) return false;
  const u = mod(t + g.t0, g.P);
  let w = 0;
  if (g.fly && u < g.F) w = sm(b.d0, b.d0 + 3, u) * (1 - sm(g.F - 7 + b.d1, g.F - 1.5 + b.d1 * 0.5, u));
  if (w < 0.002) return perch(b, o);
  const tl = t - b.lag;
  const ang = g.w * tl + g.phi;
  const R = g.R * (1 + 0.28 * Math.sin(tl * 0.13 + g.phi));
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const ox = b.ox * ca - b.oz * sa + 2.5 * Math.sin(t * 0.8 + b.k1 * 9);
  const oz = b.ox * sa + b.oz * ca + 2.5 * Math.cos(t * 0.7 + b.k2 * 9);
  const fx = g.hx + ca * R + ox, fz = g.hz + sa * R + oz;
  const fy = g.fy + 7 * Math.sin(tl * 0.21 + g.phi) + b.oy + 1.5 * Math.sin(t * 1.1 + b.k3 * 9);
  const e = w * w * (3 - 2 * w);
  o.x = b.px + (fx - b.px) * e; o.y = b.py + (fy - b.py) * e; o.z = b.pz + (fz - b.pz) * e;
  o.fold = 1 - sm(0, 0.1, w);
  const glide = w > 0.95 && Math.sin(t * 0.55 + b.k1 * 7) > 0.5;
  o.amp = glide ? 0.06 : b.sp.amp; o.dih = glide ? 0.4 : 0.1; o.rate = b.sp.rate;
  o.yaw = b.pyaw; o.pitch = 0;
  return true;
}

// Swallows, swifts and bats: fast loops round a point, low over the roofs.
function roleDart(b, t, o) {
  const g = b.g;
  if (!g.on) return false;
  o.x = g.x + g.R * (0.65 * Math.sin(b.f1 * t + b.p1) + 0.35 * Math.sin(b.f2 * t + b.p2));
  o.z = g.z + g.R * (0.65 * Math.cos(b.f3 * t + b.p3) + 0.35 * Math.sin(b.f4 * t + b.p4));
  o.y = g.y + g.H * (0.5 + 0.5 * Math.sin(b.f5 * t + b.p5));
  const glide = Math.sin(t * 1.4 + b.p1 * 5) > 0.25;
  o.fold = 0; o.amp = glide ? 0.04 : b.sp.amp; o.dih = glide ? 0.05 : 0; o.rate = b.sp.rate;
  return true;
}

// Sparrows: hop about a spot, pecking; now and then the little party flits on.
function roleHop(b, t, o) {
  const g = b.g;
  if (!g.on || g.n === 0) return false;
  const tt = t + g.ph;
  const m = Math.floor(tt / g.T), u = tt - m * g.T;
  const a = mod(m - 1, g.n), c = mod(m, g.n);
  const d = b.k2 * 0.6;
  const tb = t + b.k1 * 10, per = b.per2;
  const k = Math.floor(tb / per), f = (tb - k * per) / per;
  const jx = b.ox + (hash(k * 7.13 + b.seed) - 0.5) * 0.8, jz = b.oz + (hash(k * 3.71 + b.seed) - 0.5) * 0.8;
  const px = b.ox + (hash((k - 1) * 7.13 + b.seed) - 0.5) * 0.8, pz = b.oz + (hash((k - 1) * 3.71 + b.seed) - 0.5) * 0.8;
  if (g.n > 1 && u >= d && u < d + 1.4) {
    const q = (u - d) / 1.4, e = q * q * (3 - 2 * q);
    const x0 = g.sx[a] + b.ox, z0 = g.sz[a] + b.oz, x1 = g.sx[c] + b.ox, z1 = g.sz[c] + b.oz;
    const dist = Math.hypot(x1 - x0, z1 - z0);
    o.x = x0 + (x1 - x0) * e; o.z = z0 + (z1 - z0) * e;
    o.y = g.sy[a] + (g.sy[c] - g.sy[a]) * e + (1 + dist * 0.2) * Math.sin(Math.PI * q) + b.lift;
    o.fold = 0; o.amp = b.sp.amp; o.dih = 0; o.rate = b.sp.rate; o.yaw = 0; o.pitch = 0;
    return true;
  }
  const s = u < d ? a : c;
  const q = Math.min(1, f / 0.18);
  o.x = g.sx[s] + px + (jx - px) * q; o.z = g.sz[s] + pz + (jz - pz) * q;
  o.y = g.sy[s] + b.lift + 0.1 * Math.sin(Math.PI * q);
  o.yaw = Math.atan2(jx - px, jz - pz); o.pitch = b.sp.pitch;
  o.fold = 1; o.amp = 0; o.rate = 0; o.dih = 0;
  return true;
}

// Vultures and eagles: circling on a thermal by day, on the cliffs otherwise.
function roleSoar(b, t, o) {
  const g = b.g;
  if (!g.on) return false;
  if (!b.active) return b.py > -1e8 ? perch(b, o) : false;
  const cx = g.x + 40 * Math.sin(t * 0.011 + g.ph), cz = g.z + 40 * Math.cos(t * 0.009 + g.ph);
  const a = b.w * t + b.p1;
  o.x = cx + b.r * Math.cos(a); o.z = cz + b.r * Math.sin(a);
  o.y = g.y + b.yo + 35 * Math.sin(t * 0.017 + b.p2);
  const flap = Math.sin(t * 0.05 + b.p3) > 0.96;
  o.fold = 0; o.amp = flap ? b.sp.amp : 0; o.dih = b.sp.dih; o.rate = b.sp.rate;
  return true;
}

// Storks: loose lines gliding north, high up, with a few wingbeats now and then.
function roleLine(b, t, o) {
  const g = b.g;
  if (!g.on) return false;
  const d = (t - g.t0) * g.v - b.back;
  o.x = g.x + g.dx * d - g.dz * b.lat + 5 * Math.sin(t * 0.23 + b.p1);
  o.z = g.z + g.dz * d + g.dx * b.lat + 5 * Math.sin(t * 0.19 + b.p2);
  o.y = g.y + b.yo + 4 * Math.sin(t * 0.17 + b.p3);
  const flap = Math.sin(t * 0.33 + b.p4) > 0.72;
  o.fold = 0; o.amp = flap ? b.sp.amp : 0.02; o.dih = -0.03; o.rate = b.sp.rate;
  return true;
}

// Ravens and owls: sit, then fly to another perch nearby; pairs keep together.
function rolePerch(b, t, o) {
  const g = b.g;
  if (!g.on || !b.n) return false;
  if (!g.awake && !g.sitOut) return false;
  const tt = t + b.t0 - b.lag;
  const k = Math.floor(tt / b.T), u = tt - k * b.T;
  const ia = Math.floor(hash((k - 1) * 3.7 + b.seed) * b.n), ib = Math.floor(hash(k * 3.7 + b.seed) * b.n);
  const F = b.F[ib + b.n * ia];
  if (!g.awake || ia === ib || u >= F) {
    o.x = b.qx[ib] + b.ox; o.y = b.qy[ib]; o.z = b.qz[ib] + b.oz; o.yaw = b.qyaw[ib]; o.pitch = b.sp.pitch;
    o.fold = 1; o.amp = 0; o.dih = 0; o.rate = 0;
    return true;
  }
  const q = u / F, e = q * q * (3 - 2 * q);
  const x0 = b.qx[ia] + b.ox, z0 = b.qz[ia] + b.oz, x1 = b.qx[ib] + b.ox, z1 = b.qz[ib] + b.oz;
  const dist = Math.hypot(x1 - x0, z1 - z0);
  o.x = x0 + (x1 - x0) * e + 3 * Math.sin(q * 7 + b.seed) * Math.sin(Math.PI * q);
  o.z = z0 + (z1 - z0) * e;
  o.y = b.qy[ia] + (b.qy[ib] - b.qy[ia]) * e + (6 + dist * 0.2) * Math.sin(Math.PI * q);
  o.fold = 1 - sm(0, 0.04, q) * (1 - sm(0.96, 1, q));
  const glide = Math.sin(t * 0.9 + b.seed) > 0.4;
  o.amp = glide ? 0.05 : b.sp.amp; o.dih = glide ? 0.12 : 0; o.rate = b.sp.rate; o.yaw = b.qyaw[ib]; o.pitch = 0;
  return true;
}

// Partridges, hens and birds at carrion: walk a few steps, peck, walk on.
function roleGround(b, t, o) {
  const g = b.g;
  if (!g.on || !g.n) return false;
  const tt = t + b.t0;
  const k = Math.floor(tt / b.T), u = (tt - k * b.T) / b.T;
  const s = b.spot % g.n;
  const hx = g.sx[s] + b.ox, hz = g.sz[s] + b.oz;
  const x0 = hx + (hash((k - 1) * 1.37 + b.seed) - 0.5) * 2 * g.R, z0 = hz + (hash((k - 1) * 2.71 + b.seed) - 0.5) * 2 * g.R;
  const x1 = hx + (hash(k * 1.37 + b.seed) - 0.5) * 2 * g.R, z1 = hz + (hash(k * 2.71 + b.seed) - 0.5) * 2 * g.R;
  const walking = u < b.wf;
  const q = walking ? u / b.wf : 1;
  o.x = x0 + (x1 - x0) * q; o.z = z0 + (z1 - z0) * q;
  o.y = (g.terrain ? terrainY(o.x, o.z) : g.sy[s]) + b.lift;
  o.yaw = Math.atan2(x1 - x0, z1 - z0); o.pitch = b.sp.pitch;
  o.fold = 1; o.dih = 0;
  o.amp = walking ? 0.7 : 0; o.rate = walking ? g.gait : 0;
  return true;
}

// --- The module ------------------------------------------------------------------------
export function build(mats, ctx) {
  const low = ctx.quality === 'low';
  const N = (n) => Math.max(1, Math.round(n * (low ? 0.5 : 1)));
  const rand = rng(5730);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const { houses, grids } = ctx.city;
  const group = new THREE.Group();
  group.name = 'fauna';

  // --- Where things can go ----------------------------------------------------------
  // Houses binned by 40 m cells, for finding roofs near a point.
  const CELL = 40;
  const binKey = (x, z) => Math.floor(x / CELL) * 100003 + Math.floor(z / CELL);
  const binHouses = (list) => {
    const m = new Map();
    for (const h of list) {
      const k = binKey(h.x, h.z);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(h);
    }
    return m;
  };
  const BINS = { late: binHouses(houses.late), early: binHouses(houses.early) };
  const housesNear = (period, x, z, r) => {
    const bins = BINS[period === 'early' ? 'early' : 'late'], out = [];
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const l = bins.get(i * 100003 + j);
        if (l) for (const h of l) if (Math.hypot(h.x - x, h.z - z) < r) out.push(h);
      }
    }
    return out;
  };
  // A point on a house in unit coordinates (x across the front, z back to front).
  const onHouse = (h, lx, lz, out) => {
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    out.x = h.x + c * lx * h.w + s * lz * h.d;
    out.z = h.z - s * lx * h.w + c * lz * h.d;
    return out;
  };
  // Where a bird sits on a house: on the parapet along a side, or on the
  // flat roof (or among the rubble of a burned one).
  const roofSpot = (h, ruin, onRoof, out) => {
    if (ruin) {
      onHouse(h, (rand() - 0.5) * 0.7, (rand() - 0.5) * 0.7, out);
      out.y = h.floor + 0.25;
    } else if (onRoof) {
      const C = h.type === 'C' && !low;
      onHouse(h, h.type === 'B' && !low ? 0.25 : (rand() - 0.5) * 0.5, C ? -0.26 : low ? (rand() - 0.5) * 0.5 : -0.34, out);
      out.y = h.floor + h.ht * (C ? 1.03 : 1.0);
    } else {
      const C = h.type === 'C' && !low;
      const side = h.type === 'B' && !low ? 1 : rand() < 0.5 ? -1 : 1;
      onHouse(h, side * 0.485, C ? -0.45 + rand() * 0.4 : -0.45 + rand() * 0.9, out);
      out.y = h.floor + h.ht * (C ? 1.2 : 1.17);
    }
    out.yaw = h.rot + (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.6 + Math.PI / 2 * (rand() < 0.5 ? 1 : 0);
    return out;
  };

  // Lane cells of the street grid that are not on a main street.
  const gridOf = (period) => grids[period === 'early' ? 'early' : 'late'];
  const streetsOf = (period) => STREETS[period === 'early' ? 'early' : 'late'];
  const onMainStreet = (period, x, z, m) => streetsOf(period).some((st) => distToLine(x, z, st.pts) < st.w / 2 + m);
  const laneAt = (period, x, z, lanesOnly) => {
    const g = gridOf(period);
    const i = Math.floor((x - g.bb.x0) / g.cell), j = Math.floor((z - g.bb.z0) / g.cell);
    if (i < 0 || j < 0 || i >= g.W || j >= g.D) return false;
    const v = g.occ[j * g.W + i];
    return lanesOnly ? v === 3 : v === 2 || v === 3;
  };
  const inCity = (period, x, z) => insidePolygon(x, z, cityPoly(period));
  // A spot on the ground near (x, z): a lane in the city, open ground outside.
  const groundSpot = (period, x, z, r, out, { lanes = true, wild = false } = {}) => {
    for (let n = 0; n < 40; n++) {
      const a = rand() * TAU, d = Math.sqrt(rand()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!ctx.free(px, pz, 4)) continue;
      if (inCity(period, px, pz)) {
        if (wild || !laneAt(period, px, pz, false) || (lanes && onMainStreet(period, px, pz, 1.5))) continue;
        out.x = px; out.z = pz; out.y = gridOf(period).at(px, pz);
        return true;
      }
      if (insidePolygon(px, pz, LATE_POLY) && period !== 'early') continue;
      out.x = px; out.z = pz; out.y = terrainY(px, pz);
      return true;
    }
    return false;
  };

  // Slopes sampled every 20 m: cliffs for vultures, hyraxes and ibex, hillsides
  // for partridges and gazelles.
  const SG = { x0: -1400, z0: -1300, st: 20, nx: 156, nz: 201 };
  const slopes = { x: [], z: [], s: [] };
  {
    const hs = new Float32Array(SG.nx * SG.nz);
    for (let j = 0; j < SG.nz; j++) for (let i = 0; i < SG.nx; i++) hs[j * SG.nx + i] = terrainY(SG.x0 + i * SG.st, SG.z0 + j * SG.st, 'square');
    for (let j = 1; j < SG.nz - 1; j++) for (let i = 1; i < SG.nx - 1; i++) {
      const k = j * SG.nx + i;
      const s = Math.hypot(hs[k + 1] - hs[k - 1], hs[k + SG.nx] - hs[k - SG.nx]) / (2 * SG.st);
      const x = SG.x0 + i * SG.st, z = SG.z0 + j * SG.st;
      if (s < 0.08 || insidePolygon(x, z, LATE_POLY) || !ctx.free(x, z, 20)) continue;
      slopes.x.push(x); slopes.z.push(z); slopes.s.push(s);
    }
  }
  const slopeNear = (x, z, r, s0, s1, out) => {
    const idx = [];
    for (let i = 0; i < slopes.x.length; i++) {
      if (slopes.s[i] < s0 || slopes.s[i] > s1) continue;
      if (Math.abs(slopes.x[i] - x) > r || Math.abs(slopes.z[i] - z) > r) continue;
      idx.push(i);
    }
    if (!idx.length) return false;
    const i = pick(idx);
    out.x = slopes.x[i] + (rand() - 0.5) * 16; out.z = slopes.z[i] + (rand() - 0.5) * 16;
    out.y = terrainY(out.x, out.z);
    out.s = slopes.s[i];
    return true;
  };
  const tmp = { x: 0, y: 0, z: 0, yaw: 0, s: 0 };

  // --- Birds ------------------------------------------------------------------------
  const birds = [];
  const flocks = [], darts = [], hops = [], kettles = [], lines = [], perchGroups = [], grounds = [];
  const addBird = (name, role, g, per, extra = {}) => {
    const sp = BIRDS[name];
    const b = {
      sp, name, role, g, per, slot: birds.length, ph: rand() * TAU, yaw: rand() * TAU,
      k1: rand(), k2: rand(), k3: rand(), seed: rand() * 1000,
      px: 0, py: -1e9, pz: 0, pyaw: 0, lift: (0.1 * sp.c[1] + sp.b[3]) * sp.L, ...extra,
    };
    birds.push(b);
    return b;
  };
  const setPerch = (b, x, y, z, yaw) => { b.px = x; b.py = y + b.lift; b.pz = z; b.pyaw = yaw; };

  // Doves: flocks over the city (none kept in 573 BC; one wild flock in the
  // Kidron cliffs, Song 2:14).
  const nFlocks = low ? 4 : 7, perFlock = low ? 12 : 16;
  for (let f = 0; f < nFlocks; f++) {
    const g = { on: false, fly: true, t0: rand() * 200, P: 80 + rand() * 70, F: 40 + rand() * 30, R: 45 + rand() * 40, w: (rand() < 0.5 ? -1 : 1) * (0.17 + rand() * 0.08), phi: rand() * TAU, hx: 0, hz: 0, fy: 0, members: [] };
    for (let i = 0; i < perFlock; i++) {
      const a = rand() * TAU, r = Math.sqrt(rand()) * 9;
      g.members.push(addBird('dove', roleFlock, g, ALL, { ox: Math.cos(a) * r, oz: Math.sin(a) * r * 0.6, oy: (rand() - 0.5) * 6, lag: rand() * 1.4, d0: rand() * 2.5, d1: rand() * 2.5 }));
    }
    flocks.push(g);
  }
  const homeFlock = (g, period) => {
    const ruin = period === 'ruin';
    let cx, cz, perches = [];
    if (ruin) {
      cx = 255; cz = 560;
      for (const b of g.members) {
        if (!slopeNear(cx, cz, 160, 0.25, 9, tmp)) slopeNear(cx, cz, 400, 0.12, 9, tmp);
        setPerch(b, tmp.x, tmp.y, tmp.z, rand() * TAU);
      }
    } else {
      const hs = period === 'early' ? houses.early : houses.late;
      let h0 = pick(hs);
      for (let n = 0; n < 20 && !ctx.free(h0.x, h0.z, 25); n++) h0 = pick(hs);
      cx = h0.x; cz = h0.z;
      perches = housesNear(period, cx, cz, 22).filter((h) => ctx.free(h.x, h.z, 6));
      if (!perches.length) perches = [h0];
      for (const b of g.members) {
        roofSpot(pick(perches), false, false, tmp);
        setPerch(b, tmp.x, tmp.y, tmp.z, tmp.yaw);
      }
    }
    g.hx = cx; g.hz = cz;
    // Wheel well above the roofs and the ground under the circle.
    let top = -1e9;
    for (const b of g.members) top = Math.max(top, b.py);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU, r = g.R * 1.35;
      top = Math.max(top, terrainY(cx + Math.cos(a) * r, cz + Math.sin(a) * r) + 8);
    }
    g.fy = top + 18 + rand() * 18;
  };

  // Swallows over the temple courts and the lanes near the viewer; swifts
  // higher over the whole city; bats at dusk.
  const addDarts = (name, n, g) => {
    for (let i = 0; i < n; i++) {
      const fr = () => (0.25 + rand() * 0.35) * g.k;
      addBird(name, roleDart, g, ALL, { f1: fr(), f2: fr() * 1.7, f3: fr(), f4: fr() * 1.9, f5: fr() * 0.8, p1: rand() * TAU, p2: rand() * TAU, p3: rand() * TAU, p4: rand() * TAU, p5: rand() * TAU });
    }
    darts.push(g);
    return g;
  };
  const courtY = Math.max(terrainY(65, 0, 'square'), BASE_Y) + 6;
  const swCourt = addDarts('swallow', N(12), { on: false, kind: 'court', x: 65, y: courtY, z: 10, R: 45, H: 14, k: 1, hours: [5.8, 19.4] });
  const swNear = [addDarts('swallow', N(10), { on: false, kind: 'near', x: 0, y: 0, z: 0, R: 28, H: 10, k: 1.1, hours: [5.8, 19.4] }),
    addDarts('swallow', N(10), { on: false, kind: 'near', x: 0, y: 0, z: 0, R: 35, H: 12, k: 0.9, hours: [5.8, 19.4] })];
  for (const [x, z] of [[20, 600], [-380, 600], [-250, 300]]) {
    addDarts('swift', N(8), { on: false, kind: 'swift', x, y: terrainY(x, z) + 35, z, R: 110, H: 45, k: 0.6, hours: [5.5, 19.7] });
  }
  const bats = addDarts('bat', N(12), { on: false, kind: 'near', x: 0, y: 0, z: 0, R: 18, H: 7, k: 1.4, hours: [19.0, 23.2], dawn: [4.0, 5.3], low: 3 });

  // Sparrows near the viewer: in the lanes, on the roofs.
  for (let i = 0; i < (low ? 3 : 6); i++) {
    const g = { on: false, n: 0, sx: new Float32Array(4), sy: new Float32Array(4), sz: new Float32Array(4), T: 9 + rand() * 8, ph: rand() * 50 };
    for (let k = 0; k < 5; k++) addBird('sparrow', roleHop, g, ALL, { ox: (rand() - 0.5) * 2, oz: (rand() - 0.5) * 2, per2: 0.7 + rand() * 0.9 });
    hops.push(g);
  }

  // Griffon vultures on thermals over the valleys; a few short-toed eagles;
  // in 573 BC a kettle over the ruined city and some on the ground there.
  const addKettle = (x, z, n, alt, per, eagles = 0) => {
    const g = { on: false, x, z, y: terrainY(x, z) + alt, ph: rand() * TAU, per };
    for (let i = 0; i < n + eagles; i++) {
      const eagle = i >= n;
      const r = eagle ? 110 + rand() * 60 : 35 + rand() * 60, v = 10 + rand() * 3;
      const b = addBird(eagle ? 'eagle' : 'vulture', roleSoar, g, per, { r, w: (i % 2 ? 1 : -1) * (rand() < 0.75 ? 1 : -1) * v / r, p1: rand() * TAU, p2: rand() * TAU, p3: rand() * TAU, yo: (eagle ? 120 : 0) + rand() * 120, active: false, h0: 9 + rand() * 1.4, h1: 16 + rand() * 1.3 });
      if (slopeNear(x, z, 500, 0.3, 9, tmp) || slopeNear(x, z, 800, 0.15, 9, tmp)) setPerch(b, tmp.x, tmp.y, tmp.z, rand() * TAU);
    }
    kettles.push(g);
    return g;
  };
  addKettle(280, 250, N(6), 170, ALL, 1);
  addKettle(-520, 1180, N(5), 150, ALL);
  addKettle(1250, 300, N(6), 200, ALL, 1);
  addKettle(420, 2300, N(6), 220, ALL, 1);
  addKettle(-150, 650, N(12), 110, BIT.ruin);

  // White storks passing north (Jer 8:7), placed round wherever the viewer is.
  for (let l = 0; l < (low ? 2 : 3); l++) {
    const g = { on: false, t0: -1, x: 0, z: 0, y: 0, dx: 0, dz: -1, v: 11 + rand() * 2, alt: 160 + rand() * 300 };
    const n = low ? 10 : 14;
    for (let i = 0; i < n; i++) addBird('stork', roleLine, g, ALL, { back: i * (14 + rand() * 10), lat: (i % 2 ? 1 : -1) * i * (5 + rand() * 4) * (rand() < 0.3 ? 0.2 : 1), yo: (rand() - 0.5) * 20, p1: rand() * TAU, p2: rand() * TAU, p3: rand() * TAU, p4: rand() * TAU });
    lines.push(g);
  }

  // Ravens in pairs; owls at night.
  const PERCHES = 6;
  const addPercher = (name, g, per, extra) => addBird(name, rolePerch, g, per, { n: 0, qx: new Float32Array(PERCHES), qy: new Float32Array(PERCHES), qz: new Float32Array(PERCHES), qyaw: new Float32Array(PERCHES), F: new Float32Array(PERCHES * PERCHES), ox: 0, oz: 0, lag: 0, t0: rand() * 300, T: 30 + rand() * 40, ...extra });
  const ravens = { on: true, awake: true, sitOut: true, members: [], hours: [6, 18.6] };
  for (let i = 0; i < N(24); i++) {
    const pair = i % 2 === 1 ? ravens.members[i - 1] : null;
    const b = addPercher('raven', ravens, ALL, pair ? { t0: pair.t0, T: pair.T, seed: pair.seed, lag: 0.7, ox: 1.2, oz: 0.6, pair } : {});
    ravens.members.push(b);
  }
  perchGroups.push(ravens);
  const owls = { on: true, awake: false, sitOut: false, members: [], hours: [18.6, 5.5] };
  for (let i = 0; i < (low ? 2 : 3); i++) owls.members.push(addPercher('owl', owls, ALL, { T: 50 + rand() * 60 }));
  perchGroups.push(owls);
  const placePerchers = (g, period, count, near) => {
    const ruin = period === 'ruin';
    g.members.forEach((b, i) => {
      if (i >= count) { b.n = 0; return; }
      if (b.pair) {
        Object.assign(b, { n: b.pair.n, qx: b.pair.qx, qy: b.pair.qy, qz: b.pair.qz, qyaw: b.pair.qyaw, F: b.pair.F });
        return;
      }
      const [cx, cz] = near(i);
      let n = 0;
      for (let k = 0; k < 40 && n < PERCHES; k++) {
        const roof = rand() < (ruin ? 0.7 : 0.45);
        if (roof) {
          const hs = housesNear(period, cx + (rand() - 0.5) * 300, cz + (rand() - 0.5) * 300, 60).filter((h) => ctx.free(h.x, h.z, 6));
          if (!hs.length) continue;
          roofSpot(pick(hs), ruin, false, tmp);
        } else {
          if (!slopeNear(cx, cz, 350, 0.2, 9, tmp)) continue;
          tmp.yaw = rand() * TAU;
        }
        b.qx[n] = tmp.x; b.qy[n] = tmp.y + b.lift; b.qz[n] = tmp.z; b.qyaw[n] = tmp.yaw;
        n++;
      }
      b.n = n;
      for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) b.F[c + n * a] = Math.max(4, Math.hypot(b.qx[c] - b.qx[a], b.qz[c] - b.qz[a]) / 9);
    });
  };

  // Partridges on the hillsides, hens in courtyards (late only), and birds at
  // carrion in the ruins (573 BC).
  const addGround = (name, groups, perGroup, per, opts) => {
    const list = [];
    for (let i = 0; i < groups; i++) {
      const g = { on: false, n: 0, sx: new Float32Array(1), sy: new Float32Array(1), sz: new Float32Array(1), R: opts.R, gait: opts.gait, terrain: opts.terrain, per };
      for (let k = 0; k < perGroup; k++) addBird(name, roleGround, g, per, { spot: 0, ox: (rand() - 0.5) * opts.spread, oz: (rand() - 0.5) * opts.spread, T: opts.T * (0.7 + rand() * 0.6), wf: opts.wf, t0: rand() * 50 });
      grounds.push(g);
      list.push(g);
    }
    return list;
  };
  const partridges = addGround('partridge', low ? 2 : 3, low ? 4 : 5, ALL, { R: 2.5, gait: 30, terrain: true, spread: 5, T: 5, wf: 0.45 });
  const hens = addGround('chicken', low ? 2 : 4, 3, BIT.late, { R: 0.7, gait: 16, terrain: false, spread: 1.2, T: 6, wf: 0.35 });
  const carrion = [...addGround('vulture', low ? 1 : 2, 4, BIT.ruin, { R: 2.5, gait: 8, terrain: false, spread: 4, T: 9, wf: 0.2 }),
    ...addGround('raven', low ? 1 : 2, 3, BIT.ruin, { R: 2, gait: 14, terrain: false, spread: 4, T: 6, wf: 0.3 })];

  // --- Bird mesh ---
  const nB = birds.length;
  const birdMat = shaped(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide }), BIRD_GLSL, 'birdShape', 'fauna-bird-v1', true);
  const birdMesh = instanced(birdGeometry(low), birdMat, nB, { iA: 4, iB: 4, iC: 4, iD: 4, iAnim: 4, iCol2: 3, iCol3: 3 });
  birdMesh.name = 'fauna-birds';
  {
    const G = birdMesh.geometry.attributes, c = new THREE.Color();
    for (const b of birds) {
      const s = b.sp, i = b.slot;
      G.iA.array.set(s.a, i * 4); G.iB.array.set(s.b, i * 4); G.iC.array.set(s.c, i * 4);
      G.iD.array.set([0, s.peck || 0, s.trail || 0, s.tint], i * 4);
      // A little variety: no two birds quite the same shade.
      const v = 0.9 + rand() * 0.2;
      c.set(s.col[0]).multiplyScalar(v); birdMesh.instanceColor.array.set([c.r, c.g, c.b], i * 3);
      c.set(s.col[1]).multiplyScalar(v); G.iCol2.array.set([c.r, c.g, c.b], i * 3);
      c.set(s.col[2]).multiplyScalar(v); G.iCol3.array.set([c.r, c.g, c.b], i * 3);
      if (b.name === 'chicken' && i % 3 === 0) {          // a rooster: brighter, with a longer tail
        c.set(0xb4501e); birdMesh.instanceColor.array.set([c.r, c.g, c.b], i * 3);
        G.iB.array[i * 4] = 0.9;
      }
    }
  }
  infoPerInstance(birdMesh, birds.map((b) => b.sp.info), 'fauna-dove');
  group.add(birdMesh);

  // --- Animals on the ground ----------------------------------------------------------
  const beasts = [];
  const addBeast = (name, per, extra) => {
    const sp = BEASTS[name];
    const b = { sp, name, per, slot: beasts.length, x: 0, y: 0, z: 0, yaw: rand() * TAU, tx: 0, tz: 0, hx: 0, hz: 0, R: 10, state: 0, timer: rand() * 5, ph: rand() * TAU, hd: 0, on: false, gy: null, ok: null, lie: 0, speed: 0, ...extra };
    beasts.push(b);
    return b;
  };
  const wildOk = (x, z) => ctx.free(x, z, 6) && !insidePolygon(x, z, LATE_POLY);
  const terrainGround = (x, z) => terrainY(x, z);
  const place = (b, x, z) => { b.hx = b.x = b.tx = x; b.hz = b.z = b.tz = z; b.y = b.gy(x, z); b.state = 0; b.on = true; };

  // Street dogs: a pack at the refuse outside the Dung Gate, and others in the
  // lanes near the viewer (Ps 59:6, 14).
  const dung = GATES.find((g) => g.id === 'gate-dung').at;
  const DUMP = { x: dung[0] + 6, z: dung[1] + 38 };
  const dumpDogs = [];
  for (let i = 0; i < N(6); i++) {
    const b = addBeast('dog', BIT.late | BIT.ruin, { R: 18, gy: terrainGround, ok: wildOk, cull: 450 });
    place(b, DUMP.x + (rand() - 0.5) * 14, DUMP.z + (rand() - 0.5) * 10);
    dumpDogs.push(b);
  }
  const laneDogs = [];
  for (let i = 0; i < N(18); i++) laneDogs.push(addBeast('dog', ALL, { R: 9, cull: 260, near: true }));

  // Foxes in the vineyards (Song 2:15) and, after the fall, in the ruins (Lam 5:18).
  const VINES = [{ x0: -1000, x1: -450, z0: 920, z1: 1350 }, { x0: 320, x1: 720, z0: -700, z1: -160 }, { x0: -160, x1: 160, z0: 1180, z1: 1420 }];
  for (let i = 0; i < N(6); i++) {
    const v = VINES[i % VINES.length];
    const b = addBeast('fox', ALL, { R: 30, gy: terrainGround, ok: wildOk, cull: 400, night: true });
    for (let n = 0; n < 20; n++) {
      const x = v.x0 + rand() * (v.x1 - v.x0), z = v.z0 + rand() * (v.z1 - v.z0);
      if (wildOk(x, z)) { place(b, x, z); break; }
    }
  }
  const ruinFoxes = [];
  for (let i = 0; i < N(4); i++) ruinFoxes.push(addBeast('fox', BIT.ruin, { R: 12, cull: 300, near: true, night: true }));

  // Gazelles on the slopes east of the Mount of Olives; ibex on the cliffs of
  // the Kidron gorge toward the desert.
  const herds = [];
  const addHerd = (name, x, z, r, s0, s1, n) => {
    if (!slopeNear(x, z, r, s0, s1, tmp)) return;
    const cx = tmp.x, cz = tmp.z;
    for (let i = 0; i < n; i++) {
      const b = addBeast(name, ALL, { R: 22, gy: terrainGround, ok: wildOk, cull: 750, wild: true });
      place(b, cx + (rand() - 0.5) * 16, cz + (rand() - 0.5) * 16);
      b.hx = cx; b.hz = cz;
      herds.push(b);
    }
  };
  addHerd('gazelle', 1250, 150, 250, 0.06, 0.3, N(7));
  addHerd('gazelle', 1400, 800, 250, 0.06, 0.3, N(6));
  addHerd('gazelle', 1050, -600, 250, 0.06, 0.3, N(6));
  addHerd('ibex', 450, 2250, 300, 0.3, 9, N(5));
  addHerd('ibex', 200, 1750, 300, 0.3, 9, N(4));

  // Rock hyraxes and lizards near the viewer.
  const hyraxes = [];
  for (let i = 0; i < N(12); i++) hyraxes.push(addBeast('hyrax', ALL, { R: 3, gy: terrainGround, ok: wildOk, cull: 200, near: true }));
  const lizards = [];
  for (let i = 0; i < N(12); i++) lizards.push(addBeast('lizard', ALL, { cull: 60, near: true, wall: { bx: 0, by: 0, bz: 0, tx: 1, tz: 0, nx: 0, nz: 1, u: 0, v: 0, tu: 0, tv: 0, fu: 0, fv: 1, lo: 0, hi: 1 } }));

  const nQ = beasts.length;
  const beastMat = shaped(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), BEAST_GLSL, 'beastShape', 'fauna-beast-v1', true);
  const beastMesh = instanced(beastGeometry(low), beastMat, nQ, { iA: 4, iB: 4, iC: 4, iAnim: 4, iCol2: 3, iCol3: 3 });
  beastMesh.name = 'fauna-beasts';
  {
    const G = beastMesh.geometry.attributes, c = new THREE.Color();
    for (const b of beasts) {
      const s = b.sp, i = b.slot;
      G.iA.array.set(s.a, i * 4); G.iB.array.set(s.b, i * 4); G.iC.array.set(s.c, i * 4);
      const v = 0.85 + rand() * 0.3;
      // Street dogs vary from cream to dark tan.
      const back = b.name === 'dog' ? pick([0xb8955e, 0xcdb48a, 0x8a6a44, 0xd9c7a2, 0x6b5240]) : s.col[0];
      c.set(back).multiplyScalar(v); beastMesh.instanceColor.array.set([c.r, c.g, c.b], i * 3);
      c.set(s.col[1]).multiplyScalar(v); G.iCol2.array.set([c.r, c.g, c.b], i * 3);
      c.set(b.name === 'dog' ? back : s.col[2]).multiplyScalar(v); G.iCol3.array.set([c.r, c.g, c.b], i * 3);
      if (b.name === 'gazelle' && i % 3 === 0) G.iC.array[i * 4] = 0.2;   // does: shorter horns
    }
  }
  infoPerInstance(beastMesh, beasts.map((b) => b.sp.info), 'fauna-dog');
  beastMesh.castShadow = false;
  group.add(beastMesh);

  // --- Insects near the viewer ---------------------------------------------------------
  const BUGS = { butterfly: N(30), bee: N(20), fly: N(24), ant: N(20) };
  const nI = BUGS.butterfly + BUGS.bee + BUGS.fly + BUGS.ant;
  const insectMat = shaped(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), INSECT_GLSL, 'insectShape', 'fauna-insect-v1');
  const insectMesh = instanced(insectGeometry(), insectMat, nI, { iI: 4, iP: 4 });
  insectMesh.name = 'fauna-insects';
  insectMesh.raycast = () => {};
  {
    // Their matrices stay identity: the shader places them.
    const e = insectMesh.instanceMatrix.array;
    for (let i = 0; i < nI; i++) e[i * 16] = e[i * 16 + 5] = e[i * 16 + 10] = e[i * 16 + 15] = 1;
    const c = new THREE.Color();
    // Cabbage whites, clouded yellows, swallowtails and painted ladies, which
    // stream north through the land in spring.
    const wings = [0xf2f0e6, 0xeec54a, 0xf0dc80, 0xd9822b, 0xd9822b];
    for (let i = 0; i < nI; i++) {
      const kind = i < BUGS.butterfly ? 0 : i < BUGS.butterfly + BUGS.bee ? 1 : i < BUGS.butterfly + BUGS.bee + BUGS.fly ? 2 : 3;
      c.set(kind === 0 ? pick(wings) : kind === 1 ? 0xd8d4c8 : 0x9a9a9a);
      insectMesh.instanceColor.array.set([c.r, c.g, c.b], i * 3);
      insectMesh.geometry.attributes.iP.array.set([kind, rand(), 0, kind === 0 ? 0.8 + rand() * 0.5 : kind === 1 ? 1 + rand() * 0.6 : 1.2 + rand()], i * 4);
    }
  }
  group.add(insectMesh);

  // --- Dust, chaff and petals ----------------------------------------------------------
  // Points along the roads and main streets where the wind lifts dust.
  const road = { x: [], y: [], z: [], m: [] };
  const mask = (ps) => (ps || ['early', 'late', 'ruin']).reduce((m, p) => m | BIT[p], 0);
  for (const r of ROADS) {
    const m = mask(r.periods);
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 12);
      for (let k = 0; k < n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        if (Math.hypot(x, z - 300) > 2600) continue;
        road.x.push(x); road.y.push(terrainY(x, z)); road.z.push(z); road.m.push(m);
      }
    }
  }
  for (const [period, m] of [['late', BIT.late | BIT.ruin], ['early', BIT.early]]) {
    for (const st of STREETS[period]) for (let i = 0; i < st.pts.length - 1; i++) {
      const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 12);
      for (let k = 0; k < n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        road.x.push(x); road.y.push(gridOf(period).at(x, z)); road.z.push(z); road.m.push(m);
      }
    }
  }
  const floors = ctx.plan.floors.map((f) => ({ x: f.x, z: f.z, r: f.r, y: terrainY(f.x, f.z) + 0.2, m: insidePolygon(f.x, f.z, LATE_POLY) ? BIT.early : ALL }));

  const DUST = { road: N(110), floor: low ? 15 : 30, devil: N(36) };
  const nD = DUST.road + DUST.floor + DUST.devil;
  const dustMesh = instanced(new THREE.PlaneGeometry(1, 1), dustMaterial(), nD, { iE: 4, iQ: 4 });
  dustMesh.name = 'fauna-dust';
  dustMesh.raycast = () => {};
  dustMesh.renderOrder = 3;
  {
    const e = dustMesh.instanceMatrix.array;
    for (let i = 0; i < nD; i++) e[i * 16] = e[i * 16 + 5] = e[i * 16 + 10] = e[i * 16 + 15] = 1;
    const Q = dustMesh.geometry.attributes.iQ.array, E = dustMesh.geometry.attributes.iE.array;
    for (let i = 0; i < nD; i++) {
      const devil = i >= DUST.road + DUST.floor;
      Q.set(devil ? [i / DUST.devil, 3.2 + rand() * 0.6, 1.4 + rand(), 0.22] : [rand(), 4 + rand() * 4, 1.6 + rand() * 2.2, 0.07 + rand() * 0.08], i * 4);
      E[i * 4 + 3] = devil ? 2 : i >= DUST.road ? 1 : 0;
      E[i * 4 + 1] = -1e5;
    }
  }
  group.add(dustMesh);

  const FLAKE = { chaff: low ? 60 : 120, petal: N(60) };
  const nF = FLAKE.chaff + FLAKE.petal;
  const flakeMat = shaped(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }), FLAKE_GLSL, 'flakeShape', 'fauna-flake-v1');
  const flakeMesh = instanced(new THREE.PlaneGeometry(1, 0.55), flakeMat, nF, { iE: 4, iQ: 4 });
  flakeMesh.name = 'fauna-chaff';
  flakeMesh.raycast = () => {};
  {
    const e = flakeMesh.instanceMatrix.array, c = new THREE.Color();
    const Q = flakeMesh.geometry.attributes.iQ.array, E = flakeMesh.geometry.attributes.iE.array;
    for (let i = 0; i < nF; i++) {
      e[i * 16] = e[i * 16 + 5] = e[i * 16 + 10] = e[i * 16 + 15] = 1;
      const chaff = i < FLAKE.chaff;
      Q.set(chaff ? [rand(), 3 + rand() * 3, 0.025 + rand() * 0.03, 3 + rand() * 6] : [rand(), 5 + rand() * 5, 0.018 + rand() * 0.015, 2 + rand() * 4], i * 4);
      E.set([0, -1e5, 0, chaff ? 0 : 1], i * 4);
      c.set(chaff ? pick([0xd9c78f, 0xcbb478, 0xe4d6a6]) : pick([0xf6f0f0, 0xf3d9de, 0xffffff, 0x9fb070, 0xf3d9de]));
      flakeMesh.instanceColor.array.set([c.r, c.g, c.b], i * 3);
    }
  }
  group.add(flakeMesh);

  // --- Placing things for a period ----------------------------------------------------
  let period = null, bit = 0;
  const setPeriod = (p) => {
    period = p; bit = BIT[p];
    const ruin = p === 'ruin';
    const nOn = ruin ? 1 : p === 'early' ? Math.min(nFlocks, low ? 2 : 4) : nFlocks;
    flocks.forEach((g, i) => { g.on = i < nOn; if (g.on) homeFlock(g, p); });
    // Ravens: a few pairs round the edges of the city; many in the ruins.
    const nR = ruin ? ravens.members.length : Math.min(ravens.members.length, low ? 4 : 8);
    const RAVEN_HOMES = [[260, 400], [-560, 1100], [-150, 650], [60, 900], [-700, 400], [250, 700]];
    placePerchers(ravens, p, nR, (i) => (ruin ? [-250 + (rand() - 0.5) * 500, 600 + (rand() - 0.5) * 600] : RAVEN_HOMES[Math.floor(i / 2) % RAVEN_HOMES.length]));
    placePerchers(owls, p, owls.members.length, () => (ruin ? [-200 + (rand() - 0.5) * 400, 600 + (rand() - 0.5) * 400] : [260, 560]));
    for (const g of kettles) g.on = !!(g.per & bit);
    // Carrion birds in the ruins: in burned houses round the centre of the city.
    for (const g of carrion) {
      g.on = ruin;
      if (!ruin) continue;
      const hs = housesNear('late', -200 + (rand() - 0.5) * 300, 600 + (rand() - 0.5) * 300, 80).filter((h) => ctx.free(h.x, h.z, 6));
      if (!hs.length) { g.n = 0; continue; }
      const h = pick(hs);
      g.sx[0] = h.x; g.sz[0] = h.z; g.sy[0] = h.floor + 0.2; g.n = 1;
    }
    for (const g of [...hops, ...partridges, ...hens]) g.n = 0;
    for (const b of laneDogs) b.on = false;
    for (const b of ruinFoxes) b.on = false;
    for (const b of hyraxes) b.on = false;
    for (const b of lizards) b.on = false;
    pools.near.x = pools.bugs.x = pools.dust.x = 1e9;
  };

  // Pools that follow the viewer, refilled when the view moves on.
  const pools = { near: { x: 1e9, z: 0 }, bugs: { x: 1e9, z: 0 }, dust: { x: 1e9, z: 0 }, swallow: { x: 1e9, z: 0 } };
  const moved = (p, x, z, d) => Math.abs(p.x - x) > d || Math.abs(p.z - z) > d;

  const refillNear = (fx, fz) => {
    const ruin = period === 'ruin';
    const city = inCity(period, fx, fz);
    // Sparrows: each party gets four spots close together, on lanes and roofs.
    for (const g of hops) {
      g.n = 0;
      const hs = housesNear(period, fx, fz, 45).filter((h) => ctx.free(h.x, h.z, 6));
      if (!groundSpot(period, fx, fz, 45, tmp, { lanes: true })) continue;
      const cx = tmp.x, cz = tmp.z;
      for (let k = 0; k < 4; k++) {
        const roof = hs.length && rand() < 0.45;
        if (roof) {
          const near = hs.filter((h) => Math.hypot(h.x - cx, h.z - cz) < 25);
          roofSpot(pick(near.length ? near : hs), ruin, !ruin, tmp);
        } else if (!groundSpot(period, cx, cz, 14, tmp, { lanes: true })) continue;
        g.sx[g.n] = tmp.x; g.sy[g.n] = tmp.y; g.sz[g.n] = tmp.z; g.n++;
      }
    }
    // Hens in the courtyards of four-room houses (late only).
    if (period === 'late') {
      const yards = housesNear('late', fx, fz, 60).filter((h) => (h.type === 'A' || h.type === 'B') && ctx.free(h.x, h.z, 6));
      for (const g of hens) {
        g.n = 0;
        if (!yards.length) continue;
        const h = pick(yards);
        onHouse(h, 0, 0.16, tmp);
        g.sx[0] = tmp.x; g.sz[0] = tmp.z; g.sy[0] = h.floor + 0.02; g.n = 1;
        g.R = 0.08 * Math.min(h.w, h.d);
      }
    }
    // Partridges on open hillsides outside the walls.
    for (const g of partridges) {
      g.n = 0;
      if (slopeNear(fx, fz, 220, 0.08, 0.5, tmp) && !inCity(period, tmp.x, tmp.z)) { g.sx[0] = tmp.x; g.sz[0] = tmp.z; g.sy[0] = tmp.y; g.n = 1; }
    }
    // Dogs in the lanes, never on the main streets where the crowds walk.
    for (const b of laneDogs) {
      b.on = false;
      if (!(b.per & bit)) continue;
      if (!groundSpot(period, fx, fz, 70, tmp, { lanes: true })) continue;
      if (inCity(period, tmp.x, tmp.z)) {
        b.gy = gridOf(period).at;
        b.ok = (x, z) => ctx.free(x, z, 4) && laneAt(period, x, z, false) && !onMainStreet(period, x, z, 1.5);
      } else {
        b.gy = terrainGround;
        b.ok = (x, z) => ctx.free(x, z, 4);
      }
      if (ruin && rand() < 0.5) continue;           // fewer, feral, after the fall
      place(b, tmp.x, tmp.z);
    }
    for (const b of ruinFoxes) {
      b.on = false;
      if (!ruin || !groundSpot(period, fx, fz, 80, tmp, { lanes: false })) continue;
      b.gy = inCity(period, tmp.x, tmp.z) ? gridOf(period).at : terrainGround;
      b.ok = (x, z) => ctx.free(x, z, 4);
      place(b, tmp.x, tmp.z);
    }
    // Hyraxes in small groups on rocky slopes.
    for (let i = 0; i < hyraxes.length; i += 4) {
      const ok = slopeNear(fx, fz, 150, 0.3, 9, tmp);
      const cx = tmp.x, cz = tmp.z;
      for (let k = i; k < Math.min(i + 4, hyraxes.length); k++) {
        hyraxes[k].on = false;
        if (ok) place(hyraxes[k], cx + (rand() - 0.5) * 5, cz + (rand() - 0.5) * 5);
      }
    }
    // Lizards on the sunny walls of houses near the viewer.
    const walls = housesNear(period, fx, fz, 40).filter((h) => ctx.free(h.x, h.z, 6));
    for (const b of lizards) {
      b.on = false;
      if (!walls.length || !city) continue;
      const h = pick(walls), W = b.wall;
      const side = rand() < 0.5 ? 1 : -1;
      const C = h.type === 'C' && !low && !ruin;
      const lz = C ? -0.45 + rand() * 0.35 : -0.4 + rand() * 0.7;
      onHouse(h, side * (0.5 + 0.01 / h.w), lz, tmp);
      const c = Math.cos(h.rot), s = Math.sin(h.rot);
      W.nx = side * c; W.nz = -side * s; W.tx = s; W.tz = c;
      W.bx = tmp.x; W.bz = tmp.z;
      W.lo = h.floor + 0.3; W.hi = h.floor + (ruin ? 0.12 : 0.85) * h.ht;
      W.by = W.lo + rand() * Math.max(0, W.hi - W.lo);
      W.u = W.v = W.tu = W.tv = 0;
      W.fu = rand() - 0.5; W.fv = 1;
      b.on = true; b.timer = rand() * 4;
    }
  };

  const refillBugs = (fx, fz) => {
    const A = insectMesh.geometry.attributes, I = A.iI.array, Pp = A.iP.array;
    let i = 0;
    const put = (x, y, z, r, size) => { I.set([x, y, z, r], i * 4); Pp[i * 4 + 2] = size; i++; };
    const nearDump = Math.hypot(fx - DUMP.x, fz - DUMP.z) < 80 && period !== 'early';
    for (let k = 0; k < BUGS.butterfly; k++) {
      if (groundSpot(period, fx, fz, 35, tmp, { lanes: true })) put(tmp.x, tmp.y + 0.7, tmp.z, 1.2 + rand() * 2, 0.022 + rand() * 0.012);
      else put(0, -1e5, 0, 1, 0);
    }
    for (let k = 0; k < BUGS.bee; k++) {
      if (k % 5 === 0 && groundSpot(period, fx, fz, 30, tmp, { lanes: true })) Object.assign(tmp, { bx: tmp.x, by: tmp.y, bz: tmp.z });
      if (tmp.bx !== undefined) put(tmp.bx + (rand() - 0.5) * 2, tmp.by + 0.5, tmp.bz + (rand() - 0.5) * 2, 0.5 + rand() * 0.5, 0.007);
      else put(0, -1e5, 0, 1, 0);
    }
    for (let k = 0; k < BUGS.fly; k++) {
      if (nearDump) put(DUMP.x + (rand() - 0.5) * 8, terrainY(DUMP.x, DUMP.z) + 0.6, DUMP.z + (rand() - 0.5) * 6, 0.6, 0.0045);
      else if (k < BUGS.fly / 3 && groundSpot(period, fx, fz, 25, tmp, { lanes: true })) put(tmp.x, tmp.y + 0.5, tmp.z, 0.5, 0.0045);
      else put(0, -1e5, 0, 1, 0);
    }
    // A line of ants crossing open ground (Prov 6:6).
    const antOk = groundSpot(period, fx, fz, 10, tmp, { lanes: true });
    const ang = rand() * TAU;
    for (let k = 0; k < BUGS.ant; k++) {
      Pp[i * 4] = 3 + ang / 10; Pp[i * 4 + 1] = k / BUGS.ant;
      if (antOk) put(tmp.x, tmp.y + 0.01, tmp.z, 3, 0.004);
      else put(0, -1e5, 0, 1, 0);
    }
    A.iI.needsUpdate = A.iP.needsUpdate = true;
  };

  const refillDust = (fx, fz) => {
    const E = dustMesh.geometry.attributes.iE.array, F = flakeMesh.geometry.attributes.iE.array;
    const near = [];
    for (let i = 0; i < road.x.length; i++) if ((road.m[i] & bit) && Math.abs(road.x[i] - fx) < 380 && Math.abs(road.z[i] - fz) < 380) near.push(i);
    for (let k = 0; k < DUST.road; k++) {
      if (!near.length) { E[k * 4 + 1] = -1e5; continue; }
      const i = pick(near);
      E[k * 4] = road.x[i] + (rand() - 0.5) * 4; E[k * 4 + 1] = road.y[i]; E[k * 4 + 2] = road.z[i] + (rand() - 0.5) * 4;
    }
    // Winnowing at the three threshing floors nearest the view.
    const fl = floors.filter((f) => f.m & bit).map((f) => [Math.hypot(f.x - fx, f.z - fz), f]).filter(([d]) => d < 900).sort((a, b) => a[0] - b[0]).slice(0, 3).map(([, f]) => f);
    for (let k = 0; k < DUST.floor; k++) {
      const j = DUST.road + k, f = fl[k % 3];
      if (!f || (period === 'ruin' && k % 3 > 0)) { E[j * 4 + 1] = -1e5; continue; }
      E[j * 4] = f.x + (rand() - 0.5) * f.r; E[j * 4 + 1] = f.y; E[j * 4 + 2] = f.z + (rand() - 0.5) * f.r;
    }
    for (let k = 0; k < FLAKE.chaff; k++) {
      const f = fl[k % 3];
      if (!f || (period === 'ruin' && k % 3 > 0)) { F[k * 4 + 1] = -1e5; continue; }
      F[k * 4] = f.x + (rand() - 0.5) * f.r; F[k * 4 + 1] = f.y + 0.6; F[k * 4 + 2] = f.z + (rand() - 0.5) * f.r;
    }
    // Petals and leaves: in the King's Garden, and in the orchards by the view.
    const G = KINGS_GARDEN;
    for (let k = 0; k < FLAKE.petal; k++) {
      const j = FLAKE.chaff + k;
      let x, z, y;
      if (k % 2 === 0) { const a = rand() * TAU, r = Math.sqrt(rand()); x = G.x + Math.cos(a) * G.rx * r * 0.8; z = G.z + Math.sin(a) * G.rz * r * 0.8; y = terrainY(x, z); }
      else if (!inCity(period, fx, fz) && groundSpot(period, fx, fz, 40, tmp, { lanes: true })) { x = tmp.x; z = tmp.z; y = tmp.y; }
      else { F[j * 4 + 1] = -1e5; continue; }
      F[j * 4] = x; F[j * 4 + 1] = y + 3 + rand() * 2.5; F[j * 4 + 2] = z;
    }
    dustMesh.geometry.attributes.iE.needsUpdate = flakeMesh.geometry.attributes.iE.needsUpdate = true;
  };

  // --- Every frame -------------------------------------------------------------------
  const O = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fold: 1, amp: 0, dih: 0, rate: 0 };
  const Pv = { ...O }, Qv = { ...O };
  const DT = 0.12;
  let last = 0;

  // For tests: hold the creatures still at a given time.
  const debug = { time: null, birds, beasts };
  const update = (time0, dt0, env) => {
    if (!group.visible) return;
    const time = debug.time ?? time0;
    const dt = Math.min(Math.max(time - last, 0), 0.25);
    last = time;
    if (env.period !== period) setPeriod(env.period);
    const h = env.hours, cam = env.camera.position, focus = env.focus;
    const day = 1 - env.night;
    U.fTime.value = time;
    U.fPx.value = 2 * Math.tan((env.camera.fov * Math.PI) / 360) / 900;
    U.fLight.value = Math.max(0.05, day);
    U.fWind.value = (0.15 + 0.85 * sm(10.5, 13.5, h) * (1 - sm(18.5, 21, h))) * (0.3 + 0.7 * day);
    U.fWinnow.value = sm(13, 15, h) * (1 - sm(19, 20, h)) * (period === 'ruin' ? 0.5 : 1);
    U.fDevil.value = sm(10.5, 12, h) * (1 - sm(14.5, 16, h));
    U.fBug.value = sm(8, 9.5, h) * (1 - sm(17.5, 18.5, h));
    const camGround = terrainY(cam.x, cam.z);
    const camUp = cam.y - camGround;
    const camToFocus = Math.hypot(cam.x - focus.x, cam.y - focus.y, cam.z - focus.z);

    // Which birds are out at this hour.
    const fly = within(h, 6.3, 18.4);
    for (const g of flocks) g.fly = fly;
    ravens.awake = within(h, ...ravens.hours);
    owls.awake = within(h, ...owls.hours);
    owls.on = owls.awake || within(h, 17.8, 18.6);
    owls.sitOut = owls.on;
    for (const g of darts) {
      g.on = within(h, ...g.hours) || (g.dawn && within(h, ...g.dawn));
      if (g.kind === 'near') g.on = g.on && camToFocus < 400;
    }
    for (const g of kettles) if (g.per & bit) g.on = true;
    for (const b of birds) if (b.role === roleSoar) b.active = h > b.h0 && h < b.h1;
    for (const g of hops) g.on = within(h, 6, 18.8) && camToFocus < 160;
    for (const g of partridges) g.on = within(h, 6, 19) && camToFocus < 350;
    for (const g of hens) g.on = period === 'late' && within(h, 6, 18.5) && camToFocus < 250;

    // Swallows by the viewer move with the view.
    if (moved(pools.swallow, focus.x, focus.z, 150)) {
      pools.swallow.x = focus.x; pools.swallow.z = focus.z;
      const gy = inCity(period, focus.x, focus.z) ? gridOf(period).at(focus.x, focus.z) : terrainY(focus.x, focus.z);
      swNear.forEach((g, i) => { g.x = focus.x + (i ? 30 : -20); g.z = focus.z + (i ? -25 : 20); g.y = gy + 5 + i * 4; });
      bats.x = focus.x; bats.z = focus.z; bats.y = gy + 3;
    }
    // Storks: a line that has passed far beyond the viewer comes round again.
    for (const g of lines) {
      g.on = within(h, 7.5, 17.5);
      const ahead = (cam.x - g.x) * g.dx + (cam.z - g.z) * g.dz - (time - g.t0) * g.v;
      if (g.t0 < 0 || ahead < -3500 || ahead > 4500 || Math.abs((cam.x - g.x) * g.dz - (cam.z - g.z) * g.dx) > 3500) {
        const a = (rand() - 0.5) * 0.5;
        g.dx = Math.sin(a); g.dz = -Math.cos(a);           // north, a little east or west
        const back = g.t0 < 0 ? (rand() - 0.3) * 3000 : 2500 + rand() * 800;
        const side = (rand() - 0.5) * 2400;
        g.x = cam.x - g.dx * back - g.dz * side; g.z = cam.z - g.dz * back + g.dx * side;
        g.y = Math.max(terrainY(g.x, g.z), terrainY(cam.x, cam.z)) + g.alt;
        g.t0 = time;
      }
    }

    // Pools near the viewer.
    if (moved(pools.near, focus.x, focus.z, 35)) { pools.near.x = focus.x; pools.near.z = focus.z; refillNear(focus.x, focus.z); }
    if (moved(pools.bugs, focus.x, focus.z, 18)) { pools.bugs.x = focus.x; pools.bugs.z = focus.z; refillBugs(focus.x, focus.z); }
    if (moved(pools.dust, focus.x, focus.z, 90)) { pools.dust.x = focus.x; pools.dust.z = focus.z; refillDust(focus.x, focus.z); }
    insectMesh.visible = camToFocus < 70 && U.fBug.value > 0.01;

    // A dust devil on the desert side at midday.
    if (U.fDevil.value > 0) {
      const E = dustMesh.geometry.attributes.iE.array;
      const dx = 1380 + 180 * Math.sin(time * 0.004), dz = 450 + 300 * Math.sin(time * 0.0031 + 1);
      const dy = terrainY(dx, dz);
      for (let k = DUST.road + DUST.floor; k < nD; k++) { E[k * 4] = dx; E[k * 4 + 1] = dy; E[k * 4 + 2] = dz; }
      dustMesh.geometry.attributes.iE.needsUpdate = true;
    }

    // Birds.
    const M = birdMesh.instanceMatrix.array, An = birdMesh.geometry.attributes.iAnim.array;
    for (const b of birds) {
      const o = b.slot * 16;
      if (!(b.per & bit) || !b.role(b, time, O)) { hide(M, o); continue; }
      const L = b.sp.L;
      let yaw, pitch, bank = 0;
      if (O.fold < 0.5) {
        b.role(b, time - DT, Pv);
        b.role(b, time - 2 * DT, Qv);
        const fx = O.x - Pv.x, fy = O.y - Pv.y, fz = O.z - Pv.z;
        const hv = Math.hypot(fx, fz);
        yaw = hv > 1e-4 ? Math.atan2(fx, fz) : b.yaw;
        pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(fy, Math.max(hv, 1e-4))));
        const yaw0 = Math.atan2(Pv.x - Qv.x, Pv.z - Qv.z);
        let dy = yaw - yaw0;
        if (dy > Math.PI) dy -= TAU; else if (dy < -Math.PI) dy += TAU;
        const v = Math.hypot(hv, fy) / DT;
        bank = Math.max(-1.1, Math.min(1.1, -Math.atan((v * dy) / DT / 9.8)));
        b.yaw = yaw;
      } else {
        // A small bird sitting far off is less than a pixel: leave it out.
        const dx = O.x - cam.x, dz = O.z - cam.z, far = L * 1500;
        if (dx * dx + dz * dz > far * far) { hide(M, o); continue; }
        yaw = O.yaw; pitch = O.pitch;
      }
      b.ph = (b.ph + O.rate * dt) % (TAU * 64);
      writeBasis(M, o, L, O.x, O.y, O.z, yaw, pitch, bank);
      const a = b.slot * 4;
      An[a] = b.ph; An[a + 1] = O.amp; An[a + 2] = O.dih; An[a + 3] = O.fold;
    }
    birdMesh.instanceMatrix.needsUpdate = true;
    birdMesh.geometry.attributes.iAnim.needsUpdate = true;

    // Animals on the ground.
    const BM = beastMesh.instanceMatrix.array, BA = beastMesh.geometry.attributes.iAnim.array;
    const nightOut = env.night > 0.5;
    for (const b of beasts) {
      const o = b.slot * 16;
      const dx = b.x - cam.x, dz = b.z - cam.z, d2 = dx * dx + dz * dz;
      let out = b.on && (b.per & bit);
      if (b.name === 'fox') out = out && (b.near || within(h, 17, 7.5));
      if (b.name === 'hyrax') out = out && within(h, 8, 17.5) && d2 > 49;      // gone into the rocks when you come close
      if (b.name === 'lizard') out = out && within(h, 8.5, 17.5);
      if (b.near && camToFocus > 250) out = false;
      if (!out || d2 > b.cull * b.cull) { hide(BM, o); continue; }
      const sp = b.sp, L = sp.L;
      b.timer -= dt;
      if (b.wall) {
        // A lizard basks, then darts a little way along the wall.
        const W = b.wall;
        if (b.timer <= 0) {
          W.tu = Math.max(-0.8, Math.min(0.8, W.u + (rand() - 0.5) * 1.2));
          W.tv = Math.max(W.lo - W.by, Math.min(W.hi - W.by, W.v + (rand() - 0.5) * 0.8));
          b.timer = 2 + rand() * 9;
        }
        const du = W.tu - W.u, dv = W.tv - W.v, dd = Math.hypot(du, dv);
        let amp = 0;
        if (dd > 0.01) {
          const st = Math.min(dd, 1.4 * dt);
          W.u += (du / dd) * st; W.v += (dv / dd) * st;
          W.fu = du / dd; W.fv = dv / dd;
          amp = 1; b.ph += dt * 30;
        }
        const fx = W.tx * W.fu, fz = W.tz * W.fu, fy = W.fv;
        writeFrame(BM, o, L, W.bx + W.tx * W.u + W.nx * 0.01, W.by + W.v, W.bz + W.tz * W.u + W.nz * 0.01, fx, fy, fz, W.nx, 0, W.nz);
        const a = b.slot * 4;
        BA[a] = b.ph; BA[a + 1] = amp; BA[a + 2] = 0; BA[a + 3] = 0;
        continue;
      }
      // Gazelles and ibex bolt when the viewer comes near and low.
      if (b.wild && d2 < 50 * 50 && cam.y - b.y < 30 && b.state !== 3) {
        const d = Math.sqrt(d2) || 1;
        b.tx = b.x + (dx / d) * 40; b.tz = b.z + (dz / d) * 40;
        b.state = 3; b.speed = 8 + rand() * 3; b.timer = 6;
      }
      if (b.timer <= 0 && b.state !== 3) {
        const active = b.name === 'dog' ? (nightOut ? 0.6 : 0.35) : b.name === 'hyrax' ? 0.15 : b.name === 'fox' ? 0.55 : 0.4;
        if (rand() < active) {
          for (let n = 0; n < 6; n++) {
            const a = rand() * TAU, r = Math.sqrt(rand()) * b.R;
            const x = b.hx + Math.cos(a) * r, z = b.hz + Math.sin(a) * r;
            if (b.ok(x, z)) { b.tx = x; b.tz = z; b.state = 1; b.speed = sp.walk * (0.7 + rand() * 0.6); break; }
          }
        } else {
          b.state = rand() < 0.5 ? 2 : 0;          // graze or sniff, or stand
          b.lie = b.name === 'dog' && !nightOut && rand() < 0.4 ? 1 : 0;
        }
        b.timer = 2 + rand() * 7;
      }
      let amp = 0;
      if (b.state === 1 || b.state === 3) {
        const ex = b.tx - b.x, ez = b.tz - b.z, dd = Math.hypot(ex, ez);
        if (dd < 0.2 || (b.state === 3 && b.timer <= 0)) { b.state = 0; b.timer = 1 + rand() * 4; }
        else {
          const st = Math.min(dd, b.speed * dt);
          b.x += (ex / dd) * st; b.z += (ez / dd) * st;
          const want = Math.atan2(ex, ez);
          let dyaw = want - b.yaw;
          if (dyaw > Math.PI) dyaw -= TAU; else if (dyaw < -Math.PI) dyaw += TAU;
          b.yaw += dyaw * Math.min(1, dt * 5);
          b.y = b.gy(b.x, b.z);
          b.lie = 0;
          amp = b.state === 3 ? 1.6 : 1;
          b.ph += (dt * b.speed) / (sp.a[1] * L * 1.1) * Math.PI;
        }
      }
      b.hd += ((b.state === 2 ? 1 : 0) - b.hd) * Math.min(1, dt * 2);
      b.ph %= TAU * 64;
      writeBasis(BM, o, L, b.x, b.y - b.lie * sp.a[1] * L * 0.85, b.z, b.yaw, 0, 0);
      const a = b.slot * 4;
      BA[a] = b.ph; BA[a + 1] = amp; BA[a + 2] = b.hd; BA[a + 3] = b.name === 'dog' && b.state !== 3 ? 0.35 : 0;
    }
    beastMesh.instanceMatrix.needsUpdate = true;
    beastMesh.geometry.attributes.iAnim.needsUpdate = true;
  };

  return {
    layer: 'life',
    groups: [{ group, layer: 'life' }],
    update,
    info: INFO,
    debug,
  };
}

// --- Info cards ------------------------------------------------------------------------
const INFO = {
  'fauna-dove': {
    mode: 'both', title: 'Doves and pigeons', he: 'יוֹנָה',
    dims: ['Rock dove and turtledove', 'Flocks rest on the roofs, then wheel over the city', 'In 573 BC only wild rock doves, in the Kidron cliffs'],
    refs: 'Song 2:14; Jer 48:28; Isa 60:8; Lev 1:14; 5:7; 12:8',
    note: 'Wild rock doves nest "in the clefts of the rock" (Song 2:14) and "in the sides of the mouth of a gorge" (Jer 48:28). Turtledoves and young pigeons were the offering of the poor (Lev 5:7; 12:8), so doves were at hand in the city. That they were kept on the roofs in cotes is probable, not described: "doves to their windows" (Isa 60:8) is the nearest picture.'
  },
  'fauna-swallow': {
    mode: 'both', title: 'Swallows and swifts', he: 'דְּרוֹר · סִיס',
    dims: ['Barn swallows low over the roofs and courts', 'Swifts higher, in screaming parties, from February to July'],
    refs: 'Ps 84:3; Prov 26:2; Jer 8:7; Isa 38:14',
    note: '"Even the sparrow finds a home, and the swallow a nest for herself, where she may lay her young, at your altars" (Ps 84:3). Which Hebrew word means swallow and which swift is uncertain. Swifts still come back every spring to nest in the old walls of Jerusalem.'
  },
  'fauna-sparrow': {
    mode: 'both', title: 'Sparrows', he: 'צִפּוֹר',
    dims: ['House sparrows hopping in the lanes and on the roofs'],
    refs: 'Ps 84:3; Ps 102:7; Prov 26:2',
    note: '"I am like a lonely sparrow on the housetop" (Ps 102:7). Tsippor is any small bird; the house sparrow is the commonest about houses.'
  },
  'fauna-stork': {
    mode: 'both', title: 'White storks on passage', he: 'חֲסִידָה',
    dims: ['Wingspan about 2 m', 'Loose lines high overhead, heading north', 'By day only, soaring and gliding'],
    refs: 'Jer 8:7; Ps 104:17; Zech 5:9',
    note: 'Hundreds of thousands of white storks cross the land northward in March and April. "Even the stork in the heavens knows her times" (Jer 8:7). Ezekiel\'s vision is dated to the first month (Ezek 40:1), the height of the spring passage.'
  },
  'fauna-vulture': {
    mode: 'both', title: 'Griffon vultures', he: 'נֶשֶׁר',
    dims: ['Wingspan about 2.5–2.8 m', 'Circling on thermals over the valleys from mid-morning; on the cliffs otherwise'],
    refs: 'Job 39:27–30; Mic 1:16; Prov 30:17; Jer 7:33; 34:20',
    note: 'The Hebrew nesher, usually "eagle", is in many passages the griffon vulture: "where the slain are, there is he" (Job 39:30); "make yourself as bald as the nesher" (Mic 1:16) fits its bare head. In 573 BC more vultures and ravens are shown over and in the ruined city (Jer 7:33; 34:20). Thirteen years after the fall that is the model\'s reading of the desolation, not a count.'
  },
  'fauna-eagle': {
    mode: 'both', title: 'Eagles', he: 'נֶשֶׁר',
    dims: ['Short-toed eagle: wingspan about 1.9 m, pale beneath', 'Arrives in March; hunts snakes and lizards'],
    refs: 'Deut 32:11; Isa 40:31; Prov 30:19',
    note: '"The way of an eagle in the sky" (Prov 30:19). Which species a verse means is rarely certain; short-toed eagles are the commonest large eagle over the Judean hills in spring.'
  },
  'fauna-raven': {
    mode: 'both', title: 'Ravens', he: 'עֹרֵב',
    dims: ['In pairs about the valleys and the edges of the city', 'Many in the ruins in 573 BC'],
    refs: 'Prov 30:17; Ps 147:9; 1 Kgs 17:4–6; Isa 34:11; Gen 8:7',
    note: '"The eye that mocks a father … will be picked out by the ravens of the valley" (Prov 30:17). With the owl, the raven is the bird of a ruined city in Isa 34:11.'
  },
  'fauna-partridge': {
    mode: 'both', title: 'Partridges', he: 'קֹרֵא',
    dims: ['Chukar and sand partridge', 'Run up the hillside rather than fly'],
    refs: '1 Sam 26:20; Jer 17:11',
    note: '"As when one hunts a partridge in the mountains" (1 Sam 26:20). The Hebrew name means "the caller", which fits the chukar\'s loud call.'
  },
  'fauna-rooster': {
    mode: 'both', title: 'Hens and a rooster',
    dims: ['A few in courtyards, in Ezekiel\'s time only'],
    refs: 'Seal of Jaazaniah, Tell en-Nasbeh, c. 600 BC; 2 Kgs 25:23',
    note: 'The onyx seal "belonging to Jaazaniah, servant of the king", found at Tell en-Nasbeh (Mizpah), shows a fighting cock, one of the earliest pictures of a chicken in the land. A Jaazaniah is named among the officers at Mizpah in 2 Kgs 25:23. Chicken bones are rare in Iron Age Judah, so none are shown in Solomon\'s time or after the fall.'
  },
  'fauna-owl': {
    mode: 'both', title: 'Owls in the ruins', he: 'כּוֹס',
    dims: ['Little owl, at home in ruins and cliffs', 'Out from dusk through the night'],
    refs: 'Ps 102:6; Lev 11:17; Isa 34:11; Zeph 2:14',
    note: '"I am like an owl of the waste places" (Ps 102:6). The night birds named in Isa 34:11–15 are hard to identify; the little owl (kos, Lev 11:17) is the commonest owl in the ruins of the region.'
  },
  'fauna-bat': {
    mode: 'both', title: 'Bats', he: 'עֲטַלֵּף',
    dims: ['Out at dusk over the lanes, gardens and pools'],
    refs: 'Lev 11:19; Deut 14:18; Isa 2:20',
    note: 'Counted among the unclean "birds" in Lev 11:19. Isaiah pictures idols thrown "to the moles and to the bats" (Isa 2:20).'
  },
  'fauna-dog': {
    mode: 'both', title: 'Street dogs', he: 'כֶּלֶב',
    dims: ['Half-wild pariah dogs, like the modern Canaan dog', 'In the lanes, and at the refuse outside the Dung Gate'],
    refs: 'Ps 59:6, 14–15; 1 Kgs 14:11; 21:23–24; 2 Kgs 9:35–36; Exod 22:31',
    note: '"Each evening they come back, howling like dogs and prowling about the city" (Ps 59:6). Dogs in the Bible are scavengers, not pets: they eat what is thrown out (Exod 22:31) and the unburied dead (1 Kgs 14:11). They are kept off the main streets here, out of the way of the crowds.'
  },
  'fauna-gazelle': {
    mode: 'both', title: 'Gazelles', he: 'צְבִי',
    dims: ['Mountain gazelle, about 75 cm at the shoulder', 'Small herds on the slopes east of the Mount of Olives', 'They bolt if you come close'],
    refs: 'Song 2:9, 17; Deut 12:15; 2 Sam 2:18; 1 Kgs 4:23; Prov 6:5',
    note: '"My beloved is like a gazelle or a young stag" (Song 2:9). Gazelles were game anyone might eat (Deut 12:15) and were served at Solomon\'s table (1 Kgs 4:23).'
  },
  'fauna-ibex': {
    mode: 'both', title: 'Nubian ibex', he: 'יָעֵל',
    dims: ['On the cliffs of the Kidron gorge toward the desert', 'Males carry long curved horns'],
    refs: 'Ps 104:18; 1 Sam 24:2; Job 39:1',
    note: '"The high mountains are for the wild goats" (Ps 104:18). David hid at "the Rocks of the Wild Goats" near En-gedi (1 Sam 24:2), where ibex still live. How near Jerusalem they came is uncertain.'
  },
  'fauna-fox': {
    mode: 'both', title: 'Foxes', he: 'שׁוּעָל',
    dims: ['Red foxes in the vineyards, out from dusk', 'After the fall, in the ruins'],
    refs: 'Song 2:15; Lam 5:18; Ezek 13:4; Judg 15:4',
    note: '"Catch us the foxes, the little foxes that spoil the vineyards, for our vineyards are in blossom" (Song 2:15): spring, the season of the model. Shu\'al covers both foxes and jackals; the jackals on the ruined temple mount are shown separately.'
  },
  'fauna-hyrax': {
    mode: 'both', title: 'Rock hyraxes', he: 'שָׁפָן',
    dims: ['Small groups basking on rocky slopes', 'They vanish into the rocks when you come near'],
    refs: 'Ps 104:18; Prov 30:26; Lev 11:5',
    note: '"The rock badgers are a people not mighty, yet they make their homes in the cliffs" (Prov 30:26).'
  },
  'fauna-lizard': {
    mode: 'both', title: 'Lizards on the walls', he: 'שְׂמָמִית',
    dims: ['Starred agama, common on old walls', 'Out in the warm hours, basking and darting'],
    refs: 'Prov 30:28; Lev 11:29–30',
    note: '"The lizard you can take in your hands, yet it is in kings\' palaces" (Prov 30:28). Semamit may mean a gecko, or even a spider; the model shows the agama, the lizard most often seen on the walls of Jerusalem.'
  },
};
