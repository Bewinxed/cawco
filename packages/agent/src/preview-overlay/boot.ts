/// <reference lib="dom" />

/**
 * What every document the preview proxy serves runs first, the overlay's
 * own or not: the proxy's address patches, and this window's mark.
 *
 * The overlay runs once per preview, in the outermost previewed document,
 * and reaches every same-origin frame inside it (frames.ts). The proxy
 * injects the script into every HTML page, and cannot tell a page from a
 * frame inside one by its request (the preview is itself a frame in the
 * dashboard, and the top document in the app's web view), so each document
 * decides at load (overlay.ts): one whose same-origin parent carries the
 * mark stands down. The mark is set here, synchronously, before the
 * document holds any frame, so a frame never misses its parent's.
 */

/**
 * The `/preview/<id>/<revision>/` prefix this page lives under. Derived from
 * the current path at load time: the overlay script is the first thing in
 * <head>, so location.pathname is the frame's initial URL before any SPA
 * navigation.
 */
export const prefix =
  location.pathname.match(/^\/preview\/[^/]+\/[^/]+\//)?.[0] ?? "";

/** What a document's overlay answers its frames' overlays, under {@link MARK}. */
export interface OverlayMark {
  /** A frame inside navigated in place (history): the marks in it are placed again. */
  frameChanged: () => void;
}

const MARK = "__cawcoOverlay";
type Marked = Window & { [MARK]?: OverlayMark };

/** This window's mark: an overlay runs here, or runs above and reaches here. */
export const mark: OverlayMark = { frameChanged: () => undefined };
Object.defineProperty(window, MARK, { value: mark });

/** This document's own: the tag that loaded the script, and what an in-place navigation tells. */
export const here: {
  navigated: () => void;
  tag: HTMLScriptElement | null;
} = { navigated: () => undefined, tag: null };

/** The same-origin parent's mark; null at the top, under another origin, or where no overlay was loaded. */
export function parentMark(): OverlayMark | null {
  if (window.parent === window) {
    return null;
  }
  try {
    return (window.parent as Marked)[MARK] ?? null;
  } catch {
    return null;
  }
}

/**
 * The same-origin parent's document while it is still parsing, its overlay
 * perhaps not yet loaded (a page with no head has it injected at the end of
 * its body); null otherwise.
 */
export function parentParsing(): Document | null {
  if (window.parent === window) {
    return null;
  }
  try {
    const { document: parent } = window.parent;
    return parent.readyState === "loading" ? parent : null;
  } catch {
    return null;
  }
}

/**
 * The proxy's address patches, in every document it serves, the overlay's
 * or not: they keep a dev server's app working under the prefix.
 *
 * history.pushState/replaceState: a root-absolute `url` argument (starts
 * with `/` but not with the prefix) gets the prefix prepended, so the frame's
 * URL stays under the routing prefix and Referer routing keeps working.
 *
 * WebSocket: a same-origin URL whose path does not start with the prefix
 * gets the prefix inserted. Vite's HMR client connects to `wss://host/`; this
 * makes it go through the dashboard's preview proxy instead of missing.
 */
export function patchAddresses(): void {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (...args: Parameters<History[typeof method]>) {
      if (prefix && typeof args[2] === "string") {
        const [, , u] = args;
        if (u.startsWith("/") && !u.startsWith(prefix)) {
          args[2] = `${prefix}${u.slice(1)}`;
        }
      }
      original.apply(this, args);
      here.navigated();
    };
  }
  if (!prefix) {
    return;
  }
  const OriginalWebSocket = window.WebSocket;
  const PatchedWebSocket = function (
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[]
  ): WebSocket {
    let resolved = typeof url === "string" ? url : url.toString();
    try {
      const parsed = new URL(resolved, location.href);
      if (
        parsed.host === location.host &&
        !parsed.pathname.startsWith(prefix)
      ) {
        parsed.pathname = `${prefix}${parsed.pathname.slice(1)}`;
        resolved = parsed.toString();
      }
    } catch {
      // leave as-is if URL parsing fails
    }
    if (protocols !== undefined) {
      return new OriginalWebSocket(resolved, protocols);
    }
    return new OriginalWebSocket(resolved);
  } as unknown as typeof WebSocket;
  Object.defineProperties(PatchedWebSocket, {
    prototype: { value: OriginalWebSocket.prototype },
    CONNECTING: { value: OriginalWebSocket.CONNECTING },
    OPEN: { value: OriginalWebSocket.OPEN },
    CLOSING: { value: OriginalWebSocket.CLOSING },
    CLOSED: { value: OriginalWebSocket.CLOSED },
  });
  window.WebSocket = PatchedWebSocket;
}
