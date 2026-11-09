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
   *
   * A row's press lands where the pane sends it (session-waiting.svelte.ts
   * `open`): a question's or a permission's row puts the list away and the
   * composer grows into the question, answered there (its row and its bar
   * go); a sign-in's puts the list away (its card is the transcript's); an
   * artifact's row opens its page in the panel beside the conversation (a
   * sheet over it on a phone and in Caw's panel) at its card, the list
   * staying open. `opened`/`landed` draw a press already made: `ask`, the
   * question grown; `card`, the first card's page open in the panel.
   */
  import { untrack } from "svelte";
  import { MediaQuery, SvelteSet } from "svelte/reactivity";
  import { provideHub } from "#lib/cawco/hub-seam.js";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { minimizedAsks } from "#lib/cawco/minimized-asks.svelte.js";
  import PlanRing from "#lib/cawco/plan/PlanRing.svelte";
  import CoverState from "#lib/cawco/preview/CoverState.svelte";
  import pageDesk from "#lib/cawco/preview/fixtures/title-bars-close-desk.webp";
  import pagePhone from "#lib/cawco/preview/fixtures/title-bars-close-phone.webp";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
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
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
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
  import { isAsk, type WaitingRow } from "../rows";
  import WaitingCard from "../WaitingCard.svelte";
  import WaitingChip from "../WaitingChip.svelte";
  import FixtureTray from "./FixtureTray.svelte";

  let {
    rows,
    opened = false,
    height = 760,
    asked = null,
    caw = false,
    landed = null,
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
    /** A row's press already made: the question grown in the composer, or the first card's page open beside. */
    landed?: "ask" | "card" | null;
  } = $props();

  /** Each frame's own session, so each frame's composer layer is its own and every frame can stand open at once. */
  const frame = $props.id();
  const SESSION = `s-orchestrator-${frame}`;

  // A story's args are the live instance's inputs: the press flips its own copy, and a new arg resets it.
  let shown = $state(false);
  $effect.pre(() => {
    shown = opened;
  });

  // The hub as the composer's question reads it: connected, so its Answer is live; nothing here reads the hub's REST.
  provideHub({
    state: "connected",
    read: () => Promise.reject(new Error("The canvas reaches no hub.")),
  });

  /** A press the fixture answers with nothing: the plan's ring and the composer's send are another screen's. */
  const nothing = () => undefined;
  const fleet = { ...composerFleet, DelegateTray: FixtureTray };
  const draft = new ComposerDraft();
  const phone = new MediaQuery(PHONE_QUERY);

  /** The asks answered here: their rows and the question's bar go, as the hub takes them. */
  const taken = new SvelteSet<string>();
  /** The artifact row whose page stands open in the panel. */
  let paged = $state<WaitingRow | null>(null);
  const live = $derived(
    rows.filter((row) => !(isAsk(row) && taken.has(row.requestId)))
  );

  /** A row pressed: where the pane sends it (session-waiting.svelte.ts `open`). */
  function onopen(row: WaitingRow): void {
    if (isAsk(row)) {
      shown = false;
      if (row.kind !== "connect" && ask) {
        minimizedAsks.set(ask.request.requestId, false);
      }
      return;
    }
    paged = row;
  }

  // A press already made, drawn as the story asks.
  $effect.pre(() => {
    if (landed === "card") {
      paged = rows.find((row) => !isAsk(row)) ?? null;
    }
  });

  /** The question folded to its bar, as the hub parks an AskUserQuestion. */
  const ask = $derived.by((): ComposerAsk | null => {
    if (!asked || taken.has("r-question")) {
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
      onanswer: () => {
        taken.add(request.requestId);
        return null;
      },
    };
  });
  // Folded to its bar as the story opens, unless the story is the press that grew it.
  $effect.pre(() => {
    if (asked) {
      const fold = landed !== "ask";
      // Untracked: the store reads its own set as it writes, and the story's fold would answer every later press.
      untrack(() => minimizedAsks.set("r-question", fold));
      if (landed === "ask") {
        shown = false;
      }
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
    onopen={() => {
      shown = !shown;
    }}
    open={live.length}
    {shown}
  />
  {#if shown && live.length > 0}
    <WaitingCard
      onclose={() => {
        shown = false;
      }}
      {onopen}
      paneId={SESSION}
      rows={live}
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

<!-- The page a pressed artifact row opens, in the panel: the decision page
     at its card where the fixture holds its picture, else the panel's own
     cover while the page loads. -->
{#snippet panel(row: WaitingRow, placement: "beside" | "sheet")}
  {#if !isAsk(row)}
    <SideSurface
      label="Preview"
      of="preview"
      onclose={() => {
        paged = null;
      }}
      {placement}
      subtitle={row.words}
      title={row.artifact.title}
    >
      <div
        class="size-full overflow-y-auto overscroll-contain pt-(--side-room) scroll-timeline-transcript-head no-scrollbar"
      >
        {#if row.artifact.id === "a-bars"}
          <img
            alt={row.artifact.title}
            class="block h-auto max-w-full"
            src={placement === "sheet" ? pagePhone : pageDesk}
          />
        {:else}
          <div class="grid size-full place-items-center">
            <CoverState waiting={{ line: `Opening ${row.artifact.title}` }} />
          </div>
        {/if}
      </div>
    </SideSurface>
  {/if}
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
        {#if paged}
          <!-- Caw's panel holds one view at a time: the page takes it whole,
               its Close leading back to the conversation. -->
          <div class="absolute inset-0 z-3 flex flex-col">
            {@render panel(paged, "sheet")}
          </div>
        {/if}
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
                  {#if live.length > 0}
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
      <!-- The conversation, and beside it on a desk the panel a pressed
           row opened; on a phone the panel is a sheet over it. -->
      <div class="relative flex min-h-0 flex-auto">
        <div class="flex min-w-0 flex-auto flex-col">
          {@render conversation()}
        </div>
        {#if paged && !phone.current}
          <div class="flex w-1/2 flex-none flex-col p-space-2">
            {@render panel(paged, "beside")}
          </div>
        {:else if paged}
          <div
            class="absolute inset-x-0 bottom-0 top-space-6 z-3 flex flex-col"
          >
            {@render panel(paged, "sheet")}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</TooltipProvider>
