import type { Rule } from "@cawco/core/rules";
import type { DbShape } from "./db";

/**
 * Rules as the list reads them: each with what it has been doing, and, when
 * it is scoped to a machine the fleet no longer has, that it matches
 * nothing, with what the machine was called and when the person removed
 * it (null for a machine this hub has no record of). Its scope stands as
 * it was written.
 */
export const createRuleRows = (db: DbShape) => (list: Rule[]) => {
  const stats = new Map(db.ruleStats().map((row) => [row.ruleId, row]));
  const fleet = new Set(db.listAgents().map((agent) => agent.machineId));
  const removed = new Map(
    db.removedMachines().map((row) => [row.machineId, row])
  );
  const orphanOf = (
    rule: Rule
  ):
    | { machineId: string; name: string | null; removedAt: number | null }
    | undefined => {
    const { machineId } = rule.scope;
    if (!machineId || fleet.has(machineId)) {
      return undefined;
    }
    const gone = removed.get(machineId);
    return {
      machineId,
      name: gone?.hostname ?? null,
      removedAt: gone?.removedAt.getTime() ?? null,
    };
  };
  return list.map((rule) => ({
    ...rule,
    stats: stats.get(rule.id) ?? {
      ruleId: rule.id,
      pending: 0,
      totalFires: 0,
      lastFiredAt: null,
    },
    orphaned: orphanOf(rule),
  }));
};
