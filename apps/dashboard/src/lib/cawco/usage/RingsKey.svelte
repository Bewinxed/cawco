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

<!-- literal: 10px 52px 84px, 3px -->
<div
  class="mark-line type-meta num grid grid-cols-(--key-cols) items-center gap-x-space-2 gap-y-(--key-row-gap)"
  style:--c={ring.color}
  style:--key-cols="10px 52px 84px minmax(0, 1fr)"
  style:--key-row-gap="3px"
>
  {#each rows as row (row.id)}
    {#if row.glyph === "rim"}
      <!-- The week's own mark: the rim in small, filled to what is left. -->
      <WeekMark {ring} />
    {:else if row.glyph}
      <svg
        data-slot="glyph"
        aria-hidden="true"
        class="block fill-(--c) data-limit:fill-border-control data-stale:opacity-40"
        height="10"
        viewBox="0 0 10 10"
        width="10"
        data-limit={row.limit || undefined}
        data-stale={ring.state === "stale" || undefined}
      >
        <circle cx="5" cy="5" r={row.glyph === "disc" ? 4.5 : 4.25} />
      </svg>
    {:else}
      <span data-box></span>
    {/if}
    <span data-slot="rings-key-label" class="font-medium text-ink-row">{row.label}</span>
    <span data-slot="value" class="mark-text font-medium whitespace-nowrap text-ink-strong" data-key-value
      >{@render said(row.value)}</span
    >
    <span class="mark-text min-w-0 justify-self-end text-end text-ink-muted">{@render said(row.reset)}</span>
  {/each}
</div>
