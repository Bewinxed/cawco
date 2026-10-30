<!--
  Row: media side by side, wrapping where they do not fit. Its pictures
  (Image.svelte) say their shapes here; the narrowest shape sets
  `--ratio-min`, by which each picture asks the width that stands the
  narrowest at `--c-picture-min` with all of them at one height
  (`picture-row`, design.css). Where the Row can't give them that, its
  pictures wrap, one to a line, each fitting its width.
-->
<script lang="ts">
  import { setContext } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { PICTURE_RATIOS, type PictureRatios } from "./page.svelte.js";
  import Stack from "./Stack.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    children: unknown[];
    justify?: unknown;
    align?: unknown;
  }> = $props();

  const ratios = new SvelteMap<object, number>();
  const hear: PictureRatios = (key, ratio) => {
    if (ratio === null) {
      ratios.delete(key);
    } else {
      ratios.set(key, ratio);
    }
  };
  setContext(PICTURE_RATIOS, hear);
  /** Its narrowest picture's width over its height; none until one has loaded. */
  const narrowest = $derived(
    ratios.size > 0 ? Math.min(...ratios.values()) : undefined
  );
</script>

<Stack
  align={props.align}
  axis="row"
  justify={props.justify}
  ratioMin={narrowest}
>
  {@render renderNode(props.children)}
</Stack>
