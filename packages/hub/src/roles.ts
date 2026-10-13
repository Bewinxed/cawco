/**
 * One `cawco` MCP server, a toolset per role (Projects spec §5.3, D7). The
 * credential a request carries names a session's row, and the row its role
 * ({@link roleOf}); only that role's tools are listed, and a call to any other
 * is refused by name. OpenCode's discovery is shared by every session of a
 * server, so it may list the superset; the call itself is where the role
 * holds. Within a role a session's own context still narrows what it gets
 * (a leaf gets no spawning tools, only a work item gets `finish_item`, only
 * a workflow step its step tools).
 *
 * - **worker**: a session you started. Everything, fleet settings included
 *   (an `admin_*_write` waits for you to approve it, admin-asks.ts).
 * - **delegate**: a delegated session or work item: the session tools, reads
 *   of its project's tasks and its own task's to-dos; changes to tasks and
 *   fleet settings go to its parent through handoff.
 * - **lead**: a project's Caw. Board tools only: tasks and to-dos, threads,
 *   drafting views, its project's folder on the hub and decision pages in it,
 *   its routines, its ingress and relays (opening a relay asks you),
 *   proposing approved actions, delegating and steering the
 *   project's work, the person's phone. It has
 *   no edit or shell tools in its harness either (caw.ts).
 * - **overseer**: fleet-watch triage (fleet-watch.ts): it reads the fleet
 *   and the session's task, and decides once with `triage_decide` (nudge the
 *   lead, interrupt, stop, tell you, or leave it), which the hub carries
 *   out. Nothing else: no tool that messages a session, so it never reaches
 *   the session it judges.
 * - **web-facing**: a session that reads the outside world: it finishes its
 *   work and tells you, with no posting, spawning or admin tools.
 * - **curator**: a project's memory curator run (memory.ts): it reads the
 *   inbox, proposes changes to AGENTS.md and `knowledge/` for you to approve,
 *   archives the notes that are not lasting facts, and finishes. No edit,
 *   shell or web tools in its harness either (caw.ts `withCawDenials`).
 *
 * Memory (§5.4): the worker, the delegate and the lead write notes into
 * their project's inbox (`memory_note`); only the lead and the curator
 * propose (`memory_propose`), and only the curator sorts the inbox.
 */
import type { InstanceRow, SessionRole } from "@cawco/core";
import { ARTIFACT_TOOLS } from "./artifacts/tools";

/** The role a session's row runs in: the one its spawn named, else derived from how it started. */
export const roleOf = (row: InstanceRow): SessionRole => {
  if (row.role) {
    return row.role;
  }
  return row.parentInstanceId ||
    row.workItemId ||
    row.workflowStepId ||
    row.canDelegate === false
    ? "delegate"
    : "worker";
};

/** What a session that only reads, reports and finishes always has. */
const CORE = ["handoff", "send_to_user", "set_title"] as const;

/** The task tools every role but the worker's and the lead's is limited to. */
const TASK_READ = ["task_read", "todo_write", "task_comment"] as const;

/** The tools that file, change or start tasks. */
const TASK_WRITE = [
  "task_create",
  "task_update",
  "task_link",
  "task_start",
  "task_retry",
  "task_archive",
] as const;

/**
 * Caw's own: a project's conversations with it, the views it drafts, and its
 * folder on the hub (caw.ts).
 */
export const CAW_TOOLS = [
  "thread_read",
  "thread_reply",
  "view_draft",
  "view_query",
  "folder_read",
  "folder_write",
] as const;

/** Fleet watch's triage decision (fleet-watch.ts), the overseer's alone. */
export const TRIAGE_TOOLS = ["triage_decide"] as const;

/**
 * A project's routines (routines.ts): made, changed and run by the roles that
 * run a project, a session you started and the project's Caw.
 */
const ROUTINE = [
  "routine_create",
  "routine_list",
  "routine_update",
  "routine_delete",
  "routine_run_now",
] as const;

/**
 * A project's ingress (ingress.ts): its event routes and connector polls,
 * made and changed by the same roles as its routines, which they feed.
 */
const INGRESS = [
  "event_route_create",
  "event_route_list",
  "event_route_update",
  "event_route_delete",
  "connector_poll_create",
  "connector_poll_list",
  "connector_poll_update",
  "connector_poll_delete",
] as const;

/**
 * Approved actions (actions.ts): one exact call proposed for you to approve,
 * by the same roles as routines; never a delegate, triage or a web-facing
 * session, which have no posting tools.
 */
const ACTION = ["action_propose", "action_list", "action_cancel"] as const;

/**
 * A project's relays (relay.ts): its public webhook paths, by the same roles
 * as its ingress, which they feed; opening one waits for you to approve it.
 */
const RELAY = ["relay_create", "relay_list", "relay_remove"] as const;

/** A memory curator run's own (memory.ts): never a worker's. */
const CURATOR_OWN = ["memory_read", "memory_classify"] as const;

/** The session tools a delegate keeps from the worker's set. */
const DELEGATE_SESSION = [
  "create_workflow",
  "update_workflow",
  "workflow_state_read",
  "workflow_state_write",
  "submit_result",
  "run_workflow",
  "workflow_read",
  "steer_workflow",
  "list_workflows",
  "generate_image",
  "list_delegate_types",
  "list_sessions",
  "start_session",
  "delegate",
  "delegate_list",
  "wait_item",
  "finish_item",
  "continue_session",
  "set_item_checks",
  "stop_delegate",
  "interrupt_delegate",
  "answer_delegate",
  "show_image",
  ...ARTIFACT_TOOLS,
] as const;

/**
 * Each role's tools, by name; the worker's is every tool there is but Caw's
 * own ({@link allows}).
 */
const TOOLS: Record<Exclude<SessionRole, "worker">, ReadonlySet<string>> = {
  delegate: new Set([
    ...CORE,
    ...DELEGATE_SESSION,
    ...TASK_READ,
    "memory_note",
  ]),
  lead: new Set([
    ...CORE,
    ...TASK_READ,
    ...TASK_WRITE,
    ...CAW_TOOLS,
    "memory_note",
    "memory_propose",
    // Decision pages: Caw builds them from his folder's decisions/<name>/page.html.
    ...ARTIFACT_TOOLS,
    ...ROUTINE,
    ...INGRESS,
    ...ACTION,
    ...RELAY,
    "delegate",
    "delegate_list",
    "list_delegate_types",
    "list_sessions",
    "set_item_checks",
    "stop_delegate",
    "interrupt_delegate",
    "answer_delegate",
  ]),
  overseer: new Set([...TRIAGE_TOOLS, "task_read", "list_sessions"]),
  "web-facing": new Set([
    ...CORE,
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
 * What a worker never has: Caw's own, the curator's (proposing is the lead's
 * and the curator's), and triage's.
 */
const NOT_THE_WORKERS: ReadonlySet<string> = new Set([
  ...CAW_TOOLS,
  ...CURATOR_OWN,
  "memory_propose",
  ...TRIAGE_TOOLS,
]);

/** Whether a session in `role` may see and call the tool `name`. */
export const allows = (role: SessionRole, name: string): boolean =>
  role === "worker" ? !NOT_THE_WORKERS.has(name) : TOOLS[role].has(name);

/**
 * Which of a granted connection's tools (connections.ts) a role gets: a
 * worker or a delegate every one; a web-facing session only those the server
 * marks read-only, since it has no posting tools; Caw and fleet-watch triage
 * none, their toolsets being the board's and the fleet's.
 */
export const connectionToolsFor = (
  role: SessionRole
): "all" | "read-only" | "none" => {
  if (role === "worker" || role === "delegate") {
    return "all";
  }
  return role === "web-facing" ? "read-only" : "none";
};

/** What a session hears when it calls a tool its role does not have. */
export const refusal = (role: SessionRole, name: string): string => {
  switch (role) {
    case "lead":
      return `${name} isn't available to Caw: the lead works through the board, threads and delegates, with no edit, shell or fleet-settings tools. Delegate the work instead.`;
    case "web-facing":
      return `${name} isn't available here: this session reads the outside world, so it has no posting, spawning or admin tools. Say what should happen in finish_item or with handoff.`;
    case "overseer":
      return `${name} isn't available to fleet-watch triage: it reads the fleet and decides once with triage_decide.`;
    case "delegate":
      return `${name} isn't available here: only sessions you started file, change or start tasks or change fleet settings, and this one is a delegate, work item or workflow step. Hand the change to the session that started it.`;
    case "curator":
      return `${name} isn't available to the memory curator: it reads the inbox, proposes with memory_propose, archives with memory_classify, and finishes.`;
    default:
      if (name === "memory_propose") {
        return "memory_propose belongs to a project's Caw and its memory curator: write what you learned with memory_note, and the curator proposes it to the person.";
      }
      if (TRIAGE_TOOLS.includes(name as (typeof TRIAGE_TOOLS)[number])) {
        return `${name} belongs to a fleet-watch triage run.`;
      }
      return CURATOR_OWN.includes(name as (typeof CURATOR_OWN)[number])
        ? `${name} belongs to a project's memory curator.`
        : `${name} belongs to a project's Caw.`;
  }
};
