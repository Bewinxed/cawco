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

<div
  class="flex flex-none items-center justify-end gap-space-2 px-space-1 pt-space-3 pb-space-row"
  data-ns-footer
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
    class="ns-btn touch-hit min-w-(--c-session-footer-action-w)"
    data-variant="primary"
    data-share="session:new"
    data-share-ttl="8000"
    {disabled}
    id="session-start"
    onclick={start}
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
