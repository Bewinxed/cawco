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
  import { TextMorph } from "torph/svelte";
  import { CURVE, morphMs } from "#lib/cawco/motion/curves.svelte.js";

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

<div class="st-card" data-tone={tone} {...rest}>
  <span class="st-label">{label}</span>
  <span class="st-figure">
    <!-- A new figure morphs out of the old one, digit by digit, in place. -->
    <TextMorph
      as="span"
      class="st-value num"
      duration={morphMs()}
      ease={CURVE.out}
      text={String(value)}
    />
    {#if unit}
      {#key unit}
        <span class="st-unit num" data-flip="pop">{unit}</span>
      {/key}
    {/if}
  </span>
  {#if action}
    <span class="st-action">{@render action()}</span>
  {/if}
</div>

<style>
  .st-card {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-2);
    block-size: 100%;
    min-block-size: var(--c-stat-h);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .st-label {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  /* The value and its unit share a baseline; a long unit wraps under the
     value rather than pushing out of the tile. */
  .st-figure {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--space-2);
  }
  /* TextMorph writes its text after mount; the line stands from the first
     paint so nothing below it moves when the figure lands. */
  .st-card :global(.st-value) {
    min-block-size: 1lh;
    font: var(--type-kpi);
    color: var(--ink-stat);
  }
  .st-card[data-tone="live"] :global(.st-value) {
    color: var(--status-live-ink);
  }
  .st-card[data-tone="attn"] :global(.st-value) {
    color: var(--status-attn-ink);
  }
  .st-card[data-tone="done"] :global(.st-value) {
    color: var(--status-done-ink);
  }
  .st-card[data-tone="fail"] :global(.st-value) {
    color: var(--status-fail-ink);
  }
  .st-action {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .st-unit {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  @media (max-width: 900px) {
    .st-card :global(.st-value) {
      font: var(--type-title);
    }
  }
</style>
