// A light background tune, made up as it plays: plucky ukulele-style chords,
// a bouncy bass, a marimba melody and a quiet shaker. Each world has its own
// key, tempo and mode. The melody comes from a seeded generator, so a world
// always has the same tune.

import { audio, buses, noise } from './engine.js';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
// chord roots as scale degrees
const PROGRESSIONS = [[0, 4, 5, 3], [0, 3, 4, 3], [0, 5, 3, 4]];

let timer = null;
let state = null;

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pluck(t, note, dur, vol, type = 'triangle', dest) {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = midi(note);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function marimba(t, note, vol, dest) {
  pluck(t, note, 0.35, vol, 'sine', dest);
  pluck(t, note + 24, 0.08, vol * 0.25, 'sine', dest);
}

function shaker(t, vol, dest) {
  const c = audio();
  const s = c.createBufferSource();
  s.buffer = noise();
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.8);
  s.stop(t + 0.07);
}

function makeSong(cfg, seed) {
  const r = rng(seed);
  const scale = SCALES[cfg.scale] || SCALES.major;
  const prog = PROGRESSIONS[Math.floor(r() * PROGRESSIONS.length)];
  // two 2-bar phrases, arranged A A B A
  const phrase = () => {
    const notes = [];
    let deg = 4 + Math.floor(r() * 3);
    for (let i = 0; i < 32; i++) {
      const onBeat = i % 4 === 0;
      if (r() < (onBeat ? 0.8 : 0.35)) {
        deg += Math.floor(r() * 5) - 2;
        deg = Math.max(0, Math.min(11, deg));
        notes.push(deg);
      } else notes.push(null);
    }
    return notes;
  };
  const A = phrase();
  const B = phrase();
  return { scale, prog, melody: [...A, ...A, ...B, ...A], root: cfg.root, tempo: cfg.tempo };
}

function degNote(song, deg, octave = 0) {
  const s = song.scale;
  const o = Math.floor(deg / 7);
  return song.root + s[((deg % 7) + 7) % 7] + 12 * (o + octave);
}

export function startMusic(cfg, seed = 1) {
  const c = audio();
  if (!c) return;
  const key = `${cfg.root}-${cfg.tempo}-${cfg.scale}-${seed}`;
  if (state && state.key === key) return;
  stopMusic();
  const song = makeSong(cfg, seed);
  state = { key, song, step: 0, next: c.currentTime + 0.15 };
  timer = setInterval(tick, 30);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
  state = null;
}

function tick() {
  const c = audio();
  if (!c || !state) return;
  if (c.state !== 'running') { state.next = c.currentTime + 0.1; return; }
  const dest = buses().music;
  const song = state.song;
  const stepDur = 60 / song.tempo / 4;
  while (state.next < c.currentTime + 0.12) {
    const t = state.next;
    const i = state.step;
    const bar = Math.floor(i / 16) % 8;
    const inBar = i % 16;
    const chordDeg = song.prog[Math.floor(bar / 2) % 4] + (bar % 2 ? 0 : 0);
    // bass on 1 and 3, a pick-up on the "and" of 4
    if (inBar === 0 || inBar === 8) pluck(t, degNote(song, chordDeg, -2), 0.3, 0.32, 'triangle', dest);
    if (inBar === 14) pluck(t, degNote(song, chordDeg + 4, -2), 0.15, 0.2, 'triangle', dest);
    // ukulele-ish strum on the off-beats
    if (inBar === 4 || inBar === 12 || inBar === 10) {
      [0, 2, 4, 7].forEach((d, k) => pluck(t + k * 0.012, degNote(song, chordDeg + d, -1 + (d === 7 ? 0 : 0)), 0.22, 0.07, 'triangle', dest));
    }
    // melody, 8th notes
    if (i % 2 === 0) {
      const m = song.melody[(i / 2) % song.melody.length];
      if (m !== null && m !== undefined) marimba(t, degNote(song, m, 0), 0.12, dest);
    }
    if (i % 2 === 1) shaker(t, inBar % 4 === 3 ? 0.05 : 0.025, dest);
    state.step = (i + 1) % (16 * 8);
    state.next += stepDur;
  }
}
