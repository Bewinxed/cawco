/**
 * Writes the four machine drawings: `node scripts/lift-devices.mjs`.
 *
 * The drawings are the rest pose of the hairline figure `art/fleet.js`. Build
 * that figure first (the hairline skill's `look.mjs` writes
 * `art/hairline-fleet.html`); this script opens the built figure, takes each
 * machine's group as it stands at rest and writes it to
 * `src/assets/devices/<name>.svg`, cropped to its own box. It uses the browser
 * the hairline skill installs under `~/.cache/hairline-look`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(join(homedir(), '.cache/hairline-look/'));
const { chromium } = require('playwright-core');

const page = join(import.meta.dirname, '../art/hairline-fleet.html');
const out = join(import.meta.dirname, '../src/assets/devices');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 900, height: 900 } });
await tab.goto(`file://${page}`);
await tab.waitForTimeout(1500);

const machines = await tab.evaluate(() => {
  const svg = document.querySelector('[data-hairline] svg') ?? document.querySelector('svg');
  const root = [...svg.children].find((el) => el.tagName === 'g');
  const groups = [...root.children].filter(
    (el) => el.tagName === 'g' && !el.classList.contains('ghost') && el.querySelector('circle'),
  );
  const round = (text) =>
    text.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10));
  return groups.map((g) => {
    const box = g.getBBox();
    const marks = [...g.querySelectorAll('path, circle')].map((el) => {
      const cls = [...el.classList].filter((c) => c !== 'hi' && c !== 'm').join(' ');
      if (el.tagName === 'circle') {
        return `<circle class="lamp" cx="${round(el.getAttribute('cx'))}" cy="${round(el.getAttribute('cy'))}" r="${el.getAttribute('r')}"/>`;
      }
      return `<path${cls ? ` class="${cls}"` : ''} d="${round(el.getAttribute('d'))}"/>`;
    });
    return { box: [box.x, box.y, box.width, box.height], marks };
  });
});
await browser.close();

const NAMES = ['cloud', 'vm', 'laptop', 'box'];
machines.forEach(({ box, marks }, i) => {
  const pad = 2;
  const [x, y, w, h] = [box[0] - pad, box[1] - pad, box[2] + pad * 2, box[3] + pad * 2].map(
    (n) => Math.round(n * 10) / 10,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">\n${marks.join('\n')}\n</svg>\n`;
  writeFileSync(join(out, `${NAMES[i]}.svg`), svg);
  console.log(NAMES[i], `${w} × ${h}`, `${marks.length} marks`, `${svg.length} bytes`);
});
