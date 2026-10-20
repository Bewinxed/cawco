/**
 * A decision page's host bundle (Projects spec §5.8): what draws a decision
 * page's program in the page the hub serves at its artifact's route (hub
 * decision-program.ts `programHost`), the same in the panel, a tab of its
 * own and the app's web view. Its code is the dashboard's
 * `lib/cawco/decisions/host/`: the one OpenUI renderer (OpenUiRenderer.svelte)
 * with the decision library's Svelte components drawn in the house's
 * utilities, its JS bundled by Bun with Svelte's compiler (bun-plugin-svelte),
 * and its sheet (`host.css`, beside them) compiled by Tailwind through PostCSS
 * (tailwindcss.com/docs/installation/using-postcss) over the dashboard's
 * design layer, then minified and lowered by Lightning CSS (page-css.ts), as
 * the canvas host is built (canvas-host.ts): the standalone binary carries it
 * prebuilt under `decision/` (`build-binary.ts`), and a source checkout builds
 * it on first request.
 *
 * Paths, on every preview origin: `/__cawco/decision/<file>`, the bundle's
 * entry (`host.js`, `host.css`), its chunks (Pele's diagram types, each
 * loaded when a page first draws one) and its files (Caw's stills, the house
 * faces from the dashboard's font packages); `dials.js` and `dials.css`,
 * DialKit with the kit's dials.js, loaded only by a page that has Dials.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, normalize } from "node:path";
import { SveltePlugin } from "bun-plugin-svelte";
import { agentReact } from "./agent-react";
import { refuseSchemeLowering } from "./bundle-css-guard";
import { bundled } from "./bundled";
import { compileSheets, pageFiles, unlayeredRules } from "./page-css";
import { embeddedFile, standalone } from "./runtime";

const HOST_DIR = new URL(
  "../../../apps/dashboard/src/lib/cawco/decisions/host/",
  import.meta.url
).pathname;
/** The host's sheet: the design layer and the `@source`s Tailwind reads. */
const HOST_CSS = join(HOST_DIR, "host.css");
const KIT_DIR = new URL("../../hub/skills/decision-page/kit/", import.meta.url)
  .pathname;
/** Where the page loads the bundle's chunks and files from, on any preview origin. */
const PUBLIC_PATH = "/__cawco/decision/";

/** The core package's own folder: unplugin-icons finds its icon sets (`@iconify-json/*`) from it. */
const CORE_DIR = new URL("../", import.meta.url).pathname;

/**
 * The house's icons as the dashboard names them (`~icons/<set>/<name>`,
 * unplugin-icons with its Svelte compiler, vite.config.ts), for the kit parts
 * the host draws (the button's pending check, the alert's glyph). Each icon is
 * unplugin-icons' own runes component (24.0.0, src/core/compilers/svelte.ts)
 * compiled to JS here, its `compiler` option's custom form: Bun hands a
 * plugin's module to no other plugin's loader, so bun-plugin-svelte never
 * reads the `.svelte` source the Svelte compiler option writes. Loaded on the
 * first build only.
 */
async function iconsPlugin(): Promise<Bun.BunPlugin> {
  const [{ default: icons }, { compile }] = await Promise.all([
    import("unplugin-icons"),
    import("svelte/compiler"),
  ]);
  return icons.bun({
    collectionsNodeResolvePath: CORE_DIR,
    compiler: {
      extension: "js",
      compiler: (svg: string) => {
        const open = svg.indexOf(">", svg.indexOf("<svg "));
        const component = `<script>const{...p}=$props()</script>${svg.slice(0, open)} {...p}>${svg.slice(open + 1)}`;
        return compile(component, { generate: "client", dev: false }).js.code;
      },
    },
  });
}

/**
 * host.css compiled by Tailwind (`@tailwindcss/postcss`, its options `base`,
 * `optimize` and `transformAssetUrls`): every `@import` inlined and a utility
 * generated for each class its `@source`s name. Lightning CSS minifies and
 * lowers it after (`optimize: false`). Loaded on the first build, as
 * Lightning CSS is: the standalone binary carries the sheet prebuilt.
 */
async function tailwindHostSheet(): Promise<string> {
  const [{ default: postcss }, { default: tailwindcss }] = await Promise.all([
    import("postcss"),
    import("@tailwindcss/postcss"),
  ]);
  const { css } = await postcss([
    tailwindcss({ base: HOST_DIR, optimize: false }),
  ]).process(await readFile(HOST_CSS, "utf8"), { from: HOST_CSS });
  return css;
}

/**
 * Builds the host's files, by name: Bun's bundle of its JS, Svelte
 * compiled for the browser in production mode, and `host.css`. A host
 * component draws in utilities only: a `<style>` of its own would reach
 * Bun's CSS bundler, which `pageFiles` refuses.
 */
export async function buildDecisionHost(): Promise<Map<string, Blob>> {
  const result = await bundled("The decision host", {
    entrypoints: [join(HOST_DIR, "host.ts")],
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    conditions: ["browser", "production"],
    plugins: [
      await iconsPlugin(),
      SveltePlugin({ development: false }),
      agentReact,
    ],
    define: { "process.env.NODE_ENV": '"production"' },
    publicPath: PUBLIC_PATH,
    // Faces and stills as files of their own: fetched by unicode-range as a
    // page needs them, and kept for good at their hashed names.
    loader: { ".woff2": "file", ".webp": "file" },
    naming: {
      entry: "[name].[ext]",
      chunk: "chunk-[hash].[ext]",
      asset: "asset-[hash].[ext]",
    },
  });
  await refuseSchemeLowering("The decision host", result.outputs);
  const css = await compileSheets([
    { name: HOST_CSS, css: await tailwindHostSheet() },
  ]);
  const unlayered = await unlayeredRules(css);
  if (unlayered.length > 0) {
    throw new Error(
      `css layers: host.css has ${unlayered.length} unlayered style rule(s); a house rule moves into its layer:\n${unlayered.join("\n")}`
    );
  }
  console.log("css layers: host.css, 0 unlayered rules");
  return pageFiles("The decision host", result.outputs, css);
}

/** DialKit (vendored in the decision-page kit) and the kit's bridge to it (dials.js), as one script and one sheet. */
async function dialFiles(): Promise<Map<string, string>> {
  const [kit, bridge, sheet] = await Promise.all(
    [
      "vendor/dialkit/browser.global.js",
      "dials.js",
      "vendor/dialkit/styles.css",
    ].map((path) => readFile(join(KIT_DIR, path), "utf8"))
  );
  // DialKit's own sheet in the libraries' layer, under the house's: the
  // host's sheet sets its look through its variables (host.css).
  return new Map([
    ["dials.js", `${kit}\n${bridge}`],
    ["dials.css", `@layer vendor {\n${sheet ?? ""}\n}\n`],
  ]);
}

/** The host's files for a release build: the bundle's outputs (`outdir`) and DialKit's. */
export async function decisionHostAssets(
  outdir: string,
  filesUnder: (dir: string, prefix: string) => Promise<[string, string][]>
): Promise<[string, string][]> {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  const [files, dials] = await Promise.all([buildDecisionHost(), dialFiles()]);
  await Promise.all([
    ...[...files].map(([name, file]) => Bun.write(join(outdir, name), file)),
    ...[...dials].map(([name, text]) => Bun.write(join(outdir, name), text)),
  ]);
  return filesUnder(outdir, "decision");
}

const LEADING_SLASHES = /^\/+/;

let built: Promise<Map<string, Blob>> | undefined;

/** The host's files and DialKit's by name, built once per process; a failure clears the slot so the next request retries. */
const bundle = (): Promise<Map<string, Blob>> => {
  built ??= Promise.all([buildDecisionHost(), dialFiles()])
    .then(
      ([files, dials]) =>
        new Map<string, Blob>([
          ...files,
          ...[...dials].map(
            ([name, text]) => [name, new Blob([text])] as const
          ),
        ])
    )
    .catch((error: unknown) => {
      built = undefined;
      throw error;
    });
  return built;
};

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  webp: "image/webp",
  woff2: "font/woff2",
};

const typeOf = (name: string) =>
  TYPES[name.slice(name.lastIndexOf(".") + 1)] ?? "application/octet-stream";

/**
 * One of the host's files, by its path under `/__cawco/decision/`; null
 * when there is none. A chunk's or a file's name is its hash, kept for
 * good; the entry and DialKit's files are named the same build after build,
 * so never kept.
 */
export async function decisionHostFile(path: string): Promise<Response | null> {
  const name = normalize(path).replace(LEADING_SLASHES, "");
  if (name.startsWith("..") || name.includes("/")) {
    return null;
  }
  const cache =
    name.startsWith("chunk-") || name.startsWith("asset-")
      ? "public, max-age=31536000, immutable"
      : "no-store";
  if (standalone) {
    try {
      return new Response(Bun.file(embeddedFile(`decision/${name}`)), {
        headers: { "content-type": typeOf(name), "cache-control": cache },
      });
    } catch {
      return null;
    }
  }
  const output = (await bundle()).get(name);
  return output
    ? new Response(output, {
        headers: { "content-type": typeOf(name), "cache-control": cache },
      })
    : null;
}
