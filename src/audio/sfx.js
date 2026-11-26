// Cartoon workshop sound effects, all synthesised.

import { audio, buses, noise } from './engine.js';

function env(g, t, a, peak, d, end = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(end, t + a + d);
}

function osc(type, freq, t, dur, peak, dest, opts = {}) {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.slide ?? dur));
  env(g, t, opts.attack ?? 0.005, peak, dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function hiss(t, dur, peak, filterType, f0, f1, q = 1, dest) {
  const c = audio();
  const s = c.createBufferSource();
  s.buffer = noise();
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, 0.005, peak, dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

const last = {};
function ready(name, gap = 0.04) {
  const c = audio();
  if (!c || c.state !== 'running') return null;
  const now = c.currentTime;
  if (last[name] && now - last[name] < gap) return null;
  last[name] = now;
  return now;
}

export const sfx = {
  boing(pitch = 1) {
    const t = ready('boing', 0.06);
    if (t == null) return;
    const c = audio();
    const out = buses().sfx;
    const o = c.createOscillator();
    const g = c.createGain();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(160 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(420 * pitch, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.5);
    lfo.frequency.setValueAtTime(16, t);
    lfo.frequency.linearRampToValueAtTime(8, t + 0.5);
    lg.gain.setValueAtTime(70 * pitch, t);
    lg.gain.exponentialRampToValueAtTime(2, t + 0.5);
    lfo.connect(lg);
    lg.connect(o.frequency);
    env(g, t, 0.01, 0.5, 0.5);
    o.connect(g);
    g.connect(out);
    o.start(t); lfo.start(t);
    o.stop(t + 0.6); lfo.stop(t + 0.6);
  },
  creak(amount = 0.8) {
    const t = ready('creak', 0.3);
    if (t == null) return;
    const c = audio();
    const out = buses().sfx;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = 70 + Math.random() * 40;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.5, t + 0.12);
    o.frequency.linearRampToValueAtTime(base * 0.9, t + 0.35);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700 + Math.random() * 500;
    f.Q.value = 9;
    const g = c.createGain();
    env(g, t, 0.04, 0.16 * Math.min(1, amount), 0.33);
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.45);
  },
  snap() {
    const t = ready('snap', 0.05);
    if (t == null) return;
    const out = buses().sfx;
    hiss(t, 0.08, 0.6, 'highpass', 1800, 0, 0.7, out);
    osc('square', 1700, t, 0.025, 0.25, out);
    osc('triangle', 320, t + 0.005, 0.14, 0.45, out, { to: 110 });
  },
  pop() {
    const t = ready('pop', 0.05);
    if (t == null) return;
    const out = buses().sfx;
    hiss(t, 0.06, 0.6, 'bandpass', 1400, 600, 1.2, out);
    osc('sine', 950, t, 0.08, 0.45, out, { to: 180 });
  },
  splash() {
    const t = ready('splash', 0.2);
    if (t == null) return;
    const out = buses().sfx;
    hiss(t, 0.6, 0.55, 'lowpass', 3500, 300, 0.8, out);
    osc('sine', 300, t, 0.25, 0.3, out, { to: 90 });
    for (let i = 0; i < 4; i++) osc('sine', 600 + Math.random() * 900, t + 0.1 + i * 0.07, 0.05, 0.12, out, { to: 1400 });
  },
  squish(speed = 300) {
    const t = ready('squish', 0.08);
    if (t == null) return;
    const out = buses().sfx;
    const k = Math.min(1, speed / 700);
    osc('sine', 170, t, 0.2, 0.35 * k + 0.08, out, { to: 70 });
    hiss(t, 0.12, 0.14 * k + 0.03, 'lowpass', 900, 200, 2, out);
  },
  place(kind = 'plank') {
    const t = ready('place', 0.03);
    if (t == null) return;
    const out = buses().sfx;
    if (kind === 'rope') { hiss(t, 0.1, 0.25, 'bandpass', 2500, 1200, 3, out); return; }
    if (kind === 'spring') { osc('sine', 500, t, 0.18, 0.3, out, { to: 900 }); return; }
    if (kind === 'balloon') { hiss(t, 0.25, 0.2, 'bandpass', 900, 2200, 2, out); return; }
    if (kind === 'sticky') { osc('sine', 220, t, 0.12, 0.3, out, { to: 120 }); hiss(t, 0.08, 0.15, 'lowpass', 600, 0, 1, out); return; }
    // wood knock
    osc('triangle', 520, t, 0.09, 0.4, out, { to: 260 });
    osc('sine', 1040, t, 0.04, 0.12, out);
  },
  erase() {
    const t = ready('erase', 0.05);
    if (t == null) return;
    const out = buses().sfx;
    hiss(t, 0.12, 0.25, 'bandpass', 3000, 1500, 2, out);
    hiss(t + 0.07, 0.1, 0.2, 'bandpass', 2600, 1800, 2, out);
  },
  coin() {
    const t = ready('coin', 0.05);
    if (t == null) return;
    const out = buses().sfx;
    osc('triangle', 988, t, 0.08, 0.25, out);
    osc('triangle', 1318, t + 0.07, 0.2, 0.25, out);
  },
  nope() {
    const t = ready('nope', 0.15);
    if (t == null) return;
    const out = buses().sfx;
    osc('square', 220, t, 0.1, 0.12, out);
    osc('square', 180, t + 0.1, 0.14, 0.12, out);
  },
  sock() {
    const t = ready('sock', 0.2);
    if (t == null) return;
    const out = buses().sfx;
    [1046, 1318, 1568, 2093].forEach((f, i) => osc('sine', f, t + i * 0.06, 0.18, 0.22, out));
  },
  go() {
    const t = ready('go', 0.2);
    if (t == null) return;
    const out = buses().sfx;
    osc('sine', 330, t, 0.35, 0.3, out, { to: 990, slide: 0.3 });
    osc('triangle', 660, t + 0.3, 0.12, 0.2, out);
  },
  homeBoing() {
    const t = ready('home', 0.3);
    if (t == null) return;
    const out = buses().sfx;
    osc('sine', 900, t, 0.45, 0.25, out, { to: 280, slide: 0.42 });
    setTimeout(() => sfx.boing(1.2), 450);
  },
  win() {
    const t = ready('win', 0.5);
    if (t == null) return;
    const c = audio();
    const out = buses().sfx;
    const notes = [523, 659, 784, 1046, 784, 1046];
    const times = [0, 0.11, 0.22, 0.36, 0.5, 0.6];
    notes.forEach((f, i) => {
      // a kazoo-ish buzz: sawtooth through a vowel filter, with vibrato
      const st = t + times[i];
      const dur = i === notes.length - 1 ? 0.5 : 0.12;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = f * 0.015;
      lfo.connect(lg); lg.connect(o.frequency);
      const flt = c.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.value = 1200;
      flt.Q.value = 2;
      const g = c.createGain();
      env(g, st, 0.02, 0.22, dur);
      o.connect(flt); flt.connect(g); g.connect(out);
      o.start(st); lfo.start(st);
      o.stop(st + dur + 0.1); lfo.stop(st + dur + 0.1);
    });
  },
  click() {
    const t = ready('click', 0.03);
    if (t == null) return;
    const out = buses().sfx;
    osc('triangle', 620, t, 0.05, 0.18, out, { to: 820 });
  },
  tick() {
    const t = ready('tick', 0.2);
    if (t == null) return;
    osc('square', 1200, t, 0.02, 0.06, buses().sfx);
  },
  star(i = 0) {
    const t = ready('star' + i, 0.05);
    if (t == null) return;
    const out = buses().sfx;
    const f = [784, 988, 1175][i] || 1175;
    osc('sine', f, t, 0.3, 0.25, out);
    osc('triangle', f * 2, t, 0.15, 0.08, out);
  },
};

// A soft, gusty whoosh that plays while wind is blowing.
let windNode = null;
export function windLoop(on) {
  const c = audio();
  if (!c) return;
  if (on && !windNode) {
    const s = c.createBufferSource();
    s.buffer = noise();
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 0.7;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.09, c.currentTime, 0.4);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 0.35;
    lg.gain.value = 0.05;
    lfo.connect(lg); lg.connect(g.gain);
    const lfo2 = c.createOscillator();
    const lg2 = c.createGain();
    lfo2.frequency.value = 0.2;
    lg2.gain.value = 250;
    lfo2.connect(lg2); lg2.connect(f.frequency);
    s.connect(f); f.connect(g); g.connect(buses().sfx);
    s.start(); lfo.start(); lfo2.start();
    windNode = { s, g, lfo, lfo2 };
  } else if (!on && windNode) {
    const w = windNode;
    windNode = null;
    w.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.2);
    setTimeout(() => { try { w.s.stop(); w.lfo.stop(); w.lfo2.stop(); } catch { /* already stopped */ } }, 800);
  }
}
