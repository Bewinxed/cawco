/**
 * OpenCode, described (core harness/descriptor.ts). Its adapter is agent
 * harnesses/opencode.ts.
 */
import { IMAGE_MEDIA_TYPES } from "../attachments";
import { OPENCODE_NOT_CLEAN, OPENCODE_WORDS } from "../words/harness-plugins";
import type { HarnessDescriptor } from "./descriptor";

/**
 * Its empty config: its schema alone. OpenCode writes `$schema` into a
 * config file that has none ("if (!data.$schema) { … fs.writeFileString(
 * options.path, updated)", `loadConfig` in packages/opencode/src/config/
 * config.ts at v1.18.34), so a `{}` stand-in is written over on the host.
 */
const EMPTY_CONFIG = {
  kind: "file",
  text: '{"$schema":"https://opencode.ai/config.json"}\n',
} as const;

export const OPENCODE = {
  kind: "opencode",
  tool: "opencode",
  words: OPENCODE_WORDS,

  accountDir: false,

  mcpPerFolder: true,
  homeLogin: "credentials",
  soleProvider: null,
  ownProviderIds: true,
  providerLimit: "go",
  costMeaning: "real",
  usage: { scanned: true },
  compactByOnMovedLine: "named",

  modelCatalog: "machine",
  resolvesModelNames: false,
  // It drops a bare id's model (agent opencode.ts `splitModel`).
  unlistedModels: "none",
  contextWindow: "catalog",
  pictureTypes: IMAGE_MEDIA_TYPES,

  cleanStartRefused: OPENCODE_NOT_CLEAN,
  permissionModes: true,
  requiredOnEveryMachine: false,
  startsWithoutConversation: true,
  spills: true,
  // Its `openai` OAuth sign-in is ChatGPT's.
  storeOAuthProviders: { openai: "openai-codex" },

  // 2.0's permission actions (opencode.ai/v2/docs/permissions): `shell`;
  // `edit`, which covers `write` and `patch` ("In V2, use permissions,
  // shell, and subagent instead of permission, bash, and task"); its web
  // tools. It has no PowerShell.
  tools: {
    shell: ["shell"],
    powershell: [],
    edit: ["edit"],
    fetch: ["webfetch"],
    search: ["websearch"],
  },
  // 2.0 has no list ("The `todowrite` tool is no longer available and must
  // not be called", 2.0.29's V2 migration; no `todoread` at all); its plan
  // mode is an agent, `plan`, which the adapter turns off on every server it
  // launches.
  nativeTools: { subagents: ["subagent"], todos: [], questions: ["question"] },
  // In Claude Code's names, which its denied-tool list maps: its `Agent` is
  // its `subagent`.
  boardOnlyDenied: ["Agent", "Bash", "Edit", "Write"],
  curatorDenied: ["Agent", "Bash", "Edit", "Write", "WebFetch", "WebSearch"],
  // Its permission actions. 2.0's file writers (`write`, `patch`) ask as
  // `edit`, so `Write` denies `edit` too. Its to-do list, plan-mode tools
  // and `LS` do not exist in 2.0 (a directory is read by `read`): those
  // names deny nothing there.
  deniedTools: {
    by: "equivalents",
    equivalents: {
      Agent: ["subagent"],
      Task: ["subagent"],
      TaskCreate: [],
      TaskUpdate: [],
      TaskList: [],
      TaskGet: [],
      TodoWrite: [],
      EnterPlanMode: [],
      ExitPlanMode: [],
      AskUserQuestion: ["question"],
      Bash: ["shell"],
      Edit: ["edit"],
      Write: ["edit"],
      Read: ["read"],
      Glob: ["glob"],
      Grep: ["grep"],
      LS: [],
      WebFetch: ["webfetch"],
      WebSearch: ["websearch"],
      Skill: ["skill"],
    },
    mcpPrefix: "",
    mcpSeparator: "_",
    mcpUnsafe: "[^A-Za-z0-9_-]",
  },
  // CawCo's plugin runs them, on 2.0's plugin tool hooks, `execute.before`
  // and `execute.after` ("Inspect or replace tool input before execution",
  // opencode.ai/v2/docs/build/plugins). Its tools as 2.0.29 defines them
  // (`o({path:…,content:…})` for `write`).
  hooks: {
    runs: "cawco",
    events: ["PreToolUse", "PostToolUse", "PostToolUseFailure"],
    toolNames: {
      shell: { name: "Bash" },
      read: { name: "Read", input: { path: "file_path" } },
      write: { name: "Write", input: { path: "file_path" } },
      edit: {
        name: "Edit",
        input: {
          path: "file_path",
          oldString: "old_string",
          newString: "new_string",
          replaceAll: "replace_all",
        },
      },
      patch: { name: "Edit" },
      glob: { name: "Glob" },
      grep: { name: "Grep" },
      webfetch: { name: "WebFetch" },
      websearch: { name: "WebSearch" },
      subagent: { name: "Agent" },
      skill: { name: "Skill" },
    },
  },

  // `opencode.json(c)` and `.opencode/` (plugins, commands' shell blocks,
  // MCP commands), from cwd to the filesystem root
  // (opencode.ai/v2/docs/config). Its `.agents/skills` is pi's entry too,
  // and stands there once.
  cloneConfig: {
    "opencode.json": EMPTY_CONFIG,
    "opencode.jsonc": EMPTY_CONFIG,
    // Its config dir, empty and read-only. OpenCode writes a `.gitignore`
    // into each `.opencode` dir it loads and installs `@opencode-ai/plugin`
    // there (`ensureGitignore`, `npm.install` in the same file); without
    // write bits both fail quietly, and the clone loads as one without
    // `.opencode` does (OpenCode 1.18.34: `/config` and `/agent` the same).
    ".opencode": { kind: "dir", readOnly: true },
  },
  // `auth.json`, `mcp-auth.json`; `opencode.json` with provider keys and
  // MCP headers.
  credentialPlaces: [
    { in: "xdg-data", path: "opencode" },
    { in: "xdg-config", path: "opencode" },
  ],

  custody: "server",
  // Its sessions live in its server, no keeper's children.
  procIdPrefix: null,
  listsAllConversations: false,
  catalogProvesGone: false,
  readsStoredContext: false,
  readsThroughCli: true,
  sessionControls: [
    "installSessionCredential",
    "verifySessionCredential",
    "interrupt",
    "setModel",
    "setEffort",
    "setPermissionMode",
    "getContextUsage",
    "supportedModels",
    "supportedCommands",
    "reloadSkills",
    "mcpServerStatus",
    "reconnectMcpServer",
    "toggleMcpServer",
    "fleetMcpChanged",
    "fleetMcpHeal",
  ],

  rewindAnchor: "user-turn",
  queuesSends: false,
  promptCacheMaxMs: null,
  boundaryBeforeCompactionFailure: true,
  // Its `subagent` ends with its call's result.
  subagentEndsWithCall: true,
  // `<server>_<tool>`, read by the longest known server it starts with.
  callNaming: {
    server: "longest-known",
    skillCall: "none",
    turnSkill: "command-name",
  },
} as const satisfies HarnessDescriptor<"opencode">;
