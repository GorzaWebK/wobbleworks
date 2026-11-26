// Renders the social card and icons from tools/art.html into assets/.
// Needs a local server on port 8642 (python3 -m http.server 8642) and Playwright.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const out = path.join(__dirname, '..', 'assets');
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  const shots = [['og', 'og-image.png'], ['icon=180', 'icon-180.png'], ['icon=32', 'favicon-32.png']];
  for (const [q, file] of shots) {
    await p.goto(`http://localhost:8642/tools/art.html?${q}`);
    await p.waitForSelector('body[data-ready]');
    await p.locator('#c').screenshot({ path: path.join(out, file), omitBackground: true });
    console.log('wrote', file);
  }
  await b.close();
})();
