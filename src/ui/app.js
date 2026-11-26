// Shared state for the whole app: the canvas, the loaded worlds, the current
// inventor's save, and which screen or controller is active.

import { storeSave } from '../account/store.js';
import { setVolumes } from '../audio/engine.js';

export const app = {
  worlds: [],
  save: null,
  canvas: null,
  ctx: null,
  dpr: 1,
  w: 0,
  h: 0,
  controller: null,
  screen: null,
  lowPower: false,

  get settings() {
    return this.save.settings;
  },

  reduced() {
    const m = this.save?.settings.motion || 'auto';
    if (m === 'reduce') return true;
    if (m === 'full') return false;
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  },

  applyMotion() {
    const m = this.save?.settings.motion || 'auto';
    document.documentElement.classList.toggle('reduce-motion', m === 'reduce');
    document.documentElement.classList.toggle('full-motion', m === 'full');
  },

  applyVolumes() {
    if (this.save) setVolumes(this.settings.sfx, this.settings.music);
  },

  _t: null,
  persist(now = false) {
    if (!this.save) return;
    clearTimeout(this._t);
    if (now) storeSave(this.save);
    else this._t = setTimeout(() => storeSave(this.save), 300);
  },
};
