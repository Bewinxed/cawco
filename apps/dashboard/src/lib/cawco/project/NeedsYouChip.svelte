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
  class={["needs mark-line pressable", className]}
  onclick={ontoggle}
  type="button"
  in:crossIn
  out:crossOut
>
  <IconNeedsYou aria-hidden="true" />
  <span>Needs you</span>
  <span data-slot="num" class="num">{count}</span>
</button>

<style>
  .needs {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: var(--status-attn-bg);
    font: var(--type-label);
    color: var(--status-attn-ink);
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      border-color var(--dur-control) var(--ease-out);
  }
  .needs :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--status-attn-glyph);
  }
  .num {
    color: var(--status-attn-ink);
  }
  .needs[aria-pressed="true"] {
    border-color: var(--status-attn-glyph);
  }
</style>
