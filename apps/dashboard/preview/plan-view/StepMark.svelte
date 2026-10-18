<script lang="ts">
  /**
   * A session's own step's mark, PlanTree's three: an open ring to do, the
   * live dot breathing while it is under way, the house tick drawn along its
   * stroke once it is done. The proposal's rows and the page's key draw it.
   */
  import { IconTick } from "#lib/icons.js";

  let { state }: { state: "todo" | "doing" | "done" } = $props();
</script>

{#if state === "done"}
  <IconTick aria-hidden="true" class="step-tick" />
{:else}
  <span data-slot="dot" class="dot" data-live={state === "doing" || undefined}
  ></span>
{/if}

<style>
  .dot {
    inline-size: var(--status-dot-size);
    block-size: var(--status-dot-size);
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--ink-muted);

    &[data-live] {
      box-shadow: none;
      background: var(--status-live-glyph);
    }
  }
  :global(.step-tick) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--status-done-glyph);
  }
  @media (prefers-reduced-motion: no-preference) {
    .dot[data-live] {
      animation: step-breath var(--breath) var(--ease-in-out) infinite;
    }
    :global(.step-tick path) {
      stroke-dasharray: 20;
      animation: step-tick var(--dur-toggle) var(--ease-out) both;
    }
  }
  @keyframes step-breath {
    50% {
      scale: 0.7;
    }
  }
  @keyframes step-tick {
    from {
      stroke-dashoffset: 20;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
