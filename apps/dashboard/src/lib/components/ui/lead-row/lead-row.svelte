<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * One row of a list that reads down fixed columns (DESIGN.md, Alignment):
   * its mark in the lead column, centred on the first line of its words
   * (`mark-cell` on the `mark-line` recipe); its words from one edge,
   * wrapping there; its trailing cells at the row's end, each a `LeadCell`
   * of a fixed width, so a count or a mark stands under the same one on
   * every row; and under it what hangs from it (`below`: a nested list, a
   * fold's rows) across the row's whole width, so a row hung under another
   * puts its mark in the same lead column and its words on the same edge.
   * However deep the list nests, its marks stand in one column and its
   * words start on one edge (`c-lead-text` in from the row's); what a row
   * hangs under says it by its type role (`sub`), never by an indent.
   *
   * The lead column is a session's tile wide (c-row-mark), a status glyph
   * centred in it, and the words start a step after it (space-3), past the
   * tile's status dot at its corner; the trailing cells start a step after
   * the words (space-2), each a step from the next.
   *
   * - `step`: `row`, a row of a list in the label role; `sub`, a row hung
   *   under another, in the meta role, its block padding halved; `head`, a
   *   group's head row, room above it and none under, its rows hung under
   *   it.
   *
   * The row is its own stacking context, so a control in its words may lay
   * its hit area (`after:`) under the whole row and its fill behind the
   * words. The element is the caller's list item; what is pressed inside it
   * (the words as a button or a link, a trailing control) is the caller's.
   */
  const leadRowVariants = tv({
    base: "mark-line relative isolate grid grid-cols-[var(--spacing-c-row-mark)_minmax(0,1fr)_auto] gap-x-space-3 [grid-template-areas:'lead_text_ends'_'below_below_below']",
    variants: {
      step: {
        row: "type-label py-space-2",
        sub: "type-meta py-space-1",
        head: "type-label pt-space-2",
      },
    },
    defaultVariants: { step: "row" },
  });

  type LeadRowLooks = VariantProps<typeof leadRowVariants>;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLLiAttributes } from "svelte/elements";

  let {
    step,
    mark,
    children,
    ends,
    below,
    ...rest
  }: Omit<HTMLLiAttributes, "class"> & {
    step?: LeadRowLooks["step"];
    /** The row's mark: a state glyph, a session's mark. */
    mark?: Snippet;
    /** Its words. */
    children: Snippet;
    /** Its trailing cells, each a `LeadCell`. */
    ends?: Snippet;
    /** What hangs from the row, under its words. */
    below?: Snippet;
  } = $props();
</script>

<li data-slot="lead-row" class={leadRowVariants({ step })} {...rest}>
  <span data-slot="lead" class="mark-cell [grid-area:lead]"
    >{@render mark?.()}</span
  >
  <div data-slot="text" class="min-w-0 [grid-area:text]">
    {@render children()}
  </div>
  {#if ends}
    <span
      data-slot="ends"
      class="mark-cell flex gap-space-2 ps-space-2 [grid-area:ends]"
      >{@render ends()}</span
    >
  {/if}
  {#if below}
    <div data-slot="below" class="min-w-0 [grid-area:below]" data-box>
      {@render below()}
    </div>
  {/if}
</li>
