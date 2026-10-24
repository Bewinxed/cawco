<script lang="ts">
  /**
   * Option C of the connect ask (connect-ask.ts): a card in the transcript,
   * at the point the agent asked, that turns into the record where it stands
   * (Cofounder's card in the conversation; Tines's two marks at its head).
   * The composer stays free. It is the house's ask in the page (DESIGN.md,
   * Asking in the page: hairline, `radius-md`, the raised shadow, 12px in),
   * hung at the text column as the tool rows are: who connects to what, what
   * it reads and cannot do, the whole sign-in address, who keeps it and for
   * how long, then Connect and a worded Not now. There is no Other line:
   * words for the agent go in the composer.
   *
   * Settled, the card is gone and the record (ConnectRow) stands in its
   * place. Drawn only by its states files until the hub raises a connect ask.
   */
  import { LogoFigma, LogoGoogleDrive } from "@cawco/icons/marks";
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconKey, IconTick, IconTransfer } from "#lib/icons.js";
  import CawFace from "../home/CawFace.svelte";
  import { hubSeam } from "../hub-live";
  import RowFault from "../RowFault.svelte";
  import ConnectAddress from "./ConnectAddress.svelte";
  import ConnectRow from "./ConnectRow.svelte";
  import {
    type ConnectAsk,
    type ConnectOutcome,
    connectWords,
    faultWords,
  } from "./connect-ask";

  let {
    ask,
    asker,
    reaches,
    outcome = null,
  }: {
    /** The ask while it is open. */
    ask: ConnectAsk;
    /** Who asks, as the conversation names its agent. */
    asker: string;
    /** What the grant reads and cannot do, in one sentence. */
    reaches: string;
    /** How it settled: the card is gone and the record stands in its place. */
    outcome?: ConnectOutcome | null;
  } = $props();

  let stage = $state(untrack(() => ask.stage));
  let fault = $state(untrack(() => ask.fault ?? null));
  const hub = hubSeam();
  /** The answer can reach the daemon that asked: the hub live, and its machine. */
  const reachable = $derived(hub.state === "connected" && !hub.machineOffline);
  const MARKS: Record<string, typeof LogoFigma> = {
    figma: LogoFigma,
    google: LogoGoogleDrive,
  };
  const Mark = $derived(MARKS[ask.server] ?? null);

  function connect(): void {
    if (!reachable) {
      return;
    }
    fault = null;
    stage = "waiting";
  }
</script>

{#if outcome}
  <ConnectRow {outcome} />
{:else}
  <div data-slot="connect-card" data-tx-rail class="rail-row">
    <!-- mark-line: the two marks stand on a row of their own, over the words -->
    <section
      aria-label={ask.again
        ? connectWords.againFrom(asker)
        : connectWords.askFrom(asker)}
      class="rail-hang mt-space-1 mb-space-2 flex flex-col gap-space-2 min-w-0 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised"
    >
      <!-- Who connects to what: Caw&Co's mark, the arrow between, the
           service's own mark. -->
      <div
        data-slot="marks"
        class="flex items-center gap-space-2"
        aria-hidden="true"
      >
        <span
          class="grid flex-none size-c-btn-h-sm place-items-center rounded-sm border border-border-hairline bg-surface-page"
          ><CawFace size={20} status="idle" /></span
        >
        <IconTransfer class="size-icon-md flex-none text-ink-muted" />
        <span
          class="grid flex-none size-c-btn-h-sm place-items-center rounded-sm border border-border-hairline bg-surface-page"
          >{#if Mark}<Mark class="size-icon-md block" />{:else}<IconKey
              class="size-icon-md block"
            />{/if}</span
        >
      </div>
      <h3
        class="m-0 type-label font-medium text-ink-strong text-pretty wrap-anywhere"
      >
        {ask.again
          ? connectWords.cardTitleAgain(ask.service)
          : connectWords.cardTitle(ask.service)}
      </h3>
      <p
        class="m-0 max-w-c-measure text-size-body leading-body text-ink-strong text-pretty wrap-anywhere"
      >
        {ask.again && ask.scope ? connectWords.asBefore(ask.scope) : reaches}
      </p>
      <p class="m-0 min-w-0 text-size-meta">
        <ConnectAddress url={ask.url} />
      </p>
      <p class="m-0 max-w-c-measure text-size-label text-ink-muted text-pretty">
        {connectWords.detailCard(ask.service)}
      </p>
      {#if stage === "waiting"}
        <p class="m-0 text-size-meta text-ink-muted" role="status">
          {connectWords.waiting(ask.provider)}
        </p>
      {:else if !reachable}
        <p class="m-0 text-size-meta text-ink-muted" role="status">
          {connectWords.offline}
        </p>
      {:else if stage === "failed" && fault}
        <RowFault
          class="text-size-meta"
          again={fault.kind === "refused" ? undefined : connect}
          data-connect-fault={fault.kind}
          reason={faultWords(fault, ask.provider)}
        />
      {/if}
      <!-- Connect at the start, a worded Not now at the end: a parked call
           must be answered, so the refusal is a word, not a cross. -->
      <div
        data-slot="choice"
        class="flex justify-between gap-space-8 mt-space-1"
      >
        {#if stage === "done"}
          <Button
            answer="approve-strong"
            class="flex-none"
            fit="prompt"
            width="shrink"
            icon={IconTick}
            label={connectWords.connectedAs(ask.as ?? ask.service)}
            size="sm"
            variant="secondary"
          />
        {:else}
          <Button
            answer="approve-strong"
            class="flex-none"
            fit="prompt"
            width="shrink"
            data-connect
            disabled={!reachable}
            icon={IconKey}
            label={ask.again
              ? connectWords.reconnectService(ask.service)
              : connectWords.connectService(ask.service)}
            onclick={connect}
            pending={stage === "waiting"}
            pendingLabel={connectWords.signingIn(ask.provider)}
            size="sm"
            variant="secondary"
          />
          <Button
            class="flex-none"
            fit="prompt"
            width="shrink"
            data-connect-decline
            disabled={!reachable}
            label={connectWords.notNow}
            size="sm"
            variant="ghost"
          />
        {/if}
      </div>
    </section>
  </div>
{/if}
