<script lang="ts">
  /** Row: its children side by side, wrapping. */
  import Layout from "./Layout.svelte";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    children: unknown[];
    justify?: string;
    align?: string;
  }> = $props();
</script>

<Layout align={props.align} axis="row" justify={props.justify}>
  {@render renderNode(props.children)}
</Layout>
