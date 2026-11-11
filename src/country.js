// The countryside of Judah around the city: trees, vineyards, farm buildings
// and threshing floors. World units are metres (x = east, z = south).
import * as THREE from 'three';
import { paint, mergeParts } from './builder.js';
import { terrainY, insidePolygon, inRect, fbm, smooth, distToLine, PODIUM, LATE_POLY, EARLY_POLY } from './terrain.js';
import { PALACE_PAD, SOLOMON_PLATFORM, KINGS_GARDEN } from './data.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

const slopeAt = (x, z, site = 'square', e = 2) =>
  Math.hypot(terrainY(x + e, z, site) - terrainY(x - e, z, site), terrainY(x, z + e, site) - terrainY(x, z - e, site)) / (2 * e);

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

export function buildTrees(mats, quality, rand) {
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
export function vineyards(mats, quality, rand) {
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
export function farmBuildings(mats, plan) {
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

export function threshingFloors(mats, floors) {
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
