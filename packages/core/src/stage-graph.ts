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

/** One animation a reach set off, as the page read it: the element and its frames stay on the page. */
export interface ClipRead {
  delay: number;
  duration: number;
  easing: string;
  /** What moves, in words (the page's `nameOf`). */
  element: string;
  /** Its curve lives in its frames (a Svelte transition): a run of three or more frames on a linear timing. */
  framed: boolean;
  /** Stable for the move's life: the order the engine started it in. */
  id: string;
  kind: ClipKind;
  /** `opacity`, `transform, opacity`, a keyframes' name. */
  property: string;
  /** Ms since the move began, from its own start time on the page's document timeline. */
  start: number;
  /** The page's id for the thing a row names; null once it is gone. */
  thing: string | null;
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
 * Pane → page: a region of the drawing brought into the page's view with
 * room for a ring round it: what the last reach changed (`move`; while
 * comparing, the first difference's ring stands for it), or the n-th
 * difference the page last told (`difference`), the compared drawing shown
 * in the kept one's place for one that went where the two don't stand side
 * by side.
 */
export const STAGE_REVEAL = "cawco:stage-reveal";
export interface StageReveal {
  what: { move: true } | { difference: number };
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

/** A {@link StageReached} as it crossed the frame; null when it is none. Its move is left behind: no face of the panel reads its clips yet. */
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
    move: null,
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

/** A {@link StageFault} as it crossed the frame; null when it is none. */
export function stageFaultOf(value: unknown): StageFault | null {
  const said = isRecord(value) ? value : null;
  const on = stateRefOf(said?.on);
  return said && on && typeof said.message === "string"
    ? { on, message: said.message }
    : null;
}

const CASE_BREAK = /([a-z0-9])([A-Z])/gu;

/** A story's export in plain words, CSF 3's own rule: `FailedSave` → "Failed save". */
export const storyWords = (name: string): string => {
  const spaced = name.replace(CASE_BREAK, "$1 $2").toLowerCase();
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
