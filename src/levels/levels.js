// Loads the four worlds (JSON files in src/levels/data) and works out which
// levels are unlocked.

import { normalizeLevel } from './level.js';

export const WORLD_FILES = ['world1.json', 'world2.json', 'world3.json', 'world4.json'];
export const LEVELS_PER_WORLD = 8;
export const UNLOCK_NEXT_WORLD = 6; // levels passed in a world to open the next one

export async function loadWorlds(base = new URL('./data/', import.meta.url)) {
  const worlds = [];
  for (const f of WORLD_FILES) {
    const res = await fetch(new URL(f, base));
    if (!res.ok) throw new Error(`Could not load ${f}`);
    worlds.push(parseWorld(await res.json()));
  }
  return worlds;
}

export function parseWorld(raw) {
  return {
    n: raw.world,
    name: raw.name,
    levels: raw.levels.map((l, i) => normalizeLevel({ ...l, world: raw.world, id: l.id || `w${raw.world}-${i + 1}` })),
  };
}

const passed = (save, id) => !!save?.stars?.[id]?.[0];

export function worldUnlocked(save, worlds, wi) {
  if (wi === 0) return true;
  const prev = worlds[wi - 1];
  return prev.levels.filter((l) => passed(save, l.id)).length >= UNLOCK_NEXT_WORLD;
}

// Inside a world you can skip one level you're stuck on.
export function levelUnlocked(save, worlds, wi, li) {
  if (!worldUnlocked(save, worlds, wi)) return false;
  if (li <= 1) return true;
  const L = worlds[wi].levels;
  return passed(save, L[li - 1].id) || passed(save, L[li - 2].id);
}

export function findLevel(worlds, id) {
  for (let wi = 0; wi < worlds.length; wi++) {
    const li = worlds[wi].levels.findIndex((l) => l.id === id);
    if (li >= 0) return { wi, li, level: worlds[wi].levels[li] };
  }
  return null;
}

export function nextLevel(worlds, id) {
  const f = findLevel(worlds, id);
  if (!f) return null;
  if (f.li + 1 < worlds[f.wi].levels.length) return { wi: f.wi, li: f.li + 1, level: worlds[f.wi].levels[f.li + 1] };
  if (f.wi + 1 < worlds.length) return { wi: f.wi + 1, li: 0, level: worlds[f.wi + 1].levels[0] };
  return null;
}
