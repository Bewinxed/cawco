<!-- A heading over some decisions: on the graph, the frame round them. -->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{ title: unknown; children: unknown[] }> = $props();
</script>

<section class="section" aria-label={String(props.title ?? "")}>
  <h2 class="title">{String(props.title ?? "")}</h2>
  {@render renderNode(props.children)}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .title {
    font: var(--type-label);
    color: var(--ink-muted);
    text-transform: none;
    overflow-wrap: anywhere;
    padding-block-start: var(--space-4);
  }
</style>
