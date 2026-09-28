<script lang="ts">
  /**
   * A flat card holding one figure: label, value in the KPI role, unit. An
   * empty `unit` still keeps its line, so a tile whose unit comes and goes
   * stands at one height and its figure does not move when it changes.
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
</Card.Root>

<style>
  :global(.st-card) {
    height: 100%;
    justify-content: center;
    gap: 10px;
    padding-inline: 18px;
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
