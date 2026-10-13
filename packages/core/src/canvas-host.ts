/**
 * The canvas's host page (Projects spec §5.10, D24): one page the hub serves
 * at a canvas artifact's root, the same in the panel, a tab of its own and
 * the app's web view. Its code is the agent package's `canvas-host/`,
 * bundled by Bun as the preview overlay is (preview-proxy.ts
 * `buildOverlay`): the standalone binary carries it prebuilt under
 * `canvas/` (`build-binary.ts`), and a source checkout bundles it on first
 * request. Excalidraw's fonts stand beside it at `canvas/fonts/`, so the
 * page asks nothing of any other origin (`window.EXCALIDRAW_ASSET_PATH`).
 *
 * Paths, under the canvas's root: `/` the page (index.html, which the hub
 * gives the overlay), `/canvas/<file>` the bundle's files and fonts.
 */
import { rm } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { embeddedFile, standalone } from "./runtime";

/** Where the page's bundle and fonts are served, under the canvas's root. */
export const CANVAS_ASSETS = "/canvas/";

const HOST_DIR = new URL("../../agent/src/canvas-host/", import.meta.url)
  .pathname;

/** Excalidraw's own font files, in the agent package's install. */
const fontsDir = () =>
  join(
    dirname(
      Bun.resolveSync(
        "@excalidraw/excalidraw/package.json",
        join(HOST_DIR, "..")
      )
    ),
    "dist/prod/fonts"
  );

/**
 * `yjs` in the host bundle is the overlay's (canvas-host/yjs.ts, which reads
 * `window.cawcoArtifact.Y`): the page runs one Yjs, and the doc it binds is
 * the overlay's, of the same classes.
 */
const YJS = /^yjs$/;
const overlayYjs: Bun.BunPlugin = {
  name: "overlay-yjs",
  setup(build) {
    build.onResolve({ filter: YJS }, () => ({
      path: join(HOST_DIR, "yjs.ts"),
    }));
  },
};

/**
 * Bundles the host page: written to `outdir` for a release build, else
 * kept in memory. React and Excalidraw built for production; Mermaid's
 * converter is its own chunk, loaded when the agent first sends Mermaid.
 * Yjs is not in it: the overlay's is (`overlayYjs`). With
 * `CAWCO_PROBE_HOOKS=1` in the builder's environment (the probe kit's
 * scratch hub) the page exposes what it binds for the probe to read
 * (scene.ts); every other build folds the hook away.
 */
export async function buildCanvasHost(outdir?: string) {
  const result = await Bun.build({
    entrypoints: [join(HOST_DIR, "host.tsx")],
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    conditions: ["production"],
    plugins: [overlayYjs],
    define: {
      "process.env.NODE_ENV": '"production"',
      __CAWCO_PROBE_HOOKS__: String(process.env.CAWCO_PROBE_HOOKS === "1"),
    },
    naming: {
      entry: "[name].[ext]",
      chunk: "chunk-[hash].[ext]",
      asset: "asset-[hash].[ext]",
    },
    ...(outdir ? { outdir } : {}),
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Canvas host build failed");
  }
  return result.outputs;
}

/** The host page's files for a release build: the page, the bundle's outputs (`outdir`) and the fonts. */
export async function canvasHostAssets(
  outdir: string,
  filesUnder: (dir: string, prefix: string) => Promise<[string, string][]>
): Promise<[string, string][]> {
  // An earlier build's chunks are not this one's.
  await rm(outdir, { recursive: true, force: true });
  await buildCanvasHost(outdir);
  return [
    ["canvas/index.html", join(HOST_DIR, "index.html")],
    ...(await filesUnder(outdir, "canvas/files")),
    ...(await filesUnder(fontsDir(), "canvas/fonts")),
  ];
}

const DOT_SLASH = /^\.\//;
const LEADING_SLASHES = /^\/+/;

let built: Promise<Map<string, Blob>> | undefined;

/** The bundle's files by name, built once per process; a failure clears the slot so the next request retries. */
const bundle = (): Promise<Map<string, Blob>> => {
  built ??= buildCanvasHost()
    .then(
      (outputs) =>
        new Map(
          outputs.map((output) => [
            output.path.replace(DOT_SLASH, ""),
            output as Blob,
          ])
        )
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
  woff2: "font/woff2",
  ttf: "font/ttf",
  svg: "image/svg+xml",
  png: "image/png",
};

const typeOf = (name: string) =>
  TYPES[name.slice(name.lastIndexOf(".") + 1)] ?? "application/octet-stream";

const found = (body: Blob, name: string, cache: string) =>
  new Response(body, {
    headers: { "content-type": typeOf(name), "cache-control": cache },
  });

/** The page as served, before the hub gives it the overlay. */
export async function canvasHostPage(): Promise<string> {
  return await Bun.file(
    standalone
      ? embeddedFile("canvas/index.html")
      : join(HOST_DIR, "index.html")
  ).text();
}

/**
 * One of the page's files, by its path under {@link CANVAS_ASSETS}: a font
 * (`fonts/…`) or a file of the bundle; null when there is none. Fonts never
 * change; the bundle's names change with a build only where its chunks do,
 * so its entry files are not cached.
 */
export async function canvasHostFile(path: string): Promise<Response | null> {
  const name = normalize(path).replace(LEADING_SLASHES, "");
  if (name.startsWith("..")) {
    return null;
  }
  const immutable = "public, max-age=31536000, immutable";
  if (standalone) {
    const key = name.startsWith("fonts/")
      ? `canvas/${name}`
      : `canvas/files/${name}`;
    try {
      return found(
        Bun.file(embeddedFile(key)),
        name,
        name.startsWith("chunk-") || name.startsWith("fonts/")
          ? immutable
          : "no-store"
      );
    } catch {
      return null;
    }
  }
  if (name.startsWith("fonts/")) {
    const file = Bun.file(join(fontsDir(), name.slice("fonts/".length)));
    return (await file.exists()) ? found(file, name, immutable) : null;
  }
  const output = (await bundle()).get(name);
  return output ? found(output, name, "no-store") : null;
}
