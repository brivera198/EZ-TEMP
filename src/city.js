// Jerusalem's city and countryside for each period: houses, walls and gates,
// excavated landmarks, trees, vineyards and farm buildings. World units are
// metres (x = east, z = south), as in terrain.js.
import * as THREE from 'three';
import { Builder, boxGeom, aeolicCapital, cbox, paint, mergeParts } from './builder.js';
import {
  terrainY, insidePolygon, inRect, fbm, rng, smooth, distToLine, valleyX, naturalElevation,
  PODIUM, LATE_POLY, EARLY_POLY, TUNNEL,
} from './terrain.js';
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
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const [x, y, z] = pts[i];
    pos.push(x - tz * width / 2, y, z + tx * width / 2, x + tz * width / 2, y, z - tx * width / 2);
    if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
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

// --- House models -----------------------------------------------------------------
// Unit models: x across the front (-0.5..0.5), z from back (-0.5) to front
// (+0.5, facing downhill), y from floor (0) to roof (1).
const WALL = [1, 1, 1], ROOF = [0.80, 0.72, 0.60], PILLAR = [0.78, 0.73, 0.66];
const OVEN = [0.42, 0.31, 0.24], DARK = [0.22, 0.17, 0.13], RUBBLE = [0.62, 0.57, 0.50], CHAR = [0.16, 0.13, 0.11];

function parapets(p, y, rects) {
  for (const [x0, x1, z0, z1] of rects) p.push(cbox(x0, x1, y, y + 0.17, z0, z1, WALL));
}

// The four-room (pillared) house: three long rooms and a broad room round a
// courtyard; flat roofs with a parapet (Deut 22:8); optional upper room.
function fourRoomHouse(upper) {
  const p = [];
  const tx = 0.06, tz = 0.05;
  p.push(cbox(-0.5, 0.5, 0, 1, -0.5, -0.5 + tz, WALL));
  p.push(cbox(-0.5, -0.5 + tx, 0, 1, -0.5 + tz, 0.5, WALL));
  p.push(cbox(0.5 - tx, 0.5, 0, 1, -0.5 + tz, 0.5, WALL));
  p.push(cbox(-0.5 + tx, -0.09, 0, 1, 0.5 - tz, 0.5, WALL));
  p.push(cbox(0.09, 0.5 - tx, 0, 1, 0.5 - tz, 0.5, WALL));
  p.push(cbox(-0.09, 0.09, 0.7, 1, 0.5 - tz, 0.5, WALL));
  p.push(cbox(-0.5 + tx, -0.07, 0, 1, -0.22, -0.18, WALL));        // broad room
  p.push(cbox(0.07, 0.5 - tx, 0, 1, -0.22, -0.18, WALL));
  p.push(cbox(-0.07, 0.07, 0.68, 1, -0.22, -0.18, WALL));
  for (const s of [-1, 1]) for (const z of [-0.06, 0.14, 0.34]) {  // pillars between courtyard and side rooms
    p.push(cbox(s * 0.2 - 0.025, s * 0.2 + 0.025, 0, 0.94, z - 0.025, z + 0.025, PILLAR));
  }
  p.push(cbox(-0.5, 0.5, 0.94, 1, -0.5, -0.18, ROOF));
  p.push(cbox(-0.5, -0.18, 0.94, 1, -0.18, 0.5, ROOF));
  p.push(cbox(0.18, 0.5, 0.94, 1, -0.18, 0.5, ROOF));
  parapets(p, 1, [
    [-0.5, 0.5, -0.5, -0.47], [-0.5, -0.47, -0.47, 0.5], [0.47, 0.5, -0.47, 0.5],
    [-0.47, -0.18, 0.47, 0.5], [0.18, 0.47, 0.47, 0.5],
    [-0.21, -0.18, -0.18, 0.47], [0.18, 0.21, -0.18, 0.47], [-0.18, 0.18, -0.21, -0.18],
  ]);
  const oven = new THREE.CylinderGeometry(0.03, 0.045, 0.12, 8).toNonIndexed();   // clay oven (tannur)
  oven.translate(0.09, 0.06, 0.3);
  p.push(paint(oven, OVEN));
  if (upper) {                                          // upper room on the roof (2 Kgs 4:10)
    p.push(cbox(-0.44, 0.06, 1, 1.62, -0.47, -0.21, WALL));
    p.push(cbox(-0.46, 0.08, 1.62, 1.68, -0.49, -0.19, ROOF));
    p.push(cbox(-0.12, -0.02, 1, 1.45, -0.215, -0.205, DARK));
  }
  return mergeParts(p);
}

// Smaller broad-room house with a walled yard.
function broadRoomHouse() {
  const p = [];
  p.push(cbox(-0.5, 0.5, 0, 1, -0.5, -0.02, WALL));
  p.push(cbox(-0.48, 0.48, 1, 1.03, -0.48, -0.04, ROOF));
  parapets(p, 1.03, [[-0.5, 0.5, -0.5, -0.47], [-0.5, 0.5, -0.05, -0.02], [-0.5, -0.47, -0.47, -0.05], [0.47, 0.5, -0.47, -0.05]]);
  p.push(cbox(-0.08, 0.08, 0, 0.7, -0.02, -0.01, DARK));
  for (const [x0, x1, z0, z1] of [[-0.5, -0.1, 0.46, 0.5], [0.1, 0.5, 0.46, 0.5], [-0.5, -0.46, -0.02, 0.46], [0.46, 0.5, -0.02, 0.46]]) {
    p.push(cbox(x0, x1, 0, 0.42, z0, z1, WALL));
  }
  const oven = new THREE.CylinderGeometry(0.035, 0.05, 0.13, 8).toNonIndexed();
  oven.translate(-0.25, 0.065, 0.25);
  p.push(paint(oven, OVEN));
  return mergeParts(p);
}

function simpleHouse() {
  const p = [cbox(-0.5, 0.5, 0, 1, -0.5, 0.5, WALL), cbox(-0.47, 0.47, 1, 1.02, -0.47, 0.47, ROOF)];
  parapets(p, 1, [[-0.5, 0.5, -0.5, -0.47], [-0.5, 0.5, 0.47, 0.5], [-0.5, -0.47, -0.47, 0.47], [0.47, 0.5, -0.47, 0.47]]);
  return mergeParts(p);
}

// Burned house: broken walls, no roof, rubble and charred beams.
function ruinedHouse(rand) {
  const p = [];
  const wall = (x0, x1, z0, z1, alongX) => {
    for (let k = 0; k < 4; k++) {
      const t0 = k / 4, t1 = (k + 1) / 4, h = 0.16 + rand() * 0.5;
      if (alongX) p.push(cbox(x0 + (x1 - x0) * t0, x0 + (x1 - x0) * t1, 0, h, z0, z1, WALL));
      else p.push(cbox(x0, x1, 0, h, z0 + (z1 - z0) * t0, z0 + (z1 - z0) * t1, WALL));
    }
  };
  wall(-0.5, 0.5, -0.5, -0.45, true);
  wall(-0.5, 0.5, 0.45, 0.5, true);
  wall(-0.5, -0.44, -0.45, 0.45, false);
  wall(0.44, 0.5, -0.45, 0.45, false);
  wall(-0.44, 0.44, -0.22, -0.18, true);
  for (let k = 0; k < 4; k++) {
    const m = new THREE.IcosahedronGeometry(0.5, 0);
    m.scale(0.28 + rand() * 0.12, 0.1 + rand() * 0.08, 0.22 + rand() * 0.1);
    m.translate(-0.3 + rand() * 0.6, 0, -0.3 + rand() * 0.6);
    p.push(paint(m, RUBBLE));
  }
  const beam = cbox(-0.3, 0.3, 0.02, 0.05, -0.02, 0.02, CHAR);
  beam.rotateY(rand() * 3);
  p.push(beam);
  return mergeParts(p);
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
    A: fourRoomHouse(false), B: fourRoomHouse(true), C: broadRoomHouse(), L: simpleHouse(),
    R: [ruinedHouse(r), ruinedHouse(r), ruinedHouse(r)], plinth,
  };
  return HOUSE_GEOS;
}

// Whitewash, mud plaster, bare stone, buff plaster.
const TINTS = [[0.95, 0.92, 0.86], [0.82, 0.71, 0.56], [0.76, 0.72, 0.64], [0.90, 0.84, 0.74]];

function houseMeshes(recs, mats, { ruin = false, quality = 'high' } = {}) {
  const G = houseGeos();
  const group = new THREE.Group();
  const byKey = {};
  recs.forEach((r, i) => {
    const key = ruin ? `R${i % 3}` : quality === 'low' ? 'L' : r.type;
    (byKey[key] ||= []).push(r);
  });
  for (const [key, list] of Object.entries(byKey)) {
    const geo = key[0] === 'R' ? G.R[+key[1]] : G[key];
    const im = instanced(geo, mats.house, list, ruin ? 'city-house-ruin' : 'city-house', (r, p, q, s, c) => {
      p.set(r.x, r.floor, r.z);
      q.setFromAxisAngle(Y_AXIS, r.rot);
      s.set(r.w, r.ht, r.d);
      const t = TINTS[r.tint], k = (ruin ? 0.6 : 1) * r.shade;
      c.setRGB(t[0] * k, t[1] * k, t[2] * k);
    });
    group.add(im);
  }
  group.add(instanced(G.plinth, mats.terraceStone, recs, ruin ? 'city-house-ruin' : 'city-house', (r, p, q, s, c) => {
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
  return { houses, walkable };
}

// --- City walls, towers and gates ------------------------------------------------------
function buildWalls(mats, { line, poly, site, gates, height, thick, broad, towerEvery, ruin, shields, breachAt, infoId }) {
  const parts = { body: [], broad: [], dressed: [], shield: [], wood: [], scree: [] };
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
    if (!ruin) {
      fbox(parts.dressed, sg, g.x, g.z, -2.6, 2.6, -6, 6, ground + 6.5, gTop, 3);    // chamber over the passage
      for (const b of [-5.6, 5.6]) for (let j = 0; j < 8; j++) {
        const a = -9 + (j + 0.5) * 18 / 8;
        fbox(parts.dressed, sg, g.x, g.z, a - 0.6, a + 0.6, b - 0.4, b + 0.4, gTop, gTop + 1.3, 2);
      }
      for (const sa of [-1, 1]) {
        fbox(parts.wood, sg, g.x, g.z, sa > 0 ? 2.3 : -2.6, sa > 0 ? 2.6 : -2.3, -1.6, 2.4, ground, ground + 6.2, 2);   // gate leaves, open
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
  const keyMat = { body: 'rubble', broad: 'rubble', dressed: 'ashlar', shield: 'shield', wood: 'cedar', scree: 'rubble' };
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeParts(list), mats[keyMat[k]]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.infoId = k === 'broad' ? 'city-broadwall' : infoId;
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
  const water = new THREE.Mesh(ribbon(dense, 1.2), mats.water);
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

// --- Trees and vineyards -----------------------------------------------------------
// Canopy of several leafy clumps, darker underneath and toward the core.
function canopy(clumps, silver) {
  const parts = clumps.map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const k = 1 + 0.18 * Math.sin(vx * 3.1 + vz * 2.3 + x * 5) * Math.cos(vy * 2.7 - z * 3);
      p.setXYZ(i, vx * k, vy * k * 0.8, vz * k);
    }
    g.translate(x, y, z);
    return g;
  });
  const g = mergeParts(parts);
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = 0.5 + 0.5 * THREE.MathUtils.smoothstep(p.getY(i), 2.2, 4.4);
    c.setXYZ(i, k * (1 + silver * 0.1), k * (1 + silver * 0.12), k * (1 + silver * 0.14));
  }
  g.computeVertexNormals();
  return g;
}

// Short trunk forking into two leaders, as old olive trees do.
function forkedTrunk() {
  const parts = [];
  const base = new THREE.CylinderGeometry(0.3, 0.46, 1.4, 7, 1, true);
  base.translate(0, 0.7, 0);
  parts.push(base);
  for (const [ax, az] of [[0.35, 0.15], [-0.3, -0.2]]) {
    const b = new THREE.CylinderGeometry(0.14, 0.24, 1.7, 6, 1, true);
    b.translate(0, 0.85, 0);
    b.rotateZ(-ax);
    b.rotateX(az);
    b.translate(0, 1.25, 0);
    parts.push(b);
  }
  const g = mergeParts(parts);
  const p = g.attributes.position, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) { const k = 0.7 + 0.3 * Math.min(1, p.getY(i) / 2.5); c.setXYZ(i, k, k, k); }
  return g;
}

let TREE_GEOS = null;
function treeGeos() {
  if (TREE_GEOS) return TREE_GEOS;
  const trunk = forkedTrunk();
  const olive = canopy([[0, 3.2, 0, 1.55], [1.05, 2.9, 0.55, 1.15], [-0.95, 3.0, -0.45, 1.2], [0.25, 3.75, -0.75, 1.05], [-0.4, 2.8, 1.0, 1.0]], 1);
  const broad = canopy([[0, 3.3, 0, 2.0], [1.5, 3.0, 0.7, 1.5], [-1.4, 3.1, -0.6, 1.55], [0.4, 4.1, -1.0, 1.35], [-0.6, 2.9, 1.4, 1.35]], 0);
  TREE_GEOS = { trunk, olive, broad };
  return TREE_GEOS;
}

function treeSet(mats, list) {
  const G = treeGeos();
  const group = new THREE.Group();
  const setup = (t, p, q, s, c) => {
    p.set(t.x, t.y - 0.2, t.z);
    q.setFromAxisAngle(Y_AXIS, t.r);
    s.set(t.s, t.s * (0.9 + t.k * 0.3), t.s);
    if (t.broad) c.setRGB(0.3 + t.k * 0.07, 0.42 + t.k * 0.07, 0.2 + t.k * 0.05);
    else c.setRGB(0.44 + t.k * 0.08, 0.5 + t.k * 0.06, 0.36 + t.k * 0.05);
  };
  group.add(instanced(G.trunk, mats.trunk, list, 'city-olive', (t, p, q, s, c) => { setup(t, p, q, s, c); c.setRGB(1, 1, 1); }));
  group.add(instanced(G.olive, mats.olive, list.filter((t) => !t.broad), 'city-olive', setup));
  group.add(instanced(G.broad, mats.olive, list.filter((t) => t.broad), 'city-olive', setup));
  return group;
}

function buildTrees(mats, quality, rand) {
  const sets = { far: [], near: [], westHill: [], square: [], garden: [] };
  const max = quality === 'low' ? 3000 : 5600;
  let count = 0;
  for (let n = 0; n < 160000 && count < max; n++) {
    const x = -1650 + rand() * 3300, z = -1350 + rand() * 3300;
    if (insidePolygon(x, z, EARLY_POLY) || inRect(x, z, PALACE_PAD, 10) || inRect(x, z, SOLOMON_PLATFORM, 18)) continue;
    let set;
    const gx = (x - KINGS_GARDEN.x) / KINGS_GARDEN.rx, gz = (z - KINGS_GARDEN.z) / KINGS_GARDEN.rz;
    if (inRect(x, z, PODIUM, 4)) set = 'square';
    else if (insidePolygon(x, z, LATE_POLY)) set = 'westHill';
    else if (gx * gx + gz * gz < 1) set = 'garden';
    else set = distToLine(x, z, LATE_POLY, true) < 220 ? 'near' : 'far';
    const grove = 0.5 + 0.5 * fbm(x / 120, z / 120, 2);
    const desert = smooth(1050, 1600, x);
    let p = (grove * 0.75 + (x > 300 ? 0.35 : 0) + (set === 'garden' ? 0.7 : 0)) * (1 - desert * 0.85);
    if (set === 'westHill') p *= 0.5;
    if (set === 'square') p *= 0.4;
    if (rand() > p) continue;
    const site = set === 'square' || set === 'westHill' ? 'sp' : 'square';
    if (slopeAt(x, z, site, 1) > 0.9) continue;
    const broad = set === 'garden' ? rand() < 0.7 : rand() < 0.28;
    const sc = set === 'garden' ? 0.55 + rand() * 0.4 : 0.75 + rand() * 0.6;
    sets[set].push({ x, y: terrainY(x, z, site), z, s: sc, r: rand() * 6.28, k: rand(), broad });
    count++;
  }
  const out = {};
  for (const [k, list] of Object.entries(sets)) out[k] = treeSet(mats, list);
  return out;
}

// Vines in rows along the terrace beds (the same contour bands the terrain
// shader draws as terrace walls).
function vineyards(mats, quality, rand) {
  const zones = [
    { x0: -1000, x1: -450, z0: 920, z1: 1350 },
    { x0: 320, x1: 720, z0: -700, z1: -160 },
    { x0: -160, x1: 160, z0: 1180, z1: 1420 },
    { x0: -1320, x1: -860, z0: 120, z1: 620 },
  ];
  const max = quality === 'low' ? 1800 : 5200;
  const vines = [];
  const step = 2.6;
  for (const zn of zones) {
    const nx = Math.ceil((zn.x1 - zn.x0) / step), nz = Math.ceil((zn.z1 - zn.z0) / step);
    const hs = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) hs[j * (nx + 1) + i] = terrainY(zn.x0 + i * step, zn.z0 + j * step, 'square');
    for (let j = 0; j < nz && vines.length < max; j++) for (let i = 0; i < nx && vines.length < max; i++) {
      const x = zn.x0 + i * step, z = zn.z0 + j * step;
      if (fbm(x / 140, z / 140, 2) < -0.05) continue;
      const y = hs[j * (nx + 1) + i];
      const s = Math.hypot(hs[j * (nx + 1) + i + 1] - y, hs[(j + 1) * (nx + 1) + i] - y) / step;
      if (s < 0.05 || s > 0.5) continue;
      const yy = y + 0.9 * Math.sin(x * 0.031 + z * 0.012) + 0.7 * Math.sin(z * 0.027);
      const f = yy / 1.9 - Math.floor(yy / 1.9);
      if (f < 0.32 || f > 0.46) continue;
      vines.push({ x: x + (rand() - 0.5) * 0.6, y, z: z + (rand() - 0.5) * 0.6, k: rand() });
    }
  }
  const geo = paint(new THREE.IcosahedronGeometry(0.62, 0), [1, 1, 1]);
  geo.scale(1, 0.8, 1);
  geo.translate(0, 0.45, 0);
  return instanced(geo, mats.olive, vines, 'city-vines', (v, p, q, s, c) => {
    p.set(v.x, v.y, v.z);
    q.setFromAxisAngle(Y_AXIS, v.k * 6.28);
    s.setScalar(0.8 + v.k * 0.4);
    c.setRGB(0.22 + v.k * 0.05, 0.30 + v.k * 0.06, 0.12);
  });
}

// --- Farm buildings ------------------------------------------------------------------
function farmBuildings(mats, plan) {
  const group = new THREE.Group();
  const tower = new THREE.CylinderGeometry(1, 1.1, 1, 10);
  tower.translate(0, 0.5, 0);
  group.add(instanced(tower, mats.terraceStone, plan.towers, 'city-tower', (t, p, q, s, c) => {
    p.set(t.x, terrainY(t.x, t.z, 'square') - 0.4, t.z);
    q.setFromAxisAngle(Y_AXIS, t.rot);
    s.set(t.r, t.h, t.r);
    c.setRGB(1, 1, 1);
  }));
  const roof = new THREE.ConeGeometry(1.15, 0.5, 10);
  roof.translate(0, 0.25, 0);
  group.add(instanced(roof, mats.roof, plan.towers, 'city-tower', (t, p, q, s, c) => {
    p.set(t.x, terrainY(t.x, t.z, 'square') - 0.4 + t.h, t.z);
    q.identity();
    s.set(t.r, t.r, t.r);
    c.setRGB(1, 1, 1);
  }));
  const ring = new THREE.LatheGeometry([new THREE.Vector2(0.9, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0.9, 1)], 24);
  group.add(instanced(ring, mats.terraceStone, plan.folds, 'city-sheepfold', (f, p, q, s, c) => {
    p.set(f.x, terrainY(f.x, f.z, 'square') - 0.3, f.z);
    q.identity();
    s.set(f.r, 1.5, f.r);
    c.setRGB(1, 1, 1);
  }));
  return group;
}

function threshingFloors(mats, floors) {
  const group = new THREE.Group();
  const ring = new THREE.LatheGeometry([new THREE.Vector2(0.93, 0), new THREE.Vector2(1.02, 0), new THREE.Vector2(1.02, 1), new THREE.Vector2(0.93, 1)], 28);
  group.add(instanced(ring, mats.terraceStone, floors, 'city-threshing', (f, p, q, s, c) => {
    p.set(f.x, terrainY(f.x, f.z, 'square') - 0.15, f.z);
    q.identity();
    s.set(f.r, 0.45, f.r);
    c.setRGB(1, 1, 1);
  }));
  const heap = new THREE.ConeGeometry(1.6, 1.3, 10);
  heap.translate(0, 0.65, 0);
  group.add(instanced(heap, mats.straw, floors.filter((f) => f.heap), 'city-threshing', (f, p, q, s, c) => {
    p.set(f.x + 1.5, terrainY(f.x, f.z, 'square') - 0.1, f.z - 1);
    q.identity();
    s.setScalar(1);
    c.setRGB(1, 1, 1);
  }));
  return group;
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
  return { groups, zones, labels, smoke, walk, gates, houses: { late: lateMain, early: early.houses } };
}

