<script lang="ts">
  /**
   * A card holding a recessed well, and the well holds one figure: label,
   * value in the KPI role, unit. An empty `unit` still keeps its line, so a
   * tile whose unit comes and goes stands at one height and its figure does
   * not move when it changes.
   */
  import { TextMorph } from "torph/svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Card from "$lib/components/ui/card";
  import { CURVE } from "$lib/whiffle/motion/curves.svelte";

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
    <!-- A new figure morphs out of the old one, digit by digit, in place. -->
    <TextMorph
      as="span"
      class="st-value num"
      duration={150}
      ease={CURVE.out}
      text={String(value)}
    />
    {#if unit !== undefined}
      {#key unit}
        <span class="st-unit num" data-flip="pop">{unit}</span>
      {/key}
    {/if}
  </div>
</Card.Root>

<style>
  /* The plan's signature move, measured off the comp (plan 2026-08-18,
     measured reference): "stat card 280×90, r10" around a "stat well 7px
     inset, #F4F4F4 + 1px #EEEEEE, r7". Those radii are the comp's and are
     kept as measured: concentric at a 7px inset would be r3, not r7. */
  :global(.st-card) {
    height: 100%;
    gap: 0;
    padding: var(--space-2);
    border-radius: var(--radius-md);
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
  /* TextMorph writes its text after mount; the line stands from the first
     paint so nothing below it moves when the figure lands. */
  :global(.st-card .st-value) {
    min-height: 1lh;
    font: var(--type-kpi);
    color: var(--ink-strong);
  }
  .st-unit {
    min-height: 1lh;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  @media (max-width: 900px) {
    :global(.st-card .st-value) {
      font: var(--type-title);
    }
  }
</style>
