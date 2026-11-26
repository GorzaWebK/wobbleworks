// Single-player: build in the workshop, press Go!, watch the run, then either
// celebrate or boing back to the start and tinker some more.

import { app } from '../ui/app.js';
import { $, el, toast, hideToast, starIcon, starsText, dialog } from '../ui/dom.js';
import { partIcon } from '../ui/icons.js';
import { Builder } from './builder.js';
import { Sim } from './sim.js';
import { LevelView } from './view.js';
import { Gestures } from './input.js';
import { PARTS } from './parts.js';
import { packBuild, unpackBuild, linkLength } from './build.js';
import { DT, CELL } from '../physics/consts.js';
import { sfx, windLoop } from '../audio/sfx.js';
import { startMusic } from '../audio/music.js';
import { themeFor } from '../render/theme.js';
import { findLevel, nextLevel, worldUnlocked, levelUnlocked } from '../levels/levels.js';

const REASONS = {
  fell: 'Whoops! Wob fell. Boing, back to the start!',
  splash: 'Splosh! Wob hates getting soggy. Back to the start!',
  stuck: 'Wob got stuck. Back to the start for another go!',
  timeout: 'Wob ran out of time. Back to the start!',
};

export class Session {
  // kind: 'campaign' | 'custom' | 'test'
  constructor(level, opts = {}) {
    this.level = level;
    this.kind = opts.kind || 'campaign';
    this.onExit = opts.onExit || (() => {});
    this.onNext = opts.onNext || null;
    const saved = this.kind === 'campaign' ? app.save.builds[level.id] : opts.parts;
    this.builder = new Builder(level, typeof saved === 'string' ? unpackBuild(saved) : (saved || []), { snap: () => app.settings.grid });
    this.view = new LevelView(level, 'lime');
    this.view.fx.reduced = app.reduced();
    this.mode = 'build'; // build | run | replay | done
    this.sim = null;
    this.acc = 0;
    this.lastRun = null;
    this.endTimer = 0;
    this.paused = false;
    this.mouseGhost = null;
    this.highlight = -1;
    this.gestures = new Gestures(app.canvas, this.handlers());
    this.mountHud();
    this.resize();
    startMusic(themeFor(level).music, level.world || 7);
  }

  // ------------------------------------------------------------------ HUD
  mountHud() {
    const L = this.level;
    $('hud').hidden = false;
    const f = findLevel(app.worlds, L.id);
    $('lvl-num').textContent = f ? `${f.wi + 1}-${f.li + 1}` : (this.kind === 'test' ? 'Test' : '★');
    $('lvl-name').textContent = L.name;
    this.updateStars();
    const tray = $('tray');
    tray.replaceChildren();
    tray.classList.remove('away');
    this.builder.tools().forEach((t, i) => {
      const def = PARTS[t];
      const b = el('button', { class: `part-btn ${t === 'erase' ? 'erase' : ''}`, type: 'button', 'data-tool': t, title: def ? def.tip : 'Rub out a part (or right-click it)', 'aria-label': def ? `${def.name}, ${def.cost} coins` : 'Rubber' });
      b.append(partIcon(t), el('span', { class: 'nm', text: def ? def.name : 'Rubber' }));
      if (def) b.append(el('span', { class: 'tag', text: String(def.cost) }));
      b.append(el('span', { class: 'key', text: String(i + 1) }));
      b.addEventListener('click', () => { this.builder.setTool(t); sfx.click(); this.refreshTray(); });
      tray.append(b);
    });
    this.refreshTray();
    this.refreshReceipt();
    const on = (id, fn) => { const b = $(id); b.onclick = () => { sfx.click(); fn(); }; };
    on('t-undo', () => this.undo());
    on('t-redo', () => this.redo());
    on('t-grid', () => { app.settings.grid = !app.settings.grid; app.persist(); this.refreshTools(); toast(app.settings.grid ? 'Snapping to the grid' : 'Free placing (quarter squares)'); });
    on('t-zoomin', () => this.zoom(1.25));
    on('t-zoomout', () => this.zoom(0.8));
    on('t-fit', () => this.view.cam.reset());
    on('t-clear', () => this.clearAll());
    on('t-help', () => this.showNote(true));
    on('t-pause', () => this.pause());
    $('go').onclick = () => this.goOrStop();
    $('note-ok').onclick = () => { $('note').hidden = true; app.save.seenNotes[L.id] = 1; app.persist(); };
    this.refreshTools();
    this.setRunUi(false);
    this.showNote(false);
  }

  showNote(force) {
    const L = this.level;
    if (!L.note) { if (force) toast('No tip for this one. You can do it!'); return; }
    if (!force && app.save.seenNotes[L.id]) { $('note').hidden = true; return; }
    $('note-text').textContent = L.note;
    $('note').hidden = false;
  }

  updateStars() {
    const s = app.save.stars[this.level.id];
    $('lvl-stars').innerHTML = this.kind === 'campaign' ? starsText(s) : '';
  }

  refreshTray() {
    for (const b of $('tray').querySelectorAll('.part-btn')) b.classList.toggle('on', b.dataset.tool === this.builder.tool);
  }

  refreshTools() {
    $('t-grid').setAttribute('aria-pressed', String(!!app.settings.grid));
    $('t-undo').disabled = !this.builder.build.past.length || this.mode !== 'build';
    $('t-redo').disabled = !this.builder.build.future.length || this.mode !== 'build';
    $('t-clear').disabled = !this.builder.build.parts.length || this.mode !== 'build';
  }

  refreshReceipt(bump = false) {
    const L = this.level;
    const { counts, cost } = this.builder.summary();
    const r = $('receipt');
    const rows = [el('h4', { text: '· PARTS RECEIPT ·' })];
    for (const t of L.parts) {
      if (!counts[t]) continue;
      rows.push(el('div', { class: 'ln' }, el('span', { text: `${counts[t]} × ${PARTS[t].name}` }), el('span', { text: String(counts[t] * PARTS[t].cost) })));
    }
    if (!Object.keys(counts).length) rows.push(el('div', { class: 'ln' }, el('span', { text: 'nothing yet…' }), el('span', { text: '0' })));
    rows.push(el('hr'));
    rows.push(el('div', { class: `ln tot ${cost > L.budget ? 'over' : ''}` }, el('span', { text: 'Spent' }), el('span', { text: `${cost}` })));
    rows.push(el('div', { class: 'ln' }, el('span', { text: 'Budget' }), el('span', { text: `${L.budget}` })));
    rows.push(el('div', { class: 'ln' }, el('span', { text: 'Left' }), el('span', { text: `${L.budget - cost}` })));
    rows.push(el('div', { class: `par ${cost <= L.par ? 'ok' : ''}`, text: `★ thrifty if ${L.par} or less` }));
    r.replaceChildren(...rows);
    if (bump) { r.classList.remove('bump'); void r.offsetWidth; r.classList.add('bump'); }
    $('go').disabled = cost > L.budget;
  }

  setRunUi(running, label = '') {
    $('tray').classList.toggle('away', running);
    $('go').classList.toggle('stop', running);
    $('go').querySelector('.go-word').textContent = running ? 'Stop' : 'Go!';
    $('go').setAttribute('aria-label', running ? 'Stop the run' : 'Go! Start the run');
    $('runbar').hidden = !label;
    $('run-label').textContent = label;
    $('tools').style.visibility = running ? 'hidden' : '';
    if (running) $('note').hidden = true;
    this.refreshTools();
  }

  changed(placedType) {
    if (this.kind === 'campaign') {
      app.save.builds[this.level.id] = packBuild(this.builder.build.parts);
      app.persist();
    }
    this.refreshReceipt(!!placedType);
    this.refreshTools();
  }

  // -------------------------------------------------------------- input
  handlers() {
    const toCell = (x, y) => {
      const [wx, wy] = this.view.cam.toWorld(x, y);
      return [wx / CELL, wy / CELL];
    };
    return {
      down: (x, y) => {
        if (this.mode !== 'build' || this.paused) return;
        this.builder.cursor.shown = false;
        const [wx, wy] = this.view.cam.toWorld(x, y);
        if (this.builder.tool === 'erase') {
          const [cx, cy] = toCell(x, y);
          this.erase(cx, cy);
          this.erasing = true;
          return;
        }
        const p = this.builder.snapPoint(wx, wy);
        this.builder.drag = { a: p, b: p };
      },
      move: (x, y) => {
        if (this.mode !== 'build') return;
        const [wx, wy] = this.view.cam.toWorld(x, y);
        if (this.erasing) {
          const [cx, cy] = toCell(x, y);
          this.erase(cx, cy, true);
          return;
        }
        if (this.builder.drag) this.builder.drag.b = this.builder.snapPoint(wx, wy);
      },
      up: (x, y) => {
        this.erasing = false;
        if (this.mode !== 'build' || !this.builder.drag) return;
        const [wx, wy] = this.view.cam.toWorld(x, y);
        this.builder.drag.b = this.builder.snapPoint(wx, wy);
        const g = this.builder.ghostFromDrag();
        const def = PARTS[this.builder.tool];
        this.builder.drag = null;
        if (!g) {
          if (def?.kind === 'link') toast(`Drag to stretch a ${def.name.toLowerCase()} between two points`);
          return;
        }
        this.tryPlace(g.part);
      },
      cancel: () => { this.builder.drag = null; this.erasing = false; },
      hover: (x, y) => {
        if (this.mode !== 'build') return;
        const [wx, wy] = this.view.cam.toWorld(x, y);
        this.hoverPt = [wx, wy];
        this.builder.cursor.shown = false;
      },
      secondary: (x, y) => {
        if (this.mode !== 'build') return;
        const [cx, cy] = toCell(x, y);
        this.erase(cx, cy);
      },
      pinch: (k, cx, cy, dx, dy) => {
        const cam = this.view.cam;
        if (dx || dy) cam.pan(dx, dy);
        if (k !== 1) cam.zoomAt(cx, cy, k);
      },
    };
  }

  tryPlace(part) {
    if (this.builder.place(part)) {
      sfx.place(part.t);
      if (PARTS[part.t].kind === 'link' && linkLength(part) > 0) this.view.fx.puff((part.a[0] + part.b[0]) / 2 * CELL, (part.a[1] + part.b[1]) / 2 * CELL, 3);
      else this.view.fx.puff(part.a[0] * CELL, part.a[1] * CELL, 3);
      this.changed(part.t);
      return true;
    }
    sfx.nope();
    toast(this.builder.lastReason, { bad: true });
    return false;
  }

  erase(cx, cy, quiet = false) {
    const gone = this.builder.eraseAt(cx, cy);
    if (gone) {
      sfx.erase();
      this.view.fx.puff(cx * CELL, cy * CELL, 4);
      this.changed();
    } else if (!quiet) {
      // nothing here
    }
  }

  undo() {
    if (this.mode !== 'build') return;
    if (this.builder.build.undo()) { sfx.erase(); this.changed(); }
  }

  redo() {
    if (this.mode !== 'build') return;
    if (this.builder.build.redo()) { sfx.place(); this.changed(); }
  }

  async clearAll() {
    if (!this.builder.build.parts.length) return;
    const ok = await dialog('Clear everything?', 'This puts every part back in the tray. (Undo can bring them back.)', [
      { text: 'Clear it all', cls: 'bubblegum', value: true }, { text: 'Keep them', cls: 'lime', value: false },
    ]);
    if (ok) { this.builder.build.clear(); sfx.erase(); this.changed(); }
  }

  zoom(k) {
    const cam = this.view.cam;
    cam.zoomAt(cam.vx + cam.vw / 2, cam.vy + cam.vh / 2, k);
  }

  keydown(e) {
    if (this.paused) return false;
    const K = app.settings.keys;
    const code = e.code;
    if (code === K.pause || code === 'KeyP') { this.pause(); return true; }
    if ((e.ctrlKey || e.metaKey) && code === 'KeyZ') { if (e.shiftKey) this.redo(); else this.undo(); return true; }
    if ((e.ctrlKey || e.metaKey) && code === 'KeyY') { this.redo(); return true; }
    if (code === K.go) { this.goOrStop(); return true; }
    if (this.mode !== 'build') {
      if (code === 'Space' || code === 'Enter') { this.goOrStop(); return true; }
      return false;
    }
    if (/^Digit[1-9]$/.test(code)) {
      const t = this.builder.tools()[Number(code.slice(5)) - 1];
      if (t) { this.builder.setTool(t); this.refreshTray(); sfx.click(); }
      return true;
    }
    for (const who of ['p1', 'p2']) {
      const k = K[who];
      const b = this.builder;
      if (code === k.up) { b.moveCursor(0, -1); return true; }
      if (code === k.down) { b.moveCursor(0, 1); return true; }
      if (code === k.left) { b.moveCursor(-1, 0); return true; }
      if (code === k.right) { b.moveCursor(1, 0); return true; }
      if (code === k.rotL) { b.rotate(1); return true; }
      if (code === k.rotR) { b.rotate(-1); return true; }
      if (code === k.length) { b.cycleLength(); return true; }
      if (code === k.part) { b.nextTool(); this.refreshTray(); sfx.click(); return true; }
      if (code === k.undo) { this.undo(); return true; }
      if (code === k.place) {
        const r = b.cursorAction();
        if (r.placed) { sfx.place(r.placed.t); this.changed(r.placed.t); } else if (r.erased) { sfx.erase(); this.changed(); } else if (r.reason) { sfx.nope(); toast(r.reason, { bad: true }); }
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- runs
  goOrStop() {
    if (this.paused) return;
    if (this.mode === 'build') this.go();
    else if (this.mode === 'run') this.stopRun();
    else if (this.mode === 'replay') this.endReplay();
  }

  go() {
    if (this.builder.cost() > this.level.budget) { sfx.nope(); toast('Over budget! Take something away first.', { bad: true }); return; }
    hideToast();
    this.builder.drag = null;
    this.lastRun = this.builder.build.parts.map((p) => ({ ...p }));
    this.sim = new Sim(this.level, this.lastRun);
    this.mode = 'run';
    this.acc = 0;
    this.endTimer = 0;
    this.view.fx.clear();
    sfx.go();
    if (this.level.wind.length) windLoop(true);
    this.setRunUi(true);
  }

  stopRun() {
    windLoop(false);
    this.mode = 'build';
    this.sim = null;
    this.setRunUi(false);
  }

  replay() {
    if (!this.lastRun) return;
    this.replayOfWin = !$('result').hidden;
    $('result').hidden = true;
    this.sim = new Sim(this.level, this.lastRun);
    this.mode = 'replay';
    this.acc = 0;
    this.endTimer = 0;
    this.view.fx.clear();
    if (this.level.wind.length) windLoop(true);
    this.setRunUi(true, 'Slow-mo replay');
  }

  endReplay() {
    windLoop(false);
    const wasWin = this.replayOfWin;
    this.replayOfWin = false;
    this.mode = 'build';
    this.sim = null;
    this.setRunUi(false);
    if (wasWin && this.lastResult) this.showResult(this.lastResult, false);
  }

  stepSim(dt, speed) {
    const sim = this.sim;
    this.acc += dt * speed;
    let n = 0;
    while (this.acc >= DT && n < 10) {
      this.acc -= DT;
      n++;
      if (sim.state !== 'running') break;
      const ev = sim.step();
      if (ev.length) this.view.handle(ev, true, sim);
    }
    if (n >= 10) this.acc = 0; // slow computer: run in slow motion rather than stutter
  }

  update(dt) {
    if (this.paused) return;
    const v = this.view;
    if (this.mode === 'run' || this.mode === 'replay') {
      const speed = this.mode === 'replay' ? 0.3 : app.settings.speed;
      if (this.sim.state === 'running') this.stepSim(dt, speed);
      else {
        this.endTimer += dt;
        if (this.mode === 'run' && this.endTimer > (this.sim.state === 'won' ? 1.1 : 0.7) && !this.ending) this.finishRun();
        if (this.mode === 'replay' && this.endTimer > 1.2) this.endReplay();
      }
    }
    v.update(dt, this.mode === 'run' || this.mode === 'replay' ? this.sim : null);
  }

  finishRun() {
    this.ending = true;
    windLoop(false);
    const sim = this.sim;
    if (sim.state === 'won') {
      sfx.win();
      const res = this.record(sim);
      this.lastResult = res;
      this.mode = 'done';
      this.setRunUi(false);
      this.showResult(res, true);
      this.ending = false;
      return;
    }
    // boing back to the start
    const from = [sim.wob.x, Math.min(sim.wob.y, this.level.h * CELL)];
    this.mode = 'build';
    this.sim = null;
    sfx.homeBoing();
    this.view.sendHome(from[0], from[1], () => {
      this.ending = false;
      this.setRunUi(false);
      toast(REASONS[sim.reason] || 'Back to the start!', { button: { text: 'Watch slow-mo', onClick: () => this.replay() }, time: 4500 });
    });
    this.setRunUi(false);
    $('go').disabled = true;
    setTimeout(() => this.refreshReceipt(), 1000);
  }

  record(sim) {
    const L = this.level;
    const cost = this.builder.cost();
    const got = [1, cost <= L.par ? 1 : 0, L.sock && sim.sockGot ? 1 : 0];
    if (!L.sock) got[2] = 1;
    const res = { got, cost, newStars: [0, 0, 0], unlocked: null };
    if (this.kind !== 'campaign') return res;
    const prev = app.save.stars[L.id] || [0, 0, 0];
    const f = findLevel(app.worlds, L.id);
    const worldOpenBefore = f && f.wi + 1 < app.worlds.length ? worldUnlocked(app.save, app.worlds, f.wi + 1) : true;
    app.save.stars[L.id] = prev.map((v, i) => (v || got[i] ? 1 : 0));
    res.newStars = got.map((g, i) => (g && !prev[i] ? 1 : 0));
    const best = app.save.best[L.id];
    if (!best || cost <= best.cost) app.save.best[L.id] = { cost, build: packBuild(this.lastRun) };
    if (f && f.wi + 1 < app.worlds.length && !worldOpenBefore && worldUnlocked(app.save, app.worlds, f.wi + 1)) {
      res.unlocked = app.worlds[f.wi + 1].name;
    }
    app.persist(true);
    this.updateStars();
    return res;
  }

  showResult(res, fresh) {
    const L = this.level;
    $('res-h').textContent = ['Wob made it!', 'Flag reached!', 'Squishy success!', 'Wobbletastic!'][Math.floor(Math.random() * 4)];
    const box = $('res-stars');
    box.replaceChildren();
    const labels = ['Made it!', `Thrifty: ${L.par} or less`, L.sock ? 'Found the sock' : 'No sock here'];
    res.got.forEach((g, i) => {
      const d = el('div', { class: `res-star ${g ? 'got' : ''} ${res.newStars[i] && fresh ? 'new' : ''}` }, starIcon(), el('span', { text: labels[i] }));
      if (g) d.querySelector('svg').style.animationDelay = `${0.25 + i * 0.3}s`;
      box.append(d);
      if (g && fresh) setTimeout(() => sfx.star(i), 250 + i * 300);
    });
    let text = `You spent ${res.cost} of ${L.budget} coins.`;
    if (!res.got[1]) text += ` Can you do it for ${L.par}?`;
    if (L.sock && !res.got[2]) text += ' There\'s a sock hiding somewhere…';
    if (res.unlocked) text += ` New world unlocked: ${res.unlocked}!`;
    $('res-text').textContent = text;
    const nx = this.kind === 'campaign' ? nextLevel(app.worlds, L.id) : null;
    const nextOk = nx && levelUnlocked(app.save, app.worlds, nx.wi, nx.li);
    $('r-next').hidden = !(nextOk || this.kind === 'test');
    $('r-next').textContent = this.kind === 'test' ? 'Back to the editor' : 'Next puzzle ▶';
    $('r-next').onclick = () => { $('result').hidden = true; if (this.kind === 'test') this.onExit(); else this.onNext?.(nx); };
    $('r-replay').onclick = () => this.replay();
    $('r-tinker').onclick = () => { $('result').hidden = true; this.mode = 'build'; this.sim = null; this.setRunUi(false); };
    $('r-levels').textContent = this.kind === 'campaign' ? 'Sketchbook' : this.kind === 'test' ? 'Back to the editor' : 'My Levels';
    $('r-levels').onclick = () => { $('result').hidden = true; this.onExit(); };
    $('result').hidden = false;
    setTimeout(() => $('r-next').hidden ? $('r-replay').focus() : $('r-next').focus(), 50);
  }

  // ---------------------------------------------------------- lifecycle
  pause() {
    if (this.paused || !$('result').hidden) return;
    this.paused = true;
    windLoop(false);
    $('pause').hidden = false;
    $('p-resume').focus();
    $('p-resume').onclick = () => this.resume();
    $('p-restart').onclick = async () => {
      this.resume();
      if (this.mode !== 'build') this.stopRun();
      this.view.cam.reset();
    };
    $('p-restart').textContent = 'Stop and go back to building';
    $('p-settings').onclick = () => { $('pause').hidden = true; this.onSettings?.(); };
    $('p-quit').textContent = this.kind === 'test' ? 'Back to the editor' : this.kind === 'campaign' ? 'Back to the sketchbook' : 'Back to My Levels';
    $('p-quit').onclick = () => { $('pause').hidden = true; this.paused = false; this.onExit(); };
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    $('pause').hidden = true;
    if ((this.mode === 'run' || this.mode === 'replay') && this.level.wind.length) windLoop(true);
  }

  resize() {
    const cam = this.view.cam;
    cam.setView(0, 0, app.w, app.h);
    const tray = $('tray').getBoundingClientRect();
    const small = app.h < 560 || app.w < 700;
    cam.fit(this.level, { l: Math.max(0, tray.right) + 6, r: 8, t: small ? 34 : 44, b: small ? 56 : 66 });
  }

  render() {
    const b = this.builder;
    let ghost = null;
    let cursors = [];
    if (this.mode === 'build' && !this.view.home) {
      if (b.drag) ghost = b.ghostFromDrag();
      else if (b.cursor.shown) {
        ghost = b.tool === 'erase' ? null : b.ghostFromCursor();
        cursors = [{ x: b.cursor.x, y: b.cursor.y, colour: '#2b6cd6' }];
      }
      this.highlight = -1;
      if (b.tool === 'erase') {
        const pt = b.cursor.shown ? [b.cursor.x, b.cursor.y] : this.hoverPt ? [this.hoverPt[0] / CELL, this.hoverPt[1] / CELL] : null;
        if (pt) this.highlight = b.partAt(pt[0], pt[1]);
      }
    }
    this.view.render(app.ctx, app.dpr, {
      mode: this.sim ? 'run' : 'build',
      builder: b,
      sim: this.sim,
      ghost,
      cursors,
      cb: app.settings.cb,
      reduced: app.reduced(),
      highlight: this.highlight,
    });
  }

  destroy() {
    windLoop(false);
    this.gestures.destroy();
    $('hud').hidden = true;
    $('result').hidden = true;
    $('pause').hidden = true;
    hideToast();
  }
}
