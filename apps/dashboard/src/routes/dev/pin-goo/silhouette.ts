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
import { taperInk } from "#lib/components/ui/fluid-tabs/fold-path.js";

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

/** A point and the outward normal there. */
interface Along {
  nx: number;
  ny: number;
  x: number;
  y: number;
}

/**
 * The pin's own outline `inset` px in from its edge round its far end, as
 * a function of the distance along it, and its length. A round end
 * (`left`, `right`) is its half-circle from its top to its foot; a long
 * side (`top`, `bottom`) runs round both its corners from one end's middle
 * to the other's.
 */
function farLine(
  pin: Rect,
  far: FarEnd,
  inset: number
): { at: (s: number) => Along; length: number } {
  const { x, y, w, h } = pin;
  const r = Math.min(w, h) / 2;
  const a = r - inset;
  const turn = (ox: number, oy: number, angle: number): Along => ({
    x: ox + a * Math.cos(angle),
    y: oy + a * Math.sin(angle),
    nx: Math.cos(angle),
    ny: Math.sin(angle),
  });
  if (far === "left" || far === "right") {
    const cx = far === "left" ? x + r : x + w - r;
    const way = far === "left" ? -1 : 1;
    return {
      length: Math.PI * a,
      at: (s) => turn(cx, y + r, -Math.PI / 2 + (way * s) / a),
    };
  }
  const quarter = (Math.PI / 2) * a;
  const run = Math.max(0, w - 2 * r);
  const way = far === "top" ? -1 : 1;
  const cy = far === "top" ? y + r : y + h - r;
  const edge = far === "top" ? y + inset : y + h - inset;
  return {
    length: 2 * quarter + run,
    at: (s) => {
      if (s <= quarter) {
        return turn(x + w - r, cy, (way * s) / a);
      }
      if (s <= quarter + run) {
        return { x: x + w - r - (s - quarter), y: edge, nx: 0, ny: way };
      }
      return turn(x + r, cy, way * (Math.PI / 2 + (s - quarter - run) / a));
    },
  };
}

/** Points a rim's trace is sampled at along its span; also its taper gradient's stops. */
export const RIM_POINTS = 49;

/** A pin's rim as drawn: its trace on the pin's edge, and its taper as a gradient on x. */
export interface Rim {
  d: string;
  /** The middle of the far end, where the status dot slides in. */
  mid: { x: number; y: number };
  /** The taper's stops, as `taperStops` gives a folder tab's: the ink at each offset of the gradient from `x1` to `x2`. */
  stops: { ink: number; offset: number }[];
  x1: number;
  x2: number;
}

/**
 * A pin's rim round its far end, a folder tab's rim on a pin (TabItem,
 * fold-path): the pin's own edge traced `spread` of the way out from the
 * end's middle toward both tips (0 to 1), for a stroke twice the rim's
 * width clipped inside the pin, and its taper as a gradient: at each point,
 * the ink `taperInk` gives for its distance along the stroke's middle (half
 * the rim's width in) from the nearer tip. Round a round end both halves
 * stand at the same x for the same distance, and along a long side x runs
 * one way, so one gradient on x carries the taper, as a tab's gradient on
 * its height does.
 */
export function rimTrace(
  pin: Rect,
  far: FarEnd,
  spread: number,
  rim: { ease: number; taper: number; width: number }
): Rim {
  const edge = farLine(pin, far, 0);
  const middle = farLine(pin, far, rim.width / 2).length / edge.length;
  const half = edge.length / 2;
  const reach = half * Math.max(0, Math.min(1, spread));
  const n = (v: number) => v.toFixed(PRECISION);
  const points: { ink: number; x: number }[] = [];
  const trace: string[] = [];
  for (let i = 0; i < RIM_POINTS; i += 1) {
    const u = i / (RIM_POINTS - 1);
    const along = 2 * reach * u;
    const p = edge.at(half - reach + along);
    trace.push(`${n(p.x)} ${n(p.y)}`);
    const fromTip = Math.min(along, 2 * reach - along) * middle;
    points.push({ x: p.x, ink: taperInk(fromTip, rim.taper, rim.ease) });
  }
  points.sort((a, b) => a.x - b.x);
  const x1 = points[0]?.x ?? 0;
  const x2 = Math.max(x1 + 0.01, points.at(-1)?.x ?? 0);
  const mid = edge.at(half);
  return {
    d: `M${trace.join(" ")}`,
    stops: points.map((one) => ({
      offset: (one.x - x1) / (x2 - x1),
      ink: one.ink,
    })),
    mid: { x: mid.x, y: mid.y },
    x1,
    x2,
  };
}
