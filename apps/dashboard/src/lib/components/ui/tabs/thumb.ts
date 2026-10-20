import { frameObserver } from "#lib/cawco/frame-observer.js";
import { dur, ease } from "#lib/cawco/motion/curves.svelte.js";
import { tv } from "#lib/utils.js";

/**
 * The segmented control (DESIGN.md, Segmented), used by Tabs and single
 * toggle groups: a recess-deep groove, 10px round with a 3px pad, holding a
 * lifted thumb (8px, the raised shadow) that `slideThumb` places under the
 * chosen segment, and the segments: 30px tall, 10px in, label weight at
 * line-height 1, muted until chosen. A segment presses with the tint
 * (`press-tint` on the segment), never a scale. A group whose answer the hub
 * still owes (`data-pending`) breathes its thumb, where motion is welcome.
 * The segment is a mark line, so its words stand on their x-height.
 */
export const segmentedVariants = tv({
  slots: {
    group:
      "group/segmented relative inline-flex items-center gap-space-row rounded-md bg-surface-recess-deep p-c-segmented-pad",
    thumb:
      "pointer-events-none absolute start-0 top-0 origin-top-left rounded-sm bg-surface-lift opacity-0 shadow-raised motion-safe:group-data-pending/segmented:animate-breath",
    segment:
      "mark-line relative inline-flex h-c-btn-h-sm items-center justify-center gap-c-segment-gap whitespace-nowrap rounded-sm px-c-segment-pad-x py-0 font-body font-medium text-ink-muted text-size-label leading-none transition-control data-[state=active]:text-ink-strong data-[state=on]:text-ink-strong",
  },
});

/**
 * Slides the thumb of a segmented group (tabs, single toggle group) under
 * its selected item, gliding its position and its size together over
 * --dur-pop on --ease-in-out, the way the new-session ghost follows the
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
          duration: dur("--dur-pop"),
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
