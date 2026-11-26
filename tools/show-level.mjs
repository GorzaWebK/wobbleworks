// Prints a level as ASCII with its objects, to help design levels.
// Usage: node tools/show-level.mjs w1-3 [solutionIndex]
import { readFileSync } from 'node:fs';
import { parseWorld } from '../src/levels/levels.js';
import { unpackBuild } from '../src/game/build.js';

const id = process.argv[2];
const sols = JSON.parse(readFileSync(new URL('./solutions.json', import.meta.url)));
for (let w = 1; w <= 4; w++) {
  const world = parseWorld(JSON.parse(readFileSync(new URL(`../src/levels/data/world${w}.json`, import.meta.url))));
  for (const L of world.levels) {
    if (id && L.id !== id) continue;
    const g = L.tiles.map((r) => r.split(''));
    const put = (x, y, ch) => { const r = Math.round(y); const c = Math.round(x); if (g[r] && c >= 0 && c < L.w) g[r][c] = ch; };
    for (const z of L.water) for (let r = Math.ceil(z.y); r < z.y + z.h; r++) for (let c = z.x; c < z.x + z.w; c++) if (g[r]?.[c] === '.') g[r][c] = '~';
    for (const z of L.wind) for (let r = z.y; r < z.y + z.h; r++) for (let c = z.x; c < z.x + z.w; c++) if (g[r]?.[c] === '.') g[r][c] = z.fx > 0 ? '>' : z.fx < 0 ? '<' : z.fy < 0 ? '^' : 'v';
    for (const m of L.movers) for (let r = m.y; r < m.y + m.h; r++) for (let c = m.x; c < m.x + m.w; c++) if (g[r]) g[r][c] = 'M';
    put(L.start[0], L.start[1], 'S');
    put(L.flag[0], L.flag[1], 'F');
    if (L.sock) put(L.sock[0], L.sock[1], 's');
    console.log(`\n${L.id} "${L.name}" budget ${L.budget} par ${L.par} parts ${L.parts.join(',')} anchors ${JSON.stringify(L.anchors)}`);
    console.log('    ' + Array.from({ length: L.w }, (_, i) => (i % 10)).join(''));
    g.forEach((r, i) => console.log(String(i).padStart(3) + ' ' + r.join('')));
    for (const s of sols[L.id] || []) console.log('  sol:', s.label || '', s.build);
  }
}
