<script lang="ts">
  /**
   * The assistant's summon in the phone's top bar. On a desktop the rail
   * carries it as a row beside "New session"; on the phone the rail is behind
   * the menu button, so the bar keeps it one tap away. It is dressed like its
   * neighbour Jump — hairline, raised surface — and only its glyph takes the
   * accent, so the bar reads as one row of controls, not a lone blue slab.
   */
  import { IconAssistant } from "$lib/icons";

  let {
    onclick,
    open = false,
  }: {
    onclick: () => void;
    open: boolean;
  } = $props();
</script>

<button
  aria-expanded={open}
  aria-label={open ? 'Close assistant' : 'Open assistant'}
  class="orb touch-hit"
  {onclick}
  title="Assistant"
  type="button"
>
  <IconAssistant />
</button>

<style>
  .orb {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--accent-11);
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
  .orb:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
</style>
