// The ground cover of the Judean hills: bare limestone (boulders and the
// stepped bedrock ledges of the slopes) and low thorny scrub such as thorny
// burnet. Terraced fields were cleared of stones, so both thin out there.
import * as THREE from 'three';
import { terrainY, fbm, rng, smooth, insidePolygon, distToLine, inRect, LATE_POLY, EARLY_POLY, PODIUM, DETAIL } from './terrain.js';
import { PALACE_PAD, SOLOMON_PLATFORM, ROADS, KINGS_GARDEN } from './data.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Lumpy weathered limestone with a darker base. Displacement depends only on
// position, so the faces of the polyhedron stay closed.
function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.38 * fbm(v.x * 1.3 + seed, v.z * 1.3 + v.y * 1.7 - seed, 3) + 0.12 * Math.sin(v.x * 4 + seed) * Math.cos(v.z * 3.3);
    v.multiplyScalar(k);
    v.y *= v.y > 0 ? 0.78 : 0.45;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = smooth(-0.25, 0.55, p.getY(i));
    const k = 0.6 + 0.4 * t;
    col[i * 3] = k; col[i * 3 + 1] = k * 0.985; col[i * 3 + 2] = k * 0.95;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// A cushion of scrub: low, rounded, darker underneath.
function shrubGeo() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  g.scale(1, 0.62, 1);
  g.translate(0, 0.22, 0);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = 0.55 + 0.45 * smooth(-0.3, 0.8, p.getY(i));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function instanced(geo, mat, recs, infoId, setup, { shadow = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, recs.length));
  im.count = recs.length;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  recs.forEach((r, i) => {
    setup(r, p, q, s, c);
    im.setMatrixAt(i, m.compose(p, q, s));
    im.setColorAt(i, c);
  });
  im.castShadow = shadow;
  im.receiveShadow = true;
  im.userData.infoId = infoId;
  im.computeBoundingSphere();
  return im;
}

// Fraction of the ground under terraced cultivation (same rule as the terrain shader).
function farmed(x, z) {
  const desert = smooth(1050, 1700, x);
  const reach = 1 - smooth(1300, 2100, Math.hypot(x + 150, z - 450));
  return (0.55 + 0.45 * fbm(x / 260, z / 260, 2)) * (1 - desert) * reach;
}

function inField(x, z, fields) {
  for (const f of fields) {
    const dx = x - f.x, dz = z - f.z;
    if (Math.abs(dx) > 60 || Math.abs(dz) > 60) continue;
    const c = Math.cos(f.ang), s = Math.sin(f.ang);
    const u = dx * c + dz * s, v = -dx * s + dz * c;
    if (Math.abs(u) < f.w / 2 + 2 && Math.abs(v) < f.d / 2 + 2) return true;
  }
  return false;
}

export function buildNature(mats, plan, { quality = 'high' } = {}) {
  const rand = rng(4242);
  const group = new THREE.Group();
  const half = DETAIL.size / 2 - 30;
  const nRock = quality === 'low' ? 2600 : 6500;
  const nShrub = quality === 'low' ? 6000 : 15000;
  const roads = ROADS.map((r) => r.pts);
  const clearOf = (x, z) => !insidePolygon(x, z, LATE_POLY) && !insidePolygon(x, z, EARLY_POLY)
    && !inRect(x, z, PODIUM, 14) && !inRect(x, z, SOLOMON_PLATFORM, 14) && !inRect(x, z, PALACE_PAD, 10)
    && !roads.some((pts) => distToLine(x, z, pts) < 6)
    && !plan.floors.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 4)
    && !inField(x, z, plan.fields);
  const slope = (x, z) => Math.hypot(terrainY(x + 1.5, z, 'square') - terrainY(x - 1.5, z, 'square'), terrainY(x, z + 1.5, 'square') - terrainY(x, z - 1.5, 'square')) / 3;
  const garden = (x, z) => ((x - KINGS_GARDEN.x) / KINGS_GARDEN.rx) ** 2 + ((z - KINGS_GARDEN.z) / KINGS_GARDEN.rz) ** 2 < 1.1;

  // Rocks: boulders everywhere, thicker on the steep, uncultivated slopes.
  const rocks = [];
  for (let n = 0; n < nRock * 12 && rocks.length < nRock; n++) {
    const x = DETAIL.cx - half + rand() * half * 2, z = DETAIL.cz - half + rand() * half * 2;
    if (!clearOf(x, z) || garden(x, z)) continue;
    const s = slope(x, z);
    const desert = smooth(1000, 1600, x);
    let p = 0.18 + s * 1.6 + desert * 0.4 + 0.25 * fbm(x / 90, z / 90, 2);
    p *= 1 - 0.75 * farmed(x, z) * (1 - smooth(0.25, 0.45, s));
    if (rand() > p) continue;
    const y = terrainY(x, z, 'square');
    rocks.push({ x, y, z, r: 0.3 + Math.pow(rand(), 2.4) * 1.9, ang: rand() * 6.28, tx: (rand() - 0.5) * 0.5, tz: (rand() - 0.5) * 0.5, k: rand(), v: Math.floor(rand() * 3) });
  }
  const tint = (c, k, desert) => c.setRGB(0.88 + k * 0.12, 0.86 + k * 0.1, 0.8 + k * 0.1).lerp(new THREE.Color(1, 0.93, 0.8), desert * 0.5);
  const rockGeos = [rockGeo(1.3), rockGeo(7.7), rockGeo(13.1)];
  const tilt = new THREE.Euler();
  for (let v = 0; v < 3; v++) {
    group.add(instanced(rockGeos[v], mats.rock, rocks.filter((r) => r.v === v), 'land-rock', (r, p, q, s, c) => {
      p.set(r.x, r.y - r.r * 0.22, r.z);
      q.setFromEuler(tilt.set(r.tx, r.ang, r.tz));
      s.set(r.r * (0.9 + r.k * 0.4), r.r * (0.75 + r.k * 0.45), r.r * (0.8 + (1 - r.k) * 0.4));
      tint(c, r.k, smooth(1000, 1600, r.x));
    }));
  }

  // Scrub: thick on uncultivated slopes, thin in the desert and on terraces.
  const shrubs = [];
  for (let n = 0; n < nShrub * 10 && shrubs.length < nShrub; n++) {
    const x = DETAIL.cx - half + rand() * half * 2, z = DETAIL.cz - half + rand() * half * 2;
    if (!clearOf(x, z)) continue;
    const s = slope(x, z);
    const desert = smooth(1100, 1700, x);
    let p = (0.45 + 0.4 * fbm(x / 70 + 9, z / 70, 2)) * (1 - desert * 0.85);
    p *= 1 - 0.8 * farmed(x, z) * (1 - smooth(0.25, 0.45, s));
    if (garden(x, z)) p *= 0.3;
    if (rand() > p) continue;
    shrubs.push({ x, y: terrainY(x, z, 'square'), z, r: 0.3 + rand() * 0.55, k: rand(), dry: desert + (rand() < 0.3 ? 0.5 : 0) });
  }
  group.add(instanced(shrubGeo(), mats.shrub, shrubs, 'land-scrub', (b, p, q, s, c) => {
    p.set(b.x, b.y - 0.08, b.z);
    q.setFromAxisAngle(Y_AXIS, b.k * 6.28);
    s.set(b.r * (1 + b.k * 0.3), b.r * (0.8 + b.k * 0.5), b.r);
    c.setRGB(0.25 + b.k * 0.08, 0.29 + b.k * 0.06, 0.17).lerp(new THREE.Color(0.46, 0.4, 0.28), Math.min(1, b.dry));
  }, { shadow: false }));
  return group;
}

// 573 BC: weeds and scrub in the deserted temple courts (Lam 5:18).
export function overgrowth(mats, area, { count = 900, seed = 5 } = {}) {
  const rand = rng(seed);
  const list = [];
  for (let n = 0; n < count; n++) {
    const x = area.x0 + rand() * (area.x1 - area.x0), z = area.z0 + rand() * (area.z1 - area.z0);
    list.push({ x, y: area.y(x, z), z, r: 0.25 + rand() * 0.45, k: rand() });
  }
  return instanced(shrubGeo(), mats.shrub, list.filter((b) => b.y !== null), 'land-scrub', (b, p, q, s, c) => {
    p.set(b.x, b.y - 0.05, b.z);
    q.setFromAxisAngle(Y_AXIS, b.k * 6.28);
    s.set(b.r, b.r * (0.7 + b.k * 0.6), b.r);
    c.setRGB(0.36 + b.k * 0.1, 0.36 + b.k * 0.06, 0.2);
  }, { shadow: false });
}
