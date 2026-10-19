/**
 * A decision page's host bundle (Projects spec §5.8): what draws a decision
 * page's program in the page the hub serves at its artifact's route (hub
 * decision-program.ts `programHost`), the same in the panel, a tab of its
 * own and the app's web view. Its code is the dashboard's
 * `lib/cawco/decisions/host/`: the one OpenUI renderer (OpenUiRenderer.svelte)
 * with the decision library's Svelte components on the kit's card recipe,
 * its JS bundled by Bun with Svelte's compiler (bun-plugin-svelte) and the
 * components' styles compiled by Lightning CSS (page-css.ts), as the canvas
 * host is built (canvas-host.ts): the standalone binary carries it prebuilt
 * under `decision/` (`build-binary.ts`), and a source checkout builds it on
 * first request.
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
import { compileSheets, pageFiles } from "./page-css";
import { embeddedFile, standalone } from "./runtime";

const HOST_DIR = new URL(
  "../../../apps/dashboard/src/lib/cawco/decisions/host/",
  import.meta.url
).pathname;
const KIT_DIR = new URL("../../hub/skills/decision-page/kit/", import.meta.url)
  .pathname;
/** Where the page loads the bundle's chunks and files from, on any preview origin. */
const PUBLIC_PATH = "/__cawco/decision/";

/** bun-plugin-svelte's namespace for a component's styles: `import "bun-svelte:<name>.css"`, which it appends to the component's JS. */
const SVELTE_STYLES = "bun-svelte";

/**
 * bun-plugin-svelte, with each component's styles kept out of Bun's CSS
 * bundler: the plugin's loader of a component's styles answers the CSS it
 * compiled, which is put in `styles` under its import's path as the build's
 * metafile names it, and Bun gets an empty module in its place. Pinned to
 * the plugin version it was read in (0.0.6, src/index.ts); one that loads
 * them otherwise fails the build here.
 */
function svelteStylesApart(styles: Map<string, string>): Bun.BunPlugin {
  const plugin = SveltePlugin({ development: false });
  return {
    name: `${plugin.name}, styles apart`,
    setup(build) {
      let taken = false;
      const builder: Bun.PluginBuilder = new Proxy(build, {
        get(target, key, receiver) {
          if (key === "onLoad") {
            return (
              options: Bun.PluginConstraints,
              load: Parameters<Bun.PluginBuilder["onLoad"]>[1]
            ) => {
              if (options.namespace !== SVELTE_STYLES) {
                target.onLoad(options, load);
                return builder;
              }
              taken = true;
              target.onLoad(options, async (args) => {
                const loaded = await load(args);
                if (
                  !(loaded && "contents" in loaded) ||
                  typeof loaded.contents !== "string"
                ) {
                  throw new Error(
                    `bun-plugin-svelte loaded ${args.path} without its CSS as text: read its src/index.ts again`
                  );
                }
                styles.set(`${args.namespace}:${args.path}`, loaded.contents);
                return { contents: "", loader: "js" };
              });
              return builder;
            };
          }
          const value = Reflect.get(target, key, receiver);
          return typeof value === "function"
            ? (...args: unknown[]) => {
                const returned = value.apply(target, args);
                return returned === target ? builder : returned;
              }
            : value;
        },
      });
      plugin.setup(builder);
      if (!taken) {
        throw new Error(
          `bun-plugin-svelte registered no loader in the "${SVELTE_STYLES}" namespace: read its src/index.ts again`
        );
      }
    },
  };
}

/**
 * The paths of `styles`' modules in the order Bun's CSS bundler put them in
 * one sheet: depth first from the entry, each import in source order, a
 * module where it is first reached. Each component imports its styles last,
 * so a component's sheet stands after its children's.
 */
function stylesInImportOrder(
  metafile: Bun.BuildMetafile,
  styles: ReadonlyMap<string, string>
): string[] {
  const entry = Object.values(metafile.outputs).find(
    (output) => output.entryPoint
  )?.entryPoint;
  if (!entry) {
    throw new Error("The decision host's metafile names no entry point");
  }
  const seen = new Set<string>();
  const order: string[] = [];
  const visit = (path: string) => {
    if (seen.has(path)) {
      return;
    }
    seen.add(path);
    if (styles.has(path)) {
      order.push(path);
    }
    for (const imported of metafile.inputs[path]?.imports ?? []) {
      visit(imported.entryPoint ?? imported.path);
    }
  };
  visit(entry);
  const missed = [...styles.keys()].filter((path) => !seen.has(path));
  if (missed.length > 0) {
    throw new Error(
      `The decision host's import graph reaches none of these components' styles: ${missed.join(", ")}`
    );
  }
  return order;
}

/**
 * Builds the host's files, by name: Bun's bundle of its JS, Svelte
 * compiled for the browser in production mode, and its components' styles
 * as `host.css`, in the order Bun's CSS bundler gave them.
 */
export async function buildDecisionHost(): Promise<Map<string, Blob>> {
  const styles = new Map<string, string>();
  const result = await Bun.build({
    entrypoints: [join(HOST_DIR, "host.ts")],
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    metafile: true,
    conditions: ["browser", "production"],
    plugins: [svelteStylesApart(styles), agentReact],
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
  if (!result.success) {
    throw new AggregateError(result.logs, "Decision host build failed");
  }
  await refuseSchemeLowering("The decision host", result.outputs);
  if (!result.metafile) {
    throw new Error("The decision host's build gave no metafile");
  }
  const css = await compileSheets(
    stylesInImportOrder(result.metafile, styles).map((name) => ({
      name,
      css: styles.get(name) ?? "",
    }))
  );
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
