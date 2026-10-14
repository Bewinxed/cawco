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
 */

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

/** The outline, a foot folded on each side marked so. */
export function foldPath(
  box: FoldBox,
  fold: readonly [boolean, boolean]
): string {
  const { width: w, height: h, flare: f, radius: r } = box;
  const left = f;
  const right = f + w;
  const [foldStart, foldEnd] = fold;
  const parts = foldStart
    ? [`M ${r2(left)} ${r2(h)}`]
    : [`M 0 ${r2(h)}`, `A ${r2(f)} ${r2(f)} 0 0 0 ${r2(left)} ${r2(h - f)}`];
  parts.push(
    `L ${r2(left)} ${r2(h - f)}`,
    `L ${r2(left + box.slopeStart)} ${r2(r)}`,
    `A ${r2(r)} ${r2(r)} 0 0 1 ${r2(left + box.slopeStart + r)} 0`,
    `L ${r2(right - box.slopeEnd - r)} 0`,
    `A ${r2(r)} ${r2(r)} 0 0 1 ${r2(right - box.slopeEnd)} ${r2(r)}`,
    `L ${r2(right)} ${r2(h - f)}`
  );
  parts.push(
    foldEnd
      ? `L ${r2(right)} ${r2(h)}`
      : `A ${r2(f)} ${r2(f)} 0 0 0 ${r2(right + f)} ${r2(h)}`
  );
  return parts.join(" ");
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
