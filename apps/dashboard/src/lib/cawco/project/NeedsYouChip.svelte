<script lang="ts">
  /**
   * Needs you, the project page's filter: a real button in the needs-you
   * tint, never coral (that is where you act), as the needs-you tile is.
   * Pressed, the filter is on and its edge takes the attention glyph's ink
   * over --dur-control. The view strip draws it after its tabs; on a phone
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
  aria-pressed={on}
  class={[
    "mark-line pressable type-label inline-flex h-c-btn-h-sm flex-none items-center gap-space-2 rounded-md border border-transparent bg-status-attn-bg px-space-3 text-status-attn-ink transition-[background-color,color,border-color] dur-control ease-out aria-pressed:border-status-attn-glyph",
    className,
  ]}
  onclick={ontoggle}
  type="button"
  in:crossIn
  out:crossOut
>
  <IconNeedsYou
    aria-hidden="true"
    class="size-icon-md text-status-attn-glyph"
  />
  <span>Needs you</span>
  <span data-slot="num" class="num text-status-attn-ink">{count}</span>
</button>
