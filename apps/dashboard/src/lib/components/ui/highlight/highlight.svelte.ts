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
 *   on a row is the focus ring's (app.css), never the ghost's. Where
 *   nothing hovers (touch), it never shows (app.css) and a touch never
 *   aims it.
 * - The pill sits under the selected row and glides to the next one
 *   (120ms, --ease-drawer). A row picked with the pointer is already under
 *   the ghost: there the pill takes the ghost's place at once and the old
 *   selection fades where it was, so hover becomes selection with no frame
 *   of both and none of neither.
 *
 * All three layers are drawn under the rows (the container isolates, they
 * sit at z-index -1), measured from the rows' own rects and radii, and move
 * on transform, width and height only.
 *
 * Rows can move under a pointer that stays still — one closes and the rest
 * slide over. The browser says so with a `pointerover` on whatever is under
 * the pointer now, a scroll the reader did not make (a list that got shorter
 * at its scroll end) says so too, and a list that measures its own rows
 * (`laidOut`) says so every time it re-measures. The ghost never travels to
 * a row that is still on its way: it steps aside while the rows move, and
 * once they stand still it shows, in place, on the row the pointer is on
 * (`settle`).
 */
import { untrack } from "svelte";
import { watchRendered } from "#lib/utils/rendered.js";

type Axis = "x" | "y" | "xy";

/** How far past a row's edge, along the list's axis, the pointer still counts as on it. */
const REACH = 8;
/** How far a row is drawn from where it lands before it counts as on its way. */
const CARRIED = 0.5;
/** Frames the rows stand still before a pointer that never moved is aimed again. */
const STILL = 3;
/** A scroll this soon (ms) after a wheel, a key or a touch is the reader's own. */
const OWN_SCROLL = 200;

/** A row's box in the container's own coordinates. */
export interface LaidOut {
  height: number;
  left: number;
  top: number;
  width: number;
}

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
  /**
   * Where each row is laid out, for a list that measures its rows itself
   * (the tabs' TabRects), read reactively. The layers are placed from these
   * boxes rather than from what is drawn, so a row a FLIP is still carrying
   * is aimed at where it lands, and they follow the rows each time the list
   * re-measures. Only rows with a box here are rows.
   */
  laidOut?: () => ReadonlyMap<Element, LaidOut>;
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

/**
 * Whether a layer glides to its next place, written only when it changes: a
 * class list writes its attribute on every add or remove, changed or not,
 * and a `reflow` around the list hears each write as a change to re-place
 * every row. A list folding open (`unfold`) resizes the container every
 * frame, and each resize set the pill's glide again: a full reflow a frame.
 */
const setGlide = (span: HTMLElement, on: boolean) => {
  if (span.classList.contains("kit-glide") !== on) {
    span.classList.toggle("kit-glide", on);
  }
};

/**
 * How far a row is drawn from where it is laid out: the translation its own
 * and its ancestors' transforms carry, up to the container (a FLIP sliding
 * it, on `transform` or `translate`). Taken off its drawn rect, what is left
 * is where it lands, to the subpixel.
 */
const slideOf = (
  row: HTMLElement,
  container: HTMLElement,
  /**
   * Each ancestor's own share, kept across the rows of one pass: rows share
   * their ancestors, and read again for every row, a list of sixty rows read
   * five hundred styles each time the pointer was re-aimed.
   */
  shares = new Map<HTMLElement, { x: number; y: number }>()
) => {
  let x = 0;
  let y = 0;
  for (
    let at: HTMLElement | null = row;
    at && at !== container;
    at = at.parentElement
  ) {
    let share = shares.get(at);
    if (!share) {
      share = { x: 0, y: 0 };
      const styles = getComputedStyle(at);
      if (styles.transform !== "none") {
        const matrix = new DOMMatrixReadOnly(styles.transform);
        share.x += matrix.e;
        share.y += matrix.f;
      }
      if (styles.translate !== "none") {
        const [tx = "0", ty = "0"] = styles.translate.split(" ");
        share.x += Number.parseFloat(tx);
        share.y += Number.parseFloat(ty);
      }
      shares.set(at, share);
    }
    x += share.x;
    y += share.y;
  }
  return { x, y };
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
      laidOut,
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

    /**
     * A point on screen in the container's padding box, scroll included, in
     * the container's own untransformed pixels: a list inside a popover that
     * is still scaling in is measured at its real size, not its drawn one.
     */
    const toLocal = (clientX: number, clientY: number) => {
      const frame = container.getBoundingClientRect();
      // Drawn size over laid-out size; the laid-out size is the resolved
      // one, fractional, so an untransformed list is exactly 1.
      const styles = getComputedStyle(container);
      const across = (drawn: number, laid: string) => {
        const size = Number.parseFloat(laid);
        return size > 0 && Math.abs(drawn - size) > 0.01 ? drawn / size : 1;
      };
      const sx = across(frame.width, styles.width);
      const sy = across(frame.height, styles.height);
      return {
        x:
          (clientX - frame.left) / sx -
          container.clientLeft +
          container.scrollLeft,
        y:
          (clientY - frame.top) / sy -
          container.clientTop +
          container.scrollTop,
        sx,
        sy,
      };
    };
    /**
     * A row's box in the same space: where the list laid it out, when it
     * says, or else where the page laid it out, transforms ignored. A row a
     * FLIP is still carrying (reflow sliding the rows under a list that just
     * opened) is aimed at where it lands, not where it is drawn mid-slide:
     * measured there, the pill stayed a row off once the slide ended, with
     * nothing left to move it. Undefined for a row not laid out.
     */
    const placeOf = (
      row: HTMLElement,
      shares?: Map<HTMLElement, { x: number; y: number }>
    ): Omit<Box, "r"> | undefined => {
      if (laidOut) {
        const at = laidOut().get(row);
        return at && { x: at.left, y: at.top, w: at.width, h: at.height };
      }
      const rect = row.getBoundingClientRect();
      const slid = slideOf(row, container, shares);
      const at = toLocal(rect.left - slid.x, rect.top - slid.y);
      return {
        x: at.x,
        y: at.y,
        w: rect.width / at.sx,
        h: rect.height / at.sy,
      };
    };
    const boxOf = (row: HTMLElement): Box | undefined => {
      const at = placeOf(row);
      return at && { ...at, r: getComputedStyle(row).borderRadius };
    };
    /** A row's box, if it is shown at all. */
    const shownBoxOf = (row: HTMLElement) =>
      row.offsetParent === null ? undefined : boxOf(row);
    const rowsNow = () =>
      [...container.querySelectorAll<HTMLElement>(rows)].filter(
        (row) =>
          !(row as HTMLButtonElement).disabled &&
          row.offsetParent !== null &&
          (!laidOut || laidOut().has(row))
      );
    /** The list is not rendered (`watchRendered`): nothing measures it. */
    let skipped = false;
    let ghostBox: Box | null = null;
    let ghostRow: HTMLElement | null = null;
    let pendingHide = 0;
    let pillBox: Box | null = null;
    let pillRow: HTMLElement | null = null;

    const showOrCover = () => {
      ghost.style.opacity = covered && ghostRow?.matches(covered) ? "0" : "1";
    };
    const showGhost = (row: HTMLElement | null) => {
      if (!withGhost || skipped) {
        return;
      }
      // The row under the ghost says so, for a pill in a nested list (a
      // sidebar's) that has no ghost of its own to take over from.
      if (ghostRow !== row) {
        ghostRow?.removeAttribute("data-ghosted");
        row?.setAttribute("data-ghosted", "");
      }
      const box = row && boxOf(row);
      if (!(row && box)) {
        row?.removeAttribute("data-ghosted");
        ghost.style.opacity = "0";
        ghostRow = null;
        return;
      }
      // Out of view, the ghost lands where it is going without a glide;
      // from under a covering row it glides out as it would from view.
      setGlide(ghost, ghostRow !== null);
      place(ghost, box);
      ghostBox = box;
      ghostRow = row;
      showOrCover();
    };

    /** The pill onto the selected row: from the ghost, or gliding. */
    const placePill = (glide: boolean) => {
      if (!selected) {
        return;
      }
      const row = container.querySelector<HTMLElement>(selected);
      const box = row && shownBoxOf(row);
      if (!(row && box)) {
        pill.style.opacity = "0";
        pillBox = null;
        pillRow = null;
        return;
      }
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
      setGlide(pill, move);
      place(pill, box);
      pill.style.opacity = "1";
      pillBox = box;
      pillRow = row;
    };
    const syncPill = (glide: boolean) => {
      if (!skipped) {
        placePill(glide);
      }
    };

    /** Whether `at` lies on the row at `box`, the gaps along the axis bridged. */
    const reaches = (
      box: { x: number; y: number; w: number; h: number },
      at: { x: number; y: number }
    ): boolean => {
      const growX = axis === "y" ? 0 : REACH;
      const growY = axis === "x" ? 0 : REACH;
      return (
        at.x >= box.x - growX &&
        at.x <= box.x + box.w + growX &&
        at.y >= box.y - growY &&
        at.y <= box.y + box.h + growY
      );
    };

    /**
     * The row under a point on screen, of those the pointer can reach: a row
     * counts only when its box, grown by REACH along the list's axis (enough
     * to bridge the gaps between rows), holds the point; of those, the
     * nearest. Over a header, a seam or the list's own chrome there is none,
     * and the ghost fades rather than jumping to whatever row is closest.
     */
    const nearest = (clientX: number, clientY: number) => {
      const at = toLocal(clientX, clientY);
      let best: HTMLElement | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      const shares = new Map<HTMLElement, { x: number; y: number }>();
      for (const row of rowsNow()) {
        // A row the pointer cannot reach — one on its way out — is not
        // under it, wherever it is still drawn.
        const box =
          getComputedStyle(row).pointerEvents === "none"
            ? undefined
            : placeOf(row, shares);
        if (!(box && reaches(box, at))) {
          continue;
        }
        const dx = at.x - (box.x + box.w / 2);
        const dy = at.y - (box.y + box.h / 2);
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
      return best;
    };

    /** Where the pointer last was, to re-aim when a list scrolls under it. */
    let pointer: { x: number; y: number } | null = null;
    /** The frame a still pointer is next aimed on (`settle`). */
    let settling = 0;
    const onMove = (
      event: { clientX: number; clientY: number },
      again = false
    ) => {
      if (hovered) {
        return;
      }
      cancelAnimationFrame(settling);
      pointer = { x: event.clientX, y: event.clientY };
      const best = nearest(event.clientX, event.clientY);
      if (again || best !== ghostRow) {
        showGhost(best);
      }
    };

    /** Whether any row is drawn off its place: a slide is carrying it. */
    const rowsMoving = (): boolean => {
      const shares = new Map<HTMLElement, { x: number; y: number }>();
      return rowsNow().some((row) => {
        const slid = slideOf(row, container, shares);
        return Math.abs(slid.x) > CARRIED || Math.abs(slid.y) > CARRIED;
      });
    };
    /**
     * The rows moved and the pointer did not: a tree folded and the rows
     * under it slid up, or the list got shorter at its scroll end and
     * everything stepped down. The row the ghost was on is on its way
     * somewhere else, and so is whatever will end up under the pointer. The
     * ghost steps aside, and once every row has stood still for `STILL`
     * frames it shows on the row the pointer is on, in place. Aimed at once,
     * at where the rows would land, it glided to a row still sliding in: a
     * project folded at the rail's end sent it to the "N older" row of the
     * project above, a row the pointer was not on yet.
     */
    const settle = () => {
      const at = pointer;
      if (hovered || !at) {
        return;
      }
      cancelAnimationFrame(settling);
      if (nearest(at.x, at.y) === ghostRow && !rowsMoving()) {
        // Nothing left its place: the ghost follows its own row.
        if (ghostRow) {
          showGhost(ghostRow);
        }
        return;
      }
      showGhost(null);
      let still = 0;
      const check = () => {
        if (pointer !== at) {
          return;
        }
        still = rowsMoving() ? 0 : still + 1;
        if (still < STILL) {
          settling = requestAnimationFrame(check);
          return;
        }
        // From out of view, so it lands without a glide.
        showGhost(nearest(at.x, at.y));
      };
      settling = requestAnimationFrame(check);
    };

    /**
     * A hovering pointer only. A touch has nothing to hover, and a tap's
     * compatibility mousemove would leave the ghost aimed at the tapped row
     * with no mouseleave to end it — every later scroll of the list, a
     * swipe's tab strip following the gesture frame by frame, re-measured
     * the rows for a ghost that is never shown.
     */
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        onMove(event);
      }
    };
    /** Sent with a move, and with none when the rows shift under a still pointer. */
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }
      if (pointer?.x === event.clientX && pointer.y === event.clientY) {
        settle();
      } else {
        onMove(event);
      }
    };
    const onLeave = () => {
      cancelAnimationFrame(settling);
      pointer = null;
      if (!hovered) {
        showGhost(null);
      }
    };
    /** When the reader last scrolled by hand: a wheel, a key, a touch. */
    let lastInput = Number.NEGATIVE_INFINITY;
    const onInput = () => {
      lastInput = performance.now();
    };
    const onScroll = () => {
      if (!pointer) {
        return;
      }
      if (performance.now() - lastInput < OWN_SCROLL) {
        if (ghostRow) {
          onMove({ clientX: pointer.x, clientY: pointer.y }, true);
        }
        return;
      }
      // Nobody scrolled: the list moved itself under the pointer.
      settle();
    };
    container.addEventListener("pointermove", onPointer);
    container.addEventListener("pointerover", onOver);
    container.addEventListener("pointerleave", onLeave);
    const passive = { capture: true, passive: true } as const;
    container.addEventListener("wheel", onInput, passive);
    container.addEventListener("touchmove", onInput, passive);
    container.addEventListener("keydown", onInput, passive);
    container.addEventListener("scroll", onScroll, passive);

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
      // The pill follows in the next frame's callbacks, where that frame
      // lays the page out anyway. Placed from here, in the microtask after
      // the change that moved the selection (a tab switch showing another
      // conversation), measuring the row laid the whole page out a second
      // time before the change could paint.
      cancelAnimationFrame(pendingSync);
      pendingSync = requestAnimationFrame(() => syncPill(true));
    });
    let pendingSync = 0;
    watch.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-current",
        "aria-pressed",
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
      if (skipped) {
        return;
      }
      pillRow = null;
      pillBox = null;
      setGlide(pill, false);
      syncPill(false);
      const box = ghostRow?.isConnected ? boxOf(ghostRow) : undefined;
      if (box) {
        setGlide(ghost, false);
        place(ghost, box);
        ghostBox = box;
      }
    };
    sizes.observe(container);
    // A list an ancestor skips (the home board put away under a
    // conversation) has no layout to measure, and measuring it would lay it
    // out: the layers wait, and are placed afresh, without a glide, the
    // frame it is rendered again.
    const watching = watchRendered(container, (on) => {
      skipped = !on;
      onResize();
    });
    skipped = !watching.rendered;
    syncPill(false);

    // A list that measures its rows moves the layers each time it does: the
    // ghost glides to the row under the pointer now (or its own row, or
    // away if its row has gone), and the pill onto the selected row.
    if (laidOut) {
      $effect(() => {
        laidOut();
        untrack(() => {
          if (pointer && !hovered) {
            onMove({ clientX: pointer.x, clientY: pointer.y }, true);
          } else if (ghostRow) {
            showGhost(ghostRow.isConnected ? ghostRow : null);
          }
          syncPill(true);
        });
      });
    }

    return () => {
      cancelAnimationFrame(pendingResize);
      cancelAnimationFrame(pendingHide);
      cancelAnimationFrame(pendingSync);
      cancelAnimationFrame(settling);
      container.removeEventListener("pointermove", onPointer);
      container.removeEventListener("pointerover", onOver);
      container.removeEventListener("pointerleave", onLeave);
      container.removeEventListener("wheel", onInput, { capture: true });
      container.removeEventListener("touchmove", onInput, { capture: true });
      container.removeEventListener("keydown", onInput, { capture: true });
      container.removeEventListener("scroll", onScroll, { capture: true });
      watch.disconnect();
      sizes.disconnect();
      watching.stop();
      ghostRow?.removeAttribute("data-ghosted");
      ghost.remove();
      trail.remove();
      pill.remove();
      container.classList.remove("kit-highlight");
    };
  };
}
