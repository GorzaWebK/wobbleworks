// Menu screens: username badge, the clipboard title, the sketchbook level
// select, settings and the account page.

import { app } from './app.js';
import { $, el, toast, dialog, wipe, starsText, download, copyText } from './dom.js';
import { listProfiles, createProfile, setCurrent, loadSave, storeSave, deleteProfile, cleanName, countStars, DEFAULT_KEYS } from '../account/store.js';
import { exportCode, parseCode } from '../account/code.js';
import { WORLDS, CUSTOM_THEME } from '../render/theme.js';
import { levelThumb } from '../render/thumbs.js';
import { worldUnlocked, levelUnlocked, UNLOCK_NEXT_WORLD } from '../levels/levels.js';
import { decodeLevel, encodeLevel } from '../levels/codec.js';
import { sfx } from '../audio/sfx.js';
import { WobLook } from '../render/wob.js';

let nav = null; // set by main.js: { title, levels, play, race, editor, settings, account, mylevels, playCustom, editCustom }
export function setNav(n) { nav = n; }

const SCREENS = ['scr-loading', 'scr-name', 'scr-title', 'scr-levels', 'scr-settings', 'scr-account'];

export function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('show', s === id);
  app.screen = id;
  const first = $(id)?.querySelector('[data-autofocus], .notes button, button.lvl-card:not(:disabled), input, button');
  setTimeout(() => first?.focus({ preventScroll: true }), 30);
}

export function hideScreens() {
  for (const s of SCREENS) $(s).classList.remove('show');
  app.screen = null;
}

// ---------------------------------------------------------------- names
const NAME_A = ['Captain', 'Professor', 'Doctor', 'Sir', 'Lady', 'Agent', 'Wobbly', 'Mega', 'Tiny', 'Super', 'Jolly', 'Sparky'];
const NAME_B = ['Sprocket', 'Gizmo', 'Bolt', 'Noodle', 'Jellybean', 'Widget', 'Cog', 'Pickle', 'Doodle', 'Spanner', 'Muffin', 'Wobble'];

export function randomName() {
  const a = NAME_A[Math.floor(Math.random() * NAME_A.length)];
  const b = NAME_B[Math.floor(Math.random() * NAME_B.length)];
  return `${a} ${b}`.slice(0, 16);
}

export function initNameScreen() {
  $('name-random').onclick = () => { $('name-input').value = randomName(); sfx.click(); };
  $('name-go').onclick = () => submitName();
  $('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitName(); });
  $('name-load').onclick = () => nav.account(true);
}

function submitName() {
  const raw = $('name-input').value;
  const name = cleanName(raw);
  if (name.length < 2) {
    $('name-error').textContent = 'Pick a name with at least 2 letters.';
    sfx.nope();
    return;
  }
  const save = createProfile(name);
  app.save = save;
  app.applyMotion();
  app.applyVolumes();
  sfx.coin();
  wipe(() => nav.title());
}

export function showNameScreen() {
  $('name-input').value = '';
  $('name-error').textContent = '';
  const p = listProfiles();
  $('name-existing').hidden = !p.list.length;
  const list = $('name-list');
  list.replaceChildren();
  for (const x of p.list) {
    list.append(el('button', {
      class: 'badge-chip', type: 'button', text: `${x.name} · ★${x.stars}`,
      onclick: () => { setCurrent(x.id); app.save = loadSave(x.id); app.applyMotion(); app.applyVolumes(); wipe(() => nav.title()); },
    }));
  }
  showScreen('scr-name');
}

// ---------------------------------------------------------------- title
let titleLook = null;
let titleRaf = 0;

export function showTitle() {
  const word = $('title-h');
  if (!word.childElementCount) {
    const colours = ['#4f9e12', '#ff8a1e', '#d43a83', '#2b6cd6'];
    [...'Wobbleworks'].forEach((ch, i) => {
      const s = el('span', { text: ch });
      s.style.color = colours[i % colours.length];
      s.style.animationDelay = `${i * 0.09}s`;
      word.append(s);
    });
  }
  $('title-name').textContent = app.save.name;
  const total = app.worlds.reduce((n, w) => n + w.levels.length * 3, 0);
  $('title-stars').textContent = `★ ${countStars(app.save)} of ${total} stars`;
  for (const b of document.querySelectorAll('#scr-title [data-go]')) {
    b.onclick = () => { sfx.click(); nav[b.dataset.go](); };
  }
  showScreen('scr-title');
  startTitleWob();
}

function startTitleWob() {
  cancelAnimationFrame(titleRaf);
  const c = $('title-wob');
  if (!c || getComputedStyle(c.parentElement).display === 'none') return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 260 * dpr;
  c.height = 260 * dpr;
  const ctx = c.getContext('2d');
  titleLook = titleLook || new WobLook('lime');
  let last = performance.now();
  let y = 0;
  let vy = 0;
  const floor = 150;
  const loop = (now) => {
    if (app.screen !== 'scr-title') return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const reduced = app.reduced();
    if (!reduced) {
      vy += 1400 * dt;
      y += vy * dt;
      if (y > 0) {
        y = 0;
        if (vy > 200) titleLook.hit(0, -1, vy * 1.2);
        vy = -620;
      }
    }
    titleLook.update(dt, 0, reduced ? 0 : vy * 0.3);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 260, 260);
    titleLook.draw(ctx, 130, floor + y + 30, 72, now / 900);
    titleRaf = requestAnimationFrame(loop);
  };
  titleRaf = requestAnimationFrame(loop);
  c.onclick = () => { titleLook.poke(2); titleLook.setMood('grin', 1); sfx.boing(1.1); };
}

// ---------------------------------------------------------- sketchbook
let bookTab = 0;
let bookMode = 'play'; // play | race

export function showLevels(mode = 'play', tab = null) {
  bookMode = mode;
  if (tab != null) bookTab = tab;
  if (mode === 'race' && bookTab === 4) bookTab = 0;
  renderTabs();
  renderPage();
  showScreen('scr-levels');
}

function renderTabs() {
  const tabs = $('book-tabs');
  tabs.replaceChildren();
  const items = [...WORLDS.map((w, i) => ({ i, name: w.name, c: w.tab, open: bookMode === 'race' || worldUnlocked(app.save, app.worlds, i) })), { i: 4, name: 'My Levels', c: CUSTOM_THEME.tab, open: true }];
  for (const it of items) {
    if (bookMode === 'race' && it.i === 4) continue;
    const b = el('button', { class: `tab ${it.i === bookTab ? 'on' : ''}`, type: 'button', text: it.name, 'aria-pressed': String(it.i === bookTab) });
    b.style.setProperty('--c', it.c);
    if (!it.open) { b.disabled = true; b.title = `Pass ${UNLOCK_NEXT_WORLD} puzzles in the world before to open this one`; }
    b.onclick = () => { bookTab = it.i; sfx.click(); renderTabs(); renderPage(); };
    tabs.append(b);
  }
}

function renderPage() {
  const custom = bookTab === 4;
  $('book-custom').hidden = !custom;
  $('book-grid').hidden = custom;
  const back = $('scr-levels').querySelector('[data-back]');
  back.onclick = () => { sfx.click(); wipe(() => nav.title()); };
  if (custom) return renderCustom();
  const w = app.worlds[bookTab];
  const th = WORLDS[bookTab];
  $('book-title').textContent = bookMode === 'race' ? `Race: ${w.name}` : `${bookTab + 1}. ${w.name}`;
  $('book-blurb').textContent = bookMode === 'race' ? 'Pick a puzzle to race on. Both players build at once!' : th.blurb;
  let got = 0;
  for (const L of w.levels) got += (app.save.stars[L.id] || [0, 0, 0]).reduce((a, b) => a + b, 0);
  $('book-stars').textContent = `★ ${got}/${w.levels.length * 3}`;
  const grid = $('book-grid');
  grid.replaceChildren();
  w.levels.forEach((L, li) => {
    const open = bookMode === 'race' ? (bookTab === 0 || worldUnlocked(app.save, app.worlds, bookTab)) : levelUnlocked(app.save, app.worlds, bookTab, li);
    const card = el('button', { class: 'lvl-card', type: 'button', 'aria-label': `Puzzle ${bookTab + 1}-${li + 1}, ${L.name}${open ? '' : ', locked'}` });
    card.append(levelThumb(L, 320, 180, !open));
    card.append(el('span', { class: 'n', text: `${li + 1}` }));
    const nm = el('span', { class: 'nm', text: L.name });
    const st = el('span', { class: 'st' });
    st.innerHTML = starsText(app.save.stars[L.id]);
    card.append(nm, st);
    if (!open) {
      card.disabled = true;
      card.append(el('span', { class: 'lock', text: bookMode === 'race' ? 'Open this world first' : 'Pass an earlier puzzle first' }));
    }
    card.onclick = () => { sfx.click(); if (bookMode === 'race') nav.raceLevel(L); else nav.play(L); };
    grid.append(card);
  });
}

function renderCustom() {
  $('book-title').textContent = 'My Levels';
  $('book-blurb').textContent = 'Levels you made in the editor, and ones friends shared with you.';
  $('book-stars').textContent = '';
  $('code-error').textContent = '';
  $('code-play').onclick = () => {
    try { const L = decodeLevel($('code-input').value); sfx.click(); nav.playCustom(L); } catch (e) { $('code-error').textContent = e.message; sfx.nope(); }
  };
  $('code-save').onclick = () => {
    try {
      const L = decodeLevel($('code-input').value);
      app.save.custom.unshift({ id: `c${Date.now().toString(36)}`, name: L.name, code: encodeLevel(L), updated: Date.now() });
      app.persist(true);
      $('code-input').value = '';
      sfx.coin();
      renderCustom();
      toast('Saved to My Levels!');
    } catch (e) { $('code-error').textContent = e.message; sfx.nope(); }
  };
  const grid = $('custom-grid');
  grid.replaceChildren();
  const newBtn = el('button', { class: 'sticky bubblegum empty-note', type: 'button', onclick: () => nav.editor() }, el('b', { text: '+ Make a new level' }));
  grid.append(newBtn);
  if (!app.save.custom.length) {
    grid.append(el('p', { class: 'sticky yellow empty-note', text: 'Nothing here yet. Make a level in the editor, or paste a friend\'s code above!' }));
    return;
  }
  for (const c of app.save.custom) {
    let L;
    try { L = decodeLevel(c.code); } catch { continue; }
    const card = el('div', { class: 'lvl-card' });
    const play = el('button', { class: 'lvl-card', type: 'button', 'aria-label': `Play ${c.name}`, onclick: () => nav.playCustom(L) });
    play.append(levelThumb(L, 320, 180), el('span', { class: 'nm', text: c.name }));
    card.append(play);
    const acts = el('div', { class: 'custom-actions' });
    acts.append(
      el('button', { class: 'jelly small lime', type: 'button', text: 'Play', onclick: () => nav.playCustom(L) }),
      el('button', { class: 'jelly small blue', type: 'button', text: 'Edit', onclick: () => nav.editCustom(c) }),
      el('button', { class: 'jelly small tangerine', type: 'button', text: 'Code', onclick: () => showShareCode(c.code) }),
      el('button', { class: 'jelly small bubblegum', type: 'button', text: 'Bin', onclick: async () => {
        const ok = await dialog('Bin this level?', `"${c.name}" will be gone for good (unless you kept its code).`, [{ text: 'Bin it', cls: 'bubblegum', value: true }, { text: 'Keep it', cls: 'lime', value: false }]);
        if (ok) { app.save.custom = app.save.custom.filter((x) => x !== c); app.persist(true); renderCustom(); }
      } }),
    );
    card.append(acts);
    grid.append(card);
  }
}

export async function showShareCode(code) {
  const box = el('div');
  const ta = el('textarea', { rows: '3', readonly: true, style: 'width:100%;font-family:ui-monospace,monospace;font-size:13px', 'aria-label': 'Level code' });
  ta.value = code;
  box.append(el('p', { text: 'Copy this code and give it to a friend. They paste it into My Levels to play your level.' }), ta);
  const res = await dialog('Share your level', box, [{ text: 'Copy code', cls: 'lime', value: 'copy' }, { text: 'Done', cls: '', value: null }]);
  if (res === 'copy') {
    const ok = await copyText(code);
    toast(ok ? 'Copied! Paste it anywhere.' : 'Select the code and copy it by hand.');
  }
}

// ------------------------------------------------------------ settings
let settingsBack = null;
export function showSettings(back) {
  settingsBack = back;
  const s = app.settings;
  $('scr-settings').querySelector('[data-back]').onclick = () => { sfx.click(); app.persist(true); settingsBack(); };
  const music = $('set-music');
  music.value = s.music;
  music.oninput = () => { s.music = +music.value; app.applyVolumes(); app.persist(); };
  const fxv = $('set-sfx');
  fxv.value = s.sfx;
  fxv.oninput = () => { s.sfx = +fxv.value; app.applyVolumes(); app.persist(); };
  fxv.onchange = () => sfx.boing();
  seg('set-speed', [[0.5, 'Slow'], [1, 'Normal'], [1.5, 'Quick'], [2, 'Zoomy']], () => s.speed, (v) => { s.speed = v; });
  seg('set-motion', [['auto', 'Like my device'], ['reduce', 'Less wobbly'], ['full', 'Full wobble']], () => s.motion, (v) => { s.motion = v; app.applyMotion(); });
  $('set-grid').checked = s.grid;
  $('set-grid').onchange = () => { s.grid = $('set-grid').checked; app.persist(); };
  $('set-cb').checked = s.cb;
  $('set-cb').onchange = () => { s.cb = $('set-cb').checked; app.persist(); };
  renderKeys();
  $('set-keys-reset').onclick = () => { s.keys = JSON.parse(JSON.stringify(DEFAULT_KEYS)); app.persist(); renderKeys(); toast('Keys reset'); };
  showScreen('scr-settings');
}

function seg(id, opts, get, set) {
  const box = $(id);
  box.replaceChildren();
  for (const [v, label] of opts) {
    const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(get() === v), text: label });
    b.onclick = () => { set(v); app.persist(); sfx.click(); seg(id, opts, get, set); };
    box.append(b);
  }
}

const KEY_ROWS = [
  ['up', 'Cursor up'], ['down', 'Cursor down'], ['left', 'Cursor left'], ['right', 'Cursor right'],
  ['rotL', 'Turn part left'], ['rotR', 'Turn part right'], ['place', 'Place / rub out'], ['part', 'Next part'], ['length', 'Change length'], ['undo', 'Undo'],
];

export function keyName(code) {
  if (!code) return '—';
  const map = { Space: 'Space', Enter: 'Enter', Escape: 'Esc', Comma: ',', Period: '.', Slash: '/', Quote: "'", Semicolon: ';', Backspace: 'Backspace', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Tab: 'Tab' };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

let listening = null;
function renderKeys() {
  const box = $('set-keys');
  box.replaceChildren();
  box.append(el('span'), el('span', { class: 'kh', text: 'Player 1' }), el('span', { class: 'kh', text: 'Player 2' }));
  const keys = app.settings.keys;
  const btn = (who, act) => {
    const code = who ? keys[who][act] : keys[act];
    const b = el('button', { type: 'button', text: keyName(code), 'aria-label': `${who || ''} ${act}: ${keyName(code)}. Press to change` });
    b.onclick = () => listen(b, who, act);
    return b;
  };
  for (const [act, label] of KEY_ROWS) box.append(el('span', { text: label }), btn('p1', act), btn('p2', act));
  box.append(el('span', { text: 'Go! (one player)' }), btn(null, 'go'), el('span'));
  box.append(el('span', { text: 'Pause' }), btn(null, 'pause'), el('span', { text: '(P works too)' }));
}

function listen(b, who, act) {
  if (listening) listening.cancel();
  b.classList.add('listening');
  b.textContent = 'press a key…';
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape' && !(who === null && act === 'pause')) { cancel(); return; }
    if (who) app.settings.keys[who][act] = e.code; else app.settings.keys[act] = e.code;
    app.persist();
    cancel();
    renderKeys();
  };
  const cancel = () => {
    document.removeEventListener('keydown', onKey, true);
    b.classList.remove('listening');
    listening = null;
    renderKeys();
  };
  listening = { cancel };
  document.addEventListener('keydown', onKey, true);
}

// -------------------------------------------------------------- account
let accountFromName = false;
export async function showAccount(fromName = false) {
  accountFromName = fromName;
  const s = app.save;
  $('scr-account').querySelector('[data-back]').onclick = () => { sfx.click(); wipe(() => (accountFromName && !app.save ? nav.name() : nav.title())); };
  $('acc-msg').textContent = '';
  $('acc-paste').value = '';
  const boxes = $('scr-account').querySelectorAll('.acc-box');
  $('scr-account').querySelector('.acc-badge').hidden = !s;
  boxes[0].hidden = !s;
  $('acc-delete').hidden = !s;
  if (s) {
    $('acc-name').textContent = s.name;
    $('acc-id').textContent = `ID ${s.id} · since ${s.created}`;
    $('acc-stars').textContent = `★ ${countStars(s)} stars`;
    $('acc-code').value = 'making your code…';
    exportCode(s).then((code) => { $('acc-code').value = code; });
  }
  $('acc-copy').onclick = async () => { const ok = await copyText($('acc-code').value); toast(ok ? 'Account code copied!' : 'Select the code and copy it by hand.'); };
  $('acc-download').onclick = async () => {
    const code = await exportCode(app.save);
    const safe = app.save.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'inventor';
    download(`wobbleworks-${safe}.txt`, `Wobbleworks account code for ${app.save.name}\nPaste it into Inventor account → Load progress.\n\n${code}\n`);
  };
  $('acc-load').onclick = () => loadCode($('acc-paste').value);
  $('acc-file').onchange = async () => {
    const f = $('acc-file').files[0];
    if (!f) return;
    const text = await f.text();
    const m = text.match(/WW1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}/);
    $('acc-file').value = '';
    loadCode(m ? m[0] : text);
  };
  $('acc-new').onclick = () => nav.name();
  $('acc-delete').onclick = async () => {
    const ok = await dialog('Delete this inventor?', `All of ${app.save.name}'s stars and levels on this computer will be deleted. Download the account code first if you want to keep them.`, [
      { text: 'Delete', cls: 'bubblegum', value: true }, { text: 'Keep', cls: 'lime', value: false },
    ]);
    if (!ok) return;
    deleteProfile(app.save.id);
    app.save = null;
    nav.name();
  };
  renderProfiles();
  showScreen('scr-account');
}

function renderProfiles() {
  const p = listProfiles();
  const list = $('acc-list');
  list.replaceChildren();
  for (const x of p.list) {
    list.append(el('button', {
      class: `badge-chip ${app.save && x.id === app.save.id ? 'on' : ''}`, type: 'button', text: `${x.name} · ★${x.stars}`,
      onclick: () => {
        setCurrent(x.id);
        app.save = loadSave(x.id);
        app.applyMotion();
        app.applyVolumes();
        toast(`Hello again, ${app.save.name}!`);
        showAccount(accountFromName);
      },
    }));
  }
}

async function loadCode(text) {
  const msg = $('acc-msg');
  try {
    const save = await parseCode(text);
    const p = listProfiles();
    const exists = p.list.find((x) => x.id === save.id);
    const ok = await dialog('Load this progress?', `${save.name} with ★ ${countStars(save)} stars.${exists ? ' This replaces the copy of this inventor already on this computer.' : ''}`, [
      { text: 'Load it', cls: 'lime', value: true }, { text: 'Cancel', cls: '', value: false },
    ]);
    if (!ok) return;
    storeSave(save);
    setCurrent(save.id);
    app.save = loadSave(save.id);
    app.applyMotion();
    app.applyVolumes();
    sfx.coin();
    msg.textContent = `Loaded! Welcome back, ${save.name}.`;
    showAccount(false);
    toast(`Welcome back, ${save.name}!`);
  } catch (e) {
    msg.textContent = e.message;
    sfx.nope();
  }
}
