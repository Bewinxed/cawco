/**
 * The origin of the page the person's view of a browser shows (core
 * `BrowserRow.origin`): the view's address band names it, so the person
 * reads where they are before they type (Projects spec §5.11). Read through
 * the daemon's own DevTools link to each live browser, never the gate, and
 * told to the hub alone in the machine's `browsers` frame: no agent's
 * connection carries it.
 *
 * The page shown is the one a take-over brought to the front
 * ({@link setFront}: shield.ts, the local host's screencast page among
 * them); else the page last made or moved (`Target.targetCreated`,
 * `Target.targetInfoChanged`), which is the window that came forward on
 * neko's screen (each session's pages open as windows of their own, gate.ts
 * `newWindow`). A change is told on the event that made it, with no wait:
 * Chromium tells a page's new URL as its navigation commits (an HTTP
 * redirect chain commits once, at its end), and the band names it within
 * its 2 s however loaded the machine is. The page itself
 * ({@link frontTarget}) is what the local host's view screencasts while
 * nobody holds the browser (cdp-watch.ts), told when it moves
 * ({@link onFrontMoved}).
 */
import type { BrowserHostKind, BrowserKey } from "@cawco/core/browser";
import { CdpLink } from "./cdp-takeover";

/** How long after a link that would not open it is tried again, while the browser is live. Our call. */
const RETRY_MS = 5000;

interface Page {
  /** When it was made or last moved: the newest is the one in front. */
  at: number;
  url: string;
}

interface Watch {
  closed: boolean;
  devtools: string;
  /** The page a take-over brought to the front, while it stands. */
  front?: string;
  /** The host it was opened on: a browser moved into a container (same ports) is watched afresh. */
  host: BrowserHostKind;
  link?: CdpLink;
  origin?: string;
  pages: Map<string, Page>;
  retry?: ReturnType<typeof setTimeout>;
  /** The page shown, as last told. */
  shown?: string;
}

const watches = new Map<BrowserKey, Watch>();
let heard: (key: BrowserKey) => void = () => undefined;
let frontMoved: (key: BrowserKey) => void = () => undefined;

/** Who hears the page in front move to another (cdp-watch.ts, whose screencast follows it). */
export const onFrontMoved = (sink: (key: BrowserKey) => void): void => {
  frontMoved = sink;
};

/** The page `key`'s view shows now (its target id); undefined for none. */
export const frontTarget = (key: BrowserKey): string | undefined =>
  watches.get(key)?.shown;

/** Who hears an origin change: the registry, which tells the hub. */
export const setOriginSink = (sink: (key: BrowserKey) => void): void => {
  heard = sink;
};

/** The origin `key`'s view shows now; undefined for none. */
export const frontOrigin = (key: BrowserKey): string | undefined =>
  watches.get(key)?.origin;

/** A page's origin as the band names it: a web page's alone (`about:blank`, the browser's own pages and a blank tab name none). */
const originOf = (url: string): string | undefined => {
  if (!URL.canParse(url)) {
    return;
  }
  const { protocol, origin } = new URL(url);
  return protocol === "http:" || protocol === "https:" ? origin : undefined;
};

/** The page shown: the one a take-over brought to the front, else the newest made or moved. */
const shownPage = (watch: Watch): string | undefined => {
  if (watch.front && watch.pages.has(watch.front)) {
    return watch.front;
  }
  let newest: [string, Page] | undefined;
  for (const entry of watch.pages) {
    if (!newest || entry[1].at >= newest[1].at) {
      newest = entry;
    }
  }
  return newest?.[0];
};

/** Tells the page shown and its origin now, each only when it changed. */
const show = (key: BrowserKey, watch: Watch): void => {
  if (watch.closed) {
    return;
  }
  const shown = shownPage(watch);
  const page = shown ? watch.pages.get(shown) : undefined;
  const origin = page ? originOf(page.url) : undefined;
  if (shown !== watch.shown) {
    watch.shown = shown;
    frontMoved(key);
  }
  if (origin !== watch.origin) {
    watch.origin = origin;
    heard(key);
  }
};

/** A page's info from a `Target.*` event: kept when it is a page. */
const notePage = (watch: Watch, info: unknown): boolean => {
  const { targetId, type, url } = (info ?? {}) as {
    targetId?: unknown;
    type?: unknown;
    url?: unknown;
  };
  if (typeof targetId !== "string" || type !== "page") {
    return false;
  }
  const was = watch.pages.get(targetId);
  const now = typeof url === "string" ? url : "";
  if (was?.url === now) {
    return false;
  }
  watch.pages.set(targetId, { url: now, at: Date.now() });
  return true;
};

const open = (key: BrowserKey, watch: Watch): void => {
  CdpLink.open(watch.devtools)
    .then(async (link) => {
      if (watch.closed) {
        link.close();
        return;
      }
      watch.link = link;
      link.onEvent = (message) => {
        const params = (message.params ?? {}) as {
          targetInfo?: unknown;
          targetId?: unknown;
        };
        let moved = false;
        if (
          message.method === "Target.targetCreated" ||
          message.method === "Target.targetInfoChanged"
        ) {
          moved = notePage(watch, params.targetInfo);
        } else if (
          message.method === "Target.targetDestroyed" &&
          typeof params.targetId === "string"
        ) {
          moved = watch.pages.delete(params.targetId);
          if (watch.front === params.targetId) {
            watch.front = undefined;
          }
        }
        if (moved) {
          show(key, watch);
        }
      };
      link.onClose = () => {
        if (watch.link === link) {
          // Its pages were that Chromium's: the next link (a restart, a
          // move onto the same port) lists its own.
          watch.link = undefined;
          watch.pages.clear();
          watch.front = undefined;
          show(key, watch);
          retry(key, watch);
        }
      };
      // Every page there now arrives as `targetCreated`, then each change.
      await link.call("Target.setDiscoverTargets", { discover: true });
    })
    .catch((error: unknown) => {
      console.warn(
        `[browser] ${key}'s page origin is not read: ${error instanceof Error ? error.message : String(error)}`
      );
      retry(key, watch);
    });
};

const retry = (key: BrowserKey, watch: Watch): void => {
  if (watch.closed) {
    return;
  }
  clearTimeout(watch.retry);
  watch.retry = setTimeout(() => {
    if (!(watch.closed || watch.link)) {
      open(key, watch);
    }
  }, RETRY_MS);
  watch.retry.unref?.();
};

const close = (key: BrowserKey, watch: Watch): void => {
  watch.closed = true;
  clearTimeout(watch.retry);
  watch.link?.close();
  watches.delete(key);
};

/**
 * The live browsers, their DevTools addresses and hosts: each gets its
 * watch; a browser no longer live, or now on another host or address (a
 * local browser moved into a container keeps its ports), loses the one it
 * had, its origin with it, and is watched afresh.
 */
export const syncOrigins = (
  live: Map<BrowserKey, { devtools: string; host: BrowserHostKind }>
): void => {
  for (const [key, watch] of watches) {
    const now = live.get(key);
    if (now?.devtools !== watch.devtools || now.host !== watch.host) {
      // The frame being told reads no origin for it from here.
      close(key, watch);
    }
  }
  for (const [key, { devtools, host }] of live) {
    if (!watches.has(key)) {
      const watch: Watch = { devtools, host, pages: new Map(), closed: false };
      watches.set(key, watch);
      open(key, watch);
    }
  }
};

/** A take-over brought `targetId` to the front of `key` (shield.ts); null when it ended. */
export const setFront = (key: BrowserKey, targetId: string | null): void => {
  const watch = watches.get(key);
  if (!watch) {
    return;
  }
  watch.front = targetId ?? undefined;
  show(key, watch);
};
