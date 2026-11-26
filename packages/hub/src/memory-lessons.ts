/**
 * A project's memory as lines in its files (memory-run.ts writes them,
 * memory.ts reads them): the line format, the files they live in, and the
 * four changes to them, as pure functions over the files' words. Nothing
 * here reads or writes a file.
 *
 * - **A lesson** is one line, `- <rule or fact, one sentence> (L-7f3a2c)`,
 *   with at most one `  Why: <one line>` under it and, for a fact a file
 *   bears out, one `  Anchor: <path> | <match>`: the file in the project's
 *   checkout and the literal string in it, which the reading agent can use
 *   and upkeep reads again. Its id is `L-` and six hex characters.
 * - **Provenance is git's**: each change is one commit, whose author says
 *   who made it, whose date says when, and whose message names its sources
 *   by reference; `git log -S "(L-7f3a2c)"` finds every change of a line.
 * - **Homes**, by how a lesson reaches a session: the index, `AGENTS.md`
 *   (its `## Rules`, loaded into every session of the project at launch);
 *   a skill's lessons, `lessons/<skill>.md` (read when that skill runs: the
 *   index's `## Skills` points to each, a line this module writes); a
 *   knowledge topic, `knowledge/<topic>.md` (carried into an attempt's
 *   brief by the task's words). `knowledge/archive/`, where the archive by
 *   disuse put lines before 2026-11-24, is history, read by no session.
 * - **The person's own lines**: the index's `## Notes` and every section of
 *   it this module does not keep (a setup's) are his, and no change here
 *   edits them.
 * - **Changes**: add, reword, remove and move a line
 *   ({@link applyLineChange}); a change that would take a file
 *   past its character budget is refused ({@link CAPS}), and nothing moves
 *   out on its own.
 */
import { DAY_MS } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { memoryRunWords } from "@cawco/core/words/memory-run";
import { MEMORY_FILE_CHARS } from "./config";

export const KNOWLEDGE_DIR = "knowledge";
/** Where knowledge lessons were archived for disuse before 2026-11-24: `knowledge/archive/<topic>.md`, history no brief carries. */
export const KNOWLEDGE_ARCHIVE = "knowledge/archive";
export const NOTE_ID = /^n-\d{8}-\d{6}-[0-9a-f]{6}$/u;
/** The brand kit: `knowledge/brand/…` and `knowledge/brand*.md`; images and voice, not lessons. */
export const BRAND = /^knowledge\/brand(?:\/|[^/]*\.md$)/iu;

/** The day of an ISO time or a date: `2026-10-18`. */
// @limit external: RFC 3339 section 5.6: full-date is YYYY-MM-DD, a timestamp's first 10 characters
export const dayOf = (at: string | Date): string =>
  (typeof at === "string" ? at : at.toISOString()).slice(0, 10);

// --- words, as a grep counts them ------------------------------------------------------

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

export const INDEX_FILE = "AGENTS.md";
export const LESSONS_DIR = "lessons";
export const RUN_STATE_FILE = "memory/state.json";

const LESSON_LINE = /^- (.*\S) \((L-[0-9a-f]{6})\)\s*$/u;
const WHY_LINE = /^ {2}Why: (.*\S)\s*$/u;
/** A fact's file and the literal string in it that bear it out: `  Anchor: <path> | <match>`. */
const ANCHOR_LINE = /^ {2}Anchor: (.+?) \| (.+\S)\s*$/u;
const BULLET = /^- (.*\S)\s*$/u;
const SECTION = /^## (.*\S)\s*$/u;
const TITLE = /^# (.*\S)\s*$/u;
const SKILL_NAME = /^[a-z0-9][\w.:-]*$/iu;
const TOPIC_NAME = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * The project's memory's one limit, with its reason: a change that would
 * take a file past its character budget is refused, naming the budget, and
 * nothing moves out on its own.
 */
export const CAPS = {
  /**
   * The whole index, its Notes counted: the share of AGENTS.md a brief
   * carries (`MEMORY_FILE_CHARS`, config.ts, the memory replay's pick), so
   * every session pays what an attempt pays, and no more. His notes count,
   * so they shrink what the run may keep.
   */
  indexChars: MEMORY_FILE_CHARS,
} as const;

/**
 * The character budget of `path`'s file: the index's ({@link CAPS}
 * `indexChars`), and a knowledge file's, what one brief carries of one
 * file (config.ts `MEMORY_FILE_CHARS`). A skill's lessons have none.
 */
const budgetOf = (path: string): number | undefined => {
  const home = homeOf(path);
  if (home?.at === "index") {
    return CAPS.indexChars;
  }
  return home?.at === "knowledge" ? MEMORY_FILE_CHARS : undefined;
};

/** Where a lesson lives: the index, a skill's lessons, or a knowledge topic. */
export type LessonHome =
  | { at: "index" }
  | { at: "skill"; skill: string }
  | { at: "knowledge"; topic: string };

/** A fact's file in the project's checkout, from its root, and the literal string in it that bears the fact out. */
export interface Anchor {
  match: string;
  path: string;
}

/** One lesson line as its file says it. */
export interface LessonLine {
  anchor: Anchor | null;
  id: string;
  text: string;
  why: string | null;
}

/** The project's memory files by path: the index, every `lessons/` and `knowledge/` file, the archive's. */
export type MemoryFiles = Readonly<Partial<Record<string, string>>>;

/** The path a home's lessons are in. */
export const pathOf = (home: LessonHome): string => {
  switch (home.at) {
    case "index":
      return INDEX_FILE;
    case "skill":
      return `${LESSONS_DIR}/${home.skill}.md`;
    case "knowledge":
      return `${KNOWLEDGE_DIR}/${home.topic}.md`;
    default:
      return unhandled("lesson home", home);
  }
};

/** The home a memory file's lessons have; undefined for a file that holds none (an archive, the brand kit, anything else). */
export const homeOf = (path: string): LessonHome | undefined => {
  if (path === INDEX_FILE) {
    return { at: "index" };
  }
  const skill = new RegExp(`^${LESSONS_DIR}/([^/]+)\\.md$`, "u").exec(path);
  if (skill?.[1]) {
    return { at: "skill", skill: skill[1] };
  }
  const topic = new RegExp(`^${KNOWLEDGE_DIR}/([^/]+)\\.md$`, "u").exec(path);
  if (topic?.[1] && !BRAND.test(path)) {
    return { at: "knowledge", topic: topic[1] };
  }
};

/** Whether `name` reads as a knowledge topic: lower case words joined by `-`. */
export const isTopic = (name: string): boolean => TOPIC_NAME.test(name);

/** Whether `name` reads as a skill's name, as the fleet lists one. */
export const isSkillName = (name: string): boolean => SKILL_NAME.test(name);

/** A lesson as its file says it: its line, its `Why:`, its anchor. */
export const renderLesson = (line: LessonLine): string =>
  [
    `- ${line.text} (${line.id})`,
    ...(line.why ? [`  Why: ${line.why}`] : []),
    ...(line.anchor
      ? [`  Anchor: ${line.anchor.path} | ${line.anchor.match}`]
      : []),
  ].join("\n");

/** A fresh lesson id that `taken` does not hold. */
export const newLessonId = (taken: (id: string) => boolean): string => {
  for (;;) {
    // @limit measured: 6 hex characters of a random UUID are 24 bits; one hub's ids of this kind share the namespace, so two collide after about 2^12 ids
    const id = `L-${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`;
    if (!taken(id)) {
      return id;
    }
  }
};

// --- the files -----------------------------------------------------------------------

const linesOf = (content: string): string[] => content.split("\n");

/** The index's lines in its sections: its title, its intro, and each `## ` section with its lines, in order. */
interface IndexParts {
  intro: string[];
  sections: { lines: string[]; name: string }[];
  title: string | null;
}

const indexParts = (content: string): IndexParts => {
  const parts: IndexParts = { title: null, intro: [], sections: [] };
  for (const line of linesOf(content)) {
    const section = SECTION.exec(line);
    const title = TITLE.exec(line);
    if (section?.[1]) {
      parts.sections.push({ name: section[1], lines: [] });
    } else if (parts.sections.length > 0) {
      parts.sections.at(-1)?.lines.push(line);
    } else if (title?.[1] && parts.title === null) {
      parts.title = title[1];
    } else {
      parts.intro.push(line);
    }
  }
  return parts;
};

/** A section's lines, blank lines at either end dropped. */
const trimmed = (lines: string[]): string[] => {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") {
    start += 1;
  }
  while (end > start && lines[end - 1]?.trim() === "") {
    end -= 1;
  }
  return lines.slice(start, end);
};

const NOTES = "Notes";
/** The index's intros the hub wrote: its own now, and the stub a project's folder was made with before (project-folder.ts). */
const HUB_INTROS: ReadonlySet<string> = new Set([
  memoryRunWords.indexIntro,
  "Owned by you; agents propose changes.",
]);
const RULES = "Rules";
const SKILLS = "Skills";

/** The index's sections by their kind: his notes, his other sections, the rules, the skill pointers. */
const indexSections = (content: string) => {
  const parts = indexParts(content);
  const named = (name: string) =>
    trimmed(
      parts.sections
        .filter((section) => section.name === name)
        .flatMap((section) => section.lines)
    );
  return {
    title: parts.title,
    notes: named(NOTES),
    others: parts.sections
      .filter(
        (section) =>
          section.name !== NOTES &&
          section.name !== RULES &&
          section.name !== SKILLS
      )
      .map((section) => ({
        name: section.name,
        lines: trimmed(section.lines),
      })),
    rules: named(RULES),
    skills: named(SKILLS),
  };
};

/**
 * The index as the hub keeps it (§5.1 of the memory build): the project's
 * name, the line saying who keeps it, his `## Notes`, any section of his
 * own, the `## Rules`, and the `## Skills` pointers. Every line of his,
 * and every rule line, kept as it stands; only the title and the intro are
 * the hub's.
 */
export const indexShape = (projectName: string, content: string): string => {
  const sections = indexSections(content);
  const his = trimmed(
    indexParts(content).intro.filter((line) => !HUB_INTROS.has(line.trim()))
  );
  const block = (name: string, lines: string[]) =>
    lines.length > 0 ? `## ${name}\n\n${lines.join("\n")}` : `## ${name}`;
  return `${[
    `# ${projectName}`,
    memoryRunWords.indexIntro,
    ...(his.length > 0 ? [his.join("\n")] : []),
    block(NOTES, sections.notes),
    ...sections.others
      .filter((section) => section.lines.length > 0)
      .map((section) => block(section.name, section.lines)),
    block(RULES, sections.rules),
    ...(sections.skills.length > 0 ? [block(SKILLS, sections.skills)] : []),
  ].join("\n\n")}\n`;
};

/** Whether the index says anything a session should load: a note, a rule, a pointer or a section of his. */
export const indexSays = (content: string): boolean => {
  const sections = indexSections(content);
  return (
    sections.notes.length > 0 ||
    sections.rules.length > 0 ||
    sections.skills.length > 0 ||
    sections.others.some((section) => section.lines.length > 0)
  );
};

/** `content` (in the index's shape) with section `name`'s lines replaced by `lines`. */
const replaceSection = (
  content: string,
  name: string,
  lines: string[]
): string => {
  const out: string[] = [];
  let skipping = false;
  let placed = false;
  for (const line of linesOf(content)) {
    const section = SECTION.exec(line);
    if (section) {
      skipping = section[1] === name;
      if (skipping) {
        out.push(line, "", ...lines, "");
        placed = true;
        continue;
      }
    }
    if (!skipping) {
      out.push(line);
    }
  }
  if (!placed) {
    out.push("", `## ${name}`, "", ...lines);
  }
  return `${out.join("\n").trimEnd()}\n`;
};

/** The lines of `path`'s file that hold lessons: the index's `## Rules`, every line of any other memory file. */
const lessonRegion = (
  path: string,
  content: string
): { lines: string[]; region: (index: number) => boolean } => {
  const lines = linesOf(content);
  if (path !== INDEX_FILE) {
    return { lines, region: () => true };
  }
  const inRules: boolean[] = [];
  let rules = false;
  for (const line of lines) {
    const section = SECTION.exec(line);
    if (section) {
      rules = section[1] === RULES;
    }
    inRules.push(rules && !section);
  }
  return { lines, region: (index) => inRules[index] === true };
};

/** The lines under a lesson's line that belong to it (`Why:`, `Anchor:`), from `at`: how many, and what they say. */
const tailOf = (lines: readonly string[], at: number) => {
  let why: string | null = null;
  let anchor: Anchor | null = null;
  let span = 0;
  for (;;) {
    const line = lines[at + span] ?? "";
    const [, saidWhy] = WHY_LINE.exec(line) ?? [];
    const [, path, match] = ANCHOR_LINE.exec(line) ?? [];
    if (saidWhy && why === null) {
      why = saidWhy;
    } else if (path && match && anchor === null) {
      anchor = { path, match };
    } else {
      return { anchor, span, why };
    }
    span += 1;
  }
};

/** A memory file's lessons, in order; a bullet in its lesson region with no id is `unmarked`, for {@link withIds} to give one. */
export const parseLessons = (
  path: string,
  content: string
): { lessons: LessonLine[]; unmarked: string[] } => {
  const { lines, region } = lessonRegion(path, content);
  const lessons: LessonLine[] = [];
  const unmarked: string[] = [];
  lines.forEach((line, index) => {
    if (!region(index)) {
      return;
    }
    const lesson = LESSON_LINE.exec(line);
    if (lesson?.[1] && lesson[2]) {
      const { anchor, why } = tailOf(lines, index + 1);
      lessons.push({ id: lesson[2], text: lesson[1], why, anchor });
    } else if (BULLET.test(line)) {
      unmarked.push(line);
    }
  });
  return { lessons, unmarked };
};

/** One line of a memory file read as a lesson's line: its id and words; undefined for any other line. */
export const lessonLineOf = (
  line: string
): { id: string; text: string } | undefined => {
  const read = LESSON_LINE.exec(line);
  return read?.[1] && read[2] ? { id: read[2], text: read[1] } : undefined;
};

/** Every lesson line of `files`' homes, with the file it is in (an archive's aside). */
export const allLessons = (files: MemoryFiles) =>
  Object.keys(files)
    .sort()
    .flatMap((path) =>
      homeOf(path)
        ? parseLessons(path, files[path] ?? "").lessons.map((line) => ({
            line,
            path,
          }))
        : []
    );

/** Lesson `id`'s line and the file it is in; undefined when no home holds it. */
export const lessonOf = (files: MemoryFiles, id: string) =>
  allLessons(files).find(({ line }) => line.id === id);

/** `content` with lesson `id`'s line (and the lines under it) put in place by `put`'s lines; as it was when it holds no such line. */
const spliced = (content: string, id: string, put: string[]): string => {
  const lines = content.split("\n");
  const at = lines.findIndex((each) => LESSON_LINE.exec(each)?.[2] === id);
  if (at < 0) {
    return content;
  }
  const { span } = tailOf(lines, at + 1);
  return [...lines.slice(0, at), ...put, ...lines.slice(at + 1 + span)].join(
    "\n"
  );
};

/** A new knowledge or skill lessons file's first lines: what it holds. */
const fileHead = (path: string): string => {
  const home = homeOf(path);
  if (home?.at === "skill") {
    return memoryRunWords.skillFileHead(home.skill);
  }
  return memoryRunWords.knowledgeFileHead(
    home?.at === "knowledge" ? home.topic : path
  );
};

/** `content` (of `path`; empty for a new file) with `line` added at the end of its lessons. */
const withLine = (path: string, content: string, line: LessonLine): string => {
  if (path === INDEX_FILE) {
    const sections = indexSections(content);
    return replaceSection(content, RULES, [
      ...sections.rules,
      renderLesson(line),
    ]);
  }
  const body = content.trim() === "" ? fileHead(path) : content.trimEnd();
  return `${body}\n${renderLesson(line)}\n`;
};

/** `content` of `path` with every bullet in its lesson region that has no id given one (a line the person wrote by hand); as it was when none lacks one. */
export const withIds = (
  path: string,
  content: string,
  taken: (id: string) => boolean
): string => {
  let text = content;
  const made = new Set<string>();
  for (const raw of parseLessons(path, content).unmarked) {
    const id = newLessonId((one) => taken(one) || made.has(one));
    made.add(id);
    const words = BULLET.exec(raw)?.[1] ?? raw;
    text = text.replace(
      raw,
      renderLesson({ id, text: words, why: null, anchor: null })
    );
  }
  return text;
};

/** `content` with section `name` gone. */
const dropSection = (content: string, name: string): string => {
  const out: string[] = [];
  let skipping = false;
  for (const line of linesOf(content)) {
    const section = SECTION.exec(line);
    if (section) {
      skipping = section[1] === name;
    }
    if (!skipping) {
      out.push(line);
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
};

/** The index's `## Skills` lines: one pointer per `lessons/<skill>.md` that holds a lesson, by the skill's name. */
const pointerLines = (files: MemoryFiles): string[] =>
  Object.keys(files)
    .flatMap((path) => {
      const home = homeOf(path);
      return home?.at === "skill" &&
        parseLessons(path, files[path] ?? "").lessons.length > 0
        ? [home.skill]
        : [];
    })
    .sort()
    .map((skill) =>
      memoryRunWords.skillPointer(skill, `${LESSONS_DIR}/${skill}.md`)
    );

/** `files` with the index's `## Skills` pointers as the `lessons/` files that hold a lesson say, a pointer each. */
const withPointers = (files: MemoryFiles): MemoryFiles => {
  const index = files[INDEX_FILE];
  if (index === undefined) {
    return files;
  }
  const pointers = pointerLines(files);
  if (indexSections(index).skills.join("\n") === pointers.join("\n")) {
    return files;
  }
  return {
    ...files,
    [INDEX_FILE]:
      pointers.length > 0
        ? replaceSection(index, SKILLS, pointers)
        : dropSection(index, SKILLS),
  };
};

/** `files` with lesson `id`'s line given `anchor` (the one-time commit of the ledger's end writes each fact's file into its line); as they were when no home holds it. */
export const withAnchor = (
  files: MemoryFiles,
  id: string,
  anchor: Anchor
): MemoryFiles => {
  const held = lessonOf(files, id);
  return held
    ? {
        ...files,
        [held.path]: spliced(files[held.path] ?? "", id, [
          renderLesson({ ...held.line, anchor }),
        ]),
      }
    : files;
};

// --- the changes ---------------------------------------------------------------------

/** One change to the memory's lines. */
export type Change =
  /** A new lesson: a line at the end of its home's lessons. */
  | { home: LessonHome; kind: "add"; line: LessonLine }
  /** A lesson's words changed in place, its id kept: its `Why:` as given (none when null), its anchor as it was. */
  | { id: string; kind: "reword"; text: string; why: string | null }
  /** A lesson's line taken out. */
  | { id: string; kind: "remove" }
  /** A lesson's line to another home. */
  | { home: LessonHome; id: string; kind: "move" };

/** What {@link applyLineChange} made: the files after it; or the budget the file it grew would pass, the files as they were; or the lesson it names held by no home. */
export type Applied =
  | { files: MemoryFiles }
  | { over: { budget: number; chars: number; path: string } }
  | { gone: string };

/** `files` with one change made, and the file it grew (for its budget). */
const made = (
  files: MemoryFiles,
  change: Change
): { files: MemoryFiles; grew?: string } | { gone: string } => {
  if (change.kind === "add") {
    const path = pathOf(change.home);
    return {
      files: {
        ...files,
        [path]: withLine(path, files[path] ?? "", change.line),
      },
      grew: path,
    };
  }
  const held = lessonOf(files, change.id);
  if (!held) {
    return { gone: change.id };
  }
  const { line, path } = held;
  const without = { ...files, [path]: spliced(files[path] ?? "", line.id, []) };
  switch (change.kind) {
    case "reword":
      return {
        files: {
          ...files,
          [path]: spliced(files[path] ?? "", line.id, [
            renderLesson({ ...line, text: change.text, why: change.why }),
          ]),
        },
        grew: path,
      };
    case "remove":
      return { files: without };
    case "move": {
      const into = pathOf(change.home);
      return {
        files: {
          ...without,
          [into]: withLine(into, without[into] ?? "", line),
        },
        grew: into,
      };
    }
    default:
      return unhandled("memory change", change);
  }
};

/**
 * One change made to the files (§5.1): one line, then the index's skill
 * pointers; refused, the files as they were, when the file it grew would
 * pass its character budget, or when no home holds the lesson it names.
 * His lines (the index's Notes and his own sections) are never touched.
 */
export const applyLineChange = (
  files: MemoryFiles,
  change: Change
): Applied => {
  const done = made(files, change);
  if ("gone" in done) {
    return done;
  }
  const budget = done.grew ? budgetOf(done.grew) : undefined;
  const chars = done.grew ? (done.files[done.grew] ?? "").length : 0;
  if (done.grew && budget !== undefined && chars > budget) {
    return { over: { path: done.grew, chars, budget } };
  }
  return { files: withPointers(done.files) };
};

/** Whether `day` (YYYY-MM-DD) is `days` or more before `today`. */
export const olderThan = (day: string, today: string, days: number): boolean =>
  Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`) >=
  days * DAY_MS;
