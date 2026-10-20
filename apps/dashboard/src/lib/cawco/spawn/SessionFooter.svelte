<script lang="ts">
  /** Footer (§1.9): Cancel and Start. Lifetime lives in the composer's chips. */
  import { Button } from "#lib/components/ui/button/index.js";

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
</script>

<div
  class="flex flex-none items-center justify-end gap-space-2 px-space-1 pt-space-3 pb-space-row"
  data-ns-footer
>
  <Button inert={busy && !cancellable} onclick={oncancel} variant="outline">
    Cancel
  </Button>
  <!-- Pending, it takes no press and says so (the kit Button's own
       `pending`, `aria-busy` and idle guard). -->
  <Button
    class="min-w-c-btn-min-w"
    data-share="session:new"
    data-share-ttl="8000"
    {disabled}
    {failed}
    id="session-start"
    label={startLabel}
    onclick={onstart}
    pending={busy}
    pendingLabel={busyLabel}
  />
</div>
