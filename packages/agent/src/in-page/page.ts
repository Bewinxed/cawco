/**
 * What runs inside a page the agent drives with Playwright (artifact-picture.ts,
 * frame-picture.ts, stage-render.ts, chromium.ts). A function here is handed to
 * `page.evaluate` and runs in the browser, so it is checked against the DOM
 * where the rest of the agent is checked against Bun; it closes over nothing
 * but its arguments and the page's own globals, declared below.
 */
import type { FramePictureRead, Interaction, SweepAt } from "@cawco/core/stage";

declare global {
  interface Window {
    /** What the stage page answers for its sweep and its pictures (stage-host canvas runtime.ts `CanvasState`). */
    __cawcoCanvas?: PageCanvas | undefined;
    /** When the page last painted a larger element or ended a request, in its `performance.now()` (artifact-picture.ts `watchReadiness`). */
    __cawcoChangedAt?: number | undefined;
    /** The dashboard stand-in's door for a hello, put on the page before its own scripts run (chromium.ts `HOST_STAND_IN`). */
    __cawcoDeliver: (data: unknown) => void;
    /** The down page the proxy served, as the stand-in heard it. */
    __cawcoDown?: { down?: unknown; why?: unknown } | undefined;
    /** What the page says to its host, as the stand-in hears it. */
    __cawcoHeard?: ((data: unknown) => void) | undefined;
    /** Whether the page's origin lock turned it away. */
    __cawcoLocked?: boolean | undefined;
    /** Whether the page has painted its largest contentful element at least once. */
    __cawcoPainted?: boolean | undefined;
    /** Its own fetches and XHRs in flight. */
    __cawcoPending?: number | undefined;
  }
}

/** What the stage page keeps on `__cawcoCanvas`, as far as the agent reads it. */
interface PageCanvas {
  drawn: string[];
  lacks?: (key: string) => { h: number; w: number } | null;
  picture?: (key: string) => FramePictureRead | null;
  pose?: (key: string) => Promise<{ h: number; w: number } | null>;
  reports: number;
  settled?: (key: string) => boolean;
  stateNamed?: (
    name: string,
    interaction?: Interaction
  ) => Promise<{ key: string } | { refused: string }>;
  sweepAt: SweepAt | null;
  sweeps: string[];
  swept: boolean;
}

/**
 * Whether a document is ready (artifact-picture.ts `watchReadiness`): its
 * fonts loaded, its content painted, nothing of its own in flight, all of it
 * still for `settle` ms, no decision page's Preview still waiting in its
 * view (the skeleton in its well) and no picture in its view still loading.
 * A frame's painted content is its words as well.
 */
export const documentReady = ({
  framed,
  settle,
}: {
  framed: boolean;
  settle: number;
}): boolean => {
  const inView = (one: Element): boolean => {
    const box = one.getBoundingClientRect();
    return box.height > 0 && box.top < innerHeight && box.bottom > 0;
  };
  const waiting = [
    ...document.querySelectorAll('[data-slot="media"] [data-slot="skeleton"]'),
  ].some(inView);
  // A picture not yet loaded may stand at no height, so only its place counts.
  const loading = [...document.querySelectorAll("img")].some((one) => {
    const box = one.getBoundingClientRect();
    return one.complete === false && box.top < innerHeight && box.bottom >= 0;
  });
  const painted =
    window.__cawcoPainted === true ||
    (framed && !!document.body?.textContent?.trim());
  return (
    !(waiting || loading) &&
    painted &&
    document.readyState === "complete" &&
    document.fonts.status === "loaded" &&
    window.__cawcoPending === 0 &&
    performance.now() - (window.__cawcoChangedAt ?? 0) >= settle
  );
};

/** How much of the scroller `selector` names lies out of its view; 0 where the page has none. */
export const hiddenLength = (selector: string): number => {
  const scroller = document.querySelector(selector);
  return scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
};

/** What the page heard of its host: a down page, and whether its lock turned it away. */
export const heardOfHost = () => ({
  down: window.__cawcoDown,
  locked: window.__cawcoLocked === true,
});

/** The quiet counts from now. */
export const markChanged = (): void => {
  window.__cawcoChangedAt = performance.now();
};

/** The document's whole length, once its fonts are loaded. */
export const documentHeight = async (): Promise<number> => {
  await document.fonts.ready;
  return document.documentElement.scrollHeight;
};

/**
 * Holds the document's time animations: a finite one at its end, an endless
 * one at its start, save those that run on a scroller's clock (chromium.ts
 * `holdTimeAnimations`).
 */
export const holdAnimations = (): void => {
  for (const run of document.getAnimations()) {
    if (run.timeline?.constructor.name !== "DocumentTimeline") {
      continue;
    }
    if (Number.isFinite(run.effect?.getComputedTiming().endTime)) {
      run.finish();
    } else {
      run.cancel();
    }
  }
};

/** The stage's sweep as it stands now: null before its runtime has booted. */
export const sweepNow = () => {
  const state = window.__cawcoCanvas;
  return state
    ? {
        drawn: [...state.drawn],
        reports: state.reports,
        swept: state.swept,
        sweepAt: state.sweepAt,
        sweeps: [...state.sweeps],
      }
    : null;
};

/** The page's host hears what the page says to it: its lock turned it away (`locked` names that message), or the proxy served its down page. */
export const hearHost = (locked: string): void => {
  window.__cawcoHeard = (data) => {
    const said = data as { type?: unknown } | null;
    if (said?.type === locked) {
      window.__cawcoLocked = true;
    } else if (said?.type === "cawco:down") {
      window.__cawcoDown = said as Window["__cawcoDown"];
    }
  };
};

/** The hello the dashboard would send, to the page's stand-in host. */
export const deliverHello = (hello: unknown): void => {
  window.__cawcoDeliver(hello);
};

/** The state story `name` stands at in `interaction`, or null where the page holds no stage. */
export const stateNamedNow = ([name, interaction]: readonly [
  string,
  Interaction,
]) => window.__cawcoCanvas?.stateNamed?.(name, interaction) ?? null;

/** The stage posed at state `key`: the room the window lacks for it, or null. */
export const poseNow = async (key: string) =>
  (await window.__cawcoCanvas?.pose?.(key)) ?? null;

/** Whether the window holds state `key` whole at its own size: the stage lacks no room for it. */
export const roomHeld = (key: string): boolean => {
  const room = window.__cawcoCanvas?.lacks?.(key);
  return !!room && room.w === 0 && room.h === 0;
};

/** Whether state `key`'s drawing has settled. */
export const settledNow = (key: string) =>
  window.__cawcoCanvas?.settled?.(key) ?? false;

/** State `key`'s drawing as it stands, for its picture. */
export const pictureNow = (key: string) =>
  window.__cawcoCanvas?.picture?.(key) ?? null;
