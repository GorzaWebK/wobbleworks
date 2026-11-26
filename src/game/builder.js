// Placing parts, shared by single player and both sides of a race: grid
// snapping, a magnet towards nearby joints and bolts, drag-to-place, and a
// keyboard cursor that rotates the part with Q/E and changes its length.

import { Build, checkPart, partCost, anchorKeys, jointKeys, q, linkLength } from './build.js';
import { PARTS } from './parts.js';
import { CELL } from '../physics/consts.js';

const DIRS = 16;

export class Builder {
  constructor(level, parts = [], opts = {}) {
    this.level = level;
    this.build = new Build(parts);
    this.tool = level.parts[0] || 'plank';
    this.snap = opts.snap ?? (() => true);
    const a = level.anchors[0] || [level.start[0] + 2, level.start[1] + 1];
    this.cursor = { x: a[0], y: a[1], dir: 0, len: 2, shown: false };
    this.drag = null; // { a: [x, y], b: [x, y] }
    this.hoverPt = null;
    this.hoverPart = -1;
    this.lastReason = '';
  }

  tools() {
    return [...this.level.parts, 'erase'];
  }

  setTool(t) {
    if (this.tools().includes(t)) this.tool = t;
    const def = PARTS[this.tool];
    if (def && def.kind === 'link') this.cursor.len = Math.min(Math.max(this.cursor.len, def.minLen), def.maxLen);
  }

  nextTool(step = 1) {
    const list = this.tools();
    const i = list.indexOf(this.tool);
    this.setTool(list[(i + step + list.length) % list.length]);
  }

  cost() {
    return this.build.cost();
  }

  // Grid point for a world position: whole squares with snapping on, quarter
  // squares with it off. Bolts and joints close by pull the point onto them.
  snapPoint(wx, wy) {
    const cx = wx / CELL;
    const cy = wy / CELL;
    const targets = [...this.level.anchors];
    for (const k of jointKeys(this.build.parts)) targets.push(k.split(',').map(Number));
    for (const p of this.build.parts) if (p.t === 'sticky' || p.t === 'wheel') targets.push(p.a);
    let best = null;
    let bd = 0.35;
    for (const t of targets) {
      const d = Math.hypot(t[0] - cx, t[1] - cy);
      if (d < bd) { bd = d; best = t; }
    }
    if (best) return [best[0], best[1]];
    if (this.snap()) return [Math.round(cx), Math.round(cy)];
    return [q(cx), q(cy)];
  }

  // Clamp a dragged part to its allowed length, keeping its direction.
  shapeLink(a, b) {
    const def = PARTS[this.tool];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len <= def.maxLen + 1e-6) return b;
    const k = def.maxLen / len;
    const step = this.snap() ? 1 : 0.25;
    let bx = a[0] + dx * k;
    let by = a[1] + dy * k;
    // round towards the start so we stay within the limit
    bx = a[0] + Math.trunc((bx - a[0]) / step) * step;
    by = a[1] + Math.trunc((by - a[1]) / step) * step;
    return [bx, by];
  }

  ghostFromDrag() {
    if (!this.drag) return null;
    const def = PARTS[this.tool];
    if (!def) return null;
    if (def.kind === 'point') return this.ghostFor({ t: this.tool, a: this.drag.b });
    const b = this.shapeLink(this.drag.a, this.drag.b);
    const part = { t: this.tool, a: this.drag.a, b };
    if (linkLength(part) < 0.01) return null;
    return this.ghostFor(part);
  }

  ghostFromCursor() {
    const def = PARTS[this.tool];
    if (!def) return null;
    const c = this.cursor;
    if (def.kind === 'point') return this.ghostFor({ t: this.tool, a: [c.x, c.y] });
    const ang = (c.dir / DIRS) * Math.PI * 2;
    const step = this.snap() ? 1 : 0.25;
    let best = null;
    // the closest grid end point to the wanted direction and length
    for (let L = c.len + 0.5; L >= def.minLen - 0.01; L -= 0.25) {
      const bx = c.x + Math.round((Math.cos(ang) * L) / step) * step;
      const by = c.y + Math.round((-Math.sin(ang) * L) / step) * step;
      const len = Math.hypot(bx - c.x, by - c.y);
      if (len <= def.maxLen + 1e-6 && len >= def.minLen - 1e-6) { best = [bx, by]; break; }
    }
    if (!best) return null;
    return this.ghostFor({ t: this.tool, a: [c.x, c.y], b: best });
  }

  ghostFor(part) {
    const reason = this.why(part);
    return { part, ok: !reason, reason };
  }

  why(part) {
    const r = checkPart(this.level, this.build.parts, part);
    if (r) return r;
    const total = this.cost() + PARTS[part.t].cost;
    if (total > this.level.budget) return 'Not enough coins for that';
    return '';
  }

  place(part) {
    const reason = this.why(part);
    if (reason) { this.lastReason = reason; return false; }
    this.build.add(part);
    return true;
  }

  // Which part is under a point (cells)? Closest within reach, or -1.
  partAt(cx, cy, reach = 0.45) {
    let best = -1;
    let bd = reach;
    this.build.parts.forEach((p, i) => {
      let d;
      if (p.b) {
        const ax = p.a[0]; const ay = p.a[1]; const bx = p.b[0]; const by = p.b[1];
        const dx = bx - ax; const dy = by - ay;
        const l2 = dx * dx + dy * dy || 1;
        let t = ((cx - ax) * dx + (cy - ay) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(ax + dx * t - cx, ay + dy * t - cy);
      } else if (p.t === 'balloon') {
        d = Math.min(Math.hypot(p.a[0] - cx, p.a[1] - 1.25 - cy) - 0.2, Math.hypot(p.a[0] - cx, p.a[1] - cy));
      } else {
        d = Math.hypot(p.a[0] - cx, p.a[1] - cy) - (p.t === 'wheel' ? 0.3 : 0);
      }
      // point parts win ties so you can rub out a balloon on a plank's end
      if (!p.b) d -= 0.05;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  eraseAt(cx, cy) {
    const i = this.partAt(cx, cy);
    if (i < 0) return null;
    const p = this.build.parts[i];
    this.build.remove(i);
    return p;
  }

  // keyboard cursor
  moveCursor(dx, dy) {
    const step = this.snap() ? 1 : 0.25;
    const c = this.cursor;
    c.x = Math.max(0, Math.min(this.level.w, Math.round((c.x + dx * step) / step) * step));
    c.y = Math.max(0, Math.min(this.level.h, Math.round((c.y + dy * step) / step) * step));
    c.shown = true;
  }

  rotate(step) {
    this.cursor.dir = (this.cursor.dir + step + DIRS) % DIRS;
    this.cursor.shown = true;
  }

  cycleLength() {
    const def = PARTS[this.tool];
    if (!def || def.kind !== 'link') return;
    this.cursor.len = this.cursor.len >= def.maxLen ? def.minLen : this.cursor.len + 1;
    this.cursor.shown = true;
  }

  // Space/Enter at the cursor: place the ghost, or rub out with the eraser.
  cursorAction() {
    const c = this.cursor;
    c.shown = true;
    if (this.tool === 'erase') return { erased: this.eraseAt(c.x, c.y) };
    const g = this.ghostFromCursor();
    if (!g) return { placed: null, reason: 'That will not fit' };
    if (this.place(g.part)) return { placed: g.part };
    return { placed: null, reason: this.lastReason };
  }

  isAnchor(x, y) {
    return anchorKeys(this.level, this.build.parts).has(`${q(x)},${q(y)}`);
  }

  summary() {
    const counts = {};
    for (const p of this.build.parts) counts[p.t] = (counts[p.t] || 0) + 1;
    return { counts, cost: partCost(this.build.parts) };
  }
}
