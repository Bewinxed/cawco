<script lang="ts">
  /**
   * One figure on one surface, DESIGN.md's stat tile: a 10px raised card,
   * 90px tall at least, holding its recessed well 7px in (the one
   * card-in-card). In the well the label (label role, muted) stands over the
   * value (KPI role, `ink-stat`, tabular) with its unit in meta on the same
   * baseline. The unit sits after the value, so it coming and going never
   * moves the figure or the tile's height. `action` is a control the figure
   * is changed with (the budget's Set budget), under the figure in the well.
   */
  import type { ViewTone } from "@cawco/core/views";
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    action?: Snippet;
    label: string;
    /**
     * A status pair the figure takes (a drawn view's tile), or a threshold
     * reading's data colour (`caution` data-warn, `bad` data-bad: a budget's
     * share, never a status pair); none by default.
     */
    tone?: ViewTone | "caution" | "bad";
    unit?: string;
    value: string | number;
  }

  let {
    label,
    value,
    unit,
    action,
    tone = "neutral",
    ...rest
  }: Props = $props();
</script>

<div
  class="group flex h-full min-h-c-stat-h flex-col rounded-md bg-surface-raised p-space-2 shadow-stat"
  data-tone={tone}
  {...rest}
>
  <div
    data-slot="well"
    class="flex min-w-0 flex-auto flex-col justify-between gap-space-1 rounded-well bg-surface-recess p-c-stat-well-pad inset-ring inset-ring-border-hairline"
  >
    <span class="min-w-0 type-label text-ink-muted">{label}</span>
    <span class="flex flex-wrap items-baseline gap-x-space-2">
      <!-- A new figure morphs out of the old one, digit by digit, in place. -->
      <span
        data-slot="num"
        data-stat-value
        class="num min-h-lh type-kpi text-ink-stat group-tone-live:text-status-live-ink group-tone-attn:text-status-attn-ink group-tone-done:text-status-done-ink group-tone-fail:text-status-fail-ink group-tone-caution:text-data-warn group-tone-bad:text-data-bad max-desk:type-title"
        ><MorphText text={String(value)} /></span
      >
      {#if unit}
        {#key unit}
          <span
            data-slot="num"
            class="num type-meta text-ink-muted"
            data-flip="pop">{unit}</span
          >
        {/key}
      {/if}
    </span>
    {#if action}
      <span class="flex flex-wrap items-center gap-space-2"
        >{@render action()}</span
      >
    {/if}
  </div>
</div>
