/**
 * A field's change of height, drawn on the compositor (the kit Textarea's
 * autosize: motion/autosize `cut`). The field is laid out at its new height
 * in the frame the change lands in, once, and what the eye sees moves on
 * `--duration-control` and `--ease-out`:
 *
 * - its box is cut by its clip from where its edge was drawn to where it now
 *   stands (motion/edge-cut), at its foot, or at its head for a box that
 *   stands on its foot (a docked composer's shell, growing upward); the
 *   slice of that edge (its hairline, its round corners, its shadow, the
 *   focus edge when it shows) is drawn beside the cut and moves with it by
 *   `transform`;
 * - what stands around it that the change moved (the fields under it, a
 *   line over a docked shell) is laid out at its new place and moved back
 *   by `transform` to where it was drawn, then slides home on the cut's
 *   clock: read at each depth from the box up to the first container that
 *   scrolls or stands out of the flow, so a group that moves carries what
 *   is inside it;
 * - a change that leaves the box shorter than it is drawn holds it at the
 *   drawn height (a `min-height` on what draws it) while the cut closes, and
 *   what stands after it slides up by `transform` as far as the change
 *   takes; once that has run the box is laid out at its height and each
 *   moved element stands where it was drawn, in one frame.
 *
 * A change made while one runs carries on from where the box and each
 * moved element are drawn. Nothing is laid out frame by frame: the change
 * is laid out once (twice when it holds), in the task that made it.
 */
import { dur, ease, easingOf, motionOk } from "./curves.svelte";
import { EdgeCut, FRAME } from "./edge-cut";

/** The box a field's height changes are drawn on, what draws its look, and the edge that moves. */
export interface GrowTarget {
  /** Holds the field and draws its edge: its clip cuts this. */
  box: HTMLElement;
  /**
   * Its fill lets what stands behind it through (a material's glass): the
   * box is cut where its slice begins (motion/edge-cut `flush`), so no
   * strip is drawn twice.
   */
  flush?: boolean;
  /** Draws the box's fill, border, rounding and shadow: the slice wears its look, and a shrink holds it. */
  look: HTMLElement;
  side: "foot" | "head";
}

/** Where an element stands in the layout, against its parent's own offset parent. */
interface Place {
  x: number;
  y: number;
}

/** Where an element is drawn as a change begins, where it is laid out, and whether it has a transform of its own. */
interface Placed extends Place {
  laid: Place;
  own: boolean;
}

/** An element moved by a change: from `from` to `to` (px from its layout place) over the run. */
interface Moved {
  animation: Animation;
  at: number;
  curve: (t: number) => number;
  from: Place;
  ms: number;
  /** It has a transform of its own, which the move adds to. */
  own: boolean;
  to: Place;
}

/** What a fit reads before it writes the field's height: the change starts from here. */
interface GrowBefore {
  height: number;
  places: Map<HTMLElement, Placed>;
  /** The box's height as drawn now: laid out, less its cut. */
  shown: number;
  target: GrowTarget;
}

const now = (): number => {
  const time = document.timeline.currentTime;
  return typeof time === "number" ? time : performance.now();
};

/** It ends the walk: what stands outside it never moves for a change inside it. */
function bounds(node: HTMLElement): boolean {
  const style = getComputedStyle(node);
  return (
    style.position === "absolute" ||
    style.position === "fixed" ||
    ["auto", "scroll"].includes(style.overflowY)
  );
}

/**
 * Every element a change of the box's height can move: at each depth from
 * the box up, the box's (or its ancestor's) siblings, up to and including
 * the children of the first container that scrolls or stands out of the
 * flow. None holds another, so each moves by its own step alone.
 */
function aroundOf(box: HTMLElement, skip: HTMLElement | null): HTMLElement[] {
  const around: HTMLElement[] = [];
  for (
    let at: HTMLElement = box, parent = box.parentElement;
    parent && parent !== document.body;
    at = parent, parent = parent.parentElement
  ) {
    for (const child of parent.children) {
      // Out of the layout (hidden, or fixed to the screen): it never moves.
      if (
        child instanceof HTMLElement &&
        child !== at &&
        child !== skip &&
        child.offsetParent !== null
      ) {
        around.push(child);
      }
    }
    if (bounds(parent)) {
      break;
    }
  }
  return around;
}

/**
 * Where an element is laid out on the page: its offsets summed up its
 * offset parents, which no transform moves. Read against its parent alone,
 * a line over a docked shell never moved: the dock it stands in, laid out
 * from its foot, moved with it.
 */
function laidAt(element: HTMLElement): Place {
  let x = 0;
  let y = 0;
  for (
    let at: HTMLElement | null = element;
    at;
    at = at.offsetParent instanceof HTMLElement ? at.offsetParent : null
  ) {
    x += at.offsetLeft;
    y += at.offsetTop;
  }
  return { x, y };
}

/** Each element's place in the layout as it stands now. */
function placesOf(elements: Iterable<HTMLElement>): Map<HTMLElement, Place> {
  const places = new Map<HTMLElement, Place>();
  for (const element of elements) {
    places.set(element, laidAt(element));
  }
  return places;
}

const translate = ({ x, y }: Place): string => `translate(${x}px, ${y}px)`;
/** The place `p` of the way from `from` to `to`. */
const along = (from: Place, to: Place, p: number): Place => ({
  x: from.x + (to.x - from.x) * p,
  y: from.y + (to.y - from.y) * p,
});

const still = ({ x, y }: Place): boolean =>
  Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5;

/**
 * The drawing of a field's height changes (above): `draw` reads where
 * everything stands, has the field write its new height, and starts the
 * run from there. `land` lets every run go, the field as laid out (a
 * change no one watches: the first fit, a resize).
 */
export function growCut(target: () => GrowTarget | null) {
  /** The cut on the box, and the slice it draws, made for the box it was made on. */
  let drawn: { box: HTMLElement; cut: EdgeCut; slice: HTMLElement } | null =
    null;
  /**
   * The run in flight: the height it is bound for, its clock, and the
   * shrink's hold (the inline `min-height` it set, and the one it replaced).
   */
  let run: {
    bound: number;
    clock: Animation;
    hold: { held: number; look: HTMLElement; was: string } | null;
  } | null = null;
  const moved = new Map<HTMLElement, Moved>();
  /** The box's height as the run lays it out (held, on a shrink), told to the cut rather than read back. */
  let boxHeight = 0;

  /** The cut on `aim`'s box, its slice an earlier sibling placed against the box's own offset parent. */
  const cutFor = (aim: GrowTarget): { cut: EdgeCut; slice: HTMLElement } => {
    if (drawn?.box !== aim.box) {
      unmake();
      const slice = document.createElement("span");
      slice.setAttribute("aria-hidden", "true");
      slice.className =
        "pointer-events-none invisible absolute box-border data-cut:visible";
      aim.box.before(slice);
      drawn = {
        box: aim.box,
        slice,
        cut: new EdgeCut(aim.box, {
          height: () => boxHeight,
          foot: () => slice,
          look: () => aim.look,
          side: aim.side,
          flush: aim.flush === true,
        }),
      };
    }
    return drawn;
  };

  /** Where a moved element is drawn now, off its layout place. */
  const offsetNow = (element: HTMLElement): Place => {
    const move = moved.get(element);
    if (!move) {
      return { x: 0, y: 0 };
    }
    return along(
      move.from,
      move.to,
      move.curve(Math.min(Math.max((now() - move.at) / move.ms, 0), 1))
    );
  };

  /** The shrink's hold let go: the box laid out at its own height. */
  const release = () => {
    if (run?.hold) {
      run.hold.look.style.minHeight = run.hold.was;
      run.hold = null;
    }
  };

  const letGo = () => {
    for (const move of moved.values()) {
      move.animation.cancel();
    }
    moved.clear();
    release();
    run?.clock.cancel();
    run = null;
    drawn?.cut.stop();
  };

  function unmake() {
    letGo();
    drawn?.slice.remove();
    drawn = null;
  }

  /** Read before the field's height is written, on the layout the fit has just read. */
  function before(): GrowBefore | null {
    const aim = motionOk.current ? target() : null;
    if (!aim?.box.isConnected) {
      return null;
    }
    const height = aim.box.offsetHeight;
    const places = new Map<HTMLElement, Placed>();
    for (const element of aroundOf(aim.box, drawn?.slice ?? null)) {
      const off = offsetNow(element);
      const laid = laidAt(element);
      places.set(element, {
        laid,
        x: laid.x + off.x,
        y: laid.y + off.y,
        // Over a transform of its own, a move adds to it.
        own:
          !moved.has(element) && getComputedStyle(element).transform !== "none",
      });
    }
    const cutNow = drawn?.box === aim.box ? drawn.cut.cutNow() : 0;
    // Made now, so its insertion is laid out with the height the field is
    // about to write.
    cutFor(aim);
    return { target: aim, height, places, shown: height - cutNow };
  }

  /**
   * Moves each element around the box from where it is drawn (`before`)
   * to where it lands (`settled`), laid out meanwhile where it `stand`s:
   * sampled a frame apart, as the cut's keyframes are (motion/edge-cut), so
   * the edge and what stands past it keep step.
   */
  function moveAround(
    places: GrowBefore["places"],
    {
      settled,
      stand,
    }: { settled: Map<HTMLElement, Place>; stand: Map<HTMLElement, Place> },
    { at, ms, easing }: { at: number; easing: string; ms: number }
  ): void {
    const curve = easingOf(easing);
    for (const [element, drawnAt] of places) {
      const standing = stand.get(element);
      const landing = settled.get(element);
      const prior = moved.get(element);
      prior?.animation.cancel();
      moved.delete(element);
      if (!(standing && landing)) {
        continue;
      }
      const from = { x: drawnAt.x - standing.x, y: drawnAt.y - standing.y };
      const end = { x: landing.x - standing.x, y: landing.y - standing.y };
      if (still(from) && still(end)) {
        continue;
      }
      const frames: Keyframe[] = [];
      for (let t = 0; t < ms; t += FRAME) {
        const p = curve(t / ms);
        frames.push({
          offset: t / ms,
          transform: translate(along(from, end, p)),
        });
      }
      frames.push({ offset: 1, transform: translate(end) });
      const own = drawnAt.own || (prior?.own ?? false);
      const animation = element.animate(frames, {
        duration: ms,
        easing: "linear",
        composite: own ? "add" : "replace",
      });
      animation.startTime = at;
      const move: Moved = { animation, at, curve, from, ms, own, to: end };
      moved.set(element, move);
      animation.finished.then(
        () => {
          if (moved.get(element) === move) {
            moved.delete(element);
          }
        },
        () => undefined
      );
    }
  }

  /**
   * Where each element stands in the layout while the box is held at its
   * drawn height: as laid out before the change when the box was drawn
   * whole then, read again only when a cut was under way.
   */
  function heldPlaces(start: GrowBefore): Map<HTMLElement, Place> {
    if (Math.abs(start.height - start.shown) <= 0.5) {
      return new Map(
        [...start.places].map(([element, { laid }]) => [element, laid])
      );
    }
    return placesOf(start.places.keys());
  }

  /** Read after the field's height is written: the run from where `before` found everything to where it now stands. */
  function after(start: GrowBefore): void {
    const { look } = start.target;
    const { cut, slice } = cutFor(start.target);
    const hadHold = run?.hold ?? null;
    // The hold in flight let go for the read, so the box is read at its own
    // height.
    release();
    const to = start.target.box.offsetHeight;
    if (run && Math.abs(to - run.bound) <= 0.5) {
      // Bound where it was: the run in flight carries on, its hold with it.
      if (hadHold) {
        run.hold = { ...hadHold, was: look.style.minHeight };
        look.style.minHeight = `${hadHold.held}px`;
      }
      return;
    }
    if (Math.abs(to - start.shown) <= 0.5 && !run) {
      return;
    }
    const settled = placesOf(start.places.keys());
    const lookHeight = look.offsetHeight;
    const ms = dur("--duration-control");
    const easing = ease("--ease-out");
    const hold = Math.max(0, start.shown - to);
    boxHeight = to + hold;
    // The cut reads the box on this layout, before the hold is written.
    const at = cut.change({
      from: Math.max(0, to - start.shown),
      to: hold,
      ms,
      easing,
    });
    run?.clock.cancel();
    // The run's clock: the slice's opacity, held at 1, which the compositor
    // runs.
    const clock = slice.animate([{ opacity: 1 }, { opacity: 1 }], ms);
    clock.startTime = at;
    const mine: NonNullable<typeof run> = { bound: to, clock, hold: null };
    run = mine;
    // Shorter than drawn: held at the drawn height for the run.
    if (hold > 0) {
      mine.hold = { look, was: look.style.minHeight, held: lookHeight + hold };
      look.style.minHeight = `${mine.hold.held}px`;
    }
    const stand = mine.hold ? heldPlaces(start) : settled;
    clock.finished.then(
      () => {
        if (run === mine) {
          release();
          run = null;
          cut.changed();
        }
      },
      () => undefined
    );
    moveAround(start.places, { settled, stand }, { at, ms, easing });
  }

  return {
    /** Writes the field's new height with `write`, the change drawn from where everything stands now. */
    draw(write: () => void): void {
      const start = before();
      write();
      if (start) {
        after(start);
      }
    },
    land: letGo,
    stop: unmake,
  };
}
