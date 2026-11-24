/**
 * A play's `userEvent` on a measuring page (core `MEASURE_INPUT`): every
 * press, hover, key and word arrives as real input, sent by the daemon
 * through the DevTools Protocol's Input domain, as Playwright's own mouse,
 * keyboard and touchscreen send it.
 *
 * The performance read charges a move's frames to the component. A press
 * made in script (core stage-play.ts `userEventIn`) runs the stand-in's own
 * work in the press's task: a box read for each of its ten synthetic
 * events, the hover class added and a focus asked for, forcing style
 * before the component's handlers run. At four times slower that was
 * 4.6–7.0 ms of the press's frame, 1.4–2.7 ms of it forced style, read as
 * the component's. Real input is the browser's: it hit-tests, dispatches
 * pointer, mouse, focus and click events and matches `:hover` and
 * `:active` in its own input handling, as for a person's press, so the
 * frame holds what a person's press costs and nothing else.
 *
 * Where to send it is read here, after a frame has rendered, so the box
 * read forces nothing, and a frame before the input goes; a pointer
 * already standing on the element presses where it stands. A page with a
 * coarse pointer (the render's touch emulation, at a phone's width) is
 * tapped, as a phone is. Each read and each call that sends a step is
 * marked as the stage's own work (harness.ts). The person's browser has no DevTools Protocol:
 * its plays keep `userEventIn`.
 */
import { MEASURE_INPUT, type MeasureInput } from "@cawco/core/stage-measure";
import { elementSaid, type UserEvent } from "@cawco/core/stage-play";
import { measureWords } from "@cawco/core/words/stage-measure";
import { harnessWork } from "./harness";

declare global {
  interface Window {
    /** The daemon's real input, on a measuring page (agent stage-measure.ts). */
    [MEASURE_INPUT]?: (step: MeasureInput) => Promise<void>;
  }
}

/** A point in the viewport, CSS pixels. */
interface Point {
  x: number;
  y: number;
}

/** Where the pointer stands off the page: moved there, it leaves whatever it was over. */
const OFF_PAGE: Point = { x: -1, y: -1 };

const send = async (step: MeasureInput): Promise<void> => {
  const deliver = window[MEASURE_INPUT];
  if (!deliver) {
    throw new Error(measureWords.noInput);
  }
  // The call's own work, till the step is handed to the daemon, is the stage's.
  await harnessWork(() => deliver(step));
};

/** A frame on, once it has rendered: layout is clean, so reading a box forces nothing. */
const afterFrame = () =>
  new Promise<void>((done) =>
    requestAnimationFrame(() => {
      setTimeout(done, 0);
    })
  );

/** The next frame, as a play's step waits for what it set off to draw (core stage-play.ts `settle`). */
const nextFrame = () =>
  new Promise<void>((done) => requestAnimationFrame(() => done()));

/** Whether the page's pointer is coarse: the render emulates touch, and a press is a tap. */
const tapped = (): boolean => matchMedia("(pointer: coarse)").matches;

const inView = (box: DOMRect): boolean =>
  box.x + box.width / 2 >= 0 &&
  box.y + box.height / 2 >= 0 &&
  box.x + box.width / 2 < innerWidth &&
  box.y + box.height / 2 < innerHeight;

/** A play's `userEvent` sent as real input, with what the measured press is readied by. */
export interface RealUser extends UserEvent {
  /** The hand brought onto `el` before a click: the mouse moved onto it; nothing where a press is a tap, which has no hover. */
  approach: (el: Element) => Promise<void>;
  /** The pointer moved off the page, leaving whatever it was over: where a move starts. */
  away: () => Promise<void>;
}

/**
 * Real input for a measuring page's plays and presses. `reveal` scrolls an
 * element into view by the stage's own scroll (held-scroll.ts
 * `stageScroll`), which a mount or a play otherwise holds still.
 */
export function realUserEvent(reveal: (el: Element) => void): RealUser {
  /** Where the pointer stands now; null off the page. */
  let at: Point | null = null;

  /** The middle of `el`, in view, where a press on it lands: refused when it has no box or another element stands over it. */
  async function pointOn(el: Element): Promise<Point> {
    await afterFrame();
    if (!harnessWork(() => inView(el.getBoundingClientRect()))) {
      harnessWork(() => reveal(el));
      await afterFrame();
    }
    return harnessWork(() => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        throw new Error(measureWords.noBox(elementSaid(el)));
      }
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      if (!(hit && (hit === el || el.contains(hit)))) {
        throw new Error(
          measureWords.covered(elementSaid(el), hit ? elementSaid(hit) : null)
        );
      }
      return point;
    });
  }

  const moveTo = async (point: Point) => {
    await send({ by: "move", ...point });
    at = point;
  };

  const standsAt = (point: Point) =>
    at !== null && at.x === point.x && at.y === point.y;

  return {
    async away() {
      await moveTo(OFF_PAGE);
      at = null;
    },
    async approach(el) {
      if (!tapped()) {
        await moveTo(await pointOn(el));
      }
    },
    async hover(el) {
      await moveTo(await pointOn(el));
      await nextFrame();
    },
    async unhover() {
      await this.away();
      await nextFrame();
    },
    async click(el) {
      const point = await pointOn(el);
      if (tapped()) {
        await send({ by: "tap", ...point });
      } else {
        // A hand comes onto a control before it presses: the hover draws a frame before the press.
        if (!standsAt(point)) {
          await moveTo(point);
          await afterFrame();
        }
        await send({ by: "press" });
      }
      await nextFrame();
    },
    async type(el, text) {
      if (document.activeElement !== el && el instanceof HTMLElement) {
        el.focus({ preventScroll: true });
        await afterFrame();
      }
      await send({ by: "text", text });
      await nextFrame();
    },
    async keyboard(key) {
      await send({ by: "key", key });
      await nextFrame();
    },
    async tab() {
      await send({ by: "key", key: "Tab" });
      await nextFrame();
    },
    wait: (ms) => new Promise((done) => setTimeout(done, ms)),
  };
}
