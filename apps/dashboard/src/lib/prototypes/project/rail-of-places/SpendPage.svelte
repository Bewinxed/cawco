<script lang="ts">
  /**
   * Spend, narrowed to this project (TOM task 15): today and this month,
   * each against its cap as a meter (DESIGN.md, The Show Don't Tell Rule),
   * what reaching the cap stops, and where today's spend went, by the
   * session or routine that spent it. The cap changes in Configure.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import type { Project, Read } from "./model";
  import StaleNote from "./StaleNote.svelte";

  let {
    project,
    read,
    onconfigure,
  }: { project: Project; read: Read; onconfigure: () => void } = $props();

  const reading = $derived(read.status === "loading");
  const spend = $derived(project.spend);
</script>

<div class="flex flex-col gap-space-group desk:max-w-c-grid-4">
  {#if read.stale}
    <StaleNote since={read.stale} />
  {/if}
  {#if reading}
    <div class="grid gap-space-group phone:grid-cols-2">
      <Skeleton height="block" radius="card" />
      <Skeleton height="block" radius="card" />
    </div>
  {:else if spend}
    <div class="grid gap-space-group phone:grid-cols-2">
      {#each [{ label: w.today, value: spend.today, cap: spend.capDay, share: spend.share }, { label: w.thisMonth, value: spend.month, cap: spend.capMonth, share: spend.monthShare }] as tile (tile.label)}
        <section
          class="flex flex-col gap-space-3 rounded-lg bg-surface-raised p-space-5 shadow-tile"
        >
          <h2 class="type-label text-ink-strong">{tile.label}</h2>
          <p class="flex items-baseline gap-space-2">
            <span class="type-kpi num text-ink-stat">{tile.value}</span>
            <span class="type-meta num text-ink-muted">{w.cap(tile.cap)}</span>
          </p>
          <Progress
            value={Math.round(tile.share * 100)}
            aria-label="{tile.label}: {tile.value}, {w.cap(tile.cap)}"
          />
        </section>
      {/each}
    </div>
    <div
      class="flex flex-wrap items-start gap-space-3 rounded-lg bg-surface-raised p-space-5 shadow-tile"
    >
      <p class="min-w-0 flex-1 basis-64 type-body text-pretty text-ink-strong">
        {w.capStops}
      </p>
      <Button variant="outline" size="sm" onclick={onconfigure}
        >{w.changeCap}</Button
      >
    </div>
    <section class="flex flex-col gap-space-2">
      <h2
        class="flex h-c-section-head-h items-center px-space-3 type-label text-ink-strong"
      >
        {w.bySource}
      </h2>
      <ul
        class="flex flex-col divide-y divide-border-hairline rounded-lg bg-surface-raised shadow-tile"
      >
        {#each spend.sources as source (source.name)}
          <li
            class="flex flex-wrap items-center gap-x-space-4 gap-y-space-1 px-space-4 py-space-3"
          >
            <span
              class="min-w-0 flex-1 basis-48 truncate type-label text-ink-row"
              >{source.name}</span
            >
            <span class="w-c-limit-bar flex-none">
              <Progress
                value={Math.round(source.share * 100)}
                aria-hidden="true"
              />
            </span>
            <span
              class="w-c-ledger-usd-w flex-none text-end type-meta num text-ink-strong"
              >{source.amount}</span
            >
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p
      class="rounded-lg bg-surface-raised px-space-5 py-space-4 type-body text-ink-muted shadow-tile"
    >
      {w.noSpend}
    </p>
  {/if}
</div>
