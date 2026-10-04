/**
 * Copies one of Caw's drawn clips into the site:
 * `node scripts/import-caw.mjs <clip> <folder>`.
 *
 * A clip is the product's own animation of Caw: a MiniMax take, traced into
 * flat-ink drawings and held on twos (`assets/mascot/README.md`). Each one is
 * a folder of `body-NN.svg` drawings and a `timing.json` that says which
 * drawing shows on which frame. This script reads the folder you name (from
 * the repository root, or an absolute path) and writes
 * `src/assets/caw/<clip>.svg`: every drawing, unchanged, as a group, with the
 * timing on the root element. The build then turns that file into the inline
 * picture and its frame steps.
 *
 * The page uses only the copies. They are committed, so the page keeps
 * working when the product retires a clip and deletes its folder. Run this
 * only to add a clip or to pick up one that was retraced:
 *
 *   node scripts/import-caw.mjs ready-enter-distance assets/mascot/clips/ready-enter-distance
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [name, folder] = process.argv.slice(2);
if (!name || !folder) throw new Error('Usage: node scripts/import-caw.mjs <clip> <folder>');

const root = fileURLToPath(new URL('../../', import.meta.url));
const from = resolve(root, folder);
const out = fileURLToPath(new URL('../src/assets/caw/', import.meta.url));

const timing = JSON.parse(readFileSync(join(from, 'timing.json'), 'utf8'));
const holds = timing.drawings.map((hold) => `${hold.drawing}:${hold.length}`);
const groups = [...new Set(timing.drawings.map((hold) => hold.drawing))].map((drawing) => {
  const file = `body-${String(drawing).padStart(2, '0')}.svg`;
  const body = readFileSync(join(from, file), 'utf8').match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];
  if (!body?.startsWith('<g ')) throw new Error(`${folder}/${file} is not one group of shapes.`);
  return body.replace('<g ', `<g data-drawing="${drawing}" `);
});
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-clip="${name}" data-source="${relative(root, from)}" data-take="${timing.take}" data-fps="${timing.fps}" data-frames="${timing.frames}" data-holds="${holds.join(' ')}">`,
  ...groups,
  '</svg>',
  '',
].join('\n');

mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${name}.svg`), svg);
console.log(
  `${name}: ${groups.length} drawings, ${timing.frames} frames at ${timing.fps} fps, ${svg.length} bytes, written to ${join(out, `${name}.svg`)}`,
);
