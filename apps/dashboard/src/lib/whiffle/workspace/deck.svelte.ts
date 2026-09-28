/**
 * Two fingers move between groups on the phone.
 *
 * A phone draws one group, so a split made at the desk was unreachable from
 * it. This is the way through: two fingers dragged up bring the next group
 * in from below, dragged down bring the previous one from above, in tree
 * order and without wrapping. The cards ride the fingers 1:1 and settle on
 * a spring, so the deck reads as a physical stack rather than a transition.
 *
 * Two fingers, never one. One finger already belongs to the transcript's
 * scroll and to the tab swipe in `gesture.svelte.ts`, and both must go on
 * working exactly as they do. Only a touch count of exactly two is ever
 * looked at here; the one-finger machine keeps its own guard against a
 * second finger landing mid-drag.
 *
 * CSS owns rest, this file owns motion. The stylesheet parks every card by
 * its distance from the focus; nothing here is rendered by a template per
 * frame. While the fingers hold the stack the handlers write a translate
 * straight onto the three cards in view, and at release the settle — a
 * spring with no randomness in it — is integrated once and handed to the
 * compositor as keyframes, so it plays at the display's rate whatever the
 * main thread is doing. When it lands the inline transforms are cleared and
 * the stylesheet's parking places take over again.
 */
import { flushSync } from "svelte";
import {
  integrate,
  spring as play,
  type Sample,
  sampleAt,
} from "../motion/spring";
import { type LeafNode, workspace } from "./workspace.svelte";

/** Travel before the pair is taken to mean anything. */
const SLOP = 8;
/** Beyond this much horizontal travel it is something else, whatever the vertical is. */
const SLOPE = 0.7;
/** Breathing room between stacked cards, in px. */
export const GAP = 12;
/** How far the projected release must reach, as a fraction of the height. */
const COMMIT = 0.35;
/** A flick: short but fast still counts, in px/s. Sonner's 0.11 px/ms. */
const FLICK = 110;
/** How far ahead a release looks, in seconds of the release velocity. */
const LOOKAHEAD = 0.1;
/** How much of a drag past the end is shown, and the most it can show. */
const RESIST = 0.35;
const RESIST_MAX = 0.25;
/**
 * The last stretch of the spring, as a fraction of the height. Inside it and
 * slowing, the card sets down while it is still moving, so the scale-up and
 * the corners squaring off read as part of the landing, not a second event
 * that fires after it has stopped.
 */
const LAND = 0.06;
/** Velocity samples older than this say nothing about the release. */
const VELOCITY_WINDOW = 80;

type Phase = "idle" | "armed" | "claimed";
/** A card in view: its element and its distance from the focus. */
interface Card {
  delta: number;
  el: HTMLElement;
}

export function createDeck(
  getLeaves: () => LeafNode[],
  getFocusedId: () => string
) {
  let lifted = $state(false);
  let dragging = $state(false);

  // Not reactive: nothing here is rendered. The fingers write the transforms
  // themselves, straight onto the three cards in view, and writing state per
  // touchmove would schedule a render for values no template reads. The
  // height is measured once, on the claim frame.
  let root: HTMLElement | null = null;
  let offset = 0;
  let height = 0;
  let phase: Phase = "idle";
  let startX = 0;
  let startY = 0;
  /** Where the focused card was when the fingers took hold — mid-settle, not 0. */
  let base = 0;
  let samples: Array<{ y: number; t: number }> = [];
  /** The cards in view, gathered at claim and again after a focus flip. */
  let cards: Card[] = [];
  /** The settle in flight: its path, the animations playing it, the set-down timer. */
  let path: Sample[] = [];
  let animations: Animation[] = [];
  let landing: ReturnType<typeof setTimeout> | null = null;
  /** The settle's velocity where a pair stopped it, until that pair moves or leaves. */
  let held: number | null = null;

  const reduced = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const midpoint = (touches: TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

  /** The cards the stylesheet parks a card away or in place, by their current deltas. */
  const gather = (): Card[] => {
    if (!root) {
      return [];
    }
    const found: Card[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("[data-leaf]")) {
      const delta = Number(el.dataset.delta);
      if (Math.abs(delta) <= 1) {
        found.push({ el, delta });
      }
    }
    return found;
  };

  /** A card's parking place, in px: the stylesheet's calc, evaluated. */
  const rest = (delta: number) => delta * (height + GAP);

  const paint = (x: number) => {
    for (const { el, delta } of cards) {
      el.style.transform = `translate3d(0, ${rest(delta) + x}px, 0)`;
    }
  };

  const clear = () => {
    for (const { el } of cards) {
      el.style.transform = "";
    }
  };

  const stopSettle = () => {
    for (const animation of animations) {
      animation.cancel();
    }
    animations = [];
    if (landing !== null) {
      clearTimeout(landing);
    }
    landing = null;
  };

  /** The cards are at rest: hand them back to the stylesheet. */
  const land = () => {
    stopSettle();
    clear();
    offset = 0;
    lifted = false;
  };

  /** Where the settle is right now, read off the focused card's clock. */
  const progress = (): Sample | null => {
    const animation = animations[cards.findIndex((card) => card.delta === 0)];
    const at = animation?.currentTime;
    if (typeof at !== "number" || path.length === 0) {
      return null;
    }
    return sampleAt(path, at / 1000);
  };

  /** The neighbours of the focused group: above, itself, below. */
  const neighbours = () => {
    const leaves = getLeaves();
    const index = leaves.findIndex((leaf) => leaf.id === getFocusedId());
    return {
      above: index > 0 ? leaves[index - 1] : null,
      below: index >= 0 && index < leaves.length - 1 ? leaves[index + 1] : null,
    };
  };

  const resist = (d: number) =>
    Math.sign(d) * Math.min(Math.abs(d) * RESIST, height * RESIST_MAX);

  /** Release velocity in px/s, from the samples of the last few dozen ms. */
  const releaseVelocity = () => {
    if (samples.length < 2) {
      return 0;
    }
    // biome-ignore lint/style/useAtIndex: samples has >= 2 elements here (checked above); .at(-1) would widen to undefined
    const last = samples[samples.length - 1];
    let [first] = samples;
    for (const sample of samples) {
      if (last.t - sample.t <= VELOCITY_WINDOW) {
        first = sample;
        break;
      }
    }
    const dt = last.t - first.t;
    return dt > 0 ? ((last.y - first.y) / dt) * 1000 : 0;
  };

  /**
   * The settle, played by the compositor. The path is integrated here and
   * once, then each card in view gets it as keyframes offset by its parking
   * place, linear between points so the curve is the spring's own. The
   * set-down is timed off the same path: the first point inside the last
   * stretch and slowing.
   */
  function spring(velocity: number) {
    stopSettle();
    path = integrate(offset, velocity);
    animations = play(
      path,
      cards.map(({ el, delta }) => ({
        el,
        frame: (x) => ({
          transform: `translate3d(0, ${rest(delta) + x}px, 0)`,
        }),
      }))
    );
    const focused = animations[cards.findIndex((card) => card.delta === 0)];
    if (!focused) {
      land();
      return;
    }
    // The last keyframe is the parking place itself, so handing back to the
    // stylesheet in one task — cancel, then clear — paints no frame that
    // differs from the one the compositor is already holding.
    const mine = animations;
    focused.finished.then(
      () => {
        if (animations === mine) {
          land();
        }
      },
      () => {
        /* cancelled mid-settle — a newer spring() or stopSettle() already took over */
      }
    );

    const touchdown =
      path.find(
        (sample, i) =>
          i > 0 &&
          Math.abs(sample.x) < height * LAND &&
          Math.abs(sample.v) < Math.abs(path[i - 1].v)
        // biome-ignore lint/style/useAtIndex: integrate() always returns at least one point; .at(-1) would widen this fallback to undefined
      ) ?? path[path.length - 1];
    landing = setTimeout(() => {
      lifted = false;
      landing = null;
    }, touchdown.t * 1000);
  }

  /** Fingers landing on a settling stack stop it where it is. */
  function hold() {
    if (animations.length === 0) {
      return;
    }
    const at = progress();
    stopSettle();
    if (!at) {
      land();
      return;
    }
    offset = at.x;
    held = at.v;
    paint(offset);
  }

  /** The pair that stopped the settle left without moving it: let it go on. */
  function resume() {
    if (held === null) {
      return;
    }
    const velocity = held;
    held = null;
    spring(velocity);
  }

  function release() {
    const velocity = releaseVelocity();
    const { above, below } = neighbours();
    const projected = offset + velocity * LOOKAHEAD;
    const far = Math.abs(projected) > height * COMMIT;
    const up = projected < 0;
    const target = up ? below : above;
    const flicked = up ? velocity < -FLICK : velocity > FLICK;

    dragging = false;
    if (target && (far || flicked)) {
      // Focus first, then compensate in the same synchronous step: every
      // card's parking place is derived from the focused index, so the flip
      // moves the outgoing card's base by a whole card and the correction
      // leaves the picture exactly where the finger left it. The flush puts
      // the new deltas on the cards before they are gathered again; the old
      // set is cleared first so the card that left the view drops its
      // inline transform with it.
      workspace.focus(target.id);
      flushSync();
      clear();
      cards = gather();
      offset += up ? height + GAP : -(height + GAP);
      paint(offset);
    }

    if (reduced()) {
      land();
      return;
    }
    spring(velocity);
  }

  return {
    get lifted() {
      return lifted;
    },
    get dragging() {
      return dragging;
    },

    /**
     * Attaches the listeners. Both `touchstart` and `touchmove` are
     * non-passive: the move so the deck can claim the pair once it owns it,
     * and the start so the second finger's landing is refused to Safari
     * before its own two-finger recognisers — pinch, and the page scroll —
     * get a look at it. A single finger is never prevented; it belongs to
     * the transcript's scroll and the tab swipe.
     */
    action(node: HTMLElement) {
      root = node;

      const onStart = (event: TouchEvent) => {
        if (event.touches.length !== 2) {
          // A third finger ends the drag rather than joining it: the pair
          // that was being tracked is gone, and the midpoint would jump.
          if (phase === "claimed") {
            release();
          } else if (phase === "armed") {
            resume();
          }
          phase = "idle";
          return;
        }
        event.preventDefault();
        if (phase === "claimed") {
          return;
        }
        const mid = midpoint(event.touches);
        startX = mid.x;
        startY = mid.y;
        samples = [{ y: mid.y, t: performance.now() }];
        phase = "armed";
        hold();
      };

      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the two-finger swipe/settle touchmove handler — one state machine, not split in this pass
      const onMove = (event: TouchEvent) => {
        if (phase === "idle") {
          return;
        }
        if (event.touches.length !== 2) {
          if (phase === "armed") {
            resume();
            phase = "idle";
          }
          return;
        }
        const mid = midpoint(event.touches);
        const dx = mid.x - startX;
        const dy = mid.y - startY;

        samples.push({ y: mid.y, t: performance.now() });
        if (samples.length > 5) {
          samples.shift();
        }

        if (phase === "armed") {
          if (Math.abs(dy) <= SLOP || Math.abs(dy) <= Math.abs(dx) * SLOPE) {
            return;
          }
          // Taking hold mid-settle picks the card up where the pair stopped
          // it; the settle is dropped, not rewound.
          held = null;
          base = offset;
          height = node.clientHeight;
          cards = gather();
          lifted = true;
          dragging = true;
          phase = "claimed";
        }

        event.preventDefault();
        event.stopPropagation();

        const { above, below } = neighbours();
        const open = base + dy < 0 ? below : above;
        offset = open ? base + dy : base + resist(dy);
        paint(offset);
      };

      const onEnd = () => {
        if (phase === "claimed") {
          release();
        } else if (phase === "armed") {
          resume();
        }
        phase = "idle";
      };

      node.addEventListener("touchstart", onStart, { passive: false });
      node.addEventListener("touchmove", onMove, { passive: false });
      node.addEventListener("touchend", onEnd, { passive: true });
      node.addEventListener("touchcancel", onEnd, { passive: true });

      return {
        destroy() {
          stopSettle();
          root = null;
          node.removeEventListener("touchstart", onStart);
          node.removeEventListener("touchmove", onMove);
          node.removeEventListener("touchend", onEnd);
          node.removeEventListener("touchcancel", onEnd);
        },
      };
    },
  };
}
