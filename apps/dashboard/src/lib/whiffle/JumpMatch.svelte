<!--
  Text with the part the query matched marked inside it.

  A palette that only lists titles makes the reader guess why each row is
  there. Marking the match answers it in place: the row says what it is AND
  what it matched on, so a list of near-identical session names becomes
  readable at a glance.

  Ranges are `[start, end)` character offsets into `text`, resolved against
  its lowercased twin — so the marked slice is the original casing, not the
  folded one. `<mark>` is the semantic element for "text of relevance"; the
  background is cleared so it never fights the selected-row fill.
-->
<script lang="ts">
  import type { Range } from "./jump-index";

  let {
    text,
    ranges = [],
    class: className = "",
  }: { text: string; ranges?: Range[]; class?: string } = $props();

  interface Part {
    hit: boolean;
    value: string;
  }

  const parts = $derived.by((): Part[] => {
    if (ranges.length === 0) {
      return [{ value: text, hit: false }];
    }
    const out: Part[] = [];
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start > cursor) {
        out.push({ value: text.slice(cursor, start), hit: false });
      }
      out.push({ value: text.slice(start, end), hit: true });
      cursor = end;
    }
    if (cursor < text.length) {
      out.push({ value: text.slice(cursor), hit: false });
    }
    return out;
  });
</script>

<span class={className}
  >{#each parts as part, i (i)}
    {#if part.hit}
      <mark>{part.value}</mark>
    {:else}
      {part.value}
    {/if}
  {/each}</span
>

<style>
  /* Emphasis is weight and ink, never a highlighter fill: 500 is the top of
     this system's weight ladder (600 and above do not exist here), and the
     cleared background keeps the mark from fighting the selected-row fill. */
  mark {
    background: transparent;
    color: var(--ink-strong);
    font-weight: var(--weight-strong);
  }
</style>
