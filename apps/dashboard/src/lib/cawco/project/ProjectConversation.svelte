<script lang="ts">
  import { detach } from "@cawco/core/detach";
  /**
   * Caw's panel on the project's page (CawFloat): the project's
   * conversation, a session like any other drawn by SessionPane, docked, so
   * it is the transcript's own rows and the session Composer at its foot,
   * with its commands, mentions and skills.
   *
   * - It shows the project's newest conversation (CawLead `conversation`:
   *   a session a person or the project started there), or the hero when
   *   there is none: "What's next for <project>?" under a new conversation's
   *   glyph, the project's starters as rows under it. It draws no Caw: his
   *   seat on the page is the one live Caw (DESIGN.md, The Flock Rule). A starter puts its words in the
   *   composer; nothing is sent. The first words start a conversation
   *   (conversation.ts), and the panel shows it.
   * - Its bar (BarFloat; DESIGN.md, The Title Bars Follow Liquid Glass
   *   Rule) is one row with no ground over the conversation and no title
   *   (his seat opened it by his name; each of his conversations is named by
   *   what it is about where they are listed), in one glass group whether
   *   he is on (Caw is off said in words, the state no
   *   symbol says), Session details, New conversation and Open as a tab, and
   *   the phone sheet's Close in a group of its own. Caw is on/off opens his
   *   settings (CawPanel: what he is doing, his switch, its off tray), so he
   *   is turned on or off where he is talked to. Session details opens the
   *   session's card (SessionDetails); on the conversation the project's
   *   events reach, its harness and model are the project's (ModelSection).
   * - Its two tabs (decision page `onboarding-design`, card `artifact-open`):
   *   Assistant, the conversation; Preview, what the conversation shows (a
   *   preview, a canvas, a component, a page: PreviewPane, the same pane a
   *   session's split holds). The switch stands at the bar's top right
   *   while there is something to show, in his head and in the preview's own
   *   bar (`switchAt`; leading the bar is the other option on the card); Caw showing something brings it to
   *   the front, and the panel widens as Preview opens (the page's grid reads
   *   `lead.tab`, CawFloat). On Preview the pane's own head is the panel's one
   *   bar, the switch at its end (The Title Bars Follow Liquid Glass Rule).
   *   The conversation stays mounted under it, so going back loses nothing.
   * - While Caw sets the project up, his setup element stands at the
   *   transcript's end (`setup`, SetupWell), and the questions the board
   *   draws are not lent to the composer (`asksElsewhere`).
   */
  import { HARNESSES, type HarnessKind } from "@cawco/core/harness";
  import { CAW_NO_MACHINE } from "@cawco/core/project-conversation";
  import { commonWords } from "@cawco/core/words/common";
  import { cawPanelWords } from "@cawco/core/words/onboarding";
  import {
    cawSwitchWords,
    conversationWords,
  } from "@cawco/core/words/project-conversation";
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import {
    cawco,
    type PendingPermission,
    type SendExtras,
  } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { rowHref } from "#lib/cawco/links.js";
  import { crossIn } from "#lib/cawco/motion/curves.svelte.js";
  import PreviewPane from "#lib/cawco/preview/PreviewPane.svelte";
  import {
    type ProjectStarter,
    readStages,
    tellStarterOutcome,
  } from "#lib/cawco/project-tasks.js";
  import RegionBoundary from "#lib/cawco/RegionBoundary.svelte";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import { sessionTitle } from "#lib/cawco/session-names.svelte.js";
  import { cawPanelOffAt } from "#lib/cawco/stop-work.svelte.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import FootFade from "#lib/cawco/transcript/FootFade.svelte";
  import TranscriptSkeleton from "#lib/cawco/transcript/TranscriptSkeleton.svelte";
  import SessionDetails from "#lib/cawco/workspace/SessionDetails.svelte";
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import {
    BarFloat,
    BarGlass,
    BarItem,
  } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChatAdd,
    IconClose,
    IconInfo,
    IconMaximize,
    IconMore,
    IconPlus,
    IconSettings,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { barGlass } from "../bar-glass.svelte";
  import CawPanel from "./CawPanel.svelte";
  import type { CawLead } from "./caw-lead.svelte";
  import { startConversation } from "./conversation";
  import SetupWell from "./SetupWell.svelte";
  import StarterCards from "./StarterCards.svelte";
  import { handedOver, type SetupProgress } from "./setup-progress";

  let {
    lead,
    projectId,
    projectName,
    sheet = false,
    setup = null,
    asksElsewhere,
    switchAt = "end",
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
    /**
     * In the phone's bottom sheet (CawFloat): his head is the sheet's one
     * header, so it carries the sheet's Close at its trailing edge.
     */
    sheet?: boolean;
    /** How far he has got setting the project up, while he drafts it in this conversation (SetupWell); null otherwise. */
    setup?: SetupProgress | null;
    /** The asks the board draws instead of the composer (SessionPane `asksElsewhere`). */
    asksElsewhere?: (request: PendingPermission) => boolean;
    /**
     * Where Assistant | Preview stands (decision page `onboarding-design`,
     * card `artifact-open`): at the bar's end, top right, as the person
     * asked; or leading it, where it never moves between the tabs.
     */
    switchAt?: "start" | "end";
  } = $props();

  // --- the conversation on show -------------------------------------------------

  /** The conversation this panel started, shown until the project's newest is it. */
  let chosen = $state<string | null>(null);
  /** New conversation was asked for: the hero shows until its first words start one. */
  let fresh = $state(false);
  $effect(() => {
    if (chosen && lead.conversationId === chosen) {
      chosen = null;
    }
  });
  const shown = $derived(fresh ? null : (chosen ?? lead.conversationId));
  /**
   * His conversation on show is still starting (CawLead `starting`: from
   * the hub's start until it has taken the words that started it): the
   * well shows him starting, never a session nothing has been said in nor
   * the hero asking for words already sent.
   */
  const startingHere = $derived(
    lead.starting && !fresh && (shown === null || shown === lead.conversationId)
  );
  function newConversation() {
    fresh = true;
    chosen = null;
    lead.draft.focusWanted = true;
  }
  // The head's Ask Caw and the views bar's "+" asked for new work: the hero,
  // its composer taking the caret, whether the panel was drawn then or opens
  // with it (CawLead `newConversation`).
  $effect(() => {
    if (lead.fresh) {
      untrack(() => {
        lead.fresh = false;
        newConversation();
      });
    }
  });

  // --- Assistant and Preview ----------------------------------------------------

  /**
   * The conversation on show has something to show: Preview stands beside
   * Assistant. (A project's setup page is never in it: the hub opens it in
   * no panel, the project's page draws it; core `setupLanding`.)
   */
  const previewOpen = $derived(
    shown !== null && cawco.previews[shown]?.state === "open"
  );
  // Caw showing something brings it to the front, as a session's split does
  // (SideSplit); with nothing left to show the panel is his conversation.
  let previewWas = untrack(() => previewOpen);
  $effect(() => {
    const now = previewOpen;
    if (now && !previewWas) {
      lead.tab = "preview";
    } else if (!now) {
      lead.tab = "assistant";
    }
    previewWas = now;
  });
  // A card of his pressed in the transcript asks for its preview again
  // (client `revealPreview`): Preview comes to the front.
  let askedWas = untrack(() => (shown ? cawco.previewRequests[shown] : 0));
  $effect(() => {
    const asked = shown ? cawco.previewRequests[shown] : 0;
    if (asked && asked !== askedWas && previewOpen) {
      lead.tab = "preview";
    }
    askedWas = asked;
  });
  const onPreview = $derived(previewOpen && lead.tab === "preview");

  // --- the setup element -----------------------------------------------------------

  // He is drawn in his setup element while it stands with the panel open:
  // the seat stands empty meanwhile, and he goes back to it as it goes.
  $effect(() => {
    const here = setup !== null && !handedOver(setup) && lead.open;
    lead.inPanel = here;
    return () => {
      lead.inPanel = false;
    };
  });

  // --- his bar -------------------------------------------------------------------

  const off = $derived(lead.on === false);
  /** His settings stand open from the bar (Caw is on / Caw is off pressed). */
  let settingsOpen = $state(false);
  let settingsAnchor = $state<HTMLElement | null>(null);
  /** The sheet's More, which Session details opens from on a phone. */
  let moreAnchor = $state<HTMLElement | null>(null);

  // --- the session's card ---------------------------------------------------------

  const fine = new MediaQuery("(hover: hover) and (pointer: fine)");
  let cardOpen = $state(false);
  let cardPinned = $state(false);
  let cardAnchor = $state<HTMLElement | null>(null);
  let cardTimer: ReturnType<typeof setTimeout> | undefined;
  /** As a session tab's card: a pointer resting 350ms opens it, leaving for 250ms closes it, a press keeps it. */
  function cardRest(event: PointerEvent) {
    if (!fine.current || event.pointerType !== "mouse" || cardPinned) {
      return;
    }
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => {
      cardOpen = true;
    }, 350);
  }
  function cardLeave() {
    clearTimeout(cardTimer);
    if (!cardPinned) {
      cardTimer = setTimeout(() => {
        cardOpen = false;
      }, 250);
    }
  }
  function cardPress() {
    clearTimeout(cardTimer);
    if (cardOpen && cardPinned) {
      cardOpen = false;
      cardPinned = false;
      return;
    }
    cardOpen = true;
    cardPinned = true;
  }
  function cardClose() {
    clearTimeout(cardTimer);
    cardOpen = false;
    cardPinned = false;
  }
  $effect(() => () => clearTimeout(cardTimer));

  /** A model was picked in the card: its pending and refusal are the card's model line. */
  let choosing = $state(false);
  /**
   * On the conversation the project's events reach, its harness and model
   * are the project's settings (the project's row): a model picked on
   * another harness's rail moves it to the two together. Any other
   * conversation's card is its own session's.
   */
  const kept = $derived(
    lead.harness &&
      shown !== null &&
      shown === lead.project?.conversationInstanceId
      ? {
          harness: lead.harness,
          model: lead.model,
          // A conversation runs on every harness CawCo runs.
          harnesses: [...HARNESSES],
          onchoose: ({
            harness,
            model,
          }: {
            harness: HarnessKind;
            model: string;
          }) => {
            choosing = true;
            lead.configure(
              harness === lead.harness
                ? { model: model || null }
                : { harness, model: model || null }
            );
          },
          pending: choosing && lead.moving,
          refused: choosing ? lead.refused : null,
        }
      : undefined
  );

  // --- the hero: no conversation yet --------------------------------------------

  /** The project's starters its stages carried, read for the hero. */
  let startersRead = $state<ProjectStarter[] | undefined>(undefined);
  /** The project's starters, live: a new set the hub writes replaces the read one. */
  const starters = $derived(cawco.startersOf(projectId, "board", startersRead));
  $effect(() => {
    const pid = projectId;
    if (!(shown === null && pid && cawco.status === "connected")) {
      return;
    }
    untrack(() => {
      readStages(pid).then(
        (stagesRead) => {
          if (pid === projectId) {
            startersRead = stagesRead.starters;
          }
        },
        () => undefined
      );
    });
  });
  /** A starter's sentence into the composer, the caret after it; nothing is sent. */
  function pick(text: string) {
    lead.draft.press(text, "board");
  }

  /** The first words are on their way: the conversation they start is being asked for. */
  let starting = $state(false);
  /** Why the last start was refused, said over the field. */
  let startError = $state("");
  /** The first words start a conversation in the project, which the panel then shows. */
  async function start(text: string, extras: SendExtras) {
    starting = true;
    startError = "";
    lead.began();
    try {
      const id = await startConversation(projectId, text, extras);
      // A starter pressed into the field went: as its words stood, or
      // changed. The hub keeps it as Jev's steering; nothing waits on it.
      const pressed = lead.draft.takePressed(text);
      if (pressed) {
        tellStarterOutcome(projectId, pressed).catch(() => undefined);
      }
      lead.draft.settle();
      chosen = id;
      fresh = false;
    } catch (error) {
      startError = failureWords(error);
      lead.draft.restore(text, extras);
    } finally {
      starting = false;
    }
  }

  /**
   * The composer has a place of its own at the panel's foot and the hero's
   * room ends over it, as a docked conversation's does (SessionPane
   * `reserved`); with no machine for a conversation, the line that says so
   * stands there instead.
   */
  const reserved =
    "calc(var(--space-4) + var(--safe-bottom) + var(--c-composer-panel) + var(--c-tray-row) + var(--space-2))";
</script>

<!-- Assistant and Preview: the switch in whichever bar heads the panel,
     his on Assistant, the preview's own on Preview (`switchAt`). -->
{#snippet switcher()}
  <!-- Whole at every width. Over the floating bar, whose row takes no
       press, it takes its own (BarFloat lets only its groups through). -->
  <div class="pointer-events-auto flex-none" data-slot="caw-tabs">
    <Tabs
      onValueChange={(next) => {
        lead.tab = next === "preview" ? "preview" : "assistant";
      }}
      size="compact"
      value={onPreview ? "preview" : "assistant"}
    >
      <TabsList aria-label={cawPanelWords.tabs}>
        <TabItem label={cawPanelWords.assistant} value="assistant" />
        <TabItem label={cawPanelWords.preview} value="preview" />
      </TabsList>
    </Tabs>
  </div>
{/snippet}

<div
  class="relative flex h-full min-h-0 flex-auto flex-col timeline-scope-transcript-head"
  data-caw-panel
  data-caw-tab={onPreview ? "preview" : "assistant"}
>
  <!-- The panel's bar (DESIGN.md, The Title Bars Follow Liquid Glass Rule):
       one row with no ground, floating over the conversation, which runs to
       the panel's top, clears the bar at rest and blurs and fades under it
       from the first scroll (BarFloat). It has no title: his seat opened it
       by his name, and the conversation is named where his conversations
       are listed (the rail, its tab, Session details) by what it is about.
       His controls float in the top bar's glass: whether he is on (words only while he is off, the
       state no symbol says), Session details, New conversation and Open as
       a tab in one group, the sheet's Close in one of its own (HIG,
       Toolbars). On Preview the preview's own bar is the panel's one. -->
  {#if !onPreview}
    <BarFloat tint="bg-surface-recess">
      {#snippet leading()}
        {#if previewOpen && (switchAt === "start" || sheet)}
          <!-- Leading: where the preview's own bar holds a surface's switch
               (SideSurface, as a session's Plan | Preview), so it stays put
               as the tabs change; on a phone's sheet always, where the
               trailing half holds his group and Close. -->
          {@render switcher()}
        {/if}
      {/snippet}
      {#snippet trailing()}
        {#if previewOpen && switchAt === "end" && !sheet}
          {@render switcher()}
        {/if}
        <BarGlass form="group">
          {#if lead.on !== null}
            <!-- Whether he is on, his settings pressed open: his switch and,
                 turning him off with work running, what it stops. -->
            <Tip label={off ? cawSwitchWords.off : cawSwitchWords.on}>
              {#snippet children(tip)}
                <button
                  {...tip}
                  aria-expanded={settingsOpen}
                  aria-haspopup="dialog"
                  aria-label={off ? cawSwitchWords.off : cawSwitchWords.on}
                  class="mark-line select-none touch-hit press-tint"
                  data-bar-item
                  data-box
                  data-caw-on={off ? "off" : "on"}
                  data-counted={off ? "" : undefined}
                  onclick={() => {
                    settingsOpen = !settingsOpen;
                  }}
                  type="button"
                  bind:this={settingsAnchor}
                >
                  <IconSettings aria-hidden="true" data-slot="bar-symbol" />
                  {#if off}
                    <span data-slot="num">{cawSwitchWords.off}</span>
                  {/if}
                </button>
              {/snippet}
            </Tip>
          {/if}
          {#if shown && sheet}
            <!-- A phone's sheet has room for one group and Close beside
                 Assistant | Preview: Session details and Open as a tab go
                 under More. -->
            <BarItem
              icon={IconPlus}
              label={conversationWords.newConversation}
              onclick={newConversation}
            />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <BarItem
                    icon={IconMore}
                    label={commonWords.moreFor(conversationWords.conversation)}
                    {props}
                    bind:ref={moreAnchor}
                  />
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" width="regular">
                <DropdownMenu.Item
                  onSelect={() => {
                    cardAnchor = moreAnchor;
                    cardPress();
                  }}
                >
                  <IconInfo />
                  <span>{transcriptWords.sessionDetails}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => goto(rowHref(shown ?? ""))}>
                  <IconMaximize />
                  <span>{conversationWords.openAsTab}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else if shown}
            <BarItem
              aria-expanded={cardOpen}
              aria-haspopup="dialog"
              icon={IconInfo}
              label={transcriptWords.sessionDetails}
              onclick={cardPress}
              onpointerenter={(event: PointerEvent) => {
                cardAnchor = event.currentTarget as HTMLElement;
                cardRest(event);
              }}
              onpointerleave={cardLeave}
              bind:ref={cardAnchor}
            />
            <BarItem
              icon={IconPlus}
              label={conversationWords.newConversation}
              onclick={newConversation}
            />
            <BarItem
              href={rowHref(shown ?? "")}
              icon={IconMaximize}
              label={conversationWords.openAsTab}
            />
          {/if}
        </BarGlass>
        {#if sheet}
          <BarGlass form="group">
            <Drawer.Close>
              {#snippet child({ props })}
                <BarItem icon={IconClose} label="Close" {props} />
              {/snippet}
            </Drawer.Close>
          </BarGlass>
        {/if}
      {/snippet}
    </BarFloat>
  {/if}
  <!-- His settings, from the bar: what he is doing, his switch, and its off
       tray when turning him off leaves work running (CawLeadSwitch). -->
  <Popover.Root bind:open={settingsOpen}>
    <Popover.Content
      align="end"
      aria-label={cawSwitchWords.settings}
      class="w-(--settings-w)"
      collisionPadding={12}
      customAnchor={settingsAnchor}
      data-caw-settings
      pad="inset"
      side="bottom"
      sideOffset={4}
      style="--settings-w: min(var(--c-panel-w), calc(100vw - var(--space-5)))"
    >
      <CawPanel
        {lead}
        place={cawPanelOffAt(projectId)}
        {projectId}
        {projectName}
        sheet
      />
    </Popover.Content>
  </Popover.Root>
  <div data-slot="well" class="relative flex min-h-0 flex-auto flex-col">
    {#if startingHere}
      <!-- His start, on the transcript's own columns where his conversation
           will stand: setting the project up, his setup element at its first
           step (SetupWell, the page's one live Caw meanwhile); else his
           starting line. -->
      <div
        data-slot="caw-starting"
        data-tx-columns
        class="tx-columns flex min-h-0 flex-auto flex-col overflow-y-auto scroll-timeline-transcript-head ps-space-7 pe-space-6 pt-c-top-bar-h max-desk:ps-space-5 max-desk:pe-space-5"
        in:crossIn
      >
        {#if setup}
          {@render setupTail()}
        {:else}
          <p
            class="mark-line flex items-center gap-space-2 py-space-5 text-size-meta font-normal text-ink-muted"
            role="status"
          >
            <LiveDot /><span>{conversationWords.status.starting}</span>
          </p>
        {/if}
      </div>
    {:else if shown}
      <!-- The conversation stays laid out under Preview, so going back to it
           finds it as it was; only the tab on show takes the pointer. -->
      <div
        class={["flex min-h-0 flex-auto flex-col", onPreview && "invisible"]}
        inert={onPreview}
      >
        {#key shown}
          <!-- The conversation is the transcript being read over the page:
               focused, so its rows follow every message as it lands and it
               rides the tail (Transcript `focused`). -->
          <SessionPane
            active
            {asksElsewhere}
            browsing={null}
            browsingCwd=""
            browsingHarness={undefined}
            docked={{ draft: lead.draft, headRoom: "var(--c-top-bar-h)" }}
            focused={!onPreview}
            afterRows={setup ? setupTail : undefined}
            afterRowsAtWork={setup !== null && !handedOver(setup)}
            viewId={shown}
            visible={!onPreview}
          />
        {/key}
      </div>
      {#if previewOpen}
        <div
          data-slot="preview"
          class={[
            "absolute inset-0 flex min-h-0 flex-col bg-surface-raised",
            !onPreview && "invisible",
          ]}
          inert={!onPreview}
        >
          <PreviewPane
            instanceId={shown}
            onScreen={onPreview}
            {sheet}
            {switcher}
            switcherAt={switchAt}
          />
        </div>
      {/if}
    {:else if !(fresh || cawco.liveRead)}
      <!-- The fleet's first snapshot is not in: whether the project has a
           conversation is not known yet, so nothing claims it has none. -->
      <TranscriptSkeleton />
    {:else}
      <!-- The hero's own block: what fades out in it (its foot fade, its
           composer's parts) plays only when it is put away by its own
           condition, never as the conversation takes its place, so two
           composers never stand at once in the panel (the docked panel drew
           "Message Caw…" over the conversation's composer while they faded). -->
      {#if !shown}
        <div
          data-slot="pane"
          class="@container relative flex min-h-0 min-w-0 flex-auto flex-col bg-surface-recess pb-(--reserved)"
          style:--composer-clearance="var(--space-4)"
          style:--reserved={reserved}
        >
          <!-- The hero: the empty board's (project page `.caw-empty`), from the
             room's top, its inline padding the composer's own column, so its
             glyph, the title, the line and the starters share the composer's start
             edge (--space-3 where the composer goes edge to edge, under
             900px). It clears the composer as a transcript does. -->
          <div
            class="isolate flex min-h-0 flex-auto flex-col overflow-y-auto scroll-timeline-transcript-head px-(--hero-px) pt-c-top-bar-h pb-(--composer-clearance) max-desk:px-space-3"
            data-slot="conversation-hero"
            style:--hero-px="calc((100% - var(--c-composer-w)) / 2)"
            in:crossIn
          >
            <EmptyState
              actionWidth="fill"
              axis
              icon={IconChatAdd}
              title="What’s next for {projectName}?"
            >
              {#snippet action()}
                {#if starters.length > 0}
                  <StarterCards onpick={pick} rows {starters} />
                {/if}
              {/snippet}
            </EmptyState>
          </div>
          <FootFade />
          {#if lead.canTalk}
            <!-- No conversation lends this panel a composer yet: it draws its
               own, where a conversation's stands, over the pane, taking no
               press but the composer's own. -->
            <div
              data-slot="composer-dock"
              class="pointer-events-none absolute inset-0 z-1"
            >
              <RegionBoundary face="composer" part="composer">
                <Composer
                  fleet={composerFleet}
                  agentName="Caw"
                  draft={lead.draft}
                  onstop={() => undefined}
                  onsubmit={(text, extras) => {
                    start(text, extras);
                  }}
                  paneVisible
                  placeholder={conversationWords.placeholder.short}
                  sendError={startError}
                  sending={starting}
                />
              </RegionBoundary>
            </div>
          {:else if lead.project}
            <!-- No composer: no conversation can start to read it. What is
               true, and the one thing that changes it, the machines, where
               the composer stands when there is one. -->
            <div
              class="absolute inset-x-0 bottom-(--off-bottom) z-(--layer-dock) mx-auto w-c-composer-w"
              data-safe-bottom
              style:--off-bottom="calc(var(--space-4) + var(--safe-bottom))"
              in:crossIn
            >
              <Alert layout="row" role="status" surface="card">
                <AlertDescription>{CAW_NO_MACHINE}</AlertDescription>
                <AlertAction>
                  <Button
                    label="Check machines"
                    onclick={() => {
                      barGlass.open = "machines";
                    }}
                    size="sm"
                    variant="outline"
                  />
                </AlertAction>
              </Alert>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>

{#snippet setupTail()}
  {#if setup}
    <SetupWell
      onreview={() => detach(lead.reviewDraft(), "review the draft")}
      progress={setup}
      status={lead.status}
    />
  {/if}
{/snippet}

{#if shown}
  <Popover.Root
    onOpenChange={(next) => {
      if (!next) {
        cardClose();
      }
    }}
    open={cardOpen}
  >
    <Popover.Content
      data-caw-lead-card
      align="start"
      aria-label="Caw’s session"
      class="w-(--lead-w)"
      height="room"
      overflow="clip"
      pad="none"
      style="--lead-w: min(var(--c-lead-card-w), calc(100vw - var(--space-7))); --pop-max-h: min(var(--c-lead-card-max-h), var(--bits-popover-content-available-height, var(--c-sheet-max-h)))"
      collisionPadding={12}
      customAnchor={cardAnchor}
      onfocusin={() => {
        clearTimeout(cardTimer);
        cardPinned = true;
      }}
      onOpenAutoFocus={(event) => {
        if (!cardPinned) {
          event.preventDefault();
        }
      }}
      onpointerdowncapture={() => {
        clearTimeout(cardTimer);
        cardPinned = true;
      }}
      onpointerenter={() => clearTimeout(cardTimer)}
      onpointerleave={cardLeave}
      side="bottom"
      sideOffset={4}
      trapFocus={cardPinned}
    >
      <SessionDetails
        dir={1}
        href={rowHref(shown)}
        {kept}
        onclose={cardClose}
        sessionId={shown}
        title={sessionTitle(shown) ?? projectName}
      />
    </Popover.Content>
  </Popover.Root>
{/if}
