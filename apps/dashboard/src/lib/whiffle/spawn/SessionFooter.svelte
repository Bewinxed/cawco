<script lang="ts">
  /** Footer (§1.9): Cancel and Start. Lifetime lives in the composer's chips. */
  let {
    oncancel,
    onstart,
    startLabel,
    busyLabel = "Starting…",
    disabled,
    busy,
  }: {
    oncancel: () => void;
    onstart: () => void;
    startLabel: string;
    /** What the start button says while its work runs. */
    busyLabel?: string;
    disabled: boolean;
    busy: boolean;
  } = $props();
</script>

<div class="footer" data-ns-footer>
  <button class="ns-btn touch-hit" onclick={oncancel} type="button">
    Cancel
  </button>
  <button
    aria-busy={busy}
    class="ns-btn primary touch-hit"
    {disabled}
    id="session-start"
    onclick={onstart}
    type="button"
  >
    {busy ? busyLabel : startLabel}
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
  }
  @media (max-width: 640px) {
    .footer {
      padding-bottom: max(10px, env(safe-area-inset-bottom));
    }
  }
</style>
