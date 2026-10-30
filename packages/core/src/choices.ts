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
  /**
   * Who settled the pick, when it was not the person (hub settling.ts, the
   * `settle` tool): the member, the session, why and its sources. Absent on
   * the person's own pick, whose why is its note. Only the hub writes it.
   */
  settled?: SettledBy;
  /** What `cawco.set` stored under this id; null when nothing was set. */
  value: unknown;
}

/** A pick the hub wrote for a card from `settle`: by which member of Who decides (core decides.ts), why, and on what sources. */
export interface SettledBy {
  /** The member's id. */
  by: string;
  /** The member's name as it was then: "Advisor". */
  name: string;
  /** What it ran on then: "Claude Code · Opus 5.5"; null when nothing names it. */
  runs: string | null;
  /** The session that settled it, by id. */
  session: string;
  /** Links it rests on; common practice's name one at least. */
  sources: string[];
  why: string;
}

/** A member's id, as `settled.by` names it (core decides.ts `DECIDES_ID`). */
const MEMBER_ID = /^[a-z][a-z0-9-]{0,62}$/u;

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
  /** A settled pick's why. */
  why: 2000,
  /** A settled pick's member name, and what it ran on. */
  name: 80,
  runs: 200,
  /** A settled pick's sources, and each one's length. */
  sources: 20,
  source: 2000,
  /** Ids one artifact's `state` keeps. */
  perArtifact: 500,
} as const;
/** An id or option: no control characters, no spaces at either end. */
export const CHOICE_ID = /^[^\s\p{Cc}](?:[^\p{Cc}]*[^\s\p{Cc}])?$/u;
export const PAGE_HASH = /^[0-9a-f]{64}$/u;

/** One change the page asks for: exactly one of options, note or value. */
export type ChoiceChange = { choice: string; pageHash: string } & (
  { options: string[] } | { note: string } | { value: unknown }
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
  return entry.settled === undefined ? null : settledProblem(entry.settled);
};

/** Why `settled` is not a settled pick's record, or null when it is. */
const settledProblem = (settled: unknown): string | null => {
  const given = settled as Partial<SettledBy> | null;
  if (
    given === null ||
    typeof given !== "object" ||
    typeof given.by !== "string" ||
    !MEMBER_ID.test(given.by) ||
    typeof given.name !== "string" ||
    !(given.runs === null || typeof given.runs === "string") ||
    typeof given.session !== "string" ||
    typeof given.why !== "string" ||
    !Array.isArray(given.sources)
  ) {
    return "settled holds by (a member's id), name, runs, session, why and sources.";
  }
  if (given.name.length === 0 || given.name.length > CHOICE_LIMITS.name) {
    return `A settled pick's name is 1 to ${CHOICE_LIMITS.name} characters.`;
  }
  if (
    given.runs !== null &&
    (given.runs.length === 0 || given.runs.length > CHOICE_LIMITS.runs)
  ) {
    return `A settled pick's runs is null or 1 to ${CHOICE_LIMITS.runs} characters.`;
  }
  if (given.why.length === 0 || given.why.length > CHOICE_LIMITS.why) {
    return `A settled pick's why is 1 to ${CHOICE_LIMITS.why} characters.`;
  }
  if (
    given.sources.length > CHOICE_LIMITS.sources ||
    !given.sources.every(
      (one) =>
        typeof one === "string" &&
        one.length > 0 &&
        one.length <= CHOICE_LIMITS.source
    )
  ) {
    return `A settled pick names at most ${CHOICE_LIMITS.sources} sources, each 1 to ${CHOICE_LIMITS.source} characters.`;
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

/**
 * The entry `change` makes of `before` (absent: nothing kept yet), stamped
 * `at`. A pick the hub settled keeps who settled it until the person picks
 * otherwise: a note or a value beside it leaves it theirs.
 */
export const changedEntry = (
  before: ChoiceEntry | undefined,
  change: ChoiceChange,
  at: string
): ChoiceEntry => {
  const options =
    "options" in change ? change.options : (before?.options ?? []);
  const settled =
    before?.settled && sameOptions(before.options, options)
      ? { settled: before.settled }
      : {};
  return {
    options,
    note: "note" in change ? noteText(change.note) : (before?.note ?? null),
    value: "value" in change ? (change.value ?? null) : (before?.value ?? null),
    pageHash: change.pageHash,
    at,
    ...settled,
  };
};

/** Whether two picks hold the same options, in any order. */
export const sameOptions = (
  a: readonly string[],
  b: readonly string[]
): boolean => a.length === b.length && a.every((option) => b.includes(option));

/**
 * Why a person's write of `after` over `before` may not be kept for its
 * `settled`, or null: only the hub settles a pick, so the person's write
 * carries the settled record it had, unchanged, on the same pick, or none.
 */
export const settledWriteProblem = (
  before: ChoiceEntry | undefined,
  after: ChoiceEntry
): string | null => {
  if (after.settled === undefined) {
    return null;
  }
  return before?.settled &&
    JSON.stringify(before.settled) === JSON.stringify(after.settled) &&
    sameOptions(before.options, after.options)
    ? null
    : "Only the hub settles a pick: the person's pick carries no settled record of its own.";
};
