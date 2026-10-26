<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const tableRowVariants = tv({
    base: "border-b transition-colors data-[state=selected]:bg-neutral-2",
    variants: {
      variant: {
        /** The header's band: no rule, on the band surface. */
        band: "border-0 bg-surface-band",
        /*
         * A body's last row: TableBody's `[&_tr:last-child]:border-0` (0,2,1)
         * writes every side's width and style there. Where a row's own bottom
         * must hold on that row too, it is restated at
         * `[&:is(tbody>tr):last-child]` (0,2,2), as the ledgers' unlayered row
         * rules held it.
         */
        /** A row with its bottom rule taken away, the body's last one too. */
        unruled: "border-b-none [&:is(tbody>tr):last-child]:border-b-none",
        /*
         * The card rows (a `stacks` table's): where its table's tier makes
         * cards (table.svelte `tableCards`), the row is a grid on its
         * table's `--card-cols`, its cells on one centre line. As a row of
         * the ledger they draw as follows.
         */
        /** A card where its table stacks; a plain row otherwise. */
        stacks: "",
        /** A card whose cells carry its spacing; a plain row otherwise. */
        "stacks-ruled": "",
        /**
         * A pickable row: unruled in the ledger, a picked, ruled card where
         * its table stacks. Its picked fill outranks the base's selected one
         * where both hold, as the ledger's unlayered row rule did.
         */
        "picks-stacks":
          "border-b-none [&:is(tbody>tr):last-child]:border-b-none",
      },
      /** A row whose subject is away (an offline machine). */
      inactive: { true: "opacity-50" },
    },
  });

  type TableRowVariant = VariantProps<typeof tableRowVariants>["variant"];
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { cardOf, getTableContext } from "./table.svelte";

  let {
    ref = $bindable(null),
    class: className,
    variant,
    inactive,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLTableRowElement>> & {
    variant?: TableRowVariant;
    inactive?: boolean;
  } = $props();

  const table = getTableContext();
  const card = $derived(
    variant ? cardOf(table.stacks)?.row[variant] : undefined
  );
</script>

<tr
  class={cn(tableRowVariants({ variant, inactive }), card, className)}
  data-slot="table-row"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</tr>
