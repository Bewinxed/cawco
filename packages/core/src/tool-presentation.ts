/**
 * How a tool call is presented in a transcript, on every client: the one
 * source both the dashboard and the native app read, so a call reads the
 * same sentence and opens the same body wherever it is drawn.
 *
 * The rules are data. Each kind of tool says which names it answers to, its
 * glyph (a Solar icon name, which both clients carry), its ink, what a run of
 * them is called, which body it opens (its renderer) and the sentence its row
 * reads as, built from the call's input through a closed vocabulary of
 * transforms and facts. Each client implements that vocabulary and each
 * renderer once: the dashboard through {@link describeTool} here, the native
 * app through the Swift this module is generated into
 * (scripts/tool-presentation.ts writes
 * apps/apple/Packages/CawCoKit/Sources/CawCoTranscript/Generated/ToolPresentation.swift;
 * `bun run tools:check` fails while that file is stale).
 */
import { lineCounts, linesOf } from "./line-diff";

/** Which body an opened call shows; each exists once per client. */
export type Renderer =
  /** Each input field, key over value, then the result: capped, with "… N more chars". */
  | "fields"
  /** The file changes the call made, one diff each; a failed call's refusal above them. */
  | "diff"
  /** The fleet memory a call read or wrote (MemoryBody). */
  | "memory"
  /** One input field as Markdown prose at the text column (a skill's arguments). */
  | "prose"
  /** The picture the call put on screen, under its line; the fields body when opened. */
  | "image"
  /** A card for the artifact the call opened in the session's panel, in place of the line. */
  | "preview";

/** How a piece of the sentence is cut from the value it is read from. */
export type Transform =
  /** As written. */
  | "as-is"
  /** Whitespace runs to one space, at most {@link LINE_CAP} characters. */
  | "one-line"
  /** The first non-blank line, at most {@link LINE_CAP} characters. */
  | "first-line"
  /** A path's last segment. */
  | "path-leaf"
  /** A path's directory, where it has one. */
  | "path-dir"
  /** A path's last segment and the lines read: `name:40–90`, `name:40+` (`offset`, `limit`). */
  | "path-leaf-span"
  /** A URL's host, `www.` off. */
  | "url-host"
  /** A URL's host and path, its trailing slash off. */
  | "url-host-path"
  /** A list of numbers as a point: `(x, y)`. */
  | "point";

/** What a call measured out, read off its input or its result. */
export type Fact =
  /** `N lines`: Read's numbered lines (`␣␣1→`), else its non-blank lines. */
  | "read-lines"
  /** `N files` / `N matches`: Grep's own count line, or a count-mode tally. */
  | "grep-count"
  /** `N files`: Glob's non-blank lines, nothing for "No files found". */
  | "glob-files"
  /** `+A −R`: the lines an edit's replacements add and remove. */
  | "edit-lines"
  /** `+A`: the lines a write puts in the file. */
  | "write-lines"
  /** `+A −R` over every file a patch touches (`toolDiff`). */
  | "patch-lines"
  /** `N lines` of the `content` input. */
  | "content-lines"
  /** `N lines` of the fleet memory document the result carries. */
  | "memory-doc-lines"
  /** `N docs` the fleet memory result lists. */
  | "memory-docs";

/** A piece of the sentence: the first of `from` that is a non-blank string, cut by `as`. */
export interface Piece {
  as?: Transform;
  /** Input fields, in the order they answer it. */
  from: string[];
  /** Where no field of `from` answers: the longest input string at most {@link PRIMARY_MAX} long. */
  orShortest?: boolean;
  /** Words written here rather than read from the input. */
  text?: string;
  /** Read only when this input field is absent or blank. */
  unless?: string;
  /** Put around the piece: `["/", "/"]` draws a pattern as `/pattern/`. */
  wrap?: [string, string];
}

/** A label written with a slot: `Fetched {}` filled by `slot`, `fallback` when it is empty. */
export interface SlotLabel {
  fallback: string;
  slot: Piece;
  template: string;
}

/** The sentence a row reads as. Every part is optional; what is absent is not drawn. */
export interface Sentence {
  /** A short aside: `background` when `field` is `true`. */
  chip?: { field: string; text: string };
  /** The object's dimmer tail: a parent directory, a search scope, a summary. */
  detail?: Piece | Piece[];
  /** Whether the detail is set in the mono face. */
  detailMono?: boolean;
  fact?: Fact;
  /** Whether the fact reads as a diff, its `+` green and its `−` red. */
  factDiff?: boolean;
  /** The site whose icon stands in for the glyph: the host of this piece. */
  favicon?: Piece;
  /** The verb, in the UI face: words, words with a slot, an input field, or the tool's own name made readable. */
  label?: string | SlotLabel | { from: Piece } | "tool-name";
  /** What the verb acted on; the first piece that yields. */
  object?: Piece | Piece[];
  /** Whether the object is set in the mono face (it is, unless said otherwise). */
  objectMono?: boolean;
  /** The first line the call printed, under the sentence. */
  secondLine?: boolean;
}

/** A sentence for some calls of a kind: by the tool's own name, its status, or its `action` input. */
export interface Variant {
  renderer?: Renderer;
  sentence: Sentence;
  when: {
    /** The `action` input. */
    action?: string;
    /** The tool's own name (an MCP tool's, past its server), lowercased. */
    names?: string[];
    /** A diff body only when the call carries a patch (`toolDiff`). */
    patch?: boolean;
    status?: ToolStatus;
  };
}

export type ToolStatus = "pending" | "success" | "error";

export type ToolKindId =
  | "bash"
  | "read"
  | "edit"
  | "write"
  | "grep"
  | "glob"
  | "web"
  | "toolsearch"
  | "skill"
  | "message"
  | "screen"
  | "navigate"
  | "js"
  | "mcp"
  | "memory"
  | "task"
  | "todo"
  | "notebook"
  | "question"
  | "preview"
  | "other";

export interface ToolKind {
  /** Solar duotone icon name: the same glyph on every client. */
  glyph: string;
  id: ToolKindId;
  /** Its ink: a design token (`tool-run`, `muted-foreground`). */
  ink: string;
  /** What a run of them is called: `3 commands`. */
  many: string;
  /** A pattern its names match, where a list cannot say it. */
  namePattern?: string;
  /** The tool names it answers to, lowercased; an MCP tool by its own name past the server. */
  names: string[];
  one: string;
  renderer: Renderer;
  sentence: Sentence;
  /** Sentences for some of its calls, the first whose `when` holds. */
  variants?: Variant[];
}

// The vocabulary as lists, for the generator: a Record over each union, so a
// member added to a union and not here fails the type check.
const RENDERER_SET: Record<Renderer, true> = {
  fields: true,
  diff: true,
  memory: true,
  prose: true,
  image: true,
  preview: true,
};
const TRANSFORM_SET: Record<Transform, true> = {
  "as-is": true,
  "one-line": true,
  "first-line": true,
  "path-leaf": true,
  "path-dir": true,
  "path-leaf-span": true,
  "url-host": true,
  "url-host-path": true,
  point: true,
};
const FACT_SET: Record<Fact, true> = {
  "read-lines": true,
  "grep-count": true,
  "glob-files": true,
  "edit-lines": true,
  "write-lines": true,
  "patch-lines": true,
  "content-lines": true,
  "memory-doc-lines": true,
  "memory-docs": true,
};
const STATUS_SET: Record<ToolStatus, true> = {
  pending: true,
  success: true,
  error: true,
};
export const RENDERERS = Object.keys(RENDERER_SET) as Renderer[];
export const TRANSFORMS = Object.keys(TRANSFORM_SET) as Transform[];
export const FACTS = Object.keys(FACT_SET) as Fact[];
export const STATUSES = Object.keys(STATUS_SET) as ToolStatus[];

/** Past this a line is a payload, not a sentence: it only has to truncate. */
export const LINE_CAP = 200;
/** The most of a result a fields body shows; the rest is counted (`… N more chars`). */
export const RESULT_CAP = 20_000;
/** A failed call's reason as the sentence it is: Claude Code's tags off. */
export const REFUSAL_TAGS = "</?tool_use_error>";
/** An MCP tool's name: `mcp__<server>__<tool>`. */
export const MCP_NAME = "^mcp__(.+?)__(.+)$";
/** The fields that name what a call is about, in the order they answer it. */
export const PRIMARY_FIELDS = [
  "file_path",
  "path",
  "url",
  "query",
  "pattern",
  "command",
  "description",
];
/** The longest value still read as a name rather than a payload. */
export const PRIMARY_MAX = 80;

const filePath: Piece = { from: ["file_path", "filePath", "path", "filename"] };
/** What an unnamed call is about: its first primary field, else its longest short value. */
const primary: Piece = {
  from: PRIMARY_FIELDS,
  as: "one-line",
  orShortest: true,
};
const leaf = (piece: Piece): Piece => ({ ...piece, as: "path-leaf" });
const dir = (piece: Piece): Piece => ({ ...piece, as: "path-dir" });

/** Every kind, in the order a name is matched against them; `other` takes the rest. */
export const TOOL_KINDS: ToolKind[] = [
  {
    id: "bash",
    names: ["bash", "shell"],
    glyph: "code-square-bold-duotone",
    ink: "tool-run",
    one: "command",
    many: "commands",
    renderer: "fields",
    // No description to lead with: the command itself is the sentence.
    sentence: {
      label: { from: { from: ["description"] } },
      object: { from: ["command"], as: "one-line" },
      chip: { field: "run_in_background", text: "background" },
      secondLine: true,
    },
  },
  {
    id: "read",
    names: ["read"],
    glyph: "document-text-bold-duotone",
    ink: "tool-read",
    one: "read",
    many: "reads",
    renderer: "fields",
    sentence: {
      label: "Read",
      object: { from: ["file_path", "path"], as: "path-leaf-span" },
      detail: { from: ["file_path", "path"], as: "path-dir" },
      detailMono: true,
      fact: "read-lines",
    },
  },
  {
    id: "edit",
    names: [
      "apply_patch",
      "patch",
      "edit",
      "multiedit",
      "str_replace_editor",
      "str_replace",
      "file_edit",
    ],
    glyph: "pen-2-bold-duotone",
    ink: "tool-edit",
    one: "edit",
    many: "edits",
    renderer: "diff",
    sentence: {
      label: "Edited",
      object: leaf(filePath),
      fact: "edit-lines",
      factDiff: true,
    },
    variants: [
      // A failed call changed nothing: it says so, and carries no line count.
      {
        when: { status: "error" },
        sentence: { label: "Edit failed", object: leaf(filePath) },
      },
      {
        when: { names: ["apply_patch", "patch"], status: "pending" },
        renderer: "fields",
        sentence: { label: "Applying patch" },
      },
      {
        when: { names: ["apply_patch", "patch"], patch: true },
        sentence: {
          label: "Applied patch",
          fact: "patch-lines",
          factDiff: true,
        },
      },
      {
        when: { names: ["apply_patch", "patch"] },
        renderer: "fields",
        sentence: { label: "Applied patch" },
      },
    ],
  },
  {
    id: "write",
    names: ["write", "create_file", "write_file"],
    glyph: "pen-new-square-bold-duotone",
    ink: "tool-write",
    one: "write",
    many: "writes",
    renderer: "diff",
    sentence: {
      label: "Wrote",
      object: leaf(filePath),
      fact: "write-lines",
      factDiff: true,
    },
    variants: [
      {
        when: { status: "error" },
        sentence: { label: "Write failed", object: leaf(filePath) },
      },
    ],
  },
  {
    id: "grep",
    names: ["grep"],
    glyph: "magnifer-bold-duotone",
    ink: "tool-search",
    one: "search",
    many: "searches",
    renderer: "fields",
    sentence: {
      label: "Searched",
      object: { from: ["pattern"], as: "one-line", wrap: ["/", "/"] },
      detail: { from: ["path"], as: "path-leaf" },
      detailMono: true,
      fact: "grep-count",
      secondLine: true,
    },
  },
  {
    id: "glob",
    names: ["glob"],
    glyph: "folder-with-files-bold-duotone",
    ink: "tool-search",
    one: "listing",
    many: "listings",
    renderer: "fields",
    sentence: {
      label: "Listed",
      object: { from: ["pattern", "glob"] },
      fact: "glob-files",
    },
  },
  {
    id: "web",
    names: ["webfetch", "websearch"],
    glyph: "global-bold-duotone",
    ink: "tool-web",
    one: "fetch",
    many: "fetches",
    renderer: "fields",
    sentence: {
      label: {
        template: "Fetched {}",
        slot: { from: ["url"], as: "url-host" },
        fallback: "Fetched",
      },
      object: { from: ["url"], as: "one-line" },
      favicon: { from: ["url"], as: "url-host" },
      secondLine: true,
    },
    variants: [
      {
        when: { names: ["websearch"] },
        sentence: {
          label: "Searched the web",
          object: { from: ["query"] },
          secondLine: true,
        },
      },
    ],
  },
  {
    id: "toolsearch",
    names: ["toolsearch"],
    glyph: "magnifer-bold-duotone",
    ink: "tool-search",
    one: "lookup",
    many: "lookups",
    renderer: "fields",
    sentence: {
      label: "Looked up tools",
      object: { from: ["query"] },
      secondLine: true,
    },
  },
  {
    id: "skill",
    names: ["skill"],
    glyph: "bolt-bold-duotone",
    ink: "tool-skill",
    one: "skill",
    many: "skills",
    renderer: "prose",
    sentence: {
      label: "Ran skill",
      object: { from: ["skill"], wrap: ["/", ""] },
      detail: { from: ["args"], as: "one-line" },
    },
  },
  {
    id: "task",
    names: ["task", "agent", "subagent"],
    glyph: "users-group-rounded-bold-duotone",
    ink: "tool-agent",
    one: "delegation",
    many: "delegations",
    renderer: "fields",
    sentence: { label: "tool-name", object: primary },
  },
  {
    id: "todo",
    names: ["todowrite"],
    glyph: "checklist-bold-duotone",
    ink: "tool-plan",
    one: "plan",
    many: "plans",
    renderer: "fields",
    sentence: { label: "tool-name", object: primary },
  },
  {
    id: "notebook",
    names: ["notebookedit"],
    glyph: "notebook-bold-duotone",
    ink: "tool-edit",
    one: "cell edit",
    many: "cell edits",
    renderer: "fields",
    sentence: { label: "tool-name", object: primary },
  },
  {
    id: "question",
    names: ["askuserquestion"],
    glyph: "question-circle-bold-duotone",
    ink: "tool-ask",
    one: "question",
    many: "questions",
    renderer: "fields",
    sentence: { label: "tool-name", object: primary },
  },
  {
    id: "message",
    names: ["sendmessage"],
    glyph: "plain-2-bold-duotone",
    ink: "tool-agent",
    one: "message",
    many: "messages",
    renderer: "fields",
    sentence: {
      label: "Messaged",
      object: { from: ["to", "agent_id", "name"] },
      detail: { from: ["prompt", "message", "description"], as: "one-line" },
    },
  },
  {
    id: "preview",
    names: [
      "artifact_create",
      "cawco_artifact_create",
      "artifact_show",
      "cawco_artifact_show",
    ],
    glyph: "window-frame-bold-duotone",
    ink: "tool-mcp",
    one: "artifact",
    many: "artifacts",
    renderer: "preview",
    sentence: { label: "Artifact" },
  },
  {
    id: "screen",
    names: ["computer", "show_image", "cawco_show_image"],
    glyph: "cursor-bold-duotone",
    ink: "tool-web",
    one: "screen step",
    many: "screen steps",
    renderer: "fields",
    sentence: {
      label: {
        template: "Screen · {}",
        slot: { from: ["action"] },
        fallback: "Screen",
      },
      object: [
        { from: ["coordinate"], as: "point" },
        { from: ["text"], as: "one-line" },
      ],
    },
    variants: [
      {
        // Live rows describe the call before its arguments have streamed in.
        when: { names: ["show_image", "cawco_show_image"] },
        renderer: "image",
        sentence: {
          label: "Show",
          object: { from: ["path"], as: "path-leaf" },
          detail: { from: ["path"], as: "path-dir" },
          detailMono: true,
        },
      },
    ],
  },
  {
    id: "navigate",
    names: ["navigate"],
    glyph: "compass-bold-duotone",
    ink: "tool-web",
    one: "page",
    many: "pages",
    renderer: "fields",
    sentence: {
      label: "Opened",
      object: { from: ["url"], as: "url-host-path" },
      favicon: { from: ["url"], as: "url-host" },
    },
  },
  {
    id: "js",
    names: ["javascript_tool", "repl"],
    glyph: "code-2-bold-duotone",
    ink: "tool-run",
    one: "script",
    many: "scripts",
    renderer: "fields",
    sentence: {
      label: "Ran JavaScript",
      // Snippets routinely open on a blank line; lead with the first real one.
      object: {
        from: ["code", "text", "script"],
        as: "first-line",
        unless: "description",
      },
      detail: { from: ["description"] },
      secondLine: true,
    },
  },
  {
    id: "memory",
    names: [],
    namePattern: "^(?:cawco_)?admin_memory_(?:read|write)$",
    glyph: "book-bold-duotone",
    ink: "tool-plan",
    one: "memory edit",
    many: "memory edits",
    renderer: "memory",
    sentence: { label: "Fleet memory", objectMono: false },
    variants: [
      {
        when: { action: "get" },
        sentence: {
          label: "Read fleet memory",
          object: { from: [], text: "CLAUDE.md" },
          fact: "memory-doc-lines",
        },
      },
      {
        when: { action: "set" },
        sentence: {
          label: "Updated fleet memory",
          object: { from: [], text: "CLAUDE.md" },
          fact: "content-lines",
        },
      },
      {
        when: { action: "list_docs" },
        sentence: { label: "Listed memory docs", fact: "memory-docs" },
      },
      {
        when: { action: "set_doc" },
        sentence: {
          label: "Wrote memory doc",
          object: leaf({ from: ["path"] }),
          detail: dir({ from: ["path"] }),
          detailMono: true,
          fact: "content-lines",
        },
      },
      {
        when: { action: "remove_doc" },
        sentence: {
          label: "Removed memory doc",
          object: leaf({ from: ["path"] }),
          detail: dir({ from: ["path"] }),
          detailMono: true,
        },
      },
    ],
  },
  {
    id: "mcp",
    names: [],
    glyph: "plug-circle-bold-duotone",
    ink: "tool-mcp",
    one: "call",
    many: "calls",
    renderer: "fields",
    sentence: { label: "tool-name", objectMono: false, secondLine: true },
  },
  {
    // Not "step": the header already counts steps. An unknown tool has no
    // family to be, so it takes the muted ink rather than borrowing one.
    id: "other",
    names: [],
    glyph: "sledgehammer-bold-duotone",
    ink: "muted-foreground",
    one: "action",
    many: "actions",
    renderer: "fields",
    sentence: { label: "tool-name", object: primary, secondLine: true },
  },
];

// ── The dashboard's reading of the rules. The native app's is generated
//    (scripts/tool-presentation.ts) and implements the same steps in Swift.

const LEADING_WWW = /^www\./;
const TRAILING_SLASH = /\/$/;
const PATCH_NEW_SIDE = /^b\//;
const SERVER_SEPARATORS = /[_\-.]+/;

// The shapes a call's output and its names are read by, as scans: the
// native app reads them by the same steps (ToolDescriptor), where a Regex
// was most of setting a call's row up.

const isDigit = (c: string | undefined): boolean =>
  c !== undefined && c >= "0" && c <= "9";
const isWordCharacter = (c: string | undefined): boolean =>
  c !== undefined &&
  (isDigit(c) || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_");

/** How many digits `text` has from `from` on. */
function digitsAt(text: string, from: number): number {
  let end = from;
  while (isDigit(text[end])) {
    end += 1;
  }
  return end - from;
}

/** Read answers with `␣␣␣␣1→…` (spaces, digits, `→`); anything appended to that is not the file. */
function numberedLine(line: string): boolean {
  const rest = line.trimStart();
  const digits = digitsAt(rest, 0);
  return digits > 0 && rest[digits] === "→";
}

/** Grep's `Found <count> <word>` at a line's start, any case. */
function foundLine(line: string): [string, string] | undefined {
  if (line.slice(0, 6).toLowerCase() !== "found ") {
    return undefined;
  }
  const digits = digitsAt(line, 6);
  if (!digits || line[6 + digits] !== " ") {
    return undefined;
  }
  let end = 7 + digits;
  while (isWordCharacter(line[end])) {
    end += 1;
  }
  return end > 7 + digits
    ? [line.slice(6, 6 + digits), line.slice(7 + digits, end)]
    : undefined;
}

/** A count line's tally: the digits after its last colon, at its end but for spaces. */
function countTail(line: string): string | undefined {
  const body = line.trimEnd();
  let start = body.length;
  while (start > 0 && isDigit(body[start - 1])) {
    start -= 1;
  }
  return start < body.length && start > 0 && body[start - 1] === ":"
    ? body.slice(start)
    : undefined;
}

/** An IPv4 address's shape: four runs of one to three digits, dots between. */
function isAddress(host: string): boolean {
  const parts = host.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        part.length >= 1 &&
        part.length <= 3 &&
        digitsAt(part, 0) === part.length
    )
  );
}

/** Whether the host's last label is a number. */
function endsInNumber(host: string): boolean {
  const dot = host.lastIndexOf(".");
  const last = dot < 0 ? "" : host.slice(dot + 1);
  return last.length > 0 && digitsAt(last, 0) === last.length;
}

/** One piece, a list of them, or none, as a list. */
const asList = (piece: Piece | Piece[] | undefined): Piece[] => {
  if (piece === undefined) {
    return [];
  }
  return Array.isArray(piece) ? piece : [piece];
};

/** An MCP tool's server and its own name, or nothing for a harness tool. */
export function mcpParts(
  name: string
): { server: string; tool: string } | undefined {
  if (readParts.has(name)) {
    return readParts.get(name);
  }
  const match = new RegExp(MCP_NAME).exec(name);
  const parts = match ? { server: match[1], tool: match[2] } : undefined;
  remember(readParts, name, parts);
  return parts;
}

/** The kind a tool name is: by its own name (an MCP tool's past its server), else `mcp` or `other`. */
export function toolKind(toolName: string | undefined): ToolKind {
  const raw = toolName ?? "";
  const known = readKinds.get(raw);
  if (known) {
    return known;
  }
  const mcp = mcpParts(raw);
  const own = (mcp ? mcp.tool : raw).toLowerCase();
  const found = own
    ? TOOL_KINDS.find(
        (kind) =>
          kind.names.includes(own) ||
          (kind.namePattern !== undefined &&
            new RegExp(kind.namePattern).test(own))
      )
    : undefined;
  const fallback = mcp ? "mcp" : "other";
  const resolved =
    found ?? (TOOL_KINDS.find((each) => each.id === fallback) as ToolKind);
  remember(readKinds, raw, resolved);
  return resolved;
}

/**
 * What each tool name read as, kept: a name reads the same every time, and
 * reading it compiled the shared patterns (`MCP_NAME`, a kind's
 * `namePattern`) for every call's row. The native app keeps them alike
 * (ToolDescriptor `read`).
 */
const readParts = new Map<
  string,
  { server: string; tool: string } | undefined
>();
const readKinds = new Map<string, ToolKind>();
/** The most names kept; past it the table starts again. */
const MOST_NAMES = 4096;
function remember<Value>(
  table: Map<string, Value>,
  name: string,
  value: Value
): void {
  if (table.size >= MOST_NAMES) {
    table.clear();
  }
  table.set(name, value);
}

/** The sentence a call's row reads as, and the body it opens. */
export interface ToolSentence {
  chip?: string;
  detail?: string;
  detailMono: boolean;
  fact?: string;
  factDiff: boolean;
  /** The host whose site icon stands in for the glyph. */
  faviconHost?: string;
  kind: ToolKind;
  label: string;
  object?: string;
  objectMono: boolean;
  renderer: Renderer;
  /** The first line the call printed. */
  secondLine?: string;
}

const blank = (value: unknown): value is undefined =>
  typeof value !== "string" || value.trim().length === 0;
const textOf = (value: unknown): string | undefined =>
  blank(value) ? undefined : (value as string);
const int = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;

/** The last segment of a path: what tells two checkouts apart. */
export const pathLeaf = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;
const pathDir = (path: string): string | undefined => {
  const at = path.lastIndexOf("/");
  return at > 0 ? path.slice(0, at) : undefined;
};
const oneLine = (text: string): string =>
  text.replace(/\s+/g, " ").trim().slice(0, LINE_CAP);

/** The first non-blank line, cut to a sentence's length. */
export function firstLine(text: string | undefined): string | undefined {
  for (const line of (text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed.slice(0, LINE_CAP);
    }
  }
  return undefined;
}

const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname.replace(LEADING_WWW, "") || undefined;
  } catch {
    return undefined;
  }
};

function cut(
  value: string,
  as: Transform,
  input: Record<string, unknown>
): string | undefined {
  switch (as) {
    case "as-is":
      return value;
    case "one-line":
      return oneLine(value);
    case "first-line":
      return firstLine(value);
    case "path-leaf":
      return pathLeaf(value);
    case "path-dir":
      return pathDir(value);
    case "path-leaf-span": {
      const offset = int(input.offset);
      const limit = int(input.limit);
      let span = "";
      if (offset !== undefined) {
        span =
          limit === undefined ? `:${offset}+` : `:${offset}–${offset + limit}`;
      }
      return `${pathLeaf(value)}${span}`;
    }
    case "url-host":
      return hostOf(value);
    case "url-host-path": {
      const host = hostOf(value);
      if (!host) {
        return oneLine(value);
      }
      try {
        return `${host}${new URL(value).pathname.replace(TRAILING_SLASH, "")}`;
      } catch {
        return oneLine(value);
      }
    }
    case "point":
      return value;
    default:
      return value;
  }
}

/** The longest input string still short enough to be a name rather than a payload. */
function shortest(input: Record<string, unknown>): string | undefined {
  let best: string | undefined;
  for (const value of Object.values(input)) {
    const text = textOf(value);
    if (
      text &&
      text.length <= PRIMARY_MAX &&
      (!best || text.length > best.length)
    ) {
      best = text;
    }
  }
  return best;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reads one piece by every rule a piece can carry (literal, unless, fields, point, shortest, wrap); each is one data-driven step
function read(
  piece: Piece | Piece[] | undefined,
  input: Record<string, unknown>
): string | undefined {
  for (const one of asList(piece)) {
    if (one.unless !== undefined && textOf(input[one.unless])) {
      continue;
    }
    if (one.text !== undefined) {
      return one.text;
    }
    let value: string | undefined;
    for (const field of one.from) {
      const raw = input[field];
      if (one.as === "point" && Array.isArray(raw)) {
        value = `(${raw.join(", ")})`;
        break;
      }
      value = textOf(raw);
      if (value) {
        value = cut(value, one.as ?? "as-is", input);
        if (value) {
          break;
        }
      }
    }
    if (!value && one.orShortest) {
      const short = shortest(input);
      value = short ? cut(short, one.as ?? "as-is", input) : undefined;
    }
    if (value) {
      return one.wrap ? `${one.wrap[0]}${value}${one.wrap[1]}` : value;
    }
  }
  return undefined;
}

/** `list_sessions` / `listSessions` → `List sessions`. */
export function humanize(name: string): string {
  // A run of `_` or `-` is a space; a space parts a lowercase letter or a digit from a capital after it.
  let spaced = "";
  let last = "";
  for (const character of name) {
    if (character === "_" || character === "-") {
      if (last !== " ") {
        spaced += " ";
      }
      last = " ";
      continue;
    }
    if (
      ((last >= "a" && last <= "z" && last.length === 1) || isDigit(last)) &&
      character >= "A" &&
      character <= "Z" &&
      character.length === 1
    ) {
      spaced += " ";
    }
    spaced += character;
    last = character;
  }
  const words = spaced.replace(/\s+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One file a call changed: its path, and the text it replaced and put in (or a patch's counts). */
export interface FileChange {
  added: number;
  newContent: string;
  oldContent: string;
  path: string;
  removed: number;
}

/** Lines as a diff counts them (line-diff.ts): "a\nb\n" is two, as "a\nb" is. */
const lineCount = (text: string): number => linesOf(text).length;

/**
 * The file changes an edit or write call made, one per replacement. The
 * harnesses name the same inputs three ways: Claude Code `file_path` with
 * `old_string`/`new_string` (MultiEdit: an `edits` list of those); OpenCode
 * `filePath` with `oldString`/`newString`, and `content` for a write; pi
 * `path` with an `edits` list of `oldText`/`newText`. A patch is read for its
 * files and their counts.
 */
export function fileChanges(
  input: Record<string, unknown> | undefined,
  toolName: string | undefined,
  patch?: string
): FileChange[] {
  if (
    patch !== undefined &&
    toolKind(toolName).id === "edit" &&
    (toolName ?? "").toLowerCase().endsWith("apply_patch")
  ) {
    return patchFiles(patch);
  }
  const path = read(
    { from: ["file_path", "filePath", "path", "filename"] },
    input ?? {}
  );
  if (!(input && path)) {
    return [];
  }
  if (toolKind(toolName).id === "write") {
    const content = typeof input.content === "string" ? input.content : "";
    return [
      {
        path,
        oldContent: "",
        newContent: content,
        added: lineCount(content),
        removed: 0,
      },
    ];
  }
  const edits: unknown[] = Array.isArray(input.edits) ? input.edits : [input];
  return edits.map((edit) => {
    const each = (edit ?? {}) as Record<string, unknown>;
    const pick = (keys: string[]) => {
      for (const key of keys) {
        if (typeof each[key] === "string") {
          return each[key] as string;
        }
      }
      return "";
    };
    const oldContent = pick(["old_string", "old_str", "oldString", "oldText"]);
    const newContent = pick(["new_string", "new_str", "newString", "newText"]);
    // Counted as the diff the row opens draws it: the lines the replacement
    // keeps are neither added nor removed.
    return {
      path,
      oldContent,
      newContent,
      ...lineCounts(oldContent, newContent),
    };
  });
}

/** A unified patch's files and the lines each adds and removes. */
export function patchFiles(patch: string): FileChange[] {
  const files: FileChange[] = [];
  let current: FileChange | undefined;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) {
      const name = line.slice(4).trim().replace(PATCH_NEW_SIDE, "");
      current = {
        path: name,
        oldContent: "",
        newContent: "",
        added: 0,
        removed: 0,
      };
      files.push(current);
    } else if (current && line.startsWith("+") && !line.startsWith("+++")) {
      current.added += 1;
    } else if (current && line.startsWith("-") && !line.startsWith("---")) {
      current.removed += 1;
    }
  }
  return files;
}

/** What a fleet memory call answered with, read off the hub's JSON. */
export type MemoryResult =
  | {
      kind: "doc";
      content: string;
      hash?: string;
      updatedAt?: string;
      path?: string;
    }
  | {
      kind: "docs";
      docs: { content: string; path: string; updatedAt?: string }[];
    }
  | { kind: "none" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const optional = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

function memoryDoc(value: unknown): MemoryResult {
  if (!(isRecord(value) && typeof value.content === "string")) {
    return { kind: "none" };
  }
  return {
    kind: "doc",
    content: value.content,
    hash: optional(value.hash),
    updatedAt: optional(value.updatedAt),
    path: optional(value.path),
  };
}

/** `get` answers `{memory}`, `list_docs` `{docs}`, and `set`/`set_doc` the saved record itself. */
export function memoryResult(raw: unknown): MemoryResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { kind: "none" };
    }
  }
  if (!isRecord(value)) {
    return { kind: "none" };
  }
  if (Array.isArray(value.docs)) {
    return {
      kind: "docs",
      docs: value.docs.flatMap((doc) =>
        isRecord(doc) &&
        typeof doc.path === "string" &&
        typeof doc.content === "string"
          ? [
              {
                path: doc.path,
                content: doc.content,
                updatedAt: optional(doc.updatedAt),
              },
            ]
          : []
      ),
    };
  }
  return "memory" in value ? memoryDoc(value.memory) : memoryDoc(value);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the one dispatch over the closed Fact vocabulary, a branch per fact
function factOf(
  fact: Fact,
  input: Record<string, unknown>,
  output: string | undefined,
  toolName: string | undefined,
  patch?: string
): string | undefined {
  switch (fact) {
    case "read-lines": {
      if (!output) {
        return undefined;
      }
      const numbered = output.split("\n").filter(numberedLine).length;
      const lines =
        numbered || output.split("\n").filter((line) => line.trim()).length;
      return lines > 0 ? `${lines} lines` : undefined;
    }
    case "grep-count": {
      if (!output) {
        return undefined;
      }
      const found = foundLine(firstLine(output) ?? "");
      if (found) {
        return `${found[0]} ${found[1].toLowerCase()}`;
      }
      if (input.output_mode !== "count") {
        return undefined;
      }
      let total = 0;
      for (const line of output.split("\n")) {
        const tally = countTail(line);
        if (tally) {
          total += Number(tally);
        }
      }
      return total > 0 ? `${total} matches` : undefined;
    }
    case "glob-files": {
      if (
        !output ||
        output.trim().slice(0, 14).toLowerCase() === "no files found"
      ) {
        return undefined;
      }
      const files = output.split("\n").filter((line) => line.trim()).length;
      return files > 0 ? `${files} files` : undefined;
    }
    case "edit-lines":
    case "patch-lines": {
      const changes = fileChanges(input, toolName, patch);
      if (!changes.length) {
        return undefined;
      }
      const added = changes.reduce((sum, change) => sum + change.added, 0);
      const removed = changes.reduce((sum, change) => sum + change.removed, 0);
      return `+${added} −${removed}`;
    }
    case "write-lines": {
      const changes = fileChanges(input, toolName, patch);
      return changes.length
        ? `+${changes.reduce((sum, change) => sum + change.added, 0)}`
        : undefined;
    }
    case "content-lines":
      return typeof input.content === "string"
        ? `${lineCount(input.content)} lines`
        : undefined;
    case "memory-doc-lines": {
      const parsed = memoryResult(output);
      return parsed.kind === "doc"
        ? `${lineCount(parsed.content)} lines`
        : undefined;
    }
    case "memory-docs": {
      const parsed = memoryResult(output);
      return parsed.kind === "docs" ? `${parsed.docs.length} docs` : undefined;
    }
    default:
      return undefined;
  }
}

/** Names only this network resolves get no favicon: the hub never fetches inside the network. */
const LOCAL_ZONES = [
  "localhost",
  "local",
  "internal",
  "lan",
  "home.arpa",
  "ts.net",
  "test",
  "example",
  "invalid",
];

/** Whether `host` is a public name the hub's `/api/favicon` reads an icon for. */
export function faviconReachable(host: string): boolean {
  return (
    host.includes(".") &&
    !host.includes(":") &&
    !isAddress(host) &&
    // No top-level label is all digits: "3.100", an address cut short, is not a public name.
    !endsInNumber(host) &&
    !LOCAL_ZONES.some((zone) => host === zone || host.endsWith(`.${zone}`))
  );
}

/**
 * The site's icon as the user's own hub serves it: a path on the hub
 * (`/api/favicon`), for a public host. No third party is ever asked.
 */
export const faviconUrl = (host: string): string | undefined =>
  faviconReachable(host)
    ? `/api/favicon?host=${encodeURIComponent(host)}`
    : undefined;

const TLD_LABELS = new Set(["ai", "com", "io", "org", "net"]);

/**
 * `mcp__claude_ai_Gmail__…` carries the server's domain with the dots beaten
 * out of it, the only place an MCP tool name says who answers it. Two or
 * three labels ending in a real TLD is a domain; anything else is a name.
 */
export function mcpServer(server: string): { label: string; host?: string } {
  const parts = server.split(SERVER_SEPARATORS).filter(Boolean);
  const at =
    parts.length <= 3
      ? parts.findIndex(
          (part, i) => i > 0 && TLD_LABELS.has(part.toLowerCase())
        )
      : -1;
  if (at < 1) {
    return { label: parts.join(" ") };
  }
  const host = parts
    .slice(0, at + 1)
    .join(".")
    .toLowerCase();
  const rest = parts.slice(at + 1);
  return { label: rest.length ? `${host} ${rest.join(" ")}` : host, host };
}

function variantFor(
  kind: ToolKind,
  own: string,
  status: ToolStatus,
  input: Record<string, unknown>,
  patch?: string
): Variant | undefined {
  return kind.variants?.find(
    ({ when }) =>
      (when.names === undefined || when.names.includes(own)) &&
      (when.status === undefined || when.status === status) &&
      (when.action === undefined || input.action === when.action) &&
      (when.patch === undefined || when.patch === (patch !== undefined))
  );
}

/**
 * The sentence a call's row reads as. `result` is only read when the call
 * succeeded: a failed call's output belongs to its refusal, a running one has none.
 * `serverHost`: the host an MCP server is configured at, where the session knows it.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the one reading of a sentence's data: a branch per label rule and per optional part
export function describeTool(
  toolName: string | undefined,
  rawInput: Record<string, unknown> | undefined,
  result: string | undefined,
  status: ToolStatus,
  patch?: string,
  serverHost?: (server: string) => string | undefined
): ToolSentence {
  const name = toolName ?? "Tool";
  const input = rawInput ?? {};
  const output = status === "success" ? result : undefined;
  const kind = toolKind(name);
  const mcp = mcpParts(name);
  const own = (mcp ? mcp.tool : name).toLowerCase();
  const variant = variantFor(kind, own, status, input, patch);
  const sentence = variant?.sentence ?? kind.sentence;
  let label = "";
  const rule = sentence.label;
  if (rule === "tool-name") {
    label = humanize(mcp ? mcp.tool : name);
  } else if (typeof rule === "string") {
    label = rule;
  } else if (rule && "template" in rule) {
    const slot = read(rule.slot, input);
    label = slot ? rule.template.replace("{}", slot) : rule.fallback;
  } else if (rule) {
    label = read(rule.from, input) ?? "";
  }
  const described: ToolSentence = {
    kind,
    renderer: variant?.renderer ?? kind.renderer,
    label,
    object: read(sentence.object, input),
    objectMono: sentence.objectMono ?? true,
    detail: read(sentence.detail, input),
    detailMono: sentence.detailMono ?? false,
    chip:
      sentence.chip && input[sentence.chip.field] === true
        ? sentence.chip.text
        : undefined,
    fact: sentence.fact
      ? factOf(sentence.fact, input, output, name, patch)
      : undefined,
    factDiff: sentence.factDiff ?? false,
    faviconHost: read(sentence.favicon, input),
    secondLine: sentence.secondLine ? firstLine(output) : undefined,
  };
  if (!mcp) {
    return described;
  }
  // Which server answered is the one thing the sentence cannot say for itself.
  const identity = mcpServer(mcp.server);
  return {
    ...described,
    chip: described.chip ?? identity.label,
    faviconHost:
      described.faviconHost ?? serverHost?.(mcp.server) ?? identity.host,
  };
}

/** One input field of a fields body, and its value as text. */
export interface Field {
  key: string;
  text: string;
}

/** Name order by UTF-16 code unit, which every client can reproduce exactly. */
const byName = (a: string, b: string): number => (a < b ? -1 : Number(a > b));

/** `1e-7`, never `1e-07`: an exponent written without leading zeros, but its last digit. */
function exponentTrimmed(text: string): string {
  const e = text.indexOf("e");
  const sign = text[e + 1];
  if (e < 0 || (sign !== "+" && sign !== "-")) {
    return text;
  }
  const run = digitsAt(text, e + 2);
  let zeros = 0;
  while (zeros < run && text[e + 2 + zeros] === "0") {
    zeros += 1;
  }
  const taken = zeros < run ? zeros : zeros - 1;
  return taken > 0 ? text.slice(0, e + 2) + text.slice(e + 2 + taken) : text;
}

/**
 * A value in the one JSON form a fields body writes, on every client: two
 * spaces a level, `"key": value`, every object's keys in name order (the
 * order a call wrote them is not one the native app ever sees), an empty
 * object or list as `{}` or `[]`. The native app writes it by the same
 * steps (ToolDescriptor.json).
 */
export function writeJson(value: unknown, indent = ""): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? exponentTrimmed(String(value)) : "null";
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return value.length
      ? `[\n${value.map((item) => inner + writeJson(item, inner)).join(",\n")}\n${indent}]`
      : "[]";
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort(byName);
    return keys.length
      ? `{\n${keys.map((key) => `${inner}${JSON.stringify(key)}: ${writeJson(value[key], inner)}`).join(",\n")}\n${indent}}`
      : "{}";
  }
  return JSON.stringify(String(value));
}

/** A field's value as text: a string as written, anything else in the one JSON form. */
const asText = (value: unknown): string =>
  typeof value === "string" ? value : writeJson(value);

/** A fields body's input fields, in the order the call wrote them. */
export function inputFields(raw: unknown): Field[] {
  if (!isRecord(raw)) {
    return [];
  }
  return fieldOrder(Object.keys(raw)).map((key) => ({
    key,
    text: asText(raw[key]),
  }));
}

/**
 * The order a fields body lists a call's input in, the same on every client:
 * the fields that name what the call is about ({@link PRIMARY_FIELDS}, in
 * their order), then the rest by name. Not the order the call wrote them: a
 * client that decodes JSON into a dictionary (the native app) never sees that.
 */
export function fieldOrder(keys: string[]): string[] {
  const rank = (key: string): number => {
    const at = PRIMARY_FIELDS.indexOf(key);
    return at === -1 ? PRIMARY_FIELDS.length : at;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b) || byName(a, b));
}

/** A result as a fields body shows it: its head, and how much of it is not shown. */
export function resultField(
  raw: unknown
): { text: string; more: number } | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const text = asText(raw);
  if (!text.trim()) {
    return undefined;
  }
  return text.length > RESULT_CAP
    ? { text: text.slice(0, RESULT_CAP), more: text.length - RESULT_CAP }
    : { text, more: 0 };
}

/** A failed call's reason, its harness's tags off. */
export function refusalOf(
  result: { text: string } | undefined
): string | undefined {
  return (
    result?.text.replace(new RegExp(REFUSAL_TAGS, "g"), "").trim() || undefined
  );
}

/** The input field a prose body sets (a skill's arguments). */
export const PROSE_FIELD = "args";

/** Whether an opened call has anything to show in its renderer's body. */
export function hasBody(
  renderer: Renderer,
  failed: boolean,
  input: Record<string, unknown> | undefined,
  raw: unknown,
  toolName: string | undefined,
  patch?: string
): boolean {
  const result = resultField(raw);
  switch (renderer) {
    case "preview":
      return false;
    case "diff":
      return (
        fileChanges(input, toolName, patch).length > 0 ||
        (failed && !!refusalOf(result))
      );
    case "memory": {
      if (failed) {
        return !!result;
      }
      switch (input?.action) {
        case "set":
        case "set_doc":
          return typeof input.content === "string";
        case "remove_doc":
          return true;
        case "get":
          return memoryResult(raw).kind === "doc";
        case "list_docs":
          return memoryResult(raw).kind === "docs";
        default:
          return false;
      }
    }
    case "prose":
      return failed
        ? inputFields(input).length > 0 || !!result
        : !blank(input?.[PROSE_FIELD]);
    default:
      return inputFields(input).length > 0 || !!result;
  }
}
