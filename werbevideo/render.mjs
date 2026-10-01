// Rendert den Spot Frame für Frame (Playwright + ffmpeg).
//   node render.mjs            -> beide Formate
//   node render.mjs v          -> nur 9:16
//   node render.mjs h 12.3     -> nur ein Standbild bei t=12.3s (PNG, zur Kontrolle)
//   node render.mjs v2 [v|h] [t] -> Version 2 mit echtem Produkt-Rendering
// Voraussetzung: Playwright (Chromium) und ffmpeg im PATH, Musik in musik.wav bzw. musik-v2.wav (python3 musik.py [v2]).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const dir = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const SIZES = { v: [1080, 1920], h: [1920, 1080] };
const args = process.argv.slice(2);
const V2 = args[0] === 'v2';
if (V2) args.shift();
const SUFFIX = V2 ? '-v2' : '';
const NAMES = { v: `tablet-halterung${SUFFIX}-9x16`, h: `tablet-halterung${SUFFIX}-16x9` };
const [only, still] = args;
const formats = only ? [only] : ['v', 'h'];

const browser = await chromium.launch();
for (const f of formats) {
  const [w, h] = SIZES[f];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(dir, `tablet-halterung-spot${SUFFIX}.html`)).href + '?f=' + f);
  await page.evaluate(() => window.ready);
  const duration = await page.evaluate(() => window.DURATION);

  if (still !== undefined) {
    await page.evaluate(t => window.seek(t), +still);
    const out = path.join(dir, `still${SUFFIX}-${f}-${still}.png`);
    await page.screenshot({ path: out });
    console.log('Standbild:', out);
    await page.close();
    continue;
  }

  const out = path.join(dir, NAMES[f] + '.mp4');
  const audio = path.join(dir, `musik${SUFFIX}.wav`);
  const args = ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
  if (fs.existsSync(audio)) args.push('-i', audio, '-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out);
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'inherit'] });
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => window.seek(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`${f}: Frame ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  console.log('Fertig:', out);
  await page.close();
}
await browser.close();
