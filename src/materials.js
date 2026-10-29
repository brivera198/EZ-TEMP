// Procedural textures and materials. Everything is drawn on canvases at load
// time, so the model needs no image files.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

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

// Dressed limestone courses with drafted margins (Iron Age royal ashlar).
// The texture covers `tile` cubits; each course is one cubit high.
function ashlar(seed, base, { rows = 6, size = 512, minLen = 1.6, maxLen = 3.4, margin = true } = {}) {
  const rand = rng(seed);
  const [c, g] = canvas(size, size);
  const [cb, b] = canvas(size, size);
  g.fillStyle = rgb(base[0] * 0.55, base[1] * 0.55, base[2] * 0.55);
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#202020';
  b.fillRect(0, 0, size, size);
  const rh = size / rows;
  const unit = size / rows; // px per cubit
  for (let r = 0; r < rows; r++) {
    let x = -rand() * maxLen * unit;
    const y = r * rh;
    while (x < size) {
      const len = (minLen + rand() * (maxLen - minLen)) * unit;
      const k = 0.88 + rand() * 0.2;
      const tint = (rand() - 0.5) * 14;
      for (const off of [0, -size]) {
        const bx = x + off;
        if (bx + len < 0 || bx > size) continue;
        g.fillStyle = rgb(base[0] * k + tint, base[1] * k + tint * 0.8, base[2] * k + tint * 0.5);
        g.fillRect(bx + 1.5, y + 1.5, len - 3, rh - 3);
        b.fillStyle = '#b4b4b4';
        b.fillRect(bx + 1.5, y + 1.5, len - 3, rh - 3);
        if (margin) {
          const m = rh * 0.12;
          g.strokeStyle = rgb(base[0] * k + 18, base[1] * k + 16, base[2] * k + 12);
          g.lineWidth = m;
          g.strokeRect(bx + 1.5 + m / 2, y + 1.5 + m / 2, len - 3 - m, rh - 3 - m);
          b.strokeStyle = '#d8d8d8';
          b.lineWidth = m;
          b.strokeRect(bx + 1.5 + m / 2, y + 1.5 + m / 2, len - 3 - m, rh - 3 - m);
        }
      }
      x += len;
    }
  }
  speckle(g, size, size, 2600, rand, '#3a3226');
  speckle(g, size, size, 1400, rand, '#fff6e0');
  speckle(b, size, size, 2600, rand, '#606060', 2.2);
  return [toTex(c), toTex(cb, false)];
}

// Large square flagstones.
function flagstones(seed, base, size = 512) {
  const rand = rng(seed);
  const [c, g] = canvas(size, size);
  const [cb, b] = canvas(size, size);
  g.fillStyle = rgb(base[0] * 0.6, base[1] * 0.6, base[2] * 0.6);
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#303030';
  b.fillRect(0, 0, size, size);
  const n = 4;
  const cell = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = 0.9 + rand() * 0.16;
    const split = rand() < 0.4;
    const rects = split ? [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] : [[0, 0, 1, 1]];
    for (const [rx, ry, rw, rhh] of rects) {
      const kk = k + (rand() - 0.5) * 0.06;
      g.fillStyle = rgb(base[0] * kk, base[1] * kk, base[2] * kk);
      const x = i * cell + rx * cell, y = j * cell + ry * cell;
      g.fillRect(x + 2, y + 2, rw * cell - 4, rhh * cell - 4);
      b.fillStyle = '#c0c0c0';
      b.fillRect(x + 2, y + 2, rw * cell - 4, rhh * cell - 4);
    }
  }
  speckle(g, size, size, 3000, rand, '#4a4030');
  speckle(g, size, size, 1500, rand, '#fffaf0');
  speckle(b, size, size, 3000, rand, '#707070', 2);
  return [toTex(c), toTex(cb, false)];
}

// Rough fieldstone for city walls.
function rubble(seed, base, size = 512) {
  const rand = rng(seed);
  const [c, g] = canvas(size, size);
  const [cb, b] = canvas(size, size);
  g.fillStyle = rgb(base[0] * 0.5, base[1] * 0.5, base[2] * 0.5);
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#202020';
  b.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const x = rand() * size, y = rand() * size;
    const rx = 14 + rand() * 30, ry = 10 + rand() * 18;
    const k = 0.8 + rand() * 0.3;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k);
      g.beginPath();
      g.ellipse(x + ox, y + oy, rx, ry, rand() * 0.4, 0, Math.PI * 2);
      g.fill();
      b.fillStyle = `rgb(${150 + rand() * 60 | 0},${150 + rand() * 60 | 0},${150 + rand() * 60 | 0})`;
      b.beginPath();
      b.ellipse(x + ox, y + oy, rx, ry, 0, 0, Math.PI * 2);
      b.fill();
    }
  }
  speckle(g, size, size, 2500, rand, '#2e2820');
  return [toTex(c), toTex(cb, false)];
}

// Mottled plaster / beaten earth.
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

// Vertical cedar boards.
function planks(seed, base, size = 512) {
  const rand = rng(seed);
  const [c, g] = canvas(size, size);
  const boards = 6;
  const bw = size / boards;
  for (let i = 0; i < boards; i++) {
    const k = 0.85 + rand() * 0.25;
    g.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k);
    g.fillRect(i * bw, 0, bw, size);
    for (let j = 0; j < 26; j++) {
      g.strokeStyle = `rgba(40,18,8,${0.08 + rand() * 0.18})`;
      g.lineWidth = 0.6 + rand() * 1.4;
      const x = i * bw + rand() * bw;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (rand() - 0.5) * 12, size * 0.33, x + (rand() - 0.5) * 12, size * 0.66, x, size);
      g.stroke();
    }
    g.fillStyle = 'rgba(20,10,5,0.55)';
    g.fillRect(i * bw, 0, 2, size);
  }
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
    const nx = -hx * 6, ny = -hy * 6, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTex(c, false);
}

// Fine grain multiplied over the terrain's vertex colours.
function groundDetail(size = 512) {
  const rand = rng(21);
  const [c, g] = canvas(size, size);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, size, size);
  speckle(g, size, size, 9000, rand, '#7a7a7a', 2.5);
  speckle(g, size, size, 5000, rand, '#ffffff', 2);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(90,90,80,${0.05 + rand() * 0.1})`;
    const x = rand() * size, y = rand() * size, r = 6 + rand() * 30;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return toTex(c);
}

// Each material carries userData.tile: how many local units one texture
// repeat covers, so box UVs keep a constant scale.
export function makeMaterials() {
  const std = (o, tile = 6) => { const m = new THREE.MeshStandardMaterial(o); m.userData.tile = tile; return m; };

  const [ashMap, ashBump] = ashlar(1, [222, 206, 172]);
  const [ashDMap, ashDBump] = ashlar(2, [196, 178, 146], { minLen: 2.2, maxLen: 4.2 });
  const [podMap, podBump] = ashlar(9, [205, 190, 158], { minLen: 2.5, maxLen: 5 });
  const [paveMap, paveBump] = flagstones(4, [214, 200, 170]);
  const [rubMap, rubBump] = rubble(5, [184, 166, 134]);
  const [cedarMap, cedarBump] = carvedPanel('cedar');
  const [goldMap, goldBump] = carvedPanel('gold');
  const [palmMap, palmBump] = carvedPanel('stone');
  const plankMap = planks(6, [138, 78, 44]);
  const water = waterNormals();
  water.repeat.set(1, 1);

  const m = {
    ashlar: std({ map: ashMap, bumpMap: ashBump, bumpScale: 1.4, roughness: 0.86 }, 6),
    ashlarDark: std({ map: ashDMap, bumpMap: ashDBump, bumpScale: 1.6, roughness: 0.9 }, 8),
    podium: std({ map: podMap, bumpMap: podBump, bumpScale: 1.8, roughness: 0.92 }, 10),
    pavement: std({ map: paveMap, bumpMap: paveBump, bumpScale: 0.8, roughness: 0.8 }, 8),
    rubble: std({ map: rubMap, bumpMap: rubBump, bumpScale: 2, roughness: 0.95 }, 6),
    plaster: std({ map: mottled(7, [226, 214, 190], 0.12), roughness: 0.95 }, 10),
    earth: std({ map: mottled(8, [196, 172, 136], 0.18), roughness: 1 }, 12),
    roof: std({ map: mottled(10, [190, 172, 142], 0.2), roughness: 1 }, 10),
    cedar: std({ map: plankMap, roughness: 0.7 }, 4),
    cedarCarved: std({ map: cedarMap, bumpMap: cedarBump, bumpScale: 3, roughness: 0.62 }, 10),
    palmStone: std({ map: palmMap, bumpMap: palmBump, bumpScale: 2, roughness: 0.85 }, 6),
    goldCarved: std({ map: goldMap, bumpMap: goldBump, bumpScale: 3, metalness: 0.9, roughness: 0.32 }, 10),
    gold: std({ color: 0xe0ae48, metalness: 1, roughness: 0.24 }, 4),
    goldFloor: std({ color: 0xd6a443, metalness: 0.25, roughness: 0.45, map: mottled(13, [240, 220, 170], 0.12) }, 6),
    bronze: std({ color: 0xa8703a, metalness: 0.92, roughness: 0.36 }, 4),
    window: std({ map: lattice(), roughness: 0.9 }, 2),
    door: std({ map: cedarMap, bumpMap: cedarBump, bumpScale: 2, roughness: 0.6 }, 10),
    veil: new THREE.MeshStandardMaterial({ map: veilTex(), roughness: 0.95, side: THREE.DoubleSide }),
    water: new THREE.MeshStandardMaterial({
      color: 0x2f7f8c, roughness: 0.06, metalness: 0.15, normalMap: water,
      normalScale: new THREE.Vector2(0.8, 0.8), transparent: true, opacity: 0.9,
    }),
    fire: new THREE.MeshBasicMaterial({ color: 0xe8561a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    ember: new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 1 }),
    linen: std({ color: 0xf1ebdc, roughness: 1 }, 4),
    terrain: new THREE.MeshStandardMaterial({ map: groundDetail(), vertexColors: true, roughness: 0.97 }),
    house: new THREE.MeshStandardMaterial({ map: mottled(12, [204, 184, 152], 0.16), roughness: 1 }),
    olive: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 1 }),
    ghost: new THREE.MeshBasicMaterial({ color: 0x5b8fe6, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    ghostLine: new THREE.LineBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.75 }),
  };
  // Sky light from the environment map greys out matte surfaces; keep it for metals.
  for (const mat of Object.values(m)) {
    if (mat.isMeshStandardMaterial) mat.envMapIntensity = mat.metalness < 0.5 ? 0.15 : 0.7;
  }
  m.terrain.map.repeat.set(1, 1);
  m.house.map.repeat.set(1, 1);
  m.veil.userData.tile = 1;
  m.water.userData.tile = 12;
  m.fire.userData.tile = 1;
  m.ember.userData.tile = 1;
  return m;
}
