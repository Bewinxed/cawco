<script lang="ts">
  /**
   * The chip's 18px mark slot (`--c-row-mark`): a filled identity tile
   * (`fill`, on the mark overlay, the glyph in `mark-glyph`) or the bare
   * glyph in `ink-muted`, with the status dot at its top-right corner,
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
    class="absolute inset-0 grid place-items-center rounded-xs text-ink-muted data-tile:bg-(color:--fill) data-tile:bg-mark-overlay data-tile:text-mark-glyph data-cut:mask-(--hole-mask)"
    data-cut={dot ? "" : undefined}
    data-slot="face"
    data-tile={fill ? "" : undefined}
    style:--fill={fill}
    style:--hole="calc(var(--status-dot-size) / 2 + var(--status-dot-cut))"
    style:--hole-mask={"radial-gradient(circle at 100% var(--dot-y), transparent calc(var(--hole) - var(--c-tree-mark-hole-edge)), var(--mask-opaque) calc(var(--hole) + var(--c-tree-mark-hole-edge)))"}
  >
    {@render children()}
  </span>
  {#if dot}<ChipDot tone={dot} />{/if}
</span>
