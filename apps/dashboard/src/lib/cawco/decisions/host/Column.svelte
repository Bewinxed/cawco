<!-- Column: media one under another. -->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import Stack from "./Stack.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{ children: unknown[]; align?: unknown }> = $props();
</script>

<Stack align={props.align} axis="column">
  {@render renderNode(props.children)}
</Stack>
