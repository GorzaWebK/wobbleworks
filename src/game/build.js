// What the player has built: a list of parts placed on the grid, with undo/redo.
// Coordinates are in grid cells, always rounded to quarter cells, so parts that
// end at the same spot share a joint.

import { PARTS } from './parts.js';
import { terrainFor, moverRects } from '../levels/level.js';
import { WHEEL_R, CELL } from '../physics/consts.js';

export const q = (v) => Math.round(v * 4) / 4;
export const keyOf = (x, y) => `${q(x)},${q(y)}`;

export function partCost(parts) {
  let c = 0;
  for (const p of parts) c += PARTS[p.t]?.cost ?? 0;
  return c;
}

export function linkLength(p) {
  const dx = p.b[0] - p.a[0];
  const dy = p.b[1] - p.a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Every bolt you can attach to: the level's own anchors plus your sticky pads.
export function anchorKeys(level, parts) {
  const s = new Set(level.anchors.map(([x, y]) => keyOf(x, y)));
  for (const p of parts) if (p.t === 'sticky') s.add(keyOf(p.a[0], p.a[1]));
  return s;
}

export function jointKeys(parts) {
  const s = new Set();
  for (const p of parts) {
    if (PARTS[p.t].kind === 'link') {
      s.add(keyOf(p.a[0], p.a[1]));
      s.add(keyOf(p.b[0], p.b[1]));
    }
  }
  return s;
}

// Which mover (if any) a point sits on, at the start of the level (cells).
export function moverAt(level, x, y, tol = 0.05) {
  const rects = moverRects(level);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const inX = x >= r.x - tol && x <= r.x + r.w + tol;
    const inY = y >= r.y - tol && y <= r.y + r.h + tol;
    if (!inX || !inY) continue;
    const onEdge = Math.abs(x - r.x) <= tol || Math.abs(x - r.x - r.w) <= tol || Math.abs(y - r.y) <= tol || Math.abs(y - r.y - r.h) <= tol;
    if (onEdge) return i;
  }
  return -1;
}

function insideMover(level, x, y) {
  for (const r of moverRects(level)) {
    if (x > r.x + 0.02 && x < r.x + r.w - 0.02 && y > r.y + 0.02 && y < r.y + r.h - 0.02) return true;
  }
  return false;
}

// Can this part go here? Returns '' if fine, or a short reason to show the player.
export function checkPart(level, parts, part) {
  const def = PARTS[part.t];
  if (!def) return 'Unknown part';
  if (!level.parts.includes(part.t)) return `No ${def.name.toLowerCase()}s in this level`;
  const T = terrainFor(level);
  const inBounds = ([x, y]) => x >= 0 && y >= 0 && x <= level.w && y <= level.h;
  if (!inBounds(part.a) || (part.b && !inBounds(part.b))) return 'Keep it on the page';
  const blocked = ([x, y]) => T.solidAtCell(x, y) || insideMover(level, x, y);
  if (def.kind === 'link') {
    const len = linkLength(part);
    if (len < def.minLen - 1e-6) return `${def.name}s must be at least ${def.minLen} square${def.minLen > 1 ? 's' : ''} long`;
    if (len > def.maxLen + 1e-6) return `${def.name}s can be up to ${def.maxLen} squares long`;
    if (blocked(part.a) || blocked(part.b)) return "Can't build inside the ground";
    // no building straight through solid ground
    const n = Math.ceil(len * 8);
    for (let i = 2; i < n - 1; i++) {
      const t = i / n;
      const x = part.a[0] + (part.b[0] - part.a[0]) * t;
      const y = part.a[1] + (part.b[1] - part.a[1]) * t;
      if (T.solidAtCell(x, y)) return "Can't build through the ground";
    }
    const ka = keyOf(...part.a);
    const kb = keyOf(...part.b);
    for (const p of parts) {
      if (PARTS[p.t].kind !== 'link') continue;
      const pa = keyOf(...p.a);
      const pb = keyOf(...p.b);
      if ((pa === ka && pb === kb) || (pa === kb && pb === ka)) return 'There is already a part there';
    }
    return '';
  }
  const k = keyOf(...part.a);
  if (part.t === 'balloon') {
    if (!jointKeys(parts).has(k)) return 'Tie balloons to the end of a part';
    if (anchorKeys(level, parts).has(k)) return 'A balloon on a bolt would not lift anything';
    const count = parts.filter((p) => p.t === 'balloon' && keyOf(...p.a) === k).length;
    if (count >= 3) return 'Three balloons per joint is plenty';
    return '';
  }
  if (part.t === 'wheel') {
    if (blocked(part.a)) return "Can't build inside the ground";
    if (parts.some((p) => p.t === 'wheel' && keyOf(...p.a) === k)) return 'There is already a wheel there';
    const d = T.edgeDistanceCell(part.a[0], part.a[1]);
    if (d < WHEEL_R / CELL - 0.02) return 'Too close to the ground for a wheel';
    return '';
  }
  if (part.t === 'sticky') {
    if (anchorKeys(level, parts).has(k)) return 'There is already a bolt there';
    const onGround = T.edgeDistanceCell(part.a[0], part.a[1]) < 0.06;
    if (!onGround && moverAt(level, part.a[0], part.a[1]) < 0) return 'Sticky pads go on the ground or a moving block';
    if (blocked(part.a)) return "Can't build inside the ground";
    return '';
  }
  return '';
}

export class Build {
  constructor(parts = []) {
    this.parts = parts.map(clonePart);
    this.past = [];
    this.future = [];
  }

  snapshot() {
    this.past.push(this.parts.map(clonePart));
    if (this.past.length > 200) this.past.shift();
    this.future.length = 0;
  }

  add(part) {
    this.snapshot();
    this.parts.push(clonePart(part));
  }

  remove(index) {
    if (index < 0 || index >= this.parts.length) return;
    this.snapshot();
    const [gone] = this.parts.splice(index, 1);
    // Balloons need a joint to hang on: drop any that just lost theirs.
    if (PARTS[gone.t].kind === 'link') {
      const joints = jointKeys(this.parts);
      this.parts = this.parts.filter((p) => p.t !== 'balloon' || joints.has(keyOf(...p.a)));
    }
  }

  clear() {
    if (!this.parts.length) return;
    this.snapshot();
    this.parts = [];
  }

  set(parts) {
    this.snapshot();
    this.parts = parts.map(clonePart);
  }

  undo() {
    if (!this.past.length) return false;
    this.future.push(this.parts);
    this.parts = this.past.pop();
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    this.past.push(this.parts);
    this.parts = this.future.pop();
    return true;
  }

  cost() {
    return partCost(this.parts);
  }
}

export function clonePart(p) {
  const o = { t: p.t, a: [q(p.a[0]), q(p.a[1])] };
  if (p.b) o.b = [q(p.b[0]), q(p.b[1])];
  return o;
}

// Short text form of a build, e.g. for saving best builds.
const PACK = { plank: 'p', rope: 'r', spring: 's', balloon: 'b', wheel: 'w', sticky: 't' };
const LETTER = { p: 'plank', r: 'rope', s: 'spring', b: 'balloon', w: 'wheel', t: 'sticky' };

export function packBuild(parts) {
  return parts.map((p) => [PACK[p.t], p.a[0], p.a[1], ...(p.b ? p.b : [])].join(' ')).join(';');
}

export function unpackBuild(text) {
  if (!text) return [];
  const out = [];
  for (const chunk of String(text).split(';')) {
    const bits = chunk.trim().split(/\s+/);
    const t = LETTER[bits[0]];
    if (!t) continue;
    const n = bits.slice(1).map(Number);
    if (n.some((v) => !Number.isFinite(v))) continue;
    if (PARTS[t].kind === 'link' && n.length === 4) out.push({ t, a: [n[0], n[1]], b: [n[2], n[3]] });
    else if (PARTS[t].kind === 'point' && n.length === 2) out.push({ t, a: [n[0], n[1]] });
  }
  return out;
}
