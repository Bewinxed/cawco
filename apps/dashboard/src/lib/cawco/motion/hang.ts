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
 * A clip that grows down out of the anchor's foot and widens to the card as
 * it deepens, revealing what is in it as the foot passes; nothing inside
 * fades. Open over --dur-pop, close over --dur-exit (The Fast Exit Rule),
 * both on --ease-out: an entrance and an exit, so the strong ease-out (Emil
 * Kowalski, "Entering or exiting → ease-out"; transitions.dev's dropdown,
 * 250ms open and 150ms close on cubic-bezier(0.22, 1, 0.36, 1), the same
 * family).
 *
 * It runs on the compositor: a WAAPI animation of an inset() in px only.
 * Chromium composites a clip-path animation whose shapes are plain lengths
 * and paints one with calc() or a percentage on the main thread every frame
 * (a trace: compositeFailed, unsupportedProperties clip-path). So the shapes
 * are written in px from the card's measured box. The card is held shut
 * (`data-shown` absent) until bits-ui has placed it, and starts growing only
 * then: started with the mount, the frame that mounted it ate the first part
 * of the growth (33ms at full speed, 200ms on a slow CPU).
 *
 * Interruptible (The Interruptible Rule): a close caught mid-open, or an open
 * caught mid-close, turns back from the clip it has reached. bits-ui holds
 * the card mounted until the close animation ends (it waits on the content's
 * getAnimations()). With reduced motion nothing here runs and the kit's fade
 * does.
 */
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { dur, ease, motionOk } from "./curves.svelte";

/** The x of a floating wrapper's `translate(Xpx, Ypx)`. */
const TRANSLATE_X = /translate(?:3d)?\(\s*(-?[\d.]+)px/;
/** Room past the card's sides and foot for its whole overlay shadow, px. */
const CLIP_ROOM = 120;
/** What a shut clip keeps of the card's height, px: see `shut`. */
const CLIP_SLIVER = 1;
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

export interface Hang {
  /**
   * Read once as the card closes: true when it is already shut and has
   * nothing left to play (a finger folded it into its anchor).
   */
  folded?: () => boolean;
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
    const motion = clipMotion(node, options);
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
        motion.placed(neck);
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

function clipMotion(node: HTMLElement, options: Hang) {
  let run: Animation | null = null;
  let at: Neck | null = null;
  /** The card's foot corners, as it draws them (a flush side's may be square). */
  const round = () => {
    const style = getComputedStyle(node);
    return `round 0px 0px ${style.borderBottomRightRadius} ${style.borderBottomLeftRadius}`;
  };
  const open = () =>
    `inset(0px -${CLIP_ROOM}px -${CLIP_ROOM}px -${CLIP_ROOM}px ${round()})`;
  // Shut leaves a pixel of the card under the anchor's foot, the anchor's
  // own surface, so nothing shows: a keyframe with no height at all is a
  // shape Chromium will not composite, and the whole animation then paints
  // on the main thread every frame.
  const shut = (neck: Neck) => {
    // The box's own fractional size: offsetHeight rounds, and a sliver
    // rounded away is the degenerate shape again.
    const { width: w, height: h } = node.getBoundingClientRect();
    const right = Math.max(0, w - neck.end);
    const left = Math.max(0, neck.start);
    const bottom = Math.max(0, h - CLIP_SLIVER);
    return `inset(0px ${right}px ${bottom}px ${left}px ${round()})`;
  };
  /** Where the clip is drawn now, mid-animation or at rest. */
  const drawn = (fallback: string) =>
    run ? getComputedStyle(node).clipPath : fallback;
  const play = (from: string, to: string, ms: number) => {
    const next = node.animate([{ clipPath: from }, { clipPath: to }], {
      duration: ms,
      easing: ease("--ease-out"),
      fill: "forwards",
    });
    run?.cancel();
    run = next;
    return next;
  };
  const grow = () => {
    if (!at) {
      return;
    }
    node.dataset.shown = "";
    options.onshown?.(true);
    // What waits on the card standing open (SessionDetails asks for its
    // context reading then) hears `grown`.
    if (!motionOk.current) {
      node.dispatchEvent(new Event(GROWN));
      return;
    }
    const growth = play(drawn(shut(at)), open(), dur("--dur-pop"));
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
    if (options.folded?.() || !motionOk.current || !at) {
      return;
    }
    play(drawn(open()), shut(at), dur("--dur-exit"));
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
    placed(neck: Neck) {
      const first = !at;
      at = neck;
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
