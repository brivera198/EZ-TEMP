// People and animals going about their day. Figures are instanced and
// animated in the vertex shader (walking, working, talking, praying,
// carrying a jar); the CPU moves them along paths through the lanes, courts,
// fields and roads. Clothing follows the Lachish reliefs and the Bible:
// tunic (kuttonet) and mantle (simlah), head-cloths, linen and turbans for
// priests (Ezek 44:17–18), pointed helmets for soldiers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Vertex attribute aInfo: x the joint that moves it, y the colour it takes,
// z the carried thing it belongs to (0 for none). Packed to stay within the
// 16 vertex attributes every WebGL device allows.
const P = { body: 0, skirt: 1, legL: 2, legR: 3, armL: 4, armR: 5, head: 6, prop: 7 };
const M = { cloth: 0, mantle: 1, skin: 2, leather: 3, hair: 4, face: 5, clay: 6, linen: 7, metal: 8, wood: 9 };
export const PROP = { none: 0, jar: 1, staff: 2, arms: 3, basket: 4 };
// Activities, read by the shader.
export const ACT = { idle: 0, walk: 1, work: 2, talk: 3, carry: 4, pray: 5, graze: 6 };

export const shared = { pTime: { value: 0 } };

function tag(g, part, mat, { prop = 0, shade = (y) => 1 } = {}) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  const c = n.attributes.position.count;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c * 2), 2));
  const col = new Float32Array(c * 3);
  for (let i = 0; i < c; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade(n.attributes.position.getY(i));
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const info = new Float32Array(c * 3);
  for (let i = 0; i < c; i++) info.set([part, mat, prop], i * 3);
  n.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  return n;
}

const lathe = (profile, seg) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function tube(r0, r1, y0, y1, seg, open = true) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, open);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
// Folds: cloth a little darker toward the hem and under the arms.
const folds = (lo, hi) => (y) => 0.78 + 0.22 * Math.min(1, Math.max(0, (y - lo) / (hi - lo)));

// The head: front triangles take the face from the atlas, the rest is hair.
function head(seg, beard) {
  const r = 0.105, cy = 1.6;
  const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)).toNonIndexed();
  g.scale(0.92, 1.06, 1);
  g.translate(0, cy, 0.005);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const n = pos.count;
  const mat = new Float32Array(n);
  for (let t = 0; t < n; t += 3) {
    let zc = 0, yc = 0;
    for (let k = 0; k < 3; k++) { zc += pos.getZ(t + k) / 3; yc += pos.getY(t + k) / 3; }
    const face = zc > 0.02 && yc < cy + 0.07;
    for (let k = 0; k < 3; k++) {
      mat[t + k] = face ? M.face : M.hair;
      // Planar projection of the front onto the atlas cell.
      uv.setXY(t + k, 0.5 + pos.getX(t + k) / (2.3 * r), 0.5 + (pos.getY(t + k) - cy + 0.01) / (2.3 * r));
    }
  }
  const out = tag(g, P.head, M.face);
  for (let i = 0; i < n; i++) out.attributes.aInfo.setY(i, mat[i]);
  const parts = [out];
  parts.push(tag(at(new THREE.BoxGeometry(0.026, 0.045, 0.03), 0, 1.585, 0.1), P.head, M.skin));             // nose
  parts.push(tag(tube(0.045, 0.05, 1.44, 1.53, 6), P.head, M.skin, { shade: () => 0.85 }));                   // neck
  if (beard) {
    const b = new THREE.SphereGeometry(0.075, 8, 5, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55);
    b.scale(1, 1.1, 0.75);
    parts.push(tag(at(b, 0, 1.585, 0.045), P.head, M.hair));
  }
  return parts;
}

// One figure. kind: man, woman, priest, worker, soldier, child.
function human(kind, detail) {
  const seg = detail === 'low' ? 6 : 9;
  const parts = [];
  const longRobe = kind === 'woman' || kind === 'priest';
  const hem = { man: 0.4, woman: 0.06, priest: 0.05, worker: 0.6, soldier: 0.62, child: 0.42 }[kind];
  const robe = kind === 'priest' ? M.linen : M.cloth;
  // Legs: shin and sandalled foot, swinging from the hip.
  for (const [s, part] of [[1, P.legL], [-1, P.legR]]) {
    parts.push(tag(at(tube(0.042, 0.06, 0.06, 0.92, 5), s * 0.09, 0, 0), part, M.skin, { shade: () => 0.9 }));
    parts.push(tag(at(new THREE.BoxGeometry(0.08, 0.055, 0.21), s * 0.09, 0.028, 0.035), part, M.leather));
  }
  // Tunic: the skirt sways, the upper body stays with the torso.
  const waist = 0.98;
  const flare = longRobe ? 0.28 : 0.235;
  const skirt = lathe([[0.001, hem], [flare, hem], [flare - 0.015, hem + 0.05], [0.205, (hem + waist) / 2], [0.17, waist]], seg + 1);
  skirt.scale(1.08, 1, 0.86);
  parts.push(tag(skirt, P.skirt, robe, { shade: folds(hem, waist) }));
  const torso = lathe([[0.17, waist], [0.18, 1.12], [0.2, 1.28], [0.195, 1.37], [0.13, 1.43], [0.06, 1.47], [0.001, 1.475]], seg + 1);
  torso.scale(1.12, 1, 0.78);
  parts.push(tag(torso, P.body, robe, { shade: folds(0.9, 1.4) }));
  // Girdle or sash.
  const belt = new THREE.TorusGeometry(0.175, 0.02, 3, seg + 3);
  belt.rotateX(Math.PI / 2);
  belt.scale(1.1, 1, 0.8);
  parts.push(tag(at(belt, 0, waist, 0), P.body, kind === 'priest' ? M.mantle : M.leather));
  // Arms: sleeve, forearm and hand, swinging from the shoulder.
  for (const [s, part] of [[1, P.armL], [-1, P.armR]]) {
    const sleeve = at(tube(0.06, 0.055, 1.1, 1.37, 5), s * 0.215, 0, 0);
    parts.push(tag(sleeve, part, robe, { shade: folds(1.0, 1.4) }));
    const fore = at(tube(0.033, 0.045, 0.86, 1.11, 5), s * 0.215, 0, 0);
    parts.push(tag(fore, part, kind === 'priest' || kind === 'woman' ? robe : M.skin));
    parts.push(tag(at(new THREE.SphereGeometry(0.038, 5, 4), s * 0.215, 0.82, 0.01), part, M.skin));
  }
  // Head, beard and head-covering.
  const beard = kind === 'man' || kind === 'priest' || kind === 'soldier';
  parts.push(...head(detail === 'low' ? 8 : 12, beard));
  if (kind === 'woman') {
    // Shawl over the head and shoulders, open at the face.
    const cap = new THREE.SphereGeometry(0.128, seg + 1, 4, 0, Math.PI * 2, 0, Math.PI * 0.34);
    const hood = new THREE.SphereGeometry(0.128, seg + 1, 4, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.34, Math.PI * 0.3);
    for (const g of [cap, hood]) { g.scale(0.95, 1.05, 1.05); parts.push(tag(at(g, 0, 1.605, -0.008), P.head, M.mantle)); }
    const drape = new THREE.CylinderGeometry(0.12, 0.27, 0.62, seg + 1, 1, true, Math.PI * 0.3, Math.PI * 1.4);
    drape.scale(1.1, 1, 0.86);
    parts.push(tag(at(drape, 0, 1.3, -0.01), P.body, M.mantle, { shade: folds(0.95, 1.6) }));
  } else if (kind === 'priest') {
    parts.push(tag(at(tube(0.1, 0.112, 1.63, 1.79, seg + 1, false), 0, 0, 0), P.head, M.linen));                // linen turban
  } else if (kind === 'soldier') {
    const helm = new THREE.ConeGeometry(0.118, 0.22, seg + 1, 1, true);
    parts.push(tag(at(helm, 0, 1.73, -0.005), P.head, M.metal));
  } else if (kind === 'man') {
    const cloth = new THREE.SphereGeometry(0.12, seg + 1, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
    parts.push(tag(at(cloth, 0, 1.6, -0.01), P.head, M.mantle));
    parts.push(tag(at(new THREE.BoxGeometry(0.2, 0.2, 0.02), 0, 1.5, -0.1), P.head, M.mantle));             // falls to the nape
  } else if (kind === 'worker') {
    const band = new THREE.TorusGeometry(0.105, 0.016, 3, seg + 3);
    band.rotateX(Math.PI / 2);
    parts.push(tag(at(band, 0, 1.64, 0.005), P.head, M.mantle));
  }
  // Mantle (simlah) over the shoulders and back.
  if (kind === 'man') {
    const m = new THREE.CylinderGeometry(0.215, 0.28, 0.62, seg + 1, 1, true, Math.PI * 0.35, Math.PI * 1.3);
    m.scale(1.08, 1, 0.85);
    parts.push(tag(at(m, 0, 1.08, 0), P.body, M.mantle, { shade: folds(0.75, 1.4) }));
  }
  // Things carried: a water jar on the head, a staff, spear and shield.
  if (kind === 'woman') {
    const jar = lathe([[0.001, 0], [0.07, 0.02], [0.12, 0.12], [0.11, 0.24], [0.05, 0.3], [0.055, 0.34], [0.001, 0.34]], seg);
    parts.push(tag(at(jar, 0, 1.71, 0), P.head, M.clay, { prop: PROP.jar }));
  }
  if (kind === 'man' || kind === 'worker') {
    parts.push(tag(at(tube(0.014, 0.016, 0.02, 1.75, 4, false), -0.24, 0, 0.06), P.armR, M.wood, { prop: PROP.staff }));
  }
  if (kind === 'woman' || kind === 'worker') {
    const basket = lathe([[0.001, 0], [0.12, 0], [0.15, 0.13], [0.15, 0.14], [0.001, 0.14]], seg);
    parts.push(tag(at(basket, 0.24, 0.72, 0.05), P.armL, M.clay, { prop: PROP.basket, shade: () => 1.15 }));
  }
  if (kind === 'soldier') {
    parts.push(tag(at(tube(0.012, 0.014, 0.1, 2.25, 4, false), -0.24, 0, 0.08), P.armR, M.wood, { prop: PROP.arms }));
    parts.push(tag(at(new THREE.ConeGeometry(0.025, 0.14, 4), -0.24, 2.32, 0.08), P.armR, M.metal, { prop: PROP.arms }));
    const shield = new THREE.CylinderGeometry(0.28, 0.28, 0.03, seg + 3);
    shield.rotateZ(Math.PI / 2);
    parts.push(tag(at(shield, 0.27, 1.05, 0.03), P.armL, M.leather, { prop: PROP.arms }));
  }
  return mergeGeometries(parts);
}

// A four-legged beast facing +z: sheep, goat, donkey, ox or jackal (by scale).
function quadruped(detail) {
  const seg = detail === 'low' ? 6 : 8;
  const parts = [];
  const body = new THREE.SphereGeometry(0.5, seg, 6);
  body.scale(0.52, 0.58, 1.05);
  parts.push(tag(at(body, 0, 0.72, 0), 0, M.cloth, { shade: folds(0.45, 1.0) }));
  // Legs: FL 2, FR 3, BL 4, BR 5.
  for (const [x, z, part] of [[0.16, 0.36, 2], [-0.16, 0.36, 3], [0.16, -0.36, 4], [-0.16, -0.36, 5]]) {
    parts.push(tag(at(tube(0.035, 0.05, 0.05, 0.62, 5), x, 0, z), part, M.cloth, { shade: () => 0.8 }));
    parts.push(tag(at(new THREE.CylinderGeometry(0.04, 0.042, 0.06, 5), x, 0.03, z), part, M.leather));
  }
  const neck = tube(0.09, 0.13, 0, 0.36, seg);
  neck.rotateX(0.75);
  parts.push(tag(at(neck, 0, 0.82, 0.42), 6, M.cloth));
  const skull = new THREE.SphereGeometry(0.13, seg, 5);
  skull.scale(0.8, 0.85, 1.35);
  parts.push(tag(at(skull, 0, 1.05, 0.68), 6, M.cloth));
  parts.push(tag(at(new THREE.SphereGeometry(0.075, 5, 4), 0, 1.0, 0.82), 6, M.mantle));           // muzzle
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.035, 0.12, 4);
    ear.rotateZ(s * 1.1);
    parts.push(tag(at(ear, s * 0.09, 1.12, 0.62), 6, M.cloth));
  }
  const tail = tube(0.02, 0.035, 0, 0.3, 4);
  tail.rotateX(-2.6);
  parts.push(tag(at(tail, 0, 0.82, -0.5), 7, M.cloth));
  return mergeGeometries(parts);
}

// --- Faces ------------------------------------------------------------------------
// Atlas of 8 faces (4 × 2 cells). RGB multiplies the skin where alpha is 1;
// where alpha is 0.5 the colour is used as it is (eyes, brows, beards).
function faceAtlas() {
  const W = 512, H = 256, C = 128;
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const [ca, a] = make();           // skin-multiplied shading
  const [cb, b] = make();           // absolute colours
  a.fillStyle = '#ffffff';
  a.fillRect(0, 0, W, H);
  const faces = [
    { beard: 'short', bc: '#2a1d14' }, { beard: 'full', bc: '#1d140e' }, { beard: 'full', bc: '#9a948a', old: true }, { female: true },
    { female: true, old: true }, { child: true }, { beard: 'full', bc: '#3b2a1d' }, { beard: 'short', bc: '#140f0b' },
  ];
  faces.forEach((f, i) => {
    const ox = (i % 4) * C, oy = (1 - Math.floor(i / 4)) * C;   // canvas y runs down; atlas v runs up
    const X = (u) => ox + u * C, Y = (v) => oy + (1 - v) * C;
    // Soft modelling: shadow under the brow and beside the nose, light cheeks.
    const shade = (cx, cy, r, col) => {
      const gr = a.createRadialGradient(X(cx), Y(cy), 1, X(cx), Y(cy), r * C);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
      a.fillStyle = gr; a.beginPath(); a.arc(X(cx), Y(cy), r * C, 0, Math.PI * 2); a.fill();
    };
    shade(0.36, 0.56, 0.1, 'rgba(150,120,105,0.55)');
    shade(0.64, 0.56, 0.1, 'rgba(150,120,105,0.55)');
    shade(0.5, 0.43, 0.06, 'rgba(160,125,110,0.4)');
    a.fillStyle = f.female ? 'rgba(165,80,75,0.85)' : 'rgba(150,90,80,0.8)';    // lips
    a.beginPath(); a.ellipse(X(0.5), Y(0.33), 0.075 * C, 0.022 * C, 0, 0, Math.PI * 2); a.fill();
    if (f.old) { a.strokeStyle = 'rgba(120,95,80,0.5)'; a.lineWidth = 1.2; for (const dy of [0.7, 0.73]) { a.beginPath(); a.moveTo(X(0.36), Y(dy)); a.lineTo(X(0.64), Y(dy)); a.stroke(); } }
    // Eyes, brows and beard in their own colours.
    for (const s of [-1, 1]) {
      const ex = 0.5 + s * 0.15;
      b.fillStyle = '#e9e2d6';
      b.beginPath(); b.ellipse(X(ex), Y(0.56), 0.065 * C, 0.032 * C, 0, 0, Math.PI * 2); b.fill();
      b.fillStyle = '#2b1b10';
      b.beginPath(); b.arc(X(ex), Y(0.56), 0.03 * C, 0, Math.PI * 2); b.fill();
      b.fillStyle = f.old && !f.female ? '#8d877d' : '#24170e';
      b.fillRect(X(ex - 0.08), Y(0.64), 0.16 * C, (f.female ? 0.018 : 0.03) * C);
    }
    if (f.beard) {
      b.fillStyle = f.bc;
      b.beginPath();
      b.moveTo(X(0.18), Y(0.52));
      b.quadraticCurveTo(X(0.2), Y(f.beard === 'full' ? 0.05 : 0.14), X(0.5), Y(f.beard === 'full' ? 0.0 : 0.1));
      b.quadraticCurveTo(X(0.8), Y(f.beard === 'full' ? 0.05 : 0.14), X(0.82), Y(0.52));
      b.lineTo(X(0.7), Y(0.4)); b.lineTo(X(0.62), Y(0.3)); b.lineTo(X(0.38), Y(0.3)); b.lineTo(X(0.3), Y(0.4));
      b.closePath(); b.fill();
      b.fillStyle = 'rgba(0,0,0,0)';
    }
    if (!f.female) {                                                 // hairline
      b.fillStyle = f.old ? '#8d877d' : '#1f150e';
      b.fillRect(X(0.1), Y(1.0), 0.8 * C, 0.16 * C);
    }
  });
  const A = a.getImageData(0, 0, W, H).data, B = b.getImageData(0, 0, W, H).data;
  const out = a.createImageData(W, H);
  for (let i = 0; i < A.length; i += 4) {
    const absolute = B[i + 3] > 128;
    out.data[i] = absolute ? B[i] : A[i];
    out.data[i + 1] = absolute ? B[i + 1] : A[i + 1];
    out.data[i + 2] = absolute ? B[i + 2] : A[i + 2];
    out.data[i + 3] = absolute ? 128 : 255;
  }
  a.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(ca);
  t.colorSpace = THREE.SRGBColorSpace;
  t.premultiplyAlpha = false;
  return t;
}

// --- Shaders --------------------------------------------------------------------------
const COMMON = /* glsl */ `
attribute vec3 aInfo;
attribute vec3 iCloth;
attribute vec3 iMantle;
attribute vec3 iSkin;
attribute vec3 iHair;
attribute vec4 iAnim;      // phase, gait (radians per second), activity, face + 8 × prop
#define aPart aInfo.x
#define aMat aInfo.y
#define aProp aInfo.z
#define iProp floor(iAnim.w / 8.0)
#define iFace mod(iAnim.w, 8.0)
uniform float pTime;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
bool isAct(float a) { return abs(iAnim.z - a) < 0.5; }
`;

const HUMAN_ANIM = /* glsl */ `
void animate(inout vec3 p, inout vec3 n) {
  float t = pTime * iAnim.y + iAnim.x;
  float walk = (isAct(1.0) || isAct(4.0)) ? 1.0 : 0.0;
  float work = isAct(2.0) ? 1.0 : 0.0;
  float talk = isAct(3.0) ? 1.0 : 0.0;
  float carry = isAct(4.0) ? 1.0 : 0.0;
  float pray = isAct(5.0) ? 1.0 : 0.0;
  float s = sin(t);
  float idle = sin(pTime * 0.9 + iAnim.x) * 0.035 * (1.0 - walk);
  float legA = walk * s * 0.42;
  float armA = walk * s * 0.3 + idle;
  float slow = sin(pTime * 1.7 + iAnim.x);
  float bend = work * (0.45 + 0.2 * slow);
  float workArm = work * (-0.85 + 0.5 * slow);
  float gesture = talk * (-0.75 + 0.35 * sin(pTime * 2.3 + iAnim.x * 3.0));
  float lift = pray * (-2.45 + 0.06 * sin(pTime * 0.8 + iAnim.x));
  float yaw = (1.0 - walk) * (1.0 - work) * sin(pTime * 0.23 + iAnim.x * 5.0) * 0.45;
  mat3 R = mat3(1.0);
  vec3 piv = vec3(0.0);
  if (aPart > 1.5 && aPart < 2.5) { piv = vec3(0.09, 0.9, 0.0); R = rotX(-legA); }
  else if (aPart > 2.5 && aPart < 3.5) { piv = vec3(-0.09, 0.9, 0.0); R = rotX(legA); }
  else if (aPart > 3.5 && aPart < 4.5) { piv = vec3(0.215, 1.36, 0.0); R = rotX(armA + workArm + lift); }
  else if (aPart > 4.5 && aPart < 5.5) { piv = vec3(-0.215, 1.36, 0.0); R = rotX(-armA * (1.0 - carry) + workArm + gesture + lift - carry * 2.85); }
  else if (aPart > 5.5 && aPart < 6.5) { piv = vec3(0.0, 1.47, 0.0); R = rotY(yaw) * rotX(talk * 0.07 * sin(pTime * 3.1 + iAnim.x) - pray * 0.25); }
  else if (aPart > 0.5 && aPart < 1.5) { piv = vec3(0.0, 0.95, 0.0); R = rotX(walk * s * 0.05); }
  p = R * (p - piv) + piv;
  n = R * n;
  // Bend the upper body forward at the hips when working.
  if (aPart < 0.5 || aPart > 3.5) {
    mat3 B = rotX(bend);
    p = B * (p - vec3(0.0, 0.93, 0.0)) + vec3(0.0, 0.93, 0.0);
    n = B * n;
  }
  p.y += walk * abs(cos(t)) * 0.03;
  // Things this person does not carry fold away.
  if (aProp > 0.5 && abs(aProp - iProp) > 0.5) p = vec3(0.0, 0.9, 0.0);
}`;

const ANIMAL_ANIM = /* glsl */ `
void animate(inout vec3 p, inout vec3 n) {
  float t = pTime * iAnim.y + iAnim.x;
  float walk = isAct(1.0) ? 1.0 : 0.0;
  float graze = isAct(6.0) ? 1.0 : 0.0;
  float a = walk * sin(t) * 0.45;
  mat3 R = mat3(1.0);
  vec3 piv = vec3(0.0);
  if (aPart > 1.5 && aPart < 2.5) { piv = vec3(0.16, 0.6, 0.36); R = rotX(-a); }
  else if (aPart > 2.5 && aPart < 3.5) { piv = vec3(-0.16, 0.6, 0.36); R = rotX(a); }
  else if (aPart > 3.5 && aPart < 4.5) { piv = vec3(0.16, 0.6, -0.36); R = rotX(a); }
  else if (aPart > 4.5 && aPart < 5.5) { piv = vec3(-0.16, 0.6, -0.36); R = rotX(-a); }
  else if (aPart > 5.5 && aPart < 6.5) {
    piv = vec3(0.0, 0.85, 0.42);
    R = rotY(sin(pTime * 0.4 + iAnim.x * 4.0) * 0.35 * (1.0 - walk)) * rotX(graze * (0.85 + 0.12 * sin(pTime * 2.0 + iAnim.x)) + walk * 0.06 * sin(t * 2.0));
  }
  else if (aPart > 6.5) { piv = vec3(0.0, 0.82, -0.5); R = rotY(sin(pTime * 2.7 + iAnim.x) * 0.4); }
  p = R * (p - piv) + piv;
  n = R * n;
  p.y += walk * abs(cos(t)) * 0.02;
}`;

const COLOR = /* glsl */ `
vec3 partColor() {
  if (aMat < 0.5) return iCloth;
  if (aMat < 1.5) return iMantle;
  if (aMat < 2.5) return iSkin;
  if (aMat < 3.5) return vec3(0.16, 0.1, 0.06);
  if (aMat < 4.5) return iHair;
  if (aMat < 5.5) return iSkin;
  if (aMat < 6.5) return vec3(0.55, 0.33, 0.18);
  if (aMat < 7.5) return vec3(0.86, 0.84, 0.78);
  if (aMat < 8.5) return vec3(0.42, 0.3, 0.17);
  return vec3(0.32, 0.22, 0.13);
}`;

function patchFigure(mat, animGLSL, faceMap) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.pTime = shared.pTime;
    if (faceMap) shader.uniforms.faceMap = { value: faceMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${animGLSL}\n${COLOR}\nvarying vec2 vFaceUv;\nvarying float vFace;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 animP = position;\nanimate(animP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = animP;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        vColor.rgb *= partColor();
        vFace = (aMat > 4.5 && aMat < 5.5) ? 1.0 : 0.0;
        vFaceUv = (vec2(mod(iFace, 4.0), floor(iFace / 4.0)) + uv) / vec2(4.0, 2.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vFaceUv;\nvarying float vFace;${faceMap ? '\nuniform sampler2D faceMap;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${faceMap ? `if (vFace > 0.5) {
          vec4 f = texture2D(faceMap, vFaceUv);
          diffuseColor.rgb = mix(f.rgb, diffuseColor.rgb * f.rgb, step(0.75, f.a));
        }` : ''}`);
  };
  mat.customProgramCacheKey = () => (faceMap ? 'figure-human-v1' : 'figure-animal-v1');
}

// Shadows follow the same poses.
function depthMaterial(animGLSL) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.pTime = shared.pTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${animGLSL}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = position;\nvec3 animN = vec3(0.0, 1.0, 0.0);\nanimate(transformed, animN);');
  };
  m.customProgramCacheKey = () => 'figure-depth-' + animGLSL.length;
  return m;
}

let KIT = null;
export function figureKit(detail = 'high') {
  if (KIT) return KIT;
  const faceMap = faceAtlas();
  const human = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  patchFigure(human, HUMAN_ANIM, faceMap);
  const animal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  patchFigure(animal, ANIMAL_ANIM, null);
  const kinds = ['man', 'woman', 'priest', 'worker', 'soldier', 'child'];
  const geos = Object.fromEntries(kinds.map((k) => [k, human_(k, detail)]));
  geos.beast = quadruped(detail);
  KIT = { human, animal, geos, depthHuman: depthMaterial(HUMAN_ANIM), depthAnimal: depthMaterial(ANIMAL_ANIM) };
  return KIT;
}
const human_ = human;

// --- Paths ----------------------------------------------------------------------
// A polyline with heights, sampled by distance along it.
export class Path {
  constructor(pts, { loop = false } = {}) {
    this.pts = pts;              // [[x, y, z], ...]
    this.loop = loop;
    this.d = [0];
    for (let i = 1; i < pts.length; i++) this.d.push(this.d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    this.length = this.d[this.d.length - 1];
    this.i = 0;
  }
  sample(s, out) {
    const d = this.d, n = d.length;
    s = Math.max(0, Math.min(this.length, s));
    let i = Math.min(this.i, n - 2);
    while (i > 0 && d[i] > s) i--;
    while (i < n - 2 && d[i + 1] < s) i++;
    this.i = i;
    const a = this.pts[i], b = this.pts[i + 1];
    const t = (s - d[i]) / Math.max(1e-6, d[i + 1] - d[i]);
    out.x = a[0] + (b[0] - a[0]) * t;
    out.y = a[1] + (b[1] - a[1]) * t;
    out.z = a[2] + (b[2] - a[2]) * t;
    out.dx = b[0] - a[0];
    out.dz = b[2] - a[2];
    return out;
  }
}

// Rounded corners: two passes of Chaikin's algorithm on [x, z] points.
export function smoothPts(pts, passes = 2) {
  for (let k = 0; k < passes; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// --- Crowds -------------------------------------------------------------------------
// One crowd per scene group. Agents are added first, then build() creates
// the instanced meshes; update() moves them every frame.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmp = {};

// Where the camera is looking: local walkers gather there (see update()).
export const focus = new THREE.Vector3();

export class Crowd {
  constructor(name) {
    this.group = new THREE.Group();
    this.group.name = name;
    this.agents = [];
    this.level = 1;
    this.pool = null;          // { bins: Map, cell } of paths for local walkers
    this.regather = 0;
    this.gathered = new THREE.Vector3(1e9, 0, 0);
    this.group.userData.update = (t, dt) => this.update(t, dt);
  }

  // Paths that local walkers may move to, binned by where they are.
  setPathPool(paths, cell = 90) {
    const bins = new Map();
    for (const p of paths) {
      const m = p.pts[Math.floor(p.pts.length / 2)];
      const key = Math.floor(m[0] / cell) + ',' + Math.floor(m[2] / cell);
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(p);
    }
    this.pool = { bins, cell };
  }

  // Walkers far from the view move to lanes near it, so the streets you look
  // at are busy without drawing a crowd across the whole city.
  gather() {
    const { bins, cell } = this.pool;
    const near = [];
    const cx = Math.floor(focus.x / cell), cz = Math.floor(focus.z / cell);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) near.push(...(bins.get((cx + i) + ',' + (cz + j)) || []));
    if (!near.length) return;
    for (const a of this.agents) {
      if (!a.local || !a.on) continue;
      if (Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) < 260) continue;
      a.path = near[Math.floor(Math.random() * near.length)];
      a.s = Math.random() * a.path.length;
      a.dir = Math.random() < 0.5 ? 1 : -1;
      a.path.i = 0;
    }
  }

  // a: { kind, x, y, z, yaw, scale, cloth, mantle, skin, hair, face, prop,
  //      act, path, speed, s, dir, pause, loop, lateral, shift, wander, follow, gap }
  add(a) {
    const agent = {
      scale: 1, yaw: 0, act: ACT.idle, speed: 0, dir: 1, s: 0, lateral: 0, pause: [2, 8], wait: 0,
      shift: Math.random(), phase: Math.random() * 6.28, prop: PROP.none, face: 0,
      cloth: [0.7, 0.62, 0.5], mantle: [0.5, 0.42, 0.32], skin: [0.42, 0.27, 0.18], hair: [0.05, 0.035, 0.025], ...a,
    };
    agent.moveAct = agent.moveAct ?? (agent.act === ACT.carry ? ACT.carry : ACT.walk);
    agent.restAct = agent.restAct ?? (agent.path || agent.wander ? ACT.idle : agent.act);
    if (agent.path) agent.act = agent.moveAct;
    agent.pos = { x: agent.x || 0, y: agent.y || 0, z: agent.z || 0 };
    this.agents.push(agent);
    return agent;
  }

  build(kit) {
    const byKind = {};
    for (const a of this.agents) (byKind[a.kind] ||= []).push(a);
    for (const [kind, list] of Object.entries(byKind)) {
      const beast = kind === 'beast';
      const geo = kit.geos[beast ? 'beast' : kind].clone();
      const n = list.length;
      const attr = (size) => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
      const A = { iCloth: attr(3), iMantle: attr(3), iSkin: attr(3), iHair: attr(3), iAnim: attr(4) };
      for (const [k, v] of Object.entries(A)) geo.setAttribute(k, v);
      const im = new THREE.InstancedMesh(geo, beast ? kit.animal : kit.human, n);
      im.customDepthMaterial = beast ? kit.depthAnimal : kit.depthHuman;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.userData.infoId = beast ? 'city-flock' : 'city-people';
      list.forEach((a, i) => {
        a.im = im; a.i = i; a.A = A;
        A.iCloth.setXYZ(i, ...a.cloth);
        A.iMantle.setXYZ(i, ...a.mantle);
        A.iSkin.setXYZ(i, ...a.skin);
        A.iHair.setXYZ(i, ...a.hair);
        this.setAct(a, a.act);
        a.on = true;
        this.place(a);
      });
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      A.iAnim.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
    }
    for (const a of this.agents) {
      if (!a.follow) continue;
      a.follow.followers = [...(a.follow.followers || []), a];
      a.shift = a.follow.shift;
      a.always = a.follow.always;
    }
    return this;
  }

  setAct(a, act) {
    a.act = act;
    const gait = a.kind === 'beast' ? (act === ACT.walk ? Math.PI * 2 * (a.speed || 0.6) / (0.9 * a.scale) : 1)
      : (act === ACT.walk || act === ACT.carry ? Math.PI * 2 * (a.speed || 1.2) / (1.45 * a.scale) : 1);
    a.A.iAnim.setXYZW(a.i, a.phase, gait, act, a.face + 8 * a.prop);
    a.A.iAnim.needsUpdate = true;
  }

  place(a) {
    if (!a.on) { a.im.setMatrixAt(a.i, ZERO); return; }
    _p.set(a.pos.x, a.pos.y, a.pos.z);
    _q.setFromAxisAngle(Y_AXIS, a.yaw);
    a.im.setMatrixAt(a.i, _m.compose(_p, _q, _s.setScalar(a.scale)));
  }

  // Fraction of people out and about (time of day). Each agent has a shift.
  setLevel(level) {
    if (Math.abs(level - this.level) < 0.01) return;
    this.level = level;
    for (const a of this.agents) {
      const on = a.always || a.shift < level;
      if (on !== a.on) { a.on = on; this.place(a); a.im.instanceMatrix.needsUpdate = true; }
    }
  }

  update(time, dt) {
    dt = Math.min(dt, 0.1);
    // Regather now and then, and at once when the view jumps somewhere new.
    if (this.pool && ((this.regather -= dt) <= 0 || this.gathered.distanceTo(focus) > 120)) {
      this.regather = 1.5;
      this.gathered.copy(focus);
      this.gather();
    }
    for (const a of this.agents) {
      if (!a.on) continue;
      if (a.path) this.walkPath(a, dt);
      else if (a.wander) this.walkWander(a, dt);
      else continue;
      this.place(a);
    }
    for (const a of this.agents) {
      if (!a.on || !a.followers) continue;
      for (const f of a.followers) {
        // Follow a little behind the leader along its path.
        const p = a.path.sample(a.s - a.dir * (f.gap || 2.2), tmp);
        f.pos.x = p.x + (f.lateral || 0) * (p.dz / Math.hypot(p.dx, p.dz) || 0);
        f.pos.y = p.y;
        f.pos.z = p.z - (f.lateral || 0) * (p.dx / Math.hypot(p.dx, p.dz) || 0);
        f.yaw = a.yaw;
        const want = a.act === a.moveAct ? ACT.walk : ACT.idle;
        if (f.act !== want) { f.speed = a.speed; this.setAct(f, want); }
        f.on = a.on;
        this.place(f);
      }
    }
    for (const im of this.group.children) im.instanceMatrix.needsUpdate = true;
  }

  walkPath(a, dt) {
    const path = a.path;
    if (a.wait > 0) {
      a.wait -= dt;
      if (a.wait <= 0) this.setAct(a, a.moveAct);
    } else {
      a.s += a.speed * dt * a.dir;
      if (a.s >= path.length || a.s <= 0) {
        if (a.loop && a.s >= path.length) a.s -= path.length;
        else { a.s = Math.max(0, Math.min(path.length, a.s)); a.dir = -a.dir; }
        a.wait = a.pause[0] + Math.random() * (a.pause[1] - a.pause[0]);
        if (a.wait > 0) this.setAct(a, a.restAct);
      }
    }
    const p = path.sample(a.s, tmp);
    const len = Math.hypot(p.dx, p.dz) || 1;
    a.pos.x = p.x + a.lateral * p.dz / len;
    a.pos.y = p.y;
    a.pos.z = p.z - a.lateral * p.dx / len;
    if (a.wait <= 0) a.yaw = Math.atan2(p.dx * a.dir, p.dz * a.dir);
  }

  // Animals drift about a centre: walk to a nearby spot, graze, repeat.
  walkWander(a, dt) {
    const w = a.wander;
    if (a.wait > 0) {
      a.wait -= dt;
      if (a.wait <= 0) {
        const r = Math.sqrt(Math.random()) * w.r, ang = Math.random() * 6.28;
        a.tx = w.x + Math.cos(ang) * r;
        a.tz = w.z + Math.sin(ang) * r;
        this.setAct(a, ACT.walk);
      }
      return;
    }
    if (a.tx === undefined) { a.wait = Math.random() * 6; this.setAct(a, w.rest ?? ACT.graze); return; }
    const dx = a.tx - a.pos.x, dz = a.tz - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.3) {
      a.wait = w.pause[0] + Math.random() * (w.pause[1] - w.pause[0]);
      this.setAct(a, w.rest ?? ACT.graze);
      return;
    }
    const step = Math.min(d, a.speed * dt);
    a.pos.x += dx / d * step;
    a.pos.z += dz / d * step;
    a.pos.y = w.y(a.pos.x, a.pos.z);
    a.yaw = Math.atan2(dx, dz);
  }
}
