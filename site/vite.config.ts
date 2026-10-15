import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { IconifyJSON } from '@iconify/types';
import { getIconData, iconToHTML, iconToSVG } from '@iconify/utils';
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';
import { deskBox, laptop } from './src/hero/machines.ts';
import { applyTheme, THEME_KEY } from './src/scheme';

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
 * Caw's black ink. Each drawing's black is his silhouette, under every other ink, as in his
 * Rive files (`assets/mascot/scripts/scene.mjs`: "the black silhouette first, each ink above it").
 */
const SILHOUETTE_INK = '#1b1b19';

/**
 * Marks each drawing's silhouette, which carries his dark rim (`.caw` in styles.css), and gives
 * the drawing `--caw-unit`, the uniform scale that places it on the 512 box: the rim's stroke is
 * drawn in the drawing's own units.
 */
function rimmed(name: string, source: string): string {
  const marked = source
    .replace(
      /<g data-drawing="(\d+)" transform="matrix\(([\d.]+) 0 0 \2 [-\d.]+ [-\d.]+\)"/g,
      (group, _drawing: string, scale: string) => `${group} style="--caw-unit:${Number(scale)}"`,
    )
    .replaceAll(`fill="${SILHOUETTE_INK}"`, `fill="${SILHOUETTE_INK}" data-silhouette`)
    .replace(/<g data-drawing="(\d+)"(?![^>]*--caw-unit)[^>]*>/, (group) => {
      throw new Error(`The "${name}" clip's drawing ${group} is not placed by a uniform scale.`);
    });
  for (const [, drawing, body = ''] of marked.matchAll(
    /<g data-drawing="(\d+)"[^>]*>(.*?)<\/g>/gs,
  )) {
    if (body.includes('<path') && !body.includes('data-silhouette')) {
      throw new Error(
        `The "${name}" clip's drawing ${drawing} has no ${SILHOUETTE_INK} silhouette.`,
      );
    }
  }
  return marked;
}

/**
 * One of Caw's drawn clips (`scripts/import-caw.mjs`), as an inline picture
 * that plays by itself: each drawing is a group, and a stepped keyframe set
 * makes each one visible for exactly the frames its take holds it. Nothing
 * moves and nothing fades; the drawings change, as they do in the product.
 */
function clip(name: string): Clip {
  const source = rimmed(name, asset(`caw/${name}.svg`));
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

/** The hero's machines (src/hero/machines.ts): `<i data-machine="laptop"></i>` becomes its drawing. */
const MACHINES: Record<string, () => string> = { laptop, 'desk-box': deskBox };

function machine(name: string): string {
  const draw = MACHINES[name];
  if (!draw) throw new Error(`No machine named "${name}".`);
  return draw();
}

/** Markup shorthands in `index.html`, filled in at build time. */
function pageMarkup(): Plugin {
  const clips = new Map<string, Clip>();
  return {
    name: 'cawco-page-markup',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // The formatter can break a closing tag across lines (`</i` then `>`), so space may lead its `>`.
        const page = html
          .replace(/<i data-machine="([^"]+)"><\/i\s*>/g, (_, name: string) => machine(name))
          .replace(/<i data-icon="([^"]+)"><\/i\s*>/g, (_, name: string) => icon(name))
          .replace(/<i data-mark="([^"]+)"><\/i\s*>/g, (_, name: string) => mark(name))
          .replace(/<i data-device="([^"]+)"><\/i\s*>/g, (_, name: string) => device(name))
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

interface ColourToken {
  $value: string;
  $extensions?: { 'dev.cawco'?: { dark?: string } };
}

const TOKENS = require('../design/tokens/cawco.tokens.json') as {
  color: Record<string, ColourToken>;
};

/** A colour token's value by day or at night, its references followed. */
function tokenColour(name: string, night: boolean): string {
  const token = TOKENS.color[name];
  if (!token) throw new Error(`No colour token named "${name}".`);
  const value = (night && token.$extensions?.['dev.cawco']?.dark) || token.$value;
  const reference = value.match(/^\{color\.([\w-]+)\}$/)?.[1];
  return reference ? tokenColour(reference, night) : value;
}

/** `oklch(L% C H)` as the sRGB hex a `theme-color` takes (CSS Color 4's OKLab matrices). */
function oklchHex(colour: string): string {
  const parts = colour.match(/^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/);
  if (!parts) throw new Error(`${colour} is not an oklch(L% C H) colour.`);
  const [l, c, h] = [Number(parts[1]) / 100, Number(parts[2]), (Number(parts[3]) * Math.PI) / 180];
  const [a, b] = [c * Math.cos(h), c * Math.sin(h)];
  const lms = [
    (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3,
    (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3,
    (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3,
  ];
  const rows = [
    [4.076_741_662_1, -3.307_711_591_3, 0.230_969_929_2],
    [-1.268_438_004_6, 2.609_757_401_1, -0.341_319_396_5],
    [-0.004_196_086_3, -0.703_418_614_7, 1.707_614_701],
  ];
  return `#${rows
    .map((row) => row.reduce((sum, k, i) => sum + k * (lms[i] ?? 0), 0))
    .map((v) => Math.min(1, Math.max(0, v)))
    .map((v) => (v <= 0.003_130_8 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * The page ground is the design tokens' paper by day and, at night, the
 * product's neutral ramp one step above its page (neutral-2; `color.background`
 * is neutral-1), the lift the whole night page takes. The stylesheet and the
 * browser's theme colours each write those values out, so the build checks them
 * against the tokens and stops if any has drifted.
 */
const PAPER = tokenColour('paper', false).toLowerCase();
const NIGHT_PAGE = tokenColour('neutral-2', true);
const NIGHT_THEME = oklchHex(NIGHT_PAGE);

/**
 * Applies the reader's kept colour scheme pick (src/theme.ts) from the page's head, before the
 * stylesheet, so the first paint is already in it. It is `applyTheme` itself, written out.
 */
const THEME_BOOT = `(${applyTheme.toString()})((() => {
  try {
    return localStorage.getItem(${JSON.stringify(THEME_KEY)}) ?? 'system';
  } catch {
    return 'system';
  }
})());`;

/** Every `<meta name="theme-color">` tag, with its attributes. */
const themeColours = (html: string) =>
  [...html.matchAll(/<meta\s[^>]*name="theme-color"[^>]*>/g)].map(([tag]) => ({
    tag,
    attrs: Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
  }));

function mustBe(where: string, found: string | undefined, token: string, value: string): void {
  if (found?.toLowerCase() !== value.toLowerCase()) {
    throw new Error(`${where} is ${found ?? 'missing'}, but the token ${token} is ${value}.`);
  }
}

const paperGround: Plugin = {
  name: 'cawco-paper-ground',
  buildStart() {
    const styles = readFileSync(new URL('./src/styles.css', import.meta.url), 'utf8');
    mustBe(
      '--brand-paper in src/styles.css',
      styles.match(/--brand-paper:\s*(#[0-9a-f]{6})/i)?.[1],
      'color.paper',
      PAPER,
    );
    mustBe(
      'The night side of --paper in src/styles.css',
      styles.match(/--paper:\s*light-dark\(var\(--brand-paper\),\s*(oklch\([^)]*\))\)/)?.[1],
      'color.neutral-2 at night',
      NIGHT_PAGE,
    );
  },
  transformIndexHtml(html, { path }) {
    const metas = themeColours(html);
    const theme = (scheme: string) => {
      const meta = metas.find(({ attrs }) => attrs['data-scheme'] === scheme);
      if (meta?.attrs.media !== `(prefers-color-scheme: ${scheme})`) {
        throw new Error(
          `${path} needs a theme-color for ${scheme} with media="(prefers-color-scheme: ${scheme})" and data-scheme="${scheme}".`,
        );
      }
      return meta.attrs.content;
    };
    mustBe(`The light theme-color in ${path}`, theme('light'), 'color.paper', PAPER);
    mustBe(
      `The dark theme-color in ${path}`,
      theme('dark'),
      `color.neutral-2 at night (${NIGHT_PAGE})`,
      NIGHT_THEME,
    );
    if (!html.includes('<meta name="color-scheme" content="light dark"')) {
      throw new Error(`${path} does not declare <meta name="color-scheme" content="light dark">.`);
    }
    const last = metas.at(-1)?.tag ?? '';
    if (html.indexOf(last) > html.indexOf('rel="stylesheet"')) {
      throw new Error(`${path} names its theme colours after its stylesheet.`);
    }
    return html.replace(last, `${last}\n    <script>${THEME_BOOT}</script>`);
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
