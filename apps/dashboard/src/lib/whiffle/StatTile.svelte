<script lang="ts">
  /**
   * A card holding a recessed well, and the well holds one figure: the label
   * over the value in the KPI role, with its unit on the value's line (the
   * plan's 280×90 tile). The unit sits after the value, so it coming and
   * going never moves the figure or the tile's height.
   */
  import { TextMorph } from "torph/svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Card from "$lib/components/ui/card";
  import { CURVE, morphMs } from "$lib/whiffle/motion/curves.svelte";

  interface Props {
    label: string;
    unit?: string;
    value: string | number;
  }

  let { label, value, unit }: Props = $props();
</script>

<Card.Root class="st-card">
  <div class="st-well">
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
  </div>
</Card.Root>

<style>
  /* The plan's signature move, measured off the comp (plan 2026-08-18,
     measured reference): "stat card 280×90, r10" around a "stat well 7px
     inset, #F4F4F4 + 1px #EEEEEE, r7". Those radii are the comp's and are
     kept as measured: concentric at a 7px inset would be r3, not r7. */
  :global(.st-card) {
    height: 100%;
    min-height: var(--c-stat-h);
    gap: 0;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-stat);
  }
  /* The well's padding is the old card padding (18px) less the 7px inset
     and its 1px border, so the figure stands where it stood before. */
  .st-well {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-well);
    background: var(--surface-recess);
    transition: var(--transition-control);
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
  :global(.st-card .st-value) {
    min-height: 1lh;
    font: var(--type-kpi);
    color: var(--ink-stat);
  }
  .st-unit {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  @media (max-width: 900px) {
    :global(.st-card .st-value) {
      font: var(--type-title);
    }
  }
</style>
