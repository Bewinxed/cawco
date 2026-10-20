<!--
  A heading over some decisions (on the graph, the frame round them): its
  title in the label role, muted, with no glyph; 25px above it (the page's
  18px group gap and 7px of its own) and 11px under it, its cards 18px apart
  as the page's groups are.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{ title: unknown; children: unknown[] }> = $props();
</script>

<section
  aria-label={String(props.title ?? "")}
  class="flex min-w-0 flex-col pt-space-2"
  data-slot="section"
>
  <h2 class="type-label pb-space-3 text-ink-muted wrap-anywhere">
    {String(props.title ?? "")}
  </h2>
  <div class="flex min-w-0 flex-col gap-space-5">
    {@render renderNode(props.children)}
  </div>
</section>
