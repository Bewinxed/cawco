<script lang="ts">
  /**
   * A row of the plan that folds tasks into a count ("3 done", "21 more to
   * do"), on the lead-row grid as a task's row is: the state they share in
   * the lead column, the count as its words, and the fold's chevron in the
   * chevron column, so it stands where a task's own fold does. A press
   * anywhere on the row opens it, and a press again folds it (`open`); the
   * tasks it folds stand under it while open (`below`), or, where the list
   * places them itself, after it.
   */
  import type { Snippet } from "svelte";
  import StepMark from "#lib/cawco/connect/StepMark.svelte";
  import { LeadCell, LeadRow } from "#lib/components/ui/lead-row/index.js";
  import { IconChevronDown } from "#lib/icons.js";

  let {
    state,
    words,
    open,
    onpress,
    who = false,
    below,
  }: {
    /** The state the folded tasks share. */
    state: "done" | "future";
    words: string;
    open: boolean;
    onpress: () => void;
    /** The list's rows end with a session's mark cell: this one keeps it, empty. */
    who?: boolean;
    below?: Snippet;
  } = $props();
</script>

{#snippet trailing()}
  <LeadCell size="figure" />
  <LeadCell size="chevron">
    <IconChevronDown
      aria-hidden="true"
      class={[
        "size-icon-sm text-ink-subtle transition-transform duration-(--duration-control)",
        open && "rotate-180",
      ]}
    />
  </LeadCell>
  {#if who}
    <LeadCell size="mark" />
  {/if}
{/snippet}

<LeadRow {below} data-flip ends={trailing}>
  {#snippet mark()}
    <StepMark {state} />
  {/snippet}
  <button
    aria-expanded={open}
    class="num text-start text-ink-muted after:absolute after:-inset-x-space-1 after:inset-y-0 after:-z-1 after:rounded-sm after:transition-colors after:duration-(--duration-control) hover:text-ink-strong hover:after:bg-surface-hover focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus-ring"
    onclick={onpress}
    type="button">{words}</button
  >
</LeadRow>
