// Little part pictures for the tray, drawn with the same code as the level.

import { drawPlank, drawRope, drawSpring, drawBalloon, drawWheel, drawSticky, drawBolt } from '../render/draw.js';
import { drawSockShape } from '../render/draw.js';
import { INK } from '../render/theme.js';

export function partIcon(type, w = 72, h = 40) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * dpr;
  c.height = h * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const s = h / 40;
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);
  switch (type) {
    case 'plank': drawPlank(ctx, -28, 6, 28, -6, 0, { seed: 4 }); break;
    case 'rope': drawRope(ctx, -28, -8, 28, -8, 64, 0, {}); break;
    case 'spring': drawSpring(ctx, -22, 4, 22, 4, 0, 0, {}); break;
    case 'balloon': ctx.translate(0, 26); ctx.scale(0.8, 0.8); drawBalloon(ctx, 0, 10, 0, 0, { reduced: true }); break;
    case 'wheel': drawWheel(ctx, 0, 0, 0.4); break;
    case 'sticky': ctx.scale(1.4, 1.4); drawSticky(ctx, 0, 0); break;
    case 'erase': eraser(ctx); break;
    case 'ground': block(ctx, '#'); break;
    case 'ramp': block(ctx, 'A'); break;
    case 'bolt': ctx.scale(1.6, 1.6); drawBolt(ctx, 0, 0, true); break;
    case 'start': blob(ctx); break;
    case 'flag': flag(ctx); break;
    case 'sock': drawSockShape(ctx, 0, 0, 1.1); break;
    case 'water': water(ctx); break;
    case 'wind': wind(ctx); break;
    case 'mover': mover(ctx); break;
    default:
  }
  return c;
}

function eraser(ctx) {
  ctx.rotate(-0.35);
  ctx.fillStyle = INK.bubblegum;
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.6;
  ctx.fillRect(-22, -9, 30, 18);
  ctx.strokeRect(-22, -9, 30, 18);
  ctx.fillStyle = '#7fb6ff';
  ctx.fillRect(8, -9, 14, 18);
  ctx.strokeRect(8, -9, 14, 18);
}

function block(ctx, t) {
  ctx.fillStyle = '#d8b688';
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  if (t === '#') ctx.rect(-14, -14, 28, 28);
  else { ctx.moveTo(14, -14); ctx.lineTo(14, 14); ctx.lineTo(-14, 14); ctx.closePath(); }
  ctx.fill();
  ctx.stroke();
}

function blob(ctx) {
  ctx.fillStyle = '#9cec4a';
  ctx.strokeStyle = '#3c7d0c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-1, -4, 4, 0, 7); ctx.arc(7, -4, 3.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(0, -4, 1.8, 0, 7); ctx.arc(8, -4, 1.6, 0, 7); ctx.fill();
}

function flag(ctx) {
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-8, 16); ctx.lineTo(-8, -16); ctx.stroke();
  ctx.fillStyle = INK.bubblegum;
  ctx.beginPath(); ctx.moveTo(-8, -16); ctx.lineTo(14, -9); ctx.lineTo(-8, -2); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 1.5; ctx.stroke();
}

function water(ctx) {
  ctx.fillStyle = 'rgba(110,176,222,.6)';
  ctx.fillRect(-24, -6, 48, 20);
  ctx.strokeStyle = '#3f7fae';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -24; x <= 24; x += 4) ctx.lineTo(x, -6 + Math.sin(x * 0.4) * 2);
  ctx.stroke();
}

function wind(ctx) {
  ctx.strokeStyle = INK.blue;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (const y of [-8, 2, 12]) {
    ctx.beginPath();
    ctx.moveTo(-22, y);
    ctx.quadraticCurveTo(0, y - 6, 16, y);
    ctx.moveTo(16, y); ctx.lineTo(10, y - 4);
    ctx.moveTo(16, y); ctx.lineTo(10, y + 4);
    ctx.stroke();
  }
}

function mover(ctx) {
  ctx.fillStyle = INK.wood;
  ctx.strokeStyle = INK.pencil;
  ctx.lineWidth = 1.8;
  ctx.fillRect(-20, -8, 26, 16);
  ctx.strokeRect(-20, -8, 26, 16);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = INK.blue;
  ctx.strokeRect(-2, -8, 26, 16);
  ctx.setLineDash([]);
}
