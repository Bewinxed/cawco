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

import { getTableName } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  accountLeaves,
  accountSignins,
  actions,
  agents,
  artifacts,
  asks,
  browsers,
  cardSettlings,
  chosenModes,
  completedTurns,
  connectionProjects,
  connectorPolls,
  continuations,
  delegateEvents,
  designChecks,
  designOffers,
  designProposals,
  eventRoutes,
  fleetHookHistory,
  fleetHooks,
  fleetMemoryDocProjects,
  fleetWatchNotices,
  githubPollers,
  inboundEvents,
  instanceAliases,
  instances,
  lfsOffers,
  lfsRefusals,
  limitCompactions,
  limitEvents,
  limitHolds,
  limitStops,
  lineAnchors,
  loginMoves,
  machineKeys,
  mcpServers,
  movedFromSessions,
  moves,
  parkedAsks,
  planChanges,
  presenceClients,
  presenceDevices,
  projectLinks,
  projectNotes,
  projectOffers,
  projectPlaces,
  projectRepositories,
  projects,
  purgedSessions,
  queuedTaskStarts,
  queuedWorkItems,
  relays,
  removedMachines,
  routineRuns,
  routines,
  ruleState,
  rules,
  sentMessages,
  sessionIdentities,
  sessionLines,
  sessionPlans,
  skills,
  sshMachines,
  treeStops,
  turnUsage,
  usageBuckets,
  usageLimits,
  workItems,
  workspaceCreates,
  workspaces,
} from "./schema";

/** One column that names an owner, and what each row-moving operation does with its rows. */
export interface OwnedRow {
  readonly column: SQLiteColumn;
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
}

/**
 * Every column that names a session, a machine or a project and is moved
 * by hand, by table, in the order each operation walks its own. Across
 * tables the order is free: no trigger or key ties one table's statement
 * to another's here, and each function runs what one table's rows need of
 * another (the owner's own row last) outside the walk: deleteMachine's
 * `agents` row goes after the rows that go with it.
 */
export const OWNED_ROWS = [
  // A former session's rows, and what a session's going takes (fold order).
  // Moved row by row by foldInto itself: its owed and envelope carry the id.
  {
    column: sentMessages.instanceId,
    fold: "custom",
    drop: "delete",
  },
  {
    column: instances.parentInstanceId,
    fold: "move",
    drop: "null",
  },
  { column: instances.continuedInto, fold: "move" },
  { column: workItems.instanceId, fold: "move" },
  { column: workItems.parentInstanceId, fold: "move" },
  { column: queuedWorkItems.parentInstanceId, fold: "move" },
  { column: queuedTaskStarts.parentInstanceId, fold: "move" },
  {
    column: delegateEvents.instanceId,
    fold: "move",
    drop: "delete",
  },
  {
    column: delegateEvents.parentInstanceId,
    fold: "move",
    drop: "delete",
  },
  { column: workspaces.createdByInstanceId, fold: "move" },
  { column: projects.conversationInstanceId, fold: "move" },
  { column: projectNotes.instanceId, fold: "move" },
  {
    column: limitEvents.instanceId,
    fold: "move",
    drop: "delete",
  },
  { column: turnUsage.instanceId, fold: "move" },
  { column: artifacts.instanceId, fold: "move" },
  { column: artifacts.madeBy, fold: "move" },
  { column: designProposals.instanceId, fold: "move" },
  { column: asks.instanceId, fold: "move" },
  { column: sessionLines.instanceId, fold: "move" },
  { column: lineAnchors.instanceId, fold: "move" },
  { column: completedTurns.instanceId, fold: "once" },
  { column: sessionPlans.instanceId, fold: "once" },
  { column: projectOffers.instanceId, fold: "once" },
  {
    column: fleetWatchNotices.instanceId,
    fold: "once",
    drop: "delete",
  },
  // Revoked, so what its credentials grant ends with it.
  {
    column: sessionIdentities.instanceId,
    fold: "custom",
    drop: "custom",
  },
  { column: limitHolds.instanceId, fold: "drop", drop: "delete" },
  {
    column: limitCompactions.instanceId,
    fold: "drop",
    drop: "delete",
  },
  { column: parkedAsks.instanceId, fold: "drop" },
  { column: ruleState.instanceId, fold: "drop", drop: "delete" },
  { column: movedFromSessions.instanceId, fold: "drop" },
  { column: limitStops.instanceId, drop: "delete" },
  // What a machine re-joining under a new id moves (rekeyMachine order);
  // `goesWithMachine` is what deleteMachine takes with it.
  { column: agents.machineId, rekey: "custom" },
  { column: instances.machineId, rekey: "move" },
  { column: workspaces.machineId, rekey: "move" },
  { column: workspaceCreates.machineId, rekey: "move" },
  { column: artifacts.machineId, rekey: "move" },
  { column: parkedAsks.machineId, rekey: "move" },
  { column: movedFromSessions.machineId, rekey: "move" },
  { column: fleetWatchNotices.machineId, rekey: "move" },
  { column: moves.sourceMachineId, rekey: "move" },
  { column: moves.targetMachineId, rekey: "move" },
  { column: rules.scopeMachineId, rekey: "move" },
  { column: projectPlaces.machineId, rekey: "keyed" },
  {
    column: projectRepositories.machineId,
    rekey: "keyed",
    goesWithMachine: true,
  },
  {
    column: accountSignins.machineId,
    rekey: "keyed",
    goesWithMachine: true,
  },
  { column: loginMoves.machineId, rekey: "keyed" },
  {
    column: usageLimits.machineId,
    rekey: "keyed",
    goesWithMachine: true,
  },
  { column: machineKeys.machineId, rekey: "keyed" },
  { column: sshMachines.machineId, rekey: "move" },
  { column: chosenModes.machineId, rekey: "keyed" },
  { column: usageBuckets.machineId, rekey: "custom" },
  // A project folded into another (foldProject order).
  { column: projectPlaces.projectId, foldProject: "custom" },
  { column: projectLinks.projectId, foldProject: "custom" },
  {
    column: projectRepositories.projectId,
    foldProject: "custom",
  },
  { column: instances.projectId, foldProject: "custom" },
  { column: workItems.projectId, foldProject: "custom" },
  { column: projectNotes.projectId, foldProject: "move" },
  { column: rules.scopeProjectId, foldProject: "move" },
  { column: routines.projectId, foldProject: "move" },
  { column: eventRoutes.projectId, foldProject: "move" },
  { column: connectorPolls.projectId, foldProject: "move" },
  { column: inboundEvents.projectId, foldProject: "move" },
  { column: actions.projectId, foldProject: "custom" },
  { column: relays.projectId, foldProject: "move" },
  { column: moves.projectId, foldProject: "move" },
  { column: artifacts.projectId, foldProject: "custom" },
  { column: fleetWatchNotices.projectId, foldProject: "move" },
  { column: instances.delegateTypeProject, foldProject: "move" },
  { column: fleetHooks.projectId, foldProject: "move" },
  { column: fleetHookHistory.projectId, foldProject: "move" },
  { column: mcpServers.projectId, foldProject: "move" },
  { column: skills.projectId, foldProject: "move" },
  { column: projectOffers.projectId, foldProject: "move" },
  { column: connectionProjects.projectId, foldProject: "custom" },
  { column: githubPollers.projectId, foldProject: "custom" },
  {
    column: fleetMemoryDocProjects.projectId,
    foldProject: "custom",
  },
  { column: queuedTaskStarts.projectId, foldProject: "custom" },
  { column: queuedWorkItems.projectId, foldProject: "custom" },
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
>["column"]["_"]["tableName"];

/** A row `op` runs one statement for: its column and what the statement does. */
export type PlainRow<O extends OwnedOp> = Exclude<
  RowsOf<O>,
  { readonly [K in O]: "custom" }
>;

/** The rows `op` leaves to its function's own code. */
type CustomRow<O extends OwnedOp> = Extract<
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
  const handler = (row: CustomRow<O>): void => {
    const handle: unknown = Reflect.get(
      handlers,
      getTableName(row.column.table)
    );
    if (typeof handle !== "function") {
      throw new Error(
        `owned-rows: ${op} has no handler for ${row.column.name}`
      );
    }
    handle();
  };
  const walked = (row: Owned): row is RowsOf<O> => op in row;
  const custom = (row: RowsOf<O>): row is CustomRow<O> =>
    Reflect.get(row, op) === "custom";
  const plainly = (row: RowsOf<O>): row is PlainRow<O> => !custom(row);
  for (const row of OWNED_ROWS) {
    if (!walked(row)) {
      continue;
    }
    if (custom(row)) {
      handler(row);
    } else if (plainly(row)) {
      plain(row);
    }
  }
};

/** The rows deleteMachine takes with the machine. */
export const GO_WITH_MACHINE = OWNED_ROWS.filter(
  (row): row is Extract<Owned, { goesWithMachine: true }> =>
    "goesWithMachine" in row
);

/**
 * The columns of `table` a fold moves or keeps onto the survivor, as a union
 * of the schema's own column types: what else hands a session's rows to
 * another holds its columns to this type.
 */
export type FoldMoved<Table extends SQLiteTable> = Extract<
  Owned,
  {
    readonly fold: "move" | "once";
    readonly column: { readonly _: { readonly tableName: Table["_"]["name"] } };
  }
>["column"];

/**
 * Columns that name a session, machine or project, have no foreign key and
 * nothing moves or drops, each with why its rows stand without their owner.
 * Adding a key or a cleanup is the owner's to decide (the schema's change);
 * until then the check holds this list to the schema, so a new one is a
 * decision with its reason written here.
 */
export const KNOWN_UNOWNED: readonly {
  readonly column: SQLiteColumn;
  readonly reason: string;
}[] = [
  {
    column: accountLeaves.machineId,
    reason:
      "A removed account's store the machine still holds, until that machine signs it out (server.ts `leaveAccounts`); a machine removed first leaves its row standing.",
  },
  {
    column: actions.proposedBy,
    reason:
      "The session that proposed the action: the action's record of who asked, read after that session goes.",
  },
  {
    column: browsers.projectId,
    reason:
      "A `project:` browser's project, as its machine's last `browsers` frame said: the row is that frame's, rewritten by the next one, not the project's.",
  },
  {
    column: cardSettlings.askedBy,
    reason:
      "The session that wrote the card: the settling ledger's record of who asked, kept after it goes.",
  },
  {
    column: cardSettlings.instanceId,
    reason:
      "The member's session that settles the card: the settling ledger's record of where it went, kept after it goes.",
  },
  {
    column: connectorPolls.createdBy,
    reason:
      "`owner`, or the id of the session that made the poll: who made it, as its log lines say, kept after that session goes.",
  },
  {
    column: continuations.sourceInstanceId,
    reason:
      "A continuation job's session: the job is kept only minutes after it settles, then deleted (db/continuations.ts).",
  },
  {
    column: continuations.summariserInstanceId,
    reason:
      "A continuation job's session: the job is kept only minutes after it settles, then deleted (db/continuations.ts).",
  },
  {
    column: continuations.targetInstanceId,
    reason:
      "A continuation job's session: the job is kept only minutes after it settles, then deleted (db/continuations.ts).",
  },
  {
    column: designChecks.projectId,
    reason:
      "A design check round's project: its rounds outlive a deleted project.",
  },
  {
    column: designChecks.requesterId,
    reason:
      "The session that asked a chat round, told its verdict: the round's record stays after that session goes.",
  },
  {
    column: designOffers.projectId,
    reason:
      "Caw's one design-system offer per project: it outlives a deleted project.",
  },
  {
    column: designProposals.machineId,
    reason:
      "Where an agent's proposed design change is written: the proposal is deleted once answered, and stands until then whatever its machine does.",
  },
  {
    column: designProposals.projectId,
    reason:
      "The project an agent's proposed design change is for: the proposal is deleted once answered, and stands until then.",
  },
  {
    column: eventRoutes.createdBy,
    reason:
      "`owner`, or the id of the session that made the route: who made it, as its log lines say, kept after that session goes.",
  },
  {
    column: instanceAliases.id,
    reason:
      "A former id of a session a fold took in: the alias is the record that the id now names `instance_id`, so it outlives the former row by design.",
  },
  {
    column: instanceAliases.instanceId,
    reason:
      "The session a former id now names: an alias of a session that went resolves to an id no row holds.",
  },
  {
    column: instances.forkedFrom,
    reason:
      "The session this one was forked from: its lineage, kept after that session goes.",
  },
  {
    column: lfsOffers.machineId,
    reason:
      "The machine of the place an LFS offer was made for: the offer's record outlives a removed machine.",
  },
  {
    column: lfsOffers.projectId,
    reason:
      "The project an LFS offer was made for: the offer's record outlives a deleted project.",
  },
  {
    column: lfsRefusals.projectId,
    reason:
      "The project told an LFS endpoint refused, so it is told once: the record outlives a deleted project.",
  },
  {
    column: planChanges.instanceId,
    reason:
      "The session whose plan the person changed: the changes outlive the session.",
  },
  {
    column: presenceClients.machineId,
    reason:
      "The machine a presence client is or runs on: the row is the device's last word, dropped once the device is silent a day.",
  },
  {
    column: presenceDevices.machineId,
    reason:
      "A machine the person opted in to presence: the opt-in outlives a removed machine.",
  },
  {
    column: purgedSessions.machineId,
    reason:
      "A purge's machine: by design no key, so a machine removed later leaves its purges standing for find to leave out.",
  },
  {
    column: queuedWorkItems.queuedInstanceId,
    reason:
      "The id a queued delegate's session will take, minted before any row holds it: there is no session to own it yet.",
  },
  {
    column: relays.createdBy,
    reason:
      "`owner`, or the id of the session whose ask the owner approved: who made the relay, kept after that session goes.",
  },
  {
    column: removedMachines.machineId,
    reason:
      "A machine the person removed: the row is the record that it went, read by rows that still name it.",
  },
  {
    column: routineRuns.instanceId,
    reason:
      "A conversation run's session: the run's record outlives the session.",
  },
  {
    column: routines.createdBy,
    reason:
      "`owner`, or the id of the session that made the routine: who made it, kept after that session goes.",
  },
  {
    column: routines.madeInInstance,
    reason:
      "The session whose `routine_create` made the routine: kept after that session goes, and a fold does not move it, so a folded former's id stays here.",
  },
  {
    column: treeStops.instanceId,
    reason:
      "The session a delegation tree's stop ends: the row stands until that session's end is confirmed, then goes (tree-stops.ts).",
  },
  {
    column: treeStops.parentId,
    reason:
      "The session above one in a stop's walk: the row stands until the stop is done, then goes (tree-stops.ts).",
  },
  {
    column: treeStops.rootId,
    reason:
      "The session a tree's stop was asked of: the row stands until the stop is done, then goes (tree-stops.ts).",
  },
];
