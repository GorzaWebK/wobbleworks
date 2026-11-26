// Wobbleworks: start-up, navigation between screens, and the frame loop.

import { app } from './ui/app.js';
import { $, wipe, toast } from './ui/dom.js';
import { loadWorlds, findLevel } from './levels/levels.js';
import { listProfiles, loadSave } from './account/store.js';
import { unlock, suspend, resume } from './audio/engine.js';
import { stopMusic, startMusic } from './audio/music.js';
import { windLoop } from './audio/sfx.js';
import {
  setNav, showScreen, hideScreens, initNameScreen, showNameScreen, showTitle, showLevels, showSettings, showAccount,
} from './ui/screens.js';
import { Session } from './game/session.js';
import { Race } from './game/race.js';
import { Editor } from './editor/editor.js';
import { encodeLevel } from './levels/codec.js';

const MENU_MUSIC = { root: 60, tempo: 100, scale: 'major' };

function setController(c) {
  if (app.controller && app.controller !== c) app.controller.destroy?.();
  app.controller = c;
  if (c) hideScreens();
}

const nav = {
  name() { setController(null); showNameScreen(); },
  title() {
    setController(null);
    startMusic(MENU_MUSIC, 3);
    showTitle();
  },
  levels(tab) {
    wipe(() => { setController(null); startMusic(MENU_MUSIC, 3); showLevels('play', tab); });
  },
  mylevels() { nav.levels(4); },
  play(level) {
    wipe(() => {
      const s = new Session(level, {
        kind: 'campaign',
        onExit: () => { const f = findLevel(app.worlds, level.id); nav.levels(f ? f.wi : 0); },
        onNext: (nx) => nav.play(nx.level),
      });
      s.onSettings = () => nav.settingsFromGame(s);
      setController(s);
    });
  },
  playCustom(level, fromEditor = null) {
    wipe(() => {
      const s = new Session(level, {
        kind: fromEditor ? 'test' : 'custom',
        onExit: () => (fromEditor ? fromEditor() : nav.levels(4)),
      });
      s.onSettings = () => nav.settingsFromGame(s);
      setController(s);
    });
  },
  race() {
    wipe(() => { setController(null); showLevels('race', 0); });
  },
  raceLevel(level) {
    wipe(() => setController(new Race(level, { onExit: () => nav.race() })));
  },
  editor(custom = null) {
    wipe(() => {
      const ed = new Editor({
        custom,
        onExit: () => nav.levels(4),
        onTest: (level, back) => nav.playCustom(level, back),
      });
      setController(ed);
    });
  },
  editCustom(c) { nav.editor(c); },
  settings() {
    wipe(() => { setController(null); showSettings(() => wipe(() => nav.title())); });
  },
  settingsFromGame(session) {
    // settings on top of a paused level, then straight back to it
    const keep = app.controller;
    app.controller = null;
    $('hud').hidden = true;
    showSettings(() => {
      hideScreens();
      app.controller = keep;
      $('hud').hidden = false;
      session.resume();
      session.resize();
    });
  },
  account(fromName = false) {
    wipe(() => { setController(null); showAccount(fromName); });
  },
};

// ---------------------------------------------------------------- canvas
function resize() {
  const c = app.canvas;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const maxDpr = app.lowPower ? 1 : 2;
  app.dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  app.w = w;
  app.h = h;
  c.width = Math.round(w * app.dpr);
  c.height = Math.round(h * app.dpr);
  app.controller?.resize?.();
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let slowFrames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const c = app.controller;
  if (c) {
    c.update(dt);
    c.render();
    // weak computer? drop to a lighter canvas resolution
    if (!app.lowPower && dt > 0.034) {
      slowFrames++;
      if (slowFrames > 90) { app.lowPower = true; resize(); }
    } else if (slowFrames > 0) slowFrames--;
  }
  requestAnimationFrame(frame);
}

// --------------------------------------------------------------- keyboard
function onKey(e) {
  if (e.target.matches?.('input, textarea')) return;
  const c = app.controller;
  if (c && !$('dialog').hidden) return;
  if (c && c.keydown?.(e)) { e.preventDefault(); return; }
  if (!c && e.key === 'Escape') {
    const back = document.querySelector('.screen.show [data-back]');
    if (back) { e.preventDefault(); back.click(); }
  }
}

function pauseAll() {
  app.controller?.pause?.();
  windLoop(false);
  suspend();
}

// ----------------------------------------------------------------- start
async function boot() {
  app.canvas = $('stage');
  app.ctx = app.canvas.getContext('2d', { alpha: false });
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  document.addEventListener('keydown', onKey);
  // sound can only start after a tap or key press
  const wake = () => { if (unlock()) { app.applyVolumes(); } };
  document.addEventListener('pointerdown', wake, { capture: true });
  document.addEventListener('keydown', wake, { capture: true });
  // pause when the tab or window loses focus
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); else resume(); });
  window.addEventListener('blur', pauseAll);
  window.addEventListener('focus', () => resume());
  setNav(nav);
  initNameScreen();
  try {
    await Promise.race([document.fonts?.load('20px "Patrick Hand"'), new Promise((r) => setTimeout(r, 1500))]);
    await document.fonts?.load('20px "Permanent Marker"');
  } catch { /* fonts are optional */ }
  try {
    app.worlds = await loadWorlds();
  } catch (err) {
    $('scr-loading').querySelector('.loading-note').textContent = 'Could not load the puzzles. If you opened index.html straight from a folder, run a small local web server instead (see README).';
    console.error(err);
    return;
  }
  const p = listProfiles();
  app.save = p.current ? loadSave(p.current) : null;
  app.applyMotion();
  app.applyVolumes();
  requestAnimationFrame(frame);
  // handy links for testing: ?level=w1-3
  const params = new URLSearchParams(location.search);
  if (app.save && params.get('level')) {
    const f = findLevel(app.worlds, params.get('level'));
    if (f) { hideScreens(); setController(new Session(f.level, { kind: 'campaign', onExit: () => nav.levels(f.wi), onNext: (nx) => nav.play(nx.level) })); return; }
  }
  if (app.save) nav.title();
  else showNameScreen();
}

window.wobbleworks = { app, nav, encodeLevel, toast };
boot();
