// Fire and lamp light. There are far more flames (altars, hearths, house
// fires, gate torches, the temple lamps) than a renderer can light at once,
// so a fixed pool of point lights moves each frame to the flames nearest the
// camera. The pool never changes size, so no shader has to be rebuilt.
import * as THREE from 'three';

const FIRE = new THREE.Color(1, 0.55, 0.22);
const LAMP = new THREE.Color(1, 0.72, 0.4);

export class LightPool {
  constructor(scene, size = 8) {
    this.sources = [];
    this.lights = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(FIRE, 0, 30, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.tick = 0;
  }

  // s: { pos (world), power (candela), range, lamp, nightOnly, shown() }
  add(s) {
    this.sources.push({ range: 28, lamp: false, nightOnly: false, phase: Math.random() * 10, ...s });
  }

  update(camera, time, night) {
    // Re-choose the nearest flames a few times a second.
    if (this.tick++ % 8 === 0) {
      const c = camera.position;
      const live = [];
      for (const s of this.sources) {
        if (s.nightOnly && night < 0.05) continue;
        if (s.shown && !s.shown()) continue;
        s.d2 = (s.pos.x - c.x) ** 2 + (s.pos.y - c.y) ** 2 + (s.pos.z - c.z) ** 2;
        if (s.d2 < 450 * 450) live.push(s);
      }
      live.sort((a, b) => a.d2 - b.d2);
      this.active = live.slice(0, this.lights.length);
    }
    this.lights.forEach((l, i) => {
      const s = this.active?.[i];
      if (!s) { l.intensity = 0; return; }
      const flick = s.lamp ? 0.95 + 0.05 * Math.sin(time * 9 + s.phase) : 0.82 + 0.12 * Math.sin(time * 11 + s.phase) * Math.sin(time * 7.3 + s.phase * 2) + 0.06 * Math.sin(time * 23 + s.phase);
      l.position.copy(s.pos);
      l.color.copy(s.lamp ? LAMP : FIRE);
      l.distance = s.range;
      // Fires matter little against the sun; at night they carry the scene.
      l.intensity = s.power * flick * (s.lamp ? 1 : 0.35 + 0.65 * night);
    });
  }
}
