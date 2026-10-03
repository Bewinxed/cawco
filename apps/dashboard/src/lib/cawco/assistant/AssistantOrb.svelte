<script lang="ts">
  /**
   * The assistant's summon in the phone's top bar. On a desktop the rail
   * carries it as a row beside "New session"; on the phone the rail is behind
   * the menu button, so the bar keeps it one tap away. It is dressed like its
   * neighbour Jump — hairline, raised surface — and only its glyph takes the
   * accent, so the bar reads as one row of controls, not a lone blue slab.
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconAssistant } from "#lib/icons.js";

  let {
    onclick,
    open = false,
  }: {
    onclick: () => void;
    open: boolean;
  } = $props();
</script>

<Tip keys="⌘J" label={open ? "Close assistant" : "Open assistant"}>
  {#snippet children(
    tip
  )}
    <button
      {...tip}
      aria-expanded={open}
      aria-label={open ? "Close assistant" : "Open assistant"}
      class="orb touch-hit"
      data-assistant-orb
      {onclick}
      type="button"
    >
      <IconAssistant />
    </button>
  {/snippet}
</Tip>

<style>
  .orb {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--coral-11);
    cursor: pointer;
    transition: background var(--dur-control) var(--ease-in-out);
  }
  .orb :global(svg) {
    width: 16px;
    height: 16px;
  }
  .orb[aria-expanded="true"] {
    background: var(--surface-hover);
  }
  .orb:active {
    background: var(--surface-hover);
  }
</style>
