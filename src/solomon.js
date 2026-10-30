// Solomon's temple (1 Kgs 6–7; 2 Chr 3–4) and palace complex, plus the
// platforms shared by both temples. Local frame in long cubits with the
// origin over the rock: u = east, v = south, y = up from the base ground.
import * as THREE from 'three';
import { Builder, aeolicCapital } from './builder.js';
import { CUBIT, LEVEL, BASE_Y, EZ_CENTER_X, PODIUM_HALF_C, PALACE_PAD, SOLOMON_PLATFORM } from './data.js';

const O = LEVEL.outer, I = LEVEL.inner, H = LEVEL.house;
const TOP = H + 30;                      // 30 cubits high (1 Kgs 6:2)
const EZ_U = EZ_CENTER_X / CUBIT;        // Ezekiel's precinct centre in this frame (125)
const PAD_Y = (PALACE_PAD.y - BASE_Y) / CUBIT;
const DEEP = (30 - BASE_Y) / CUBIT;      // bottom of retaining walls
// Solomon's 10th-century terrace in this frame (cubits).
const SP = {
  u0: SOLOMON_PLATFORM.x0 / CUBIT, u1: SOLOMON_PLATFORM.x1 / CUBIT,
  v0: SOLOMON_PLATFORM.z0 / CUBIT, v1: SOLOMON_PLATFORM.z1 / CUBIT,
};

// Pair of proto-Aeolic capitals on pilasters flanking a doorway in a wall
// that faces direction `ry` (radians about y; 0 = facing +v/south).
function capitals(bld, u, v, y, ry, spread, width = 3) {
  for (const s of [-1, 1]) {
    const du = Math.cos(ry) * s * spread, dv = -Math.sin(ry) * s * spread;
    bld.geom('ashlar', aeolicCapital(width), u + du, y, v + dv, ry);
  }
}

const sw = (bld, key, u0, u1, v0, v1, y0, y1) => bld.box(key, u0, u1, y0, y1, v0, v1);

// Wall of three courses of dressed stone and a course of cedar beams (1 Kgs 6:36; 7:12).
function coursedWall(bld, u0, u1, v0, v1, y0) {
  sw(bld, 'ashlar', u0, u1, v0, v1, y0, y0 + 4.5);
  sw(bld, 'cedar', u0 - 0.05, u1 + 0.05, v0 - 0.05, v1 + 0.05, y0 + 4.5, y0 + 5.2);
  sw(bld, 'ashlarDark', u0 - 0.15, u1 + 0.15, v0 - 0.15, v1 + 0.15, y0 + 5.2, y0 + 5.6);
}

// Platforms, in Ezekiel's frame (origin = precinct centre):
// square = the 500-cubit Temple Mount (c. 600 BC and Ezekiel), sp = Solomon's
// smaller summit terrace (c. 950 BC), shared = Ophel terrace and its stair.
export function buildPlatforms(mats) {
  const make = () => {
    const group = new THREE.Group();
    group.position.set(EZ_CENTER_X, BASE_Y, 0);
    group.scale.setScalar(CUBIT);
    return group;
  };
  const R = PODIUM_HALF_C;
  const sq = new Builder(mats);
  sw(sq, 'podium', -R, R, -R, R, DEEP, 0);
  sq.zone('so-podium', -R, R, -0.3, 0.3, -R, R);
  const sp = new Builder(mats);
  const su0 = SP.u0 - EZ_U, su1 = SP.u1 - EZ_U;
  sw(sp, 'podium', su0, su1, SP.v0, SP.v1, DEEP, 0);
  sp.zone('so-platform-early', su0, su1, -0.3, 0.3, SP.v0, SP.v1);
  // Ophel terrace and the stair linking it to the south gate.
  const sh = new Builder(mats);
  const pu0 = (PALACE_PAD.x0 - EZ_CENTER_X) / CUBIT, pu1 = (PALACE_PAD.x1 - EZ_CENTER_X) / CUBIT;
  const pv0 = PALACE_PAD.z0 / CUBIT, pv1 = PALACE_PAD.z1 / CUBIT;
  sw(sh, 'podium', pu0, pu1, pv0, pv1, DEEP, PAD_Y);
  const n = 40, rise = -PAD_Y / n, tread = (pv0 - R) / n;
  for (let i = 0; i < n; i++) {
    sw(sh, 'ashlar', -13, 13, R + i * tread, R + (i + 1) * tread + 0.01, DEEP, -(i + 0.5) * rise);
  }
  for (const s of [-1, 1]) sw(sh, 'podium', s * 13, s * 15, R, pv0, DEEP, 1);
  const out = {};
  for (const [key, b] of [['square', sq], ['sp', sp], ['shared', sh]]) {
    const group = make();
    out[key] = { group, zones: b.finish(group) };
  }
  return out;
}

// --- Furnishings ----------------------------------------------------------------
// Feathered wing outline: span along x (0..5.8), chord along y.
function wingShape() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 1.0);
  sh.quadraticCurveTo(3.0, 1.6, 5.8, 0.5);
  const scallops = [[5.2, -0.4], [4.7, 0.0], [4.1, -0.9], [3.5, -0.4], [2.9, -1.4], [2.2, -0.9], [1.5, -1.9], [0.8, -1.4], [0, -2.2]];
  for (const [x, y] of scallops) sh.lineTo(x, y);
  sh.closePath();
  return sh;
}

function cherub(bld, u, v) {
  bld.geom('gold', new THREE.CylinderGeometry(0.85, 1.35, 7, 20), u, H + 3.5, v);
  bld.geom('gold', new THREE.SphereGeometry(0.9, 18, 12), u, H + 7.9, v);
  bld.geom('gold', new THREE.SphereGeometry(0.42, 12, 8), u + 0.8, H + 7.8, v);   // face toward the nave (2 Chr 3:13)
  for (const s of [-1, 1]) {
    for (const [scale, drop] of [[1, 0], [0.82, -0.45]]) {          // two layers of feathers
      const g = new THREE.ExtrudeGeometry(wingShape(), { depth: 0.16, bevelEnabled: false });
      g.scale(scale, scale, 1);
      // shape x -> along v (s), shape y -> east, extrusion -> up
      g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, s), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, s, 0)));
      g.rotateX(-s * Math.PI / 6);                                   // tips rise to about 10 cubits
      g.translate(u + 0.6, H + 7.2 + drop, v);
      bld.add('gold', g);
    }
  }
}

function lampstand(bld, flames, u, v) {
  bld.geom('gold', new THREE.CylinderGeometry(0.35, 0.6, 0.4, 16), u, H + 0.2, v);
  bld.geom('gold', new THREE.CylinderGeometry(0.07, 0.09, 3, 8), u, H + 1.9, v);
  for (const r of [0.42, 0.82, 1.2]) {
    const arc = new THREE.TorusGeometry(r, 0.06, 6, 20, Math.PI);
    arc.rotateZ(Math.PI);
    arc.translate(u, H + 3.4, v);
    bld.add('gold', arc);
  }
  for (const dx of [0, -0.42, 0.42, -0.82, 0.82, -1.2, 1.2]) {
    bld.geom('gold', new THREE.CylinderGeometry(0.12, 0.06, 0.25, 8), u + dx, H + 3.5, v);
    flames.push(new THREE.Vector3(u + dx, H + 3.62, v));
  }
}

function ox(bld, x, z, ang) {
  const body = new THREE.CapsuleGeometry(0.62, 1.7, 6, 12);
  body.rotateZ(Math.PI / 2);
  body.scale(1, 1.05, 0.95);
  const parts = [
    [body, 0, 2.45, 0],
    [new THREE.CylinderGeometry(0.34, 0.5, 0.9, 10), 1.35, 2.75, 0],           // neck
    [new THREE.BoxGeometry(0.75, 0.62, 0.62), 1.85, 2.95, 0],                  // head
    [new THREE.BoxGeometry(0.3, 0.34, 0.5), 2.27, 2.82, 0],                    // muzzle
  ];
  parts[1][0].rotateZ(-Math.PI / 3);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.36, 0.36]) {
    parts.push([new THREE.CylinderGeometry(0.15, 0.12, 1.9, 8), sx, 0.95, sz]);
  }
  for (const sz of [-1, 1]) {
    const horn = new THREE.CylinderGeometry(0.05, 0.1, 0.55, 6);
    horn.rotateX(sz * 0.9);
    parts.push([horn, 1.8, 3.35, sz * 0.32]);
  }
  for (const [g, px, py, pz] of parts) {
    g.translate(px, py, pz);
    g.rotateY(-ang);
    g.translate(x, I, z);
    bld.add('bronze', g);
  }
}

// The Sea on twelve oxen (7:25), or, after Ahaz, "on a pavement of stones"
// (2 Kgs 16:17).
function sea(bld, u, v, { oxen = true } = {}) {
  const lift = oxen ? 3.2 : 1.6;
  if (oxen) {
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      for (const off of [-2.0, 0, 2.0]) {
        ox(bld, u + dx * 3.3 - dz * off, v + dz * 3.3 + dx * off, a);
      }
    }
  } else {
    sw(bld, 'ashlar', u - 5.4, u + 5.4, v - 5.4, v + 5.4, I, I + lift);
    sw(bld, 'pavement', u - 6.5, u + 6.5, v - 6.5, v + 6.5, I, I + 0.3);
  }
  const prof = [[0.01, 0], [2.5, 0], [3.4, 0.6], [4.3, 1.8], [4.8, 3.2], [5.0, 4.4], [5.25, 4.85], [5.35, 5.0],
    [5.18, 5.0], [4.85, 4.4], [4.65, 3.2], [4.15, 1.8], [3.25, 0.75], [2.4, 0.17], [0.01, 0.17]].map(([r, y]) => new THREE.Vector2(r, y));
  bld.geom('bronze', new THREE.LatheGeometry(prof, 64), u, I + lift, v);
  for (const [y, r] of [[3.9, 5.02], [4.3, 5.1]]) {             // two rows of gourds under the brim (7:24)
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2;
      bld.geom('bronze', new THREE.IcosahedronGeometry(0.16, 0), u + Math.cos(a) * r, I + lift + y, v + Math.sin(a) * r);
    }
  }
  const water = new THREE.CircleGeometry(4.8, 48);
  water.rotateX(-Math.PI / 2);
  bld.geom('water', water, u, I + lift + 4.3, v);
}

// Wheeled stand with its basin (7:27–39). Ahaz "cut off the panels of the
// stands and removed the basins from them" (2 Kgs 16:17).
function laver(bld, u, v, { stripped = false } = {}) {
  if (stripped) {
    for (const su of [-1, 1]) for (const sv of [-1, 1]) sw(bld, 'bronze', u + su * 2 - 0.25, u + su * 2 + 0.25, v + sv * 2 - 0.25, v + sv * 2 + 0.25, I + 0.9, I + 3.9);
    for (const s of [-1, 1]) {
      sw(bld, 'bronze', u - 2, u + 2, v + s * 2 - 0.2, v + s * 2 + 0.2, I + 3.5, I + 3.9);
      sw(bld, 'bronze', u + s * 2 - 0.2, u + s * 2 + 0.2, v - 2, v + 2, I + 3.5, I + 3.9);
    }
  } else {
    sw(bld, 'bronze', u - 2, u + 2, v - 2, v + 2, I + 0.9, I + 3.9);
    sw(bld, 'ashlarDark', u - 1.6, u + 1.6, v - 2.02, v + 2.02, I + 1.3, I + 3.5);   // panels
    bld.geom('bronze', new THREE.CylinderGeometry(1.2, 1.3, 0.5, 24), u, I + 4.15, v);
    const bowl = [[0.01, 0], [1.1, 0], [1.7, 0.5], [2.0, 1.2], [1.88, 1.2], [1.58, 0.55], [1.0, 0.12], [0.01, 0.12]].map(([r, y]) => new THREE.Vector2(r, y));
    bld.geom('bronze', new THREE.LatheGeometry(bowl, 32), u, I + 4.4, v);
  }
  for (const su of [-1.6, 1.6]) for (const sv of [-2.15, 2.15]) {
    const w = new THREE.CylinderGeometry(0.75, 0.75, 0.22, 16);
    w.rotateX(Math.PI / 2);
    bld.geom('bronze', w, u + su, I + 0.75, v + sv);
  }
}

function pillar(bld, u, v) {
  bld.geom('bronze', new THREE.CylinderGeometry(1.91, 1.95, 18, 40), u, H + 9, v);   // 12 cubits round
  bld.geom('bronze', new THREE.CylinderGeometry(2.3, 2.3, 0.6, 40), u, H + 0.3, v);
  const cap = [[1.95, 0], [2.35, 0.5], [2.65, 1.3], [2.7, 2.2], [2.5, 3.0], [2.2, 3.4], [2.6, 4.1], [2.95, 4.65], [2.3, 5.0], [0.01, 5.0]].map(([r, y]) => new THREE.Vector2(r, y));
  bld.geom('bronze', new THREE.LatheGeometry(cap, 40), u, H + 18, v);
  for (const y of [1.2, 2.5]) {                                  // network and chain-work (7:17)
    const t = new THREE.TorusGeometry(2.72, 0.1, 6, 48);
    t.rotateX(Math.PI / 2);
    bld.geom('bronze', t, u, H + 18 + y, v);
  }
  for (const y of [0.85, 2.85]) {                                // two rows of pomegranates (7:18, 20)
    for (let i = 0; i < 50; i++) {
      const a = i / 50 * Math.PI * 2;
      bld.geom('bronze', new THREE.IcosahedronGeometry(0.2, 0), u + Math.cos(a) * 2.78, H + 18 + y, v + Math.sin(a) * 2.78);
    }
  }
}

// Simple roofed hall with windows.
function hall(bld, u0, u1, v0, v1, y0, h, { windows = 1, door = 's', key = 'ashlar' } = {}) {
  const t = 3;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  sw(bld, key, u0, u1, v0, v0 + t, y0, y0 + h);
  sw(bld, key, u0, u0 + t, v0 + t, v1 - t, y0, y0 + h);
  sw(bld, key, u1 - t, u1, v0 + t, v1 - t, y0, y0 + h);
  if (door === 's') {
    sw(bld, key, u0, cu - 3, v1 - t, v1, y0, y0 + h);
    sw(bld, key, cu + 3, u1, v1 - t, v1, y0, y0 + h);
    sw(bld, key, cu - 3, cu + 3, v1 - t, v1, y0 + 9, y0 + h);
    // Pilasters with proto-Aeolic capitals flank the entrance.
    for (const s of [-1, 1]) sw(bld, 'ashlar', cu + s * 4.5 - 1.2, cu + s * 4.5 + 1.2, v1, v1 + 0.6, y0, y0 + 9);
    capitals(bld, cu, v1 + 0.3, y0 + 9, 0, 4.5, 3.2);
  } else {
    sw(bld, key, u0, u1, v1 - t, v1, y0, y0 + h);
  }
  sw(bld, 'roof', u0 - 0.4, u1 + 0.4, v0 - 0.4, v1 + 0.4, y0 + h, y0 + h + 0.8);
  for (let r = 0; r < windows; r++) {
    const y = y0 + h * (0.35 + r * 0.22);
    for (let u = u0 + 5; u < u1 - 5; u += 7) {
      sw(bld, 'window', u, u + 1.6, v0 - 0.12, v0, y, y + 3);
      sw(bld, 'window', u, u + 1.6, v1, v1 + 0.12, y, y + 3);
    }
  }
  sw(bld, 'earth', u0 + t, u1 - t, v0 + t, v1 - t, y0, y0 + 0.05);
}

// Ahaz's "great altar", copied from an altar he saw in Damascus (2 Kgs
// 16:10–15). Its form is not described: three stages of stone with horns and
// a ramp, larger than the bronze altar. Some scholars see Ezekiel's stepped
// altar (43:13–17) as echoing it.
function ahazAltar(bld, fires, u, v) {
  [[11, 0, 2], [9.5, 2, 6], [8, 6, 10]].forEach(([r, y0, y1], i) => sw(bld, i === 2 ? 'ashlarDark' : 'ashlar', u - r, u + r, v - r, v + r, I + y0, I + y1));
  for (const su of [-1, 1]) for (const sv of [-1, 1]) sw(bld, 'ashlarDark', u + su * 7.4 - 0.6, u + su * 7.4 + 0.6, v + sv * 7.4 - 0.6, v + sv * 7.4 + 0.6, I + 10, I + 11.2);
  sw(bld, 'ember', u - 6, u + 6, v - 6, v + 6, I + 10, I + 10.15);
  for (let i = 0; i < 20; i++) sw(bld, 'ashlar', u - 4, u + 4, v + 11 + i, v + 12 + i, I - 0.5, I + 10 - 0.5 * i);
  fires.push({ u, v, y: I + 10.1, s: 3.4, big: true });
}

function bronzeAltar(bld, fires, u, v, { ramp = true, lit = true } = {}) {
  sw(bld, 'bronze', u - 10, u + 10, v - 10, v + 10, I, I + 10);
  sw(bld, 'ashlarDark', u - 10.2, u + 10.2, v - 10.2, v + 10.2, I + 4.6, I + 5.4);
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    sw(bld, 'bronze', u + su * 10 - (su > 0 ? 1.2 : 0), u + su * 10 + (su > 0 ? 0 : 1.2), v + sv * 10 - (sv > 0 ? 1.2 : 0), v + sv * 10 + (sv > 0 ? 0 : 1.2), I + 10, I + 11.2);
  }
  if (ramp) for (let i = 0; i < 20; i++) sw(bld, 'ashlar', u - 5, u + 5, v + 10 + i, v + 11 + i, I - 0.5, I + 10 - 0.5 * i);
  if (lit) {
    sw(bld, 'ember', u - 8, u + 8, v - 8, v + 8, I + 10, I + 10.15);
    fires.push({ u, v, y: I + 10.1, s: 3.6, big: true });
  }
}

// The "upper gate" built by Jotham (2 Kgs 15:35), on the north side of the
// raised inner court: Jeremiah's "upper Benjamin gate" (Jer 20:2) and the
// north gate of Ezekiel's visions of the temple in his own day (Ezek 8:3–5; 9:2).
function upperGate(bld, u, vWall) {
  for (const s of [-1, 1]) sw(bld, 'ashlar', u + s * 5, u + s * 10, vWall - 8, vWall + 6, I, I + 13);
  sw(bld, 'ashlar', u - 5, u + 5, vWall - 8, vWall + 6, I + 10, I + 13);
  sw(bld, 'roof', u - 10.4, u + 10.4, vWall - 8.4, vWall + 6.4, I + 13, I + 13.7);
  sw(bld, 'pavement', u - 5, u + 5, vWall - 8, vWall + 6, I - 0.2, I + 0.05);
  for (let i = 0; i < 8; i++) sw(bld, 'ashlar', u - 5, u + 5, vWall - 9 - i, vWall - 8 - i, O - 0.6, O + 0.5 * (7 - i) + 0.5);
  capitals(bld, u, vWall - 8.2, I + 7.5, Math.PI, 7.5, 3);
}

// One period of Solomon's temple and palace:
//   'early' c. 950 BC as built; 'late' c. 600 BC after the changes of Ahaz,
//   Jotham and Hezekiah; 'ruin' 573 BC, burned by Nebuzaradan in 586 BC with
//   its bronze broken up and carried to Babylon (2 Kgs 25:9, 13–17).
export function buildSolomon(mats, { variant = 'early' } = {}) {
  const early = variant === 'early', ruin = variant === 'ruin';
  let seed = 9001;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const ruinOpts = ruin ? {
    rand,
    levels: [0, O, I, H, PAD_Y],
    drop: new Set(['roof', 'cedar', 'cedarCarved', 'goldCarved', 'gold', 'goldFloor', 'door', 'veil', 'window', 'bronze', 'water', 'ember', 'linen', 'ashlarDark']),
    map: { ashlar: 'ashlarBurnt', palmStone: 'ashlarBurnt' },
    zoneMap: {
      'so-house': 'so-ruin', 'so-side': 'so-ruin', 'so-porch': 'so-ruin', 'so-nave': 'so-ruin', 'so-hoh': 'so-ruin', 'so-upper-gate': 'so-ruin',
      'so-cherubim': null, 'so-ark': null, 'so-incense': null, 'so-table': null, 'so-lamps': null,
      'so-pillars': 'so-ruin-bronze', 'so-sea': 'so-ruin-bronze', 'so-lavers': 'so-ruin-bronze',
      'so-altar': 'so-ruin-altar', 'so-altar-ahaz': 'so-ruin-altar',
      'so-forest': 'so-ruin-palace', 'so-hall': 'so-ruin-palace', 'so-throne': 'so-ruin-palace', 'so-palace': 'so-ruin-palace',
    },
  } : null;
  const temple = new Builder(mats, { ruin: ruinOpts });
  const site = new Builder(mats, { ruin: ruinOpts });     // inner court floor and palace
  const court = new Builder(mats, { ruin: ruinOpts });    // great court
  const flames = [];
  const fires = [];
  const labels = [];
  const T = (u, y, v) => new THREE.Vector3(u * CUBIT, BASE_Y + y * CUBIT, v * CUBIT);

  // --- Great court (1 Kgs 7:12) ----------------------------------------------------
  // c. 950 BC: the summit terrace only. Later: the 500-cubit square.
  const greatCourt = (b, g0, g1, n0, n1) => {
    sw(b, 'earth', g0, g1, n0, n1, 0, O);
    b.zone('so-great-court', g0, g1, O - 0.2, O + 0.3, n0, n1);
    coursedWall(b, g0, g1, n0 - 3, n0, 0);
    coursedWall(b, g0, EZ_U - 12, n1, n1 + 3, 0);       // south, with a gate toward the palace
    coursedWall(b, EZ_U + 12, g1, n1, n1 + 3, 0);
    coursedWall(b, g0 - 3, g0, n0 - 3, n1 + 3, 0);
    coursedWall(b, g1, g1 + 3, n0 - 3, -10, 0);          // east, with a gate
    coursedWall(b, g1, g1 + 3, 10, n1 + 3, 0);
    for (const [u, v] of [[g1 + 1.5, -12], [g1 + 1.5, 12], [EZ_U - 14, n1 + 1.5], [EZ_U + 14, n1 + 1.5]]) {
      sw(b, 'ashlar', u - 3, u + 3, v - 3, v + 3, 0, O + 9);
    }
    for (let i = 0; i < 7; i++) {
      sw(b, 'ashlar', g1 + 3 + (6 - i), g1 + 4 + (6 - i), -8, 8, -0.6, 0.5 * (i + 1));
      sw(b, 'ashlar', EZ_U - 10, EZ_U + 10, n1 + 3 + (6 - i), n1 + 4 + (6 - i), -0.6, 0.5 * (i + 1));
    }
  };
  if (early) greatCourt(court, SP.u0 + 8, SP.u1 - 10, SP.v0 + 8, SP.v1 - 10);
  else greatCourt(court, EZ_U - 244, EZ_U + 244, -244, 244);

  // --- Inner court (1 Kgs 6:36) ---------------------------------------------------
  sw(site, 'pavement', -40, 160, -50, 50, O, I);
  site.zone('so-inner-court', -40, 160, I - 0.2, I + 0.3, -50, 50);
  if (early) {
    coursedWall(temple, -40, 160, -50, -48, I);
  } else {
    coursedWall(temple, -40, 50, -50, -48, I);
    coursedWall(temple, 70, 160, -50, -48, I);
    upperGate(temple, 60, -49);
    temple.zone('so-upper-gate', 50, 70, I - 4, I + 13.7, -65, -43);
    if (!ruin) labels.push({ label: 'Upper Gate', pos: T(60, I + 20, -50), small: true });
  }
  coursedWall(temple, -40, 160, 48, 50, I);
  coursedWall(temple, -40, -38, -48, 48, I);
  coursedWall(temple, 158, 160, -48, -7, I);
  coursedWall(temple, 158, 160, 7, 48, I);
  for (let i = 0; i < 8; i++) sw(site, 'ashlar', 160 + (7 - i), 161 + (7 - i), -7, 7, O - 0.6, O + 0.5 * (i + 1));

  // --- House platform and steps (not described; Ezekiel's levels reused) -----------------
  sw(temple, 'ashlar', -28, 78, -28, 28, I, H);
  for (let i = 0; i < 10; i++) sw(temple, 'ashlar', 78 + i, 79 + i, -8, 8, I - 0.5, H - 0.6 * i);

  // --- The house (1 Kgs 6:2–10) ---------------------------------------------------
  // Side-chamber block: outer wall 3 (assumed), chambers 5 / 6 / 7 wide.
  sw(temple, 'ashlar', -24, -21, -24, 24, H, H + 17.5);
  for (const s of [-1, 1]) {
    sw(temple, 'ashlar', -21, 52, s * 21, s * 24, H, H + 17.5);
    sw(temple, 'ashlar', 51, 52, s * 16, s * 21, H, H + 17.5);
    for (const y of [H + 5.5, H + 11]) sw(temple, 'ashlarDark', -24, 52, s * 24, s * 24.25, y - 0.4, y);
    for (let u = -18; u < 48; u += 6) for (const y of [H + 1.5, H + 7, H + 12.5]) sw(temple, 'window', u, u + 1.4, s * 24, s * 24.12, y, y + 2.5);
    // House walls stepping in at each storey (6:6)
    sw(temple, 'ashlar', -16, 58, s * 10, s * 16, H, H + 5.5);
    sw(temple, 'ashlar', -15, 58, s * 10, s * 15, H + 5.5, H + 11);
    sw(temple, 'ashlar', -14, 58, s * 10, s * 14, H + 11, TOP);
    sw(temple, 'ashlar', 58, 70, s * 10, s * 16, H, TOP);          // porch side walls
    for (let u = -8; u < 50; u += 7) sw(temple, 'window', u, u + 1.6, s * 14, s * 14.12, H + 20, H + 27);   // narrow windows (6:4)
  }
  sw(temple, 'window', 20, 23, 24, 24.12, H, H + 6);       // side-chamber door on the right/south (6:8)
  sw(temple, 'ashlar', -16, -10, -10, 10, H, H + 5.5);
  sw(temple, 'ashlar', -15, -10, -10, 10, H + 5.5, H + 11);
  sw(temple, 'ashlar', -14, -10, -10, 10, H + 11, TOP);
  sw(temple, 'roof', -24.4, 52, -24.4, -14, H + 17.5, H + 18.2);
  sw(temple, 'roof', -24.4, 52, 14, 24.4, H + 17.5, H + 18.2);
  sw(temple, 'roof', -24.4, -14, -14, 14, H + 17.5, H + 18.2);
  for (const s of [-1, 1]) sw(temple, 'ashlar', 52, 58, s * 5, s * 16, H, TOP);   // east wall, door 10
  sw(temple, 'ashlar', 52, 58, -5, 5, H + 20, TOP);
  for (const s of [-1, 1]) sw(temple, 'ashlar', 10, 12, s * 3, s * 10, H, TOP);  // partition
  sw(temple, 'ashlar', 10, 12, -3, 3, H + 12.5, TOP);
  sw(temple, 'roof', -14.6, 70.6, -16.6, 16.6, TOP, TOP + 1);
  sw(temple, 'ashlarDark', -14.6, 70.6, -16.6, -16, TOP + 1, TOP + 1.6);
  sw(temple, 'ashlarDark', -14.6, 70.6, 16, 16.6, TOP + 1, TOP + 1.6);
  temple.zone('so-house', -24, 70, H, TOP + 1.6, -24, 24);
  temple.zone('so-side', -24, 52, H, H + 18.2, -24, -14);
  temple.zone('so-side', -24, 52, H, H + 18.2, 14, 24);
  temple.zone('so-porch', 58, 70, H, TOP, -16, 16);
  labels.push({ label: ruin ? 'Ruins of the house of the LORD' : 'House of the LORD', pos: T(25, (ruin ? H + 14 : TOP + 8), 0) });

  // Interior: gold-covered carved cedar, gold floor (6:15–22, 29–30)
  sw(temple, 'goldFloor', -10, 52, -10, 10, H, H + 0.08);
  for (const s of [-1, 1]) {
    sw(temple, 'goldCarved', 12, 52, s * 9.85, s * 10, H, TOP);
    sw(temple, 'goldCarved', -10, 10, s * 9.85, s * 10, H, H + 20);
  }
  sw(temple, 'goldCarved', -10, -9.85, -10, 10, H, H + 20);
  sw(temple, 'goldCarved', 9.85, 10, -10, -3, H, H + 20); sw(temple, 'goldCarved', 9.85, 10, 3, 10, H, H + 20);
  sw(temple, 'goldCarved', 12, 12.15, -10, -3, H, TOP); sw(temple, 'goldCarved', 12, 12.15, 3, 10, H, TOP);
  sw(temple, 'goldCarved', 51.85, 52, -10, -5, H, TOP); sw(temple, 'goldCarved', 51.85, 52, 5, 10, H, TOP);
  sw(temple, 'gold', -10, 10, -10, 10, H + 20, H + 20.5);         // the cube's ceiling (6:20)
  sw(temple, 'cedar', 12, 52, -10, 10, TOP - 0.6, TOP);
  // Doors carved and overlaid with gold (6:31–35); Hezekiah stripped the gold
  // from the doors and doorposts to pay Sennacherib (2 Kgs 18:16).
  const doorKey = early ? 'goldCarved' : 'door';
  for (const s of [-1, 1]) {
    sw(temple, doorKey, 51.2, 51.7, s * 5.2, s * 10, H, H + 20);      // cypress doors, folding (6:34)
    sw(temple, doorKey, 9.3, 9.8, s * 3.2, s * 6.2, H, H + 12.5);     // olive doors (6:31–32)
  }
  const veil = new THREE.PlaneGeometry(7, 12.5);
  veil.rotateY(Math.PI / 2);
  temple.geom('veil', veil, 12.35, H + 6.25, 0);                   // 2 Chr 3:14
  temple.zone('so-nave', 12, 52, H, TOP, -10, 10);
  temple.zone('so-hoh', -10, 10, H, H + 20, -10, 10);

  // Cherubim and ark (6:23–28; 8:6–8)
  cherub(temple, 0, -5);
  cherub(temple, 0, 5);
  temple.zone('so-cherubim', -1.5, 1.5, H, H + 10.2, -10, 10);
  sw(temple, 'gold', -1.25, 1.25, -0.75, 0.75, H + 0.1, H + 1.6);
  sw(temple, 'gold', -1.3, 1.3, -0.8, 0.8, H + 1.6, H + 1.75);
  for (const s of [-1, 1]) {
    // Two small cherubim on the mercy seat, wings spread over it (Exod 25:18–20)
    sw(temple, 'gold', s * 0.95 - 0.2, s * 0.95 + 0.2, -0.25, 0.25, H + 1.75, H + 2.55);
    for (const side of [-1, 1]) {
      const w = new THREE.ExtrudeGeometry(wingShape(), { depth: 0.05, bevelEnabled: false });
      w.scale(0.17, 0.17, 1);
      w.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(-s, 0, 0), new THREE.Vector3(0, 0, side), new THREE.Vector3(0, s * side, 0)));
      w.rotateZ(-s * 0.7);
      w.translate(s * 0.95, H + 2.45, side * 0.12);
      temple.add('gold', w);
    }
    const pole = new THREE.CylinderGeometry(0.07, 0.07, 10, 8);
    pole.rotateZ(Math.PI / 2);
    temple.geom('gold', pole, 4.0, H + 0.7, s * 0.85);
  }
  temple.zone('so-ark', -1.4, 1.4, H, H + 2.4, -0.9, 0.9);

  // Nave furniture (7:48–49)
  sw(temple, 'gold', 14.5, 15.5, -0.5, 0.5, H, H + 2);
  temple.zone('so-incense', 14.3, 15.7, H, H + 2.2, -0.7, 0.7);
  sw(temple, 'gold', 21, 23, -6.5, -5.5, H + 1.38, H + 1.5);
  for (const du of [21.05, 22.85]) for (const dv of [-6.45, -5.65]) sw(temple, 'gold', du, du + 0.1, dv, dv + 0.1, H, H + 1.38);
  for (let i = 0; i < 6; i++) for (const dv of [-6.3, -5.9]) sw(temple, 'roof', 21.1 + i * 0.3, 21.35 + i * 0.3, dv, dv + 0.35, H + 1.5, H + 1.62);
  temple.zone('so-table', 20.8, 23.2, H, H + 1.8, -6.7, -5.3);
  if (!ruin) for (const u of [16, 23, 30, 37, 44]) for (const s of [-1, 1]) lampstand(temple, flames, u, s * 8);
  temple.zone('so-lamps', 14.5, 45.5, H, H + 3.8, -9, -7);
  temple.zone('so-lamps', 14.5, 45.5, H, H + 3.8, 7, 9);

  // Jachin (south, right) and Boaz (north, left) (7:15–22)
  pillar(temple, 74, 7);
  pillar(temple, 74, -7);
  temple.zone('so-pillars', 71, 77, H, H + 23, 4, 10);
  temple.zone('so-pillars', 71, 77, H, H + 23, -10, -4);
  if (!ruin) {
    labels.push({ label: 'Jachin', pos: T(74, H + 26, 7), small: true });
    labels.push({ label: 'Boaz', pos: T(74, H + 26, -7), small: true });
  }

  // Sea and stands (7:23–39); after Ahaz, the Sea on stones and the stands stripped.
  sea(temple, 66, 38, { oxen: early });
  temple.zone('so-sea', 60.5, 71.5, I, I + 8.3, 32.5, 43.5);
  if (!ruin) labels.push({ label: 'Bronze Sea', pos: T(66, I + 13, 38), small: true });
  for (const u of [0, 12, 24, 36, 48]) for (const s of [-1, 1]) {
    laver(temple, u, s * 34, { stripped: !early });
    temple.zone('so-lavers', u - 2.3, u + 2.3, I, I + 5.7, s * 34 - 2.4, s * 34 + 2.4);
  }

  // Altars (2 Chr 4:1; 2 Kgs 16:10–15). Ahaz set his altar in front and moved
  // the bronze altar to its north side.
  let altarTop;
  if (early) {
    bronzeAltar(temple, fires, 118, 0);
    temple.zone('so-altar', 108, 128, I, I + 11.2, -10, 30);
    labels.push({ label: 'Bronze altar', pos: T(118, I + 16, 0), small: true });
    altarTop = T(118, I + 11, 0);
  } else {
    ahazAltar(temple, fires, 136, 0);
    temple.zone('so-altar-ahaz', 125, 147, I, I + 11.2, -11, 31);
    bronzeAltar(temple, fires, 136, -31, { ramp: false, lit: false });
    temple.zone('so-altar', 126, 146, I, I + 11.2, -41, -21);
    if (!ruin) {
      labels.push({ label: 'Altar of Ahaz', pos: T(136, I + 16, 0), small: true });
      labels.push({ label: 'Bronze altar (moved)', pos: T(136, I + 16, -31), small: true });
    }
    altarTop = T(136, I + 10.5, 0);
  }

  // --- Palace complex on the Ophel (1 Kgs 7:1–12) ------------------------------------
  const py = PAD_Y;
  const pu0 = PALACE_PAD.x0 / CUBIT, pu1 = PALACE_PAD.x1 / CUBIT;
  const pv0 = PALACE_PAD.z0 / CUBIT, pv1 = PALACE_PAD.z1 / CUBIT;
  sw(site, 'earth', pu0, pu1, pv0, pv1, py, py + 0.06);
  coursedWall(site, pu0, pu1, pv1 - 3, pv1, py);
  coursedWall(site, pu0, pu0 + 3, pv0, pv1 - 3, py);
  coursedWall(site, pu1 - 3, pu1, pv0, pv1 - 3, py);
  coursedWall(site, pu0, EZ_U - 15, pv0, pv0 + 3, py);
  coursedWall(site, EZ_U + 15, pu1, pv0, pv0 + 3, py);

  // House of the Forest of Lebanon: 100 × 50 × 30, 45 cedar pillars (7:2–5)
  hall(site, 30, 130, 560, 610, py, 30, { windows: 3 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 15; c++) {
    site.geom('cedar', new THREE.CylinderGeometry(0.9, 0.9, 30, 12), 36 + c * 6.3, py + 15, 572 + r * 13);
  }
  site.zone('so-forest', 30, 130, py, py + 31, 560, 610);
  if (!ruin) labels.push({ label: 'House of the Forest of Lebanon', pos: T(80, py + 38, 585) });

  // Hall of Pillars: 50 × 30 with a porch (7:6)
  sw(site, 'ashlar', 95, 145, 505, 535, py, py + 1);
  for (let c = 0; c < 8; c++) for (const v of [507, 520, 533]) {
    site.geom('cedar', new THREE.CylinderGeometry(0.8, 0.8, 18, 12), 97 + c * 6.6, py + 10, v);
  }
  sw(site, 'roof', 94, 146, 504, 545, py + 19, py + 20);
  for (let c = 0; c < 6; c++) site.geom('cedar', new THREE.CylinderGeometry(0.7, 0.7, 18, 12), 100 + c * 8, py + 10, 543);
  site.zone('so-hall', 94, 146, py, py + 20, 504, 545);
  if (!ruin) labels.push({ label: 'Hall of Pillars', pos: T(120, py + 26, 525), small: true });

  // Hall of the Throne (7:7)
  hall(site, 100, 140, 440, 480, py, 22, { windows: 1 });
  sw(site, 'gold', 118, 122, 450, 454, py, py + 3);
  site.zone('so-throne', 100, 140, py, py + 23, 440, 480);
  if (!ruin) labels.push({ label: 'Throne hall', pos: T(120, py + 28, 460), small: true });

  // Solomon's house and the house of Pharaoh's daughter (7:8)
  for (const [u0, u1, v0, v1, id] of [[40, 100, 340, 420, 'so-palace'], [145, 195, 340, 400, 'so-palace']]) {
    sw(site, 'ashlar', u0, u1, v0, v0 + 12, py, py + 14);
    sw(site, 'ashlar', u0, u1, v1 - 12, v1, py, py + 14);
    sw(site, 'ashlar', u0, u0 + 12, v0 + 12, v1 - 12, py, py + 14);
    sw(site, 'ashlar', u1 - 12, u1, v0 + 12, v1 - 12, py, py + 14);
    sw(site, 'roof', u0 - 0.3, u1 + 0.3, v0 - 0.3, v0 + 12.3, py + 14, py + 14.7);
    sw(site, 'roof', u0 - 0.3, u1 + 0.3, v1 - 12.3, v1 + 0.3, py + 14, py + 14.7);
    sw(site, 'roof', u0 - 0.3, u0 + 12.3, v0 + 12, v1 - 12, py + 14, py + 14.7);
    sw(site, 'roof', u1 - 12.3, u1 + 0.3, v0 + 12, v1 - 12, py + 14, py + 14.7);
    for (let u = u0 + 4; u < u1 - 4; u += 6) for (const y of [3, 9]) {
      sw(site, 'window', u, u + 1.5, v0 - 0.12, v0, py + y, py + y + 2.6);
      sw(site, 'window', u, u + 1.5, v1, v1 + 0.12, py + y, py + y + 2.6);
    }
    site.zone(id, u0, u1, py, py + 15, v0, v1);
  }
  labels.push({ label: ruin ? 'Burned palace' : 'Royal palace', pos: T(70, py + 22, 380), small: true });

  // --- 573 BC: charred beams in the burned buildings -------------------------------
  if (ruin) {
    const beams = (b, u0, u1, v0, v1, y, n) => {
      for (let i = 0; i < n; i++) {
        const len = 6 + rand() * 14;
        const g = new THREE.BoxGeometry(len, 0.7 + rand() * 0.4, 0.8 + rand() * 0.4);
        g.rotateZ((rand() - 0.5) * 0.25);
        g.rotateY(rand() * Math.PI);
        g.translate(u0 + rand() * (u1 - u0), y + 0.4 + rand() * 0.6, v0 + rand() * (v1 - v0));
        b.debris('charcoal', g);
      }
    };
    beams(temple, -8, 50, -8, 8, H, 26);
    beams(temple, -20, 48, -22, -16, H, 10);
    beams(temple, -20, 48, 16, 22, H, 10);
    beams(site, 34, 126, 562, 608, py, 30);
    beams(site, 98, 142, 508, 542, py, 14);
    beams(site, 44, 96, 344, 416, py, 14);
  }

  // --- Finish ----------------------------------------------------------------------
  const templeGroup = new THREE.Group();
  const siteGroup = new THREE.Group();
  const courtGroup = new THREE.Group();
  for (const g of [templeGroup, siteGroup, courtGroup]) {
    g.position.set(0, BASE_Y, 0);
    g.scale.setScalar(CUBIT);
  }

  const zones = [...temple.finish(templeGroup), ...site.finish(siteGroup)];
  const courtZones = court.finish(courtGroup);

  const fireMeshes = [];
  if (ruin) fires.length = 0;
  for (const f of fires) {
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Sprite(mats.fire);
      m.center.set(0.5, 0.03);
      m.position.set(f.u + (Math.random() - 0.5) * 9, f.y, f.v + (Math.random() - 0.5) * 9);
      m.userData.base = f.s * (0.7 + Math.random() * 0.5);
      m.userData.phase = Math.random() * 10;
      templeGroup.add(m);
      fireMeshes.push(m);
    }
  }
  for (const p of flames) {
    const m = new THREE.Sprite(mats.fire);
    m.center.set(0.5, 0.03);
    m.position.copy(p);
    m.userData.base = 0.13;
    m.userData.phase = Math.random() * 10;
    templeGroup.add(m);
    fireMeshes.push(m);
  }
  // Light sources for the light pool (main.js): the altar fire and the lamps
  // of the nave and inner room.
  const lights = ruin ? [] : [
    { pos: altarTop.clone().add(new THREE.Vector3(0, 2, 0)), power: 40, range: 30 },
    { pos: T(32, H + 18, 0), power: 14, range: 24, lamp: true },
    { pos: T(4, H + 14, 0), power: 10, range: 14, lamp: true },
  ];
  return {
    templeGroup, siteGroup, courtGroup, zones, courtZones, labels, fireMeshes, lights,
    altarTop: ruin ? null : altarTop,
  };
}
