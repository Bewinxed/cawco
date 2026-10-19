<script lang="ts">
  /**
   * PROPOSED: a task's state line drawn: led by the session's 18px tree
   * mark (it echoes while it works) or a 16px Solar duotone mark, then the
   * word in the label role in its status ink, then what it adds, muted,
   * clipped at the line's end (the pane says it whole).
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import { IconClock, IconLock, IconWarningTriangle } from "#lib/icons.js";
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
  {:else if line.kind === "session"}
    <SessionMark id={line.session} place={line.place} status={line.status} />
  {:else if line.kind === "cant"}
    <IconWarningTriangle aria-hidden="true" class="mark attn" />
  {:else if line.kind === "after"}
    <IconLock aria-hidden="true" class="mark" />
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
