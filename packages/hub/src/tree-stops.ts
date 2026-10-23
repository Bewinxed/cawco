/**
 * THE TREE STOP (decision page workflows-future, "The delegation tree is the
 * run"): "A stop walks the tree: every delegate an orchestrator started ends
 * first, the orchestrator last, and its report lists their outcomes."
 *
 * A stop asked of a session (the person's Stop, its parent's
 * `stop_delegate`) files one row per session of its delegation tree
 * (`tree_stops`): its live work items' sessions, level by level, and the
 * sessions it started with no item, background work excepted (a routine's
 * run, what an event's turn started: work-items.ts `backgroundOf`), which
 * outlives whoever asked. Each item is held from that moment (work-items.ts
 * `stopping`): nothing reports, retries, wakes or fails it, and nothing new
 * starts under it.
 *
 * Then, deepest first: a session whose rows below it are all gone has its
 * own end asked of its machine; once the machine confirms it ended
 * (session-lifecycle.ts `confirmed`), its item takes its final state and its
 * row goes, which may free the session above it. The engine's protections
 * keep their place here: an item's final state waits on its own confirmed
 * end and on every child's (the engine's pending ends, 84861fb4b), and a
 * stop that is not confirmed holds the item (its held stops, 156e913bb). A
 * machine that is away keeps its rows waiting; its stops are stored and sent
 * when it is back. The rows are the stop's whole state, so a hub that starts
 * mid-stop carries it on ({@link TreeStops.resume}).
 *
 * The root's report lists how each delegate under it ended, nested as the
 * tree was; it goes to the root's parent as any report does.
 */
import { type EndedBy, workWords } from "@cawco/core";
import type { DbShape, WorkItemRow } from "./db";
import type { TreeStopRow } from "./db/tree-stops";
import { handle } from "./presenters/words";
import { isHubParent, isLive, type WorkItems } from "./work-items";

/** A session the walk reached, and the one above it (null for the root). */
interface Reached {
  id: string;
  parentId: string | null;
}

/** Statuses of a session with no work item that may still run, and so is stopped with its tree. */
const MAY_RUN: ReadonlySet<string> = new Set([
  "starting",
  "running",
  "sleeping",
  "unknown",
]);

export interface TreeStopDeps {
  readonly db: DbShape;
  /**
   * Asks the session's end of its machine for `by`, stored first and sent
   * now, or when an away machine is back (server.ts `endSession`, `oweStop`).
   */
  readonly end: (instanceId: string, by: EndedBy, requestId?: string) => void;
  readonly workItems: Pick<
    WorkItems,
    "reportStopped" | "stopConfirmed" | "stopping"
  >;
}

/** Who asked, as a stopped item's report says it. */
const askerWords = (by: EndedBy): string => {
  switch (by.kind) {
    case "person":
      return "the person";
    case "session":
      return by.name;
    case "hub":
      return `the hub (${by.why})`;
    case "outside":
      return `a ${by.signal} from outside CawCo`;
  }
};

export const createTreeStops = ({ db, end, workItems }: TreeStopDeps) => {
  /**
   * The request a person's Stop of a session with nothing under it waits
   * on, by session: its end's own receipt (server.ts `stopFromDashboard`).
   */
  const receipts = new Map<string, string>();

  /** Whether `id`'s session has ended: its row gone, or its end confirmed by its machine. */
  const ended = (id: string): boolean => {
    const owned = db.ownedInstance(id);
    return !owned || (!!owned.endIntent && !!owned.endConfirmedAt);
  };

  /**
   * The tree under `rootId`, root first, one level at a time: the sessions
   * of live items each level started that are not background work, and the
   * sessions it started with no item that may still run. A session already
   * reached is never reached twice.
   */
  const walk = (rootId: string): Reached[] => {
    const reached: Reached[] = [{ id: rootId, parentId: null }];
    const seen = new Set([rootId]);
    let level = [rootId];
    while (level.length > 0) {
      const next: Reached[] = [];
      for (const item of db.workItemsOfParents(level)) {
        if (
          isLive(item.state) &&
          !item.background &&
          !seen.has(item.instanceId)
        ) {
          seen.add(item.instanceId);
          next.push({ id: item.instanceId, parentId: item.parentInstanceId });
        }
      }
      for (const row of db.getInstancesByIds(db.childIdsOfParents(level))) {
        if (
          !(row.workItemId || seen.has(row.id)) &&
          MAY_RUN.has(row.status) &&
          row.parentInstanceId
        ) {
          seen.add(row.id);
          next.push({ id: row.id, parentId: row.parentInstanceId });
        }
      }
      reached.push(...next);
      level = next.map((one) => one.id);
    }
    return reached;
  };

  /**
   * The delegates under `id` this stop reached or that ended while it ran
   * (ended at or after `since`, or live still: background work, which
   * the stop leaves), newest item per session, nested as the tree was.
   */
  const outcomes = (id: string, since: Date, depth = 0): string[] => {
    const newest = new Map<string, WorkItemRow>();
    for (const item of db.workItemsOfParents([id])) {
      if (!newest.has(item.instanceId)) {
        newest.set(item.instanceId, item);
      }
    }
    return [...newest.values()]
      .filter((item) => !item.endedAt || item.endedAt >= since)
      .reverse()
      .flatMap((item) => {
        const said =
          item.headline ??
          (item.state === "failed" ? item.error?.split("\n")[0] : undefined) ??
          (item.background && isLive(item.state)
            ? "background work: it runs on"
            : undefined);
        return [
          `${"  ".repeat(depth)}- ${item.title} (work item ${handle(item.id)}): ${item.state}${said ? ` — ${said}` : ""}`,
          ...(item.background
            ? []
            : outcomes(item.instanceId, since, depth + 1)),
        ];
      });
  };

  /** The root's report to its parent: who stopped it, and how each delegate under it ended. */
  const reportRoot = (row: TreeStopRow, item: WorkItemRow): void => {
    const [session] = db.getInstancesByIds([row.instanceId]);
    if (!session || isHubParent(item.parentInstanceId)) {
      return;
    }
    const lines = outcomes(row.instanceId, row.askedAt);
    const headline = workWords.stoppedHeadline(item.title, lines.length);
    workItems.reportStopped(
      session,
      [
        headline,
        workWords.stoppedBy(askerWords(row.by)),
        ...(lines.length > 0
          ? [`${workWords.stoppedDelegates}\n${lines.join("\n")}`]
          : []),
        `[Work item ${handle(item.id)} is ${item.state} in workspace ${handle(item.workspaceId)}.]`,
      ].join("\n\n"),
      headline
    );
  };

  /** `row`'s session ended: its item takes its final state, its row goes, and the root reports. */
  const settle = (row: TreeStopRow): void => {
    const [session] = db.getInstancesByIds([row.instanceId]);
    const workItemId = session?.workItemId ?? null;
    workItems.stopConfirmed({ workItemId }, row.by);
    db.treeStops.drop(row.instanceId);
    const item = workItemId ? db.workItem(workItemId) : undefined;
    console.log(
      `[tree-stops] ${row.instanceId}: ended${item ? `, its item ${item.id} ${item.state}` : ""}${row.parentId ? `; ${db.treeStops.under(row.parentId).length} left under ${row.parentId}` : "; the stop is over"}`
    );
    if (row.instanceId === row.rootId && item) {
      reportRoot(row, item);
    }
  };

  /**
   * One pass over the standing rows, deepest first by construction: a row
   * with nothing under it has its end asked; one whose end is confirmed
   * settles. Answers whether anything moved, so a settle that freed the
   * session above is acted on in the next pass.
   */
  const step = (): boolean => {
    let moved = false;
    for (const row of db.treeStops.all()) {
      if (db.treeStops.under(row.instanceId).length > 0) {
        continue;
      }
      if (ended(row.instanceId)) {
        settle(row);
        moved = true;
        continue;
      }
      if (!row.endedAt) {
        db.treeStops.ended(row.instanceId, new Date());
        console.log(
          `[tree-stops] ${row.instanceId}: nothing under it is left; its end is asked of its machine`
        );
        end(row.instanceId, row.by, receipts.get(row.instanceId));
        receipts.delete(row.instanceId);
        moved = true;
      }
    }
    return moved;
  };

  const advance = (): void => {
    while (step()) {
      // Each pass may free the level above.
    }
  };

  return {
    /**
     * Stops `rootId` and its tree for `by`. Answers how many sessions under
     * it the stop reached. A session another stop holds keeps that stop's
     * place in it. `requestId`: a person's Stop waiting on the machine's
     * receipt, which the root's end carries when nothing is under it.
     */
    stop(rootId: string, by: EndedBy, requestId?: string): { under: number } {
      if (requestId && !db.ownedInstance(rootId)) {
        throw new Error(
          "This session is no longer recorded. Refresh, then retry."
        );
      }
      const reached = walk(rootId);
      if (requestId && reached.length === 1) {
        receipts.set(rootId, requestId);
      }
      const askedAt = new Date();
      db.treeStops.put(
        reached.map(({ id, parentId }) => ({
          instanceId: id,
          rootId,
          parentId,
          by,
          askedAt,
        }))
      );
      for (const { id } of reached) {
        const [row] = db.getInstancesByIds([id]);
        if (row) {
          workItems.stopping(row, by);
        }
      }
      console.log(
        `[tree-stops] ${rootId}: stop asked by ${askerWords(by)}; ${reached.length - 1} session(s) under it end first`
      );
      advance();
      receipts.delete(rootId);
      return { under: reached.length - 1 };
    },

    /**
     * The machine confirmed `row`'s session ended: its live item takes its
     * final state now, whether or not a tree stop holds it (a stop asked
     * any other way: a discard, a project's), and a tree stop moves on.
     */
    confirmed(row: { id: string; workItemId: string | null }): void {
      const held = db.treeStops.get(row.id);
      workItems.stopConfirmed(row, held?.by ?? null);
      if (held) {
        advance();
      }
    },

    /**
     * Carries the standing stops on, as the hub starts: an end confirmed
     * while it was down settles, and a level freed asks the next end.
     * Every item held by a stop whose session ended meanwhile takes its
     * final state too.
     */
    resume(): void {
      for (const item of db.liveWorkItems()) {
        if (
          item.stoppingAt &&
          !db.treeStops.get(item.instanceId) &&
          ended(item.instanceId)
        ) {
          workItems.stopConfirmed({ workItemId: item.id });
        }
      }
      advance();
    },
  };
};

export type TreeStops = ReturnType<typeof createTreeStops>;
