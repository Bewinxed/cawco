<script lang="ts">
  import { conversationWords } from "@cawco/core/words/project-conversation";
  import { transcriptWords } from "@cawco/core/words/transcript";
  /**
   * A session's screen as the person meets it, for the canvas to draw the
   * list of what waits on him in each state: the session's tab and the
   * bar's glass floating over the conversation, its turns, and the real
   * composer (Composer) with its tray row, where the list's chip
   * (WaitingChip) stands before the plan's ring and its card (WaitingCard)
   * rises over the row. `caw`: the same conversation as Caw's docked panel
   * on a project's page (CawFloat, ProjectConversation), its own bar
   * floating over its turns.
   *
   * The composer, the chip, the card, the list and the ring are the
   * product's; the composer's fleet is the app's (composer-fleet.ts), its
   * delegate tray the one part drawn here (`FixtureTray`: the live tray
   * reads the hub's store). `asked`: the agent's question folded to its bar
   * on the tray row (minimized-asks.svelte.ts), the chip beside it.
   */
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { minimizedAsks } from "#lib/cawco/minimized-asks.svelte.js";
  import PlanRing from "#lib/cawco/plan/PlanRing.svelte";
  import Composer, {
    type ComposerAsk,
  } from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import {
    BarFloat,
    BarGlass,
    BarItem,
  } from "#lib/components/ui/bar-glass/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import {
    IconClose,
    IconFilesLinear,
    IconListRowsLinear,
    IconMoveTabLinear,
    IconNeedsYou,
    IconPlus,
    IconSearch,
    IconServerLinear,
  } from "#lib/icons.js";
  import { type WaitingRow, waitingCounts } from "../rows";
  import WaitingCard from "../WaitingCard.svelte";
  import WaitingChip from "../WaitingChip.svelte";
  import FixtureTray from "./FixtureTray.svelte";

  let {
    rows,
    opened = false,
    height = 760,
    asked = null,
    caw = false,
  }: {
    rows: WaitingRow[];
    /** The list stands open. */
    opened?: boolean;
    /** The frame's height, px. */
    height?: number;
    /** The agent's question, folded to its bar on the tray row. */
    asked?: string | null;
    /** The conversation is Caw's, in his panel on the project's page. */
    caw?: boolean;
  } = $props();

  /** Each frame's own session, so each frame's composer layer is its own and every frame can stand open at once. */
  const frame = $props.id();
  const SESSION = `s-orchestrator-${frame}`;

  // A story's args are the live instance's inputs: the press flips its own copy, and a new arg resets it.
  let shown = $state(false);
  $effect.pre(() => {
    shown = opened;
  });

  /** A press the fixture answers with nothing: the screen's own opens are the live pane's. */
  const nothing = () => undefined;
  const fleet = { ...composerFleet, DelegateTray: FixtureTray };
  const draft = new ComposerDraft();

  const counts = $derived(waitingCounts(rows));

  /** The question folded to its bar, as the hub parks an AskUserQuestion. */
  const ask = $derived.by((): ComposerAsk | null => {
    if (!asked) {
      return null;
    }
    const request: ComposerAsk["request"] = {
      heard: 0,
      instanceId: SESSION,
      requestId: "r-question",
      toolName: "AskUserQuestion",
      input: {
        questions: [
          {
            question: asked,
            header: "Nightly",
            multiSelect: false,
            options: [
              { label: "Ship it now", description: "" },
              { label: "Wait for the checks", description: "" },
            ],
          },
        ],
      },
      presentation: {
        asker: caw ? "Caw" : "Claude Code",
        changes: [],
        fields: [],
        summary: asked,
      },
    };
    return {
      request,
      asker: request.presentation.asker,
      more: 0,
      onanswer: () => null,
    };
  });
  $effect.pre(() => {
    if (ask) {
      minimizedAsks.set(ask.request.requestId, true);
    }
  });

  const TURNS = $derived(
    caw
      ? [
          "Three tasks moved to review this morning. The title bars are on main, and the Comments rail is waiting on your pick of where a pin's replies open on a phone.",
          "I've started a delegate on the delegate tray at 390. Its preview will come to you to judge once it draws at both widths.",
        ]
      : [
          "The Liquid Glass title bars are on main. They'll reach your machines in the next nightly, which I'm holding until two host checks on other fixes pass.",
          "With the bars landed, I've started the design for seeing a session's pending decisions from its own chat. Its options will come to you on one decision page.",
        ]
  );
</script>

{#snippet trailing()}
  <WaitingChip
    answered={counts.answered}
    onopen={() => {
      shown = !shown;
    }}
    open={counts.open}
    {shown}
  />
  {#if shown && rows.length > 0}
    <WaitingCard
      agent={caw ? "Caw" : "Claude Code"}
      onclose={() => {
        shown = false;
      }}
      onopen={nothing}
      paneId={SESSION}
      {rows}
    />
  {/if}
  <PlanRing done={2} onopen={nothing} open={false} total={12} unseen={null} />
{/snippet}

{#snippet conversation()}
  <!-- The pane: its turns under the floating bar, then the composer docked over its foot. -->
  <div
    class="relative flex min-h-0 flex-auto flex-col bg-surface-raised"
    data-slot="pane"
  >
    <div
      class={[
        "min-h-0 flex-auto overflow-hidden px-space-7 max-desk:px-space-5",
        caw && "pbs-c-top-bar-h",
      ]}
    >
      <div
        class="mx-auto flex max-w-c-measure flex-col gap-space-5 pbs-space-4"
      >
        {#each TURNS as turn, n (n)}
          <article class="flex flex-col gap-space-2">
            <p class="type-label m-0 text-ink-row">
              {caw ? "Caw" : "Claude Code"}
            </p>
            <MessageBody source={turn} wrap="pretty" />
          </article>
        {/each}
      </div>
    </div>
    <div class="pointer-events-none absolute inset-0 z-1">
      <Composer
        agentName={caw ? "Caw" : "Claude Code"}
        {ask}
        {draft}
        {fleet}
        onstop={nothing}
        onsubmit={nothing}
        placeholder={caw ? conversationWords.placeholder.short : undefined}
        planRing={trailing}
        showing={SESSION}
        trayRows={[{ delegatesOf: SESSION, id: SESSION }]}
      />
    </div>
  </div>
{/snippet}

<TooltipProvider>
  {#if caw}
    <!-- A project's page with Caw's panel docked beside it, a conversation's width. -->
    <div
      class="flex h-(--fixture-h) overflow-clip bg-surface-shelf text-ink-strong"
      data-slot="caw-fixture"
      style:--fixture-h="{height}px"
    >
      <div
        class="flex min-w-0 flex-auto flex-col gap-space-4 p-space-6 max-desk:hidden"
      >
        <h1 class="type-title m-0">Cawco-Dev</h1>
        <p class="type-body m-0 text-ink-muted">
          31 tasks · 4 in review · 2 sessions working
        </p>
      </div>
      <div
        class="relative m-space-2 flex w-c-panel-w flex-none flex-col overflow-clip rounded-lg bg-surface-raised shadow-tile max-desk:m-0 max-desk:w-full max-desk:rounded-none"
        data-caw-panel
        style:--bar-room="var(--c-top-bar-h)"
      >
        <div class="absolute inset-x-0 top-0 z-2">
          <BarFloat tint="bg-surface-raised">
            {#snippet trailing()}
              <BarGlass form="group">
                <BarItem
                  icon={IconListRowsLinear}
                  label={transcriptWords.sessionDetails}
                />
                <BarItem
                  icon={IconPlus}
                  label={conversationWords.newConversation}
                />
                <BarItem
                  icon={IconMoveTabLinear}
                  label={conversationWords.openAsTab}
                />
              </BarGlass>
              <BarGlass form="group">
                <BarItem icon={IconClose} label={conversationWords.hidePanel} />
              </BarGlass>
            {/snippet}
          </BarFloat>
        </div>
        {@render conversation()}
      </div>
    </div>
  {:else}
    <div
      class="relative isolate flex h-(--fixture-h) flex-col overflow-clip bg-surface-shelf text-ink-strong"
      data-slot="session-fixture"
      style:--fixture-h="{height}px"
    >
      <!-- The shelf: the session's tab, then the bar's trailing glass, a
           step of room above it for the glass's corner counts. -->
      <div
        class="relative z-2 box-content flex h-c-top-bar-h flex-none items-end gap-space-3 pbs-space-3 ps-space-3 pe-space-2"
      >
        <div class="relative min-w-0 flex-auto">
          <Tabs value="this" variant="folder">
            <TabsList aria-label="Sessions">
              <TabItem label="Continue CawCo open tasks" value="this">
                {#snippet lead()}
                  {#if counts.open > 0}
                    <IconNeedsYou
                      aria-hidden="true"
                      class="size-icon-md text-status-attn-glyph"
                    />
                  {/if}
                {/snippet}
              </TabItem>
            </TabsList>
          </Tabs>
        </div>
        <div class="relative flex-none self-center max-desk:hidden">
          <BarGlass form="group">
            <BarItem count={100} icon={IconFilesLinear} label="Files, 100" />
            <BarItem label="Jump to session">
              <IconSearch
                aria-hidden="true"
                class="size-icon-md text-ink-muted"
              />
            </BarItem>
            <BarItem count={4} icon={IconServerLinear} label="4 machines" />
          </BarGlass>
        </div>
      </div>
      {@render conversation()}
    </div>
  {/if}
</TooltipProvider>
