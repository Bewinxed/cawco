/**
 * A scrolling log that keeps its newest line in view while the reader is at
 * its end, and leaves a reader who scrolled exactly where they are: the
 * transcript's rule. What says where the reader is, is the reader's own
 * scrolling: this box's writes are tagged with the offset they wrote, and a
 * scroll event that matches the tag is ours, not theirs. A line arriving
 * (the list's children change), growing (a row's size changes) or its text
 * changing scrolls a box that is at its end to its new end, in the same
 * frame.
 *
 * The reader's scroll has the box until it comes to rest: their first
 * scroll event lets go of the end, so nothing writes the offset under a
 * finger, its momentum or its bounce. At rest (`scrollend`: Safari 26.2 and
 * every current engine), a reader whose scroll last left the box at its end
 * is following it again.
 *
 * Attach to the scrolling list: `{@attach followTail()}`.
 */

/** How far off the end still counts as the end: a pixel's rounding. */
const SLACK = 1;

export function followTail() {
  return (list: HTMLElement) => {
    let atEnd = true;
    /** Where the reader's scrolling last left the box, until it rests. */
    let restsAtEnd: boolean | null = null;
    let wrote: number | null = null;
    const toEnd = () => {
      if (atEnd) {
        list.scrollTop = list.scrollHeight;
        wrote = list.scrollTop;
      }
    };
    const onScroll = () => {
      if (wrote !== null && Math.abs(list.scrollTop - wrote) <= 1) {
        return;
      }
      atEnd = false;
      restsAtEnd =
        list.scrollHeight - list.scrollTop - list.clientHeight <= SLACK;
    };
    const onScrollEnd = () => {
      if (restsAtEnd === null) {
        return;
      }
      atEnd = restsAtEnd;
      restsAtEnd = null;
      toEnd();
    };
    const sizes = new ResizeObserver(toEnd);
    const watch = () => {
      sizes.disconnect();
      sizes.observe(list);
      for (const line of list.children) {
        sizes.observe(line);
      }
    };
    const lines = new MutationObserver((records) => {
      if (records.some((r) => r.type === "childList" && r.target === list)) {
        watch();
      }
      toEnd();
    });
    watch();
    lines.observe(list, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    list.addEventListener("scroll", onScroll, { passive: true });
    list.addEventListener("scrollend", onScrollEnd, { passive: true });
    return () => {
      sizes.disconnect();
      lines.disconnect();
      list.removeEventListener("scroll", onScroll);
      list.removeEventListener("scrollend", onScrollEnd);
    };
  };
}
