/**
 * The usage benches' staged forecast, stood in for the hub's: the data is
 * `stage-data.ts`'s (shared with the iOS usage probe's scratch hub), built
 * into rings here as the hub's would be. Shared by the popover's bench
 * (usage-relay) and the Usage page's (usage-limits).
 */
import { usage } from "#lib/cawco/usage/forecast.svelte.js";
import { claudeRings, openCodeRing } from "#lib/cawco/usage/rings.js";
import { stagedData } from "./stage-data";

/**
 * Stands the staged forecast in for the hub's (`usage.stage`): `n` Claude
 * accounts (6 or 20) and the Go plan. `stop` tightens it: "1" puts every
 * account's 5-hour window at 92% or more, so the relay stops inside the
 * five hours; "2" puts every one at its limit.
 */
export function stageUsage(n: number, stop: string | null = null) {
  const staged = stagedData(n, stop);
  const rings = claudeRings({
    accounts: staged.accounts,
    bench: [],
    forecast: staged.forecast,
    instances: staged.instances,
    now: staged.now,
    routing: staged.routing,
  });
  const shown = rings.accounts.filter((ring) => ring.w5 || ring.week);
  usage.stage({
    forecast: staged.forecast,
    claude: { ...rings, accounts: shown },
    openCode: openCodeRing(
      { fetchedAt: staged.now, windows: staged.go },
      [staged.openCodeSession],
      staged.now,
      shown.map((ring) => ring.hue)
    ),
  });
}
