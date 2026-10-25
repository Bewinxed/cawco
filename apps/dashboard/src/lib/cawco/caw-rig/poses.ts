/**
 * Caw's poses, props and idle life, as data: a new pose is a few lines here.
 *
 * Every number is in his still's 512 units, degrees or ms. L and R are the
 * viewer's left and right (his near wing is L). A pose is where he holds;
 * his idle life (blinks, glances, breathing, a little sway) plays over it on
 * one loop, so he never freezes in a held pose. The rig (rig.ts) reads these.
 */
import { CAW_ART } from "./art";

/** One wing, a two-segment limb: the shoulder, then the primaries curled from under the coverts. */
export interface Wing {
  /** The shoulder: 0 hangs down, 90 straight out, 180 straight up. The still holds L at 73, R at 68. */
  a: number;
  /** The primaries' curl: + turns their tips up, − down. Within ±40 they stay tucked under the coverts. */
  e: number;
  /**
   * The shoulder slid out, units, and down his side twice as far (rig.ts), its
   * root still on his body: a raised wing then clears his head, two
   * silhouettes rather than one. 0 when not given.
   */
  out?: number;
}

/**
 * A prop held in a wing's primaries, in the drawing's units as the still lays
 * them out. It is drawn under the feathers, so their tips curl over it and
 * hold it, and it comes and goes from under the coverts as the wing moves
 * (rig.ts), never popping in.
 */
export interface Held {
  /** Where its middle sits, in the still's units, before the wing turns. */
  at: readonly [number, number];
  on: "handL" | "handR";
  prop: PropName;
  /** Its turn, so it stands as wanted once the wing has turned (see `upright`). */
  rotate: number;
  scale?: number;
}

/** A prop standing on the ground beside his feet: it rises from below the ground line to stand. */
export interface Standing {
  at: readonly [number, number];
  on: "ground";
  prop: PropName;
  rotate: number;
  scale?: number;
}

/** A beat that repeats while the pose holds: a wave of the primaries, a flutter. */
export interface Accent {
  /** Degrees either way. */
  amp: number;
  /** About how long one beat takes, ms; it is fitted to the loop so the loop closes. */
  every: number;
  on: "handL" | "handR";
}

export interface Pose {
  accent?: Accent;
  /** His beak open: the lower beak dropped this many degrees about the corner of his mouth. */
  beak: number;
  /** Breathing depth: 1 his usual, 0 none. */
  breath: number;
  /** Where he looks, in his big eye's own travel: [-1, 1] across, [-1, 1] down. */
  gaze: readonly [number, number];
  /** His upper lids at rest. Caw's rule: 0, never heavy-lidded; only blinks close them. */
  lid: number;
  prop?: Held | Standing;
  /** Head tilt, degrees: + toward his beak (clockwise). */
  tilt: number;
  /** Weight: -1 hips toward the viewer's left, 1 toward the right. */
  weight: number;
  wingL: Wing;
  wingR: Wing;
  /** Head turn: + toward his beak (profile), − toward the viewer. */
  yaw: number;
}

const eye = CAW_ART.eyes.big;
/** Where the still looks: his big pupil's place in its white, in its own travel. */
export const STILL_GAZE: readonly [number, number] = [
  (eye.pupilAt[0] - eye.center[0]) / eye.travel[0],
  (eye.pupilAt[1] - eye.center[1]) / eye.travel[1],
];

/** The still's shoulder angles, which `Wing.a` is measured against. */
export const STILL_WING = { L: 73, R: 68 } as const;

/**
 * A held prop's turn that stands it upright once its wing is at `wing`: the
 * wing's own turn, undone.
 */
export function upright(side: "L" | "R", wing: Wing): number {
  const turn = wing.a - STILL_WING[side] + wing.e;
  return side === "L" ? -turn : turn;
}

/** His near wing up beside his head, its primaries curled round the phone's lower half so their tips hold it. */
const phoneUp: Wing = { a: 124, e: 32, out: 20 };

/** His poses. `ready` is his still, exactly: frame 0 of every other pose's idle is its own pose. */
export const POSES = {
  ready: {
    wingL: { a: 73, e: 0 },
    wingR: { a: 68, e: 0 },
    tilt: 0,
    yaw: 0,
    gaze: STILL_GAZE,
    lid: 0,
    beak: 0,
    breath: 1,
    weight: 0,
  },
  /** A hello: his near wing up, its primaries waving, turned a little toward you, beak open on a caw. */
  waving: {
    wingL: { a: 124, e: 18 },
    wingR: { a: 52, e: -8 },
    tilt: -4,
    yaw: -0.22,
    gaze: [0.2, 0.05],
    lid: 0,
    beak: 8,
    breath: 1,
    weight: -0.4,
    accent: { on: "handL", amp: 12, every: 760 },
  },
  /** Pairing's wait: a phone held up in his near wing, his eyes on it. */
  phoneUp: {
    wingL: phoneUp,
    wingR: { a: 44, e: -6 },
    tilt: -6,
    yaw: -0.3,
    gaze: [-0.75, -0.7],
    lid: 0,
    beak: 0,
    breath: 1,
    weight: 0.35,
    prop: {
      prop: "phone",
      on: "handL",
      // Deep in the fan: its lower half under the feathers, its top standing clear of the tips.
      at: [40, 306],
      rotate: upright("L", phoneUp),
      scale: 1.1,
    },
  },
  /**
   * Approved: both wings flung up and out from his sides (the done still's
   * spread, primaries turned up), each clear of his head, a small flutter in
   * the near one, beak wide in a happy caw.
   */
  cheer: {
    wingL: { a: 112, e: 35, out: 22 },
    wingR: { a: 120, e: 30, out: 22 },
    tilt: -3,
    yaw: -0.18,
    gaze: [-0.2, -0.45],
    lid: 0,
    beak: 28,
    breath: 1.3,
    weight: 0,
    accent: { on: "handL", amp: 5, every: 520 },
  },
  /**
   * Not sure: wings out, primaries turned up, head cocked, a look up and aside. His far
   * shoulder slides down his side so that wing stands clear of his cocked cheek.
   */
  shrug: {
    wingL: { a: 94, e: 26 },
    wingR: { a: 86, e: 24, out: 10 },
    tilt: 9,
    yaw: -0.12,
    gaze: [0.45, -0.8],
    lid: 0,
    beak: 5,
    breath: 1,
    weight: 0.15,
  },
  /** Removed: calm, wings let down, the phone set beside his foot, his eyes on it. */
  letGo: {
    wingL: { a: 34, e: -8 },
    wingR: { a: 30, e: -10 },
    tilt: 5,
    yaw: 0.08,
    gaze: [0.55, 0.75],
    lid: 0,
    beak: 0,
    breath: 0.8,
    weight: 0.2,
    // Clear of his feet and of his far wing's red tips, which hang to its top at 432; standing
    // on the ground, it can only go further out.
    prop: { prop: "phone", on: "ground", at: [474, 442], rotate: 0 },
  },
} as const satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;

/** A rounded rectangle's outline about (0, `cy`) (one closed path). */
function roundRect(w: number, h: number, r: number, cy = 0): string {
  const x = -w / 2;
  const y = cy - h / 2;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

export interface Prop {
  /** Each shape, back to front, about the prop's middle, filled with one of his inks. */
  shapes: readonly { d: string; ink: "black" | "paper" }[];
}

/**
 * His props: flat paper cream with a thin black outline (PERSONALITY.md),
 * the outline a shape of its own under the cream, so no two edges meet.
 */
export const PROPS = {
  phone: {
    shapes: [
      { d: roundRect(44, 76, 11), ink: "black" },
      { d: roundRect(34, 66, 7), ink: "paper" },
      // The earpiece, so it reads as a phone and not a card.
      { d: roundRect(10, 3, 1.5, -27), ink: "black" },
    ],
  },
} as const satisfies Record<string, Prop>;

export type PropName = keyof typeof PROPS;

/** A blink's keys from `at`: closing in 110 ms, held 40, reopening in 190 on ease-out. */
function blink(at: number): [number, number, "out"?][] {
  return [
    [at, 0],
    [at + 110, 1],
    [at + 150, 1],
    [at + 340, 0, "out"],
  ];
}

export interface Glance {
  /** When it starts, ms into the loop. */
  at: number;
  /** How long it holds there, ms. */
  hold: number;
  /** Where the eyes go, added to the pose's gaze. */
  to: readonly [number, number];
  /** How far the head turns with it. */
  yaw: number;
}

/** His idle life over a pose: one loop, every period dividing it, so the loop closes. */
export interface Idle {
  /** When he blinks, ms into the loop (a glance's start is a blink, as people blink on a turn). */
  blinks: readonly number[];
  breath: { every: number; lift: number; swell: number };
  glances: readonly Glance[];
  head: { every: number; tilt: number };
  period: number;
  tail: number;
  tuft: number;
  /** Sideways drift of his hips over the loop, units. */
  weight: number;
  wing: { curl: number; sway: number };
}

/**
 * Calm by default: he breathes, blinks every three or four seconds, glances
 * once and sways a little. Attentive is for when the person has something to
 * attend to: a shorter loop, two glances, a little more life.
 */
export const IDLE = {
  calm: {
    period: 7200,
    breath: { every: 3600, lift: 1.6, swell: 0.012 },
    blinks: [600, 3800, 4060],
    glances: [{ at: 3800, to: [-0.55, 0.25], yaw: -0.1, hold: 1500 }],
    head: { every: 7200, tilt: 1.6 },
    wing: { sway: 1.6, curl: 2.5 },
    weight: 1.2,
    tail: 2.5,
    tuft: 2,
  },
  attentive: {
    period: 6000,
    breath: { every: 3000, lift: 1.8, swell: 0.014 },
    blinks: [400, 3300],
    glances: [
      { at: 400, to: [-0.6, 0.2], yaw: -0.12, hold: 1200 },
      { at: 3300, to: [0.0, -0.35], yaw: 0.05, hold: 1000 },
    ],
    head: { every: 6000, tilt: 2.2 },
    wing: { sway: 2.4, curl: 3.5 },
    weight: 1.6,
    tail: 3.5,
    tuft: 3,
  },
} as const satisfies Record<string, Idle>;

export type IdleName = keyof typeof IDLE;

/** The keys of one idle loop's lids, from 0 to its period. */
export function blinkKeys(idle: Idle): [number, number, "out"?][] {
  return [[0, 0], ...idle.blinks.flatMap(blink), [idle.period, 0]];
}

/** The keys of one idle loop's glances on one channel: glide there in 520 ms, hold, glide back. */
export function glanceKeys(
  idle: Idle,
  pick: (g: Glance) => number
): [number, number][] {
  return [
    [0, 0],
    ...idle.glances.flatMap((g): [number, number][] => [
      [g.at, 0],
      [g.at + 520, pick(g)],
      [g.at + 520 + g.hold, pick(g)],
      [g.at + 1040 + g.hold, 0],
    ]),
    [idle.period, 0],
  ];
}
