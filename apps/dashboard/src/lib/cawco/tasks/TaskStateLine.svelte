<script lang="ts">
  /**
   * PROPOSED: a task's state line drawn: led by the session's 18px tree
   * mark (it echoes while it works) or a 16px mark, then the word in the
   * label role in its status ink, then what it adds, muted, clipped at the
   * line's end (the pane says it whole).
   *
   * Its status marks are solid Solar bold, never duotone (the failure-mark
   * ruling, DESIGN.md's Solar icons line): a failure is `danger-circle` in
   * the fail pair; a task that cannot go on is `forbidden-circle`, in the
   * attn pair when it waits on you (Can't start) and muted when it waits on
   * other tasks. A date is no status: its clock stays duotone.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  // Each glyph straight from Solar, as TreeMark takes its own: the icon
  // registry is one module of every glyph, too heavy for a line's three.
  import IconClock from "~icons/solar/clock-circle-bold-duotone";
  import IconFailed from "~icons/solar/danger-circle-bold";
  import IconBlocked from "~icons/solar/forbidden-circle-bold";
  import type { StateLine } from "./task-state-line";

  let {
    line,
    bare = false,
  }: {
    line: StateLine;
    /** Its mark stands elsewhere on the row (the run order's lead). */
    bare?: boolean;
  } = $props();
</script>

<span
  data-slot="state"
  class="state mark-line"
  data-state={line.kind === "session" ? line.status : line.kind}
>
  {#if bare}
    <!-- The row's lead holds the mark. -->
  {:else if line.kind === "session" && line.status === "fail"}
    <IconFailed aria-hidden="true" class="mark fail" />
  {:else if line.kind === "session"}
    <SessionMark id={line.session} place={line.place} status={line.status} />
  {:else if line.kind === "cant"}
    <IconBlocked aria-hidden="true" class="mark attn" />
  {:else if line.kind === "after"}
    <IconBlocked aria-hidden="true" class="mark" />
  {:else}
    <IconClock aria-hidden="true" class="mark" />
  {/if}
  <span class="word" class:figure={line.kind === "date"}>{line.word}</span>
  {#if line.rest}
    <span class="rest"><span aria-hidden="true">·</span> {line.rest}</span>
  {/if}
</span>

<style>
  .state {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .state :global(.mark) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  .state :global(.mark.attn) {
    color: var(--status-attn-glyph);
  }
  .state :global(.mark.fail) {
    color: var(--status-fail-glyph);
  }
  .word {
    flex: none;
  }
  .figure {
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    font-variant-numeric: tabular-nums;
    font-size-adjust: cap-height var(--mono-figure-cap);
  }
  .rest {
    min-inline-size: 0;
    overflow: clip;
    font-weight: var(--weight-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  [data-state="live"] .word {
    color: var(--status-live-ink);
  }
  [data-state="attn"] .word,
  [data-state="cant"] .word {
    color: var(--status-attn-ink);
  }
  [data-state="fail"] .word {
    color: var(--status-fail-ink);
  }
</style>
