<script lang="ts">
  /**
   * The project page's pane on a sheet: the recessed field with the page's
   * own padding (DESIGN.md Layout: 25px on the inline start, 21px on the
   * end; 18px a side on a phone), so a view stands where the page puts it.
   */
  import type { Snippet } from "svelte";

  let {
    phone = false,
    bare = false,
    children,
  }: {
    /** A phone's pane: 18px a side. */
    phone?: boolean;
    /** What it holds pads itself (the project's head). */
    bare?: boolean;
    children: Snippet;
  } = $props();
</script>

<div
  class={[
    "flex w-full flex-col bg-surface-recess",
    bare
      ? "min-h-0 p-0"
      : [
          "pt-space-5 pb-space-6",
          phone ? "px-space-5" : "ps-space-7 pe-space-6",
        ],
  ]}
>
  {@render children()}
</div>
