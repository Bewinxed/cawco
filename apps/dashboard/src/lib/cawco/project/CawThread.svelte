<script lang="ts">
  /**
   * Caw's panel, floating over the project's page (CawFloat): a
   * conversation with him drawn by the pane a thread tab is (ThreadPane,
   * docked), so it is the transcript's own rows and the session Composer
   * at its foot, with every message, question, not-woken Try again and
   * streamed word a thread tab has.
   *
   * - It opens on the project's newest thread, or on the hero when there is
   *   none: Caw at 80 over "What's next for <project>?", the project's
   *   starters as chips under him, then the earlier threads as every list
   *   draws a conversation (SessionRow). A chip puts its words in the
   *   composer; nothing is sent. A row shows that thread here.
   * - Its head is his name over his line, New thread, and the way to open
   *   the thread as a tab. His name opens his lead session's card, the card
   *   a session tab's hover opens (SessionDetails), where his harness and
   *   model are chosen as any session's model is (ModelSection).
   * - Your first words on the hero start the thread, and the panel shows it
   *   in place, the composer staying where it is.
   */
  import {
    CAW_DENIED_TOOLS,
    type CawHarness,
    type HarnessKind,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { cawco, threadsOf } from "#lib/cawco/client.svelte.js";
  import { clock } from "#lib/cawco/home/home-state.svelte.js";
  import SessionRow from "#lib/cawco/SessionRow.svelte";
  import ThreadPane from "#lib/cawco/ThreadPane.svelte";
  import {
    newThreadTabId,
    threadHref,
    threadTabId,
  } from "#lib/cawco/thread-tabs.js";
  import SessionDetails from "#lib/cawco/workspace/SessionDetails.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconPlus } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
  } = $props();

  // --- the thread on show -----------------------------------------------------

  const threads = $derived(threadsOf(projectId));
  /**
   * The thread on show: the newest when the panel opens; null, a new one.
   * `fresh`: New thread was chosen, so a newest arriving later does not
   * take its place.
   */
  let threadId = $state<string | null>(
    untrack(() => threadsOf(projectId)[0]?.id ?? null)
  );
  let fresh = $state(false);
  $effect(() => {
    const newest = threads[0]?.id;
    if (newest && threadId === null && !fresh) {
      threadId = newest;
    }
  });
  /**
   * A choice (a row, New thread) draws its thread afresh; the thread a first
   * message makes keeps the pane that sent it, so the words land in it.
   */
  let chosen = $state(0);
  function choose(next: string | null) {
    threadId = next;
    fresh = next === null;
    chosen += 1;
  }
  const viewId = $derived(
    threadId ? threadTabId(threadId) : newThreadTabId(projectId)
  );
  /** The project's threads past the one on show, newest first. */
  const earlier = $derived(
    threads.filter((each) => each.id !== threadId).slice(0, 5)
  );

  // --- what his line says -------------------------------------------------------

  const off = $derived(lead.view !== null && !lead.view.on);
  /**
   * Past the project's cap with nothing more pressing, the cap's line, as
   * his head's line says it; off and at rest, that only your words wake
   * him; else what he is doing.
   */
  const said = $derived.by(() => {
    if (lead.capSays) {
      return lead.capSays;
    }
    if (off && lead.status === "sleeping") {
      return "Answers when you write";
    }
    return lead.sentence;
  });

  // --- his lead session's card --------------------------------------------------

  /**
   * His view is read again as the panel opens and whenever a thread of his
   * starts or ends a turn: the hub starts his lead session on the first
   * words he answers, and his card (his harness and model) is that
   * session's, so a view read before it began has no session to open.
   */
  const turns = $derived(threads.map((each) => each.status).join(","));
  let turnsSeen: string | null = null;
  $effect(() => {
    const now = turns;
    if (now !== turnsSeen) {
      turnsSeen = now;
      untrack(() => lead.read());
    }
  });

  const leadId = $derived(lead.view?.leadInstanceId ?? null);
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

  /** The harnesses Caw runs on, as the hub lists them (its `CAW_HARNESSES`). */
  const CAW_HARNESSES = Object.keys(CAW_DENIED_TOOLS) as CawHarness[];
  const runsCaw = (harness: HarnessKind): harness is CawHarness =>
    (CAW_HARNESSES as HarnessKind[]).includes(harness);
  /** A model was picked in the card: its pending and refusal are the card's model line. */
  let choosing = $state(false);
  /**
   * His harness and model, as his lead session's card keeps them: his view
   * (CawView) is the setting. A model picked on another harness's rail
   * moves him to the two together.
   */
  const kept = $derived(
    lead.view
      ? {
          harness: lead.view.harness,
          model: lead.view.model,
          harnesses: CAW_HARNESSES,
          onchoose: ({
            harness,
            model,
          }: {
            harness: HarnessKind;
            model: string;
          }) => {
            if (!runsCaw(harness)) {
              return;
            }
            choosing = true;
            lead.configure(
              harness === lead.view?.harness
                ? { model: model || null }
                : { harness, model: model || null }
            );
          },
          pending: choosing && lead.moving,
          refused: choosing ? lead.refused : null,
        }
      : null
  );
</script>

<!-- The project's earlier threads under the hero's chips, each the row every
     list draws a conversation with. A press shows it here; a press that
     opens a tab (a modifier, the middle button) still does. -->
{#snippet under()}
  {#if earlier.length > 0}
    <section data-slot="earlier" aria-label="Earlier threads" class="earlier">
      <h3>Earlier</h3>
      <ul>
        {#each earlier as each (each.id)}
          {@const row = cawco.instanceIndex.byId.get(threadTabId(each.id))}
          <li
            onclickcapture={(event) => {
              if (
                event.button === 0 &&
                !(event.metaKey || event.ctrlKey || event.shiftKey)
              ) {
                event.preventDefault();
                event.stopPropagation();
                choose(each.id);
              }
            }}
          >
            <SessionRow
              compact
              href={threadHref(each.id)}
              instance={row ?? null}
              machineId={row?.machineId ?? "hub"}
              peek={false}
              title={each.title}
              trail={formatAgeShort(each.lastAt, clock.now)}
            />
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/snippet}

<div class="caw-thread" data-caw-panel>
  <div data-slot="head" class="head" data-caw-head>
    <div class="identity">
      {#if leadId}
        <button
          data-slot="name"
          aria-expanded={cardOpen}
          aria-haspopup="dialog"
          class="name press-tint"
          onclick={cardPress}
          onpointerenter={(event) => {
            cardAnchor = event.currentTarget;
            cardRest(event);
          }}
          onpointerleave={cardLeave}
          type="button"
          bind:this={cardAnchor}
        >
          Caw{#if off}<span class="off-word">{" · off"}</span>{/if}
        </button>
      {:else}
        <span data-slot="name" class="name"
          >Caw{#if off}<span class="off-word">{" · off"}</span>{/if}</span
        >
      {/if}
      <span class="line" data-caw-line>{said}</span>
    </div>
    <div class="head-actions">
      {#if threadId}
        <Tip label="New thread">
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label="New thread"
              class="pressable"
              icon={IconPlus}
              onclick={() => choose(null)}
              size="icon-sm"
              variant="ghost"
            />
          {/snippet}
        </Tip>
        <Tip label="Open as a tab">
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label="Open as a tab"
              class="pressable"
              href={threadHref(threadId ?? "")}
              icon={IconMaximize}
              size="icon-sm"
              variant="ghost"
            />
          {/snippet}
        </Tip>
      {/if}
    </div>
  </div>
  <div data-slot="well" class="well">
    {#key chosen}
      <!-- The panel's thread is the transcript being read over the page:
           focused, so its rows follow every message as it lands and it rides
           the tail (Transcript `focused`). -->
      <ThreadPane
        active
        docked={{
          draft: lead.draft,
          onthread: (id) => {
            threadId = id;
            fresh = false;
          },
          under,
        }}
        focused
        {viewId}
        visible
      />
    {/key}
  </div>
</div>

{#if leadId}
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
      aria-label="Caw's session"
      class="caw-lead-card"
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
        href={threadId
          ? threadHref(threadId)
          : `/project/${encodeURIComponent(projectId)}`}
        {kept}
        onclose={cardClose}
        sessionId={leadId}
        title="Caw · lead of {projectName}"
      />
    </Popover.Content>
  </Popover.Root>
{/if}

<style>
  .caw-thread {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    block-size: 100%;
  }
  /* His name over his line, and the thread's two actions: the head a
     session pane's tab row stands in for, on the panel's surface. */
  .head {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-btn-h-sm);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border-block-end: 1px solid var(--border-hairline);
  }
  .identity {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
    min-inline-size: 0;
  }
  .head-actions {
    display: flex;
    flex: none;
    gap: var(--space-1);
  }
  .name {
    margin-inline: calc(var(--space-1) * -1);
    padding-inline: var(--space-1);
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  button.name {
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) {
    button.name:hover {
      background: var(--surface-hover);
    }
  }
  button.name:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
  .off-word {
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .line {
    max-inline-size: 100%;
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The well holds the thread pane, which stands its composer over its foot. */
  .well {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  .earlier {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-block-start: var(--space-4);
    text-align: start;
  }
  .earlier h3 {
    padding-inline: var(--space-2);
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .earlier ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* His lead session's card: a session tab's card's width (PaneTabs
     `.session-details-popover`), its content edge to edge. */
  :global(.kit-pop.caw-lead-card) {
    display: flex;
    z-index: 60;
    inline-size: min(416px, calc(100vw - 24px));
    max-block-size: min(
      760px,
      var(--bits-popover-content-available-height, 85dvh)
    );
    overflow: hidden;
    padding: 0;
  }
</style>
