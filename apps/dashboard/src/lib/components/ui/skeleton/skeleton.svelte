<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * What a placeholder stands for, as its callers have drawn it: the height
   * of the thing it holds the place of, the length of the words, the corner
   * of the surface, and the rail's glyph cell.
   */
  export const skeletonVariants = tv({
    variants: {
      height: {
        line: "h-6",
        figure: "h-7",
        item: "h-10",
        tabs: "h-11",
        row: "h-14",
        block: "h-20",
        plot: "h-24",
        view: "h-40",
        chart: "h-48",
        board: "h-64",
      },
      width: {
        glyph: "w-6",
        word: "w-14",
        short: "w-16",
        label: "w-20",
        name: "w-24",
        title: "w-40",
        "chart-cap": "max-w-144",
      },
      radius: {
        card: "rounded-lg",
        tile: "rounded-md",
        chip: "rounded-sm",
        text: "rounded-xs",
        flush: "rounded-none",
      },
      cell: { rail: "rail-cell" },
    },
  });

  export type SkeletonLooks = VariantProps<typeof skeletonVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef, type WithoutChildren } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    height,
    width,
    radius,
    cell,
    ...restProps
  }: WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> &
    SkeletonLooks = $props();
</script>

<!-- The one loading placeholder: the kit-skeleton recipe in app.css. The
     caller sizes it to exactly what it stands for, so the swap moves nothing. -->
<div
  class={cn(
    "kit-skeleton",
    skeletonVariants({ height, width, radius, cell }),
    className
  )}
  data-slot="skeleton"
  bind:this={ref}
  {...restProps}
></div>
