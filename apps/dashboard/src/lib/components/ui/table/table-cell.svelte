<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";
  import { tableColumn } from "./table.svelte";

  export const tableCellVariants = tv({
    base: "whitespace-nowrap px-space-3 py-space-2 align-middle",
    variants: {
      variant: {
        /*
         * A ledger's rows (ledger, list and view cells) stand at the 44px
         * row pitch (DESIGN.md, Density) and set their figures tabular: a
         * role's `font` shorthand resets the table's tabular numerals, and
         * `num` restores them (The Tabular Figure Rule: "Tables get tabular
         * numerals by default").
         */
        /** A list row's cell: meta text on the row's own spacing. */
        list: "type-meta num h-c-ledger-row-h px-space-3 py-space-2 text-ink-muted",
        /** A list cell that wells while its group (`group`) is open. */
        "list-opens":
          "type-meta num h-c-ledger-row-h px-space-3 py-space-2 text-ink-muted group-state-open:bg-surface-well",
        /** A ledger's cell: the row's height holds it, no block padding. */
        ledger: "type-meta num h-c-ledger-row-h px-space-3 py-0 text-ink-muted",
        /*
         * Where its table stacks (table.svelte `tableCards`), a ledger
         * cell drops its box in the card: a block of auto size, no padding
         * or border.
         */
        /** A ledger cell over a hairline. */
        "ledger-stacks":
          "type-meta num h-c-ledger-row-h border-b border-b-border-hairline px-space-3 py-0 text-ink-muted",
        /**
         * A ledger cell of a pickable row (`group/row`), its hairline gone on
         * the last row, its row's picked fill on it in the ledger.
         */
        "ledger-picks-stacks":
          "type-meta num h-c-ledger-row-h border-b border-b-border-hairline px-space-3 py-0 text-ink-muted group-last/row:border-b-none group-data-picked/row:bg-selected-bg",
        /** A generated view's cell, label text over a hairline. */
        view: "type-label num h-c-ledger-row-h border-b border-b-border-hairline px-space-3 text-ink-muted",
        /** A generated view's lead column, on the row's spacing; its words wrap. */
        "view-lead":
          "type-label num h-c-ledger-row-h whitespace-normal border-b border-b-border-hairline px-space-3 py-space-2 text-ink-muted",
        /** A matrix's cell, ruled from its neighbour on the left; its words wrap. */
        matrix:
          "whitespace-normal border-border border-l px-space-4 py-space-2",
        /** A matrix cell whose left rule goes where its row is a card. */
        "matrix-stacks": "border-border border-l px-space-4 py-space-2",
        /**
         * `matrix-stacks` whose words wrap, and that sits right under the
         * line above it in the card.
         */
        "matrix-stacks-under":
          "whitespace-normal border-border border-l px-space-4 py-space-2",
      },
      rule: {
        /** A hairline over the cell. */
        top: "border-t border-t-border-hairline",
        /** A hairline over the cells of every row after another. */
        between: "[tr+tr>&]:border-t [tr+tr>&]:border-t-border-hairline",
      },
      ...tableColumn,
    },
  });

  export type TableCellVariant = VariantProps<
    typeof tableCellVariants
  >["variant"];
  export type TableCellRule = VariantProps<typeof tableCellVariants>["rule"];
  export type TableCellEdge = VariantProps<typeof tableCellVariants>["edge"];
  export type TableCellFold = VariantProps<typeof tableCellVariants>["fold"];
</script>

<script lang="ts">
  import type { HTMLTdAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { cardOf, getTableContext } from "./table.svelte";

  let {
    ref = $bindable(null),
    class: className,
    variant,
    rule,
    edge,
    fold,
    children,
    ...restProps
  }: WithElementRef<HTMLTdAttributes> & {
    variant?: TableCellVariant;
    rule?: TableCellRule;
    edge?: TableCellEdge;
    fold?: TableCellFold;
  } = $props();

  const table = getTableContext();
  const card = $derived(
    variant ? cardOf(table.stacks)?.cell[variant] : undefined
  );
</script>

<!-- The fold after the card's own classes: a column folded in the card
     stays folded where the card makes its cells blocks. -->
<td
  class={cn(
    tableCellVariants({ variant, rule, edge }),
    card,
    fold && tableColumn.fold[fold],
    className
  )}
  data-slot="table-cell"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</td>
