// 2-player race on one keyboard. The screen splits in two with the same level
// on each side. Both players build at the same time for 60 seconds, then both
// Wobs go at once. First to the flag wins; if neither gets there, whoever got
// closest wins.

import { app } from '../ui/app.js';
import { $, el, toast } from '../ui/dom.js';
import { partIcon } from '../ui/icons.js';
import { keyName } from '../ui/screens.js';
import { Builder } from './builder.js';
import { Sim } from './sim.js';
import { LevelView } from './view.js';
import { PARTS } from './parts.js';
import { DT, CELL } from '../physics/consts.js';
import { sfx, windLoop } from '../audio/sfx.js';
import { startMusic } from '../audio/music.js';
import { themeFor } from '../render/theme.js';

const BUILD_TIME = 60;
const RUN_LIMIT = 40;

export class Race {
  constructor(level, { onExit }) {
    this.level = level;
    this.onExit = onExit;
    this.sides = [0, 1].map((i) => ({
      i,
      who: i ? 'p2' : 'p1',
      name: i ? 'Player 2' : 'Player 1',
      colour: i ? '#d43a83' : '#4f9e12',
      builder: new Builder(level, [], { snap: () => true }),
      view: new LevelView(level, i ? 'bubblegum' : 'lime'),
      sim: null,
      acc: 0,
      drags: new Map(),
    }));
    for (const s of this.sides) { s.builder.cursor.shown = true; s.view.fx.reduced = app.reduced(); }
    this.paused = false;
    this.pointers = new Map();
    this.onPointer = {
      down: (e) => this.pdown(e),
      move: (e) => this.pmove(e),
      up: (e) => this.pup(e),
    };
    const c = app.canvas;
    c.addEventListener('pointerdown', this.onPointer.down);
    c.addEventListener('pointermove', this.onPointer.move);
    c.addEventListener('pointerup', this.onPointer.up);
    c.addEventListener('pointercancel', this.onPointer.up);
    this.divider = el('div', { class: 'race-divider' });
    $('race-hud').prepend(this.divider);
    $('race-hud').hidden = false;
    $('race-quit').onclick = () => { sfx.click(); this.onExit(); };
    $('race-now').onclick = () => { sfx.click(); if (this.phase === 'build') this.startCountdown(); };
    startMusic({ ...themeFor(level).music, tempo: themeFor(level).music.tempo + 14 }, 99);
    this.resize();
    this.startBuild();
  }

  startBuild() {
    this.phase = 'build';
    this.timeLeft = BUILD_TIME;
    this.lastTick = BUILD_TIME;
    for (const s of this.sides) {
      s.sim = null;
      s.builder.build.clear();
      s.builder.build.past.length = 0;
      s.view.fx.clear();
    }
    $('race-banner').hidden = true;
    $('race-now').hidden = false;
    $('race-now').textContent = 'Both ready: Go now!';
    $('race-now').onclick = () => { sfx.click(); if (this.phase === 'build') this.startCountdown(); };
    this.renderSides();
    this.banner('Build!', `${BUILD_TIME} seconds on the clock`, 1.6);
  }

  banner(text, small = '', time = 0) {
    const b = $('race-banner');
    b.replaceChildren(document.createTextNode(text));
    if (small) b.append(el('small', { text: small }));
    b.hidden = false;
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    clearTimeout(this.bannerT);
    if (time) this.bannerT = setTimeout(() => { b.hidden = true; }, time * 1000);
  }

  renderSides() {
    for (const s of this.sides) {
      const box = $(s.i ? 'race-p2' : 'race-p1');
      box.replaceChildren();
      const b = s.builder;
      box.append(el('span', { class: 'who', text: s.i ? 'P2' : 'P1' }));
      for (const t of b.tools()) {
        const btn = el('button', { class: `part-btn ${t === b.tool ? 'on' : ''} ${t === 'erase' ? 'erase' : ''}`, type: 'button', title: PARTS[t]?.name || 'Rubber', 'aria-label': `${s.name}: ${PARTS[t]?.name || 'Rubber'}` });
        const ic = partIcon(t, 44, 26);
        ic.style.width = '44px';
        ic.style.height = '26px';
        btn.append(ic);
        btn.style.padding = '2px';
        btn.onclick = () => { b.setTool(t); sfx.click(); this.renderSides(); };
        box.append(btn);
      }
      const left = this.level.budget - b.cost();
      box.append(el('span', { class: 'cur', text: `🪙 ${left} left` }));
      const K = app.settings.keys[s.who];
      const hint = `${keyName(K.up)}${keyName(K.left)}${keyName(K.down)}${keyName(K.right)} move · ${keyName(K.rotL)}/${keyName(K.rotR)} turn · ${keyName(K.place)} place · ${keyName(K.part)} part · ${keyName(K.length)} length · ${keyName(K.undo)} undo`;
      box.append(el('span', { class: 'keys-hint', text: hint }));
    }
  }

  startCountdown() {
    this.phase = 'countdown';
    this.count = 3.0;
    $('race-now').hidden = true;
    for (const s of this.sides) s.builder.drag = null;
    this.banner('3');
    sfx.tick();
  }

  startRun() {
    this.phase = 'run';
    this.runTime = 0;
    for (const s of this.sides) {
      s.sim = new Sim(this.level, s.builder.build.parts);
      s.acc = 0;
      s.done = false;
    }
    if (this.level.wind.length) windLoop(true);
    this.banner('Go!', '', 0.8);
    sfx.go();
  }

  finish() {
    this.phase = 'over';
    windLoop(false);
    const [a, b] = this.sides.map((s) => s.sim);
    let winner = -1;
    const aw = a.state === 'won';
    const bw = b.state === 'won';
    if (aw && bw) winner = a.time < b.time ? 0 : b.time < a.time ? 1 : -1;
    else if (aw) winner = 0;
    else if (bw) winner = 1;
    else {
      const pa = a.progress();
      const pb = b.progress();
      if (Math.abs(pa - pb) > 0.01) winner = pa > pb ? 0 : 1;
    }
    const r = app.save.race;
    if (winner === 0) r.p1++; else if (winner === 1) r.p2++; else r.draws++;
    app.persist();
    const why = (aw || bw) ? 'first to the flag!' : 'got the furthest!';
    if (winner >= 0) {
      this.banner(`${this.sides[winner].name} wins!`, `${why} · P1 ${r.p1} – ${r.p2} P2`);
      this.sides[winner].view.look.setMood('grin', 6);
      sfx.win();
    } else {
      this.banner("It's a draw!", `P1 ${r.p1} – ${r.p2} P2`);
    }
    $('race-now').hidden = false;
    $('race-now').textContent = 'Rematch!';
    $('race-now').onclick = () => { sfx.click(); this.startBuild(); };
  }

  // ------------------------------------------------------------ input
  sideAt(x) {
    return x < app.w / 2 ? this.sides[0] : this.sides[1];
  }

  pdown(e) {
    if (this.phase !== 'build' || this.paused) return;
    const r = app.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const s = this.sideAt(x);
    try { app.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const [wx, wy] = s.view.cam.toWorld(x, y);
    const b = s.builder;
    if (b.tool === 'erase') {
      if (b.eraseAt(wx / CELL, wy / CELL)) { sfx.erase(); this.renderSides(); }
      return;
    }
    const p = b.snapPoint(wx, wy);
    this.pointers.set(e.pointerId, s);
    b.drag = { a: p, b: p };
  }

  pmove(e) {
    const s = this.pointers.get(e.pointerId);
    if (!s || !s.builder.drag) return;
    const r = app.canvas.getBoundingClientRect();
    const [wx, wy] = s.view.cam.toWorld(e.clientX - r.left, e.clientY - r.top);
    s.builder.drag.b = s.builder.snapPoint(wx, wy);
  }

  pup(e) {
    const s = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!s || !s.builder.drag) return;
    const g = s.builder.ghostFromDrag();
    s.builder.drag = null;
    if (!g || e.type === 'pointercancel') return;
    if (s.builder.place(g.part)) { sfx.place(g.part.t); this.renderSides(); } else { sfx.nope(); toast(`${s.name}: ${s.builder.lastReason}`, { bad: true }); }
  }

  keydown(e) {
    const code = e.code;
    if (code === app.settings.keys.pause || code === 'KeyP') { this.pause(); return true; }
    if (this.paused || this.phase !== 'build') return code === 'Space' || code === 'Enter';
    for (const s of this.sides) {
      const K = app.settings.keys[s.who];
      const b = s.builder;
      let hit = true;
      if (code === K.up) b.moveCursor(0, -1);
      else if (code === K.down) b.moveCursor(0, 1);
      else if (code === K.left) b.moveCursor(-1, 0);
      else if (code === K.right) b.moveCursor(1, 0);
      else if (code === K.rotL) b.rotate(1);
      else if (code === K.rotR) b.rotate(-1);
      else if (code === K.length) b.cycleLength();
      else if (code === K.part) { b.nextTool(); sfx.click(); this.renderSides(); }
      else if (code === K.undo) { if (b.build.undo()) { sfx.erase(); this.renderSides(); } }
      else if (code === K.place) {
        const r = b.cursorAction();
        if (r.placed) sfx.place(r.placed.t);
        else if (r.erased) sfx.erase();
        else if (r.reason) { sfx.nope(); toast(`${s.name}: ${r.reason}`, { bad: true }); }
        this.renderSides();
      } else hit = false;
      if (hit) return true;
    }
    return false;
  }

  // ----------------------------------------------------------- updates
  update(dt) {
    if (this.paused) return;
    if (this.phase === 'build') {
      this.timeLeft -= dt;
      if (Math.ceil(this.timeLeft) !== this.lastTick) {
        this.lastTick = Math.ceil(this.timeLeft);
        if (this.lastTick <= 5 && this.lastTick > 0) sfx.tick();
      }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.startCountdown(); }
    } else if (this.phase === 'countdown') {
      const before = Math.ceil(this.count);
      this.count -= dt;
      const now = Math.ceil(this.count);
      if (now !== before && now > 0) { this.banner(String(now)); sfx.tick(); }
      if (this.count <= 0) this.startRun();
    } else if (this.phase === 'run') {
      this.runTime += dt * app.settings.speed;
      let anyRunning = false;
      for (const s of this.sides) {
        const sim = s.sim;
        if (sim.state !== 'running') continue;
        s.acc += dt * app.settings.speed;
        let n = 0;
        while (s.acc >= DT && n < 8 && sim.state === 'running') {
          s.acc -= DT;
          n++;
          const ev = sim.step();
          if (ev.length) s.view.handle(ev, true, sim);
        }
        if (n >= 8) s.acc = 0;
        if (sim.state === 'running') anyRunning = true;
      }
      const someoneWon = this.sides.some((s) => s.sim.state === 'won');
      if (someoneWon || !anyRunning || this.runTime > RUN_LIMIT) {
        this.endT = (this.endT || 0) + dt;
        if (this.endT > (someoneWon ? 0.6 : 0.3)) { this.endT = 0; this.finish(); }
      }
    }
    for (const s of this.sides) s.view.update(dt, s.sim);
    const t = $('race-timer');
    t.textContent = this.phase === 'build' ? String(Math.ceil(this.timeLeft)) : this.phase === 'countdown' ? '…' : this.phase === 'run' ? 'GO' : '✓';
    t.style.setProperty('--p', `${(this.phase === 'build' ? this.timeLeft / BUILD_TIME : 0) * 100}%`);
  }

  render() {
    const { ctx, dpr } = app;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of this.sides) {
      const b = s.builder;
      let ghost = null;
      if (this.phase === 'build') ghost = b.drag ? b.ghostFromDrag() : (b.tool === 'erase' ? null : b.ghostFromCursor());
      s.view.render(ctx, dpr, {
        mode: s.sim ? 'run' : 'build',
        builder: b,
        sim: s.sim,
        ghost,
        cursors: this.phase === 'build' ? [{ x: b.cursor.x, y: b.cursor.y, colour: s.colour, label: s.i ? 'P2' : 'P1' }] : [],
        cb: app.settings.cb,
        reduced: app.reduced(),
        label: s.sim ? (s.sim.state === 'won' ? `Flag! ${s.sim.time.toFixed(1)}s` : s.sim.state === 'failed' ? `Out · got ${Math.round(s.sim.progress() * 100)}% of the way` : `${Math.round(s.sim.progress() * 100)}% of the way`) : '',
      });
    }
  }

  resize() {
    const half = app.w / 2;
    const top = app.h < 560 ? 70 : 92;
    this.sides.forEach((s, i) => {
      s.view.cam.setView(i * half + (i ? 3 : 0), 0, half - 3, app.h);
      s.view.cam.fit(this.level, { l: 6, r: 6, t: top, b: 60 });
    });
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    windLoop(false);
    $('pause').hidden = false;
    $('p-resume').onclick = () => this.resume();
    $('p-restart').textContent = 'Start the race again';
    $('p-restart').onclick = () => { this.resume(); this.startBuild(); };
    $('p-settings').hidden = true;
    $('p-quit').textContent = 'Quit the race';
    $('p-quit').onclick = () => { $('pause').hidden = true; this.onExit(); };
    $('p-resume').focus();
  }

  resume() {
    this.paused = false;
    $('pause').hidden = true;
    $('p-settings').hidden = false;
    if (this.phase === 'run' && this.level.wind.length) windLoop(true);
  }

  destroy() {
    windLoop(false);
    const c = app.canvas;
    c.removeEventListener('pointerdown', this.onPointer.down);
    c.removeEventListener('pointermove', this.onPointer.move);
    c.removeEventListener('pointerup', this.onPointer.up);
    c.removeEventListener('pointercancel', this.onPointer.up);
    this.divider.remove();
    $('race-hud').hidden = true;
    $('race-banner').hidden = true;
    $('pause').hidden = true;
    $('p-settings').hidden = false;
    clearTimeout(this.bannerT);
  }
}
