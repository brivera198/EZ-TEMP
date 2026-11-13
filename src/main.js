import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { INFO, COMPARE, LANDMARKS, CUBIT, BASE_Y, LEVEL, PERIODS, SOLOMON_PLATFORM, PALACE_PAD } from './data.js';
import { makeMaterials, nightLights, surfShared, texturesReady } from './materials.js';
import { buildTerrain, terrainY, applySite, installTerrainShader, paintOverlay, PODIUM, inRect } from './terrain.js';
import { buildCity, planCountryside } from './city.js';
import { buildLife, focus as crowdFocus } from './life.js';
import { buildNature, overgrowth } from './nature.js';
import { buildEzekiel, buildRiver, buildReedsOutline, buildMigrash, buildCityOfEzekiel, toWorld as E } from './ezekiel.js';
import { buildSolomon, buildPlatforms } from './solomon.js';
import { makeVisionLooks, VISION_PARTS } from './vision.js';
import { atmo, patchScene, clouds, buildClouds } from './atmosphere.js';
import { celestial, VolumetricClouds, weatherTexture, buildStars, buildMoon } from './sky.js';
import { Reflections, waterShared } from './water.js';
import { LightPool, installSunCascade, placeShadow } from './lights.js';
import { shared as figureShared } from './people.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createTour } from './tour.js';
import { DIM_LAYER } from './dims.js';
import { CollisionWorld, Body, Head, BODY, Controls, flyStep } from './walker.js';

const $ = (s) => document.querySelector(s);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S = (u, y, v) => V(u * CUBIT, BASE_Y + y * CUBIT, v * CUBIT);   // Solomon frame (origin over the rock)
const { outer: O, inner: I, house: H } = LEVEL;
const EYE = 1.65 / CUBIT;                                          // eye height in cubits
const tick = () => new Promise((r) => setTimeout(r, 0));
const coarse = matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);
// Graphics. The visitor's own choice (the Graphics switch, or ?quality=)
// comes first. Otherwise the page looks at the graphics chip itself rather
// than guessing from the pointer or the core count (tablets and phones
// under-report their cores): a recent phone, a tablet or a computer gets the
// full pipeline, and the governor (govern) then trades resolution and effects
// for frame rate on the frames it measures. Only software rendering, WebGL 1,
// very little memory and old phone chips start on 'low'.
const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* private window */ } };
const tablet = coarse && Math.min(screen.width, screen.height) >= 700;
const CHOICE = [params.get('quality'), stored('ezt-graphics')].find((q) => q === 'low' || q === 'high') || null;
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
function autoQuality() {
  const gl = renderer.getContext();
  if (!renderer.capabilities.isWebGL2) return 'low';
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch { /* not told */ }
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) return 'low';
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return 'low';
  if (!coarse || tablet) return 'high';
  // A phone: Apple's own GPUs (every recent iPhone reports "Apple GPU"), and
  // recent Adreno, Mali, Immortalis and Xclipse chips manage the full pipeline.
  if (/apple/i.test(gpu)) return 'high';
  const adreno = /adreno[^0-9]*([0-9]{3})/i.exec(gpu);
  if (adreno) return +adreno[1] >= 640 ? 'high' : 'low';
  if (/immortalis|xclipse|mali-g(7[1-9]|[89][0-9]|6[1-9][0-9]|7[0-9][0-9])/i.test(gpu)) return 'high';
  return gpu ? 'low' : 'high';
}
const QUALITY = CHOICE || autoQuality();
// Anything that goes wrong is listed in the Graphics section of the Views
// panel, so a visitor on a device nobody has tested can say what happened.
const problems = [];
function report(msg) {
  msg = String(msg).slice(0, 220);
  if (problems.length >= 6 || problems.includes(msg)) return;
  problems.push(msg);
  const el = $('#gfx-diag');
  if (el) { el.hidden = false; el.textContent = problems.join('\n'); }
}
addEventListener('error', (e) => report(`${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno || 0})`));
addEventListener('unhandledrejection', (e) => report(e.reason?.message || e.reason));
renderer.debug.onShaderError = (gl, program, vs, fs) => {
  const log = gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(program) || 'no log';
  report('Shader failed: ' + log.split('\n').find((l) => l.trim()) );
};
// Screen effects: 'on', 'off', or 'auto' (dropped if the frame rate suffers).
const FX = params.get('fx') || (QUALITY === 'low' ? 'off' : 'auto');
const PERIOD_KEYS = ['early', 'late', 'ruin'];
if (QUALITY === 'low') clouds.cloudOn.value = 0;   // cloud shadows cost a little on every lit pixel
installSunCascade();

// --- Renderer, scene, camera ----------------------------------------------------
// The screen's own resolution (up to 2 device pixels per CSS pixel), times a
// scale the governor lowers when frames are slow and raises when they are fast.
const BASE_RATIO = Math.min(devicePixelRatio || 1, QUALITY === 'low' ? 1.5 : 2);
const view = { scale: 1 };
renderer.setPixelRatio(BASE_RATIO);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;   // once per frame (frame()), not for every extra render
renderer.toneMapping = params.get('tone') === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const ANISO = Math.min(16, renderer.capabilities.getMaxAnisotropy() || 1);

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
controls.maxDistance = 30000;
controls.zoomToCursor = true;           // scroll toward what is under the pointer
controls.target.set(40, 130, 90);
camera.layers.enable(1);                 // the cloud layer (mirror cameras leave it out)
camera.layers.enable(DIM_LAYER);         // measurements drawn by the guided tour
let tour = null;                         // the guided tour, made once the world is built

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
// The environment is the sky at this hour plus the ground it lights, seen
// from the middle of the land: shaded walls take the sky's blue from above
// and the warm light bounced off sunlit earth and stone from below, and
// metals and water reflect the real sky. envGain sets how much of the sky's
// radiance reaches the shade (the sky model's units are not the sun's).
envSky.material.uniforms.envGain = { value: 0.45 };
envSky.material.fragmentShader = 'uniform float envGain;\n' + envSky.material.fragmentShader
  .replace('gl_FragColor = vec4( min( retColor, vec3( 20.0 ) ), 1.0 );', 'gl_FragColor = vec4( min( retColor * envGain, vec3( 20.0 ) ), 1.0 );');
const envGround = new THREE.Mesh(new THREE.CircleGeometry(48, 32), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false }));
envGround.rotation.x = -Math.PI / 2;
envGround.position.y = -1.2;
envScene.add(envGround);
for (const s of [sky, envSky]) {
  const u = s.material.uniforms;
  u.turbidity.value = 5.5;
  u.rayleigh.value = 1.3;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
}
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

// The sun casts two shadow maps: a wide one over everything in view, and a
// tight one round the viewer, where people, steps and doorways need shadows
// a few centimetres sharp. The second light gives no light of its own; the
// shader (lights.js) takes its shadow near the viewer and blends to the wide
// map toward its edge. Biases are set from each map's texel size (placeShadow).
const sun = new THREE.DirectionalLight(0xfff0d8, 3);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(QUALITY === 'low' ? 2048 : 4096);
scene.add(sun, sun.target);
const sunNear = new THREE.DirectionalLight(0xffffff, 0);
sunNear.castShadow = QUALITY !== 'low';
sunNear.shadow.mapSize.setScalar(2048);
scene.add(sunNear, sunNear.target);
const hemi = new THREE.HemisphereLight(0xc4d6ee, 0x8c6c4a, 0.6);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xcfd6dc, 6e-5);

const sunDir = new THREE.Vector3();
const lightDir = new THREE.Vector3(0, 1, 0);      // the sun by day, the full moon by night
const moonDir = new THREE.Vector3();
const sky24 = { hours: 9, day: 1, night: 0 };
const EXPOSURE = renderer.toneMapping === THREE.AgXToneMapping ? 0.9 : 0.58;
const sm = THREE.MathUtils.smoothstep;
const _c = new THREE.Color();
let envHours = -99;
function setTime(hours) {
  const c = celestial(hours);
  sunDir.copy(c.sun);
  moonDir.copy(c.moon);
  const { day, night } = c;
  Object.assign(sky24, { hours, day, night });
  for (const s of [sky, envSky]) s.material.uniforms.sunPosition.value.copy(sunDir);
  // Sunlight by day; after dusk the same light becomes the moon's.
  if (sunDir.y > -0.05) {
    lightDir.copy(sunDir);
    sun.intensity = 3.2 * sm(sunDir.y, -0.02, 0.12);
    sun.color.setHSL(0.09, 0.75, 0.62 + 0.3 * day);
  } else {
    lightDir.copy(moonDir);
    sun.intensity = 0.34 * sm(moonDir.y, 0.0, 0.25) * night;
    sun.color.setRGB(0.6, 0.7, 1.0);
  }
  // Twilight: the sky still lights the land for a while after sunset.
  const dusk = sm(sunDir.y, -0.22, 0.0) * (1 - sm(sunDir.y, 0.0, 0.2));
  // By day the environment (envSky, envGround) is the sky light; the
  // hemisphere light is the fill of twilight and moonlit night.
  hemi.intensity = 0.1 + 0.1 * day + 0.35 * dusk;
  hemi.color.setRGB(0.2, 0.26, 0.42).lerp(_c.setRGB(0.77, 0.84, 0.93), day);
  hemi.groundColor.setRGB(0.05, 0.05, 0.07).lerp(_c.setRGB(0.55, 0.42, 0.29), day);
  // At night the eye adapts: open the exposure and let the haze go blue-black.
  const boost = 1 + 0.25 * (1 - day) + 0.5 * dusk + 1.3 * night;
  renderer.toneMappingExposure = EXPOSURE * boost;
  // The vision is light of its own: keep it from swelling as the exposure opens.
  if (W.vis) W.vis.setGain(W.vis.baseGain / boost);
  scene.fog.color.setHSL(THREE.MathUtils.lerp(0.08, 0.58, day), 0.3 - 0.1 * day, 0.42 + 0.22 * day).lerp(_c.setRGB(0.025, 0.035, 0.065), night);
  scene.fog.density = 2.3e-5 + 3.5e-5 * (1 - day) * (1 - night) + 1.2e-5 * night;
  atmo.fogSunDir.value.copy(lightDir);
  atmo.fogSunColor.value.setHSL(0.085, 0.7 - 0.3 * day, 0.55 + 0.25 * day).lerp(_c.setRGB(0.08, 0.1, 0.16), night);
  clouds.cloudLight.value = 0.08 + 0.92 * day;
  nightLights.houseGlow.value = 1.1 * sm(1 - day, 0.55, 0.95);
  if (W.vclouds) {
    const u = W.vclouds.u;
    u.lightDir.value.copy(lightDir);
    if (sunDir.y > -0.05) u.lightCol.value.copy(sun.color).multiplyScalar(4.2 * sm(sunDir.y, -0.03, 0.1));
    else u.lightCol.value.setRGB(0.07, 0.085, 0.13).multiplyScalar(night);
    u.ambTop.value.setRGB(0.42, 0.55, 0.78).multiplyScalar(0.015 + 0.985 * day);
    u.ambLow.value.setRGB(0.36, 0.32, 0.28).multiplyScalar(0.01 + 0.99 * day);
    u.hazeCol.value.copy(scene.fog.color);
  }
  // Light bounced from the ground: sunlit earth and limestone, about 0.35 albedo.
  const sunUp = Math.max(0, sunDir.y) * sun.intensity * (sunDir.y > -0.05 ? 1 : 0);
  envGround.material.color.setRGB(0.62, 0.5, 0.38).multiplyScalar(0.35 * (sunUp + 0.5 * day) / Math.PI);
  atmo.mist.value = sm(hours, 4.3, 5.6) * (1 - sm(hours, 6.4, 8.2));
  atmo.dust.value = sm(hours, 11.5, 14.5) * (1 - sm(hours, 17.6, 19.2));
  // Re-light the environment only when the sky has visibly changed.
  if (Math.abs(hours - envHours) > 0.12) {
    envHours = hours;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    if (W.crowdsLevel) W.crowdsLevel(hours);
  }
  const h = Math.floor(hours) % 24, m = Math.floor((hours - Math.floor(hours)) * 60);
  $('#time-out').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Shadow frusta follow what you are looking at: the wide map over the view,
// the tight one round the focus (the walker's feet when walking). Both are
// snapped to whole texels so shadows do not shimmer as the camera moves.
function updateShadowFrustum(focus, dist, near) {
  placeShadow(sun, lightDir, focus, THREE.MathUtils.clamp(dist * 0.85, 60, 900));
  if (sunNear.castShadow) placeShadow(sunNear, lightDir, near || focus, THREE.MathUtils.clamp(dist * 0.12, 16, 60));
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
// A restrained grade, in linear light before tone mapping: a touch less
// saturation in the darks, shadows a shade cooler and highlights a shade
// warmer, as limestone looks in strong sun.
const Grade = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 g = mix(vec3(l), c.rgb, 0.9 + 0.1 * smoothstep(0.02, 0.4, l));
      g *= mix(vec3(0.975, 0.99, 1.03), vec3(1.02, 1.0, 0.975), smoothstep(0.03, 0.6, l));
      gl_FragColor = vec4(g, c.a);
    }`,
};
let composer = null, gtao = null, bloom = null, smaa = null;
function setupEffects() {
  // Half-float targets need WebGL 2 and a colour-buffer-float extension
  // (Safari exposes the half-float one); without them, render directly.
  const halfOK = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  if (FX === 'off' || !halfOK) return;
  try {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    // Multisampled where the browser allows it: thin parapets, ladders and
    // grass stay smooth through the effects.
    const samples = Math.min(4, renderer.capabilities.maxSamples || 0);
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new ShaderPass(Sanitize));
    gtao = new GTAOPass(scene, camera, w, h);
    // Street scale: a short radius, so feet, jars and the foot of a wall
    // darken the ground right where they touch it.
    gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.8;
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
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.45, 2.0);
    composer.addPass(bloom);
    composer.addPass(new ShaderPass(Grade));
    composer.addPass(new OutputPass());
    // Without multisampling, a morphological pass smooths edges instead.
    if (!samples) { smaa = new SMAAPass(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); composer.addPass(smaa); }
  } catch (err) {
    console.warn('Screen effects could not start; rendering directly.', err);
    composer = null;
  }
}

// The governor: watches the frame time and, when frames are slow, first
// lowers the resolution (down to three quarters of a CSS pixel), then drops
// the costliest effects one by one; when frames are quick again it raises the
// resolution back. Effects once dropped stay off (no flickering back and forth).
// It stays out of the way when the visitor set fx= explicitly.
const governor = { skip: 60, samples: [], fast: 0, stage: 0, off: params.has('fx') };
const MIN_RATIO = 0.75;
function setScale(k) {
  view.scale = THREE.MathUtils.clamp(k, MIN_RATIO / BASE_RATIO, 1);
  renderer.setPixelRatio(BASE_RATIO * view.scale);
  resize();
}
const STAGES = [
  () => { if (gtao) gtao.enabled = false; },
  () => { W.refl.enabled = false; },
  () => { if (W.vclouds) { W.vclouds.scale = 0.34; resize(); } },
  () => { if (sunNear.castShadow) { sunNear.castShadow = false; sunNear.shadow.map?.dispose(); sunNear.shadow.map = null; } },
  () => { if (bloom) bloom.enabled = false; },
  () => { composer = null; W.vis.baseGain = 1; setTime(sky24.hours); },
];
function govern(dt) {
  if (governor.off) return;
  if (governor.skip > 0) { governor.skip--; return; }
  if (dt > 0.4) { governor.samples.length = 0; return; }   // tab hidden or a hitch
  governor.samples.push(dt);
  if (governor.samples.length < 60) return;
  const med = governor.samples.sort((a, b) => a - b)[30];
  governor.samples.length = 0;
  if (med > 1 / 40) {                       // slower than 40 frames a second
    governor.fast = 0;
    governor.skip = 30;                     // let the change settle before judging again
    if (view.scale * BASE_RATIO > MIN_RATIO + 0.01) setScale(view.scale * (med > 1 / 20 ? 0.7 : 0.85));
    else if (governor.stage < STAGES.length) STAGES[governor.stage++]();
  } else if (med < 1 / 55 && view.scale < 1) {
    if (++governor.fast >= 3) { governor.fast = 0; setScale(view.scale * 1.12); }
  } else governor.fast = 0;
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
// Detail modules: each adds one kind of detail to the land and its people
// through the same small interface (see docs/MODULES.md). One that is
// missing or fails is left out; the rest of the world still builds.
const DETAIL_MODULES = ['props', 'trades', 'fauna', 'flora'];
const details = [];

async function build() {
  const step = async (txt, pct) => { $('#load-step').textContent = txt; $('#load-bar').style.width = pct + '%'; await tick(); };
  await step('Preparing stone, cedar and gold…', 6);
  W.mats = makeMaterials({ quality: QUALITY, anisotropy: ANISO });
  installTerrainShader(W.mats.terrain, QUALITY);
  await step('Shaping the hills of Jerusalem…', 12);
  W.terrain = buildTerrain(W.mats, { seg: QUALITY === 'low' ? 520 : 680 });
  scene.add(W.terrain.group);
  surfShared.sfGround.value = W.terrain.heightTex;
  surfShared.sfGroundRect.value.copy(W.terrain.heightRect);
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
    quality: QUALITY, plan: W.plan, walk: W.city.walk, gates: W.city.gates, smoke: W.city.smoke,
    grids: W.city.grids, houses: W.city.houses, night: W.city.night,
    ezAltar: W.ez.altarTop, ezHearths: W.ez.hearths, soAltar: W.so.early.altarTop, soAltarLate: W.so.late.altarTop,
  });
  for (const g of Object.values(W.life.groups)) scene.add(g);
  // How many people are out at each hour.
  const out = (h, a0, a1, b0, b1) => sm(h, a0, a1) * (1 - sm(h, b0, b1));
  const LEVELS = {
    townLate: (h) => 0.1 + 0.9 * out(h, 5, 7.5, 19, 21.5), townEarly: (h) => 0.1 + 0.9 * out(h, 5, 7.5, 19, 21.5),
    ezFolk: (h) => 0.05 + 0.95 * out(h, 5.5, 7.5, 18, 20), soCourtLate: (h) => 0.04 + 0.96 * out(h, 5.5, 7.5, 18, 20),
    soCourtEarly: (h) => 0.04 + 0.96 * out(h, 5.5, 7.5, 18, 20), soFolkEarly: (h) => 0.3 + 0.7 * out(h, 5, 7, 19, 21),
    soFolkLate: (h) => 0.3 + 0.7 * out(h, 5, 7, 19, 21), soPalace: (h) => 0.25 + 0.75 * out(h, 6, 8, 19, 22),
    countryEarly: (h) => out(h, 5.5, 7, 17.5, 19.5), countryLate: (h) => out(h, 5.5, 7, 17.5, 19.5), countryRuin: (h) => out(h, 6, 7.5, 17, 19),
  };
  W.crowdsLevel = (h) => { for (const [k, f] of Object.entries(LEVELS)) W.life.crowds[k]?.setLevel(f(h % 24)); };

  // Night: fires in courtyards and torches at the gates, and the light they cast.
  W.lights = new LightPool(scene, QUALITY === 'low' ? 4 : 8);
  const flames = (fires, torches) => {
    const g = new THREE.Group();
    for (const [list, size] of [[fires, 0.5], [torches, 0.32]]) for (const p of list) {
      const m = new THREE.Sprite(W.mats.fire);
      m.center.set(0.5, 0.03);
      m.position.copy(p);
      m.userData.base = size * (0.8 + Math.random() * 0.4);
      m.userData.phase = Math.random() * 10;
      g.add(m);
      fireMeshes.push(m);
    }
    return g;
  };
  W.flames = { late: flames(W.city.night.late.fires, W.city.night.late.torches), early: flames(W.city.night.early.fires, W.city.night.early.torches) };
  scene.add(W.flames.late, W.flames.early);
  for (const v of PERIOD_KEYS) for (const l of W.so[v].lights) W.lights.add({ ...l, shown: () => W.so[v].templeGroup.visible });
  for (const l of W.ez.lights) W.lights.add({ ...l, shown: () => W.ez.group.visible });
  for (const v of ['late', 'early']) {
    for (const p of W.city.night[v].fires) W.lights.add({ pos: p.clone().setY(p.y + 0.7), power: 5, range: 14, nightOnly: true, shown: () => W.flames[v].visible });
    for (const p of W.city.night[v].torches) W.lights.add({ pos: p, power: 12, range: 20, nightOnly: true, shown: () => W.flames[v].visible });
  }

  await step('Adding the details of daily life…', 90);
  // Clear of the temple platforms and the palace, which change with the vision shown.
  const free = (x, z, m = 6) => !inRect(x, z, PODIUM, m) && !inRect(x, z, SOLOMON_PLATFORM, m) && !inRect(x, z, PALACE_PAD, m);
  for (const name of DETAIL_MODULES) {
    try {
      const mod = await import(`./${name}.js`);
      const d = mod.build(W.mats, { quality: QUALITY, plan: W.plan, city: W.city, terrainY, free }) || {};
      d.name = name;
      d.groups ||= [];
      for (const g of d.groups) scene.add(g.group);
      const shownIn = (periods) => () => (!periods || periods.includes(state.period)) && state.layers[d.layer || 'city'];
      for (const l of d.lights || []) W.lights.add({ ...l, shown: shownIn(l.periods) });
      fireMeshes.push(...(d.fireMeshes || []));
      for (const l of d.labels || []) addLabel(l.label, l.pos, 'city', { far: l.far || 1200, small: true, periods: l.periods, info: l.info });
      Object.assign(INFO, d.info || {});
      allZones.push(...(d.zones || []).map((z) => ({ mode: 'both', ...z })));
      details.push(d);
    } catch (e) {
      console.warn(`Detail module "${name}" left out: ${e.message}`);
      report(`Module ${name} left out: ${e.message}`);
    }
    await tick();
  }

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

  await step('Gathering the clouds…', 92);
  clouds.cloudMap.value = weatherTexture();
  if (QUALITY === 'low') {
    W.clouds = buildClouds();
    scene.add(W.clouds);
  } else {
    W.vclouds = new VolumetricClouds(renderer, clouds.cloudMap.value);
    scene.add(W.vclouds.composite);
  }
  W.stars = buildStars();
  W.moon = buildMoon();
  scene.add(W.stars, W.moon);

  // Reflections: water mirrors its surroundings; gold reflects a lit room;
  // bronze in the courts reflects the courts (a probe, refreshed as needed).
  W.refl = new Reflections(renderer, scene);
  W.refl.enabled = QUALITY !== 'low';
  scene.updateMatrixWorld(true);
  W.refl.collect(scene);
  const room = pmrem.fromScene(new RoomEnvironment(renderer), 0.04);
  for (const k of ['gold', 'goldCarved', 'goldFloor']) { W.mats[k].envMap = room.texture; W.mats[k].envMapIntensity = 0.55; }
  W.probe = { rt: new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }), last: -1e9, hours: -99, env: null };
  W.probe.cam = new THREE.CubeCamera(1, 2500, W.probe.rt);
  W.probe.cam.position.copy(S(70, I + 9, 26));
  // The probe sees only the big shapes (layer 2): sky, ground, platforms,
  // temples, palace, city walls. People, trees and houses add little and cost a lot.
  const big = [sky, W.terrain.group, W.plat.square.group, W.plat.sp.group, W.plat.shared.group, W.ez.group, W.city.groups.late, W.city.groups.early, W.city.groups.ruin];
  for (const v of PERIOD_KEYS) big.push(W.so[v].templeGroup, W.so[v].siteGroup, W.so[v].courtGroup);
  for (const g of big) g.traverse((o) => { if (!o.isInstancedMesh) o.layers.enable(2); });
  W.probe.cam.children.forEach((c) => c.layers.set(2));
  await step('Lighting the lamps…', 96);
  await texturesReady();
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
    // On the tour only the names a stop asks for stay; its measurements take their place.
    if (tour?.active) vis &&= tour.labelOK(l.kind);
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
  cam: 'orbit',
  walking: false,
  flying: false,
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
  u.ovField.value = overlays[key].field;
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
  W.river.mesh.material = glow ? W.vis.looks.river.face : W.mats.waterFlow;
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

  for (const d of details) for (const g of d.groups) {
    g.group.visible = (!g.periods || g.periods.includes(period)) && layers[g.layer || d.layer || 'city'];
  }

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
  L.countryRuin.visible = life && ruin;
  W.probe.last = -1e9;      // the courts changed: refresh the bronze reflections
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
  if (state.cam !== 'orbit') setCameraMode('orbit');
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
    W.nature, W.weeds, ...Object.values(W.city.groups), ...Object.values(W.life.groups), ...details.flatMap((d) => d.groups.map((g) => g.group))];
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

// --- Camera: orbit, fly, walk -------------------------------------------------------
// orbit: turn about a point (the default). fly: go anywhere, through walls,
// from the ground to high above the hills. walk: first person at eye height,
// a body that is stopped by walls, climbs steps and falls off edges. The
// movement itself is in walker.js.
const keys = new Set();
const walk = { yaw: 0, pitch: 0, vy: 0 };   // where the eyes point, in walking and flying
const fly = { speed: 1, v: new THREE.Vector3() };   // speed: multiplier, set with the wheel
let panelsAuto = false;                  // panels hidden for flying or walking, to come back after
const aimRay = new THREE.Raycaster();
const HINTS = {
  orbit: 'Drag to look around · right-drag to pan · scroll to zoom · click anything for its sources',
  fly: 'Mouse to look · W A S D to fly · E or Space up · Q or C down · Shift faster · scroll for speed · click for sources · Esc to free the mouse',
  walk: 'Mouse to look · W A S D to walk · Shift to run · Space to jump · click for sources · Esc to free the mouse',
  flyFree: 'Click to look with the mouse, or drag · W A S D to fly · E up · Q down · Shift faster · Esc to stop',
  walkFree: 'Click to look with the mouse, or drag · W A S D to walk · Shift to run · Space to jump · Esc to stop',
  flyDrag: 'Drag to look · W A S D to fly · E or Space up · Q or C down · Shift faster · scroll for speed · click for sources · Esc to stop',
  walkDrag: 'Drag to look · W A S D or arrows to walk · Shift to run · Space to jump · click for sources · Esc to stop',
  flyTouch: 'Left thumb to fly · drag to look · Up and Down buttons · tap for sources',
  walkTouch: 'Left thumb to walk, further to go faster · drag to look · tap for sources',
};

const solidTargets = () => solids.filter(isShown);
const heightAboveGround = () => camera.position.y - terrainY(camera.position.x, camera.position.z);

// The walking body and the grid of solid meshes it collides with.
const world = new CollisionWorld(() => solids, isShown);
const body = new Body(world, (x, z) => terrainY(x, z));
const head = new Head();
const EYE_M = BODY.eye;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const walkCost = { ms: 0, max: 0, frames: 0 };

// The floor under (x, z): the highest surface below eye height, or the ground.
function groundAt(x, z, eyeY) {
  world.sync();
  const top = eyeY - 0.9;
  world.gather(x - 0.4, terrainY(x, z) - 1, z - 0.4, x + 0.4, top, z + 0.4);
  return body.ground(x, z, top);
}

// The first thing straight ahead of the camera: a building, or the ground.
function aim(max) {
  const d = camera.getWorldDirection(new THREE.Vector3());
  aimRay.set(camera.position, d);
  aimRay.far = max;
  const hit = aimRay.intersectObjects(solidTargets(), false).find((h) => !h.object.material.transparent);
  const limit = hit ? hit.distance : max;
  // March along the ray for the ground, in steps that shrink as it nears.
  const p = new THREE.Vector3();
  for (let t = 0.5; t < limit;) {
    p.copy(camera.position).addScaledVector(d, t);
    const gap = p.y - terrainY(p.x, p.z);
    if (gap < 0.2) return p;
    t += Math.max(0.5, gap * 0.5);
  }
  return hit ? hit.point : null;
}

function lookFrom(dir) {
  dir = dir.clone().normalize();
  walk.yaw = Math.atan2(dir.x, -dir.z);
  walk.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
}
const lookDir = (out = new THREE.Vector3()) => out.set(Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch));
const faceView = () => camera.rotation.set(walk.pitch, -walk.yaw, 0, 'YXZ');

// Running widens the view a little. resize() sets the field of view for the
// screen: take whatever it set as the base, and add to that.
const fovState = { base: 50, set: null };
function addFov(add) {
  if (fovState.set === null || Math.abs(camera.fov - fovState.set) > 1e-6) fovState.base = camera.fov;
  const f = fovState.base + add;
  if (Math.abs(f - camera.fov) > 1e-4) { camera.fov = f; camera.updateProjectionMatrix(); }
  fovState.set = camera.fov;
}

// Mouse, touch and controller input for walking and flying.
const pad = $('#walkpad');
const look = new Controls({
  canvas, pad, stick: $('#stick'), keys, look: walk,
  active: () => state.cam !== 'orbit',
  flying: () => state.flying,
  pick: (x, y) => { if (W.ez) pick(x, y); },
  onLock: () => showHint(),
  onTouch: () => showHint(),
});
look.setTouch(coarse);

function showHint() {
  const m = state.cam;
  let h = HINTS[m];
  if (m !== 'orbit') {
    if (look.touch) h = HINTS[m + 'Touch'];
    else if (look.lockDenied) h = HINTS[m + 'Drag'];
    else if (!look.locked) h = HINTS[m + 'Free'];
  }
  $('#hint').textContent = h;
}

function setCameraMode(mode) {
  const from = state.cam;
  if (mode === from) return;
  flight = null;
  state.cam = mode;
  state.walking = mode === 'walk';
  state.flying = mode === 'fly';
  document.body.classList.toggle('walking', state.walking);
  document.body.classList.toggle('flying', state.flying);
  document.querySelectorAll('.cam button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === mode)));
  $('#walk').setAttribute('aria-pressed', String(state.walking));
  $('#walk').textContent = state.walking ? 'Stop walking (Esc)' : 'Walk at ground level';
  controls.enabled = mode === 'orbit';
  keys.clear();
  look.reset();
  walk.vy = 0;
  fly.v.set(0, 0, 0);
  head.reset();
  if (from === 'walk') { addFov(0); fovState.set = null; }
  // Clear the screen to look around; the panels come back with the orbit.
  if (from === 'orbit') {
    closeSheets();
    panelsAuto = !matchMedia('(max-width: 860px)').matches && !document.body.classList.contains('panels-hidden');
    if (panelsAuto) setPanelsHidden(true);
  }
  if (mode === 'orbit' && panelsAuto) { panelsAuto = false; setPanelsHidden(false); }
  if (mode === 'orbit') {
    look.unlock();
    showHint();
    // Turn about whatever you were looking at.
    const d = camera.getWorldDirection(new THREE.Vector3());
    const p = aim(4000);
    controls.target.copy(p && p.distanceTo(camera.position) > 3 ? p : camera.position.clone().addScaledVector(d, 6));
    return;
  }
  lookFrom(from === 'orbit' ? controls.target.clone().sub(camera.position) : camera.getWorldDirection(new THREE.Vector3()));
  if (mode === 'walk') {
    // Stand where you were looking: the centre of the orbit, or the ground ahead.
    let at = from === 'orbit' ? controls.target.clone() : heightAboveGround() < 6 ? camera.position.clone() : aim(3000);
    if (!at) at = camera.position.clone();
    world.sync();
    body.place(at.x, at.z, at.y + 2);
    camera.position.set(body.p.x, body.p.y + EYE_M, body.p.z);
    walk.pitch = 0;
  }
  faceView();
  look.lock();
  showHint();
}

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (state.cam === 'orbit') return;
  if (e.key === 'Escape') {
    // The first Esc frees the mouse (the browser does that); the next one stops.
    if (look.locked || performance.now() - look.unlockAt < 400) return;
    setCameraMode('orbit');
    return;
  }
  if (e.code === 'Space' && !e.repeat) look.jumpQ = true;
  keys.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code.startsWith('Page')) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
// In flight the wheel sets the speed.
canvas.addEventListener('wheel', (e) => {
  if (!state.flying) return;
  e.preventDefault();
  fly.speed = THREE.MathUtils.clamp(fly.speed * (e.deltaY > 0 ? 0.8 : 1.25), 0.1, 10);
  $('#hint').textContent = `Speed ×${fly.speed < 1 ? fly.speed.toFixed(2) : fly.speed.toFixed(1)} · ` + HINTS.fly;
}, { passive: false });

const _fw = new THREE.Vector3(), _rt = new THREE.Vector3(), _dir = new THREE.Vector3();
const walkIn = { x: 0, z: 0, run: false, jump: false };

function stepWalk(dt) {
  const t0 = performance.now();
  world.sync();
  const i = look.read(dt);
  const sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw);
  walkIn.x = sy * i.f + cy * i.s;
  walkIn.z = -cy * i.f + sy * i.s;
  walkIn.run = i.run;
  walkIn.jump = i.jump;
  body.update(dt, walkIn);
  const still = reducedMotion.matches;
  const lift = head.update(dt, body, still);
  camera.position.set(body.p.x + cy * head.sway, body.p.y + EYE_M + lift, body.p.z + sy * head.sway);
  faceView();
  addFov(head.fovAdd);
  const ms = performance.now() - t0;
  walkCost.ms += (ms - walkCost.ms) * 0.05;
  walkCost.max = Math.max(walkCost.max * 0.995, ms);
  walkCost.frames++;
}

// Flying: forward is where you look, so you climb or dive by looking up or
// down. Speed grows with height, so the hills of Moab are as near as a lane;
// the pace eases in and out.
function stepFly(dt) {
  const i = look.read(dt);
  const h = Math.max(0, heightAboveGround());
  const speed = THREE.MathUtils.clamp(5 + h * 0.6, 5, 1500) * fly.speed * (i.run ? 4 : 1);
  _rt.set(Math.cos(walk.yaw), 0, Math.sin(walk.yaw));
  _dir.copy(lookDir(_fw)).multiplyScalar(i.f).addScaledVector(_rt, i.s);
  _dir.y += i.u;
  if (_dir.lengthSq() > 1) _dir.normalize();
  flyStep(fly, dt, _dir, speed);
  const p = camera.position.addScaledVector(fly.v, dt);
  p.x = THREE.MathUtils.clamp(p.x, -60000, 60000);
  p.z = THREE.MathUtils.clamp(p.z, -60000, 60000);
  const floor = terrainY(p.x, p.z) + 0.6;
  if (p.y < floor) { p.y = floor; if (fly.v.y < 0) fly.v.y = 0; }
  p.y = Math.min(p.y, 12000);
  faceView();
}

// For tests: step the body without rendering, and read what it costs.
const walkerHandle = {
  world, body, head, look, cost: walkCost,
  // Stand at (x, z) on the highest floor under fromY (default: the highest of all).
  put(x, z, fromY) { world.sync(); body.place(x, z, fromY); return body.p.toArray(); },
  // n steps of 1/60 s with input { x, z, run, jump }, or a function of the step; positions every `every` steps.
  sim(n, input, every = 0) {
    world.sync();
    const out = [];
    for (let k = 0; k < n; k++) {
      body.update(1 / 60, typeof input === 'function' ? input(k, body) : input);
      if (every && k % every === 0) out.push(body.p.toArray().map((v) => +v.toFixed(2)));
    }
    return out;
  },
  setMode: (m) => setCameraMode(m),
  step: (dt) => stepWalk(dt),
};
(function expose() { if (window.ezt) window.ezt.walker = walkerHandle; else requestAnimationFrame(expose); })();

// --- UI wiring ------------------------------------------------------------------------
document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => setScene({ period: b.dataset.period })));
document.querySelectorAll('.vision button').forEach((b) => b.addEventListener('click', () => setScene({ vision: b.dataset.vision })));
$('#strength').addEventListener('input', (e) => W.vis?.setStrength(parseFloat(e.target.value)));
$('#walk').addEventListener('click', () => setCameraMode(state.walking ? 'orbit' : 'walk'));
document.querySelectorAll('.cam button').forEach((b) => b.addEventListener('click', () => setCameraMode(b.dataset.cam)));
function setPanelsHidden(hidden) {
  document.body.classList.toggle('panels-hidden', hidden);
  $('#toggle-panels').setAttribute('aria-pressed', String(hidden));
  $('#toggle-panels').textContent = hidden ? 'Show panels' : 'Hide panels';
}
$('#toggle-panels').addEventListener('click', () => { panelsAuto = false; setPanelsHidden(!document.body.classList.contains('panels-hidden')); });
for (const k of Object.keys(state.layers)) {
  const el = $('#lyr-' + k);
  el.addEventListener('change', () => { state.layers[k] = el.checked; applyVisibility(); });
}
// The day runs by itself; the slider sets the hour, the buttons the pace.
const clockState = { running: true, speed: 60, shown: 0 };
let timeQueued = false;
$('#time').addEventListener('input', () => {
  if (timeQueued) return;
  timeQueued = true;
  requestAnimationFrame(() => { timeQueued = false; setTime(parseFloat($('#time').value)); });
});
function setRunning(on) {
  clockState.running = on;
  $('#play').setAttribute('aria-pressed', String(on));
  $('#play').textContent = on ? '❚❚' : '▶';
  $('#play').setAttribute('aria-label', on ? 'Pause the day' : 'Run the day');
}
$('#play').addEventListener('click', () => setRunning(!clockState.running));
document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => {
  clockState.speed = +b.dataset.speed;
  document.querySelectorAll('.speed button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  setRunning(true);
}));
const tabs = [['#tab-info', '#pane-info'], ['#tab-cmp', '#pane-cmp']];
for (const [t, p] of tabs) {
  $(t).addEventListener('click', () => {
    for (const [t2, p2] of tabs) { $(t2).setAttribute('aria-selected', String(t2 === t)); $(p2).hidden = p2 !== p; }
  });
}
function openSheet(which) {
  // Clicking something while flying or walking brings back the panel that tells of it.
  if (which === 'info' && panelsAuto) { panelsAuto = false; setPanelsHidden(false); }
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
  const pr = renderer.getPixelRatio();
  W.vclouds?.setSize(w * pr, h * pr);
  W.refl?.setSize(w * pr, h * pr);
  camera.aspect = w / h;
  // On a tall screen keep the view at least 40° wide, so a building still fits.
  camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) / camera.aspect)), 50, 74);
  camera.updateProjectionMatrix();
}

// Bronze in the courts reflects the courts around it: a cube map from the
// middle of the court, refreshed when the scene or the light has changed.
function updateProbe(now) {
  const P = W.probe;
  if (now - P.last < 8000 && Math.abs(sky24.hours - P.hours) < 0.5) return;
  if (camera.position.distanceTo(P.cam.position) > 900 && P.env) return;
  P.last = now;
  P.hours = sky24.hours;
  const hide = [W.vision.group, W.vclouds?.composite, W.clouds].filter(Boolean);
  const was = hide.map((o) => o.visible);
  hide.forEach((o) => { o.visible = false; });
  renderer.shadowMap.needsUpdate = true;
  P.cam.update(renderer, scene);
  hide.forEach((o, i) => { o.visible = was[i]; });
  // three.js pre-filters a live cube render target itself when flagged.
  P.rt.texture.needsPMREMUpdate = true;
  if (W.mats.bronze.envMap !== P.rt.texture) {
    W.mats.bronze.envMap = P.rt.texture;
    W.mats.bronze.envMapIntensity = 1;
    W.mats.bronze.needsUpdate = true;
  }
  P.env = true;
}
new ResizeObserver(resize).observe(canvas);

// Near plane: far enough out for depth precision across the hills, close
// enough not to cut into whatever the camera is near.
function updateNear() {
  const ground = camera.position.y - terrainY(camera.position.x, camera.position.z);
  const near = state.walking ? 0.12
    : state.flying ? THREE.MathUtils.clamp(Math.max(ground, 0.5) * 0.04, 0.12, 10)
    : THREE.MathUtils.clamp(Math.min(camera.position.distanceTo(controls.target), Math.max(ground, 0.5)) * 0.06, 0.12, 12);
  if (Math.abs(near - camera.near) > camera.near * 0.15) {
    camera.near = near;
    camera.updateProjectionMatrix();
  }
}

const flyFocus = new THREE.Vector3();
// What a detail module is told each frame: the hour, the scene, and where the viewer is and looks.
const detailEnv = { time: 0, hours: 9, day: 1, night: 0, period: 'late', walking: false, flying: false, camera, focus: crowdFocus, quality: QUALITY };
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
  else if (state.flying) stepFly(dt);
  else {
    controls.update();
    // Keep the camera out of the ground.
    const gy = terrainY(camera.position.x, camera.position.z) + 1.2;
    if (camera.position.y < gy) camera.position.y = gy;
  }
  updateNear();
  // The clock: an hour of the day per minute (or faster), round the clock.
  if (clockState.running) {
    const hours = (sky24.hours + dt * clockState.speed / 3600) % 24;
    setTime(hours);
    if (now - clockState.shown > 250) { $('#time').value = hours.toFixed(2); clockState.shown = now; }
  }
  let focus = controls.target, span = camera.position.distanceTo(controls.target), near = null;
  if (state.walking) {
    // The wide map reaches well ahead; the tight one is centred a little in
    // front of the walker, where they look.
    const d = camera.getWorldDirection(flyFocus).setY(0);
    if (d.lengthSq() > 1e-6) d.normalize();
    near = d.clone().multiplyScalar(8).add(camera.position);
    focus = d.multiplyScalar(120).add(camera.position);
    span = 260;
  }
  else if (state.flying) {
    // Shadows and crowds where you are looking, on the ground ahead.
    const h = Math.max(1, heightAboveGround());
    const d = camera.getWorldDirection(flyFocus).setY(0);
    if (d.lengthSq() > 1e-6) d.normalize();
    focus = d.multiplyScalar(Math.min(h * 1.2, 600)).add(camera.position);
    focus.y = terrainY(focus.x, focus.z);
    span = THREE.MathUtils.clamp(h * 1.5, 60, 900);
  }
  updateShadowFrustum(focus, span, near);
  waterShared.wTime.value = time;
  figureShared.pTime.value = time;
  W.vis.shared.time.value = time;
  clouds.cloudTime.value = time;
  W.clouds?.userData.follow(camera);
  W.stars.userData.follow(camera, sky24.hours, sky24.night);
  W.moon.userData.follow(camera, moonDir, sky24.night);
  const lit = sky24.night > 0.04;
  W.flames.late.visible = lit && W.city.groups.late.visible;
  W.flames.early.visible = lit && W.city.groups.early.visible;
  for (const m of fireMeshes) {
    if (!m.parent?.visible) continue;
    const s = m.userData.base * (0.8 + 0.25 * Math.sin(time * 9 + m.userData.phase) + 0.1 * Math.sin(time * 23 + m.userData.phase * 3));
    m.scale.set(m.userData.base * 0.9, s * 2, 1);
  }
  W.lights.update(camera, time, sky24.night);
  crowdFocus.copy(focus);
  for (const g of Object.values(W.life.groups)) if (g.visible && g.userData.update) g.userData.update(time, dt);
  if (details.length) {
    detailEnv.time = time; detailEnv.hours = sky24.hours; detailEnv.day = sky24.day; detailEnv.night = sky24.night;
    detailEnv.period = state.period; detailEnv.walking = state.walking; detailEnv.flying = state.flying;
    for (const d of details) d.update?.(time, dt, detailEnv);
  }
  // Extra renders before the main one: the mirror for the nearest pool, the
  // cloud layer, and now and then the reflection probe.
  camera.updateMatrixWorld();
  W.refl.update(camera, isShown);
  W.vclouds?.render(camera);
  if (QUALITY !== 'low') updateProbe(now);
  renderer.shadowMap.needsUpdate = true;
  if (composer) {
    try { composer.render(dt); } catch (err) {
      // A post chain the browser cannot run: fall back to direct rendering.
      console.warn('Screen effects failed; rendering directly.', err);
      composer = null; W.vis.baseGain = 1; setTime(sky24.hours);
      renderer.render(scene, camera);
    }
  } else renderer.render(scene, camera);
  updateLabels();
  tour?.update(now, dt, canvas.clientWidth, canvas.clientHeight);
  requestAnimationFrame(frame);
}

// --- Start --------------------------------------------------------------------------------
// The Graphics switch: the choice is kept for next time and the page reloads with it.
document.querySelectorAll('.gfx button').forEach((b) => {
  const choice = b.dataset.gfx === 'auto' ? null : b.dataset.gfx;
  b.setAttribute('aria-pressed', String(choice === CHOICE));
  b.addEventListener('click', () => {
    store('ezt-graphics', choice);
    store('ezt-graphics-failed', null);
    // The address carries the choice too, for browsers that keep no storage.
    const u = new URL(location.href);
    if (choice) u.searchParams.set('quality', choice); else u.searchParams.delete('quality');
    if (u.href === location.href) location.reload(); else location.href = u.href;
  });
});
const gpuName = (() => {
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '').replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 48);
  } catch { return ''; }
})();
$('#gfx-now').textContent = `Now: ${QUALITY === 'low' ? 'low' : 'high'}${CHOICE ? '' : ' (chosen for this device)'}${gpuName ? ' · ' + gpuName : ''}`;
// If full graphics cannot start on this device, fall back to low once.
const fallBack = (why) => {
  if (QUALITY === 'low' || stored('ezt-graphics-failed')) return false;
  console.warn('Full graphics failed, falling back to low:', why);
  store('ezt-graphics-failed', '1');
  store('ezt-graphics', 'low');
  const u = new URL(location.href);
  u.searchParams.set('quality', 'low');
  location.href = u.href;
  return true;
};
canvas.addEventListener('webglcontextlost', () => fallBack('the graphics context was lost'));
build().then(() => {
  setupEffects();
  W.vis.baseGain = composer ? 2.2 : 1;   // brighter where bloom can spread it
  setTime(sky24.hours);
  resize();
  renderCompare();
  renderLegend();
  const h = fromHash() || { period: 'late', vision: 'glow' };
  setScene({ ...h, fromHash: !!fromHash() });
  W.crowdsLevel(sky24.hours);
  setRunning(params.get('clock') !== 'stop');
  tour = createTour({
    scene, camera, controls, renderer, E, S, V, O, I, H, EYE, terrainY, flyTo, setScene, setTime, setRunning, clockState, sky24, state,
    lights: W.lights, closeSheets,
    setLayer: (name, on) => {
      if (state.layers[name] === on) return;
      state.layers[name] = on;
      $('#lyr-' + name).checked = on;
      applyVisibility();
    },
  });
  // ?tour=N opens the tour at stop N.
  if (params.has('tour')) tour.start(Math.max(0, (parseInt(params.get('tour'), 10) || 1) - 1));
  $('#loading').classList.add('done');
  window.ezt = { scene, camera, controls, renderer, W, details, atmo, sun, hemi, state, tour, setScene, setTime, flyTo, select, viewSections, setRunning, clockState, sky24, terrainY, get composer() { return composer; }, get gtao() { return gtao; }, get bloom() { return bloom; } };
  frame();
}).catch((err) => {
  console.error(err);
  if (fallBack(err.message)) return;
  $('#load-step').textContent = 'The model could not be built.';
  const e = $('#error');
  e.style.display = 'block';
  e.textContent = `${err.message}. WebGL may be turned off in this browser; try another browser or device.`;
});
