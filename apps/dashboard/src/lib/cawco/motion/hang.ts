/**
 * A floating card that hangs from its anchor as one shape with it, and grows
 * out of it (DESIGN.md, "A card that hangs from its anchor"). Every such
 * card is a HangCard (components/ui/hang-card), which measures the neck and
 * attaches this: the session card and a finger's tab menu from their tab
 * (PaneTabs), Caw's panel, the machines and the Jump palette from the top
 * bar's glass.
 *
 * The card is a kit popover with the `kit-hang` recipe (app.css) and stands
 * on its anchor's foot, at side offset 0. Its top edge is cut across the
 * anchor's span and the anchor's flared foot each side of it (the neck:
 * `--neck-start`, `--neck-end`, `--neck-flare-start`, `--neck-flare-end`, in
 * the card's own coordinates), so the anchor's flanks run down into the
 * card's sides; on a flush side (`data-flush`) the card's top corner is
 * square and the anchor's flank runs straight on into the card's side. The
 * anchor draws its own foot (the tab's sheet and `.neck`, Caw's glass's
 * `.join`); the card writes the neck from what `hang` reports.
 *
 * `hang` is the card's attachment. It keeps the neck where the card really
 * stands once bits-ui has placed it (every placement, open, a glide, a
 * resize, a scroll, is a write to its floating wrapper's transform), and it
 * plays the card's open and close:
 *
 * The card comes down out of the anchor's foot: its floating wrapper is cut
 * at the card's top edge, the anchor's foot, and the card slides down from
 * behind that cut by its own height, revealing what is in it as the foot
 * passes; nothing inside fades. A finger pulling a tab's menu out draws the
 * same thing (PaneTabs `drawPull`). Open over --dur-pop, close over
 * --dur-exit (The Fast Exit Rule), both on --ease-out: an entrance and an
 * exit, so the strong ease-out (Emil Kowalski, "Entering or exiting →
 * ease-out"; transitions.dev's dropdown, 250ms open and 150ms close on
 * cubic-bezier(0.22, 1, 0.36, 1), the same family).
 *
 * It runs on the compositor in every engine: a WAAPI animation of
 * `translate` alone, under a cut that never moves. The cut was the animated
 * part before (an inset() clip-path growing out of the anchor's span), which
 * Chromium composites but WebKit runs on the main thread every frame: "we
 * don't run them in the compositor" (bugs.webkit.org/show_bug.cgi?id=185816,
 * still open), while it composites the individual transform properties
 * (bugs.webkit.org/show_bug.cgi?id=217842). On a phone's Safari the open
 * stalled behind whatever else the press did. The card is held shut
 * (`data-shown` absent: up behind the cut) until bits-ui has placed it, and
 * starts coming down only then: started with the mount, the frame that
 * mounted it ate the first part of the motion.
 *
 * Interruptible (The Interruptible Rule): a close caught mid-open, or an open
 * caught mid-close, turns back from where it has reached. bits-ui holds the
 * card mounted until the close animation ends (it waits on the content's
 * getAnimations()). With reduced motion nothing here runs and the kit's fade
 * does.
 *
 * A card bits-ui keeps mounted while shut (`forceMount`: the glass's one
 * card, GlassCard) is placed the first time it opens and stays placed; every
 * open after that grows at once, and every close ends with it at rest up
 * behind the cut, past its own height by its shadow's reach under it, so
 * nothing it drew is left below the cut (`kit-hang` without `data-shown`).
 */
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { dur, ease, motionOk } from "./curves.svelte";

/** The x of a floating wrapper's `translate(Xpx, Ypx)`. */
const TRANSLATE_X = /translate(?:3d)?\(\s*(-?[\d.]+)px/;
/** The event a card fires once it stands open. */
export const GROWN = "grown";
/** The event a card fires once it is shut and at rest up behind the cut. */
export const FOLDED = "folded";

/**
 * The anchor's span in the card's own coordinates, px, and the flared foot
 * each side of it: none on the side the card is flush with.
 */
export interface Neck {
  end: number;
  flareEnd: number;
  flareStart: number;
  /** The side the card stands flush with its anchor on: square there. */
  flush: "start" | "end" | null;
  start: number;
}

/** Whether two necks draw the same: within half a pixel, same flares and flush. */
export const sameNeck = (a: Neck, b: Neck): boolean =>
  Math.abs(a.start - b.start) <= 0.5 &&
  Math.abs(a.end - b.end) <= 0.5 &&
  a.flareStart === b.flareStart &&
  a.flareEnd === b.flareEnd &&
  a.flush === b.flush;

/**
 * How far a flare's 1px stroke lies along the card's top edge row before it
 * rises off it, px: the stroke is a band between radii f and f + 1 about a
 * centre f above the foot's tip, tangent to that row, which its outer edge
 * leaves √(2f + 1) px out. None without a flare.
 */
const flareTail = (flare: number): number =>
  flare > 0 ? Math.sqrt(2 * flare + 1) : 0;

/**
 * The cut across the card's top edge row (`kit-hang::before`, a 1px row from
 * one foot's tip to the other's), as a `shape()` in its own box: on a flared
 * side it starts on the flare's stroke's outer edge, the circle of radius
 * f + 1 from the row's foot at the tip to the row's top √(2f + 1) px in, so
 * the edge shows under the cut exactly where the stroke crosses the row and
 * the anchor's curve runs on into the card's edge as one stroke; a side with
 * no flare starts square.
 */
function neckCut(neck: Neck): string {
  const tailStart = flareTail(neck.flareStart);
  const tailEnd = flareTail(neck.flareEnd);
  const start =
    neck.flareStart > 0
      ? `arc to ${tailStart}px 0 of ${neck.flareStart + 1}px ccw`
      : "line to 0 0";
  const end =
    neck.flareEnd > 0
      ? `arc to 100% 100% of ${neck.flareEnd + 1}px ccw`
      : "line to 100% 100%";
  return `shape(from 0 100%, ${start}, line to calc(100% - ${tailEnd}px) 0, ${end}, close)`;
}

/** The neck as the card's style (`kit-hang`): its span, its flares, and the cut's shape. */
const neckProperties = (neck: Neck): [string, string][] => [
  ["--neck-start", `${neck.start}px`],
  ["--neck-end", `${neck.end}px`],
  ["--neck-flare-start", `${neck.flareStart}px`],
  ["--neck-flare-end", `${neck.flareEnd}px`],
  ["--neck-cut", neckCut(neck)],
];

/**
 * The neck written straight onto the card's own style (HangCard writes every
 * card's through this): it costs a style change and no render of the
 * popover's props, which each placement of Caw's panel paid as it first
 * opened.
 */
export function setNeck(node: HTMLElement, neck: Neck): void {
  for (const [name, value] of neckProperties(neck)) {
    node.style.setProperty(name, value);
  }
}

export interface Hang {
  /**
   * Read once as the card closes: true when it is already shut and has
   * nothing left to play (a finger folded it into its anchor).
   */
  folded?: () => boolean;
  /**
   * A card hanging from a folder tab (motion/hang-shape): it grows out of
   * the tab's foot as one shape with it instead of sliding down from behind
   * a cut. Called with how far out it is drawn, 0 (the tab alone) to 1,
   * every frame it moves, and again at rest.
   */
  grow?: (p: number) => void;
  /**
   * Read once as the card is placed: true while a finger is drawing it out
   * of its anchor (a tab's pulled menu), which is its open; nothing plays.
   */
  held?: () => boolean;
  /** The neck with the card's left edge at `left` (viewport px); null with no anchor. */
  neckAt: (left: number) => Neck | null;
  /** The neck where the card stands now, on every placement: the card draws it. */
  onneck: (neck: Neck) => void;
  /** The card starts to stand open (true), or to fold back into its anchor (false). */
  onshown?: (shown: boolean) => void;
}

/** The card's attachment: on the popover's content, inside its floating wrapper. */
export function hang(options: Hang): Attachment<HTMLElement> {
  return (node) => {
    const wrapper = node.parentElement;
    if (!wrapper) {
      return;
    }
    const motion = options.grow
      ? growMotion(node, options, options.grow)
      : slideMotion(node, options);
    // Untracked: the attachment's own effect runs the first one, and the
    // anchor and neck it reads are not reasons to attach again.
    const sync = () =>
      untrack(() => {
        const at = TRANSLATE_X.exec(wrapper.style.transform);
        if (!at) {
          return;
        }
        const neck = options.neckAt(Number(at[1]));
        if (!neck) {
          return;
        }
        // Placed: the card can grow out of its anchor now, measured where it
        // stands and after the frame that mounted it.
        motion.placed();
        options.onneck(neck);
      });
    const observer = new MutationObserver(sync);
    observer.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
    sync();
    return () => {
      observer.disconnect();
      motion.stop();
    };
  };
}

/** The clock a tab's hang grows and folds on: one run on the card, whose time each frame's shape is read at. */
export const GROW = "hang-grow";

/** Each growing card's drawing: `to` draws it there and holds it (a finger's pull), `again` draws it where it stands (a placement, a resize). */
const growers = new WeakMap<
  HTMLElement,
  { again: () => void; to: (p: number) => void }
>();

/** Draws a tab's hang `p` of the way out of its tab and holds it there, its own motion stopped: a finger drawing it out (PaneTabs). */
export function growTo(node: HTMLElement, p: number): void {
  growers.get(node)?.to(Math.min(1, Math.max(0, p)));
}

/** Draws a tab's hang again where it stands: its tab or its box moved. */
export function regrow(node: HTMLElement): void {
  growers.get(node)?.again();
}

/**
 * A tab's hang's open and close (`Hang.grow`): one run on the card
 * (`hang-grow`), its progress read every frame and drawn as the silhouette
 * that far out, so a seeked or slowed clock draws the shape where it
 * stands. Open over --dur-pop and close over --dur-exit on --ease-out (an
 * entrance and an exit), each from where the last left it (interruptible),
 * over its share of the length. Shut, the card is drawn at 0: the tab alone.
 */
function growMotion(
  node: HTMLElement,
  options: Hang,
  draw: (p: number) => void
) {
  let run: Animation | null = null;
  let placed = false;
  let frame = 0;
  /** How far out it is drawn, and the run's ends. */
  let p = 0;
  let from = 0;
  let to = 0;
  const set = (v: number) => {
    p = v;
    draw(v);
  };
  const halt = () => {
    cancelAnimationFrame(frame);
    run?.cancel();
    run = null;
  };
  growers.set(node, {
    again: () => draw(p),
    to: (v) => {
      halt();
      set(v);
    },
  });
  const tick = () => {
    const clock = run;
    if (!clock) {
      return;
    }
    const timing = clock.effect?.getComputedTiming();
    const ended =
      Number(clock.currentTime ?? 0) >= Number(timing?.endTime ?? 0);
    set(from + (to - from) * (ended ? 1 : (timing?.progress ?? 0)));
    frame = requestAnimationFrame(tick);
  };
  const play = (target: number, ms: number) => {
    halt();
    from = p;
    to = target;
    const next = node.animate(
      [{ "--hang-grow": from }, { "--hang-grow": target }],
      {
        id: GROW,
        duration: Math.max(1, ms * Math.abs(target - from)),
        easing: ease("--ease-out"),
        fill: "forwards",
      }
    );
    run = next;
    frame = requestAnimationFrame(tick);
    return next;
  };
  /** Shut and at rest: the tab alone, the card's run let go. */
  const rest = () => {
    halt();
    set(0);
    delete node.dataset.shown;
    options.onshown?.(false);
    node.dispatchEvent(new Event(FOLDED));
  };
  const grow = () => {
    if (!placed) {
      return;
    }
    node.dataset.shown = "";
    options.onshown?.(true);
    // A finger drawing it out draws it itself (`growTo`).
    if (options.held?.()) {
      halt();
      node.dispatchEvent(new Event(GROWN));
      return;
    }
    if (!motionOk.current) {
      halt();
      set(1);
      node.dispatchEvent(new Event(GROWN));
      return;
    }
    const growth = play(1, dur("--dur-pop"));
    growth.finished
      .then(() => {
        if (run === growth) {
          halt();
          set(1);
          node.dispatchEvent(new Event(GROWN));
        }
      })
      .catch(() => undefined);
  };
  const fold = () => {
    if (
      options.folded?.() ||
      !motionOk.current ||
      !placed ||
      node.dataset.shown === undefined
    ) {
      rest();
      return;
    }
    const folding = play(0, dur("--dur-exit"));
    folding.finished
      .then(() => {
        if (run === folding) {
          rest();
        }
      })
      .catch(() => undefined);
  };
  let start = 0;
  const state = new MutationObserver(() => {
    if (node.dataset.state === "closed") {
      cancelAnimationFrame(start);
      fold();
    } else if (node.dataset.state === "open" && placed) {
      cancelAnimationFrame(start);
      start = requestAnimationFrame(grow);
    }
  });
  state.observe(node, { attributes: true, attributeFilter: ["data-state"] });
  // Drawn shut from the start; untracked, so what the drawing reads (the
  // card's anchor) is no reason to attach again: the anchor goes as the
  // card closes, and attaching again then dropped the fold.
  untrack(() => set(0));
  return {
    placed() {
      const first = !placed;
      placed = true;
      if (first) {
        start = requestAnimationFrame(() => {
          if (node.dataset.state === "open") {
            grow();
          }
        });
      } else {
        draw(p);
      }
    },
    stop() {
      cancelAnimationFrame(start);
      state.disconnect();
      halt();
      growers.delete(node);
    },
  };
}

function slideMotion(node: HTMLElement, options: Hang) {
  let run: Animation | null = null;
  let placed = false;
  const OPEN = "0px 0px";
  /**
   * Up behind the cut by the card's whole height and the reach of its shadow
   * under it (`--hang-reach`, the hung shadow's, motion/hung-shadow), so
   * nothing it draws is left under the cut: shut up by its height alone, the
   * shadow under its foot stayed on the page below the glass. A percentage
   * of its own box, so a size tween in flight (motion/morph) is followed to
   * the end.
   */
  const shut = () =>
    `0px calc(-100% - ${
      Number.parseFloat(
        getComputedStyle(node).getPropertyValue("--hang-reach")
      ) || 0
    }px)`;
  /** Where the card is drawn now, mid-animation or at rest. */
  const drawn = (fallback: string) =>
    run ? getComputedStyle(node).translate : fallback;
  const play = (from: string, to: string, ms: number) => {
    const next = node.animate([{ translate: from }, { translate: to }], {
      duration: ms,
      easing: ease("--ease-out"),
      fill: "forwards",
    });
    run?.cancel();
    run = next;
    return next;
  };
  /**
   * Shut and at rest: the card's own rules hold it up behind the cut
   * (`kit-hang` without `data-shown`), its run let go.
   */
  const rest = () => {
    run?.cancel();
    run = null;
    delete node.dataset.shown;
    node.dispatchEvent(new Event(FOLDED));
  };
  const grow = () => {
    if (!placed) {
      return;
    }
    node.dataset.shown = "";
    options.onshown?.(true);
    // What waits on the card standing open (SessionDetails asks for its
    // context reading then) hears `grown`.
    if (!motionOk.current || options.held?.()) {
      run?.cancel();
      run = null;
      node.dispatchEvent(new Event(GROWN));
      return;
    }
    const growth = play(drawn(shut()), OPEN, dur("--dur-pop"));
    growth.finished
      .then(() => {
        if (run === growth) {
          // At rest the card's own rules hold it open.
          growth.cancel();
          run = null;
          node.dispatchEvent(new Event(GROWN));
        }
      })
      .catch(() => undefined);
  };
  const fold = () => {
    options.onshown?.(false);
    // Nothing to fold: shut by a finger, with less motion, or never drawn out.
    if (
      options.folded?.() ||
      !motionOk.current ||
      !placed ||
      node.dataset.shown === undefined
    ) {
      rest();
      return;
    }
    const folding = play(drawn(OPEN), shut(), dur("--dur-exit"));
    folding.finished
      .then(() => {
        if (run === folding) {
          rest();
        }
      })
      .catch(() => undefined);
  };
  let frame = 0;
  // Every open once the card is placed: a card caught mid-close, and a card
  // kept mounted while shut (Caw's panel), which bits-ui placed once.
  const state = new MutationObserver(() => {
    if (node.dataset.state === "closed") {
      cancelAnimationFrame(frame);
      fold();
    } else if (node.dataset.state === "open" && placed) {
      // On a frame of its own, as a first placement's growth is: the frame
      // that draws the card open (its layers, its focus scope) is not also
      // the slide's first.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(grow);
    }
  });
  state.observe(node, { attributes: true, attributeFilter: ["data-state"] });
  return {
    placed() {
      const first = !placed;
      placed = true;
      if (first) {
        // After the frame that lays the placed card out, so the growth
        // starts on a frame of its own; and only open (a card kept mounted
        // while shut is placed as it first opens).
        frame = requestAnimationFrame(() => {
          if (node.dataset.state === "open") {
            grow();
          }
        });
      }
    },
    stop() {
      cancelAnimationFrame(frame);
      state.disconnect();
      run?.cancel();
    },
  };
}
