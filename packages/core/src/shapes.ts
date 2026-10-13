/**
 * A stroke held still at its end, read as the shape it was drawn as
 * (Projects spec §5.10; DESIGN.md, Artifact panel, canvas and ink: "Pen
 * rules on the canvas"): a line, an arrow, a rectangle, an ellipse or a
 * triangle, on the stroke's own box; null when it is none of them well
 * enough, and the stroke stays as drawn.
 *
 * Deterministic and small, our own: the stroke is resampled to evenly
 * spaced points; an open one is a line when it keeps close to its chord,
 * an arrow when a line folds back at its far end; a closed one is read by
 * its corners (Douglas-Peucker) as a triangle or a rectangle, and against
 * the ellipse in its box; the best fit wins. Every threshold is in
 * {@link SHAPE_THRESHOLDS}.
 */

/** Every number the recogniser decides by, our own calls. */
export const SHAPE_THRESHOLDS = {
  /** Points the stroke is resampled to, evenly spaced along it. */
  samples: 64,
  /** Closed: its end lies within this share of its box's diagonal from its start. */
  closedGap: 0.12,
  /** A line: no point strays from the chord by more than this share of the chord. */
  lineDeviation: 0.08,
  /** An arrow's head: the points after its far point, at most this share of the stroke's. */
  headShare: 0.2,
  /** An arrow's head: at least this many resampled points after its far point. */
  headPoints: 3,
  /** An arrow's barbs (one or two, each from the tip): their angle to the shaft folded back, degrees. */
  barbMin: 20,
  barbMax: 70,
  /** A barb's corners: Douglas-Peucker's tolerance, as a share of the shaft. */
  barbTolerance: 0.02,
  /** Corners: Douglas-Peucker's tolerance, as a share of the box's diagonal. */
  cornerTolerance: 0.1,
  /** A corner that turns by less than this is no corner, degrees. */
  straight: 150,
  /** A rectangle's corners: each between these, degrees. */
  rightMin: 70,
  rightMax: 110,
  /** A closed fit (rectangle, ellipse, triangle): its mean error at most this share of the half-size. */
  closedError: 0.1,
  /** A fit whose confidence (1 minus its error) is under this is no shape. */
  minConfidence: 0.6,
} as const;

export type ShapeType = "line" | "arrow" | "rectangle" | "ellipse" | "triangle";

type Point = [x: number, y: number];

export interface Recognised {
  box: { height: number; width: number; x: number; y: number };
  /** 1 minus the fit's normalised error. */
  confidence: number;
  /** A line's or arrow's two ends, a triangle's three corners, in the stroke's coordinates. */
  points?: Point[];
  type: ShapeType;
}

const T = SHAPE_THRESHOLDS;

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The distance from `p` to the segment `a`–`b`. */
const toSegment = (p: Point, a: Point, b: Point) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)
        );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

/** `points` resampled to `n` points evenly spaced along the path. */
const resample = (points: Point[], n: number): Point[] => {
  const total = points.reduce(
    (sum, p, i) => (i === 0 ? 0 : sum + dist(points[i - 1], p)),
    0
  );
  if (total === 0) {
    return [points[0]];
  }
  const step = total / (n - 1);
  const out: Point[] = [points[0]];
  let carried = 0;
  for (let i = 1; i < points.length && out.length < n; i += 1) {
    let a = points[i - 1];
    const b = points[i];
    let seg = dist(a, b);
    while (carried + seg >= step && out.length < n) {
      const t = (step - carried) / seg;
      const p: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      out.push(p);
      a = p;
      seg = dist(a, b);
      carried = 0;
    }
    carried += seg;
  }
  while (out.length < n) {
    out.push(points.at(-1) as Point);
  }
  return out;
};

const boxOf = (points: Point[]) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/** Douglas-Peucker: the points of `path` that stand more than `tolerance` off the line between their neighbours kept. */
const simplify = (path: Point[], tolerance: number): Point[] => {
  if (path.length < 3) {
    return path;
  }
  const [first] = path;
  const last = path.at(-1) as Point;
  let far = 0;
  let at = 0;
  for (let i = 1; i < path.length - 1; i += 1) {
    const d = toSegment(path[i], first, last);
    if (d > far) {
      far = d;
      at = i;
    }
  }
  if (far <= tolerance) {
    return [first, last];
  }
  return [
    ...simplify(path.slice(0, at + 1), tolerance).slice(0, -1),
    ...simplify(path.slice(at), tolerance),
  ];
};

/** The angle at `b` between `a` and `c`, degrees: 180 is straight on. */
const angleAt = (a: Point, b: Point, c: Point) => {
  const u = [a[0] - b[0], a[1] - b[1]];
  const v = [c[0] - b[0], c[1] - b[1]];
  const cos =
    (u[0] * v[0] + u[1] * v[1]) /
    (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};

/** The angle between two directions, degrees, 0 to 180. */
const between = (u: Point, v: Point) =>
  angleAt([u[0], u[1]], [0, 0], [v[0], v[1]]);

/** A line: the chord from start to end, when no point strays far from it; its error the furthest stray over the chord. */
const lineFit = (path: Point[]): { error: number } | null => {
  const [a] = path;
  const b = path.at(-1) as Point;
  const chord = dist(a, b);
  if (chord === 0) {
    return null;
  }
  const error = Math.max(...path.map((p) => toSegment(p, a, b))) / chord;
  return error <= T.lineDeviation ? { error } : null;
};

/** An open stroke: an arrow (a line whose far end folds back into a barb or two), else a line. */
const openShape = (path: Point[]): Recognised | null => {
  const arrow = arrowShape(path);
  if (arrow) {
    return arrow;
  }
  const line = lineFit(path);
  return line
    ? {
        type: "line",
        box: boxOf([path[0], path.at(-1) as Point]),
        points: [path[0], path.at(-1) as Point],
        confidence: 1 - line.error,
      }
    : null;
};

/** An arrow: a straight shaft to the point farthest from the start, then a short head that folds back. */
const arrowShape = (path: Point[]): Recognised | null => {
  let tip = 0;
  for (let i = 1; i < path.length; i += 1) {
    if (dist(path[0], path[i]) > dist(path[0], path[tip])) {
      tip = i;
    }
  }
  const head = path.slice(tip);
  if (
    head.length - 1 < T.headPoints ||
    head.length / path.length > T.headShare
  ) {
    return null;
  }
  const shaft = path.slice(0, tip + 1);
  const fit = lineFit(shaft);
  if (!fit) {
    return null;
  }
  const tipAt = shaft.at(-1) as Point;
  const length = dist(shaft[0], tipAt);
  const back: Point = [shaft[0][0] - tipAt[0], shaft[0][1] - tipAt[1]];
  // The head's legs: a barb leaves the tip; a leg back to it, between two
  // barbs, is no barb.
  const legs = simplify(head, T.barbTolerance * length);
  const barbs = legs
    .slice(1)
    .map((end, i): [Point, Point] => [legs[i], end])
    .filter(([from, to]) => dist(from, tipAt) < dist(to, tipAt));
  if (
    barbs.length === 0 ||
    barbs.length > 2 ||
    barbs.some(([from, to]) => {
      const angle = between([to[0] - from[0], to[1] - from[1]], back);
      return angle < T.barbMin || angle > T.barbMax;
    })
  ) {
    return null;
  }
  const ends: Point[] = [shaft[0], tipAt];
  return {
    type: "arrow",
    box: boxOf(ends),
    points: ends,
    confidence: 1 - fit.error,
  };
};

/** The corners of a closed path: Douglas-Peucker's points, its closing one dropped, those that barely turn left out. */
const cornersOf = (path: Point[], diagonal: number): Point[] => {
  const kept = simplify(path, T.cornerTolerance * diagonal).slice(0, -1);
  return kept.filter((p, i) => {
    const prev = kept[(i - 1 + kept.length) % kept.length];
    const next = kept[(i + 1) % kept.length];
    return angleAt(prev, p, next) < T.straight;
  });
};

/** The mean distance from the path to the polygon `corners`, as a share of the box's half-size. */
const polygonError = (path: Point[], corners: Point[], half: number) =>
  path.reduce(
    (sum, p) =>
      sum +
      Math.min(
        ...corners.map((c, i) =>
          toSegment(p, c, corners[(i + 1) % corners.length])
        )
      ),
    0
  ) /
  path.length /
  half;

/** A closed stroke: the best of the triangle, the rectangle and the ellipse that fit it. */
const closedShape = (path: Point[]): Recognised | null => {
  const box = boxOf(path);
  const diagonal = Math.hypot(box.width, box.height);
  const half = Math.min(box.width, box.height) / 2;
  if (half === 0) {
    return null;
  }
  const corners = cornersOf(path, diagonal);
  const fits: Recognised[] = [];
  if (corners.length === 3) {
    const error = polygonError(path, corners, half);
    if (error <= T.closedError) {
      fits.push({
        type: "triangle",
        box,
        points: corners,
        confidence: 1 - error,
      });
    }
  }
  if (
    corners.length === 4 &&
    corners.every((c, i) => {
      const angle = angleAt(corners[(i + 3) % 4], c, corners[(i + 1) % 4]);
      return angle >= T.rightMin && angle <= T.rightMax;
    })
  ) {
    const rect: Point[] = [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x + box.width, box.y + box.height],
      [box.x, box.y + box.height],
    ];
    const error = polygonError(path, rect, half);
    if (error <= T.closedError) {
      fits.push({ type: "rectangle", box, confidence: 1 - error });
    }
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radial =
    path.reduce(
      (sum, [x, y]) =>
        sum +
        Math.abs(
          Math.hypot((x - cx) / (box.width / 2), (y - cy) / (box.height / 2)) -
            1
        ),
      0
    ) / path.length;
  if (radial <= T.closedError) {
    fits.push({ type: "ellipse", box, confidence: 1 - radial });
  }
  return fits.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
};

/**
 * The shape a stroke was drawn as, on its own box, in its own coordinates;
 * null when it fits none well enough (it stays as drawn).
 */
export function recognise(points: Point[]): Recognised | null {
  if (points.length < 2) {
    return null;
  }
  const path = resample(points, T.samples);
  const box = boxOf(path);
  const diagonal = Math.hypot(box.width, box.height);
  if (diagonal === 0) {
    return null;
  }
  const closed = dist(path[0], path.at(-1) as Point) <= T.closedGap * diagonal;
  const found = closed ? closedShape(path) : openShape(path);
  return found && found.confidence >= T.minConfidence ? found : null;
}
