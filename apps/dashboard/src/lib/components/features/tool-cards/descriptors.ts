/**
 * The vocabulary every tool call is read through. One call in, one sentence
 * out — what it did, to what, and what came back — so no row ever falls back
 * to a JSON dump. Families the SDK actually emits get a hand-written sentence;
 * everything else lands on the params table, which is the dignity floor.
 */
import type { Component } from "svelte";
import { rootDomain } from "$lib/cawco/mcp";
import {
  IconBook,
  IconToolCode,
  IconToolEdit,
  IconToolFiles,
  IconToolGeneric,
  IconToolMcp,
  IconToolMessage,
  IconToolNavigate,
  IconToolNotebook,
  IconToolQuestion,
  IconToolRead,
  IconToolScreen,
  IconToolSearch,
  IconToolSkill,
  IconToolTask,
  IconToolTerminal,
  IconToolTodo,
  IconToolWeb,
  IconToolWrite,
} from "$lib/icons";

export type ToolStatus = "pending" | "success" | "error";

/** Which body an expanded row opens: each family has one shape worth reading. */
export type ExpandedKind =
  | "bash"
  | "diff"
  | "read"
  | "web"
  | "code"
  | "memory"
  | "skill"
  | "params";

export interface ToolDescriptor {
  /** A short aside after the sentence: `background`, an MCP server's name. */
  chip?: string;
  /** The family's ink — a `--tool-*` class. What the step is, never how it went. */
  color: string;
  /** The object's dimmer tail: a parent directory, a search scope, a summary. */
  detail?: string;
  detailIsMono: boolean;
  expanded: ExpandedKind;
  /** What came back, in one measurement. */
  fact?: string;
  factTone?: "muted" | "error" | "diff";
  /** A site icon that stands in for the glyph once it loads. */
  favicon?: string;
  icon: Component;
  /** The verb, in the UI face. Empty when the object is the whole sentence. */
  label: string;
  /** What the verb acted on. */
  object?: string;
  objectIsMono: boolean;
  /** The operator's tail: the first line the call printed. */
  secondLine?: string;
}

export type FamilyId =
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
  | "other";

export interface ToolFamily {
  color: string;
  icon: Component;
  id: FamilyId;
  many: string;
  /** What one call of this kind is, for a group's kind summary. */
  one: string;
}

/**
 * A face and an ink per family. Families that are one act under two names
 * share an ink on purpose — reading and searching are one colour of work,
 * the browser and the network another — so the glyph column groups at a
 * glance instead of reading as nineteen unrelated hues.
 */
const FAMILIES: Record<FamilyId, Omit<ToolFamily, "id">> = {
  bash: {
    icon: IconToolTerminal,
    color: "text-tool-run",
    one: "command",
    many: "commands",
  },
  read: {
    icon: IconToolRead,
    color: "text-tool-read",
    one: "read",
    many: "reads",
  },
  edit: {
    icon: IconToolEdit,
    color: "text-tool-edit",
    one: "edit",
    many: "edits",
  },
  write: {
    icon: IconToolWrite,
    color: "text-tool-write",
    one: "write",
    many: "writes",
  },
  grep: {
    icon: IconToolSearch,
    color: "text-tool-search",
    one: "search",
    many: "searches",
  },
  glob: {
    icon: IconToolFiles,
    color: "text-tool-search",
    one: "listing",
    many: "listings",
  },
  web: {
    icon: IconToolWeb,
    color: "text-tool-web",
    one: "fetch",
    many: "fetches",
  },
  toolsearch: {
    icon: IconToolSearch,
    color: "text-tool-search",
    one: "lookup",
    many: "lookups",
  },
  skill: {
    icon: IconToolSkill,
    color: "text-tool-skill",
    one: "skill",
    many: "skills",
  },
  message: {
    icon: IconToolMessage,
    color: "text-tool-agent",
    one: "message",
    many: "messages",
  },
  screen: {
    icon: IconToolScreen,
    color: "text-tool-web",
    one: "screen step",
    many: "screen steps",
  },
  navigate: {
    icon: IconToolNavigate,
    color: "text-tool-web",
    one: "page",
    many: "pages",
  },
  js: {
    icon: IconToolCode,
    color: "text-tool-run",
    one: "script",
    many: "scripts",
  },
  mcp: {
    icon: IconToolMcp,
    color: "text-tool-mcp",
    one: "call",
    many: "calls",
  },
  memory: {
    icon: IconBook,
    color: "text-tool-plan",
    one: "memory edit",
    many: "memory edits",
  },
  task: {
    icon: IconToolTask,
    color: "text-tool-agent",
    one: "delegation",
    many: "delegations",
  },
  todo: {
    icon: IconToolTodo,
    color: "text-tool-plan",
    one: "plan",
    many: "plans",
  },
  notebook: {
    icon: IconToolNotebook,
    color: "text-tool-edit",
    one: "cell edit",
    many: "cell edits",
  },
  question: {
    icon: IconToolQuestion,
    color: "text-tool-ask",
    one: "question",
    many: "questions",
  },
  // Not "step": the header already counts steps, and a summary that repeats
  // the count's own word ("3 steps · 2 steps") says nothing. An unknown tool
  // has no family to be, so it takes the muted ink rather than borrowing one.
  other: {
    icon: IconToolGeneric,
    color: "text-muted-foreground",
    one: "action",
    many: "actions",
  },
};

const EDIT_TOOLS = new Set([
  "edit",
  "multiedit",
  "str_replace_editor",
  "str_replace",
  "file_edit",
]);
const WRITE_TOOLS = new Set(["write", "create_file", "write_file"]);

const MCP_NAME = /^mcp__(.+?)__(.+)$/;
const NUMBERED_LINE = /^\s*\d+→/;
const GREP_FOUND_COUNT = /^Found (\d+) (\w+)/i;
const GREP_TALLY = /:(\d+)\s*$/;
const NO_FILES_FOUND = /^no files found/i;
const LEADING_WWW = /^www\./;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const NUMERIC_TLD = /\.\d+$/;
const SERVER_LABEL_SEPARATORS = /[_\-.]+/;
const TRAILING_SLASH = /\/$/;
const ERROR_LINE =
  /^\s*(error\b|fatal\b|traceback\b|exit code\b|command failed\b)|:\s*error\b/i;

/**
 * The one classifier: both the sentence and the group header dispatch on it.
 * An MCP tool is classified on its own name first — the browser's `computer`
 * and `navigate` are the same act whether or not a server carried them.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the single dispatch table from raw tool name to FamilyId; not refactored in this lint pass
export function familyId(toolName: string | undefined): FamilyId {
  const raw = toolName ?? "";
  const mcp = MCP_NAME.exec(raw);
  const name = (mcp ? mcp[2] : raw).toLowerCase();
  if (!name) {
    return "other";
  }
  if (name === "bash") {
    return "bash";
  }
  if (name === "read") {
    return "read";
  }
  if (EDIT_TOOLS.has(name)) {
    return "edit";
  }
  if (WRITE_TOOLS.has(name)) {
    return "write";
  }
  if (name === "grep") {
    return "grep";
  }
  if (name === "glob") {
    return "glob";
  }
  if (name === "webfetch" || name === "websearch") {
    return "web";
  }
  if (name === "toolsearch") {
    return "toolsearch";
  }
  if (name === "skill") {
    return "skill";
  }
  // The same call is the Task tool and the Agent tool, depending on the harness.
  if (name === "task" || name === "agent") {
    return "task";
  }
  if (name === "todowrite") {
    return "todo";
  }
  if (name === "notebookedit") {
    return "notebook";
  }
  if (name === "askuserquestion") {
    return "question";
  }
  if (name === "sendmessage") {
    return "message";
  }
  if (
    name === "computer" ||
    name === "show_image" ||
    name === "cawco_show_image"
  ) {
    return "screen";
  }
  if (name === "navigate") {
    return "navigate";
  }
  if (name === "manage_memory" || name === "cawco_manage_memory") {
    return "memory";
  }
  if (name === "javascript_tool" || name === "repl") {
    return "js";
  }
  return mcp ? "mcp" : "other";
}

export function toolFamily(toolName: string | undefined): ToolFamily {
  const id = familyId(toolName);
  return { id, ...FAMILIES[id] };
}

export function isWriteTool(toolName: string | undefined): boolean {
  return WRITE_TOOLS.has((toolName ?? "").toLowerCase());
}

export function isFileDiffTool(toolName: string | undefined): boolean {
  const name = (toolName ?? "").toLowerCase();
  return EDIT_TOOLS.has(name) || WRITE_TOOLS.has(name);
}

/** The old and new sides a diff view needs, or null when the input has none. */
export interface FileChange {
  filePath: string;
  newContent: string;
  oldContent: string;
}

const textOf = (value: unknown): string =>
  typeof value === "string" ? value : "";

/**
 * The file changes an edit or write call made, one per replacement. The
 * harnesses name the same inputs three ways: Claude Code `file_path` with
 * `old_string`/`new_string` (MultiEdit: an `edits` list of those); OpenCode
 * `filePath` with `oldString`/`newString`, and `content` for a write; pi
 * `path` with an `edits` list of `oldText`/`newText`.
 */
export function getDiffInfo(
  input: Record<string, unknown> | undefined,
  toolName: string | undefined
): FileChange[] {
  const filePath =
    str(input?.file_path) ??
    str(input?.filePath) ??
    str(input?.path) ??
    str(input?.filename);
  if (!(input && filePath)) {
    return [];
  }
  if (isWriteTool(toolName)) {
    return [{ filePath, oldContent: "", newContent: textOf(input.content) }];
  }
  const edits: unknown[] = Array.isArray(input.edits) ? input.edits : [input];
  return edits.map((edit) => {
    const each = (edit ?? {}) as Record<string, unknown>;
    return {
      filePath,
      oldContent: textOf(
        each.old_string ?? each.old_str ?? each.oldString ?? each.oldText
      ),
      newContent: textOf(
        each.new_string ?? each.new_str ?? each.newString ?? each.newText
      ),
    };
  });
}

/** Past this a line is a payload, not a sentence — and it only has to truncate. */
const LINE_CAP = 200;

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const int = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;

/** The last segment of a path — what tells two checkouts apart. */
export const pathLeaf = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;

const pathDir = (path: string): string | undefined => {
  const cut = path.lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : undefined;
};

const oneLine = (text: string): string =>
  text.replace(/\s+/g, " ").trim().slice(0, LINE_CAP);

const firstLine = (result: string | undefined): string | undefined => {
  if (!result) {
    return undefined;
  }
  for (const line of result.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed.slice(0, LINE_CAP);
    }
  }
  return undefined;
};

const countLines = (text: string): number =>
  text.split("\n").filter((line) => line.trim().length > 0).length;

const spanLines = (text: string | undefined): number =>
  text ? text.split("\n").length : 0;

/** Read answers with `␣␣␣␣1→…`; anything appended to that is not the file. */
function readFact(result: string | undefined): string | undefined {
  if (!result) {
    return undefined;
  }
  const numbered = result
    .split("\n")
    .filter((line) => NUMBERED_LINE.test(line)).length;
  const lines = numbered || countLines(result);
  return lines > 0 ? `${lines} lines` : undefined;
}

/**
 * Grep answers in four shapes and only two of them count anything out loud.
 * A count that is not there in the result is left off rather than inferred.
 */
function grepFact(
  input: Record<string, unknown> | undefined,
  result: string | undefined
): string | undefined {
  if (!result) {
    return undefined;
  }
  const found = GREP_FOUND_COUNT.exec(firstLine(result) ?? "");
  if (found) {
    return `${found[1]} ${found[2].toLowerCase()}`;
  }
  if (input?.output_mode !== "count") {
    return undefined;
  }
  let total = 0;
  for (const line of result.split("\n")) {
    const tally = GREP_TALLY.exec(line);
    if (tally) {
      total += Number(tally[1]);
    }
  }
  return total > 0 ? `${total} matches` : undefined;
}

function globFact(result: string | undefined): string | undefined {
  if (!result || NO_FILES_FOUND.test(result.trim())) {
    return undefined;
  }
  const files = countLines(result);
  return files > 0 ? `${files} files` : undefined;
}

const hostOf = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname.replace(LEADING_WWW, "");
  } catch {
    return undefined;
  }
};

/**
 * Names only this network resolves: the machine's own (`localhost`, a bare
 * hostname), an address, mDNS, the tailnet's MagicDNS, private zones, and the
 * reserved test names. The favicon service cannot fetch them and answers each
 * with a 404, so they get no favicon rather than a failed one.
 */
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
const reachable = (host: string): boolean =>
  host.includes(".") &&
  !host.includes(":") &&
  !IPV4.test(host) &&
  // No top-level label is all digits: "3.100", the tail of an address a
  // command line cut short, is not a public name either.
  !NUMERIC_TLD.test(host) &&
  !LOCAL_ZONES.some((zone) => host === zone || host.endsWith(`.${zone}`));

/** The site's icon at chip scale: one URL, s2 answers for every public host. */
const faviconUrl = (host: string): string | undefined =>
  reachable(host)
    ? `https://www.google.com/s2/favicons?domain=${host}&sz=32`
    : undefined;

/**
 * `mcp__claude_ai_Gmail__…` carries the server's domain with the dots beaten
 * out of it, which is the only place an MCP tool name says who answers it.
 * Two or three labels ending in a real TLD is a domain; anything else is just
 * a name, and gets no favicon rather than a guessed one.
 */
const TLD_LABELS = new Set(["ai", "com", "io", "org", "net"]);

function readServer(server: string): { label: string; host?: string } {
  const parts = server.split(SERVER_LABEL_SEPARATORS).filter(Boolean);
  const cut =
    parts.length <= 3
      ? parts.findIndex(
          (part, i) => i > 0 && TLD_LABELS.has(part.toLowerCase())
        )
      : -1;
  if (cut < 1) {
    return { label: parts.join(" ") };
  }
  const host = parts
    .slice(0, cut + 1)
    .join(".")
    .toLowerCase();
  const rest = parts.slice(cut + 1);
  return { label: rest.length ? `${host} ${rest.join(" ")}` : host, host };
}

/** `list_sessions` / `listSessions` → `List sessions`. */
function humanize(name: string): string {
  const words = name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Fields that name the thing a call is about, in the order they answer it. */
const PRIMARY_KEYS = [
  "file_path",
  "path",
  "url",
  "query",
  "pattern",
  "command",
  "description",
];

function primaryParam(
  input: Record<string, unknown> | undefined
): string | undefined {
  for (const key of PRIMARY_KEYS) {
    const named = str(input?.[key]);
    if (named) {
      return named;
    }
  }
  // Nothing named it: the longest string still short enough to be an
  // identifier rather than a payload.
  let best: string | undefined;
  for (const value of Object.values(input ?? {})) {
    const text = str(value);
    if (!text || text.length > 80) {
      continue;
    }
    if (!best || text.length > best.length) {
      best = text;
    }
  }
  return best;
}

/**
 * The sentence a row reads as. `result` is only consulted when the call
 * actually succeeded — a failed call's output belongs to the error line, and
 * a running one has none.
 */
export function describeTool(
  toolName: string | undefined,
  input: Record<string, unknown> | undefined,
  result: string | undefined,
  status: ToolStatus,
  /** The configured URL's host for an MCP server segment, when the session knows it. */
  serverHost?: (server: string) => string | undefined
): ToolDescriptor {
  const described = sentence(toolName, input, result, status);
  const server = MCP_NAME.exec(toolName ?? "")?.[1];
  if (!server) {
    return described;
  }
  // Which server answered is the one thing the sentence cannot say for itself.
  const identity = readServer(server);
  // An MCP endpoint sits on a subdomain (`mcp.exa.ai`, `api.mobbin.com`) that
  // s2 only has its placeholder globe for; the site's icon lives at its root.
  const configured = serverHost?.(server);
  const host = configured ? rootDomain(configured) : identity.host;
  return {
    ...described,
    chip: described.chip ?? identity.label,
    favicon: described.favicon ?? (host ? faviconUrl(host) : undefined),
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the per-family switch that builds each tool's one-sentence description; not refactored in this lint pass
function sentence(
  toolName: string | undefined,
  input: Record<string, unknown> | undefined,
  result: string | undefined,
  status: ToolStatus
): ToolDescriptor {
  const name = toolName ?? "Tool";
  const output = status === "success" ? result : undefined;
  const family = familyId(name);
  const base = {
    objectIsMono: true,
    detailIsMono: false,
    icon: FAMILIES[family].icon,
    color: FAMILIES[family].color,
  } as const;

  switch (family) {
    case "bash": {
      const command = str(input?.command);
      return {
        ...base,
        // No description to lead with: the command itself is the sentence.
        label: str(input?.description) ?? "",
        object: command ? oneLine(command) : undefined,
        chip: input?.run_in_background === true ? "background" : undefined,
        secondLine: firstLine(output),
        expanded: "bash",
      };
    }

    case "read": {
      const path = str(input?.file_path) ?? str(input?.path);
      const offset = int(input?.offset);
      const limit = int(input?.limit);
      let span = "";
      if (offset !== undefined) {
        span =
          limit === undefined ? `:${offset}+` : `:${offset}–${offset + limit}`;
      }
      return {
        ...base,
        label: "Read",
        object: path ? `${pathLeaf(path)}${span}` : undefined,
        detail: path ? pathDir(path) : undefined,
        detailIsMono: true,
        fact: readFact(output),
        expanded: "read",
      };
    }

    case "edit":
    case "write": {
      const write = family === "write";
      const changes = getDiffInfo(input, toolName);
      let added = 0;
      let removed = 0;
      for (const change of changes) {
        added += spanLines(change.newContent);
        removed += spanLines(change.oldContent);
      }
      const path = changes[0]?.filePath;
      // A failed call changed nothing: it says so, and carries no line count.
      if (status === "error") {
        return {
          ...base,
          label: write ? "Write failed" : "Edit failed",
          object: path ? pathLeaf(path) : undefined,
          expanded: "diff",
        };
      }
      return {
        ...base,
        label: write ? "Wrote" : "Edited",
        object: path ? pathLeaf(path) : undefined,
        fact: write ? `+${added}` : `+${added} −${removed}`,
        factTone: "diff",
        expanded: "diff",
      };
    }

    case "grep": {
      const pattern = str(input?.pattern);
      const scope = str(input?.path);
      return {
        ...base,
        label: "Searched",
        object: pattern ? `/${oneLine(pattern)}/` : undefined,
        detail: scope ? pathLeaf(scope) : undefined,
        detailIsMono: true,
        fact: grepFact(input, output),
        secondLine: firstLine(output),
        expanded: "read",
      };
    }

    case "glob":
      return {
        ...base,
        label: "Listed",
        object: str(input?.pattern) ?? str(input?.glob),
        fact: globFact(output),
        expanded: "read",
      };

    case "web": {
      const search = name.toLowerCase() === "websearch";
      const url = str(input?.url);
      const host = hostOf(url);
      let label = "Fetched";
      if (search) {
        label = "Searched the web";
      } else if (host) {
        label = `Fetched ${host}`;
      }
      let object: string | undefined;
      if (search) {
        object = str(input?.query);
      } else if (url) {
        object = oneLine(url);
      }
      return {
        ...base,
        label,
        object,
        favicon: host ? faviconUrl(host) : undefined,
        secondLine: firstLine(output),
        expanded: "web",
      };
    }

    case "toolsearch":
      return {
        ...base,
        label: "Looked up tools",
        object: str(input?.query),
        secondLine: firstLine(output),
        expanded: "params",
      };

    case "skill": {
      const skill = str(input?.skill);
      const args = str(input?.args);
      return {
        ...base,
        label: "Ran skill",
        object: skill ? `/${skill}` : undefined,
        detail: args ? oneLine(args) : undefined,
        expanded: "skill",
      };
    }

    case "message": {
      const to = str(input?.to) ?? str(input?.agent_id) ?? str(input?.name);
      const said =
        str(input?.prompt) ?? str(input?.message) ?? str(input?.description);
      return {
        ...base,
        label: "Messaged",
        object: to,
        detail: said ? oneLine(said) : undefined,
        expanded: "params",
      };
    }

    case "screen": {
      const normalized = MCP_NAME.exec(name)?.[2] ?? name;
      if (normalized === "show_image" || normalized === "cawco_show_image") {
        // Live rows describe the call before its arguments have streamed in.
        const path = str(input?.path);
        return {
          ...base,
          label: "Show",
          object: path ? pathLeaf(path) : undefined,
          detail: path ? pathDir(path) : undefined,
          detailIsMono: true,
          expanded: "params",
        };
      }
      const action = str(input?.action);
      const at = Array.isArray(input?.coordinate)
        ? `(${(input.coordinate as unknown[]).join(", ")})`
        : undefined;
      return {
        ...base,
        label: action ? `Screen · ${action}` : "Screen",
        object:
          at ??
          (str(input?.text) ? oneLine(str(input?.text) as string) : undefined),
        expanded: "params",
      };
    }

    case "navigate": {
      const url = str(input?.url);
      const host = hostOf(url);
      let target = url ? oneLine(url) : undefined;
      if (url && host) {
        try {
          target = `${host}${new URL(url).pathname.replace(TRAILING_SLASH, "")}`;
        } catch {
          /* keep the raw url */
        }
      }
      return {
        ...base,
        label: "Opened",
        object: target,
        favicon: host ? faviconUrl(host) : undefined,
        expanded: "params",
      };
    }

    case "js": {
      const description = str(input?.description);
      const code = codeOf(input);
      return {
        ...base,
        label: "Ran JavaScript",
        // Snippets routinely open on a blank line; lead with the first real one.
        object: description ? undefined : firstLine(code),
        detail: description,
        secondLine: firstLine(output),
        expanded: "code",
      };
    }

    case "memory":
      return { ...base, ...memorySentence(input, output), expanded: "memory" };

    case "mcp": {
      const tool = MCP_NAME.exec(name)?.[2];
      return {
        ...base,
        label: humanize(tool ?? name),
        objectIsMono: false,
        secondLine: firstLine(output),
        expanded: "params",
      };
    }

    default: {
      const primary = primaryParam(input);
      return {
        ...base,
        label: humanize(name),
        object: primary ? oneLine(primary) : undefined,
        secondLine: firstLine(output),
        expanded: "params",
      };
    }
  }
}

const lineFact = (text: string | undefined): string | undefined =>
  text === undefined ? undefined : `${spanLines(text)} lines`;

/** One sentence per memory action; the live row before its arguments have
 *  streamed in has no action yet and reads as the tool itself. */
function memorySentence(
  input: Record<string, unknown> | undefined,
  output: string | undefined
): Pick<
  ToolDescriptor,
  "label" | "object" | "detail" | "detailIsMono" | "fact"
> {
  const path = str(input?.path);
  const content =
    typeof input?.content === "string" ? input.content : undefined;
  switch (input?.action) {
    case "get": {
      const parsed = memoryResult(output);
      return {
        label: "Read fleet memory",
        object: "CLAUDE.md",
        detailIsMono: false,
        fact: parsed.kind === "doc" ? lineFact(parsed.content) : undefined,
      };
    }
    case "set":
      return {
        label: "Updated fleet memory",
        object: "CLAUDE.md",
        detailIsMono: false,
        fact: lineFact(content),
      };
    case "list_docs": {
      const parsed = memoryResult(output);
      return {
        label: "Listed memory docs",
        detailIsMono: false,
        fact: parsed.kind === "docs" ? `${parsed.docs.length} docs` : undefined,
      };
    }
    case "set_doc":
      return {
        label: "Wrote memory doc",
        object: path ? pathLeaf(path) : undefined,
        detail: path ? pathDir(path) : undefined,
        detailIsMono: true,
        fact: lineFact(content),
      };
    case "remove_doc":
      return {
        label: "Removed memory doc",
        object: path ? pathLeaf(path) : undefined,
        detail: path ? pathDir(path) : undefined,
        detailIsMono: true,
      };
    default:
      return { label: "Fleet memory", detailIsMono: false };
  }
}

export interface MemoryDoc {
  content: string;
  path: string;
  updatedAt?: string;
}

/** What a `manage_memory` call answered with, read off the hub's JSON. */
export type MemoryResult =
  | {
      kind: "doc";
      content: string;
      hash?: string;
      updatedAt?: string;
      path?: string;
    }
  | { kind: "docs"; docs: MemoryDoc[] }
  | { kind: "none" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optStr = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

function memoryDoc(value: unknown): MemoryResult {
  if (!(isRecord(value) && typeof value.content === "string")) {
    return { kind: "none" };
  }
  return {
    kind: "doc",
    content: value.content,
    hash: optStr(value.hash),
    updatedAt: optStr(value.updatedAt),
    path: optStr(value.path),
  };
}

/**
 * `get` answers `{memory}`, `list_docs` `{docs}`, and `set`/`set_doc` the
 * saved record itself. The result arrives as the JSON text the tool printed;
 * anything that does not parse into one of those shapes is `none`.
 */
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
      docs: value.docs.flatMap((doc): MemoryDoc[] =>
        isRecord(doc) &&
        typeof doc.path === "string" &&
        typeof doc.content === "string"
          ? [
              {
                path: doc.path,
                content: doc.content,
                updatedAt: optStr(doc.updatedAt),
              },
            ]
          : []
      ),
    };
  }
  if ("memory" in value) {
    return memoryDoc(value.memory);
  }
  return memoryDoc(value);
}

/** Where a JavaScript call keeps its source: `code` in the REPL, `text` in
 *  the browser's, since each names the same field differently. */
export const codeOf = (
  input: Record<string, unknown> | undefined
): string | undefined =>
  str(input?.code) ?? str(input?.text) ?? str(input?.script);

/** The tunnel hands results back as strings; anything else is shown as JSON. */
export function resultText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.length > 0 ? value : undefined;
  }
  return JSON.stringify(value, null, 2);
}

/** The first line of what went wrong, for a failed row's second line. */
export function errorLine(result: string | undefined): string | undefined {
  return firstLine(result);
}

/**
 * Which lines of a failed command are the failure. The output itself stays in
 * the foreground — only the part that names the failure takes the error hue,
 * so a red well never swallows the thing the operator came to read.
 */
export function isErrorLine(line: string): boolean {
  return ERROR_LINE.test(line);
}
