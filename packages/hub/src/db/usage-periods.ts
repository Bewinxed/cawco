import { DAY_MS } from "@cawco/core/time";
import { resetMinute } from "@cawco/core/usage/windows";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { weightedTokens } from "../turn-weight";
import {
  turnUsage,
  usageLimitHistory,
  usagePeriodMarks,
  usagePeriods,
} from "./schema";
import type { Tx } from "./tx";

/**
 * The usage summary (schema `usagePeriods`, `usagePeriodMarks`): one row
 * per window period of an account, and one mark per reading that moved it,
 * kept as each reading moves a window ({@link notePeriods}, from db
 * accounts.ts `putReading`) and as each turn's usage is recorded
 * ({@link noteTurns}, from db turn-usage.ts `put`). Read from a moment on
 * ({@link UsagePeriodsDb.periods}), its rows say what `usage_limit_history`
 * and `turn_usage` said of each period from that moment: the readings since
 * it, the turns between the first of them and the latest. So no reader goes
 * back to the history or the turns (forecast.ts).
 */

/** How long a period's row, and a mark, is kept after its latest reading: two weekly windows, as turns are. */
const PERIOD_RETENTION_MS = 15 * DAY_MS;

/** One window period of an account (schema `usagePeriods`), as read from a moment on. */
export interface UsagePeriod {
  accountId: string;
  /** Its first reading at or after the moment it is read from. */
  firstAt: number;
  firstPercent: number;
  kind: string;
  lastAt: number;
  lastPercent: number;
  /** Its reset rounded to the minute (core `resetMinute`); null when none was named. */
  resetMinute: number | null;
  scopeLabel: string | null;
  /** Weighted tokens (turn-weight.ts `weightedTokens`) of the turns after its first reading, by its latest. */
  tokens: number;
  /** Dollars (`turn_usage.cost_usd`, unpriced as 0) of those turns. */
  usd: number;
}

/** A window a reading moved, as the summary keys and keeps it. */
export interface MovedWindow {
  kind: string;
  percent: number;
  resetsAt: string | null;
  scopeLabel: string | null;
}

/** One recorded turn row, as the summary counts it. */
export interface CountedTurn {
  accountId: string | null;
  at: Date;
  cacheReadTokens: number;
  cacheWrite1hTokens: number | null;
  cacheWriteTokens: number;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
}

/** A period's key columns. */
interface PeriodKey {
  accountId: string;
  kind: string;
  resetMinute: number;
  scopeLabel: string;
}

/** Weighted tokens and dollars. */
interface Spend {
  tokens: number;
  usd: number;
}

const NOTHING: Spend = { tokens: 0, usd: 0 };

type HistoryPoint = typeof usageLimitHistory.$inferSelect;

const toPeriod = (row: typeof usagePeriods.$inferSelect): UsagePeriod => ({
  accountId: row.accountId,
  kind: row.kind,
  scopeLabel: row.scopeLabel === "" ? null : row.scopeLabel,
  resetMinute: row.resetMinute === 0 ? null : row.resetMinute,
  firstAt: row.firstAt.getTime(),
  firstPercent: row.firstPercent,
  lastAt: row.lastAt.getTime(),
  lastPercent: row.lastPercent,
  tokens: row.tokens,
  usd: row.usd,
});

/** The key columns of `window`'s period. */
const keyOf = (accountId: string, window: MovedWindow): PeriodKey => ({
  accountId,
  kind: window.kind,
  scopeLabel: window.scopeLabel ?? "",
  resetMinute: resetMinute(window) ?? 0,
});

/** `key`'s period row. */
const periodIs = (key: PeriodKey) =>
  and(
    eq(usagePeriods.accountId, key.accountId),
    eq(usagePeriods.kind, key.kind),
    eq(usagePeriods.scopeLabel, key.scopeLabel),
    eq(usagePeriods.resetMinute, key.resetMinute)
  );

/** `key`'s marks. */
const marksOf = (key: PeriodKey) =>
  and(
    eq(usagePeriodMarks.accountId, key.accountId),
    eq(usagePeriodMarks.kind, key.kind),
    eq(usagePeriodMarks.scopeLabel, key.scopeLabel),
    eq(usagePeriodMarks.resetMinute, key.resetMinute)
  );

/** A turn's spend as the summary counts it. */
const spendOf = (turn: CountedTurn): Spend => ({
  tokens: weightedTokens(turn),
  usd: turn.costUsd ?? 0,
});

/** `a` and `b` together. */
const plus = (a: Spend, b: Spend): Spend => ({
  tokens: a.tokens + b.tokens,
  usd: a.usd + b.usd,
});

/** `a` less `b`. */
const less = (a: Spend, b: Spend): Spend => ({
  tokens: a.tokens - b.tokens,
  usd: a.usd - b.usd,
});

/**
 * What the turns recorded on `accountId` after `from`, by `to`, spent: a
 * range of the turns' time index between two readings, read only for a
 * reading that arrives out of order.
 */
const spentBetween = (
  tx: Tx,
  accountId: string,
  from: number,
  to: number
): Spend =>
  tx
    .select()
    .from(turnUsage)
    .where(
      and(
        eq(turnUsage.accountId, accountId),
        gt(turnUsage.at, new Date(from)),
        lte(turnUsage.at, new Date(to))
      )
    )
    .all()
    .reduce((sum, turn) => plus(sum, spendOf(turn)), NOTHING);

/**
 * A reading at `at` comes before its period's first: the turns between it
 * and that first reading join the period and every mark of it, and it is
 * the period's first.
 */
const readBeforeFirst = (
  tx: Tx,
  key: PeriodKey,
  row: typeof usagePeriods.$inferSelect,
  at: number,
  percent: number
): void => {
  const extra = spentBetween(tx, key.accountId, at, row.firstAt.getTime());
  tx.update(usagePeriods)
    .set({
      firstAt: new Date(at),
      firstPercent: percent,
      ...plus(row, extra),
    })
    .where(periodIs(key))
    .run();
  tx.update(usagePeriodMarks)
    .set({
      tokens: sql`${usagePeriodMarks.tokens} + ${extra.tokens}`,
      usd: sql`${usagePeriodMarks.usd} + ${extra.usd}`,
    })
    .where(marksOf(key))
    .run();
};

/** The spend a reading at `at`, inside its period's span, marks: the mark's before it, and the turns since that mark. */
const markInside = (tx: Tx, key: PeriodKey, at: number): Spend => {
  const before = tx
    .select()
    .from(usagePeriodMarks)
    .where(and(marksOf(key), lte(usagePeriodMarks.at, new Date(at))))
    .orderBy(desc(usagePeriodMarks.at))
    .limit(1)
    .get();
  return before
    ? plus(before, spentBetween(tx, key.accountId, before.at.getTime(), at))
    : NOTHING;
};

/**
 * One reading at `at` of `key`'s period, `percent` used: the period starts,
 * or its latest reading moves on and the turns since its last reading join
 * it, or an earlier reading joins where it falls. Answers the spend from
 * the period's first reading up to this one, the reading's mark.
 */
const notePeriod = (
  tx: Tx,
  key: PeriodKey,
  percent: number,
  at: number
): Spend => {
  const row = tx.select().from(usagePeriods).where(periodIs(key)).get();
  if (!row) {
    tx.insert(usagePeriods)
      .values({
        ...key,
        firstAt: new Date(at),
        firstPercent: percent,
        lastAt: new Date(at),
        lastPercent: percent,
        ...NOTHING,
        pendingTokens: 0,
        pendingUsd: 0,
      })
      .run();
    return NOTHING;
  }
  if (at > row.lastAt.getTime()) {
    const mark = plus(row, { tokens: row.pendingTokens, usd: row.pendingUsd });
    tx.update(usagePeriods)
      .set({
        lastAt: new Date(at),
        lastPercent: percent,
        ...mark,
        pendingTokens: 0,
        pendingUsd: 0,
      })
      .where(periodIs(key))
      .run();
    return mark;
  }
  if (at < row.firstAt.getTime()) {
    readBeforeFirst(tx, key, row, at, percent);
    return NOTHING;
  }
  return markInside(tx, key, at);
};

/**
 * A reading at `at` moved `moved` of `accountId`'s windows (a new percent,
 * severity or reset: the points `usage_limit_history` takes): each one's
 * period takes it ({@link notePeriod}), and it is a mark of that period,
 * with the spend from the period's first reading up to it. Its percent is
 * kept rounded, as the history keeps it. Periods and marks past the
 * retention go.
 */
export const notePeriods = (
  tx: Tx,
  accountId: string,
  moved: readonly MovedWindow[],
  at: number
): void => {
  for (const window of moved) {
    const key = keyOf(accountId, window);
    const percent = Math.round(window.percent);
    const mark = notePeriod(tx, key, percent, at);
    tx.insert(usagePeriodMarks)
      .values({ ...key, at: new Date(at), percent, ...mark })
      .onConflictDoNothing()
      .run();
  }
  if (moved.length > 0) {
    const cutoff = new Date(at - PERIOD_RETENTION_MS);
    tx.delete(usagePeriods).where(lt(usagePeriods.lastAt, cutoff)).run();
    tx.delete(usagePeriodMarks).where(lt(usagePeriodMarks.at, cutoff)).run();
  }
};

/**
 * Turns just recorded: each joins every period of its account that it
 * falls inside (after the period's first reading, by its latest), and every
 * mark of those at or after it; it waits in the pending sums of every
 * period whose latest reading it came after, for that period's next
 * reading.
 */
export const noteTurns = (tx: Tx, turns: readonly CountedTurn[]): void => {
  for (const turn of turns) {
    const { accountId } = turn;
    if (!accountId) {
      continue;
    }
    const { tokens, usd } = spendOf(turn);
    const inside = and(
      eq(usagePeriods.accountId, accountId),
      lt(usagePeriods.firstAt, turn.at),
      gte(usagePeriods.lastAt, turn.at)
    );
    const keys = tx
      .select({
        accountId: usagePeriods.accountId,
        kind: usagePeriods.kind,
        scopeLabel: usagePeriods.scopeLabel,
        resetMinute: usagePeriods.resetMinute,
      })
      .from(usagePeriods)
      .where(inside)
      .all();
    for (const key of keys) {
      tx.update(usagePeriodMarks)
        .set({
          tokens: sql`${usagePeriodMarks.tokens} + ${tokens}`,
          usd: sql`${usagePeriodMarks.usd} + ${usd}`,
        })
        .where(and(marksOf(key), gte(usagePeriodMarks.at, turn.at)))
        .run();
    }
    tx.update(usagePeriods)
      .set({
        tokens: sql`${usagePeriods.tokens} + ${tokens}`,
        usd: sql`${usagePeriods.usd} + ${usd}`,
      })
      .where(inside)
      .run();
    tx.update(usagePeriods)
      .set({
        pendingTokens: sql`${usagePeriods.pendingTokens} + ${tokens}`,
        pendingUsd: sql`${usagePeriods.pendingUsd} + ${usd}`,
      })
      .where(
        and(
          eq(usagePeriods.accountId, accountId),
          lt(usagePeriods.lastAt, turn.at)
        )
      )
      .run();
  }
};

/** One account's turns as running sums, for the fill: the spend of the turns at or before any moment. */
const runningSpend = (
  turns: readonly CountedTurn[]
): ((at: number) => Spend) => {
  const sorted = [...turns].sort((a, b) => a.at.getTime() - b.at.getTime());
  const ats = sorted.map((turn) => turn.at.getTime());
  const sums: Spend[] = [NOTHING];
  for (const turn of sorted) {
    sums.push(plus(sums.at(-1) ?? NOTHING, spendOf(turn)));
  }
  return (at) => {
    let low = 0;
    let high = ats.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((ats[mid] ?? 0) <= at) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return sums[low] ?? NOTHING;
  };
};

/** The history's points, oldest first, grouped into their periods by key. */
const pointsByPeriod = (
  points: readonly HistoryPoint[]
): { key: PeriodKey; points: HistoryPoint[] }[] => {
  const periods = new Map<string, { key: PeriodKey; points: HistoryPoint[] }>();
  for (const point of points) {
    const key = keyOf(point.accountId, point);
    const id = JSON.stringify(key);
    const known = periods.get(id) ?? { key, points: [] };
    known.points.push(point);
    periods.set(id, known);
  }
  return [...periods.values()];
};

/** One period of the fill written: its row from its points and the turns' running sums `by`, and a mark per point. */
const fillPeriod = (
  tx: Tx,
  key: PeriodKey,
  points: readonly HistoryPoint[],
  by: (at: number) => Spend
): void => {
  const [first] = points;
  const last = points.at(-1);
  if (!(first && last)) {
    return;
  }
  const base = by(first.fetchedAt.getTime());
  const upTo = by(last.fetchedAt.getTime());
  const pending = less(by(Number.POSITIVE_INFINITY), upTo);
  tx.insert(usagePeriods)
    .values({
      ...key,
      firstAt: first.fetchedAt,
      firstPercent: first.percent,
      lastAt: last.fetchedAt,
      lastPercent: last.percent,
      ...less(upTo, base),
      pendingTokens: pending.tokens,
      pendingUsd: pending.usd,
    })
    .run();
  for (const point of points) {
    tx.insert(usagePeriodMarks)
      .values({
        ...key,
        at: point.fetchedAt,
        percent: point.percent,
        ...less(by(point.fetchedAt.getTime()), base),
      })
      .onConflictDoNothing()
      .run();
  }
};

export interface UsagePeriodsDb {
  /**
   * Fills an empty summary from the history and turns the hub kept before
   * it existed, once: the periods and marks of the retention. How many
   * periods it wrote; 0 when the summary held any.
   */
  readonly fill: (now?: number) => number;
  /**
   * The periods of `accountIds` read at or after `since`, each as the
   * history from `since` draws it: one that opened before `since` is read
   * from its first mark at or after it, its percent and spend from there.
   */
  readonly periods: (
    accountIds: readonly string[],
    since: number
  ) => UsagePeriod[];
}

export const usagePeriodsDb = (db: BunSQLiteDatabase): UsagePeriodsDb => {
  /** `period` read from its first mark at or after `since`, when it opened before it: one keyed row. */
  const from = (period: UsagePeriod, since: number): UsagePeriod => {
    if (period.firstAt >= since) {
      return period;
    }
    const mark = db
      .select()
      .from(usagePeriodMarks)
      .where(
        and(
          marksOf({
            accountId: period.accountId,
            kind: period.kind,
            scopeLabel: period.scopeLabel ?? "",
            resetMinute: period.resetMinute ?? 0,
          }),
          gte(usagePeriodMarks.at, new Date(since))
        )
      )
      .orderBy(asc(usagePeriodMarks.at))
      .limit(1)
      .get();
    // Its latest reading is a mark at or after `since`, kept as long as it.
    const start = mark ?? {
      at: new Date(period.lastAt),
      percent: period.lastPercent,
      tokens: period.tokens,
      usd: period.usd,
    };
    return {
      ...period,
      firstAt: start.at.getTime(),
      firstPercent: start.percent,
      ...less(period, start),
    };
  };
  return {
    periods: (accountIds, since) =>
      accountIds.length === 0
        ? []
        : db
            .select()
            .from(usagePeriods)
            .where(
              and(
                inArray(usagePeriods.accountId, [...accountIds]),
                gte(usagePeriods.lastAt, new Date(since))
              )
            )
            .all()
            .map((row) => from(toPeriod(row), since)),
    fill: (now = Date.now()) =>
      db.transaction((tx) => {
        if (tx.select().from(usagePeriods).limit(1).get()) {
          return 0;
        }
        const since = new Date(now - PERIOD_RETENTION_MS);
        const periods = pointsByPeriod(
          tx
            .select()
            .from(usageLimitHistory)
            .where(gte(usageLimitHistory.fetchedAt, since))
            .orderBy(usageLimitHistory.fetchedAt)
            .all()
        );
        const turns = tx
          .select()
          .from(turnUsage)
          .where(and(gte(turnUsage.at, since), isNotNull(turnUsage.accountId)))
          .all();
        const spendOn = new Map<string, (at: number) => Spend>();
        for (const { key, points } of periods) {
          const by =
            spendOn.get(key.accountId) ??
            runningSpend(
              turns.filter((turn) => turn.accountId === key.accountId)
            );
          spendOn.set(key.accountId, by);
          fillPeriod(tx, key, points, by);
        }
        return periods.length;
      }),
  };
};
