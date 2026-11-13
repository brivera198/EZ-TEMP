// People and animals going about their day. Figures are instanced and posed
// in the vertex shader (walking, sitting, kneeling at the quern, reaping,
// winnowing, riding, praying and more); the CPU moves them along paths
// through the lanes, courts, fields and roads. Clothing follows the Lachish
// reliefs, the Black Obelisk and the Bible: tunic (kuttonet) and mantle
// (simlah) with tassels at the corners (Num 15:38; Deut 22:12), girdle or
// sash, sandals or bare feet; head-cloths, fillets and soft caps for men;
// long shawls for women; linen and turbans for priests (Ezek 44:17–18);
// pointed helmets for soldiers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Vertex attribute aInfo: x the joint that moves it, y the colour it takes,
// z the carried thing it belongs to plus 16 × the clothing variant it
// belongs to (0 for always shown). Packed to stay within the 16 vertex
// attributes every WebGL device allows.
const P = { body: 0, skirt: 1, legL: 2, legR: 3, armL: 4, armR: 5, head: 6, prop: 7, shinL: 8, shinR: 9, foreL: 10, foreR: 11 };
const M = { cloth: 0, mantle: 1, skin: 2, leather: 3, hair: 4, face: 5, clay: 6, linen: 7, metal: 8, wood: 9, straw: 10, dark: 11, blue: 12 };
export const PROP = {
  none: 0, jar: 1, staff: 2, arms: 3, basket: 4, sickle: 5, hammer: 6, broom: 7, fork: 8,
  sack: 9, bundle: 10, scroll: 11, spindle: 12, tray: 13, lamp: 14, sheaf: 15,
};
// Activities, read by the shader. The first seven are the original set.
export const ACT = {
  idle: 0, walk: 1, work: 2, talk: 3, carry: 4, pray: 5, graze: 6,
  sit: 7, bench: 8, kneel: 9, crouch: 10, grind: 11, knead: 12, bake: 13, potter: 14, weave: 15,
  hammer: 16, sweep: 17, haul: 18, wash: 19, shoulder: 20, backload: 21, lead: 22, sell: 23,
  run: 24, play: 25, hobble: 26, reap: 27, bind: 28, winnow: 29, plough: 30, ride: 31,
  drill: 32, mourn: 33, write: 34, draw: 35, spin: 36, grieve: 37,
};
// Activities that move the legs in a stride.
const MOVING = new Set([ACT.walk, ACT.carry, ACT.shoulder, ACT.backload, ACT.lead, ACT.run, ACT.hobble, ACT.plough]);
export const isMoving = (act) => MOVING.has(act);

// Clothing variant slots: each instance picks one option (0–3) per slot.
export const SLOT = { head: 1, beard: 2, mantle: 3, feet: 4, belt: 5, load: 1, gear: 2 };
export const look = (opts) => Object.entries(opts).reduce((v, [k, o]) => v + (o || 0) * Math.pow(4, SLOT[k] - 1), 0);

// Kinds drawn with the animal shader.
export const BEASTS = new Set(['beast', 'camel', 'horse']);

export const shared = { pTime: { value: 0 } };

// A soft dark patch on the ground under each figure, so it stands on the
// ground whatever the shadow map does. Its strength is set by the hour.
function contactTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let CONTACT = null;
export function contactMaterial() {
  if (CONTACT) return CONTACT;
  CONTACT = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: contactTexture(), transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return CONTACT;
}
// Called each frame with how dark it is (0 day, 1 night).
export function setContactNight(night) { contactMaterial().opacity = 0.42 * (1 - 0.75 * night); }

function tag(g, part, mat, { prop = 0, slot = 0, opt = 0, shade = (y) => 1, pivot = null } = {}) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  const c = n.attributes.position.count;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c * 2), 2));
  // Animals keep their joint (height, depth) in the uv, so long-legged
  // camels and horses bend at their own joints.
  if (pivot) for (let i = 0; i < c; i++) n.attributes.uv.setXY(i, pivot[0], pivot[1]);
  const col = new Float32Array(c * 3);
  for (let i = 0; i < c; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade(n.attributes.position.getY(i));
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const info = new Float32Array(c * 3);
  const z = prop + 16 * (slot ? slot * 4 + opt : 0);
  for (let i = 0; i < c; i++) info.set([part, mat, z], i * 3);
  n.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
  return n;
}

const lathe = (profile, seg) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function tube(r0, r1, y0, y1, seg, open = true) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, open);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}
// A rod from a to b.
function rod(a, b, r, seg = 4) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
const box = (w, h, d, x, y, z) => at(new THREE.BoxGeometry(w, h, d), x, y, z);
const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 6) => { const g = new THREE.SphereGeometry(r, seg, Math.max(3, seg - 2)); g.scale(sx, sy, sz); return at(g, x, y, z); };
// Folds: cloth a little darker toward the hem and under the arms.
const folds = (lo, hi) => (y) => 0.78 + 0.22 * Math.min(1, Math.max(0, (y - lo) / (hi - lo)));

// The head: front triangles take the face from the atlas, the rest is hair.
// The sphere is shaped a little: narrower jaw, fuller back of the skull, a chin.
function head(seg) {
  const r = 0.105, cy = 1.6;
  const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)).toNonIndexed();
  const pos = g.attributes.position, uv = g.attributes.uv;
  const n = pos.count;
  for (let i = 0; i < n; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const v = y / r;
    if (v < 0) x *= 1 - 0.24 * -v;
    if (z < 0) z *= 1.1;
    if (v < -0.35 && z > 0) z += 0.014 * Math.min(1, (-v - 0.35) / 0.5);
    pos.setXYZ(i, x * 0.92, y * 1.06 + cy, z + 0.005);
  }
  const mat = new Float32Array(n);
  for (let t = 0; t < n; t += 3) {
    let zc = 0, yc = 0;
    for (let k = 0; k < 3; k++) { zc += pos.getZ(t + k) / 3; yc += pos.getY(t + k) / 3; }
    const face = zc > 0.02 && yc < cy + 0.075;
    for (let k = 0; k < 3; k++) {
      mat[t + k] = face ? M.face : M.hair;
      // Planar projection of the front onto the atlas cell.
      uv.setXY(t + k, 0.5 + pos.getX(t + k) / (2.3 * r), 0.5 + (pos.getY(t + k) - cy + 0.01) / (2.3 * r));
    }
  }
  const out = tag(g, P.head, M.face);
  for (let i = 0; i < n; i++) out.attributes.aInfo.setY(i, mat[i]);
  const parts = [out];
  const nose = new THREE.BoxGeometry(0.024, 0.046, 0.032);
  nose.rotateX(-0.22);
  parts.push(tag(at(nose, 0, 1.588, 0.1), P.head, M.skin));
  parts.push(tag(box(0.085, 0.012, 0.014, 0, 1.628, 0.094), P.head, M.skin, { shade: () => 0.9 }));       // brow ridge
  for (const s of [-1, 1]) parts.push(tag(ball(0.022, s * 0.097, 1.595, -0.004, 0.45, 1, 0.8, 5), P.head, M.skin));   // ears
  parts.push(tag(tube(0.045, 0.05, 1.44, 1.53, 6), P.head, M.skin, { shade: () => 0.85 }));             // neck
  return parts;
}

// Beards to go with the faces: short, full or long.
function beards(seg) {
  const parts = [];
  const b = (sy, sz, y, opt) => {
    const g = new THREE.SphereGeometry(0.075, seg, 5, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55);
    g.scale(1, sy, sz);
    parts.push(tag(at(g, 0, y, 0.045), P.head, M.hair, { slot: SLOT.beard, opt }));
    parts.push(tag(box(0.07, 0.014, 0.02, 0, 1.566, 0.098), P.head, M.hair, { slot: SLOT.beard, opt }));     // moustache
  };
  b(0.8, 0.68, 1.592, 1);
  b(1.1, 0.75, 1.585, 2);
  b(1.75, 0.78, 1.565, 3);
  return parts;
}

// Things carried or worked with. Each belongs to one joint; the shader
// folds away all but the one an instance holds.
function propParts(name, seg) {
  const R = -0.215, L = 0.215, hand = 0.82;
  switch (name) {
    case 'jar': return [tag(at(lathe([[0.001, 0], [0.07, 0.02], [0.12, 0.12], [0.11, 0.24], [0.05, 0.3], [0.055, 0.34], [0.001, 0.34]], seg), 0, 1.71, 0), P.head, M.clay, { prop: PROP.jar })];
    case 'staff': return [tag(at(tube(0.014, 0.017, 0.02, 1.75, 4, false), R - 0.02, 0, 0.04), P.foreR, M.wood, { prop: PROP.staff })];
    case 'arms': {
      const shield = new THREE.CylinderGeometry(0.28, 0.28, 0.03, seg + 3);
      shield.rotateZ(Math.PI / 2);
      return [
        tag(at(tube(0.012, 0.014, 0.1, 2.25, 4, false), R - 0.02, 0, 0.06), P.foreR, M.wood, { prop: PROP.arms }),
        tag(at(new THREE.ConeGeometry(0.025, 0.14, 4), R - 0.02, 2.32, 0.06), P.foreR, M.metal, { prop: PROP.arms }),
        tag(at(shield, L + 0.06, 1.0, 0.03), P.foreL, M.leather, { prop: PROP.arms }),
        tag(ball(0.05, L + 0.08, 1.0, 0.03, 0.5, 1, 1, 5), P.foreL, M.metal, { prop: PROP.arms }),
      ];
    }
    case 'basket': return [tag(at(lathe([[0.001, 0], [0.12, 0], [0.15, 0.13], [0.15, 0.14], [0.001, 0.14]], seg), L + 0.03, 0.66, 0.05), P.foreL, M.straw, { prop: PROP.basket })];
    case 'sickle': {
      const blade = new THREE.TorusGeometry(0.11, 0.011, 3, 8, Math.PI * 1.1);
      blade.rotateY(Math.PI / 2);
      blade.rotateX(Math.PI * 0.15);
      return [
        tag(rod(V(R, hand, 0.0), V(R, hand, 0.13), 0.016), P.foreR, M.wood, { prop: PROP.sickle }),
        tag(at(blade, R, hand + 0.1, 0.18), P.foreR, M.metal, { prop: PROP.sickle }),
      ];
    }
    case 'hammer': return [
      tag(rod(V(R, hand, -0.03), V(R, hand, 0.3), 0.014), P.foreR, M.wood, { prop: PROP.hammer }),
      tag(box(0.06, 0.06, 0.12, R, hand, 0.3), P.foreR, M.dark, { prop: PROP.hammer }),
    ];
    case 'broom': return [
      tag(rod(V(R, hand + 0.06, -0.02), V(R, 0.25, 0.42), 0.012), P.foreR, M.wood, { prop: PROP.broom }),
      tag(rod(V(R, 0.3, 0.38), V(R, 0.04, 0.6), 0.045, 5), P.foreR, M.straw, { prop: PROP.broom }),
    ];
    case 'fork': {
      const p = [tag(rod(V(R, hand, -0.35), V(R, hand, 1.15), 0.013), P.foreR, M.wood, { prop: PROP.fork })];
      for (const dx of [-0.06, 0, 0.06]) p.push(tag(rod(V(R + dx * 0.5, hand, 1.12), V(R + dx, hand + 0.03, 1.38), 0.008, 3), P.foreR, M.wood, { prop: PROP.fork }));
      return p;
    }
    case 'sack': return [tag(ball(0.13, -0.17, 1.53, -0.03, 1.05, 0.95, 2.2, 7), P.body, M.linen, { prop: PROP.sack, shade: () => 0.8 })];
    case 'bundle': {
      const g = new THREE.CylinderGeometry(0.13, 0.13, 0.78, 7);
      g.rotateZ(Math.PI / 2);
      return [tag(at(g, 0, 1.18, -0.28), P.body, M.wood, { prop: PROP.bundle, shade: () => 1.25 })];
    }
    case 'scroll': {
      const g = new THREE.CylinderGeometry(0.024, 0.024, 0.22, 6);
      g.rotateZ(Math.PI / 2);
      return [
        tag(at(g, L - 0.06, hand, 0.06), P.foreL, M.linen, { prop: PROP.scroll, shade: () => 0.9 }),
        tag(rod(V(R, hand, 0.02), V(R + 0.02, hand + 0.04, 0.17), 0.005, 3), P.foreR, M.dark, { prop: PROP.scroll }),
      ];
    }
    case 'spindle': return [
      tag(rod(V(L, hand - 0.02, 0.02), V(L, hand + 0.42, 0.06), 0.01, 3), P.foreL, M.wood, { prop: PROP.spindle }),
      tag(ball(0.06, L, hand + 0.4, 0.06, 1, 1.3, 1, 5), P.foreL, M.linen, { prop: PROP.spindle }),
      tag(rod(V(R, hand - 0.02, 0.03), V(R, hand - 0.3, 0.03), 0.006, 3), P.foreR, M.wood, { prop: PROP.spindle }),
      tag(at(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 7), R, hand - 0.25, 0.03), P.foreR, M.clay, { prop: PROP.spindle }),
    ];
    case 'tray': {
      const p = [tag(at(new THREE.CylinderGeometry(0.22, 0.2, 0.03, seg + 2), 0, 1.73, 0), P.head, M.straw, { prop: PROP.tray })];
      for (const [x, z] of [[0.08, 0.05], [-0.08, 0.06], [0, -0.08]]) p.push(tag(ball(0.075, x, 1.765, z, 1, 0.38, 1, 6), P.head, M.clay, { prop: PROP.tray, shade: () => 1.3 }));
      return p;
    }
    case 'lamp': return [tag(ball(0.045, R, hand - 0.02, 0.06, 1, 0.45, 1.3, 6), P.foreR, M.clay, { prop: PROP.lamp })];
    case 'sheaf': {
      const g = new THREE.CylinderGeometry(0.1, 0.06, 0.75, 6);
      g.rotateX(1.2);
      return [tag(at(g, 0.2, 1.4, -0.12), P.body, M.straw, { prop: PROP.sheaf })];
    }
  }
  return [];
}

// One figure. kind: man, woman, priest, worker, soldier, child.
const KIND = {
  man: { hem: 0.4, flare: 0.235, heads: ['cloth', 'fillet', 'cap', 'turban'], beard: true, mantle: true, feet: 2, belt: 2, props: ['staff', 'basket', 'sack', 'bundle', 'scroll', 'lamp'] },
  woman: { hem: 0.06, flare: 0.29, heads: ['shawlLong', 'shawl', 'kerchief'], longSleeve: true, feet: 2, belt: 2, sash: true, props: ['jar', 'basket', 'staff', 'spindle', 'tray', 'sheaf', 'broom', 'lamp', 'bundle'] },
  priest: { hem: 0.05, flare: 0.28, heads: ['turbanPriest'], longSleeve: true, linen: true, beard: true, feet: 1, bare: true, belt: 1, sash: true, props: [] },
  worker: { hem: 0.6, flare: 0.235, heads: ['band', 'bare', 'cloth'], beard: true, feet: 2, belt: 2, props: ['staff', 'basket', 'sickle', 'hammer', 'broom', 'fork', 'sack', 'bundle', 'sheaf'] },
  soldier: { hem: 0.62, flare: 0.235, heads: ['helmet'], beard: true, feet: 1, belt: 1, props: ['arms', 'staff', 'lamp'] },
  child: { hem: 0.42, flare: 0.235, heads: ['bare', 'kerchief'], feet: 2, belt: 1, props: ['jar', 'basket', 'staff', 'sheaf'] },
};

function human(kind, detail) {
  const K = KIND[kind];
  const seg = detail === 'low' ? 6 : 9;
  const parts = [];
  const robe = K.linen ? M.linen : M.cloth;
  const sl = (slot, opt, n) => (n > 1 ? { slot, opt } : {});
  // Legs: thigh and knee swing from the hip, shin and foot from the knee.
  for (const [s, thigh, shin] of [[1, P.legL, P.shinL], [-1, P.legR, P.shinR]]) {
    parts.push(tag(at(tube(0.05, 0.066, 0.46, 0.93, 5), s * 0.09, 0, 0), thigh, M.skin, { shade: () => 0.9 }));
    parts.push(tag(ball(0.05, s * 0.09, 0.48, 0, 1, 1, 1, 5), thigh, M.skin, { shade: () => 0.9 }));
    parts.push(tag(at(tube(0.037, 0.05, 0.065, 0.49, 5), s * 0.09, 0, 0), shin, M.skin, { shade: () => 0.9 }));
    for (let o = 0; o < K.feet; o++) {
      const bare = K.bare || o === 1;
      const v = sl(SLOT.feet, o, K.feet);
      if (bare) parts.push(tag(box(0.072, 0.06, 0.2, s * 0.09, 0.03, 0.04), shin, M.skin, { ...v, shade: () => 0.85 }));
      else {
        parts.push(tag(box(0.085, 0.022, 0.23, s * 0.09, 0.011, 0.04), shin, M.leather, v));
        parts.push(tag(box(0.068, 0.045, 0.18, s * 0.09, 0.044, 0.035), shin, M.skin, { ...v, shade: () => 0.85 }));
        parts.push(tag(box(0.074, 0.014, 0.022, s * 0.09, 0.062, 0.08), shin, M.leather, v));
      }
    }
  }
  // Tunic: the skirt is carried by the legs in the shader, the upper body by the spine.
  const waist = 0.98, hem = K.hem;
  const skirt = lathe([[0.001, hem], [K.flare, hem], [K.flare - 0.015, hem + 0.05], [0.205, (hem + waist) / 2], [0.17, waist]], seg + 1);
  skirt.scale(1.08, 1, 0.86);
  parts.push(tag(skirt, P.skirt, robe, { shade: folds(hem, waist) }));
  const torso = lathe([[0.17, waist], [0.18, 1.12], [0.2, 1.28], [0.195, 1.37], [0.13, 1.43], [0.06, 1.47], [0.001, 1.475]], seg + 1);
  torso.scale(1.12, 1, 0.78);
  parts.push(tag(torso, P.body, robe, { shade: folds(0.9, 1.4) }));
  // Girdle of leather, or a cloth sash with a hanging end.
  for (let o = 0; o < K.belt; o++) {
    const sash = K.sash ? o === 0 : o === 1;
    const v = sl(SLOT.belt, o, K.belt);
    const belt = new THREE.TorusGeometry(0.175, sash ? 0.03 : 0.02, 3, seg + 3);
    belt.rotateX(Math.PI / 2);
    belt.scale(1.1, 1, 0.8);
    parts.push(tag(at(belt, 0, waist, 0), P.body, sash ? M.mantle : M.leather, v));
    if (sash) parts.push(tag(box(0.06, 0.3, 0.015, 0.09, waist - 0.16, 0.135), P.skirt, M.mantle, v));
  }
  // Arms: sleeve from the shoulder, forearm and hand from the elbow.
  for (const [s, arm, fore] of [[1, P.armL, P.foreL], [-1, P.armR, P.foreR]]) {
    parts.push(tag(at(tube(0.056, 0.062, 1.1, 1.38, 5), s * 0.215, 0, 0), arm, robe, { shade: folds(1.0, 1.4) }));
    const foreMat = K.longSleeve ? robe : M.skin;
    parts.push(tag(ball(0.047, s * 0.215, 1.11, 0, 1, 1, 1, 5), arm, foreMat));
    parts.push(tag(at(tube(0.033, 0.044, 0.86, 1.11, 5), s * 0.215, 0, 0), fore, foreMat));
    parts.push(tag(ball(0.038, s * 0.215, 0.82, 0.01, 0.85, 1.25, 0.9, 5), fore, M.skin));
  }
  // Head and beard.
  const headParts = head(detail === 'low' ? 10 : 16);
  if (K.beard) headParts.push(...beards(seg));
  // Head-coverings, one per option of the head slot.
  const nH = K.heads.length;
  K.heads.forEach((h, o) => {
    const v = sl(SLOT.head, o, nH);
    const cap = (mat = M.mantle, cut = 0.42) => {
      const g = new THREE.SphereGeometry(0.12, seg + 1, 5, 0, Math.PI * 2, 0, Math.PI * cut);
      headParts.push(tag(at(g, 0, 1.6, -0.01), P.head, mat, v));
    };
    if (h === 'cloth') {
      // Head-cloth bound with a band, falling to the nape (Lachish).
      cap();
      headParts.push(tag(box(0.2, 0.22, 0.02, 0, 1.5, -0.1), P.head, M.mantle, v));
      const band = new THREE.TorusGeometry(0.112, 0.013, 3, seg + 3);
      band.rotateX(Math.PI / 2);
      headParts.push(tag(at(band, 0, 1.655, -0.005), P.head, M.mantle, { ...v, shade: () => 0.6 }));
    } else if (h === 'fillet' || h === 'band') {
      const band = new THREE.TorusGeometry(0.107, 0.014, 3, seg + 3);
      band.rotateX(Math.PI / 2);
      headParts.push(tag(at(band, 0, 1.645, 0.005), P.head, M.mantle, v));
    } else if (h === 'cap') {
      // Soft cap folded back, as the Israelites wear it on the Black Obelisk.
      const g = lathe([[0.113, 0], [0.112, 0.06], [0.09, 0.14], [0.05, 0.2], [0.001, 0.215]], seg + 1);
      g.rotateX(-0.35);
      headParts.push(tag(at(g, 0, 1.625, -0.01), P.head, M.mantle, v));
    } else if (h === 'turban' || h === 'turbanPriest') {
      const linen = h === 'turbanPriest';
      cap(linen ? M.linen : M.mantle, 0.4);
      for (const [y, r] of [[1.655, 0.112], [1.7, 0.104], [1.74, 0.088]]) {
        const t = new THREE.TorusGeometry(r, 0.026, 4, seg + 3);
        t.rotateX(Math.PI / 2);
        headParts.push(tag(at(t, 0, y, -0.005), P.head, linen ? M.linen : M.mantle, { ...v, shade: () => (linen ? 1 : 0.9) }));
      }
    } else if (h === 'helmet') {
      headParts.push(tag(at(new THREE.ConeGeometry(0.118, 0.22, seg + 1, 1, true), 0, 1.73, -0.005), P.head, M.metal, v));
      const rim = new THREE.TorusGeometry(0.116, 0.012, 3, seg + 3);
      rim.rotateX(Math.PI / 2);
      headParts.push(tag(at(rim, 0, 1.625, -0.005), P.head, M.metal, { ...v, shade: () => 0.7 }));
    } else if (h === 'shawlLong' || h === 'shawl' || h === 'kerchief') {
      // Shawl over the head and shoulders, open at the face.
      const capG = new THREE.SphereGeometry(0.128, seg + 1, 4, 0, Math.PI * 2, 0, Math.PI * 0.34);
      const hood = new THREE.SphereGeometry(0.128, seg + 1, 4, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.34, Math.PI * 0.3);
      for (const g of [capG, hood]) { g.scale(0.95, 1.05, 1.05); headParts.push(tag(at(g, 0, 1.605, -0.008), P.head, M.mantle, v)); }
      if (h === 'kerchief') headParts.push(tag(box(0.17, 0.16, 0.02, 0, 1.52, -0.105), P.head, M.mantle, v));
      else {
        const drape = new THREE.CylinderGeometry(0.12, 0.25, 0.6, seg + 1, 1, true, Math.PI * 0.3, Math.PI * 1.4);
        drape.scale(1.1, 1, 0.86);
        parts.push(tag(at(drape, 0, 1.3, -0.01), P.body, M.mantle, { ...v, shade: folds(0.95, 1.6) }));
        if (h === 'shawlLong') {
          // On down to the calves, as the women of Lachish wear it.
          const low = new THREE.CylinderGeometry(0.255, 0.31, 0.62, seg + 1, 1, true, Math.PI * 0.32, Math.PI * 1.36);
          low.scale(1.1, 1, 0.86);
          parts.push(tag(at(low, 0, 0.69, -0.012), P.skirt, M.mantle, { ...v, shade: folds(0.38, 1.0) }));
        }
      }
    }
    // Bare heads show their hair: nothing to add.
  });
  if (kind === 'child') {
    // Children's heads are larger for their size.
    for (const g of headParts) { g.translate(0, -1.44, 0); g.scale(1.2, 1.2, 1.2); g.translate(0, 1.44, 0); }
  }
  parts.push(...headParts);
  // Mantle (simlah): over both shoulders, or wrapped over one, with tassels.
  if (K.mantle) {
    const v1 = { slot: SLOT.mantle, opt: 1 }, v2 = { slot: SLOT.mantle, opt: 2 };
    const m = new THREE.CylinderGeometry(0.215, 0.28, 0.62, seg + 1, 1, true, Math.PI * 0.35, Math.PI * 1.3);
    m.scale(1.08, 1, 0.85);
    parts.push(tag(at(m, 0, 1.08, 0), P.body, M.mantle, { ...v1, shade: folds(0.75, 1.4) }));
    const fr = new THREE.CylinderGeometry(0.283, 0.285, 0.04, seg + 1, 1, true, Math.PI * 0.35, Math.PI * 1.3);
    fr.scale(1.08, 1, 0.85);
    parts.push(tag(at(fr, 0, 0.785, 0), P.body, M.mantle, { ...v1, shade: () => 0.5 }));
    for (const s of [-1, 1]) parts.push(tag(at(new THREE.ConeGeometry(0.014, 0.09, 4), s * 0.27, 0.72, 0.1), P.body, M.blue, v1));
    const w = new THREE.CylinderGeometry(0.235, 0.25, 0.42, seg + 1, 1, true);
    w.scale(1.1, 1, 0.84);
    w.rotateZ(-0.55);
    parts.push(tag(at(w, 0.02, 1.18, 0), P.body, M.mantle, { ...v2, shade: folds(0.9, 1.4) }));
    parts.push(tag(box(0.16, 0.55, 0.025, 0.12, 1.12, -0.16), P.body, M.mantle, { ...v2, shade: () => 0.85 }));
    parts.push(tag(at(new THREE.ConeGeometry(0.014, 0.09, 4), -0.2, 0.88, 0.12), P.body, M.blue, v2));
  }
  for (const name of K.props) parts.push(...propParts(name, seg));
  return mergeGeometries(parts);
}

// A four-legged beast facing +z: sheep, goat, donkey, ox or jackal (by
// scale), or a camel or a horse. Joints are kept per vertex (see tag).
function quadruped(detail, sp = 'beast') {
  const seg = detail === 'low' ? 6 : 8;
  const parts = [];
  const camel = sp === 'camel', horse = sp === 'horse';
  const legTop = camel ? 1.15 : horse ? 0.78 : 0.6;
  const bodyY = camel ? 1.42 : horse ? 0.98 : 0.72;
  const lx = camel ? 0.15 : 0.16, lz = camel ? 0.45 : horse ? 0.42 : 0.36;
  const body = new THREE.SphereGeometry(0.5, seg, 6);
  body.scale(camel ? 0.5 : horse ? 0.48 : 0.52, camel ? 0.52 : horse ? 0.55 : 0.58, camel ? 1.15 : horse ? 1.15 : 1.05);
  parts.push(tag(at(body, 0, bodyY, 0), 0, M.cloth, { shade: folds(bodyY - 0.3, bodyY + 0.25) }));
  if (camel) parts.push(tag(ball(0.3, 0, bodyY + 0.2, -0.02, 0.9, 0.9, 1.1, seg), 0, M.cloth));                 // hump
  // Legs: FL 2, FR 3, BL 4, BR 5.
  for (const [x, z, part] of [[lx, lz, 2], [-lx, lz, 3], [lx, -lz, 4], [-lx, -lz, 5]]) {
    const pv = [legTop, z];
    parts.push(tag(at(tube(camel ? 0.04 : 0.032, camel ? 0.07 : 0.055, 0.05, legTop + 0.04, 5), x, 0, z), part, M.cloth, { shade: () => 0.8, pivot: pv }));
    parts.push(tag(at(new THREE.CylinderGeometry(camel ? 0.06 : 0.04, 0.042, 0.06, 5), x, 0.03, z), part, camel ? M.cloth : M.leather, { pivot: pv }));
  }
  // Neck and head.
  const hp = camel ? [bodyY + 0.1, 0.5] : horse ? [bodyY + 0.1, 0.45] : [0.85, 0.42];
  if (camel) {
    // Long neck dipping forward and rising to the head.
    const n1 = tube(0.08, 0.12, 0, 0.6, seg);
    n1.rotateX(1.9);
    parts.push(tag(at(n1, 0, bodyY + 0.05, 0.5), 6, M.cloth, { pivot: hp }));
    const n2 = tube(0.07, 0.085, 0, 0.55, seg);
    n2.rotateX(0.35);
    parts.push(tag(at(n2, 0, bodyY - 0.2, 1.05), 6, M.cloth, { pivot: hp }));
    parts.push(tag(ball(0.1, 0, bodyY + 0.37, 1.27, 0.75, 0.75, 1.6, seg), 6, M.cloth, { pivot: hp }));
    for (const s of [-1, 1]) parts.push(tag(at(new THREE.ConeGeometry(0.02, 0.06, 4), s * 0.05, bodyY + 0.46, 1.17), 6, M.cloth, { pivot: hp }));
  } else {
    const neck = tube(horse ? 0.1 : 0.09, horse ? 0.15 : 0.13, 0, horse ? 0.55 : 0.36, seg);
    neck.rotateX(horse ? 0.55 : 0.75);
    parts.push(tag(at(neck, 0, horse ? bodyY + 0.05 : 0.82, horse ? 0.4 : 0.42), 6, M.cloth, { pivot: hp }));
    const skull = new THREE.SphereGeometry(0.13, seg, 5);
    skull.scale(0.8, 0.85, horse ? 1.9 : 1.35);
    const sy = horse ? bodyY + 0.47 : 1.05, sz = horse ? 0.78 : 0.68;
    if (horse) skull.rotateX(0.5);
    parts.push(tag(at(skull, 0, sy, sz), 6, M.cloth, { pivot: hp }));
    parts.push(tag(ball(0.075, 0, sy - (horse ? 0.16 : 0.05), sz + (horse ? 0.18 : 0.14), 1, 1, 1, 5), 6, M.mantle, { pivot: hp }));       // muzzle
    for (const s of [-1, 1]) {
      const ear = new THREE.ConeGeometry(horse ? 0.025 : 0.035, horse ? 0.1 : 0.12, 4);
      if (!horse) ear.rotateZ(s * 1.1);
      parts.push(tag(at(ear, s * (horse ? 0.05 : 0.09), sy + (horse ? 0.13 : 0.07), sz - (horse ? 0.1 : 0.06)), 6, M.cloth, { pivot: hp }));
    }
    if (horse) parts.push(tag(box(0.04, 0.12, 0.5, 0, bodyY + 0.35, 0.55), 6, M.mantle, { pivot: hp }));              // mane
  }
  const tail = tube(0.02, horse ? 0.06 : 0.035, 0, horse ? 0.55 : 0.3, 4);
  tail.rotateX(horse ? -2.85 : -2.6);
  parts.push(tag(at(tail, 0, bodyY + 0.1, camel ? -0.55 : -0.5), 7, horse ? M.mantle : M.cloth, { pivot: [bodyY + 0.1, -0.5] }));
  // Gear, by the load slot: panniers, a saddle-cloth for riding, or a yoke
  // with an ard behind (sized for an ox); the gear slot adds a threshing sledge.
  const L = (opt) => ({ slot: SLOT.load, opt });
  if (camel) {
    for (const s of [-1, 1]) parts.push(tag(box(0.2, 0.42, 0.7, s * 0.3, bodyY + 0.02, 0), 0, M.linen, { ...L(1), shade: () => 0.75 }));
    parts.push(tag(box(0.5, 0.08, 0.6, 0, bodyY + 0.42, 0), 0, M.blue, L(1)));
  } else if (horse) {
    // A chariot behind, between this horse and its yoke-mate on the left.
    const cx = 0.45, cz = -1.75;
    parts.push(tag(rod(V(cx, 0.9, 0.3), V(cx, 0.75, cz + 0.35), 0.03), 0, M.wood, L(1)));
    parts.push(tag(rod(V(-0.15, 1.18, 0.35), V(1.05, 1.18, 0.35), 0.035), 0, M.wood, L(1)));              // yoke
    parts.push(tag(box(0.95, 0.06, 0.6, cx, 0.62, cz), 0, M.wood, L(1)));                                    // floor
    parts.push(tag(box(0.95, 0.5, 0.04, cx, 0.88, cz + 0.28), 0, M.leather, L(1)));                          // front
    for (const s of [-1, 1]) parts.push(tag(box(0.04, 0.4, 0.55, cx + s * 0.47, 0.83, cz), 0, M.leather, L(1)));
    for (const s of [-1, 1]) {
      const wheel = new THREE.TorusGeometry(0.42, 0.03, 4, 14);
      wheel.rotateY(Math.PI / 2);
      parts.push(tag(at(wheel, cx + s * 0.58, 0.44, cz - 0.05), 0, M.wood, L(1)));
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        parts.push(tag(rod(V(cx + s * 0.58, 0.44 - Math.cos(a) * 0.4, cz - 0.05 - Math.sin(a) * 0.4), V(cx + s * 0.58, 0.44 + Math.cos(a) * 0.4, cz - 0.05 + Math.sin(a) * 0.4), 0.012, 3), 0, M.wood, L(1)));
      }
    }
    parts.push(tag(rod(V(cx - 0.6, 0.44, cz - 0.05), V(cx + 0.6, 0.44, cz - 0.05), 0.025), 0, M.wood, L(1)));  // axle
  } else {
    for (const s of [-1, 1]) parts.push(tag(box(0.14, 0.32, 0.46, s * 0.33, 0.7, 0.02), 0, M.straw, { ...L(1), shade: () => 0.85 }));
    parts.push(tag(box(0.62, 0.05, 0.5, 0, 1.02, 0.02), 0, M.linen, { ...L(1), shade: () => 0.7 }));
    parts.push(tag(box(0.5, 0.04, 0.42, 0, 1.03, 0.05), 0, M.blue, { ...L(2), shade: () => 0.9 }));
    // Yoke over both necks, pole back to the ard, share and handle.
    const k = 1 / 1.62, ax = -0.4;
    parts.push(tag(rod(V(0.22, 0.98, 0.45), V(-1.02, 0.98, 0.45), 0.03), 0, M.wood, L(3)));
    parts.push(tag(rod(V(ax, 0.96, 0.45), V(ax, 0.1, -0.95), 0.025), 0, M.wood, L(3)));
    parts.push(tag(rod(V(ax, 0.1, -0.95), V(ax, 0.0, -0.78), 0.02), 0, M.dark, L(3)));
    parts.push(tag(rod(V(ax, 0.06, -0.97), V(ax, 0.62, -1.32), 0.02), 0, M.wood, L(3)));
    // Threshing sledge: a board studded with stones (Isa 41:15), on traces.
    parts.push(tag(box(0.6, 0.06, 0.95 * k * 1.4, 0, 0.04, -1.25), 0, M.wood, { slot: SLOT.gear, opt: 1, shade: () => 0.8 }));
    for (const s of [-1, 1]) parts.push(tag(rod(V(s * 0.16, 0.72, -0.3), V(s * 0.25, 0.08, -0.8), 0.012, 3), 0, M.leather, { slot: SLOT.gear, opt: 1 }));
  }
  return mergeGeometries(parts);
}

// --- Faces ------------------------------------------------------------------------
// Atlas of 16 faces (4 × 4 cells). Red: shading that multiplies the skin.
// Green: where the colour turns pale (the whites of the eyes). Blue: where
// the hair colour takes over (brows, beard, moustache, hairline), so grey
// heads have grey beards.
const FACES = [
  { beard: 2 }, { beard: 3 }, { beard: 3, old: 1 }, { female: 1 },
  { female: 1, old: 1 }, { child: 1 }, { beard: 3, nose: 1.35, brow: 1.3 }, { beard: 2, eye: 0.85, brow: 1.5 },
  { beard: 4, old: 1, nose: 1.2 }, { beard: 1, eye: 1.1 }, { female: 1, kohl: 1, eye: 1.1 }, { female: 1, mid: 1, nose: 1.25 },
  { beard: 4, brow: 1.2 }, { beard: 3, nose: 1.5, wide: 1, eye: 0.9 }, { child: 1, female: 1 }, { female: 1, old: 1, nose: 1.2, mid: 1 },
];
// Which beard (slot option) goes with each face.
export const FACE_BEARD = FACES.map((f) => [0, 0, 1, 2, 3][f.beard || 0]);
export const FACE = {
  man: [0, 1, 6, 7, 9, 12, 13], elder: [2, 8], woman: [3, 10, 11], oldWoman: [4, 15], child: [5, 14],
  boy: [5], girl: [14], priest: [1, 6, 8, 12], soldier: [0, 7, 9, 13], worker: [0, 1, 6, 7, 9, 13],
};

function faceAtlas() {
  const S = 512, C = 128;
  const make = () => { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S); return [c, g]; };
  const [cr, r] = make(), [cg, gr] = make(), [cb, bl] = make();
  r.fillStyle = '#fff';
  r.fillRect(0, 0, S, S);
  FACES.forEach((f, i) => {
    const ox = (i % 4) * C, oy = (3 - Math.floor(i / 4)) * C;   // canvas y runs down; atlas v runs up
    const X = (u) => ox + u * C, Y = (v) => oy + (1 - v) * C;
    const blob = (g, cx, cy, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(X(cx), Y(cy), rx * C, ry * C, 0, 0, Math.PI * 2); g.fill(); };
    const soft = (cx, cy, rad, k) => {
      const gr0 = r.createRadialGradient(X(cx), Y(cy), 1, X(cx), Y(cy), rad * C);
      gr0.addColorStop(0, `rgba(0,0,0,${k})`); gr0.addColorStop(1, 'rgba(0,0,0,0)');
      r.fillStyle = gr0; r.beginPath(); r.arc(X(cx), Y(cy), rad * C, 0, Math.PI * 2); r.fill();
    };
    const nose = f.nose || 1, eye = f.eye || 1, brow = f.brow || 1;
    const ey = 0.56, gap = f.wide ? 0.17 : 0.15;
    // Modelling: sockets, the sides of the nose, under the lip, cheeks.
    soft(0.5 - gap, ey + 0.01, 0.11, 0.28);
    soft(0.5 + gap, ey + 0.01, 0.11, 0.28);
    soft(0.5 - 0.045 * nose, 0.44, 0.045 * nose, 0.32);
    soft(0.5 + 0.045 * nose, 0.44, 0.045 * nose, 0.32);
    soft(0.5, 0.385, 0.05 * nose, 0.35);                                       // under the nose
    soft(0.5, 0.25, 0.06, 0.18);                                               // under the lip
    if (f.old || f.mid) { soft(0.3, 0.38, 0.07, 0.25); soft(0.7, 0.38, 0.07, 0.25); }
    // Lips.
    blob(r, 0.5, 0.315, (f.female ? 0.07 : 0.075) * (f.wide ? 1.15 : 1), f.female ? 0.024 : 0.018, f.female ? 'rgb(170,150,150)' : 'rgb(185,165,160)');
    r.strokeStyle = 'rgba(0,0,0,0.5)'; r.lineWidth = 1;
    r.beginPath(); r.moveTo(X(0.43), Y(0.317)); r.lineTo(X(0.57), Y(0.317)); r.stroke();
    // Wrinkles.
    if (f.old) {
      r.strokeStyle = 'rgba(0,0,0,0.3)'; r.lineWidth = 1.2;
      for (const dy of [0.74, 0.78, 0.82]) { r.beginPath(); r.moveTo(X(0.34), Y(dy)); r.quadraticCurveTo(X(0.5), Y(dy + 0.015), X(0.66), Y(dy)); r.stroke(); }
      for (const s of [-1, 1]) { r.beginPath(); r.moveTo(X(0.5 + s * 0.08), Y(0.43)); r.quadraticCurveTo(X(0.5 + s * 0.14), Y(0.37), X(0.5 + s * 0.12), Y(0.29)); r.stroke(); }
    }
    // Eyes: white, iris, lid line; kohl for some women (2 Kgs 9:30; Jer 4:30).
    for (const s of [-1, 1]) {
      const ex = 0.5 + s * gap;
      blob(gr, ex, ey, 0.058 * eye, 0.026 * eye, 'rgb(150,150,150)');
      blob(r, ex, ey, 0.03 * eye, 0.03 * eye, 'rgb(45,40,40)');
      r.strokeStyle = f.kohl ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.6)';
      r.lineWidth = f.kohl ? 2.6 : 1.4;
      r.beginPath(); r.ellipse(X(ex), Y(ey), 0.062 * eye * C, 0.03 * eye * C, 0, Math.PI * 1.05, Math.PI * 1.95); r.stroke();
      if (f.kohl) { r.beginPath(); r.moveTo(X(ex + s * 0.055), Y(ey)); r.lineTo(X(ex + s * 0.09), Y(ey + 0.012)); r.stroke(); }
      // Brows, in the hair colour.
      bl.fillStyle = '#fff';
      bl.beginPath();
      bl.ellipse(X(ex), Y(0.645), 0.075 * C, (f.female || f.child ? 0.012 : 0.02) * brow * C, s * -0.12, 0, Math.PI * 2);
      bl.fill();
    }
    // Beard and moustache.
    if (f.beard) {
      bl.fillStyle = f.beard === 1 ? 'rgba(255,255,255,0.45)' : '#fff';
      const lo = [0, 0.16, 0.12, 0.02, -0.05][f.beard];
      bl.beginPath();
      bl.moveTo(X(0.16), Y(0.55));
      bl.quadraticCurveTo(X(0.18), Y(lo + 0.05), X(0.5), Y(lo));
      bl.quadraticCurveTo(X(0.82), Y(lo + 0.05), X(0.84), Y(0.55));
      bl.lineTo(X(0.72), Y(0.42)); bl.lineTo(X(0.62), Y(0.36)); bl.lineTo(X(0.38), Y(0.36)); bl.lineTo(X(0.28), Y(0.42));
      bl.closePath(); bl.fill();
      if (f.beard > 1) { bl.beginPath(); bl.ellipse(X(0.5), Y(0.355), 0.09 * C, 0.022 * C, 0, 0, Math.PI * 2); bl.fill(); }
      // Keep the lips showing.
      bl.fillStyle = '#000';
      bl.beginPath(); bl.ellipse(X(0.5), Y(0.315), 0.055 * C, 0.016 * C, 0, 0, Math.PI * 2); bl.fill();
    }
    if (!f.female) {                                                 // hairline
      bl.fillStyle = '#fff';
      bl.fillRect(X(0.06), Y(1.0), 0.88 * C, (f.old ? 0.08 : 0.15) * C);
    }
  });
  const R = r.getImageData(0, 0, S, S).data, G = gr.getImageData(0, 0, S, S).data, B = bl.getImageData(0, 0, S, S).data;
  const out = r.createImageData(S, S);
  for (let i = 0; i < R.length; i += 4) {
    out.data[i] = R[i]; out.data[i + 1] = G[i]; out.data[i + 2] = B[i]; out.data[i + 3] = 255;
  }
  r.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(cr);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// --- Shaders --------------------------------------------------------------------------
const COMMON = /* glsl */ `
attribute vec3 aInfo;
attribute vec3 iCloth;
attribute vec3 iMantle;
attribute vec3 iSkin;
attribute vec3 iHair;
attribute vec4 iAnim;      // phase, gait (radians per second), activity, face + 16 × prop
attribute vec4 iLook;      // build, cloth pattern, clothing variants (base-4 digits), stoop
#define aPart aInfo.x
#define aMat aInfo.y
#define aPropId mod(aInfo.z, 16.0)
#define aVar floor(aInfo.z / 16.0 + 0.001)
#define iProp floor(iAnim.w / 16.0 + 0.001)
#define iFace mod(iAnim.w, 16.0)
uniform float pTime;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
bool isAct(float a) { return abs(iAnim.z - a) < 0.5; }
// Things this instance does not carry, and clothes it does not wear, fold away.
bool hiddenPart() {
  float pr = aPropId;
  if (pr > 0.5 && abs(pr - iProp) > 0.5) return true;
  float v = aVar;
  if (v > 0.5) {
    float slot = floor(v / 4.0 + 0.001);
    float opt = v - slot * 4.0;
    float digit = mod(floor(iLook.z / exp2(2.0 * (slot - 1.0)) + 0.001), 4.0);
    if (abs(digit - opt) > 0.5) return true;
  }
  return false;
}
`;

// Joint angles, x for the left side and y for the right. Hips and shoulders
// swing forward when positive, knees bend back, elbows bend forward, the
// spine bends forward; spread and shoZ move the limbs out to the side.
const HUMAN_ANIM = /* glsl */ `
vec2 hip, knee, sho, shoZ, elb;
float spine, twist, nod, yawH, drop, spread, bob, gW;

void sitGround() { hip = vec2(2.0); knee = vec2(2.75); drop = 0.74; spread = 0.25; spine = 0.12; }
void kneelSit() { hip = vec2(0.4); knee = vec2(1.95); drop = 0.42; }
void crouch() { hip = vec2(2.0); knee = vec2(2.4); drop = 0.62; spread = 0.3; spine = 0.45; }

void pose() {
  float ph = iAnim.x;
  float t = pTime * iAnim.y + ph;
  float s = sin(t), c = cos(t);
  float gt = pTime * 1.6 + ph;
  float slow = sin(pTime * 1.7 + ph);
  float idle = sin(pTime * 0.9 + ph) * 0.035;
  hip = vec2(0.0); knee = vec2(0.0); sho = vec2(idle, -idle); shoZ = vec2(0.06); elb = vec2(0.12);
  spine = 0.0; twist = 0.0; nod = 0.0; drop = 0.0; spread = 0.0; bob = 0.0;
  yawH = sin(pTime * 0.23 + ph * 5.0) * 0.45;
  bool moving = isAct(1.0) || isAct(4.0) || isAct(20.0) || isAct(21.0) || isAct(22.0) || isAct(24.0) || isAct(26.0) || isAct(30.0);
  if (moving) {
    float run = isAct(24.0) ? 1.0 : 0.0;
    float amp = run > 0.5 ? 0.75 : isAct(26.0) ? 0.22 : isAct(30.0) ? 0.3 : 0.42;
    hip = vec2(s, -s) * amp;
    knee = vec2(max(0.0, c), max(0.0, -c));
    knee = knee * knee * mix(0.6, 1.4, run) + 0.06;
    sho = vec2(-s, s) * amp * 0.7;
    elb = vec2(0.15 + 0.1 * max(0.0, -s), 0.15 + 0.1 * max(0.0, s)) + run * 1.2;
    bob = abs(c) * mix(0.03, 0.07, run);
    spine = 0.04 + run * 0.12;
    yawH *= 0.3;
  }
  if (isAct(2.0)) { spine = 0.45 + 0.2 * slow; sho = vec2(0.85 - 0.5 * slow); elb = vec2(0.3); knee = vec2(0.2); hip = vec2(0.12); yawH = 0.0; }
  else if (isAct(3.0)) { sho.y = 0.75 - 0.35 * sin(pTime * 2.3 + ph * 3.0); elb.y = 0.75; nod = 0.07 * sin(pTime * 3.1 + ph); }
  else if (isAct(4.0)) { sho.y = 2.75; shoZ.y = -0.25; elb.y = 0.5; }
  else if (isAct(5.0)) { sho = vec2(2.45 + 0.06 * sin(pTime * 0.8 + ph)); shoZ = vec2(0.25); elb = vec2(0.25); nod = -0.25; yawH = 0.0; }
  else if (isAct(7.0)) { sitGround(); sho = vec2(0.55); elb = vec2(1.0); shoZ = vec2(0.15); }
  else if (isAct(8.0)) {
    hip = vec2(1.5); knee = vec2(1.5); drop = 0.39; spine = 0.08; sho = vec2(0.35, 0.3); elb = vec2(0.8, 0.3);
    // Now and then one speaks, with a hand.
    float g = smoothstep(0.4, 0.9, sin(pTime * 0.31 + ph * 7.0));
    sho.y += g * (0.5 + 0.25 * sin(pTime * 2.3 + ph));
    nod = 0.05 * g * sin(pTime * 3.1);
  }
  else if (isAct(9.0)) { hip = vec2(0.0); knee = vec2(1.57); drop = 0.42; spine = 0.05; sho = vec2(0.3); elb = vec2(0.5); }
  else if (isAct(10.0)) { crouch(); sho = vec2(0.9); elb = vec2(0.4); }
  else if (isAct(11.0)) {
    kneelSit();
    float k = sin(gt * 0.8);
    spine = 0.8 + 0.12 * k; sho = vec2(-0.2 + 0.25 * k); elb = vec2(0.1); shoZ = vec2(-0.12); nod = 0.15; yawH = 0.0;
  }
  else if (isAct(12.0)) { kneelSit(); float k = sin(gt * 1.1); spine = 0.7 + 0.1 * k; sho = vec2(-0.05 + 0.2 * k); elb = vec2(0.35); shoZ = vec2(-0.1); yawH = 0.0; }
  else if (isAct(13.0)) { crouch(); spine = 0.35; sho.x = 0.75; elb.x = 1.0; sho.y = 0.9 + 0.55 * max(0.0, sin(gt * 0.5)); elb.y = 0.2; yawH *= 0.3; }
  else if (isAct(14.0)) {
    hip = vec2(1.65); knee = vec2(1.95); drop = 0.47; spread = 0.45; spine = 0.5;
    sho = vec2(0.2 + 0.04 * sin(pTime * 4.0 + ph)); shoZ = vec2(-0.12); elb = vec2(0.5); nod = 0.35; yawH = 0.0;
  }
  else if (isAct(15.0)) { float k = sin(gt * 0.9); sho = vec2(1.45 + 0.3 * k, 1.45 - 0.3 * k); elb = vec2(0.75); shoZ = vec2(0.12); nod = -0.12; yawH *= 0.2; }
  else if (isAct(16.0)) {
    kneelSit(); spine = 0.45;
    float u = fract(pTime * 0.9 + ph);
    float a = smoothstep(0.0, 1.0, u < 0.7 ? u / 0.7 : 1.0 - (u - 0.7) / 0.3);
    sho.x = 0.7; elb.x = 0.5; sho.y = 0.5 + 1.5 * a; elb.y = 1.2 - 0.6 * a; yawH = 0.0; nod = 0.25;
  }
  else if (isAct(17.0)) { float k = sin(gt * 1.3); spine = 0.55; knee = vec2(0.15); hip = vec2(0.1); sho = vec2(0.9 + 0.2 * k, 0.9 - 0.2 * k); twist = 0.3 * k; elb = vec2(0.2); yawH = 0.0; }
  else if (isAct(18.0)) { float k = sin(gt * 1.2); spine = -0.12 + 0.08 * k; sho = vec2(1.5 + 0.5 * k, 1.5 - 0.5 * k); elb = vec2(0.4); knee = vec2(0.2); hip = vec2(0.1); yawH = 0.0; }
  else if (isAct(19.0)) { kneelSit(); float k = sin(gt * 2.0); spine = 0.95; sho = vec2(-0.2 + 0.2 * k, -0.2 - 0.2 * k); elb = vec2(0.15); yawH = 0.0; nod = 0.2; }
  else if (isAct(20.0)) { sho.y = 2.6; shoZ.y = 0.1; elb.y = 2.3; }
  else if (isAct(21.0)) { spine += 0.35; sho = vec2(0.5); elb = vec2(1.7); shoZ = vec2(-0.05); nod = -0.25; }
  else if (isAct(22.0)) { sho.y = -0.35; elb.y = 0.1; shoZ.y = 0.15; }
  else if (isAct(23.0)) { sitGround(); sho.x = 0.55; elb.x = 1.0; sho.y = 0.9 + 0.3 * sin(pTime * 2.1 + ph * 3.0); elb.y = 0.9; nod = 0.06 * sin(pTime * 3.0 + ph); }
  else if (isAct(25.0)) {
    float k = sin(pTime * 5.5 + ph);
    bob = abs(k) * 0.22; knee = vec2(0.5 * (1.0 - abs(k))); hip = knee * 0.5; drop = knee.x * 0.08;
    shoZ = vec2(0.9 + 0.5 * k); elb = vec2(0.3); yawH = 0.6 * sin(pTime * 1.3 + ph);
  }
  else if (isAct(26.0)) { spine += 0.3; sho.y = 0.3; elb.y = 0.3; }
  else if (isAct(27.0)) {
    float k = sin(gt * 1.2);
    hip = vec2(0.45); knee = vec2(0.5); drop = 0.04; spine = 1.0 + 0.08 * k; twist = 0.25 * k;
    sho.x = 1.0 + 0.2 * k; elb.x = 0.3; sho.y = 0.9 + 0.35 * sin(gt * 1.2 + 1.5); shoZ.y = 0.3 + 0.4 * k; elb.y = 0.3; yawH = 0.0; nod = -0.2;
  }
  else if (isAct(28.0)) { hip = vec2(0.5); knee = vec2(0.6); drop = 0.05; spine = 1.15; sho = vec2(0.25); shoZ = vec2(-0.3); elb = vec2(0.6 + 0.4 * sin(gt * 2.0)); yawH = 0.0; }
  else if (isAct(29.0)) {
    float u = fract(gt * 0.22);
    float a = 0.5 - 0.5 * cos(u * 6.2832);
    spread = 0.12; knee = vec2(0.15); sho = vec2(0.5 + 2.0 * a); elb = vec2(0.5 - 0.3 * a); spine = 0.35 - 0.5 * a; nod = -0.3 * a; yawH = 0.0;
  }
  else if (isAct(30.0)) { spine = 0.45; sho = vec2(0.7); elb = vec2(0.3); }
  else if (isAct(31.0)) { hip = vec2(1.35); knee = vec2(1.45); spread = 0.6; sho = vec2(0.45); elb = vec2(1.0); spine = 0.05; bob = abs(sin(pTime * 4.0 + ph)) * 0.025; }
  else if (isAct(32.0)) {
    float pulse = pow(max(0.0, sin(gt * 1.4)), 4.0);
    hip = vec2(0.45, -0.25); knee = vec2(0.55, 0.05); drop = 0.08; spine = 0.15;
    sho.x = 0.9; elb.x = 1.1; sho.y = 0.6 + 0.8 * pulse; elb.y = 1.4 - 1.2 * pulse; yawH = 0.0;
  }
  else if (isAct(33.0)) { sho = vec2(2.5); shoZ = vec2(0.55); elb = vec2(2.0); spine = 0.25 + 0.15 * sin(pTime * 1.1 + ph); nod = 0.35; yawH = 0.0; }
  else if (isAct(34.0)) { sitGround(); sho.x = 0.7; elb.x = 1.1; sho.y = 0.7 + 0.04 * sin(pTime * 6.0 + ph); elb.y = 1.15; nod = 0.5; yawH = 0.0; }
  else if (isAct(35.0)) { crouch(); spine = 0.6; sho = vec2(0.4 + 0.25 * sin(gt * 0.6)); elb = vec2(0.1); yawH = 0.0; }
  else if (isAct(36.0)) { sho.x = 1.5; shoZ.x = 0.25; elb.x = 1.4; sho.y = 0.45; elb.y = 1.1 + 0.15 * sin(pTime * 7.0 + ph); nod = 0.2; }
  else if (isAct(37.0)) { sitGround(); sho = vec2(0.9); elb = vec2(0.7); nod = 0.6; spine = 0.35; yawH = 0.0; }
  // The old stoop, and lift the head to see ahead.
  spine += iLook.w;
  nod -= iLook.w * 0.6;
}

// Hip and knee of one leg, for a point on that leg (or the robe over it).
void legChain(float side, float kneeW, float hipW, inout vec3 p, inout vec3 n) {
  vec3 kp = vec3(side * 0.09 * gW, 0.48, 0.0);
  float k = side > 0.0 ? knee.x : knee.y;
  mat3 K = rotX(k * kneeW);
  p = K * (p - kp) + kp; n = K * n;
  vec3 hp = vec3(side * 0.09 * gW, 0.9, 0.0);
  float h = side > 0.0 ? hip.x : hip.y;
  mat3 H = rotX(-h * hipW) * rotZ(side * spread * hipW);
  p = H * (p - hp) + hp; n = H * n;
}

void animate(inout vec3 p, inout vec3 n) {
  if (hiddenPart()) { p = vec3(0.0, 0.9, 0.0); return; }
  pose();
  // Build: broader or slighter in the body.
  float g = iLook.x > 0.1 ? iLook.x : 1.0;
  gW = 1.0 + (g - 1.0) * 0.6;
  float side = p.x >= 0.0 ? 1.0 : -1.0;
  if (aPart < 1.5) { p.x *= g; p.z *= mix(1.0, g, 0.8); }
  else if ((aPart > 3.5 && aPart < 5.5) || aPart > 9.5) p.x += side * 0.215 * (g - 1.0);
  else if ((aPart > 1.5 && aPart < 3.5) || (aPart > 7.5 && aPart < 9.5)) p.x += side * 0.09 * (gW - 1.0);
  bool upper = aPart < 0.5 || (aPart > 3.5 && aPart < 7.5) || aPart > 9.5;
  if (aPart > 1.5 && aPart < 2.5) legChain(1.0, 0.0, 1.0, p, n);
  else if (aPart > 2.5 && aPart < 3.5) legChain(-1.0, 0.0, 1.0, p, n);
  else if (aPart > 7.5 && aPart < 8.5) legChain(1.0, 1.0, 1.0, p, n);
  else if (aPart > 8.5 && aPart < 9.5) legChain(-1.0, 1.0, 1.0, p, n);
  else if (aPart > 0.5 && aPart < 1.5) {
    // The robe goes with the legs: each half with its own leg, below the
    // knee with the shin, fading out toward the waist.
    float wL = smoothstep(-0.12, 0.12, p.x);
    float hw = smoothstep(0.99, 0.8, p.y);
    float kw = smoothstep(0.54, 0.4, p.y);
    vec3 pl = p, pr = p, nl = n, nr = n;
    legChain(1.0, kw, hw, pl, nl);
    legChain(-1.0, kw, hw, pr, nr);
    p = mix(pr, pl, wL);
    n = normalize(mix(nr, nl, wL));
  }
  else if (aPart > 3.5 && aPart < 5.5 || aPart > 9.5) {
    float sd = (aPart > 3.5 && aPart < 4.5) || (aPart > 9.5 && aPart < 10.5) ? 1.0 : -1.0;
    vec3 sp = vec3(sd * 0.215 * g, 1.36, 0.0);
    if (aPart > 9.5) {
      vec3 ep = vec3(sd * 0.215 * g, 1.11, 0.0);
      mat3 E = rotX(-(sd > 0.0 ? elb.x : elb.y));
      p = E * (p - ep) + ep; n = E * n;
    }
    mat3 S = rotX(-(sd > 0.0 ? sho.x : sho.y)) * rotZ(sd * (sd > 0.0 ? shoZ.x : shoZ.y));
    p = S * (p - sp) + sp; n = S * n;
  }
  else if (aPart > 5.5 && aPart < 6.5) {
    vec3 np = vec3(0.0, 1.47, 0.0);
    mat3 Hd = rotY(yawH) * rotX(nod);
    p = Hd * (p - np) + np; n = Hd * n;
  }
  // Bend and turn the upper body at the waist.
  if (upper) {
    mat3 B = rotY(twist) * rotX(spine);
    p = B * (p - vec3(0.0, 0.93, 0.0)) + vec3(0.0, 0.93, 0.0);
    n = B * n;
  }
  p.y += bob - drop;
}`;

const ANIMAL_ANIM = /* glsl */ `
void animate(inout vec3 p, inout vec3 n) {
  if (hiddenPart()) { p = vec3(0.0, 0.5, 0.0); return; }
  float t = pTime * iAnim.y + iAnim.x;
  float walk = isAct(1.0) ? 1.0 : 0.0;
  float graze = isAct(6.0) ? 1.0 : 0.0;
  float a = walk * sin(t) * 0.45;
  mat3 R = mat3(1.0);
  vec3 piv = vec3(0.0, uv.x, uv.y);
  if (aPart > 1.5 && aPart < 2.5) R = rotX(-a);
  else if (aPart > 2.5 && aPart < 3.5) R = rotX(a);
  else if (aPart > 3.5 && aPart < 4.5) R = rotX(a);
  else if (aPart > 4.5 && aPart < 5.5) R = rotX(-a);
  else if (aPart > 5.5 && aPart < 6.5) {
    R = rotY(sin(pTime * 0.4 + iAnim.x * 4.0) * 0.35 * (1.0 - walk)) * rotX(graze * (0.85 + 0.12 * sin(pTime * 2.0 + iAnim.x)) + walk * 0.06 * sin(t * 2.0));
  }
  else if (aPart > 6.5) R = rotY(sin(pTime * 2.7 + iAnim.x) * 0.4);
  p = R * (p - piv) + piv;
  n = R * n;
  p.y += walk * abs(cos(t)) * 0.02;
}`;

const COLOR = /* glsl */ `
vec3 partColor() {
  if (aMat < 0.5) return iCloth;
  if (aMat < 1.5) return iMantle;
  if (aMat < 2.5) return iSkin;
  if (aMat < 3.5) return vec3(0.16, 0.1, 0.06);
  if (aMat < 4.5) return iHair;
  if (aMat < 5.5) return iSkin;
  if (aMat < 6.5) return vec3(0.55, 0.33, 0.18);
  if (aMat < 7.5) return vec3(0.86, 0.84, 0.78);
  if (aMat < 8.5) return vec3(0.42, 0.3, 0.17);
  if (aMat < 9.5) return vec3(0.32, 0.22, 0.13);
  if (aMat < 10.5) return vec3(0.62, 0.5, 0.26);
  if (aMat < 11.5) return vec3(0.07, 0.065, 0.06);
  return vec3(0.07, 0.1, 0.26);
}`;

// Surface detail, worked out per pixel from the figure's rest position:
// woven cloth with folds, banded and striped mantles, leather grain, hair
// in strands, skin that is not uniform; fleece and coarse hair on animals.
// The pattern fades where it would shimmer, and bends the normal a little.
const SURFACE = /* glsl */ `
varying vec3 vRest;
varying float vMat;
varying float vPat;
float surfH;
float fHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), f.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 bumpNormal(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - g);
}`;

const SURFACE_HUMAN = /* glsl */ `
  surfH = 0.0;
  float ang = atan(vRest.x, vRest.z);
  vec2 cu = vec2(ang * 0.2, vRest.y);
  if (vMat < 1.5 || (vMat > 6.5 && vMat < 7.5)) {
    vec2 q = cu * 240.0;
    float fw = clamp(1.0 - 0.5 * length(fwidth(q)), 0.0, 1.0);
    float weave = sin(q.x * 6.2832) * sin(q.y * 6.2832);
    float fold = sin(ang * 11.0 + vRest.y * 4.0 + fNoise(cu * vec2(9.0, 3.0)) * 3.0);
    surfH = weave * 0.08 * fw + fold * 0.5;
    diffuseColor.rgb *= (0.92 + 0.08 * fNoise(cu * 40.0)) * (1.0 + 0.06 * weave * fw) * (0.93 + 0.07 * fold);
    if (vMat > 0.5 && vMat < 1.5 && vPat > 0.5) {
      // Striped or banded wool, as on the Beni Hasan painting and the Lachish reliefs.
      float st = mod(vPat, 2.0) > 0.5 ? step(0.62, fract(ang * 2.5)) : 0.0;
      float bd = vPat > 1.5 ? step(0.72, fract(vRest.y * 5.0)) : 0.0;
      vec3 dye = vPat > 2.5 ? vec3(0.12, 0.13, 0.3) : vec3(0.42, 0.07, 0.04);
      diffuseColor.rgb = mix(diffuseColor.rgb, dye, max(st, bd) * 0.75);
    }
  } else if (vMat < 2.5 || (vMat > 4.5 && vMat < 5.5)) {
    diffuseColor.rgb *= 0.94 + 0.1 * fNoise(vRest.xy * 35.0 + vRest.z * 20.0);
  } else if (vMat < 3.5) {
    float g = fNoise(vRest.xz * 90.0 + vRest.y * 70.0);
    diffuseColor.rgb *= 0.75 + 0.45 * g;
    surfH = g * 0.25;
  } else if (vMat < 4.5) {
    float s = fNoise(vec2(ang * 28.0, vRest.y * 4.0));
    diffuseColor.rgb *= 0.7 + 0.55 * s;
    surfH = s * 0.3;
  } else if (vMat < 6.5 || vMat > 8.5 && vMat < 10.5) {
    float g = fNoise(vec2(ang * 5.0 + vRest.x * 20.0, vRest.y * 45.0));
    diffuseColor.rgb *= 0.82 + 0.3 * g;
    surfH = g * 0.15;
  }`;

const SURFACE_ANIMAL = /* glsl */ `
  surfH = 0.0;
  if (vMat < 1.5) {
    if (vPat > 0.5) {
      // Fleece: tight curls.
      float c = fNoise(vRest.xz * 55.0 + vRest.y * 40.0) * 0.6 + fNoise(vRest.zy * 110.0) * 0.4;
      diffuseColor.rgb *= 0.78 + 0.35 * c;
      surfH = c * 0.6;
    } else {
      // Coarse hair running along the body.
      float h = fNoise(vec2(vRest.x * 70.0 + vRest.y * 50.0, vRest.z * 5.0));
      diffuseColor.rgb *= 0.82 + 0.3 * h;
      surfH = h * 0.25;
    }
  } else if (vMat > 6.5 && vMat < 7.5 || vMat > 9.5) {
    float g = fNoise(vRest.xz * 60.0 + vRest.y * 30.0);
    diffuseColor.rgb *= 0.85 + 0.25 * g;
  } else if (vMat > 8.5 && vMat < 9.5) {
    diffuseColor.rgb *= 0.8 + 0.35 * fNoise(vec2(vRest.x * 6.0 + vRest.z * 6.0, vRest.y * 50.0));
  }`;

function patchFigure(mat, animGLSL, faceMap) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.pTime = shared.pTime;
    if (faceMap) shader.uniforms.faceMap = { value: faceMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${animGLSL}\n${COLOR}\nvarying vec2 vFaceUv;\nvarying float vFace;\nvarying vec3 vHair;\nvarying vec3 vRest;\nvarying float vMat;\nvarying float vPat;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 animP = position;\nanimate(animP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = animP;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        vColor.rgb *= partColor();
        vFace = (aMat > 4.5 && aMat < 5.5) ? 1.0 : 0.0;
        vHair = iHair;
        vRest = position;
        vMat = aMat;
        vPat = iLook.y;
        vFaceUv = (vec2(mod(iFace, 4.0), floor(iFace / 4.0 + 0.001)) + uv) / 4.0;`)
      // Look up received shadows a few centimetres out along the normal: on
      // bodies this small the usual bias leaves speckled self-shadow.
      .replace('#include <shadowmap_vertex>', `#ifdef USE_SHADOWMAP
        vec4 figWorld = worldPosition;
        worldPosition.xyz += normalize(inverseTransformDirection(transformedNormal, viewMatrix)) * 0.035;
        #endif
        #include <shadowmap_vertex>
        #ifdef USE_SHADOWMAP
        worldPosition = figWorld;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vFaceUv;\nvarying float vFace;\nvarying vec3 vHair;${faceMap ? '\nuniform sampler2D faceMap;' : ''}\n${SURFACE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${faceMap ? SURFACE_HUMAN : SURFACE_ANIMAL}
        ${faceMap ? `if (vFace > 0.5) {
          vec4 f = texture2D(faceMap, vFaceUv);
          vec3 c = diffuseColor.rgb * f.r;
          c = mix(c, vec3(0.8, 0.77, 0.72) * f.r, f.g);
          diffuseColor.rgb = mix(c, vHair * (0.55 + 0.6 * f.r), f.b);
        }` : ''}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = bumpNormal(-vViewPosition, normal, surfH * 0.006);');
  };
  mat.customProgramCacheKey = () => (faceMap ? 'figure-human-v3' : 'figure-animal-v3');
}

// Shadows follow the same poses.
function depthMaterial(animGLSL) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.pTime = shared.pTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${animGLSL}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = position;\nvec3 animN = vec3(0.0, 1.0, 0.0);\nanimate(transformed, animN);');
  };
  m.customProgramCacheKey = () => 'figure-depth-v2-' + animGLSL.length;
  return m;
}

let KIT = null;
export function figureKit(detail = 'high') {
  if (KIT) return KIT;
  const faceMap = faceAtlas();
  const human = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  patchFigure(human, HUMAN_ANIM, faceMap);
  const animal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  patchFigure(animal, ANIMAL_ANIM, null);
  const geos = Object.fromEntries(Object.keys(KIND).map((k) => [k, human_(k, detail)]));
  geos.beast = quadruped(detail);
  geos.camel = quadruped(detail, 'camel');
  geos.horse = quadruped(detail, 'horse');
  KIT = { human, animal, geos, depthHuman: depthMaterial(HUMAN_ANIM), depthAnimal: depthMaterial(ANIMAL_ANIM) };
  return KIT;
}
const human_ = human;

// --- Paths ----------------------------------------------------------------------
// A polyline with heights, sampled by distance along it.
export class Path {
  constructor(pts, { loop = false } = {}) {
    this.pts = pts;              // [[x, y, z], ...]
    this.loop = loop;
    this.d = [0];
    for (let i = 1; i < pts.length; i++) this.d.push(this.d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    this.length = this.d[this.d.length - 1];
    this.i = 0;
  }
  sample(s, out) {
    const d = this.d, n = d.length;
    s = Math.max(0, Math.min(this.length, s));
    let i = Math.min(this.i, n - 2);
    while (i > 0 && d[i] > s) i--;
    while (i < n - 2 && d[i + 1] < s) i++;
    this.i = i;
    const a = this.pts[i], b = this.pts[i + 1];
    const t = (s - d[i]) / Math.max(1e-6, d[i + 1] - d[i]);
    out.x = a[0] + (b[0] - a[0]) * t;
    out.y = a[1] + (b[1] - a[1]) * t;
    out.z = a[2] + (b[2] - a[2]) * t;
    out.dx = b[0] - a[0];
    out.dz = b[2] - a[2];
    return out;
  }
}

// Rounded corners: two passes of Chaikin's algorithm on [x, z] points.
export function smoothPts(pts, passes = 2) {
  for (let k = 0; k < passes; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// Whether hour h falls in the window [a, b), which may run past midnight.
export const inHours = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);

// Clicks on one instance of a mesh open that instance's card. The mesh
// remembers which instance was hit nearest, and reports its card.
export function perInstanceInfo(im, infos, fallback) {
  if (!infos.some(Boolean)) { im.userData.infoId = fallback; return; }
  im.raycast = function (raycaster, hits) {
    const n0 = hits.length;
    this.boundingSphere = null;                  // they move: measure afresh
    THREE.InstancedMesh.prototype.raycast.call(this, raycaster, hits);
    let best = null;
    for (let k = n0; k < hits.length; k++) if (!best || hits[k].distance < best.distance) best = hits[k];
    this.userData.hitInfo = best ? infos[best.instanceId] || fallback : fallback;
  };
  Object.defineProperty(im.userData, 'infoId', { get: () => im.userData.hitInfo || fallback, enumerable: true, configurable: true });
}

// Passes that draw the scene with one override material (the normal pass of
// the ambient occlusion) would draw every hidden prop and garment, unposed:
// such meshes draw nothing in those passes. Shadows use the mesh's own depth
// material and are unaffected.
export function ownPassesOnly(mesh) {
  mesh.onBeforeRender = function (renderer, scene, camera, geometry, material) {
    if (material !== this.material) { this.userData.count = this.count; this.count = 0; }
  };
  mesh.onAfterRender = function () {
    if (this.userData.count !== undefined) { this.count = this.userData.count; this.userData.count = undefined; }
  };
}

// --- Crowds -------------------------------------------------------------------------
// One crowd per scene group. Agents are added first, then build() creates
// the instanced meshes; update() moves them every frame.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmp = {};

// Where the camera is looking: local walkers gather there (see update()).
export const focus = new THREE.Vector3();

export class Crowd {
  constructor(name, { infoHuman = 'city-people', infoBeast = 'city-flock' } = {}) {
    this.group = new THREE.Group();
    this.group.name = name;
    this.agents = [];
    this.level = 1;
    this.hour = -1;
    this.pool = null;          // { bins: Map, cell, reach, far } of paths for local walkers
    this.regather = 0;
    this.gathered = new THREE.Vector3(1e9, 0, 0);
    this.info = { human: infoHuman, beast: infoBeast };
    this.group.userData.update = (t, dt) => this.update(t, dt);
  }

  // Paths that local walkers may move to, binned by where they are. Walkers
  // farther than `far` from the view move to paths within `reach` cells of it.
  setPathPool(paths, cell = 90, { reach = 2, far = 260 } = {}) {
    const bins = new Map();
    for (const p of paths) {
      const m = p.pts[Math.floor(p.pts.length / 2)];
      const key = Math.floor(m[0] / cell) + ',' + Math.floor(m[2] / cell);
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(p);
    }
    this.pool = { bins, cell, reach, far };
    this.near = [];
  }

  // Walkers far from the view move to lanes near it, so the streets you look
  // at are busy without drawing a crowd across the whole city.
  gather() {
    const { bins, cell, reach, far } = this.pool;
    const near = this.near;
    near.length = 0;
    const cx = Math.floor(focus.x / cell), cz = Math.floor(focus.z / cell);
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
      const b = bins.get((cx + i) + ',' + (cz + j));
      if (b) for (const p of b) near.push(p);
    }
    if (!near.length) return;
    for (const a of this.agents) {
      if (!a.local || !a.on || !a.path) continue;
      if (Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) < far) continue;
      a.path = near[Math.floor(Math.random() * near.length)];
      a.s = Math.random() * a.path.length;
      a.dir = Math.random() < 0.5 ? 1 : -1;
      a.path.i = 0;
    }
  }

  // a: { kind, x, y, z, yaw, scale, tall, build, look, stoop, cloth, mantle, skin, hair,
  //      face, prop, act, path, speed, s, dir, pause, loop, lateral, shift, wander,
  //      follow, gap, lift, ride, win, cycle, ends, back, info }
  add(a) {
    const agent = {
      scale: 1, tall: 1, build: 1, pat: 0, look: 0, stoop: 0, yaw: 0, act: ACT.idle, speed: 0, dir: 1, s: 0, lateral: 0, pause: [2, 8], wait: 0,
      shift: Math.random(), phase: Math.random() * 6.28, prop: PROP.none, face: 0,
      cloth: [0.7, 0.62, 0.5], mantle: [0.5, 0.42, 0.32], skin: [0.42, 0.27, 0.18], hair: [0.05, 0.035, 0.025], ...a,
    };
    agent.moveAct = agent.moveAct ?? (MOVING.has(agent.act) ? agent.act : ACT.walk);
    agent.restAct = agent.restAct ?? (agent.path || agent.wander ? ACT.idle : agent.act);
    if (agent.back) agent.fwd = { act: agent.moveAct, prop: agent.prop };
    if (agent.path) agent.act = agent.moveAct;
    agent.pos = { x: agent.x || 0, y: agent.y || 0, z: agent.z || 0 };
    if (agent.cycle) { agent.ci = Math.floor(Math.random() * agent.cycle.length); agent.ct = Math.random() * agent.cycle[agent.ci][1]; agent.act = agent.cycle[agent.ci][0]; }
    this.agents.push(agent);
    return agent;
  }

  build(kit) {
    const byKind = {};
    for (const a of this.agents) (byKind[a.kind] ||= []).push(a);
    for (const [kind, list] of Object.entries(byKind)) {
      const beast = BEASTS.has(kind);
      const geo = kit.geos[kind].clone();
      const n = list.length;
      const attr = (size) => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
      const A = { iCloth: attr(3), iMantle: attr(3), iSkin: attr(3), iHair: attr(3), iAnim: attr(4), iLook: attr(4) };
      for (const [k, v] of Object.entries(A)) geo.setAttribute(k, v);
      const im = new THREE.InstancedMesh(geo, beast ? kit.animal : kit.human, n);
      im.customDepthMaterial = beast ? kit.depthAnimal : kit.depthHuman;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      perInstanceInfo(im, list.map((a) => a.info), beast ? this.info.beast : this.info.human);
      ownPassesOnly(im);
      list.forEach((a, i) => {
        a.im = im; a.i = i; a.A = A;
        A.iCloth.setXYZ(i, ...a.cloth);
        A.iMantle.setXYZ(i, ...a.mantle);
        A.iSkin.setXYZ(i, ...a.skin);
        A.iHair.setXYZ(i, ...a.hair);
        A.iLook.setXYZW(i, a.build, a.pat, a.look, a.stoop);
        this.setAct(a, a.act);
        a.on = true;
        this.place(a);
      });
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      A.iAnim.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
    }
    // Contact shadows, one quad for every agent.
    const disc = new THREE.PlaneGeometry(1, 1);
    disc.rotateX(-Math.PI / 2);
    this.contact = new THREE.InstancedMesh(disc, contactMaterial(), Math.max(1, this.agents.length));
    this.contact.frustumCulled = false;
    this.contact.raycast = () => {};
    this.contact.renderOrder = 1;
    ownPassesOnly(this.contact);
    this.contact.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.agents.forEach((a, i) => {
      a.ci2 = i;
      const big = a.kind === 'camel' ? [1.0, 2.2] : a.kind === 'horse' ? [0.8, 1.9] : BEASTS.has(a.kind) ? [0.75, 1.25] : [0.75, 0.75];
      a.disc = big;
      this.place(a);
    });
    this.group.add(this.contact);
    for (const a of this.agents) {
      if (!a.follow) continue;
      a.follow.followers = [...(a.follow.followers || []), a];
      a.shift = a.follow.shift;
      a.always = a.follow.always;
      a.win = a.win || a.follow.win;
      a.win2 = a.win2 || a.follow.win2;
    }
    return this;
  }

  setAct(a, act) {
    a.act = act;
    const beast = BEASTS.has(a.kind);
    const gait = beast ? (act === ACT.walk ? Math.PI * 2 * (a.speed || 0.6) / ((a.kind === 'camel' ? 1.5 : a.kind === 'horse' ? 1.3 : 0.9) * a.scale) : 1)
      : (MOVING.has(act) ? Math.PI * 2 * (a.speed || 1.2) / ((act === ACT.run ? 2.4 : 1.45) * a.scale) : 1);
    a.A.iAnim.setXYZW(a.i, a.phase, gait, act, a.face + 16 * a.prop);
    a.A.iAnim.needsUpdate = true;
  }

  place(a) {
    if (!a.on) {
      a.im.setMatrixAt(a.i, ZERO);
      if (a.disc) this.contact.setMatrixAt(a.ci2, ZERO);
      return;
    }
    _p.set(a.pos.x, a.pos.y, a.pos.z);
    _q.setFromAxisAngle(Y_AXIS, a.yaw);
    a.im.setMatrixAt(a.i, _m.compose(_p, _q, _s.set(a.scale, a.scale * a.tall, a.scale)));
    if (a.disc) {
      // Riders and those standing on a sledge cast theirs with the beast.
      if (a.lift > 0.2) { this.contact.setMatrixAt(a.ci2, ZERO); return; }
      _p.y -= (a.lift || 0) - 0.03;
      const k = a.act === ACT.sit || a.act === ACT.sell || a.act === ACT.write || a.act === ACT.grieve ? 1.35 : 1;
      this.contact.setMatrixAt(a.ci2, _m.compose(_p, _q, _s.set(a.disc[0] * a.scale * k, 1, a.disc[1] * a.scale * k)));
    }
  }

  show(a, on) {
    if (on === a.on) return;
    a.on = on;
    this.place(a);
    a.im.instanceMatrix.needsUpdate = true;
  }

  // Fraction of people out and about (time of day). Each agent has a shift.
  setLevel(level) {
    if (Math.abs(level - this.level) < 0.01) return;
    this.level = level;
    for (const a of this.agents) this.show(a, (a.always || a.shift < level) && (!a.win || this.inWin(a)));
  }

  // The hour, for agents that keep hours of their own (a.win = [from, to]);
  // their start and end are spread a little by their shift.
  setHour(h) {
    if (Math.abs(h - this.hour) < 0.04) return;
    this.hour = h;
    for (const a of this.agents) if (a.win) this.show(a, (a.always || a.shift < this.level) && this.inWin(a));
  }

  inWin(a) {
    if (this.hour < 0) return true;
    const j = (a.shift - 0.5) * (a.jitter ?? 0.8);
    const w = (win) => inHours(this.hour, (win[0] + j + 24) % 24, (win[1] + j + 24) % 24);
    return w(a.win) || (a.win2 ? w(a.win2) : false);
  }

  update(time, dt) {
    dt = Math.min(dt, 0.1);
    // Regather now and then, and at once when the view jumps somewhere new.
    if (this.pool && ((this.regather -= dt) <= 0 || this.gathered.distanceTo(focus) > 120)) {
      this.regather = 1.5;
      this.gathered.copy(focus);
      this.gather();
    }
    for (const a of this.agents) {
      if (!a.on) continue;
      if (a.path) this.walkPath(a, dt);
      else if (a.wander) this.walkWander(a, dt);
      else {
        // Stationary work that changes now and then (a.cycle = [[act, seconds], ...]).
        if (a.cycle && (a.ct -= dt) <= 0) {
          a.ci = (a.ci + 1) % a.cycle.length;
          a.ct = a.cycle[a.ci][1] * (0.7 + Math.random() * 0.6);
          this.setAct(a, a.cycle[a.ci][0]);
        }
        continue;
      }
      this.place(a);
    }
    for (const a of this.agents) {
      if (!a.on || !a.followers) continue;
      const L = a.path.length;
      for (const f of a.followers) {
        // Follow a little behind the leader along its path.
        let s = a.s - a.dir * (f.gap ?? 2.2);
        if (a.loop) s = ((s % L) + L) % L;
        const p = a.path.sample(s, tmp);
        const len = Math.hypot(p.dx, p.dz) || 1;
        const lat = (f.lateral || 0) * a.dir;
        f.pos.x = p.x + lat * p.dz / len;
        f.pos.y = p.y + (f.lift || 0);
        f.pos.z = p.z - lat * p.dx / len;
        if (a.wait <= 0) f.yaw = Math.atan2(p.dx * a.dir, p.dz * a.dir);
        if (!f.ride) {
          const want = a.wait <= 0 ? f.moveAct : f.restAct;
          if (f.act !== want) { f.speed = a.speed; this.setAct(f, want); }
        }
        f.on = a.on;
        this.place(f);
      }
    }
    for (const im of this.group.children) im.instanceMatrix.needsUpdate = true;
  }

  walkPath(a, dt) {
    const path = a.path;
    if (a.wait > 0) {
      a.wait -= dt;
      if (a.wait <= 0) this.setAct(a, a.moveAct);
    } else {
      a.s += a.speed * dt * a.dir;
      if (a.s >= path.length || a.s <= 0) {
        const atEnd = a.s >= path.length;
        if (a.loop && atEnd) a.s -= path.length;
        else {
          a.s = Math.max(0, Math.min(path.length, a.s));
          a.dir = -a.dir;
          // Going out and coming back can differ: an empty jar out, a full one home.
          if (a.back) { const w = a.dir > 0 ? a.fwd : a.back; a.moveAct = w.act; a.prop = w.prop; }
        }
        const pause = a.pauses ? a.pauses[atEnd ? 1 : 0] : a.pause;
        a.wait = pause[0] + Math.random() * (pause[1] - pause[0]);
        if (a.wait > 0) this.setAct(a, a.ends ? a.ends[atEnd ? 1 : 0] : a.restAct);
        else if (a.back) this.setAct(a, a.moveAct);
      }
    }
    const p = path.sample(a.s, tmp);
    const len = Math.hypot(p.dx, p.dz) || 1;
    a.pos.x = p.x + a.lateral * p.dz / len;
    a.pos.y = p.y + (a.lift || 0);
    a.pos.z = p.z - a.lateral * p.dx / len;
    if (a.wait <= 0) a.yaw = Math.atan2(p.dx * a.dir, p.dz * a.dir);
    else if (a.restYaw !== undefined) a.yaw = a.restYaw[a.s > 0 ? 1 : 0];
  }

  // Animals drift about a centre: walk to a nearby spot, graze, repeat.
  walkWander(a, dt) {
    const w = a.wander;
    if (a.wait > 0) {
      a.wait -= dt;
      if (a.wait <= 0) {
        const r = Math.sqrt(Math.random()) * w.r, ang = Math.random() * 6.28;
        a.tx = w.x + Math.cos(ang) * r;
        a.tz = w.z + Math.sin(ang) * r;
        this.setAct(a, w.move ?? ACT.walk);
      }
      return;
    }
    if (a.tx === undefined) { a.wait = Math.random() * 6; this.setAct(a, w.rest ?? ACT.graze); return; }
    const dx = a.tx - a.pos.x, dz = a.tz - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.3) {
      a.wait = w.pause[0] + Math.random() * (w.pause[1] - w.pause[0]);
      this.setAct(a, w.rest ?? ACT.graze);
      return;
    }
    const step = Math.min(d, a.speed * dt);
    a.pos.x += dx / d * step;
    a.pos.z += dz / d * step;
    a.pos.y = w.y(a.pos.x, a.pos.z);
    a.yaw = Math.atan2(dx, dz);
  }
}
