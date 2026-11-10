// The glory of the LORD returning from the east (Ezek 43:1–5), drawn as light
// only: the text gives a sound "like many waters" and an earth that "shone",
// and no shape. It rises over the Mount of Olives, enters by the east gate
// and comes to rest in the house.
import * as THREE from 'three';

function glowTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sprite(map, color, depthTest) {
  const m = new THREE.SpriteMaterial({
    map, color, transparent: true, depthWrite: false, depthTest,
    blending: THREE.AdditiveBlending, fog: false,
  });
  m.userData.base = new THREE.Color(color);
  const s = new THREE.Sprite(m);
  s.raycast = () => {};
  s.renderOrder = 7;
  return s;
}

// keys: [{ t: seconds, p: Vector3 }] along the way; the last is where it rests.
export function createGlory({ scene, lights, keys }) {
  const group = new THREE.Group();
  group.name = 'glory';
  group.visible = false;
  // The core is hidden by walls; the halo shines through them.
  const core = sprite(glowTexture([[0, 1], [0.25, 0.55], [0.6, 0.12], [1, 0]]), '#fff1d0', true);
  const halo = sprite(glowTexture([[0, 0.5], [0.3, 0.2], [0.7, 0.05], [1, 0]]), '#ffc978', false);
  group.add(halo, core);
  scene.add(group);

  const curve = new THREE.CatmullRomCurve3(keys.map((k) => k.p), false, 'centripetal');
  const total = keys[keys.length - 1].t;
  const g = { group, pos: keys[0].p.clone(), state: 'off', time: 0, total };
  const src = { pos: g.pos, power: 0, range: 240, lamp: true, priority: true, color: new THREE.Color(1, 0.86, 0.62), shown: () => g.state !== 'off' };
  lights.add(src);

  // Curve parameter for a time: equal spans between keys, paced by their times.
  function paramAt(time) {
    let i = 0;
    while (i < keys.length - 2 && time > keys[i + 1].t) i++;
    const k = THREE.MathUtils.clamp((time - keys[i].t) / (keys[i + 1].t - keys[i].t), 0, 1);
    return (i + k) / (keys.length - 1);
  }

  g.begin = () => { g.state = 'coming'; g.time = 0; group.visible = true; };
  g.settle = () => { g.state = 'settled'; g.time = total + 10; group.visible = true; };
  g.hide = () => { g.state = 'off'; group.visible = false; src.power = 0; };

  g.update = (dt, exposure) => {
    if (g.state === 'off') return;
    g.time += dt;
    if (g.state === 'coming' && g.time >= total) g.state = 'settled';
    curve.getPoint(paramAt(Math.min(g.time, total)), g.pos);
    group.position.copy(g.pos);
    // 0 on the way, 1 once it rests in the house; a swell as it fills it.
    const rest = THREE.MathUtils.smoothstep(g.time, total - 2.5, total + 1.5);
    const swell = Math.exp(-(((g.time - total - 1.2) / 1.6) ** 2));
    const appear = Math.min(1, g.time / 2);
    const breathe = 1 + 0.04 * Math.sin(g.time * 1.7);
    core.scale.setScalar(THREE.MathUtils.lerp(24, 9, rest) * breathe);
    halo.scale.setScalar(THREE.MathUtils.lerp(170, 110, rest) * (1 + 0.5 * swell));
    const gain = appear / Math.max(exposure, 0.2);
    core.material.color.copy(core.material.userData.base).multiplyScalar(3.4 * gain);
    halo.material.color.copy(halo.material.userData.base).multiplyScalar((0.34 + 0.3 * swell) * gain);
    src.power = appear * THREE.MathUtils.lerp(2200, 420, rest) * (1 + swell);
    src.range = THREE.MathUtils.lerp(240, 90, rest);
  };
  return g;
}
