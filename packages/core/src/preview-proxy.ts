import type { Server, WebSocketHandler } from "bun";
import { PREVIEW_DOWN_META, type PreviewDown } from "./index";
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

/** The overlay as a response to {@link OVERLAY_PATH}. */
export async function overlayResponse(): Promise<Response> {
  return new Response(await loadOverlay(), {
    headers: {
      "content-type": "text/javascript",
      "cache-control": "no-store",
    },
  });
}

const DOWN_WORDS: Record<PreviewDown, string> = {
  server: "The page's server stopped answering. Start it again, then reload.",
  machine:
    "The machine serving this preview isn't answering. Check that it is connected, then reload.",
};

/**
 * What a proxy answers when the hop behind it does not: a page that says
 * so to a person who opened it in a tab of its own, and names the hop in
 * its `<meta name="cawco-preview-down">` for the pane, which draws its own
 * state from that ({@link PreviewDown}).
 */
export function downResponse(down: PreviewDown, status = 502): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="${PREVIEW_DOWN_META}" content="${down}"><title>Preview unavailable</title></head><body><p>${DOWN_WORDS[down]}</p></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
}

/** A page's identity for the choices bridge: sha256 of the HTML as it was served, before injection. */
export const pageHash = (html: string): string =>
  new Bun.CryptoHasher("sha256").update(html).digest("hex");

/**
 * The page with the overlay's script tag in it, carrying the page's hash.
 * First child of <head>, so it runs before Vite's deferred `/@vite/client`
 * module; else before </head> or </body>; else at the end.
 */
export function injectOverlay(html: string): string {
  const script = `<script src="${OVERLAY_PATH}" data-page-hash="${pageHash(html)}"></script>`;
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
  pending: (string | Uint8Array<ArrayBuffer>)[];
  protocol: string;
  upstream?: WebSocket;
  url: string;
}

export function upgradePreview(
  request: Request,
  server: Server<PreviewSocket>,
  url: string,
  headers: Headers
): boolean {
  const protocol =
    request.headers.get("sec-websocket-protocol")?.split(",")[0]?.trim() ?? "";
  for (const name of [
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-protocol",
    "host",
  ]) {
    headers.delete(name);
  }
  return server.upgrade(request, {
    headers: protocol ? { "sec-websocket-protocol": protocol } : undefined,
    data: { url, protocol, headers, pending: [], closed: false },
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
    const upstream = new ProxyWebSocket(data.url, {
      protocols: data.protocol ? [data.protocol] : [],
      headers: Object.fromEntries(data.headers),
    });
    data.upstream = upstream;
    upstream.binaryType = "arraybuffer";
    upstream.onopen = () => {
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
    upstream.onerror = () => socket.close(1011, "Preview connection failed");
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
    socket.data.pending.length = 0;
    socket.data.upstream?.close(sendable(code), reason);
  },
};
