// Daily Moth: one remixed level per day, the same for everyone.
// A variant is a pure function of its seed: a handcrafted level, maybe mirrored,
// with a new sun start, lamp states and pollen positions.
import { LEVELS } from './levels.js';
import { mulberry32, SUN_MIN, SUN_MAX, GROUND, W } from './sim.js';

// Day 1 is the launch day. Days follow the player's local calendar, like Wordle.
const EPOCH = Date.UTC(2026, 9, 15);

// Seeds that tools/solve.html?daily=scan proved winnable (win rate > 0).
// Regenerate after changing levels.js or makeVariant, then check with ?daily.
export const POOL = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
];

export function dayNumber(date = new Date()) {
  const d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((d - EPOCH) / 86400000) + 1;
}

// Walk the pool in a shuffled order so neighbouring days feel different.
export function seedForDay(day) {
  const n = POOL.length;
  const i = (((day - 1) * 37) % n + n) % n;
  return POOL[i];
}

function clear(x, y, lv) {
  if (x < 40 || x > W - 40 || y < 40 || y > GROUND - 30) return false;
  for (const [bx, by, bw, bh, mv] of lv.blocks) {
    const sx = mv ? Math.abs(mv[0]) : 0, sy = mv ? Math.abs(mv[1]) : 0;
    if (x > bx - sx - 30 && x < bx + bw + sx + 30 && y > by - sy - 30 && y < by + bh + sy + 30) return false;
  }
  for (const [wx, wy, r] of lv.webs || []) if (Math.hypot(wx - x, wy - y) < r + 40) return false;
  for (const [lx, ly, , kind] of lv.lamps || []) if (kind === 'zap' && Math.hypot(lx - x, ly - y) < 80) return false;
  if (Math.hypot(lv.goal[0] - x, lv.goal[1] - y) < 60 || Math.hypot(lv.moth[0] - x, lv.moth[1] - y) < 60) return false;
  return true;
}

export function makeVariant(seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const base = LEVELS[Math.floor(rng() * LEVELS.length)];
  const flip = rng() < 0.5;
  const fx = (x) => (flip ? W - x : x);
  const lv = {
    name: base.name,
    base: LEVELS.indexOf(base),
    flip,
    hint: `Remix of “${base.name}”${flip ? ', mirrored' : ''}.`,
    sun: Math.round(SUN_MIN + 10 + rng() * (SUN_MAX - SUN_MIN - 20)),
    par: base.par,
    moth: [fx(base.moth[0]), base.moth[1]],
    goal: [fx(base.goal[0]), base.goal[1]],
    blocks: base.blocks.map(([x, y, w, h, mv]) => {
      const b = [flip ? W - x - w : x, y, w, h];
      if (mv) b.push(flip ? [-mv[0], mv[1], mv[2]] : mv.slice());
      return b;
    }),
    lamps: (base.lamps || []).map(([x, y, on, kind = 'lamp']) =>
      [fx(x), y, kind === 'lamp' ? (rng() < 0.5 ? 1 : 0) : 1, kind]),
    webs: (base.webs || []).map(([x, y, r]) => [fx(x), y, r]),
  };
  lv.pollen = (base.pollen || []).map(([x, y]) => {
    for (let k = 0; k < 30; k++) {
      const px = Math.round(fx(x) + (rng() - 0.5) * 300), py = Math.round(y + (rng() - 0.5) * 300);
      if (clear(px, py, lv)) return [px, py];
    }
    return [fx(x), y];
  });
  return lv;
}

export function dailyLevel(day = dayNumber()) {
  const seed = seedForDay(day);
  return { ...makeVariant(seed), name: `Daily Moth #${day}`, seed };
}
