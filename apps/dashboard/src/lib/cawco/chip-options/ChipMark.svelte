<script lang="ts">
  /**
   * The chip's 18px mark slot (`--c-row-mark`): a filled identity tile
   * (`fill`, on the mark overlay, the glyph in `mark-glyph`) or the bare
   * glyph in the label's `ink-strong`, whose duotone disc holds on the
   * chip's ground in the dark where `ink-muted`'s fades (2.90 / 3.91:1 at
   * rest against 2.09 / 2.77:1). A TaskRing in the slot draws its track as
   * the duotone's second layer (`currentColor` at 50%, DESIGN.md's Solar
   * Duotone Rule) in place of its `border` hairline, which all but vanishes
   * on the chip (1.2:1). The status dot stands in its top-right corner:
   * flush with its end, so the label keeps the chip's whole gap, and
   * lowered by `--dot-y` so its top stands half the chip's pad inside the
   * chip's ground rather than past its edge. With
   * a dot the face is cut away round it (TreeMark's hole mask), so the dot
   * reads on any hue.
   */
  import type { Snippet } from "svelte";
  import ChipDot, { type DotTone } from "./ChipDot.svelte";

  let {
    fill,
    dot = null,
    children,
  }: {
    fill?: string;
    dot?: DotTone | null;
    children: Snippet;
  } = $props();
</script>

<span
  aria-hidden="true"
  class="relative size-c-row-mark flex-none"
  data-box
  data-slot="mark"
  style:--dot-y="calc((var(--status-dot-size) - var(--c-inline-chip-pad)) / 2)"
>
  <span
    class="absolute inset-0 grid place-items-center rounded-xs text-ink-strong [&_circle:first-child]:stroke-current [&_circle:first-child]:opacity-50 data-tile:bg-(color:--fill) data-tile:bg-mark-overlay data-tile:text-mark-glyph data-cut:mask-(--hole-mask)"
    data-cut={dot ? "" : undefined}
    data-slot="face"
    data-tile={fill ? "" : undefined}
    style:--fill={fill}
    style:--hole="calc(var(--status-dot-size) / 2 + var(--status-dot-cut))"
    style:--hole-mask={"radial-gradient(circle at calc(100% - var(--status-dot-size) / 2) var(--dot-y), transparent calc(var(--hole) - var(--c-tree-mark-hole-edge)), var(--mask-opaque) calc(var(--hole) + var(--c-tree-mark-hole-edge)))"}
  >
    {@render children()}
  </span>
  {#if dot}<ChipDot tone={dot} />{/if}
</span>
