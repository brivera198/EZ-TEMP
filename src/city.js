// Jerusalem's city for each period: houses, walls and gates and excavated
// landmarks; the countryside around it comes from country.js. World units
// are metres (x = east, z = south), as in terrain.js.
import * as THREE from 'three';
import { Builder, boxGeom, aeolicCapital, cbox, paint, mergeParts } from './builder.js';
import {
  terrainY, insidePolygon, inRect, fbm, rng, smooth, distToLine, valleyX, naturalElevation,
  PODIUM, LATE_POLY, EARLY_POLY, TUNNEL,
} from './terrain.js';
import { buildTrees, vineyards, farmBuildings, threshingFloors } from './country.js';
import {
  PALACE_PAD, SOLOMON_PLATFORM, CITY_WALL, EARLY_WALL, BROAD_WALL, GATES, STREETS,
  SILOAM_POOL, LOWER_POOL, KINGS_GARDEN, SSS, LSS, GIHON,
} from './data.js';

const ALL = ['early', 'late', 'ruin'];
const LATER = ['late', 'ruin'];
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const EZ_STAIR = { x0: 58, x1: 74 };          // the Ophel stair corridor, kept clear of houses
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

function hash1(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const slopeAt = (x, z, site = 'square', e = 2) =>
  Math.hypot(terrainY(x + e, z, site) - terrainY(x - e, z, site), terrainY(x, z + e, site) - terrainY(x, z - e, site)) / (2 * e);

// Merge a Builder's parts into a group whose meshes all open one info card.
function landmark(mats, infoId, fn) {
  const b = new Builder(mats);
  fn(b);
  const group = new THREE.Group();
  b.finish(group);
  group.traverse((o) => { if (o.isMesh) o.userData.infoId = infoId; });
  return group;
}

function instanced(geo, mat, recs, infoId, setup) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, recs.length));
  im.count = recs.length;
  recs.forEach((r, i) => {
    setup(r, _p, _q, _s, _c);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
    im.setColorAt(i, _c);
  });
  im.castShadow = im.receiveShadow = true;
  im.userData.infoId = infoId;
  im.computeBoundingSphere();
  return im;
}

// Meshes you can stand on or bump into when walking.
const solid = (obj) => { obj.traverse((o) => { if (o.isMesh) o.userData.solid = true; }); return obj; };

// Upward-facing strip along a polyline of [x, y, z] points.
function ribbon(pts, width) {
  const pos = [], uv = [], idx = [];
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const [x, y, z] = pts[i];
    if (i) run += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][2]);
    pos.push(x - tz * width / 2, y, z + tx * width / 2, x + tz * width / 2, y, z - tx * width / 2);
    uv.push(0, run / 3, 1, run / 3);           // v runs downstream, for flowing water
    if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// --- Countryside plan (shared with the terrain overlay) --------------------------
export function planCountryside() {
  const rand = rng(1234);
  const grad = (x, z) => [terrainY(x + 2, z, 'square') - terrainY(x - 2, z, 'square'), terrainY(x, z + 2, 'square') - terrainY(x, z - 2, 'square')];
  const clear = (x, z, m) => !(inRect(x, z, PODIUM, m) || inRect(x, z, SOLOMON_PLATFORM, m) || inRect(x, z, PALACE_PAD, m));
  const spaced = (list, x, z, d) => !list.some((p) => Math.hypot(p.x - x, p.z - z) < d);
  const fields = [], floors = [], towers = [], folds = [];
  for (let i = 0; i < 6000 && fields.length < 240; i++) {
    const x = -1550 + rand() * 2700, z = -1250 + rand() * 3100;
    if (!clear(x, z, 20) || insidePolygon(x, z, EARLY_POLY)) continue;
    if (slopeAt(x, z) > 0.13) continue;
    const [gx, gz] = grad(x, z);
    fields.push({ x, z, w: 24 + rand() * 46, d: 16 + rand() * 30, ang: Math.atan2(gz, gx) + Math.PI / 2, kind: Math.floor(rand() * 4) });
  }
  for (let i = 0; i < 6000 && floors.length < 18; i++) {
    const x = -1500 + rand() * 2600, z = -1200 + rand() * 3000;
    if (!clear(x, z, 30) || insidePolygon(x, z, EARLY_POLY)) continue;
    if (slopeAt(x, z) > 0.07) continue;
    const h = naturalElevation(x, z);
    let ring = 0;
    for (const [dx, dz] of [[70, 0], [-70, 0], [0, 70], [0, -70]]) ring += naturalElevation(x + dx, z + dz) / 4;
    if (h - ring < 1.2 || !spaced(floors, x, z, 180)) continue;
    floors.push({ x, z, r: 6 + rand() * 2.5, heap: rand() < 0.6 });
  }
  for (let i = 0; i < 6000 && towers.length < 46; i++) {
    const x = -1500 + rand() * 2600, z = -1200 + rand() * 3000;
    if (!clear(x, z, 30) || insidePolygon(x, z, LATE_POLY) || Math.hypot(x + 150, z - 450) > 1500) continue;
    const s = slopeAt(x, z);
    if (s < 0.08 || s > 0.45 || !spaced(towers, x, z, 85)) continue;
    towers.push({ x, z, r: 1.8 + rand() * 0.7, h: 3.6 + rand() * 1.4, rot: rand() * 6.28 });
  }
  for (let i = 0; i < 6000 && folds.length < 12; i++) {
    const x = -1300 + rand() * 2500, z = -1200 + rand() * 2800;
    if (!clear(x, z, 40) || insidePolygon(x, z, LATE_POLY)) continue;
    if (!(x > 280 || z < -350 || z > 1350)) continue;    // Olivet, the north and the south
    if (slopeAt(x, z) > 0.2 || !spaced(folds, x, z, 260)) continue;
    folds.push({ x, z, r: 6.5 + rand() * 2 });
  }
  return { fields, floors, towers, folds };
}

// --- Surface atlas for wood, pottery, cloth and stone ---------------------------------
// One canvas holds four 1-metre-ish tiles of surface detail in grey (oak-
// and pine-like planks with grain, knots and gaps; fired clay with throwing
// rings and grit; an over-and-under weave; pitted limestone), with a normal
// map, so that one material tinted by vertex and instance colour serves the
// door leaves, beams, jars, baskets, awnings and troughs of the whole city
// in a handful of draw calls. Each part's UVs are projected in metres onto
// its tile (atlasUV).
export const TILE = { wood: [0, 0.5], clay: [0.5, 0.5], weave: [0, 0], stone: [0.5, 0] };
const vnoise = (x, y, seed) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const h = (i, j) => hash1(Math.imul(i, 374761) + Math.imul(j, 668265) + seed * 69069);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx, b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
};

function surfaceTexel(tile, x, y) {
  if (tile === 0) {                                     // planks, running up the tile
    const p = Math.floor(x / 128), lx = x % 128;
    if (lx < 3 || lx > 125) return [0.32, -1];
    const tone = 0.78 + 0.18 * hash1(p * 13 + 1);
    const warp = 7 * vnoise(x / 40, y / 160, p) + 3 * vnoise(x / 9, y / 70, p + 9);
    const grain = 0.5 + 0.5 * Math.sin((x + warp) * 1.15);
    const streak = vnoise(x / 5, y / 140, p + 3);
    let lum = tone * (0.8 + 0.12 * grain + 0.1 * streak), hgt = 0.25 * grain + 0.2 * streak;
    for (let k = 0; k < 2; k++) {                         // a knot or two in each board
      const kx = p * 128 + 30 + 68 * hash1(p * 7 + k), ky = 60 + 390 * hash1(p * 11 + k * 5);
      const d = Math.hypot((x - kx) * 1.4, (y - ky) * 0.6);
      if (d < 16) { lum *= 0.55 + 0.25 * Math.sin(d * 1.2) * (d / 16); hgt -= 0.5 * (1 - d / 16); }
    }
    if (y % 256 < 2) return [lum * 0.5, -0.8];            // board ends
    return [lum, hgt];
  }
  if (tile === 1) {                                     // fired clay
    const ring = Math.sin(y * 0.42 + 4 * vnoise(x / 60, y / 12, 21));
    let lum = 0.84 + 0.1 * (vnoise(x / 30, y / 30, 22) - 0.5) + 0.06 * (vnoise(x / 6, y / 6, 23) - 0.5) + 0.035 * ring;
    const grit = hash1(x * 977 + y * 131);
    if (grit < 0.006) lum *= 0.75; else if (grit > 0.995) lum *= 1.12;
    if (y > 420) lum *= 1 - 0.35 * ((y - 420) / 92) * vnoise(x / 25, y / 25, 24);   // fire-clouding low down
    return [lum, 0.35 * ring + 0.2 * vnoise(x / 6, y / 6, 23)];
  }
  if (tile === 2) {                                     // weave
    const ix = Math.floor(x / 16), iy = Math.floor(y / 16), over = (ix + iy) % 2;
    const t = over ? (y % 16) / 16 : (x % 16) / 16;
    const sh = Math.sin(Math.PI * t);
    const lum = (0.62 + 0.36 * sh) * (0.9 + 0.12 * vnoise(x / 7, y / 7, 31)) * (0.94 + 0.08 * hash1(ix * 7 + iy * 3));
    return [lum, sh];
  }
  // limestone, dressed but pitted
  let lum = 0.84 + 0.12 * (vnoise(x / 45, y / 45, 41) - 0.5) + 0.08 * (vnoise(x / 8, y / 8, 42) - 0.5), hgt = 0.3 * vnoise(x / 8, y / 8, 42);
  for (const [c, pr, r] of [[7, 0.12, 2.2], [26, 0.15, 6]]) {
    const cx = Math.floor(x / c), cy = Math.floor(y / c);
    if (hash1(cx * 191 + cy * 7 + c) < pr) {
      const px = (cx + 0.5) * c, py = (cy + 0.5) * c, d = Math.hypot(x - px, y - py) / r;
      if (d < 1) { lum *= 0.62 + 0.38 * d; hgt -= 0.8 * (1 - d); }
    }
  }
  return [lum, hgt];
}

let ATLAS = null;
export function propAtlas() {
  if (ATLAS) return ATLAS;
  const N = 1024;
  const cnv = document.createElement('canvas'), nrm = document.createElement('canvas');
  cnv.width = cnv.height = nrm.width = nrm.height = N;
  const ci = cnv.getContext('2d').createImageData(N, N), ni = nrm.getContext('2d').createImageData(N, N);
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tile = (y >= 512 ? 2 : 0) + (x >= 512 ? 1 : 0);
    const [l, hg] = surfaceTexel(tile, x % 512, y % 512);
    const v = Math.max(0, Math.min(255, l * 255)), k = (y * N + x) * 4;
    ci.data[k] = ci.data[k + 1] = ci.data[k + 2] = v; ci.data[k + 3] = 255;
    h[y * N + x] = hg;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = h[y * N + Math.min(N - 1, x + 1)] - h[y * N + Math.max(0, x - 1)];
    const hy = h[Math.min(N - 1, y + 1) * N + x] - h[Math.max(0, y - 1) * N + x];
    const nx = -hx * 2.5, ny = hy * 2.5, l = Math.hypot(nx, ny, 1), k = (y * N + x) * 4;
    ni.data[k] = (nx / l * 0.5 + 0.5) * 255; ni.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; ni.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[k + 3] = 255;
  }
  cnv.getContext('2d').putImageData(ci, 0, 0);
  nrm.getContext('2d').putImageData(ni, 0, 0);
  const map = new THREE.CanvasTexture(cnv), normalMap = new THREE.CanvasTexture(nrm);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap]) t.anisotropy = 4;
  ATLAS = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), vertexColors: true, roughness: 0.86, metalness: 0 });
  ATLAS.envMapIntensity = 0.15;
  return ATLAS;
}

// Project a part's UVs onto one atlas tile, in metres (after scaling by
// sx, sy, sz), one `size` metres to the tile; the long side of a part runs
// up the tile, so planks and grain follow boards, rails and beams.
export function atlasUV(g, tile, size = 1, sx = 1, sy = 1, sz = 1) {
  const p = g.attributes.position, n = p.count, S = [sx, sy, sz];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const P = (i, a) => (a === 0 ? p.getX(i) : a === 1 ? p.getY(i) : p.getZ(i)) * S[a];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const v = P(i, a); lo[a] = Math.min(lo[a], v); hi[a] = Math.max(hi[a], v); }
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const [tu, tv] = TILE[tile], m = 0.012, span = 0.5 - 2 * m;
  const uv = new Float32Array(n * 2);
  for (let t = 0; t + 2 < n; t += 3) {
    const e1 = [0, 1, 2].map((a) => P(t + 1, a) - P(t, a)), e2 = [0, 1, 2].map((a) => P(t + 2, a) - P(t, a));
    const nn = [Math.abs(e1[1] * e2[2] - e1[2] * e2[1]), Math.abs(e1[2] * e2[0] - e1[0] * e2[2]), Math.abs(e1[0] * e2[1] - e1[1] * e2[0])];
    const ax = nn[0] >= nn[1] && nn[0] >= nn[2] ? 0 : nn[1] >= nn[2] ? 1 : 2;
    let [a, b] = ax === 0 ? [2, 1] : ax === 1 ? [0, 2] : [0, 1];
    if (ext[a] > ext[b]) [a, b] = [b, a];
    const sc = Math.max(size, ext[a], ext[b]);
    for (let k = 0; k < 3; k++) {
      uv[(t + k) * 2] = tu + m + span * (P(t + k, a) - lo[a]) / sc;
      uv[(t + k) * 2 + 1] = tv + m + span * (P(t + k, b) - lo[b]) / sc;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// --- House models -----------------------------------------------------------------
// Unit models: x across the front (-0.5..0.5), z from back (-0.5) to front
// (+0.5, facing downhill), y from floor (0) to roof (1). Instancing stretches
// them to each house's footprint and wall height, so every triangle here is
// drawn some 2,600 times: faces that can never be seen are left out. Each
// house is two meshes: plastered walls and roofs (mats.house), and the
// wood and stone trim (doors, beams, lintels, pillars, ladders) on the
// surface atlas, its UVs laid out for a house of about 9 × 10.5 m, 4 m high.
const WALL = [1, 1, 1], ROOF = [0.80, 0.72, 0.60];
const OVEN = [0.42, 0.31, 0.24], DARK = [0.22, 0.17, 0.13], RUBBLE = [0.62, 0.57, 0.50];
const DADO = [0.80, 0.73, 0.62], SOOT = [0.34, 0.29, 0.26], ASH = [0.50, 0.47, 0.44], EARTH = [0.58, 0.49, 0.39];
const LIN = (c) => c.map((v) => Math.pow(v, 2.2));
const T_DOOR = LIN([0.66, 0.48, 0.32]), T_BEAM = LIN([0.6, 0.46, 0.33]), T_STONE = LIN([0.95, 0.91, 0.82]), T_SILL = LIN([0.85, 0.81, 0.74]);
const T_PILLAR = LIN([0.93, 0.88, 0.8]), T_CHAR = LIN([0.2, 0.17, 0.15]), T_CLAY = LIN([0.78, 0.56, 0.42]), T_TROUGH = LIN([0.6, 0.56, 0.5]);
const REF = [9, 4, 10.5];

// Box with some faces left out: `skip` names them (R +x, L -x, T top,
// B bottom, F front +z, K back -z). A box skipping five faces is a quad.
const FACES = 'RLTBFK';
function hbox(x0, x1, y0, y1, z0, z1, col, skip = '') {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (skip) {
    const keep = [];
    for (let f = 0; f < 6; f++) if (!skip.includes(FACES[f])) keep.push(f);
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.attributes[name], n = a.itemSize, out = new Float32Array(keep.length * 6 * n);
      keep.forEach((f, k) => out.set(a.array.subarray(f * 6 * n, (f + 1) * 6 * n), k * 6 * n));
      g.setAttribute(name, new THREE.BufferAttribute(out, n));
    }
  }
  return paint(g, col);
}
// The same, for the trim, with atlas UVs.
const tbox = (tile, ...a) => atlasUV(hbox(...a), tile, tile === 'wood' ? 1.2 : 1, ...REF);

// Mirror left for right, keeping the triangles facing outward.
function mirrorX(g) {
  g.scale(-1, 1, 1);
  for (const a of Object.values(g.attributes)) {
    const n = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < n; k++) {
        const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k;
        const v = arr[i1]; arr[i1] = arr[i2]; arr[i2] = v;
      }
    }
  }
  return g;
}
const mirrorHouse = (h) => ({ main: mirrorX(h.main), trim: mirrorX(h.trim) });

// A wooden door leaf of vertical boards, hinged at (hx, z) on the inside
// face of a wall and swung inward by `ang`, its free edge toward -x.
function doorLeaf(hx, z, w, h, ang) {
  const g = new THREE.BoxGeometry(w, h, 0.008).toNonIndexed();
  g.translate(-w / 2, h / 2, -0.004);
  atlasUV(g, 'wood', 1.2, ...REF);
  g.rotateY(-ang);
  g.translate(hx, 0.004, z);
  return paint(g, T_DOOR);
}

// Smoke-blackened toward the broken tops, as the walls of the burned houses were.
function soot(g, k) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const t = k * Math.min(1, Math.max(0, p.getY(i) / 0.55));
    c.setXYZ(i, WALL[0] + (SOOT[0] - WALL[0]) * t, WALL[1] + (SOOT[1] - WALL[1]) * t, WALL[2] + (SOOT[2] - WALL[2]) * t);
  }
  return g;
}

function parapets(p, y, rects) {
  for (const [x0, x1, z0, z1] of rects) p.push(hbox(x0, x1, y, y + 0.17, z0, z1, WALL, 'B'));
}

// Doorway in a front wall whose outer face is at z: stone lintel and
// threshold. The door leaf goes in separately.
function doorway(t, w, h, z, depth) {
  t.push(tbox('stone', -w / 2 - 0.025, w / 2 + 0.025, h, h + 0.045, z - depth, z + 0.012, T_STONE, 'K'));
  t.push(tbox('stone', -w / 2, w / 2, 0, 0.02, z - depth, z + 0.012, T_SILL, 'BK'));
}

// Ends of the roof beams showing through a wall face at z (dir +1 facing
// +z, -1 facing -z), just under the roof.
function beamEnds(t, xs, y, z, dir, col = T_BEAM) {
  for (const x of xs) {
    const z0 = dir > 0 ? z : z - 0.022, z1 = dir > 0 ? z + 0.022 : z;
    t.push(tbox('wood', x - 0.011, x + 0.011, y, y + 0.04, z0, z1, col, dir > 0 ? 'KT' : 'FT'));
  }
}

// Window slits high in a wall: dark quads that glow when a lamp is lit.
function slits(p, xs, y0, y1, z, dir) {
  for (const x of xs) p.push(hbox(x - 0.014, x + 0.014, y0, y1, dir > 0 ? z : z - 0.0005, dir > 0 ? z + 0.0005 : z, DARK, dir > 0 ? 'RLTBK' : 'RLTBF'));
}

function clayOven(t, rTop, rBot, h, x, z, seg) {
  const o = new THREE.CylinderGeometry(rTop, rBot, h, seg).toNonIndexed();
  o.translate(x, h / 2, z);
  t.push(paint(atlasUV(o, 'clay', 1, ...REF), T_CLAY));
}

const finish = (p, t) => ({ main: mergeParts(p), trim: mergeParts(t) });

// The four-room (pillared) house: three long rooms and a broad room round a
// courtyard; flat roofs with a parapet (Deut 22:8); optional upper room.
// A stone stair in the courtyard climbs to the roof on the +x side; the
// mirrored variant has it on the other side (see houseVariant).
function fourRoomHouse(upper) {
  const p = [], t = [];
  const b = (...a) => p.push(hbox(...a));
  const tw = (...a) => t.push(tbox('wood', ...a)), ts = (...a) => t.push(tbox('stone', ...a));
  const tx = 0.06, tz = 0.05, dw = 0.065, dh = 0.5, zf = 0.5 - tz;
  b(-0.5, 0.5, 0, 1, -0.5, -0.5 + tz, WALL, 'B');
  b(-0.5, -0.5 + tx, 0, 1, -0.5 + tz, 0.5, WALL, 'B');
  b(0.5 - tx, 0.5, 0, 1, -0.5 + tz, 0.5, WALL, 'B');
  b(-0.5 + tx, -dw, 0, 1, zf, 0.5, WALL, 'B');
  b(dw, 0.5 - tx, 0, 1, zf, 0.5, WALL, 'B');
  b(-dw, dw, dh, 1, zf, 0.5, WALL, 'B');
  b(-0.5 + tx, -0.05, 0, 1, -0.22, -0.18, WALL, 'B');            // broad room
  b(0.05, 0.5 - tx, 0, 1, -0.22, -0.18, WALL, 'B');
  b(-0.05, 0.05, 0.5, 1, -0.22, -0.18, WALL, 'B');
  b(-0.05, 0.05, 0, 0.5, -0.2, -0.1995, DARK, 'RLTBK');
  for (const s of [-1, 1]) for (const z of [-0.06, 0.14, 0.34]) {  // stone pillars between courtyard and side rooms
    ts(s * 0.2 - 0.025, s * 0.2 + 0.025, 0, 0.94, z - 0.025, z + 0.025, T_PILLAR, 'TB');
  }
  b(-0.5, 0.5, 0.94, 1, -0.5, -0.18, ROOF, 'B');
  b(-0.5, -0.18, 0.94, 1, -0.18, 0.5, ROOF, 'B');
  b(0.18, 0.5, 0.94, 1, -0.18, 0.5, ROOF, 'B');
  parapets(p, 1, [
    [-0.5, 0.5, -0.5, -0.47], [-0.5, -0.47, -0.47, 0.5], [0.47, 0.5, -0.47, 0.5],
    [-0.47, -0.18, 0.47, 0.5], [0.18, 0.47, 0.47, 0.5],
    [-0.21, -0.18, -0.18, 0.47], [0.18, 0.21, -0.18, 0.47], [-0.18, 0.18, -0.21, -0.18],
  ]);
  // Doorway onto the courtyard, its leaf standing open.
  doorway(t, 2 * dw, dh, 0.5, tz + 0.004);
  t.push(doorLeaf(dw, zf, 2 * dw - 0.005, dh - 0.02, 1.2));
  b(-0.5, -dw - 0.025, 0, 0.09, 0.5, 0.5008, DADO, 'RLTBK');       // splashed plaster at the foot of the wall
  b(dw + 0.025, 0.5, 0, 0.09, 0.5, 0.5008, DADO, 'RLTBK');
  slits(p, [-0.3, 0.3], 0.64, 0.74, 0.5, 1);
  slits(p, [-0.25, 0.25], 0.62, 0.72, -0.5, -1);
  beamEnds(t, [-0.38, -0.19, 0, 0.19, 0.38], 0.895, -0.5, -1);     // broad-room beams, through the back wall
  beamEnds(t, [-0.13, 0.08], 0.895, -0.18, 1);                      // and over the courtyard
  tw(0.33, 0.35, 0.93, 0.95, 0.5, 0.56, T_BEAM, 'K');               // wooden roof drain spout
  for (let k = 0; k < 5; k++) b(0.1, 0.175, 0, (k + 1) * 0.19, -0.18, 0.12 - k * 0.06, ROOF, 'BRK');   // stair to the roof
  clayOven(t, 0.03, 0.045, 0.12, 0.125, 0.3, 8);                    // clay oven (tannur)
  ts(-0.225, -0.175, 0, 0.1, 0.17, 0.31, T_TROUGH, 'B');            // stone manger between the pillars
  ts(-0.218, -0.182, 0.1, 0.1012, 0.18, 0.3, LIN([0.3, 0.27, 0.24]), 'RLBFK');
  if (upper) {                                          // upper room on the roof (2 Kgs 4:10)
    b(-0.44, 0.06, 1, 1.62, -0.47, -0.21, WALL, 'B');
    b(-0.46, 0.08, 1.62, 1.68, -0.49, -0.19, ROOF, 'B');
    b(-0.12, -0.03, 1, 1.42, -0.21, -0.2095, DARK, 'RLTBK');
    ts(-0.135, -0.015, 1.42, 1.46, -0.215, -0.198, T_STONE, 'K');
    slits(p, [-0.32], 1.38, 1.47, -0.21, 1);
    beamEnds(t, [-0.38, -0.22, -0.06], 1.56, -0.21, 1);
  }
  return finish(p, t);
}

// Smaller broad-room house with a walled yard: a ladder to the roof, an
// oven in the yard, the door into the room standing open.
function broadRoomHouse() {
  const p = [], t = [];
  const b = (...a) => p.push(hbox(...a));
  const zf = -0.02, tz = 0.05, dw = 0.055, dh = 0.55;
  b(-0.5, 0.5, 0, 1, -0.5, zf, WALL, 'BTF');
  b(-0.5, -dw, 0, 1, zf - tz, zf, WALL, 'B');
  b(dw, 0.5, 0, 1, zf - tz, zf, WALL, 'B');
  b(-dw, dw, dh, 1, zf - tz, zf, WALL, 'B');
  // The dark room behind the door (it glows when a lamp is lit).
  b(-0.46, 0.46, 0, 0.98, -0.461, -0.46, DARK, 'RLTBK');
  b(-0.461, -0.46, 0, 0.98, -0.46, zf - tz, DARK, 'LTBFK');
  b(0.46, 0.461, 0, 0.98, -0.46, zf - tz, DARK, 'RTBFK');
  b(-0.46, 0.46, 0.98, 0.981, -0.46, zf - tz, DARK, 'RLTFK');
  b(-0.5, 0.5, 1, 1.03, -0.5, zf, ROOF, 'B');
  parapets(p, 1.03, [[-0.5, 0.5, -0.5, -0.47], [-0.5, 0.5, -0.05, -0.02], [-0.5, -0.47, -0.47, -0.05], [0.47, 0.5, -0.47, -0.05]]);
  doorway(t, 2 * dw, dh, zf, tz + 0.004);
  t.push(doorLeaf(dw, zf - tz, 2 * dw - 0.005, dh - 0.02, 1.15));
  beamEnds(t, [-0.4, -0.22, 0.22, 0.4], 0.95, zf, 1);
  slits(p, [-0.31, 0.31], 0.62, 0.72, zf, 1);
  for (const [x0, x1, z0, z1] of [[-0.5, -0.1, 0.46, 0.5], [0.1, 0.5, 0.46, 0.5], [-0.5, -0.46, zf, 0.46], [0.46, 0.5, zf, 0.46]]) {
    b(x0, x1, 0, 0.42, z0, z1, WALL, 'B');
  }
  clayOven(t, 0.035, 0.05, 0.13, -0.28, 0.3, 8);
  // Ladder to the roof, leaning on the house front.
  const lean = Math.atan2(0.125, 1.1), L = Math.hypot(0.125, 1.1);
  for (const x of [0.275, 0.325]) {
    const r = atlasUV(new THREE.BoxGeometry(0.007, L, 0.007).toNonIndexed(), 'wood', 1.2, ...REF);
    r.rotateX(-lean);
    r.translate(x, 0.55, zf + 0.067);
    t.push(paint(r, T_BEAM));
  }
  for (let k = 1; k <= 5; k++) {
    const y = k * 0.18, z = zf + 0.129 - (y / 1.1) * 0.125;
    t.push(tbox('wood', 0.275, 0.325, y, y + 0.007, z - 0.004, z + 0.004, T_BEAM, 'RL'));
  }
  return finish(p, t);
}

// The plain box used for every house on small screens.
function simpleHouse() {
  const p = [], t = [];
  const b = (...a) => p.push(hbox(...a));
  b(-0.5, 0.5, 0, 1, -0.5, 0.5, WALL, 'BT');
  b(-0.5, 0.5, 1, 1.02, -0.5, 0.5, ROOF, 'B');
  parapets(p, 1.02, [[-0.5, 0.5, -0.5, -0.47], [-0.5, 0.5, 0.47, 0.5], [-0.5, -0.47, -0.47, 0.47], [0.47, 0.5, -0.47, 0.47]]);
  b(-0.065, 0.065, 0, 0.52, 0.5, 0.5005, DARK, 'RLTBK');
  doorway(t, 0.13, 0.52, 0.5, 0.01);
  beamEnds(t, [-0.38, -0.2, 0.2, 0.38], 0.95, 0.5, 1);
  slits(p, [-0.29, 0.29], 0.62, 0.72, 0.5, 1);
  return finish(p, t);
}

// Burned house: walls broken off and blackened, the roof fallen in as a
// layer of ash, burnt clay and charred beams (rubble in the lanes is in props.js).
function ruinedHouse(rand, four) {
  const p = [], t = [];
  const wall = (x0, x1, z0, z1, alongX, n, hmax) => {
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, h = 0.12 + rand() * (hmax - 0.12);
      const g = alongX ? hbox(x0 + (x1 - x0) * t0, x0 + (x1 - x0) * t1, 0, h, z0, z1, WALL, 'B')
        : hbox(x0, x1, 0, h, z0 + (z1 - z0) * t0, z0 + (z1 - z0) * t1, WALL, 'B');
      p.push(soot(g, 0.45 + rand() * 0.55));
    }
  };
  const lump = (x, z, sx, sy, sz, cols) => {
    const m = new THREE.IcosahedronGeometry(0.5, 0);
    m.scale(sx, sy, sz);
    m.rotateY(rand() * 3);
    m.translate(x, 0, z);
    const c = new Float32Array(m.attributes.position.count * 3);
    for (let i = 0; i < c.length; i += 3) c.set(cols[Math.floor(rand() * cols.length)], i);
    m.setAttribute('color', new THREE.BufferAttribute(c, 3));
    p.push(m);
  };
  const beam = (x, z, len, ry, tilt) => {
    const g = atlasUV(new THREE.BoxGeometry(len, 0.05, 0.022).toNonIndexed(), 'wood', 1.2, ...REF);
    g.rotateZ(tilt);
    g.rotateY(ry);
    g.translate(x, 0.03 + Math.abs(Math.sin(tilt)) * len * 0.5, z);
    t.push(paint(g, T_CHAR));
  };
  wall(-0.5, 0.5, -0.5, -0.45, true, 4, 0.66);
  wall(0.44, 0.5, -0.45, 0.45, false, 4, 0.66);
  wall(-0.5, -0.44, -0.45, 0.45, false, 4, 0.66);
  if (four) {
    wall(-0.5, -0.065, 0.45, 0.5, true, 2, 0.6);
    wall(0.065, 0.5, 0.45, 0.5, true, 2, 0.6);
    wall(-0.44, -0.05, -0.22, -0.18, true, 2, 0.5);
    wall(0.05, 0.44, -0.22, -0.18, true, 2, 0.5);
    for (const s of [-1, 1]) for (const z of [-0.06, 0.14, 0.34]) {
      if (rand() < 0.65) t.push(tbox('stone', s * 0.2 - 0.025, s * 0.2 + 0.025, 0, 0.25 + rand() * 0.69, z - 0.025, z + 0.025, T_PILLAR, 'B'));
      else {                                            // toppled pillar
        const g = tbox('stone', -0.025, 0.025, 0, 0.11, -0.17, 0.17, T_PILLAR, 'B');
        g.rotateY((rand() - 0.5) * 0.8);
        g.translate(s * (0.2 - rand() * 0.08), 0, z + 0.05);
        t.push(g);
      }
    }
  } else {
    wall(-0.44, -0.055, -0.07, -0.02, true, 2, 0.5);
    wall(0.055, 0.44, -0.07, -0.02, true, 2, 0.5);
    for (const [x0, x1, z0, z1] of [[-0.5, -0.1, 0.46, 0.5], [0.1, 0.5, 0.46, 0.5], [-0.5, -0.46, -0.02, 0.46], [0.46, 0.5, -0.02, 0.46]]) {
      p.push(soot(hbox(x0, x1, 0, 0.08 + rand() * 0.25, z0, z1, WALL, 'B'), 0.3));
    }
  }
  p.push(hbox(-0.44, 0.44, 0.004, 0.006, -0.45, four ? 0.45 : -0.07, ASH, 'RLBFK'));      // ash and burnt roof clay
  for (let k = 0; k < 3; k++) lump(-0.3 + rand() * 0.6, -0.35 + rand() * (four ? 0.7 : 0.25), 0.25 + rand() * 0.15, 0.12 + rand() * 0.1, 0.2 + rand() * 0.1, [EARTH, SOOT, RUBBLE, ASH]);
  for (let k = 0; k < 4; k++) beam(-0.25 + rand() * 0.5, -0.35 + rand() * (four ? 0.7 : 0.25), 0.22 + rand() * 0.14, rand() * 3, k % 2 ? 0.2 + rand() * 0.25 : 0);
  return finish(p, t);
}

// Which of a house's two mirror-image plans it uses: 0 has the courtyard
// stair (four-room) or the ladder (broad-room) on its +x side, 1 on -x.
export function houseVariant(r) {
  return hash1(Math.round(r.x * 31 + r.z * 17) + 5) < 0.5 ? 0 : 1;
}

let HOUSE_GEOS = null;
function houseGeos() {
  if (HOUSE_GEOS) return HOUSE_GEOS;
  const r = rng(9);
  const plinth = new THREE.BoxGeometry(1, 1, 1);
  plinth.translate(0, 0.5, 0);
  const uv = plinth.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);
  HOUSE_GEOS = {
    A0: fourRoomHouse(false), A1: mirrorHouse(fourRoomHouse(false)), B0: fourRoomHouse(true), B1: mirrorHouse(fourRoomHouse(true)),
    C0: broadRoomHouse(), C1: mirrorHouse(broadRoomHouse()), L: simpleHouse(),
    R: [ruinedHouse(r, true), mirrorHouse(ruinedHouse(r, true)), ruinedHouse(r, false), mirrorHouse(ruinedHouse(r, false))], plinth,
  };
  // Doorways and windows (the dark parts) glow when a lamp is lit inside.
  for (const k of ['A0', 'A1', 'B0', 'B1', 'C0', 'C1', 'L']) {
    const c = HOUSE_GEOS[k].main.attributes.color, win = new Float32Array(c.count);
    for (let i = 0; i < c.count; i++) win[i] = Math.abs(c.getX(i) - DARK[0]) < 0.01 && Math.abs(c.getY(i) - DARK[1]) < 0.01 ? 1 : 0;
    HOUSE_GEOS[k].main.setAttribute('aWin', new THREE.BufferAttribute(win, 1));
  }
  return HOUSE_GEOS;
}

// Whitewash, mud plaster, bare stone, buff plaster.
const TINTS = [[0.95, 0.92, 0.86], [0.82, 0.71, 0.56], [0.76, 0.72, 0.64], [0.90, 0.84, 0.74]];

function houseMeshes(recs, mats, { ruin = false, quality = 'high' } = {}) {
  const G = houseGeos();
  const group = new THREE.Group();
  const byKey = {};
  recs.forEach((r) => {
    const v = houseVariant(r);
    const key = ruin ? `R${(r.type === 'C' ? 2 : 0) + v}` : quality === 'low' ? 'L' : r.type + v;
    (byKey[key] ||= []).push(r);
  });
  const info = ruin ? 'city-house-ruin' : 'city-house';
  const place = (r, p, q, s) => { p.set(r.x, r.floor, r.z); q.setFromAxisAngle(Y_AXIS, r.rot); s.set(r.w, r.ht, r.d); };
  for (const [key, list] of Object.entries(byKey)) {
    const h = key[0] === 'R' ? G.R[+key[1]] : G[key];
    let geo = h.main;
    if (!ruin) {
      // About one house in three keeps a lamp burning after dark.
      geo = geo.clone();
      geo.setAttribute('iLit', new THREE.InstancedBufferAttribute(Float32Array.from(list, (r) => (hash1(Math.round(r.x * 7 + r.z * 13)) < 0.33 ? 1 : 0)), 1));
    }
    group.add(instanced(geo, mats.house, list, info, (r, p, q, s, c) => {
      place(r, p, q, s);
      const t = TINTS[r.tint], k = (ruin ? 0.6 : 1) * r.shade;
      c.setRGB(t[0] * k, t[1] * k, t[2] * k);
    }));
    const trim = instanced(h.trim, propAtlas(), list, info, (r, p, q, s, c) => {
      place(r, p, q, s);
      const k = (ruin ? 0.7 : 1) * (0.85 + 0.3 * hash1(Math.round(r.x * 3 + r.z * 5)));
      c.setRGB(k, k * (0.96 + 0.04 * r.shade), k * r.shade);
    });
    trim.castShadow = !ruin && quality !== 'low';
    group.add(trim);
  }
  group.add(instanced(G.plinth, mats.terraceStone, recs, info, (r, p, q, s, c) => {
    p.set(r.x, r.base, r.z);
    q.setFromAxisAngle(Y_AXIS, r.rot);
    s.set(r.w * 1.03, Math.max(0.3, r.floor - r.base), r.d * 1.03);
    c.setRGB(1, 1, 1);
  }));
  return group;
}

// --- House layout ------------------------------------------------------------------
function heightGrid(b, step, site) {
  const nx = Math.ceil((b.x1 - b.x0) / step) + 1, nz = Math.ceil((b.z1 - b.z0) / step) + 1;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = terrainY(b.x0 + i * step, b.z0 + j * step, site);
  const at = (x, z) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x - b.x0) / step)), fz = Math.min(nz - 1.001, Math.max(0, (z - b.z0) / step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * nx + i;
    return h[k] * (1 - u) * (1 - v) + h[k + 1] * u * (1 - v) + h[k + nx] * (1 - u) * v + h[k + nx + 1] * u * v;
  };
  const grad = (x, z) => [(at(x + 1.5, z) - at(x - 1.5, z)) / 3, (at(x, z + 1.5) - at(x, z - 1.5)) / 3];
  return { at, grad };
}

// Houses grow in rows along the contours, each with a lane in front of it,
// so the city steps down the slopes in terraces as excavated on the City of
// David. On flat ground the rows follow a gently varying grid.
// Occupancy codes: 0 free, 1 house, 2 street or square, 3 lane, 4 blocked.
function layoutCity({ poly, site, wall, wallHalf, exclude, streets, plazas, target, rand }) {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const bb = { x0: Math.min(...xs) - 5, x1: Math.max(...xs) + 5, z0: Math.min(...zs) - 5, z1: Math.max(...zs) + 5 };
  const hg = heightGrid(bb, 3, site);
  const cell = 1.5;
  const W = Math.ceil((bb.x1 - bb.x0) / cell), D = Math.ceil((bb.z1 - bb.z0) / cell);
  const occ = new Uint8Array(W * D).fill(4);
  for (let j = 0; j < D; j++) {
    const z = bb.z0 + (j + 0.5) * cell;
    const cross = [];
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, za] = poly[a], [xb, zb] = poly[b];
      if ((za > z) !== (zb > z)) cross.push(xa + (z - za) * (xb - xa) / (zb - za));
    }
    cross.sort((p, q) => p - q);
    for (let k = 0; k + 1 < cross.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((cross[k] - bb.x0) / cell - 0.5));
      const i1 = Math.min(W - 1, Math.floor((cross[k + 1] - bb.x0) / cell - 0.5));
      for (let i = i0; i <= i1; i++) {
        const x = bb.x0 + (i + 0.5) * cell;
        if (exclude(x, z)) continue;
        const [gx, gz] = hg.grad(x, z);
        if (gx * gx + gz * gz > 0.8) continue;
        occ[j * W + i] = 0;
      }
    }
  }
  const corridor = (pts, half, value) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - half - bb.x0) / cell));
      const i1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx) + half - bb.x0) / cell));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - half - bb.z0) / cell));
      const j1 = Math.min(D - 1, Math.ceil((Math.max(az, bz) + half - bb.z0) / cell));
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = bb.x0 + (i + 0.5) * cell, z = bb.z0 + (j + 0.5) * cell;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) > half) continue;
        const k = j * W + i;
        if (value === 4 || occ[k] === 0) occ[k] = value;
      }
    }
  };
  corridor(wall, wallHalf + 1.5, 4);                 // keep houses out of the wall
  corridor(wall, wallHalf + 4.5, 2);                 // a lane along the inside of the wall
  for (const st of streets) corridor(st.pts, st.w / 2, 2);
  for (const [px, pz, r] of plazas) corridor([[px - 0.01, pz], [px + 0.01, pz]], r, 2);

  const cellOf = (x, z) => {
    const i = Math.floor((x - bb.x0) / cell), j = Math.floor((z - bb.z0) / cell);
    return i < 0 || j < 0 || i >= W || j >= D ? -1 : j * W + i;
  };
  const flatAngle = (x, z) => 0.18 + 0.35 * fbm(x / 520, z / 520, 2);
  const orient = (x, z, prevT) => {
    const [gx, gz] = hg.grad(x, z);
    const gl = Math.hypot(gx, gz);
    let nx, nz;
    if (gl > 0.035) { nx = -gx / gl; nz = -gz / gl; }    // front faces downhill
    else { const a = flatAngle(x, z); nx = Math.cos(a); nz = Math.sin(a); }
    let tx = -nz, tz = nx;
    if (prevT && tx * prevT[0] + tz * prevT[1] < 0) { tx = -tx; tz = -tz; }
    return { nx, nz, tx, tz };
  };
  const project = (x, z, e) => {
    for (let it = 0; it < 3; it++) {
      const h = hg.at(x, z);
      const [gx, gz] = hg.grad(x, z);
      const g2 = gx * gx + gz * gz;
      if (g2 < 0.0012) break;
      let k = (h - e) / g2;
      const len = Math.hypot(gx * k, gz * k);
      if (len > 4) k *= 4 / len;
      x -= gx * k; z -= gz * k;
    }
    return [x, z];
  };
  // Visit the cells of a house footprint (plus a lane in front of it).
  const visit = (cx, cz, o, w, d, lane, fn) => {
    const hw = w / 2 + 0.05, hb = d / 2 + 0.1, hf = d / 2 + lane;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [a, b] of [[-hw, -hb], [hw, -hb], [-hw, hf], [hw, hf]]) {
      const x = cx + o.tx * a + o.nx * b, z = cz + o.tz * a + o.nz * b;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    for (let j = Math.floor((z0 - bb.z0) / cell); j <= Math.floor((z1 - bb.z0) / cell); j++) {
      for (let i = Math.floor((x0 - bb.x0) / cell); i <= Math.floor((x1 - bb.x0) / cell); i++) {
        const x = bb.x0 + (i + 0.5) * cell - cx, z = bb.z0 + (j + 0.5) * cell - cz;
        const la = x * o.tx + z * o.tz, lb = x * o.nx + z * o.nz;
        if (Math.abs(la) > hw || lb < -hb || lb > hf) continue;
        const k = i < 0 || j < 0 || i >= W || j >= D ? -1 : j * W + i;
        if (fn(k, lb > d / 2) === false) return false;
      }
    }
    return true;
  };
  const fits = (cx, cz, o, w, d, lane) => visit(cx, cz, o, w, d, lane, (k, isLane) => (isLane ? k < 0 || occ[k] !== 1 : k >= 0 && occ[k] === 0));
  const mark = (cx, cz, o, w, d, lane) => visit(cx, cz, o, w, d, lane, (k, isLane) => {
    if (k < 0) return;
    if (!isLane) occ[k] = 1;
    else if (occ[k] === 0) occ[k] = 3;
  });

  const houses = [];
  const addHouse = (cx, cz, o, w, d) => {
    const rot = Math.atan2(o.nx, o.nz);
    const ys = [];
    for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
      ys.push(terrainY(cx + o.tx * a + o.nx * b, cz + o.tz * a + o.nz * b, site));
    }
    const r = rand();
    const type = r < 0.5 ? 'A' : r < 0.8 ? 'B' : 'C';
    houses.push({
      x: cx, z: cz, w, d, rot, type,
      floor: Math.max(...ys) + 0.05, base: Math.min(...ys) - 1.5,
      ht: type === 'C' ? 3.0 + rand() * 0.6 : 3.5 + rand() * 0.9,
      tint: Math.floor(rand() * TINTS.length), shade: 0.9 + rand() * 0.14,
    });
  };
  // Short, slightly irregular rows: lanes of varying width, setbacks,
  // cross-lanes, and rows that stop after a few houses.
  const growRow = (sx, sz) => {
    const e = hg.at(sx, sz);
    const o0 = orient(sx, sz, null);
    const lane = 1.8 + rand() * 1.6;
    const rowLen = 3 + Math.floor(rand() * 6);
    for (const dir of [1, -1]) {
      let t = [o0.tx * dir, o0.tz * dir];
      let px = sx, pz = sz, placed = 0, misses = 0;
      while (placed < rowLen && misses < 2 && houses.length < target) {
        const w = 6.8 + rand() * 4.2, d = 8.4 + rand() * 4.2;
        let [cx, cz] = project(px + t[0] * w / 2, pz + t[1] * w / 2, e);
        const o = orient(cx, cz, t);
        t = [o.tx, o.tz];
        const back = d / 2 + (rand() - 0.5) * 1.4;      // setback
        const hx = cx - o.nx * back, hz = cz - o.nz * back;
        if (fits(hx, hz, o, w, d, lane)) { mark(hx, hz, o, w, d, lane); addHouse(hx, hz, o, w, d); placed++; } else misses++;
        const gap = rand() < 0.22 ? 2.6 + rand() * 1.8 : 0.1;   // now and then a cross-lane
        px = cx + t[0] * (w / 2 + gap);
        pz = cz + t[1] * (w / 2 + gap);
      }
    }
  };
  for (let n = 0; n < target * 14 && houses.length < target; n++) {
    const x = bb.x0 + rand() * (bb.x1 - bb.x0), z = bb.z0 + rand() * (bb.z1 - bb.z0);
    const k = cellOf(x, z);
    if (k >= 0 && occ[k] === 0) growRow(x, z);
  }

  const walk = [];
  for (let k = 0; k < occ.length; k++) if (occ[k] === 2 || occ[k] === 3) walk.push(k);
  const walkable = () => {
    if (!walk.length) return [(bb.x0 + bb.x1) / 2, (bb.z0 + bb.z1) / 2];
    const k = walk[Math.floor(rand() * walk.length)];
    const x = bb.x0 + ((k % W) + 0.2 + rand() * 0.6) * cell, z = bb.z0 + (Math.floor(k / W) + 0.2 + rand() * 0.6) * cell;
    return [x, z];
  };
  // The lanes and streets as a grid, for people to walk along (life.js).
  const grid = { occ, W, D, bb, cell, at: hg.at, free: (x, z) => { const k = cellOf(x, z); return k >= 0 && (occ[k] === 2 || occ[k] === 3); } };
  return { houses, walkable, grid };
}

// --- City walls, towers and gates ------------------------------------------------------
function buildWalls(mats, { line, poly, site, gates, height, thick, broad, towerEvery, ruin, shields, breachAt, infoId }) {
  const parts = { body: [], broad: [], dressed: [], shield: [], wood: [], scree: [], bench: [], bronze: [], char: [] };
  const zones = [], labels = [];
  const segs = [];
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
    const lx = -Math.sin(ang), lz = Math.cos(ang);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const out = insidePolygon(mx + lx * 8, mz + lz * 8, poly) ? -1 : 1;
    const isBroad = !!broad && i >= broad[0] && i < broad[1];
    segs.push({ ax, az, bx, bz, L, ang, nx: lx * out, nz: lz * out, s0: acc, th: isBroad ? 7 : thick, isBroad });
    acc += L;
  }
  const snap = ([px, pz]) => {
    let best = null;
    for (const sg of segs) {
      const dx = sg.bx - sg.ax, dz = sg.bz - sg.az;
      const t = Math.max(0, Math.min(1, ((px - sg.ax) * dx + (pz - sg.az) * dz) / (sg.L * sg.L)));
      const x = sg.ax + dx * t, z = sg.az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, x, z, s: sg.s0 + t * sg.L, sg };
    }
    return best;
  };
  const gs = gates.map((g) => ({ ...g, ...snap(g.at) }));
  for (const g of gs) g.inner = [g.x - g.sg.nx * 16, g.z - g.sg.nz * 16];
  const sBreach = breachAt ? snap(breachAt).s : -1e9;
  const nearGate = (s, m) => gs.some((g) => Math.abs(g.s - s) < m);
  const ruinFactor = (s) => {
    if (Math.abs(s - sBreach) < 16) return 0.05;
    const b = Math.floor(s / 20);
    return hash1(b) < 0.2 ? 0.08 : 0.3 + 0.5 * hash1(b + 101);
  };
  // Box in a segment's frame: a along the wall, b outward, y up.
  const fbox = (list, sg, cx, cz, a0, a1, b0, b1, y0, y1, tile = 4) => {
    const ca = Math.cos(sg.ang), sa = Math.sin(sg.ang);
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
    const g = boxGeom(a1 - a0, y1 - y0, b1 - b0, tile);
    g.rotateY(-sg.ang);
    g.translate(cx + ca * am + sg.nx * bm, (y0 + y1) / 2, cz + sa * am + sg.nz * bm);
    list.push(g.toNonIndexed());
  };
  const at = (sg, cx, cz, a, b) => [cx + Math.cos(sg.ang) * a + sg.nx * b, cz + Math.sin(sg.ang) * a + sg.nz * b];

  let lastTower = -1e9;
  for (const sg of segs) {
    const n = Math.max(1, Math.ceil(sg.L / 6));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, len = sg.L / n;
      const s = sg.s0 + (k + 0.5) * len;
      if (nearGate(s, 8.6)) continue;
      const x0 = sg.ax + (sg.bx - sg.ax) * t0, z0 = sg.az + (sg.bz - sg.az) * t0;
      const x1 = sg.ax + (sg.bx - sg.ax) * t1, z1 = sg.az + (sg.bz - sg.az) * t1;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const h0 = terrainY(x0, z0, site), h1 = terrainY(x1, z1, site);
      const lo = Math.min(h0, h1), hi = Math.max(h0, h1);
      const rf = ruin ? ruinFactor(s) : 1;
      const top = hi + height * rf;
      fbox(sg.isBroad ? parts.broad : parts.body, sg, cx, cz, -len / 2 - 0.2, len / 2 + 0.2, -sg.th / 2, sg.th / 2, lo - 4, top);
      if (!ruin) {
        const m = Math.max(1, Math.round(len / 2.2));
        for (let j = 0; j < m; j++) {
          const a = -len / 2 + (j + 0.5) * len / m;
          fbox(parts.dressed, sg, cx, cz, a - 0.6, a + 0.6, sg.th / 2 - 0.8, sg.th / 2, top, top + 1.3, 2);
        }
      } else if (hash1(Math.floor(s * 7)) < 0.6) {      // tumbled stones at the foot
        const [sx, sz] = at(sg, cx, cz, (hash1(Math.floor(s)) - 0.5) * len, sg.th / 2 + 1.5 + hash1(Math.floor(s) + 7) * 3.5);
        const m = new THREE.IcosahedronGeometry(1, 0);
        m.scale(1.6 + hash1(Math.floor(s) + 3) * 1.6, 0.6 + hash1(Math.floor(s) + 4) * 0.6, 1.4 + hash1(Math.floor(s) + 5) * 1.4);
        m.translate(sx, terrainY(sx, sz, site) - 0.2, sz);
        parts.scree.push(m);
      }
      if (s - lastTower > towerEvery && !nearGate(s, 16)) {
        lastTower = s;
        const tTop = hi + (height + 3.5) * (ruin ? Math.max(0.15, rf) : 1);
        fbox(parts.body, sg, cx, cz, -4.5, 4.5, -sg.th / 2, sg.th / 2 + 3.5, lo - 4, tTop);
        if (!ruin) {
          for (let j = 0; j < 4; j++) {
            const a = -4.5 + (j + 0.5) * 9 / 4;
            fbox(parts.dressed, sg, cx, cz, a - 0.6, a + 0.6, sg.th / 2 + 2.7, sg.th / 2 + 3.5, tTop, tTop + 1.3, 2);
          }
          for (const sa of [-1, 1]) for (const b of [sg.th / 2 + 0.6, sg.th / 2 + 2.3]) {
            fbox(parts.dressed, sg, cx, cz, sa > 0 ? 3.7 : -4.5, sa > 0 ? 4.5 : -3.7, b - 0.5, b + 0.5, tTop, tTop + 1.3, 2);
          }
          if (shields) {                                   // shields hung on the battlements
            for (let j = 0; j < 4; j++) {
              const [x, z] = at(sg, cx, cz, -3.4 + j * 2.27, sg.th / 2 + 3.62);
              const disc = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 14);
              disc.rotateX(Math.PI / 2);
              disc.rotateY(-sg.ang);
              disc.translate(x, tTop + 0.6, z);
              parts.shield.push(disc.toNonIndexed());
            }
          }
        }
      }
    }
  }

  for (const g of gs) {
    const sg = g.sg;
    const ground = terrainY(g.x, g.z, site);
    const gTop = ground + (height + 4) * (ruin ? 0.45 : 1);
    fbox(parts.dressed, sg, g.x, g.z, -9, -2.6, -6, 6, ground - 5, gTop, 3);
    fbox(parts.dressed, sg, g.x, g.z, 2.6, 9, -6, 6, ground - 5, gTop, 3);
    // Stone benches against the inner face of the gate towers, where the
    // elders sat and cases were heard (Ruth 4:1–2; Prov 31:23).
    for (const sa of [-1, 1]) {
      const [bx, bz] = at(sg, g.x, g.z, sa * 5.9, -6.35);
      const by = terrainY(bx, bz, site);
      fbox(parts.bench, sg, g.x, g.z, sa > 0 ? 3.2 : -8.6, sa > 0 ? 8.6 : -3.2, -6.7, -6, by - 0.6, by + 0.45, 2);
    }
    if (ruin) {
      // The burned leaves lying in the passage (Neh 1:3; Lam 2:9).
      fbox(parts.char, sg, g.x, g.z, -2.4, -0.3, -1.2, 2.6, ground - 0.05, ground + 0.14, 2);
      fbox(parts.char, sg, g.x, g.z, 0.5, 2.2, 0.4, 3.9, ground - 0.05, ground + 0.11, 2);
    }
    if (!ruin) {
      fbox(parts.dressed, sg, g.x, g.z, -2.6, 2.6, -6, 6, ground + 6.5, gTop, 3);    // chamber over the passage
      for (const b of [-5.6, 5.6]) for (let j = 0; j < 8; j++) {
        const a = -9 + (j + 0.5) * 18 / 8;
        fbox(parts.dressed, sg, g.x, g.z, a - 0.6, a + 0.6, b - 0.4, b + 0.4, gTop, gTop + 1.3, 2);
      }
      for (const sa of [-1, 1]) {
        fbox(parts.wood, sg, g.x, g.z, sa > 0 ? 2.3 : -2.6, sa > 0 ? 2.6 : -2.3, -1.6, 2.4, ground, ground + 6.2, 2);   // gate leaves, open
        for (const h of [0.6, 2.2, 3.8, 5.4]) {           // metal straps across the leaves
          fbox(parts.bronze, sg, g.x, g.z, sa > 0 ? 2.26 : -2.64, sa > 0 ? 2.64 : -2.26, -1.55, 2.35, ground + h, ground + h + 0.16, 1);
        }
        const [x, z] = at(sg, g.x, g.z, sa * 3.9, -6.12);
        const cap = aeolicCapital(2.4);
        cap.rotateY(Math.atan2(-sg.nx, -sg.nz));
        cap.translate(x, ground + 5.4, z);
        parts.dressed.push(cap);
      }
    }
    zones.push({
      id: g.id, periods: g.periods,
      box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(g.x, (ground + gTop) / 2, g.z), new THREE.Vector3(20, gTop - ground + 3, 20)),
    });
    labels.push({ label: g.name, pos: new THREE.Vector3(g.x, gTop + 6, g.z), info: g.id });
  }

  const group = new THREE.Group();
  const keyMat = { body: 'rubble', broad: 'rubble', dressed: 'ashlar', shield: 'shield', wood: 'cedar', scree: 'rubble', bench: 'ashlar', bronze: 'bronze', char: 'charcoal' };
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeParts(list), mats[keyMat[k]]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.infoId = k === 'broad' ? 'city-broadwall' : k === 'bench' ? 'props-gate-bench' : infoId;
    group.add(mesh);
  }
  return { group, zones, labels, gates: gs };
}

// --- Landmarks -------------------------------------------------------------------------
function steppedStoneStructure(mats) {
  return landmark(mats, 'city-sss', (b) => {
    const zc = (SSS.z0 + SSS.z1) / 2;
    const startTop = terrainY(SSS.x0, zc) + 1.4;
    for (let i = 0; i < 40; i++) {
      const x0 = SSS.x0 + i * 1.15, x1 = x0 + 1.25;
      const g0 = Math.min(terrainY(x0, SSS.z0), terrainY(x0, SSS.z1), terrainY(x1, zc));
      const top = Math.max(g0 + 0.55, startTop - i * 0.6);
      const inset = Math.min(7, i * 0.2);
      b.box('megalith', x0, x1, g0 - 3, top, SSS.z0 + inset, SSS.z1 - inset);
    }
  });
}

function largeStoneStructure(mats) {
  return landmark(mats, 'city-lss', (b) => {
    const { x0, x1, z0, z1 } = LSS;
    const corners = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]].map(([x, z]) => terrainY(x, z));
    const f = corners.reduce((p, q) => p + q, 0) / corners.length + 0.6, lo = Math.min(...corners) - 3;
    const t = 2.4, h = 9, zm = (z0 + z1) / 2;
    b.box('megalith', x0 - 1, x1 + 1, lo, f, z0 - 1, z1 + 1);
    b.box('ashlar', x0, x1, f, f + h, z0, z0 + t);
    b.box('ashlar', x0, x1, f, f + h, z1 - t, z1);
    b.box('ashlar', x0, x0 + t, f, f + h, z0 + t, z1 - t);
    b.box('ashlar', x1 - t, x1, f, f + h, z0 + t, zm - 2.2);
    b.box('ashlar', x1 - t, x1, f, f + h, zm + 2.2, z1 - t);
    b.box('ashlar', x1 - t, x1, f + 5.6, f + h, zm - 2.2, zm + 2.2);
    const ix0 = x0 + 10, ix1 = x1 - 10, iz0 = z0 + 12, iz1 = z1 - 12;
    b.box('ashlar', ix0, ix1, f, f + h, iz0, iz0 + 1.4);
    b.box('ashlar', ix0, ix1, f, f + h, iz1 - 1.4, iz1);
    b.box('ashlar', ix0, ix0 + 1.4, f, f + h, iz0, iz1);
    b.box('ashlar', ix1 - 1.4, ix1, f, f + h, iz0, iz1);
    b.box('roof', x0 - 0.3, x1 + 0.3, f + h, f + h + 0.5, z0 - 0.3, iz0);
    b.box('roof', x0 - 0.3, x1 + 0.3, f + h, f + h + 0.5, iz1, z1 + 0.3);
    b.box('roof', x0 - 0.3, ix0, f + h, f + h + 0.5, iz0, iz1);
    b.box('roof', ix1, x1 + 0.3, f + h, f + h + 0.5, iz0, iz1);
    for (const s of [-1, 1]) {                            // entrance facing the Stepped Stone Structure
      b.box('ashlar', x1, x1 + 0.5, f, f + 5.6, zm + s * 3.4 - 0.9, zm + s * 3.4 + 0.9);
      b.geom('ashlar', aeolicCapital(2.2), x1 + 0.25, f + 5.6, zm + s * 3.4, Math.PI / 2);
    }
  });
}

function gihonTowers(mats) {
  return landmark(mats, 'city-gihon', (b) => {
    const { x, z } = GIHON;
    const lo = Math.min(terrainY(x + 9, z - 8), terrainY(x + 9, z + 8), terrainY(x, z)) - 3;
    const top = Math.max(terrainY(x - 9, z - 8), terrainY(x - 9, z + 8)) + 6;
    b.box('megalith', x - 9, x + 9, lo, top, z - 8, z - 4);
    b.box('megalith', x - 9, x + 9, lo, top, z + 4, z + 8);
    b.box('megalith', x - 9, x - 5, lo, top, z - 4, z + 4);
    b.box('megalith', x + 5, x + 9, lo, top, z - 4, z + 4);
    const px = x - 24;                                    // Pool Tower, upslope to the west
    b.box('megalith', px - 7, px + 7, terrainY(px + 7, z + 9) - 3, terrainY(px - 7, z + 9) + 6, z + 2, z + 16);
    const water = new THREE.PlaneGeometry(9.5, 7.5);
    water.rotateX(-Math.PI / 2);
    b.geom('water', water, x, terrainY(x, z) + 0.6, z);
  });
}

// A walled reservoir standing on the ground.
function pool(mats, infoId, { x, z, w, d }) {
  return landmark(mats, infoId, (b) => {
    const ys = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2]].map(([px, pz]) => terrainY(px, pz));
    const wy = Math.max(...ys) + 0.5, lo = Math.min(...ys) - 2.5;
    for (const [x0, x1, z0, z1] of [[x - w / 2 - 1.2, x + w / 2 + 1.2, z - d / 2 - 1.2, z - d / 2], [x - w / 2 - 1.2, x + w / 2 + 1.2, z + d / 2, z + d / 2 + 1.2], [x - w / 2 - 1.2, x - w / 2, z - d / 2, z + d / 2], [x + w / 2, x + w / 2 + 1.2, z - d / 2, z + d / 2]]) {
      b.box('ashlarDark', x0, x1, lo, wy + 0.7, z0, z1);
    }
    for (let i = 0; i < 4; i++) b.box('ashlar', x - 4, x + 4, lo, wy + 0.5 - i * 0.35, z - d / 2 + i * 0.8, z - d / 2 + (i + 1) * 0.8);
    const water = new THREE.PlaneGeometry(w, d);
    water.rotateX(-Math.PI / 2);
    b.geom('water', water, x, wy, z);
  });
}

// Siloam channel along the east slope (Isa 8:6), at a gently falling level.
function channel(mats) {
  const pts = [];
  for (let z = 512; z <= 1000; z += 8) {
    const target = 641 - (z - 512) * (19 / 488);
    const xb = valleyX('kidron', z);
    let lo = Math.min(25, xb - 10), hi = xb - 4;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2;
      if (naturalElevation(mid, z) > target) lo = mid; else hi = mid;
    }
    pts.push([(lo + hi) / 2, z]);
  }
  pts.push([-20, 1012], [LOWER_POOL.x + LOWER_POOL.w / 2 - 2, LOWER_POOL.z]);
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
    for (let k = 0; k < n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      dense.push([x, terrainY(x, z) + 0.2, z]);
    }
  }
  const lining = new THREE.Mesh(ribbon(dense.map(([x, y, z]) => [x, y - 0.04, z]), 2.2), mats.terraceStone);
  const water = new THREE.Mesh(ribbon(dense, 1.2), mats.waterFlow);
  return { lining, water, path: dense };
}

function silwanTombs(mats, rand) {
  const tombs = [];
  const group = landmark(mats, 'city-silwan', (b) => {
    for (let i = 0; i < 600 && tombs.length < 30; i++) {
      const z = 380 + rand() * 400;
      const x = valleyX('kidron', z) + 14 + rand() * 75;
      const gx = terrainY(x + 2, z) - terrainY(x - 2, z), gz = terrainY(x, z + 2) - terrainY(x, z - 2);
      const gl = Math.hypot(gx, gz);
      if (gl / 4 < 0.32 || gx <= 0) continue;            // steep and facing west, toward the city
      if (tombs.some((t) => Math.hypot(t.x - x, t.z - z) < 14)) continue;
      const nx = -gx / gl, nz = -gz / gl, rot = Math.atan2(nx, nz);
      const y = terrainY(x, z);
      // A dressed face cut back into the slope, with a small doorway.
      const fw = 3.4 + rand() * 1.8, top = 2.2 + rand() * 0.5;
      b.geom('ashlarDark', boxGeom(fw, top + 1.5, 6, 4), x - nx * 2.4, y + (top - 1.5) / 2, z - nz * 2.4, rot);
      b.geom('void', boxGeom(0.9, 1.3, 0.2, 2), x + nx * 0.62, y + 0.75, z + nz * 0.62, rot);
      tombs.push({ x, z });
    }
  });
  return group;
}

function monolith(mats) {
  return landmark(mats, 'city-monolith', (b) => {
    const x = 250, z = 505, y = terrainY(x, z);
    b.geom('ashlarDark', boxGeom(6, 6.5, 6, 4), x, y + 1.25, z, -Math.PI / 2);
    const roof = new THREE.ConeGeometry(4.24, 3.6, 4);
    roof.rotateY(Math.PI / 4);
    b.geom('ashlarDark', roof, x, y + 4.5 + 1.8, z);
    b.geom('void', boxGeom(1, 1.5, 0.2, 2), x - 3.02, y + 0.9, z, -Math.PI / 2);
  });
}

// High place on the Mount of Corruption (1 Kgs 11:7): platform, altar, standing stones.
function highPlace(mats) {
  return landmark(mats, 'city-bamah', (b) => {
    const x = 610, z = 690, y = terrainY(x, z);
    b.box('rubble', x - 7, x + 7, y - 1.5, y + 1.2, z - 7, z + 7);
    b.box('rubble', x - 1.2, x + 1.2, y + 1.2, y + 2.6, z - 1.2, z + 1.2);
    for (let i = 0; i < 3; i++) b.box('ashlarDark', x + 1.6 + i * 1.3, x + 2.2 + i * 1.3, y + 1.2, y + 3.4 + (i % 2) * 0.5, z - 4.7, z - 4.4);
    for (let i = 0; i < 6; i++) b.box('rubble', x - 7 + i * 0.8, x - 6.2 + i * 0.8, y - 1.5, y + 1.2 - i * 0.45, z - 1.5, z + 1.5);
  });
}

// Babylonian siege ramp against the north wall (Jer 32:24).
function siegeRamp(mats, wallInfo) {
  const [ax, az] = [-600, 181];
  let best = null;
  for (let i = 0; i < CITY_WALL.length - 1; i++) {
    const [x0, z0] = CITY_WALL[i], [x1, z1] = CITY_WALL[i + 1];
    const d = distToLine(ax, az, [[x0, z0], [x1, z1]]);
    if (!best || d < best.d) best = { d, ang: Math.atan2(z1 - z0, x1 - x0) };
  }
  const ang = best.ang;
  let nx = -Math.sin(ang), nz = Math.cos(ang);
  if (insidePolygon(ax + nx * 8, az + nz * 8, LATE_POLY)) { nx = -nx; nz = -nz; }
  const ground = terrainY(ax, az);
  const shape = new THREE.Shape();
  shape.moveTo(0, -4);
  shape.lineTo(62, -4);
  shape.lineTo(62, 0.2);
  shape.lineTo(0, wallInfo.height + 0.6);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 26, bevelEnabled: false });
  geo.translate(0, 0, -13);
  const X = new THREE.Vector3(nx, 0, nz), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3().crossVectors(X, Y);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z));
  geo.translate(ax + nx * 2.5, ground, az + nz * 2.5);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 12, uv.getY(i) / 12);
  const mesh = new THREE.Mesh(geo, mats.terraceStone);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.infoId = 'city-ramp';
  return mesh;
}

// --- Market stalls --------------------------------------------------------------------
// Trading in the squares inside the gates (2 Kgs 7:1; Neh 13:15–16; Zeph
// 1:10–11): stalls under cloth awnings and goods spread on mats, each with
// the spot where its seller stands. What is sold leans on the gate: fish at
// the Fish Gate, grain at the Gate of Ephraim (from the north), pots toward
// the Valley Gate and Hinnom (Jer 19:1–2). Silver was weighed on a balance
// (Jer 32:9–10): there were no coins yet.
const lin = (c) => c.map((v) => Math.pow(v, 2.2));
const SC = {
  wood: lin([0.48, 0.34, 0.21]), pole: lin([0.40, 0.29, 0.19]), reed: lin([0.74, 0.64, 0.44]), stone: lin([0.78, 0.74, 0.66]),
  clay: lin([0.74, 0.50, 0.34]), pale: lin([0.82, 0.68, 0.52]), slip: lin([0.62, 0.30, 0.20]), cook: lin([0.34, 0.24, 0.18]),
  grain: lin([0.86, 0.74, 0.46]), barley: lin([0.70, 0.70, 0.40]), basket: lin([0.62, 0.48, 0.29]), sack: lin([0.76, 0.68, 0.54]),
  fig: lin([0.36, 0.24, 0.17]), fish: lin([0.70, 0.70, 0.68]), fishBack: lin([0.40, 0.42, 0.42]), lentil: lin([0.62, 0.40, 0.26]),
  bronze: lin([0.60, 0.42, 0.22]), water: lin([0.20, 0.28, 0.30]), fleece: lin([0.88, 0.84, 0.74]), leek: lin([0.40, 0.55, 0.25]),
  oil: lin([0.55, 0.50, 0.20]),
};
// Which atlas tile each colour of goods is drawn with, and how many metres to the tile.
function goodsTile(g) {
  const c = g.attributes.color.array, key = (v) => v.map((x) => x.toFixed(3)).join();
  const k = key([c[0], c[1], c[2]]);
  if ([SC.wood, SC.pole].some((v) => key(v) === k)) return ['wood', 1.2];
  if ([SC.reed, SC.basket, SC.sack, SC.fleece].some((v) => key(v) === k)) return ['weave', 0.6];
  if (CLOTHS.some((v) => key(v) === k)) return ['weave', 0.25];
  if (key(SC.stone) === k) return ['stone', 1];
  return ['clay', 0.8];
}
const CLOTHS = [[0.84, 0.80, 0.70], [0.62, 0.22, 0.15], [0.30, 0.33, 0.50], [0.74, 0.58, 0.30], [0.56, 0.47, 0.36], [0.46, 0.22, 0.36]].map(lin);
const MARKET_GOODS = {
  'gate-fish': ['fish', 'fish', 'figs', 'fish', 'grain', 'cloth', 'produce', 'oil'],
  'gate-ephraim': ['grain', 'produce', 'grain', 'wool', 'oil', 'figs', 'pottery', 'cloth'],
  'gate-valley': ['pottery', 'grain', 'pottery', 'figs', 'pottery', 'cloth', 'oil', 'produce'],
  'gate-water': ['produce', 'oil', 'produce', 'figs', 'grain', 'pottery', 'wool', 'cloth'],
};
const lathe = (pts, seg, col) => paint(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg).toNonIndexed(), col);
const JAR = [[0.01, 0], [0.13, 0.04], [0.22, 0.22], [0.24, 0.42], [0.17, 0.58], [0.07, 0.64], [0.08, 0.72]];
const JUG = [[0.01, 0], [0.07, 0.01], [0.1, 0.08], [0.08, 0.16], [0.035, 0.22], [0.045, 0.26]];
const BOWL = [[0.01, 0], [0.07, 0.005], [0.15, 0.05], [0.17, 0.08]];
const POT = [[0.01, 0], [0.12, 0.03], [0.18, 0.12], [0.16, 0.2], [0.13, 0.22], [0.14, 0.25]];

function marketStalls(mats, gates, { site, late }) {
  const rand = rng(late ? 77 : 78);
  const body = [], goods = [], stalls = [];
  for (const g of gates) {
    const [cx, cz] = g.inner;
    const ix = -g.sg.nx, iz = -g.sg.nz, tx = -iz, tz = ix;      // inward, and along the wall
    const kinds = late ? MARKET_GOODS[g.id] || MARKET_GOODS['gate-water'] : ['produce', 'grain', 'oil', 'figs', 'wool', 'pottery'].sort(() => rand() - 0.5).slice(0, 4);
    const angles = late ? [-1.45, -1.12, -0.8, -0.5, 0.5, 0.8, 1.12, 1.45] : [-1.2, -0.65, 0.65, 1.2];
    angles.forEach((a, k) => {
      const r = 8.4 + (k % 2) * 0.7 + rand() * 0.3;
      const x = cx + r * (Math.cos(a) * ix + Math.sin(a) * tx), z = cz + r * (Math.cos(a) * iz + Math.sin(a) * tz);
      const y = terrainY(x, z, site);
      const rot = Math.atan2(cx - x, cz - z);
      const B = [], G = [];
      const put = (list, geo, px, py, pz, ry = 0) => {
        const [tile, size] = goodsTile(geo);
        atlasUV(geo, tile, size);
        geo.rotateY(ry); geo.translate(px, py, pz); list.push(geo);
      };
      const awning = rand() < (late ? 0.7 : 0.45);
      const cloth = CLOTHS[Math.floor(rand() * CLOTHS.length)];
      let top, x0, x1, z0, z1;                                    // where goods go: on the table or the mat
      if (awning) {
        for (const [px, pz, h] of [[-1.2, -0.9, 2.35], [1.2, -0.9, 2.35], [-1.2, 0.9, 2.05], [1.2, 0.9, 2.05]]) {
          const pole = new THREE.CylinderGeometry(0.04, 0.05, h, 5, 1, true).toNonIndexed();
          put(B, paint(pole, SC.pole), px, h / 2, pz);
        }
        put(B, cbox(-1.15, 1.15, 0.74, 0.79, 0.25, 0.85, SC.wood), 0, 0, 0);        // table board on trestles
        for (const s of [-1, 1]) put(B, cbox(s * 0.95 - 0.04, s * 0.95 + 0.04, 0, 0.74, 0.3, 0.8, SC.wood), 0, 0, 0);
        const aw = cbox(-1.4, 1.4, -0.012, 0.012, -1.05, 1.05, cloth);
        aw.rotateX(Math.atan2(0.3, 1.8));
        put(G, aw, 0, 2.22, 0);
        top = 0.79; x0 = -1; x1 = 1; z0 = 0.35; z1 = 0.75;
      } else {
        put(G, cbox(-1.0, 1.0, 0, 0.02, -0.3, 1.0, SC.reed), 0, 0, 0);
        for (const s of [-1, 1]) {
          const pole = new THREE.CylinderGeometry(0.035, 0.045, 1.95, 5, 1, true).toNonIndexed();
          put(B, paint(pole, SC.pole), s * 1.05, 0.97, -0.6);
        }
        const sh = cbox(-1.2, 1.2, -0.01, 0.01, -0.8, 0.8, cloth);
        sh.rotateX(Math.atan2(0.5, 1.6));
        put(G, sh, 0, 1.68, 0.15);
        top = 0.02; x0 = -0.85; x1 = 0.85; z0 = 0.05; z1 = 0.85;
      }
      const at = (u, v) => [x0 + (x1 - x0) * u, z0 + (z1 - z0) * v];
      const kind = kinds[k % kinds.length];
      const jar = (px, py, pz, s = 1, col = SC.clay, handles = false) => {
        const j = lathe(JAR, 8, col);
        j.scale(s, s, s);
        put(G, j, px, py, pz, rand() * 6);
        if (handles) for (let h = 0; h < 4; h++) {                // four-handled royal type (late 8th–7th c.)
          const hd = cbox(0.2 * s, 0.25 * s, 0.4 * s, 0.53 * s, -0.025 * s, 0.025 * s, col);
          put(G, hd, px, py, pz, h * Math.PI / 2 + 0.4);
        }
      };
      const basket = (px, py, pz, rr, fill) => {
        put(G, paint(new THREE.CylinderGeometry(rr, rr * 0.82, rr * 1.1, 8, 1, true).toNonIndexed(), SC.basket), px, py + rr * 0.55, pz);
        put(G, paint(new THREE.CylinderGeometry(rr * 0.97, rr * 0.97, 0.02, 8).toNonIndexed(), fill), px, py + rr * 0.98, pz);
      };
      const sack = (px, py, pz, col = SC.sack) => {
        const s = new THREE.SphereGeometry(0.2, 6, 4).toNonIndexed();
        s.scale(1, 1.3, 0.9);
        put(G, paint(s, col), px, py + 0.24, pz, rand() * 3);
      };
      const bowl = (px, py, pz, fill) => {
        put(G, lathe(BOWL, 8, SC.pale), px, py, pz);
        if (fill) put(G, paint(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 8).toNonIndexed(), fill), px, py + 0.06, pz);
      };
      // A balance with a stone weight, for weighing out the silver.
      const balance = (px, py, pz) => {
        put(G, cbox(-0.015, 0.015, 0, 0.42, -0.015, 0.015, SC.wood), px, py, pz);
        put(G, cbox(-0.24, 0.24, 0.4, 0.415, -0.008, 0.008, SC.bronze), px, py, pz);
        for (const s of [-1, 1]) put(G, paint(new THREE.CylinderGeometry(0.07, 0.05, 0.02, 8).toNonIndexed(), SC.bronze), px + s * 0.22, py + 0.2, pz);
        put(G, cbox(-0.02, 0.02, 0, 0.03, -0.015, 0.015, SC.stone), px + 0.12, py, pz + 0.1);
      };
      if (kind === 'grain') {
        for (let i = 0; i < 3; i++) { const [u, v] = at(0.15 + i * 0.35, 0.5); bowl(u, top, v, i === 1 ? SC.barley : SC.grain); }
        sack(-0.7, 0, awning ? -0.5 : -0.5); sack(0.65, 0, -0.55, SC.basket);
        basket(awning ? 0.2 : 0.4, awning ? 0 : top, awning ? 1.25 : 0.5, 0.26, SC.grain);
        if (awning) balance(0.75, top, 0.55);
      } else if (kind === 'figs') {
        for (let i = 0; i < 4; i++) {
          const [u, v] = at(0.1 + i * 0.27, 0.5);
          const st = 2 + Math.floor(rand() * 3);
          for (let k2 = 0; k2 < st; k2++) put(G, paint(new THREE.CylinderGeometry(0.11, 0.11, 0.045, 8).toNonIndexed(), SC.fig), u, top + 0.025 + k2 * 0.048, v);
        }
        basket(-0.6, 0, awning ? 1.2 : -0.45, 0.24, SC.fig);
        basket(0.6, 0, awning ? -0.45 : -0.45, 0.22, SC.fig);
      } else if (kind === 'oil') {
        for (let i = 0; i < 3; i++) jar(-0.75 + i * 0.6, 0, awning ? -0.45 : -0.5, 1, i === 1 ? SC.pale : SC.clay, late);
        for (let i = 0; i < 4; i++) { const [u, v] = at(0.1 + i * 0.27, 0.5); put(G, lathe(JUG, 7, i % 2 ? SC.slip : SC.clay), u, top, v); }
        if (awning) balance(0.6, top, 0.55);
      } else if (kind === 'pottery') {
        for (let i = 0; i < 3; i++) {
          const [u, v] = at(0.12 + i * 0.38, 0.45);
          for (let k2 = 0; k2 < 3 + (i % 2); k2++) put(G, lathe(BOWL, 8, i === 1 ? SC.slip : SC.pale), u, top + k2 * 0.035, v);
        }
        for (let i = 0; i < 3; i++) put(G, lathe(POT, 8, SC.cook), -0.8 + i * 0.45, 0, awning ? 1.2 : -0.45);
        for (let i = 0; i < 2; i++) jar(0.7 + i * 0.4 - (awning ? 0 : 1.6), 0, awning ? -0.5 : -0.1 + i * 0.1 + 0.95, 0.9);
        put(G, lathe(JUG, 7, SC.slip), 0.85, top, at(0, 0.8)[1]);
      } else if (kind === 'cloth') {
        for (let i = 0; i < 5; i++) {
          const [u, v] = at(0.08 + i * 0.21, 0.5);
          for (let k2 = 0; k2 < 2; k2++) put(G, cbox(-0.09, 0.09, 0, 0.06, -0.15, 0.15, CLOTHS[(i + k2 * 2) % CLOTHS.length]), u, top + k2 * 0.06, v, (rand() - 0.5) * 0.2);
        }
        const bar = awning ? -0.9 : -0.6, bh = awning ? 1.9 : 1.6;     // cloth hung over a rail at the back
        put(B, cbox(-1.1, 1.1, bh, bh + 0.04, -0.02, 0.02, SC.pole), 0, 0, bar + 0.05);
        for (let i = 0; i < 3; i++) put(G, cbox(-0.28, 0.28, bh - 1.0, bh, -0.012, 0.012, CLOTHS[(i * 2 + 1) % CLOTHS.length]), -0.7 + i * 0.7, 0, bar + 0.09);
      } else if (kind === 'fish') {
        for (let i = 0; i < 9; i++) {                           // dried and salted fish laid in rows
          const [u, v] = at(0.06 + (i % 5) * 0.22, i < 5 ? 0.25 : 0.75);
          const f = new THREE.IcosahedronGeometry(0.5, 0);
          f.scale(0.34, 0.05, 0.11);
          put(G, paint(f, i % 3 ? SC.fish : SC.fishBack), u, top + 0.025, v, 0.15 * (rand() - 0.5));
        }
        basket(-0.75, 0, awning ? -0.5 : -0.5, 0.25, SC.fish);
        basket(0.75, 0, awning ? -0.5 : -0.5, 0.22, SC.fishBack);
      } else if (kind === 'produce') {
        for (let i = 0; i < 4; i++) {                           // sheaves of the first barley, bundles of leeks
          const sh = new THREE.ConeGeometry(0.09, 0.7, 6, 1, true).toNonIndexed();
          sh.rotateZ(Math.PI / 2);
          const [u, v] = at(0.1 + i * 0.27, 0.5);
          put(G, paint(sh, i < 2 ? SC.barley : SC.leek), u, top + 0.08, v, Math.PI / 2 + (rand() - 0.5) * 0.3);
        }
        sack(-0.65, 0, -0.5, SC.lentil);
        basket(0.6, 0, awning ? -0.5 : -0.5, 0.24, SC.lentil);
        basket(0.1, 0, awning ? 1.25 : -0.55, 0.22, SC.leek);
      } else if (kind === 'wool') {
        for (let i = 0; i < 4; i++) {
          const f = new THREE.IcosahedronGeometry(0.5, 0);
          f.scale(0.5, 0.14, 0.38);
          const [u, v] = at(0.12 + i * 0.25, 0.5);
          put(G, paint(f, i === 2 ? lin([0.4, 0.33, 0.26]) : SC.fleece), u, top + 0.05, v, rand() * 3);
        }
        sack(-0.6, 0, -0.5, SC.fleece);
        if (awning) balance(0.75, top, 0.55);
      }
      for (const geo of [...B, ...G]) { geo.rotateY(rot); geo.translate(x, y, z); }
      body.push(...B);
      goods.push(...G);
      // The seller stands behind the goods, facing the customers in the square.
      const sx = x - Math.sin(rot) * 0.35, sz = z - Math.cos(rot) * 0.35;
      stalls.push({ x: sx, y: terrainY(sx, sz, site), z: sz, rot });
    });
    // A stone trough by the gate for the donkeys of those who come to trade.
    const side = rand() < 0.5 ? -1 : 1;
    const wx = cx - ix * 4.5 + tx * 7 * side, wz = cz - iz * 4.5 + tz * 7 * side;
    const wy = terrainY(wx, wz, site), wr = Math.atan2(tx, tz);
    const tr = cbox(-0.3, 0.3, -0.4, 0.55, -0.95, 0.95, SC.stone), wt = cbox(-0.24, 0.24, 0.5, 0.505, -0.88, 0.88, SC.water);
    for (const geo of [tr, wt]) { atlasUV(geo, 'stone', 1); geo.rotateY(wr); geo.translate(wx, wy, wz); }
    body.push(tr);
    goods.push(wt);
  }
  const group = new THREE.Group();
  for (const [list, isSolid] of [[body, true], [goods, false]]) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeParts(list), propAtlas());
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.infoId = 'city-market';
    if (isSolid) mesh.userData.solid = true;
    group.add(mesh);
  }
  return { group, stalls };
}

// --- Assemble ----------------------------------------------------------------------------
// Groups: common (all periods), early, later (late + ruin), late, ruin,
// nearTrees (hidden in 573 BC: cut down for the siege), padLate / padRuin
// (houses on the Ophel terrace, only where no palace is shown).
export function buildCity(mats, plan, { quality = 'high' } = {}) {
  const rand = rng(42);
  const groups = {};
  const mk = (k) => (groups[k] = new THREE.Group());
  ['common', 'early', 'later', 'late', 'ruin', 'padLate', 'padRuin'].forEach(mk);
  const zones = [], labels = [], smoke = { early: [], late: [] }, walk = {};
  const L = (label, pos, periods, info) => labels.push({ label, pos, periods, info });

  // Walls and gates
  const lateGates = GATES.filter((g) => g.periods.includes('late'));
  const earlyGates = GATES.filter((g) => g.periods.includes('early'));
  const wallLate = buildWalls(mats, { line: CITY_WALL, poly: LATE_POLY, site: 'square', gates: lateGates, height: 10, thick: 4.5, broad: BROAD_WALL, towerEvery: 50, shields: true, infoId: 'city-wall-late' });
  const wallRuin = buildWalls(mats, { line: CITY_WALL, poly: LATE_POLY, site: 'square', gates: lateGates, height: 10, thick: 4.5, broad: BROAD_WALL, towerEvery: 50, ruin: true, breachAt: [-600, 181], infoId: 'city-wall-ruin' });
  const wallEarly = buildWalls(mats, { line: EARLY_WALL, poly: EARLY_POLY, site: 'sp', gates: earlyGates, height: 8, thick: 4, towerEvery: 45, infoId: 'city-wall-early' });
  groups.late.add(wallLate.group);
  groups.ruin.add(wallRuin.group);
  groups.early.add(wallEarly.group);
  zones.push(...wallLate.zones.map((z) => ({ ...z, periods: ['late'] })), ...wallRuin.zones.map((z) => ({ ...z, periods: ['ruin'] })), ...wallEarly.zones.map((z) => ({ ...z, periods: ['early'] })));
  for (const l of wallLate.labels) L(l.label, l.pos, LATER, l.info);
  for (const l of wallEarly.labels) L(l.label, l.pos, ['early'], l.info);
  groups.ruin.add(siegeRamp(mats, { height: 10 }));
  L('Siege ramp', new THREE.Vector3(-600, terrainY(-600, 150) + 22, 150), ['ruin'], 'city-ramp');
  L('Broad Wall', new THREE.Vector3(-380, terrainY(-380, 200) + 18, 200), LATER, 'city-broadwall');

  // Houses
  const rect = (r, m) => (x, z) => inRect(x, z, r, m);
  const avoidLandmarks = (x, z) => inRect(x, z, { x0: LSS.x0 - 6, x1: SSS.x0 + 48, z0: LSS.z0 - 8, z1: LSS.z1 + 8 })
    || Math.hypot(x - GIHON.x, z - GIHON.z) < 30
    || inRect(x, z, { x0: SILOAM_POOL.x - 26, x1: SILOAM_POOL.x + 26, z0: SILOAM_POOL.z - 16, z1: SILOAM_POOL.z + 16 })
    || inRect(x, z, { x0: EZ_STAIR.x0, x1: EZ_STAIR.x1, z0: PODIUM.z1 - 2, z1: PALACE_PAD.z0 + 2 });
  const late = layoutCity({
    poly: LATE_POLY, site: 'square', wall: CITY_WALL, wallHalf: 3.5,
    exclude: (x, z) => rect(PODIUM, 26)(x, z) || avoidLandmarks(x, z),
    streets: STREETS.late, plazas: wallLate.gates.map((g) => [...g.inner, 12]),
    target: quality === 'low' ? 1500 : 2600, rand,
  });
  const early = layoutCity({
    poly: EARLY_POLY, site: 'sp', wall: EARLY_WALL, wallHalf: 2,
    exclude: (x, z) => rect(SOLOMON_PLATFORM, 8)(x, z) || rect(PALACE_PAD, 5)(x, z) || avoidLandmarks(x, z),
    streets: STREETS.early, plazas: wallEarly.gates.map((g) => [...g.inner, 11]),
    target: quality === 'low' ? 380 : 620, rand,
  });
  const onPad = (h) => inRect(h.x, h.z, PALACE_PAD, 4);
  const lateMain = late.houses.filter((h) => !onPad(h)), latePad = late.houses.filter(onPad);
  groups.late.add(houseMeshes(lateMain, mats, { quality }));
  groups.ruin.add(houseMeshes(lateMain, mats, { ruin: true }));
  groups.padLate.add(houseMeshes(latePad, mats, { quality }));
  groups.padRuin.add(houseMeshes(latePad, mats, { ruin: true }));
  groups.early.add(houseMeshes(early.houses, mats, { quality }));
  walk.late = late.walkable;
  walk.early = early.walkable;
  for (let i = 0; i < 16; i++) {
    const h = lateMain[Math.floor(rand() * lateMain.length)];
    if (h) smoke.late.push(new THREE.Vector3(h.x, h.floor + h.ht + 0.8, h.z));
  }
  for (let i = 0; i < 9; i++) {
    const h = early.houses[Math.floor(rand() * early.houses.length)];
    if (h) smoke.early.push(new THREE.Vector3(h.x, h.floor + h.ht + 0.8, h.z));
  }

  // Landmarks of the City of David and the Kidron
  groups.common.add(steppedStoneStructure(mats), largeStoneStructure(mats), gihonTowers(mats));
  L('Stepped Stone Structure', new THREE.Vector3(60, terrainY(60, 430) + 16, 430), ALL, 'city-sss');
  L('Large Stone Structure', new THREE.Vector3(13, terrainY(13, 422) + 16, 422), ALL, 'city-lss');
  const ch = channel(mats);
  ch.lining.userData.infoId = ch.water.userData.infoId = 'city-channel';
  ch.lining.receiveShadow = true;
  ch.water.renderOrder = 2;
  groups.common.add(ch.lining, ch.water);
  groups.common.add(pool(mats, 'city-lower-pool', LOWER_POOL));
  L('Lower Pool', new THREE.Vector3(LOWER_POOL.x, terrainY(LOWER_POOL.x, LOWER_POOL.z) + 10, LOWER_POOL.z), ALL, 'city-lower-pool');
  groups.later.add(pool(mats, 'city-siloam', SILOAM_POOL));
  L('Pool of Siloam', new THREE.Vector3(SILOAM_POOL.x, terrainY(SILOAM_POOL.x, SILOAM_POOL.z) + 10, SILOAM_POOL.z), LATER, 'city-siloam');
  const tm = TUNNEL[Math.floor(TUNNEL.length / 2)];
  L('Hezekiah\'s tunnel (underground)', new THREE.Vector3(tm[0], terrainY(tm[0], tm[1]) + 8, tm[1]), LATER, 'city-tunnel');
  groups.later.add(silwanTombs(mats, rand), monolith(mats));
  L('Silwan tombs', new THREE.Vector3(250, terrainY(250, 560) + 16, 560), LATER, 'city-silwan');
  groups.early.add(highPlace(mats));
  L('High places (1 Kgs 11:7)', new THREE.Vector3(610, terrainY(610, 690) + 12, 690), ['early'], 'city-bamah');
  L('King\'s Garden', new THREE.Vector3(KINGS_GARDEN.x, terrainY(KINGS_GARDEN.x, KINGS_GARDEN.z) + 14, KINGS_GARDEN.z), ALL, 'city-garden');

  // Countryside
  const trees = buildTrees(mats, quality, rand);
  groups.common.add(trees.far, trees.garden);
  groups.early.add(trees.westHill, trees.square);
  groups.nearTrees = trees.near;
  groups.common.add(vineyards(mats, quality, rand));
  groups.common.add(farmBuildings(mats, plan));
  groups.common.add(threshingFloors(mats, plan.floors.filter((f) => !insidePolygon(f.x, f.z, LATE_POLY))));
  groups.early.add(threshingFloors(mats, plan.floors.filter((f) => insidePolygon(f.x, f.z, LATE_POLY))));

  for (const k of ['late', 'ruin', 'early', 'padLate', 'padRuin']) {
    groups[k].children.forEach((c) => { if (c !== trees.westHill && c !== trees.square) solid(c); });
  }
  groups.common.children.forEach((c) => { if (c !== trees.far && c !== trees.garden && c.userData.infoId !== 'city-vines') solid(c); });
  groups.later.children.forEach(solid);
  const gates = { late: wallLate.gates.map((g) => g.inner), early: wallEarly.gates.map((g) => g.inner) };
  // After dark: fires in a few courtyards, torches either side of each gate.
  const courtFire = (list) => list.filter((h, i) => h.type !== 'C' && hash1(i * 31 + 7) < 0.12).map((h) => {
    const lz = 0.16 * h.d;
    return new THREE.Vector3(h.x + lz * Math.sin(h.rot), h.floor + 0.05, h.z + lz * Math.cos(h.rot));
  });
  // Torches on both faces of each gate, either side of the opening.
  const torches = (gs, site) => gs.flatMap((g) => {
    const tx = Math.cos(g.sg.ang), tz = Math.sin(g.sg.ang);
    const half = (g.sg.th || 4.5) / 2 + 0.4;              // just off the wall face
    return [half, -half].flatMap((out) => [-1, 1].map((s) => {
      const x = g.x + g.sg.nx * out + tx * s * 4.2, z = g.z + g.sg.nz * out + tz * s * 4.2;
      return new THREE.Vector3(x, terrainY(x, z, site) + 3.2, z);
    }));
  });
  const night = {
    late: { fires: courtFire(lateMain), torches: torches(wallLate.gates, 'square') },
    early: { fires: courtFire(early.houses), torches: torches(wallEarly.gates, 'sp') },
  };
  const marketLate = marketStalls(mats, wallLate.gates.filter((g) => ['gate-fish', 'gate-water', 'gate-ephraim', 'gate-valley'].includes(g.id)), { site: 'square', late: true });
  const marketEarly = marketStalls(mats, wallEarly.gates, { site: 'sp', late: false });
  groups.late.add(marketLate.group);
  groups.early.add(marketEarly.group);
  return {
    groups, zones, labels, smoke, walk, gates, night,
    // Where each stall's seller stands and the way they face (yaw, as Math.atan2(dx, dz)).
    stalls: { late: marketLate.stalls, early: marketEarly.stalls },
    grids: { late: late.grid, early: early.grid },
    houses: { late: lateMain, early: early.houses },
  };
}

