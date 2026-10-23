/**
 * One hover ghost and one selection pill for a list, the finish the
 * new-session dialog set (its follow-hover ghost, PORT-SPEC §2.4), as an
 * attachment on the list's container:
 *
 *   <nav {@attach highlight({ rows: "a", selected: '[aria-current="page"]' })}>
 *
 * - The ghost slides to the row the pointer is on, or between rows the
 *   nearest one (80ms, --ease-in-out), and fades in place when the pointer
 *   leaves, or, with
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
 * by their place (`place`), width and height only.
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
import { frameObserver } from "#lib/cawco/frame-observer.js";
import { watchRendered } from "#lib/utils/rendered.js";
import { tv } from "#lib/utils.js";

/**
 * The layers' recipe. Every layer is drawn under the rows (the list
 * isolates, the layers sit at -1, so a row's text and icons are always above
 * them) and placed from measured client rects, which are physical: each
 * anchors to the physical top-left corner the measurements are taken from
 * and moves by `--hl-x` and `--hl-y`, shown by `--hl-show`.
 *
 * - The ghost is the one hover fill. Where nothing hovers (a touch screen:
 *   a tap fires a synthetic mousemove and no mouseleave, so a ghost would
 *   park on the last tap as a second selection) there is none, unless the
 *   rows' own highlight drives it (`data-follow`). It fades in place over
 *   --dur-control; gliding (`data-glide`), it moves 80ms on --ease-in-out.
 * - The pill is the selection, the apricot wash its row's selected ink
 *   stands on; gliding, it moves 120ms on --ease-drawer. The trail is the
 *   old selection fading where it was (`data-fade`). With less motion a
 *   selection that moves cross-fades (`data-swap`) over --dur-fade.
 * - `card`: a grid of icon cards (DESIGN.md, Channel cards), whose pill is
 *   the channel card's selection frame, 1px brand-solid over the recess at
 *   the card's own radius, drawn over the card's border and fill and under
 *   its face (CardFace).
 */
export const highlightVariants = tv({
  slots: {
    ghost:
      "pointer-events-none absolute top-0 left-0 -z-1 hidden translate-x-(--hl-x) translate-y-(--hl-y) bg-surface-hover opacity-(--hl-show) [transition:--hl-show_var(--dur-control)_var(--ease-out)] data-follow:block motion-safe:data-glide:[transition:--hl-x_var(--dur-ghost)_var(--ease-in-out),--hl-y_var(--dur-ghost)_var(--ease-in-out),width_var(--dur-ghost)_var(--ease-in-out),height_var(--dur-ghost)_var(--ease-in-out),--hl-show_var(--dur-control)_var(--ease-out)] hover-hover:block",
    pill: "pointer-events-none absolute top-0 left-0 -z-1 translate-x-(--hl-x) translate-y-(--hl-y) bg-selected-bg opacity-(--hl-show) data-swap:[transition:--hl-show_var(--dur-fade)_var(--ease-out)] motion-safe:data-glide:not-data-swap:[transition:--hl-x_var(--dur-control)_var(--ease-drawer),--hl-y_var(--dur-control)_var(--ease-drawer),width_var(--dur-control)_var(--ease-drawer),height_var(--dur-control)_var(--ease-drawer)]",
    trail:
      "pointer-events-none absolute top-0 left-0 -z-1 translate-x-(--hl-x) translate-y-(--hl-y) bg-selected-bg opacity-(--hl-show) data-fade:[transition:--hl-show_var(--dur-control)_var(--ease-out)] data-fade:data-swap:[transition:--hl-show_var(--dur-fade)_var(--ease-out)]",
  },
  variants: {
    look: {
      card: {
        pill: "z-1 box-border border border-brand-solid bg-surface-recess",
        trail: "z-1 box-border border border-brand-solid bg-surface-recess",
      },
    },
  },
});

type Axis = "x" | "y" | "xy";

/** How far past a row's edge, along the list's axis, the pointer still counts as on it. */
const REACH = 8;
/** How far a row is drawn from where it lands before it counts as on its way. */
const CARRIED = 0.5;
/** Frames the rows stand still before a pointer that never moved is aimed again. */
const STILL = 3;
/** A scroll this soon (ms) after a wheel, a key or a touch is the reader's own. */
const OWN_SCROLL = 200;
/** How long (ms) a scroll stands still before the ghost is aimed in full again. */
const SCROLL_END = 100;
/** An ancestor's move ending, on a transition or an animation (a sheet's `sheet-in`). */
const SETTLES = [
  "transitionend",
  "transitioncancel",
  "animationend",
  "animationcancel",
];

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
  /** `card`: a grid of icon cards, its pill the channel card's frame. */
  look?: "card";
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

const layer = (slot: string, className: string) => {
  const span = document.createElement("span");
  span.className = className;
  span.dataset.slot = slot;
  span.setAttribute("aria-hidden", "true");
  return span;
};

/**
 * A layer's place and whether it shows are three numbers its style is
 * worked out from (`--hl-x`, `--hl-y`, `--hl-show`, registered in app.css), and those are
 * what glide and fade. With `transform` and `opacity` transitioned
 * themselves, each glide and each fade lifted the layer onto the
 * compositor, and with it every row drawn over it: the rows over the ghost
 * were absent for a frame each time it moved.
 */
const place = (span: HTMLElement, box: Box) => {
  span.style.setProperty("--hl-x", `${box.x}px`);
  span.style.setProperty("--hl-y", `${box.y}px`);
  span.style.width = `${box.w}px`;
  span.style.height = `${box.h}px`;
  span.style.borderRadius = box.r;
};

const show = (span: HTMLElement, on: boolean) => {
  span.style.setProperty("--hl-show", on ? "1" : "0");
};

/**
 * Whether a layer glides to its next place (`data-glide`), written only
 * when it changes: a `reflow` around the list hears each attribute write as
 * a change to re-place every row. A list folding open (`unfold`) resizes
 * the container every frame, and each resize set the pill's glide again: a
 * full reflow a frame.
 */
const setGlide = (span: HTMLElement, on: boolean) => {
  if (span.hasAttribute("data-glide") !== on) {
    span.toggleAttribute("data-glide", on);
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

/** Whether a box is anywhere else at all: a follow places the layer exactly. */
const moved = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) > 0.001 ||
  Math.abs(a.y - b.y) > 0.001 ||
  Math.abs(a.w - b.w) > 0.001 ||
  Math.abs(a.h - b.h) > 0.001;

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
      look,
    } = options;
    // The list isolates, so the layers at -1 stand under its rows and over
    // nothing outside it.
    container.dataset.highlight = "";
    const ownIsolate = !container.classList.contains("isolate");
    container.classList.add("isolate");
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    const looks = highlightVariants({ look });
    const ghost = layer("highlight-ghost", looks.ghost());
    const trail = layer("highlight-trail", looks.trail());
    const pill = layer("highlight-pill", looks.pill());
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
    const frameOf = () => {
      const frame = container.getBoundingClientRect();
      // Drawn size over laid-out size; the laid-out size is the resolved
      // one, fractional, so an untransformed list is exactly 1.
      const styles = getComputedStyle(container);
      const across = (drawn: number, laid: string) => {
        const size = Number.parseFloat(laid);
        return size > 0 && Math.abs(drawn - size) > 0.01 ? drawn / size : 1;
      };
      return {
        left: frame.left,
        top: frame.top,
        borderLeft: container.clientLeft,
        borderTop: container.clientTop,
        sx: across(frame.width, styles.width),
        sy: across(frame.height, styles.height),
      };
    };
    /** A point in the frame `frameOf` measured, at the list's scroll now. */
    const inFrame = (
      frame: ReturnType<typeof frameOf>,
      clientX: number,
      clientY: number
    ) => ({
      x:
        (clientX - frame.left) / frame.sx -
        frame.borderLeft +
        container.scrollLeft,
      y:
        (clientY - frame.top) / frame.sy -
        frame.borderTop +
        container.scrollTop,
      sx: frame.sx,
      sy: frame.sy,
    });
    const toLocal = (clientX: number, clientY: number) =>
      inFrame(frameOf(), clientX, clientY);
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
      // On the device-pixel grid, as the row's own box is painted: a layer
      // placed by a fractional translate draws its 1px edge across two
      // pixels, a soft line beside the row's crisp one (a card at x 1026.3
      // drew the frame's brand edge at 73%).
      const snap = (v: number) =>
        Math.round(v * window.devicePixelRatio) / window.devicePixelRatio;
      const left = snap(rect.left - slid.x);
      const top = snap(rect.top - slid.y);
      const at = toLocal(left, top);
      return {
        x: at.x,
        y: at.y,
        w: (snap(rect.right - slid.x) - left) / at.sx,
        h: (snap(rect.bottom - slid.y) - top) / at.sy,
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
      [...container.querySelectorAll<HTMLElement>(rows)].filter(isRow);
    /** The list is not rendered (`watchRendered`): nothing measures it. */
    let skipped = false;
    let ghostBox: Box | null = null;
    let ghostRow: HTMLElement | null = null;
    let pendingHide = 0;
    let pillBox: Box | null = null;
    let pillRow: HTMLElement | null = null;
    /** The rows the layers stand on, watched for their own size (set below, with its observer). */
    let watchRows: () => void = () => undefined;

    const showOrCover = () => {
      show(ghost, !(covered && ghostRow?.matches(covered)));
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
        cancelAnimationFrame(following);
        row?.removeAttribute("data-ghosted");
        show(ghost, false);
        ghostRow = null;
        watchRows();
        letGo();
        return;
      }
      // Out of view, the ghost lands where it is going without a glide;
      // from under a covering row it glides out as it would from view.
      setGlide(ghost, ghostRow !== null);
      place(ghost, box);
      ghostBox = box;
      ghostRow = row;
      watchRows();
      showOrCover();
      follow();
      afterMoves();
    };
    /**
     * A placement taken while the list was moving (its content shifting
     * under a still pointer, a panel above it folding) is the list's place
     * at that moment, and a list that moves on without resizing sets nothing
     * measuring it again: the ghost stood off its row by however far the
     * list went on (the spawn sheet's model list, 0.45px). So the ghost
     * follows its row, without a glide, until the row has stood still for
     * `STILL` frames. On a list that is not moving the first check finds the
     * box the ghost already has. A scroll is `aimScrolling`'s: the rows do
     * not move in the list's own space while it scrolls.
     */
    /**
     * A ghost that has faded holds no place. Kept, its place was wherever a
     * pointer last crossed the list, measured as the list stood at that
     * moment (the spawn sheet's model list, crossed on the way to the
     * location chip as the sheet was still settling): a hidden layer at
     * 142.469px or 142.016px down by the race. It fades where it is
     * (`--hl-show`), then lets go, and its next showing lands without a glide
     * as it always has (`ghostRow` is null).
     */
    const letGo = () => {
      const drop = () => {
        if (ghostRow !== null) {
          return;
        }
        for (const property of [
          "--hl-x",
          "--hl-y",
          "width",
          "height",
          "border-radius",
        ]) {
          ghost.style.removeProperty(property);
        }
        ghostBox = null;
      };
      const fades = ghost
        .getAnimations()
        .filter(
          (run) =>
            run instanceof CSSTransition &&
            run.transitionProperty === "--hl-show"
        );
      if (fades.length === 0) {
        drop();
        return;
      }
      // A fade cancelled is a ghost shown again: its place is its own.
      Promise.all(fades.map((run) => run.finished)).then(drop, () => undefined);
    };
    let following = 0;
    const follow = () => {
      cancelAnimationFrame(following);
      let still = 0;
      const check = () => {
        const row = ghostRow;
        if (!(row?.isConnected && ghostBox) || scrolling || skipped) {
          return;
        }
        const box = boxOf(row);
        if (box && moved(box, ghostBox)) {
          setGlide(ghost, false);
          place(ghost, box);
          ghostBox = box;
          still = 0;
        } else {
          still += 1;
        }
        if (still < STILL) {
          following = requestAnimationFrame(check);
        }
      };
      following = requestAnimationFrame(check);
    };

    /** The pill onto the selected row: from the ghost, or gliding. */
    const placePill = (glide: boolean) => {
      if (!selected) {
        return;
      }
      const row = container.querySelector<HTMLElement>(selected);
      const box = row && shownBoxOf(row);
      if (!(row && box)) {
        show(pill, false);
        pillBox = null;
        pillRow = null;
        watchRows();
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
        fadeTrail(pillBox);
      }
      movePill(box, glide && !fromGhost && pillBox !== null && row !== pillRow);
      pillBox = box;
      pillRow = row;
      watchRows();
      afterMoves();
    };
    /** Hover becomes selection: the old selection fades where it was. */
    const fadeTrail = (from: Box) => {
      trail.removeAttribute("data-fade");
      trail.removeAttribute("data-swap");
      place(trail, from);
      show(trail, true);
      requestAnimationFrame(() => {
        // With less motion the fade is the whole move: --dur-fade (`swap`).
        trail.toggleAttribute("data-fade", true);
        trail.toggleAttribute("data-swap", reduced.matches);
        show(trail, false);
      });
    };
    /**
     * The pill to its box: gliding when it moves to another row, or, with
     * less motion, cross-fading there (`swap`); landing at once otherwise.
     */
    const movePill = (box: Box, move: boolean) => {
      if (move && pillBox && reduced.matches) {
        swap(pillBox, box);
        return;
      }
      pill.removeAttribute("data-swap");
      setGlide(pill, move);
      place(pill, box);
      show(pill, true);
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    /** A selection that moves under less motion: a cross-fade, never a glide. */
    const swap = (from: Box, to: Box) => {
      // Both land at once, transitions off: the trail where the selection
      // was, the pill hidden where it is going.
      trail.removeAttribute("data-fade");
      trail.removeAttribute("data-swap");
      place(trail, from);
      show(trail, true);
      pill.removeAttribute("data-swap");
      setGlide(pill, false);
      place(pill, to);
      show(pill, false);
      // Then the fades, from the frame those were drawn in.
      requestAnimationFrame(() => {
        trail.toggleAttribute("data-fade", true);
        trail.toggleAttribute("data-swap", true);
        pill.toggleAttribute("data-swap", true);
        show(trail, false);
        show(pill, true);
      });
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

    /** Whether a row is one of the list's own, shown and in reach. */
    const isRow = (row: HTMLElement) =>
      container.contains(row) &&
      !(row as HTMLButtonElement).disabled &&
      row.offsetParent !== null &&
      (!laidOut || laidOut().has(row));
    /**
     * Whether a row is drawn where the pointer could reach it: what is on
     * screen at the row's own point nearest the pointer is the row's. A row
     * scrolled out under the list's edge, or under another surface, has a
     * box there and nothing drawn.
     */
    const drawnNear = (row: HTMLElement, x: number, y: number): boolean => {
      const rect = row.getBoundingClientRect();
      const inX = Math.min(REACH, rect.width / 2);
      const inY = Math.min(1, rect.height / 2);
      const seen = document.elementFromPoint(
        Math.min(rect.right - inX, Math.max(rect.left + inX, x)),
        Math.min(rect.bottom - inY, Math.max(rect.top + inY, y))
      );
      return seen !== null && rowOf(seen) === row;
    };
    /**
     * The row an element belongs to: the row it is in, or the one row of
     * the nearest box around it that holds any. A control that stands beside
     * its row in the row's own box (a session row's Peek or Archive) is that row's;
     * the box of a parent and the rows under it is nobody's.
     */
    const rowOf = (element: Element): HTMLElement | null => {
      const inside = element.closest<HTMLElement>(rows);
      if (inside) {
        return inside;
      }
      for (
        let at: Element | null = element;
        at && at !== container;
        at = at.parentElement
      ) {
        const held = at.querySelectorAll<HTMLElement>(rows);
        if (held.length > 0) {
          return held.length === 1 ? held[0] : null;
        }
      }
      return null;
    };

    /**
     * The row a point on screen is on. What is drawn under the point says
     * so first: a row whose anything is under it (its mark, a control that
     * hangs outside its box or stands beside it, `rowOf`) is that row,
     * whatever boxes lie there. Measured
     * by boxes alone, a pointer on the rail's footer was on the session row
     * scrolled out of sight behind it, nearer by its centre. A row a slide
     * is still carrying is not counted this way: the ghost is aimed at where
     * rows land. Between rows, the nearest of those the pointer can reach: a
     * row counts only when its box, grown by REACH along the list's axis
     * (enough to bridge the gaps between rows), holds the point, and it is
     * drawn there. Over a header, a seam, the list's own chrome or anything
     * that lies over the list there is none, and the ghost fades rather than
     * jumping to whatever row is closest.
     */
    const nearest = (clientX: number, clientY: number) => {
      const under = document.elementFromPoint(clientX, clientY);
      if (!(under && container.contains(under))) {
        return null;
      }
      const shares = new Map<HTMLElement, { x: number; y: number }>();
      return standingRow(under, shares) ?? reachedRow(clientX, clientY, shares);
    };
    /** The row an element is in, if it stands where it is laid out. */
    const standingRow = (
      under: Element,
      shares: Map<HTMLElement, { x: number; y: number }>
    ) => {
      const on = rowOf(under);
      if (!(on && isRow(on))) {
        return null;
      }
      const slid = slideOf(on, container, shares);
      return Math.abs(slid.x) <= CARRIED && Math.abs(slid.y) <= CARRIED
        ? on
        : null;
    };
    /** The nearest row whose grown box holds the point, drawn there. */
    const reachedRow = (
      clientX: number,
      clientY: number,
      shares: Map<HTMLElement, { x: number; y: number }>
    ) => {
      const at = toLocal(clientX, clientY);
      const reached: { distance: number; row: HTMLElement }[] = [];
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
        reached.push({ distance, row });
      }
      reached.sort((a, b) => a.distance - b.distance);
      return (
        reached.find(({ row }) => drawnNear(row, clientX, clientY))?.row ?? null
      );
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
      forgetScroll();
      pointer = null;
      if (!hovered) {
        // It fades where its row stands now. Placed as the list's content
        // moved under a still pointer (a `pointerover` the list had not
        // seen the pointer for), the place was the list's at that moment;
        // the list moving on without resizing, with the same row under the
        // pointer, set nothing measuring it again, and the ghost faded,
        // and stayed, off its row by as much (the spawn sheet's model list,
        // 142.469px or 142.016px down by the race).
        const box = ghostRow?.isConnected ? boxOf(ghostRow) : undefined;
        if (box) {
          setGlide(ghost, false);
          place(ghost, box);
          ghostBox = box;
        }
        showGhost(null);
      }
    };
    /** When the reader last scrolled by hand: a wheel, a key, a touch. */
    let lastInput = Number.NEGATIVE_INFINITY;
    const onInput = () => {
      lastInput = performance.now();
    };
    /**
     * A scroll the reader makes carries the rows under a still pointer, and
     * the ghost follows to the row the pointer is on, frame by frame. The
     * rows do not move in the list's own space while it scrolls, so their
     * boxes are measured once, when the scroll begins, with the list's
     * frame; each scroll frame then reads only the scroll offset and checks
     * the pointer against those boxes, and the ghost is placed again only
     * when the row under the pointer changes. Re-aimed in full every frame
     * (`nearest`: what is drawn under the pointer, every row's style and
     * box), the tab track's scroll spent half its script here. Once the
     * scroll has stood still for `SCROLL_END`, the pointer is aimed in full
     * (a row covered by another surface is not the pointer's), and the
     * boxes are let go: anything that moves the rows (`laidOut`, a resize)
     * lets them go too.
     */
    let scrolling: {
      frame: ReturnType<typeof frameOf>;
      rows: { box: Omit<Box, "r">; row: HTMLElement }[];
    } | null = null;
    let scrollEnd: ReturnType<typeof setTimeout> | undefined;
    const forgetScroll = () => {
      clearTimeout(scrollEnd);
      scrolling = null;
    };
    const aimScrolling = (at: { x: number; y: number }) => {
      if (!scrolling) {
        const shares = new Map<HTMLElement, { x: number; y: number }>();
        scrolling = {
          frame: frameOf(),
          rows: rowsNow().flatMap((row) => {
            const box =
              getComputedStyle(row).pointerEvents === "none"
                ? undefined
                : placeOf(row, shares);
            return box ? [{ row, box }] : [];
          }),
        };
      }
      const local = inFrame(scrolling.frame, at.x, at.y);
      let best: HTMLElement | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const { row, box } of scrolling.rows) {
        if (!reaches(box, local)) {
          continue;
        }
        const dx = local.x - (box.x + box.w / 2);
        const dy = local.y - (box.y + box.h / 2);
        const distance = {
          x: Math.abs(dx),
          y: Math.abs(dy),
          xy: Math.hypot(dx, dy),
        }[axis];
        if (distance < bestDistance) {
          best = row;
          bestDistance = distance;
        }
      }
      if (best !== ghostRow) {
        showGhost(best);
      }
      clearTimeout(scrollEnd);
      scrollEnd = setTimeout(() => {
        scrolling = null;
        if (pointer && ghostRow) {
          onMove({ clientX: pointer.x, clientY: pointer.y }, true);
        }
      }, SCROLL_END);
    };
    const onScroll = () => {
      if (!pointer) {
        return;
      }
      if (performance.now() - lastInput < OWN_SCROLL) {
        if (ghostRow && !hovered) {
          cancelAnimationFrame(settling);
          aimScrolling(pointer);
        }
        return;
      }
      // Nobody scrolled: the list moved itself under the pointer.
      forgetScroll();
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
    const sizes = frameObserver(() => onResize());
    const onResize = () => {
      forgetScroll();
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
    /**
     * Each layer onto its row's box as it stands now, where that is anywhere
     * else at all (`moved`: a residue under `same`'s half pixel is still a
     * place the layer is not), without a glide. A layer already on its row's
     * box is left as it is, so a glide on its way there runs on.
     */
    const realign = () => {
      if (skipped) {
        return;
      }
      const pillAt = pillRow?.isConnected ? shownBoxOf(pillRow) : undefined;
      if (pillAt && pillBox && moved(pillAt, pillBox)) {
        setGlide(pill, false);
        place(pill, pillAt);
        pillBox = pillAt;
      }
      const ghostAt = ghostRow?.isConnected ? boxOf(ghostRow) : undefined;
      if (ghostAt && ghostBox && moved(ghostAt, ghostBox)) {
        setGlide(ghost, false);
        place(ghost, ghostAt);
        ghostBox = ghostAt;
      }
    };
    /**
     * The rows the layers stand on, watched beside the list. A row's own box
     * can change while the list keeps its size: a tree's inset, measured
     * after the pill was placed (motion/branch `measureNests`), sets its rows
     * a step in and a step narrower, and a row whose edge is drawn
     * (`data-flip="box"`) travels to that width frame by frame (motion/rows
     * `spanOf`). Nothing else here heard it: placed while the width was on
     * its way, the rail's pill stood at the row's old width for good (198px
     * on a 185px row). A row's first report aims the layers once more too:
     * the box they were measured at may have moved on before it.
     */
    const watchedRows = new Set<Element>();
    const rowWatch = frameObserver(() => realign());
    const toRealign = () => rowWatch.request();
    watchRows = () => {
      for (const row of watchedRows) {
        if (row !== pillRow && row !== ghostRow) {
          rowWatch.unobserve(row);
          watchedRows.delete(row);
        }
      }
      for (const row of [pillRow, ghostRow]) {
        if (row && !watchedRows.has(row)) {
          watchedRows.add(row);
          rowWatch.observe(row, { box: "border-box" });
        }
      }
    };
    watchRows();
    // An ancestor that moves the list (a popover scaling in, a sheet sliding
    // up on `sheet-in`) leaves a residue in what was measured mid-move: a
    // row's edges are put on the device-pixel grid where it is drawn, and a
    // move is no resize, so nothing measured them again. The rail's pill in
    // a tablet's sheet stood 0.37px off its row. Once an ancestor's
    // transition or animation ends, whatever it moved, the layers are aimed
    // again at where their rows stand.
    const settled = (event: Event) => {
      const { target } = event;
      if (
        target instanceof Element &&
        target !== container &&
        target.contains(container)
      ) {
        toRealign();
      }
    };
    for (const type of SETTLES) {
      document.addEventListener(type, settled, true);
    }
    /**
     * A move on the Web Animations API sends none of those events: a Svelte
     * transition (an `in:` or `out:` scaling the list), on the list itself
     * or round it. Placed while one runs, the layers keep its residue (the
     * Project select's ghost, its row's edges on the device-pixel grid of a
     * list still scaling, drew another antialiasing on each walk of
     * usage/project-pick-many). Each placement waits on every animation then
     * running on the list or round it, and once it finishes the layers are
     * aimed again at where their rows stand.
     */
    const awaited = new WeakSet<Animation>();
    const afterMoves = () => {
      for (let at: Element | null = container; at; at = at.parentElement) {
        for (const run of at.getAnimations()) {
          if (run.playState !== "finished" && !awaited.has(run)) {
            awaited.add(run);
            run.finished.then(toRealign, () => undefined);
          }
        }
      }
    };
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
          forgetScroll();
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
      forgetScroll();
      cancelAnimationFrame(pendingHide);
      cancelAnimationFrame(pendingSync);
      cancelAnimationFrame(settling);
      cancelAnimationFrame(following);
      container.removeEventListener("pointermove", onPointer);
      container.removeEventListener("pointerover", onOver);
      container.removeEventListener("pointerleave", onLeave);
      container.removeEventListener("wheel", onInput, { capture: true });
      container.removeEventListener("touchmove", onInput, { capture: true });
      container.removeEventListener("keydown", onInput, { capture: true });
      container.removeEventListener("scroll", onScroll, { capture: true });
      for (const type of SETTLES) {
        document.removeEventListener(type, settled, true);
      }
      rowWatch.disconnect();
      watch.disconnect();
      sizes.disconnect();
      watching.stop();
      ghostRow?.removeAttribute("data-ghosted");
      ghost.remove();
      trail.remove();
      pill.remove();
      delete container.dataset.highlight;
      if (ownIsolate) {
        container.classList.remove("isolate");
      }
    };
  };
}
