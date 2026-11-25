import { frameObserver } from "#lib/platform/frame-observer.js";
import { dur, ease } from "#lib/platform/motion/curves.svelte.js";
import { loopInStep } from "#lib/platform/motion/in-step.svelte.js";
import { tv } from "#lib/utils.js";

/**
 * The segmented control's one recipe: a recessed capsule track holding a
 * Liquid Glass lens over the picked segment and the segments, every corner
 * concentric with the track (the owner's pin of 2026-11-24, "redo these
 * based on liquid glass"; the decision page's "Segmented on the shared
 * segment"). Its geometry is custom properties every part reads: `--radius`
 * the track's corner (a pill), `--pad` its inset, `--item` a segment's
 * height, `--shape` the lens's and the segments' corner (the track's less
 * the pad). It stands on a page's ground: in a bar's glass a segmented
 * control is BarSegments (ui/bar-glass), the glass its list and each segment
 * a bar item. The single ToggleGroup and the kit's Tabs draw it from the
 * slots below; the fluid Tabs' segmented track (fluid-tabs/TabsList) takes
 * {@link SEGMENTED_TRACK} and reads the same properties. By day `surface-
 * hover` is the track's own colour, so a segment's hover is `ui-2`, painted
 * by the kit's segments and, through the track's `--ghost` that the kit
 * ghost (components/ui/highlight) reads, by the fluid track's ghost.
 */
export const SEGMENTED_TRACK =
  "rounded-(--radius) bg-bg-2 p-(--pad) inset-shadow-[0_1px_2px_var(--color-shadow)] [--ghost:var(--color-ui-2)] [--item:var(--spacing-control-sm)] [--pad:calc(var(--spacing)_*_0.75)] [--radius:var(--radius-pill)] [--shape:max(0px,calc(var(--radius)_-_var(--pad)))]";

/**
 * The kit's segmented parts: the track (its recipe above), the lens that
 * {@link segmentedLens} places over the picked segment, and the segments:
 * label weight at line-height 1, muted until picked, each a mark box at the
 * segment's height (design.css `mark-box`), so its words stand centred on
 * their capitals with the same room at their sides, and always above the lens, never
 * under its blur (the lens comes first in the track, each segment is
 * positioned after it). An unpicked segment under a resting pointer takes
 * the track's hover fill and presses with the tint (`press-tint`); the
 * picked one presses by swelling its lens (`data-pressed`, a little past
 * the track, where motion is welcome) and can be dragged across. A group
 * whose answer the hub still owes (`data-pending`) breathes its lens. The
 * lens stands at the track's physical top-left corner, as the offsets it is
 * placed by are measured from it (right to left included).
 */
export const segmentedVariants = tv({
  slots: {
    group: `group/segmented relative inline-flex items-center gap-space-1 ${SEGMENTED_TRACK}`,
    lens: "pointer-events-none absolute top-0 left-0 rounded-(--shape) lens opacity-0 loops group-data-pending/segmented:breathe motion-safe:transition-[scale] motion-safe:duration-(--duration-base) motion-safe:ease-spring motion-safe:data-pressed:scale-[1.08_1.24]",
    segment:
      "relative mark-box inline-flex h-(--item) items-center justify-center rounded-(--shape) font-sans text-base leading-none font-medium whitespace-nowrap text-tx-2 mark-h-(--item) transition-control not-data-[state=active]:not-data-[state=on]:press-tint hover:not-data-[state=active]:not-data-[state=on]:not-aria-expanded:bg-ui-2 data-[state=active]:touch-pan-y data-[state=active]:text-tx data-[state=on]:touch-pan-y data-[state=on]:text-tx",
  },
  variants: {
    /**
     * A segment carrying a mark and a count beside its words (the
     * repository picker's owner chips). Its side room and the room beside
     * its mark are the mark box's, as every segment's are; the look adds
     * nothing and goes with the app pass that drops it from its callers.
     */
    compact: {
      true: { segment: "" },
    },
  },
});

/** A box in the track's offset space. */
interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** How far a press on the picked segment travels before it is a drag, px. */
const DRAG_SLOP = 3;

/** The keys that press a focused segment. */
const PRESS_KEYS = new Set([" ", "Enter"]);

/** Where the lens is drawn right now, its swell left out. */
const drawn = (lens: HTMLElement): Box => {
  const style = getComputedStyle(lens);
  const [x = 0, y = 0] = style.translate
    .split(" ")
    .map((part) => Number.parseFloat(part) || 0);
  return {
    x,
    y,
    w: Number.parseFloat(style.width),
    h: Number.parseFloat(style.height),
  };
};

const boxOf = (one: HTMLElement): Box => ({
  x: one.offsetLeft,
  y: one.offsetTop,
  w: one.offsetWidth,
  h: one.offsetHeight,
});

const write = (lens: HTMLElement, box: Box) => {
  lens.style.translate = `${box.x}px ${box.y}px`;
  lens.style.width = `${box.w}px`;
  lens.style.height = `${box.h}px`;
};

/**
 * The lens's glide from one box to the next on --ease-spring over
 * --duration-slow: its move on `translate`, which the compositor runs, and
 * its size, when that changes, in an animation of its own.
 */
const glide = (lens: HTMLElement, from: Box, to: Box): Animation[] => {
  const timing = {
    duration: dur("--duration-slow"),
    easing: ease("--ease-spring"),
  };
  const runs = [
    lens.animate(
      [
        { translate: `${from.x}px ${from.y}px` },
        { translate: `${to.x}px ${to.y}px` },
      ],
      timing
    ),
  ];
  if (from.w !== to.w || from.h !== to.h) {
    runs.push(
      lens.animate(
        [
          { width: `${from.w}px`, height: `${from.h}px` },
          { width: `${to.w}px`, height: `${to.h}px` },
        ],
        timing
      )
    );
  }
  return runs;
};

/** Of `places`, the one whose centre is nearest `centre`. */
const nearest = (places: HTMLElement[], centre: number) => {
  let best: HTMLElement | undefined;
  let gap = Number.POSITIVE_INFINITY;
  for (const one of places) {
    const off = Math.abs(one.offsetLeft + one.offsetWidth / 2 - centre);
    if (off < gap) {
      best = one;
      gap = off;
    }
  }
  return best;
};

/**
 * Lays the lens of a segmented group (the single ToggleGroup, the kit's
 * Tabs) over its picked segment and lets a press carry it to another.
 *
 * - A pick glides the lens there ({@link glide}). Its move is its
 *   `translate`, on the compositor; its size changes (a segment of another
 *   width) in an animation of their own, run only when the size changes. A
 *   change caught mid-glide starts from where the lens is on screen, not
 *   where it was headed. With less motion it stands on the pick at once.
 * - A press on the picked segment swells the lens (`data-pressed`, the
 *   recipe's scale); dragging it carries the lens with the pointer along
 *   its row, held to the track, and the release picks the segment nearest
 *   the lens's centre, as a tap on it would (its `click`, so the group's
 *   own handlers run), the lens gliding on from where it was let go. The
 *   pointer is captured by the pressed segment, and the click the release
 *   sends it is swallowed.
 * - A tap on any other segment picks it at once. The picked one stays
 *   picked under a tap or its keys (Space, Enter), where a single bits-ui
 *   toggle group would clear its value and leave the track with no lens.
 *   The arrow keys stay the group's own.
 *
 * `picked` finds the picked segment, `segments` every segment a drag may
 * land on.
 */
export function segmentedLens(
  group: HTMLElement,
  lens: HTMLElement,
  { picked, segments }: { picked: string; segments: string }
): () => void {
  let last: Box | undefined;
  let runs: Animation[] = [];
  const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");

  /** The drag under way: the press's start, the lens's box when it began. */
  let drag:
    | {
        pointer: number;
        segment: HTMLElement;
        startX: number;
        from: Box;
        min: number;
        max: number;
        moved: boolean;
      }
    | undefined;
  /** The click a drag's release sends the pressed segment, swallowed. */
  let swallow = false;

  const running = () => runs.some((run) => run.playState === "running");

  const stop = () => {
    for (const run of runs) {
      run.cancel();
    }
    runs = [];
  };

  /**
   * Where the lens goes, read on the layout a delivery has just done: the
   * picked segment's box, and where the lens is drawn if it is gliding.
   * Answered by its write, so no read here lays the page out.
   */
  const place = (animate: boolean): (() => void) | undefined => {
    const on = group.querySelector<HTMLElement>(picked);
    if (!on) {
      return () => {
        stop();
        lens.style.opacity = "0";
        last = undefined;
      };
    }
    const next = boxOf(on);
    // A resize while it glides (the group taking a new segment's width)
    // turns the glide toward the new place, never cutting it to the end.
    const moving = running();
    const moved =
      last !== undefined &&
      (last.x !== next.x ||
        last.y !== next.y ||
        (moving && (last.w !== next.w || last.h !== next.h)));
    if (moving && !moved) {
      return;
    }
    const from = moving ? drawn(lens) : last;
    return () => {
      stop();
      lens.style.opacity = "1";
      write(lens, next);
      if ((animate || moving) && moved && from && motion.matches) {
        runs = glide(lens, from, next);
      }
      last = next;
    };
  };

  /** A pick turned: the lens glides to it, read in the next delivery. */
  let gliding = false;

  /** Every segment on the row at `y`, a drag's landing places. */
  const row = (y: number) =>
    [...group.querySelectorAll<HTMLElement>(segments)].filter(
      (one) => one.offsetTop === y && one.offsetWidth > 0
    );

  /** The picked segment an event reached, if it reached that one. */
  const pickedAt = (event: Event) => {
    const segment =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(segments)
        : null;
    return segment && group.contains(segment) && segment.matches(picked)
      ? segment
      : undefined;
  };

  const press = (event: PointerEvent) => {
    const segment = pickedAt(event);
    if (event.button !== 0 || drag || !segment) {
      return;
    }
    const from = boxOf(segment);
    const places = row(from.y);
    drag = {
      pointer: event.pointerId,
      segment,
      startX: event.clientX,
      from,
      min: Math.min(...places.map((one) => one.offsetLeft)),
      max: Math.max(
        ...places.map((one) => one.offsetLeft + one.offsetWidth - from.w)
      ),
      moved: false,
    };
    segment.setPointerCapture(event.pointerId);
    lens.dataset.pressed = "";
  };

  const follow = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) {
      return;
    }
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < DRAG_SLOP) {
      return;
    }
    if (!drag.moved) {
      drag.moved = true;
      stop();
    }
    const x = Math.min(drag.max, Math.max(drag.min, drag.from.x + dx));
    write(lens, { ...drag.from, x });
  };

  const release = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) {
      return;
    }
    const held = drag;
    drag = undefined;
    delete lens.dataset.pressed;
    if (held.segment.hasPointerCapture(held.pointer)) {
      held.segment.releasePointerCapture(held.pointer);
    }
    if (!held.moved) {
      return;
    }
    // The lens glides on from where it was let go.
    last = drawn(lens);
    const landing =
      event.type === "pointerup"
        ? nearest(row(held.from.y), last.x + last.w / 2)
        : undefined;
    if (landing && landing !== held.segment) {
      landing.click();
      landing.focus({ preventScroll: true });
    } else {
      placeSoon();
    }
    if (event.type === "pointerup") {
      swallow = true;
      setTimeout(() => {
        swallow = false;
      });
    }
  };

  const hush = (event: MouseEvent) => {
    if (swallow || pickedAt(event)) {
      swallow = false;
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const keep = (event: KeyboardEvent) => {
    if (PRESS_KEYS.has(event.key) && pickedAt(event)) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  // Every place is read inside a delivery, on the layout the frame has just
  // done (frameObserver): its first, as the group mounts, a resize, and a
  // pick asked for (`placeSoon`). Read as it mounted, each group laid the
  // page out between the writes of the mount's flush.
  const sizes = frameObserver(null, {
    inside: () => {
      const animate = gliding;
      gliding = false;
      return drag?.moved ? undefined : place(animate);
    },
  });
  const placeSoon = () => {
    gliding = true;
    if (!sizes.readInFrame()) {
      sizes.readNext();
    }
  };
  // The pick turning, or the segments put in another order (the owner
  // strip's pick from "+N" taking a place on its line): the lens follows
  // the picked one to wherever it now stands. A drag holds it meanwhile.
  const changes = new MutationObserver(() => {
    if (!drag?.moved) {
      placeSoon();
    }
  });
  changes.observe(group, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-state"],
  });
  sizes.observe(group);
  group.addEventListener("pointerdown", press);
  group.addEventListener("pointermove", follow);
  group.addEventListener("pointerup", release);
  group.addEventListener("pointercancel", release);
  group.addEventListener("click", hush, { capture: true });
  group.addEventListener("keydown", keep, { capture: true });
  // The lens's pending breath, which starts when the group turns pending,
  // stands in step with every other live mark.
  const unstep = loopInStep(lens);
  return () => {
    unstep();
    changes.disconnect();
    sizes.disconnect();
    group.removeEventListener("pointerdown", press);
    group.removeEventListener("pointermove", follow);
    group.removeEventListener("pointerup", release);
    group.removeEventListener("pointercancel", release);
    group.removeEventListener("click", hush, { capture: true });
    group.removeEventListener("keydown", keep, { capture: true });
  };
}
