/**
 * A project task as a file (§5.2 of the Projects spec): `tasks/<id>-<slug>.md`
 * in the project's hub folder. Sections from Backlog.md, edges from beads.
 *
 * ```
 * ---
 * stage: draft
 * type: writer
 * after: [138]
 * parent: 120
 * related: [131]
 * found_in: 140
 * duplicate_of: 101
 * checks: ["bun test", "bun run lint"]
 * outputs: [post.md]
 * context: [knowledge/brand.md]
 * lands: pr
 * runs_on: apple
 * group: theme
 * owns: [src/theme/**]
 * budget: {usd: 2, turns: 40, minutes: 30}
 * rank: a0V
 * labels: [ui]
 * accounts: [<account id>]
 * ---
 * # Persist the theme toggle
 *
 * Description.
 *
 * ## Acceptance criteria
 *
 * ## To-dos
 *
 * - [x] [td-1] Token for the toggle
 * - [ ] [td-2] Persist the choice
 *   - [ ] [td-3] Read the stored value on load
 * - [ ] → #152
 * ```
 *
 * - **Ids.** A task's id is `tsk-<n>`, `n` a decimal number one past the
 *   highest the project's folder has ever held (deleted files count, so a
 *   number is never handed out twice). The file is named by it and a slug of
 *   its title at creation: `tasks/tsk-12-persist-the-theme-toggle.md`. The
 *   slug never changes; a later title lives in the file.
 * - **Edges** in the front matter name tasks by number, as the spec writes
 *   them (`after: [138]`); `tsk-138` and `#138` read the same. Everything
 *   else (the API, the tools) says `tsk-138`.
 * - **Checks** are shell commands an attempt's `finish_item` runs in its
 *   workspace. One written `host: <command>` runs outside every boundary,
 *   on a fresh checkout of the attempt's last commit (work-items.ts
 *   `runChecks`): a probe whose scratch fleet delegates, podman. Only an
 *   attempt whose parent runs outside every boundary may have one.
 * - **Title** is the body's first line when it is a `# ` heading; a file
 *   without one is titled by its slug.
 * - **To-dos** are checkbox lines under `## To-dos`, nested by indentation.
 *   One may carry an id marker after its box, `[td-3]`, which a session's
 *   plan item quotes; the hub gives every to-do it adds the next one. A to-do
 *   promoted to a task ends in `→ #152`. A to-do without a marker is named by
 *   its position: `2` is the second top-level one, `2.1` its first child.
 *   One whose words open with `(proposed)` was left open in an attempt's plan
 *   and is offered, not agreed: `- [ ] [td-9] (proposed) Cover the edge case`.
 *
 * Writes change only what they own. A field change rewrites that field's
 * line in the front matter (comments, unknown keys and order elsewhere stay);
 * a section change rewrites that section; a to-do change rewrites that line.
 * Every other byte is the file as it was, so a hand edit survives the next
 * write through the API, and the parser reads whatever a hand wrote.
 */
import {
  type FrontMatterLine,
  frontMatterBlock,
  LANDS_MODES,
  type LandsMode,
  type TaskTodo,
} from "@cawco/core";
import type { WorkBudget } from "./db/schema";

/** The front matter fields a task file knows, in the order a new file writes them. */
export const TASK_FIELDS = [
  "stage",
  "type",
  "after",
  "parent",
  "related",
  "found_in",
  "duplicate_of",
  "checks",
  "outputs",
  "context",
  "lands",
  "runs_on",
  "group",
  "owns",
  "budget",
  "rank",
  "labels",
  "accounts",
] as const;
export type TaskField = (typeof TASK_FIELDS)[number];

/**
 * The edges a task can have to another (beads'). `duplicate_of` names the
 * task this one repeats: linking it drops this one, and a task waiting on it
 * waits on that one's being done instead.
 */
export const EDGES = [
  "after",
  "parent",
  "related",
  "found_in",
  "duplicate_of",
] as const;
export type Edge = (typeof EDGES)[number];
/** The edges that name one task; the others name a list. */
const SINGLE_EDGES: ReadonlySet<Edge> = new Set([
  "parent",
  "found_in",
  "duplicate_of",
]);
export const isSingleEdge = (edge: Edge): boolean => SINGLE_EDGES.has(edge);

export interface TaskFields {
  /** The accounts its attempts may run on (account ids); empty: every account. */
  accounts: string[];
  after: string[];
  /** What an attempt may spend before the hub stops it; null: the project's default. */
  budget: WorkBudget | null;
  checks: string[];
  /** Project folder files its attempt's brief carries (memory.ts `contextFor`): the lead's pick, `knowledge/…`. */
  context: string[];
  /** The task this one repeats (`duplicate_of`); null when none. */
  duplicateOf: string | null;
  foundIn: string | null;
  /** Its attempts' group under their parent: one combined report once all have ended. */
  group: string | null;
  labels: string[];
  /** Where an attempt's work lands (`main`, `branch`, `pr`, `none`); null: the project's default. */
  lands: LandsMode | null;
  outputs: string[];
  /** Globs of the repository's files its attempt owns: no overlapping live item runs beside it. */
  owns: string[];
  parent: string | null;
  rank: string | null;
  related: string[];
  /** Where its attempts run (runs-on.ts): a machine, or a capability like `apple`; null: the project's. */
  runsOn: string | null;
  stage: string | null;
  type: string | null;
}

/** One to-do, flat in file order. */
export type Todo = TaskTodo;

/** A section of the body other than the two a task file owns. */
export interface TaskSection {
  heading: string;
  text: string;
}

/** Who wrote a comment, as its entry's heading says: the hub's actor. */
export interface TaskCommentAuthor {
  /** The session's instance id, or the approved action's; null when none. */
  id: string | null;
  /** The mover they wrote as (`you`, `lead`, `session`, …); null when the heading names none it knows. */
  mover: string | null;
  /** The commit author's name: you, Caw, the session's title. */
  name: string;
}

/** One entry of a task's `## Comments`, written only by the hub (tasks.ts `comment`). */
export interface TaskComment {
  /** When it was written, ms epoch. */
  at: number;
  author: TaskCommentAuthor;
  /** Its markdown, as written. */
  text: string;
}

/** A front matter value a task file does not know: one scalar, or a list. */
export type ExtraValue = string | string[];

export interface ParsedTask {
  /** The `## Acceptance criteria` section's text; empty when there is none. */
  acceptance: string;
  /** The `## Comments` section's entries, oldest first. */
  comments: TaskComment[];
  /** The text between the title and the first `## ` section. */
  description: string;
  /** Front matter fields this file carries that a task file does not know, with their values; kept as written. */
  extra: Record<string, ExtraValue>;
  fields: TaskFields;
  /** What in the file could not be read, one sentence each. */
  problems: string[];
  sections: TaskSection[];
  /** The `# ` heading the body opens with, if any. */
  title: string | null;
  todos: Todo[];
}

/** A task file's name: `tsk-12-some-slug.md`. */
const FILE_NAME = /^tsk-(\d{1,9})(?:-[^/]*)?\.md$/;
/** A task named by an API caller or a file: `tsk-12`, `#12` or `12`. */
const TASK_REF = /^(?:tsk-|#)?(\d{1,9})$/i;
const TODO_ID = /^td-(\d{1,6})$/;
const TODO_PATH = /^\d{1,4}(?:\.\d{1,4})*$/;
const TODO_LINE = /^([ \t]*)([-*+]) \[( |x|X)\](?: (.*))?$/;
const TODO_MARKER = /^\[(td-\d{1,6})\]\s*/;
const PROMOTED = /(?:^|\s)(?:→|->)\s*#(\d{1,9})\s*$/;
const PROPOSED = /^\(proposed\)\s*/i;
const BUDGET_ENTRY =
  /^\s*(usd|turns|minutes)\s*:\s*\$?([0-9]+(?:\.[0-9]+)?)\s*$/;
const SECTION = /^##\s+(.*?)(?:\s+#+)?\s*$/;
const SPACES = /\s+/g;
const TITLE = /^#\s+(.*?)(?:\s+#+)?\s*$/;
const FENCE = /^\s*(```|~~~)/;
const SEQUENCE_ITEM = /^\s*-\s+(.*)$/;
const BARE_SCALAR = /^[A-Za-z0-9_][A-Za-z0-9_ ./@+-]*$/;
const BARE_ITEM = /^[A-Za-z0-9_][A-Za-z0-9_./@+-]*$/;
const YAML_WORDS = /^(?:true|false|null|yes|no|on|off|~)$/i;
const SLUG_UNSAFE = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const CR = /\r$/;
const NOT_LETTERS = /[^a-z]/g;
const SPACE = /\s/;
const BOX = /\[( |x|X)\]/;
const MD_EXTENSION = /\.md$/;
const ID_PREFIX = /^tsk-\d+-?/;

/** The longest slug a file name takes. */
const SLUG_LIMIT = 48;

// --- ids --------------------------------------------------------------------

export const taskId = (number: number): string => `tsk-${number}`;

/** The number a task reference names, or undefined when it names none. */
export const taskNumber = (ref: string): number | undefined => {
  const found = TASK_REF.exec(ref.trim());
  return found ? Number(found[1]) : undefined;
};

/** A task reference as `tsk-12`, or undefined when it is not one. */
export const normaliseTaskRef = (ref: string): string | undefined => {
  const number = taskNumber(ref);
  return number === undefined ? undefined : taskId(number);
};

/** The number in a task file's name (`tasks/tsk-12-x.md` → 12), or undefined for any other file. */
export const fileTaskNumber = (path: string): number | undefined => {
  const found = FILE_NAME.exec(path.split("/").at(-1) ?? "");
  return found ? Number(found[1]) : undefined;
};

/** A title as a file name's slug: lowercase words joined by `-`, cut at a word. */
export const slugOf = (title: string): string => {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(SLUG_UNSAFE, "-")
    .replace(EDGE_DASHES, "");
  if (slug.length <= SLUG_LIMIT) {
    return slug;
  }
  const cut = slug.slice(0, SLUG_LIMIT);
  const lastDash = cut.lastIndexOf("-");
  return lastDash > 8 ? cut.slice(0, lastDash) : cut;
};

/** Where archived task files go: off every list and board, out of every edge's way, kept with their history. */
export const ARCHIVE_DIR = "tasks/archive";

/** A task file's place in the archive: its own name under {@link ARCHIVE_DIR}. */
export const archivePath = (path: string): string =>
  `${ARCHIVE_DIR}/${path.split("/").at(-1) ?? path}`;

export const taskPath = (number: number, title: string): string => {
  const slug = slugOf(title);
  return `tasks/${taskId(number)}${slug ? `-${slug}` : ""}.md`;
};

/** A title from a file name, for a file whose body has no `# ` heading. */
const titleFromPath = (path: string): string => {
  const name = (path.split("/").at(-1) ?? path).replace(MD_EXTENSION, "");
  const words = name.replace(ID_PREFIX, "").replaceAll("-", " ");
  return words ? words[0].toUpperCase() + words.slice(1) : name;
};

// --- front matter values -------------------------------------------------------

/** A value with its trailing `# comment` dropped (a `#` inside quotes is text). */
const withoutComment = (value: string): string => {
  let quote: string | undefined;
  for (let at = 0; at < value.length; at += 1) {
    const char = value[at];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#" && (at === 0 || SPACE.test(value[at - 1]))) {
      return value.slice(0, at).trim();
    }
  }
  return value.trim();
};

/** One YAML scalar's text: quotes taken off (a double-quoted one read as JSON when it can be). */
const unquoted = (value: string): string => {
  const text = value.trim();
  if (text.length >= 2 && text[0] === '"' && text.at(-1) === '"') {
    try {
      return String(JSON.parse(text));
    } catch {
      return text.slice(1, -1);
    }
  }
  if (text.length >= 2 && text[0] === "'" && text.at(-1) === "'") {
    return text.slice(1, -1).replaceAll("''", "'");
  }
  return text;
};

/** A flow sequence's items, split at the commas outside quotes. */
const flowItems = (inner: string): string[] => {
  const items: string[] = [];
  let quote: string | undefined;
  let start = 0;
  for (let at = 0; at < inner.length; at += 1) {
    const char = inner[at];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ",") {
      items.push(inner.slice(start, at));
      start = at + 1;
    }
  }
  items.push(inner.slice(start));
  return items.map(unquoted).filter((item) => item !== "");
};

/** One field's scalar, its comment and quotes taken off; null when it is empty. */
export const scalarOf = (line: FrontMatterLine): string | null => {
  const value = unquoted(withoutComment(line.value));
  return value === "" ? null : value;
};

/** `[a, b]`, a block sequence under the key, or one bare value as a list of one. */
export const listOf = (line: FrontMatterLine): string[] | undefined => {
  const value = withoutComment(line.value);
  if (value.startsWith("[")) {
    return value.endsWith("]") ? flowItems(value.slice(1, -1)) : undefined;
  }
  if (value === "") {
    return line.under
      .map((under) => SEQUENCE_ITEM.exec(under)?.[1])
      .filter((item): item is string => item !== undefined)
      .map((item) => unquoted(withoutComment(item)))
      .filter((item) => item !== "");
  }
  return [unquoted(value)];
};

/** A scalar as front matter writes it: bare when YAML would read it back as the same string. */
const renderScalar = (value: string): string =>
  BARE_SCALAR.test(value) && !value.endsWith(" ") && !YAML_WORDS.test(value)
    ? value
    : JSON.stringify(value);

const renderItem = (value: string): string =>
  BARE_ITEM.test(value) && !YAML_WORDS.test(value)
    ? value
    : JSON.stringify(value);

/** An edge's target as the file writes it: the bare number. */
const renderEdge = (ref: string): string =>
  String(taskNumber(ref) ?? renderItem(ref));

const FIELD_KEYS = {
  stage: "stage",
  type: "type",
  after: "after",
  parent: "parent",
  related: "related",
  found_in: "foundIn",
  duplicate_of: "duplicateOf",
  checks: "checks",
  outputs: "outputs",
  context: "context",
  lands: "lands",
  runs_on: "runsOn",
  group: "group",
  owns: "owns",
  budget: "budget",
  rank: "rank",
  labels: "labels",
  accounts: "accounts",
} as const satisfies Record<TaskField, keyof TaskFields>;

/** A front matter field's value, as {@link TaskFields} holds it. */
export type TaskFieldValue<F extends TaskField> =
  TaskFields[(typeof FIELD_KEYS)[F]];

const EDGE_FIELDS: ReadonlySet<TaskField> = new Set(EDGES);

/** A field's value as its line writes it, or undefined when the field should not be written. */
const renderField = (
  field: TaskField,
  value: TaskFields[keyof TaskFields]
): string | undefined => {
  if (value === null || (Array.isArray(value) && value.length === 0)) {
    return;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return renderBudget(value);
  }
  const edge = EDGE_FIELDS.has(field);
  if (Array.isArray(value)) {
    return `[${value.map(edge ? renderEdge : renderItem).join(", ")}]`;
  }
  return edge ? renderEdge(value) : renderScalar(value);
};

/** A budget as front matter writes it: `{usd: 2, turns: 40, minutes: 30}`; nothing when it is empty. */
const renderBudget = (budget: WorkBudget): string | undefined => {
  const parts = (["usd", "turns", "minutes"] as const)
    .filter((key) => budget[key] !== undefined)
    .map((key) => `${key}: ${budget[key]}`);
  return parts.length > 0 ? `{${parts.join(", ")}}` : undefined;
};

const emptyFields = (): TaskFields => ({
  stage: null,
  type: null,
  after: [],
  parent: null,
  related: [],
  foundIn: null,
  duplicateOf: null,
  checks: [],
  outputs: [],
  context: [],
  lands: null,
  runsOn: null,
  group: null,
  owns: [],
  budget: null,
  rank: null,
  labels: [],
  accounts: [],
});

/** A list of task ids (`after`, `related`); what is not one goes to `problems`. */
const readEdgeList = (
  field: string,
  line: FrontMatterLine,
  problems: string[]
): string[] => {
  const items = listOf(line);
  if (!items) {
    problems.push(`${field}: is not a list like [138, 140].`);
    return [];
  }
  const refs: string[] = [];
  for (const item of items) {
    const ref = normaliseTaskRef(item);
    if (ref) {
      refs.push(ref);
    } else {
      problems.push(`${field}: “${item}” is not a task id like 138.`);
    }
  }
  return [...new Set(refs)];
};

/** One task id (`parent`, `found_in`, `duplicate_of`); what is not one goes to `problems`. */
const readEdge = (
  field: string,
  line: FrontMatterLine,
  problems: string[]
): string | null => {
  const value = scalarOf(line);
  const ref = value === null ? undefined : normaliseTaskRef(value);
  if (value !== null && !ref) {
    problems.push(`${field}: “${value}” is not a task id like 120.`);
  }
  return ref ?? null;
};

const readList = (
  field: string,
  line: FrontMatterLine,
  problems: string[]
): string[] => {
  const items = listOf(line);
  if (!items) {
    problems.push(`${field}: is not a list like [a, b].`);
  }
  return items ?? [];
};

const LANDS: ReadonlySet<string> = new Set(LANDS_MODES);

/** `lands:` — one of the modes; anything else goes to `problems`. */
const readLands = (
  line: FrontMatterLine,
  problems: string[]
): LandsMode | null => {
  const value = scalarOf(line);
  if (value === null) {
    return null;
  }
  if (LANDS.has(value)) {
    return value as LandsMode;
  }
  problems.push(`lands: “${value}” is not one of ${LANDS_MODES.join(", ")}.`);
  return null;
};

/**
 * `budget:` — `{usd: 2, turns: 40, minutes: 30}`, or the same keys one per
 * line under it. Dollars are a positive number; turns and minutes whole
 * numbers from 1. What does not read goes to `problems`.
 */
const readBudget = (
  line: FrontMatterLine,
  problems: string[]
): WorkBudget | null => {
  const value = withoutComment(line.value);
  let entries: string[];
  if (value === "") {
    entries = line.under.map((under) => withoutComment(under)).filter(Boolean);
  } else if (value.startsWith("{") && value.endsWith("}")) {
    entries = value
      .slice(1, -1)
      .split(",")
      .filter((entry) => entry.trim());
  } else {
    problems.push(
      `budget: “${value}” is not a budget like {usd: 2, turns: 40, minutes: 30}.`
    );
    return null;
  }
  const budget: WorkBudget = {};
  for (const entry of entries) {
    const found = BUDGET_ENTRY.exec(entry);
    const amount = Number(found?.[2]);
    const key = found?.[1] as keyof WorkBudget | undefined;
    if (!key || amount <= 0 || (key !== "usd" && !Number.isInteger(amount))) {
      problems.push(
        `budget: “${entry.trim()}” is not one of usd (dollars), turns or minutes (whole numbers) with a value above 0.`
      );
      continue;
    }
    budget[key] = amount;
  }
  return Object.keys(budget).length > 0 ? budget : null;
};

const LIST_FIELDS: ReadonlySet<string> = new Set([
  "checks",
  "outputs",
  "context",
  "owns",
  "labels",
  "accounts",
]);
const SCALAR_FIELDS: ReadonlySet<string> = new Set([
  "stage",
  "type",
  "group",
  "rank",
]);

/** Reads one known field into `fields`; false for a key a task file does not know. */
const readField = (
  fields: TaskFields,
  field: string,
  line: FrontMatterLine,
  problems: string[]
): boolean => {
  if (field === "after" || field === "related") {
    fields[field] = readEdgeList(field, line, problems);
  } else if (field === "parent") {
    fields.parent = readEdge(field, line, problems);
  } else if (field === "found_in") {
    fields.foundIn = readEdge(field, line, problems);
  } else if (field === "duplicate_of") {
    fields.duplicateOf = readEdge(field, line, problems);
  } else if (LIST_FIELDS.has(field)) {
    fields[
      field as "checks" | "outputs" | "context" | "owns" | "labels" | "accounts"
    ] = readList(field, line, problems);
  } else if (SCALAR_FIELDS.has(field)) {
    fields[field as "stage" | "type" | "group" | "rank"] = scalarOf(line);
  } else if (field === "budget") {
    fields.budget = readBudget(line, problems);
  } else if (field === "lands") {
    fields.lands = readLands(line, problems);
  } else if (field === "runs_on") {
    fields.runsOn = scalarOf(line);
  } else {
    return false;
  }
  return true;
};

/** A field a task file does not know, as its value reads: a list when written as one, else its scalar. */
const extraOf = (line: FrontMatterLine): ExtraValue => {
  const value = withoutComment(line.value);
  if (value.startsWith("[") || (value === "" && line.under.length > 0)) {
    return listOf(line) ?? [];
  }
  return scalarOf(line) ?? "";
};

/** Reads the known fields of a front matter block; what it cannot read goes to `problems`. */
const readFields = (
  lines: FrontMatterLine[],
  problems: string[]
): { fields: TaskFields; extra: Record<string, ExtraValue> } => {
  const fields = emptyFields();
  const extra: Record<string, ExtraValue> = {};
  for (const line of lines) {
    const field = line.key;
    if (field !== undefined && !readField(fields, field, line, problems)) {
      extra[field] = extraOf(line);
    }
  }
  return { fields, extra };
};

/** A front matter key a task file may carry beyond its own: what YAML reads bare. */
export const EXTRA_KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

// --- the body ------------------------------------------------------------------

interface BodySection {
  /** Where its heading line is, in the body's lines. */
  at: number;
  /** One past its last line. */
  end: number;
  heading: string;
}

/** What a section heading is called, for matching: lowercase letters only. */
const sectionName = (heading: string): string =>
  heading.toLowerCase().replace(NOT_LETTERS, "");
const isAcceptance = (heading: string): boolean =>
  sectionName(heading).startsWith("acceptance");
const isTodos = (heading: string): boolean =>
  ["todos", "todo"].includes(sectionName(heading));
const isComments = (heading: string): boolean =>
  sectionName(heading) === "comments";

/** A comment entry's heading: `### <name> · <mover>[ · <id>] · <ISO time>`. */
const COMMENT_HEADING = /^###\s+(.+)$/;
const COMMENT_SEPARATOR = " · ";
const MIDDLE_DOT = /·/g;
const COMMENT_MOVERS: ReadonlySet<string> = new Set([
  "you",
  "lead",
  "session",
  "action",
  "routine",
  "hub",
]);

/** A comment heading's author and time; undefined when it is not one the hub wrote. */
const commentHeading = (
  heading: string
): Pick<TaskComment, "at" | "author"> | undefined => {
  const parts = heading.split(COMMENT_SEPARATOR).map((part) => part.trim());
  const at = Date.parse(parts.at(-1) ?? "");
  if (parts.length < 3 || Number.isNaN(at)) {
    return;
  }
  const mover = parts[1] ?? "";
  return {
    at,
    author: {
      name: parts[0] ?? "",
      mover: COMMENT_MOVERS.has(mover) ? mover : null,
      id: parts.length > 3 ? (parts[2] ?? null) : null,
    },
  };
};

/** The entries of a `## Comments` section, oldest first, skipping anything inside a code fence. */
const commentsOf = (
  lines: string[],
  section: BodySection | undefined
): TaskComment[] => {
  const comments: TaskComment[] = [];
  if (!section) {
    return comments;
  }
  let open:
    { head: Pick<TaskComment, "at" | "author">; lines: string[] } | undefined;
  const close = () => {
    if (open) {
      comments.push({ ...open.head, text: textOf(open.lines) });
    }
  };
  let fenced = false;
  for (let at = section.at + 1; at < section.end; at += 1) {
    const raw = (lines[at] ?? "").replace(CR, "");
    if (FENCE.test(raw)) {
      fenced = !fenced;
    }
    const heading = fenced ? undefined : COMMENT_HEADING.exec(raw)?.[1];
    const head = heading === undefined ? undefined : commentHeading(heading);
    if (head) {
      close();
      open = { head, lines: [] };
    } else {
      open?.lines.push(raw);
    }
  }
  close();
  return comments;
};

/** The body's `## ` sections, skipping anything inside a code fence. */
const sectionsOf = (lines: string[]): BodySection[] => {
  const sections: BodySection[] = [];
  let fenced = false;
  for (const [at, line] of lines.entries()) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    const heading = fenced ? undefined : SECTION.exec(line.replace(CR, ""));
    if (heading) {
      const last = sections.at(-1);
      if (last) {
        last.end = at;
      }
      sections.push({ at, end: lines.length, heading: heading[1] });
    }
  }
  return sections;
};

/** Lines as a block of text: blank lines at either end dropped. */
const textOf = (lines: string[]): string =>
  lines
    .map((line) => line.replace(CR, ""))
    .join("\n")
    .trim();

/** Where the title line is in the preamble, or -1. */
const titleLine = (lines: string[], end: number): number => {
  for (let at = 0; at < end; at += 1) {
    if (lines[at].trim() === "") {
      continue;
    }
    return TITLE.test(lines[at].replace(CR, "")) ? at : -1;
  }
  return -1;
};

const indentWidth = (indent: string): number =>
  [...indent].reduce((width, char) => width + (char === "\t" ? 4 : 1), 0);

interface TodoLine extends Todo {
  indent: number;
  /** Its line in the body. */
  line: number;
}

/** A to-do line's words after its box: its marker, `(proposed)`, text and promoted link. */
const todoWords = (
  words: string
): Pick<Todo, "id" | "promoted" | "proposed" | "text"> => {
  let text = words;
  const marker = TODO_MARKER.exec(text);
  if (marker) {
    text = text.slice(marker[0].length);
  }
  const promoted = PROMOTED.exec(text);
  if (promoted) {
    text = text.slice(0, promoted.index).trimEnd();
  }
  const proposed = PROPOSED.exec(text);
  if (proposed) {
    text = text.slice(proposed[0].length);
  }
  return {
    id: marker?.[1] ?? null,
    proposed: proposed !== null,
    text: text.trim(),
    promoted: promoted ? taskId(Number(promoted[1])) : null,
  };
};

/** The checkbox lines of a section, as a tree read off their indentation. */
const todosOf = (lines: string[], section: BodySection | undefined) => {
  const todos: TodoLine[] = [];
  if (!section) {
    return todos;
  }
  const stack: { indent: number; children: number; path: string }[] = [];
  let topLevel = 0;
  let fenced = false;
  for (let line = section.at + 1; line < section.end; line += 1) {
    const raw = lines[line].replace(CR, "");
    if (FENCE.test(raw)) {
      fenced = !fenced;
    }
    const box = fenced ? undefined : TODO_LINE.exec(raw);
    if (!box) {
      continue;
    }
    const indent = indentWidth(box[1]);
    while (stack.length > 0 && (stack.at(-1)?.indent ?? 0) >= indent) {
      stack.pop();
    }
    const parent = stack.at(-1);
    let path: string;
    if (parent) {
      parent.children += 1;
      path = `${parent.path}.${parent.children}`;
    } else {
      topLevel += 1;
      path = String(topLevel);
    }
    todos.push({
      ...todoWords(box[4] ?? ""),
      path,
      done: box[3] !== " ",
      depth: stack.length,
      indent,
      line,
    });
    stack.push({ indent, children: 0, path });
  }
  return todos;
};

// --- the document --------------------------------------------------------------

/**
 * A task file held for reading and for changing in place. `read()` answers
 * what it says; the setters change only their own lines; `toString()` is the
 * file, byte for byte as read wherever nothing was set.
 */
export class TaskDoc {
  /** The front matter's lines, or undefined while the file has none. */
  private front: FrontMatterLine[] | undefined;
  private readonly body: string[];
  readonly path: string;

  constructor(path: string, content: string) {
    this.path = path;
    const block = frontMatterBlock(content);
    this.front = block?.lines;
    this.body = (block ? block.body : content).split("\n");
  }

  /** A new task's file: its fields, title and sections, the two owned sections always present. */
  static create(
    path: string,
    input: {
      acceptance?: string;
      description?: string;
      fields: Partial<TaskFields>;
      title: string;
      todos?: string[];
    }
  ): TaskDoc {
    const fields = { ...emptyFields(), ...input.fields };
    const front = TASK_FIELDS.flatMap((field) => {
      const value = renderField(field, fields[FIELD_KEYS[field]]);
      return value === undefined ? [] : [`${field}: ${value}`];
    });
    const description = input.description?.trim();
    const acceptance = input.acceptance?.trim();
    const todos = (input.todos ?? []).map(
      (text, index) => `- [ ] [td-${index + 1}] ${text}`
    );
    const lines = [
      "---",
      ...front,
      "---",
      `# ${input.title}`,
      "",
      ...(description ? [description, ""] : []),
      "## Acceptance criteria",
      "",
      ...(acceptance ? [acceptance, ""] : []),
      "## To-dos",
      "",
      ...(todos.length > 0 ? [...todos, ""] : []),
    ];
    return new TaskDoc(path, lines.join("\n"));
  }

  read(): ParsedTask {
    const problems: string[] = [];
    if (!this.front) {
      problems.push("The file has no front matter (a --- block on top).");
    }
    const { fields, extra } = readFields(this.front ?? [], problems);
    if (this.front && !fields.stage) {
      problems.push("The front matter names no stage.");
    }
    const sections = sectionsOf(this.body);
    const preambleEnd = sections[0]?.at ?? this.body.length;
    const title = titleLine(this.body, preambleEnd);
    const description = textOf(this.body.slice(title + 1, preambleEnd));
    const acceptance = sections.find((section) =>
      isAcceptance(section.heading)
    );
    return {
      fields,
      extra,
      title:
        title === -1
          ? null
          : (TITLE.exec(this.body[title].replace(CR, ""))?.[1] ?? null),
      description,
      acceptance: acceptance
        ? textOf(this.body.slice(acceptance.at + 1, acceptance.end))
        : "",
      todos: this.todoLines().map(
        ({ indent: _indent, line: _line, ...todo }) => todo
      ),
      comments: commentsOf(
        this.body,
        sections.find((section) => isComments(section.heading))
      ),
      sections: sections
        .filter(
          (section) =>
            !(
              isAcceptance(section.heading) ||
              isTodos(section.heading) ||
              isComments(section.heading)
            )
        )
        .map((section) => ({
          heading: section.heading,
          text: textOf(this.body.slice(section.at + 1, section.end)),
        })),
      problems,
    };
  }

  /** The title the file gives, else one from its name. */
  title(): string {
    return this.read().title ?? titleFromPath(this.path);
  }

  /** The front matter fields a task file does not know, each as its one scalar; a field written as a list or block is left out. */
  extraFields(): Record<string, string> {
    const known = new Set<string>(TASK_FIELDS);
    const fields: Record<string, string> = {};
    for (const line of this.front ?? []) {
      if (line.key === undefined || known.has(line.key) || line.under.length) {
        continue;
      }
      const value = scalarOf(line);
      if (value !== null && !value.startsWith("[") && !value.startsWith("{")) {
        fields[line.key] = value;
      }
    }
    return fields;
  }

  toString(): string {
    const body = this.body.join("\n");
    if (!this.front) {
      return body;
    }
    const front = this.front.flatMap((line) => [line.raw, ...line.under]);
    return ["---", ...front, "---", body].join("\n");
  }

  // --- front matter ---

  /** Sets one field: its line rewritten in place, added after the known fields, or removed when empty. */
  setField<F extends TaskField>(field: F, value: TaskFieldValue<F>): void {
    const rendered = renderField(field, value);
    const lines = this.front ?? [];
    this.front = lines;
    const at = lines.findIndex((each) => each.key === field);
    if (rendered === undefined) {
      if (at !== -1) {
        lines.splice(at, 1);
      }
      return;
    }
    const written: FrontMatterLine = {
      key: field,
      value: rendered,
      raw: `${field}: ${rendered}`,
      under: [],
    };
    if (at !== -1) {
      lines[at] = written;
      return;
    }
    // After the last known field that comes before it in the canonical order.
    const order = TASK_FIELDS.indexOf(field);
    let after = -1;
    for (const [index, other] of lines.entries()) {
      const rank = TASK_FIELDS.indexOf(other.key as TaskField);
      if (rank !== -1 && rank < order) {
        after = index;
      }
    }
    lines.splice(after + 1, 0, written);
  }

  /**
   * Sets one field a task file does not know (`priority`, `due`): its line
   * rewritten in place, added at the end of the front matter, or removed
   * when the value is empty. A list is written `[a, b]`.
   */
  setExtra(key: string, value: ExtraValue): void {
    const lines = this.front ?? [];
    this.front = lines;
    const at = lines.findIndex((each) => each.key === key);
    const empty = Array.isArray(value) ? value.length === 0 : value === "";
    if (empty) {
      if (at !== -1) {
        lines.splice(at, 1);
      }
      return;
    }
    const rendered = Array.isArray(value)
      ? `[${value.map(renderItem).join(", ")}]`
      : renderScalar(value);
    const written: FrontMatterLine = {
      key,
      value: rendered,
      raw: `${key}: ${rendered}`,
      under: [],
    };
    if (at === -1) {
      lines.push(written);
    } else {
      lines[at] = written;
    }
  }

  // --- body ---

  setTitle(title: string): void {
    const sections = sectionsOf(this.body);
    const at = titleLine(this.body, sections[0]?.at ?? this.body.length);
    if (at === -1) {
      this.body.splice(0, 0, `# ${title}`, "");
    } else {
      this.body[at] = `# ${title}`;
    }
  }

  setDescription(text: string): void {
    const sections = sectionsOf(this.body);
    const end = sections[0]?.at ?? this.body.length;
    const title = titleLine(this.body, end);
    const start = title === -1 ? 0 : title + 1;
    const trimmed = text.trim();
    const lines =
      title === -1
        ? [...(trimmed ? [trimmed, ""] : [])]
        : ["", ...(trimmed ? [trimmed, ""] : [])];
    this.body.splice(start, end - start, ...lines);
  }

  setAcceptance(text: string): void {
    this.setSection(isAcceptance, "Acceptance criteria", text, true);
  }

  /** Replaces a section's text, or adds the section (the acceptance criteria before the to-dos). */
  private setSection(
    matches: (heading: string) => boolean,
    heading: string,
    text: string,
    beforeTodos: boolean
  ): void {
    const sections = sectionsOf(this.body);
    const trimmed = text.trim();
    const lines = ["", ...(trimmed ? [trimmed, ""] : [])];
    const section = sections.find((each) => matches(each.heading));
    if (section) {
      this.body.splice(section.at + 1, section.end - section.at - 1, ...lines);
      return;
    }
    const todos = beforeTodos
      ? sections.find((each) => isTodos(each.heading))
      : undefined;
    const at = todos ? todos.at : this.body.length;
    if (!todos) {
      this.endWithBlank();
    }
    this.body.splice(
      todos ? at : this.body.length,
      0,
      `## ${heading}`,
      ...lines
    );
  }

  /**
   * Adds one line to the `## Notes` section, making the section at the end
   * when there is none: what the hub says about the task (tasks.ts).
   */
  addNote(text: string): void {
    const line = `- ${text.replace(SPACES, " ").trim()}`;
    const section = sectionsOf(this.body).find(
      (each) => each.heading.trim().toLowerCase() === "notes"
    );
    if (!section) {
      this.endWithBlank();
      this.body.push("## Notes", "", line, "");
      return;
    }
    let at = section.end;
    while (at > section.at + 1 && this.body[at - 1]?.trim() === "") {
      at -= 1;
    }
    this.body.splice(at, 0, line);
  }

  /**
   * Adds one entry to the `## Comments` section, making the section at the
   * end when there is none: a `### <name> · <mover>[ · <id>] · <time>`
   * heading and the text under it. Only the hub writes one (tasks.ts
   * `comment`); entries are never changed or taken out.
   */
  addComment(author: TaskCommentAuthor, at: Date, text: string): void {
    const name = author.name.replace(MIDDLE_DOT, "-").replace(SPACES, " ");
    const heading = `### ${[
      name.trim() || "someone",
      author.mover ?? "someone",
      ...(author.id ? [author.id] : []),
      at.toISOString(),
    ].join(COMMENT_SEPARATOR)}`;
    const entry = [heading, "", text.trim(), ""];
    const section = sectionsOf(this.body).find((each) =>
      isComments(each.heading)
    );
    if (!section) {
      this.endWithBlank();
      this.body.push("## Comments", "", ...entry);
      return;
    }
    let { end } = section;
    while (end > section.at + 1 && this.body[end - 1]?.trim() === "") {
      end -= 1;
    }
    this.body.splice(end, 0, "", ...entry.slice(0, -1));
  }

  /** The `## Comments` section's lines, its heading first and its trailing blank lines left off; undefined when there is none. */
  commentsSection(): string[] | undefined {
    const section = sectionsOf(this.body).find((each) =>
      isComments(each.heading)
    );
    if (!section) {
      return;
    }
    const lines = this.body.slice(section.at, section.end);
    while (lines.length > 1 && lines.at(-1)?.trim() === "") {
      lines.pop();
    }
    return lines;
  }

  /**
   * Puts `lines` (a `## Comments` section, as {@link commentsSection} reads
   * one) in place of this file's section, or at the end when it has none;
   * undefined takes the section out. The hub's own record of the comments
   * put back over an edit made around it (tasks.ts `settle`).
   */
  setCommentsSection(lines: string[] | undefined): void {
    const section = sectionsOf(this.body).find((each) =>
      isComments(each.heading)
    );
    const block = lines ? [...lines, ""] : [];
    if (section) {
      this.body.splice(section.at, section.end - section.at, ...block);
    } else if (lines) {
      this.endWithBlank();
      this.body.push(...block);
    }
  }

  /** Makes the body end in one blank line before something is appended. */
  private endWithBlank(): void {
    while (this.body.length > 1 && this.body.at(-1)?.trim() === "") {
      this.body.pop();
    }
    if (this.body.length > 0 && this.body.at(-1)?.trim() !== "") {
      this.body.push("");
    }
  }

  // --- to-dos ---

  private todoLines(): TodoLine[] {
    return todosOf(
      this.body,
      sectionsOf(this.body).find((section) => isTodos(section.heading))
    );
  }

  /** A to-do by its id (`td-3`) or position (`2.1`), or a refusal sentence. */
  findTodo(ref: string): Todo | string {
    const found = this.findTodoLine(ref);
    if (typeof found === "string") {
      return found;
    }
    const { indent: _indent, line: _line, ...todo } = found;
    return todo;
  }

  /** The task's id from its file name, for sentences. */
  private name(): string {
    const number = fileTaskNumber(this.path);
    return number === undefined ? this.path : taskId(number);
  }

  private findTodoLine(ref: string): TodoLine | string {
    const name = ref.trim();
    const todos = this.todoLines();
    if (TODO_ID.test(name)) {
      return (
        todos.find((todo) => todo.id === name) ??
        `${this.name()} has no to-do ${name}.`
      );
    }
    if (TODO_PATH.test(name)) {
      return (
        todos.find((todo) => todo.path === name) ??
        `${this.name()} has no to-do at position ${name}.`
      );
    }
    return `“${name}” names no to-do: use its id, like td-3, or its position, like 2.1.`;
  }

  /** Ticks or unticks a to-do; answers a refusal sentence, or undefined when done. */
  tickTodo(ref: string, done: boolean): string | undefined {
    const todo = this.findTodoLine(ref);
    if (typeof todo === "string") {
      return todo;
    }
    this.body[todo.line] = this.body[todo.line].replace(
      BOX,
      done ? "[x]" : "[ ]"
    );
  }

  /** Rewords a to-do, keeping its box, marker and promoted link. */
  editTodo(ref: string, text: string): string | undefined {
    const todo = this.findTodoLine(ref);
    if (typeof todo === "string") {
      return todo;
    }
    const box = TODO_LINE.exec(this.body[todo.line].replace(CR, ""));
    const indent = box?.[1] ?? "";
    const bullet = box?.[2] ?? "-";
    const promoted = todo.promoted
      ? ` → #${taskNumber(todo.promoted) ?? ""}`
      : "";
    this.body[todo.line] =
      `${indent}${bullet} [${todo.done ? "x" : " "}] ${todo.id ? `[${todo.id}] ` : ""}${text}${promoted}`;
  }

  /**
   * Adds an open to-do with the task's next marker: after `under`'s last
   * descendant, one level in, or at the end of the list. Answers the new
   * to-do's id, or a refusal sentence.
   */
  addTodo(
    text: string,
    under?: string,
    proposed = false
  ): { id: string } | string {
    const todos = this.todoLines();
    const next =
      Math.max(
        0,
        ...todos.map((todo) => Number(TODO_ID.exec(todo.id ?? "")?.[1] ?? 0))
      ) + 1;
    const id = `td-${next}`;
    let indent = todos[0] ? " ".repeat(todos[0].indent) : "";
    let at: number;
    if (under === undefined) {
      const last = todos.at(-1);
      if (last) {
        at = last.line + 1;
      } else {
        at = this.todoSectionEnd();
      }
    } else {
      const parent = this.findTodoLine(under);
      if (typeof parent === "string") {
        return parent;
      }
      const index = todos.findIndex((todo) => todo.line === parent.line);
      let last = parent;
      for (const todo of todos.slice(index + 1)) {
        if (todo.indent <= parent.indent) {
          break;
        }
        last = todo;
      }
      at = last.line + 1;
      const child = todos[index + 1];
      const step =
        child && child.indent > parent.indent
          ? child.indent - parent.indent
          : 2;
      indent = " ".repeat(parent.indent + step);
    }
    this.body.splice(
      at,
      0,
      `${indent}- [ ] [${id}] ${proposed ? "(proposed) " : ""}${text}`
    );
    return { id };
  }

  /** Where the first to-do of an empty `## To-dos` goes, making the section when there is none. */
  private todoSectionEnd(): number {
    const section = sectionsOf(this.body).find((each) => isTodos(each.heading));
    if (!section) {
      this.endWithBlank();
      this.body.push("## To-dos", "", "");
      return this.body.length - 1;
    }
    let at = section.end;
    while (at > section.at + 1 && this.body[at - 1].trim() === "") {
      at -= 1;
    }
    if (at === section.at + 1) {
      // An empty section: a blank line under the heading, the list, one blank.
      this.body.splice(at, section.end - at, "", "");
      return at + 1;
    }
    return at;
  }
}
