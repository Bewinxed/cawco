/**
 * A scrolling log that keeps its newest line in view while the reader is at
 * its end, and leaves a reader who scrolled up exactly where they are: the
 * transcript's rule. What says where the reader is, is the reader's own
 * scrolling: this box's writes are tagged with the offset they wrote, and a
 * scroll event that matches the tag is ours, not theirs. A line arriving
 * (the list's children change) or growing (a row's size changes) scrolls a
 * box that is at its end to its new end, in the same frame.
 *
 * Attach to the scrolling list: `{@attach followTail()}`.
 */

/** Within this of its end, the log counts as read to the end (one line). */
const TAIL = 24;

export function followTail() {
  return (list: HTMLElement) => {
    let atEnd = true;
    let wrote = -1;
    const toEnd = () => {
      if (atEnd) {
        list.scrollTop = list.scrollHeight;
        wrote = list.scrollTop;
      }
    };
    const onScroll = () => {
      if (Math.abs(list.scrollTop - wrote) <= 1) {
        return;
      }
      atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < TAIL;
    };
    const sizes = new ResizeObserver(toEnd);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(list);
      for (const line of list.children) {
        sizes.observe(line);
      }
    };
    const lines = new MutationObserver(() => {
      watch();
      toEnd();
    });
    watch();
    lines.observe(list, { childList: true });
    list.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      sizes.disconnect();
      lines.disconnect();
      list.removeEventListener("scroll", onScroll);
    };
  };
}
