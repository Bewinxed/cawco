/**
 * Writes the page that the share image is a picture of: `node scripts/og.mjs`.
 *
 * `public/og.png` (the `og:image`) is a 1200 x 630 capture of that page: the
 * paper ground, the wordmark and the headline in the page's own Nunito, and
 * Caw as the product draws him at rest (the last drawing of his entrance,
 * `ready-enter-distance`). The script writes `research/og.html`, which is not
 * committed. Open it in a browser window 1200 x 630 and save a screenshot over
 * `public/og.png`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (path) => new URL(path, import.meta.url);
const tokens = JSON.parse(readFileSync(at('../../design/tokens/cawco.tokens.json'), 'utf8'));
const paper = tokens.color.paper.$value;
const ink = tokens.color['crow-ink'].$value;

const clip = readFileSync(at('../src/assets/caw/ready-enter-distance.svg'), 'utf8');
const last = clip
  .match(/data-holds="([^"]+)"/)?.[1]
  .split(' ')
  .at(-1)
  ?.split(':')[0];
const caw = clip.match(new RegExp(`<g data-drawing="${last}"[\\s\\S]*?</g>`))?.[0];
if (!caw) throw new Error('The clip has no last drawing.');

const font = fileURLToPath(
  at('../node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2'),
);

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family: Nunito; font-weight: 200 1000; src: url("file://${font}") format("woff2-variations"); }
  html, body { margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; background: ${paper}; color: ${ink}; font-family: Nunito, sans-serif; }
  .mark { position: absolute; left: 72px; top: 56px; font-size: 44px; font-weight: 1000; letter-spacing: -0.045em; }
  h1 { position: absolute; left: 72px; top: 178px; width: 640px; margin: 0; font-size: 96px; font-weight: 1000; line-height: 0.98; letter-spacing: -0.04em; }
  svg { position: absolute; right: 44px; top: 86px; width: 470px; height: 470px; overflow: visible; }
</style>
<div class="mark">Caw&amp;Co</div>
<h1>One board for every coding agent you run.</h1>
<svg viewBox="0 0 512 512">${caw}</svg>
`;

mkdirSync(at('../research/'), { recursive: true });
writeFileSync(at('../research/og.html'), html);
console.log(`written ${fileURLToPath(at('../research/og.html'))}`);
