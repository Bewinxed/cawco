<!--
  The compact Comments panel's stage (its states file,
  CommentPanelCompact.stories.ts): a preview pane at a narrow window's size
  used with a mouse, its page drawn here (it stands for the artifact's
  frame), and the compact panel beside it, the open comment's thread the
  real PinCard hung from its row. What is open is a prop, so a story's flow
  moves the live panel and its own hang plays.
-->
<script lang="ts">
  import { pinName } from "@cawco/core/pin-name";
  import { ComposerDraft } from "../transcript/composer-draft.svelte";
  import CommentPanelCompact from "./CommentPanelCompact.svelte";
  import {
    AGENT,
    OPEN_PIN,
    OPEN_TEXT,
    OTHER_PINS,
  } from "./comment-panel-fixture";
  import PinCard from "./PinCard.svelte";

  let {
    pane,
    open = null,
  }: {
    /** The preview pane's size, px. */
    pane: { w: number; h: number };
    /** The comment whose thread hangs from its row, by its id. */
    open?: string | null;
  } = $props();

  const pins = [...OTHER_PINS.slice(0, 2), OPEN_PIN, OTHER_PINS[2]];
  const unread = new Set([OPEN_PIN.id]);
  const draft = new ComposerDraft({ byReference: true });
  let shown = $state<string | null>(null);
  $effect(() => {
    shown = open;
  });
  const pin = $derived(pins.find((one) => one.id === shown) ?? null);
  const none = () => undefined;
</script>

<div
  class="relative flex w-(--pane-w) h-(--pane-h) overflow-hidden bg-surface-well @container"
  data-slot="fixture-pane"
  style:--pane-w={`${pane.w}px`}
  style:--pane-h={`${pane.h}px`}
>
  <div class="min-w-0 flex-1 overflow-hidden" data-slot="fixture-well">
    <article
      class="mx-auto max-w-phone px-space-6 pt-space-8 text-ink-strong"
      data-slot="fixture-page"
    >
      <h1 class="m-0 type-title">Reconnecting to the hub</h1>
      <p class="mt-space-3 mb-0 text-ink-muted type-body text-pretty">
        What a machine does when its link to the hub drops, and what the
        dashboard says while it does.
      </p>
      <h2 class="mt-space-8 mb-0 type-label">Where it connects</h2>
      <p class="mt-space-2 mb-0 type-body text-pretty">
        The hub listens on 7421 over the tailnet. A machine finds it by mDNS on
        the LAN first, then by the address it was paired with.
      </p>
      <h2 class="mt-space-8 mb-0 type-label">Retry policy</h2>
      <p class="mt-space-2 mb-0 type-body text-pretty">{OPEN_TEXT}</p>
      <p class="mt-space-3 mb-0 type-body text-pretty">
        Each try is written to the daemon's log. The machine's row shows it as
        connected until it has been silent for 90 seconds.
      </p>
    </article>
  </div>
  <div
    class="flex flex-none border-s border-border-hairline"
    data-slot="panel-beside"
  >
    <CommentPanelCompact
      onclose={none}
      onopen={(id) => {
        shown = id;
      }}
      onshut={() => {
        shown = null;
      }}
      open={shown}
      {pins}
      {unread}
    >
      {#snippet thread()}
        {#if pin}
          <PinCard
            agentName={AGENT}
            {draft}
            link={`https://hub.local/a/reconnect-doc#pin-${pin.number}`}
            marked={false}
            name={pinName(pin)}
            onclose={() => {
              shown = null;
            }}
            ondelete={async () => undefined}
            onfind={none}
            onplace={none}
            onreply={none}
            onresolve={none}
            onretry={none}
            parent="Retry policy"
            {pin}
            problem={null}
          />
        {/if}
      {/snippet}
    </CommentPanelCompact>
  </div>
</div>
