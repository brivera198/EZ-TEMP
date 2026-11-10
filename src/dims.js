// Measurements drawn in the scene: a gold line with end ticks between two
// points, and a label giving its length in cubits and metres. The tour uses
// them to show each figure of the text where it applies.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CUBIT } from './data.js';

// Only the main camera draws this layer; water mirrors and probes leave it out.
export const DIM_LAYER = 3;

const GOLD = new THREE.Color('#ffcf6b');
const num = (x, digits) => x.toLocaleString('en-US', { maximumFractionDigits: digits });

// A length in cubits as text: whole and half cubits, and metres.
export function cubitText(c) {
  const half = Math.round(c * 2) / 2;
  const whole = Math.floor(half);
  const n = half === whole ? num(whole, 0) : (whole ? num(whole, 0) : '') + '½';
  const m = half * CUBIT;
  return { n, unit: half === 1 ? 'cubit' : 'cubits', m: num(m, m >= 10 ? 1 : 2) + ' m' };
}

// E(u, y, v) turns precinct cubits into a world position.
export function createDims({ scene, labelsEl, E }) {
  const mat = new LineMaterial({ color: GOLD.getHex(), linewidth: 2.4, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  let lines = null;
  let labels = [];
  let fade = 0;
  const tmp = new THREE.Vector3();

  function clear() {
    if (lines) { scene.remove(lines); lines.geometry.dispose(); lines = null; }
    for (const l of labels) l.el.remove();
    labels = [];
    fade = 0;
  }

  function label(html, pos, off, note) {
    const el = document.createElement('div');
    el.className = 'label dim' + (note ? ' note' : '');
    el.innerHTML = html;
    el.style.opacity = '0';
    labelsEl.appendChild(el);
    labels.push({ el, pos, dx: off?.[0] || 0, dy: off?.[1] || 0, w: el.offsetWidth, h: el.offsetHeight });
  }

  // list: [{ a: [u, y, v], b: [u, y, v], name?, text?, off?: [px, px] }] for a
  // measured line, or { at: [u, y, v], text } for a note without a line.
  function show(list) {
    clear();
    const seg = [];
    const push = (p, q) => { const a = E(p.x, p.y, p.z), b = E(q.x, q.y, q.z); seg.push(a.x, a.y, a.z, b.x, b.y, b.z); };
    for (const d of list) {
      if (d.at) { label(d.text, E(...d.at), d.off, true); continue; }
      const A = new THREE.Vector3(...d.a), B = new THREE.Vector3(...d.b);
      const len = A.distanceTo(B);
      const dir = B.clone().sub(A).normalize();
      // Two ticks at right angles at each end, so one shows from any side.
      const t1 = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize();
      const t = THREE.MathUtils.clamp(len * 0.04, 0.3, 10);
      push(A, B);
      for (const P of [A, B]) for (const T of [t1, t2]) push(P.clone().addScaledVector(T, -t), P.clone().addScaledVector(T, t));
      const c = cubitText(len);
      const html = (d.name ? `<i>${d.name}</i>` : '') + (d.text || `<b>${c.n}</b> ${c.unit}<span>${c.m}</span>`);
      const mid = A.clone().lerp(B, d.along ?? 0.5);
      label(html, E(mid.x, mid.y, mid.z), d.off, false);
    }
    if (!seg.length) return;
    mat.opacity = 0;
    lines = new LineSegments2(new LineSegmentsGeometry().setPositions(seg), mat);
    lines.layers.set(DIM_LAYER);
    lines.frustumCulled = false;
    lines.renderOrder = 12;
    lines.raycast = () => {};
    scene.add(lines);
  }

  // Each frame: fade in, keep the line width in pixels, and place the labels,
  // dropping any that would cover one already placed. card: the rectangle of
  // the tour's card; a label whose point lies under it is dropped, and one
  // that would only touch it moves clear.
  function update(camera, w, h, dt, exposure, card) {
    if (!labels.length && !lines) return;
    fade = Math.min(1, fade + dt / 0.7);
    mat.resolution.set(w, h);
    mat.opacity = fade;
    mat.color.copy(GOLD).multiplyScalar(1 / Math.max(exposure, 0.2));
    const placed = [];
    const clamp = THREE.MathUtils.clamp;
    for (const l of labels) {
      let on = tmp.copy(l.pos).applyMatrix4(camera.matrixWorldInverse).z < -camera.near;
      if (on) {
        tmp.copy(l.pos).project(camera);
        const ax = (tmp.x * 0.5 + 0.5) * w, ay = (-tmp.y * 0.5 + 0.5) * h;
        let x = ax + l.dx, y = ay + l.dy;
        on = ax > 0 && ax < w && ay > 0 && ay < h;
        if (on && card) {
          if (ax > card.left && ax < card.right && ay > card.top && ay < card.bottom) on = false;
          else if (card.width > w * 0.7) y = Math.min(y, card.top - 6 - l.h / 2);             // card along the bottom
          else if (y + l.h / 2 > card.top && y - l.h / 2 < card.bottom) x = Math.max(x, card.right + 6 + l.w / 2);
        }
        x = clamp(x, l.w / 2 + 4, w - l.w / 2 - 4);
        y = clamp(y, l.h / 2 + 4, h - l.h / 2 - 4);
        if (on) for (const p of placed) if (Math.abs(p.x - x) < (p.w + l.w) / 2 + 4 && Math.abs(p.y - y) < (p.h + l.h) / 2 + 2) { on = false; break; }
        if (on) {
          placed.push({ x, y, w: l.w, h: l.h });
          l.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }
      l.el.style.opacity = on ? fade.toFixed(2) : '0';
    }
  }

  return { show, clear, update };
}
