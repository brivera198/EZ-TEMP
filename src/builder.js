// Collects geometry per material, merges it into a few meshes, and records
// clickable "zones" (axis-aligned boxes) that link the model to INFO cards.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Box with UVs scaled to `tile` units per texture repeat and offset by the
// box's position, so neighbouring boxes continue the masonry pattern.
export function boxGeom(w, h, d, tile, x0 = 0, y0 = 0, z0 = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const face = [
    [d, h, z0, y0], [d, h, z0, y0], // +x, -x
    [w, d, x0, z0], [w, d, x0, z0], // +y, -y
    [w, h, x0, y0], [w, h, x0, y0], // +z, -z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv, ou, ov] = face[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * su + ou) / tile, (uv.getY(k) * sv + ov) / tile);
    }
  }
  return g;
}

// Proto-Aeolic capital: the Iron Age volute capital found in the City of
// David, Ramat Rahel, Samaria and Megiddo. Width W, base at y = 0, facing +z.
export function aeolicCapital(W) {
  const D = 0.3 * W;
  const parts = [];
  const add = (g, x, y, z) => { g.translate(x, y, z); parts.push(g.index ? g.toNonIndexed() : g); };
  add(new THREE.BoxGeometry(W, 0.14 * W, D * 1.1), 0, 0.6 * W, 0);                 // abacus
  for (const s of [-1, 1]) {
    const vol = new THREE.CylinderGeometry(0.21 * W, 0.21 * W, D, 20);              // volutes
    vol.rotateX(Math.PI / 2);
    add(vol, s * 0.27 * W, 0.32 * W, 0);
    const eye = new THREE.CylinderGeometry(0.075 * W, 0.075 * W, D * 1.18, 12);
    eye.rotateX(Math.PI / 2);
    add(eye, s * 0.27 * W, 0.32 * W, 0);
  }
  const tri = new THREE.Shape();
  tri.moveTo(-0.22 * W, 0.53 * W);
  tri.lineTo(0.22 * W, 0.53 * W);
  tri.lineTo(0, 0.1 * W);
  tri.closePath();
  add(new THREE.ExtrudeGeometry(tri, { depth: D, bevelEnabled: false }), 0, 0, -D / 2);
  add(new THREE.BoxGeometry(0.46 * W, 0.1 * W, D), 0, 0.05 * W, 0);               // neck band
  return mergeGeometries(parts.map((g) => {
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    return g;
  }));
}

// Box with one vertex colour, for small instanced models.
export function cbox(x0, x1, y0, y1, z0, z1, col) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return paint(g, col);
}

export function paint(g, [r, gg, b]) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// Merge non-indexed parts that carry position, normal, uv and colour.
export function mergeParts(parts) {
  return mergeGeometries(parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) n.deleteAttribute(name);
    if (!n.attributes.color) paint(n, [1, 1, 1]);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    return n;
  }));
}

// Half-ellipsoid mound of fallen stone, base on y = 0.
function mound(rand) {
  const g = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + rand() * 0.35;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * (0.7 + rand() * 0.5), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

export class Builder {
  // `ruin` turns the same plan into a burned ruin: { rand, levels, drop, map,
  // zoneMap }. Walls standing on one of `levels` break off at random heights
  // and spill rubble; anything in `drop` (roofs, wood, metal) is gone.
  constructor(mats, { ruin = null } = {}) {
    this.mats = mats;
    this.parts = {};
    this.zones = [];
    this.tag = null;      // part type for the colour-coded vision overlay
    this.ruin = ruin;
  }

  tile(key) { return this.mats[key].userData.tile || 6; }

  add(key, geom) {
    if (this.ruin && this.ruin.drop.has(key)) { geom.dispose(); return; }
    geom.userData.tag = this.tag;
    (this.parts[key] ||= []).push(geom);
  }

  // Axis-aligned box from two corners.
  box(key, x0, x1, y0, y1, z0, z1) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    if (x1 - x0 <= 0 || y1 - y0 <= 0 || z1 - z0 <= 0) return;
    if (this.ruin) this.ruinBox(key, x0, x1, y0, y1, z0, z1);
    else this.solidBox(key, x0, x1, y0, y1, z0, z1);
  }

  solidBox(key, x0, x1, y0, y1, z0, z1) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const g = boxGeom(w, h, d, this.tile(key), x0, y0, z0);
    g.translate(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    this.add(key, g);
  }

  ruinBox(key, x0, x1, y0, y1, z0, z1) {
    const R = this.ruin;
    if (R.drop.has(key)) return;
    const grounded = R.levels.some((l) => y0 > l - 0.8 && y0 < l + 0.4);
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const thin = Math.min(w, d);
    // Lintels, upper storeys and copings fell with the burning roof.
    if (!grounded) return;
    key = R.map[key] || key;
    // Platforms and floors stay; walls (thin, or long ranges of rooms) break.
    const wall = h >= 2.5 && (thin <= 8 || (thin <= 16 && Math.max(w, d) / thin >= 2.5));
    if (!wall) { this.solidBox(key, x0, x1, y0, y1, z0, z1); return; }
    // A wall: broken off along its length at heights that wander, its top
    // courses stepping down where stones fell, the rubble heaped at its foot.
    const alongX = w >= d;
    const len = alongX ? w : d;
    const n = Math.max(1, Math.round(len / (2.5 + R.rand() * 1.5)));
    const ph1 = R.rand() * 6.28, ph2 = R.rand() * 6.28, keep = 0.25 + R.rand() * 0.45;
    const part = (a0, a1, b0, b1) => (alongX ? this.solidBox(key, a0, a1, b0, b1, z0, z1) : this.solidBox(key, x0, x1, b0, b1, a0, a1));
    for (let i = 0; i < n; i++) {
      const a0 = (alongX ? x0 : z0) + len * i / n, a1 = (alongX ? x0 : z0) + len * (i + 1) / n;
      const t = (a0 + a1) / 2;
      const wave = 0.5 + 0.5 * Math.sin(t * 0.17 + ph1) * Math.cos(t * 0.071 + ph2);
      const frac = Math.max(0.04, Math.min(1, keep * (0.25 + 1.1 * wave) + (R.rand() - 0.5) * 0.12));
      const top = Math.min(y1, y0 + 0.5 + Math.round(h * frac));
      part(a0, a1, y0, top);
      // One course more over part of the stub, so the break is ragged.
      if (top + 1 <= y1 && R.rand() < 0.6) {
        const cut = a0 + (a1 - a0) * (0.25 + R.rand() * 0.5);
        if (R.rand() < 0.5) part(a0, cut, top, top + 1); else part(cut, a1, top, top + 1);
      }
      const fallen = y1 - top;
      if (fallen < 1.5) continue;
      for (const side of [-1, 1]) {
        if (R.rand() < 0.25) continue;
        const g = mound(R.rand);
        const spread = thin * 0.5 + Math.min(4, fallen * 0.22);
        const lx = (a1 - a0) * (0.55 + R.rand() * 0.3), ly = Math.min(3.2, 0.5 + fallen * 0.1), lz = spread;
        const c = (a0 + a1) / 2;
        if (alongX) { g.scale(lx, ly, lz); g.translate(c, y0 - 0.1, (side > 0 ? z1 : z0) + side * spread * 0.15); }
        else { g.scale(lz, ly, lx); g.translate((side > 0 ? x1 : x0) + side * spread * 0.15, y0 - 0.1, c); }
        this.add('debris', g);
      }
    }
  }

  // Any geometry, placed with position / rotation-y / scale.
  geom(key, g, x = 0, y = 0, z = 0, ry = 0, s = 1) {
    if (this.ruin) {
      g.dispose();
      return;   // statues, bronze, wood: burned or carried off
    }
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
      new THREE.Vector3(s, s, s));
    g.applyMatrix4(m);
    this.add(key, g);
  }

  // Ruin debris placed directly (burned beams and the like).
  debris(key, g) {
    (this.parts[key] ||= []).push(g);
  }

  zone(id, x0, x1, y0, y1, z0, z1) {
    if (this.ruin) {
      id = this.ruin.zoneMap[id] === undefined ? id : this.ruin.zoneMap[id];
      if (!id) return;
    }
    this.zones.push({
      id,
      box: new THREE.Box3(
        new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
        new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1))),
    });
  }

  // Merge into `group`; zones are converted to world space.
  finish(group, { noShadow = [] } = {}) {
    for (const [key, list] of Object.entries(this.parts)) {
      const prepped = list.map((g) => {
        const n = g.index ? g.toNonIndexed() : g;
        for (const name of Object.keys(n.attributes)) {
          if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
        }
        if (!n.attributes.uv) {
          n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
        }
        return n;
      });
      const merged = mergeGeometries(prepped, false);
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, this.mats[key]);
      mesh.name = key;
      const transparent = this.mats[key].transparent;
      mesh.castShadow = !transparent && !noShadow.includes(key);
      mesh.receiveShadow = !transparent;
      mesh.userData.matKey = key;
      group.add(mesh);
    }
    return this.takeZones(group);
  }

  takeZones(group) {
    group.updateMatrixWorld(true);
    const zones = this.zones.map((z) => ({ id: z.id, box: z.box.clone().applyMatrix4(group.matrixWorld) }));
    this.parts = {};
    this.zones = [];
    return zones;
  }

  // Merge by part type instead of material, for the vision overlay. `looks`
  // maps a tag to { face, xray, line, lineX } materials; keys in `skip`
  // (thin panels, windows, fire) are left out.
  finishVision(group, looks, skip) {
    const byTag = {};
    for (const [key, list] of Object.entries(this.parts)) {
      for (const g of list) {
        if (skip.has(key)) { g.dispose(); continue; }
        (byTag[g.userData.tag || 'wall'] ||= []).push(g);
      }
    }
    for (const [tag, list] of Object.entries(byTag)) {
      const look = looks[tag] || looks.wall;
      const merged = mergeGeometries(list.map((g) => {
        const n = g.index ? g.toNonIndexed() : g;
        for (const name of Object.keys(n.attributes)) if (!['position', 'normal'].includes(name)) n.deleteAttribute(name);
        return n;
      }), false);
      list.forEach((g) => g.dispose());
      const face = new THREE.Mesh(merged, look.face);
      face.name = 'vision-' + tag;
      face.userData.visionTag = tag;
      face.renderOrder = 5;
      group.add(face);
      const edges = new THREE.EdgesGeometry(merged, 25);
      const line = new THREE.LineSegments(edges, look.line);
      line.renderOrder = 6;
      group.add(line);
      if (look.xray) {
        const xray = new THREE.Mesh(merged, look.xray);
        xray.renderOrder = 4;
        xray.userData.xray = true;
        const lineX = new THREE.LineSegments(edges, look.lineX);
        lineX.renderOrder = 4;
        group.add(xray, lineX);
      }
    }
    return this.takeZones(group);
  }
}
