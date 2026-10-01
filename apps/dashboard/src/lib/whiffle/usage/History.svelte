<script lang="ts">
  /**
   * History (design/usage-tracker.md §3): what each harness cost over the
   * page's range, as two small charts — one per harness, each on its own
   * scale, never one chart with two axes, because the two are not the same
   * kind of money. Hours for a window or a day, local days for a week or a
   * month. Table swaps both charts for their figures.
   */
  import type { UsageSummary } from "@whiffle/core";
  import { Button } from "$lib/components/ui/button";
  import { TabItem, Tabs, TabsList } from "$lib/components/ui/fluid-tabs";
  import { Skeleton } from "$lib/components/ui/skeleton";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { IconRefresh } from "$lib/icons";
  import { ListSwap } from "../motion/list-swap.svelte";
  import { morph } from "../motion/morph.svelte";
  import { money } from "../usage";

  type Harness = "claude" | "opencode";

  let {
    hourly,
    since,
  }: {
    /** Hours (a window, a day) rather than days (a week, a month). */
    hourly: boolean;
    /**
     * Where the range starts for each harness: null when it has no such
     * window, undefined while that is not known yet.
     */
    since: Record<Harness, number | null | undefined>;
  } = $props();

  let view = $state<"chart" | "table">("chart");

  interface Point {
    at: number;
    cost: number;
  }

  /**
   * What the charts draw: a read together with the range it was read for, so
   * a new range keeps the old charts up until its own read lands whole.
   */
  interface Shown {
    hourly: boolean;
    series: Record<Harness, UsageSummary | null>;
    since: Record<Harness, number | null>;
  }

  const HOUR_MS = 3_600_000;
  const cache = new Map<string, UsageSummary>();
  let shown = $state<Shown | null>(null);
  let failed = $state(false);
  let retrying = $state(false);

  async function readOne(
    harness: Harness,
    start: number | null
  ): Promise<UsageSummary | null> {
    if (start === null) {
      return null;
    }
    const key = `${harness}:${start}`;
    const known = cache.get(key);
    if (known) {
      return known;
    }
    const response = await fetch(
      `/api/usage/summary?harness=${harness}&groupBy=hour&since=${start}`
    );
    if (!response.ok) {
      throw new Error(`The hub answered ${response.status}.`);
    }
    const summary = (await response.json()) as UsageSummary;
    cache.set(key, summary);
    return summary;
  }

  let ticket = 0;
  async function read(): Promise<void> {
    ticket += 1;
    const mine = ticket;
    const { claude, opencode } = since;
    const per = hourly;
    if (claude === undefined || opencode === undefined) {
      return;
    }
    try {
      const [c, o] = await Promise.all([
        readOne("claude", claude),
        readOne("opencode", opencode),
      ]);
      if (mine === ticket) {
        shown = {
          hourly: per,
          series: { claude: c, opencode: o },
          since: { claude, opencode },
        };
        failed = false;
      }
    } catch {
      if (mine === ticket) {
        failed = true;
      }
    }
  }

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget — read() reads the range before it awaits, so the effect reruns on it
    void read();
  });

  async function retry(): Promise<void> {
    retrying = true;
    await read();
    retrying = false;
  }

  const startOfDay = (ms: number): number => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const nextDay = (ms: number): number => {
    const d = new Date(ms);
    d.setDate(d.getDate() + 1);
    return d.getTime();
  };

  /** Every period from the range's start to now, empty ones at zero. */
  function pointsOf(
    summary: UsageSummary | null,
    start: number | null,
    hours: boolean
  ): Point[] {
    if (!summary || start === null) {
      return [];
    }
    const now = Date.now();
    const floor = hours
      ? (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS
      : startOfDay;
    const step = hours ? (ms: number) => ms + HOUR_MS : nextDay;
    const byPeriod = new Map<number, number>();
    for (const row of summary.rows) {
      const at = floor(Number(row.key));
      byPeriod.set(at, (byPeriod.get(at) ?? 0) + row.costUsd);
    }
    const out: Point[] = [];
    for (let at = floor(start); at <= now; at = step(at)) {
      out.push({ at, cost: byPeriod.get(at) ?? 0 });
    }
    return out;
  }

  const HOUR_LABEL = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const byHour = $derived(shown?.hourly ?? hourly);
  const periodLabel = (at: number): string =>
    byHour ? HOUR_LABEL.format(at) : DAY_LABEL.format(at);

  const charts = $derived(
    (["claude", "opencode"] as const).map((harness) => {
      const start = shown?.since[harness] ?? null;
      const points = pointsOf(shown?.series[harness] ?? null, start, byHour);
      return {
        harness,
        title:
          harness === "claude"
            ? "Claude, at API prices"
            : "opencode, real spend",
        approx: harness === "claude" ? "~" : "",
        points,
        total: points.reduce((sum, p) => sum + p.cost, 0),
        peak: Math.max(0, ...points.map((p) => p.cost)),
        missing: shown !== null && start === null,
      };
    })
  );

  type Chart = (typeof charts)[number];

  const ready = $derived(shown !== null);

  /**
   * Chart ⇄ Table swaps each chart's body in its slot (motion/list-swap,
   * the switches' one relay): the old body leaves over the slot's top and
   * the new one arrives once it has gone; the caption stays.
   */
  const bodySwap = new ListSwap<{
    harness: Harness;
    view: "chart" | "table";
  }>();
</script>

<section aria-labelledby="history-title" class="card">
  <header class="head">
    <h2 class="title" id="history-title">History</h2>
    <Tabs
      onValueChange={(next) => {
        const to = next as "chart" | "table";
        if (to === view) {
          return;
        }
        if (ready) {
          bodySwap.swap(
            charts
              .filter((c) => !c.missing)
              .map((c) => ({ harness: c.harness, view })),
            to === 'table' ? 1 : -1
          );
        }
        view = to;
      }}
      value={view}
    >
      <TabsList aria-label="Show as">
        <TabItem label="Chart" value="chart" />
        <TabItem label="Table" value="table" />
      </TabsList>
    </Tabs>
  </header>

  {#if failed && !ready}
    <div class="failed" role="alert">
      <p class="note">Could not read the history from the hub.</p>
      <Button
        icon={IconRefresh}
        label="Retry"
        onclick={retry}
        pending={retrying}
        pendingLabel="Retrying…"
        size="sm"
        variant="outline"
      />
    </div>
  {:else}
    <div class="pair">
      {#each charts as chart (chart.harness)}
        <figure class="chart">
          <figcaption class="caption">
            <span class="name">{chart.title}</span>
            {#if ready && !chart.missing}
              <span class="num total">{chart.approx}{money(chart.total)}</span>
            {/if}
          </figcaption>
          {#if chart.missing}
            <p class="note">No 5-hour window is running.</p>
          {:else if !ready}
            <Skeleton class="h-24 w-full" />
          {:else}
            {@const i = chart.harness === 'claude' ? 0 : 1}
            <!-- One slot: the old view leaves over its top while the new one
                 waits for it, and the slot's height morphs to the new. -->
            <div class="body" {@attach morph()}>
              {#each bodySwap.leaving.filter((l) => l.harness === chart.harness) as gone (gone.harness)}
                <div
                  aria-hidden="true"
                  class="leaving"
                  inert
                  style="animation:{bodySwap.leaveAnim(i)}"
                >
                  {#if gone.view === 'chart'}
                    {@render plot(chart, false)}
                  {:else}
                    {@render figures(chart)}
                  {/if}
                </div>
              {/each}
              {#key bodySwap.gen}
                <div
                  style="animation:{bodySwap.rowAnim(i, ListSwap.leaveEnd(i))}"
                >
                  {#if view === 'chart'}
                    {@render plot(chart, true)}
                  {:else}
                    {@render figures(chart)}
                  {/if}
                </div>
              {/key}
            </div>
          {/if}
        </figure>
      {/each}
    </div>
  {/if}
</section>

{#snippet plot(chart: Chart, live: boolean)}
  <div class="plot">
    <div class="bars">
      {#each chart.points as point (point.at)}
        {#if !live}
          <span class="slot"
            ><span
              class="bar"
              style:--h={chart.peak > 0 ? point.cost / chart.peak : 0}
            ></span></span
          >
        {:else}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <span
                  {...props}
                  aria-label="{periodLabel(point.at)}: {chart.approx}{money(point.cost)}"
                  class="slot"
                  role="img"
                >
                  <span
                    class="bar"
                    style:--h={chart.peak > 0 ? point.cost / chart.peak : 0}
                  ></span>
                </span>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content
              >{periodLabel(point.at)}
              · {chart.approx}{money(point.cost)}</Tooltip.Content
            >
          </Tooltip.Root>
        {/if}
      {/each}
    </div>
    {#if chart.points.length > 0}
      <div class="axis">
        <span>{periodLabel(chart.points[0].at)}</span>
        <span>{periodLabel(chart.points.at(-1)?.at ?? 0)}</span>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet figures(chart: Chart)}
  <table class="figures">
    <thead>
      <tr>
        <th scope="col">{byHour ? 'Hour' : 'Day'}</th>
        <th class="num" scope="col">
          {chart.harness === 'claude' ? 'API price' : 'Spend'}
        </th>
      </tr>
    </thead>
    <tbody>
      {#each chart.points as point (point.at)}
        <tr>
          <td>{periodLabel(point.at)}</td>
          <td class="num">{chart.approx}{money(point.cost)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/snippet}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .title {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .note {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .failed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-6);
  }
  .chart {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .caption {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .total {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .body {
    position: relative;
  }
  /* The old view, over the slot's top while it leaves. */
  .leaving {
    position: absolute;
    inset: 0 0 auto;
    pointer-events: none;
  }
  .plot {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .axis {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .axis {
    display: flex;
    justify-content: space-between;
  }
  /* One bar per period on a shared baseline, a 2px gap between them. */
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    block-size: 96px;
    border-block-end: 1px solid var(--border-hairline);
  }
  .slot {
    display: flex;
    flex: 1 1 0;
    align-items: flex-end;
    min-inline-size: 0;
    block-size: 100%;
  }
  .bar {
    inline-size: 100%;
    block-size: calc(var(--h) * 100%);
    min-block-size: 1px;
    border-radius: var(--radius-hair) var(--radius-hair) 0 0;
    background: var(--meter-share);

    @media (prefers-reduced-motion: no-preference) {
      transition: block-size var(--dur-morph) var(--ease-drawer);
    }
  }
  .slot:hover .bar {
    background: var(--ink-strong);
  }
  .figures {
    inline-size: 100%;
    border-collapse: collapse;
    font: var(--type-meta);
  }
  .figures th {
    padding: var(--space-1) 0;
    border-block-end: 1px solid var(--border-hairline);
    font: var(--type-label);
    color: var(--ink-muted);
    text-align: start;
  }
  .figures td {
    padding: var(--space-1) 0;
    border-block-end: 1px solid var(--border-hairline);
    color: var(--ink-strong);
  }
  .figures .num {
    text-align: end;
  }

  @media (max-width: 639px) {
    .card {
      padding: var(--space-4);
    }
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
