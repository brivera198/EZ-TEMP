// Crops, grass, flowers, field walls and the works of the farmer close to the
// viewer: the land of Judah in spring (Nisan), and as it lay thirteen years
// after the siege.
//
// Ground cover, crops, field walls and pebbles are drawn on lattices that
// follow the viewer: each lattice is one instanced draw whose instances find
// their place, size and kind in the vertex shader from a few textures (where
// cover is allowed, which field a point is in, how high the ground is). No
// instance is moved on the CPU; only a small height map around the viewer is
// refreshed, a row at a time, as the viewer moves. Every lattice fades out
// with distance by shrinking its plants into the ground, so nothing pops.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainY, insidePolygon, inRect, smooth, distToLine, valleyX, naturalElevation, rng, PODIUM, LATE_POLY, EARLY_POLY, DETAIL } from './terrain.js';
import { ROADS, KINGS_GARDEN, SILOAM_POOL, LOWER_POOL, PALACE_PAD, SOLOMON_PLATFORM } from './data.js';
import { FLORA_U, treeDetail, stumps, plantRecords, canvas2d, dataTex, bleed, drawLeaf, woodTex, farmedAt, hash, VINE_ZONES } from './country.js';

const X0 = DETAIL.cx - DETAIL.size / 2, Z0 = DETAIL.cz - DETAIL.size / 2;
const HAS_DOM = typeof document !== 'undefined';

// --- The ground atlas: flowers, grass, crops (4 × 4 cells) ------------------------------
// 0 anemone, 1 poppy, 2 crown daisy, 3 chamomile (seen from above);
// 4 mustard, 5 lupin, 6 cyclamen, 7 thistle (seen from the side);
// 8 green grass, 9 dry grass, 10 barley, 11 wheat, 12 stubble, 13 garden
// beds, 14 thorns and briers, 15 plain white (for blades coloured in the shader).
const rgb = (c, k = 1) => `rgb(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))})`;
function groundAtlas(C) {
  const N = C * 4;
  const [cv, g] = canvas2d(N);
  const rand = rng(404);
  const u = C / 256;
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * C, Math.floor(i / 4) * C); g.beginPath(); g.rect(0, 0, C, C); g.clip(); fn(); g.restore(); };
  const ellipse = (x, y, rx, ry, a, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 6.28); g.fill(); };
  // Seen from above: petals round a centre.
  const flowerTop = (n, len, wid, col, centre, cr, shape = 'oval') => {
    const cx = C / 2, cy = C / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.28 + rand() * 0.15;
      if (shape === 'ray') ellipse(cx + Math.cos(a) * len * 0.55, cy + Math.sin(a) * len * 0.55, len * 0.5, wid, a, rgb(col, 0.9 + rand() * 0.2));
      else drawLeaf(g, cx, cy, a, len, wid, 'oval', rgb(col, 0.85 + rand() * 0.25), rgb(col, 0.7));
    }
    ellipse(cx, cy, cr, cr, 0, centre);
  };
  cell(0, () => { flowerTop(6, 112 * u, 40 * u, [214, 30, 44], 'rgb(36,16,40)', 24 * u); for (let i = 0; i < 14; i++) ellipse(C / 2 + (rand() - 0.5) * 50 * u, C / 2 + (rand() - 0.5) * 50 * u, 3 * u, 3 * u, 0, 'rgb(20,10,30)'); });
  cell(1, () => { flowerTop(4, 116 * u, 62 * u, [232, 62, 30], 'rgb(30,20,20)', 20 * u); ellipse(C / 2, C / 2, 10 * u, 10 * u, 0, 'rgb(90,110,60)'); });
  cell(2, () => flowerTop(15, 110 * u, 15 * u, [246, 206, 40], 'rgb(214,150,20)', 30 * u, 'ray'));
  cell(3, () => flowerTop(18, 104 * u, 11 * u, [246, 244, 236], 'rgb(232,196,40)', 30 * u, 'ray'));
  const stem = (x0, y0, x1, y1, w, col = [70, 104, 44]) => { g.strokeStyle = rgb(col); g.lineWidth = w * u; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (rand() - 0.5) * 20 * u, (y0 + y1) / 2, x1, y1); g.stroke(); };
  cell(4, () => {   // wild mustard: branched stems with small four-petalled yellow flowers
    for (let s = 0; s < 6; s++) {
      const x = C / 2 + (rand() - 0.5) * 120 * u, y = 30 * u + rand() * 50 * u;
      stem(C / 2 + (rand() - 0.5) * 20 * u, C, x, y, 3);
      for (let k = 0; k < 9; k++) {
        const fx = x + (rand() - 0.5) * 40 * u, fy = y + (rand() - 0.3) * 40 * u;
        for (let p = 0; p < 4; p++) ellipse(fx + Math.cos(p * 1.57) * 5 * u, fy + Math.sin(p * 1.57) * 5 * u, 5 * u, 3.5 * u, p * 1.57, rgb([244, 214, 50], 0.9 + rand() * 0.2));
      }
    }
    for (let i = 0; i < 4; i++) drawLeaf(g, C / 2, C - 10 * u, -1.57 + (rand() - 0.5) * 2.2, 70 * u, 20 * u, 'oak', rgb([70, 110, 50]), null);
  });
  cell(5, () => {   // blue lupin: a spike of pea flowers over palmate leaves
    for (let s = 0; s < 2; s++) {
      const x = C / 2 + (s - 0.5) * 60 * u;
      stem(x, C, x, 30 * u, 5);
      for (let k = 0; k < 16; k++) {
        const y = 40 * u + k * 9 * u, w = (14 - k * 0.4) * u;
        for (const sd of [-1, 1]) ellipse(x + sd * w * 0.7, y, w * 0.7, 6 * u, sd * 0.3, rgb(k < 4 ? [200, 196, 236] : [70, 74, 196], 0.9 + rand() * 0.2));
        ellipse(x, y - 3 * u, 4 * u, 3 * u, 0, 'rgb(240,240,250)');
      }
    }
    for (let i = 0; i < 9; i++) drawLeaf(g, C / 2, C - 50 * u, (i / 9) * 6.28, 50 * u, 9 * u, 'lance', rgb([80, 120, 60]), null);
  });
  cell(6, () => {   // cyclamen: marbled heart-shaped leaves and up-swept petals on slender stalks
    for (let i = 0; i < 6; i++) {
      const x = C / 2 + (rand() - 0.5) * 140 * u, y = C - 30 * u - rand() * 30 * u;
      ellipse(x, y, 30 * u, 24 * u, 0, rgb([40, 70, 36])); ellipse(x, y, 18 * u, 13 * u, 0, rgb([120, 140, 110]));
    }
    for (let s = 0; s < 5; s++) {
      const x = C / 2 + (s - 2) * 36 * u, y = 70 * u + rand() * 40 * u;
      stem(x, C - 40 * u, x + 6 * u, y + 20 * u, 3, [110, 60, 70]);
      const col = s % 2 ? [244, 214, 228] : [222, 120, 170];
      for (let p = 0; p < 5; p++) drawLeaf(g, x + 6 * u, y + 22 * u, -1.57 + (p - 2) * 0.22, 48 * u, 9 * u, 'oval', rgb(col, 0.95 + rand() * 0.1), null);
      ellipse(x + 6 * u, y + 24 * u, 6 * u, 5 * u, 0, 'rgb(150,30,90)');
    }
  });
  cell(7, () => {   // Syrian thistle: spiny white-veined leaves, a spiny head crowned with purple
    for (let i = 0; i < 7; i++) drawLeaf(g, C / 2, C - 20 * u, -1.57 + (i - 3) * 0.45, 110 * u, 26 * u, 'oak', rgb([96, 128, 84]), 'rgb(220,230,210)');
    stem(C / 2, C - 20 * u, C / 2, 70 * u, 7, [96, 128, 84]);
    for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.28; stem(C / 2, 70 * u, C / 2 + Math.cos(a) * 34 * u, 70 * u + Math.sin(a) * 28 * u, 2, [200, 200, 150]); }
    ellipse(C / 2, 72 * u, 26 * u, 22 * u, 0, rgb([96, 130, 70]));
    for (let i = 0; i < 40; i++) { const a = -3.14 + (i / 40) * 3.14; stem(C / 2, 60 * u, C / 2 + Math.cos(a) * 30 * u, 56 * u + Math.sin(a) * 34 * u, 3, [168, 70, 170]); }
  });
  const clump = (n, cols, hMin, hMax, wid) => {
    for (let i = 0; i < n; i++) {
      const x0 = C / 2 + (rand() - 0.5) * C * 0.5, h = (hMin + rand() * (hMax - hMin)) * C;
      const lean = (rand() - 0.5) * C * 0.6;
      const col = cols[Math.floor(rand() * cols.length)];
      g.fillStyle = rgb(col, 0.85 + rand() * 0.3);
      g.beginPath();
      g.moveTo(x0 - wid * u, C);
      g.quadraticCurveTo(x0 - wid * u * 0.5 + lean * 0.3, C - h * 0.6, x0 + lean, C - h);
      g.quadraticCurveTo(x0 + wid * u * 0.5 + lean * 0.3, C - h * 0.6, x0 + wid * u, C);
      g.fill();
    }
  };
  cell(8, () => clump(90, [[150, 200, 90], [170, 210, 110], [120, 170, 70], [190, 214, 120]], 0.35, 0.95, 4));
  cell(9, () => clump(80, [[210, 196, 130], [190, 170, 110], [160, 170, 100], [220, 206, 150]], 0.3, 0.9, 3.5));
  // Barley turning gold: nodding ears with long awns.
  cell(10, () => {
    for (let i = 0; i < 22; i++) {
      const x0 = 10 * u + rand() * (C - 20 * u), top = 18 * u + rand() * 40 * u, nod = (rand() - 0.3) * 30 * u;
      stem(x0, C, x0 + nod, top + 40 * u, 2.6, [196, 186, 110]);
      const ex = x0 + nod, ey = top + 40 * u;
      for (let k = 0; k < 9; k++) {
        const t = k / 9, gx = ex + nod * 0.25 * t, gy = ey - t * 38 * u;
        for (const sd of [-1, 1]) {
          ellipse(gx + sd * 3 * u, gy, 3.2 * u, 5 * u, sd * 0.4, rgb([214, 192, 110], 0.9 + rand() * 0.15));
          g.strokeStyle = rgb([226, 210, 140]); g.lineWidth = 0.8 * u;
          g.beginPath(); g.moveTo(gx + sd * 3 * u, gy); g.lineTo(gx + sd * 10 * u + nod * 0.2, gy - 34 * u); g.stroke();
        }
      }
    }
  });
  // Wheat still green: upright ears, broad leaves.
  cell(11, () => {
    for (let i = 0; i < 22; i++) {
      const x0 = 10 * u + rand() * (C - 20 * u), top = 30 * u + rand() * 40 * u;
      stem(x0, C, x0 + (rand() - 0.5) * 10 * u, top + 36 * u, 2.8, [90, 136, 56]);
      drawLeaf(g, x0, C - 60 * u - rand() * 60 * u, -1.57 + (rand() < 0.5 ? -0.6 : 0.6), 70 * u, 6 * u, 'lance', rgb([86, 140, 52]), null);
      for (let k = 0; k < 8; k++) for (const sd of [-1, 1]) ellipse(x0 + sd * 3.5 * u, top + 34 * u - k * 4.5 * u, 4 * u, 4.5 * u, sd * 0.5, rgb([116, 164, 70], 0.9 + rand() * 0.2));
    }
  });
  cell(12, () => {   // stubble with a few weeds
    for (let i = 0; i < 60; i++) { const x = rand() * C, h = (20 + rand() * 40) * u; stem(x, C, x + (rand() - 0.5) * 6 * u, C - h, 2.4, [214, 196, 140]); }
    clump(14, [[110, 150, 70]], 0.1, 0.35, 3);
  });
  cell(13, () => {   // garden beds: lettuce rosettes, leeks and onions
    for (let i = 0; i < 9; i++) drawLeaf(g, C * 0.3, C, -1.57 + (i - 4) * 0.3, (60 + rand() * 40) * u, 22 * u, 'oval', rgb([120, 176, 70], 0.9 + rand() * 0.2), rgb([170, 210, 120]));
    for (let i = 0; i < 12; i++) { const x = C * 0.62 + (rand() - 0.5) * 70 * u; drawLeaf(g, x, C, -1.57 + (rand() - 0.5) * 0.5, (110 + rand() * 60) * u, 6 * u, 'lance', rgb([96, 140, 110], 0.9 + rand() * 0.2), null); }
  });
  cell(14, () => {   // thorns and briers: tangled grey branches, sparse leaves, a few purple heads
    for (let i = 0; i < 26; i++) {
      const x0 = rand() * C, y0 = C, x1 = rand() * C, y1 = C * (0.1 + rand() * 0.5);
      stem(x0, y0, x1, y1, 2.5, [120, 104, 88]);
      for (let k = 0; k < 6; k++) { const t = rand(); const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; stem(x, y, x + (rand() - 0.5) * 16 * u, y - 8 * u, 1.2, [150, 136, 110]); }
    }
    for (let i = 0; i < 30; i++) drawLeaf(g, rand() * C, C * (0.2 + rand() * 0.7), rand() * 6.28, 22 * u, 6 * u, 'oak', rgb([110, 128, 90]), null);
    for (let i = 0; i < 4; i++) ellipse(rand() * C, C * (0.15 + rand() * 0.3), 9 * u, 9 * u, 0, 'rgb(160,80,160)');
  });
  cell(15, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, C, C); });
  const img = g.getImageData(0, 0, N, N);
  bleed(img, N, C);
  return dataTex(new Uint8Array(img.data.buffer), N, N, true);
}

// --- Masks ---------------------------------------------------------------------------------
// Where ground cover may grow, one grey channel per period: black on roads,
// paths, floors, pools and inside the walls; grey on the verges (thistles).
function coverMasks(plan, size, extra) {
  const k = size / DETAIL.size;
  const P = (x, z) => [(x - X0) * k, (z - Z0) * k];
  const paint = (period) => {
    const [cv, g] = canvas2d(size);
    g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    g.lineJoin = g.lineCap = 'round';
    const line = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = Math.max(1, w * k); g.beginPath(); pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); };
    const disc = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); const [px, py] = P(x, z); g.arc(px, py, Math.max(1, r * k), 0, 6.28); g.fill(); };
    const rect = (r, m, col) => { g.fillStyle = col; const [a, b] = P(r.x0 - m, r.z0 - m), [c, d] = P(r.x1 + m, r.z1 + m); g.fillRect(a, b, c - a, d - b); };
    for (const road of ROADS) if (road.periods.includes(period)) line(road.pts, 13, 'rgb(150,150,150)');
    for (const road of ROADS) if (road.periods.includes(period)) line(road.pts, 5, '#000');
    for (const p of extra.paths) if (!p.periods || p.periods.includes(period)) { line(p.pts, 3.5, 'rgb(170,170,170)'); line(p.pts, 1.3, 'rgb(30,30,30)'); }
    const poly = period === 'early' ? EARLY_POLY : LATE_POLY;
    g.fillStyle = '#000';
    g.beginPath(); poly.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fill();
    line([...poly, poly[0]], 8, '#000');
    for (const f of plan.floors) if (period === 'early' || !insidePolygon(f.x, f.z, LATE_POLY)) { disc(f.x, f.z, f.r + 5, 'rgb(150,150,150)'); disc(f.x, f.z, f.r + 1.2, '#000'); }
    for (const f of plan.folds) { disc(f.x, f.z, f.r + 4, 'rgb(150,150,150)'); disc(f.x, f.z, f.r, 'rgb(40,40,40)'); }
    for (const t of plan.towers) disc(t.x, t.z, t.r + 0.8, '#000');
    for (const pl of [LOWER_POOL, ...(period === 'early' ? [] : [SILOAM_POOL])]) rect({ x0: pl.x - pl.w / 2, x1: pl.x + pl.w / 2, z0: pl.z - pl.d / 2, z1: pl.z + pl.d / 2 }, 2, '#000');
    line(extra.channel, 3.2, '#000');
    rect(PODIUM, 8, '#000'); rect(SOLOMON_PLATFORM, 8, '#000'); rect(PALACE_PAD, 8, '#000');
    for (const s of extra.sites) disc(s.x, s.z, s.r, '#000');
    return g.getImageData(0, 0, size, size).data;
  };
  const e = paint('early'), l = paint('late');
  const out = new Uint8Array(size * size * 2);
  for (let i = 0; i < size * size; i++) { out[i * 2] = e[i * 4]; out[i * 2 + 1] = l[i * 4]; }
  const t = new THREE.DataTexture(out, size, size, THREE.RGFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Terraced farmland and irrigated gardens, as the terrain shader has them.
function farmMask(M = 256) {
  const cell = DETAIL.size / M;
  const d = new Uint8Array(M * M * 4);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = X0 + (i + 0.5) * cell, z = Z0 + (j + 0.5) * cell;
    const o = (j * M + i) * 4;
    const gx = (x - KINGS_GARDEN.x) / KINGS_GARDEN.rx, gz = (z - KINGS_GARDEN.z) / KINGS_GARDEN.rz;
    let garden = smooth(1.05, 0.8, Math.hypot(gx, gz));
    if (z > 560 && z < 1400) garden = Math.max(garden, smooth(30, 10, Math.abs(x - valleyX('kidron', z))) * 0.8);
    d[o] = Math.round(Math.max(0, Math.min(1, farmedAt(x, z))) * 255);
    d[o + 1] = Math.round(garden * 255);
    d[o + 3] = 255;
  }
  const t = new THREE.DataTexture(d, M, M);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Which field each texel belongs to (index + 1), marked generously so the
// shader can test the field's exact rectangle; and the table of fields:
// row 0 (x, z, angle, kind), row 1 (half width, half depth, reaped up to u,
// 1 if the field lies inside the later walls and exists only in Solomon's time).
// Kinds: 0 ploughed, 1 barley, 2 wheat, 3 fallow, 5 garden beds.
function fieldTextures(fields, size) {
  const cell = DETAIL.size / size;
  const idx = new Uint8Array(size * size * 2);
  fields.forEach((f, n) => {
    const c = Math.cos(f.ang), s = Math.sin(f.ang), m = cell * 0.72;
    const R = Math.hypot(f.w, f.d) / 2 + m;
    const i0 = Math.max(0, Math.floor((f.x - R - X0) / cell)), i1 = Math.min(size - 1, Math.ceil((f.x + R - X0) / cell));
    const j0 = Math.max(0, Math.floor((f.z - R - Z0) / cell)), j1 = Math.min(size - 1, Math.ceil((f.z + R - Z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = X0 + (i + 0.5) * cell - f.x, dz = Z0 + (j + 0.5) * cell - f.z;
      const uu = dx * c + dz * s, vv = -dx * s + dz * c;
      if (Math.abs(uu) > f.w / 2 + m || Math.abs(vv) > f.d / 2 + m) continue;
      idx[(j * size + i) * 2] = (n + 1) % 256;
      idx[(j * size + i) * 2 + 1] = Math.floor((n + 1) / 256);
    }
  });
  const it = new THREE.DataTexture(idx, size, size, THREE.RGFormat);
  it.needsUpdate = true;
  const W = 512;
  const tab = new Float32Array(W * 2 * 4);
  fields.forEach((f, n) => {
    tab.set([f.x, f.z, f.ang, f.crop], n * 4);
    tab.set([f.w / 2, f.d / 2, f.reapU, f.earlyOnly ? 1 : 0], (W + n) * 4);
  });
  const tt = new THREE.DataTexture(tab, W, 2, THREE.RGBAFormat, THREE.FloatType);
  tt.needsUpdate = true;
  return { idx: it, tab: tt, size };
}

// --- Shared shader code -----------------------------------------------------------------
const LAND_GLSL = /* glsl */ `
  uniform float fTime, uPer, fDay;
  uniform vec3 fCam;
  uniform vec2 uC;
  uniform sampler2D hMap, mE, mF, fIdx, fTab;
  uniform vec4 hInfo, mRect, lat, fade;
  uniform float fIdxN;
  uniform vec3 fSunDir;
  varying float vTrans;
  uint hsh(uvec2 q, uint s) {
    uint n = q.x * 1597334673u ^ q.y * 3812015801u ^ s * 2798796415u;
    n = (n ^ (n >> 15)) * 2246822519u;
    n ^= n >> 13;
    return n;
  }
  float rnd(vec2 k, float s) { return float(hsh(uvec2(ivec2(k) + 65536), uint(s)) >> 8) / 16777216.0; }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 w = f * f * (3.0 - 2.0 * f);
    float a = rnd(i, 91.0), b = rnd(i + vec2(1.0, 0.0), 91.0), c = rnd(i + vec2(0.0, 1.0), 91.0), d = rnd(i + 1.0, 91.0);
    return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
  }
  // This instance's lattice point: the copy of its slot nearest the centre,
  // so it stays put in the world while the lattice wraps round the viewer.
  vec2 cellPos(out vec2 key) {
    float id = float(gl_InstanceID);
    vec2 ij = vec2(mod(id, lat.y), floor(id / lat.y));
    vec2 o = ij * lat.x;
    vec2 k = floor((uC - o) / lat.z + 0.5);
    key = ij + k * lat.y;
    return o + k * lat.z;
  }
  float hAt(vec2 p, out vec2 g) {
    vec2 q = p / hInfo.x, i0 = floor(q), f = q - i0;
    ivec2 a = ivec2(mod(i0, hInfo.y)), b = ivec2(mod(i0 + 1.0, hInfo.y));
    float h00 = texelFetch(hMap, a, 0).r, h10 = texelFetch(hMap, ivec2(b.x, a.y), 0).r;
    float h01 = texelFetch(hMap, ivec2(a.x, b.y), 0).r, h11 = texelFetch(hMap, b, 0).r;
    g = vec2(mix(h10 - h00, h11 - h01, f.y), mix(h01 - h00, h11 - h10, f.x)) / hInfo.x;
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  }
  float allowAt(vec2 p) {
    vec2 e = texture(mE, (p - mRect.xy) * mRect.zw).rg;
    return uPer < 0.5 ? e.r : e.g;
  }
  // The field at p: its kind (-1 for none), its records and p in its frame.
  float fieldAt(vec2 p, out vec4 f0, out vec4 f1, out vec2 fu) {
    vec2 t = (p - mRect.xy) * mRect.zw * fIdxN;
    f0 = vec4(0.0); f1 = vec4(0.0); fu = vec2(0.0);
    if (t.x < 0.0 || t.y < 0.0 || t.x >= fIdxN || t.y >= fIdxN) return -1.0;
    vec2 c = texelFetch(fIdx, ivec2(t), 0).rg * 255.0;
    float id = floor(c.x + 0.5) + floor(c.y + 0.5) * 256.0 - 1.0;
    if (id < 0.0) return -1.0;
    f0 = texelFetch(fTab, ivec2(int(id), 0), 0);
    f1 = texelFetch(fTab, ivec2(int(id), 1), 0);
    if (f1.w > 0.5 && uPer > 0.5) return -1.0;
    vec2 d = p - f0.xy;
    float ca = cos(f0.z), sa = sin(f0.z);
    fu = vec2(d.x * ca + d.y * sa, -d.x * sa + d.y * ca);
    if (abs(fu.x) > f1.x || abs(fu.y) > f1.y) return -1.0;
    return f0.w;
  }
  vec3 windDir() { return vec3(0.98, 0.0, 0.2); }
  float windAt(vec2 p) {
    float gust = 0.5 + 0.5 * sin(p.x * 0.07 - fTime * 0.9 + sin(p.y * 0.05) * 1.5);
    return (0.35 + 0.65 * gust) * (0.75 + 0.25 * sin(fTime * 2.3 + p.x * 0.6 + p.y * 0.4));
  }
  vec2 atlasCell(float c, vec2 uv) { return (vec2(mod(c, 4.0), 3.0 - floor(c / 4.0)) + clamp(uv, 0.01, 0.99)) * 0.25; }
`;

// A MeshStandardMaterial whose vertex stage is replaced by `body` (GLSL that
// sets gPos, gNrm, gCol and the atlas uv `gUv` for this vertex), lit both
// sides alike, with light through the leaves and a cut-out from the atlas.
function landMaterial(name, uniforms, body, { map, tex = true, rough = 0.9, extraFrag = '' } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, vertexColors: true, side: THREE.DoubleSide, alphaTest: tex ? 0.5 : 0, map: map || null });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${LAND_GLSL}\nattribute vec4 aPart;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vec3 gPos = vec3(0.0), gNrm = vec3(0.0, 1.0, 0.0), gCol = vec3(1.0);
        vec2 gUv = vec2(0.0);
        float gLeaf = 1.0;
        { ${body} }
        vColor.rgb = gCol;
        #ifdef USE_MAP
          vMapUv = gUv;
        #endif
        vTrans = gLeaf * pow(max(dot(normalize(gPos - cameraPosition), fSunDir), 0.0), 3.0) * smoothstep(-0.02, 0.15, fSunDir.y);`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = gNrm;')
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 fSunCol;\nvarying float vTrans;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
        { float lod = log2(max(max(length(dFdx(vMapUv)), length(dFdy(vMapUv))) * 1024.0, 1.0)); diffuseColor.a *= 1.0 + 0.35 * lod; }
        #endif
        ${extraFrag}`)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal); nonPerturbedNormal = normal;')
      .replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * fSunCol * vTrans * 0.5;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'flora-' + name + '-v1';
  return m;
}

function latticeMesh(geo, mat, n) {
  const g = new THREE.InstancedBufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
  if (geo.index) g.setIndex(geo.index);
  g.instanceCount = n * n;
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  return mesh;
}
const latU = (s, n, f) => ({ lat: { value: new THREE.Vector4(s, n, s * n, 0) }, fade: { value: new THREE.Vector4(...f) } });

// --- Geometry for the lattices ----------------------------------------------------------------
// Each vertex carries aPart = (part, t, a, b): part 0 blade, 1 flower stem,
// 2 upright card, 3 flat card, 4 grass card; t the height along it (0..1).
function geom(pos, part, uv, nrm) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  return g;
}
function quad(out, corners, part, n = [0, 1, 0]) {
  // corners: 4 × [x, y, z, u, v, t]
  for (const i of [0, 1, 2, 0, 2, 3]) {
    const c = corners[i];
    out.pos.push(c[0], c[1], c[2]); out.uv.push(c[3], c[4]); out.part.push(part, c[5], 0, 0); out.nrm.push(...n);
  }
}
// Near tuft: curved tapering blades, and one flower (stem, upright crossed
// cards, a flat card); the shader keeps the parts this instance needs.
function tuftGeo(blades) {
  const o = { pos: [], uv: [], part: [], nrm: [] };
  const rand = rng(5);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * 6.28 + rand() * 0.8;
    const r0 = 0.02 + rand() * 0.05, lean = 0.12 + rand() * 0.22, w = 0.009 + rand() * 0.007;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const hs = 0.7 + rand() * 0.5;
    const lv = [0, 0.4, 0.75, 1];
    const pt = (t, s) => [dx * (r0 + lean * t * t) + px * s * w * (1 - t * 0.85), t * hs, dz * (r0 + lean * t * t) + pz * s * w * (1 - t * 0.85)];
    const n = [dx * 0.5, 0.85, dz * 0.5];
    for (let i = 0; i < 3; i++) {
      const t0 = lv[i], t1 = lv[i + 1];
      const A = pt(t0, -1), B = pt(t0, 1), Cc = pt(t1, 1), D = pt(t1, -1);
      if (i < 2) quad(o, [[...A, 0.5, 0.5, t0], [...B, 0.5, 0.5, t0], [...Cc, 0.5, 0.5, t1], [...D, 0.5, 0.5, t1]], 0, n);
      else {
        const tip = pt(1, 0);
        for (const c of [[...A, 0.5, 0.5, t0], [...B, 0.5, 0.5, t0], [...tip, 0.5, 0.5, 1]]) { o.pos.push(c[0], c[1], c[2]); o.uv.push(c[3], c[4]); o.part.push(0, c[5], 0, 0); o.nrm.push(...n); }
      }
    }
  }
  // Flower stem (unit height, the shader scales it), then the head cards round its top.
  for (const c of [[-0.004, 0, 0, 0], [0.004, 0, 0, 0], [0, 1, 0, 1]]) { o.pos.push(c[0], c[1], c[2]); o.uv.push(0.5, 0.5); o.part.push(1, c[3], 0, 0); o.nrm.push(0, 0.7, 0.7); }
  for (const a of [0, Math.PI / 2]) {
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    quad(o, [[-cx, 0, -cz, 0, 0, 0], [cx, 0, cz, 1, 0, 0], [cx, 1, cz, 1, 1, 1], [-cx, 1, -cz, 0, 1, 1]], 2, [Math.sin(a) * 0.3, 0.9, Math.cos(a) * 0.3]);
  }
  quad(o, [[-0.5, 0, -0.5, 0, 0, 0], [0.5, 0, -0.5, 1, 0, 0], [0.5, 0, 0.5, 1, 1, 0], [-0.5, 0, 0.5, 0, 1, 0]], 3);
  return geom(o.pos, o.part, o.uv, o.nrm);
}
// Far tuft: three crossed grass cards, an upright flower card and a flat one.
function cardTuftGeo() {
  const o = { pos: [], uv: [], part: [], nrm: [] };
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    quad(o, [[-cx, 0, -cz, 0, 0, 0], [cx, 0, cz, 1, 0, 0], [cx, 1, cz, 1, 1, 1], [-cx, 1, -cz, 0, 1, 1]], 4, [0, 1, 0]);
  }
  quad(o, [[-0.5, 0, 0, 0, 0, 0], [0.5, 0, 0, 1, 0, 0], [0.5, 1, 0, 1, 1, 1], [-0.5, 1, 0, 0, 1, 1]], 2, [0, 0.9, 0.3]);
  quad(o, [[-0.5, 0, -0.5, 0, 0, 0], [0.5, 0, -0.5, 1, 0, 0], [0.5, 0, 0.5, 1, 1, 0], [-0.5, 0, 0.5, 0, 1, 0]], 3);
  return geom(o.pos, o.part, o.uv, o.nrm);
}
// Crop clump: two crossed cards; and a furrow ridge for ploughed land (part 5).
function cropGeo() {
  const o = { pos: [], uv: [], part: [], nrm: [] };
  for (const a of [0.35, 0.35 + Math.PI / 2]) {
    const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
    quad(o, [[-cx, 0, -cz, 0, 0, 0], [cx, 0, cz, 1, 0, 0], [cx, 1, cz, 1, 1, 1], [-cx, 1, -cz, 0, 1, 1]], 2, [0, 1, 0]);
  }
  // Ridge along local x: a low triangular prism.
  const L = 0.5, W = 0.5;
  quad(o, [[-L, 0, -W, 0, 0, 0], [L, 0, -W, 0, 0, 0], [L, 1, 0, 0, 0, 1], [-L, 1, 0, 0, 0, 1]], 5, [0, 0.8, -0.6]);
  quad(o, [[-L, 1, 0, 0, 0, 1], [L, 1, 0, 0, 0, 1], [L, 0, W, 0, 0, 0], [-L, 0, W, 0, 0, 0]], 5, [0, 0.8, 0.6]);
  return geom(o.pos, o.part, o.uv, o.nrm);
}
// A short run of dry-stone wall: two courses of rough blocks, 1 m long, unit high.
function wallGeo() {
  const parts = [];
  const rand = rng(31);
  const stone = (x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, 1, 1, 1).toNonIndexed();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.9 + rand() * 0.2), p.getY(i) * (0.85 + rand() * 0.3), p.getZ(i) * (0.9 + rand() * 0.2));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.computeVertexNormals();
    return g;
  };
  parts.push(stone(-0.55, 0.02, -0.3, 0.52, -0.3, 0.3), stone(0.0, 0.56, -0.3, 0.48, -0.28, 0.3), stone(-0.32, 0.3, 0.46, 0.98, -0.26, 0.24), stone(0.28, 0.6, 0.46, 0.86, -0.22, 0.22));
  const g = mergeGeometries(parts);
  const n = g.attributes.position.count;
  const part = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { part[i * 4] = 6; part[i * 4 + 1] = Math.max(0, g.attributes.position.getY(i)); }
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 4));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}
// A few pebbles.
function pebbleGeo() {
  const parts = [];
  const rand = rng(77);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(1 + rand() * 0.5, 0.45 + rand() * 0.3, 0.8 + rand() * 0.4);
    g.rotateY(rand() * 3);
    const s = i ? 0.45 + rand() * 0.3 : 1;
    g.scale(s, s, s);
    g.translate(i ? (rand() - 0.5) * 1.2 : 0, 0.1, i ? (rand() - 0.5) * 1.2 : 0);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const part = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) part[i * 4] = 7;
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 4));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

// --- The plants' vertex stages -------------------------------------------------------------
// What grows at a lattice point: shared by the near and far ground cover.
const COVER_GLSL = /* glsl */ `
  vec2 key; vec2 base = cellPos(key);
  float r1 = rnd(key, 1.0), r2 = rnd(key, 2.0), r3 = rnd(key, 3.0), r4 = rnd(key, 4.0), r5 = rnd(key, 5.0), r6 = rnd(key, 6.0), r7 = rnd(key, 7.0);
  vec2 p = base + (vec2(r1, r2) - 0.5) * lat.x;
  vec2 grad; float gy = hAt(p, grad);
  float dist = distance(vec3(p.x, gy + 0.5, p.y), fCam);
  float fd = smoothstep(fade.x, fade.y, dist) * (1.0 - smoothstep(fade.z, fade.w, dist));
  vec2 muv = (p - mRect.xy) * mRect.zw;
  float allow = allowAt(p);
  vec4 fm = texture(mF, muv);
  float desert = smoothstep(1050.0, 1650.0, p.x + 120.0 * (vnoise(p * 0.004) - 0.5));
  float slope = length(grad);
  float rocky = smoothstep(0.22, 0.5, slope);
  float lush = clamp(smoothstep(75.0, 32.0, gy) * 0.75 + fm.g * 0.8 + 0.35 * (vnoise(p * 0.02 + 7.0) - 0.4), 0.0, 1.0);
  float waste = smoothstep(0.9, 0.6, allow) * step(0.2, allow) + (uPer > 1.5 ? 0.25 : 0.0);
  float cover = smoothstep(0.12, 0.5, allow) * (0.8 + 0.6 * lush) * (1.0 - 0.8 * desert) * (1.0 - 0.35 * rocky);
  cover *= 0.6 + 0.7 * vnoise(p * 0.09 + 3.0);
  vec4 f0, f1; vec2 fu;
  float kind = fieldAt(p, f0, f1, fu);
  bool crop = false;
  if (kind > -0.5) {
    if (uPer > 1.5) { cover = 1.0; waste = 0.9; }                       // unsown, gone to thorns (Isa 7:23-25)
    else if (kind < 0.5) cover = 0.0;                                     // ploughed
    else if (kind < 2.5) { crop = true; cover = fu.x < f1.z ? 0.3 : 0.22; }  // grain, with poppies and daisies
    else if (kind < 3.5) { cover = max(cover, 0.85); waste = max(waste, 0.5); }   // fallow
    else cover = 0.05;                                                    // garden beds
  }
  // Flowers: in patches of one kind, as they grow.
  float patchA = vnoise(p * 0.12 + 11.0), patchB = vnoise(p * 0.05 - 4.0);
  float flP = (0.03 + 0.2 * smoothstep(0.55, 0.85, patchA)) * (1.0 - desert) * (crop ? 1.6 : 1.0) * (uPer > 1.5 ? 0.6 : 1.0);
  float flower = -1.0;
  if (r6 < flP) {
    if (crop) flower = r7 < 0.55 ? 1.0 : r7 < 0.85 ? 2.0 : 0.0;
    else if (waste > 0.45 && r7 < 0.75) flower = 7.0;
    else if (rocky > 0.25 && r7 < 0.55) flower = 6.0;
    else flower = patchB < 0.28 ? 0.0 : patchB < 0.42 ? 1.0 : patchB < 0.56 ? 2.0 : patchB < 0.66 ? 3.0 : patchB < 0.8 ? 4.0 : 5.0;
  } else if (waste > 0.55 && r6 < flP + 0.12 * waste) flower = 7.0;
  float keep = cover * fd;
  float kk = clamp((keep - r3) * 5.0, 0.0, 1.0) * step(r3, keep);
  if (flower > -0.5) kk = max(kk, clamp(fd * 3.0, 0.0, 1.0) * step(0.05, allow) * (kind > -0.5 && kind < 0.5 && uPer < 1.5 ? 0.0 : 1.0));
  float yaw = r5 * 6.2832;
  float cy = cos(yaw), sy = sin(yaw);
  float dry = clamp((1.0 - lush) * 0.55 + desert * 0.8 + waste * 0.2, 0.0, 1.0);
  vec3 green = mix(vec3(0.17, 0.30, 0.05), vec3(0.36, 0.33, 0.13), dry);
  float wind = windAt(p);
  // Flower species: size of the head, height of the stem, seen from above or the side.
  bool topView = flower > -0.5 && flower < 3.5;
  float fh = flower < 0.5 ? 0.22 : flower < 1.5 ? 0.38 : flower < 2.5 ? 0.45 : flower < 3.5 ? 0.3 : flower < 4.5 ? 0.85 : flower < 5.5 ? 0.45 : flower < 6.5 ? 0.18 : 0.75;
  float fsz = flower < 0.5 ? 0.07 : flower < 1.5 ? 0.075 : flower < 3.5 ? 0.055 : flower < 4.5 ? 0.4 : flower < 5.5 ? 0.26 : flower < 6.5 ? 0.2 : 0.5;
  fh *= 0.8 + 0.4 * r4;
`;
// Wind on a point `h` metres up a plant.
const BEND_GLSL = /* glsl */ `
  vec3 bend(vec3 q, float t, float h, float amp) { return q + windDir() * amp * wind * t * t * h; }
`;
const NEAR_BODY = /* glsl */ `
  ${COVER_GLSL}
  float part = aPart.x, t = aPart.y;
  vec3 lp = position;
  float H = (0.16 + 0.34 * lush + 0.14 * r4) * (1.0 - 0.5 * desert) * mix(1.0, 0.8, waste) * sqrt(kk);
  float near = 1.0 - smoothstep(4.0, 22.0, dist);
  if (part < 0.5) {
    if (kk < 0.01) { gPos = vec3(p.x, gy - 1.0, p.y); }
    else {
      vec3 q = vec3(lp.x * (0.7 + 0.6 * r4), lp.y * H, lp.z * (0.7 + 0.6 * r4));
      q = vec3(q.x * cy - q.z * sy, q.y, q.x * sy + q.z * cy);
      q = q + windDir() * 0.35 * wind * t * t * H;
      gPos = vec3(p.x, gy - 0.02, p.y) + q;
    }
    gCol = mix(green * 0.45, green * 1.25 + vec3(0.03, 0.04, 0.0), t);
    gUv = atlasCell(15.0, vec2(0.5));
    gNrm = vec3(position.x * 0.0 + normal.x * cy - normal.z * sy, normal.y, normal.x * sy + normal.z * cy);
  } else {
    // Flower: a stem for the flowers seen from above; cards for the head.
    float on = flower > -0.5 ? kk : 0.0;
    float grow = mix(1.0, 2.2, smoothstep(6.0, 22.0, dist));
    float headS = fsz * (topView ? grow : 1.0) * on;
    vec3 top = vec3(0.0, fh * on, 0.0) + windDir() * 0.3 * wind * fh;
    gUv = atlasCell(max(flower, 0.0), uv);
    gCol = vec3(1.0);
    if (part < 1.5) {
      if (!topView) on = 0.0;
      gPos = vec3(p.x, gy, p.y) + vec3(lp.x * on, 0.0, lp.z * on) + top * lp.y * lp.y * on / max(on, 1e-3) * on;
      gCol = vec3(0.2, 0.3, 0.1);
      gUv = atlasCell(15.0, vec2(0.5));
    } else if (part < 2.5) {
      // Upright cards: flowers seen from the side, standing on the ground.
      float s = topView ? 0.0 : headS;
      vec3 q = vec3(lp.x * s, lp.y * fh * on * (topView ? 0.0 : 1.0), lp.z * s);
      q = vec3(q.x * cy - q.z * sy, q.y, q.x * sy + q.z * cy) + windDir() * 0.3 * wind * lp.y * lp.y * fh;
      gPos = vec3(p.x, gy - 0.02, p.y) + q;
      gNrm = vec3(0.0, 1.0, 0.0);
    } else {
      // Flat card: a flower face turned up toward the sky, a little tilted.
      float s = topView ? headS : 0.0;
      vec3 q = vec3(lp.x * s, 0.0, lp.z * s);
      q = vec3(q.x * cy - q.z * sy, q.x * 0.25 * cy, q.x * sy + q.z * cy);
      gPos = vec3(p.x, gy, p.y) + top + q;
      gNrm = vec3(0.0, 1.0, 0.0);
    }
  }
`;
const FAR_BODY = /* glsl */ `
  ${COVER_GLSL}
  float part = aPart.x, t = aPart.y;
  vec3 lp = position;
  float H = (0.16 + 0.34 * lush + 0.12 * r4) * (1.0 - 0.5 * desert) * kk;
  float Wd = (0.55 + 0.35 * r1) * kk;
  vec3 q;
  if (part > 3.5) {
    q = vec3(lp.x * Wd, lp.y * H, lp.z * Wd);
    gUv = atlasCell(waste > 0.6 && r7 < 0.5 ? 14.0 : (dry > 0.55 ? 9.0 : 8.0), uv);
    gCol = mix(vec3(0.42, 0.55, 0.24), vec3(0.72, 0.64, 0.42), dry) * (0.8 + 0.3 * r2);
    if (waste > 0.6 && r7 < 0.5) gCol = vec3(0.85);
  } else {
    float on = flower > -0.5 ? kk : 0.0;
    float grow = mix(1.0, 2.6, smoothstep(20.0, 80.0, dist));
    gUv = atlasCell(max(flower, 0.0), uv);
    gCol = vec3(1.0);
    if (part < 2.5) { float s = topView ? 0.0 : fsz * on * grow; q = vec3(lp.x * s, lp.y * fh * on * (topView ? 0.0 : 1.0) * grow, lp.z * s); }
    else { float s = topView ? fsz * on * grow * 1.3 : 0.0; q = vec3(lp.x * s, fh * on, lp.z * s); }
  }
  q = vec3(q.x * cy - q.z * sy, q.y, q.x * sy + q.z * cy) + windDir() * 0.3 * wind * t * t * H;
  gPos = vec3(p.x, gy - 0.03, p.y) + q;
  gNrm = vec3(0.0, 1.0, 0.0);
`;
// Standing grain in rows; furrows on ploughed land.
const CROP_BODY = /* glsl */ `
  vec2 key; vec2 base = cellPos(key);
  float r1 = rnd(key, 1.0), r2 = rnd(key, 2.0), r3 = rnd(key, 3.0), r4 = rnd(key, 4.0);
  vec2 p = base + (vec2(r1, r2) - 0.5) * lat.x;
  vec4 f0, f1; vec2 fu;
  float kind = uPer > 1.5 ? -1.0 : fieldAt(p, f0, f1, fu);
  float ca = cos(f0.z), sa = sin(f0.z);
  vec2 U = vec2(ca, sa), V = vec2(-sa, ca);
  // Rows run along the field (the way the plough goes).
  float rs = kind < 0.5 ? 0.6 : kind > 4.5 ? 0.7 : 0.26;
  float vv = floor(fu.y / rs + 0.5) * rs;
  p += V * (vv - fu.y);
  fu.y = vv;
  vec2 grad; float gy = hAt(p, grad);
  float dist = distance(vec3(p.x, gy + 0.6, p.y), fCam);
  float fd = 1.0 - smoothstep(fade.z, fade.w, dist);
  float edge = min(f1.x - abs(fu.x), f1.y - abs(fu.y));
  float kk = (kind > -0.5 && kind < 3.0 || kind > 4.5) && edge > 0.0 && allowAt(p) > 0.4 ? fd : 0.0;
  float stub = kind > 0.5 && kind < 1.5 && fu.x < f1.z ? 1.0 : 0.0;
  float Hc = kind < 0.5 ? 0.13 : kind < 1.5 ? (stub > 0.5 ? 0.24 : 0.95) : kind < 2.5 ? 0.82 : 0.38;
  Hc *= (0.85 + 0.25 * r3) * mix(0.5, 1.0, smoothstep(0.0, 1.6, edge));
  float part = aPart.x, t = aPart.y;
  vec3 lp = position;
  float wind = windAt(p) * 1.4;
  if (kind < 0.5) {
    // Ploughed: a soil ridge along the row.
    float on = part > 4.5 ? kk : 0.0;
    vec3 q = vec3(lp.x * lat.x * 1.6 * on, lp.y * Hc * on, lp.z * 0.32 * on);
    q = vec3(q.x * U.x - q.z * U.y, q.y, q.x * U.y + q.z * U.x);
    gPos = vec3(p.x, gy - 0.05, p.y) + q;
    gCol = vec3(0.5, 0.36, 0.25) * (0.8 + 0.3 * r4) * (0.75 + 0.35 * t);
    gUv = atlasCell(15.0, vec2(0.5));
    gNrm = vec3(-sa * normal.z, normal.y, ca * normal.z);
    gLeaf = 0.0;
  } else {
    float on = part < 4.5 ? kk : 0.0;
    float Wd = (kind > 4.5 ? 0.6 : 0.5) * (0.85 + 0.3 * r4) * on;
    float yaw = r4 * 6.2832;
    vec3 q = vec3(lp.x * Wd, lp.y * Hc * on, lp.z * Wd);
    q = vec3(q.x * cos(yaw) - q.z * sin(yaw), q.y, q.x * sin(yaw) + q.z * cos(yaw));
    q += windDir() * 0.22 * wind * t * t * Hc;
    gPos = vec3(p.x, gy - 0.03, p.y) + q;
    gUv = atlasCell(kind < 1.5 ? (stub > 0.5 ? 12.0 : 10.0) : kind < 2.5 ? 11.0 : 13.0, uv);
    gCol = vec3(0.92 + 0.16 * r3);
    gNrm = vec3(0.0, 1.0, 0.0);
  }
`;
// Dry-stone walls: along the edges of fields, and along the contours where
// the terrain shader draws terraces, snapped onto the line.
const WALL_BODY = /* glsl */ `
  vec2 key; vec2 base = cellPos(key);
  float r1 = rnd(key, 1.0), r2 = rnd(key, 2.0), r3 = rnd(key, 3.0), r4 = rnd(key, 4.0);
  vec2 p = base + (vec2(r1, r2) - 0.5) * lat.x * 0.3;
  vec4 f0, f1; vec2 fu;
  float kind = fieldAt(p, f0, f1, fu);
  float on = 0.0, yaw = 0.0, Hw = 0.0;
  float s = lat.x;
  vec2 grad; float gy;
  if (kind > -0.5 && kind < 4.5) {
    float ca = cos(f0.z), sa = sin(f0.z);
    vec2 U = vec2(ca, sa), V = vec2(-sa, ca);
    float ev = f1.y - abs(fu.y), eu = f1.x - abs(fu.x);
    if (ev < s * 0.55 && ev <= eu) {
      float sv = sign(fu.y);
      p = f0.xy + U * fu.x + V * sv * f1.y;
      yaw = f0.z;
      Hw = sv > 0.0 ? 0.95 : 0.55;              // the riser on the downhill side is higher
      on = (sv < 0.0 && abs(fu.x) < 1.6) ? 0.0 : 1.0;   // a gap to walk in by
    } else if (eu < s * 0.55) {
      p = f0.xy + U * sign(fu.x) * f1.x + V * fu.y;
      yaw = f0.z + 1.5708;
      Hw = 0.6;
      on = 1.0;
    }
    gy = hAt(p, grad);
  } else {
    gy = hAt(p, grad);
    float sl = length(grad);
    float farm = texture(mF, (p - mRect.xy) * mRect.zw).r;
    float band = smoothstep(0.05, 0.09, sl) * (1.0 - smoothstep(0.45, 0.6, sl)) * step(0.3, farm);
    float yy = gy + 0.9 * sin(p.x * 0.031 + p.y * 0.012) + 0.7 * sin(p.y * 0.027);
    float f = fract(yy / 1.9) - 0.04;
    if (f > 0.5) f -= 1.0;
    float dh = f * 1.9;
    float dx = dh / max(sl, 0.02);
    if (band > 0.5 && abs(dx) < s * 0.5) {
      vec2 gd = grad / max(sl, 1e-4);
      p -= gd * dx;
      gy = hAt(p, grad);
      yaw = atan(gd.y, gd.x) + 1.5708;
      Hw = 0.9;
      on = 1.0;
    }
  }
  if (allowAt(p) < 0.5) on = 0.0;
  if (uPer > 1.5 && r3 < 0.35) Hw *= 0.4;        // broken down (Prov 24:31)
  float dist = distance(vec3(p.x, gy + 0.5, p.y), fCam);
  float k = on * (1.0 - smoothstep(fade.z, fade.w, dist));
  vec3 q = vec3(position.x * s * 1.2, position.y * Hw * (0.75 + 0.3 * r4), position.z * 0.65) * k;
  float cy = cos(yaw), sy = sin(yaw);
  q = vec3(q.x * cy - q.z * sy, q.y, q.x * sy + q.z * cy);
  gPos = vec3(p.x, gy - 0.12, p.y) + q;
  gNrm = vec3(normal.x * cy - normal.z * sy, normal.y, normal.x * sy + normal.z * cy);
  gCol = vec3(0.5 + 0.16 * r3, 0.47 + 0.15 * r3, 0.42 + 0.12 * r3) * (0.65 + 0.35 * smoothstep(0.0, 0.6, position.y));
  gUv = vec2(position.x + position.z + r1 * 4.0, position.y) * 0.6;
  gLeaf = 0.0;
`;
const PEBBLE_BODY = /* glsl */ `
  vec2 key; vec2 base = cellPos(key);
  float r1 = rnd(key, 1.0), r2 = rnd(key, 2.0), r3 = rnd(key, 3.0), r4 = rnd(key, 4.0);
  vec2 p = base + (vec2(r1, r2) - 0.5) * lat.x;
  vec2 grad; float gy = hAt(p, grad);
  float dist = distance(vec3(p.x, gy + 0.5, p.y), fCam);
  float desert = smoothstep(1000.0, 1500.0, p.x);
  vec4 f0, f1; vec2 fu;
  float kind = fieldAt(p, f0, f1, fu);
  float dens = 0.12 + smoothstep(0.15, 0.5, length(grad)) * 0.6 + desert * 0.4 + 0.3 * vnoise(p * 0.08);
  if (kind > -0.5) dens *= 0.25;                  // fields were cleared of stones (Isa 5:2)
  dens *= step(0.3, allowAt(p) + (uPer > 1.5 ? 0.3 : 0.0));
  float k = step(r3, dens) * (1.0 - smoothstep(fade.z, fade.w, dist));
  float sz = (0.08 + 0.3 * r4 * r4) * k;
  float yaw = r1 * 6.2832, cy = cos(yaw), sy = sin(yaw);
  vec3 q = position * sz;
  q = vec3(q.x * cy - q.z * sy, q.y, q.x * sy + q.z * cy);
  gPos = vec3(p.x, gy - sz * 0.15, p.y) + q;
  gNrm = vec3(normal.x * cy - normal.z * sy, normal.y, normal.x * sy + normal.z * cy);
  gCol = mix(vec3(0.82, 0.8, 0.74), vec3(0.95, 0.88, 0.74), desert) * (0.8 + 0.3 * r2);
  gUv = vec2(position.x + r1, position.z + position.y) * 0.8;
  gLeaf = 0.0;
`;

// --- The toroidal height map round the viewer ---------------------------------------------
function heightMap(N, res) {
  const data = new Float32Array(N * N);
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const col = new Int32Array(N).fill(-1 << 30), row = new Int32Array(N).fill(-1 << 30);
  const want = (c, i) => { const lo = c - N / 2; return lo + ((((i - lo) % N) + N) % N); };
  return {
    tex, info: new THREE.Vector4(res, N, 0, 0),
    // Recompute the columns and rows that have left the window.
    update(x, z) {
      const cx = Math.floor(x / res), cz = Math.floor(z / res);
      let changed = false;
      for (let i = 0; i < N; i++) {
        const I = want(cx, i);
        if (col[i] === I) continue;
        col[i] = I;
        changed = true;
        for (let j = 0; j < N; j++) if (row[j] !== -1 << 30) data[j * N + i] = terrainY(I * res, row[j] * res);
      }
      for (let j = 0; j < N; j++) {
        const J = want(cz, j);
        if (row[j] === J) continue;
        row[j] = J;
        changed = true;
        for (let i = 0; i < N; i++) data[j * N + i] = terrainY(col[i] * res, J * res);
      }
      if (changed) tex.needsUpdate = true;
    },
  };
}

// --- Static works of the farmer ------------------------------------------------------------
function tint(g, c) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// UVs on whichever plane a face mostly lies in, `tile` metres a repeat.
function planarUV(g, tile) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [a, b] = ay > ax && ay > az ? [p.getX(i), p.getZ(i)] : ax > az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = a / tile; uv[i * 2 + 1] = b / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function mergeAll(parts, tile) {
  if (!parts.length) return null;
  return mergeGeometries(parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.computeVertexNormals();
    if (!n.attributes.color) tint(n, [1, 1, 1]);
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(k)) n.deleteAttribute(k);
    return planarUV(n, tile);
  }));
}
// A piece placed at (x, y, z) turned by `rot`.
function put(g, x, y, z, rot = 0) { g.rotateY(rot); g.translate(x, y, z); return g; }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const cyl = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r1, r0, h, n).translate(0, h / 2, 0);
function rock(r, rand, sy = 0.6) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.85 + 0.3 * Math.abs(Math.sin(p.getX(i) * 7.1 + p.getZ(i) * 5.3 + p.getY(i) * 3.7));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * sy, p.getZ(i) * k);
  }
  return g;
}

// Winepress cut in a bedrock outcrop (Isa 5:2): a treading floor draining by
// a channel into a deeper collecting vat.
function winepress(S, x, z, rot, rand) {
  const y = terrainY(x, z);
  const st = [];
  const R = (g, dx, dy, dz) => { const c = Math.cos(rot), s = Math.sin(rot); g.rotateY(rot); g.translate(x + dx * c + dz * s, y + dy, z - dx * s + dz * c); st.push(g); };
  // The outcrop round both basins.
  const out = rock(3.4, rand, 0.32); out.scale(1.25, 1, 0.95); R(out, 0, -0.35, 0);
  const W = 3.2, D = 3.0, top = 0.75, floor = 0.42;
  R(tint(box(W + 0.8, top - floor, 0.4), [0.9, 0.88, 0.82]).translate(0, floor, 0), 0, 0, -D / 2 - 0.2);
  R(tint(box(W + 0.8, top - floor, 0.4), [0.9, 0.88, 0.82]).translate(0, floor, 0), 0, 0, D / 2 + 0.2);
  R(tint(box(0.4, top - floor, D), [0.9, 0.88, 0.82]).translate(0, floor, 0), -W / 2 - 0.2, 0, 0);
  R(tint(box(W + 0.4, floor, D + 0.4), [0.82, 0.8, 0.74]), 0, 0, 0);
  // The vat, below the floor's lip on the downhill side.
  const vx = W / 2 + 1.1;
  R(tint(box(0.3, top, 1.6), [0.9, 0.88, 0.82]), vx + 0.65, 0, 0);
  R(tint(box(1.6, top, 0.3), [0.9, 0.88, 0.82]), vx, 0, -0.95);
  R(tint(box(1.6, top, 0.3), [0.9, 0.88, 0.82]), vx, 0, 0.95);
  R(tint(box(1.3, 0.06, 1.6), [0.36, 0.3, 0.26]), vx, 0.0, 0);
  R(tint(box(0.5, 0.08, 0.25), [0.6, 0.56, 0.5]), W / 2 + 0.25, floor - 0.08, 0);
  S.stone.push(...st);
}

// Olive press with a beam and stone weights (as at Tel Miqne-Ekron, 7th c. BC):
// a crushing basin, a pressing vat under the beam, the beam's end socketed in
// a stone pier, the free end pulled down by perforated stones on ropes.
function olivePress(S, x, z, rot, rand) {
  const y = terrainY(x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (g, dx, dy, dz, list) => { g.rotateY(rot); g.translate(x + dx * c + dz * s, y + dy, z - dx * s + dz * c); list.push(g); };
  const basin = cyl(0.85, 0.75, 0.55, 16);
  P(tint(basin, [0.92, 0.9, 0.84]), -2.4, -0.05, 1.6, S.stone);
  P(tint(cyl(0.3, 0.3, 0.32, 10).rotateZ(Math.PI / 2).translate(0.1, 0.55, 0), [0.8, 0.78, 0.72]), -2.4, 0.2, 1.6, S.stone);   // crushing stone
  P(tint(cyl(0.9, 0.85, 0.5, 18), [0.86, 0.84, 0.78]), 0, -0.05, 0, S.stone);                         // pressing vat with its spout
  P(tint(box(0.9, 0.35, 0.7), [0.9, 0.88, 0.82]), 1.1, -0.05, 0, S.stone);
  P(tint(box(0.7, 0.05, 0.5), [0.2, 0.17, 0.12]), 1.1, 0.3, 0, S.stone);
  for (let i = 0; i < 5; i++) P(tint(cyl(0.48, 0.46, 0.09, 12), [0.7, 0.58, 0.38]), 0, 0.45 + i * 0.1, 0, S.wood);   // stacked frails of crushed olives
  P(tint(box(1.0, 2.2, 1.2), [0.95, 0.93, 0.88]), -2.4, -0.1, -0.2, S.stone);                       // pier
  const beam = new THREE.CylinderGeometry(0.16, 0.2, 5.6, 8).rotateZ(Math.PI / 2 - 0.08);
  P(tint(beam, [1, 1, 1]), 0.4, 1.05, -0.2, S.wood);
  for (let i = 0; i < 3; i++) {
    const wx = 2.4 + i * 0.12, wz = -0.2 + (i - 1) * 0.42;
    P(tint(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 4).translate(0, 0.6, 0), [0.75, 0.66, 0.5]), wx, 0.15, wz, S.wood);
    const wgt = new THREE.CylinderGeometry(0.24, 0.27, 0.32, 10);
    P(tint(wgt.translate(0, 0.16, 0), [0.88, 0.86, 0.8]), wx, -0.05, wz, S.stone);
  }
}

// Well with a great stone over its mouth and a stone trough (Gen 29:2-3);
// a cistern has only the capstone.
function well(S, x, z, rot, rand, trough) {
  const y = terrainY(x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (g, dx, dy, dz) => { g.rotateY(rot); g.translate(x + dx * c + dz * s, y + dy, z - dx * s + dz * c); S.stone.push(g); };
  if (trough) {
    P(tint(new THREE.CylinderGeometry(0.8, 0.9, 0.7, 14, 1, true).translate(0, 0.25, 0), [0.88, 0.86, 0.8]), 0, 0, 0);
    P(tint(new THREE.CircleGeometry(0.8, 14).rotateX(-Math.PI / 2).translate(0, 0.25, 0), [0.1, 0.09, 0.08]), 0, 0, 0);
    P(tint(cyl(0.72, 0.68, 0.28, 12), [0.94, 0.92, 0.86]), 0.55, 0.58, 0.35);
    P(tint(box(2.2, 0.12, 0.7), [0.8, 0.78, 0.72]), 0, -0.05, 1.8);
    P(tint(box(2.2, 0.5, 0.12), [0.9, 0.88, 0.82]), 0, 0, 1.5);
    P(tint(box(2.2, 0.5, 0.12), [0.9, 0.88, 0.82]), 0, 0, 2.1);
    P(tint(box(0.12, 0.5, 0.6), [0.9, 0.88, 0.82]), -1.04, 0, 1.8);
    P(tint(box(0.12, 0.5, 0.6), [0.9, 0.88, 0.82]), 1.04, 0, 1.8);
  } else {
    P(tint(cyl(1.0, 1.05, 0.25, 12), [0.9, 0.88, 0.82]), 0, -0.1, 0);
    P(tint(cyl(0.6, 0.55, 0.28, 12), [0.94, 0.92, 0.86]), 0.1, 0.12, 0.05);
  }
}

// Apiary of horizontal clay hives in stacked rows (Tel Rehov, 10th–9th c. BC).
function apiary(S, x, z, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) {
    const dx = (i - 4) * 0.46, dz = row * 1.6;
    const px = x + dx * c + dz * s, pz = z - dx * s + dz * c;
    const y = terrainY(x, z) + 0.22 + k * 0.4;
    const h = new THREE.CylinderGeometry(0.2, 0.2, 0.8, 10).rotateX(Math.PI / 2);
    S.clay.push(tint(put(h, px, y, pz, rot), [0.95, 0.85, 0.72]));
    const hole = new THREE.CircleGeometry(0.035, 6).translate(0, 0, 0.402);
    S.clay.push(tint(put(hole, px, y, pz, rot), [0.08, 0.06, 0.05]));
  }
}
// Booth of poles and branches (Isa 1:8).
function booth(S, x, z, rot) {
  const y = terrainY(x, z);
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (g, dx, dy, dz) => { g.rotateY(rot); g.translate(x + dx * c + dz * s, y + dy, z - dx * s + dz * c); S.wood.push(g); };
  for (const [dx, dz] of [[-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8]]) P(tint(cyl(0.05, 0.04, 2.1, 5), [0.9, 0.84, 0.76]), dx, -0.1, dz);
  const roof = new THREE.BoxGeometry(2.5, 0.25, 2.1, 6, 1, 5);
  const p = roof.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.08 * Math.sin(p.getX(i) * 8 + p.getZ(i) * 5));
  P(tint(roof, [0.95, 0.9, 0.62]), 0, 2.05, 0);
  P(tint(new THREE.BoxGeometry(2.2, 1.3, 0.12, 6, 3, 1).translate(0, 0.65, 0), [0.9, 0.86, 0.6]), 0, 0, -0.85);
}
// A cairn marking a boundary (Deut 19:14).
function cairn(S, x, z, rand) {
  const y = terrainY(x, z);
  for (let i = 0; i < 9; i++) {
    const r = 0.18 + rand() * 0.16;
    const g = rock(r, rand, 0.7);
    const lay = i < 5 ? 0 : i < 8 ? 1 : 2;
    const a = rand() * 6.28, d = lay === 0 ? 0.35 : lay === 1 ? 0.18 : 0;
    g.translate(x + Math.cos(a) * d, y + 0.08 + lay * 0.22, z + Math.sin(a) * d);
    const k = 0.85 + rand() * 0.2;
    S.stone.push(tint(g, [k, k * 0.98, k * 0.93]));
  }
}
// Sheaves on the reaped strip of a barley field (Ruth 2:15).
function sheaf(S, x, z, rand) {
  const y = terrainY(x, z);
  const g = new THREE.CylinderGeometry(0.2, 0.14, 0.75, 8).translate(0, 0.38, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const yy = p.getY(i); const w = yy > 0.6 ? 1.5 : yy < 0.4 && yy > 0.2 ? 0.75 : 1; p.setX(i, p.getX(i) * w); p.setZ(i, p.getZ(i) * w); }
  g.rotateZ((rand() - 0.5) * 0.2);
  S.straw.push(tint(put(g, x, y - 0.02, z, rand() * 6.28), [0.95 + rand() * 0.1, 0.85, 0.6]));
}

// Reeds and rushes at the water's edge: a clump of tall tapering stems,
// last year's pale with plumes, this year's green.
function reedGeo() {
  const o = { pos: [], uv: [], part: [], nrm: [] };
  const rand = rng(9);
  for (let i = 0; i < 9; i++) {
    const a = rand() * 6.28, r = rand() * 0.35, h = 1.6 + rand() * 1.4, w = 0.02;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, lean = (rand() - 0.5) * 0.4;
    const old = i % 3 === 0;
    const col = old ? 0.85 : 0.0;
    for (let k = 0; k < 3; k++) {
      const t0 = k / 3, t1 = (k + 1) / 3;
      const p0 = [x + lean * t0 * t0, t0 * h, z], p1 = [x + lean * t1 * t1, t1 * h, z];
      const w0 = w * (1 - t0 * 0.7), w1 = w * (1 - t1 * 0.7);
      quad(o, [[p0[0] - w0, p0[1], p0[2], col, 0, t0], [p0[0] + w0, p0[1], p0[2], col, 0, t0], [p1[0] + w1, p1[1], p1[2], col, 0, t1], [p1[0] - w1, p1[1], p1[2], col, 0, t1]], 0, [0, 0.5, 0.85]);
      quad(o, [[p0[0], p0[1], p0[2] - w0, col, 0, t0], [p0[0], p0[1], p0[2] + w0, col, 0, t0], [p1[0], p1[1], p1[2] + w1, col, 0, t1], [p1[0], p1[1], p1[2] - w1, col, 0, t1]], 0, [0.85, 0.5, 0]);
    }
    // Leaves: long ribbons arching out.
    for (let l = 0; l < 2; l++) {
      const la = rand() * 6.28, ly = (0.2 + rand() * 0.4) * h, L = 0.6 + rand() * 0.4;
      const dx = Math.cos(la), dz = Math.sin(la);
      const b = [x, ly, z], tip = [x + dx * L, ly + L * 0.25, z + dz * L], m = [x + dx * L * 0.5, ly + L * 0.4, z + dz * L * 0.5];
      const ww = 0.025;
      quad(o, [[b[0] - dz * ww, b[1], b[2] + dx * ww, col, 0, ly / h], [b[0] + dz * ww, b[1], b[2] - dx * ww, col, 0, ly / h], [m[0] + dz * ww, m[1], m[2] - dx * ww, col, 0, ly / h + 0.1], [m[0] - dz * ww, m[1], m[2] + dx * ww, col, 0, ly / h + 0.1]], 0, [0, 1, 0]);
      for (const c of [[m[0] - dz * ww, m[1], m[2] + dx * ww], [m[0] + dz * ww, m[1], m[2] - dx * ww], tip]) { o.pos.push(...c); o.uv.push(col, 0); o.part.push(0, ly / h + 0.2, 0, 0); o.nrm.push(0, 1, 0); }
    }
    if (old) {   // plume
      const tp = [x + lean, h, z];
      quad(o, [[tp[0] - 0.08, tp[1] - 0.05, tp[2], 2, 0, 1], [tp[0] + 0.08, tp[1] - 0.05, tp[2], 2, 0, 1], [tp[0] + 0.1, tp[1] + 0.35, tp[2], 2, 0, 1], [tp[0] - 0.06, tp[1] + 0.35, tp[2], 2, 0, 1]], 0, [0, 0.6, 0.8]);
    }
  }
  return geom(o.pos, o.part, o.uv, o.nrm);
}

// --- Info cards -------------------------------------------------------------------------------
const INFO = {
  'flora-spring': {
    mode: 'both', title: 'Flowers of spring', he: 'הַנִּצָּנִים נִרְאוּ בָאָרֶץ',
    dims: ['Red anemones and poppies, yellow crown daisies and wild mustard, white chamomile', 'Cyclamen among the rocks, blue lupins on the slopes, Syrian thistles on waste ground', 'In Nisan the hills are green; by early summer the grass has dried'],
    refs: 'Song 2:11–13; Isa 40:6–8; Isa 35:1–2; Ps 103:15–16',
    note: 'The Bible does not name these flowers; the species are those that bloom in the hills round Jerusalem in March and April today (M. Zohary, Plants of the Bible, 1982). "The grass withers, the flower fades" (Isa 40:8) describes what the first hot east wind does to them.'
  },
  'flora-crops': {
    mode: 'both', title: 'Barley ripe, wheat still green', he: 'שְׂעֹרִים · חִטִּים',
    dims: ['Barley is reaped first, from about Passover (the tenth of Nisan is the eve of it)', 'Wheat is reaped some seven weeks later', 'Some fields are being ploughed for summer crops; some lie fallow'],
    refs: 'Exod 9:31–32; Ruth 1:22; 2:23; Lev 23:10–17; Deut 16:9',
    note: '"The barley was in the ear … but the wheat and the emmer were not struck down, for they are late" (Exod 9:31–32). The Gezer calendar (10th century BC) lists a month of barley harvest followed by a month of harvest and measuring.'
  },
  'flora-winepress': {
    mode: 'both', title: 'Winepress cut in the rock', he: 'יֶקֶב · גַּת',
    dims: ['A treading floor cut into a bedrock outcrop, draining by a channel into a deeper vat', 'Grapes were trodden underfoot at the vintage (late summer); in spring the press stands empty'],
    refs: 'Isa 5:2; 16:10; 63:2–3; Judg 6:11; Neh 13:15',
    note: '"He built a watchtower in the midst of it and also hewed out a wine vat in it" (Isa 5:2). Hundreds of rock-cut presses survive in the hills; Iron Age II wine installations were excavated at Gibeon (Pritchard, 1964). The layout here is a common type; this one is not a copy of a particular press.'
  },
  'flora-olivepress': {
    mode: 'both', title: 'Olive press with beam and weights', he: 'בֵּית הַבַּד',
    dims: ['Olives crushed in a stone basin, the pulp piled in flat baskets on the pressing stone', 'A wooden beam, socketed in a pier, pressed down by perforated stone weights hung on its end', 'Not in use in Nisan: the olive harvest is in autumn'],
    refs: 'Mic 6:15; Deut 24:20; Exod 27:20',
    note: 'Beam presses with stone weights are known from many Iron Age II sites; more than a hundred were found at Tel Miqne-Ekron (7th century BC). Rotary crushing mills and screw presses came centuries later and are not shown.'
  },
  'flora-well': {
    mode: 'both', title: 'Well, cistern and trough', he: 'בְּאֵר · בּוֹר',
    dims: ['A great stone over the mouth, rolled away to water the flocks', 'Plastered cisterns cut in the rock caught the winter rain'],
    refs: 'Gen 29:2–3, 8–10; Deut 6:11; 2 Kgs 18:31; Jer 2:13',
    note: '"The stone on the well\'s mouth was large" (Gen 29:2). The wellheads and troughs here are generic; their exact forms are conjecture.'
  },
  'flora-hives': {
    mode: 'both', title: 'Beehives', he: 'דְּבוֹרִים',
    dims: ['Cylinders of unfired clay about 80 cm long, laid in rows three high', 'Bees kept for honey and wax'],
    refs: 'Deut 8:8; Judg 14:8; 1 Sam 14:25–27',
    note: 'An apiary of about a hundred such hives was excavated at Tel Rehov in the Jordan valley (10th–9th century BC), the oldest found in the region. That beekeeping was practised in Judah as well is likely but not shown by finds; the "honey" of Deut 8:8 may be date syrup.'
  },
  'flora-booth': {
    mode: 'both', title: 'Watchman\'s booth', he: 'סֻכָּה',
    dims: ['Four poles and a roof of branches, in a vineyard or a field of cucumbers'],
    refs: 'Isa 1:8; 24:20; Job 27:18',
    note: '"The daughter of Zion is left like a booth in a vineyard, like a lodge in a cucumber field" (Isa 1:8): a shelter put up for the season and left to fall.'
  },
  'flora-cairn': {
    mode: 'both', title: 'Boundary cairn', he: 'גְּבוּל',
    dims: ['A heap of field stones at the corner of a holding'],
    refs: 'Deut 19:14; 27:17; Prov 22:28; Hos 5:10',
    note: '"You shall not move your neighbour\'s landmark, which the men of old have set" (Deut 19:14). How boundaries were marked on the ground is not described; a cairn is one plausible form.'
  },
  'flora-walls': {
    mode: 'both', title: 'Field and terrace walls', he: 'גָּדֵר',
    dims: ['Dry-stone walls of the stones cleared from the fields', 'Terrace risers hold the soil on the slopes'],
    refs: 'Isa 5:2, 5; Prov 24:30–31; Num 22:24; Ps 80:12',
    note: '"I passed by the field of a sluggard … its stone wall was broken down" (Prov 24:30–31). Terraced hillsides of the Iron Age have been surveyed round Jerusalem, though most terraces are hard to date.'
  },
  'flora-reeds': {
    mode: 'both', title: 'Reeds by the water', he: 'קָנֶה · אַגְמוֹן',
    dims: ['Common reed and rushes at the pools, the Siloam channel and the Kidron bed', 'Last year\'s stems pale with plumes, this year\'s green'],
    refs: 'Job 8:11; Isa 35:7; 42:3; 1 Kgs 14:15',
    note: '"Can the reed flourish where there is no water?" (Job 8:11). Their extent here is the model\'s choice.'
  },
  'flora-thorns': {
    mode: 'both', title: 'Fields gone to thorns', he: 'שָׁמִיר וָשָׁיִת',
    dims: ['Fields unsown for years, overrun by thistles, thorny burnet and brier', 'Terrace walls fallen in'],
    refs: 'Isa 7:23–25; 32:13; 5:6; Prov 24:30–31; 2 Kgs 25:12',
    note: '"Every place where there used to be a thousand vines … will become briers and thorns" (Isa 7:23). Some of "the poorest of the land" were left as vinedressers and ploughmen (2 Kgs 25:12), so a few fields may still have been worked.'
  },
  'flora-stumps': {
    mode: 'both', title: 'Stumps of felled trees', he: 'מַצֶּבֶת',
    dims: ['Trees near the walls cut for siege works, 588–586 BC'],
    refs: 'Jer 6:6; Deut 20:19–20; Isa 6:13',
    note: '"Cut down her trees and cast up a siege mound against Jerusalem" (Jer 6:6). "As a terebinth or an oak whose stump remains when it is felled" (Isa 6:13). Olives grow again from the stump; some here have put out shoots.'
  },
  'flora-beds': {
    mode: 'both', title: 'Vegetable and herb beds', he: 'גַּן יָרָק',
    dims: ['Beds of greens, leeks and onions, watered by channels'],
    refs: '1 Kgs 21:2; Deut 11:10; Num 11:5; Prov 15:17',
    note: 'Ahab wanted Naboth\'s vineyard "for a vegetable garden" (1 Kgs 21:2). Which plants grew in the King\'s Garden is not recorded.'
  },
};

// --- Build -----------------------------------------------------------------------------------
export function build(mats, ctx) {
  const { quality, plan, free } = ctx;
  const low = quality === 'low';
  const rand = rng(2468);
  const recs = plantRecords();

  // Sites of the works, chosen once: winepresses and booths in the vineyards,
  // olive presses near the groves, wells by the folds, an apiary by the garden.
  const sites = [];
  const near = (x, z, d) => sites.some((s) => Math.hypot(s.x - x, s.z - z) < d);
  const clear = (x, z, m = 8) => free(x, z, m) && !insidePolygon(x, z, LATE_POLY) && !insidePolygon(x, z, EARLY_POLY)
    && !ROADS.some((r) => distToLine(x, z, r.pts) < 8) && !plan.floors.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 6);
  for (const zn of VINE_ZONES) {
    const vs = recs.vine.filter((v) => v.x > zn.x0 && v.x < zn.x1 && v.z > zn.z0 && v.z < zn.z1);
    let placed = 0;
    for (let i = 0; i < 60 && placed < 2 && vs.length; i++) {
      const v = vs[Math.floor(rand() * vs.length)];
      const x = v.x + 3, z = v.z + 2;
      if (!clear(x, z) || near(x, z, 60)) continue;
      sites.push({ kind: placed ? 'booth' : 'winepress', x, z, r: placed ? 2.5 : 4.5, rot: rand() * 6.28 });
      placed++;
    }
  }
  for (const [tx, tz] of [[600, 140], [430, -60], [720, 420]]) {
    let best = null, bd = Infinity;
    for (const t of recs.olive) { const d = Math.hypot(t.x - tx, t.z - tz); if (d < bd && clear(t.x + 6, t.z)) { bd = d; best = t; } }
    if (best && !near(best.x + 6, best.z, 40)) sites.push({ kind: 'olivepress', x: best.x + 6, z: best.z, r: 4.5, rot: rand() * 6.28 });
  }
  for (const f of plan.folds) {
    const x = f.x + f.r + 5, z = f.z + 3;
    if (clear(x, z, 4)) sites.push({ kind: 'well', x, z, r: 3, rot: rand() * 6.28 });
  }
  sites.push({ kind: 'well', x: -36, z: 1318, r: 3, rot: 0.4 });                       // En-rogel (1 Kgs 1:9)
  plan.towers.forEach((t, i) => { if (i % 2 === 0) { const x = t.x + 6, z = t.z - 4; if (clear(x, z, 3)) sites.push({ kind: 'cistern', x, z, r: 1.6, rot: rand() * 6.28 }); } });
  for (const [x, z] of [[-150, 1170], [95, 1100]]) if (clear(x, z, 4)) { sites.push({ kind: 'apiary', x, z, r: 5, rot: 0.3 }); break; }

  // Fields: the plan's (kinds 0–3), and beds in the King's Garden (kind 5).
  const fields = plan.fields.map((f, i) => {
    const barley = f.kind === 1;
    const reaping = barley && hash(f.x, f.z, 13) < 0.4;
    return { ...f, crop: f.kind, reapU: reaping ? -f.w / 2 + f.w * (0.12 + hash(f.x, f.z, 14) * 0.25) : -1e5, earlyOnly: insidePolygon(f.x, f.z, LATE_POLY) };
  });
  const gardenTrees = [...recs.small, ...recs.olive, ...recs.palm, ...recs.broad, ...recs.cypress].filter((t) => t.set === 'garden');
  for (let i = 0, n = 0; i < 200 && n < 14; i++) {
    const a = rand() * 6.28, r = Math.sqrt(rand()) * 0.85;
    const x = KINGS_GARDEN.x + Math.cos(a) * r * KINGS_GARDEN.rx, z = KINGS_GARDEN.z + Math.sin(a) * r * KINGS_GARDEN.rz;
    const w = 8 + rand() * 7, d = 5 + rand() * 4;
    if (gardenTrees.some((t) => Math.hypot(t.x - x, t.z - z) < Math.max(w, d) / 2 + 2) || fields.some((f) => f.crop === 5 && Math.hypot(f.x - x, f.z - z) < 14)) continue;
    if (!clear(x, z, 3) && !free(x, z, 3)) continue;
    fields.push({ x, z, w, d, ang: 0.2 + (rand() - 0.5) * 0.3, crop: 5, reapU: -1e5, earlyOnly: false });
    n++;
  }

  // Footpaths from towers, folds and floors to the nearest road.
  const paths = [];
  const toRoad = (x, z, periods) => {
    let best = null, bd = 220;
    for (const r of ROADS) for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = [px, pz]; }
    }
    if (!best) return;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, wob = Math.sin(t * Math.PI) * (hash(x, z, 21) - 0.5) * bd * 0.25;
      const nx = -(best[1] - z) / bd, nz = (best[0] - x) / bd;
      pts.push([x + (best[0] - x) * t + nx * wob, z + (best[1] - z) * t + nz * wob]);
    }
    paths.push({ pts, periods });
  };
  for (const t of plan.towers) toRoad(t.x, t.z);
  for (const f of plan.folds) toRoad(f.x, f.z);
  for (const f of plan.floors) toRoad(f.x, f.z, insidePolygon(f.x, f.z, LATE_POLY) ? ['early'] : null);

  // The Siloam channel's course (as city.js lays it).
  const channel = [];
  for (let z = 512; z <= 1000; z += 8) {
    const target = 641 - (z - 512) * (19 / 488);
    const xb = valleyX('kidron', z);
    let lo = Math.min(25, xb - 10), hi = xb - 4;
    for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (naturalElevation(mid, z) > target) lo = mid; else hi = mid; }
    channel.push([(lo + hi) / 2, z]);
  }
  channel.push([-20, 1012], [LOWER_POOL.x + LOWER_POOL.w / 2 - 2, LOWER_POOL.z]);

  // --- Textures and uniforms
  const atlas = HAS_DOM ? groundAtlas(low ? 128 : 256) : null;
  const mE = HAS_DOM ? coverMasks(plan, low ? 1024 : 2048, { paths, channel, sites }) : new THREE.DataTexture(new Uint8Array(2), 1, 1, THREE.RGFormat);
  const mF = farmMask(256);
  const FT = fieldTextures(fields, low ? 768 : 1024);
  const HM = heightMap(low ? 160 : 256, 1);
  const U = {
    fTime: FLORA_U.fTime, fCam: FLORA_U.fCam, fSunDir: FLORA_U.fSunDir, fSunCol: FLORA_U.fSunCol, fDay: FLORA_U.fDay,
    uPer: { value: 1 }, uC: { value: new THREE.Vector2() },
    hMap: { value: HM.tex }, hInfo: { value: HM.info },
    mE: { value: mE }, mF: { value: mF }, fIdx: { value: FT.idx }, fTab: { value: FT.tab }, fIdxN: { value: FT.size },
    mRect: { value: new THREE.Vector4(X0, Z0, 1 / DETAIL.size, 1 / DETAIL.size) },
  };
  const ring = (name, geo, body, s, n, f, opts) => {
    const mat = landMaterial(name, { ...U, ...latU(s, n, f) }, body, opts);
    return latticeMesh(geo, mat, n);
  };
  const lat = (W, s) => [s, Math.round(W / s)];
  const [sN, nN] = low ? lat(30, 0.62) : lat(44, 0.42);
  const [sF, nF] = low ? lat(150, 2.8) : lat(240, 1.8);
  const [sC, nC] = low ? lat(36, 0.45) : lat(64, 0.3);
  const [sW, nW] = low ? lat(70, 1.3) : lat(110, 1.05);
  const [sP, nP] = low ? lat(36, 1.0) : lat(56, 0.7);
  const nearR = low ? 13 : 20;
  const grassNear = ring('grass-near', tuftGeo(low ? 4 : 6), NEAR_BODY, sN, nN, [-1, 0, nearR - 4, nearR], { map: atlas });
  const grassFar = ring('grass-far', cardTuftGeo(), FAR_BODY, sF, nF, [nearR - 5, nearR, low ? 60 : 95, low ? 72 : 120], { map: atlas });
  const crops = ring('crops', cropGeo(), CROP_BODY, sC, nC, [0, 0, low ? 14 : 24, low ? 18 : 31], { map: atlas });
  const rockMap = mats.rock?.map || null;
  const walls = ring('walls', wallGeo(), WALL_BODY, sW, nW, [0, 0, low ? 30 : 46, low ? 36 : 55], { map: rockMap, tex: false, rough: 0.95 });
  const pebbles = ring('pebbles', pebbleGeo(), PEBBLE_BODY, sP, nP, [0, 0, low ? 15 : 24, low ? 18 : 28], { map: rockMap, tex: false, rough: 0.95 });
  if (mats.rock?.bumpMap) for (const m of [walls.material, pebbles.material]) { m.bumpMap = mats.rock.bumpMap; m.bumpScale = 2; }
  walls.castShadow = true;
  walls.customDepthMaterial = (() => {
    const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    d.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, latU(sW, nW, [0, 0, low ? 30 : 46, low ? 36 : 55]));
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${LAND_GLSL}\nattribute vec4 aPart;`)
        .replace('#include <begin_vertex>', `vec3 gPos = vec3(0.0), gNrm = vec3(0.0, 1.0, 0.0), gCol = vec3(1.0); vec2 gUv = vec2(0.0); float gLeaf = 0.0;\n{ ${WALL_BODY} }\nvec3 transformed = gPos;`);
    };
    d.customProgramCacheKey = () => 'flora-walls-depth-v1';
    return d;
  })();
  const lattices = [grassNear, grassFar, crops, walls, pebbles];

  // --- Crops seen from afar: a raised mat of grain over each field, faded
  // out near the viewer where the clumps take over, with waves of wind.
  const slabParts = { common: [], early: [] };
  for (const f of fields) {
    if (!(f.crop === 1 || f.crop === 2 || f.crop === 5)) continue;
    const H = f.crop === 1 ? 0.92 : f.crop === 2 ? 0.8 : 0.35;
    const col = f.crop === 1 ? [0.42, 0.33, 0.13] : f.crop === 2 ? [0.13, 0.22, 0.05] : [0.1, 0.2, 0.05];
    const c = Math.cos(f.ang), s = Math.sin(f.ang);
    const nu = Math.max(2, Math.ceil(f.w / 4)), nv = Math.max(2, Math.ceil(f.d / 4));
    const pos = [], cl = [], tops = [];
    const at = (u, v, top) => {
      const x = f.x + u * c - v * s, z = f.z + u * s + v * c;
      const edge = Math.min(f.w / 2 - Math.abs(u), f.d / 2 - Math.abs(v));
      const reaped = u < f.reapU;
      const h = top ? (reaped ? 0.22 : H * (0.5 + 0.5 * smooth(0, 1.6, edge)) * (0.92 + 0.16 * hash(x, z, 3))) : -0.25;
      const k = top ? 1 : 0.55;
      const cc = reaped ? [0.46, 0.39, 0.23] : col;
      return [x, terrainY(x, z) + h, z, cc[0] * k, cc[1] * k, cc[2] * k, top ? 1 : 0];
    };
    const push = (...vs) => { for (const v of vs) { pos.push(v[0], v[1], v[2]); cl.push(v[3], v[4], v[5]); tops.push(v[6]); } };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const u0 = -f.w / 2 + (f.w * i) / nu, u1 = -f.w / 2 + (f.w * (i + 1)) / nu, v0 = -f.d / 2 + (f.d * j) / nv, v1 = -f.d / 2 + (f.d * (j + 1)) / nv;
      const a = at(u0, v0, 1), b = at(u1, v0, 1), cc = at(u1, v1, 1), d = at(u0, v1, 1);
      push(a, d, cc, a, cc, b);
    }
    // Skirts down to the ground on all four sides.
    const edgeRun = (pts) => { for (let i = 0; i < pts.length - 1; i++) { const [u0, v0] = pts[i], [u1, v1] = pts[i + 1]; const a = at(u0, v0, 1), b = at(u1, v1, 1), a2 = at(u0, v0, 0), b2 = at(u1, v1, 0); push(a, a2, b2, a, b2, b); } };
    const side = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
    edgeRun(side(nu, (t) => [-f.w / 2 + f.w * t, -f.d / 2]));
    edgeRun(side(nv, (t) => [f.w / 2, -f.d / 2 + f.d * t]));
    edgeRun(side(nu, (t) => [f.w / 2 - f.w * t, f.d / 2]));
    edgeRun(side(nv, (t) => [-f.w / 2, f.d / 2 - f.d * t]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    g.setAttribute('aTop', new THREE.Float32BufferAttribute(tops, 1));
    g.computeVertexNormals();
    (f.earlyOnly ? slabParts.early : slabParts.common).push(g);
  }
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true, side: THREE.DoubleSide });
  slabMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { sFade: { value: new THREE.Vector2(low ? 14 : 24, low ? 18 : 31) } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float fTime;\nuniform vec3 fCam;\nuniform vec2 sFade;\nattribute float aTop;\nvarying vec3 vSW;\nvarying float vSF;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float wv = sin(transformed.x * 0.16 - fTime * 1.1 + sin(transformed.z * 0.05) * 2.0);
        transformed += vec3(0.12, -0.05, 0.02) * aTop * (0.5 + 0.5 * wv);
        vSW = transformed;
        vSF = smoothstep(sFade.x, sFade.y, distance(transformed, fCam));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float fTime;\nvarying vec3 vSW;\nvarying float vSF;
        float sgrain(vec2 p) { uvec2 q = uvec2(ivec2(floor(p)) + 100000); uint n = q.x * 1597334673u ^ q.y * 3812015801u; n = (n ^ (n >> 15)) * 2246822519u; return float(n >> 8) / 16777216.0; }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { float dth = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (dth < 1.0 - vSF) discard; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float fw = length(fwidth(vSW.xz));
          float g = sgrain(vSW.xz * 9.0) * (1.0 - smoothstep(0.05, 0.3, fw)) + 0.5 * smoothstep(0.05, 0.3, fw);
          float wave = sin(vSW.x * 0.16 - fTime * 1.1 + sin(vSW.z * 0.05) * 2.0);
          float mid = sgrain(vSW.xz * 1.3 + 50.0);
          diffuseColor.rgb *= (0.8 + 0.3 * g + 0.12 * wave) * (0.85 + 0.25 * mid);
        }`);
  };
  slabMat.customProgramCacheKey = () => 'flora-slab-v1';
  const slabMesh = (parts) => {
    if (!parts.length) return null;
    const m = new THREE.Mesh(mergeGeometries(parts), slabMat);
    m.receiveShadow = true;
    m.userData.infoId = 'flora-crops';
    return m;
  };

  // --- Static works
  const S = { stone: [], wood: [], clay: [], straw: [] };
  const zones = [];
  const zone = (id, x, z, r, h, periods) => {
    const y = terrainY(x, z);
    zones.push({ id, box: new THREE.Box3(new THREE.Vector3(x - r, y - 1, z - r), new THREE.Vector3(x + r, y + h, z + r)), periods });
  };
  for (const s of sites) {
    if (s.kind === 'winepress') { winepress(S, s.x, s.z, s.rot, rand); zone('flora-winepress', s.x, s.z, 4.5, 2); }
    else if (s.kind === 'booth') { booth(S, s.x, s.z, s.rot); zone('flora-booth', s.x, s.z, 2, 3); }
    else if (s.kind === 'olivepress') { olivePress(S, s.x, s.z, s.rot, rand); zone('flora-olivepress', s.x, s.z, 4, 3); }
    else if (s.kind === 'well') { well(S, s.x, s.z, s.rot, rand, true); zone('flora-well', s.x, s.z, 2.6, 2); }
    else if (s.kind === 'cistern') { well(S, s.x, s.z, s.rot, rand, false); zone('flora-well', s.x, s.z, 1.4, 1); }
    else if (s.kind === 'apiary') { apiary(S, s.x, s.z, s.rot); zone('flora-hives', s.x + 1, s.z + 1, 4, 2); }
  }
  // Booths in the cucumber beds of the garden, cairns at field corners, sheaves on reaped strips.
  const cairns = [];
  fields.forEach((f, i) => {
    if (f.crop === 5) { if (i % 4 === 0) { const x = f.x + Math.cos(f.ang) * (f.w / 2 + 2), z = f.z + Math.sin(f.ang) * (f.w / 2 + 2); booth(S, x, z, f.ang); zone('flora-booth', x, z, 2, 3); } return; }
    if (hash(f.x, f.z, 17) < 0.35 && !f.earlyOnly) {
      const c = Math.cos(f.ang), s = Math.sin(f.ang), u = f.w / 2 + 1, v = -f.d / 2 - 1;
      const x = f.x + u * c - v * s, z = f.z + u * s + v * c;
      if (free(x, z, 4) && !ROADS.some((r) => distToLine(x, z, r.pts) < 6)) { cairn(S, x, z, rand); cairns.push([x, z]); zone('flora-cairn', x, z, 1, 1.2); }
    }
  });
  const sheafParts = { common: [], early: [] };
  for (const f of fields) {
    if (f.reapU < -1e4) continue;
    const c = Math.cos(f.ang), s = Math.sin(f.ang);
    const S2 = { straw: [] };
    for (let u = -f.w / 2 + 2; u < f.reapU - 1; u += 3.5) for (let v = -f.d / 2 + 2; v < f.d / 2 - 2; v += 4) {
      if (hash(u + f.x, v + f.z, 5) < 0.35) continue;
      sheaf(S2, f.x + u * c - v * s + (rand() - 0.5), f.z + u * s + v * c + (rand() - 0.5), rand);
    }
    (f.earlyOnly ? sheafParts.early : sheafParts.common).push(...S2.straw);
  }
  const wood = woodTex();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true, map: mats.rock?.map || null, bumpMap: mats.rock?.bumpMap || null, bumpScale: 2 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true, map: wood?.map || null, normalMap: wood?.normalMap || null });
  const clayMat = new THREE.MeshStandardMaterial({ color: 0xc9a27c, roughness: 0.95, vertexColors: true, map: mats.earth?.map || null, bumpMap: mats.earth?.bumpMap || null, bumpScale: 1 });
  const strawMat = new THREE.MeshStandardMaterial({ color: 0xd8bb72, roughness: 1, vertexColors: true, map: wood?.map || null });
  const staticMesh = (parts, mat, tile, infoId, solid) => {
    const g = mergeAll(parts, tile);
    if (!g) return null;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = m.receiveShadow = true;
    m.userData.infoId = infoId;
    if (solid) m.userData.solid = true;
    return m;
  };
  const common = new THREE.Group();
  for (const m of [
    staticMesh(S.stone, stoneMat, 1.5, 'flora-winepress', true), staticMesh(S.wood, woodMat, 0.6, 'flora-booth', false),
    staticMesh(S.clay, clayMat, 1, 'flora-hives', true),
  ]) if (m) common.add(m);

  // Reeds round the pools, along the channel and down the Kidron bed.
  const reedRecs = { common: [], later: [] };
  const addReed = (x, z, list) => { if (free(x, z, 2)) list.push({ x, z, s: 0.7 + rand() * 0.6, r: rand() * 6.28 }); };
  const poolRing = (pl, list, n) => {
    for (let i = 0; i < n; i++) {
      const t = rand() * 4, side = Math.floor(t), f = t - side;
      const hw = pl.w / 2 + 2 + rand() * 2.5, hd = pl.d / 2 + 2 + rand() * 2.5;
      const [x, z] = side === 0 ? [-hw + 2 * hw * f, -hd] : side === 1 ? [hw, -hd + 2 * hd * f] : side === 2 ? [hw - 2 * hw * f, hd] : [-hw, hd - 2 * hd * f];
      if (side === 0 && Math.abs(x) < 5) continue;   // keep the steps clear
      addReed(pl.x + x, pl.z + z, list);
    }
  };
  poolRing(LOWER_POOL, reedRecs.common, low ? 60 : 140);
  poolRing(SILOAM_POOL, reedRecs.later, low ? 40 : 100);
  for (let i = 0; i < channel.length - 1; i++) {
    for (let k = 0; k < (low ? 1 : 2); k++) {
      if (rand() < 0.45) continue;
      const [ax, az] = channel[i], [bx, bz] = channel[i + 1], t = rand();
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const side = rand() < 0.5 ? -1 : 1;
      addReed(ax + dx * t - (dz / l) * side * (1.8 + rand()), az + dz * t + (dx / l) * side * (1.8 + rand()), reedRecs.common);
    }
  }
  for (let z = 980; z < 1500; z += low ? 5 : 2.5) {
    if (rand() < 0.3) continue;
    const x = valleyX('kidron', z) + (rand() - 0.5) * 9;
    addReed(x, z + (rand() - 0.5) * 2, reedRecs.common);
  }
  for (let i = 0; i < (low ? 20 : 50); i++) { const a = rand() * 6.28, r = 4 + rand() * 6; addReed(-36 + Math.cos(a) * r, 1318 + Math.sin(a) * r, reedRecs.common); }
  const reedMat = landMaterial('reeds', { ...U }, /* glsl */ `
    vec3 iP = vec3(instanceMatrix[3]);
    vec3 lp = position;
    float t = aPart.y;
    float wind = windAt(iP.xz);
    vec3 q = (instanceMatrix * vec4(lp, 1.0)).xyz;
    q += windDir() * 0.25 * wind * t * t * lp.y;
    gPos = q;
    gNrm = normalize(mat3(instanceMatrix) * normal);
    float old = uv.x;
    gCol = old > 1.5 ? vec3(0.86, 0.8, 0.7) : mix(mix(vec3(0.12, 0.2, 0.05), vec3(0.32, 0.46, 0.14), t), mix(vec3(0.5, 0.42, 0.3), vec3(0.78, 0.7, 0.52), t), old);
    gUv = atlasCell(15.0, vec2(0.5));
  `, { map: atlas });
  // The reeds are true instances: the shader adds the instance matrix itself.
  reedMat.onBeforeCompile = ((prev) => (sh, r) => {
    prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalMatrix * objectNormal;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);');
  })(reedMat.onBeforeCompile);
  reedMat.customProgramCacheKey = () => 'flora-reeds-v1';
  const reedMesh = (list) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(reedGeo(), reedMat, list.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    list.forEach((r, i) => m.setMatrixAt(i, M.compose(new THREE.Vector3(r.x, terrainY(r.x, r.z) - 0.1, r.z), q.setFromAxisAngle(Y, r.r), new THREE.Vector3(r.s, r.s, r.s))));
    m.computeBoundingSphere();
    m.receiveShadow = true;
    m.userData.infoId = 'flora-reeds';
    return m;
  };

  // The detailed trees and vines near the viewer.
  const pool = treeDetail(quality);
  common.add(pool.group, ...lattices);
  const rCommon = reedMesh(reedRecs.common);
  if (rCommon) common.add(rCommon);
  const later = new THREE.Group();
  const rLater = reedMesh(reedRecs.later);
  if (rLater) later.add(rLater);
  const grown = new THREE.Group();           // standing crops: not in 573 BC
  const sc = slabMesh(slabParts.common); if (sc) grown.add(sc);
  const shC = staticMesh(sheafParts.common, strawMat, 0.5, 'flora-crops', false); if (shC) grown.add(shC);
  const earlyOnly = new THREE.Group();
  const se = slabMesh(slabParts.early); if (se) earlyOnly.add(se);
  const shE = staticMesh(sheafParts.early, strawMat, 0.5, 'flora-crops', false); if (shE) earlyOnly.add(shE);
  const ruin = new THREE.Group();
  const st = stumps(quality);
  st.userData.infoId = 'flora-stumps';
  ruin.add(st);

  // Crop fields answer with their card; in 573 BC with the thorns.
  for (const f of fields) {
    if (f.crop === 5) { zone('flora-beds', f.x, f.z, Math.max(f.w, f.d) / 2, 1.2); continue; }
    const r = Math.min(f.w, f.d) / 2;
    zone(f.crop === 3 ? 'flora-spring' : 'flora-crops', f.x, f.z, r, 1.4, f.earlyOnly ? ['early'] : ['early', 'late']);
    if (!f.earlyOnly) zone('flora-thorns', f.x, f.z, r, 1.4, ['ruin']);
  }

  // Labels for a few things worth finding.
  const label = (text, x, z, lift, info, periods, far = 500) => ({ label: text, pos: new THREE.Vector3(x, terrainY(x, z) + lift, z), info, periods, far });
  const labels = [];
  const wp = sites.find((s) => s.kind === 'winepress');
  if (wp) labels.push(label('Winepress', wp.x, wp.z, 4, 'flora-winepress'));
  const op = sites.find((s) => s.kind === 'olivepress');
  if (op) labels.push(label('Olive press', op.x, op.z, 5, 'flora-olivepress'));
  const ap = sites.find((s) => s.kind === 'apiary');
  if (ap) labels.push(label('Beehives', ap.x, ap.z, 4, 'flora-hives'));
  const reapF = fields.filter((f) => f.reapU > -1e4 && !f.earlyOnly).sort((a, b) => Math.hypot(a.x + 150, a.z - 450) - Math.hypot(b.x + 150, b.z - 450))[0];
  if (reapF) labels.push(label('Barley harvest', reapF.x, reapF.z, 5, 'flora-crops', ['early', 'late']));
  labels.push(label('Spring flowers', -560, 1060, 3, 'flora-spring', null, 700));
  labels.push(label('Thorns and briers', reapF ? reapF.x : -500, reapF ? reapF.z : 700, 5, 'flora-thorns', ['ruin']));
  zone('flora-spring', -560, 1060, 25, 2);

  const cam = new THREE.Vector3();
  let wasHigh = false;
  return {
    layer: 'city',
    groups: [
      { group: common },
      { group: later, periods: ['late', 'ruin'] },
      { group: grown, periods: ['early', 'late'] },
      { group: earlyOnly, periods: ['early'] },
      { group: ruin, periods: ['ruin'] },
    ],
    labels,
    info: INFO,
    zones,
    update(time, dt, env) {
      FLORA_U.fTime.value = time;
      FLORA_U.fDay.value = env.day;
      cam.copy(env.camera.position);
      U.uPer.value = env.period === 'early' ? 0 : env.period === 'late' ? 1 : 2;
      pool.update(cam, env.period);
      // High above the ground the lattices have nothing to show.
      const high = cam.y - terrainY(cam.x, cam.z) > (low ? 90 : 140);
      if (high !== wasHigh) { for (const m of lattices) m.visible = !high; wasHigh = high; }
      if (high) return;
      U.uC.value.set(cam.x, cam.z);
      HM.update(cam.x, cam.z);
    },
  };
}
