<script lang="ts">
  /**
   * One figure on one surface: the label over the value in the KPI role,
   * its unit on the value's line, on the Usage page's own card (raised,
   * --radius-lg, --shadow-tile) — no frame inside it. The unit sits after
   * the value, so it coming and going never moves the figure or the tile's
   * height. `action` is a control the figure is changed with (the budget's
   * Set budget).
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    action?: Snippet;
    label: string;
    /** A status pair the figure takes (a drawn view's tile); none by default. */
    tone?: "neutral" | "live" | "attn" | "done" | "fail";
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
  class="group flex h-full min-h-c-stat-h flex-col justify-start gap-space-2 rounded-lg bg-surface-raised px-space-5 py-space-4 shadow-tile"
  data-tone={tone}
  {...rest}
>
  <span class="type-label text-ink-muted">{label}</span>
  <span class="flex flex-wrap items-baseline gap-x-space-2">
    <!-- A new figure morphs out of the old one, digit by digit, in place. -->
    <!-- literal: 1lh -->
    <span
      data-slot="num"
      class="num min-h-(--line-min) type-kpi text-ink-stat group-tone-live:text-status-live-ink group-tone-attn:text-status-attn-ink group-tone-done:text-status-done-ink group-tone-fail:text-status-fail-ink max-desk:type-title"
      style:--line-min="1lh"
      ><MorphText text={String(value)} /></span
    >
    {#if unit}
      {#key unit}
        <span data-slot="num" class="num type-meta text-ink-muted" data-flip="pop">{unit}</span>
      {/key}
    {/if}
  </span>
  {#if action}
    <span class="flex flex-wrap items-center gap-space-2">{@render action()}</span>
  {/if}
</div>
