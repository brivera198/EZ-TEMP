// People, animals and smoke for every period: who is where, doing what. The
// figures move (people.js); main.js sets how many are out at each hour.
import * as THREE from 'three';
import { terrainY, rng, insidePolygon, LATE_POLY } from './terrain.js';
import { CUBIT, LEVEL, BASE_Y, PALACE_PAD, ROADS } from './data.js';
import { toWorld } from './ezekiel.js';
import { Crowd, Path, smoothPts, figureKit, ACT, PROP, FACE, FACE_BEARD, SLOT, look } from './people.js';
export { focus } from './people.js';

const { outer: O, inner: I, house: H } = LEVEL;
const S = (u, y, v) => new THREE.Vector3(u * CUBIT, BASE_Y + y * CUBIT, v * CUBIT);   // Solomon frame
const EZ_U = 125;                                                                    // Ezekiel's centre in that frame

// Clothing: linen, undyed wool in many shades, and the rarer dyed cloth
// (madder red, indigo, ochre, purple). Written as display colours, converted
// to the renderer's linear colours.
export const lin = (c) => c.map((v) => Math.pow(v, 2.2));
export const LINEN = lin([0.9, 0.88, 0.82]);
export const WOOL = [[0.8, 0.74, 0.62], [0.66, 0.57, 0.45], [0.52, 0.42, 0.31], [0.72, 0.7, 0.66], [0.4, 0.33, 0.26], [0.86, 0.81, 0.7], [0.6, 0.5, 0.38]].map(lin);
export const DYED = [[0.62, 0.2, 0.14], [0.24, 0.3, 0.52], [0.74, 0.56, 0.26], [0.44, 0.2, 0.38]].map(lin);
const SKIN = [[0.64, 0.47, 0.35], [0.58, 0.41, 0.29], [0.7, 0.53, 0.4], [0.5, 0.35, 0.24], [0.66, 0.49, 0.36]].map(lin);
const HAIR = [[0.1, 0.07, 0.05], [0.16, 0.11, 0.07], [0.24, 0.16, 0.1]].map(lin);
export const GREY = lin([0.62, 0.6, 0.57]);
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
export function lanePaths(grid, rand, count, steps, minPts = 14) {
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
    if (pts.length < minPts) continue;
    const thin = pts.filter((_, q) => q % 2 === 0 || q === pts.length - 1);
    paths.push(new Path(smoothPts(thin).map(([x, z]) => [x, grid.at(x, z), z])));
  }
  return paths;
}

const line = (pts) => new Path(pts.map((p) => [p.x, p.y, p.z]));

// Dressing people and beasts. Shared with trades.js, so the whole city is
// clothed alike: build, height, head-cloth or cap, beard to go with the
// face, mantle over both shoulders or one, sandals or bare feet, girdle or
// sash, now and then a striped or banded mantle.
export function folk(rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const wpick = (opts) => { let r = rand() * opts.reduce((a, [, w]) => a + w, 0); for (const [v, w] of opts) if ((r -= w) <= 0) return v; return opts[0][0]; };
  const person = (kind, o = {}) => {
    const old = o.old ?? rand() < 0.15;
    const base = {
      kind, skin: pick(SKIN), hair: old ? GREY : pick(HAIR), phase: rand() * 6.28,
      speed: (old ? 0.75 : 1.05) + rand() * 0.4, lateral: (rand() - 0.5) * 1.4,
      tall: 0.95 + rand() * 0.1, build: 0.88 + rand() * 0.3 + (old ? 0.06 : 0),
    };
    const v = { head: 0, mantle: 0, feet: rand() < 0.3 ? 1 : 0, belt: rand() < 0.35 ? 1 : 0 };
    let pat = 0;
    if (kind === 'man') {
      Object.assign(base, { cloth: pick(WOOL), mantle: rand() < 0.15 ? pick(DYED) : pick(WOOL), face: old ? pick(FACE.elder) : pick(FACE.man), prop: rand() < 0.12 ? PROP.staff : PROP.none });
      v.head = wpick([[0, 0.45], [1, 0.22], [2, 0.18], [3, 0.15]]);
      v.mantle = wpick([[1, 0.5], [2, 0.25], [0, 0.25]]);
      if (rand() < 0.3) pat = 1 + Math.floor(rand() * 3);
      if (old) Object.assign(base, { stoop: 0.12 + rand() * 0.2, prop: rand() < 0.7 ? PROP.staff : PROP.none });
    }
    if (kind === 'woman') {
      Object.assign(base, { cloth: rand() < 0.2 ? pick(DYED) : pick(WOOL), mantle: rand() < 0.25 ? pick(DYED) : pick(WOOL), face: old ? pick(FACE.oldWoman) : pick(FACE.woman), tall: 0.9 + rand() * 0.08 });
      v.head = wpick([[0, 0.45], [1, 0.35], [2, 0.2]]);
      v.belt = rand() < 0.8 ? 0 : 1;
      if (rand() < 0.2) pat = 1 + Math.floor(rand() * 3);
      if (old) Object.assign(base, { stoop: 0.1 + rand() * 0.2 });
    }
    if (kind === 'priest') Object.assign(base, { cloth: LINEN, mantle: pick(DYED.slice(0, 2)), face: pick(FACE.priest), speed: 0.9 + rand() * 0.3 });
    if (kind === 'worker') {
      Object.assign(base, { cloth: pick(WOOL), mantle: pick(WOOL), face: pick(FACE.worker), build: 0.95 + rand() * 0.25 });
      v.head = wpick([[0, 0.4], [1, 0.3], [2, 0.3]]);
      v.feet = rand() < 0.45 ? 1 : 0;
    }
    if (kind === 'soldier') Object.assign(base, { cloth: pick([[0.45, 0.18, 0.1], [0.5, 0.42, 0.3]]), mantle: pick(WOOL), face: pick(FACE.soldier), prop: PROP.arms, build: 1 + rand() * 0.15 });
    if (kind === 'child') {
      const girl = rand() < 0.5;
      Object.assign(base, { cloth: pick(WOOL), mantle: rand() < 0.3 ? pick(DYED) : pick(WOOL), face: girl ? 14 : 5, scale: 0.55 + rand() * 0.2, speed: 1.2 + rand() * 0.5, tall: 1, build: 0.9 + rand() * 0.15 });
      v.head = girl && rand() < 0.6 ? 1 : 0;
      v.feet = rand() < 0.6 ? 1 : 0;
    }
    if (kind !== 'child') base.scale = (base.scale || 1) * (0.97 + rand() * 0.06);
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    const out = { ...base, pat, ...o };
    v.beard = FACE_BEARD[out.face] ?? 0;
    if (out.look === undefined) out.look = look(v);
    return out;
  };
  const beast = (type, o = {}) => {
    const T = {
      sheep: { cloth: lin([0.86, 0.82, 0.72]), mantle: lin([0.45, 0.38, 0.33]), scale: 0.72, pat: 1 },
      goat: { cloth: rand() < 0.7 ? lin([0.16, 0.14, 0.12]) : lin([0.5, 0.38, 0.26]), mantle: lin([0.12, 0.1, 0.09]), scale: 0.68 },
      donkey: { cloth: lin([0.6, 0.56, 0.52]), mantle: lin([0.84, 0.82, 0.78]), scale: 1.25 },
      ox: { cloth: lin([0.56, 0.42, 0.3]), mantle: lin([0.36, 0.27, 0.2]), scale: 1.62 },
      jackal: { cloth: lin([0.72, 0.6, 0.42]), mantle: lin([0.3, 0.24, 0.18]), scale: 0.6 },
      camel: { kind: 'camel', cloth: lin([0.7, 0.56, 0.38]), mantle: lin([0.5, 0.38, 0.26]), scale: 1.25 },
      horse: { kind: 'horse', cloth: pick([lin([0.42, 0.26, 0.15]), lin([0.3, 0.2, 0.13]), lin([0.62, 0.55, 0.48])]), mantle: lin([0.12, 0.09, 0.07]), scale: 1.05 },
    }[type];
    return { kind: 'beast', ...T, skin: T.mantle, hair: T.mantle, phase: rand() * 6.28, speed: type === 'jackal' ? 0.9 : 0.35, ...o };
  };
  return { person, beast, pick, wpick };
}

export function buildLife(mats, ctx) {
  const kit = figureKit(ctx.quality);
  const rand = rng(2024);
  const { person, beast, pick } = folk(rand);
  const few = ctx.quality === 'low' ? 0.5 : 1;
  const N = (n) => Math.max(1, Math.round(n * few));

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
  // Walking the lanes: women with a jar on the head or spinning as they go,
  // men with a sack on the shoulder or wood on the back, elders with a
  // staff, children running. Elders and traders at the gates (Prov 31:23;
  // 2 Kgs 7:1), guards at the gates. Work at the doors is in trades.js.
  const town = (name, grid, n, gates, torches) => {
    const c = make(name);
    const paths = lanePaths(grid, rand, Math.round(n * 1.4), 90);
    c.setPathPool(paths);
    // Half spread over the city; half "local", gathering wherever you look.
    for (let i = 0; i < N(n) && paths.length; i++) {
      const path = paths[Math.floor(rand() * paths.length)];
      const r = rand();
      const kind = r < 0.42 ? 'man' : r < 0.82 ? 'woman' : r < 0.94 ? 'child' : 'worker';
      const o = { path, s: rand() * path.length, dir: rand() < 0.5 ? 1 : -1, pause: [1, 9], lateral: (rand() - 0.5) * 1.2, local: i % 2 === 0 };
      const q = rand();
      if (kind === 'woman') {
        if (q < 0.32) Object.assign(o, { act: ACT.carry, prop: PROP.jar });
        else if (q < 0.44) o.prop = PROP.basket;
        else if (q < 0.5) o.prop = PROP.spindle;
        else if (q < 0.56) Object.assign(o, { act: ACT.backload, prop: PROP.bundle, speed: 0.9 });
        else if (q < 0.6) Object.assign(o, { prop: PROP.tray, act: ACT.carry });
      } else if (kind === 'man') {
        if (q < 0.1) Object.assign(o, { act: ACT.shoulder, prop: PROP.sack });
        else if (q < 0.16) Object.assign(o, { act: ACT.backload, prop: PROP.bundle, speed: 0.9 });
        else if (q < 0.26) Object.assign(o, { old: true, act: ACT.hobble, prop: PROP.staff, speed: 0.55 + rand() * 0.2 });
      } else if (kind === 'child') {
        if (q < 0.4) Object.assign(o, { act: ACT.run, speed: 2.4 + rand() * 1.2, pause: [0.5, 3] });
      } else if (q < 0.5) o.prop = PROP.basket;
      else if (q < 0.8) Object.assign(o, { act: ACT.shoulder, prop: PROP.sack });
      c.add(person(kind, o));
    }
    for (const [gx, gz] of gates) for (let i = 0; i < 6; i++) {
      const x = gx + (rand() - 0.5) * 12, z = gz + (rand() - 0.5) * 12;
      c.add(person(i < 4 ? 'man' : 'woman', { x, y: grid.at(x, z), z, yaw: rand() * 6.28, act: i < 3 ? ACT.talk : i === 5 ? ACT.sit : ACT.idle, old: i < 2 }));
    }
    // Guards stand a little off the wall, by the torches.
    for (let i = 0; i < torches.length; i += 1) {
      const t = torches[i], next = torches[i ^ 1];
      const x = t.x + (t.x - next.x) * 0.15, z = t.z + (t.z - next.z) * 0.15;
      c.add(person('soldier', { x, y: grid.at(x, z), z, yaw: rand() * 6.28, always: true }));
    }
    return c.build(kit).group;
  };
  groups.townLate = town('townLate', ctx.grids.late, 560, ctx.gates.late, ctx.night.late.torches);
  groups.townEarly = town('townEarly', ctx.grids.early, 220, ctx.gates.early, ctx.night.early.torches);

  // --- The countryside ------------------------------------------------------------------
  // Hoeing and reaping in the fields, ploughing teams with the ard, oxen
  // drawing the threshing sledge with the driver standing on it (Isa 41:15),
  // winnowing in the afternoon wind, travellers on the roads, some riding
  // donkeys, others leading them laden with panniers.
  const ARD = look({ load: 3 }), PANNIERS = look({ load: 1 }), SADDLE = look({ load: 2 }), SLEDGE = look({ gear: 1 });
  const ploughTeam = (c, f, Y, o = {}) => {
    const ax = Math.cos(f.ang), az = Math.sin(f.ang), L = f.w * 0.42;
    const pts = [];
    for (let k = 0; k <= 8; k++) { const t = -L + (2 * L * k) / 8; pts.push([f.x + ax * t, Y(f.x + ax * t, f.z + az * t), f.z + az * t]); }
    const plough = c.add(person('worker', { path: new Path(pts), s: rand() * L, speed: 0.55, pause: [1.5, 3], lateral: 0, act: ACT.plough, prop: PROP.staff, ...o }));
    c.add(beast('ox', { follow: plough, gap: -2.6, lateral: 0.65, look: ARD }));
    c.add(beast('ox', { follow: plough, gap: -2.6, lateral: -0.65 }));
  };
  const country = (name, period) => {
    const c = make(name);
    const fields = ctx.plan.fields.filter((f) => period === 'early' || !insidePolygon(f.x, f.z, LATE_POLY));
    const Y = (x, z) => terrainY(x, z, 'square');
    for (let i = 0; i < N(30); i++) {
      const f = pick(fields);
      const x = f.x + (rand() - 0.5) * f.w * 0.6, z = f.z + (rand() - 0.5) * f.d * 0.6;
      const reap = f.kind === 1;
      c.add(person(rand() < 0.75 ? 'worker' : 'woman', {
        x, y: Y(x, z), z, yaw: f.ang + (rand() < 0.5 ? 0 : Math.PI),
        act: reap ? ACT.reap : ACT.work, prop: reap ? PROP.sickle : PROP.none,
        cycle: reap ? [[ACT.reap, 25], [ACT.bind, 8], [ACT.idle, 4]] : [[ACT.work, 30], [ACT.idle, 5]],
      }));
    }
    for (const f of fields.filter((ff) => ff.kind === 0).slice(0, N(8))) ploughTeam(c, f, Y);
    for (const fl of ctx.plan.floors.filter((t) => period === 'early' || !insidePolygon(t.x, t.z, LATE_POLY))) {
      const ring = [];
      for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2, r = fl.r - 2.2; ring.push([fl.x + Math.cos(a) * r, Y(fl.x, fl.z) + 0.1, fl.z + Math.sin(a) * r]); }
      const ox = c.add(beast('ox', { path: new Path(ring), loop: true, s: rand() * 30, speed: 0.5, pause: [0, 0], lateral: 0, look: SLEDGE }));
      c.add(beast('ox', { follow: ox, gap: 0.2, lateral: 0.9 }));
      c.add(person('worker', { follow: ox, gap: 2.0, lateral: 0, ride: true, lift: 0.08, act: ACT.idle, prop: PROP.staff }));
      for (let k = 0; k < 2; k++) {
        const a = rand() * 6.28, x = fl.x + Math.cos(a) * (fl.r + 1), z = fl.z + Math.sin(a) * (fl.r + 1);
        // Winnowing when the afternoon wind gets up (Ruth 3:2); forking the straw before.
        c.add(person('worker', { x, y: Y(x, z), z, yaw: Math.PI / 2 + (rand() - 0.5) * 0.6, act: ACT.winnow, prop: PROP.fork, cycle: [[ACT.winnow, 40], [ACT.idle, 6]] }));
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
        const o = { path, s: rand() * path.length, dir: rand() < 0.5 ? 1 : -1, pause: [5, 30], lateral: (rand() < 0.5 ? -1 : 1) * 1.1 };
        if (rand() < 0.2) {
          // Riding a donkey, with someone walking behind.
          const d = c.add(beast('donkey', { ...o, speed: 0.9, look: SADDLE }));
          c.add(person(rand() < 0.7 ? 'man' : 'woman', { follow: d, gap: 0, lateral: 0, ride: true, act: ACT.ride, lift: 0.4 }));
          if (rand() < 0.5) c.add(person('worker', { follow: d, gap: 2, lateral: 0.3, prop: PROP.staff }));
          continue;
        }
        const t = c.add(person(rand() < 0.7 ? 'man' : 'woman', { ...o, prop: rand() < 0.4 ? PROP.staff : PROP.none }));
        if (rand() < 0.55) {
          t.moveAct = ACT.lead;
          c.add(beast('donkey', { follow: t, gap: 2.1, lateral: 0, look: rand() < 0.7 ? PANNIERS : 0 }));
        }
      }
    }
    return c.build(kit).group;
  };
  groups.countryEarly = country('countryEarly', 'early');
  groups.countryLate = country('countryLate', 'late');
  // 573 BC: "some of the poorest of the land" left as vinedressers and
  // ploughmen (2 Kgs 25:12; Jer 39:10): a lean team or two, hoeing, pruning.
  {
    const c = make('countryRuin');
    const fields = ctx.plan.fields.filter((f) => !insidePolygon(f.x, f.z, LATE_POLY));
    const Y = (x, z) => terrainY(x, z, 'square');
    for (let i = 0; i < N(10); i++) {
      const f = fields[Math.floor(rand() * fields.length)];
      const x = f.x + (rand() - 0.5) * f.w * 0.5, z = f.z + (rand() - 0.5) * f.d * 0.5;
      c.add(person(rand() < 0.7 ? 'worker' : 'woman', { x, y: Y(x, z), z, yaw: rand() * 6.28, act: ACT.work, cloth: pick(WOOL.slice(1)), cycle: [[ACT.work, 30], [ACT.idle, 6]] }));
    }
    for (const f of fields.filter((ff) => ff.kind === 0).slice(0, 2)) ploughTeam(c, f, Y, { cloth: WOOL[4] });
    // Vinedressers among the vines south of the city, pruning in spring.
    for (let i = 0; i < N(6); i++) {
      const x = -140 + rand() * 280, z = 1190 + rand() * 220;
      c.add(person('worker', { x, y: Y(x, z), z, yaw: rand() * 6.28, act: ACT.crouch, cloth: pick(WOOL.slice(2)), prop: PROP.sickle, cycle: [[ACT.crouch, 12], [ACT.work, 10], [ACT.idle, 4]], info: 'city-poor' }));
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
      c.add(person('man', { x, y: Y(x, z), z, yaw: rand() * 6.28, prop: PROP.staff, always: true, act: rand() < 0.4 ? ACT.sit : ACT.idle, info: 'city-shepherd' }));
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
