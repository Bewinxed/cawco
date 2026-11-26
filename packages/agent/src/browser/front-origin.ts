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
import { type BackoffPolicy, backoffWait } from "@cawco/core/backoff";
import type { BrowserHostKind, BrowserKey } from "@cawco/core/browser";
import { backoffSchedule } from "@cawco/core/effect/backoff-schedule";
import { Deferred, Duration, Effect, Fiber, Schedule } from "effect";
import { z } from "zod";
import { CdpLink } from "./cdp-takeover";

/**
 * How a link that would not open, or closed, is opened again while the
 * browser is live: from 2 s, doubling to a minute. Each failure first has
 * the registry check the browser ({@link Watch.lost}): one whose DevTools
 * stopped answering is brought back, and one that can't be is no longer
 * live, which ends its watch ({@link syncOrigins}). So it never gives up
 * while the browser is live; the minute's cap bounds what a link that fails
 * on a browser whose DevTools answers costs. It used to give up after eight
 * tries and leave a dead Chromium recorded live until its idle stop, half
 * an hour later (21–22 Nov 2026).
 */
const RELINK: BackoffPolicy = {
  firstMs: 2000,
  mostMs: 60_000,
  giveUp: {
    never:
      "the link is how the daemon learns its browser's Chromium died: each failure has the browser checked and brought back, and one that can't be is no longer live, which ends the watch",
  },
};

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
  /** Who hears this browser's origin change: the registry, which tells the hub. */
  heard: (key: BrowserKey) => void;
  /** The host it was opened on: a browser moved into a container (same ports) is watched afresh. */
  host: BrowserHostKind;
  /** The link kept open ({@link kept}), interrupted as the watch closes. */
  keeping?: Fiber.Fiber<never>;
  link?: CdpLink;
  /** The registry's check of a browser whose link failed: settled once it answers again, or is no longer live (browsers.ts `reviveBrowser`). */
  lost: (key: BrowserKey) => Promise<void>;
  origin?: string;
  pages: Map<string, Page>;
  /** The page shown, as last told. */
  shown?: string;
}

const watches = new Map<BrowserKey, Watch>();
const frontMovers = new Set<(key: BrowserKey) => void>();

/** Hears the page in front move to another (cdp-watch.ts, whose screencast follows it). */
export const onFrontMoved = (listener: (key: BrowserKey) => void): void => {
  frontMovers.add(listener);
};

/** The page `key`'s view shows now (its target id); undefined for none. */
export const frontTarget = (key: BrowserKey): string | undefined =>
  watches.get(key)?.shown;

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
    for (const moved of frontMovers) {
      moved(key);
    }
  }
  if (origin !== watch.origin) {
    watch.origin = origin;
    watch.heard(key);
  }
};

/** A target's info in a `Target.*` event that is a page's. */
const PAGE_INFO = z.object({
  targetId: z.string(),
  type: z.literal("page"),
  url: z.unknown(),
});

/** A page's info from a `Target.*` event: kept when it is a page. */
const notePage = (watch: Watch, info: unknown): boolean => {
  const page = PAGE_INFO.safeParse(info);
  if (!page.success) {
    return false;
  }
  const { targetId, url } = page.data;
  const was = watch.pages.get(targetId);
  const now = typeof url === "string" ? url : "";
  if (was?.url === now) {
    return false;
  }
  watch.pages.set(targetId, { url: now, at: Date.now() });
  return true;
};

/**
 * The link opened, its events heard, and every page asked for (each
 * arrives as `targetCreated`, then each change); answers what settles as
 * it closes. One that opened and then failed is closed, and fails as one
 * that would not open does: with why.
 */
const linked = (key: BrowserKey, watch: Watch) =>
  Effect.gen(function* () {
    const link = yield* CdpLink.opened(watch.devtools);
    const closed = Deferred.makeUnsafe<void>();
    if (watch.closed) {
      link.close();
      return closed;
    }
    watch.link = link;
    link.onEvent = (message) => {
      const { targetInfo, targetId } = message.params ?? {};
      let moved = false;
      if (
        message.method === "Target.targetCreated" ||
        message.method === "Target.targetInfoChanged"
      ) {
        moved = notePage(watch, targetInfo);
      } else if (
        message.method === "Target.targetDestroyed" &&
        typeof targetId === "string"
      ) {
        moved = watch.pages.delete(targetId);
        if (watch.front === targetId) {
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
      }
      Deferred.doneUnsafe(closed, Effect.void);
    };
    yield* link
      .request("Target.setDiscoverTargets", { discover: true })
      .pipe(Effect.tapError(() => Effect.sync(() => link.close())));
    return closed;
  }).pipe(
    Effect.mapError((error: unknown) =>
      error instanceof Error ? error.message : String(error)
    )
  );

/**
 * The link failed (`why`): said with the wait before it opens again, then
 * the browser checked and, where its DevTools stopped answering, brought
 * back ({@link Watch.lost}).
 */
const failed = (key: BrowserKey, watch: Watch, why: string, ms: number) =>
  Effect.gen(function* () {
    yield* Effect.logWarning(
      `[browser] ${key}'s DevTools link failed (${why}); the browser is checked, and the link opened again ${Math.round(ms / 1000)} s after`
    );
    yield* Effect.promise(() => watch.lost(key));
  });

/**
 * `key`'s link kept open while the watch stands: opened, its opens that
 * fail retried on {@link RELINK} (a series that ends once it opened), and
 * one that closed opened again after the policy's first wait, the browser
 * checked before each wait.
 */
const kept = (key: BrowserKey, watch: Watch): Effect.Effect<never> =>
  Effect.gen(function* () {
    const closed = yield* Effect.retry(
      linked(key, watch),
      backoffSchedule(RELINK).pipe(
        Schedule.setInputType<string>(),
        Schedule.tap(({ input, duration }) =>
          failed(key, watch, input, Duration.toMillis(duration))
        )
      )
    );
    yield* Deferred.await(closed);
    const ms = backoffWait(RELINK, 1);
    yield* failed(key, watch, "its link closed", ms);
    yield* Effect.sleep(ms);
  }).pipe(
    // RELINK never gives up: a retry that ended would be a defect.
    Effect.orDie,
    Effect.forever
  );

const open = (key: BrowserKey, watch: Watch): void => {
  watch.keeping = Effect.runFork(kept(key, watch));
};

const close = (key: BrowserKey, watch: Watch): void => {
  watch.closed = true;
  if (watch.keeping) {
    Effect.runFork(Fiber.interrupt(watch.keeping));
  }
  watch.link?.close();
  watches.delete(key);
};

/**
 * The live browsers, their DevTools addresses and hosts: each gets its
 * watch; a browser no longer live, or now on another host or address (a
 * local browser moved into a container keeps its ports), loses the one it
 * had, its origin with it, and is watched afresh. `heard` is told an
 * origin's change; `lost` checks a browser whose link failed.
 */
export const syncOrigins = (
  live: Map<BrowserKey, { devtools: string; host: BrowserHostKind }>,
  heard: (key: BrowserKey) => void,
  lost: (key: BrowserKey) => Promise<void>
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
      const watch: Watch = {
        devtools,
        heard,
        host,
        lost,
        pages: new Map(),
        closed: false,
      };
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
