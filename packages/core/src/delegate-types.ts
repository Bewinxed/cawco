/**
 * Delegate types: named presets a calling agent selects via the `delegate`
 * tool's `type` param, so routing is by description ("explore the codebase")
 * instead of a raw model string the caller has to already know. The hub owns
 * the fleet-wide set; a daemon resolves a name against it before it ever
 * builds a `SpawnPayload`.
 */

import { CLAUDE } from "./harness/claude";
import type { DeniedToolNames, HarnessToolNames } from "./harness/descriptor";
import {
  descriptorOf,
  EFFORT_LEVELS,
  type EffortLevel,
  HARNESSES,
  type HarnessKind,
  harnessName,
  harnessNamed,
} from "./harness/kinds";
import { NO_REPLY_TOOL } from "./no-reply";
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
  /**
   * The delegate types its sessions may start, by name ({@link MayStart}):
   * `["any"]` every type, an orchestrator's; any other list keeps them leaves
   * that may start those types alone; empty (and absent) none. A `delegate`
   * call's `may_start` sets it for one delegate, never past what its caller
   * may start itself ({@link narrowMayStart}).
   */
  mayStart?: MayStart;
  model: string;
  /** Unique across the fleet; what a `delegate` call's `type` param names. */
  name: string;
  /**
   * The toolset its sessions run in ({@link SESSION_ROLES}): a project type's
   * `role:` (delegates/*.md). Absent: a delegate's.
   */
  role?: SessionRole;
  skills?: string[];
  /**
   * The skills and MCP servers its sessions start with, and no others
   * ({@link StartingSet}). Absent: everything installed, as before any set.
   */
  startingSet?: StartingSet;
}

/**
 * What a session starts with (tsk-329): an allowlist of skills, each named
 * as a session's listing names it (a plugin's as `plugin:skill`), and of MCP
 * servers by their fleet name. The hub adds CawCo's own skills and server to
 * every set (hub starting-set.ts), so a type names neither. A session's set
 * is fixed as it starts: a later change applies to sessions started after it.
 */
export interface StartingSet {
  servers: string[];
  skills: string[];
}

/** CawCo's own MCP server, by the name every harness gives it. */
export const CAWCO_SERVER = "cawco";

/** `servers`, by name, held to a starting set's; all of them with none. */
export const inStartingSet = <Config>(
  servers: Record<string, Config>,
  set: StartingSet | undefined
): Record<string, Config> =>
  set
    ? Object.fromEntries(
        Object.entries(servers).filter(([name]) => set.servers.includes(name))
      )
    : servers;

/** A listing names a skill or server in one word: a space or comma inside is two names run together. */
const RUN_TOGETHER = /[\s,]/u;

/** Why this starting set cannot be saved (a blank name, or two run together), in a sentence, or nothing when it can. Every harness enforces one. */
export const startingSetProblem = (
  set: StartingSet | undefined
): string | undefined => {
  if (!set) {
    return undefined;
  }
  const names = [...set.skills, ...set.servers];
  if (names.some((name) => !name.trim())) {
    return delegateTypesWords.problemStartingSetBlank;
  }
  const runTogether = names.find((name) => RUN_TOGETHER.test(name.trim()));
  return runTogether === undefined
    ? undefined
    : delegateTypesWords.problemStartingSetName(runTogether.trim());
};

/** What a name may be. Mirrors a subagent's own `AGENT_NAME` — no reason to invent a second rule. */
export const DELEGATE_TYPE_NAME = /^[a-z][a-z0-9-]*$/u;

/**
 * The delegate types a session may start, by name. `["any"]` ({@link
 * ANY_TYPE}) is every type: the session orchestrates. Any other list, the
 * empty one included, makes it a leaf for every role rule (its toolset, its
 * memory, its budget): a leaf may start the types it names and nothing else,
 * and the hub refuses any other start before anything spawns.
 */
export type MayStart = string[];

/** The one word in a {@link MayStart} list that is every type; no type may be named it. */
export const ANY_TYPE = "any";

/** Whether a session that may start `mayStart` orchestrates: it may start any type. */
export const startsAny = (mayStart: readonly string[]): boolean =>
  mayStart.includes(ANY_TYPE);

/** Whether a session that may start `mayStart` may start a delegate of type `name`. */
export const mayStartType = (
  mayStart: readonly string[],
  name: string
): boolean => startsAny(mayStart) || mayStart.includes(name);

/**
 * What a new session may start: what it was granted (`asked`, its call's or
 * its type's), within what the session starting it may start itself
 * (`holder`), so no session grants more than it holds.
 */
export const narrowMayStart = (
  asked: readonly string[],
  holder: readonly string[]
): MayStart => {
  if (startsAny(holder)) {
    return [...asked];
  }
  return startsAny(asked)
    ? [...holder]
    : asked.filter((name) => holder.includes(name));
};

/** Why a {@link MayStart} list cannot be stored, in a sentence, or nothing when it can. */
export const mayStartProblem = (
  mayStart: readonly string[]
): string | undefined => {
  if (startsAny(mayStart) && mayStart.length > 1) {
    return delegateTypesWords.problemMayStartAny;
  }
  const bad = mayStart.find((name) => !DELEGATE_TYPE_NAME.test(name));
  return bad === undefined
    ? undefined
    : delegateTypesWords.problemMayStartName(bad);
};

/**
 * What a connection's name may be (`github-petra`, `x-brand`): no `_`, so a
 * session's `conn__<name>__<tool>` splits one way only; at most 24
 * characters, so its tools' names keep room under a harness's tool-name
 * limit (connections.ts `sessionToolName`).
 */
export const CONNECTION_NAME_LENGTH = 24;
export const CONNECTION_NAME = new RegExp(
  `^(?=.{1,${CONNECTION_NAME_LENGTH}}$)[a-z0-9]+(?:-[a-z0-9]+)*$`,
  "u"
);

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
  if (
    !(draft.name && DELEGATE_TYPE_NAME.test(draft.name)) ||
    draft.name === ANY_TYPE
  ) {
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
  const mayStart = mayStartProblem(draft.mayStart ?? []);
  if (mayStart) {
    return mayStart;
  }
  const badConnection = (draft.connections ?? []).find(
    (name) => !CONNECTION_NAME.test(name)
  );
  if (badConnection !== undefined) {
    return `“${badConnection}” is not a connection name: up to 24 lowercase letters, digits and hyphens`;
  }
  // A deny list and a starting set are kept only where its harness enforces
  // them: a type that names what its harness cannot enforce would store a
  // promise nothing keeps.
  return (
    denyToolsProblem(draft.harness, draft.denyTools ?? []) ??
    startingSetProblem(draft.startingSet)
  );
};

/**
 * The harness's own list and its plan mode, in Claude Code's names (each
 * adapter reads them as its own tools: Codex's goal tools, none on pi):
 * denied beside the fleet's baseline while the fleet's step lists are
 * CawCo's plan list (core own-tools.ts). Added at spawn, in each session's
 * own start options, so no stored list carries the names; never written into
 * the person's own settings, so the `claude` they start themselves keeps
 * both.
 */
export const OWN_LIST_DENIED: readonly string[] = CLAUDE.nativeTools.todos;

/**
 * The harness's own subagents, in Claude Code's names (the OpenCode adapter
 * reads them as `subagent`, Codex's as its collaboration tools; pi has
 * none): denied at spawn as {@link OWN_LIST_DENIED} is while the fleet's
 * helpers are CawCo's delegates (core own-tools.ts), and never written into
 * the person's own settings. Work that lands goes to CawCo's delegates
 * either way.
 */
export const SUBAGENTS_DENIED: readonly string[] = CLAUDE.nativeTools.subagents;

/**
 * The harness's own question tool, in Claude Code's name (the OpenCode
 * adapter reads it as `question`; pi has none): denied to every session at
 * spawn, so a question goes through
 * CawCo's `ask` (each descriptor's `nativeTools.questions`).
 */
export const QUESTION_TOOL_DENIED: readonly string[] =
  CLAUDE.nativeTools.questions;

/**
 * CawCo's own tools that only reach the person or only read, by their bare
 * names, and the one that ends a turn on nothing: allowed to every session
 * in every mode, as Claude Code's own question tool and its reads were. Each changes nothing a person would want
 * to approve first, and a person's ask (`ask`, `browser_ask`,
 * `connect_ask`) is parked by the hub as the person's card whatever the mode,
 * so a harness's own approval in front of it only asked twice.
 *
 * Only Claude Code asks for an MCP tool by default (its `default` mode), so
 * only its spawn needs them (claude.ts `allowedTools`): OpenCode 2.0 starts
 * from allowing everything and asks only for a shell or an edit
 * (opencode.ts `STATIC_POLICY`), and pi raises no permission prompt.
 *
 * A tool that writes anything (an artifact, a title, a task, a wait, a
 * rule) is not here: it asks as the session's mode says.
 */
export const PERSON_AND_READ_TOOLS = [
  // Reach the person: an ask the hub parks, a line or a picture in the
  // transcript, an artifact brought to the front of the panel.
  "ask",
  "browser_ask",
  "connect_ask",
  "send_to_user",
  "show_image",
  "artifact_show",
  // Reads.
  "open_items",
  "list_sessions",
  "list_delegate_types",
  "delegate_list",
  "account_read",
  "find",
  "task_read",
  "folder_read",
  "artifact_list",
  "artifact_read",
  "comment_read",
  "design_map",
  // Ends the turn. A prompt in front of it would ask the person about a turn
  // that has nothing for them; refused, Claude Code's nudge comes back.
  NO_REPLY_TOOL,
] as const;

/**
 * The toolsets a session runs in (Projects spec §5.3: one `cawco` server, a
 * toolset per role). A session's credential names its row, and the row its
 * role: `web-facing` a session that reads the outside world and so gets no
 * posting or admin tools, `overseer` fleet-watch
 * triage, `trimmer` a run of the unused skills and servers routine (the hub
 * starts it too, never a type). A row with none is a `delegate` when something delegated it, else
 * a `worker` (a session you or another session started).
 */
export const SESSION_ROLES = [
  "worker",
  "delegate",
  "overseer",
  "web-facing",
  "trimmer",
] as const;
export type SessionRole = (typeof SESSION_ROLES)[number];

/** A kind of tool each harness's descriptor names (`tools`). */
type HarnessToolKind = keyof HarnessToolNames;

/**
 * Every harness's tools of `kinds`, by their own names (each descriptor's
 * `tools`): one set, so a rule written for a kind (web-reads.ts's taint, a
 * push's open-only asks) holds the same on every harness.
 */
const harnessToolsOf = (
  ...kinds: readonly HarnessToolKind[]
): ReadonlySet<string> =>
  new Set(
    HARNESSES.flatMap((harness) =>
      kinds.flatMap((kind) => descriptorOf(harness).tools[kind])
    )
  );

/** The shell tools, by every harness's name: what a session's turn runs commands with, and what web-reads.ts reads a command of. */
export const SHELL_TOOLS = harnessToolsOf("shell", "powershell");
/** The harnesses' own web fetch tools, by every harness's name: a URL argument decides whether one read the web. */
export const WEB_FETCH_TOOLS = harnessToolsOf("fetch");
/** The harnesses' own web search tools, by every harness's name: always a read of the web. */
export const WEB_SEARCH_TOOLS = harnessToolsOf("search");

/**
 * Where the account router runs a session's delegates, and a move of one to
 * an account the person named (hub account-tools.ts): a session that may
 * start delegates has them.
 */
export const ACCOUNT_TOOL_NAMES = ["account_read", "account_move"] as const;

/**
 * The CawCo tools a leaf (a session whose {@link MayStart} list is not
 * `["any"]`) never gets: everything that spawns, steers a spawn or reads its
 * spawns, but what a leaf whose list names a type keeps ({@link
 * spawningToolAllowed}). The hub leaves
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
  ...ACCOUNT_TOOL_NAMES,
]);

/**
 * The {@link SPAWNING_TOOLS} a leaf whose list names a type keeps: starting
 * a delegate of a type it may start, answering what that delegate asks
 * it (its asks route to its parent), and seeing and moving the account it
 * runs on.
 */
const LEAF_STARTING_TOOLS: ReadonlySet<string> = new Set([
  "delegate",
  "answer_delegate",
  ...ACCOUNT_TOOL_NAMES,
]);

/** Whether a session that may start `mayStart` gets the CawCo tool `name`, as far as spawning goes. */
export const spawningToolAllowed = (
  name: string,
  mayStart: readonly string[]
): boolean =>
  !SPAWNING_TOOLS.has(name) ||
  startsAny(mayStart) ||
  (mayStart.length > 0 && LEAF_STARTING_TOOLS.has(name));

const CLAUDE_MCP_TOOL = /^mcp__([^_]+(?:_[^_]+)*?)(?:__(.+))?$/u;
const LOWERCASE_START = /^[a-z]/u;

/**
 * A denied-tool name's MCP server and tool, in Claude's form: `*` for a bare
 * `mcp__server` or `mcp__server__*`, every tool of it; undefined for a name
 * that is no MCP tool.
 */
const mcpDenial = (
  name: string
): { server: string; tool: string } | undefined => {
  const mcp = CLAUDE_MCP_TOOL.exec(name);
  return mcp ? { server: mcp[1], tool: mcp[2] ?? "*" } : undefined;
};

/**
 * The name in a denied-tool list that denies every tool of the MCP server
 * `server`, read as each harness's spawn reads it ({@link deniedToolsOn});
 * undefined when the list leaves some of them.
 */
export const mcpServerDeniedBy = (
  names: readonly string[],
  server: string
): string | undefined =>
  names.find((name) => {
    const mcp = mcpDenial(name);
    return mcp?.server === server && mcp.tool === "*";
  });

/**
 * `harness`'s own tool ids for a denied-tool list written in Claude Code's
 * names, as its descriptor's `deniedTools` says: a Claude name through its
 * `equivalents`; `mcp__server__tool` as the harness names an MCP tool, with
 * each character its `mcpUnsafe` matches as `_` (a bare `mcp__server` or
 * `mcp__server__*` is every tool of it, `*`); a lowercase name as it is,
 * already the harness's form. Anything else is `unmapped`: the harness has
 * no tool by that name to deny. A harness whose own settings take Claude
 * Code's names takes the list as it is.
 */
export const deniedToolsOn = (
  harness: HarnessKind,
  names: readonly string[]
): { tools: string[]; unmapped: string[] } =>
  deniedToolsBy(descriptorOf(harness).deniedTools, names);

/**
 * {@link deniedToolsOn} by the map itself: a harness's `deniedTools` as its
 * descriptor or plugin holds it, the same reading for every map.
 */
export const deniedToolsBy = (
  map: DeniedToolNames,
  names: readonly string[]
): { tools: string[]; unmapped: string[] } => {
  if (map.by === "own-settings") {
    return { tools: [...names], unmapped: [] };
  }
  const unsafe = new RegExp(map.mcpUnsafe, "gu");
  const tools = new Set<string>();
  const unmapped: string[] = [];
  for (const name of names) {
    const mcp = mcpDenial(name);
    const equivalent: readonly string[] | undefined = map.equivalents[name];
    if (mcp) {
      const server = mcp.server.replace(unsafe, "_");
      const tool = mcp.tool === "*" ? "*" : mcp.tool.replace(unsafe, "_");
      tools.add(`${map.mcpPrefix}${server}${map.mcpSeparator}${tool}`);
    } else if (equivalent) {
      for (const id of equivalent) {
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
 * when it can, by its descriptor's `deniedTools` ({@link deniedToolsOn}):
 * a harness denies by its own settings, or for the names it has an
 * equivalent for. A name nothing would enforce is refused rather than
 * stored as a promise.
 */
const denyToolsProblem = (
  harness: HarnessKind,
  names: readonly string[]
): string | undefined => {
  if (names.length === 0) {
    return undefined;
  }
  const { unmapped } = deniedToolsOn(harness, names);
  const label = harnessName(harness);
  return unmapped.length > 0
    ? `${label} has no tool for ${unmapped.map((name) => `“${name}”`).join(", ")}, so it cannot deny ${unmapped.length === 1 ? "it" : "them"}`
    : undefined;
};

/**
 * The fleet's seed set (inserted once, only when the table is empty): one type
 * per effort level, each description saying which tasks that level fits, so a
 * caller routes by how much verification and judgement the work needs; and
 * the two Who decides members run as by default (decides.ts `BUILT_IN`:
 * the Advisor and Common practice): advisor and research.
 */
export const DEFAULT_DELEGATE_TYPES: DelegateType[] = [
  {
    name: "low",
    description:
      "Opus 5.5 at its cheapest effort, for a brief that settles everything: mechanical edits across many files (renames, copy or config sweeps, a listed set of replacements), inventories and where-is sweeps, log and evidence pulls, quick sketches. Also the first pass of an item whose checks alone decide pass or fail; if the leaf can't make them pass, dispatch it again at `medium`. Not where one missed edge case ships: parsers, migrations, security.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "low",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "medium",
    description:
      "Opus 5.5 at its default effort, and the default for delegated work: carrying out a complete spec (new features, multi-file changes, UI built from a spec, doc rewrites, deploys with known steps), bug fixes, and a review someone asked for. It runs the brief's build, lint, type-check and proof, and stays inside the brief. Go to `high` when a `medium` run came back wrong or shallow, or the work is known to be hard. Web research sweeps go to `research`.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "medium",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "high",
    description:
      "Opus 5.5 one step above its default: more thinking per turn, slower and costlier than `medium`. For work known to be hard: a bug whose cause a first look didn't find, a security review of a change, performance work, architecture plans and analyses where the method chosen changes the answer, or any item a `medium` run got wrong. Code whose edge cases are the whole job goes to `xhigh`. More effort does not fix a wrong approach: rewrite the brief instead.",
    harness: "claude",
    model: "claude-opus-5-5",
    effort: "high",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "xhigh",
    description:
      "Opus 5.5 for long-horizon work, slower and costlier than `high`: a run over 30 minutes that must stay on one hard problem, or code whose edge cases are the whole job once a `high` run missed some (sanitizers, parsers, storage engines, concurrency, auth, data migrations). Use it where a lower level's result showed the need. Not for spec-complete builds (`medium`) or ordinary reviews.",
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
  {
    name: "advisor",
    description:
      "Advisor on Fable 5.2: a second, stronger opinion on one question, returned as guidance you apply yourself. Use it when an approach is hard to reverse and the evidence leaves it open, or when the same error keeps recurring. It sees only the brief, so the brief carries the goal, the constraints, what you tried, the exact error text and the file paths involved. The report gives a recommendation, the reasoning behind it, and what would change it, and names each check the answer still depends on for you to dispatch. Carrying out a spec goes to `medium`; fixing a bug with an unknown cause goes to `high`.",
    harness: "claude",
    model: "claude-fable-5-2",
    effort: "high",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "research",
    description:
      "Web research on Sonnet 5.5: one question answered from many current sources, searched through Monid (`monid_discover` \"web search\", then `monid_run` an endpoint it lists) and read with CRW (`crw_scrape`, `crw_map`, `crw_crawl`), returned as a cited report where every finding carries its claim, URL and a one-line quote. Use it for a wide sweep where the owner pasted no source: comparing libraries or services, current settings for a model, what a platform supports or charges. The orchestrator reads the owner's own links itself. The report is input for the orchestrator's spec; code changes go to the effort types.",
    harness: "claude",
    model: "claude-sonnet-5-5",
    effort: "medium",
    denyTools: ["mcp__claude-in-chrome__*"],
  },
  {
    name: "reader",
    description:
      "Reading on Sonnet 5.5 at low effort: a sweep of many files, transcripts or reports; an inventory or where-is list; an extraction into a table; a summary of what a set of documents says. The brief names the sources, the filter and the shape of the answer (the table's columns, or the list's fields); the report is that table or list with counts, and a line per source it could not read. Judgement on what it finds, and any edit, go to an effort type; web research goes to `research`.",
    harness: "claude",
    model: "claude-sonnet-5-5",
    effort: "low",
    denyTools: ["mcp__claude-in-chrome__*"],
    mayStart: [],
  },
];
