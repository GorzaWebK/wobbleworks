// Draws a level: graph paper, sketchy ground, water, wind, moving junk, the
// flag, the sock, bolts, the parts you built and Wob. Works for building
// (parts at rest), for runs (parts from the physics) and for thumbnails.

import { CELL, WOB_R, WHEEL_R } from '../physics/consts.js';
import { terrainFor, wobStart } from '../levels/level.js';
import { moverPhase } from '../physics/world.js';
import { PARTS } from '../game/parts.js';
import { keyOf, anchorKeys, linkLength } from '../game/build.js';
import { INK, themeFor, stressColour } from './theme.js';
import { sketchLine, sketchCircle, hatchRect, seeded, mix } from './sketch.js';
import { star } from './fx.js';

export const HAND = '"Patrick Hand", "Comic Sans MS", cursive';
export const MARKER = '"Permanent Marker", "Patrick Hand", cursive';

// ------------------------------------------------------------------ paper
export function drawPaper(ctx, cam, level, dpr, opts = {}) {
  const th = themeFor(level);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = mix(INK.paper, th.wash, 0.75);
  ctx.fillRect(cam.vx, cam.vy, cam.vw, cam.vh);
  cam.apply(ctx, dpr);
  const [x0, y0] = cam.toWorld(cam.vx, cam.vy);
  const [x1, y1] = cam.toWorld(cam.vx + cam.vw, cam.vy + cam.vh);
  const c0 = Math.floor(x0 / CELL) - 1;
  const c1 = Math.ceil(x1 / CELL) + 1;
  const r0 = Math.floor(y0 / CELL) - 1;
  const r1 = Math.ceil(y1 / CELL) + 1;
  const px = 1 / cam.scale;
  // minor quarter-cell lines when zoomed in enough
  if (cam.scale * CELL > 60 && !opts.noMinor) {
    ctx.strokeStyle = 'rgba(43,108,214,0.06)';
    ctx.lineWidth = px;
    ctx.beginPath();
    for (let c = c0; c <= c1; c++) for (let k = 1; k < 4; k++) { const x = (c + k / 4) * CELL; ctx.moveTo(x, r0 * CELL); ctx.lineTo(x, r1 * CELL); }
    for (let r = r0; r <= r1; r++) for (let k = 1; k < 4; k++) { const y = (r + k / 4) * CELL; ctx.moveTo(c0 * CELL, y); ctx.lineTo(c1 * CELL, y); }
    ctx.stroke();
  }
  ctx.strokeStyle = INK.grid;
  ctx.lineWidth = px;
  ctx.beginPath();
  for (let c = c0; c <= c1; c++) { ctx.moveTo(c * CELL, r0 * CELL); ctx.lineTo(c * CELL, r1 * CELL); }
  for (let r = r0; r <= r1; r++) { ctx.moveTo(c0 * CELL, r * CELL); ctx.lineTo(c1 * CELL, r * CELL); }
  ctx.stroke();
  ctx.strokeStyle = INK.gridMajor;
  ctx.lineWidth = px * 1.2;
  ctx.beginPath();
  for (let c = Math.ceil(c0 / 4) * 4; c <= c1; c += 4) { ctx.moveTo(c * CELL, r0 * CELL); ctx.lineTo(c * CELL, r1 * CELL); }
  for (let r = Math.ceil(r0 / 4) * 4; r <= r1; r += 4) { ctx.moveTo(c0 * CELL, r * CELL); ctx.lineTo(c1 * CELL, r * CELL); }
  ctx.stroke();
  // the sheet's edge
  ctx.strokeStyle = INK.blueSoft;
  ctx.setLineDash([8 * px, 6 * px]);
  ctx.lineWidth = 1.5 * px;
  ctx.strokeRect(0, 0, level.w * CELL, level.h * CELL);
  ctx.setLineDash([]);
}

// ---------------------------------------------------------- ground (cached)
const groundCache = new WeakMap();

export function groundLayer(level, scale) {
  const key = Math.round(scale * 100) / 100;
  let c = groundCache.get(level);
  if (c && c.key === key && c.tiles === level.tiles) return c;
  const pad = 2;
  const W = Math.ceil((level.w + pad * 2) * CELL * scale);
  const H = Math.ceil((level.h + pad * 2) * CELL * scale);
  const cv = makeCanvas(Math.max(1, Math.min(W, 4096)), Math.max(1, Math.min(H, 4096)));
  const s = Math.min(scale, 4096 / ((level.w + pad * 2) * CELL), 4096 / ((level.h + pad * 2) * CELL));
  const ctx = cv.getContext('2d');
  ctx.setTransform(s, 0, 0, s, pad * CELL * s, pad * CELL * s);
  drawGround(ctx, level, 1 / s);
  c = { key, canvas: cv, pad, s, tiles: level.tiles };
  groundCache.set(level, c);
  return c;
}

export function clearGroundCache(level) {
  groundCache.delete(level);
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tilePath(path, t, c, r) {
  const x = c * CELL;
  const y = r * CELL;
  const S = CELL;
  const pts = {
    '#': [[0, 0], [1, 0], [1, 1], [0, 1]],
    A: [[1, 0], [1, 1], [0, 1]],
    B: [[0, 0], [1, 1], [0, 1]],
    C: [[0, 0], [1, 0], [1, 1]],
    D: [[0, 0], [1, 0], [0, 1]],
  }[t];
  if (!pts) return;
  path.moveTo(x + pts[0][0] * S, y + pts[0][1] * S);
  for (let i = 1; i < pts.length; i++) path.lineTo(x + pts[i][0] * S, y + pts[i][1] * S);
  path.closePath();
}

export function drawGround(ctx, level, px = 1) {
  const th = themeFor(level);
  const T = terrainFor(level);
  const path = new Path2D();
  for (let r = 0; r < level.h; r++) {
    for (let c = 0; c < level.w; c++) {
      const t = level.tiles[r][c];
      if (t !== '.') tilePath(path, t, c, r);
    }
  }
  // blue "ink" shadow under the cut-out
  ctx.save();
  ctx.translate(3, 4);
  ctx.fillStyle = 'rgba(43,108,214,0.16)';
  ctx.fill(path);
  ctx.restore();
  ctx.fillStyle = th.ground;
  ctx.fill(path);
  // texture
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = mix(th.ground, th.groundDeep, 0.55);
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.2;
  const rnd = seeded(level.w * 31 + level.h);
  if (th.groundLine === 'corrugated') {
    hatchRect(ctx, 0, 0, level.w * CELL, level.h * CELL, 9, 1);
  } else if (th.groundLine === 'cracks') {
    hatchRect(ctx, 0, 0, level.w * CELL, level.h * CELL, 14, -1);
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < level.w * level.h * 0.08; i++) {
      const x = rnd() * level.w * CELL;
      const y = rnd() * level.h * CELL;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8, y + 6);
      ctx.lineTo(x + 5, y + 14);
      ctx.stroke();
    }
  } else if (th.groundLine === 'mud') {
    for (let y = 6; y < level.h * CELL; y += 12) {
      ctx.beginPath();
      for (let x = 0; x <= level.w * CELL; x += 10) ctx.lineTo(x, y + Math.sin(x * 0.08 + y) * 3);
      ctx.stroke();
    }
    ctx.fillStyle = mix(th.ground, '#ffffff', 0.25);
    for (let i = 0; i < level.w * level.h * 0.1; i++) {
      ctx.beginPath();
      ctx.arc(rnd() * level.w * CELL, rnd() * level.h * CELL, 2 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (th.groundLine === 'rivets') {
    hatchRect(ctx, 0, 0, level.w * CELL, level.h * CELL, 16, 1);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = mix(th.groundDeep, '#ffffff', 0.35);
    for (let r = 0; r < level.h; r++) {
      for (let c = 0; c < level.w; c++) {
        if (level.tiles[r][c] !== '#') continue;
        ctx.beginPath();
        ctx.arc(c * CELL + 7, r * CELL + 7, 2.2, 0, Math.PI * 2);
        ctx.arc(c * CELL + CELL - 7, r * CELL + CELL - 7, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
  // outlines: blue ink offset, then pencil on top, then a light top edge
  ctx.lineCap = 'round';
  T.cellSegs.forEach((s, i) => {
    const ax = s[0] * CELL;
    const ay = s[1] * CELL;
    const bx = s[2] * CELL;
    const by = s[3] * CELL;
    ctx.strokeStyle = 'rgba(43,108,214,0.5)';
    ctx.lineWidth = 1.2;
    sketchLine(ctx, ax + 2, ay + 2, bx + 2, by + 2, i * 7 + 3, { passes: 1, jitter: 1.5, overshoot: 5 });
    ctx.strokeStyle = INK.pencil;
    ctx.lineWidth = 2;
    sketchLine(ctx, ax, ay, bx, by, i * 7 + 1, { passes: 2, jitter: 1.4, overshoot: 4 });
    if (s[5] < 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2.5;
      const ox = -s[4] * 4;
      const oy = -s[5] * 4;
      sketchLine(ctx, ax + ox, ay + oy, bx + ox, by + oy, i * 7 + 5, { passes: 1, jitter: 0.8, overshoot: -3 });
    }
  });
}

// ------------------------------------------------------------ level pieces
export function waterColour(level) {
  return level.world === 3 ? [126, 178, 120] : level.world === 4 ? [150, 140, 230] : [110, 176, 222];
}

export function drawWater(ctx, level, t, reduced) {
  const [r, g, b] = waterColour(level);
  for (const z of level.water) {
    const x0 = z.x * CELL;
    const y0 = z.y * CELL;
    const w = z.w * CELL;
    const h = z.h * CELL;
    ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h);
    for (let x = 0; x <= w; x += 8) {
      const yy = y0 + (reduced ? 0 : Math.sin(x * 0.07 + t * 2.2) * 2.5);
      ctx.lineTo(x0 + x, yy);
    }
    ctx.lineTo(x0 + w, y0 + h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${r * 0.6 | 0},${g * 0.6 | 0},${b * 0.7 | 0},0.8)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const yy = y0 + (reduced ? 0 : Math.sin(x * 0.07 + t * 2.2) * 2.5);
      if (x === 0) ctx.moveTo(x0 + x, yy);
      else ctx.lineTo(x0 + x, yy);
    }
    ctx.stroke();
    // doodled ripples and bubbles
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    const rnd = seeded(Math.round(x0 + y0));
    for (let i = 0; i < z.w * z.h * 0.7; i++) {
      const bx = x0 + rnd() * w;
      const by = y0 + 10 + rnd() * (h - 14);
      const bob = reduced ? 0 : Math.sin(t * 1.5 + i) * 3;
      ctx.beginPath();
      if (i % 3 === 0) ctx.arc(bx, by + bob, 2.5, 0, Math.PI * 2);
      else { ctx.moveTo(bx - 6, by + bob); ctx.quadraticCurveTo(bx, by - 3 + bob, bx + 6, by + bob); }
      ctx.stroke();
    }
  }
}

export function drawWind(ctx, level, t, reduced) {
  for (const z of level.wind) {
    const x0 = z.x * CELL;
    const y0 = z.y * CELL;
    const w = z.w * CELL;
    const h = z.h * CELL;
    const m = Math.hypot(z.fx, z.fy) || 1;
    const ux = z.fx / m;
    const uy = z.fy / m;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.fillStyle = 'rgba(43,108,214,0.05)';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = 'rgba(43,108,214,0.45)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const speed = reduced ? 0 : 60 + m * 0.05;
    const gap = 70;
    const off = (t * speed) % gap;
    // swirly streaks moving with the wind
    for (let i = -1; i < (w + h) / gap + 1; i++) {
      for (let j = 0; j < Math.ceil((ux !== 0 ? h : w) / 46); j++) {
        const along = i * gap + off;
        const across = j * 46 + 20 + ((i * 17) % 23);
        let cx;
        let cy;
        if (Math.abs(ux) >= Math.abs(uy)) {
          cx = ux > 0 ? x0 + along : x0 + w - along;
          cy = y0 + across;
        } else {
          cx = x0 + across;
          cy = uy > 0 ? y0 + along : y0 + h - along;
        }
        const L = 22;
        ctx.beginPath();
        ctx.moveTo(cx - ux * L, cy - uy * L);
        ctx.quadraticCurveTo(cx - uy * 6, cy + ux * 6, cx, cy);
        ctx.stroke();
        // arrowhead
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - ux * 7 - uy * 5, cy - uy * 7 + ux * 5);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - ux * 7 + uy * 5, cy - uy * 7 - ux * 5);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(43,108,214,0.3)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x0, y0, w, h);
    ctx.setLineDash([]);
  }
}

// mover rectangles at a given time; `world` gives live positions during a run
export function drawMovers(ctx, level, time, showPath, worldMovers) {
  level.movers.forEach((m, i) => {
    let ox;
    let oy;
    if (worldMovers) { ox = worldMovers[i].ox; oy = worldMovers[i].oy; } else {
      const [s] = moverPhase(time, m.period, m.phase);
      ox = m.dx * s * CELL;
      oy = m.dy * s * CELL;
    }
    const x = m.x * CELL + ox;
    const y = m.y * CELL + oy;
    const w = m.w * CELL;
    const h = m.h * CELL;
    if (showPath && (m.dx || m.dy)) {
      ctx.strokeStyle = INK.blueSoft;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(m.x * CELL + m.dx * CELL, m.y * CELL + m.dy * CELL, w, h);
      ctx.beginPath();
      ctx.moveTo(m.x * CELL + w / 2, m.y * CELL + h / 2);
      ctx.lineTo(m.x * CELL + m.dx * CELL + w / 2, m.y * CELL + m.dy * CELL + h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawJunk(ctx, level.world, x, y, w, h, i);
  });
}

function drawJunk(ctx, world, x, y, w, h, i) {
  ctx.save();
  ctx.fillStyle = 'rgba(43,108,214,0.16)';
  ctx.fillRect(x + 3, y + 4, w, h);
  if (world === 3) {
    // a floating log
    ctx.fillStyle = '#a77a48';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, h / 2) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = '#6e4b25';
    ctx.lineWidth = 1.2;
    for (let k = 1; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x + h / 2, y + (h * k) / 3);
      ctx.lineTo(x + w - h / 2, y + (h * k) / 3 + ((k % 2) ? 2 : -2));
      ctx.stroke();
    }
    ctx.fillStyle = '#d9b07a';
    ctx.beginPath();
    ctx.ellipse(x + w - h / 2, y + h / 2, h * 0.32, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (world === 4) {
    // a hunk of space junk with rivets
    ctx.fillStyle = '#b9b4d8';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#6f6a97';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffffaa';
    for (let k = 0; k < w / 20; k++) {
      ctx.beginPath();
      ctx.arc(x + 10 + k * 20, y + 6, 2, 0, Math.PI * 2);
      ctx.arc(x + 10 + k * 20, y + h - 6, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = INK.bubblegum;
    ctx.fillRect(x + w - 12, y + 3, 8, 4);
  } else {
    // a wooden crate
    ctx.fillStyle = INK.wood;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK.woodDeep;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
    ctx.stroke();
  }
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  sketchLine(ctx, x, y, x + w, y, i * 11 + 1, { passes: 1 });
  sketchLine(ctx, x + w, y, x + w, y + h, i * 11 + 2, { passes: 1 });
  sketchLine(ctx, x + w, y + h, x, y + h, i * 11 + 3, { passes: 1 });
  sketchLine(ctx, x, y + h, x, y, i * 11 + 4, { passes: 1 });
  ctx.restore();
}

export function drawFlag(ctx, level, t, reduced, reached = false) {
  const x = (level.flag[0] + 0.5) * CELL;
  const y = (level.flag[1] + 1) * CELL;
  const H = CELL * 1.8;
  ctx.save();
  ctx.lineCap = 'round';
  // little mound
  ctx.fillStyle = 'rgba(43,108,214,0.12)';
  ctx.beginPath();
  ctx.ellipse(x, y, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 3;
  sketchLine(ctx, x, y, x, y - H, 99, { passes: 2, jitter: 0.8 });
  const wave = reduced ? 0 : Math.sin(t * 5);
  const fw = 30;
  const fh = 20;
  const top = y - H + 2;
  ctx.fillStyle = reached ? INK.lime : INK.bubblegum;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.quadraticCurveTo(x + fw * 0.5, top - 5 + wave * 4, x + fw, top + fh * 0.45 + wave * 2);
  ctx.quadraticCurveTo(x + fw * 0.5, top + fh * 0.6 - wave * 3, x, top + fh);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  star(ctx, x + fw * 0.38, top + fh * 0.47, 5.5, 2.4, wave * 0.2);
  ctx.fill();
  ctx.restore();
}

export function drawSock(ctx, level, t, reduced, alpha = 1) {
  if (!level.sock) return;
  const x = (level.sock[0] + 0.5) * CELL;
  const y = (level.sock[1] + 0.5) * CELL + (reduced ? 0 : Math.sin(t * 2.5) * 2);
  drawSockShape(ctx, x, y, 1, alpha, reduced ? 0 : Math.sin(t * 1.7) * 0.15);
}

export function drawSockShape(ctx, x, y, s = 1, alpha = 1, rot = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(-0.35 + rot);
  ctx.scale(s, s);
  const path = new Path2D();
  path.moveTo(-5, -12);
  path.lineTo(5, -12);
  path.lineTo(5, 3);
  path.quadraticCurveTo(14, 4, 14, 9);
  path.quadraticCurveTo(13, 13, 4, 13);
  path.lineTo(-2, 13);
  path.quadraticCurveTo(-6, 13, -5, 6);
  path.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = INK.tangerine;
  for (let k = -12; k < 14; k += 7) ctx.fillRect(-8, k, 24, 3.2);
  ctx.fillStyle = INK.lime;
  ctx.fillRect(-8, -12, 24, 3);
  ctx.restore();
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.6;
  ctx.stroke(path);
  ctx.restore();
}

export function drawStart(ctx, level) {
  const x = (level.start[0] + 0.5) * CELL;
  const y = (level.start[1] + 1) * CELL;
  ctx.save();
  ctx.strokeStyle = INK.blueSoft;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.ellipse(x, y - WOB_R, WOB_R + 5, WOB_R + 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = INK.blue;
  ctx.font = `14px ${HAND}`;
  ctx.textAlign = 'center';
  ctx.fillText('start', x, y - WOB_R * 2 - 10);
  ctx.restore();
}

export function drawBolt(ctx, x, y, strong, seed = 1) {
  ctx.save();
  if (strong) {
    ctx.strokeStyle = 'rgba(43,108,214,0.55)';
    ctx.lineWidth = 1.2;
    sketchCircle(ctx, x, y, 9.5, seed, { jitter: 0.12 });
  }
  ctx.fillStyle = '#d5d9e0';
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const px = x + Math.cos(a) * 5.5;
    const py = y + Math.sin(a) * 5.5;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 1.5);
  ctx.lineTo(x + 3, y + 1.5);
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------- parts
function blendStress(base, stress, cb) {
  const c = stressColour(stress, cb);
  const k = Math.min(1, (stress - 0.1) * 1.3);
  return `color-mix(in srgb, ${c} ${Math.round(k * 85)}%, ${base})`;
}

const SUPPORTS_COLOR_MIX = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');

function tint(base, stress, cb) {
  if (stress < 0.12) return base;
  if (SUPPORTS_COLOR_MIX) return blendStress(base, stress, cb);
  return stressColour(stress, cb);
}

// Hatching that gets denser as stress rises, so stress never relies on colour alone.
function stressHatch(ctx, len, th, stress) {
  if (stress < 0.35) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, -th / 2, len, th);
  ctx.clip();
  ctx.strokeStyle = 'rgba(30,30,40,0.75)';
  ctx.lineWidth = 1.1;
  const gap = stress > 0.7 ? 4 : 7;
  hatchRect(ctx, 0, -th / 2, len, th, gap, 1);
  if (stress > 0.7) hatchRect(ctx, 0, -th / 2, len, th, gap, -1);
  ctx.restore();
}

export function drawPlank(ctx, ax, ay, bx, by, stress = 0, opts = {}) {
  const len = Math.hypot(bx - ax, by - ay);
  const th = 10;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(Math.atan2(by - ay, bx - ax));
  ctx.fillStyle = opts.ghost ? 'rgba(230,189,127,0.55)' : tint(INK.wood, stress, opts.cb);
  ctx.beginPath();
  ctx.moveTo(-3, -th / 2);
  ctx.lineTo(len + 3, -th / 2 + 0.5);
  ctx.lineTo(len + 3, th / 2);
  ctx.lineTo(-3, th / 2 - 0.5);
  ctx.closePath();
  ctx.fill();
  if (opts.cb) stressHatch(ctx, len, th, stress);
  ctx.strokeStyle = 'rgba(150,100,40,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, -1.5); ctx.lineTo(len * 0.55, -2);
  ctx.moveTo(len * 0.3, 2); ctx.lineTo(len - 4, 1.5);
  ctx.stroke();
  ctx.strokeStyle = opts.ghost ? INK.blue : INK.pencil;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  const seed = opts.seed || 1;
  sketchLine(ctx, -3, -th / 2, len + 3, -th / 2 + 0.5, seed, { passes: 1, jitter: 0.8, overshoot: 2 });
  sketchLine(ctx, len + 3, th / 2, -3, th / 2 - 0.5, seed + 1, { passes: 1, jitter: 0.8, overshoot: 2 });
  ctx.beginPath();
  ctx.moveTo(-3, -th / 2); ctx.lineTo(-3, th / 2);
  ctx.moveTo(len + 3, -th / 2); ctx.lineTo(len + 3, th / 2);
  ctx.stroke();
  ctx.fillStyle = INK.pencil;
  ctx.beginPath();
  ctx.arc(3, 0, 1.6, 0, Math.PI * 2);
  ctx.arc(len - 3, 0, 1.6, 0, Math.PI * 2);
  ctx.fill();
  if (opts.cb && stress > 0.7) {
    ctx.fillStyle = '#1e1e28';
    ctx.font = `bold 13px ${HAND}`;
    ctx.textAlign = 'center';
    ctx.fillText('!', len / 2, -th / 2 - 3);
  }
  ctx.restore();
}

export function drawRope(ctx, ax, ay, bx, by, rest, stress = 0, opts = {}) {
  const d = Math.hypot(bx - ax, by - ay);
  ctx.save();
  ctx.lineCap = 'round';
  let cx = (ax + bx) / 2;
  let cy = (ay + by) / 2;
  if (rest && d < rest * 0.995) {
    const sag = Math.sqrt(Math.max(0, rest * rest - d * d)) * 0.5;
    cy += sag;
  }
  const col = opts.ghost ? INK.blue : stress > 0.12 ? stressColour(stress, opts.cb) : '#8a6a3c';
  ctx.strokeStyle = 'rgba(74,79,87,0.8)';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(cx, cy, bx, by);
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  // twist marks
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  const n = Math.max(2, Math.floor(d / 9));
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx;
    const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by;
    ctx.moveTo(x - 2, y - 2);
    ctx.lineTo(x + 2, y + 2);
  }
  ctx.stroke();
  if (opts.cb && stress > 0.5) {
    ctx.fillStyle = '#1e1e28';
    ctx.font = `bold 13px ${HAND}`;
    ctx.fillText(stress > 0.75 ? '!!' : '!', cx + 4, cy - 4);
  }
  ctx.restore();
}

export function drawSpring(ctx, ax, ay, bx, by, rest, stress = 0, opts = {}) {
  const len = Math.hypot(bx - ax, by - ay);
  const squash = opts.squash || 0;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(Math.atan2(by - ay, bx - ax));
  const amp = 7 + squash * 4;
  const coils = Math.max(4, Math.round(len / 9));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(74,79,87,0.9)';
  ctx.lineWidth = 4;
  const path = new Path2D();
  path.moveTo(0, 0);
  for (let i = 0; i <= coils; i++) {
    const x = 4 + ((len - 8) * i) / coils;
    path.lineTo(x, i % 2 ? amp : -amp);
  }
  path.lineTo(len, 0);
  ctx.stroke(path);
  ctx.strokeStyle = opts.ghost ? INK.blue : stress > 0.15 ? stressColour(stress, opts.cb) : '#cfd5de';
  ctx.lineWidth = 2;
  ctx.stroke(path);
  // tangerine bounce plate along the top
  ctx.fillStyle = opts.ghost ? 'rgba(255,138,30,0.5)' : INK.tangerine;
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.rect(-2, -amp - 4, len + 4, 4);
  ctx.rect(-2, amp, len + 4, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawBalloon(ctx, x, y, t, sway = 0, opts = {}) {
  const bx = x + sway * 10 + (opts.reduced ? 0 : Math.sin(t * 1.8 + x) * 2);
  const by = y - CELL * 1.25;
  ctx.save();
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + (bx - x) * 0.3 + 4, (y + by) / 2, bx, by + 16);
  ctx.stroke();
  const g = ctx.createRadialGradient(bx - 4, by - 6, 2, bx, by, 18);
  g.addColorStop(0, '#ffd0e6');
  g.addColorStop(0.5, opts.colour || INK.bubblegum);
  g.addColorStop(1, INK.bubblegumDeep);
  ctx.fillStyle = opts.ghost ? 'rgba(255,95,168,0.45)' : g;
  ctx.beginPath();
  ctx.ellipse(bx, by, 13, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = opts.ghost ? INK.blue : INK.bubblegumDeep;
  ctx.stroke();
  ctx.fillStyle = INK.bubblegumDeep;
  ctx.beginPath();
  ctx.moveTo(bx, by + 15);
  ctx.lineTo(bx - 3, by + 20);
  ctx.lineTo(bx + 3, by + 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(bx - 1, by - 1, 9, Math.PI * 1.1, Math.PI * 1.4);
  ctx.stroke();
  ctx.restore();
}

export function drawWheel(ctx, x, y, ang, opts = {}) {
  const R = WHEEL_R;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = opts.ghost ? 'rgba(217,185,138,0.5)' : INK.card;
  ctx.strokeStyle = opts.ghost ? INK.blue : '#3c3f45';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, R - 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.rotate(ang);
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * (R - 5), Math.sin(a) * (R - 5));
  }
  ctx.stroke();
  ctx.fillStyle = INK.tangerine;
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawSticky(ctx, x, y, opts = {}) {
  ctx.save();
  ctx.fillStyle = opts.ghost ? 'rgba(142,224,58,0.5)' : INK.lime;
  ctx.strokeStyle = opts.ghost ? INK.blue : INK.limeDeep;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(x, y, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x - 5, y + 6, 2, 3.5, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 4, y + 7, 1.8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(x - 3, y - 2, 3, 1.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawBolt(ctx, x, y, false);
}

export function drawJoint(ctx, x, y) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// Parts at rest (building). `highlight` is the index of a part to outline.
export function drawBuild(ctx, level, parts, t, opts = {}) {
  const anchors = anchorKeys(level, parts);
  const joints = new Map();
  const seedOf = (i) => i * 17 + 3;
  const links = [];
  parts.forEach((p, i) => { if (PARTS[p.t].kind === 'link') links.push([p, i]); });
  // ropes behind, then springs and planks
  for (const order of ['rope', 'spring', 'plank']) {
    for (const [p, i] of links) {
      if (p.t !== order) continue;
      const ax = p.a[0] * CELL; const ay = p.a[1] * CELL; const bx = p.b[0] * CELL; const by = p.b[1] * CELL;
      if (i === opts.highlight) highlightLine(ctx, ax, ay, bx, by);
      if (p.t === 'plank') drawPlank(ctx, ax, ay, bx, by, 0, { seed: seedOf(i), cb: opts.cb });
      else if (p.t === 'rope') drawRope(ctx, ax, ay, bx, by, 0, 0, {});
      else drawSpring(ctx, ax, ay, bx, by, 0, 0, {});
      for (const e of [p.a, p.b]) joints.set(keyOf(e[0], e[1]), e);
    }
  }
  parts.forEach((p, i) => {
    const x = p.a[0] * CELL;
    const y = p.a[1] * CELL;
    if (i === opts.highlight && PARTS[p.t].kind === 'point') {
      ctx.save(); ctx.strokeStyle = INK.bubblegum; ctx.lineWidth = 4; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(x, y - (p.t === 'balloon' ? CELL * 1.2 : 0), 20, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (p.t === 'wheel') drawWheel(ctx, x, y, 0);
    else if (p.t === 'sticky') drawSticky(ctx, x, y);
  });
  const balloonCount = new Map();
  parts.forEach((p) => {
    if (p.t !== 'balloon') return;
    const k = keyOf(p.a[0], p.a[1]);
    const n = balloonCount.get(k) || 0;
    balloonCount.set(k, n + 1);
    drawBalloon(ctx, p.a[0] * CELL, p.a[1] * CELL, t, (n - 1) * 1.2, { reduced: opts.reduced });
  });
  for (const [k, e] of joints) if (!anchors.has(k)) drawJoint(ctx, e[0] * CELL, e[1] * CELL);
  level.anchors.forEach(([x, y], i) => drawBolt(ctx, x * CELL, y * CELL, opts.mode !== 'run', i));
}

function highlightLine(ctx, ax, ay, bx, by) {
  ctx.save();
  ctx.strokeStyle = INK.bubblegum;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();
}

// Parts during a run, read from the physics world.
export function drawRun(ctx, level, sim, t, opts = {}) {
  const w = sim.world;
  const pts = w.points;
  const order = { rope: 0, spring: 1, plank: 2 };
  const ls = w.links.map((l, i) => i).filter((i) => !w.links[i].broken).sort((a, b) => order[w.links[a].type] - order[w.links[b].type]);
  for (const i of ls) {
    const l = w.links[i];
    const a = pts[l.a];
    const b = pts[l.b];
    if (l.type === 'plank') drawPlank(ctx, a.x, a.y, b.x, b.y, l.stress, { seed: l.part * 17 + 3, cb: opts.cb });
    else if (l.type === 'rope') drawRope(ctx, a.x, a.y, b.x, b.y, l.rest, l.stress, { cb: opts.cb });
    else {
      const recent = l.touched != null ? Math.max(0, 1 - (w.steps - l.touched) / 20) : 0;
      drawSpring(ctx, a.x, a.y, b.x, b.y, l.rest, l.stress, { cb: opts.cb, squash: recent });
    }
  }
  for (const wh of sim.wheels) {
    const p = pts[wh.node];
    drawWheel(ctx, p.x, p.y, p.ang);
  }
  for (const p of sim.parts) {
    if (p.t === 'sticky') {
      const idx = sim.nodeOf.get(keyOf(p.a[0], p.a[1]));
      const q = pts[idx];
      drawSticky(ctx, q.x, q.y);
    }
  }
  const count = new Map();
  for (const b of sim.balloons) {
    if (b.popped) continue;
    const p = pts[b.node];
    const n = count.get(b.node) || 0;
    count.set(b.node, n + 1);
    const vx = (p.x - p.px) * 120;
    drawBalloon(ctx, p.x, p.y, t, (n - 1) * 1.2 + Math.max(-1.5, Math.min(1.5, vx / 200)), { reduced: opts.reduced });
  }
  // free joints
  const linked = new Set();
  for (const l of w.links) { if (!l.broken) { linked.add(l.a); linked.add(l.b); } }
  for (const i of linked) {
    const p = pts[i];
    if (p.kind === 'node' && !p.fixed) drawJoint(ctx, p.x, p.y);
  }
  level.anchors.forEach(([x, y], i) => drawBolt(ctx, x * CELL, y * CELL, false, i));
}

// Blueprint-style ghost of the part being placed, with a dimension line.
export function drawGhost(ctx, ghost, t, opts = {}) {
  if (!ghost) return;
  const { part, ok } = ghost;
  ctx.save();
  ctx.globalAlpha = ok ? 0.95 : 0.55;
  const ax = part.a[0] * CELL;
  const ay = part.a[1] * CELL;
  if (part.b) {
    const bx = part.b[0] * CELL;
    const by = part.b[1] * CELL;
    if (part.t === 'plank') drawPlank(ctx, ax, ay, bx, by, 0, { ghost: true });
    else if (part.t === 'rope') drawRope(ctx, ax, ay, bx, by, 0, 0, { ghost: true });
    else drawSpring(ctx, ax, ay, bx, by, 0, 0, { ghost: true });
    // dimension line
    const len = linkLength(part);
    const ang = Math.atan2(by - ay, bx - ax);
    const nx = -Math.sin(ang) * 18;
    const ny = Math.cos(ang) * 18;
    ctx.strokeStyle = ok ? INK.blue : INK.bubblegumDeep;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ax + nx, ay + ny); ctx.lineTo(bx + nx, by + ny);
    ctx.moveTo(ax + nx * 0.6, ay + ny * 0.6); ctx.lineTo(ax + nx * 1.3, ay + ny * 1.3);
    ctx.moveTo(bx + nx * 0.6, by + ny * 0.6); ctx.lineTo(bx + nx * 1.3, by + ny * 1.3);
    ctx.stroke();
    ctx.save();
    ctx.translate((ax + bx) / 2 + nx * 1.6, (ay + by) / 2 + ny * 1.6);
    let a = ang;
    if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
    ctx.rotate(a);
    ctx.font = `15px ${HAND}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const txt = `${(Math.round(len * 10) / 10).toString()} sq`;
    ctx.fillStyle = 'rgba(251,245,228,0.9)';
    const tw = ctx.measureText(txt).width;
    ctx.fillRect(-tw / 2 - 3, -9, tw + 6, 18);
    ctx.fillStyle = ok ? INK.blue : INK.bubblegumDeep;
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  } else if (part.t === 'balloon') drawBalloon(ctx, ax, ay, t, 0, { ghost: true });
  else if (part.t === 'wheel') drawWheel(ctx, ax, ay, 0, { ghost: true });
  else if (part.t === 'sticky') drawSticky(ctx, ax, ay, { ghost: true });
  ctx.restore();
}

export function drawCursor(ctx, x, y, colour, label, t) {
  const px = x * CELL;
  const py = y * CELL;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  const r = 11 + Math.sin(t * 6) * 1.5;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.moveTo(px - r - 6, py); ctx.lineTo(px - r + 3, py);
  ctx.moveTo(px + r - 3, py); ctx.lineTo(px + r + 6, py);
  ctx.moveTo(px, py - r - 6); ctx.lineTo(px, py - r + 3);
  ctx.moveTo(px, py + r - 3); ctx.lineTo(px, py + r + 6);
  ctx.stroke();
  if (label) {
    ctx.font = `bold 14px ${HAND}`;
    ctx.fillStyle = colour;
    ctx.fillText(label, px + r + 4, py - r - 2);
  }
  ctx.restore();
}

// Wob sitting at the start, for build mode.
export function wobRestPos(level) {
  return wobStart(level);
}
