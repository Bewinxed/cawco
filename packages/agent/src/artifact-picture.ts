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

import {
  type HelloArtifact,
  PICTURE_LIMITS,
  PICTURE_PAGE_SCROLLER,
  PICTURE_VIEW,
  type PictureAsk,
  type PictureCut,
} from "@cawco/core/artifact-picture";
import { type Bounded, Gone, readWhileLive } from "@cawco/core/bounded";
import { PREVIEW_DOWNS } from "@cawco/core/preview/protocol";
import { PREVIEW_LOCKED_MESSAGE } from "@cawco/core/preview/routes";
import { pictureWaitWords } from "@cawco/core/words/picture-waits";
import { DOWN_WORDS } from "@cawco/core/words/preview-down";
import { Effect } from "effect";
import type { Frame, Page } from "playwright-core";
import {
  greet,
  HOST_STAND_IN,
  holdTimeAnimations,
  launchChromium,
} from "./chromium";
import {
  changedAtNow,
  documentHeight,
  documentReady,
  heardOfHost,
  hearHost,
  hiddenLength,
  markChanged,
} from "./in-page/page";

/**
 * The page's readiness, watched from before its own scripts run: its
 * largest-contentful-paint entries (the platform's word that content
 * painted, W3C Largest Contentful Paint), its long tasks (its main thread's
 * own work, W3C Long Tasks), and its own fetches and XHRs in flight (a load
 * function's data). Ready ends on the page's own quiet, as Chrome reads a
 * page's network as almost idle (blink IdlenessDetector): content painted,
 * no more than `PICTURE_LIMITS.inFlightMost` requests in flight, and no
 * paint, no long task and no more in flight than that for `settleMs`. A
 * request that ends is no change of the page's: a page that polls every
 * half second, or holds a stream open, still reads ready. What the overlay
 * paints, inside `cawco-overlay`, and its requests to `/__cawco/` (its
 * doc's sync) are the hub's, never the page's.
 */
const watchReadiness = `(() => {
  const most = ${PICTURE_LIMITS.inFlightMost};
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
  new PerformanceObserver(() => changed()).observe({ type: "longtask", buffered: true });
  const counted = (url) => !String(url instanceof Request ? url.url : url).includes("/__cawco/");
  const begun = () => { window.__cawcoPending += 1; if (window.__cawcoPending > most) changed(); };
  const ended = () => { if (window.__cawcoPending > most) changed(); window.__cawcoPending = Math.max(0, window.__cawcoPending - 1); };
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

/** The words the panel draws for down page `down`, and its cause: a refusal's. */
const downWords = (
  name: string,
  down: NonNullable<Window["__cawcoDown"]>
): string => {
  const hop = PREVIEW_DOWNS.find((one) => one === down.down);
  const words = hop === undefined ? "Preview unavailable." : DOWN_WORDS[hop];
  const why = typeof down.why === "string" ? ` Its cause: ${down.why}` : "";
  return `${name} wasn't drawn: the panel would say "${words}"${why}`;
};

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

/** How often the page and its frames are read for readiness. Our call. */
const READY_POLL_MS = 100;

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
        inFlight: PICTURE_LIMITS.inFlightMost,
        settle: PICTURE_LIMITS.settleMs,
      }))
    );
  } catch {
    return !page.frames().includes(frame);
  }
};

/** Waits for `page` to be ready ({@link documentReady}), inside a wait on its life ({@link whileLive}). */
const ready = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    documentReady,
    {
      framed: false,
      inFlight: PICTURE_LIMITS.inFlightMost,
      settle: PICTURE_LIMITS.settleMs,
    },
    { polling: READY_POLL_MS, timeout: 0 }
  );
};

/** {@link ready}, then every frame the picture shows, until `signal` lets go. */
const framesReady = async (page: Page, signal: AbortSignal): Promise<void> => {
  await ready(page);
  while (!signal.aborted) {
    const frames = await Promise.all(
      page.frames().map((frame) => frameReady(frame, page))
    );
    if (frames.every(Boolean)) {
      return;
    }
    await page.waitForTimeout(READY_POLL_MS);
  }
};

/** `hear` told of `page`'s events that are its signs of life: each request it finishes or fails, each answer, each navigation and load of its frames. Answers its own let-go. */
const hearPage = (page: Page, hear: () => void): (() => void) => {
  page.on("requestfinished", hear);
  page.on("requestfailed", hear);
  page.on("response", hear);
  page.on("framenavigated", hear);
  page.on("domcontentloaded", hear);
  page.on("load", hear);
  return () => {
    page.off("requestfinished", hear);
    page.off("requestfailed", hear);
    page.off("response", hear);
    page.off("framenavigated", hear);
    page.off("domcontentloaded", hear);
    page.off("load", hear);
  };
};

/**
 * `work` for as long as `page` shows life (core bounded.ts
 * `readWhileLive`): each of its events {@link hearPage} hears, and each paint or
 * request end its readiness watch counts (`__cawcoChangedAt`, read each
 * {@link READY_POLL_MS}). Its browser's end answers `unanswered` "dead";
 * `asker`, the picture's caller's, ends it at once.
 */
const whileLive = <T>(
  page: Page,
  asker: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>
): Promise<Bounded<T>> =>
  readWhileLive(
    (signal, alive) => {
      const unhear = hearPage(page, () => alive());
      let changedAt: number | undefined;
      const looking = setInterval(() => {
        page
          .evaluate(changedAtNow)
          .then((at) => {
            if (at !== changedAt) {
              changedAt = at;
              alive();
            }
          })
          .catch(() => undefined);
      }, READY_POLL_MS);
      const browser = page.context().browser();
      const done = new AbortController();
      // The browser's end, heard as the work waits: the work is Gone.
      const closed = Effect.runPromise(
        Effect.callback<never, Gone>((resume) => {
          const gone = (): void =>
            resume(
              Effect.fail(new Gone("the browser drawing the picture closed"))
            );
          browser?.once("disconnected", gone);
          return Effect.sync(() => browser?.off("disconnected", gone));
        }),
        { signal: done.signal }
      );
      closed.catch(() => undefined);
      return Promise.race([work(signal), closed]).finally(() => {
        done.abort();
        clearInterval(looking);
        unhear();
      });
    },
    { signal: asker }
  );

/**
 * A decision page's whole length: it is the window's height and scrolls
 * inside, so a window's picture of it is its first screen. The window opens to
 * its scroller's length, up to `PICTURE_LIMITS.maxHeight`; any other page's
 * length is the document's, and its layout stands at the window it asked for.
 * Answers the length the window would need, which is past the limit when the
 * picture will be cut.
 */
const openToLength = async (page: Page, width: number): Promise<number> => {
  const hidden = await page.evaluate(hiddenLength, PICTURE_PAGE_SCROLLER);
  const view = page.viewportSize()?.height ?? PICTURE_VIEW.height;
  if (hidden > 0) {
    await page.setViewportSize({
      width,
      height: Math.min(view + hidden, PICTURE_LIMITS.maxHeight),
    });
  }
  return view + hidden;
};

/** The picture of `ask.url`, base64 PNG, its overlay greeted as the pane greets it; let go once `signal`, its asker's, aborts. Throws in words a tool answers when it can't be drawn. */
export function drawArtifact(
  ask: PictureAsk,
  signal: AbortSignal
): Promise<{ png: string; cut?: PictureCut }> {
  return drawPage(ask.url, ask.width, ask.artifact.name, signal, ask);
}

/**
 * The picture of the page at `url`, `width` px wide, base64 PNG: with
 * `hello`, a page served with the overlay, greeted as the pane greets it
 * so it draws the person's pins ({@link drawArtifact}); without, a page as
 * its server answers it (stage.ts `drawServed`). `name` names it in the
 * words a tool answers when it can't be drawn. `signal` is its asker's: its
 * abort lets every wait go at once, and the browser is closed.
 */
export async function drawPage(
  url: string,
  width: number,
  name: string,
  signal: AbortSignal,
  hello?: HelloArtifact
): Promise<{ png: string; cut?: PictureCut }> {
  if (
    !Number.isInteger(width) ||
    width < PICTURE_LIMITS.minWidth ||
    width > PICTURE_LIMITS.maxWidth
  ) {
    throw new Error(
      `A picture's width is a whole number of px from ${PICTURE_LIMITS.minWidth} to ${PICTURE_LIMITS.maxWidth}.`
    );
  }
  const browser = await launchChromium(
    `${name} wasn't drawn: the machine drawing it has no Chromium browser to draw it with. Install Google Chrome or Chromium there (the machine's capability report names the command), then call again.`
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
    await page.addInitScript(hearHost, PREVIEW_LOCKED_MESSAGE);
    // Its load wakes a sleeping server and waits for it (preview.ts
    // `staged`), then loads the page: waited on while the page shows life.
    const loaded = await whileLive(page, signal, () =>
      page.goto(url, { timeout: 0, waitUntil: "load" })
    ).catch((error: unknown) => {
      throw new Error(
        `${name} wasn't drawn: its page didn't load (${error instanceof Error ? error.message : String(error)}).`
      );
    });
    if (loaded.kind === "unanswered") {
      throw new Error(
        pictureWaitWords.notLoaded(
          name,
          seconds(loaded.after),
          loaded.reason === "dead"
        )
      );
    }
    const heard = await page.evaluate(heardOfHost);
    if (heard.locked) {
      throw new Error(
        `${name} wasn't drawn: its preview origin turned the picture's pass away.`
      );
    }
    if (heard.down) {
      throw new Error(downWords(name, heard.down));
    }
    if (hello) {
      await greet(page, hello);
      // The hello places the person's pins: the quiet counts from it too.
      await page.evaluate(markChanged);
    }
    // A page that never says it is ready (one that paints only a canvas,
    // or keeps a request open) is drawn as it stands once it goes quiet.
    await whileLive(page, signal, () => ready(page));
    const scrolled = await openToLength(page, width);
    await whileLive(page, signal, (live) => framesReady(page, live));
    const tall = await page.evaluate(documentHeight);
    const whole = Math.max(tall, scrolled, PICTURE_VIEW.height);
    const height = Math.min(whole, PICTURE_LIMITS.maxHeight);
    await holdTimeAnimations(page);
    const shot = await whileLive(page, signal, () =>
      page.screenshot({
        fullPage: true,
        clip: { x: 0, y: 0, width, height },
        caret: "hide",
        timeout: 0,
      })
    );
    if (shot.kind === "unanswered") {
      throw new Error(
        pictureWaitWords.notShot(
          name,
          seconds(shot.after),
          shot.reason === "dead"
        )
      );
    }
    return {
      png: shot.value.toString("base64"),
      ...(whole > height ? { cut: { drawn: height, of: whole } } : {}),
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
