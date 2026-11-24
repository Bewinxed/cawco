<script lang="ts">
  import { planWords } from "@cawco/core/words/plan";
  /**
   * How far a session's plan has got, as the tray row's chip that opens the
   * plan over the row (PlanLayer) and shuts it again: the tray's chip
   * recipe (ui/chip `tray`), so the row is one height on one line. Its
   * ring fills with the tasks done (TaskRing, the session's progress mark
   * wherever a session is listed) and its figure says how many of how many;
   * while a task is under way, the live dot stands after the figure.
   */
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import TaskRing from "../TaskRing.svelte";

  let {
    done,
    total,
    moving,
    shown,
    onopen,
  }: {
    done: number;
    total: number;
    /** Tasks under way now. */
    moving: number;
    /** The plan stands open over the row. */
    shown: boolean;
    onopen: () => void;
  } = $props();
</script>

<button
  data-slot="plan-chip"
  aria-label={planWords.chipLabel(done, total, moving)}
  aria-pressed={shown}
  class={chipVariants({
    variant: "tray",
    class:
      "touch-hit flex-none text-ink-strong aria-pressed:before:bg-surface-pressed",
  })}
  data-tray-chip
  onclick={onopen}
  type="button"
>
  <TaskRing {done} size="md" {total} />
  <span aria-hidden="true" class="num whitespace-nowrap"
    >{planWords.chipFigure(done, total)}</span
  >
  {#if moving > 0}
    <LiveDot size="row" />
  {/if}
</button>
