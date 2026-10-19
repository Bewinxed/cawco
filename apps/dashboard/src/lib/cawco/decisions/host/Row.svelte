<!-- Row: media side by side, wrapping where they do not fit. -->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import Stack from "./Stack.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    children: unknown[];
    justify?: unknown;
    align?: unknown;
  }> = $props();
</script>

<Stack align={props.align} axis="row" justify={props.justify}>
  {@render renderNode(props.children)}
</Stack>
