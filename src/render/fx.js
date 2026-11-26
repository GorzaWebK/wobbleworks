// Little visual effects in world space: splinters, droplets, paper confetti,
// dust puffs and comic words like BOING! They never affect the physics.

import { INK } from './theme.js';

const COLOURS = [INK.lime, INK.tangerine, INK.bubblegum, INK.blue, '#ffd84a'];

export class Effects {
  constructor() {
    this.list = [];
    this.reduced = false;
  }

  clear() { this.list.length = 0; }

  add(p) {
    if (this.list.length > 260) this.list.shift();
    this.list.push(p);
  }

  word(x, y, text, colour = INK.tangerine, size = 26) {
    this.add({ k: 'word', x, y, vx: 0, vy: this.reduced ? 0 : -40, life: 1.1, t: 0, text, colour, size, rot: (Math.random() - 0.5) * 0.3 });
  }

  splinters(x, y, ang, colour = INK.wood) {
    const n = this.reduced ? 3 : 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 180;
      this.add({ k: 'chip', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 1.2, t: 0, rot: ang, vr: (Math.random() - 0.5) * 14, w: 5 + Math.random() * 8, h: 3, colour, g: 900 });
    }
  }

  splash(x, y, colour = '#6fb4dc') {
    const n = this.reduced ? 5 : 16;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = 120 + Math.random() * 260;
      this.add({ k: 'drop', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, t: 0, r: 2 + Math.random() * 3, colour, g: 900 });
    }
  }

  confetti(x, y, n = 40) {
    if (this.reduced) n = Math.min(n, 10);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const s = 200 + Math.random() * 350;
      this.add({ k: 'chip', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 2.2, t: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, w: 7, h: 5, colour: COLOURS[i % COLOURS.length], g: 500, drag: 1.6 });
    }
  }

  puff(x, y, n = 6) {
    if (this.reduced) n = 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({ k: 'puff', x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 20 - 10, life: 0.6, t: 0, r: 4 + Math.random() * 5 });
    }
  }

  sparkle(x, y) {
    const n = this.reduced ? 4 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.add({ k: 'star', x, y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 0.9, t: 0, r: 5, colour: COLOURS[i % COLOURS.length], drag: 3 });
    }
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) { L.splice(i, 1); continue; }
      if (p.g) p.vy += p.g * dt;
      if (p.drag) { p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
  }

  draw(ctx, font) {
    for (const p of this.list) {
      const fade = 1 - p.t / p.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, fade * 1.6);
      if (p.k === 'word') {
        const pop = p.t < 0.15 ? 0.6 + (p.t / 0.15) * 0.6 : 1.2 - Math.min(0.2, (p.t - 0.15));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(pop, pop);
        ctx.font = `${p.size}px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#fff';
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.colour;
        ctx.fillText(p.text, 0, 0);
      } else if (p.k === 'chip') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.strokeStyle = 'rgba(74,79,87,0.6)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else if (p.k === 'drop') {
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.k === 'puff') {
        ctx.strokeStyle = 'rgba(74,79,87,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + p.t * 2), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.k === 'star') {
        ctx.fillStyle = p.colour;
        star(ctx, p.x, p.y, p.r, p.r * 0.45, p.t * 6);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

export function star(ctx, x, y, r1, r2, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? r2 : r1;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}
