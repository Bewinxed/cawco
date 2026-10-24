<script lang="ts" module>
  /**
   * Which of the three drawings: A, the gate in the composer's grown shape
   * with the access as a choice; B, a pick among the accounts the hub
   * keeps; C, a card in the transcript that becomes the record.
   */
  export type ConnectOption = "gate" | "pick" | "card";

  /**
   * One moment of a connect ask, as its states files name them. Not every
   * option has every one: `one-scope` is A's connector with a single access,
   * `no-account` B's service with nothing kept, `parked` A's ask folded to
   * its bar over the pill while it waits, `added` B's new account,
   * `scrolled` C's card a screen above the pill on the phone.
   */
  export type ConnectMoment =
    | "asking"
    | "one-scope"
    | "no-account"
    | "waiting"
    | "parked"
    | "scrolled"
    | "done"
    | "connected"
    | "added"
    | "declined"
    | "failed"
    | "page-expired"
    | "expired"
    | "reconnect";
</script>

<script lang="ts">
  /**
   * A connect ask in the session it was asked in (its states files'
   * fixture): the transcript's foot, the agent's last words and the call
   * that needed the service, over the real composer (Composer, with the
   * app's own `composerFleet`), which grows into A's or B's ask, or parks
   * A's to its bar; C's card stands in the transcript itself, with its
   * needs-you chip at the tray row's end. What the moment settles leaves its
   * record in the transcript (ConnectRow), with the turn going on after it.
   * Nothing reaches a hub: the stories' hub stand-in answers, and every
   * answer goes nowhere.
   */
  import { presentPermission } from "@cawco/core/permission-presentation";
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import { minimizedAsks } from "../minimized-asks.svelte";
  import type { Message } from "../types";
  import Composer, { type ComposerFoot } from "./Composer.svelte";
  import ConnectCard from "./ConnectCard.svelte";
  import ConnectRow from "./ConnectRow.svelte";
  import { ComposerDraft } from "./composer-draft.svelte";
  import { composerFleet } from "./composer-fleet";
  import {
    ADD,
    addressParts,
    type ConnectAsk,
    type ConnectFault,
    type ConnectOutcome,
    connectWords,
  } from "./connect-ask";
  import MessageRow from "./MessageRow.svelte";
  import ToolGroup from "./ToolGroup.svelte";

  let {
    option,
    moment,
    fault = "closed",
    words = "",
    height = 640,
  }: {
    option: ConnectOption;
    moment: ConnectMoment;
    /** A failed moment's cause: its tab closed, the hub refused, or the machine is offline (the stand-in says so). */
    fault?: "closed" | "refused" | "offline";
    /** The Other line's words a decline carried. */
    words?: string;
    /** The pane's height, px: the room over the composer. */
    height?: number;
  } = $props();

  const AGENT = "Claude Code";
  const ME = "bewinxed@petralab.ai";
  const instanceId = "probe-instance";

  /** Each drawing's service: Figma for the gate and the card, Google Drive for the pick. */
  const FIGMA = {
    service: "Figma",
    provider: "Figma",
    server: "figma",
    url: "https://www.figma.com/oauth?client_id=cawco-hub-7f3a&redirect_uri=https%3A%2F%2Fcawco.dev%2Foauth%2Fmcp&scope=files%3Aread&state=k2Jx9&response_type=code",
  };
  const DRIVE = {
    service: "Google Drive",
    provider: "Google",
    server: "google",
    url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=cawco-hub-7f3a.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fcawco.dev%2Foauth%2Fmcp&scope=drive.readonly&state=k2Jx9",
  };
  const site = untrack(() => (option === "pick" ? DRIVE : FIGMA));
  const WHY = {
    gate: "Claude Code needs your Figma account to import the Settings page design.",
    pick: "Claude Code needs a Google Drive account to read the launch deck.",
    card: "",
  };
  const AGAIN = {
    gate: "Figma's sign-in expired. Reconnect to go on with the import.",
    pick: WHY.pick,
    card: "",
  };
  const REACHES = "Reads the files and comments you can see. Can't edit.";
  const ACCOUNTS = [
    { email: ME, whose: "yours" as const, scopes: "drive.readonly" },
    { email: "ops@petralab.ai", whose: "project" as const, scopes: "drive" },
  ];

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

  /** The turn up to the ask, and how it goes on, per drawing. */
  const TURN = {
    gate: {
      plan: "I'll import the Settings page design from Figma and build it as a Svelte page.",
      tool: "mcp__figma__get_file",
      input: { file: "Settings page", node: "Settings / Desk" },
      refused: "Figma needs a sign-in (401 Unauthorized).",
      read: "Settings / Desk · 42 layers",
      next: "Got the design: 42 layers. Building the page from the header down.",
      declined: "Understood. I'll build it from the PNG you attached.",
    },
    pick: {
      plan: "I'll read the launch deck in Drive and pull the dates into the plan.",
      tool: "mcp__google__drive_search",
      input: { query: "launch deck", type: "presentation" },
      refused: "Google Drive needs a sign-in (401 Unauthorized).",
      read: "Launch deck · 18 slides",
      next: "Found the launch deck: 18 slides. The dates are on slide 4.",
      declined:
        "Understood. I'll look for it in the shared drive export instead.",
    },
    card: {
      plan: "I'll import the Settings page from Figma. I need your Figma account for that.",
      tool: "mcp__figma__get_file",
      input: { file: "Settings page", node: "Settings / Desk" },
      refused: "Figma needs a sign-in (401 Unauthorized).",
      read: "Settings / Desk · 42 layers",
      next: "Got the design: 42 layers. Building the page from the header down.",
      declined: "Understood. I'll build it from the PNG you attached.",
    },
  };
  const turn = untrack(() => TURN[option]);
  const before = {
    plan: said("m1", turn.plan),
    refused: [
      call("c1", turn.tool, turn.input, "error", turn.refused),
    ] as Message[],
  };
  const after = {
    read: [call("c2", turn.tool, turn.input, "success", turn.read)],
    next: said("m2", turn.next),
    declined: said("m3", turn.declined),
  };

  /** C on the phone: what the turn did while the card waited above. */
  const meanwhile = {
    said: said(
      "m4",
      "While that's open: the Settings page has three sections, Account, Notifications and Billing. I'll lay out the shell first and fill each from the design once Figma answers."
    ),
    calls: [
      call(
        "c3",
        "Write",
        { file_path: "src/routes/settings/+page.svelte" },
        "success",
        "48 lines"
      ),
      call(
        "c4",
        "Write",
        { file_path: "src/routes/settings/Section.svelte" },
        "success",
        "31 lines"
      ),
      call("c5", "Bash", { command: "bun run check" }, "success", "0 errors"),
    ],
    next: said(
      "m5",
      "The shell builds. The header keeps the app's title bar; the side list becomes a segmented control on the phone. Waiting on Figma for the sections themselves."
    ),
  };

  const faultOf = $derived.by((): ConnectFault | undefined => {
    if (moment === "page-expired") {
      return { kind: "expired" };
    }
    if (moment !== "failed" || fault === "offline") {
      return;
    }
    return fault === "refused"
      ? {
          kind: "refused",
          reason: `The hub couldn't reach ${addressParts(site.url).host} (connection timed out).`,
        }
      : { kind: "closed" };
  });

  /** The ask in this moment, before it settles. */
  const open = $derived.by((): ConnectAsk | null => {
    const stage = ((): ConnectAsk["stage"] | null => {
      switch (moment) {
        case "asking":
        case "one-scope":
        case "no-account":
        case "reconnect":
          return "asking";
        case "waiting":
        case "parked":
        case "scrolled":
          return "waiting";
        case "done":
          return "done";
        case "failed":
        case "page-expired":
          return fault === "offline" && moment === "failed"
            ? "asking"
            : "failed";
        case "connected":
        case "added":
        case "declined":
        case "expired":
          return null;
      }
    })();
    if (!stage) {
      return null;
    }
    const again = moment === "reconnect";
    const base = {
      ...site,
      stage,
      again,
      fault: faultOf,
      why: again ? AGAIN[option] : WHY[option],
    };
    if (option === "pick") {
      return {
        ...base,
        accounts:
          moment === "no-account"
            ? []
            : ACCOUNTS.map((one) =>
                again && one.whose === "project"
                  ? { ...one, expired: true }
                  : one
              ),
        // A kept account is pressed while he picks, or asked again for;
        // every wait and failure is a new one's sign-in.
        picked: moment === "asking" || again ? "ops@petralab.ai" : ADD,
        as: ME,
      };
    }
    return {
      ...base,
      scopes:
        moment === "one-scope" ? ["files:read"] : ["Read-only", "Read & write"],
      scope: "Read-only",
      as: ME,
    };
  });

  /** How it settled, as the transcript keeps it. */
  const outcome = $derived.by((): ConnectOutcome | null => {
    const { service, server } = site;
    switch (moment) {
      case "connected":
        return option === "pick"
          ? {
              kind: "connected",
              service,
              server,
              as: "ops@petralab.ai",
              used: "project",
            }
          : { kind: "connected", service, server, as: ME, scope: "Read-only" };
      case "added":
        return { kind: "connected", service, server, as: ME };
      case "declined":
        return { kind: "declined", service, server, words };
      case "expired":
        return option === "pick"
          ? { kind: "expired", service, server, as: "ops@petralab.ai" }
          : { kind: "expired", service, server };
      case "asking":
      case "one-scope":
      case "no-account":
      case "waiting":
      case "parked":
      case "scrolled":
      case "done":
      case "failed":
      case "page-expired":
      case "reconnect":
        return null;
    }
  });

  /** The ask the composer grows into: A's and B's. */
  const grown = $derived(option === "card" ? null : open);

  /** One request id per frame: a parked one is kept parked in this tab only. */
  const requestId = untrack(
    () => `connect-${option}-${moment}-${fault}-${height}`
  );
  untrack(() => minimizedAsks.set(requestId, moment === "parked"));

  const composerAsk = $derived(
    grown
      ? {
          asker: AGENT,
          more: moment === "asking" ? 2 : 0,
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

  const card = $derived(option === "card" ? open : null);
  const settled = $derived(
    moment === "connected" || moment === "added" || moment === "declined"
  );
  /** C's card is open somewhere above: the chip at the tray row's end says so. */
  const needsChip = $derived(!!card && card.stage !== "done");
  /** The transcript held at its end: now, and whenever what it holds changes size. */
  const toEnd: Attachment<HTMLElement> = (node) => {
    const end = () => {
      node.scrollTop = node.scrollHeight;
    };
    end();
    const sizes = frameObserver(end);
    sizes.observe(node);
    if (node.firstElementChild) {
      sizes.observe(node.firstElementChild);
    }
    return () => sizes.disconnect();
  };
  const draft = new ComposerDraft();
  let foot = $state<ComposerFoot>({ parked: 0, perch: 0, stack: 0 });
</script>

<!-- C's chip: the tray row's chip in the brand ink, at the row's end where
     the "N failed" chip stands; it takes the reader to the card. -->
{#snippet needs()}
  <button
    data-slot="needs-chip"
    aria-label="{connectWords.needsYou(1)}: {connectWords.cardTitle(
      site.service
    )}"
    class={chipVariants({
      variant: "tray",
      class: "touch-hit text-brand-ink before:bg-brand-wash",
    })}
    data-tray-chip
    type="button"
  >
    <span class="whitespace-nowrap">{connectWords.needsYou(1)}</span>
    <IconChevronDown aria-hidden="true" class="rotate-180" />
  </button>
{/snippet}

<div
  data-slot="connect-frame"
  class="relative w-full h-(--frame-h) overflow-hidden bg-surface-page"
  style:--frame-h="{height}px"
>
  <!-- The transcript scrolls, held at its end as a live one is: what the
       turn said before the ask stands above, a scroll away. -->
  <div
    data-slot="tx"
    class="h-full overflow-y-auto overscroll-contain"
    {@attach toEnd}
  >
    <div
      class="flex flex-col justify-end min-h-full pb-(--tx-room) ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5 tx-columns"
      style:--tx-room="calc(var(--c-composer-panel) + var(--c-tray-row) + {foot.parked}px
      + var(--space-4))"
    >
      <MessageRow agentName={AGENT} message={before.plan} />
      <ToolGroup messages={before.refused} />
      {#if card}
        <ConnectCard ask={card} asker={AGENT} reaches={REACHES} />
      {:else if outcome}
        <ConnectRow {outcome} />
      {/if}
      {#if moment === "scrolled"}
        <!-- The turn went on past the card while it waited: what he reads
             coming back from the provider's tab, the card a screen above. -->
        <MessageRow agentName={AGENT} message={meanwhile.said} />
        <ToolGroup messages={meanwhile.calls} />
        <MessageRow agentName={AGENT} message={meanwhile.next} />
      {/if}
      {#if settled && outcome?.kind === "connected"}
        <ToolGroup messages={after.read} />
        <MessageRow agentName={AGENT} message={after.next} />
      {:else if settled}
        <MessageRow agentName={AGENT} message={after.declined} />
      {/if}
    </div>
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
    planRing={needsChip ? needs : undefined}
    showing="connect"
    trayRows={[{ delegatesOf: "", id: "connect" }]}
  />
</div>
