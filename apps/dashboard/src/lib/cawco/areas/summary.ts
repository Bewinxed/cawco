/**
 * What an area sets, as its row on the Areas list names it in words: the
 * settings it sets, in one fixed order; every other one it leaves to the
 * fleet. Its page shows each one's value.
 */
import type { AreaSettingLabel } from "@cawco/core/words/areas";
import type { AreaView } from "./areas";
import { type FolderFacts, ownKinds } from "./facts.svelte";

export const areaSets = (
  area: AreaView,
  facts: FolderFacts | undefined
): AreaSettingLabel[] => {
  const set: Record<AreaSettingLabel, boolean> = {
    account: area.account !== null,
    budget: area.capUsd !== null && area.capPeriod !== null,
    cawMode: area.cawMode !== null,
    decides: ownKinds(facts?.decides ?? null).length > 0,
    types: (facts?.types?.types.length ?? 0) > 0,
  };
  return (Object.keys(set) as AreaSettingLabel[]).filter((key) => set[key]);
};
