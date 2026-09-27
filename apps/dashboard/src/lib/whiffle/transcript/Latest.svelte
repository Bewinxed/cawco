<script lang="ts">
  /**
   * The way back to the newest row, while the reader is scrolled away from it.
   * The transcript never moves under someone reading history — new rows land
   * below, out of sight — so this is what says there is more, and takes them
   * there in one glide.
   */
  import IconArrowDown from "~icons/solar/arrow-down-bold-duotone";

  let { onjump }: { onjump: () => void } = $props();
</script>

<button class="latest pressable" onclick={onjump} type="button">
  <IconArrowDown />Jump to latest
</button>

<style>
  .latest {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    cursor: pointer;

    & :global(svg) {
      inline-size: 15px;
      block-size: 15px;
    }

    @media (hover: hover) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    /* The catch-up's own entrance: it fades in where it stands. */
    @media (prefers-reduced-motion: no-preference) {
      animation: cu-in var(--dur-panel) var(--ease-out) both;
    }
  }
  @keyframes cu-in {
    from {
      opacity: 0;
    }
  }
</style>
