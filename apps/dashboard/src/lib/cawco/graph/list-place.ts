/**
 * Where a list of states opens, by the state on stage (`row`) in its
 * machine's section.
 */

/**
 * The list's place on open: at its top when the kept row stands in view
 * there; else its machine's head at the top, whole, when that shows the
 * row; else the row by the least it takes. The states list (Journey)
 * opens so, on the state on stage: the place a reader starts (DESIGN.md,
 * Map mode: a narrow map's list opens scrolled to the canvas's own card).
 */
export const placeOpen = (scroller: HTMLElement, row: HTMLElement): void => {
  const { top } = scroller.getBoundingClientRect();
  const fold = scroller.clientHeight;
  const rowFoot = row.getBoundingClientRect().bottom - top + scroller.scrollTop;
  if (rowFoot <= fold) {
    scroller.scrollTop = 0;
    return;
  }
  const head = row.closest("section");
  const headAt = head
    ? head.getBoundingClientRect().top - top + scroller.scrollTop
    : 0;
  scroller.scrollTop = rowFoot - headAt <= fold ? headAt : rowFoot - fold;
};
