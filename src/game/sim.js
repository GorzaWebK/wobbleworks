// One run: turns a level plus a build into a physics world, steps it and
// decides when Wob has reached the flag, fallen, gone splash or got stuck.

import { World } from '../physics/world.js';
import { CELL, DT, WOB_R, NODE_R, WHEEL_R, PLANK_THICK, SPRING_THICK, BALLOON_LIFT } from '../physics/consts.js';
import { PARTS } from './parts.js';
import { keyOf, anchorKeys, moverAt } from './build.js';
import { terrainFor, wobStart, flagZone, sockCentre } from '../levels/level.js';

export const MAX_TIME = 60;
const STUCK_TIME = 4;

export class Sim {
  constructor(level, parts) {
    this.level = level;
    this.parts = parts;
    const world = new World({
      terrain: terrainFor(level), gravity: level.gravity, movers: level.movers, water: level.water, wind: level.wind,
    });
    this.world = world;
    this.nodeOf = new Map(); // key → point index
    this.partLinks = new Map(); // part index → link index
    this.balloons = []; // {part, node, popped}
    this.wheels = []; // {part, node}
    this.build(level, parts);
    const [sx, sy] = wobStart(level);
    world.addWob(sx, sy);
    this.wob = world.points[world.wob];
    this.flag = flagZone(level);
    this.sock = sockCentre(level);
    this.sockGot = false;
    this.state = 'running'; // running | won | failed
    this.reason = '';
    const [fx, fy] = [(level.flag[0] + 0.5) * CELL, (level.flag[1] + 0.5) * CELL];
    this.flagPos = [fx, fy];
    this.startDist = Math.hypot(fx - sx, fy - sy) || 1;
    this.bestDist = this.startDist;
    this.lastCheck = { t: 0, x: sx, y: sy };
    this.stuckFor = 0;
    this.lastCreak = -1;
    this.events = [];
  }

  build(level, parts) {
    const anchors = anchorKeys(level, parts);
    const info = new Map();
    const node = (x, y) => {
      const k = keyOf(x, y);
      let n = info.get(k);
      if (!n) {
        n = { k, x, y, mass: 0, floatF: 0, wheel: false, balloons: 0, fixed: anchors.has(k), stick: -1 };
        info.set(k, n);
      }
      return n;
    };
    // sticky pads on moving blocks ride along with them
    for (const p of parts) {
      if (p.t !== 'sticky') continue;
      const n = node(p.a[0], p.a[1]);
      n.stick = moverAt(level, p.a[0], p.a[1]);
    }
    parts.forEach((p) => {
      const def = PARTS[p.t];
      if (def.kind === 'link') {
        const a = node(p.a[0], p.a[1]);
        const b = node(p.b[0], p.b[1]);
        a.mass += def.mass / 2; b.mass += def.mass / 2;
        a.floatF += def.floatF / 2; b.floatF += def.floatF / 2;
      } else if (p.t === 'wheel') {
        const n = node(p.a[0], p.a[1]);
        n.wheel = true;
        n.mass += def.mass;
        n.floatF += def.floatF;
      } else if (p.t === 'balloon') {
        const n = node(p.a[0], p.a[1]);
        n.balloons += 1;
        n.mass += def.mass;
      }
    });
    const w = this.world;
    for (const n of info.values()) {
      const mass = Math.max(0.05, n.mass);
      const idx = w.addPoint(n.x * CELL, n.y * CELL, {
        mass,
        fixed: n.fixed && n.stick < 0,
        stick: n.fixed ? n.stick : -1,
        r: n.wheel ? WHEEL_R : NODE_R,
        kind: n.wheel ? 'wheel' : 'node',
        floatF: n.floatF,
        windK: 0.15 + (1.3 * n.balloons) / mass,
      });
      w.points[idx].lift = n.balloons * BALLOON_LIFT;
      this.nodeOf.set(n.k, idx);
    }
    const plankAt = new Map();
    parts.forEach((p, i) => {
      const def = PARTS[p.t];
      if (def.kind === 'link') {
        const a = this.nodeOf.get(keyOf(p.a[0], p.a[1]));
        const b = this.nodeOf.get(keyOf(p.b[0], p.b[1]));
        const li = w.addLink(a, b, {
          type: p.t,
          stiff: p.t === 'spring' ? 0.5 : 1,
          strength: def.strength,
          maxStrain: 0.45,
          collide: def.collide,
          bounce: !!def.bounce,
          thick: p.t === 'spring' ? SPRING_THICK : PLANK_THICK,
          part: i,
        });
        this.partLinks.set(i, li);
        if (p.t === 'plank') {
          for (const k of [keyOf(p.a[0], p.a[1]), keyOf(p.b[0], p.b[1])]) {
            if (!plankAt.has(k)) plankAt.set(k, []);
            plankAt.get(k).push(li);
          }
        }
      } else if (p.t === 'balloon') {
        this.balloons.push({ part: i, node: this.nodeOf.get(keyOf(p.a[0], p.a[1])), popped: false });
      } else if (p.t === 'wheel') {
        this.wheels.push({ part: i, node: this.nodeOf.get(keyOf(p.a[0], p.a[1])) });
      }
    });
    // weld planks that meet at a free joint (bolts stay as pivots)
    for (const [k, list] of plankAt) {
      if (anchors.has(k)) continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) w.addBend(list[i], list[j], 0.3);
      }
    }
  }

  get time() {
    return this.world.time;
  }

  step() {
    this.events.length = 0;
    if (this.state !== 'running') return this.events;
    const w = this.world;
    w.step();
    for (const e of w.events) this.events.push(e);
    const wob = this.wob;
    const L = this.level;
    const t = w.time;

    // balloons that float off the top of the page pop
    for (const b of this.balloons) {
      if (b.popped) continue;
      const p = w.points[b.node];
      if (p.y < -1.5 * CELL) {
        b.popped = true;
        p.lift = Math.max(0, p.lift - BALLOON_LIFT);
        this.events.push({ type: 'pop', x: p.x, y: 0 });
      }
    }

    // creaks when something is close to breaking
    if (t - this.lastCreak > 0.45) {
      for (const l of w.links) {
        if (!l.broken && l.stress > 0.7 && l.type !== 'spring') {
          this.lastCreak = t;
          this.events.push({ type: 'creak', amount: l.stress });
          break;
        }
      }
    }

    // sock
    if (this.sock && !this.sockGot) {
      const dx = wob.x - this.sock[0];
      const dy = wob.y - this.sock[1];
      if (dx * dx + dy * dy < (WOB_R + CELL * 0.45) ** 2) {
        this.sockGot = true;
        this.events.push({ type: 'sock', x: this.sock[0], y: this.sock[1] });
      }
    }

    // progress towards the flag
    const fdx = wob.x - this.flagPos[0];
    const fdy = wob.y - this.flagPos[1];
    const fd = Math.sqrt(fdx * fdx + fdy * fdy);
    if (fd < this.bestDist) this.bestDist = fd;

    const F = this.flag;
    if (wob.x >= F.x0 && wob.x <= F.x1 && wob.y >= F.y0 && wob.y <= F.y1) {
      return this.finish('won', 'flag');
    }
    for (const z of w.water) {
      if (wob.x >= z.x0 && wob.x <= z.x1 && wob.y + WOB_R * 0.4 > z.y0 && wob.y < z.y1 + WOB_R) {
        this.events.push({ type: 'splash', x: wob.x, y: z.y0 });
        return this.finish('failed', 'splash');
      }
    }
    if (wob.y > (L.h + 3) * CELL || wob.x < -3 * CELL || wob.x > (L.w + 3) * CELL || wob.y < -12 * CELL) {
      return this.finish('failed', 'fell');
    }
    // stuck: hardly moved for a few seconds
    if (t - this.lastCheck.t >= 0.5) {
      const dx = wob.x - this.lastCheck.x;
      const dy = wob.y - this.lastCheck.y;
      if (dx * dx + dy * dy < (CELL * 0.15) ** 2) this.stuckFor += t - this.lastCheck.t;
      else this.stuckFor = 0;
      this.lastCheck = { t, x: wob.x, y: wob.y };
      if (this.stuckFor >= STUCK_TIME) return this.finish('failed', 'stuck');
    }
    if (t >= MAX_TIME) return this.finish('failed', 'timeout');
    return this.events;
  }

  finish(state, reason) {
    this.state = state;
    this.reason = reason;
    this.events.push({ type: state === 'won' ? 'win' : 'fail', reason, x: this.wob.x, y: this.wob.y });
    return this.events;
  }

  // 0..1: how close Wob got to the flag (1 = reached it)
  progress() {
    if (this.state === 'won') return 1;
    return Math.max(0, Math.min(0.999, 1 - this.bestDist / this.startDist));
  }

  // Run to the end without drawing (for tests, and for checking levels).
  runToEnd(maxTime = MAX_TIME + 1) {
    const maxSteps = Math.ceil(maxTime / DT);
    for (let i = 0; i < maxSteps && this.state === 'running'; i++) this.step();
    return this;
  }
}
