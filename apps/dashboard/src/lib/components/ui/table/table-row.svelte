<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const tableRowVariants = tv({
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
        /** A row whose cells stack into a spaced, ruled grid on a phone, the body's last one too. */
        stacks:
          "max-phone:gap-x-space-3 max-phone:gap-y-space-1 max-phone:border-b max-phone:border-b-border-hairline max-phone:px-space-3 max-phone:py-space-2 max-phone:[&:is(tbody>tr):last-child]:border-b",
        /** A row that keeps a hairline under it on a phone, but the last. */
        "stacks-ruled":
          "max-phone:border-b max-phone:border-b-border-hairline max-phone:last:border-b-none max-phone:[&:is(tbody>tr):last-child]:border-b-none",
        /**
         * A pickable row: unruled at a desk, a picked, ruled grid on a phone.
         * Its picked fill outranks the base's selected one where both hold,
         * as the ledger's unlayered row rule did.
         */
        "picks-stacks":
          "border-b-none max-phone:gap-x-space-2 max-phone:gap-y-space-1 max-phone:border-b max-phone:border-b-border-hairline max-phone:px-space-3 max-phone:py-space-2 data-picked:max-phone:bg-selected-bg data-[state=selected]:data-picked:max-phone:bg-selected-bg max-phone:last:border-b-none [&:is(tbody>tr):last-child]:border-b-none",
      },
      /** A row whose subject is away (an offline machine). */
      inactive: { true: "opacity-50" },
    },
  });

  export type TableRowVariant = VariantProps<
    typeof tableRowVariants
  >["variant"];
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

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
</script>

<tr
  class={cn(tableRowVariants({ variant, inactive }), className)}
  data-slot="table-row"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</tr>
