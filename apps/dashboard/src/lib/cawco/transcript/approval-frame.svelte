<script lang="ts">
  /**
   * A permission ask in the session it was asked in (the approval card's
   * states file's fixture): the transcript's foot, the agent's last words,
   * over the real composer (Composer, with the app's own `composerFleet`)
   * grown into the ask, in the card the story names: the sentence
   * (ApprovalCard) or main's card of 10-24, for the owner's pick. Nothing
   * reaches a hub: the stories' hub stand-in answers, and every answer goes
   * nowhere.
   */
  import { setContext } from "svelte";
  import type { Message } from "../types";
  import { type ApprovalAsk, approvalAsk } from "./approval-fixtures";
  import ApprovalPrompt, {
    APPROVAL_LOOK,
    type ApprovalLook,
  } from "./approval-frame-prompt.svelte";
  import Composer, { type ComposerFoot } from "./Composer.svelte";
  import { ComposerDraft } from "./composer-draft.svelte";
  import { composerFleet } from "./composer-fleet";
  import MessageRow from "./MessageRow.svelte";

  let {
    ask,
    look = "sentence",
    height = 640,
  }: {
    ask: ApprovalAsk;
    /** The sentence card, or main's card of 10-24. */
    look?: ApprovalLook["look"];
    /** The pane's height, px: the room over the composer. */
    height?: number;
  } = $props();

  const AGENT = "Claude Code";

  // svelte-ignore state_referenced_locally
  setContext<ApprovalLook>(APPROVAL_LOOK, { harness: "claude", look });

  const { request, scene } = $derived(approvalAsk(ask));
  const said = $derived<Message>({
    id: `said-${ask}`,
    instanceId: request.instanceId,
    content: scene.said,
    type: "assistant",
  });
  const composerAsk = $derived({
    asker: AGENT,
    more: 0,
    onanswer: () => null,
    request,
  });
  const fleet = { ...composerFleet, Prompt: ApprovalPrompt };
  const draft = new ComposerDraft();
  let foot = $state<ComposerFoot>({ parked: 0, perch: 0, stack: 0 });
</script>

<div
  data-slot="approval-frame"
  class="relative w-full h-(--frame-h) overflow-hidden bg-surface-page"
  style:--frame-h="{height}px"
>
  <div
    data-slot="tx"
    class="flex flex-col justify-end h-full pb-(--tx-room) ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5 tx-columns"
    style:--tx-room="calc(var(--c-composer-panel) + var(--c-tray-row) + {foot.parked}px
    + var(--space-4))"
  >
    <MessageRow agentName={AGENT} message={said} />
  </div>
  <Composer
    agentName={AGENT}
    ask={composerAsk}
    {draft}
    {fleet}
    onfoot={(next) => {
      foot = next;
    }}
    onstop={() => undefined}
    onsubmit={() => undefined}
    showing={request.instanceId}
    trayRows={[{ delegatesOf: "", id: request.instanceId }]}
  />
</div>
