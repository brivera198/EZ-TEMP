// First-person movement: a body that walks, runs, jumps and falls through the
// world's solid meshes, a smooth flight for the Fly camera, and the input that
// drives both (mouse look with or without pointer lock, keys, a thumb stick and
// buttons for touch, a game controller).
//
// The movement core (CollisionWorld and Body) knows nothing of the page: it can
// be stepped with any time step, which is how it is tested.
import * as THREE from 'three';

// --- Collision world ------------------------------------------------------------
// The solid meshes are many, and many are InstancedMeshes (thousands of
// houses), so raycasting them all each step is slow. Instead each mesh, or each
// instance, becomes an entry with a world box, filed in a coarse grid over the
// ground plan. A query for a small box near the walker visits only the entries
// filed in the cells it overlaps, and reads their triangles in world space,
// which are worked out the first time they are needed and then kept.
const CELL = 8;           // metres, the coarse grid of entries
const BIN = 4;            // metres, the bins of triangles inside a large mesh
const BIG = 400;          // an entry over this many cells is kept on a short list instead
const BIN_OVER = 96;      // a mesh with more triangles than this gets bins
const CACHE_MAX = 8e6;    // floats of cached triangles before the cache is cleared
const TRI = 18;           // floats per gathered triangle: 9 corners, normal, box
const gkey = (i, j) => (i + 32768) * 65536 + (j + 32768);

const _m = new THREE.Matrix4();
const _box = new THREE.Box3();
const _v = new THREE.Vector3();

function transparentOnly(mesh) {
  const m = mesh.material;
  return Array.isArray(m) ? m.every((x) => x.transparent) : !!m?.transparent;
}

export class CollisionWorld {
  constructor(getMeshes, isShown) {
    this.getMeshes = getMeshes;
    this.isShown = isShown;
    this.infos = [];
    this.entries = [];
    this.grid = new Map();
    this.big = [];
    this.dynamic = [];
    this.cachedList = [];
    this.cached = 0;
    this.stamp = 1;
    this.tri = new Float32Array(TRI * 1024);
    this.n = 0;
    this.dirty = true;
    this.stats = { builds: 0, buildMs: 0, meshes: 0, entries: 0, cells: 0, big: 0, dynamic: 0, gathered: 0 };
  }

  // Once per frame: notice meshes added, moved or shown and hidden. A mesh
  // whose instances keep changing (a pool that follows the viewer) is tested
  // on its own each query rather than filed.
  sync() {
    const list = this.getMeshes();
    let rebuild = this.dirty || list.length !== this.infos.length;
    for (let i = 0; !rebuild && i < list.length; i++) {
      const m = list[i], inf = this.infos[i];
      if (inf.mesh !== m) { rebuild = true; break; }
      inf.shown = this.isShown(m);
      if (inf.dynamic || inf.skip) continue;
      if (m.isInstancedMesh ? (m.instanceMatrix.version !== inf.ver || m.count !== inf.cnt) : !sameMatrix(m.matrixWorld, inf.mw)) {
        inf.changes++;
        if (inf.changes > 2) inf.dynamic = true;
        rebuild = true;
      }
    }
    if (rebuild) this.build(list);
  }

  build(list) {
    const t0 = performance.now();
    const old = new Map(this.infos.map((inf) => [inf.mesh, inf]));
    for (const e of this.cachedList) e.tris = null;
    this.cachedList = [];
    this.cached = 0;
    this.infos = [];
    this.entries = [];
    this.grid = new Map();
    this.big = [];
    this.dynamic = [];
    for (const m of list) {
      const prev = old.get(m);
      m.updateWorldMatrix(true, false);
      const inf = {
        mesh: m, shown: this.isShown(m), ver: m.isInstancedMesh ? m.instanceMatrix.version : 0, cnt: m.count,
        mw: Array.from(m.matrixWorld.elements), changes: prev ? prev.changes : 0, dynamic: prev ? prev.dynamic : false,
        skip: transparentOnly(m) || !m.geometry?.attributes?.position,
      };
      this.infos.push(inf);
      if (inf.skip) continue;
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      if (inf.dynamic) { this.dynamic.push(inf); continue; }
      if (m.isInstancedMesh) {
        for (let k = 0; k < m.count; k++) {
          m.getMatrixAt(k, _m);
          if (Math.abs(_m.determinant()) < 1e-9) continue;           // a hidden (zero-scale) instance
          _m.premultiply(m.matrixWorld);
          this.file(inf, k, _box.copy(g.boundingBox).applyMatrix4(_m));
        }
      } else {
        this.file(inf, -1, _box.copy(g.boundingBox).applyMatrix4(m.matrixWorld));
      }
    }
    this.dirty = false;
    const s = this.stats;
    s.builds++;
    s.buildMs = performance.now() - t0;
    s.meshes = list.length; s.entries = this.entries.length; s.cells = this.grid.size; s.big = this.big.length; s.dynamic = this.dynamic.length;
  }

  file(inf, inst, b) {
    if (b.isEmpty()) return;
    const e = { inf, inst, x0: b.min.x, y0: b.min.y, z0: b.min.z, x1: b.max.x, y1: b.max.y, z1: b.max.z, tris: null, bins: null, marks: null, seen: 0 };
    const id = this.entries.push(e) - 1;
    const i0 = Math.floor(e.x0 / CELL), i1 = Math.floor(e.x1 / CELL), j0 = Math.floor(e.z0 / CELL), j1 = Math.floor(e.z1 / CELL);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > BIG) { this.big.push(e); return; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = gkey(i, j);
      const c = this.grid.get(k);
      if (c) c.push(id); else this.grid.set(k, [id]);
    }
  }

  // World-space triangles of an entry, worked out once.
  trisOf(e) {
    if (e.tris) return e.tris;
    const m = e.inf.mesh, g = m.geometry, pos = g.attributes.position, idx = g.index;
    if (e.inst >= 0) { m.getMatrixAt(e.inst, _m); _m.premultiply(m.matrixWorld); } else _m.copy(m.matrixWorld);
    const nv = pos.count, wp = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      wp[i * 3] = _v.x; wp[i * 3 + 1] = _v.y; wp[i * 3 + 2] = _v.z;
    }
    const nt = Math.floor((idx ? idx.count : nv) / 3);
    const t = new Float32Array(nt * 9);
    for (let i = 0; i < nt * 3; i++) {
      const a = (idx ? idx.getX(i) : i) * 3;
      t[i * 3] = wp[a]; t[i * 3 + 1] = wp[a + 1]; t[i * 3 + 2] = wp[a + 2];
    }
    if (nt > BIN_OVER) {
      const bins = new Map();
      for (let i = 0; i < nt; i++) {
        const o = i * 9;
        const x0 = Math.min(t[o], t[o + 3], t[o + 6]), x1 = Math.max(t[o], t[o + 3], t[o + 6]);
        const z0 = Math.min(t[o + 2], t[o + 5], t[o + 8]), z1 = Math.max(t[o + 2], t[o + 5], t[o + 8]);
        for (let a = Math.floor(x0 / BIN); a <= Math.floor(x1 / BIN); a++) for (let b = Math.floor(z0 / BIN); b <= Math.floor(z1 / BIN); b++) {
          const k = gkey(a, b);
          const c = bins.get(k);
          if (c) c.push(i); else bins.set(k, [i]);
        }
      }
      e.bins = bins;
      e.marks = new Uint32Array(nt);
    }
    if (e.inf.dynamic) return t;                     // not kept: it may move
    if (this.cached > CACHE_MAX) {
      for (const x of this.cachedList) { x.tris = null; x.bins = null; x.marks = null; }
      this.cachedList = [];
      this.cached = 0;
    }
    e.tris = t;
    this.cached += t.length;
    this.cachedList.push(e);
    return t;
  }

  // Gather every shown triangle that touches the box into this.tri (TRI floats each).
  gather(x0, y0, z0, x1, y1, z1) {
    const st = ++this.stamp;
    this.n = 0;
    this.q = [x0, y0, z0, x1, y1, z1];
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const c = this.grid.get(gkey(i, j));
        if (!c) continue;
        for (let k = 0; k < c.length; k++) {
          const e = this.entries[c[k]];
          if (e.seen === st) continue;
          e.seen = st;
          this.take(e, st);
        }
      }
    }
    for (const e of this.big) this.take(e, st);
    for (const inf of this.dynamic) {
      if (!inf.shown) continue;
      const m = inf.mesh, g = m.geometry;
      for (let k = m.isInstancedMesh ? 0 : -1; k < (m.isInstancedMesh ? m.count : 0); k++) {
        if (k >= 0) { m.getMatrixAt(k, _m); _m.premultiply(m.matrixWorld); } else _m.copy(m.matrixWorld);
        _box.copy(g.boundingBox).applyMatrix4(_m);
        const e = { inf, inst: k, x0: _box.min.x, y0: _box.min.y, z0: _box.min.z, x1: _box.max.x, y1: _box.max.y, z1: _box.max.z, tris: null };
        this.take(e, st);
      }
    }
    this.stats.gathered = this.n;
    return this.n;
  }

  take(e, st) {
    const q = this.q;
    if (!e.inf.shown || e.x0 > q[3] || e.x1 < q[0] || e.y0 > q[4] || e.y1 < q[1] || e.z0 > q[5] || e.z1 < q[2]) return;
    if (e.inst >= e.inf.mesh.count) return;
    const t = this.trisOf(e);
    if (e.bins) {
      for (let a = Math.floor(q[0] / BIN); a <= Math.floor(q[3] / BIN); a++) {
        for (let b = Math.floor(q[2] / BIN); b <= Math.floor(q[5] / BIN); b++) {
          const c = e.bins.get(gkey(a, b));
          if (!c) continue;
          for (let k = 0; k < c.length; k++) {
            const i = c[k];
            if (e.marks[i] === st) continue;
            e.marks[i] = st;
            this.add(t, i * 9);
          }
        }
      }
    } else {
      for (let o = 0; o < t.length; o += 9) this.add(t, o);
    }
  }

  add(t, o) {
    const q = this.q;
    const ax = t[o], ay = t[o + 1], az = t[o + 2], bx = t[o + 3], by = t[o + 4], bz = t[o + 5], cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
    const x0 = Math.min(ax, bx, cx), x1 = Math.max(ax, bx, cx);
    if (x0 > q[3] || x1 < q[0]) return;
    const z0 = Math.min(az, bz, cz), z1 = Math.max(az, bz, cz);
    if (z0 > q[5] || z1 < q[2]) return;
    const y0 = Math.min(ay, by, cy), y1 = Math.max(ay, by, cy);
    if (y0 > q[4] || y1 < q[1]) return;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    if (this.tri.length < (this.n + 1) * TRI) {
      const bigger = new Float32Array(this.tri.length * 2);
      bigger.set(this.tri);
      this.tri = bigger;
    }
    const p = this.tri, w = this.n * TRI;
    p[w] = ax; p[w + 1] = ay; p[w + 2] = az; p[w + 3] = bx; p[w + 4] = by; p[w + 5] = bz; p[w + 6] = cx; p[w + 7] = cy; p[w + 8] = cz;
    p[w + 9] = nx; p[w + 10] = ny; p[w + 11] = nz;
    p[w + 12] = x0; p[w + 13] = y0; p[w + 14] = z0; p[w + 15] = x1; p[w + 16] = y1; p[w + 17] = z1;
    this.n++;
  }
}

function sameMatrix(m, a) {
  const e = m.elements;
  for (let i = 0; i < 16; i++) if (e[i] !== a[i]) return false;
  return true;
}

// Closest point on triangle (a, b, c) to p (Ericson, Real-Time Collision
// Detection 5.1.5), written into out without allocating.
const cp = { x: 0, y: 0, z: 0 };
function closest(T, w, px, py, pz) {
  const ax = T[w], ay = T[w + 1], az = T[w + 2];
  const abx = T[w + 3] - ax, aby = T[w + 4] - ay, abz = T[w + 5] - az;
  const acx = T[w + 6] - ax, acy = T[w + 7] - ay, acz = T[w + 8] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { cp.x = ax; cp.y = ay; cp.z = az; return; }
  const bpx = px - T[w + 3], bpy = py - T[w + 4], bpz = pz - T[w + 5];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { cp.x = T[w + 3]; cp.y = T[w + 4]; cp.z = T[w + 5]; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); cp.x = ax + abx * v; cp.y = ay + aby * v; cp.z = az + abz * v; return; }
  const cpx = px - T[w + 6], cpy = py - T[w + 7], cpz = pz - T[w + 8];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { cp.x = T[w + 6]; cp.y = T[w + 7]; cp.z = T[w + 8]; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const v = d2 / (d2 - d6); cp.x = ax + acx * v; cp.y = ay + acy * v; cp.z = az + acz * v; return; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const v = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    cp.x = T[w + 3] + (T[w + 6] - T[w + 3]) * v; cp.y = T[w + 4] + (T[w + 7] - T[w + 4]) * v; cp.z = T[w + 5] + (T[w + 8] - T[w + 5]) * v;
    return;
  }
  const den = 1 / (va + vb + vc), v = vb * den, u = vc * den;
  cp.x = ax + abx * v + acx * u; cp.y = ay + aby * v + acy * u; cp.z = az + abz * v + acz * u;
}

// --- The body ------------------------------------------------------------------------
// A person 1.8 m tall and 0.7 m wide, eyes at 1.65 m. Walls are felt by three
// spheres up the body; anything under the lowest (knee height) is a step,
// taken by standing on whatever is highest under the feet.
export const BODY = {
  eye: 1.65,
  spheres: [[0.85, 0.35], [1.2, 0.35], [1.5, 0.3]],   // [height of centre, radius]
  radius: 0.35,
  stepUp: 0.5,
  stepDown: 0.55,
  maxSlope: 46,           // degrees: steeper ground cannot be stood on
  walk: 3.0,              // m/s: a brisk pace through the lanes
  run: 7.0,
  accel: 11,              // how quickly the pace is reached (1/s)
  stop: 13,               // how quickly it is lost when the keys are let go
  air: 1.6,               // control while in the air
  gravity: 16,
  jump: 4.6,              // m/s up: a jump of about 0.65 m
  coyote: 0.12,           // s after leaving an edge when a jump still counts
  buffer: 0.14,           // s a jump pressed early is kept
};

const PROBES = [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]];

export class Body {
  constructor(world, terrainY, opts = {}) {
    this.world = world;
    this.terrainY = terrainY;
    this.o = { ...BODY, ...opts };
    this.cosMax = Math.cos(THREE.MathUtils.degToRad(this.o.maxSlope));
    this.p = new THREE.Vector3();        // feet
    this.v = new THREE.Vector3();
    this.grounded = false;
    this.steep = false;
    this.air = 0;                        // time since last on the ground
    this.jumpWant = 0;
    this.landed = 0;                     // speed of the last landing, for the dip
    this.stepped = 0;                    // height of steps taken this update, for the camera
    this.gy = 0; this.gn = new THREE.Vector3(0, 1, 0); this.gTerrain = true;
    this.stats = { ms: 0, tris: 0, sub: 0 };
  }

  // Stand at (x, z) on the highest floor under `fromY` (or on the ground).
  place(x, z, fromY = Infinity) {
    const t = this.terrainY(x, z);
    const top = Number.isFinite(fromY) ? fromY : t + 400;
    this.world.gather(x - 0.4, t - 1, z - 0.4, x + 0.4, top, z + 0.4);
    this.ground(x, z, top);
    this.p.set(x, this.gy, z);
    this.v.set(0, 0, 0);
    this.grounded = true;
    this.air = 0;
    return this.p;
  }

  // Highest surface under (x, z) at or below `limit`, over the body's footprint.
  ground(x, z, limit) {
    let best = -Infinity, bn = null, terr = true, bx = x, bz = z;
    const T = this.world.tri, n = this.world.n;
    for (const [ox, oz] of PROBES) {
      const px = x + ox, pz = z + oz;
      const ty = this.terrainY(px, pz);
      if (ty > best) { best = ty; terr = true; bx = px; bz = pz; }
      for (let i = 0; i < n; i++) {
        const w = i * 18;
        if (px < T[w + 12] || px > T[w + 15] || pz < T[w + 14] || pz > T[w + 17] || T[w + 13] > limit) continue;
        const ny = T[w + 10];
        if (Math.abs(ny) < 0.05) continue;
        // inside the triangle seen from above?
        const ax = T[w], az = T[w + 2], bx2 = T[w + 3], bz2 = T[w + 5], cx = T[w + 6], cz = T[w + 8];
        const d0 = (bx2 - ax) * (pz - az) - (bz2 - az) * (px - ax);
        const d1 = (cx - bx2) * (pz - bz2) - (cz - bz2) * (px - bx2);
        const d2 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
        if ((d0 < 0 || d1 < 0 || d2 < 0) && (d0 > 0 || d1 > 0 || d2 > 0)) continue;
        const y = T[w + 1] - (T[w + 9] * (px - ax) + T[w + 11] * (pz - az)) / ny;
        if (y > limit || y <= best) continue;
        best = y; bn = w; terr = false;
      }
    }
    this.gy = best;
    this.gTerrain = terr;
    if (terr) {
      const e = 0.4, f = this.terrainY;
      this.gn.set(f(bx - e, bz) - f(bx + e, bz), 2 * e, f(bx, bz - e) - f(bx, bz + e)).normalize();
    } else {
      const s = T[bn + 10] < 0 ? -1 : 1;
      this.gn.set(T[bn + 9] * s, T[bn + 10] * s, T[bn + 11] * s);
    }
    return best;
  }

  // input: { x, z } wished direction in the world (length up to 1), run, jump (pressed this update).
  update(dt, input) {
    const t0 = performance.now();
    const o = this.o, p = this.p, v = this.v;
    if (input.jump) this.jumpWant = o.buffer;
    const reach = (Math.hypot(v.x, v.z) + o.run) * dt + 0.8;
    const fall = Math.max(0, -v.y) * dt + 0.3;
    this.world.gather(p.x - reach, p.y - o.stepDown - fall - 0.1, p.z - reach, p.x + reach, p.y + 2.1 + Math.max(0, v.y) * dt, p.z + reach);
    this.stats.tris = this.world.n;
    const n = Math.min(10, Math.max(1, Math.ceil(dt / (1 / 120)), Math.ceil(Math.hypot(v.x, v.y, v.z) * dt / 0.12)));
    const h = dt / n;
    this.stepped = 0;
    this.landed = 0;
    for (let i = 0; i < n; i++) this.sub(h, input);
    this.stats.sub = n;
    this.stats.ms = performance.now() - t0;
    return p;
  }

  sub(h, input) {
    const o = this.o, p = this.p, v = this.v;
    // Pace: ease toward the wished velocity; quicker to stop than to start.
    let wx = input.x || 0, wz = input.z || 0;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const speed = input.run ? o.run : o.walk;
    const k = this.grounded ? (wl > 0.05 ? o.accel : o.stop) : o.air;
    const a = 1 - Math.exp(-k * h);
    v.x += (wx * speed - v.x) * a;
    v.z += (wz * speed - v.z) * a;

    this.jumpWant = Math.max(0, this.jumpWant - h);
    if (this.jumpWant > 0 && (this.grounded || this.air < o.coyote) && !this.steep && v.y <= 0.01) {
      v.y = o.jump;
      this.grounded = false;
      this.air = o.coyote;
      this.jumpWant = 0;
    }
    if (!this.grounded) v.y -= o.gravity * h;
    this.air = this.grounded ? 0 : this.air + h;

    // Across: move, then out of whatever the body overlaps.
    const ox = p.x, oz = p.z;
    p.x += v.x * h;
    p.z += v.z * h;
    this.walls();

    // Up and down.
    const prevY = p.y;
    p.y += v.y * h;
    // Anything under the knee is a step, also when coming down from a jump
    // (that is how a ledge is climbed); nothing is landed on while rising.
    const limit = this.grounded || v.y <= 0 ? prevY + o.stepUp : p.y + 0.02;
    let g = this.ground(p.x, p.z, limit);
    let stand = this.gn.y >= this.cosMax;
    // Ground too steep to climb: refuse the uphill part of the move.
    if (this.grounded && !stand && g > prevY + 0.02) {
      const hx = this.gn.x, hz = this.gn.z, hl = Math.hypot(hx, hz) || 1;
      const ux = -hx / hl, uz = -hz / hl;           // uphill
      const up = (p.x - ox) * ux + (p.z - oz) * uz;
      if (up > 0) { p.x -= up * ux; p.z -= up * uz; }
      const vu = v.x * ux + v.z * uz;
      if (vu > 0) { v.x -= vu * ux; v.z -= vu * uz; }
      this.walls();
      g = this.ground(p.x, p.z, limit);
      stand = this.gn.y >= this.cosMax;
    }
    if (this.grounded && v.y <= 0 && g >= p.y - o.stepDown && g <= prevY + o.stepUp) {
      if (stand) {
        this.stepped += g - p.y;
        p.y = g;
        v.y = 0;
        this.steep = false;
      } else this.slide(g, h);
    } else if (p.y <= g) {
      if (stand) {
        this.landed = Math.max(this.landed, -v.y);
        this.stepped += g - p.y;
        p.y = g;
        v.y = 0;
        this.grounded = true;
        this.steep = false;
      } else this.slide(g, h);
    } else {
      this.grounded = false;
      this.steep = false;
    }
    // Never under the ground.
    const ty = this.terrainY(p.x, p.z);
    if (p.y < ty) { this.stepped += ty - p.y; p.y = ty; if (v.y < 0) v.y = 0; }
  }

  // On ground too steep to stand on: rest on it, and slip down it.
  slide(g, h) {
    const p = this.p, v = this.v, n = this.gn;
    p.y = Math.max(p.y, g);
    if (v.y < 0) v.y = 0;
    this.grounded = false;
    this.steep = true;
    const hl = Math.hypot(n.x, n.z) || 1;
    const dx = n.x / hl, dz = n.z / hl;              // downhill
    const into = v.x * dx + v.z * dz;
    if (into < 0) { v.x -= into * dx; v.z -= into * dz; }
    const s = this.o.gravity * hl * h;
    v.x += dx * s;
    v.z += dz * s;
  }

  // Push the body's spheres out of the walls they overlap, sideways only, and
  // take the speed out of the push so the body slides along.
  walls() {
    const T = this.world.tri, n = this.world.n, p = this.p, v = this.v;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const [sh, r] of this.o.spheres) {
        const cx = p.x, cy = p.y + sh, cz = p.z;
        for (let i = 0; i < n; i++) {
          const w = i * 18;
          if (cx + r < T[w + 12] || cx - r > T[w + 15] || cy + r < T[w + 13] || cy - r > T[w + 16] || cz + r < T[w + 14] || cz - r > T[w + 17]) continue;
          closest(T, w, p.x, cy, p.z);
          const dx = p.x - cp.x, dy = cy - cp.y, dz = p.z - cp.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= r * r) continue;
          const ny = Math.abs(T[w + 10]);
          if (ny >= this.cosMax && cp.y < cy) continue;          // a floor: the feet deal with it
          if (cp.y > cy && dy < 0 && v.y > 0 && ny > 0.5) v.y = 0;  // a ceiling: stop rising
          let hx = dx, hz = dz, hl = Math.hypot(dx, dz);
          if (hl < 1e-4) {
            hx = T[w + 9]; hz = T[w + 11]; hl = Math.hypot(hx, hz);
            if (hl < 0.2) continue;                                   // flat overhead: nothing to push from
            if (hx * (v.x || 1e-6) + hz * v.z > 0) { hx = -hx; hz = -hz; }
          }
          hx /= hl; hz /= hl;
          const need = Math.sqrt(Math.max(r * r - dy * dy, 0));
          const push = Math.min(need - (Math.hypot(dx, dz) < 1e-4 ? 0 : hl), r) + 1e-4;
          if (push <= 0) continue;
          p.x += hx * push;
          p.z += hz * push;
          const vn = v.x * hx + v.z * hz;
          if (vn < 0) { v.x -= vn * hx; v.z -= vn * hz; }
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
}

// --- The camera on the body ----------------------------------------------------------
// Eyes follow the feet with the bumps smoothed out (steps, landings), and bob
// with the stride while moving.
export class Head {
  constructor() {
    this.lag = 0;        // eyes behind the feet after a step, in metres
    this.dip = 0; this.dipV = 0;
    this.phase = 0;      // in steps
    this.amount = 0;     // how much bob, eased with the pace
    this.fovAdd = 0;
    this.bob = 0; this.sway = 0;
  }
  reset() { this.lag = this.dip = this.dipV = this.amount = this.fovAdd = this.bob = this.sway = 0; }
  update(dt, body, still) {
    // Only real steps: following a slope needs no smoothing.
    if (Math.abs(body.stepped) > 0.04) this.lag = Math.max(-0.6, Math.min(0.6, this.lag - body.stepped));
    this.lag *= Math.exp(-dt * 13);
    if (body.landed > 2 && !still) this.dipV -= Math.min(body.landed, 10) * 0.32;
    const k = 140, c = 2 * Math.sqrt(k);
    this.dipV += (-k * this.dip - c * this.dipV) * Math.min(dt, 0.05);
    this.dip = Math.max(-0.25, this.dip + this.dipV * Math.min(dt, 0.05));
    const sp = Math.hypot(body.v.x, body.v.z);
    const o = body.o;
    const stride = sp > o.walk + 0.5 ? 1.25 : 0.78;   // metres per step
    this.phase += sp * dt / stride;
    const want = still || !body.grounded ? 0 : Math.min(1, sp / o.walk);
    this.amount += (want - this.amount) * (1 - Math.exp(-dt * 8));
    const run = Math.max(0, Math.min(1, (sp - o.walk) / (o.run - o.walk)));
    const a = this.amount * (0.03 + 0.025 * run);
    this.bob = -a * Math.cos(this.phase * 2 * Math.PI);
    this.sway = this.amount * 0.018 * Math.sin(this.phase * Math.PI);
    const fov = still ? 0 : run * 4;
    this.fovAdd += (fov - this.fovAdd) * (1 - Math.exp(-dt * 5));
    if (still) { this.dip = 0; this.dipV = 0; }
    return this.lag + this.dip + this.bob;
  }
}

// --- Flight ----------------------------------------------------------------------
// Smooth flight: the velocity eases toward where the keys point.
export function flyStep(f, dt, dir, speed) {
  const a = 1 - Math.exp(-(dir.lengthSq() > 0 ? 5 : 4) * dt);
  f.v.x += (dir.x * speed - f.v.x) * a;
  f.v.y += (dir.y * speed - f.v.y) * a;
  f.v.z += (dir.z * speed - f.v.z) * a;
  return f.v;
}

// --- Input -----------------------------------------------------------------------
// Looking: pointer lock where the browser gives it (desktop, not in a frame
// that forbids it), dragging otherwise; on touch, a thumb stick that appears
// where the left thumb lands, look by dragging with another finger, and
// buttons for jump, run and (flying) up and down.
export class Controls {
  constructor({ canvas, pad, stick, keys, look, active, flying, pick, onLock, onTouch }) {
    Object.assign(this, { canvas, pad, stickEl: stick, keys, view: look, active, flying, pick, onLock, onTouch });
    this.locked = false;
    this.lockDenied = false;
    this.lockAt = -1e9;       // when the lock last changed (to drop the jump some browsers give)
    this.unlockAt = -1e9;
    this.pointers = new Map();
    this.stick = { id: null, x: 0, y: 0, ox: 0, oy: 0, r: 60 };
    this.lookId = null;
    this.jumpQ = false;
    this.runOn = false;
    this.touch = false;       // the last input was a touch
    this.pad1 = null;          // game controller in use
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.bind();
  }

  // Ask for the pointer: only on a desktop pointer, only from a user's click.
  lock() {
    if (this.touch || this.lockDenied || this.locked || !this.canvas.requestPointerLock) return;
    let r;
    try { r = this.canvas.requestPointerLock(); } catch { this.denied(); return; }
    if (r && typeof r.catch === 'function') r.catch(() => this.denied());
    // Some frames neither grant nor refuse: treat silence as a refusal.
    clearTimeout(this.lockTimer);
    this.lockTimer = setTimeout(() => { if (!this.locked) this.denied(); }, 1200);
  }
  denied() {
    clearTimeout(this.lockTimer);
    if (this.locked) return;
    this.lockDenied = true;
    this.onLock?.();
  }
  unlock() {
    clearTimeout(this.lockTimer);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  setTouch(on) {
    if (on === this.touch) return;
    this.touch = on;
    this.pad.classList.toggle('touch', on);
    this.onTouch?.(on);
  }

  bind() {
    const c = this.canvas;
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === c;
      if (this.locked) clearTimeout(this.lockTimer);
      this.lockAt = performance.now();
      if (was && !this.locked) this.unlockAt = this.lockAt;
      document.body.classList.toggle('pointer-locked', this.locked);
      this.onLock?.();
    });
    document.addEventListener('pointerlockerror', () => this.denied());

    // While walking or flying the canvas's pointer events are ours: they are
    // caught on the way down, before the orbit and the picking see them.
    const own = (e) => this.active() && (e.target === c || this.pointers.has(e.pointerId));
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') this.setTouch(true);
      else if (e.pointerType === 'mouse') this.setTouch(false);
      if (!own(e)) return;
      e.stopPropagation();
      e.preventDefault();
      if (this.locked) { if (e.button === 0) this.pointers.set(e.pointerId, { kind: 'locked' }); return; }
      const r = c.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const P = { kind: 'look', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: 0 };
      // The left thumb in the lower left: a stick, wherever it lands there.
      if (e.pointerType !== 'mouse' && this.stick.id === null && fx < 0.42 && fy > 0.38) {
        P.kind = 'stick';
        const s = this.stick;
        s.id = e.pointerId;
        s.r = Math.max(44, Math.min(80, Math.min(r.width, r.height) * 0.085));
        s.ox = e.clientX; s.oy = e.clientY; s.x = 0; s.y = 0;
        this.showStick();
      } else if (this.lookId === null) {
        this.lookId = e.pointerId;
      } else P.kind = 'extra';
      this.pointers.set(e.pointerId, P);
      try { c.setPointerCapture(e.pointerId); } catch { /* the pointer may be gone already */ }
    }, true);

    addEventListener('pointermove', (e) => {
      if (this.locked && this.active() && e.target === c) {
        // The first moves after the lock is taken can carry the whole jump of
        // the cursor: drop them, and anything absurd.
        if (performance.now() - this.lockAt < 80 || Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
        this.turn(e.movementX * 0.0022, e.movementY * 0.0022);
        return;
      }
      const P = this.pointers.get(e.pointerId);
      if (!P || !this.active()) return;
      e.stopPropagation();
      e.preventDefault();
      const dx = e.clientX - P.x, dy = e.clientY - P.y;
      P.x = e.clientX; P.y = e.clientY;
      P.moved = Math.max(P.moved, Math.hypot(e.clientX - P.x0, e.clientY - P.y0));
      if (P.kind === 'stick') {
        const s = this.stick;
        let sx = (e.clientX - s.ox) / s.r, sy = (e.clientY - s.oy) / s.r;
        const l = Math.hypot(sx, sy);
        // Past the rim the stick follows the thumb, so it never runs out.
        if (l > 1) { s.ox += (sx - sx / l) * s.r; s.oy += (sy - sy / l) * s.r; sx /= l; sy /= l; }
        s.x = sx; s.y = sy;
        this.showStick();
      } else if (P.kind === 'look') {
        if (e.pointerType === 'mouse') this.turn(dx * 0.0042, dy * 0.0042);
        else {
          // On touch, a fraction of the screen turns the same whatever its size.
          const w = c.clientWidth || 1;
          this.turn(dx / w * 3.2, dy / w * 3.2);
        }
      }
    }, true);

    const end = (e) => {
      const P = this.pointers.get(e.pointerId);
      if (!P) return;
      this.pointers.delete(e.pointerId);
      if (!this.active()) { this.release(e.pointerId); return; }
      e.stopPropagation();
      if (P.kind === 'locked') {
        if (e.type === 'pointerup') {
          const r = c.getBoundingClientRect();
          this.pick(r.left + r.width / 2, r.top + r.height / 2);
        }
      } else if (e.type === 'pointerup' && P.moved < 8 && performance.now() - P.t < 600 && P.kind !== 'stick') {
        // A tap: a mouse click takes the pointer again (the first time it may
        // be refused, and then clicks pick); a tap or a refused click picks.
        if (e.pointerType === 'mouse' && !this.lockDenied && !this.touch) this.lock();
        else this.pick(e.clientX, e.clientY);
      }
      this.release(e.pointerId);
    };
    for (const t of ['pointerup', 'pointercancel']) addEventListener(t, end, true);
    addEventListener('blur', () => { for (const id of [...this.pointers.keys()]) this.release(id); this.pointers.clear(); });
    c.addEventListener('contextmenu', (e) => { if (this.active()) e.preventDefault(); });

    // Touch buttons: each held by its own finger.
    for (const b of this.pad.querySelectorAll('button[data-k]')) {
      const k = b.dataset.k;
      const code = { u: 'KeyE', d: 'KeyQ' }[k];
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setTouch(e.pointerType !== 'mouse' || this.touch);
        try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        b.classList.add('held');
        if (k === 'jump') this.jumpQ = true;
        else if (k === 'run') { this.runOn = !this.runOn; b.setAttribute('aria-pressed', String(this.runOn)); }
        else if (code) this.keys.add('Pad' + code);
      });
      const up = () => { b.classList.remove('held'); if (code) this.keys.delete('Pad' + code); };
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    this.pad.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    addEventListener('gamepadconnected', (e) => { this.pad1 = e.gamepad.index; });
    addEventListener('gamepaddisconnected', () => { this.pad1 = null; });
  }

  release(id) {
    if (id === this.lookId) this.lookId = null;
    if (id === this.stick.id) { this.stick.id = null; this.stick.x = this.stick.y = 0; this.showStick(); }
    try { if (this.canvas.hasPointerCapture?.(id)) this.canvas.releasePointerCapture(id); } catch { /* ignore */ }
  }

  // Let go of everything (on leaving the mode).
  reset() {
    for (const id of [...this.pointers.keys()]) this.release(id);
    this.pointers.clear();
    this.lookId = null;
    this.jumpQ = false;
    this.stick.id = null; this.stick.x = this.stick.y = 0;
    this.showStick();
  }

  showStick() {
    const el = this.stickEl, s = this.stick;
    if (!el) return;
    const on = s.id !== null;
    el.classList.toggle('on', on);
    if (!on) { el.style.removeProperty('--sx'); return; }
    const r = this.canvas.getBoundingClientRect();
    el.style.setProperty('--sx', (s.ox - r.left) + 'px');
    el.style.setProperty('--sy', (s.oy - r.top) + 'px');
    el.style.setProperty('--sr', s.r + 'px');
    el.style.setProperty('--kx', (s.x * s.r) + 'px');
    el.style.setProperty('--ky', (s.y * s.r) + 'px');
  }

  turn(dyaw, dpitch) {
    const lim = this.flying() ? 1.55 : 1.45;
    this.view.yaw += dyaw;
    this.view.pitch = Math.max(-lim, Math.min(lim, this.view.pitch - dpitch));
  }

  // Everything that moves the body this frame, as one input.
  read(dt) {
    const k = this.keys, held = (...c) => c.some((x) => k.has(x));
    if (held('ArrowLeft')) this.turn(-1.7 * dt, 0);
    if (held('ArrowRight')) this.turn(1.7 * dt, 0);
    let f = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
    let s = (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0);
    let u = (held('KeyE', 'Space', 'PageUp', 'PadKeyE') ? 1 : 0) - (held('KeyQ', 'KeyC', 'PageDown', 'PadKeyQ') ? 1 : 0);
    let run = held('ShiftLeft', 'ShiftRight') || this.runOn;
    let jump = this.jumpQ;
    this.jumpQ = false;
    if (f || s) { const l = Math.hypot(f, s); f /= l; s /= l; }      // diagonals no faster
    // The stick: how far it is pushed is how fast.
    const st = this.stick;
    if (st.id !== null) {
      const l = Math.hypot(st.x, st.y);
      const m = l < 0.12 ? 0 : (l - 0.12) / 0.88 / l;
      f -= st.y * m; s += st.x * m;
    }
    // A game controller, in the standard mapping.
    const gp = this.pad1 !== null && navigator.getGamepads ? navigator.getGamepads()[this.pad1] : null;
    if (gp && gp.mapping === 'standard') {
      const dz = (a) => (Math.abs(a) < 0.15 ? 0 : Math.sign(a) * (Math.abs(a) - 0.15) / 0.85);
      const lx = dz(gp.axes[0]), ly = dz(gp.axes[1]), rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
      f -= ly; s += lx;
      this.turn(rx * Math.abs(rx) * 2.6 * dt, ry * Math.abs(ry) * 1.9 * dt);
      const b = (i) => !!gp.buttons[i]?.pressed;
      if (b(0) && !this.gpA) jump = true;
      this.gpA = b(0);
      if (b(10) || b(5)) run = true;
      u += (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0) + (b(0) ? 1 : 0) - (b(1) ? 1 : 0);
    }
    return { f, s, u: Math.max(-1, Math.min(1, u)), run, jump };
  }
}
