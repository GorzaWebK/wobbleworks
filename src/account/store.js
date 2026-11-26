// Inventor profiles, saved in this browser's localStorage. Several pupils can
// share one computer: each picks a username and gets their own stars,
// unlocked worlds, saved levels and settings.

const PROFILES_KEY = 'wobbleworks:profiles';
const SAVE_PREFIX = 'wobbleworks:save:';
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ID_RE = /^WW-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

export const DEFAULT_KEYS = {
  p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', rotL: 'KeyQ', rotR: 'KeyE', place: 'Space', part: 'KeyR', length: 'KeyF', undo: 'KeyX' },
  p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', rotL: 'Comma', rotR: 'Period', place: 'Enter', part: 'Slash', length: 'Quote', undo: 'Backspace' },
  go: 'KeyG',
  pause: 'Escape',
};

export function defaultSettings() {
  return {
    music: 0.45,
    sfx: 0.8,
    speed: 1,
    grid: true,
    cb: false,
    motion: 'auto', // auto | reduce | full
    keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
  };
}

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

export function randomId() {
  const b = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 8; i++) b[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32];
  return `WW-${s.slice(0, 4)}-${s.slice(4)}`;
}

// Usernames: letters, numbers, spaces and a few friendly symbols, 2–16 long.
export function cleanName(name) {
  return String(name ?? '')
    .replace(/[^\p{L}\p{N} _\-.!']/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

export function emptySave(id, name) {
  return {
    v: 1,
    id,
    name: cleanName(name) || 'Inventor',
    created: new Date().toISOString().slice(0, 10),
    stars: {}, // levelId: [finished, thrifty, sock] as 0/1
    best: {}, // levelId: { cost, build }
    builds: {}, // levelId: packed build in progress
    custom: [], // { id, name, code, updated }
    race: { p1: 0, p2: 0, draws: 0 },
    seenNotes: {},
    settings: defaultSettings(),
  };
}

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const LEVEL_ID = /^[a-z0-9-]{1,40}$/i;

// Tidy up a save from storage or an account code, so bad data can't break anything.
export function cleanSave(raw) {
  if (!isObj(raw) || !ID_RE.test(raw.id)) return null;
  const s = emptySave(raw.id, raw.name);
  if (typeof raw.created === 'string') s.created = raw.created.slice(0, 10);
  if (isObj(raw.stars)) {
    for (const [k, v] of Object.entries(raw.stars)) {
      if (LEVEL_ID.test(k) && Array.isArray(v)) s.stars[k] = [0, 1, 2].map((i) => (v[i] ? 1 : 0));
    }
  }
  if (isObj(raw.best)) {
    for (const [k, v] of Object.entries(raw.best)) {
      if (LEVEL_ID.test(k) && isObj(v) && typeof v.build === 'string' && v.build.length < 4000) {
        s.best[k] = { cost: Number(v.cost) || 0, build: v.build };
      }
    }
  }
  if (isObj(raw.builds)) {
    for (const [k, v] of Object.entries(raw.builds)) if (LEVEL_ID.test(k) && typeof v === 'string' && v.length < 4000) s.builds[k] = v;
  }
  if (Array.isArray(raw.custom)) {
    for (const c of raw.custom.slice(0, 60)) {
      if (isObj(c) && typeof c.code === 'string' && c.code.length < 3000 && typeof c.id === 'string') {
        s.custom.push({ id: c.id.slice(0, 40), name: String(c.name || 'My level').slice(0, 40), code: c.code, updated: Number(c.updated) || 0 });
      }
    }
  }
  if (isObj(raw.race)) for (const k of ['p1', 'p2', 'draws']) s.race[k] = Math.max(0, Number(raw.race[k]) || 0);
  if (isObj(raw.seenNotes)) for (const k of Object.keys(raw.seenNotes)) if (LEVEL_ID.test(k)) s.seenNotes[k] = 1;
  if (isObj(raw.settings)) {
    const d = s.settings;
    const r = raw.settings;
    const vol = (v, def) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : def);
    d.music = vol(r.music, d.music);
    d.sfx = vol(r.sfx, d.sfx);
    if ([0.5, 1, 1.5, 2].includes(+r.speed)) d.speed = +r.speed;
    if (typeof r.grid === 'boolean') d.grid = r.grid;
    if (typeof r.cb === 'boolean') d.cb = r.cb;
    if (['auto', 'reduce', 'full'].includes(r.motion)) d.motion = r.motion;
    if (isObj(r.keys)) {
      for (const who of ['p1', 'p2']) {
        if (!isObj(r.keys[who])) continue;
        for (const act of Object.keys(d.keys[who])) {
          const v = r.keys[who][act];
          if (typeof v === 'string' && /^[A-Za-z0-9]{1,20}$/.test(v)) d.keys[who][act] = v;
        }
      }
      for (const act of ['go', 'pause']) {
        const v = r.keys[act];
        if (typeof v === 'string' && /^[A-Za-z0-9]{1,20}$/.test(v)) d.keys[act] = v;
      }
    }
  }
  return s;
}

// ------------------------------------------------------------- profiles
export function listProfiles() {
  let p;
  try { p = JSON.parse(read(PROFILES_KEY) || 'null'); } catch { p = null; }
  if (!isObj(p) || !Array.isArray(p.ids)) p = { current: null, ids: [] };
  p.ids = p.ids.filter((id) => ID_RE.test(id));
  const list = [];
  for (const id of p.ids) {
    const s = loadSave(id);
    if (s) list.push({ id, name: s.name, stars: countStars(s) });
  }
  return { current: list.some((x) => x.id === p.current) ? p.current : null, list };
}

function saveProfiles(current, ids) {
  write(PROFILES_KEY, JSON.stringify({ current, ids }));
}

export function loadSave(id) {
  try { return cleanSave(JSON.parse(read(SAVE_PREFIX + id) || 'null')); } catch { return null; }
}

export function storeSave(save) {
  const ok = write(SAVE_PREFIX + save.id, JSON.stringify(save));
  const p = listProfiles();
  const ids = p.list.map((x) => x.id);
  if (!ids.includes(save.id)) ids.push(save.id);
  saveProfiles(p.current ?? save.id, ids);
  return ok;
}

export function createProfile(name) {
  const save = emptySave(randomId(), name);
  storeSave(save);
  setCurrent(save.id);
  return save;
}

export function setCurrent(id) {
  const p = listProfiles();
  saveProfiles(id, p.list.map((x) => x.id));
}

export function currentSave() {
  const p = listProfiles();
  return p.current ? loadSave(p.current) : null;
}

export function deleteProfile(id) {
  write(SAVE_PREFIX + id, null);
  const p = listProfiles();
  const ids = p.list.map((x) => x.id).filter((x) => x !== id);
  saveProfiles(p.current === id ? null : p.current, ids);
}

export function countStars(save) {
  let n = 0;
  for (const v of Object.values(save.stars)) n += v[0] + v[1] + v[2];
  return n;
}
