/**
 * The settle every hand-driven surface lands on: the tab swipe, the phone's
 * group deck, and anything else a finger lets go of. One spring, so a tab and
 * a group and a sheet all arrive the same way.
 *
 * In Apple's terms it is a perceptual duration and a bounce. No bounce: a
 * dashboard is crisp, and something that wobbles into place keeps moving
 * after the reader has stopped. A flick can still carry it a hair past and
 * back, which is the finger's doing, not the spring's.
 *
 * The motion is integrated once, at release, and handed to the compositor as
 * keyframes (`spring`), so it plays at the display's rate whatever the main
 * thread is doing. The path is kept, so whoever stops it part-way can read
 * where it had got to off the animation's clock (`sampleAt`).
 */

/** The perceptual duration, in seconds. */
export const SETTLE = 0.4;
export const BOUNCE = 0;

const MASS = 1;
const STIFFNESS = ((2 * Math.PI) / SETTLE) ** 2;
const DAMPING = (4 * Math.PI * (1 - BOUNCE)) / SETTLE;
/**
 * The settle is integrated at this step, in seconds, for at most this long,
 * and thinned to keyframes about this far apart, in ms. At 120Hz a step is
 * already a frame on the fastest phone, so the thinning mostly keeps all.
 */
const STEP = 1 / 120;
const MAX_SETTLE = 1.5;
const KEYFRAME_MS = 8;

/** One point of the settle: seconds since release, px from rest, px/s. */
export interface Sample {
  t: number;
  v: number;
  x: number;
}

/**
 * The settle from `x0` px away from rest, moving at `v0` px/s, to rest at 0.
 * Always at least two points, the last exactly at rest.
 */
export function integrate(x0: number, v0: number): Sample[] {
  const out: Sample[] = [{ t: 0, x: x0, v: v0 }];
  let x = x0;
  let v = v0;
  let t = 0;
  for (;;) {
    const a = (-STIFFNESS * x - DAMPING * v) / MASS;
    v += a * STEP;
    x += v * STEP;
    t += STEP;
    const done = (Math.abs(x) < 0.5 && Math.abs(v) < 20) || t >= MAX_SETTLE;
    out.push(done ? { t, x: 0, v: 0 } : { t, x, v });
    if (done) {
      return out;
    }
  }
}

/**
 * Plays a path from `integrate` on the compositor, one animation per
 * element: linear between points, so the curve is the spring's own, and held
 * at its last keyframe until the caller hands the element back. `frame` says
 * what the element looks like at a given distance from rest — its own
 * parking place plus `x`.
 */
export function spring(
  path: Sample[],
  targets: ReadonlyArray<{ el: Element; frame: (x: number) => Keyframe }>
): Animation[] {
  // biome-ignore lint/style/useAtIndex: integrate() always returns at least one point; .at(-1) would widen this to undefined
  const duration = path[path.length - 1].t;

  const kept: Sample[] = [path[0]];
  for (let i = 1; i < path.length - 1; i += 1) {
    // biome-ignore lint/style/useAtIndex: kept is never empty (seeded above); .at(-1) would widen to undefined
    if ((path[i].t - kept[kept.length - 1].t) * 1000 >= KEYFRAME_MS) {
      kept.push(path[i]);
    }
  }
  // biome-ignore lint/style/useAtIndex: integrate() always returns at least one point; .at(-1) would widen to undefined, and push() needs a Sample
  kept.push(path[path.length - 1]);

  return targets.map(({ el, frame }) =>
    el.animate(
      kept.map((sample) => ({
        ...frame(sample.x),
        offset: sample.t / duration,
      })),
      { duration: duration * 1000, easing: "linear", fill: "forwards" }
    )
  );
}

/** Where a path is `seconds` after release, between its points. */
export function sampleAt(path: Sample[], seconds: number): Sample {
  const i = path.findIndex((sample) => sample.t >= seconds);
  if (i < 0) {
    // biome-ignore lint/style/useAtIndex: path is never empty (integrate() returns at least two points); .at(-1) would widen the return to Sample | undefined
    return path[path.length - 1];
  }
  if (i === 0) {
    return path[0];
  }
  const a = path[i - 1];
  const b = path[i];
  const f = (seconds - a.t) / (b.t - a.t);
  return { t: seconds, x: a.x + (b.x - a.x) * f, v: a.v + (b.v - a.v) * f };
}
