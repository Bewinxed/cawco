/**
 * A CSS `cubic-bezier()` as a function of progress, for motion a stylesheet
 * cannot reach: the dashboard's JS-driven curves (motion/curves.svelte.ts)
 * and the design graph's curve drawings (design-graph.ts `curvePoints`).
 */

/** A CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress. */
export function bezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  /** The curve parameter whose x is `x`: Newton, then bisection. */
  const solve = (x: number) => {
    let s = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < 1e-6) {
        return s;
      }
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) {
        break;
      }
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (hi - lo > 1e-6) {
      if (sampleX(s) < x) {
        lo = s;
      } else {
        hi = s;
      }
      s = (lo + hi) / 2;
    }
    return s;
  };
  return (t: number) => {
    if (t <= 0) {
      return 0;
    }
    return t >= 1 ? 1 : sampleY(solve(t));
  };
}
