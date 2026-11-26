// The level editor: paint ground and ramps, add bolts, the start, the flag and
// the sock, drag out water, wind and moving blocks, choose the budget and the
// parts, then test it, save it to My Levels, or share it as a level code.

import { app } from '../ui/app.js';
import { $, el, toast, dialog } from '../ui/dom.js';
import { partIcon } from '../ui/icons.js';
import { showShareCode } from '../ui/screens.js';
import { Gestures } from '../game/input.js';
import { normalizeLevel, terrainFor } from '../levels/level.js';
import { encodeLevel, decodeLevel } from '../levels/codec.js';
import { PARTS, PART_ORDER } from '../game/parts.js';
import { LevelView } from '../game/view.js';
import { CELL } from '../physics/consts.js';
import { drawBolt } from '../render/draw.js';
import { INK } from '../render/theme.js';
import { sfx } from '../audio/sfx.js';
import { startMusic } from '../audio/music.js';
import { CUSTOM_THEME } from '../render/theme.js';

const W = 32;
const H = 18;
const TOOLS = [
  ['ground', 'Ground'], ['ramp', 'Ramp'], ['bolt', 'Bolt'], ['start', 'Start'], ['flag', 'Flag'], ['sock', 'Sock'],
  ['water', 'Water'], ['wind', 'Wind'], ['mover', 'Mover'], ['erase', 'Rubber'],
];
const RAMPS = [['A', '◢'], ['B', '◣'], ['C', '◥'], ['D', '◤']];
const WINDS = { right: [700, 0], left: [-700, 0], up: [0, -1500], down: [0, 900] };

let draft = null; // survives a test run

function blankLevel() {
  const tiles = [];
  for (let r = 0; r < H; r++) tiles.push(r >= 12 ? (r === 12 || r > 12 ? '##########..........############' : '') : '.'.repeat(W));
  return {
    name: 'My level', tiles, start: [2, 11], flag: [28, 11], sock: [16, 6],
    anchors: [[10, 12], [20, 12]], budget: 60, par: 30, parts: ['plank', 'rope'], water: [], wind: [], movers: [], gravity: 1,
  };
}

export class Editor {
  constructor({ custom, onExit, onTest }) {
    this.onExit = onExit;
    this.onTest = onTest;
    if (custom) {
      let L;
      try { L = decodeLevel(custom.code); } catch { L = null; }
      this.raw = L ? toRaw(L) : blankLevel();
      this.savedId = custom.id;
    } else if (draft) {
      this.raw = draft.raw;
      this.savedId = draft.savedId;
    } else {
      this.raw = blankLevel();
      this.savedId = null;
    }
    draft = null;
    this.past = [];
    this.future = [];
    this.tool = 'ground';
    this.ramp = 'A';
    this.sel = null; // { kind: 'wind'|'mover'|'water', i }
    this.drag = null;
    this.hover = null;
    this.refresh();
    this.view = new LevelView(this.level, 'lime');
    this.gestures = new Gestures(app.canvas, this.handlers());
    $('editor-ui').hidden = false;
    this.mountUi();
    this.resize();
    startMusic(CUSTOM_THEME.music, 5);
  }

  refresh() {
    this.level = normalizeLevel({ ...this.raw, id: 'edit', world: 0 });
    if (this.view) this.view.setLevel(this.level);
  }

  snapshot() {
    this.past.push(JSON.stringify(this.raw));
    if (this.past.length > 100) this.past.shift();
    this.future.length = 0;
  }

  undo() {
    if (!this.past.length) return;
    this.future.push(JSON.stringify(this.raw));
    this.raw = JSON.parse(this.past.pop());
    this.sel = null;
    this.refresh();
    this.renderPanel();
  }

  redo() {
    if (!this.future.length) return;
    this.past.push(JSON.stringify(this.raw));
    this.raw = JSON.parse(this.future.pop());
    this.refresh();
    this.renderPanel();
  }

  // ------------------------------------------------------------------ UI
  mountUi() {
    const tray = $('ed-tray');
    tray.replaceChildren();
    for (const [t, name] of TOOLS) {
      const b = el('button', { class: `part-btn ${t === 'erase' ? 'erase' : ''}`, type: 'button', 'data-tool': t, 'aria-label': name });
      b.append(partIcon(t === 'erase' ? 'erase' : t, 72, 34), el('span', { class: 'nm', text: name }));
      b.onclick = () => { this.tool = t; sfx.click(); this.refreshTray(); this.renderPanel(); };
      tray.append(b);
    }
    this.refreshTray();
    const on = (id, fn) => { $(id).onclick = () => { sfx.click(); fn(); }; };
    on('ed-undo', () => this.undo());
    on('ed-redo', () => this.redo());
    on('ed-test', () => this.test());
    on('ed-save', () => this.saveLevel());
    on('ed-share', () => this.share());
    on('ed-new', async () => {
      const ok = await dialog('Start a new level?', 'Anything you have not saved will be lost.', [{ text: 'New level', cls: 'tangerine', value: true }, { text: 'Keep editing', cls: 'lime', value: false }]);
      if (ok) { this.snapshot(); this.raw = blankLevel(); this.savedId = null; this.refresh(); this.renderPanel(); }
    });
    on('ed-exit', () => this.exit());
    this.renderPanel();
  }

  refreshTray() {
    for (const b of $('ed-tray').querySelectorAll('.part-btn')) b.classList.toggle('on', b.dataset.tool === this.tool);
  }

  renderPanel() {
    const p = $('ed-panel');
    const R = this.raw;
    const kids = [el('h4', { text: '· LEVEL SETTINGS ·' })];
    const name = el('input', { type: 'text', maxlength: '30', value: R.name, 'aria-label': 'Level name' });
    name.oninput = () => { R.name = name.value.slice(0, 30); this.refresh(); };
    kids.push(el('label', { text: 'Name' }), name);
    const num = (label, key, min, max) => {
      const i = el('input', { type: 'number', min: String(min), max: String(max), step: '5', value: String(R[key]), 'aria-label': label });
      i.onchange = () => { this.snapshot(); R[key] = Math.max(min, Math.min(max, Math.round(+i.value || 0))); if (key === 'budget' && R.par > R.budget) R.par = R.budget; this.refresh(); this.renderPanel(); };
      return [el('label', { text: label }), i];
    };
    kids.push(...num('Budget (coins)', 'budget', 0, 999), ...num('Thrifty star at…', 'par', 0, 999));
    kids.push(el('label', { text: 'Parts allowed' }));
    const box = el('div', { class: 'parts-check' });
    for (const t of PART_ORDER) {
      const c = el('input', { type: 'checkbox' });
      c.checked = R.parts.includes(t);
      c.onchange = () => {
        this.snapshot();
        R.parts = PART_ORDER.filter((x) => (x === t ? c.checked : R.parts.includes(x)));
        if (!R.parts.length) R.parts = ['plank'];
        this.refresh();
        this.renderPanel();
      };
      box.append(el('label', {}, c, document.createTextNode(PARTS[t].name)));
    }
    kids.push(box);
    kids.push(el('label', { text: 'Gravity' }), this.seg([[1, 'Normal'], [0.4, 'Moon']], () => R.gravity, (v) => { this.snapshot(); R.gravity = v; this.refresh(); }));
    if (this.tool === 'ramp') {
      kids.push(el('label', { text: 'Ramp shape (R to turn)' }), this.seg(RAMPS.map(([k, s]) => [k, s]), () => this.ramp, (v) => { this.ramp = v; }));
    }
    const help = {
      ground: 'Click or drag to paint ground. Wob rolls on it.',
      ramp: 'Paint slopes. Wob can roll down them, but 45° is too steep to roll up.',
      bolt: 'Click a grid corner to add or remove a bolt. Players fix parts to bolts.',
      start: 'Click where Wob starts. It needs ground under it.',
      flag: 'Click where the goal flag goes. It needs ground under it.',
      sock: 'Click to hide the sock. Click the sock again to remove it.',
      water: 'Drag a box to fill it with water. Wob hates getting wet!',
      wind: 'Drag a box of wind. Pick its direction below.',
      mover: 'Drag a box to make a moving block, then set how it moves below.',
      erase: 'Click anything to rub it out.',
    };
    kids.push(el('p', { class: 'par', text: help[this.tool] }));
    if (this.sel) kids.push(this.selPanel());
    p.replaceChildren(...kids);
  }

  seg(opts, get, set) {
    const box = el('div', { class: 'seg' });
    for (const [v, label] of opts) {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(get() === v), text: label });
      b.onclick = () => { set(v); sfx.click(); this.renderPanel(); };
      box.append(b);
    }
    return box;
  }

  selPanel() {
    const R = this.raw;
    const { kind, i } = this.sel;
    const box = el('div', { class: 'sel' });
    const obj = R[kind === 'mover' ? 'movers' : kind][i];
    if (!obj) { this.sel = null; return box; }
    if (kind === 'wind') {
      box.append(el('b', { text: 'This wind blows' }));
      const dir = obj.fx > 0 ? 'right' : obj.fx < 0 ? 'left' : obj.fy < 0 ? 'up' : 'down';
      box.append(this.seg([['left', '←'], ['right', '→'], ['up', '↑'], ['down', '↓']], () => dir, (v) => { this.snapshot(); [obj.fx, obj.fy] = WINDS[v]; this.refresh(); }));
      const mag = Math.hypot(obj.fx, obj.fy);
      const base = Math.hypot(...WINDS[dir]);
      box.append(el('b', { text: 'Strength' }), this.seg([[0.6, 'Breeze'], [1, 'Windy'], [1.4, 'Gale']], () => Math.round((mag / base) * 10) / 10, (v) => {
        this.snapshot();
        const [fx, fy] = WINDS[dir];
        obj.fx = fx * v; obj.fy = fy * v;
        this.refresh();
      }));
    }
    if (kind === 'mover') {
      box.append(el('b', { text: 'Moving block travels' }));
      const step = (label, key, d) => el('button', { type: 'button', text: label, onclick: () => { this.snapshot(); obj[key] = Math.max(-12, Math.min(12, obj[key] + d)); this.refresh(); this.renderPanel(); } });
      box.append(el('div', { class: 'steps' }, el('span', { text: `across ${obj.dx}` }), step('−', 'dx', -1), step('+', 'dx', 1)));
      box.append(el('div', { class: 'steps' }, el('span', { text: `down ${obj.dy}` }), step('−', 'dy', -1), step('+', 'dy', 1)));
      box.append(el('b', { text: 'Speed' }), this.seg([[7, 'Slow'], [4, 'Medium'], [2.5, 'Fast']], () => obj.period, (v) => { this.snapshot(); obj.period = v; this.refresh(); }));
    }
    if (kind === 'water') box.append(el('b', { text: 'Water selected' }));
    box.append(el('button', { class: 'jelly small bubblegum', type: 'button', text: 'Delete it', onclick: () => {
      this.snapshot();
      R[kind === 'mover' ? 'movers' : kind].splice(i, 1);
      this.sel = null;
      this.refresh();
      this.renderPanel();
    } }));
    return box;
  }

  // --------------------------------------------------------------- input
  handlers() {
    const cellOf = (x, y) => {
      const [wx, wy] = this.view.cam.toWorld(x, y);
      return [wx / CELL, wy / CELL];
    };
    return {
      down: (x, y) => {
        const [cx, cy] = cellOf(x, y);
        this.pointerDown(cx, cy);
      },
      move: (x, y) => {
        const [cx, cy] = cellOf(x, y);
        this.hover = [cx, cy];
        this.pointerMove(cx, cy);
      },
      up: (x, y) => {
        const [cx, cy] = cellOf(x, y);
        this.pointerUp(cx, cy);
      },
      cancel: () => { this.drag = null; },
      hover: (x, y) => { this.hover = cellOf(x, y); },
      secondary: (x, y) => { const [cx, cy] = cellOf(x, y); this.snapshot(); this.eraseAt(cx, cy); },
      pinch: (k, cx, cy, dx, dy) => {
        const cam = this.view.cam;
        if (dx || dy) cam.pan(dx, dy);
        if (k !== 1) cam.zoomAt(cx, cy, k);
      },
    };
  }

  inside(c, r) {
    return c >= 0 && r >= 0 && c < W && r < H;
  }

  setTile(c, r, ch) {
    if (!this.inside(c, r)) return false;
    const row = this.raw.tiles[r];
    if (row[c] === ch) return false;
    this.raw.tiles[r] = row.slice(0, c) + ch + row.slice(c + 1);
    return true;
  }

  pointerDown(cx, cy) {
    const t = this.tool;
    const c = Math.floor(cx);
    const r = Math.floor(cy);
    const R = this.raw;
    this.snapshot();
    if (t === 'ground' || t === 'ramp') {
      this.drag = { paint: t === 'ground' ? '#' : this.ramp };
      if (this.setTile(c, r, this.drag.paint)) { this.refresh(); sfx.place(); }
      return;
    }
    if (t === 'erase') {
      this.drag = { erase: true };
      this.eraseAt(cx, cy);
      return;
    }
    if (t === 'bolt') {
      const x = Math.round(cx);
      const y = Math.round(cy);
      const i = R.anchors.findIndex(([ax, ay]) => ax === x && ay === y);
      if (i >= 0) { R.anchors.splice(i, 1); sfx.erase(); } else if (R.anchors.length < 60) { R.anchors.push([x, y]); sfx.place('sticky'); }
      this.refresh();
      return;
    }
    if (t === 'start' || t === 'flag') {
      if (!this.inside(c, r)) return;
      R[t] = [c, r];
      sfx.place();
      this.refresh();
      return;
    }
    if (t === 'sock') {
      if (R.sock && R.sock[0] === c && R.sock[1] === r) R.sock = null;
      else if (this.inside(c, r)) R.sock = [c, r];
      sfx.place();
      this.refresh();
      return;
    }
    if (t === 'water' || t === 'wind' || t === 'mover') {
      // click on an existing one selects it, otherwise drag out a new box
      const hit = this.objectAt(cx, cy, t);
      if (hit) { this.sel = hit; this.past.pop(); this.renderPanel(); return; }
      this.drag = { box: t, a: [c, r], b: [c, r] };
    }
  }

  pointerMove(cx, cy) {
    const d = this.drag;
    if (!d) return;
    const c = Math.floor(cx);
    const r = Math.floor(cy);
    if (d.paint) { if (this.setTile(c, r, d.paint)) this.refresh(); }
    else if (d.erase) this.eraseAt(cx, cy, true);
    else if (d.box) d.b = [Math.max(0, Math.min(W - 1, c)), Math.max(0, Math.min(H - 1, r))];
  }

  pointerUp() {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.box) return;
    const R = this.raw;
    const x = Math.min(d.a[0], d.b[0]);
    const y = Math.min(d.a[1], d.b[1]);
    const w = Math.abs(d.a[0] - d.b[0]) + 1;
    const h = Math.abs(d.a[1] - d.b[1]) + 1;
    if (d.box === 'water') {
      if (R.water.length >= 12) return toast('That is plenty of water!');
      R.water.push({ x, y: y + 0.5, w, h: h - 0.5 || 0.5 });
      this.sel = { kind: 'water', i: R.water.length - 1 };
    } else if (d.box === 'wind') {
      if (R.wind.length >= 12) return toast('That is plenty of wind!');
      R.wind.push({ x, y, w, h, fx: 700, fy: 0 });
      this.sel = { kind: 'wind', i: R.wind.length - 1 };
    } else {
      if (R.movers.length >= 12) return toast('That is plenty of moving blocks!');
      R.movers.push({ x, y, w, h: Math.min(h, 2), dx: 0, dy: -3, period: 4, phase: 0 });
      this.sel = { kind: 'mover', i: R.movers.length - 1 };
    }
    sfx.place('spring');
    this.refresh();
    this.renderPanel();
  }

  objectAt(cx, cy, only = null) {
    const R = this.raw;
    const inRect = (o) => cx >= o.x && cx <= o.x + o.w && cy >= o.y && cy <= o.y + o.h;
    if (!only || only === 'mover') { const i = R.movers.findIndex(inRect); if (i >= 0) return { kind: 'mover', i }; }
    if (!only || only === 'wind') { const i = R.wind.findIndex(inRect); if (i >= 0) return { kind: 'wind', i }; }
    if (!only || only === 'water') { const i = R.water.findIndex(inRect); if (i >= 0) return { kind: 'water', i }; }
    return null;
  }

  eraseAt(cx, cy, quiet = false) {
    const R = this.raw;
    const bi = R.anchors.findIndex(([x, y]) => Math.hypot(x - cx, y - cy) < 0.35);
    if (bi >= 0) { R.anchors.splice(bi, 1); this.done(quiet); return; }
    if (R.sock && Math.floor(cx) === R.sock[0] && Math.floor(cy) === R.sock[1]) { R.sock = null; this.done(quiet); return; }
    const o = this.objectAt(cx, cy);
    if (o) {
      R[o.kind === 'mover' ? 'movers' : o.kind].splice(o.i, 1);
      this.sel = null;
      this.renderPanel();
      this.done(quiet);
      return;
    }
    if (this.setTile(Math.floor(cx), Math.floor(cy), '.')) this.done(true);
  }

  done(quiet) {
    if (!quiet) sfx.erase();
    this.refresh();
  }

  keydown(e) {
    const code = e.code;
    if ((e.ctrlKey || e.metaKey) && code === 'KeyZ') { if (e.shiftKey) this.redo(); else this.undo(); return true; }
    if ((e.ctrlKey || e.metaKey) && code === 'KeyY') { this.redo(); return true; }
    if (code === 'KeyR' && this.tool === 'ramp') {
      const i = RAMPS.findIndex(([k]) => k === this.ramp);
      this.ramp = RAMPS[(i + 1) % RAMPS.length][0];
      this.renderPanel();
      return true;
    }
    if (/^Digit[0-9]$/.test(code)) {
      const n = Number(code.slice(5));
      const t = TOOLS[(n + 9) % 10];
      if (t) { this.tool = t[0]; this.refreshTray(); this.renderPanel(); }
      return true;
    }
    if (code === 'Escape') { this.exit(); return true; }
    return false;
  }

  // -------------------------------------------------------------- actions
  problems() {
    const L = this.level;
    const T = terrainFor(L);
    const out = [];
    const onGround = ([c, r]) => !T.solidAt((c + 0.5) * CELL, (r + 0.5) * CELL) && T.solidAt((c + 0.5) * CELL, (r + 1.2) * CELL);
    if (!onGround(L.start)) out.push('Wob\'s start needs empty space with ground right underneath.');
    if (!onGround(L.flag)) out.push('The flag needs empty space with ground right underneath.');
    if (Math.abs(L.start[0] - L.flag[0]) + Math.abs(L.start[1] - L.flag[1]) < 4) out.push('The flag is very close to the start!');
    return out;
  }

  async test() {
    const probs = this.problems();
    if (probs.length) { toast(probs[0], { bad: true, time: 3500 }); sfx.nope(); return; }
    draft = { raw: JSON.parse(JSON.stringify(this.raw)), savedId: this.savedId };
    const level = normalizeLevel({ ...this.raw, id: 'test', world: 0 });
    this.onTest(level, () => {
      // back from testing: reopen the editor with the same draft
      window.wobbleworks.nav.editor(null);
    });
  }

  saveLevel() {
    const probs = this.problems();
    if (probs.length) { toast(probs[0], { bad: true, time: 3500 }); sfx.nope(); return null; }
    const code = encodeLevel(this.level);
    const list = app.save.custom;
    let entry = this.savedId && list.find((c) => c.id === this.savedId);
    if (entry) {
      entry.code = code;
      entry.name = this.raw.name;
      entry.updated = Date.now();
    } else {
      if (list.length >= 60) { toast('My Levels is full. Bin an old one first.', { bad: true }); return null; }
      entry = { id: `c${Date.now().toString(36)}`, name: this.raw.name, code, updated: Date.now() };
      list.unshift(entry);
      this.savedId = entry.id;
    }
    app.persist(true);
    sfx.coin();
    toast('Saved to My Levels!');
    return code;
  }

  share() {
    const probs = this.problems();
    if (probs.length) { toast(probs[0], { bad: true, time: 3500 }); sfx.nope(); return; }
    showShareCode(encodeLevel(this.level));
  }

  async exit() {
    const ok = await dialog('Leave the editor?', 'Save first if you want to keep this level.', [
      { text: 'Save and leave', cls: 'lime', value: 'save' }, { text: 'Leave', cls: 'tangerine', value: 'leave' }, { text: 'Stay', cls: '', value: null },
    ]);
    if (ok === 'save') { if (this.saveLevel()) this.onExit(); } else if (ok === 'leave') this.onExit();
  }

  // ------------------------------------------------------------- frame
  update(dt) {
    this.view.update(dt, null);
  }

  render() {
    const v = this.view;
    v.render(app.ctx, app.dpr, { mode: 'build', builder: { build: { parts: [] } }, cb: false, reduced: app.reduced() });
    // editor extras: hovered cell, the box being dragged, selection
    const ctx = app.ctx;
    ctx.save();
    v.cam.apply(ctx, app.dpr);
    ctx.lineWidth = 2;
    if (this.hover && !this.drag) {
      const [cx, cy] = this.hover;
      if (this.tool === 'bolt') drawBolt(ctx, Math.round(cx) * CELL, Math.round(cy) * CELL, true);
      else {
        ctx.strokeStyle = INK.tangerine;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(Math.floor(cx) * CELL, Math.floor(cy) * CELL, CELL, CELL);
        ctx.setLineDash([]);
      }
    }
    const d = this.drag;
    if (d && d.box) {
      const x = Math.min(d.a[0], d.b[0]);
      const y = Math.min(d.a[1], d.b[1]);
      ctx.strokeStyle = INK.blue;
      ctx.fillStyle = 'rgba(43,108,214,0.12)';
      ctx.fillRect(x * CELL, y * CELL, (Math.abs(d.a[0] - d.b[0]) + 1) * CELL, (Math.abs(d.a[1] - d.b[1]) + 1) * CELL);
      ctx.strokeRect(x * CELL, y * CELL, (Math.abs(d.a[0] - d.b[0]) + 1) * CELL, (Math.abs(d.a[1] - d.b[1]) + 1) * CELL);
    }
    if (this.sel) {
      const o = this.raw[this.sel.kind === 'mover' ? 'movers' : this.sel.kind][this.sel.i];
      if (o) {
        ctx.strokeStyle = INK.bubblegum;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(o.x * CELL - 3, o.y * CELL - 3, o.w * CELL + 6, o.h * CELL + 6);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  resize() {
    const cam = this.view.cam;
    cam.setView(0, 0, app.w, app.h);
    const tray = $('ed-tray').getBoundingClientRect();
    const panel = $('ed-panel').getBoundingClientRect();
    cam.fit(this.level, { l: Math.max(0, tray.right) + 6, r: Math.max(8, app.w - panel.left + 6), t: 10, b: 66 });
  }

  pause() {}

  destroy() {
    this.gestures.destroy();
    $('editor-ui').hidden = true;
  }
}

function toRaw(L) {
  return {
    name: L.name, tiles: [...L.tiles], start: [...L.start], flag: [...L.flag], sock: L.sock ? [...L.sock] : null,
    anchors: L.anchors.map((a) => [...a]), budget: L.budget, par: L.par, parts: [...L.parts],
    water: L.water.map((o) => ({ ...o })), wind: L.wind.map((o) => ({ ...o })), movers: L.movers.map((o) => ({ ...o })), gravity: L.gravity,
  };
}
