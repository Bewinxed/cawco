<script lang="ts" module>
  import { tv } from "#lib/utils.js";

  export const tableHeaderVariants = tv({
    base: "[&_tr]:border-b",
    variants: {
      stacks: { true: "" },
      /**
       * A band that heads its own body, a section of the ledger. Where the
       * rows are cards it stays as the section's title, its first head
       * alone on the band's row.
       */
      section: { true: "" },
    },
    compoundVariants: [
      /* Column heads name nothing in a card. */
      { stacks: true, section: false, class: "max-phone:hidden" },
      {
        stacks: true,
        section: true,
        class:
          "max-phone:block max-phone:*:flex max-phone:[&_th:not(:first-child)]:hidden",
      },
    ],
  });
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { getTableContext } from "./table.svelte";

  let {
    ref = $bindable(null),
    class: className,
    section = false,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> & {
    /** It heads its own body: on a phone its first head titles the section. */
    section?: boolean;
  } = $props();

  const table = getTableContext();
</script>

<thead
  class={cn(
    tableHeaderVariants({ stacks: table.stacks, section }),
    className
  )}
  data-slot="table-header"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</thead>
