<script lang="ts">
  import { Popover } from "bits-ui";
  /**
   * One group's tabs: a segmented control (the Fluid Functionalism tabs,
   * `$lib/components/ui/fluid-tabs`) with one segment per open conversation.
   *
   * The app used to have a single strip because there was a single place a
   * conversation could be. A group owns its own now, which is what makes a
   * split two workstations rather than one view showing two things: each half
   * has its own set of things open and its own idea of which is in front.
   *
   * Each segment carries the session's activity, name and details disclosure;
   * the strip scrolls when the row cannot
   * hold them. Hosted, the strip is the top bar's content; in a group it
   * brings its own row.
   */
  import { onDestroy, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { page } from "$app/state";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ContextMenu from "$lib/components/ui/context-menu";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "$lib/components/ui/drawer";
  import {
    TabItem,
    Tabs,
    TabsList,
    type TabsTravel,
  } from "$lib/components/ui/fluid-tabs";
  import { IconArrowRight, IconChevronDown, IconClose } from "$lib/icons";
  import {
    ACTIVITY_LABEL,
    type Activity,
    FAILED_LABEL,
    UNKNOWN_LABEL,
  } from "../activity";
  import { isFailed, isStale, whiffle } from "../client.svelte";
  import { continueInNewSession, continueSourceOf } from "../continue.svelte";
  import { copyToClipboard } from "../copy";
  import { conversationHref } from "../links";
  import { sessionName } from "../session-name";
  import { workingSet } from "../working-set.svelte";
  import { dragSession, dropHint, tabDropTarget } from "./dnd.svelte";
  import SessionDetails from "./SessionDetails.svelte";
  import SessionStatus from "./SessionStatus.svelte";
  import { rebuildScheduler } from "./scheduler.svelte";
  import { contextOf, type LeafNode, workspace } from "./workspace.svelte";

  let {
    leaf,
    hosted = false,
    travel = null,
  }: {
    leaf: LeafNode;
    hosted?: boolean;
    /** A swipe in progress: the indicator follows it toward the next tab. */
    travel?: TabsTravel | null;
  } = $props();

  const servedNames = $derived(
    (page.data as { names?: Record<string, string> }).names ?? {}
  );

  interface Tab {
    activity: Activity;
    failed: boolean;
    harness: string;
    href: string;
    id: string;
    label: string;
    named: boolean;
    stale: boolean;
    /** What the badge says, or '' for a tab with nothing to say. */
    status: string;
  }

  function resolve(id: string): Tab {
    const row = whiffle.instanceIndex.byId.get(id);
    const view = whiffle.session(id);
    const ctx = contextOf(id);
    const { label, named } = sessionName(id, servedNames);
    const activity = whiffle.activityOf(id);
    const failed = row ? isFailed(row) : false;
    const stale = row ? isStale(row) : false;
    const tool = whiffle.currentToolOf(id)?.name;
    let status = "";
    if (failed) {
      status = FAILED_LABEL;
    } else if (stale) {
      status = UNKNOWN_LABEL;
    } else if (activity !== "idle") {
      status =
        activity === "working" && tool
          ? `${ACTIVITY_LABEL.working} — ${tool}`
          : ACTIVITY_LABEL[activity];
    }
    return {
      id,
      href: conversationHref(id, whiffle.instanceIndex, {
        machineId: ctx?.machine,
        cwd: ctx?.cwd,
      }),
      label,
      harness: ctx?.harness || row?.harness || view?.harness || "claude",
      named,
      activity,
      failed,
      stale,
      status,
    };
  }

  const tabs = $derived(leaf.tabs.map(resolve));

  // Remember every name the strip works out, so a tab on a conversation the
  // board no longer lists is called by its name and not eight characters of
  // its id until its transcript arrives.
  $effect(() => {
    const named = tabs
      .filter((tab) => tab.named)
      .map((tab) => [tab.id, tab.label] as const);
    untrack(() => {
      for (const [id, label] of named) {
        workingSet.setTitle(id, label);
      }
    });
  });

  const otherLeaves = $derived(
    workspace.leaves.filter((other) => other.id !== leaf.id)
  );
  const touch = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );
  let detailId = $state<string | null>(null);
  let detailAnchor = $state<HTMLElement | null>(null);
  let detailsOpen = $state(false);
  let pinned = $state(false);
  /** Set once the open popover retargets another tab; it glides instead of reopening. */
  let morphing = $state(false);
  /** Which way the card moved between tabs: 1 rightward, -1 leftward. */
  let detailDir = $state<1 | -1>(1);
  let detailsHeight = $state(0);
  let restoreFocus = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** A tab's context menu is open; hovering must not open the card under it. */
  let menuOpen = false;
  const detailTab = $derived(tabs.find((tab) => tab.id === detailId));
  function closeDetails() {
    clearTimeout(timer);
    restoreFocus = pinned;
    detailsOpen = false;
    pinned = false;
    morphing = false;
  }
  function showDetails(id: string, anchor: HTMLElement, pin: boolean) {
    clearTimeout(timer);
    if (detailsOpen && detailId !== id) {
      morphing = true;
      detailDir =
        tabs.findIndex((tab) => tab.id === id) >
        tabs.findIndex((tab) => tab.id === detailId)
          ? 1
          : -1;
    }
    detailId = id;
    detailAnchor = anchor;
    pinned = pin;
    detailsOpen = true;
  }
  function hoverTab(id: string, event: PointerEvent) {
    if (touch.current || event.pointerType !== "mouse" || pinned || menuOpen) {
      return;
    }
    clearTimeout(timer);
    const anchor = event.currentTarget as HTMLElement;
    if (detailsOpen) {
      showDetails(id, anchor, false);
      return;
    }
    timer = setTimeout(() => showDetails(id, anchor, false), 350);
  }
  function menuOpenChange(open: boolean) {
    menuOpen = open;
    if (open) {
      clearTimeout(timer);
      if (detailsOpen && !pinned) {
        closeDetails();
      }
    }
  }
  function leaveDetails() {
    clearTimeout(timer);
    if (!pinned) {
      timer = setTimeout(closeDetails, 250);
    }
  }
  function clickTab(id: string, event: MouseEvent) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (leaf.active === id) {
      event.preventDefault();
      if (detailsOpen && pinned && detailId === id) {
        closeDetails();
      } else {
        showDetails(id, event.currentTarget as HTMLElement, true);
      }
    } else if (detailsOpen) {
      showDetails(id, event.currentTarget as HTMLElement, pinned);
    } else {
      closeDetails();
    }
  }
  $effect(() => {
    if (!detailTab) {
      closeDetails();
    }
  });
  onDestroy(() => clearTimeout(timer));
</script>

<!-- `''` when the board is showing: a value no segment carries, so nothing
     is drawn as chosen. The name is per group: two groups' strips in one
     navigation must be two transition groups, or the transition is
     abandoned. -->
<Tabs
  class="session-tabs {hosted ? 'hosted' : ''}"
  onValueChange={(id) => workspace.activate(id, leaf.id)}
  style="view-transition-name: tabs-{leaf.id}"
  {travel}
  value={leaf.active ?? ''}
  variant="folder"
>
  <TabsList aria-label="Open sessions in this group" scrollable>
    {#each tabs as tab, i (tab.id)}
      <ContextMenu.Root onOpenChange={menuOpenChange}>
        <ContextMenu.Trigger class="contents">
          <!-- The caret marks where a drop would land, drawn on the side the
               pointer is nearest. Graphite, like every structural mark here:
               the one loud colour belongs to a session asking for something. -->
          <div
            class="tab"
            class:drop-after={dropHint.tabIndexIn(leaf.id) === i + 1 && i === tabs.length - 1}
            class:drop-before={dropHint.tabIndexIn(leaf.id) === i}
            class:needs={tab.activity === 'blocked'}
            use:dragSession={{ sessionId: tab.id, from: leaf.id }}
            use:tabDropTarget={{ leafId: leaf.id, index: i, sessionId: tab.id }}
          >
            <TabItem
              aria-expanded={detailsOpen && detailId === tab.id}
              aria-haspopup="dialog"
              aria-label={`${tab.label}${tab.status ? ` — ${tab.status}` : ''}${leaf.active === tab.id ? ' — open session details' : ''}`}
              data-session-tab={tab.id}
              href={tab.href}
              label={tab.label}
              onclick={(event) => clickTab(tab.id, event)}
              onkeydown={(event) => {
                if (event.key === 'ArrowDown' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  showDetails(tab.id, event.currentTarget as HTMLElement, true);
                }
              }}
              onpointerdown={() => rebuildScheduler.prepare(tab.id)}
              onpointerenter={(event) => {
                rebuildScheduler.prepare(tab.id);
                hoverTab(tab.id, event);
              }}
              onpointerleave={leaveDetails}
              value={tab.id}
            >
              {#snippet lead()}
                <SessionStatus compact sessionId={tab.id} />
              {/snippet}
              {#snippet trail()}
                {#if leaf.active === tab.id}
                  <button
                    aria-expanded={detailsOpen && detailId === tab.id}
                    aria-haspopup="dialog"
                    aria-label="Session details for {tab.label}"
                    class="tdetails touch-hit"
                    onclick={(event) => clickTab(tab.id, event)}
                    type="button"
                  >
                    <IconChevronDown />
                  </button>
                {/if}
                <button
                  aria-label="Close {tab.label}"
                  class="tclose touch-hit"
                  onclick={() => { closeDetails(); workspace.close(tab.id); }}
                  type="button"
                >
                  <IconClose />
                </button>
              {/snippet}
            </TabItem>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Content>
          <ContextMenu.Item
            onSelect={() => {
            const anchor = document.querySelector<HTMLElement>(`[data-session-tab="${tab.id}"]`);
            if (anchor) { showDetails(tab.id, anchor, true); }
          }}
            >Session details</ContextMenu.Item
          >
          <ContextMenu.Item
            onSelect={() => continueInNewSession(continueSourceOf(tab.id, tab.label))}
          >
            <IconArrowRight />
            Continue in new session…
          </ContextMenu.Item>
          <!-- Every gesture has a command that does the same thing. Splitting
               and moving are reachable from here before drag-and-drop exists,
               and stay reachable for anyone not using a pointer. -->
          <ContextMenu.Item
            onSelect={() => workspace.split(leaf.id, 'right', tab.id)}
          >
            Split right
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => workspace.split(leaf.id, 'bottom', tab.id)}
          >
            Split down
          </ContextMenu.Item>
          {#if otherLeaves.length > 0}
            <ContextMenu.Separator />
            {#each otherLeaves as other, i (other.id)}
              <ContextMenu.Item
                onSelect={() => workspace.move(tab.id, other.id)}
              >
                Move to group {i + 2}
              </ContextMenu.Item>
            {/each}
          {/if}
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => workspace.close(tab.id)}
            >Close</ContextMenu.Item
          >
          <ContextMenu.Item
            disabled={leaf.tabs.length < 2}
            onSelect={() => {
              for (const id of [...leaf.tabs]) {
                if (id !== tab.id) {
                  workspace.close(id);
                }
              }
            }}
          >
            Close others
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            onSelect={() =>
              copyToClipboard('Link', new URL(tab.href, location.origin).href)}
          >
            Copy link
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    {/each}
  </TabsList>
</Tabs>

{#if touch.current}
  <Drawer.Root
    onOpenChange={(open) => { if (!open) { closeDetails(); } }}
    open={detailsOpen}
  >
    <Drawer.Content
      class="session-details-sheet"
      onCloseAutoFocus={(event) => { event.preventDefault(); detailAnchor?.focus(); }}
    >
      <Drawer.Title class="sr-only">Session details</Drawer.Title>
      <Drawer.Description class="sr-only"
        >Session identity, runtime configuration and usage.</Drawer.Description
      >
      <div class="details-scroll">
        {#if detailTab}
          <SessionDetails
            dir={detailDir}
            href={detailTab.href}
            onclose={closeDetails}
            sessionId={detailTab.id}
            title={detailTab.label}
          />
        {/if}
      </div>
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Popover.Root
    onOpenChange={(open) => { if (!open) { closeDetails(); } }}
    open={detailsOpen}
  >
    <Popover.Portal>
      <Popover.Content
        align="start"
        aria-label="Session details"
        class="session-details-popover"
        collisionPadding={12}
        customAnchor={detailAnchor}
        data-morph={morphing ? '' : undefined}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (restoreFocus) { detailAnchor?.focus(); } }}
        onfocusin={() => { clearTimeout(timer); pinned = true; }}
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-session-tab]')) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => { if (!pinned) { event.preventDefault(); } }}
        onpointerdowncapture={() => { clearTimeout(timer); pinned = true; }}
        onpointerenter={() => clearTimeout(timer)}
        onpointerleave={leaveDetails}
        side="bottom"
        sideOffset={6}
        trapFocus={pinned}
      >
        <div
          class="details-morph"
          style:height={detailsHeight ? `${detailsHeight}px` : undefined}
        >
          <div class="details-measure" bind:offsetHeight={detailsHeight}>
            {#if detailTab}
              <SessionDetails
                dir={detailDir}
                href={detailTab.href}
                onclose={closeDetails}
                sessionId={detailTab.id}
                title={detailTab.label}
              />
            {/if}
          </div>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
{/if}

<style>
  :global(.session-details-popover) {
    display: flex;
    z-index: 60;
    width: min(416px, calc(100vw - 24px));
    max-height: min(760px, var(--bits-popover-content-available-height, 85dvh));
    overflow: hidden;
    overscroll-behavior: contain;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
    transform-origin: var(--bits-popover-content-transform-origin);
    outline: none;
  }
  :global(.session-details-sheet) {
    padding: 0;
    padding-bottom: env(safe-area-inset-bottom);
    max-height: 88dvh;
    overflow: hidden;
    border: 1px solid var(--border-control);
    border-bottom: 0;
    background: var(--surface-raised);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
  :global(.session-details-sheet::before) {
    content: none;
  }
  .details-scroll {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    max-height: calc(88dvh - 24px - env(safe-area-inset-bottom));
    overflow: hidden;
  }
  /* The two trailing controls sit 2px apart and their touch areas meet
     between them. On a coarse pointer the close button stands 24px off the
     chevron and 8px off the tab's end, so each 44px area reaches its full
     width before meeting a neighbour's. The chevron's leading half falls on
     its own tab's label, which opens the same details. */
  .tdetails,
  .tclose {
    --hit-gap-x: 2px;

    @media (pointer: coarse) {
      --hit-gap-x: 24px;
    }
  }
  /* The session track scrolls sideways, and a scroll container clips on both
     axes; its transparent padding grows into an equal negative margin on a
     coarse pointer, so the controls' touch areas above and below the 32px
     tabs sit inside its clip and nothing moves. */
  :global(.session-tabs .ff-tabs-list.scrollable) {
    @media (pointer: coarse) {
      padding-block: calc(var(--pad) + 10px) 10px;
      margin-block: -10px;
    }
  }
  .tdetails {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 24px;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .tdetails :global(svg) {
    width: 12px;
    height: 12px;
    transition: transform var(--dur-control) var(--ease-out);
  }
  .tdetails[aria-expanded="true"] :global(svg) {
    transform: rotate(180deg);
  }
  .tdetails:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
  @media (hover: hover) {
    .tdetails:hover {
      background: var(--surface-fill);
    }
  }
  .details-morph {
    width: 100%;
    max-height: inherit;
    overflow: hidden;
  }
  .details-measure {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: inherit;
  }
  @media (prefers-reduced-motion: no-preference) {
    :global(
      [data-bits-floating-content-wrapper]:has(
        > .session-details-popover[data-morph]
      )
    ) {
      transition: transform 260ms var(--ease-drawer);
    }
    :global(.session-details-popover[data-state="open"]) {
      animation: details-enter 260ms var(--ease-drawer);
    }
    :global(.session-details-popover[data-state="closed"]) {
      animation: details-exit 160ms var(--ease-out);
    }
  }
  @keyframes details-enter {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes details-exit {
    to {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }
  /* ── The row ──────────────────────────────────────────────────────
     Folder tabs stand on a shelf: a hairline in the row's own bottom
     pixel, so the chosen tab's sheet — which ends on that same pixel —
     covers it and runs on into the header below. In a group the row is
     the group's own; hosted, it fills the top bar and the bar draws the
     shelf. The row is its own view-transition group and, like the bar
     and the rail, holds still while a spoke navigation slides the
     content under it: it is chrome. (A tab switch is not a navigation
     at all — the segment simply slides.) */
  :global(.session-tabs) {
    display: flex;
    align-items: flex-end;
    flex: 0 0 auto;
    min-inline-size: 0;
    padding-block: 4px 0;
    padding-inline: var(--space-7) var(--space-4);
    /* One step darker than the transcript, so the chosen tab — in the
       transcript's own surface — reads as the page it opens. */
    background: var(--surface-recess);
    view-transition-class: tabs;

    /* The tab controls' touch areas reach 6px past the row's bottom edge:
       on a coarse pointer the row stacks above the transcript beneath it. */
    @media (pointer: coarse) {
      position: relative;
      z-index: 1;
    }
  }
  :global(.session-tabs.hosted) {
    flex: 1 1 0;
    align-self: stretch;
    padding: 0;
    background: none;
  }
  @container leaf (width <= 620px) {
    :global(.session-tabs:not(.hosted)) {
      padding-inline-start: var(--space-4);
    }
  }

  /* The strip takes one step taller than the component's default in a
     bar with room, with the component's own text size and a tighter
     horizontal pad. The shape and the sheet are the component's. */
  :global(.session-tabs .ff-tabs-list) {
    --px: 10px;
    --text: var(--text-label);
    --item: 32px;
    --sheet: var(--surface-recess);
    --tab-hover: var(--surface-hover);
  }

  .tab {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    min-inline-size: 0;
    max-inline-size: 200px;

    /* Parked on you: the label carries the strong ink whether or not it
       is chosen, so the ask is legible from across the strip. */
    &.needs {
      color: var(--ink-strong);
    }

    /* Where a drop would land: a 2px rule in the gap, on the near side. */
    &.drop-before::before,
    &.drop-after::after {
      content: "";
      position: absolute;
      inset-block: 2px;
      inline-size: 2px;
      border-radius: 1px;
      background: var(--ink-strong);
      z-index: 3;
    }
    &.drop-before::before {
      inset-inline-start: -2px;
    }
    &.drop-after::after {
      inset-inline-end: -2px;
    }
  }
  /* The tab being carried recedes; it is somewhere else now. */
  :global(.tab[data-dragging]) {
    opacity: 0.4;
  }

  .tclose {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    inline-size: 20px;
    block-size: 20px;
    margin-inline-start: 2px;

    @media (pointer: coarse) {
      margin-inline: 24px 8px;
    }
    border: 0;
    padding: 0;
    background: none;
    border-radius: var(--radius-xs);
    color: var(--ink-muted);
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 1px;
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-fill);
        color: var(--ink-strong);
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--dur-control) var(--ease-out),
        color var(--dur-control) var(--ease-out),
        transform var(--dur-control) var(--ease-out);

      &:active {
        transform: scale(0.9);
      }
    }
  }
  .tclose :global(svg) {
    inline-size: 11px;
    block-size: 11px;
    display: block;
  }
</style>
