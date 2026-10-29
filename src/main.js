import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { INFO, COMPARE, LANDMARKS, CUBIT, BASE_Y, LEVEL, PERIODS } from './data.js';
import { makeMaterials } from './materials.js';
import { buildTerrain, terrainY, applySite, installTerrainShader, paintOverlay, PODIUM } from './terrain.js';
import { buildCity, planCountryside } from './city.js';
import { buildLife } from './life.js';
import { buildNature, overgrowth } from './nature.js';
import { buildEzekiel, buildRiver, buildReedsOutline, buildMigrash, buildCityOfEzekiel, toWorld as E } from './ezekiel.js';
import { buildSolomon, buildPlatforms } from './solomon.js';
import { makeVisionLooks, VISION_PARTS } from './vision.js';
import { atmo, patchScene, clouds, buildClouds } from './atmosphere.js';

const $ = (s) => document.querySelector(s);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S = (u, y, v) => V(u * CUBIT, BASE_Y + y * CUBIT, v * CUBIT);   // Solomon frame (origin over the rock)
const { outer: O, inner: I, house: H } = LEVEL;
const EYE = 1.65 / CUBIT;                                          // eye height in cubits
const tick = () => new Promise((r) => setTimeout(r, 0));
const coarse = matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);
// Lighter geometry and no screen effects on phones and small machines.
const QUALITY = params.get('quality') || (coarse || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high');
// Screen effects: 'on', 'off', or 'auto' (dropped if the frame rate suffers).
const FX = params.get('fx') || (QUALITY === 'low' ? 'off' : 'auto');
const PERIOD_KEYS = ['early', 'late', 'ruin'];
if (QUALITY === 'low') clouds.cloudOn.value = 0;   // cloud shadows cost a little on every lit pixel

// --- Renderer, scene, camera ----------------------------------------------------
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = params.get('tone') === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// The near plane follows the camera's distance from things (see frame()), so
// a standard depth buffer covers both the ark and the hills of Moab.
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 90000);
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
// The sun disk is bright enough to overflow half-float buffers, and anything
// metal reflecting it would bloom into a white blot: cap it.
const capSky = (s, max) => {
  s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', `gl_FragColor = vec4( min( retColor, vec3( ${max.toFixed(1)} ) ), 1.0 );`);
};
capSky(sky, 300);
capSky(envSky, 20);
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
scene.fog = new THREE.FogExp2(0xcfd6dc, 6e-5);

const sunDir = new THREE.Vector3();
const EXPOSURE = renderer.toneMapping === THREE.AgXToneMapping ? 0.9 : 0.58;
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
  renderer.toneMappingExposure = EXPOSURE * (1 + 0.25 * (1 - day));
  // Haze: warm and thicker at dawn and dusk, glowing toward the sun.
  // Bluish by day (aerial perspective), warm at dawn and dusk.
  scene.fog.color.setHSL(THREE.MathUtils.lerp(0.08, 0.58, day), 0.3 - 0.1 * day, 0.42 + 0.22 * day);
  scene.fog.density = 2.3e-5 + 3.5e-5 * (1 - day);
  atmo.fogSunDir.value.copy(sunDir);
  atmo.fogSunColor.value.setHSL(0.085, 0.7 - 0.3 * day, 0.55 + 0.25 * day);
  clouds.cloudLight.value = 0.3 + 0.7 * day;
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

// --- Screen effects: ambient occlusion, bloom, filmic tone mapping -------------------
// One pixel that is not a finite number (a degenerate derivative at the screen
// edge will do it) would be smeared across the view by bloom: clean them out
// and cap extremes first.
const Sanitize = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      bool bad = any(isnan(c.rgb)) || any(isinf(c.rgb));
      gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(min(c.rgb, vec3(48.0)), c.a);
    }`,
};
let composer = null, gtao = null, bloom = null;
function setupEffects() {
  // Half-float, multisampled targets need WebGL 2 with float colour buffers.
  if (FX === 'off' || !renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) return;
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(Sanitize));
  gtao = new GTAOPass(scene, camera, w, h);
  gtao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.4, thickness: 2.5, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.85;
  // Leave the sky, glass-like and glowing things out of the occlusion pass.
  gtao.overrideVisibility = function () {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      cache.set(o, o.visible);
      if (o.isPoints || o.isLine || o.isSprite || o === sky || (o.material && !Array.isArray(o.material) && o.material.transparent)) o.visible = false;
    });
  };
  composer.addPass(gtao);
  // Only light well above sunlit stone blooms: the vision, fire, glints, the sun.
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.45, 1.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

// Drop the costliest effects if the median frame is slow.
const governor = { skip: 45, samples: [], done: FX !== 'auto' };
function govern(dt) {
  if (governor.done || !composer) return;
  if (governor.skip > 0) { governor.skip--; return; }
  if (dt > 0.4) { governor.samples.length = 0; return; }   // tab hidden or a hitch
  governor.samples.push(dt);
  if (governor.samples.length < 90) return;
  const med = governor.samples.sort((a, b) => a - b)[45];
  if (med > 1 / 28) gtao.enabled = false;
  if (med > 1 / 16) { composer = null; W.vis.setGain(1); }
  governor.done = true;
}

// --- Build the world ------------------------------------------------------------
const W = {};
const allZones = [];
const houseZones = [];
const labels = [];
const fireMeshes = [];
const solids = [];
const overlays = {};
const LATER = ['late', 'ruin'];

async function build() {
  const step = async (txt, pct) => { $('#load-step').textContent = txt; $('#load-bar').style.width = pct + '%'; await tick(); };
  await step('Preparing stone, cedar and gold…', 6);
  W.mats = makeMaterials();
  installTerrainShader(W.mats.terrain);
  await step('Shaping the hills of Jerusalem…', 12);
  W.terrain = buildTerrain(W.mats, { seg: QUALITY === 'low' ? 520 : 680 });
  scene.add(W.terrain.group);
  await step('Laying out fields, threshing floors and roads…', 24);
  W.plan = planCountryside();
  overlays.late = paintOverlay('late', W.plan);
  await step('Building the city: houses, walls and gates…', 34);
  W.city = buildCity(W.mats, W.plan, { quality: QUALITY });
  for (const g of Object.values(W.city.groups)) scene.add(g);
  await step('Scattering limestone and scrub over the hills…', 48);
  W.nature = buildNature(W.mats, W.plan, { quality: QUALITY });
  scene.add(W.nature);
  await step('Measuring Ezekiel\'s gates and courts (40:5–42:20)…', 58);
  W.plat = buildPlatforms(W.mats);
  scene.add(W.plat.square.group, W.plat.sp.group, W.plat.shared.group);
  W.ez = buildEzekiel(W.mats);
  scene.add(W.ez.group);
  W.vis = makeVisionLooks();
  W.vision = buildEzekiel(W.mats, { vision: W.vis });
  scene.add(W.vision.group);
  W.river = buildRiver(W.mats);
  scene.add(W.river.group);
  W.reeds = buildReedsOutline();
  scene.add(W.reeds.mesh);
  W.migrash = buildMigrash();
  scene.add(W.migrash);
  W.ezCity = buildCityOfEzekiel(W.mats);
  scene.add(W.ezCity.group);
  await step('Building Solomon\'s house in three periods (1 Kings 6–7; 2 Kings 16; 25)…', 72);
  W.so = {};
  for (const v of PERIOD_KEYS) {
    W.so[v] = buildSolomon(W.mats, { variant: v });
    scene.add(W.so[v].templeGroup, W.so[v].siteGroup, W.so[v].courtGroup);
    fireMeshes.push(...W.so[v].fireMeshes);
  }
  fireMeshes.push(...W.ez.fireMeshes);
  // 573 BC: weeds over the deserted courts.
  const precinctY = (x, z) => {
    const u = x / CUBIT, v = z / CUBIT;
    if (u > -28 && u < 78 && Math.abs(v) < 28) return BASE_Y + H * CUBIT;
    if (u > -40 && u < 160 && Math.abs(v) < 50) return BASE_Y + I * CUBIT;
    return BASE_Y + O * CUBIT;
  };
  W.weeds = overgrowth(W.mats, { x0: PODIUM.x0 + 4, x1: PODIUM.x1 - 4, z0: PODIUM.z0 + 4, z1: PODIUM.z1 - 4, y: precinctY }, { count: QUALITY === 'low' ? 500 : 1100 });
  scene.add(W.weeds);
  await step('Filling the courts and streets…', 86);
  W.life = buildLife(W.mats, {
    plan: W.plan, walk: W.city.walk, gates: W.city.gates, smoke: W.city.smoke,
    ezAltar: W.ez.altarTop, ezHearths: W.ez.hearths, soAltar: W.so.early.altarTop, soAltarLate: W.so.late.altarTop,
  });
  for (const g of Object.values(W.life.groups)) scene.add(g);

  // Everything you can stand on when walking.
  const standOn = [W.plat.square.group, W.plat.sp.group, W.plat.shared.group, W.ez.group];
  for (const v of PERIOD_KEYS) standOn.push(W.so[v].templeGroup, W.so[v].siteGroup, W.so[v].courtGroup);
  for (const g of standOn) {
    g.traverse((o) => { if (o.isMesh && o.material !== W.mats.fire && !o.material.transparent) o.userData.solid = true; });
  }
  scene.traverse((o) => { if (o.isMesh && o.userData.solid) solids.push(o); });

  const tag = (zs, mode, periods) => zs.map((z) => ({ ...z, mode: INFO[z.id]?.mode || mode, periods: z.periods || periods }));
  allZones.push(
    ...tag(W.plat.square.zones, 'both', LATER), ...tag(W.plat.sp.zones, 'so', ['early']),
    ...tag(W.ez.zones, 'ez'), ...tag(W.river.zones, 'ez'),
    ...tag(W.city.zones, 'both'),
  );
  for (const v of PERIOD_KEYS) allZones.push(...tag(W.so[v].zones, 'so', [v]), ...tag(W.so[v].courtZones, 'so', [v]));
  houseZones.push(...allZones.filter((z) => z.id === 'ez-house' || z.id === 'so-house'));

  for (const l of LANDMARKS) addLabel(l.name, V(l.x, terrainY(l.x, l.z) + l.lift, l.z), 'land', { far: 5200, hideWithPalace: l.hideWithPalace, periods: l.periods });
  for (const l of W.ez.labels) addLabel(l.label, l.pos, 'ez', { far: 1100 });
  for (const l of W.river.markers) addLabel(l.label, l.pos, 'river', { far: 2600, small: true });
  addLabel(W.reeds.label.label, W.reeds.label.pos, 'reeds', { far: 9000 });
  for (const l of W.ezCity.labels) addLabel(l.label, l.pos, 'ezcity', { far: 16000, small: l.small });
  for (const v of PERIOD_KEYS) for (const l of W.so[v].labels) addLabel(l.label, l.pos, 'so', { far: 1100, small: l.small, periods: [v] });
  for (const l of W.city.labels) addLabel(l.label, l.pos, 'city', { far: 2400, small: true, periods: l.periods, info: l.info });
  addLabel(W.life.label.label, W.life.label.pos, 'man', { far: 220, small: true, info: 'city-man' });

  W.clouds = buildClouds();
  scene.add(W.clouds);
  await step('Lighting the lamps…', 96);
  patchScene(scene);
  setTime(parseFloat($('#time').value));
}

// --- Labels ---------------------------------------------------------------------
function addLabel(text, pos, kind, { far = 1000, small = false, hideWithPalace, periods, info } = {}) {
  const el = document.createElement('div');
  el.className = `label ${kind} ${small ? 'small' : ''} ${info ? 'has-info' : ''}`;
  el.textContent = text;
  el.style.display = 'none';
  if (info) el.addEventListener('click', () => { select(info); openSheet('info'); });
  $('#labels').appendChild(el);
  labels.push({ el, pos, kind, far, hideWithPalace, periods, shown: false });
}

const proj = new THREE.Vector3();
// Nearest labels win; any label that would overlap one already placed is hidden.
function updateLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const low = camera.position.y - terrainY(camera.position.x, camera.position.z) < 30;
  const indoors = houseZones.some((z) => z.box.containsPoint(camera.position) && zoneActive(z));
  const { vision, period, layers } = state;
  const ez = vision !== 'off';
  const cand = [];
  for (const l of labels) {
    let vis = layers.labels && !state.walking && !indoors;
    if (l.kind === 'ez') vis &&= ez;
    if (l.kind === 'so') vis &&= vision !== 'solid';
    if (l.kind === 'river') vis &&= ez && layers.river;
    if (l.kind === 'reeds') vis &&= ez && layers.reeds;
    if (l.kind === 'ezcity') vis &&= ez && layers.ezcity;
    if (l.kind === 'city') vis &&= layers.city;
    if (l.kind === 'man') vis &&= vision === 'solid' && layers.life;
    if (l.hideWithPalace) vis &&= vision === 'solid';
    if (l.periods) vis &&= l.periods.includes(period);
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

// --- State: period and vision ------------------------------------------------------
// period: early (c. 950 BC), late (c. 600 BC), ruin (573 BC).
// vision: off (the temple as it stood), glow (Ezekiel's vision laid over it as
// light), solid (Ezekiel's temple as if built, in place of Solomon's).
const state = {
  period: 'late',
  vision: 'glow',
  walking: false,
  layers: { labels: true, city: true, life: true, river: true, migrash: true, reeds: false, ezcity: false },
  selected: null,
};

function zoneActive(z) {
  const { period, vision } = state;
  const modeOK = z.mode === 'both' || (z.mode === 'ez' && vision !== 'off') || (z.mode === 'so' && vision !== 'solid');
  return modeOK && (!z.periods || z.periods.includes(period));
}

function setOverlay(period) {
  const key = period === 'early' ? 'early' : 'late';
  overlays[key] ||= paintOverlay(key, W.plan);
  const u = W.mats.terrain.userData.ov;
  u.ovColor.value = overlays[key].color;
  u.ovMask.value = overlays[key].mask;
}

function applyVisibility() {
  const { period, vision, layers } = state;
  const early = period === 'early', late = period === 'late', ruin = period === 'ruin';
  const solid = vision === 'solid', glow = vision === 'glow', ez = vision !== 'off';
  applySite(W.terrain, early ? 'sp' : 'square');
  setOverlay(period);
  W.plat.square.group.visible = !early;
  W.plat.sp.group.visible = early;
  W.ez.group.visible = solid;
  W.vision.group.visible = glow;
  W.river.group.visible = ez && layers.river;
  W.river.mesh.material = glow ? W.vis.looks.river.face : W.mats.water;
  W.migrash.visible = ez && layers.migrash;
  W.reeds.mesh.visible = ez && layers.reeds;
  W.ezCity.group.visible = ez && layers.ezcity;
  for (const v of PERIOD_KEYS) {
    const on = !solid && period === v;
    W.so[v].templeGroup.visible = W.so[v].siteGroup.visible = W.so[v].courtGroup.visible = on;
  }
  W.weeds.visible = ruin && !solid;

  const c = W.city.groups, city = layers.city;
  c.common.visible = city;
  c.early.visible = city && early;
  c.later.visible = city && !early;
  c.late.visible = city && late;
  c.ruin.visible = city && ruin;
  c.nearTrees.visible = city && !ruin;
  // Houses on the Ophel terrace only where no palace is shown.
  c.padLate.visible = city && late && solid;
  c.padRuin.visible = city && ruin && solid;

  const L = W.life.groups, life = layers.life;
  L.ezFolk.visible = life && solid && late;
  L.ezSpecial.visible = life && solid;
  L.soFolkEarly.visible = life && !solid && early;
  L.soFolkLate.visible = life && !solid && late;
  L.soCourtLate.visible = life && !solid && late;
  L.soCourtEarly.visible = life && !solid && early;
  L.soPalace.visible = life && !solid && !ruin;
  L.townLate.visible = life && city && late;
  L.townEarly.visible = life && city && early;
  L.countryEarly.visible = life && early;
  L.countryLate.visible = life && late;
  L.flocks.visible = life;
  L.ruinLife.visible = life && ruin && !solid;
  L.smokeEz.visible = solid && late;
  L.smokeEzKitchens.visible = solid && late;
  L.smokeSo.visible = !solid && early;
  L.smokeSoLate.visible = !solid && late;
  L.smokeLate.visible = city && late;
  L.smokeEarly.visible = city && early;
  document.querySelectorAll('.ez-only').forEach((el) => { el.hidden = !ez; });
}

const TITLES = {
  off: { early: 'Solomon\'s Temple', late: 'Solomon\'s Temple', ruin: 'The Temple in Ruins' },
  glow: 'Ezekiel\'s Vision',
  solid: 'Ezekiel\'s Temple',
};
const VISION_SUB = { off: '', glow: ' · vision overlaid', solid: ' · vision as if built' };

function writeHash() {
  const { period, vision } = state;
  const hash = { early: '950', late: '600', ruin: '573' }[period] + (vision === 'off' ? '' : '-' + vision);
  if (location.hash.slice(1) !== hash) {
    try { history.replaceState(null, '', '#' + hash); } catch { /* sandboxed frames may refuse */ }
  }
}

function renderControls() {
  const { period, vision } = state;
  document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === period)));
  document.querySelectorAll('.vision button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.vision === vision));
    if (b.dataset.vision === 'solid') {
      b.disabled = period === 'early';
      b.title = period === 'early' ? 'Ezekiel\'s temple needs the 500-cubit platform of the later Temple Mount: choose c. 600 BC or 573 BC' : 'Ezekiel\'s temple as if built, in place of Solomon\'s';
    }
  });
  document.body.dataset.mode = vision === 'off' ? 'so' : 'ez';
  document.body.dataset.vision = vision;
  $('#title').textContent = vision === 'off' ? TITLES.off[period] : TITLES[vision];
  $('#sub').textContent = `${PERIODS[period].name}, ${PERIODS[period].short}${VISION_SUB[vision]}`;
  $('#lyr-city-label').textContent = PERIODS[period].title.replace(/,.*$/, '');
  $('#vision-panel').hidden = vision !== 'glow';
}

function setScene({ period = state.period, vision = state.vision, fromHash = false } = {}) {
  if (period === 'early' && vision === 'solid') vision = 'glow';
  state.period = period;
  state.vision = vision;
  renderControls();
  applyVisibility();
  renderViews();
  select(null);
  if (!fromHash) writeHash();
}

// --- Camera views ---------------------------------------------------------------------
const OLIVET = () => V(560, terrainY(560, 40) + 26, 40);
const overview = { name: () => PERIODS[state.period].title, pos: () => V(360, 330, 820), target: () => V(40, 130, 90) };
const LIVE = ['early', 'late'];
const SO_VIEWS = [
  { name: 'Temple and palace', pos: () => S(330, 140, 620), target: () => S(80, 0, 260), periods: LIVE },
  { name: 'Ruined temple and palace', pos: () => S(330, 140, 620), target: () => S(80, 0, 260), periods: ['ruin'] },
  { name: 'From the Mount of Olives', pos: OLIVET, target: () => S(60, 20, 0) },
  { name: 'Courts of the house', pos: () => S(240, 60, 150), target: () => S(40, 15, 0) },
  { name: 'Jachin and Boaz', pos: () => S(118, I + EYE, 24), target: () => S(70, H + 12, 0), periods: LIVE },
  { name: 'Bronze Sea on twelve oxen', pos: () => S(88, I + 7, 47), target: () => S(50, I + 4, 30), periods: ['early'] },
  { name: 'Bronze Sea on its stone base', pos: () => S(88, I + 7, 47), target: () => S(50, I + 4, 30), periods: ['late'] },
  { name: 'Altar of Ahaz', pos: () => S(168, I + 16, 42), target: () => S(134, I + 5, -8), periods: ['late'] },
  { name: 'Upper Gate', pos: () => S(60, O + 14, -100), target: () => S(60, I + 6, -50), periods: ['late'] },
  { name: 'Inside the nave', pos: () => S(49, H + EYE, 3), target: () => S(5, H + 7, 0), periods: LIVE },
  { name: 'Cherubim and the ark', pos: () => S(9.2, H + 11, 9.2), target: () => S(-2, H + 5, -1), periods: LIVE },
  { name: 'Inside the burned house', pos: () => S(64, H + 16, 10), target: () => S(6, H + 2, 0), periods: ['ruin'] },
  { name: 'Palace on the Ophel', pos: () => S(290, 40, 720), target: () => S(110, -18, 470), periods: LIVE },
];
const COMPARE_VIEWS = [
  { name: 'Both houses from above', pos: () => E(-30, 150, 110), target: () => E(-100, H, 0) },
  { name: 'Both plans from above', pos: () => E(-20, 820, 2), target: () => E(-20, 0, 0) },
  { name: 'Side by side, from the east', pos: () => E(60, H + 20, 40), target: () => E(-110, H + 12, 0) },
  { name: 'Inside both naves', pos: () => E(-74, H + EYE + 2, 6), target: () => E(-130, H + 8, 0) },
  { name: 'The altars', pos: () => E(60, I + 22, 70), target: () => E(10, I + 6, 0) },
  { name: 'Ezekiel\'s east gates', pos: () => E(330, 46, 120), target: () => E(170, 8, 0) },
];
const EZ_VIEWS = [
  { name: 'Plan from above', pos: () => E(0, 1000, 2), target: () => E(0, 0, 0) },
  { name: 'Approaching the shut east gate', pos: () => E(322, 40, 92), target: () => E(236, 10, 0) },
  { name: 'The man with the measuring reed', pos: () => E(176, O + EYE + 2, 12), target: () => E(194, O + 2.5, -1) },
  { name: 'Outer court', pos: () => E(175, O + EYE, -150), target: () => E(60, O + 12, -10) },
  { name: 'Inner court and altar', pos: () => E(44, I + EYE, 34), target: () => E(0, I + 7, 0) },
  { name: 'Before the porch', pos: () => E(-18, I + EYE, 16), target: () => E(-60, H + 14, 0) },
  { name: 'Inside the nave', pos: () => E(-76, H + EYE, 4), target: () => E(-125, H + 7, 0) },
  { name: 'The Most Holy Place', pos: () => E(-116.5, H + EYE, 7), target: () => E(-132, H + 8, -6) },
];
const CITY_VIEWS = [
  { name: 'City of David and the Millo', pos: () => V(175, 150, 470), target: () => V(45, 95, 432) },
  { name: 'Gihon Spring and the Kidron', pos: () => V(235, 112, 565), target: () => V(110, 62, 500) },
  { name: 'Western Hill (Mishneh)', pos: () => V(-300, 215, 760), target: () => V(-480, 150, 420), periods: LATER },
  { name: 'Western Hill fields', pos: () => V(-300, 215, 760), target: () => V(-480, 150, 420), periods: ['early'] },
  { name: 'Silwan tombs across the Kidron', pos: () => V(110, 120, 610), target: () => V(250, 80, 560), periods: LATER },
  { name: 'The Babylonian siege ramp', pos: () => V(-668, 196, 92), target: () => V(-604, 158, 182), periods: ['ruin'] },
  { name: 'High places on the Mount of Corruption', pos: () => V(572, terrainY(572, 730) + 16, 730), target: () => V(610, terrainY(610, 690) + 2, 690), periods: ['early'] },
  { name: 'East to the Dead Sea and Moab', pos: () => V(830, terrainY(830, -40) + 40, -40), target: () => V(9000, 110, 2400) },
];
const LAYER_VIEWS = [
  { name: 'The river flowing east', pos: () => V(390, 178, 330), target: () => V(225, 100, 120), layer: 'river' },
  { name: '"500 reeds" to scale', pos: () => V(-1900, 1300, -1700), target: () => V(65, 110, 0), layer: 'reeds' },
  { name: 'Ezekiel 48 city to scale', pos: () => V(2300, 1500, -900), target: () => V(65, 100, 2700), layer: 'ezcity' },
];

function viewSections() {
  const { period, vision } = state;
  const inPeriod = (v) => !v.periods || v.periods.includes(period);
  const sections = [];
  if (vision === 'solid') sections.push(['Ezekiel\'s temple', [overview, { name: 'From the Mount of Olives', pos: OLIVET, target: () => E(-40, 16, 0) }, ...EZ_VIEWS]]);
  else sections.push([period === 'ruin' ? 'The ruined temple' : 'Solomon\'s temple', [overview, ...SO_VIEWS.filter(inPeriod)]]);
  if (vision === 'glow') sections.push(['Compare with the vision', COMPARE_VIEWS]);
  sections.push(['City and land', CITY_VIEWS.filter(inPeriod)]);
  if (vision !== 'off') sections.push(['Vision to scale', LAYER_VIEWS]);
  return sections;
}

let flight = null;
function flyTo(pos, target, ms = 1700) {
  if (state.walking) setWalking(false);
  flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : ms };
}

function renderViews() {
  const list = $('#views-list');
  list.replaceChildren();
  for (const [title, views] of viewSections()) {
    const h = document.createElement('div');
    h.className = 'views-head';
    h.textContent = title;
    list.appendChild(h);
    for (const v of views) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = typeof v.name === 'function' ? v.name() : v.name;
      b.addEventListener('click', () => {
        list.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
        if (v.layer && !state.layers[v.layer]) { state.layers[v.layer] = true; $('#lyr-' + v.layer).checked = true; applyVisibility(); }
        flyTo(v.pos(), v.target());
        closeSheets();
      });
      list.appendChild(b);
    }
  }
}

function renderLegend() {
  $('#legend').innerHTML = VISION_PARTS.filter((p) => p.tag !== 'court').map((p) =>
    `<li title="${esc(p.note)}"><i style="background:${p.color};box-shadow:0 0 8px ${p.color}"></i>${esc(p.label)}</li>`).join('');
}

// --- Info panel ---------------------------------------------------------------------
const PAIRS = {
  'ez-porch': 'so-porch', 'ez-nave': 'so-nave', 'ez-hoh': 'so-hoh', 'ez-side': 'so-side', 'ez-altar': 'so-altar',
  'ez-pillars': 'so-pillars', 'ez-house': 'so-house', 'ez-inner-court': 'so-inner-court', 'ez-river': 'so-sea',
  'ez-table': 'so-table', 'ez-wall': 'so-great-court', 'ez-platform': 'so-house', 'so-altar-ahaz': 'ez-altar',
  'so-ruin': 'ez-house', 'so-ruin-altar': 'ez-altar',
};
for (const [a, b] of Object.entries(PAIRS)) if (!PAIRS[b]) PAIRS[b] = a;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CITY_FACT = {
  early: 'City of David and the Ophel only, about 12–15 hectares. The Western Hill is farmland.',
  late: 'The City of David and the walled Western Hill, about 60 hectares.',
  ruin: 'Burned by Nebuzaradan in 586 BC; walls broken down (2 Kgs 25:8–10).',
};

const TEMPLE_NOW = {
  early: {
    eyebrow: '1 Kings 6–7 · c. 950 BC', head: 'Solomon\'s temple and palace',
    lead: 'Built in seven years (1 Kgs 6:38) on the threshing floor of Araunah (2 Chr 3:1), with the palace beside it on the Ophel. Kings gives the rooms and the bronze work in detail but no sizes for the courts, so those are reconstructions.',
    facts: '<dt>House</dt><dd>60 × 20 cubits, 30 high</dd><dt>Doors</dt><dd>Carved and overlaid with gold</dd><dt>Sea</dt><dd>On twelve bronze oxen</dd>',
  },
  late: {
    eyebrow: '2 Kings 16–23 · c. 600 BC', head: 'The temple Ezekiel knew',
    lead: 'Ezekiel was a priest (1:3) taken to Babylon in 597 BC. By his day the house was 350 years old and had been changed: Ahaz\'s great altar stood in front with the bronze altar moved to its north, the Sea sat on stones, the stands had lost their basins, and Hezekiah had stripped the gold from the doors. Jotham had built the Upper Gate.',
    facts: '<dt>Altar</dt><dd>Ahaz\'s, copied from Damascus (2 Kgs 16:10–15)</dd><dt>Sea</dt><dd>On a pavement of stones (16:17)</dd><dt>Doors</dt><dd>Gold stripped (18:16)</dd>',
  },
  ruin: {
    eyebrow: '2 Kings 25 · 573 BC', head: 'The temple in ruins',
    lead: 'Nebuzaradan burned the house of the LORD, the palace and every great house in 586 BC, broke down the walls and carried the bronze to Babylon. Ezekiel\'s vision is dated fourteen years later (40:1): this is what stood on the hill when it came.',
    facts: '<dt>Burned</dt><dd>586 BC (2 Kgs 25:8–9)</dd><dt>Bronze</dt><dd>Pillars, Sea and stands carried off (25:13–17)</dd><dt>Ruin</dt><dd>Wall heights are a reconstruction</dd>',
  },
};

function introHTML() {
  const { period, vision } = state;
  const city = `<dt>City</dt><dd>${CITY_FACT[period]}</dd>`;
  const now = TEMPLE_NOW[period];
  if (vision === 'off') {
    return `<div class="card"><div class="eyebrow">${now.eyebrow}</div><h2>${now.head}</h2>
      <p class="note">${now.lead}</p>
      <dl class="facts">${now.facts}${city}</dl>
      <p>Click any building, object or person for its sources. Turn on <b>Ezekiel's vision</b> above to lay his temple over this one.</p></div>`;
  }
  if (vision === 'glow') {
    const over = { early: 'Solomon\'s temple as built', late: 'the temple Ezekiel knew as a priest', ruin: 'the ruins of 573 BC, the year of the vision' }[period];
    return `<div class="card"><div class="eyebrow">Ezekiel 40–48 over ${PERIODS[period].short}</div>
      <h2>Ezekiel's vision, laid over ${over}</h2>
      <p class="note">The glowing plan is built from the numbers in Ezekiel 40–42; the solid buildings are what stood on the hill in ${PERIODS[period].short}. Both Most Holy Places sit over the rock, so the naves (40 × 20) and inner rooms (20 × 20) line up exactly. Everything else changes: a 500-cubit walled square, six great gates, two courts on terraces, and no palace beside the house (43:7–9).</p>
      <dl class="facts"><dt>Colours</dt><dd>By part; see "Vision colours" with the views</dd>
      <dt>Strength</dt><dd>Use the slider to fade the vision in or out</dd>${city}</dl>
      <p>Click a glowing part for Ezekiel's measurements, or a solid one for what stood there in ${PERIODS[period].short}. Open "Ezekiel vs Solomon" for the full table.</p></div>`;
  }
  const lead = period === 'ruin'
    ? 'Fourteen years after the city was struck down (40:1), a man with a measuring reed leads Ezekiel through a new temple in a vision. Here it stands, as if built, above the burned city of 573 BC.'
    : 'In the 25th year of the exile a man with a measuring reed of six long cubits leads Ezekiel through a temple on a very high mountain (40:1–5). Here it stands, as if built, in the city Ezekiel knew before its fall.';
  return `<div class="card"><div class="eyebrow">Ezekiel 40–48 · ${PERIODS[period].short}</div>
    <h2>A temple built from the measuring reed</h2>
    <p class="note">${lead} Every wall, gate and room is built from the numbers he records.</p>
    <dl class="facts"><dt>Cubit</dt><dd>Cubit + handbreadth = 52.5 cm</dd>
    <dt>Reed</dt><dd>6 cubits = 3.15 m</dd>
    <dt>Precinct</dt><dd>500 × 500 cubits = 262.5 m square</dd>
    <dt>Placed</dt><dd>Most Holy Place over the rock on the Temple Mount</dd>${city}
    <dt>Assumed</dt><dd>Heights of the house and gates, chamber sizes, finishes</dd></dl>
    <p>Click any building, object or person to see what it is and the sources behind it.</p></div>`;
}

function eyebrowFor(id, d) {
  if (d.mode === 'so') return /^so-ruin/.test(id) ? '2 Kings 25 · 573 BC' : `1 Kings · 2 Kings · ${PERIODS[state.period].short}`;
  if (d.mode === 'ez') return state.vision === 'glow' ? 'Ezekiel 40–48 · the vision' : 'Ezekiel 40–48';
  if (/^(city|gate|land)-/.test(id)) return `Jerusalem · ${PERIODS[state.period].short}`;
  return 'Temple Mount';
}

function infoHTML(id) {
  const d = INFO[id];
  let html = `<div class="card"><div class="eyebrow">${eyebrowFor(id, d)}</div><h2>${esc(d.title)}</h2>`;
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
  $('#pane-info').innerHTML = id && INFO[id] ? infoHTML(id) : introHTML();
  highlight.visible = !!box;
  if (box) highlight.box.copy(box);
  const goto = $('#pane-info [data-goto]');
  if (goto) goto.addEventListener('click', () => {
    const target = goto.dataset.goto;
    if (INFO[target].mode === 'ez') {
      if (state.vision === 'off') setScene({ vision: 'glow' });
    } else {
      if (state.vision === 'solid') setScene({ vision: 'glow' });
      if (state.period === 'ruin' && !/^so-ruin/.test(target)) setScene({ period: 'late' });
    }
    const z = allZones.filter((zz) => zz.id === target && zoneActive(zz)).sort((a, b) => vol(a.box) - vol(b.box))[0];
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

const isShown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
const within = (o, root) => { for (; o; o = o.parent) if (o === root) return true; return false; };

function pickTargets() {
  const roots = [W.terrain.mesh, W.ez.group, W.vision.group, W.river.group, W.plat.square.group, W.plat.sp.group, W.plat.shared.group,
    W.nature, W.weeds, ...Object.values(W.city.groups), ...Object.values(W.life.groups)];
  for (const v of PERIOD_KEYS) roots.push(W.so[v].templeGroup, W.so[v].siteGroup, W.so[v].courtGroup);
  return roots.filter((r) => r.visible);
}

function pick(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(pickTargets(), true).filter((h) => {
    const o = h.object;
    return !o.isSprite && !o.isLineSegments && o.material !== W.mats.fire && !o.userData.xray && o.userData.visionTag !== 'court' && isShown(o);
  });
  if (!hits.length) return;
  const hit = hits[0];
  const p = hit.point;
  // In the overlay, a glowing part answers with Ezekiel's card; anything solid
  // with the card of the period shown.
  const inVision = within(hit.object, W.vision.group);
  let best = null;
  for (const z of allZones) {
    if (!zoneActive(z)) continue;
    if (state.vision === 'glow' && (z.mode === 'ez') !== inVision) continue;
    if (z.box.clone().expandByScalar(0.35).containsPoint(p) && (!best || vol(z.box) < vol(best.box))) best = z;
  }
  if (best) { select(best.id, best.box); openSheet('info'); return; }
  let o = hit.object;
  while (o && !o.userData.infoId) o = o.parent;
  if (!o) { select(null); return; }
  let box;
  if (hit.object.isInstancedMesh && hit.instanceId !== undefined) {
    const m = new THREE.Matrix4();
    hit.object.getMatrixAt(hit.instanceId, m);
    if (!hit.object.geometry.boundingBox) hit.object.geometry.computeBoundingBox();
    box = hit.object.geometry.boundingBox.clone().applyMatrix4(m).applyMatrix4(hit.object.matrixWorld);
  } else if (o !== W.terrain.mesh) {
    box = new THREE.Box3().setFromObject(o);
    if (box.getSize(new THREE.Vector3()).length() > 400) box = undefined;   // too large to outline usefully
  }
  select(o.userData.infoId, box);
  openSheet('info');
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

const solidTargets = () => solids.filter(isShown);

function groundAt(x, z, eyeY) {
  downRay.set(V(x, eyeY - 0.9, z), V(0, -1, 0));
  const hits = downRay.intersectObjects(solidTargets(), false).filter((h) => !h.object.material.transparent);
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
    : 'Drag to look around · right-drag to pan · scroll to zoom · click anything for its sources';
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
    const blocked = fwdRay.intersectObjects(solidTargets(), false).some((h) => !h.object.material.transparent);
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
document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => setScene({ period: b.dataset.period })));
document.querySelectorAll('.vision button').forEach((b) => b.addEventListener('click', () => setScene({ vision: b.dataset.vision })));
$('#strength').addEventListener('input', (e) => W.vis?.setStrength(parseFloat(e.target.value)));
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

// #600-glow, #573-solid, #950 … Older links (#ezekiel, #solomon-600, #overlay) still work.
function fromHash() {
  const h = location.hash.slice(1);
  const m = /^(950|600|573)(?:-(glow|solid))?$/.exec(h);
  if (m) return { period: { 950: 'early', 600: 'late', 573: 'ruin' }[m[1]], vision: m[2] || 'off' };
  const [name, year] = h.split('-');
  const period = { 950: 'early', 600: 'late', 573: 'ruin' }[year];
  if (name === 'ezekiel') return { period: period || 'late', vision: 'solid' };
  if (name === 'solomon') return { period: period || 'early', vision: 'off' };
  if (name === 'overlay') return { period: 'late', vision: 'glow' };
  return null;
}
addEventListener('hashchange', () => {
  const h = fromHash();
  if (h && (h.period !== state.period || h.vision !== state.vision)) setScene({ ...h, fromHash: true });
});

// --- Loop ---------------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer?.setPixelRatio(renderer.getPixelRatio());
  composer?.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

// Near plane: far enough out for depth precision across the hills, close
// enough not to cut into whatever the camera is near.
function updateNear() {
  const ground = camera.position.y - terrainY(camera.position.x, camera.position.z);
  const near = state.walking ? 0.12
    : THREE.MathUtils.clamp(Math.min(camera.position.distanceTo(controls.target), Math.max(ground, 0.5)) * 0.06, 0.12, 12);
  if (Math.abs(near - camera.near) > camera.near * 0.15) {
    camera.near = near;
    camera.updateProjectionMatrix();
  }
}

const clock = new THREE.Clock();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let lastNow = performance.now();
function frame() {
  const now = performance.now();
  govern((now - lastNow) / 1000);
  lastNow = now;
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
  updateNear();
  const focus = state.walking ? camera.position : controls.target;
  updateShadowFrustum(focus, state.walking ? 120 : camera.position.distanceTo(controls.target));
  W.mats.water.normalMap.offset.set(time * 0.01, -time * 0.06);
  W.vis.shared.time.value = time;
  clouds.cloudTime.value = time;
  W.clouds.userData.follow(camera);
  for (const m of fireMeshes) {
    if (!m.parent?.visible) continue;
    const s = m.userData.base * (0.8 + 0.25 * Math.sin(time * 9 + m.userData.phase) + 0.1 * Math.sin(time * 23 + m.userData.phase * 3));
    m.scale.set(m.userData.base * 0.9, s * 2, 1);
  }
  const flick = 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 7.3);
  W.ez.altarLight.intensity = 90 * flick;
  for (const v of PERIOD_KEYS) if (W.so[v].altarLight) W.so[v].altarLight.intensity = 90 * flick;
  for (const g of Object.values(W.life.groups)) if (g.visible && g.userData.update) g.userData.update(time);
  if (composer) composer.render(dt);
  else renderer.render(scene, camera);
  updateLabels();
  requestAnimationFrame(frame);
}

// --- Start --------------------------------------------------------------------------------
build().then(() => {
  setupEffects();
  W.vis.setGain(composer ? 2.2 : 1);   // brighter where bloom can spread it
  resize();
  renderCompare();
  renderLegend();
  const h = fromHash() || { period: 'late', vision: 'glow' };
  setScene({ ...h, fromHash: !!fromHash() });
  $('#loading').classList.add('done');
  window.ezt = { scene, camera, controls, renderer, W, state, setScene, setTime, flyTo, select, viewSections, get composer() { return composer; }, get gtao() { return gtao; }, get bloom() { return bloom; } };
  frame();
}).catch((err) => {
  console.error(err);
  $('#load-step').textContent = 'The model could not be built.';
  const e = $('#error');
  e.style.display = 'block';
  e.textContent = `${err.message}. WebGL may be turned off in this browser; try another browser or device.`;
});
