// The countryside of Judah around the city: trees, vineyards, farm buildings
// and threshing floors. World units are metres (x = east, z = south).
//
// Trees are built from a branching trunk and limbs with bark texture, and
// foliage of leaf cards: crossed quads that each carry a painted spray of
// that species' leaves, cut out with alphaTest so they sort and cast dappled
// shadows. All species share one texture atlas (leaves and bark) and its
// normal map. Each archetype comes in two levels of detail: the whole
// countryside is drawn with a few large cards per tree; near the viewer a
// pool of detailed trees (many small cards, limbs and twigs) takes over,
// cross-faded with a screen dither so nothing pops. The pool is driven from
// flora.js through treeDetail(); without it the coarse trees are drawn everywhere.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainY, insidePolygon, inRect, fbm, smooth, distToLine, valleyX, rng, PODIUM, LATE_POLY, EARLY_POLY } from './terrain.js';
import { PALACE_PAD, SOLOMON_PLATFORM, KINGS_GARDEN } from './data.js';
import { atmo } from './atmosphere.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

const slopeAt = (x, z, site = 'square', e = 2) =>
  Math.hypot(terrainY(x + e, z, site) - terrainY(x - e, z, site), terrainY(x, z + e, site) - terrainY(x, z - e, site)) / (2 * e);

// Shared by every plant material here and in flora.js: wind clock, the
// viewer, the radius inside which the detailed pool replaces the coarse
// trees (0: no pool), and the sun for light through the leaves.
export const FLORA_U = {
  fTime: { value: 0 },
  fCam: { value: new THREE.Vector3(1e9, 0, 0) },
  fTreeNear: { value: 0 },
  fVineNear: { value: 0 },
  fBand: { value: 22 },
  fRuin: { value: 0 },
  fDay: { value: 1 },
  fZero: { value: 0 },
  fSunDir: atmo.fogSunDir,
  fSunCol: atmo.fogSunColor,
};

// Small integer hash, so species and shapes do not use up the shared random stream.
export function hash(x, z, salt = 0) {
  let h = Math.imul(Math.floor(x * 7.13) + salt * 9973, 374761393) ^ Math.imul(Math.floor(z * 5.37) - salt * 31, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function instanced(geo, mat, recs, infoId, setup) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, recs.length));
  im.count = recs.length;
  recs.forEach((r, i) => {
    setup(r, _p, _q, _s, _c);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
    im.setColorAt(i, _c);
  });
  im.castShadow = im.receiveShadow = true;
  im.userData.infoId = infoId;
  im.computeBoundingSphere();
  return im;
}

// --- Procedural textures -----------------------------------------------------------------
const HAS_DOM = typeof document !== 'undefined';
export function canvas2d(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// Normal map from a height field (0..1 per pixel), wrapping within square
// cells of `cell` pixels so tiled textures stay seamless.
export function heightToNormal(H, w, h, cell, strength) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = x - (x % cell), cy = y - (y % cell);
    const xl = cx + ((x - cx - 1 + cell) % cell), xr = cx + ((x - cx + 1) % cell);
    const yu = cy + ((y - cy - 1 + cell) % cell), yd = cy + ((y - cy + 1) % cell);
    const s = strength[Math.floor(y / cell) * Math.round(w / cell) + Math.floor(x / cell)] ?? strength[0];
    const dx = (H[y * w + xr] - H[y * w + xl]) * s, dy = (H[yd * w + x] - H[yu * w + x]) * s;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255;
    out[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    out[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    out[i + 3] = 255;
  }
  return out;
}
export function dataTex(data, w, h, srgb) {
  const t = new THREE.DataTexture(data, w, h);
  t.flipY = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
// Transparent pixels take the average colour of the opaque ones in their
// cell, so mipmaps do not fringe the cut-outs with black.
export function bleed(img, w, cell) {
  const d = img.data, n = w / cell;
  for (let cy = 0; cy < img.height / cell; cy++) for (let cx = 0; cx < n; cx++) {
    let r = 0, g = 0, b = 0, k = 0;
    for (let y = cy * cell; y < (cy + 1) * cell; y += 2) for (let x = cx * cell; x < (cx + 1) * cell; x += 2) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; k++; }
    }
    if (!k) continue;
    r /= k; g /= k; b /= k;
    for (let y = cy * cell; y < (cy + 1) * cell; y++) for (let x = cx * cell; x < (cx + 1) * cell; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 8) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
    }
  }
}

// One leaf, from its stalk at the origin along +x.
export function drawLeaf(g, x, y, ang, len, wid, shape, fill, rib) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  if (shape === 'lance') {
    g.moveTo(0, 0); g.quadraticCurveTo(len * 0.45, -wid, len, 0); g.quadraticCurveTo(len * 0.45, wid, 0, 0);
  } else if (shape === 'oval') {
    g.moveTo(0, 0); g.bezierCurveTo(len * 0.1, -wid * 1.2, len * 0.9, -wid * 1.25, len, 0); g.bezierCurveTo(len * 0.9, wid * 1.25, len * 0.1, wid * 1.2, 0, 0);
  } else if (shape === 'round') {
    g.ellipse(len * 0.5, 0, len * 0.5, wid, 0, 0, Math.PI * 2);
  } else {
    // Palmate (fig, vine) or spiny (holm oak): polar outline round the blade's centre.
    const lobes = shape === 'fig' ? 5 : shape === 'vine' ? 5 : 14;
    const deep = shape === 'fig' ? 0.5 : shape === 'vine' ? 0.3 : 0.1;
    const cxl = len * 0.5;
    for (let i = 0; i <= 48; i++) {
      const th = (i / 48) * Math.PI * 2;
      const lobe = Math.pow(Math.abs(Math.cos(th * lobes / 2)), shape === 'oak' ? 0.3 : 0.8);
      const back = shape === 'oak' ? 1 : 0.75 + 0.25 * Math.cos(th);
      const r = (1 - deep + deep * lobe) * back;
      const px = cxl + Math.cos(th) * r * len * 0.5, py = Math.sin(th) * r * wid;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
  }
  g.fillStyle = fill;
  g.fill();
  // One half of the blade a little darker, as the light falls across the midrib.
  g.save();
  g.clip();
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(-len, 0, len * 3, wid * 2 + 2);
  g.restore();
  if (rib) {
    g.strokeStyle = rib;
    g.lineWidth = Math.max(0.6, wid * 0.12);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.9, 0); g.stroke();
  }
  g.restore();
}
const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// A ball of leafy twigs filling one cell, so a card reads the same whichever way it faces.
function sprayCell(g, C, sp, rand) {
  const L = C * 0.46, cx = C / 2, cy = C / 2, u = C / 512;
  const twigs = sp.twigs || 9;
  g.lineCap = 'round';
  for (let t = 0; t < twigs; t++) {
    const a = (t / twigs) * Math.PI * 2 + rand() * 0.5;
    const len = L * (0.6 + rand() * 0.4);
    const bend = (rand() - 0.5) * 0.6;
    g.strokeStyle = rgb(sp.twig || [92, 76, 58]);
    g.lineWidth = 1.3 * u;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * L * 0.1, cy + Math.sin(a) * L * 0.1);
    g.quadraticCurveTo(cx + Math.cos(a + bend) * len * 0.6, cy + Math.sin(a + bend) * len * 0.6, cx + Math.cos(a + bend * 1.5) * len, cy + Math.sin(a + bend * 1.5) * len);
    g.stroke();
    const n = sp.perTwig || 10;
    for (let k = 0; k < n; k++) {
      const f = 0.2 + (k / n) * 0.8;
      const aa = a + bend * 1.5 * f;
      const px = cx + Math.cos(aa) * len * f, py = cy + Math.sin(aa) * len * f;
      const side = k % 2 ? 1 : -1;
      const la = aa + side * (sp.spread || 0.8) * (0.7 + rand() * 0.5);
      const s = (0.75 + rand() * 0.45) * (1 - 0.3 * f * (sp.taper || 0));
      const top = rand() < (sp.under ? 0.62 : 0.85);
      const col = top ? sp.top : (sp.under || sp.top);
      const k2 = 0.82 + rand() * 0.3;
      if (sp.pinnate) {
        // Compound leaf: a rachis with pairs of leaflets.
        const rl = sp.len * u * s;
        g.strokeStyle = rgb(col, 0.8); g.lineWidth = 1.2 * u;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(la) * rl, py + Math.sin(la) * rl); g.stroke();
        for (let p = 0; p < sp.pinnate; p++) {
          const q = 0.25 + (p / sp.pinnate) * 0.75;
          for (const sd of [-1, 1]) drawLeaf(g, px + Math.cos(la) * rl * q, py + Math.sin(la) * rl * q, la + sd * 0.9, sp.leaflet * u, sp.leaflet * u * sp.wid, sp.shape, rgb(col, k2 * (0.95 + rand() * 0.1)), null);
        }
        drawLeaf(g, px + Math.cos(la) * rl, py + Math.sin(la) * rl, la, sp.leaflet * u, sp.leaflet * u * sp.wid, sp.shape, rgb(col, k2), null);
      } else if (sp.scale) {
        // Scale leaves (tamarisk, cypress): many fine strokes.
        g.strokeStyle = rgb(col, k2);
        g.lineWidth = sp.scale * u;
        for (let q = 0; q < 5; q++) {
          const qa = la + (rand() - 0.5) * 0.8, ql = sp.len * u * s * (0.5 + rand() * 0.5);
          g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(qa) * ql * 0.5 + (rand() - 0.5) * 4 * u, py + Math.sin(qa) * ql * 0.5, px + Math.cos(qa) * ql, py + Math.sin(qa) * ql); g.stroke();
        }
      } else {
        drawLeaf(g, px, py, la, sp.len * u * s, sp.len * u * s * sp.wid, sp.shape, rgb(col, k2), sp.rib ? rgb(col, k2 * 1.25) : null);
      }
    }
  }
  // Fruit and buds where the season has them.
  if (sp.fruit) for (let i = 0; i < sp.fruit[0]; i++) {
    const a = rand() * 6.28, r = L * (0.3 + rand() * 0.6);
    g.fillStyle = rgb(sp.fruit[2], 0.85 + rand() * 0.3);
    g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, sp.fruit[1] * u, 0, 6.28); g.fill();
  }
}

// Leaves by species (colours are sRGB). Spring: young figs (Song 2:13),
// terebinths in reddish new leaf, almonds with green fruit, vines with pale new leaves.
const LEAF_SPEC = [
  { name: 'olive', shape: 'lance', len: 32, wid: 0.14, top: [78, 96, 62], under: [158, 166, 148], perTwig: 26, twigs: 14, spread: 0.55 },
  { name: 'fig', shape: 'fig', len: 78, wid: 0.5, top: [84, 124, 46], perTwig: 7, twigs: 11, spread: 0.9, rib: true, fruit: [12, 5, [104, 140, 60]] },
  { name: 'pomegranate', shape: 'oval', len: 22, wid: 0.28, top: [64, 104, 36], perTwig: 26, twigs: 14, spread: 0.7, rib: true, fruit: [6, 5, [196, 70, 40]] },
  { name: 'carob', shape: 'round', len: 0, leaflet: 18, wid: 0.38, pinnate: 3, top: [42, 70, 30], perTwig: 8, twigs: 13, spread: 0.8 },
  { name: 'oak', shape: 'oak', len: 24, wid: 0.36, top: [48, 70, 34], under: [96, 106, 74], perTwig: 24, twigs: 14, spread: 0.75 },
  { name: 'terebinth', shape: 'lance', len: 0, leaflet: 20, wid: 0.24, pinnate: 4, top: [112, 100, 50], under: [134, 80, 48], perTwig: 8, twigs: 13, spread: 0.8 },
  { name: 'almond', shape: 'lance', len: 38, wid: 0.18, top: [90, 122, 56], perTwig: 20, twigs: 13, spread: 0.6, rib: true, fruit: [10, 5, [140, 160, 96]] },
  { name: 'tamarisk', shape: 'lance', len: 26, scale: 1.2, top: [112, 126, 102], perTwig: 20, twigs: 16, spread: 0.5 },
  { name: 'cypress', shape: 'lance', len: 20, scale: 2.2, top: [38, 58, 34], perTwig: 26, twigs: 18, spread: 0.6 },
  { name: 'vine', shape: 'vine', len: 70, wid: 0.5, top: [132, 160, 64], perTwig: 6, twigs: 9, spread: 0.9, rib: true, twig: [120, 98, 64] },
  { name: 'sycamore', shape: 'oval', len: 44, wid: 0.38, top: [62, 98, 44], perTwig: 15, twigs: 13, spread: 0.7, rib: true },
];
export const SP_INDEX = Object.fromEntries([...LEAF_SPEC.map((s, i) => [s.name, i]), ['palm', 11]]);
// Bark cell for each species index: 12 furrowed (olive, vine), 13 smooth grey,
// 14 flaking, 15 palm.
const BARK_CELL = [12, 13, 13, 14, 14, 14, 13, 14, 14, 12, 14, 15];

function barkCell(g, h, C, kind, rand) {
  // Draw everything three times across each edge, so the cell tiles.
  const wrap = (fn) => { for (const ox of [-C, 0, C]) for (const oy of [-C, 0, C]) { g.save(); h.save(); g.translate(ox, oy); h.translate(ox, oy); fn(); g.restore(); h.restore(); } };
  const both = (fn) => { fn(g, false); fn(h, true); };
  const base = { olive: [118, 108, 94], smooth: [150, 146, 136], flaky: [112, 100, 84], palm: [118, 96, 70] }[kind];
  g.fillStyle = rgb(base); g.fillRect(0, 0, C, C);
  h.fillStyle = '#808080'; h.fillRect(0, 0, C, C);
  const u = C / 512;
  if (kind === 'olive') {
    // Deep twisting furrows and ridges, with patches of lichen.
    const strokes = [];
    for (let i = 0; i < 46; i++) strokes.push([rand() * C, rand() * 6.28, 3 + rand() * 9, 0.005 + rand() * 0.012, 8 + rand() * 18, rand() < 0.6]);
    wrap(() => both((c, isH) => {
      for (const [x0, ph, w, f, amp, dark] of strokes) {
        c.strokeStyle = isH ? (dark ? 'rgba(20,20,20,0.75)' : 'rgba(230,230,230,0.55)') : (dark ? 'rgba(52,44,36,0.7)' : 'rgba(160,150,132,0.5)');
        c.lineWidth = w * u * (dark ? 1 : 0.7);
        c.beginPath();
        for (let y = -20; y <= C + 20; y += 8) { const x = x0 + Math.sin(y * f * 2 + ph) * amp * u + y * 0.12; if (y < -19) c.moveTo(x, y); else c.lineTo(x, y); }
        c.stroke();
      }
    }));
    const lichen = [];
    for (let i = 0; i < 60; i++) lichen.push([rand() * C, rand() * C, (4 + rand() * 14) * u, rand()]);
    wrap(() => { for (const [x, y, r, k] of lichen) { g.fillStyle = k < 0.5 ? 'rgba(170,176,150,0.45)' : 'rgba(196,190,160,0.35)'; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); } });
  } else if (kind === 'smooth') {
    // Smooth grey bark, mottled, with horizontal lenticels and soft folds.
    const blots = [];
    for (let i = 0; i < 90; i++) blots.push([rand() * C, rand() * C, (10 + rand() * 40) * u, rand()]);
    wrap(() => {
      for (const [x, y, r, k] of blots) { g.fillStyle = k < 0.5 ? 'rgba(120,118,110,0.25)' : 'rgba(186,182,172,0.25)'; g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, 6.28); g.fill(); }
      for (const [x, y, r, k] of blots) {
        h.fillStyle = k < 0.5 ? 'rgba(90,90,90,0.25)' : 'rgba(170,170,170,0.25)'; h.beginPath(); h.ellipse(x, y, r * 1.6, r, 0, 0, 6.28); h.fill();
        g.strokeStyle = 'rgba(70,64,58,0.55)'; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(x - r * 0.3, y + r * 0.7); g.lineTo(x + r * 0.3, y + r * 0.7); g.stroke();
      }
    });
  } else if (kind === 'flaky') {
    // Plates of bark split by a network of dark cracks.
    const plates = [];
    for (let i = 0; i < 70; i++) plates.push([rand() * C, rand() * C, (18 + rand() * 30) * u, (30 + rand() * 60) * u, rand()]);
    wrap(() => both((c, isH) => {
      for (const [x, y, w, hh, k] of plates) {
        c.fillStyle = isH ? `rgba(${170 + k * 60},${170 + k * 60},${170 + k * 60},0.9)` : rgb([96 + k * 50, 88 + k * 44, 74 + k * 36]);
        c.beginPath(); c.ellipse(x, y, w * 0.5, hh * 0.5, (k - 0.5) * 0.4, 0, 6.28); c.fill();
        c.strokeStyle = isH ? 'rgba(20,20,20,0.9)' : 'rgba(40,34,28,0.8)';
        c.lineWidth = 2.4 * u;
        c.stroke();
      }
    }));
  } else {
    // Date palm: the stubs of old frond bases in a diamond lattice.
    const step = C / 6;
    wrap(() => both((c, isH) => {
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
        const x = i * step + (j % 2) * step / 2, y = j * step;
        c.fillStyle = isH ? 'rgba(200,200,200,1)' : rgb([128 + (i * 7 % 20), 102, 74]);
        c.beginPath(); c.moveTo(x, y - step * 0.55); c.lineTo(x + step * 0.48, y); c.lineTo(x, y + step * 0.3); c.lineTo(x - step * 0.48, y); c.closePath(); c.fill();
        c.strokeStyle = isH ? 'rgba(30,30,30,1)' : 'rgba(60,44,30,0.9)'; c.lineWidth = 3 * u; c.stroke();
      }
    }));
  }
}

function frondCell(g, C) {
  // Palm frond: the midrib along the cell, leaflets on both sides shortening to the tip.
  const u = C / 512;
  g.strokeStyle = rgb([150, 140, 80]); g.lineWidth = 5 * u;
  g.beginPath(); g.moveTo(4 * u, C / 2); g.lineTo(C - 4 * u, C / 2); g.stroke();
  for (let i = 0; i < 46; i++) {
    const t = i / 46, x = 10 * u + t * (C - 30 * u);
    const len = (C * 0.48) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)));
    for (const s of [-1, 1]) drawLeaf(g, x, C / 2, s * 1.0 + 0.0, len, 7 * u, 'lance', rgb([72 + (i % 3) * 8, 104, 52]), rgb([110, 130, 70]));
  }
}

let ATLAS = null;
// The tree atlas: 4 × 4 cells, leaves in the first three rows (by species
// index), bark in the last.
export function treeAtlas(quality = 'high') {
  if (ATLAS || !HAS_DOM) return ATLAS;
  const C = quality === 'low' ? 256 : 512, N = C * 4;
  const [cv, g] = canvas2d(N), [hv, hg] = canvas2d(N);
  const rand = rng(808);
  LEAF_SPEC.forEach((sp, i) => {
    g.save(); g.translate((i % 4) * C, Math.floor(i / 4) * C); g.beginPath(); g.rect(0, 0, C, C); g.clip();
    sprayCell(g, C, sp, rand);
    g.restore();
  });
  g.save(); g.translate(3 * C, 2 * C); g.beginPath(); g.rect(0, 0, C, C); g.clip(); frondCell(g, C); g.restore();
  ['olive', 'smooth', 'flaky', 'palm'].forEach((k, i) => {
    g.save(); hg.save();
    g.translate(i * C, 3 * C); hg.translate(i * C, 3 * C);
    g.beginPath(); g.rect(0, 0, C, C); g.clip(); hg.beginPath(); hg.rect(0, 0, C, C); hg.clip();
    barkCell(g, hg, C, k, rand);
    g.restore(); hg.restore();
  });
  const img = g.getImageData(0, 0, N, N);
  const hImg = hg.getImageData(0, 0, N, N).data;
  // Heights: alpha for leaves (each leaf a little domed), the drawn relief for bark.
  const H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) H[i] = i >= N * C * 3 ? hImg[i * 4] / 255 : img.data[i * 4 + 3] / 255 * 0.5;
  const strength = new Array(16).fill(1.2 * C / 512 * 2);
  for (let i = 12; i < 16; i++) strength[i] = 5 * C / 512 * 2;
  const nrm = heightToNormal(H, N, N, C, strength);
  bleed(img, N, C);
  ATLAS = { map: dataTex(new Uint8Array(img.data.buffer), N, N, true), normalMap: dataTex(nrm, N, N, false), C };
  return ATLAS;
}

// A tileable wood texture (grain, knots, checks) with its normal map, for
// poles, beams and the booths on the watchtowers.
let WOOD = null;
export function woodTex() {
  if (WOOD || !HAS_DOM) return WOOD;
  const N = 256;
  const [cv, g] = canvas2d(N), [hv, hg] = canvas2d(N);
  const rand = rng(17);
  g.fillStyle = rgb([134, 108, 78]); g.fillRect(0, 0, N, N);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, N, N);
  for (let i = 0; i < 70; i++) {
    const x0 = rand() * N, w = 1 + rand() * 3, ph = rand() * 6, dark = rand() < 0.6;
    for (const ox of [-N, 0, N]) for (const [c, col] of [[g, dark ? 'rgba(70,52,34,0.5)' : 'rgba(176,150,112,0.4)'], [hg, dark ? 'rgba(40,40,40,0.6)' : 'rgba(200,200,200,0.4)']]) {
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath();
      for (let y = -4; y <= N + 4; y += 4) { const x = ox + x0 + Math.sin(y * 0.049 + ph) * 3; if (y < 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = rand() * N, y = rand() * N;
    for (const [c, col] of [[g, 'rgba(60,40,24,0.8)'], [hg, 'rgba(30,30,30,0.9)']]) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, 3, 6, 0, 0, 6.28); c.fill(); }
  }
  const img = g.getImageData(0, 0, N, N), hi = hg.getImageData(0, 0, N, N).data;
  const H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) H[i] = hi[i * 4] / 255;
  WOOD = { map: dataTex(new Uint8Array(img.data.buffer), N, N, true), normalMap: dataTex(heightToNormal(H, N, N, N, [3]), N, N, false) };
  return WOOD;
}

// --- Geometry helpers ------------------------------------------------------------------
// Parts carry position, normal, uv, colour and `leaf` (1 for foliage, which
// moves in the wind and lets light through; 0 for wood). Bark UVs run in
// metres-ish repeats of the bark cell; leaf UVs span one leaf cell.
function finish(g, col, leaf) {
  const n = g.attributes.position.count;
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('leaf', new THREE.BufferAttribute(new Float32Array(n).fill(leaf), 1));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'leaf'].includes(k)) g.deleteAttribute(k);
  return g;
}
function merge(parts) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

// A tapering tube through a list of points. `lobes` flutes the section and
// twists it up the tube, as an old olive trunk is.
function tube(pts, radii, sides, { lobes = 0, seed = 0, dark = 0.7, uRep = 2 } = {}) {
  const n = pts.length;
  const pos = [], idx = [], cols = [], uvs = [];
  const t = new THREE.Vector3(), up = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  let run = 0;
  for (let i = 0; i < n; i++) {
    if (i) run += pts[i].distanceTo(pts[i - 1]);
    t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    up.set(0, 0, 1);
    if (Math.abs(t.z) > 0.9) up.set(1, 0, 0);
    a.crossVectors(t, up).normalize();
    b.crossVectors(t, a).normalize();
    for (let j = 0; j <= sides; j++) {
      const th = (j / sides) * Math.PI * 2;
      const r = radii[i] * (1 + lobes * Math.sin(th * 3 + i * 1.1 + seed) + lobes * 0.5 * Math.sin(th * 5 - i * 0.7 + seed * 2));
      const p = pts[i];
      pos.push(p.x + (a.x * Math.cos(th) + b.x * Math.sin(th)) * r, p.y + (a.y * Math.cos(th) + b.y * Math.sin(th)) * r, p.z + (a.z * Math.cos(th) + b.z * Math.sin(th)) * r);
      const k = dark + (1 - dark) * Math.min(1, run / 1.5 + 0.2);
      cols.push(k, k, k);
      uvs.push((j / sides) * Math.max(1, Math.round(uRep * radii[0] / 0.2)) * 0.5, run / 0.9);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
    const p0 = i * (sides + 1) + j, p1 = p0 + 1, p2 = p0 + sides + 1, p3 = p2 + 1;
    idx.push(p0, p2, p1, p1, p2, p3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return finish(g.toNonIndexed(), [1, 1, 1], 0);
}

// A cluster of leaves: `n` crossed cards through one centre, each carrying a
// whole leaf spray. Normals lean toward the outside of the crown so the crown
// shades as one mass; colour darkens toward its inside and underside.
function leafCards(cx, cy, cz, r, crown, rand, { n = 3, sy = 1, stretch = 1 } = {}) {
  const pos = [], uv = [], nr = [], col = [];
  const [ccx, ccy, ccz, rx, ry, rz] = crown;
  const dx = (cx - ccx) / rx, dy = (cy - ccy) / ry, dz = (cz - ccz) / rz;
  const l = Math.hypot(dx, dy, dz) || 1;
  const on = new THREE.Vector3(dx / l, dy / l + 0.2, dz / l).normalize();
  const k = (0.55 + 0.35 * Math.min(1, l)) * (0.82 + 0.22 * smooth(-1, 1, dy));
  const e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    e.set(rand() * 3.14, (i / n) * Math.PI + rand() * 0.6, rand() * 3.14);
    q.setFromEuler(e);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of corners) {
      v.set(a * r * stretch, b * r, 0).applyQuaternion(q);
      pos.push(cx + v.x, cy + v.y * sy, cz + v.z);
      uv.push(a * 0.5 + 0.5, b * 0.5 + 0.5);
      nr.push(on.x, on.y, on.z);
      col.push(k, k, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return finish(g, [1, 1, 1], 1);
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// --- Tree shapes -----------------------------------------------------------------------
// Each archetype has a detailed model and a coarse one. Species share an
// archetype and differ in leaves, bark (from the atlas), size and tint.
function crownTree(spec, seed, high) {
  const rand = rng(seed);
  const parts = [];
  const { trunkH, trunkR, lean = 0.2, lobes = 0, stems = 1, crown: [cy, rx, ry, rz], clusters, clusterR, limbs = 4 } = spec;
  const crown = [0, cy, 0, rx, ry, rz];
  const tops = [];
  for (let s = 0; s < (high ? stems : 1); s++) {
    const a0 = (s / stems) * 6.28 + rand();
    const spread = stems > 1 && high ? 0.35 : 0;
    const pts = [], rad = [];
    const nSeg = high ? 5 : 1;
    for (let i = 0; i <= nSeg; i++) {
      const t = i / nSeg;
      const wob = high ? lean * Math.sin(t * 3 + seed + s) : 0;
      pts.push(V3(Math.cos(a0) * (spread * t * trunkH + wob * 0.6), t * trunkH * (high ? 1 : 1.15), Math.sin(a0) * (spread * t * trunkH) + wob * 0.4));
      rad.push(trunkR * (1.25 - 0.45 * t) * (stems > 1 && high ? 0.7 : 1) * (i === 0 ? 1.25 : 1));
    }
    parts.push(tube(pts, rad, high ? 9 : 4, { lobes: high ? lobes : 0, seed: seed + s, dark: 0.62 }));
    tops.push(pts[pts.length - 1]);
  }
  if (!high) {
    // Coarse: a few big cards over the crown's envelope.
    const lumps = [[0, 0.25, 0, 0.7], [0.5, -0.1, 0.3, 0.62], [-0.5, -0.05, -0.25, 0.62], [0.15, -0.15, -0.55, 0.6], [-0.25, -0.1, 0.55, 0.6]];
    for (const [x, y, z, r] of lumps) parts.push(leafCards(x * rx, cy + y * ry, z * rz, r * Math.max(rx, rz) * 1.15, crown, rand, { n: 2, sy: ry / Math.max(rx, rz) * 1.3 }));
    return merge(parts);
  }
  const ends = [];
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * 6.28 + rand() * 0.8;
    const from = tops[l % tops.length];
    const to = V3(Math.cos(a) * rx * 0.6, cy + (rand() - 0.3) * ry * 0.5, Math.sin(a) * rz * 0.6);
    const mid = V3((from.x + to.x) / 2 + (rand() - 0.5) * 0.4, (from.y + to.y) / 2 + 0.2, (from.z + to.z) / 2 + (rand() - 0.5) * 0.4);
    parts.push(tube([from, mid, to], [trunkR * 0.62, trunkR * 0.42, trunkR * 0.18], 6, { lobes: lobes * 0.5, seed: seed + l }));
    ends.push(to);
  }
  // Leaf clusters on the crown's shell (Fibonacci spiral, jittered), each
  // reached by a twig from the nearest limb.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < clusters; i++) {
    const y = 1 - (i / (clusters - 1)) * 1.65;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i + seed;
    const d = 0.55 + rand() * 0.45;
    const x = Math.cos(th) * r * rx * d, z = Math.sin(th) * r * rz * d, yy = cy + y * ry * d;
    let best = ends[0], bd = Infinity;
    for (const e of ends) { const dd = Math.hypot(e.x - x, e.y - yy, e.z - z); if (dd < bd) { bd = dd; best = e; } }
    if (bd > clusterR * 0.8 && i % 2 === 0) parts.push(tube([best, V3(x * 0.95, yy - clusterR * 0.15, z * 0.95)], [trunkR * 0.14, trunkR * 0.06], 3));
    parts.push(leafCards(x, yy, z, clusterR * (0.85 + rand() * 0.4), crown, rand, { n: 2 }));
  }
  return merge(parts);
}

// Cypress: a narrow column of dark foliage.
function cypress(seed, high) {
  const rand = rng(seed);
  const parts = [tube([V3(0, 0, 0), V3(0, 2.4, 0)], [0.2, 0.14], high ? 6 : 4)];
  const crown = [0, 4.6, 0, 0.95, 3.9, 0.95];
  const n = high ? 16 : 4;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = 1.6 + t * 6.8, w = 0.95 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) + 0.15;
    const a = i * 2.4 + seed;
    parts.push(leafCards(Math.cos(a) * w * 0.3, y, Math.sin(a) * w * 0.3, (high ? 0.55 : 1.0) + w * 0.4, crown, rand, { n: 2, sy: high ? 1.4 : 1.9 }));
  }
  return merge(parts);
}

// Date palm: a trunk of old frond bases and a head of arching fronds, each
// two strips of leaflets in a shallow V either side of the midrib.
function palm(seed, high) {
  const rand = rng(seed);
  const parts = [];
  const H = 8.5;
  const pts = [], rad = [];
  const nSeg = high ? 10 : 2;
  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg;
    pts.push(V3(Math.sin(t * 1.6) * 0.5, t * H, 0));
    rad.push(0.26 * (1 - 0.12 * t));
  }
  parts.push(tube(pts, rad, high ? 8 : 5, { uRep: 3 }));
  const top = pts[pts.length - 1];
  const nF = high ? 18 : 8;
  for (let f = 0; f < nF; f++) {
    const a = (f / nF) * 6.28 + rand() * 0.3;
    const rise = f % 3 === 0 ? 0.7 : f % 3 === 1 ? 0.35 : 0.05;
    const L = 3.4 + rand() * 0.8;
    const seg = high ? 6 : 2;
    const pos = [], uv = [], nr = [];
    const ca = Math.cos(a), sa = Math.sin(a);
    const at = (t) => [top.x + ca * t * L, top.y + rise * L * t - 0.75 * t * t * L * 0.5, top.z + sa * t * L];
    for (const vSide of high ? [-1, 1] : [0]) {
      for (let i = 0; i < seg; i++) {
        const t0 = i / seg, t1 = (i + 1) / seg;
        const p0 = at(t0), p1 = at(t1);
        const w = 0.75;
        // Leaflets fold up in a V on both sides of the midrib.
        const side = (sgn) => [-sa * w * sgn, (vSide ? 0.28 : 0) * w, ca * w * sgn];
        const s0 = side(1), s1 = side(-1);
        const q = (p, s) => [p[0] + s[0], p[1] + s[1], p[2] + s[2]];
        const A = q(p0, s0), B = q(p1, s0), Cc = q(p1, s1), D = q(p0, s1);
        const quad = vSide < 0 ? [[p0, 0.5], [p1, 0.5], [B, 1], [p0, 0.5], [B, 1], [A, 1]] : vSide > 0 ? [[p0, 0.5], [D, 0], [Cc, 0], [p0, 0.5], [Cc, 0], [p1, 0.5]] : [[A, 1], [D, 0], [Cc, 0], [A, 1], [Cc, 0], [B, 1]];
        for (const [p, vv] of quad) {
          pos.push(...p);
          const tt = (p === p1 || p === B || p === Cc) ? t1 : t0;
          uv.push(tt, vv);
          nr.push(0, 1, 0);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
    parts.push(finish(g, [0.9, 0.9, 0.9], 1));
  }
  return merge(parts);
}

// Vine: a gnarled stock trained low (Ezek 17:6, "a low spreading vine"),
// canes sprawling over the ground, one propped on a forked stick, with the
// pale new leaves of spring.
function vine(seed, high) {
  const rand = rng(seed);
  const parts = [];
  const stock = [V3(0, 0, 0), V3(0.08, 0.25, 0.04), V3(-0.04, 0.5, 0.02), V3(0.05, 0.62, -0.03)];
  parts.push(tube(high ? stock : [stock[0], stock[3]], high ? [0.09, 0.075, 0.07, 0.05] : [0.08, 0.05], high ? 6 : 3, { lobes: 0.12, seed }));
  const crown = [0, 0.55, 0, 1.0, 0.45, 1.0];
  if (!high) {
    parts.push(leafCards(0, 0.55, 0, 0.8, crown, rand, { n: 2, sy: 0.6 }));
    return merge(parts);
  }
  const top = stock[3];
  for (let c = 0; c < 4; c++) {
    const a = (c / 4) * 6.28 + rand() * 0.6;
    const L = 0.8 + rand() * 0.5;
    const end = V3(Math.cos(a) * L, 0.25 + rand() * 0.35, Math.sin(a) * L);
    const mid = V3(Math.cos(a) * L * 0.5, 0.62, Math.sin(a) * L * 0.5);
    parts.push(tube([top, mid, end], [0.035, 0.028, 0.018], 4));
    for (let k = 0; k < 2; k++) {
      const t = 0.5 + k * 0.45;
      parts.push(leafCards(mid.x + (end.x - mid.x) * t * 1.2, 0.55 + rand() * 0.2, mid.z + (end.z - mid.z) * t * 1.2, 0.32 + rand() * 0.08, crown, rand, { n: 2, sy: 0.8 }));
    }
    if (c === 0) {   // forked prop under the first cane
      const px = mid.x * 1.3, pz = mid.z * 1.3;
      parts.push(tube([V3(px, 0, pz), V3(px, 0.42, pz)], [0.03, 0.025], 3));
      parts.push(tube([V3(px, 0.42, pz), V3(px + 0.1, 0.58, pz)], [0.02, 0.015], 3));
      parts.push(tube([V3(px, 0.42, pz), V3(px - 0.1, 0.58, pz)], [0.02, 0.015], 3));
    }
  }
  return merge(parts);
}

const ARCH = {
  olive: { trunkH: 1.5, trunkR: 0.32, lobes: 0.24, lean: 0.35, stems: 1, crown: [3.4, 2.5, 1.45, 2.5], clusters: 42, clusterR: 0.62, limbs: 5 },
  broad: { trunkH: 2.0, trunkR: 0.34, lobes: 0.08, lean: 0.2, stems: 1, crown: [4.3, 3.0, 2.0, 3.0], clusters: 48, clusterR: 0.8, limbs: 6 },
  small: { trunkH: 1.3, trunkR: 0.17, lobes: 0.05, lean: 0.15, stems: 3, crown: [2.6, 2.1, 1.35, 2.1], clusters: 34, clusterR: 0.58, limbs: 6 },
};
let GEOS = null;
export function treeGeos() {
  if (GEOS) return GEOS;
  GEOS = { low: {}, high: {} };
  for (const [k, spec] of Object.entries(ARCH)) { GEOS.low[k] = crownTree(spec, 11 + k.length, false); GEOS.high[k] = crownTree(spec, 11 + k.length, true); }
  GEOS.low.cypress = cypress(5, false); GEOS.high.cypress = cypress(5, true);
  GEOS.low.palm = palm(7, false); GEOS.high.palm = palm(7, true);
  GEOS.low.vine = vine(3, false); GEOS.high.vine = vine(3, true);
  const cut = new THREE.CircleGeometry(0.34, 9);
  cut.rotateX(-Math.PI / 2);
  cut.translate(0, 0.55, 0);
  const cutF = finish(cut.toNonIndexed(), [1.5, 1.3, 1.0], 0);
  GEOS.stump = merge([tube([V3(0, -0.1, 0), V3(0.02, 0.35, 0.01), V3(0, 0.55, 0)], [0.4, 0.36, 0.33], 8, { lobes: 0.18, seed: 2, dark: 0.55 }), cutF]);
  return GEOS;
}

// Species: archetype, size and a tint over the painted leaves.
export const SPECIES = {
  olive: { arch: 'olive', s: 1, col: [1, 1, 1] },
  oak: { arch: 'broad', s: 0.9, col: [1, 1, 1] },          // Quercus calliprinos, evergreen
  terebinth: { arch: 'broad', s: 0.95, col: [1, 1, 1] },    // Pistacia palaestina, new leaves
  carob: { arch: 'broad', s: 0.85, col: [1, 1, 1] },
  sycamore: { arch: 'broad', s: 1.3, col: [1, 1, 1] },
  fig: { arch: 'small', s: 1.05, col: [1, 1, 1] },
  almond: { arch: 'small', s: 1, col: [1, 1, 1] },
  pomegranate: { arch: 'small', s: 0.75, col: [1, 1, 1] },
  tamarisk: { arch: 'small', s: 1.15, col: [1, 1, 1] },
  cypress: { arch: 'cypress', s: 1, col: [1, 1, 1] },
  palm: { arch: 'palm', s: 1, col: [1, 1, 1] },
  vine: { arch: 'vine', s: 1, col: [1, 1, 1] },
};

// Fraction of the ground under terraced cultivation (as the terrain shader).
export function farmedAt(x, z) {
  const desert = smooth(1050, 1700, x);
  const reach = 1 - smooth(1300, 2100, Math.hypot(x + 150, z - 450));
  return (0.55 + 0.45 * fbm(x / 260, z / 260, 2)) * (1 - desert) * reach;
}

function pickSpecies(set, x, z, slope) {
  const h = hash(x, z, 3);
  if (set === 'garden') {
    if (h < 0.28) return 'pomegranate';
    if (h < 0.5) return 'fig';
    if (h < 0.64) return 'olive';
    if (h < 0.74) return 'palm';
    if (h < 0.82) return 'almond';
    if (h < 0.9) return 'sycamore';
    return 'cypress';
  }
  // The Kidron bed below the city and the desert edge: tamarisks; a few
  // sycamores low in the warm valley south of the city.
  const kd = Math.abs(x - valleyX('kidron', z));
  if (z > 0 && kd < 22 && h < 0.5) return z > 900 && h < 0.15 ? 'sycamore' : 'tamarisk';
  if (x > 1150 && h < 0.4) return 'tamarisk';
  const wild = (1 - farmedAt(x, z)) * 0.45 + smooth(0.3, 0.6, slope) * 0.5;
  if (hash(x, z, 5) < wild * 0.7) return h < 0.45 ? 'oak' : h < 0.8 ? 'terebinth' : 'carob';
  if (set === 'westHill' || set === 'square') return h < 0.6 ? 'olive' : h < 0.85 ? 'fig' : 'almond';
  return h < 0.7 ? 'olive' : h < 0.86 ? 'fig' : h < 0.96 ? 'almond' : 'carob';
}

// --- Materials ---------------------------------------------------------------------------
// Atlas lookup by species, wind, a dithered cross-fade between the two levels
// of detail, alpha that holds up in the small mipmaps, and light through the
// leaves when the sun is behind them.
const PLANT_COMMON_V = /* glsl */ `
  uniform float fTime, fNear, fBand, fRuin;
  uniform vec3 fCam;
  uniform float fBark[12];
  attribute float leaf;
  attribute float iSp;
  varying float vFade;
  varying float vLeaf;
  varying vec2 vCell;
  varying vec3 vPW;
`;
const PLANT_BEGIN = (high, depth) => /* glsl */ `
  vec3 iP = vec3(instanceMatrix[3]);
  float dC = distance(iP, fCam);
  float kf = fNear > 0.0 ? smoothstep(fNear - fBand, fNear, dC) : 1.0;
  ${high ? 'kf = 1.0 - kf;' : ''}
  ${depth ? 'kf = step(0.5, kf);' : ''}
  vFade = kf;
  vLeaf = leaf;
  int sp = int(iSp + 0.5);
  float cell = leaf > 0.5 ? iSp : fBark[sp];
  vCell = vec2(mod(cell, 4.0), 3.0 - floor(cell / 4.0));
  vec3 wl = normalize(transpose(mat3(instanceMatrix)) * vec3(1.0, 0.0, 0.2));
  float ph = iP.x * 0.21 + iP.z * 0.17;
  float gust = 0.55 + 0.45 * sin(fTime * 0.55 - iP.x * 0.018 + iP.z * 0.004);
  float sw = (sin(fTime * 1.3 + ph) * 0.6 + sin(fTime * 2.2 + ph * 1.7) * 0.4) * gust;
  float hh = max(transformed.y, 0.0);
  transformed += wl * leaf * (hh * 0.014 * (sw + gust) + 0.03 * sin(fTime * 4.5 + dot(transformed, vec3(3.1, 2.3, 2.7))));
  transformed.y += leaf * 0.02 * sin(fTime * 3.7 + dot(transformed, vec3(2.3, 1.9, 3.3)));
  if (kf < 0.002) transformed = vec3(0.0);
  vPW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
`;
const PLANT_COMMON_F = /* glsl */ `
  varying float vFade;
  varying float vLeaf;
  varying vec2 vCell;
  varying vec3 vPW;
  vec2 atlasUV(vec2 uv) { return (vCell + clamp(fract(uv), 0.004, 0.996)) * 0.25; }
`;
// Sample the atlas with the gradients of the unwrapped UVs (no seams where
// the bark repeats), and thicken the alpha in the small mipmaps.
const PLANT_MAP = /* glsl */ `
  #ifdef USE_MAP
  {
    vec2 gx = dFdx(vMapUv) * 0.25, gy = dFdy(vMapUv) * 0.25;
    vec4 sampledDiffuseColor = textureGrad(map, atlasUV(vMapUv), gx, gy);
    float lod = log2(max(max(length(gx), length(gy)) * 2048.0, 1.0));
    sampledDiffuseColor.a = vLeaf > 0.5 ? sampledDiffuseColor.a * (1.0 + 0.3 * lod) : 1.0;
    diffuseColor *= sampledDiffuseColor;
  }
  #endif
`;
const DITHER = (high) => /* glsl */ `
  {
    float dth = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    ${high ? 'if (dth > vFade) discard;' : 'if (dth < 1.0 - vFade) discard;'}
  }
`;
function patchPlant(mat, near, high) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FLORA_U, { fNear: FLORA_U[near], fBark: { value: BARK_CELL } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${PLANT_COMMON_V}\nuniform vec3 fSunDir;\nvarying float vTrans;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb = mix(color.rgb, color.rgb * instanceColor.rgb, leaf);
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PLANT_BEGIN(high, false)}
        vTrans = leaf * pow(max(dot(normalize(vPW - cameraPosition), fSunDir), 0.0), 3.0) * smoothstep(-0.02, 0.15, fSunDir.y);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${PLANT_COMMON_F}\nuniform vec3 fSunCol;\nvarying float vTrans;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${DITHER(high)}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        // Leaves keep the crown's normal on both faces; light through them is added below.
        if (vLeaf > 0.5) { normal = normalize(vNormal); nonPerturbedNormal = normal; }`)
      .replace('normal = normalize( tbn * mapN );', 'if (vLeaf < 0.5) normal = normalize( tbn * mapN );')
      .replace('#include <map_fragment>', PLANT_MAP)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        'vec3 mapN = textureGrad( normalMap, atlasUV(vNormalMapUv), dFdx(vNormalMapUv) * 0.25, dFdy(vNormalMapUv) * 0.25 ).xyz * 2.0 - 1.0;')
      .replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * fSunCol * vTrans * 0.55;\n#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `plant-${near}-${high ? 'hi' : 'lo'}-v2`;
  return mat;
}
// Shadows follow the same cut-outs, wind and level of detail.
function plantDepth(near, high, A) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: A?.map || null, alphaTest: 0.5 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FLORA_U, { fNear: FLORA_U[near], fBark: { value: BARK_CELL } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${PLANT_COMMON_V}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${PLANT_BEGIN(high, true)}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${PLANT_COMMON_F}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFade < 0.5) discard;')
      .replace('#include <map_fragment>', PLANT_MAP);
  };
  m.customProgramCacheKey = () => `plant-depth-${near}-${high ? 'hi' : 'lo'}-v2`;
  return m;
}
let PLANT_MATS = null;
function plantMats(quality) {
  if (PLANT_MATS) return PLANT_MATS;
  const A = treeAtlas(quality);
  const m = () => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.82, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5,
    map: A?.map || null, normalMap: A?.normalMap || null, normalScale: new THREE.Vector2(1, 1),
  });
  PLANT_MATS = {
    treeLow: patchPlant(m(), 'fTreeNear', false), treeHigh: patchPlant(m(), 'fTreeNear', true),
    vineLow: patchPlant(m(), 'fVineNear', false), vineHigh: patchPlant(m(), 'fVineNear', true),
    stump: patchPlant(m(), 'fZero', false),
    depth: {
      stump: plantDepth('fZero', false, A),
      treeLow: plantDepth('fTreeNear', false, A), treeHigh: plantDepth('fTreeNear', true, A),
      vineLow: plantDepth('fVineNear', false, A), vineHigh: plantDepth('fVineNear', true, A),
    },
  };
  return PLANT_MATS;
}
// An instanced plant mesh: its own copy of the geometry carrying the species
// of each instance (the atlas cell).
function plantMesh(geo, key, recs, cap, quality) {
  const M = plantMats(quality);
  const g = geo.clone();
  const sp = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap)), 1);
  recs.forEach((t, i) => { sp.array[i] = SP_INDEX[t.sp]; });
  g.setAttribute('iSp', sp);
  const im = new THREE.InstancedMesh(g, M[key], Math.max(1, cap));
  im.customDepthMaterial = M.depth[key];
  return im;
}

// --- Trees -------------------------------------------------------------------------------
// Every tree and vine, by archetype, for the detailed pool: { x, y, z, s, sy, r, col, sp, set }.
const RECORDS = { olive: [], broad: [], small: [], cypress: [], palm: [], vine: [] };
export const plantRecords = () => RECORDS;
let QUALITY = 'high';

function treeSet(list, setName) {
  const G = treeGeos();
  const group = new THREE.Group();
  const byArch = {};
  for (const t of list) (byArch[SPECIES[t.sp].arch] ||= []).push(t);
  for (const [arch, recs] of Object.entries(byArch)) {
    for (const t of recs) RECORDS[arch].push({ ...t, set: setName });
    const im = plantMesh(G.low[arch], 'treeLow', recs, recs.length, QUALITY);
    recs.forEach((t, i) => {
      _p.set(t.x, t.y - 0.15, t.z);
      _q.setFromAxisAngle(Y_AXIS, t.r);
      _s.set(t.s, t.s * t.sy, t.s);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
      im.setColorAt(i, _c.setRGB(...t.col));
    });
    im.count = recs.length;
    im.castShadow = im.receiveShadow = true;
    im.userData.infoId = 'city-olive';
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}

export function buildTrees(mats, quality, rand) {
  QUALITY = quality;
  const sets = { far: [], near: [], westHill: [], square: [], garden: [] };
  const max = quality === 'low' ? 3000 : 5600;
  let count = 0;
  for (const k of Object.keys(RECORDS)) if (k !== 'vine') RECORDS[k].length = 0;
  for (let n = 0; n < 160000 && count < max; n++) {
    const x = -1650 + rand() * 3300, z = -1350 + rand() * 3300;
    if (insidePolygon(x, z, EARLY_POLY) || inRect(x, z, PALACE_PAD, 10) || inRect(x, z, SOLOMON_PLATFORM, 18)) continue;
    let set;
    const gx = (x - KINGS_GARDEN.x) / KINGS_GARDEN.rx, gz = (z - KINGS_GARDEN.z) / KINGS_GARDEN.rz;
    if (inRect(x, z, PODIUM, 4)) set = 'square';
    else if (insidePolygon(x, z, LATE_POLY)) set = 'westHill';
    else if (gx * gx + gz * gz < 1) set = 'garden';
    else set = distToLine(x, z, LATE_POLY, true) < 220 ? 'near' : 'far';
    const grove = 0.5 + 0.5 * fbm(x / 120, z / 120, 2);
    const desert = smooth(1050, 1600, x);
    let p = (grove * 0.75 + (x > 300 ? 0.35 : 0) + (set === 'garden' ? 0.7 : 0)) * (1 - desert * 0.85);
    if (set === 'westHill') p *= 0.5;
    if (set === 'square') p *= 0.4;
    if (rand() > p) continue;
    const site = set === 'square' || set === 'westHill' ? 'sp' : 'square';
    const sl = slopeAt(x, z, site, 1);
    if (sl > 0.9) continue;
    // The same draws as always, so the shared random stream is unchanged.
    rand();
    const sc = set === 'garden' ? 0.55 + rand() * 0.4 : 0.75 + rand() * 0.6;
    const r = rand() * 6.28, k = rand();
    count++;
    const sp = pickSpecies(set, x, z, sl);
    const S = SPECIES[sp];
    const v = 0.9 + k * 0.2;
    const col = [v * (0.97 + hash(x, z, 9) * 0.06), v, v * (0.95 + hash(x, z, 8) * 0.08)];
    const s = (set === 'garden' ? Math.max(0.8, sc * 1.25) : sc) * S.s;
    sets[set].push({ x, y: terrainY(x, z, site), z, s, sy: 0.9 + k * 0.25, r, k, sp, col });
  }
  const out = {};
  for (const [k, list] of Object.entries(sets)) out[k] = treeSet(list, k);
  return out;
}

// Vines in rows along the terrace beds (the same contour bands the terrain
// shader draws as terrace walls).
export const VINE_ZONES = [
  { x0: -1000, x1: -450, z0: 920, z1: 1350 },
  { x0: 320, x1: 720, z0: -700, z1: -160 },
  { x0: -160, x1: 160, z0: 1180, z1: 1420 },
  { x0: -1320, x1: -860, z0: 120, z1: 620 },
];
export function vineyards(mats, quality, rand) {
  QUALITY = quality;
  const max = quality === 'low' ? 1800 : 5200;
  const vines = [];
  const step = 2.6;
  for (const zn of VINE_ZONES) {
    const nx = Math.ceil((zn.x1 - zn.x0) / step), nz = Math.ceil((zn.z1 - zn.z0) / step);
    const hs = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) hs[j * (nx + 1) + i] = terrainY(zn.x0 + i * step, zn.z0 + j * step, 'square');
    for (let j = 0; j < nz && vines.length < max; j++) for (let i = 0; i < nx && vines.length < max; i++) {
      const x = zn.x0 + i * step, z = zn.z0 + j * step;
      if (fbm(x / 140, z / 140, 2) < -0.05) continue;
      const y = hs[j * (nx + 1) + i];
      const s = Math.hypot(hs[j * (nx + 1) + i + 1] - y, hs[(j + 1) * (nx + 1) + i] - y) / step;
      if (s < 0.05 || s > 0.5) continue;
      const yy = y + 0.9 * Math.sin(x * 0.031 + z * 0.012) + 0.7 * Math.sin(z * 0.027);
      const f = yy / 1.9 - Math.floor(yy / 1.9);
      if (f < 0.32 || f > 0.46) continue;
      vines.push({ x: x + (rand() - 0.5) * 0.6, y, z: z + (rand() - 0.5) * 0.6, k: rand() });
    }
  }
  RECORDS.vine.length = 0;
  for (const v of vines) {
    const v2 = 0.88 + v.k * 0.2;
    RECORDS.vine.push({ x: v.x, y: terrainY(v.x, v.z, 'square'), z: v.z, s: 0.85 + v.k * 0.35, sy: 0.85 + hash(v.x, v.z, 4) * 0.4, r: v.k * 6.28, col: [v2, v2, v2], sp: 'vine', set: 'vine' });
  }
  const recs = RECORDS.vine;
  const im = plantMesh(treeGeos().low.vine, 'vineLow', recs, recs.length, quality);
  recs.forEach((v, i) => {
    _p.set(v.x, v.y - 0.05, v.z);
    _q.setFromAxisAngle(Y_AXIS, v.r);
    _s.set(v.s, v.s * v.sy, v.s);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
    im.setColorAt(i, _c.setRGB(...v.col));
  });
  im.count = recs.length;
  im.castShadow = false;
  im.receiveShadow = true;
  im.userData.infoId = 'city-vines';
  im.computeBoundingSphere();
  const group = new THREE.Group();
  group.userData.infoId = 'city-vines';
  group.add(im);
  return group;
}

// The detailed pool: the trees and vines nearest the viewer, refreshed as
// the viewer moves. `update` writes matrices only when the viewer has moved
// a few metres, into preallocated buffers.
export function treeDetail(quality) {
  const G = treeGeos();
  const treeNear = quality === 'low' ? 60 : 105, vineNear = quality === 'low' ? 28 : 46;
  FLORA_U.fTreeNear.value = treeNear;
  FLORA_U.fVineNear.value = vineNear;
  const group = new THREE.Group();
  const CELL = 64;
  const kinds = Object.keys(RECORDS).filter((k) => RECORDS[k].length).map((arch) => {
    const recs = RECORDS[arch];
    const isVine = arch === 'vine';
    const cap = Math.min(recs.length, isVine ? (quality === 'low' ? 250 : 650) : (quality === 'low' ? 90 : 220));
    const mesh = plantMesh(G.high[arch], isVine ? 'vineHigh' : 'treeHigh', [], cap, quality);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = !isVine;
    mesh.receiveShadow = true;
    mesh.userData.infoId = isVine ? 'city-vines' : 'city-olive';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, _c.setRGB(1, 1, 1));
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const spAttr = mesh.geometry.attributes.iSp;
    spAttr.setUsage(THREE.DynamicDrawUsage);
    // Matrices, colours and species of every record, and a grid of cells.
    const mats = new Float32Array(recs.length * 16), cols = new Float32Array(recs.length * 3), sps = new Float32Array(recs.length);
    const cells = new Map();
    recs.forEach((t, i) => {
      _p.set(t.x, t.y - (isVine ? 0.05 : 0.15), t.z);
      _q.setFromAxisAngle(Y_AXIS, t.r);
      _s.set(t.s, t.s * t.sy, t.s);
      _m.compose(_p, _q, _s).toArray(mats, i * 16);
      cols.set(t.col, i * 3);
      sps[i] = SP_INDEX[t.sp];
      const key = Math.floor(t.x / CELL) * 4096 + Math.floor(t.z / CELL);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    });
    for (const [k, v] of cells) cells.set(k, Int32Array.from(v));
    group.add(mesh);
    return { recs, mesh, mats, cols, sps, spAttr, cells, cap, radius: (isVine ? vineNear : treeNear) + 10 };
  });
  const last = new THREE.Vector3(1e9, 0, 0);
  let lastPeriod = '';
  const shown = (set, period) => set === 'vine' || set === 'far' || set === 'garden' || (set === 'near' && period !== 'ruin') || ((set === 'westHill' || set === 'square') && period === 'early');
  return {
    group,
    update(cam, period) {
      FLORA_U.fCam.value.copy(cam);
      FLORA_U.fRuin.value = period === 'ruin' ? 1 : 0;
      if (period === lastPeriod && Math.abs(cam.x - last.x) < 5 && Math.abs(cam.z - last.z) < 5 && Math.abs(cam.y - last.y) < 5) return;
      last.copy(cam);
      lastPeriod = period;
      for (const K of kinds) {
        const { recs, mesh, mats, cols, sps, spAttr, cells, cap, radius } = K;
        const im = mesh.instanceMatrix.array, ic = mesh.instanceColor.array, is = spAttr.array;
        let n = 0;
        const c0 = Math.floor((cam.x - radius) / CELL), c1 = Math.floor((cam.x + radius) / CELL);
        const r0 = Math.floor((cam.z - radius) / CELL), r1 = Math.floor((cam.z + radius) / CELL);
        for (let cx = c0; cx <= c1 && n < cap; cx++) for (let cz = r0; cz <= r1 && n < cap; cz++) {
          const list = cells.get(cx * 4096 + cz);
          if (!list) continue;
          for (let j = 0; j < list.length && n < cap; j++) {
            const i = list[j], t = recs[i];
            const dx = t.x - cam.x, dy = t.y - cam.y, dz = t.z - cam.z;
            if (dx * dx + dy * dy + dz * dz > radius * radius || !shown(t.set, period)) continue;
            for (let e = 0; e < 16; e++) im[n * 16 + e] = mats[i * 16 + e];
            ic[n * 3] = cols[i * 3]; ic[n * 3 + 1] = cols[i * 3 + 1]; ic[n * 3 + 2] = cols[i * 3 + 2];
            is[n] = sps[i];
            n++;
          }
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        spAttr.needsUpdate = true;
      }
    },
  };
}

// Stumps of the trees cut near the walls for the siege (Jer 6:6), for 573 BC.
export function stumps(quality) {
  const recs = [...RECORDS.olive, ...RECORDS.broad, ...RECORDS.small].filter((t) => t.set === 'near');
  const im = plantMesh(treeGeos().stump, 'stump', recs.map((t) => ({ ...t })), recs.length, quality);
  recs.forEach((t, i) => {
    _p.set(t.x, t.y - 0.05, t.z);
    _q.setFromAxisAngle(Y_AXIS, t.r);
    const s = 0.6 + t.s * 0.5;
    _s.set(s, 0.6 + hash(t.x, t.z, 2) * 0.8, s);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
    im.setColorAt(i, _c.setRGB(1, 1, 1));
  });
  im.count = recs.length;
  im.castShadow = im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}

// --- Farm buildings ------------------------------------------------------------------
// Dry stone: the terrace-wall texture with vertex colours for dark openings.
let STONE = null;
function stoneMats(mats) {
  if (STONE) return STONE;
  const t = mats.terraceStone;
  const w = woodTex();
  STONE = {
    stone: new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: t.bumpScale, roughness: 0.95, vertexColors: true }),
    brush: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true, map: w?.map || null, normalMap: w?.normalMap || null }),
    earth: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true, map: mats.earth?.map || null, bumpMap: mats.earth?.bumpMap || null, bumpScale: 1 }),
  };
  return STONE;
}

// UVs for the stone texture: metres over its tile size, on whichever plane
// the face mostly lies in.
function stoneUV(g, tile = 4) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [u, v] = ay > ax && ay > az ? [x, z] : ax > az ? [z, y] : [x, y];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function stoneParts(parts, tile = 4) {
  const gs = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.color) {
      const c = new Float32Array(n.attributes.position.count * 3).fill(1);
      n.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(k)) n.deleteAttribute(k);
    return stoneUV(n, tile);
  });
  return mergeGeometries(gs);
}
function tint(g, [r, gg, b]) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// Rough wall band: an open ring between two angles, with jittered courses.
function stoneRing(r0, r1, h, a0, a1, seg, { batter = 0.06, jitter = 0.05, seed = 1, base = -0.6 } = {}) {
  const pos = [], idx = [];
  const rings = [[r1, base], [r1, h], [r0, h], [r0, base]];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (a1 - a0) * (i / seg);
    for (const [r, y] of rings) {
      const t = (y - base) / (h - base);
      const j = 1 + jitter * Math.sin(a * 13 + seed) * Math.cos(a * 7 + y * 3);
      const rr = (r + (r === r1 ? batter * (1 - t) : 0)) * j;
      const yy = y >= h ? h * (1 + 0.06 * Math.sin(a * 17 + seed)) : y;
      pos.push(Math.cos(a) * rr, yy, Math.sin(a) * rr);
    }
  }
  for (let i = 0; i < seg; i++) for (let k = 0; k < 3; k++) {
    const a = i * 4 + k, b = a + 1, c = a + 4, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (a1 - a0 < 6.28) {    // ends of the wall at an opening
    for (const s of [0, seg]) idx.push(s * 4, s * 4 + 1, s * 4 + 2, s * 4, s * 4 + 2, s * 4 + 3);
    g.setIndex(idx);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}
function box(x0, x1, y0, y1, z0, z1, col) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return col ? tint(g, col) : g;
}

// Field watchtower (Isa 5:2): a round dry-stone tower, slightly battered,
// with a low doorway, a flat roof and parapet, and a booth of poles and
// branches on the roof for the watchman (Isa 1:8). Unit: 2 m radius, 4.2 m high.
function towerGeo() {
  const stone = [stoneRing(1.45, 2.0, 4.2, 0, Math.PI * 2, 28, { batter: 0.12, jitter: 0.03 })];
  stone.push(tint(box(-0.42, 0.42, -0.6, 1.55, 1.75, 2.2), [0.12, 0.1, 0.09]));        // doorway
  stone.push(tint(box(-0.55, 0.55, 1.55, 1.75, 1.7, 2.24), [0.92, 0.9, 0.86]));     // lintel stone
  const roof = new THREE.CylinderGeometry(1.5, 1.5, 0.25, 20).toNonIndexed();
  roof.translate(0, 4.0, 0);
  stone.push(tint(roof, [0.78, 0.72, 0.62]));
  stone.push(stoneRing(1.7, 2.0, 4.75, 0, Math.PI * 2, 24, { batter: 0, jitter: 0.04, base: 4.1, seed: 4 }));
  const brush = [];
  for (const [x, z] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) brush.push(tint(box(x - 0.05, x + 0.05, 4.1, 5.9, z - 0.05, z + 0.05), [0.85, 0.8, 0.74]));
  const roofB = new THREE.BoxGeometry(2.0, 0.22, 1.6, 4, 1, 3).toNonIndexed();
  const p = roofB.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.08 * Math.sin(p.getX(i) * 9 + p.getZ(i) * 7));
  roofB.translate(0, 5.95, 0);
  brush.push(tint(roofB, [0.98, 0.92, 0.7]));
  // A ladder of two poles and lashed rungs, up the side to the roof.
  for (const z of [-0.28, 0.28]) {
    const rail = new THREE.CylinderGeometry(0.045, 0.05, 4.9, 5).toNonIndexed();
    rail.rotateZ(0.12); rail.translate(2.35, 2.35, z);
    brush.push(tint(rail, [0.9, 0.84, 0.76]));
  }
  for (let i = 0; i < 11; i++) {
    const y = 0.35 + i * 0.4;
    const rung = new THREE.CylinderGeometry(0.03, 0.03, 0.62, 4).toNonIndexed();
    rung.rotateX(Math.PI / 2); rung.translate(2.35 - (y - 2.35) * Math.tan(0.12), y, 0);
    brush.push(tint(rung, [0.82, 0.76, 0.68]));
  }
  return { stone: stoneParts(stone), brush: stoneParts(brush, 0.8) };
}

// Sheepfold (Num 32:16): a ring of dry-stone wall with one opening, its top
// laid with thorn brush. Unit radius 1; the wall is 1.3 m high.
function foldGeo() {
  const gap = 0.22;
  const stone = stoneParts([stoneRing(0.92, 1.0, 1.3, gap, Math.PI * 2 - gap, 48, { batter: 0.015, jitter: 0.02 })]);
  const pos = [];
  for (let i = 0; i < 70; i++) {
    const a = gap + (Math.PI * 2 - 2 * gap) * (i / 70), a2 = a + (Math.PI * 2 - 2 * gap) / 70;
    const r = 0.96, h = 1.3;
    const top = h + 0.35 + 0.25 * Math.abs(Math.sin(i * 2.7));
    pos.push(Math.cos(a) * r, h, Math.sin(a) * r, Math.cos(a2) * r, h, Math.sin(a2) * r, Math.cos((a + a2) / 2) * (r + 0.02 * Math.sin(i)), top, Math.sin((a + a2) / 2) * r);
    pos.push(Math.cos(a) * (r - 0.03), h, Math.sin(a) * (r - 0.03), Math.cos(a2) * (r + 0.03), h, Math.sin(a2) * (r + 0.03), Math.cos(a2) * r, h + 0.28, Math.sin(a2) * r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return { stone, brush: stoneParts([tint(g, [0.62, 0.55, 0.45])], 0.4) };
}

export function farmBuildings(mats, plan) {
  const M = stoneMats(mats);
  const group = new THREE.Group();
  const T = towerGeo();
  const towerAt = (t, p, q, s, c) => {
    // Sit the tower on the lowest ground under it so it never floats.
    let lo = Infinity;
    for (let a = 0; a < 6.28; a += 1.05) lo = Math.min(lo, terrainY(t.x + Math.cos(a) * t.r, t.z + Math.sin(a) * t.r, 'square'));
    p.set(t.x, lo - 0.1, t.z);
    // Doorway on the downhill side.
    const gx = terrainY(t.x + 2, t.z, 'square') - terrainY(t.x - 2, t.z, 'square'), gz = terrainY(t.x, t.z + 2, 'square') - terrainY(t.x, t.z - 2, 'square');
    q.setFromAxisAngle(Y_AXIS, Math.atan2(-gx, -gz));
    s.set(t.r / 2, t.h / 4.2, t.r / 2);
    c.setRGB(1, 1, 1);
  };
  group.add(instanced(T.stone, M.stone, plan.towers, 'city-tower', towerAt));
  group.add(instanced(T.brush, M.brush, plan.towers, 'city-tower', towerAt));
  const F = foldGeo();
  const foldAt = (f, p, q, s, c) => {
    p.set(f.x, terrainY(f.x, f.z, 'square') - 0.15, f.z);
    q.setFromAxisAngle(Y_AXIS, hash(f.x, f.z, 1) * 6.28);
    s.set(f.r, 1, f.r);
    c.setRGB(1, 1, 1);
  };
  group.add(instanced(F.stone, M.stone, plan.folds, 'city-sheepfold', foldAt));
  const brush = instanced(F.brush, M.brush, plan.folds, 'city-sheepfold', foldAt);
  brush.castShadow = false;
  group.add(brush);
  return group;
}

// Threshing floors: a disc of beaten earth and bedrock laid on the ground,
// strewn with chaff, edged with a kerb of fieldstones; a heap of threshed
// grain beside some. Built per floor so each follows its own hilltop.
export function threshingFloors(mats, floors) {
  const M = stoneMats(mats);
  const group = new THREE.Group();
  const rand = rng(91);
  const floorParts = [], stones = [], heaps = [];
  for (const f of floors) {
    const Y = (x, z) => terrainY(x, z, 'square');
    // Disc in rings, each vertex on the ground.
    const R = 6, S = 28;
    const pos = [], col = [];
    const pt = (ri, si) => {
      const r = (ri / R) * f.r, a = (si / S) * Math.PI * 2;
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      const k = 0.9 + 0.1 * Math.sin(x * 3.1 + z * 2.3) * Math.cos(x * 1.7 - z * 2.9) - 0.06 * (ri / R);
      const straw = 0.5 + 0.5 * Math.sin(a * 5 + r * 1.3);
      return [x, Y(x, z) + 0.07, z, k * (0.86 + straw * 0.08), k * (0.8 + straw * 0.06), k * (0.66 + straw * 0.0)];
    };
    for (let ri = 0; ri < R; ri++) for (let si = 0; si < S; si++) {
      const a = pt(ri, si), b = pt(ri + 1, si), c = pt(ri + 1, si + 1), d = pt(ri, si + 1);
      for (const v of (ri === 0 ? [a, b, c] : [a, b, c, a, c, d])) { pos.push(v[0], v[1], v[2]); col.push(v[3], v[4], v[5]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    floorParts.push(g);
    // Kerb of fieldstones.
    const n = Math.round(f.r * 2 * Math.PI / 0.75);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.05;
      const x = f.x + Math.cos(a) * (f.r + 0.25), z = f.z + Math.sin(a) * (f.r + 0.25);
      const s = new THREE.DodecahedronGeometry(0.32 + rand() * 0.14, 0);
      s.scale(1.2, 0.7 + rand() * 0.3, 0.9);
      s.rotateY(a + rand());
      s.translate(x, Y(x, z) + 0.05, z);
      const k = 0.85 + rand() * 0.2;
      stones.push(tint(s, [k, k * 0.97, k * 0.92]));
    }
    if (f.heap) {
      const h = new THREE.SphereGeometry(1.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
      h.scale(1.15, 0.75, 1);
      const hp = h.attributes.position;
      for (let i = 0; i < hp.count; i++) hp.setY(i, hp.getY(i) * (1 + 0.12 * Math.sin(hp.getX(i) * 5 + hp.getZ(i) * 4)));
      h.translate(f.x + 1.5, Y(f.x + 1.5, f.z - 1) + 0.02, f.z - 1);
      heaps.push(tint(h, [0.86, 0.72, 0.42]));
    }
  }
  if (!floors.length) return group;
  const disc = new THREE.Mesh(stoneParts(floorParts, 3), M.earth);
  disc.receiveShadow = true;
  disc.userData.infoId = 'city-threshing';
  const kerb = new THREE.Mesh(stoneParts(stones), M.stone);
  kerb.castShadow = kerb.receiveShadow = true;
  kerb.userData.infoId = 'city-threshing';
  group.add(disc, kerb);
  if (heaps.length) {
    const heap = new THREE.Mesh(stoneParts(heaps), mats.straw.clone());
    heap.material.vertexColors = true;
    heap.castShadow = heap.receiveShadow = true;
    heap.userData.infoId = 'city-threshing';
    group.add(heap);
  }
  return group;
}
