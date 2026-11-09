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
 * nothing moves or drops, each with why its rows stand without their owner.
 * Adding a key or a cleanup is the owner's to decide (the schema's change);
 * until then the check holds this list to the schema, so a new one is a
 * decision with its reason written here.
 */
export const KNOWN_UNOWNED: Readonly<Record<string, string>> = {
  "account_leaves.machine_id":
    "A removed account's store the machine still holds, until that machine signs it out (server.ts `leaveAccounts`); a machine removed first leaves its row standing.",
  "actions.proposed_by":
    "The session that proposed the action: the action's record of who asked, read after that session goes.",
  "browsers.project_id":
    "A `project:` browser's project, as its machine's last `browsers` frame said: the row is that frame's, rewritten by the next one, not the project's.",
  "capability_calls.instance_id":
    "The session whose skill, tool and MCP server calls a day's row counts: the counts stand after that session goes, read for the starting sets, and old days are pruned (capability-calls.ts).",
  "card_settlings.asked_by":
    "The session that wrote the card: the settling ledger's record of who asked, kept after it goes.",
  "card_settlings.instance_id":
    "The member's session that settles the card: the settling ledger's record of where it went, kept after it goes.",
  "connector_polls.created_by":
    "`owner`, or the id of the session that made the poll: who made it, as its log lines say, kept after that session goes.",
  "continuations.source_instance_id":
    "A continuation job's session: the job is kept only minutes after it settles, then deleted (db/continuations.ts).",
  "continuations.summariser_instance_id":
    "A continuation job's session: the job is kept only minutes after it settles, then deleted (db/continuations.ts).",
  "continuations.target_instance_id":
    "A continuation job's session: the job is kept only minutes after it settles, then deleted (db/continuations.ts).",
  "design_checks.project_id":
    "A design check round's project: its rounds outlive a deleted project.",
  "design_checks.requester_id":
    "The session that asked a chat round, told its verdict: the round's record stays after that session goes.",
  "design_offers.project_id":
    "Caw's one design-system offer per project: it outlives a deleted project.",
  "design_proposals.machine_id":
    "Where an agent's proposed design change is written: the proposal is deleted once answered, and stands until then whatever its machine does.",
  "design_proposals.project_id":
    "The project an agent's proposed design change is for: the proposal is deleted once answered, and stands until then.",
  "event_routes.created_by":
    "`owner`, or the id of the session that made the route: who made it, as its log lines say, kept after that session goes.",
  "instance_aliases.id":
    "A former id of a session a fold took in: the alias is the record that the id now names `instance_id`, so it outlives the former row by design.",
  "instance_aliases.instance_id":
    "The session a former id now names: an alias of a session that went resolves to an id no row holds.",
  "instances.forked_from":
    "The session this one was forked from: its lineage, kept after that session goes.",
  "lfs_offers.machine_id":
    "The machine of the place an LFS offer was made for: the offer's record outlives a removed machine.",
  "lfs_offers.project_id":
    "The project an LFS offer was made for: the offer's record outlives a deleted project.",
  "lfs_refusals.project_id":
    "The project told an LFS endpoint refused, so it is told once: the record outlives a deleted project.",
  "plan_changes.instance_id":
    "The session whose plan the person changed: the changes outlive the session.",
  "presence_clients.machine_id":
    "The machine a presence client is or runs on: the row is the device's last word, dropped once the device is silent a day.",
  "presence_devices.machine_id":
    "A machine the person opted in to presence: the opt-in outlives a removed machine.",
  "purged_sessions.machine_id":
    "A purge's machine: by design no key, so a machine removed later leaves its purges standing for find to leave out.",
  "queued_work_items.queued_instance_id":
    "The id a queued delegate's session will take, minted before any row holds it: there is no session to own it yet.",
  "relays.created_by":
    "`owner`, or the id of the session whose ask the owner approved: who made the relay, kept after that session goes.",
  "removed_machines.machine_id":
    "A machine the person removed: the row is the record that it went, read by rows that still name it.",
  "routine_runs.instance_id":
    "A conversation run's session: the run's record outlives the session.",
  "routines.created_by":
    "`owner`, or the id of the session that made the routine: who made it, kept after that session goes.",
  "routines.made_in_instance":
    "The session whose `routine_create` made the routine: kept after that session goes, and a fold does not move it, so a folded former's id stays here.",
  "trim_offers.project_id":
    "Caw's offer to trim a project's starting set, kept so it is offered once: it outlives a deleted project (unused-trim.ts).",
  "tree_stops.instance_id":
    "The session a delegation tree's stop ends: the row stands until that session's end is confirmed, then goes (tree-stops.ts).",
  "tree_stops.parent_id":
    "The session above one in a stop's walk: the row stands until the stop is done, then goes (tree-stops.ts).",
  "tree_stops.root_id":
    "The session a tree's stop was asked of: the row stands until the stop is done, then goes (tree-stops.ts).",
};
