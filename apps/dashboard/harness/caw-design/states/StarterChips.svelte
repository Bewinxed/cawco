<script lang="ts">
  /**
   * PROPOSED (suggestions, C1; pin: "each suggestion is a screen-wide card
   * even though it takes up 20% of its space"): the project's starters as
   * the kit option chip (app.css `.kit-chip` in a `.kit-chips` row), each
   * carrying a short label of three to five words with its glyph leading,
   * so chips stand side by side and wrap like words, from the panel's start
   * edge (the message box's), directly above it. The full sentence is the
   * chip's tooltip and its accessible name, and a press puts the sentence,
   * not the label, in the message box, unsent.
   *
   * What it changes from the shipped CawStarters: a label beside the
   * sentence (STARTER_LABELS), the row on the start edge (it centres), one
   * glyph treatment (16px, ink-muted, the duotone's second layer at the
   * status glyphs' weight), and the press to --press-scale (The Press Rule).
   */
  import { GLYPHS } from "#lib/cawco/project/StarterCards.svelte";
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { STARTER_LABELS } from "./fixtures";

  let {
    starters,
    onpick,
  }: { starters: Starter[]; onpick: (text: string) => void } = $props();
</script>

<ul aria-label="Things to ask Caw" class="chips kit-chips" data-design-chips>
  {#each starters as starter (starter.text)}
    {@const Glyph = GLYPHS[starter.glyph]}
    <li>
      <Tip label={starter.text}>
        {#snippet children(tip)}
          <button
            {...tip}
            aria-label={starter.text}
            class="kit-chip touch-hit"
            onclick={() => onpick(starter.text)}
            type="button"
          >
            <Glyph aria-hidden="true" class="glyph" />
            <span>{STARTER_LABELS[starter.text] ?? starter.text}</span>
          </button>
        {/snippet}
      </Tip>
    </li>
  {/each}
</ul>

<style>
  .chips {
    justify-content: flex-start;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chips li {
    display: flex;
    max-inline-size: 100%;
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
  .chips :global(.glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  .chips :global(.glyph [opacity]) {
    opacity: var(--glyph-duo-status-opacity);
  }
</style>
