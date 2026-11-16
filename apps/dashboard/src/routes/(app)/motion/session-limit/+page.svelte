<script lang="ts">
  import { HOUR_MS } from "@cawco/core/time";
  /**
   * The session details' stats strip on a bench, with no hub: the Context
   * meter beside the provider's limit (usage/StatMeter), read from staged windows through the same
   * `limitRows` and `firstToStop` the details use. Four limits: calm, early
   * in its window; burning faster than it lasts; at its limit; and out of
   * date. In the reader's theme.
   */
  import type { LimitWindow } from "@cawco/core/usage/types";
  import StatMeter, { STAT_COLS } from "#lib/cawco/usage/StatMeter.svelte";
  import { fillState, firstToStop, limitRows } from "#lib/cawco/usage.js";

  const now = Date.now();
  /** A 5-hour window `used` percent through, resetting in `resetsIn`. */
  const five = (used: number, resetsIn: number): LimitWindow => ({
    group: "session",
    isActive: true,
    kind: "rolling",
    percent: used,
    resetsAt: new Date(now + resetsIn).toISOString(),
    scopeLabel: null,
    severity: used >= 100 ? "critical" : "normal",
  });
  const CASES = [
    {
      id: "calm",
      say: "38% used, 2h of 5 gone",
      window: five(38, 3 * HOUR_MS),
      stale: false,
    },
    {
      id: "fast",
      say: "75% used, 2h of 5 gone",
      window: five(75, 3 * HOUR_MS),
      stale: false,
    },
    {
      id: "limit",
      say: "at its limit",
      window: five(100, 1.2 * HOUR_MS),
      stale: false,
    },
    {
      id: "stale",
      say: "out of date",
      window: five(54, 2.5 * HOUR_MS),
      stale: true,
    },
  ];
  const rows = CASES.map((one) => ({
    ...one,
    limit: firstToStop(
      limitRows("Claude", { stale: one.stale, windows: [one.window] }, now)
    ),
  }));
  const contextUsed = 62;
</script>

<svelte:head><title>Session limit | CawCo</title></svelte:head>

<main
  class="mx-auto flex max-w-leaf flex-col gap-space-4 px-space-4 py-space-6"
  data-session-limit-bench
>
  {#each rows as row (row.id)}
    <section data-case={row.id}>
      <p class="type-meta text-ink-subtle">{row.say}</p>
      <!-- The details' strip as it stands: raised, meta, its meters on one grid (StatMeter). -->
      <div
        class="type-meta grid grid-cols-(--stat-cols) items-center gap-x-space-3 gap-y-space-2 rounded-md bg-surface-raised p-space-3 text-ink-strong"
        style:--stat-cols={STAT_COLS}
      >
        <StatMeter
          detail="124k of 200k tokens"
          elapsed={null}
          figure={`${contextUsed}%`}
          label="Context"
          state={fillState(contextUsed)}
          used={contextUsed}
        />
        {#if row.limit}
          <StatMeter
            detail={row.say}
            elapsed={row.limit.meter.elapsed}
            figure={`${Math.round(row.limit.meter.used)}%`}
            label={row.limit.label}
            state={row.limit.meter.state}
            used={row.limit.meter.used}
          />
        {/if}
      </div>
    </section>
  {/each}
</main>
