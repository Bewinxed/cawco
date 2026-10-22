<script lang="ts">
  /**
   * How far a conversation's plan has got — the progress ring and its figure
   * — as the control that opens the plan over the composer's row
   * (PlanPane), and shuts it again. A chip on
   * the tray row (ui/chip, `variant: "tray"`), the delegate chips' own
   * recipe, so the row is one height on one line.
   */
  import { planWords } from "@cawco/core";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconToolTodo } from "#lib/icons.js";
  import TaskRing from "../TaskRing.svelte";

  let {
    done,
    total,
    open,
    onopen,
  }: {
    done: number;
    total: number;
    /** The plan is open over the composer's row. */
    open: boolean;
    onopen: () => void;
  } = $props();
</script>

<button
  data-slot="plan-ring"
  aria-label={planWords.ringLabel(done, total)}
  aria-pressed={open}
  class={chipVariants({
    variant: "tray",
    class:
      "touch-hit text-ink-muted aria-pressed:text-ink-strong aria-pressed:before:bg-surface-pressed",
  })}
  data-tray-chip
  onclick={onopen}
  type="button"
>
  {#if total > 0}
    <TaskRing {done} size="md" {total} />
    <span>{planWords.plan}</span>
    <span data-slot="num" class="num">{planWords.figure(done, total)}</span>
  {:else}
    <IconToolTodo aria-hidden="true" />
    <span>{planWords.plan}</span>
  {/if}
</button>
