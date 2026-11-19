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
 *   no change here edits or evicts them.
 * - **The ledger**, `memory/lessons.json`: each lesson's home, state, whose
 *   it is, its dates and its sources, by reference.
 * - **Caps**, each with its reason ({@link CAPS}); past a file's line cap
 *   the hub moves a line out ({@link evict}), never a model.
 */
import { DAY_MS } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { memoryRunWords } from "@cawco/core/words/memory-run";
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

/** Where an index or skill lesson evicted from its home goes: still live, carried by a brief's words. */
const RULES_TOPIC = "rules";

const LESSON_LINE = /^- (.*\S) \((L-[0-9a-f]{6})\)\s*$/u;
const WHY_LINE = /^ {2}Why: (.*\S)\s*$/u;
const BULLET = /^- (.*\S)\s*$/u;
const SECTION = /^## (.*\S)\s*$/u;
const TITLE = /^# (.*\S)\s*$/u;
const SKILL_NAME = /^[a-z0-9][\w.:-]*$/iu;
const TOPIC_NAME = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * Every cap of the project's memory, each with its reason.
 */
export const CAPS = {
  /**
   * The index's rule lines. With {@link CAPS.rule} this is 8,000
   * characters, the share of AGENTS.md a brief carried before
   * (`MEMORY_FILE_CHARS`, config.ts): every session now pays what an
   * attempt paid, and no more. Files people cut by hand and kept sit
   * between 20 and 80 lines; this one loads on top of the fleet's own
   * memory, so it takes the low half.
   */
  indexRules: 40,
  /** The whole index, its Notes counted: the same budget. His notes are never evicted, so they shrink what the run may keep. */
  indexChars: 8000,
  /** A rule line: one sentence. A rule that needs more is a method, and goes to a skill's lessons or knowledge. */
  rule: 200,
  /** A knowledge line: a fact carries a command or a path (the length a note could stand as a fact line before, `FACT_WORDS`). */
  fact: 300,
  /** A `Why:` line, one per lesson: one line of why. */
  why: 160,
  /** A skill's lessons: read on top of the skill's own text every time it runs; twelve lines is under a tenth of a typical skill. */
  skillLines: 12,
  /** A knowledge file: 8,000 characters at 200 a line, what one brief carried of one file. */
  knowledgeLines: 40,
  /** Knowledge files: past this a new topic is refused and the lesson goes into one that is there (the reshape mark before, `RESHAPE_ABOVE`). */
  knowledgeFiles: 25,
  /** Staged lessons: one run's notes (`RUN_NOTES`). */
  staged: 60,
  /** A staged lesson's days: at 5 to 15 chats a day, 70 to 210 sessions met none that noted it again, so it is not recurring. */
  stagedDays: 14,
  /** A retired lesson's days in the ledger, its words kept so it can be put back. */
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
export const renderLesson = (line: LessonLine): string =>
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

/** The index with `line` added at the end of its `## Rules`. */
export const indexWithRule = (index: string, line: LessonLine): string =>
  withLine(INDEX_FILE, index, line);

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
  /** A new lesson: a line in its home, or, staged, the ledger alone. */
  | {
      by: Lesson["by"];
      home: LessonHome;
      id: string;
      kind: "add";
      probe?: Lesson["probe"];
      sources: Lesson["sources"];
      staged?: { waits?: "jev" };
      text: string;
      why: string | null;
    }
  /** A live lesson's words changed: its line rewritten under a new id, its `Why:` saying what it was. */
  | {
      by: Lesson["by"];
      id: string;
      kind: "replace";
      newId: string;
      sources: Lesson["sources"];
      text: string;
      why: string;
    }
  /** A source stated a lesson again; a staged one it bears out lands in its topic. */
  | {
      id: string;
      kind: "corroborate";
      lands: boolean;
      sources: Lesson["sources"];
    }
  /** A live lesson to another home. */
  | { home: LessonHome; id: string; kind: "move" }
  /** Lesson `id` says what live lesson `into` says: `into` keeps both's sources and repeats, `id` is retired as merged into it. */
  | { id: string; into: string; kind: "merge" }
  /** A lesson removed, with why. */
  | {
      id: string;
      kind: "retire";
      why: NonNullable<Lesson["retired"]>["why"];
    }
  /** A knowledge lesson no brief carried for the archive's days, to `knowledge/archive/<topic>.md`. */
  | { id: string; kind: "archive" }
  /** A lesson about how CawCo itself works, taken out of the project's memory: retired `product`, with the task that builds it into CawCo when one does. */
  | { id: string; kind: "product"; task?: string }
  /**
   * A lesson the run took out, put back in its home as `line` (its words as
   * the folder held them before), live again; `held` when the person stated
   * it again, his message (`source`) one of its sources.
   */
  | {
      held: boolean;
      id: string;
      kind: "restore";
      line: LessonLine;
      source?: LessonSource;
    }
  /** A lesson the run made, taken back because the person stated the opposite: retired, and held, so no run touches it again. */
  | { id: string; kind: "revert" }
  /** A lesson whose file, or the match in it, is gone: its line taken out, its words kept for the ledger's days. */
  | { id: string; kind: "stale" }
  /** A lesson a check holds now (its task done): its line taken out; the ledger keeps it, enforced. */
  | { id: string; kind: "enforce" }
  /**
   * An index or skill lesson a model does unprompted, moved to the
   * knowledge its eviction would take it to, its `Why:` saying which model
   * and when; the ledger keeps the model it was tested on.
   */
  | { id: string; kind: "demote"; model: string; why: string }
  /** A lesson re-tested on `model` that stays where it is. */
  | { id: string; kind: "tested"; model: string }
  /**
   * The person stated a live lesson again: one more repeat, his message one
   * of its sources, his rule from now on; `held` from his second, and moved
   * `up` a home when it has one to go to.
   */
  | {
      held: boolean;
      id: string;
      kind: "repeat";
      source: LessonSource;
      up?: LessonHome;
    };

/** A line moved out of a file past its cap, and where to. */
export interface Eviction {
  from: string;
  id: string;
  to: string;
}

/** What {@link applyOp} did: the tree after it, the lines eviction moved, and whether a new index lesson went to knowledge because every index line is held. */
export interface Applied {
  evicted: Eviction[];
  redirected: boolean;
  tree: MemoryTree;
}

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

/** The cap on `path`'s lesson lines, and on its words when it has one. */
const capOf = (path: string): { chars?: number; lines: number } => {
  const home = homeOf(path);
  if (home?.at === "index") {
    return { lines: CAPS.indexRules, chars: CAPS.indexChars };
  }
  return home?.at === "skill"
    ? { lines: CAPS.skillLines }
    : { lines: CAPS.knowledgeLines };
};

/** Where a line evicted from `path` goes: an index or skill line to knowledge, still live; a knowledge line to its topic's archive. */
const evictedTo = (path: string): LessonHome | { archive: string } => {
  const home = homeOf(path);
  if (home?.at === "index") {
    return { at: "knowledge", topic: RULES_TOPIC };
  }
  if (home?.at === "skill") {
    return { at: "knowledge", topic: home.skill.toLowerCase() };
  }
  return { archive: home?.at === "knowledge" ? home.topic : RULES_TOPIC };
};

/** Whether `path`'s file is past its cap. */
const overCap = (tree: MemoryTree, path: string): boolean => {
  const cap = capOf(path);
  const content = tree.files[path] ?? "";
  return (
    parseLessons(path, content).lessons.length > cap.lines ||
    (cap.chars !== undefined && content.length > cap.chars)
  );
};

/**
 * The line of `path`'s file that leaves first when it is past its cap: the
 * one he stated again the fewest times, then the one a source stated
 * longest ago, then the smallest id; for a knowledge file, the one a brief
 * last carried longest ago (never, first) before those. A `held` lesson
 * never leaves, nor his own lines (the index's Notes, which hold no
 * lessons). Undefined when every line is held.
 */
const evict = (
  path: string,
  content: string,
  ledger: Ledger,
  uses: ReadonlyMap<string, Date>
): string | undefined => {
  const knowledge = homeOf(path)?.at === "knowledge";
  const candidates = parseLessons(path, content)
    .lessons.map((line) => ({ line, lesson: ledger.lessons[line.id] }))
    .filter(({ lesson }) => !lesson?.held);
  candidates.sort((a, b) => {
    const usedA = uses.get(a.line.id)?.getTime() ?? 0;
    const usedB = uses.get(b.line.id)?.getTime() ?? 0;
    return (
      (knowledge ? usedA - usedB : 0) ||
      (a.lesson?.repeats ?? 0) - (b.lesson?.repeats ?? 0) ||
      (a.lesson?.seen ?? "").localeCompare(b.lesson?.seen ?? "") ||
      a.line.id.localeCompare(b.line.id)
    );
  });
  return candidates[0]?.line.id;
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
  { by, task }: { by?: string; task?: string } = {}
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
        ...(task ? { task } : {}),
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

/**
 * Moves lines out of every file past its cap ({@link evict}), each to the
 * home {@link evictedTo} names, until none is past it; a move that leaves
 * its new home past its own cap evicts there in turn.
 */
const evictOver = (
  tree: MemoryTree,
  uses: ReadonlyMap<string, Date>,
  today: string,
  from: string
): { evicted: Eviction[]; tree: MemoryTree } => {
  const evicted: Eviction[] = [];
  let now = tree;
  const queue = [from];
  for (let guard = 0; queue.length > 0 && guard < 200; guard += 1) {
    const path = queue[0] ?? "";
    if (!overCap(now, path)) {
      queue.shift();
      continue;
    }
    const id = evict(path, now.files[path] ?? "", now.ledger, uses);
    if (!id) {
      queue.shift();
      continue;
    }
    const to = evictedTo(path);
    if ("archive" in to) {
      now = archiveLine(now, id, to.archive, today);
      evicted.push({
        id,
        from: path,
        to: `${KNOWLEDGE_ARCHIVE}/${to.archive}.md`,
      });
    } else {
      now = moveLine(now, id, to);
      const into = pathOf(to) ?? "";
      evicted.push({ id, from: path, to: into });
      queue.push(into);
    }
  }
  return { evicted, tree: now };
};

/** Whether every lesson line of the index is held: a new index lesson then goes to knowledge. */
const indexAllHeld = (tree: MemoryTree): boolean => {
  const { lessons } = parseLessons(INDEX_FILE, tree.files[INDEX_FILE] ?? "");
  return (
    lessons.length >= CAPS.indexRules &&
    lessons.every((line) => tree.ledger.lessons[line.id]?.held)
  );
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

/** What one change did to the tree: the tree, the file it grew (for eviction), and whether an index lesson went to knowledge instead. */
interface Done {
  grew?: string;
  redirected?: true;
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

/** A new lesson: staged in the ledger alone, or a line in its home (knowledge when every index line is held). */
const added = (now: MemoryTree, op: ChangeOf<"add">, today: string): Done => {
  const base: Lesson = {
    by: op.by,
    home: op.home,
    ...(op.probe ? { probe: op.probe } : {}),
    repeats: 0,
    seen: today,
    since: today,
    sources: op.sources,
    state: "live",
  };
  if (op.staged) {
    return {
      tree: {
        ...now,
        ledger: withEntry(now.ledger, op.id, {
          ...base,
          home: { at: "none" },
          state: "staged",
          staged: { home: op.home, text: op.text, ...op.staged },
        }),
      },
    };
  }
  const redirected = op.home.at === "index" && indexAllHeld(now);
  const home: LessonHome = redirected
    ? { at: "knowledge", topic: RULES_TOPIC }
    : op.home;
  return {
    ...placed(
      now,
      home,
      { id: op.id, text: op.text, why: op.why },
      {
        ...base,
        home,
      }
    ),
    ...(redirected ? { redirected: true as const } : {}),
  };
};

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
        repeats: 0,
        seen: today,
        since: today,
        sources: op.sources,
        state: "live",
        ...(lesson.held ? { held: true as const } : {}),
      }),
    },
    grew: path,
  };
};

/** A lesson stated again: its new sources kept and the day seen; a staged one that lands, a line in its topic. */
const corroborated = (
  now: MemoryTree,
  op: ChangeOf<"corroborate">,
  today: string
): Done => {
  const lesson = now.ledger.lessons[op.id];
  if (!lesson) {
    return { tree: now };
  }
  const sources = withSourcesAdded(lesson.sources, op.sources);
  const { staged, ...rest } = lesson;
  if (!(op.lands && staged)) {
    return {
      tree: {
        ...now,
        ledger: withEntry(now.ledger, op.id, {
          ...lesson,
          seen: today,
          sources,
        }),
      },
    };
  }
  return placed(
    now,
    staged.home,
    { id: op.id, text: staged.text, why: null },
    { ...rest, home: staged.home, state: "live", seen: today, sources }
  );
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

/** Two lessons that say the same made one: `op.into` keeps the sources, repeats and hold of both, `op.id` leaves its home, retired as merged into it. */
const merged = (
  now: MemoryTree,
  op: ChangeOf<"merge">,
  today: string
): Done => {
  const gone = now.ledger.lessons[op.id];
  const into = now.ledger.lessons[op.into];
  if (!(gone && into?.state === "live") || op.id === op.into) {
    return { tree: now };
  }
  const kept: Lesson = {
    ...into,
    by: into.by === "owner" || gone.by === "owner" ? "owner" : "agent",
    repeats: into.repeats + gone.repeats,
    seen: into.seen > gone.seen ? into.seen : gone.seen,
    since: into.since < gone.since ? into.since : gone.since,
    sources: withSourcesAdded(into.sources, gone.sources),
    ...(into.held || gone.held ? { held: true as const } : {}),
    ...(into.probe || gone.probe ? { probe: into.probe ?? gone.probe } : {}),
  };
  return {
    tree: retireLine(
      { ...now, ledger: withEntry(now.ledger, op.into, kept) },
      op.id,
      "merged",
      today,
      { by: op.into }
    ),
  };
};

/** A lesson put back in its home as `op.line`, live again, its retirement gone. */
const restored = (
  now: MemoryTree,
  op: ChangeOf<"restore">,
  today: string
): Done => {
  const lesson = now.ledger.lessons[op.id];
  if (!lesson || lineOf(now, op.id)) {
    return { tree: now };
  }
  const { retired: _retired, staged: _staged, ...rest } = lesson;
  return placed(now, lesson.home, op.line, {
    ...rest,
    ...(op.source ? { by: "owner" as const } : {}),
    state: "live",
    seen: today,
    sources: withSourcesAdded(rest.sources, op.source ? [op.source] : []),
    ...(op.held || rest.held ? { held: true as const } : {}),
  });
};

/** A lesson stated again: counted, its source kept, his from now on; moved up a home when asked. */
const repeated = (
  now: MemoryTree,
  op: ChangeOf<"repeat">,
  today: string
): Done => {
  const lesson = now.ledger.lessons[op.id];
  if (lesson?.state !== "live") {
    return { tree: now };
  }
  const counted: MemoryTree = {
    ...now,
    ledger: withEntry(now.ledger, op.id, {
      ...lesson,
      by: "owner",
      repeats: lesson.repeats + 1,
      seen: today,
      sources: withSourcesAdded(lesson.sources, [op.source]),
      ...(op.held || lesson.held ? { held: true as const } : {}),
    }),
  };
  const grew = op.up ? pathOf(op.up) : undefined;
  return op.up && grew
    ? { tree: moveLine(counted, op.id, op.up), grew }
    : { tree: counted };
};

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

/** An index or skill lesson moved to the knowledge its eviction would take it to, its `Why:` saying why, tested on the model. */
const demoted = (now: MemoryTree, op: ChangeOf<"demote">): Done => {
  const lesson = now.ledger.lessons[op.id];
  const from = lesson ? pathOf(lesson.home) : undefined;
  const to = from ? evictedTo(from) : undefined;
  const line = lineOf(now, op.id);
  if (!(lesson && from && to && line) || "archive" in to) {
    return { tree: now };
  }
  const into = pathOf(to) ?? "";
  const files = {
    ...now.files,
    [from]: withoutLine(now.files[from] ?? "", op.id),
  };
  files[into] = withLine(into, files[into] ?? "", { ...line, why: op.why });
  return {
    tree: {
      files,
      ledger: withEntry(now.ledger, op.id, {
        ...lesson,
        home: to,
        tested: op.model,
      }),
    },
    grew: into,
  };
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
    case "merge":
      return merged(now, op, today);
    case "retire":
      return { tree: retireLine(now, op.id, op.why, today) };
    case "product":
      return {
        tree: retireLine(now, op.id, "product", today, { task: op.task }),
      };
    case "restore":
      return restored(now, op, today);
    case "repeat":
      return repeated(now, op, today);
    case "revert":
      return {
        tree: entryPatched(retireLine(now, op.id, "reverted", today), op.id, {
          held: true,
        }),
      };
    case "demote":
      return demoted(now, op);
    case "tested":
      return {
        tree: entryPatched(now, op.id, { tested: op.model }),
      };
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
 * one line and one entry, then eviction from any file it took past its cap,
 * then the index's skill pointers. His lines (the index's Notes and his own
 * sections) are never touched.
 */
export const applyOp = (
  tree: MemoryTree,
  checked: CheckedOp,
  today: string,
  uses: ReadonlyMap<string, Date>
): Applied => {
  const done = changed(tree, checked.change, today);
  const evicted = done.grew
    ? evictOver(done.tree, uses, today, done.grew)
    : { tree: done.tree, evicted: [] };
  return {
    tree: withPointers(evicted.tree),
    evicted: evicted.evicted,
    redirected: done.redirected === true,
  };
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
        repeats: 0,
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
