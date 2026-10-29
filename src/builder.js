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

export class Builder {
  constructor(mats) {
    this.mats = mats;
    this.parts = {};
    this.zones = [];
  }

  tile(key) { return this.mats[key].userData.tile || 6; }

  add(key, geom) {
    (this.parts[key] ||= []).push(geom);
  }

  // Axis-aligned box from two corners.
  box(key, x0, x1, y0, y1, z0, z1) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (w <= 0 || h <= 0 || d <= 0) return;
    const g = boxGeom(w, h, d, this.tile(key), x0, y0, z0);
    g.translate(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    this.add(key, g);
  }

  // Any geometry, placed with position / rotation-y / scale.
  geom(key, g, x = 0, y = 0, z = 0, ry = 0, s = 1) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
      new THREE.Vector3(s, s, s));
    g.applyMatrix4(m);
    this.add(key, g);
  }

  zone(id, x0, x1, y0, y1, z0, z1) {
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
    group.updateMatrixWorld(true);
    const zones = this.zones.map((z) => ({ id: z.id, box: z.box.clone().applyMatrix4(group.matrixWorld) }));
    this.parts = {};
    this.zones = [];
    return zones;
  }
}
