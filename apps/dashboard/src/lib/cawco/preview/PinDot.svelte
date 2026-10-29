<script lang="ts">
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";

  /**
   * A pin's status dot on its top end, cut round by `status-dot-cut`, placed
   * absolutely in the pin's own box: the live dot (ui/live-dot) breathing
   * on the shared breath while the agent works on it, or the needs-you dot
   * (`status-attn-glyph`) while an answer is unread, its echo three loops
   * and then still (DESIGN.md, Status dot). Drawn by the pin's mark
   * (PinMark) and by its joined face on a card's surface alike, so it
   * stands at the same place by its figure in both.
   */
  let { dot }: { dot: "live" | "unread" } = $props();
</script>

{#if dot === "live"}
  <!-- The live dot, breathing on the one shared breath as every live dot does (the owner's pick: "One breath everywhere"). -->
  <LiveDot
    class="absolute -end-space-row -top-space-row"
    cut
    data-dot="live"
    data-live
  />
{:else}
  <span
    aria-hidden="true"
    class="absolute -end-space-row -top-space-row size-(--status-dot-size) rounded-pill bg-status-attn-glyph ring-(length:--status-dot-cut) ring-surface-raised"
    data-dot="unread"
    data-unread
  >
    <!-- The needs-you dot's echo: three loops, then still. -->
    <span
      class="absolute inset-0 rounded-pill bg-status-attn-glyph opacity-0 motion-safe:opacity-100 motion-safe:animate-attn-echo"
      data-echo
    ></span>
  </span>
{/if}
