<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const tableVariants = tv({
    slots: {
      container: "relative w-full overflow-x-auto",
      table: "w-full caption-bottom text-body",
    },
    variants: {
      spacing: {
        /** Cells apart by the caller's `--cell-gap`. */
        gap: { table: "border-spacing-(--cell-gap)" },
        /** Cells flush, by the caller's `--none`. */
        flush: { table: "border-spacing-(--none)" },
      },
      /** The sideways scroller fades the edges its content runs past. */
      fadeEdges: { true: { container: "kit-edge-fade" } },
    },
  });

  export type TableSpacing = VariantProps<typeof tableVariants>["spacing"];
</script>

<script lang="ts">
  import type { HTMLTableAttributes } from "svelte/elements";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ghostRows,
    scrollClass,
    spacing,
    fadeEdges,
    ...restProps
  }: WithElementRef<HTMLTableAttributes> & {
    /** The rows that are targets: one hover ghost glides between them. */
    ghostRows?: string;
    /** The sideways scroller's own class (a table wider than its place scrolls). */
    scrollClass?: string;
    spacing?: TableSpacing;
    fadeEdges?: boolean;
  } = $props();

  const slots = $derived(tableVariants({ spacing, fadeEdges }));
</script>

<div
  class={cn(slots.container(), scrollClass)}
  data-slot="table-container"
  {@attach ghostRows ? highlight({ rows: ghostRows }) : undefined}
>
  <table
    class={cn(slots.table(), className)}
    data-slot="table"
    bind:this={ref}
    {...restProps}
  >
    {@render children?.()}
  </table>
</div>
