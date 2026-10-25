/**
 * Caw's rig: from a pose, his idle life and a clock's time to each layer's
 * transform. Pure functions of numbers, so a probe can read any frame by its
 * time, and the component only writes what this returns.
 *
 * Every channel is the skill's layering: key pose (blended between poses on
 * ease-in-out), plus idle (`sway`s that read 0 at t = 0, so frame 0 is the
 * pose itself), plus follow-through (a parent read a moment earlier), plus an
 * accent (a wave while a pose holds). Pivots and slides come from the art.
 */
import { CAW_ART } from "./art";
import { EASE_OUT, seg, sway, track, wave, within } from "./motion";
import {
  blinkKeys,
  glanceKeys,
  type Held,
  type Idle,
  type Pose,
  type PropName,
  STILL_GAZE,
  STILL_WING,
  type Standing,
} from "./poses";

const PIVOT = CAW_ART.pivots;

/** An SVG transform matrix `[a, b, c, d, e, f]`. */
export type Matrix = readonly [number, number, number, number, number, number];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** A turn of `deg` (clockwise on screen) about `p`. */
function turn(deg: number, p: readonly number[]): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, p[0] - c * p[0] + s * p[1], p[1] - s * p[0] - c * p[1]];
}

function move(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

function scaleAbout(sx: number, sy: number, p: readonly number[]): Matrix {
  return [sx, 0, 0, sy, p[0] - sx * p[0], p[1] - sy * p[1]];
}

/** How far each part slides on a full head turn (the skill's 2.5D turn), in units of his 205-wide head. */
const HEAD_WIDTH = 205;
const SLIDE = { beak: 0.13, face: 0.1, tuft: -0.09 } as const;
/** His far eye's pupil travels two fifths of his near one's: it is foreshortened. */
const FAR_EYE = 0.4;
/** A weight of 1 moves his hips this far; his legs, this long, turn to keep his feet planted. */
const WEIGHT = 6;
const LEG = 74;
/** Follow-through: a child reads its parent this much earlier, at this share. */
const LAG = { wing: 90, head: 110, tuft: 120 } as const;
const FOLLOW = 0.45;
/** A pose change: ease-in-out over this long; a prop arrives over the first part of it. */
export const BLEND_MS = 640;

/** The numbers of a pose that blend (its prop and accent blend by weight). */
interface Channels {
  aL: number;
  aR: number;
  beak: number;
  breath: number;
  eL: number;
  eR: number;
  gx: number;
  gy: number;
  lid: number;
  tilt: number;
  weight: number;
  yaw: number;
}

function channels(p: Pose): Channels {
  return {
    aL: p.wingL.a,
    eL: p.wingL.e,
    aR: p.wingR.a,
    eR: p.wingR.e,
    tilt: p.tilt,
    yaw: p.yaw,
    gx: p.gaze[0],
    gy: p.gaze[1],
    lid: p.lid,
    beak: p.beak,
    breath: p.breath,
    weight: p.weight,
  };
}

function mix(a: Channels, b: Channels, k: number): Channels {
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof Channels)[]) {
    out[key] = a[key] + (b[key] - a[key]) * k;
  }
  return out;
}

/**
 * A pose change in flight: from what was on screen when it began (itself a
 * blend, if one was running: it is taken over from where it is) to `to`.
 */
export interface Blend {
  /** He blinks as it begins: a change that turns his head (people blink on a turn). */
  blink?: boolean;
  duration: number;
  from: Pose;
  /** What the from-side looked like when this began, if a blend was cut short. */
  fromChannels?: Channels;
  /** The blend clock's ms when it began. */
  start: number;
  to: Pose;
}

/** The blend's eased progress at the blend clock's `now`. */
export function progress(b: Blend, now: number): number {
  return b.duration <= 0 ? 1 : seg(now, b.start, b.start + b.duration, "inOut");
}

function posed(b: Blend, now: number): Channels {
  return mix(
    b.fromChannels ?? channels(b.from),
    channels(b.to),
    progress(b, now)
  );
}

/**
 * The next pose change, taken over from wherever the current one stands at
 * `now` (interrupted, it continues from the current value, never jumps).
 */
export function retarget(b: Blend, now: number, to: Pose): Blend {
  return {
    from: b.to,
    fromChannels: posed(b, now),
    to,
    start: now,
    duration: BLEND_MS,
    blink: Math.abs(to.yaw - posed(b, now).yaw) > TURN_BLINK,
  };
}

/** A head turn this large (of a full turn's 1) brings a blink with it. */
const TURN_BLINK = 0.12;
/** One blink's keys from 0: closing in 110 ms, held 40, reopening in 190 on ease-out. */
const ONE_BLINK: readonly [number, number, "out"?][] = [
  [0, 0],
  [110, 1],
  [150, 1],
  [340, 0, "out"],
];

/** A blend already settled on `pose`. */
export function settled(pose: Pose): Blend {
  return { from: pose, to: pose, start: 0, duration: 0 };
}

/** One idle profile's tracks, built once. */
export interface IdleTracks {
  gx: [number, number][];
  gy: [number, number][];
  idle: Idle;
  lid: [number, number, "out"?][];
  yaw: [number, number][];
}

export function idleTracks(idle: Idle): IdleTracks {
  return {
    idle,
    lid: blinkKeys(idle),
    gx: glanceKeys(idle, (g) => g.to[0]),
    gy: glanceKeys(idle, (g) => g.to[1]),
    yaw: glanceKeys(idle, (g) => g.yaw),
  };
}

export interface EyeFrame {
  /** The closed eye's crescent, 0 to 1 (only as the lids meet). */
  closed: number;
  /** The lower lid's height, rising from the white's bottom. */
  lower: number;
  /** The pupil's slide from where the still draws it. */
  pupil: readonly [number, number];
  /** The upper lid's height, down from the white's top. */
  upper: number;
}

/** Where a prop is drawn: under a wing's primaries (held), or on the ground before him. */
export type PropHome = "handL" | "handR" | "ground";

export interface PropFrame {
  home: PropHome;
  /** One per prop: the same object travels from one place to the next. */
  key: string;
  /** Its matrix in its home's own coordinates (a hand's, for a held prop). */
  m: Matrix;
  prop: PropName;
}

/** One frame of the rig: every layer's transform, the eyes, and what fades. */
export interface RigFrame {
  eyes: { big: EyeFrame; small: EyeFrame };
  /** A wing's edge line on his body, which fades as the wing lifts off it. */
  lines: { wingL: number; wingR: number };
  m: {
    beak: Matrix;
    body: Matrix;
    face: Matrix;
    handL: Matrix;
    handR: Matrix;
    head: Matrix;
    jaw: Matrix;
    legL: Matrix;
    legR: Matrix;
    tail: Matrix;
    tuft: Matrix;
    wingL: Matrix;
    wingR: Matrix;
  };
  props: PropFrame[];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The loop's own channels: each reads 0 at t = 0 and closes on the loop. */
function idleChannels(idle: Idle) {
  const p = idle.period;
  return {
    drift: (t: number) => idle.weight * sway(t, p, 0.25),
    nod: (t: number) => idle.head.tilt * sway(t, idle.head.every, 0.35),
    // L and R sway out of phase, each on two periods.
    swayL: (t: number) =>
      idle.wing.sway * (sway(t, p / 3, 0) + 0.5 * sway(t, p / 5, 0.3)),
    swayR: (t: number) =>
      idle.wing.sway * (sway(t, p / 3, 0.5) + 0.5 * sway(t, p / 5, 0.8)),
  };
}

/** An accent's beat, fitted so a whole number of beats fill the loop. */
function beat(t: number, period: number, every: number): number {
  const n = Math.max(1, Math.round(period / every));
  return wave(t, period / n);
}

function accentOn(
  pose: Pose,
  hand: "handL" | "handR",
  t: number,
  period: number
): number {
  const a = pose.accent;
  return a && a.on === hand ? a.amp * beat(t, period, a.every) : 0;
}

/** The inverse of an affine matrix. */
function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

/** A matrix of turn, scale and move only, `k` of the way from `a` to `b` along each. */
function between(a: Matrix, b: Matrix, k: number): Matrix {
  const angle = (m: Matrix) => Math.atan2(m[1], m[0]);
  const size = (m: Matrix) => Math.hypot(m[0], m[1]);
  let turnBy = angle(b) - angle(a);
  turnBy -= Math.round(turnBy / (2 * Math.PI)) * 2 * Math.PI;
  const r = angle(a) + turnBy * k;
  const sc = size(a) + (size(b) - size(a)) * k;
  return [
    Math.cos(r) * sc,
    Math.sin(r) * sc,
    -Math.sin(r) * sc,
    Math.cos(r) * sc,
    a[4] + (b[4] - a[4]) * k,
    a[5] + (b[5] - a[5]) * k,
  ];
}

/** A prop where its pose places it, in its home's coordinates. */
function placed(place: Held | Standing, scale = place.scale ?? 1): Matrix {
  return multiply(
    move(place.at[0], place.at[1]),
    multiply(turn(place.rotate, [0, 0]), scaleAbout(scale, scale, [0, 0]))
  );
}

/**
 * Where a held prop waits before the wing brings it out: tucked small under
 * the coverts at the primaries' root, inside his black, where it cannot be
 * seen. Where a standing prop waits: this far below where it stands, under
 * the ground line its home is clipped at.
 */
const TUCK_SCALE = 0.6;
const RISE = 120;

/**
 * A prop `w` of the way out (0 tucked away, 1 in place): a held one slides
 * out from under the coverts to the feathers' tips, growing to its size; a
 * standing one rises from below the ground. It is never faded in: what is not
 * yet out is hidden by his black or the ground.
 */
function comingOut(place: Held | Standing, w: number): PropFrame {
  const out = EASE_OUT(w);
  if (place.on === "ground") {
    return {
      key: place.prop,
      prop: place.prop,
      home: "ground",
      m: multiply(move(0, RISE * (1 - out)), placed(place)),
    };
  }
  const root = PIVOT[place.on];
  const tucked = placed(
    { ...place, at: [root[0], root[1]] },
    (place.scale ?? 1) * TUCK_SCALE
  );
  return {
    key: place.prop,
    prop: place.prop,
    home: place.on,
    m: between(tucked, placed(place), out),
  };
}

/**
 * The props of a blend at progress `k`. The same prop in both poses is one
 * object: it travels from where it was to where it goes (from his wing down to
 * the ground, or back up), drawn in the wing that holds it at either end. A
 * prop only one pose has comes out of his wing or up from the ground, or goes
 * back the same way.
 */
function propsOf(
  blend: Blend,
  k: number,
  hands: { handL: Matrix; handR: Matrix }
): PropFrame[] {
  const from = blend.from.prop;
  const to = blend.to.prop;
  if (from && to && from.prop === to.prop) {
    const world = (p: Held | Standing) =>
      p.on === "ground" ? placed(p) : multiply(hands[p.on], placed(p));
    let home: PropHome = "ground";
    if (to.on !== "ground") {
      home = to.on;
    } else if (from.on !== "ground") {
      home = from.on;
    }
    const at = between(world(from), world(to), k);
    return [
      {
        key: to.prop,
        prop: to.prop,
        home,
        m: home === "ground" ? at : multiply(invert(hands[home]), at),
      },
    ];
  }
  const shown: PropFrame[] = [];
  if (to) {
    shown.push(comingOut(to, k));
  }
  if (from && k < 1) {
    shown.push(comingOut(from, 1 - k));
  }
  return shown;
}

/**
 * The rig at loop time `t` (ms) and blend time `now` (ms), with `tracks` the
 * idle profile's. With `t = 0` and a settled blend, every layer stands as the
 * pose has it, and the ready pose is his still.
 */
export function solve(
  t: number,
  now: number,
  blend: Blend,
  tracks: IdleTracks
): RigFrame {
  const { idle } = tracks;
  const { period } = idle;
  const loop = idleChannels(idle);
  const c = posed(blend, now);
  const k = progress(blend, now);
  /**
   * How far `channel` moved over the last `ms`: read `ms` earlier less now,
   * less the same at t = 0, so it reads 0 on frame 0 and closes on the loop.
   */
  const lag = (channel: (at: number) => number, ms: number) =>
    channel(within(t - ms, period)) -
    channel(t) -
    (channel(within(-ms, period)) - channel(0));

  // Body: breathing lifts and swells it about the ground between his feet.
  const rise = (1 - Math.cos((2 * Math.PI * t) / idle.breath.every)) / 2;
  const lift = idle.breath.lift * c.breath * rise;
  const sy = 1 + idle.breath.swell * c.breath * rise;
  const sx = 1 / sy ** 0.6;
  const shift = c.weight * WEIGHT + loop.drift(t);
  const body = multiply(move(shift, -lift), scaleAbout(sx, sy, PIVOT.body));

  // Legs turn from the hips as they move, so his feet stay planted.
  const lean =
    (Math.asin(Math.max(-1, Math.min(1, shift / LEG))) * 180) / Math.PI;
  const legL = multiply(move(shift, 0), turn(lean, PIVOT.legL));
  const legR = multiply(move(shift, 0), turn(lean, PIVOT.legR));

  // Head: its tilt, the loop's nod, and righting itself a beat after the hips move.
  const shiftLag =
    (posed(blend, now - LAG.head).weight - c.weight) * WEIGHT +
    lag(loop.drift, LAG.head);
  const tilt = c.tilt + loop.nod(t) + 0.4 * shiftLag;
  const tiltLag =
    posed(blend, now - LAG.tuft).tilt - c.tilt + lag(loop.nod, LAG.tuft);
  const yaw = c.yaw + track(t, tracks.yaw);
  const head = turn(tilt, PIVOT.head);
  const tuft = multiply(
    move(yaw * SLIDE.tuft * HEAD_WIDTH, 0),
    turn(FOLLOW * tiltLag + idle.tuft * sway(t, period / 5, 0.6), PIVOT.tuft)
  );
  const face = move(yaw * SLIDE.face * HEAD_WIDTH, 0);
  const beak = move(yaw * SLIDE.beak * HEAD_WIDTH, 0);

  // Tail: a slow wag, and the hips' move carried through to it late.
  const tail = multiply(
    body,
    turn(idle.tail * sway(t, period / 3, 0.15) + 0.5 * shiftLag, PIVOT.tail)
  );

  // Wings: shoulder, then primaries that trail the shoulder by LAG.wing.
  const cWing = posed(blend, now - LAG.wing);
  const aL = c.aL + loop.swayL(t);
  const aR = c.aR + loop.swayR(t);
  const accentL =
    (1 - k) * accentOn(blend.from, "handL", t, period) +
    k * accentOn(blend.to, "handL", t, period);
  const accentR =
    (1 - k) * accentOn(blend.from, "handR", t, period) +
    k * accentOn(blend.to, "handR", t, period);
  const eL =
    c.eL +
    idle.wing.curl * sway(t, period / 3, 0.6) +
    FOLLOW * (cWing.aL - c.aL + lag(loop.swayL, LAG.wing)) +
    accentL;
  const eR =
    c.eR +
    idle.wing.curl * sway(t, period / 3, 0.1) +
    FOLLOW * (cWing.aR - c.aR + lag(loop.swayR, LAG.wing)) +
    accentR;
  const wingL = turn(aL - STILL_WING.L, PIVOT.wingL);
  const wingR = turn(-(aR - STILL_WING.R), PIVOT.wingR);
  const handL = turn(eL, PIVOT.handL);
  const handR = turn(-eR, PIVOT.handR);

  // Eyes: the pose's gaze and the loop's glances; blinks close both lids to meet low.
  const gx = c.gx + track(t, tracks.gx) - STILL_GAZE[0];
  const gy = c.gy + track(t, tracks.gy) - STILL_GAZE[1];
  const lid = Math.max(
    c.lid,
    track(t, tracks.lid),
    blend.blink ? track(now - blend.start, ONE_BLINK) : 0
  );
  const eyeFrame = (
    e: { travel: readonly number[]; top: number; bottom: number },
    scale: number
  ): EyeFrame => {
    const h = e.bottom - e.top;
    return {
      pupil: [gx * e.travel[0] * scale, gy * e.travel[1] * scale],
      upper: lid * 0.85 * h,
      lower: lid * 0.15 * h,
      closed: clamp01((lid - 0.88) / 0.12),
    };
  };
  const { big } = CAW_ART.eyes;
  const eyes = {
    big: eyeFrame(big, 1),
    small: eyeFrame(
      {
        travel: big.travel,
        top: CAW_ART.eyes.small.top,
        bottom: CAW_ART.eyes.small.bottom,
      },
      FAR_EYE
    ),
  };

  // Props: carried by the wing or the ground, never faded (propsOf).
  const props = propsOf(blend, k, {
    handL: multiply(body, multiply(wingL, handL)),
    handR: multiply(body, multiply(wingR, handR)),
  });

  // A wing's edge line stays on his body only while the wing lies over it.
  const lying = (a: number, still: number) =>
    1 - clamp01((Math.abs(a - still) - 4) / 10);

  return {
    m: {
      body,
      legL,
      legR,
      tail,
      head,
      jaw: turn(c.beak, PIVOT.jaw),
      tuft,
      face,
      beak,
      wingL,
      wingR,
      handL,
      handR,
    },
    eyes,
    lines: { wingL: lying(aL, STILL_WING.L), wingR: lying(aR, STILL_WING.R) },
    props,
  };
}

/** A matrix as the `transform` attribute takes it. */
export function matrixText(m: Matrix): string {
  return `matrix(${m.map((v) => Math.round(v * 10_000) / 10_000).join(" ")})`;
}
