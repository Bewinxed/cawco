/**
 * CawCo's file viewer: what a preview answers a frame's load of a file that
 * is no HTML page with (a PDF, an image, plain text, anything else), in
 * place of the bare file, so the overlay reaches it as it reaches any page
 * (preview-proxy.ts `injectOverlay`): Comment, Draw, the pins and the hello
 * work over it by the same code, each mark standing on one of the viewer's
 * spots (file-spot.ts). The browser's own PDF viewer is a closed plugin
 * frame no script reaches, so a PDF is drawn by PDF.js (pdfjs-dist, as
 * published), the way Hypothesis reads one.
 *
 * - A PDF: its pages, each drawn by PDF.js with its text layer (so its
 *   words can be selected) as it nears the view, every page's box laid out
 *   at once so a mark on page 40 stands before page 40 is drawn.
 * - An image: the image itself, fit to the width.
 * - Text: its lines, numbered, each its own element (GitHub's `#L12`).
 * - Anything else: what it is, its name and size, and its download.
 *
 * Only a frame's load is answered so ({@link opensAsFile}: `Sec-Fetch-Dest:
 * iframe`, which the panel's frame and a decision page's Preview send): the
 * file alone in a tab of its own (`document`), a download (`empty`), an
 * `<img>`, an `<embed>` or the viewer's own fetch of the bytes still get the
 * file itself.
 *
 * Its files are the hub's, on every preview origin, under
 * {@link FILE_VIEWER_ASSETS} ({@link fileViewerFile}): `viewer.js` (the agent's
 * file-viewer/viewer.ts, which draws a PDF), `viewer.css` (the house tokens
 * and the viewer's rules) and PDF.js's published files under
 * `pdfjs-<version>/`, kept for good. The standalone binary carries them
 * built (`build-binary.ts`, {@link fileViewerAssets}); a source checkout
 * builds them on first request.
 */
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import pdfjsPackage from "pdfjs-dist/package.json" with { type: "json" };
import { humanSize } from "./attachments";
import { bundled } from "./bundled";
import {
  FILE_LOADING_ATTR,
  FILE_VIEWER_ATTR,
  SPOT_ATTR,
  SPOT_LINE_ATTR,
} from "./file-spot-marks";
import { embeddedFile, standalone } from "./runtime";
import { themeVariablesCss } from "./theme-css";
import { fileViewerWords as words } from "./words/file-viewer";

/** Where the viewer's files stand on every preview origin. */
export const FILE_VIEWER_ASSETS = "/__cawco/file/";
/** PDF.js's published files, under the viewer's, at its version: a new version is a new address, so each is kept for good. */
const PDFJS_ASSETS = `pdfjs-${pdfjsPackage.version}/`;
/** The faces' sheet the decision host serves on every preview origin (decision-host.ts). */
const FACES_SHEET = "/__cawco/decision/faces.css";

/** The most of a text file the viewer draws, bytes. Our call: a long log reads, and the page stays a few MB. */
const TEXT_MOST = 2 * 1024 * 1024;
/** How much of a file of no known type is read to tell text from bytes. */
const SNIFF_BYTES = 8192;

/** What the viewer draws of one file: a PDF, an image, text (its words, `cut` when the file holds more), or nothing it can draw. */
export type FileView =
  | { kind: "pdf" }
  | { kind: "image" }
  | { kind: "text"; text: string; cut: boolean }
  | { kind: "other" };

/** Images every engine the panel runs in draws (PDF.js's own list of them). */
const DRAWN_IMAGES = new Set([
  "image/apng",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/** Media types that are text whatever their family says. */
const TEXT_TYPES =
  /^(?:text\/|application\/(?:json|xml|javascript|ecmascript|x-yaml|yaml|toml|x-sh|sql|graphql|ld\+json|x-ndjson)|[\w.+-]+\/[\w.-]+\+(?:json|xml))/u;

/** The media type alone, lower case: `text/plain; charset=utf-8` → `text/plain`. */
const mediaOf = (type: string | null): string =>
  (type ?? "").split(";")[0].trim().toLowerCase();

/**
 * Whether `request` answered `status` with `type` loads a file into the
 * panel's frame: a frame's load (`Sec-Fetch-Dest: iframe`) of anything that
 * is no HTML page, answered whole. A tab's load, a download, an `<img>` or a
 * fetch of the same address gets the file itself.
 */
export const opensAsFile = (
  request: Request,
  status: number,
  type: string | null
): boolean => {
  const media = mediaOf(type);
  return (
    request.method === "GET" &&
    request.headers.get("sec-fetch-mode") === "navigate" &&
    request.headers.get("sec-fetch-dest") === "iframe" &&
    status >= 200 &&
    status < 300 &&
    status !== 204 &&
    status !== 205 &&
    media !== "text/html" &&
    media !== "application/xhtml+xml"
  );
};

/** The first `most` bytes of `body` (all of it when shorter), and whether it held more; the rest is never read. */
async function headOf(
  body: ReadableStream<Uint8Array> | null,
  most: number
): Promise<{ bytes: Uint8Array; more: boolean }> {
  if (!body) {
    return { bytes: new Uint8Array(), more: false };
  }
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  let more = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
    length += value.length;
    if (length > most) {
      more = true;
      break;
    }
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return { bytes: bytes.subarray(0, Math.min(length, most)), more };
}

/** Whether `bytes` read as UTF-8 words: no NUL, and no byte UTF-8 refuses (a sequence cut at the end aside). */
function readsAsText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) {
    return false;
  }
  // A character the read cut in half at its end is no refusal.
  const whole = bytes.subarray(0, Math.max(0, bytes.length - 3));
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(whole);
    return true;
  } catch {
    return false;
  }
}

/** How `body`, answered as `type`, is drawn: PDF.js for a PDF, the image for one a browser draws, text for words, else what it is. Reads as much of it as that takes. */
export async function fileViewOf(
  type: string | null,
  body: ReadableStream<Uint8Array> | null
): Promise<FileView> {
  const media = mediaOf(type);
  if (media === "application/pdf") {
    await body?.cancel().catch(() => undefined);
    return { kind: "pdf" };
  }
  if (DRAWN_IMAGES.has(media)) {
    await body?.cancel().catch(() => undefined);
    return { kind: "image" };
  }
  const named = TEXT_TYPES.test(media);
  const { bytes, more } = await headOf(body, TEXT_MOST);
  if (!(named || readsAsText(bytes.subarray(0, SNIFF_BYTES)))) {
    return { kind: "other" };
  }
  const decoded = new TextDecoder("utf-8").decode(bytes);
  // A file past the most is cut at its last whole line.
  const end = more ? decoded.lastIndexOf("\n") : -1;
  return {
    kind: "text",
    text: end > 0 ? decoded.slice(0, end) : decoded,
    cut: more,
  };
}

const esc = (text: string): string => Bun.escapeHTML(text);

/** What a file is, in a word a person reads: its extension in capitals ("PDF", "ZIP"), else its media type. */
function kindWord(name: string, type: string | null): string {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1) : "";
  return extension && extension.length <= 8
    ? extension.toUpperCase()
    : mediaOf(type) || "binary";
}

const LINE_BREAK = /\r?\n/u;

/** Text's lines, each its own spot: `#L12`, its number drawn beside it, never selected with its words. */
function linesOf(view: Extract<FileView, { kind: "text" }>): {
  count: number;
  html: string;
} {
  const lines = view.text.split(LINE_BREAK);
  // A file ending in a line break has no line after it.
  if (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }
  const html = lines
    .map(
      (line, i) =>
        `<div class="line" id="L${i + 1}" ${SPOT_ATTR}="text" ${SPOT_LINE_ATTR}="${i + 1}">${esc(line)}</div>`
    )
    .join("");
  return { count: lines.length, html };
}

/** The viewer's head: the file's name, what it is, and its download. */
const fileHead = (
  file: { name: string; src: string },
  meta: string[]
): string =>
  `<header class="file-head"><h1 class="file-name">${esc(file.name)}</h1><p class="file-meta">${meta.map((part) => `<span>${esc(part)}</span>`).join("")}</p><a class="file-download" href="${esc(file.src)}" download="${esc(file.name)}">${esc(words.download)}</a></header>`;

/**
 * The viewer page for `file`: its name, `src` (the address of its own
 * bytes, the same as the page's), media `type`, `size` in bytes when known,
 * and how it is drawn (`view`, {@link fileViewOf}). Plain HTML: the
 * overlay goes in it as in any page.
 */
export function fileViewerPage(file: {
  name: string;
  size: number | null;
  src: string;
  type: string | null;
  view: FileView;
}): string {
  const { view } = file;
  const kind = kindWord(file.name, file.type);
  const size = file.size === null ? [] : [humanSize(file.size)];
  let body: string;
  switch (view.kind) {
    case "pdf":
      body = `${fileHead(file, [kind, ...size])}<main class="file-body file-pdf"><div id="cawco-pages" class="pages" data-src="${esc(file.src)}"></div></main><script type="module" src="${FILE_VIEWER_ASSETS}viewer.js"></script>`;
      break;
    case "image":
      body = `${fileHead(file, [kind, ...size])}<main class="file-body file-image"><img id="cawco-image" ${SPOT_ATTR}="image" src="${esc(file.src)}" alt="${esc(file.name)}"></main>`;
      break;
    case "text": {
      const lines = linesOf(view);
      body = `${fileHead(file, [kind, words.lines(lines.count), ...size])}<main class="file-body file-text"><div class="sheet" style="--digits: ${Math.max(2, String(lines.count).length)}"><div class="lines">${lines.html}</div></div>${view.cut ? `<p class="file-note">${esc(words.textCut(lines.count))}</p>` : ""}</main>`;
      break;
    }
    case "other":
      body = `<main class="file-body file-other"><section id="cawco-file" class="file-card" ${SPOT_ATTR}="file"><p class="file-kind">${esc(kind)}</p><h1 class="file-name">${esc(file.name)}</h1>${size.length > 0 ? `<p class="file-meta"><span>${esc(size[0] as string)}</span></p>` : ""}<p class="file-line">${esc(words.noViewer(kind))}</p><a class="file-download" href="${esc(file.src)}" download="${esc(file.name)}">${esc(words.download)}</a></section></main>`;
      break;
    default:
      body = view satisfies never;
  }
  const loading = view.kind === "pdf" ? ` ${FILE_LOADING_ATTR}` : "";
  return `<!doctype html><html lang="en" ${FILE_VIEWER_ATTR}="${view.kind === "other" ? "file" : view.kind}"${loading}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(file.name)}</title><link rel="stylesheet" href="${FACES_SHEET}"><link rel="stylesheet" href="${FILE_VIEWER_ASSETS}viewer.css"></head><body>${body}</body></html>`;
}

/** The agent's viewer sources: its script and its sheet. */
const VIEWER_DIR = new URL("../../agent/src/file-viewer/", import.meta.url)
  .pathname;

/** PDF.js's published package, where a source checkout has it installed. */
const pdfjsRoot = (): string =>
  dirname(Bun.resolveSync("pdfjs-dist/package.json", import.meta.dir));

/** The parts of PDF.js the viewer loads: its module and worker, its text layer's sheet, and the files a PDF may ask for (character maps, the standard fonts, image decoders, a colour profile). */
const PDFJS_FILES = [
  "build/pdf.min.mjs",
  "build/pdf.worker.min.mjs",
  "web/pdf_viewer.css",
];
const PDFJS_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];

/** The viewer's script, built: viewer.ts as a minified browser module, PDF.js's address at its version in it. */
async function buildViewerScript(): Promise<string> {
  const result = await bundled("The file viewer", {
    entrypoints: [join(VIEWER_DIR, "viewer.ts")],
    target: "browser",
    format: "esm",
    minify: true,
    define: {
      __CAWCO_PDFJS__: JSON.stringify(`${FILE_VIEWER_ASSETS}${PDFJS_ASSETS}`),
    },
  });
  return result.outputs[0].text();
}

/** The viewer's sheet: the house tokens, then its own rules. */
async function buildViewerSheet(): Promise<string> {
  const own = await readFile(join(VIEWER_DIR, "viewer.css"), "utf8");
  return `${themeVariablesCss()}\n${own}`;
}

/** The viewer's script and sheet, built once per process: a failure clears it, so the next request builds again. */
let built: Promise<Map<string, string>> | undefined;
export const builtFiles = (): Promise<Map<string, string>> => {
  built ??= Promise.all([buildViewerScript(), buildViewerSheet()]).then(
    ([script, sheet]) =>
      new Map([
        ["viewer.js", script],
        ["viewer.css", sheet],
      ]),
    (error: unknown) => {
      built = undefined;
      throw error;
    }
  );
  return built;
};

/** The viewer's files for a release build: its script and sheet written to `outdir`, and PDF.js's files, each with its name under `file/`. */
export async function fileViewerAssets(
  outdir: string,
  filesUnder: (dir: string, prefix: string) => Promise<[string, string][]>
): Promise<[string, string][]> {
  const files = await builtFiles();
  await Promise.all(
    [...files].map(([name, text]) => Bun.write(join(outdir, name), text))
  );
  const root = pdfjsRoot();
  const pdfjs = `file/${PDFJS_ASSETS.slice(0, -1)}`;
  return [
    ...[...files.keys()].map((name): [string, string] => [
      `file/${name}`,
      join(outdir, name),
    ]),
    ...PDFJS_FILES.map((name): [string, string] => [
      `${pdfjs}/${name}`,
      join(root, name),
    ]),
    ...(
      await Promise.all(
        PDFJS_DIRS.map((dir) => filesUnder(join(root, dir), `${pdfjs}/${dir}`))
      )
    ).flat(),
  ];
}

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  wasm: "application/wasm",
  pfb: "application/octet-stream",
  ttf: "font/ttf",
  bcmap: "application/octet-stream",
  icc: "application/vnd.iccprofile",
};

const typeOf = (name: string) =>
  TYPES[name.slice(name.lastIndexOf(".") + 1)] ?? "application/octet-stream";

const LEADING_SLASHES = /^\/+/u;
/** Where PDF.js's files may be asked from: its listed files and its folders' files, never a path out of them. */
const PDFJS_PATH =
  /^(?:build\/pdf(?:\.worker)?\.min\.mjs|web\/pdf_viewer\.css|(?:cmaps|standard_fonts|wasm|iccs)\/[\w.+-]+)$/u;

/**
 * One of the viewer's files by its path under {@link FILE_VIEWER_ASSETS};
 * null when there is none. PDF.js's are at its version, kept for good; the
 * script and sheet are named the same build after build, so never kept.
 */
export async function fileViewerFile(path: string): Promise<Response | null> {
  const name = normalize(path).replace(LEADING_SLASHES, "");
  if (name.startsWith("..")) {
    return null;
  }
  if (name.startsWith(PDFJS_ASSETS)) {
    const inside = name.slice(PDFJS_ASSETS.length);
    if (!PDFJS_PATH.test(inside)) {
      return null;
    }
    const headers = {
      "content-type": typeOf(inside),
      "cache-control": "public, max-age=31536000, immutable",
    };
    const file = standalone
      ? (() => {
          try {
            return Bun.file(embeddedFile(`file/${name}`));
          } catch {
            return null;
          }
        })()
      : Bun.file(join(pdfjsRoot(), inside));
    return file && (await file.exists())
      ? new Response(file, { headers })
      : null;
  }
  if (name !== "viewer.js" && name !== "viewer.css") {
    return null;
  }
  const headers = { "content-type": typeOf(name), "cache-control": "no-store" };
  if (standalone) {
    try {
      return new Response(Bun.file(embeddedFile(`file/${name}`)), { headers });
    } catch {
      return null;
    }
  }
  const text = (await builtFiles()).get(name);
  return text === undefined ? null : new Response(text, { headers });
}
