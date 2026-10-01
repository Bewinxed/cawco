/**
 * Swiping between conversations.
 *
 * The gesture is continuous: the finger drags the current pane off and the
 * neighbouring one on, both moving in lockstep, so the next conversation
 * reads as having been there all along rather than as something that
 * arrives. That only works because the panes are all mounted and the
 * workspace answers synchronously — a gesture cannot wait for a router.
 *
 * Who owns a touch is decided once the finger has travelled past the slop,
 * by the way it went, because only then is there a way to go by:
 *
 * - Mostly vertical is a scroll. A transcript scrolls vertically, and a
 *   thumb travelling down the screen must never take the page with it.
 * - Mostly horizontal is the page's, whatever the finger started on. A
 *   transcript is mostly tool rows and links, and a swipe that refused to
 *   start on them refused most of the screen. Once the page has it, the
 *   control under the finger does not also get its click.
 * - Except where something under the finger scrolls sideways and still has
 *   room to go the way the finger is going: a wide code block keeps its own
 *   travel until it reaches its edge, and from there the page takes over.
 *   A block that fits, or one already at that edge, is just part of the page.
 *
 * Fields keep every touch: a finger dragging across a text box is moving
 * the caret. (The composer is never under the gesture anyway: a swiping
 * group draws its composer outside the panes it moves.)
 *
 * CSS owns rest, this file owns motion — the same division as the deck's.
 * The stylesheet parks the active pane and its two neighbours by their
 * distance in the strip; while the finger holds them the handler writes a
 * translate straight onto the three, and at release the settle is
 * integrated once and handed to the compositor as keyframes. When it lands
 * the inline transforms are cleared and the parking places take over.
 */
import { flushSync } from "svelte";
import {
  integrate,
  spring as play,
  type Sample,
  sampleAt,
} from "../motion/spring";
import { workspace } from "./workspace.svelte";

/** Travel before a drag is anything at all. */
const SLOP = 10;
/** Beyond this much vertical travel it is a scroll, whatever the horizontal is. */
const SLOPE = 0.7;
/** How far across the pane counts as "meant it", as a fraction of the width. */
const COMMIT = 0.3;
/** A flick: short but fast still counts, in px/ms. */
const FLICK = 0.3;
/** How much of a drag past the last tab is shown, and the most it can show. The deck's. */
const RESIST = 0.35;
const RESIST_MAX = 0.25;

type Phase = "idle" | "tracking" | "decided";
/** A pane in view: its element and its distance from the active tab. */
interface Pane {
  delta: number;
  el: HTMLElement;
}

/** What keeps a touch whichever way it goes: fields and sliders. */
const KEEPS =
  'input, textarea, select, [contenteditable="true"], [role="slider"]';

/**
 * What between the finger and the pane scrolls sideways, asked when the
 * finger lands. `scrollWidth > clientWidth` is true of anything merely
 * clipping its overflow — including the transcript column — so the computed
 * style is what separates "this scrolls" from "this is cut off".
 */
function scrollersUnder(target: Element, fence: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  let node = target instanceof HTMLElement ? target : target.parentElement;
  while (node && node !== fence) {
    const { overflowX } = getComputedStyle(node);
    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      node.scrollWidth - node.clientWidth > 4
    ) {
      found.push(node);
    }
    node = node.parentElement;
  }
  return found;
}

/** Whether a sideways scroller has room left the way the finger is going. */
const roomToward = (el: HTMLElement, dx: number) =>
  dx > 0
    ? el.scrollLeft > 0.5
    : el.scrollLeft < el.scrollWidth - el.clientWidth - 0.5;

/**
 * `leafOf` is a getter rather than a value: a group's identity is a prop,
 * and capturing it once would bind the gesture to whichever group this
 * component happened to render first.
 */
export function createSwipe(
  leafOf: () => string | undefined = () => undefined
) {
  let phase = $state<Phase>("idle");
  /** The neighbour the finger is uncovering, and whether it is past the commit point. */
  let targetId = $state<string | null>(null);
  let past = $state(false);
  /**
   * Where the strip's indicator should be: part-way from the active tab
   * toward another, by a fraction of the width. Under the finger it is the
   * drag; after release it is the settle, read off its clock each frame, so
   * the indicator lands with the pane. The one thing here written per move,
   * because a template reads it.
   */
  let toward = $state<string | null>(null);
  let fraction = $state(0);
  /**
   * Whether the conversations are moving: from the moment a finger claims
   * the drag until the settle lands, or snaps back. The group's composer
   * holds Send on it, so a message never goes to a chat on its way off
   * screen.
   */
  let moving = $state(false);
  /**
   * The conversation a committed release brings into reach on the far side
   * of the new tab. It stays unpainted until the settle is running on the
   * compositor: revealing a transcript styles and lays out the whole of it,
   * and in the release task that work held the pane still under the lifted
   * finger (WebKit: 28ms of a 35ms release). It sits a width or more off
   * screen for the whole settle, so a frame or two later nobody sees it
   * arrive, and the work lands while the compositor moves the panes. A tab
   * chosen by a tap veils the same way, and also the tab it jumped past.
   */
  let veiled = $state<string[]>([]);
  /**
   * The conversation a tap is leaving when it jumps further than the next
   * tab: painted beside the one arriving for the length of the settle, as if
   * the two were neighbours, and hidden again when it lands.
   */
  let leaving = $state<string | null>(null);

  // Not reactive: the finger writes the transforms itself, straight onto the
  // panes in view, and writing state per touchmove would schedule a render
  // for values no template reads. Only a change of target or of side of the
  // commit point reaches the header.
  let root: HTMLElement | null = null;
  let offset = 0;
  /** The stack's width, kept by an observer so neither a claim nor a tap lays the page out to learn it. */
  let width = 0;
  let startX = 0;
  let startY = 0;
  /** Where the active pane was when the finger took hold — mid-settle, not 0. */
  let base = 0;
  let samples: Array<{ x: number; t: number }> = [];
  /** The panes in view, gathered at claim and again after a tab flip. */
  let panes: Pane[] = [];
  /** The settle in flight: its path and the animations playing it. */
  let path: Sample[] = [];
  let animations: Animation[] = [];
  /** The settle's velocity where a finger stopped it, until that finger moves or leaves. */
  let held: number | null = null;
  /** The frame reading the settle for the indicator. */
  let followFrame: number | null = null;
  /** What sideways scrollers the finger landed in, asked again at the claim for room. */
  let scrollers: HTMLElement[] = [];
  /**
   * The tab a committed release is switching to. The switch reaches the
   * group like any other (`prepare`, `arrive`), and this is how the release
   * says the settle for it is already its own.
   */
  let flip: string | null = null;

  const reduced = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const tabsOf = () =>
    workspace.leaves.find((node) => node.id === leafOf())?.tabs ?? [];

  /** The tabs either side of the active one, in strip order and without wrapping. */
  const neighbours = () => {
    const id = leafOf();
    const leaf = id ? workspace.leaves.find((node) => node.id === id) : null;
    const tabs = leaf?.tabs ?? [];
    const at = leaf?.active ? tabs.indexOf(leaf.active) : -1;
    return {
      here: leaf?.active ?? null,
      prev: at > 0 ? tabs[at - 1] : null,
      next: at >= 0 && at < tabs.length - 1 ? tabs[at + 1] : null,
    };
  };

  const gather = (): Pane[] => {
    if (!root) {
      return [];
    }
    const found: Pane[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("[data-pane]")) {
      const delta = Number(el.dataset.delta);
      if (Math.abs(delta) <= 1) {
        found.push({ el, delta });
      }
    }
    return found;
  };

  /** A pane's parking place, in px: the stylesheet's `±100%`, evaluated. */
  const rest = (delta: number) => delta * width;

  const paint = (x: number) => {
    for (const { el, delta } of panes) {
      el.style.transform = `translate3d(${rest(delta) + x}px, 0, 0)`;
    }
  };

  const clear = () => {
    for (const { el } of panes) {
      el.style.transform = "";
    }
  };

  const resist = (d: number) =>
    Math.sign(d) * Math.min(Math.abs(d) * RESIST, width * RESIST_MAX);

  const stopFollow = () => {
    if (followFrame !== null) {
      cancelAnimationFrame(followFrame);
      followFrame = null;
    }
  };

  const stopSettle = () => {
    stopFollow();
    for (const animation of animations) {
      animation.cancel();
    }
    animations = [];
  };

  /** The panes are at rest: hand them back to the stylesheet. */
  const land = () => {
    stopSettle();
    clear();
    moving = false;
    offset = 0;
    toward = null;
    fraction = 0;
    leaving = null;
    flip = null;
  };

  /** Two frames on — one to hand the settle to the compositor, one to paint — show what was veiled. */
  const unveil = () => {
    const mine = veiled;
    if (mine.length === 0) {
      return;
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (veiled === mine) {
          veiled = [];
        }
      })
    );
  };

  const travelled = () =>
    width > 0 ? Math.min(1, Math.abs(offset) / width) : 0;

  /** Where the settle is right now, read off the active pane's clock. */
  const progress = (): Sample | null => {
    const animation = animations[panes.findIndex((pane) => pane.delta === 0)];
    const at = animation?.currentTime;
    if (typeof at !== "number" || path.length === 0) {
      return null;
    }
    return sampleAt(path, at / 1000);
  };

  /** The settle, played by the compositor: the path as keyframes, one set per pane, offset by its parking place. */
  function spring(velocity: number) {
    stopSettle();
    path = integrate(offset, velocity);
    animations = play(
      path,
      panes.map(({ el, delta }) => ({
        el,
        frame: (x) => ({
          transform: `translate3d(${rest(delta) + x}px, 0, 0)`,
        }),
      }))
    );
    const active = animations[panes.findIndex((pane) => pane.delta === 0)];
    if (!active) {
      land();
      return;
    }
    // The indicator rides the settle: the same path, sampled where the
    // compositor is. Whoever stops the settle decides what the travel is
    // next, so the loop simply ends when the animations are gone.
    const follow = () => {
      followFrame = null;
      if (animations.length === 0) {
        return;
      }
      const at = progress();
      if (at) {
        fraction = width > 0 ? Math.min(1, Math.abs(at.x) / width) : 0;
      }
      followFrame = requestAnimationFrame(follow);
    };
    followFrame = requestAnimationFrame(follow);
    // The last keyframe is the parking place itself, so handing back to the
    // stylesheet in one task — cancel, then clear — paints no frame that
    // differs from the one the compositor is already holding.
    const mine = animations;
    active.finished.then(
      () => {
        if (animations === mine) {
          land();
        }
      },
      () => {
        /* cancelled mid-settle — a newer spring() or stopSettle() already took over */
      }
    );
  }

  /** A finger landing on a settling pane stops it where it is. */
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

  /** The finger that stopped the settle left without moving it: let it go on. */
  function resume() {
    if (held === null) {
      return;
    }
    const velocity = held;
    held = null;
    spring(velocity);
  }

  /** Release velocity in px/ms, from the last few samples. */
  const releaseVelocity = () => {
    if (samples.length < 2) {
      return 0;
    }
    const [first] = samples;
    // biome-ignore lint/style/useAtIndex: samples has >= 2 elements here (checked above); .at(-1) would widen to undefined
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    return dt > 0 ? (last.x - first.x) / dt : 0;
  };

  function release(allowed: boolean) {
    const velocity = releaseVelocity();
    const { here, prev, next } = neighbours();
    const left = offset < 0;
    let target: string | null;
    if (offset === 0) {
      target = null;
    } else {
      target = left ? next : prev;
    }
    const far = width > 0 && Math.abs(offset) / width > COMMIT;
    const flicked = left ? velocity < -FLICK : velocity > FLICK;

    phase = "idle";
    targetId = null;
    past = false;
    if (allowed && target && (far || flicked)) {
      // Flip first, then compensate in the same synchronous step: every
      // pane's parking place is derived from the active tab, so the flip
      // moves the outgoing pane's base by a whole width and the correction
      // leaves the picture exactly where the finger left it. The flush puts
      // the new deltas on the panes before they are gathered again; the old
      // set is cleared first so the pane that left the view drops its inline
      // transform with it. The tab beyond the target is veiled before the
      // flush, so the flush never paints it.
      const tabs = tabsOf();
      const beyond = tabs.indexOf(target) + (left ? 1 : -1);
      veiled = tabs.slice(Math.max(beyond, 0), beyond + 1);
      // The indicator is on the new tab now, drawn the rest of the way back
      // toward the old one, and settles home from there with the pane. Set
      // before the flush, so the strip never draws the new tab both chosen
      // and still travelled toward.
      toward = here;
      fraction = 1 - travelled();
      flip = target;
      workspace.activate(target, leafOf());
      flushSync();
      clear();
      panes = gather();
      offset += left ? width : -width;
      paint(offset);
    } else {
      toward = target;
    }
    fraction = travelled();

    if (reduced()) {
      land();
    } else {
      spring(velocity * 1000);
    }
    unveil();
  }

  /**
   * A tab chosen without the finger — a tap on the strip, a key, a jump —
   * lands the way a committed swipe does: the panes start where they were,
   * a width apart, and settle on the same spring, from rest. Called before
   * the switch renders, to decide what it paints: the tab beyond the new
   * one, and the tab a far jump passes over, stay veiled until the settle
   * runs, and a far jump keeps the pane it is leaving painted beside the
   * new one.
   */
  function prepare(from: string, to: string) {
    if (flip === to || reduced()) {
      return;
    }
    const tabs = tabsOf();
    const was = tabs.indexOf(from);
    const at = tabs.indexOf(to);
    const dir = Math.sign(at - was);
    const far = Math.abs(at - was) > 1;
    leaving = far ? from : null;
    veiled = [tabs[at + dir], far ? tabs[at - dir] : undefined].filter(
      (id): id is string => id !== undefined
    );
  }

  /** After the switch rendered: play the settle `prepare` readied. */
  function arrive(from: string, to: string) {
    if (flip === to) {
      flip = null;
      return;
    }
    if (reduced() || !root) {
      return;
    }
    const tabs = tabsOf();
    const was = tabs.indexOf(from);
    const at = tabs.indexOf(to);
    const dir = Math.sign(at - was);
    // A settle in flight hands over where it has the picture: the pane
    // leaving is where it was drawn, and the one arriving a width beyond it.
    const now = animations.length > 0 ? progress() : null;
    stopSettle();
    clear();
    const out = root.querySelector<HTMLElement>(
      `:scope > [data-pane="${CSS.escape(from)}"]`
    );
    panes = gather().filter((pane) => pane.delta !== -dir);
    if (out) {
      panes.push({ el: out, delta: -dir });
    }
    offset = (now?.x ?? 0) + dir * width;
    // The strip's sheet rides the settle to a neighbour, as after a swipe; a
    // jump further along keeps the strip's own slide across the tabs between.
    toward = Math.abs(at - was) === 1 ? from : null;
    fraction = travelled();
    moving = true;
    paint(offset);
    spring(now?.v ?? 0);
    unveil();
  }

  return {
    get phase() {
      return phase;
    },
    get targetId() {
      return targetId;
    },
    get moving() {
      return moving;
    },
    /** How long the settle in flight has left to run, in ms; 0 at rest. */
    get settleMs(): number {
      const at =
        animations[panes.findIndex((pane) => pane.delta === 0)]?.currentTime;
      if (typeof at !== "number" || path.length === 0) {
        return 0;
      }
      return Math.max(0, (path.at(-1)?.t ?? 0) * 1000 - at);
    },
    /** Panes in reach that are not painted yet (see `veiled` above). */
    get veiled() {
      return veiled;
    },
    /** A pane out of reach painted for a tap's settle (see `leaving` above). */
    get leaving() {
      return leaving;
    },
    prepare,
    arrive,
    /**
     * The conversation the header should be NAMING right now — the target
     * once the drag has passed the point it would commit at, the current one
     * before that. Crossing back drags the name back with it. The threshold
     * is deliberately the same one release uses, so the header is never
     * showing something the settle is about to contradict.
     */
    get previewId(): string | null {
      if (phase === "idle" || !targetId) {
        return null;
      }
      return past ? targetId : null;
    },
    /** The strip indicator's travel: toward which tab and how far, or null at rest. */
    get travel(): { toward: string; fraction: number } | null {
      return toward === null ? null : { toward, fraction };
    },

    /**
     * Attaches the listeners. `touchmove` must be non-passive so the gesture
     * can claim the touch once it owns it.
     *
     * `enabled` is a parameter rather than a condition on the `use:` because
     * a directive cannot be applied conditionally — and detaching listeners
     * mid-gesture would strand the state machine part-way through a drag.
     */
    action(node: HTMLElement, enabled = true) {
      let live = enabled;
      root = node;
      const sizes = new ResizeObserver(() => {
        width = node.clientWidth;
      });
      sizes.observe(node);

      /** Stand down: whatever was under the finger goes back to its place. */
      const standDown = () => {
        if (phase === "decided") {
          release(false);
        } else if (phase === "tracking") {
          resume();
        }
        phase = "idle";
      };

      const onStart = (event: TouchEvent) => {
        if (!live) {
          return;
        }
        // A second finger means the deck's gesture, not this one: stand down
        // and put the pane back before the pair is claimed.
        if (event.touches.length > 1) {
          standDown();
          return;
        }
        if (phase !== "idle" || event.touches.length !== 1) {
          return;
        }
        const { target } = event;
        if (
          !(target instanceof Element && node.contains(target)) ||
          target.closest(KEEPS)
        ) {
          return;
        }
        scrollers = scrollersUnder(target, node);
        const [touch] = event.touches;
        startX = touch.clientX;
        startY = touch.clientY;
        samples = [{ x: touch.clientX, t: performance.now() }];
        phase = "tracking";
        hold();
      };

      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the one-finger tab-swipe touchmove handler — one state machine, not split in this pass
      const onMove = (event: TouchEvent) => {
        if (phase !== "tracking" && phase !== "decided") {
          return;
        }
        if (event.touches.length !== 1) {
          standDown();
          return;
        }
        const [touch] = event.touches;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        samples.push({ x: touch.clientX, t: performance.now() });
        if (samples.length > 5) {
          samples.shift();
        }

        const { prev, next } = neighbours();
        if (phase === "tracking") {
          if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) {
            return;
          }
          // A scroll, or a sideways scroller's own travel: stand down for
          // the rest of this touch.
          if (
            Math.abs(dy) > Math.abs(dx) * SLOPE ||
            scrollers.some((el) => roomToward(el, dx))
          ) {
            resume();
            phase = "idle";
            return;
          }
          if (!(prev || next)) {
            phase = "idle";
            return;
          }
          // Taking hold mid-settle picks the pane up where the finger
          // stopped it; the settle is dropped, not rewound. A far tap's
          // leaving pane is out of reach of a drag, so it goes now.
          held = null;
          base = offset;
          if (leaving) {
            clear();
            leaving = null;
          }
          panes = gather();
          phase = "decided";
          moving = true;
        }

        // Claimed: the page owns this gesture now, so the browser must not
        // also scroll with it.
        event.preventDefault();
        const open = base + dx < 0 ? next : prev;
        offset = open
          ? Math.max(-width, Math.min(width, base + dx))
          : base + resist(dx);
        paint(offset);
        if (offset < 0) {
          targetId = next;
        } else {
          targetId = offset > 0 ? prev : null;
        }
        past = width > 0 && Math.abs(offset) / width > COMMIT;
        toward = targetId;
        fraction = travelled();
      };

      const onEnd = (event: TouchEvent) => {
        if (phase === "decided") {
          // The page had this touch: the row or link it started on does not
          // also get the click a lifted finger would send it.
          event.preventDefault();
          release(true);
        } else if (phase === "tracking") {
          resume();
        }
        phase = "idle";
      };

      // `touchend` is not passive either: cancelling it is what keeps the
      // click from a claimed touch.
      node.addEventListener("touchstart", onStart, { passive: true });
      node.addEventListener("touchmove", onMove, { passive: false });
      node.addEventListener("touchend", onEnd, { passive: false });
      node.addEventListener("touchcancel", standDown, { passive: true });

      return {
        update(next: boolean) {
          live = next;
          if (!next && phase !== "idle") {
            phase = "idle";
            targetId = null;
            past = false;
            held = null;
            land();
          }
        },
        destroy() {
          stopSettle();
          sizes.disconnect();
          root = null;
          node.removeEventListener("touchstart", onStart);
          node.removeEventListener("touchmove", onMove);
          node.removeEventListener("touchend", onEnd);
          node.removeEventListener("touchcancel", standDown);
        },
      };
    },
  };
}
