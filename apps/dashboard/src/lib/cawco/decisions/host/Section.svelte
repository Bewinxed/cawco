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
  /* tailwind: this folder is bundled by Bun with no Tailwind build (core decision-host.ts), and Tailwind only generates CSS where it scans the source, so a utility here would draw nothing — https://tailwindcss.com/docs/detecting-classes-in-source-files */
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
  }
  .title {
    font: var(--type-label);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
    padding-block-start: var(--space-4);
  }
</style>
