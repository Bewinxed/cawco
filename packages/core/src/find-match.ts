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
const FIELD_WEIGHT: Record<FindField, number> = {
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
  task: ["task", "tasks"],
  routine: ["routine", "routines"],
  project: ["project", "projects"],
  machine: ["machine", "machines"],
  artifact: ["artifact", "artifacts"],
  preview: ["preview", "previews"],
  page: ["page", "pages"],
  canvas: ["canvas", "canvases"],
  component: ["component", "components"],
  browser: ["browser", "browsers"],
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
const wordHit = (token: string, words: readonly string[]): number => {
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
const SPACES = /\s+/gu;

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

/** One run of an excerpt's words: matched ones were between 「 and 」. */
export interface MarkedRun {
  matched: boolean;
  text: string;
}

const MARK_OPEN = "「";
const MARK_CLOSE = "」";

/**
 * An excerpt's runs, its 「 」 marks read and left out: the words its runs
 * join to are the ones a moment's secret spans count in (core find.ts
 * `FindMoment.secrets`), at the hub and on every screen alike.
 */
export const markedRuns = (text: string): MarkedRun[] => {
  const runs: MarkedRun[] = [];
  let rest = text;
  while (rest.length > 0) {
    const open = rest.indexOf(MARK_OPEN);
    if (open === -1) {
      runs.push({ matched: false, text: rest });
      break;
    }
    const close = rest.indexOf(MARK_CLOSE, open + 1);
    if (close === -1) {
      runs.push({ matched: false, text: rest.replace(MARK_OPEN, "") });
      break;
    }
    if (open > 0) {
      runs.push({ matched: false, text: rest.slice(0, open) });
    }
    runs.push({ matched: true, text: rest.slice(open + 1, close) });
    rest = rest.slice(close + 1);
  }
  return runs;
};

/** An excerpt's words, its marks left out. */
export const unmarked = (text: string): string =>
  markedRuns(text)
    .map((run) => run.text)
    .join("");

/**
 * Words too common to place an excerpt by or to tell one match from another:
 * a turn that holds only "the" of "we removed the slot pool" has matched
 * nothing. Our own call: English's commonest function words.
 */
const STOP_WORDS: ReadonlySet<string> = new Set(
  "a an and are as at be but by do for from had has have he her his i if in is it its me my no not of on or our she so than that the their them then there they this to us was we were what when which who will with would you your".split(
    " "
  )
);

/** One matched token of a marked text: where it stands in the unmarked words, and its words. */
interface Mark {
  from: number;
  terms: string[];
  to: number;
}

/** A text its matched tokens were marked in: its words unmarked, and where each mark stood. */
export interface MarkedText {
  marks: Mark[];
  plain: string;
}

/** `text`'s 「 」 marks read out ({@link markedRuns}): its words, and where each matched token stands in them. */
export const marksOf = (text: string): MarkedText => {
  const marks: Mark[] = [];
  let plain = "";
  for (const run of markedRuns(text)) {
    if (run.matched) {
      marks.push({
        from: plain.length,
        to: plain.length + run.text.length,
        terms: wordsOf(run.text),
      });
    }
    plain += run.text;
  }
  return { plain, marks };
};

const WORD_RUN = /[\p{L}\p{N}]+/gu;
const WORD_CHAR = /[\p{L}\p{N}]/u;
/**
 * The shortest word that matches longer words it starts (a stem: "slot" for
 * "slots", "remove" for "removed"): four letters, so "the" never marks
 * "there", nor "can" "canvas".
 */
const STEM_MIN = 4;

/** Whether a matched token `term` is query word `word`: the same, or one the start of the other, {@link STEM_MIN} letters on (the index's stemming, roughly). */
const covers = (term: string, word: string): boolean =>
  term === word ||
  (Math.min(term.length, word.length) >= STEM_MIN &&
    (term.startsWith(word) || word.startsWith(term)));

/**
 * `marked` with every whole word of its text that is one of `words` marked
 * too, where no mark stands already: what no index marked (a thread's
 * message, kept at the hub), or what the index was not asked for (a kind
 * word such as "canvas" or "page", which narrows the kinds rather than the
 * words; a short last word, left out while it is typed). A word matches
 * whole, or by its start from {@link STEM_MIN} letters on; never a letter
 * inside a word.
 */
export const withWords = (
  marked: MarkedText,
  words: readonly string[]
): MarkedText => {
  const added = [...marked.plain.matchAll(WORD_RUN)].flatMap(
    (match): Mark[] => {
      const from = match.index;
      const to = from + match[0].length;
      const term = match[0].toLowerCase();
      const taken = marked.marks.some(
        (mark) => mark.from < to && mark.to > from
      );
      return !taken && words.some((word) => covers(term, word))
        ? [{ from, to, terms: [term] }]
        : [];
    }
  );
  return {
    plain: marked.plain,
    marks: [...marked.marks, ...added].toSorted((a, b) => a.from - b.from),
  };
};

/** The query's words a run of marks covers. */
const coveredBy = (marks: readonly Mark[], words: readonly string[]) =>
  new Set(
    words.filter((word) =>
      marks.some((mark) => mark.terms.some((term) => covers(term, word)))
    )
  );

/** The words a match is told by: the query's own less {@link STOP_WORDS}, or all of them when it is only such. */
const telling = (words: readonly string[]): string[] => {
  const kept = [...new Set(words)].filter((word) => !STOP_WORDS.has(word));
  return kept.length > 0 ? kept : [...new Set(words)];
};

/**
 * The runs of marks that stand next to each other in `marked`, nothing but
 * spaces and punctuation between them: where the query's words were said
 * together.
 */
const runsOf = (marked: MarkedText): Mark[][] => {
  const runs: Mark[][] = [];
  for (const mark of marked.marks) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    const between = last ? marked.plain.slice(last.to, mark.from) : "x";
    if (run && last && !WORD_CHAR.test(between)) {
      run.push(mark);
    } else {
      runs.push([mark]);
    }
  }
  return runs;
};

/**
 * How well a marked text matches a query's `words`: the share of its
 * telling words ({@link telling}) some mark covers, and whether a run of
 * marks next to each other covers every one of them (the query said as a
 * phrase).
 */
export const matchShape = (
  marked: MarkedText,
  words: readonly string[]
): { covered: number; phrase: boolean } => {
  const told = telling(words);
  if (told.length === 0) {
    return { covered: 1, phrase: true };
  }
  return {
    covered: coveredBy(marked.marks, told).size / told.length,
    phrase: runsOf(marked).some(
      (run) => coveredBy(run, told).size === told.length
    ),
  };
};

/**
 * Where an excerpt of `size` characters of `marked` stands, `from` to
 * `to`: at its best match of the query's `words`, the window holding the
 * most of its telling words (a stop word counts a tenth), the whole phrase
 * most of all; never placed by a stop word while a telling word is matched
 * elsewhere. Its start, before any mark, when nothing is marked.
 */
export const excerptWindow = (
  marked: MarkedText,
  words: readonly string[],
  size: number
): { from: number; to: number } => {
  const told = new Set(telling(words));
  const lead = Math.round(size / 4);
  let best = { from: 0, score: -1 };
  const phrases = runsOf(marked).filter(
    (run) => coveredBy(run, [...told]).size === told.size
  );
  for (const mark of marked.marks) {
    const from = Math.max(0, mark.from - lead);
    const to = from + size;
    const inside = marked.marks.filter(
      (each) => each.from >= from && each.to <= to
    );
    const said = coveredBy(inside, words);
    let score = 0;
    for (const word of said) {
      score += told.has(word) ? 1 : 0.1;
    }
    if (
      phrases.some(
        (run) => run[0] && run[0].from >= from && (run.at(-1)?.to ?? 0) <= to
      )
    ) {
      score += 2;
    }
    if (score > best.score) {
      best = { from, score };
    }
  }
  const from = Math.min(best.from, Math.max(0, marked.plain.length - size));
  return { from, to: Math.min(marked.plain.length, from + size) };
};
