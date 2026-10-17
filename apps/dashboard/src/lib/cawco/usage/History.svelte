<script lang="ts">
  /**
   * History (design/usage-tracker.md §3): what each harness cost over the
   * page's range, as two small charts — one per harness, each on its own
   * scale, never one chart with two axes, because the two are not the same
   * kind of money. Hours for a window or a day, the hub's days for a week or
   * a month. Table swaps both charts for their figures.
   */
  import type { UsageSummary } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconRefresh } from "#lib/icons.js";
  import { cawco } from "../client.svelte";
  import { ListSwap } from "../motion/list-swap.svelte";
  import { morph } from "../motion/morph.svelte";
  import { hubMidnight, money } from "../usage";

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
      `/api/usage/summary?harness=${harness}&groupBy=start&since=${start}`
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

  /**
   * Every hour from the range's start to now, counted from that start (a
   * midnight in the hub's zone, or the quarter a window opened in), so each
   * hour takes four whole quarter-hour buckets in any zone.
   */
  const hoursFrom = (start: number): number[] => {
    const out: number[] = [];
    const now = Date.now();
    for (let at = start; at <= now;) {
      out.push(at);
      at += HOUR_MS;
    }
    return out;
  };

  /**
   * The hub's midnights from the range's start to today, oldest first: the
   * days every device folds spend into, the same days the spend line counts.
   */
  const hubDaysFrom = (start: number): number[] => {
    const { spend } = cawco;
    if (!spend) {
      return [];
    }
    const out: number[] = [];
    for (let back = 0; ; back += 1) {
      const at = hubMidnight(spend, back);
      if (at < start) {
        return out;
      }
      out.unshift(at);
    }
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
    const periods = hours ? hoursFrom(start) : hubDaysFrom(start);
    const costs = periods.map(() => 0);
    for (const row of summary.rows) {
      const at = Number(row.key);
      // The last period that starts at or before the row's bucket.
      let i = periods.length - 1;
      while (i >= 0 && periods[i] > at) {
        i -= 1;
      }
      if (i >= 0) {
        costs[i] += row.costUsd;
      }
    }
    return periods.map((at, i) => ({ at, cost: costs[i] }));
  }

  /** Labels on the hub's clock, so a day reads the same day on every device. */
  const timeZone = $derived(cawco.spend?.timeZone);
  const hourLabel = $derived(
    new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    })
  );
  const dayLabel = $derived(
    new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    })
  );
  const byHour = $derived(shown?.hourly ?? hourly);
  const periodLabel = (at: number): string =>
    byHour ? hourLabel.format(at) : dayLabel.format(at);

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

<section
  data-slot="history-card"
  aria-labelledby="history-title"
  class="flex flex-col gap-space-4 rounded-lg bg-surface-raised p-space-5 shadow-tile max-phone:p-space-4"
>
  <header
    data-slot="head"
    class="flex flex-wrap items-center justify-between gap-space-3"
  >
    <h2 data-slot="title" class="type-label text-ink-muted" id="history-title">
      History
    </h2>
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
            to === "table" ? 1 : -1
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
    <div
      data-slot="failed"
      class="flex flex-wrap items-center gap-space-3"
      role="alert"
    >
      <p data-slot="note" class="type-meta text-ink-muted">
        Could not read the history from the hub.
      </p>
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
    <div class="grid grid-cols-2 gap-space-6 max-phone:grid-cols-1">
      {#each charts as chart (chart.harness)}
        <figure class="flex min-w-0 flex-col gap-space-2">
          <figcaption class="flex items-baseline justify-between gap-space-2">
            <span data-slot="name" class="type-label text-ink-strong"
              >{chart.title}</span
            >
            {#if ready && !chart.missing}
              <span data-slot="num" class="type-label text-ink-strong"
                >{chart.approx}{money(chart.total)}</span
              >
            {/if}
          </figcaption>
          {#if chart.missing}
            <p data-slot="note" class="type-meta text-ink-muted">
              No 5-hour window is running.
            </p>
          {:else if !ready}
            <Skeleton class="h-24 w-full" />
          {:else}
            {@const i = chart.harness === "claude" ? 0 : 1}
            <!-- One slot: the old view leaves over its top while the new one
                 waits for it, and the slot's height morphs to the new. -->
            <div data-slot="body" class="relative" {@attach morph()}>
              {#each bodySwap.leaving.filter((l) => l.harness === chart.harness) as gone (gone.harness)}
                <div
                  aria-hidden="true"
                  class="pointer-events-none absolute inset-x-0 top-0 animate-(--swap-anim)"
                  inert
                  style:--swap-anim={bodySwap.leaveAnim(i)}
                >
                  {#if gone.view === "chart"}
                    {@render plot(chart, false)}
                  {:else}
                    {@render figures(chart)}
                  {/if}
                </div>
              {/each}
              {#key bodySwap.gen}
                <div
                  class="animate-(--swap-anim)"
                  style:--swap-anim={bodySwap.rowAnim(i, ListSwap.leaveEnd(i))}
                >
                  {#if view === "chart"}
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
  <div class="flex flex-col gap-space-1">
    <!-- literal: 96px -->
    <div
      class="flex h-(--bars-h) items-end gap-space-row border-b border-b-border-hairline"
      style:--bars-h="96px"
    >
      {#each chart.points as point (point.at)}
        {#if !live}
          <span
            data-slot="slot"
            class="group flex min-w-0 flex-1 items-end h-full"
            ><span
              class="h-(--bar-h) min-h-px w-full rounded-t-hair bg-meter-share group-hover:bg-ink-strong motion-safe:transition-[block-size] motion-safe:dur-morph motion-safe:ease-drawer"
              style:--h={chart.peak > 0 ? point.cost / chart.peak : 0}
              style:--bar-h="calc(var(--h) * 100%)"
            ></span></span
          >
        {:else}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <span
                  data-history-slot
                  {...props}
                  aria-label="{periodLabel(point.at)}: {chart.approx}{money(
                    point.cost
                  )}"
                  class="group flex min-w-0 flex-1 items-end h-full"
                  role="img"
                >
                  <span
                    class="h-(--bar-h) min-h-px w-full rounded-t-hair bg-meter-share group-hover:bg-ink-strong motion-safe:transition-[block-size] motion-safe:dur-morph motion-safe:ease-drawer"
                    style:--h={chart.peak > 0 ? point.cost / chart.peak : 0}
                    style:--bar-h="calc(var(--h) * 100%)"
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
      <div class="type-meta flex justify-between text-ink-muted">
        <span>{periodLabel(chart.points[0].at)}</span>
        <span>{periodLabel(chart.points.at(-1)?.at ?? 0)}</span>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet figures(chart: Chart)}
  <table class="type-meta w-full border-collapse">
    <thead>
      <tr>
        <th
          class="type-label border-b border-b-border-hairline px-0 py-space-1 text-start text-ink-muted"
          scope="col">{byHour ? "Hour" : "Day"}</th
        >
        <th
          data-slot="num"
          class="type-label border-b border-b-border-hairline px-0 py-space-1 text-end text-ink-muted"
          scope="col"
        >
          {chart.harness === "claude" ? "API price" : "Spend"}
        </th>
      </tr>
    </thead>
    <tbody>
      {#each chart.points as point (point.at)}
        <tr>
          <td
            class="border-b border-b-border-hairline px-0 py-space-1 text-ink-strong"
            >{periodLabel(point.at)}</td
          >
          <td
            data-slot="num"
            class="border-b border-b-border-hairline px-0 py-space-1 text-end text-ink-strong"
            >{chart.approx}{money(point.cost)}</td
          >
        </tr>
      {/each}
    </tbody>
  </table>
{/snippet}
