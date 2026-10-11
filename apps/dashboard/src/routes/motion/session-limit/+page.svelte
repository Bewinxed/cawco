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

<main class="bench" data-session-limit-bench>
  {#each rows as row (row.id)}
    <section class="case" data-case={row.id}>
      <p class="say">{row.say}</p>
      <div class="stats">
        <div class="context">
          <span class="stat-label">Context</span>
          <span class="stat-bar">
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

<style>
  .bench {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-inline-size: 36rem;
    margin-inline: auto;
    padding: var(--space-6) var(--space-4);
  }
  .say {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  /* The details' strip as it stands: raised, meta, its units wrapping. */
  .stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    font: var(--type-meta);
    color: var(--ink-strong);
  }
  .context {
    --row-paint: var(--surface-raised);
    display: flex;
    flex: auto;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }
  .stat-label {
    color: var(--ink-muted);
  }
  .stat-bar {
    flex: 1;
    min-width: 48px;
    max-width: 96px;
  }
</style>
