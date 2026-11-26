// Pointer gestures on the canvas: one finger or the mouse builds, two fingers
// pinch to zoom and drag to pan, the wheel zooms, right-click erases.

export class Gestures {
  constructor(el, h) {
    this.el = el;
    this.h = h;
    this.pts = new Map();
    this.mode = 'none'; // none | single | pinch
    this.lastPinch = null;
    this.on = {
      down: (e) => this.down(e),
      move: (e) => this.move(e),
      up: (e) => this.up(e),
      cancel: (e) => this.up(e, true),
      wheel: (e) => this.wheel(e),
      ctx: (e) => e.preventDefault(),
    };
    el.addEventListener('pointerdown', this.on.down);
    el.addEventListener('pointermove', this.on.move);
    el.addEventListener('pointerup', this.on.up);
    el.addEventListener('pointercancel', this.on.cancel);
    el.addEventListener('wheel', this.on.wheel, { passive: false });
    el.addEventListener('contextmenu', this.on.ctx);
  }

  destroy() {
    const el = this.el;
    el.removeEventListener('pointerdown', this.on.down);
    el.removeEventListener('pointermove', this.on.move);
    el.removeEventListener('pointerup', this.on.up);
    el.removeEventListener('pointercancel', this.on.cancel);
    el.removeEventListener('wheel', this.on.wheel);
    el.removeEventListener('contextmenu', this.on.ctx);
  }

  pos(e) {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  down(e) {
    if (e.button === 2) {
      e.preventDefault();
      const [x, y] = this.pos(e);
      this.h.secondary?.(x, y);
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const [x, y] = this.pos(e);
    this.pts.set(e.pointerId, { x, y });
    if (this.pts.size === 1) {
      this.mode = 'single';
      this.h.down?.(x, y, e);
    } else if (this.pts.size === 2) {
      // second finger: stop building, start pinching
      if (this.mode === 'single') this.h.cancel?.();
      this.mode = 'pinch';
      this.lastPinch = this.pinchInfo();
    }
  }

  pinchInfo() {
    const [a, b] = [...this.pts.values()];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }

  move(e) {
    const [x, y] = this.pos(e);
    if (!this.pts.has(e.pointerId)) {
      if (e.pointerType === 'mouse') this.h.hover?.(x, y);
      return;
    }
    this.pts.set(e.pointerId, { x, y });
    if (this.mode === 'single') this.h.move?.(x, y, e);
    else if (this.mode === 'pinch' && this.pts.size >= 2) {
      const p = this.pinchInfo();
      const l = this.lastPinch;
      this.h.pinch?.(p.d / l.d, p.cx, p.cy, p.cx - l.cx, p.cy - l.cy);
      this.lastPinch = p;
    }
  }

  up(e, cancelled = false) {
    if (!this.pts.has(e.pointerId)) return;
    const [x, y] = this.pos(e);
    this.pts.delete(e.pointerId);
    if (this.mode === 'single') {
      if (cancelled) this.h.cancel?.();
      else this.h.up?.(x, y, e);
      this.mode = 'none';
    } else if (this.mode === 'pinch' && this.pts.size < 2) {
      this.mode = this.pts.size ? 'pinch-end' : 'none';
    }
    if (!this.pts.size) this.mode = 'none';
  }

  wheel(e) {
    e.preventDefault();
    const [x, y] = this.pos(e);
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      this.h.pinch?.(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), x, y, 0, 0);
    } else {
      this.h.pinch?.(1, x, y, -e.deltaX, 0);
    }
  }
}
