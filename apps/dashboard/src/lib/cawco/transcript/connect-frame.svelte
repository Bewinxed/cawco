<script lang="ts" module>
  /** Which of the three drawings: the composer's ask, the transcript's card, or the strip on the composer. */
  export type ConnectOption = "ask" | "card" | "strip";

  /**
   * One moment of a connect ask, as its states files name them. Not every
   * option has every one: only the ask parks (`parked`), only the card has
   * its consent step (`consent`), only the strip opens into the ask
   * (`opened`); `reconnect` is the ask raised again over a lapsed row.
   */
  export type ConnectMoment =
    | "asking"
    | "consent"
    | "parked"
    | "opened"
    | "waiting"
    | "failed"
    | "connected"
    | "declined"
    | "expired"
    | "reconnect";
</script>

<script lang="ts">
  /**
   * A connect ask in the session it was asked in (its states files'
   * fixture): the transcript's foot, the agent's last words and the call
   * that needed Linear, over the real composer (Composer, with the app's
   * own `composerFleet`), which grows into the ask, parks it to its bar, or
   * carries the strip in its offer's place. What the moment settles leaves
   * its record in the transcript (ConnectRow), with the turn going on after
   * it. Nothing reaches a hub: the stories' hub stand-in answers, and every
   * answer goes nowhere.
   */
  import { presentPermission } from "@cawco/core/permission-presentation";
  import { untrack } from "svelte";
  import { minimizedAsks } from "../minimized-asks.svelte";
  import type { Message } from "../types";
  import Composer, { type ComposerFoot } from "./Composer.svelte";
  import ConnectCard from "./ConnectCard.svelte";
  import ConnectRow from "./ConnectRow.svelte";
  import ConnectStrip from "./ConnectStrip.svelte";
  import { ComposerDraft } from "./composer-draft.svelte";
  import { composerFleet } from "./composer-fleet";
  import type { ConnectAsk, ConnectOutcome } from "./connect-ask";
  import MessageRow from "./MessageRow.svelte";
  import ToolGroup from "./ToolGroup.svelte";

  let {
    option,
    moment,
    account = "bewinxed",
    words = "",
    height = 560,
  }: {
    option: ConnectOption;
    moment: ConnectMoment;
    /** As whom the hub signed in; null when the service said no name. */
    account?: string | null;
    /** The Other line's words a decline carried. */
    words?: string;
    /** The pane's height, px: the room over the composer. */
    height?: number;
  } = $props();

  const AGENT = "Claude Code";
  const SERVICE = "Linear";
  const URL =
    "https://mcp.linear.app/authorize?response_type=code&client_id=cawco-hub-7f3a&redirect_uri=https%3A%2F%2Fcawco.dev%2Foauth%2Fcallback&scope=read%20write&state=k2Jx9";
  const instanceId = "probe-instance";

  const said = (id: string, content: string): Message => ({
    id,
    instanceId,
    content,
    type: "assistant",
  });
  const call = (
    id: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    toolStatus: "success" | "error",
    toolResult?: string
  ): Message => ({
    id,
    instanceId,
    content: "",
    type: "tool.use",
    toolCallId: id,
    metadata: { toolName, toolInput, toolStatus, toolResult },
  });

  /** The turn up to the ask: the agent's plan, and the call Linear refused. */
  const before = {
    plan: said(
      "m1",
      "I'll go through the open OPS issues and leave a comment on each with what the machines show."
    ),
    refused: [
      call(
        "c1",
        "mcp__linear__list_issues",
        { team: "OPS", state: "open" },
        "error",
        "Linear needs a sign-in (401 Unauthorized)."
      ),
    ],
  };
  /** The turn going on once Linear answers. */
  const after = {
    read: [
      call(
        "c2",
        "mcp__linear__list_issues",
        { team: "OPS", state: "open" },
        "success",
        "24 issues"
      ),
    ],
    next: said(
      "m2",
      "24 open issues. Starting with OPS-112, the disk alert on obelisk."
    ),
    declined: said(
      "m3",
      "Understood. I'll read the audit from the Jira export in the repository instead."
    ),
  };

  const ask = (stage: ConnectAsk["stage"], again = false): ConnectAsk => ({
    service: SERVICE,
    why: "To read the OPS issues it is auditing and leave a comment on each with what it finds.",
    url: URL,
    scopes: ["Read issues", "Write comments"],
    stage,
    again,
    fault: {
      said: `${SERVICE}'s sign-in didn't finish`,
      details:
        "The sign-in tab closed before mcp.linear.app called back (no answer for state k2Jx9).",
    },
  });

  const outcome = $derived.by((): ConnectOutcome | null => {
    switch (moment) {
      case "connected":
        return { kind: "connected", service: SERVICE, account };
      case "declined":
        return { kind: "declined", service: SERVICE, words };
      case "expired":
      case "reconnect":
        return { kind: "expired", service: SERVICE, account };
      case "asking":
      case "consent":
      case "parked":
      case "opened":
      case "waiting":
      case "failed":
        return null;
    }
  });

  /** The ask the composer grows into: the ask's own moments, and the strip opened. */
  const grown = $derived.by((): ConnectAsk | null => {
    if (option === "card") {
      return null;
    }
    if (option === "strip") {
      return moment === "opened" ? ask("asking") : null;
    }
    switch (moment) {
      case "asking":
      case "parked":
        return ask("asking");
      case "waiting":
        return ask("waiting");
      case "failed":
        return ask("failed");
      case "reconnect":
        return ask("asking", true);
      case "consent":
      case "opened":
      case "connected":
      case "declined":
      case "expired":
        return null;
    }
  });

  /** One request id per frame: a parked one is kept parked in this tab only. */
  const requestId = untrack(() => `connect-${option}-${moment}-${height}`);
  untrack(() => minimizedAsks.set(requestId, moment === "parked"));

  const composerAsk = $derived(
    grown
      ? {
          asker: AGENT,
          more: 0,
          onanswer: () => null,
          request: {
            heard: 0,
            input: {},
            instanceId,
            presentation: presentPermission("connect", {}, {
              asker: AGENT,
              memory: () => undefined,
            } as never),
            requestId,
            toolName: "connect",
            connectAsk: grown,
          },
        }
      : null
  );

  /** What the strip says on the composer, when the strip is the option. */
  const strip = $derived.by(() => {
    if (option !== "strip") {
      return null;
    }
    switch (moment) {
      case "asking":
      case "waiting":
      case "failed":
      case "expired":
        return moment;
      case "connected":
        return { connected: account };
      case "consent":
      case "parked":
      case "opened":
      case "declined":
      case "reconnect":
        return null;
    }
  });

  /** The card's own moment, when the card is the option. */
  const card = $derived.by(() => {
    if (option !== "card") {
      return null;
    }
    switch (moment) {
      case "waiting":
        return ask("waiting");
      case "failed":
        return ask("failed");
      case "asking":
      case "consent":
        return ask("asking");
      case "parked":
      case "opened":
      case "connected":
      case "declined":
      case "expired":
      case "reconnect":
        return null;
    }
  });

  const settled = $derived(
    outcome?.kind === "connected" || outcome?.kind === "declined"
  );
  const draft = new ComposerDraft();
  let foot = $state<ComposerFoot>({ parked: 0, perch: 0, stack: 0 });
</script>

{#snippet offer()}
  {#if strip}
    <ConnectStrip asker={AGENT} service={SERVICE} state={strip} url={URL} />
  {/if}
{/snippet}

<div
  data-slot="connect-frame"
  class="relative w-full h-(--frame-h) overflow-hidden bg-surface-page"
  style:--frame-h="{height}px"
>
  <div
    data-slot="tx"
    class="flex flex-col justify-end h-full pb-(--tx-room) ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5 tx-columns"
    style:--tx-room="calc(var(--c-composer-panel) + var(--c-tray-row) + {foot.parked}px
    + var(--space-4))"
  >
    <MessageRow agentName={AGENT} message={before.plan} />
    <ToolGroup messages={before.refused} />
    {#if card}
      <ConnectCard ask={card} asker={AGENT} consent={moment === "consent"} />
    {:else if outcome}
      <ConnectRow {outcome} />
    {/if}
    {#if settled && outcome?.kind === "connected"}
      <ToolGroup messages={after.read} />
      <MessageRow agentName={AGENT} message={after.next} />
    {:else if settled}
      <MessageRow agentName={AGENT} message={after.declined} />
    {/if}
  </div>
  <Composer
    agentName={AGENT}
    ask={composerAsk}
    {draft}
    fleet={composerFleet}
    onfoot={(next) => {
      foot = next;
    }}
    onstop={() => undefined}
    onsubmit={() => undefined}
    showing="connect"
    trayRows={[{ delegatesOf: "", id: "connect", prompts: offer }]}
  />
</div>
