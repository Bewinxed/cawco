<script lang="ts">
  /** Footer (§1.9): Cancel and Start. Lifetime lives in the composer's chips. */
  import PendingContent, {
    whileIdle,
  } from "$lib/components/ui/button/pending-content.svelte";

  let {
    oncancel,
    onstart,
    startLabel,
    busyLabel = "Starting…",
    disabled,
    busy,
    failed,
  }: {
    oncancel: () => void;
    onstart: () => void;
    startLabel: string;
    /** What the start button says while its work runs. */
    busyLabel?: string;
    disabled: boolean;
    busy: boolean;
    /** The start that just ended failed (the dialog says why): no check. */
    failed: boolean;
  } = $props();

  const start = whileIdle(
    () => busy,
    () => onstart()
  );
</script>

<div class="footer" data-ns-footer>
  <button class="ns-btn touch-hit" onclick={oncancel} type="button">
    Cancel
  </button>
  <button
    aria-busy={busy || undefined}
    aria-disabled={busy || undefined}
    class="ns-btn primary touch-hit"
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

<style>
  /* Straight on the dialog's recess: the actions need no card of their own. */
  .footer {
    flex: none;
    padding: 10px 4px 2px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  #session-start {
    min-width: 96px;
    --btn-gap: 8px;
    --btn-icon: 16px;
  }
  #session-start[aria-busy="true"] {
    pointer-events: none;
  }
  @media (max-width: 640px) {
    .footer {
      padding-bottom: max(10px, env(safe-area-inset-bottom));
    }
  }
</style>
