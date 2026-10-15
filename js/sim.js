// Duskwing simulation: pure, deterministic and DOM-free.
// The sun is a directional light. The moth flies to the brightest light it can
// see, burns in sunlight and heals in shadow.

export const W = 1000, H = 1000, GROUND = 940;
export const SUN_MIN = 12, SUN_MAX = 168;

const MAX_SPEED = 190;
const STEER = 3;
const WANDER = 110;
const MOTH_R = 9;
const BURN = 0.55;      // hp per second at noon
const HEAL = 0.3;       // hp per second in shadow
const BRIGHT = { lamp: 1.5, zap: 2.2, goal: 1 };
const REACH = { goal: 30, zap: 26, pollen: 28 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Direction sunlight travels (from the sun towards the scene). y points down.
export function sunDir(deg) {
  const r = (deg * Math.PI) / 180;
  return { x: -Math.cos(r), y: Math.sin(r) };
}

export function sunStrength(deg) {
  return 0.35 + 0.65 * Math.sin((deg * Math.PI) / 180);
}

export function createState(level, seed = 1) {
  const [mx, my] = level.moth;
  return {
    level,
    t: 0,
    flight: 0,
    sun: level.sun,
    status: 'ready', // ready | flying | won | burned | zapped | webbed
    moth: { x: mx, y: my, vx: 0, vy: 0, hp: 1, target: null, wander: 0, inSun: false },
    goal: { x: level.goal[0], y: level.goal[1] },
    lamps: (level.lamps || []).map(([x, y, on, kind = 'lamp']) => ({ x, y, kind, on: kind === 'zap' ? true : !!on })),
    webs: (level.webs || []).map(([x, y, r]) => ({ x, y, r })),
    pollen: (level.pollen || []).map(([x, y]) => ({ x, y, got: false })),
    rng: mulberry32(seed),
    events: [],
  };
}

// Blocks are [x, y, w, h, move?] where move = [dx, dy, period] oscillates the block.
export function blocksAt(level, t) {
  return level.blocks.map(([x, y, w, h, mv]) => {
    if (!mv) return { x, y, w, h };
    const k = Math.sin((2 * Math.PI * t) / mv[2]);
    return { x: x + mv[0] * k, y: y + mv[1] * k, w, h };
  });
}

// Liang-Barsky segment vs axis-aligned rect.
export function segHits(x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - r.x, r.x + r.w - x0, y0 - r.y, r.y + r.h - y0];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

export function blocked(ax, ay, bx, by, blocks) {
  for (const r of blocks) if (segHits(ax, ay, bx, by, r)) return true;
  return false;
}

export function inShadow(x, y, blocks, sun) {
  const d = sunDir(sun);
  return blocked(x, y, x - d.x * 3000, y - d.y * 3000, blocks);
}

function insideAny(x, y, blocks, pad) {
  for (const r of blocks) {
    if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return r;
  }
  return null;
}

// A moving block can sweep over the moth: push it out along the shortest axis.
function pushOut(m, r) {
  const left = m.x - (r.x - MOTH_R), right = r.x + r.w + MOTH_R - m.x;
  const up = m.y - (r.y - MOTH_R), down = r.y + r.h + MOTH_R - m.y;
  const min = Math.min(left, right, up, down);
  if (min === left) m.x -= left + 0.5;
  else if (min === right) m.x += right + 0.5;
  else if (min === up) m.y -= up + 0.5;
  else m.y += down + 0.5;
}

export function setSun(s, deg) {
  s.sun = Math.max(SUN_MIN, Math.min(SUN_MAX, deg));
}

export function toggleLamp(s, i) {
  const l = s.lamps[i];
  if (!l || l.kind !== 'lamp' || s.status === 'won') return false;
  l.on = !l.on;
  s.events.push({ type: l.on ? 'lampOn' : 'lampOff', x: l.x, y: l.y });
  return true;
}

export function release(s) {
  if (s.status !== 'ready') return;
  s.status = 'flying';
  s.events.push({ type: 'release' });
}

function end(s, status) {
  s.status = status;
  s.events.push({ type: status, x: s.moth.x, y: s.moth.y });
}

// Every light the moth can see, scored by brightness over distance.
export function pickTarget(s, blocks) {
  const m = s.moth;
  let best = null, bestScore = 0;
  const consider = (x, y, b, id) => {
    if (blocked(m.x, m.y, x, y, blocks)) return;
    let score = b / Math.max(Math.hypot(x - m.x, y - m.y), 60);
    if (id === m.target) score *= 1.25; // a little commitment stops dithering
    if (score > bestScore) { bestScore = score; best = { x, y, id }; }
  };
  s.lamps.forEach((l, i) => { if (l.on) consider(l.x, l.y, BRIGHT[l.kind], i); });
  consider(s.goal.x, s.goal.y, BRIGHT.goal, 'goal');
  return best;
}

export function step(s, dt) {
  s.t += dt;
  if (s.status !== 'flying') return;
  s.flight += dt;

  const blocks = blocksAt(s.level, s.t);
  const m = s.moth;
  const hit = insideAny(m.x, m.y, blocks, MOTH_R);
  if (hit) pushOut(m, hit);

  const target = pickTarget(s, blocks);
  m.target = target ? target.id : null;

  m.wander += (s.rng() - 0.5) * 0.5;
  let ax = Math.cos(m.wander) * WANDER, ay = Math.sin(m.wander) * WANDER;
  if (target) {
    let dx = target.x - m.x, dy = target.y - m.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    let tx = dx * MAX_SPEED, ty = dy * MAX_SPEED;
    if (d < 70) {
      // Moths circle a light rather than landing on it.
      const k = d / 70 - 0.3;
      tx = (dx * k - dy * 0.9) * MAX_SPEED;
      ty = (dy * k + dx * 0.9) * MAX_SPEED;
    }
    ax += (tx - m.vx) * STEER;
    ay += (ty - m.vy) * STEER;
  } else {
    ax -= m.vx * 1.5;
    ay -= m.vy * 1.5;
  }
  m.vx += ax * dt; m.vy += ay * dt;
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > MAX_SPEED) { m.vx *= MAX_SPEED / sp; m.vy *= MAX_SPEED / sp; }

  const nx = m.x + m.vx * dt;
  if (nx < MOTH_R || nx > W - MOTH_R || insideAny(nx, m.y, blocks, MOTH_R)) m.vx *= -0.4;
  else m.x = nx;
  const ny = m.y + m.vy * dt;
  if (ny < MOTH_R || ny > GROUND - MOTH_R || insideAny(m.x, ny, blocks, MOTH_R)) m.vy *= -0.4;
  else m.y = ny;

  m.inSun = !inShadow(m.x, m.y, blocks, s.sun);
  if (m.inSun) m.hp -= dt * BURN * sunStrength(s.sun);
  else m.hp = Math.min(1, m.hp + dt * HEAL);
  if (m.hp <= 0) { m.hp = 0; return end(s, 'burned'); }

  for (const w of s.webs) if (Math.hypot(w.x - m.x, w.y - m.y) < w.r) return end(s, 'webbed');
  for (const l of s.lamps) if (l.kind === 'zap' && Math.hypot(l.x - m.x, l.y - m.y) < REACH.zap) return end(s, 'zapped');
  for (const p of s.pollen) {
    if (!p.got && Math.hypot(p.x - m.x, p.y - m.y) < REACH.pollen) {
      p.got = true;
      s.events.push({ type: 'pollen', x: p.x, y: p.y });
    }
  }
  if (Math.hypot(s.goal.x - m.x, s.goal.y - m.y) < REACH.goal) end(s, 'won');
}

export function stars(s) {
  if (s.status !== 'won') return 0;
  return 1 + (s.pollen.every((p) => p.got) ? 1 : 0) + (s.flight <= s.level.par ? 1 : 0);
}
