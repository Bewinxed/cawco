<script lang="ts">
  import { IconChevronDown, IconChevronRight } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { buildSpendStats } from "./routine-format";
  import type { Routine } from "./routines-data";

  interface Props {
    open?: boolean;
    routine: Routine;
  }

  let { open = $bindable(false), routine }: Props = $props();
  const rows = $derived(buildSpendStats(routine));
</script>

<section class="border-t border-t-border-hairline pt-space-3">
  <button
    aria-expanded={open}
    class="press-tint flex w-full items-center justify-between gap-space-2 rounded-sm px-space-2 py-space-2 text-start type-label text-ink-muted transition-[background-color,color] duration-(--duration-control) ease-out hover:bg-surface-hover hover:text-ink-strong"
    onclick={() => {
      open = !open;
    }}
    type="button"
  >
    <span class="mark-line inline-flex items-center gap-space-2">
      {#if open}
        <IconChevronDown class="size-icon-sm flex-none" />
      {:else}
        <IconChevronRight class="size-icon-sm flex-none" />
      {/if}
      <span>Spend & run limits</span>
    </span>
    <span class="type-meta text-ink-subtle tabular-nums">
      {routine.limits.runsWeek} runs this week
    </span>
  </button>

  {#if open}
    <div
      class="mt-space-2 grid grid-cols-2 gap-space-3 rounded-well border border-border-well bg-surface-well p-space-3 @details:grid-cols-3"
      transition:unfold
    >
      {#each rows as row (row.label)}
        <div class="flex flex-col gap-space-row">
          <span class="type-meta text-ink-muted">{row.label}</span>
          <span class="type-label text-ink-strong tabular-nums">
            {row.value}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</section>
