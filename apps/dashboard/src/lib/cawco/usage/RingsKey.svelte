<script lang="ts">
  import { usage } from "./forecast.svelte";
  /**
   * An account's key: one line per window, the 5-hour (the disc) first,
   * then the week (the rim), then opencode's month: glyph | label | value |
   * reset. The label and value columns are fixed, so values line up down a
   * tile, across the tiles in a row, and down the popover.
   */
  import { type KeyRow, keyRows, type RingAccount } from "./rings";

  let { ring }: { ring: RingAccount } = $props();

  const rows: KeyRow[] = $derived(keyRows(ring, usage.now));
</script>

<div class="key" style:--c={ring.color}>
  {#each rows as row (row.id)}
    {#if row.glyph}
      <svg
        aria-hidden="true"
        class={["glyph", row.glyph]}
        height="10"
        viewBox="0 0 10 10"
        width="10"
        class:limit={row.limit}
        class:stale={ring.state === "stale"}
      >
        <circle cx="5" cy="5" r={row.glyph === "disc" ? 4.5 : 4.25} />
      </svg>
    {:else}
      <span></span>
    {/if}
    <span class="label">{row.label}</span>
    <span class="value" data-key-value>{row.value}</span>
    <span class="reset">{row.reset}</span>
  {/each}
</div>

<style>
  .key {
    display: grid;
    grid-template-columns: 10px 52px 84px minmax(0, 1fr);
    column-gap: var(--space-2);
    row-gap: 3px;
    align-items: center;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
  }
  .glyph {
    display: block;
  }
  .disc circle {
    fill: var(--c);
  }
  .rim circle {
    fill: none;
    stroke: var(--c);
    stroke-width: 1.5;
  }
  .disc.limit circle {
    fill: var(--border-control);
  }
  .rim.limit circle {
    stroke: var(--border-control);
  }
  .stale {
    opacity: 0.4;
  }
  .label {
    font-weight: var(--weight-strong);
    color: var(--ink-row);
  }
  .value {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    white-space: nowrap;
  }
  .reset {
    min-inline-size: 0;
    justify-self: end;
    text-align: end;
    color: var(--ink-muted);
  }
</style>
