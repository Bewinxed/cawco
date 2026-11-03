<!--
  A setup page's stage list: an ordered list on the house list surface
  (LIST_CLASS) that owns the columns its rows take by subgrid, so every
  row's parts stand on one edge down the list. It is its rows' container,
  so a row lays out by the list's width, not the window's.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { LIST_CLASS } from "./stage";

  let {
    ref = $bindable(null),
    cols,
    narrow = cols,
    children,
  }: {
    ref?: HTMLOListElement | null;
    /** Its column tracks, as `grid-template-columns` takes them; `narrow`, those under the `setup-stages-line` width. */
    cols: string;
    narrow?: string;
    children: Snippet;
  } = $props();
</script>

<div class="@container min-w-0">
  <!-- biome-ignore-start lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away. -->
  <ol
    bind:this={ref}
    class={[
      LIST_CLASS,
      "grid-cols-(--stage-cols) @max-setup-stages-line:grid-cols-(--stage-cols-narrow)",
    ]}
    data-slot="setup-stages"
    role="list"
    style:--stage-cols={cols}
    style:--stage-cols-narrow={narrow}
  >
    <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
    {@render children()}
  </ol>
</div>
