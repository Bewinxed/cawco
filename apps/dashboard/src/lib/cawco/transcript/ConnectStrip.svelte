<script lang="ts">
  /**
   * Option C of the connect ask (connect-ask.ts): the ask arrives as one
   * line standing on the composer, in the offer's place and the offer's
   * tile (ProjectOffer: the raised surface, its control edge, `radius-lg`),
   * as Grok's and Devin's connect chips stand on theirs. It names who asks
   * for which service, the service in strong ink so it scans at a glance,
   * and the address's host; ✕ is Not now. Connect grows the same tile
   * upward into the card: the why, the whole address, what it may do, the
   * Other line and what Connect does stand over the line, and the line
   * stays at the tile's foot with its Connect, so the card reads as the
   * strip opened. Each outcome is said on the same line until it is done:
   * the wait, a failure with Try again, a lapsed connection with Reconnect,
   * and Connected for a beat before the line goes.
   *
   * Drawn only by its states files until the hub raises a connect ask.
   */
  import { askWords } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { IconCheck, IconClose, IconKey, IconRefresh } from "#lib/icons.js";
  import ConnectAddress from "./ConnectAddress.svelte";
  import { connectWords, connectYes, hostOf } from "./connect-ask";

  type StripState =
    | "asking"
    | "opened"
    | "waiting"
    | "failed"
    | "expired"
    | { connected: string | null };

  let {
    service,
    url,
    why,
    scopes = [],
    asker,
    step,
    onopen,
  }: {
    service: string;
    url: string;
    /** The agent's why, said once the strip has opened. */
    why: string;
    /** What it may do there, when the hub knows the scopes. */
    scopes?: string[];
    asker: string;
    step: StripState;
    /** Grows the strip into the card. */
    onopen?: () => void;
  } = $props();

  const host = $derived(hostOf(url));
  const connected = $derived(typeof step === "object" ? step : null);
  const opened = $derived(step === "opened");
  /** The Other line: words that go to the agent with Not now. */
  let otherOpen = $state(false);
  let other = $state("");
</script>

<section
  aria-label={connectWords.askFrom(asker)}
  data-slot="connect-strip"
  data-opened={opened || undefined}
  class="flex flex-col gap-space-3 border border-border-control rounded-lg bg-surface-raised p-space-3 shadow-hairline"
  role={step === "asking" || opened ? undefined : "status"}
>
  {#if opened}
    <!-- The card the strip grew into, over the line it grew from. -->
    <div
      data-slot="connect-opened"
      class="grid grid-cols-1 gap-space-2 pb-space-3 border-b border-border-hairline"
    >
      <p
        class="m-0 max-w-c-measure text-size-body leading-body text-ink-strong text-pretty wrap-anywhere"
      >
        {why}
      </p>
      <p class="m-0 min-w-0 text-size-meta">
        <ConnectAddress {url} />
      </p>
      {#if scopes.length}
        <p class="m-0 text-size-label text-ink-strong">
          {scopes.join(" · ")}
        </p>
      {/if}
      <!-- The question card's "Other", as the composer's ask has it. -->
      <div class="flex h-c-input-h min-w-0 items-center gap-space-2">
        <OptionGroup
          aria-label={`Other answer to: ${why}`}
          class="flex-none"
          value={otherOpen ? ["other"] : []}
        >
          <OptionGroupItem
            onclick={(event: MouseEvent) => {
              event.preventDefault();
              otherOpen = true;
            }}
            value="other"
          >
            <span class="min-w-0 wrap-anywhere text-pretty">Other</span>
          </OptionGroupItem>
        </OptionGroup>
        {#if otherOpen}
          <Input
            aria-label={askWords.yourAnswerTo(why)}
            class="flex-1"
            placeholder={askWords.yourAnswer}
            bind:value={other}
          />
        {/if}
      </div>
      <p class="m-0 text-size-label text-ink-muted text-pretty">
        {connectWords.detail(service, asker)}
      </p>
    </div>
  {/if}
  <div
    data-slot="connect-line"
    class="flex flex-wrap items-center justify-between gap-y-space-2 gap-x-space-3"
  >
    <p
      class="mark-line flex items-center gap-space-2 min-w-0 grow shrink basis-c-offer-line text-size-body font-normal leading-body text-ink-muted"
    >
      {#if connected}
        <IconCheck
          aria-hidden="true"
          class="size-icon-lg flex-none text-status-done-glyph"
        />
        <span class="min-w-0 wrap-anywhere text-ink-strong"
          >{connected.connected
            ? connectWords.connectedAs(service, connected.connected)
            : connectWords.connected(service)}</span
        >
      {:else}
        <IconKey
          aria-hidden="true"
          class="size-icon-lg flex-none text-status-attn-glyph"
        />
        <span class="min-w-0 wrap-anywhere"
          >{#if step === "waiting"}<span class="text-ink-strong"
              >{connectWords.waiting(service)}</span
            >{:else if step === "failed"}<span class="text-ink-strong"
              >{connectWords.failedTitle(service)}</span
            >{:else if step === "expired"}<span class="text-ink-strong"
              >{connectWords.ledeAgain(service)}</span
            >{:else}{asker}
            {connectWords.needs}
            <span class="font-medium text-ink-strong">{service}</span>
            · {host}{/if}</span
        >
      {/if}
    </p>
    {#if !connected}
      <div data-slot="actions" class="flex gap-space-2 ms-auto">
        {#if step === "waiting"}
          <Button
            fit="prompt"
            label={connectWords.openSignIn}
            size="sm"
            variant="ghost"
          />
        {:else}
          <Button
            answer={opened ? "approve-strong" : undefined}
            fit="prompt"
            icon={step === "failed" ? IconRefresh : IconKey}
            label={connectYes(step === "failed", step === "expired")}
            onclick={onopen}
            size="sm"
            variant={opened ? "secondary" : "outline"}
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
  </div>
</section>
