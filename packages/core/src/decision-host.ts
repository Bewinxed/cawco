/**
 * A decision page's host bundle (Projects spec §5.8): what draws a decision
 * page's program in the page the hub serves at its artifact's route (hub
 * decision-program.ts `programHost`), the same in the panel, a tab of its
 * own and the app's web view. Its code is the dashboard's
 * `lib/cawco/decisions/host/`: the one OpenUI renderer (OpenUiRenderer.svelte)
 * with the decision library's Svelte components on the kit's card recipe,
 * bundled by Bun with Svelte's compiler (bun-plugin-svelte) as the canvas
 * host is bundled (canvas-host.ts): the standalone binary carries it
 * prebuilt under `decision/` (`build-binary.ts`), and a source checkout
 * bundles it on first request.
 *
 * Paths, on every preview origin: `/__cawco/decision/<file>`, the bundle's
 * entry (`host.js`, `host.css`), its chunks (Pele's diagram types, each
 * loaded when a page first draws one) and its files (Caw's stills, the house
 * faces from the dashboard's font packages); `dials.js` and `dials.css`,
 * DialKit with the kit's dials.js, loaded only by a page that has Dials.
 */
import { readFile, rm } from "node:fs/promises";
import { join, normalize } from "node:path";
import { SveltePlugin } from "bun-plugin-svelte";
import { embeddedFile, standalone } from "./runtime";

const HOST_DIR = new URL(
  "../../../apps/dashboard/src/lib/cawco/decisions/host/",
  import.meta.url
).pathname;
const KIT_DIR = new URL("../../hub/skills/decision-page/kit/", import.meta.url)
  .pathname;
/** Where the page loads the bundle's chunks and files from, on any preview origin. */
const PUBLIC_PATH = "/__cawco/decision/";

/**
 * Bundles the host: written to `outdir` for a release build, else kept in
 * memory. Svelte compiled for the browser in production mode, its styles
 * into `host.css`.
 */
export async function buildDecisionHost(outdir?: string) {
  const result = await Bun.build({
    entrypoints: [join(HOST_DIR, "host.ts")],
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    conditions: ["browser", "production"],
    plugins: [SveltePlugin({ development: false })],
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
    ...(outdir ? { outdir } : {}),
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Decision host build failed");
  }
  return result.outputs;
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
  return new Map([
    ["dials.js", `${kit}\n${bridge}`],
    ["dials.css", sheet ?? ""],
  ]);
}

/** The host's files for a release build: the bundle's outputs (`outdir`) and DialKit's. */
export async function decisionHostAssets(
  outdir: string,
  filesUnder: (dir: string, prefix: string) => Promise<[string, string][]>
): Promise<[string, string][]> {
  await rm(outdir, { recursive: true, force: true });
  await buildDecisionHost(outdir);
  await Promise.all(
    [...(await dialFiles())].map(([name, text]) =>
      Bun.write(join(outdir, name), text)
    )
  );
  return filesUnder(outdir, "decision");
}

const DOT_SLASH = /^\.\//;
const LEADING_SLASHES = /^\/+/;

let built: Promise<Map<string, Blob>> | undefined;

/** The bundle's files and DialKit's by name, built once per process; a failure clears the slot so the next request retries. */
const bundle = (): Promise<Map<string, Blob>> => {
  built ??= Promise.all([buildDecisionHost(), dialFiles()])
    .then(
      ([outputs, dials]) =>
        new Map<string, Blob>([
          ...outputs.map(
            (output) =>
              [output.path.replace(DOT_SLASH, ""), output as Blob] as const
          ),
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
