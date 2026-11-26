// Colours. Cream graph paper, blueprint-blue ink, pencil grey, and bright jelly.

export const INK = {
  paper: '#fbf5e4',
  grid: 'rgba(43, 108, 214, 0.13)',
  gridMajor: 'rgba(43, 108, 214, 0.26)',
  blue: '#2b6cd6',
  blueSoft: 'rgba(43, 108, 214, 0.55)',
  pencil: '#4a4f57',
  pencilSoft: 'rgba(74, 79, 87, 0.45)',
  lime: '#8ee03a',
  limeDeep: '#4f9e12',
  tangerine: '#ff8a1e',
  tangerineDeep: '#d0600a',
  bubblegum: '#ff5fa8',
  bubblegumDeep: '#d43a83',
  wood: '#e6bd7f',
  woodDeep: '#b9874a',
  card: '#d9b98a',
  metal: '#9aa1ad',
};

// One theme per world. `wash` tints the paper; `ground` fills the land.
export const WORLDS = [
  {
    n: 1, name: 'Workshop', blurb: 'Planks, rope and a lot of sawdust.',
    wash: '#fbe9d2', ground: '#d8b688', groundDeep: '#a8834f', groundLine: 'corrugated',
    tab: '#ff8a1e', music: { root: 60, tempo: 104, scale: 'major' },
  },
  {
    n: 2, name: 'Windy Cliffs', blurb: 'Springs, balloons and a breeze that never stops.',
    wash: '#e2f3ee', ground: '#b7c9ad', groundDeep: '#7f9878', groundLine: 'cracks',
    tab: '#2b6cd6', music: { root: 62, tempo: 112, scale: 'mixolydian' },
  },
  {
    n: 3, name: 'Soggy Swamp', blurb: 'Wheels, floating planks and bobbing logs.',
    wash: '#eaf0d1', ground: '#9d9561', groundDeep: '#6c6638', groundLine: 'mud',
    tab: '#8ee03a', music: { root: 57, tempo: 96, scale: 'dorian' },
  },
  {
    n: 4, name: 'Space Junkyard', blurb: 'Sticky pads, low gravity and drifting junk.',
    wash: '#e8e5f7', ground: '#aaa7c7', groundDeep: '#726f98', groundLine: 'rivets',
    tab: '#ff5fa8', music: { root: 65, tempo: 100, scale: 'lydian' },
  },
];

export const CUSTOM_THEME = {
  n: 0, name: 'My Levels', wash: '#f4f0e6', ground: '#cdbf9f', groundDeep: '#9a8a66', groundLine: 'corrugated',
  tab: '#8a6fd1', music: { root: 60, tempo: 108, scale: 'major' },
};

export function themeFor(level) {
  return WORLDS[level.world - 1] || CUSTOM_THEME;
}

// Stress colours: green → yellow → red, or a colour-blind friendly blue → orange
// ramp that also gets hatching (see render/draw.js).
export function stressColour(s, cb) {
  const t = Math.max(0, Math.min(1, s));
  if (cb) {
    if (t < 0.5) return lerpRgb([60, 130, 230], [245, 200, 40], t * 2);
    return lerpRgb([245, 200, 40], [220, 90, 20], (t - 0.5) * 2);
  }
  if (t < 0.5) return lerpRgb([70, 190, 60], [250, 205, 30], t * 2);
  return lerpRgb([250, 205, 30], [230, 50, 40], (t - 0.5) * 2);
}

function lerpRgb(a, b, t) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
