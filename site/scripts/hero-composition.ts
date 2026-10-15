/**
 * Writes the hero's scene 1 as a standalone HyperFrames composition, from the built site:
 * `bun run build`, then `bun scripts/hero-composition.ts <out-dir> [light|dark]`, then
 * `npx hyperframes snapshot <out-dir> --at 0,2.908,3.72`.
 *
 * The composition is the stage exactly as the page ships it (dist/index.html, its machines and
 * icons already written in), the page's stylesheet with its fonts, and src/hero/composition.ts,
 * which registers the same timeline the site plays. Nothing here ships on cawco.dev.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const site = new URL('..', import.meta.url).pathname;
const [out, theme = 'light'] = process.argv.slice(2);
if (!out) throw new Error('Usage: bun scripts/hero-composition.ts <out-dir> [light|dark]');
if (theme !== 'light' && theme !== 'dark') throw new Error(`No theme named "${theme}".`);

const dist = join(site, 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

/** The element that opens at `start`, through its matching close tag (no nested same-name tags). */
function element(source: string, marker: string, tag: string): string {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`dist/index.html has no ${marker}.`);
  const start = source.lastIndexOf(`<${tag}`, at);
  let depth = 0;
  const pattern = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  pattern.lastIndex = start;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return source.slice(start, match.index + match[0].length);
  }
  throw new Error(`${marker} never closes.`);
}

const stage = element(html, 'class="hero-stage"', 'div');
const glyphs = element(html, '<symbol id="hg-claude"', 'svg');

const assets = join(dist, 'assets');
const css = readdirSync(assets).find((name) => name.endsWith('.css') && name.startsWith('styles'));
if (!css) throw new Error('dist/assets has no page stylesheet; run `bun run build` first.');
// The stylesheet's fonts are beside it; inline it with their paths from the composition's root.
const styles = readFileSync(join(assets, css), 'utf8').replace(
  /url\(\.?\/?([^)/]+\.woff2)\)/g,
  'url(assets/$1)',
);

// gsap loads as its own files, as a composition's runtime expects; the scene takes it from them.
const GLOBALS: Record<string, string> = { gsap: 'gsap', 'gsap/CustomEase': 'CustomEase' };
const built = await Bun.build({
  entrypoints: [join(site, 'src/hero/composition.ts')],
  format: 'iife',
  minify: true,
  target: 'browser',
  plugins: [
    {
      name: 'gsap-globals',
      setup(build) {
        build.onResolve({ filter: /^gsap(\/CustomEase)?$/ }, ({ path }) => ({
          path,
          namespace: 'global',
        }));
        build.onLoad({ filter: /.*/, namespace: 'global' }, ({ path }) => ({
          contents: `const g = window.${GLOBALS[path]}; export default g; export const ${GLOBALS[path]} = g;`,
          loader: 'js',
        }));
      },
    },
  ],
});
if (!built.success) throw new Error(built.logs.join('\n'));
const script = await built.outputs[0]?.text();
if (!script) throw new Error('The composition script built empty.');

mkdirSync(join(out, 'assets'), { recursive: true });
for (const name of readdirSync(assets).filter((file) => file.endsWith('.woff2'))) {
  cpSync(join(assets, name), join(out, 'assets', name));
}
for (const name of ['gsap.min.js', 'CustomEase.min.js']) {
  cpSync(join(site, 'node_modules/gsap/dist', name), join(out, 'assets', name));
}
writeFileSync(join(out, 'assets/scene.js'), script);

writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>
<html lang="en" data-theme="${theme}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=1200, height=600" />
    <title>cawco.dev hero, scene 1</title>
    <style>${styles}</style>
    <style>
      body { margin: 0; background: var(--paper); }
      /*
       * The stage is the root: the renderer sizes it to data-width × data-height. The frame is
       * the window here, with no margin past the stage, so the cards keep inside it.
       */
      [data-composition-id] { width: 100%; height: 100%; margin: 0; --gutter: 0px; }
    </style>
  </head>
  <body>
    ${glyphs}
    ${stage}
    <script src="assets/gsap.min.js"></script>
    <script src="assets/CustomEase.min.js"></script>
    <script src="assets/scene.js"></script>
    <script>
      document.fonts.ready.then(() => {
        const tl = window.cawcoHeroScene(document.querySelector('[data-composition-id]'));
        window.__timelines["hero-scene-1"] = tl;
      });
    </script>
  </body>
</html>
`,
);
console.log(`Wrote ${join(out, 'index.html')} (${theme}).`);
