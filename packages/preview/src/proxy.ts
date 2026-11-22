import { readdir, stat } from "node:fs/promises";
import { STATUS_CODES } from "node:http";
import { join } from "node:path";
import { refuseSchemeLowering } from "@cawco/core/bundle-css-guard";
import { bundled } from "@cawco/core/bundled";
import { fileViewerPage, fileViewOf } from "@cawco/core/file-viewer";
import type { ControlRefusal } from "@cawco/core/frames";
import { HOP_BY_HOP_HEADERS } from "@cawco/core/preview/hop-headers";
import {
  PREVIEW_DOWN_META,
  PREVIEW_DOWNS,
  PREVIEW_WHY_META,
  type PreviewDown,
} from "@cawco/core/preview/protocol";
import { OVERLAY_PATH } from "@cawco/core/preview/routes";
import { embeddedFile, standalone } from "@cawco/core/runtime";
import { DOWN_WORDS } from "@cawco/core/words/preview-down";
import type { Server, WebSocketHandler } from "bun";
import { z } from "zod";

const HEAD_OPEN = /<head(\s[^>]*)?\s*>/iu;
const HTML_OPEN = /<html(\s[^>]*)?\s*>/iu;
const DOCTYPE = /^\s*<!doctype[^>]*>/iu;
const SCRIPT_OPEN = /<script\b/iu;
let overlay: Promise<string> | undefined;

/**
 * The script injected into every previewed page, by a daemon for a session's
 * dev server and by the hub for a folder preview and a decision page. The
 * standalone binary carries it prebuilt (`build-binary.ts`); a source
 * checkout bundles the overlay on first request.
 */
function buildOverlay(): Promise<string> {
  if (standalone) {
    return Bun.file(embeddedFile("preview/overlay.js")).text();
  }
  return bundleOverlay();
}

/**
 * The overlay's doc worker (overlay/doc-worker.ts), the one
 * place the overlay's Yjs runs: a minified IIFE, carried in the overlay as
 * text and started from it as a blob, so the page's realm never evaluates
 * a Yjs of CawCo's.
 */
async function bundleDocWorker(): Promise<string> {
  const result = await bundled("The overlay's doc worker", {
    entrypoints: [new URL("./overlay/doc-worker.ts", import.meta.url).pathname],
    target: "browser",
    minify: true,
    format: "iife",
  });
  return result.outputs[0].text();
}

/**
 * The overlay's one build: overlay/overlay.ts as a minified browser IIFE,
 * its doc worker's text in it ({@link bundleDocWorker}), refused if it
 * lowers `light-dark()`. A source checkout serves it in memory
 * ({@link buildOverlay}); `build-binary.ts` writes it out to embed.
 */
export async function bundleOverlay(): Promise<string> {
  const result = await bundled("The preview overlay", {
    entrypoints: [new URL("./overlay/overlay.ts", import.meta.url).pathname],
    target: "browser",
    minify: true,
    format: "iife",
    define: { __CAWCO_DOC_WORKER__: JSON.stringify(await bundleDocWorker()) },
  });
  await refuseSchemeLowering("The preview overlay", result.outputs);
  return result.outputs[0].text();
}

/**
 * Built once per process and kept, unless the build fails — a failed build
 * throws (bundled.ts), and a rejected promise left in the cache would turn one bad request into every
 * request until restart. A failure clears the slot so the next one retries.
 */
export function loadOverlay(): Promise<string> {
  overlay ??= buildOverlay().catch((error: unknown) => {
    overlay = undefined;
    throw error;
  });
  return overlay;
}

/** The window global the overlay reads its host's allowed origins from (host-origin.ts). */
const PARENTS_GLOBAL = "__cawcoParents";

/** The last overlay gzipped, by its whole text: the parents line changes only when the hub's addresses do. */
let zipped: { text: string; body: Uint8Array<ArrayBuffer> } | undefined;
const GZIP = /\bgzip\b/iu;

/**
 * The overlay's whole text: the origins a host may frame it from
 * (`parents`, the dashboards the hub is reached from) frozen on the window
 * before it runs, so its hello is heard from those alone and a page of
 * another site that frames the preview can't take its picks; then its build.
 */
async function overlayText(parents: readonly string[]): Promise<string> {
  const named = `Object.defineProperty(window,${JSON.stringify(PARENTS_GLOBAL)},{value:Object.freeze(${JSON.stringify(parents).replaceAll("<", "\\u003c")})});`;
  return `${named}\n${await loadOverlay()}`;
}

/** The query parameter that names the overlay's key on {@link OVERLAY_PATH}. */
export const OVERLAY_KEY = "k";
/** The last key made, by the text it was made from. */
let keyed: { key: string; text: string } | undefined;

/**
 * The overlay's key now: its whole text hashed, so a new build or a new
 * parent origin is a new key. The hub writes it into every page's overlay
 * tag ({@link keyOverlay}), and serves the overlay at it for good.
 */
async function overlayKey(parents: readonly string[]): Promise<string> {
  const text = await overlayText(parents);
  if (keyed?.text !== text) {
    const hex = new Bun.CryptoHasher("sha256").update(text).digest("hex");
    keyed = { text, key: BigInt(`0x${hex.slice(0, 24)}`).toString(36) };
  }
  return keyed.key;
}

/** The overlay's address at its key now, which a page's tag names ({@link keyOverlay}). */
export const keyedOverlayPath = async (
  parents: readonly string[]
): Promise<string> =>
  `${OVERLAY_PATH}?${OVERLAY_KEY}=${await overlayKey(parents)}`;

/**
 * `answer`, a page on a preview origin (the hub's own, or one a machine's
 * listener made: neither knows the hub's parents), with its overlay tag at
 * the overlay's key now, streamed through as it is read. Never stored: a
 * kept copy would name the key it was served with, and its server's
 * validators (Vite's `no-cache` and ETag on `index.html`) name the page it
 * sent, not this one, so a reload would 304 to an old key.
 */
export async function keyOverlay(
  answer: Response,
  parents: readonly string[]
): Promise<Response> {
  const at = await keyedOverlayPath(parents);
  const rewritten = new HTMLRewriter()
    .on(`script[src="${OVERLAY_PATH}"]`, {
      element(element) {
        element.setAttribute("src", at);
      },
    })
    .transform(answer);
  const headers = new Headers(rewritten.headers);
  // The tag's new address is longer than the old.
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.delete("etag");
  headers.delete("last-modified");
  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers,
  });
}

/**
 * The overlay as a response to {@link OVERLAY_PATH} (overlay.ts, its text
 * {@link overlayText}). At its key now (`asked`, the request's `k`), it is
 * kept for good ({@link IMMUTABLE}): any change to its text is a new key,
 * which every page's tag names from then on. At any other address it is
 * the overlay as it is now, never kept. Gzipped for a browser that takes
 * it (`accepts`, the request's Accept-Encoding): it is loaded into every
 * preview, and was most of an artifact's own tab's JS (220 KB of its 640).
 */
export async function overlayResponse(
  parents: readonly string[],
  accepts: string | null,
  asked: string | null
): Promise<Response> {
  const text = await overlayText(parents);
  const current = asked !== null && asked === (await overlayKey(parents));
  const headers = {
    "content-type": "text/javascript",
    "cache-control": current ? IMMUTABLE : "no-store",
    vary: "accept-encoding",
  };
  if (!(accepts && GZIP.test(accepts))) {
    return new Response(text, { headers });
  }
  if (zipped?.text !== text) {
    zipped = { text, body: new Uint8Array(Bun.gzipSync(text)) };
  }
  return new Response(zipped.body, {
    headers: { ...headers, "content-encoding": "gzip" },
  });
}

/**
 * Which hop a machine's refusal of a preview's start says is down, and its
 * words: the kind it sent beside them (agent session.ts, core
 * `PreviewStartDown`); from a daemon from before it sent one, read off its
 * words: a workspace no boundary runs in is refused in
 * `DOWN_WORDS.workspace` (agent preview-bridge.ts `WorkspaceDown`), and
 * anything else kept the way to the server from opening.
 */
export const startRefused = (answer: {
  error?: string;
  refusal?: ControlRefusal;
}): { down: PreviewDown; why: string } => {
  const why = answer.error ?? "Preview failed";
  const said =
    answer.refusal?.kind === "unknown" ? answer.refusal.down : undefined;
  return {
    down: said ?? (why === DOWN_WORDS.workspace ? "workspace" : "reach"),
    why,
  };
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};
const escapeHtml = (text: string): string =>
  text.replaceAll(/[&"<>]/gu, (char) => HTML_ESCAPES[char] ?? char);

/**
 * What a proxy answers when the hop behind it does not: a page that says
 * so to a person who opened it in a tab of its own, and names the hop in
 * its `<meta name="cawco-preview-down">` for the pane, which draws its own
 * state from that ({@link PreviewDown}); `why`, the machine's own words for
 * it, goes in `<meta name="cawco-preview-why">` and under the sentence. The
 * pane, on the dashboard's origin, cannot read a preview origin's document,
 * so the page also posts both to its parent as `cawco:down`: nothing in it is
 * the page's, so any parent may hear it. `words` is the page's sentence:
 * the hop's own unless its sender knows more (agent preview.ts, a server a
 * stage starts again by itself).
 */
export function downResponse(
  down: PreviewDown,
  status = 502,
  why?: string,
  words: string = DOWN_WORDS[down]
): Response {
  const said = why
    ? `<meta name="${PREVIEW_WHY_META}" content="${escapeHtml(why)}">`
    : "";
  const detail = why ? `<p>${escapeHtml(why)}</p>` : "";
  // `<` as its escape, so nothing in `why` can close the script.
  const message = JSON.stringify({
    type: "cawco:down",
    down,
    why: why ?? null,
  }).replaceAll("<", "\\u003c");
  const tell = `<script>if(window.parent!==window)window.parent.postMessage(${message},"*")</script>`;
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="${PREVIEW_DOWN_META}" content="${down}">${said}<title>Preview unavailable</title></head><body><p>${escapeHtml(words)}</p>${detail}${tell}</body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
}

const DOWN_META = new RegExp(
  `<meta name="${PREVIEW_DOWN_META}" content="([a-z]+)">`,
  "u"
);
const WHY_META = new RegExp(
  `<meta name="${PREVIEW_WHY_META}" content="([^"]*)">`,
  "u"
);
const HTML_UNESCAPES: Record<string, string> = Object.fromEntries(
  Object.entries(HTML_ESCAPES).map(([char, escaped]) => [escaped, char])
);

/**
 * The hop a proxy's own page names ({@link downResponse}) and the machine's
 * words for it, read back as the pane reads its `cawco:down`: for a reader
 * on no page (the hub checking a preview no panel shows); null for a page
 * the previewed server answered.
 */
export function downOf(
  html: string
): { down: PreviewDown; why: string | null } | null {
  const named = DOWN_META.exec(html)?.[1];
  const down = PREVIEW_DOWNS.find((hop) => hop === named);
  if (!down) {
    return null;
  }
  const why = WHY_META.exec(html)?.[1];
  return {
    down,
    why:
      why === undefined
        ? null
        : why.replaceAll(
            /&(?:amp|quot|lt|gt);/gu,
            (escaped) => HTML_UNESCAPES[escaped] ?? escaped
          ),
  };
}

/** The longest line of a page's error a preview's error page quotes. Our call: one sentence of a stack's head. */
const ERROR_LINE_CHARS = 240;
/** Vite's own error page (vite 8.3.5 `errorMiddleware`): "const error = ${JSON.stringify(prepareError(err))…}", on one line. */
const VITE_ERROR = /const error = (\{.*\})\s*$/mu;
/** The part of Vite's error object read: its message. */
const VITE_ERROR_SHAPE = z.object({ message: z.string() });
/** A line naming an error: "TypeError: …", "Error: …", "Internal Server Error". */
const ERROR_NAMED = /\b(?:[A-Z]\w*)?Error\b/u;
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};
/** `html`'s text, a line per block, entities read back. */
const textLines = (html: string): string[] =>
  html
    .replaceAll(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "\n")
    .replaceAll(/<!--[\s\S]*?-->/gu, "\n")
    .replaceAll(/<[^>]*>/gu, "\n")
    .replaceAll(
      /&(?:amp|lt|gt|quot|#39|nbsp);/gu,
      (one) => HTML_ENTITIES[one] ?? one
    )
    .split("\n")
    .map((line) => line.replaceAll(/\s+/gu, " ").trim())
    .filter(Boolean);
/** `html`'s first heading. */
const HEADING = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/iu;

/**
 * The first line of the error a page that answered an error status shows
 * (`body`, as its server sent it),
 * as a person opening it would read it first: Vite's error page's own
 * message (its overlay draws it), else the page's first line naming an
 * error ("TypeError: …"), its first heading (SvelteKit's error page puts
 * the error's message there), its first line of text (its title, or a
 * plain text answer's first line); null for a page with no text.
 */
const errorLineOf = (body: string): string | null => {
  const firstLine = (text: string): string | undefined =>
    text
      .split("\n")
      .map((one) => one.trim())
      .find(Boolean);
  const vite = VITE_ERROR.exec(body)?.[1];
  let viteSaid: string | undefined;
  if (vite) {
    try {
      const read = VITE_ERROR_SHAPE.safeParse(JSON.parse(vite));
      viteSaid = read.success ? firstLine(read.data.message) : undefined;
    } catch {
      // Not Vite's object after all: the page's own text says it.
    }
  }
  const lines = textLines(body);
  const said =
    viteSaid ??
    lines.find((one) => ERROR_NAMED.test(one)) ??
    (textLines(HEADING.exec(body)?.[1] ?? "").join(" ") || undefined) ??
    lines[0];
  if (!said) {
    return null;
  }
  return said.length > ERROR_LINE_CHARS
    ? `${said.slice(0, ERROR_LINE_CHARS - 1)}…`
    : said;
};

/**
 * Whether `request` is a document's load (a frame's, a tab's): the one a
 * browser draws its own error face for when its answer is an error status
 * with nothing it can draw. A page's own fetches, its modules and its
 * sockets are not, and keep their status.
 */
export const loadsDocument = (request: Request): boolean =>
  request.headers.get("sec-fetch-mode") === "navigate" &&
  request.method === "GET";

/**
 * A document's load its server answered with error status `status` and
 * nothing the browser can draw (`body`, what it sent: empty, or not HTML;
 * an HTML error page is the page being built, and is served as one), core
 * `PreviewDown` `error`: CawCo's own down page in its place, at the same status, its why the status and the first line of the
 * error the page showed ({@link errorLineOf}), else the status's own words.
 * A route that isn't there any more answers 404 with nothing to draw, and
 * Chromium drew its grey broken-frame face in the frame, with no words
 * (owner, 2026-11-06).
 */
export const errorPageResponse = (status: number, body: string): Response =>
  downResponse("error", status, errorWhy(status, body));

/** A page answered error status `status` with `body`, in one line: the status and the error's first line ({@link errorLineOf}), else the status's own words. */
export function errorWhy(status: number, body: string): string {
  const line = errorLineOf(body);
  return line
    ? `${status}: ${line}`
    : `${status} ${STATUS_CODES[status] ?? ""}`.trim();
}

/** How long one hop's line for one preview and cause stands for every repeat of it. Our call: a dev server's client retries each second. */
const FAILURE_LINE_MS = 60_000;
const failureLines = new Map<string, { at: number; repeats: number }>();

/**
 * One line in the journal for a preview request that failed, at the hop
 * that failed (`hub listener`, `agent listener`, `bridge`): which preview,
 * and its cause. A preview whose server is down is asked again every second
 * by its page's own client, so the same hop, preview and cause log once per
 * {@link FAILURE_LINE_MS}, the next line counting the repeats in between.
 */
export function previewFailed(
  hop: string,
  instanceId: string | null | undefined,
  cause: string
): void {
  const key = `${hop}\u0000${instanceId}\u0000${cause}`;
  const now = Date.now();
  const last = failureLines.get(key);
  if (last && now - last.at < FAILURE_LINE_MS) {
    last.repeats += 1;
    return;
  }
  const repeats = last?.repeats
    ? ` (${last.repeats} more since the last line)`
    : "";
  failureLines.set(key, { at: now, repeats: 0 });
  console.warn(
    `[preview] ${hop}: ${instanceId ? `preview of ${instanceId}` : "a request naming no session"} failed: ${cause}${repeats}`
  );
}

/** A thrown value's cause, as one line: its code when it has one, and its message. */
export const causeOf = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const { code } = error as { code?: unknown };
  return typeof code === "string" && !error.message.includes(code)
    ? `${error.message} (${code})`
    : error.message;
};

/** A page's identity for the choices bridge: sha256 of the HTML as it was served, before injection. */
export const pageHash = (html: string): string =>
  new Bun.CryptoHasher("sha256").update(html).digest("hex");

const ATTRIBUTE_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
};

/**
 * Where the overlay's tag goes: before every script of the page's, so its
 * hold (preview overlay/hold.ts) wraps each frame and timer the page asks
 * for, and before Vite's deferred `/@vite/client` module. First in <head>;
 * with no <head>, after <html> or the doctype, where the parser opens the
 * head for it; with neither, first of all. A script standing before that
 * place comes after the tag. A head-less page once had the tag at its body's
 * end, after its own scripts: an interval it started there kept running
 * while its tab was off screen, held or not.
 */
function overlayAt(html: string): number {
  const after = (pattern: RegExp) => {
    const found = pattern.exec(html);
    return found ? found.index + found[0].length : null;
  };
  const place = after(HEAD_OPEN) ?? after(HTML_OPEN) ?? after(DOCTYPE) ?? 0;
  const script = html.search(SCRIPT_OPEN);
  return script !== -1 && script < place ? script : place;
}

/**
 * Every framed page's root keeps its scrollbar's gutter, so a classic
 * scrollbar coming or going never changes the width the page lays out in.
 * A page that scales itself to its window's width (a design preview's frame
 * fit from a ResizeObserver) otherwise shakes in the panel: the scrollbar
 * takes width, the scale and the height drop under the window's, the
 * scrollbar goes, and round again every frame (owner, 2026-10-25: "this page
 * keeps shaking with scrollbars opening and closing rapidly";
 * artifact-resize-loop's still leg). "When using classic scrollbars, the
 * gutter will be present if overflow is auto, scroll, or hidden even if the
 * box is not overflowing. When using overlay scrollbars, the gutter will not
 * be present" (developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-gutter).
 *
 * The page's own word wins: the rule stands in a cascade layer declared
 * before any of the page's (the tag goes first in its head,
 * {@link overlayAt}), and every unlayered rule, and every later layer, of
 * the page's outranks it, whatever its specificity (`:where` keeps it at
 * none as well). A page that sets `scrollbar-gutter: auto` on its root
 * (the canvas's host page, which never scrolls) has no gutter.
 */
const GUTTER_FLOOR =
  "<style>@layer cawco-floor{:where(html){scrollbar-gutter:stable}}</style>";

/**
 * The page with the overlay's script tag in it ({@link overlayAt}), carrying
 * the page's hash and `data` as `data-*` attributes (the hub's page
 * artifacts add their id and their document's state, so the overlay fills
 * the page before it paints), and the root's gutter kept before it
 * ({@link GUTTER_FLOOR}). `hash` is the page's when its HTML is not what
 * it is: a decision page's program, which the host page around it draws.
 */
export function injectOverlay(
  html: string,
  data: Record<string, string> = {},
  hash: string = pageHash(html)
): string {
  const extra = Object.entries(data)
    .map(
      ([name, value]) =>
        ` data-${name}="${value.replaceAll(/[&"<]/gu, (char) => ATTRIBUTE_ESCAPES[char] ?? char)}"`
    )
    .join("");
  const script = `<script src="${OVERLAY_PATH}" data-page-hash="${hash}"${extra}></script>`;
  const at = overlayAt(html);
  return html.slice(0, at) + GUTTER_FLOOR + script + html.slice(at);
}

/*
 * A static folder's files at one state of the folder: `/__cawco/v/<key>/<path>`
 * under the page's mount, `key` naming every file's path, size and change
 * time. The page's document stays where it is, uncached (`no-store`), and its
 * own references to its files are written to these addresses
 * ({@link versionAssets}); what a file loads relative to its own address
 * (a module's imports, a script's `new URL(…, import.meta.url)`, a sheet's
 * `url(…)`) is at the same key. So a file is served for good
 * ({@link IMMUTABLE}): a change to any file of the folder is a new key and
 * a new address for every file, and no cache can hand an old file to a
 * page that asked for the new one. A frame loaded again (a reload, a tab
 * back from parked) asks the network for its document alone.
 *
 * What a script builds from a root path or the document's base
 * (`fetch("/x.riv")`, `new URL(x, document.baseURI)`) is not at the key, and
 * stays `no-store`: only a key makes a kept file safe. Kept by validation
 * instead (`no-cache` and an ETag), a file is what Cloudflare's Browser
 * Cache TTL rewrote to `max-age=14400` and served four hours stale.
 *
 * `immutable` with a year's `max-age`, `public`: Cloudflare in front of a
 * dashboard rewrites a `Cache-Control` shorter than its Browser Cache TTL
 * ("Cloudflare overrides any Cache-Control or Expires headers with values set
 * via the Browser Cache TTL option … if the value of the Cache-Control header
 * from the origin web server is less than the Browser Cache TTL setting",
 * developers.cloudflare.com/cache/how-to/edge-browser-cache-ttl/set-browser-ttl/),
 * which turned a dev server's `no-cache` into four hours stale; a year is
 * longer than any TTL it sets, and an address that never changes its bytes
 * may be kept anywhere. `immutable` "has no effect on public caches like
 * Cloudflare, but does change browser behavior": no revalidation, even on a
 * reload (developers.cloudflare.com/cache/concepts/cache-control/).
 */
export const IMMUTABLE = "public, max-age=31536000, immutable";
const VERSIONED = /^\/__cawco\/v\/([0-9a-z]+)(\/.*)$/u;
const BASE_TAG = /<base[\s>]/iu;
const LEADING_SLASH = /^\//u;
/** The overlay's own and the hub's: never one of the page's files. */
const RESERVED_PATH = "/__cawco/";

/** A `Cache-Control` value's directive names, lower case. */
const directives = (value: string | null): Set<string> =>
  new Set(
    (value ?? "")
      .split(",")
      .map((part) => part.split("=")[0]?.trim().toLowerCase() ?? "")
  );

/**
 * What a port preview's answer may say of itself downstream, from what its
 * server said (`upstream`). `direct`: the request reached the hub on a
 * session's own port listener, which no CDN stands in front of; host mode's
 * by-Host listener is where DNS or a proxy brings the names, Cloudflare on
 * the owner's.
 *
 * - `immutable` (Vite's `?v=` deps, "strongly cached with HTTP headers
 *   `max-age=31536000,immutable`", vite.dev/guide/dep-pre-bundling#browser-cache;
 *   a folder's file at its key): kept everywhere, validators too. An
 *   address that never changes its bytes is safe in any cache.
 * - `no-cache` with its `etag`/`last-modified`, on a direct path only: the
 *   browser revalidates each module and the dev server answers 304.
 * - `no-store` otherwise, validators dropped: a missing header, an app's own
 *   `max-age`, or `no-cache` where a CDN may stand. Cloudflare rewrites
 *   `no-cache`, `max-age=0` and a missing header to its Browser Cache TTL and
 *   keeps the file at its edge (`max-age=14400`, a module four hours stale);
 *   `no-store` is the one value it leaves alone ("Will not cache",
 *   developers.cloudflare.com/cache/concepts/cache-control/).
 */
function previewCache(
  upstream: Headers,
  direct: boolean
): "immutable" | "no-cache" | "no-store" {
  const said = directives(upstream.get("cache-control"));
  if (said.has("no-store")) {
    return "no-store";
  }
  if (said.has("immutable")) {
    return "immutable";
  }
  return direct && said.has("no-cache") ? "no-cache" : "no-store";
}

/**
 * `headers`, a port preview's answer of `status` on its way down, saying of
 * itself what {@link previewCache} lets it. A 304 goes on as it came: it
 * carries no policy of its own (Vite's has no headers), and the one its
 * stored answer carries stands.
 */
export function cachePreview(
  headers: Headers,
  status: number,
  direct: boolean
): void {
  if (status === 304) {
    return;
  }
  const policy = previewCache(headers, direct);
  headers.delete("expires");
  if (policy === "immutable") {
    return;
  }
  headers.set("cache-control", policy);
  if (policy === "no-store") {
    headers.delete("etag");
    headers.delete("last-modified");
  }
}

/**
 * `answer` marked `no-transform`, to go to the browser as its server and
 * CawCo sent it. Cloudflare, before host mode's names on the owner's, writes
 * its Web Analytics beacon into each HTML page it proxies (`<script
 * type="module" src="https://static.cloudflareinsights.com/beacon.min.js/…"
 * data-cf-beacon>`), so every load of a preview loaded a script of no one's
 * asking, refused where that host is blocked (`net::ERR_CONNECTION_REFUSED`
 * on each load, obelisk, 2026-11-22). "If you have a `Cache-Control` header
 * set to `public, no-transform`, Cloudflare proxy will not be able to modify
 * the original payload … the Beacon script will not be automatically
 * injected" (developers.cloudflare.com/web-analytics/faq/). Set after
 * {@link compressed}, which gzips nothing marked so.
 */
export function untransformed(answer: Response): Response {
  const said = answer.headers.get("cache-control");
  if (directives(said).has("no-transform")) {
    return answer;
  }
  const headers = new Headers(answer.headers);
  headers.set("cache-control", said ? `${said}, no-transform` : "no-transform");
  return new Response(answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers,
  });
}

/**
 * What {@link compressed} gzips, by media type: text, scripts, JSON, wasm and
 * SVG. An event stream is text too, but gzip holds its events back until a
 * block fills, so it goes as it is.
 */
const COMPRESSIBLE =
  /^(?:text\/(?!event-stream$)|application\/(?:javascript|json|wasm)$|image\/svg\+xml$)/u;

/** Whether `answer` is one {@link compressed} gzips for a client that takes `acceptEncoding`. */
const gzips = (answer: Response, acceptEncoding: string | null): boolean => {
  const type =
    answer.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ??
    "";
  return (
    answer.status === 200 &&
    !!answer.body &&
    !!acceptEncoding &&
    GZIP.test(acceptEncoding) &&
    !answer.headers.has("content-encoding") &&
    COMPRESSIBLE.test(type) &&
    !directives(answer.headers.get("cache-control")).has("no-transform")
  );
};

/** `answer`'s headers as its gzipped copy says them. */
const gzippedHeaders = (answer: Response): Headers => {
  const headers = new Headers(answer.headers);
  headers.set("content-encoding", "gzip");
  headers.append("vary", "accept-encoding");
  headers.delete("content-length");
  const etag = headers.get("etag");
  if (etag && !etag.startsWith("W/")) {
    headers.set("etag", `W/${etag}`);
  }
  return headers;
};

/**
 * The gzipped bodies of answers kept for good (`immutable`), by their
 * address: an address that never changes its bytes is compressed once. A
 * stage's keyed modules are (stage-host `MODULES_PATH`), and a decision
 * page's embeds asked the hub for each about 3 times, a ~1 ms of its main
 * thread per 222 KB gzipped each time. The least recently served go first
 * past {@link KEPT_BYTES}.
 */
const kept = new Map<string, Uint8Array<ArrayBuffer>>();
let keptBytes = 0;
/** What the hub keeps of them at most. Our call: a few canvases' graphs, gzipped. */
const KEPT_BYTES = 64 * 1024 * 1024;

const keep = (address: string, body: Uint8Array<ArrayBuffer>): void => {
  kept.set(address, body);
  keptBytes += body.byteLength;
  for (const [old, bytes] of kept) {
    if (keptBytes <= KEPT_BYTES) {
      break;
    }
    kept.delete(old);
    keptBytes -= bytes.byteLength;
  }
};

/**
 * `answer` gzipped for a client that takes it (`acceptEncoding`, the
 * request's Accept-Encoding), once, by the hop that sends it to the browser
 * after its own rewriting: a dev server compresses nothing, and Vite's
 * modules and a folder's bundle are most of a preview's bytes. Only a whole
 * 200 of a {@link COMPRESSIBLE} type with a body and no encoding yet (the
 * overlay is gzipped already), never one that says `no-transform`. A strong
 * ETag becomes weak, as the bytes are no longer the server's; a weak one
 * (Vite's) is the same representation's still. An answer kept for good
 * (`immutable`) is gzipped once for its `address` ({@link kept}) and its
 * stored copy served again; any other is gzipped as it streams.
 */
export async function compressed(
  answer: Response,
  acceptEncoding: string | null,
  address: string
): Promise<Response> {
  if (!gzips(answer, acceptEncoding)) {
    return answer;
  }
  const headers = gzippedHeaders(answer);
  const init = {
    status: answer.status,
    statusText: answer.statusText,
    headers,
  };
  if (!directives(answer.headers.get("cache-control")).has("immutable")) {
    return new Response(
      answer.body?.pipeThrough(new CompressionStream("gzip")),
      init
    );
  }
  let body = kept.get(address);
  if (body) {
    // Served again: the last to go.
    kept.delete(address);
    kept.set(address, body);
    await answer.body?.cancel();
  } else {
    body = Bun.gzipSync(new Uint8Array(await answer.arrayBuffer()));
    keep(address, body);
  }
  return new Response(body, init);
}

/** What a file's answer says no longer once the viewer page stands in its place: the file's own length, encoding, range and validators. */
const FILE_ONLY_HEADERS = [
  "accept-ranges",
  "content-disposition",
  "content-encoding",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
] as const;

/**
 * The viewer page (core file-viewer.ts) for the file at `url` answered with
 * `headers` and `body`, `size` bytes when its folder said (else its
 * answer's length): what a frame's load of a file that is no HTML page
 * gets, a machine's server's (agent preview.ts) or a folder preview's
 * (hub preview-server/serve.ts). `headers` become the page's: HTML, never
 * kept.
 */
export async function fileViewerOf(
  url: URL,
  headers: Headers,
  body: ReadableStream<Uint8Array> | null,
  size: number | null
): Promise<string> {
  const type = headers.get("content-type");
  const length = Number(headers.get("content-length"));
  const name = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
  const page = fileViewerPage({
    name: name || url.hostname,
    src: `${url.pathname}${url.search}`,
    type,
    size: size ?? (Number.isFinite(length) && length > 0 ? length : null),
    view: await fileViewOf(type, body),
  });
  for (const header of FILE_ONLY_HEADERS) {
    headers.delete(header);
  }
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  return page;
}

/** A versioned address's file, its path under the mount; null when `pathname` is not one. */
export const versionedFile = (pathname: string): string | null =>
  pathname.match(VERSIONED)?.[2] ?? null;

/** Each file under `root` as it is now, by its path from `root`, in path order. */
async function folderFiles(
  root: string
): Promise<{ mtimeMs: number; name: string; size: number }[]> {
  const names = (await readdir(root, { recursive: true })).sort();
  const stats = await Promise.all(
    names.map((name) => stat(join(root, name)).catch(() => null))
  );
  return names.flatMap((name, index) => {
    const one = stats[index];
    return one?.isFile()
      ? [{ name, size: one.size, mtimeMs: one.mtimeMs }]
      : [];
  });
}

/** The key of `root`'s files as they are now: each one's path, size and change time, hashed. */
export async function folderKey(root: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const { name, size, mtimeMs } of await folderFiles(root)) {
    hasher.update(`${name}\0${size}\0${mtimeMs}\n`);
  }
  return BigInt(`0x${hasher.digest("hex").slice(0, 24)}`).toString(36);
}

/** The attributes that name one of the page's files, by the elements that carry them. */
const FILE_ATTRIBUTES: [selector: string, attribute: string][] = [
  ["script[src]", "src"],
  ["link[href]", "href"],
  ["img[src]", "src"],
  ["source[src]", "src"],
  ["video[src]", "src"],
  ["video[poster]", "poster"],
  ["audio[src]", "src"],
  ["track[src]", "src"],
  ["input[src]", "src"],
];

/**
 * `html`, served at `documentPath` under `mount` (the page's root, `/` on its
 * own origin), with each reference to one of its own files written to that
 * file's address at `key`. A reference elsewhere (another origin, a data URL,
 * the overlay's own `/__cawco/`) stays as it is, and so does a document with
 * a `<base>` of its own, whose references resolve against that.
 */
export function versionAssets(
  html: string,
  key: string,
  mount: string,
  documentPath: string
): string {
  if (BASE_TAG.test(html)) {
    return html;
  }
  const document = new URL(
    `${mount}${documentPath.replace(LEADING_SLASH, "")}`,
    "http://page.invalid"
  );
  const versioned = (reference: string): string | null => {
    const trimmed = reference.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return null;
    }
    let url: URL;
    try {
      url = new URL(trimmed, document);
    } catch {
      return null;
    }
    const inside = url.pathname.slice(mount.length - 1);
    if (
      url.origin !== document.origin ||
      !url.pathname.startsWith(mount) ||
      inside.startsWith(RESERVED_PATH)
    ) {
      return null;
    }
    return `${mount}__cawco/v/${key}${inside}${url.search}${url.hash}`;
  };
  let rewriter = new HTMLRewriter();
  for (const [selector, attribute] of FILE_ATTRIBUTES) {
    rewriter = rewriter.on(selector, {
      element(element) {
        const at = versioned(element.getAttribute(attribute) ?? "");
        if (at) {
          element.setAttribute(attribute, at);
        }
      },
    });
  }
  return rewriter.transform(html);
}

/**
 * The header the hub's relay carries to a machine's preview listener, and the
 * listener answers nothing without: the token the hub made for the start that
 * opened that listener, handed to the agent in `preview start` on its hub
 * socket and to no one else. So a preview is reached only through its hub,
 * behind the hub's lock; a request straight to the listener's port is
 * refused, on HTTP and on WebSocket upgrades alike.
 */
export const RELAY_HEADER = "x-cawco-relay";

/**
 * `request` sent on to `url` with `headers`, its body streamed: a redirect
 * and a compressed body come back as they are, for the caller to relay.
 */
export const forwardRequest = (
  url: string,
  request: Request,
  headers: Headers
): Promise<Response> =>
  fetch(url, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
    decompress: false,
  });

/**
 * A request held open for as long as what serves it takes to answer, on
 * every hop that carries one on (the agent's loopback carrying the hub, the
 * dashboard's tailnet HTTPS, the hub's preview listener, the machine's
 * preview listener). Bun closes a
 * connection whose request has been silent for its `idleTimeout`, "@default
 * 10" (bun-types serve.d.ts), and a page's first load waits on its server's
 * wake (agent stage.ts `wakeSource`: up to core `STAGE_READY_MS`) and on the
 * dev server's first compile, which together pass 10 s. Cut there, the
 * browser got no answer at all ("Empty reply from server" over HTTP/1.1,
 * "Error in the HTTP2 framing layer" over HTTP/2, measured on Bun 1.4.4),
 * and the panel's frame showed Chromium's grey error page instead of the
 * app or CawCo's own down page. "`0` means no timeout" (bun-types
 * `Server.timeout`); the wait is bounded by the wake's own deadlines and
 * what the server answers.
 */
export const heldWhileServed = (
  server: { timeout: (request: Request, seconds: number) => void },
  request: Request
): void => server.timeout(request, 0);

/** Whether `request` asks to open a WebSocket. */
export const asksUpgrade = (request: Request): boolean =>
  request.headers.get("upgrade")?.toLowerCase() === "websocket";

/**
 * The answer to a WebSocket upgrade whose preview isn't up yet (its
 * machine's listener not started, its stage asleep, starting or waking):
 * refused at once while the wake goes on, never held through it as a
 * page's load is ({@link heldWhileServed}). A browser opens one WebSocket
 * handshake at a time per address ("There MUST be no more than one
 * connection in a CONNECTING state", RFC 6455 §4.1.2, which Chromium's
 * WebSocketEndpointLockManager keeps until the upgrade answers), and every
 * preview origin under host mode's domain shares the proxy's addresses: one
 * upgrade held through a wake held every other socket in the tab with it,
 * a decision page's doc socket among them. The client tries again on its
 * own: Vite's client pings its server's socket each second until it
 * opens, then reloads; y-websocket backs off up to 2.5 s.
 */
export const notUpYet = (): Response =>
  new Response(
    "The preview's server isn't up yet: it is starting now. Open the socket again in a moment.",
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "retry-after": "1",
      },
    }
  );

// The DOM ambient declaration hides Bun's headers-and-protocols overload.
const ProxyWebSocket = WebSocket as typeof WebSocket & {
  new (url: string, options: Bun.WebSocketOptions): WebSocket;
};

/** A client WebSocket with Bun's options (headers above all), which the DOM's declaration hides. */
export const openWebSocket = (
  url: string,
  options: Bun.WebSocketOptions
): WebSocket => new ProxyWebSocket(url, options);

export function proxyHeaders(input: Headers): Headers {
  const headers = new Headers(input);
  for (const name of (headers.get("connection") ?? "").split(",")) {
    if (name.trim()) {
      headers.delete(name.trim());
    }
  }
  for (const name of HOP_BY_HOP_HEADERS) {
    headers.delete(name);
  }
  return headers;
}

/**
 * A fetched response's headers as they go on down ({@link proxyHeaders}):
 * fetch has already decoded the body, so a `content-encoding` left on the
 * way down would label plain bytes as gzip and the browser refuses them;
 * the encoding and its length go.
 */
export function decodedHeaders(input: Headers): Headers {
  const headers = proxyHeaders(input);
  if (headers.has("content-encoding")) {
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  return headers;
}

export interface PreviewSocket {
  closed: boolean;
  /** The upstream's close, heard before this socket opened: said to it once it opens. */
  ended?: { code: number; reason: string };
  headers: Headers;
  /** The hop relaying it and the preview's session, for its failure's line; null for a hop that serves no one session (the agent's hub loopback). */
  hop: string;
  instanceId: string | null;
  /** Nothing listens at `url` any more: the hop forgets where it sent it (the hub's stale machine listener). */
  nothingListens?: () => void;
  /** What the upstream said that this socket has not taken yet, in order ({@link sendInOrder}); what it said before this socket opened among it. */
  owed?: (string | ArrayBuffer)[];
  /** The subprotocol the upstream picked of {@link protocols}, once it opened; "" when it picked none. */
  protocol: string;
  /** The subprotocols the browser offered, in its order, offered to the upstream as they came. */
  protocols: string[];
  /** The viewer's own release, once its socket opened; said when it closes. */
  release?: () => void;
  /**
   * The name a `wss://` `url` at an address verifies its certificate
   * against (the agent's loopback to the hub's tailnet name, agent
   * hub-loopback.ts); the URL's own host when absent.
   */
  serverName?: string;
  /** The socket to `url`, open before this one is ({@link openUpstream}). */
  upstream?: WebSocket;
  url: string;
  /**
   * A viewer the socket is, counted when it opens and released when it
   * closes: a stage counts its viewers by it (agent `stage.ts`). Counted at
   * the open, never at the upgrade's request, so a page that goes before its
   * socket opens (a reload under it) leaves no count behind.
   */
  viewer?: () => () => void;
}

/**
 * What of Bun's `ServerWebSocket` the relay ({@link previewWebSocket}) reads:
 * its data, a send and a close. The hub relays a browser's view through it
 * from a socket Elysia holds, handed in as these alone (hub
 * browser-routes.ts). `send` answers as Bun's does (bytes written, -1 taken
 * into a buffer that backs up, 0 not taken); undefined from a socket that
 * keeps its own order, which never owes.
 */
export interface PreviewSocketEnd {
  close: (code: number, reason: string) => void;
  readonly data: PreviewSocket;
  send: (frame: string | ArrayBuffer) => number | undefined;
}

/** Bun's words for a client socket that failed, before its reason. */
const FAILED_PREFIX = /^WebSocket connection to '[^']*' failed: /u;
/** Bun's reason when no connection opened at all (`ECONNREFUSED`): no listener there. */
const NOT_CONNECTED = "Failed to connect";

/** Why a client socket failed, in Bun's words: "Expected 101 status code" (the server answered the upgrade with another status), "Connection ended" (it closed the connection on it), "Failed to connect". */
const failureOf = (event: Event): string =>
  (event as ErrorEvent).message?.replace(FAILED_PREFIX, "") ||
  "no reason given";

/**
 * How long a hop waits for its upstream to take a socket before it refuses
 * the browser's. Our call: a dev server answers an upgrade at once, and each
 * hop behind this one answers within its own wait; a browser holds every
 * other socket to the same address until this one answers (core
 * `notUpYet`), so the wait is short.
 */
const SOCKET_OPEN_MS = 10_000;

/**
 * Opens `data`'s socket to its `url`: null once it opened, its upstream in
 * `data.upstream` and its pick of the offered subprotocols in
 * `data.protocol`; else why it didn't, the socket closed. What the upstream
 * says before the relayed socket opens is kept in `data.owed`, and a close
 * in `data.ended`, for {@link previewWebSocket} `open`. `signal`: the
 * browser's request, whose going ends the wait.
 */
export function openUpstream(
  data: PreviewSocket,
  signal?: AbortSignal
): Promise<string | null> {
  const upstream = new ProxyWebSocket(data.url, {
    protocols: data.protocols,
    headers: Object.fromEntries(data.headers),
    // Bun's client verifies against `serverName` from 1.4.4; 1.4.3's
    // ignored it (measured; oven-sh/bun#43635).
    ...(data.serverName ? { tls: { serverName: data.serverName } } : {}),
  });
  data.upstream = upstream;
  upstream.binaryType = "arraybuffer";
  // Its `binaryType` makes every frame text or an ArrayBuffer.
  upstream.onmessage = ({ data: frame }: MessageEvent<unknown>) => {
    if (typeof frame === "string" || frame instanceof ArrayBuffer) {
      data.owed ??= [];
      data.owed.push(frame);
    }
  };
  upstream.onclose = (event) => {
    data.ended = { code: event.code, reason: event.reason };
  };
  return new Promise((settle) => {
    const done = (why: string | null): void => {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", gone);
      upstream.onopen = null;
      upstream.onerror = null;
      if (why !== null) {
        upstream.onmessage = null;
        upstream.onclose = null;
        upstream.close();
        data.upstream = undefined;
      }
      settle(why);
    };
    const failed = (why: string): void => {
      previewFailed(
        data.hop,
        data.instanceId,
        `its WebSocket to ${data.url} didn't open: ${why}`
      );
      done(why);
    };
    const gone = (): void => done("the browser went before it opened");
    const deadline = setTimeout(
      () => failed(`no answer within ${SOCKET_OPEN_MS / 1000} s`),
      SOCKET_OPEN_MS
    );
    signal?.addEventListener("abort", gone, { once: true });
    upstream.onopen = () => {
      data.protocol = upstream.protocol;
      done(null);
    };
    upstream.onerror = (event) => {
      const why = failureOf(event);
      if (why === NOT_CONNECTED) {
        data.nothingListens?.();
      }
      failed(why);
    };
    if (signal?.aborted) {
      gone();
    }
  });
}

/** A browser's WebSocket upgrade a hop refused: its status and why. */
export interface SocketRefused {
  status: 400 | 502;
  why: string;
}

/** {@link SocketRefused} as a plain answer. */
export const socketRefusal = ({ status, why }: SocketRefused): Response =>
  new Response(`${why}\n`, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });

/**
 * A browser's WebSocket upgrade, relayed to `url` with `headers`: the
 * upstream's socket opened first, and the browser's taken only once it has.
 * A socket's open is a client's word that its server is there: Vite's
 * client, its server gone, pings it with a `vite-ping` socket each second
 * and reloads the page at the first one that opens ("if (await ping())
 * return; … location.reload()", vite/dist/client/client.mjs
 * `waitForSuccessfulPingInternal`). Taken before its upstream answered, the
 * socket opened at every hop while the dev server was down, and the page
 * reloaded onto the hop's refusal (obelisk, 2026-11-22). An upstream that
 * doesn't open is the browser's refused upgrade ({@link SocketRefused}),
 * which its client reads as the server still gone.
 *
 * The Host in `headers` goes on as the hop set it, as its HTTP requests'
 * does: the agent names the app's own `localhost:<port>` beside the Origin
 * it rewrites to match, and a server that checks one against the other
 * (Vite's HMR, a dashboard's `/ws` gate) refuses the socket when they
 * differ. A `ws+unix://` URL alone would say `Host: localhost`, and a TCP
 * one `127.0.0.1:<port>`. The wait is bounded by {@link SOCKET_OPEN_MS},
 * never by the server's idle limit.
 */
export async function upgradePreview(
  request: Request,
  server: Server<PreviewSocket>,
  url: string,
  headers: Headers,
  at: Pick<
    PreviewSocket,
    "viewer" | "hop" | "instanceId" | "nothingListens" | "serverName"
  >
): Promise<SocketRefused | undefined> {
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((one) => one.trim())
    .filter(Boolean);
  for (const name of [
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-protocol",
  ]) {
    headers.delete(name);
  }
  const data: PreviewSocket = {
    url,
    protocols,
    protocol: "",
    headers,
    closed: false,
    ...at,
  };
  server.timeout(request, 0);
  const why = await openUpstream(data, request.signal);
  if (why !== null) {
    return { status: 502, why: `The preview's socket didn't open: ${why}.` };
  }
  if (
    server.upgrade(request, {
      headers: data.protocol
        ? { "sec-websocket-protocol": data.protocol }
        : undefined,
      data,
    })
  ) {
    return;
  }
  data.upstream?.close();
  return { status: 400, why: "WebSocket upgrade failed" };
}

/**
 * The close code a socket is allowed to send onward. 1005/1006/1015 (and 1004)
 * are reserved for the runtime to report, not for a peer to send, so a close
 * that arrived with one of them goes on as a plain 1000; the same for anything
 * outside the ranges the protocol defines.
 */
const sendable = (code: number): number =>
  (code >= 1000 && code <= 1013 && ![1004, 1005, 1006].includes(code)) ||
  (code >= 3000 && code <= 4999)
    ? code
    : 1000;

/**
 * What the upstream said, to the relayed socket, in order and never
 * dropped. Bun's server `send()` drops a frame outright (returns 0) once 16
 * MB wait in its socket's buffer (oven-sh/bun#44520, core wire.ts), so a
 * relay that sends faster than its peer reads lost frames: an SSH-added
 * machine's agent, reached through the hub's door over a slow link (hub
 * ssh-door.ts), was handed a fleet sync's parts with a run of them missing
 * (`wire part …#49 arrived where #22 was expected`), dropped its socket and
 * was sent the same sync again (niftybot, 2026-10-22). A frame the socket
 * did not take, and every one after it, waits for its drain
 * ({@link previewWebSocket} `drain`).
 */
const sendInOrder = (
  socket: PreviewSocketEnd,
  frame: string | ArrayBuffer
): void => {
  const { owed } = socket.data;
  if (owed && owed.length > 0) {
    owed.push(frame);
    return;
  }
  if (socket.send(frame) === 0) {
    socket.data.owed = [frame];
  }
};

/** The socket drained: what it owes goes on, until it takes no more. */
const sendOwed = (socket: PreviewSocketEnd): void => {
  const { owed } = socket.data;
  while (owed && owed.length > 0 && !socket.data.closed) {
    const sent = socket.send(owed[0] as string | ArrayBuffer);
    if (sent === 0) {
      return;
    }
    owed.shift();
    // Taken, and its buffer backs up: the rest waits for the next drain.
    if (sent === -1) {
      return;
    }
  }
};

/**
 * The relay between a socket and its upstream, which {@link openUpstream}
 * opened before it: what the upstream said meanwhile goes first, and a
 * close it heard meanwhile closes the socket.
 */
export const previewWebSocket = {
  open(socket: PreviewSocketEnd) {
    const { data } = socket;
    const { upstream } = data;
    if (!upstream) {
      socket.close(1011, "Preview connection failed");
      return;
    }
    data.release = data.viewer?.();
    upstream.onmessage = (event) => {
      if (!data.closed) {
        sendInOrder(socket, event.data as string | ArrayBuffer);
      }
    };
    // The app's own close code and reason travel through: a client that
    // reconnects on a `restart` code must not be told 1000 instead.
    upstream.onclose = (event) =>
      socket.close(sendable(event.code), event.reason);
    upstream.onerror = (event) => {
      // The viewer went first (a reload, a closed pane): `close` below closed
      // the upstream, and Bun may say so as an error. Nothing failed.
      if (data.closed) {
        return;
      }
      previewFailed(
        data.hop,
        data.instanceId,
        `its WebSocket to ${data.url} broke: ${failureOf(event)}`
      );
      socket.close(1011, "Preview connection failed");
    };
    sendOwed(socket);
    if (data.ended) {
      socket.close(sendable(data.ended.code), data.ended.reason);
    }
  },
  message(socket: PreviewSocketEnd, message: string | Buffer<ArrayBuffer>) {
    const { upstream } = socket.data;
    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(message);
    }
  },
  drain(socket: PreviewSocketEnd) {
    sendOwed(socket);
  },
  close(socket: PreviewSocketEnd, code: number, reason: string) {
    socket.data.closed = true;
    socket.data.release?.();
    socket.data.release = undefined;
    socket.data.owed = undefined;
    socket.data.upstream?.close(sendable(code), reason);
  },
} satisfies WebSocketHandler<PreviewSocket>;
