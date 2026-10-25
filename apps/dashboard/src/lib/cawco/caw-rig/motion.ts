/**
 * The motion engine for living drawings: rossark-motion-skill's engine
 * (templates/react-native/motion.ts) on the web. Everything that moves is a
 * pure function of a clock's time in ms: keyframe tracks, flows through key
 * poses, and a few shaping helpers. One clock per drawing drives it on
 * requestAnimationFrame, and runs only while its drawing is on show.
 *
 * The curves are the house's (`--ease-in-out` travels, `--ease-out` opens
 * and arrives), from the one module every piece of JS motion reads.
 */
import { bezier, easeInOut, easeOut } from "#lib/cawco/motion/curves.svelte.js";

/** Things that travel: gaze, sway, a head turning, a lid closing. */
export const EASE_IN_OUT = easeInOut;
/** Things that open or arrive: a lid reopening, a prop appearing. */
export const EASE_OUT = easeOut;
/** Only things leaving or falling away; never what the eye waits on. */
export const EASE_IN = bezier(0.55, 0, 1, 0.45);

/** A keyframe: time (ms), value, and the curve of the segment arriving here (`out`, or ease-in-out). */
export type Key = readonly [number, number, "out"?];
export type Keys = readonly Key[];

/** A track's value at `t`. Its last key equals its first, so a loop never jumps. */
export function track(t: number, keys: Keys): number {
  const [first] = keys;
  if (!first || t <= first[0]) {
    return first ? first[1] : 0;
  }
  for (let i = 1; i < keys.length; i += 1) {
    const k1 = keys[i];
    if (t <= k1[0]) {
      const k0 = keys[i - 1];
      const span = k1[0] - k0[0];
      const p = span > 0 ? (t - k0[0]) / span : 1;
      const e = k1[2] === "out" ? EASE_OUT(p) : EASE_IN_OUT(p);
      return k0[1] + (k1[1] - k0[1]) * e;
    }
  }
  return keys.at(-1)?.[1] ?? 0;
}

/** A key pose for `flow`: time (ms) and value, sorted by time. */
export type FlowKey = readonly [number, number];

/**
 * A smooth track through key poses, for acting. `track` stops at every key;
 * `flow` passes through them with a continuous speed and never overshoots
 * one (a monotone cubic). Repeat a value to hold.
 */
export function flow(t: number, k: readonly FlowKey[]): number {
  const n = k.length;
  if (n === 0) {
    return 0;
  }
  if (t <= k[0][0]) {
    return k[0][1];
  }
  if (t >= k[n - 1][0]) {
    return k[n - 1][1];
  }
  let i = 0;
  while (k[i + 1][0] < t) {
    i += 1;
  }
  const slope = (j: number) =>
    (k[j + 1][1] - k[j][1]) / (k[j + 1][0] - k[j][0]);
  const tangent = (j: number) => {
    if (j === 0 || j === n - 1) {
      return 0;
    }
    const a = slope(j - 1);
    const b = slope(j);
    if (a * b <= 0) {
      return 0;
    }
    const h0 = k[j][0] - k[j - 1][0];
    const h1 = k[j + 1][0] - k[j][0];
    const w0 = 2 * h1 + h0;
    const w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / a + w1 / b);
  };
  const h = k[i + 1][0] - k[i][0];
  const s = (t - k[i][0]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * k[i][1] +
    (s3 - 2 * s2 + s) * h * tangent(i) +
    (-2 * s3 + 3 * s2) * k[i + 1][1] +
    (s3 - s2) * h * tangent(i + 1)
  );
}

/** 0 → 1 inside the window [a, b] of a clock (eased), 0 before it, 1 after: one beat. */
export function seg(
  t: number,
  a: number,
  b: number,
  curve: "out" | "inOut" = "out"
): number {
  if (t <= a) {
    return 0;
  }
  if (t >= b) {
    return 1;
  }
  const p = (t - a) / (b - a);
  return curve === "out" ? EASE_OUT(p) : EASE_IN_OUT(p);
}

/** A smooth back-and-forth from -1 to 1; `phase` (0 to 1) offsets one part from the next. */
export function wave(t: number, period: number, phase = 0): number {
  return Math.sin((t / period + phase) * Math.PI * 2);
}

/**
 * `wave` moved so it reads 0 at t = 0: idle life added to a pose leaves
 * frame 0 exactly the pose, whatever the phase. Still periodic.
 */
export function sway(t: number, period: number, phase = 0): number {
  return wave(t, period, phase) - wave(0, period, phase);
}

/** Progress through a loop, 0 to 1, with a phase (drifting, falling). */
export function loop(t: number, period: number, phase = 0): number {
  const p = (t / period + phase) % 1;
  return p < 0 ? p + 1 : p;
}

/** 0 at both ends of a loop and 1 in the middle: fade in and out. */
export function bell(p: number): number {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
}

/** A stable pseudo-random number in [0, 1) for item `i`: the same every frame. */
export function seeded(i: number, salt = 0): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43_758.5453;
  return x - Math.floor(x);
}

/** `t` folded into one loop of `period`, for reading a channel a moment earlier. */
export function within(t: number, period: number): number {
  const r = t % period;
  return r < 0 ? r + period : r;
}

/** A frame's longest step: a tab that stalls resumes where it was rather than leaping. */
const MAX_STEP = 64;

export interface ClockState {
  /** Frames drawn on requestAnimationFrame since the clock was made. */
  frames: number;
  /** Held by a probe at a sought time. */
  held: boolean;
  /** Running now: on screen, tab shown, motion allowed, not held. */
  live: boolean;
  /** Motion allowed (the reader has not asked for less). */
  motion: boolean;
  onScreen: boolean;
  /** The loop's time, ms, 0 to the period. */
  t: number;
  tabShown: boolean;
}

/**
 * One drawing's clock: a loop of `period` ms for its idle life. It runs on
 * requestAnimationFrame only while its drawing is on screen
 * (IntersectionObserver), the tab is shown and motion is allowed; anything
 * else cancels its frame, so nothing runs unseen. With reduced motion it
 * stands at 0, where the drawing is its frame-0 pose. Each frame it calls
 * `draw(t, dt)`: the loop's time and the step since the last frame (0 when
 * the time was set rather than run).
 */
export class LoopClock {
  readonly state: ClockState = {
    frames: 0,
    held: false,
    live: false,
    motion: true,
    onScreen: false,
    t: 0,
    tabShown: true,
  };
  #period: number;
  readonly #draw: (t: number, dt: number) => void;
  #raf = 0;
  #last = 0;
  #observer: IntersectionObserver | undefined;
  #media: MediaQueryList | undefined;
  readonly #onVisibility = () => {
    this.state.tabShown = document.visibilityState === "visible";
    this.#sync();
  };
  readonly #onMotion = () => {
    this.state.motion = !this.#media?.matches;
    if (!this.state.motion) {
      this.state.t = 0;
      this.#draw(0, 0);
    }
    this.#sync();
  };

  /**
   * `start`: where in the loop this clock begins (ms), so drawings that share
   * a screen breathe and blink out of phase; with reduced motion it is 0.
   */
  constructor(
    period: number,
    draw: (t: number, dt: number) => void,
    start = 0
  ) {
    this.#period = period;
    this.state.t = within(start, period);
    this.#draw = draw;
  }

  get period(): number {
    return this.#period;
  }

  /** A new loop length (another idle profile): the time keeps its share of the loop. */
  set period(next: number) {
    this.state.t = (this.state.t / this.#period) * next;
    this.#period = next;
  }

  /** Starts watching `el`: on screen, the tab, and the reader's motion setting. */
  watch(el: Element): () => void {
    this.#media = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.#media.addEventListener("change", this.#onMotion);
    this.state.motion = !this.#media.matches;
    if (!this.state.motion) {
      this.state.t = 0;
    }
    document.addEventListener("visibilitychange", this.#onVisibility);
    this.state.tabShown = document.visibilityState === "visible";
    this.#observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (entry) {
        this.state.onScreen = entry.isIntersecting;
        this.#sync();
      }
    });
    this.#observer.observe(el);
    this.#draw(this.state.t, 0);
    return () => this.stop();
  }

  stop(): void {
    this.#observer?.disconnect();
    this.#media?.removeEventListener("change", this.#onMotion);
    document.removeEventListener("visibilitychange", this.#onVisibility);
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.state.live = false;
  }

  /** Holds the clock at `t` (ms into the loop) and draws that frame: a probe's seek. */
  seek(t: number): void {
    this.state.held = true;
    this.state.t = t;
    this.#sync();
    this.#draw(t, 0);
  }

  /** Lets a held clock run on from where it was held. */
  release(): void {
    this.state.held = false;
    this.#sync();
  }

  /** Draws the current frame again (a pose or scheme changed while nothing runs). */
  redraw(): void {
    this.#draw(this.state.motion ? this.state.t : 0, 0);
  }

  #sync(): void {
    const s = this.state;
    const live = s.onScreen && s.tabShown && s.motion && !s.held;
    if (live === s.live) {
      return;
    }
    s.live = live;
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    if (live) {
      this.#last = performance.now();
      this.#raf = requestAnimationFrame(this.#tick);
    }
  }

  readonly #tick = (now: number) => {
    const dt = Math.min(MAX_STEP, Math.max(0, now - this.#last));
    this.#last = now;
    this.state.t = within(this.state.t + dt, this.#period);
    this.state.frames += 1;
    this.#draw(this.state.t, dt);
    if (this.state.live) {
      this.#raf = requestAnimationFrame(this.#tick);
    }
  };
}
