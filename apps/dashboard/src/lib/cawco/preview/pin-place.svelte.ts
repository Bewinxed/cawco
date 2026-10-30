/**
 * Where a comment's card stands beside its pill over the page, and how it
 * goes there (PinFloat, and the /dev/pin-goo bench's PinFloatGoo): its size
 * read as it changes, what it is about as last seen, the plan (the side,
 * what it stands beside, its tallest) chosen again only when what it was
 * chosen from changes size, and its travel to a new place. PinFloat's
 * header says why each is so.
 */
import { tick, untrack } from "svelte";
import { frameObserver } from "../frame-observer";
import { dur, ease, numberOf } from "../motion/curves.svelte";
import type { PopSide } from "../motion/pop.svelte";

export interface Box {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** The pill and what the comment is about (the pill and its element's box, one box). */
interface Seen {
  mark: Box;
  whole: Box;
}

/** Where it stands: the side, what it stands beside, and its tallest. */
export interface Plan {
  along: "subject" | "pill" | "room";
  max: number;
  side: PopSide;
}

/** The well's room, px. */
interface Room {
  h: number;
  w: number;
}

/** Its width: the reading card's, never past the well less `--space-2` each side. */
export const FLOAT_W =
  "min(var(--c-pin-card-reading-w), calc(100% - 2 * var(--space-2)))";

/** Two boxes as one. */
const union = (parts: Box[]): Box => {
  const left = Math.min(...parts.map((one) => one.x));
  const top = Math.min(...parts.map((one) => one.y));
  return {
    x: left,
    y: top,
    w: Math.max(...parts.map((one) => one.x + one.w)) - left,
    h: Math.max(...parts.map((one) => one.y + one.h)) - top,
  };
};

/** Its size: its box, and its height with nothing capping it. */
interface FloatSize {
  height: number;
  /**
   * Its own height plus what its body and its thread's room (PinCard
   * `data-pin-room`) hold past their boxes. Where it stands is chosen by
   * this, never by the cap that choice sets, so a cap never moves it.
   */
  natural: number;
  width: number;
}

/**
 * Reads the size of `float` (its body `inner`) now, then each change in the
 * next frame (frameObserver): what it holds grows inside a ResizeObserver
 * pass (the composer's field, a thread's entries), and a size written inside
 * that pass would place it again there, a box the pass could no longer
 * deliver. The room's contents are watched too: under a cap they grow
 * inside a box that keeps its size. Returns the stop.
 */
const watchSize = (
  float: HTMLElement,
  inner: HTMLElement,
  write: (size: FloatSize) => void
): (() => void) => {
  const rooms = [...float.querySelectorAll<HTMLElement>("[data-pin-room]")];
  const read = () => {
    const tall = float.offsetHeight;
    const past = rooms.reduce(
      (sum, one) => sum + one.scrollHeight - one.clientHeight,
      inner.scrollHeight - inner.clientHeight
    );
    write({
      width: float.offsetWidth,
      height: tall,
      natural: tall + Math.max(0, past),
    });
  };
  read();
  const watch = frameObserver(read);
  watch.observe(float);
  for (const one of rooms) {
    for (const part of one.children) {
      watch.observe(part);
    }
  }
  return () => watch.disconnect();
};

/**
 * The pill and what the comment is about as last seen on the page: the
 * card keeps to them while the pill is out of view, so it never leaves for
 * the well's corner as the pill scrolls away. One per card.
 */
const lastSeen = () => {
  let last: Seen | null = null;
  return (mark: Box | null, box: Box | null): Seen | null => {
    if (mark) {
      last = { mark, whole: box ? union([mark, box]) : mark };
    }
    return last;
  };
};

/**
 * What the comment is about as the well shows it (cut to the well), for
 * choosing where the card stands; the pill where none of it is shown.
 */
const shownOf = (whole: Box, pill: Box, room: Room): Box => {
  const left = Math.max(0, whole.x);
  const top = Math.max(0, whole.y);
  const right = Math.min(room.w, whole.x + whole.w);
  const bottom = Math.min(room.h, whole.y + whole.h);
  return right > left && bottom > top
    ? { x: left, y: top, w: right - left, h: bottom - top }
    : pill;
};

/** What a plan is chosen from. */
interface Placing {
  /** It stands at its pill alone, never beside what that is about (the /dev/pin-goo bench's joined card). */
  besidePill: boolean;
  /** Its distance from the pill's box, past the pill's focus ring. */
  clear: number;
  /** Its distance from the well's edges. */
  gap: number;
  room: Room;
  size: FloatSize;
}

/**
 * The plan: beside what the comment is about, at its end side, else its
 * start side; else below it, else above it, where that side holds it whole;
 * else beside its pill alone; else under or over the pill, whichever holds
 * more. At the well's top-right with nothing seen.
 */
const decide = (
  at: Seen | null,
  { besidePill, clear, gap, room, size }: Placing
): Plan => {
  const full = Math.max(0, room.h - 2 * gap);
  /** Its height as it will stand beside the pill: what it holds, up to the well's. */
  const tall = Math.min(size.natural || size.height, full);
  if (!at) {
    return { along: "room", side: "bottom", max: full };
  }
  const pill = at.mark;
  const subject = shownOf(at.whole, pill, room);
  const fits = (about: Box): PopSide | null => {
    if (about.x + about.w + clear + size.width <= room.w - gap) {
      return "right";
    }
    return about.x - clear - size.width >= gap ? "left" : null;
  };
  const under = room.h - (subject.y + subject.h + clear) - gap;
  const over = subject.y - clear - gap;
  const nextTo = besidePill ? null : fits(subject);
  if (nextTo) {
    return { along: "subject", side: nextTo, max: full };
  }
  if (!besidePill && under >= tall) {
    return { along: "subject", side: "bottom", max: under };
  }
  if (!besidePill && over >= tall) {
    return { along: "subject", side: "top", max: over };
  }
  const alone = fits(pill);
  if (alone) {
    return { along: "pill", side: alone, max: full };
  }
  const belowPill = room.h - (pill.y + pill.h + clear) - gap;
  const abovePill = pill.y - clear - gap;
  return belowPill >= tall || belowPill >= abovePill
    ? { along: "pill", side: "bottom", max: Math.max(0, belowPill) }
    : { along: "pill", side: "top", max: Math.max(0, abovePill) };
};

/**
 * The plan, chosen again (untracked) only when what it was chosen from
 * changes size (the well, the card, what it holds, the pill or its
 * element), never as the page under it scrolls. One per card.
 */
const heldPlan = () => {
  let planFor = "";
  let held: Plan | null = null;
  return (at: Seen | null, placing: Placing): Plan => {
    const key = [
      placing.besidePill,
      placing.room.w,
      placing.room.h,
      placing.size.width,
      Math.round(placing.size.natural),
      at ? `${at.mark.w}x${at.mark.h}` : "none",
      at ? `${Math.round(at.whole.w)}x${Math.round(at.whole.h)}` : "",
    ].join();
    if (key !== planFor || !held) {
      planFor = key;
      held = untrack(() => decide(at, placing));
    }
    return held;
  };
};

/** What a card is placed over: its pill, what that stands on, the well. */
interface Over {
  /** It stands at its pill alone ({@link Placing}); PinFloat never does. */
  besidePill?: boolean;
  /** The box of what the pill stands on, in the well, px. */
  box?: Box | null;
  /** Its distance from the pill's box, px, where it is not {@link FloatPlace.clear}'s (a goo card joined to its pin stands within the goo's reach). */
  clear?: number;
  /** The pill's box in the well, px; null while it is not on screen. */
  mark: Box | null;
  room: Room;
}

/** The card's elements, as the component binds them. */
interface Parts {
  /** What it holds: the part that scrolls. */
  body: () => HTMLElement | undefined;
  float: () => HTMLElement | undefined;
  /** Run once the flush that places it has landed, while it is still the card. */
  placed: (float: HTMLElement) => void;
}

/**
 * One card's placing: its size as it changes, what it is about as last
 * seen, and its plan, from what `over` reads now. Made as its component
 * starts: it watches the card's size from the moment the card is drawn.
 */
export class FloatPlace {
  width = $state(0);
  height = $state(0);
  /** Its height with nothing capping it ({@link FloatSize}). */
  natural = $state(0);
  /** Its distance from the well's edges: `--space-2`. */
  readonly gap = $derived(numberOf("--space-2") || 7);
  readonly #over: () => Over;
  /**
   * Its distance from the pill's box: `--space-2` from the pill as drawn,
   * past its focus ring (PinMark `data-focused`: a 2px outline 2px out), so
   * nothing of the pill ever stands on it; or what `over` names.
   */
  readonly clear = $derived.by(() => this.#over().clear ?? this.gap + 4);
  readonly #seenOf = lastSeen();
  readonly #hold = heldPlan();

  constructor(over: () => Over, { body, float, placed }: Parts) {
    this.#over = over;
    $effect(() => {
      const el = float();
      const inner = body();
      if (!(el && inner)) {
        return;
      }
      const stop = watchSize(el, inner, (size) => {
        this.width = size.width;
        this.height = size.height;
        this.natural = size.natural;
      });
      tick().then(() => {
        if (float() === el) {
          placed(el);
        }
      });
      return stop;
    });
  }

  /** The pill and what the comment is about as last seen on the page. */
  readonly seen = $derived.by(() => {
    const { mark, box = null } = this.#over();
    return this.#seenOf(mark, box);
  });

  readonly #placing: Placing = $derived.by(() => ({
    besidePill: this.#over().besidePill ?? false,
    clear: this.clear,
    gap: this.gap,
    room: this.#over().room,
    size: { width: this.width, height: this.height, natural: this.natural },
  }));

  /** Where it stands. */
  readonly plan: Plan = $derived(this.#hold(this.seen, this.#placing));

  /**
   * For `plan`: its height under the plan's cap, a left and a top held
   * whole inside the well at that height, and the well's top-right with
   * the plan's side and cap (where it stands with nothing seen).
   */
  frame(plan: Plan) {
    const { gap, width } = this;
    const { room } = this.#over();
    const tall = Math.min(this.natural || this.height, plan.max);
    const inX = (x: number) => Math.max(gap, Math.min(x, room.w - width - gap));
    return {
      tall,
      inX,
      inY: (y: number) => Math.max(gap, Math.min(y, room.h - gap - tall)),
      corner: {
        left: inX(room.w - width - gap),
        top: gap,
        side: plan.side,
        max: plan.max,
      },
    };
  }
}

/** A spot in the well, px. */
interface Spot {
  left: number;
  top: number;
}

/** How far a travel in flight has it from where it stands, px: its `translate` as drawn. */
export const drawnShift = (el: HTMLElement): [number, number] => {
  const shift = getComputedStyle(el).translate;
  const [dx = 0, dy = 0] =
    shift === "none"
      ? []
      : shift.split(" ").map((one) => Number.parseFloat(one));
  return [dx, dy];
};

/**
 * It travels from `before` to where it now stands, `now`, over
 * `--dur-morph` on `--ease-drawer`, starting from where it is drawn, a
 * travel in flight counted (The Interruptible Rule). Returns the travel,
 * the one to cancel when the next starts.
 */
export const travelTo = (
  el: HTMLElement,
  before: Spot,
  now: Spot,
  running: Animation | null
): Animation => {
  const [dx, dy] = drawnShift(el);
  running?.cancel();
  return el.animate(
    [
      {
        translate: `${before.left - now.left + dx}px ${before.top - now.top + dy}px`,
      },
      { translate: "0px 0px" },
    ],
    { duration: dur("--dur-morph"), easing: ease("--ease-drawer") }
  );
};

/** The thread comes in once its shape has room: held hidden two fifths of the `length`, then up out of a blur over the rest. */
export const threadIn = (inner: HTMLElement, length: number): void => {
  inner.animate(
    [
      { opacity: 0, filter: "blur(var(--part-blur))" },
      { opacity: 1, filter: "blur(0px)" },
    ],
    {
      delay: length * 0.4,
      duration: length * 0.6,
      easing: ease("--ease-out"),
      fill: "backwards",
    }
  );
};

/** The thread goes in the first half of the `length`, from the opacity it is `shown` at, before the shape is too small to hold it. */
export const threadOut = (
  inner: HTMLElement,
  shown: string,
  length: number
): void => {
  inner.animate([{ opacity: shown }, { opacity: 0 }], {
    duration: length / 2,
    easing: ease("--ease-out"),
    fill: "forwards",
  });
};
