<script lang="ts">
  /**
   * tsk-3's numbered pin as the pane draws it, the overlay's disc on the
   * page: a 20px coral disc, its number in `on-action`; at 40% once
   * resolved; recessed in the moved tray.
   */
  let {
    number,
    resolved = false,
    moved = false,
  }: { number: number; resolved?: boolean; moved?: boolean } = $props();
</script>

<span
  data-moved={moved || undefined}
  aria-hidden="true"
  class={["disc", resolved && "resolved", moved && "moved"]}>{number}</span
>

<style>
  .disc {
    display: inline-grid;
    place-items: center;
    flex-shrink: 0;
    width: var(--c-pin);
    height: var(--c-pin);
    border-radius: var(--radius-pill);
    background: var(--action-solid);
    color: var(--on-action);
    font: var(--type-label);
    font-variant-numeric: tabular-nums;
  }
  .resolved {
    opacity: 0.4;
  }
  .moved {
    background: var(--surface-fill);
    color: var(--ink-muted);
  }
</style>
