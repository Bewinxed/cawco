/**
 * A list's end rows, marked where the list renders them (the owner's pick,
 * 2026-11-24, "super-corners, ends marked"; his rule of the same day:
 * "account for first/n/last in the roundness, on all similar lists"). A
 * rounded list container (a popover, a menu, a select, a command list)
 * calls this on its own element: its first row, when nothing drawn stands
 * above it in the container, carries `data-menu-first`, and its last row,
 * when nothing drawn stands below it, `data-menu-last`. A row
 * (`menuItemVariants`) takes the container's curve on a marked side
 * (`sc-t-concentric-*`, `sc-b-concentric-*`) and the small join radius on
 * every corner that faces a neighbour.
 *
 * A row is any `[data-menu-item]` whose nearest marking container is this
 * one, so a command list inside a popover marks its own rows. Drawn: what
 * has a box, a `display: contents` wrapper by what it holds (bits-ui's
 * command item wrappers); a separator, which stands between rows, and a
 * command's hidden input label are no such thing. A heading above the
 * first row, a separator and a second group are read as the list renders
 * them: the heading keeps the first row off the edge, the separator does
 * not. The marks follow what is added, removed, hidden or opened.
 */
const ROW = "[data-menu-item]";
const CONTAINER = "data-menu-ends";
const FIRST = "data-menu-first";
const LAST = "data-menu-last";
const NOT_DRAWN = '[role="separator"], [data-command-input-label]';

function drawn(el: Element): boolean {
  if (el.matches(NOT_DRAWN)) {
    return false;
  }
  if (getComputedStyle(el).display === "contents") {
    return Array.from(el.children).some(drawn);
  }
  return el.checkVisibility();
}

/** Nothing drawn stands between the row and the container's edge on `side`. */
function atEdge(row: Element, container: Element, side: "start" | "end") {
  for (
    let node: Element | null = row;
    node && node !== container;
    node = node.parentElement
  ) {
    for (
      let sibling =
        side === "start"
          ? node.previousElementSibling
          : node.nextElementSibling;
      sibling;
      sibling =
        side === "start"
          ? sibling.previousElementSibling
          : sibling.nextElementSibling
    ) {
      if (drawn(sibling)) {
        return false;
      }
    }
  }
  return true;
}

function mark(container: HTMLElement) {
  const rows = Array.from(container.querySelectorAll(ROW)).filter(
    (row) => row.parentElement?.closest(`[${CONTAINER}]`) === container
  );
  const shown = rows.filter(drawn);
  const first = shown.at(0);
  const last = shown.at(-1);
  const firstAtEdge = first && atEdge(first, container, "start");
  const lastAtEdge = last && atEdge(last, container, "end");
  for (const row of rows) {
    row.toggleAttribute(FIRST, row === first && Boolean(firstAtEdge));
    row.toggleAttribute(LAST, row === last && Boolean(lastAtEdge));
  }
}

/** Marks `container`'s end rows now and as it changes; returns the stop. */
export function markMenuEnds(container: HTMLElement): () => void {
  container.setAttribute(CONTAINER, "");
  mark(container);
  const observer = new MutationObserver(() => mark(container));
  observer.observe(container, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["hidden", "data-state", CONTAINER],
  });
  return () => {
    observer.disconnect();
    container.removeAttribute(CONTAINER);
  };
}
