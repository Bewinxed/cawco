<script lang="ts">
  /**
   * Needs you, the project page's filter: a bare control, its mark in the
   * attention glyph's spark and its count in the attention ink, never a
   * surface filled in its hue (DESIGN.md, Needs you: "a mark, never a
   * surface … with no card, row, chip or well filled in its hue") and never
   * coral (that is where you act). Pressed, the filter is on and its edge
   * takes the attention glyph's ink over --dur-control. In the view strip
   * (`data-form="compact"`) it is a toolbar item, its glyph and count alone,
   * named in its tooltip. The view strip draws it after its tabs; on a phone
   * the views' bar draws it beside its pill (ViewBar), at the bar's control
   * height. The page leaves it out while nothing needs you.
   */
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { IconNeedsYou } from "#lib/icons.js";

  let {
    count,
    on,
    ontoggle,
    class: className,
  }: {
    count: number;
    /** The filter is on. */
    on: boolean;
    ontoggle: () => void;
    class?: string;
  } = $props();
</script>

<button
  data-slot="needs"
  aria-label={`Needs you, ${count}`}
  aria-pressed={on}
  class={[
    "select-none mark-line type-label inline-flex h-c-btn-h-sm flex-none items-center gap-space-2 rounded-md border border-transparent bg-transparent px-space-3 in-form-compact:px-space-2 text-status-attn-ink hover:bg-surface-hover transition-[background-color,color,border-color] duration-(--dur-control) ease-out motion-safe:active:transform-(--tpress) aria-pressed:border-status-attn-glyph",
    className,
  ]}
  style:--tpress="scale(var(--press-scale))"
  onclick={ontoggle}
  title="Needs you"
  type="button"
  in:crossIn
  out:crossOut
>
  <IconNeedsYou
    aria-hidden="true"
    class="size-icon-md text-status-attn-glyph"
  />
  <!-- In the view strip (`data-form="compact"`) its glyph and count stand
       alone. -->
  <span class="in-form-compact:hidden">Needs you</span>
  <span data-slot="num" class="num text-status-attn-ink">{count}</span>
</button>
