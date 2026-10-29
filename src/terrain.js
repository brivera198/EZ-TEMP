// Schematic topography of Jerusalem in the Iron Age: the Temple Mount ridge
// and City of David spur between the Kidron and Tyropoeon valleys, the
// Western Hill bounded by the Hinnom, and the Mount of Olives to the east.
// Elevations follow published values to within a few metres; valley courses
// are approximate.
import * as THREE from 'three';
import { Y0, BASE_Y, EZ_CENTER_X, PODIUM_HALF, PALACE_PAD, CITY_WALL, EARLY_WALL, SOLOMON_PLATFORM, ROADS, KINGS_GARDEN } from './data.js';

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
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const gauss = (dx, dz, sx, sz) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dz * dz) / (2 * sz * sz));
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// --- Valleys: [x, z, bottom elevation] -------------------------------------------
const VALLEYS = {
  kidron: { slope: 0.55, floor: 12, pts: [[170, -1500, 742], [235, -700, 712], [285, -250, 690], [295, 80, 668], [235, 330, 650], [150, 500, 634], [120, 750, 622], [60, 1100, 610], [-40, 1330, 598], [40, 1800, 575], [250, 2600, 530], [700, 3600, 480], [1500, 5200, 420]] },
  tyropoeon: { slope: 0.33, floor: 10, pts: [[-520, -400, 752], [-300, -100, 716], [-215, 200, 690], [-190, 500, 664], [-150, 780, 640], [-105, 920, 626], [-60, 1150, 610], [-40, 1330, 598]] },
  hinnom: { slope: 0.38, floor: 14, pts: [[-1300, -150, 775], [-900, 120, 752], [-820, 450, 740], [-720, 800, 715], [-520, 1080, 672], [-300, 1260, 632], [-40, 1330, 598]] },
  bethesda: { slope: 0.3, floor: 20, pts: [[-250, -480, 750], [0, -380, 738], [200, -330, 712], [285, -250, 690]] },
};

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

// x of a valley's bottom line at a given z (valleys that run north–south).
export function valleyX(name, z) {
  const p = VALLEYS[name].pts;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    if ((z - az) * (z - bz) <= 0 && az !== bz) return ax + (bx - ax) * (z - az) / (bz - az);
  }
  return p[z < p[0][1] ? 0 : p.length - 1][0];
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
  for (const v of Object.values(VALLEYS)) h = Math.min(h, valleyHeight(v, x, z));
  return h;
}

// --- Platforms ------------------------------------------------------------------
// 'square': the 500-cubit Temple Mount of the later monarchy (and of Ezekiel).
// 'sp': Solomon's smaller summit terrace of the 10th century.
export const PODIUM = { x0: EZ_CENTER_X - PODIUM_HALF, x1: EZ_CENTER_X + PODIUM_HALF, z0: -PODIUM_HALF, z1: PODIUM_HALF };
export const SITES = { square: PODIUM, sp: SOLOMON_PLATFORM };
export const inRect = (x, z, r, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
let activeSite = 'square';
export const getSite = () => activeSite;

// Terrain world height (y), with the platforms cut level.
export function terrainY(x, z, site = activeSite) {
  let h = naturalElevation(x, z) - Y0;
  if (inRect(x, z, SITES[site])) h = Math.min(h, BASE_Y - 0.3);
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

// Distance from a point to a polyline (open, or closed when `closed`).
export function distToLine(x, z, pts, closed = false) {
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

// City polygons: the wall lines closed along the temple platform.
export const LATE_POLY = [...CITY_WALL, [PODIUM.x0, PODIUM.z1]];
export const EARLY_POLY = [...EARLY_WALL, [SOLOMON_PLATFORM.x1, SOLOMON_PLATFORM.z1], [SOLOMON_PLATFORM.x0, SOLOMON_PLATFORM.z1]];
export const cityPoly = (period) => (period === 'early' ? EARLY_POLY : LATE_POLY);

// --- Terrain meshes ----------------------------------------------------------
export const DETAIL = { cx: 0, cz: 300, size: 3400, seg: 680 };
const X0 = DETAIL.cx - DETAIL.size / 2, Z0 = DETAIL.cz - DETAIL.size / 2;

const C = {
  soil: new THREE.Color(0.58, 0.40, 0.28),
  pale: new THREE.Color(0.66, 0.55, 0.41),
  rock: new THREE.Color(0.60, 0.56, 0.48),
  scrub: new THREE.Color(0.40, 0.43, 0.30),
  chalk: new THREE.Color(0.80, 0.70, 0.52),
};
const tmp = new THREE.Color();

function vertexColour(x, y, z, ny, out, i) {
  const c = tmp.copy(C.soil).lerp(C.pale, 0.5 + 0.5 * fbm(x / 160, z / 160, 3));
  const steep = smooth(0.93, 0.78, ny);
  c.lerp(C.rock, steep * 0.85);
  const green = smooth(0.05, 0.35, fbm(x / 90 + 7, z / 90 - 3, 3)) * (1 - steep * 0.6);
  const low = smooth(70, 30, y); // valley floors are greener
  c.lerp(C.scrub, Math.min(0.75, green * 0.55 + low * 0.35));
  // East of the Mount of Olives: the chalky Judean desert.
  const desert = smooth(1050, 1900, x + 120 * fbm(x / 500, z / 500, 2));
  c.lerp(C.chalk, desert * 0.85);
  out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
}

function colourTerrain(geo) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) vertexColour(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i), col, i);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export function buildTerrain(mats, { seg = DETAIL.seg } = {}) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(DETAIL.size, DETAIL.size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(DETAIL.cx, 0, DETAIL.cz);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainY(x, z, 'square'));
    uv.setXY(i, x / 24, z / 24);
  }
  geo.computeVertexNormals();
  colourTerrain(geo);
  const mesh = new THREE.Mesh(geo, mats.terrain);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.userData.infoId = 'land-judah';
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
    fp.setY(i, terrainY(x, z, 'square') - 2 - sink);
    fuv.setXY(i, x / 24, z / 24);
  }
  far.computeVertexNormals();
  colourTerrain(far);
  const farMesh = new THREE.Mesh(far, mats.terrain);
  farMesh.receiveShadow = true;
  farMesh.name = 'terrain-far';
  group.add(farMesh);
  return { group, mesh, farMesh, seg };
}

// Re-shape the ground under the temple platforms when the period changes.
export function applySite(terr, site) {
  if (site === activeSite) return;
  activeSite = site;
  const geo = terr.mesh.geometry;
  const seg = terr.seg, step = DETAIL.size / seg, row = seg + 1;
  const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
  const x0 = Math.min(PODIUM.x0, SOLOMON_PLATFORM.x0) - 15, x1 = Math.max(PODIUM.x1, SOLOMON_PLATFORM.x1) + 15;
  const z0 = Math.min(PODIUM.z0, SOLOMON_PLATFORM.z0) - 15, z1 = Math.max(PODIUM.z1, SOLOMON_PLATFORM.z1) + 15;
  const ix0 = Math.max(1, Math.floor((x0 - X0) / step)), ix1 = Math.min(seg - 1, Math.ceil((x1 - X0) / step));
  const iz0 = Math.max(1, Math.floor((z0 - Z0) / step)), iz1 = Math.min(seg - 1, Math.ceil((z1 - Z0) / step));
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const i = iz * row + ix;
    pos.setY(i, terrainY(pos.getX(i), pos.getZ(i), site));
  }
  const n = new THREE.Vector3();
  for (let iz = Math.max(1, iz0 - 1); iz <= Math.min(seg - 1, iz1 + 1); iz++) for (let ix = Math.max(1, ix0 - 1); ix <= Math.min(seg - 1, ix1 + 1); ix++) {
    const i = iz * row + ix;
    const hl = pos.getY(i - 1), hr = pos.getY(i + 1), hu = pos.getY(i - row), hd = pos.getY(i + row);
    n.set(hl - hr, 2 * step, hu - hd).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
    vertexColour(pos.getX(i), pos.getY(i), pos.getZ(i), n.y, col.array, i);
  }
  pos.needsUpdate = true;
  nrm.needsUpdate = true;
  col.needsUpdate = true;
  geo.computeBoundingSphere();
}

// --- Terrain shader: terraces, fields, roads, gardens --------------------------
// The overlay textures cover the detailed patch. Mask channels:
// R = terraced farmland, G = beaten earth inside the walls, B = irrigated garden.
const OVERLAY_GLSL = /* glsl */ `
{
  vec2 ouv = (vWPos.xz - ovRect.xy) * ovRect.zw;
  float inside = step(0.0, ouv.x) * step(ouv.x, 1.0) * step(0.0, ouv.y) * step(ouv.y, 1.0);
  vec4 mk = texture2D(ovMask, ouv) * inside;
  vec4 oc = texture2D(ovColor, ouv) * inside;
  float slope = 1.0 - clamp(vWNorm.y, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.24, 0.17), mk.g * 0.55);
  float beds = 0.5 + 0.5 * sin(vWPos.x * 0.9) * sin(vWPos.z * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.05, 0.10, 0.03), vec3(0.12, 0.16, 0.05), beds), mk.b * 0.85);
  diffuseColor.rgb = mix(diffuseColor.rgb, oc.rgb, oc.a);
  // Dry-stone terrace walls along the contours, fading out with distance.
  float yy = vWPos.y + 0.9 * sin(vWPos.x * 0.031 + vWPos.z * 0.012) + 0.7 * sin(vWPos.z * 0.027);
  float tq = yy / 1.9;
  float f = fract(tq);
  float aa = fwidth(tq);
  float terr = mk.r * smoothstep(0.03, 0.08, slope) * (1.0 - smoothstep(0.45, 0.65, slope)) * (1.0 - smoothstep(0.18, 0.45, aa));
  float wallBand = 1.0 - smoothstep(0.08, 0.10 + aa * 1.5, f);
  float foot = smoothstep(0.80, 0.98, f);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.30, 0.25), wallBand * terr * 0.85);
  diffuseColor.rgb *= 1.0 - foot * terr * 0.22;
}
`;

export function installTerrainShader(mat) {
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  blank.needsUpdate = true;
  const uniforms = {
    ovColor: { value: blank },
    ovMask: { value: blank },
    ovRect: { value: new THREE.Vector4(X0, Z0, 1 / DETAIL.size, 1 / DETAIL.size) },
  };
  mat.userData.ov = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D ovColor;\nuniform sampler2D ovMask;\nuniform vec4 ovRect;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + OVERLAY_GLSL);
  };
  mat.customProgramCacheKey = () => 'terrain-overlay-v1';
}

// Hezekiah's tunnel, Gihon to Siloam (it runs underground).
export const TUNNEL = [[104, 500], [72, 540], [44, 600], [24, 680], [-6, 760], [-44, 830], [-84, 884], [-104, 920]];

// Paint the overlay textures for one period. `plan` holds the fields and
// threshing floors laid out by city.js.
export function paintOverlay(period, plan) {
  const N = 2048, k = N / DETAIL.size;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = N;
  const g = cnv.getContext('2d');
  const P = (x, z) => [(x - X0) * k, (z - Z0) * k];
  const poly = cityPoly(period);
  const rand = rng(77);

  // Fields: a patchwork of ploughland, stubble and green grain.
  const palette = [[122, 90, 66, 0.32], [192, 168, 114, 0.3], [124, 130, 76, 0.32], [150, 120, 88, 0.22]];
  for (const f of plan.fields) {
    if (insidePolygon(f.x, f.z, poly)) continue;
    const [cx, cy] = P(f.x, f.z);
    const [r, gg, b, a] = palette[f.kind];
    g.save();
    g.translate(cx, cy);
    g.rotate(f.ang);
    g.fillStyle = `rgba(${r},${gg},${b},${a})`;
    g.fillRect(-f.w * k / 2, -f.d * k / 2, f.w * k, f.d * k);
    if (f.kind === 0) {   // furrows
      g.strokeStyle = 'rgba(60,40,28,0.18)';
      g.lineWidth = 0.6;
      for (let y = -f.d * k / 2 + 1; y < f.d * k / 2; y += 1.6) {
        g.beginPath(); g.moveTo(-f.w * k / 2, y); g.lineTo(f.w * k / 2, y); g.stroke();
      }
    }
    g.restore();
  }

  // Roads: beaten tracks, wider and paler near the gates.
  g.lineJoin = g.lineCap = 'round';
  for (const road of ROADS) {
    if (!road.periods.includes(period)) continue;
    for (const [w, col] of [[6.5, 'rgba(120,98,72,0.35)'], [4.2, 'rgba(206,186,150,0.85)']]) {
      g.strokeStyle = col;
      g.lineWidth = w * k;
      g.beginPath();
      road.pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.stroke();
    }
  }

  // Threshing floors.
  for (const t of plan.floors) {
    if (insidePolygon(t.x, t.z, poly)) continue;
    const [cx, cy] = P(t.x, t.z);
    g.fillStyle = 'rgba(224,206,164,0.95)';
    g.beginPath(); g.arc(cx, cy, t.r * k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(140,128,108,0.9)';
    g.lineWidth = 1.2;
    g.stroke();
  }

  // Hezekiah's tunnel: drawn as a dashed line (c. 700 BC onward).
  if (period !== 'early') {
    g.setLineDash([5, 4]);
    g.strokeStyle = 'rgba(40,80,130,0.7)';
    g.lineWidth = 1.6;
    g.beginPath();
    TUNNEL.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.stroke();
    g.setLineDash([]);
  }
  const color = new THREE.CanvasTexture(cnv);
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = 8;

  // Masks, computed per texel.
  const M = 512, cell = DETAIL.size / M;
  const data = new Uint8Array(M * M * 4);
  const plat = SITES[period === 'early' ? 'sp' : 'square'];
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = X0 + (i + 0.5) * cell, z = Z0 + (j + 0.5) * cell;
    const o = (j * M + i) * 4;
    const inCity = insidePolygon(x, z, poly);
    const onPlat = inRect(x, z, plat, 4) || inRect(x, z, PALACE_PAD, 4);
    const desert = smooth(1050, 1700, x);
    const reach = 1 - smooth(1300, 2100, Math.hypot(x + 150, z - 450));
    const farmed = (!inCity && !onPlat) ? (0.55 + 0.45 * fbm(x / 260, z / 260, 2)) * (1 - desert) * reach : 0;
    const gx = (x - KINGS_GARDEN.x) / KINGS_GARDEN.rx, gz = (z - KINGS_GARDEN.z) / KINGS_GARDEN.rz;
    let garden = smooth(1.05, 0.8, Math.hypot(gx, gz));
    // Gardens on the Kidron floor below the Gihon, watered by the Siloam channel.
    if (z > 560 && z < 1060) garden = Math.max(garden, smooth(26, 12, Math.abs(x - valleyX('kidron', z))) * 0.8);
    data[o] = Math.round(Math.max(0, Math.min(1, farmed)) * 255);
    data[o + 1] = inCity && !onPlat ? 255 : 0;
    data[o + 2] = Math.round(garden * (inCity ? 0 : 1) * 255);
    data[o + 3] = 255;
  }
  const mask = new THREE.DataTexture(data, M, M);
  mask.magFilter = mask.minFilter = THREE.LinearFilter;
  mask.needsUpdate = true;
  return { color, mask };
}
