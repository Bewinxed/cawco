/** A delegate's reports and asks, and the turns already recorded. */

import type {
  DelegateAskStatus,
  DelegateEvent,
  DelegateEventKind,
  DelegateEventPayload,
  DelegateSummary,
} from "@cawco/core/protocol";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { DbCore } from "./core";
import { completedTurns, delegateEvents } from "./schema";

/** How many delegate events one page of `delegateEventsPage` holds at most. */
const DELEGATE_EVENTS_PAGE = 200;

type DelegateReportEvent = Extract<DelegateEvent, { kind: "report" }>;

type DelegateAskEvent = Extract<DelegateEvent, { kind: "ask" }>;

/**
 * A delegate_events row as everything reads it: its date as JSON writes one,
 * its payload paired with its kind, which the two columns cannot say, and a
 * report's turn identity (its own columns) back in its payload.
 */
const delegateEventOf = ({
  resultId,
  completedAt,
  ...row
}: typeof delegateEvents.$inferSelect): DelegateEvent =>
  ({
    ...row,
    payload: {
      ...row.payload,
      ...(resultId === null ? {} : { resultId }),
      ...(completedAt === null ? {} : { completedAt }),
    },
    createdAt: row.createdAt.toISOString(),
  }) as DelegateEvent;

export interface DelegateEventsDb {
  /** Claims one harness completion before any turn-end side effect. */
  readonly claimCompletedTurn: (
    instanceId: string,
    resultId: string,
    completedAt: string | undefined,
    recovered: boolean
  ) => boolean;
  /** The ask a `requestId` opened, so its answer is filed under the same parent. */
  readonly delegateAsk: (requestId: string) => DelegateEvent | undefined;
  /**
   * One page of delegate events, oldest first: the newest
   * {@link DELEGATE_EVENTS_PAGE} below `before` (an event id; absent, the
   * newest there are) of one delegate, or of every delegate of one parent.
   */
  readonly delegateEventsPage: (filter: {
    parent?: string;
    instance?: string;
    before?: number;
  }) => DelegateEvent[];
  /**
   * What each of these delegates' cards draws of its traffic with `parent`
   * ({@link DelegateSummary}); a delegate with none is left out.
   */
  readonly delegateSummaries: (
    parent: string,
    delegates: string[]
  ) => DelegateSummary[];
  /** Files one exchange between a delegate and its parent, and hands back the row. */
  readonly recordDelegateEvent: (event: {
    instanceId: string;
    parentInstanceId: string;
    kind: DelegateEventKind;
    requestId?: string;
    toolName?: string;
    requestKind?: "question" | "tool";
    payload: DelegateEventPayload;
    status?: DelegateAskStatus;
  }) => DelegateEvent;
  readonly recordedTurns: (instanceId: string) => {
    hasTurns: boolean;
    lastTurnAt: string | null;
    unbounded: boolean;
  };
  /** Closes it. An ask this hub never recorded is nothing to close. */
  readonly settleDelegateAsk: (
    requestId: string,
    status: DelegateAskStatus
  ) => void;
}

export const delegateEventsDb = (core: DbCore): DelegateEventsDb => {
  const { db } = core;

  return {
    // A report's turn identity is its columns, which the turn queries join on.
    recordDelegateEvent: ({ payload, ...event }) => {
      const { resultId, completedAt, ...rest } = payload as {
        completedAt?: string;
        resultId?: string;
      };
      return delegateEventOf(
        db
          .insert(delegateEvents)
          .values({
            ...event,
            payload: rest as DelegateEventPayload,
            resultId: resultId ?? null,
            completedAt: completedAt ?? null,
          })
          .returning()
          .get()
      );
    },
    claimCompletedTurn: (instanceId, resultId, completedAt, recovered) => {
      const receivedAt = recovered ? undefined : new Date().toISOString();
      // Each report's identity, its body left unread.
      const reports = db
        .select({
          requestId: delegateEvents.requestId,
          resultId: delegateEvents.resultId,
          completedAt: delegateEvents.completedAt,
          createdAt: delegateEvents.createdAt,
        })
        .from(delegateEvents)
        .where(
          and(
            eq(delegateEvents.instanceId, instanceId),
            eq(delegateEvents.kind, "report")
          )
        )
        .all();
      const exact = reports.some(
        (report) =>
          report.requestId === resultId ||
          report.resultId === resultId ||
          (completedAt !== undefined &&
            (report.completedAt === completedAt ||
              report.createdAt.toISOString() === completedAt))
      );
      // An old report without a harness identity cannot prove a fresh completion.
      // Adopt that recovered identity silently, as directed; never guess by time proximity.
      const unkeyed =
        recovered &&
        reports.length > 0 &&
        reports.every(
          (report) => report.resultId === null && report.completedAt === null
        );
      const inserted = db
        .insert(completedTurns)
        .values({
          instanceId,
          resultId,
          completedAt: completedAt ?? receivedAt,
          adoptedWithoutReport: unkeyed && !exact,
        })
        .onConflictDoNothing()
        .returning()
        .all();
      return inserted.length > 0 && !exact && !unkeyed;
    },
    recordedTurns: (instanceId) =>
      db
        .select({
          hasTurns: sql<boolean>`count(*) > 0`.mapWith(Boolean),
          lastTurnAt: sql<
            string | null
          >`max(coalesce(${completedTurns.completedAt}, strftime('%Y-%m-%dT%H:%M:%fZ', ${delegateEvents.createdAt} / 1000.0, 'unixepoch')))`,
          unbounded:
            sql<boolean>`count(case when ${completedTurns.completedAt} is null and ${delegateEvents.createdAt} is null then 1 end) > 0`.mapWith(
              Boolean
            ),
        })
        .from(completedTurns)
        .leftJoin(
          delegateEvents,
          and(
            eq(delegateEvents.instanceId, completedTurns.instanceId),
            eq(delegateEvents.kind, "report"),
            eq(delegateEvents.resultId, completedTurns.resultId)
          )
        )
        .where(eq(completedTurns.instanceId, instanceId))
        .get() as {
        hasTurns: boolean;
        lastTurnAt: string | null;
        unbounded: boolean;
      },
    delegateAsk: (requestId) => {
      const row = db
        .select()
        .from(delegateEvents)
        .where(
          and(
            eq(delegateEvents.kind, "ask"),
            eq(delegateEvents.requestId, requestId)
          )
        )
        .get();
      return row && delegateEventOf(row);
    },
    settleDelegateAsk: (requestId, status) => {
      db.update(delegateEvents)
        .set({ status })
        .where(
          and(
            eq(delegateEvents.kind, "ask"),
            eq(delegateEvents.requestId, requestId)
          )
        )
        .run();
    },
    // By id after the timestamp: an ask and the answer it settles can land in
    // the same millisecond, and a reader who sees the answer first sees a
    // conversation that runs backwards.
    delegateEventsPage: ({ parent, instance, before }) =>
      db
        .select()
        .from(delegateEvents)
        .where(
          and(
            parent ? eq(delegateEvents.parentInstanceId, parent) : undefined,
            instance ? eq(delegateEvents.instanceId, instance) : undefined,
            before === undefined ? undefined : lt(delegateEvents.id, before)
          )
        )
        .orderBy(desc(delegateEvents.id))
        .limit(DELEGATE_EVENTS_PAGE)
        .all()
        .reverse()
        .map(delegateEventOf),
    // Counted in SQL, and only the rows a card draws read whole: the newest
    // report and the asks still waiting. Every other payload (each earlier
    // report's body, each settled ask's tool input) stays on disk.
    delegateSummaries: (parent, delegates) => {
      if (delegates.length === 0) {
        return [];
      }
      const mine = and(
        eq(delegateEvents.parentInstanceId, parent),
        inArray(delegateEvents.instanceId, delegates)
      );
      const counts = db
        .select({
          instanceId: delegateEvents.instanceId,
          through: sql<number>`max(${delegateEvents.id})`.mapWith(Number),
          reports:
            sql<number>`count(case when ${delegateEvents.kind} = 'report' then 1 end)`.mapWith(
              Number
            ),
          asks: sql<number>`count(case when ${delegateEvents.kind} = 'ask' then 1 end)`.mapWith(
            Number
          ),
          report: sql<
            number | null
          >`max(case when ${delegateEvents.kind} = 'report' then ${delegateEvents.id} end)`,
        })
        .from(delegateEvents)
        .where(mine)
        .groupBy(delegateEvents.instanceId)
        .all();
      const reportIds = counts.flatMap((row) =>
        row.report === null ? [] : [Number(row.report)]
      );
      const whole = db
        .select()
        .from(delegateEvents)
        .where(
          or(
            reportIds.length > 0
              ? inArray(delegateEvents.id, reportIds)
              : undefined,
            and(
              mine,
              eq(delegateEvents.kind, "ask"),
              eq(delegateEvents.status, "pending")
            )
          )
        )
        .orderBy(delegateEvents.id)
        .all()
        .map(delegateEventOf);
      return counts.map(({ report, ...row }) => ({
        ...row,
        report:
          whole.find(
            (event): event is DelegateReportEvent =>
              event.kind === "report" && event.id === Number(report)
          ) ?? null,
        pending: whole.filter(
          (event): event is DelegateAskEvent =>
            event.kind === "ask" && event.instanceId === row.instanceId
        ),
      }));
    },
  };
};
