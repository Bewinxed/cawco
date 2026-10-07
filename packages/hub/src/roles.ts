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
 *   delegating and steering the project's work, the person's phone. It has
 *   no edit or shell tools in its harness either (caw.ts).
 * - **overseer**: fleet-watch triage: read the fleet, stop or interrupt, tell
 *   a session or you, and the fleet's hooks (a write asks you first).
 * - **web-facing**: a session that reads the outside world: it finishes its
 *   work and tells you, with no posting, spawning or admin tools.
 */
import type { InstanceRow, SessionRole } from "@cawco/core";

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
const TASK_READ = ["task_read", "todo_write"] as const;

/** The tools that file, change or start tasks. */
const TASK_WRITE = [
  "task_create",
  "task_update",
  "task_link",
  "task_start",
  "task_retry",
] as const;

/** A project's conversations with its Caw: Caw's own. */
export const THREAD_TOOLS = ["thread_read", "thread_reply"] as const;

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
  "wait_item",
  "finish_item",
  "continue_session",
  "set_item_checks",
  "stop_delegate",
  "interrupt_delegate",
  "answer_delegate",
  "show_image",
  "show_preview",
  "read_choices",
] as const;

/**
 * Each role's tools, by name; the worker's is every tool there is but Caw's
 * threads ({@link allows}).
 */
const TOOLS: Record<Exclude<SessionRole, "worker">, ReadonlySet<string>> = {
  delegate: new Set([...CORE, ...DELEGATE_SESSION, ...TASK_READ]),
  lead: new Set([
    ...CORE,
    ...TASK_READ,
    ...TASK_WRITE,
    ...THREAD_TOOLS,
    "delegate",
    "list_delegate_types",
    "list_sessions",
    "set_item_checks",
    "stop_delegate",
    "interrupt_delegate",
    "answer_delegate",
  ]),
  overseer: new Set([
    ...CORE,
    "task_read",
    "list_delegate_types",
    "list_sessions",
    "stop_delegate",
    "interrupt_delegate",
    // The decision page's overseer: the fleet's hooks, a write asking you first.
    "admin_hooks_read",
    "admin_hooks_write",
  ]),
  "web-facing": new Set([
    ...CORE,
    ...TASK_READ,
    "finish_item",
    "wait_item",
    "generate_image",
    "show_image",
  ]),
};

const THREADS: ReadonlySet<string> = new Set(THREAD_TOOLS);

/** Whether a session in `role` may see and call the tool `name`. */
export const allows = (role: SessionRole, name: string): boolean =>
  role === "worker" ? !THREADS.has(name) : TOOLS[role].has(name);

/** What a session hears when it calls a tool its role does not have. */
export const refusal = (role: SessionRole, name: string): string => {
  switch (role) {
    case "lead":
      return `${name} isn't available to Caw: the lead works through the board, threads and delegates, with no edit, shell or fleet-settings tools. Delegate the work instead.`;
    case "web-facing":
      return `${name} isn't available here: this session reads the outside world, so it has no posting, spawning or admin tools. Say what should happen in finish_item or with handoff.`;
    case "overseer":
      return `${name} isn't available to fleet-watch triage: it reads the fleet, stops or interrupts, and tells a session or you.`;
    case "delegate":
      return `${name} isn't available here: only sessions you started file, change or start tasks or change fleet settings, and this one is a delegate, work item or workflow step. Hand the change to the session that started it.`;
    default:
      return `${name} belongs to a project's Caw.`;
  }
};
