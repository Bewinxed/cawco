/**
 * A row that scrolls sideways under the house edge fade (`kit-edge-fade`,
 * edge-fade.css): a strip wider than its box, its scrollbar hidden
 * (`no-scrollbar`), so the fades alone say there is more past an edge (the
 * fluid tabs' track).
 *
 * - {@link glide}: a vertical wheel or trackpad scroll over the row moves it
 *   sideways on a spring. A scroll it can't use is never held: a row that
 *   doesn't overflow, or stands at its end in the scroll's direction, leaves
 *   the wheel to what holds it. A sideways swipe is the browser's own scroll
 *   and is left alone.
 * - {@link clearOfFades}: where the row scrolls so an item stands whole in
 *   it, clear of the fades.
 *
 * With reduced motion every move is instant.
 */
import { dur, motionOk } from "./curves.svelte";

/** A line's worth of wheel, px: a wheel that counts in lines (Firefox's). */
const LINE_PX = 16;

/**
 * Where `row` scrolls to so `item` stands whole in it, clear of its edge
 * fades by the fade's length (edge-fade.css `--fade-len`), by the least it
 * takes; null when it already stands so, or the row doesn't scroll.
 */
export function clearOfFades(
  row: HTMLElement,
  item: HTMLElement
): number | null {
  if (row.scrollWidth <= row.clientWidth) {
    return null;
  }
  const fade =
    Number.parseFloat(getComputedStyle(row).getPropertyValue("--fade-len")) ||
    0;
  const box = item.getBoundingClientRect();
  const at = box.left - row.getBoundingClientRect().left + row.scrollLeft;
  const start = at - fade;
  const end = at + box.width + fade - row.clientWidth;
  if (start < row.scrollLeft) {
    return Math.max(0, start);
  }
  if (end > row.scrollLeft) {
    return Math.min(row.scrollWidth - row.clientWidth, end);
  }
  return null;
}

/** A sideways scroller's glide: where it moves under the wheel and to a pick. */
export interface Glide {
  /** Ends the glide where it stands. */
  stop: () => void;
  /** Glides the row to `left`, carrying the speed it has; instant with reduced motion. */
  to: (left: number) => void;
  /**
   * A wheel over the row: a vertical one moves it sideways, held from what
   * holds the row only while the row can move that way.
   */
  wheel: (event: WheelEvent) => void;
}

/**
 * The glide of `row`'s sideways scroll: a spring that each notch of a wheel
 * pushes the target of, the row gliding after it and carrying its speed
 * into the next notch, instead of jumping 100px a click. Critically damped
 * at --duration-slow's response, so it lands without overshoot.
 */
export function glide(row: HTMLElement): Glide {
  let stiffness = 0;
  let damping = 0;
  let target = 0;
  let at = 0;
  let velocity = 0;
  let frame: number | null = null;
  let last = 0;

  /** Where the glide last put the row, as the row reports it. */
  let written = 0;

  const stop = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
  /** Moves the row to `left`, noting where it stands. */
  const put = (left: number) => {
    row.scrollLeft = left;
    written = row.scrollLeft;
  };
  /**
   * The row was moved by something other than the glide since its last
   * frame (a swipe, the browser bringing a focused item in): the glide gives
   * way rather than pull it back.
   */
  const movedElsewhere = () => Math.abs(row.scrollLeft - written) > 1;
  const step = (now: number) => {
    if (movedElsewhere()) {
      frame = null;
      return;
    }
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    velocity += (stiffness * (target - at) - damping * velocity) * dt;
    at += velocity * dt;
    if (Math.abs(target - at) < 0.5 && Math.abs(velocity) < 10) {
      put(target);
      frame = null;
      return;
    }
    put(at);
    frame = requestAnimationFrame(step);
  };
  const to = (left: number) => {
    if (!motionOk.current) {
      stop();
      put(left);
      return;
    }
    if (frame !== null && movedElsewhere()) {
      stop();
    }
    if (frame === null) {
      const response = dur("--duration-slow") / 1000;
      stiffness = ((2 * Math.PI) / response) ** 2;
      damping = (4 * Math.PI) / response;
      at = row.scrollLeft;
      written = at;
      velocity = 0;
      last = performance.now();
      frame = requestAnimationFrame(step);
    }
    target = left;
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
      // A pinch, or a sideways swipe: the browser's own.
      stop();
      return;
    }
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= LINE_PX;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta *= row.clientWidth;
    }
    const max = row.scrollWidth - row.clientWidth;
    const from = frame === null ? row.scrollLeft : target;
    const next = Math.max(0, Math.min(max, from + delta));
    // Nothing to move toward: the scroll goes on to what holds the row.
    if (Math.abs(next - from) < 0.5) {
      return;
    }
    event.preventDefault();
    to(next);
  };
  return { stop, to, wheel };
}
