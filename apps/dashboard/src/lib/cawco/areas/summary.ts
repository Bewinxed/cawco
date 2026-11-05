/**
 * What an area sets, as its row's glyphs and its page's lines read it: one
 * entry per setting in a fixed order, each with the value it sets or none
 * (the fleet's), so every row's glyphs stand in the same columns.
 */
import type { CapPeriod } from "@cawco/core/project-conversation";
import {
  type AreaSettingLabel,
  areasScreenWords as words,
} from "@cawco/core/words/areas";
import { spawnWords } from "@cawco/core/words/spawn";
import type { Component } from "svelte";
import {
  IconAccounts,
  IconDollar,
  IconJev,
  IconShield,
  IconUser,
} from "#lib/icons.js";
import { accountNamed } from "../accounts/model.svelte";
import { money } from "../usage";
import type { AreaView } from "./areas";
import { type FolderFacts, ownKinds } from "./facts.svelte";

export interface AreaSetting {
  icon: Component;
  key: AreaSettingLabel;
  /** What it sets, in a few words; null: it leaves this to the fleet. */
  value: string | null;
}

/** "$200 a month". */
const budgetOf = (usd: number, period: CapPeriod): string =>
  `${money(usd)} ${words.budgetPer[period].toLowerCase()}`;

export const areaSettings = (
  area: AreaView,
  facts: FolderFacts | undefined
): AreaSetting[] => {
  const kinds = ownKinds(facts?.decides ?? null).length;
  const types = facts?.types?.types.length ?? 0;
  return [
    {
      key: "account",
      icon: IconUser,
      value: area.account ? accountNamed(area.account) : null,
    },
    {
      key: "budget",
      icon: IconDollar,
      value:
        area.capUsd !== null && area.capPeriod !== null
          ? budgetOf(area.capUsd, area.capPeriod)
          : null,
    },
    {
      key: "cawMode",
      icon: IconShield,
      value: area.cawMode ? spawnWords.modes[area.cawMode] : null,
    },
    {
      key: "decides",
      icon: IconJev,
      value: kinds > 0 ? words.decidesOwn(kinds) : null,
    },
    {
      key: "types",
      icon: IconAccounts,
      value: types > 0 ? words.typesOwn(types) : null,
    },
  ];
};
