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

/** The side of a card a rim runs along. */
export type Side = "left" | "right";

/** A rim's line: its path, its length, and its point and length along it nearest `near`. */
export interface RimLine {
  at: { x: number; y: number };
  d: string;
  length: number;
  /** How far along the line `at` stands, px. */
  s: number;
}

/**
 * The line a rim runs along on one side of a rounded box, `inset` px in:
 * round the side's corners on their own radius and straight between them.
 * Where something joins the side (`mouth`, the span of its edge the bridge
 * and its flare meet), the rim runs on the longer stretch either side of
 * it, from the mouth's end, so it flows out of the join and never through
 * it. `near` is the point it gathers at (the status dot): the point on its
 * straight run nearest it.
 */
export function rimLine(
  card: Rect,
  radii: Radii,
  side: Side,
  inset: number,
  near: { y: number },
  mouth: { from: number; to: number } | null
): RimLine {
  const { x, y, w, h } = card;
  const most = Math.max(0, Math.min(w, h) / 2);
  const [tl, tr, br, bl] = radii.map((r) => Math.max(inset, Math.min(r, most)));
  const edge = side === "left" ? x + inset : x + w - inset;
  const toward = side === "left" ? 1 : -1;
  const sweep = side === "left" ? 0 : 1;
  const r2 = (n: number) => n.toFixed(PRECISION);
  const quarter = (r: number) => (Math.PI / 2) * r;
  let arcTop = (side === "left" ? tl : tr) - inset;
  let arcFoot = (side === "left" ? bl : br) - inset;
  let runFrom = y + arcTop + inset;
  let runTo = Math.max(runFrom, y + h - arcFoot - inset);
  if (mouth) {
    const above = mouth.from - runFrom;
    const below = runTo - mouth.to;
    if (below >= above) {
      arcTop = 0;
      runFrom = Math.min(runTo, Math.max(runFrom, mouth.to));
    } else {
      arcFoot = 0;
      runTo = Math.max(runFrom, Math.min(runTo, mouth.from));
    }
  }
  const d = [
    arcTop > 0
      ? `M${r2(edge + toward * arcTop)} ${r2(y + inset)}A${r2(arcTop)} ${r2(arcTop)} 0 0 ${sweep} ${r2(edge)} ${r2(runFrom)}`
      : `M${r2(edge)} ${r2(runFrom)}`,
    `L${r2(edge)} ${r2(runTo)}`,
    arcFoot > 0
      ? `A${r2(arcFoot)} ${r2(arcFoot)} 0 0 ${sweep} ${r2(edge + toward * arcFoot)} ${r2(y + h - inset)}`
      : "",
  ].join("");
  const length = quarter(arcTop) + (runTo - runFrom) + quarter(arcFoot);
  const atY = Math.max(runFrom, Math.min(near.y, runTo));
  return {
    d,
    length,
    at: { x: edge, y: atY },
    s: quarter(arcTop) + (atY - runFrom),
  };
}
