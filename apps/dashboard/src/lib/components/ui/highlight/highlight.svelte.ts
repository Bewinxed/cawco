/**
 * One hover ghost and one selection pill for a list, the finish the
 * new-session dialog set (its follow-hover ghost, PORT-SPEC §2.4), as an
 * attachment on the list's container:
 *
 *   <nav {@attach highlight({ rows: "a", selected: '[aria-current="page"]' })}>
 *
 * - The ghost slides to whichever row is nearest the pointer (80ms,
 *   --ease-in-out) and fades in place when the pointer leaves, or, with
 *   `hovered`, follows the row carrying that attribute (a menu's
 *   `data-highlighted`, set by pointer and arrow keys alike). Keyboard focus
 *   moves it too. Where nothing hovers (touch), it never shows (app.css).
 * - The pill sits under the selected row and glides to the next one
 *   (120ms, --ease-drawer). A row picked with the pointer is already under
 *   the ghost: there the pill takes the ghost's place at once and the old
 *   selection fades where it was, so hover becomes selection with no frame
 *   of both and none of neither.
 *
 * All three layers are drawn under the rows (the container isolates, they
 * sit at z-index -1), measured from the rows' own rects and radii, and move
 * on transform, width and height only.
 */
type Axis = "x" | "y" | "xy";

export interface HighlightOptions {
  /** How nearness to the pointer is measured: `xy` for a grid. */
  axis?: Axis;
  /**
   * Rows whose own surface covers the ghost — a chosen tab's sheet. The
   * ghost glides beneath one and fades there, instead of showing through
   * its anti-aliased edge, and glides back out from under it.
   */
  covered?: string;
  /** `false` for a pill alone, under a list that an outer ghost covers. */
  ghost?: boolean;
  /** A row attribute that says which row is hovered, instead of the pointer. */
  hovered?: string;
  /** The rows the ghost and the pill stand under. */
  rows: string;
  /** The selected row. */
  selected?: string;
}

interface Box {
  h: number;
  r: string;
  w: number;
  x: number;
  y: number;
}

const layer = (name: string) => {
  const span = document.createElement("span");
  span.className = name;
  span.setAttribute("aria-hidden", "true");
  return span;
};

const place = (span: HTMLElement, box: Box) => {
  span.style.transform = `translate(${box.x}px, ${box.y}px)`;
  span.style.width = `${box.w}px`;
  span.style.height = `${box.h}px`;
  span.style.borderRadius = box.r;
};

const same = (a: Box | null, b: Box | null) =>
  a !== null &&
  b !== null &&
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.w - b.w) < 0.5 &&
  Math.abs(a.h - b.h) < 0.5;

export function highlight(options: HighlightOptions) {
  return (container: HTMLElement) => {
    const {
      rows,
      hovered,
      selected,
      covered,
      axis = "y",
      ghost: withGhost = true,
    } = options;
    container.classList.add("kit-highlight");
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    const ghost = layer("kit-ghost");
    const trail = layer("kit-pill-trail");
    const pill = layer("kit-pill");
    // A ghost the rows' own highlight drives (a menu's arrow keys) shows on
    // a touch screen too; a ghost the pointer drives does not.
    if (hovered) {
      ghost.dataset.follow = "";
    }
    container.prepend(...(withGhost ? [ghost] : []), trail, pill);

    /** A row's box in the container's padding box, scroll included. */
    const boxOf = (row: HTMLElement): Box => {
      const frame = container.getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      return {
        x: rect.left - frame.left - container.clientLeft + container.scrollLeft,
        y: rect.top - frame.top - container.clientTop + container.scrollTop,
        w: rect.width,
        h: rect.height,
        r: getComputedStyle(row).borderRadius,
      };
    };
    const rowsNow = () =>
      [...container.querySelectorAll<HTMLElement>(rows)].filter(
        (row) =>
          !(row as HTMLButtonElement).disabled && row.offsetParent !== null
      );
    const rowOf = (node: EventTarget | null) =>
      node instanceof Element
        ? (node.closest<HTMLElement>(rows) ?? null)
        : null;

    let ghostBox: Box | null = null;
    let ghostRow: HTMLElement | null = null;
    /** What put the ghost where it is: a blur only takes back its own. */
    let ghostBy: "pointer" | "focus" | "attribute" | null = null;
    let pendingHide = 0;
    let pillBox: Box | null = null;
    let pillRow: HTMLElement | null = null;

    const showOrCover = () => {
      ghost.style.opacity = covered && ghostRow?.matches(covered) ? "0" : "1";
    };
    const showGhost = (row: HTMLElement | null) => {
      if (!withGhost) {
        return;
      }
      // The row under the ghost says so, for a pill in a nested list (a
      // sidebar's) that has no ghost of its own to take over from.
      if (ghostRow !== row) {
        ghostRow?.removeAttribute("data-ghosted");
        row?.setAttribute("data-ghosted", "");
      }
      if (!row) {
        ghost.style.opacity = "0";
        ghostRow = null;
        return;
      }
      const box = boxOf(row);
      // Out of view, the ghost lands where it is going without a glide;
      // from under a covering row it glides out as it would from view.
      ghost.classList.toggle("kit-glide", ghostRow !== null);
      place(ghost, box);
      ghostBox = box;
      ghostRow = row;
      showOrCover();
    };

    /** The pill onto the selected row: from the ghost, or gliding. */
    const syncPill = (glide: boolean) => {
      if (!selected) {
        return;
      }
      const row = container.querySelector<HTMLElement>(selected);
      if (!row || row.offsetParent === null) {
        pill.style.opacity = "0";
        pillBox = null;
        pillRow = null;
        return;
      }
      const box = boxOf(row);
      if (row === pillRow && same(box, pillBox)) {
        return;
      }
      const fromGhost =
        row !== pillRow &&
        ((row === ghostRow && same(box, ghostBox)) ||
          row.hasAttribute("data-ghosted"));
      if (fromGhost && pillBox) {
        // Hover becomes selection: the old selection fades where it was.
        trail.classList.remove("kit-fade");
        place(trail, pillBox);
        trail.style.opacity = "1";
        requestAnimationFrame(() => {
          trail.classList.add("kit-fade");
          trail.style.opacity = "0";
        });
      }
      const move = glide && !fromGhost && pillBox !== null && row !== pillRow;
      pill.classList.toggle("kit-glide", move);
      place(pill, box);
      pill.style.opacity = "1";
      pillBox = box;
      pillRow = row;
    };

    /** Where the pointer last was, to re-aim when a list scrolls under it. */
    let pointer: { x: number; y: number } | null = null;
    const onMove = (
      event: { clientX: number; clientY: number },
      again = false
    ) => {
      if (hovered) {
        return;
      }
      pointer = { x: event.clientX, y: event.clientY };
      let best: HTMLElement | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const row of rowsNow()) {
        const rect = row.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        const distance = {
          x: Math.abs(dx),
          y: Math.abs(dy),
          xy: Math.hypot(dx, dy),
        }[axis];
        if (distance < bestDistance) {
          bestDistance = distance;
          best = row;
        }
      }
      if (best && (again || best !== ghostRow)) {
        ghostBy = "pointer";
        showGhost(best);
      }
    };
    const onLeave = () => {
      pointer = null;
      if (!hovered) {
        showGhost(null);
      }
    };
    const onScroll = () => {
      if (pointer && ghostRow) {
        onMove({ clientX: pointer.x, clientY: pointer.y }, true);
      }
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Element;
      if (!hovered && target.matches(":focus-visible")) {
        ghostBy = "focus";
        showGhost(rowOf(target));
      }
    };
    // Focus leaving the list takes back a ghost that focus put there. A
    // ghost under the pointer stays: a click that navigates moves focus,
    // and the ghost under the pointer is the one that becomes the pill.
    const onBlur = (event: FocusEvent) => {
      if (
        !hovered &&
        ghostBy === "focus" &&
        !container.contains(event.relatedTarget as Node)
      ) {
        ghostBy = null;
        showGhost(null);
      }
    };
    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);
    container.addEventListener("focusin", onFocus);
    container.addEventListener("focusout", onBlur);
    container.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });

    const watch = new MutationObserver(() => {
      // A row under the ghost can come to cover it (a tab chosen under
      // the pointer), or stop covering it.
      if (covered && ghostRow) {
        showOrCover();
      }
      if (hovered) {
        const row = container.querySelector<HTMLElement>(hovered);
        cancelAnimationFrame(pendingHide);
        if (row) {
          ghostBy = "attribute";
          showGhost(row);
        } else {
          // A highlight moving from one row to the next can clear the old
          // row a task before it marks the new one: wait a frame before
          // taking the ghost away, so it glides instead of blinking.
          pendingHide = requestAnimationFrame(() => {
            if (!container.querySelector(hovered)) {
              showGhost(null);
            }
          });
        }
      }
      syncPill(true);
    });
    watch.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-current",
        "aria-selected",
        "aria-checked",
        "data-state",
        "data-active",
        "data-highlighted",
        "data-selected",
      ],
    });
    // A resize moves every row at once: the layers follow without a glide,
    // on the next frame, so placing them (which can toggle a scrollbar on a
    // scrolling list) never resizes the list inside its own observer.
    let pendingResize = 0;
    const sizes = new ResizeObserver(() => {
      cancelAnimationFrame(pendingResize);
      pendingResize = requestAnimationFrame(onResize);
    });
    const onResize = () => {
      pillRow = null;
      pillBox = null;
      pill.classList.remove("kit-glide");
      syncPill(false);
      if (ghostRow?.isConnected) {
        ghost.classList.remove("kit-glide");
        place(ghost, boxOf(ghostRow));
      }
    };
    sizes.observe(container);
    syncPill(false);

    return () => {
      cancelAnimationFrame(pendingResize);
      cancelAnimationFrame(pendingHide);
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", onLeave);
      container.removeEventListener("focusin", onFocus);
      container.removeEventListener("focusout", onBlur);
      container.removeEventListener("scroll", onScroll, { capture: true });
      watch.disconnect();
      sizes.disconnect();
      ghostRow?.removeAttribute("data-ghosted");
      ghost.remove();
      trail.remove();
      pill.remove();
      container.classList.remove("kit-highlight");
    };
  };
}
