// People, animals and smoke for every period: who is where, doing what. The
// figures move (people.js); main.js sets how many are out at each hour.
import * as THREE from 'three';
import { terrainY, rng, insidePolygon, LATE_POLY } from './terrain.js';
import { CUBIT, LEVEL, BASE_Y, PALACE_PAD, ROADS } from './data.js';
import { toWorld } from './ezekiel.js';
import { Crowd, Path, smoothPts, figureKit, ACT, PROP } from './people.js';
export { focus } from './people.js';

const { outer: O, inner: I, house: H } = LEVEL;
const S = (u, y, v) => new THREE.Vector3(u * CUBIT, BASE_Y + y * CUBIT, v * CUBIT);   // Solomon frame
const EZ_U = 125;                                                                    // Ezekiel's centre in that frame

// Clothing: linen, undyed wool in many shades, and the rarer dyed cloth
// (madder red, indigo, ochre, purple). Written as display colours, converted
// to the renderer's linear colours.
const lin = (c) => c.map((v) => Math.pow(v, 2.2));
const LINEN = lin([0.9, 0.88, 0.82]);
const WOOL = [[0.8, 0.74, 0.62], [0.66, 0.57, 0.45], [0.52, 0.42, 0.31], [0.72, 0.7, 0.66], [0.4, 0.33, 0.26], [0.86, 0.81, 0.7], [0.6, 0.5, 0.38]].map(lin);
const DYED = [[0.62, 0.2, 0.14], [0.24, 0.3, 0.52], [0.74, 0.56, 0.26], [0.44, 0.2, 0.38]].map(lin);
const SKIN = [[0.64, 0.47, 0.35], [0.58, 0.41, 0.29], [0.7, 0.53, 0.4], [0.5, 0.35, 0.24], [0.66, 0.49, 0.36]].map(lin);
const HAIR = [[0.1, 0.07, 0.05], [0.16, 0.11, 0.07], [0.24, 0.16, 0.1]].map(lin);
const GREY = lin([0.62, 0.6, 0.57]);
const BRONZE = lin([0.66, 0.46, 0.24]);

// --- Smoke ---------------------------------------------------------------------------
function smokeTexture() {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 64;
  const g = cnv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cnv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let SMOKE_TEX = null;

function smoke(points, { big = false, rand }) {
  SMOKE_TEX ||= smokeTexture();
  const group = new THREE.Group();
  const n = big ? 14 : 6;
  for (const base of points) {
    if (!base) continue;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: SMOKE_TEX, color: big ? 0xcfc8bd : 0xd9d3c8, transparent: true, depthWrite: false, opacity: 0 });
      const sp = new THREE.Sprite(mat);
      sp.userData = { base: base.clone(), phase: i / n + rand() * 0.05, big };
      group.add(sp);
    }
  }
  group.userData.update = (t) => {
    for (const sp of group.children) {
      const { base, phase, big: b } = sp.userData;
      const u = (t * (b ? 0.045 : 0.06) + phase) % 1;
      const h = b ? 30 : 9;
      sp.position.set(base.x + u * h * 0.45, base.y + u * h, base.z + u * h * 0.2);
      sp.scale.setScalar((b ? 2.6 : 0.9) * (1 + u * 3.4));
      sp.material.opacity = (b ? 0.42 : 0.3) * Math.sin(Math.PI * Math.min(1, u * 1.3));
    }
  };
  return group;
}

// --- Paths through the lanes --------------------------------------------------------------
// Random walks along the street and lane cells of the city layout, kept
// mostly straight, rounded off, with heights from the ground.
function lanePaths(grid, rand, count, steps) {
  const { occ, W, D, bb, cell } = grid;
  const cells = [];
  for (let k = 0; k < occ.length; k++) if (occ[k] === 2 || occ[k] === 3) cells.push(k);
  if (!cells.length) return [];
  const ok = (i, j) => i >= 0 && j >= 0 && i < W && j < D && (occ[j * W + i] === 2 || occ[j * W + i] === 3);
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const paths = [];
  for (let n = 0; n < count * 6 && paths.length < count; n++) {
    const k = cells[Math.floor(rand() * cells.length)];
    let i = k % W, j = Math.floor(k / W), d = Math.floor(rand() * 8);
    const pts = [[bb.x0 + (i + 0.5) * cell, bb.z0 + (j + 0.5) * cell]];
    for (let st = 0; st < steps; st++) {
      const turn = rand() < 0.5 ? 1 : -1;
      const order = rand() < 0.9 ? [0, turn, -turn, 2 * turn, -2 * turn] : [turn, 0, -turn, 2 * turn, -2 * turn];
      let moved = false;
      for (const o of order) {
        const nd = (d + o + 8) % 8, [di, dj] = DIRS[nd];
        if (!ok(i + di, j + dj) || (di && dj && !(ok(i + di, j) && ok(i, j + dj)))) continue;
        i += di; j += dj; d = nd; moved = true;
        break;
      }
      if (!moved) break;
      pts.push([bb.x0 + (i + 0.5) * cell, bb.z0 + (j + 0.5) * cell]);
    }
    if (pts.length < 14) continue;
    const thin = pts.filter((_, q) => q % 2 === 0 || q === pts.length - 1);
    paths.push(new Path(smoothPts(thin).map(([x, z]) => [x, grid.at(x, z), z])));
  }
  return paths;
}

const line = (pts) => new Path(pts.map((p) => [p.x, p.y, p.z]));

export function buildLife(mats, ctx) {
  const kit = figureKit(ctx.quality);
  const rand = rng(2024);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const few = ctx.quality === 'low' ? 0.5 : 1;
  const N = (n) => Math.max(1, Math.round(n * few));

  // One person, dressed for their place in life.
  const person = (kind, o = {}) => {
    const old = rand() < 0.15;
    const base = {
      kind, skin: pick(SKIN), hair: old ? GREY : pick(HAIR), phase: rand() * 6.28,
      speed: 1.05 + rand() * 0.4, lateral: (rand() - 0.5) * 1.4,
    };
    if (kind === 'man') Object.assign(base, { cloth: pick(WOOL), mantle: rand() < 0.15 ? pick(DYED) : pick(WOOL), face: old ? 2 : pick([0, 1, 6, 7]), prop: rand() < 0.12 ? PROP.staff : PROP.none });
    if (kind === 'woman') Object.assign(base, { cloth: rand() < 0.2 ? pick(DYED) : pick(WOOL), mantle: rand() < 0.25 ? pick(DYED) : pick(WOOL), face: old ? 4 : 3, scale: 0.94 + rand() * 0.04 });
    if (kind === 'priest') Object.assign(base, { cloth: LINEN, mantle: pick(DYED.slice(0, 2)), face: pick([1, 6, 2]), speed: 0.9 + rand() * 0.3 });
    if (kind === 'worker') Object.assign(base, { cloth: pick(WOOL), mantle: pick(WOOL), face: pick([0, 7, 6]) });
    if (kind === 'soldier') Object.assign(base, { cloth: pick([[0.45, 0.18, 0.1], [0.5, 0.42, 0.3]]), mantle: pick(WOOL), face: pick([0, 7]), prop: PROP.arms });
    if (kind === 'child') Object.assign(base, { cloth: pick(WOOL), mantle: pick(WOOL), face: 5, scale: 0.6 + rand() * 0.14, speed: 1.2 + rand() * 0.5 });
    if (kind !== 'child') base.scale = (base.scale || 1) * (0.96 + rand() * 0.08);
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    return { ...base, ...o };
  };
  const beast = (type, o = {}) => {
    const T = {
      sheep: { cloth: lin([0.86, 0.82, 0.72]), mantle: lin([0.45, 0.38, 0.33]), scale: 0.72 },
      goat: { cloth: rand() < 0.7 ? lin([0.16, 0.14, 0.12]) : lin([0.5, 0.38, 0.26]), mantle: lin([0.12, 0.1, 0.09]), scale: 0.68 },
      donkey: { cloth: lin([0.6, 0.56, 0.52]), mantle: lin([0.84, 0.82, 0.78]), scale: 1.25 },
      ox: { cloth: lin([0.56, 0.42, 0.3]), mantle: lin([0.36, 0.27, 0.2]), scale: 1.62 },
      jackal: { cloth: lin([0.72, 0.6, 0.42]), mantle: lin([0.3, 0.24, 0.18]), scale: 0.6 },
    }[type];
    return { kind: 'beast', ...T, skin: T.mantle, hair: T.mantle, phase: rand() * 6.28, speed: type === 'jackal' ? 0.9 : 0.35, ...o };
  };
  const groups = {};
  const crowds = {};
  const make = (name) => (crowds[name] = new Crowd(name));
  const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

  // --- Ezekiel's temple (solid) ------------------------------------------------------
  // The people come in by the north gate and go out by the south, or the
  // reverse (46:9); priests in linen in the inner court (44:17); Levites at the
  // tables by the north gate (40:39–43); the prince in the east gate (44:3).
  {
    const c = make('ezFolk');
    const ezHouse = toWorld(-95, 0, 0);
    const loop = line([toWorld(0, O, -196), toWorld(60, O, -178), toWorld(118, O, -140), toWorld(118, O, 140), toWorld(60, O, 178), toWorld(0, O, 196)]);
    for (let i = 0; i < N(70); i++) {
      c.add(person(rand() < 0.5 ? 'man' : rand() < 0.85 ? 'woman' : 'child', { path: loop, s: rand() * loop.length, dir: rand() < 0.5 ? 1 : -1, pause: [0, 3], lateral: (rand() - 0.5) * 9 }));
    }
    const outerOK = (u, v) => !(u >= -153 && u <= 112 && Math.abs(v) <= 112) && !(Math.abs(v) >= 221 || u >= 196) && !(u < -165);
    for (let i = 0, k = 0; i < N(70) && k < 4000; k++) {
      const u = -240 + rand() * 480, v = -240 + rand() * 480;
      if (!outerOK(u, v)) continue;
      const p = toWorld(u, O, v);
      c.add(person(rand() < 0.55 ? 'man' : 'woman', { ...p, yaw: facing(p, ezHouse) + (rand() - 0.5) * 0.6, act: rand() < 0.3 ? ACT.pray : rand() < 0.5 ? ACT.talk : ACT.idle }));
      i++;
    }
    const priestPath = line([toWorld(18, I, -12), toWorld(26, I, -34)]);
    const priestPath2 = line([toWorld(-40, I, 10), toWorld(14, I, 14)]);
    for (let i = 0; i < N(16); i++) c.add(person('priest', { path: i % 2 ? priestPath : priestPath2, s: rand() * 20, dir: rand() < 0.5 ? 1 : -1, pause: [2, 9], lateral: (rand() - 0.5) * 3, always: rand() < 0.4 }));
    for (let i = 0; i < N(10); i++) {
      const p = toWorld((rand() - 0.5) * 40, I, (rand() - 0.5) * 30);
      if (Math.abs(p.x - toWorld(0, 0, 0).x) < 6 && Math.abs(p.z) < 6) continue;
      c.add(person('priest', { ...p, yaw: facing(p, ezHouse), act: rand() < 0.4 ? ACT.pray : ACT.idle }));
    }
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const p = toWorld(s * (16 + i * 4), O, -106);
      c.add(person('worker', { ...p, yaw: s * Math.PI / 2, act: ACT.work, cloth: LINEN }));
    }
    c.add(person('man', { ...toWorld(206, O, 0), yaw: -Math.PI / 2, mantle: DYED[0], cloth: DYED[1], always: true }));
    groups.ezFolk = c.build(kit).group;
  }
  // The man "whose appearance was like bronze" measuring in the east gate,
  // Ezekiel following him (40:3–6).
  {
    const c = make('ezSpecial');
    const gate = line([toWorld(246, O, -2.5), toWorld(204, O, -2.5)]);
    const man = c.add(person('man', { cloth: BRONZE, mantle: BRONZE, skin: BRONZE, hair: BRONZE, face: 1, prop: PROP.staff, path: gate, s: 8, speed: 0.55, pause: [3, 7], always: true, lateral: 0 }));
    c.add(person('man', { kind: 'man', follow: man, gap: 1.6, lateral: 1.3, cloth: WOOL[1], mantle: WOOL[3], face: 6, always: true }));
    groups.ezSpecial = c.build(kit).group;
  }

  // --- Solomon's temple ------------------------------------------------------------------
  // Priests between altar, Sea and stands; Levite singers east of the altar
  // (2 Chr 5:12); worshippers in the great court; officials and guards at
  // the palace.
  const soHouse = S(20, 0, 0);
  for (const v of ['early', 'late']) {
    const c = make(v === 'early' ? 'soFolkEarly' : 'soFolkLate');
    const altarU = v === 'early' ? 118 : 136;
    const routes = [line([S(altarU - 10, I, 14), S(70, I, 30)]), line([S(altarU - 10, I, -14), S(92, I, -14)]), line([S(48, I, 30), S(4, I, 30)])];
    for (let i = 0; i < N(18); i++) c.add(person('priest', { path: routes[i % 3], s: rand() * 30, dir: rand() < 0.5 ? 1 : -1, pause: [2, 10], lateral: (rand() - 0.5) * 3, always: rand() < 0.3 }));
    for (let i = 0; i < N(12); i++) {
      const p = v === 'early' ? S(136 + rand() * 16, I, -16 + rand() * 32) : S(100 + rand() * 20, I, 20 + rand() * 22);
      c.add(person('priest', { ...p, yaw: facing(p, S(altarU, 0, 0)), act: rand() < 0.5 ? ACT.pray : ACT.idle, mantle: DYED[1] }));
    }
    groups[v === 'early' ? 'soFolkEarly' : 'soFolkLate'] = c.build(kit).group;
  }
  const courtFolk = (name, gates, box, n) => {
    const c = make(name);
    const target = () => S(172 + rand() * 10, O, (rand() - 0.5) * 70);
    for (let i = 0; i < N(n * 0.45); i++) {
      const g = pick(gates);
      c.add(person(rand() < 0.5 ? 'man' : rand() < 0.85 ? 'woman' : 'child', {
        path: line([S(g[0], O, g[1] + (rand() - 0.5) * 8), target()]), s: rand() * 100, dir: rand() < 0.5 ? 1 : -1, pause: [4, 20], lateral: (rand() - 0.5) * 2,
        restAct: rand() < 0.5 ? ACT.pray : ACT.idle,
      }));
    }
    for (let i = 0, k = 0; i < N(n * 0.55) && k < 4000; k++) {
      const u = box[0] + rand() * (box[1] - box[0]), v = box[2] + rand() * (box[3] - box[2]);
      if (u >= -44 && u <= 172 && Math.abs(v) <= 54) continue;
      const p = S(u, O, v);
      c.add(person(rand() < 0.55 ? 'man' : 'woman', { ...p, yaw: facing(p, soHouse) + (rand() - 0.5) * 0.7, act: rand() < 0.25 ? ACT.pray : rand() < 0.55 ? ACT.talk : ACT.idle }));
      i++;
    }
    return c.build(kit).group;
  };
  groups.soCourtLate = courtFolk('soCourtLate', [[362, 0], [EZ_U, 236]], [-115, 365, -240, 240], 150);
  groups.soCourtEarly = courtFolk('soCourtEarly', [[222, 0], [EZ_U, 244]], [-75, 225, -122, 248], 80);
  {
    const c = make('soPalace');
    const py = PALACE_PAD.y;
    const P = (u, v) => new THREE.Vector3(u * CUBIT, py, v * CUBIT);
    const routes = [line([P(EZ_U, 330), P(80, 430), P(80, 520)]), line([P(120, 490), P(165, 420)]), line([P(60, 330), P(60, 430)])];
    for (let i = 0; i < N(22); i++) c.add(person(rand() < 0.75 ? 'man' : 'woman', { path: routes[i % 3], s: rand() * 60, dir: rand() < 0.5 ? 1 : -1, pause: [3, 12], lateral: (rand() - 0.5) * 4, mantle: rand() < 0.35 ? pick(DYED) : pick(WOOL) }));
    for (const s of [-1, 1]) c.add(person('soldier', { ...P(EZ_U + s * 9, 326), yaw: 0, always: true }));
    for (const s of [-1, 1]) c.add(person('soldier', { ...P(80 + s * 8, 616), yaw: 0, always: true }));
    groups.soPalace = c.build(kit).group;
  }

  // --- The city --------------------------------------------------------------------------
  // Walking the lanes (women often with a jar on the head), children, elders
  // and traders at the gates (Prov 31:23; 2 Kgs 7:1), women grinding and
  // baking at their doors, guards at the gates.
  const town = (name, grid, n, houses, gates, torches) => {
    const c = make(name);
    const paths = lanePaths(grid, rand, Math.round(n * 1.4), 90);
    c.setPathPool(paths);
    // Half spread over the city; half "local", gathering wherever you look.
    for (let i = 0; i < N(n) && paths.length; i++) {
      const path = paths[Math.floor(rand() * paths.length)];
      const r = rand();
      const kind = r < 0.42 ? 'man' : r < 0.82 ? 'woman' : r < 0.94 ? 'child' : 'worker';
      const o = { path, s: rand() * path.length, dir: rand() < 0.5 ? 1 : -1, pause: [1, 9], lateral: (rand() - 0.5) * 1.2, local: i % 2 === 0 };
      if (kind === 'woman' && rand() < 0.35) Object.assign(o, { act: ACT.carry, prop: PROP.jar });
      else if (kind === 'woman' && rand() < 0.2) o.prop = PROP.basket;
      if (kind === 'worker' && rand() < 0.5) o.prop = PROP.basket;
      c.add(person(kind, o));
    }
    for (const [gx, gz] of gates) for (let i = 0; i < 6; i++) {
      const x = gx + (rand() - 0.5) * 12, z = gz + (rand() - 0.5) * 12;
      c.add(person(i < 4 ? 'man' : 'woman', { x, y: grid.at(x, z), z, yaw: rand() * 6.28, act: i < 3 ? ACT.talk : ACT.idle, hair: i < 2 ? GREY : undefined, face: i < 2 ? 2 : undefined }));
    }
    for (const h of houses.filter((_, i) => i % Math.max(1, Math.round(houses.length / N(40))) === 0)) {
      const off = h.d / 2 + 0.9;
      const x = h.x + Math.sin(h.rot) * off, z = h.z + Math.cos(h.rot) * off;
      c.add(person('woman', { x, y: grid.at(x, z), z, yaw: h.rot + Math.PI, act: ACT.work }));
    }
    // Guards stand a little off the wall, by the torches.
    for (let i = 0; i < torches.length; i += 1) {
      const t = torches[i], next = torches[i ^ 1];
      const x = t.x + (t.x - next.x) * 0.15, z = t.z + (t.z - next.z) * 0.15;
      c.add(person('soldier', { x, y: grid.at(x, z), z, yaw: rand() * 6.28, always: true }));
    }
    return c.build(kit).group;
  };
  groups.townLate = town('townLate', ctx.grids.late, 560, ctx.houses.late, ctx.gates.late, ctx.night.late.torches);
  groups.townEarly = town('townEarly', ctx.grids.early, 220, ctx.houses.early, ctx.gates.early, ctx.night.early.torches);

  // --- The countryside ------------------------------------------------------------------
  // Farmers in the fields, ploughing teams, oxen threshing, travellers with
  // donkeys on the roads.
  const country = (name, period) => {
    const c = make(name);
    const fields = ctx.plan.fields.filter((f) => period === 'early' || !insidePolygon(f.x, f.z, LATE_POLY));
    const Y = (x, z) => terrainY(x, z, 'square');
    for (let i = 0; i < N(30); i++) {
      const f = pick(fields);
      const x = f.x + (rand() - 0.5) * f.w * 0.6, z = f.z + (rand() - 0.5) * f.d * 0.6;
      c.add(person(rand() < 0.75 ? 'worker' : 'woman', { x, y: Y(x, z), z, yaw: f.ang + (rand() < 0.5 ? 0 : Math.PI), act: ACT.work }));
    }
    for (const f of fields.filter((ff) => ff.kind === 0).slice(0, N(8))) {
      const ax = Math.cos(f.ang), az = Math.sin(f.ang), L = f.w * 0.42;
      const pts = [];
      for (let k = 0; k <= 8; k++) { const t = -L + (2 * L * k) / 8; pts.push([f.x + ax * t, Y(f.x + ax * t, f.z + az * t), f.z + az * t]); }
      const plough = c.add(person('worker', { path: new Path(pts), s: rand() * L, speed: 0.55, pause: [1.5, 3], lateral: 0 }));
      for (const s of [-0.65, 0.65]) c.add(beast('ox', { follow: plough, gap: -2.6, lateral: s }));
    }
    for (const fl of ctx.plan.floors.filter((t) => period === 'early' || !insidePolygon(t.x, t.z, LATE_POLY))) {
      const ring = [];
      for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2, r = fl.r - 1.6; ring.push([fl.x + Math.cos(a) * r, Y(fl.x, fl.z) + 0.1, fl.z + Math.sin(a) * r]); }
      c.add(beast('ox', { path: new Path(ring), loop: true, s: rand() * 30, speed: 0.5, pause: [0, 0], lateral: 0 }));
      for (let k = 0; k < 2; k++) {
        const a = rand() * 6.28, x = fl.x + Math.cos(a) * (fl.r + 1), z = fl.z + Math.sin(a) * (fl.r + 1);
        c.add(person('worker', { x, y: Y(x, z), z, yaw: a + Math.PI, act: ACT.work, prop: PROP.staff }));
      }
    }
    for (const road of ROADS.filter((r) => r.periods.includes(period))) {
      const pts = [];
      let acc = 0;
      for (let k = 0; k < road.pts.length - 1 && acc < 1600; k++) {
        const [ax, az] = road.pts[k], [bx, bz] = road.pts[k + 1];
        const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 6);
        for (let q = 0; q < n && acc < 1600; q++) {
          const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n;
          pts.push([x, Y(x, z), z]);
          acc += Math.hypot(bx - ax, bz - az) / n;
        }
      }
      if (pts.length < 2) continue;
      const path = new Path(pts);
      for (let i = 0; i < N(7); i++) {
        const t = c.add(person(rand() < 0.7 ? 'man' : 'woman', { path, s: rand() * path.length, dir: rand() < 0.5 ? 1 : -1, pause: [5, 30], lateral: (rand() < 0.5 ? -1 : 1) * 1.1, prop: rand() < 0.4 ? PROP.staff : PROP.none }));
        if (rand() < 0.55) c.add(beast('donkey', { follow: t, gap: 2.1, lateral: 0 }));
      }
    }
    return c.build(kit).group;
  };
  groups.countryEarly = country('countryEarly', 'early');
  groups.countryLate = country('countryLate', 'late');
  // 573 BC: "some of the poorest of the land" left as vinedressers and
  // ploughmen (2 Kgs 25:12; Jer 39:10).
  {
    const c = make('countryRuin');
    const fields = ctx.plan.fields.filter((f) => !insidePolygon(f.x, f.z, LATE_POLY));
    for (let i = 0; i < N(14); i++) {
      const f = fields[Math.floor(rand() * fields.length)];
      const x = f.x + (rand() - 0.5) * f.w * 0.5, z = f.z + (rand() - 0.5) * f.d * 0.5;
      c.add(person(rand() < 0.7 ? 'worker' : 'woman', { x, y: terrainY(x, z, 'square'), z, yaw: rand() * 6.28, act: ACT.work, cloth: pick(WOOL.slice(1)) }));
    }
    groups.countryRuin = c.build(kit).group;
  }

  // --- Flocks ------------------------------------------------------------------------------
  // Sheep and black goats grazing with their shepherds, in every period
  // (Lev 3:9; Song 4:1).
  {
    const c = make('flocks');
    const centres = ctx.plan.folds.map((f) => [f.x + 22, f.z + 10]);
    for (let i = 0; i < 4; i++) centres.push([1050 + rand() * 350, -500 + rand() * 1400]);
    const Y = (x, z) => terrainY(x, z, 'square');
    for (const [cx, cz] of centres) {
      const n = N(16 + Math.floor(rand() * 9));
      for (let i = 0; i < n; i++) {
        const r = Math.sqrt(rand()) * 16, a = rand() * 6.28;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        c.add(beast(rand() < 0.32 ? 'goat' : 'sheep', { x, y: Y(x, z), z, yaw: rand() * 6.28, act: ACT.graze, always: true, wander: { x: cx, z: cz, r: 20, y: Y, pause: [3, 14] } }));
      }
      const x = cx + 18, z = cz;
      c.add(person('man', { x, y: Y(x, z), z, yaw: rand() * 6.28, prop: PROP.staff, always: true }));
    }
    groups.flocks = c.build(kit).group;
  }

  // --- 573 BC: "Mount Zion, which lies desolate; jackals prowl over it" (Lam 5:18).
  {
    const c = make('ruinLife');
    const Y = () => BASE_Y + O * CUBIT;
    for (const [u, v] of [[230, -60], [238, -52], [200, 120], [-90, -150]]) {
      const p = S(u, O, v);
      c.add(beast('jackal', { ...p, always: true, wander: { x: p.x, z: p.z, r: 40, y: Y, pause: [2, 9], rest: ACT.idle } }));
    }
    groups.ruinLife = c.build(kit).group;
    groups.ruinLife.traverse((o) => { if (o.isInstancedMesh) o.userData.infoId = 'city-jackal'; });
  }

  // Smoke from the altars (Isa 6:4), the temple kitchens and household fires.
  groups.smokeEz = smoke([ctx.ezAltar], { big: true, rand });
  groups.smokeEzKitchens = smoke(ctx.ezHearths.filter((_, i) => i % 4 === 0), { rand });
  groups.smokeSo = smoke([ctx.soAltar], { big: true, rand });
  groups.smokeSoLate = smoke([ctx.soAltarLate], { big: true, rand });
  groups.smokeLate = smoke(ctx.smoke.late, { rand });
  groups.smokeEarly = smoke(ctx.smoke.early, { rand });

  return { groups, crowds, label: { label: 'The man with the measuring reed (40:3)', pos: toWorld(225, O + 6, -3) } };
}
