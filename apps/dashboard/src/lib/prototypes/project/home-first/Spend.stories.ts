/**
 * Spend, reached from Home's Spend today (Option 2): today against the $10
 * daily cap, the month a bar a day, what spent it, and what reaching the cap
 * stops.
 */
import { BUSY, PROJECT } from "./fixture";
import { LOADING, STALE } from "./play";
import SpendScreen from "./SpendScreen.svelte";

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

const AT_CAP = {
  ...BUSY.spend,
  today: 10,
  by: { ...BUSY.spend.by, attempts: 8.35 },
};

export default {
  title: "Home first/Spend",
  component: SpendScreen,
  args: { project: PROJECT, spend: BUSY.spend, read: "live" },
};

/** $4.10 of $10 today, $61.30 this month. */
export const Spend = { parameters: desk };

/** On a phone. */
export const SpendPhone = { name: "Spend on a phone", parameters: phone };

/** At the cap: dispatch waits until midnight. */
export const AtCap = {
  name: "At the cap",
  args: { spend: AT_CAP },
  parameters: desk,
};

/** At the cap, on a phone. */
export const AtCapPhone = {
  name: "At the cap on a phone",
  args: { spend: AT_CAP },
  parameters: phone,
};

/** The first read. */
export const Loading = { args: LOADING, parameters: desk };

/** The hub unreachable. */
export const Stale = {
  name: "Hub unreachable",
  args: STALE,
  parameters: desk,
};
