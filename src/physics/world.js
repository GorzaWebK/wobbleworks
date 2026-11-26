// A small Verlet physics world: points joined by links (rigid planks, ropes,
// springs), rolling circles (Wob and wheels), static tile ground, moving
// obstacles, water and wind. No DOM, no randomness and no trig inside step(),
// so the same setup always plays out exactly the same way, in Node or a browser.

import {
  CELL, DT, ITERATIONS, GRAVITY, WOB_R, WOB_MASS, WOB_SPEED, WOB_SPIN_ACCEL, WOB_BOUNCE, WOB_GRIP,
  NODE_R, WHEEL_SPEED, WHEEL_SPIN_ACCEL, SPRING_LAUNCH, MAX_STEP_MOVE, WOB_WEIGHT,
} from './consts.js';

const SKIN = 1.5;
const BEND_STRESS = 3.0; // how much bending counts towards a plank's stress
const DT2 = DT * DT;

// Ping-pong 0 → 1 → 0 with eased ends, and its rate of change. Pure arithmetic.
export function moverPhase(t, period, phase) {
  let u = t / period + phase;
  u -= Math.floor(u);
  let tri;
  let dtri;
  if (u < 0.5) { tri = u * 2; dtri = 2 / period; } else { tri = 2 - u * 2; dtri = -2 / period; }
  const s = tri * tri * (3 - 2 * tri);
  const ds = 6 * tri * (1 - tri) * dtri;
  return [s, ds];
}

// A triangle wave between 0 and 1, for wind gusts.
function gust(t, period) {
  let u = t / period;
  u -= Math.floor(u);
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

export class Mover {
  // x, y, w, h, dx, dy in cells; period in seconds; phase 0..1
  constructor(def) {
    this.def = def;
    this.bx = def.x * CELL;
    this.by = def.y * CELL;
    this.w = def.w * CELL;
    this.h = def.h * CELL;
    this.dx = (def.dx || 0) * CELL;
    this.dy = (def.dy || 0) * CELL;
    this.period = def.period || 4;
    this.phase = def.phase || 0;
    this.ox = 0;
    this.oy = 0;
    this.vx = 0;
    this.vy = 0;
    this.update(0);
  }

  update(t) {
    const [s, ds] = moverPhase(t, this.period, this.phase);
    this.ox = this.dx * s;
    this.oy = this.dy * s;
    this.vx = this.dx * ds;
    this.vy = this.dy * ds;
    this.x0 = this.bx + this.ox;
    this.y0 = this.by + this.oy;
    this.x1 = this.x0 + this.w;
    this.y1 = this.y0 + this.h;
  }
}

export class World {
  constructor({ terrain, gravity = 1, movers = [], water = [], wind = [] }) {
    this.terrain = terrain;
    this.g = GRAVITY * gravity;
    this.movers = movers.map((m) => new Mover(m));
    this.water = water.map((r) => ({ x0: r.x * CELL, y0: r.y * CELL, x1: (r.x + r.w) * CELL, y1: (r.y + r.h) * CELL }));
    this.wind = wind.map((r) => ({
      x0: r.x * CELL, y0: r.y * CELL, x1: (r.x + r.w) * CELL, y1: (r.y + r.h) * CELL,
      fx: r.fx || 0, fy: r.fy || 0, period: r.period || 2.5,
    }));
    this.points = [];
    this.links = [];
    this.bends = [];
    this.wob = -1;
    this.time = 0;
    this.steps = 0;
    this.events = [];
    this.motorsOn = true;
  }

  addPoint(x, y, opts = {}) {
    const mass = opts.mass ?? 1;
    const p = {
      x, y, px: x, py: y,
      mass,
      im: opts.fixed ? 0 : 1 / mass,
      fixed: !!opts.fixed,
      r: opts.r ?? NODE_R,
      kind: opts.kind || 'node', // node | wob | wheel
      w: 0, ang: 0, I: 1,
      lift: 0, floatF: opts.floatF ?? 0, windK: opts.windK ?? 0.15,
      stick: opts.stick ?? -1, sox: 0, soy: 0, // stuck to mover #stick
      contacts: [], nc: 0, grounded: false,
      fx: 0, fy: 0,
    };
    if (p.kind === 'wob') {
      p.I = 0.4 * mass * p.r * p.r;
    }
    if (p.kind === 'wheel') {
      p.I = 0.5 * 1.0 * p.r * p.r;
    }
    if (p.stick >= 0) {
      const m = this.movers[p.stick];
      p.sox = x - m.x0;
      p.soy = y - m.y0;
      p.im = 0;
      p.fixed = true;
    }
    for (let i = 0; i < 4; i++) p.contacts.push({ nx: 0, ny: 0, vx: 0, vy: 0, kind: 0 });
    this.points.push(p);
    return this.points.length - 1;
  }

  addWob(x, y) {
    this.wob = this.addPoint(x, y, { mass: WOB_MASS, r: WOB_R, kind: 'wob', windK: 1 });
    return this.wob;
  }

  // type: plank | rope | spring
  addLink(a, b, opts = {}) {
    const pa = this.points[a];
    const pb = this.points[b];
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const l = {
      a, b,
      rest: Math.sqrt(dx * dx + dy * dy),
      type: opts.type || 'plank',
      stiff: opts.stiff ?? 1,
      strength: opts.strength ?? 8,
      maxStrain: opts.maxStrain ?? 0.5,
      collide: !!opts.collide,
      bounce: !!opts.bounce,
      thick: opts.thick ?? 6,
      part: opts.part ?? -1,
      stress: 0, acc: 0, broken: false,
    };
    this.links.push(l);
    return this.links.length - 1;
  }

  // A welded joint between two planks that share point b: it keeps b where it
  // was relative to the line from a to c, so straight runs of planks act like
  // one stiff beam instead of a floppy chain.
  addBend(la, lc, stiff = 0.3) {
    const A = this.links[la];
    const C = this.links[lc];
    const shared = A.a === C.a || A.a === C.b ? A.a : A.b;
    const a = A.a === shared ? A.b : A.a;
    const c = C.a === shared ? C.b : C.a;
    const pa = this.points[a];
    const pb = this.points[shared];
    const pc = this.points[c];
    const ex = pc.x - pa.x;
    const ey = pc.y - pa.y;
    const l2 = ex * ex + ey * ey;
    if (l2 < 1e-6) return -1;
    const rx = pb.x - pa.x;
    const ry = pb.y - pa.y;
    // b in the a→c frame: along (s) and sideways (h), both relative to |ac|
    const s = (rx * ex + ry * ey) / l2;
    const h = (rx * -ey + ry * ex) / l2;
    this.bends.push({ a, b: shared, c, s, h, stiff, la, lc });
    return this.bends.length - 1;
  }

  // ---------------------------------------------------------------- stepping
  step() {
    this.events.length = 0;
    const t = this.time + DT;
    for (const m of this.movers) m.update(t);
    this.applyForces(t);
    this.integrate();
    const pts = this.points;
    for (let i = 0; i < pts.length; i++) pts[i].nc = 0;
    for (const l of this.links) l.acc = 0;
    for (let it = 0; it < ITERATIONS; it++) {
      const last = it === ITERATIONS - 1;
      this.solveLinks();
      if (this.bends.length) this.solveBends();
      this.collideAll(last);
    }
    this.velocityPass();
    this.updateStress();
    this.time = t;
    this.steps++;
  }

  applyForces(t) {
    const g = this.g;
    for (const p of this.points) {
      if (p.im === 0) { p.fx = 0; p.fy = 0; continue; }
      let ax = 0;
      let ay = g;
      ay -= (p.lift * GRAVITY) / p.mass;
      for (const z of this.wind) {
        if (p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1) {
          const k = p.windK * (0.75 + 0.25 * gust(t, z.period));
          ax += z.fx * k;
          ay += z.fy * k;
        }
      }
      if (p.kind !== 'wob') {
        for (const z of this.water) {
          if (p.x >= z.x0 && p.x <= z.x1 && p.y > z.y0 && p.y <= z.y1) {
            let depth = (p.y - z.y0) / (CELL * 0.5);
            if (depth > 1) depth = 1;
            ay -= (p.floatF * depth * GRAVITY) / p.mass;
            // water drag
            ax -= (p.x - p.px) / DT * 2.5;
            ay -= (p.y - p.py) / DT * 2.5;
          }
        }
      }
      p.fx = ax;
      p.fy = ay;
    }
  }

  integrate() {
    for (const p of this.points) {
      if (p.stick >= 0) {
        const m = this.movers[p.stick];
        p.x = m.x0 + p.sox;
        p.y = m.y0 + p.soy;
        p.px = p.x - m.vx * DT;
        p.py = p.y - m.vy * DT;
        continue;
      }
      if (p.im === 0) { p.px = p.x; p.py = p.y; continue; }
      const damp = p.kind === 'wob' ? 0.9998 : 0.999;
      let vx = (p.x - p.px) * damp + p.fx * DT2;
      let vy = (p.y - p.py) * damp + p.fy * DT2;
      const sp2 = vx * vx + vy * vy;
      if (sp2 > MAX_STEP_MOVE * MAX_STEP_MOVE) {
        const k = MAX_STEP_MOVE / Math.sqrt(sp2);
        vx *= k;
        vy *= k;
      }
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
      if (p.kind !== 'node') {
        // spin: the motor only drives while touching the ground
        if (this.motorsOn && p.grounded) {
          const target = p.kind === 'wob' ? WOB_SPEED / p.r : WHEEL_SPEED / p.r;
          const acc = (p.kind === 'wob' ? WOB_SPIN_ACCEL : WHEEL_SPIN_ACCEL) * DT;
          let d = target - p.w;
          if (d > acc) d = acc;
          else if (d < -acc) d = -acc;
          p.w += d;
        } else {
          p.w *= 0.998;
        }
        p.ang += p.w * DT;
      }
    }
  }

  solveLinks() {
    const pts = this.points;
    const links = this.links;
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      if (l.broken) continue;
      const a = pts[l.a];
      const b = pts[l.b];
      const wsum = a.im + b.im;
      if (wsum === 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-9) continue;
      const diff = d - l.rest;
      if (l.type === 'rope' && diff <= 0) continue;
      const c = (diff / d) * l.stiff / wsum;
      a.x += dx * c * a.im;
      a.y += dy * c * a.im;
      b.x -= dx * c * b.im;
      b.y -= dy * c * b.im;
      l.acc += (diff < 0 ? -diff : diff) * l.stiff;
    }
  }

  solveBends() {
    const pts = this.points;
    const links = this.links;
    for (let i = 0; i < this.bends.length; i++) {
      const j = this.bends[i];
      const LA = links[j.la];
      const LC = links[j.lc];
      if (LA.broken || LC.broken) continue;
      const a = pts[j.a];
      const b = pts[j.b];
      const c = pts[j.c];
      const ex = c.x - a.x;
      const ey = c.y - a.y;
      const tx = a.x + ex * j.s - ey * j.h;
      const ty = a.y + ey * j.s + ex * j.h;
      const dx = tx - b.x;
      const dy = ty - b.y;
      const W = b.im + (1 - j.s) * (1 - j.s) * a.im + j.s * j.s * c.im;
      if (W === 0) continue;
      const k = j.stiff / W;
      b.x += dx * k * b.im;
      b.y += dy * k * b.im;
      a.x -= dx * k * (1 - j.s) * a.im;
      a.y -= dy * k * (1 - j.s) * a.im;
      c.x -= dx * k * j.s * c.im;
      c.y -= dy * k * j.s * c.im;
      const amt = Math.sqrt(dx * dx + dy * dy) * j.stiff * BEND_STRESS;
      LA.acc += amt;
      LC.acc += amt;
    }
  }

  // ------------------------------------------------------------- collisions
  addContact(p, nx, ny, vx, vy, kind) {
    if (p.nc >= 4) return;
    const c = p.contacts[p.nc++];
    c.nx = nx; c.ny = ny; c.vx = vx; c.vy = vy; c.kind = kind;
  }

  collideAll(last) {
    const pts = this.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.im === 0) continue;
      this.collideTerrain(p, last);
      if (this.movers.length) this.collideMovers(p, last);
    }
    if (this.wob >= 0) {
      const w = pts[this.wob];
      this.collideWobLinks(w, last);
      this.collideWobWheels(w, last);
    }
  }

  collideTerrain(p, last) {
    const T = this.terrain;
    const r = p.r;
    const segs = T.segs;
    const near = T.near(p.x, p.y);
    if (near.length === 0) return;
    if (T.solidAt(p.x, p.y)) {
      // Deep inside the ground: push out along the nearest edge's outward normal.
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < near.length; k++) {
        const s = segs[near[k]];
        const d = segDist(p.x, p.y, s);
        if (d < bd) { bd = d; best = near[k]; }
      }
      if (best < 0) return;
      const s = segs[best];
      const push = bd + r;
      p.x += s.nx * push;
      p.y += s.ny * push;
      if (last) this.addContact(p, s.nx, s.ny, 0, 0, 0);
      return;
    }
    for (let k = 0; k < near.length; k++) {
      const s = segs[near[k]];
      closest(p.x, p.y, s.ax, s.ay, s.bx, s.by);
      const qx = p.x - CX;
      const qy = p.y - CY;
      const d2 = qx * qx + qy * qy;
      if (d2 >= (r + SKIN) * (r + SKIN)) continue;
      const d = Math.sqrt(d2);
      let nx;
      let ny;
      if (d > 1e-9) { nx = qx / d; ny = qy / d; } else { nx = s.nx; ny = s.ny; }
      if (d < r) {
        p.x += nx * (r - d);
        p.y += ny * (r - d);
      }
      if (last) this.addContact(p, nx, ny, 0, 0, 0);
    }
  }

  collideMovers(p, last) {
    const r = p.r;
    for (const m of this.movers) {
      if (p.x < m.x0 - r - SKIN || p.x > m.x1 + r + SKIN || p.y < m.y0 - r - SKIN || p.y > m.y1 + r + SKIN) continue;
      // closest point on the rectangle
      let cx = p.x < m.x0 ? m.x0 : p.x > m.x1 ? m.x1 : p.x;
      let cy = p.y < m.y0 ? m.y0 : p.y > m.y1 ? m.y1 : p.y;
      let nx;
      let ny;
      let d;
      if (cx === p.x && cy === p.y) {
        // inside: leave by the nearest side
        const dl = p.x - m.x0;
        const dr = m.x1 - p.x;
        const dt = p.y - m.y0;
        const db = m.y1 - p.y;
        const mn = Math.min(dl, dr, dt, db);
        if (mn === dt) { nx = 0; ny = -1; d = -dt; } else if (mn === db) { nx = 0; ny = 1; d = -db; } else if (mn === dl) { nx = -1; ny = 0; d = -dl; } else { nx = 1; ny = 0; d = -dr; }
      } else {
        const qx = p.x - cx;
        const qy = p.y - cy;
        d = Math.sqrt(qx * qx + qy * qy);
        if (d >= r + SKIN) continue;
        nx = qx / d;
        ny = qy / d;
      }
      if (d < r) {
        p.x += nx * (r - d);
        p.y += ny * (r - d);
      }
      if (last) this.addContact(p, nx, ny, m.vx, m.vy, 0);
    }
  }

  collideWobLinks(w, last) {
    const pts = this.points;
    const links = this.links;
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      if (!l.collide || l.broken) continue;
      const a = pts[l.a];
      const b = pts[l.b];
      const minD = w.r + l.thick * 0.5;
      // quick reject
      const lx0 = a.x < b.x ? a.x : b.x;
      const lx1 = a.x < b.x ? b.x : a.x;
      const ly0 = a.y < b.y ? a.y : b.y;
      const ly1 = a.y < b.y ? b.y : a.y;
      if (w.x < lx0 - minD - SKIN || w.x > lx1 + minD + SKIN || w.y < ly0 - minD - SKIN || w.y > ly1 + minD + SKIN) continue;
      const t = closest(w.x, w.y, a.x, a.y, b.x, b.y);
      const qx = w.x - CX;
      const qy = w.y - CY;
      const d2 = qx * qx + qy * qy;
      if (d2 >= (minD + SKIN) * (minD + SKIN)) continue;
      const d = Math.sqrt(d2);
      let nx;
      let ny;
      if (d > 1e-9) { nx = qx / d; ny = qy / d; } else { nx = 0; ny = -1; }
      if (d < minD) {
        const pen = minD - d;
        const wa = (1 - t) * (1 - t) * a.im;
        const wb = t * t * b.im;
        const W = w.im + wa + wb;
        if (W > 0) {
          const lam = pen / W;
          w.x += nx * lam * w.im;
          w.y += ny * lam * w.im;
          a.x -= nx * lam * (1 - t) * a.im;
          a.y -= ny * lam * (1 - t) * a.im;
          b.x -= nx * lam * t * b.im;
          b.y -= ny * lam * t * b.im;
        }
      }
      if (last) {
        const vx = ((a.x - a.px) * (1 - t) + (b.x - b.px) * t) / DT;
        const vy = ((a.y - a.py) * (1 - t) + (b.y - b.py) * t) / DT;
        if (l.bounce) {
          // springs push Wob straight out from their face, on Wob's side
          const ex = b.x - a.x;
          const ey = b.y - a.y;
          const el = Math.sqrt(ex * ex + ey * ey) || 1;
          let fx = -ey / el;
          let fy = ex / el;
          if (fx * (w.x - a.x) + fy * (w.y - a.y) < 0) { fx = -fx; fy = -fy; }
          this.addContact(w, fx, fy, vx, vy, 1);
          l.touched = this.steps;
        } else {
          this.addContact(w, nx, ny, vx, vy, 0);
        }
      }
    }
  }

  collideWobWheels(w, last) {
    const pts = this.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.kind !== 'wheel') continue;
      const dx = w.x - p.x;
      const dy = w.y - p.y;
      const minD = w.r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= (minD + SKIN) * (minD + SKIN)) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-9 ? dx / d : 0;
      const ny = d > 1e-9 ? dy / d : -1;
      if (d < minD) {
        const W = w.im + p.im;
        const lam = (minD - d) / W;
        w.x += nx * lam * w.im;
        w.y += ny * lam * w.im;
        p.x -= nx * lam * p.im;
        p.y -= ny * lam * p.im;
      }
      if (last) {
        // surface of a spinning wheel moves along the tangent
        const tx = -ny;
        const ty = nx;
        const vx = (p.x - p.px) / DT + p.w * p.r * tx;
        const vy = (p.y - p.py) / DT + p.w * p.r * ty;
        this.addContact(w, nx, ny, vx, vy, 0);
      }
    }
  }

  // ------------------------------------------------------- velocity handling
  velocityPass() {
    const pts = this.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.grounded = false;
      if (p.im === 0 || p.nc === 0) continue;
      if (p.kind === 'wob' || p.kind === 'wheel') this.rollContacts(p);
      else this.slideContacts(p);
    }
  }

  slideContacts(p) {
    let vx = p.x - p.px;
    let vy = p.y - p.py;
    for (let k = 0; k < p.nc; k++) {
      const c = p.contacts[k];
      const rx = vx - c.vx * DT;
      const ry = vy - c.vy * DT;
      const vn = rx * c.nx + ry * c.ny;
      if (vn < 0) {
        // stop moving into the surface, and rub along it
        const tx = -c.ny;
        const ty = c.nx;
        const vt = rx * tx + ry * ty;
        vx = c.vx * DT + tx * vt * 0.55;
        vy = c.vy * DT + ty * vt * 0.55;
      }
    }
    p.px = p.x - vx;
    p.py = p.y - vy;
  }

  rollContacts(p) {
    const isWob = p.kind === 'wob';
    const m = isWob ? p.mass : p.mass;
    const invM = 1 / m;
    const R = p.r;
    const rI = (R * R) / p.I;
    let vx = (p.x - p.px) / DT;
    let vy = (p.y - p.py) / DT;
    for (let k = 0; k < p.nc; k++) {
      const c = p.contacts[k];
      let rx = vx - c.vx;
      let ry = vy - c.vy;
      const vn = rx * c.nx + ry * c.ny;
      let jn = 0;
      if (c.kind === 1 && isWob) {
        // spring: boing!
        if (vn < SPRING_LAUNCH * 0.6) {
          // Springboard: out from the face, and onwards the way Wob was rolling.
          let dx = c.nx;
          let dy = c.ny;
          if (c.ny < 0.2) {
            const heading = rx < -20 ? -1 : 1;
            dx += heading * 0.5;
          }
          const dl = Math.sqrt(dx * dx + dy * dy);
          rx = (dx / dl) * SPRING_LAUNCH;
          ry = (dy / dl) * SPRING_LAUNCH;
          jn = 0;
          this.events.push({ type: 'boing', x: p.x, y: p.y, speed: SPRING_LAUNCH });
          vx = rx + c.vx;
          vy = ry + c.vy;
          continue;
        }
      } else if (vn < 0) {
        let target = -vn * (isWob ? WOB_BOUNCE : 0.1);
        if (target < 40) target = 0;
        rx += c.nx * (target - vn);
        ry += c.ny * (target - vn);
        jn = m * (target - vn);
        if (isWob && vn < -160) this.events.push({ type: 'land', x: p.x, y: p.y, nx: c.nx, ny: c.ny, speed: -vn });
      }
      if (c.ny < -0.35) p.grounded = true;
      // friction with rolling: try to make the contact point stop sliding
      const floorish = c.ny < -0.5;
      const mu = floorish ? (isWob ? WOB_GRIP : 1.2) : 0.08;
      const support = m * this.g * DT * (c.ny < 0 ? -c.ny : 0);
      const jmax = mu * (jn + support);
      const tx = -c.ny;
      const ty = c.nx;
      const vt = rx * tx + ry * ty;
      const slip = vt - p.w * R;
      let jt = -slip / (invM + rI / m);
      if (jt > jmax) jt = jmax;
      else if (jt < -jmax) jt = -jmax;
      rx += tx * jt * invM;
      ry += ty * jt * invM;
      p.w -= (jt * R) / p.I;
      vx = rx + c.vx;
      vy = ry + c.vy;
    }
    p.px = p.x - vx * DT;
    p.py = p.y - vy * DT;
  }

  updateStress() {
    const pts = this.points;
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      if (l.broken) continue;
      const a = pts[l.a];
      const b = pts[l.b];
      const wsum = a.im + b.im;
      let ratio = 0;
      if (wsum > 0) {
        if (l.type === 'spring') {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          ratio = Math.abs(d - l.rest) / l.rest / l.maxStrain;
        } else {
          const force = (l.acc / wsum) / DT2;
          ratio = force / (WOB_WEIGHT * l.strength);
        }
      }
      l.stress += (ratio - l.stress) * 0.12;
      if (l.stress > 1) {
        l.broken = true;
        this.events.push({ type: 'snap', link: i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
  }

  // Tiny state fingerprint, for determinism tests.
  hash() {
    let h = 0x811c9dc5;
    const mix = (v) => {
      const s = Math.round(v * 1000);
      h ^= s & 0xffff; h = Math.imul(h, 0x01000193);
      h ^= (s >>> 16) & 0xffff; h = Math.imul(h, 0x01000193);
    };
    for (const p of this.points) { mix(p.x); mix(p.y); mix(p.w); }
    for (const l of this.links) mix(l.broken ? 1 : 0);
    return (h >>> 0).toString(16);
  }
}

// closest point on segment → stored in CX, CY (avoids allocating); returns t
let CX = 0;
let CY = 0;
function closest(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  CX = ax + dx * t;
  CY = ay + dy * t;
  return t;
}

function segDist(px, py, s) {
  closest(px, py, s.ax, s.ay, s.bx, s.by);
  const qx = px - CX;
  const qy = py - CY;
  return Math.sqrt(qx * qx + qy * qy);
}
