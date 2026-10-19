/**
 * A side surface's head controls where the head lacks room for them all
 * (DESIGN.md, Artifact panel, canvas and ink: the head's priority rule, the
 * web's as the native app's): the name keeps its own width up to
 * {@link NAME_KEEPS}px, Close stands last, and the rest stand by priority
 * ({@link HEAD_PRIORITY}) while they fit, each in its narrowest form (the
 * mode as one button, the chosen mode's glyph opening the three; Send picks
 * and Comments by glyph and count), the first with no room and every one
 * after it going in head order into one More menu before Close, so a wider
 * head never stands fewer. Then forms widen, each only where the room left
 * holds it: the mode takes its three segments back, then, on a pane
 * {@link WORDS_FROM}px or wider, Send picks and then Comments their words.
 */
import type { Snippet } from "svelte";

/** One of the pane's controls: drawn in the head while it fits, else as More's entries. */
export interface HeadItem {
  /** The control as the head draws it. */
  bar: Snippet;
  /** Its one-button form (the mode's chosen glyph opening the three): its narrowest, taken first, `bar` once the room left holds it. */
  compact?: Snippet;
  /** Its count, said on More while this stands in it and only above 0 (Comments' open pins), under the name `of` gives it. */
  count?: { n: number; of: string };
  /** More rules it off from its neighbours: a group of entries (the mode, the canvas view). */
  group?: boolean;
  key: string;
  /** The same control as More's entries. */
  menu: Snippet;
  /** Its place in {@link HEAD_PRIORITY}: the lower stands while the higher goes to More. */
  priority: number;
  /** `bar` says words its glyph and count stand without (Send picks, Comments): drawn `compact`, they go, and they come back only on a pane {@link WORDS_FROM}px or wider. */
  words?: boolean;
}

/** The order the controls give up the head, first kept first (Send picks, the mode, Comments, Expand, Reload, Inspect, the canvas view, Undock, Open in new tab, New canvas). */
export const HEAD_PRIORITY = {
  send: 1,
  mode: 2,
  comments: 3,
  expand: 4,
  reload: 5,
  inspect: 6,
  view: 7,
  undock: 8,
  open: 9,
  create: 10,
} as const;

/** The name keeps its own width up to this, in px, before any control stands. */
export const NAME_KEEPS = 120;

/** A pane this wide, in px, or wider lets Send picks and Comments say their words where the room holds them. */
export const WORDS_FROM = 640;

/** How a control stands in the head: whole, or in its narrowest form (the mode's one button, a glyph without its words). */
export type Standing = "whole" | "compact";

interface Sized {
  compact?: number;
  /** More says its count while this stands in it (Comments' open pins, above 0). */
  counted?: boolean;
  key: string;
  priority: number;
  width: number;
  words?: boolean;
}

/**
 * The controls that stand in a head `room` px wide, and how. Each is taken
 * at its narrowest (`compact` where it has one). All of them stand when
 * they fit beside what always stands (`kept`: the switch, the name's width
 * and Close); else, beside More, the priority prefix that fits: walked by
 * priority and stopped at the first that doesn't. More is taken at the
 * width it will be drawn at: `more.counted` while a `counted` control is
 * still to go in it, else `more.glyph`. Each control's place so hangs on
 * the ones before it and on `room` alone, and who stands grows with `room`,
 * so a wider head stands every control a narrower one does. Then forms
 * widen in priority order, each only where the room left holds the
 * difference: a one-button form its whole form first, then, with `words`
 * (a pane {@link WORDS_FROM}px or wider), a control's words. `gap` is the
 * head's own between any two.
 */
export function standing(
  room: number,
  gap: number,
  kept: number[],
  more: { counted: number; glyph: number },
  items: Sized[],
  words: boolean
): Map<string, Standing> {
  const base = kept.reduce((sum, width) => sum + width + gap, -gap);
  const narrowest = (one: Sized) =>
    Math.min(one.width, one.compact ?? one.width);
  const ranked = [...items].sort((a, b) => a.priority - b.priority);
  const all = ranked.reduce((sum, one) => sum + gap + narrowest(one), 0);
  const whole = base + all <= room;
  /** More's room beside the controls from `from` on, which go in it. */
  const moreOf = (from: number) =>
    whole
      ? 0
      : gap +
        (ranked.slice(from).some((one) => one.counted)
          ? more.counted
          : more.glyph);
  let left = room - base;
  const shown = new Map<string, Standing>();
  for (const [at, one] of ranked.entries()) {
    if (gap + narrowest(one) + moreOf(at + 1) > left) {
      break;
    }
    left -= gap + narrowest(one);
    shown.set(one.key, narrowest(one) < one.width ? "compact" : "whole");
  }
  left -= moreOf(shown.size);
  const widen = (one: Sized) => {
    const back = one.width - narrowest(one);
    if (shown.get(one.key) === "compact" && back <= left) {
      left -= back;
      shown.set(one.key, "whole");
    }
  };
  for (const one of ranked.filter((each) => !each.words)) {
    widen(one);
  }
  if (words) {
    for (const one of ranked.filter((each) => each.words)) {
      widen(one);
    }
  }
  return shown;
}
