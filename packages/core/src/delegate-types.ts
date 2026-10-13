/**
 * Delegate types: named presets a calling agent selects via the `delegate`
 * tool's `type` param, so routing is by description ("explore the codebase")
 * instead of a raw model string the caller has to already know. The hub owns
 * the fleet-wide set; a daemon resolves a name against it before it ever
 * builds a `SpawnPayload`.
 */

import { EFFORT_LEVELS, type EffortLevel, type HarnessKind } from "./harness";

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
   * "CawCo's to-dos" for this type's sessions, whatever the fleet says
   * (§5.2, "changeable later in Settings and per delegate type"). Denied
   * lists only union, so a type can turn the choice on, never off: absent or
   * false leaves it to the fleet. A project type file says `cawco_todos: true`.
   */
  cawcoTodos?: boolean;
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
  harness: "claude" | "opencode" | "pi";
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
export const DELEGATE_TYPE_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * What a connection's name may be (`github-petra`, `x-brand`): no `_`, so a
 * session's `conn__<name>__<tool>` splits one way only; at most 24
 * characters, so its tools' names keep room under a harness's tool-name
 * limit (connections.ts `sessionToolName`).
 */
export const CONNECTION_NAME = /^(?=.{1,24}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The tool name a session calls a connection's `tool` by. */
export const connectionToolName = (connection: string, tool: string): string =>
  `conn__${connection}__${tool}`;

const CONNECTION_TOOL = /^conn__([a-z0-9]+(?:-[a-z0-9]+)*)__(.+)$/;

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
    return "a delegate type needs a name: lowercase letters, digits and hyphens only";
  }
  if (!draft.description?.trim()) {
    return "a delegate type needs a description — it is the whole of how the calling model routes to it";
  }
  if (
    !(draft.harness && ["claude", "opencode", "pi"].includes(draft.harness))
  ) {
    return `“${draft.harness}” is not a harness a delegate type can run on`;
  }
  if (!draft.model?.trim()) {
    return "a delegate type needs a model";
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
 * Each harness's own tools for the two things the fleet's onboarding choices
 * turn off (Projects spec §5.2, §5.6): native subagents ("delegates instead
 * of subagents") and the native to-do list ("CawCo's to-dos instead of each
 * harness's own list"). "CawCo's to-dos" also denies each harness's built-in
 * plan mode (Claude Code's `EnterPlanMode`/`ExitPlanMode`; OpenCode 2.0's is
 * an agent, `plan`, which the OpenCode adapter turns off instead): the
 * session's spec, written through CawCo (`plan.ts`), replaces it. OpenCode
 * 2.0 has no to-do tool, and pi has neither.
 */
/**
 * What a session is denied for "CawCo's to-dos", in Claude Code's names (the
 * OpenCode adapter reads each as its own tool): the harness's own list and
 * its built-in plan mode. Added at spawn to every session the choice is on
 * for, so no stored list has to carry the names.
 */
export const cawcoTodosDenied = (on: boolean): readonly string[] =>
  on ? NATIVE_TOOLS.todos.claude : [];

export const NATIVE_TOOLS = {
  subagents: { claude: ["Task", "Agent"], opencode: ["subagent"], pi: [] },
  todos: {
    claude: [
      "TaskCreate",
      "TaskUpdate",
      "TaskList",
      "TaskGet",
      "EnterPlanMode",
      "ExitPlanMode",
    ],
    opencode: [],
    pi: [],
  },
} as const satisfies Record<string, Record<HarnessKind, readonly string[]>>;

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
 * What a project's Caw may never call, in Claude's names, per harness: no
 * edit, shell or subagent tools, so the lead coordinates through the board
 * and delegates, and no subagent holds a tool the lead lacks. Claude's
 * `Monitor` runs a script and `EnterWorktree`/`ExitWorktree` make and remove
 * git worktrees; `Agent` (its old name `Task`) and `Workflow` start
 * subagents. OpenCode's `Agent` is its `subagent`, and its `edit` covers
 * `write` and `patch`, which ask as `edit`. Every MCP server but CawCo's
 * is held off by the spawn itself (`SpawnPayload.lead`), not by a name
 * here. pi cannot deny tools ({@link denyToolsProblem}), so Caw does not run
 * on pi.
 */
export const CAW_DENIED_TOOLS = {
  claude: [
    "Bash",
    "Edit",
    "Write",
    "MultiEdit",
    "NotebookEdit",
    "Monitor",
    "EnterWorktree",
    "ExitWorktree",
    "Agent",
    "Task",
    "Workflow",
  ],
  opencode: ["Bash", "Edit", "Write", "Agent"],
} as const satisfies Partial<Record<HarnessKind, readonly string[]>>;

/** The harnesses a project's Caw can run on: the ones that deny its edit and shell tools. */
export type CawHarness = keyof typeof CAW_DENIED_TOOLS;

/**
 * What a project's memory curator may never call (Projects spec §5.4): Caw's
 * list, and the web. It reads agents' inbox notes, which are untrusted
 * words, and answers only with proposals the person approves; it has no
 * reason to fetch anything, so a note cannot send it to a page. Like Caw it
 * gets CawCo's MCP server and no other (`SpawnPayload.lead`).
 */
export const CURATOR_DENIED_TOOLS = {
  claude: [...CAW_DENIED_TOOLS.claude, "WebFetch", "WebSearch"],
  opencode: [...CAW_DENIED_TOOLS.opencode, "WebFetch", "WebSearch"],
} as const satisfies Record<CawHarness, readonly string[]>;

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

const CLAUDE_MCP_TOOL = /^mcp__([^_]+(?:_[^_]+)*?)(?:__(.+))?$/;
const OPENCODE_UNSAFE = /[^A-Za-z0-9_-]/g;
const LOWERCASE_START = /^[a-z]/;

/**
 * OpenCode's tool ids for a denied-tool list. A Claude name with an OpenCode
 * equivalent maps to it; `mcp__server__tool` becomes OpenCode's
 * `server_tool` (a bare `mcp__server` or `mcp__server__*` every tool of
 * it); a name already in OpenCode's lowercase form passes through. Anything
 * else is `unmapped`: OpenCode has no tool by that name to deny.
 */
export const opencodeToolsFor = (
  names: readonly string[]
): { tools: string[]; unmapped: string[] } => {
  const tools = new Set<string>();
  const unmapped: string[] = [];
  for (const name of names) {
    const mcp = CLAUDE_MCP_TOOL.exec(name);
    if (mcp) {
      const server = mcp[1].replace(OPENCODE_UNSAFE, "_");
      const tool = mcp[2] ?? "*";
      tools.add(
        `${server}_${tool === "*" ? "*" : tool.replace(OPENCODE_UNSAFE, "_")}`
      );
    } else if (OPENCODE_EQUIVALENTS[name]) {
      for (const id of OPENCODE_EQUIVALENTS[name]) {
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
 * Why `harness` cannot carry this denied-tool list, in a sentence, or nothing
 * when it can. Claude denies by its own settings; OpenCode through its
 * session config (the names it has an equivalent for, {@link
 * opencodeToolsFor}); pi has no way to deny a tool, so only a to-do list
 * denial is accepted there, as the no-op it is (pi keeps no to-do list). A
 * name nothing would enforce is refused rather than stored as a promise.
 */
export const denyToolsProblem = (
  harness: HarnessKind,
  names: readonly string[]
): string | undefined => {
  if (names.length === 0 || harness === "claude") {
    return undefined;
  }
  if (harness === "opencode") {
    const { unmapped } = opencodeToolsFor(names);
    return unmapped.length > 0
      ? `OpenCode has no tool for ${unmapped.map((name) => `“${name}”`).join(", ")}, so it cannot deny ${unmapped.length === 1 ? "it" : "them"}`
      : undefined;
  }
  const todos = new Set<string>([
    ...NATIVE_TOOLS.todos.claude,
    ...NATIVE_TOOLS.todos.opencode,
  ]);
  const rest = names.filter((name) => !todos.has(name));
  return rest.length > 0
    ? `“${harness}” cannot deny tools — only a to-do list denial applies there, and pi keeps no to-do list`
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
