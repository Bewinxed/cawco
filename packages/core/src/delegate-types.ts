/**
 * Delegate types: named presets a calling agent selects via the `delegate`
 * tool's `type` param, so routing is by description ("explore the codebase")
 * instead of a raw model string the caller has to already know. The hub owns
 * the fleet-wide set; a daemon resolves a name against it before it ever
 * builds a `SpawnPayload`.
 */

import {
  EFFORT_LEVELS,
  type EffortLevel,
  HARNESSES,
  type HarnessKind,
  harnessNamed,
} from "./harness";
import { delegateTypesWords } from "./words/delegate-types";

/** One named preset. `name` is the key a `delegate` call's `type` asks for. */
export interface DelegateType {
  /**
   * The account its sessions prefer, when placement allows it (the machine,
   * project and task allow it, and it is not benched or past its reserve).
   * Absent: the provider's strategy chooses.
   */
  account?: string;
  /**
   * Whether a delegate of this type may itself delegate (or start sessions)
   * when the `delegate` call did not say. `false` (and absent) means a leaf —
   * the same default a bare `delegate` call gets; `true` makes the type a
   * coordinator by default. An explicit `can_delegate` on the call still wins.
   */
  canDelegate?: boolean;
  /**
   * Always true: every session keeps CawCo's list, whatever its type. Still
   * sent because the apps on TestFlight 20261015 through 20261018 read it
   * (hub openapi.ts's wire check) and send it back on a save, which the hub
   * ignores; nothing reads it here. It goes in the change that expires those
   * builds.
   */
  cawcoTodos?: true;
  /**
   * The connections (Projects spec §5.5) its sessions may call, by name: the
   * hub lists each one's tools to them as `conn__<name>__<tool>` and runs
   * every call itself, so no key reaches the session. A project type file
   * says `mcp: [x-brand]`.
   */
  connections?: string[];
  denyTools?: string[];
  /** What the calling model reads to decide whether this is the right type. */
  description: string;
  /** How hard the model thinks: the same {@link EffortLevel} scale every other effort control uses. */
  effort?: EffortLevel;
  harness: HarnessKind;
  model: string;
  /** Unique across the fleet; what a `delegate` call's `type` param names. */
  name: string;
  /**
   * The toolset its sessions run in ({@link SESSION_ROLES}): a project type's
   * `role:` (delegates/*.md). Absent: a delegate's.
   */
  role?: SessionRole;
  skills?: string[];
}

/** What a name may be. Mirrors a subagent's own `AGENT_NAME` — no reason to invent a second rule. */
export const DELEGATE_TYPE_NAME = /^[a-z][a-z0-9-]*$/u;

/**
 * What a connection's name may be (`github-petra`, `x-brand`): no `_`, so a
 * session's `conn__<name>__<tool>` splits one way only; at most 24
 * characters, so its tools' names keep room under a harness's tool-name
 * limit (connections.ts `sessionToolName`).
 */
export const CONNECTION_NAME = /^(?=.{1,24}$)[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** The tool name a session calls a connection's `tool` by. */
export const connectionToolName = (connection: string, tool: string): string =>
  `conn__${connection}__${tool}`;

const CONNECTION_TOOL = /^conn__([a-z0-9]+(?:-[a-z0-9]+)*)__(.+)$/u;

/** A session's connection tool name, split; undefined for any other tool. */
export const parseConnectionTool = (
  name: string
): { connection: string; tool: string } | undefined => {
  const match = CONNECTION_TOOL.exec(name);
  return match?.[1] && match[2]
    ? { connection: match[1], tool: match[2] }
    : undefined;
};

/**
 * Why this row cannot be stored, in a sentence, or nothing when it can. One
 * rule for the hub's refusal and any editor built on top of it.
 */
export const delegateTypeProblem = (
  draft: Partial<DelegateType>
): string | undefined => {
  if (!(draft.name && DELEGATE_TYPE_NAME.test(draft.name))) {
    return delegateTypesWords.problemName;
  }
  if (!draft.description?.trim()) {
    return delegateTypesWords.problemDescription;
  }
  if (!(draft.harness && harnessNamed(draft.harness))) {
    return delegateTypesWords.problemHarness(String(draft.harness));
  }
  if (!draft.model?.trim()) {
    return delegateTypesWords.problemModel;
  }
  if (draft.effort && !EFFORT_LEVELS.includes(draft.effort)) {
    return `“${draft.effort}” is not an effort level`;
  }
  const badConnection = (draft.connections ?? []).find(
    (name) => !CONNECTION_NAME.test(name)
  );
  if (badConnection !== undefined) {
    return `“${badConnection}” is not a connection name: up to 24 lowercase letters, digits and hyphens`;
  }
  // A deny list is kept only where its harness enforces it: a type that names
  // tools its harness cannot deny would store a promise nothing keeps.
  return denyToolsProblem(draft.harness, draft.denyTools ?? []);
};

/**
 * Each harness's own tools for the two things CawCo keeps itself (Projects
 * spec §5.2, §5.6): native subagents (the fleet's "delegates instead of
 * subagents" choice) and the native to-do list with its plan mode, which
 * every session is denied: a session's plan is CawCo's list (`todo_write`'s
 * session scope, core plan.ts), always.
 *
 * - Claude Code: its list, `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`
 *   and `TodoWrite` (each in agent SDK 0.3.302's `BUILTIN_TOOL_NAMES`), and
 *   its plan mode, `EnterPlanMode`/`ExitPlanMode`: the session's spec,
 *   written through CawCo, replaces it.
 * - OpenCode 2.0 has no list ("The `todowrite` tool is no longer available
 *   and must not be called", 2.0.29's V2 migration; no `todoread` at all);
 *   its plan mode is an agent, `plan`, which the OpenCode adapter turns off
 *   on every server it launches.
 * - pi has neither (1.3.0's built-ins are `read`, `bash`, `powershell`,
 *   `edit`, `write`, `grep`, `find` and `ls`).
 *
 * And the harness's own question tool, which every session CawCo starts is
 * denied: a question to the person is CawCo's `ask` (hub asks.ts), which
 * answers at once and keeps the question. Claude Code's `AskUserQuestion`;
 * OpenCode's `question`; pi has none.
 */
export const NATIVE_TOOLS = {
  subagents: { claude: ["Task", "Agent"], opencode: ["subagent"], pi: [] },
  todos: {
    claude: [
      "TaskCreate",
      "TaskUpdate",
      "TaskList",
      "TaskGet",
      "TodoWrite",
      "EnterPlanMode",
      "ExitPlanMode",
    ],
    opencode: [],
    pi: [],
  },
  questions: { claude: ["AskUserQuestion"], opencode: ["question"], pi: [] },
} as const satisfies Record<string, Record<HarnessKind, readonly string[]>>;

/**
 * What every session is denied beside the fleet's baseline, in Claude Code's
 * names (the OpenCode and pi adapters read each as their own tool, and find
 * none): the harness's own list and its plan mode. Added at spawn and to the
 * machine's own `claude` settings, so no stored list carries the names.
 */
export const OWN_LIST_DENIED: readonly string[] = NATIVE_TOOLS.todos.claude;

/**
 * The harness's own question tool, in Claude Code's name (the OpenCode
 * adapter reads it as `question`; pi has none): denied to every session at
 * spawn, never to the machine's own `claude`, so a question goes through
 * CawCo's `ask` (core `NATIVE_TOOLS.questions`).
 */
export const QUESTION_TOOL_DENIED: readonly string[] =
  NATIVE_TOOLS.questions.claude;

/**
 * The toolsets a session runs in (Projects spec §5.3: one `cawco` server, a
 * toolset per role). A session's credential names its row, and the row its
 * role: `lead` is a project's Caw, `web-facing` a session that reads the
 * outside world and so gets no posting or admin tools, `overseer` fleet-watch
 * triage, `curator` a project's memory curator run (the hub starts it, never
 * a type). A row with none is a `delegate` when something delegated it, else
 * a `worker` (a session you started).
 */
export const SESSION_ROLES = [
  "worker",
  "delegate",
  "lead",
  "overseer",
  "web-facing",
  "curator",
] as const;
export type SessionRole = (typeof SESSION_ROLES)[number];

/**
 * Each harness's own tools of the kinds CawCo's permissions read, by the
 * name the harness calls and asks under: one table, so a rule written for a
 * kind (the lead gate's shells, web-reads.ts's taint, a push's open-only
 * asks) holds the same on every harness, and a new harness fails the types
 * until its names are given here.
 *
 * - `shell`: a POSIX shell. Claude Code's `Bash`, OpenCode 2.0's `shell`
 *   (its permission action, opencode.ai/v2/docs/permissions), pi 1.3.0's
 *   `bash`.
 * - `powershell`: Claude Code's Windows `PowerShell` (agent SDK 0.3.302's
 *   `BUILTIN_TOOL_NAMES`), pi 1.3.0's built-in `powershell`
 *   (dist/core/tools/index.js); OpenCode 2.0 has none.
 * - `edit`: the tools that write files, by the name each asks permission
 *   under. Claude Code's `Edit`, `Write`, `MultiEdit` and `NotebookEdit`;
 *   OpenCode 2.0's `edit`, which covers `write` and `patch` ("In V2, use
 *   permissions, shell, and subagent instead of permission, bash, and
 *   task", opencode.ai/v2/docs/permissions); pi 1.3.0's `edit` and `write`.
 * - `fetch` and `search`: the built-in web tools. Claude Code's `WebFetch`
 *   and `WebSearch`, OpenCode 2.0's `webfetch` and `websearch`; pi has no
 *   web tool of its own ({@link PI_EQUIVALENTS}).
 */
export const HARNESS_TOOLS = {
  claude: {
    shell: ["Bash"],
    powershell: ["PowerShell"],
    edit: ["Edit", "Write", "MultiEdit", "NotebookEdit"],
    fetch: ["WebFetch"],
    search: ["WebSearch"],
  },
  opencode: {
    shell: ["shell"],
    powershell: [],
    edit: ["edit"],
    fetch: ["webfetch"],
    search: ["websearch"],
  },
  pi: {
    shell: ["bash"],
    powershell: ["powershell"],
    edit: ["edit", "write"],
    fetch: [],
    search: [],
  },
} as const satisfies Record<
  HarnessKind,
  Record<
    "edit" | "fetch" | "powershell" | "search" | "shell",
    readonly string[]
  >
>;

/** A kind of tool {@link HARNESS_TOOLS} names on each harness. */
export type HarnessToolKind = keyof (typeof HARNESS_TOOLS)[HarnessKind];

/** Every harness's tools of `kinds`, by their own names ({@link HARNESS_TOOLS}). */
const harnessToolsOf = (
  ...kinds: readonly HarnessToolKind[]
): ReadonlySet<string> =>
  new Set(
    HARNESSES.flatMap((harness) =>
      kinds.flatMap((kind) => HARNESS_TOOLS[harness][kind])
    )
  );

/** The shell tools, by every harness's name: what a session's turn runs commands with, and what web-reads.ts reads a command of. */
export const SHELL_TOOLS = harnessToolsOf("shell", "powershell");
/** The PowerShell tools, by every harness's name: shells whose lines a POSIX reader cannot read. */
export const POWERSHELL_TOOLS = harnessToolsOf("powershell");
/** The harnesses' own web fetch tools, by every harness's name: a URL argument decides whether one read the web. */
export const WEB_FETCH_TOOLS = harnessToolsOf("fetch");
/** The harnesses' own web search tools, by every harness's name: always a read of the web. */
export const WEB_SEARCH_TOOLS = harnessToolsOf("search");

/**
 * The CawCo tools a leaf delegate (`canDelegate === false`) never gets:
 * everything that spawns, steers a spawn or reads its spawns. The hub leaves
 * them out of a claude or pi session's toolset (hub delegation-tools.ts); an
 * OpenCode session's permission rules deny them by their `cawco_` names
 * (agent opencode-session.ts). Fixed for the session's life, so the prompt
 * cache is unaffected.
 */
export const SPAWNING_TOOLS: ReadonlySet<string> = new Set([
  "start_session",
  "continue_session",
  "delegate",
  "delegate_list",
  "stop_delegate",
  "interrupt_delegate",
  "answer_delegate",
  "discard_workspace",
  // It stops every turn on a machine: an orchestrator's, never a leaf's.
  "machine_pause",
]);

/**
 * What a session on the board alone may never call: no subagent, monitor,
 * worktree, shell or edit tool. A fleet-watch triage run (`overseer`)
 * decides one thing and exits. Claude's `Monitor` runs a script and
 * `EnterWorktree`/`ExitWorktree` make and remove git worktrees; `Agent` (its
 * old name `Task`) and `Workflow` start subagents; OpenCode's `Agent` is its
 * `subagent`. pi has no subagent, monitor or worktree tool.
 */
export const BOARD_ONLY_DENIED_TOOLS = {
  claude: [
    "Monitor",
    "EnterWorktree",
    "ExitWorktree",
    "Agent",
    "Task",
    "Workflow",
    ...HARNESS_TOOLS.claude.shell,
    ...HARNESS_TOOLS.claude.powershell,
    ...HARNESS_TOOLS.claude.edit,
  ],
  opencode: ["Agent", "Bash", "Edit", "Write"],
  pi: [
    ...HARNESS_TOOLS.pi.powershell,
    ...HARNESS_TOOLS.pi.shell,
    ...HARNESS_TOOLS.pi.edit,
  ],
} as const satisfies Record<HarnessKind, readonly string[]>;

/** Claude Code's web tools, the names a denied-tool list is written in (the OpenCode adapter maps each to its own). */
const CLAUDE_WEB_TOOLS = [
  ...HARNESS_TOOLS.claude.fetch,
  ...HARNESS_TOOLS.claude.search,
] as const;

/**
 * What a project's memory curator may never call (Projects spec §5.4): the
 * board-only list, and the web. It reads agents' inbox notes, which are
 * untrusted words, and answers only with proposals the person approves; it
 * has no reason to fetch anything, so a note cannot send it to a page. It
 * gets CawCo's MCP server and no other (`SpawnPayload.fence`).
 */
export const CURATOR_DENIED_TOOLS = {
  claude: [...BOARD_ONLY_DENIED_TOOLS.claude, ...CLAUDE_WEB_TOOLS],
  opencode: [...BOARD_ONLY_DENIED_TOOLS.opencode, ...CLAUDE_WEB_TOOLS],
  // pi has no web tool of its own ({@link PI_EQUIVALENTS}), and a fenced pi
  // session has none from anywhere else (agent pi-runtime.ts `cawcosExtensionsAlone`).
  pi: BOARD_ONLY_DENIED_TOOLS.pi,
} as const satisfies Record<HarnessKind, readonly string[]>;

/**
 * Claude Code's tool names as OpenCode 2.0's permission actions. Denied-tool
 * lists (the fleet baseline, a delegate type's, a spawn's) are written in
 * Claude's names — Claude Code refuses a lowercase rule in settings.json —
 * so the OpenCode adapter reads them through this. 2.0's file writers
 * (`write`, `patch`) ask as `edit`, so `Write` denies `edit` too. Its to-do
 * list, plan-mode tools and `LS` do not exist in 2.0 (a directory is read by
 * `read`): those names deny nothing there, and are no tool to refuse.
 */
const OPENCODE_EQUIVALENTS: Record<string, readonly string[]> = {
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
};

const CLAUDE_MCP_TOOL = /^mcp__([^_]+(?:_[^_]+)*?)(?:__(.+))?$/u;
const OPENCODE_UNSAFE = /[^A-Za-z0-9_-]/gu;
const LOWERCASE_START = /^[a-z]/u;

/**
 * A harness's tool ids for a denied-tool list: a Claude name through
 * `equivalents`; `mcp__server__tool` through `mcpId`, with each character
 * `unsafe` matches as `_` (a bare `mcp__server` or `mcp__server__*` is every
 * tool of it, `*`); a lowercase name as it is, already the harness's form.
 * Anything else is `unmapped`.
 */
const harnessToolsFor = (
  names: readonly string[],
  equivalents: Record<string, readonly string[]>,
  unsafe: RegExp,
  mcpId: (server: string, tool: string) => string
): { tools: string[]; unmapped: string[] } => {
  const tools = new Set<string>();
  const unmapped: string[] = [];
  for (const name of names) {
    const mcp = CLAUDE_MCP_TOOL.exec(name);
    if (mcp) {
      const tool = mcp[2] ?? "*";
      tools.add(
        mcpId(
          mcp[1].replace(unsafe, "_"),
          tool === "*" ? "*" : tool.replace(unsafe, "_")
        )
      );
    } else if (equivalents[name]) {
      for (const id of equivalents[name]) {
        tools.add(id);
      }
    } else if (LOWERCASE_START.test(name)) {
      tools.add(name);
    } else {
      unmapped.push(name);
    }
  }
  return { tools: [...tools], unmapped };
};

/**
 * OpenCode's tool ids for a denied-tool list. A Claude name with an OpenCode
 * equivalent maps to it; `mcp__server__tool` becomes OpenCode's
 * `server_tool` (a bare `mcp__server` or `mcp__server__*` every tool of
 * it); a name already in OpenCode's lowercase form passes through. Anything
 * else is `unmapped`: OpenCode has no tool by that name to deny.
 */
export const opencodeToolsFor = (
  names: readonly string[]
): { tools: string[]; unmapped: string[] } =>
  harnessToolsFor(
    names,
    OPENCODE_EQUIVALENTS,
    OPENCODE_UNSAFE,
    (server, tool) => `${server}_${tool}`
  );

/**
 * Claude Code's tool names as pi's (1.3.0): its built-ins `read`, `bash`,
 * `powershell`, `edit`, `write`, `grep`, `find` and `ls`. pi has no
 * subagent, monitor, worktree, workflow, to-do, plan-mode, notebook or web
 * tool: those names deny nothing there, and are no tool to refuse.
 */
const PI_EQUIVALENTS: Record<string, readonly string[]> = {
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
};

/** What pi turns into `_` in an MCP tool's name: "every character other than letters, digits, and `_`" (pi docs/mcp.md). */
const PI_MCP_UNSAFE = /[^A-Za-z0-9_]/gu;

/**
 * pi's tool names (or `*` patterns, which pi's `excludeTools` matches) for a
 * denied-tool list. A Claude name with a pi equivalent maps to it;
 * `mcp__server__tool` becomes pi's `mcp__<server>__<tool>` with its
 * characters as pi writes them (a bare `mcp__server` or `mcp__server__*`
 * every tool of it); a name already in pi's lowercase form passes through.
 * Anything else is `unmapped`: pi has no tool by that name to deny.
 */
export const piToolsFor = (
  names: readonly string[]
): { tools: string[]; unmapped: string[] } =>
  harnessToolsFor(
    names,
    PI_EQUIVALENTS,
    PI_MCP_UNSAFE,
    (server, tool) => `mcp__${server}__${tool}`
  );

/**
 * Why `harness` cannot carry this denied-tool list, in a sentence, or nothing
 * when it can. Claude denies by its own settings; OpenCode through its
 * session config, pi through its session's `excludeTools`, each for the
 * names it has an equivalent for ({@link opencodeToolsFor},
 * {@link piToolsFor}). A name nothing would enforce is refused rather than
 * stored as a promise.
 */
export const denyToolsProblem = (
  harness: HarnessKind,
  names: readonly string[]
): string | undefined => {
  if (names.length === 0 || harness === "claude") {
    return undefined;
  }
  const { unmapped } =
    harness === "opencode" ? opencodeToolsFor(names) : piToolsFor(names);
  const label = harness === "opencode" ? "OpenCode" : "pi";
  return unmapped.length > 0
    ? `${label} has no tool for ${unmapped.map((name) => `“${name}”`).join(", ")}, so it cannot deny ${unmapped.length === 1 ? "it" : "them"}`
    : undefined;
};

/**
 * The fleet's seed set (inserted once, only when the table is empty): one type
 * per effort level, each description saying which tasks that level fits, so a
 * caller routes by how much verification and judgement the work needs.
 */
export const DEFAULT_DELEGATE_TYPES: DelegateType[] = [
  {
    name: "low",
    description:
      "Fastest pass: the leaf does what the brief says, checks it against a case or two, and stops. Use it when the brief leaves nothing to decide or you want a draft to react to: mechanical edits across many files (renames, copy or config sweeps, a listed set of replacements), inventories and where-is sweeps, log and evidence pulls, quick sketches and prototypes. Not for bug fixes, reviews, security, parsers, migrations, or anything where a missed edge case ships.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "low",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "medium",
    description:
      "The default for most delegated work: carrying out a complete spec (new features, multi-file changes, UI built from a spec, doc rewrites, deploys with known steps) and wide research sweeps that return a cited report. It runs the brief's build, lint, type-check and verification command, but does not hunt edge cases beyond the brief. Given a complete spec, the higher levels write much the same code more slowly and add assumptions of their own. Not for bugs with an unknown cause, reviews, verification passes, or security: use `high`.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "medium",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "high",
    description:
      "For work where verification and hidden edge cases decide the result: fixing a bug in an existing codebase, reviewing a diff into ranked file:line findings, the verification pass after a `low` or `medium` build, browser verification of a flow, a security review of a change, and performance work. Also architecture plans and analyses where the method chosen changes the answer. Takes about 1.5–3x as long as `medium`. Code whose edge cases are the whole job goes to `xhigh`. More effort does not fix a wrong approach: rewrite the brief instead.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "high",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "xhigh",
    description:
      "Between `high` and `max`, for code whose edge cases are the whole job and where one missed case ships as a defect: sanitizers, parsers, storage engines, concurrency, auth, data migrations, or a fix `high` got only partly right. In Anthropic's storage-engine bug task the xhigh runs reproduced the crash before editing and went from 0/5 at low to 4/5, at about 11 min a run. It stays on one problem, so it costs far less than `max`. Not for spec-complete builds (`medium`) or ordinary reviews (`high`).",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "xhigh",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "max",
    description:
      "For long, fully autonomous runs on hard problems: building and verifying a whole app or subsystem end to end, a vulnerability hunt in critical code, or a problem an `xhigh` leaf failed on by missing edge cases. The slowest and most expensive level by far (one spec'd build took 79 min at max against 22 at medium), and the one that makes the most assumptions on your behalf, so the brief must settle every product decision. Not for routine features, work you plan to iterate on, or a leaf that took the wrong approach.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "max",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
];
