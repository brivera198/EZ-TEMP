// People at work, with the tools and goods of their trade: grinding, baking
// and weaving at the doors, potters by the Potsherd Gate, the bakers'
// street, a smith, dyers, scribes and elders in the gates, sellers in the
// squares, women drawing water at the Gihon and Siloam, children playing,
// watchmen on the walls; reapers, binders and gleaners in the barley,
// caravans and chariots; and in 573 BC the few left among the ruins.
// Who is out follows the hour (update). People and beasts come from
// people.js; the tools are one instanced kit drawn here.
import * as THREE from 'three';
import { terrainY, rng, insidePolygon, LATE_POLY } from './terrain.js';
import { GATES, ROADS, CITY_WALL, EARLY_WALL, GIHON, SILOAM_POOL, STREETS } from './data.js';
import { Crowd, Path, smoothPts, figureKit, ACT, PROP, look, focus, setContactNight, perInstanceInfo, ownPassesOnly } from './people.js';
import { folk, lanePaths, WOOL, DYED, LINEN, lin } from './life.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// --- The tool kit ---------------------------------------------------------------------
// Every kind of tool and good in one geometry; each instance shows one kind
// (the others fold away in the shader), so the whole kit is one draw call.
// Surfaces: 1 wood, 2 fired clay, 3 stone, 4 straw and reed, 5 cloth.
const K = {
  quern: 0, oven: 1, trough: 2, loom: 3, wheel: 4, stool: 5, bench: 6, mat: 7, jar: 8, bowl: 9, basket: 10,
  forge: 11, kiln: 12, vat: 13, sheaf: 14, skeins: 15, sherds: 16, bier: 17, ink: 18, hearth: 19, board: 20,
};
const SURF = { none: 0, wood: 1, clay: 2, stone: 3, straw: 4, cloth: 5 };

function kitGeometry(seg) {
  const parts = [];
  const add = (kind, g, col, surf) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k);
    const c = n.attributes.position.count;
    const fill = (v, size) => { const a = new Float32Array(c * size); for (let i = 0; i < c; i++) a.set(v, i * size); return a; };
    n.setAttribute('color', new THREE.BufferAttribute(fill(col, 3), 3));
    n.setAttribute('aKind', new THREE.BufferAttribute(fill([kind], 1), 1));
    n.setAttribute('aSurf', new THREE.BufferAttribute(fill([surf], 1), 1));
    parts.push(n);
  };
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const cyl = (r0, r1, h, x, y, z, s = seg, open = false) => { const g = new THREE.CylinderGeometry(r1, r0, h, s, 1, open); g.translate(x, y + h / 2, z); return g; };
  const lathe = (pts, x = 0, y = 0, z = 0) => { const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg); g.translate(x, y, z); return g; };
  const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 3)); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
  const rod = (a, b, r) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r, r, d.length(), 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return g;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const BASALT = [0.3, 0.29, 0.28], LIME = [0.6, 0.56, 0.5], CLAY = [0.62, 0.38, 0.22], RAW = [0.74, 0.6, 0.45];
  const WOOD = [0.45, 0.32, 0.2], STRAW = [0.74, 0.62, 0.36], DARK = [0.12, 0.1, 0.09];
  const JAR = [[0.01, 0], [0.16, 0.04], [0.26, 0.3], [0.24, 0.5], [0.12, 0.6], [0.08, 0.64], [0.09, 0.7], [0.01, 0.7]];
  // Saddle quern: a long basalt slab and the rubbing stone (no rotary querns before the Persian period).
  add(K.quern, box(0.32, 0.14, 0.58, 0, 0.07, 0), BASALT, SURF.stone);
  add(K.quern, ball(0.08, 0, 0.17, 0.05, 1.6, 0.6, 0.8), BASALT, SURF.stone);
  add(K.quern, ball(0.16, 0, 0.0, 0.32, 1, 0.25, 0.7), [0.86, 0.82, 0.72], SURF.cloth);      // flour on a cloth
  // Clay oven (tannur), open at the top, fuel at its foot.
  add(K.oven, lathe([[0.4, 0], [0.38, 0.3], [0.3, 0.6], [0.2, 0.68], [0.17, 0.66], [0.26, 0.55], [0.33, 0.25], [0.35, 0.02]]), [0.55, 0.38, 0.27], SURF.clay);
  add(K.oven, cyl(0.17, 0.17, 0.01, 0, 0.6, 0), DARK, SURF.none);
  for (let i = 0; i < 4; i++) add(K.oven, rod(V(0.45 + i * 0.05, 0.03, -0.3 + i * 0.12), V(0.75, 0.05, -0.1 + i * 0.1), 0.02), WOOD, SURF.wood);
  // Kneading trough with dough.
  add(K.trough, box(0.6, 0.14, 0.4, 0, 0.07, 0), [0.5, 0.36, 0.25], SURF.wood);
  add(K.trough, ball(0.16, 0, 0.14, 0, 1.3, 0.35, 1), [0.86, 0.8, 0.66], SURF.none);
  // Warp-weighted loom leaning against a wall: uprights, beam, the cloth
  // begun at the top, warp threads, a row of clay loom weights.
  for (const s of [-1, 1]) add(K.loom, rod(V(s * 0.75, 0, 0.3), V(s * 0.75, 1.95, -0.05), 0.04), WOOD, SURF.wood);
  add(K.loom, rod(V(-0.85, 1.9, -0.04), V(0.85, 1.9, -0.04), 0.05), WOOD, SURF.wood);
  add(K.loom, rod(V(-0.72, 0.75, 0.15), V(0.72, 0.75, 0.15), 0.025), WOOD, SURF.wood);
  {
    const cloth = new THREE.PlaneGeometry(1.4, 0.75);
    cloth.rotateX(-0.18);
    cloth.translate(0, 1.47, 0.04);
    add(K.loom, cloth, [0.8, 0.7, 0.55], SURF.cloth);
    const warp = new THREE.PlaneGeometry(1.4, 0.75, 1, 1);
    warp.rotateX(-0.18);
    warp.translate(0, 0.78, 0.18);
    add(K.loom, warp, [0.9, 0.86, 0.78], SURF.cloth);
    for (let i = 0; i < 9; i++) add(K.loom, ball(0.05, -0.64 + i * 0.16, 0.42, 0.24, 1, 1.15, 0.8), [0.58, 0.42, 0.3], SURF.clay);
  }
  // Potter's wheel: two stones, the upper turning, a pot taking shape.
  add(K.wheel, cyl(0.2, 0.2, 0.25, 0, 0, 0), BASALT, SURF.stone);
  add(K.wheel, cyl(0.3, 0.3, 0.06, 0, 0.27, 0), BASALT, SURF.stone);
  add(K.wheel, lathe([[0.01, 0], [0.11, 0.01], [0.14, 0.09], [0.1, 0.17], [0.08, 0.2], [0.07, 0.2]], 0, 0.33, 0), RAW, SURF.clay);
  add(K.wheel, ball(0.12, 0.42, 0.06, -0.1, 1.2, 0.5, 1), [0.55, 0.42, 0.32], SURF.clay);                   // lump of clay
  add(K.wheel, cyl(0.12, 0.13, 0.1, -0.35, 0, 0.1), CLAY, SURF.clay);                                         // water bowl
  // Low stool, stone bench, reed mat.
  add(K.stool, box(0.36, 0.06, 0.3, 0, 0.33, 0), WOOD, SURF.wood);
  for (const [x, z] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.1], [0.14, 0.1]]) add(K.stool, box(0.04, 0.32, 0.04, x, 0.16, z), WOOD, SURF.wood);
  add(K.bench, box(2.4, 0.42, 0.5, 0, 0.21, 0), LIME, SURF.stone);
  add(K.mat, box(1.3, 0.025, 0.9, 0, 0.012, 0), STRAW, SURF.straw);
  // Storage jar, bowl, basket of grain.
  add(K.jar, lathe(JAR.map(([r, h]) => [r * 0.7, h * 0.9])), CLAY, SURF.clay);
  add(K.bowl, lathe([[0.01, 0], [0.12, 0.01], [0.2, 0.08], [0.22, 0.14], [0.2, 0.14], [0.17, 0.08], [0.01, 0.03]]), CLAY, SURF.clay);
  add(K.basket, lathe([[0.01, 0], [0.18, 0], [0.24, 0.26], [0.25, 0.27], [0.01, 0.27]]), STRAW, SURF.straw);
  add(K.basket, ball(0.22, 0, 0.24, 0, 1, 0.3, 1), [0.82, 0.7, 0.42], SURF.none);
  // Smith's forge: a hearth of stones with glowing coals, a stone anvil, pot bellows.
  add(K.forge, lathe([[0.45, 0], [0.45, 0.35], [0.32, 0.35], [0.3, 0.2], [0.01, 0.2]]), [0.42, 0.36, 0.3], SURF.stone);
  add(K.forge, ball(0.28, 0, 0.22, 0, 1, 0.3, 1), [0.9, 0.35, 0.08], SURF.none);
  add(K.forge, box(0.4, 0.38, 0.32, 0.9, 0.19, 0), BASALT, SURF.stone);
  for (const s of [-1, 1]) add(K.forge, cyl(0.17, 0.15, 0.2, -0.7, 0, s * 0.22), CLAY, SURF.clay);
  for (const s of [-1, 1]) add(K.forge, ball(0.16, -0.7, 0.21, s * 0.22, 1, 0.25, 1), [0.5, 0.4, 0.3], SURF.cloth);
  add(K.forge, rod(V(-0.6, 0.1, 0), V(-0.35, 0.12, 0), 0.03), CLAY, SURF.clay);
  // Potter's kiln: a round fire chamber with its stoking mouth.
  add(K.kiln, lathe([[1.3, 0], [1.3, 1.1], [1.15, 1.35], [1.0, 1.35], [1.1, 1.1], [1.1, 0.05]]), [0.6, 0.45, 0.33], SURF.clay);
  add(K.kiln, box(0.6, 0.6, 0.5, 0, 0.3, 1.3), DARK, SURF.none);
  add(K.kiln, cyl(1.02, 1.02, 0.02, 0, 1.0, 0), [0.35, 0.3, 0.26], SURF.none);
  // Dye vat cut from stone, the dye dark inside.
  add(K.vat, cyl(0.42, 0.4, 0.7, 0, 0, 0), LIME, SURF.stone);
  add(K.vat, cyl(0.32, 0.32, 0.01, 0, 0.66, 0), [0.15, 0.1, 0.25], SURF.none);
  // A sheaf of barley, standing.
  add(K.sheaf, cyl(0.14, 0.2, 0.75, 0, 0, 0, 6), [0.62, 0.5, 0.26], SURF.straw);
  add(K.sheaf, ball(0.22, 0, 0.8, 0, 1, 0.55, 1), [0.66, 0.54, 0.28], SURF.straw);
  // Skeins of dyed wool hung on a line between two posts.
  for (const s of [-1, 1]) add(K.skeins, cyl(0.04, 0.04, 1.8, s * 1.3, 0, 0, 5), WOOD, SURF.wood);
  add(K.skeins, rod(V(-1.3, 1.7, 0), V(1.3, 1.7, 0), 0.012), [0.6, 0.55, 0.45], SURF.none);
  for (let i = 0; i < 7; i++) add(K.skeins, box(0.12, 0.55, 0.04, -1.0 + i * 0.33, 1.42, 0), [1, 1, 1], SURF.cloth);
  // A heap of broken sherds.
  for (let i = 0; i < 14; i++) {
    const g = new THREE.CircleGeometry(0.1 + (i % 3) * 0.04, 4);
    g.rotateX(-Math.PI / 2 + ((i * 1.7) % 1) - 0.5);
    g.rotateY(i * 2.1);
    g.translate(Math.sin(i * 2.4) * 0.5 * Math.sqrt(i / 14), 0.05 + (14 - i) * 0.012, Math.cos(i * 2.4) * 0.5 * Math.sqrt(i / 14));
    add(K.sherds, g, CLAY, SURF.clay);
  }
  add(K.sherds, ball(0.6, 0, 0, 0, 1, 0.3, 1), [0.55, 0.38, 0.28], SURF.clay);
  // Bier with a body wrapped in a shroud.
  add(K.bier, box(0.6, 0.06, 2.0, 0, 0.42, 0), WOOD, SURF.wood);
  for (const s of [-1, 1]) add(K.bier, rod(V(s * 0.32, 0.42, -1.25), V(s * 0.32, 0.42, 1.25), 0.03), WOOD, SURF.wood);
  for (const [x, z] of [[-0.25, -0.9], [0.25, -0.9], [-0.25, 0.9], [0.25, 0.9]]) add(K.bier, box(0.05, 0.4, 0.05, x, 0.2, z), WOOD, SURF.wood);
  add(K.bier, ball(0.22, 0, 0.55, 0, 1, 0.55, 3.6), [0.85, 0.82, 0.75], SURF.cloth);
  // Scribe's ink pot and a sealed document.
  add(K.ink, cyl(0.04, 0.035, 0.07, 0, 0, 0), DARK, SURF.clay);
  add(K.ink, box(0.18, 0.012, 0.06, 0.15, 0.006, 0.05), [0.85, 0.8, 0.68], SURF.none);
  // Watch fire in a ring of stones.
  for (let i = 0; i < 7; i++) add(K.hearth, ball(0.13, Math.cos(i * 0.9) * 0.38, 0.08, Math.sin(i * 0.9) * 0.38, 1, 0.7, 1), [0.5, 0.46, 0.4], SURF.stone);
  add(K.hearth, ball(0.25, 0, 0.03, 0, 1, 0.25, 1), [0.25, 0.12, 0.06], SURF.none);
  // A plank for drying pots or laying out goods.
  add(K.board, box(1.6, 0.05, 0.45, 0, 0.3, 0), WOOD, SURF.wood);
  for (const s of [-1, 1]) add(K.board, box(0.18, 0.28, 0.4, s * 0.62, 0.14, 0), LIME, SURF.stone);
  const geo = new THREE.BufferGeometry();
  const merged = parts.reduce((acc, g) => { for (const k of Object.keys(g.attributes)) (acc[k] ||= []).push(g.attributes[k].array); return acc; }, {});
  for (const [k, arrs] of Object.entries(merged)) {
    const len = arrs.reduce((a, x) => a + x.length, 0), out = new Float32Array(len);
    let o = 0;
    for (const x of arrs) { out.set(x, o); o += x.length; }
    geo.setAttribute(k, new THREE.BufferAttribute(out, parts[0].attributes[k].itemSize));
  }
  return geo;
}

// Wood grain, clay, stone, straw and cloth, worked out per pixel from the
// tool's own coordinates (metres), with a little relief.
const KIT_VERT = /* glsl */ `
attribute float aKind;
attribute float aSurf;
attribute float iKind;
varying vec3 vKitP;
varying float vSurf;`;
const KIT_FRAG = /* glsl */ `
varying vec3 vKitP;
varying float vSurf;
float kH;
float kHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float kNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(kHash(i), kHash(i + vec2(1.0, 0.0)), f.x), mix(kHash(i + vec2(0.0, 1.0)), kHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 kBump(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}`;
const KIT_COLOR = /* glsl */ `
  kH = 0.0;
  vec3 P = vKitP;
  if (vSurf > 0.5 && vSurf < 1.5) {
    float g = kNoise(vec2(P.x * 4.0 + P.z * 4.0, P.y * 30.0 + (P.x + P.z) * 30.0)) * 0.6 + kNoise(vec2((P.x - P.z) * 60.0, P.y * 6.0)) * 0.4;
    diffuseColor.rgb *= 0.72 + 0.5 * g;
    kH = g * 0.5;
  } else if (vSurf < 2.5) {
    float g = kNoise(P.xz * 18.0 + P.y * 11.0) * 0.6 + kNoise(P.xy * 90.0 + P.z * 70.0) * 0.4;
    diffuseColor.rgb *= 0.82 + 0.3 * g;
    kH = g * 0.3;
  } else if (vSurf < 3.5) {
    float g = kNoise(P.xz * 9.0 + P.y * 7.0) * 0.5 + kNoise(P.xy * 40.0 + P.z * 33.0) * 0.3 + kNoise(P.zy * 130.0) * 0.2;
    diffuseColor.rgb *= 0.7 + 0.5 * g;
    kH = g * 1.2;
  } else if (vSurf < 4.5) {
    float g = kNoise(vec2((P.x + P.z) * 70.0, P.y * 8.0));
    diffuseColor.rgb *= 0.7 + 0.5 * g;
    kH = g * 0.6;
  } else if (vSurf < 5.5) {
    vec2 q = (P.xy + P.zy) * 220.0;
    float fw = clamp(1.0 - 0.5 * length(fwidth(q)), 0.0, 1.0);
    float w = sin(q.x * 6.2832) * sin(q.y * 6.2832);
    diffuseColor.rgb *= 0.9 + 0.08 * w * fw + 0.08 * kNoise(q * 0.05);
    kH = w * 0.1 * fw;
  }`;

function kitMaterials() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${KIT_VERT}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = abs(aKind - iKind) > 0.5 ? vec3(0.0) : position;\nvKitP = position;\nvSurf = aSurf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${KIT_FRAG}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${KIT_COLOR}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = kBump(-vViewPosition, normal, kH * 0.008);');
  };
  mat.customProgramCacheKey = () => 'trade-kit-v1';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aKind;\nattribute float iKind;')
      .replace('#include <begin_vertex>', 'vec3 transformed = abs(aKind - iKind) > 0.5 ? vec3(0.0) : position;');
  };
  depth.customProgramCacheKey = () => 'trade-kit-depth-v1';
  return { mat, depth };
}

// A set of tool instances, one mesh. add() returns the instance index.
class Kit {
  constructor() { this.recs = []; }
  add(kind, x, y, z, yaw = 0, s = 1, color = null, info = null) {
    this.recs.push({ kind, x, y, z, yaw, s, color, info, on: true });
    return this.recs.length - 1;
  }
  build(geo, mats, fallback) {
    const n = Math.max(1, this.recs.length);
    const g = geo.clone();
    const kinds = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.recs.forEach((r, i) => { kinds.array[i] = r.kind; });
    g.setAttribute('iKind', kinds);
    const im = new THREE.InstancedMesh(g, mats.mat, n);
    im.count = this.recs.length;
    im.customDepthMaterial = mats.depth;
    im.castShadow = im.receiveShadow = true;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.im = im;
    this.recs.forEach((r, i) => {
      this.place(i);
      _c.setRGB(...(r.color || [1, 1, 1]));
      im.setColorAt(i, _c);
    });
    perInstanceInfo(im, this.recs.map((r) => r.info), fallback);
    ownPassesOnly(im);
    return im;
  }
  place(i) {
    const r = this.recs[i];
    if (!r.on) { this.im.setMatrixAt(i, ZERO); return; }
    _q.setFromAxisAngle(Y_AXIS, r.yaw);
    this.im.setMatrixAt(i, _m.compose(_p.set(r.x, r.y, r.z), _q, _s.setScalar(r.s)));
  }
  move(i, x, y, z, yaw) {
    const r = this.recs[i];
    r.x = x; r.y = y; r.z = z; r.yaw = yaw;
    this.place(i);
    this.im.instanceMatrix.needsUpdate = true;
  }
}

// --- The city walls, as city.js builds them -----------------------------------------------
// The same segments, towers and gates, so watchmen stand on the wall tops.
function wallPlan(line, gates, height, towerEvery, site) {
  const segs = [];
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
    segs.push({ ax, az, bx, bz, L, ang, s0: acc });
    acc += L;
  }
  const snap = ([px, pz]) => {
    let best = null;
    for (const sg of segs) {
      const dx = sg.bx - sg.ax, dz = sg.bz - sg.az;
      const t = Math.max(0, Math.min(1, ((px - sg.ax) * dx + (pz - sg.az) * dz) / (sg.L * sg.L)));
      const x = sg.ax + dx * t, z = sg.az + dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, x, z, s: sg.s0 + t * sg.L, sg };
    }
    return best;
  };
  const gs = gates.map((g) => ({ ...g, ...snap(g.at) }));
  const nearGate = (s, m) => gs.some((g) => Math.abs(g.s - s) < m);
  const walk = [], towers = [];
  let lastTower = -1e9;
  for (const sg of segs) {
    const n = Math.max(1, Math.ceil(sg.L / 6)), run = [];
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, len = sg.L / n, s = sg.s0 + (k + 0.5) * len;
      if (nearGate(s, 8.6)) { if (run.length) walk.push(run.splice(0)); continue; }
      const x0 = sg.ax + (sg.bx - sg.ax) * t0, z0 = sg.az + (sg.bz - sg.az) * t0;
      const x1 = sg.ax + (sg.bx - sg.ax) * t1, z1 = sg.az + (sg.bz - sg.az) * t1;
      const hi = Math.max(terrainY(x0, z0, site), terrainY(x1, z1, site));
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      run.push([cx, hi + height, cz]);
      if (s - lastTower > towerEvery && !nearGate(s, 16)) {
        lastTower = s;
        towers.push({ x: cx, z: cz, y: hi + height + 3.5, ang: sg.ang });
      }
    }
    if (run.length) walk.push(run);
  }
  const gateTops = gs.map((g) => ({ id: g.id, x: g.x, z: g.z, y: terrainY(g.x, g.z, site) + height + 4, ang: g.sg.ang }));
  return { walk, towers, gateTops };
}

// --- Cards ---------------------------------------------------------------------------------
const INFO = {
  'city-household': {
    mode: 'both', title: 'Work at the door', he: 'רֵחַיִם · תַּנּוּר',
    dims: ['Grinding grain on a saddle quern of basalt, kneeling behind it, before dawn', 'Bread baked in a clay oven (tannur) in the courtyard or at the door', 'Spinning with a drop spindle; weaving on an upright loom held taut by clay loom weights', 'Saddle querns, ovens and loom weights are found in almost every excavated Iron Age house'],
    refs: 'Exod 11:5; Jer 25:10; Eccl 12:3–4; Lev 26:26; Prov 31:13, 19; Judg 16:13–14; 2 Kgs 23:7',
    note: '"The sound of the millstones and the light of the lamp" (Jer 25:10) were the signs of a living town. The rotary quern came only in the Persian period; these are saddle querns. Which houses had which work at the door is the model\'s choice.',
  },
  'city-streets': {
    mode: 'both', title: 'Old and young in the streets', he: 'רְחֹבוֹת',
    dims: ['Elders sitting by the walls, each with a staff in his hand', 'Boys and girls playing in the squares'],
    refs: 'Zech 8:4–5; Jer 6:11; Lam 2:11, 21; Job 29:7–8',
    note: 'Zechariah\'s picture (c. 520 BC) is of Jerusalem restored, but it describes what a living city looked like; Jeremiah and Lamentations speak of the children in the streets before and after the fall.',
  },
  'city-elders': {
    mode: 'both', title: 'Elders in the gate', he: 'זִקְנֵי הָעִיר',
    dims: ['Benches along the walls inside the gate, as found in the gates of Dan and Beersheba', 'Cases heard and agreements witnessed before the elders', 'The gate was court, market and meeting place'],
    refs: 'Ruth 4:1–2, 11; Deut 21:19; 22:15; Prov 31:23; Amos 5:15; Job 29:7; Lam 5:14',
    note: 'Boaz "went up to the gate and sat down there" and took ten elders of the city as witnesses (Ruth 4:1–2). After the fall "the old men have left the city gate" (Lam 5:14).',
  },
  'city-scribes': {
    mode: 'both', title: 'Scribes', he: 'סֹפְרִים',
    dims: ['Writing with reed pen and ink on papyrus or leather scrolls', 'Deeds written, sealed with a clay bulla and kept in a jar', 'A writing case carried at the side'],
    refs: 'Jer 36:4, 10, 18, 32; Jer 32:10–14; Ezek 9:2–3; 2 Kgs 22:3',
    note: 'Baruch wrote Jeremiah\'s words "with ink on the scroll" (Jer 36:18). Over fifty clay bullae, one naming Gemariah son of Shaphan (Jer 36:10), were found in the burned "House of the Bullae" in the City of David. Seating scribes in the gate square is the model\'s choice.',
  },
  'city-water': {
    mode: 'both', title: 'Drawing water', he: 'שְׁאֹב מַיִם',
    dims: ['Women go out in the morning and "at the time of evening, when women go out to draw water"', 'Jars carried on the head or the shoulder', 'The Gihon, the city\'s spring; Hezekiah brought its water to the Pool of Siloam inside the walls'],
    refs: 'Gen 24:11, 15; 1 Kgs 1:33, 38; 2 Kgs 20:20; Isa 8:6; 22:9–11; 2 Chr 32:30',
    note: 'Where exactly water was drawn at the Gihon in each period (at the spring, by the shaft, or from the pools) is debated; the queue here is the model\'s choice. Washing clothes at the pool is probable but not described.',
  },
  'city-potters': {
    mode: 'both', title: 'The potters\' quarter', he: 'בֵּית הַיּוֹצֵר',
    dims: ['Potters at the wheel ("the two stones", Jer 18:3), clay trodden underfoot (Isa 41:25)', 'Pots drying in rows before firing; a kiln', 'Heaps of broken sherds: the Potsherd Gate opened onto the Hinnom valley'],
    refs: 'Jer 18:1–6; 19:1–2, 10–11; Isa 29:16; 41:25; 45:9; Lam 4:2; 1 Chr 4:23',
    note: 'Jeremiah went down to the potter\'s house and watched a vessel spoiled and remade, then bought a jug and broke it at the entry of the Potsherd Gate. The gate is often taken to be the Dung Gate; placing the workshops just outside it is the model\'s choice.',
  },
  'city-bakers': {
    mode: 'both', title: 'The bakers\' street', he: 'חוּץ הָאֹפִים',
    dims: ['Clay ovens along the street', 'Dough kneaded in troughs, bread carried on trays'],
    refs: 'Jer 37:21; Hos 7:4–7; Gen 40:16–17; 1 Sam 8:13',
    note: 'King Zedekiah ordered that Jeremiah be given "a loaf of bread daily from the bakers\' street, until all the bread of the city was gone" (Jer 37:21). Its place in the city is unknown; here it runs down from the Ophel.',
  },
  'city-smith': {
    mode: 'both', title: 'Smiths', he: 'חָרָשׁ · מַסְגֵּר',
    dims: ['Iron worked over charcoal, blown with pot bellows', 'Hammered on a stone anvil'],
    refs: 'Isa 44:12; 54:16; 2 Kgs 24:14–16; Jer 24:1; 1 Sam 13:19–21',
    note: 'Nebuchadnezzar carried off "all the craftsmen and the smiths" of Jerusalem in 597 BC (2 Kgs 24:14). Pot bellows are shown in Egyptian tomb paintings and found in the Levant; this forge is the model\'s reconstruction.',
  },
  'city-dyers': {
    mode: 'both', title: 'Dyers', he: 'צֹבְעִים',
    dims: ['Wool dyed in stone vats: madder red, indigo or woad blue', 'Skeins hung to dry'],
    refs: 'Exod 35:25; 2 Sam 1:24; Prov 31:21–22; Jer 4:30; 10:9',
    note: 'Stone vats at Tell Beit Mirsim and elsewhere were long read as dye works; some are now thought to be olive presses. Dyeing itself is certain; this yard is conjectural.',
  },
  'city-market-folk': {
    mode: 'both', title: 'Buying and selling', he: 'מִמְכָּר',
    dims: ['Grain, oil, wine, cloth and pottery sold in the gate squares', 'Prices by weight of silver: shekel weights of stone, no coins yet'],
    refs: '2 Kgs 7:1, 18; Neh 13:15–16; Zeph 1:10–11; Amos 8:5; Prov 20:14',
    note: '"It is bad, it is bad," says the buyer, but when he goes away he boasts (Prov 20:14). Coins were not used in Judah before the Persian period; silver was weighed.',
  },
  'city-watchmen': {
    mode: 'both', title: 'Watchmen on the walls', he: 'צֹפִים · שֹׁמְרִים',
    dims: ['Watchmen on the walls and the gate towers, day and night', 'A watch fire at night', 'A runner seen coming from far off'],
    refs: 'Isa 62:6; 21:11–12; 2 Sam 18:24–27; Ezek 3:17; 33:2–7; Ps 127:1; Song 3:3',
    note: '"Son of man, I have made you a watchman for the house of Israel" (Ezek 3:17). David\'s watchman "went up to the roof of the gate by the wall" and saw a man running alone (2 Sam 18:24).',
  },
  'city-soldiers': {
    mode: 'both', title: 'Soldiers', he: 'צָבָא',
    dims: ['Spear, round shield and helmet; short tunic and girdle', 'Drilling in the square inside the gate'],
    refs: '2 Chr 26:11–14; 2 Kgs 11:4–11; Jer 46:3–4; Lachish reliefs (Nineveh, c. 700 BC)',
    note: 'Uzziah equipped his army "with shields, spears, helmets, coats of mail, bows and stones for slinging" (2 Chr 26:14). How the drill looked is the model\'s guess.',
  },
  'city-pilgrims': {
    mode: 'both', title: 'Going up to the house of the LORD', he: 'עֹלִים',
    dims: ['Families going up together, with their children', 'The tenth of the first month: Passover lambs chosen four days before the feast'],
    refs: 'Ps 122:1–4; Isa 2:3; 30:29; Deut 16:16; Exod 12:3; Ezek 40:1',
    note: 'Ezekiel dates his vision to the tenth of the month (40:1), the day each household chose its lamb (Exod 12:3). "As when one sets out to the sound of the flute, to go to the mountain of the LORD" (Isa 30:29).',
  },
  'city-mourners': {
    mode: 'both', title: 'Mourning at the tombs', he: 'מְקוֹנְנוֹת',
    dims: ['The dead carried on a bier and laid in a rock-cut tomb', 'Hired mourning women; hands on the head; sitting on the ground'],
    refs: 'Jer 9:17–20; 16:5–7; 2 Sam 3:31; 13:19; Ezek 24:16–17; Mic 1:8',
    note: 'Ezekiel was told not to mourn when his wife died, as a sign (Ezek 24:16–17). The tombs of Silwan across the Kidron were cut in this period.',
  },
  'city-shepherd': {
    mode: 'both', title: 'Shepherd and flock', he: 'רֹעֶה',
    dims: ['The shepherd goes before the flock, with staff and rod', 'Out to pasture in the morning, back to the fold at evening'],
    refs: 'Ps 23:1–4; Mic 2:12–13; Ezek 34:11–16; Jer 33:13; Neh 3:1',
    note: '"Flocks shall again pass under the hands of the one who counts them, in the cities of Judah" (Jer 33:13). The Sheep Gate is named only in Nehemiah; taking a flock through the northern gates here is the model\'s choice.',
  },
  'city-harvest': {
    mode: 'both', title: 'The barley harvest', he: 'קְצִיר שְׂעֹרִים',
    dims: ['Reapers with iron sickles, binders tying sheaves, gleaners behind them', 'The first sheaf brought to the priest at Passover', 'A meal at noon in the field: bread dipped in vinegar, roasted grain'],
    refs: 'Ruth 2:2–23; Lev 19:9; 23:10–11; Deut 16:9; 24:19; Jer 9:22; Gezer calendar (10th century BC)',
    note: 'Nisan, the month of the vision, is the month of the barley harvest; the Gezer calendar names "a month of reaping barley". Wheat is still green.',
  },
  'city-plough': {
    mode: 'both', title: 'Ploughing', he: 'חָרִישׁ',
    dims: ['A wooden ard with an iron point, drawn by a yoke of oxen', 'Driven with a goad'],
    refs: '1 Kgs 19:19; 1 Sam 13:20–21; Isa 2:4; 28:24; Deut 22:10; Jer 39:10',
    note: 'The Philistines sharpened Israel\'s ploughshares for a pim, two-thirds of a shekel (1 Sam 13:21); pim weights have been found.',
  },
  'city-caravan': {
    mode: 'both', title: 'Camel caravan', he: 'אֹרְחָה',
    dims: ['Camels laden with spices, balm and myrrh from Arabia', 'Led on foot by their drivers'],
    refs: 'Gen 37:25; 1 Kgs 10:2; Isa 60:6; Judg 6:5; Ezek 27:21–22',
    note: 'Domestic camel bones appear in the copper mines of the Arabah from the late 10th century BC. "A multitude of camels shall cover you, the young camels of Midian and Ephah; all those from Sheba shall come" (Isa 60:6).',
  },
  'city-chariots': {
    mode: 'both', title: 'Horses and chariots', he: 'רֶכֶב וּפָרָשִׁים',
    dims: ['Two-horse chariot: driver and warrior standing in a light box on two spoked wheels', 'The Horse Gate on the east, by the palace'],
    refs: '1 Kgs 10:26–29; 2 Kgs 11:16; 23:11; Jer 17:25; 22:4; 31:40; Neh 3:28',
    note: 'Solomon "gathered chariots and horsemen" and kept some "with the king in Jerusalem" (1 Kgs 10:26). Athaliah was killed at "the horses\' entrance to the king\'s house" (2 Kgs 11:16).',
  },
  'city-poor': {
    mode: 'both', title: 'The poorest of the land', he: 'דַּלַּת הָאָרֶץ',
    dims: ['A few left to be vinedressers and ploughmen', 'Picking through the burned houses for what was left', 'A woman sitting alone in the ruins'],
    refs: '2 Kgs 25:12; Jer 39:10; 40:7; Lam 1:1, 4; 2:10; 5:18; Ezek 33:24',
    note: '"How lonely sits the city that was full of people!" (Lam 1:1). Ezekiel, in Babylon, heard of those "living in these waste places in the land of Israel" (33:24).',
  },
};

// --- Build ----------------------------------------------------------------------------------
export function build(mats, ctx) {
  const high = ctx.quality !== 'low';
  const rand = rng(777);
  const kit = figureKit(ctx.quality);
  const kitGeo = kitGeometry(high ? 10 : 6);
  const kitMats = kitMaterials();
  const { person, beast, pick } = folk(rand);
  const N = (n) => Math.max(1, Math.round(n * (high ? 1 : 0.4)));
  const R = (a, b) => a + rand() * (b - a);
  const city = ctx.city;
  const groups = [], lights = [], fireMeshes = [], labels = [], zones = [], scenes = [];
  const fire = (group, x, y, z, size = 0.45) => {
    const sp = new THREE.Sprite(mats.fire);
    sp.center.set(0.5, 0.03);
    sp.position.set(x, y, z);
    sp.userData.base = size;
    sp.userData.phase = rand() * 10;
    group.add(sp);
    fireMeshes.push(sp);
  };
  const zone = (id, x, y, z, w, h, d, periods) => zones.push({ id, periods, box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(w, h, d)) });
  const facing = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
  const ARD = look({ load: 3 }), PANNIERS = look({ load: 1 }), CHARIOT = look({ load: 1 });

  // A scene: a crowd and a tool kit shown in some periods.
  const scene = (name, periods, infoHuman = 'city-people') => {
    const s = { crowd: new Crowd(name, { infoHuman }), kit: new Kit(), periods, group: new THREE.Group(), stations: [] };
    s.group.name = name;
    scenes.push(s);
    return s;
  };
  const finish = (s) => {
    s.crowd.build(kit);
    s.group.add(s.crowd.group, s.kit.build(kitGeo, kitMats, 'city-household'));
    groups.push({ group: s.group, periods: s.periods, layer: 'life' });
  };

  // --- One city period: late (c. 600 BC) or early (c. 950 BC) ---------------------------
  const townScenes = (period) => {
    const S = scene('trades-' + period, [period]);
    const { crowd: c, kit: tk } = S;
    const grid = city.grids[period];
    const site = period === 'early' ? 'sp' : 'square';
    const gY = (x, z) => grid.at(x, z);
    const houses = city.houses[period];
    const gates = GATES.filter((g) => g.periods.includes(period)).map((g, i) => {
      const [ix, iz] = city.gates[period][i];
      const ul = Math.hypot(ix - g.at[0], iz - g.at[1]) || 1;
      return { ...g, ix, iz, ux: (ix - g.at[0]) / ul, uz: (iz - g.at[1]) / ul };
    });
    const gate = (id) => gates.find((g) => g.id === id);
    const day = [6.5, 18.5];

    // Elders on benches inside the gate passage, a case before them.
    for (const g of gates.filter((gg) => ['gate-ephraim', 'gate-fish', 'gate-water', 'gate-dung', 'gate-valley', 'gate-fountain'].includes(gg.id))) {
      const tx = -g.uz, tz = g.ux;
      for (const side of [-1, 1]) {
        const bx = g.at[0] + g.ux * 8.2 + tx * side * 5.2, bz = g.at[1] + g.uz * 8.2 + tz * side * 5.2;
        const yaw = Math.atan2(-tx * side, -tz * side);
        const by = gY(bx, bz);
        tk.add(K.bench, bx, by, bz, Math.atan2(g.ux, g.uz), 1, null, 'city-elders');
        for (let k = 0; k < (high ? 3 : 2); k++) {
          const off = (k - 1) * 0.75;
          const x = bx + g.ux * off - tx * side * 0.05, z = bz + g.uz * off - tz * side * 0.05;
          c.add(person('man', { x: x - Math.sin(yaw) * 0.12, y: by, z: z - Math.cos(yaw) * 0.12, yaw, act: ACT.bench, old: rand() < 0.8, prop: PROP.staff, win: [7.5, 17.5], info: 'city-elders', mantle: rand() < 0.3 ? pick(DYED) : pick(WOOL) }));
        }
      }
      // A man pleading his case, another listening.
      const px = g.at[0] + g.ux * 8.2, pz = g.at[1] + g.uz * 8.2;
      c.add(person('man', { x: px, y: gY(px, pz), z: pz, yaw: Math.atan2(tx, tz), act: ACT.talk, win: [8, 16], info: 'city-elders' }));
      c.add(person('man', { x: px + g.ux * 1.2, y: gY(px + g.ux * 1.2, pz + g.uz * 1.2), z: pz + g.uz * 1.2, yaw: Math.atan2(-tx, -tz), act: ACT.idle, win: [8, 16], info: 'city-elders' }));
    }

    // Sellers and buyers in the gate squares: at the stalls when the city
    // has them, otherwise on mats with their goods round the square.
    const stalls = city.stalls?.[period];
    const marketGates = gates.filter((g) => ['gate-fish', 'gate-water', 'gate-ephraim', 'gate-valley'].includes(g.id));
    const sellerAt = (x, z, yaw, seated) => {
      const y = gY(x, z);
      c.add(person(rand() < 0.6 ? 'man' : 'woman', { x, y, z, yaw, act: seated ? ACT.sell : ACT.talk, cycle: seated ? null : [[ACT.talk, 7], [ACT.idle, 9]], win: [7, 17.5], info: 'city-market-folk' }));
      if (seated) {
        tk.add(K.mat, x + Math.sin(yaw) * 0.6, y, z + Math.cos(yaw) * 0.6, yaw, 1, null, 'city-market-folk');
        for (let k = 0; k < 3; k++) {
          const a = yaw + (k - 1) * 0.5, r = 0.9 + rand() * 0.3;
          tk.add(pick([K.jar, K.basket, K.basket, K.bowl]), x + Math.sin(a) * r, y + 0.02, z + Math.cos(a) * r, rand() * 6, 0.8 + rand() * 0.4, null, 'city-market-folk');
        }
      }
      // Buyers: one or two before each seller.
      for (let k = 0; k < (rand() < 0.5 ? 1 : 2); k++) {
        const d = seated ? 2.0 : 1.5, a = yaw + (rand() - 0.5) * 0.9;
        const bx = x + Math.sin(a) * d, bz = z + Math.cos(a) * d;
        c.add(person(rand() < 0.55 ? 'woman' : 'man', { x: bx, y: gY(bx, bz), z: bz, yaw: facing(bx, bz, x, z), act: rand() < 0.5 ? ACT.talk : ACT.idle, prop: rand() < 0.4 ? PROP.basket : PROP.none, win: [7.5, 17], info: 'city-market-folk' }));
      }
    };
    if (stalls?.length) for (const st of stalls) sellerAt(st.x, st.z, st.rot, false);
    else for (const g of marketGates) for (let k = 0; k < (high ? 6 : 3); k++) {
      const a = Math.atan2(g.ux, g.uz) + Math.PI / 2 + (k - 2.5) * 0.5, r = 6 + rand() * 1.2;
      const x = g.ix + Math.sin(a) * r, z = g.iz + Math.cos(a) * r;
      sellerAt(x, z, facing(x, z, g.ix, g.iz), true);
    }

    // Scribes at the Water Gate (and the Horse Gate), writing for a client.
    for (const g of gates.filter((gg) => gg.id === 'gate-water' || gg.id === 'gate-horse')) {
      const tx = -g.uz, tz = g.ux;
      for (const s of [-1, 1]) {
        const x = g.ix + tx * s * 4 - g.ux * 3, z = g.iz + tz * s * 4 - g.uz * 3, y = gY(x, z);
        const yaw = Math.atan2(g.ux, g.uz);
        c.add(person('man', { x, y, z, yaw, act: ACT.write, prop: PROP.scroll, win: [8, 16], info: 'city-scribes', mantle: pick(DYED), pat: 0 }));
        tk.add(K.mat, x, y, z + 0.1, yaw, 0.9, null, 'city-scribes');
        tk.add(K.ink, x + Math.cos(yaw) * 0.45, y + 0.02, z - Math.sin(yaw) * 0.45, yaw, 1, null, 'city-scribes');
        tk.add(K.jar, x - Math.cos(yaw) * 0.6, y, z + Math.sin(yaw) * 0.6, 0, 0.6, null, 'city-scribes');
        const cx = x + g.ux * 1.6, cz = z + g.uz * 1.6;
        c.add(person('man', { x: cx, y: gY(cx, cz), z: cz, yaw: yaw + Math.PI, act: ACT.talk, win: [8.5, 15.5], info: 'city-scribes' }));
      }
    }

    // Children playing in the gate squares (Zech 8:5): hopping games and a chase.
    for (const g of gates.filter((gg) => ['gate-fish', 'gate-water', 'gate-fountain', 'gate-corner', 'gate-valley'].includes(gg.id))) {
      const cx = g.ix - g.ux * 2, cz = g.iz - g.uz * 2;
      for (let k = 0; k < 2; k++) {
        const x = cx + R(-2, 2), z = cz + R(-2, 2);
        c.add(person('child', { x, y: gY(x, z), z, yaw: rand() * 6.28, act: ACT.play, cycle: [[ACT.play, 6], [ACT.idle, 3], [ACT.play, 5], [ACT.talk, 3]], win: [8, 18], info: 'city-streets' }));
      }
      const ring = [];
      for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2, x = cx + Math.cos(a) * 3.2, z = cz + Math.sin(a) * 2.4; ring.push([x, gY(x, z), z]); }
      const path = new Path(ring, { loop: true });
      const lead = c.add(person('child', { path, loop: true, s: rand() * path.length, act: ACT.run, speed: 2.6, pause: [0, 0], lateral: 0, win: [8.5, 17.5], info: 'city-streets' }));
      c.add(person('child', { follow: lead, gap: 1.6, lateral: 0.2, moveAct: ACT.run, info: 'city-streets' }));
    }

    // The smith, by the Corner Gate (the Valley Gate in Solomon's city).
    {
      const g = gate('gate-corner') || gate('gate-valley');
      const tx = -g.uz, tz = g.ux;
      const x = g.ix + tx * 9 + g.ux * 2, z = g.iz + tz * 9 + g.uz * 2, y = gY(x, z);
      const yaw = Math.atan2(tx, tz);
      tk.add(K.forge, x, y, z, yaw, 1, null, 'city-smith');
      const ax = x + Math.sin(yaw) * 0.0 + Math.cos(yaw) * 0.9, az = z + Math.cos(yaw) * 0.0 - Math.sin(yaw) * 0.9;
      c.add(person('worker', { x: ax + Math.sin(yaw) * 0.75, y, z: az + Math.cos(yaw) * 0.75, yaw: yaw + Math.PI, act: ACT.hammer, prop: PROP.hammer, win: [7, 17], info: 'city-smith', build: 1.2, cloth: WOOL[4] }));
      c.add(person('worker', { x: x - Math.cos(yaw) * 0.7 - Math.sin(yaw) * 0.55, y, z: z + Math.sin(yaw) * 0.7 - Math.cos(yaw) * 0.55, yaw, act: ACT.knead, win: [7, 17], info: 'city-smith', scale: 0.85 }));
      fire(S.group, x, y + 0.25, z, 0.3);
      lights.push({ pos: new THREE.Vector3(x, y + 0.8, z), power: 3, range: 8, periods: [period] });
      zone('city-smith', x, y, z, 5, 2.2, 5, [period]);
    }

    // Soldiers drilling in a square, an officer before them.
    {
      const g = gate('gate-corner') || gate('gate-valley');
      const yaw = Math.atan2(g.ux, g.uz) + Math.PI;
      for (let row = 0; row < 2; row++) for (let k = 0; k < (high ? 4 : 2); k++) {
        const tx = -g.uz, tz = g.ux;
        const x = g.ix + g.ux * (2 + row * 1.6) + tx * (k - 1.5) * 1.3 - tx * 4, z = g.iz + g.uz * (2 + row * 1.6) + tz * (k - 1.5) * 1.3 - tz * 4;
        c.add(person('soldier', { x, y: gY(x, z), z, yaw, act: ACT.drill, win: [7, 11], info: 'city-soldiers', phase: row * 0.4 + k * 0.1 }));
      }
      const ox = g.ix - g.ux * 1.5 - (-g.uz) * 4, oz = g.iz - g.uz * 1.5 - g.ux * 4;
      c.add(person('soldier', { x: ox, y: gY(ox, oz), z: oz, yaw: yaw + Math.PI, act: ACT.talk, win: [7, 11], info: 'city-soldiers' }));
    }

    // Watchmen walking the wall tops and standing on the gate roofs, day and
    // night, with watch fires on a few gates after dark.
    {
      const plan = period === 'early'
        ? wallPlan(EARLY_WALL, GATES.filter((g) => g.periods.includes('early')), 8, 45, 'sp')
        : wallPlan(CITY_WALL, GATES.filter((g) => g.periods.includes('late')), 10, 50, 'square');
      const runs = plan.walk.filter((r) => r.length >= 6);
      for (let i = 0; i < N(period === 'early' ? 10 : 22) && runs.length; i++) {
        const run = runs[Math.floor(rand() * runs.length)];
        const k = Math.floor(rand() * (run.length - 5));
        const path = new Path(run.slice(k, k + 6));
        c.add(person('soldier', { path, s: rand() * path.length, speed: 0.6, pause: [6, 20], lateral: 0, always: true, info: 'city-watchmen', prop: rand() < 0.3 ? PROP.staff : PROP.arms }));
      }
      for (const t of plan.towers.filter((_, i) => i % (high ? 3 : 6) === 0)) {
        c.add(person('soldier', { x: t.x, y: t.y, z: t.z, yaw: rand() * 6.28, always: true, info: 'city-watchmen' }));
      }
      plan.gateTops.forEach((g, i) => {
        c.add(person('soldier', { x: g.x, y: g.y, z: g.z, yaw: rand() * 6.28, act: ACT.idle, always: true, info: 'city-watchmen' }));
        if (i % 2 === 0) {
          const fx = g.x + Math.cos(g.ang) * 2, fz = g.z + Math.sin(g.ang) * 2;
          tk.add(K.hearth, fx, g.y, fz, 0, 1, null, 'city-watchmen');
          fire(S.group, fx, g.y + 0.05, fz, 0.4);
          lights.push({ pos: new THREE.Vector3(fx, g.y + 1, fz), power: 6, range: 14, nightOnly: true, periods: [period] });
          c.add(person('soldier', { x: fx + 1.2, y: g.y, z: fz, yaw: -Math.PI / 2, act: ACT.sit, win: [19, 6], info: 'city-watchmen', prop: PROP.none }));
        }
      });
    }

    // Women drawing water at the Gihon, morning and evening (Gen 24:11):
    // a queue with jars by the spring tower, a woman hauling up a jar, and
    // a stream of carriers up to the Water Gate.
    {
      const g = gate('gate-water');
      const sx = GIHON.x, sz = GIHON.z - 11;
      const Yt = (x, z) => terrainY(x, z, site);
      const yaw = Math.PI;                    // toward the spring, to the south
      c.add(person('woman', { x: sx, y: Yt(sx, sz), z: sz, yaw, act: ACT.haul, win: [5.5, 9], win2: [16.5, 19.5], info: 'city-water', jitter: 0.3 }));
      c.add(person('woman', { x: sx + 1, y: Yt(sx + 1, sz + 0.6), z: sz + 0.6, yaw, act: ACT.draw, win: [5.5, 9], win2: [16.5, 19.5], info: 'city-water', jitter: 0.3 }));
      tk.add(K.jar, sx - 0.8, Yt(sx - 0.8, sz), sz, 0, 1, null, 'city-water');
      for (let k = 0; k < N(8); k++) {
        const x = sx - 2 - k * 0.9, z = sz - 1.2 - Math.sin(k) * 0.4;
        c.add(person(rand() < 0.85 ? 'woman' : 'child', { x, y: Yt(x, z), z, yaw: facing(x, z, sx, sz), act: rand() < 0.3 ? ACT.talk : ACT.idle, win: [5.5, 9], win2: [16.5, 19.5], info: 'city-water' }));
        tk.add(K.jar, x + 0.4, Yt(x + 0.4, z + 0.3), z + 0.3, rand() * 6, 0.9, null, 'city-water');
      }
      const pts = smoothPts([[sx - 3, sz - 3], [(sx + g.ix) / 2 + 6, (sz + g.iz) / 2 - 4], [g.at[0] + 4, g.at[1]], [g.ix, g.iz]], 2).map(([x, z]) => [x, Math.max(Yt(x, z), gY(x, z) - 30), z]);
      const path = new Path(pts.map(([x, , z]) => [x, insidePolygon(x, z, period === 'early' ? [[0, 0]] : LATE_POLY) ? gY(x, z) : Yt(x, z), z]));
      for (let k = 0; k < N(12); k++) {
        c.add(person(rand() < 0.9 ? 'woman' : 'child', {
          path, s: rand() * path.length, dir: rand() < 0.5 ? 1 : -1, lateral: R(-0.8, 0.8), speed: 0.8 + rand() * 0.3,
          act: ACT.walk, prop: PROP.none, back: { act: ACT.carry, prop: PROP.jar }, pauses: [[5, 25], [10, 40]], ends: [ACT.draw, ACT.idle],
          win: [5.5, 9.5], win2: [16, 19.5], info: 'city-water',
        }));
      }
      zone('city-water', sx - 3, Yt(sx - 3, sz), sz, 16, 2.2, 6, [period]);
    }

    // Siloam (from Hezekiah's time): drawing and washing at the pool's edge,
    // the steps, a queue, carriers up the street.
    if (period === 'late') {
      const P = SILOAM_POOL;
      const ys = [[P.x - P.w / 2, P.z - P.d / 2], [P.x + P.w / 2, P.z - P.d / 2], [P.x - P.w / 2, P.z + P.d / 2], [P.x + P.w / 2, P.z + P.d / 2]].map(([x, z]) => terrainY(x, z));
      const wy = Math.max(...ys) + 0.5;
      const rimZ = P.z - P.d / 2 - 0.6;
      for (let k = 0; k < N(12); k++) {
        const x = P.x - P.w / 2 + 1 + rand() * (P.w - 2);
        if (Math.abs(x - P.x) < 4.5) continue;
        const wash = rand() < 0.45;
        c.add(person('woman', { x, y: wy + 0.7, z: rimZ, yaw: 0, act: wash ? ACT.wash : ACT.draw, win: wash ? [8, 15] : [5.5, 9], win2: wash ? null : [16.5, 19.5], info: 'city-water' }));
        if (!wash) tk.add(K.jar, x + 0.6, wy + 0.7, rimZ - 0.2, 0, 0.9, null, 'city-water');
        else tk.add(K.bowl, x, wy + 0.7, rimZ - 0.5, 0, 1.6, [0.9, 0.85, 0.75], 'city-water');
      }
      for (let i = 0; i < 2; i++) {
        const st = 1 + i;
        c.add(person('woman', { x: P.x - 1.5 + i * 3, y: wy + 0.5 - st * 0.35, z: P.z - P.d / 2 + st * 0.8 + 0.4, yaw: 0, act: ACT.draw, win: [5.5, 9], win2: [16.5, 19.5], info: 'city-water' }));
      }
      const qz = P.z - P.d / 2 - 4;
      for (let k = 0; k < N(7); k++) {
        const x = P.x - 3 - k * 0.95, z = qz - Math.sin(k * 1.3) * 0.5;
        c.add(person('woman', { x, y: gY(x, z), z, yaw: facing(x, z, P.x, P.z), act: k % 3 === 0 ? ACT.talk : ACT.idle, win: [5.5, 9], win2: [16.5, 19.5], info: 'city-water' }));
        tk.add(K.jar, x + 0.45, gY(x + 0.45, z), z + 0.2, 0, 0.9, null, 'city-water');
      }
      const path = new Path(smoothPts([[P.x - 6, qz - 1], [-128, 880], [-140, 840], [-150, 790]]).map(([x, z]) => [x, gY(x, z), z]));
      for (let k = 0; k < N(12); k++) {
        c.add(person('woman', {
          path, s: rand() * path.length, dir: rand() < 0.5 ? 1 : -1, lateral: R(-1, 1), speed: 0.8 + rand() * 0.3,
          act: ACT.carry, prop: PROP.jar, back: { act: ACT.walk, prop: PROP.none }, pauses: [[10, 40], [5, 20]], ends: [ACT.idle, ACT.idle],
          win: [5.5, 9.5], win2: [16, 19.5], info: 'city-water',
        }));
      }
      zone('city-water', P.x, wy - 0.5, rimZ - 2, P.w + 4, 3, 6, ['late']);
      labels.push({ label: 'Drawing water (Gen 24:11)', pos: new THREE.Vector3(P.x - 10, wy + 5, rimZ - 3), periods: ['late'], info: 'city-water', far: 400 });
    }

    if (period === 'late') {
      // The bakers' street (Jer 37:21): ovens along the street down from the Ophel.
      const pts = smoothPts([[4, 345], [-12, 372], [-22, 395], [-22, 425]], 1);
      const path = new Path(pts.map(([x, z]) => [x, gY(x, z), z]));
      const tmp = {};
      for (let k = 0; k < (high ? 7 : 4); k++) {
        const p = path.sample(4 + k * (path.length - 8) / 6, tmp);
        const len = Math.hypot(p.dx, p.dz) || 1, side = k % 2 ? 1 : -1;
        const nx = p.dz / len * side, nz = -p.dx / len * side;
        const ox = p.x + nx * 1.6, oz = p.z + nz * 1.6, oy = gY(ox, oz);
        tk.add(K.oven, ox, oy, oz, rand() * 6, 1, null, 'city-bakers');
        const bx = ox - nx * 0.15 + p.dx / len * 0.8, bz = oz - nz * 0.15 + p.dz / len * 0.8;
        c.add(person(rand() < 0.6 ? 'woman' : 'man', { x: bx, y: gY(bx, bz), z: bz, yaw: facing(bx, bz, ox, oz), act: ACT.bake, cycle: [[ACT.bake, 14], [ACT.knead, 10], [ACT.idle, 4]], win: [4.5, 12.5], info: 'city-bakers' }));
        const tx = ox - p.dx / len * 1.1, tz = oz - p.dz / len * 1.1;
        tk.add(K.trough, tx, gY(tx, tz), tz, Math.atan2(p.dx, p.dz), 1, null, 'city-bakers');
        if (k % 2 === 0) tk.add(K.basket, ox + nx * 0.5, oy, oz + nz * 0.5, 0, 1, [1.1, 0.95, 0.8], 'city-bakers');
      }
      for (let k = 0; k < N(5); k++) c.add(person(rand() < 0.5 ? 'child' : 'woman', { path, s: rand() * path.length, dir: rand() < 0.5 ? 1 : -1, lateral: R(-1, 1), act: ACT.carry, prop: PROP.tray, pause: [3, 12], win: [5, 13], info: 'city-bakers' }));
      const mid = path.sample(path.length / 2, tmp);
      zone('city-bakers', mid.x, mid.y, mid.z, 20, 2.2, 40, ['late']);
      labels.push({ label: 'Bakers\' street (Jer 37:21)', pos: new THREE.Vector3(mid.x, mid.y + 6, mid.z), periods: ['late'], info: 'city-bakers', far: 500 });

      // The potters' quarter outside the Potsherd Gate (Jer 19:2).
      const g = gate('gate-dung');
      const ox = -g.ux, oz = -g.uz, tx = -oz, tz = ox;
      const cx = g.at[0] + ox * 22, cz = g.at[1] + oz * 22;
      const Yt = (x, z) => terrainY(x, z, 'square');
      const W = (a, b) => [cx + tx * a + ox * b, cz + tz * a + oz * b];
      const yawOut = Math.atan2(ox, oz);
      for (let k = 0; k < 3; k++) {
        const [x, z] = W(-6 + k * 3.2, 0);
        const y = Yt(x, z);
        tk.add(K.wheel, x + ox * 0.5, y, z + oz * 0.5, yawOut, 1, null, 'city-potters');
        tk.add(K.stool, x - ox * 0.08, y, z - oz * 0.08, yawOut, 1, null, 'city-potters');
        c.add(person('man', { x, y, z, yaw: yawOut, act: ACT.potter, win: [6.5, 17.5], info: 'city-potters', cloth: WOOL[2], feet: 1, look: look({ head: 1, beard: 2, feet: 1 }) }));
      }
      for (let r = 0; r < 3; r++) for (let k = 0; k < (high ? 8 : 4); k++) {
        const [x, z] = W(-7 + k * 1.1 + r * 0.4, 3 + r * 1.0);
        tk.add(rand() < 0.75 ? K.jar : K.bowl, x, Yt(x, z), z, rand() * 6, 0.7 + rand() * 0.5, [1.25, 1.2, 1.15], 'city-potters');
      }
      {
        const [x, z] = W(7, 4);
        tk.add(K.kiln, x, Yt(x, z), z, yawOut + Math.PI, 1, null, 'city-potters');
        fire(S.group, x - ox * 1.35, Yt(x, z) + 0.05, z - oz * 1.35, 0.35);
        lights.push({ pos: new THREE.Vector3(x - ox * 1.5, Yt(x, z) + 0.6, z - oz * 1.5), power: 3, range: 8, periods: ['late'] });
        c.add(person('worker', { x: x - ox * 2.2, y: Yt(x - ox * 2.2, z - oz * 2.2), z: z - oz * 2.2, yaw: yawOut, act: ACT.crouch, prop: PROP.none, win: [6, 18], info: 'city-potters' }));
        c.add(person('worker', { x: x + tx * 2, y: Yt(x + tx * 2, z + tz * 2), z: z + tz * 2, yaw: yawOut + 1, act: ACT.backload, prop: PROP.bundle, win: [6, 18], info: 'city-potters' }));
      }
      {
        // Treading the clay (Isa 41:25), round and round in a pit.
        const [x, z] = W(-4, -3.5);
        const ring = [];
        for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI * 2; ring.push([x + Math.cos(a) * 0.9, Yt(x, z) - 0.05, z + Math.sin(a) * 0.9]); }
        tk.add(K.bowl, x, Yt(x, z) - 0.15, z, 0, 6, [0.9, 0.75, 0.6], 'city-potters');
        c.add(person('worker', { path: new Path(ring, { loop: true }), loop: true, speed: 0.45, pause: [0, 0], lateral: 0, win: [7, 16], info: 'city-potters', feet: 1 }));
      }
      {
        const [x, z] = W(2, -5);
        tk.add(K.sherds, x, Yt(x, z), z, 0, 2.2, null, 'city-potters');
        const [bx, bz] = W(-1, -6);
        c.add(person('woman', { x: bx, y: Yt(bx, bz), z: bz, yaw: yawOut + Math.PI, act: ACT.carry, prop: PROP.jar, info: 'city-potters', win: [7, 17] }));
      }
      zone('city-potters', cx + ox * 2, Yt(cx, cz) - 0.5, cz + oz * 2, 22, 3, 18, ['late']);
      labels.push({ label: 'Potters (Jer 18:1–4)', pos: new THREE.Vector3(cx, Yt(cx, cz) + 7, cz), periods: ['late'], info: 'city-potters', far: 600 });

      // Dyers by the Fountain Gate.
      {
        const gg = gate('gate-fountain');
        const tx2 = -gg.uz, tz2 = gg.ux;
        const x0 = gg.ix + tx2 * 8, z0 = gg.iz + tz2 * 8;
        for (let k = 0; k < 3; k++) {
          const x = x0 + gg.ux * (k - 1) * 1.3, z = z0 + gg.uz * (k - 1) * 1.3, y = gY(x, z);
          tk.add(K.vat, x, y, z, 0, 1, null, 'city-dyers');
          if (k !== 1) c.add(person('worker', { x: x - tx2 * 0.8, y, z: z - tz2 * 0.8, yaw: Math.atan2(tx2, tz2), act: ACT.wash, win: [7, 16], info: 'city-dyers', skin: lin([0.55, 0.38, 0.3]) }));
        }
        const sx = x0 + tx2 * 2.4, sz = z0 + tz2 * 2.4;
        tk.add(K.skeins, sx, gY(sx, sz), sz, Math.atan2(gg.ux, gg.uz) + Math.PI / 2, 1, [0.62, 0.12, 0.08], 'city-dyers');
        tk.add(K.skeins, sx + gg.ux * 3, gY(sx + gg.ux * 3, sz + gg.uz * 3), sz + gg.uz * 3, Math.atan2(gg.ux, gg.uz) + Math.PI / 2, 1, [0.16, 0.2, 0.45], 'city-dyers');
        zone('city-dyers', x0 + tx2, gY(x0, z0), z0 + tz2, 9, 2.4, 9, ['late']);
      }

      // Pilgrims going up together from the Fish Gate to the temple courts.
      {
        const gf = gate('gate-fish');
        const pts = smoothPts([[gf.ix, gf.iz], [-200, 110], [-140, 96], [-84, 84]]).map(([x, z]) => [x, gY(x, z), z]);
        const path = new Path(pts);
        const lead = c.add(person('man', { path, s: rand() * path.length, speed: 0.95, pause: [60, 140], lateral: 0, win: [6.5, 12], info: 'city-pilgrims', prop: PROP.staff }));
        for (let k = 0; k < N(13); k++) {
          const kind = rand() < 0.35 ? 'man' : rand() < 0.7 ? 'woman' : 'child';
          c.add(person(kind, { follow: lead, gap: 1.2 + k * 0.7 + rand() * 0.6, lateral: R(-1.4, 1.4), info: 'city-pilgrims', prop: kind === 'woman' && rand() < 0.3 ? PROP.basket : PROP.none }));
        }
      }

      // Mourners before a tomb across the Kidron (the Silwan monolith).
      {
        const tx = 243.5, tz = 505, ty = terrainY(tx, tz);
        tk.add(K.bier, tx, ty, tz, 0, 1, null, 'city-mourners');
        for (let k = 0; k < N(7); k++) {
          const a = Math.PI * 0.6 + (k / 6) * Math.PI * 0.8, r = 3 + rand();
          const x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r * 1.3;
          c.add(person(k < 4 ? 'woman' : 'man', { x, y: terrainY(x, z), z, yaw: facing(x, z, tx, tz), act: k < 4 ? ACT.mourn : k < 6 ? ACT.grieve : ACT.idle, win: [9, 15], info: 'city-mourners', mantle: lin([0.22, 0.2, 0.19]) }));
        }
        zone('city-mourners', tx - 1, ty, tz, 9, 2.2, 10, ['late']);
      }

      // Horses and a chariot at the Horse Gate (Jer 31:40), horses held by a groom.
      {
        const gh = gate('gate-horse');
        const tx = -gh.uz, tz = gh.ux;
        const ring = [];
        for (let k = 0; k <= 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const x = gh.ix + gh.ux * 2 + tx * Math.cos(a) * 9, z = gh.iz + gh.uz * 2 + tz * Math.cos(a) * 9;
          ring.push([x + gh.ux * Math.sin(a) * 3.5, gY(x + gh.ux * Math.sin(a) * 3.5, z + gh.uz * Math.sin(a) * 3.5), z + gh.uz * Math.sin(a) * 3.5]);
        }
        const path = new Path(ring, { loop: true });
        const h1 = c.add(beast('horse', { path, loop: true, speed: 1.3, pause: [0, 0], lateral: 0, look: CHARIOT, win: [7, 17], info: 'city-chariots' }));
        c.add(beast('horse', { follow: h1, gap: 0, lateral: 0.9, info: 'city-chariots' }));
        for (const [lat, prop] of [[0.2, PROP.none], [0.75, PROP.arms]]) {
          c.add(person('soldier', { follow: h1, gap: 1.85, lateral: lat, lift: 0.68, ride: true, act: ACT.idle, prop, info: 'city-chariots' }));
        }
        for (let k = 0; k < 2; k++) {
          const x = gh.ix - tx * 6 + gh.ux * k * 1.4, z = gh.iz - tz * 6 + gh.uz * k * 1.4;
          c.add(beast('horse', { x, y: gY(x, z), z, yaw: Math.atan2(tx, tz), act: ACT.idle, win: [6.5, 18.5], info: 'city-chariots' }));
        }
        const gx = gh.ix - tx * 4.6, gz = gh.iz - tz * 4.6;
        c.add(person('worker', { x: gx, y: gY(gx, gz), z: gz, yaw: Math.atan2(-tx, -tz), act: ACT.idle, prop: PROP.staff, win: [6.5, 18.5], info: 'city-chariots' }));
        labels.push({ label: 'Horse Gate stables (Jer 31:40)', pos: new THREE.Vector3(gh.ix, gY(gh.ix, gh.iz) + 7, gh.iz), periods: ['late'], info: 'city-chariots', far: 500 });
      }

      // A runner on the road from the north, the watchman's news (2 Sam 18:24).
      {
        const pts = [];
        const road = ROADS[1].pts;
        for (let i = 0; i < 3; i++) {
          const [ax, az] = road[i], [bx, bz] = road[i + 1];
          for (let q = 0; q < 12; q++) { const x = ax + (bx - ax) * q / 12, z = az + (bz - az) * q / 12; pts.push([x, terrainY(x, z), z]); }
        }
        c.add(person('man', { path: new Path(pts), act: ACT.run, speed: 4.2, pause: [40, 120], lateral: 1.5, win: [6, 18], info: 'city-watchmen', look: look({ head: 1, mantle: 0, beard: 1 }), face: 9 }));
      }
    }

    // A shepherd taking the flock out through a gate in the morning and home at evening.
    {
      const g = period === 'late' ? gate('gate-fish') : gate('gate-water');
      const out = period === 'late' ? [[g.ix, g.iz], [g.at[0] - 4, g.at[1] - 14], [-280, 30], [-300, -60], [-330, -170]] : [[g.ix, g.iz], [g.at[0] + 14, g.at[1] - 6], [170, 515], [260, 470], [330, 430]];
      const pts = smoothPts(out).map(([x, z]) => [x, insidePolygon(x, z, period === 'late' ? LATE_POLY : [[1e9, 0]]) ? gY(x, z) : terrainY(x, z, site), z]);
      const path = new Path(pts);
      const sh = c.add(person('man', { path, s: 0, dir: 1, speed: 0.6, pauses: [[300, 600], [900, 1500]], ends: [ACT.idle, ACT.sit], act: ACT.lead, prop: PROP.staff, lateral: 0, win: [6, 19.5], info: 'city-shepherd', old: false }));
      for (let k = 0; k < N(16); k++) c.add(beast(rand() < 0.3 ? 'goat' : 'sheep', { follow: sh, gap: -(1.5 + k * 0.55 + rand()), lateral: R(-1.6, 1.6), restAct: ACT.graze, info: 'city-shepherd' }));
      c.add(person('child', { follow: sh, gap: -(3 + N(16) * 0.6), lateral: 0.8, prop: PROP.staff, info: 'city-shepherd' }));
    }

    // --- Near the viewer: walkers in the lanes and work at the doors ---------------------
    // A fixed pool of people that moves to the lanes and doorsteps around
    // wherever the viewer is, so every lane you walk has people in it.
    const short = lanePaths(grid, rand, high ? 1400 : 500, 28, 8);
    c.setPathPool(short, 40, { reach: 2, far: 110 });
    for (let i = 0; i < (high ? 240 : 50) && short.length; i++) {
      const path = short[Math.floor(rand() * short.length)];
      const r = rand(), q = rand();
      const kind = r < 0.38 ? 'man' : r < 0.78 ? 'woman' : r < 0.93 ? 'child' : 'worker';
      const o = { path, s: rand() * path.length, dir: rand() < 0.5 ? 1 : -1, pause: [1, 12], lateral: R(-0.5, 0.5), local: true, win: i % 9 === 0 ? null : [5.5, 20.5], info: 'city-people' };
      if (kind === 'woman') {
        if (q < 0.3) Object.assign(o, { act: ACT.carry, prop: PROP.jar });
        else if (q < 0.42) o.prop = PROP.basket;
        else if (q < 0.5) o.prop = PROP.spindle;
        else if (q < 0.56) Object.assign(o, { act: ACT.backload, prop: PROP.bundle, speed: 0.85 });
      } else if (kind === 'man') {
        if (q < 0.12) Object.assign(o, { act: ACT.shoulder, prop: PROP.sack });
        else if (q < 0.24) Object.assign(o, { old: true, act: ACT.hobble, prop: PROP.staff, speed: 0.6 });
        else if (q < 0.3) o.prop = PROP.lamp;
      } else if (kind === 'child') {
        if (q < 0.5) Object.assign(o, { act: ACT.run, speed: 2.5 + rand(), pause: [0.5, 4] });
      } else Object.assign(o, { act: ACT.shoulder, prop: PROP.sack });
      c.add(person(kind, o));
    }

    // Work stations at the doors of every third house (the others' doorsteps
    // hold the jars and clutter of the street), and families on the roofs.
    const doors = [];
    houses.forEach((h, i) => { if (i % 3 === 0) doors.push(h); });
    const bins = new Map(), CELL = 40;
    for (const h of doors) {
      const k = Math.floor(h.x / CELL) + ',' + Math.floor(h.z / CELL);
      if (!bins.has(k)) bins.set(k, []);
      bins.get(k).push(h);
    }
    const ROLES = [
      // [weight, info, hours, build(st)]: each adds agents and tools in the door frame.
      [3, 'city-household', [4.5, 11], (st) => { st.a(person('woman', { act: ACT.grind }), 0, 0.75, 'side'); st.t(K.quern, 0.62, 0.75, 'side'); st.t(K.jar, -0.5, 0.35, 0, 0.8); }],
      [2, 'city-household', [5, 12.5], (st) => { st.a(person('woman', { act: ACT.bake, cycle: [[ACT.bake, 12], [ACT.knead, 9], [ACT.idle, 4]] }), 0, 0.9, 'side'); st.t(K.oven, 0.75, 0.9, 0); st.t(K.trough, -0.7, 0.7, 'side'); }],
      [2, 'city-household', [7, 17.5], (st) => { st.a(person('woman', { act: ACT.weave }), 0, 1.0, 'wall'); st.t(K.loom, 0, 0.32, 'out'); }],
      [2, 'city-household', [7, 18], (st) => { st.a(person('woman', { act: ACT.spin, prop: PROP.spindle }), 0, 0.7, 'out'); st.a(person('child', { act: ACT.play, cycle: [[ACT.play, 6], [ACT.sit, 8], [ACT.idle, 3]] }), 1.2, 1.1, 'side'); }],
      [2, 'city-streets', [8, 18.5], (st) => { st.t(K.bench, 0, 0.45, 'out'); for (const x of [-0.6, 0.6]) st.a(person('man', { act: ACT.bench, old: true, prop: PROP.staff }), x, 0.58, 'out'); }],
      [1, 'city-streets', [8, 18], (st) => { st.a(person('woman', { act: ACT.sit, old: true }), 0, 0.55, 'out'); st.a(person('woman', { act: ACT.sit, prop: PROP.spindle }), 0.9, 0.6, 'out'); }],
      [2, 'city-streets', [8, 18.5], (st) => { for (let k = 0; k < 3; k++) st.a(person('child', { act: ACT.play, cycle: [[ACT.play, 5 + k], [ACT.idle, 2], [ACT.talk, 3]] }), -0.8 + k * 0.8, 1.2 + (k % 2) * 0.5, 'any'); }],
      [2, 'city-people', [7, 19.5], (st) => { st.a(person('man', { act: ACT.talk }), 0, 1.1, 'side'); st.a(person('man', { act: ACT.idle }), 1.1, 1.1, 'faceL'); }],
      [1, 'city-household', [6, 10], (st) => { st.a(person('woman', { act: ACT.sweep, prop: PROP.broom }), 0, 0.9, 'side'); }],
      [1, 'city-household', [8, 15], (st) => { st.a(person('woman', { act: ACT.wash }), 0, 0.75, 'side'); st.t(K.bowl, 0.6, 0.75, 0, 2.2, [0.9, 0.85, 0.78]); }],
      [1, 'city-people', [7, 17], (st) => { st.a(person('man', { act: ACT.sit, prop: PROP.basket }), 0, 0.6, 'out'); st.t(K.basket, 0.7, 0.8, 0); }],
    ];
    const roleTotal = ROLES.reduce((a, r) => a + r[0], 0);
    const pickRole = () => { let x = rand() * roleTotal; for (const r of ROLES) if ((x -= r[0]) <= 0) return r; return ROLES[0]; };
    const mkStation = (role, roof) => {
      const st = { agents: [], tools: [], roof, house: null };
      const [, info, hours, make] = role || [0, 'city-streets', [16.5, 21.5], null];
      st.a = (o, dx, dz, face) => { const a = c.add({ ...o, info, win: hours, y: -500 }); a.hidden = true; st.agents.push({ a, dx, dz, face }); };
      st.t = (kind, dx, dz, face, s = 1, color = null) => st.tools.push({ i: tk.add(kind, 0, -999, 0, 0, s, color, info), dx, dz, face });
      if (roof) {
        st.a(person('man', { act: ACT.sit }), -0.6, 0, 'any');
        st.a(person('woman', { act: rand() < 0.5 ? ACT.sit : ACT.spin, prop: PROP.spindle }), 0.5, 0.3, 'any');
        if (rand() < 0.6) st.a(person('child', { act: ACT.play, cycle: [[ACT.play, 5], [ACT.sit, 8]] }), 0, -0.9, 'any');
        if (rand() < 0.5) st.a(person(rand() < 0.5 ? 'man' : 'woman', { act: ACT.talk }), 1.2, -0.6, 'any');
        for (const s of st.agents) s.a.win = [16.5, 21.5];
      } else make(st);
      S.stations.push(st);
    };
    for (let i = 0; i < (high ? 56 : 14); i++) mkStation(pickRole(), false);
    for (let i = 0; i < (high ? 18 : 5); i++) mkStation(null, true);
    S.stationHouses = { bins, CELL, used: new Set(), grid };
    return S;
  };

  const late = townScenes('late');
  const early = townScenes('early');

  // --- The fields (both periods outside the late walls) ------------------------------------
  const F = scene('trades-fields', ['early', 'late'], 'city-harvest');
  {
    const { crowd: c, kit: tk } = F;
    const Y = (x, z) => terrainY(x, z, 'square');
    const cx0 = -150, cz0 = 600;
    const barley = ctx.plan.fields.filter((f) => f.kind === 1 && !insidePolygon(f.x, f.z, LATE_POLY) && ctx.free(f.x, f.z, 10))
      .sort((a, b) => Math.hypot(a.x - cx0, a.z - cz0) - Math.hypot(b.x - cx0, b.z - cz0)).slice(0, high ? 7 : 3);
    for (const f of barley) {
      const ax = Math.cos(f.ang), az = Math.sin(f.ang), bx = -az, bz = ax;
      const P = (u, v) => [f.x + ax * u + bx * v, f.z + az * u + bz * v];
      const front = -f.w / 2 + f.w * (0.35 + rand() * 0.3);
      const yawFwd = Math.atan2(ax, az);
      const lineN = Math.min(high ? 7 : 4, Math.floor(f.d / 2.2));
      // Reapers in a line across the field, cutting forward.
      for (let k = 0; k < lineN; k++) {
        const [x, z] = P(front + R(-0.6, 0.6), -f.d * 0.35 + k * (f.d * 0.7) / Math.max(1, lineN - 1));
        c.add(person(rand() < 0.85 ? 'worker' : 'man', { x, y: Y(x, z), z, yaw: yawFwd + R(-0.2, 0.2), act: ACT.reap, prop: PROP.sickle, cycle: [[ACT.reap, 22], [ACT.idle, 3], [ACT.reap, 18], [ACT.bind, 6]], win: [6, 12], win2: [13, 18], info: 'city-harvest' }));
      }
      // Binders, then gleaners, sheaves standing behind.
      for (let k = 0; k < Math.ceil(lineN / 2); k++) {
        const [x, z] = P(front - 3 - rand(), R(-f.d * 0.35, f.d * 0.35));
        c.add(person('worker', { x, y: Y(x, z), z, yaw: yawFwd + R(-0.8, 0.8), act: ACT.bind, cycle: [[ACT.bind, 12], [ACT.idle, 3]], win: [6, 12], win2: [13, 18], info: 'city-harvest' }));
      }
      for (let k = 0; k < Math.ceil(lineN / 2); k++) {
        const [x, z] = P(front - 6 - rand() * 4, R(-f.d * 0.4, f.d * 0.4));
        c.add(person(rand() < 0.75 ? 'woman' : 'child', { x, y: Y(x, z), z, yaw: rand() * 6.28, act: ACT.bind, prop: PROP.basket, cycle: [[ACT.bind, 9], [ACT.idle, 3], [ACT.crouch, 5]], win: [6.5, 12], win2: [13, 18], info: 'city-harvest', mantle: pick(WOOL) }));
      }
      for (let k = 0; k < (high ? 14 : 6); k++) {
        const [x, z] = P(front - 1.5 - rand() * (front + f.w / 2 - 1.5), R(-f.d * 0.42, f.d * 0.42));
        tk.add(K.sheaf, x, Y(x, z), z, rand() * 6, 0.8 + rand() * 0.4, null, 'city-harvest');
      }
      // The noon meal at the edge of the field (Ruth 2:14), a water jar, the owner.
      const [mx, mz] = P(-f.w / 2 - 1.5, R(-f.d * 0.3, f.d * 0.3));
      tk.add(K.jar, mx, Y(mx, mz), mz, 0, 1, null, 'city-harvest');
      tk.add(K.basket, mx + 0.6, Y(mx, mz), mz + 0.4, 0, 1, [1.1, 0.95, 0.8], 'city-harvest');
      for (let k = 0; k < lineN; k++) {
        const a = (k / lineN) * Math.PI * 2, x = mx + Math.cos(a) * 1.6, z = mz + Math.sin(a) * 1.6;
        c.add(person(k % 3 ? 'worker' : 'woman', { x, y: Y(x, z), z, yaw: facing(x, z, mx, mz), act: k % 2 ? ACT.sit : ACT.sell, win: [12, 13], jitter: 0.2, info: 'city-harvest' }));
      }
      const [ox, oz] = P(front - 4, f.d / 2 + 1.5);
      c.add(person('man', { x: ox, y: Y(ox, oz), z: oz, yaw: yawFwd, act: ACT.talk, prop: PROP.staff, mantle: pick(DYED), pat: 2, win: [7, 17], info: 'city-harvest' }));
      // A donkey laden with sheaves, waiting.
      const [dx, dz] = P(-f.w / 2 - 3, f.d / 2);
      c.add(beast('donkey', { x: dx, y: Y(dx, dz), z: dz, yaw: yawFwd + 1.2, act: ACT.idle, look: PANNIERS, win: [7, 17], info: 'city-harvest' }));
      zone('city-harvest', f.x, Y(f.x, f.z) - 1, f.z, f.w, 3, f.d, ['early', 'late']);
    }
    if (barley[0]) labels.push({ label: 'Barley harvest (Ruth 2)', pos: new THREE.Vector3(barley[0].x, Y(barley[0].x, barley[0].z) + 8, barley[0].z), periods: ['early', 'late'], info: 'city-harvest', far: 900 });

    // Camel caravan on the Jericho road; a donkey train on the north road.
    const roadPath = (pts, from, to) => {
      const out = [];
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 6);
        for (let q = 0; q < n; q++) {
          if (acc >= from && acc <= to) { const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n; out.push([x, Y(x, z), z]); }
          acc += L / n;
        }
      }
      return new Path(out);
    };
    {
      const path = roadPath(ROADS[0].pts, 260, 1500);
      const lead = c.add(person('man', { path, s: rand() * path.length, speed: 0.95, pause: [30, 90], lateral: -1.4, act: ACT.lead, prop: PROP.staff, win: [6, 18], info: 'city-caravan', cloth: lin([0.62, 0.52, 0.38]), look: look({ head: 3, beard: 3, mantle: 1 }), face: 12, skin: lin([0.5, 0.35, 0.24]) }));
      for (let k = 0; k < (high ? 7 : 4); k++) c.add(beast('camel', { follow: lead, gap: 2.8 + k * 3.4, lateral: 0, look: rand() < 0.85 ? look({ load: 1 }) : 0, info: 'city-caravan' }));
      c.add(person('man', { follow: lead, gap: 4 + (high ? 7 : 4) * 3.4, lateral: 0.8, prop: PROP.staff, info: 'city-caravan', look: look({ head: 3, beard: 2 }) }));
    }
    {
      const path = roadPath(ROADS[1].pts, 120, 900);
      const lead = c.add(person('worker', { path, s: rand() * path.length, speed: 0.9, pause: [20, 60], lateral: 1.2, act: ACT.lead, prop: PROP.staff, win: [6, 18] }));
      for (let k = 0; k < (high ? 5 : 3); k++) c.add(beast('donkey', { follow: lead, gap: 2.1 + k * 2.2, lateral: 0, look: PANNIERS }));
    }
  }

  // --- 573 BC ------------------------------------------------------------------------------
  const RU = scene('trades-ruin', ['ruin'], 'city-poor');
  {
    const { crowd: c, kit: tk } = RU;
    const houses = city.houses.late;
    const nearest = (x, z, n) => houses.map((h, i) => [Math.hypot(h.x - x, h.z - z), i]).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, i]) => houses[i]);
    // "How lonely sits the city" (Lam 1:1): a woman alone in the ruins of a house.
    const [lone] = nearest(-30, 520, 1);
    if (lone) c.add(person('woman', { x: lone.x, y: lone.floor, z: lone.z, yaw: lone.rot, act: ACT.grieve, always: true, info: 'city-poor', mantle: lin([0.2, 0.19, 0.18]), cloth: lin([0.35, 0.31, 0.27]) }));
    // Scavengers picking through the burned houses.
    for (const h of nearest(10, 640, 40).filter((_, i) => i % 6 === 2).slice(0, high ? 6 : 3)) {
      c.add(person(rand() < 0.5 ? 'man' : 'woman', { x: h.x + R(-1, 1), y: h.floor, z: h.z + R(-1, 1), yaw: rand() * 6.28, act: ACT.crouch, prop: PROP.basket, cycle: [[ACT.crouch, 10], [ACT.bind, 6], [ACT.idle, 4]], win: [6.5, 17.5], info: 'city-poor', cloth: pick(WOOL.slice(3)) }));
      tk.add(K.basket, h.x + 0.8, h.floor, h.z + 0.4, 0, 0.9, [0.8, 0.75, 0.7], 'city-poor');
    }
    // Elders sitting on the ground in silence by the broken Water Gate (Lam 2:10).
    const wg = GATES.find((g) => g.id === 'gate-water');
    for (let k = 0; k < 3; k++) {
      const x = wg.at[0] - 14 + k * 1.3, z = wg.at[1] + 3 + (k % 2);
      c.add(person('man', { x, y: terrainY(x, z), z, yaw: Math.PI / 2, act: ACT.grieve, old: true, win: [8, 17], info: 'city-poor', mantle: lin([0.25, 0.23, 0.21]) }));
    }
    // A man leading a donkey down past the ruins.
    const pts = smoothPts([[wg.at[0] - 10, wg.at[1]], [150, 520], [260, 470], [420, 390]]).map(([x, z]) => [x, terrainY(x, z), z]);
    const lead = c.add(person('worker', { path: new Path(pts), speed: 0.8, pause: [40, 120], act: ACT.lead, prop: PROP.staff, lateral: 0, win: [7, 17], info: 'city-poor' }));
    c.add(beast('donkey', { follow: lead, gap: 2, look: PANNIERS, info: 'city-poor' }));
  }

  for (const s of scenes) finish(s);

  // Place the door and roof stations around the viewer, and move them on
  // when the viewer moves away. A few houses are tried each time; no
  // allocation beyond the first call.
  const placeStation = (S, st, h) => {
    const rot = h.rot, nx = Math.sin(rot), nz = Math.cos(rot), tx = Math.cos(rot), tz = -Math.sin(rot);
    const side = Math.random() < 0.5 ? -1 : 1;
    const g = S.stationHouses.grid;
    let fx, fz, base;
    if (st.roof) {
      fx = h.x - nx * h.d * 0.32 + tx * side * h.w * 0.2;
      fz = h.z - nz * h.d * 0.32 + tz * side * h.w * 0.2;
      base = h.floor + h.ht * 1.0 + 0.02;
    } else {
      // Beside the door, a third of the way to the corner.
      const off = side * h.w * (0.22 + Math.random() * 0.1);
      fx = h.x + nx * h.d / 2 + tx * off;
      fz = h.z + nz * h.d / 2 + tz * off;
    }
    const W = (dx, dz) => [fx + tx * dx * side + nx * dz, fz + tz * dx * side + nz * dz];
    const yawOf = (face) => face === 'out' ? rot : face === 'wall' ? rot + Math.PI : face === 'side' ? rot + side * Math.PI / 2 : face === 'faceL' ? rot - side * Math.PI / 2 : face === 0 ? 0 : Math.random() * 6.28;
    for (const s of st.agents) {
      const [x, z] = W(s.dx, s.dz);
      s.a.pos.x = x; s.a.pos.z = z; s.a.pos.y = st.roof ? base : g.at(x, z);
      s.a.yaw = yawOf(s.face);
      if (s.face === 'side' && s.dx > 0.3) s.a.yaw += Math.PI;
      if (s.a.hidden) { s.a.hidden = false; }
      S.crowd.place(s.a);
    }
    for (const t of st.tools) {
      const [x, z] = W(t.dx, t.dz);
      S.kit.move(t.i, x, st.roof ? base : g.at(x, z), z, t.face === 'side' ? rot + side * Math.PI / 2 : t.face === 'out' ? rot : rot + Math.random());
    }
    st.house = h;
  };
  const near = [];
  const restation = (S) => {
    const { bins, CELL, used } = S.stationHouses;
    near.length = 0;
    const cx = Math.floor(focus.x / CELL), cz = Math.floor(focus.z / CELL);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const b = bins.get((cx + i) + ',' + (cz + j));
      if (b) for (const h of b) if (!used.has(h) && Math.hypot(h.x - focus.x, h.z - focus.z) < 120) near.push(h);
    }
    for (const st of S.stations) {
      if (st.house && Math.hypot(st.house.x - focus.x, st.house.z - focus.z) < 140) continue;
      if (!near.length) break;
      const k = Math.floor(Math.random() * near.length);
      const h = near[k];
      near[k] = near[near.length - 1];
      near.length--;
      if (st.house) used.delete(st.house);
      used.add(h);
      placeStation(S, st, h);
    }
    for (const im of S.crowd.group.children) im.instanceMatrix.needsUpdate = true;
  };
  let restT = 0;
  const lastFocus = new THREE.Vector3(1e9, 0, 0);

  return {
    layer: 'life',
    groups,
    lights,
    fireMeshes,
    labels,
    info: INFO,
    zones,
    update(time, dt, env) {
      setContactNight(env.night);
      for (const s of scenes) {
        if (!s.group.visible) continue;
        s.crowd.setHour(env.hours);
        s.crowd.update(time, dt);
      }
      if ((restT -= dt) <= 0 || lastFocus.distanceTo(focus) > 60) {
        restT = 1;
        lastFocus.copy(focus);
        for (const S of [late, early]) if (S.group.visible) restation(S);
      }
    },
  };
}
