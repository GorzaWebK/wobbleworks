// One level on screen: a camera, Wob's jelly look, the effects, and drawing
// everything in the right order. Single player uses one; a race uses two.

import { CELL, WOB_R } from '../physics/consts.js';
import { Camera } from '../render/camera.js';
import { WobLook } from '../render/wob.js';
import { Effects } from '../render/fx.js';
import {
  drawPaper, groundLayer, drawWater, drawWind, drawMovers, drawFlag, drawSock, drawStart,
  drawBuild, drawRun, drawGhost, drawCursor, HAND, MARKER,
} from '../render/draw.js';
import { wobStart } from '../levels/level.js';
import { INK } from '../render/theme.js';
import { sfx } from '../audio/sfx.js';

export class LevelView {
  constructor(level, colour = 'lime') {
    this.level = level;
    this.cam = new Camera();
    this.look = new WobLook(colour);
    this.fx = new Effects();
    this.t = 0;
    this.ground = null;
    this.wantScale = 0;
    this.scaleStill = 0;
    this.home = null; // boing-back-to-start animation
  }

  setLevel(level) {
    this.level = level;
    this.ground = null;
  }

  update(dt, sim) {
    this.t += dt;
    this.fx.update(dt);
    if (sim && !this.home) {
      const w = sim.wob;
      this.look.update(dt, (w.x - w.px) * 120, (w.y - w.py) * 120);
    } else {
      this.look.update(dt, 0, 0, true);
    }
    if (this.home) {
      this.home.t += dt;
      if (this.home.t >= this.home.dur) {
        const done = this.home.done;
        this.home = null;
        this.look.hit(0, -1, 500);
        done?.();
      }
    }
  }

  // Wob flies back to the start in a springy arc.
  sendHome(fromX, fromY, done) {
    const [sx, sy] = wobStart(this.level);
    this.home = { fx: fromX, fy: fromY, sx, sy, t: 0, dur: 1.0, done };
    this.look.setMood('dizzy', 1.6);
  }

  handle(events, sound = true, sim = null) {
    const fx = this.fx;
    for (const e of events) {
      switch (e.type) {
        case 'boing':
          if (sound) sfx.boing(1);
          fx.word(e.x, e.y - 30, 'BOING!', INK.tangerine);
          this.look.hit(0, 1, 700);
          this.look.setMood('wow', 0.6);
          break;
        case 'land':
          if (sound) sfx.squish(e.speed);
          this.look.hit(e.nx, e.ny, e.speed);
          if (e.speed > 350) fx.puff(e.x - e.nx * WOB_R, e.y - e.ny * WOB_R, 4);
          break;
        case 'snap': {
          if (sound) sfx.snap();
          const l = sim?.world.links[e.link];
          const col = l?.type === 'rope' ? '#8a6a3c' : l?.type === 'spring' ? '#cfd5de' : INK.wood;
          fx.splinters(e.x, e.y, 0, col);
          fx.word(e.x, e.y - 24, 'SNAP!', INK.bubblegumDeep);
          break;
        }
        case 'pop':
          if (sound) sfx.pop();
          fx.word(e.x, 30, 'POP!', INK.bubblegum);
          break;
        case 'creak':
          if (sound) sfx.creak(e.amount);
          break;
        case 'sock':
          if (sound) sfx.sock();
          fx.sparkle(e.x, e.y);
          fx.word(e.x, e.y - 28, 'Sock!', INK.limeDeep, 24);
          break;
        case 'splash':
          if (sound) sfx.splash();
          fx.splash(e.x, e.y, this.level.world === 3 ? '#7eb278' : '#6fb4dc');
          fx.word(e.x, e.y - 40, 'SPLOSH!', INK.blue);
          this.look.setMood('wow', 1.5);
          break;
        case 'win':
          fx.confetti(e.x, e.y - 20, 50);
          this.look.setMood('grin', 5);
          break;
        case 'fail':
          fx.word(e.x, Math.min(e.y, this.level.h * CELL - 30) - 30, e.reason === 'stuck' ? 'Hmm…' : e.reason === 'timeout' ? 'Zzz…' : 'Whoops!', INK.blue);
          break;
        default:
      }
    }
  }

  // opts: { mode: 'build'|'run', builder, sim, ghost, cursors: [{x,y,colour,label}], cb, reduced, highlight, showStartRing }
  render(ctx, dpr, opts) {
    const L = this.level;
    const cam = this.cam;
    const reduced = !!opts.reduced;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.rect(cam.vx, cam.vy, cam.vw, cam.vh);
    ctx.clip();
    drawPaper(ctx, cam, L, dpr);
    // ground: cached image, rebuilt once the zoom settles
    const want = Math.round(cam.scale * dpr * 100) / 100;
    if (want !== this.wantScale) { this.wantScale = want; this.scaleStill = this.t; }
    if (!this.ground || (this.ground.key !== want && this.t - this.scaleStill > 0.18)) {
      this.ground = groundLayer(L, want);
    }
    cam.apply(ctx, dpr);
    const g = this.ground;
    ctx.drawImage(g.canvas, -g.pad * CELL, -g.pad * CELL, g.canvas.width / g.s, g.canvas.height / g.s);

    const sim = opts.mode === 'run' ? opts.sim : null;
    const time = sim ? sim.time : this.t;
    drawWind(ctx, L, this.t, reduced);
    drawMovers(ctx, L, sim ? sim.time : 0, !sim, sim ? sim.world.movers : null);
    if (!sim) drawStart(ctx, L);
    drawFlag(ctx, L, this.t, reduced, sim?.state === 'won');
    if (L.sock && !(sim && sim.sockGot)) drawSock(ctx, L, this.t, reduced, sim ? 0.95 : 0.8);
    if (sim) drawRun(ctx, L, sim, this.t, { cb: opts.cb, reduced });
    else if (opts.builder) drawBuild(ctx, L, opts.builder.build.parts, this.t, { cb: opts.cb, reduced, highlight: opts.highlight, mode: 'build' });
    drawWater(ctx, L, time, reduced);

    // Wob
    let wx;
    let wy;
    let ang = 0;
    let sx = 1;
    let sy = 1;
    if (this.home) {
      const h = this.home;
      const k = Math.min(1, h.t / h.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
      wx = h.fx + (h.sx - h.fx) * e;
      wy = h.fy + (h.sy - h.fy) * e - Math.sin(k * Math.PI) * 220;
      ang = k * 12;
      sx = 1 + Math.sin(k * Math.PI * 3) * 0.1;
      sy = 2 - sx;
    } else if (sim) {
      wx = sim.wob.x; wy = sim.wob.y; ang = sim.wob.ang;
    } else {
      [wx, wy] = wobStart(L);
      const breathe = reduced ? 0 : Math.sin(this.t * 2.4) * 0.03;
      sx = 1 + breathe;
      sy = 1 - breathe;
      wy += WOB_R * (1 - sy);
    }
    ctx.save();
    ctx.translate(wx, wy);
    ctx.scale(sx, sy);
    this.look.draw(ctx, 0, 0, WOB_R, ang);
    ctx.restore();

    if (opts.ghost) drawGhost(ctx, opts.ghost, this.t);
    for (const c of opts.cursors || []) drawCursor(ctx, c.x, c.y, c.colour, c.label, this.t);
    this.fx.draw(ctx, MARKER);
    if (opts.label) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `20px ${HAND}`;
      ctx.fillStyle = INK.blue;
      ctx.fillText(opts.label, cam.vx + 12, cam.vy + cam.vh - 14);
    }
    ctx.restore();
  }
}
