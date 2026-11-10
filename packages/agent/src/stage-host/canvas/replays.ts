/**
 * A move's replays on the stage (the design graph's Animation face, core
 * stage-graph.ts): every animation a reach set off, drawn again from its own
 * frames on its own element, as the person's tuning times it, so the face's
 * playhead stands the drawing at any moment of the move and Play plays it
 * again. The engine's own animation is gone once it ends (a transition's,
 * Svelte's), so each replay is made anew from what the reach read of it.
 *
 * The page is the move's clock: a play says its time as it starts, at each
 * wrap and at its end ({@link Replays.play}'s `told`), and the panel's
 * readout runs from those words. A replay held mid-way stands paused at
 * its moment; let go, it is cancelled and the drawing is the kept state as
 * it stands. A reached state is never held at its move's first frame: a
 * reach makes no replay, only a play or a scrub does.
 */
import "./window-events";
import {
  type ClipRead,
  type ClipRepeat,
  type ClipValue,
  clipEnd,
  STAGE_LET_GO,
  STAGE_PAUSE,
  STAGE_PLAY,
  STAGE_RETIME,
  STAGE_RING,
  STAGE_SEEK,
  type StageTime,
  stageLetGoOf,
  stagePauseOf,
  stagePlayOf,
  stageRetimeOf,
  stageRingOf,
  stageSeekOf,
  type Tuning,
} from "@cawco/core/stage-graph";

/** The id every replay carries (Web Animations' `Animation.id`): a read of the page tells the replays from the component's own animations. */
export const REPLAY_ID = "cawco-replay";

/** One clip of the move the page last read: what the face names, its element and its frames as first seen. */
export interface Held {
  keyframes: Keyframe[];
  read: ClipRead;
  target: Element | null;
}

const MOTION_KEYS = new Set([
  "offset",
  "computedOffset",
  "easing",
  "composite",
]);
const UPPER = /[A-Z]/gu;
const HYPHENED = /-([a-z])/gu;
const PLAIN_FIGURE = /^(-?\d*\.?\d+)([a-z%]*)$/u;

/** A frame's key as CSS names it (`backgroundColor` → `background-color`; a custom property as it is). */
const cssName = (key: string): string =>
  key.startsWith("--") ? key : key.replace(UPPER, (c) => `-${c.toLowerCase()}`);

/** A CSS property as a frame's key names it. */
const frameKey = (property: string): string =>
  property.startsWith("--")
    ? property
    : property.replace(HYPHENED, (_, c: string) => c.toUpperCase());

/** A frame's own properties, its timing keys left out. */
const ownKeys = (frame: Keyframe | undefined): string[] =>
  Object.keys(frame ?? {}).filter((key) => !MOTION_KEYS.has(key));

/** A frame's value of `key` that is one plain number, with or without its unit; null for any other. */
const figureIn = (frame: Keyframe, key: string): number | null => {
  const raw = frame[key];
  const said = typeof raw === "number" ? String(raw) : raw;
  const plain =
    typeof said === "string" ? said.trim().match(PLAIN_FIGURE) : null;
  return plain ? Number(plain[1]) : null;
};

/** Whether a clip's curve lives in its frames: a linear timing over three or more frames that are each linear (a Svelte transition's), never an author's legs, each eased. */
export const framedOf = (easing: string, keyframes: readonly Keyframe[]) =>
  easing === "linear" &&
  keyframes.length > 2 &&
  keyframes.every((frame) => (frame.easing ?? "linear") === "linear");

/**
 * A curve kept in a clip's frames, as its progress: the first property
 * whose frames are all one plain number, each frame's offset and its share
 * of the way from the first frame's value to the last's.
 */
export function frameCurveOf(
  keyframes: readonly Keyframe[]
): [number, number][] | null {
  const [first] = keyframes;
  const last = keyframes.at(-1);
  if (!(first && last) || keyframes.length < 2) {
    return null;
  }
  for (const key of ownKeys(first)) {
    const from = figureIn(first, key);
    const to = figureIn(last, key);
    if (from === null || to === null || from === to) {
      continue;
    }
    const figures = keyframes.flatMap((frame) => figureIn(frame, key) ?? []);
    if (figures.length !== keyframes.length) {
      continue;
    }
    return keyframes.map((frame, at) => [
      typeof frame.computedOffset === "number"
        ? frame.computedOffset
        : at / (keyframes.length - 1),
      ((figures[at] ?? from) - from) / (to - from),
    ]);
  }
  return null;
}

/** What a clip animates between, per property: its first frame's value and its last's. */
export const valuesOf = (keyframes: readonly Keyframe[]): ClipValue[] => {
  const [first] = keyframes;
  const last = keyframes.at(-1);
  if (!(first && last)) {
    return [];
  }
  return ownKeys(first).map((key) => ({
    property: cssName(key),
    from: String(first[key] ?? ""),
    to: String(last[key] ?? ""),
  }));
};

/** Its legs: the offsets of the frames between its first and its last, for a clip whose curve is not kept in its frames. */
export const legsOf = (
  keyframes: readonly Keyframe[],
  framed: boolean
): number[] =>
  framed || keyframes.length < 3
    ? []
    : keyframes
        .slice(1, -1)
        .map((frame, at) =>
          typeof frame.computedOffset === "number"
            ? frame.computedOffset
            : (at + 1) / (keyframes.length - 1)
        );

/** The units a custom property's figures may carry, and the syntax each registers it under. */
const SYNTAX: Record<string, string> = {
  "": "<number>",
  "%": "<percentage>",
  deg: "<angle>",
  turn: "<angle>",
  rad: "<angle>",
  ms: "<time>",
  s: "<time>",
};
const LENGTH_UNITS = /^(px|r?em|ch|ex|vw|vh|vmin|vmax|cq[iwhb]|dvh|svh|lvh)$/u;
/** Custom properties this page registered, or found registered. */
const registered = new Set<string>();

/**
 * A custom property an authored clip animates on the drawing's root, its
 * frames all one figure in one unit, registered as that type (CSS
 * Properties and Values, `CSS.registerProperty`), inheriting, so the engine
 * interpolates it as it runs, never stepping it at half-way: a mockup binds
 * any element of the drawing to its live value with `var(--name)`. One the
 * author registered with `@property` stays as written. The caller asks it
 * only of the drawing's root: a component's own animation on an element of
 * its own is never touched, so the stage draws it as it runs anywhere.
 */
export function interpolated(keyframes: readonly Keyframe[]): void {
  const [first] = keyframes;
  for (const key of ownKeys(first)) {
    if (!key.startsWith("--") || registered.has(key)) {
      continue;
    }
    registered.add(key);
    const units = new Set(
      keyframes.map((frame) => {
        const said = String(frame[key] ?? "").trim();
        return said.match(PLAIN_FIGURE)?.[2] ?? null;
      })
    );
    const [unit] = [...units];
    const syntax =
      units.size === 1 && typeof unit === "string"
        ? (SYNTAX[unit] ?? (LENGTH_UNITS.test(unit) ? "<length>" : null))
        : null;
    if (!(syntax && first)) {
      continue;
    }
    try {
      CSS.registerProperty({
        name: key,
        syntax,
        inherits: true,
        initialValue: String(first[key]).trim(),
      });
    } catch {
      // Registered already (the author's own `@property`): it stays as written.
    }
  }
}

/** A clip's frames as he tuned them: from its first to its last on a chosen curve, its legs where he dragged them, its ends' values as he typed them. */
function framesOf(held: Held, tuning: Tuning | undefined): Keyframe[] {
  if (!tuning) {
    return held.keyframes;
  }
  let frames: Keyframe[] = held.keyframes.map((frame) => ({ ...frame }));
  if (tuning.shaped && held.read.framed) {
    const bare = (frame: Keyframe | undefined): Keyframe =>
      Object.fromEntries(
        Object.entries(frame ?? {}).filter(([key]) => !MOTION_KEYS.has(key))
      );
    frames = [bare(frames[0]), bare(frames.at(-1))];
  }
  if (tuning.legs && tuning.legs.length === frames.length - 2) {
    tuning.legs.forEach((offset, at) => {
      const frame = frames[at + 1];
      if (frame) {
        frame.offset = offset;
      }
    });
  }
  const [first] = frames;
  const last = frames.at(-1);
  for (const value of tuning.values) {
    const key = frameKey(value.property);
    if (first && key in first) {
      first[key] = value.from;
    }
    if (last && key in last) {
      last[key] = value.to;
    }
  }
  return frames.map((frame) => {
    const { computedOffset: _drop, ...rest } = frame;
    return rest;
  });
}

/**
 * How clip `read` runs on as `repeat` says: once is as the page wrote it,
 * its own count of runs each its own way (a run there and one back, for a
 * play's `direction: "alternate"`); round again or back and forth run on to
 * the move's end, the first run its own way round.
 */
function runsOf(
  read: ClipRead,
  repeat: ClipRepeat
): { direction: PlaybackDirection; iterations: number } {
  if (repeat === "once") {
    return {
      direction: read.direction,
      iterations: Math.max(1, read.iterations || Number.POSITIVE_INFINITY),
    };
  }
  const back = read.direction.endsWith("reverse");
  if (repeat === "mirror") {
    return {
      direction: back ? "alternate-reverse" : "alternate",
      iterations: Number.POSITIVE_INFINITY,
    };
  }
  return {
    direction: back ? "reverse" : "normal",
    iterations: Number.POSITIVE_INFINITY,
  };
}

/** A clip's timing as he tuned it, or as read. */
const timingOf = (held: Held, tuning: Tuning | undefined) => {
  const { read } = held;
  return {
    delay: tuning?.delay ?? read.delay,
    duration: Math.max(1, tuning?.duration ?? read.duration),
    // A curve kept in its frames runs on a linear timing.
    easing:
      read.framed && !tuning?.shaped
        ? "linear"
        : (tuning?.easing ?? read.easing),
    ...runsOf(read, tuning?.repeat ?? "once"),
    fill: "both" as const,
  };
};

/** The move's length as `tuning` times it: its last clip's end, each of its runs as written, one of a clip that runs on (core `clipEnd`). */
function playedLength(
  clips: Iterable<Held>,
  tuning: ReadonlyMap<string, Tuning>
): number {
  let length = 0;
  for (const held of clips) {
    const timing = timingOf(held, tuning.get(held.read.id));
    length = Math.max(length, clipEnd({ ...timing, start: held.read.start }));
  }
  return length;
}

/** What a replay was made from, so a change of tuning makes it anew. */
const signOf = (held: Held, tuning: Tuning | undefined) =>
  JSON.stringify([held.read.id, tuning ?? null]);

export class Replays {
  /** The move the page last read, by its clips' ids. */
  #clips = new Map<string, Held>();
  /** The tuning the replays stand on: his, or none (the agent's as written). */
  #tuning = new Map<string, Tuning>();
  readonly #running = new Map<string, { animation: Animation; sign: string }>();
  /** A play under way: where it began on the page's clock and from where in the move. */
  #clock: {
    from: number;
    loopFrom: number;
    repeat: boolean;
    t0: number;
  } | null = null;
  #ends: ReturnType<typeof setTimeout> | undefined;
  /** Where a hold stands the move, ms. */
  #heldAt = 0;
  readonly #told: (time: StageTime) => void;
  readonly #frame: () => void;
  readonly #rooted: (el: Element) => boolean;

  /** `told`: the move's clock said to the panel. `frame`: called on each frame a replay stands or plays (the lit ring follows). `rooted`: an element is the drawing's root, where an authored custom property interpolates. */
  constructor(
    told: (time: StageTime) => void,
    frame: () => void,
    rooted: (el: Element) => boolean
  ) {
    this.#told = told;
    this.#frame = frame;
    this.#rooted = rooted;
  }

  /** A new move read: every replay of the last let go. */
  load(clips: readonly Held[]): void {
    this.release();
    this.#clips = new Map(clips.map((held) => [held.read.id, held]));
    this.#tuning = new Map();
  }

  /** The tuning the replays stand on from now: his. */
  tune(tuning: readonly Tuning[]): void {
    this.#tuning = new Map(tuning.map((one) => [one.id, one]));
  }

  /** The move's length as it stands tuned, ms. */
  get length(): number {
    return playedLength(this.#clips.values(), this.#tuning);
  }

  /** Whether any replay stands: a play, or a hold mid-way. */
  get standing(): boolean {
    return this.#running.size > 0;
  }

  /** The replay of `held` as the tuning times it now, made anew where the tuning changed. */
  #of(held: Held): Animation | null {
    const tuning = this.#tuning.get(held.read.id);
    const sign = signOf(held, tuning);
    const had = this.#running.get(held.read.id);
    if (had?.sign === sign) {
      return had.animation;
    }
    had?.animation.cancel();
    this.#running.delete(held.read.id);
    if (!held.target?.isConnected) {
      return null;
    }
    if (this.#rooted(held.target)) {
      interpolated(held.keyframes);
    }
    let animation: Animation;
    try {
      animation = held.target.animate(
        framesOf(held, tuning),
        timingOf(held, tuning)
      );
    } catch {
      // Frames the engine won't take again (a property it computed but won't animate): that clip stands as it is.
      return null;
    }
    animation.id = REPLAY_ID;
    animation.pause();
    this.#running.set(held.read.id, { animation, sign });
    return animation;
  }

  /** Where the move stands now, ms: the play's time, else 0. */
  now(): number {
    const clock = this.#clock;
    return clock ? clock.from + (performance.now() - clock.t0) : 0;
  }

  /** Every clip stood at `t` ms into the move, held there. */
  seek(t: number): void {
    this.#stop();
    this.#heldAt = t;
    for (const held of this.#clips.values()) {
      const replay = this.#of(held);
      if (replay) {
        replay.pause();
        replay.currentTime = t - held.read.start;
      }
    }
    this.#frame();
  }

  /**
   * The move played from `from` ms, each replay placed and run; it says its
   * time now, and at its end either goes round again from `loopFrom`
   * (`repeat`) or lets every replay go, the kept state standing.
   */
  play(from: number, repeat: boolean, loopFrom: number): void {
    this.#stop();
    const { length } = this;
    const start = from >= length ? 0 : from;
    for (const held of this.#clips.values()) {
      const replay = this.#of(held);
      if (replay) {
        // Played, then placed: `play()` on a paused animation whose time
        // stands before 0 rewinds it to 0 (Web Animations, "play an
        // animation", auto-rewind), so a clip set off later ran at once.
        replay.play();
        replay.currentTime = start - held.read.start;
      }
    }
    const t0 = performance.now();
    this.#clock = { from: start, t0, repeat, loopFrom };
    this.#told({ playing: true, t: start, length, at: t0 });
    this.#follow();
    this.#ends = setTimeout(() => this.#ended(), Math.max(0, length - start));
  }

  /** The play reached the move's end: round again, or the replays let go. */
  #ended(): void {
    const clock = this.#clock;
    if (!clock) {
      return;
    }
    const { length } = this;
    if (clock.repeat && length > 0) {
      this.play(Math.min(clock.loopFrom, length - 1), true, clock.loopFrom);
      return;
    }
    this.release();
    this.#told({ playing: false, t: length, length, at: performance.now() });
  }

  /** Every replay paused where it stands; its time said. */
  pause(): void {
    const t = this.#clock ? Math.min(this.length, this.now()) : this.#heldAt;
    if (this.#clock) {
      this.seek(t);
    }
    this.#told({
      playing: false,
      t,
      length: this.length,
      at: performance.now(),
    });
  }

  /** The tuning changed under a hold: each held replay drawn again where it stands. */
  restand(): void {
    if (this.standing && !this.#clock) {
      this.seek(this.#heldAt);
    }
  }

  #stop(): void {
    clearTimeout(this.#ends);
    this.#clock = null;
  }

  /** Each frame of a play, the page follows (the lit ring on the thing as it moves). */
  #follow(): void {
    const step = () => {
      if (this.#clock) {
        this.#frame();
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  /** Every replay ended, its element let go: the state as it stands. */
  release(): void {
    this.#stop();
    for (const { animation } of this.#running.values()) {
      animation.cancel();
    }
    this.#running.clear();
    this.#frame();
  }
}

/** What the page does for the face beyond its replays: fade the drawing in, ring a row's thing, say the move's clock. */
interface MoveAnswers {
  fadeIn: () => void;
  light: (thing: string | null) => void;
  said: (time: StageTime) => void;
}

/**
 * The Animation face's asks of the stage (core stage-graph.ts), answered on
 * `replays`: Play (or, with reduced motion, its end at once, faded in),
 * Pause, a scrub's frames (one seek a frame, the last said), a scrub let go,
 * a retime, a row's ring.
 */
export function answerMoves(replays: Replays, page: MoveAnswers): void {
  window.addEventListener(STAGE_PLAY, (event) => {
    const asking = stagePlayOf(event.detail);
    if (!asking) {
      return;
    }
    replays.tune(asking.tuning);
    if (!asking.still) {
      replays.play(asking.from, asking.repeat, asking.loopFrom);
      return;
    }
    // Stood at its end at once, the drawing fading in: the move let go, the kept state as it stands.
    replays.release();
    page.fadeIn();
    const { length } = replays;
    page.said({ playing: false, t: length, length, at: performance.now() });
  });
  window.addEventListener(STAGE_PAUSE, (event) => {
    if (stagePauseOf(event.detail)) {
      replays.pause();
    }
  });
  let seekFrame = 0;
  let seekAt = 0;
  window.addEventListener(STAGE_SEEK, (event) => {
    const asking = stageSeekOf(event.detail);
    if (!asking) {
      return;
    }
    replays.tune(asking.tuning);
    seekAt = asking.t;
    seekFrame ||= requestAnimationFrame(() => {
      seekFrame = 0;
      replays.seek(seekAt);
    });
  });
  window.addEventListener(STAGE_LET_GO, (event) => {
    const asking = stageLetGoOf(event.detail);
    // Let go on the move's end: the drawing let go, the kept state as it stands; elsewhere the hold stays.
    if (asking && asking.t >= replays.length) {
      cancelAnimationFrame(seekFrame);
      seekFrame = 0;
      replays.release();
    }
  });
  window.addEventListener(STAGE_RETIME, (event) => {
    const asking = stageRetimeOf(event.detail);
    if (!asking) {
      return;
    }
    replays.tune(asking.tuning);
    if (asking.replayFrom === null) {
      replays.restand();
    } else {
      replays.play(asking.replayFrom, false, 0);
    }
  });
  window.addEventListener(STAGE_RING, (event) => {
    const asking = stageRingOf(event.detail);
    if (asking) {
      page.light(asking.thing);
    }
  });
}
