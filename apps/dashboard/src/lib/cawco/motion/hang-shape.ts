/**
 * A surface that hangs from a folder tab (the session card, the tab's menu)
 * as one silhouette with it: one closed path, the tab's own outline
 * (fold-path) running down its flank, round its foot's flare and on as the
 * hang's edge all the way round (owner: "in both of these the rim doesn't
 * smoothly connect between these, it's a bit aliased and blurry"; "why
 * aren't these the blended/merged menu that morphs out of the tab?").
 *
 * The geometry, all from the tab's own (owner: "the curve of the foot
 * doesn't match the curve of the tab, and it needs to be wider to fit and
 * connect well"):
 *  - the hang's top edge starts at each foot's tip, where the foot's quarter
 *    turn runs level, and runs out from there to the hang's own corner: the
 *    curve goes on into the edge with the same tangent, and the hang is
 *    always at least as wide as the tab's foot-to-foot span;
 *  - where the hang cannot reach past a foot (a pane's edge, the screen's),
 *    it stands flush with the tab's flank on that side instead: the tab's
 *    foot is square there and its flank runs straight on down into the
 *    hang's side, the same tangent again.
 *
 * Drawn crisp at every scale: the outline is the silhouette `HALF` px in
 * from its edge all round, the line a 1px stroke is centred on to lie wholly
 * inside it; the edges stand on whole css px (the tab's box and the hang's
 * are laid out on them), so the stroke covers whole device px at 1x, 2x and
 * 3x. The tab's sheet and the hang's surface each stop at that line, under
 * the stroke's middle, so no fill's edge lies under the stroke's edge.
 */
import {
  type FoldBox,
  foldPath,
  restPose,
} from "#lib/components/ui/fluid-tabs/fold-path.js";

/** Half the outline's 1px stroke: the outline is drawn this far in from the silhouette's edge. */
export const HALF = 0.5;

/** A box on the page, css px. */
export interface Span {
  left: number;
  right: number;
}

/** The tab a surface hangs from, and the surface as drawn now. */
export interface HangGeometry {
  /** The tab's own shape (its `.ff-tab` box, its flare, shoulders and slopes). */
  box: FoldBox;
  /** The hang's corner radius, px. */
  corner: number;
  /** The sides the hang stands flush with the tab on (square there). */
  flush: { end: boolean; start: boolean };
  /** The hang as drawn: its sides and its height under the shelf, px. */
  hang: Span & { height: number };
  /** The tab's box on the page: its top and its foot (the shelf). */
  tab: Span & { bottom: number; top: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** A point on the page, written in a box whose top-left is `o`. */
type At = (x: number, y: number) => string;
const at =
  (o: { x: number; y: number }): At =>
  (x, y) =>
    `${r2(x - o.x)} ${r2(y - o.y)}`;
const PAGE = { x: 0, y: 0 };

/** Each corner's radius as drawn: the hang's, less where its height or the run past a foot leaves no room. */
function radii(g: HangGeometry) {
  const { tab, hang, box, flush } = g;
  const bottom = Math.max(0, Math.min(g.corner, hang.height / 2));
  const room = (run: number) =>
    Math.max(0, Math.min(g.corner, run, hang.height - bottom));
  return {
    bottom,
    start: flush.start ? 0 : room(tab.left - box.flare - hang.left),
    end: flush.end ? 0 : room(hang.right - (tab.right + box.flare)),
  };
}

/**
 * The hang's edge from the end foot's tip (or, flush, the end flank's foot)
 * clockwise round to the start foot's tip (or flank), as path commands on
 * the outline (`HALF` in).
 */
function hangEdge(g: HangGeometry, pt: At): string[] {
  const { tab, hang, flush } = g;
  const f = g.box.flare;
  const shelf = tab.bottom;
  const bottom = shelf + hang.height;
  const r = radii(g);
  /** A convex corner of radius `radius` (on the outline, less `HALF`) to (x, y), or a straight run where there is no room for one. */
  const corner = (radius: number, x: number, y: number) =>
    radius > HALF
      ? `A ${r2(radius - HALF)} ${r2(radius - HALF)} 0 0 1 ${pt(x, y)}`
      : `L ${pt(x, y)}`;
  const out: string[] = [];
  if (!flush.end) {
    out.push(`L ${pt(hang.right - r.end, shelf + HALF)}`);
    out.push(corner(r.end, hang.right - HALF, shelf + Math.max(r.end, HALF)));
  }
  out.push(`L ${pt(hang.right - HALF, bottom - r.bottom)}`);
  out.push(corner(r.bottom, hang.right - r.bottom, bottom - HALF));
  out.push(`L ${pt(hang.left + r.bottom, bottom - HALF)}`);
  out.push(corner(r.bottom, hang.left + HALF, bottom - r.bottom));
  if (flush.start) {
    out.push(`L ${pt(hang.left + HALF, shelf)}`);
  } else {
    out.push(`L ${pt(hang.left + HALF, shelf + Math.max(r.start, HALF))}`);
    out.push(corner(r.start, hang.left + r.start, shelf + HALF));
    out.push(`L ${pt(tab.left - f, shelf + HALF)}`);
  }
  return out;
}

/** The tab's own outline on the page, `HALF` in, its feet flared but where the hang stands flush. */
function tabEdge(g: HangGeometry): string {
  return foldPath(g.box, restPose([g.flush.start, g.flush.end]), {
    inset: HALF,
    at: { x: g.tab.left - g.box.flare, y: g.tab.top },
  });
}

/** Whether the hang is drawn at all: under a px of it, the tab stands alone. */
const drawnHang = (g: HangGeometry) => g.hang.height >= 1;

/**
 * The silhouette's outline on the page, `HALF` in from its edge: the line
 * its one stroke is centred on. With no hang drawn yet, the tab's own
 * outline, open along the shelf.
 */
export function hangOutline(g: HangGeometry): string {
  const tab = tabEdge(g);
  return drawnHang(g) ? `${tab} ${hangEdge(g, at(PAGE)).join(" ")} Z` : tab;
}

/**
 * The hang's surface: the silhouette under the shelf, in from its edge to
 * the outline (where the stroke's middle is), as a path in the surface's
 * own box (`origin`, its top-left on the page). Under the tab, between its
 * feet, it reaches up to the shelf, where the tab's own sheet takes over.
 */
export function hangClip(
  g: HangGeometry,
  origin: { x: number; y: number }
): string {
  if (!drawnHang(g)) {
    return "M 0 0 Z";
  }
  const { tab, flush, box } = g;
  const pt = at(origin);
  const f = box.flare;
  const shelf = tab.bottom;
  // Where each foot's turn, grown by HALF about its centre, crosses the shelf.
  const cross = Math.sqrt((f + HALF) ** 2 - f ** 2);
  const startX = flush.start ? tab.left + HALF : tab.left - f + cross;
  const endX = flush.end ? tab.right - HALF : tab.right + f - cross;
  const turn = `A ${r2(f + HALF)} ${r2(f + HALF)} 0 0 0`;
  const path = [`M ${pt(startX, shelf)}`, `L ${pt(endX, shelf)}`];
  if (!flush.end) {
    path.push(`${turn} ${pt(tab.right + f, shelf + HALF)}`);
  }
  path.push(...hangEdge(g, pt));
  if (!flush.start) {
    path.push(`${turn} ${pt(startX, shelf)}`);
  }
  path.push("Z");
  return path.join(" ");
}

/**
 * The silhouette `p` of the way out of the tab (0 the tab alone, 1 the hang
 * whole): the hang grows down out of the shelf to its height and out from
 * the tab's foot-to-foot span to its own sides, on the same progress, so it
 * is one shape at every frame of an open or a close.
 */
export function hangAt(g: HangGeometry, p: number): HangGeometry {
  const t = Math.min(1, Math.max(0, p));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const f = g.box.flare;
  return {
    ...g,
    hang: {
      left: g.flush.start ? g.hang.left : lerp(g.tab.left - f, g.hang.left),
      right: g.flush.end ? g.hang.right : lerp(g.tab.right + f, g.hang.right),
      height: g.hang.height * t,
    },
  };
}

/** Where a hang stands under its tab: its left edge and width on the page, and the sides it stands flush on. */
export interface HangPlace {
  flush: { end: boolean; start: boolean };
  left: number;
  width: number;
}

/**
 * Where a hang `width` wide stands under a tab (its box `tab`, its flare
 * `flare`), inside `bounds` (the pane's leading edge or the screen's margin,
 * the screen's trailing margin): one corner (`corner`) and a short run
 * (`run`) out past each foot's tip, so the foot runs level into its top
 * edge; flush with the tab's flank on a side where that would cross the
 * bounds; shifted toward the start, or flush with the end flank, where its
 * width would pass the bounds' end; and widened, where it is narrower than
 * the tab's span and its corners need (a menu's own width).
 */
export function placeHang(opts: {
  bounds: Span;
  corner: number;
  flare: number;
  run: number;
  tab: Span;
  width: number;
}): HangPlace {
  const { tab, flare, corner: c, run, bounds } = opts;
  const { left: tabLeft, right: tabRight } = tab;
  let { width } = opts;
  const reachStart = tabLeft - flare - c - run;
  const reachEnd = tabRight + flare + c + run;
  let start = false;
  let end = false;
  let left = reachStart;
  if (left < bounds.left) {
    start = true;
    left = tabLeft;
  }
  if (left + width > bounds.right) {
    if (start) {
      width = bounds.right - left;
    } else {
      left = Math.max(bounds.left, bounds.right - width);
      width = Math.min(width, bounds.right - left);
      if (left > reachStart) {
        start = true;
        width = bounds.right - tabLeft;
        left = tabLeft;
      }
    }
  }
  if (left + width < reachEnd) {
    if (reachEnd <= bounds.right) {
      width = reachEnd - left;
    } else {
      end = true;
      width = tabRight - left;
    }
  }
  return { left, width, flush: { start, end } };
}
