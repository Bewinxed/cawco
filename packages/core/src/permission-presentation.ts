/**
 * What a permission prompt says, in plain words, on every surface: the
 * dashboard's composer card, the iOS parked prompt, the Telegram message and
 * the attention rails. The hub reads each ask once, as it parks it, and stamps
 * the result on the `permission_request` frame ({@link PermissionPresentation});
 * every surface renders that and reads nothing of the tool's input itself, so
 * no two of them can word the same ask two ways.
 *
 * The hub supplies what only it knows ({@link PresentationContext}): who asked,
 * the fleet's current memory text (so a memory write carries the change it
 * makes, not only the text it ends with), and which named settings already
 * exist (so a put says whether it adds or replaces).
 */
import { questionsOf } from "./question";

/** One file or document the call changes: both sides, for the diff renderers. */
export interface PermissionChange {
  /** Lines the proposed side adds. */
  added: number;
  /** The text the proposed side ends with. */
  after: string;
  /** The text as it stands now ("" when there is none yet, or the call does not say). */
  before: string;
  /** What changes, named as the person knows it: `CLAUDE.md`, a memory path, a file path. */
  path: string;
  /** Lines the proposed side removes. */
  removed: number;
}

/** One input field, as shown: its value written out, secrets already hidden. */
export interface PermissionField {
  key: string;
  value: string;
}

export interface PermissionPresentation {
  /** The session that asked, by the name the board gives it. */
  asker: string;
  /** The changes the call makes, each drawn as a diff. Empty when it changes no text. */
  changes: PermissionChange[];
  /** The line under the summary: how much changes and where ("3 lines changed in Working style"). */
  detail?: string;
  /** The rest of the input worth reading, secrets hidden. What the summary and the diffs already say is left out. */
  fields: PermissionField[];
  /** What will happen and to what, in one line: "Change the fleet's CLAUDE.md". */
  summary: string;
}

/** The settings groups an admin write names things in. */
export type AdminGroup =
  | "delegate_types"
  | "hooks"
  | "mcp_servers"
  | "plugins"
  | "rules"
  | "skills";

export interface PresentationContext {
  /** The asking session's name. */
  asker: string;
  /** The fleet's current text: the CLAUDE.md for `null`, else the memory document at that path. Undefined when there is none. */
  memory: (path: string | null) => string | undefined;
  /** The current name of a setting the fleet keeps, by the key the write names it with; undefined when it does not exist. */
  named: (group: AdminGroup, key: string) => string | undefined;
}

// ── line changes ─────────────────────────────────────────────────────────

const HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
/** Past this many cells the line table is not built: every line on each side counts as changed. */
const TABLE_CAP = 4_000_000;

const linesOf = (source: string): string[] =>
  source === "" ? [] : source.split("\n");

/** Each line's markdown section: the nearest heading at or above it. */
const sectionsOf = (lines: string[]): (string | undefined)[] => {
  let current: string | undefined;
  return lines.map((line) => {
    const [, heading] = HEADING.exec(line) ?? [];
    if (heading) {
      current = heading;
    }
    return current;
  });
};

interface LineStat {
  added: number;
  removed: number;
  /** The sections the changed lines stand in, in order, each once. */
  sections: string[];
}

/** Where two line lists stop agreeing: the common head's length and the common tail's. */
function commonEnds(a: string[], b: string[]): { head: number; tail: number } {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a.at(-1 - tail) === b.at(-1 - tail)
  ) {
    tail += 1;
  }
  return { head, tail };
}

/** The LCS table over `a[head, head+n)` and `b[head, head+m)`: cell (i, j) is the LCS length of their suffixes. */
function lcsTable(
  a: string[],
  b: string[],
  head: number,
  n: number,
  m: number
): Uint32Array {
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[head + i] === b[head + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return table;
}

/** The changed lines between the common ends: indexes into `a` removed, into `b` added. */
function editScript(
  a: string[],
  b: string[]
): { removedAt: number[]; addedAt: number[] } {
  const { head, tail } = commonEnds(a, b);
  const n = a.length - head - tail;
  const m = b.length - head - tail;
  const removedAt: number[] = [];
  const addedAt: number[] = [];
  if (n * m > TABLE_CAP || n === 0 || m === 0) {
    for (let i = 0; i < n; i += 1) {
      removedAt.push(head + i);
    }
    for (let j = 0; j < m; j += 1) {
      addedAt.push(head + j);
    }
    return { removedAt, addedAt };
  }
  const width = m + 1;
  const table = lcsTable(a, b, head, n, m);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[head + i] === b[head + j]) {
      i += 1;
      j += 1;
    } else if (
      j < m &&
      (i === n || table[i * width + j + 1] >= table[(i + 1) * width + j])
    ) {
      addedAt.push(head + j);
      j += 1;
    } else {
      removedAt.push(head + i);
      i += 1;
    }
  }
  return { removedAt, addedAt };
}

/**
 * The line diff of two texts, counted: an LCS over the lines between the
 * common head and tail (the same script DiffView.swift and @pierre/diffs
 * draw on inputs this size), and the markdown sections it touches.
 */
export function lineStat(before: string, after: string): LineStat {
  const a = linesOf(before);
  const b = linesOf(after);
  const { removedAt, addedAt } = editScript(a, b);
  const beforeSections = sectionsOf(a);
  const afterSections = sectionsOf(b);
  const touched = [
    ...removedAt.map((at) => beforeSections[at]),
    ...addedAt.map((at) => afterSections[at]),
  ].filter((section): section is string => section !== undefined);
  return {
    added: addedAt.length,
    removed: removedAt.length,
    sections: [...new Set(touched)],
  };
}

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** "3 lines changed in Working style": how much a text change moves, and where. */
function statWords(stat: LineStat): string {
  const { added, removed, sections } = stat;
  if (added === 0 && removed === 0) {
    return "No lines change";
  }
  let amount: string;
  if (removed === 0) {
    amount = `${plural(added, "line")} added`;
  } else if (added === 0) {
    amount = `${plural(removed, "line")} removed`;
  } else {
    amount = `${plural(Math.max(added, removed), "line")} changed`;
  }
  if (sections.length === 1) {
    return `${amount} in ${sections[0]}`;
  }
  return sections.length > 1
    ? `${amount} across ${plural(sections.length, "section")}`
    : amount;
}

/** The short form Telegram carries: "+3 −1". */
export const changeStat = (changes: PermissionChange[]): string => {
  const added = changes.reduce((sum, each) => sum + each.added, 0);
  const removed = changes.reduce((sum, each) => sum + each.removed, 0);
  return `+${added} −${removed}`;
};

const changeOf = (
  path: string,
  before: string,
  after: string
): { change: PermissionChange; stat: LineStat } => {
  const stat = lineStat(before, after);
  return {
    change: {
      path,
      before,
      after,
      added: stat.added,
      removed: stat.removed,
    },
    stat,
  };
};

// ── fields and secrets ───────────────────────────────────────────────────

/** A field whose name says it carries a credential. */
const SECRET_KEY =
  /secret|token|passw|api[-_]?key|apikey|auth|credential|cookie|private[-_]?key|^key$|bearer|session[-_]?id/i;
/** A value that reads as a credential whatever its field is called. */
const SECRET_VALUE = [
  /^(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/,
  /^gh[pousr]_[A-Za-z0-9]{20,}/,
  /^github_pat_[A-Za-z0-9_]{20,}/,
  /^xox[abprs]-[A-Za-z0-9-]{10,}/,
  /^AKIA[0-9A-Z]{16}$/,
  /^eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}$/,
  /^bearer\s+\S{8,}/i,
];
/** Maps whose every value is private by nature: a server's environment, a request's headers. */
const KEYS_ONLY = new Set(["env", "headers", "environment"]);

export const HIDDEN = "(hidden)";

const looksSecret = (value: string): boolean =>
  SECRET_VALUE.some((pattern) => pattern.test(value.trim()));

/** A value with every credential in it replaced by {@link HIDDEN}, at any depth. */
export function redact(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return SECRET_KEY.test(key) || looksSecret(value) ? HIDDEN : value;
  }
  if (typeof value !== "object") {
    // A number or a flag is a setting, never a credential.
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(key, item));
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (KEYS_ONLY.has(key.toLowerCase())) {
    return Object.fromEntries(entries.map(([name]) => [name, HIDDEN]));
  }
  return Object.fromEntries(
    entries.map(([name, inner]) => [name, redact(name, inner)])
  );
}

const written = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);

/** One field as shown: an environment or a header map by its keys alone, anything else with its secrets hidden. */
const shown = (key: string, value: unknown): string => {
  if (
    KEYS_ONLY.has(key.toLowerCase()) &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const keys = Object.keys(value);
    return keys.length > 0 ? `${keys.join(", ")} (values hidden)` : "(none)";
  }
  return written(redact(key, value));
};

/** The input's fields as shown, secrets hidden, `skip` and empty ones left out. */
export function fieldsOf(
  input: Record<string, unknown>,
  skip: readonly string[] = []
): PermissionField[] {
  return Object.entries(input)
    .filter(
      ([key, value]) =>
        !skip.includes(key) &&
        value !== undefined &&
        value !== null &&
        value !== ""
    )
    .map(([key, value]) => ({ key, value: shown(key, value) }));
}

// ── the tools ────────────────────────────────────────────────────────────

const MCP_NAME = /^mcp__(.+?)__(.+)$/;
const CAWCO_ADMIN_WRITE = /^(?:mcp__cawco__|cawco_)?admin_([a-z_]+)_write$/;
const WORD_BREAK = /[_-]+/g;
const CAMEL = /([a-z\d])([A-Z])/g;
const SPACES = /\s+/g;
const COMMAND_CAP = 120;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const cut = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** `list_sessions` → `List sessions`. */
const humanize = (name: string): string => {
  const words = name
    .replace(WORD_BREAK, " ")
    .replace(CAMEL, "$1 $2")
    .replace(SPACES, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** A tool as a person reads it: an MCP tool by its server, then its name in words. */
export function toolDisplayName(toolName: string): string {
  const mcp = MCP_NAME.exec(toolName);
  if (!mcp) {
    return toolName;
  }
  const server = mcp[1] === "cawco" ? "CawCo" : mcp[1];
  return `${server}: ${humanize(mcp[2])}`;
}

type Presented = Omit<PermissionPresentation, "asker">;

const only = (summary: string, fields: PermissionField[] = []): Presented => ({
  summary,
  changes: [],
  fields,
});

/** `admin_memory_write`: the fleet's CLAUDE.md and its linked documents, with the change each makes. */
function memoryWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const path = text(input.path);
  const content = typeof input.content === "string" ? input.content : "";
  switch (input.action) {
    case "set": {
      const now = context.memory(null);
      const { change: made, stat } = changeOf("CLAUDE.md", now ?? "", content);
      return {
        summary:
          now === undefined
            ? "Create the fleet's CLAUDE.md"
            : "Change the fleet's CLAUDE.md",
        detail: statWords(stat),
        changes: [made],
        fields: [],
      };
    }
    case "set_doc": {
      const name = path ?? "(no path)";
      const now = path ? context.memory(path) : undefined;
      const { change: made, stat } = changeOf(name, now ?? "", content);
      return {
        summary: now === undefined ? `Create ${name}` : `Change ${name}`,
        detail: statWords(stat),
        changes: [made],
        fields: [],
      };
    }
    case "remove_doc": {
      const name = path ?? "(no path)";
      const now = path ? context.memory(path) : undefined;
      if (now === undefined) {
        return only(`Remove ${name}`, [
          { key: "note", value: "The fleet keeps no document at this path." },
        ]);
      }
      const { change: made, stat } = changeOf(name, now, "");
      return {
        summary: `Remove ${name}`,
        detail: statWords(stat),
        changes: [made],
        fields: [],
      };
    }
    default:
      return only(
        `Change the fleet's memory (${String(input.action)})`,
        fieldsOf(input)
      );
  }
}

/** How a stdio server starts, or where a remote one answers. */
function mcpTarget(config: Record<string, unknown>): string | undefined {
  const url = text(config.url);
  if (url) {
    return url;
  }
  const command = text(config.command);
  if (!command) {
    return undefined;
  }
  const args = Array.isArray(config.args)
    ? config.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  return cut([command, ...args].join(" "), COMMAND_CAP);
}

function skillsWrite(input: Record<string, unknown>): Presented {
  const name = text(input.name) ?? "(unnamed)";
  const fields = fieldsOf(input, ["action", "name", "source"]);
  switch (input.action) {
    case "install":
      return only(
        `Install skill ${name} from ${text(input.source) ?? "(no source)"}`,
        fields
      );
    case "enable":
      return only(`Enable skill ${name}`, fields);
    case "disable":
      return only(`Disable skill ${name}`, fields);
    case "remove":
      return only(`Remove skill ${name}`, fields);
    default:
      return only(`Change skill ${name}`, fieldsOf(input));
  }
}

function mcpServersWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const name = text(input.name) ?? "(unnamed)";
  if (input.action === "remove") {
    return only(`Remove MCP server ${name}`);
  }
  const config =
    input.config && typeof input.config === "object"
      ? (input.config as Record<string, unknown>)
      : {};
  const target = mcpTarget(config);
  const verb = context.named("mcp_servers", name) ? "Replace" : "Add";
  // The summary carries where it answers; the command line is repeated whole
  // only when the summary had to cut it.
  const whole = target !== undefined && !target.endsWith("…");
  const fields = [
    ...fieldsOf(config, whole ? ["url", "command", "args"] : ["url"]),
    ...fieldsOf(input, ["action", "name", "config"]),
  ];
  return only(
    `${verb} MCP server ${name}${target ? ` (${target})` : ""}`,
    fields
  );
}

function hooksWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const id = text(input.id);
  const name =
    text(input.name) ??
    (id ? context.named("hooks", id) : undefined) ??
    id ??
    "(unnamed)";
  const event = text(input.event);
  const fields = fieldsOf(input, ["action", "id", "name"]);
  switch (input.action) {
    case "create":
      return only(
        `Add hook ${name}${event ? ` on ${event}` : ""}`,
        fieldsOf(input, ["action", "id", "name", "event"])
      );
    case "update":
      return only(`Change hook ${name}`, fields);
    case "remove":
      return only(`Remove hook ${name}`);
    default:
      return only(`Change hook ${name}`, fieldsOf(input));
  }
}

function rulesWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const id = text(input.id);
  const name =
    text(input.name) ??
    (id ? context.named("rules", id) : undefined) ??
    id ??
    "(unnamed)";
  const pattern = text(input.pattern);
  switch (input.action) {
    case "create":
      return only(
        `Add rule ${name}${pattern ? ` (watches “${cut(pattern, 60)}”)` : ""}`,
        fieldsOf(input, ["action", "name"])
      );
    case "update":
      return only(`Change rule ${name}`, fieldsOf(input, ["action", "id"]));
    case "remove":
      return only(`Remove rule ${name}`);
    default:
      return only(`Change rule ${name}`, fieldsOf(input));
  }
}

function pluginsWrite(input: Record<string, unknown>): Presented {
  const id = text(input.id) ?? "(no id)";
  const name = text(input.name) ?? "(unnamed)";
  switch (input.action) {
    case "link":
      return only(
        `Link marketplace ${name} from ${text(input.source) ?? "(no source)"}`
      );
    case "unlink":
      return only(`Unlink marketplace ${name}`);
    case "install":
      return only(`Install plugin ${id}`);
    case "enable":
      return only(`Enable plugin ${id}`);
    case "disable":
      return only(`Disable plugin ${id}`);
    case "refresh":
      return only(`Refresh plugin ${id} from its marketplace`);
    case "remove":
      return only(`Remove plugin ${id}`);
    default:
      return only(`Change plugin ${id}`, fieldsOf(input));
  }
}

function delegateTypesWrite(
  input: Record<string, unknown>,
  context: PresentationContext
): Presented {
  const name = text(input.name) ?? "(unnamed)";
  if (input.action === "delete") {
    return only(`Remove delegate type ${name}`);
  }
  const route = [text(input.harness), text(input.model), text(input.effort)]
    .filter(Boolean)
    .join(" · ");
  const verb = context.named("delegate_types", name) ? "Change" : "Add";
  return only(
    `${verb} delegate type ${name}${route ? ` (${route})` : ""}`,
    fieldsOf(input, ["action", "name", "harness", "model", "effort"])
  );
}

function adminWrite(
  group: string,
  input: Record<string, unknown>,
  context: PresentationContext
): Presented | undefined {
  switch (group) {
    case "memory":
      return memoryWrite(input, context);
    case "skills":
      return skillsWrite(input);
    case "mcp_servers":
      return mcpServersWrite(input, context);
    case "hooks":
      return hooksWrite(input, context);
    case "rules":
      return rulesWrite(input, context);
    case "plugins":
      return pluginsWrite(input);
    case "delegate_types":
      return delegateTypesWrite(input, context);
    default:
      return undefined;
  }
}

/** A file path, however the harness keys it (Claude Code, OpenCode, pi). */
const filePathOf = (input: Record<string, unknown>): string | undefined =>
  text(input.file_path) ??
  text(input.filePath) ??
  text(input.filepath) ??
  text(input.path);

const FILE_KEYS = ["file_path", "filePath", "filepath", "path"];
const EDIT_KEYS = [
  "old_string",
  "new_string",
  "oldString",
  "newString",
  "oldText",
  "newText",
  "edits",
];

/** An edit's replacements, each as the change it makes to the file. */
function editChanges(
  path: string,
  input: Record<string, unknown>
): PermissionChange[] {
  const edits: unknown[] = Array.isArray(input.edits) ? input.edits : [input];
  return edits.flatMap((edit) => {
    const each = (edit ?? {}) as Record<string, unknown>;
    const before = each.old_string ?? each.oldString ?? each.oldText;
    const after = each.new_string ?? each.newString ?? each.newText;
    // OpenCode asks with a `diff` instead; it stays a field.
    if (typeof before !== "string" && typeof after !== "string") {
      return [];
    }
    return [
      changeOf(
        path,
        typeof before === "string" ? before : "",
        typeof after === "string" ? after : ""
      ).change,
    ];
  });
}

const replaced = (changes: PermissionChange[]): string => {
  const added = changes.reduce((sum, each) => sum + each.added, 0);
  const removed = changes.reduce((sum, each) => sum + each.removed, 0);
  return statWords({ added, removed, sections: [] });
};

/** The harnesses' own tools, by their lower-cased name. */
function builtIn(
  toolName: string,
  input: Record<string, unknown>
): Presented | undefined {
  const name = toolName.toLowerCase();
  const path = filePathOf(input);
  switch (name) {
    case "edit":
    case "multiedit": {
      const file = path ?? "a file";
      const changes = path ? editChanges(path, input) : [];
      return {
        summary: `Edit ${file}`,
        ...(changes.length > 0 ? { detail: replaced(changes) } : {}),
        changes,
        fields: fieldsOf(input, [...FILE_KEYS, ...EDIT_KEYS]),
      };
    }
    case "write": {
      const file = path ?? "a file";
      const content = typeof input.content === "string" ? input.content : "";
      const made = changeOf(file, "", content).change;
      return {
        summary: `Write ${file}`,
        detail: `${plural(made.added, "line")} written; whatever the file held is replaced`,
        changes: [made],
        fields: fieldsOf(input, [...FILE_KEYS, "content"]),
      };
    }
    case "read":
      return only(`Read ${path ?? "a file"}`, fieldsOf(input, FILE_KEYS));
    case "notebookedit":
      return only(
        `Edit notebook ${text(input.notebook_path) ?? path ?? "(no path)"}`,
        fieldsOf(input, ["notebook_path", ...FILE_KEYS])
      );
    case "bash": {
      const described = text(input.description);
      const command = text(input.command)?.split("\n")[0] ?? "";
      return only(
        described
          ? `Run a command: ${described}`
          : `Run: ${cut(command, COMMAND_CAP)}`,
        fieldsOf(input, ["command", "description"])
      );
    }
    case "webfetch":
      return only(
        `Fetch ${text(input.url) ?? "a web page"}`,
        fieldsOf(input, ["url"])
      );
    case "websearch":
      return only(
        `Search the web for “${text(input.query) ?? ""}”`,
        fieldsOf(input, ["query"])
      );
    case "glob":
      return only(
        `Find files matching ${text(input.pattern) ?? "(no pattern)"}`,
        fieldsOf(input, ["pattern"])
      );
    case "grep":
      return only(
        `Search files for ${text(input.pattern) ?? "(no pattern)"}`,
        fieldsOf(input, ["pattern"])
      );
    case "task":
    case "agent":
      return only(
        `Start a subagent: ${text(input.description) ?? "(no description)"}`,
        fieldsOf(input, ["description"])
      );
    case "exitplanmode":
      return only("Leave plan mode and start on the plan", fieldsOf(input));
    default:
      return undefined;
  }
}

/** The shell command a permission is about, said whole under the summary. */
export const commandOf = (input: Record<string, unknown>): string | null =>
  typeof input.command === "string" ? input.command : null;

/**
 * What a parked tool call will do, for every surface that shows the ask. A
 * question names itself (its questions, joined); an admin write says the
 * setting it changes and, for memory, the change itself; a harness tool says
 * its act and object; any other tool is its display name over its fields.
 */
export function presentPermission(
  toolName: string,
  input: Record<string, unknown>,
  context: PresentationContext
): PermissionPresentation {
  const questions = questionsOf(toolName, input);
  if (questions) {
    return {
      asker: context.asker,
      summary: questions.map((question) => question.question).join(" · "),
      changes: [],
      fields: [],
    };
  }
  const admin = CAWCO_ADMIN_WRITE.exec(toolName);
  // An MCP tool is never a harness's own, whatever it is called.
  const presented =
    (admin ? adminWrite(admin[1], input, context) : undefined) ??
    (MCP_NAME.test(toolName) ? undefined : builtIn(toolName, input)) ??
    only(toolDisplayName(toolName), fieldsOf(input));
  return { asker: context.asker, ...presented };
}
