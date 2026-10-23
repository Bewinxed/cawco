<script lang="ts">
  /**
   * Footer (§1.9): Cancel and Start, and why Start is held when it is,
   * beside it at the row's start (PRODUCT.md: a control that can't act is
   * disabled with the reason stated). Lifetime lives in the composer's chips.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";

  let {
    oncancel,
    onstart,
    startLabel,
    busyLabel = "Starting…",
    disabled,
    busy,
    cancellable = false,
    failed,
    held = "",
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
    /** Why Start can't go, in words the form says nowhere else; "" when it can. */
    held?: string;
  } = $props();
</script>

<div
  class="flex flex-none items-center justify-end gap-space-2 px-space-1 pt-space-3 pb-space-row"
  data-ns-footer
>
  <!-- Stands whether or not it says anything, so the row never shifts as a
       reason comes and goes; the words change through MorphText (The
       Steady Swap Rule). -->
  <p
    id="session-start-held"
    data-slot="start-held"
    aria-live="polite"
    class="type-meta m-0 min-w-0 flex-1 text-pretty text-ink-muted"
  >
    <MorphText text={held} wrap />
  </p>
  <Button inert={busy && !cancellable} onclick={oncancel} variant="outline">
    Cancel
  </Button>
  <!-- Pending, it takes no press and says so (the kit Button's own
       `pending`, `aria-busy` and idle guard). -->
  <Button
    aria-describedby={held ? "session-start-held" : undefined}
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
