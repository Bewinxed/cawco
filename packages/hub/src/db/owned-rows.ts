/**
 * What hangs off a session, a machine and a project, in one place: each
 * table that names one, the column that names it, and what happens to its
 * rows when the owner goes, folds, re-keys or is removed. A column with a
 * foreign key is the schema's to answer; every other that names an owner
 * is listed here, or in {@link KNOWN_UNOWNED}, which migrations:check holds
 * to the schema.
 */
import { sql } from "drizzle-orm";

/** One column that names an owner, and what each row-moving operation does with its rows. */
export interface OwnedRow {
  readonly column: string;
  /**
   * dropInstances: `delete` the rows of the sessions that go, or `null`
   * the column on what only pointed at one.
   */
  readonly drop?: "delete" | "null";
  /** foldInto: `move` a former's rows onto the survivor, `once` keeps the survivor's own row, `drop` leaves its state of the moment behind. */
  readonly fold?: "move" | "once" | "drop";
  /** foldProject: `move` the duplicate's rows onto the kept project; `custom`: the function handles the table itself. */
  readonly foldProject?: "move" | "custom";
  /** deleteMachine: the rows go with the machine. */
  readonly goesWithMachine?: true;
  /** rekeyMachine: `move` onto the new id; `keyed`: the machine is in the row's key, so a row the new id holds keeps its place and the old one goes; `custom`: the function handles it. */
  readonly rekey?: "move" | "keyed" | "custom";
  readonly table: string;
}

/**
 * Every column that names a session, a machine or a project and is moved
 * by hand, by table; in the order the operations walk them.
 */
export const OWNED_ROWS: readonly OwnedRow[] = [
  // A former session's rows, and what a session's going takes (fold order).
  {
    table: "instances",
    column: "parent_instance_id",
    fold: "move",
    drop: "null",
  },
  { table: "instances", column: "continued_into", fold: "move" },
  { table: "work_items", column: "instance_id", fold: "move" },
  { table: "work_items", column: "parent_instance_id", fold: "move" },
  { table: "queued_work_items", column: "parent_instance_id", fold: "move" },
  { table: "queued_task_starts", column: "parent_instance_id", fold: "move" },
  {
    table: "delegate_events",
    column: "instance_id",
    fold: "move",
    drop: "delete",
  },
  {
    table: "delegate_events",
    column: "parent_instance_id",
    fold: "move",
    drop: "delete",
  },
  { table: "workspaces", column: "created_by_instance_id", fold: "move" },
  { table: "projects", column: "conversation_instance_id", fold: "move" },
  { table: "project_notes", column: "instance_id", fold: "move" },
  {
    table: "limit_events",
    column: "instance_id",
    fold: "move",
    drop: "delete",
  },
  { table: "turn_usage", column: "instance_id", fold: "move" },
  { table: "artifacts", column: "instance_id", fold: "move" },
  { table: "artifacts", column: "made_by", fold: "move" },
  { table: "routines", column: "made_by", fold: "move" },
  { table: "design_proposals", column: "instance_id", fold: "move" },
  { table: "asks", column: "instance_id", fold: "move" },
  { table: "session_lines", column: "instance_id", fold: "move" },
  { table: "line_anchors", column: "instance_id", fold: "move" },
  { table: "completed_turns", column: "instance_id", fold: "once" },
  { table: "session_plans", column: "instance_id", fold: "once" },
  { table: "project_offers", column: "instance_id", fold: "once" },
  {
    table: "fleet_watch_notices",
    column: "instance_id",
    fold: "once",
    drop: "delete",
  },
  // Moved row by row by foldInto itself: its owed and envelope carry the id.
  { table: "sent_messages", column: "instance_id", drop: "delete" },
  { table: "limit_holds", column: "instance_id", fold: "drop", drop: "delete" },
  {
    table: "limit_compactions",
    column: "instance_id",
    fold: "drop",
    drop: "delete",
  },
  { table: "parked_asks", column: "instance_id", fold: "drop" },
  { table: "rule_state", column: "instance_id", fold: "drop", drop: "delete" },
  { table: "moved_from_sessions", column: "instance_id", fold: "drop" },
  { table: "limit_stops", column: "instance_id", drop: "delete" },
  { table: "session_identities", column: "instance_id" },
  // What a machine re-joining under a new id moves (rekeyMachine order);
  // `goesWithMachine` is what deleteMachine takes with it.
  { table: "instances", column: "machine_id", rekey: "move" },
  { table: "workspaces", column: "machine_id", rekey: "move" },
  { table: "workspace_creates", column: "machine_id", rekey: "move" },
  { table: "artifacts", column: "machine_id", rekey: "move" },
  { table: "parked_asks", column: "machine_id", rekey: "move" },
  { table: "moved_from_sessions", column: "machine_id", rekey: "move" },
  { table: "fleet_watch_notices", column: "machine_id", rekey: "move" },
  { table: "moves", column: "source_machine_id", rekey: "move" },
  { table: "moves", column: "target_machine_id", rekey: "move" },
  { table: "rules", column: "scope_machine_id", rekey: "move" },
  { table: "project_places", column: "machine_id", rekey: "keyed" },
  {
    table: "project_repositories",
    column: "machine_id",
    rekey: "keyed",
    goesWithMachine: true,
  },
  {
    table: "account_signins",
    column: "machine_id",
    rekey: "keyed",
    goesWithMachine: true,
  },
  { table: "login_moves", column: "machine_id", rekey: "keyed" },
  {
    table: "usage_limits",
    column: "machine_id",
    rekey: "keyed",
    goesWithMachine: true,
  },
  { table: "machine_keys", column: "machine_id", rekey: "keyed" },
  { table: "ssh_machines", column: "machine_id", rekey: "move" },
  { table: "chosen_modes", column: "machine_id", rekey: "keyed" },
  {
    table: "agents",
    column: "machine_id",
    rekey: "custom",
    goesWithMachine: true,
  },
  { table: "usage_buckets", column: "machine_id", rekey: "custom" },
  // A project folded into another (foldProject order); `custom` tables are
  // handled in the function.
  { table: "instances", column: "project_id", foldProject: "custom" },
  { table: "work_items", column: "project_id", foldProject: "custom" },
  { table: "project_notes", column: "project_id", foldProject: "move" },
  { table: "rules", column: "scope_project_id", foldProject: "move" },
  { table: "routines", column: "project_id", foldProject: "move" },
  { table: "event_routes", column: "project_id", foldProject: "move" },
  { table: "connector_polls", column: "project_id", foldProject: "move" },
  { table: "inbound_events", column: "project_id", foldProject: "move" },
  { table: "actions", column: "project_id", foldProject: "move" },
  { table: "relays", column: "project_id", foldProject: "move" },
  { table: "moves", column: "project_id", foldProject: "move" },
  { table: "artifacts", column: "project_id", foldProject: "move" },
  { table: "fleet_watch_notices", column: "project_id", foldProject: "move" },
  { table: "instances", column: "delegate_type_project", foldProject: "move" },
  { table: "fleet_hooks", column: "project_id", foldProject: "move" },
  { table: "fleet_hook_history", column: "project_id", foldProject: "move" },
  { table: "mcp_servers", column: "project_id", foldProject: "move" },
  { table: "skills", column: "project_id", foldProject: "move" },
  { table: "project_offers", column: "project_id", foldProject: "move" },
  { table: "project_places", column: "project_id", foldProject: "custom" },
  { table: "project_links", column: "project_id", foldProject: "custom" },
  {
    table: "project_repositories",
    column: "project_id",
    foldProject: "custom",
  },
  { table: "connection_projects", column: "project_id", foldProject: "custom" },
  { table: "github_pollers", column: "project_id", foldProject: "custom" },
  { table: "github_poll_cursors", column: "project_id", foldProject: "custom" },
  {
    table: "fleet_memory_doc_projects",
    column: "project_id",
    foldProject: "custom",
  },
  { table: "queued_task_starts", column: "project_id", foldProject: "custom" },
  { table: "queued_work_items", column: "project_id", foldProject: "custom" },
];

/**
 * Columns that name a session, machine or project, have no foreign key and
 * nothing moves or drops: their rows outlive their owner today. Adding a
 * key is the owner's to decide (the schema's change); until then the check
 * holds this list to the schema so a new one is a decision.
 */
export const KNOWN_UNOWNED: readonly string[] = [
  "account_leaves.machine_id",
  "browsers.project_id",
  "card_settlings.instance_id",
  "continuations.source_instance_id",
  "continuations.summariser_instance_id",
  "continuations.target_instance_id",
  "design_checks.project_id",
  "design_offers.project_id",
  "design_proposals.machine_id",
  "design_proposals.project_id",
  "instance_aliases.instance_id",
  "lfs_offers.machine_id",
  "lfs_offers.project_id",
  "lfs_refusals.project_id",
  "plan_changes.instance_id",
  "presence_clients.machine_id",
  "presence_devices.machine_id",
  "purged_sessions.machine_id",
  "queued_work_items.queued_instance_id",
  "removed_machines.machine_id",
  "routine_runs.instance_id",
  "tree_stops.instance_id",
];

/** One column's owned rows. */
const rowsOf = (want: (row: OwnedRow) => unknown): readonly OwnedRow[] =>
  OWNED_ROWS.filter(want);

export const FOLD_MOVED = rowsOf(
  (row) => row.fold === "move" || row.fold === "once"
);
export const FOLD_DROPPED = rowsOf((row) => row.fold === "drop");
export const MACHINE_MOVED = rowsOf(
  (row) => row.rekey === "move" || row.rekey === "keyed"
);
export const GO_WITH_MACHINE = rowsOf((row) => row.goesWithMachine);
export const PROJECT_MOVED = rowsOf((row) => row.foldProject === "move");
export const SESSION_GOES = rowsOf((row) => row.drop === "delete");

/** A list of ids, as a statement's `IN (...)` holds them. */
export const idList = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  );
