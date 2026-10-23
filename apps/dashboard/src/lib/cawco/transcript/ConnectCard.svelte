<script lang="ts">
  /**
   * Option B of the connect ask (connect-ask.ts): one card in the
   * transcript, at the point the agent asked, that holds every state in
   * place (v0's paused agent action; Replit's Connect step as the consent).
   * Its head is a rail-led row in the tool rows' recipe; while it asks, the
   * in-page ask's tile hangs under it from the text column to the row's end,
   * as wide as the tool rows beside it (DESIGN.md, Asking in the page:
   * hairline, `radius-md`, the raised shadow, 12px in); only the why keeps
   * the reading measure. The composer stays a pill.
   *
   * Asked, the tile names the service, the agent's why and the address's
   * host; Connect unfolds the consent step in the same tile, the whole
   * address with its host in strong ink and what opens, and only Continue
   * opens it. Settled, the tile is gone and the head is the record
   * (ConnectRow), which a lapsed connection turns to signed out in place.
   *
   * Drawn only by its states files until the hub raises a connect ask.
   */
  import { askWords } from "@cawco/core/words/asks";
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { IconClose, IconKey, IconRefresh } from "#lib/icons.js";
  import ConnectAddress from "./ConnectAddress.svelte";
  import ConnectFault from "./ConnectFault.svelte";
  import ConnectRow from "./ConnectRow.svelte";
  import {
    type ConnectAsk,
    type ConnectOutcome,
    connectWords,
    connectYes,
    hostOf,
  } from "./connect-ask";

  let {
    ask,
    asker,
    consent = false,
    outcome = null,
  }: {
    /** The ask while it is open. */
    ask: ConnectAsk;
    /** Who asks, as the conversation names its agent. */
    asker: string;
    /** Connect was pressed: the consent step stands in the tile. */
    consent?: boolean;
    /** How it settled; the tile is gone and the head is the record. */
    outcome?: ConnectOutcome | null;
  } = $props();

  let step = $state<"ask" | "consent" | "waiting" | "failed">(
    untrack(() => {
      if (ask.stage === "waiting" || ask.stage === "failed") {
        return ask.stage;
      }
      return consent ? "consent" : "ask";
    })
  );
  /** The Other line: words that go to the agent with Not now. */
  let otherOpen = $state(false);
  let other = $state("");
  const host = $derived(hostOf(ask.url));
</script>

{#if outcome}
  <ConnectRow {outcome} />
{:else}
  <div data-slot="connect-card" data-tx-rail class="rail-row">
    <div
      data-slot="trow"
      class="rail-line w-full min-h-(--tx-line) coarse:min-h-(--tx-line-touch) text-size-label font-medium text-ink-strong"
    >
      <span data-slot="rail-cell" class="rail-cell">
        <span
          data-slot="glyph"
          class="grid place-items-center text-status-attn-glyph"
          ><IconKey class="size-icon-md block" /></span
        >
      </span>
      <span
        class="flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{connectWords.lede(ask.service)}</span
      >
      <span
        class="flex-1 min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-normal text-ink-muted text-end"
        >{asker}</span
      >
    </div>
    <section
      aria-label={connectWords.askFrom(asker)}
      class="rail-hang mt-space-1 mb-space-2 grid grid-cols-1 gap-space-2 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
    >
      {#if step === "failed" && ask.fault}
        <ConnectFault
          details={ask.fault.details}
          next={connectWords.failedNext(asker)}
          title={ask.fault.said}
        />
      {:else if step === "consent"}
        <!-- Replit's Connect step: what opens, and the whole address,
             before anything does. -->
        <p class="m-0 type-label text-ink-strong text-pretty">
          {connectWords.detail(ask.service, asker)}
        </p>
        <p class="m-0 min-w-0 text-size-meta">
          <ConnectAddress url={ask.url} />
        </p>
      {:else}
        <p
          class="m-0 max-w-c-measure text-size-body leading-body text-ink-strong text-pretty wrap-anywhere"
        >
          {ask.why}
        </p>
        <p class="m-0 type-meta text-ink-muted wrap-anywhere">
          {[host, ...(ask.scopes ?? [])].join(" · ")}
        </p>
        {#if step === "ask"}
          <!-- The question card's "Other", as the composer's ask has it. -->
          <div class="flex h-c-input-h min-w-0 items-center gap-space-2">
            <OptionGroup
              aria-label={`Other answer to: ${ask.why}`}
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
                aria-label={askWords.yourAnswerTo(ask.why)}
                class="flex-1"
                placeholder={askWords.yourAnswer}
                bind:value={other}
              />
            {/if}
          </div>
        {/if}
        {#if step === "waiting"}
          <div
            class="flex flex-wrap items-baseline gap-x-space-2 gap-y-space-1"
            role="status"
          >
            <p class="m-0 min-w-0 text-size-label text-ink-muted">
              {connectWords.waiting(ask.service)}
            </p>
            <Button
              class="flex-none"
              label={connectWords.openSignIn}
              pad="none"
              size="xs"
              variant="link"
            />
          </div>
        {/if}
      {/if}
      <!-- The Peer Rule's transcript form: the yes and the refusal at the
           tile's two ends, the one recessed fill, each outlined in its
           tint. In the consent step the refusal is Back, to the ask. -->
      <div
        data-slot="choice"
        class="flex justify-between gap-space-8 mt-space-1"
      >
        {#if step === "consent"}
          <Button
            answer="approve-strong"
            class="flex-none"
            fit="prompt"
            width="shrink"
            icon={IconKey}
            label={connectWords.continueTo(host)}
            onclick={() => {
              step = "waiting";
            }}
            size="sm"
            variant="secondary"
          />
          <Button
            class="flex-none"
            fit="prompt"
            width="shrink"
            label={connectWords.back}
            onclick={() => {
              step = "ask";
            }}
            size="sm"
            variant="ghost"
          />
        {:else}
          <Button
            answer="approve-strong"
            class="flex-none"
            fit="prompt"
            width="shrink"
            icon={step === "failed" ? IconRefresh : IconKey}
            label={connectYes(step === "failed", !!ask.again)}
            onclick={() => {
              step = step === "failed" ? "waiting" : "consent";
            }}
            pending={step === "waiting"}
            pendingLabel={connectWords.connecting}
            size="sm"
            variant="secondary"
          />
          <Button
            answer="deny-strong"
            class="flex-none"
            fit="prompt"
            width="shrink"
            icon={IconClose}
            label={connectWords.notNow}
            size="sm"
            variant="secondary"
          />
        {/if}
      </div>
    </section>
  </div>
{/if}
