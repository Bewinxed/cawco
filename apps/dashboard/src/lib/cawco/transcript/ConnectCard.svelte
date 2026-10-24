<script lang="ts">
  /**
   * A connect ask (hub connect-asks.ts) as a card in the conversation, at the
   * point the agent asked it, that becomes the record of it where it stands
   * (Cofounder's card in the conversation; Tines's two marks at its head).
   * The composer stays free: an ask never grows it.
   *
   * It is the house's ask in the page (DESIGN.md, Asking in the page:
   * hairline, `radius-md`, the raised shadow, 12px in), hung at the text
   * column as the tool rows are: who connects to what (Caw&Co, the
   * transfer glyph, the service's mark), what the sign-in reads and can't
   * do (the access the agent asked for, or a reconnect's held one), the
   * whole sign-in address, who keeps it and for how long, then Connect at
   * the start and a worded Not now at the end. Words for the agent go in
   * the composer, so there is no Other line.
   *
   * Connect is the hub's sign-in (connect-sign-ins): the card waits in
   * place while the provider's page is open, a sign-in that did not come
   * back takes the card's centre in the error formula with Try again and
   * Show details, and while the session's machine is offline both wait.
   * The hub's landing answers the call: Connect holds "Connected as …" for
   * a beat, then the card becomes the record (ConnectRow), the row's box
   * tweening to the record's height as one gives way to the other. Not now
   * answers the call too, and the record says so.
   *
   * The row is the call's (rows.ts): `message` is null while the card
   * stands at the tail ahead of the call's message, and a call with no ask
   * behind it (the hub that held it restarted) is the plain tool row it is.
   */
  import { accessLabel } from "@cawco/core/connect-ask";
  import type { ConnectAnswer } from "@cawco/core/frames";
  import { askWords } from "@cawco/core/words/asks";
  import { configureWords } from "@cawco/core/words/configure";
  import { shellWords } from "@cawco/core/words/shell";
  import {
    LogoFigma,
    LogoGithub,
    LogoGmail,
    LogoGoogleDrive,
    LogoLinear,
    LogoSlack,
  } from "@cawco/icons/marks";
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconKey, IconRefresh, IconTick, IconTransfer } from "#lib/icons.js";
  import {
    cawco,
    commandRecord,
    isStale,
    type PendingPermission,
    submitCommand,
  } from "../client.svelte";
  import CawFace from "../home/CawFace.svelte";
  import { hubSeam } from "../hub-live";
  import { crossIn, crossOut, dur } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { morph } from "../motion/morph.svelte";
  import type { Message } from "../types";
  import ConnectAddress from "./ConnectAddress.svelte";
  import ConnectRow from "./ConnectRow.svelte";
  import { type ConnectFault, connectSignIns } from "./connect-sign-ins.svelte";
  import ToolGroup from "./ToolGroup.svelte";

  let {
    instanceId,
    message,
    answer,
    asker,
  }: {
    /** The session the ask is parked on. */
    instanceId: string;
    /** The `connect_ask` call; null while its card stands ahead of it. */
    message: Message | null;
    /** The call's answer, read back: the record. */
    answer: ConnectAnswer | null;
    /** Who asks, as the conversation names its agent. */
    asker: string;
  } = $props();

  /**
   * The ask parked for this call: one connect ask a session at a time. A
   * call already answered parks none: the session's next ask is the next
   * call's (a harness that names no call, OpenCode, parks it unnamed).
   */
  const ask = $derived(
    answer
      ? null
      : ((cawco.session(instanceId)?.pending ?? []).find(
          (request) =>
            request.connectAsk &&
            (!(request.toolUseId && message?.toolCallId) ||
              request.toolUseId === message.toolCallId)
        ) ?? null)
  );
  /**
   * The ask as last parked: it leaves the hub's ledger a moment before the
   * call's answer lands, and the card stands until then.
   */
  let held = $state<PendingPermission | null>(null);
  $effect.pre(() => {
    if (ask) {
      held = ask;
    }
  });
  const signIn = $derived(connectSignIns.of(held?.requestId ?? ""));
  /** The hub signed in from this card: its beat holds before the record. */
  const landing = $derived(!!(answer && held && signIn.stage === "done"));
  /** The card that stands now, if any: the record takes its place after. */
  const card = $derived(ask ?? (landing || (message && !answer) ? held : null));
  const connect = $derived(card?.connectAsk ?? null);

  // The beat, then the record; an answer from anywhere else forgets the
  // sign-in this tab kept for it at once.
  $effect(() => {
    const id = held?.requestId;
    if (!(answer && id)) {
      return;
    }
    if (!landing) {
      untrack(() => connectSignIns.forget(id));
      return;
    }
    const hold = setTimeout(() => connectSignIns.forget(id), dur("--dur-hold"));
    return () => clearTimeout(hold);
  });

  /** The server as the fleet reads it now: signed in, and as whom. */
  const server = $derived(
    connect
      ? ((cawco.fleetMcp ?? []).find((one) => one.name === connect.server) ??
          null)
      : null
  );
  // The hub's word that it signed in, while this card waited on it.
  $effect(() => {
    const id = card?.requestId;
    if (
      id &&
      signIn.stage === "waiting" &&
      server?.auth?.state === "signed-in"
    ) {
      untrack(() => connectSignIns.landed(id));
    }
  });

  const hub = hubSeam();
  const row = $derived(cawco.instanceIndex.byId.get(instanceId));
  /** The session's machine is offline (a stand-in's word, else its row's). */
  const offline = $derived(hub.machineOffline ?? (row ? isStale(row) : false));
  /** An answer can reach the daemon that asked: the hub is live, and its machine. */
  const reachable = $derived(hub.state === "connected" && !offline);

  /** Not now, as the command it went out as. */
  let declined = $state<string | null>(null);
  const declineRecord = $derived(declined ? commandRecord(declined) : null);
  /** What the hub refused Not now with. */
  const declineRefused = $derived(
    declineRecord?.stage === "failed"
      ? [askWords.cantSendAnswer, declineRecord.reason]
          .filter(Boolean)
          .join(" ")
      : null
  );
  const declining = $derived(declined !== null && declineRefused === null);

  function pressConnect(): void {
    if (
      !(card && connect && reachable) ||
      declining ||
      signIn.stage === "waiting" ||
      signIn.stage === "done"
    ) {
      return;
    }
    connectSignIns.connect(card.requestId, connect.server, connect.access);
  }

  function notNow(): void {
    if (!(card && reachable) || declining || signIn.stage === "done") {
      return;
    }
    connectSignIns.forget(card.requestId);
    declined = submitCommand(
      instanceId,
      cawco.session(instanceId)?.machineId ?? "",
      "permission.answer",
      {
        requestId: card.requestId,
        result: { behavior: "deny", message: "" },
      }
    );
  }

  /** What a sign-in that did not come back says: what happened, then what is safe and the way on. */
  function faultWords(
    fault: ConnectFault,
    name: string
  ): { happened: string; next: string; details: string | null } {
    switch (fault.kind) {
      case "closed":
        return {
          happened: askWords.connectTabClosed(name),
          next: askWords.connectFailedNext(asker),
          details: null,
        };
      case "expired":
        return {
          happened: askWords.connectPageExpired(name),
          next: askWords.connectFailedNext(asker),
          details: null,
        };
      case "refused":
        return {
          happened: askWords.connectRefused(name),
          next: askWords.connectRefusedNext(asker),
          details: fault.reason,
        };
      default: {
        const unhandled: never = fault;
        throw new Error(`unhandled fault: ${JSON.stringify(unhandled)}`);
      }
    }
  }
  const failed = $derived(
    connect && signIn.stage === "failed" && signIn.fault
      ? faultWords(signIn.fault, connect.server)
      : null
  );
  let detailsShown = $state(false);
  const detailsId = $props.id();

  /** What the sign-in reads and can't do: the access asked, or held from before. */
  const reach = $derived.by(() => {
    if (!connect?.access) {
      return null;
    }
    if (connect.again) {
      return askWords.asBefore(accessLabel(connect.access));
    }
    return connect.access === "read" ? askWords.readReach : askWords.writeReach;
  });

  /** The service's own mark, where one is drawn here; else the key glyph. */
  const MARKS = [
    ["figma", LogoFigma],
    ["github", LogoGithub],
    ["gmail", LogoGmail],
    ["drive", LogoGoogleDrive],
    ["linear", LogoLinear],
    ["slack", LogoSlack],
  ] as const;
  const Mark = $derived(
    MARKS.find(([name]) => connect?.server.toLowerCase().includes(name))?.[1] ??
      null
  );

  const connectLabel = $derived.by(() => {
    if (!connect) {
      return "";
    }
    if (signIn.stage === "done") {
      return server?.auth?.as
        ? askWords.connectedAs(server.auth.as)
        : askWords.connected;
    }
    if (failed) {
      return configureWords.tryAgain;
    }
    return connect.again
      ? askWords.reconnect(connect.server)
      : askWords.connect(connect.server);
  });
  const connectIcon = $derived.by(() => {
    if (signIn.stage === "done") {
      return IconTick;
    }
    return failed ? IconRefresh : IconKey;
  });
</script>

<!-- The row's box tweens to what stands in it: the card, then its record. -->
<div class="relative flex flex-col" data-slot="connect" {@attach morph()}>
  {#if card && connect}
    <div
      data-slot="connect-card"
      data-connect-stage={signIn.stage}
      data-tx-rail
      class="rail-row"
      in:crossIn
      out:crossOut
    >
      <!-- mark-line: the marks stand on a row of their own, over the words -->
      <section
        id="connect-{card.requestId}"
        aria-label={connect.again
          ? askWords.reconnectAskFrom(asker)
          : askWords.connectAskFrom(asker)}
        class="rail-hang mt-space-1 mb-space-2 flex flex-col gap-space-2 min-w-0 rounded-md border border-border-hairline bg-surface-raised p-space-3 shadow-raised scroll-my-space-4"
      >
        <!-- Who connects to what: Caw&Co, the arrow between, the service. -->
        <div
          data-slot="marks"
          class="flex items-center gap-space-2"
          aria-hidden="true"
        >
          <CawFace size={20} status="idle" />
          <IconTransfer class="size-icon-md flex-none text-ink-muted" />
          {#if Mark}
            <Mark class="size-icon-lg flex-none" />
          {:else}
            <IconKey class="size-icon-lg flex-none text-status-attn-glyph" />
          {/if}
        </div>
        <h3
          class="m-0 type-label font-medium text-ink-strong text-balance wrap-anywhere"
        >
          {connect.again
            ? askWords.reconnectTitle(connect.server)
            : askWords.connectTitle(connect.server)}
        </h3>
        {#if failed}
          <!-- The failure takes the card's centre: what happened, what is
               safe and the way on, and the hub's own words under Show
               details. Try again is the coral control below. -->
          <div
            data-slot="connect-fault"
            data-connect-fault={signIn.fault?.kind}
            class="flex flex-col items-center gap-space-1 py-space-2 text-center"
            role="alert"
          >
            <p
              class="m-0 max-w-c-measure text-size-body font-medium leading-body text-ink-strong text-balance wrap-anywhere"
            >
              {failed.happened}
            </p>
            <p
              class="m-0 max-w-c-measure text-size-label text-ink-muted text-pretty wrap-anywhere"
            >
              {failed.next}
            </p>
            {#if failed.details}
              <Button
                aria-controls={detailsId}
                aria-expanded={detailsShown}
                label={detailsShown
                  ? shellWords.hideDetails
                  : shellWords.showDetails}
                onclick={() => {
                  detailsShown = !detailsShown;
                }}
                size="xs"
                variant="ghost"
              />
              {#if detailsShown}
                <p
                  id={detailsId}
                  data-slot="details"
                  class="m-0 self-stretch text-start type-meta font-mono whitespace-pre-wrap wrap-anywhere text-ink-muted"
                  transition:unfold
                >
                  {failed.details}
                </p>
              {/if}
            {/if}
          </div>
        {:else}
          {#if reach}
            <p
              data-slot="connect-reach"
              class="m-0 max-w-c-measure text-size-body leading-body text-ink-strong text-pretty wrap-anywhere"
            >
              {reach}
            </p>
          {/if}
          <p class="m-0 min-w-0 text-size-meta">
            <ConnectAddress url={connect.url} />
          </p>
          <p
            class="m-0 max-w-c-measure text-size-label text-ink-muted text-pretty"
          >
            {askWords.connectReach(connect.server)}
          </p>
        {/if}
        {#if signIn.stage === "waiting"}
          <p
            data-slot="wait"
            class="m-0 text-size-meta text-ink-muted"
            role="status"
            transition:unfold
          >
            {askWords.connectWaiting(connect.server)}
          </p>
        {:else if !reachable && signIn.stage !== "done"}
          <p
            data-slot="wait"
            class="m-0 text-size-meta text-ink-muted"
            role="status"
            transition:unfold
          >
            {askWords.connectOffline}
          </p>
        {:else if declineRefused}
          <p
            data-slot="wait"
            class="m-0 text-size-meta text-status-fail-ink wrap-anywhere"
            role="alert"
            transition:unfold
          >
            {declineRefused}
          </p>
        {/if}
        <!-- Connect at the start, a worded Not now at the end: a parked call
             must be answered, so the refusal is a word, not a cross. The
             yes is the one coral control; it pends while the provider's page
             is open, and ends in the kit's done morph once the hub signed
             in. Not now stays live while that page is open. -->
        <div
          data-slot="choice"
          class="flex flex-wrap justify-between gap-x-space-8 gap-y-space-2 mt-space-1"
        >
          <Button
            answer="approve-strong"
            class="flex-none"
            fit="prompt"
            width="shrink"
            data-connect
            disabled={!reachable || declining}
            failed={!!failed}
            icon={connectIcon}
            label={connectLabel}
            onclick={pressConnect}
            pending={signIn.stage === "waiting"}
            pendingLabel={askWords.signingIn(connect.server)}
            size="sm"
            variant="secondary"
          />
          <Button
            class="flex-none"
            fit="prompt"
            width="shrink"
            data-connect-decline
            disabled={!reachable || signIn.stage === "done"}
            label={askWords.notNow}
            onclick={notNow}
            pending={declining}
            pendingLabel={askWords.declining}
            size="sm"
            variant="ghost"
          />
        </div>
      </section>
    </div>
  {:else if answer}
    <div data-slot="connect-record" in:crossIn out:crossOut>
      <ConnectRow {answer} />
    </div>
  {:else if message}
    <ToolGroup messages={[message]} />
  {/if}
</div>
