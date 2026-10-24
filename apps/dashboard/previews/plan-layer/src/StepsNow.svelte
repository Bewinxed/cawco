<script lang="ts">
  /**
   * 1. Where it stands now. Finished steps fold into one row ("4 done")
   * that opens in place by the house `unfold` (motion/fold: height, edges
   * and the column's gap on --dur-pop and ease-out, back over --dur-exit);
   * the step under way, the step waiting on you and the rest stand open,
   * in the plan's order. The layer opens at its top, which is the step
   * under way under the one fold row.
   */
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { IconChevronDown, IconTick } from "#lib/icons.js";
  import type { StepNode } from "./StepTree.svelte";
  import StepTree from "./StepTree.svelte";

  let { steps }: { steps: StepNode[] } = $props();

  const done = $derived(steps.filter((step) => step.status === "completed"));
  const rest = $derived(steps.filter((step) => step.status !== "completed"));
  let open = $state(false);
  const foldId = $props.id();
</script>

<div data-slot="now" class="flex flex-col gap-space-1">
  {#if done.length > 0}
    <button
      data-slot="fold"
      aria-controls={foldId}
      aria-expanded={open}
      class="group/fold touch-hit flex items-start gap-space-2 min-w-0 w-full m-0 p-0 border-0 bg-transparent rounded-sm text-start type-label text-ink-muted cursor-pointer transition-[color] duration-(--dur-control) ease-out can-hover:hover:text-ink-strong"
      onclick={() => {
        open = !open;
      }}
      type="button"
    >
      <span
        class="flex-none grid place-items-center w-icon-md h-lh"
        data-slot="plan-mark"
        data-status="completed"
      >
        <IconTick class="size-icon-md text-status-done-glyph" />
      </span>
      <span data-slot="text" class="min-w-0">{done.length} done</span>
      <span class="flex-none grid place-items-center h-lh">
        <IconChevronDown
          aria-hidden="true"
          class="size-icon-sm text-ink-subtle motion-safe:transition-[rotate] duration-(--dur-control) ease-out group-aria-expanded/fold:rotate-180"
        />
      </span>
    </button>
    {#if open}
      <div data-slot="folded" id={foldId} in:unfold out:unfold>
        <StepTree nodes={done} still />
      </div>
    {/if}
  {/if}
  <StepTree nodes={rest} />
</div>
