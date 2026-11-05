/**
 * How a thing in the air looks while the hand holds it: the part of a drag
 * dnd kit leaves to the app. dnd kit's Feedback plugin carries the thing
 * itself (lifted into the top layer, following the pointer on `translate`,
 * flown home on the drop); this gives it its weight.
 *
 * - Picked up, it lifts off its place: it grows to --drag-lift-scale and
 *   casts shadow-overlay under it, over --dur-pick-up on the ease-out curve.
 * - Carried sideways, it leans into the travel, about the point the hand
 *   took it by, by --drag-tilt-gain degrees per px/ms up to --drag-tilt-max,
 *   and springs upright as the hand slows: the house spring (motion/spring,
 *   --dur-settle), stepped every frame toward the lean the hand's speed asks.
 * - Let go, it settles back to its own size and shadow and stands upright
 *   over the drop's flight (--dur-panel, ease-drawer), the same clock dnd
 *   kit flies it home on.
 *
 * A card carried into another column is drawn again there, and dnd kit
 * carries the new element from then on (`follow`): it takes the lift as it
 * stands, with no second pick-up.
 *
 * Where the reader asked for less motion it neither grows nor leans: the
 * shadow alone says it is in the hand, on and off at once.
 *
 * Feedback writes `translate` (and `transform`) as important and turns
 * the thing's transitions off while it is in the air, so this moves only
 * what Feedback leaves alone: `scale` and `box-shadow` by the Web Animations
 * API, which a transition of the thing's own could not reach, and `rotate`
 * written each frame.
 */
import { dur, ease, motionOk, numberOf } from "../motion/curves.svelte";
import { springForces } from "../motion/spring";

/** Velocity samples older than this say nothing about the hand now, in ms. */
const VELOCITY_WINDOW = 80;
/** Upright within this, in degrees, and as slow as this, in deg/s: at rest. */
const REST_ANGLE = 0.01;
const REST_SPIN = 0.5;
const FLAT = "0 0 0 0 transparent";

/**
 * What casts the shadow: the part of the thing marked `data-drag-face`
 * (a board card inside its row), so the shadow takes the card's rounded
 * shape, never the square box around it; else the thing itself.
 */
const faceOf = (element: HTMLElement): HTMLElement =>
  element.querySelector<HTMLElement>("[data-drag-face]") ?? element;

export interface Lifted {
  /** What it lifted, and carries the lift now. */
  readonly element: HTMLElement;
  /** dnd kit carries `element` now (the thing drawn again elsewhere): it takes the lift as it stands. */
  follow: (element: HTMLElement) => void;
  /** Let go: it settles to its place's look. Resolves once it has. */
  land: () => Promise<void>;
  /** The hand moved to `x` (client px). */
  move: (x: number) => void;
}

/**
 * Lifts `first`, taken by the hand at client point `grab`. The thing dnd
 * kit carries is the element itself, so what is written here comes off
 * with the landing.
 */
export function lift(
  first: HTMLElement,
  grab: { x: number; y: number }
): Lifted {
  const moving = motionOk.current;
  const big = moving ? String(numberOf("--drag-lift-scale")) : "1";
  const shadow = getComputedStyle(first)
    .getPropertyValue("--shadow-overlay")
    .trim();
  const rect = first.getBoundingClientRect();
  // It leans about where the hand holds it, as a card held by its corner does.
  const origin = `${grab.x - rect.left}px ${grab.y - rect.top}px`;

  let element = first;
  let up: Animation[] = [];
  /** The lift on `target`, from its place (a pick-up) or standing (a thing drawn again). */
  const hold = (target: HTMLElement, pickUp: boolean) => {
    target.style.transformOrigin = origin;
    const timing: KeyframeAnimationOptions = {
      duration: pickUp && moving ? dur("--dur-pick-up") : 0,
      easing: ease("--ease-out"),
      fill: "forwards",
    };
    up = [
      target.animate([{ scale: pickUp ? "1" : big }, { scale: big }], timing),
      faceOf(target).animate(
        [{ boxShadow: pickUp ? FLAT : shadow }, { boxShadow: shadow }],
        timing
      ),
    ];
  };
  hold(first, true);

  const gain = numberOf("--drag-tilt-gain");
  const most = numberOf("--drag-tilt-max");
  const { stiffness, damping } = springForces();
  let samples: { x: number; t: number }[] = [];
  let angle = 0;
  let spin = 0;
  let last = performance.now();
  let frame = 0;
  let landing = false;

  /** The hand's sideways speed now, px/ms: none once it has stood still a while. */
  const speed = (now: number): number => {
    samples = samples.filter((one) => now - one.t <= VELOCITY_WINDOW);
    const [oldest] = samples;
    const newest = samples.at(-1);
    if (!(oldest && newest) || newest.t === oldest.t) {
      return 0;
    }
    return (newest.x - oldest.x) / (newest.t - oldest.t);
  };

  /** One step of the spring toward the lean the hand asks, written as `rotate`. */
  const step = (now: number) => {
    // A frame's time can stand before the clock this started on: never a step back.
    const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 30));
    last = now;
    const target = landing
      ? 0
      : Math.max(-most, Math.min(most, speed(now) * gain));
    const a = -stiffness * (angle - target) - damping * spin;
    spin += a * dt;
    angle += spin * dt;
    const still =
      Math.abs(angle - target) < REST_ANGLE && Math.abs(spin) < REST_SPIN;
    if (still) {
      angle = target;
      spin = 0;
    }
    element.style.rotate = angle === 0 ? "" : `${angle}deg`;
    return still && target === 0;
  };

  let settled: () => void = () => undefined;
  const upright = new Promise<void>((resolve) => {
    settled = resolve;
  });
  const tick = (now: number) => {
    const rested = step(now);
    if (landing && rested) {
      settled();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  if (moving) {
    frame = requestAnimationFrame(tick);
  } else {
    settled();
  }

  /** What this wrote on `target`, gone. */
  const clear = (target: HTMLElement) => {
    target.style.removeProperty("rotate");
    target.style.removeProperty("transform-origin");
  };

  return {
    get element() {
      return element;
    },
    follow(next) {
      if (next === element) {
        return;
      }
      for (const run of up) {
        run.cancel();
      }
      clear(element);
      element = next;
      hold(next, false);
    },
    move(x) {
      samples.push({ x, t: performance.now() });
    },
    async land() {
      landing = true;
      const timing: KeyframeAnimationOptions = {
        duration: moving ? dur("--dur-panel") : 0,
        easing: ease("--ease-drawer"),
        fill: "forwards",
      };
      const down = [
        element.animate(
          [{ scale: getComputedStyle(element).scale }, { scale: "1" }],
          timing
        ),
        faceOf(element).animate(
          [{ boxShadow: shadow }, { boxShadow: FLAT }],
          timing
        ),
      ];
      for (const run of up) {
        run.cancel();
      }
      await Promise.all([
        ...down.map((run) => run.finished.catch(() => undefined)),
        upright,
      ]);
      cancelAnimationFrame(frame);
      for (const run of down) {
        run.cancel();
      }
      clear(element);
    },
  };
}
