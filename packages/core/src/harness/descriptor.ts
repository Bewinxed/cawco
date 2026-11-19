/**
 * What one harness is, as a plugin describes it to the hub, core and the
 * dashboard: every per-harness fact the code reads, in one record per
 * harness (`./claude.ts`, `./opencode.ts`, `./pi.ts`), registered in
 * `./traits.ts`. The agent-side half, what a harness does, is its adapter
 * (agent harness.ts `Harness`).
 *
 * Every field is required, so a new harness's descriptor fails to type until
 * each fact is given; a fact a harness lacks is said with an explicit value,
 * its reason in {@link Lacks} or in the comment beside it. A descriptor is
 * plain data: wire-safe, importing no harness SDK and no Node built-in, so
 * the dashboard reads the same record the hub does. A behaviour that varies
 * by harness is a tag here, and the module that owns the mechanism switches
 * on the tag (ending in `unhandled()`), never on a harness's name.
 *
 * Imports here are types alone: the registry imports the descriptors, and
 * half the core imports the registry.
 */
import type { ImageMediaType } from "../attachments";
import type { HookEvent } from "../hook-events";
import type { OfferedMode } from "./modes";

/**
 * Its words (core words/harness-plugins.ts holds each harness's): its
 * name, what each permission mode does on it, Full Send's words, and what
 * CawCo's no-reply tool says there.
 */
/** What a person reads before Full Send applies, and while it stands chosen. */
export interface FullSendCopy {
  /**
   * The confirmation's two sentences: what it approves, and what still
   * reaches the person. It stands inside the mode picker and fits there
   * unscrolled at a phone's 390 px.
   */
  readonly confirm: readonly string[];
  /** Said under the confirmation when switching restarts a running session. */
  readonly restarts: string;
  /** The New Session form's standing warning while Full Send is chosen. */
  readonly warning: string;
}

/** What CawCo's no-reply tool says on a harness (hub delegation-tools.ts). */
export interface NoReplyWords {
  readonly description: string;
  readonly result: string;
}

export interface HarnessWords {
  /** Full Send's words, for a harness it is offered on. */
  readonly fullSend: FullSendCopy | Lacks;
  /** What each mode does on it, in a line the picker's row holds whole, for a harness with modes. */
  readonly modes: Readonly<Record<OfferedMode, string>> | Lacks;
  /** Its name, as the operator knows it and a sentence names it. */
  readonly name: string;
  /** What the no-reply tool says there. */
  readonly noReply: NoReplyWords;
  /** Its name on the usage page's tabs and charts. */
  readonly usageName: string;
}

/** A capability a harness does not have, and why, in a sentence of the code's own. */
export interface Lacks {
  readonly lacks: string;
}

/** What stands in for one config path of a clone while the clone has none (core clone-denies.ts). */
type CloneConfigEmpty =
  | { readonly kind: "dir"; readonly readOnly?: true }
  | { readonly kind: "file"; readonly text: string }
  | { readonly kind: "none" };

/**
 * One place a harness keeps its logins on the host, which no workspace reads
 * (core paths/host-policy.ts `credentialStores` resolves each).
 */
export type CredentialPlace =
  /** `file` in every Claude config dir the machine has (its own, each account's, any it was pointed at). */
  | { readonly in: "claude-config-dirs"; readonly file: string }
  /** The machine's `~/.claude.json`: its MCP servers with their headers and env. */
  | { readonly in: "claude-home-json" }
  /** A path under `$XDG_DATA_HOME`. */
  | { readonly in: "xdg-data"; readonly path: string }
  /** A path under `$XDG_CONFIG_HOME`. */
  | { readonly in: "xdg-config"; readonly path: string }
  /** pi's agent dir (`~/.pi/agent`, or `$PI_CODING_AGENT_DIR`). */
  | { readonly in: "pi-agent-dir" }
  /** A path under the home dir. */
  | { readonly in: "home"; readonly path: string };

/** The tools of the kinds CawCo's permissions read, by the harness's own names (core delegate-types.ts). */
export interface HarnessToolNames {
  /** The tools that write files, by the name each asks permission under. */
  readonly edit: readonly string[];
  /** Its built-in web fetch. */
  readonly fetch: readonly string[];
  /** A Windows PowerShell. */
  readonly powershell: readonly string[];
  /** Its built-in web search. */
  readonly search: readonly string[];
  /** A POSIX shell. */
  readonly shell: readonly string[];
}

/**
 * How a denied-tool list, written in Claude Code's names, reaches the
 * harness (core delegate-types.ts `deniedToolsOn`).
 */
export type DeniedToolNames =
  /** Its own settings take Claude Code's names as they are. */
  | { readonly by: "own-settings" }
  /**
   * Its own names: a Claude name through `equivalents` (an empty list: the
   * harness has no such tool, and the name denies nothing); an MCP tool as
   * `${mcpPrefix}${server}${mcpSeparator}${tool}`, each character
   * `mcpUnsafe` matches written `_`; a lowercase name as it is.
   */
  | {
      readonly by: "equivalents";
      readonly equivalents: Readonly<Record<string, readonly string[]>>;
      readonly mcpPrefix: string;
      readonly mcpSeparator: string;
      /** A regex character class, as source. */
      readonly mcpUnsafe: string;
    };

/** One harness tool in Claude Code's words: its name, and its input's keys renamed to Claude Code's (core hooks.ts). */
export interface HookToolName {
  readonly input?: Readonly<Record<string, string>>;
  readonly name: string;
}

/** Who runs the fleet's hooks for a session (core hooks.ts). */
export type HookRunner =
  /** The harness itself, from the settings CawCo launches it with. */
  | { readonly runs: "harness" }
  /**
   * CawCo, from inside the harness (its plugin, its extension), on these
   * events alone, with each of the harness's tools read by Claude Code's
   * name; a tool not named is matched by its own.
   */
  | {
      readonly runs: "cawco";
      readonly events: readonly HookEvent[];
      readonly toolNames: Readonly<Record<string, HookToolName>>;
    };

/**
 * What a harness takes as a model that no row of its catalog lists (core
 * model-names.ts `modelListed`).
 */
export type UnlistedModels =
  /** Claude Code's aliases and any full `claude-…` model name, with or without `[1m]`. */
  | "claude-names"
  /** A bare id unique among its providers' rows, which its own resolver takes. */
  | "unique-bare-id"
  /** Nothing: it drops a model it does not list. */
  | "none";

/**
 * How a harness names the MCP server that answered a call, and the skill a
 * call or a turn loads (hub usage-count.ts).
 */
export interface CallNaming {
  /** `mcp-prefix`: `mcp__<server>__<tool>`. `longest-known`: `<server>_<tool>`, read by the longest known server it starts with. `mcp-prefix-safe`: `mcp__<server>__<tool>` with each `-` written `_`. */
  readonly server: "mcp-prefix" | "longest-known" | "mcp-prefix-safe";
  /** A skill loaded by a call other than its `Skill` tool: `read-skill-file`, a read of a `SKILL.md`; `none`. */
  readonly skillCall: "read-skill-file" | "none";
  /** The skill a user turn's words load: `command-name`, a `<command-name>`; `skill-tag`, an expanded `<skill name="…">`. */
  readonly turnSkill: "command-name" | "skill-tag";
}

/** Whether CawCo scans a harness's usage and limits (agent usage/scanner.ts). */
type UsageSource =
  { readonly scanned: true } | (Lacks & { readonly scanned: false });

/**
 * What the machine's own sign-in to a harness is, the one CawCo can move
 * into an account, and the one provider every account of it is of (null
 * when a session's model names its provider). A home login that is one
 * whole dir is one provider's login, so a harness with one names its
 * provider.
 */
export type HarnessHomeLogin =
  | {
      /** One login, its whole home config dir. */
      readonly homeLogin: "dir";
      readonly soleProvider: string;
    }
  | {
      /** A store holding a credential per provider. */
      readonly homeLogin: "credentials";
      readonly soleProvider: string | null;
    }
  | {
      /**
       * None CawCo moves in: each account signs the harness in itself, in a
       * home CawCo keeps for the account, and CawCo never reads the
       * credential it holds (Codex's own sign-in).
       */
      readonly homeLogin: "none";
      readonly soleProvider: null;
    };

/**
 * A harness, described: what it is called and installed as, what it can
 * do, how CawCo keeps it in its boundary, and how the hub reads it.
 */
export type HarnessDescriptor<K extends string = string> =
  HarnessDescriptorFacts<K> & HarnessHomeLogin;

/** Every fact of a {@link HarnessDescriptor} but its {@link HarnessHomeLogin}. */
interface HarnessDescriptorFacts<K extends string> {
  /**
   * Whether a session runs in its account's own config dir, which holds the
   * account's login and its conversations: a launch picks the dir, a session
   * that changes account has its conversation carried to the new one, and
   * the machine reports each dir's sign-in. Without one, an account is a
   * credential the harness is handed, and a session's model picks which.
   */
  readonly accountDir: boolean;
  /** What a session on the board alone (a fleet-watch triage) may never call on it: no subagent, monitor, worktree, shell or edit tool. */
  readonly boardOnlyDenied: readonly string[];
  /** Whether it can report a compaction failed after it already reported that compaction's boundary. */
  readonly boundaryBeforeCompactionFailure: boolean;
  /** How its calls name the MCP server that answered them and the skill they load. */
  readonly callNaming: CallNaming;
  /**
   * Whether a stored conversation its machine's catalog leaves out is gone:
   * the catalog is the harness's whole store.
   */
  readonly catalogProvesGone: boolean;

  /**
   * Why a session of it can't start clean (none of the machine's fleet
   * content), in the words it is refused with; null when one can. A harness
   * that can't is refused, never started half clean.
   */
  readonly cleanStartRefused: string | null;

  /**
   * Every config file it loads from a folder and runs on the host, emptied
   * in a workspace's clone, by its path from the clone's root (core
   * clone-denies.ts). Security: a path left out here runs a clone's own
   * config on the host.
   */
  readonly cloneConfig: Readonly<Record<string, CloneConfigEmpty>>;
  /**
   * Whether a moved line's stored `compactBy` names it when its own
   * `/compact` ran (core `AccountMove`). `unnamed`: a line without one is
   * its, as every line was before the field: Claude Code's alone.
   */
  readonly compactByOnMovedLine: "named" | "unnamed";
  /**
   * Where a model's context window comes from. `hub`: the hub learns it from
   * the harness's results (Claude Code's `modelUsage`). `catalog`: the
   * harness's model list carries it.
   */
  readonly contextWindow: "hub" | "catalog";
  /**
   * Whether a session's cost is its real spend, or an estimate at API prices
   * of work a plan may already cover.
   */
  readonly costMeaning: "estimated" | "real";
  /** Where it keeps its logins on the host, which no workspace reads. Security, as {@link cloneConfig} is. */
  readonly credentialPlaces: readonly CredentialPlace[];
  /** What a project's memory curator may never call on it: the board-only list, and the web. */
  readonly curatorDenied: readonly string[];

  /**
   * How a session outlives the agent. `keeper`: its process is the keeper's
   * child. `server`: it lives in a server that outlives the agent, and so
   * proves no absence by not being listed.
   */
  readonly custody: "keeper" | "server";
  /** How a denied-tool list reaches it. */
  readonly deniedTools: DeniedToolNames;
  /** Who runs the fleet's hooks for its sessions. */
  readonly hooks: HookRunner;
  /** Its name in every table, URL and row: the plugin's kind. */
  readonly kind: K;
  /** Whether a machine's listing names every conversation it holds, so one it doesn't name is gone; a filtered listing proves nothing by leaving one out. */
  readonly listsAllConversations: boolean;
  /**
   * Whether one server of it runs the MCP servers of a folder for every
   * session there (OpenCode's location), so their MCP gate is the folder's
   * (core `folderGateId`); otherwise each session holds its own.
   */
  readonly mcpPerFolder: boolean;

  /**
   * Where its model list comes from. `account`: read per account by the
   * hub. `machine`: the machine's own report.
   */
  readonly modelCatalog: "account" | "machine";
  /**
   * Its own tools for what CawCo keeps itself, denied to every session:
   * subagents (work goes to CawCo's delegates), the to-do list and plan mode
   * (a session's plan is CawCo's list), and the question tool (a question
   * is CawCo's `ask`). An empty list: it has none.
   */
  readonly nativeTools: {
    readonly questions: readonly string[];
    readonly subagents: readonly string[];
    readonly todos: readonly string[];
  };
  /** Whether it names providers by ids of its own rather than pi-ai's. */
  readonly ownProviderIds: boolean;
  /** Whether it takes a permission mode at all. */
  readonly permissionModes: boolean;
  /**
   * The picture types a send to it can carry (core attachments.ts): Claude
   * Code's are Anthropic's four; a harness that hands a picture on to its
   * provider as it is takes any a provider takes.
   */
  readonly pictureTypes: readonly ImageMediaType[];
  /**
   * What the keeper's name for one of its sessions' processes starts with
   * (agent proc-id.ts): `<kind>:`, or nothing for Claude Code's, which
   * predate the prefix, so a bare id is its. One harness alone has none.
   * Null for a harness whose sessions are no keeper's children (custody
   * `server`).
   */
  readonly procIdPrefix: string | null;
  /**
   * The longest its prompt cache lives after a request, for a harness whose
   * results report the cache's use; null for one whose don't. The hub times
   * an idle session's cache from those reports and keeps it warm with
   * keep-alive turns; a session with no measurement, or no recorded turn,
   * reads its cache as expired at the latest this long after its last
   * activity.
   */
  readonly promptCacheMaxMs: number | null;
  /**
   * Which provider limit a session reads against. `account`: the account's
   * own windows. `go`: OpenCode Go's, for models under its prefix. `none`:
   * the harness reports none.
   */
  readonly providerLimit: "account" | "go" | "none";
  /**
   * Whether a send handed to a busy session waits in the harness's own queue
   * until the session reads it: it shows as queued, and can be taken back
   * while it waits. Without one, a session stores a send as it is handed it.
   */
  readonly queuesSends: boolean;
  /** Whether its machine can read a stored conversation's context back. */
  readonly readsStoredContext: boolean;
  /**
   * Whether its machine reads a stored conversation through the harness's
   * own CLI (OpenCode: its server, which only a version CawCo runs is
   * started as): a machine that refuses the CLI (core harness-refusal.ts)
   * cannot read one until it runs it. Without: the conversation is read
   * from the files the harness stored, CLI or none.
   */
  readonly readsThroughCli: boolean;
  /** Whether a machine with it missing fails the fleet's check: the one every machine runs, and that accounts sign in on. */
  readonly requiredOnEveryMachine: boolean;
  /**
   * Whether it resolves a model name to `provider/id` itself, on each
   * machine: a bare id (one unique among its providers' rows) by the
   * machine's report of its resolution, and no model or `default` by its
   * pick in the session's directory, asked of the machine at the start.
   */
  readonly resolvesModelNames: boolean;

  /**
   * Which row is the anchor of a rewind. `user-turn`: the selected user turn
   * itself. `assistant-before`: the assistant frame before it.
   */
  readonly rewindAnchor: "user-turn" | "assistant-before";
  /**
   * The controls a live session of it answers, by their names in the
   * control table (core control-table.ts; agent harness.ts
   * `SessionControls` fails to type on a name the table has not). Any other
   * sent to one of its sessions is refused in core's `unknownControlWords`,
   * so a sender asks only a harness that lists it; its agent's sessions
   * answer exactly these.
   */
  readonly sessionControls: readonly string[];
  /** Whether its sessions keep a spill folder of their own for outputs too large for the model, which a workspace's cut reads (agent first-session.ts). */
  readonly spills: boolean;
  /** A row can start with no conversation of its own and take one at its first send; until then it is never started, not ended. */
  readonly startsWithoutConversation: boolean;
  /**
   * The account provider an OAuth entry in its own credential store is for,
   * by the store's id for it, where the two differ (OpenCode's `openai` is
   * a ChatGPT sign-in, `openai-codex`). Empty where they never do.
   */
  readonly storeOAuthProviders: Readonly<Record<string, string>>;
  /**
   * Whether a subagent of it ends with its call's result (OpenCode's
   * `subagent`). Without: the subagent says it ended itself (Claude Code's
   * `task_notification`), and a background one's call answers at once
   * while it runs on.
   */
  readonly subagentEndsWithCall: boolean;
  /** Its CLI, by its tool catalog id (core tools.ts `TOOL_CATALOG`): what installing or updating the harness puts on a machine. */
  readonly tool: string;

  /** Its tools of the kinds CawCo's permissions read. */
  readonly tools: HarnessToolNames;
  /** What it takes as a model no row lists. */
  readonly unlistedModels: UnlistedModels;
  /** Whether CawCo scans its usage and limits. */
  readonly usage: UsageSource;
  /** What the product says of it: its name, its permission modes, Full Send, the no-reply tool (core words/harness-plugins.ts). */
  readonly words: HarnessWords;
}
