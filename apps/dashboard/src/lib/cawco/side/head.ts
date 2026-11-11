/**
 * A side surface's head controls where the head lacks room for them all
 * (the artifact panel's surface brief, Artifact panel, canvas and ink: the head's priority rule, the
 * web's as the native app's): the name keeps its own width up to
 * {@link NAME_KEEPS}px, Close stands apart (last beside the page, first
 * on a phone's sheet), and the rest stand by priority
 * ({@link HEAD_PRIORITY}) while they fit, each in its narrowest form (the
 * mode as one button, the chosen mode's glyph opening the three; Send
 * by glyph and count), the first with no room and every one after it
 * going in head order into one More menu, the glass's last, so a wider
 * head never stands fewer. The name takes the rest of its own width (on a
 * phone's head, two lines' worth) once the controls up to
 * {@link NAME_AFTER} stand, before any after them, so Reload, Open and
 * Expand go to More before the title an agent wrote is cut; and forms
 * widen only after it, each only where the room left holds it: the mode takes its three segments
 * back, then, on a pane {@link WORDS_FROM}px or wider, Send its words
 * (the artifact panel's surface brief, The title). Comments is its bubble
 * and count at every width (the surface brief, The head), so it has no
 * words to take back.
 */
import type { Component, Snippet } from "svelte";

/** One of the pane's controls: drawn in the head while it fits, else as More's entries. */
export interface HeadItem {
  /** The control as the head draws it. */
  bar: Snippet;
  /** Its one-button form (the mode's chosen glyph opening the three): its narrowest, taken first, `bar` once the room left holds it. */
  compact?: Snippet;
  /** Its count, said on More while this stands in it and only above 0 (Comments' open pins), beside its own `glyph` so More says what it counts, under the name `of` gives it. */
  count?: { glyph: Component; n: number; of: string };
  /** More rules it off from its neighbours: a group of entries (the mode). */
  group?: boolean;
  key: string;
  /** The same control as More's entries. */
  menu: Snippet;
  /**
   * Where it stands in the head (HIG, Toolbars, Item groupings): in the
   * trailing glass of bare symbols (none), the centre (the mode, a
   * segmented control), after the name in its leading group (`lead`: a
   * browser's address, as a browser's toolbar holds it with the page's
   * title), or after the glass as the one prominent action (Send, Take
   * over), or in More whatever the room (`more`: an artifact's commands on
   * the whole of it), More standing last in the glass.
   */
  place?: "centre" | "lead" | "prominent" | "more";
  /** Its place in {@link HEAD_PRIORITY}: the lower stands while the higher goes to More. */
  priority: number;
  /** `bar` says words its glyph and count stand without (Send): drawn `compact`, they go, and they come back only on a pane {@link WORDS_FROM}px or wider. */
  words?: boolean;
}

/** The order the controls give up the head, first kept first (a browser's Take over or Hand back, its address, Send, the mode, Comments, Expand, Reload, Undock, Open in new tab). The panel offers no New canvas: a canvas is made from the composer. */
export const HEAD_PRIORITY = {
  control: 0,
  address: 1,
  send: 2,
  mode: 3,
  comments: 4,
  expand: 5,
  reload: 6,
  undock: 7,
  open: 8,
} as const;

/** The name keeps its own width up to this, in px, before any control stands. */
export const NAME_KEEPS = 120;

/** The controls of this priority or lower stand before the name takes the rest of its width: the prominent action, the mode and Comments. */
const NAME_AFTER = HEAD_PRIORITY.comments;

/** A pane this wide, in px, or wider lets Send say its words where the room holds them. */
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
 * so a wider head stands every control a narrower one does. Before the
 * first control past {@link NAME_AFTER}, the name takes what it still wants
 * past what it kept (`nameWants`), as much as the room left beside More
 * holds; then forms widen in priority order, each only where the room left holds the
 * difference: a one-button form its whole form first, then, with `words`
 * (a pane {@link WORDS_FROM}px or wider), a control's words. `gap` is the
 * head's own between what always stands; `itemGap` the glass's between its
 * controls and More (under a finger the glass spaces its symbols wider than
 * the head its groups: taken at the head's, the controls stood 10px each
 * wider than measured and the name lost that room).
 */
export function standing(
  room: number,
  gap: number,
  kept: number[],
  more: { counted: number; glyph: number },
  items: Sized[],
  words: boolean,
  nameWants = 0,
  itemGap = gap
): Map<string, Standing> {
  const base = kept.reduce((sum, width) => sum + width + gap, -gap);
  const narrowest = (one: Sized) =>
    Math.min(one.width, one.compact ?? one.width);
  const ranked = [...items].sort((a, b) => a.priority - b.priority);
  const all = ranked.reduce((sum, one) => sum + itemGap + narrowest(one), 0);
  const whole = base + all <= room;
  /** More's room beside the controls from `from` on, which go in it. */
  const moreOf = (from: number) =>
    whole
      ? 0
      : itemGap +
        (ranked.slice(from).some((one) => one.counted)
          ? more.counted
          : more.glyph);
  let left = room - base;
  const shown = new Map<string, Standing>();
  let named = false;
  /** The name takes the rest of its width, as much as the room left beside More holds (`from` on going in it). */
  const name = (from: number) => {
    if (!named) {
      named = true;
      left -= Math.max(0, Math.min(nameWants, left - moreOf(from)));
    }
  };
  for (const [at, one] of ranked.entries()) {
    if (one.priority > NAME_AFTER) {
      name(at);
    }
    if (itemGap + narrowest(one) + moreOf(at + 1) > left) {
      break;
    }
    left -= itemGap + narrowest(one);
    shown.set(one.key, narrowest(one) < one.width ? "compact" : "whole");
  }
  name(shown.size);
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
