// Schematic topography of Jerusalem in the late Iron Age (before 586 BC):
// the Temple Mount ridge and City of David spur between the Kidron and
// Tyropoeon valleys, the Western Hill bounded by the Hinnom, and the Mount
// of Olives to the east. Elevations follow published values to within a few
// metres; valley courses are approximate.
import * as THREE from 'three';
import { Y0, BASE_Y, EZ_CENTER_X, PODIUM_HALF, PALACE_PAD, CITY_WALL } from './data.js';
import { boxGeom } from './builder.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// --- Noise ------------------------------------------------------------------
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * (vnoise(x * f, z * f) * 2 - 1); f *= 2.03; a *= 0.5; }
  return s;
}
const gauss = (dx, dz, sx, sz) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dz * dz) / (2 * sz * sz));
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// --- Valleys: [x, z, bottom elevation] -------------------------------------------
const VALLEYS = [
  { name: 'Kidron', slope: 0.55, floor: 12, pts: [[170, -1500, 742], [235, -700, 712], [285, -250, 690], [295, 80, 668], [235, 330, 650], [150, 500, 634], [120, 750, 622], [60, 1100, 610], [-40, 1330, 598], [40, 1800, 575], [250, 2600, 530], [700, 3600, 480], [1500, 5200, 420]] },
  { name: 'Tyropoeon', slope: 0.33, floor: 10, pts: [[-520, -400, 752], [-300, -100, 716], [-215, 200, 690], [-190, 500, 664], [-150, 780, 640], [-105, 920, 626], [-60, 1150, 610], [-40, 1330, 598]] },
  { name: 'Hinnom', slope: 0.38, floor: 14, pts: [[-1300, -150, 775], [-900, 120, 752], [-820, 450, 740], [-720, 800, 715], [-520, 1080, 672], [-300, 1260, 632], [-40, 1330, 598]] },
  { name: 'Bethesda', slope: 0.3, floor: 20, pts: [[-250, -480, 750], [0, -380, 738], [200, -330, 712], [285, -250, 690]] },
];

function valleyHeight(v, x, z) {
  let best = Infinity, be = 0;
  const p = v.pts;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az, ae] = p[i], [bx, bz, bE] = p[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t - x, pz = az + dz * t - z;
    const d2 = px * px + pz * pz;
    if (d2 < best) { best = d2; be = ae + (bE - ae) * t; }
  }
  const d = Math.sqrt(best);
  return be + v.slope * (Math.sqrt(d * d + v.floor * v.floor) - v.floor);
}

// Natural elevation (metres above sea level).
export function naturalElevation(x, z) {
  let h = 735 - 0.045 * z + 0.02 * Math.max(0, -z);
  h += 82 * gauss(x - 880, z + 80, 330, 1100);                  // Mount of Olives ridge
  h += 4 * gauss(x - 10, z, 160, 220);                          // Temple Mount summit
  h += 13 * gauss(x - 25, z - 500, 90, 300);                    // City of David spur
  h += 30 * gauss(x + 560, z - 420, 330, 380);                  // Western Hill
  h += 35 * smooth(-100, -900, x) * (1 - smooth(400, 1300, z)); // high ground to the north-west
  h -= 0.035 * Math.max(0, x - 1300);                           // falling away to the Judean desert
  const far = Math.hypot(x, z - 300);
  h += fbm(x / 900, z / 900, 3) * 40 * smooth(1500, 4000, far);
  h += fbm(x / 140, z / 140, 3) * 4;
  for (const v of VALLEYS) h = Math.min(h, valleyHeight(v, x, z));
  return h;
}

const PODIUM = { x0: EZ_CENTER_X - PODIUM_HALF, x1: EZ_CENTER_X + PODIUM_HALF, z0: -PODIUM_HALF, z1: PODIUM_HALF };
export const inRect = (x, z, r, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
export { PODIUM };

// Terrain world height (y), with the platforms cut level.
export function terrainY(x, z) {
  let h = naturalElevation(x, z) - Y0;
  if (inRect(x, z, PODIUM)) h = Math.min(h, BASE_Y - 0.3);
  if (inRect(x, z, PALACE_PAD)) h = Math.min(h, PALACE_PAD.y - 0.3);
  return h;
}

export function insidePolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// City polygon: the wall line closed along the Temple Mount podium.
export const CITY_POLY = [...CITY_WALL, [PODIUM.x0, PODIUM.z1]];

// --- Terrain meshes ----------------------------------------------------------
export const DETAIL = { cx: 0, cz: 300, size: 3400, seg: 680 };

function colourTerrain(geo, getY, inCity) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const soil = new THREE.Color(0.58, 0.40, 0.28);
  const pale = new THREE.Color(0.66, 0.55, 0.41);
  const rock = new THREE.Color(0.60, 0.56, 0.48);
  const scrub = new THREE.Color(0.40, 0.43, 0.30);
  const dust = new THREE.Color(0.62, 0.53, 0.41);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const ny = nrm.getY(i);
    c.copy(soil).lerp(pale, 0.5 + 0.5 * fbm(x / 160, z / 160, 3));
    const steep = smooth(0.93, 0.78, ny);
    c.lerp(rock, steep * 0.85);
    const green = smooth(0.05, 0.35, fbm(x / 90 + 7, z / 90 - 3, 3)) * (1 - steep * 0.6);
    const low = smooth(70, 30, y); // valley floors are greener
    c.lerp(scrub, Math.min(0.75, green * 0.55 + low * 0.35));
    if (inCity && inCity(x, z)) c.lerp(dust, 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export function buildTerrain(mats) {
  const group = new THREE.Group();

  const geo = new THREE.PlaneGeometry(DETAIL.size, DETAIL.size, DETAIL.seg, DETAIL.seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(DETAIL.cx, 0, DETAIL.cz);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainY(x, z));
    uv.setXY(i, x / 24, z / 24);
  }
  geo.computeVertexNormals();
  colourTerrain(geo, null, (x, z) => insidePolygon(x, z, CITY_POLY));
  const mesh = new THREE.Mesh(geo, mats.terrain);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  group.add(mesh);

  // Coarse surround to the horizon; sunk well below the detailed patch.
  const far = new THREE.PlaneGeometry(26000, 26000, 260, 260);
  far.rotateX(-Math.PI / 2);
  far.translate(DETAIL.cx, 0, DETAIL.cz);
  const fp = far.attributes.position;
  const fuv = far.attributes.uv;
  const half = DETAIL.size / 2;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), z = fp.getZ(i);
    const dx = Math.max(0, Math.abs(x - DETAIL.cx) - half);
    const dz = Math.max(0, Math.abs(z - DETAIL.cz) - half);
    const out = Math.max(dx, dz);
    const sink = out > 120 ? 0 : 80 * (1 - out / 120);
    fp.setY(i, terrainY(x, z) - 2 - sink);
    fuv.setXY(i, x / 24, z / 24);
  }
  far.computeVertexNormals();
  colourTerrain(far, null, null);
  const farMesh = new THREE.Mesh(far, mats.terrain);
  farMesh.receiveShadow = true;
  farMesh.name = 'terrain-far';
  group.add(farMesh);
  return { group, mesh, farMesh };
}

// --- City: walls, houses, trees, pools ----------------------------------------
function rngf(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function buildCity(mats) {
  const group = new THREE.Group();
  const rand = rngf(42);

  // City wall with towers, following the ground.
  const wallParts = [];
  const placeBox = (cx, cz, len, thick, y0, y1, ang) => {
    const g = boxGeom(len, y1 - y0, thick, 4, cx, y0, cz);
    g.rotateY(-ang);
    g.translate(cx, (y0 + y1) / 2, cz);
    wallParts.push(g.toNonIndexed());
  };
  let along = 0;
  for (let i = 0; i < CITY_WALL.length - 1; i++) {
    const [ax, az] = CITY_WALL[i], [bx, bz] = CITY_WALL[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bz - az, bx - ax);
    const n = Math.max(1, Math.ceil(L / 7));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const h0 = terrainY(x0, z0), h1 = terrainY(x1, z1);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      placeBox(cx, cz, L / n + 0.6, 5, Math.min(h0, h1) - 4, Math.max(h0, h1) + 8, ang);
      along += L / n;
      if (along > 65) {
        along = 0;
        const hc = terrainY(cx, cz);
        placeBox(cx, cz, 10, 10, hc - 4, hc + 11.5, ang);
      }
    }
  }
  const wall = new THREE.Mesh(mergeGeometries(wallParts), mats.rubble);
  wall.castShadow = wall.receiveShadow = true;
  wall.name = 'city-wall';
  group.add(wall);

  // Houses: flat-roofed, plastered, aligned with the slope like terraces.
  const housesMain = [];
  const housesPad = [];
  const podiumMargin = 10;
  let tries = 0;
  while (housesMain.length + housesPad.length < 2300 && tries < 60000) {
    tries++;
    const x = -800 + rand() * 1000;
    const z = 100 + rand() * 1000;
    if (!insidePolygon(x, z, CITY_POLY)) continue;
    if (inRect(x, z, PODIUM, podiumMargin)) continue;
    const onPad = inRect(x, z, PALACE_PAD, 4);
    // Ezek 45:2: keep the open land (50 cubits = 26 m) clear around the precinct.
    if (inRect(x, z, PODIUM, 26)) continue;
    const e = 0.6;
    const gx = terrainY(x + e, z) - terrainY(x - e, z);
    const gz = terrainY(x, z + e) - terrainY(x, z - e);
    const slope = Math.hypot(gx, gz) / (2 * e);
    if (slope > 0.75) continue;
    const ang = Math.atan2(gz, gx) + (rand() - 0.5) * 0.3;
    const w = 7 + rand() * 6, d = 6 + rand() * 4, ht = 3.2 + rand() * 2.6;
    const ys = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const lx = sx * w / 2, lz = sz * d / 2;
      return terrainY(x + lx * ca - lz * sa, z + lx * sa + lz * ca);
    });
    const yMin = Math.min(...ys) - 1.2, yMax = Math.max(...ys);
    const rec = { x, z, w, d, y0: yMin, y1: yMax + ht, ang, tint: 0.74 + rand() * 0.24 };
    (onPad ? housesPad : housesMain).push(rec);
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  unit.translate(0, 0.5, 0);
  const uvs = unit.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 0.35, uvs.getY(i) * 0.35);
  const makeHouses = (list, name) => {
    const im = new THREE.InstancedMesh(unit, mats.house, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    list.forEach((h, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -h.ang);
      p.set(h.x, h.y0, h.z);
      s.set(h.w, h.y1 - h.y0, h.d);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
      im.setColorAt(i, col.setRGB(h.tint, h.tint * 0.97, h.tint * 0.92));
    });
    im.castShadow = im.receiveShadow = true;
    im.name = name;
    return im;
  };
  const houses = makeHouses(housesMain, 'houses');
  const padHouses = makeHouses(housesPad, 'houses-ophel');
  group.add(houses, padHouses);

  // Olive groves on the Mount of Olives and around the valleys; a few
  // palms and gardens in the King's Garden by Siloam (2 Kgs 25:4).
  const trees = [];
  tries = 0;
  while (trees.length < 4200 && tries < 80000) {
    tries++;
    const x = -1500 + rand() * 3000;
    const z = -1200 + rand() * 2900;
    if (insidePolygon(x, z, CITY_POLY)) continue;
    if (inRect(x, z, PODIUM, 30) || inRect(x, z, PALACE_PAD, 10)) continue;
    const y = terrainY(x, z);
    const grove = 0.5 + 0.5 * fbm(x / 120, z / 120, 2);
    const nearOlives = x > 300 ? 0.35 : 0;
    const garden = Math.hypot(x + 40, z - 1150) < 220 ? 0.45 : 0;
    if (rand() > grove * 0.75 + nearOlives + garden) continue;
    const e = 1;
    const slope = Math.hypot(terrainY(x + e, z) - terrainY(x - e, z), terrainY(x, z + e) - terrainY(x, z - e)) / 2;
    if (slope > 0.9) continue;
    trees.push({ x, y, z, s: 0.75 + rand() * 0.6, r: rand() * 6.28, k: rand() });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.3, 1);
  crownGeo.scale(1, 0.72, 1);
  crownGeo.translate(0, 3.1, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, mats.trunk, trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, mats.olive, trees.length);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r);
      p.set(t.x, t.y - 0.2, t.z);
      s.set(t.s, t.s * (0.9 + t.k * 0.3), t.s);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
      col.setRGB(0.36 + t.k * 0.08, 0.42 + t.k * 0.06, 0.28 + t.k * 0.04);
      crowns.setColorAt(i, col);
    });
  }
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  group.add(trunks, crowns);

  // Pool of Siloam and the Gihon spring.
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(36, 18), mats.water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(-104, terrainY(-104, 920) + 0.5, 920);
  group.add(pool);
  const rimGeo = boxGeom(40, 3, 22, 4);
  const rim = new THREE.Mesh(rimGeo, mats.ashlarDark);
  rim.position.set(-104, terrainY(-104, 920) - 1.1, 920);
  rim.receiveShadow = true;
  group.add(rim);
  const gihon = new THREE.Mesh(new THREE.CircleGeometry(4, 20), mats.water);
  gihon.rotation.x = -Math.PI / 2;
  gihon.position.set(112, terrainY(112, 500) + 0.4, 500);
  group.add(gihon);

  return { group, houses, padHouses };
}
