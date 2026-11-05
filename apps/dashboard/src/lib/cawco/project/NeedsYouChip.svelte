<script lang="ts">
  /**
   * Needs you, the project's one count of what waits on the person (the
   * owner's rule 7): a bare control in the head, its mark in the attention
   * glyph's spark and its count in the attention ink, never a surface
   * filled in its hue (DESIGN.md, Needs you: "a mark, never a surface …
   * with no card, row, chip or well filled in its hue") and never coral
   * (that is where you act). A press opens the next thing that waits,
   * where it stands (ProjectPage `nextWait`). Where the head is compact
   * (`data-form="compact"`) its glyph and count stand alone, named in its
   * tooltip. The page leaves it out while nothing needs you.
   */
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";

  let {
    count,
    onopen,
    class: className,
  }: {
    count: number;
    /** Opens the next thing that waits. */
    onopen: () => void;
    class?: string;
  } = $props();
</script>

<button
  data-slot="needs"
  aria-label={`Needs you, ${count}`}
  class={cn(
    "select-none touch-hit mark-line type-label inline-flex h-c-btn-h-sm flex-none items-center gap-space-2 rounded-md bg-transparent px-space-3 in-form-compact:px-space-2 text-status-attn-ink hover:bg-surface-hover transition-[background-color,color] duration-(--dur-control) ease-out motion-safe:active:transform-(--tpress)",
    className
  )}
  style:--tpress="scale(var(--press-scale))"
  onclick={onopen}
  title="Needs you"
  type="button"
  in:crossIn
  out:crossOut
>
  <IconNeedsYou
    aria-hidden="true"
    class="size-icon-md text-status-attn-glyph"
  />
  <span class="in-form-compact:hidden">Needs you</span>
  <span data-slot="num" class="num text-status-attn-ink">{count}</span>
</button>
