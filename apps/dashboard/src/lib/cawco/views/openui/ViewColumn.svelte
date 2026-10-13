<script lang="ts">
  /** Column: its children one under another; a view's root. */
  import Layout from "./Layout.svelte";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{ children: unknown[]; align?: string }> = $props();
</script>

<Layout align={props.align} axis="column">
  {@render renderNode(props.children)}
</Layout>
