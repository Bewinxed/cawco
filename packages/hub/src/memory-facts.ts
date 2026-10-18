/**
 * A project's fact lines (Projects spec §5.4): the shape of the curated tier
 * in `knowledge/<topic>.md`, read and changed as words, no index.
 *
 * A fact file's first line with words is its description. Then each fact is
 * one dated, sourced line:
 *
 * ```
 * - <fact> (since <date>, from <note ids>, used <date>)
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
 * - `used`: the last time a brief carried it or a note corroborated it,
 *   written only inside a diff proposed anyway (memory.ts `stampUses`).
 * - `until`: a known end; on a Formerly line, when the line above it began.
 * - `replaced by`: on a Formerly line, the note whose fact took its place.
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

export const KNOWLEDGE_DIR = "knowledge";
/** Where fact lines go once archived: `knowledge/archive/<topic>.md`, kept by git. */
export const KNOWLEDGE_ARCHIVE = "knowledge/archive";
export const NOTE_ID = /^n-\d{8}-\d{6}-[0-9a-f]{6}$/;
/** The brand kit: `knowledge/brand/…` and `knowledge/brand*.md`; images and voice, not fact lines. */
export const BRAND = /^knowledge\/brand(?:\/|[^/]*\.md$)/i;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TRAILING_SPACE = /\s+$/;
/** One source in `from`: a note id, or a file's prose before it became fact lines. */
const SOURCE =
  /^(n-\d{8}-\d{6}-[0-9a-f]{6}|knowledge\/\S+\.md \(before facts\))(?:\s+|$)/;
const HEADING = /^#{1,6}\s+(.*)$/;
const SPACES = /\s+/g;
const FIELD_SPLIT = /\s*,\s*/;

export type FactSection = "current" | "conflict" | "formerly";

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
  section: FactSection;
  since: string;
  /** The fact's words, without its parenthesis. */
  text: string;
  until: string | null;
  used: string | null;
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
  if (word === "since" || word === "until" || word === "used") {
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
  return `"${part}" is not since, until, from, used or replaced by`;
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
  if (!fields.since) {
    return "it has no `since`";
  }
  if (!fields.from) {
    return "it has no `from`";
  }
  return {
    since: fields.since,
    from: fields.from,
    until: fields.until ?? null,
    used: fields.used ?? null,
    replacedBy: fields.replacedBy ?? null,
  };
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
  if (section === "formerly" && !(fields.until && fields.replacedBy)) {
    return "a Formerly line needs `until` and `replaced by`";
  }
  return { fields, text: fact.text };
};

/** Every fact line of a file, its description, and the lines that do not read. */
export const parseFactFile = (path: string, content: string): FactFile => {
  const lines = content.split("\n");
  const facts: FactLine[] = [];
  const unreadable: Unreadable[] = [];
  const first = lines.findIndex((line) => line.trim() !== "");
  let section: FactSection = "current";
  let group = 0;
  /** Whether the line before was a Conflict line of the group open now. */
  let grouped = false;
  for (const [index, raw] of lines.entries()) {
    const heading = index > first ? HEADING.exec(raw) : null;
    if (index <= first || raw.trim() === "" || heading) {
      section = heading ? sectionNamed(heading[1] ?? "") : section;
      grouped = false;
      continue;
    }
    const read = readFactLine(raw, section);
    if (typeof read === "string") {
      unreadable.push({ path, line: index + 1, text: raw, why: read });
      continue;
    }
    group += section === "conflict" && !grouped ? 1 : 0;
    grouped = section === "conflict";
    facts.push({
      path,
      line: index + 1,
      raw,
      text: read.text,
      key: factKey(read.text),
      section,
      conflictGroup: section === "conflict" ? group : null,
      ...read.fields,
    });
  }
  return {
    path,
    content,
    description: first >= 0 ? (lines[first] ?? "").trim() : "",
    facts,
    unreadable,
  };
};

/** A fact as its line writes it. */
export const renderFact = (fact: {
  from: string[];
  replacedBy?: string | null;
  since: string;
  text: string;
  until?: string | null;
  used?: string | null;
}): string =>
  `- ${fact.text.trim()} (${[
    `since ${fact.since}`,
    ...(fact.until ? [`until ${fact.until}`] : []),
    `from ${[...new Set(fact.from)].join(" ")}`,
    ...(fact.used ? [`used ${fact.used}`] : []),
    ...(fact.replacedBy ? [`replaced by ${fact.replacedBy}`] : []),
  ].join(", ")})`;

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
const joined = (lines: string[]): string => {
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n");
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

/** The index past the current facts: before `## Conflict` or `## Formerly`, past the last line with words. */
const currentEnd = (lines: string[]): number => {
  const sections = [headingAt(lines, "conflict"), headingAt(lines, "formerly")]
    .filter((at) => at >= 0)
    .sort((a, b) => a - b);
  let end = sections[0] ?? lines.length;
  while (end > 0 && (lines[end - 1] ?? "").trim() === "") {
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
  const heading = headingAt(lines, name);
  const next = [...lines];
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
    next.splice(Math.min(at, next.length), 0, "", title, "", ...ordered, "");
    return next;
  }
  let end = sectionEnd(next, heading);
  if (name === "conflict") {
    // A group of its own: a blank line from the group before it.
    const block = end > heading + 1 ? ["", ...raws] : raws;
    next.splice(end, 0, ...block);
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
    next.splice(later ? later.line - 1 : end, 0, raw);
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
  const file = parseFactFile(path, content);
  const fact =
    findFact(file, key, ["current", "conflict"]) ??
    failEdit(path, key, "corroborate");
  const lines = linesOf(content);
  lines[fact.line - 1] = renderFact({
    ...fact,
    from: [...fact.from, note.id],
    used: fact.used && fact.used > note.day ? fact.used : note.day,
  });
  return joined(lines);
};

const failEdit = (path: string, key: string, edit: string): never => {
  throw new Error(`${path} holds no fact ${key} to ${edit}`);
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
  const file = parseFactFile(path, content);
  const fact =
    findFact(file, key, ["current"]) ?? failEdit(path, key, "change");
  const lines = linesOf(content);
  if (note.since >= fact.since) {
    lines[fact.line - 1] = renderFact({
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
            text: fact.text,
            since: fact.since,
            until: note.since,
            from: fact.from,
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
    lines[before.line - 1] = renderFact({
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
  const file = parseFactFile(path, content);
  const fact =
    findFact(file, key, ["current"]) ?? failEdit(path, key, "set in conflict");
  const lines = linesOf(content);
  lines.splice(fact.line - 1, 1);
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

/** A new current fact line at the end of the file's current facts. */
export const addFact = (content: string, raw: string): string => {
  const lines = linesOf(content);
  const at = currentEnd(lines);
  lines.splice(at, 0, raw);
  return joined(lines);
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
      gone.add(fact.line - 1);
    } else {
      trimmed += 1;
      lines[fact.line - 1] = renderFact({
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

/** The file without the lines at `numbers` (1-based): what an archive moves out. */
export const withoutLines = (content: string, numbers: number[]): string => {
  const gone = new Set(numbers.map((line) => line - 1));
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
      lines[fact.line - 1] = renderFact({ ...fact, used: day });
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
    lines[fact.line - 1] = renderFact({ ...fact, used: day });
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
export const lastUse = (fact: FactLine, recorded: Date | undefined): string => {
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
 * The current lines of a file unused for `days` before `today`, each with
 * its history: what the archive moves out. Conflict lines stay until the
 * person settles them.
 */
export const unusedFacts = (
  file: FactFile,
  recorded: (fact: FactLine) => Date | undefined,
  today: string,
  days: number
): FactLine[][] => {
  const cutoff = dayOf(
    new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000)
  );
  return file.facts
    .filter(
      (fact) =>
        fact.section === "current" && lastUse(fact, recorded(fact)) < cutoff
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

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const CONTINUED = /^\s+\S/;
const FENCE = /^\s*(?:```|~~~)/;

/** One claim of a prose file: its words on one line, and the file lines they came from. */
interface ProseUnit {
  heading: boolean;
  lines: number[];
  words: string[];
}

/**
 * A prose file's claims, in order: each list item (with the lines it
 * continues onto), each paragraph and each fenced block is one; a heading
 * after the first line stays a heading; the first line, a heading, is the
 * file's description, otherwise a claim like the rest.
 */
const proseUnits = (content: string): ProseUnit[] => {
  const units: ProseUnit[] = [];
  let open: ProseUnit | undefined;
  let fenced = false;
  let kind: "item" | "paragraph" = "paragraph";
  const close = () => {
    if (open) {
      units.push(open);
    }
    open = undefined;
  };
  for (const [index, raw] of content.split("\n").entries()) {
    const line = index + 1;
    if (FENCE.test(raw)) {
      fenced = !fenced;
      open ??= { heading: false, lines: [], words: [] };
      open.lines.push(line);
      open.words.push(raw.trim());
      continue;
    }
    if (fenced) {
      open?.lines.push(line);
      open?.words.push(raw.trim());
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
  return `${description}\n\n${body.join("\n")}\n`.replace(/\n{3,}/g, "\n\n");
};
