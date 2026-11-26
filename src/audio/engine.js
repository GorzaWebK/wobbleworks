// Web Audio set-up. The context starts on the first tap or key press (browsers
// require a gesture), and everything else is generated in code: no audio files.

let ctx = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
const vols = { sfx: 0.8, music: 0.45 };

export function audio() {
  return ctx;
}

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  sfxBus = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus.connect(comp);
  musicBus.connect(comp);
  setVolumes(vols.sfx, vols.music);
  // one second of white noise, reused for every hiss and splash
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x3fffffff) - 1;
  }
  return ctx;
}

export function setVolumes(sfx, music) {
  vols.sfx = sfx;
  vols.music = music;
  if (!ctx) return;
  sfxBus.gain.setTargetAtTime(sfx * sfx * 0.9, ctx.currentTime, 0.03);
  musicBus.gain.setTargetAtTime(music * music * 0.5, ctx.currentTime, 0.05);
}

export function buses() {
  return { sfx: sfxBus, music: musicBus };
}

export function noise() {
  return noiseBuf;
}

export function suspend() {
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}

export function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}
