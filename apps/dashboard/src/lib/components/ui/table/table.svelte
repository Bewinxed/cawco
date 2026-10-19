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
        /** Cells flush. */
        // eslint-disable-next-line shadcn/no-raw-colors -- @shadcn/lint 0.2.3 (the latest) still reads `border-spacing-0` as a border colour: its classifier knows border-spacing only by the theme's spacing keys, so the numeric zero falls to `border-` (dist/index.js splitColorClass, judge). Tailwind's own zero is the form (spacing-ratchet counts no zero).
        flush: { table: "border-spacing-0" },
      },
      layout: {
        /**
         * A ledger: fixed columns, cells flush and apart, so a sticky band
         * and each row's hairline draw on their own cells.
         */
        // eslint-disable-next-line shadcn/no-raw-colors -- as `flush` above: the linter's misread of `border-spacing-0`.
        ledger: { table: "table-fixed border-separate border-spacing-0" },
      },
      /** The sideways scroller fades the edges its content runs past. */
      fadeEdges: { true: { container: "kit-edge-fade" } },
    },
  });

  export type TableSpacing = VariantProps<typeof tableVariants>["spacing"];
  export type TableLayout = VariantProps<typeof tableVariants>["layout"];
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
    layout,
    fadeEdges,
    ...restProps
  }: WithElementRef<HTMLTableAttributes> & {
    /** The rows that are targets: one hover ghost glides between them. */
    ghostRows?: string;
    /** The sideways scroller's own class (a table wider than its place scrolls). */
    scrollClass?: string;
    spacing?: TableSpacing;
    layout?: TableLayout;
    fadeEdges?: boolean;
  } = $props();

  const slots = $derived(tableVariants({ spacing, layout, fadeEdges }));
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
