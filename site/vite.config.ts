import { createRequire } from 'node:module';
import type { IconifyJSON } from '@iconify/types';
import { getIconData, iconToHTML, iconToSVG } from '@iconify/utils';
import { defineConfig, type Plugin } from 'vite';
import { MASCOTS, type Mascot } from './src/mascots.ts';

const solar = createRequire(import.meta.url)('@iconify-json/solar/icons.json') as IconifyJSON;

/** `<i data-icon="widget-5"></i>` becomes that Solar bold-duotone icon, inline. */
function icon(name: string): string {
  const data = getIconData(solar, `${name}-bold-duotone`);
  if (!data) throw new Error(`No Solar bold-duotone icon named "${name}".`);
  const svg = iconToSVG(data, { height: '1em' });
  return iconToHTML(svg.body, { ...svg.attributes, 'aria-hidden': 'true', class: 'icon' });
}

/** `<img data-caw="hero">` gets its file, size and origin from the mascot manifest. */
function mascot(slot: string, rest: string): string {
  const entry: Mascot | undefined = (MASCOTS as Record<string, Mascot>)[slot];
  if (!entry) throw new Error(`No mascot slot named "${slot}".`);
  return `<img src="/src/assets/caw/${entry.file}" width="${entry.width}" height="${entry.height}" data-caw="${slot}" data-origin="${entry.origin}"${rest}>`;
}

const pageMarkup: Plugin = {
  name: 'cawco-page-markup',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) =>
      html
        .replace(/<i data-icon="([^"]+)"><\/i>/g, (_, name: string) => icon(name))
        .replace(/<img data-caw="([^"]+)"([^>]*)>/g, (_, slot: string, rest: string) =>
          mascot(slot, rest),
        ),
  },
};

export default defineConfig({
  // Relative URLs, so the same build works at cawco.dev's root and under a preview path.
  base: './',
  plugins: [pageMarkup],
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0 },
});
