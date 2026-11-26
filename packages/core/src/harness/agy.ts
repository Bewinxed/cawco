/**
 * Antigravity, Google's `agy` CLI, described (core harness/descriptor.ts).
 * Its adapter is agent harnesses/agy.ts: `agy acp` run as Google ships it,
 * one process per session under a CawCo host the keeper holds
 * (agent harnesses/agy-host.ts), in a home CawCo keeps per account. The
 * values rest on the agy audits of 2026-11-11 and 2026-11-26 (the project's
 * `assets/b3380ec3/agy-harness-parity.md`, `assets/1a32dcdc/
 * agy-compliant-route.md`) and the probes each comment names.
 */
import type { ImageMediaType } from "../attachments";
import { AGY_NOT_CLEAN, AGY_WORDS } from "../words/harness-plugins";
import type { DeniedToolNames, HarnessDescriptor } from "./descriptor";
import { SHARED_MODES } from "./modes";

/** An empty dir with no write bits, so agy's own writes on the host never fill it. */
const HELD = { kind: "dir", readOnly: true } as const;

/** A regular file with no write bits holding the least config agy accepts. */
const CODEIUM = {
  kind: "file",
  text: "version: v1\n",
  readOnly: true,
} as const;

/**
 * Every customization dir agy 1.5.5 loads from a project root and runs on
 * the host, each held whole: the dirs hold more loadable names than a list
 * keeps up with (`hooks.json`, which ran a clone's hook on the host;
 * `mcp_config.json` with its stdio servers; `plugins/`, `agents/`,
 * `workflows/`, `skills/`, `rules/` and their manifests). agy also takes
 * `.agent`, `_agents` and `_agent` as `.agents` ("Antigravity also
 * recognizes folders named `.agent/`, `_agents/`, and `_agent/`",
 * customization-discovery doc). `.gemini` too: its `config.json`'s
 * `personal_customization_dir` sends agy to another folder's `.agents`
 * ahead of the project's own (same doc, "Personal folders in a shared
 * repository"). The project's `assets/50e9e4c3/agy-harness-decisions.md`
 * §4.1 and `assets/b3380ec3/agy-harness-parity.md` §P-k.
 */
const AGY_CLONE_CONFIG = {
  ".agents": HELD,
  ".agent": HELD,
  _agents: HELD,
  _agent: HELD,
  ".gemini": HELD,
  // agy reads the first of these in its folder or any above it, strictly; a FIFO there hangs it, a link is followed, and `version: v1` is taken as nothing set and ends the search (host probe, the project's `assets/4bb96385/REPORT.md`).
  "codeium.yml": CODEIUM,
  "codeium.yaml": CODEIUM,
  ".codeium.yml": CODEIUM,
  ".codeium.yaml": CODEIUM,
} as const satisfies HarnessDescriptor["cloneConfig"];

/**
 * What one of agy's tools is, which its session's judge (agent
 * harnesses/agy-judge.ts) answers by:
 * - `read`, `write`: a file tool, its paths judged by a workspace's policy
 *   (core workspace-judge.ts `BUILT_INS.agy`); a write asks in `default`
 *   and is refused in `plan`.
 * - `image`: makes a file of its own choosing; asks and is refused as a
 *   write.
 * - `shell`: runs a command; in a workspace, through its executor; asks in
 *   `default` and `acceptEdits`, refused in `plan`.
 * - `terminal`: input to a command already running; refused in `plan`.
 * - `task`: reads or stops its own background commands; input sent with it
 *   is `terminal`.
 * - `mcp-call`: calls an MCP tool by its server and name, judged as that
 *   tool; every `mcp_<server>_<tool>` is an MCP tool too.
 * - `web`: searches the web.
 * - `list`: agy's own step list, denied as the fleet's step lists say.
 * - `schedule`: a one-time wake-up runs; a recurring one is refused.
 * - `subagent`, `browser`, `question`, `config`: refused in every session
 *   (the project's `assets/50e9e4c3/agy-harness-decisions.md` §1
 *   decisions 7, 8, 9): its own subagents, workflows and swarms, its own
 *   browser, its own question and permission tools, and its plugin and
 *   marketplace tools, which change its setup for later sessions.
 */
export type AgyToolClass =
  | "read"
  | "write"
  | "image"
  | "shell"
  | "terminal"
  | "task"
  | "mcp"
  | "mcp-call"
  | "web"
  | "list"
  | "turn"
  | "schedule"
  | "subagent"
  | "browser"
  | "question"
  | "config";

/**
 * Every tool agy 1.5.18 offers an ACP session, by the name its
 * `PreToolUse` hook and ACP's `tool_call` read it under, and its class
 * ({@link AgyToolClass}). The list is read from agy itself: the tools a
 * 1.5.18 session's model was declared, the names its hook was handed, and
 * the tool types in the 1.5.18 binary (`tools.(*…Tool).Name`), on
 * 2026-11-26 (the project's `assets/338276e4/p0a.log`, `p0a.calls.jsonl`).
 *
 * What changed since 1.5.5 (`assets/b3380ec3/agy-harness-parity.md` §P-l,
 * 60 tools): 1.5.18's ACP sessions run a smaller tool set under one name
 * each. `read_file`, `write_file`, `edit_file` are the only file tools (1.5.5's
 * `view_file`, `write_to_file`, `replace_file_content`,
 * `multi_replace_file_content`, `sed_file`, `list_dir`, `grep_search` and
 * `find_by_name` are declared to no session, and the 1.5.18 binary holds
 * none of their path fields, `AbsolutePath`, `DirectoryPath`, `SearchPath`,
 * `SearchDirectory`: a listing or a search is a command); `run_workflow`
 * and `swarm` are new and fan work out to subagents; the browser is a
 * subagent of its own (`/browser`), so its tools are no main session's;
 * `read_url_content`, `command_status` and `send_command_input` are
 * declared to no session (a background command is read and fed through
 * `manage_task`). The 1.5.5 names that would still
 * mean a denied class are kept below, so a release that brings one back is
 * refused in its class's words; any other name not here is refused as a
 * tool CawCo does not know.
 */
export const AGY_TOOLS: Readonly<Record<string, AgyToolClass>> = {
  read_file: "read",
  write_file: "write",
  edit_file: "write",
  run_command: "shell",
  manage_task: "task",
  generate_image: "image",
  call_mcp_tool: "mcp-call",
  list_resources: "mcp",
  read_resource: "mcp",
  search_web: "web",
  update_steps: "list",
  finish: "turn",
  schedule: "schedule",
  invoke_subagent: "subagent",
  define_subagent: "subagent",
  manage_subagents: "subagent",
  send_message: "subagent",
  run_workflow: "subagent",
  swarm: "subagent",
  browser_subagent: "browser",
  open_browser_url: "browser",
  read_browser_page: "browser",
  list_browser_pages: "browser",
  capture_browser_screenshot: "browser",
  capture_browser_console_logs: "browser",
  click_browser_pixel: "browser",
  execute_browser_javascript: "browser",
  ask_question: "question",
  ask_permission: "question",
  ask_custom_permission: "question",
  search_marketplace: "config",
  list_plugin_accounts: "config",
};

/** Every tool whose name starts so is agy's own browser's (1.5.5 offered sixteen `browser_*`). */
export const AGY_BROWSER_PREFIX = "browser_";

/** `manage_task`'s action that sends input to a running command (its `Action`, `Input`). */
export const AGY_TASK_INPUT_ACTION = "send_input";

/**
 * A denied-tool list written in Claude Code's names, as agy's
 * (core delegate-types.ts `deniedToolsBy`): its descriptor's `deniedTools`.
 * An MCP tool is `mcp_<server>_<tool>`,
 * the server and tool as written (its `mcp_%s_%s`; §P-d named
 * `mcp_cawco-probe_probe_echo`); a character outside the set below has
 * not been seen in one and is written `_`.
 */
export const AGY_DENIED_TOOLS = {
  by: "equivalents",
  equivalents: {
    Agent: [
      "invoke_subagent",
      "define_subagent",
      "manage_subagents",
      "send_message",
      "run_workflow",
      "swarm",
    ],
    AskUserQuestion: ["ask_question"],
    Bash: ["run_command", "manage_task"],
    Edit: ["edit_file"],
    EnterPlanMode: [],
    EnterWorktree: [],
    ExitPlanMode: [],
    ExitWorktree: [],
    Glob: [],
    Grep: [],
    LS: [],
    Monitor: [],
    MultiEdit: ["edit_file"],
    NotebookEdit: [],
    PowerShell: [],
    Read: ["read_file"],
    Task: [
      "invoke_subagent",
      "define_subagent",
      "manage_subagents",
      "send_message",
      "run_workflow",
      "swarm",
    ],
    TaskCreate: ["update_steps"],
    TaskGet: ["update_steps"],
    TaskList: ["update_steps"],
    TaskUpdate: ["update_steps"],
    TodoWrite: ["update_steps"],
    WebFetch: [],
    WebSearch: ["search_web"],
    Workflow: ["run_workflow"],
    Write: ["write_file"],
  },
  mcpPrefix: "mcp_",
  mcpSeparator: "_",
  mcpUnsafe: "[^A-Za-z0-9_-]",
} as const satisfies DeniedToolNames;

/** Its own subagents, workflows and swarms ({@link AGY_TOOLS} class `subagent`). */
const SUBAGENTS = AGY_DENIED_TOOLS.equivalents.Agent;
/** Its own question and permission tools (class `question`). */
const QUESTIONS = [
  "ask_question",
  "ask_permission",
  "ask_custom_permission",
] as const;
/** Its step list (class `list`). */
const STEPS = ["update_steps"] as const;
/** Its command runner. */
const RUNS = ["run_command"] as const;
/** Its file writers. */
const WRITES = ["write_file", "edit_file"] as const;
/** Its web search. */
const WEB = ["search_web"] as const;
/** What a board-only session may never call: its subagents, its commands (and input to them), its writes. */
const BOARD_DENIED = [...SUBAGENTS, ...RUNS, "manage_task", ...WRITES] as const;

/**
 * The pictures a send to it can carry: those every model agy runs takes,
 * Gemini's and Claude's alike (core attachments.ts names each provider's),
 * as an ACP `image` block agy hands its model (§P-g: a PNG answered).
 */
const AGY_PICTURES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const satisfies readonly ImageMediaType[];

export const AGY = {
  kind: "agy",
  tool: "antigravity",
  words: AGY_WORDS,

  // An account is an agy home CawCo keeps under the account's own dir
  // (`--gemini-dir`, core paths/harnesses.ts `agyAccountHome`), signed in
  // by agy itself or run on a key CawCo hands it; a conversation lives in
  // that home's own store, which no other account's reads, and nothing
  // carries it.
  accountDir: false,
  mcpPerFolder: false,
  // No machine sign-in moves in: CawCo never reads a Google token, the
  // owner's `~/.gemini` included (tsk-340: "CawCo never reads or holds a
  // Google OAuth token").
  homeLogin: "none",
  soleProvider: null,
  // Its models are agy's own ids (`gemini-3.8-flash`, `claude-opus-5-5`),
  // which no account provider names.
  ownProviderIds: false,
  providerLimit: "account",
  // agy reports a turn's tokens and no price; a plan's work costs nothing
  // per token.
  costMeaning: "estimated",
  usage: {
    scanned: false,
    lacks:
      "CawCo does not scan agy's usage files: its turns report their tokens live, and an account's limits are read from agy.",
  },
  compactByOnMovedLine: "named",

  // What `session/new` lists for the session's account, read live in its
  // own home, never a list kept here (§P-f; a gemini-api-key account lists
  // Gemini alone).
  modelCatalog: "machine",
  resolvesModelNames: false,
  unlistedModels: "none",
  // agy's ACP names no model's window.
  contextWindow: "catalog",
  pictureTypes: AGY_PICTURES,

  cleanStartRefused: AGY_NOT_CLEAN,
  // CawCo's modes, answered by its judge over agy's own `default` mode
  // (agent harnesses/agy-judge.ts `MODE_ACTION`); agy's modes are never set.
  permissionModes: SHARED_MODES,
  requiredOnEveryMachine: false,
  startsWithoutConversation: false,
  // agy saves an output too large for its model, and each background
  // command's log, in its home's `brain/<conversation>/`, whose name it
  // gives only once the conversation opens: a workspace session's own is
  // read by its file tools through its judge (core workspace-judge.ts
  // `Call.ownOutputs`), never by a spill folder of the workspace's.
  spills: false,
  storeOAuthProviders: {},

  nativeTools: { questions: QUESTIONS, subagents: SUBAGENTS, todos: STEPS },
  boardOnlyDenied: BOARD_DENIED,
  curatorDenied: [...BOARD_DENIED, ...WEB],
  deniedTools: AGY_DENIED_TOOLS,
  tools: { edit: WRITES, fetch: [], powershell: [], search: WEB, shell: RUNS },
  // CawCo runs them, from its one hook in the home's `config/hooks.json`
  // (agent harnesses/agy-hook.ts) and its ACP client (agent
  // harnesses/agy-fleet-hooks.ts): agy hands a hook its own payload and
  // reads its own answer, so no fleet hook is an entry of agy's own.
  // `PreToolUse` after the session's judge, `PostToolUse` and
  // `PostToolUseFailure` on agy's `PostToolUse`, by its `error`;
  // `SessionStart`, `UserPromptSubmit` and `Stop` as CawCo opens the
  // session, sends a prompt and sees a turn end. Each tool's argument keys
  // as agy 1.5.18 hands its hook them (the project's
  // `assets/8c459ba3/q2-payloads.txt`).
  hooks: {
    runs: "cawco",
    events: [
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "SessionStart",
      "UserPromptSubmit",
      "Stop",
    ],
    toolNames: {
      run_command: { name: "Bash", input: { CommandLine: "command" } },
      read_file: { name: "Read", input: { Path: "file_path" } },
      write_file: {
        name: "Write",
        input: { Path: "file_path", Content: "content" },
      },
      edit_file: {
        name: "Edit",
        input: {
          Path: "file_path",
          Target: "old_string",
          Replacement: "new_string",
        },
      },
      search_web: { name: "WebSearch" },
    },
  },

  cloneConfig: AGY_CLONE_CONFIG,
  // The owner's own agy home, which Gemini CLI shares, holding its saved
  // sign-in, settings and conversations. CawCo's homes sit under each
  // account's dir, which no workspace reads.
  credentialPlaces: [{ in: "home", path: ".gemini" }],

  custody: "keeper",
  procIdPrefix: "agy:",
  // Stored conversations are not listed yet.
  listsAllConversations: false,
  catalogProvesGone: false,
  readsStoredContext: false,
  readsThroughCli: false,
  sessionControls: [
    "installSessionCredential",
    "verifySessionCredential",
    "interrupt",
    "setModel",
    "setEffort",
    "setPermissionMode",
    "supportedModels",
    "supportedCommands",
    "getContextUsage",
  ],

  rewindAnchor: "user-turn",
  queuesSends: false,
  promptCacheMaxMs: null,
  boundaryBeforeCompactionFailure: false,
  subagentEndsWithCall: false,
  // `mcp_<server>_<tool>` (its `mcp_%s_%s`, §P-d).
  callNaming: {
    server: "mcp-single-known",
    skillCall: "none",
    turnSkill: "command-name",
  },
} as const satisfies HarnessDescriptor<"agy">;
