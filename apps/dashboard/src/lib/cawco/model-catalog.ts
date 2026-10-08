import type { HarnessKind, ModelInfo } from "@cawco/core";

/**
 * One model a harness offers. `machineId` names the machine whose report
 * listed it; a row asked from a running session carries none.
 */
export type HarnessModel = ModelInfo & {
  /** The account whose Claude Code offers it; absent for a harness without accounts. */
  accountId?: string;
  harness: HarnessKind;
  machineId?: string;
};

/**
 * Model ids are unique within a harness; different harnesses may offer the
 * same id. Given `machineIds`, only what those machines can run: a reported
 * row counts when every one of them reports it, since a spawn resolves its
 * model on the machine it runs on and one machine's catalog is not another's.
 */
export function modelsForHarness(
  catalog: HarnessModel[],
  harness?: string,
  machineIds?: string[]
): ModelInfo[] {
  const runsOn = (row: HarnessModel): boolean =>
    row.machineId === undefined ||
    !machineIds?.length ||
    machineIds.every((machineId) =>
      catalog.some(
        (other) =>
          other.machineId === machineId &&
          other.harness === row.harness &&
          other.value === row.value
      )
    );
  const seen = new Set<string>();
  return catalog.filter((row) => {
    if (
      (harness && row.harness !== harness) ||
      seen.has(row.value) ||
      !runsOn(row)
    ) {
      return false;
    }
    seen.add(row.value);
    return true;
  });
}
