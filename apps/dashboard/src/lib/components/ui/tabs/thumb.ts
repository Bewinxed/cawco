import { frameObserver } from "#lib/cawco/frame-observer.js";
import { dur, ease } from "#lib/cawco/motion/curves.svelte.js";
import { tv } from "#lib/utils.js";

/**
 * The segmented control's one recipe (DESIGN.md, Segmented): a recess-deep
 * groove holding a lifted thumb under the chosen segment and the segments,
 * every corner concentric with the groove. Its geometry is custom
 * properties every part reads: `--radius` the groove's corner, `--pad` its
 * inset, `--item` a segment's height, `--shape` the thumb's and the
 * segments' corner (the groove's less the pad). The groove is `radius-md`
 * round with `c-segmented-pad` of pad round 30px segments, 36px in all. It
 * stands on a page's ground: in a bar's glass a segmented control is
 * BarSegments (ui/bar-glass), the glass its list and each segment a bar
 * item, since a groove there drew its hover as the groove's own colour by
 * day, its ring and thumb only once measured, and its segments under a
 * finger's 44px. The kit's Tabs and single ToggleGroup draw it from the
 * slots below; the fluid Tabs' segmented track (fluid-tabs/TabsList) takes
 * {@link SEGMENTED_TRACK} and reads the same properties. By day
 * `surface-hover` is the groove's own colour, so a hover there drew nothing:
 * a segment's hover is `groove-hover`, a step darker by day (away from the
 * lifted thumb), painted by the kit's segments and, through the groove's
 * `--ghost` that the kit ghost (components/ui/highlight) reads, by the fluid
 * track's ghost.
 */
export const SEGMENTED_TRACK =
  "rounded-(--radius) bg-surface-recess-deep p-(--pad) [--ghost:var(--color-groove-hover)] [--item:var(--spacing-c-btn-h-sm)] [--pad:calc(var(--spacing)_*_0.75)] [--radius:var(--radius-md)] [--shape:max(0px,calc(var(--radius)_-_var(--pad)))]";

/**
 * The kit's segmented parts: the groove (its recipe above), the thumb that
 * `slideThumb` places under the chosen segment (the raised shadow), and the
 * segments: label weight at line-height 1, muted until chosen, each a mark
 * line, so its words stand on their x-height. An unchosen segment under a
 * resting pointer takes the groove's hover fill. A segment presses with the
 * tint (`press-tint` on the segment), never a scale. A group whose answer
 * the hub still owes (`data-pending`) breathes its thumb, where motion is
 * welcome.
 */
export const segmentedVariants = tv({
  slots: {
    group: `group/segmented relative inline-flex items-center gap-space-row ${SEGMENTED_TRACK}`,
    thumb:
      "pointer-events-none absolute start-0 top-0 origin-top-left rounded-(--shape) bg-surface-lift opacity-0 shadow-raised loops motion-safe:group-data-pending/segmented:animate-breath",
    segment:
      "relative inline-flex h-(--item) items-center justify-center gap-1.5 rounded-(--shape) px-c-segment-pad-x py-0 font-sans text-size-label leading-none font-medium whitespace-nowrap text-ink-muted transition-control mark-line hover:not-data-[state=active]:not-data-[state=on]:bg-groove-hover data-[state=active]:text-ink-strong data-[state=on]:text-ink-strong",
  },
});

/**
 * Slides the thumb of a segmented group (tabs, single toggle group) under
 * its selected item, gliding its position and its size together over
 * --duration-pop on --ease-in-out, the way the new-session ghost follows the
 * hover. A change caught mid-glide starts from where the thumb is on
 * screen, not from where it was headed, and width and height tween rather
 * than scale, so the thumb's corners never stretch.
 */
export function slideThumb(
  group: HTMLElement,
  thumb: HTMLElement,
  selector: string
): () => void {
  let last: { x: number; y: number; w: number; h: number } | undefined;
  let run: Animation | undefined;
  const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");

  /** Where the thumb is drawn right now, in the group's offset space. */
  const onScreen = () => {
    const box = group.getBoundingClientRect();
    const at = thumb.getBoundingClientRect();
    return {
      x: at.left - box.left - group.clientLeft,
      y: at.top - box.top - group.clientTop,
      w: at.width,
      h: at.height,
    };
  };

  const place = (animate: boolean) => {
    const on = group.querySelector<HTMLElement>(selector);
    if (!on) {
      run?.cancel();
      thumb.style.opacity = "0";
      last = undefined;
      return;
    }
    const next = {
      x: on.offsetLeft,
      y: on.offsetTop,
      w: on.offsetWidth,
      h: on.offsetHeight,
    };
    const glide = animate && last && (last.x !== next.x || last.y !== next.y);
    const from = glide && run?.playState === "running" ? onScreen() : last;
    run?.cancel();
    thumb.style.opacity = "1";
    thumb.style.width = `${next.w}px`;
    thumb.style.height = `${next.h}px`;
    thumb.style.transform = `translate(${next.x}px, ${next.y}px)`;
    if (glide && from && motion.matches) {
      run = thumb.animate(
        [
          {
            transform: `translate(${from.x}px, ${from.y}px)`,
            width: `${from.w}px`,
            height: `${from.h}px`,
          },
          {
            transform: `translate(${next.x}px, ${next.y}px)`,
            width: `${next.w}px`,
            height: `${next.h}px`,
          },
        ],
        {
          duration: dur("--duration-pop"),
          easing: ease("--ease-in-out"),
        }
      );
    }
    last = next;
  };

  place(false);
  const changes = new MutationObserver(() => place(true));
  changes.observe(group, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state"],
  });
  // Placed above, and a resize in the next frame (frameObserver): the
  // thumb's own size is written from it.
  const sizes = frameObserver(() => place(false));
  sizes.observe(group);
  return () => {
    changes.disconnect();
    sizes.disconnect();
  };
}
