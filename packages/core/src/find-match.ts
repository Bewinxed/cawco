/**
 * The find engine's matcher (hub find-names.ts, find.ts): how a query's
 * words match the words a thing is recognised by, and the words round a
 * hit. Pure, and shared: the hub's Find and the dashboard's Files search
 * answer by the same rules.
 */
import type { FindField } from "./find";

/**
 * Each recogniser's weight in a match: a title is how a thing is mostly
 * remembered, then what it was for. Our own call, after the task model's
 * "title above purpose above project" (options doc, shared ground 3).
 */
export const FIELD_WEIGHT: Record<FindField, number> = {
  title: 1,
  id: 0.9,
  path: 0.85,
  purpose: 0.7,
  report: 0.65,
  project: 0.6,
  dir: 0.6,
  kind: 0.6,
  machine: 0.5,
  transcript: 0.45,
};

/** The words a kind is asked for by ("previews", "task drift check"), by kind. */
export const KIND_WORDS = {
  conversation: ["session", "sessions", "conversation", "conversations"],
  delegate: ["delegate", "delegates"],
  thread: ["thread", "threads", "caw"],
  task: ["task", "tasks"],
  routine: ["routine", "routines"],
  project: ["project", "projects"],
  machine: ["machine", "machines"],
  artifact: ["artifact", "artifacts"],
  preview: ["preview", "previews"],
  page: ["page", "pages"],
  canvas: ["canvas", "canvases"],
  component: ["component", "components"],
  decision: ["decision", "decisions"],
  commit: ["commit", "commits"],
  file: ["file", "files"],
} as const;
const ALL_KIND_WORDS: ReadonlySet<string> = new Set(
  Object.values(KIND_WORDS).flat()
);

/** A recogniser of a result: its text, lowercased, and its words. */
export interface Field {
  name: FindField;
  text: string;
  words: string[];
}

/** What a match is scored on: the kind words that ask for a thing, and the words it is recognised by. */
export interface MatchEntry {
  /** The kind words that ask for it ({@link KIND_WORDS}). */
  asked: ReadonlySet<string>;
  fields: Field[];
}

/** What splits text into words: anything but a letter or a digit. */
const NOT_A_WORD = /[^\p{L}\p{N}]+/u;

/** The words of `text`: letters and digits, lowercased. */
export const wordsOf = (text: string): string[] =>
  text.toLowerCase().split(NOT_A_WORD).filter(Boolean);

export const field = (
  name: FindField,
  text: string | null | undefined
): Field[] =>
  text?.trim()
    ? [{ name, text: text.toLowerCase(), words: wordsOf(text) }]
    : [];

/** A word of the query against the words of a text: whole (1), its start (0.8), or neither (0). */
export const wordHit = (token: string, words: readonly string[]): number => {
  let best = 0;
  for (const word of words) {
    if (word === token) {
      return 1;
    }
    if (word.startsWith(token)) {
      best = 0.8;
    }
  }
  return best;
};

/**
 * How well one word of the query matches one recogniser: a whole word, the
 * start of one, or (three letters on) anywhere in it.
 */
const quality = (token: string, at: Field): number => {
  const hit = wordHit(token, at.words);
  if (hit === 0 && token.length >= 3 && at.text.includes(token)) {
    return 0.5;
  }
  return hit;
};

/** A query's words, and the kinds its kind words ask for. */
export interface Query {
  /** The query lowercased and trimmed, for a title that holds it whole. */
  phrase: string;
  /** Its words, kind words among them. */
  tokens: string[];
  /** Words that are not kind words: what a transcript is searched for. */
  words: string[];
}

export const parse = (q: string): Query => {
  const tokens = wordsOf(q);
  return {
    phrase: q.trim().toLowerCase(),
    tokens,
    words: tokens.filter((token) => !ALL_KIND_WORDS.has(token)),
  };
};

/** One word's best recogniser in `entry`: a kind word, or a field's words. */
const bestFor = (
  entry: MatchEntry,
  token: string
): { by: FindField; score: number } | undefined => {
  let best = entry.asked.has(token)
    ? { by: "kind" as FindField, score: FIELD_WEIGHT.kind * 0.9 }
    : undefined;
  for (const each of entry.fields) {
    const score = quality(token, each) * FIELD_WEIGHT[each.name];
    if (score > (best?.score ?? 0)) {
      best = { by: each.name, score };
    }
  }
  return best;
};

/**
 * How well `entry` matches every word of `query`, 0 when one word matches
 * nothing (a kind word matches what it asks for, or any recogniser as a plain
 * word does), and which recognisers matched.
 */
export const matchOf = (
  entry: MatchEntry,
  query: Query
): { fields: FindField[]; score: number } => {
  if (query.tokens.length === 0) {
    return { fields: [], score: 0.3 };
  }
  let sum = 0;
  const fields = new Set<FindField>();
  for (const token of query.tokens) {
    const best = bestFor(entry, token);
    if (!best) {
      return { fields: [], score: 0 };
    }
    fields.add(best.by);
    sum += best.score;
  }
  const title = entry.fields.find((each) => each.name === "title");
  // The words as typed, together, in its title: what it was named.
  const whole =
    query.tokens.length > 1 && title?.text.includes(query.phrase) ? 0.15 : 0;
  return { fields: [...fields], score: sum / query.tokens.length + whole };
};

/** How much of a message an excerpt shows around its first match, characters each side. */
const EXCERPT_AROUND = 70;
const SPACES = /\s+/g;

/** `body` around the first of `words` it holds, each of them between 「 and 」. */
export const excerptOf = (body: string, words: string[]): string => {
  const lower = body.toLowerCase();
  const at = Math.min(
    ...words.map((word) => {
      const found = lower.search(
        new RegExp(`(^|[^\\p{L}\\p{N}])${RegExp.escape(word)}`, "u")
      );
      return found < 0 ? lower.length : found;
    })
  );
  const from = Math.max(0, at - EXCERPT_AROUND);
  const to = Math.min(body.length, at + EXCERPT_AROUND * 2);
  const marked = body
    .slice(from, to)
    .replace(SPACES, " ")
    .replace(
      new RegExp(
        `(?<![\\p{L}\\p{N}])(${words.map((word) => RegExp.escape(word)).join("|")})[\\p{L}\\p{N}]*`,
        "giu"
      ),
      "「$&」"
    );
  return `${from > 0 ? "…" : ""}${marked.trim()}${to < body.length ? "…" : ""}`;
};
