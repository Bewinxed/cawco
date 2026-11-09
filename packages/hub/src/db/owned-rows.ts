/**
 * What hangs off a session, a machine and a project, in one place: each
 * table that names one, the column that names it, and what happens to its
 * rows when the owner goes, folds, re-keys or is removed. Each operation
 * walks its rows here in this order ({@link walkOwned}): a plain one runs
 * the statement its kind says, a `custom` one the handler its function
 * keeps for that table, which the handler's type holds to this list. A
 * column with a foreign key is the schema's to answer; every other that
 * names an owner is listed here, or in {@link KNOWN_UNOWNED}, which
 * migrations:check holds to the schema.
 */

/** One column that names an owner, and what each row-moving operation does with its rows. */
export interface OwnedRow {
  readonly column: string;
  /**
   * dropInstances: `delete` the rows of the sessions that go, `null` the
   * column on what only pointed at one, or `custom`.
   */
  readonly drop?: "delete" | "null" | "custom";
  /** foldInto: `move` a former's rows onto the survivor, `once` keeps the survivor's own row, `drop` leaves its state of the moment behind, or `custom`. */
  readonly fold?: "move" | "once" | "drop" | "custom";
  /** foldProject: `move` the duplicate's rows onto the kept project, or `custom`. */
  readonly foldProject?: "move" | "custom";
  /** deleteMachine: the rows go with the machine. */
  readonly goesWithMachine?: true;
  /** rekeyMachine: `move` onto the new id; `keyed`: the machine is in the row's key, so a row the new id holds keeps its place and the old one goes; or `custom`. */
  readonly rekey?: "move" | "keyed" | "custom";
  readonly table: string;
}

/**
 * Every column that names a session, a machine or a project and is moved
 * by hand, by table, in the order each operation walks its own. Across
 * tables the order is free: no trigger or key ties one table's statement
 * to another's here, and each function runs what one table's rows need of
 * another (the owner's own row last) outside the walk.
 */
export const OWNED_ROWS = [
  // A former session's rows, and what a session's going takes (fold order).
  // Moved row by row by foldInto itself: its owed and envelope carry the id.
  {
    table: "sent_messages",
    column: "instance_id",
    fold: "custom",
    drop: "delete",
  },
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
  // Revoked, so what its credentials grant ends with it.
  {
    table: "session_identities",
    column: "instance_id",
    fold: "custom",
    drop: "custom",
  },
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
  // What a machine re-joining under a new id moves (rekeyMachine order);
  // `goesWithMachine` is what deleteMachine takes with it.
  {
    table: "agents",
    column: "machine_id",
    rekey: "custom",
    goesWithMachine: true,
  },
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
  { table: "usage_buckets", column: "machine_id", rekey: "custom" },
  // A project folded into another (foldProject order).
  { table: "project_places", column: "project_id", foldProject: "custom" },
  { table: "project_links", column: "project_id", foldProject: "custom" },
  {
    table: "project_repositories",
    column: "project_id",
    foldProject: "custom",
  },
  { table: "instances", column: "project_id", foldProject: "custom" },
  { table: "work_items", column: "project_id", foldProject: "custom" },
  { table: "project_notes", column: "project_id", foldProject: "move" },
  { table: "rules", column: "scope_project_id", foldProject: "move" },
  { table: "routines", column: "project_id", foldProject: "move" },
  { table: "event_routes", column: "project_id", foldProject: "move" },
  { table: "connector_polls", column: "project_id", foldProject: "move" },
  { table: "inbound_events", column: "project_id", foldProject: "move" },
  { table: "actions", column: "project_id", foldProject: "custom" },
  { table: "relays", column: "project_id", foldProject: "move" },
  { table: "moves", column: "project_id", foldProject: "move" },
  { table: "artifacts", column: "project_id", foldProject: "custom" },
  { table: "fleet_watch_notices", column: "project_id", foldProject: "move" },
  { table: "instances", column: "delegate_type_project", foldProject: "move" },
  { table: "fleet_hooks", column: "project_id", foldProject: "move" },
  { table: "fleet_hook_history", column: "project_id", foldProject: "move" },
  { table: "mcp_servers", column: "project_id", foldProject: "move" },
  { table: "skills", column: "project_id", foldProject: "move" },
  { table: "project_offers", column: "project_id", foldProject: "move" },
  { table: "connection_projects", column: "project_id", foldProject: "custom" },
  { table: "github_pollers", column: "project_id", foldProject: "custom" },
  {
    table: "fleet_memory_doc_projects",
    column: "project_id",
    foldProject: "custom",
  },
  { table: "queued_task_starts", column: "project_id", foldProject: "custom" },
  { table: "queued_work_items", column: "project_id", foldProject: "custom" },
] as const satisfies readonly OwnedRow[];

type Owned = (typeof OWNED_ROWS)[number];

/** An operation the registry drives, by the field that says what it does. */
export type OwnedOp = "drop" | "fold" | "foldProject" | "rekey";

/** The rows `op` walks. */
type RowsOf<O extends OwnedOp> = Extract<Owned, { readonly [K in O]: unknown }>;

/** The tables whose rows `op` leaves to its function's own code. */
export type HandledBy<O extends OwnedOp> = Extract<
  Owned,
  { readonly [K in O]: "custom" }
>["table"];

/** A row `op` runs one statement for: its table, its column and what the statement does. */
export type PlainRow<O extends OwnedOp> = Exclude<
  RowsOf<O>,
  { readonly [K in O]: "custom" }
>;

/**
 * Runs `op` over its rows, in the registry's order: a `custom` row by its
 * table's handler in `handlers`, every other by `plain`. `handlers` names
 * each `custom` table of `op`, and no other: the type's to hold.
 */
export const walkOwned = <O extends OwnedOp>(
  op: O,
  handlers: { readonly [T in HandledBy<O>]: () => void },
  plain: (row: PlainRow<O>) => void
): void => {
  for (const row of OWNED_ROWS) {
    const how: unknown = (row as OwnedRow)[op];
    if (how === "custom") {
      handlers[row.table as HandledBy<O>]();
    } else if (how !== undefined) {
      plain(row as PlainRow<O>);
    }
  }
};

/** The rows deleteMachine takes with the machine. */
export const GO_WITH_MACHINE = OWNED_ROWS.filter(
  (row): row is Extract<Owned, { goesWithMachine: true }> =>
    "goesWithMachine" in row
);

/**
 * The columns of `table` a fold moves onto the survivor: what else hands a
 * session's rows to another reads them here.
 */
export const foldMovedColumns = (table: string): readonly string[] =>
  OWNED_ROWS.filter(
    (row) =>
      row.table === table &&
      "fold" in row &&
      (row.fold === "move" || row.fold === "once")
  ).map((row) => row.column);

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
