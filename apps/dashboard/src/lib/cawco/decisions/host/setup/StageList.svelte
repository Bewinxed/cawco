<!--
  A setup page's stage list: an ordered list on the house list surface
  (LIST_CLASS) that owns the columns its rows take by subgrid, so every
  row's parts stand on one edge down the list.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { LIST_CLASS } from "./stage";

  let {
    ref = $bindable(null),
    cols,
    children,
  }: {
    ref?: HTMLOListElement | null;
    /** Its column tracks, as `grid-template-columns` takes them. */
    cols: string;
    children: Snippet;
  } = $props();
</script>

<!-- biome-ignore-start lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away. -->
<ol
  bind:this={ref}
  class={[LIST_CLASS, "grid-cols-(--stage-cols)"]}
  data-slot="setup-stages"
  role="list"
  style:--stage-cols={cols}
>
  <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
  {@render children()}
</ol>
