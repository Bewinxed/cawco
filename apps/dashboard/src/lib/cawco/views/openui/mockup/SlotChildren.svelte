<script lang="ts">
  /** What a specimen's `<slot>` holds: its children, drawn by the mockup's renderer. */
  import type { Snippet } from "svelte";

  let {
    renderNode,
    value,
  }: { renderNode: Snippet<[unknown]>; value: unknown } = $props();
</script>

{@render renderNode(value)}
