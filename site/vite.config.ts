import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { IconifyJSON } from '@iconify/types';
import { getIconData, iconToHTML, iconToSVG } from '@iconify/utils';
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';

const require = createRequire(import.meta.url);
const solar = require('@iconify-json/solar/icons.json') as IconifyJSON;
const brands = require('@iconify-json/simple-icons/icons.json') as IconifyJSON;

const asset = (path: string): string =>
  readFileSync(new URL(`./src/assets/${path}`, import.meta.url), 'utf8');

function inlineIcon(set: IconifyJSON, name: string, what: string): string {
  const data = getIconData(set, name);
  if (!data) throw new Error(`No ${what} named "${name}".`);
  const svg = iconToSVG(data, { height: '1em' });
  return iconToHTML(svg.body, { ...svg.attributes, 'aria-hidden': 'true', class: 'icon' });
}

/** `<i data-icon="widget-5"></i>` becomes that Solar bold-duotone icon, inline. */
const icon = (name: string): string =>
  inlineIcon(solar, `${name}-bold-duotone`, 'Solar bold-duotone icon');

/** `<i data-mark="github"></i>` becomes that company's own mark, inline. */
const mark = (name: string): string => inlineIcon(brands, name, 'brand mark');

/**
 * `<i data-device="laptop"></i>` becomes that machine's line drawing, inline.
 * The drawings are the rest pose of the hairline figure in `art/fleet.js`.
 * Each carries its own size in the figure's units, so a scene can draw the
 * four in scale with each other.
 */
function device(name: string): string {
  return asset(`devices/${name}.svg`)
    .replace(/<svg[^>]*viewBox="([^"]+)"[^>]*>/, (_, box: string) => {
      const [, , width, height] = box.split(' ');
      return `<svg class="device" viewBox="${box}" style="--w:${width};--h:${height}" aria-hidden="true">`;
    })
    .trim();
}

interface Clip {
  /** The inline picture: every drawing as a group. */
  svg: string;
  /** The steps that show one drawing at a time, in the clip's own timing. */
  css: string;
}

const percent = (frame: number, frames: number): string =>
  `${Number(((frame / frames) * 100).toFixed(4))}%`;

/**
 * One of Caw's drawn clips (`scripts/import-caw.mjs`), as an inline picture
 * that plays by itself: each drawing is a group, and a stepped keyframe set
 * makes each one visible for exactly the frames its take holds it. Nothing
 * moves and nothing fades; the drawings change, as they do in the product.
 */
function clip(name: string): Clip {
  const source = asset(`caw/${name}.svg`);
  const read = (key: string): string => {
    const value = source.match(new RegExp(`data-${key}="([^"]*)"`))?.[1];
    if (!value) throw new Error(`The "${name}" clip has no ${key}.`);
    return value;
  };
  const frames = Number(read('frames'));
  const holds = read('holds')
    .split(' ')
    .map((hold) => hold.split(':').map(Number) as [drawing: number, length: number]);
  const last = holds.at(-1)?.[0];

  let at = 0;
  const shown = new Map<number, [from: number, to: number][]>();
  for (const [drawing, length] of holds) {
    shown.set(drawing, [...(shown.get(drawing) ?? []), [at, at + length]]);
    at += length;
  }
  if (at !== frames) throw new Error(`The "${name}" clip's holds cover ${at} of ${frames} frames.`);

  const steps = [...shown].map(([drawing, spans]) => {
    const stops = new Map<string, string>([['0%', 'hidden']]);
    for (const [from, to] of spans) {
      stops.set(percent(from, frames), 'visible');
      if (to < frames) stops.set(percent(to, frames), 'hidden');
    }
    stops.set('100%', drawing === last ? 'visible' : 'hidden');
    const body = [...stops].map(([stop, value]) => `${stop}{visibility:${value}}`).join('');
    return `@keyframes caw-${name}-${drawing}{${body}}.caw[data-clip="${name}"]:is(:not([data-wait]),.is-playing) g[data-drawing="${drawing}"]{animation-name:caw-${name}-${drawing}}`;
  });
  const length = Math.round((frames / Number(read('fps'))) * 1000);

  const svg = source
    .replace(/<svg[^>]*>/, `<svg class="caw" viewBox="0 0 512 512" data-clip="${name}"__REST__>`)
    .replace(`data-drawing="${last}"`, `data-drawing="${last}" data-last`)
    .trim();
  return {
    svg,
    css: `.caw[data-clip="${name}"]{--caw-length:${length}ms}@media (prefers-reduced-motion:no-preference){${steps.join('')}}`,
  };
}

/** Markup shorthands in `index.html`, filled in at build time. */
function pageMarkup(): Plugin {
  const clips = new Map<string, Clip>();
  return {
    name: 'cawco-page-markup',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const page = html
          .replace(/<i data-icon="([^"]+)"><\/i>/g, (_, name: string) => icon(name))
          .replace(/<i data-mark="([^"]+)"><\/i>/g, (_, name: string) => mark(name))
          .replace(/<i data-device="([^"]+)"><\/i>/g, (_, name: string) => device(name))
          // The formatter breaks a Caw's attributes onto lines of their own, so any space leads them.
          .replace(/<i\s+data-caw="([^"]+)"([^>]*)><\/i>/g, (_, name: string, rest: string) => {
            const made = clips.get(name) ?? clip(name);
            clips.set(name, made);
            return made.svg.replace('__REST__', rest.replace(/\s+/g, ' ').trimEnd());
          });
        const tags: HtmlTagDescriptor[] = [
          {
            tag: 'style',
            attrs: { 'data-clip-steps': '' },
            children: [...clips.values()].map((made) => made.css).join(''),
            injectTo: 'head',
          },
        ];
        return { html: page, tags };
      },
    },
  };
}

/**
 * The page ground is the design tokens' paper. The stylesheet and the browser's
 * theme colour each write that value out, so the build checks both against the
 * token and stops if either has drifted.
 */
const PAPER = (
  require('../design/tokens/cawco.tokens.json') as { color: { paper: { $value: string } } }
).color.paper.$value.toLowerCase();

function mustBePaper(where: string, found: string | undefined): void {
  if (found?.toLowerCase() !== PAPER) {
    throw new Error(`${where} is ${found ?? 'missing'}, but the token color.paper is ${PAPER}.`);
  }
}

const paperGround: Plugin = {
  name: 'cawco-paper-ground',
  buildStart() {
    const styles = readFileSync(new URL('./src/styles.css', import.meta.url), 'utf8');
    mustBePaper('--paper in src/styles.css', styles.match(/--paper:\s*(#[0-9a-f]{6})/i)?.[1]);
  },
  transformIndexHtml(html) {
    mustBePaper(
      'theme-color in index.html',
      html.match(/<meta name="theme-color" content="(#[0-9a-f]{6})"/i)?.[1],
    );
  },
};

/**
 * cawco.dev/oauth/callback hands a sign-in to this path on the person's hub. The hub's
 * dashboard serves it and `MCP_OAUTH_RETURN_PATH` in packages/core names it, so the build
 * stops if the page and the core constant have drifted apart.
 */
const returnPath: Plugin = {
  name: 'cawco-oauth-return-path',
  buildStart() {
    const core = readFileSync(new URL('../packages/core/src/fleet.ts', import.meta.url), 'utf8');
    const named = core.match(/MCP_OAUTH_RETURN_PATH\s*=\s*"([^"]+)"/)?.[1];
    const page = readFileSync(new URL('./src/oauth/handoff.ts', import.meta.url), 'utf8');
    const used = page.match(/HUB_RETURN_PATH\s*=\s*'([^']+)'/)?.[1];
    if (!named || named !== used) {
      throw new Error(
        `src/oauth/handoff.ts hands sign-ins to ${used ?? 'nothing'}, but core's MCP_OAUTH_RETURN_PATH is ${named ?? 'missing'}.`,
      );
    }
  },
};

/**
 * The native app's price and free week are the app's own: the price is the Pro product in
 * apps/apple/StoreKit/CawCo.storekit, and the free week is the paywall's terms line in
 * PaywallCopy.swift. The pricing card and llms.txt both say them, so the build stops if
 * either has drifted from the app.
 */
const appPrice: Plugin = {
  name: 'cawco-app-price',
  buildStart() {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const store = JSON.parse(read('../apps/apple/StoreKit/CawCo.storekit')) as {
      products: { productID: string; type: string; displayPrice: string }[];
    };
    const pro = store.products.find((p) => p.productID === 'dev.cawco.app.pro');
    if (pro?.type !== 'NonConsumable') {
      throw new Error(
        `CawCo.storekit has no one-time dev.cawco.app.pro (found ${pro?.type ?? 'nothing'}).`,
      );
    }
    const paywall = read(
      '../apps/apple/Packages/CawCoKit/Sources/CawCoScreens/Paywall/PaywallCopy.swift',
    );
    const days = paywall.match(/"(\d+) days free, then \\\(price/)?.[1];
    if (!days) throw new Error('PaywallCopy.swift no longer says how many days are free.');
    const price = `$${pro.displayPrice}`;

    const page = read('./index.html');
    const card = page.match(/<h3>The native app<\/h3>([\s\S]*?)<\/article>/)?.[1] ?? '';
    const llms = read('./public/llms.txt');
    const claims: [where: string, text: string, says: string][] = [
      ['The pricing card in index.html', card, `<p class="price">${price} <span>once</span></p>`],
      ['The pricing card in index.html', card, `${days} days free`],
      ['public/llms.txt', llms, `${price} once`],
      ['public/llms.txt', llms, `${days} days free`],
    ];
    for (const [where, text, says] of claims) {
      if (!text.replace(/\s+/g, ' ').includes(says)) {
        throw new Error(
          `${where} doesn't say "${says}", as the app's StoreKit product and paywall do.`,
        );
      }
    }
  },
};

export default defineConfig({
  // Relative URLs, so the same build works at cawco.dev's root and under a preview path.
  base: './',
  plugins: [pageMarkup(), paperGround, returnPath, appPrice],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    // The landing page, the privacy policy, and the two pages a sign-in passes through on its
    // way back to a hub.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
        oauthStart: fileURLToPath(new URL('./oauth/start.html', import.meta.url)),
        oauthCallback: fileURLToPath(new URL('./oauth/callback.html', import.meta.url)),
      },
    },
  },
});
