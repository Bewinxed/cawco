<script lang="ts">
  /**
   * A line a search reads, each match of the query marked in the selection
   * wash (marked.ts), the rest as written: a decision's title in the
   * decisions list, a repository's name in the location popover.
   */
  import { marked } from "./marked";

  let {
    text,
    query,
  }: {
    text: string;
    /** Lowercased, as `marked` matches it; "" marks nothing. */
    query: string;
  } = $props();
</script>

{#each marked(text, query) as piece, index (index)}{#if piece.hit}<mark
      class="rounded-xs bg-accent/20 text-inherit">{piece.part}</mark
    >{:else}{piece.part}{/if}{/each}
