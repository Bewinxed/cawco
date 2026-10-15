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
 * same commands in the same order (M, a cubic for the start foot, one for
 * the start side, the shoulder's arc, the top, the other shoulder, the end
 * side, the end foot), so a tab moving from one pose to another is each
 * point of its path moving: its feet spreading out or folding in, a side
 * bowing out and back, its top rising and coming down (TabsList, the
 * come-forward). A foot is the quarter turn's cubic (its handles 0.5523 of
 * the flare along each tangent) scaled by its spread: whole at 1, a
 * straight drop down the tab's edge at 0, past the flare beyond 1. A side
 * is the straight run from the foot's top to the shoulder as a cubic, its
 * handles pushed out sideways by 4/3 of its bow, so its middle stands the
 * bow out.
 */

/** How far along each tangent a quarter circle's cubic puts its handles, of the radius. */
const QUARTER = 0.5523;

/** How a tab stands: each foot's spread (0 folded, 1 flared), each side's bow out, px, and its top's rise, px. */
export interface FoldPose {
  bow: readonly [number, number];
  rise: number;
  spread: readonly [number, number];
}

/** A tab at rest: a foot on each side not folded, no bow, no rise. */
export const restPose = (fold: readonly [boolean, boolean]): FoldPose => ({
  spread: [fold[0] ? 0 : 1, fold[1] ? 0 : 1],
  bow: [0, 0],
  rise: 0,
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

const pt = (x: number, y: number) => `${r2(x)} ${r2(y)}`;

/** The outline in a pose. */
export function foldPath(box: FoldBox, pose: FoldPose): string {
  const { width: w, height: h, flare: f, radius: r } = box;
  const left = f;
  const right = f + w;
  const [s0, s1] = pose.spread;
  const [b0, b1] = pose.bow;
  const top = -pose.rise;
  const foot = h - f;
  /** A side's run from (x0, y0) to (x1, y1) as a cubic, bowed out (`way` −1 start, 1 end) by `bow`. */
  const side = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    bow: number,
    way: number
  ) => {
    const push = way * bow * (4 / 3);
    return `C ${pt(x0 + (x1 - x0) / 3 + push, y0 + (y1 - y0) / 3)} ${pt(x0 + (2 * (x1 - x0)) / 3 + push, y0 + (2 * (y1 - y0)) / 3)} ${pt(x1, y1)}`;
  };
  const startTip = left - f * s0;
  const endTip = right + f * s1;
  return [
    `M ${pt(startTip, h)}`,
    `C ${pt(startTip + QUARTER * f * s0, h)} ${pt(left, foot + QUARTER * f * s0)} ${pt(left, foot)}`,
    side(left, foot, left + box.slopeStart, top + r, b0, -1),
    `A ${r2(r)} ${r2(r)} 0 0 1 ${pt(left + box.slopeStart + r, top)}`,
    `L ${pt(right - box.slopeEnd - r, top)}`,
    `A ${r2(r)} ${r2(r)} 0 0 1 ${pt(right - box.slopeEnd, top + r)}`,
    side(right - box.slopeEnd, top + r, right, foot, b1, 1),
    `C ${pt(right, foot + QUARTER * f * s1)} ${pt(endTip - QUARTER * f * s1, h)} ${pt(endTip, h)}`,
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
