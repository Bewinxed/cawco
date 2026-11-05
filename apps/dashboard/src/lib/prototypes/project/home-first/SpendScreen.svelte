<script lang="ts">
  /**
   * Spend (TOM task 15), reached from Home's Spend today. Today against the
   * project's daily cap as a meter, and at the cap whether it is there; the
   * month as one bar a day, so a surprise shows as a bar (DESIGN.md, The
   * Show Don't Tell Rule); what spent it; and what reaching the cap stops.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import Progress from "#lib/components/ui/progress/progress.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import { money, share } from "./format";
  import Group from "./Group.svelte";
  import type { Spend } from "./model";
  import ProjectFrame from "./ProjectFrame.svelte";

  let {
    project,
    spend,
    read = "live",
    staleAt,
  }: {
    project: string;
    spend: Spend;
    read?: "live" | "loading" | "stale";
    staleAt?: string;
  } = $props();

  const at = $derived(read === "stale" ? staleAt : undefined);
  const atCap = $derived(spend.today >= spend.cap);
  const top = $derived(Math.max(spend.cap, ...spend.days));
  const BY = $derived([
    [words.spend.attempts, spend.by.attempts],
    [words.spend.caw, spend.by.caw],
    [words.spend.routines, spend.by.routines],
    [words.spend.sessions, spend.by.sessions],
  ] as const);
</script>

<ProjectFrame
  more={[words.more.cap, words.more.configure]}
  {project}
  title={words.places.spend}
>
  {#if read === "loading"}
    <div class="grid gap-space-5 @min-wide/shell:grid-cols-3">
      <Skeleton height="chart" radius="card" />
      <Skeleton height="chart" radius="card" />
      <Skeleton height="chart" radius="card" />
    </div>
  {:else}
    <div class="grid items-start gap-space-5 @min-wide/shell:grid-cols-3">
      <Group staleAt={at} title={words.spend.today}>
        <div class="flex flex-col gap-space-3 p-space-4">
          <p class="m-0 flex items-baseline gap-space-2">
            <span class="type-kpi text-ink-stat tabular-nums"
              >{money(spend.today)}</span
            >
            <span class="type-meta text-ink-muted"
              >{words.spend.of(money(spend.cap))}</span
            >
          </p>
          <Progress
            aria-label={`${money(spend.today)} ${words.spend.of(money(spend.cap))}`}
            value={share(spend.today, spend.cap)}
          />
          {#if atCap}
            <p class="m-0 type-label text-status-attn-ink">
              {words.spend.atCap}
            </p>
          {/if}
          <h3 class="m-0 mt-space-2 type-label text-ink-strong">
            {words.spend.reaching}
          </h3>
          <p class="m-0 type-body text-ink-muted text-pretty">{spend.stops}</p>
        </div>
      </Group>

      <Group staleAt={at} title={words.spend.month}>
        <div class="flex flex-col gap-space-3 p-space-4">
          <p class="m-0 type-kpi text-ink-stat tabular-nums">
            {money(spend.month)}
          </p>
          {#if spend.days.length > 0}
            <div
              class="relative flex h-c-spend-days-h items-end gap-px"
              aria-label={`${words.spend.month}: ${money(spend.month)}`}
              role="img"
            >
              <span
                aria-hidden="true"
                class="absolute inset-x-0 bottom-(--cap) border-t border-dashed border-t-border-control"
                style:--cap={`${share(spend.cap, top)}%`}
              ></span>
              {#each spend.days as day, i (i)}
                <span
                  class={[
                    "h-(--day) min-w-0 flex-1 rounded-t-xs",
                    i === spend.days.length - 1
                      ? "bg-brand-solid"
                      : "bg-neutral-6",
                  ]}
                  style:--day={`${share(day, top)}%`}
                ></span>
              {/each}
            </div>
          {/if}
        </div>
      </Group>

      <Group staleAt={at} title={words.spend.byWhat}>
        <ul class="m-0 flex list-none flex-col p-0">
          {#each BY as [what, amount] (what)}
            <li
              class="flex items-baseline gap-space-3 border-b border-b-border-hairline px-space-4 py-space-3 last:border-b-0"
            >
              <span class="min-w-0 flex-1 type-label text-ink-row">{what}</span>
              <span class="type-body text-ink-strong tabular-nums"
                >{money(amount)}</span
              >
            </li>
          {/each}
        </ul>
      </Group>
    </div>
  {/if}
</ProjectFrame>
