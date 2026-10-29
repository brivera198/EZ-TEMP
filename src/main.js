import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { INFO, COMPARE, LANDMARKS, CUBIT, BASE_Y, LEVEL } from './data.js';
import { makeMaterials } from './materials.js';
import { buildTerrain, buildCity, terrainY } from './terrain.js';
import { buildEzekiel, buildRiver, buildReedsOutline, buildMigrash, buildCityOfEzekiel, toWorld as E } from './ezekiel.js';
import { buildSolomon, buildPlatforms } from './solomon.js';

const $ = (s) => document.querySelector(s);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S = (u, y, v) => V(u * CUBIT, BASE_Y + y * CUBIT, v * CUBIT);   // Solomon frame (origin over the rock)
const { outer: O, inner: I, house: H } = LEVEL;
const EYE = 1.65 / CUBIT;                                          // eye height in cubits
const tick = () => new Promise((r) => setTimeout(r, 0));
const coarse = matchMedia('(pointer: coarse)').matches;

// --- Renderer, scene, camera ----------------------------------------------------
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.15, 60000);
camera.position.set(360, 330, 820);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.497;
controls.minDistance = 1;
controls.maxDistance = 12000;
controls.target.set(40, 130, 90);

// --- Sky, sun, environment ---------------------------------------------------------
const sky = new Sky();
sky.scale.setScalar(200000);
scene.add(sky);
const envScene = new THREE.Scene();
const envSky = new Sky();
envSky.scale.setScalar(50);
envScene.add(envSky);
for (const s of [sky, envSky]) {
  const u = s.material.uniforms;
  u.turbidity.value = 5.5;
  u.rayleigh.value = 1.3;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
}
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const sun = new THREE.DirectionalLight(0xfff0d8, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(coarse ? 2048 : 4096, coarse ? 2048 : 4096);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.5;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 4000;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xc4d6ee, 0x8c6c4a, 0.6);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xcfd6dc, 0.00009);

const sunDir = new THREE.Vector3();
function setTime(hours) {
  const t = (hours - 6) / 12;
  const el = Math.max(-0.03, Math.sin(t * Math.PI) * THREE.MathUtils.degToRad(64));
  const az = THREE.MathUtils.degToRad(90 + t * 180);  // east → south → west
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  for (const s of [sky, envSky]) s.material.uniforms.sunPosition.value.copy(sunDir);
  const day = THREE.MathUtils.smoothstep(el, -0.02, 0.35);
  sun.intensity = 3.2 * THREE.MathUtils.smoothstep(el, -0.02, 0.12);
  sun.color.setHSL(0.09, 0.75, 0.62 + 0.3 * day);
  hemi.intensity = 0.22 + 0.35 * day;
  renderer.toneMappingExposure = 0.55 + 0.15 * (1 - day);
  scene.fog.color.setHSL(0.09 - 0.0 * day, 0.25 - 0.12 * day, 0.45 + 0.35 * day);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  const h = Math.floor(hours), m = Math.round((hours - h) * 60);
  $('#time-out').textContent = `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Shadow frustum follows what you are looking at.
function updateShadowFrustum(focus, dist) {
  const ext = THREE.MathUtils.clamp(dist * 0.85, 40, 700);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - ext) > ext * 0.15) {
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.updateProjectionMatrix();
  }
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(sunDir, 1800);
}

// --- Build the world ------------------------------------------------------------
const W = {};
const allZones = [];
const houseZones = [];
const labels = [];
const fireMeshes = [];

async function build() {
  const step = async (txt, pct) => { $('#load-step').textContent = txt; $('#load-bar').style.width = pct + '%'; await tick(); };
  await step('Preparing stone, cedar and gold…', 8);
  W.mats = makeMaterials();
  await step('Shaping the hills of Jerusalem…', 20);
  W.terrain = buildTerrain(W.mats);
  scene.add(W.terrain.group);
  await step('Raising the walls and houses of the city…', 45);
  W.city = buildCity(W.mats);
  scene.add(W.city.group);
  await step('Measuring Ezekiel\'s gates and courts (40:5–42:20)…', 62);
  W.plat = buildPlatforms(W.mats);
  scene.add(W.plat.group);
  W.ez = buildEzekiel(W.mats);
  scene.add(W.ez.group);
  W.river = buildRiver(W.mats);
  scene.add(W.river.group);
  W.reeds = buildReedsOutline();
  scene.add(W.reeds.mesh);
  W.migrash = buildMigrash();
  scene.add(W.migrash);
  W.ezCity = buildCityOfEzekiel(W.mats);
  scene.add(W.ezCity.group);
  await step('Building Solomon\'s house and palace (1 Kings 6–7)…', 82);
  W.so = buildSolomon(W.mats);
  scene.add(W.so.templeGroup, W.so.siteGroup);
  for (const m of W.so.templeGroup.children) {
    if (m.isMesh && m.material !== W.mats.fire) { m.userData.orig = m.material; m.userData.cast = m.castShadow; }
  }
  fireMeshes.push(...W.ez.fireMeshes, ...W.so.fireMeshes);

  const tag = (zs, fallback) => zs.map((z) => ({ ...z, mode: INFO[z.id]?.mode || fallback }));
  allZones.push(...tag(W.plat.zones, 'both'), ...tag(W.ez.zones, 'ez'), ...tag(W.river.zones, 'ez'), ...tag(W.so.zones, 'so'));
  houseZones.push(...allZones.filter((z) => z.id === 'ez-house' || z.id === 'so-house'));

  for (const l of LANDMARKS) addLabel(l.name, V(l.x, terrainY(l.x, l.z) + l.lift, l.z), 'land', { far: 5200, hideIn: l.hideIn });
  for (const l of W.ez.labels) addLabel(l.label, l.pos, 'ez', { far: 1100 });
  for (const l of W.river.markers) addLabel(l.label, l.pos, 'river', { far: 2600, small: true });
  addLabel(W.reeds.label.label, W.reeds.label.pos, 'reeds', { far: 9000 });
  for (const l of W.ezCity.labels) addLabel(l.label, l.pos, 'ezcity', { far: 16000, small: l.small });
  for (const l of W.so.labels) addLabel(l.label, l.pos, 'so', { far: 1100, small: l.small });

  await step('Lighting the lamps…', 95);
  setTime(parseFloat($('#time').value));
}

// --- Labels ---------------------------------------------------------------------
function addLabel(text, pos, kind, { far = 1000, small = false, hideIn } = {}) {
  const el = document.createElement('div');
  el.className = `label ${kind === 'land' ? 'land' : ''} ${kind === 'so' ? 'so' : ''} ${kind} ${small ? 'small' : ''}`;
  el.textContent = text;
  el.style.display = 'none';
  $('#labels').appendChild(el);
  labels.push({ el, pos, kind, far, hideIn, shown: false });
}

const proj = new THREE.Vector3();
// Nearest labels win; any label that would overlap one already placed is hidden.
function updateLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const low = camera.position.y - terrainY(camera.position.x, camera.position.z) < 30;
  const indoors = houseZones.some((z) => z.box.containsPoint(camera.position));
  const cand = [];
  for (const l of labels) {
    let vis = state.layers.labels && !state.walking && !indoors;
    if (l.kind === 'ez') vis &&= state.mode !== 'so';
    if (l.kind === 'so') vis &&= state.mode === 'so';
    if (l.kind === 'river') vis &&= state.mode !== 'so' && state.layers.river;
    if (l.kind === 'reeds') vis &&= state.layers.reeds && state.mode !== 'so';
    if (l.kind === 'ezcity') vis &&= state.layers.ezcity && state.mode !== 'so';
    if (l.hideIn) vis &&= state.mode !== l.hideIn;
    l.d = camera.position.distanceTo(l.pos);
    vis &&= l.d < l.far && l.d > 4;
    // Near the ground, distant names would show through buildings.
    if (low) vis &&= l.kind === 'land' ? false : l.d < 90;
    if (vis) {
      proj.copy(l.pos).project(camera);
      vis = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
      l.sx = (proj.x * 0.5 + 0.5) * w;
      l.sy = (-proj.y * 0.5 + 0.5) * h;
    }
    if (vis) cand.push(l);
    else if (l.shown) { l.el.style.display = 'none'; l.shown = false; }
  }
  cand.sort((a, b) => a.d - b.d);
  const placed = [];
  for (const l of cand) {
    l.w ||= l.el.textContent.length * 7 + 28;
    const r = { x0: l.sx - l.w / 2, x1: l.sx + l.w / 2, y0: l.sy - 24, y1: l.sy };
    const clash = placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
    if (clash) {
      if (l.shown) { l.el.style.display = 'none'; l.shown = false; }
      continue;
    }
    placed.push(r);
    l.el.style.transform = `translate(${l.sx}px, ${l.sy}px) translate(-50%, -100%)`;
    if (!l.shown) { l.el.style.display = ''; l.shown = true; l.w = l.el.offsetWidth || l.w; }
  }
}

// --- State, modes, layers --------------------------------------------------------
const state = {
  mode: 'ez',
  walking: false,
  layers: { labels: true, city: true, river: true, migrash: true, reeds: false, ezcity: false },
  selected: null,
};

let edges = null;
function ensureEdges() {
  if (edges) return;
  edges = [];
  for (const m of W.so.templeGroup.children) {
    if (!m.isMesh || !m.userData.orig) continue;
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), W.mats.ghostLine);
    W.so.templeGroup.add(line);
    edges.push(line);
  }
}

function applyVisibility() {
  const { mode, layers } = state;
  const showEz = mode !== 'so';
  const showSo = mode !== 'ez';
  const ghost = mode === 'overlay';
  W.ez.group.visible = showEz;
  W.river.group.visible = showEz && layers.river;
  W.migrash.visible = showEz && layers.migrash;
  W.reeds.mesh.visible = showEz && layers.reeds;
  W.ezCity.group.visible = showEz && layers.ezcity;
  W.so.templeGroup.visible = showSo;
  W.so.siteGroup.visible = mode === 'so';
  W.city.group.visible = layers.city;
  W.city.padHouses.visible = layers.city && mode !== 'so';
  if (ghost) ensureEdges();
  for (const m of W.so.templeGroup.children) {
    if (m.isLight) m.visible = !ghost;
    else if (m.isLineSegments) m.visible = ghost;
    else if (m.isMesh && m.userData.orig) { m.material = ghost ? W.mats.ghost : m.userData.orig; m.castShadow = ghost ? false : m.userData.cast; }
    else if (m.isMesh) m.visible = !ghost;   // flames
  }
  document.querySelectorAll('.ez-only').forEach((el) => { el.hidden = !showEz; });
}

const TITLES = { ez: 'Ezekiel\'s Temple', so: 'Solomon\'s Temple', overlay: 'Two Temples' };
const SUBS = {
  ez: 'Ezekiel 40–48 · long cubit 52.5 cm · Jerusalem',
  so: '1 Kings 6–7 · 2 Chronicles 3–4',
  overlay: 'Solomon (blue outline) over Ezekiel (solid)',
};

function setMode(mode, { fromHash = false } = {}) {
  state.mode = mode;
  document.body.dataset.mode = mode === 'so' ? 'so' : 'ez';
  document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('#sub').textContent = SUBS[mode];
  $('#title').textContent = TITLES[mode];
  applyVisibility();
  renderViews();
  select(null);
  const hash = { ez: 'ezekiel', so: 'solomon', overlay: 'overlay' }[mode];
  if (!fromHash && location.hash.slice(1) !== hash) {
    try { history.replaceState(null, '', '#' + hash); } catch { /* sandboxed frames may refuse */ }
  }
}

// --- Camera views ---------------------------------------------------------------------
const OLIVET = () => V(560, terrainY(560, 40) + 26, 40);
const VIEWS = {
  ez: [
    { name: 'Jerusalem before 586 BC', pos: () => V(360, 330, 820), target: () => V(40, 130, 90) },
    { name: 'From the Mount of Olives', pos: OLIVET, target: () => E(-40, 16, 0) },
    { name: 'Plan from above', pos: () => E(0, 1000, 2), target: () => E(0, 0, 0) },
    { name: 'Approaching the shut east gate', pos: () => E(322, 40, 92), target: () => E(236, 10, 0) },
    { name: 'Outer court', pos: () => E(175, O + EYE, -150), target: () => E(60, O + 12, -10) },
    { name: 'Inner court and altar', pos: () => E(44, I + EYE, 34), target: () => E(0, I + 7, 0) },
    { name: 'Before the porch', pos: () => E(-18, I + EYE, 16), target: () => E(-60, H + 14, 0) },
    { name: 'Inside the nave', pos: () => E(-76, H + EYE, 4), target: () => E(-125, H + 7, 0) },
    { name: 'The Most Holy Place', pos: () => E(-116.5, H + EYE, 7), target: () => E(-132, H + 8, -6) },
    { name: 'The river flowing east', pos: () => V(390, 178, 330), target: () => V(225, 100, 120), layer: 'river' },
    { name: '"500 reeds" to scale', pos: () => V(-1900, 1300, -1700), target: () => V(65, 110, 0), layer: 'reeds' },
    { name: 'Ezekiel 48 city to scale', pos: () => V(2300, 1500, -900), target: () => V(65, 100, 2700), layer: 'ezcity' },
  ],
  so: [
    { name: 'Jerusalem before 586 BC', pos: () => V(360, 330, 820), target: () => V(40, 130, 90) },
    { name: 'Temple and palace', pos: () => S(330, 140, 620), target: () => S(80, 0, 260) },
    { name: 'From the Mount of Olives', pos: OLIVET, target: () => S(60, 20, 0) },
    { name: 'Courts of the house', pos: () => S(240, 60, 150), target: () => S(40, 15, 0) },
    { name: 'Jachin and Boaz', pos: () => S(118, I + EYE, 24), target: () => S(70, H + 12, 0) },
    { name: 'Bronze Sea and stands', pos: () => S(88, I + 7, 47), target: () => S(50, I + 4, 30) },
    { name: 'Inside the nave', pos: () => S(49, H + EYE, 3), target: () => S(5, H + 7, 0) },
    { name: 'Cherubim and the ark', pos: () => S(9.2, H + 11, 9.2), target: () => S(-2, H + 5, -1) },
    { name: 'Palace on the Ophel', pos: () => S(290, 40, 720), target: () => S(110, -18, 470) },
  ],
  overlay: [
    { name: 'Both houses from above', pos: () => E(-30, 150, 110), target: () => E(-100, H, 0) },
    { name: 'Footprints in plan', pos: () => E(-60, 480, 1), target: () => E(-60, 0, 0) },
    { name: 'Side by side, from the east', pos: () => E(60, H + 20, 40), target: () => E(-110, H + 12, 0) },
    { name: 'Inside both naves', pos: () => E(-74, H + EYE + 2, 6), target: () => E(-130, H + 8, 0) },
    { name: 'Two altars', pos: () => E(60, I + 22, 70), target: () => E(10, I + 6, 0) },
    { name: 'Jerusalem before 586 BC', pos: () => V(360, 330, 820), target: () => V(40, 130, 90) },
  ],
};

let flight = null;
function flyTo(pos, target, ms = 1700) {
  if (state.walking) setWalking(false);
  flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : ms };
}

function renderViews() {
  const list = $('#views-list');
  list.replaceChildren();
  for (const v of VIEWS[state.mode]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = v.name;
    b.addEventListener('click', () => {
      list.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      if (v.layer && !state.layers[v.layer]) { state.layers[v.layer] = true; $('#lyr-' + v.layer).checked = true; applyVisibility(); }
      flyTo(v.pos(), v.target());
      closeSheets();
    });
    list.appendChild(b);
  }
}

// --- Info panel ---------------------------------------------------------------------
const PAIRS = {
  'ez-porch': 'so-porch', 'ez-nave': 'so-nave', 'ez-hoh': 'so-hoh', 'ez-side': 'so-side', 'ez-altar': 'so-altar',
  'ez-pillars': 'so-pillars', 'ez-house': 'so-house', 'ez-inner-court': 'so-inner-court', 'ez-river': 'so-sea',
  'ez-table': 'so-table', 'ez-wall': 'so-great-court', 'ez-platform': 'so-house',
};
for (const [a, b] of Object.entries(PAIRS)) if (!PAIRS[b]) PAIRS[b] = a;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function introHTML() {
  if (state.mode === 'so') {
    return `<div class="card"><div class="eyebrow">1 Kings 6–7 · 2 Chronicles 3–4</div>
      <h2>Solomon's temple and palace</h2>
      <p class="note">Built in seven years (1 Kgs 6:38) on the threshing floor of Araunah (2 Chr 3:1) and burned by Nebuchadnezzar's army in 586 BC. Kings gives the rooms and bronze work in detail but no sizes for the courts, so those are reconstructions.</p>
      <dl class="facts"><dt>Cubit</dt><dd>"Of the first measure" (2 Chr 3:3), taken as 52.5 cm</dd>
      <dt>House</dt><dd>60 × 20 cubits, 30 high</dd>
      <dt>Palace</dt><dd>Directly south, on the Ophel</dd>
      <dt>Assumed</dt><dd>Court sizes, wall thickness, platform levels</dd></dl>
      <p>Click any building or object to see its measurements and the verses behind them.</p></div>`;
  }
  if (state.mode === 'overlay') {
    return `<div class="card"><div class="eyebrow">Overlay</div>
      <h2>One rock, two houses</h2>
      <p class="note">Both Most Holy Places are set on the same rock, so the rooms line up. Both naves are 40 × 20 cubits and both inner rooms 20 × 20. Ezekiel's house is longer overall (100 cubits) because of its 6-cubit walls, deeper porch and the open "place left" round it.</p>
      <dl class="facts"><dt>Solid</dt><dd>Ezekiel 40–48</dd><dt>Blue</dt><dd>Solomon, 1 Kings 6–7</dd></dl>
      <p>Open "Ezekiel vs Solomon" above for the full side-by-side table.</p></div>`;
  }
  return `<div class="card"><div class="eyebrow">Ezekiel 40–48 · 573 BC</div>
    <h2>A temple built from the measuring reed</h2>
    <p class="note">In the 25th year of the exile a man with a measuring reed of six long cubits leads Ezekiel through a temple on a very high mountain (40:1–5). Every wall, gate and room here is built from the numbers he records.</p>
    <dl class="facts"><dt>Cubit</dt><dd>Cubit + handbreadth = 52.5 cm</dd>
    <dt>Reed</dt><dd>6 cubits = 3.15 m</dd>
    <dt>Precinct</dt><dd>500 × 500 cubits = 262.5 m square</dd>
    <dt>Placed</dt><dd>Most Holy Place over the rock on the Temple Mount</dd>
    <dt>Assumed</dt><dd>Heights of the house and gates, chamber sizes, finishes</dd></dl>
    <p>Click any building to see its measurements and the verses behind them.</p></div>`;
}

function infoHTML(id) {
  const d = INFO[id];
  const src = d.mode === 'so' ? '1 Kings · 2 Chronicles' : d.mode === 'both' ? 'Temple Mount' : 'Ezekiel 40–48';
  let html = `<div class="card"><div class="eyebrow">${src}</div><h2>${esc(d.title)}</h2>`;
  if (d.he) html += `<div class="he" lang="he">${esc(d.he)}</div>`;
  html += `<ul class="dims">${d.dims.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  html += `<p class="refs">${esc(d.refs)}</p>`;
  if (d.note) html += `<p class="note">${esc(d.note)}</p>`;
  const other = PAIRS[id];
  if (other && INFO[other]) {
    const o = INFO[other];
    const so = o.mode === 'so';
    html += `<div class="counterpart ${so ? 'so' : 'ez'}"><div class="eyebrow">Compare · <b>${so ? 'Solomon' : 'Ezekiel'}</b></div>
      <p><strong>${esc(o.title)}</strong>: ${esc(o.dims[0])}</p>
      <button type="button" class="link-btn" data-goto="${other}">Show it in ${so ? 'Solomon\'s' : 'Ezekiel\'s'} temple</button></div>`;
  }
  return html + '</div>';
}

const highlight = new THREE.Box3Helper(new THREE.Box3(), 0xffd27a);
highlight.visible = false;
highlight.material.depthTest = false;
highlight.material.transparent = true;
highlight.renderOrder = 10;
scene.add(highlight);

function select(id, box) {
  state.selected = id;
  $('#pane-info').innerHTML = id ? infoHTML(id) : introHTML();
  highlight.visible = !!box;
  if (box) highlight.box.copy(box);
  const goto = $('#pane-info [data-goto]');
  if (goto) goto.addEventListener('click', () => {
    const target = goto.dataset.goto;
    const mode = INFO[target].mode === 'so' ? 'so' : 'ez';
    setMode(mode);
    const z = allZones.filter((zz) => zz.id === target).sort((a, b) => vol(a.box) - vol(b.box))[0];
    if (z) { select(target, z.box); focusBox(z.box); }
  });
}

const vol = (b) => { const s = b.getSize(new THREE.Vector3()); return s.x * s.y * s.z + 1e-6; };

function focusBox(box) {
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(8, box.getSize(new THREE.Vector3()).length() * 0.9);
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.25) dir.y = 0.35;
  dir.normalize();
  flyTo(c.clone().addScaledVector(dir, r * 1.6), c);
}

function renderCompare() {
  $('#pane-cmp').innerHTML = `<p class="cmp-intro">Same site, same cubit, very different buildings. Verse references are to Ezekiel (left) and 1 Kings unless stated.</p>
    <div class="cmp">${COMPARE.map(([f, e, s]) => `<div class="row"><div class="feat">${esc(f)}</div><div class="col ez">${esc(e)}</div><div class="col so">${esc(s)}</div></div>`).join('')}</div>`;
}

// --- Picking ---------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;

function pickTargets() {
  const t = [W.terrain.mesh];
  if (W.ez.group.visible) t.push(W.ez.group);
  if (W.river.group.visible) t.push(W.river.mesh);
  if (W.so.templeGroup.visible) t.push(W.so.templeGroup);
  if (W.so.siteGroup.visible) t.push(W.so.siteGroup);
  t.push(W.plat.group);
  return t;
}

function pick(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(pickTargets(), true).filter((h) => h.object.visible && h.object.material !== W.mats.fire && !h.object.isLineSegments);
  if (!hits.length) return;
  const p = hits[0].point;
  const active = allZones.filter((z) => z.mode === 'both' || z.mode === state.mode || state.mode === 'overlay');
  let best = null;
  for (const z of active) {
    if (z.box.clone().expandByScalar(0.35).containsPoint(p) && (!best || vol(z.box) < vol(best.box))) best = z;
  }
  if (best) { select(best.id, best.box); openSheet('info'); }
  else select(null);
}

canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !W.ez) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (moved < 6 && performance.now() - down.t < 600) pick(e.clientX, e.clientY);
  down = null;
});

// --- Walking ------------------------------------------------------------------------
const keys = new Set();
const walk = { yaw: 0, pitch: 0, vy: 0 };
const downRay = new THREE.Raycaster();
const fwdRay = new THREE.Raycaster();
downRay.far = 60;

function solidTargets() {
  const t = [W.plat.group];
  if (W.ez.group.visible) t.push(W.ez.group);
  if (W.so.siteGroup.visible) t.push(W.so.siteGroup);
  if (W.so.templeGroup.visible && state.mode === 'so') t.push(W.so.templeGroup);
  return t;
}

function groundAt(x, z, eyeY) {
  downRay.set(V(x, eyeY - 0.9, z), V(0, -1, 0));
  const hits = downRay.intersectObjects(solidTargets(), true).filter((h) => h.object.isMesh && !h.object.material.transparent);
  const t = terrainY(x, z);
  return hits.length ? Math.max(hits[0].point.y, t) : t;
}

function setWalking(on) {
  state.walking = on;
  document.body.classList.toggle('walking', on);
  $('#walk').setAttribute('aria-pressed', String(on));
  $('#walk').textContent = on ? 'Stop walking (Esc)' : 'Walk at ground level';
  controls.enabled = !on;
  $('#hint').textContent = on
    ? 'W A S D or arrows to walk · drag to look · Shift to run · Esc to stop'
    : 'Drag to look around · right-drag to pan · scroll to zoom · click a building for its measurements';
  if (on) {
    flight = null;
    const t = controls.target.clone();
    const g = groundAt(t.x, t.z, t.y + 2);
    const dir = t.clone().sub(camera.position);
    walk.yaw = Math.atan2(dir.x, -dir.z);
    walk.pitch = 0;
    camera.position.set(t.x, g + 1.65, t.z);
  } else {
    const f = V(Math.sin(walk.yaw), Math.sin(walk.pitch), -Math.cos(walk.yaw));
    controls.target.copy(camera.position).addScaledVector(f, 6);
  }
}

addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === 'Escape' && state.walking) setWalking(false);
  if (state.walking) { keys.add(e.code); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

let look = null;
canvas.addEventListener('pointerdown', (e) => { if (state.walking) { look = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', (e) => {
  if (!state.walking || !look) return;
  walk.yaw += (e.clientX - look.x) * 0.0042;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - (e.clientY - look.y) * 0.0042, -1.2, 1.2);
  look = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { look = null; });

const pad = $('#walkpad');
if (coarse) pad.classList.add('touch');
pad.querySelectorAll('button').forEach((b) => {
  const code = { f: 'KeyW', b: 'KeyS', l: 'ArrowLeft', r: 'ArrowRight' }[b.dataset.k];
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(code); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => keys.delete(code));
});

function stepWalk(dt) {
  if (keys.has('ArrowLeft')) walk.yaw -= 1.6 * dt;
  if (keys.has('ArrowRight')) walk.yaw += 1.6 * dt;
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 11 : 3.6) * dt;
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD')) s += 1;
  if (keys.has('KeyA')) s -= 1;
  const fw = V(Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
  const rt = V(Math.cos(walk.yaw), 0, Math.sin(walk.yaw));
  const move = fw.multiplyScalar(f).add(rt.multiplyScalar(s));
  if (move.lengthSq() > 0) {
    move.normalize();
    // Walls stop you; steps (under knee height) do not.
    fwdRay.set(V(camera.position.x, camera.position.y - 1.25, camera.position.z), move);
    fwdRay.far = speed + 0.45;
    const blocked = fwdRay.intersectObjects(solidTargets(), true).some((h) => h.object.isMesh && !h.object.material.transparent);
    if (!blocked) camera.position.addScaledVector(move, speed);
  }
  const g = groundAt(camera.position.x, camera.position.z, camera.position.y);
  const want = g + 1.65;
  if (camera.position.y > want + 0.05) { walk.vy -= 9.8 * dt; camera.position.y = Math.max(want, camera.position.y + walk.vy * dt); }
  else { walk.vy = 0; camera.position.y += (want - camera.position.y) * Math.min(1, dt * 12); }
  const look = V(Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch));
  camera.lookAt(camera.position.clone().add(look));
}

// --- UI wiring ------------------------------------------------------------------------
document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#walk').addEventListener('click', () => setWalking(!state.walking));
$('#toggle-panels').addEventListener('click', (e) => {
  const hidden = document.body.classList.toggle('panels-hidden');
  e.currentTarget.setAttribute('aria-pressed', String(hidden));
  e.currentTarget.textContent = hidden ? 'Show panels' : 'Hide panels';
});
for (const k of Object.keys(state.layers)) {
  const el = $('#lyr-' + k);
  el.addEventListener('change', () => { state.layers[k] = el.checked; applyVisibility(); });
}
let timeQueued = false;
$('#time').addEventListener('input', () => {
  if (timeQueued) return;
  timeQueued = true;
  requestAnimationFrame(() => { timeQueued = false; setTime(parseFloat($('#time').value)); });
});
const tabs = [['#tab-info', '#pane-info'], ['#tab-cmp', '#pane-cmp']];
for (const [t, p] of tabs) {
  $(t).addEventListener('click', () => {
    for (const [t2, p2] of tabs) { $(t2).setAttribute('aria-selected', String(t2 === t)); $(p2).hidden = p2 !== p; }
  });
}
function openSheet(which) {
  if (!matchMedia('(max-width: 860px)').matches) return;
  for (const id of ['views', 'info']) {
    const on = id === which;
    $('#' + id).classList.toggle('open', on);
    document.querySelector(`[data-open="${id}"]`).setAttribute('aria-expanded', String(on));
  }
}
function closeSheets() { openSheet(null); }
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
  const id = b.dataset.open;
  openSheet($('#' + id).classList.contains('open') ? null : id);
}));

function modeFromHash() {
  return { ezekiel: 'ez', solomon: 'so', overlay: 'overlay' }[location.hash.slice(1)] || null;
}
addEventListener('hashchange', () => { const m = modeFromHash(); if (m && m !== state.mode) setMode(m, { fromHash: true }); });

// --- Loop ---------------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

const clock = new THREE.Clock();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (flight) {
    const t = Math.min(1, (performance.now() - flight.start) / flight.ms);
    const k = ease(t);
    camera.position.lerpVectors(flight.p0, flight.p1, k);
    // Arc upward a little on long flights so we do not skim the ground.
    const lift = Math.sin(k * Math.PI) * Math.min(300, flight.p0.distanceTo(flight.p1) * 0.18);
    camera.position.y += lift;
    controls.target.lerpVectors(flight.t0, flight.t1, k);
    if (t >= 1) flight = null;
  }
  if (state.walking) stepWalk(dt);
  else {
    controls.update();
    // Keep the camera out of the ground.
    const gy = terrainY(camera.position.x, camera.position.z) + 1.2;
    if (camera.position.y < gy) camera.position.y = gy;
  }
  const focus = state.walking ? camera.position : controls.target;
  updateShadowFrustum(focus, state.walking ? 120 : camera.position.distanceTo(controls.target));
  W.mats.water.normalMap.offset.set(time * 0.01, -time * 0.06);
  for (const m of fireMeshes) {
    const s = m.userData.base * (0.8 + 0.25 * Math.sin(time * 9 + m.userData.phase) + 0.1 * Math.sin(time * 23 + m.userData.phase * 3));
    m.scale.set(m.userData.base, s, m.userData.base);
  }
  const flick = 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 7.3);
  W.ez.altarLight.intensity = 90 * flick;
  W.so.altarLight.intensity = 90 * flick;
  renderer.render(scene, camera);
  updateLabels();
  requestAnimationFrame(frame);
}

// --- Start --------------------------------------------------------------------------------
build().then(() => {
  resize();
  renderCompare();
  setMode(modeFromHash() || 'ez', { fromHash: true });
  $('#loading').classList.add('done');
  window.ezt = { scene, camera, controls, renderer, W, setMode, setTime, flyTo, select };
  frame();
}).catch((err) => {
  console.error(err);
  $('#load-step').textContent = 'The model could not be built.';
  const e = $('#error');
  e.style.display = 'block';
  e.textContent = `${err.message}. WebGL may be turned off in this browser; try another browser or device.`;
});
