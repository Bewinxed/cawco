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
  class="group/time mark-line num inline-flex max-w-full items-center gap-space-1 align-bottom type-meta whitespace-nowrap text-ink-muted status-failed:text-status-fail-ink status-running:text-status-live-ink status-waiting:text-status-attn-ink"
  data-status={status}
  title={title ?? undefined}
>
  {#if status === "running"}
    <Spinner
      aria-hidden="true"
      class="size-icon-sm flex-none"
      role="presentation"
      tone="live-running"
    />
  {:else}
    {@const Glyph = GLYPH[status]}
    <Glyph
      aria-hidden="true"
      class="size-icon-sm flex-none group-status-done/time:text-status-done-glyph group-status-failed/time:text-status-fail-glyph group-status-neutral/time:text-ink-subtle group-status-waiting/time:text-status-attn-glyph"
    />
  {/if}
  {#if said}
    <span class="sr-only">{said},</span>
  {/if}
  <span class="overflow-clip text-ellipsis">{text}</span>
</span>
