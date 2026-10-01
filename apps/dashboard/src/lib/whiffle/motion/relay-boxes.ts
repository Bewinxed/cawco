/**
 * The boxes of a relay (motion/list-swap, home/relay-plan): when a grouped
 * list swaps its rows, each group's box is driven, not measured after the
 * fact. A box that grows opens at once; one that shrinks holds its height
 * until its last leaving line has gone, then closes; one that goes closes to
 * nothing. An arriving line in an opening box waits for the box's edge to
 * reach its foot, so nothing is ever drawn past a box's edge, and an old line
 * never overflows into the group below while the new ones arrive there.
 *
 * Boxes carry `data-machine` (their group's id) and `data-kind` ("gone" for
 * one leaving); lines carry `data-key`, and leaving layers `data-leaving`.
 * Shared by the home's Working/Finished and /usage's Where it goes.
 */
import { CURVE, dur, easeDrawer } from "./curves.svelte";

/** An arriving line's place in the cascade, and the earliest it may start. */
interface Arrival {
  i: number;
  notBefore: number;
}

interface Opening {
  from: number;
  ms: number;
  to: number;
}

/**
 * How long a box's height travels `delta` px on the morph curve
 * (--ease-drawer): --dur-panel, longer for a long way (2.5ms a pixel), never
 * past 480ms, so a big change still reads as one quick glide.
 */
export const tweenMs = (delta: number): number =>
  Math.min(480, Math.max(dur("--dur-panel"), Math.ceil(Math.abs(delta) * 2.5)));

/**
 * How far into an opening box's tween (0–1) its edge reaches `foot` px from
 * its top: the morph curve, inverted by halving.
 */
function reached(open: Opening, foot: number): number {
  const share = (foot - open.from) / (open.to - open.from);
  if (share <= 0) {
    return 0;
  }
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 20; step += 1) {
    const mid = (lo + hi) / 2;
    if (easeDrawer(mid) < share) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

/** Each box's drawn height this frame, by its `data-machine`. */
export function boxHeights(
  list: HTMLElement,
  boxes: string
): Map<string, number> {
  const out = new Map<string, number>();
  for (const el of list.querySelectorAll<HTMLElement>(boxes)) {
    out.set(el.dataset.machine ?? "", el.getBoundingClientRect().height);
  }
  return out;
}

/** The lines shown this frame: arrived, and inside their box's edge. */
export function onScreen(list: HTMLElement, box: string): Set<string> {
  const shown = new Set<string>();
  for (const line of list.querySelectorAll<HTMLElement>("[data-key]")) {
    const holder = line.closest(box);
    if (!holder || line.closest("[data-leaving]")) {
      continue;
    }
    const edge = holder.getBoundingClientRect().bottom;
    if (
      Number.parseFloat(getComputedStyle(line).opacity) > 0.05 &&
      line.getBoundingClientRect().bottom <= edge + 0.5
    ) {
      shown.add(line.dataset.key ?? "");
    }
  }
  return shown;
}

/**
 * Moves every box from the height it was drawn at (`before`) to its new
 * one. Returns the animations (to cancel), the boxes that open, and when the
 * last height lands.
 */
export function driveHeights(
  list: HTMLElement,
  boxes: string,
  before: Map<string, number>,
  lastOut: Map<string, number>
): { done: number; opened: Map<Element, Opening>; runs: Animation[] } {
  const opened = new Map<Element, Opening>();
  const runs: Animation[] = [];
  let done = 0;
  for (const el of list.querySelectorAll<HTMLElement>(boxes)) {
    const id = el.dataset.machine ?? "";
    const gone = el.dataset.kind === "gone";
    const from = before.get(id) ?? 0;
    const to = gone ? 0 : el.offsetHeight;
    if (Math.abs(to - from) < 0.5) {
      continue;
    }
    const ms = tweenMs(to - from);
    const wait = to > from ? 0 : (lastOut.get(id) ?? 0);
    if (to > from) {
      opened.set(el, { from, ms, to });
    }
    done = Math.max(done, wait + ms);
    runs.push(
      el.animate(
        [
          { height: `${from}px`, overflowY: "clip" },
          { height: `${to}px`, overflowY: "clip" },
        ],
        {
          duration: ms,
          delay: wait,
          easing: CURVE.drawer,
          fill: gone ? "both" : "backwards",
        }
      )
    );
  }
  return { done, opened, runs };
}

/**
 * An arriving line in an opening box waits for the box's edge to reach its
 * foot, so nothing shows past a box's edge.
 */
export function waitForBoxes<A extends Arrival>(
  opened: Map<Element, Opening>,
  enter: Map<string, A>
): Map<string, A> {
  const reach = new Map(enter);
  for (const [box, open] of opened) {
    const { top } = box.getBoundingClientRect();
    for (const line of box.querySelectorAll<HTMLElement>("[data-key]")) {
      const key = line.dataset.key ?? "";
      const at = reach.get(key);
      const foot = line.getBoundingClientRect().bottom - top;
      const wait = Math.ceil(open.ms * reached(open, foot));
      if (at && wait > at.notBefore) {
        reach.set(key, { ...at, notBefore: wait });
      }
    }
  }
  return reach;
}
