// People, animals and smoke. Figures are simple and instanced: they give
// scale and show how the courts, streets and fields were used.
import * as THREE from 'three';
import { mergeParts, paint, cbox } from './builder.js';
import { terrainY, rng, insidePolygon, LATE_POLY } from './terrain.js';
import { CUBIT, LEVEL, BASE_Y, PALACE_PAD, ROADS } from './data.js';
import { toWorld } from './ezekiel.js';

const { outer: O, inner: I, house: H } = LEVEL;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const S = (u, y, v) => new THREE.Vector3(u * CUBIT, BASE_Y + y * CUBIT, v * CUBIT);   // Solomon frame

// Clothing colours: linen, undyed wools, and the rarer dyed cloth.
const LINEN = [0.93, 0.91, 0.85];
const WOOL = [[0.72, 0.64, 0.52], [0.55, 0.45, 0.33], [0.42, 0.32, 0.22], [0.62, 0.60, 0.56], [0.30, 0.25, 0.20], [0.80, 0.74, 0.62]];
const DYED = [[0.55, 0.16, 0.10], [0.20, 0.26, 0.44], [0.66, 0.50, 0.24]];

// A standing figure in tunic and mantle, arms at the sides, head-cloth over
// the back of the head. Faces +z.
function figureGeo() {
  const body = new THREE.LatheGeometry([[0.25, 0], [0.23, 0.3], [0.19, 0.82], [0.2, 1.12], [0.235, 1.3], [0.13, 1.42], [0.001, 1.44]].map(([r, y]) => new THREE.Vector2(r, y)), 7);
  const parts = [paint(body, [1, 1, 1])];
  for (const s of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.045, 0.055, 0.62, 5);
    arm.rotateZ(s * 0.12);
    arm.rotateX(-0.1);
    arm.translate(s * 0.255, 1.02, 0.04);
    parts.push(paint(arm, [1, 1, 1]));
  }
  const cloth = new THREE.SphereGeometry(0.135, 7, 5);      // head-cloth
  cloth.scale(1, 1.05, 1.1);
  cloth.translate(0, 1.56, -0.03);
  parts.push(paint(cloth, [1, 1, 1]));
  return mergeParts(parts);
}
function headGeo() {
  const h = new THREE.SphereGeometry(0.105, 7, 5);
  h.translate(0, 1.53, 0.045);
  return h;
}
function animalGeo() {
  const body = new THREE.SphereGeometry(0.5, 8, 6);
  body.scale(1, 0.6, 0.55);
  body.translate(0, 0.62, 0);
  const head = new THREE.SphereGeometry(0.17, 6, 4);
  head.scale(1.3, 1, 0.9);
  head.translate(0.52, 0.74, 0);
  const parts = [paint(body, [1, 1, 1]), paint(head, [0.82, 0.78, 0.74])];
  for (const x of [-0.28, 0.28]) for (const z of [-0.15, 0.15]) parts.push(cbox(x - 0.035, x + 0.035, 0, 0.44, z - 0.035, z + 0.035, [0.42, 0.37, 0.33]));
  return mergeParts(parts);
}

let GEOS = null;
const geos = () => (GEOS ||= { figure: figureGeo(), head: headGeo(), animal: animalGeo() });

// people: [{ x, y, z, rot, col: [r,g,b], s }]
function people(mats, list) {
  const g = geos();
  const group = new THREE.Group();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const robes = new THREE.InstancedMesh(g.figure, mats.figure, Math.max(1, list.length));
  const heads = new THREE.InstancedMesh(g.head, mats.skin, Math.max(1, list.length));
  robes.count = heads.count = list.length;
  list.forEach((f, i) => {
    m.compose(p.set(f.x, f.y, f.z), q.setFromAxisAngle(Y_AXIS, f.rot), s.setScalar(f.s || 1));
    robes.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    robes.setColorAt(i, c.setRGB(...f.col));
  });
  for (const im of [robes, heads]) {
    im.castShadow = true;
    im.userData.infoId = 'city-people';
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}

// animals: [{ x, y, z, rot, col, sx, sy, sz }]
function animals(mats, list) {
  const im = new THREE.InstancedMesh(geos().animal, mats.animal, Math.max(1, list.length));
  im.count = list.length;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((a, i) => {
    im.setMatrixAt(i, m.compose(p.set(a.x, a.y, a.z), q.setFromAxisAngle(Y_AXIS, a.rot), s.set(a.sx || 1, a.sy || 1, a.sz || 1)));
    im.setColorAt(i, c.setRGB(...a.col));
  });
  im.castShadow = true;
  im.userData.infoId = 'city-flock';
  im.computeBoundingSphere();
  return im;
}

// --- Smoke --------------------------------------------------------------------------
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

// --- Placement ---------------------------------------------------------------------
export function buildLife(mats, ctx) {
  const rand = rng(2024);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const dress = () => (rand() < 0.08 ? pick(DYED) : pick(WOOL));
  const scatter = (n, sample, accept, at, colour, face) => {
    const out = [];
    for (let k = 0; k < n * 30 && out.length < n; k++) {
      const [u, v] = sample();
      if (!accept(u, v)) continue;
      const p = at(u, v);
      out.push({ x: p.x, y: p.y, z: p.z, rot: face ? face(p) : rand() * 6.28, col: colour(), s: 0.93 + rand() * 0.12 });
    }
    return out;
  };
  const box = (u0, u1, v0, v1) => () => [u0 + rand() * (u1 - u0), v0 + rand() * (v1 - v0)];
  const faceTo = (tx, tz) => (p) => Math.atan2(tx - p.x, tz - p.z) + (rand() - 0.5) * 0.8;
  const groups = {};

  // Ezekiel's temple: priests in linen in the inner court (44:17), the people
  // in the outer court, Levites at the north gate, the prince in the east gate.
  const ezHouse = toWorld(-95, 0, 0);
  const innerOK = (u, v) => !(Math.abs(u) < 11 && Math.abs(v) < 11) && !(u > 6 && u < 22 && Math.abs(v) < 3.5) && !(u > 14 && u < 42 && Math.abs(v) > 35);
  const outerOK = (u, v) =>
    !(u >= -153 && u <= 53 && Math.abs(v) <= 53) && !(u >= -172 && u <= -48 && Math.abs(v) >= 47 && Math.abs(v) <= 103)
    && !(u <= -168 && Math.abs(v) <= 53) && !(Math.abs(v) >= 221 || u >= 221)
    && !(Math.abs(u) <= 15 && Math.abs(v) >= 47 && Math.abs(v) <= 110) && !(u >= 47 && u <= 110 && Math.abs(v) <= 15)
    && !(Math.abs(u) <= 15 && Math.abs(v) >= 195) && !(u >= 195 && Math.abs(v) <= 15);
  const ez = [
    ...scatter(26, box(-46, 46, -46, 46), innerOK, (u, v) => toWorld(u, I, v), () => LINEN, faceTo(ezHouse.x, ezHouse.z)),
    ...scatter(4, box(-66, -57, -8, 8), () => true, (u, v) => toWorld(u, H, v), () => LINEN),
    ...scatter(150, box(-240, 240, -240, 240), outerOK, (u, v) => toWorld(u, O, v), dress, faceTo(ezHouse.x, ezHouse.z)),
    ...scatter(8, box(-22, 22, -113, -101), (u) => Math.abs(u) > 15, (u, v) => toWorld(u, O, v), () => pick(WOOL)),
    ...[[-4, -205], [4, -205], [-4, 205], [4, 205]].map(([u, v]) => ({ ...toWorld(u, O, v), rot: v < 0 ? 0 : Math.PI, col: pick(WOOL), s: 1 })),
    { ...toWorld(206, O, 0), rot: -Math.PI / 2, col: DYED[0], s: 1.02 },   // the prince (44:3)
  ];
  groups.ezFolk = people(mats, ez);

  // The man with the measuring reed and Ezekiel, inside the east gate (40:3).
  const special = new THREE.Group();
  const manAt = toWorld(194, O, -3), ezkAt = toWorld(194, O, 3);
  const man = new THREE.Mesh(mergeParts([geos().figure.clone(), paint(geos().head.clone(), [1, 1, 1])]), mats.bronze);
  man.position.copy(manAt);
  man.rotation.y = -Math.PI / 2;
  man.scale.setScalar(1.08);
  const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 6 * CUBIT, 6), mats.cedar);
  reed.position.set(manAt.x - 0.25, manAt.y + 1.55, manAt.z - 0.32);
  reed.rotation.x = 0.12;
  const flax = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 14), mats.linen);
  flax.position.set(manAt.x - 0.1, manAt.y + 0.95, manAt.z + 0.22);
  flax.rotation.y = 0.5;
  const ezk = new THREE.Mesh(mergeParts([geos().figure.clone(), paint(geos().head.clone(), [1, 1, 1])]), new THREE.MeshStandardMaterial({ color: 0x6f5a40, roughness: 1 }));
  ezk.position.copy(ezkAt);
  ezk.rotation.y = -Math.PI / 2 + 0.5;
  for (const o of [man, reed, flax, ezk]) { o.castShadow = true; o.userData.infoId = 'city-man'; special.add(o); }
  groups.ezSpecial = special;

  // Solomon's temple: priests, Levite singers east of the altar (2 Chr 5:12),
  // the people in the great court, guards and officials at the palace.
  const soHouse = S(20, 0, 0);
  const soInnerOK = (u, v) => !(u >= -30 && u <= 90 && Math.abs(v) <= 30) && !(u >= 106 && u <= 130 && v >= -12 && v <= 32)
    && !(u >= 59 && u <= 73 && v >= 31 && v <= 45) && !(Math.abs(v) >= 30 && Math.abs(v) <= 38 && u >= -3 && u <= 51);
  groups.soFolk = people(mats, [
    ...scatter(26, box(-36, 156, -46, 46), soInnerOK, (u, v) => S(u, I, v), () => LINEN, faceTo(soHouse.x, soHouse.z)),
    ...scatter(14, box(132, 152, -20, 20), () => true, (u, v) => S(u, I, v), () => LINEN, faceTo(S(118, 0, 0).x, 0)),
  ]);
  const court = (u0, u1, v0, v1) => (u, v) => !(u >= -44 && u <= 172 && Math.abs(v) <= 54) && u > u0 && u < u1 && v > v0 && v < v1;
  groups.soCourtLate = people(mats, scatter(140, box(-115, 365, -240, 240), court(-115, 365, -240, 240), (u, v) => S(u, O, v), dress, faceTo(soHouse.x, soHouse.z)));
  groups.soCourtEarly = people(mats, scatter(70, box(-75, 225, -122, 248), court(-75, 225, -122, 248), (u, v) => S(u, O, v), dress, faceTo(soHouse.x, soHouse.z)));
  const halls = [[30, 130, 560, 610], [94, 146, 504, 545], [100, 140, 440, 480], [40, 100, 340, 420], [145, 195, 340, 400]];
  const padOK = (u, v) => !halls.some(([a, b, c, d]) => u > a - 2 && u < b + 2 && v > c - 2 && v < d + 2);
  groups.soPalace = people(mats, scatter(34, box(-78, 192, 322, 630), padOK, (u, v) => new THREE.Vector3(u * CUBIT, PALACE_PAD.y, v * CUBIT), () => (rand() < 0.35 ? DYED[0] : dress())));

  // Townspeople in the streets and lanes; elders at the gates (Prov 31:23).
  const town = (walk, n, site, gates) => {
    const list = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = walk();
      list.push({ x, y: terrainY(x, z, site), z, rot: rand() * 6.28, col: dress(), s: 0.92 + rand() * 0.13 });
    }
    for (const [gx, gz] of gates) for (let i = 0; i < 4; i++) {
      const x = gx + (rand() - 0.5) * 8, z = gz + (rand() - 0.5) * 8;
      list.push({ x, y: terrainY(x, z, site), z, rot: rand() * 6.28, col: pick(WOOL), s: 1 });
    }
    return people(mats, list);
  };
  groups.townLate = town(ctx.walk.late, 420, 'square', ctx.gates.late);
  groups.townEarly = town(ctx.walk.early, 140, 'sp', ctx.gates.early);

  // Countryside: farmers, ploughing oxen, travellers with donkeys on the roads.
  const country = (period) => {
    const folk = [], beasts = [];
    const fields = ctx.plan.fields.filter((f) => period === 'early' || !insidePolygon(f.x, f.z, LATE_POLY));
    for (let i = 0; i < 36; i++) {
      const f = pick(fields);
      const y = terrainY(f.x, f.z, 'square');
      folk.push({ x: f.x, y, z: f.z, rot: f.ang, col: pick(WOOL), s: 1 });
      if (f.kind === 0 && i % 3 === 0) {
        for (const o of [-0.7, 0.7]) {
          beasts.push({ x: f.x + Math.cos(f.ang) * 2.2 - Math.sin(f.ang) * o, y, z: f.z + Math.sin(f.ang) * 2.2 + Math.cos(f.ang) * o, rot: -f.ang, col: [0.45, 0.32, 0.22], sx: 1.9, sy: 1.8, sz: 1.6 });
        }
      }
    }
    for (const road of ROADS.filter((r) => r.periods.includes(period))) {
      for (let i = 0; i < 6; i++) {
        const k = 1 + Math.floor(rand() * (road.pts.length - 2));
        const [ax, az] = road.pts[k - 1], [bx, bz] = road.pts[k];
        const t = rand();
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = terrainY(x, z, 'square');
        const rot = Math.atan2(bx - ax, bz - az) + (rand() < 0.5 ? Math.PI : 0);
        folk.push({ x, y, z, rot, col: dress(), s: 1 });
        if (rand() < 0.55) beasts.push({ x: x + Math.sin(rot) * 1.6, y, z: z + Math.cos(rot) * 1.6, rot: rot - Math.PI / 2, col: [0.48, 0.44, 0.40], sx: 1.45, sy: 1.75, sz: 1.3 });
      }
    }
    const g = new THREE.Group();
    g.add(people(mats, folk), animals(mats, beasts));
    return g;
  };
  groups.countryEarly = country('early');
  groups.countryLate = country('late');

  // Flocks of sheep and black goats with their shepherds, in every period.
  const centres = ctx.plan.folds.map((f) => [f.x + 22, f.z + 10]);
  for (let i = 0; i < 4; i++) centres.push([1050 + rand() * 350, -500 + rand() * 1400]);
  const flock = [], shepherds = [];
  for (const [cx, cz] of centres) {
    const n = 16 + Math.floor(rand() * 9);
    const dir = rand() * 6.28;
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(rand()) * 16, a = rand() * 6.28;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const goat = rand() < 0.32;
      const col = goat ? (rand() < 0.7 ? [0.1, 0.09, 0.08] : [0.38, 0.27, 0.18]) : [0.86, 0.82, 0.72];
      flock.push({ x, y: terrainY(x, z, 'square'), z, rot: dir + (rand() - 0.5) * 1.6, col, sx: 1, sy: goat ? 1.08 : 1, sz: goat ? 0.9 : 1.05 });
    }
    shepherds.push({ x: cx + 18, y: terrainY(cx + 18, cz, 'square'), z: cz, rot: rand() * 6.28, col: pick(WOOL), s: 1 });
  }
  const flocks = new THREE.Group();
  flocks.add(animals(mats, flock), people(mats, shepherds));
  groups.flocks = flocks;

  // Smoke from the altars (Isa 6:4), the temple kitchens and household fires.
  groups.smokeEz = smoke([ctx.ezAltar], { big: true, rand });
  groups.smokeEzKitchens = smoke(ctx.ezHearths.filter((_, i) => i % 4 === 0), { rand });
  groups.smokeSo = smoke([ctx.soAltar], { big: true, rand });
  groups.smokeLate = smoke(ctx.smoke.late, { rand });
  groups.smokeEarly = smoke(ctx.smoke.early, { rand });

  return { groups, label: { label: 'The man with the measuring reed (40:3)', pos: manAt.clone().add(new THREE.Vector3(0, 6, 0)) } };
}
