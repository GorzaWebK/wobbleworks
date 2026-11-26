// End-to-end checks in a real browser (Playwright + Chromium):
// username warning, building with the mouse and keyboard, winning and stars,
// failing and boinging home, slow-mo replay, pause on tab blur, settings and
// key rebinding, account code export/import, the 2-player race, the level
// editor and level codes, and touch (drag to place, pinch to zoom).
//
// Usage: python3 -m http.server 8642   (in the repo root, in another terminal)
//        node tools/browser-test.cjs
const { chromium, devices } = require('playwright');
const assert = require('assert/strict');

const URL = process.env.WOB_URL || 'http://localhost:8642/';
const ok = (msg) => console.log('  ✓ ' + msg);

async function newInventor(page, name) {
  await page.goto(URL);
  await page.waitForSelector('#name-input');
  assert.match(await page.textContent('#name-warning'), /Don't use your real name/);
  await page.fill('#name-input', name);
  await page.click('#name-go');
  await page.waitForSelector('#scr-title.show');
}

const cam = (page, x, y) => page.evaluate(([x, y]) => window.wobbleworks.app.controller.view.cam.toScreen(x * 40, y * 40), [x, y]);
const ctl = (page, fn) => page.evaluate(fn);

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };

  console.log('Single player');
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  watch(p);
  await newInventor(p, 'Test Inventor');
  ok('username screen shows the real-name warning');
  await p.click('[data-go=levels]');
  await p.waitForSelector('#scr-levels.show');
  await p.click('#book-grid .lvl-card');
  await p.waitForSelector('#hud:not([hidden])');
  await p.click('#note-ok');
  const drag = async (a, b) => {
    const A = await cam(p, ...a); const B = await cam(p, ...b);
    await p.mouse.move(A[0], A[1]); await p.mouse.down();
    await p.mouse.move(B[0], B[1], { steps: 6 }); await p.mouse.up();
  };
  await drag([10, 12], [12, 11]);
  await drag([12, 11], [14, 12]);
  assert.equal(await ctl(p, () => window.wobbleworks.app.controller.builder.build.parts.length), 2);
  ok('mouse drag places planks');
  await p.click('#go', { force: true });
  await p.waitForSelector('#result:not([hidden])', { timeout: 20000 });
  const stars = await ctl(p, () => window.wobbleworks.app.save.stars['w1-1']);
  assert.deepEqual(stars, [1, 0, 1]);
  ok('arched bridge wins and earns the finish and sock stars');
  await p.click('#r-replay');
  assert.equal(await ctl(p, () => window.wobbleworks.app.controller.mode), 'replay');
  ok('slow-mo replay plays');
  await p.keyboard.press('KeyG'); // stop replay
  await p.click('#r-tinker');

  // keyboard: clear, place a 4-long plank at the cursor, undo, redo
  await ctl(p, () => { const c = window.wobbleworks.app.controller; c.builder.build.clear(); c.changed(); });
  await p.keyboard.press('KeyF'); await p.keyboard.press('KeyF'); await p.keyboard.press('Space');
  assert.equal(await ctl(p, () => JSON.stringify(window.wobbleworks.app.controller.builder.build.parts)), '[{"t":"plank","a":[10,12],"b":[14,12]}]');
  await p.keyboard.press('Control+KeyZ');
  assert.equal(await ctl(p, () => window.wobbleworks.app.controller.builder.build.parts.length), 0);
  await p.keyboard.press('Control+KeyY');
  assert.equal(await ctl(p, () => window.wobbleworks.app.controller.builder.build.parts.length), 1);
  ok('keyboard cursor placing, undo and redo');

  // fail: no bridge, Wob falls and boings home
  await ctl(p, () => { const c = window.wobbleworks.app.controller; c.builder.build.clear(); c.changed(); });
  await p.keyboard.press('KeyG');
  await p.waitForFunction(() => /Back to the start|Boing/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
  assert.equal(await ctl(p, () => window.wobbleworks.app.controller.mode), 'build');
  ok('falling sends Wob back to the start with a message');

  // pause on tab blur
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.ok(await p.isVisible('#pause'));
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
  await p.click('#p-resume');
  ok('pauses when the tab is hidden');

  console.log('Settings and account');
  await p.goto(URL);
  await p.waitForSelector('#scr-title.show');
  await p.click('[data-go=settings]');
  await p.waitForSelector('#scr-settings.show');
  await p.click('#set-keys button');
  await p.keyboard.press('KeyT');
  assert.equal(await ctl(p, () => window.wobbleworks.app.save.settings.keys.p1.up), 'KeyT');
  await p.click('#set-keys-reset');
  await p.click('#set-cb');
  assert.equal(await ctl(p, () => window.wobbleworks.app.save.settings.cb), true);
  ok('key rebinding and colour-blind setting are saved');
  await p.click('#scr-settings [data-back]');
  await p.waitForSelector('#scr-title.show');
  await p.click('[data-go=account]');
  await p.waitForFunction(() => document.getElementById('acc-code').value.startsWith('WW1.'));
  const code = await p.inputValue('#acc-code');
  const ctx2 = await browser.newContext();
  const q = await ctx2.newPage();
  watch(q);
  await q.goto(URL);
  await q.click('#name-load');
  await q.waitForSelector('#scr-account.show');
  await q.fill('#acc-paste', code);
  await q.click('#acc-load');
  await q.click('#dlg-buttons button');
  await q.waitForFunction(() => window.wobbleworks.app.save?.name === 'Test Inventor');
  assert.deepEqual(await ctl(q, () => window.wobbleworks.app.save.stars['w1-1']), [1, 0, 1]);
  ok('account code moves stars and settings to another browser');
  await ctx2.close();

  console.log('2-player race');
  await p.goto(URL);
  await p.waitForSelector('#scr-title.show');
  await p.click('[data-go=race]');
  await p.waitForSelector('#scr-levels.show');
  await p.click('#book-grid .lvl-card');
  await p.waitForSelector('#race-hud:not([hidden])');
  await p.keyboard.press('KeyF'); await p.keyboard.press('KeyF'); await p.keyboard.press('Space');
  await p.keyboard.press('Comma'); await p.keyboard.press('Enter');
  const sides = await ctl(p, () => window.wobbleworks.app.controller.sides.map((s) => s.builder.build.parts.length));
  assert.deepEqual(sides, [1, 1]);
  ok('P1 (WASD/Q/E/Space) and P2 (arrows/,/./Enter) build on their own sides');
  await p.click('#race-now');
  await p.waitForFunction(() => window.wobbleworks.app.controller.phase === 'over', null, { timeout: 30000 });
  assert.match(await p.textContent('#race-banner'), /Player 1 wins/);
  ok('both Wobs run and the winner is shown');

  console.log('Level editor and codes');
  await p.goto(URL);
  await p.waitForSelector('#scr-title.show');
  await p.click('[data-go=editor]');
  await p.waitForSelector('#editor-ui:not([hidden])');
  await p.click('#ed-tray [data-tool=ground]');
  for (const c of [14, 15]) {
    const A = await cam(p, c + 0.5, 12.5); const B = await cam(p, c + 0.5, 17.5);
    await p.mouse.move(A[0], A[1]); await p.mouse.down(); await p.mouse.move(B[0], B[1], { steps: 6 }); await p.mouse.up();
  }
  await p.click('#ed-tray [data-tool=bolt]');
  for (const [x, y] of [[14, 12], [16, 12]]) { const A = await cam(p, x, y); await p.mouse.click(A[0], A[1]); }
  await p.fill('#ed-panel input[type=text]', 'Pillar Party');
  await p.click('#ed-save');
  const lcode = await ctl(p, () => window.wobbleworks.app.save.custom[0].code);
  assert.match(lcode, /^WOB1-/);
  ok(`level saved to My Levels with a ${lcode.length}-character code`);
  await p.click('#ed-test');
  await p.waitForSelector('#hud:not([hidden])');
  await ctl(p, async () => { const { unpackBuild } = await import('/src/game/build.js'); const c = window.wobbleworks.app.controller; c.builder.build.set(unpackBuild('p 10 12 14 12;p 16 12 20 12')); c.changed(); });
  await p.click('#go', { force: true });
  await p.waitForSelector('#result:not([hidden])', { timeout: 20000 });
  await p.click('#r-next');
  await p.waitForSelector('#editor-ui:not([hidden])');
  assert.equal(await p.inputValue('#ed-panel input[type=text]'), 'Pillar Party');
  ok('test-playing a level and returning to the editor keeps the draft');
  const ctx3 = await browser.newContext();
  const f = await ctx3.newPage();
  watch(f);
  await newInventor(f, 'Friend');
  await f.click('[data-go=mylevels]');
  await f.waitForSelector('#book-custom:not([hidden])');
  await f.fill('#code-input', lcode);
  await f.click('#code-play');
  await f.waitForSelector('#hud:not([hidden])');
  assert.equal(await f.textContent('#lvl-name'), 'Pillar Party');
  ok("a friend's browser plays the shared level code");
  await ctx3.close();

  console.log('Touch (tablet)');
  const tctx = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const t = await tctx.newPage();
  watch(t);
  await t.goto(URL);
  await t.tap('#name-random');
  await t.tap('#name-go');
  await t.waitForSelector('#scr-title.show');
  await t.goto(URL + '?level=w1-1');
  await t.waitForSelector('#hud:not([hidden])');
  await t.tap('#note-ok');
  const cdp = await tctx.newCDPSession(t);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const A = await cam(t, 10, 12); const B = await cam(t, 14, 12);
  await touch('touchStart', [A]);
  for (let k = 1; k <= 6; k++) await touch('touchMove', [[A[0] + ((B[0] - A[0]) * k) / 6, A[1]]]);
  await touch('touchEnd', []);
  assert.equal(await ctl(t, () => window.wobbleworks.app.controller.builder.build.parts.length), 1);
  ok('one-finger drag places a plank');
  const s0 = await ctl(t, () => window.wobbleworks.app.controller.view.cam.scale);
  await touch('touchStart', [[460, 380], [560, 380]]);
  for (let k = 1; k <= 6; k++) await touch('touchMove', [[460 - k * 20, 380], [560 + k * 20, 380]]);
  await touch('touchEnd', []);
  const s1 = await ctl(t, () => window.wobbleworks.app.controller.view.cam.scale);
  assert.ok(s1 > s0 * 1.5, 'pinch should zoom in');
  assert.equal(await ctl(t, () => window.wobbleworks.app.controller.builder.build.parts.length), 1);
  ok('two-finger pinch zooms without placing parts');
  await tctx.close();

  await browser.close();
  if (errors.length) { console.error('Browser errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nAll browser checks passed.');
})().catch((e) => { console.error(e); process.exit(1); });
