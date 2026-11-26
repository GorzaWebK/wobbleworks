// Checks every level can be beaten. For each level it replays the stored
// solutions (tools/solutions.json) through the same simulation the game uses:
//   - every part must be legal to place, and the build must fit the budget
//   - a solution marked "win" must reach the flag
//   - "thrifty" must cost no more than the par, "sock" must pick up the sock
//   - between them, a level's solutions must earn all three stars
//   - doing nothing must NOT beat the level
//   - running the same build twice must give exactly the same result
// Usage: node tools/verify-levels.mjs [levelId]

import { readFileSync } from 'node:fs';
import { parseWorld } from '../src/levels/levels.js';
import { unpackBuild, checkPart, partCost } from '../src/game/build.js';
import { Sim } from '../src/game/sim.js';

const only = process.argv[2];
const sols = JSON.parse(readFileSync(new URL('./solutions.json', import.meta.url)));
let failures = 0;
let checked = 0;

for (let w = 1; w <= 4; w++) {
  const world = parseWorld(JSON.parse(readFileSync(new URL(`../src/levels/data/world${w}.json`, import.meta.url))));
  if (world.levels.length !== 8) { console.log(`world ${w}: expected 8 levels, found ${world.levels.length}`); failures++; }
  for (const L of world.levels) {
    if (only && L.id !== only) continue;
    checked++;
    const problems = [];
    const list = sols[L.id] || [];
    if (!list.length) problems.push('no solutions');
    const got = { win: false, thrifty: false, sock: false };
    for (const s of list) {
      const parts = unpackBuild(s.build);
      for (let i = 0; i < parts.length; i++) {
        const why = checkPart(L, parts.slice(0, i), parts[i]);
        if (why) problems.push(`${s.label}: part ${i + 1} (${parts[i].t}) not allowed: ${why}`);
      }
      const cost = partCost(parts);
      if (cost > L.budget) problems.push(`${s.label}: costs ${cost}, budget ${L.budget}`);
      const sim = new Sim(L, parts).runToEnd();
      const won = sim.state === 'won';
      const thrifty = won && cost <= L.par;
      const sock = won && sim.sockGot;
      const expect = s.expect || ['win'];
      if (expect.includes('win') && !won) problems.push(`${s.label}: did not win (${sim.reason} at ${sim.time.toFixed(1)}s, x=${(sim.wob.x / 40).toFixed(1)} y=${(sim.wob.y / 40).toFixed(1)})`);
      if (expect.includes('thrifty') && !thrifty) problems.push(`${s.label}: not thrifty (cost ${cost}, par ${L.par})`);
      if (expect.includes('sock') && !sock) problems.push(`${s.label}: missed the sock`);
      if (won) got.win = true;
      if (thrifty) got.thrifty = true;
      if (sock) got.sock = true;
      // determinism
      const again = new Sim(L, parts).runToEnd();
      if (again.world.hash() !== sim.world.hash() || again.time !== sim.time) problems.push(`${s.label}: not deterministic`);
      s.result = `${sim.state} ${sim.reason} ${sim.time.toFixed(1)}s cost ${cost}${sock ? ' +sock' : ''}`;
    }
    if (!got.win || !got.thrifty || (L.sock && !got.sock)) problems.push(`stars reachable: win ${got.win} thrifty ${got.thrifty} sock ${got.sock}`);
    const empty = new Sim(L, []).runToEnd();
    if (empty.state === 'won') problems.push('can be won without building anything');
    const status = problems.length ? 'FAIL' : 'ok  ';
    console.log(`${status} ${L.id.padEnd(5)} ${L.name.padEnd(22)} budget ${String(L.budget).padStart(3)} par ${String(L.par).padStart(3)} | ${list.map((s) => `${s.label}: ${s.result}`).join(' | ')}`);
    for (const p of problems) console.log('       - ' + p);
    if (problems.length) failures++;
  }
}
console.log(failures ? `\n${failures} level(s) need work (${checked} checked)` : `\nAll ${checked} levels can be beaten, with every star reachable.`);
process.exit(failures ? 1 : 0);
