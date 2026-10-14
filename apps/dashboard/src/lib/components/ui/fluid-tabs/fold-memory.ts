/**
 * Each folder tab's shape as it was last measured (its box, and the rim's
 * stroke and taper there), kept so the server draws it (fold-path.ts) to the
 * same numbers the client will measure: a tab's width is its label as the
 * browser lays it out, which the server cannot know, and a shape drawn to a
 * guess and stretched to the box showed a wrong contour until the page ran.
 * A tab no browser here has measured yet is drawn once it is (TabItem).
 *
 * Kept in localStorage, the source, and as a pref (lib/cawco/prefs.ts), the
 * server's copy, which the layout's load reads. Keyed by the tab's value, the
 * most recently measured last, at most `KEPT` of them and fewer where they
 * would not fit a cookie: the oldest go first.
 */
import { keepPrefs, PREF_VALUE_LIMIT, type Pref } from "#lib/cawco/prefs.js";
import type { FoldBox } from "./fold-path";

/** A tab's measured shape: its box, and its rim's stroke and taper. */
export interface FoldMeasure {
  box: FoldBox;
  ink: { ease: number; stroke: number; taper: number };
}

export const FOLD_BOXES_PREF = "cawco-tab-boxes" satisfies Pref;
const KEPT = 40;
const STORED_LENGTH = 9;
/**
 * Tabs settle together (a strip's every tab after a load or a resize): their
 * shapes go to the server as one request once they have, not one each.
 */
const SEND_AFTER = 120;

type Stored = number[];

const isStored = (value: unknown): value is Stored =>
  Array.isArray(value) &&
  value.length === STORED_LENGTH &&
  value.every((n) => typeof n === "number" && Number.isFinite(n));

const measureOf = (stored: Stored): FoldMeasure => {
  const [
    width,
    height,
    flare,
    radius,
    slopeStart,
    slopeEnd,
    stroke,
    taper,
    ease,
  ] = stored as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return {
    box: { width, height, flare, radius, slopeStart, slopeEnd },
    ink: { stroke, taper, ease },
  };
};

const storedOf = ({ box, ink }: FoldMeasure): Stored =>
  [
    box.width,
    box.height,
    box.flare,
    box.radius,
    box.slopeStart,
    box.slopeEnd,
    ink.stroke,
    ink.taper,
    ink.ease,
  ].map((n) => Math.round(n * 100) / 100);

const entriesOf = (raw: string | null | undefined): [string, Stored][] => {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? Object.entries(parsed).filter((entry): entry is [string, Stored] =>
          isStored(entry[1])
        )
      : [];
  } catch {
    return [];
  }
};

/** The kept shapes, by value; nothing for a value that is not them. */
export function parseFoldBoxes(
  raw: string | null | undefined
): Record<string, FoldMeasure> {
  return Object.fromEntries(
    entriesOf(raw).map(([value, stored]) => [value, measureOf(stored)])
  );
}

/** The newest entries, as many of the last `KEPT` as fit a pref. */
const fitted = (entries: [string, Stored][]): string => {
  let kept = entries.slice(-KEPT);
  let value = JSON.stringify(Object.fromEntries(kept));
  while (
    kept.length > 0 &&
    encodeURIComponent(value).length > PREF_VALUE_LIMIT
  ) {
    kept = kept.slice(1);
    value = JSON.stringify(Object.fromEntries(kept));
  }
  return value;
};

const storedValue = (): string | null => {
  try {
    return localStorage.getItem(FOLD_BOXES_PREF);
  } catch {
    // A browser that will not read storage starts from nothing kept.
    return null;
  }
};

let sending: ReturnType<typeof setTimeout> | undefined;

/** Keeps a tab's measured shape for the server's next render (client only). */
export function rememberFoldBox(value: string, measure: FoldMeasure): void {
  const kept = new Map(entriesOf(storedValue()));
  const next = storedOf(measure);
  const was = kept.get(value);
  if (was?.every((n, i) => n === next[i])) {
    return;
  }
  kept.delete(value);
  kept.set(value, next);
  const fit = fitted([...kept]);
  try {
    localStorage.setItem(FOLD_BOXES_PREF, fit);
  } catch {
    // A browser that will not store sends the server this one alone.
  }
  clearTimeout(sending);
  sending = setTimeout(
    () => keepPrefs({ [FOLD_BOXES_PREF]: storedValue() ?? fit }),
    SEND_AFTER
  );
}
