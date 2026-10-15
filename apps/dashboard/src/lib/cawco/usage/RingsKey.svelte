<script lang="ts">
  import { usage } from "./forecast.svelte";
  /**
   * An account's key: one line per window, the 5-hour (the disc) first,
   * then the week (the rim), then opencode's month: glyph | label | value |
   * reset. The label and value columns are fixed, so values line up down a
   * tile and across the tiles in a row; their figures are in the mono
   * figure face.
   */
  import { type KeyRow, keyRows, type Part, type RingAccount } from "./rings";
  import WeekMark from "./WeekMark.svelte";

  let { ring }: { ring: RingAccount } = $props();

  const rows: KeyRow[] = $derived(keyRows(ring, usage.now));
</script>

{#snippet said(parts: Part[])}
  {#each parts as part, i (i)}
    {#if typeof part === "string"}
      {part}
    {:else if "figure" in part}
      <span class="mono-figure">{part.figure}</span>
    {/if}
  {/each}
{/snippet}

<div class="key mark-line" style:--c={ring.color}>
  {#each rows as row (row.id)}
    {#if row.glyph === "rim"}
      <!-- The week's own mark: the rim in small, filled to what is left. -->
      <WeekMark {ring} />
    {:else if row.glyph}
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
      <span data-box></span>
    {/if}
    <span class="label">{row.label}</span>
    <span class="value mark-text" data-key-value>{@render said(row.value)}</span
    >
    <span class="reset mark-text">{@render said(row.reset)}</span>
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
  .disc.limit circle {
    fill: var(--border-control);
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
