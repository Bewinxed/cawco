<script lang="ts" module>
  /**
   * How a run, a read or an action went, one vocabulary across the routines
   * page: done (the success glyph), failed, running (the spinner), waiting
   * on you, and neutral (never ran, skipped, stopped, denied).
   */
  export type Status = "done" | "failed" | "running" | "neutral" | "waiting";
</script>

<script lang="ts">
  /**
   * A status glyph and its words on one line, in tabular figures: the
   * glyph's shape and hue say how it went, the words what or when. `said`
   * is what the glyph alone says to the eye, read out before the words
   * ("Failed, 3d ago"); left out where the words already say it.
   */
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconError,
    IconMinusCircle,
    IconNeedsYou,
    IconSuccess,
  } from "#lib/icons.js";

  let {
    status,
    text,
    title = null,
    said = null,
  }: {
    status: Status;
    text: string;
    /** The whole of it, on hover: the exact time, the reason. */
    title?: string | null;
    said?: string | null;
  } = $props();

  const GLYPH = {
    done: IconSuccess,
    failed: IconError,
    neutral: IconMinusCircle,
    waiting: IconNeedsYou,
  } as const;
</script>

<span
  data-slot="time"
  data-num
  class="time num mark-line"
  data-status={status}
  title={title ?? undefined}
>
  {#if status === "running"}
    <Spinner aria-hidden="true" class="status-glyph" role="presentation" />
  {:else}
    {@const Glyph = GLYPH[status]}
    <Glyph aria-hidden="true" class="status-glyph" />
  {/if}
  {#if said}
    <span class="sr-only">{said},</span>
  {/if}
  <span class="time-words">{text}</span>
</span>

<style>
  .time {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-inline-size: 100%;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
    white-space: nowrap;
    vertical-align: bottom;
  }
  .time-words {
    overflow: clip;
    text-overflow: ellipsis;
  }
  .time :global(.status-glyph) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  [data-status="done"] :global(.status-glyph) {
    color: var(--status-done-glyph);
  }
  [data-status="failed"] {
    color: var(--status-fail-ink);
  }
  [data-status="failed"] :global(.status-glyph) {
    color: var(--status-fail-glyph);
  }
  [data-status="running"] {
    color: var(--status-live-ink);
  }
  [data-status="running"] :global(.status-glyph) {
    color: var(--status-live-glyph);
  }
  [data-status="waiting"] {
    color: var(--status-attn-ink);
  }
  [data-status="waiting"] :global(.status-glyph) {
    color: var(--status-attn-glyph);
  }
  [data-status="neutral"] :global(.status-glyph) {
    color: var(--ink-subtle);
  }
</style>
