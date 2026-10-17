<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const tableCellVariants = tv({
    base: "whitespace-nowrap p-3 align-middle [&:has([role=checkbox])]:pr-0",
    variants: {
      variant: {
        /** A list row's cell: meta text on the row's own spacing. */
        list: "type-meta px-space-3 py-space-2 text-ink-muted",
        /** A list's lead column (its mark), flush against the next. */
        "list-lead": "type-meta px-space-3 py-space-2 pe-0 text-ink-muted",
        /** A list cell that wells while its group (`group`) is open. */
        "list-opens":
          "type-meta px-space-3 py-space-2 text-ink-muted group-state-open:bg-surface-well",
        /** A ledger's cell: the row's height holds it, no block padding. */
        ledger: "type-meta px-space-3 py-0 text-ink-muted",
        /** A ledger cell over a hairline that drops its box on a phone. */
        "ledger-stacks":
          "type-meta border-b border-b-border-hairline px-space-3 py-0 text-ink-muted max-phone:border-current max-phone:border-none max-phone:p-0",
        /** A ledger cell of a pickable row (`group/row`), its hairline gone on the last row. */
        "ledger-picks":
          "type-meta border-b border-b-border-hairline px-space-3 py-0 text-ink-muted group-last/row:border-b-none group-data-picked/row:bg-selected-bg group-data-picked/row:max-phone:bg-transparent",
        /** `ledger-picks` that also drops its box on a phone. */
        "ledger-picks-stacks":
          "type-meta border-b border-b-border-hairline px-space-3 py-0 text-ink-muted group-last/row:border-b-none group-data-picked/row:bg-selected-bg max-phone:min-w-0 max-phone:border-current max-phone:border-none max-phone:p-0 group-data-picked/row:max-phone:bg-transparent",
        /** A generated view's cell, label text over a hairline. */
        view: "type-label border-border-hairline border-b px-space-3 text-ink-muted",
        /** A generated view's lead column, on the row's spacing. */
        "view-lead":
          "type-label border-border-hairline border-b px-space-3 py-space-2 text-ink-muted",
        /** A matrix's cell, ruled from its neighbour on the left. */
        matrix: "border-border border-l px-space-4 py-space-2",
        /** A matrix cell whose left rule goes when the row stacks on a phone. */
        "matrix-stacks":
          "border-border border-l px-space-4 py-space-2 max-phone:border-l-none",
        /** `matrix-stacks` that sits right under the line above it on a phone. */
        "matrix-stacks-under":
          "border-border border-l px-space-4 py-space-2 max-phone:border-l-none max-phone:pt-0",
      },
      rule: {
        /** A hairline over the cell. */
        top: "border-t border-t-border-hairline",
        /** A hairline over every row's cells but the first's (`group/row`). */
        between:
          "group-not-first/row:border-t group-not-first/row:border-t-border-hairline",
      },
    },
  });

  export type TableCellVariant = VariantProps<
    typeof tableCellVariants
  >["variant"];
  export type TableCellRule = VariantProps<typeof tableCellVariants>["rule"];
</script>

<script lang="ts">
  import type { HTMLTdAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    variant,
    rule,
    children,
    ...restProps
  }: WithElementRef<HTMLTdAttributes> & {
    variant?: TableCellVariant;
    rule?: TableCellRule;
  } = $props();
</script>

<td
  class={cn(tableCellVariants({ variant, rule }), className)}
  data-slot="table-cell"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</td>
