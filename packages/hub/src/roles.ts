/**
 * One `cawco` MCP server, a toolset per role (Projects spec §5.3, D7). The
 * credential a request carries names a session's row, and the row its role
 * ({@link roleOf}); only that role's tools are listed, and a call to any other
 * is refused by name. OpenCode's discovery is shared by every session of a
 * server, so it may list the superset; the call itself is where the role
 * holds. Within a role a session's own context still narrows what it gets
 * (a leaf gets no spawning tools, only a work item gets `finish_item`).
 *
 * - **worker**: a session you started. Everything, fleet settings included
 *   (an `admin_*_write` is your ask, run once you approve it, asks.ts;
 *   in Full Send it runs at once).
 * - **delegate**: a delegated session or work item: the session tools, reads
 *   of its project's tasks, folder and its own task's to-dos; changes to tasks and
 *   fleet settings go to its parent through handoff. A coordinator (an
 *   attempt at a whole) starts its parts with task_start.
 * - **overseer**: fleet-watch triage (fleet-watch.ts): it reads the fleet
 *   and the session's task, and decides once with `triage_decide` (nudge the
 *   session's parent, interrupt, stop, tell you, or leave it), which the hub carries
 *   out. Nothing else: no tool that messages a session, so it never reaches
 *   the session it judges.
 * - **web-facing**: a session that reads the outside world: it finishes its
 *   work and tells you, with no posting, spawning or admin tools.
 * - **curator**: a project's memory curator run (memory.ts): it reads the
 *   inbox, proposes changes to AGENTS.md and `knowledge/` for you to approve,
 *   archives the notes that are not lasting facts, and finishes. No edit,
 *   shell or web tools in its harness either (caw.ts `fencedSpawn`).
 *
 * A session's scope is its folder and, when its row has a `projectId`, its
 * project. A project's own tools ({@link PROJECT_TOOLS}: its views, its
 * folder on the hub, its Setup's steps and settings, a routine run's answer,
 * memory writes) follow that scope, never the folder: a worker in a project
 * has them wherever it works. A role with a closed list (delegate, overseer,
 * web-facing, curator) has only its list. The session a project's events
 * reach is a worker like any other; the project's row points at it.
 *
 * Every session that works (the worker, the delegate) searches what was
 * said and made with `find` (find-tool.ts), the dashboard's Find.
 *
 * Every session, whatever its role, can end a turn with no reply
 * (`no_reply_needed`, {@link listed}): the one way Claude Code takes a turn
 * with no text, so a role without it writes a line it was told not to.
 *
 * Memory (§5.4): the worker and the delegate write notes into their
 * project's inbox (`memory_note`); a worker in a project and the curator
 * call `memory_propose` (the session's commits, the curator's waits for
 * you), and only the curator sorts the inbox.
 */
import {
  type InstanceRow,
  type MemoryRole,
  NO_REPLY_TOOL,
  type SessionRole,
  SPAWNING_TOOLS,
} from "@cawco/core";
import { ARTIFACT_TOOLS } from "./artifacts/tools";
import type { TaskTool } from "./task-tools";

/**
 * The role a session's row runs in: the one its spawn named, else derived
 * from what it is. Delegated work (a work item) is a delegate; a session another session started with `start_session` has a
 * parent and is still a worker, as one a person started is.
 */
export const roleOf = (row: InstanceRow): SessionRole => {
  if (row.role) {
    return row.role;
  }
  return row.workItemId || row.canDelegate === false ? "delegate" : "worker";
};

/**
 * What a session that only reads, reports and finishes always has: its open
 * items too, which every compaction lists after its summary (open-items.ts),
 * and `ask`, its one way to ask the person a question (asks.ts).
 */
const CORE = [
  "handoff",
  "send_to_user",
  "ask",
  "set_title",
  "open_items",
] as const;

/**
 * Asking the person to take over the session's browser for a sign-in, a
 * code or a payment (browser-tools.ts): every role that drives a browser.
 */
const BROWSER = ["browser_ask"] as const;

/**
 * Asking the person to sign in to one of the fleet's MCP servers
 * (connect-asks.ts): every role that may need a service's tools.
 */
const CONNECT = ["connect_ask"] as const;

/** The task tools every role but the worker's is limited to. */
const TASK_READ = [
  "task_read",
  "todo_write",
  "task_comment",
] as const satisfies readonly TaskTool[];

/** The project's own tools caw.ts answers: its views, its folder on the hub, its Setup's steps. */
const CAW_PROJECT_TOOLS = [
  "view_draft",
  "view_query",
  "folder_read",
  "folder_write",
  "project_setup",
] as const;

/** The tools caw.ts answers (its `tools`): views, the folder, Setup's steps. */
export const CAW_TOOLS = CAW_PROJECT_TOOLS;

/**
 * A project's own tools: caw.ts's, its settings (project-settings.ts), how
 * a routine's run that woke the session went (routines.ts) and its memory
 * writes (memory.ts). Listed by scope ({@link allows}).
 */
const PROJECT_TOOLS: ReadonlySet<string> = new Set([
  ...CAW_PROJECT_TOOLS,
  "project_settings",
  "routine_result",
  "memory_propose",
]);

/** Fleet watch's triage decision (fleet-watch.ts), the overseer's alone. */
export const TRIAGE_TOOLS = ["triage_decide"] as const;

/** A memory curator run's own (memory.ts): never a worker's. */
const CURATOR_OWN = ["memory_read", "memory_classify"] as const;

/** The session tools a delegate keeps from the worker's set. */
const DELEGATE_SESSION = [
  "generate_image",
  // An issue, a pull or merge request or a comment on any forge, as its
  // machine's sign-in there (forge-posts.ts): what gh did inside a workspace.
  "forge_post",
  "list_delegate_types",
  "list_sessions",
  "wait_item",
  "finish_item",
  "show_image",
  // Every tool that starts, steers or ends another session but pausing a
  // machine, which stops every turn on it: an orchestrator's alone.
  ...[...SPAWNING_TOOLS].filter((tool) => tool !== "machine_pause"),
  ...ARTIFACT_TOOLS,
] as const;

/**
 * Each closed role's tools, by name; the worker's is every tool there is
 * but {@link NOT_THE_WORKERS} ({@link allows}).
 */
const TOOLS: Record<Exclude<SessionRole, "worker">, ReadonlySet<string>> = {
  delegate: new Set([
    ...CORE,
    ...BROWSER,
    ...CONNECT,
    ...DELEGATE_SESSION,
    ...TASK_READ,
    // An attempt at a task hands in its result (task-tools.ts).
    "task_result",
    // A coordinator, an attempt at a whole, starts its parts (dispatch.ts
    // `coordinates`); any other delegate's start is refused there.
    "task_start",
    "memory_note",
    // Anything said or made, as the dashboard's Find finds it (find-tool.ts).
    "find",
    // Its own project's folder, read only (caw.ts): what an earlier delegate
    // handed in, from any machine.
    "folder_read",
    // The project's design system, the builder's one way to write it
    // (design-system.ts), and a design check's verifier's verdict, refused
    // to any session that is not one (design-verify.ts).
    "design_write",
    "design_verdict",
  ]),
  overseer: new Set([...TRIAGE_TOOLS, "task_read", "list_sessions"]),
  "web-facing": new Set([
    ...CORE,
    ...BROWSER,
    ...CONNECT,
    ...TASK_READ,
    "finish_item",
    "wait_item",
    "generate_image",
    "show_image",
  ]),
  curator: new Set([
    "set_title",
    "finish_item",
    "memory_propose",
    ...CURATOR_OWN,
  ]),
};

/**
 * What a worker never has: the curator's own, triage's, and a design check's
 * verdict.
 */
const NOT_THE_WORKERS: ReadonlySet<string> = new Set([
  ...CURATOR_OWN,
  ...TRIAGE_TOOLS,
  // A design check's verifier's alone, which is a delegate (design-verify.ts).
  "design_verdict",
]);

/** Whether a session in `role` lists `name` by its role alone. */
const listed = (role: SessionRole, name: string): boolean => {
  if (name === NO_REPLY_TOOL) {
    return true;
  }
  return role === "worker" ? !NOT_THE_WORKERS.has(name) : TOOLS[role].has(name);
};

/** Whether `role`'s toolset is a closed list, which a project's tools follow too. */
const closed = (role: SessionRole): boolean => role !== "worker";

/**
 * Whether the session may see and call the tool `name`. A project's own
 * tool ({@link PROJECT_TOOLS}) follows its scope: it is in a project. A
 * closed role has only its list.
 */
export const allows = (row: InstanceRow, name: string): boolean => {
  const role = roleOf(row);
  if (PROJECT_TOOLS.has(name) && !closed(role)) {
    return !!row.projectId;
  }
  return listed(role, name);
};

/**
 * Which role-scoped memory a session loads (core fleet.ts `MemoryRole`): an
 * orchestrator's when it holds the spawning tools, its role's toolset having
 * `delegate` and its spawn not marking it a leaf (`canDelegate: false`, which
 * keeps the spawning tools from it whatever its role); a leaf's otherwise.
 */
export const memoryRoleOf = (row: InstanceRow): MemoryRole =>
  row.canDelegate !== false && listed(roleOf(row), "delegate")
    ? "orchestrator"
    : "leaf";

/**
 * Which of a granted connection's tools (connections.ts) a role gets: a
 * worker or a delegate every one; a web-facing session only those the
 * server marks read-only, since it has no posting tools; fleet-watch triage
 * none, its toolset being the fleet's.
 */
export const connectionToolsFor = (
  role: SessionRole
): "all" | "read-only" | "none" => {
  if (role === "worker" || role === "delegate") {
    return "all";
  }
  return role === "web-facing" ? "read-only" : "none";
};

/** What a session hears when it calls a tool it does not have ({@link allows}). */
export const refusal = (row: InstanceRow, name: string): string => {
  const role = roleOf(row);
  if (PROJECT_TOOLS.has(name) && !closed(role)) {
    return `${name} is a project's own tool, and this session is in no project.`;
  }
  switch (role) {
    case "web-facing":
      return `${name} isn't available here: this session reads the outside world, so it has no posting, spawning or admin tools. Say what should happen in finish_item or with handoff.`;
    case "overseer":
      return `${name} isn't available to fleet-watch triage: it reads the fleet and decides once with triage_decide.`;
    case "delegate":
      return `${name} isn't available here: only sessions you started file, change or start tasks or change fleet settings, and this one is a delegate or work item. Hand the change to the session that started it.`;
    case "curator":
      return `${name} isn't available to the memory curator: it reads the inbox, proposes with memory_propose, archives with memory_classify, and finishes.`;
    case "worker":
      break;
  }
  if (TRIAGE_TOOLS.includes(name as (typeof TRIAGE_TOOLS)[number])) {
    return `${name} belongs to a fleet-watch triage run.`;
  }
  return CURATOR_OWN.includes(name as (typeof CURATOR_OWN)[number])
    ? `${name} belongs to a project's memory curator.`
    : `${name} belongs to a design check's verifier.`;
};
