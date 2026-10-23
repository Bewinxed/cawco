/**
 * The canvas's host page (Projects spec §5.10, D24): one page the hub serves
 * at a canvas artifact's root, the same in the panel, a tab of its own and
 * the app's web view. Its code is the agent package's `canvas-host/`, its
 * JS bundled by Bun as the preview overlay is (preview-proxy.ts
 * `buildOverlay`) and its stylesheet (`SHEETS`) compiled by Lightning CSS
 * (page-css.ts): the standalone binary carries both prebuilt under
 * `canvas/` (`build-binary.ts`), and a source checkout builds them on first
 * request. Excalidraw's fonts stand beside them at `canvas/fonts/`, so the
 * page asks nothing of any other origin (`window.EXCALIDRAW_ASSET_PATH`);
 * its UI face is inlined into the sheet (`INLINED_FONTS`).
 *
 * Paths, under the canvas's root: `/` the page (index.html, which the hub
 * gives the overlay), `/canvas/<file>` the bundle's files (`host.css` the
 * stylesheet) and fonts.
 */
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { agentReact } from "./agent-react";
import { refuseSchemeLowering } from "./bundle-css-guard";
import { bundled } from "./bundled";
import { HOST_PLUGINS } from "./canvas-host-plugins";
import { compileSheets, pageFiles } from "./page-css";
import { embeddedFile, standalone } from "./runtime";

/** Where the page's bundle and fonts are served, under the canvas's root. */
export const CANVAS_ASSETS = "/canvas/";

const HOST_DIR = new URL("../../agent/src/canvas-host/", import.meta.url)
  .pathname;

/** Excalidraw's production build, in the agent package's install. */
const excalidrawProd = () =>
  join(
    dirname(
      Bun.resolveSync(
        "@excalidraw/excalidraw/package.json",
        join(HOST_DIR, "..")
      )
    ),
    "dist/prod"
  );

/** Excalidraw's own font files. */
const fontsDir = () => join(excalidrawProd(), "fonts");

/**
 * The page's stylesheets in cascade order, as host.tsx once imported them:
 * Excalidraw's own (its package's `./index.css` under the `production`
 * condition), then ours over it. The kit's tokens are not among them:
 * host.tsx sets them as written, ahead of this sheet.
 */
const SHEETS = () => [
  join(excalidrawProd(), "index.css"),
  join(HOST_DIR, "canvas.css"),
];

/**
 * Excalidraw's UI face, Assistant, inlined into the sheet as its four
 * `@font-face`s write it (`url("./fonts/Assistant/…")`, beside its
 * index.css): there from the first frame, so its `font-display: swap` never
 * shows the fallback face first. Every other `url()` stays as written.
 */
const INLINED_FONTS = () =>
  new Map(
    ["Regular", "Medium", "SemiBold", "Bold"].map((weight) => {
      const file = `fonts/Assistant/Assistant-${weight}.woff2`;
      return [`./${file}`, join(excalidrawProd(), file)] as const;
    })
  );

/**
 * Builds the host page's files, by name: Bun's bundle of its JS and the
 * stylesheet (`host.css`). React and Excalidraw built for production;
 * Mermaid's converter is its own chunk, loaded when the agent first sends
 * Mermaid. Its Yjs is the page's one copy: the overlay keeps its own in a
 * worker (agent preview-overlay doc-worker.ts), and hands the doc to the
 * page's replica as updates (canvas-host replica.ts).
 */
export async function buildCanvasHost(): Promise<Map<string, Blob>> {
  const [result, css] = await Promise.all([
    bundleJs(),
    compileSheets(SHEETS(), INLINED_FONTS()),
  ]);
  return pageFiles("The canvas host", result, css);
}

async function bundleJs() {
  const result = await bundled("The canvas host", {
    entrypoints: [join(HOST_DIR, "host.tsx")],
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    conditions: ["production"],
    plugins: [agentReact, ...HOST_PLUGINS],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    naming: {
      entry: "[name].[ext]",
      chunk: "chunk-[hash].[ext]",
      asset: "asset-[hash].[ext]",
    },
  });
  await refuseSchemeLowering("The canvas host", result.outputs);
  return result.outputs;
}

/** The host page's files for a release build: the page, the built files (written to `outdir`) and the fonts. */
export async function canvasHostAssets(
  outdir: string,
  filesUnder: (dir: string, prefix: string) => Promise<[string, string][]>
): Promise<[string, string][]> {
  // An earlier build's chunks are not this one's.
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await Promise.all(
    [...(await buildCanvasHost())].map(([name, file]) =>
      Bun.write(join(outdir, name), file)
    )
  );
  return [
    ["canvas/index.html", join(HOST_DIR, "index.html")],
    ...(await filesUnder(outdir, "canvas/files")),
    ...(await filesUnder(fontsDir(), "canvas/fonts")),
  ];
}

const LEADING_SLASHES = /^\/+/;

let built: Promise<Map<string, Blob>> | undefined;

/** The page's built files by name, built once per process; a failure clears the slot so the next request retries. */
const bundle = (): Promise<Map<string, Blob>> => {
  built ??= buildCanvasHost().catch((error: unknown) => {
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
