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
   * - It carries no title (DESIGN.md, The Title Bars Follow Liquid Glass
   *   Rule: a column opened by its name): Session details, New conversation
   *   and Open as tab float over the conversation as one glass group, and
   *   the phone sheet's Close as one of its own. Session details opens the
   *   session's card (SessionDetails); on the conversation the project's
   *   events reach, its harness and model are the project's (ModelSection).
   * - Its two tabs (decision page `onboarding-design`, card `artifact-open`):
   *   Assistant, the conversation; Preview, what the conversation shows (a
   *   preview, a canvas, a component, a page: PreviewPane, the same pane a
   *   session's split holds). The switch stands at the bar's top right
   *   while there is something to show, in his bar and in the preview's own
   *   bar (`switchAt`; leading the bar is the other option on the card); Caw showing something brings it to
   *   the front, and the panel widens as Preview opens (the page's grid reads
   *   `lead.tab`, CawFloat). On Preview the pane's own head is the panel's one
   *   bar, the switch at its end (The Title Bars Follow Liquid Glass Rule).
   *   The conversation stays mounted under it, so going back loses nothing.
   * - While Caw sets the project up, his setup element stands at the
   *   transcript's end (`setup`, SetupWell), and the questions the board
   *   draws are not lent to the composer (`asksElsewhere`).
   */
  import { HARNESSES, type HarnessKind } from "@cawco/core/harness/kinds";
  import { CAW_NO_MACHINE } from "@cawco/core/project-conversation";
  import { commonWords } from "@cawco/core/words/common";
  import { cawPanelWords } from "@cawco/core/words/onboarding";
  import { conversationWords } from "@cawco/core/words/project-conversation";
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import {
    cawco,
    type HeldSend,
    type PendingPermission,
    type SendExtras,
  } from "#lib/cawco/client.svelte.js";
  import { connectionStore } from "#lib/cawco/hub/socket.svelte.js";
  import { rowHref } from "#lib/cawco/links.js";
  import PreviewPane from "#lib/cawco/preview/PreviewPane.svelte";
  import {
    type ProjectStarter,
    readStages,
    tellStarterOutcome,
  } from "#lib/cawco/project-tasks.js";
  import RegionBoundary from "#lib/cawco/RegionBoundary.svelte";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import { boardStore } from "#lib/cawco/stores/board.svelte.js";
  import { tickersStore } from "#lib/cawco/stores/tickers.svelte.js";
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
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconChatAdd,
    IconClose,
    IconListRowsLinear,
    IconMoveTabLinear,
    IconPlus,
  } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { crossIn } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { barGlass } from "../bar-glass.svelte";
  import { dropStart } from "../spawn/parked.svelte";
  import CawAtWork from "./CawAtWork.svelte";
  import type { CawLead } from "./caw-lead.svelte";
  import { cawStartsOf, makeHis, startConversation } from "./conversation";
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
     * In the phone's bottom sheet (CawFloat): the panel's bar is the sheet's
     * one bar, so it carries the sheet's Close at its trailing edge.
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
  /**
   * The conversation on show: the one this panel started, else the one a
   * start is making (CawLead `startingId`, drawn from its first moment), else
   * the project's newest. A start is drawn in the conversation itself, as
   * every session's start and work are: the person's words, then him at
   * work after them; a move or a restart says so in its own line there.
   */
  const shown = $derived(
    fresh ? null : (chosen ?? lead.startingId ?? lead.conversationId)
  );
  /** The conversation on show is one a start is still making: nothing reads it until the start has named it (SessionPane `unborn`). */
  const unborn = $derived(shown !== null && shown === lead.startingId);
  /**
   * He is at work in the conversation on show: a turn of his under way, or
   * his start making it (the person's words drawn, his session on its way).
   * He stands after its rows (CawAtWork) in the bare working line's place.
   */
  const atWork = $derived(shown !== null && (unborn || cawco.busyOf(shown)));
  /** Waiting on you while at work: a question of his holds him. */
  const heldOnYou = $derived(
    shown !== null && cawco.activityOf(shown) === "blocked"
  );
  /** What he is on now, under him: the tool under way, else at work. */
  const doing = $derived.by(() => {
    if (heldOnYou) {
      return conversationWords.status.waiting;
    }
    const tool = shown ? cawco.currentToolOf(shown) : null;
    return tool
      ? [tool.name, tool.glance].filter(Boolean).join(" · ")
      : conversationWords.status.working;
  });
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
  // Caw showing something brings Preview to the front, and so does a card
  // of his pressed in the transcript: each a reveal (client `revealPreview`),
  // said only for a show heard after the page's first read, so what stood
  // open as the page came leaves the panel on his conversation. Counted per
  // conversation: another one coming on show is no reveal. With nothing left
  // to show the panel is his conversation.
  let revealsSeen = untrack(() => ({
    count: shown ? cawco.previewRequests[shown] : undefined,
    id: shown,
  }));
  $effect(() => {
    const id = shown;
    const count = id ? cawco.previewRequests[id] : undefined;
    const open = previewOpen;
    untrack(() => {
      const seen = revealsSeen;
      revealsSeen = { count, id };
      if (!open) {
        lead.tab = "assistant";
      } else if (id !== null && seen.id === id && count !== seen.count) {
        lead.tab = "preview";
      }
    });
  });
  const onPreview = $derived(previewOpen && lead.tab === "preview");

  // --- the setup element -----------------------------------------------------------

  // He is drawn in his setup element while it stands with the panel open:
  // the seat stands empty meanwhile, and he goes back to it as it goes.
  $effect(() => {
    const here =
      lead.open &&
      !onPreview &&
      ((setup !== null && !handedOver(setup)) || (setup === null && atWork));
    lead.inPanel = here;
    return () => {
      lead.inPanel = false;
    };
  });

  /** Caw is off: the hero says he acts only when you write to him. */
  const off = $derived(lead.on === false);

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
  const starters = $derived(
    tickersStore.startersOf(projectId, "board", startersRead)
  );
  $effect(() => {
    const pid = projectId;
    if (!(shown === null && pid && connectionStore.status === "connected")) {
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
    let held: HeldSend[] = [];
    try {
      // Drawn at once: the conversation stands with the person's words in
      // it, him at work after them, while its session is asked for.
      const id = await startConversation(
        projectId,
        text,
        extras,
        lead.draft.keep,
        (drawn) => {
          // The words went from the field the person is in: the
          // conversation's own composer takes the caret as it stands, as
          // a session's keeps it after a send.
          const inField = Boolean(
            document.activeElement?.closest("[data-caw-panel]")
          );
          chosen = drawn;
          fresh = false;
          if (inField) {
            lead.draft.focusWanted = true;
          }
        },
        (withdrawn) => {
          held = withdrawn;
        }
      );
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
      // The hero again, the words back in the field and why over it: their
      // row in the conversation was taken back (conversation.ts), and a
      // session the start made before it failed is no conversation of his.
      chosen = null;
      fresh = true;
      startError = failureWords(error);
      // Every word written to it, the first and those held while it
      // started, back in the field in the order written, with what rode
      // them, ahead of anything written there since.
      const back = [text, ...held.map((one) => one.text)];
      const typed = lead.draft.text.trim();
      lead.draft.restore(
        [...back, ...(typed ? [typed] : [])].filter(Boolean).join("\n\n"),
        {
          attachments: [extras, ...held.map((one) => one.extras)].flatMap(
            (one) => one.attachments ?? []
          ),
          images: [extras, ...held.map((one) => one.extras)].flatMap(
            (one) => one.images ?? []
          ),
        }
      );
    } finally {
      starting = false;
    }
  }
  /**
   * A start of his conversation a reload carried (conversation.ts, spawn/parked
   * `recover`), once it has come to something: the conversation it started
   * on show, its first prompt sent from what the draft store kept; or the
   * hero, its words back in the field and why it did not start over them.
   * Said here, it is let go.
   */
  $effect(() => {
    const settled = cawStartsOf(projectId).filter(
      (one) => one.state !== "running"
    );
    untrack(() => {
      for (const one of settled) {
        if (one.state === "started" && one.target) {
          chosen = one.target;
          fresh = false;
          makeHis(projectId, one.target);
        } else {
          fresh = true;
          startError = conversationWords.reloadedStart;
          lead.draft.restore(one.draft.prompt, one.draft.extras);
        }
        dropStart(one.id);
      }
    });
  });

  /** What the hero's composer stands over the pane's foot, in px, as it reports it (Composer `onfoot`); 0 until it has. */
  let composerFoot = $state(0);
  /**
   * The composer has a place of its own at the panel's foot and the hero's
   * room ends over it, so nothing in the hero stands behind it: no starter
   * card under the field, no card's words under a failed start's line. The
   * place is the composer as it stands now (its field grown round a pasted
   * link, the line over it saying why a start failed, its attachments), as
   * it reports it, and until it has (the server's paint, the frames before
   * it mounts) its panel at rest (`c-composer-panel`). The hero is no
   * transcript: its room follows the composer, and The Composer Layer
   * Rule's layers (the menus, the recall wheel) are in no report. With no
   * machine for a conversation, the line that says so stands there
   * instead.
   */
  const reserved = $derived(
    `calc(var(--space-4) + var(--safe-bottom) + ${composerFoot > 0 ? `${composerFoot}px` : "var(--c-composer-panel)"} + var(--space-2))`
  );
</script>

<!-- Assistant and Preview: the switch in whichever bar heads the panel,
     his on Assistant, the preview's own on Preview (`switchAt`). -->
{#snippet switcher()}
  <!-- Whole at every width: the bar's title gives way before its words. -->
  <div class="flex-none" data-slot="caw-tabs">
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

<!-- The panel's bar (DESIGN.md, The Title Bars Follow Liquid Glass Rule): no
     title, since his seat opened it by his name, and no ground; its actions
     float over the content in the top bar's glass, the session's in one
     group and the sheet's Close in one of its own after it (HIG, Toolbars:
     "Group navigation controls and critical actions like Done, Close, or Save
     in dedicated, familiar, and visually distinct sections"). What the head
     used to say goes: his status is his face in the seat, and off is the
     hero's line. The conversation or the hero runs to the panel's top and
     clears the bar at rest; scrolled, it blurs and fades under it. On
     Preview the pane's own bar is the panel's one bar. -->
<div
  class="relative flex h-full min-h-0 flex-auto flex-col timeline-scope-transcript-head"
  data-caw-panel
  data-caw-tab={onPreview ? "preview" : "assistant"}
  style:--bar-room={shown || sheet ? "var(--c-top-bar-h)" : undefined}
>
  {#if (shown || sheet) && !onPreview}
    <BarFloat tint="bg-surface-recess">
      {#snippet leading()}
        {#if previewOpen && switchAt === "start"}
          <!-- Leading: where the preview's own bar holds a surface's switch
               (SideSurface, as a session's Plan | Preview), so it stays put
               as the tabs change. -->
          <div class="contents" data-slot="tools">{@render switcher()}</div>
        {/if}
      {/snippet}
      {#snippet trailing()}
        {#if shown}
          <BarGlass form="group">
            <BarItem
              aria-expanded={cardOpen}
              aria-haspopup="dialog"
              icon={IconListRowsLinear}
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
              icon={IconMoveTabLinear}
              label={conversationWords.openAsTab}
            />
          </BarGlass>
        {/if}
        {#if previewOpen && switchAt === "end"}
          <!-- At the bar's end, top right, as the preview's bar holds it
               before its Close. -->
          <div class="contents" data-slot="tools">{@render switcher()}</div>
        {/if}
        {#if sheet}
          <BarGlass form="group">
            <Drawer.Close>
              {#snippet child({ props })}
                <BarItem icon={IconClose} label={commonWords.close} {props} />
              {/snippet}
            </Drawer.Close>
          </BarGlass>
        {:else}
          <!-- Docked beside the board: its own Close, as the sheet's, the
               focus back on his seat without the ring (CawFloat's Escape). -->
          <BarGlass form="group">
            <BarItem
              data-caw-close
              icon={IconClose}
              label={conversationWords.hidePanel}
              onclick={() => {
                lead.open = false;
                lead.anchor?.focus({ focusVisible: false } as FocusOptions);
              }}
            />
          </BarGlass>
        {/if}
      {/snippet}
    </BarFloat>
  {/if}
  <div data-slot="well" class="relative flex min-h-0 flex-auto flex-col">
    {#if shown}
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
            afterRows={setup ? setupTail : atWorkTail}
            afterRowsAtWork={setup ? !handedOver(setup) : atWork}
            {unborn}
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
    {:else if !(fresh || boardStore.liveRead)}
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
             900px). It clears the composer as a transcript does, and the
             panel's bar where one floats over it; its scroll is the bar's
             scroll edge (BarFloat). -->
          <div
            class="isolate flex min-h-0 flex-auto flex-col overflow-y-auto scroll-timeline-transcript-head px-(--hero-px) pt-(--bar-room,0px) pb-(--composer-clearance) max-desk:px-space-3"
            data-slot="conversation-hero"
            style:--hero-px="calc((100% - var(--c-composer-w)) / 2)"
            in:crossIn
          >
            <EmptyState
              actionWidth="fill"
              axis
              icon={IconChatAdd}
              line={off
                ? "Caw is off, so he acts only when you write to him."
                : undefined}
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
                  onfoot={(foot) => {
                    composerFoot = foot.stack;
                  }}
                  onstop={() => undefined}
                  onsubmit={(text, extras) => {
                    start(text, extras);
                  }}
                  paneVisible
                  placeholder={conversationWords.placeholder.short}
                  sendError={startError || (lead.problem ?? "")}
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

{#snippet atWorkTail()}
  {#if atWork}
    <!-- He folds shut as he goes (motion/fold `unfold`, out only): at the
         end, the reply that streamed in above him glides down into his
         place as the browser keeps the view at the end, instead of every
         row dropping his 120px in one frame. He arrives with the sent
         message, in the same frame the pin lifts the rows for it. The box
         is its own formatting context (`flow-root`), so his top margin is
         inside the height the fold closes, at rest as in flight. -->
    <div class="flow-root" out:unfold>
      <CawAtWork
        {doing}
        label={conversationWords.atWork}
        status={heldOnYou ? "needs-you" : "working"}
      />
    </div>
  {/if}
{/snippet}

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
        title="Caw · {projectName}"
      />
    </Popover.Content>
  </Popover.Root>
{/if}
