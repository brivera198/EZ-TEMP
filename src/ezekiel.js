// Ezekiel's temple (Ezek 40–48). Built in a local frame measured in long
// cubits: u = east, v = south, y = up from the precinct's base ground.
// The precinct centre is the origin; the outer wall runs from -250 to +250.
import * as THREE from 'three';
import { Builder, aeolicCapital } from './builder.js';
import { CUBIT, LEVEL, EZ_CENTER_X, BASE_Y, CITY_GATES } from './data.js';
import { terrainY } from './terrain.js';
import { VISION_SKIP } from './vision.js';

const O = LEVEL.outer;   // 3.5  outer court
const I = LEVEL.inner;   // 7.5  inner court
const H = LEVEL.house;   // 13.5 house floor
const GATE_H = 20;       // gate wall height above its floor (LXX 40:14 reading)
const HOUSE_H = 30;      // not given by Ezekiel; Solomon's height (1 Kgs 6:2)

export const toWorld = (u, y, v) => new THREE.Vector3(EZ_CENTER_X + u * CUBIT, BASE_Y + y * CUBIT, v * CUBIT);

// ---------------------------------------------------------------------------
// Gate-building (Ezek 40:6–16). Plan coordinates: a runs 0..50 from the
// outer threshold inward, b runs across (-12.5..12.5 inside the walls).
// Sequence along a: threshold 6 · room 6 · pier 5 · room 6 · pier 5 · room 6 ·
// threshold 6 · vestibule 8 · jambs 2 = 50.
function gate(bld, o) {
  const { u0, v0, du, dv, floor, below, steps, porchOut, shut, id, label } = o;
  const lu = -dv, lv = du;
  const frame = (a0, a1, b0, b1) => {
    const us = [], vs = [];
    for (const a of [a0, a1]) for (const b of [b0, b1]) { us.push(u0 + du * a + lu * b); vs.push(v0 + dv * a + lv * b); }
    return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  };
  const raw = (key, a0, a1, b0, b1, y0, y1) => {
    const [ua, ub, va, vb] = frame(a0, a1, b0, b1);
    bld.box(key, ua, ub, y0, y1, va, vb);
  };
  // Plan has the vestibule at the inner end; inner gates are reversed (40:31).
  const P = (key, a0, a1, b0, b1, y0, y1) => {
    if (porchOut) [a0, a1] = [50 - a1, 50 - a0];
    raw(key, a0, a1, b0, b1, y0, y1);
  };
  const top = floor + GATE_H;

  raw('pavement', 0, 50, -13.5, 13.5, below, floor + 0.12);
  // Steps: 7 to the outer court, 8 to the inner (40:22, 31)
  const rise = (floor - below) / steps;
  for (let i = 0; i < steps; i++) {
    raw('ashlar', -steps + i, -steps + i + 1, -7, 7, below - 0.6, below + rise * (i + 1));
  }
  for (const s of [-1, 1]) {
    P('ashlar', 0, 50, s * 12.5, s * 13.5, floor, top);                   // side walls
    for (const [a0, a1] of [[0, 6], [12, 17], [23, 28], [34, 40]]) {     // thresholds and piers
      P('ashlar', a0, a1, s * 6.5, s * 12.5, floor, top);
    }
    for (const [a0, a1] of [[6, 12], [17, 23], [28, 34]]) {              // barrier, 1 cubit (40:12)
      P('ashlar', a0, a1, s * 6.5, s * 7.5, floor, floor + 1);
    }
    P('roof', 0, 40, s * 6.5, s * 13.5, top - 1, top + 0.3);             // roofs of the rooms (40:13)
    P('ashlar', 48, 50, s * 6.5, s * 13.5, floor, top);                  // jambs, 2 cubits (40:9)
    P('palmStone', 50, 50.12, s * 7, s * 12.5, floor + 1, floor + 13);  // palm trees on the jambs (40:16)
    P('palmStone', -0.12, 0, s * 7, s * 12.5, floor + 1, floor + 13);
    for (const [a0, a1] of [[8, 10], [19, 21], [30, 32], [43, 45]]) {    // narrow windows (40:16)
      P('window', a0, a1, s * 13.5, s * 13.62, floor + 9, floor + 15);
    }
  }
  // Proto-Aeolic capitals crown the palm-tree pilasters. The Iron Age volute
  // capital is often read as a stylised palm (40:16).
  for (const planA of [0, 50]) for (const s of [-1, 1]) {
    const outward = (planA === 50 ? 1 : -1) * (porchOut ? -1 : 1);
    const a = (porchOut ? 50 - planA : planA) + outward * 0.15;
    const b = s * 9.75;
    bld.geom('ashlar', aeolicCapital(5.2), u0 + du * a + lu * b, floor + 13, v0 + dv * a + lv * b, Math.atan2(du * outward, dv * outward));
  }
  P('ashlar', 48, 50, -6.5, 6.5, floor + 14, top);   // lintel over the vestibule opening
  P('ashlar', 0, 1.5, -6.5, 6.5, floor + 14, top);   // lintel over the entrance
  P('roof', 40, 50, -13.5, 13.5, top - 1, top + 0.3); // vestibule roof
  if (shut) P('door', 1.5, 2.2, -6.5, 6.5, floor, floor + 14); // shut for ever (44:1–2)

  const [ua, ub, va, vb] = frame(-steps, 50, -13.5, 13.5);
  bld.zone(id, ua, ub, below, top + 0.3, va, vb);
  return { label, pos: toWorld((ua + ub) / 2, top + 4, (va + vb) / 2) };
}

// Small simple room with a dark doorway on one side.
function room(bld, u0, u1, v0, v1, y0, h, doorSide) {
  bld.box('ashlarDark', u0, u1, y0, y0 + h, v0, v1);
  bld.box('roof', u0 - 0.2, u1 + 0.2, y0 + h, y0 + h + 0.5, v0 - 0.2, v1 + 0.2);
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const d = 0.12;
  if (doorSide === 'n') bld.box('window', cu - 1.5, cu + 1.5, y0, y0 + 6, v0 - d, v0);
  if (doorSide === 's') bld.box('window', cu - 1.5, cu + 1.5, y0, y0 + 6, v1, v1 + d);
  if (doorSide === 'e') bld.box('window', u1, u1 + d, y0, y0 + 6, cv - 1.5, cv + 1.5);
  if (doorSide === 'w') bld.box('window', u0 - d, u0, y0, y0 + 6, cv - 1.5, cv + 1.5);
}

function hearth(bld, fires, u, v, y) {
  bld.box('ashlarDark', u - 1.5, u + 1.5, y, y + 1.4, v - 1, v + 1);
  bld.box('ember', u - 1.1, u + 1.1, y + 1.4, y + 1.55, v - 0.6, v + 0.6);
  fires.push({ u, v, y: y + 1.5, s: 0.9 });
}

// With `vision` (from makeVisionLooks), the same plan is merged by part type
// into the glowing overlay instead of solid stone.
export function buildEzekiel(mats, { vision = null } = {}) {
  const bld = new Builder(mats);
  const group = new THREE.Group();
  group.position.set(EZ_CENTER_X, BASE_Y, 0);
  group.scale.setScalar(CUBIT);
  const labels = [];
  const fires = [];

  // --- Outer court, pavement, wall (40:5, 17–19; 42:15–20) ------------------
  bld.tag = 'court';
  bld.box('earth', -244, 244, 0, O, -244, 244);
  bld.zone('ez-outer-court', -244, 244, O - 0.2, O + 0.25, -244, 244);
  const strips = [[-244, 244, -244, -200], [-244, 244, 200, 244], [200, 244, -200, 200], [-244, -200, -200, 200]];
  for (const [u0, u1, v0, v1] of strips) {
    bld.box('pavement', u0, u1, O, O + 0.06, v0, v1);
    bld.zone('ez-pavement', u0, u1, O - 0.2, O + 0.3, v0, v1);
  }
  const wallTop = O + 6; // one reed above the court (40:5)
  bld.tag = 'wall';
  const walls = [
    [-250, -13.5, -250, -244], [13.5, 250, -250, -244],   // north
    [-250, -13.5, 244, 250], [13.5, 250, 244, 250],       // south
    [244, 250, -244, -13.5], [244, 250, 13.5, 244],       // east
    [-250, -244, -244, -50], [-250, -244, 50, 244],       // west (the western building closes the middle)
  ];
  for (const [u0, u1, v0, v1] of walls) {
    bld.box('ashlar', u0, u1, 0, wallTop, v0, v1);
    bld.box('ashlarDark', u0 - 0.2, u1 + 0.2, wallTop, wallTop + 0.4, v0 - 0.2, v1 + 0.2);
    bld.zone('ez-wall', u0, u1, 0, wallTop + 0.4, v0, v1);
  }

  // --- Gates -----------------------------------------------------------------
  bld.tag = 'gate';
  labels.push(gate(bld, { u0: 250, v0: 0, du: -1, dv: 0, floor: O, below: 0, steps: 7, porchOut: false, shut: true, id: 'ez-gate-east', label: 'East gate (shut)' }));
  labels.push(gate(bld, { u0: 0, v0: -250, du: 0, dv: 1, floor: O, below: 0, steps: 7, porchOut: false, id: 'ez-gate-outer', label: 'North gate' }));
  labels.push(gate(bld, { u0: 0, v0: 250, du: 0, dv: -1, floor: O, below: 0, steps: 7, porchOut: false, id: 'ez-gate-outer', label: 'South gate' }));
  labels.push(gate(bld, { u0: 100, v0: 0, du: -1, dv: 0, floor: I, below: O, steps: 8, porchOut: true, id: 'ez-gate-inner', label: 'Inner east gate' }));
  labels.push(gate(bld, { u0: 0, v0: -100, du: 0, dv: 1, floor: I, below: O, steps: 8, porchOut: true, id: 'ez-gate-inner', label: 'Inner north gate' }));
  labels.push(gate(bld, { u0: 0, v0: 100, du: 0, dv: -1, floor: I, below: O, steps: 8, porchOut: true, id: 'ez-gate-inner', label: 'Inner south gate' }));

  // --- Thirty chambers on the pavement (40:17) ---------------------------------
  bld.tag = 'chamber';
  const spans = [[25, 55], [59, 89], [93, 123], [127, 157], [161, 191]];
  for (const s of [-1, 1]) {
    for (const [a, b] of spans) for (const k of [-1, 1]) {
      const u0 = k * a, u1 = k * b;
      room(bld, Math.min(u0, u1), Math.max(u0, u1), s < 0 ? -244 : 224, s < 0 ? -224 : 244, O, 9, s < 0 ? 's' : 'n');
      bld.zone('ez-chambers30', Math.min(u0, u1), Math.max(u0, u1), O, O + 9.5, s < 0 ? -244 : 224, s < 0 ? -224 : 244);
      if (s > 0) {
        room(bld, 224, 244, Math.min(u0, u1), Math.max(u0, u1), O, 9, 'w');
        bld.zone('ez-chambers30', 224, 244, O, O + 9.5, Math.min(u0, u1), Math.max(u0, u1));
      }
    }
  }
  labels.push({ label: 'Thirty chambers', pos: toWorld(234, O + 14, -110) });

  // --- Corner kitchens (46:21–24): 40 × 30 cubit courts ---------------------
  for (const su of [-1, 1]) for (const sv of [-1, 1]) {
    const u0 = su > 0 ? 204 : -244, u1 = su > 0 ? 244 : -204;
    const v0 = sv > 0 ? 214 : -244, v1 = sv > 0 ? 244 : -214;
    const ui = su > 0 ? u0 : u1;      // inner (court-facing) u edge
    const vi = sv > 0 ? v0 : v1;
    bld.box('ashlarDark', ui - 0.75, ui + 0.75, O, O + 5, Math.min(v0, v1), Math.max(v0, v1));
    const gapC = (u0 + u1) / 2;
    bld.box('ashlarDark', u0, gapC - 3, O, O + 5, vi - 0.75, vi + 0.75);
    bld.box('ashlarDark', gapC + 3, u1, O, O + 5, vi - 0.75, vi + 0.75);
    for (let k = 0; k < 4; k++) {
      const hu = u0 + 6 + k * 9.3;
      hearth(bld, fires, hu, sv > 0 ? v1 - 3 : v0 + 3, O);
    }
    bld.zone('ez-kitchen', u0, u1, O, O + 5, v0, v1);
  }

  // --- Inner court (40:47) ---------------------------------------------------
  bld.tag = 'court';
  bld.box('pavement', -150, 50, O, I, -50, 50);
  bld.zone('ez-inner-court', -50, 50, I - 0.2, I + 0.3, -50, 50);
  const iw = I + 5;
  bld.tag = 'wall';
  const innerWalls = [
    [47, 50, -50, -13.5], [47, 50, 13.5, 50],
    [-150, -13.5, -50, -47], [13.5, 50, -50, -47],
    [-150, -13.5, 47, 50], [13.5, 50, 47, 50],
    [-150, -147, -50, -30], [-150, -147, 30, 50],
  ];
  for (const [u0, u1, v0, v1] of innerWalls) {
    bld.box('ashlar', u0, u1, O, iw, v0, v1);
    bld.box('ashlarDark', u0 - 0.2, u1 + 0.2, iw, iw + 0.35, v0 - 0.2, v1 + 0.2);
  }
  for (const s of [-1, 1]) {
    bld.zone('ez-yard', -150, -50, I - 0.2, I + 0.3, s * 30, s * 50);
  }

  // Chambers for the priests on duty (40:44–46)
  bld.tag = 'chamber';
  room(bld, 16, 40, -47, -37, I, 8, 's');
  room(bld, 16, 40, 37, 47, I, 8, 'n');
  bld.zone('ez-singers', 16, 40, I, I + 8.5, -47, -37);
  bld.zone('ez-singers', 16, 40, I, I + 8.5, 37, 47);

  // Tables at the north inner gate (40:39–42)
  bld.tag = 'altar';
  for (const s of [-1, 1]) {
    for (const vc of [-97, -93.5]) bld.box('ashlarDark', s * 9.5 - 0.75, s * 9.5 + 0.75, I, I + 1.4, vc - 1.25, vc + 1.25);
    for (const uc of [16.5, 20]) {
      bld.box('ashlarDark', s * uc - 0.75, s * uc + 0.75, O, O + 1.4, -105.25, -102.75);
      bld.box('ashlar', s * uc - 0.75, s * uc + 0.75, O, O + 1, -110.75, -109.25); // hewn stone, 1½ × 1½ × 1
    }
  }
  bld.zone('ez-tables', -21, 21, O, O + 1.6, -111, -102);
  bld.zone('ez-tables', -10.5, 10.5, I, I + 1.6, -99, -92);

  // --- Altar (43:13–17) -----------------------------------------------------------
  const altar = [[9, 0, 1], [8, 1, 3], [7, 3, 7], [6, 7, 11]];
  altar.forEach(([r, y0, y1], i) => bld.box(i === 3 ? 'ashlarDark' : 'ashlar', -r, r, I + y0, I + y1, -r, r));
  bld.box('ashlarDark', -9, 9, I + 1, I + 1.25, -9, -8.75);  // rim of a span around the base
  bld.box('ashlarDark', -9, 9, I + 1, I + 1.25, 8.75, 9);
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    bld.box('ashlarDark', su * 6 - (su > 0 ? 1 : 0), su * 6 + (su > 0 ? 0 : 1), I + 11, I + 12, sv * 6 - (sv > 0 ? 1 : 0), sv * 6 + (sv > 0 ? 0 : 1));
  }
  bld.box('ember', -5, 5, I + 11, I + 11.15, -5, 5);
  for (let i = 0; i < 14; i++) {             // steps face east (43:17)
    bld.box('ashlar', 7 + i * 0.9, 7 + (i + 1) * 0.9, I, I + 7 - 0.5 * i, -2, 2);
  }
  fires.push({ u: 0, v: 0, y: I + 11.1, s: 3.2, big: true });
  bld.zone('ez-altar', -9, 19.6, I, I + 12, -9, 9);
  labels.push({ label: 'Altar', pos: toWorld(0, I + 16, 0) });

  // --- The house (40:48–41:26) -----------------------------------------------------
  bld.tag = 'house';
  const top = H + HOUSE_H;
  bld.box('ashlar', -150, -47, I, H, -30, 30);                       // platform, a full reed (41:8)
  bld.zone('ez-platform', -150, -37, I, H, -30, 30);
  for (let i = 0; i < 10; i++) {                                    // ten steps (LXX 40:49)
    bld.box('ashlar', -47 + i, -46 + i, I - 0.5, H - 0.6 * i, -8, 8);
  }
  // Porch (40:48–49): front jambs 5 thick, opening 14, interior 20 × 12
  for (const s of [-1, 1]) {
    bld.box('ashlar', -55, -50, H, top, s * 7, s * 16);
    bld.box('ashlar', -67, -55, H, top, s * 10, s * 16);
  }
  bld.box('ashlar', -55, -50, H + 24, top, -7, 7);
  bld.box('cedar', -50, -46, H + 22, H + 23.2, -13, 13);             // thick planks on the porch front (41:25)
  for (const s of [-1, 1]) {                                        // pillars by the jambs (40:49)
    const pillar = new THREE.CylinderGeometry(1.3, 1.4, 18, 24);
    bld.geom('ashlar', pillar, -48.5, H + 9, s * 11.5);
    bld.geom('ashlarDark', new THREE.CylinderGeometry(1.9, 1.3, 1.6, 24), -48.5, H + 18.8, s * 11.5);
  }
  bld.zone('ez-pillars', -50, -47, H, H + 20, -13, -10);
  bld.zone('ez-pillars', -50, -47, H, H + 20, 10, 13);
  bld.zone('ez-porch', -67, -46, H, top, -16, 16);
  // Nave entrance: jambs 6, door 10 (41:1–2)
  for (const s of [-1, 1]) bld.box('ashlar', -73, -67, H, top, s * 5, s * 16);
  bld.box('ashlar', -73, -67, H + 16, top, -5, 5);
  // Side walls of the house, wall 6 (41:5), and the west wall
  for (const s of [-1, 1]) bld.box('ashlar', -141, -67, H, top, s * 10, s * 16);
  bld.box('ashlar', -141, -135, H, top, -10, 10);
  // Partition: jambs 2, door 6, sides 7 (41:3)
  for (const s of [-1, 1]) bld.box('ashlar', -115, -113, H, top, s * 3, s * 10);
  bld.box('ashlar', -115, -113, H + 12, top, -3, 3);
  bld.box('roof', -141.5, -46.5, top, top + 1, -16.5, 16.5);
  bld.box('ashlarDark', -141.5, -46.5, top + 1, top + 1.6, -16.5, -15.9);
  bld.box('ashlarDark', -141.5, -46.5, top + 1, top + 1.6, 15.9, 16.5);
  // Interior: floor, wood panelling with cherubim and palms (41:16–20)
  bld.box('pavement', -135, -73, H, H + 0.08, -10, 10);
  for (const s of [-1, 1]) {
    bld.box('cedarCarved', -113, -73, H, H + 20, s * 9.85, s * 10);
    bld.box('cedarCarved', -135, -115, H, H + 20, s * 9.85, s * 10);
    bld.box('cedar', -135, -73, H + 20, top - 0.5, s * 9.9, s * 10);
  }
  bld.box('cedarCarved', -135, -134.85, H, H + 20, -10, 10);
  bld.box('cedar', -73.15, -73, H, H + 20, -10, -5); bld.box('cedar', -73.15, -73, H, H + 20, 5, 10);
  bld.box('cedar', -113, -112.85, H, H + 20, -10, -3); bld.box('cedar', -113, -112.85, H, H + 20, 3, 10);
  bld.box('cedar', -135, -73, top - 0.6, top, -10, 10);            // ceiling
  // Doors, two leaves each folding, standing open (41:23–24)
  for (const s of [-1, 1]) {
    bld.box('door', -73.65, -73.15, H, H + 16, s * 5.3, s * 10);
    bld.box('door', -115.5, -115, H, H + 12, s * 3.2, s * 6.2);
  }
  // Wooden altar / table, 3 high, 2 long (41:22)
  bld.box('cedar', -110, -108, H, H + 3, -1, 1);
  bld.box('cedar', -110.2, -107.8, H + 3, H + 3.25, -1.2, 1.2);
  bld.zone('ez-table', -110.5, -107.5, H, H + 3.4, -1.5, 1.5);
  bld.zone('ez-nave', -113, -73, H, top, -10, 10);
  bld.zone('ez-hoh', -135, -115, H, top, -10, 10);
  // Side chambers: 4 wide, 3 storeys, outer wall 5 (41:5–9)
  const sideTop = H + 18;
  for (const s of [-1, 1]) {
    bld.box('ashlar', -150, -67, H, sideTop, s * 20, s * 25);
    bld.box('ashlar', -68, -67, H, sideTop, s * 16, s * 20);
    for (const y of [H + 6, H + 12]) bld.box('ashlarDark', -150, -67, y - 0.4, y, s * 25, s * 25.25);
    for (let u = -144; u < -70; u += 7) {
      for (const y of [H + 2, H + 8, H + 14]) bld.box('window', u, u + 1.5, y, y + 3, s * 25, s * 25.12);
    }
    bld.box('window', -106, -102, H, H + 7, s * 25, s * 25.12);   // doors to the "place left" (41:11)
    for (let u = -136; u < -70; u += 8) bld.box('window', u, u + 2, sideTop + 3, sideTop + 9, s * 16, s * 16.12);
    bld.zone('ez-side', -150, -67, H, sideTop, s * 16, s * 25);
  }
  bld.box('ashlar', -150, -145, H, sideTop, -20, 20);
  bld.box('roof', -150.4, -66.6, sideTop, sideTop + 0.8, -25.4, -16);
  bld.box('roof', -150.4, -66.6, sideTop, sideTop + 0.8, 16, 25.4);
  bld.box('roof', -150.4, -141, sideTop, sideTop + 0.8, -16, 16);
  bld.zone('ez-side', -150, -141, H, sideTop, -16, 16);
  bld.zone('ez-house', -150, -46, H, top + 1.6, -25, 25);
  labels.push({ label: 'The house', pos: toWorld(-95, top + 8, 0) });

  // --- Priests' chambers (42:1–14) and kitchens (46:19–20) -----------------------------
  bld.tag = 'chamber';
  for (const s of [-1, 1]) {
    const sv = (a, b) => [s * a, s * b];
    // inner row, 100 long, stepped back on the walk side
    const steps = [[0, 20], [6, 17], [12, 14]];
    for (const [k, depth] of steps.map(([y, d]) => [y, d])) {
      const [va, vb] = sv(50, 50 + depth);
      bld.box('ashlar', -150, -50, O + k, O + k + 6, va, vb);
      bld.box('roof', -150.3, -49.7, O + k + 6, O + k + 6.3, va, vb + s * 0.3);
      for (let u = -146; u < -54; u += 6) bld.box('window', u, u + 1.6, O + k + 2, O + k + 4.5, s * (50 + depth), s * (50 + depth + 0.12));
    }
    // outer row, 50 long
    for (const [k, depth] of [[0, 20], [6, 17], [12, 14]]) {
      const [va, vb] = sv(100 - depth, 100);
      bld.box('ashlar', -150, -100, O + k, O + k + 6, va, vb);
      bld.box('roof', -150.3, -99.7, O + k + 6, O + k + 6.3, va - s * 0.3, vb);
      for (let u = -146; u < -104; u += 6) bld.box('window', u, u + 1.6, O + k + 2, O + k + 4.5, s * (100 - depth - 0.12), s * (100 - depth));
    }
    bld.box('ashlar', -100, -50, O, O + 6, s * 98, s * 100);         // the wall outside, 50 long (42:7)
    bld.zone('ez-priest-ch', -150, -50, O, O + 18.4, s * 50, s * 100);
    // kitchens at the west end
    const k0 = s * 56, k1 = s * 98;
    bld.box('ashlarDark', -170, -168.8, O, O + 5, k0, k1);
    bld.box('ashlarDark', -153.2, -152, O, O + 5, k0, k1);
    bld.box('ashlarDark', -170, -152, O, O + 5, k1 - s * 1.2, k1);
    hearth(bld, fires, -161, s * 66, O);
    hearth(bld, fires, -161, s * 84, O);
    bld.zone('ez-priest-kitchen', -170, -152, O, O + 5, k0, k1);
  }
  labels.push({ label: 'Priests\' chambers', pos: toWorld(-100, O + 24, -75) });

  // --- Separate place and western building (41:12–15) --------------------------
  bld.tag = 'court';
  bld.box('pavement', -170, -150, O, O + 0.06, -50, 50);
  bld.zone('ez-gizrah', -170, -150, O - 0.2, O + 0.3, -50, 50);
  const bTop = O + 20;
  bld.tag = 'binyan';
  bld.box('ashlar', -250, -245, 0, bTop, -50, 50);
  bld.box('ashlar', -245, -175, O, bTop, -50, -45);
  bld.box('ashlar', -245, -175, O, bTop, 45, 50);
  bld.box('ashlar', -175, -170, O, bTop, -50, -5);
  bld.box('ashlar', -175, -170, O, bTop, 5, 50);
  bld.box('ashlar', -175, -170, O + 12, bTop, -5, 5);
  bld.box('roof', -250.4, -169.6, bTop, bTop + 0.8, -50.4, 50.4);
  for (let v = -40; v < 40; v += 8) bld.box('window', -170, -169.88, O + 14, O + 18, v, v + 1.6);
  for (let u = -240; u < -178; u += 8) for (const s of [-1, 1]) bld.box('window', u, u + 1.6, O + 14, O + 18, s * 50, s * 50.12);
  bld.zone('ez-binyan', -250, -170, 0, bTop + 0.8, -50, 50);
  labels.push({ label: 'Western building', pos: toWorld(-210, bTop + 6, 0) });

  if (vision) return { group, zones: bld.finishVision(group, vision.looks, VISION_SKIP), labels };

  // --- Interior lighting -----------------------------------------------------------
  const nave = new THREE.PointLight(0xffc27a, 45, 40, 2);
  nave.position.set(-93, H + 18, 0);
  const glory = new THREE.PointLight(0xfff1d0, 120, 30, 2);       // "the glory of the LORD filled the house" (43:5)
  glory.position.set(-125, H + 14, 0);
  group.add(nave, glory);

  const zones = bld.finish(group);

  // Fires (altar, kitchens) are separate so they can flicker.
  const fireMeshes = [];
  for (const f of fires) {
    const n = f.big ? 9 : 3;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(mats.fire);
      m.center.set(0.5, 0.03);
      const r = f.big ? 3.5 : 0.6;
      m.position.set(f.u + (Math.random() - 0.5) * r, f.y, f.v + (Math.random() - 0.5) * r);
      m.userData.base = f.s * (0.7 + Math.random() * 0.5);
      m.userData.phase = Math.random() * 10;
      group.add(m);
      fireMeshes.push(m);
    }
  }
  const altarLight = new THREE.PointLight(0xff8a3a, 90, 45, 2);
  altarLight.position.set(0, I + 15, 0);
  group.add(altarLight);

  const hearths = fires.filter((f) => !f.big).map((f) => toWorld(f.u, f.y, f.v));
  return { group, zones, labels, fireMeshes, altarLight, altarTop: toWorld(0, I + 11, 0), hearths };
}

// ---------------------------------------------------------------------------
// River from the threshold (Ezek 47:1–12). World-space ribbon.
export function buildRiver(mats) {
  const local = [
    [-47, 9, H], [-46, 9.5, H], [-37, 10.5, I], [-20, 12, I], [0, 12.5, I], [30, 12, I],
    [45, 6, I], [50, 5, I], [100, 5, I], [108, 5, O], [200, 5, O], [250, 5, O], [257, 5, 0], [259.6, 5, 0],
  ];
  const pts = local.map(([u, v, y]) => toWorld(u, y + 0.2, v));
  // Off the platform edge (a waterfall), then down the Kidron to the east.
  const course = [[238, 12], [292, 70], [295, 80], [235, 330], [150, 500], [120, 750], [60, 1100], [-40, 1330], [40, 1800], [250, 2600], [700, 3600], [1500, 5200]];
  let prev = pts[pts.length - 1].clone();
  const edge = new THREE.Vector3(prev.x + 0.6, terrainY(prev.x + 1.5, prev.z) + 0.3, prev.z);
  pts.push(edge);
  prev = edge;
  for (const [x, z] of course) {
    const n = Math.ceil(Math.hypot(x - prev.x, z - prev.z) / 5);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const px = prev.x + (x - prev.x) * t, pz = prev.z + (z - prev.z) * t;
      pts.push(new THREE.Vector3(px, terrainY(px, pz) + 0.7, pz));
    }
    prev = pts[pts.length - 1];
  }
  // Distance along the course and width growing with distance (47:3–5).
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const widthAt = (s) => 1.2 + 11 * Math.pow(Math.min(s, 3200) / 2100, 1.2);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    const n = new THREE.Vector3(-t.z, 0, t.x);
    const w = widthAt(dist[i]) / 2;
    const p = pts[i];
    pos.push(p.x + n.x * w, p.y, p.z + n.z * w, p.x - n.x * w, p.y, p.z - n.z * w);
    uv.push(0, dist[i] / 10, w / 5, dist[i] / 10);
    if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }   // upward-facing
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mats.water);
  mesh.name = 'river';
  mesh.renderOrder = 2;
  const group = new THREE.Group();
  group.add(mesh);

  // Measuring posts every 1,000 cubits.
  const markers = [];
  const names = ['ankle-deep', 'knee-deep', 'waist-deep', 'a river to swim in'];
  for (let k = 1; k <= 4; k++) {
    const target = k * 1000 * CUBIT;
    let i = dist.findIndex((d) => d >= target);
    if (i < 0) i = dist.length - 1;
    const p = pts[i];
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 8), mats.cedar);
    post.position.set(p.x + widthAt(dist[i]) / 2 + 2, p.y + 3, p.z);
    post.castShadow = true;
    group.add(post);
    markers.push({ label: `${(k * 1000).toLocaleString('en-US')} cubits · ${names[k - 1]}`, pos: new THREE.Vector3(p.x, p.y + 9, p.z) });
  }
  // Zone: a loose box around the precinct portion of the river.
  const box = new THREE.Box3().setFromPoints(pts.slice(0, 15)).expandByScalar(1);
  return { group, mesh, markers, zones: [{ id: 'ez-river', box }] };
}

// ---------------------------------------------------------------------------
// Vertical translucent "curtain" along a closed outline that follows the ground.
function curtain(points, height, color, opacity) {
  const pos = [], idx = [];
  const all = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 12));
    for (let k = 0; k < n; k++) all.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  all.push(all[0]);
  all.forEach(([x, z], i) => {
    const y = Math.max(terrainY(x, z), -1e9);
    pos.push(x, y - 1, z, x, y + height, z);
    if (i < all.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

// Ezek 42:16–20 read as "500 reeds".
export function buildReedsOutline() {
  const half = 1500 * CUBIT;
  const cx = EZ_CENTER_X;
  const m = curtain([[cx - half, -half], [cx + half, -half], [cx + half, half], [cx - half, half]], 14, 0xd2483a, 0.32);
  return { mesh: m, label: { label: '"500 reeds" (Hebrew text of 42:16–20): 1,575 m a side', pos: new THREE.Vector3(cx, terrainY(cx, -half) + 30, -half) } };
}

// The 50-cubit open land (45:2).
export function buildMigrash() {
  const half = 300 * CUBIT;
  const cx = EZ_CENTER_X;
  const pts = [[cx - half, -half], [cx + half, -half], [cx + half, half], [cx - half, half]];
  const pos = [];
  for (let i = 0; i <= pts.length; i++) {
    const [x, z] = pts[i % pts.length];
    pos.push(new THREE.Vector3(x, Math.max(terrainY(x, z), BASE_Y) + 0.4, z));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pos);
  const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xf3e6c4, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.8 }));
  line.computeLineDistances();
  return line;
}

// Ezek 48:15–35: the city, 4,500 cubits square, centred 7,500 cubits south
// of the sanctuary (priests' strip in the middle, city strip to its south).
export function buildCityOfEzekiel(mats) {
  const group = new THREE.Group();
  const side = 4500 * CUBIT;
  const cx = EZ_CENTER_X, cz = 7500 * CUBIT;
  const h = side / 2;
  group.add(curtain([[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]], 60, 0xe0b04c, 0.45));
  const labels = [{ label: 'Ezek 48: the city "The LORD is there" (4,500 cubits square)', pos: new THREE.Vector3(cx, terrainY(cx, cz - h) + 90, cz - h) }];
  const sides = {
    north: (t) => [cx - h + t * side, cz - h],
    east: (t) => [cx + h, cz - h + t * side],
    south: (t) => [cx - h + t * side, cz + h],
    west: (t) => [cx - h, cz - h + t * side],
  };
  const tower = new THREE.BoxGeometry(14, 30, 14);
  tower.translate(0, 15, 0);
  for (const [dir, names] of Object.entries(CITY_GATES)) {
    names.forEach((name, i) => {
      const [x, z] = sides[dir]((2 * i + 1) / 6);
      const y = terrainY(x, z);
      const m = new THREE.Mesh(tower, mats.ashlar);
      m.position.set(x, y - 2, z);
      m.castShadow = true;
      group.add(m);
      labels.push({ label: `Gate of ${name}`, pos: new THREE.Vector3(x, y + 40, z), small: true });
    });
  }
  return { group, labels };
}
