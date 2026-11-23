/**
 * pi, described (core harness/descriptor.ts). Its adapter is agent
 * harnesses/pi.ts.
 */
import { IMAGE_MEDIA_TYPES } from "../attachments";
import { PI_WORDS } from "../words/harness-plugins";
import type { HarnessDescriptor } from "./descriptor";

const DIR = { kind: "dir" } as const;

/** Its built-in shells (1.3.0, dist/core/tools/index.js). */
const SHELL = ["bash"] as const;
const POWERSHELL = ["powershell"] as const;
const EDIT = ["edit", "write"] as const;

export const PI = {
  kind: "pi",
  tool: "pi",
  words: PI_WORDS,

  accountDir: false,

  mcpPerFolder: false,
  homeLogin: "credentials",
  soleProvider: null,
  ownProviderIds: false,
  providerLimit: "none",
  costMeaning: "real",
  usage: {
    scanned: false,
    lacks:
      "CawCo does not scan pi's usage yet: its sessions report their spend, and no limit.",
  },
  compactByOnMovedLine: "named",

  modelCatalog: "machine",
  resolvesModelNames: true,
  // Its own resolver takes a bare id unique among its providers' rows
  // (agent pi-services.ts `resolvePiModel`).
  unlistedModels: "unique-bare-id",
  contextWindow: "catalog",
  pictureTypes: IMAGE_MEDIA_TYPES,

  // Its resource loader starts without context files, skills or extensions.
  cleanStartRefused: null,
  permissionModes: [],
  requiredOnEveryMachine: false,
  startsWithoutConversation: false,
  spills: true,
  // Its store names each provider by pi-ai's id, the accounts' own.
  storeOAuthProviders: {},

  // It has no web tool of its own.
  tools: {
    shell: SHELL,
    powershell: POWERSHELL,
    edit: EDIT,
    fetch: [],
    search: [],
  },
  // Neither a list nor plan mode, a question tool nor subagents (1.3.0's
  // built-ins are `read`, `bash`, `powershell`, `edit`, `write`, `grep`,
  // `find` and `ls`).
  nativeTools: { subagents: [], todos: [], questions: [] },
  // It has no subagent, monitor or worktree tool.
  boardOnlyDenied: [...POWERSHELL, ...SHELL, ...EDIT],
  // It has no web tool of its own, and a fenced pi session has none from
  // anywhere else (agent pi-runtime.ts `cawcosExtensionsAlone`).
  curatorDenied: [...POWERSHELL, ...SHELL, ...EDIT],
  // Its names (or `*` patterns, which its `excludeTools` matches). It has no
  // subagent, monitor, worktree, workflow, to-do, plan-mode, notebook or web
  // tool: those names deny nothing there. An MCP tool is
  // `mcp__<server>__<tool>`, every character other than letters, digits
  // and `_` written `_` (pi docs/mcp.md).
  deniedTools: {
    by: "equivalents",
    equivalents: {
      Agent: [],
      Task: [],
      Workflow: [],
      Monitor: [],
      EnterWorktree: [],
      ExitWorktree: [],
      TaskCreate: [],
      TaskUpdate: [],
      TaskList: [],
      TaskGet: [],
      TodoWrite: [],
      EnterPlanMode: [],
      ExitPlanMode: [],
      AskUserQuestion: [],
      NotebookEdit: [],
      WebFetch: [],
      WebSearch: [],
      Bash: ["bash"],
      PowerShell: ["powershell"],
      Edit: ["edit"],
      MultiEdit: ["edit"],
      Write: ["write"],
      Read: ["read"],
      Glob: ["find"],
      Grep: ["grep"],
      LS: ["ls"],
    },
    mcpPrefix: "mcp__",
    mcpSeparator: "__",
    mcpUnsafe: "[^A-Za-z0-9_]",
  },
  // CawCo's inline extension runs them, on pi's extension events:
  // `tool_call` ("can mutate input or block execution"), `tool_result`,
  // `session_start`, `before_agent_start` and `agent_end` (pi 1.3.0
  // docs/extensions.md). Its tools' `edit` keeps its `edits` as they are.
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
      bash: { name: "Bash" },
      powershell: { name: "PowerShell" },
      read: { name: "Read", input: { path: "file_path" } },
      write: { name: "Write", input: { path: "file_path" } },
      edit: { name: "Edit", input: { path: "file_path" } },
      ls: { name: "LS" },
      find: { name: "Glob" },
      grep: { name: "Grep" },
    },
  },

  // `.pi/` (extensions, packages, `mcp.json`, settings; CawCo's pi takes
  // every folder as trusted, agent pi-runtime.ts `SettingsManager.create`).
  // "A bare `.pi` directory does not require project trust" (pi docs), so
  // an empty one stands in. `.agents/skills` is OpenCode's too.
  cloneConfig: {
    ".pi": DIR,
    ".agents/skills": DIR,
  },
  // `auth.json`, the CLIProxyAPI key; CLIProxyAPI's own logins.
  credentialPlaces: [
    { in: "pi-agent-dir" },
    { in: "home", path: ".cli-proxy-api" },
  ],

  custody: "keeper",
  procIdPrefix: "pi:",
  listsAllConversations: true,
  catalogProvesGone: false,
  readsStoredContext: false,
  readsThroughCli: false,
  sessionControls: [
    "installSessionCredential",
    "verifySessionCredential",
    "refreshCawcoTools",
    "fleetMcpChanged",
    "fleetMcpHeal",
    "interrupt",
    "setModel",
    "setEffort",
    "supportedModels",
    "supportedCommands",
    "reloadSkills",
    "reconnectMcpServer",
    "toggleMcpServer",
    "getContextUsage",
  ],

  rewindAnchor: "assistant-before",
  queuesSends: false,
  promptCacheMaxMs: null,
  boundaryBeforeCompactionFailure: false,
  subagentEndsWithCall: false,
  // Its prefix lost each `-`, so it is given back the name of the server it
  // stands for; a skill is loaded by reading its SKILL.md, and a turn names
  // one as an expanded `/skill:x`.
  callNaming: {
    server: "mcp-prefix-safe",
    skillCall: "read-skill-file",
    turnSkill: "skill-tag",
  },
} as const satisfies HarnessDescriptor<"pi">;
