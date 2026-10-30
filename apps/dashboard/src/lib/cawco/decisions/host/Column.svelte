<!-- Column: media one under another; its pictures say their shapes to no Row around it. -->
<script lang="ts">
  import { setContext } from "svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { PICTURE_RATIOS } from "./page.svelte.js";
  import Stack from "./Stack.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{ children: unknown[]; align?: unknown }> = $props();
  setContext(PICTURE_RATIOS, undefined);
</script>

<Stack align={props.align} axis="column">
  {@render renderNode(props.children)}
</Stack>
