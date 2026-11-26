// Level codes: a whole custom level squeezed into one short line of text that
// players can copy and paste to share. Format:
//   WOB1-<base64url bytes>-<4 hex checksum>
// The bytes hold the size, the tiles (run-length packed), the objects and the name.

import { normalizeLevel } from './level.js';
import { TILE_CHARS } from '../physics/terrain.js';
import { PART_ORDER } from '../game/parts.js';
import { toB64url, fromB64url, fnv } from '../account/code.js';

const VERSION = 1;

function half(v) {
  return Math.max(0, Math.min(255, Math.round(v * 2)));
}
function signedHalf(v) {
  return Math.max(0, Math.min(255, Math.round(v * 2) + 128));
}

export function encodeLevel(level) {
  const L = normalizeLevel(level);
  const b = [];
  b.push(VERSION, L.w, L.h);
  // tiles: one byte per run, high 3 bits = tile, low 5 bits = run length - 1
  let prev = -1;
  let run = 0;
  const flush = () => { if (run > 0) b.push((prev << 5) | (run - 1)); };
  for (let r = 0; r < L.h; r++) {
    for (let c = 0; c < L.w; c++) {
      const t = Math.max(0, TILE_CHARS.indexOf(L.tiles[r][c]));
      if (t === prev && run < 32) run++;
      else { flush(); prev = t; run = 1; }
    }
  }
  flush();
  b.push(L.start[0], L.start[1], L.flag[0], L.flag[1]);
  if (L.sock) b.push(L.sock[0], L.sock[1]); else b.push(255, 255);
  b.push(Math.min(60, L.anchors.length));
  for (const [x, y] of L.anchors.slice(0, 60)) b.push(half(x), half(y));
  b.push((L.budget >> 8) & 255, L.budget & 255, (L.par >> 8) & 255, L.par & 255);
  let mask = 0;
  PART_ORDER.forEach((p, i) => { if (L.parts.includes(p)) mask |= 1 << i; });
  b.push(mask, Math.max(1, Math.min(40, Math.round(L.gravity * 20))));
  b.push(Math.min(12, L.water.length));
  for (const z of L.water.slice(0, 12)) b.push(half(z.x), half(z.y), half(z.w), half(z.h));
  b.push(Math.min(12, L.wind.length));
  for (const z of L.wind.slice(0, 12)) b.push(half(z.x), half(z.y), half(z.w), half(z.h), signedHalf(z.fx / 25), signedHalf(z.fy / 25));
  b.push(Math.min(12, L.movers.length));
  for (const m of L.movers.slice(0, 12)) {
    b.push(half(m.x), half(m.y), half(m.w), half(m.h), signedHalf(m.dx), signedHalf(m.dy), Math.min(255, Math.round(m.period * 10)), Math.round((m.phase % 1) * 100));
  }
  const name = new TextEncoder().encode(L.name.slice(0, 30));
  b.push(name.length, ...name);
  const body = toB64url(new Uint8Array(b));
  return `WOB1-${body}-${fnv(body).slice(0, 4)}`;
}

export function decodeLevel(text) {
  const code = String(text || '').replace(/\s+/g, '');
  const m = /^WOB1-([A-Za-z0-9_-]+)-([0-9a-f]{4})$/.exec(code);
  if (!m) throw new Error("That isn't a Wobbleworks level code. They start with WOB1-");
  if (fnv(m[1]).slice(0, 4) !== m[2]) throw new Error('That level code is damaged. Copy all of it.');
  let bytes;
  try { bytes = fromB64url(m[1]); } catch { throw new Error('That level code is damaged.'); }
  let i = 0;
  const next = () => {
    if (i >= bytes.length) throw new Error('That level code is too short.');
    return bytes[i++];
  };
  if (next() !== VERSION) throw new Error('That level code is from a newer version.');
  const w = next();
  const h = next();
  if (w < 8 || h < 8 || w > 80 || h > 40) throw new Error('That level code has a strange size.');
  const cells = [];
  while (cells.length < w * h) {
    const v = next();
    const t = TILE_CHARS[v >> 5] || '.';
    for (let k = 0; k <= (v & 31); k++) cells.push(t);
  }
  const tiles = [];
  for (let r = 0; r < h; r++) tiles.push(cells.slice(r * w, r * w + w).join(''));
  const start = [next(), next()];
  const flag = [next(), next()];
  const sx = next();
  const sy = next();
  const sock = sx === 255 ? null : [sx, sy];
  const anchors = [];
  for (let n = next(); n > 0; n--) anchors.push([next() / 2, next() / 2]);
  const budget = (next() << 8) | next();
  const par = (next() << 8) | next();
  const mask = next();
  const gravity = next() / 20;
  const parts = PART_ORDER.filter((p, k) => mask & (1 << k));
  const water = [];
  for (let n = next(); n > 0; n--) water.push({ x: next() / 2, y: next() / 2, w: next() / 2, h: next() / 2 });
  const wind = [];
  for (let n = next(); n > 0; n--) wind.push({ x: next() / 2, y: next() / 2, w: next() / 2, h: next() / 2, fx: ((next() - 128) / 2) * 25, fy: ((next() - 128) / 2) * 25 });
  const movers = [];
  for (let n = next(); n > 0; n--) {
    movers.push({ x: next() / 2, y: next() / 2, w: next() / 2, h: next() / 2, dx: (next() - 128) / 2, dy: (next() - 128) / 2, period: next() / 10, phase: next() / 100 });
  }
  let name = 'Shared level';
  if (i < bytes.length) {
    const n = next();
    name = new TextDecoder().decode(bytes.slice(i, i + n)) || name;
  }
  return normalizeLevel({ id: 'code', name, world: 0, tiles, start, flag, sock, anchors, budget, par, parts, gravity, water, wind, movers });
}
