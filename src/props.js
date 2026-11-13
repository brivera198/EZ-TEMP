// Things in the lanes, courtyards and on the roofs of the city: jars and
// cooking pots, querns, hearths, cisterns, firewood, ladders, mats, flax
// drying on the roofs, steps up to the doors; and in 573 BC the ash, charred
// timber and broken pottery of the burned houses. Everything is placed by
// rule from the house records of city.js (a door, a courtyard, a roof), as a
// few dozen small arrangements ("sets"), each drawn as one InstancedMesh
// whose instances are refilled from the houses near the viewer.
import * as THREE from 'three';
import { mergeParts, paint } from './builder.js';
import { terrainY, rng } from './terrain.js';
import { houseVariant, propAtlas, atlasUV } from './city.js';

const lin = (c) => c.map((v) => Math.pow(v, 2.2));
const C = {
  clay: lin([0.80, 0.56, 0.40]), pale: lin([0.86, 0.72, 0.56]), slip: lin([0.66, 0.34, 0.24]), cook: lin([0.40, 0.29, 0.22]),
  stone: lin([0.88, 0.84, 0.76]), basalt: lin([0.40, 0.38, 0.37]), wood: lin([0.62, 0.46, 0.31]), grey: lin([0.62, 0.56, 0.48]),
  brush: lin([0.52, 0.44, 0.32]), reed: lin([0.80, 0.70, 0.50]), basket: lin([0.70, 0.55, 0.34]), flax: lin([0.80, 0.70, 0.44]),
  grain: lin([0.88, 0.76, 0.48]), lentil: lin([0.66, 0.44, 0.28]), ash: lin([0.36, 0.34, 0.32]), char: lin([0.17, 0.14, 0.12]),
  water: lin([0.18, 0.24, 0.25]), dark: lin([0.12, 0.1, 0.09]), bronze: lin([0.45, 0.32, 0.18]),
  cloth: [[0.90, 0.87, 0.80], [0.80, 0.74, 0.62], [0.62, 0.24, 0.17], [0.32, 0.36, 0.52], [0.70, 0.56, 0.32]].map(lin),
};

// --- Parts, in metres -----------------------------------------------------------------
// Each part is a non-indexed geometry with a vertex colour and atlas UVs.
const SIZE = { wood: 1.2, clay: 0.8, weave: 0.5, stone: 1 };
function part(g, col, tile, size = SIZE[tile]) {
  g = g.index ? g.toNonIndexed() : g;
  paint(g, col);
  return atlasUV(g, tile, size);
}
function put(g, x, y, z, ry = 0, rx = 0, rz = 0) {
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
const box = (x0, x1, y0, y1, z0, z1, col, tile) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  return put(part(g, col, tile), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
};
const lathe = (pts, seg, col) => part(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), col, 'clay');
const cyl = (rt, rb, h, seg, col, tile, open = false) => part(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), col, tile);
function lump(sx, sy, sz, col, tile, rand, detail = 0) {
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + rand() * 0.4;
    p.setXYZ(i, p.getX(i) * sx * k, Math.max(0, p.getY(i) + 0.15) * sy * k, p.getZ(i) * sz * k);
  }
  g.computeVertexNormals();
  return part(g, col, tile);
}

// Pottery profiles [radius, height]: Iron Age II storage jar, the four-
// handled jar of the royal (lmlk) type, cooking pot, juglet, bowl.
const JAR = [[0.01, 0], [0.12, 0.04], [0.21, 0.2], [0.23, 0.4], [0.17, 0.56], [0.07, 0.62], [0.08, 0.7]];
const LMLK = [[0.01, 0], [0.09, 0.03], [0.2, 0.18], [0.235, 0.36], [0.2, 0.5], [0.1, 0.6], [0.06, 0.63], [0.07, 0.69]];
const POT = [[0.01, 0], [0.12, 0.03], [0.18, 0.12], [0.16, 0.2], [0.13, 0.22], [0.14, 0.25]];
const JUG = [[0.01, 0], [0.06, 0.01], [0.085, 0.07], [0.07, 0.14], [0.03, 0.19], [0.04, 0.23]];
const BOWL = [[0.01, 0], [0.07, 0.005], [0.15, 0.05], [0.17, 0.08]];

function jar(L, x, z, { s = 1, col = C.clay, royal = false, y = 0, lie = 0, ry = 0 } = {}) {
  const prof = royal ? LMLK : JAR;
  const g = [lathe(prof, 9, col)];
  const n = royal ? 4 : 2;
  for (let h = 0; h < n; h++) {                             // handles on the shoulder
    const hd = box(0.17, 0.22, 0.42, 0.54, -0.025, 0.025, col, 'clay');
    hd.rotateY(h * 2 * Math.PI / n + 0.3);
    g.push(hd);
  }
  for (const p of g) { p.scale(s, s, s); if (lie) { p.rotateZ(Math.PI / 2); p.translate(0.22 * s, 0, 0); } put(p, x, y + (lie ? 0.21 * s : 0), z, ry); L.push(p); }
}
const potOn = (L, x, y, z, s = 1) => { const g = lathe(POT, 9, C.cook); g.scale(s, s, s); L.push(put(g, x, y, z)); };
const jug = (L, x, y, z, col = C.slip) => L.push(put(lathe(JUG, 7, col), x, y, z));
function bowl(L, x, y, z, fill) {
  L.push(put(lathe(BOWL, 9, C.pale), x, y, z));
  if (fill) L.push(put(cyl(0.14, 0.14, 0.02, 9, fill, 'clay'), x, y + 0.06, z));
}
function basket(L, x, y, z, r, fill) {
  L.push(put(cyl(r, r * 0.82, r * 1.1, 9, C.basket, 'weave', true), x, y + r * 0.55, z));
  L.push(put(cyl(r * 0.97, r * 0.97, 0.02, 9, fill, 'weave'), x, y + r * 0.95, z));
}
const mat = (L, x, z, w, d, ry = 0, col = C.reed) => L.push(put(box(-w / 2, w / 2, 0, 0.015, -d / 2, d / 2, col, 'weave'), x, 0, z, ry));
// Saddle quern: a long lower stone and the upper stone rubbed across it.
function quern(L, x, z, ry, rand) {
  const lower = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  lower.scale(0.3, 0.12, 0.17);
  L.push(put(part(lower, C.basalt, 'stone'), x, 0, z, ry));
  L.push(put(lump(0.24, 0.07, 0.1, C.basalt, 'stone', rand), x + Math.cos(ry) * 0.04, 0.1, z - Math.sin(ry) * 0.04, ry));
}
function mortar(L, x, z) {
  L.push(put(cyl(0.17, 0.2, 0.32, 9, C.stone, 'stone'), x, 0.16, z));
  L.push(put(cyl(0.11, 0.11, 0.01, 9, C.dark, 'stone'), x, 0.322, z));
  L.push(put(cyl(0.035, 0.04, 0.55, 6, C.wood, 'wood'), x + 0.06, 0.45, z, 0, 0, 0.35));
}
function hearth(L, x, z, rand) {
  L.push(put(cyl(0.38, 0.38, 0.012, 10, C.ash, 'stone'), x, 0.006, z));
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + rand() * 0.3;
    L.push(put(lump(0.16, 0.13, 0.13, C.grey, 'stone', rand), x + Math.cos(a) * 0.17, 0, z + Math.sin(a) * 0.17));
  }
  potOn(L, x, 0.1, z);
}
// Logs stacked against a wall (along x), the pile's back at z = 0.
function woodpile(L, x, z, len, rows, rand) {
  for (let r = 0; r < rows; r++) for (let k = 0; k < rows - r + 1; k++) {
    const rr = 0.045 + rand() * 0.025;
    L.push(put(cyl(rr, rr, len * (0.85 + rand() * 0.3), 6, C.wood, 'wood'), x + (rand() - 0.5) * 0.1, 0.06 + r * 0.11, z + 0.07 + k * 0.12 + r * 0.06, 0, 0, Math.PI / 2));
  }
}
function brushwood(L, x, z, s, rand) {
  L.push(put(lump(0.9 * s, 0.6 * s, 0.6 * s, C.brush, 'weave', rand, 1), x, 0, z, rand() * 3));
  for (let k = 0; k < 4; k++) L.push(put(cyl(0.012, 0.018, 0.7 * s, 4, C.brush, 'wood'), x + (rand() - 0.5) * 0.5 * s, 0.3 * s, z + (rand() - 0.5) * 0.3 * s, rand() * 3, 0, 1.2 + rand() * 0.6));
}
function ladder(L, x, z, h, ry = 0) {
  const lean = 0.3, len = h / Math.cos(lean), foot = Math.tan(lean) * h;
  const parts = [];
  for (const s of [-1, 1]) parts.push(put(box(-0.03, 0.03, 0, len, -0.03, 0.03, C.wood, 'wood'), s * 0.22, 0, 0));
  for (let k = 1; k * 0.32 < len - 0.1; k++) parts.push(box(-0.22, 0.22, k * 0.32, k * 0.32 + 0.035, -0.02, 0.02, C.wood, 'wood'));
  for (const p of parts) { p.rotateX(-lean); put(p, x, 0, z + foot, ry); L.push(p); }
}
function trough(L, x, z, len, ry = 0) {
  L.push(put(box(-len / 2, len / 2, 0, 0.42, -0.24, 0.24, C.stone, 'stone'), x, 0, z, ry));
  L.push(put(box(-len / 2 + 0.07, len / 2 - 0.07, 0.42, 0.424, -0.17, 0.17, C.water, 'stone'), x, 0, z, ry));
}
function cistern(L, x, z, rand) {
  L.push(put(cyl(0.42, 0.47, 0.24, 12, C.stone, 'stone', true), x, 0.12, z));
  L.push(put(cyl(0.41, 0.41, 0.01, 12, C.dark, 'stone'), x, 0.2, z));
  L.push(put(cyl(0.44, 0.46, 0.1, 10, C.grey, 'stone'), x + 0.12 + rand() * 0.1, 0.27, z + 0.08, 0, 0.06));
}
// Flat potsherds and other small things lying on the ground.
function scatter(L, x, z, r, n, cols, size, rand) {
  const pos = [];
  for (let k = 0; k < n; k++) {
    const cx = x + (rand() - 0.5) * 2 * r, cz = z + (rand() - 0.5) * 2 * r, a = rand() * 6.28, s = size * (0.6 + rand() * 0.8);
    for (let j = 0; j < 3; j++) {
      const b = a + j * 2.1 + (rand() - 0.5) * 0.6;
      pos.push(cx + Math.cos(b) * s, 0.012 + rand() * 0.02, cz - Math.sin(b) * s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  part(g, cols[0], 'clay');
  const c = g.attributes.color;
  for (let i = 0; i < c.count; i += 3) { const col = cols[Math.floor(rand() * cols.length)]; for (let j = 0; j < 3; j++) c.setXYZ(i + j, ...col); }
  L.push(g);
}

// --- Sets -----------------------------------------------------------------------------
// Frames: front sets have their back on the plinth face (z = 0) and reach
// 0.75 m into the lane; court sets have their back on the pillar line (x =
// 0) and reach 1 m into the courtyard, z along the house; roof sets fit in
// 1.5 × 3.6 m; ruin sets are centred on a burned floor.
function makeSets(period, rand) {
  const late = period === 'late';
  const S = {};
  const def = (key, info, far, fn) => { const L = []; fn(L); S[key] = { geo: mergeParts(L), info, far }; };
  if (period !== 'ruin') {
    def('door-jars', 'props-door', false, (L) => {
      L.push(box(-0.9, 0.1, 0, 0.42, 0.02, 0.4, C.stone, 'stone'));          // bench against the wall
      jar(L, 0.5, 0.3, { s: 0.95 });
      L.push(put(cyl(0.2, 0.2, 0.025, 9, C.pale, 'clay'), 0.5, 0.67, 0.3));   // a bowl for a lid
      jug(L, -0.6, 0.42, 0.2);
      bowl(L, -0.2, 0.42, 0.22, null);
    });
    def('door-fuel', 'props-door', false, (L) => {
      woodpile(L, -0.35, 0, 1.0, 3, rand);
      brushwood(L, 0.55, 0.38, 0.7, rand);
      basket(L, -0.1, 0, 0.62, 0.17, C.brush);
    });
    def('door-work', 'props-kitchen', false, (L) => {
      mat(L, -0.15, 0.4, 1.3, 0.7, 0);
      quern(L, -0.35, 0.42, 0.1, rand);
      mortar(L, 0.6, 0.28);
      jar(L, 0.15, 0.22, { s: 0.8, col: C.pale });
      basket(L, -0.85, 0, 0.3, 0.16, C.grain);
    });
    def('door-corner', 'props-door', false, (L) => {
      ladder(L, -0.25, 0.05, 2.6);
      trough(L, 0.45, 0.32, 0.95);
      brushwood(L, -0.75, 0.4, 0.55, rand);
    });
    def('court-kitchen', 'props-kitchen', false, (L) => {
      hearth(L, 0.6, -1.0, rand);
      mat(L, 0.55, 0.15, 0.9, 1.1, 0);
      quern(L, 0.5, 0.15, Math.PI / 2, rand);
      for (let k = 0; k < 3; k++) jar(L, 0.25, 0.85 + k * 0.38, { s: 0.85 + rand() * 0.15, col: k === 1 ? C.pale : C.clay, royal: late && k === 0 });
      woodpile(L, 0.5, -1.65, 0.7, 2, rand);
      basket(L, 0.75, 0, 1.15, 0.17, C.grain);
      bowl(L, 0.85, 0, -0.45, C.lentil);
    });
    def('court-stores', late ? 'props-stores' : 'props-cistern', false, (L) => {
      cistern(L, 0.55, 0.65, rand);
      for (let k = 0; k < 4; k++) jar(L, 0.25, -1.45 + k * 0.42, { s: 0.92 + rand() * 0.1, royal: late, col: late ? C.pale : C.clay });
      jug(L, 0.6, 0, -1.4, C.slip);
      for (let k = 0; k < 3; k++) L.push(put(lathe(BOWL, 9, k % 2 ? C.slip : C.pale), 0.65, k * 0.035, -0.85));
      potOn(L, 0.7, 0, -0.35, 0.9);
      mortar(L, 0.3, 1.45);
    });
    def('court-misc', 'props-kitchen', false, (L) => {
      brushwood(L, 0.45, -1.3, 0.8, rand);
      basket(L, 0.3, 0, -0.35, 0.2, C.grain);
      basket(L, 0.65, 0, -0.1, 0.16, C.lentil);
      L.push(put(lump(0.36, 0.42, 0.32, C.reed, 'weave', rand), 0.3, 0, 0.3));   // a sack of grain
      mat(L, 0.5, 1.0, 0.9, 1.1, 0);
      scatter(L, 0.5, 1.0, 0.35, 30, [C.lentil, C.grain], 0.035, rand);      // lentils spread to dry
      jar(L, 0.25, 1.75, { s: 0.85, royal: late });
    });
  } else {
    def('ruin-a', 'props-ruin', false, (L) => {
      L.push(put(cyl(0.9, 0.95, 0.01, 9, C.ash, 'stone'), 0, 0.005, 0));
      jar(L, -0.3, 0.1, { lie: 1, ry: 0.6 });
      jar(L, 0.5, -0.4, { lie: 1, ry: 2.4, s: 0.85, col: C.pale });
      L.push(put(lathe(JAR.slice(0, 4), 9, C.clay), 0.6, 0, 0.5));          // the bottom of a smashed jar
      L.push(put(box(-1.1, 1.1, 0, 0.16, -0.09, 0.09, C.char, 'wood'), -0.1, 0, -0.6, 0.4, 0, 0.05));
      scatter(L, 0, 0, 0.9, 26, [C.clay, C.pale, C.slip, C.cook], 0.06, rand);
    });
    def('ruin-b', 'props-ruin', false, (L) => {
      for (let k = 0; k < 6; k++) L.push(put(lump(0.3 + rand() * 0.25, 0.2 + rand() * 0.15, 0.25 + rand() * 0.2, k % 2 ? C.stone : C.grey, 'stone', rand), (rand() - 0.5) * 1.2, 0, (rand() - 0.5) * 1.0));
      quern(L, 0.7, 0.4, 1.2, rand);
      L.push(put(box(-0.7, 0.7, 0, 0.12, -0.07, 0.07, C.char, 'wood'), 0.3, 0.1, -0.5, 1.9, 0, 0.12));
      scatter(L, 0.1, 0.2, 1.0, 22, [C.clay, C.pale, C.cook], 0.06, rand);
      scatter(L, -0.3, -0.2, 0.6, 3, [C.bronze, C.char], 0.025, rand);   // arrowheads
    });
    def('ruin-door', 'props-ruin', false, (L) => {
      for (let k = 0; k < 4; k++) L.push(put(lump(0.25 + rand() * 0.2, 0.16 + rand() * 0.1, 0.2 + rand() * 0.15, C.grey, 'stone', rand), (rand() - 0.5) * 1.4, 0, 0.15 + rand() * 0.4));
      jar(L, 0.45, 0.3, { lie: 1, ry: 1.2, s: 0.9 });
      scatter(L, 0, 0.35, 0.6, 14, [C.clay, C.pale, C.slip], 0.05, rand);
    });
  }
  if (period !== 'ruin') {
    def('roof-flax', 'props-roof', true, (L) => {
      // Stalks of flax pulled in spring, laid out in rows to dry (Josh 2:6).
      for (let k = 0; k < 9; k++) {
        const x = -0.6 + (k % 5) * 0.3, z = k < 5 ? -0.75 : 0.65;
        L.push(put(box(-0.07, 0.07, 0, 0.07, -0.6, 0.6, C.flax, 'wood'), x + (rand() - 0.5) * 0.05, 0, z, (rand() - 0.5) * 0.12));
        L.push(put(box(-0.075, 0.075, 0, 0.075, -0.03, 0.03, C.brush, 'weave'), x, 0, z + 0.1));
      }
      L.push(put(lump(0.8, 0.35, 0.6, C.flax, 'wood', rand), 0, 0, 1.55));
      jar(L, 0.55, -1.6, { s: 0.85 });
    });
    def('roof-dry', 'props-roof', true, (L) => {
      // Stone roller for pressing the clay of the roof after rain.
      L.push(put(cyl(0.16, 0.16, 0.6, 10, C.stone, 'stone'), -0.35, 0.16, -1.45, 0, 0, Math.PI / 2));
      mat(L, 0.05, 0.25, 1.2, 1.5, 0);
      scatter(L, 0.05, 0.25, 0.5, 40, [C.grain, C.lentil, C.grain], 0.04, rand);
      jar(L, 0.55, -1.2, { s: 0.85, royal: late });
      jar(L, 0.5, 1.45, { s: 0.75, col: C.pale });
      basket(L, -0.45, 0, 1.35, 0.17, C.grain);
    });
    def('roof-shelter', 'props-roof', true, (L) => {
      // A shade of poles and branches (not the festival booths of autumn).
      for (const [x, z] of [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.9], [0.6, 0.9]]) L.push(put(cyl(0.035, 0.045, 1.75, 5, C.wood, 'wood', true), x, 0.875, z));
      for (const x of [-0.6, 0.6]) L.push(put(box(-0.04, 0.04, 1.72, 1.8, -1.0, 1.0, C.wood, 'wood'), x, 0, 0));
      L.push(put(box(-0.75, 0.75, 1.8, 1.9, -1.1, 1.1, C.brush, 'weave'), 0, 0, 0));
      L.push(put(lump(1.5, 0.12, 2.1, C.brush, 'weave', rand), 0, 1.86, 0));
      mat(L, 0, 0, 1.1, 1.6, 0);
      jar(L, 0.45, 1.4, { s: 0.8 });
      jug(L, -0.3, 0.015, 0.4);
    });
    def('roof-laundry', 'props-roof', true, (L) => {
      for (const z of [-1.6, 1.6]) L.push(put(cyl(0.03, 0.04, 1.75, 5, C.wood, 'wood', true), 0, 0.875, z));
      L.push(put(box(-0.008, 0.008, 1.68, 1.695, -1.6, 1.6, C.brush, 'weave'), 0, 0, 0));
      for (let k = 0; k < 4; k++) {
        const w = 0.45 + rand() * 0.3, h = 0.6 + rand() * 0.45, z = -1.15 + k * 0.78;
        L.push(put(box(-0.012, 0.012, 1.69 - h, 1.69, -w / 2, w / 2, C.cloth[k % C.cloth.length], 'weave'), 0, 0, z, 0, 0, 0.04));
      }
      basket(L, 0.5, 0, -0.4, 0.2, C.cloth[0]);
    });
  }
  // Stone steps up to doors raised on a terrace: a landing (a unit box,
  // stretched to the rise) and a flight running along the house front,
  // down toward +x, stretched to its run and rise.
  const LAND = [];
  LAND.push(atlasUV(paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed(), C.stone), 'stone', 1, 1.4, 1, 0.8));
  S['stair-landing'] = { geo: mergeParts(LAND), info: 'city-house', far: true };
  // Flights of 6, 13 and 20 steps: the last, steep, for doors high on a terrace.
  for (const [key, n] of [['stair-flight', 6], ['stair-flight-tall', 13], ['stair-flight-steep', 20]]) {
    const FL = [];
    for (let k = 0; k < n; k++) {
      const g = new THREE.BoxGeometry(1 / n, (n - k) / (n + 1), 1).toNonIndexed();
      g.translate((k + 0.5) / n, (n - k) / (2 * n + 2), 0);
      FL.push(atlasUV(paint(g, C.stone), 'stone', 1, n > 6 ? 3.5 : 2, n > 6 ? 3 : 1.5, 0.8));
    }
    S[key] = { geo: mergeParts(FL), info: 'city-house', far: true };
  }
  return S;
}

// --- Placement --------------------------------------------------------------------------
const FRONT = ['door-jars', 'door-fuel', 'door-work'];
const COURT = ['court-kitchen', 'court-stores', 'court-misc'];
const ROOFS = ['roof-flax', 'roof-dry', 'roof-shelter', 'roof-laundry'];

// Where each set goes at each house. Houses whose index is divisible by 3
// are left to the people at work there (trades.js): no loose things at
// their doors or in their courtyards.
function placeAll(period, houses, low, site, keys) {
  const near = [], far = [];
  const add = (list, key, x, y, z, yaw, sx = 1, sy = 1, sz = 1, shade = 1) => {
    if (keys[key] === undefined) return;
    list.push({ k: keys[key], x, y, z, yaw, sx, sy, sz, shade });
  };
  houses.forEach((r, i) => {
    const rand = rng(1000 + i * 7 + (period === 'early' ? 50000 : 0));
    const s = houseVariant(r) ? -1 : 1;
    const kind = low ? 'L' : r.type === 'C' ? 'C' : 'A';
    const c = Math.cos(r.rot), sn = Math.sin(r.rot);
    const W = (lx, lz) => [r.x + lx * c + lz * sn, r.z - lx * sn + lz * c];
    const fz = r.d * 0.515;
    const [dx, dz] = W(0, fz + 0.4);
    const gy = terrainY(dx, dz, site), rise = r.floor - gy;
    const fs = rand() < 0.5 ? 1 : -1;
    const shade = () => 0.85 + rand() * 0.25;
    // Steps up to the door.
    if (rise > 0.3 && rise < 6.6) {
      add(far, 'stair-landing', dx, gy - 0.25, dz, r.rot, 1.4, rise + 0.25, 0.8);
      const run = Math.min(rise * 1.4, r.w / 2 - 0.75);
      if (run > 0.5) {
        const [fx, fzw] = W(fs * 0.7, fz + 0.4);
        add(far, rise > 3.4 ? 'stair-flight-steep' : rise > 1.4 ? 'stair-flight-tall' : 'stair-flight', fx, gy - 0.25, fzw, r.rot + (fs > 0 ? 0 : Math.PI), run, rise + 0.25, 0.8);
      }
    } else if (rise > 0.12 && rise <= 0.3) add(far, 'stair-landing', dx, gy - 0.2, dz, r.rot, 1.4, rise + 0.2, 0.55);
    if (period === 'ruin') {
      if (rand() < 0.85) {
        const lz = kind === 'C' ? -0.26 * r.d : (rand() - 0.5) * 0.4 * r.d;
        const [x, z] = W((rand() - 0.5) * 0.4 * r.w, lz);
        add(near, rand() < 0.5 ? 'ruin-a' : 'ruin-b', x, r.floor + 0.02, z, rand() * 6.28, 1, 1, 1, shade());
      }
      if (rand() < 0.45) {
        const [x, z] = W(-fs * (1.1 + rand() * 0.6), fz);
        add(near, 'ruin-door', x, terrainY(...W(-fs * 1.4, fz + 0.4), site) - 0.03, z, r.rot, 1, 1, 1, shade());
      }
      return;
    }
    const free = i % 3 !== 0;
    if (free && rand() < 0.75) {
      const corner = r.w > 8.6 && rand() < 0.3;
      const lx = corner ? -fs * (r.w / 2 - 0.75) : -fs * (1.05 + rand() * 0.5);
      const [x, z] = W(lx, fz);
      const [gx, gz] = W(lx, fz + 0.35);
      add(near, corner ? 'door-corner' : FRONT[Math.floor(rand() * FRONT.length)], x, terrainY(gx, gz, site) - 0.02, z, r.rot, 1, 1, 1, shade());
    }
    if (free && kind === 'A' && rand() < 0.85) {
      const [x, z] = W(-s * 0.175 * r.w, 0.14 * r.d);
      add(near, COURT[Math.floor(rand() * COURT.length)], x, r.floor, z, r.rot + (s > 0 ? 0 : Math.PI), 1, 1, 1, shade());
    }
    if (free && kind === 'C' && rand() < 0.8) {
      const [x, z] = W(s * 0.455 * r.w, 0.27 * r.d);
      add(near, COURT[Math.floor(rand() * COURT.length)], x, r.floor, z, r.rot + (s > 0 ? Math.PI : 0), 1, 1, 0.85, shade());
    }
    if (rand() < (low ? 0.5 : 0.7)) {
      const key = ROOFS[Math.floor(rand() * (low ? 2 : ROOFS.length))];
      if (kind === 'A') {
        const [x, z] = W(-s * 0.34 * r.w, 0.145 * r.d);
        add(far, key, x, r.floor + r.ht, z, r.rot + (rand() < 0.5 ? 0 : Math.PI), 1, 1, 1, shade());
      } else if (kind === 'C') {
        const [x, z] = W((rand() < 0.5 ? -1 : 1) * 0.15 * r.w, -0.26 * r.d);
        add(far, key, x, r.floor + 1.03 * r.ht, z, r.rot + Math.PI / 2, 1, 1, 1, shade());
      } else {
        const [x, z] = W(0, (rand() < 0.5 ? -1 : 1) * 0.15 * r.d);
        add(far, key, x, r.floor + 1.02 * r.ht, z, r.rot, 1, 1, 1, shade());
      }
    }
  });
  return { near, far };
}

// --- Pools ------------------------------------------------------------------------------
// The slots of one kind of distance (near: things at the doors and in the
// courtyards; far: roofs and steps), bucketed in a grid so that refilling
// the pools around the viewer touches only the cells in reach.
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _p4 = new THREE.Vector3(), _s4 = new THREE.Vector3(), _y4 = new THREE.Vector3(0, 1, 0);
function makeDB(list, cell = 32) {
  const n = list.length;
  const m = new Float32Array(n * 16), col = new Float32Array(n * 3), pk = new Uint8Array(n), xs = new Float32Array(n), zs = new Float32Array(n);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const s of list) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
  if (!n) { x0 = z0 = 0; x1 = z1 = 1; }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell) + 1), nz = Math.max(1, Math.ceil((z1 - z0) / cell) + 1);
  const cellOf = (x, z) => Math.floor((z - z0) / cell) * nx + Math.floor((x - x0) / cell);
  const start = new Int32Array(nx * nz + 1), order = new Int32Array(n);
  list.forEach((s, i) => {
    _m4.compose(_p4.set(s.x, s.y, s.z), _q4.setFromAxisAngle(_y4, s.yaw), _s4.set(s.sx, s.sy, s.sz));
    m.set(_m4.elements, i * 16);
    col[i * 3] = s.shade; col[i * 3 + 1] = s.shade * 0.98; col[i * 3 + 2] = s.shade * 0.95;
    pk[i] = s.k; xs[i] = s.x; zs[i] = s.z;
    start[cellOf(s.x, s.z) + 1]++;
  });
  for (let k = 0; k < nx * nz; k++) start[k + 1] += start[k];
  const fill = start.slice(0, nx * nz);
  list.forEach((s, i) => { order[fill[cellOf(s.x, s.z)]++] = i; });
  return { n, m, col, pk, xs, zs, start, order, x0, z0, nx, nz, cell };
}

function gather(db, pools, fx, fz, R) {
  for (let p = 0; p < pools.length; p++) if (pools[p]) pools[p].n = 0;
  const { cell, x0, z0, nx, nz, start, order, xs, zs, pk, m, col } = db;
  const i0 = Math.max(0, Math.floor((fx - R - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((fx + R - x0) / cell));
  const j0 = Math.max(0, Math.floor((fz - R - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((fz + R - z0) / cell));
  const R2 = R * R;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * nx + i;
    for (let t = start[k]; t < start[k + 1]; t++) {
      const s = order[t], dx = xs[s] - fx, dz = zs[s] - fz;
      if (dx * dx + dz * dz > R2) continue;
      const p = pools[pk[s]];
      if (!p || p.n >= p.cap) continue;
      const a = p.mesh.instanceMatrix.array, o = p.n * 16, so = s * 16;
      for (let q = 0; q < 16; q++) a[o + q] = m[so + q];
      const ca = p.mesh.instanceColor.array, oc = p.n * 3, sc = s * 3;
      ca[oc] = col[sc]; ca[oc + 1] = col[sc + 1]; ca[oc + 2] = col[sc + 2];
      p.n++;
    }
  }
  for (let p = 0; p < pools.length; p++) {
    const P = pools[p];
    if (!P) continue;
    P.mesh.count = P.n;
    P.mesh.instanceMatrix.needsUpdate = true;
    P.mesh.instanceColor.needsUpdate = true;
    if (P.n) P.mesh.computeBoundingSphere();
  }
}

// --- Info cards -------------------------------------------------------------------------
const INFO = {
  'props-kitchen': {
    mode: 'both', title: 'Bread, grain and the hearth', he: 'רֵחַיִם',
    dims: ['Saddle quern: a long lower stone and an upper stone (rekhev) rubbed across it, worked kneeling', 'Clay oven (tannur) in the courtyard; a cooking pot on three stones', 'Fuel: wood and thorny brushwood; lentils and grain spread on mats'],
    refs: 'Exod 11:5; Deut 24:6; Judg 9:53; Lev 26:26; Jer 7:18; Jer 37:21; Eccl 7:6',
    note: 'Saddle querns and their hand stones turn up in almost every Iron Age house; the rotary quern came centuries later. Jeremiah was given "a loaf of bread daily from the bakers\' street" (Jer 37:21), and in Jerusalem\'s streets "the children gather wood, the fathers kindle fire, and the women knead dough" (Jer 7:18). What stands where in each courtyard is the model\'s choice.',
  },
  'props-stores': {
    mode: 'both', title: 'Storage jars and cisterns', he: 'כַּד',
    dims: ['Four-handled storage jars of the royal type, about 45 litres', 'A cistern cut under the courtyard and plastered, its mouth closed with a stone', 'Juglets, bowls of red-slipped ware, a cooking pot, a stone mortar'],
    refs: '2 Kgs 18:31; Jer 38:6; 2 Chr 32:28; Prov 5:15',
    note: 'Hundreds of jar handles stamped "lmlk" ("belonging to the king") with the names Hebron, Ziph, Socoh or MMŠT come from Jerusalem and Lachish; they date to Hezekiah\'s reign, about 700 BC. By Ezekiel\'s time the royal mark on such handles was a rosette, found in the City of David. The jars here follow that four-handled shape; the stamps are too small to show.',
  },
  'props-cistern': {
    mode: 'both', title: 'Cisterns and storage jars', he: 'בּוֹר',
    dims: ['A cistern cut under the courtyard and plastered, its mouth closed with a stone', 'Storage jars, juglets and bowls'],
    refs: '2 Kgs 18:31; Jer 38:6; Prov 5:15',
    note: '"Drink water from your own cistern" (Prov 5:15). Rock-cut, plastered cisterns are found throughout Iron Age Judah. The royal four-handled jars of the later kingdom are not shown in Solomon\'s time.',
  },
  'props-door': {
    mode: 'both', title: 'At the door', he: 'פֶּתַח',
    dims: ['Firewood and bundles of brushwood for the oven', 'A water jar with a bowl for a lid; a stone bench; a ladder and a trough', 'Stone steps up to doors on raised terraces'],
    refs: 'Jer 7:18; Eccl 7:6; Ps 58:9; Prov 27:22',
    note: 'Houses on the City of David slope stood on terraces above the lanes, so their doors needed steps. Benches by the doors and how things are arranged are the model\'s choice.',
  },
  'props-roof': {
    mode: 'both', title: 'On the roofs', he: 'גַּג',
    dims: ['Flax pulled in spring and laid out to dry', 'A stone roller for pressing the clay of the roof after rain', 'Mats with lentils and grain drying, jars, a shade of branches, washing'],
    refs: 'Josh 2:6; 1 Sam 9:25–26; 2 Sam 11:2; Deut 22:8; Jer 19:13; Zeph 1:5',
    note: 'Rahab hid the spies "under the stalks of flax that she had laid out on the roof" (Josh 2:6), and the Gezer calendar names a "month of pulling flax" in spring, the season of Ezekiel\'s vision. Stone roof rollers are found in Iron Age houses. The booths on the roofs in Neh 8:16 were for the autumn feast, so the shades here are everyday ones; they and the washing lines are the model\'s choice.',
  },
  'props-ruin': {
    mode: 'both', title: 'What the fire left', he: 'חָרְבָּה',
    dims: ['Ash, burnt roof clay and charred beams on the floors', 'Toppled and smashed jars; potsherds everywhere', 'Arrowheads: bronze three-bladed ones of the attackers beside Judahite iron ones'],
    refs: '2 Kgs 25:9–10; Jer 52:13; Lam 4:1; Lam 5:14, 18; Ezek 33:21–24',
    note: 'The burned houses of 586 BC were excavated in the City of David (the "Burnt Room", the House of Ahiel, the House of the Bullae) and in the Jewish Quarter, where arrowheads lay in the destruction by the Israelite tower near the Broad Wall. Thirteen years later "Mount Zion lies desolate" (Lam 5:18). Where each heap lies is the model\'s choice.',
  },
  'props-gate-bench': {
    mode: 'both', title: 'Benches in the gate', he: 'שַׁעַר',
    dims: ['Stone benches against the inner face of the gate towers', 'Where the elders sat, cases were heard and sales were witnessed'],
    refs: 'Ruth 4:1–2, 11; Prov 31:23; Deut 21:19; Amos 5:15; Lam 5:14',
    note: 'Boaz "went up to the gate and sat down there" and called ten elders to witness (Ruth 4:1–2). Stone benches along the walls of gateways were excavated at Iron Age gates such as Tel Dan. After the fall, "the elders have left the gate" (Lam 5:14). Their exact place here is the model\'s choice.',
  },
};

// --- Module -----------------------------------------------------------------------------
export function build(mats, ctx) {
  const low = ctx.quality === 'low';
  const material = propAtlas();
  const R = low ? { near: 60, far: 110 } : { near: 90, far: 180 };
  const CAP = low ? { near: 160, far: 600 } : { near: 400, far: 1400 };
  const P = {};
  const groups = [];
  for (const period of ['late', 'early', 'ruin']) {
    const houses = ctx.city.houses[period === 'early' ? 'early' : 'late'] || [];
    const site = period === 'early' ? 'sp' : 'square';
    const sets = makeSets(period, rng(period === 'late' ? 5 : period === 'early' ? 6 : 7));
    const names = Object.keys(sets), keys = {};
    names.forEach((n, i) => { keys[n] = i; });
    const slots = placeAll(period, houses, low, site, keys);
    const group = new THREE.Group();
    const pools = names.map((n) => {
      const far = sets[n].far, total = slots[far ? 'far' : 'near'].filter((s) => s.k === keys[n]).length;
      if (!total) return null;
      const cap = Math.min(total, CAP[far ? 'far' : 'near']);
      const mesh = new THREE.InstancedMesh(sets[n].geo, material, cap);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.count = 0;
      mesh.castShadow = !low;
      mesh.receiveShadow = true;
      mesh.userData.infoId = sets[n].info;
      group.add(mesh);
      return { mesh, cap, n: 0, far };
    });
    const nearPools = pools.map((p) => (p && !p.far ? p : null)), farPools = pools.map((p) => (p && p.far ? p : null));
    P[period] = { near: makeDB(slots.near), far: makeDB(slots.far), nearPools, farPools, nx: 1e9, nz: 1e9, fx: 1e9, fz: 1e9 };
    groups.push({ group, periods: [period] });
  }
  let last = null;
  return {
    layer: 'city',
    groups,
    info: INFO,
    update(time, dt, env) {
      const S = P[env.period];
      if (!S) return;
      const f = env.focus;
      const jump = S !== last;
      last = S;
      if (jump || (f.x - S.nx) ** 2 + (f.z - S.nz) ** 2 > 64) {
        gather(S.near, S.nearPools, f.x, f.z, R.near);
        S.nx = f.x; S.nz = f.z;
      }
      if (jump || (f.x - S.fx) ** 2 + (f.z - S.fz) ** 2 > 400) {
        gather(S.far, S.farPools, f.x, f.z, R.far);
        S.fx = f.x; S.fz = f.z;
      }
    },
  };
}
