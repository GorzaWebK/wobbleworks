// Pencil thumbnails of levels for the sketchbook, drawn from the real level data.

import { CELL, WOB_R } from '../physics/consts.js';
import { Camera } from './camera.js';
import { drawPaper, drawGround, drawWater, drawMovers, drawFlag, drawSock } from './draw.js';
import { WobLook } from './wob.js';
import { wobStart } from '../levels/level.js';

const cache = new Map();
const look = new WobLook('lime');

export function levelThumb(level, w = 320, h = 180, locked = false) {
  const key = `${level.id}:${level.tiles.join('')}:${w}:${locked}`;
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext('2d');
  const hit = cache.get(key);
  if (hit) { ctx.drawImage(hit, 0, 0); return c; }
  const cam = new Camera();
  cam.setView(0, 0, w, h);
  cam.fit(level, { l: 4, r: 4, t: 4, b: 4 });
  drawPaper(ctx, cam, level, dpr, { noMinor: true });
  cam.apply(ctx, dpr);
  drawGround(ctx, level);
  drawMovers(ctx, level, 0, false, null);
  drawWater(ctx, level, 0, true);
  drawFlag(ctx, level, 0, true);
  if (level.sock) drawSock(ctx, level, 0, true, 0.5);
  const [x, y] = wobStart(level);
  look.draw(ctx, x, y, WOB_R, 0);
  // bolts as small dots
  ctx.fillStyle = '#4a4f57';
  for (const [ax, ay] of level.anchors) { ctx.beginPath(); ctx.arc(ax * CELL, ay * CELL, 5, 0, Math.PI * 2); ctx.fill(); }
  const copy = document.createElement('canvas');
  copy.width = c.width;
  copy.height = c.height;
  copy.getContext('2d').drawImage(c, 0, 0);
  cache.set(key, copy);
  return c;
}
