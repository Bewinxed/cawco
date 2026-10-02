/**
 * Where a nested list's rail stands (app.css .kit-nest): under the centre
 * of its parent's glyph (`--nest-x`), starting at the glyph's bottom edge
 * (`--nest-lead`, the glyph's bottom to the list's first row), measured
 * rather than assumed, so the rail leaves the glyph wherever the parent row
 * puts it. A list that folds (`unfold`) lets that first stretch, above its
 * own box, show while it does (`bleed: "var(--nest-lead)"`).
 *
 *   <ul class="kit-nest" {@attach nestFrom(".session-mark")}>
 *
 * The glyph is looked for in the nearest list item around the list: the
 * parent row the list hangs under. A parent that is not a list item (a
 * card's head) marks its box `data-nest-host`.
 *
 * Measured in layout, transforms ignored (a list arriving while reflow
 * slides its rows is measured where it lands), and only once the page is
 * laid out: the size observer's first call comes after layout and before
 * paint. Read as the list mounts, in the middle of the update that adds it,
 * the offsets laid the whole half-built page out an extra time, the longest
 * part of an expand's first frame.
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

const px = (value: number) => `${value.toFixed(2)}px`;

export function nestFrom(glyph: string): Attachment<HTMLElement> {
  return (node) => {
    const measure = () => {
      const host = node.parentElement?.closest<HTMLElement>(
        "li, [data-nest-host]"
      );
      const parent = host?.querySelector<HTMLElement>(glyph);
      if (!parent) {
        return;
      }
      const mark = layoutBox(parent);
      const list = layoutBox(node);
      const first =
        list.top +
        node.clientTop +
        Number.parseFloat(getComputedStyle(node).paddingTop);
      const glyphBottom = mark.top + mark.height;
      node.style.setProperty(
        "--nest-x",
        px(mark.left + mark.width / 2 - list.left)
      );
      node.style.setProperty("--nest-lead", px(first - glyphBottom));
    };
    // Its first call is the measure, after layout; after that, a rail or
    // font change that moves the glyph measures again.
    const sizes = new ResizeObserver(measure);
    sizes.observe(node);
    return () => sizes.disconnect();
  };
}
