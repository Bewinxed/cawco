<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  export const tableHeadVariants = tv({
    base: "h-12 whitespace-nowrap px-3 text-left align-middle text-ink-strong text-label [&:has([role=checkbox])]:pr-0",
    variants: {
      variant: {
        /** A band's column heading: muted caps in the label role. */
        caps: "type-label px-space-3 text-ink-muted uppercase tracking-caps",
        /** The lead column's caps heading, flush against the next. */
        "caps-lead":
          "type-label px-space-3 pe-0 text-ink-muted uppercase tracking-caps",
        /** Muted caps at the kit's own label size and strong weight. */
        "caps-strong": "px-space-3 text-ink-muted uppercase tracking-caps",
        /** A matrix's corner heading. */
        "matrix-corner": "px-space-4 py-space-3 text-ink-muted text-meta",
        /** A matrix's corner heading pinned to the left edge as it scrolls. */
        "matrix-corner-pinned":
          "left-0 bg-surface-raised px-space-4 py-space-3 text-ink-muted text-meta",
        /** A matrix's column heading, ruled on the left. */
        "matrix-column":
          "border-border border-l px-space-4 py-space-3 text-ink-muted text-meta",
        /** A wide matrix column's heading. */
        "matrix-column-wide":
          "min-w-56 border-border border-l px-space-4 py-space-3 text-ink-muted text-meta",
        /** A wide matrix column's heading whose content sets its own text. */
        "matrix-column-wide-plain":
          "min-w-56 border-border border-l px-space-4 py-space-3",
        /** A matrix's row heading on the raised surface. */
        "matrix-row": "bg-surface-raised px-space-4 py-space-2",
        /** A matrix's row heading pinned to the left edge as it scrolls. */
        "matrix-row-pinned": "left-0 bg-surface-raised px-space-4 py-space-2",
      },
    },
  });

  export type TableHeadVariant = VariantProps<
    typeof tableHeadVariants
  >["variant"];
</script>

<script lang="ts">
  import type { HTMLThAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    variant,
    children,
    ...restProps
  }: WithElementRef<HTMLThAttributes> & {
    variant?: TableHeadVariant;
  } = $props();
</script>

<th
  class={cn(tableHeadVariants({ variant }), className)}
  data-slot="table-head"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</th>
