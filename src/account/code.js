// Account codes: everything one inventor has saved, packed into a single line
// of text they can copy, or download as a file, and load on another device.
//
// This is the same format as Foundry Arena's and Fossil Fixers' account codes,
// so it works the same way across the Gorza games:
//   WW1.<payload>.<8 hex checksum>
//   payload  = "z" + base64url(deflate-raw(JSON)) when the browser can compress,
//              "j" + base64url(JSON) when it can't
//   checksum = FNV-1a of the payload, so a half-copied code is caught.
// There is no server: the code itself carries the data.

import { cleanSave } from './store.js';

export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export async function exportCode(save) {
  const json = JSON.stringify({ v: 1, saved: new Date().toISOString(), save });
  const raw = new TextEncoder().encode(json);
  let body;
  if (canZip()) {
    try { body = 'z' + toB64url(await pipe(raw, new CompressionStream('deflate-raw'))); } catch { body = null; }
  }
  if (!body) body = 'j' + toB64url(raw);
  return `WW1.${body}.${fnv(body)}`;
}

// Read an account code. Throws an Error with a message for the player if it's no good.
export async function parseCode(text) {
  const code = String(text || '').replace(/\s+/g, '');
  if (!code) throw new Error('Paste your account code first.');
  const m = /^WW1\.([zj][A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(code);
  if (!m) throw new Error("That isn't a Wobbleworks account code. It starts with WW1. Copy all of it.");
  if (fnv(m[1]) !== m[2]) throw new Error('That code is damaged or incomplete. Copy the whole code again.');
  let bytes;
  try { bytes = fromB64url(m[1].slice(1)); } catch { throw new Error('That code is damaged. Copy the whole code again.'); }
  if (m[1][0] === 'z') {
    if (!canZip()) throw new Error('This browser is too old to read that code. Update it and try again.');
    try { bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); } catch { throw new Error('That code is damaged. Copy the whole code again.'); }
  }
  let obj;
  try { obj = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('That code is damaged. Copy the whole code again.'); }
  if (!obj || obj.v !== 1) throw new Error('That account code is from an unknown version.');
  const save = cleanSave(obj.save);
  if (!save) throw new Error('That account code is missing its inventor.');
  return save;
}
