<script lang="ts">
  /**
   * Caw's panel on the project's page (CawFloat): the project's
   * conversation, a session like any other drawn by SessionPane, docked, so
   * it is the transcript's own rows and the session Composer at its foot,
   * with its commands, mentions and skills.
   *
   * - It shows the project's newest conversation (CawLead `conversation`:
   *   a session a person or the project started there), or the hero when
   *   there is none: Caw at 80 over "What's next for <project>?", the
   *   project's starters as rows under him. A starter puts its words in the
   *   composer; nothing is sent. The first words start a conversation
   *   (conversation.ts), and the panel shows it.
   * - Its head is Caw's face, his name over the conversation's status word,
   *   New conversation and the way to open it as a tab. His name opens the
   *   session's card (SessionDetails); on the conversation the project's
   *   events reach, its harness and model are the project's (ModelSection).
   */
  import { HARNESSES, type HarnessKind } from "@cawco/core/harness";
  import { CAW_NO_MACHINE } from "@cawco/core/project-conversation";
  import { conversationWords } from "@cawco/core/words/project-conversation";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { cawco, type SendExtras } from "#lib/cawco/client.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { rowHref } from "#lib/cawco/links.js";
  import { crossIn } from "#lib/cawco/motion/curves.svelte.js";
  import {
    type ProjectStarter,
    readStages,
    tellStarterOutcome,
  } from "#lib/cawco/project-tasks.js";
  import RegionBoundary from "#lib/cawco/RegionBoundary.svelte";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import FootFade from "#lib/cawco/transcript/FootFade.svelte";
  import SessionDetails from "#lib/cawco/workspace/SessionDetails.svelte";
  import { sessionStatusOf } from "#lib/cawco/workspace/session-status.js";
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconClose, IconMaximize, IconPlus } from "#lib/icons.js";
  import { barGlass } from "../bar-glass.svelte";
  import type { CawLead } from "./caw-lead.svelte";
  import { startConversation } from "./conversation";
  import StarterCards from "./StarterCards.svelte";

  let {
    lead,
    projectId,
    projectName,
    sheet = false,
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
    /**
     * In the phone's bottom sheet (CawFloat): his head is the sheet's one
     * header, so it carries the sheet's Close at its trailing edge.
     */
    sheet?: boolean;
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

  // --- what his line says -------------------------------------------------------

  const off = $derived(lead.on === false);
  /**
   * Past the project's cap with nothing more pressing, the cap's line, as
   * his head's line says it; with a conversation on show, its status word;
   * else, off and at rest, that only your words wake him, or what he is.
   */
  const said = $derived.by(() => {
    if (lead.capSays) {
      return lead.capSays;
    }
    if (shown) {
      return sessionStatusOf(shown).label;
    }
    if (off && lead.status === "sleeping") {
      return "Answers when you write";
    }
    return lead.sentence;
  });

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

<div class="flex h-full min-h-0 flex-auto flex-col" data-caw-panel>
  <div
    data-slot="head"
    class="flex min-h-c-btn-h-sm flex-none items-center gap-space-2 border-b border-b-border-hairline pt-space-2 pr-space-2 pb-space-2 pl-space-4"
    data-caw-head
  >
    <CawFace size={18} status={lead.status} />
    <div class="flex min-w-0 flex-auto flex-col items-start">
      {#if shown}
        <button
          data-slot="name"
          aria-expanded={cardOpen}
          aria-haspopup="dialog"
          class="select-none press-tint type-label -mx-space-1 rounded-xs border-none border-current bg-transparent px-space-1 font-medium text-ink-strong transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
          onclick={cardPress}
          onpointerenter={(event) => {
            cardAnchor = event.currentTarget;
            cardRest(event);
          }}
          onpointerleave={cardLeave}
          type="button"
          bind:this={cardAnchor}
        >
          Caw{#if off}<span
              data-slot="off-word"
              class="font-normal text-ink-muted">{" · off"}</span
            >{/if}
        </button>
      {:else}
        <span
          data-slot="name"
          class="type-label -mx-space-1 rounded-xs border-none border-current bg-transparent px-space-1 font-medium text-ink-strong"
          >Caw{#if off}<span
              data-slot="off-word"
              class="font-normal text-ink-muted">{" · off"}</span
            >{/if}</span
        >
      {/if}
      <span class="type-meta max-w-full truncate text-ink-muted" data-caw-line
        >{said}</span
      >
    </div>
    <div class="flex flex-none gap-space-1">
      {#if shown}
        <Tip label={conversationWords.newConversation}>
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label={conversationWords.newConversation}
              press="pressable"
              icon={IconPlus}
              onclick={newConversation}
              size="icon-sm"
              variant="ghost"
            />
          {/snippet}
        </Tip>
        <Tip label={conversationWords.openAsTab}>
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label={conversationWords.openAsTab}
              press="pressable"
              href={rowHref(shown ?? "")}
              icon={IconMaximize}
              size="icon-sm"
              variant="ghost"
            />
          {/snippet}
        </Tip>
      {/if}
      {#if sheet}
        <!-- The sheet's Close, the ghost his head's other actions are. -->
        <Drawer.Close>
          {#snippet child({ props })}
            <Button
              {...props}
              aria-label="Close"
              press="pressable"
              icon={IconClose}
              size="icon-sm"
              title="Close"
              variant="ghost"
            />
          {/snippet}
        </Drawer.Close>
      {/if}
    </div>
  </div>
  <div data-slot="well" class="flex min-h-0 flex-auto flex-col">
    {#if shown}
      {#key shown}
        <!-- The conversation is the transcript being read over the page:
             focused, so its rows follow every message as it lands and it
             rides the tail (Transcript `focused`). -->
        <SessionPane
          active
          browsing={null}
          browsingCwd=""
          browsingHarness={undefined}
          docked={{ draft: lead.draft }}
          focused
          viewId={shown}
          visible
        />
      {/key}
    {:else}
      <div
        data-slot="pane"
        class="@container relative flex min-h-0 min-w-0 flex-auto flex-col bg-surface-recess pb-(--reserved)"
        style:--composer-clearance="var(--space-4)"
        style:--reserved={reserved}
      >
        <!-- The hero: the empty board's (project page `.caw-empty`), from the
             room's top, its inline padding the composer's own column, so Caw,
             the title, the line and the starters share the composer's start
             edge (--space-3 where the composer goes edge to edge, under
             900px). It clears the composer as a transcript does. -->
        <div
          class="isolate flex min-h-0 flex-auto flex-col overflow-y-auto px-(--hero-px) pb-(--composer-clearance) max-desk:px-space-3"
          data-slot="conversation-hero"
          style:--hero-px="calc((100% - var(--c-composer-w)) / 2)"
          in:crossIn
        >
          <EmptyState
            actionWidth="fill"
            axis
            line={off
              ? "Caw is off, so he acts only when you write to him."
              : undefined}
            title="What’s next for {projectName}?"
          >
            {#snippet mark()}
              <div
                data-slot="caw-80"
                class="mb-space-3 grid justify-items-center"
                data-share={`caw:${projectId}`}
              >
                <Caw size={80} status="ready" />
              </div>
            {/snippet}
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
            <RegionBoundary kept="Your draft is kept." region="composer">
              <Composer
                fleet={composerFleet}
                agentName="Caw"
                draft={lead.draft}
                onstop={() => undefined}
                onsubmit={(text, extras) => {
                  start(text, extras);
                }}
                paneVisible
                placeholder="Message Caw…"
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
  </div>
</div>

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
