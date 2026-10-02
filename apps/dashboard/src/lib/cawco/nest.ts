/**
 * Where a nested list's rail stands (app.css .kit-nest `--nest-x`): under
 * the centre of its parent's glyph, measured rather than assumed, so the
 * rail follows the glyph wherever the parent row puts it.
 *
 *   <ul class="kit-nest" {@attach nestFrom(".project-mark")}>
 *
 * The glyph is looked for in the nearest list item around the list: the
 * parent row the list hangs under. A parent that is not a list item (a
 * card's head) marks its box `data-nest-host`.
 */
import type { Attachment } from "svelte/attachments";

/**
 * A child row's place for the lines' stagger: `--nest-i` from the top as
 * they draw in, `--nest-r` from the bottom as they retract.
 */
export const nestPlace = (i: number, count: number): string =>
  `--nest-i: ${i}; --nest-r: ${Math.max(0, count - 1 - i)}`;

export function nestFrom(glyph: string): Attachment<HTMLElement> {
  return (node) => {
    const measure = () => {
      const parent = node.parentElement
        ?.closest("li, [data-nest-host]")
        ?.querySelector<HTMLElement>(glyph);
      if (!parent) {
        return;
      }
      const mark = parent.getBoundingClientRect();
      const list = node.getBoundingClientRect();
      node.style.setProperty(
        "--nest-x",
        `${Math.round(mark.left + mark.width / 2 - list.left)}px`
      );
    };
    measure();
    // A rail or font change moves the glyph: measure again.
    const sizes = new ResizeObserver(measure);
    sizes.observe(node);
    return () => sizes.disconnect();
  };
}
