/**
 * The bounds of an artifact's `state` (Projects spec §5.10), the same at every
 * end: the overlay checks what a page writes, the hub checks what it keeps.
 * A module of its own so the preview overlay bundles these and nothing else
 * of core.
 */

/**
 * One id's entry in an artifact's `state` (Projects spec §5.10): the options
 * picked for a choice, the person's note on it, or a value the page `set`.
 * `pageHash` is the page the person was looking at when it last changed, so
 * a pick made on an earlier revision can be told apart.
 */
export interface ChoiceEntry {
  at: string;
  note: string | null;
  /** Options picked, in the order picked; empty when cleared. */
  options: string[];
  pageHash: string;
  /** What `cawco.set` stored under this id; null when nothing was set. */
  value: unknown;
}

/**
 * The bridge's bounds, the same at both ends: the pane checks what the page
 * posts (wire.ts) and the hub checks what the pane sends. An id is refused
 * past its bound, never cut, since a cut id would be another id.
 */
export const CHOICE_LIMITS = {
  /** A choice's id, or a key `cawco.set` writes. */
  id: 200,
  option: 200,
  /** Options one multiple choice can hold at once. */
  options: 50,
  note: 2000,
  /** A set value, as JSON. */
  value: 2000,
  /** Ids one artifact's `state` keeps. */
  perArtifact: 500,
} as const;
/** An id or option: no control characters, no spaces at either end. */
export const CHOICE_ID = /^[^\s\p{Cc}](?:[^\p{Cc}]*[^\s\p{Cc}])?$/u;
export const PAGE_HASH = /^[0-9a-f]{64}$/;

/** One change the page asks for: exactly one of options, note or value. */
export type ChoiceChange = { choice: string; pageHash: string } & (
  | { options: string[] }
  | { note: string }
  | { value: unknown }
);

/** An artifact's choices as the page reads them through the bridge (`cawco.on("picks")`). */
export interface ArtifactChoices {
  choices: Record<string, ChoiceEntry>;
  /** The page's hash when the hub last built it; null for a preview. */
  pageHash: string | null;
  /** When the person last sent their picks to the session. */
  sentAt: string | null;
}

const isChoiceId = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max && CHOICE_ID.test(value);

/**
 * Why `value` is not an entry an artifact's `state` may hold under `key`, or
 * null when it is: the bounds of {@link CHOICE_LIMITS}, checked by the pane
 * before it writes and by the hub before it keeps a write.
 */
export const choiceEntryProblem = (
  key: string,
  value: unknown
): string | null => {
  if (!isChoiceId(key, CHOICE_LIMITS.id)) {
    return `A choice's id must be 1 to ${CHOICE_LIMITS.id} characters, with no control characters and no spaces at either end.`;
  }
  const entry = value as Partial<ChoiceEntry> | null;
  if (
    entry === null ||
    typeof entry !== "object" ||
    typeof entry.at !== "string" ||
    typeof entry.pageHash !== "string" ||
    !Array.isArray(entry.options) ||
    !(entry.note === null || typeof entry.note === "string") ||
    !("value" in entry)
  ) {
    return `${key} is not a choice entry: it holds options, note, value, pageHash and at.`;
  }
  if (!PAGE_HASH.test(entry.pageHash)) {
    return `${key}'s pageHash must be the page's sha256, hex.`;
  }
  if (entry.options.length > CHOICE_LIMITS.options) {
    return `A choice holds at most ${CHOICE_LIMITS.options} options.`;
  }
  if (!entry.options.every((one) => isChoiceId(one, CHOICE_LIMITS.option))) {
    return `An option must be 1 to ${CHOICE_LIMITS.option} characters, with no control characters and no spaces at either end.`;
  }
  if ((entry.note ?? "").length > CHOICE_LIMITS.note) {
    return `A note stops at ${CHOICE_LIMITS.note} characters.`;
  }
  if (JSON.stringify(entry.value ?? null).length > CHOICE_LIMITS.value) {
    return `A set value stops at ${CHOICE_LIMITS.value} characters of JSON.`;
  }
  return null;
};

/**
 * A note as kept and read: the person's words as typed, line breaks and
 * all, with no trailing whitespace (a textarea's last Return); none when
 * nothing is left.
 */
export const noteText = (note: string | null | undefined): string | null =>
  note?.trimEnd() || null;

/** The entry `change` makes of `before` (absent: nothing kept yet), stamped `at`. */
export const changedEntry = (
  before: ChoiceEntry | undefined,
  change: ChoiceChange,
  at: string
): ChoiceEntry => ({
  options: "options" in change ? change.options : (before?.options ?? []),
  note: "note" in change ? noteText(change.note) : (before?.note ?? null),
  value: "value" in change ? (change.value ?? null) : (before?.value ?? null),
  pageHash: change.pageHash,
  at,
});
