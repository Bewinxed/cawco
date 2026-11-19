<script lang="ts">
  import type { MarkdownSnippets, Slotted } from "./types.js";

  let { slotted, snippets }: { slotted: Slotted; snippets: MarkdownSnippets } =
    $props();
</script>

{#if slotted.kind === "link"}
  {@render snippets.link?.(slotted.value)}
{:else if slotted.kind === "image"}
  {@render snippets.image?.(slotted.value)}
{:else if slotted.kind === "inlineCode"}
  {@render snippets.inlineCode?.(slotted.value)}
{:else}
  {@render snippets.code?.(slotted.value)}
{/if}
