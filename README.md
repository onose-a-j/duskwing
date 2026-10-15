# 🦋 Duskwing

**Move the sun. Guide the moth.**

Duskwing is a 2D light-and-shadow puzzle game for phone and PC. You never control the hero directly:

- **The sun is your tool.** Drag anywhere to swing it across the sky. Every shadow in the world stretches, shrinks and swings with it.
- **Sunlight burns.** The moth only survives in shadow, so you have to sculpt a safe path for it.
- **Moths chase light.** The moth flies to the brightest lamp it can *see* (brightness ÷ distance, with line of sight). Tap lamps on and off to lure it from place to place.
- **Get it home** to the moon jar. Collect pollen 🌼 and beat par for ⭐⭐⭐.

Along the way there are bug zappers that never switch off, spider webs hiding in the shade, and drifting clouds whose shadows won't stay still.

## Controls

| | Phone | PC |
|---|---|---|
| Move the sun | Drag anywhere | Drag · ← → / A D · mouse wheel |
| Switch a lamp | Tap it | Click it · number keys 1–9 |
| Release the moth | **Release ▶** | Space / Enter |
| Restart / menu | ↻ / ☰ | R / Esc |

## Features

- 10 handcrafted levels, each checked by an automated solver (below)
- Real-time shadow casting from a directional sun, plus line-of-sight AI for the moth
- Synthesized sound (Web Audio, no audio files)
- Shareable results (Web Share API on phones, clipboard on desktop)
- Installable PWA that works offline
- Zero dependencies and no build step: vanilla JS modules + Canvas 2D

## Run locally

Any static server works. ES modules need http://, not file://.

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Source:** `Deploy from a branch`, branch `main`, folder `/ (root)`.
3. The game goes live at `https://<you>.github.io/duskwing/`.

## Project layout

```
index.html          HUD, menus, result card
css/style.css       UI styling (mobile-first, safe-area aware)
js/sim.js           deterministic simulation: sun, shadows, moth AI, hazards
js/levels.js        level data
js/render.js        canvas renderer + particles
js/audio.js         Web Audio sound kit
js/main.js          input, game loop, progress, sharing
tools/solve.html    level solver
sw.js               offline cache
```

## Level solver

`js/sim.js` has no DOM code and is deterministic, so a level can be simulated headless. `tools/solve.html` throws thousands of random "players" at each level. Each one picks a sun schedule and lamp timing, and some also follow simple habits like "switch a lamp off once the moth reaches it". The page reports each level's win rate and fastest clear. That proves every level is beatable and gives a rough difficulty curve.

Open `http://localhost:8000/tools/solve.html` (`?l=4` runs a single level, `&n=5000` sets the trial count).

## Adding a level

Levels live in `js/levels.js`. The world is 1000×1000 with the ground at y = 940, and a sun angle of 90° is noon.

```js
{
  name: 'My Level', hint: 'Shown above the board.', sun: 90, par: 10,
  moth: [x, y], goal: [x, y],
  blocks: [[x, y, w, h], [x, y, w, h, [dx, dy, period]]], // last one drifts
  lamps:  [[x, y, on], [x, y, 1, 'zap']],
  webs:   [[x, y, radius]],
  pollen: [[x, y]],
}
```

Run the solver after editing. A win rate of 0% means the level can't be beaten.
