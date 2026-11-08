/** The rules and their per-session state. */

import {
  type Rule,
  type RuleState,
  type RuleStats,
  ruleSettings,
} from "@cawco/core/rules";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import type { DbCore } from "./core";
import { ruleState, rules } from "./schema";

/** A stored rule row back into the shape the fleet and the dashboard share. */
const ruleOf = (row: typeof rules.$inferSelect): Rule => ({
  id: row.id,
  ...ruleSettings(row),
  scope: {
    ...(row.scopeMachineId ? { machineId: row.scopeMachineId } : {}),
    ...(row.scopeProjectId ? { projectId: row.scopeProjectId } : {}),
    ...(row.scopeAreaId ? { areaId: row.scopeAreaId } : {}),
    ...(row.scopeHarness ? { harness: row.scopeHarness } : {}),
    ...(row.scopeModel ? { model: row.scopeModel } : {}),
    ...(row.scopeRole ? { role: row.scopeRole } : {}),
    ...(row.scopeDelegateType ? { delegateType: row.scopeDelegateType } : {}),
  },
  createdAt: row.createdAt.getTime(),
});

/** A rule as its stored row: its own `createdAt`, written now. */
const ruleValues = (rule: Rule): typeof rules.$inferInsert => ({
  id: rule.id,
  ...ruleSettings(rule),
  scopeMachineId: rule.scope.machineId || null,
  scopeProjectId: rule.scope.projectId || null,
  scopeAreaId: rule.scope.areaId || null,
  scopeHarness: rule.scope.harness || null,
  scopeModel: rule.scope.model || null,
  scopeRole: rule.scope.role || null,
  scopeDelegateType: rule.scope.delegateType || null,
  createdAt: new Date(rule.createdAt),
  updatedAt: new Date(),
});

/** And a standing row, with the dates flattened to the numbers the wire carries. */
const ruleStateOf = (row: typeof ruleState.$inferSelect): RuleState => ({
  ruleId: row.ruleId,
  instanceId: row.instanceId,
  status: row.status,
  fireCount: row.fireCount,
  totalFires: row.totalFires,
  lastFiredAt: row.lastFiredAt?.getTime() ?? null,
  ackedAt: row.ackedAt?.getTime() ?? null,
});

export interface RulesDb {
  /** One rule, or nothing when it has been deleted out from under a caller. */
  readonly getRule: (id: string) => Rule | undefined;
  /** Every rule, newest first — what the engine reloads and the editor lists. */
  readonly listRules: () => Rule[];
  /**
   * Records a fire and returns the session's new standing. `pending` is set
   * when the rule repeats; `fireCount` is what the ceiling counts, and only
   * {@link DbShape.rearmRules} resets it.
   */
  readonly noteRuleFire: (
    ruleId: string,
    instanceId: string,
    repeat: boolean
  ) => RuleState;
  /** Upsert by id. The caller mints the id; this never invents one. */
  readonly putRule: (rule: Rule) => Rule;
  /**
   * The daemon's own word, arriving every 15s: `liveIds` is exactly what its
   * supervisor is carrying right now (`HeartbeatPayload.instances`).
   *
   * This is the write that makes `running` mean something. Before it, `running`
   * was written optimistically at spawn and never re-checked, so the column
   * accumulated one row per session the hub had *ever* started on that machine
   * — 178 of them against 42 live processes. Now the beat is the only thing
   * that can put a row into `running`, and the same beat's silence is what
   * takes it out again:
   *
   * - listed → `running` (from `starting`, `unknown`, `sleeping` or `error`;
   *   a `stopped` or `discarded` row is a decision, not a guess, and stays).
   * - not listed, currently `running` → the process is gone: `sleeping`, on
   *   the `sessionId` it resumes from, or fresh under its id when it never
   *   named one (core `relaunchOf`).
   * - not listed, currently `starting` → the same, but only after `graceMs`,
   *   because a spawn the hub issued moments ago has not necessarily reached
   *   the supervisor before the beat that was already in flight.
   *
   * Nothing here respawns anything: reconciliation records what the machine
   * says, and recovery is register's job (see {@link settleInstances}).
   * Returns what actually moved, so the caller only republishes on news.
   */
  /**
   * A turn of this session ended: every rule pending on it, except those the
   * turn matched again (`matched`), re-arms with its fire count reset.
   */
  readonly rearmRules: (instanceId: string, matched: string[]) => void;
  /** Where a rule stands with a session; absent means it has never fired there. */
  readonly ruleStateFor: (
    ruleId: string,
    instanceId: string
  ) => RuleState | undefined;
  /**
   * Every session's standing with one rule, most recently active first.
   *
   * This is the only place the mechanism is visible to anybody. The session is
   * told nothing, so the reader has to be told everything: which sessions
   * tripped it, how often, and what each said it did about it.
   */
  readonly ruleStatesFor: (ruleId: string) => RuleState[];
  /** Per-rule totals for the list, aggregated in SQL rather than per row. */
  readonly ruleStats: () => RuleStats[];
}

export const rulesDb = (core: DbCore): RulesDb => {
  const { db } = core;

  return {
    listRules: () =>
      db.select().from(rules).orderBy(desc(rules.createdAt)).all().map(ruleOf),
    getRule: (id) => {
      const row = db.select().from(rules).where(eq(rules.id, id)).get();
      return row ? ruleOf(row) : undefined;
    },
    putRule: (rule) => {
      const values = ruleValues(rule);
      db.insert(rules)
        .values(values)
        // `createdAt` is deliberately absent from the update set: editing a rule
        // must not reorder the list under the person editing it.
        .onConflictDoUpdate({
          target: rules.id,
          set: {
            name: values.name,
            enabled: values.enabled,
            pattern: values.pattern,
            matchKind: values.matchKind,
            caseSensitive: values.caseSensitive,
            wholeWord: values.wholeWord,
            watch: values.watch,
            reply: values.reply,
            timing: values.timing,
            repeat: values.repeat,
            scopeMachineId: values.scopeMachineId,
            scopeProjectId: values.scopeProjectId,
            scopeAreaId: values.scopeAreaId,
            scopeHarness: values.scopeHarness,
            scopeModel: values.scopeModel,
            scopeRole: values.scopeRole,
            scopeDelegateType: values.scopeDelegateType,
            updatedAt: values.updatedAt,
          },
        })
        .run();
      return rule;
    },
    ruleStats: () => {
      const rows = db
        .select({
          ruleId: ruleState.ruleId,
          pending: sql<number>`sum(case when ${ruleState.status} = 'pending' then 1 else 0 end)`,
          totalFires: sql<number>`sum(${ruleState.totalFires})`,
          lastFiredAt: sql<number | null>`max(${ruleState.lastFiredAt})`,
        })
        .from(ruleState)
        .groupBy(ruleState.ruleId)
        .all();
      return rows.map((row) => ({
        ruleId: row.ruleId,
        pending: Number(row.pending ?? 0),
        totalFires: Number(row.totalFires ?? 0),
        lastFiredAt: row.lastFiredAt === null ? null : Number(row.lastFiredAt),
      }));
    },
    noteRuleFire: (ruleId, instanceId, repeat) => {
      const id = `${ruleId}:${instanceId}`;
      const now = new Date();
      const before = db
        .select()
        .from(ruleState)
        .where(eq(ruleState.id, id))
        .get();
      const next = {
        id,
        ruleId,
        instanceId,
        // A rule that does not repeat still records the fire; it just stays
        // armed-looking, and the engine's own once-per-session check is what
        // keeps it quiet afterwards.
        status: (repeat ? "pending" : "armed") as "armed" | "pending",
        fireCount: (before?.fireCount ?? 0) + 1,
        totalFires: (before?.totalFires ?? 0) + 1,
        lastFiredAt: now,
        ackedAt: before?.ackedAt ?? null,
      };
      db.insert(ruleState)
        .values(next)
        .onConflictDoUpdate({
          target: ruleState.id,
          set: {
            status: next.status,
            fireCount: next.fireCount,
            totalFires: next.totalFires,
            lastFiredAt: next.lastFiredAt,
          },
        })
        .run();
      return ruleStateOf(next as typeof ruleState.$inferSelect);
    },
    ruleStateFor: (ruleId, instanceId) => {
      const row = db
        .select()
        .from(ruleState)
        .where(eq(ruleState.id, `${ruleId}:${instanceId}`))
        .get();
      return row ? ruleStateOf(row) : undefined;
    },
    ruleStatesFor: (ruleId) =>
      db
        .select()
        .from(ruleState)
        .where(eq(ruleState.ruleId, ruleId))
        .orderBy(desc(ruleState.lastFiredAt))
        .all()
        .map(ruleStateOf),
    rearmRules: (instanceId, matched) => {
      db.update(ruleState)
        // Re-armed, not retired: the same rule can catch the same habit again
        // later in the same session, and `fireCount` starts the next run from
        // zero. `totalFires` is the history and is left alone.
        .set({ status: "armed", fireCount: 0, ackedAt: new Date() })
        .where(
          and(
            eq(ruleState.instanceId, instanceId),
            eq(ruleState.status, "pending"),
            notInArray(ruleState.ruleId, matched)
          )
        )
        .run();
    },
  };
};
