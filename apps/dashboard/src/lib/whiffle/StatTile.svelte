<script lang="ts">
  /**
   * A flat card holding one figure: label, value in the KPI role, unit. An
   * empty `unit` still keeps its line, so a tile whose unit comes and goes
   * stands at one height and its figure does not move when it changes.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Card from "$lib/components/ui/card";

  interface Props {
    label: string;
    unit?: string;
    value: string | number;
  }

  let { label, value, unit }: Props = $props();
</script>

<Card.Root class="st-card">
  <span class="st-label">{label}</span>
  <!-- Keyed, so a new figure pops in over the old one leaving where a
       `reflow` container holds the tile (the board); elsewhere it is set. -->
  {#key value}
    <span class="st-value" data-flip="pop">{value}</span>
  {/key}
  {#if unit !== undefined}
    {#key unit}
      <span class="st-unit" data-flip="pop">{unit}</span>
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
  .st-value {
    font: var(--type-kpi);
    font-variant-numeric: tabular-nums;
    color: var(--ink-strong);
  }
  .st-unit {
    min-height: 1lh;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  @media (max-width: 900px) {
    .st-value {
      font: var(--type-title);
    }
  }
</style>
