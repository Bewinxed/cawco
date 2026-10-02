/**
 * Where a nested list's rail stands (app.css .kit-nest): under the centre
 * of its parent's glyph (`--nest-x`), starting at the glyph's bottom edge
 * (`--nest-lead`, the glyph's bottom to the list's top), measured rather
 * than assumed, so the rail leaves the glyph wherever the parent row puts
 * it.
 *
 *   <ul class="kit-nest" {@attach nestFrom(".project-mark")}>
 *
 * The glyph is looked for in the nearest list item around the list: the
 * parent row the list hangs under. A parent that is not a list item (a
 * card's head) marks its box `data-nest-host`.
 *
 * Both are measured in layout, transforms ignored: a list arriving while
 * reflow slides its rows is measured where it lands, not where it is
 * drawn mid-slide.
 */
import type { Attachment } from "svelte/attachments";

/**
 * A child row's place for the lines' stagger: `--nest-i` from the top as
 * they draw in, `--nest-r` from the bottom as they retract.
 */
export const nestPlace = (i: number, count: number): string =>
  `--nest-i: ${i}; --nest-r: ${Math.max(0, count - 1 - i)}`;

/** An element's layout box on the page, transforms ignored. */
function layoutBox(element: HTMLElement): {
  height: number;
  left: number;
  top: number;
  width: number;
} {
  let left = 0;
  let top = 0;
  let at: HTMLElement | null = element;
  while (at) {
    left += at.offsetLeft;
    top += at.offsetTop;
    const up = at.offsetParent as HTMLElement | null;
    if (up) {
      left += up.clientLeft - up.scrollLeft;
      top += up.clientTop - up.scrollTop;
    }
    at = up;
  }
  return {
    left,
    top,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

export function nestFrom(glyph: string): Attachment<HTMLElement> {
  return (node) => {
    const measure = () => {
      const parent = node.parentElement
        ?.closest("li, [data-nest-host]")
        ?.querySelector<HTMLElement>(glyph);
      if (!parent) {
        return;
      }
      const mark = layoutBox(parent);
      const list = layoutBox(node);
      node.style.setProperty(
        "--nest-x",
        `${(mark.left + mark.width / 2 - list.left).toFixed(2)}px`
      );
      node.style.setProperty(
        "--nest-lead",
        `${(list.top - (mark.top + mark.height)).toFixed(2)}px`
      );
    };
    measure();
    // A rail or font change moves the glyph: measure again.
    const sizes = new ResizeObserver(measure);
    sizes.observe(node);
    return () => sizes.disconnect();
  };
}
