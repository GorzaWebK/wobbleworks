// How Wob looks: a glossy jelly blob with googly eyes. The physics treats Wob
// as a rolling ball; this file adds the squish and jiggle on top, so the look
// can be as bouncy as we like without touching the simulation.

const N = 18;

export const WOB_COLOURS = {
  lime: { fill: '#9cec4a', light: '#d9ffad', deep: '#4f9e12', line: '#3c7d0c' },
  bubblegum: { fill: '#ff7ab8', light: '#ffd0e6', deep: '#d43a83', line: '#a8235f' },
  tangerine: { fill: '#ffa040', light: '#ffe0b8', deep: '#d0600a', line: '#a44a05' },
  blue: { fill: '#6aa6ff', light: '#d4e6ff', deep: '#2b6cd6', line: '#1d4f9e' },
};

export class WobLook {
  constructor(colour = 'lime') {
    this.c = WOB_COLOURS[colour] || WOB_COLOURS.lime;
    this.d = new Float32Array(N);
    this.v = new Float32Array(N);
    this.ex = 0; this.ey = 0; this.evx = 0; this.evy = 0;
    this.blink = 0;
    this.blinkIn = 2 + Math.random() * 3;
    this.mood = 'happy'; // happy | wow | dizzy | grin
    this.moodT = 0;
    this.stretch = 0;
  }

  // a bump: squash the side that got hit
  hit(nx, ny, speed) {
    const k = Math.min(1, speed / 700);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const dot = -(Math.cos(a) * nx + Math.sin(a) * ny);
      if (dot > 0) this.v[i] -= dot * dot * k * 220;
      else this.v[i] += -dot * k * 60;
    }
  }

  poke(amount = 1) {
    for (let i = 0; i < N; i++) this.v[i] += Math.sin(i * 2.1) * 40 * amount;
  }

  setMood(m, t = 1.2) {
    this.mood = m;
    this.moodT = t;
  }

  update(dt, vx = 0, vy = 0, calm = false) {
    const K = 260;
    const C = calm ? 22 : 9;
    const d = this.d;
    const v = this.v;
    for (let i = 0; i < N; i++) {
      const l = d[(i + N - 1) % N];
      const r = d[(i + 1) % N];
      const acc = -K * d[i] - C * v[i] + (l + r - 2 * d[i]) * 120;
      v[i] += acc * dt;
    }
    for (let i = 0; i < N; i++) {
      d[i] += v[i] * dt;
      if (d[i] < -7) { d[i] = -7; v[i] = 0; }
      if (d[i] > 6) { d[i] = 6; v[i] = 0; }
    }
    // eyes lag behind movement
    const tx = Math.max(-1, Math.min(1, vx / 300)) * 2.2 + 1.2;
    const ty = Math.max(-1, Math.min(1, vy / 300)) * 2.2;
    this.evx += ((tx - this.ex) * 90 - this.evx * 10) * dt;
    this.evy += ((ty - this.ey) * 90 - this.evy * 10) * dt;
    this.ex += this.evx * dt;
    this.ey += this.evy * dt;
    const sp = Math.hypot(vx, vy);
    this.stretch += (Math.min(0.18, sp / 3500) - this.stretch) * Math.min(1, dt * 8);
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) { this.blink = 0.14; this.blinkIn = 2 + Math.random() * 4; }
    if (this.blink > 0) this.blink -= dt;
    if (this.moodT > 0) { this.moodT -= dt; if (this.moodT <= 0) this.mood = 'happy'; }
    this.vx = vx;
    this.vy = vy;
  }

  draw(ctx, x, y, R, ang = 0, opts = {}) {
    const c = this.c;
    const d = this.d;
    const sp = Math.hypot(this.vx || 0, this.vy || 0);
    const dirx = sp > 1 ? this.vx / sp : 1;
    const diry = sp > 1 ? this.vy / sp : 0;
    const st = this.stretch;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let px = Math.cos(a);
      let py = Math.sin(a);
      // stretch along the direction of travel
      const along = px * dirx + py * diry;
      px += dirx * along * st;
      py += diry * along * st;
      const rr = R + d[i];
      pts.push([x + px * rr, y + py * rr]);
    }
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    // body
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % N];
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      if (i === 0) {
        const z = pts[N - 1];
        ctx.moveTo((z[0] + p[0]) / 2, (z[1] + p[1]) / 2);
      }
      ctx.quadraticCurveTo(p[0], p[1], mx, my);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R * 1.15);
    g.addColorStop(0, c.light);
    g.addColorStop(0.45, c.fill);
    g.addColorStop(1, c.deep);
    ctx.fillStyle = g;
    ctx.globalAlpha *= 0.94;
    ctx.fill();
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.lineWidth = Math.max(1.5, R * 0.12);
    ctx.strokeStyle = c.line;
    ctx.stroke();

    // little bubbles inside turn as Wob rolls
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let k = 0; k < 3; k++) {
      const a = ang + k * 2.1;
      const rr = R * (0.45 + 0.12 * k);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr * 0.8, y + Math.sin(a) * rr * 0.8, R * (0.09 + 0.03 * k), 0, Math.PI * 2);
      ctx.fill();
    }

    // gloss
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineCap = 'round';
    ctx.lineWidth = R * 0.16;
    ctx.beginPath();
    ctx.arc(x - R * 0.05, y - R * 0.05, R * 0.68, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x - R * 0.5, y - R * 0.12, R * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // googly eyes
    const face = opts.face ?? 1;
    const eyeR = R * 0.3;
    const eyes = [[x + R * 0.05 * face, y - R * 0.3], [x + R * 0.55 * face, y - R * 0.28]];
    for (let i = 0; i < 2; i++) {
      const [exx, eyy] = eyes[i];
      const er = eyeR * (i === 0 ? 1 : 0.88);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = c.line;
      ctx.lineWidth = Math.max(1, R * 0.07);
      ctx.beginPath();
      ctx.arc(exx, eyy, er, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (this.blink > 0 || this.mood === 'grin') {
        ctx.beginPath();
        if (this.mood === 'grin') ctx.arc(exx, eyy + er * 0.3, er * 0.6, Math.PI * 1.15, Math.PI * 1.85);
        else { ctx.moveTo(exx - er * 0.7, eyy); ctx.lineTo(exx + er * 0.7, eyy); }
        ctx.strokeStyle = '#1d1d22';
        ctx.lineWidth = Math.max(1, R * 0.08);
        ctx.stroke();
        continue;
      }
      let pdx = this.ex * face;
      let pdy = this.ey;
      if (this.mood === 'dizzy') {
        const t = performance.now() / 120 + i;
        pdx = Math.cos(t) * 2.5;
        pdy = Math.sin(t) * 2.5;
      }
      const lim = er * 0.45;
      const pl = Math.hypot(pdx, pdy);
      if (pl > lim) { pdx *= lim / pl; pdy *= lim / pl; }
      ctx.fillStyle = '#1d1d22';
      ctx.beginPath();
      ctx.arc(exx + pdx * (R / 15), eyy + pdy * (R / 15), er * (this.mood === 'wow' ? 0.32 : 0.48), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(exx + pdx * (R / 15) - er * 0.15, eyy + pdy * (R / 15) - er * 0.18, er * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    // mouth
    ctx.strokeStyle = c.line;
    ctx.lineWidth = Math.max(1.2, R * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const mx = x + R * 0.32 * face;
    const my = y + R * 0.18;
    if (this.mood === 'wow') {
      ctx.fillStyle = c.line;
      ctx.ellipse(mx, my + R * 0.05, R * 0.12, R * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.mood === 'grin') {
      ctx.fillStyle = '#7a1f3d';
      ctx.arc(mx, my - R * 0.02, R * 0.26, 0.1, Math.PI - 0.1);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.arc(mx, my - R * 0.08, R * 0.2, 0.35, Math.PI - 0.35);
      ctx.stroke();
    }
    ctx.restore();
  }
}
