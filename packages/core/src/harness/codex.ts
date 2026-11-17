/**
 * Codex, described (core harness/descriptor.ts). Its adapter is agent
 * harnesses/codex.ts. Every value here rests on the Codex 0.169.0 audit of
 * 2026-11-17 (the project's `assets/f1ed8995/codex-harness-parity.md`), whose
 * probe each comment names (C-…).
 */
import { IMAGE_MEDIA_TYPES } from "../attachments";
import { CODEX_WORDS } from "../words/harness-plugins";
import type { HarnessDescriptor } from "./descriptor";

const DIR = { kind: "dir" } as const;

/**
 * Its tools by the names its hooks and CawCo's asks read them under: its
 * `exec_command` is `Bash` to a hook, `apply_patch` keeps its name, and a
 * namespaced tool is its namespace and name run together (C-a, C-deny).
 */
const SHELL = ["Bash"] as const;
const EDIT = ["apply_patch"] as const;
/** Its hosted web search, which no hook sees and only a config switch turns off (C-tools). */
const SEARCH = ["web_search"] as const;
/** Its subagent tools, `collaboration.*` (C-j, C-tools). */
const SUBAGENTS = [
  "collaborationspawn_agent",
  "collaborationsend_message",
  "collaborationfollowup_task",
  "collaborationwait_agent",
  "collaborationinterrupt_agent",
  "collaborationlist_agents",
] as const;
/** Its question tool, answered only in its plan collaboration mode, which CawCo never starts (C-h). */
const QUESTIONS = [
  "functionsrequest_user_input",
  "functionsrequest_user_input_async",
] as const;

export const CODEX = {
  kind: "codex",
  tool: "codex",
  words: CODEX_WORDS,

  // An account is a Codex home CawCo keeps under the account's own dir
  // (agent harnesses/codex-home.ts), signed in by Codex itself; its
  // conversations sit in one thread store every home on the machine shares,
  // so a session that changes account carries nothing.
  accountDir: false,
  // No machine sign-in moves in: CawCo never reads a Codex token, the
  // machine's `~/.codex` included (the owner's pick "Codex's own sign-in",
  // 2026-11-17).
  homeLogin: "none",
  soleProvider: null,
  // Its models are named `<provider>/<id>` by pi-ai's ids: a ChatGPT plan's
  // `openai-codex/…`, an OpenAI key's `openai/…`.
  ownProviderIds: false,
  providerLimit: "account",
  // Tokens priced at API rates, which a ChatGPT plan's work does not cost.
  costMeaning: "estimated",
  usage: {
    scanned: false,
    lacks:
      "CawCo does not scan Codex's usage files: its sessions report their tokens live, and its accounts' limits are read from the provider.",
  },
  compactByOnMovedLine: "named",

  modelCatalog: "machine",
  resolvesModelNames: false,
  // A model it is not offered fails its turn (`modelNotFound`).
  unlistedModels: "none",
  // Its turns report the model's window (`thread/tokenUsage/updated`
  // `modelContextWindow`, C-init), which the machine's catalog carries
  // from then on (agent harnesses/codex.ts `modelCatalog`).
  contextWindow: "catalog",
  // A picture goes to the model as an `input_image` data URL (C-g).
  pictureTypes: IMAGE_MEDIA_TYPES,

  // A thread started with no project AGENTS.md, no skills and a home with
  // no AGENTS.md of CawCo's reads none of them (C-o).
  cleanStartRefused: null,
  permissionModes: true,
  requiredOnEveryMachine: false,
  startsWithoutConversation: false,
  // It keeps a large output's head and tail and saves no file (C-s).
  spills: false,
  storeOAuthProviders: {},

  tools: {
    shell: SHELL,
    powershell: [],
    edit: EDIT,
    fetch: [],
    search: SEARCH,
  },
  // 0.169.0 offers the model no to-do or plan tool (its request's tools,
  // captured 2026-11-17: `exec`, `wait`, `request_user_input`,
  // `request_user_input_async`, `clock.sleep`, `collaboration.*`).
  nativeTools: { subagents: SUBAGENTS, todos: [], questions: QUESTIONS },
  boardOnlyDenied: [...SUBAGENTS, ...SHELL, ...EDIT],
  curatorDenied: [...SUBAGENTS, ...SHELL, ...EDIT, ...SEARCH],
  // Its hook names, by Claude Code's names in order. An MCP tool is
  // `mcp__<server>__<tool>` (C-d).
  deniedTools: {
    by: "equivalents",
    equivalents: {
      Agent: SUBAGENTS,
      AskUserQuestion: QUESTIONS,
      Bash: SHELL,
      Edit: EDIT,
      EnterPlanMode: [],
      EnterWorktree: [],
      ExitPlanMode: [],
      ExitWorktree: [],
      Glob: [],
      Grep: [],
      LS: [],
      Monitor: [],
      MultiEdit: EDIT,
      NotebookEdit: [],
      PowerShell: [],
      Read: [],
      Task: SUBAGENTS,
      TaskCreate: [],
      TaskGet: [],
      TaskList: [],
      TaskUpdate: [],
      TodoWrite: [],
      WebFetch: [],
      WebSearch: SEARCH,
      Workflow: [],
      Write: EDIT,
    },
    mcpPrefix: "mcp__",
    mcpSeparator: "__",
    mcpUnsafe: "[^A-Za-z0-9_-]",
  },
  // Codex runs them itself from the `hooks.json` in the account's Codex
  // home, its payloads Claude Code's (`hookSpecificOutput`,
  // `permissionDecision`), each trusted by its hash (C-a, C-b2).
  hooks: { runs: "harness" },

  // `.codex/` (config.toml, whose MCP servers ran on the host: C-k; hooks,
  // rules, agents) and the repo plugin marketplace. `.agents/skills` is
  // pi's entry too, and stands there once. The adapter also marks every
  // clone untrusted before its first thread (C-k3).
  cloneConfig: {
    ".codex": DIR,
    ".agents/plugins": DIR,
  },
  // The machine's own Codex sign-in. CawCo's homes sit under its data dir,
  // which no workspace reads.
  credentialPlaces: [{ in: "home", path: ".codex" }],

  custody: "keeper",
  procIdPrefix: "codex:",
  // A machine's listing is its thread store's, filtered by folder.
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
    "supportedModels",
    "supportedCommands",
    "reloadSkills",
    "mcpServerStatus",
    "getContextUsage",
  ],

  rewindAnchor: "user-turn",
  queuesSends: false,
  promptCacheMaxMs: null,
  boundaryBeforeCompactionFailure: false,
  subagentEndsWithCall: false,
  callNaming: {
    server: "mcp-prefix",
    skillCall: "read-skill-file",
    turnSkill: "command-name",
  },
} as const satisfies HarnessDescriptor<"codex">;
