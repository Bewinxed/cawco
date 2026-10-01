<script lang="ts">
  import { BarChart, Text } from "layerchart";
  import type { ComponentProps } from "svelte";
  import { fade } from "svelte/transition";
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
  import { Button } from "$lib/components/ui/button";
  import {
    type ChartConfig,
    ChartContainer,
    ChartTooltip,
  } from "$lib/components/ui/chart";
  import { Skeleton } from "$lib/components/ui/skeleton";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tabs from "$lib/components/ui/tabs";
  import { IconRefresh } from "$lib/icons";
  import {
    crossIn,
    crossOut,
    dur,
    easeInOut,
    easeOut,
  } from "../motion/curves.svelte";
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
  /**
   * What the section shows. Only the first read stands on a skeleton: a
   * new range keeps the chart up and its bars travel to the new days.
   */
  let status = $state<"loading" | "ready" | "error">("loading");
  /** A retry is running: the button shows it, the error stays put. */
  let retrying = $state(false);
  /** The newest read; an older one that lands after it is dropped. */
  let latest = 0;

  /**
   * Bars travel to a new range, heights and places together, on
   * --dur-panel and --ease-in-out; the axes' ticks glide with them and
   * their labels cross-fade (in below, out in the tick snippets).
   */
  const travel = () =>
    ({
      type: "tween",
      duration: dur("--dur-panel"),
      easing: easeInOut,
    }) as const;
  const labelIn = () => ({ duration: dur("--dur-control"), easing: easeOut });

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

  const tokensByDay = (summary: UsageSummary): Map<number, number> => {
    const map = new Map<number, number>();
    for (const row of summary.rows) {
      map.set(Number(row.key), totalTokensOf(row));
    }
    return map;
  };

  async function load(): Promise<void> {
    latest += 1;
    const ticket = latest;
    const spec = RANGES.find((r) => r.id === range) ?? RANGES[1];
    const sinceParam = spec.days
      ? `&since=${Date.now() - spec.days * DAY_MS}`
      : "";
    try {
      const read = async (harness: string): Promise<UsageSummary> => {
        const response = await fetch(
          `/api/usage/summary?harness=${harness}&groupBy=day${sinceParam}`
        );
        if (!response.ok) {
          throw new Error(`The hub answered ${response.status}.`);
        }
        return (await response.json()) as UsageSummary;
      };
      const [claude, opencode] = await Promise.all([
        read("claude"),
        read("opencode"),
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
      if (ticket === latest) {
        points = out;
        status = "ready";
      }
    } catch {
      if (ticket === latest) {
        status = "error";
      }
    }
  }

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the effect reruns on `range`, load() manages its own status
    void load();
  });

  async function retry(): Promise<void> {
    retrying = true;
    await load();
    retrying = false;
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-2">
    <div>
      <h2 class="text-title">Daily</h2>
      <p class="text-meta text-muted-foreground">
        Tokens per day, stacked by harness.
      </p>
    </div>
    <Tabs.Root
      onValueChange={(next) => {
        range = next as RangeId;
      }}
      value={range}
    >
      <Tabs.List aria-label="Range">
        {#each RANGES as r (r.id)}
          <Tabs.Trigger class="num" value={r.id}>{r.label}</Tabs.Trigger>
        {/each}
      </Tabs.List>
    </Tabs.Root>
  </div>

  <!-- One slot at the chart's height: the skeleton, the chart and the
       error hand it over to each other in place. -->
  <div class="relative h-56">
    {#key status}
      <div class="h-full" in:crossIn out:crossOut>
        {#if status === 'loading'}
          <Skeleton class="h-full w-full" />
        {:else if status === 'error'}
          <div
            class="flex h-full flex-col items-start justify-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-recess)] p-5"
            role="alert"
          >
            <p class="text-meta text-muted-foreground">
              Could not read the daily totals from the hub.
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
          <ChartContainer class="h-full w-full" config={chartConfig}>
            <BarChart
              data={points}
              props={{
                bars: { motion: travel() },
                xAxis: {
                  ticks: 6,
                  tickMarks: false,
                  motion: travel(),
                  transitionIn: fade,
                  transitionInParams: labelIn(),
                  tickLabel,
                },
                yAxis: {
                  format: 'metric',
                  ticks: 4,
                  motion: travel(),
                  transitionIn: fade,
                  transitionInParams: labelIn(),
                  tickLabel,
                },
                grid: { motion: travel() },
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
                        class="size-2.5 shrink-0 rounded-hair"
                        style="background-color: {color}"
                      ></span>
                      <span>{name}</span>
                      <span class="num ml-auto font-mono text-label"
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
    {/key}
  </div>
</div>

<!-- A tick the new range drops fades where it stood while its successor
     fades in: `global`, so it plays as the axis removes the tick. -->
{#snippet tickLabel({ props }: { props: ComponentProps<typeof Text> })}
  <g out:fade|global={labelIn()}><Text {...props} /></g>
{/snippet}
