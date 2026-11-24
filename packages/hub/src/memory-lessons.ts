/**
 * A project's memory as lessons (memory-run.ts writes it, memory.ts reads
 * it): the line format, the files they live in, the ledger, and every
 * change to them, as pure functions over the files' words. Nothing here
 * reads or writes a file.
 *
 * - **A lesson** is one line, `- <rule or fact, one sentence> (L-7f3a2c)`,
 *   with at most one `  Why: <one line>` under it. Its id is `L-` and six
 *   hex characters; its dates and sources are in the ledger, so what every
 *   session loads is the rule and its id.
 * - **Homes**, by how a lesson reaches a session: the index, `AGENTS.md`
 *   (its `## Rules`, loaded into every session of the project at launch);
 *   a skill's lessons, `lessons/<skill>.md` (read when that skill runs: the
 *   index's `## Skills` points to each, a line this module writes); a
 *   knowledge topic, `knowledge/<topic>.md` (carried into an attempt's
 *   brief by the task's words). `knowledge/archive/` is history, read by no
 *   session.
 * - **The person's own lines**: the index's `## Notes` (Make a note) and
 *   every section of it this module does not keep (a setup's) are his, and
 *   no change here edits them.
 * - **The ledger**, `memory/lessons.json`: each lesson's home, state, whose
 *   it is, its dates and its sources, by reference.
 * - **Budgets**, each with its reason ({@link CAPS}): a change that would
 *   take a file past its character budget is refused ({@link applyOp}),
 *   and nothing moves out on its own.
 */
import { DAY_MS } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { memoryRunWords } from "@cawco/core/words/memory-run";
import { MEMORY_FILE_CHARS } from "./config";
import { MemoryLedgerSchema } from "./db/stored-shapes";
import type {
  MemoryLedger as Ledger,
  Lesson,
  LessonHome,
  LessonSource,
} from "./db/stored-types";

export const KNOWLEDGE_DIR = "knowledge";
/** Where a knowledge lesson goes once archived: `knowledge/archive/<topic>.md`, kept as history. */
export const KNOWLEDGE_ARCHIVE = "knowledge/archive";
export const NOTE_ID = /^n-\d{8}-\d{6}-[0-9a-f]{6}$/u;
/** The brand kit: `knowledge/brand/…` and `knowledge/brand*.md`; images and voice, not lessons. */
export const BRAND = /^knowledge\/brand(?:\/|[^/]*\.md$)/iu;

/** The day of an ISO time or a date: `2026-10-18`. */
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
export const LEDGER_FILE = "memory/lessons.json";
export const RUN_STATE_FILE = "memory/state.json";

const LESSON_LINE = /^- (.*\S) \((L-[0-9a-f]{6})\)\s*$/u;
const WHY_LINE = /^ {2}Why: (.*\S)\s*$/u;
const BULLET = /^- (.*\S)\s*$/u;
const SECTION = /^## (.*\S)\s*$/u;
const TITLE = /^# (.*\S)\s*$/u;
const SKILL_NAME = /^[a-z0-9][\w.:-]*$/iu;
const TOPIC_NAME = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * Every limit on the project's memory, each with its reason. A change that
 * would take a file past its character budget is refused, naming the
 * budget: nothing moves out on its own.
 */
export const CAPS = {
  /**
   * The whole index, its Notes counted: the share of AGENTS.md a brief
   * carried before (`MEMORY_FILE_CHARS`, config.ts), so every session pays
   * what an attempt paid, and no more. His notes count, so they shrink what
   * the run may keep.
   */
  indexChars: 8000,
  /** A rule line: one sentence. A rule that needs more is a method, and goes to a skill's lessons or knowledge. */
  rule: 200,
  /** A knowledge line: a fact carries a command or a path (the length a note could stand as a fact line before, `FACT_WORDS`). */
  fact: 300,
  /** A `Why:` line, one per lesson: one line of why. */
  why: 160,
  /** A retired lesson's days in the ledger, its words kept. */
  retiredDays: 30,
  /**
   * A night's added lessons, and its replaces and removals: at 80 to 240
   * messages a day, about a tenth of them instructions, most repeating a
   * lesson kept already, a night changes a handful; a run asking for more
   * is broken or steered.
   */
  nightAdds: 10,
  nightChanges: 10,
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

/** One lesson line as its file says it. */
export interface LessonLine {
  id: string;
  text: string;
  why: string | null;
}

/** The path a home's lessons are in; none for a lesson with no home. */
export const pathOf = (home: LessonHome): string | undefined => {
  switch (home.at) {
    case "index":
      return INDEX_FILE;
    case "skill":
      return `${LESSONS_DIR}/${home.skill}.md`;
    case "knowledge":
      return `${KNOWLEDGE_DIR}/${home.topic}.md`;
    case "none":
      return;
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

/** A lesson as its file says it. */
const renderLesson = (line: LessonLine): string =>
  `- ${line.text} (${line.id})${line.why ? `\n  Why: ${line.why}` : ""}`;

/** A fresh lesson id that `taken` does not hold. */
export const newLessonId = (taken: (id: string) => boolean): string => {
  for (;;) {
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

/** The index with `text` added as a line of his `## Notes` (Make a note). */
export const withNote = (
  projectName: string,
  content: string,
  text: string
): string => {
  const [first = "", ...rest] = text.trim().split("\n");
  const shaped = indexShape(projectName, content);
  return replaceSection(shaped, NOTES, [
    ...indexSections(shaped).notes,
    `- ${first.trim()}`,
    ...rest.map((more) => `  ${more}`),
  ]);
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

/** A memory file's lessons, in order; a bullet in its lesson region with no id is `unmarked`, for {@link reconcile} to adopt. */
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
      const why = WHY_LINE.exec(lines[index + 1] ?? "");
      lessons.push({ id: lesson[2], text: lesson[1], why: why?.[1] ?? null });
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

/** `content` with lesson `id`'s line (and its `Why:`) put in place by `put`'s lines; as it was when it holds no such line. */
const spliced = (content: string, id: string, put: string[]): string => {
  const lines = linesOf(content);
  const at = lines.findIndex((each) => LESSON_LINE.exec(each)?.[2] === id);
  if (at < 0) {
    return content;
  }
  const span = WHY_LINE.test(lines[at + 1] ?? "") ? 2 : 1;
  return [...lines.slice(0, at), ...put, ...lines.slice(at + span)].join("\n");
};

/** `content` with lesson `id`'s line (and its `Why:`) gone. */
const withoutLine = (content: string, id: string): string =>
  spliced(content, id, []);

/** `content` with lesson `id`'s line (and its `Why:`) put in place by `line`. */
const swappedLine = (content: string, id: string, line: LessonLine): string =>
  spliced(content, id, [renderLesson(line)]);

/** A new knowledge or skill lessons file's first lines: what it holds. */
const fileHead = (path: string): string => {
  const home = homeOf(path);
  if (home?.at === "skill") {
    return memoryRunWords.skillFileHead(home.skill);
  }
  const archive = new RegExp(`^${KNOWLEDGE_ARCHIVE}/([^/]+)\\.md$`, "u").exec(
    path
  );
  if (archive?.[1]) {
    return memoryRunWords.archiveFileHead(archive[1]);
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

// --- the ledger ----------------------------------------------------------------------

/** A ledger that holds nothing yet. */
const emptyLedger = (): Ledger => ({ version: 1, lessons: {} });

/** `memory/lessons.json` read; an empty ledger for none; the words of why it does not read otherwise. */
export const parseLedger = (text: string): Ledger | string => {
  if (text.trim() === "") {
    return emptyLedger();
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return `${LEDGER_FILE} is not JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  const read = MemoryLedgerSchema.safeParse(json);
  return read.success
    ? read.data
    : `${LEDGER_FILE} does not read as a ledger: ${read.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`;
};

/** The ledger as its file keeps it, its lessons by id. */
export const renderLedger = (ledger: Ledger): string =>
  `${JSON.stringify(
    {
      version: ledger.version,
      lessons: Object.fromEntries(
        Object.entries(ledger.lessons).sort(([a], [b]) => a.localeCompare(b))
      ),
    },
    null,
    2
  )}\n`;

// --- the tree, and the one way it changes ---------------------------------------------

/** The project's memory files by path (the index, every `lessons/` and `knowledge/` file, the archive's), and its ledger. */
export interface MemoryTree {
  files: Readonly<Partial<Record<string, string>>>;
  ledger: Ledger;
}

/**
 * A change memory-run.ts has checked against every rule of the sources,
 * the text and the caps (memory-run.ts `checked`): the only change
 * {@link applyOp} takes, and made only there (scripts/memory-cutover-check.ts,
 * C6). Its private field makes it nominal: no object of the same shape
 * passes for one.
 */
export class CheckedOp {
  readonly #checked = true;
  readonly change: Change;
  constructor(change: Change) {
    this.change = change;
  }
  /** Whether it was made as a checked change (always, for an instance). */
  get checked(): boolean {
    return this.#checked;
  }
}

/** What one checked operation does to the files and the ledger. */
export type Change =
  /** A new lesson: a line in its home. */
  | {
      by: Lesson["by"];
      home: LessonHome;
      id: string;
      kind: "add";
      sources: Lesson["sources"];
      text: string;
      why: string | null;
    }
  /** A live lesson's words changed: its line rewritten under a new id, with its `Why:` (none when `why` is null). */
  | {
      by: Lesson["by"];
      id: string;
      kind: "replace";
      newId: string;
      sources: Lesson["sources"];
      text: string;
      why: string | null;
    }
  /** A source stated a live lesson again. */
  | { id: string; kind: "corroborate"; sources: Lesson["sources"] }
  /** A live lesson to another home. */
  | { home: LessonHome; id: string; kind: "move" }
  /** A lesson removed, with why. */
  | {
      id: string;
      kind: "retire";
      why: NonNullable<Lesson["retired"]>["why"];
    }
  /** A lesson removed through memory_rule (memory-run.ts `ruleAsked`): its line taken out, retired `hand` with its words kept. */
  | { id: string; kind: "remove" }
  /** A knowledge lesson no brief carried for the archive's days, to `knowledge/archive/<topic>.md`. */
  | { id: string; kind: "archive" }
  /** A lesson whose file, or the match in it, is gone: its line taken out, its words kept for the ledger's days. */
  | { id: string; kind: "stale" }
  /** A lesson a check holds now (its task done): its line taken out; the ledger keeps it, enforced. */
  | { id: string; kind: "enforce" };

/** What {@link applyOp} did: the tree after it, or the budget the file it grew would pass, the tree as it was. */
export type Applied =
  | { tree: MemoryTree }
  | { over: { budget: number; chars: number; path: string } };

/** A lesson line's words as its file says them now; undefined when it has none. */
export const lineOf = (
  tree: MemoryTree,
  id: string
): LessonLine | undefined => {
  const lesson = tree.ledger.lessons[id];
  const path = lesson ? pathOf(lesson.home) : undefined;
  return path
    ? parseLessons(path, tree.files[path] ?? "").lessons.find(
        (line) => line.id === id
      )
    : undefined;
};

/** The ledger with `id`'s entry changed by `patch` (or made, when `patch` is whole). */
const withEntry = (
  ledger: Ledger,
  id: string,
  entry: Lesson | undefined
): Ledger => {
  const lessons = { ...ledger.lessons };
  if (entry) {
    lessons[id] = entry;
  } else {
    delete lessons[id];
  }
  return { ...ledger, lessons };
};

/** `tree` with lesson `id`'s line moved from its home to `to`, its ledger entry's home with it. */
const moveLine = (tree: MemoryTree, id: string, to: LessonHome): MemoryTree => {
  const lesson = tree.ledger.lessons[id];
  const line = lineOf(tree, id);
  const from = lesson ? pathOf(lesson.home) : undefined;
  const into = pathOf(to);
  if (!(lesson && line && from && into)) {
    return tree;
  }
  const files = {
    ...tree.files,
    [from]: withoutLine(tree.files[from] ?? "", id),
  };
  files[into] = withLine(into, files[into] ?? "", line);
  return {
    files,
    ledger: withEntry(tree.ledger, id, { ...lesson, home: to }),
  };
};

/** `tree` with lesson `id`'s line taken out of its home and the ledger saying why; the words kept in the ledger. */
const retireLine = (
  tree: MemoryTree,
  id: string,
  why: NonNullable<Lesson["retired"]>["why"],
  today: string,
  { by }: { by?: string } = {}
): MemoryTree => {
  const lesson = tree.ledger.lessons[id];
  if (!lesson) {
    return tree;
  }
  const line = lineOf(tree, id);
  const from = pathOf(lesson.home);
  const files =
    from && line
      ? { ...tree.files, [from]: withoutLine(tree.files[from] ?? "", id) }
      : tree.files;
  const { staged, ...rest } = lesson;
  return {
    files,
    ledger: withEntry(tree.ledger, id, {
      ...rest,
      state: "retired",
      retired: {
        on: today,
        why,
        text: line?.text ?? staged?.text ?? "",
        ...(by ? { by } : {}),
      },
    }),
  };
};

/** `tree` with knowledge lesson `id`'s line moved to its topic's archive, the lesson retired as no longer needed. */
const archiveLine = (
  tree: MemoryTree,
  id: string,
  topic: string,
  today: string
): MemoryTree => {
  const line = lineOf(tree, id);
  if (!line) {
    return tree;
  }
  const into = `${KNOWLEDGE_ARCHIVE}/${topic}.md`;
  const retired = retireLine(tree, id, "unneeded", today);
  return {
    ...retired,
    files: {
      ...retired.files,
      [into]: withLine(into, retired.files[into] ?? "", line),
    },
  };
};

/** The index with its `## Skills` pointers as the `lessons/` files that hold a lesson say, a pointer each. */
const withPointers = (tree: MemoryTree): MemoryTree => {
  const index = tree.files[INDEX_FILE];
  if (index === undefined) {
    return tree;
  }
  const pointers = pointerLines(tree);
  const before = indexSections(index).skills;
  if (before.join("\n") === pointers.join("\n")) {
    return tree;
  }
  const without =
    pointers.length > 0
      ? replaceSection(index, SKILLS, pointers)
      : dropSection(index, SKILLS);
  return { ...tree, files: { ...tree.files, [INDEX_FILE]: without } };
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
const pointerLines = (tree: MemoryTree): string[] =>
  Object.keys(tree.files)
    .flatMap((path) => {
      const home = homeOf(path);
      return home?.at === "skill" &&
        parseLessons(path, tree.files[path] ?? "").lessons.length > 0
        ? [home.skill]
        : [];
    })
    .sort()
    .map((skill) =>
      memoryRunWords.skillPointer(skill, `${LESSONS_DIR}/${skill}.md`)
    );

/** What one change did to the tree: the tree, and the file it grew (for its budget). */
interface Done {
  grew?: string;
  tree: MemoryTree;
}

type ChangeOf<K extends Change["kind"]> = Extract<Change, { kind: K }>;

/** `now` with `line` added in `home`'s file and its entry as `entry`; the file it grew. */
const placed = (
  now: MemoryTree,
  home: LessonHome,
  line: LessonLine,
  entry: Lesson
): Done => {
  const path = pathOf(home) ?? INDEX_FILE;
  return {
    tree: {
      files: {
        ...now.files,
        [path]: withLine(path, now.files[path] ?? "", line),
      },
      ledger: withEntry(now.ledger, line.id, entry),
    },
    grew: path,
  };
};

/** A new lesson: a line in its home. */
const added = (now: MemoryTree, op: ChangeOf<"add">, today: string): Done =>
  placed(
    now,
    op.home,
    { id: op.id, text: op.text, why: op.why },
    {
      by: op.by,
      home: op.home,
      seen: today,
      since: today,
      sources: op.sources,
      state: "live",
    }
  );

/** A live lesson's line rewritten under its new id; the old one retired as replaced, its words kept. */
const replaced = (
  now: MemoryTree,
  op: ChangeOf<"replace">,
  today: string
): Done => {
  const lesson = now.ledger.lessons[op.id];
  const path = lesson ? pathOf(lesson.home) : undefined;
  const old = lineOf(now, op.id);
  if (!(lesson && path && old)) {
    return { tree: now };
  }
  const retired = withEntry(now.ledger, op.id, {
    ...lesson,
    state: "retired",
    retired: { on: today, why: "replaced", by: op.newId, text: old.text },
  });
  return {
    tree: {
      files: {
        ...now.files,
        [path]: swappedLine(now.files[path] ?? "", op.id, {
          id: op.newId,
          text: op.text,
          why: op.why,
        }),
      },
      ledger: withEntry(retired, op.newId, {
        by: op.by,
        home: lesson.home,
        seen: today,
        since: today,
        sources: op.sources,
        state: "live",
      }),
    },
    grew: path,
  };
};

/** A lesson stated again: its new sources kept and the day seen. */
const corroborated = (
  now: MemoryTree,
  op: ChangeOf<"corroborate">,
  today: string
): Done => {
  const lesson = now.ledger.lessons[op.id];
  if (!lesson) {
    return { tree: now };
  }
  return {
    tree: {
      ...now,
      ledger: withEntry(now.ledger, op.id, {
        ...lesson,
        seen: today,
        sources: withSourcesAdded(lesson.sources, op.sources),
      }),
    },
  };
};

/** `sources` with `more` added, none twice. */
const withSourcesAdded = (
  sources: readonly LessonSource[],
  more: readonly LessonSource[]
): LessonSource[] => [
  ...sources,
  ...more.filter(
    (source) => !sources.some((had) => Bun.deepEquals(had, source))
  ),
];

/** `tree` with lesson `id`'s entry patched by `patch`: a ledger edit, no line changes. */
const entryPatched = (
  tree: MemoryTree,
  id: string,
  patch: Partial<Lesson>
): MemoryTree => {
  const lesson = tree.ledger.lessons[id];
  return lesson
    ? { ...tree, ledger: withEntry(tree.ledger, id, { ...lesson, ...patch }) }
    : tree;
};

/** `now` with lesson `id`'s line taken out and the lesson enforced: a check holds it. */
const enforced = (now: MemoryTree, id: string): MemoryTree => {
  const lesson = now.ledger.lessons[id];
  const from = lesson ? pathOf(lesson.home) : undefined;
  return lesson && from
    ? {
        files: {
          ...now.files,
          [from]: withoutLine(now.files[from] ?? "", id),
        },
        ledger: withEntry(now.ledger, id, { ...lesson, state: "enforced" }),
      }
    : now;
};

/** One change, by its kind. */
const changed = (now: MemoryTree, op: Change, today: string): Done => {
  switch (op.kind) {
    case "add":
      return added(now, op, today);
    case "replace":
      return replaced(now, op, today);
    case "corroborate":
      return corroborated(now, op, today);
    case "move": {
      const grew = pathOf(op.home);
      return {
        tree: moveLine(now, op.id, op.home),
        ...(grew ? { grew } : {}),
      };
    }
    case "retire":
      return { tree: retireLine(now, op.id, op.why, today) };
    case "remove":
      return { tree: retireLine(now, op.id, "hand", today) };
    case "enforce":
      return { tree: enforced(now, op.id) };
    case "stale":
      return {
        tree: entryPatched(retireLine(now, op.id, "stale", today), op.id, {
          state: "stale",
        }),
      };
    case "archive": {
      const { home } = now.ledger.lessons[op.id] ?? {};
      return {
        tree:
          home?.at === "knowledge"
            ? archiveLine(now, op.id, home.topic, today)
            : now,
      };
    }
    default:
      return unhandled("memory change", op);
  }
};

/**
 * One checked change applied to the files and the ledger (§5.2 step 5):
 * one line and one entry, then the index's skill pointers; refused, the
 * tree as it was, when the file it grew would pass its character budget
 * ({@link budgetOf}). His lines (the index's Notes and his own sections)
 * are never touched.
 */
export const applyOp = (
  tree: MemoryTree,
  checked: CheckedOp,
  today: string
): Applied => {
  const done = changed(tree, checked.change, today);
  const budget = done.grew ? budgetOf(done.grew) : undefined;
  const chars = done.grew ? (done.tree.files[done.grew] ?? "").length : 0;
  if (done.grew && budget !== undefined && chars > budget) {
    return { over: { path: done.grew, chars, budget } };
  }
  return { tree: withPointers(done.tree) };
};

/** `path`'s lessons, each bullet with no id given one: the file's words then, and its lessons. */
const marked = (
  path: string,
  content: string,
  taken: (id: string) => boolean
): { lessons: LessonLine[]; text: string } => {
  const { lessons, unmarked } = parseLessons(path, content);
  let text = content;
  const made = new Set<string>();
  for (const raw of unmarked) {
    const id = newLessonId((one) => taken(one) || made.has(one));
    made.add(id);
    const words = BULLET.exec(raw)?.[1] ?? raw;
    text = text.replace(raw, renderLesson({ id, text: words, why: null }));
    lessons.push({ id, text: words, why: null });
  }
  return { lessons, text };
};

/**
 * The files and the ledger agreed (§2 A.1): every lesson line has an entry,
 * and every live entry a line. A line with no entry, or a bullet with no id
 * in a lesson region, is a hand edit of the person's: it is given an id
 * (`adopted`) and an entry resting on that edit (`commit`, the folder's head
 * it was read at). A live entry whose line moved to another file lives
 * there. A live entry whose line is gone is retired as removed by hand
 * (`orphaned`). Staged and retired entries have no line, and an archive's
 * lines are history: neither is read here.
 */
export const reconcile = (
  tree: MemoryTree,
  today: string,
  commit: string
): { adopted: string[]; orphaned: string[]; tree: MemoryTree } => {
  const files: Partial<Record<string, string>> = { ...tree.files };
  const lessons = { ...tree.ledger.lessons };
  const adopted: string[] = [];
  const seen = new Set<string>();
  for (const path of Object.keys(tree.files).sort()) {
    const home = homeOf(path);
    if (!home) {
      continue;
    }
    const read = marked(
      path,
      files[path] ?? "",
      (id) => id in lessons || seen.has(id)
    );
    files[path] = read.text;
    for (const line of read.lessons) {
      seen.add(line.id);
      const entry = lessons[line.id];
      if (entry?.state === "live") {
        lessons[line.id] = { ...entry, home };
        continue;
      }
      adopted.push(line.id);
      lessons[line.id] = {
        by: "owner",
        home,
        seen: today,
        since: today,
        sources: [{ kind: "hand", commit }],
        state: "live",
      };
    }
  }
  const orphaned = Object.keys(lessons).filter(
    (id) => lessons[id]?.state === "live" && !seen.has(id)
  );
  for (const id of orphaned) {
    const lesson = lessons[id];
    if (lesson) {
      lessons[id] = {
        ...lesson,
        state: "retired",
        retired: { on: today, why: "hand", text: "" },
      };
    }
  }
  return {
    tree: withPointers({ files, ledger: { ...tree.ledger, lessons } }),
    adopted,
    orphaned,
  };
};

/** Whether `day` (YYYY-MM-DD) is `days` or more before `today`. */
export const olderThan = (day: string, today: string, days: number): boolean =>
  Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`) >=
  days * DAY_MS;
