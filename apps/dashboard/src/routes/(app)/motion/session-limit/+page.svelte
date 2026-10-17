<script lang="ts">
  /**
   * The session details' stats strip on a bench, with no hub: the Context
   * bar (what is used) beside the provider's limit (what is left,
   * usage/ProviderLimit), read from staged windows through the same
   * `limitRows` and `firstToStop` the details use. Four limits: calm, early
   * in its window; burning faster than it lasts; at its limit; and out of
   * date. `?theme=` light | dark.
   */
  import type { LimitWindow } from "@cawco/core";
  import LimitBar from "#lib/cawco/usage/LimitBar.svelte";
  import ProviderLimit from "#lib/cawco/usage/ProviderLimit.svelte";
  import { fillState, firstToStop, limitRows } from "#lib/cawco/usage.js";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";

  $effect(() => {
    theme.set(page.url.searchParams.get("theme") === "dark" ? "dark" : "light");
  });

  const HOUR = 3_600_000;
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
      window: five(38, 3 * HOUR),
      stale: false,
    },
    {
      id: "fast",
      say: "75% used, 2h of 5 gone",
      window: five(75, 3 * HOUR),
      stale: false,
    },
    {
      id: "limit",
      say: "at its limit",
      window: five(100, 1.2 * HOUR),
      stale: false,
    },
    {
      id: "stale",
      say: "out of date",
      window: five(54, 2.5 * HOUR),
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

<!-- literal: 36rem -->
<main
  class="mx-auto flex max-w-(--measure) flex-col gap-space-4 px-space-4 py-space-6"
  data-session-limit-bench
  style:--measure="36rem"
>
  {#each rows as row (row.id)}
    <section data-case={row.id}>
      <p class="type-meta text-ink-subtle">{row.say}</p>
      <!-- The details' strip as it stands: raised, meta, its units wrapping. -->
      <div
        class="type-meta flex flex-wrap items-center gap-x-space-4 gap-y-space-2 rounded-md bg-surface-raised p-space-3 text-ink-strong"
      >
        <div
          class="flex flex-auto items-center gap-x-space-2 gap-y-space-1"
          style:--row-paint="var(--surface-raised)"
        >
          <span class="text-ink-muted">Context</span>
          <!-- literal: 48px, 96px -->
          <span
            class="max-w-(--bar-max) min-w-(--bar-min) flex-1"
            style:--bar-max="96px"
            style:--bar-min="48px"
          >
            <LimitBar
              elapsed={null}
              label="Context"
              reads="used"
              size={4}
              state={fillState(contextUsed)}
              used={contextUsed}
            />
          </span>
          <span>{contextUsed}% · 124k/200k</span>
        </div>
        {#if row.limit}
          <ProviderLimit label={row.limit.label} meter={row.limit.meter} />
        {/if}
      </div>
    </section>
  {/each}
</main>
