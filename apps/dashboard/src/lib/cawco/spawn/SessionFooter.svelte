<script lang="ts">
  /** Footer (§1.9): Cancel and Start. Lifetime lives in the composer's chips. */
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";

  let {
    oncancel,
    onstart,
    startLabel,
    busyLabel = "Starting…",
    disabled,
    busy,
    cancellable = false,
    failed,
  }: {
    oncancel: () => void;
    onstart: () => void;
    startLabel: string;
    /** What the start button says while its work runs. */
    busyLabel?: string;
    disabled: boolean;
    busy: boolean;
    /** The running work can be cancelled: Cancel stays live while busy. */
    cancellable?: boolean;
    /** The start that just ended failed (the dialog says why): no check. */
    failed: boolean;
  } = $props();

  const start = whileIdle(
    () => busy,
    () => onstart()
  );
</script>

<!-- literal: 10px top padding, 8px gap, 96px minimum width -->
<div
  class="flex flex-none items-center justify-end gap-(--gap) px-space-1 pt-(--pad-top) pb-space-row"
  data-ns-footer
  style:--gap="8px"
  style:--pad-top="10px"
>
  <button
    class="ns-btn touch-hit"
    inert={busy && !cancellable}
    onclick={oncancel}
    type="button"
  >
    Cancel
  </button>
  <button
    data-slot="primary"
    aria-busy={busy || undefined}
    aria-disabled={busy || undefined}
    class="ns-btn primary touch-hit min-w-(--min-w)"
    data-share="session:new"
    data-share-ttl="8000"
    {disabled}
    id="session-start"
    onclick={start}
    style:--min-w="96px"
    type="button"
  >
    <PendingContent
      {failed}
      label={startLabel}
      pending={busy}
      pendingLabel={busyLabel}
    />
  </button>
</div>
