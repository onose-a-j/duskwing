// Canvas renderer. Reads simulation state, never mutates it.
import { W, H, GROUND, sunDir, sunStrength, blocksAt, mulberry32 } from './sim.js';

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
};

const SKY = {
  low: ['#1b1036', '#6d2a5e', '#ff9a5a'],
  high: ['#2f6fb8', '#86bfe6', '#ffe0a3'],
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const shade = document.createElement('canvas');
  const sctx = shade.getContext('2d');
  const view = { s: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  let particles = [];
  const windowsCache = new Map();

  function resize(w, h, top, bottom, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
    view.dpr = dpr; view.w = w; view.h = h;
    canvas.width = shade.width = Math.round(w * dpr);
    canvas.height = shade.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const pad = 12;
    const aw = w - pad * 2, ah = h - top - bottom - pad * 2;
    view.s = Math.max(0.1, Math.min(aw / W, ah / H));
    view.ox = (w - W * view.s) / 2;
    view.oy = top + pad + (ah - H * view.s) / 2;
  }

  const toWorld = (px, py) => ({ x: (px - view.ox) / view.s, y: (py - view.oy) / view.s });
  const worldTf = (c) => c.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * view.ox, view.dpr * view.oy);
  const screenTf = (c) => c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

  function emit(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opts.speed || 60) * (0.3 + Math.random());
      particles.push({
        x, y,
        vx: Math.cos(a) * sp + (opts.vx || 0), vy: Math.sin(a) * sp + (opts.vy || 0),
        life: 0, max: (opts.life || 0.8) * (0.6 + Math.random() * 0.6),
        size: (opts.size || 3) * (0.6 + Math.random() * 0.8),
        color: opts.color, glow: !!opts.glow, gravity: opts.gravity || 0,
      });
    }
  }

  function event(e) {
    if (e.type === 'pollen') emit(e.x, e.y, 16, { color: '#ffe066', speed: 120, glow: true, life: 0.6 });
    if (e.type === 'won') emit(e.x, e.y, 60, { color: '#cfe3ff', speed: 220, glow: true, life: 1.2 });
    if (e.type === 'burned') emit(e.x, e.y, 40, { color: '#5b5468', speed: 50, life: 1.6, vy: -40, size: 4 });
    if (e.type === 'zapped') emit(e.x, e.y, 40, { color: '#7df9ff', speed: 260, glow: true, life: 0.5 });
    if (e.type === 'webbed') emit(e.x, e.y, 12, { color: '#e6e6ff', speed: 40, life: 0.8 });
    if (e.type === 'lampOn') emit(e.x, e.y, 10, { color: '#ffd27a', speed: 90, glow: true, life: 0.4 });
  }

  function sunScreenWorld(deg) {
    const r = (deg * Math.PI) / 180;
    return { x: 500 + 860 * Math.cos(r), y: 980 - 860 * Math.sin(r) };
  }

  function drawSky(s) {
    const e = Math.max(0, (Math.sin((s.sun * Math.PI) / 180) - 0.2) / 0.8);
    screenTf(ctx);
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, mix(SKY.low[0], SKY.high[0], e));
    g.addColorStop(0.55, mix(SKY.low[1], SKY.high[1], e));
    g.addColorStop(1, mix(SKY.low[2], SKY.high[2], e));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    worldTf(ctx);
    const p = sunScreenWorld(s.sun);
    const glow = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, 420);
    glow.addColorStop(0, 'rgba(255,240,200,0.85)');
    glow.addColorStop(0.15, 'rgba(255,200,120,0.35)');
    glow.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - 420, p.y - 420, 840, 840);
    ctx.fillStyle = '#fff6dc';
    ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, Math.PI * 2); ctx.fill();
  }

  function worldClip(c) {
    c.beginPath();
    c.roundRect(0, 0, W, H, 28);
    c.clip();
  }

  function drawShadows(s, blocks) {
    const d = sunDir(s.sun), L = 4000;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, shade.width, shade.height);
    worldTf(sctx);
    sctx.fillStyle = '#000';
    for (const r of blocks) {
      const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 4];
        sctx.beginPath();
        sctx.moveTo(ax, ay); sctx.lineTo(bx, by);
        sctx.lineTo(bx + d.x * L, by + d.y * L); sctx.lineTo(ax + d.x * L, ay + d.y * L);
        sctx.closePath(); sctx.fill();
      }
    }
    // Tint the silhouette into a cool shadow colour.
    sctx.globalCompositeOperation = 'source-in';
    screenTf(sctx);
    sctx.fillStyle = '#120a2c';
    sctx.fillRect(0, 0, view.w, view.h);
    sctx.globalCompositeOperation = 'source-over';

    ctx.save();
    worldTf(ctx); worldClip(ctx);
    // Warm wash over everything the sun touches, then the shadows on top.
    ctx.fillStyle = `rgba(255,190,110,${0.22 * sunStrength(s.sun)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.72;
    ctx.drawImage(shade, 0, 0);
    ctx.restore();
  }

  function windowsFor(i, r) {
    const key = i + ':' + r.w + 'x' + r.h;
    if (!windowsCache.has(key)) {
      const rng = mulberry32(i * 97 + 7), list = [];
      for (let y = 18; y < r.h - 18; y += 34) for (let x = 16; x < r.w - 22; x += 30) if (rng() < 0.28) list.push([x, y]);
      windowsCache.set(key, list);
    }
    return windowsCache.get(key);
  }

  function drawBlocks(s, blocks) {
    const d = sunDir(s.sun);
    blocks.forEach((r, i) => {
      const moving = !!s.level.blocks[i][4];
      if (moving) {
        // Clouds: soft puffy silhouette over the collision rect.
        ctx.fillStyle = '#2b1f4d';
        ctx.beginPath();
        ctx.roundRect(r.x, r.y + r.h * 0.3, r.w, r.h * 0.7, r.h * 0.35);
        for (let k = 0; k < 4; k++) {
          const cx = r.x + r.w * (0.18 + k * 0.21), rad = r.h * (k % 2 ? 0.55 : 0.7);
          ctx.moveTo(cx + rad, r.y + r.h * 0.55);
          ctx.arc(cx, r.y + r.h * 0.55, rad, 0, Math.PI * 2);
        }
        ctx.fill();
        return;
      }
      ctx.fillStyle = '#0f0a1f';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // Rim light on the faces the sun hits.
      ctx.fillStyle = 'rgba(255,190,120,0.55)';
      if (d.y > 0.2) ctx.fillRect(r.x, r.y, r.w, 3);
      if (d.x < -0.2) ctx.fillRect(r.x + r.w - 3, r.y, 3, r.h);
      if (d.x > 0.2) ctx.fillRect(r.x, r.y, 3, r.h);
      if (r.w >= 60 && r.h >= 120) {
        ctx.fillStyle = 'rgba(255,207,107,0.75)';
        for (const [x, y] of windowsFor(i, r)) ctx.fillRect(r.x + x, r.y + y, 10, 14);
      }
    });
    ctx.fillStyle = '#0b0716';
    ctx.fillRect(0, GROUND, W, H - GROUND);
  }

  function glowAt(x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawProps(s, time) {
    // Webs
    ctx.strokeStyle = 'rgba(230,230,255,0.55)';
    ctx.lineWidth = 1.5;
    for (const w of s.webs) {
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + Math.cos(a) * w.r, w.y + Math.sin(a) * w.r);
      }
      for (let ring = 1; ring <= 3; ring++) {
        const rr = (w.r * ring) / 3.4;
        for (let k = 0; k <= 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const px = w.x + Math.cos(a) * rr, py = w.y + Math.sin(a) * rr;
          k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
      }
      ctx.stroke();
      ctx.fillStyle = '#1a1226';
      ctx.beginPath(); ctx.arc(w.x + 6, w.y - 4, 6, 0, Math.PI * 2); ctx.fill();
    }

    // Pollen
    ctx.globalCompositeOperation = 'lighter';
    for (const p of s.pollen) {
      if (p.got) continue;
      const pulse = 1 + Math.sin(time * 4 + p.x) * 0.2;
      glowAt(p.x, p.y, 34 * pulse, 'rgba(255,224,102,0.6)');
      ctx.fillStyle = '#fff2a8';
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
    }

    // Moon jar (goal)
    const g = s.goal;
    glowAt(g.x, g.y, 120, 'rgba(170,205,255,0.45)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#eaf2ff';
    ctx.beginPath(); ctx.arc(g.x, g.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,140,190,0.6)';
    ctx.beginPath(); ctx.arc(g.x + 6, g.y - 3, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(220,235,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(g.x - 22, g.y - 24, 44, 50, 12); ctx.stroke();
    ctx.fillStyle = 'rgba(220,235,255,0.8)';
    ctx.fillRect(g.x - 14, g.y - 30, 28, 6);

    // Lamps
    s.lamps.forEach((l) => {
      if (l.kind === 'zap') {
        ctx.globalCompositeOperation = 'lighter';
        glowAt(l.x, l.y, 140, 'rgba(110,200,255,0.5)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#c9f6ff';
        ctx.fillRect(l.x - 8, l.y - 12, 16, 24);
        ctx.strokeStyle = '#2a3b55';
        ctx.lineWidth = 2;
        ctx.strokeRect(l.x - 13, l.y - 16, 26, 32);
        for (let k = -8; k <= 8; k += 5) { ctx.beginPath(); ctx.moveTo(l.x + k, l.y - 16); ctx.lineTo(l.x + k, l.y + 16); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(160,250,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let x = l.x, y = l.y;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; ctx.lineTo(x, y); }
        ctx.stroke();
        return;
      }
      ctx.strokeStyle = 'rgba(30,20,50,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(l.x, l.y - 14); ctx.lineTo(l.x, l.y - 34); ctx.stroke();
      if (l.on) {
        ctx.globalCompositeOperation = 'lighter';
        glowAt(l.x, l.y, 130, 'rgba(255,205,110,0.6)');
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#fff3c4';
      } else {
        ctx.fillStyle = '#3a3352';
      }
      ctx.beginPath(); ctx.arc(l.x, l.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = l.on ? 'rgba(255,230,160,0.9)' : 'rgba(170,160,210,0.7)';
      ctx.stroke();
      if (s.status === 'ready' || s.status === 'flying') {
        // Pulsing ring says "tap me".
        const k = (time * 0.8 + l.x * 0.001) % 1;
        ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(l.x, l.y, 20 + k * 26, 0, Math.PI * 2); ctx.stroke();
      }
    });
  }

  const END_LABEL = { won: 'Home!', burned: 'Burns here', zapped: 'Zapped', webbed: 'Web!' };

  // Dotted forecast of the flight if nothing changes: white in shade, red in sun.
  function drawPath(s, p, time) {
    if (!p || !p.points.length) return;
    const ready = s.status === 'ready';
    if (!ready && s.status !== 'flying') return;
    const alpha = ready ? 1 : 0.45;
    const pts = p.points;
    for (let i = 0; i < pts.length; i += 2) {
      const q = pts[i];
      const pulse = ready ? 0.6 + 0.4 * Math.sin(time * 6 - i * 0.25) : 1;
      ctx.globalAlpha = alpha * pulse;
      ctx.fillStyle = q.sun ? '#ff5d4a' : '#ffffff';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.sun ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = alpha;
    const label = p.end === 'flying' ? (p.target == null ? 'No light in sight' : '') : END_LABEL[p.end];
    if (label) {
      const good = p.end === 'won';
      ctx.fillStyle = good ? '#9ef0b0' : '#ff6b5a';
      if (!good) {
        ctx.lineWidth = 5; ctx.strokeStyle = '#ff6b5a';
        ctx.beginPath();
        ctx.moveTo(p.x - 12, p.y - 12); ctx.lineTo(p.x + 12, p.y + 12);
        ctx.moveTo(p.x + 12, p.y - 12); ctx.lineTo(p.x - 12, p.y + 12);
        ctx.stroke();
      }
      ctx.font = '600 30px Outfit, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(15,10,31,0.85)';
      const ly = p.y < 120 ? p.y + 52 : p.y - 30;
      const lx = Math.max(110, Math.min(W - 110, p.x));
      ctx.strokeText(label, lx, ly);
      ctx.fillText(label, lx, ly);
    }
    ctx.globalAlpha = 1;
  }

  function drawMoth(s, time) {
    const m = s.moth;
    // Dotted line to whatever the moth is chasing: shows its intent.
    if (s.status === 'flying' && m.target != null) {
      const t = m.target === 'goal' ? s.goal : s.lamps[m.target];
      ctx.setLineDash([6, 10]);
      ctx.lineDashOffset = -time * 40;
      ctx.strokeStyle = t.kind === 'zap' ? 'rgba(255,90,90,0.6)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (s.status === 'burned') return;

    const flying = s.status === 'flying';
    const ang = flying && Math.hypot(m.vx, m.vy) > 5 ? Math.atan2(m.vy, m.vx) + Math.PI / 2 : 0;
    const flap = flying ? Math.abs(Math.sin(time * 28)) : 0.75 + Math.sin(time * 2) * 0.15;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(ang * 0.6);
    ctx.scale(2.1, 2.1);
    const wing = m.inSun && flying ? '#ffb48a' : '#efe2c4';
    ctx.fillStyle = wing;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side * (0.35 + flap * 0.65), 1);
      ctx.beginPath(); ctx.ellipse(8, -3, 10, 7, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6, 6, 7, 5, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,90,60,0.6)';
      ctx.beginPath(); ctx.arc(10, -4, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#8b6f4e';
    ctx.beginPath(); ctx.ellipse(0, 1, 3, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8b6f4e';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-1, -7); ctx.quadraticCurveTo(-5, -14, -7, -13); ctx.moveTo(1, -7); ctx.quadraticCurveTo(5, -14, 7, -13); ctx.stroke();
    ctx.restore();

    if (m.hp < 0.999 && flying) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(m.x, m.y, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = m.hp > 0.5 ? '#9ef0b0' : m.hp > 0.25 ? '#ffd166' : '#ff5d5d';
      ctx.beginPath(); ctx.arc(m.x, m.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m.hp); ctx.stroke();
    }
  }

  function drawParticles(dt) {
    for (const p of particles) {
      p.life += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.97; p.vy *= 0.97;
    }
    particles = particles.filter((p) => p.life < p.max);
    for (const p of particles) {
      const a = 1 - p.life / p.max;
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawGauge(s) {
    // Little sundial in the ground strip: shows where the sun sits between dawn and dusk.
    const cx = 500, cy = 994, r = 44;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.stroke();
    const a = (s.sun * Math.PI) / 180;
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy - Math.sin(a) * r, 7, 0, Math.PI * 2); ctx.fill();
  }

  function draw(s, time, dt, preview) {
    if (!canvas.width || !canvas.height) return;
    const blocks = blocksAt(s.level, s.t);
    const m = s.moth;
    if (s.status === 'flying') {
      if (Math.random() < 0.5) particles.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 0, max: 0.6, size: 1.6, color: '#fff3d0', glow: true, gravity: 0 });
      if (m.inSun) emit(m.x, m.y, 2, { color: Math.random() < 0.5 ? '#ff8c42' : '#ffd166', speed: 40, vy: -60, life: 0.5, glow: true, size: 2.2 });
    }
    drawSky(s);
    drawShadows(s, blocks);
    ctx.save();
    worldTf(ctx); worldClip(ctx);
    drawBlocks(s, blocks);
    drawProps(s, time);
    drawPath(s, preview, time);
    drawMoth(s, time);
    drawParticles(dt);
    drawGauge(s);
    ctx.restore();
    worldTf(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2 / view.s;
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 28); ctx.stroke();
  }

  function reset() { particles = []; }

  return { view, resize, toWorld, draw, event, reset };
}
