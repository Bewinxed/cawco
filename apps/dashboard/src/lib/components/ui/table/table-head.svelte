<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";
  import { tableColumn } from "./table.svelte";

  const tableHeadVariants = tv({
    base: "whitespace-nowrap px-space-3 text-start align-middle text-ink-strong text-label",
    variants: {
      variant: {
        /**
         * A ledger's header band: the column head role (label, caps, the
         * caps tracking) in muted ink at the band's 32px, on the band's
         * surface, held at the top while the rows scroll under it
         * (DESIGN.md, Density: "a 32px header band"; ledger-header).
         */
        band: "type-label sticky top-0 h-c-ledger-band-h bg-surface-band text-ink-muted uppercase tracking-caps",
        /*
         * A matrix's heads stand on their top edge, so heads of different
         * heights start their names on one line, and take the base's label
         * role (DESIGN.md, The Role, Not Size Rule: "column heads … are
         * label").
         */
        /** A matrix's corner heading. */
        "matrix-corner": "px-space-4 py-space-3 align-top text-ink-muted",
        /** A matrix's corner heading pinned to the inline start as it scrolls. */
        "matrix-corner-pinned":
          "sticky start-0 bg-surface-raised px-space-4 py-space-3 align-top text-ink-muted",
        /** A matrix's column heading, ruled on the left. */
        "matrix-column":
          "border-border border-l px-space-4 py-space-3 align-top text-ink-muted",
        /** A wide matrix column's heading. */
        "matrix-column-wide":
          "min-w-c-matrix-col-w border-border border-l px-space-4 py-space-3 align-top text-ink-muted",
        /** A wide matrix column's heading whose content sets its own text, and wraps. */
        "matrix-column-wide-plain":
          "min-w-c-matrix-col-w whitespace-normal border-border border-l px-space-4 py-space-3 align-top",
        /** A matrix's row heading on the raised surface. */
        "matrix-row": "bg-surface-raised px-space-4 py-space-2",
        /** A matrix's row heading pinned to the inline start as it scrolls. */
        "matrix-row-pinned":
          "sticky start-0 bg-surface-raised px-space-4 py-space-2",
      },
      ...tableColumn,
    },
  });

  type TableHeadVariant = VariantProps<typeof tableHeadVariants>["variant"];
  type TableHeadEdge = VariantProps<typeof tableHeadVariants>["edge"];
  type TableHeadFold = VariantProps<typeof tableHeadVariants>["fold"];
</script>

<script lang="ts">
  import type { HTMLThAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    variant,
    edge,
    fold,
    children,
    ...restProps
  }: WithElementRef<HTMLThAttributes> & {
    variant?: TableHeadVariant;
    edge?: TableHeadEdge;
    fold?: TableHeadFold;
  } = $props();
</script>

<th
  class={cn(tableHeadVariants({ variant, edge, fold }), className)}
  data-slot="table-head"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</th>
