// Static ground built from a grid of tiles.
//
// Tile letters (one character per cell, rows top to bottom):
//   .  empty          #  solid
//   A  ◢ ramp up to the right (solid bottom-right half)
//   B  ◣ ramp down to the right (solid bottom-left half)
//   C  ◥ solid top-right half      D  ◤ solid top-left half
//
// Only the outline between solid and empty space becomes collision edges, and
// straight runs are merged, so Wob rolls smoothly over tile seams.

import { CELL } from './consts.js';

export const TILE_CHARS = '.#ABCD';

// Which sides of the cell each tile fully covers: top, right, bottom, left.
const COVER = {
  '#': [1, 1, 1, 1],
  A: [0, 1, 1, 0],
  B: [0, 0, 1, 1],
  C: [1, 1, 0, 0],
  D: [1, 0, 0, 1],
};

// Diagonal edge (in cell-local coords) and its outward normal direction.
const HYPO = {
  A: [0, 1, 1, 0, -1, -1],
  B: [0, 0, 1, 1, 1, -1],
  C: [0, 0, 1, 1, -1, 1],
  D: [1, 0, 0, 1, 1, 1],
};

export class Terrain {
  constructor(rows) {
    this.h = rows.length;
    this.w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    this.grid = rows.map((r) => r.padEnd(this.w, '.'));
    this.segs = []; // {ax, ay, bx, by, nx, ny} in world units
    this.buildEdges();
    this.buildBuckets();
  }

  tile(c, r) {
    if (r < 0 || r >= this.h || c < 0 || c >= this.w) return '.';
    return this.grid[r][c];
  }

  covers(c, r, side) {
    const t = this.tile(c, r);
    return t !== '.' && COVER[t] ? COVER[t][side] === 1 : false;
  }

  buildEdges() {
    const raw = []; // in cell units
    for (let r = 0; r < this.h; r++) {
      for (let c = 0; c < this.w; c++) {
        const t = this.tile(c, r);
        if (t === '.' || !COVER[t]) continue;
        const cov = COVER[t];
        // top
        if (cov[0] && !this.covers(c, r - 1, 2)) raw.push([c, r, c + 1, r, 0, -1]);
        if (cov[1] && !this.covers(c + 1, r, 3)) raw.push([c + 1, r, c + 1, r + 1, 1, 0]);
        if (cov[2] && !this.covers(c, r + 1, 0)) raw.push([c, r + 1, c + 1, r + 1, 0, 1]);
        if (cov[3] && !this.covers(c - 1, r, 1)) raw.push([c, r, c, r + 1, -1, 0]);
        const hy = HYPO[t];
        if (hy) {
          const s = Math.SQRT1_2;
          raw.push([c + hy[0], r + hy[1], c + hy[2], r + hy[3], hy[4] * s, hy[5] * s]);
        }
      }
    }
    // Merge edges that continue each other in a straight line with the same normal.
    const merged = [];
    const used = new Array(raw.length).fill(false);
    const key = (x, y, nx, ny) => `${x},${y},${nx.toFixed(3)},${ny.toFixed(3)}`;
    const byStart = new Map();
    raw.forEach((e, i) => byStart.set(key(e[0], e[1], e[4], e[5]), i));
    for (let i = 0; i < raw.length; i++) {
      if (used[i]) continue;
      const e = raw[i];
      // Only start a run where no edge leads into this one.
      const dx = e[2] - e[0];
      const dy = e[3] - e[1];
      const prevKey = key(e[0] - dx, e[1] - dy, e[4], e[5]);
      const prev = byStart.get(prevKey);
      if (prev !== undefined && !used[prev] && raw[prev][2] === e[0] && raw[prev][3] === e[1]) continue;
      let end = e;
      used[i] = true;
      for (;;) {
        const n = byStart.get(key(end[2], end[3], e[4], e[5]));
        if (n === undefined || used[n]) break;
        const o = raw[n];
        if (o[2] - o[0] !== dx || o[3] - o[1] !== dy) break;
        used[n] = true;
        end = o;
      }
      merged.push([e[0], e[1], end[2], end[3], e[4], e[5]]);
    }
    // Any edge we skipped (part of a loop with no start) gets added on its own.
    for (let i = 0; i < raw.length; i++) if (!used[i]) merged.push(raw[i]);
    this.cellSegs = merged;
    this.segs = merged.map((m) => ({
      ax: m[0] * CELL, ay: m[1] * CELL, bx: m[2] * CELL, by: m[3] * CELL, nx: m[4], ny: m[5],
    }));
  }

  // Each cell lists the edges that pass near it, so collision checks stay cheap.
  buildBuckets() {
    const W = this.w + 2;
    const H = this.h + 2;
    this.bw = W;
    this.bh = H;
    this.buckets = Array.from({ length: W * H }, () => []);
    this.segs.forEach((s, i) => {
      const pad = 1;
      const c0 = Math.floor(Math.min(s.ax, s.bx) / CELL) - pad;
      const c1 = Math.floor(Math.max(s.ax, s.bx) / CELL) + pad;
      const r0 = Math.floor(Math.min(s.ay, s.by) / CELL) - pad;
      const r1 = Math.floor(Math.max(s.ay, s.by) / CELL) + pad;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const b = this.bucket(c, r);
          if (b) b.push(i);
        }
      }
    });
  }

  bucket(c, r) {
    const bc = c + 1;
    const br = r + 1;
    if (bc < 0 || br < 0 || bc >= this.bw || br >= this.bh) return null;
    return this.buckets[br * this.bw + bc];
  }

  // Edges near a world point (the point's own cell is enough thanks to the padding).
  near(x, y) {
    return this.bucket(Math.floor(x / CELL), Math.floor(y / CELL)) || EMPTY;
  }

  // Is the world point inside solid ground? Points exactly on an edge count as outside.
  solidAt(x, y) {
    const cx = x / CELL;
    const cy = y / CELL;
    const c = Math.floor(cx);
    const r = Math.floor(cy);
    const t = this.tile(c, r);
    if (t === '.') return false;
    if (t === '#') return true;
    const fx = cx - c;
    const fy = cy - r;
    if (t === 'A') return fx + fy > 1;
    if (t === 'B') return fy > fx;
    if (t === 'C') return fx > fy;
    if (t === 'D') return fx + fy < 1;
    return false;
  }

  // Strictly inside, with a little tolerance, in cell coords (used by the builder).
  solidAtCell(cx, cy) {
    const e = 0.02;
    return this.solidAt((cx) * CELL, (cy) * CELL)
      && this.solidAt((cx + e) * CELL, (cy + e) * CELL)
      && this.solidAt((cx - e) * CELL, (cy - e) * CELL)
      && this.solidAt((cx + e) * CELL, (cy - e) * CELL)
      && this.solidAt((cx - e) * CELL, (cy + e) * CELL);
  }

  // Distance (cell units) from a cell-coord point to the nearest edge.
  edgeDistanceCell(cx, cy) {
    let best = Infinity;
    for (const s of this.cellSegs) {
      const d = distToSeg(cx, cy, s[0], s[1], s[2], s[3]);
      if (d < best) best = d;
    }
    return best;
  }
}

const EMPTY = [];

export function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}
