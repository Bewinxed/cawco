/**
 * The design graph's seam (Projects spec §5.10, tsk-18): the messages the
 * artifact panel and a component artifact's stage page speak across the one
 * frame that holds the component. The component lives in the project's
 * toolchain, on the stage's origin, inside that frame; the panel draws the
 * graph's chrome round it. So the two talk by messages alone, on the path
 * the inspector's `cawco:story-args` already takes: the panel's `post`, the
 * preview overlay's `fromHost` relay to a window event of the same name on
 * the page, and back through the overlay's `post` to the panel's `receive`.
 *
 * Every ask from the panel carries `ask`, a counter the panel owns; every
 * answer echoes it. A later ask of one kind supersedes one still in flight:
 * the page answers the one passed over `superseded: true` and does nothing
 * more for it.
 *
 * What never crosses: args, DOM, keyframes, elements. The panel names a
 * state ({@link StateRef}); the page resolves it to args from its states
 * file's module, which only the page holds (an arg may be a fixture import
 * the panel sees only as code).
 */

import { DAY_MS } from "./time";
import { graphWords as words } from "./words/graph";

/** A record set cut from a state's list arg (`parameters.records`): the first `count` records, or the `count` with the longest names. */
export interface RecordCut {
  count: number;
  longest: boolean;
}

/** One state of one states file, as the panel names it; the page resolves it to args. */
export interface StateRef {
  /** The states file, from the toolchain root (core `SheetOnPage.file`). */
  file: string;
  /** The story's export. */
  story: string;
  /** A variant of it: a story grouped under it at its width, or a record set cut from its list arg. */
  variant?: { story: string } | { records: RecordCut };
}

/** The story a state is drawn from: a variant's own, else its own (a record set is cut from its state's story). */
export const storyOf = (ref: StateRef): string =>
  ref.variant && "story" in ref.variant ? ref.variant.story : ref.story;

/** The most a "many" record set holds: the whole list, or this much of it when longer. */
export const MANY_RECORDS = 20;

/** The record sets a list state offers, by the words the panel names them with. */
export const RECORD_SETS = {
  one: { count: 1, longest: false },
  many: { count: MANY_RECORDS, longest: false },
  longest: { count: MANY_RECORDS, longest: true },
} as const satisfies Record<string, RecordCut>;

/** A list record's name, for the longest names: its `name`, `title` or `label`. */
const recordName = (record: unknown): string => {
  const one = record as Record<string, unknown> | null;
  const named = one?.name ?? one?.title ?? one?.label;
  return typeof named === "string" ? named : "";
};

/**
 * `list` cut as `cut` says: its first `count` records, or the records with
 * the longest names, at most `count` and at least three or half the list.
 */
export function cutRecords(
  list: readonly unknown[],
  cut: RecordCut
): unknown[] {
  if (!cut.longest) {
    return list.slice(0, cut.count);
  }
  return [...list]
    .sort((a, b) => recordName(b).length - recordName(a).length)
    .slice(0, Math.min(cut.count, Math.max(3, Math.ceil(list.length / 2))));
}

/** What a clip animates, as the panel colours its bar (the `c-clip-*` tokens). */
export type ClipKind = "size" | "move" | "fade" | "tint" | "effect" | "other";

// golar-ignore-next-line house/no-clip-with-move -- a table from a property to its colour, no animation effect
const KINDS: Record<string, ClipKind> = {
  height: "size",
  "block-size": "size",
  width: "size",
  "inline-size": "size",
  "clip-path": "size",
  transform: "move",
  translate: "move",
  scale: "move",
  rotate: "move",
  opacity: "fade",
  "background-color": "tint",
  color: "tint",
  "border-color": "tint",
  filter: "effect",
  "box-shadow": "effect",
};

/**
 * The kind of what `properties` animate: the family of the most telling of
 * them, in the order the words name how a thing moves (`words.how`), so
 * "height, opacity" is a size, and only custom properties alone are "other".
 */
export const clipKindOf = (properties: Iterable<string>): ClipKind => {
  const said = new Set([...properties].map((one) => one.trim()));
  const telling = Object.keys(words.how).find((one) => said.has(one));
  return (telling && KINDS[telling]) || "other";
};

/** What one property of a clip animates between, as its first and last frames say it (a value the engine computed, in CSS). */
export interface ClipValue {
  from: string;
  property: string;
  to: string;
}

/** One animation a reach set off, as the page read it: the element and its frames stay on the page. */
export interface ClipRead {
  delay: number;
  /** Which way each of its runs goes, as the page wrote it: `alternate` turns back on each run after the first. */
  direction: ClipDirection;
  duration: number;
  easing: string;
  /** What moves, in words (the page's `nameOf`). */
  element: string;
  /**
   * A curve kept in its frames, as its progress: each frame's offset and
   * its share of the way from the first frame's value to the last's, for
   * its first property that moves as one plain number; null where none does.
   */
  frameCurve: [number, number][] | null;
  /** Its curve lives in its frames (a Svelte transition): a run of three or more frames on a linear timing. */
  framed: boolean;
  /** The agent's name for the group its thing stands in (`data-cawco-group` on it or round it); null in none. */
  group: string | null;
  /** Stable for the move's life: the order the engine started it in. */
  id: string;
  /** How many times it runs (`Infinity` reads as 0: it never ends); 1 for once. */
  iterations: number;
  kind: ClipKind;
  /**
   * Its legs: the offsets between its first frame and its last where a
   * frame stands (an A → B → C clip is one leg at 0.5); none for a clip of
   * two frames or one whose curve lives in its frames.
   */
  legs: number[];
  /** `opacity`, `transform, opacity`, a keyframes' name. */
  property: string;
  /** Ms since the move began, from its own start time on the page's document timeline. */
  start: number;
  /** The page's id for the element it animates: two clips of one element share it. */
  target: string;
  /** The page's id for the thing a row names; null once it is gone. */
  thing: string | null;
  /** What it animates between, per property: its first frame's value and its last's. */
  values: ClipValue[];
}

/** What one reach did to the drawing: every animation it set off, from the state that stood to the one reached. */
interface MoveRead {
  clips: ClipRead[];
  /** The story it moved from. */
  from: string;
  /** Its last clip's end, ms. */
  length: number;
  /** The story it moved to. */
  to: string;
}

/**
 * Pane → page. The page stands at `to`: the first reach, one on another
 * states file, or one from nothing (`from` null) mounts it afresh at rest;
 * any other sets `to`'s args on the live instance, its own motion read as
 * it runs, then holds it to a fresh drawing of `to` and mounts it anew where
 * they differ. `play`: the move into `to` runs its story's `play` on the
 * instance standing at `from`. `still`: each animation read, then landed.
 */
export const STAGE_REACH = "cawco:stage-reach";
export interface StageReach {
  ask: number;
  from: StateRef | null;
  play: boolean;
  still: boolean;
  to: StateRef;
}

/**
 * Pane → page: the agent's dials (its canvas spec's `dials`) as set on
 * the drawing, by name: a `cssVar` dial's value on the drawing's root, an
 * `arg` dial's through the live instance's update. The whole set each time:
 * a dial missing from it goes back to as written.
 */
export const STAGE_DIALS = "cawco:stage-dials";
export interface StageDials {
  values: Record<string, DialSet>;
}

/**
 * Pane → page: the room the stage's floating head takes over the page's
 * top, px (the design graph's StagePane: its name, its glass, and while
 * comparing what differs). The page pads its column's top by it, so the
 * drawing at rest stands clear of the head and scrolls beneath it, and
 * draws the scroll edge effect under it; a ring brought into view stands
 * clear of it too (`scroll-padding-top`).
 */
export const STAGE_ROOM = "cawco:stage-room";
export interface StageRoom {
  px: number;
}
/** The most room a stage's head may take, px: a head's, never the page's. */
const STAGE_ROOM_MOST = 480;

/** One dial's value as set on the drawing: a number, a colour or an option's words, a toggle. */
export type DialSet = number | string | boolean;

/**
 * Page → pane: each of the agent's dials as written, read off the drawing
 * once it first mounts (a `cssVar` dial's value as the drawing's root
 * computes it, an `arg` dial's as the kept story's args hold it), by name.
 * A dial the drawing holds no value for is left out.
 */
export const STAGE_DIALS_WRITTEN = "cawco:stage-dials-written";
export interface StageDialsWritten {
  values: Record<string, DialSet>;
}

/**
 * Where a clip ends in its move, ms: its start, its delay and each of its
 * runs, `iterations` of them (a play's two runs there and back end at
 * twice its duration); one that runs on (`iterations` 0) counts its first,
 * the move's other clips ending it.
 */
export const clipEnd = (
  clip: Pick<ClipRead, "delay" | "duration" | "iterations" | "start">
): number =>
  clip.start +
  clip.delay +
  clip.duration *
    (clip.iterations > 0 && Number.isFinite(clip.iterations)
      ? clip.iterations
      : 1);

/** Which way a clip's runs go: the Web Animations API's `PlaybackDirection`. */
type ClipDirection = "normal" | "reverse" | "alternate" | "alternate-reverse";

/** How a clip runs after its first time through: once, round again, or back and forth. */
export type ClipRepeat = "once" | "repeat" | "mirror";

/**
 * One clip's timing as the person tuned it, by its id in the move the page
 * last read: the page plays and holds its own replay of that clip on it.
 * `shaped`: a curve was chosen for a clip whose curve lived in its frames,
 * so it runs from its first frame to its last on `easing`. `values`: a
 * property's first or last frame he typed anew, by property; `legs`: where
 * its legs meet, dragged; `repeat`: how it runs on past its first time.
 */
export interface Tuning {
  delay: number;
  duration: number;
  easing: string;
  id: string;
  /** Its legs' boundaries, as offsets between its first frame and its last, where he dragged them; null as read. */
  legs: number[] | null;
  repeat: ClipRepeat;
  shaped: boolean;
  values: ClipValue[];
}

/**
 * Pane → page: the move the page last read played from `from` ms on its
 * own replays, timed as `tuning` says (the clips it names; the rest as
 * read). `repeat`:
 * round again from `loopFrom` ms each time it ends. `still`: stood at its
 * end at once, the drawing fading in. The page is the clock, and says the
 * time as it starts, at each wrap and at its end ({@link STAGE_TIME}).
 */
export const STAGE_PLAY = "cawco:stage-play";
export interface StagePlay {
  ask: number;
  from: number;
  loopFrom: number;
  repeat: boolean;
  still: boolean;
  tuning: Tuning[];
}

/** Pane → page: every replay paused where it stands; answered with the time. */
export const STAGE_PAUSE = "cawco:stage-pause";
export interface StagePause {
  ask: number;
}

/** Pane → page: every clip stood at `t` ms into the move and held there, as `tuning` times it (a scrub's frame). */
export const STAGE_SEEK = "cawco:stage-seek";
export interface StageSeek {
  ask: number;
  t: number;
  tuning: Tuning[];
}

/** Pane → page: a scrub let go at `t`: on the move's end the replays let the drawing go, the kept state as it stands; elsewhere the hold stays. */
export const STAGE_LET_GO = "cawco:stage-let-go";
export interface StageLetGo {
  ask: number;
  t: number;
}

/**
 * Pane → page: the move's timing changed. A replay held is drawn again on
 * the new timing where it stands; `replayFrom` not null plays the move
 * from there once, as he let go of the edit.
 */
export const STAGE_RETIME = "cawco:stage-retime";
export interface StageRetime {
  ask: number;
  replayFrom: number | null;
  tuning: Tuning[];
}

/** Pane → page: the ring on the thing a row names (`thing`, the clips' own id), its box as it stands at `at` ms into the move; null clears it. */
export const STAGE_RING = "cawco:stage-ring";
export interface StageRing {
  at: number;
  thing: string | null;
}

/**
 * Page → pane: the move's clock. `t` ms into the move held at the page's
 * `performance.now()` `at`, `length` the move's length as played; said as
 * a play starts, at each wrap of a repeat, at its end and at a pause. The
 * panel runs its own readout from `t` between two words and snaps to each.
 */
export const STAGE_TIME = "cawco:stage-time";
export interface StageTime {
  at: number;
  length: number;
  playing: boolean;
  t: number;
}

/**
 * Pane → page: a region of the drawing brought into the page's view with
 * room for a ring round it: what the last reach changed (`move`; while
 * comparing, the first difference's ring stands for it), one thing the
 * last reach moved by its clips' id for it (`thing`, a row of the move
 * focused), or the n-th difference the page last told (`difference`), the
 * compared drawing shown
 * in the kept one's place for one that went where the two don't stand side
 * by side.
 */
export const STAGE_REVEAL = "cawco:stage-reveal";
export interface StageReveal {
  what: { move: true } | { difference: number } | { thing: string };
}

/**
 * Pane → page: Compare. `against` set, the page draws that state hidden
 * under the kept drawing at the same width, reads what differs between
 * the two as either lays out, rings each difference, and stands the two
 * side by side where its room holds both; `show: "compared"` shows the
 * compared drawing in the kept one's place (the flip). `against` null
 * ends it.
 */
export const STAGE_COMPARE = "cawco:stage-compare";
export interface StageCompare {
  against: StateRef | null;
  ask: number;
  show: "kept" | "compared";
}

/** A box of a drawing, in its own px: unscaled, from its top-left corner. */
export interface DrawingBox {
  h: number;
  w: number;
  x: number;
  y: number;
}

/**
 * One difference, as the page read it: what came in or changed stands on
 * the kept drawing, what went on the compared one, each box in its own
 * drawing's px.
 */
export interface DifferenceRead {
  box: DrawingBox;
  kind: "came" | "changed" | "went";
  /** One line of words (core words/graph.ts, read on the page where the parts stand). */
  line: string;
  /** Its corner radius as drawn, so its ring stands on its own shape. */
  radius: string;
}

/**
 * Page → pane: what differs, on each read (both drawings laid out, and
 * again as either lays out anew), for the Compare ask it answers.
 * `beside`: the two stand side by side, each named; `same`: both drew and
 * nothing differs.
 */
export const STAGE_DIFFERENCES = "cawco:stage-differences";
export interface StageDifferences {
  ask: number;
  beside: boolean;
  found: DifferenceRead[];
  same: boolean;
}

/** Page → pane: a reach landed, was passed over by a later one, or its play threw. */
export const STAGE_REACHED = "cawco:stage-reached";
export interface StageReached {
  ask: number;
  failed?: { message: string; stack: string };
  /** What the reach did; null for a mount, which moves nothing. */
  move: MoveRead | null;
  on: StateRef;
  superseded?: true;
}

/**
 * Page → pane: how the drawing is laid out, after it mounts and whenever
 * its width changes. `need`: the page's width for the drawing whole (its
 * width, the page's gutters and its scroller's), which the panel's split
 * gives the stage; `tall`: the drawing's height; `fit`: the drawing's own
 * width where it stands narrower than the width it was laid out at;
 * `scale`: how much it is scaled down to stand whole (both as they stand
 * scaled).
 */
export const STAGE_LAID = "cawco:stage-laid";
export interface StageLaid {
  fit: number | null;
  need: number;
  /** How much the drawing is scaled down to stand whole on the stage (a width picked wider than it); 1 at 1:1. */
  scale: number;
  tall: number;
}

/**
 * Page → pane: the drawing's page scrolled, and which way it went last (a
 * scroll past the dead zone, not every pixel): the tools over the drawing's
 * foot get out of the way on the way down and come back on the way up, as an
 * iOS bottom toolbar does.
 */
export const STAGE_SCROLLED = "cawco:stage-scrolled";
export interface StageScrolled {
  down: boolean;
}

/** A {@link StageScrolled} as it crossed the frame; null when it is none. */
export function stageScrolledOf(value: unknown): StageScrolled | null {
  const said = isRecord(value) ? value : null;
  return said && typeof said.down === "boolean" ? { down: said.down } : null;
}

/** Page → pane: the component threw as it mounted; the page draws the error formula in the drawing's place, with its own Try again. */
export const STAGE_FAULT = "cawco:stage-fault";
export interface StageFault {
  message: string;
  on: StateRef;
}

/*
 * Reading back what crossed the frame, without a schema library: the
 * overlay, the stage page and the panel all load this module, and a page
 * carries no validator of its own. Each keeps what is that shape.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
/** The longest name a state is read with: a path, an export. Ours. */
const NAME_MAX = 1000;
const nameOf = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= NAME_MAX
    ? value
    : null;

/** A {@link StateRef} as it crossed the frame; null when it is none. */
function stateRefOf(value: unknown): StateRef | null {
  if (!isRecord(value)) {
    return null;
  }
  const file = nameOf(value.file);
  const story = nameOf(value.story);
  if (!(file && story)) {
    return null;
  }
  const variant = isRecord(value.variant) ? value.variant : null;
  const records = isRecord(variant?.records) ? variant.records : null;
  const count = finite(records?.count);
  if (variant && nameOf(variant.story)) {
    return { file, story, variant: { story: nameOf(variant.story) as string } };
  }
  if (records && count !== null && count > 0) {
    return {
      file,
      story,
      variant: { records: { count, longest: records.longest === true } },
    };
  }
  return { file, story };
}

/** A {@link StageReach} as it crossed the frame; null when it is none. */
export function stageReachOf(value: unknown): StageReach | null {
  const said = isRecord(value) ? value : null;
  const ask = finite(said?.ask);
  const to = stateRefOf(said?.to);
  if (!(said && ask !== null && to)) {
    return null;
  }
  return {
    ask,
    to,
    from: stateRefOf(said.from),
    play: said.play === true,
    still: said.still === true,
  };
}

/** The most clips one move says: far past any move a person tunes. Ours. */
const CLIPS_MAX = 2000;
/** The most frames' points or legs one clip says. Ours: a Svelte transition of seconds has a few hundred. */
const POINTS_MAX = 1000;
/** The longest value a frame says, in CSS. Ours. */
const VALUE_MAX = 400;

const wordsOf = (value: unknown, most = NAME_MAX): string | null =>
  typeof value === "string" && value.length <= most ? value : null;

const KINDS_SAID = new Set<ClipKind>([
  "size",
  "move",
  "fade",
  "tint",
  "effect",
  "other",
]);

/** Offsets between a clip's first frame and its last, each inside them; null when none were said. */
const offsetsOf = (value: unknown): number[] | null =>
  Array.isArray(value)
    ? value
        .slice(0, POINTS_MAX)
        .filter(
          (one): one is number =>
            finite(one) !== null && (one as number) > 0 && (one as number) < 1
        )
    : null;

/** A {@link ClipValue} as it crossed the frame; null when it is none. */
function clipValueOf(value: unknown): ClipValue | null {
  const said = isRecord(value) ? value : null;
  const property = nameOf(said?.property);
  const from = wordsOf(said?.from, VALUE_MAX);
  const to = wordsOf(said?.to, VALUE_MAX);
  return property && from !== null && to !== null
    ? { property, from, to }
    : null;
}

const valuesOf = (value: unknown): ClipValue[] =>
  Array.isArray(value)
    ? value
        .slice(0, POINTS_MAX)
        .map(clipValueOf)
        .filter((one): one is ClipValue => one !== null)
    : [];

/** A {@link ClipRead} as it crossed the frame; null when it is none. */
function clipReadOf(value: unknown): ClipRead | null {
  const said = isRecord(value) ? value : null;
  const id = nameOf(said?.id);
  const start = finite(said?.start);
  const delay = finite(said?.delay);
  const duration = finite(said?.duration);
  const easing = wordsOf(said?.easing, POINTS_MAX * 8);
  const element = wordsOf(said?.element);
  const property = wordsOf(said?.property);
  if (!(
    said &&
    id &&
    start !== null &&
    delay !== null &&
    duration !== null &&
    easing &&
    element !== null &&
    property !== null
  )) {
    return null;
  }
  const curve = Array.isArray(said.frameCurve)
    ? said.frameCurve
        .slice(0, POINTS_MAX)
        .filter(
          (one): one is [number, number] =>
            Array.isArray(one) &&
            one.length === 2 &&
            finite(one[0]) !== null &&
            finite(one[1]) !== null
        )
    : [];
  const iterations = finite(said.iterations);
  return {
    id,
    start,
    delay,
    direction: DIRECTIONS.has(said.direction as ClipDirection)
      ? (said.direction as ClipDirection)
      : "normal",
    duration,
    easing,
    element,
    property,
    framed: said.framed === true,
    frameCurve: curve.length > 1 ? curve : null,
    group: wordsOf(said.group) || null,
    iterations: iterations !== null && iterations >= 0 ? iterations : 1,
    kind: KINDS_SAID.has(said.kind as ClipKind)
      ? (said.kind as ClipKind)
      : "other",
    legs: offsetsOf(said.legs) ?? [],
    target: nameOf(said.target) ?? id,
    thing: nameOf(said.thing),
    values: valuesOf(said.values),
  };
}

/** A {@link MoveRead} as it crossed the frame; null when it is none. */
function moveReadOf(value: unknown): MoveRead | null {
  const said = isRecord(value) ? value : null;
  const length = finite(said?.length);
  if (!(
    said &&
    length !== null &&
    typeof said.from === "string" &&
    typeof said.to === "string" &&
    Array.isArray(said.clips)
  )) {
    return null;
  }
  return {
    from: said.from,
    to: said.to,
    length: Math.max(0, length),
    clips: said.clips
      .slice(0, CLIPS_MAX)
      .map(clipReadOf)
      .filter((one): one is ClipRead => one !== null),
  };
}

/** A {@link StageReached} as it crossed the frame; null when it is none. */
export function stageReachedOf(value: unknown): StageReached | null {
  const said = isRecord(value) ? value : null;
  const ask = finite(said?.ask);
  const on = stateRefOf(said?.on);
  if (!(said && ask !== null && on)) {
    return null;
  }
  const failed = isRecord(said.failed) ? said.failed : null;
  return {
    ask,
    on,
    move: moveReadOf(said.move),
    ...(said.superseded === true ? { superseded: true as const } : {}),
    ...(failed && typeof failed.message === "string"
      ? {
          failed: {
            message: failed.message,
            stack: typeof failed.stack === "string" ? failed.stack : "",
          },
        }
      : {}),
  };
}

/** A {@link StageLaid} as it crossed the frame; null when it is none. */
export function stageLaidOf(value: unknown): StageLaid | null {
  const said = isRecord(value) ? value : null;
  const need = finite(said?.need);
  const tall = finite(said?.tall);
  const scale = finite(said?.scale);
  return said && need !== null && need >= 0 && tall !== null
    ? {
        need,
        tall,
        fit: finite(said.fit),
        scale: scale !== null && scale > 0 && scale <= 1 ? scale : 1,
      }
    : null;
}

/** A {@link StageCompare} as it crossed the frame; null when it is none. */
export function stageCompareOf(value: unknown): StageCompare | null {
  const said = isRecord(value) ? value : null;
  const ask = finite(said?.ask);
  if (!(said && ask !== null)) {
    return null;
  }
  return {
    ask,
    against: stateRefOf(said.against),
    show: said.show === "compared" ? "compared" : "kept",
  };
}

/** A {@link StageReveal} as it crossed the frame; null when it is none. */
export function stageRevealOf(value: unknown): StageReveal | null {
  const what = isRecord(value) && isRecord(value.what) ? value.what : null;
  const difference = finite(what?.difference);
  if (difference !== null && difference >= 0) {
    return { what: { difference: Math.floor(difference) } };
  }
  const thing = nameOf(what?.thing);
  if (thing) {
    return { what: { thing } };
  }
  return what?.move === true ? { what: { move: true } } : null;
}

/** The most differences one read says: far past what the panel names (its `LINES_SHOWN`), so its count stays true. Ours. */
const DIFFERENCES_MAX = 500;
/** The longest line a difference is said in. Ours: core words/graph.ts quotes 40 characters of each value. */
const LINE_MAX = 400;

/** A {@link DifferenceRead} as it crossed the frame; null when it is none. */
function differenceOf(value: unknown): DifferenceRead | null {
  const said = isRecord(value) ? value : null;
  const box = isRecord(said?.box) ? said.box : null;
  const x = finite(box?.x);
  const y = finite(box?.y);
  const w = finite(box?.w);
  const h = finite(box?.h);
  const kind = said?.kind;
  if (
    !(
      said &&
      x !== null &&
      y !== null &&
      w !== null &&
      h !== null &&
      (kind === "came" || kind === "changed" || kind === "went")
    ) ||
    typeof said.line !== "string" ||
    said.line.length > LINE_MAX
  ) {
    return null;
  }
  return {
    kind,
    line: said.line,
    box: { x, y, w: Math.max(0, w), h: Math.max(0, h) },
    radius:
      typeof said.radius === "string" && said.radius.length <= NAME_MAX
        ? said.radius
        : "0px",
  };
}

/** A {@link StageDifferences} as it crossed the frame; null when it is none. */
export function stageDifferencesOf(value: unknown): StageDifferences | null {
  const said = isRecord(value) ? value : null;
  const ask = finite(said?.ask);
  if (!(said && ask !== null && Array.isArray(said.found))) {
    return null;
  }
  const found = said.found
    .slice(0, DIFFERENCES_MAX)
    .map(differenceOf)
    .filter((one): one is DifferenceRead => one !== null);
  return {
    ask,
    found,
    beside: said.beside === true,
    same: said.same === true && found.length === 0,
  };
}

/** The longest move a person plays, ms: a day. Ours: past the 30-minute move the face is drawn for. */
const MOVE_MS_MAX = DAY_MS;
const msOf = (value: unknown): number | null => {
  const ms = finite(value);
  return ms === null ? null : Math.min(MOVE_MS_MAX, Math.max(0, ms));
};
const REPEATS = new Set<ClipRepeat>(["once", "repeat", "mirror"]);
const DIRECTIONS = new Set<ClipDirection>([
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
]);

/** A {@link Tuning} as it crossed the frame; null when it is none. */
function tuningOneOf(value: unknown): Tuning | null {
  const said = isRecord(value) ? value : null;
  const id = nameOf(said?.id);
  const delay = msOf(said?.delay);
  const duration = msOf(said?.duration);
  const easing = wordsOf(said?.easing, POINTS_MAX * 8);
  if (!(said && id && delay !== null && duration !== null && easing)) {
    return null;
  }
  return {
    id,
    delay,
    duration: Math.max(1, duration),
    easing,
    shaped: said.shaped === true,
    legs: offsetsOf(said.legs),
    repeat: REPEATS.has(said.repeat as ClipRepeat)
      ? (said.repeat as ClipRepeat)
      : "once",
    values: valuesOf(said.values),
  };
}

const tuningOf = (value: unknown): Tuning[] =>
  Array.isArray(value)
    ? value
        .slice(0, CLIPS_MAX)
        .map(tuningOneOf)
        .filter((one): one is Tuning => one !== null)
    : [];

/** A {@link StagePlay} as it crossed the frame; null when it is none. */
export function stagePlayOf(value: unknown): StagePlay | null {
  const said = isRecord(value) ? value : null;
  const ask = finite(said?.ask);
  const from = msOf(said?.from);
  if (!(said && ask !== null && from !== null)) {
    return null;
  }
  return {
    ask,
    from,
    loopFrom: msOf(said.loopFrom) ?? 0,
    repeat: said.repeat === true,
    still: said.still === true,
    tuning: tuningOf(said.tuning),
  };
}

/** A {@link StagePause} as it crossed the frame; null when it is none. */
export function stagePauseOf(value: unknown): StagePause | null {
  const ask = isRecord(value) ? finite(value.ask) : null;
  return ask === null ? null : { ask };
}

/** A {@link StageLetGo} as it crossed the frame; null when it is none. */
export function stageLetGoOf(value: unknown): StageLetGo | null {
  const said = isRecord(value) ? value : null;
  const ask = finite(said?.ask);
  const t = msOf(said?.t);
  return said && ask !== null && t !== null ? { ask, t } : null;
}

/** A {@link StageSeek} as it crossed the frame; null when it is none. */
export function stageSeekOf(value: unknown): StageSeek | null {
  const at = stageLetGoOf(value);
  const said = value as Record<string, unknown>;
  return at ? { ...at, tuning: tuningOf(said.tuning) } : null;
}

/** A {@link StageRetime} as it crossed the frame; null when it is none. */
export function stageRetimeOf(value: unknown): StageRetime | null {
  const said = isRecord(value) ? value : null;
  const ask = finite(said?.ask);
  return said && ask !== null
    ? {
        ask,
        tuning: tuningOf(said.tuning),
        replayFrom: msOf(said.replayFrom),
      }
    : null;
}

/** A {@link StageRing} as it crossed the frame; null when it is none. */
export function stageRingOf(value: unknown): StageRing | null {
  const said = isRecord(value) ? value : null;
  if (!said) {
    return null;
  }
  return { thing: nameOf(said.thing), at: msOf(said.at) ?? 0 };
}

/** A {@link StageTime} as it crossed the frame; null when it is none. */
export function stageTimeOf(value: unknown): StageTime | null {
  const said = isRecord(value) ? value : null;
  const t = msOf(said?.t);
  const length = msOf(said?.length);
  const at = finite(said?.at);
  return said && t !== null && length !== null && at !== null
    ? { t, length, at, playing: said.playing === true }
    : null;
}

/** The most dials one canvas says. Ours: core stage `CANVAS_LIMITS`' dials stand well under it. */
const DIALS_MAX = 200;

/** Dial values by name as they crossed the frame: each a number, a string or a boolean. */
function dialValuesOf(value: unknown): Record<string, DialSet> | null {
  if (!isRecord(value)) {
    return null;
  }
  const kept: Record<string, DialSet> = {};
  for (const [name, one] of Object.entries(value).slice(0, DIALS_MAX)) {
    if (
      nameOf(name) &&
      (finite(one) !== null ||
        typeof one === "boolean" ||
        wordsOf(one, VALUE_MAX) !== null)
    ) {
      kept[name] = one as DialSet;
    }
  }
  return kept;
}

/** A {@link StageDials} as it crossed the frame; null when it is none. */
export function stageDialsOf(value: unknown): StageDials | null {
  const values = isRecord(value) ? dialValuesOf(value.values) : null;
  return values ? { values } : null;
}

/** A {@link StageRoom} as it crossed the frame; null when it is none. */
export function stageRoomOf(value: unknown): StageRoom | null {
  const px = isRecord(value) ? value.px : null;
  return typeof px === "number" && Number.isFinite(px) && px >= 0
    ? { px: Math.min(px, STAGE_ROOM_MOST) }
    : null;
}

/** A {@link StageDialsWritten} as it crossed the frame; null when it is none. */
export const stageDialsWrittenOf = (value: unknown): StageDialsWritten | null =>
  stageDialsOf(value);

/** A {@link StageFault} as it crossed the frame; null when it is none. */
export function stageFaultOf(value: unknown): StageFault | null {
  const said = isRecord(value) ? value : null;
  const on = stateRefOf(said?.on);
  return said && on && typeof said.message === "string"
    ? { on, message: said.message }
    : null;
}

const CASE_BREAK = /([a-z0-9])([A-Z])/gu;
/** A figure after a word (`JustOpened2`, a state Save as new state counted on): a word of its own, "Just opened 2". */
const FIGURE_BREAK = /([a-z])([0-9])/gu;

/** A story's export in plain words, CSF 3's own rule: `FailedSave` → "Failed save". */
export const storyWords = (name: string): string => {
  const spaced = name
    .replace(CASE_BREAK, "$1 $2")
    .replace(FIGURE_BREAK, "$1 $2")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** A phone twin's export: its state's export and `Phone` (`FailedSavePhone`). */
const PHONE_TWIN = /^(.+)Phone$/u;

/** A story by what names it: its export, and its CSF `name` where it writes one. */
export interface NamedStory {
  display: string | null;
  name: string;
}

/**
 * The story `story` is the phone twin of: an export ending in `Phone`
 * beside an export of its stem in `stories` (`FailedSavePhone` beside
 * `FailedSave`), the same state drawn at a phone's width; null for any
 * other. The one rule a twin is told by: its name (`shownName`) and the
 * design graph's model (a twin is its state at another width, never a
 * state before or after it) both read it.
 */
export const twinOf = <Named extends NamedStory>(
  story: NamedStory,
  stories: readonly Named[]
): Named | null => {
  const stem = PHONE_TWIN.exec(story.name)?.[1];
  return (stem && stories.find((one) => one.name === stem)) || null;
};

/**
 * The name a story is shown by, the one the states list, the inspector and
 * the stage page all say: its CSF `name`; else, for a phone twin
 * (`twinOf`), its state's name ", on a phone" ("Hub didn't answer, on a
 * phone"), so no states file names its twins by hand; else its export in
 * plain words.
 */
export const shownName = (
  story: NamedStory,
  stories: readonly NamedStory[]
): string => {
  if (story.display) {
    return story.display;
  }
  const sibling = twinOf(story, stories);
  return sibling
    ? words.onAPhone(shownName(sibling, stories))
    : storyWords(story.name);
};
