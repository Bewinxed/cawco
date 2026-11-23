<script lang="ts">
  /**
   * A passkey QR overlay in the take-over view: a FIDO URI from the
   * browser's page, rendered as a scannable QR for the person's phone.
   * Shows inside the browser well over the stream, auto-dismisses when
   * the take-over ends or the QR expires. The QR is also posted to the page's
   * window, where the CawCo Chrome extension's content script (if installed)
   * hears it and scans for the phone's advert; the advert comes back the same
   * way and goes to the hub over this page's own socket. Under the QR, a line says how the hub's relay
   * of the phone's Bluetooth advert is going (scanning where, timed out, no
   * Bluetooth anywhere).
   */
  import type { BrowserKey, PasskeyQrFrame } from "@cawco/core/browser";
  import { PASSKEY_QR_TTL_MS } from "@cawco/core/browser";
  import { isRecord } from "@cawco/core/is-record";
  import { passkeyWords } from "@cawco/core/words/browser";
  import { IconKey } from "#lib/icons.js";
  import { appear } from "#lib/platform/motion/curves.svelte.js";
  import { sendIfOpen } from "../hub/socket.svelte";
  import { qrPath } from "../qr-path";
  import { dismissPasskeyQr } from "../stores/passkey-qr.svelte";
  import { passkeyStatus } from "../stores/passkey-relay.svelte";

  let {
    frame,
    browserKey,
  }: {
    frame: PasskeyQrFrame;
    browserKey: BrowserKey;
  } = $props();

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

  /** The QR goes to the CawCo Chrome extension's content script, if one listens on this page. */
  $effect(() => {
    window.postMessage(
      {
        type: "cawco:passkey_qr",
        fidoUri: frame.fidoUri,
        rpOrigin: frame.rpOrigin,
        raisedAt: frame.raisedAt,
        browserKey,
      },
      window.location.origin
    );
  });

  /** An advert the extension captured goes to the hub over this page's own socket. */
  $effect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }
      const data: unknown = event.data;
      if (!isRecord(data) || data.type !== "cawco:passkey_advert") {
        return;
      }
      const { serviceData, rssi, capturedAt } = data;
      if (
        typeof serviceData !== "string" ||
        typeof rssi !== "number" ||
        typeof capturedAt !== "number"
      ) {
        return;
      }
      sendIfOpen({
        verb: "frames",
        machineId: "",
        payload: { kind: "passkey_advert", serviceData, rssi, capturedAt },
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  const code = $derived(qrPath(frame.fidoUri));

  const rpDisplay = $derived(
    frame.rpOrigin ? frame.rpOrigin.replace(/^https?:\/\//u, "") : null
  );

  /** How the hub's relay of the phone's Bluetooth advert is going, in words. */
  const relayLine = $derived.by(() => {
    const relay = passkeyStatus(browserKey);
    if (!relay) {
      return null;
    }
    return relay.status === "scanning"
      ? passkeyWords.relay.scanning(relay.scanningMachines ?? [])
      : passkeyWords.relay[relay.status];
  });

  function dismiss() {
    dismissPasskeyQr(browserKey);
  }
</script>

{#if !expired}
  <!-- The overlay: a card centred in the browser well, over the stream. -->
  <div
    class="absolute inset-0 z-2 grid place-items-center bg-bg/72"
    data-slot="passkey-qr-overlay"
    transition:appear
  >
    <!-- mark-line: the icon is in the title row, not beside the card's body -->
    <div
      class="flex w-full max-w-95 flex-col items-center gap-space-4 rounded-xl border border-ui bg-bg p-space-4 shadow-sm"
      data-slot="passkey-qr-card"
    >
      <!-- Title with key icon. -->
      <div class="mark-line flex items-center gap-space-2">
        <span class="mark-cell">
          <IconKey class="size-icon-md text-accent" />
        </span>
        <span class="mark-text">
          <h3 class="m-0 type-title text-tx">
            {passkeyWords.title}
          </h3>
        </span>
      </div>

      <!-- Inline QR code: the raised surface behind it, the modules in
             ink-strong, as the house's PhoneQr draws its own. -->
      <svg
        class="block size-48 flex-none rounded-sm bg-bg text-tx shadow-sm"
        aria-label={passkeyWords.qrCode}
        role="img"
        viewBox="0 0 {code.size} {code.size}"
      >
        <path d={code.path} fill="currentColor" shape-rendering="crispEdges" />
      </svg>

      <!-- Scan instructions. -->
      <p class="m-0 type-body text-center text-pretty text-tx-2">
        {rpDisplay ? passkeyWords.scanTo(rpDisplay) : passkeyWords.scan}
      </p>

      {#if relayLine}
        <p class="m-0 type-meta text-center text-tx-2" role="status">
          {relayLine}
        </p>
      {/if}

      <!-- Extension install prompt. -->
      <p class="m-0 type-meta text-center text-tx-2">
        {passkeyWords.extensionPrompt}
      </p>

      <!-- Dismiss button. -->
      <button
        class="m-0 border-0 bg-transparent p-0 type-meta text-tx-2 underline decoration-ui underline-offset-2 hover:text-tx"
        onclick={dismiss}
        type="button"
      >
        Dismiss
      </button>
    </div>
  </div>
{/if}
