// Run one build on a level and print what happened, for designing levels.
// Usage: node tools/try-build.mjs w2-1 "s 11 12 13 12;p 20 9 22 9"
import { readFileSync } from 'node:fs';
import { parseWorld } from '../src/levels/levels.js';
import { unpackBuild, checkPart, partCost } from '../src/game/build.js';
import { Sim } from '../src/game/sim.js';

const [id, build = ''] = process.argv.slice(2);
const w = Number(id.slice(1, 2));
const world = parseWorld(JSON.parse(readFileSync(new URL(`../src/levels/data/world${w}.json`, import.meta.url))));
const L = world.levels.find((l) => l.id === id);
const parts = unpackBuild(build);
parts.forEach((p, i) => { const r = checkPart(L, parts.slice(0, i), p); if (r) console.log('  not allowed:', JSON.stringify(p), r); });
const sim = new Sim(L, parts);
const path = [];
let peak = Infinity;
const events = {};
while (sim.state === 'running') {
  const ev = sim.step();
  for (const e of ev) events[e.type] = (events[e.type] || 0) + 1;
  peak = Math.min(peak, sim.wob.y);
  if (sim.world.steps % 30 === 0) path.push(`${(sim.wob.x / 40).toFixed(1)},${(sim.wob.y / 40).toFixed(1)}`);
}
const maxStress = Math.max(0, ...sim.world.links.map((l) => (l.broken ? 1 : l.stress)));
console.log(`${id}: ${sim.state} (${sim.reason}) at ${sim.time.toFixed(1)}s · cost ${partCost(parts)}/${L.budget} par ${L.par} · sock ${sim.sockGot} · peak y ${(peak / 40).toFixed(1)} · max stress ${maxStress.toFixed(2)} · ${JSON.stringify(events)}`);
console.log('  path:', path.join(' '));
