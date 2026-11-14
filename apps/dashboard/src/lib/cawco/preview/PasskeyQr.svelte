<script lang="ts">
  /**
   * A passkey QR overlay in the take-over view: a FIDO URI from the
   * browser's page, rendered as a scannable QR for the person's phone.
   * Shows inside the browser well over the stream, auto-dismisses when
   * the take-over ends or the QR expires. When the CawCo Chrome extension
   * is detected, the QR is forwarded to it and a "sent to extension" line
   * replaces the inline code.
   */
  import type { BrowserKey, PasskeyQrFrame } from "@cawco/core/browser";
  import { PASSKEY_QR_TTL_MS } from "@cawco/core/browser";
  import { passkeyWords } from "@cawco/core/words/browser";
  import { IconKey } from "#lib/icons.js";
  import { appear } from "#lib/platform/motion/curves.svelte.js";
  import { qrPath } from "../qr-path";
  import { dismissPasskeyQr } from "../stores/passkey-qr.svelte";

  let {
    frame,
    browserKey,
  }: {
    frame: PasskeyQrFrame;
    browserKey: BrowserKey;
  } = $props();

  /** Whether the Chrome extension acknowledged the QR. */
  let sentToExtension = $state(false);

  /** Time left before the QR expires. */
  let expired = $state(false);

  $effect(() => {
    const left = frame.raisedAt + PASSKEY_QR_TTL_MS - Date.now();
    if (left <= 0) {
      expired = true;
      return;
    }
    expired = false;
    const timer = setTimeout(() => {
      expired = true;
    }, left);
    return () => clearTimeout(timer);
  });

  /** Whether the CawCo Chrome extension's content script marked this page. */
  function extensionPresent(): boolean {
    return "__cawco_extension" in window;
  }

  /** Try to send the FIDO URI to the CawCo Chrome extension. */
  $effect(() => {
    sentToExtension = false;
    if (!extensionPresent()) {
      return;
    }
    window.postMessage(
      {
        type: "cawco:passkey_qr",
        fidoUri: frame.fidoUri,
        origin: frame.rpOrigin,
        expiresAt: frame.raisedAt + PASSKEY_QR_TTL_MS,
      },
      "*"
    );
    sentToExtension = true;
  });

  const code = $derived(qrPath(frame.fidoUri));

  const rpDisplay = $derived(
    frame.rpOrigin ? frame.rpOrigin.replace(/^https?:\/\//u, "") : null
  );

  function dismiss() {
    dismissPasskeyQr(browserKey);
  }
</script>

{#if !expired}
  <!-- The overlay: a card centred in the browser well, over the stream. -->
  <div
    class="absolute inset-0 z-2 grid place-items-center bg-scrim"
    data-slot="passkey-qr-overlay"
    transition:appear
  >
    <!-- mark-line: the icon is in the title row, not beside the card's body -->
    <div
      class="flex w-full max-w-c-panel-w flex-col items-center gap-space-4 rounded-modal border border-border-hairline bg-surface-raised p-space-5 shadow-raised"
      data-slot="passkey-qr-card"
    >
      <!-- Title with key icon. -->
      <div class="mark-line flex items-center gap-space-2">
        <span class="mark-cell">
          <IconKey class="size-icon-md text-coral-9" />
        </span>
        <span class="mark-text">
          <h3 class="m-0 type-title text-ink-strong">
            {passkeyWords.title}
          </h3>
        </span>
      </div>

      {#if sentToExtension}
        <!-- QR was forwarded to the extension. -->
        <p class="m-0 type-body text-center text-ink-muted">
          {passkeyWords.sentToExtension}
        </p>
      {:else}
        <!-- Inline QR code: the raised surface behind it, the modules in
             ink-strong, as the house's PhoneQr draws its own. -->
        <svg
          class="block size-48 flex-none rounded-well bg-surface-raised text-ink-strong shadow-xs"
          aria-label="Passkey QR code{rpDisplay ? ` for ${rpDisplay}` : ''}"
          role="img"
          viewBox="0 0 {code.size} {code.size}"
        >
          <path
            d={code.path}
            fill="currentColor"
            shape-rendering="crispEdges"
          />
        </svg>

        <!-- Scan instructions. -->
        <p class="m-0 type-body text-center text-pretty text-ink-muted">
          {rpDisplay ? passkeyWords.scanTo(rpDisplay) : passkeyWords.scan}
        </p>

        <!-- Extension install prompt. -->
        <p class="m-0 type-meta text-center text-ink-subtle">
          {passkeyWords.extensionPrompt}
        </p>
      {/if}

      <!-- Dismiss button. -->
      <button
        class="m-0 border-0 bg-transparent p-0 type-meta text-ink-muted underline decoration-border-hairline underline-offset-2 hover:text-ink-strong"
        onclick={dismiss}
        type="button"
      >
        Dismiss
      </button>
    </div>
  </div>
{/if}
