import type { HarnessKind, ModelInfo } from "@cawco/core/harness/kinds";
import { type ModelListing, modelAdmitted } from "@cawco/core/model-names";

/** One model a harness offers, on the machine whose report listed it. */
export type HarnessModel = ModelInfo & {
  /** The account whose Claude Code offers it; absent for a harness without accounts. */
  accountId?: string;
  harness: HarnessKind;
  machineId: string;
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

/**
 * An offered row stands for a model id if either name matches: `system.init`
 * reports the wire id (`claude-sonnet-5`) while the row that offers it is keyed
 * by its alias (`sonnet`).
 */
export const covers = (row: ModelInfo, model: string): boolean =>
  row.value === model || row.resolvedModel === model;

/**
 * Where a model is judged: the listing of each machine a session will run
 * on, every one of which must admit it (`every`); or, with no machine
 * chosen, each machine's, any one of which may.
 */
export interface ListingsOn {
  readonly every: boolean;
  readonly listings: readonly ModelListing[];
}

/**
 * Whether a start on `id` is admitted where `on` says: the hub's own test
 * of a start (core `modelAdmitted`, which `unlistedModelRefusal` refuses
 * by) on each listing.
 */
export const admittedOn = (
  harness: HarnessKind,
  id: string,
  on: ListingsOn
): boolean =>
  on.every
    ? on.listings.length > 0 &&
      on.listings.every((listing) => modelAdmitted(harness, id, listing))
    : on.listings.some((listing) => modelAdmitted(harness, id, listing));

/**
 * The ids typed in for `harness` (`typed`, newest first) a picker offers
 * beside `rows`, its offered list: those no row covers, and a start on
 * which is admitted where `on` says ({@link admittedOn}). An id the hub
 * would refuse there is never offered.
 */
export function typedOffered(
  harness: HarnessKind,
  typed: readonly string[],
  rows: readonly ModelInfo[],
  on: ListingsOn
): string[] {
  return typed.filter(
    (id) => !rows.some((row) => covers(row, id)) && admittedOn(harness, id, on)
  );
}
