/**
 * The person's tuned timing of a component canvas's moves (the design
 * graph's Animation face): a machine record the panel writes into the
 * artifact's doc in a map of its own, `tuned`, each move's records under the
 * move's name, the way ink keeps its own map with its own bounds (ink.ts).
 * A choice entry's value stops at 2,000 characters (choices.ts), a person's
 * pick's size; a move of a morphed text's forty letters retimed is eighty
 * records, near fifteen thousand.
 *
 * The hub answers the map as the one `tuned` entry it always answered
 * ({@link tunedEntryOf}): every move's records in order, and the newest
 * move's moment, so it counts as the judgement's answer and goes with a
 * Send as a choice entry does.
 */

import { type ChoiceEntry, PAGE_HASH } from "./choices";
import type { MapDoc } from "./doc-maps";
import type { ClipRepeat, ClipValue } from "./stage-graph";
import { cutShort } from "./words/helpers";

/** The doc's map of tuned moves. */
export const TUNED_MAP = "tuned";

/**
 * One timing as the agent reads it (`artifact_read`'s `tuned`): the move,
 * the animation by its element and property, its begin from the move's
 * start, its length and its curve. `repeat`, `legs` and `values` stand only
 * where he changed them.
 */
export interface TunedRecord {
  animation: string;
  delay: number;
  duration: number;
  easing: string;
  /** Where its legs meet, as offsets between its first frame and its last. */
  legs?: number[];
  move: string;
  /** Its length or its curve is none of the design system's tokens: the agent's note, never shown on the face. */
  offTokens: boolean;
  repeat?: ClipRepeat;
  /** What each property runs between, as he typed it. */
  values?: ClipValue[];
}

/** One move's records as the map keeps them, with when and on which page they were made. */
interface TunedMove {
  at: string;
  pageHash: string;
  records: TunedRecord[];
}

/** The map's bounds. Ours: far past any move a person tunes, short of a doc a phone can't hold. */
const TUNED_LIMITS = {
  /** Moves a canvas keeps tuned. */
  moves: 200,
  /** Records one move keeps: its animations, a morphed text's letters each. */
  records: 2000,
  /** The longest words a record holds (a move's or an animation's name, an easing, a value). */
  text: 400,
  /** Legs one record names, and values. */
  parts: 50,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length <= TUNED_LIMITS.text;
const isFigure = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const REPEATS = new Set(["once", "repeat", "mirror"]);

/** Whether `value` is one record within the bounds. */
const recordOk = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const { legs, values } = value;
  return (
    isText(value.move) &&
    isText(value.animation) &&
    isText(value.easing) &&
    isFigure(value.delay) &&
    isFigure(value.duration) &&
    typeof value.offTokens === "boolean" &&
    (value.repeat === undefined || REPEATS.has(String(value.repeat))) &&
    (legs === undefined ||
      (Array.isArray(legs) &&
        legs.length <= TUNED_LIMITS.parts &&
        legs.every(isFigure))) &&
    (values === undefined ||
      (Array.isArray(values) &&
        values.length <= TUNED_LIMITS.parts &&
        values.every(
          (one) =>
            isRecord(one) &&
            isText(one.property) &&
            isText(one.from) &&
            isText(one.to)
        )))
  );
};

/** Why `moves`, the `tuned` map's entries after a write, may not be kept; null when they may. */
export function tunedProblem(moves: [string, unknown][]): string | null {
  if (moves.length > TUNED_LIMITS.moves) {
    return `A canvas keeps at most ${TUNED_LIMITS.moves} tuned moves.`;
  }
  for (const [move, kept] of moves) {
    const one = isRecord(kept) ? kept : null;
    if (!(
      isText(move) &&
      one &&
      typeof one.at === "string" &&
      typeof one.pageHash === "string" &&
      PAGE_HASH.test(one.pageHash) &&
      Array.isArray(one.records)
    )) {
      return `Tuned move ${cutShort(move, 80)} holds at, pageHash and records.`;
    }
    if (one.records.length > TUNED_LIMITS.records) {
      return `A tuned move keeps at most ${TUNED_LIMITS.records} records.`;
    }
    if (!one.records.every(recordOk)) {
      return `A record of tuned move ${cutShort(move, 80)} is not a tuned timing: it holds move, animation, delay, duration, easing and offTokens, each within ${TUNED_LIMITS.text} characters.`;
    }
  }
  return null;
}

/**
 * The map read as the one `tuned` entry the hub answers and counts (its
 * picks' `tuned`): every move's records in order, the newest move's moment
 * and page; null while no move is tuned.
 */
export function tunedEntryOf(
  moves: Readonly<Record<string, unknown>>
): ChoiceEntry | null {
  const kept = Object.values(moves).filter(
    (one): one is TunedMove =>
      isRecord(one) && Array.isArray(one.records) && one.records.length > 0
  );
  if (kept.length === 0) {
    return null;
  }
  const newest = kept.reduce((a, b) => (b.at > a.at ? b : a));
  return {
    options: [],
    note: null,
    value: kept.flatMap((one) => one.records),
    pageHash: newest.pageHash,
    at: newest.at,
  };
}

/**
 * Every move's records kept in `doc`'s `tuned` map, each under its move's
 * name, made on page `pageHash` at `at`: a move whose records changed is
 * written anew, one with none left is taken out.
 */
export function keepTuned(
  doc: MapDoc,
  records: readonly TunedRecord[],
  pageHash: string,
  at: string
): void {
  const map = doc.getMap<TunedMove>(TUNED_MAP);
  const byMove = new Map<string, TunedRecord[]>();
  for (const one of records) {
    byMove.set(one.move, [...(byMove.get(one.move) ?? []), one]);
  }
  doc.transact(() => {
    for (const move of [...map.keys()]) {
      if (!byMove.has(move)) {
        map.delete(move);
      }
    }
    for (const [move, own] of byMove) {
      if (JSON.stringify(map.get(move)?.records) !== JSON.stringify(own)) {
        map.set(move, { at, pageHash, records: own });
      }
    }
  });
}
