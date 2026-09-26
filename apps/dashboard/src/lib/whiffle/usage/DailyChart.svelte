<script lang="ts">
  import { BarChart } from "layerchart";
  /**
   * The daily usage chart — stacked bars by day, one series per harness, so the
   * two currencies never sit in one bar. Claude and opencode are the two series
   * the summary endpoint can actually split by day; a per-model day split would
   * need a day×model grouping the hub does not serve (single-dimension
   * `groupBy`), so the model breakdown lives in the table below instead.
   *
   * The first chart in the app (USAGE-SPEC.md §7.2.3): the shadcn `ChartContainer`
   * / `ChartTooltip` wrapper over layerchart, painted from the `--chart-1..5` ramp.
   */
  import {
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
  } from "$lib/components/ui/chart";
  import { compactNumber, totalTokensOf, type UsageSummary } from "../usage";

  const DAY_MS = 86_400_000;

  const RANGES = [
    { id: "7d", label: "7d", days: 7 },
    { id: "30d", label: "30d", days: 30 },
    { id: "90d", label: "90d", days: 90 },
    { id: "all", label: "All", days: null },
  ] as const;

  type RangeId = (typeof RANGES)[number]["id"];

  interface DayPoint {
    claude: number;
    day: number;
    label: string;
    opencode: number;
  }

  let range = $state<RangeId>("30d");
  let points = $state<DayPoint[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  const chartConfig = {
    claude: { label: "Claude", color: "var(--chart-1)" },
    opencode: { label: "opencode", color: "var(--chart-2)" },
  } satisfies ChartConfig;

  const series = [
    {
      key: "claude",
      label: "Claude",
      value: (d: DayPoint) => d.claude,
      color: "var(--chart-1)",
    },
    {
      key: "opencode",
      label: "opencode",
      value: (d: DayPoint) => d.opencode,
      color: "var(--chart-2)",
    },
  ];

  const dayLabel = (ms: number): string =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  const tokensByDay = (summary: UsageSummary | null): Map<number, number> => {
    const map = new Map<number, number>();
    for (const row of summary?.rows ?? []) {
      map.set(Number(row.key), totalTokensOf(row));
    }
    return map;
  };

  async function load(): Promise<void> {
    loading = true;
    loadError = null;
    const spec = RANGES.find((r) => r.id === range) ?? RANGES[1];
    const sinceParam = spec.days
      ? `&since=${Date.now() - spec.days * DAY_MS}`
      : "";
    try {
      const [claude, opencode] = await Promise.all([
        fetch(
          `/api/usage/summary?harness=claude&groupBy=day${sinceParam}`
        ).then((r) => (r.ok ? (r.json() as Promise<UsageSummary>) : null)),
        fetch(
          `/api/usage/summary?harness=opencode&groupBy=day${sinceParam}`
        ).then((r) => (r.ok ? (r.json() as Promise<UsageSummary>) : null)),
      ]);
      const cMap = tokensByDay(claude);
      const oMap = tokensByDay(opencode);

      const allDays = new Set([...cMap.keys(), ...oMap.keys()]);
      const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
      let start: number;
      if (spec.days) {
        start = today - spec.days * DAY_MS;
      } else if (allDays.size > 0) {
        start = Math.min(...allDays);
      } else {
        start = today - 30 * DAY_MS;
      }

      const out: DayPoint[] = [];
      for (let d = start; d <= today; d += DAY_MS) {
        out.push({
          day: d,
          label: dayLabel(d),
          claude: cMap.get(d) ?? 0,
          opencode: oMap.get(d) ?? 0,
        });
      }
      points = out;
    } catch {
      loadError = "Could not read the daily totals.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the effect reruns on `range`, load() manages its own loading/error state
    void load();
  });
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-2">
    <div>
      <h2 class="text-title">Daily</h2>
      <p class="text-meta text-muted-foreground">
        Tokens per day, stacked by harness.
      </p>
    </div>
    <div
      class="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-recess-deep)] p-0.5"
    >
      {#each RANGES as r (r.id)}
        <button
          aria-pressed={range === r.id}
          class="touch-hit rounded-[var(--radius-xs)] px-2.5 py-1 [--hit-gap-x:4px] text-label tabular-nums transition-colors duration-150 ease-out
                 {range === r.id
            ? 'bg-[var(--surface-lift)] text-foreground shadow-[var(--shadow-raised)]'
            : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => {
            range = r.id;
          }}
          type="button"
        >
          {r.label}
        </button>
      {/each}
    </div>
  </div>

  {#if loadError}
    <p class="text-meta text-error" role="alert">{loadError}</p>
  {:else if loading}
    <div class="h-56 w-full rounded-[var(--radius-md)] bg-muted/40"></div>
  {:else}
    <ChartContainer class="h-56 w-full" config={chartConfig}>
      <BarChart
        data={points}
        props={{
          xAxis: { ticks: 6, tickMarks: false },
          yAxis: { format: 'metric', ticks: 4 },
        }}
        {series}
        seriesLayout="stack"
        x="label"
      >
        {#snippet tooltip()}
          <ChartTooltip>
            {#snippet formatter({ value, name })}
              {@const color = name === 'Claude' ? 'var(--chart-1)' : 'var(--chart-2)'}
              <div class="flex items-center gap-2">
                <span
                  class="size-2.5 shrink-0 rounded-[2px]"
                  style="background-color: {color}"
                ></span>
                <span>{name}</span>
                <span class="ml-auto font-mono text-label tabular-nums"
                  >{compactNumber(Number(value))}</span
                >
              </div>
            {/snippet}
          </ChartTooltip>
        {/snippet}
      </BarChart>
    </ChartContainer>
  {/if}
</div>
