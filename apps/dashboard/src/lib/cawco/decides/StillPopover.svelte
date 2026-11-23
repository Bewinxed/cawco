<script lang="ts">
  /**
   * A Who decides popover drawn in place (in-place.ts): its panel in the
   * page's flow under what opened it, on the floating surface, one float up
   * the surface ladder from where it opens.
   */
  import type { Snippet } from "svelte";
  import { rise } from "#lib/components/ui/elevated/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { placeUnder } from "./in-place";

  let {
    id,
    labelledby,
    anchor,
    align,
    width,
    children,
  }: {
    id: string;
    labelledby: string;
    /** What opened it; the panel stands under it. */
    anchor: () => HTMLElement | null;
    /** The edge of the anchor the panel lines up with. */
    align: "start" | "end";
    /** Its width, capped at the page's: a CSS length. */
    width: string;
    children: Snippet;
  } = $props();

  const surfaceLevel = rise();
</script>

<section
  style:--surface-level={surfaceLevel}
  style:--pop-w="min({width}, 100%)"
  aria-labelledby={labelledby}
  class={[
    floatingSurface({ motion: "pop" }),
    "absolute z-(--layer-float) w-(--pop-w) overflow-clip p-0",
  ]}
  data-state="open"
  data-still-popover
  {id}
  {@attach placeUnder(anchor, align)}
>
  {@render children()}
</section>
