import { LEVELS } from './levels.js';
import { dailyLevel, dayNumber } from './daily.js';
import * as S from './sim.js';
import { createRenderer } from './render.js';
import * as audio from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const R = createRenderer(canvas);

const HUD_TOP = 104, HUD_BOTTOM = 76;
const STEP = 1 / 120;
const DEG_PER_PX = 0.18;  // sun degrees per world pixel dragged
const KEY_SPEED = 90;     // sun degrees per second while a key is held
const END_TEXT = {
  burned: ['Scorched!', 'The sun got it. Keep the moth in shadow.'],
  zapped: ['Zapped!', 'Zappers never switch off. Keep them out of sight.'],
  webbed: ['Caught!', 'Spiders lurk in the shade. Steer around webs.'],
};

// ---------- progress ----------
let progress = { unlocked: 1, stars: [] };
try { progress = { ...progress, ...JSON.parse(localStorage.getItem('duskwing.progress') || '{}') }; } catch {}
const saveProgress = () => { try { localStorage.setItem('duskwing.progress', JSON.stringify(progress)); } catch {} };
// Best Daily Moth result per day number: { [day]: { stars, time, pollen } }
let dailyBest = {};
try { dailyBest = JSON.parse(localStorage.getItem('duskwing.daily') || '{}'); } catch {}
const saveDaily = () => { try { localStorage.setItem('duskwing.daily', JSON.stringify(dailyBest)); } catch {} };

// ---------- state ----------
let mode = 'menu';
let levelIndex = 0;
let daily = null; // { day, level } while playing the Daily Moth
let state = S.createState(LEVELS[0]);
let resultShown = false;
let endTimer = 0;
const keys = new Set();

function startLevel(i) {
  daily = null;
  levelIndex = i;
  begin(LEVELS[i], i + 1, i + 1, `#${i + 1}`);
}

function startDaily() {
  const day = dayNumber();
  daily = { day, level: dailyLevel(day) };
  begin(daily.level, day, `☾${day}`, '#daily', 'Daily Moth');
}

function begin(level, seed, label, hash, name = level.name) {
  state = S.createState(level, seed);
  resultShown = false;
  endTimer = 0;
  R.reset();
  mode = 'play';
  $('menu').hidden = true;
  $('result').hidden = true;
  $('hud').hidden = false;
  $('btn-release').hidden = false;
  $('hud-level').textContent = label;
  $('hud-name').textContent = name;
  const hint = $('hint');
  hint.textContent = level.hint;
  hint.hidden = false;
  hint.classList.remove('fade');
  history.replaceState(null, '', hash);
  updateHud();
}

function showMenu() {
  mode = 'menu';
  state = S.createState(LEVELS[0]);
  $('menu').hidden = false;
  $('hud').hidden = true;
  $('hint').hidden = true;
  $('btn-release').hidden = true;
  $('result').hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
  buildLevelGrid();
}

function buildLevelGrid() {
  const grid = $('levels');
  grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    const st = progress.stars[i] || 0;
    b.innerHTML = `${i + 1}<small>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</small>`;
    b.title = lv.name;
    b.disabled = i >= progress.unlocked;
    b.onclick = () => { audio.unlock(); startLevel(i); };
    grid.appendChild(b);
  });
  $('btn-play').textContent = progress.stars.some(Boolean) ? 'Continue' : 'Play';
  const day = dayNumber(), best = dailyBest[day];
  $('daily-num').textContent = `#${day}`;
  $('daily-sub').textContent = best ? `${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)} · ${best.time.toFixed(1)}s` : 'New puzzle today';
  $('btn-daily').classList.toggle('done', !!best);
}

function doRelease() {
  if (mode !== 'play' || state.status !== 'ready') return;
  audio.unlock();
  S.release(state);
  $('btn-release').hidden = true;
}

function restart() { if (mode === 'play') (daily ? startDaily() : startLevel(levelIndex)); }

// ---------- HUD ----------
function updateHud() {
  const got = state.pollen.filter((p) => p.got).length;
  $('hud-pollen').textContent = `🌼 ${got}/${state.pollen.length}`;
  $('hud-time').textContent = `${state.flight.toFixed(1)}s`;
  $('btn-sound').textContent = audio.isMuted() ? '🔇' : '🔊';
}

function showResult() {
  resultShown = true;
  const s = state, won = s.status === 'won';
  const n = S.stars(s);
  const got = s.pollen.filter((p) => p.got).length;
  if (won && daily) {
    const prev = dailyBest[daily.day];
    if (!prev || n > prev.stars || (n === prev.stars && s.flight < prev.time)) {
      dailyBest[daily.day] = { stars: n, time: +s.flight.toFixed(1), pollen: got };
      saveDaily();
    }
  } else if (won) {
    progress.stars[levelIndex] = Math.max(progress.stars[levelIndex] || 0, n);
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, levelIndex + 2));
    saveProgress();
  }
  $('res-title').textContent = won && daily ? `Daily Moth #${daily.day} 🌙` : won ? (levelIndex === LEVELS.length - 1 ? 'Moonrise! 🌕' : 'Home safe!') : END_TEXT[s.status][0];
  $('res-stars').innerHTML = won ? [0, 1, 2].map((k) => `<span class="${k < n ? '' : 'off'}">⭐</span>`).join('') : '🦋';
  $('res-detail').textContent = won
    ? `${s.flight.toFixed(1)}s (par ${s.level.par}s) · 🌼 ${got}/${s.pollen.length}`
    : END_TEXT[s.status][1];
  const next = $('res-next');
  next.hidden = !won;
  next.textContent = daily || levelIndex === LEVELS.length - 1 ? 'All levels' : 'Next';
  $('res-share').hidden = !won;
  $('result').hidden = false;
  (won ? next : $('res-retry')).focus({ preventScroll: true });
}

function shareText() {
  const s = state, n = S.stars(s);
  const got = s.pollen.filter((p) => p.got).length;
  if (daily) return `Duskwing Daily #${daily.day} 🦋
${'⭐'.repeat(n)}${'▫️'.repeat(3 - n)} · ⏱ ${s.flight.toFixed(1)}s · 🌼 ${got}/${s.pollen.length}`;
  return `DUSKWING 🦋 Level ${levelIndex + 1}: ${s.level.name}\n${'⭐'.repeat(n)}${'▫️'.repeat(3 - n)} · ⏱ ${s.flight.toFixed(1)}s · 🌼 ${got}/${s.pollen.length}\nMove the sun. Guide the moth.`;
}

async function share() {
  const text = shareText();
  const url = location.origin + location.pathname + (daily ? '#daily' : '');
  try {
    if (navigator.share) { await navigator.share({ title: 'Duskwing', text, url }); return; }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Copied! Paste it anywhere.');
  } catch { /* user cancelled */ }
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- input ----------
let drag = null;

function lampAt(px, py, pointerType) {
  const w = R.toWorld(px, py);
  const reach = pointerType === 'touch' ? 52 : 34;
  let best = -1, bd = Infinity;
  state.lamps.forEach((l, i) => {
    if (l.kind !== 'lamp') return;
    const d = Math.hypot(l.x - w.x, l.y - w.y);
    if (d < reach && d < bd) { bd = d; best = i; }
  });
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play' || drag) return;
  audio.unlock();
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sun: state.sun, moved: false, lamp: lampAt(e.clientX, e.clientY, e.pointerType) };
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) {
    if (mode === 'play') canvas.classList.toggle('over-lamp', lampAt(e.clientX, e.clientY, e.pointerType) >= 0);
    return;
  }
  if (e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.hypot(dx, e.clientY - drag.y) > 8) {
    drag.moved = true;
    canvas.classList.add('dragging');
  }
  if (drag.moved) S.setSun(state, drag.sun - (dx / R.view.s) * DEG_PER_PX);
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && drag.lamp >= 0 && e.type === 'pointerup') S.toggleLamp(state, drag.lamp);
  drag = null;
  canvas.classList.remove('dragging');
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('wheel', (e) => {
  if (mode !== 'play') return;
  e.preventDefault();
  S.setSun(state, state.sun + Math.sign(e.deltaY || e.deltaX) * 4);
}, { passive: false });

addEventListener('keydown', (e) => {
  if (e.repeat && !['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) return;
  keys.add(e.key.toLowerCase());
  if (mode !== 'play') {
    if (e.key === 'Enter' && !$('menu').hidden) { audio.unlock(); startLevel(firstUnbeaten()); }
    return;
  }
  if (e.key === ' ' || e.key === 'Enter') {
    if (!$('result').hidden) {
      e.preventDefault();
      if (state.status === 'won') $('res-next').click(); else restart();
    } else if (state.status === 'ready') { e.preventDefault(); doRelease(); }
  }
  if (e.key === 'r' || e.key === 'R') restart();
  if (e.key === 'Escape') showMenu();
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) { // number keys switch lamps in order, handy on PC
    const toggles = state.lamps.map((l, i) => [l, i]).filter(([l]) => l.kind === 'lamp');
    if (toggles[n - 1]) S.toggleLamp(state, toggles[n - 1][1]);
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const firstUnbeaten = () => {
  const i = LEVELS.findIndex((_, k) => !progress.stars[k]);
  return i < 0 ? 0 : Math.min(i, progress.unlocked - 1);
};

$('btn-play').onclick = () => { audio.unlock(); startLevel(firstUnbeaten()); };
$('btn-menu').onclick = showMenu;
$('btn-restart').onclick = restart;
$('btn-release').onclick = doRelease;
$('btn-sound').onclick = () => { audio.unlock(); audio.setMuted(!audio.isMuted()); updateHud(); };
$('res-retry').onclick = restart;
$('res-next').onclick = () => (daily || levelIndex === LEVELS.length - 1 ? showMenu() : startLevel(levelIndex + 1));
$('btn-daily').onclick = () => { audio.unlock(); startDaily(); };
$('res-share').onclick = share;

// ---------- loop ----------
function layout() { R.resize(innerWidth, innerHeight, mode === 'play' ? HUD_TOP : 0, mode === 'play' ? HUD_BOTTOM : 0); }
addEventListener('resize', layout);

let last = performance.now(), acc = 0, clock = 0, lastMode = null;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  if (mode !== lastMode || innerWidth !== R.view.w || innerHeight !== R.view.h) { lastMode = mode; layout(); }

  if (mode === 'menu') {
    // Attract mode: the sun sweeps slowly over the first level.
    S.setSun(state, 90 + Math.sin(clock * 0.25) * 60);
    state.t += dt;
  } else {
    const dir = (keys.has('arrowleft') || keys.has('a') ? 1 : 0) - (keys.has('arrowright') || keys.has('d') ? 1 : 0);
    if (dir) S.setSun(state, state.sun + dir * KEY_SPEED * dt);
    acc += dt;
    while (acc >= STEP) { S.step(state, STEP); acc -= STEP; }
  }

  for (const ev of state.events) { R.event(ev); audio.play(ev.type); }
  state.events.length = 0;
  audio.sizzle(mode === 'play' && state.status === 'flying' && state.moth.inSun ? S.sunStrength(state.sun) : 0);

  if (mode === 'play') {
    updateHud();
    if (state.status !== 'ready' && state.status !== 'flying' && !resultShown) {
      endTimer += dt;
      if (endTimer > 0.9) showResult();
    }
  }

  R.draw(state, clock, dt);
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => { last = performance.now(); });

// Deep link: #3 opens level 3 if it is unlocked, #daily opens today's Daily Moth.
const deep = parseInt(location.hash.slice(1), 10);
if (location.hash === '#daily') startDaily();
else if (deep >= 1 && deep <= progress.unlocked) startLevel(deep - 1); else showMenu();
layout();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
