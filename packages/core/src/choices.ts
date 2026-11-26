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
  /**
   * The person put the question down without a pick (a parked pick's
   * Dismiss): `options` is empty and `note` null. A dismissal recorded
   * before answers in his own words existed (`ownWords`) may hold them in
   * `note`. A pick of his replaces it, and so do words he writes on it.
   */
  dismissed?: true;
  /**
   * The person's own words an agent recorded this pick from (`record_pick`):
   * his pin on the page or a message he typed, quoted. Absent on a pick he
   * made himself. Only the hub writes it, and his own pick clears it.
   */
  from?: PickFrom;
  note: string | null;
  /** Options picked, in the order picked; empty when cleared. */
  options: string[];
  /**
   * The person answered the question in his own words, with no pick (a
   * parked pick's Other line): `note` holds those words and `options` is
   * empty. It answers the question as a pick does; a pick of his replaces
   * it.
   */
  ownWords?: true;
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

/**
 * Where a pick an agent recorded for the person came from (`record_pick`):
 * his pin on the card's page (`pin`, its id) or a message he typed to a
 * session (`message`, the send's uuid), the words of it that answer the
 * card (`quote`, found in it by the hub), and the session that recorded it.
 */
export type PickFrom = { quote: string; session: string } & (
  { pin: string } | { message: string }
);

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

/** An id or option: no control characters, no spaces at either end. */
const CHOICE_ID = /^[^\s\p{Cc}](?:[^\p{Cc}]*[^\s\p{Cc}])?$/u;
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

/**
 * The person's picks and notes written since their last Send (`sentAt`,
 * ISO; null before one): what Send sends of a page's choices, the values
 * he is trying out too. The hub's record of a Send, read alike by
 * artifact_read and the page's own Send.
 */
export const unsentChoices = (
  state: Record<string, ChoiceEntry>,
  sentAt: string | null
): number =>
  Object.values(state).filter((entry) => !sentAt || entry.at > sentAt).length;

/**
 * The keys of an artifact's `state` that hold values the person is trying
 * out: a design graph's or a decision page's dials (`dials`) and a design
 * graph's tuned motion (`tuned`, tuned.ts). Each is kept as he moves it, so
 * a reload keeps it, and goes with whatever he sends (a pick, a Send, a
 * pin, a note), but none is an answer by itself.
 */
const TRIAL_KEYS: ReadonlySet<string> = new Set(["dials", "tuned"]);

/**
 * THE ONE RULE OF WHAT IN AN ARTIFACT'S `state` IS THE PERSON'S ANSWER:
 * every entry but the values he is trying out ({@link TRIAL_KEYS}). Only
 * these answer a question, count as his act on it, and send it by
 * themselves, so a dial he moves never wakes the session that made the
 * artifact; it hears his values when he picks or sends (the owner,
 * 2026-11-21: "Only Pick or Send wakes it").
 */
export const answersIn = <Entry>(
  state: Readonly<Record<string, Entry>>
): Record<string, Entry> =>
  Object.fromEntries(
    Object.entries(state).filter(([key]) => !TRIAL_KEYS.has(key))
  );

const isChoiceId = (value: unknown): value is string =>
  typeof value === "string" && CHOICE_ID.test(value);

/**
 * Why `entry` is not an entry an artifact's `state` may hold under `key`, or
 * null when it is: checked by the pane before it writes and by the hub
 * before it keeps a write.
 */
export const choiceEntryProblem = (
  key: string,
  entry: unknown
): string | null => {
  if (!isChoiceId(key)) {
    return "A choice's id must be 1 or more characters, with no control characters and no spaces at either end.";
  }
  if (
    entry === null ||
    typeof entry !== "object" ||
    !("at" in entry) ||
    typeof entry.at !== "string" ||
    !("pageHash" in entry) ||
    typeof entry.pageHash !== "string" ||
    !("options" in entry) ||
    !Array.isArray(entry.options) ||
    !("note" in entry) ||
    !(entry.note === null || typeof entry.note === "string") ||
    !("value" in entry)
  ) {
    return `${key} is not a choice entry: it holds options, note, value, pageHash and at.`;
  }
  if (!PAGE_HASH.test(entry.pageHash)) {
    return `${key}'s pageHash must be the page's sha256, hex.`;
  }
  if (!entry.options.every((one) => isChoiceId(one))) {
    return "An option must be 1 or more characters, with no control characters and no spaces at either end.";
  }
  return (
    dismissedProblem(key, entry, entry.options) ??
    ownWordsProblem(key, entry, entry.options, entry.note) ??
    recordsProblem(key, entry)
  );
};

/** Why an entry's hub records (`settled`, `from`) are not a pick's, or null when they are or there are none. */
const recordsProblem = (key: string, entry: object): string | null => {
  const settled = "settled" in entry ? entry.settled : undefined;
  if (settled !== undefined) {
    const problem = settledProblem(settled);
    if (problem) {
      return problem;
    }
  }
  if ("from" in entry && entry.from !== undefined) {
    return settled === undefined
      ? fromProblem(entry.from)
      : `${key} holds both a settled record and the person's words: a pick is one or the other.`;
  }
  return null;
};

/** Why an entry's dismissal ({@link ChoiceEntry.dismissed}) is not one, or null when it is or there is none: true, on no options. */
const dismissedProblem = (
  key: string,
  entry: object,
  options: readonly unknown[]
): string | null => {
  const dismissed = "dismissed" in entry ? entry.dismissed : undefined;
  if (dismissed === undefined) {
    return null;
  }
  if (dismissed !== true) {
    return `${key}'s dismissed is true or absent.`;
  }
  return options.length > 0
    ? `${key} is dismissed: a dismissal holds no options.`
    : null;
};

/** Why an entry's answer in his own words ({@link ChoiceEntry.ownWords}) is not one, or null when it is or there is none: true, on words and no options, never dismissed. */
const ownWordsProblem = (
  key: string,
  entry: object,
  options: readonly unknown[],
  note: string | null
): string | null => {
  const own = "ownWords" in entry ? entry.ownWords : undefined;
  if (own === undefined) {
    return null;
  }
  if (own !== true) {
    return `${key}'s ownWords is true or absent.`;
  }
  if (options.length > 0) {
    return `${key} is answered in his own words: such an answer holds no options.`;
  }
  if (!note?.trim()) {
    return `${key} is answered in his own words: its note holds them.`;
  }
  return "dismissed" in entry && entry.dismissed !== undefined
    ? `${key} is both dismissed and answered in his own words: it is one or the other.`
    : null;
};

/** Why `given` is not a recorded pick's source ({@link PickFrom}), or null when it is. */
const fromProblem = (given: unknown): string | null => {
  if (
    given === null ||
    typeof given !== "object" ||
    !("quote" in given) ||
    typeof given.quote !== "string" ||
    !("session" in given) ||
    typeof given.session !== "string" ||
    "pin" in given === "message" in given ||
    ("pin" in given && typeof given.pin !== "string") ||
    ("message" in given && typeof given.message !== "string")
  ) {
    return "from holds quote, session, and one of pin or message.";
  }
  return given.quote.length === 0
    ? "A recorded pick's quote is 1 or more characters."
    : null;
};

/** Whether `entry` is an entry an artifact's `state` may hold under `key` ({@link choiceEntryProblem} finds nothing wrong). */
export const isChoiceEntry = (
  key: string,
  entry: unknown
): entry is ChoiceEntry => choiceEntryProblem(key, entry) === null;

/** Why `given` is not a settled pick's record, or null when it is. */
const settledProblem = (given: unknown): string | null => {
  if (
    given === null ||
    typeof given !== "object" ||
    !("by" in given) ||
    typeof given.by !== "string" ||
    !MEMBER_ID.test(given.by) ||
    !("name" in given) ||
    typeof given.name !== "string" ||
    !("runs" in given) ||
    !(given.runs === null || typeof given.runs === "string") ||
    !("session" in given) ||
    typeof given.session !== "string" ||
    !("why" in given) ||
    typeof given.why !== "string" ||
    !("sources" in given) ||
    !Array.isArray(given.sources)
  ) {
    return "settled holds by (a member's id), name, runs, session, why and sources.";
  }
  if (given.name.length === 0) {
    return "A settled pick's name is 1 or more characters.";
  }
  if (given.runs !== null && given.runs.length === 0) {
    return "A settled pick's runs is null or 1 or more characters.";
  }
  if (given.why.length === 0) {
    return "A settled pick's why is 1 or more characters.";
  }
  if (
    !given.sources.every((one) => typeof one === "string" && one.length > 0)
  ) {
    return "A settled pick's sources are each 1 or more characters.";
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
 * `at`. A pick the hub settled, or recorded from the person's words, keeps
 * its record until the person picks otherwise: a note or a value beside it
 * leaves it as it is, and his own pick replaces it whole. An answer in his
 * own words stands while its words do: a pick or a value replaces it. A
 * dismissal stands until he picks or writes: words he writes on it are his
 * words, never the dismissal's.
 */
export const changedEntry = (
  before: ChoiceEntry | undefined,
  change: ChoiceChange,
  at: string
): ChoiceEntry => {
  const options =
    "options" in change ? change.options : (before?.options ?? []);
  const same = before !== undefined && sameOptions(before.options, options);
  const note =
    "note" in change ? noteText(change.note) : (before?.note ?? null);
  return {
    options,
    note,
    value: "value" in change ? (change.value ?? null) : (before?.value ?? null),
    pageHash: change.pageHash,
    at,
    ...(same && before.settled ? { settled: before.settled } : {}),
    ...(same && before.from ? { from: before.from } : {}),
    ...(before?.ownWords && "note" in change && note !== null
      ? { ownWords: true as const }
      : {}),
    ...(before?.dismissed && !("note" in change) && options.length === 0
      ? { dismissed: true as const }
      : {}),
  };
};

/**
 * The entry the person's answer in his own words makes (a parked pick's
 * Other line), stamped `at` on page `pageHash`: no pick, and `words` as his
 * answer.
 */
export const ownWordsEntry = (
  words: string,
  pageHash: string,
  at: string
): ChoiceEntry => ({
  options: [],
  note: noteText(words),
  value: null,
  pageHash,
  at,
  ownWords: true,
});

/** The entry the person's Dismiss makes, stamped `at` on page `pageHash`: no pick and no words. */
export const dismissedEntry = (pageHash: string, at: string): ChoiceEntry => ({
  options: [],
  note: null,
  value: null,
  pageHash,
  at,
  dismissed: true,
});

/** Whether two picks hold the same options, in any order. */
const sameOptions = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((option) => b.includes(option));

/**
 * Why a person's write of `after` over `before` may not be kept for the
 * records only the hub writes on a pick (`settled`, `from`), or null: his
 * write carries each record it had, unchanged, on the same pick, or none.
 */
export const hubRecordWriteProblem = (
  before: ChoiceEntry | undefined,
  after: ChoiceEntry
): string | null => {
  const kept = (record: "settled" | "from") =>
    after[record] === undefined ||
    (before?.[record] !== undefined &&
      JSON.stringify(before[record]) === JSON.stringify(after[record]) &&
      sameOptions(before.options, after.options));
  if (!kept("settled")) {
    return "Only the hub settles a pick: the person's pick carries no settled record of its own.";
  }
  return kept("from")
    ? null
    : "Only the hub records a pick from the person's words: his own pick carries no quote of its own.";
};
