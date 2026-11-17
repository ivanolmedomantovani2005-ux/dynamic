// Renderiza index.html fotograma a fotograma (30 fps) y lo codifica en MP4 H.264 con music.wav.
// Uso: node render.js [salida.mp4]
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const FPS = 30, DUR_MS = 78000;
const out = process.argv[2] || path.join(__dirname, 'out', 'grupo-dynamic-corporativo-16x9.mp4');
require('fs').mkdirSync(path.dirname(out), { recursive: true });
const silent = out.replace(/\.mp4$/, '.silent.mp4');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', silent],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = Math.round(DUR_MS / 1000 * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate(ms => window.renderAt(ms), (f / FPS) * 1000);
    const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log('frame', f, '/', total);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
  await browser.close();

  // Mezcla con la música y exporta con audio AAC
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-i', path.join(__dirname, 'music.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
  require('fs').unlinkSync(silent);
  console.log('done', out);
})().catch(e => { console.error(e); process.exit(1); });
