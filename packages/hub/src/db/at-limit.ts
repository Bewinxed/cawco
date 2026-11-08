import type { AccountMove } from "@cawco/core/accounts";
import type { ContextFill, FiledRecords } from "@cawco/core/context-filing";
import { and, asc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  contextCompactions,
  contextRises,
  instances,
  limitCompactions,
  limitEvents,
  limitHolds,
  limitStops,
} from "./schema";

/** A session waiting out its account's limit. */
export interface LimitHold {
  /** The account at its limit. */
  accountId: string;
  instanceId: string;
  /**
   * Since when it is held, epoch ms: a put keeps the first, unless it names
   * one (a hold put again after a move that didn't go keeps its start).
   */
  since?: number;
  /**
   * When it went stale, epoch ms: held past the cutoff (core
   * `AtLimit.staleAfterHours`), nothing carries it on until a person or its
   * parent writes. Null while it is carried on; every put clears it.
   */
  staleAt: number | null;
  /** When it goes on: the earliest moment an account takes it again; null when none was named. */
  until: number | null;
}

/**
 * A session whose latest turn a usage limit ended (schema `limitStops`):
 * when, and the account that refused it (null: the machine's own sign-in).
 */
export interface LimitStop {
  accountId: string | null;
  at: number;
  instanceId: string;
}

/** What every compaction plan has: its steps, by their sends, and where it stands. */
interface CompactionSteps {
  /** Its carry-on's send (`carrying`), when its limit or sign-in stopped it; null when it carries nothing on. */
  carryUuid: string | null;
  compacted: boolean;
  /**
   * The step (its send's uuid) whose turn the hub heard end, its result
   * read after the step was: kept so a hub that restarts before the next
   * step goes moves on from it. Null until a step's turn ends.
   */
  endedStep: string | null;
  filingUuid: string;
  instanceId: string;
  /** Its line, said again as it goes: a move's `limit_events` id, a filing's `session_lines` id. */
  lineId: string;
  stage: "carrying" | "filing" | "compacting";
}

/**
 * A session's compaction plan (schema `limitCompactions`), until it has
 * ended: a move's that compacts it (`move`, its line), its filing turn then
 * its harness's `/compact` (`compactUuid`); or its filing at its context
 * threshold (`fill`, the reading it fired at), the filing turn alone, its
 * harness compacting it later on its own, with what its records held as it
 * started (`records`; null when they could not be read), which what it
 * wrote is counted against.
 */
export type LimitCompaction = CompactionSteps &
  (
    | { compactUuid: string; fill: null; move: AccountMove; records: null }
    | {
        compactUuid: null;
        fill: ContextFill;
        move: null;
        records: FiledRecords | null;
      }
  );

/**
 * A session whose context came within its policy's `fileRoom` of its
 * harness's compaction point since its harness last compacted it (schema
 * `contextRises`): one rise files once.
 */
export interface ContextRise {
  at: number;
  instanceId: string;
  /** The line that says it: its filing's, else the failed compaction's. */
  lineId: string;
}

/** One line the hub wrote into a session's transcript at its account's limit. */
export interface LimitEvent {
  at: number;
  id: string;
  instanceId: string;
  move: AccountMove;
}

export interface AtLimitDb {
  /**
   * Since when `instanceId`'s harness compacted it with no answer of its own
   * after (schema `contextCompactions`); undefined when it has answered since.
   */
  readonly compactedAt: (instanceId: string) => number | undefined;
  readonly compaction: (instanceId: string) => LimitCompaction | undefined;
  /** Each session's compaction under way. */
  readonly compactions: () => LimitCompaction[];
  /** `instanceId` answered a request of its own: its compaction no longer holds its filing back. */
  readonly dropCompacted: (instanceId: string) => void;
  readonly dropCompaction: (instanceId: string) => void;
  /** Takes one line back. */
  readonly dropEvent: (id: string) => void;
  readonly dropHold: (instanceId: string) => void;
  /** Takes `instanceId`'s rise away: its harness compacted it, so the threshold files again. */
  readonly dropRise: (instanceId: string) => void;
  /** A turn of `instanceId` ended other than at a usage limit: its stop, if any, is over. */
  readonly dropStop: (instanceId: string) => void;
  /** The lines written into these sessions' transcripts, oldest first. */
  readonly events: (instanceIds: string[]) => LimitEvent[];
  readonly forget: (instanceIds: string[]) => void;
  readonly hold: (instanceId: string) => LimitHold | undefined;
  readonly holds: () => LimitHold[];
  /** Records that `instanceId`'s hold went stale at `at`. */
  readonly markStale: (instanceId: string, at: number) => void;
  /** Moves a compaction on: its stage, the step whose turn ended, that it compacted, or its move's line as it now reads. */
  readonly patchCompaction: (
    instanceId: string,
    patch: Partial<
      Pick<CompactionSteps, "compacted" | "endedStep" | "stage">
    > & {
      move?: AccountMove;
    }
  ) => void;
  /** Marks `instanceId` compacted at `at`, no answer of its own since. */
  readonly putCompacted: (instanceId: string, at: number) => void;
  /** Starts a session's compaction, in place of any it had. */
  readonly putCompaction: (compaction: LimitCompaction) => void;
  /** Writes a line; one already written under its id is what it says now (a compaction's move line as it goes). */
  readonly putEvent: (event: LimitEvent) => void;
  /** Holds a session, its stale mark cleared: a put is a decision made now. */
  readonly putHold: (hold: Omit<LimitHold, "staleAt">) => void;
  /** Marks a session's context risen to its threshold, in place of any rise it had. */
  readonly putRise: (rise: ContextRise) => void;
  /** A turn of `instanceId` ended at a usage limit, in place of any stop it had. */
  readonly putStop: (stop: LimitStop) => void;
  /** The session's rise since its last compaction; undefined when none. */
  readonly rise: (instanceId: string) => ContextRise | undefined;
  /**
   * Every stop that stands: its session not continued in another, never a
   * continuation's summariser, and no turn of it under way since the stop
   * (a carry-on at the reset, on another account, or a message's turn).
   */
  readonly standingStops: () => LimitStop[];
  /**
   * The line of `instanceId`'s move waiting for work in flight, while it
   * waits ({@link waitsLine}): one per session, said again in its place.
   */
  readonly waitingMove: (instanceId: string) => LimitEvent | undefined;
}

/**
 * Whether `move` is a move waiting for work in flight ("Can't move from A to
 * B yet"): a session's one line of it stands while it waits, each attempt
 * saying it again in place, and goes when the move lands or the wait ends.
 */
export const waitsLine = (move: AccountMove): boolean =>
  move.kind === "unmoved" && move.action === "move" && move.waits === true;

type HoldRow = typeof limitHolds.$inferSelect;

const toHold = (row: HoldRow): LimitHold => ({
  instanceId: row.instanceId,
  accountId: row.accountId,
  until: row.until?.getTime() ?? null,
  since: row.createdAt.getTime(),
  staleAt: row.staleAt?.getTime() ?? null,
});

/** A stored plan, by what it is for: a move's, or a filing's at the threshold. Undefined for a row that is neither, as no write makes. */
const toCompaction = (
  row: typeof limitCompactions.$inferSelect
): LimitCompaction | undefined => {
  const steps: CompactionSteps = {
    instanceId: row.instanceId,
    stage: row.stage,
    lineId: row.lineId,
    carryUuid: row.carryUuid,
    filingUuid: row.filingUuid,
    compacted: row.compacted,
    endedStep: row.endedStep,
  };
  if (row.move && row.compactUuid) {
    return {
      ...steps,
      move: row.move,
      compactUuid: row.compactUuid,
      fill: null,
      records: null,
    };
  }
  if (row.fill) {
    return {
      ...steps,
      fill: row.fill,
      compactUuid: null,
      move: null,
      records: row.records,
    };
  }
  return undefined;
};

const toEvent = (row: typeof limitEvents.$inferSelect): LimitEvent => ({
  id: row.id,
  instanceId: row.instanceId,
  at: row.at.getTime(),
  move: row.move,
});

export const atLimitDb = (db: BunSQLiteDatabase): AtLimitDb => ({
  holds: () => db.select().from(limitHolds).all().map(toHold),
  hold: (instanceId) => {
    const row = db
      .select()
      .from(limitHolds)
      .where(eq(limitHolds.instanceId, instanceId))
      .get();
    return row ? toHold(row) : undefined;
  },
  putHold: ({ instanceId, accountId, until, since }) => {
    const values = {
      accountId,
      until: until === null ? null : new Date(until),
      staleAt: null,
      ...(since === undefined ? {} : { createdAt: new Date(since) }),
    };
    db.insert(limitHolds)
      .values({ instanceId, ...values })
      .onConflictDoUpdate({ target: limitHolds.instanceId, set: values })
      .run();
  },
  markStale: (instanceId, at) => {
    db.update(limitHolds)
      .set({ staleAt: new Date(at) })
      .where(eq(limitHolds.instanceId, instanceId))
      .run();
  },
  dropHold: (instanceId) => {
    db.delete(limitHolds).where(eq(limitHolds.instanceId, instanceId)).run();
  },
  compactions: () =>
    db
      .select()
      .from(limitCompactions)
      .all()
      .flatMap((row) => toCompaction(row) ?? []),
  compaction: (instanceId) => {
    const row = db
      .select()
      .from(limitCompactions)
      .where(eq(limitCompactions.instanceId, instanceId))
      .get();
    return row ? toCompaction(row) : undefined;
  },
  rise: (instanceId) => {
    const row = db
      .select()
      .from(contextRises)
      .where(eq(contextRises.instanceId, instanceId))
      .get();
    return row
      ? { instanceId: row.instanceId, lineId: row.lineId, at: row.at.getTime() }
      : undefined;
  },
  putRise: ({ instanceId, lineId, at }) => {
    const values = { lineId, at: new Date(at) };
    db.insert(contextRises)
      .values({ instanceId, ...values })
      .onConflictDoUpdate({ target: contextRises.instanceId, set: values })
      .run();
  },
  compactedAt: (instanceId) =>
    db
      .select({ at: contextCompactions.at })
      .from(contextCompactions)
      .where(eq(contextCompactions.instanceId, instanceId))
      .get()
      ?.at.getTime(),
  putCompacted: (instanceId, at) => {
    db.insert(contextCompactions)
      .values({ instanceId, at: new Date(at) })
      .onConflictDoUpdate({
        target: contextCompactions.instanceId,
        set: { at: new Date(at) },
      })
      .run();
  },
  dropCompacted: (instanceId) => {
    db.delete(contextCompactions)
      .where(eq(contextCompactions.instanceId, instanceId))
      .run();
  },
  dropRise: (instanceId) => {
    db.delete(contextRises)
      .where(eq(contextRises.instanceId, instanceId))
      .run();
  },
  putCompaction: (compaction) => {
    const values = { ...compaction, createdAt: new Date() };
    db.insert(limitCompactions)
      .values(values)
      .onConflictDoUpdate({ target: limitCompactions.instanceId, set: values })
      .run();
  },
  patchCompaction: (instanceId, patch) => {
    db.update(limitCompactions)
      .set(patch)
      .where(eq(limitCompactions.instanceId, instanceId))
      .run();
  },
  dropCompaction: (instanceId) => {
    db.delete(limitCompactions)
      .where(eq(limitCompactions.instanceId, instanceId))
      .run();
  },
  putStop: ({ instanceId, accountId, at }) => {
    const values = { accountId, at: new Date(at) };
    db.insert(limitStops)
      .values({ instanceId, ...values })
      .onConflictDoUpdate({ target: limitStops.instanceId, set: values })
      .run();
  },
  dropStop: (instanceId) => {
    db.delete(limitStops).where(eq(limitStops.instanceId, instanceId)).run();
  },
  standingStops: () =>
    db
      .select({
        instanceId: limitStops.instanceId,
        accountId: limitStops.accountId,
        at: limitStops.at,
      })
      .from(limitStops)
      .innerJoin(instances, eq(instances.id, limitStops.instanceId))
      .where(
        and(
          isNull(instances.continuedInto),
          ne(instances.kind, "summariser"),
          or(
            isNull(instances.turnOpenAt),
            lt(instances.turnOpenAt, limitStops.at)
          )
        )
      )
      .all()
      .map((row) => ({ ...row, at: row.at.getTime() })),
  dropEvent: (id) => {
    db.delete(limitEvents).where(eq(limitEvents.id, id)).run();
  },
  putEvent: ({ id, instanceId, at, move }) => {
    db.insert(limitEvents)
      .values({ id, instanceId, at: new Date(at), move })
      .onConflictDoUpdate({
        target: limitEvents.id,
        set: { at: new Date(at), move },
      })
      .run();
  },
  events: (instanceIds) =>
    instanceIds.length === 0
      ? []
      : db
          .select()
          .from(limitEvents)
          .where(inArray(limitEvents.instanceId, instanceIds))
          .orderBy(asc(limitEvents.at))
          .all()
          .map(toEvent),
  waitingMove: (instanceId) =>
    db
      .select()
      .from(limitEvents)
      .where(eq(limitEvents.instanceId, instanceId))
      .orderBy(asc(limitEvents.at))
      .all()
      .map(toEvent)
      .findLast((event) => waitsLine(event.move)),
  forget: (instanceIds) => {
    if (instanceIds.length === 0) {
      return;
    }
    db.delete(limitHolds)
      .where(inArray(limitHolds.instanceId, instanceIds))
      .run();
    db.delete(limitCompactions)
      .where(inArray(limitCompactions.instanceId, instanceIds))
      .run();
    db.delete(limitEvents)
      .where(inArray(limitEvents.instanceId, instanceIds))
      .run();
    db.delete(limitStops)
      .where(inArray(limitStops.instanceId, instanceIds))
      .run();
    db.delete(contextCompactions)
      .where(inArray(contextCompactions.instanceId, instanceIds))
      .run();
    db.delete(contextRises)
      .where(inArray(contextRises.instanceId, instanceIds))
      .run();
  },
});
