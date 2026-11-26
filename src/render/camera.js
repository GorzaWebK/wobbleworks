// Maps world units to a rectangle of the canvas (a "view"), with zoom and pan.

import { CELL } from '../physics/consts.js';

export class Camera {
  constructor() {
    this.vx = 0; this.vy = 0; this.vw = 1; this.vh = 1; // viewport in CSS pixels
    this.scale = 1;
    this.cx = 0; this.cy = 0; // world point at the centre of the view
    this.fitScale = 1;
    this.minScale = 0.2;
    this.maxScale = 4;
  }

  setView(x, y, w, h) {
    this.vx = x; this.vy = y; this.vw = Math.max(1, w); this.vh = Math.max(1, h);
  }

  // Fit the whole level in the view, leaving room for the HUD (insets in px).
  fit(level, insets = { l: 0, r: 0, t: 0, b: 0 }) {
    const W = level.w * CELL;
    const H = level.h * CELL;
    const aw = Math.max(50, this.vw - insets.l - insets.r);
    const ah = Math.max(50, this.vh - insets.t - insets.b);
    this.fitScale = Math.min(aw / W, ah / H);
    this.scale = this.fitScale;
    this.minScale = this.fitScale * 0.6;
    this.maxScale = Math.max(this.fitScale * 4, 1.5);
    // centre of the free area, mapped back to world
    const sx = this.vx + insets.l + aw / 2;
    const sy = this.vy + insets.t + ah / 2;
    this.cx = W / 2 - (sx - (this.vx + this.vw / 2)) / this.scale;
    this.cy = H / 2 - (sy - (this.vy + this.vh / 2)) / this.scale;
    this.homeCx = this.cx;
    this.homeCy = this.cy;
    this.level = level;
  }

  reset() {
    this.scale = this.fitScale;
    this.cx = this.homeCx;
    this.cy = this.homeCy;
  }

  toScreen(wx, wy) {
    return [this.vx + this.vw / 2 + (wx - this.cx) * this.scale, this.vy + this.vh / 2 + (wy - this.cy) * this.scale];
  }

  toWorld(sx, sy) {
    return [this.cx + (sx - this.vx - this.vw / 2) / this.scale, this.cy + (sy - this.vy - this.vh / 2) / this.scale];
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    // keep the world point under the finger/cursor
    this.cx = wx - (sx - this.vx - this.vw / 2) / this.scale;
    this.cy = wy - (sy - this.vy - this.vh / 2) / this.scale;
    this.clamp();
  }

  pan(dx, dy) {
    this.cx -= dx / this.scale;
    this.cy -= dy / this.scale;
    this.clamp();
  }

  clamp() {
    if (!this.level) return;
    const W = this.level.w * CELL;
    const H = this.level.h * CELL;
    const mx = this.vw / this.scale / 2;
    const my = this.vh / this.scale / 2;
    this.cx = Math.max(Math.min(this.cx, W + mx * 0.6), -mx * 0.6);
    this.cy = Math.max(Math.min(this.cy, H + my * 0.6), -my * 0.6);
  }

  // canvas transform for drawing in world units
  apply(ctx, dpr) {
    const s = this.scale * dpr;
    ctx.setTransform(s, 0, 0, s, (this.vx + this.vw / 2 - this.cx * this.scale) * dpr, (this.vy + this.vh / 2 - this.cy * this.scale) * dpr);
  }
}
