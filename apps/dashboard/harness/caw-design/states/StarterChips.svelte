<script lang="ts">
  /**
   * PROPOSED (suggestions, C1; pin: "each suggestion is a screen-wide card
   * even though it takes up 20% of its space"): the project's starters as
   * the real CawStarters, the kit option chip with its glyph leading, each
   * as wide as its words plus --space-3 a side, wrapping whole chips from
   * the panel's start edge, directly above the message box. Two changes to
   * the shipped component, proposed with it:
   *
   * - The row starts at the start edge (CawStarters centres it under Caw).
   * - A sentence wider than the panel wraps inside its chip, its lines
   *   balanced (`text-wrap: pretty`), never cut; the chip presses to
   *   --press-scale (The Press Rule).
   */
  import CawStarters from "#lib/cawco/project/CawStarters.svelte";
  import type { Starter } from "#lib/cawco/project-tasks.js";

  let {
    starters,
    onpick,
  }: { starters: Starter[]; onpick: (text: string) => void } = $props();
</script>

<div class="chips" data-design-chips>
  <CawStarters {onpick} {starters} />
</div>

<style>
  .chips {
    min-inline-size: 0;
  }
  .chips :global([data-slot="caw-starters"]) {
    justify-content: flex-start;
  }
  .chips :global(.kit-chip) {
    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--dur-control) var(--ease-out),
        scale var(--dur-control) var(--ease-out);
    }
    &:active {
      scale: var(--press-scale);
    }
  }
  .chips :global(.kit-chip > span) {
    text-wrap: pretty;
  }
</style>
