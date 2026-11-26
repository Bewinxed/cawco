/**
 * A project's rules as lines in its files (memory.ts reads and changes
 * them): the line format, the files they live in, and the three changes to
 * them, as pure functions over the files' words. Nothing here reads or
 * writes a file.
 *
 * - **A rule** is one line, `- <rule, one sentence> (L-7f3a2c)`, with at
 *   most one `  Why: <one line>` under it (and, on a line kept from before
 *   2026-11-26, one `  Anchor: <path> | <match>`). Its id is `L-` and six
 *   hex characters, the name `memory_rule` changes it by.
 * - **Provenance is git's**: each change is one commit, whose author says
 *   who made it and whose date says when; `git log -S "(L-7f3a2c)"` finds
 *   every change of a line.
 * - **Files**: the index, `AGENTS.md` (its `## Rules`, loaded into every
 *   session of the project at launch); a skill's lessons,
 *   `lessons/<skill>.md` (the index's `## Skills` points to each, a line
 *   this module keeps); and `knowledge/<topic>.md`, lines kept from before
 *   2026-11-26 that a rule may still be reworded or removed in. A new rule
 *   goes in the index.
 * - **The person's own lines**: the index's `## Notes` and every section of
 *   it this module does not keep are his, and no change here edits them.
 * - **Changes**: add, reword and remove a line ({@link applyLineChange});
 *   a change that would take a file past its character budget is refused.
 */
import { unhandled } from "@cawco/core/unhandled";
import { projectRulesWords } from "@cawco/core/words/project-rules";
import { MEMORY_FILE_CHARS } from "./config";

export const KNOWLEDGE_DIR = "knowledge";
/** The brand kit: `knowledge/brand/…` and `knowledge/brand*.md`; images and voice, not rules. */
const BRAND = /^knowledge\/brand(?:\/|[^/]*\.md$)/iu;

export const INDEX_FILE = "AGENTS.md";
export const LESSONS_DIR = "lessons";

const LESSON_LINE = /^- (.*\S) \((L-[0-9a-f]{6})\)\s*$/u;
const WHY_LINE = /^ {2}Why: (.*\S)\s*$/u;
/** A fact's file and the literal string in it that bear it out: `  Anchor: <path> | <match>`. */
const ANCHOR_LINE = /^ {2}Anchor: (.+?) \| (.+\S)\s*$/u;
const SECTION = /^## (.*\S)\s*$/u;
const TITLE = /^# (.*\S)\s*$/u;

/**
 * The character budget of `path`'s file: the index's and a knowledge
 * file's, what one brief carried of one file (config.ts
 * `MEMORY_FILE_CHARS`), so every session pays for the index what an
 * attempt pays for a named file. A skill's lessons have none.
 */
const budgetOf = (path: string): number | undefined => {
  const home = homeOf(path);
  return home?.at === "index" || home?.at === "knowledge"
    ? MEMORY_FILE_CHARS
    : undefined;
};

/** Where a rule lives: the index, a skill's lessons, or a knowledge topic. */
type LessonHome =
  | { at: "index" }
  | { at: "skill"; skill: string }
  | { at: "knowledge"; topic: string };

/** A kept line's file in the project's checkout, from its root, and the literal string in it that bore the line out. */
interface Anchor {
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

/** The project's rules files by path: the index, every `lessons/` and `knowledge/` file. */
export type MemoryFiles = Readonly<Partial<Record<string, string>>>;

/** The home a memory file's lessons have; undefined for a file that holds none (an archive, the brand kit, anything else). */
const homeOf = (path: string): LessonHome | undefined => {
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

/** A lesson as its file says it: its line, its `Why:`, its anchor. */
const renderLesson = (line: LessonLine): string =>
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

/** A rules file's lines with an id, in order. */
const parseLessons = (path: string, content: string): LessonLine[] => {
  const { lines, region } = lessonRegion(path, content);
  const lessons: LessonLine[] = [];
  lines.forEach((line, index) => {
    const lesson = region(index) ? LESSON_LINE.exec(line) : null;
    if (lesson?.[1] && lesson[2]) {
      const { anchor, why } = tailOf(lines, index + 1);
      lessons.push({ id: lesson[2], text: lesson[1], why, anchor });
    }
  });
  return lessons;
};

/** Every lesson line of `files`' homes, with the file it is in (an archive's aside). */
export const allLessons = (files: MemoryFiles) =>
  Object.keys(files)
    .sort()
    .flatMap((path) =>
      homeOf(path)
        ? parseLessons(path, files[path] ?? "").map((line) => ({
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

/** The index's words (empty for a new one) with `line` added at the end of its `## Rules`. */
const withRule = (content: string, line: LessonLine): string =>
  replaceSection(content, RULES, [
    ...indexSections(content).rules,
    renderLesson(line),
  ]);

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
        parseLessons(path, files[path] ?? "").length > 0
        ? [home.skill]
        : [];
    })
    .sort()
    .map((skill) =>
      projectRulesWords.skillPointer(skill, `${LESSONS_DIR}/${skill}.md`)
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

// --- the changes ---------------------------------------------------------------------

/** One change to the memory's lines. */
export type Change =
  /** A new rule: a line at the end of the index's `## Rules`. */
  | { kind: "add"; line: LessonLine }
  /** A lesson's words changed in place, its id kept: its `Why:` as given (none when null), its anchor as it was. */
  | { id: string; kind: "reword"; text: string; why: string | null }
  /** A lesson's line taken out. */
  | { id: string; kind: "remove" };

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
    return {
      files: {
        ...files,
        [INDEX_FILE]: withRule(files[INDEX_FILE] ?? "", change.line),
      },
      grew: INDEX_FILE,
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
