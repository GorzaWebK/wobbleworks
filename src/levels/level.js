// Level data helpers. A level is plain JSON (see src/levels/data/*.json):
//
// {
//   "id": "w1-1", "name": "First Plank",
//   "tiles": ["....", "####"],          rows of tile letters (see physics/terrain.js)
//   "start": [2, 9],                    the cell Wob starts in (sitting on the ground below it)
//   "flag": [29, 9],                    the cell the goal flag stands in
//   "sock": [15, 4],                    the cell the hidden sock is in
//   "anchors": [[6, 10], [10, 10]],     bolt positions, on grid lines
//   "budget": 60, "par": 30,            coins you may spend, and the "thrifty" star target
//   "parts": ["plank"],                 the parts you can use
//   "water": [{x,y,w,h}], "wind": [{x,y,w,h,fx,fy}],
//   "movers": [{x,y,w,h,dx,dy,period,phase}], "gravity": 1,
//   "note": "Tip shown on a sticky note"
// }

import { Terrain } from '../physics/terrain.js';
import { CELL, WOB_R } from '../physics/consts.js';
import { PART_ORDER } from '../game/parts.js';

const terrainCache = new WeakMap();

export function normalizeLevel(raw) {
  const tiles = Array.isArray(raw.tiles) ? raw.tiles.map((r) => String(r)) : [];
  const h = tiles.length;
  const w = tiles.reduce((m, r) => Math.max(m, r.length), 0);
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const pt = (p, d) => (Array.isArray(p) && p.length === 2 ? [num(p[0], d[0]), num(p[1], d[1])] : d);
  const rect = (r) => ({ x: num(r.x, 0), y: num(r.y, 0), w: Math.max(0.5, num(r.w, 1)), h: Math.max(0.5, num(r.h, 1)) });
  return {
    id: String(raw.id || 'custom'),
    name: String(raw.name || 'My level').slice(0, 40),
    world: num(raw.world, 0),
    tiles: tiles.map((r) => r.padEnd(w, '.')),
    w,
    h,
    start: pt(raw.start, [1, 1]),
    flag: pt(raw.flag, [w - 2, 1]),
    sock: Array.isArray(raw.sock) && raw.sock.length === 2 ? [num(raw.sock[0], 0), num(raw.sock[1], 0)] : null,
    anchors: (raw.anchors || []).map((a) => pt(a, [0, 0])),
    budget: Math.max(0, Math.round(num(raw.budget, 100))),
    par: Math.max(0, Math.round(num(raw.par, raw.budget ?? 100))),
    parts: PART_ORDER.filter((p) => (raw.parts || ['plank']).includes(p)),
    water: (raw.water || []).map(rect),
    wind: (raw.wind || []).map((r) => ({ ...rect(r), fx: num(r.fx, 0), fy: num(r.fy, 0) })),
    movers: (raw.movers || []).map((m) => ({
      ...rect(m), dx: num(m.dx, 0), dy: num(m.dy, 0), period: Math.max(0.5, num(m.period, 4)), phase: num(m.phase, 0),
    })),
    gravity: num(raw.gravity, 1),
    note: raw.note ? String(raw.note).slice(0, 200) : '',
  };
}

export function terrainFor(level) {
  let t = terrainCache.get(level);
  if (!t) {
    t = new Terrain(level.tiles);
    terrainCache.set(level, t);
  }
  return t;
}

export function moverRects(level) {
  return level.movers;
}

// Wob's centre at the start, in world units.
export function wobStart(level) {
  return [(level.start[0] + 0.5) * CELL, (level.start[1] + 1) * CELL - WOB_R - 0.5];
}

// The flag's win zone (world units): the flag cell and the cells either side, two rows tall.
export function flagZone(level) {
  const [c, r] = level.flag;
  return { x0: (c - 0.6) * CELL, x1: (c + 1.6) * CELL, y0: (r - 1) * CELL, y1: (r + 1) * CELL };
}

export function sockCentre(level) {
  if (!level.sock) return null;
  return [(level.sock[0] + 0.5) * CELL, (level.sock[1] + 0.5) * CELL];
}
