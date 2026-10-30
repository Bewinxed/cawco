/**
 * A preview or a page drawn as the person's panel draws it, for
 * `artifact_read`'s `png` (core `ARTIFACT_PICTURE`): the hub machine's
 * Chromium (chromium.ts) opens the artifact on its own preview origin on
 * loopback, entered with the reading session's ticket, as `artifact_browse`
 * opens it. The hub's proxy serves it there with the overlay in it, and the
 * stand-in host greets the overlay as the pane does, so the page joins its
 * doc and draws the person's pins on it. The page's load is a navigation,
 * which wakes a sleeping server and waits for it before the page is served
 * (preview.ts `staged`); then the page is waited on until it is ready
 * ({@link watchReadiness}), and the picture is taken at the asked width,
 * the page's whole length up to `PICTURE_LIMITS.maxHeight`.
 *
 * Ready is read off the page, never a fixed wait: a SvelteKit dev route
 * paints nothing until Vite has served its modules and its load functions
 * have fetched their data, which "fonts, then 1 s" shot as a blank page
 * (2026-10-28, a 3 KB cream picture of a page `artifact_browse` drew
 * whole). Playwright marks `networkidle` DISCOURAGED ("rely on web
 * assertions to assess readiness instead", playwright.dev, `waitUntil`), and
 * a page that syncs its doc never idles, so the page's own signals decide.
 * Every frame the picture shows is read the same way: a decision page's
 * Previews draw long after the page around them has settled, and a picture
 * taken then held their skeletons.
 */

import { PREVIEW_DOWNS, type PreviewDown } from "@cawco/core";
import {
  PICTURE_LIMITS,
  PICTURE_PAGE_SCROLLER,
  PICTURE_VIEW,
  PREVIEW_LOCKED_MESSAGE,
} from "@cawco/core/frames";
import { DOWN_WORDS } from "@cawco/core/preview-proxy";
import type { Frame, Page } from "playwright-core";
import {
  greet,
  type HelloArtifact,
  HOST_STAND_IN,
  isHelloArtifact,
  launchChromium,
} from "./chromium";

/** What the hub asks a picture of: where the page loads, at what width, and the artifact its hello names. */
export interface PictureAsk extends HelloArtifact {
  url: string;
  width: number;
}

/** What {@link watchReadiness} keeps on the page. */
interface Readiness {
  /** When the page last painted a larger element or ended a request, in its `performance.now()`. */
  __cawcoChangedAt?: number;
  /** Whether the page has painted its largest contentful element at least once. */
  __cawcoPainted?: boolean;
  /** Its own fetches and XHRs in flight. */
  __cawcoPending?: number;
}

/**
 * The page's readiness, watched from before its own scripts run: its
 * largest-contentful-paint entries (the platform's word that content
 * painted, W3C Largest Contentful Paint), and its own fetches and XHRs in
 * flight (a load function's data). What the overlay paints, inside
 * `cawco-overlay`, and its requests to `/__cawco/` (its doc's sync) are
 * the hub's, never the page's. Ready: content painted, nothing in flight,
 * and neither for {@link PICTURE_LIMITS}'s `settleMs`.
 */
const watchReadiness = `(() => {
  window.__cawcoPainted = false;
  window.__cawcoPending = 0;
  window.__cawcoChangedAt = performance.now();
  const changed = () => { window.__cawcoChangedAt = performance.now(); };
  const ours = (node) => !!node?.closest?.("cawco-overlay");
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!ours(entry.element)) { window.__cawcoPainted = true; changed(); }
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  const counted = (url) => !String(url instanceof Request ? url.url : url).includes("/__cawco/");
  const begun = () => { window.__cawcoPending += 1; };
  const ended = () => { window.__cawcoPending = Math.max(0, window.__cawcoPending - 1); changed(); };
  const fetched = window.fetch;
  window.fetch = function (...args) {
    if (!counted(args[0])) return fetched.apply(this, args);
    begun();
    return fetched.apply(this, args).finally(ended);
  };
  const { open, send } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function (...args) {
    this.__cawcoCounted = counted(args[1]);
    return open.apply(this, args);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__cawcoCounted) { begun(); this.addEventListener("loadend", ended, { once: true }); }
    return send.apply(this, args);
  };
})();`;

/** What the page says to its host, as the stand-in hears it: its lock turned it away, or the proxy served its down page (core `downResponse`). */
interface Heard {
  __cawcoDown?: { down?: unknown; why?: unknown };
  __cawcoHeard?: (data: unknown) => void;
  __cawcoLocked?: boolean;
}

/** The words the panel draws for down page `down`, and its cause: a refusal's. */
const downWords = (name: string, down: Heard["__cawcoDown"]): string => {
  const words =
    PREVIEW_DOWNS.find((hop) => hop === down?.down) === undefined
      ? "Preview unavailable."
      : DOWN_WORDS[down?.down as PreviewDown];
  const why = typeof down?.why === "string" ? ` Its cause: ${down.why}` : "";
  return `${name} wasn't drawn: the panel would say "${words}"${why}`;
};

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

/** Whether `error` is Playwright's timeout. */
const timedOut = (error: unknown) =>
  error instanceof Error && error.name === "TimeoutError";

/** How often the page and its frames are read for readiness. Our call. */
const READY_POLL_MS = 100;

/**
 * Whether a document is ready ({@link watchReadiness}): its fonts loaded, its
 * content painted, nothing of its own in flight, all of it still for `settle`
 * ms, and no decision page's Preview still waiting in its view: the skeleton
 * in its well, or Caw over its wait (decisions host Preview.svelte). A
 * skeleton inside a frame is that design's own, a story of its loading state.
 * A frame's painted content is its words as well: one that stood at no height
 * while it painted (a canvas, until it says its shape) is never told a
 * largest paint.
 */
const documentReady = ({
  framed,
  settle,
}: {
  framed: boolean;
  settle: number;
}): boolean => {
  const doc = globalThis as unknown as Readiness & {
    document: {
      body: { textContent: string | null } | null;
      fonts: { status: string };
      querySelectorAll: (selector: string) => Iterable<{
        getBoundingClientRect: () => {
          bottom: number;
          height: number;
          top: number;
        };
      }>;
      readyState: string;
    };
    innerHeight: number;
  };
  const waiting = [
    ...doc.document.querySelectorAll(
      '[data-slot="media"] [data-slot="skeleton"], [data-slot="wait-row"] img'
    ),
  ].some((one) => {
    const box = one.getBoundingClientRect();
    return box.height > 0 && box.top < doc.innerHeight && box.bottom > 0;
  });
  const painted =
    doc.__cawcoPainted === true ||
    (framed && !!doc.document.body?.textContent?.trim());
  return (
    !waiting &&
    painted &&
    doc.document.readyState === "complete" &&
    doc.document.fonts.status === "loaded" &&
    doc.__cawcoPending === 0 &&
    performance.now() - (doc.__cawcoChangedAt ?? 0) >= settle
  );
};

/** Whether `frame` stands in what the picture shows: in the window, neither empty nor hidden. One still at no opacity is a frame on its way, and counts. */
const shownInPicture = async (frame: Frame, page: Page): Promise<boolean> => {
  const holder = await frame.frameElement();
  const box = await holder.boundingBox();
  const view = page.viewportSize();
  return (
    !!box &&
    !!view &&
    box.width > 0 &&
    box.height > 0 &&
    box.y < view.height &&
    box.y + box.height > 0 &&
    box.x < view.width &&
    box.x + box.width > 0 &&
    (await holder.evaluate((el) =>
      el.checkVisibility({ visibilityProperty: true })
    ))
  );
};

/** Whether `frame` holds the picture up: one it shows, not yet ready; one that went while it was read holds nothing. */
const frameReady = async (frame: Frame, page: Page): Promise<boolean> => {
  try {
    return (
      frame === page.mainFrame() ||
      !(await shownInPicture(frame, page)) ||
      (await frame.evaluate(documentReady, {
        framed: true,
        settle: PICTURE_LIMITS.settleMs,
      }))
    );
  } catch {
    return !page.frames().includes(frame);
  }
};

/**
 * Waits up to `within` ms for `page` to be ready ({@link documentReady}). A
 * page that never says so (one that paints only a canvas, or keeps a request
 * open) is drawn as it stands at the bound.
 */
const ready = (page: Page, within: number): Promise<void> =>
  page
    .waitForFunction(
      documentReady,
      { framed: false, settle: PICTURE_LIMITS.settleMs },
      { polling: READY_POLL_MS, timeout: within }
    )
    .then(
      () => undefined,
      (error: unknown) => {
        if (!timedOut(error)) {
          throw error;
        }
      }
    );

/** {@link ready}, then every frame the picture shows, within one bound of `until`. */
const framesReady = async (page: Page, until: number): Promise<void> => {
  await ready(page, Math.max(0, until - Date.now()));
  while (Date.now() < until) {
    const frames = await Promise.all(
      page.frames().map((frame) => frameReady(frame, page))
    );
    if (frames.every(Boolean)) {
      return;
    }
    await page.waitForTimeout(READY_POLL_MS);
  }
};

/**
 * A decision page's whole length: it is the window's height and scrolls
 * inside, so a window's picture of it is its first screen. The window opens to
 * its scroller's length, up to `PICTURE_LIMITS.maxHeight`; any other page's
 * length is the document's, and its layout stands at the window it asked for.
 */
const openToLength = async (page: Page, width: number): Promise<void> => {
  const hidden = await page.evaluate((selector) => {
    const { document } = globalThis as unknown as {
      document: {
        querySelector: (
          selector: string
        ) => { clientHeight: number; scrollHeight: number } | null;
      };
    };
    const scroller = document.querySelector(selector);
    return scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
  }, PICTURE_PAGE_SCROLLER);
  if (hidden > 0) {
    const view = page.viewportSize()?.height ?? PICTURE_VIEW.height;
    await page.setViewportSize({
      width,
      height: Math.min(view + hidden, PICTURE_LIMITS.maxHeight),
    });
  }
};

/** The picture of `ask.url`, base64 PNG. Throws in words a tool answers when it can't be drawn. */
export async function drawArtifact(ask: PictureAsk): Promise<{ png: string }> {
  if (!(isHelloArtifact(ask) && URL.canParse(ask.url))) {
    throw new Error(
      "A picture names the page's URL and the artifact: its id, kind, name and sync path."
    );
  }
  const { width } = ask;
  if (
    !Number.isInteger(width) ||
    width < PICTURE_LIMITS.minWidth ||
    width > PICTURE_LIMITS.maxWidth
  ) {
    throw new Error(
      `A picture's width is a whole number of px from ${PICTURE_LIMITS.minWidth} to ${PICTURE_LIMITS.maxWidth}.`
    );
  }
  const { name } = ask.artifact;
  // The load and the page's readiness share one bound.
  const deadline = Date.now() + PICTURE_LIMITS.loadMs;
  const browser = await launchChromium(
    `${name} wasn't drawn: the hub's machine has no Chromium browser to draw it with. Install Google Chrome or Chromium there (the machine's capability report names the command), then call again.`
  );
  try {
    const page = await browser.newPage({
      viewport: { width, height: PICTURE_VIEW.height },
      colorScheme: "light",
    });
    await page.addInitScript(HOST_STAND_IN);
    await page.addInitScript(watchReadiness);
    // A page turned away at its origin's lock, or a down page in its stead,
    // says so to its host; the panel draws its own words for either.
    await page.addInitScript((locked) => {
      const heard = globalThis as unknown as Heard;
      heard.__cawcoHeard = (data) => {
        const said = data as { type?: unknown } | null;
        if (said?.type === locked) {
          heard.__cawcoLocked = true;
        } else if (said?.type === "cawco:down") {
          heard.__cawcoDown = said as Heard["__cawcoDown"];
        }
      };
    }, PREVIEW_LOCKED_MESSAGE);
    await page
      .goto(ask.url, { timeout: PICTURE_LIMITS.loadMs, waitUntil: "load" })
      .catch((error: unknown) => {
        throw new Error(
          timedOut(error)
            ? `${name} wasn't drawn: its page didn't load within ${seconds(PICTURE_LIMITS.loadMs)}, its server's wake included.`
            : `${name} wasn't drawn: its page didn't load (${error instanceof Error ? error.message : String(error)}).`
        );
      });
    const heard = await page.evaluate(() => {
      const { __cawcoDown, __cawcoLocked } = globalThis as unknown as Heard;
      return { down: __cawcoDown, locked: __cawcoLocked === true };
    });
    if (heard.locked) {
      throw new Error(
        `${name} wasn't drawn: its preview origin turned the picture's pass away.`
      );
    }
    if (heard.down) {
      throw new Error(downWords(name, heard.down));
    }
    await greet(page, ask);
    // The hello places the person's pins: the quiet counts from it too.
    await page.evaluate(() => {
      (globalThis as unknown as Readiness).__cawcoChangedAt = performance.now();
    });
    await ready(page, Math.max(0, deadline - Date.now()));
    await openToLength(page, width);
    await framesReady(page, deadline);
    const tall = await page.evaluate(async () => {
      const { document } = globalThis as unknown as {
        document: {
          documentElement: { scrollHeight: number };
          fonts: { ready: Promise<unknown> };
        };
      };
      await document.fonts.ready;
      return document.documentElement.scrollHeight;
    });
    const height = Math.min(
      Math.max(tall, PICTURE_VIEW.height),
      PICTURE_LIMITS.maxHeight
    );
    const png = await page.screenshot({
      fullPage: true,
      clip: { x: 0, y: 0, width, height },
      animations: "disabled",
      caret: "hide",
      timeout: PICTURE_LIMITS.shotMs,
    });
    return { png: png.toString("base64") };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
