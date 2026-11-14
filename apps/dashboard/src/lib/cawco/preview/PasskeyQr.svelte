<script lang="ts">
  /**
   * Passkey relay status overlay: shown over a browser view when a passkey
   * ceremony is in flight.  It tells the person what the fleet is doing
   * (scanning on which machines, captured, timed out, no BLE) and shows
   * guidance when the fleet can't help (scan the QR with your phone, or
   * install the Chrome extension).
   */
  import type { BrowserKey, PasskeyStatusFrame } from "@cawco/core/browser";
  import { passkeyStatus } from "../stores/passkey-relay.svelte";

  interface Props {
    /** The browser key whose passkey status to show. */
    browserKey: BrowserKey;
  }

  let { browserKey }: Props = $props();
  let status: PasskeyStatusFrame | undefined = $derived(
    passkeyStatus(browserKey)
  );
</script>

{#if status}
  <div
    class="absolute inset-0 z-10 flex items-center justify-center bg-scrim backdrop-blur-(--scrim-blur) pointer-events-none"
    role="status"
    aria-live="polite"
  >
    <!-- mark-line: the mark (icon) is stacked above the words, not beside them -->
    <div
      class="flex flex-col items-center gap-space-3 px-space-5 py-space-5 rounded-md bg-surface-raised border border-border-hairline shadow-raised max-w-80 text-center pointer-events-auto"
    >
      {#if status.status === "scanning"}
        <svg
          aria-hidden="true"
          class="size-10 text-status-live-glyph animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" opacity="0.3" />
          <path d="M12 2a10 10 0 0110 10" stroke-linecap="round" />
        </svg>
        <p class="m-0 type-body text-ink-strong">{status.message}</p>
        {#if status.scanningMachines && status.scanningMachines.length > 0}
          <p class="m-0 type-meta text-ink-muted">
            {status.scanningMachines.join(", ")}
          </p>
        {/if}
      {:else if status.status === "captured"}
        <svg
          aria-hidden="true"
          class="size-10 text-status-done-ink"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M20 6L9 17l-5-5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <p class="m-0 type-body text-ink-strong">{status.message}</p>
      {:else if status.status === "no_ble"}
        <svg
          aria-hidden="true"
          class="size-10 text-warning-9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4m0 4h.01" stroke-linecap="round" />
        </svg>
        <p class="m-0 type-body text-ink-strong">{status.message}</p>
      {:else if status.status === "timeout"}
        <svg
          aria-hidden="true"
          class="size-10 text-warning-9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" stroke-linecap="round" />
        </svg>
        <p class="m-0 type-body text-ink-strong">{status.message}</p>
      {:else}
        <p class="m-0 type-body text-ink-strong">{status.message}</p>
      {/if}
    </div>
  </div>
{/if}
