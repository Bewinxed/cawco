/**
 * A project's fact lines (Projects spec §5.4): the shape of the curated tier
 * in `knowledge/<topic>.md`, read and changed as words, no index.
 *
 * A fact file's first line with words is its description. Then each fact is
 * one dated, sourced line, with at most one indented `Why:` line under it
 * (the advisor's grounding: why it holds, where it was seen):
 *
 * ```
 * - <fact> (since <date>, from <note ids>, used <date>)
 *   Why: <grounding>
 * - <the person's word> (ruling <date>)
 * ## Conflict
 * - <one side> (since <date>, from <note ids>, used <date>)
 * - <the other side> (since <date>, from <note ids>, used <date>)
 * ## Formerly
 * - <old fact> (since <d1>, until <d2>, from <note ids>, replaced by <note id>)
 * ```
 *
 * - `since`: when the fact became true, the note's own time or the date it
 *   states (memory_note's `since`); git's commit is when CawCo learned it.
 * - `from`: the inbox notes it rests on. A withdrawn note takes every fact
 *   resting on it alone with it (memory.ts `withdraw`).
 * - `ruling`: the person's own word, with its date, in place of `since` and
 *   `from`: it rests on no note. Written only by the person (memory.ts
 *   `checkFacts`): re-grounding a line in a card's diff before approving it.
 *   A ruling never folds, never retires when a note is withdrawn, and is
 *   never archived for disuse; its `until` passing still retires it.
 * - `used`: the last time a brief carried it or a note corroborated it,
 *   written only inside a diff proposed anyway (memory.ts `stampUses`).
 * - `until`: a known end; on a Formerly line, when the line above it began,
 *   or the known end that retired it ({@link retiredByUntil}).
 * - `replaced by`: on a Formerly line, the note whose fact took its place;
 *   none on a line its `until` retired.
 *
 * A fact keeps at most one Formerly line: a second replacement moves the
 * older to `knowledge/archive/<topic>.md` ({@link overflow}).
 *
 * `## Conflict` holds both sides of a same-period disagreement, each group
 * of lines its own (a blank line between groups); no model settles one. A
 * line that does not read this way is unreadable: reported by its file and
 * line, never guessed.
 *
 * "What was true on a date" is the lines whose `since` is at or before it and
 * whose `until` is after it (or absent), here and under
 * `knowledge/archive/`; "what CawCo knew on a date" is the file at that
 * date's commit (`git show`). No tool is needed for either.
 */
import { createHash } from "node:crypto";
import { DAY_MS } from "@cawco/core/time";

export const KNOWLEDGE_DIR = "knowledge";
/** Where fact lines go once archived: `knowledge/archive/<topic>.md`, kept by git. */
export const KNOWLEDGE_ARCHIVE = "knowledge/archive";
export const NOTE_ID = /^n-\d{8}-\d{6}-[0-9a-f]{6}$/u;
/** The brand kit: `knowledge/brand/…` and `knowledge/brand*.md`; images and voice, not fact lines. */
export const BRAND = /^knowledge\/brand(?:\/|[^/]*\.md$)/iu;

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const TRAILING_SPACE = /\s+$/u;
/** One source in `from`: a note id, or a file's prose before it became fact lines. */
const SOURCE =
  /^(n-\d{8}-\d{6}-[0-9a-f]{6}|knowledge\/\S+\.md \(before facts\))(?:\s+|$)/u;
const HEADING = /^#{1,6}\s+(.*)$/u;
/** A fact's grounding: indented under its line. */
const WHY = /^\s+Why:\s*(.*\S)\s*$/u;
const SPACES = /\s+/gu;
const FIELD_SPLIT = /\s*,\s*/u;

type FactSection = "current" | "conflict" | "formerly";

/** One fact line as its file says it. */
export interface FactLine {
  /** Within `## Conflict`: the group of lines that disagree with each other. */
  conflictGroup: number | null;
  from: string[];
  /** The hash of its words: what a brief's use is kept under (db `fact_uses`). */
  key: string;
  /** 1-based. */
  line: number;
  path: string;
  raw: string;
  replacedBy: string | null;
  /** The person's own word: its date; the line rests on no note (`from` is empty). */
  ruling: string | null;
  section: FactSection;
  /** When it became true: a ruling's date for a ruling. */
  since: string;
  /** The fact's words, without its parenthesis. */
  text: string;
  until: string | null;
  used: string | null;
  /** Its grounding, the `Why:` line under it, without the mark. */
  why: string | null;
}

/** A line of a fact file that does not read as one: where, what, and why. */
export interface Unreadable {
  line: number;
  path: string;
  text: string;
  why: string;
}

export interface FactFile {
  content: string;
  description: string;
  facts: FactLine[];
  path: string;
  unreadable: Unreadable[];
}

/** Whether `path` holds fact lines: a markdown file under `knowledge/`, not the brand kit, not the archive. */
export const isFactFile = (path: string): boolean =>
  path.startsWith(`${KNOWLEDGE_DIR}/`) &&
  path.endsWith(".md") &&
  !BRAND.test(path) &&
  !path.startsWith(`${KNOWLEDGE_ARCHIVE}/`);

/** The day of an ISO time or a date: `2026-10-18`. */
export const dayOf = (at: string | Date): string =>
  (typeof at === "string" ? at : at.toISOString()).slice(0, 10);

const validDay = (day: string): boolean =>
  DAY.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`));

/** A fact's words as its key compares them: case and spacing aside. */
const plainWords = (text: string): string =>
  text.toLowerCase().replace(SPACES, " ").trim();

export const factKey = (text: string): string =>
  createHash("sha1").update(plainWords(text)).digest("hex").slice(0, 16);

interface Fields {
  from: string[];
  replacedBy: string | null;
  ruling: string | null;
  since: string;
  until: string | null;
  used: string | null;
}

/** One field of a parenthesis, into `fields`; why it does not read, or undefined. */
const readField = (
  part: string,
  fields: Partial<Fields>
): string | undefined => {
  const [word = "", ...rest] = part.split(" ");
  const value = rest.join(" ").trim();
  if (
    word === "since" ||
    word === "until" ||
    word === "used" ||
    word === "ruling"
  ) {
    if (!validDay(value)) {
      return `\`${word}\` is not a date (YYYY-MM-DD): "${value}"`;
    }
    fields[word] = value;
    return;
  }
  if (word === "from") {
    const sources = sourcesIn(value);
    if (typeof sources === "string") {
      return sources;
    }
    fields.from = sources;
    return;
  }
  if (word === "replaced" && rest[0] === "by") {
    const id = rest.slice(1).join(" ").trim();
    if (!NOTE_ID.test(id)) {
      return `\`replaced by\` is not a note id: "${id}"`;
    }
    fields.replacedBy = id;
    return;
  }
  return `"${part}" is not since, until, from, used, ruling or replaced by`;
};

/** A file's prose as a source: what its lines rested on before they were fact lines. */
export const beforeFacts = (path: string): string => `${path} (before facts)`;

/** The sources a `from` names, each a note id or a file's prose before it became fact lines; or why they do not read. */
const sourcesIn = (value: string): string[] | string => {
  const sources: string[] = [];
  let rest = value.trim();
  while (rest) {
    const source = SOURCE.exec(rest);
    if (!source?.[1]) {
      return `\`from\` holds no note id at "${rest}"`;
    }
    sources.push(source[1]);
    rest = rest.slice(source[0].length);
  }
  return sources.length > 0 ? sources : "`from` holds no note ids";
};

/** The parenthesis's fields, or why they do not read. */
const fieldsOf = (inside: string): Fields | string => {
  const fields: Partial<Fields> = {};
  for (const part of inside.trim().split(FIELD_SPLIT)) {
    const why = readField(part, fields);
    if (why) {
      return why;
    }
  }
  const rest = {
    until: fields.until ?? null,
    used: fields.used ?? null,
    replacedBy: fields.replacedBy ?? null,
  };
  if (fields.ruling) {
    return fields.since || fields.from
      ? "a ruling is the person's word, dated by itself: `ruling <date>` in place of `since` and `from`"
      : { ...rest, since: fields.ruling, ruling: fields.ruling, from: [] };
  }
  if (!fields.since) {
    return "it has no `since` (or `ruling`)";
  }
  if (!fields.from) {
    return "it has no `from`";
  }
  return { ...rest, since: fields.since, from: fields.from, ruling: null };
};

/** The section a heading opens: Formerly, Conflict, or (any other) current facts. */
const sectionNamed = (heading: string): FactSection => {
  const name = heading.trim().toLowerCase();
  if (name === "formerly") {
    return "formerly";
  }
  return name === "conflict" ? "conflict" : "current";
};

/**
 * A line's words and the parenthesis of fields at its end: the last
 * parenthesis whose brackets close at the line's end, so words may hold
 * parentheses of their own, and a source may (`(before facts)`).
 */
const splitFact = (
  raw: string
): { inside: string; text: string } | undefined => {
  const line = raw.replace(TRAILING_SPACE, "");
  if (!(line.startsWith("- ") && line.endsWith(")"))) {
    return;
  }
  let depth = 0;
  for (let at = line.length - 1; at >= 2; at -= 1) {
    depth += line[at] === ")" ? 1 : 0;
    depth -= line[at] === "(" ? 1 : 0;
    if (depth === 0) {
      const text = line.slice(2, at).trim();
      return line[at - 1] === " " && text
        ? { text, inside: line.slice(at + 1, -1) }
        : undefined;
    }
  }
};

/** One line in `section`, read: its words and fields, or why it does not read. */
const readFactLine = (
  raw: string,
  section: FactSection
): { fields: Fields; text: string } | string => {
  const fact = splitFact(raw);
  if (!fact) {
    return "not a fact line: `- <fact> (since <date>, from <note ids>, …)`";
  }
  const fields = fieldsOf(fact.inside);
  if (typeof fields === "string") {
    return fields;
  }
  if (section === "formerly" && !fields.until) {
    return "a Formerly line needs `until`";
  }
  return { fields, text: fact.text };
};

/**
 * A `Why:` line, `raw` at `index`: the grounding of `under`, the fact on the
 * line just before; with none there, a line that does not read.
 */
const ground = (
  path: string,
  index: number,
  raw: string,
  why: string,
  under: FactLine | undefined
): Unreadable | undefined => {
  if (!under) {
    return {
      path,
      line: index + 1,
      text: raw,
      why: "a `Why:` line goes right under its fact line, one per fact",
    };
  }
  under.why = why;
  under.raw = `${under.raw}\n${raw}`;
};

/** Every fact line of a file, its description, and the lines that do not read. */
export const parseFactFile = (path: string, content: string): FactFile => {
  const lines = content.split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  const read: Reading = {
    path,
    facts: [],
    unreadable: [],
    section: "current",
    group: 0,
    grouped: false,
    ungrounded: undefined,
  };
  for (const [index, raw] of lines.entries()) {
    readLine(read, raw, index, index <= first);
  }
  return {
    path,
    content,
    description: first >= 0 ? (lines[first] ?? "").trim() : "",
    facts: read.facts,
    unreadable: read.unreadable,
  };
};

/** A fact file part read: what {@link readLine} carries from line to line. */
interface Reading {
  facts: FactLine[];
  group: number;
  /** Whether the line before was a Conflict line of the group open now. */
  grouped: boolean;
  path: string;
  section: FactSection;
  /** The fact on the line just before, while it has no grounding yet. */
  ungrounded: FactLine | undefined;
  unreadable: Unreadable[];
}

/** One line of a fact file into `read`: its description and what comes before it (`head`), a heading, a `Why:`, a fact, or a line that does not read. */
const readLine = (
  read: Reading,
  raw: string,
  index: number,
  head: boolean
): void => {
  const heading = head ? null : HEADING.exec(raw);
  const grounding = head ? null : WHY.exec(raw);
  const under = read.ungrounded;
  read.ungrounded = undefined;
  if (grounding) {
    const bad = ground(read.path, index, raw, grounding[1] ?? "", under);
    read.unreadable.push(...(bad ? [bad] : []));
    return;
  }
  if (head || raw.trim() === "" || heading) {
    read.section = heading ? sectionNamed(heading[1] ?? "") : read.section;
    read.grouped = false;
    return;
  }
  const { section } = read;
  const line = readFactLine(raw, section);
  if (typeof line === "string") {
    read.unreadable.push({
      path: read.path,
      line: index + 1,
      text: raw,
      why: line,
    });
    return;
  }
  read.group += section === "conflict" && !read.grouped ? 1 : 0;
  read.grouped = section === "conflict";
  const fact: FactLine = {
    path: read.path,
    line: index + 1,
    raw,
    text: line.text,
    key: factKey(line.text),
    section,
    conflictGroup: section === "conflict" ? read.group : null,
    why: null,
    ...line.fields,
  };
  read.facts.push(fact);
  read.ungrounded = fact;
};

/** A fact as its file writes it: its line, and its `Why:` line under it when it has one. */
export const renderFact = (fact: {
  from: string[];
  replacedBy?: string | null;
  ruling?: string | null;
  since: string;
  text: string;
  until?: string | null;
  used?: string | null;
  why?: string | null;
}): string =>
  `- ${fact.text.trim()} (${[
    ...(fact.ruling ? [`ruling ${fact.ruling}`] : [`since ${fact.since}`]),
    ...(fact.until ? [`until ${fact.until}`] : []),
    ...(fact.ruling ? [] : [`from ${[...new Set(fact.from)].join(" ")}`]),
    ...(fact.used ? [`used ${fact.used}`] : []),
    ...(fact.replacedBy ? [`replaced by ${fact.replacedBy}`] : []),
  ].join(", ")})${fact.why ? `\n  Why: ${fact.why.trim()}` : ""}`;

/** The lines a fact takes in its file: its own, and its `Why:` line. */
const spanOf = (fact: FactLine): number => (fact.why === null ? 1 : 2);

// --- words --------------------------------------------------------------------

const STOP = new Set(
  "the and for with from that this are was were has have had not but its into than then when what which who will would can could should a an of to in on at by is it be as or if do does did done our we you they them their there here also only just more most some any all each one now new use used uses using get got via per out off over under about after before".split(
    " "
  )
);
const NOT_WORD = /[^\p{L}\p{N}]+/u;

/** The words of `text` a grep counts: lower case, three letters or more, the commonest left out. */
export const wordsOf = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(NOT_WORD)
      .filter((word) => word.length >= 3 && !STOP.has(word))
  );

/** Whether two words are one: the same, or one the other's stem (deploy, deploys, deployed). */
const sameWord = (a: string, b: string): boolean => {
  if (a === b) {
    return true;
  }
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return (
    short.length >= 4 &&
    long.startsWith(short) &&
    long.length - short.length <= 3
  );
};

/** How many of `query`'s words `text` holds: a grep's score. */
export const grepScore = (query: Set<string>, text: string): number => {
  const words = [...wordsOf(text)];
  let score = 0;
  for (const word of query) {
    if (words.some((each) => sameWord(word, each))) {
      score += 1;
    }
  }
  return score;
};

// --- changes to a file -----------------------------------------------------------

const linesOf = (content: string): string[] => content.split("\n");

/** `lines` with `fact`'s lines (its own and its `Why:`) replaced by `next` as rendered: one fact in place of another. */
const put = (
  lines: string[],
  fact: FactLine,
  next: Parameters<typeof renderFact>[0]
): void => {
  lines.splice(fact.line - 1, spanOf(fact), ...renderFact(next).split("\n"));
};
const joined = (lines: string[]): string => {
  const text = lines.join("\n").replace(/\n{3,}/gu, "\n\n");
  return text.endsWith("\n") ? text : `${text}\n`;
};

const findFact = (
  file: FactFile,
  key: string,
  sections: FactSection[]
): FactLine | undefined =>
  file.facts.find(
    (fact) => fact.key === key && sections.includes(fact.section)
  );

/** The index of a section's heading, or -1. */
const headingAt = (lines: string[], name: string): number =>
  lines.findIndex(
    (line) => HEADING.exec(line)?.[1]?.trim().toLowerCase() === name
  );

/** The index past a section's last line with words: where a line is added to it. */
const sectionEnd = (lines: string[], heading: number): number => {
  let end = lines.findIndex(
    (line, index) => index > heading && HEADING.test(line)
  );
  if (end < 0) {
    end = lines.length;
  }
  while (end > heading + 1 && (lines[end - 1] ?? "").trim() === "") {
    end -= 1;
  }
  return end;
};

/** A rendered fact line's `since`. */
const sinceIn = (path: string, raw: string): string =>
  parseFactFile(path, `x\n${raw}`).facts[0]?.since ?? "";

/** `lines` with `raw` added to the section `name`, made when absent (Conflict before Formerly), in `since` order for Formerly. */
const addToSection = (
  lines: string[],
  name: "conflict" | "formerly",
  raws: string[],
  path: string
): string[] => {
  // One string per file line: a fact moved in carries its Why: line.
  const next = lines.join("\n").split("\n");
  const heading = headingAt(next, name);
  if (heading < 0) {
    // A new section, written whole: a blank line, its heading, a blank
    // line, its lines; Conflict before Formerly.
    const title = name === "conflict" ? "## Conflict" : "## Formerly";
    const formerly = headingAt(next, "formerly");
    const at = name === "conflict" && formerly >= 0 ? formerly : next.length;
    while (
      next.length > 0 &&
      at === next.length &&
      (next.at(-1) ?? "").trim() === ""
    ) {
      next.pop();
    }
    const ordered =
      name === "formerly"
        ? [...raws].sort((a, b) =>
            sinceIn(path, a).localeCompare(sinceIn(path, b))
          )
        : raws;
    next.splice(
      Math.min(at, next.length),
      0,
      "",
      title,
      "",
      ...ordered.flatMap((raw) => raw.split("\n")),
      ""
    );
    return next;
  }
  let end = sectionEnd(next, heading);
  if (name === "conflict") {
    // A group of its own: a blank line from the group before it.
    const block = raws.flatMap((raw) => raw.split("\n"));
    next.splice(end, 0, ...(end > heading + 1 ? ["", ...block] : block));
    return next;
  }
  for (const raw of raws) {
    const since = sinceIn(path, raw);
    const file = parseFactFile(path, next.join("\n"));
    const later = file.facts.find(
      (fact) =>
        fact.section === "formerly" &&
        fact.since > since &&
        fact.line - 1 > heading
    );
    end = sectionEnd(next, heading);
    next.splice(later ? later.line - 1 : end, 0, ...raw.split("\n"));
  }
  return next;
};

/** A note as a fact line's change carries it. */
export interface FactNote {
  /** The day it was written: a new line's `used`. */
  day: string;
  id: string;
  /** When its fact became true. */
  since: string;
  /** Its words, one line. */
  text: string;
}

/** `key`'s line with `note` added to its sources, and `used` its day when later. */
export const corroborate = (
  path: string,
  content: string,
  key: string,
  note: FactNote
): string => {
  const { fact, lines } = factToEdit(
    path,
    content,
    key,
    ["current", "conflict"],
    "corroborate"
  );
  put(lines, fact, {
    ...fact,
    from: [...fact.from, note.id],
    used: fact.used && fact.used > note.day ? fact.used : note.day,
  });
  return joined(lines);
};

/** `key`'s fact in one of `sections`, with the file it is in and its lines to edit; thrown when there is none to `edit`. */
const factToEdit = (
  path: string,
  content: string,
  key: string,
  sections: FactSection[],
  edit: string
): { file: FactFile; fact: FactLine; lines: string[] } => {
  const file = parseFactFile(path, content);
  const fact = findFact(file, key, sections);
  if (!fact) {
    throw new Error(`${path} holds no fact ${key} to ${edit}`);
  }
  return { file, fact, lines: linesOf(content) };
};

/**
 * `note` changes `key`'s fact. Newer than it: the note's words become the
 * line and the old one moves under Formerly, its window closed at the
 * note's `since`. Older (a backfill): the note slots into the fact's history
 * under Formerly by its `since`, closed where the next value began.
 */
export const change = (
  path: string,
  content: string,
  key: string,
  note: FactNote
): string => {
  const { file, fact, lines } = factToEdit(
    path,
    content,
    key,
    ["current"],
    "change"
  );
  if (note.since >= fact.since) {
    put(lines, fact, {
      text: note.text,
      since: note.since,
      from: [note.id],
      used: note.day,
    });
    return joined(
      addToSection(
        lines,
        "formerly",
        [
          renderFact({
            ...fact,
            until: note.since,
            used: null,
            replacedBy: note.id,
          }),
        ],
        path
      )
    );
  }
  const chain = historyOf(file, fact).sort((a, b) =>
    a.since.localeCompare(b.since)
  );
  const next = chain.find((member) => member.since > note.since) ?? fact;
  const before = [...chain]
    .reverse()
    .find((member) => member.since <= note.since);
  if (
    before?.section === "formerly" &&
    before.until &&
    before.until > note.since
  ) {
    put(lines, before, {
      ...before,
      until: note.since,
      replacedBy: note.id,
    });
  }
  return joined(
    addToSection(
      lines,
      "formerly",
      [
        renderFact({
          text: note.text,
          since: note.since,
          until: next.since,
          from: [note.id],
          replacedBy: next.from[0] ?? note.id,
        }),
      ],
      path
    )
  );
};

/** `note` disagrees with `key`'s fact over the same period: both go under `## Conflict`, as one group, each with its sources. */
export const conflict = (
  path: string,
  content: string,
  key: string,
  note: FactNote
): string => {
  const { fact, lines } = factToEdit(
    path,
    content,
    key,
    ["current"],
    "set in conflict"
  );
  lines.splice(fact.line - 1, spanOf(fact));
  return joined(
    addToSection(
      lines,
      "conflict",
      [
        fact.raw,
        renderFact({
          text: note.text,
          since: note.since,
          from: [note.id],
          used: note.day,
        }),
      ],
      path
    )
  );
};

/**
 * The file without `noteId` as a source: a line resting on it alone leaves
 * (returned, for the archive), a line with other sources keeps them.
 */
export const withoutSource = (
  path: string,
  content: string,
  noteId: string
): { content: string; retired: string[]; trimmed: number } => {
  const file = parseFactFile(path, content);
  const lines = linesOf(content);
  const retired: string[] = [];
  let trimmed = 0;
  const gone = new Set<number>();
  for (const fact of file.facts) {
    if (!fact.from.includes(noteId)) {
      continue;
    }
    if (fact.from.length === 1) {
      retired.push(fact.raw);
      for (let at = 0; at < spanOf(fact); at += 1) {
        gone.add(fact.line - 1 + at);
      }
    } else {
      trimmed += 1;
      put(lines, fact, {
        ...fact,
        from: fact.from.filter((id) => id !== noteId),
      });
    }
  }
  return {
    content: joined(lines.filter((_, index) => !gone.has(index))),
    retired,
    trimmed,
  };
};

/** The file without `facts`, each with its `Why:` line: what an archive or a retirement moves out. */
export const withoutFacts = (content: string, facts: FactLine[]): string => {
  const gone = new Set(
    facts.flatMap((fact) =>
      Array.from({ length: spanOf(fact) }, (_, at) => fact.line - 1 + at)
    )
  );
  return joined(linesOf(content).filter((_, index) => !gone.has(index)));
};

/** Every current or Conflict line whose recorded use is later than its `used`, with that day. */
export const withUses = (
  path: string,
  content: string,
  usedOn: (key: string) => string | undefined
): string => {
  const file = parseFactFile(path, content);
  const lines = linesOf(content);
  let changed = false;
  for (const fact of file.facts) {
    if (fact.section === "formerly") {
      continue;
    }
    const day = usedOn(fact.key);
    if (day && (!fact.used || day > fact.used)) {
      put(lines, fact, { ...fact, used: day });
      changed = true;
    }
  }
  return changed ? joined(lines) : content;
};

/** Every current or Conflict line with no `used`, given `day`: the day CawCo learned it. */
export const withLearned = (
  path: string,
  content: string,
  day: string
): string => {
  const file = parseFactFile(path, content);
  const lines = linesOf(content);
  const bare = file.facts.filter(
    (fact) => fact.section !== "formerly" && !fact.used
  );
  for (const fact of bare) {
    put(lines, fact, { ...fact, used: day });
  }
  return bare.length > 0 ? joined(lines) : content;
};

/** An archive file's path for a fact file: `knowledge/archive/<topic>.md`. */
export const archivePath = (path: string): string =>
  `${KNOWLEDGE_ARCHIVE}/${path.slice(KNOWLEDGE_DIR.length + 1)}`;

/** The archive file with `lines` added under one heading saying why and when. */
export const archived = (
  path: string,
  archive: string,
  lines: string[],
  why: string
): string => {
  const head =
    archive.trim() === ""
      ? `Archived facts of ${path}: moved out whole, with their dates and sources.\n`
      : archive.trimEnd();
  return `${head}\n\n## ${why}\n\n${lines.join("\n")}\n`;
};

/**
 * A fact's last use: the later of its `used` and the hub's record, else its
 * `since`.
 */
const lastUse = (fact: FactLine, recorded: Date | undefined): string => {
  const record = recorded ? dayOf(recorded) : null;
  const written = fact.used;
  if (record && written) {
    return record > written ? record : written;
  }
  return record ?? written ?? fact.since;
};

/** A fact's history: its line and the Formerly lines that lead to it. */
export const historyOf = (file: FactFile, fact: FactLine): FactLine[] => {
  const chain = [fact];
  for (let grew = true; grew;) {
    grew = false;
    for (const each of file.facts) {
      if (
        each.section === "formerly" &&
        !chain.includes(each) &&
        each.replacedBy &&
        chain.some((member) => member.from.includes(each.replacedBy ?? ""))
      ) {
        chain.push(each);
        grew = true;
      }
    }
  }
  return chain;
};

/**
 * A fact keeps at most one Formerly line (the advisor's "a second
 * supersession moves the older Formerly to the archive"): every older one
 * of `key`'s current line leaves the file, for its archive in the same
 * proposal. The file as it is otherwise.
 */
export const overflow = (
  path: string,
  content: string,
  key: string
): { archived: string[]; content: string } => {
  const file = parseFactFile(path, content);
  const fact = findFact(file, key, ["current"]);
  const older = fact
    ? historyOf(file, fact)
        .filter((each) => each.section === "formerly")
        .sort((a, b) => b.since.localeCompare(a.since))
        .slice(1)
        .sort((a, b) => a.line - b.line)
    : [];
  return older.length > 0
    ? {
        content: withoutFacts(content, older),
        archived: older.map((each) => each.raw),
      }
    : { content, archived: [] };
};

/**
 * Every current line whose `until` has come by `today` (a known end, the
 * advisor's "Retire on `until` passing") moved under `## Formerly` with its
 * window and grounding, a ruling as well; the file, and the lines moved.
 * Nothing to decide: the line's own date says it no longer holds.
 */
export const retiredByUntil = (
  path: string,
  content: string,
  today: string
): { content: string; retired: FactLine[] } => {
  const file = parseFactFile(path, content);
  const retired = file.facts.filter(
    (fact) => fact.section === "current" && fact.until && fact.until <= today
  );
  if (retired.length === 0) {
    return { content, retired };
  }
  return {
    content: joined(
      addToSection(
        linesOf(withoutFacts(content, retired)),
        "formerly",
        retired.map((fact) => renderFact({ ...fact, used: null })),
        path
      )
    ),
    retired,
  };
};

/**
 * The current lines of a file unused for `days` before `today`, each with
 * its history: what the archive moves out. Conflict lines stay until the
 * person settles them; a ruling, the person's word, is never archived for
 * disuse.
 */
export const unusedFacts = (
  file: FactFile,
  recorded: (fact: FactLine) => Date | undefined,
  today: string,
  days: number
): FactLine[][] => {
  const cutoff = dayOf(
    new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY_MS)
  );
  return file.facts
    .filter(
      (fact) =>
        fact.section === "current" &&
        fact.ruling === null &&
        lastUse(fact, recorded(fact)) < cutoff
    )
    .map((fact) => historyOf(file, fact));
};

/** Every note id a set of files' fact lines rest on: what a change must keep. */
export const sourcesOf = (files: FactFile[]): Set<string> =>
  new Set(files.flatMap((file) => file.facts.flatMap((fact) => fact.from)));

// --- prose from before fact lines ---------------------------------------------------

/**
 * Whether a fact file is still prose: written before fact lines, it holds
 * none, only lines that do not read. Its conversion is proposed as a curator
 * run starts (memory.ts `proposeConversions`); until the person approves it,
 * a brief carries it as one block, marked (memory.ts `contextFor`).
 */
export const isProse = (file: FactFile): boolean =>
  file.facts.length === 0 && file.unreadable.length > 0;

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/u;
const CONTINUED = /^\s+\S/u;
const FENCE = /^\s*(?:```|~~~)/u;

/** One claim of a prose file: its words on one line, and the file lines they came from. */
interface ProseUnit {
  heading: boolean;
  lines: number[];
  words: string[];
}

/**
 * The fenced blocks of a prose file, line by line: each a claim of its own,
 * never the tail of the paragraph or item before it nor the head of what
 * follows. The reader answers whether `raw` belonged to a block; `close`
 * ends the unit open before one, `start` opens the block's own.
 */
const fencedBlocks = (
  close: () => void,
  start: (unit: ProseUnit) => void
): ((raw: string, line: number) => boolean) => {
  let unit: ProseUnit | undefined;
  return (raw, line) => {
    const fence = FENCE.test(raw);
    if (!(fence || unit)) {
      return false;
    }
    if (!unit) {
      close();
      unit = { heading: false, lines: [], words: [] };
      start(unit);
    }
    unit.lines.push(line);
    unit.words.push(raw.trim());
    if (fence && unit.lines.length > 1) {
      unit = undefined;
      close();
    }
    return true;
  };
};

/**
 * A prose file's claims, in order: each list item (with the lines it
 * continues onto), each paragraph and each fenced block is one; a heading
 * after the first line stays a heading; the first line, a heading, is the
 * file's description, otherwise a claim like the rest.
 */
const proseUnits = (content: string): ProseUnit[] => {
  const units: ProseUnit[] = [];
  let open: ProseUnit | undefined;
  let kind: "item" | "paragraph" = "paragraph";
  const close = () => {
    if (open) {
      units.push(open);
    }
    open = undefined;
  };
  const block = fencedBlocks(close, (unit) => {
    open = unit;
  });
  for (const [index, raw] of content.split("\n").entries()) {
    const line = index + 1;
    if (block(raw, line)) {
      continue;
    }
    const item = LIST_ITEM.exec(raw);
    if (raw.trim() === "" || HEADING.test(raw) || item) {
      close();
      if (HEADING.test(raw)) {
        units.push({ heading: true, lines: [line], words: [raw.trim()] });
      } else if (item) {
        kind = "item";
        open = { heading: false, lines: [line], words: [item[1] ?? ""] };
      }
      continue;
    }
    if (open && (kind === "paragraph" || CONTINUED.test(raw))) {
      open.lines.push(line);
      open.words.push(raw.trim());
      continue;
    }
    close();
    kind = "paragraph";
    open = { heading: false, lines: [line], words: [raw.trim()] };
  }
  close();
  return units.filter((unit) => unit.words.join(" ").trim() !== "");
};

/**
 * A prose file rewritten as fact lines, word for word: every claim one line,
 * `since` the newest day any of its lines was written (`writtenOn`, git
 * blame or the file's mtime), `from` the file's prose before facts. Its
 * headings stay; its first line, when a heading, is its description, else
 * the file gets one and that line is a claim like the rest.
 */
export const factsFromProse = (
  path: string,
  content: string,
  writtenOn: (line: number) => string
): string => {
  const units = proseUnits(content);
  const [first] = units;
  const description =
    first?.heading === true
      ? (first.words[0] ?? path)
      : `${path.slice(KNOWLEDGE_DIR.length + 1, -".md".length)}: its facts, from its prose.`;
  const body = (first?.heading === true ? units.slice(1) : units).map((unit) =>
    unit.heading
      ? `\n${unit.words[0]}\n`
      : renderFact({
          text: unit.words.join(" ").replace(SPACES, " ").trim(),
          since: unit.lines.map(writtenOn).sort().at(-1) ?? writtenOn(1),
          from: [beforeFacts(path)],
        })
  );
  return `${description}\n\n${body.join("\n")}\n`.replace(/\n{3,}/gu, "\n\n");
};
