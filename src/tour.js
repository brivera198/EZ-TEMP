// The guided tour: follows the man with the measuring reed through Ezekiel
// 40–48 in the order of the text. Each stop flies the camera, sets the scene
// and the hour, draws the measurements the passage gives where they apply and
// shows the passage, its figures and Solomon's counterpart in a card.
import { createDims } from './dims.js';
import { createGlory } from './glory.js';
import { buildStops } from './tour-stops.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createTour(api) {
  const { scene, camera, controls, renderer, E, S, V, O, I, H, EYE, terrainY, flyTo, setScene, setTime, setRunning, clockState, sky24, state, lights, setLayer, closeSheets } = api;
  const stops = buildStops({ E, S, V, O, I, H, EYE });
  const dims = createDims({ scene, labelsEl: $('#labels'), E });
  // The way of the glory (43:1–5): from the Mount of Olives, where Ezekiel had
  // seen it stop (11:23), through the east gate and the courts into the house.
  const glory = createGlory({
    scene, lights,
    keys: [
      { t: 0, p: V(820, terrainY(820, -40) + 70, -40) },
      { t: 6, p: E(520, 90, 0) },
      { t: 10, p: E(275, 16, 0) },
      { t: 13, p: E(225, O + 8, 0) },
      { t: 16, p: E(150, O + 12, 0) },
      { t: 18.5, p: E(75, I + 8, 0) },
      { t: 21, p: E(0, I + 22, 0) },
      { t: 23.5, p: E(-58, H + 10, 0) },
      { t: 26, p: E(-125, H + 12, 0) },
    ],
  });
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = { active: false, i: 0, auto: false, left: 0, arrive: 0, shown: true, clock: null, follow: false, wasRunning: true, last: 0, card: null, layers: {} };
  // The river and the city to the south appear when the text reaches them.
  const riverAt = stops.findIndex((s) => s.layer === 'river');
  const el = { card: $('#tour-card'), body: $('#tour-body'), bar: $('#tour-bar'), prev: $('#tour-prev'), next: $('#tour-next'), auto: $('#tour-auto'), exit: $('#tour-exit'), start: $('#tour-start') };

  // Keep the subject clear of the card: shift the picture into the free part
  // of the window (to the right of the card, or above it on a phone).
  const pad = { x: 0, y: 0, w: 0, h: 0 };
  function frameView(w, h, dt) {
    let tx = 0, ty = 0;
    t.card = t.active ? el.card.getBoundingClientRect() : null;
    if (t.card) {
      const r = t.card;
      if (r.width > w * 0.7) ty = Math.round(r.height / 2);
      else tx = Math.round(r.right / 2);
    }
    const k = reduced() ? 1 : 1 - Math.exp(-dt * 5);
    const ease = (from, to) => (Math.abs(to - from) < 0.5 ? to : from + (to - from) * k);
    const x = ease(pad.x, tx), y = ease(pad.y, ty);
    if (x === pad.x && y === pad.y && w === pad.w && h === pad.h) return;
    Object.assign(pad, { x, y, w, h });
    if (x || y) camera.setViewOffset(w, h, -x, y, w, h);
    else if (camera.view?.enabled) camera.clearViewOffset();
  }

  function render() {
    const s = stops[t.i];
    el.body.innerHTML = `<div class="eyebrow">Stop ${t.i + 1} of ${stops.length} · Ezekiel ${esc(s.ref)}</div>
      <h2>${esc(s.title)}</h2>
      <p>${esc(s.text)}</p>
      <dl class="facts">${s.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="counterpart so"><div class="eyebrow"><b>Solomon's temple</b></div><p>${esc(s.solomon)}</p></div>`;
    el.body.scrollTop = 0;
    el.bar.style.width = `${((t.i + 1) / stops.length) * 100}%`;
    el.prev.disabled = t.i === 0;
    el.next.textContent = t.i === stops.length - 1 ? 'Finish' : 'Next';
  }

  // forward: the hour runs on to the next stop's, through the night if it must.
  function go(i, ms = 2400, forward = false) {
    t.i = Math.max(0, Math.min(stops.length - 1, i));
    const s = stops[t.i];
    if (s.scene.period !== state.period || s.scene.vision !== state.vision) setScene(s.scene);
    setLayer('river', t.i >= riverAt);
    setLayer('ezcity', s.layer === 'ezcity');
    dims.clear();
    flyTo(s.pos.clone(), s.target.clone(), ms);
    const now = performance.now();
    let by = ((s.hours - sky24.hours + 36) % 24) - 12;
    if (forward && by < -0.01) by += 24;
    const clockMs = reduced() ? 1 : Math.max(ms, Math.abs(by) * 330);
    t.clock = Math.abs(by) > 0.005 ? { from: sky24.hours, by, start: now, ms: clockMs } : null;
    t.arrive = now + Math.max(reduced() ? 1 : ms, t.clock ? clockMs : 0);
    t.shown = false;
    t.follow = false;
    t.left = s.dwell || Math.max(14, 6 + s.text.length / 16);
    if (s.glory === 'settled') glory.settle();
    else glory.hide();
    render();
  }

  function start(i = 0) {
    closeSheets();
    if (!t.active) {
      t.wasRunning = clockState.running;
      t.layers = { river: state.layers.river, ezcity: state.layers.ezcity };
    }
    setRunning(false);
    t.active = true;
    document.body.classList.add('touring');
    el.card.hidden = false;
    go(i, 2600);
    el.next.focus({ preventScroll: true });
  }

  function stop() {
    if (!t.active) return;
    t.active = false;
    t.follow = false;
    t.clock = null;
    setAuto(false);
    document.body.classList.remove('touring');
    el.card.hidden = true;
    dims.clear();
    glory.hide();
    for (const [name, on] of Object.entries(t.layers)) if (on) setLayer(name, true);
    setRunning(t.wasRunning);
    el.start?.focus({ preventScroll: true });
  }

  const next = () => { if (t.i >= stops.length - 1) stop(); else go(t.i + 1, 2400, true); };
  const prev = () => { if (t.i > 0) go(t.i - 1); };

  function setAuto(on) {
    t.auto = on;
    el.auto.setAttribute('aria-pressed', String(on));
    el.auto.textContent = on ? 'Pause' : 'Auto-play';
  }

  // Called once a frame, after the scene is drawn.
  function update(now, dt, w, h) {
    // The scene's dt is capped for slow frames; the tour keeps real time, so
    // the glory and the auto-play take as long on a slow machine as on a fast one.
    const real = Math.min((now - (t.last || now)) / 1000, 0.5);
    t.last = now;
    if (t.clock) {
      const k = Math.min(1, (now - t.clock.start) / t.clock.ms);
      const hours = (((t.clock.from + t.clock.by * k * k * (3 - 2 * k)) % 24) + 24) % 24;
      setTime(hours);
      $('#time').value = hours.toFixed(2);
      if (k >= 1) t.clock = null;
    }
    if (t.active && !t.shown && now >= t.arrive) {
      t.shown = true;
      const s = stops[t.i];
      if (s.dims) dims.show(s.dims);
      if (s.glory === 'arrive') { glory.begin(); t.follow = true; }
    }
    // Day breaks as the glory comes: "the earth shone with his glory" (43:2).
    const rise = stops[t.i].rise;
    if (t.active && rise && t.shown && !t.clock && glory.state === 'coming') {
      const hours = stops[t.i].hours + rise * Math.min(1, glory.time / glory.total);
      setTime(hours);
      $('#time').value = hours.toFixed(2);
    }
    // Keep the light in view as it comes, until the visitor takes the camera.
    if (t.follow && glory.state !== 'off') controls.target.lerp(glory.pos, 1 - Math.exp(-real * 2.2));
    if (t.active && t.auto && t.shown && glory.state !== 'coming') {
      t.left -= real;
      if (t.left <= 0) { if (t.i >= stops.length - 1) setAuto(false); else next(); }
    }
    const exposure = renderer.toneMappingExposure;
    frameView(w, h, dt);
    glory.update(real, exposure);
    dims.update(camera, w, h, dt, exposure, t.card);
  }

  el.prev.addEventListener('click', prev);
  el.next.addEventListener('click', next);
  el.exit.addEventListener('click', stop);
  el.auto.addEventListener('click', () => setAuto(!t.auto));
  el.start?.addEventListener('click', () => start(0));
  controls.addEventListener('start', () => { t.follow = false; });
  addEventListener('keydown', (e) => {
    if (!t.active || state.walking || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Escape') stop();
  });

  return {
    start, stop, next, prev, go, update, stops, glory, dims,
    get active() { return t.active; },
    get index() { return t.i; },
    labelOK: (kind) => !!stops[t.i].labels?.includes(kind),
  };
}
