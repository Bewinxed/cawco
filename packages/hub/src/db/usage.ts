/** Usage buckets and limits, and the rolled-up summary every usage view reads. */

import { REMOVED_MACHINE } from "@cawco/core/join";
import { HOUR_MS } from "@cawco/core/time";
import { resolveRates } from "@cawco/core/usage/pricing";
import type {
  OpenCodeGoLimits,
  UsageBucket,
  UsageGroupBy,
  UsageHarness,
  UsageSummary,
  UsageSummaryRow,
  UsageTotals,
} from "@cawco/core/usage/types";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { sessionLabel } from "../labels";
import type { DbCore } from "./core";
import {
  agents,
  claudeContextWindows,
  instances,
  skills,
  usageBuckets,
  usageLimits,
} from "./schema";

/** A stored OpenCode Go reading, one per machine (USAGE-SPEC.md §6). */
type UsageLimitRow = typeof usageLimits.$inferSelect;

/** A path's last folder, or undefined for none. */
const folderOf = (path: string | null | undefined): string | undefined =>
  (path ?? "").split("/").filter(Boolean).pop();

export interface UsageDb {
  /** Every claude model's last observed context window, by model id. */
  readonly claudeContextWindows: () => Record<string, number>;
  /** Every machine's latest OpenCode Go reading. */
  readonly listUsageLimits: () => UsageLimitRow[];
  /** Records the window a claude turn reported for its model. */
  readonly noteClaudeContextWindow: (
    model: string,
    contextWindow: number
  ) => void;
  /** Stores the machine's latest OpenCode Go reading; one row per machine. */
  readonly putOpenCodeGoLimits: (
    machineId: string,
    openCodeGo: OpenCodeGoLimits | null
  ) => void;
  /**
   * Stores a machine's usage buckets (USAGE-SPEC.md §6.2). Idempotent: the
   * bucket's id is its (machine, harness, session, model, hour) key, and an
   * upsert sets absolute totals — a re-report of the same bucket overwrites,
   * never accumulates.
   */
  readonly putUsageBuckets: (machineId: string, buckets: UsageBucket[]) => void;
  /** What a harness session has cost, in dollars, by the usage its machine reported. */
  readonly sessionCostUsd: (sessionId: string) => number;
  /** Names of fleet skills installed at or after `since`. */
  readonly skillsInstalledSince: (since: Date) => string[];
  /**
   * One harness's recorded cost since each boundary and in all, in one SQL
   * pass. A bucket counts toward a boundary when it starts at or after it;
   * a quarter-hour bucket never straddles a midnight in any zone.
   */
  readonly usageSpend: (q: {
    harness: UsageHarness;
    todayStart: number;
    weekStart: number;
  }) => { today: number; week: number; all: number };
  /** Aggregates buckets in SQL (SUM/GROUP BY) and names the unpriced models. */
  readonly usageSummary: (q: {
    since?: number;
    until?: number;
    harness?: string;
    machineId?: string;
    groupBy: UsageGroupBy;
  }) => UsageSummary;
}

export const usageDb = (core: DbCore): UsageDb => {
  const { db } = core;

  /** The column a usage summary groups on. */
  const usageKey = (groupBy: UsageGroupBy) => {
    if (groupBy === "start") {
      return usageBuckets.start;
    }
    if (groupBy === "machine") {
      return usageBuckets.machineId;
    }
    if (groupBy === "model") {
      return usageBuckets.model;
    }
    if (groupBy === "project") {
      return usageBuckets.project;
    }
    return usageBuckets.sessionId;
  };

  /** Each machine by id, for naming summary rows; a removed one keeps its place. */
  const usageMachines = (wanted: boolean) => {
    const machines = new Map(
      wanted
        ? db
            .select({
              id: agents.machineId,
              hostname: agents.hostname,
              os: agents.os,
            })
            .from(agents)
            .all()
            .map((agent) => [agent.id, agent])
        : []
    );
    return (id: string) =>
      machines.get(id) ?? { id, hostname: REMOVED_MACHINE, os: "" };
  };

  /** Each harness session's newest instance: its address and its name. */
  const usageSessions = (wanted: boolean) => {
    const sessions = new Map<
      string,
      { id: string; name: string; at: number }
    >();
    if (!wanted) {
      return sessions;
    }
    for (const row of db
      .select({
        id: instances.id,
        sessionId: instances.sessionId,
        title: instances.title,
        derivedTitle: instances.derivedTitle,
        cwd: instances.cwd,
        harness: instances.harness,
        launchDir: instances.launchDir,
        updatedAt: instances.updatedAt,
      })
      .from(instances)
      .where(isNotNull(instances.sessionId))
      .all()) {
      const at = row.updatedAt.getTime();
      const sessionId = row.sessionId ?? "";
      const held = sessions.get(sessionId);
      if (!held || at > held.at) {
        sessions.set(sessionId, {
          id: row.id,
          name: row.title ?? row.derivedTitle ?? sessionLabel(row).name,
          at,
        });
      }
    }
    return sessions;
  };

  /** The window a usage query names, or nothing — the filters fold into one AND. */
  const usageWhere = (q: {
    since?: number;
    until?: number;
    harness?: string;
    machineId?: string;
  }) =>
    and(
      q.since === undefined ? undefined : gte(usageBuckets.start, q.since),
      q.until === undefined ? undefined : lte(usageBuckets.start, q.until),
      q.harness === undefined
        ? undefined
        : eq(usageBuckets.harness, q.harness as UsageHarness),
      q.machineId === undefined
        ? undefined
        : eq(usageBuckets.machineId, q.machineId)
    );

  return {
    sessionCostUsd: (sessionId) =>
      db
        .select({
          usd: sql<number>`coalesce(sum(${usageBuckets.costUsd}), 0)`,
        })
        .from(usageBuckets)
        .where(eq(usageBuckets.sessionId, sessionId))
        .get()?.usd ?? 0,
    putUsageBuckets: (machineId, buckets) => {
      if (buckets.length === 0) {
        return;
      }
      // One transaction for the batch: the agent may send hundreds per tick, and
      // a half-written report is worse than a deferred one.
      db.transaction((tx) => {
        for (const bucket of buckets) {
          // The hour row stored before quarters for this session, model and
          // hour goes as its quarters arrive: a daemon's report after any
          // start is a full rebuild, carrying every quarter of every hour it
          // still holds, so the hour is replaced whole, never counted twice.
          // An hour the daemon no longer holds keeps its hour row.
          tx.delete(usageBuckets)
            .where(
              and(
                eq(usageBuckets.machineId, machineId),
                eq(usageBuckets.harness, bucket.harness),
                eq(usageBuckets.sessionId, bucket.sessionId),
                eq(usageBuckets.model, bucket.model),
                eq(usageBuckets.spanMs, HOUR_MS),
                eq(
                  usageBuckets.start,
                  Math.floor(bucket.start / HOUR_MS) * HOUR_MS
                )
              )
            )
            .run();
          const id = `${machineId}:${bucket.harness}:${bucket.sessionId}:${bucket.model}:${bucket.start}`;
          const row = {
            id,
            machineId,
            harness: bucket.harness,
            start: bucket.start,
            spanMs: bucket.spanMs,
            firstTs: bucket.firstTs,
            lastTs: bucket.lastTs,
            sessionId: bucket.sessionId,
            project: bucket.project,
            projectPath: bucket.projectPath,
            model: bucket.model,
            provider: bucket.provider,
            inputTokens: bucket.tokens.input,
            outputTokens: bucket.tokens.output,
            cacheCreationTokens: bucket.tokens.cacheCreation,
            cacheReadTokens: bucket.tokens.cacheRead,
            reasoningTokens: bucket.tokens.reasoning,
            costUsd: bucket.costUsd,
            messages: bucket.messages,
          };
          tx.insert(usageBuckets)
            .values(row)
            .onConflictDoUpdate({
              target: usageBuckets.id,
              // Absolute, not additive: the agent reports bucket totals, so a
              // re-send must overwrite rather than double-count.
              set: {
                start: row.start,
                spanMs: row.spanMs,
                firstTs: row.firstTs,
                lastTs: row.lastTs,
                project: row.project,
                projectPath: row.projectPath,
                model: row.model,
                provider: row.provider,
                inputTokens: row.inputTokens,
                outputTokens: row.outputTokens,
                cacheCreationTokens: row.cacheCreationTokens,
                cacheReadTokens: row.cacheReadTokens,
                reasoningTokens: row.reasoningTokens,
                costUsd: row.costUsd,
                messages: row.messages,
                updatedAt: new Date(),
              },
            })
            .run();
        }
      });
    },
    putOpenCodeGoLimits: (machineId, openCodeGo) => {
      const at = new Date();
      db.insert(usageLimits)
        .values({ machineId, openCodeGo, fetchedAt: at })
        .onConflictDoUpdate({
          target: usageLimits.machineId,
          set: { openCodeGo, fetchedAt: at },
        })
        .run();
    },
    listUsageLimits: () => db.select().from(usageLimits).all(),
    usageSpend: ({ harness, todayStart, weekStart }) => {
      const since = (start: number) =>
        sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${start} then ${usageBuckets.costUsd} else 0 end), 0)`;
      const row = db
        .select({
          today: since(todayStart),
          week: since(weekStart),
          all: sql<number>`coalesce(sum(${usageBuckets.costUsd}), 0)`,
        })
        .from(usageBuckets)
        .where(eq(usageBuckets.harness, harness))
        .get();
      return {
        today: row?.today ?? 0,
        week: row?.week ?? 0,
        all: row?.all ?? 0,
      };
    },
    usageSummary: ({ since, until, harness, machineId, groupBy }) => {
      const key = usageKey(groupBy);
      const groups = db
        .select({
          key,
          // A session's buckets all come from the one machine and checkout
          // that ran it, so max() is that machine and that folder.
          machineId: sql<string>`max(${usageBuckets.machineId})`,
          project: sql<string>`max(${usageBuckets.project})`,
          projectPath: sql<string | null>`max(${usageBuckets.projectPath})`,
          input: sql<number>`sum(${usageBuckets.inputTokens})`,
          output: sql<number>`sum(${usageBuckets.outputTokens})`,
          cacheCreation: sql<number>`sum(${usageBuckets.cacheCreationTokens})`,
          cacheRead: sql<number>`sum(${usageBuckets.cacheReadTokens})`,
          reasoning: sql<number>`sum(${usageBuckets.reasoningTokens})`,
          costUsd: sql<number>`sum(${usageBuckets.costUsd})`,
          messages: sql<number>`sum(${usageBuckets.messages})`,
        })
        .from(usageBuckets)
        .where(usageWhere({ since, until, harness, machineId }))
        .groupBy(key)
        .orderBy(key)
        .all();

      // Rows are shown by name, never by id: a machine by its hostname, a
      // session by the title its instance carries (else what it was first
      // asked, else its folder), and a session run outside CawCo by its
      // folder.
      const named = groupBy === "machine" || groupBy === "session";
      const machineOf = usageMachines(named);
      const sessions = usageSessions(groupBy === "session");

      const rows: UsageSummaryRow[] = groups.map((group) => {
        const instance = sessions.get(String(group.key));
        let label = String(group.key);
        if (groupBy === "machine") {
          label = machineOf(String(group.key)).hostname;
        } else if (groupBy === "session") {
          label =
            instance?.name ?? folderOf(group.projectPath) ?? group.project;
        }
        return {
          key: group.key,
          label,
          machine: named ? machineOf(group.machineId) : null,
          instanceId: instance?.id ?? null,
          input: group.input ?? 0,
          output: group.output ?? 0,
          cacheCreation: group.cacheCreation ?? 0,
          cacheRead: group.cacheRead ?? 0,
          reasoning: group.reasoning ?? 0,
          costUsd: group.costUsd ?? 0,
          messages: group.messages ?? 0,
        };
      });

      const totals: UsageTotals = {
        input: 0,
        output: 0,
        cacheCreation: 0,
        cacheRead: 0,
        reasoning: 0,
        costUsd: 0,
        messages: 0,
      };
      for (const group of rows) {
        totals.input += group.input;
        totals.output += group.output;
        totals.cacheCreation += group.cacheCreation;
        totals.cacheRead += group.cacheRead;
        totals.reasoning += group.reasoning;
        totals.costUsd += group.costUsd;
        totals.messages += group.messages;
      }

      // Models the pricing snapshot cannot price at all. Ask the pricing module
      // rather than inferring from a $0 total: a genuinely free model (say
      // `deepseek-v4-flash-free`, published at 0/0/0) also totals $0, and
      // calling that "no published price" is a lie. `resolveRates` returns null
      // only on a real miss, for the model on its provider. One its harness
      // priced itself (OpenCode's own cost) has a price. Scoped by
      // harness/machine but not by time — a model's missing price does not
      // come and go.
      const now = Date.now();
      const missingPricing = db
        .select({
          model: usageBuckets.model,
          provider: usageBuckets.provider,
          costUsd: sql<number>`sum(${usageBuckets.costUsd})`,
        })
        .from(usageBuckets)
        .where(
          and(
            sql`${usageBuckets.inputTokens} + ${usageBuckets.outputTokens} + ${usageBuckets.cacheCreationTokens} + ${usageBuckets.cacheReadTokens} + ${usageBuckets.reasoningTokens} > 0`,
            harness === undefined
              ? undefined
              : eq(usageBuckets.harness, harness as UsageHarness),
            machineId === undefined
              ? undefined
              : eq(usageBuckets.machineId, machineId)
          )
        )
        .groupBy(usageBuckets.model, usageBuckets.provider)
        .all()
        .filter((row) => row.costUsd === 0)
        .map((row) =>
          row.provider ? `${row.provider}/${row.model}` : row.model
        )
        .filter((model) => resolveRates(model, now) === null);

      return { rows, totals, missingPricing };
    },
    claudeContextWindows: () =>
      Object.fromEntries(
        db
          .select()
          .from(claudeContextWindows)
          .all()
          .map((row) => [row.model, row.contextWindow])
      ),
    noteClaudeContextWindow: (model, contextWindow) => {
      db.insert(claudeContextWindows)
        .values({ model, contextWindow, observedAt: new Date() })
        .onConflictDoUpdate({
          target: claudeContextWindows.model,
          set: { contextWindow, observedAt: new Date() },
        })
        .run();
    },
    skillsInstalledSince: (since) =>
      db
        .select({ name: skills.name })
        .from(skills)
        .where(gte(skills.createdAt, since))
        .all()
        .map((row) => row.name),
  };
};
