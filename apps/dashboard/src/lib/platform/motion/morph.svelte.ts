/**
 * A container whose content changes size tweens to the new size instead of
 * jumping: when the content inside it changes (a popover's list arrives, an
 * error line appears, a card switches what it shows), the container is held
 * at the size it is drawn at and animated to its new natural size on the
 * Web Animations API, over --duration-morph on --ease-drawer. Attach to the container:
 * `{@attach morph()}`.
 *
 * The tween starts before the frame is laid out, never from a
 * ResizeObserver callback. A change to the content is heard by a
 * MutationObserver (nodes in or out, text, a class or `hidden`/`open`/
 * `data-state` turning anywhere inside), whose callback is a microtask
 * after the script that made it, so the new natural size is read and the
 * tween's first frame set before layout (a state kept on an attribute of
 * its own is heard when its caller names it, `on`): the container is laid out at the
 * size it was drawn at, and nothing around it ever sees the new size first.
 * Started from a ResizeObserver callback instead, after layout had already
 * reported the new size to every observer, the tween's first frame resized
 * the container back inside that delivery. Whatever watches an ancestor (the
 * floating wrapper bits-ui hands floating-ui's `autoUpdate`, a morph around
 * this one) was then resized at a depth the delivery had already passed,
 * and the browser reported a ResizeObserver loop.
 *
 * What a child placed out of the flow by its own style does (contents
 * fading out as others come in, lifted out where they stood) is no change
 * to the natural size: its going, and anything inside it, starts no tween
 * and retargets none in flight. Nor is what is put in or taken out in place
 * of what stood there at its size (`data-in-place`, on what is put in or
 * on the element changed; torph's `torph-in-place` on a MorphText whose
 * plain text came back at the size its morph's box was held at): measured
 * there, the page was laid out again for nothing. A MorphText's swap is
 * measured where it starts, the box taking the larger of its two sides, and
 * where its text comes back at another size.
 *
 * The one ResizeObserver here watches the container itself and only reads:
 * the size it was laid out at, the size a tween starts from. A size change
 * nothing in the content made (the column narrows and text rewraps, an
 * image or a font arrives, a child's own transition) is laid out as it
 * comes: the container follows it frame by frame, with no tween of its own.
 *
 * For the tween's length the children hold their natural size (no flex
 * shrink, their block size, and with `width` their inline size), so the
 * container clips them instead of squashing a scrolling list inside it, and
 * a child sized by the container (`height: 100%`, a Command list's root, a
 * card's contents stretched across it) does not follow the tween. Laid out
 * at the box's width frame by frame, a card's incoming rows rewrapped at
 * every width it passed through, each row and its ✕ changing height until
 * the box landed (owner: "the rows jump to half height then back"). Which
 * side a child held wider than the box overflows on is the site's own
 * (GlassCard's faces stand on its trailing edge).
 *
 * Every container changed in one turn of the event loop is measured
 * together: the sizes drawn now, then (tweens in flight cancelled, their
 * children let go) the natural sizes, then the tweens written. That is two
 * layouts for any number of them.
 *
 * A row an `unfold` opens or folds inside it (motion/fold `unfolding`) is
 * read at the end of its fold, open or gone, never at the frame the fold is
 * on, and the tween runs on that fold's clock: the edge and the row land
 * together, and the box is never held at a size the fold then leaves. With
 * `followUnfolds` the box starts no tween for a row's run and is laid out
 * at the row's size frame by frame, as it follows a `fold`: the row's run
 * is the one motion. A floating surface takes it (the glide popover): a
 * Svelte intro builds its keyframes a frame after the row mounts (its
 * dummy run's end), and where frames came late (WebKit) the tween begun on
 * the mount had landed before the row began to open, the edge at the row's
 * full size over a row still closed. Only the row's run is followed: the
 * box read with each such row where it set out from must stand at the
 * size it is drawn at. A change of its own beside the row (the surface
 * gliding to a sibling's content while that content's row opens) tweens
 * to where both land, on the box's own clock. Followed, it had jumped to
 * the sibling's size on the first frame.
 *
 * A `fold` (motion/fold) inside it is a height change no mutation
 * announces: while one runs the container starts no tween of its own and
 * follows the fold frame by frame, and a fold that starts cancels the tween
 * in flight, so the two never fight over the box's height.
 *
 * `clip`: the box's layout takes each change at once and its clip draws it
 * (motion/edge-cut): its foot is cut from where it was drawn to where it
 * now stands on --duration-morph's --ease-drawer, the slice of its foot
 * (`clip.foot`) drawn under the cut, and a change that leaves it shorter
 * holds it at the height it was drawn at for that run. A fold shut inside
 * it slides (motion/fold) and the cut follows the slide. No child is held
 * and nothing is laid out frame by frame: a hung card. A morph inside such
 * a box stands down, so the box's is the one resize. A row an `unfold`
 * moves inside it is laid out frame by frame, the box following it.
 *
 * `rows`: what changes inside is a `reflow`'s rows (a run's steps opening
 * a result under one, motion/branch), so the container's edge moves with
 * them: at their batch's pace (motion/rows `atTravel`), from the frame it
 * starts on, held at its drawn size until then. What sits under the container moves with its edge, and
 * the rows inside are never cut by it.
 */
import { CURVE, dur, ease, motionOk } from "./curves.svelte";
import { cutterOf, cutters, EdgeCut } from "./edge-cut";
import { folding, foldStarts, leaving, unfolding } from "./fold.svelte";
import { keyed } from "./keyed.svelte";
import { heldToTravel } from "./rows.svelte";
import { sizingChanges } from "./sizing";

interface Size {
  h: number;
  w: number;
}

/** A container's natural size and its children's sizes in it. */
interface Natural {
  children: { child: HTMLElement; blockSize: number; inlineSize: number }[];
  /** The clock of the folds it was read past (`atFolds`), if any. */
  clock: { easing: string; ms: number } | null;
  /**
   * With `followUnfolds`, while an `unfold` moves a row inside: its size
   * with every such row where it set out from, the size the row's run
   * alone leaves it at.
   */
  set?: Size;
  size: Size;
}

/**
 * Runs `read` with every row an `unfold` is moving inside `node` held at
 * one end of its fold: where it is bound (`end`: open, or gone), or where
 * it set out from (closed, or open). Important inline declarations win
 * over the fold's keyframes, so the read sees that box instead of the
 * frame the fold happens to be on; they are taken back before anything is
 * drawn. Returns the clock of the longest fold found, so the box's edge
 * and the rows inside it move together.
 */
function atFolds<T>(
  node: HTMLElement,
  end: boolean,
  read: () => T
): { clock: Natural["clock"]; value: T } {
  const held: { el: HTMLElement; props: [string, string, string][] }[] = [];
  let clock: Natural["clock"] = null;
  for (const [el, fold] of unfolding) {
    if (el === node || !node.contains(el)) {
      continue;
    }
    const ends: [string, string][] =
      leaving(el) === end
        ? [["display", "none"]]
        : [
            ["height", `${fold.height}px`],
            ["margin-block-end", `${fold.margin}px`],
            ...fold.edges.map(([edge, px]): [string, string] => [
              edge,
              `${px}px`,
            ]),
          ];
    const props = ends.map(([prop, at]): [string, string, string] => {
      const was: [string, string, string] = [
        prop,
        el.style.getPropertyValue(prop),
        el.style.getPropertyPriority(prop),
      ];
      el.style.setProperty(prop, at, "important");
      return was;
    });
    held.push({ el, props });
    if (!clock || fold.ms > clock.ms) {
      clock = { ms: fold.ms, easing: fold.easing };
    }
  }
  const value = read();
  for (const { el, props } of held) {
    for (const [prop, was, priority] of props) {
      el.style.setProperty(prop, was, priority);
    }
  }
  return { clock, value };
}

/** One attached container, as the shared measure sees it. */
interface Box {
  /** The size it is drawn at, or null before it was first laid out. */
  drawn: () => Size | null;
  /** Its natural size now, read with nothing holding it. */
  natural: () => Natural;
  /**
   * Lets go of the tween in flight and the children it held. `carry`: the
   * tween is only taken off the box, its clock running on, for the tween
   * that follows to put back where the box is still bound where it was.
   */
  stop: (carry?: boolean) => void;
  /** Tweens from `from` to its natural size, its children held at theirs. */
  tween: (from: Size, to: Natural) => void;
}

/** Containers whose content changed since the last measure. */
const changed = new Set<Box>();

/**
 * Reads every changed container's drawn size, then its natural size, then
 * writes the tweens: no write between two reads, so the two reads lay the
 * page out once each.
 */
function measure() {
  const boxes = [...changed];
  changed.clear();
  const from = boxes.map((box) => box.drawn());
  for (const box of boxes) {
    box.stop(true);
  }
  const to = boxes.map((box) => box.natural());
  boxes.forEach((box, at) => {
    const start = from[at];
    if (start) {
      box.tween(start, to[at]);
    } else {
      box.stop();
    }
  });
}

export interface Morph {
  /**
   * Its clip draws each change, its layout taking it at once (motion/
   * edge-cut); `foot` is the slice of its foot drawn under the cut. Height
   * only: not with `width`, `rows` or `placed`.
   */
  clip?: { foot?: () => HTMLElement | null };
  /** An `unfold` inside is followed frame by frame, never tweened beside. */
  followUnfolds?: boolean;
  ms?: number;
  /**
   * The attributes inside it that carry a state its size follows (on it, or
   * anywhere within): heard as a class turning is. Each is named, never
   * every attribute: one that turns on every pointer move (a highlighted
   * row) would measure the page on each.
   */
  on?: readonly string[];
  /**
   * Placed by its parent: a floating wrapper that floating-ui measures and
   * places (bits-ui's, round a popover's content). The parent is held at the
   * box's end size for the tween's length, so the box is placed once, where
   * it lands, and the placement's own glide runs to that place. Measured as
   * the box passed through each size, a surface aligned by its end edge, or
   * shifted off the screen's edge, was placed again on every frame: its
   * glide was restarted each time, chasing a place that kept moving, and
   * went on moving after its size had landed.
   */
  placed?: boolean;
  rows?: boolean;
  /**
   * Read as a tween would start: true while the change should land at once
   * (a card shut out of sight), with no tween. A key's change lands at once
   * without it (motion/keyed).
   */
  still?: () => boolean;
  width?: boolean;
}

export function morph({
  width = false,
  ms,
  on = [],
  rows = false,
  followUnfolds = false,
  placed = false,
  still,
  clip,
}: Morph = {}) {
  return (node: HTMLElement) => {
    /**
     * The size it was last laid out at, from the ResizeObserver: unknown
     * until its first delivery, which comes after the frame's layout. Read
     * when it was attached, it laid the page out in the middle of whatever
     * task mounted it — every diff a scrolling transcript mounted paid a
     * forced layout.
     */
    let laid: Size | null = null;
    let running: Animation | undefined;
    /** Where the tween in flight brings the box. */
    let bound: Size | undefined;
    /** The tween taken off the box (`stop(true)`), and where it was bringing it. */
    let lifted: { animation: Animation; to: Size } | undefined;
    /** Gives the children of the tween in flight back their own sizes. */
    let release: (() => void) | undefined;

    /**
     * Its laid-out size, to the subpixel. Following rows: they stand at
     * fractional places, and a box rounded to whole pixels cut the last of
     * them by the difference while it slid. Otherwise its border box as
     * laid out, a transform on it (a popover's entrance scale) left out: a
     * tween that ended on a whole pixel let the box settle to its fraction
     * a frame after it landed (a popover's 150px tween, then 149.56px).
     */
    const sizeNow = (): Size => {
      if (rows) {
        const box = node.getBoundingClientRect();
        return { w: box.width, h: box.height };
      }
      const style = getComputedStyle(node);
      const w = Number.parseFloat(style.width);
      const h = Number.parseFloat(style.height);
      // An inline box has no used width to read; the house sizes borders in.
      return Number.isNaN(w) ||
        Number.isNaN(h) ||
        style.boxSizing !== "border-box"
        ? { w: node.offsetWidth, h: node.offsetHeight }
        : { w, h };
    };

    /**
     * The tween itself: its own curve, or the rows' (`rows`), at their
     * batch's pace over the `distance` its edge moves.
     */
    const play = (
      frames: Keyframe[],
      distance: number,
      clock: Natural["clock"]
    ): Animation => {
      if (rows) {
        return heldToTravel(
          node.animate(frames, {
            duration: dur("--duration-panel"),
            easing: ease("--ease-in-out"),
          }),
          distance
        );
      }
      // A fold inside sets the pace: the edge lands with the row it opens.
      return node.animate(
        frames,
        clock
          ? { duration: clock.ms, easing: clock.easing }
          : { duration: ms ?? dur("--duration-morph"), easing: CURVE.drawer }
      );
    };

    /**
     * A `fold` (motion/fold) is moving something inside: the box follows it
     * frame by frame, and starts no tween of its own to fight it.
     */
    const foldsInside = () => {
      for (const el of folding) {
        if (el !== node && node.contains(el)) {
          return true;
        }
      }
      return false;
    };
    /** An `unfold` is moving a row inside (motion/fold `unfolding`). */
    const unfoldsInside = () => {
      for (const el of unfolding.keys()) {
        if (el !== node && node.contains(el)) {
          return true;
        }
      }
      return false;
    };
    /** A fold starting inside cancels the tween in flight. */
    const foldStarted = (el: HTMLElement) => {
      // A clip's slides run beside its change of content.
      if (!clip && el !== node && node.contains(el)) {
        box.stop();
      }
    };

    /**
     * The tween taken off the box (`stop(true)`), put back on it where the
     * box is still bound where that tween was bringing it; else cancelled.
     * A change that leaves the box's size where it was heading (a long list
     * mounting its rows a slice a frame under its fold) carries the tween
     * on, its clock never stopped. Started again from where the box was
     * drawn, each frame's tween was stopped before it had drawn a frame, and
     * the location popover's glide stood still until the rows stopped
     * coming; started again on the stopped one's time, it lost the frame its
     * start was still being resolved on.
     */
    const takeLifted = (to: Size): Animation | undefined => {
      const taken = lifted;
      lifted = undefined;
      const effect = taken?.animation.effect;
      if (
        taken &&
        effect instanceof KeyframeEffect &&
        Math.abs(taken.to.h - to.h) <= 0.5 &&
        !(width && Math.abs(taken.to.w - to.w) > 0.5)
      ) {
        effect.target = node;
        return taken.animation;
      }
      taken?.animation.cancel();
      return undefined;
    };

    /**
     * A new tween, let go with the holds made for it once it ends. One
     * cancelled by the next has been let go by `stop`; one put back
     * (`takeLifted`) lets go of the holds made with it.
     */
    const begin = (animation: Animation): Animation => {
      const done = () => {
        if (running === animation) {
          running = undefined;
          bound = undefined;
          release?.();
          release = undefined;
        }
      };
      animation.finished.then(done, done);
      return animation;
    };

    /** How far its edge moves: down, or across too (`width`). */
    const moves = (from: Size, to: Size) =>
      Math.max(Math.abs(to.h - from.h), width ? Math.abs(to.w - from.w) : 0);

    /** The change lands at once, with no tween: nothing to move, or no tween wanted now. */
    const lands = (from: Size, to: Size, set: Size | undefined): boolean => {
      const moved =
        Math.abs(to.h - from.h) > 0.5 ||
        (width && Math.abs(to.w - from.w) > 0.5);
      return (
        !(moved && motionOk.current) ||
        cutterOf(node) !== undefined ||
        keyed.current ||
        Boolean(still?.()) ||
        from.h === 0 ||
        to.h === 0 ||
        foldsInside() ||
        Boolean(set && moves(from, set) <= 0.5)
      );
    };

    /**
     * `clip`: the cut that draws each change (motion/edge-cut), the clock of
     * the run a change set off (holding the box at its drawn height when
     * the change left it shorter), and the natural height that run is
     * bound for.
     */
    const cut = clip
      ? new EdgeCut(node, {
          height: () => sizeNow().h,
          foot: clip.foot,
          // Laid out shut in this frame, before its observer hears of it:
          // the next change starts from here.
          settled: () => {
            laid = sizeNow();
          },
        })
      : null;
    let clipClock: Animation | undefined;
    let clipBound: number | undefined;
    /** The height the run in flight holds the box at, if it holds it. */
    let clipHeld: number | undefined;
    /** The natural size with the clip's hold let go for the read. */
    const unheld = (): Size => {
      const effect = clipClock?.effect;
      if (!(effect instanceof KeyframeEffect)) {
        return sizeNow();
      }
      effect.target = null;
      const size = sizeNow();
      effect.target = node;
      return size;
    };
    /** The change's run ends: the hold, if any, and the cut it drew both go. */
    const endClip = () => {
      clipClock?.cancel();
      clipClock = undefined;
      clipBound = undefined;
      clipHeld = undefined;
    };
    /**
     * A change of content, drawn by the clip: the box is laid out at its new
     * height at once, or held at the height it was drawn at (`hold`) when
     * that is the taller, and its foot is cut from where it was drawn to
     * where it now stands, the slides under way kept as they run.
     */
    const clipTo = (from: Size, to: Size) => {
      if (!cut) {
        return;
      }
      const moved = Math.abs(to.h - from.h) > 0.5;
      if (clipBound !== undefined && Math.abs(to.h - clipBound) <= 0.5) {
        // Bound where it was: the run in flight carries on.
        return;
      }
      const drawnCut = cut.cutNow();
      const slides = cut.cutNow(true);
      if (
        !(moved && motionOk.current) ||
        keyed.current ||
        still?.() ||
        from.h === 0 ||
        to.h === 0 ||
        unfoldsInside() ||
        foldsInside()
      ) {
        endClip();
        cut.change(null);
        return;
      }
      // What is drawn now, and the box's height past its slides once laid out.
      const shown = from.h - drawnCut;
      const hold = Math.max(0, shown + slides - to.h);
      const at = cut.change({
        from: Math.max(0, to.h - shown - slides),
        to: hold,
        ms: ms ?? dur("--duration-morph"),
        easing: CURVE.drawer,
      });
      endClip();
      const height = `${to.h + hold}px`;
      const clock = node.animate(
        hold > 0 ? [{ minHeight: height }, { minHeight: height }] : [],
        { duration: ms ?? dur("--duration-morph") }
      );
      clock.startTime = at;
      clipClock = clock;
      clipBound = to.h;
      clipHeld = hold > 0 ? to.h + hold : undefined;
      clock.finished.then(
        () => {
          if (clipClock === clock) {
            clipClock = undefined;
            clipBound = undefined;
            clipHeld = undefined;
            cut.changed();
          }
        },
        () => undefined
      );
    };

    const box: Box = {
      // In flight, where the tween has it right now; else where layout last
      // put it, since the content has already changed under it.
      // Cut by its clip: laid out where its run holds it, or as it was.
      drawn: () => {
        if (cut) {
          return clipHeld !== undefined && laid
            ? { w: laid.w, h: clipHeld }
            : laid;
        }
        return running ? sizeNow() : laid;
      },
      natural: () => {
        if (cut) {
          return { size: unheld(), children: [], clock: null };
        }
        const set =
          followUnfolds && unfoldsInside()
            ? atFolds(node, false, sizeNow).value
            : undefined;
        const { clock, value } = atFolds(node, true, () => ({
          size: sizeNow(),
          // In the flow only: one placed out of it (a surface laid under the
          // contents, contents leaving as others come in) is not squashed by
          // the box, and held at a size it was not given it no longer
          // follows the box.
          children: [...node.children]
            .filter(
              (child): child is HTMLElement =>
                child instanceof HTMLElement &&
                getComputedStyle(child).position !== "absolute"
            )
            .map((child) => {
              const rect = child.getBoundingClientRect();
              return { child, blockSize: rect.height, inlineSize: rect.width };
            }),
        }));
        return { ...value, clock, set };
      },
      stop: (carry = false) => {
        if (cut) {
          // Carried, the run in flight stands until the change is drawn.
          if (!carry) {
            endClip();
            cut.change(null);
          }
          return;
        }
        lifted?.animation.cancel();
        lifted = undefined;
        const effect = running?.effect;
        if (carry && running && bound && effect instanceof KeyframeEffect) {
          // Off the box for the natural size to be read, its clock untouched.
          effect.target = null;
          lifted = { animation: running, to: bound };
        } else {
          running?.cancel();
        }
        running = undefined;
        bound = undefined;
        release?.();
        release = undefined;
      },
      tween: (from, { size: to, children, clock, set }) => {
        if (cut) {
          clipTo(from, to);
          return;
        }
        const carried = takeLifted(to);
        if (lands(from, to, set)) {
          carried?.cancel();
          return;
        }
        // Held at exactly these sizes, past any cap of its own: a cap that
        // changed with the content (a tall surface's room giving way to the
        // form's cap) cut the tween's first frame to the new cap.
        const frames: Keyframe[] = [
          {
            height: `${from.h}px`,
            minHeight: "0px",
            maxHeight: "none",
            overflow: "hidden",
          },
          {
            height: `${to.h}px`,
            minHeight: "0px",
            maxHeight: "none",
            overflow: "hidden",
          },
        ];
        if (width) {
          Object.assign(frames[0], {
            width: `${from.w}px`,
            minWidth: "0px",
            maxWidth: "none",
          });
          Object.assign(frames[1], {
            width: `${to.w}px`,
            minWidth: "0px",
            maxWidth: "none",
          });
        }
        // Each child is held by an animation of its own, never by writing
        // its inline style: whatever its owner writes there meanwhile (a
        // `style:block-size` that follows a measure) stands once the hold
        // is let go. Written and restored inline, the hold put back the
        // value it read at the start, and a box resized during the tween
        // kept its old size (New project's field, 96px over a 50px folded
        // composer).
        const held = children.map(({ child, blockSize, inlineSize }) =>
          child.animate(
            [
              {
                flexShrink: "0",
                blockSize: `${blockSize}px`,
                ...(width ? { inlineSize: `${inlineSize}px` } : {}),
              },
            ],
            { duration: 0, fill: "forwards" }
          )
        );
        // The parent floating-ui places held at the end size (`placed`):
        // its `min-width: max-content` let go, so the box inside it is
        // free to pass through every size.
        const parent = placed ? node.parentElement : null;
        if (parent) {
          held.push(
            parent.animate(
              [
                {
                  minWidth: "0px",
                  width: `${to.w}px`,
                  height: `${to.h}px`,
                },
              ],
              { duration: 0, fill: "forwards" }
            )
          );
        }
        // Following unfolds, a tween is the box's own change (a sibling's
        // content glided to) and runs on its own clock, the rows' runs
        // inside it.
        running =
          carried ?? begin(play(frames, moves(from, to), set ? null : clock));
        bound = to;
        release = () => {
          for (const hold of held) {
            hold.cancel();
          }
        };
      },
    };

    // Reads only: what it was laid out at, for the next tween to start from.
    // biome-ignore lint/style/noRestrictedGlobals: reads only: the size it was laid out at, for the next tween to start from
    const laidOut = new ResizeObserver(([entry]) => {
      const [border] = entry.borderBoxSize;
      laid = { w: border.inlineSize, h: border.blockSize };
    });
    laidOut.observe(node, { box: "border-box" });

    /**
     * In, or is, a child its own style placed out of the flow (contents
     * leaving as others come in, GlassCard): nothing there sizes the box.
     */
    const outOfFlow = (start: Node | null): boolean => {
      for (let at = start; at && at !== node; at = at.parentNode) {
        if (at instanceof HTMLElement && at.style.position === "absolute") {
          return true;
        }
      }
      return false;
    };
    const inPlace = (one: Node) =>
      one instanceof HTMLElement &&
      (one.dataset.inPlace !== undefined || one.hasAttribute("torph-in-place"));
    const blank = (one: Node) =>
      one.nodeType === Node.COMMENT_NODE ||
      (one.nodeType === Node.TEXT_NODE && !one.textContent?.trim()) ||
      inPlace(one);
    /** A change that can move the box's natural size. */
    const sizes = (record: MutationRecord) =>
      !(outOfFlow(record.target) || inPlace(record.target)) &&
      (record.type !== "childList" ||
        ![...record.addedNodes, ...record.removedNodes].every(
          (one) => blank(one) || outOfFlow(one)
        ));
    const content = new MutationObserver((records) => {
      // Inside a box its clip resizes, that box's change is the one.
      if (cutterOf(node) || !records.some(sizes)) {
        return;
      }
      if (changed.size === 0) {
        queueMicrotask(measure);
      }
      changed.add(box);
    });
    content.observe(node, sizingChanges(on));
    foldStarts.add(foldStarted);
    if (cut) {
      cutters.set(node, cut);
    }

    return () => {
      foldStarts.delete(foldStarted);
      box.stop();
      if (cut) {
        cutters.delete(node);
        cut.stop();
      }
      changed.delete(box);
      laidOut.disconnect();
      content.disconnect();
    };
  };
}
