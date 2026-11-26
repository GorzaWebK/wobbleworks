// Checks level codes and account codes round-trip correctly.
// Usage: node tools/test-codes.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseWorld } from '../src/levels/levels.js';
import { encodeLevel, decodeLevel } from '../src/levels/codec.js';
import { unpackBuild } from '../src/game/build.js';
import { Sim } from '../src/game/sim.js';
import { emptySave, cleanSave, cleanName } from '../src/account/store.js';
import { exportCode, parseCode } from '../src/account/code.js';

const sols = JSON.parse(readFileSync(new URL('./solutions.json', import.meta.url)));
let n = 0;
let longest = 0;
for (let w = 1; w <= 4; w++) {
  const world = parseWorld(JSON.parse(readFileSync(new URL(`../src/levels/data/world${w}.json`, import.meta.url))));
  for (const L of world.levels) {
    const code = encodeLevel(L);
    longest = Math.max(longest, code.length);
    const back = decodeLevel(code);
    assert.deepEqual(back.tiles, L.tiles, `${L.id} tiles`);
    for (const k of ['start', 'flag', 'sock', 'anchors', 'budget', 'par', 'parts', 'gravity', 'water', 'wind', 'movers']) {
      assert.deepEqual(back[k], L[k], `${L.id} ${k}`);
    }
    // the decoded level plays exactly the same
    const parts = unpackBuild(sols[L.id][0].build);
    const a = new Sim(L, parts).runToEnd();
    const b = new Sim(back, parts).runToEnd();
    assert.equal(a.world.hash(), b.world.hash(), `${L.id} plays the same from its code`);
    n++;
  }
}
console.log(`level codes: ${n} levels round-trip and replay identically (longest code ${longest} chars)`);

assert.throws(() => decodeLevel('hello'), /level code/);
const good = encodeLevel(parseWorld(JSON.parse(readFileSync(new URL('../src/levels/data/world1.json', import.meta.url)))).levels[0]);
assert.throws(() => decodeLevel(good.slice(0, 20) + 'A' + good.slice(21)), /damaged/);
console.log('level codes: bad and damaged codes are refused');

// account codes
const save = emptySave('WW-ABCD-EFGH', 'Captain Sprocket');
save.stars['w1-1'] = [1, 1, 0];
save.best['w1-1'] = { cost: 10, build: 'p 10 12 14 12' };
save.custom.push({ id: 'c1', name: 'Pillar Party', code: good, updated: 1 });
save.settings.music = 0.2;
save.settings.keys.p1.up = 'KeyT';
const code = await exportCode(save);
assert.match(code, /^WW1\.[zj][A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
const back = await parseCode(code);
assert.deepEqual(back, cleanSave(save));
await assert.rejects(parseCode(code.slice(0, -9) + '.00000000'), /damaged/);
await assert.rejects(parseCode('FF1.zabc.12345678'), /isn't a Wobbleworks/);
console.log(`account codes: round-trip OK (${code.length} chars), damaged and foreign codes refused`);

assert.equal(cleanName('  <b>Bob</b>  the   Builder!!  '), 'bBobb the Builde');
assert.equal(cleanSave({ id: 'nope' }), null);
console.log('usernames and saves are cleaned');
