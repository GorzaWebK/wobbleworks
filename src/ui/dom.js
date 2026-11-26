// Small DOM helpers: element lookup, toasts, a sticky-note dialog and the
// jelly-splat screen wipe.

import { app } from './app.js';

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}

let toastTimer = null;
export function toast(text, opts = {}) {
  const t = $('toast');
  t.replaceChildren(document.createTextNode(text));
  if (opts.button) {
    const b = el('button', { class: 'jelly small blue', type: 'button', text: opts.button.text });
    b.addEventListener('click', () => { hideToast(); opts.button.onClick(); });
    t.append(b);
  }
  t.classList.toggle('bad', !!opts.bad);
  t.classList.toggle('interactive', !!opts.button);
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, opts.time ?? (opts.button ? 5000 : 1800));
}

export function hideToast() {
  $('toast').classList.remove('show', 'interactive');
}

// A sticky-note dialog. buttons: [{ text, cls, value }]. Resolves with the value.
export function dialog(title, body, buttons) {
  return new Promise((resolve) => {
    const d = $('dialog');
    $('dlg-h').textContent = title;
    const b = $('dlg-body');
    b.replaceChildren();
    if (typeof body === 'string') b.append(el('p', { text: body }));
    else if (body) b.append(body);
    const row = $('dlg-buttons');
    row.replaceChildren();
    const done = (v) => {
      d.hidden = true;
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(null); }
    };
    for (const btn of buttons) {
      row.append(el('button', { class: `jelly ${btn.cls || ''}`, type: 'button', text: btn.text, onclick: () => done(btn.value) }));
    }
    d.hidden = false;
    document.addEventListener('keydown', onKey, true);
    row.querySelector('button')?.focus();
  });
}

// Jelly wipe: a lime blob fills the screen, the swap happens, then it squelches away.
let wiping = false;
export function wipe(swap) {
  const w = $('wipe');
  if (app.reduced() || wiping) {
    swap();
    return Promise.resolve();
  }
  wiping = true;
  return new Promise((resolve) => {
    w.className = 'wipe in';
    setTimeout(() => {
      try { swap(); } finally {
        w.className = 'wipe out';
        setTimeout(() => { w.className = 'wipe'; wiping = false; resolve(); }, 500);
      }
    }, 400);
  });
}

export function starIcon() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 64 64');
  s.innerHTML = '<path d="M32 5l8 17 19 2-14 13 4 19-17-10-17 10 4-19L5 24l19-2z"/>';
  return s;
}

export function starsText(arr) {
  const got = arr ? arr.reduce((a, b) => a + b, 0) : 0;
  return '★'.repeat(got) + '<i>' + '★'.repeat(3 - got) + '</i>';
}

export function download(name, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { style: 'position:fixed;left:-9999px' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
