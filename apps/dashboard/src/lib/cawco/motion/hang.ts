/**
 * A floating card that hangs from its anchor as one shape with it, and grows
 * out of it (DESIGN.md, "A card that hangs from its anchor"): the session
 * card from its tab (PaneTabs), Caw's panel from his glass (NeedsCaw).
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
 */
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { dur, ease, motionOk } from "./curves.svelte";

/** The x of a floating wrapper's `translate(Xpx, Ypx)`. */
const TRANSLATE_X = /translate(?:3d)?\(\s*(-?[\d.]+)px/;
/** The event a card fires once it stands open. */
export const GROWN = "grown";

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
 * rises off it, px: the stroke is a band between radii f and f + 1 tangent
 * to that row, which it leaves √(2f + 1) px out. None without a flare.
 */
const flareTail = (flare: number): number =>
  flare > 0 ? Math.sqrt(2 * flare + 1) : 0;

/**
 * The neck as the card's style (`kit-hang`): its span, its flares, and the
 * run each side over which the top edge fades out under the flare's stroke
 * (`--neck-tail-*`), so the two strokes meet with no break. Every hanging
 * card writes its neck through this.
 */
export const neckStyle = (neck: Neck): string =>
  [
    `--neck-start: ${neck.start}px`,
    `--neck-end: ${neck.end}px`,
    `--neck-flare-start: ${neck.flareStart}px`,
    `--neck-flare-end: ${neck.flareEnd}px`,
    `--neck-tail-start: ${flareTail(neck.flareStart)}px`,
    `--neck-tail-end: ${flareTail(neck.flareEnd)}px`,
  ].join("; ");

export interface Hang {
  /**
   * Read once as the card closes: true when it is already shut and has
   * nothing left to play (a finger folded it into its anchor).
   */
  folded?: () => boolean;
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
    const motion = slideMotion(node, options);
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

function slideMotion(node: HTMLElement, options: Hang) {
  let run: Animation | null = null;
  let placed = false;
  const OPEN = "0px 0px";
  /** Up behind the cut by the card's whole height, its own fractional size. */
  const shut = () => `0px ${-node.getBoundingClientRect().height}px`;
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
  const grow = () => {
    if (!placed) {
      return;
    }
    node.dataset.shown = "";
    options.onshown?.(true);
    // What waits on the card standing open (SessionDetails asks for its
    // context reading then) hears `grown`.
    if (!motionOk.current || options.held?.()) {
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
    if (options.folded?.() || !motionOk.current || !placed) {
      return;
    }
    play(drawn(OPEN), shut(), dur("--dur-exit"));
  };
  let frame = 0;
  const state = new MutationObserver(() => {
    if (node.dataset.state === "closed") {
      cancelAnimationFrame(frame);
      fold();
    } else if (node.dataset.state === "open" && "shown" in node.dataset) {
      grow();
    }
  });
  state.observe(node, { attributes: true, attributeFilter: ["data-state"] });
  return {
    placed() {
      const first = !placed;
      placed = true;
      if (first) {
        // After the frame that lays the placed card out, so the growth
        // starts on a frame of its own.
        frame = requestAnimationFrame(grow);
      }
    },
    stop() {
      cancelAnimationFrame(frame);
      state.disconnect();
      run?.cancel();
    },
  };
}
