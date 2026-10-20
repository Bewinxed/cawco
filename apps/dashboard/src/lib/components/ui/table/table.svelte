<script lang="ts" module>
  import { createContext } from "svelte";
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** What a table's sections read off its root. */
  export type TableContext = {
    /** Its rows become cards on a phone (the root's `stacks`). */
    readonly stacks: boolean;
  };
  export const [getTableContext, setTableContext] =
    createContext<TableContext>();

  /**
   * A column's variants, a head's and its cells' alike. `edge`, not
   * `align`, which is the th's and td's own deprecated attribute.
   */
  export const tableColumn = {
    /** A column on its end edge: a figure's, and a row's trailing action. */
    edge: { end: "text-end" },
    /**
     * Where a column folds away, by its own table's width
     * (`@container/table`), so a ledger fits its place and never scrolls
     * sideways.
     */
    fold: {
      /*
       * The task ledger's lesser columns, in the order they fold: each shows
       * only once the ledger holds it beside the title's floor
       * (`c-ledger-title-min`) and the columns already standing; the widths
       * are summed in build-tokens.ts CONTAINERS. Labels and Created are
       * the ones its phone card leaves out, so they fold there too; Id and
       * To-dos stand in the card, so they fold only from 640px.
       */
      /** The task ledger's Labels: from a 1102px ledger. */
      "tasks-labels": "@max-table-1102px/table:hidden",
      /** The task ledger's Created: from an 878px ledger. */
      "tasks-created": "@max-table-878px/table:hidden",
      /** The task ledger's To-dos: from a 766px ledger, and in the phone card. */
      "tasks-todos": "phone:@max-table-766px/table:hidden",
      /** The task ledger's Id: from a 670px ledger, and in the phone card. */
      "tasks-id": "phone:@max-table-670px/table:hidden",
      /**
       * In a ledger narrower than the Routines block's measure
       * (`c-block-routines`, 34rem), whose row then says it in its own line.
       */
      measure: "@max-table-34rem/table:hidden",
      /** In a ledger under 400px, where its columns take their `-narrow` widths. */
      narrow: "@max-table-400px/table:hidden",
    },
  } as const;

  export const tableVariants = tv({
    slots: {
      /**
       * The sideways scroller, and the container its columns fold by
       * (`@container/table`: a head's or cell's `fold` reads its width).
       */
      container: "@container/table relative w-full overflow-x-auto",
      table: "w-full caption-bottom text-body",
    },
    variants: {
      layout: {
        /**
         * A ledger: fixed columns, cells flush and apart, so a sticky band
         * and each row's hairline draw on their own cells.
         */
        // eslint-disable-next-line shadcn/no-raw-colors -- @shadcn/lint 0.2.3 (the latest) reads `border-spacing-0` as a border colour: its classifier's spacing scale is the theme's keys alone (dist/index.js:590 themedCnConfig), so Tailwind's numeric zero falls to the `border-` colour prefix (dist/similar.js:55 COLOR_PREFIX). tailwind-merge (cn) and Tailwind read it as border-spacing.
        ledger: { table: "table-fixed border-separate border-spacing-0" },
      },
      /**
       * Under 640px each row becomes a card (DESIGN.md, Fleet board: "Under
       * 640px each row becomes a two-line card"): the table and its
       * sections are blocks, its header hidden unless it is a `section`'s
       * band, and each `stacks` row a grid on the caller's `--card-cols`.
       */
      stacks: { true: { table: "max-phone:block" } },
      /**
       * Its band holds at the top while the block around it scrolls: the
       * container clips sideways rather than scrolling, so it is no
       * scrollport the band's `sticky` would stop at (CSS Overflow 3: clip
       * makes no scroll container). Its columns fold to fit, never scroll.
       */
      stickyBand: { true: { container: "overflow-x-clip" } },
      /** The sideways scroller fades the edges its content runs past. */
      fadeEdges: { true: { container: "kit-edge-fade" } },
    },
  });

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
    layout,
    stacks = false,
    stickyBand,
    fadeEdges,
    ...restProps
  }: WithElementRef<HTMLTableAttributes> & {
    /** The rows that are targets: one hover ghost glides between them. */
    ghostRows?: string;
    layout?: TableLayout;
    /** Its rows become cards on a phone. */
    stacks?: boolean;
    /** Its band holds while the block around it scrolls; its columns fold to fit. */
    stickyBand?: boolean;
    fadeEdges?: boolean;
  } = $props();

  setTableContext({
    get stacks() {
      return stacks;
    },
  });

  const slots = $derived(tableVariants({ layout, stacks, stickyBand, fadeEdges }));
</script>

<div
  class={slots.container()}
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
