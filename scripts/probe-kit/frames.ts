/**
 * Runtime cadence, measured as the page runs: what no seek can stand in
 * for. One watcher (`watch`, installed before the page's own scripts) keeps:
 *
 *  - every window error and unhandled rejection;
 *  - every element style written with `NaN` in it;
 *  - every main-thread long task (PerformanceObserver `longtask`);
 *  - each painted frame, read after its paint (a task behind the frame's
 *    `requestAnimationFrame`: read inside that callback, it is the layout
 *    before the frame's ResizeObserver delivery): where the anchor row
 *    (`anchor`, its text) stands in the transcript's view, the scroller's
 *    `scrollTop` while `sampling`, and the widest blank stretch of the view
 *    between the list's drawn items;
 *  - while `cadence` is on, every requestAnimationFrame's timestamp and the
 *    first pointerdown after it was turned on.
 *
 * The readers below turn those series into the probes' checks.
 */
import type { Page } from "playwright-core";

/** The transcript's scroller, as every transcript spec reads it. */
export const SCROLLER = '[aria-label="Session transcript"]';

export interface Watched {
  anchor: string | null;
  cadence: boolean;
  errors: string[];
  frames: number;
  gap: { at: number; px: number; top: number; where: string };
  gaps: [number, number, number, string][];
  nan: string[];
  rafs: number[];
  sampling: boolean;
  tap: number;
  tasks: [number, number][];
  tops: number[];
  ys: [number, number | null][];
}

/** The watcher: an init script (see the file's head). */
export function watch(): void {
  const w = window as unknown as { __kit: Watched };
  const kit: Watched = {
    anchor: null,
    cadence: false,
    errors: [],
    frames: 0,
    gap: { at: 0, px: 0, top: 0, where: "" },
    gaps: [],
    nan: [],
    rafs: [],
    sampling: false,
    tap: -1,
    tasks: [],
    tops: [],
    ys: [],
  };
  w.__kit = kit;
  window.addEventListener(
    "error",
    (event: ErrorEvent) => kit.errors.push(`error: ${event.message}`),
    true
  );
  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) =>
      kit.errors.push(`rejection: ${String(event.reason)}`)
  );
  addEventListener(
    "pointerdown",
    (event) => {
      if (kit.cadence && kit.tap < 0) {
        kit.tap = event.timeStamp;
      }
    },
    { capture: true }
  );
  new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target as Element;
      const style = target.getAttribute?.("style") ?? "";
      if (style.includes("NaN")) {
        kit.nan.push(
          `${target.className || target.tagName}: ${style.slice(0, 160)}`
        );
      }
    }
  }).observe(document, {
    attributes: true,
    attributeFilter: ["style"],
    subtree: true,
  });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      kit.tasks.push([entry.startTime, entry.duration]);
    }
  }).observe({ type: "longtask", buffered: true });
  /** The widest stretch of the view the list's drawn items leave blank, and where. */
  const blank = (container: HTMLElement, view: DOMRect) => {
    const list = container.getBoundingClientRect();
    const from = Math.max(view.top, list.top);
    const to = Math.min(view.bottom, list.bottom);
    const spans = [...container.children]
      .map((item) => ({
        rect: item.getBoundingClientRect(),
        row: item.querySelector<HTMLElement>("[data-row]")?.dataset.row ?? "?",
      }))
      .filter(
        ({ rect }) => rect.height > 0 && rect.bottom > from && rect.top < to
      )
      .sort((a, b) => a.rect.top - b.rect.top);
    let reach = from;
    let above = "the view's top";
    let widest = 0;
    let where = "";
    for (const { rect, row } of spans) {
      if (rect.top - reach > widest) {
        widest = rect.top - reach;
        where = `between ${above} and ${row}`;
      }
      if (rect.bottom > reach) {
        reach = rect.bottom;
        above = row;
      }
    }
    if (to > from && to - reach > widest) {
      widest = to - reach;
      where = `between ${above} and the view's bottom (${spans.length} rows drawn)`;
    }
    return { widest, where };
  };
  const anchorY = (scroller: HTMLElement, text: string, top: number) => {
    for (const node of scroller.querySelectorAll("*")) {
      if (node.children.length === 0 && node.textContent?.includes(text)) {
        return node.getBoundingClientRect().top - top;
      }
    }
    return null;
  };
  const painted = () => {
    kit.frames += 1;
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    const container = document.querySelector<HTMLElement>(
      ".listing > :first-child"
    );
    if (scroller) {
      const view = scroller.getBoundingClientRect();
      if (kit.sampling) {
        kit.tops.push(scroller.scrollTop);
      }
      if (container) {
        const { widest, where } = blank(container, view);
        const now = performance.now();
        if (widest > 4 && kit.gaps.length < 40) {
          kit.gaps.push([now, widest, scroller.scrollTop, where]);
        }
        if (widest > kit.gap.px) {
          kit.gap = { px: widest, at: now, top: scroller.scrollTop, where };
        }
      }
      if (kit.anchor) {
        kit.ys.push([
          performance.now(),
          anchorY(scroller, kit.anchor, view.top),
        ]);
      }
    }
    requestAnimationFrame(after);
  };
  const channel = new MessageChannel();
  channel.port1.onmessage = painted;
  const after = () => channel.port2.postMessage(0);
  requestAnimationFrame(after);
  // Cadence on its own loop, each frame asking for the next.
  const loop = (t: number) => {
    if (kit.cadence) {
      kit.rafs.push(t);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** What the watcher holds now. */
export const watched = (page: Page): Promise<Watched> =>
  page.evaluate(() => (window as unknown as { __kit: Watched }).__kit);

/** Sets fields on the watcher (an anchor, sampling on, a series cleared). */
export const tell = (page: Page, fields: Partial<Watched>): Promise<void> =>
  page.evaluate((f) => {
    Object.assign((window as unknown as { __kit: Watched }).__kit, f);
  }, fields);

/**
 * An anchor's painted path against wheels of `wheel` px: on every frame it is
 * drawn it has moved from where it was first drawn by a whole number of
 * wheels, within 2px (with `oneWay`, never back past the most it has reached
 * nor past `total`); in all by `total` wheels within 2px. Its faults, frames
 * and moves.
 */
export function wholeWheels(
  ys: [number, number | null][],
  wheel: number,
  total: number,
  oneWay = false
) {
  const most = oneWay ? total : Number.POSITIVE_INFINITY;
  const seen = ys.filter(([, y]) => y !== null) as [number, number][];
  const first = seen[0]?.[1] ?? 0;
  const faults: string[] = [];
  let reached = 0;
  let widest = 0;
  seen.forEach(([, y], i) => {
    const moved = y - first;
    const whole = Math.round(moved / wheel);
    widest = Math.max(widest, Math.abs(y - (seen[i - 1]?.[1] ?? y)));
    if (
      Math.abs(moved - whole * wheel) > 2 ||
      (oneWay && whole < reached) ||
      whole > most
    ) {
      faults.push(`frame ${i}: moved ${moved.toFixed(1)}`);
    }
    reached = Math.max(reached, whole);
  });
  const moved = (seen.at(-1)?.[1] ?? 0) - first;
  if (seen.length < 2) {
    faults.push(`${seen.length} frame(s) with it drawn`);
  } else if (Math.abs(moved - total * wheel) > 2) {
    faults.push(`moved ${moved.toFixed(1)}px in all, not ${total * wheel}`);
  }
  return {
    faults,
    frames: seen.length,
    missing: ys.length - seen.length,
    moved,
    widest,
  };
}

/** The longest long task that started at or after `since` (ms, the page's clock), and how many. */
export function longest(tasks: [number, number][], since: number) {
  const after = tasks.filter(([at]) => at >= since - 1);
  return { ms: Math.max(0, ...after.map(([, ms]) => ms)), count: after.length };
}
