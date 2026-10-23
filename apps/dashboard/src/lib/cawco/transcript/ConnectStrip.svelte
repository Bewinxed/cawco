<script lang="ts">
  /**
   * Option C of the connect ask (connect-ask.ts): the ask arrives as one
   * line standing on the composer, in the offer's place and the offer's
   * tile (ProjectOffer: the raised surface, its control edge, `radius-lg`),
   * as Grok's and Devin's connect chips stand on theirs. It names who asks
   * for which service and the address's host; Connect grows the composer
   * into Option A's card, where the why, the whole address and consent
   * stand; ✕ is Not now. Each outcome is said on the same line until it is
   * done: the wait, a failure with Try again, a lapsed connection with
   * Reconnect, and Connected for a beat before the line goes.
   *
   * Drawn only by its states files until the hub raises a connect ask.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconCheck, IconClose, IconKey, IconRefresh } from "#lib/icons.js";
  import { connectWords, connectYes, hostOf } from "./connect-ask";

  type StripState =
    "asking" | "waiting" | "failed" | "expired" | { connected: string | null };

  let {
    service,
    url,
    asker,
    state,
    onopen,
  }: {
    service: string;
    url: string;
    asker: string;
    state: StripState;
    /** Grows the composer into the card. */
    onopen?: () => void;
  } = $props();

  const host = $derived(hostOf(url));
  const connected = $derived(typeof state === "object" ? state : null);
</script>

<section
  aria-label={connectWords.askFrom(asker)}
  data-slot="connect-strip"
  class="flex flex-wrap items-center justify-between gap-y-space-2 gap-x-space-3 border border-border-control rounded-lg bg-surface-raised p-space-3 shadow-hairline"
  role={state === "asking" ? undefined : "status"}
>
  <p
    class="mark-line flex items-center gap-space-2 min-w-0 grow shrink basis-c-offer-line text-size-body font-normal leading-body text-ink-strong"
  >
    {#if connected}
      <IconCheck
        aria-hidden="true"
        class="size-icon-md flex-none text-status-done-glyph"
      />
      <span class="min-w-0 wrap-anywhere"
        >{connected.connected
          ? connectWords.connectedAs(service, connected.connected)
          : connectWords.connected(service)}</span
      >
    {:else}
      <IconKey
        aria-hidden="true"
        class="size-icon-md flex-none text-status-attn-glyph"
      />
      <span class="min-w-0 wrap-anywhere"
        >{#if state === "waiting"}{connectWords.waiting(
            service
          )}{:else if state === "failed"}{connectWords.failedTitle(
            service
          )}{:else if state === "expired"}{connectWords.ledeAgain(
            service
          )}{:else}{connectWords.needs(asker, service)}
          <span class="text-ink-muted">· {host}</span>{/if}</span
      >
    {/if}
  </p>
  {#if !connected}
    <div data-slot="actions" class="flex gap-space-2 ms-auto">
      {#if state === "waiting"}
        <Button
          fit="prompt"
          label={connectWords.openSignIn}
          size="sm"
          variant="ghost"
        />
      {:else}
        <Button
          fit="prompt"
          icon={state === "failed" ? IconRefresh : IconKey}
          label={connectYes(state === "failed", state === "expired")}
          onclick={onopen}
          size="sm"
          variant="outline"
        />
      {/if}
      <Button
        aria-label={connectWords.notNow}
        icon={IconClose}
        size="icon-sm"
        title={connectWords.notNow}
        variant="ghost"
      />
    </div>
  {/if}
</section>
