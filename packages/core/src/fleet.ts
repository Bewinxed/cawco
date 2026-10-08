/**
 * Fleet configuration (NEW.md §11): the MCP servers, skill plugins and
 * subagents every machine's Claude Code should have. The hub owns the desired
 * state; a
 * machine-scoped `syncFleetConfig` control applies it and answers with what
 * the machine really has. Unlike the tool catalog (tools.ts), none of this is
 * a code catalog — the entries are the user's own rows.
 */

import type {
  HarnessKind,
  McpHttpServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from "./harness";
import type { FleetHook } from "./hooks";

/**
 * Where a fleet row applies, in Claude Code's own vocabulary:
 *
 * - `user` — every machine, every project. MCP goes to `~/.claude.json`'s
 *   top-level `mcpServers`, skills to `~/.claude/skills/`, plugins install
 *   `--scope user`. The default, and what most rows want.
 * - `local` — one project, privately: `~/.claude.json`'s
 *   `projects["<cwd>"].mcpServers`, the map Claude Code already keeps per
 *   checkout and git never sees; plugins `--scope local`. What a
 *   project-bound row should be unless the reader asks to share it.
 * - `project` — one project, shared with whoever clones it: `.mcp.json` at
 *   the repo root, plugins `--scope project`. It writes inside the working
 *   tree, so it is never the default.
 *
 * Skills have no `local` in Claude Code, so a project-bound skill lands in
 * `<cwd>/.claude/skills/` under either scope.
 */
export type FleetScope = "user" | "project" | "local";

/**
 * What binds a row to a place. An absent `scope` reads as `user`, so every
 * row written before scopes existed still means what it meant.
 */
export interface FleetPlacement {
  /**
   * The checkout to write into. The hub fills this in as it sends a sync —
   * a daemon never resolves a project id, and a machine only ever receives
   * the project rows that live on it.
   */
  cwd?: string;
  /** The hub `projects` row this is bound to. Required unless `user`. */
  projectId?: string;
  scope?: FleetScope;
}

/**
 * A serializable MCP server definition — the SDK's own config shapes minus the
 * in-process `sdk` kind, which cannot cross a wire. Stored verbatim in the
 * hub and written verbatim into `~/.claude.json`; `${VAR}` expansion inside
 * is the CLI's own affair.
 */
export type FleetMcpConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig;

/** One MCP server the fleet should have, keyed by the name sessions see. */
export interface FleetMcpServer extends FleetPlacement {
  /** Hub-owned sign-in; credentials stay in the hub database. */
  auth?: {
    mode: "direct" | "oauth";
    state: "signed-in" | "needs-auth" | "failed";
    detail?: string;
  };
  config: FleetMcpConfig;
  /** Disabled rows stay in the hub but are removed from the machines. */
  enabled: boolean;
  name: string;
  /** The config points at the hub's authenticated forwarder. */
  proxied?: boolean;
}

/** OAuth redirects finish on the computer running the browser. */
export const CAWCO_MCP_CALLBACK_PORT = 43_879;

/**
 * Where CawCo publishes its shared OAuth client: a metadata document, and the
 * page that hands a sign-in back to the install that started it. Used only for
 * a provider that identifies clients by such a document and has no dynamic
 * registration; every other provider redirects straight to the install.
 */
export const CAWCO_OAUTH_URL = "https://cawco.dev/oauth";

/**
 * The dashboard page a sign-in is handed back to, on whatever address the
 * person reaches their hub by. cawco.dev/oauth/callback sends the browser
 * there, so site/src/oauth/handoff.ts names the same path; the site's build
 * stops if the two differ.
 */
export const MCP_OAUTH_RETURN_PATH = "/oauth/mcp";

/**
 * One linked plugin marketplace. `source` is whatever
 * `claude plugin marketplace add` accepts — `owner/repo`, a git URL, a
 * marketplace.json URL — passed through verbatim.
 */
export interface FleetMarketplace extends FleetPlacement {
  name: string;
  source: string;
}

/**
 * One installed plugin. `id` is the CLI's own `plugin@marketplace` form.
 *
 * `hash`, `bytes` and `error` are what the HUB resolved this row to, and they
 * ride the dashboard's read only — the copy a machine is sent carries the
 * files themselves ({@link FleetPluginPayload}) and has no use for the
 * bookkeeping. `error` is a hub-side failure and a different fact from a
 * machine's `failed` in {@link FleetSyncReport.plugins}: one says the bytes
 * were never fetched, the other says a machine would not take them.
 */
export interface FleetPlugin extends FleetPlacement {
  /** Decoded size of the resolved files, for the dashboard to show. */
  bytes?: number;
  /** Disabled rows are uninstalled from the machines, not merely disabled. */
  enabled: boolean;
  /** Why the last resolve at the hub failed, when it did. */
  error?: string;
  /** Content hash of the resolved files; absent until a resolve succeeds. */
  hash?: string;
  id: string;
}

/** One file of a resolved skill; `path` is relative to the skill's directory. */
export interface SkillFile {
  /** Base64 so a skill's scripts and images survive the JSON hop unharmed. */
  contentBase64: string;
  /** The source file had an execute bit; the agent writes it 0755. */
  executable: boolean;
  path: string;
}

/**
 * A skill row as the hub stores and the dashboard reads it: where it came
 * from and what the hub resolved it to. The files themselves stay out of
 * this shape — a catalog read should not weigh megabytes.
 *
 * `source` forms the hub's resolver accepts. Installer CLIs are deliberately
 * never run: an installer is a wrapper around "copy files into
 * `~/.claude/skills/<name>`", and cawco does the copy itself.
 * - `skills:owner/repo[@skill][#ref]` — a skills.sh-style slug (what the
 *   user would have typed after `bunx skills add`). The repo tarball is
 *   walked in the CLI's own discovery order, except `.claude/skills/` wins
 *   over `.agents/skills/` — cawco wants the Claude-tuned variant.
 * - `github:owner/repo[/path][@ref]` — the repo tarball, `path` pointing at
 *   the skill directory.
 * - `npm:package[@version]` — the registry tarball, for the few packages
 *   that embed `skills/<name>/SKILL.md` (most installer packages carry no
 *   content — their CLIs fetch from GitHub at runtime).
 * - a plain URL to a `SKILL.md` (single-file skill).
 */
export interface FleetSkillMeta extends FleetPlacement {
  /** Decoded size of the resolved files, for the dashboard to show. */
  bytes?: number;
  enabled: boolean;
  /** Why the last resolve failed, when it did. */
  error?: string;
  /** Content hash of the resolved files; absent until a resolve succeeds. */
  hash?: string;
  name: string;
  source: string;
}

/**
 * What sync carries per enabled skill: the resolved content, by hash.
 *
 * `files` is ABSENT when the machine's last report said it already holds this
 * exact hash — the config is pushed on every fleet change, to every machine, so
 * sending megabytes a machine already has is the same bytes over and over for
 * a write it will not make. Absent means "you have it", never "it is gone": a
 * payload the fleet stopped carrying is not in the list at all.
 */
export interface FleetSkillPayload extends FleetPlacement {
  files?: SkillFile[];
  /**
   * Set on a targeted push only: overwrite a copy that was edited on the
   * machine. Without it an edited copy is left as it is and reported drifted.
   */
  force?: boolean;
  hash: string;
  name: string;
  /** Hub-owned workflow stub; refuses to replace an operator's skill. */
  workflowId?: string;
}

/**
 * What sync carries per wanted plugin: the resolved content, by hash.
 *
 * The mirror of {@link FleetSkillPayload}, and for the same reason. A plugin
 * used to be a name a machine went and fetched for itself, which made every
 * install depend on that machine's credentials, on the upstream repository
 * still existing and still being public, and on the moment it happened to run.
 * The bytes are resolved once at the hub instead, so a machine installs what
 * every other machine installed, from a directory sync wrote.
 */
export interface FleetPluginPayload {
  /** Decoded size of the resolved files, for the dashboard to show. */
  bytes: number;
  /** Absent when the machine already holds this hash — see {@link FleetSkillPayload}. */
  files?: SkillFile[];
  hash: string;
  /** Which fleet marketplace it came from — the key `FleetPlugin.id` names. */
  marketplace: string;
  /** The plugin's own name, as its marketplace's manifest lists it. */
  name: string;
}

/**
 * One subagent the fleet keeps (NEW.md §11), without the file it is. A subagent
 * is its markdown — YAML front matter over a body that becomes the system
 * prompt — and its identity is the front matter's `name`, not the filename. So
 * cawco stores the file verbatim and re-models none of it.
 */
export interface FleetAgentMeta {
  /** When the hub last stored it, ms epoch. */
  at: number;
  bytes: number;
  /** sha256 hex of `content` — what tells a machine's copy apart from the fleet's. */
  hash: string;
  name: string;
}

/**
 * The whole file. Unlike a skill's, it rides the catalog read: a definition is
 * a page of markdown, and an editor that has to fetch it again is a round trip
 * for nothing.
 *
 * Phase B: daemon `syncFleetConfig` owns convergence; until then the hub pushes
 * over the `fs` verb, which is why this is nowhere in {@link FleetConfig}.
 */
export interface FleetAgent extends FleetAgentMeta {
  content: string;
}

/**
 * A subagent's front matter, as far as anything outside Claude Code reads it:
 * the two fields that make the file usable, and the three a row shows. The file
 * is the interface — every other field passes through untouched, because
 * cawco is not a second schema for it.
 */
export interface AgentFrontMatter {
  description?: string;
  /** `low` … `max`. */
  effort?: string;
  /** `sonnet`/`opus`/`haiku`/`fable`, a full id, or `inherit` — the default. */
  model?: string;
  name?: string;
  tools?: string[];
}

/**
 * What a subagent may be called. Claude Code's own rule: the name is the token
 * a delegation asks for, and a `:` in it collides with the plugin namespace.
 */
export const AGENT_NAME = /^[a-z][a-z0-9-]*$/;

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[^\n]*(?:\n|$)/;
const QUOTED_SCALAR = /^(["'])([\s\S]*)\1$/;
const LINE_SPLIT = /\r?\n/;
const TOP_LEVEL_KEY = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/;
const INDENTED_LINE = /^\s+\S/;
const SEQUENCE_ITEM = /^\s*-\s+/;
/** A line that belongs to the field above it: indented, or a sequence item at the margin. */
const UNDER_LINE = /^(?:\s+\S|-\s)/;

/**
 * One top-level line of a front matter block, with the lines that belong to
 * it: a block scalar's text, a block sequence's items, a plain scalar's
 * continuation. `key` is absent on a line that names no field (a comment, a
 * blank, anything else), which then stands alone.
 */
export interface FrontMatterLine {
  key?: string;
  /** The line exactly as written. */
  raw: string;
  /** The lines under it, exactly as written. */
  under: string[];
  /** The text after `key:`, trimmed; the trimmed line when there is no key. */
  value: string;
}

export interface FrontMatterBlock {
  /** Everything after the closing `---` line, as written. */
  body: string;
  lines: FrontMatterLine[];
}

/**
 * A file's front matter, line by line, without interpreting a value: the
 * shared reader under {@link parseAgentFrontMatter} and the project task file
 * (the hub's `task-file.ts`), which reads and rewrites single fields in place.
 * Undefined when the file does not open with a `---` block.
 */
export const frontMatterBlock = (
  content: string
): FrontMatterBlock | undefined => {
  const block = FRONT_MATTER.exec(content);
  if (!block) {
    return;
  }
  const lines: FrontMatterLine[] = [];
  for (const raw of block[1].split(LINE_SPLIT)) {
    const last = lines.at(-1);
    if (last?.key !== undefined && UNDER_LINE.test(raw)) {
      last.under.push(raw);
      continue;
    }
    const pair = TOP_LEVEL_KEY.exec(raw);
    lines.push(
      pair
        ? { key: pair[1], value: pair[2].trim(), raw, under: [] }
        : { value: raw.trim(), raw, under: [] }
    );
  }
  return { lines, body: content.slice(block[0].length) };
};

/** The leading run of `lines` that `pattern` matches. */
const leading = (lines: string[], pattern: RegExp): string[] => {
  const end = lines.findIndex((line) => !pattern.test(line));
  return end === -1 ? lines : lines.slice(0, end);
};

/** `"a"`, `'a'` or a bare word — YAML's three ways of writing one scalar. */
const unquote = (value: string): string => {
  const trimmed = value.trim();
  const quoted = QUOTED_SCALAR.exec(trimmed);
  return quoted ? quoted[2] : trimmed;
};

/** A comma-separated list, an inline `[a, b]`, or a sequence already joined. */
const splitList = (value: string): string[] =>
  value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(unquote)
    .filter(Boolean);

/**
 * The front matter block's top-level scalars. Deliberately not a YAML parser:
 * the five fields anything here reads are a word, a sentence or a list of
 * words, and a dependency that understands anchors and merge keys would still
 * be storing the file verbatim. A block scalar (`|`, `>`) folds to one line and
 * a block sequence joins with commas, so both reach the reader as themselves.
 */
export const parseAgentFrontMatter = (content: string): AgentFrontMatter => {
  const block = frontMatterBlock(content);
  if (!block) {
    return {};
  }

  const fields: Record<string, string> = {};
  // Top-level keys only: an indented line belongs to whatever opened above it.
  for (const { key, value, under } of block.lines) {
    if (key === undefined) {
      continue;
    }
    if (value.startsWith("|") || value.startsWith(">")) {
      fields[key] = leading(under, INDENTED_LINE)
        .map((line) => line.trim())
        .join(" ");
    } else if (value === "") {
      const items = leading(under, SEQUENCE_ITEM).map((line) =>
        unquote(line.replace(SEQUENCE_ITEM, ""))
      );
      if (items.length > 0) {
        fields[key] = items.join(", ");
      }
    } else {
      fields[key] = unquote(value);
    }
  }

  return {
    ...(fields.name ? { name: fields.name } : {}),
    ...(fields.description ? { description: fields.description } : {}),
    ...(fields.model ? { model: fields.model } : {}),
    ...(fields.tools ? { tools: splitList(fields.tools) } : {}),
    ...(fields.effort ? { effort: fields.effort } : {}),
  };
};

/**
 * Why this file cannot be stored as a subagent, in a sentence, or nothing when
 * it can. One rule for the hub's refusal and the editor's live reading, so a
 * save is never turned away for something the page said was fine.
 *
 * `expected` is the name the file is being stored under: a definition renamed
 * in place would leave the old row and the old file behind, so it is refused
 * rather than silently made into two subagents.
 */
export const agentProblem = (
  front: AgentFrontMatter,
  expected?: string
): string | undefined => {
  if (!front.name) {
    return "the front matter needs a name — that, not the filename, is what a delegation asks for";
  }
  if (!AGENT_NAME.test(front.name)) {
    return `“${front.name}” is not a usable subagent name: lowercase letters, digits and hyphens only`;
  }
  if (expected !== undefined && front.name !== expected) {
    return `this file names “${front.name}”, not “${expected}” — remove that one and add this one instead`;
  }
  if (!front.description?.trim()) {
    return "the front matter needs a description — it is the whole of how Claude Code decides to delegate";
  }
  return undefined;
};

/**
 * Why this path cannot be a linked document, in a sentence, or nothing when it
 * can. One rule for the hub's refusal and the daemon's write, so nothing is
 * ever stored that a machine would then have to turn away — and nothing under
 * `~/.claude/memories/` is ever a write anywhere else.
 */
const WINDOWS_DRIVE_PREFIX = /^[A-Za-z]:/;

export const memoryDocProblem = (path: string): string | undefined => {
  if (!path.endsWith(".md")) {
    return "a linked document is markdown — its path has to end in .md";
  }
  if (path.startsWith("/") || WINDOWS_DRIVE_PREFIX.test(path)) {
    return `“${path}” is absolute — a document's path is relative to ~/.claude/memories/`;
  }
  if (path.includes("\\")) {
    return `“${path}” uses backslashes — the path is the same string on every machine, so it is forward-slashed`;
  }
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return `“${path}” is not a usable path — no empty, “.” or “..” segments`;
  }
  if (parts.some((part) => part.startsWith("."))) {
    return `“${path}” hides a segment behind a dot — the set is documents, not dotfiles`;
  }
  return undefined;
};

/**
 * One document the main memory links, by its path under `~/.claude/memories/`
 * (`models/claude-opus-5.md`). Its own hash, because a set converges file by
 * file: a doc edited on a machine holds up itself and nothing else.
 *
 * The path is relative and always forward-slashed — it is the same string on
 * every machine, and it is what the hub's row is keyed by.
 */
export interface FleetMemoryDoc {
  content: string;
  /** Set on a targeted push only: overwrite a machine copy that drifted. */
  force?: boolean;
  /** sha256 hex of `content` (UTF-8) — what a machine compares before writing. */
  hash: string;
  path: string;
}

/**
 * The user-scope memory: `~/.claude/CLAUDE.md` and the documents it links.
 *
 * The main file is loaded flat into every session, so it stays the part every
 * model should read. The linked ones are read on purpose — a SessionStart hook
 * puts `models/<model>.md` in front of the session that is actually running
 * that model, which is the only conditional loading Claude Code has.
 */
export interface FleetMemory {
  content: string;
  /**
   * The linked documents. Absent from a hub that predates the set, which is a
   * fleet of exactly one document — and a daemon that predates it ignores the
   * field and still converges the main file, which is the whole of what it
   * knew how to do.
   */
  docs?: FleetMemoryDoc[];
  /** Set on a targeted push only: overwrite a machine copy that drifted. */
  force?: boolean;
  /** sha256 hex of `content` (UTF-8) — what a machine compares before writing. */
  hash: string;
}

/** The whole desired state — what the hub sends a machine to converge on. */
export interface FleetConfig {
  /**
   * The fleet's "CawCo's to-dos" choice (§5.2). On, every session is denied
   * its harness's own list and plan mode ({@link cawcoTodosDenied}), the
   * machine's own `claude` too, and OpenCode's `plan` agent is disabled.
   * Absent from a hub that predates it: off.
   */
  cawcoTodos?: boolean;
  /**
   * Fleet-wide tool denials. Absent from a hub that predates them, which is
   * what has a daemon fall back to the compiled constants — the same four names
   * the migration seeds, so the two paths produce the same list.
   */
  deniedTools?: string[];
  /**
   * Hooks the fleet keeps. Absent from a hub that predates them, and a daemon
   * that predates them ignores the field — which for hooks matters more than
   * it does for the rest: an old daemon that half-understood this would be an
   * old daemon executing something. Absent means "converge nothing", never
   * "remove everything", so the two directions of version skew both end in a
   * machine that runs only what it already ran.
   */
  hooks?: FleetHook[];
  /**
   * The marketplaces, by name, whose source is a directory on the hub's own
   * machine, sent to a machine that is not that machine. Such a path names
   * nothing here, so the machine links nothing for it: its plugins arrive as
   * {@link pluginPayloads}, and its row reports what they came to. The hub's
   * own machine is sent an empty list and links the directory where it stands.
   * The hub knows its own machine by the id that machine registers under, the
   * same for every install type, so it always decides.
   *
   * A plugin of such a marketplace that the hub could not carry has no other
   * way onto this machine, so its row in {@link plugins} is sent with the
   * hub's `error`: the one case a machine is given that bookkeeping, because
   * it is the whole of what the machine's failure has to say.
   */
  hubOnlyMarketplaces?: string[];
  marketplaces: FleetMarketplace[];
  mcp: FleetMcpServer[];
  /**
   * The fleet's user-scope CLAUDE.md, or null when the fleet keeps none —
   * which is what has a machine give back the copy cawco wrote it.
   */
  memory?: FleetMemory | null;
  /**
   * Vendored plugins, files inline. Present when the hub could resolve them;
   * a daemon that gets them writes its own marketplace and installs from that
   * directory, and reaches the network for nothing. Absent from a hub that
   * predates this, which is what has a daemon fall back to asking the CLI to
   * fetch — the old behaviour, kept only for that skew.
   */
  pluginPayloads?: FleetPluginPayload[];
  plugins: FleetPlugin[];
  /**
   * Directly-fetched skills, files inline (NEW.md §11). A daemon writes a
   * skill's directory under `~/.claude/skills/` only when the hash differs
   * from what its sidecar recorded. Absent from a hub that predates them.
   */
  skills?: FleetSkillPayload[];
}

/**
 * What one desired entry came to on one machine. `removed` is a success: the
 * row was disabled or deleted and the machine no longer has it — reported
 * once so the dashboard can say so, gone from the next report.
 */
export interface FleetItemState {
  /** `failed`: what the write or the CLI said — the tail of it. */
  detail?: string;
  state:
    | "applied"
    | "failed"
    | "removed"
    | "needs-auth"
    | "disabled"
    | "unsupported"
    | "pending";
}

/** Every runtime uses this translation; an unknown status cannot claim success. */
export const mcpFleetState = (status?: {
  status: string;
  error?: string;
}): FleetItemState => {
  switch (status?.status) {
    case "connected":
      return { state: "applied" };
    case "needs_auth":
    case "needs_client_registration":
    case "needs-auth":
      return {
        state: "needs-auth",
        detail: "Sign in to this server from Configure → MCP servers.",
      };
    case "disabled":
      return { state: "disabled" };
    case "pending":
    case "connecting":
      return {
        state: "pending",
        detail: "The runtime is connecting to this server.",
      };
    default:
      return {
        state: "failed",
        detail:
          status?.error ??
          `MCP runtime reported ${status?.status ?? "no server"}.`,
      };
  }
};

export const worstFleetState = (
  items: readonly FleetItemState[]
): FleetItemState => {
  const order: FleetItemState["state"][] = [
    "failed",
    "needs-auth",
    "unsupported",
    "pending",
    "disabled",
    "removed",
    "applied",
  ];
  return (
    [...items].sort(
      (a, b) => order.indexOf(a.state) - order.indexOf(b.state)
    )[0] ?? { state: "pending", detail: "No runtime has reported this server." }
  );
};

/**
 * A machine's answer to `syncFleetConfig`, and what `agents.fleet` stores:
 * every desired entry, by the same keys the config used.
 */
export interface FleetSyncReport {
  /** When the sync ran, ms epoch. */
  at: number;
  /**
   * What this machine holds on its disk once the sync is done, by hash — the
   * content-carrying rows only, hashed as the hub hashes them. It tells the
   * hub whose content moved, so running sessions reload. Which bytes a sync
   * leaves out is never decided from it: the hub reads the disk again
   * ({@link READ_FLEET_HOLDINGS}) just before every sync.
   */
  have?: {
    skills?: Record<string, string>;
    plugins?: Record<string, string>;
  };
  /**
   * The fleet's hooks, by the same id the hub keeps them under. Absent from a
   * daemon that predates them. `failed` covers three different machine-local
   * facts — a hand-edited script, a validation the hub already passed but this
   * row failed again, or a project hook with no checkout here — and `detail`
   * is what tells them apart.
   */
  hooks?: Record<string, FleetItemState>;
  marketplaces: Record<string, FleetItemState>;
  mcp: Record<string, FleetItemState>;
  /** Per-harness runtime truth, before the machine row's worst-state aggregation. */
  mcpByHarness?: Partial<Record<HarnessKind, Record<string, FleetItemState>>>;
  /**
   * The user-scope memory (CLAUDE.md). Absent from a daemon that predates it;
   * `failed` is how a machine says its own copy was edited and was not
   * overwritten.
   */
  memory?: FleetItemState;
  /**
   * The linked documents, by the same path the set keyed them under. Absent
   * from a daemon that predates the set; one drifted document says so on its
   * own row, with the main file still `applied` beside it.
   */
  memoryDocs?: Record<string, FleetItemState>;
  /**
   * The SessionStart hook that shows a session the document for the model it is
   * running. Absent from a daemon that predates the set, and from one the set
   * gave nothing to register.
   */
  memoryHook?: FleetItemState;
  plugins: Record<string, FleetItemState>;
  /** Absent from a daemon that predates directly-fetched skills. */
  skills?: Record<string, FleetItemState>;
  /**
   * The CLIs this sync leaned on, so a failure can be attributed to a binary
   * rather than to the machine as a whole. Absent from a daemon that predates
   * it, and from one that found nothing to report.
   */
  toolchain?: FleetToolchain;
}

/**
 * One install of a CLI a sync depends on, as the machine found it.
 *
 * The reason this exists: a machine may carry several `claude` binaries at
 * once (a homebrew one, an npm-global one, the local installer's), PATH picks
 * whichever comes first, and a CLI too old for a flag the sync passes fails
 * with a sentence that names neither the binary nor its version. Reporting the
 * install makes that a fact on the dashboard rather than an expedition.
 */
export interface CliInstall {
  /** Absolute path of the executable, resolved through any symlink. */
  path: string;
  /** Set on the one the sync actually ran — the binary a failure came out of. */
  used?: boolean;
  /** What `--version` said, when it would say. */
  version?: string;
}

/** The CLIs a machine's sync leaned on, by the name they are known under. */
export interface FleetToolchain {
  /** Every `claude` this machine has; the one the sync ran is marked `used`. */
  claude?: CliInstall[];
}

/** One installable plugin, as a linked marketplace's `marketplace.json` lists it. */
export interface MarketplacePluginInfo {
  category?: string;
  description?: string;
  name: string;
  version?: string;
}

/**
 * One MCP server a machine really has, wherever it came from. What
 * {@link INSPECT_CONFIG} reports — the fleet's own rows included, so a reader
 * sees one list rather than two halves of one.
 */
export interface DiscoveredMcp {
  config: FleetMcpConfig;
  /** Whether cawco wrote it — an unmanaged row is one worth adopting. */
  managed: boolean;
  name: string;
  scope: FleetScope;
  /**
   * Set when a nearer scope defines the same name and wins. Claude Code's own
   * precedence is local > project > user, and a fleet server quietly shadowed
   * by a checkout is the kind of thing a reader should be told, not debug.
   */
  shadowedBy?: FleetScope;
}

/** One skill a machine really has. `plugin` skills come from an installed plugin. */
export interface DiscoveredSkill {
  /** The SKILL.md front matter's `description`, when it has one. */
  description?: string;
  managed: boolean;
  name: string;
  /** Absolute path of the skill's directory, for the reader and for adoption. */
  path: string;
  scope: FleetScope | "plugin";
}

/**
 * What a session started in `cwd` would actually see, and what a machine has
 * outside any project when `cwd` is absent. The answer to two questions the
 * dashboard asks: "what is on this machine that cawco does not manage?" and
 * "what will this folder give me?" — asked the moment a folder is chosen.
 */
export interface ConfigInspection {
  at: number;
  /** Absent for a machine-wide read. */
  cwd?: string;
  /** Linked marketplaces, by name. */
  marketplaces: string[];
  mcp: DiscoveredMcp[];
  /**
   * The machine's own user CLAUDE.md, or null when it has none. `managed` says
   * cawco wrote what is there — an unmanaged one is worth adopting. `docs`
   * is whatever the machine has under `~/.claude/memories/`, read the same way
   * and absent from a daemon that predates the set.
   */
  memory?: {
    hash: string;
    bytes: number;
    managed: boolean;
    docs?: { path: string; hash: string; bytes: number; managed: boolean }[];
  } | null;
  /** Enabled plugin ids, as `plugin@marketplace`. */
  plugins: string[];
  skills: DiscoveredSkill[];
}

/** One linked document as a machine really has it, whoever wrote it. */
export interface MachineMemoryDoc {
  content: string;
  hash: string;
  path: string;
}

/**
 * A machine's own memory set: the user CLAUDE.md and whatever is under
 * `~/.claude/memories/`. What {@link READ_MEMORY_FILE} answers with, and what a
 * peek and an adoption read. A daemon that predates the set answers without
 * `docs`, which reads as a machine that keeps none.
 */
export interface MachineMemorySet {
  content: string;
  docs?: MachineMemoryDoc[];
  hash: string;
}

/**
 * A fleet hook's script as one machine really has it, whoever last wrote it.
 * What {@link READ_HOOK_SCRIPT} answers with.
 */
export interface MachineHookScript {
  content: string;
  hash: string;
}

/**
 * The machine-scoped control names, exported so the agent's allowlist, the
 * hub's peeks and the dashboard's calls cannot drift apart.
 *
 * - `syncFleetConfig(config: FleetConfig) => FleetSyncReport` — converge and
 *   report. Idempotent; the hub sends it on register and after any change.
 * - `fleetStatus() => FleetSyncReport` — report without changing anything.
 * - `marketplaceCatalog(name: string) => MarketplacePluginInfo[]` — what a
 *   linked marketplace offers, read from its clone on that machine.
 * - `inspectConfig(cwd?: string) => ConfigInspection` — what the machine
 *   really has, and what a session in `cwd` would see. Read-only.
 * - `readSkillFiles(name: string, cwd?: string) => SkillFile[]` — the files
 *   of a skill that is already on the machine, so the hub can adopt it into
 *   the fleet and hand it to every other machine.
 * - `readMemoryFile() => MachineMemorySet | null` — the machine's current user
 *   CLAUDE.md and the documents beside it, for adoption.
 * - `readHookScript(id: string) => MachineHookScript | null` — the script a
 *   fleet hook runs from on that machine, as it is on disk, for a compare and
 *   an adoption.
 */
export const FLEET_SYNC = "syncFleetConfig";
export const FLEET_STATUS = "fleetStatus";
export const MARKETPLACE_CATALOG = "marketplaceCatalog";
export const INSPECT_CONFIG = "inspectConfig";
export const READ_SKILL_FILES = "readSkillFiles";
export const READ_MEMORY_FILE = "readMemoryFile";
export const READ_HOOK_SCRIPT = "readHookScript";
/**
 * `readFleetHoldings() => FleetHoldings` — the skills and plugins this machine
 * holds now, read off its disk and hashed as the hub hashes them: each
 * harness's own copy, and only a hash every harness that converges that kind
 * holds. The hub asks just before every sync and leaves out the bytes of
 * exactly that, so a wiped or edited copy is carried again in that same sync.
 */
export const READ_FLEET_HOLDINGS = "readFleetHoldings";

/** What a machine holds, by kind: name → hash of the files on its disk. */
export type FleetHoldings = NonNullable<FleetSyncReport["have"]>;

/** What the composer's `/` menu renders. Derived from the SDK's `SlashCommand`. */
export interface AvailableCommand {
  argumentHint?: string;
  description?: string;
  /** Without the leading slash. */
  name: string;
  /** Where it came from, when known — a plugin name, a marketplace. */
  source?: string;
  type: "builtin" | "custom" | "skill" | "mcp";
}

/**
 * Harness tags determine the palette's four-way look. For a harness that does
 * not tag its commands, derivation is the fallback: MCP prompts wear their
 * `mcp__` prefix, the session's `skills`
 * list names the skills, a namespaced leftover (`plugin:command`) is a plugin
 * command, and what remains is built in.
 */
export const classifyCommand = (
  command: { kind?: AvailableCommand["type"]; name: string },
  skills: readonly string[]
): AvailableCommand["type"] => {
  if (command.kind) {
    return command.kind;
  }
  const { name } = command;
  if (name.startsWith("mcp__")) {
    return "mcp";
  }
  if (skills.includes(name)) {
    return "skill";
  }
  if (name.includes(":")) {
    return "custom";
  }
  return "builtin";
};
