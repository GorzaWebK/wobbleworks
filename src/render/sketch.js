// Pencil-sketch drawing helpers. Every wobble comes from a seeded hash, so a
// line looks the same from frame to frame instead of fizzing.

export function hash(n) {
  let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

export function seeded(seed) {
  let i = 0;
  return () => hash(seed * 7919 + (i++) * 104729);
}

// A hand-drawn line: two slightly different strokes that overshoot the ends a little.
export function sketchLine(ctx, x1, y1, x2, y2, seed = 1, opts = {}) {
  const jit = opts.jitter ?? 1.2;
  const over = opts.overshoot ?? 2.5;
  const passes = opts.passes ?? 2;
  const r = seeded(seed);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  ctx.beginPath();
  for (let p = 0; p < passes; p++) {
    const o1 = (r() - 0.3) * over;
    const o2 = (r() - 0.3) * over;
    const sx = x1 - ux * o1 + nx * (r() - 0.5) * jit;
    const sy = y1 - uy * o1 + ny * (r() - 0.5) * jit;
    const ex = x2 + ux * o2 + nx * (r() - 0.5) * jit;
    const ey = y2 + uy * o2 + ny * (r() - 0.5) * jit;
    const bow = (r() - 0.5) * jit * Math.min(2, len / 40);
    const mx = (sx + ex) / 2 + nx * bow;
    const my = (sy + ey) / 2 + ny * bow;
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, ex, ey);
  }
  ctx.stroke();
}

// Wobbly closed polygon outline.
export function sketchPoly(ctx, pts, seed = 1, opts = {}) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sketchLine(ctx, a[0], a[1], b[0], b[1], seed + i * 13, opts);
  }
}

// Hand-drawn circle: a slightly uneven loop that doesn't quite close.
export function sketchCircle(ctx, x, y, r, seed = 1, opts = {}) {
  const rnd = seeded(seed);
  const jit = opts.jitter ?? 0.06;
  const passes = opts.passes ?? 1;
  ctx.beginPath();
  for (let p = 0; p < passes; p++) {
    const start = rnd() * Math.PI * 2;
    const n = 14;
    const span = Math.PI * 2 + 0.35;
    for (let i = 0; i <= n; i++) {
      const a = start + (span * i) / n;
      const rr = r * (1 + (rnd() - 0.5) * jit);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
}

// Diagonal hatching inside the current clip.
export function hatchRect(ctx, x, y, w, h, gap, angle = 1) {
  ctx.beginPath();
  const n = Math.ceil((w + h) / gap);
  for (let i = 0; i <= n; i++) {
    const o = i * gap;
    if (angle > 0) {
      ctx.moveTo(x + o, y);
      ctx.lineTo(x + o - h, y + h);
    } else {
      ctx.moveTo(x + o - h, y);
      ctx.lineTo(x + o, y + h);
    }
  }
  ctx.stroke();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function mix(c1, c2, t) {
  const a = parseHex(c1);
  const b = parseHex(c2);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

const hexCache = new Map();
function parseHex(h) {
  let v = hexCache.get(h);
  if (!v) {
    const s = h.replace('#', '');
    v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    hexCache.set(h, v);
  }
  return v;
}
