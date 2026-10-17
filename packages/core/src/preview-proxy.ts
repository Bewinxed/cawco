import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Server, WebSocketHandler } from "bun";
import { PREVIEW_DOWN_META, PREVIEW_WHY_META, type PreviewDown } from "./index";
import { embeddedFile, standalone } from "./runtime";

/** Where every previewed page loads the overlay from, on its own origin. */
export const OVERLAY_PATH = "/__cawco/overlay.js";
const HEAD_OPEN = /<head(\s[^>]*)?\s*>/i;
const HEAD_CLOSE = /<\/head\s*>/i;
const BODY = /<\/body\s*>/i;
let overlay: Promise<string> | undefined;

/**
 * The script injected into every previewed page, by a daemon for a session's
 * dev server or folder and by the hub for a project's decision page. The
 * standalone binary carries it prebuilt (`build-binary.ts`); a source
 * checkout bundles the agent's overlay on first request.
 */
async function buildOverlay(): Promise<string> {
  if (standalone) {
    return Bun.file(embeddedFile("preview/overlay.js")).text();
  }
  const result = await Bun.build({
    entrypoints: [
      new URL("../../agent/src/preview-overlay/overlay.ts", import.meta.url)
        .pathname,
    ],
    target: "browser",
    minify: true,
    format: "iife",
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "Preview overlay build failed");
  }
  return result.outputs[0].text();
}

/**
 * Built once per process and kept, unless the build fails — a missing source
 * file makes `Bun.build` throw rather than answer `success: false`, and a
 * rejected promise left in the cache would turn one bad request into every
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
const GZIP = /\bgzip\b/i;

/**
 * The overlay as a response to {@link OVERLAY_PATH}, the origins a host may
 * frame it from (`parents`, the dashboards the hub is reached from) frozen
 * on the window before it runs: its hello is heard from those alone, so a
 * page of another site that frames the preview can't take its picks.
 * Gzipped for a browser that takes it (`accepts`, the request's
 * Accept-Encoding): it is loaded into every preview, uncached, and was most
 * of an artifact's own tab's JS (220 KB of its 640).
 */
export async function overlayResponse(
  parents: readonly string[],
  accepts: string | null
): Promise<Response> {
  const named = `Object.defineProperty(window,${JSON.stringify(PARENTS_GLOBAL)},{value:Object.freeze(${JSON.stringify(parents).replaceAll("<", "\\u003c")})});`;
  const text = `${named}\n${await loadOverlay()}`;
  const headers = {
    "content-type": "text/javascript",
    "cache-control": "no-store",
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

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};
const escapeHtml = (text: string): string =>
  text.replaceAll(/[&"<>]/g, (char) => HTML_ESCAPES[char] ?? char);

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
 * The page with the overlay's script tag in it, carrying the page's hash and
 * `data` as `data-*` attributes (the hub's page artifacts add their id and
 * their document's state, so the overlay fills the page before it paints).
 * First child of <head>, so it runs before Vite's deferred `/@vite/client`
 * module; else before </head> or </body>; else at the end.
 */
export function injectOverlay(
  html: string,
  data: Record<string, string> = {}
): string {
  const extra = Object.entries(data)
    .map(
      ([name, value]) =>
        ` data-${name}="${value.replaceAll(/[&"<]/g, (char) => ATTRIBUTE_ESCAPES[char] ?? char)}"`
    )
    .join("");
  const script = `<script src="${OVERLAY_PATH}" data-page-hash="${pageHash(html)}"${extra}></script>`;
  if (HEAD_OPEN.test(html)) {
    return html.replace(HEAD_OPEN, (match) => match + script);
  }
  if (HEAD_CLOSE.test(html)) {
    return html.replace(HEAD_CLOSE, (match) => script + match);
  }
  if (BODY.test(html)) {
    return html.replace(BODY, (match) => script + match);
  }
  return html + script;
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
const VERSIONED = /^\/__cawco\/v\/([0-9a-z]+)(\/.*)$/;
const BASE_TAG = /<base[\s>]/i;
const LEADING_SLASH = /^\//;
/** The overlay's own and the hub's: never one of the page's files. */
const RESERVED_PATH = "/__cawco/";

/** A versioned address's file, its path under the mount; null when `pathname` is not one. */
export const versionedFile = (pathname: string): string | null =>
  pathname.match(VERSIONED)?.[2] ?? null;

/** The key of `root`'s files as they are now: each one's path, size and change time, hashed. */
export async function folderKey(root: string): Promise<string> {
  const names = (await readdir(root, { recursive: true })).sort();
  const hasher = new Bun.CryptoHasher("sha256");
  const stats = await Promise.all(
    names.map((name) => stat(join(root, name)).catch(() => null))
  );
  for (const [index, name] of names.entries()) {
    const one = stats[index];
    if (one?.isFile()) {
      hasher.update(`${name}\0${one.size}\0${one.mtimeMs}\n`);
    }
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
  // biome-ignore lint/correctness/noUndeclaredVariables: HTMLRewriter is Bun's own global (bun-types)
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

// The DOM ambient declaration hides Bun's headers-and-protocols overload.
const ProxyWebSocket = WebSocket as typeof WebSocket & {
  new (url: string, options: Bun.WebSocketOptions): WebSocket;
};

const HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

export function proxyHeaders(input: Headers): Headers {
  const headers = new Headers(input);
  for (const name of (headers.get("connection") ?? "").split(",")) {
    if (name.trim()) {
      headers.delete(name.trim());
    }
  }
  for (const name of HOP_HEADERS) {
    headers.delete(name);
  }
  return headers;
}

export interface PreviewSocket {
  closed: boolean;
  headers: Headers;
  /** The hop relaying it and the preview's session, for its failure's line. */
  hop: string;
  instanceId: string;
  /** Nothing listens at `url` any more: the hop forgets where it sent it (the hub's stale machine listener). */
  nothingListens?: () => void;
  opened: boolean;
  pending: (string | Uint8Array<ArrayBuffer>)[];
  protocol: string;
  /** The viewer's own release, once its socket opened; said when it closes. */
  release?: () => void;
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
const FAILED_PREFIX = /^WebSocket connection to '[^']*' failed: /;
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
  at: Pick<PreviewSocket, "viewer" | "hop" | "instanceId" | "nothingListens">
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

export const previewWebSocket: WebSocketHandler<PreviewSocket> = {
  open(socket) {
    const { data } = socket;
    data.release = data.viewer?.();
    const upstream = new ProxyWebSocket(data.url, {
      protocols: data.protocol ? [data.protocol] : [],
      headers: Object.fromEntries(data.headers),
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
        socket.send(event.data);
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
  close(socket, code, reason) {
    socket.data.closed = true;
    socket.data.release?.();
    socket.data.release = undefined;
    socket.data.pending.length = 0;
    socket.data.upstream?.close(sendable(code), reason);
  },
};
