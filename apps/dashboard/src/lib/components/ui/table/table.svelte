<script lang="ts" module>
  import { createContext } from "svelte";
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * Where a table's rows become cards (DESIGN.md, Fleet board: "Under 640px
   * each row becomes a two-line card"), by the table's own width
   * (`@container/table`), so a ledger in a narrow panel on a wide window is
   * a card too. One recipe, keyed at each tier's width: the table and its
   * body are blocks, its header hidden (or a `section`'s band, its first
   * head alone), a card row a grid on the caller's `--card-cols`, its cells
   * blocks of their own size.
   */
  export const tableCards = {
    /** Under a 640px ledger (`phone`): the board's card. */
    phone: {
      table: "@max-phone/table:block",
      body: "@max-phone/table:block",
      header: "@max-phone/table:hidden",
      section:
        "@max-phone/table:block @max-phone/table:*:flex @max-phone/table:[&_th:not(:first-child)]:hidden",
      row: {
        /** Spaced and ruled, the body's last one too (a section follows it). */
        stacks:
          "@max-phone/table:grid @max-phone/table:grid-cols-(--card-cols) @max-phone/table:items-center @max-phone/table:gap-x-space-3 @max-phone/table:gap-y-space-1 @max-phone/table:border-b @max-phone/table:border-b-border-hairline @max-phone/table:px-space-3 @max-phone/table:py-space-2 @max-phone/table:[&:is(tbody>tr):last-child]:border-b",
        /** Its cells carry its spacing; ruled but the last. */
        "stacks-ruled":
          "@max-phone/table:grid @max-phone/table:grid-cols-(--card-cols) @max-phone/table:items-center @max-phone/table:border-b @max-phone/table:border-b-border-hairline @max-phone/table:last:border-b-none @max-phone/table:[&:is(tbody>tr):last-child]:border-b-none",
        /** Picked, spaced, ruled but the last. */
        "picks-stacks":
          "@max-phone/table:grid @max-phone/table:grid-cols-(--card-cols) @max-phone/table:items-center @max-phone/table:gap-x-space-2 @max-phone/table:gap-y-space-1 @max-phone/table:border-b @max-phone/table:border-b-border-hairline data-[state=selected]:data-picked:@max-phone/table:bg-selected-bg @max-phone/table:px-space-3 @max-phone/table:py-space-2 data-picked:@max-phone/table:bg-selected-bg @max-phone/table:last:border-b-none",
      },
      cell: {
        "ledger-stacks":
          "@max-phone/table:block @max-phone/table:h-auto @max-phone/table:w-auto @max-phone/table:border-none @max-phone/table:p-0",
        "ledger-picks-stacks":
          "@max-phone/table:block @max-phone/table:h-auto @max-phone/table:w-auto @max-phone/table:min-w-0 @max-phone/table:border-none @max-phone/table:p-0 group-data-picked/row:@max-phone/table:bg-transparent",
        "matrix-stacks": "@max-phone/table:border-l-none",
        "matrix-stacks-under":
          "@max-phone/table:border-l-none @max-phone/table:pt-0",
      },
    },
    /**
     * Under a 424px ledger (`table-424px`): the routine runs ledger, where
     * Result's floor (`c-ledger-title-min`) beside When and Outcome at their
     * narrow widths no longer fits. Its ledger stands in its own frame, so
     * the last card is unruled.
     */
    narrow: {
      table: "@max-table-424px/table:block",
      body: "@max-table-424px/table:block",
      header: "@max-table-424px/table:hidden",
      section:
        "@max-table-424px/table:block @max-table-424px/table:*:flex @max-table-424px/table:[&_th:not(:first-child)]:hidden",
      row: {
        stacks:
          "@max-table-424px/table:grid @max-table-424px/table:grid-cols-(--card-cols) @max-table-424px/table:items-center @max-table-424px/table:gap-x-space-3 @max-table-424px/table:gap-y-space-1 @max-table-424px/table:border-b @max-table-424px/table:border-b-border-hairline @max-table-424px/table:px-space-3 @max-table-424px/table:py-space-2 @max-table-424px/table:[&:is(tbody>tr):last-child]:border-b-none",
      },
      cell: {
        ledger:
          "@max-table-424px/table:block @max-table-424px/table:h-auto @max-table-424px/table:w-auto @max-table-424px/table:border-none @max-table-424px/table:p-0",
      },
    },
  } as const;
  export type TableStacks = keyof typeof tableCards;
  type TableCard = {
    table: string;
    body: string;
    header: string;
    section: string;
    row: Partial<Record<string, string>>;
    cell: Partial<Record<string, string>>;
  };
  /** The card classes of a table's tier for one part; none when it doesn't stack. */
  export const cardOf = (stacks: TableStacks | undefined): TableCard | null =>
    stacks ? tableCards[stacks] : null;

  /** What a table's sections read off its root. */
  export type TableContext = {
    /** Where its rows become cards (the root's `stacks`); undefined: never. */
    readonly stacks: TableStacks | undefined;
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
      /*
       * A fold that holds in the card names the card's tier too: a card
       * cell is a block at that tier, and the fold comes after it.
       */
      /** The task ledger's Labels: from a 1102px ledger, never in the card. */
      "tasks-labels":
        "@max-table-1102px/table:hidden @max-phone/table:hidden",
      /** The task ledger's Created: from an 878px ledger, never in the card. */
      "tasks-created": "@max-table-878px/table:hidden @max-phone/table:hidden",
      /** The task ledger's To-dos: from a 766px ledger, and in the card. */
      "tasks-todos": "@phone/table:@max-table-766px/table:hidden",
      /** The task ledger's Id: from a 670px ledger, and in the card. */
      "tasks-id": "@phone/table:@max-table-670px/table:hidden",
      /*
       * The routine runs ledger's, by the same rule, Result its floor: When
       * (96px) and Outcome (176px) stand beside it, Took (80px) from
       * 96 + 176 + 80 + 224 = 576px; under 496px When and Outcome take their
       * narrow widths (72px, 128px, at the site), and under 424px it is a
       * card (`stacks="narrow"`).
       */
      /** The runs ledger's Took: from a 576px ledger, never in the card. */
      "runs-took":
        "@max-table-576px/table:hidden @max-table-424px/table:hidden",
      /**
       * In a ledger narrower than the Routines block's measure
       * (`c-block-routines`, 34rem), whose row then says it in its own line.
       */
      measure: "@max-table-34rem/table:hidden",
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
    stacks,
    stickyBand,
    fadeEdges,
    ...restProps
  }: WithElementRef<HTMLTableAttributes> & {
    /** The rows that are targets: one hover ghost glides between them. */
    ghostRows?: string;
    layout?: TableLayout;
    /** Where its rows become cards, by its own width (`tableCards`). */
    stacks?: TableStacks;
    /** Its band holds while the block around it scrolls; its columns fold to fit. */
    stickyBand?: boolean;
    fadeEdges?: boolean;
  } = $props();

  setTableContext({
    get stacks() {
      return stacks;
    },
  });

  const slots = $derived(tableVariants({ layout, stickyBand, fadeEdges }));
</script>

<div
  class={slots.container()}
  data-slot="table-container"
  {@attach ghostRows ? highlight({ rows: ghostRows }) : undefined}
>
  <table
    class={cn(slots.table(), cardOf(stacks)?.table, className)}
    data-slot="table"
    bind:this={ref}
    {...restProps}
  >
    {@render children?.()}
  </table>
</div>
