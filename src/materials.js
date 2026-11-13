// Procedural materials. Every surface is generated at load time from a height
// field in metres, so colour, normal, roughness and cavity occlusion all come
// from the same stones and cracks; there are no image files.
//
// Masonry, plaster and earth are mapped in world space (see SURFACE_GLSL):
// each face is textured at its true size whatever its UVs, a finer detail
// layer is blended in near the viewer, and fieldstone and paving gain relief
// (parallax occlusion) at walking distance.
import * as THREE from 'three';
import { makeWater } from './water.js';

// Night: how strongly lamp-lit doorways and windows glow (set by the day cycle).
export const nightLights = { houseGlow: { value: 0 } };

// Shared by every world-mapped material: the fine detail texture and the
// height of the ground (filled in once the terrain is built, see main.js), so
// walls darken with splashed dirt and damp where they meet it.
const blank = new THREE.DataTexture(new Uint16Array([0]), 1, 1, THREE.RedFormat, THREE.HalfFloatType);
blank.needsUpdate = true;
export const surfShared = {
  sfDet: { value: null },
  sfGround: { value: blank },
  sfGroundRect: { value: new THREE.Vector4(0, 0, 0, 0) },   // x0, z0, 1/size, 1/size (0: no ground known)
};

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

let ANISO = 8;
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Raw bytes straight to the GPU: no canvas, so no premultiplied alpha to spoil
// the packed channels. Mipmapped and anisotropic.
function dataTex(bytes, N, srgb) {
  const t = new THREE.DataTexture(bytes, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

// --- Texture generation ---------------------------------------------------------
// Everything below runs in worker threads when it can (it is turned into the
// source of a worker with Function.toString), so the page stays responsive and
// the textures are made in parallel while the city is built. It must stay
// self-contained: no three.js, no DOM, nothing from outside the function.
function texgenScope() {
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  // --- Noise --------------------------------------------------------------------
  function hash2(x, y, s) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s + 1, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // One tileable fractal noise tile (period 1), sampled at integer multiples of
  // its period so every pattern built from it tiles too. Far cheaper than
  // evaluating value noise per pixel per octave.
  const NT = 256;
  let NOISE = null;
  function noiseTile() {
    if (NOISE) return NOISE;
    NOISE = new Float32Array(NT * NT);
    let norm = 0;
    for (let o = 0, cells = 4, amp = 1; o < 6; o++, cells *= 2, amp *= 0.55) {
      norm += amp;
      const step = NT / cells;
      for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) {
        const fx = x / step, fy = y / step;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
        const x0 = ix % cells, x1 = (ix + 1) % cells, y0 = iy % cells, y1 = (iy + 1) % cells;
        const a = hash2(x0, y0, o), b = hash2(x1, y0, o), c = hash2(x0, y1, o), d = hash2(x1, y1, o);
        NOISE[y * NT + x] += amp * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy);
      }
    }
    for (let i = 0; i < NOISE.length; i++) NOISE[i] /= norm;
    // Stretch to roughly 0..1.
    let lo = 1, hi = 0;
    for (const v of NOISE) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < NOISE.length; i++) NOISE[i] = (NOISE[i] - lo) / (hi - lo);
    return NOISE;
  }
  // Fractal noise at (u, v) in texture space, f repeats per tile (integer), with
  // an offset `o` that picks a different-looking stretch of the same tile.
  function nz1(u, v, f, o) {
    const T = NOISE;
    const x = (u * f + o * 0.37) * NT, y = (v * f + o * 0.61) * NT;   // never negative
    const ix = x | 0, iy = y | 0, tx = x - ix, ty = y - iy;
    const x0 = ix & 255, y0 = (iy & 255) << 8, x1 = (ix + 1) & 255, y1 = ((iy + 1) & 255) << 8;
    const a = T[y0 + x0], b = T[y0 + x1], c = T[y1 + x0], d = T[y1 + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
  // Two lookups at neighbouring whole frequencies: still tileable, but the
  // noise tile no longer visibly repeats f times across the texture.
  function nz(u, v, f, o = 0) {
    const s = nz1(u, v, f, o) + nz1(u, v, f + 1, o + 5.3) - 1;
    return Math.min(1, Math.max(0, 0.5 + s * 0.75));
  }
  // The same with separate repeat counts across (fu) and along (fv).
  function nz2(u, v, fu, fv, o = 0) {
    return nz(u * fu / fv, v, fv, o);
  }

  // --- Height fields ------------------------------------------------------------
  // A square tile S metres wide at N pixels: height (m), colour (sRGB 0..1) and
  // roughness per pixel.
  class Field {
    constructor(N, S) {
      this.N = N; this.S = S;
      this.h = new Float32Array(N * N);
      this.c = new Float32Array(N * N * 3);
      this.r = new Float32Array(N * N).fill(0.9);
    }
    each(fn) {
      const N = this.N;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) fn((x + 0.5) / N, (y + 0.5) / N, y * N + x);
    }
    set(i, h, r, g, b, rough) {
      this.h[i] = h; this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b; this.r[i] = rough;
    }
  }

  function boxBlur(src, N, r) {
    const tmp = new Float32Array(N * N), out = new Float32Array(N * N), k = 1 / (2 * r + 1);
    for (let y = 0; y < N; y++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += src[y * N + ((d % N) + N) % N];
      for (let x = 0; x < N; x++) {
        tmp[y * N + x] = s * k;
        s += src[y * N + (x + r + 1) % N] - src[y * N + ((x - r) % N + N) % N];
      }
    }
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[(((d % N) + N) % N) * N + x];
      for (let y = 0; y < N; y++) {
        out[y * N + x] = s * k;
        s += tmp[((y + r + 1) % N) * N + x] - tmp[(((y - r) % N + N) % N) * N + x];
      }
    }
    return out;
  }

  // Height field to textures. alb: sRGB colour with height (0..1) in alpha, for
  // parallax. nr: tangent-space normal (x, y), roughness, cavity occlusion.
  function bake(F, { ao = 1, aoRadius = 0.05 } = {}) {
    const { N, S, h } = F;
    let lo = Infinity, hi = -Infinity;
    for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const depth = Math.max(1e-4, hi - lo);
    const blur = boxBlur(h, N, Math.max(1, Math.round(aoRadius / S * N)));
    const alb = new Uint8Array(N * N * 4), nr = new Uint8Array(N * N * 4);
    const px = 2 * S / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = (h[y * N + (x + 1) % N] - h[y * N + (x - 1 + N) % N]) / px;
      const dy = (h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x]) / px;
      const l = Math.hypot(dx, dy, 1);
      const cav = Math.max(0, blur[i] - h[i]);
      nr[i * 4] = (-dx / l * 0.5 + 0.5) * 255;
      nr[i * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255;
      nr[i * 4 + 2] = clamp01(F.r[i]) * 255;
      nr[i * 4 + 3] = (1 - Math.min(0.8, ao * cav / Math.max(0.004, depth * 0.3))) * 255;
      alb[i * 4] = clamp01(F.c[i * 3]) * 255;
      alb[i * 4 + 1] = clamp01(F.c[i * 3 + 1]) * 255;
      alb[i * 4 + 2] = clamp01(F.c[i * 3 + 2]) * 255;
      alb[i * 4 + 3] = (h[i] - lo) / depth * 255;
    }
    return { alb, nr, N, S, depth };
  }

  // Jittered-grid Voronoi cells, tileable, wider than tall: stones laid in rough
  // courses. `shift` offsets each row so joints do not line up.
  function cells(S, { cw, ch, jx = 0.35, jy = 0.12, seed = 1, round = 0 }) {
    const nx = Math.max(1, Math.round(S / cw)), ny = Math.max(1, Math.round(S / ch));
    const W = S / nx, H = S / ny, rand = rng(seed);
    const shift = Float32Array.from({ length: ny }, () => rand());
    const px = new Float32Array(nx * ny), py = new Float32Array(nx * ny), tone = new Float32Array(nx * ny * 4);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      px[k] = (i + 0.5 + shift[j] + (rand() - 0.5) * 2 * jx) * W;
      py[k] = (j + 0.5 + (rand() - 0.5) * 2 * jy) * H;
      for (let t = 0; t < 4; t++) tone[k * 4 + t] = rand();
    }
    const cand = new Float64Array(12 * 3);
    // Nearest stone to (X, Y) metres: its id, offset from its centre and the
    // distance to its nearest edge (the bisector with the next stone).
    const out = { id: 0, dx: 0, dy: 0, edge: 0 };
    return {
      tone,
      at(X, Y) {
        const j0 = Math.floor(Y / H);
        let n = 0, best = 1e9, bi = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const j = j0 + dj, jw = ((j % ny) + ny) % ny, row = jw * nx, oy = (j - jw) * H;
          const i0 = Math.floor(X / W - shift[jw] + 0.5) - 2;
          for (let di = 0; di < 4; di++) {
            const i = i0 + di, iw = ((i % nx) + nx) % nx, k = row + iw;
            const qx = px[k] + (i - iw) * W, qy = py[k] + oy;
            const ex = qx - X, ey = qy - Y, d = ex * ex + ey * ey;
            cand[n] = qx; cand[n + 1] = qy; cand[n + 2] = k;
            if (d < best) { best = d; bi = n; }
            n += 3;
          }
        }
        const ax = cand[bi], ay = cand[bi + 1];
        let edge = 1e9;
        for (let m = 0; m < n; m += 3) {
          if (m === bi) continue;
          const bx = cand[m] - ax, by = cand[m + 1] - ay;
          const L2 = bx * bx + by * by;
          // only neighbours that could be nearer than the best edge so far
          const e = -((X - (ax + cand[m]) * 0.5) * bx + (Y - (ay + cand[m + 1]) * 0.5) * by) / Math.sqrt(L2);
          if (e < edge) edge = e;
        }
        out.id = cand[bi + 2]; out.dx = X - ax; out.dy = Y - ay; out.edge = edge;
        return out;
      },
    };
  }

  // Jerusalem limestone: cream meleke, grey-buff mizzi, pinkish and weathered grey.
  const LIME = [[0.80, 0.75, 0.64], [0.74, 0.67, 0.55], [0.67, 0.65, 0.60], [0.77, 0.69, 0.61], [0.60, 0.57, 0.51], [0.83, 0.79, 0.70]];
  const pick = (pal, t) => pal[Math.min(pal.length - 1, Math.floor(t * pal.length))];

  // Fieldstone laid in rough courses. `mortar`: mud mortar colour, or null for
  // dry stone with dark soil-filled gaps.
  function fieldstone(seed, { N, S, cw, ch, jx = 0.38, jy = 0.09, relief = 0.05, bevel = 0.09, mortar = [0.47, 0.40, 0.32], joint = [0.012, 0.03], warp = 0.06, tint = [1, 1, 1], dark = 0 }) {
    noiseTile();
    const F = new Field(N, S), C = cells(S, { cw, ch, jx, jy, seed, round: Math.min(cw, ch) * 0.12 });
    const fw = Math.max(1, Math.round(S / 1.2)), ff = Math.max(1, Math.round(S / 0.08)), fm = Math.max(1, Math.round(S / 0.5));
    F.each((u, v, i) => {
      const wx = (nz(u, v, fw, seed) - 0.5) * warp * 2, wy = (nz(u, v, fw, seed + 9) - 0.5) * warp * 2;
      const X = u * S + wx, Y = v * S + wy;
      const c = C.at(X, Y);
      const t = C.tone, k = c.id * 4;
      const w = joint[0] + t[k + 3] * (joint[1] - joint[0]);
      const fine = nz(u, v, ff, seed + 3), mid = nz(u, v, fm, seed + 5);
      if (c.edge > w) {
        // The stone: a rounded face standing proud of the joint, tilted a
        // little, pitted, its colour mottled and dirtier toward the edges.
        const rise = Math.sqrt(sstep(w, w + bevel * (0.6 + t[k + 1] * 0.8), c.edge));
        const tilt = (c.dx * (t[k] - 0.5) + c.dy * (t[k + 2] - 0.5)) * 0.06;
        const h = relief * (0.55 + 0.45 * t[k + 1]) * rise + tilt * rise + (fine - 0.5) * 0.006 + (mid - 0.5) * 0.012 * rise;
        const base = pick(LIME, t[k]);
        const mot = 0.86 + 0.26 * mid + (fine - 0.5) * 0.12;
        const dirt = 0.78 + 0.22 * sstep(w, w + 0.05, c.edge);
        const weather = 1 - dark * (0.5 + 0.5 * t[k + 2]);
        const kk = mot * dirt * weather;
        // a few dark spots of lichen on the more weathered stones
        const lich = t[k + 2] > 0.7 ? sstep(0.66, 0.74, nz(u, v, Math.max(2, ff >> 3), seed + 11)) * 0.3 : 0;
        F.set(i, h, base[0] * kk * tint[0] * (1 - lich), base[1] * kk * tint[1] * (1 - lich * 0.9), base[2] * kk * tint[2] * (1 - lich * 0.8), 0.78 + 0.14 * fine);
      } else if (mortar) {
        // Mud mortar, set back from the faces and washed out in places.
        const wash = sstep(0.45, 0.7, mid);
        const h = -0.008 - 0.018 * wash + (fine - 0.5) * 0.006;
        const kk = (0.85 + 0.25 * fine) * (1 - 0.25 * wash);
        F.set(i, h, mortar[0] * kk, mortar[1] * kk, mortar[2] * kk, 0.96);
      } else {
        // Dry stone: deep gaps with soil and small chinking stones.
        const chink = sstep(0.62, 0.7, fine);
        const h = -0.05 + chink * 0.03;
        const kk = 0.5 + 0.22 * chink;
        F.set(i, h, 0.55 * kk + chink * 0.25, 0.47 * kk + chink * 0.23, 0.38 * kk + chink * 0.2, 0.97);
      }
    });
    return bake(F, { aoRadius: 0.06 });
  }

  // Dressed ashlar in courses of one long cubit, with drafted margins round a
  // slightly raised, pecked boss: Iron Age royal masonry (Samaria, Megiddo,
  // Ramat Rahel, the City of David).
  function ashlarField(seed, { N, S = 4.2, course = 0.525, minLen = 0.8, maxLen = 2.0, tone = [0.84, 0.79, 0.68], margin = 0.07 }) {
    noiseTile();
    const F = new Field(N, S), rand = rng(seed);
    const rows = Math.round(S / course), rh = S / rows;
    // Each course: joint positions round the tile, the last stone running
    // across the seam to the first joint.
    const rowsB = [];
    for (let r = 0; r < rows; r++) {
      const js = [];
      let x = rand() * maxLen;
      while (x < S) { js.push(x); x += minLen + rand() * (maxLen - minLen); }
      if (js.length > 1 && S - js[js.length - 1] + js[0] < minLen * 0.6) js.pop();
      rowsB.push({ js, k: js.map(() => [rand(), rand(), rand()]) });
    }
    const ff = Math.round(S / 0.03), fm = Math.round(S / 0.6);
    F.each((u, v, i) => {
      const X = u * S, Y = v * S;
      const r = Math.min(rows - 1, Math.floor(Y / rh)), { js, k: ks } = rowsB[r];
      let s = 0;
      while (s < js.length && js[s] <= X) s++;
      const a = s === 0 ? js[js.length - 1] - S : js[s - 1];
      const b = s === js.length ? js[0] + S : js[s];
      const kk = ks[(s + js.length - 1) % js.length];
      const ex = Math.min(X - a, b - X), ey = Math.min(Y - r * rh, (r + 1) * rh - Y);
      const e = Math.min(ex, ey);
      const fine = nz(u, v, ff, seed), mid = nz(u, v, fm, seed + 4);
      const joint = 0.004 + 0.003 * kk[2];
      const c = 0.9 + 0.16 * kk[0] + (mid - 0.5) * 0.12;
      if (e < joint) {
        F.set(i, -0.012, tone[0] * 0.45, tone[1] * 0.42, tone[2] * 0.38, 0.95);
        return;
      }
      // chipped arris
      const arris = sstep(joint, joint + 0.012, e);
      let h = -0.004 * (1 - arris), rough = 0.72, lit = 1.04;
      if (e > margin) {
        // the boss: raised a little and dressed with a point
        const rise = sstep(margin, margin + 0.025, e);
        h += rise * (0.008 + 0.006 * kk[1]) + rise * (fine - 0.5) * 0.004 + (mid - 0.5) * 0.004;
        rough = 0.86; lit = 0.97 + 0.06 * fine;
      } else {
        // the margin: drafted with a toothed chisel, fine strokes across it
        const strokes = 0.5 + 0.5 * Math.sin((ex < ey ? Y : X) * 260 + fine * 3);
        h += strokes * 0.0006;
        lit = 1.04 + 0.03 * strokes;
      }
      F.set(i, h, tone[0] * c * lit, tone[1] * c * lit, tone[2] * c * lit, rough);
    });
    return F;
  }

  // Fire-damaged ashlar: soot streaks rising from the openings and limestone
  // calcined pink and grey by the heat (as in the burned houses of 586 BC).
  function burntAshlar(seed, N) {
    const F = ashlarField(seed, { N, tone: [0.70, 0.64, 0.55], minLen: 0.9, maxLen: 2.1 });
    const S = F.S;
    F.each((u, v, i) => {
      const soot = sstep(0.5, 0.8, nz2(u, v, 3, 1, seed + 7) + (v - 0.5) * 0.3);
      const pink = sstep(0.55, 0.75, nz(u, v, 3, seed + 8));
      const grey = sstep(0.6, 0.8, nz(u, v, 4, seed + 9));
      const k = 1 - 0.75 * soot;
      F.c[i * 3] = (F.c[i * 3] * (1 - pink * 0.2) + pink * 0.16) * k * (1 - grey * 0.2);
      F.c[i * 3 + 1] = (F.c[i * 3 + 1] * (1 - pink * 0.2) + pink * 0.08) * k * (1 - grey * 0.15);
      F.c[i * 3 + 2] = (F.c[i * 3 + 2] * (1 - pink * 0.2) + pink * 0.07) * k;
      F.h[i] -= grey * 0.004 * nz(u, v, Math.round(S / 0.05), seed);   // spalled surface
      F.r[i] = Math.min(1, F.r[i] + soot * 0.1);
    });
    return bake(F, { aoRadius: 0.03 });
  }

  // Flagstone paving, its joints worn and the faces polished by feet.
  function paving(seed, N) {
    noiseTile();
    const S = 4, F = new Field(N, S), C = cells(S, { cw: 0.85, ch: 0.7, jx: 0.25, jy: 0.25, seed, round: 0.03 });
    const ff = Math.round(S / 0.04), fm = Math.round(S / 0.7);
    F.each((u, v, i) => {
      const c = C.at(u * S + (nz(u, v, 4, seed) - 0.5) * 0.04, v * S + (nz(u, v, 4, seed + 2) - 0.5) * 0.04);
      const t = C.tone, k = c.id * 4;
      const fine = nz(u, v, ff, seed + 3), mid = nz(u, v, fm, seed + 4);
      if (c.edge < 0.008 + 0.006 * t[k + 3]) { F.set(i, -0.02, 0.36, 0.32, 0.27, 0.97); return; }
      const rise = sstep(0.008, 0.06, c.edge);
      const h = 0.006 * rise + (t[k + 1] - 0.5) * 0.006 + (fine - 0.5) * 0.0025 + (mid - 0.5) * 0.004;
      const base = pick(LIME, t[k] * 0.8);
      const kk = (0.9 + 0.18 * mid + (fine - 0.5) * 0.08) * (0.86 + 0.14 * rise);
      F.set(i, h, base[0] * kk, base[1] * kk, base[2] * kk, 0.62 + 0.25 * (1 - rise) + 0.1 * fine);
    });
    return bake(F, { aoRadius: 0.04 });
  }

  // Plaster over rubble walls: mud plaster tempered with chopped straw, a lime
  // wash over it (worn through in places), hairline cracks, and patches of
  // newer plaster where it was mended.
  function plasterField(seed, { N, S = 3, base = [0.93, 0.91, 0.86], mud = [0.70, 0.60, 0.47], wash = 0.75, straw = 1, wheel = 0 }) {
    noiseTile();
    const F = new Field(N, S), rand = rng(seed);
    const C = cells(S, { cw: 0.32, ch: 0.32, jx: 0.45, jy: 0.45, seed: seed + 1 });
    const fu = Math.round(S / 1.5), fm = Math.round(S / 0.35), ff = Math.round(S / 0.02);
    F.each((u, v, i) => {
      const und = nz(u, v, fu, seed), mid = nz(u, v, fm, seed + 1), fine = nz(u, v, ff, seed + 2);
      // trowel undulation and grit
      let h = (und - 0.5) * 0.006 + (mid - 0.5) * 0.002 + (fine - 0.5) * 0.0008;
      // throwing rings from the potter's wheel, round the pot (rows of v)
      if (wheel) h = h * 0.3 + wheel * 0.0004 * Math.sin(v * S / 0.005 * Math.PI * 2 + und * 4) * (0.5 + 0.5 * mid);
      // Lime wash worn through toward the mud below; the vertex tint does the rest.
      const worn = sstep(0.62, 0.7, nz(u, v, Math.round(S / 0.9), seed + 3) * (1 - wash * 0.4) + (mid - 0.5) * 0.2);
      // a mended patch: thicker, a shade different
      const patch = sstep(0.7, 0.73, nz(u, v, Math.round(S / 1.2), seed + 4));
      h += patch * 0.0025 - worn * 0.0012;
      // hairline cracks along cell edges, only where the plaster has moved
      const c = C.at(u * S + (mid - 0.5) * 0.06, v * S + (und - 0.5) * 0.06);
      const crackOn = sstep(0.55, 0.62, nz(u, v, Math.round(S / 0.8), seed + 5));
      const crack = crackOn * (1 - sstep(0.0008, 0.0025, c.edge));
      h -= crack * 0.002;
      let r = base[0], g = base[1], b = base[2];
      const kk = 0.95 + 0.08 * mid + (fine - 0.5) * 0.05;
      r = (r * (1 - worn) + mud[0] * worn) * kk; g = (g * (1 - worn) + mud[1] * worn) * kk; b = (b * (1 - worn) + mud[2] * worn) * kk;
      r *= 1 - patch * 0.05; g *= 1 - patch * 0.04; b *= 1 - patch * 0.07;
      r *= 1 - crack * 0.45; g *= 1 - crack * 0.45; b *= 1 - crack * 0.45;
      F.set(i, h, r, g, b, 0.9 + 0.08 * fine - worn * 0.04);
    });
    // chopped straw in the mud: short golden fibres, mostly showing where worn
    for (let n = 0, count = Math.round(260 * S * S * straw); n < count; n++) {
      const x0 = rand() * N, y0 = rand() * N, a = rand() * Math.PI, len = (0.01 + rand() * 0.025) / S * N;
      for (let s = 0; s < len; s += 0.7) {
        const x = Math.floor(x0 + Math.cos(a) * s) % N, y = Math.floor(y0 + Math.sin(a) * s) % N, i = y * N + x;
        const show = 0.25 + 0.75 * (1 - clamp01((F.c[i * 3] - mud[0]) / Math.max(0.01, base[0] - mud[0])));
        F.c[i * 3] += (0.80 - F.c[i * 3]) * 0.45 * show;
        F.c[i * 3 + 1] += (0.66 - F.c[i * 3 + 1]) * 0.45 * show;
        F.c[i * 3 + 2] += (0.38 - F.c[i * 3 + 2]) * 0.45 * show;
        F.h[i] += 0.0004;
      }
    }
    return bake(F, { aoRadius: 0.02, ao: 0.6 });
  }

  // Packed earth: roofs (rolled flat with a stone roller after rain) and floors.
  function earthField(seed, { N, S = 4, color = [0.70, 0.60, 0.47], roller = true, stones = 1 }) {
    noiseTile();
    const F = new Field(N, S), rand = rng(seed);
    const C = cells(S, { cw: 0.22, ch: 0.22, jx: 0.45, jy: 0.45, seed: seed + 3 });
    const fu = Math.round(S / 1.2), fm = Math.round(S / 0.25), ff = Math.round(S / 0.015);
    const lane = S / Math.round(S / 0.45);     // width of the roller's track
    F.each((u, v, i) => {
      const und = nz(u, v, fu, seed), mid = nz(u, v, fm, seed + 1), fine = nz(u, v, ff, seed + 2);
      let h = (und - 0.5) * 0.01 + (mid - 0.5) * 0.004 + (fine - 0.5) * 0.0015;
      let k = 0.9 + 0.12 * und + 0.08 * (fine - 0.5);
      if (roller) {
        // overlapping passes of the roller leave faint ridges and paler bands
        const p = (u * S + (und - 0.5) * 0.15) / lane;
        const f = p - Math.floor(p);
        h += -0.0015 * Math.cos(f * Math.PI * 2) + 0.001 * sstep(0.92, 1, f);
        k *= 1 + 0.035 * Math.cos(Math.floor(p) * 2.3);
      }
      // shrinkage cracks where it has dried
      const c = C.at(u * S + (mid - 0.5) * 0.05, v * S + (und - 0.5) * 0.05);
      const crack = sstep(0.55, 0.65, nz(u, v, Math.round(S / 1.5), seed + 5)) * (1 - sstep(0.001, 0.003, c.edge));
      h -= crack * 0.003; k *= 1 - crack * 0.5;
      F.set(i, h, color[0] * k, color[1] * k, color[2] * k, 0.93 + 0.06 * fine);
    });
    // grit, small stones and chaff trodden in
    for (let n = 0, count = Math.round(120 * S * S * stones); n < count; n++) {
      const cx = rand() * N, cy = rand() * N, rr = (0.003 + rand() * rand() * 0.014) / S * N, l = 0.7 + rand() * 0.5, straw = rand() < 0.3;
      const R = Math.ceil(rr) + 1;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy) / rr;
        if (d > 1) continue;
        const x = ((Math.floor(cx) + dx) % N + N) % N, y = ((Math.floor(cy) + dy) % N + N) % N, i = y * N + x;
        const dome = Math.sqrt(1 - d * d);
        F.h[i] += dome * rr / N * S * 0.5;
        const col = straw ? [0.78, 0.66, 0.42] : [0.82 * l, 0.78 * l, 0.70 * l];
        F.c[i * 3] = col[0]; F.c[i * 3 + 1] = col[1]; F.c[i * 3 + 2] = col[2];
        F.r[i] = 0.8;
      }
    }
    return bake(F, { aoRadius: 0.02, ao: 0.7 });
  }

  // Limestone bedrock and boulders: solution pits and runnels, bedding lines,
  // dark lichen. Mapped from three sides.
  function rockField(seed, N) {
    noiseTile();
    const S = 3, F = new Field(N, S);
    const fu = Math.round(S / 1.5), fm = Math.round(S / 0.3), ff = Math.round(S / 0.02);
    F.each((u, v, i) => {
      const und = nz(u, v, fu, seed), mid = nz(u, v, fm, seed + 1), fine = nz(u, v, ff, seed + 2);
      const pits = sstep(0.62, 0.75, nz(u, v, Math.round(S / 0.12), seed + 3));
      const bed = Math.abs(Math.sin((v + und * 0.4 / S) * Math.PI * Math.round(S / 0.35)));
      const h = und * 0.08 + mid * 0.02 + fine * 0.003 - pits * 0.012 - (1 - sstep(0, 0.12, bed)) * 0.01;
      const lich = sstep(0.66, 0.72, nz(u, v, Math.round(S / 0.4), seed + 4));
      const k = (0.82 + 0.22 * mid + 0.08 * (fine - 0.5)) * (1 - pits * 0.25) * (1 - lich * 0.45);
      F.set(i, h, 0.80 * k, 0.77 * k * (1 - lich * 0.05), 0.70 * k, 0.86 + 0.1 * fine);
    });
    return bake(F, { aoRadius: 0.08 });
  }

  // Boards along v, with grain, checks and (for weathered timber) silvering.
  function woodField(seed, { N, S = 2, boards = 6, color = [0.54, 0.31, 0.18], grey = 0, knots = 0.6 }) {
    noiseTile();
    const F = new Field(N, S), rand = rng(seed);
    const tone = Array.from({ length: boards }, () => rand());
    // Knots: the grain swirls round them; dark, slightly raised cores.
    const kn = [];
    for (let b = 0; b < boards; b++) for (let k = 0; k < Math.round(knots * 2 * S); k++) {
      if (rand() < 0.5) kn.push({ b, u: (b + 0.25 + rand() * 0.5) / boards, v: rand(), r: (0.006 + rand() * 0.014) / S });
    }
    const gu = Math.round(S / 0.006);
    F.each((u, v, i) => {
      const b = Math.floor(u * boards), fb = u * boards - b;
      let swirl = 0, core = 0;
      for (const k of kn) {
        if (k.b !== b) continue;
        let dv = v - k.v; dv -= Math.round(dv);
        const du = (u - k.u) * 2.2, d = Math.hypot(du, dv);
        if (d > k.r * 8) continue;
        swirl += k.r * 2.5 / (d + k.r) * Math.sign(du || 1);
        core = Math.max(core, 1 - sstep(k.r * 0.6, k.r, d));
      }
      const grain = nz2(u, v, 1, 4, seed + b) * 0.5 + nz2(u + swirl * 0.02, v, gu, 4, seed + b) * 0.5;
      const rings = 0.5 + 0.5 * Math.sin(grain * 40 + fb * 6 + swirl * 25);
      const check = (1 - sstep(0, 0.04, Math.abs(nz2(u, v, 12, 1, seed + 7 + b) - 0.5))) * sstep(0.5, 0.7, nz(u, v, 2, seed + 20 + b));
      const gap = 1 - sstep(0, 0.03, Math.min(fb, 1 - fb));
      const h = rings * 0.0012 - check * 0.003 - gap * 0.006 + (nz(u, v, 6, seed) - 0.5) * 0.002 + core * 0.0008;
      const k = (0.85 + 0.3 * tone[b]) * (0.85 + 0.2 * rings) * (1 - check * 0.5) * (1 - gap * 0.6) * (1 - core * 0.55);
      const g = grey * (0.6 + 0.4 * nz(u, v, 3, seed + 30));
      const c = [color[0] * (1 - g) + 0.55 * g, color[1] * (1 - g) + 0.53 * g, color[2] * (1 - g) + 0.49 * g];
      F.set(i, h, c[0] * k, c[1] * k, c[2] * k, 0.7 + 0.2 * g + 0.1 * check - core * 0.1);
    });
    return bake(F, { aoRadius: 0.01, ao: 0.6 });
  }

  // Tabby weave of spun thread, about 4 mm a thread (homespun wool or coarse
  // linen), with uneven slubs. Neutral: the tint gives the dye.
  function weaveField(seed, { N, S = 0.25, threads = 64 }) {
    noiseTile();
    const F = new Field(N, S);
    F.each((u, v, i) => {
      const x = u * threads, y = v * threads, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const warpTop = (ix + iy) % 2 === 0;
      const slubW = 0.8 + 0.4 * nz2(u, v, threads, 2, seed), slubF = 0.8 + 0.4 * nz2(u, v, 2, threads, seed + 1);
      const pw = Math.cos((fx - 0.5) * Math.PI) * slubW, pf = Math.cos((fy - 0.5) * Math.PI) * slubF;
      // the thread on top bulges along its length too
      const top = warpTop ? pw * (0.6 + 0.4 * Math.sin(fy * Math.PI)) : pf * (0.6 + 0.4 * Math.sin(fx * Math.PI));
      const h = top * 0.0006 + (nz(u, v, 16, seed + 2) - 0.5) * 0.0002;
      const fib = 0.9 + 0.1 * nz(u, v, 32, seed + 3);
      const k = (0.72 + 0.28 * top) * fib * (warpTop ? 1 : 0.95);
      F.set(i, h, k, k * 0.98, k * 0.95, 0.95);
    });
    return bake(F, { aoRadius: 0.002, ao: 0.8 });
  }

  // Bundled straw or reed, laid in overlapping courses running down the slope.
  function strawField(seed, { N, S = 1, count = 2600 }) {
    noiseTile();
    const F = new Field(N, S), rand = rng(seed);
    F.each((u, v, i) => F.set(i, -0.01, 0.28, 0.22, 0.14, 1));
    for (let n = 0; n < count * S * S; n++) {
      const x0 = rand() * N, y0 = rand() * N, len = (0.15 + rand() * 0.35) / S * N, a = Math.PI / 2 + (rand() - 0.5) * 0.25;
      const w = 0.8 + rand() * 1.2, lay = rand() * 0.01, t = rand();
      const col = t < 0.2 ? [0.62, 0.58, 0.50] : [0.80 + 0.1 * rand(), 0.66 + 0.08 * rand(), 0.38 + 0.08 * rand()];
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let s = 0; s < len; s += 0.6) {
        for (let o = -w; o <= w; o += 0.6) {
          const x = ((Math.floor(x0 + ca * s - sa * o) % N) + N) % N, y = ((Math.floor(y0 + sa * s + ca * o) % N) + N) % N, i = y * N + x;
          const h = lay + Math.sqrt(Math.max(0, 1 - (o / w) ** 2)) * 0.002;
          if (h > F.h[i]) { const sh = 0.8 + 0.2 * (1 - Math.abs(o) / w); F.set(i, h, col[0] * sh, col[1] * sh, col[2] * sh, 0.85); }
        }
      }
    }
    return bake(F, { aoRadius: 0.02, ao: 1 });
  }

  // Furrowed bark: corky ridges split by deep fissures running up the trunk.
  function barkField(seed, { N, S = 1 }) {
    noiseTile();
    const F = new Field(N, S);
    F.each((u, v, i) => {
      const r = nz2(u, v, 14, 2, seed), q = nz2(u, v, 40, 6, seed + 1), f = nz(u, v, 64, seed + 2);
      const ridge = sstep(0.3, 0.55, r) * (0.7 + 0.3 * q);
      const plates = sstep(0.45, 0.5, nz2(u, v, 10, 8, seed + 3));
      const h = ridge * 0.012 + plates * 0.002 + (f - 0.5) * 0.001;
      const k = 0.35 + 0.55 * ridge * (0.85 + 0.15 * f) + plates * 0.05;
      const lich = sstep(0.68, 0.74, nz(u, v, 6, seed + 4)) * ridge;
      F.set(i, h, k * (0.62 + lich * 0.2), k * (0.56 + lich * 0.25), k * (0.50 + lich * 0.1), 0.95);
    });
    return bake(F, { aoRadius: 0.02, ao: 1 });
  }

  // Fine detail, 0.5 m a repeat, laid over every world-mapped surface near the
  // viewer: grit and pitting as a normal (rg), brightness variation (b), and a
  // smooth noise (a) sampled at tens of metres to break up repeats.
  function detailTex(N) {
    noiseTile();
    const S = 0.5, F = new Field(N, S);
    F.each((u, v, i) => {
      const g = nz(u, v, 24, 1), p = nz(u, v, 8, 2), m = nz(u, v, 2, 3);
      F.h[i] = (g - 0.5) * 0.0012 + (p - 0.5) * 0.0018 - sstep(0.7, 0.8, nz(u, v, 12, 4)) * 0.0015;
      F.c[i * 3] = m;
    });
    const { N: n, h } = F, bytes = new Uint8Array(n * n * 4), px = 2 * S / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const dx = (h[y * n + (x + 1) % n] - h[y * n + (x - 1 + n) % n]) / px;
      const dy = (h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x]) / px;
      const l = Math.hypot(dx, dy, 1);
      bytes[i * 4] = (-dx / l * 0.5 + 0.5) * 255;
      bytes[i * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255;
      bytes[i * 4 + 2] = clamp01(0.5 + h[i] * 220) * 255;
      bytes[i * 4 + 3] = clamp01(nz((x + 0.5) / n, (y + 0.5) / n, 1, 9)) * 255;
    }
    return { det: bytes, N: n };
  }

  // --- Ground textures (used by the terrain shader in terrain.js) ---------------
  // a: brightness (r, 0.5 = unchanged), stone mask (g), height (b), occlusion (a).
  // n: normal (rg), roughness (b).
  function groundPair(F) {
    const { N, S, h } = F;
    let lo = Infinity, hi = -Infinity;
    for (const v of h) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const blur = boxBlur(h, N, Math.max(1, Math.round(0.03 / S * N)));
    const a = new Uint8Array(N * N * 4), n = new Uint8Array(N * N * 4), px = 2 * S / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = (h[y * N + (x + 1) % N] - h[y * N + (x - 1 + N) % N]) / px;
      const dy = (h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x]) / px;
      const l = Math.hypot(dx, dy, 1);
      n[i * 4] = (-dx / l * 0.5 + 0.5) * 255; n[i * 4 + 1] = (-dy / l * 0.5 + 0.5) * 255; n[i * 4 + 2] = clamp01(F.r[i]) * 255; n[i * 4 + 3] = 255;
      a[i * 4] = clamp01(F.c[i * 3] * 0.5) * 255; a[i * 4 + 1] = clamp01(F.c[i * 3 + 1]) * 255;
      a[i * 4 + 2] = (h[i] - lo) / Math.max(1e-4, hi - lo) * 255;
      a[i * 4 + 3] = (1 - Math.min(0.8, Math.max(0, blur[i] - h[i]) / Math.max(0.003, (hi - lo) * 0.3))) * 255;
    }
    return { a, n, N, S };
  }

  // Stony hill soil: crumbs and clods with limestone pebbles and grit.
  function soilField(seed, N, { S = 2.5, pebbles = 1, cracks = 0, dung = 0 } = {}) {
    noiseTile();
    const F = new Field(N, S), rand = rng(seed);
    const C = cracks ? cells(S, { cw: 0.24, ch: 0.24, jx: 0.45, jy: 0.45, seed: seed + 1 }) : null;
    const fu = Math.round(S / 0.8), fm = Math.round(S / 0.12), ff = Math.round(S / 0.012);
    F.each((u, v, i) => {
      const und = nz(u, v, fu, seed), mid = nz(u, v, fm, seed + 1), fine = nz(u, v, ff, seed + 2);
      let h = (und - 0.5) * 0.025 + (mid - 0.5) * 0.01 + (fine - 0.5) * 0.004;
      let k = 0.86 + 0.22 * mid + 0.12 * (fine - 0.5), rough = 0.95;
      if (C) {
        // dry, trodden earth: plates parted by cracks, their edges curled
        const c = C.at(u * S + (mid - 0.5) * 0.04, v * S + (und - 0.5) * 0.04);
        const cr = 1 - sstep(0.0015, 0.005, c.edge);
        h = (und - 0.5) * 0.006 + (fine - 0.5) * 0.0015 + sstep(0.005, 0.03, c.edge) * 0.002 * cracks - cr * 0.006 * cracks;
        k = (0.95 + 0.12 * und + 0.06 * (fine - 0.5)) * (1 - cr * 0.55 * cracks);
        rough = 0.9;
      }
      F.set(i, h, k, 0, 0, rough);
    });
    // pebbles and grit: pale limestone, half buried
    for (let n = 0, count = Math.round(110 * S * S * pebbles); n < count; n++) {
      const cx = rand() * N, cy = rand() * N;
      const r = (0.004 + Math.pow(rand(), 3) * 0.05) / S * N, l = 0.85 + rand() * 0.4, ell = 0.6 + rand() * 0.4, ang = rand() * 3.14;
      const R = Math.ceil(r) + 1, ca = Math.cos(ang), sa = Math.sin(ang);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const ex = (dx * ca + dy * sa) / r, ey = (-dx * sa + dy * ca) / (r * ell);
        const d = ex * ex + ey * ey;
        if (d > 1) continue;
        const x = ((Math.floor(cx) + dx) % N + N) % N, y = ((Math.floor(cy) + dy) % N + N) % N, i = y * N + x;
        const top = Math.sqrt(1 - d) * r / N * S * 0.55;
        if (top + 0.0 > F.h[i]) { F.h[i] = Math.max(F.h[i], top - r / N * S * 0.15); F.c[i * 3] = l * (0.92 + 0.08 * Math.sqrt(1 - d)); F.c[i * 3 + 1] = 1; F.r[i] = 0.75; }
      }
    }
    // dung trodden into the lanes: flattened, irregular, dark brown
    for (let n = 0, count = Math.round(8 * S * S * dung); n < count; n++) {
      const cx = rand() * N, cy = rand() * N, r = (0.03 + rand() * 0.05) / S * N, R = Math.ceil(r * 1.5), ph = rand() * 6;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const ang = Math.atan2(dy, dx);
        const rr = r * (0.7 + 0.25 * Math.sin(ang * 3 + ph) + 0.15 * Math.sin(ang * 7 + ph * 2));
        const d = Math.hypot(dx, dy) / rr;
        if (d > 1) continue;
        const x = ((Math.floor(cx) + dx) % N + N) % N, y = ((Math.floor(cy) + dy) % N + N) % N, i = y * N + x;
        const k = 0.6 + 0.25 * sstep(0.6, 1, d);
        F.c[i * 3] *= k; F.h[i] += 0.0015 * (1 - d * d); F.r[i] = 0.8; F.c[i * 3 + 1] = 0;
      }
    }
    return groundPair(F);
  }


  const ashlar = (seed, o) => bake(ashlarField(seed, o), { aoRadius: 0.03, ao: 0.8 });
  return { fieldstone, ashlar, burntAshlar, paving, plasterField, earthField, rockField, woodField, weaveField, strawField, barkField, soilField, detailTex };
}

// --- The surface shader -------------------------------------------------------
// World-space mapping: a face is textured in its own plane (vertical faces
// along their length and up; upward faces in plan), at the true size of the
// texture, so masonry has the same scale on every wall whatever its UVs.
const SURFACE_PARS = /* glsl */ `
uniform sampler2D sfAlb;
uniform sampler2D sfNr;
uniform sampler2D sfDet;
uniform highp sampler2D sfGround;
uniform highp vec4 sfGroundRect;
uniform vec4 sfP;       // 1 / metres per repeat, relief depth (m), normal strength, weathering
uniform vec2 sfOff;
#ifdef SF_HOUSE
  uniform sampler2D sfAlb2;
  uniform sampler2D sfNr2;
  varying vec2 vSfUv;
#endif
vec4 sfNrS;
vec4 sfDetS;
vec3 sfNg, sfT, sfB;
highp vec3 sfW;
float sfDist;
vec2 sfUv, sfGx, sfGy, sfM;
float sfFade;
`;

const SURFACE_MAP = /* glsl */ `
{
  sfW = cameraPosition + ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz;
  sfNg = normalize( ( vec4( normalize( vNormal ), 0.0 ) * viewMatrix ).xyz );
  sfDist = length( vViewPosition );
  sfFade = 1.0 - smoothstep( 6.0, 30.0, sfDist );
  if ( abs( sfNg.y ) > 0.7071 ) {
    float sy = sfNg.y > 0.0 ? 1.0 : -1.0;
    sfT = vec3( 1.0, 0.0, 0.0 );
    sfM = vec2( sfW.x, - sy * sfW.z );
  } else {
    vec2 hz = normalize( sfNg.xz );
    sfT = vec3( hz.y, 0.0, - hz.x );
    sfM = vec2( dot( sfW.xz, vec2( hz.y, - hz.x ) ), sfW.y );
  }
  sfT = normalize( sfT - sfNg * dot( sfNg, sfT ) );
  sfB = cross( sfNg, sfT );
  sfUv = sfM * sfP.x + sfOff;
  sfGx = dFdx( sfUv ); sfGy = dFdy( sfUv );
  #ifdef SF_HOUSE
    bool sfRoof = sfNg.y > 0.7;
    #define SF_A( uv ) ( sfRoof ? textureGrad( sfAlb2, uv, sfGx, sfGy ) : textureGrad( sfAlb, uv, sfGx, sfGy ) )
    #define SF_N( uv ) ( sfRoof ? textureGrad( sfNr2, uv, sfGx, sfGy ) : textureGrad( sfNr, uv, sfGx, sfGy ) )
  #else
    #define SF_A( uv ) textureGrad( sfAlb, uv, sfGx, sfGy )
    #define SF_N( uv ) textureGrad( sfNr, uv, sfGx, sfGy )
  #endif
  #ifdef SF_PARALLAX
    // Relief by parallax occlusion: march the view ray down into the height
    // field, close by only.
    float pk = sfP.y * sfP.x * ( 1.0 - smoothstep( 8.0, 22.0, sfDist ) );
    if ( pk > 1e-5 ) {
      vec3 V = normalize( cameraPosition - sfW );
      vec3 Vt = vec3( dot( V, sfT ), dot( V, sfB ), max( dot( V, sfNg ), 0.2 ) );
      vec2 dir = Vt.xy / Vt.z * pk;
      const float L = 1.0 / 12.0;
      float d = 0.0, hh = 1.0 - SF_A( sfUv ).a, dPrev = 0.0, hPrev = hh;
      vec2 uvp = sfUv;
      for ( int i = 0; i < 12; i ++ ) {
        if ( d < hh ) { dPrev = d; hPrev = hh; d += L; uvp = sfUv - dir * d; hh = 1.0 - SF_A( uvp ).a; }
      }
      float a = hh - d, b = hPrev - dPrev;
      float w = clamp( a / ( a - b + 1e-5 ), 0.0, 1.0 );
      sfUv -= dir * mix( d, dPrev, w );
    }
  #endif
  vec4 sfA = SF_A( sfUv );
  sfNrS = SF_N( sfUv );
  vec3 alb = sfA.rgb;
  // Large, slow variation so the repeat does not show from afar.
  float mac = texture2D( sfDet, sfM / 37.0 + sfOff ).a;
  alb *= 0.86 + 0.28 * mac;
  // Fine grit close by.
  vec4 det = texture2D( sfDet, sfM * 2.0 );
  sfDetS = det;
  alb *= 1.0 + ( det.b - 0.5 ) * 0.5 * sfFade;
  #ifdef SF_WEATHER
    float vert = 1.0 - smoothstep( 0.35, 0.75, abs( sfNg.y ) );
    // Splashed dirt and rising damp where the wall meets the ground.
    if ( sfGroundRect.z > 0.0 ) {
      vec2 guv = ( sfW.xz - sfGroundRect.xy ) * sfGroundRect.zw;
      if ( guv.x > 0.0 && guv.x < 1.0 && guv.y > 0.0 && guv.y < 1.0 ) {
        float above = sfW.y - texture2D( sfGround, guv ).r;
        float band = ( 1.0 - smoothstep( 0.0, 0.9 + 0.5 * mac, above ) ) * step( -0.6, above ) * vert * sfP.w;
        alb *= mix( vec3( 1.0 ), vec3( 0.66, 0.58, 0.49 ), band * ( 0.6 + 0.4 * det.a ) );
      }
    }
    #ifdef SF_HOUSE
      // Streaks below the roof spouts, and grime washed down from the parapet.
      if ( vert > 0.5 ) {
        float cell = floor( sfM.x / 2.3 );
        float spout = step( 0.55, fract( sin( cell * 91.7 + floor( sfW.y / 6.0 ) * 13.1 ) * 4375.5 ) );
        float across = ( sfM.x / 2.3 - cell - 0.5 ) * 2.3;
        float sx = exp( - across * across / ( 0.03 + 0.05 * vSfUv.y ) );
        float top = smoothstep( 0.25, 0.98, vSfUv.y );
        float streak = spout * sx * top * ( 0.6 + 0.4 * texture2D( sfDet, vec2( sfM.x * 0.4, sfM.y * 0.05 ) ).a );
        float grime = smoothstep( 0.82, 1.0, vSfUv.y ) * 0.35 * texture2D( sfDet, vec2( sfM.x * 0.9, sfM.y * 0.08 ) ).a;
        alb *= 1.0 - 0.38 * clamp( streak + grime, 0.0, 1.0 );
      }
    #endif
  #endif
  diffuseColor.rgb *= alb;
}
`;

const SURFACE_ROUGH = /* glsl */ `
float roughnessFactor = roughness * sfNrS.b;
`;

const SURFACE_NORMAL = /* glsl */ `
{
  vec2 m = ( sfNrS.xy * 2.0 - 1.0 ) * sfP.z;
  vec2 dd = ( sfDetS.rg * 2.0 - 1.0 ) * 0.6 * sfFade;
  vec3 nW = normalize( sfNg + sfT * ( m.x + dd.x ) + sfB * ( m.y + dd.y ) );
  normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
  #ifdef DOUBLE_SIDED
    normal *= faceDirection;
  #endif
}
`;

const SURFACE_AO = /* glsl */ `
{
  float ao = sfNrS.a;
  reflectedLight.indirectDiffuse *= ao;
  reflectedLight.indirectSpecular *= ao;
  reflectedLight.directDiffuse *= mix( 1.0, ao, 0.4 );
}
`;

let QUAL = 'high';

// --- Texture jobs -------------------------------------------------------------
// A few workers built from texgenScope; if workers are unavailable (or blocked
// by the page's security policy) the same code runs on the main thread.
const pending = [];
let pool = null;
function workerPool() {
  if (pool !== null) return pool;
  pool = [];
  try {
    const src = `const GEN = (${texgenScope.toString()})();
onmessage = (e) => {
  const { id, job, args } = e.data;
  const r = GEN[job](...args);
  const bufs = Object.values(r).filter((v) => v && v.buffer).map((v) => v.buffer);
  postMessage({ id, r }, bufs);
};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const n = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) pool.push(new Worker(url));
  } catch (e) {
    pool = [];
  }
  return pool;
}
let localGen = null;
let jobId = 0;
function runJob(job, args) {
  const workers = workerPool();
  const local = () => { localGen ||= texgenScope(); return localGen[job](...args); };
  if (!workers.length) return Promise.resolve(local());
  const w = workers[jobId % workers.length], id = ++jobId;
  return new Promise((resolve) => {
    let done = false;
    const on = (e) => { if (e.data.id === id) finish(e.data.r); };
    const finish = (r) => { if (!done) { done = true; w.removeEventListener('message', on); resolve(r); } };
    w.addEventListener('message', on);
    w.addEventListener('error', () => finish(local()), { once: true });
    // A worker that never answers (a browser that refuses blob workers
    // silently): make the texture here instead.
    setTimeout(() => { if (!done) finish(local()); }, 8000);
    try { w.postMessage({ id, job, args }); } catch (e) { finish(local()); }
  });
}

// Textures that exist at once (with a plain placeholder colour) and are filled
// in when their job is done. Same size before and after, so the GPU texture is
// only re-uploaded, never re-allocated.
function placeholder(N, srgb, fill) {
  const bytes = new Uint8Array(N * N * 4);
  for (let i = 0; i < bytes.length; i += 4) { bytes[i] = fill[0]; bytes[i + 1] = fill[1]; bytes[i + 2] = fill[2]; bytes[i + 3] = fill[3]; }
  return dataTex(bytes, N, srgb);
}
const fillIn = (tex, bytes) => { tex.image.data.set(bytes); tex.needsUpdate = true; };
// A material texture set: { alb, nr, S } (see bake()).
function texSet(job, N, S, args, avg = [200, 190, 170]) {
  const set = { alb: placeholder(N, true, [...avg, 128]), nr: placeholder(N, false, [128, 128, 230, 255]), S };
  pending.push(runJob(job, args).then((r) => { fillIn(set.alb, r.alb); fillIn(set.nr, r.nr); }));
  return set;
}
// Resolves when every generated texture has been filled in.
export const texturesReady = () => Promise.all(pending);

// Turn a MeshStandardMaterial into a world-mapped surface. `set` holds the
// textures from texSet(); `S` the metres a repeat covers.
function surface(m, key, set, { depth = 0, normal = 1, weather = 1, offset = 0, roof = null, house = false, tri = false, tint = false } = {}) {
  const u = {
    sfAlb: { value: set.alb }, sfNr: { value: set.nr },
    sfP: { value: new THREE.Vector4(1 / set.S, depth, normal, weather) },
    sfOff: { value: new THREE.Vector2(offset * 0.37 % 1, offset * 0.71 % 1) },
    sfAlb2: { value: roof?.alb || null }, sfNr2: { value: roof?.nr || null },
  };
  m.map = set.alb;                      // kept for anything that reads .map, and for clones
  m.roughness = 1;
  m.userData.surface = u;
  // Tinted by vertex or instance colour; white where a geometry has none.
  if (tint) { m.vertexColors = true; m.defaultAttributeValues = { color: [1, 1, 1] }; }
  const parallax = depth > 0 && QUAL !== 'low';
  const variant = [key, parallax ? 'p' : '', weather > 0 ? 'w' : '', house ? 'h' : '', tri ? 't' : ''].join('-');
  m.defines = { ...(m.defines || {}) };
  if (parallax) m.defines.SF_PARALLAX = '';
  if (weather > 0) m.defines.SF_WEATHER = '';
  if (house) m.defines.SF_HOUSE = '';
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = function (shader, renderer) {
    Object.assign(shader.uniforms, surfShared, u);
    if (house) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSfUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSfUv = uv;');
    }
    let map = SURFACE_MAP;
    if (tri) map = map.replace('vec4 sfA = SF_A( sfUv );\n  sfNrS = SF_N( sfUv );', TRIPLANAR);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SURFACE_PARS)
      .replace('#include <map_fragment>', map)
      .replace('#include <roughnessmap_fragment>', SURFACE_ROUGH)
      .replace('#include <normal_fragment_maps>', SURFACE_NORMAL)
      .replace('#include <aomap_fragment>', SURFACE_AO);
    if (prev) prev.call(this, shader, renderer);
  };
  // Each material has its own textures in its own uniforms, so its own program.
  m.customProgramCacheKey = () => 'surface-v3-' + variant;
  return m;
}

// Things at every angle (boulders, jars, poles, heaps of stone): the texture
// is projected along the three axes and blended by the normal.
const TRIPLANAR = /* glsl */ `
  vec3 tw = pow( abs( sfNg ), vec3( 4.0 ) ); tw /= tw.x + tw.y + tw.z;
  float tsx = sfNg.x > 0.0 ? -1.0 : 1.0, tsz = sfNg.z > 0.0 ? 1.0 : -1.0, tsy = sfNg.y > 0.0 ? -1.0 : 1.0;
  vec2 ux = vec2( tsx * sfW.z, sfW.y ) * sfP.x + sfOff, uy = vec2( sfW.x, tsy * sfW.z ) * sfP.x + sfOff, uz = vec2( tsz * sfW.x, sfW.y ) * sfP.x + sfOff;
  vec4 sfA = texture2D( sfAlb, ux ) * tw.x + texture2D( sfAlb, uy ) * tw.y + texture2D( sfAlb, uz ) * tw.z;
  vec4 tnx = texture2D( sfNr, ux ), tny = texture2D( sfNr, uy ), tnz = texture2D( sfNr, uz );
  sfNrS = tnx * tw.x + tny * tw.y + tnz * tw.z;
  // The perturbation rebuilt in world space from each projection's own axes;
  // SURFACE_NORMAL then adds sfT (times the strength) to the normal.
  sfT = tw.x * ( vec3( 0.0, 0.0, tsx ) * ( tnx.x * 2.0 - 1.0 ) + vec3( 0.0, 1.0, 0.0 ) * ( tnx.y * 2.0 - 1.0 ) )
      + tw.y * ( vec3( 1.0, 0.0, 0.0 ) * ( tny.x * 2.0 - 1.0 ) + vec3( 0.0, 0.0, tsy ) * ( tny.y * 2.0 - 1.0 ) )
      + tw.z * ( vec3( tsz, 0.0, 0.0 ) * ( tnz.x * 2.0 - 1.0 ) + vec3( 0.0, 1.0, 0.0 ) * ( tnz.y * 2.0 - 1.0 ) );
  sfB = vec3( 0.0 );
  sfNrS.xy = vec2( 1.0, 0.5 );`;

// Each material carries userData.tile: how many local units one texture
// repeat covers, for geometry that is UV-mapped (builder.js). World-mapped
// materials ignore UVs, but keep the value so builders behave as before.
export function makeMaterials({ quality = 'high', anisotropy = 8 } = {}) {
  QUAL = quality;
  ANISO = anisotropy;
  const hi = quality !== 'low';
  const H = hi ? 1024 : 512, M = hi ? 512 : 256;
  const std = (o, tile = 6) => { const m = new THREE.MeshStandardMaterial(o); m.userData.tile = tile; return m; };
  const det = placeholder(hi ? 512 : 256, false, [128, 128, 128, 128]);
  surfShared.sfDet.value = det;
  pending.push(runJob('detailTex', [hi ? 512 : 256]).then((r) => fillIn(det, r.det)));

  // City walls: large fieldstones in rough courses, mud mortar (Broad Wall,
  // the walls of the City of David). Terraces and house plinths: smaller
  // stones, dry-laid. The Stepped Stone Structure: big stones.
  const rub = texSet('fieldstone', H, 4, [5, { N: H, S: 4, cw: 0.62, ch: 0.36, relief: 0.06, bevel: 0.1 }]);
  const ter = texSet('fieldstone', H, 4, [15, { N: H, S: 4, cw: 0.42, ch: 0.27, relief: 0.05, bevel: 0.07, mortar: null, joint: [0.008, 0.02], tint: [1.02, 1.0, 0.97] }]);
  const meg = texSet('fieldstone', M, 8, [16, { N: M, S: 8, cw: 1.25, ch: 0.75, relief: 0.1, bevel: 0.18, joint: [0.015, 0.04], warp: 0.1 }]);
  const deb = texSet('fieldstone', M, 3, [33, { N: M, S: 3, cw: 0.3, ch: 0.28, jx: 0.45, jy: 0.45, relief: 0.07, bevel: 0.06, mortar: null, dark: 0.3 }], [150, 140, 125]);
  const ash = texSet('ashlar', H, 4.2, [1, { N: H }]);
  const ashD = texSet('ashlar', M, 4.2, [2, { N: M, tone: [0.74, 0.68, 0.57], minLen: 1.0, maxLen: 2.2 }]);
  const pod = texSet('ashlar', M, 4.2, [9, { N: M, tone: [0.79, 0.74, 0.62], minLen: 1.2, maxLen: 2.6 }]);
  const burnt = texSet('burntAshlar', M, 4.2, [31, M], [120, 110, 95]);
  const pave = texSet('paving', H, 4, [4, H]);
  const plas = texSet('plasterField', M, 3, [41, { N: M, S: 3, wash: 1, straw: 0.4 }], [230, 225, 215]);
  const houseP = texSet('plasterField', H, 3, [42, { N: H, S: 3, base: [0.90, 0.86, 0.79], mud: [0.78, 0.70, 0.58], wash: 0.95, straw: 0.5 }], [235, 228, 215]);
  const roofE = texSet('earthField', M, 3, [43, { N: M, S: 3, color: [0.86, 0.80, 0.70], roller: true }]);
  const roofB = texSet('earthField', M, 4, [44, { N: M, S: 4, color: [0.70, 0.61, 0.49], roller: true }], [178, 155, 125]);
  const earthF = texSet('earthField', M, 4, [45, { N: M, S: 4, color: [0.72, 0.62, 0.48], roller: false, stones: 1.4 }], [183, 158, 122]);
  const rockT = texSet('rockField', M, 3, [51, M]);
  const cedarT = texSet('woodField', M, 2, [6, { N: M, color: [0.55, 0.32, 0.19] }], [140, 82, 48]);
  const timberT = texSet('woodField', M, 2, [7, { N: M, color: [0.45, 0.36, 0.27], grey: 0.7 }], [130, 118, 104]);
  // Light neutral textures for tinted props: the instance or vertex colour
  // gives the hue, the texture the grain.
  const woodN = texSet('woodField', M, 1.5, [8, { N: M, S: 1.5, boards: 3, color: [0.80, 0.76, 0.71], grey: 0.15, knots: 1 }], [190, 180, 170]);
  const potT = texSet('plasterField', M, 0.6, [46, { N: M, S: 0.6, base: [0.9, 0.9, 0.9], mud: [0.8, 0.79, 0.78], wash: 0.3, straw: 0, wheel: 1 }], [225, 225, 225]);
  const clothT = texSet('weaveField', M, 0.25, [47, { N: M, S: 0.25 }], [225, 225, 225]);
  const thatchT = texSet('strawField', M, 1, [48, { N: M, S: 1 }], [200, 175, 120]);
  const barkT = texSet('barkField', M, 1, [49, { N: M, S: 1 }], [120, 110, 100]);

  const [cedarMap, cedarBump] = carvedPanel('cedar');
  const [goldMap, goldBump] = carvedPanel('gold');
  const [palmMap, palmBump] = carvedPanel('stone');
  const water = waterNormals();
  water.repeat.set(1, 1);
  const plasterBump = grain(41);
  const earthBump = grain(42, 256, 700, 9000);
  const wood = (set, key, tile, o = {}) => surface(std({}, tile), key, set, { weather: 0, normal: 0.8, ...o });
  const prop = (set, key, color, o = {}) => surface(std({ color }, 1), key, set, { weather: 0, tri: true, tint: true, ...o });

  const m = {
    ashlar: surface(std({}, 6), 'ashlar', ash, { depth: 0.02 }),
    ashlarDark: surface(std({ color: 0xf4f0ea }, 8), 'ashlarDark', ashD, { depth: 0.02, offset: 1 }),
    podium: surface(std({}, 10), 'podium', pod, { depth: 0.02, offset: 2 }),
    pavement: surface(std({}, 8), 'pavement', pave, { depth: 0.025, weather: 0 }),
    rubble: surface(std({}, 6), 'rubble', rub, { depth: 0.07 }),
    plaster: surface(std({}, 10), 'plaster', plas, { normal: 0.8 }),
    earth: surface(std({}, 12), 'earth', earthF, { weather: 0 }),
    roof: surface(std({}, 10), 'roof', roofB, { weather: 0.5 }),
    cedar: wood(cedarT, 'cedar', 4),
    cedarCarved: std({ map: cedarMap, bumpMap: cedarBump, bumpScale: 3, roughness: 0.62 }, 10),
    palmStone: std({ map: palmMap, bumpMap: palmBump, bumpScale: 2, roughness: 0.85 }, 6),
    goldCarved: std({ map: goldMap, bumpMap: goldBump, bumpScale: 3, metalness: 0.9, roughness: 0.32 }, 10),
    gold: std({ color: 0xe0ae48, metalness: 1, roughness: 0.42, roughnessMap: plasterBump }, 4),
    goldFloor: std({ color: 0xd6a443, metalness: 0.25, roughness: 0.45, map: mottled(13, [240, 220, 170], 0.12) }, 6),
    bronze: std({ color: 0x9c6a3c, metalness: 0.9, roughness: 0.6, roughnessMap: earthBump, bumpMap: plasterBump, bumpScale: 0.4 }, 4),
    window: std({ map: lattice(), roughness: 0.9 }, 2),
    door: std({ map: cedarMap, bumpMap: cedarBump, bumpScale: 2, roughness: 0.6 }, 10),
    veil: new THREE.MeshStandardMaterial({ map: veilTex(), roughness: 0.95, side: THREE.DoubleSide }),
    water: makeWater(water, { color: 0x123f47, opacity: 0.9 }),
    waterFlow: makeWater(water, { flow: true, color: 0x1a4a4d, opacity: 0.86, strength: 0.28 }),
    fire: new THREE.SpriteMaterial({ map: flameTex(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    ember: new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 1 }),
    linen: std({ color: 0xf1ebdc, roughness: 1 }, 4),
    terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    house: surface(new THREE.MeshStandardMaterial({ vertexColors: true }), 'house', houseP, { roof: roofE, house: true, normal: 0.9 }),
    terraceStone: surface(std({}, 4), 'terraceStone', ter, { depth: 0.06 }),
    megalith: surface(std({}, 10), 'megalith', meg, { depth: 0.1 }),
    void: std({ color: 0x120d0a, roughness: 1 }, 2),
    shield: std({ color: 0x7a4e26, metalness: 0.55, roughness: 0.5 }, 1),
    straw: std({ color: 0xc9a650, roughness: 1 }, 2),
    figure: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true }),
    skin: new THREE.MeshStandardMaterial({ color: 0x8a5d40, roughness: 0.8 }),
    animal: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true }),
    olive: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, vertexColors: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 1, vertexColors: true }),
    // 573 BC: burned stone, fallen rubble, charred beams.
    ashlarBurnt: surface(std({}, 6), 'ashlarBurnt', burnt, { depth: 0.02 }),
    debris: surface(std({}, 1), 'debris', deb, { weather: 0, tri: true }),
    charcoal: std({ color: 0x1d1814, roughness: 1 }, 2),
    // Bare limestone and the low thorny scrub of the Judean hills.
    rock: surface(new THREE.MeshStandardMaterial({ vertexColors: true }), 'rock', rockT, { weather: 0, normal: 1.2, tri: true }),
    shrub: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, vertexColors: true }),
    deadSea: makeWater(water, { color: 0x1d5866, opacity: 1, scale: 0.04, strength: 0.1 }),
    // For detail modules. Box-mapped: timber (grey weathered boards), mud
    // plaster, whitewash. Projected from three sides and tinted by instance
    // or vertex colour (white where a geometry has none): wood, woodDark,
    // pottery, clay, cloth, thatch, bark.
    timber: wood(timberT, 'timber', 2),
    mudPlaster: surface(std({ color: 0xc7ad8c }, 4), 'mudPlaster', plas, { normal: 1, offset: 3 }),
    whitewash: surface(std({ color: 0xfffcf6 }, 4), 'whitewash', houseP, { normal: 0.8, offset: 4 }),
    wood: prop(woodN, 'wood', 0x9a7350),
    woodDark: prop(woodN, 'woodDark', 0x5a4232, { offset: 2 }),
    pottery: prop(potT, 'pottery', 0xb8714a, { normal: 0.6 }),
    clay: prop(potT, 'clay', 0xa86a48, { normal: 0.9, offset: 3 }),
    cloth: prop(clothT, 'cloth', 0xd9cfbc, { normal: 0.7 }),
    thatch: prop(thatchT, 'thatch', 0xffffff, { normal: 1.2 }),
    bark: prop(barkT, 'bark', 0xffffff, { normal: 1.3 }),
  };
  // Sky light from the environment (the real sky at this hour, and the ground
  // it lights) is the ambient for every surface.
  for (const mat of Object.values(m)) if (mat.isMeshStandardMaterial) mat.envMapIntensity = 1;
  // The terrain shader (terrain.js) blends these by slope, path and field.
  const ground = (args) => {
    const N = args[1], g = { a: placeholder(N, false, [128, 0, 128, 255]), n: placeholder(N, false, [128, 128, 240, 255]), S: args[2]?.S || 2.5 };
    pending.push(runJob('soilField', args).then((r) => { fillIn(g.a, r.a); fillIn(g.n, r.n); }));
    return g;
  };
  m.terrain.userData.ground = {
    soil: ground([61, hi ? 1024 : 512]),
    path: ground([62, hi ? 1024 : 512, { S: 2, pebbles: 0.35, cracks: 1, dung: 0.6 }]),
    rock: rockT,
    stone: ter,
    detail: surfShared.sfDet,
  };
  // Lamp light in doorways and windows after dark (city.js marks them).
  const houseCompile = m.house.onBeforeCompile;
  m.house.onBeforeCompile = function (shader, renderer) {
    houseCompile.call(this, shader, renderer);
    shader.uniforms.houseGlow = nightLights.houseGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWin;\nattribute float iLit;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aWin * iLit;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float houseGlow;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * vGlow * houseGlow;');
  };
  m.house.customProgramCacheKey = () => 'house-glow-v3';
  m.fire.color.setRGB(1.0, 0.85, 0.7);    // overlapping flames pass the bloom threshold
  m.veil.userData.tile = 1;
  m.water.userData.tile = 12;
  m.fire.userData.tile = 1;
  m.ember.userData.tile = 1;
  return m;
}

// --- Older canvas textures: carved panels, the veil, lattices, flames, water --
function speckle(ctx, w, h, n, rand, color, rMax = 1.6) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.05 + rand() * 0.18;
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, 0.3 + rand() * rMax, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// A tongue of flame: hot white-yellow core fading through orange to nothing.
function flameTex() {
  const [c, g] = canvas(64, 128);
  const grad = g.createRadialGradient(32, 104, 2, 32, 86, 60);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  grad.addColorStop(0.55, 'rgba(240,110,30,0.45)');
  grad.addColorStop(1, 'rgba(200,50,10,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(32, 2);
  g.bezierCurveTo(54, 50, 62, 92, 50, 116);
  g.quadraticCurveTo(32, 128, 14, 116);
  g.bezierCurveTo(2, 92, 10, 50, 32, 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Greyscale relief for metal.
function grain(seed, size = 256, blobs = 500, fine = 6000) {
  const rand = rng(seed);
  const [c, g] = canvas(size, size);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < blobs; i++) {
    const v = 100 + rand() * 60 | 0;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    const r = 3 + rand() * 14, x = rand() * size, y = rand() * size;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
    }
  }
  speckle(g, size, size, fine, rand, '#303030', 1.4);
  speckle(g, size, size, fine / 2, rand, '#e0e0e0', 1.2);
  return toTex(c, false);
}

// Mottled gold leaf on the floor of the house.
function mottled(seed, base, spread, size = 256) {
  const rand = rng(seed);
  const [c, g] = canvas(size, size);
  g.fillStyle = rgb(...base);
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const k = 1 + (rand() - 0.5) * spread;
    g.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k);
    g.globalAlpha = 0.25;
    const r = 4 + rand() * 18;
    const x = rand() * size, y = rand() * size;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
  speckle(g, size, size, 1500, rand, '#3b3226', 1);
  return toTex(c);
}

// Relief panel: a palm tree beside a two-faced cherub (Ezek 41:18-19;
// 1 Kgs 6:29), or two palms on stone for the gate jambs (Ezek 40:16).
// Returns [map, bump]. `look` is 'cedar', 'gold' or 'stone'.
function carvedPanel(look, size = 1024) {
  const [c, g] = canvas(size, size);
  const [cb, b] = canvas(size, size);
  const palette = {
    gold: [[196, 146, 52], [246, 210, 120], [120, 80, 20]],
    cedar: [[120, 66, 36], [170, 104, 60], [62, 30, 14]],
    stone: [[208, 192, 160], [234, 222, 194], [150, 132, 104]],
  };
  const [bg, hi, lo] = palette[look];
  const palmsOnly = look === 'stone';
  g.fillStyle = rgb(...bg); g.fillRect(0, 0, size, size);
  b.fillStyle = '#707070'; b.fillRect(0, 0, size, size);

  // Grain / hammered texture
  const rand = rng(look.length * 7);
  for (let i = 0; i < 400; i++) {
    g.strokeStyle = `rgba(${lo.join(',')},${0.05 + rand() * 0.12})`;
    g.lineWidth = 1 + rand() * 2;
    const x = rand() * size;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rand() - 0.5) * 20, size); g.stroke();
  }

  // Draw the same shapes on the colour map and (in grey) on the bump map.
  const both = (fn) => {
    for (const [ctx, col] of [[g, rgb(...hi)], [b, '#e0e0e0']]) {
      ctx.save();
      ctx.fillStyle = col; ctx.strokeStyle = col;
      fn(ctx);
      ctx.restore();
    }
  };

  both((ctx) => {
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, size - 18, size - 18);
    ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.stroke();
  });

  const palm = (cx) => both((ctx) => {
    for (let i = 0; i < 12; i++) {
      const y = size * 0.92 - i * 44;
      ctx.beginPath();
      ctx.ellipse(cx, y, 26 - i * 0.8, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    const top = size * 0.92 - 11 * 44;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.05 + i * 0.112);
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.quadraticCurveTo(cx + Math.cos(a) * 140, top - Math.sin(a) * 160, cx + Math.cos(a) * 210, top - Math.sin(a) * 60 + 60);
      ctx.stroke();
    }
    for (const dx of [-38, 38]) {
      ctx.beginPath(); ctx.arc(cx + dx, top + 40, 22, 0, Math.PI * 2); ctx.fill();
    }
  });

  palm(size * 0.25);
  if (palmsOnly) {
    palm(size * 0.75);
    return [toTex(c), toTex(cb, false)];
  }

  // Cherub (right half): body, raised wings, a man's face and a lion's face
  const cx = size * 0.75;
  both((ctx) => {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 30, size * 0.42);
      ctx.quadraticCurveTo(cx + s * 230, size * 0.18, cx + s * 210, size * 0.06);
      ctx.quadraticCurveTo(cx + s * 120, size * 0.28, cx + s * 20, size * 0.52);
      ctx.closePath(); ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 70, size * 0.92);
    ctx.lineTo(cx - 48, size * 0.44);
    ctx.lineTo(cx + 48, size * 0.44);
    ctx.lineTo(cx + 70, size * 0.92);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 34, size * 0.37, 40, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 34, size * 0.37, 46, 0, Math.PI * 2); ctx.fill();
  });
  // Shading details only on the colour map: feathers, lion mane, eyes
  g.strokeStyle = rgb(...lo);
  g.lineWidth = 5;
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * (40 + i * 22), size * (0.44 - i * 0.03));
      g.lineTo(cx + s * (70 + i * 26), size * (0.3 - i * 0.035));
      g.stroke();
    }
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + 34 + Math.cos(a) * 30, size * 0.37 + Math.sin(a) * 30);
    g.lineTo(cx + 34 + Math.cos(a) * 46, size * 0.37 + Math.sin(a) * 46);
    g.stroke();
  }
  g.fillStyle = rgb(...lo);
  g.beginPath(); g.arc(cx - 46, size * 0.36, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 48, size * 0.36, 5, 0, Math.PI * 2); g.fill();
  return [toTex(c), toTex(cb, false)];
}

// Woven veil of blue, purple and crimson with cherubim (2 Chr 3:14).
function veilTex(size = 512) {
  const [c, g] = canvas(size, size);
  const cols = ['#2a3f8f', '#5b2a6e', '#9a1f2c', '#ece4d0'];
  for (let i = 0; i < 64; i++) {
    g.fillStyle = cols[i % 4];
    g.fillRect(0, i * (size / 64), size, size / 64 + 1);
  }
  g.globalAlpha = 0.5;
  for (let i = 0; i < 64; i++) {
    g.fillStyle = cols[(i + 2) % 4];
    g.fillRect(i * (size / 64), 0, 2, size);
  }
  g.globalAlpha = 1;
  g.fillStyle = '#e8c96a';
  for (const [x, y] of [[0.3, 0.35], [0.7, 0.35], [0.5, 0.72]]) {
    g.beginPath();
    g.ellipse(x * size, y * size, 26, 52, 0, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(x * size, y * size - 20);
      g.quadraticCurveTo(x * size + s * 90, y * size - 90, x * size + s * 100, y * size - 30);
      g.lineTo(x * size, y * size);
      g.fill();
    }
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Lattice window.
function lattice(size = 128) {
  const [c, g] = canvas(size, size);
  g.fillStyle = '#120d08'; g.fillRect(0, 0, size, size);
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 7;
  for (let i = -size; i < size * 2; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + size, size); g.stroke();
    g.beginPath(); g.moveTo(i + size, 0); g.lineTo(i, size); g.stroke();
  }
  return toTex(c);
}

// Tileable value-noise normal map for water.
function waterNormals(size = 256) {
  const rand = rng(11);
  const grid = 16;
  const v = [];
  for (let i = 0; i < grid * grid; i++) v.push(rand());
  const h = new Float32Array(size * size);
  const at = (x, y) => v[((y % grid + grid) % grid) * grid + ((x % grid + grid) % grid)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, amp = 1, f = grid / size;
    for (let o = 0; o < 3; o++) {
      const fx = x * f, fy = y * f;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy), b2 = at(ix + 1, iy), c2 = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      s += amp * (a + (b2 - a) * sx + (c2 - a) * sy + (a - b2 - c2 + d) * sx * sy);
      amp *= 0.5; f *= 2;
    }
    h[y * size + x] = s;
  }
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hx = h[y * size + (x + 1) % size] - h[y * size + (x - 1 + size) % size];
    const hy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
    const nx = -hx * 6, ny = -hy * 6, nz2 = 1;
    const l = Math.hypot(nx, ny, nz2);
    const i = (y * size + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz2 / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(c, false);
}
