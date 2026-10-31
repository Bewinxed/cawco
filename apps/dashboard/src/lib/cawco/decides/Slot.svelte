<script lang="ts" module>
  /**
   * Where the list opens under the pressed card: `card` on both its edges,
   * one column; `across` from the card's edge and on over the next column
   * (back over the one before where no next column stands), so it always
   * starts or ends on the card it came from. One column: the card's own width.
   */
  export type SlotPlacement = "card" | "across";

  /** The list's first column (1-based) and how many it spans, for a card in `col` (0-based) of `cols`. */
  export const slotPlace = (
    placement: SlotPlacement,
    col: number,
    cols: number
  ): { span: number; start: number } => {
    const span = placement === "across" ? Math.min(2, cols) : 1;
    return { span, start: Math.min(col, cols - span) + 1 };
  };
</script>

<script lang="ts">
  /**
   * The one slot under a line of the roster: a cell across the whole line,
   * holding the list on the columns `slotPlace` names, its head joined to the
   * pressed card (MemberCard `joined`), so the two read as one shape. The
   * lines after it move down together as it grows; no other card moves.
   */
  import type { Snippet } from "svelte";
  import { unfold } from "../motion/fold.svelte";

  let {
    id,
    label,
    col,
    cols,
    placement,
    children,
  }: {
    children: Snippet;
    /** The pressed card's column, 0-based. */
    col: number;
    cols: number;
    id: string;
    label: string;
    placement: SlotPlacement;
  } = $props();

  const place = $derived(slotPlace(placement, col, cols));
</script>

<div
  class="col-span-full grid min-w-0 grid-cols-subgrid"
  in:unfold|global
  out:unfold|global
>
  <section
    aria-label={label}
    class="relative z-1 col-span-(--slot-span) col-start-(--slot-start) min-w-0 rounded-lg bg-surface-raised p-space-3 shadow-tile outline-none data-joined-end:rounded-se-none data-joined-start:rounded-ss-none"
    data-joined-end={place.start + place.span - 1 === col + 1 || undefined}
    data-joined-start={place.start === col + 1 || undefined}
    data-placement={placement}
    data-slot="handover"
    {id}
    style:--slot-span={place.span}
    style:--slot-start={place.start}
    tabindex="-1"
  >
    {@render children()}
  </section>
</div>
