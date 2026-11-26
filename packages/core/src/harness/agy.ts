/**
 * Antigravity's CLI, `agy`: the project config it loads from a folder, ahead
 * of its descriptor. This file becomes its descriptor (core
 * harness/descriptor.ts) once it is a registered harness, and
 * {@link AGY_CLONE_CONFIG} its `cloneConfig`; until then clone-denies.ts
 * stands these in beside the registered harnesses' own, as any agy the
 * owner runs in a clone loads them on the host today.
 */
import { CAWCO_ENV } from "../cawco-env";
import type { DeniedToolNames, HarnessDescriptor } from "./descriptor";

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
export const AGY_CLONE_CONFIG = {
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
 * agy's kind, as its descriptor will name it once it is a registered
 * harness (core harness/kinds.ts `HARNESS_PLUGINS`). Until then the
 * workspace judge keys its table by this beside the registered kinds.
 */
export const AGY_KIND = "agy";
export type AgyKind = typeof AGY_KIND;

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
 * (core delegate-types.ts `deniedToolsBy`); its descriptor's `deniedTools`
 * once it is a registered harness. An MCP tool is `mcp_<server>_<tool>`,
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

/**
 * The environment variable the agy process of one session is started
 * with, naming its judge's socket as perl's `Socket` packs it, in hex (agent
 * boundary/hook-judge.ts `socketAddress`). agy hands its whole environment
 * to the hook commands it runs (`assets/338276e4/p0a.calls.jsonl`), so the
 * one hook every session of an agy home runs reaches that session's judge,
 * and only it.
 */
export const AGY_JUDGE_ENV = CAWCO_ENV.agyJudge;
