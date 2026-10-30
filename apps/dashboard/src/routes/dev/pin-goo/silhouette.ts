/**
 * The goo card's one silhouette: the pin, the card and the bridge between
 * them as one closed vector outline, for one `<path>` with a real 1px
 * stroke (the owner: "looks like a lazy way to draw these things honestly",
 * of the blur-and-threshold filter it replaces).
 *
 * The shapes are rounded boxes; their union is Clipper2's (clipper2-ts, a
 * maintained TypeScript port of Angus Johnson's Clipper2), and the join is
 * a morphological closing on it: grown by `join`, then shrunk by `join`
 * again. A closing keeps every outward corner as it was and rounds every
 * inward one to `join`, so where the bridge meets the card the edge flares
 * out along the card's side in one curve, and a gap narrower than twice
 * `join` (the card still pouring out of its pin) is bridged by a neck that
 * thins as they part: the liquid of the transitions.dev gooey menu, from
 * geometry rather than pixels. It shrinks `HALF` px further, so the outline
 * is the line a 1px stroke is centred on, lying wholly inside the shape
 * (motion/hang-shape's rule): crisp on whole css px at 1x, 2x and 3x.
 *
 * Curves are sampled to `TOLERANCE` px: a chord never strays from its arc
 * by more than a tenth of a device pixel at 2x.
 */
import {
  EndType,
  FillRule,
  inflatePathsD,
  JoinType,
  type PathD,
  type PathsD,
  unionD,
} from "clipper2-ts";

/** A box, css px. */
export interface Rect {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** Corner radii, px: top-left, top-right, bottom-right, bottom-left. */
export type Radii = [number, number, number, number];

/** Half the outline's 1px stroke. */
const HALF = 0.5;
/** The farthest a sampled curve's chord strays from its arc, px. */
const TOLERANCE = 0.05;
/** Decimal places Clipper keeps, and the path is written to. */
const PRECISION = 2;

/** The steps a quarter turn of radius `r` is sampled in, for `TOLERANCE`. */
const steps = (r: number) =>
  Math.max(1, Math.ceil(Math.PI / 2 / (2 * Math.acos(1 - TOLERANCE / r))));

/** A rounded box as a polygon, clockwise on screen. */
export function roundedBox(rect: Rect, radii: Radii): PathD {
  const { x, y, w, h } = rect;
  const most = Math.max(0, Math.min(w, h) / 2);
  const [tl, tr, br, bl] = radii.map((r) =>
    Math.max(0, Math.min(r, most))
  ) as Radii;
  const out: PathD = [];
  const turn = (cx: number, cy: number, r: number, from: number) => {
    if (r <= TOLERANCE) {
      out.push({ x: cx, y: cy });
      return;
    }
    const n = steps(r);
    for (let i = 0; i <= n; i += 1) {
      const a = from + (Math.PI / 2) * (i / n);
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  turn(x + w - tr, y + tr, tr, -Math.PI / 2);
  turn(x + w - br, y + h - br, br, 0);
  turn(x + bl, y + h - bl, bl, Math.PI / 2);
  turn(x + tl, y + tl, tl, Math.PI);
  return out;
}

/** A box as a plain polygon. */
export const plainBox = ({ x, y, w, h }: Rect): PathD => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

const grow = (paths: PathsD, by: number) =>
  inflatePathsD(
    paths,
    by,
    JoinType.Round,
    EndType.Polygon,
    2,
    PRECISION,
    TOLERANCE
  );

/**
 * The silhouette of `shapes` with its inward corners rounded to `join`, as
 * an SVG path on its stroke's line (`HALF` in); "" when nothing is left.
 */
export function silhouette(shapes: PathsD, join: number): string {
  const whole = unionD(shapes, FillRule.NonZero);
  const closed = join > 0 ? grow(whole, join) : whole;
  const line = grow(closed, -(join + HALF));
  return line
    .map((path) => {
      const [first, ...rest] = path;
      if (!first) {
        return "";
      }
      const pt = (p: { x: number; y: number }) =>
        `${p.x.toFixed(PRECISION)} ${p.y.toFixed(PRECISION)}`;
      return `M${pt(first)}L${rest.map(pt).join(" ")}Z`;
    })
    .join("");
}

/** The end of a pin away from its card: where its rim wraps. */
export type FarEnd = "left" | "right" | "top" | "bottom";

/** A rim's line round a pin's far end: its path, its length, where it starts, and the round end's centre and radius (left and right only). */
export interface RimLine {
  d: string;
  end: { r: number; x: number; y: number } | null;
  length: number;
  start: { x: number; y: number };
}

/**
 * The line a pin's rim runs along: the pin's own outline on its stroke's
 * line (`HALF` in), round its far end, the end away from its card. A round
 * end (`left`, `right`) is its half-circle from its top to its foot; a long
 * side (`top`, `bottom`) runs round both its corners from one end's middle
 * to the other's. It starts at the end nearest the pin's top-end corner,
 * where the status dot stands, so the dot slides into it there.
 */
export function rimLine(pin: Rect, far: FarEnd): RimLine {
  const { x, y, w, h } = pin;
  const r = Math.min(w, h) / 2;
  const a = r - HALF;
  const n = (v: number) => v.toFixed(PRECISION);
  const half = Math.PI * a;
  const quarter = half / 2;
  if (far === "left" || far === "right") {
    const cx = far === "left" ? x + r : x + w - r;
    const sweep = far === "left" ? 0 : 1;
    return {
      d: `M${n(cx)} ${n(y + HALF)}A${n(a)} ${n(a)} 0 0 ${sweep} ${n(cx)} ${n(y + h - HALF)}`,
      length: half,
      start: { x: cx, y: y + HALF },
      end: { x: cx, y: y + h / 2, r },
    };
  }
  const edge = far === "top" ? y + HALF : y + h - HALF;
  const mid = far === "top" ? y + r : y + h - r;
  const sweep = far === "top" ? 0 : 1;
  return {
    d: `M${n(x + w - HALF)} ${n(mid)}A${n(a)} ${n(a)} 0 0 ${sweep} ${n(x + w - r)} ${n(edge)}L${n(x + r)} ${n(edge)}A${n(a)} ${n(a)} 0 0 ${sweep} ${n(x + HALF)} ${n(mid)}`,
    length: 2 * quarter + Math.max(0, w - 2 * r),
    start: { x: x + w - HALF, y: mid },
    end: null,
  };
}
