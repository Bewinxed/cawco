/**
 * What the fleet's accounts have used: each Claude account's limits, each
 * machine's OpenCode Go windows, and the fleet's spend as the hub reckons
 * it. Read on connect, then kept by every `usage` frame.
 */

import type {
  ClaudeLimits,
  OpenCodeGoLimits,
  UsageLimitsResponse,
  UsageSpend,
} from "@cawco/core/usage/types";
import { hub } from "#lib/platform/hub.js";
import { hubData } from "#lib/platform/hub-read.js";
import { heardFrame, heardSince, readLeaves } from "../heard";
import type { FrameOf } from "../hub/frames";
import { load } from "../hub/load";
import { readAccounts } from "./accounts.svelte";
import { equal } from "./same";

export const usageState = $state({
  /**
   * Each Claude account's own limits, by account id — folded in from the
   * `kind: 'usage'` frame so the pill updates live rather than polling
   * (USAGE-SPEC.md §7.1). Empty while there is no Claude account.
   */
  usageLimits: {} as Record<string, ClaudeLimits>,
  /** Each machine's OpenCode Go windows, from the same frame; absent on a machine with no Go key. */
  openCodeGoLimits: {} as Record<string, OpenCodeGoLimits>,
  /** The hub's limit readings have been read once, so an empty map means none, not not-yet. */
  usageLimitsRead: false,
  /**
   * The fleet's spend as the hub reckons it (`/api/usage/spend`, then every
   * `kind: 'usage'` frame); null until it lands.
   */
  spend: null as UsageSpend | null,
  /** The last read of `/api/usage/spend` failed and no frame has answered since. */
  spendFailed: false,
});

/** Replaces both limits maps with the hub's word — a full snapshot, not a patch. */
export function adoptUsageLimits(
  readings: Pick<UsageLimitsResponse, "claude" | "openCodeGo">
): void {
  const claude: Record<string, ClaudeLimits> = {};
  const openCodeGo: Record<string, OpenCodeGoLimits> = {};
  for (const one of readings.claude) {
    claude[one.accountId] = one.limits;
  }
  for (const machine of readings.openCodeGo) {
    openCodeGo[machine.machineId] = machine.plan;
  }
  if (!equal(usageState.usageLimits, claude)) {
    usageState.usageLimits = claude;
  }
  if (!equal(usageState.openCodeGoLimits, openCodeGo)) {
    usageState.openCodeGoLimits = openCodeGo;
  }
  usageState.usageLimitsRead = true;
}

function adoptSpend(spend: UsageSpend): void {
  if (!equal(usageState.spend, spend)) {
    usageState.spend = spend;
  }
  usageState.spendFailed = false;
}

/**
 * Reads the fleet's spend from the hub: on connect, and again when a reader
 * asks after a failed read. A failed read drops the figure and says so
 * (`spendFailed`); nothing here estimates one.
 */
export async function readSpend(): Promise<void> {
  const mark = readLeaves();
  const spend = await load(hubData(hub.api.usage.spend.get()));
  // A `usage` frame since the read left carries a spend at least as new.
  if (heardSince("usage", mark)) {
    return;
  }
  if (spend) {
    adoptSpend(spend);
  } else {
    usageState.spend = null;
    usageState.spendFailed = true;
  }
}

export function takeUsage(frame: FrameOf<"usage">): void {
  // The small limits frame the hub pushes on each report (USAGE-SPEC.md §6.4).
  heardFrame("usage");
  adoptUsageLimits(frame);
  adoptSpend(frame.spend);
  // The hub says this when an account's reading, sign-in or catalog moved.
  readAccounts();
}

/** Each account's limits, each machine's OpenCode Go windows, and the fleet's spend. */
export const usageStore = {
  /** Every Claude account's own limits, by account id. */
  get claudeLimits(): Readonly<Record<string, ClaudeLimits>> {
    return usageState.usageLimits;
  },
  /** Every machine's OpenCode Go windows, by machineId. */
  get openCodeGoLimits(): Readonly<Record<string, OpenCodeGoLimits>> {
    return usageState.openCodeGoLimits;
  },
  /** The hub's limit readings have landed at least once. */
  get usageLimitsRead() {
    return usageState.usageLimitsRead;
  },
  /** The fleet's spend, the hub's one figure; null until it is read. */
  get spend(): UsageSpend | null {
    return usageState.spend;
  },
  /** The hub could not be asked for spend, and no frame has brought it since. */
  get spendFailed() {
    return usageState.spendFailed;
  },
};
