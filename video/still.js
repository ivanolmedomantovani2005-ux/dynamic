// Renderiza fotogramas sueltos para revisar la composición: node still.js 1500 5000 ...
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const times = process.argv.slice(2).map(Number);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const outDir = process.env.OUT || '/tmp/claude-0/-home-user-dynamic/34810968-2b0e-5337-b92c-b8143ed5f010/scratchpad/stills';
  require('fs').mkdirSync(outDir, { recursive: true });
  for (const ms of times) {
    await page.evaluate(m => window.renderAt(m), ms);
    await page.screenshot({ path: `${outDir}/t${ms}.png` });
  }
  await browser.close();
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
