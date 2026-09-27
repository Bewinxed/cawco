/**
 * Slides the thumb of a segmented group (tabs, single toggle group) under
 * its selected item, gliding its position and its size together over 240ms
 * on --ease-in-out, the way the new-session ghost follows the hover. A
 * change caught mid-glide starts from where the thumb is on screen, not
 * from where it was headed, and width and height tween rather than scale,
 * so the thumb's corners never stretch.
 */
export function slideThumb(
  group: HTMLElement,
  thumb: HTMLElement,
  selector: string
): () => void {
  let last: { x: number; y: number; w: number; h: number } | undefined;
  let run: Animation | undefined;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

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
    if (glide && from && !reduce.matches) {
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
          duration: 240,
          easing: getComputedStyle(group).getPropertyValue("--ease-in-out"),
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
  const sizes = new ResizeObserver(() => place(false));
  sizes.observe(group);
  return () => {
    changes.disconnect();
    sizes.disconnect();
  };
}
