/**
 * The local host's view while nobody holds the browser (Projects spec
 * §5.11, the view's "Runtime missing" row: the frames): a screencast of the
 * page in front (front-origin.ts {@link frontTarget}) for every view of the
 * browser's `/cdp` socket, on the daemon's own DevTools link, never the
 * gate. It is a picture alone: the page keeps the viewport the agent drives
 * it at, and a view's input is dropped (cdp-takeover.ts `watch`).
 *
 * One screencast per browser, started by its first view and stopped with
 * its last. When the page in front moves to another, and when the person
 * takes the browser over (whose own screencast is the views' from then on),
 * the views are closed with {@link BROWSER_VIEW_MOVED}, which a view opens
 * again at once.
 */
import { BROWSER_VIEW_MOVED, type BrowserKey } from "@cawco/core/browser";
import { CdpTakeover, type CdpViewer } from "./cdp-takeover";
import { frontTarget, onFrontMoved } from "./front-origin";

interface Watched {
  cast: Promise<CdpTakeover>;
  targetId: string;
}

const watched = new Map<BrowserKey, Watched>();

const why = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Ends `key`'s screencast, its views closed with {@link BROWSER_VIEW_MOVED} and `reason`. */
export const endWatch = (key: BrowserKey, reason: string): void => {
  const held = watched.get(key);
  if (!held) {
    return;
  }
  watched.delete(key);
  held.cast
    .then((cast) => cast.stop(BROWSER_VIEW_MOVED, reason))
    .catch(() => undefined);
};

onFrontMoved((key) => {
  const held = watched.get(key);
  if (held && held.targetId !== frontTarget(key)) {
    endWatch(key, "The page in front moved.");
  }
});

/**
 * A view of `key`'s page in front, its frames to `viewer`, on the Chromium
 * whose DevTools answer at `devtools`; undefined when no page is in front.
 * Answers how the view is let go: the screencast ends with its last.
 */
export const watchView = async (
  key: BrowserKey,
  devtools: string,
  viewer: CdpViewer
): Promise<(() => void) | undefined> => {
  const targetId = frontTarget(key);
  if (!targetId) {
    return;
  }
  let held = watched.get(key);
  if (held?.targetId !== targetId) {
    if (held) {
      endWatch(key, "The page in front moved.");
    }
    held = {
      targetId,
      cast: CdpTakeover.start(devtools, targetId, { watch: true }),
    };
    watched.set(key, held);
    held.cast.catch((error: unknown) => {
      console.warn(`[browser] ${key}'s view did not start: ${why(error)}`);
      if (watched.get(key) === held) {
        watched.delete(key);
      }
    });
  }
  const mine = held;
  const cast = await mine.cast;
  const leave = await cast.attach(viewer);
  return () => {
    leave();
    if (cast.viewers === 0 && watched.get(key) === mine) {
      watched.delete(key);
      cast.stop().catch(() => undefined);
    }
  };
};
