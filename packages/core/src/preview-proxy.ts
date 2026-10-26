import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import { refuseSchemeLowering } from "./bundle-css-guard";
import { bundled } from "./bundled";
import { dataUrlBytes, deskCaptures } from "./captures";
import { HOP_BY_HOP_HEADERS } from "./hop-headers";
import {
  PREVIEW_DOWN_META,
  PREVIEW_DOWNS,
  PREVIEW_WHY_META,
  type PreviewDown,
} from "./index";
import { embeddedFile, standalone } from "./runtime";

/** Where every previewed page loads the overlay from, on its own origin. */
export const OVERLAY_PATH = "/__cawco/overlay.js";
const HEAD_OPEN = /<head(\s[^>]*)?\s*>/iu;
const HTML_OPEN = /<html(\s[^>]*)?\s*>/iu;
const DOCTYPE = /^\s*<!doctype[^>]*>/iu;
const SCRIPT_OPEN = /<script\b/iu;
let overlay: Promise<string> | undefined;

/**
 * The script injected into every previewed page, by a daemon for a session's
 * dev server or folder and by the hub for a project's decision page. The
 * standalone binary carries it prebuilt (`build-binary.ts`); a source
 * checkout bundles the agent's overlay on first request.
 */
function buildOverlay(): Promise<string> {
  if (standalone) {
    return Bun.file(embeddedFile("preview/overlay.js")).text();
  }
  return bundleOverlay();
}

/**
 * The overlay's doc worker (agent preview-overlay doc-worker.ts), the one
 * place the overlay's Yjs runs: a minified IIFE, carried in the overlay as
 * text and started from it as a blob, so the page's realm never evaluates
 * a Yjs of CawCo's.
 */
async function bundleDocWorker(): Promise<string> {
  const result = await bundled("The overlay's doc worker", {
    entrypoints: [
      new URL("../../agent/src/preview-overlay/doc-worker.ts", import.meta.url)
        .pathname,
    ],
    target: "browser",
    minify: true,
    format: "iife",
  });
  return result.outputs[0].text();
}

/**
 * The overlay's one build: the agent's overlay.ts as a minified browser IIFE,
 * its doc worker's text in it ({@link bundleDocWorker}), refused if it
 * lowers `light-dark()`. A source checkout serves it in memory
 * ({@link buildOverlay}); `build-binary.ts` writes it out to embed.
 */
export async function bundleOverlay(): Promise<string> {
  const result = await bundled("The preview overlay", {
    entrypoints: [
      new URL("../../agent/src/preview-overlay/overlay.ts", import.meta.url)
        .pathname,
    ],
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
export const PARENTS_GLOBAL = "__cawcoParents";

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
export async function overlayKey(parents: readonly string[]): Promise<string> {
  const text = await overlayText(parents);
  if (keyed?.text !== text) {
    const hex = new Bun.CryptoHasher("sha256").update(text).digest("hex");
    keyed = { text, key: BigInt(`0x${hex.slice(0, 24)}`).toString(36) };
  }
  return keyed.key;
}

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
  const at = `${OVERLAY_PATH}?${OVERLAY_KEY}=${await overlayKey(parents)}`;
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
 * What a proxy's own page says of each hop that did not answer (WORDS.md
 * error formula: what happened, why, the way back); a preview of a workspace
 * no boundary runs is refused in its words too.
 */
export const DOWN_WORDS: Record<PreviewDown, string> = {
  server: "The page's server stopped answering. Start it again, then reload.",
  machine:
    "The machine serving this preview isn't answering. Check that it is connected, then reload.",
  workspace:
    "That workspace isn't running, so its server can't be reached. Once a session there is back, reload.",
  reach:
    "The way to this preview's server didn't open. Reload to try again; if it fails again, open its session.",
  closed:
    "This preview is closed: its session shows something else now, or has ended. Open its session to show it again.",
};

/**
 * A folder preview's folder is not on its machine any more (removed, or its
 * workspace archived with it): the daemon refuses its start with these words
 * first, its system's own after them, and the hub records the artifact's
 * source gone (hub artifacts/needs.ts: it asks nothing of the person).
 */
const FOLDER_GONE = "The preview's folder isn't on its machine any more";

/** {@link FOLDER_GONE} with the system's own words for it ("ENOENT: no such file or directory, …"). */
export const folderGone = (why: string): string => `${FOLDER_GONE}: ${why}`;

/** Whether a daemon's refusal of a preview's start says its folder is gone. */
export const isFolderGone = (error: string): boolean =>
  error.startsWith(FOLDER_GONE);

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
 * the page's, so any parent may hear it.
 */
export function downResponse(
  down: PreviewDown,
  status = 502,
  why?: string
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
    `<!doctype html><html><head><meta charset="utf-8"><meta name="${PREVIEW_DOWN_META}" content="${down}">${said}<title>Preview unavailable</title></head><body><p>${DOWN_WORDS[down]}</p>${detail}${tell}</body></html>`,
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
 * hold (preview-overlay hold.ts) wraps each frame and timer the page asks
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
export function previewCache(
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

/** What a folder preview loads at most: its files, their bytes, and of those its JavaScript's and its WebAssembly's; and its start page's desk captures (core `deskCaptures`). */
export interface FolderWeight {
  bytes: number;
  /** `<img>` on the start page whose file is wider than `DESK_CAPTURE_WIDTH`. */
  captures: number;
  files: number;
  js: number;
  wasm: number;
}

const JS_FILE = /\.[cm]?js$/u;
const WASM_FILE = /\.wasm$/u;

const QUERY_OR_HASH = /[?#]/u;
const LEADING_SLASHES = /^\/+/u;
/** A source on another origin or scheme: no file of the folder. */
const ELSEWHERE = /^[a-z][a-z0-9+.-]*:|^\/\//iu;

/** The start page a folder preview opens at `path` (its index.html when the path names a folder), from `root`. */
const startPage = (path: string | undefined): string => {
  const at = (path ?? "/").split(QUERY_OR_HASH)[0] ?? "/";
  return (at.endsWith("/") ? `${at}index.html` : at).replace(
    LEADING_SLASHES,
    ""
  );
};

/**
 * The desk captures on `root`'s start page at `path`: each `<img>` a
 * `data:` URL or a file beside the page, read from its header alone.
 */
async function startPageCaptures(
  root: string,
  path: string | undefined
): Promise<number> {
  const page = join(root, startPage(path));
  if (!page.startsWith(root)) {
    return 0;
  }
  const file = Bun.file(page);
  if (!(await file.exists())) {
    return 0;
  }
  const folder = dirname(page);
  return deskCaptures(await file.text(), async (src) => {
    const inline = dataUrlBytes(src);
    if (inline || ELSEWHERE.test(src)) {
      return inline;
    }
    const beside = join(
      src.startsWith("/") ? root : folder,
      src.split(QUERY_OR_HASH)[0] ?? ""
    );
    if (!beside.startsWith(root)) {
      return null;
    }
    // The header is all the width needs.
    const head = Bun.file(beside).slice(0, 64 * 1024);
    return (await Bun.file(beside).exists())
      ? new Uint8Array(await head.arrayBuffer())
      : null;
  });
}

/** `root`'s weight, from the same walk as its {@link folderKey}; the captures on its start page at `path`. */
export async function folderWeight(
  root: string,
  path?: string
): Promise<FolderWeight> {
  const weight: FolderWeight = {
    files: 0,
    bytes: 0,
    js: 0,
    wasm: 0,
    captures: await startPageCaptures(root, path),
  };
  for (const { name, size } of await folderFiles(root)) {
    weight.files += 1;
    weight.bytes += size;
    if (JS_FILE.test(name)) {
      weight.js += size;
    } else if (WASM_FILE.test(name)) {
      weight.wasm += size;
    }
  }
  return weight;
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
 * The machine's listener marks an answer that came from the preview's own
 * port (its stage or server), never one of its own (`downResponse`, a
 * sleeping stage's cover): the hub's relay reads it, so a stage the hub
 * found unreached is known back the first time it answers the page, and
 * takes it off before the browser sees it.
 */
export const PREVIEW_SERVED_HEADER = "x-cawco-served";

// The DOM ambient declaration hides Bun's headers-and-protocols overload.
const ProxyWebSocket = WebSocket as typeof WebSocket & {
  new (url: string, options: Bun.WebSocketOptions): WebSocket;
};

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

export interface PreviewSocket {
  closed: boolean;
  headers: Headers;
  /** The hop relaying it and the preview's session, for its failure's line; null for a hop that serves no one session (the agent's hub loopback). */
  hop: string;
  instanceId: string | null;
  /** Nothing listens at `url` any more: the hop forgets where it sent it (the hub's stale machine listener). */
  nothingListens?: () => void;
  opened: boolean;
  /** What the upstream said that this socket has not taken yet, in order ({@link sendInOrder}). */
  owed?: (string | ArrayBuffer)[];
  pending: (string | Uint8Array<ArrayBuffer>)[];
  protocol: string;
  /** The viewer's own release, once its socket opened; said when it closes. */
  release?: () => void;
  /**
   * The name a `wss://` `url` at an address verifies its certificate
   * against (the agent's loopback to the hub's tailnet name, agent
   * hub-loopback.ts); the URL's own host when absent.
   */
  serverName?: string;
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

/** Bun's words for a client socket that failed, before its reason. */
const FAILED_PREFIX = /^WebSocket connection to '[^']*' failed: /u;
/** Bun's reason when no connection opened at all (`ECONNREFUSED`): no listener there. */
const NOT_CONNECTED = "Failed to connect";

/** Why a client socket failed, in Bun's words: "Expected 101 status code" (the server answered the upgrade with another status), "Connection ended" (it closed the connection on it), "Failed to connect". */
const failureOf = (event: Event): string =>
  (event as ErrorEvent).message?.replace(FAILED_PREFIX, "") ||
  "no reason given";

/**
 * A browser's WebSocket upgrade, relayed to `url` with `headers`. The Host in
 * `headers` goes on as the hop set it, as its HTTP requests' does: the agent
 * names the app's own `localhost:<port>` beside the Origin it rewrites to
 * match, and a server that checks one against the other (Vite's HMR, a
 * dashboard's `/ws` gate) refuses the socket when they differ. A `ws+unix://`
 * URL alone would say `Host: localhost`, and a TCP one `127.0.0.1:<port>`.
 */
export function upgradePreview(
  request: Request,
  server: Server<PreviewSocket>,
  url: string,
  headers: Headers,
  at: Pick<
    PreviewSocket,
    "viewer" | "hop" | "instanceId" | "nothingListens" | "serverName"
  >
): boolean {
  const protocol =
    request.headers.get("sec-websocket-protocol")?.split(",")[0]?.trim() ?? "";
  for (const name of [
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-protocol",
  ]) {
    headers.delete(name);
  }
  return server.upgrade(request, {
    headers: protocol ? { "sec-websocket-protocol": protocol } : undefined,
    data: {
      url,
      protocol,
      headers,
      pending: [],
      closed: false,
      opened: false,
      ...at,
    },
  });
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
  socket: ServerWebSocket<PreviewSocket>,
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
const sendOwed = (socket: ServerWebSocket<PreviewSocket>): void => {
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

export const previewWebSocket: WebSocketHandler<PreviewSocket> = {
  open(socket) {
    const { data } = socket;
    data.release = data.viewer?.();
    const upstream = new ProxyWebSocket(data.url, {
      protocols: data.protocol ? [data.protocol] : [],
      headers: Object.fromEntries(data.headers),
      // Bun's client verifies against `serverName` from 1.4.4; 1.4.3's
      // ignored it (measured; oven-sh/bun#43635).
      ...(data.serverName ? { tls: { serverName: data.serverName } } : {}),
    });
    data.upstream = upstream;
    upstream.binaryType = "arraybuffer";
    upstream.onopen = () => {
      data.opened = true;
      if (data.closed) {
        upstream.close();
        return;
      }
      for (const message of data.pending) {
        upstream.send(message);
      }
      data.pending.length = 0;
    };
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
      const why = failureOf(event);
      previewFailed(
        data.hop,
        data.instanceId,
        `its WebSocket to ${data.url} ${data.opened ? "broke" : "didn't open"}: ${why}`
      );
      if (!data.opened && why === NOT_CONNECTED) {
        data.nothingListens?.();
      }
      socket.close(1011, "Preview connection failed");
    };
  },
  message(socket, message) {
    const { upstream, pending } = socket.data;
    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(message);
    } else if (upstream?.readyState === WebSocket.CONNECTING) {
      pending.push(message);
    }
  },
  drain(socket) {
    sendOwed(socket);
  },
  close(socket, code, reason) {
    socket.data.closed = true;
    socket.data.release?.();
    socket.data.release = undefined;
    socket.data.pending.length = 0;
    socket.data.owed = undefined;
    socket.data.upstream?.close(sendable(code), reason);
  },
};
