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
  data-resolved={resolved || undefined}
  class="inline-grid place-items-center shrink-0 size-c-pin rounded-pill bg-action-solid text-on-action type-label num data-resolved:opacity-40 data-moved:bg-surface-fill data-moved:text-ink-muted"
  >{number}</span
>
