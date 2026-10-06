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
 * checks: ["bun test", "bun run lint"]
 * outputs: [post.md]
 * lands: pr
 * rank: a0V
 * labels: [ui]
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
 * - **Title** is the body's first line when it is a `# ` heading; a file
 *   without one is titled by its slug.
 * - **To-dos** are checkbox lines under `## To-dos`, nested by indentation.
 *   One may carry an id marker after its box, `[td-3]`, which a session's
 *   plan item quotes; the hub gives every to-do it adds the next one. A to-do
 *   promoted to a task ends in `→ #152`. A to-do without a marker is named by
 *   its position: `2` is the second top-level one, `2.1` its first child.
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
} from "@cawco/core";

/** The front matter fields a task file knows, in the order a new file writes them. */
export const TASK_FIELDS = [
  "stage",
  "type",
  "after",
  "parent",
  "related",
  "found_in",
  "checks",
  "outputs",
  "lands",
  "rank",
  "labels",
] as const;
export type TaskField = (typeof TASK_FIELDS)[number];

/** The four edges a task can have to another (beads'). */
export const EDGES = ["after", "parent", "related", "found_in"] as const;
export type Edge = (typeof EDGES)[number];
/** The edges that name one task; the others name a list. */
const SINGLE_EDGES: ReadonlySet<Edge> = new Set(["parent", "found_in"]);
export const isSingleEdge = (edge: Edge): boolean => SINGLE_EDGES.has(edge);

export interface TaskFields {
  after: string[];
  checks: string[];
  foundIn: string | null;
  labels: string[];
  /** Where an attempt's work lands (`main`, `branch`, `pr`, `none`); null: the project's default. */
  lands: LandsMode | null;
  outputs: string[];
  parent: string | null;
  rank: string | null;
  related: string[];
  stage: string | null;
  type: string | null;
}

/** One to-do, flat in file order. */
export interface Todo {
  /** Nesting: 0 for a top-level to-do. */
  depth: number;
  done: boolean;
  /** Its marker, `td-3`; null on a to-do written without one. */
  id: string | null;
  /** Its position: `2` the second top-level to-do, `2.1` that one's first child. */
  path: string;
  /** The task it was promoted to (`tsk-152`), when its line ends in `→ #152`. */
  promoted: string | null;
  /** The words after the box and marker, without the promoted link. */
  text: string;
}

/** A section of the body other than the two a task file owns. */
export interface TaskSection {
  heading: string;
  text: string;
}

export interface ParsedTask {
  /** The `## Acceptance criteria` section's text; empty when there is none. */
  acceptance: string;
  /** The text between the title and the first `## ` section. */
  description: string;
  /** Front matter keys this file carries that a task file does not know; kept as written. */
  extra: string[];
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
const SECTION = /^##\s+(.*?)(?:\s+#+)?\s*$/;
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

const scalarOf = (line: FrontMatterLine): string | null => {
  const value = unquoted(withoutComment(line.value));
  return value === "" ? null : value;
};

/** `[a, b]`, a block sequence under the key, or one bare value as a list of one. */
const listOf = (line: FrontMatterLine): string[] | undefined => {
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
  checks: "checks",
  outputs: "outputs",
  lands: "lands",
  rank: "rank",
  labels: "labels",
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
  const edge = EDGE_FIELDS.has(field);
  if (Array.isArray(value)) {
    return `[${value.map(edge ? renderEdge : renderItem).join(", ")}]`;
  }
  return edge ? renderEdge(value) : renderScalar(value);
};

const emptyFields = (): TaskFields => ({
  stage: null,
  type: null,
  after: [],
  parent: null,
  related: [],
  foundIn: null,
  checks: [],
  outputs: [],
  lands: null,
  rank: null,
  labels: [],
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

/** One task id (`parent`, `found_in`); what is not one goes to `problems`. */
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

/** Reads the known fields of a front matter block; what it cannot read goes to `problems`. */
const readFields = (
  lines: FrontMatterLine[],
  problems: string[]
): { fields: TaskFields; extra: string[] } => {
  const fields = emptyFields();
  const extra: string[] = [];
  for (const line of lines) {
    const field = line.key;
    if (field === undefined) {
      continue;
    }
    if (field === "after" || field === "related") {
      fields[field] = readEdgeList(field, line, problems);
    } else if (field === "parent") {
      fields.parent = readEdge(field, line, problems);
    } else if (field === "found_in") {
      fields.foundIn = readEdge(field, line, problems);
    } else if (
      field === "checks" ||
      field === "outputs" ||
      field === "labels"
    ) {
      fields[field] = readList(field, line, problems);
    } else if (field === "stage" || field === "type" || field === "rank") {
      fields[field] = scalarOf(line);
    } else if (field === "lands") {
      fields.lands = readLands(line, problems);
    } else {
      extra.push(field);
    }
  }
  return { fields, extra };
};

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
    let text = box[4] ?? "";
    const marker = TODO_MARKER.exec(text);
    if (marker) {
      text = text.slice(marker[0].length);
    }
    const promoted = PROMOTED.exec(text);
    if (promoted) {
      text = text.slice(0, promoted.index).trimEnd();
    }
    todos.push({
      id: marker?.[1] ?? null,
      path,
      text: text.trim(),
      done: box[3] !== " ",
      depth: stack.length,
      promoted: promoted ? taskId(Number(promoted[1])) : null,
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
      sections: sections
        .filter(
          (section) =>
            !(isAcceptance(section.heading) || isTodos(section.heading))
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
  addTodo(text: string, under?: string): { id: string } | string {
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
    this.body.splice(at, 0, `${indent}- [ ] [${id}] ${text}`);
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
