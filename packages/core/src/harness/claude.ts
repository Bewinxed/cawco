/**
 * Claude Code, described (core harness/descriptor.ts). Its adapter is agent
 * harnesses/claude.ts.
 */
import { CLAUDE_IMAGE_MEDIA_TYPES } from "../attachments";
import { PROJECT_SKILLS, projectClaudeRelative } from "../claude-dirs";
import { HOUR_MS } from "../time";
import { CLAUDE_WORDS } from "../words/harness-plugins";
import type { HarnessDescriptor } from "./descriptor";
import { PERMISSION_MODES } from "./modes";

const DIR = { kind: "dir" } as const;
const EMPTY_JSON = { kind: "file", text: "{}\n" } as const;
const EMPTY = { kind: "file", text: "" } as const;

/** Its shell tools: a POSIX shell, and PowerShell on Windows (agent SDK 0.3.302's `BUILTIN_TOOL_NAMES`). */
const SHELL = ["Bash"] as const;
const POWERSHELL = ["PowerShell"] as const;
/** The tools that write files, by the name each asks permission under. */
const EDIT = ["Edit", "Write", "MultiEdit", "NotebookEdit"] as const;
const FETCH = ["WebFetch"] as const;
const SEARCH = ["WebSearch"] as const;

/**
 * Its board-only denials: `Monitor` runs a script and
 * `EnterWorktree`/`ExitWorktree` make and remove git worktrees; `Agent` (its
 * old name `Task`) and `Workflow` start subagents; and every shell and edit
 * tool.
 */
const BOARD_ONLY = [
  "Monitor",
  "EnterWorktree",
  "ExitWorktree",
  "Agent",
  "Task",
  "Workflow",
  ...SHELL,
  ...POWERSHELL,
  ...EDIT,
] as const;

export const CLAUDE = {
  kind: "claude",
  tool: "claude",
  words: CLAUDE_WORDS,

  accountDir: true,

  mcpPerFolder: false,
  homeLogin: "dir",
  soleProvider: "anthropic",
  ownProviderIds: false,
  providerLimit: "account",
  costMeaning: "estimated",
  usage: { scanned: true },
  // A moved line from before `compactBy` names no harness: those were all Claude Code's.
  compactByOnMovedLine: "unnamed",

  modelCatalog: "account",
  resolvesModelNames: false,
  unlistedModels: "claude-names",
  contextWindow: "hub",
  pictureTypes: CLAUDE_IMAGE_MEDIA_TYPES,

  // Started with what its launch says: setting sources and memory off.
  cleanStartRefused: null,
  permissionModes: PERMISSION_MODES,
  requiredOnEveryMachine: true,
  startsWithoutConversation: false,
  spills: true,
  // Its home login is one whole dir, no store of credentials.
  storeOAuthProviders: {},

  tools: {
    shell: SHELL,
    powershell: POWERSHELL,
    edit: EDIT,
    fetch: FETCH,
    search: SEARCH,
  },
  // Its list, `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet` and
  // `TodoWrite` (each in agent SDK 0.3.302's `BUILTIN_TOOL_NAMES`), and its
  // plan mode, `EnterPlanMode`/`ExitPlanMode`: CawCo's plan, the tasks and
  // to-dos it works on, replaces them.
  nativeTools: {
    subagents: ["Task", "Agent"],
    todos: [
      "TaskCreate",
      "TaskUpdate",
      "TaskList",
      "TaskGet",
      "TodoWrite",
      "EnterPlanMode",
      "ExitPlanMode",
    ],
    questions: ["AskUserQuestion"],
  },
  boardOnlyDenied: BOARD_ONLY,
  trimmerDenied: [...BOARD_ONLY, ...FETCH, ...SEARCH],
  // Denied-tool lists are written in its names: Claude Code refuses a
  // lowercase rule in settings.json.
  deniedTools: { by: "own-settings" },
  hooks: { runs: "harness" },

  // `.mcp.json`; `.claude/` settings (hooks, env, helpers, plugins),
  // `hooks`, `commands` and `skills` (`` !`cmd` `` lines, frontmatter
  // hooks), `agents`, `workflows` (JS scripts), `routines`,
  // `scheduled_tasks.json`, `loop.md` (scheduled prompts), `launch.json`
  // (the preview server's command), `output-styles`: Claude Code's own
  // write-protected list (CLI 0.3.302: `Ae(st(Z,".claude","launch.json")…
  // "workflows"…"routines"…"output-styles"…"scheduled_tasks.json"…
  // "loop.md"…".mcp.json")`).
  cloneConfig: {
    ".mcp.json": { kind: "file", text: '{"mcpServers":{}}\n' },
    [projectClaudeRelative("settings.json")]: EMPTY_JSON,
    [projectClaudeRelative("settings.local.json")]: EMPTY_JSON,
    [projectClaudeRelative("hooks")]: DIR,
    [projectClaudeRelative("commands")]: DIR,
    [projectClaudeRelative("agents")]: DIR,
    [PROJECT_SKILLS]: DIR,
    [projectClaudeRelative("workflows")]: DIR,
    [projectClaudeRelative("routines")]: DIR,
    [projectClaudeRelative("output-styles")]: DIR,
    // Its empty preview launch config: its version and no server ("Claude
    // automatically detects your dev server setup and stores the
    // configuration in `.claude/launch.json` … `{ "version": "0.0.1",
    // "configurations": [ … ] }`", code.claude.com/docs/en/desktop).
    [projectClaudeRelative("launch.json")]: {
      kind: "file",
      text: '{"version":"0.0.1","configurations":[]}\n',
    },
    // Its empty scheduled tasks: a `tasks` list with none. Its reader takes
    // anything else as no task too (CLI 0.3.302: `if(!r||typeof
    // r!=="object")return[];let i=r;if(!Array.isArray(i.tasks))return[]`).
    [projectClaudeRelative("scheduled_tasks.json")]: {
      kind: "file",
      text: '{"tasks":[]}\n',
    },
    [projectClaudeRelative("loop.md")]: EMPTY,
  },
  // Each config dir's login (the machine's own, each account's, any it was
  // pointed at), and the fleet's MCP servers with their headers and env.
  credentialPlaces: [
    { in: "claude-config-dirs", file: ".credentials.json" },
    { in: "claude-home-json" },
  ],

  custody: "keeper",
  // Its children predate the prefix: a bare id is Claude Code's.
  procIdPrefix: "",
  listsAllConversations: true,
  catalogProvesGone: true,
  readsStoredContext: true,
  readsThroughCli: false,
  sessionControls: [
    "installSessionCredential",
    "verifySessionCredential",
    "withdrawSend",
    "fleetMcpChanged",
    "fleetSettings",
    "fleetMcpHeal",
    "setEffort",
    "getContextUsage",
    "setPermissionMode",
    "interrupt",
    "setModel",
    "supportedModels",
    "supportedCommands",
    "reloadSkills",
    "reloadPlugins",
    "reinitialize",
    "mcpServerStatus",
    "reconnectMcpServer",
    "toggleMcpServer",
    "getTaskOutput",
  ],

  rewindAnchor: "assistant-before",
  queuesSends: true,
  promptCacheMaxMs: HOUR_MS,
  boundaryBeforeCompactionFailure: false,
  // Its subagent says it ended itself, in a `task_notification`: a
  // background one's call answers at once and the subagent runs on.
  subagentEndsWithCall: false,
  callNaming: {
    server: "mcp-prefix",
    skillCall: "none",
    turnSkill: "command-name",
  },
} as const satisfies HarnessDescriptor<"claude">;
