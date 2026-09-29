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
  import { onMount, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
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
    dur,
    ease,
    easeOut,
    motionOk,
  } from "$lib/whiffle/motion/curves.svelte";
  import { land } from "$lib/whiffle/motion/share.svelte";
  import {
    ACTIVITY_LABEL,
    type Activity,
    FAILED_LABEL,
    UNKNOWN_LABEL,
  } from "../activity";
  import { isFailed, isStale, whiffle } from "../client.svelte";
  import { continueInNewSession, continueSourceOf } from "../continue.svelte";
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
    /** The tab's key in the strip: its id and which arrival of that id it is (`arrivals`). */
    key: string;
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
      key: `${id}:${arrivals.get(id) ?? 0}`,
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

  /**
   * Every time a conversation arrives in the strip it is a new tab, keyed
   * apart from the last one it had. Keyed by id alone, a conversation opened
   * again while its closing tab was still leaving took that tab back: the
   * exit is cancelled and the element kept, still pinned where `leavingTab`
   * took it out of the flow — drawn over a neighbour at the place it was
   * closed from, and not taking clicks. Now the closing tab finishes leaving
   * and the new one arrives where the strip puts it.
   */
  const arrivals = new Map<string, number>();
  let present = new Set<string>();
  const tabs = $derived.by(() => {
    const ids = leaf.tabs;
    for (const id of ids) {
      if (!present.has(id)) {
        arrivals.set(id, (arrivals.get(id) ?? 0) + 1);
      }
    }
    present = new Set(ids);
    return ids.map(resolve);
  });

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
  /** An open card's move to another tab, waiting for the frame in hand to paint. */
  let moveFrame = 0;
  let moveTask: ReturnType<typeof setTimeout> | undefined;
  function holdMove() {
    cancelAnimationFrame(moveFrame);
    clearTimeout(moveTask);
  }
  function closeDetails() {
    clearTimeout(timer);
    holdMove();
    restoreFocus = pinned;
    detailsOpen = false;
    pinned = false;
    morphing = false;
  }
  function showDetails(id: string, anchor: HTMLElement, pin: boolean) {
    clearTimeout(timer);
    holdMove();
    pinned = pin;
    if (!(detailsOpen && detailId !== id)) {
      detailId = id;
      detailAnchor = anchor;
      detailsOpen = true;
      return;
    }
    // An open card moving to another tab re-measures every line it morphs
    // (`SessionDetails`), each a layout of the whole page. Moved in the
    // change that chose the tab, that work held the tab and its
    // conversation off the screen; it follows them a frame later instead.
    // A frame's callbacks run before it paints; a task queued from them
    // runs after.
    moveFrame = requestAnimationFrame(() => {
      moveTask = setTimeout(() => {
        morphing = true;
        detailDir =
          tabs.findIndex((tab) => tab.id === id) >
          tabs.findIndex((tab) => tab.id === detailId)
            ? 1
            : -1;
        detailId = id;
        detailAnchor = anchor;
      });
    });
  }
  function hoverTab(id: string, event: PointerEvent) {
    if (touch.current || event.pointerType !== "mouse" || pinned || menuOpen) {
      return;
    }
    clearTimeout(timer);
    // The handlers sit on the whole tab, its buttons included, so moving onto
    // them is not leaving it; the card still hangs from the tab's link.
    const anchor = (
      event.currentTarget as HTMLElement
    ).querySelector<HTMLElement>("[data-session-tab]") as HTMLElement;
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
  onMount(() => () => {
    clearTimeout(timer);
    holdMove();
  });

  /* ── Tabs arriving and leaving ────────────────────────────────────
     A tab that opens grows from nothing at its place in the strip while
     the tabs after it slide over to make room (--dur-morph, --ease-out),
     unless it flies in from the row that opened it (share.svelte.ts). A
     tab that closes is taken out of the flow where it stands and narrows
     to nothing as it fades (--dur-exit), while the tabs after it slide
     into the gap (--dur-fade, --ease-in-out). A tab dropped at another
     place in its strip slides there with its neighbours on the flight's
     own curve (--dur-panel, --ease-drawer). A tab whose id changes in
     place — a stored session reached again by its instance — neither
     leaves nor arrives. The strip's first render is where it starts, and
     nothing in it moves. */
  const tabEls = new Map<string, HTMLElement>();
  let ready = false;
  onMount(() => {
    const frame = requestAnimationFrame(() => {
      ready = true;
    });
    return () => cancelAnimationFrame(frame);
  });
  /**
   * A change to the strip waiting for the next frame to slide its tabs:
   * where each tab stood before it, by id, and what kind of change it was.
   * Several changes inside one frame (a burst of closes) are one slide, from
   * where the tabs were last painted.
   */
  let flip: {
    added: boolean;
    frame: number;
    from: Map<string, number>;
    removed: boolean;
  } | null = null;
  let lastTabs = untrack(() => [...leaf.tabs]);
  /** The two ids of a tab re-addressed in place. */
  const renamedOut = new Set<string>();
  const renamedIn = new Set<string>();
  /** How far a clip reaches past the tab's box: its sheet's flared foot and shoulders. */
  const REACH = "-12px";
  /** The id of a tab's slide to its new place, so a later slide can take over from it. */
  const SLIDE = "tab-slide";

  // Before the strip changes: where every tab stands, read while the layout
  // is still the one on screen.
  $effect.pre(() => {
    const next = [...leaf.tabs];
    untrack(() => {
      const prev = lastTabs;
      lastTabs = next;
      if (prev.length === next.length) {
        const moved = prev.flatMap((id, i) => (next[i] === id ? [] : [i]));
        if (moved.length === 1 && !prev.includes(next[moved[0]])) {
          renamedOut.add(prev[moved[0]]);
          renamedIn.add(next[moved[0]]);
        }
      }
      if (!(ready && motionOk.current) || flip) {
        return;
      }
      const from = new Map<string, number>();
      for (const [id, el] of tabEls) {
        from.set(id, el.getBoundingClientRect().left);
      }
      flip = { from, added: false, removed: false, frame: 0 };
    });
  });

  // After the strip has its new shape, with any closing tab already out of
  // the flow: every tab that was there before starts where it stood. The
  // new places are read in the next frame's callbacks, where the frame lays
  // the page out anyway, rather than here, where reading them would lay it
  // out a second time inside the change — pane and all.
  $effect(() => {
    const next = [...leaf.tabs];
    untrack(() => {
      const pending = flip;
      if (!pending) {
        return;
      }
      pending.removed ||= [...pending.from.keys()].some(
        (id) => !(next.includes(id) || renamedOut.has(id))
      );
      pending.added ||= next.some(
        (id) => !(pending.from.has(id) || renamedIn.has(id))
      );
      cancelAnimationFrame(pending.frame);
      pending.frame = requestAnimationFrame(() => {
        flip = null;
        slide(pending.from, pending.removed, pending.added);
      });
    });
  });

  /** Every tab that stood somewhere else before the change slides from there to where it lies. */
  function slide(from: Map<string, number>, removed: boolean, added: boolean) {
    let duration = dur("--dur-panel");
    let easing = ease("--ease-drawer");
    if (removed) {
      duration = dur("--dur-fade");
      easing = ease("--ease-in-out");
    } else if (added) {
      duration = dur("--dur-morph");
      easing = ease("--ease-out");
    }
    const tabsNow = leaf.tabs.flatMap((id) => {
      const el = tabEls.get(id);
      const was = from.get(id);
      return el && was !== undefined ? [{ el, was }] : [];
    });
    // A slide still playing is replaced from where it has the tab drawn
    // (`from`, read with it applied); its own offset is not part of where
    // the tab now lies. All are stopped, then all read, then all started,
    // so the page is laid out once for the lot.
    for (const { el } of tabsNow) {
      for (const running of el.getAnimations()) {
        if (running.id === SLIDE) {
          running.cancel();
        }
      }
    }
    const moves = tabsNow.map(({ el, was }) => ({
      el,
      dx: was - el.getBoundingClientRect().left,
    }));
    for (const { el, dx } of moves) {
      if (Math.abs(dx) > 0.5) {
        el.animate(
          [{ transform: `translateX(${dx}px)` }, { transform: "none" }],
          { id: SLIDE, duration, easing }
        );
      }
    }
  }
  onMount(() => () => {
    if (flip) {
      cancelAnimationFrame(flip.frame);
    }
  });

  /**
   * A tab that opened grows from nothing at its place, unless a flight from
   * the row that opened it is landing it: that flight is started in the
   * same frame's callbacks, ahead of this one, so it is there to be seen.
   */
  function entering(id: string): Attachment<HTMLElement> {
    return (node) =>
      untrack(() => {
        tabEls.set(id, node);
        let frame = 0;
        const renamed = renamedIn.delete(id);
        if (!ready || renamed) {
          return forget(id, node, frame);
        }
        // A new tab opens at the strip's end, often past its scrolled edge:
        // it is brought into view now, before a flight measures where it is.
        node.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
        if (!motionOk.current) {
          return forget(id, node, frame);
        }
        frame = requestAnimationFrame(() => {
          const flying = node
            .getAnimations()
            .some(
              (a) => !(a instanceof CSSTransition || a instanceof CSSAnimation)
            );
          if (!flying) {
            node.animate(
              [
                { clipPath: `inset(${REACH} 100% ${REACH} ${REACH})` },
                { clipPath: `inset(${REACH} ${REACH} ${REACH} ${REACH})` },
              ],
              { duration: dur("--dur-morph"), easing: ease("--ease-out") }
            );
          }
        });
        return forget(id, node, frame);
      });
  }

  /** The cleanup of a tab's `entering`: the tab left the strip. */
  function forget(id: string, node: HTMLElement, frame: number) {
    return () => {
      cancelAnimationFrame(frame);
      if (tabEls.get(id) === node) {
        tabEls.delete(id);
        attachments.delete(id);
      }
    };
  }

  /**
   * One pair of attachments per tab id, made once. The strip's tab objects
   * are rebuilt whenever anything about any tab changes, and Svelte tears an
   * attachment down and runs it again whenever the function it is given is a
   * new one; handed the same function, a tab already in the strip keeps its
   * attachments and does not play its arrival again.
   */
  interface TabAttachments {
    enter: Attachment<HTMLElement>;
    land: Attachment<HTMLElement>;
  }
  const attachments = new Map<string, TabAttachments>();
  function attachmentsOf(id: string): TabAttachments {
    let made = attachments.get(id);
    if (!made) {
      made = {
        enter: entering(id),
        land: land(() => `session:${id}`, { uniform: true }),
      };
      attachments.set(id, made);
    }
    return made;
  }

  /**
   * A tab that closed, taken out of the flow where it stands so the tabs
   * after it can close the gap: it narrows toward its start as it fades.
   * With less motion it only fades.
   */
  function leavingTab(node: HTMLElement, id: string): TransitionConfig {
    if (renamedOut.delete(id)) {
      return { duration: 0 };
    }
    const { offsetLeft, offsetTop, offsetWidth } = node;
    node.style.position = "absolute";
    node.style.left = `${offsetLeft}px`;
    node.style.top = `${offsetTop}px`;
    node.style.width = `${offsetWidth}px`;
    node.style.pointerEvents = "none";
    const narrow = motionOk.current;
    return {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t) =>
        narrow
          ? `opacity: ${t}; clip-path: inset(${REACH} ${((1 - t) * 100).toFixed(2)}% ${REACH} ${REACH})`
          : `opacity: ${t}`,
    };
  }

  /**
   * The drawer drags from anywhere in it. A finger pulling down over content
   * that is scrolled to its top would otherwise start the browser's own
   * scroll, which takes the touch away from the drawer; held there, the
   * pull is the drawer's. Content scrolled down scrolls back up first.
   */
  function lockAtTop(node: HTMLElement) {
    let startY = 0;
    const onstart = (event: TouchEvent) => {
      startY = event.touches[0].clientY;
    };
    const onmove = (event: TouchEvent) => {
      if (event.touches[0].clientY <= startY) {
        return;
      }
      for (
        let el = event.target instanceof Element ? event.target : null;
        el && el !== node;
        el = el.parentElement
      ) {
        if (el.scrollTop > 0) {
          return;
        }
      }
      event.preventDefault();
    };
    node.addEventListener("touchstart", onstart, { passive: true });
    node.addEventListener("touchmove", onmove, { passive: false });
    return () => {
      node.removeEventListener("touchstart", onstart);
      node.removeEventListener("touchmove", onmove);
    };
  }
</script>

<!-- `''` when the board is showing: a value no segment carries, so nothing
     is drawn as chosen. -->
<Tabs
  class="session-tabs {hosted ? 'hosted' : ''}"
  onValueChange={(id) => workspace.activate(id, leaf.id)}
  {travel}
  value={leaf.active ?? ''}
  variant="folder"
>
  <TabsList aria-label="Open sessions in this group" scrollable>
    {#each tabs as tab, i (tab.key)}
      {@const chosen = leaf.active === tab.id}
      <!-- The caret marks where a drop would land, drawn on the side the
           pointer is nearest. Graphite, like every structural mark here:
           the one loud colour belongs to a session asking for something. -->
      <!-- Hovering the whole tab (its buttons too) times the details card;
           the keyboard reaches the same card from the tab's link. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="tab"
        onpointerenter={(event) => {
          rebuildScheduler.prepare(tab.id);
          hoverTab(tab.id, event);
        }}
        onpointerleave={leaveDetails}
        class:drop-after={dropHint.tabIndexIn(leaf.id) === i + 1 && i === tabs.length - 1}
        class:drop-before={dropHint.tabIndexIn(leaf.id) === i}
        class:needs={tab.activity === 'blocked'}
        use:dragSession={{ sessionId: tab.id, from: leaf.id }}
        use:tabDropTarget={{ leafId: leaf.id, index: i, sessionId: tab.id }}
        out:leavingTab={tab.id}
        {@attach attachmentsOf(tab.id).enter}
        {@attach attachmentsOf(tab.id).land}
      >
        <ContextMenu.Root onOpenChange={menuOpenChange}>
          <ContextMenu.Trigger class="contents">
            <TabItem
              aria-expanded={detailsOpen && detailId === tab.id}
              aria-haspopup="dialog"
              aria-label={`${tab.label}${tab.status ? ` — ${tab.status}` : ''}${chosen ? ' — open session details' : ''}`}
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
              value={tab.id}
            >
              {#snippet lead()}
                <SessionStatus compact sessionId={tab.id} />
              {/snippet}
              {#snippet trail()}
                <!-- Every tab keeps the details slot, so choosing one never
                     changes its width; the chevron shows on the chosen tab
                     only. The empty slot on another tab is part of that
                     tab, and a click there chooses it. -->
                <button
                  aria-expanded={chosen ? detailsOpen && detailId === tab.id : undefined}
                  aria-haspopup={chosen ? 'dialog' : undefined}
                  aria-hidden={chosen ? undefined : 'true'}
                  aria-label="Session details for {tab.label}"
                  class="tdetails touch-hit pointer-hit pressable"
                  onclick={(event) => {
                    if (chosen) {
                      clickTab(tab.id, event);
                    } else {
                      workspace.activate(tab.id, leaf.id);
                    }
                  }}
                  tabindex={chosen ? undefined : -1}
                  type="button"
                  class:idle={!chosen}
                >
                  <IconChevronDown />
                </button>
                <button
                  aria-label="Close {tab.label}"
                  class="tclose touch-hit pointer-hit pressable"
                  onclick={() => { closeDetails(); workspace.close(tab.id); }}
                  type="button"
                >
                  <IconClose />
                </button>
              {/snippet}
            </TabItem>
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
            <ContextMenu.CopyItem
              text={new URL(tab.href, location.origin).href}
              what="Link"
            >
              Copy link
            </ContextMenu.CopyItem>
          </ContextMenu.Content>
        </ContextMenu.Root>
      </div>
    {/each}
  </TabsList>
</Tabs>

{#if touch.current}
  <!-- It drags from anywhere, not only its handle (`handleOnly` false),
       and content scrolled to its top gives a downward pull to the drawer
       (`lockAtTop`); vaul follows the finger 1:1 and lets go on velocity. -->
  <Drawer.Root
    handleOnly={false}
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
      <div class="details-scroll" {@attach lockAtTop}>
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
        class="kit-pop session-details-popover"
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
  /* The card is a kit floating surface (app.css `.kit-pop`): its surface,
     and its open and close as transitions on data-state. Closed, it rests
     invisible, so there is nothing to show between the close ending and
     bits-ui unmounting it, and a close caught mid-open turns back from where
     the entrance had reached. Its content runs edge to edge. */
  :global(.session-details-popover) {
    display: flex;
    z-index: 60;
    width: min(416px, calc(100vw - 24px));
    max-height: min(760px, var(--bits-popover-content-available-height, 85dvh));
    overflow: hidden;
    overscroll-behavior: contain;
    padding: 0;
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
  /* The two trailing controls sit 4px apart and their hit areas meet
     between them. On a coarse pointer the close button stands 24px off the
     chevron and 8px off the tab's end, so each 44px area reaches its full
     width before meeting a neighbour's. The chevron's leading half falls on
     its own tab's label, which opens the same details. */
  .tdetails,
  .tclose {
    --hit-gap-x: 4px;

    @media (pointer: coarse) {
      --hit-gap-x: 24px;
    }
  }
  /* The session track scrolls sideways, and a scroll container clips on both
     axes; its transparent padding grows into an equal negative margin on a
     coarse pointer, so the controls' touch areas above and below the 32px
     tabs sit inside its clip and nothing moves. The root's data-slot is
     in the selector to outrank the component's own folder padding at any
     stylesheet order: dev draws the first paint with the sheets in another
     order than the build, and a tie would flip once the page hydrates. */
  :global(.session-tabs[data-slot="tabs"] .ff-tabs-list.scrollable) {
    @media (pointer: coarse) {
      padding-block: calc(var(--pad) + 10px) 10px;
      margin-block: -10px;
    }
  }
  .tdetails {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: 22px;
    block-size: 24px;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;

    @media (prefers-reduced-motion: no-preference) {
      transition:
        opacity var(--dur-control) var(--ease-out),
        scale var(--dur-control) var(--ease-out);
    }
    /* Another tab's slot: kept, empty, and part of that tab. */
    &.idle {
      opacity: 0;
      scale: var(--pop-scale);
    }
    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;

      @media (prefers-reduced-motion: no-preference) {
        transition: transform var(--dur-control) var(--ease-out);
      }
    }
    &[aria-expanded="true"] :global(svg) {
      transform: rotate(180deg);
    }
    @media (hover: hover) {
      &:hover {
        background: var(--surface-fill);
      }
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
    :global(.session-details-popover[data-morph]) .details-morph {
      transition: height 260ms var(--ease-drawer);
    }
  }
  /* ── The row ──────────────────────────────────────────────────────
     Folder tabs stand on a shelf: a hairline in the row's own bottom
     pixel, so the chosen tab's sheet — which ends on that same pixel —
     covers it and runs on into the header below. In a group the row is
     the group's own; hosted, it fills the top bar and the bar draws the
     shelf. (A tab switch is not a navigation at all — the segment
     simply slides.) */
  :global(.session-tabs) {
    display: flex;
    align-items: flex-end;
    flex: 0 0 auto;
    min-inline-size: 0;
    padding-block: 4px 0;
    padding-inline: var(--space-7) var(--space-4);
    /* The shelf: two steps below the transcript, one below an unchosen
       tab, so the chosen tab — in the transcript's own surface — reads as
       the page it opens. */
    background: var(--surface-shelf);

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
     horizontal pad. The shape and the sheet are the component's. The
     data-slot outranks the component's defaults by specificity, not by
     which stylesheet comes last. */
  :global(.session-tabs[data-slot="tabs"] .ff-tabs-list) {
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
       is chosen, so the ask is legible from across the strip. It comes up
       at the panel's pace, the way the tab's glyph turns. */
    &.needs :global(.ff-tab) {
      color: var(--ink-strong);

      @media (prefers-reduced-motion: no-preference) {
        transition: color var(--dur-panel) var(--ease-out);
      }
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
    border: 0;
    padding: 0;
    background: none;
    border-radius: var(--radius-xs);
    color: var(--ink-muted);
    cursor: pointer;

    @media not (pointer: coarse) {
      margin-inline-start: 4px;
    }
    @media (pointer: coarse) {
      margin-inline: 24px 8px;
    }
    & :global(svg) {
      display: block;
      inline-size: 16px;
      block-size: 16px;
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
</style>
