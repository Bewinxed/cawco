/**
 * A folder tab's outline as one SVG path, and its rim's taper as a
 * gradient's stops (TabItem draws both: the sheet fills the path, the rim
 * strokes it inside its edge).
 *
 * The path stands on a box one flare wider than the tab each side (x from
 * 0 to width + 2 flare, y from 0 at the top to height on the shelf): from
 * the start foot's tip on the shelf, round the flare (a quarter turn about
 * a centre one flare out from the tab and one flare above the shelf) up to
 * the tab's edge, up the side (brought in at the top by its slope), round
 * the shoulder at the tab radius, across the top, and down the other side
 * the same way to the end foot's tip. A side under its neighbour has no
 * foot: it runs straight down the tab's edge to the shelf. The path is
 * left open along the shelf: a fill closes it there, a stroke does not
 * draw it.
 *
 * It is drawn from a pose (`FoldPose`), and every pose is written with the
 * same commands in the same order (M, a cubic for the start foot, the
 * start side's run, the shoulder's arc, the top, the other shoulder, the
 * end side's run, the end foot), so a tab moving from one pose to another
 * is each point of its path moving: a side's C (its foot's flare, its run
 * up the flank, its shoulder) sweeping out over its neighbour or tucking in
 * under it (TabsList, the come-forward). A foot is the quarter turn's cubic
 * (its handles 0.5523 of the flare along each tangent) scaled by its
 * spread: whole at 1, a straight drop down the tab's edge at 0, past the
 * flare beyond 1. A side's tuck steps its whole C in from the tab's edge
 * (its run, its shoulder and its foot together), px.
 */

/** How far along each tangent a quarter circle's cubic puts its handles, of the radius. */
const QUARTER = 0.5523;

/**
 * How a tab stands: each side's spread (0 its foot folded, 1 flared out),
 * and how far each side is stepped in from the tab's edge, px (0 at rest).
 */
export interface FoldPose {
  spread: readonly [number, number];
  tuck: readonly [number, number];
}

/** A tab at rest: a foot on each side not folded, each side on its edge. */
export const restPose = (fold: readonly [boolean, boolean]): FoldPose => ({
  spread: [fold[0] ? 0 : 1, fold[1] ? 0 : 1],
  tuck: [0, 0],
});

export interface FoldBox {
  /** The tab's outer radius at its flared foot, px (`--flare`). */
  flare: number;
  /** The tab's height, px. */
  height: number;
  /** Its shoulders' radius, px (`--radius`). */
  radius: number;
  /** How far each side's top corner is brought in, px (`--slope-start`, `--slope-end`). */
  slopeEnd: number;
  slopeStart: number;
  /** The tab's width, px. */
  width: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Where a fold path is drawn, and how far in from the tab's edge: `at` the
 * path box's top-left (the svg's own origin, 0 0, by default; a tab's hang
 * draws it on the page), `inset` px in from the edge all round (none by
 * default): the line a stroke `2 × inset` wide is centred on to lie wholly
 * inside the edge (motion/hang-shape). Each side moves in by it, each
 * shoulder's radius shrinks by it, and each flared foot's quarter turn
 * grows by it about the same centre, so the foot still lands level, `inset`
 * below the shelf.
 */
export interface FoldDraw {
  at?: { x: number; y: number };
  inset?: number;
}

/** The outline in a pose. */
export function foldPath(
  box: FoldBox,
  pose: FoldPose,
  draw: FoldDraw = {}
): string {
  const { width: w, flare: f } = box;
  const d = draw.inset ?? 0;
  const ox = draw.at?.x ?? 0;
  const oy = draw.at?.y ?? 0;
  const h = box.height;
  const r = box.radius - d;
  const pt = (x: number, y: number) => `${r2(x + ox)} ${r2(y + oy)}`;
  const [s0, s1] = pose.spread;
  const left = f + d + pose.tuck[0];
  const right = f + w - d - pose.tuck[1];
  const foot = h - f;
  // A flared foot's quarter turn is about a centre one flare out from the
  // side and one flare above the shelf, of radius f (+ the inset): its tip
  // lands that far below the centre, its top that far beside it.
  const turn0 = (f + d) * s0;
  const turn1 = (f + d) * s1;
  const startTip = left - turn0;
  const endTip = right + turn1;
  const tipY = h + d * Math.max(s0, 0);
  const tipYEnd = h + d * Math.max(s1, 0);
  const top = r + d;
  return [
    `M ${pt(startTip, tipY)}`,
    `C ${pt(startTip + QUARTER * turn0, tipY)} ${pt(left, foot + QUARTER * turn0)} ${pt(left, foot)}`,
    `L ${pt(left + box.slopeStart, top)}`,
    `A ${r2(r)} ${r2(r)} 0 0 1 ${pt(left + box.slopeStart + r, d)}`,
    `L ${pt(right - box.slopeEnd - r, d)}`,
    `A ${r2(r)} ${r2(r)} 0 0 1 ${pt(right - box.slopeEnd, top)}`,
    `L ${pt(right, foot)}`,
    `C ${pt(right, foot + QUARTER * turn1)} ${pt(endTip - QUARTER * turn1, tipYEnd)} ${pt(endTip, tipYEnd)}`,
  ].join(" ");
}

export interface TaperStop {
  /** The stroke's ink there, 0 to 1. */
  ink: number;
  /** Up from the shelf, as a share of the tab's height. */
  offset: number;
}

/**
 * The rim's taper as a gradient up from the shelf: at each height, the ink
 * of the stroke that far along it from the foot's tip, `1 - (1 - s/taper)^ease`
 * (`tab-rim-taper`, `tab-rim-taper-ease`), whole at the taper's end or the
 * shoulder, whichever comes first. Along a flared foot the stroke's middle
 * runs round the flare at `flare + stroke / 2`, so a height on the turn
 * stands that arc's length along it, and the run above it the turn's length
 * and its own height past the flare.
 */
export function taperStops(
  box: Pick<FoldBox, "flare" | "height" | "radius">,
  stroke: number,
  taper: number,
  ease: number
): TaperStop[] {
  const { flare: f, height: h, radius: r } = box;
  const mid = f + stroke / 2;
  const turn = (mid * Math.PI) / 2;
  const along = (y: number) =>
    y <= f ? mid * Math.acos(Math.max(-1, 1 - y / f)) : turn + (y - f);
  const whole = Math.max(0, h - r);
  const ink = (y: number) =>
    y >= whole || taper <= 0
      ? 1
      : 1 - (1 - Math.min(1, along(y) / taper)) ** ease;
  const heights = new Set<number>([0, whole, h]);
  for (let y = 0.25; y < whole; y += y < f ? 0.75 : 2) {
    heights.add(r2(y));
  }
  return [...heights]
    .filter((y) => y >= 0 && y <= h)
    .sort((a, b) => a - b)
    .map((y) => ({
      offset: h > 0 ? r2((y / h) * 10_000) / 10_000 : 0,
      ink: r2(ink(y) * 1000) / 1000,
    }));
}
