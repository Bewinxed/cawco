/**
 * Role toolsets on the `cawco` MCP server (Projects spec §5.3): one server,
 * and the session's credential picks its role and so its tools. Only the
 * role's tools are listed to a session, and a call resolves its caller first
 * and is refused, in one sentence, for a tool its role does not have. The
 * shared OpenCode discovery, which names no session, may list the superset;
 * the call enforces.
 *
 * - **worker**: a session you started. Everything it had, except the fleet's
 *   admin tools, which are yours on the dashboard (and the overseer's), and
 *   the lead's thread tools.
 * - **delegate**: a session another one delegated (a work item, a workflow
 *   step, a leaf). Reads tasks and writes its to-dos; files, changes and
 *   starts no task.
 * - **lead**: Caw leading a project (caw.ts). Board, task and thread tools,
 *   and the co-parent's say over the project's work items; nothing that
 *   starts a session directly or makes things. Its harness is spawned with
 *   edit and shell tools denied ({@link roleDeniedTools}).
 * - **overseer**: fleet-watch triage (P5). Reads the fleet, stops and
 *   interrupts, and the admin tools.
 * - **web-facing**: a session that reads the outside world. No posting,
 *   spawning, task-filing or admin tools: it drafts, and hands back.
 *
 * Tools are named group first (`task_write`, `thread_reply`) so a pattern can
 * allow or deny a group; the older tools keep their names and are grouped
 * here.
 */
import type { HarnessKind, InstanceRow, SessionRole } from "@cawco/core";

/** What each group of tools is, by name. */
const GROUPS = {
  /** Every session's own: talk, name itself, show what it made, read the catalog. */
  core: [
    "handoff",
    "send_to_user",
    "set_title",
    "show_image",
    "show_preview",
    "generate_image",
    "list_sessions",
    "list_delegate_types",
  ],
  /** Starting sessions of its own. */
  spawn: ["delegate", "start_session", "continue_session"],
  /** Steering the work items a session is parent (or lead) of. */
  control: [
    "stop_delegate",
    "interrupt_delegate",
    "answer_delegate",
    "set_item_checks",
  ],
  /** A work item's own session. */
  item: ["finish_item", "wait_item"],
  /** Workflows: drafting, running and steering them. */
  workflow: [
    "create_workflow",
    "update_workflow",
    "run_workflow",
    "workflow_read",
    "steer_workflow",
    "list_workflows",
  ],
  /** A workflow step's own session. */
  step: ["submit_result", "workflow_state_read", "workflow_state_write"],
  /** Reading the project's tasks and ticking to-dos. */
  taskRead: ["task_read", "todo_write"],
  /** Filing, changing and starting tasks. */
  taskWrite: [
    "task_create",
    "task_update",
    "task_link",
    "task_start",
    "task_retry",
  ],
  /** Making the calling session a project. */
  project: ["project_from_session"],
  /** Conversations with Caw in a project. */
  thread: ["thread_list", "thread_read", "thread_reply"],
  /** Fleet administration. */
  admin: [
    "manage_delegate_types",
    "manage_skills",
    "manage_plugins",
    "manage_mcp_servers",
    "manage_rules",
    "manage_hooks",
    "manage_memory",
  ],
} as const satisfies Record<string, readonly string[]>;

type Group = keyof typeof GROUPS;

const GROUP_OF = new Map<string, Group>(
  (Object.entries(GROUPS) as [Group, readonly string[]][]).flatMap(
    ([group, names]) => names.map((name) => [name, group] as const)
  )
);

/** Which groups each role has. */
const ROLE_GROUPS: Record<SessionRole, ReadonlySet<Group>> = {
  worker: new Set<Group>([
    "core",
    "spawn",
    "control",
    "item",
    "workflow",
    "step",
    "taskRead",
    "taskWrite",
    "project",
  ]),
  delegate: new Set<Group>([
    "core",
    "spawn",
    "control",
    "item",
    "workflow",
    "step",
    "taskRead",
  ]),
  lead: new Set<Group>(["control", "taskRead", "taskWrite", "thread"]),
  overseer: new Set<Group>(["control", "taskRead", "admin"]),
  "web-facing": new Set<Group>(["item", "step", "taskRead"]),
};

/** Core tools a role has although it lacks the rest of the group. */
const ROLE_EXTRAS: Record<SessionRole, ReadonlySet<string>> = {
  worker: new Set(),
  delegate: new Set(),
  lead: new Set([
    "handoff",
    "send_to_user",
    "set_title",
    "list_sessions",
    "list_delegate_types",
  ]),
  overseer: new Set(["handoff", "send_to_user", "list_sessions"]),
  "web-facing": new Set([
    "handoff",
    "send_to_user",
    "set_title",
    "show_image",
    "show_preview",
    "generate_image",
    "list_delegate_types",
  ]),
};

/** Roles a row names for itself; worker and delegate are read off the row. */
const NAMED_ROLES: ReadonlySet<string> = new Set([
  "lead",
  "overseer",
  "web-facing",
]);

/** A session another one delegated, or one that may not delegate. */
const delegated = (actor: InstanceRow): boolean =>
  !!actor.parentInstanceId ||
  !!actor.workItemId ||
  !!actor.workflowStepId ||
  actor.canDelegate === false;

/** The role a session's tools are cut to. */
export const roleOf = (actor: InstanceRow): SessionRole => {
  if (actor.role && NAMED_ROLES.has(actor.role)) {
    return actor.role;
  }
  return delegated(actor) ? "delegate" : "worker";
};

/**
 * Whether `role` has the tool `name`. A tool no group names (one added after
 * this table) is a worker's and a delegate's, as every tool was before roles;
 * the narrow roles list theirs.
 */
export const roleHas = (role: SessionRole, name: string): boolean => {
  const group = GROUP_OF.get(name);
  if (!group) {
    return role === "worker" || role === "delegate";
  }
  return ROLE_GROUPS[role].has(group) || ROLE_EXTRAS[role].has(name);
};

/** Why `role` cannot call `name`, in one plain sentence; undefined when it can. */
export const roleRefusal = (
  role: SessionRole,
  name: string
): string | undefined => {
  if (roleHas(role, name)) {
    return undefined;
  }
  const group = GROUP_OF.get(name);
  if (group === "admin") {
    return `${name} isn't available here: fleet settings are changed by you, on the dashboard, not by a session.`;
  }
  if (group === "thread") {
    return `${name} isn't available here: only a project's lead, Caw, answers in its threads.`;
  }
  switch (role) {
    case "lead":
      return `${name} isn't available to Caw: a project's lead works through its tasks and threads, and starts no session and makes nothing itself.`;
    case "web-facing":
      return `${name} isn't available here: a web-facing session has no posting, spawning, task-filing or admin tools, so draft the work and hand it back with handoff.`;
    case "delegate":
      return group === "taskWrite"
        ? `${name} isn't available here: only sessions you started and the project's lead file, change or start tasks, and this one is a delegate, work item or workflow step. Propose the change to the session that started it, with handoff.`
        : `${name} isn't available here: only a session you started can call it, and this one is a delegate, work item or workflow step.`;
    default:
      return `${name} isn't available to a ${role} session.`;
  }
};

/**
 * What a role's harness is spawned without, beyond the fleet's baseline: the
 * lead has no edit or shell tools (nor the harness's own subagents, which
 * would have them). Claude's names; the OpenCode adapter maps them, and
 * `patch` is OpenCode's own. pi cannot deny a tool, so no lead runs there.
 */
export const roleDeniedTools = (
  role: SessionRole | null | undefined,
  harness: HarnessKind
): string[] => {
  if (role !== "lead") {
    return [];
  }
  return harness === "opencode"
    ? ["Bash", "Edit", "Write", "Task", "patch"]
    : [
        "Bash",
        "BashOutput",
        "KillShell",
        "Edit",
        "MultiEdit",
        "Write",
        "NotebookEdit",
        "Task",
        "Agent",
      ];
};
