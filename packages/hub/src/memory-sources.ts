/**
 * What a lesson of a project's memory may rest on, and what its words may
 * not hold (memory-run.ts checks each operation with these): pure.
 *
 * - **No quote of the person.** A lesson is the rule in an agent's own
 *   words, and its source is a reference the hub keeps: it shares no run of
 *   {@link ECHO_RUN} words with any message the run was given, and holds no
 *   double-quoted span of three or more words ({@link quoteProblem}). A
 *   name is two or three words; five in a row is his phrasing.
 * - **A file.** An agent's lesson may name a file of the project that bears
 *   it out: a path in its checkout and a literal match, read by the hub on
 *   the first machine that answers for a checkout ({@link anchorRead}), and
 *   read again every night.
 */
import type { InstanceRow } from "@cawco/core/protocol";
import { isRoutineParent } from "./work-item-state";

/** How many of the person's words in a row a lesson may not repeat. */
const ECHO_RUN = 5;
/** How many words a double-quoted span holds before it is a quote. */
const QUOTED_WORDS = 3;
/** How far up its chain of parents a session's root is looked for. */
const ANCESTRY = 12;

const CODE_SPAN = /`[^`]*`/gu;
const QUOTED = /["“”]([^"“”]*)["“”]/gu;
const MARKS = /[\s*_`>#|-]+/gu;
const NOT_WORD = /[^\p{L}\p{N}']+/u;

/** A text's words as a quote compares them: case, markdown marks and punctuation aside. */
const wordsIn = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(MARKS, " ")
    .split(NOT_WORD)
    .filter((word) => word.length > 0);

/**
 * Why `text` may not be a lesson for quoting the person, or nothing: the
 * word (1-based) where a run of {@link ECHO_RUN} of his words in a row
 * starts, or a double-quoted span of {@link QUOTED_WORDS} words or more
 * outside backticked code. Says where, never the words.
 */
export const quoteProblem = (
  text: string,
  said: readonly string[]
): { kind: "echoes"; word: number } | { kind: "quotes" } | undefined => {
  const quoted = [...text.replace(CODE_SPAN, " ").matchAll(QUOTED)].some(
    (match) => wordsIn(match[1] ?? "").length >= QUOTED_WORDS
  );
  if (quoted) {
    return { kind: "quotes" };
  }
  const words = wordsIn(text);
  if (words.length < ECHO_RUN) {
    return;
  }
  const runs = new Set<string>();
  for (const message of said) {
    const his = wordsIn(message);
    for (let at = 0; at + ECHO_RUN <= his.length; at += 1) {
      runs.add(his.slice(at, at + ECHO_RUN).join(" "));
    }
  }
  for (let at = 0; at + ECHO_RUN <= words.length; at += 1) {
    if (runs.has(words.slice(at, at + ECHO_RUN).join(" "))) {
      return { kind: "echoes", word: at + 1 };
    }
  }
};

/**
 * The session at the top of `row`'s chain of parents: its own id when it
 * has none, a routine's (`routine:<id>`) when a routine started the chain.
 */
export const rootOf = (
  row: Pick<InstanceRow, "id" | "parentInstanceId">,
  rowOf: (
    id: string
  ) => Pick<InstanceRow, "id" | "parentInstanceId"> | undefined
): string => {
  let at = row;
  for (let depth = 0; depth < ANCESTRY; depth += 1) {
    const parent = at.parentInstanceId;
    if (!parent) {
      return at.id;
    }
    if (isRoutineParent(parent)) {
      return parent;
    }
    const up = rowOf(parent);
    if (!up) {
      return parent;
    }
    at = up;
  }
  return at.id;
};

/** The longest literal match an anchor may name: a symbol, a command or a config key, not a passage. */
export const ANCHOR_MATCH = 120;

/** What a machine's file read came to: its text, not there, or no answer (the machine away, or it refused). */
export type MachineRead =
  { kind: "text"; text: string } | { kind: "missing" } | { kind: "unread" };

/** A project's checkout as an anchor is read at: on a machine, at a folder. */
export interface AnchorPlace {
  machineId: string;
  path: string;
}

/**
 * Whether a file of the project bears a lesson out (§4.3): `anchor.path`
 * read at the first of `places` whose machine answers (`read`, the `fs`
 * verb's read), and `anchor.match` looked for in it, literally. `found`
 * with the file's sha256; `gone` when that machine's checkout is there
 * (`listed`) and the file or the match is not; `unread` when no machine
 * answered for its checkout, so the lesson waits for the next night.
 */
export const anchorRead = async (
  machine: {
    listed: (machineId: string, path: string) => Promise<boolean | undefined>;
    read: (machineId: string, path: string) => Promise<MachineRead>;
  },
  places: readonly AnchorPlace[],
  anchor: { match: string; path: string }
): Promise<
  { kind: "found"; sha256: string } | { kind: "gone" } | { kind: "unread" }
> => {
  for (const place of places) {
    const file = await machine.read(
      place.machineId,
      `${place.path.replace(TRAILING_SLASH, "")}/${anchor.path}`
    );
    if (file.kind === "text") {
      return file.text.includes(anchor.match)
        ? {
            kind: "found",
            sha256: new Bun.CryptoHasher("sha256")
              .update(file.text)
              .digest("hex"),
          }
        : { kind: "gone" };
    }
    // A file not there is gone only where its checkout is.
    if (
      file.kind === "missing" &&
      (await machine.listed(place.machineId, place.path)) === true
    ) {
      return { kind: "gone" };
    }
  }
  return { kind: "unread" };
};

const TRAILING_SLASH = /\/+$/u;
