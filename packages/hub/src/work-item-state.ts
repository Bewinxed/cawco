import { ANY_TYPE } from "@cawco/core/delegate-types";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { InstanceRow } from "@cawco/core/protocol";
import type { WorkItemRow } from "./db/project-work";

/**
 * Who an item is started for: the session that delegated it, or, for a
 * routine's run, the routine ({@link routineParent}). What starting an item
 * reads of its parent and no more. A routine or a design check runs on no
 * harness: its `harness` is null.
 */
export type Parent = Pick<
  InstanceRow,
  | "cwd"
  | "delegateType"
  | "id"
  | "launchDir"
  | "machineId"
  | "mayStart"
  | "model"
  | "projectId"
  | "sessionId"
  | "title"
> & { harness: HarnessKind | null };

/** What a routine's runs name as their parent: `routine:<id>`, which no session's row has. */
const ROUTINE_PARENT = "routine:";

/** The parent id a routine's runs carry, on their item and their session's row. */
const routineParentId = (routineId: string): string =>
  `${ROUTINE_PARENT}${routineId}`;

/** Whether a parent id is a routine's: no session's row has it (routines.ts reads their end and sends the report). */
export const isRoutineParent = (id: string | null | undefined): boolean =>
  !!id?.startsWith(ROUTINE_PARENT);

/** What a design check's verifier names as its parent: `verifier:<the builder's item>`, which no session's row has. */
const VERIFIER_PARENT = "verifier:";

/**
 * Whether a parent id is the hub's own, a routine's or a design check's
 * (design-verify.ts): the item reports to no session, and the hub reads how
 * it ended.
 */
export const isHubParent = (id: string | null | undefined): boolean =>
  isRoutineParent(id) || isVerifierParent(id);

/** Whether a parent id is a design check's: its session is that check's verifier. */
export const isVerifierParent = (id: string | null | undefined): boolean =>
  !!id?.startsWith(VERIFIER_PARENT);

/**
 * A design check's verifier's parent: the builder's item, in its project,
 * its workspace cut from the builder's (so its clone holds the builder's
 * commits), under the check's name.
 */
export const verifierParent = (builder: {
  cwd: string;
  itemId: string;
  machineId: string;
  projectId: string;
}): Parent => ({
  id: `${VERIFIER_PARENT}${builder.itemId}`,
  projectId: builder.projectId,
  machineId: builder.machineId,
  cwd: builder.cwd,
  title: "Design check",
  launchDir: "unknown",
  harness: null,
  model: null,
  sessionId: null,
  delegateType: null,
  // The hub starts it: its own session is the leaf (its request's mayStart).
  mayStart: [ANY_TYPE],
});

/**
 * A routine as its run's parent: its project, and the machine and checkout
 * the run's workspace is cut from, under the routine's name.
 */
export const routineParent = (routine: {
  cwd: string;
  id: string;
  machineId: string;
  name: string;
  projectId: string | null;
}): Parent => ({
  id: routineParentId(routine.id),
  projectId: routine.projectId,
  machineId: routine.machineId,
  cwd: routine.cwd,
  title: routine.name,
  launchDir: "unknown",
  harness: null,
  model: null,
  sessionId: null,
  delegateType: null,
  mayStart: [ANY_TYPE],
});

/** The states that take messages; every other one is finished work. */
export const LIVE: ReadonlySet<WorkItemRow["state"]> = new Set([
  "starting",
  "running",
]);

/** Whether an item in `state` is live work: starting or running. */
export const isLive = (state: WorkItemRow["state"]): boolean => LIVE.has(state);

/**
 * The longest wait an item declares, in whole minutes: `wait_item`'s tool,
 * its route and work-items.ts `waitItem` hold a session to it, and a landing
 * waiting for a machine its gate needs declares it (landing-run.ts).
 */
export const WAIT_ITEM_MAX_MINUTES = 120;

export const WAIT_ITEM_LIMIT = `Wait not set. Use whole minutes from 1 to ${WAIT_ITEM_MAX_MINUTES} and a non-empty reason for waiting on a command you started.`;
