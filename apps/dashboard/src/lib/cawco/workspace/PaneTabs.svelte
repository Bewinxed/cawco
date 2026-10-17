<script lang="ts" module>
  /**
   * Where the pointer last moved to, for every strip on the page. A tab that
   * the layout slides under a pointer at rest (a split, a tab closing, the
   * strip scrolling) is entered at exactly this point, before any move is
   * heard; a pointer that came onto a tab is entered somewhere else. One
   * listener for all strips: a strip a split has just made never heard the
   * move that put the pointer where it is.
   */
  let movedTo: { x: number; y: number } | null = null;
  if (typeof window !== "undefined") {
    window.addEventListener(
      "pointermove",
      (event) => {
        movedTo = { x: event.clientX, y: event.clientY };
      },
      { capture: true, passive: true }
    );
  }
</script>

<script lang="ts">
  import type { HarnessKind } from "@cawco/core";
  import { Popover } from "bits-ui";
  /**
   * One group's tabs: a segmented control (the Fluid Functionalism tabs,
   * `#lib/components/ui/fluid-tabs/index.js`) with one segment per open conversation.
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
  import {
    dur,
    ease,
    easeOut,
    lifting,
    motionOk,
    pinned as pinnedOut,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { growTo } from "#lib/cawco/motion/hang.js";
  import { placeHang } from "#lib/cawco/motion/hang-shape.js";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import type { FoldMeasure } from "#lib/components/ui/fluid-tabs/fold-memory.js";
  import {
    restRank,
    TabItem,
    Tabs,
    TabsList,
    type TabsTravel,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import {
    IconAddLine,
    IconArrowRight,
    IconChevronDown,
    IconClose,
  } from "#lib/icons.js";
  import { page } from "$app/state";
  import AccountSubmenu from "../accounts/AccountSubmenu.svelte";
  import {
    ACTIVITY_LABEL,
    type Activity,
    FAILED_LABEL,
    UNKNOWN_LABEL,
  } from "../activity";
  import {
    answeredOr,
    cawco,
    isFailed,
    isStale,
    spawnSession,
  } from "../client.svelte";
  import { continueInNewSession, continueSourceOf } from "../continue.svelte";
  import CawFace from "../home/CawFace.svelte";
  import { failureWords, type HubRead } from "../hub-read";
  import { conversationHref } from "../links";
  import { integrate, type Sample, sampleAt } from "../motion/spring";
  import { sessionName } from "../session-name";
  import { newSession } from "../spawn/new-session.svelte";
  import { spawnPrefs } from "../spawnPrefs.svelte";
  import { isThreadTab } from "../thread-tabs";
  import { runIdOf } from "../workflow-runs";
  import { workingSet } from "../working-set.svelte";
  import { dropHint, tabDropTarget } from "./dnd.svelte";
  import SessionDetails from "./SessionDetails.svelte";
  import SessionStatus from "./SessionStatus.svelte";
  import { rebuildScheduler } from "./scheduler.svelte";
  import { type StatusTone, stepSessionStatus } from "./session-status";
  import { noNativeDrag, pressTab } from "./tab-drag.svelte";
  import { warm } from "./warm.svelte";
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
    (page.data as { names?: Record<string, HubRead<string>> }).names ?? {}
  );
  /** Each tab's shape as last measured, from the layout's cookie (fluid-tabs/fold-memory.ts). */
  const servedBoxes = $derived(
    (page.data as { foldBoxes?: Record<string, FoldMeasure> }).foldBoxes ?? {}
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
    /**
     * What the tab says its status is to a screen reader, whatever it is:
     * the badge's words where it has any, else the status glyph's own label.
     */
    statusLabel: string;
    /** The session's status on the rail's scale: the tab's rim wears it. */
    tone: StatusTone;
  }

  /** A thread's status on the session's scale. */
  const THREAD_TONE = {
    working: "working",
    "needs-you": "attention",
    ready: "quiet",
  } as const satisfies Record<string, StatusTone>;
  /** A thread's status in words, as Caw's face for it would be read. */
  const THREAD_LABEL = {
    working: "Working",
    "needs-you": "Needs you",
    ready: "Ready",
  } as const;

  function resolve(id: string): Tab {
    const row = cawco.instanceIndex.byId.get(id);
    const view = cawco.session(id);
    const ctx = contextOf(id);
    const thread = cawco.threadOf(id);
    const { label, named } = isThreadTab(id)
      ? { label: thread?.title ?? "New thread", named: true }
      : sessionName(id, servedNames);
    const activity = cawco.activityOf(id);
    const failed = row ? isFailed(row) : false;
    const stale = row ? isStale(row) : false;
    const tool = cawco.currentToolOf(id)?.name;
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
    const state = isThreadTab(id) ? null : stepSessionStatus(id);
    return {
      id,
      key: `${id}:${arrivals.get(id) ?? 0}`,
      href: conversationHref(id, cawco.instanceIndex, {
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
      statusLabel: status || (state?.label ?? THREAD_LABEL[threadFace(id)]),
      tone: state?.tone ?? THREAD_TONE[threadFace(id)],
    };
  }

  /** Which of Caw's files a thread's tab shows: what the thread is doing. */
  function threadFace(id: string): "ready" | "working" | "needs-you" {
    return cawco.threadOf(id)?.status ?? "ready";
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
    // The strip's first word of a new order, before its each block lays it
    // out (`noteOrder`).
    untrack(() => noteOrder([...ids]));
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

  /** Where the chosen tab stands, -1 with the board showing. */
  const chosenAt = $derived(tabs.findIndex((tab) => tab.id === leaf.active));
  /** Each status's rim ink, on the rail's scale. */
  const TONE_INK: Record<StatusTone, string> = {
    working: "var(--status-live-glyph)",
    // The attention glyph's tone, darker by day, so its rim holds 3:1.
    attention: "var(--tab-rim-attn)",
    failed: "var(--status-fail-glyph)",
    quiet: "var(--ink-muted)",
    done: "var(--ink-muted)",
  };
  /**
   * Each status's rim strength unchosen (`rest`) and chosen (`full`): an
   * idle tab wears none unchosen, every other status the subtle strength;
   * chosen, idle and done wear the muted ink's own (`.tab`'s `--rim-*`).
   */
  const RIM: Record<StatusTone, { full: string; rest: string }> = {
    working: { rest: "var(--rim-subtle)", full: "var(--rim-chosen)" },
    attention: { rest: "var(--rim-subtle)", full: "var(--rim-chosen)" },
    failed: { rest: "var(--rim-subtle)", full: "var(--rim-chosen)" },
    done: { rest: "var(--rim-subtle)", full: "var(--rim-idle)" },
    quiet: { rest: "0", full: "var(--rim-idle)" },
  };
  /** A tab's place in the track's stack at rest, until the track ranks it (TabItem's own). */
  const restAt = (i: number) => restRank(tabs.length, chosenAt, i);

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
  /**
   * The tab whose options menu is open, if one's is. Hovering must not open
   * the card under an open menu.
   */
  let menuFor = $state<string | null>(null);
  const menuOpen = $derived(menuFor !== null);
  /**
   * The session the card shows. With `detailId` (the tab it hangs from)
   * but a frame behind it while the card moves to another tab: the move
   * (where it hangs, how) in one frame and what it shows, with its title's
   * morph, in the next, each its own task (web.dev, "Optimize long tasks":
   * break a long task up and yield between the parts). Together they were
   * one task of 40ms, the re-placed card's measuring and the new session's
   * card built and measured in it.
   */
  let shownId = $state<string | null>(null);
  const detailTab = $derived(tabs.find((tab) => tab.id === shownId));
  /** An open card's move to another tab, waiting for the frame in hand to paint. */
  let moveFrame = 0;
  let moveTask: ReturnType<typeof setTimeout> | undefined;
  /** What the moved card shows, waiting for the frame its move paints in. */
  let showFrame = 0;
  let showTask: ReturnType<typeof setTimeout> | undefined;
  function holdMove() {
    cancelAnimationFrame(moveFrame);
    clearTimeout(moveTask);
    cancelAnimationFrame(showFrame);
    clearTimeout(showTask);
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
    // A workflow run's tab is its own details, and a thread's is its
    // messages: neither has a session card.
    if (runIdOf(id) || isThreadTab(id)) {
      return;
    }
    clearTimeout(timer);
    holdMove();
    pinned = pin;
    if (!(detailsOpen && detailId !== id)) {
      detailId = id;
      shownId = id;
      detailAnchor = anchor;
      cardPlace = placeOf(anchor, cardWidth());
      cardFlush = cardPlace.flush;
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
        cardPlace = placeOf(anchor, cardWidth());
        cardFlush = cardPlace.flush;
        // What it shows, the frame after it moved (`shownId`).
        showFrame = requestAnimationFrame(() => {
          showTask = setTimeout(() => {
            shownId = id;
          });
        });
      });
    });
  }

  /* ── The card and the menu hang from their tab ───────────────────
     Both hang from the tab's whole box (`.tab`), however they were opened,
     as one silhouette with it (HangCard `tab`, motion/hang-shape): the
     tab's outline runs down its flank, round its foot's flare and on as
     their edge all the way round, one stroke, and they grow out of the
     tab's foot and fold back into it (owner: "this is just a cheap
     workaround, and in both of these the rim doesn't smoothly connect
     between these"; "why aren't these the blended/merged menu that morphs
     out of the tab?").

     Where they stand is the shape's own rule (`placeHang`, the same for
     both, owner: "the curve of the foot doesn't match the curve of the
     tab, and it needs to be wider to fit and connect well"): their top
     edge runs out of each foot's tip, level, to a corner (`radius-lg`) a
     short run (`HANG_RUN`) past it, so the foot's curve goes on into their
     edge and they are always wider than the tab's foot-to-foot span. Where
     that would cross the pane's leading edge (the sidebar's border, a
     split's seam: the strip's box, measured) or the screen's margin, they
     stand flush with the tab's flank on that side instead (owner: "when
     the popover overlays the sidebar it should sit flush with the left
     border of the tab instead of overlapping the sidebar"), its foot
     square, the flank running straight on into their side; past the
     screen's trailing margin they shift toward the start, or stand flush
     with the trailing flank. The card is 416px wide, the screen less its
     margins at most (a phone's runs margin to margin); the menu is as wide
     as its rows, at least as wide as the shape needs. */
  /** Their corner (`radius-lg`) and the level run from a foot's tip to it. */
  const HANG_CORNER = 12;
  const HANG_RUN = 4;
  /** Their margin to the screen's edges. */
  const HANG_MARGIN = 12;
  const flareOf = (anchor: HTMLElement) =>
    Number.parseFloat(
      getComputedStyle(
        anchor.querySelector('[data-slot="ff-tab"]') ?? anchor
      ).getPropertyValue("--flare")
    ) || 0;
  /**
   * Where a hang `width` wide stands under `anchor`: its offset from the
   * tab's leading edge (the primitive's `alignOffset`), its width, and the
   * side it stands flush on, if any.
   */
  function placeOf(anchor: HTMLElement, width: number) {
    const box = anchor.getBoundingClientRect();
    const pane = anchor.closest(".session-tabs")?.getBoundingClientRect();
    const place = placeHang({
      bounds: {
        left: Math.max(pane?.left ?? 0, touch.current ? HANG_MARGIN : 0),
        right: innerWidth - HANG_MARGIN,
      },
      corner: HANG_CORNER,
      flare: flareOf(anchor),
      run: HANG_RUN,
      tab: { left: box.left, right: box.right },
      width,
    });
    let flush: "start" | "end" | null = null;
    if (place.flush.start) {
      flush = "start";
    } else if (place.flush.end) {
      flush = "end";
    }
    return { offset: place.left - box.left, width: place.width, flush };
  }
  /** The card's width: 416px, within the screen less its margins. */
  const cardWidth = () => Math.min(416, innerWidth - 2 * HANG_MARGIN);
  /** Where the card stands under its tab, as it was last placed. */
  let cardPlace = $state<ReturnType<typeof placeOf> | null>(null);
  /** The card stands drawn out of its tab (HangCard `joined`). */
  let cardJoined = $state(false);
  /**
   * The side the card stands flush with its tab on, as HangCard measures it
   * where the card stands (and as `placeOf` says before it is placed): the
   * tab's sheet is square at its foot on that side.
   */
  let cardFlush = $state<"start" | "end" | null>(null);
  /** The tab's box, the card's anchor, by the tab's id. */
  function anchorOf(id: string): HTMLElement | null {
    return (
      document
        .querySelector(`[data-session-tab="${CSS.escape(id)}"]`)
        ?.closest<HTMLElement>('[data-slot="tab"]') ?? null
    );
  }
  /** Set by the finger that folded the card into its tab: nothing left to play. */
  let folded = false;
  /** A card the finger folded into its tab (`swipeCardShut`) is already shut and leaves at once. */
  function takeFolded() {
    const was = folded;
    folded = false;
    return was;
  }
  /**
   * A finger dragged outside the open card closes it and carries on as the
   * scroll it is, as the iOS app's card does (a pan beside its light-dismiss
   * tap). bits-ui's dismissable layer closes a touch on its `click`, which a
   * drag never sends. A press
   * outside it (not on a tab, which chooses or keeps it, and not in a layer
   * the card opened) that travels past the kit's drag slop (utils/longpress)
   * closes it; so does the browser taking that press for a scroll
   * (`pointercancel`), which can come before any move past the slop is heard.
   * Passive and never prevented: the scroll proceeds.
   */
  const DRAG_SLOP = 10;
  let cardEl = $state<HTMLElement | null>(null);
  function closeOnOutsideDrag(card: HTMLElement) {
    let press: { id: number; x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      press = null;
      const { target } = event;
      if (
        event.pointerType === "mouse" ||
        !event.isPrimary ||
        !(target instanceof Element) ||
        card.contains(target) ||
        target.closest('.session-tabs [data-slot="tab"]') ||
        target.closest("[data-bits-floating-content-wrapper]")
      ) {
        return;
      }
      press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent) => {
      if (
        press?.id === event.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_SLOP
      ) {
        press = null;
        closeDetails();
      }
    };
    const cancel = (event: PointerEvent) => {
      if (press?.id === event.pointerId) {
        press = null;
        closeDetails();
      }
    };
    const up = (event: PointerEvent) => {
      if (press?.id === event.pointerId) {
        press = null;
      }
    };
    const options = { capture: true, passive: true } as const;
    document.addEventListener("pointerdown", down, options);
    document.addEventListener("pointermove", move, options);
    document.addEventListener("pointercancel", cancel, options);
    document.addEventListener("pointerup", up, options);
    return () => {
      document.removeEventListener("pointerdown", down, options);
      document.removeEventListener("pointermove", move, options);
      document.removeEventListener("pointercancel", cancel, options);
      document.removeEventListener("pointerup", up, options);
    };
  }
  $effect(() => {
    const card = cardEl;
    if (!(detailsOpen && card)) {
      return;
    }
    return untrack(() => closeOnOutsideDrag(card));
  });
  // A finger's swipe up the card's head, beside bits-ui's own handlers in
  // the content's props.
  $effect(() => {
    const card = cardEl;
    if (!card) {
      return;
    }
    card.addEventListener("pointerdown", swipeCardShut);
    return () => card.removeEventListener("pointerdown", swipeCardShut);
  });
  // The morph mark changes as the surface retargets. It is set on the
  // element: as a prop of the popover's content the change re-mounts
  // bits-ui's focus scope, which runs its close auto-focus on a surface
  // that is still open.
  $effect(() => {
    cardEl?.toggleAttribute("data-morph", morphing);
  });
  function hoverTab(id: string, event: PointerEvent) {
    if (touch.current || event.pointerType !== "mouse" || pinned || menuOpen) {
      return;
    }
    clearTimeout(timer);
    // The handlers sit on the whole tab, its buttons included, so moving onto
    // them is not leaving it; the card hangs from the whole tab.
    const anchor = event.currentTarget as HTMLElement;
    if (detailsOpen) {
      showDetails(id, anchor, false);
      return;
    }
    timer = setTimeout(() => showDetails(id, anchor, false), 350);
  }
  function setMenu(id: string, open: boolean) {
    if (!open) {
      if (menuFor === id) {
        menuFor = null;
      }
      return;
    }
    menuFor = id;
    clearTimeout(timer);
    if (detailsOpen && !pinned) {
      closeDetails();
    }
  }
  /**
   * The strip scrolled: a card the pointer opened by hovering its tab
   * closes, since that tab has moved out from under the pointer, and it
   * does not open again until the pointer moves (`hoverTab`, a tab come
   * under a pointer at rest). Following its tab instead, it was placed
   * again every frame of the scroll, measured, moved and repainted: two
   * thirds of the main thread's work in a tab strip's scroll. A pinned card
   * stays and follows its tab.
   */
  function scrolledUnderCard() {
    if (pinned) {
      return;
    }
    // A card about to open on hover would open on a tab that has moved on.
    clearTimeout(timer);
    if (detailsOpen) {
      closeDetails();
    }
  }
  /**
   * A press on a tab is a choice, not a look (hover intent: a tooltip hides
   * on pointerdown too). The card a resting pointer was about to open does
   * not open, and on a tab being chosen a card its hover opened closes: the
   * 350ms timer opened it just as the switch landed, 58ms of the switch's
   * frames spent on a card nobody asked for. On the chosen tab an open card
   * is the click's to pin (`clickTab`), and a pinned card follows the
   * choice; both stay.
   */
  function pressedTab(chosen: boolean) {
    clearTimeout(timer);
    if (!chosen && detailsOpen && !pinned) {
      closeDetails();
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
    // The tab's box, whichever of its parts was clicked: the chevron's
    // click once hung the card from the 20px chevron near the tab's end.
    const anchor = anchorOf(id);
    if (!anchor) {
      return;
    }
    if (leaf.active === id) {
      event.preventDefault();
      if (detailsOpen && pinned && detailId === id) {
        closeDetails();
      } else {
        showDetails(id, anchor, true);
      }
    } else if (detailsOpen) {
      showDetails(id, anchor, pinned);
    } else {
      closeDetails();
    }
  }
  $effect(() => {
    if (!detailTab) {
      closeDetails();
    }
  });

  /**
   * A middle click on a tab (its link, which spans it, or its close)
   * closes it, as its close button does (owner:
   * "need middle click to close a tab"). Its press takes no default either:
   * not the browser's autoscroll, not a paste of the selection, and not the
   * tab's link opening in a browser tab of its own.
   */
  function middleDown(event: MouseEvent) {
    if (event.button === 1) {
      event.preventDefault();
    }
  }
  /* ── A tab from the keyboard (WAI-ARIA APG, Tabs) ─────────────────
     The tablist holds tabs alone (axe, aria-required-children): a tab's
     close X and details chevron are a pointer's, out of the tree and the
     tab order, and the tab itself does what they do. Delete closes it
     (APG: "Delete (Optional): If deletion is allowed, deletes (closes) the
     current tab element … sets focus on the tab following the tab that was
     closed … If there is not a tab that followed … sets focus on … the tab
     that preceded"); which tab comes to the front stays the strip's rule
     (workspace `close`). Shift+F10 or the menu key opens its menu (APG:
     "Shift + F10: If the tab has an associated popup menu, opens the
     menu"), the menu a finger holds or pulls down; ArrowDown or Space its
     details. w3.org/WAI/ARIA/apg/patterns/tabs/ */
  function closeByKey(id: string) {
    const at = leaf.tabs.indexOf(id);
    const next = leaf.tabs[at + 1] ?? leaf.tabs[at - 1] ?? null;
    closeDetails();
    workspace.close(id);
    requestAnimationFrame(() => {
      const tab = next ? anchorOf(next) : null;
      tab?.querySelector<HTMLElement>('[role="tab"]')?.focus();
    });
  }
  function menuByKey(id: string, event: KeyboardEvent) {
    if (!(
      event.key === "ContextMenu" ||
      (event.key === "F10" && event.shiftKey)
    )) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    const node = anchorOf(id);
    if (node) {
      openMenu(node);
    }
    return true;
  }
  function middleClose(id: string, event: MouseEvent) {
    if (event.button !== 1) {
      return;
    }
    event.preventDefault();
    closeDetails();
    workspace.close(id);
  }

  /* ── A new session, from the strip's end ──────────────────────────
     The "+" after the last tab starts a session in the place of the tab in
     front (its machine, folder and harness), on the spawn the project
     head's Start empty sends (ProjectHead `startSession`): the new-session
     form's last settings, its model and effort where the harness is the
     same. The new tab opens just after the one it came from (workspace
     `place`). With nothing in front, or a tab with no place of its own (a
     thread, a workflow run), it opens the New Session form instead.

     It stands outside the tablist, after the track, so the tablist holds
     tabs alone and the keyboard reaches it after them. It wears the tabs'
     close X's look: the X's glyph grammar, its resting ink, the strong ink
     only under the pointer. While the hub takes the spawn it spins in its
     place. A spawn the hub refuses stays on the "+" (DESIGN.md, The Stay In
     Context Rule): its glyph turns the failed status ink, its tooltip opens
     with the hub's reason, and the reason is its description; the next
     press clears it. */
  let starting = $state(false);
  /** Why the hub refused the last start from here, until the next press. */
  let refused = $state<string | null>(null);
  let newTip = $state(false);
  const refusedId = $props.id();
  async function startHere() {
    refused = null;
    const here = leaf.active;
    const ctx =
      here && !(runIdOf(here) || isThreadTab(here)) ? contextOf(here) : null;
    if (!(here && ctx?.machine && ctx.cwd)) {
      newSession(ctx?.machine ? { machineId: ctx.machine } : undefined);
      return;
    }
    const harness = ctx.harness as HarnessKind;
    const same = spawnPrefs.harness === harness;
    const projectId = cawco.instanceIndex.byId.get(here)?.projectId;
    starting = true;
    let instanceId: string;
    try {
      instanceId = answeredOr(
        ctx.machine,
        await spawnSession({
          machineId: ctx.machine,
          cwd: ctx.cwd,
          harness,
          ...(same ? { model: spawnPrefs.model } : {}),
          ...(same && spawnPrefs.effort ? { effort: spawnPrefs.effort } : {}),
          ...(projectId ? { projectId } : {}),
        }),
        "whether the session started is not known"
      );
    } catch (error) {
      refused = failureWords(error);
      newTip = true;
      return;
    } finally {
      starting = false;
    }
    workspace.open(instanceId, ctx, leaf.id);
  }
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

  /**
   * Before the strip changes: where every tab stands, read while the layout
   * is still the one on screen. Read where the strip first hears the new
   * order (the `tabs` derived, which its each block reads before it lays
   * the change out), not in an `$effect.pre`: Svelte commits the each
   * block's change, a closing tab already out of the flow (`leavingTab`)
   * and an opening one already in it, before the pre effects run, so the
   * tabs were read where they had already landed, no tab slid, and the
   * closing tab faded over neighbours that had jumped (owner: "it seems the
   * tab bar crossfades to the state where the tab isn't there").
   */
  function noteOrder(next: string[]) {
    const prev = lastTabs;
    if (prev.length === next.length && prev.every((id, i) => id === next[i])) {
      return;
    }
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
  }

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

  /** A run the strip or a flight started itself, not a style's transition. */
  const owned = (run: Animation) =>
    !(run instanceof CSSTransition || run instanceof CSSAnimation);

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
        // A new tab can open past the strip's scrolled edge (after the tab
        // in front, or at the end): it is brought into view now, before a
        // flight measures where it is.
        node.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
        if (!motionOk.current) {
          return forget(id, node, frame);
        }
        frame = requestAnimationFrame(() => {
          const flying = node.getAnimations().some(owned);
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
    const narrow = motionOk.current;
    // Taken out of the flow, it keeps its place in the stack as it fades.
    return lifting(
      node,
      pinnedOut(node, () => ({ "z-index": "var(--z, 1)" })),
      {
        duration: dur("--dur-exit"),
        easing: easeOut,
        css: (t) =>
          narrow
            ? `opacity: ${t}; clip-path: inset(${REACH} ${((1 - t) * 100).toFixed(2)}% ${REACH} ${REACH})`
            : `opacity: ${t}`,
      }
    );
  }

  /* ── A tab's options, held or pulled down ─────────────────────────
     One menu per tab, its context menu, with Close in it: on a phone the
     only way to close a tab. A long press opens it (utils/longpress), and
     so does a finger dragged down off the tab: mostly vertical past
     PULL_SLOP takes hold, and the menu hangs from the tab's foot and comes
     down under the finger 1:1. Let go past PULL_OPEN (carried along its
     speed) and it settles open on the house spring (motion/spring), the
     one the Caw drawer lands on; short of it, it goes back up and closes.
     A sideways drag is the strip's scroll (`touch-action: pan-x`). With
     less motion the menu simply opens once the drag passes PULL_OPEN. */
  /** Past a held finger's slop (utils/longpress, 10px), so a pull is never also a hold. */
  const PULL_SLOP = 12;
  const PULL_OPEN = 24;
  /** Release speed is read over this last stretch, ms. */
  const PULL_WINDOW = 80;
  /** How far a release is carried along its speed, ms (as the Caw drawer's). */
  const PULL_PROJECT = 99;

  /** The menu openings this strip made itself, already at the tab's foot. */
  const anchored = new WeakSet<Event>();

  /* ── The menu hangs from its tab ──────────────────────────────────
     As the session card does, by the same shape (HangCard `tab`,
     `placeOf`): one silhouette with its tab, on the tab's own surface, so
     tab and menu are one sheet (owner: "it should have the same continuous
     styling like the tab"). However it is opened, the chevron, a right
     click, a long press, it hangs from the tab's foot under the row, never
     over the row at the pointer. Pulled down, the finger draws it out of
     the foot 1:1 (`drawPull`, the shape `at` of the way out), which is its
     open; held, or from the chevron or a click, it grows out of the foot
     on its own (`hang`). */
  /** The tab whose menu hangs from it, while it stands open. */
  let menuHung = $state<string | null>(null);
  /** The side the hanging menu stands flush with its tab on (HangCard). */
  let menuFlush = $state<"start" | "end" | null>(null);
  /** The least width the shape needs past the tab's span (`placeOf`). */
  let menuMin = $state(0);
  /** A finger is drawing the menu out: the pull is its open. */
  let menuHeld = false;
  /** A finger put the menu back into its tab: it is already shut. */
  let menuFolded = false;
  function takeMenuFolded() {
    const was = menuFolded;
    menuFolded = false;
    return was;
  }

  /** The side a tab's hanging card or menu stands flush with it on, if one hangs. */
  function hungFlush(card: boolean, menu: boolean) {
    if (card) {
      return cardFlush ?? undefined;
    }
    return menu ? (menuFlush ?? undefined) : undefined;
  }

  /** Opens tab's menu hanging from its foot, under the row. */
  function openMenu(tabNode: HTMLElement) {
    const hit = tabNode.querySelector("[data-session-tab]") ?? tabNode;
    const box = tabNode.getBoundingClientRect();
    const place = placeOf(tabNode, 0);
    menuFlush = place.flush;
    menuMin = place.width;
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: box.left + place.offset,
      clientY: box.bottom,
    });
    anchored.add(event);
    hit.dispatchEvent(event);
  }

  /**
   * The menu has one place, whatever opened it: hanging from the tab's foot
   * under the row, where a pull brings it, never over the row at the
   * pointer. A long press's and a right click's menu are moved there.
   */
  function anchorMenu(event: MouseEvent) {
    if (anchored.has(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openMenu(event.currentTarget as HTMLElement);
  }

  /** The open menu's surface, once bits-ui has mounted it. */
  const openMenuEl = () =>
    document.querySelector<HTMLElement>(
      '[data-slot="context-menu-content"][data-state="open"]'
    );

  /**
   * Draws a tab's hang `at` of the way out of the tab's foot, the one shape
   * (motion/hang `growTo`): 0 the tab alone, 1 out. Past fully out it
   * stands out: the shape is the hang's own size at most.
   */
  const drawPull = (el: HTMLElement, at: number) => growTo(el, at);

  /** The hang stands fully out where the finger left it. */
  const releasePull = (el: HTMLElement) => growTo(el, 1);

  let pullFrame = 0;
  onMount(() => () => cancelAnimationFrame(pullFrame));

  /**
   * Settles a surface hanging from a tab's foot (the tab's menu, its card)
   * from `from` of the way out to open (1) or shut (0) on the house spring,
   * leaving at `speed` px/ms; `done` hears where it came to rest.
   */
  function settlePull(
    el: HTMLElement,
    from: number,
    target: 0 | 1,
    speed: number,
    done: (target: 0 | 1) => void
  ) {
    cancelAnimationFrame(pullFrame);
    const h = el.offsetHeight || 1;
    const path: Sample[] = integrate((from - target) * h, speed * 1000);
    const start = performance.now();
    // biome-ignore lint/style/useAtIndex: integrate() always returns at least two points
    const end = path[path.length - 1].t;
    const step = (now: number) => {
      const seconds = (now - start) / 1000;
      drawPull(el, target + sampleAt(path, seconds).x / h);
      if (seconds < end) {
        pullFrame = requestAnimationFrame(step);
        return;
      }
      done(target);
    };
    pullFrame = requestAnimationFrame(step);
  }
  /** Where a tab's menu comes to rest: back to its own rules open, or closed. */
  const menuRest = (id: string, el: HTMLElement) => (target: 0 | 1) => {
    menuHeld = false;
    if (target === 1) {
      releasePull(el);
    } else {
      // Back in its tab: it leaves from there, with nothing left to play.
      menuFolded = true;
      setMenu(id, false);
    }
  };

  /** The press that follows a pull lands on the tab as a click: it is not one. */
  function swallowClick(node: HTMLElement) {
    const swallow = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    node.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => node.removeEventListener("click", swallow, true), 400);
  }

  /** Where a pull's finger was, px down from where it pressed, and when. */
  interface PullSample {
    t: number;
    y: number;
  }

  /** A press's travel so far: too short to say, a pull down, or not one. */
  function pullVerdict(dx: number, dy: number): "wait" | "pull" | "not" {
    if (Math.hypot(dx, dy) < PULL_SLOP) {
      return "wait";
    }
    return dy > 0 && dy > Math.abs(dx) ? "pull" : "not";
  }

  /** Keeps the samples of the last PULL_WINDOW, and at least two. */
  function track(samples: PullSample[], y: number, t: number) {
    samples.push({ y, t });
    while (samples.length > 2 && t - (samples.at(0)?.t ?? t) > PULL_WINDOW) {
      samples.shift();
    }
  }

  /** The finger's speed down over the samples, px/ms. */
  function pullSpeed(samples: PullSample[]): number {
    const [first] = samples;
    const last = samples.at(-1);
    return first && last && last.t > first.t
      ? (last.y - first.y) / (last.t - first.t)
      : 0;
  }

  function pullMenu(id: string, event: PointerEvent) {
    if (event.pointerType === "mouse" || !event.isPrimary) {
      return;
    }
    const node = event.currentTarget as HTMLElement;
    const x0 = event.clientX;
    const y0 = event.clientY;
    let pulling = false;
    let el: HTMLElement | null = null;
    let dy = 0;
    const samples: PullSample[] = [];
    const move = (e: PointerEvent) => {
      dy = e.clientY - y0;
      if (!pulling) {
        const verdict = pullVerdict(e.clientX - x0, dy);
        if (verdict === "wait") {
          return;
        }
        if (verdict === "not") {
          stop();
          return;
        }
        pulling = true;
        node.setPointerCapture(e.pointerId);
        swallowClick(node);
        if (motionOk.current) {
          menuHeld = true;
          openMenu(node);
        }
      }
      if (!motionOk.current) {
        if (dy >= PULL_OPEN) {
          stop();
          openMenu(node);
        }
        return;
      }
      cancelAnimationFrame(pullFrame);
      track(samples, dy, e.timeStamp);
      el ??= openMenuEl();
      if (el) {
        drawPull(el, dy / (el.offsetHeight || 1));
      }
    };
    const up = () => {
      stop();
      if (!(pulling && motionOk.current)) {
        return;
      }
      const shown = el ?? openMenuEl();
      if (!shown) {
        menuHeld = false;
        return;
      }
      const speed = pullSpeed(samples);
      const h = shown.offsetHeight || 1;
      settlePull(
        shown,
        dy / h,
        dy + speed * PULL_PROJECT >= PULL_OPEN ? 1 : 0,
        speed,
        menuRest(id, shown)
      );
    };
    /** The press was taken away mid-pull: the menu goes back up. */
    const cancel = () => {
      stop();
      if (pulling && el) {
        settlePull(el, dy / (el.offsetHeight || 1), 0, 0, menuRest(id, el));
      } else {
        menuHeld = false;
      }
    };
    const stop = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", cancel);
  }

  /**
   * A finger swiping up on the open card's head folds it back into its tab,
   * 1:1 under the finger, and lets go on the house spring: past PULL_OPEN
   * (carried along its speed) it goes back into the tab and closes; short
   * of it, it comes back down. The pull of the tab's menu, the other way.
   * With less motion a swipe past PULL_OPEN closes it.
   */
  function swipeCardShut(event: PointerEvent) {
    if (
      event.pointerType === "mouse" ||
      !event.isPrimary ||
      !(
        event.target instanceof Element &&
        event.target.closest('[data-slot="head"]')
      )
    ) {
      return;
    }
    const el = event.currentTarget as HTMLElement;
    const x0 = event.clientX;
    const y0 = event.clientY;
    let swiping = false;
    let dy = 0;
    const samples: PullSample[] = [];
    const h = () => el.offsetHeight || 1;
    const move = (e: PointerEvent) => {
      dy = e.clientY - y0;
      if (!swiping) {
        const verdict = pullVerdict(e.clientX - x0, -dy);
        if (verdict === "wait") {
          return;
        }
        if (verdict === "not") {
          stop();
          return;
        }
        swiping = true;
        el.setPointerCapture(e.pointerId);
      }
      if (!motionOk.current) {
        if (-dy >= PULL_OPEN) {
          stop();
          closeDetails();
        }
        return;
      }
      cancelAnimationFrame(pullFrame);
      track(samples, dy, e.timeStamp);
      drawPull(el, 1 + Math.min(dy, 0) / h());
    };
    const up = () => {
      stop();
      if (!(swiping && motionOk.current)) {
        return;
      }
      const speed = pullSpeed(samples);
      settlePull(
        el,
        1 + Math.min(dy, 0) / h(),
        -(dy + speed * PULL_PROJECT) >= PULL_OPEN ? 0 : 1,
        speed,
        (target) => {
          if (target === 0) {
            // Folded into the tab: it leaves from there, with nothing left
            // to play.
            folded = true;
            closeDetails();
          } else {
            releasePull(el);
          }
        }
      );
    };
    const cancel = () => {
      stop();
      if (swiping && motionOk.current) {
        settlePull(el, 1 + Math.min(dy, 0) / h(), 1, 0, () => releasePull(el));
      }
    };
    const stop = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
  }
</script>

<!-- `''` when the board is showing: a value no segment carries, so nothing
     is drawn as chosen. Its literals ride custom properties the strip's
     rules below read (a tab's height and inner pad, the coarse pointer's
     reach past the track, the phone fade's run, an uncapped fade). -->
<!-- literal: 12px, 32px, 10px, 16px, 100vw -->
<Tabs
  data-session-tabs
  boxes={servedBoxes}
  class="session-tabs {hosted ? 'hosted' : ''}"
  data-strip={leaf.id}
  style="--strip-px: 12px; --strip-item-rest: 32px; --strip-reach: 10px; --strip-fade: 16px; --strip-uncapped: 100vw"
  onValueChange={(id) => workspace.activate(id, leaf.id)}
  {travel}
  value={leaf.active ?? ""}
  values={leaf.tabs}
  variant="folder"
>
  <TabsList
    aria-label="Open sessions in this group"
    onscroll={scrolledUnderCard}
    scrollable
  >
    {#each tabs as tab, i (tab.key)}
      {@const chosen = leaf.active === tab.id}
      {@const cardHere = cardJoined && detailId === tab.id}
      {@const menuHere = menuHung === tab.id}
      <!-- The caret marks where a drop would land, drawn on the side the
           pointer is nearest. Graphite, like every structural mark here:
           the one loud colour belongs to a session asking for something. -->
      <!-- Hovering the whole tab (its buttons too) times the details card;
           the keyboard reaches the same card from the tab's link. -->
      <!-- As wide as its title, its pad and its controls, up to the cap; only
           a title past the cap ends in an ellipsis, and a strip that will
           not fit scrolls (TabsList) rather than squeezing its tabs. A
           finger's sideways drag is the strip's scroll; a downward one is
           the tab's (`pullMenu`), never the page's. Where a drop would land:
           a 2px rule in the gap, on the near side; the tab that draws it
           stands over the strip while it does, so no neighbour's shape
           covers the rule. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        data-slot="tab"
        data-needs={tab.activity === "blocked" || undefined}
        data-drop-before={dropHint.tabIndexIn(leaf.id) === i || undefined}
        data-drop-after={(dropHint.tabIndexIn(leaf.id) === i + 1 &&
          i === tabs.length - 1) ||
          undefined}
        class="group/tab relative flex max-w-c-tab-max-w min-w-0 flex-none touch-pan-x data-drop-after:z-(--drop-z) data-drop-before:z-(--drop-z)"
        style:--drop-z="calc(var(--stack-top) + 1)"
        data-chosen={chosen ? "" : undefined}
        data-flush={hungFlush(cardHere, menuHere)}
        data-hung={cardHere || menuHere ? "" : undefined}
        data-tone={tab.tone}
        oncontextmenucapture={anchorMenu}
        onpointerdown={(event) => {
          pressedTab(chosen);
          if (!chosen) {
            warm.reach(leaf.id, tab.id);
          }
          pullMenu(tab.id, event);
          pressTab(event, {
            leafId: leaf.id,
            sessionId: tab.id,
            onlift: () => {
              clearTimeout(timer);
              closeDetails();
            },
          });
        }}
        onpointerenter={(event) => {
          // A tab that came under a pointer at rest was not pointed at:
          // nothing to warm and no card to open. Clicking a tab and then
          // splitting (`mod+\`) slid its neighbour under the pointer and
          // opened that neighbour's card; a scroll of the strip carried
          // tab after tab under it and warmed each one's conversation.
          if (movedTo?.x === event.clientX && movedTo.y === event.clientY) {
            return;
          }
          rebuildScheduler.prepare(tab.id);
          if (!chosen) {
            warm.reach(leaf.id, tab.id);
          }
          hoverTab(tab.id, event);
        }}
        onpointerleave={() => {
          warm.leave(leaf.id, tab.id);
          leaveDetails();
        }}
        style:--lone-end={Number(i === tabs.length - 1)}
        style:--lone-start={Number(i === 0)}
        style:--rim-full={RIM[tab.tone].full}
        style:--rim-rest={RIM[tab.tone].rest}
        style:--tone={TONE_INK[tab.tone]}
        style:--z-rest={restAt(i)}
        use:tabDropTarget={{ leafId: leaf.id, index: i, sessionId: tab.id }}
        out:leavingTab={tab.id}
        {@attach attachmentsOf(tab.id).enter}
        {@attach attachmentsOf(tab.id).land}
        {@attach noNativeDrag}
      >
        <!-- Its shadow on the tab behind it, first so its own card covers
             what casts it. Where two tabs overlap, the one in front casts
             its edge on the one behind (`shadow-tab-start`,
             `shadow-tab-end`, in `tab-shade`), so each reads as its own
             folder, rimmed or not. Only sideways: not from the strip's first
             tab's leading side or its last tab's trailing side
             (`--lone-start`/`--lone-end`), and nothing above a tab's top or
             below the shelf's line. The chosen tab's cast (`data-chosen`)
             comes and goes with the choice, on its clock. The edge is cast
             by boxes of their own under the tab's shape, in its stack: the
             tab's box less its 1px slope, square sides and rounded
             shoulders at the tab radius, filled opaque, one casting each
             side's `box-shadow`; painted, never filtered (a `drop-shadow()`
             on the shape was drawn again offscreen every frame of a switch
             in WebKit). The cast fades out over the flare above the foot (a
             mask, so the shade's box is the box the tab's shape is drawn on,
             one flare wider each side, the casting boxes set back in by the
             flare). -->
        <span
          data-slot="shade"
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-(--shade-x) inset-y-0 z-0"
          style:--shade-x="calc(-1 * var(--flare))"
          style:--cast-start="calc(var(--flare) + var(--slope-start))"
          style:--cast-end="calc(var(--flare) + var(--slope-end))"
          style:--cast-r="var(--radius) var(--radius) 0 0"
          ><span
            class="absolute inset-y-0 start-(--cast-start) end-(--cast-end) rounded-(--cast-r) bg-surface-recess-deep opacity-(--cast-op) shadow-tab-start group-data-chosen/tab:shadow-tab-start-chosen motion-safe:transition-[box-shadow] motion-safe:duration-(--choose-dur) motion-safe:ease-(--choose-ease)"
            style:--cast-op="calc(1 - var(--lone-start, 0))"
          ></span><span
            class="absolute inset-y-0 start-(--cast-start) end-(--cast-end) rounded-(--cast-r) bg-surface-recess-deep opacity-(--cast-op) shadow-tab-end group-data-chosen/tab:shadow-tab-end-chosen motion-safe:transition-[box-shadow] motion-safe:duration-(--choose-dur) motion-safe:ease-(--choose-ease)"
            style:--cast-op="calc(1 - var(--lone-end, 0))"
          ></span></span
        >
        <!-- The tab's options: a finger's hanging menu and a mouse's both. -->
        {#snippet options()}
          {#if !(runIdOf(tab.id) || isThreadTab(tab.id))}
            <ContextMenu.Item
              onSelect={() => {
                const anchor = anchorOf(tab.id);
                if (anchor) {
                  showDetails(tab.id, anchor, true);
                }
              }}>Session details</ContextMenu.Item
            >
            <ContextMenu.Item
              onSelect={() =>
                continueInNewSession(continueSourceOf(tab.id, tab.label))}
            >
              <IconArrowRight />
              <span>Continue in new session…</span>
            </ContextMenu.Item>
            {@const row = cawco.instances.find((one) => one.id === tab.id)}
            {#if row}
              <AccountSubmenu instance={row} />
            {/if}
          {/if}
          <!-- Every gesture has a command that does the same thing. Splitting
                 and moving are reachable from here before drag-and-drop exists,
                 and stay reachable for anyone not using a pointer. -->
          <ContextMenu.Item
            onSelect={() => workspace.split(leaf.id, "right", tab.id)}
          >
            Split right
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => workspace.split(leaf.id, "bottom", tab.id)}
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
        {/snippet}
        <ContextMenu.Root
          bind:open={() => menuFor === tab.id, (open) => setMenu(tab.id, open)}
        >
          <!-- No tabindex of its own: the box is `display: contents` and
               never takes focus, and one made it a focusable child of the
               tablist that is not a tab (axe, aria-required-children). -->
          <ContextMenu.Trigger class="contents" tabindex={null}>
            <TabItem
              aria-expanded={menuFor === tab.id}
              aria-haspopup="menu"
              aria-keyshortcuts="Delete Shift+F10"
              aria-label={`${tab.label}, ${tab.statusLabel}${chosen ? " — open session details" : ""}`}
              data-session-tab={tab.id}
              flush={hungFlush(cardHere, menuHere)}
              hung={cardHere || menuHere}
              href={tab.href}
              label={tab.label}
              onauxclick={(event) => middleClose(tab.id, event)}
              onblur={() => warm.leave(leaf.id, tab.id)}
              onclick={(event) => clickTab(tab.id, event)}
              onfocus={() => {
                // The arrow keys move focus along the strip before Enter
                // chooses: the pane is laid out while the focus rests.
                if (!chosen) {
                  warm.reach(leaf.id, tab.id);
                }
              }}
              onkeydown={(event) => {
                if (event.key === "ArrowDown" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  const anchor = anchorOf(tab.id);
                  if (anchor) {
                    showDetails(tab.id, anchor, true);
                  }
                } else if (event.key === "Delete") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeByKey(tab.id);
                } else {
                  menuByKey(tab.id, event);
                }
              }}
              onmousedown={middleDown}
              onpointerdown={() => rebuildScheduler.prepare(tab.id)}
              value={tab.id}
            >
              {#snippet lead()}
                <!-- The status glyph, on the desk beside the rim: the
                     phone's row draws none (owner: "why does it still have
                     the icon if the rim is there"; "desktop has icons
                     mobile not"); the tab's label says the status in words
                     either way. -->
                <span class="max-desk:hidden">
                  {#if isThreadTab(tab.id)}
                    <!-- A thread's mark is Caw, at what the thread is doing. -->
                    <CawFace size={18} status={threadFace(tab.id)} />
                  {:else}
                    <SessionStatus compact sessionId={tab.id} />
                  {/if}
                </span>
              {/snippet}
              {#snippet trail()}
                <!-- Every tab keeps the details slot, so choosing one never
                     changes its width; the chevron shows on the chosen tab
                     only. The empty slot on another tab is part of that
                     tab, and a click there chooses it. A workflow run's tab
                     has no details card, and so no slot. A phone draws no
                     slot at all: the tab's menu is its long press. It is a
                     pointer's alone, as the close is: a tablist holds tabs
                     (axe, aria-required-children), and the tab itself opens
                     its details (ArrowDown or Space, and its name says so). -->
                {#if !(runIdOf(tab.id) || isThreadTab(tab.id))}
                  <!-- The trailing controls sit 4px after the title and 4px
                       apart, on every pointer (owner: "a lot of wasted space
                       until the x button"); where the chevron stands beside
                       the close, their hit areas meet between them. Its 12px
                       glyph 4px clear of the title's end, as the close's is.
                       Another tab's slot: kept, empty, and part of that tab;
                       it comes and goes with the choice. A phone's tabs have
                       no chevron: a long press opens the tab's menu (Session
                       details first), and a tap on the chosen tab its
                       details. -->
                  <!-- literal: 20px, 24px -->
                  <button
                    data-slot="tdetails"
                    aria-hidden="true"
                    class="touch-hit pointer-hit pressable grid h-(--tdetails-h) w-(--tdetails-w) flex-none cursor-pointer place-items-center rounded-xs border-none border-current bg-transparent text-ink-muted hover:bg-surface-fill max-desk:hidden"
                    style:--hit-gap-x="var(--space-1)"
                    style:--tdetails-w="20px"
                    style:--tdetails-h="24px"
                    data-idle={!chosen || undefined}
                    data-open={chosen && detailsOpen && detailId === tab.id
                      ? ""
                      : undefined}
                    onclick={(event) => {
                      if (chosen) {
                        clickTab(tab.id, event);
                      } else {
                        workspace.activate(tab.id, leaf.id);
                      }
                    }}
                    tabindex="-1"
                    type="button"
                  >
                    <IconChevronDown />
                  </button>
                {/if}
                <!-- A mouse's close. A finger's is in the tab's options,
                     held or pulled down from the tab, and the phone's row
                     draws none. The keyboard's and a screen reader's is the
                     tab's own Delete (`closeByKey`), so this one is not in
                     the tablist's tree. -->
                <!-- 4px from the title's end to the glyph: the 16px glyph
                     stands 2px inside its 20px box. A finger closes a tab
                     from its options (owner: "remove the x make it close on
                     hold menu then close"). -->
                <!-- literal: 20px -->
                <button
                  data-slot="tclose"
                  aria-hidden="true"
                  class="touch-hit pointer-hit pressable ms-space-row grid size-(--tcontrol) flex-none cursor-pointer place-items-center rounded-xs border-none border-current bg-transparent p-0 text-ink-muted hover:bg-surface-fill hover:text-ink-strong motion-safe:transition-[background-color,color,transform] motion-safe:dur-control motion-safe:ease-out motion-safe:active:transform-(--tpress) max-desk:hidden coarse:hidden"
                  style:--hit-gap-x="var(--space-1)"
                  style:--tcontrol="20px"
                  style:--tpress="scale(var(--press-scale))"
                  onauxclick={(event) => middleClose(tab.id, event)}
                  onclick={() => {
                    closeDetails();
                    workspace.close(tab.id);
                  }}
                  onmousedown={middleDown}
                  tabindex="-1"
                  type="button"
                >
                  <IconClose />
                </button>
              {/snippet}
            </TabItem>
          </ContextMenu.Trigger>
          <!-- It hangs from the tab as one shape with it (HangCard `tab`,
               motion/hang-shape), however it was opened (the chevron, a
               right click, a long press, a pull), at every width: grown
               out of the tab's foot and folded back into it (owner: "why
               aren't these the blended/merged menu that morphs out of the
               tab?"). -->
          <HangCard
            align="start"
            anchor={menuFor === tab.id ? anchorOf(tab.id) : null}
            as={ContextMenu.Content}
            collisionPadding={12}
            data-tab-menu
            folded={takeMenuFolded}
            held={() => menuHeld}
            onneck={(neck) => {
              menuFlush = neck.flush;
            }}
            side="bottom"
            sideOffset={0}
            style="--hang-min: {menuMin}px; --menu-min: max(12rem, var(--hang-min, 0px))"
            tab
            bind:joined={
              () => menuHung === tab.id,
              (shown) => {
                if (shown) {
                  menuHung = tab.id;
                } else if (menuHung === tab.id) {
                  menuHung = null;
                }
              }
            }
          >
            {@render options()}
          </HangCard>
        </ContextMenu.Root>
      </div>
    {/each}
  </TabsList>
  <!-- A new session in the front tab's place: after the tabs, outside the
       tablist (`startHere`). -->
  <!-- The "+": a tab's inner pad after the last tab's edge (the track keeps
       its flared foot's room at its end), centred on the tabs' row. A start
       the hub refused leaves it in the failed status ink until the next
       press. -->
  <div
    data-slot="strip-new"
    class="ms-(--new-ms) flex h-(--strip-item) flex-none items-center self-end"
    style:--new-ms="calc(var(--strip-px) - var(--strip-flare))"
  >
    <Tooltip.Root bind:open={newTip}>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <!-- literal: 20px -->
          <button
            {...props}
            aria-busy={starting || undefined}
            aria-describedby={refused ? refusedId : undefined}
            aria-label="New session"
            data-tnew
            class="touch-hit pointer-hit pressable grid size-(--tcontrol) flex-none cursor-pointer place-items-center rounded-xs border-none border-current bg-transparent p-0 text-ink-muted hover:bg-surface-fill hover:text-ink-strong data-refused:text-status-fail-glyph motion-safe:transition-[background-color,color,transform] motion-safe:dur-control motion-safe:ease-out motion-safe:active:transform-(--tpress)"
            style:--tcontrol="20px"
            style:--tpress="scale(var(--press-scale))"
            data-refused={refused ? "" : undefined}
            onclick={() => {
              if (!starting) {
                startHere();
              }
            }}
            type="button"
          >
            {#if starting}
              <Spinner aria-label="Starting a session" />
            {:else}
              <IconAddLine />
            {/if}
          </button>
        {/snippet}
      </Tooltip.Trigger>
      <!-- 8px clear of the viewport's edges, as every tooltip (Tip). -->
      <Tooltip.Content collisionPadding={8} side="bottom">
        <span class="whitespace-pre-line"
          >{#if refused}
            <strong data-slot="block" class="block font-medium"
              >Couldn't start a session</strong
            >
            {refused}
          {:else}
            New session
          {/if}</span
        >
      </Tooltip.Content>
    </Tooltip.Root>
    {#if refused}
      <span class="sr-only" id={refusedId}
        >Couldn't start a session: {refused}</span
      >
    {/if}
  </div>
</Tabs>

<Popover.Root
  onOpenChange={(open) => {
    if (!open) {
      closeDetails();
    }
  }}
  open={detailsOpen}
>
  <Popover.Portal>
    <HangCard
      data-session-details-popover
      align="start"
      alignOffset={cardPlace ? cardPlace.offset : 0}
      anchor={detailAnchor}
      aria-label="Session details"
      as={Popover.Content}
      collisionPadding={12}
      customAnchor={detailAnchor}
      data-safe-bottom
      folded={takeFolded}
      style="--details-w: min(416px, calc(100vw - 24px)); --details-max-h: min(760px, var(--bits-popover-content-available-height, 85dvh)); --details-max-h-phone: min(calc(100dvh - var(--c-top-bar-h) - 24px - var(--safe-bottom)), var(--bits-popover-content-available-height, 85dvh)){cardPlace
        ? `; --hang-width: ${cardPlace.width}px`
        : ''}"
      tab
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (restoreFocus) {
          detailAnchor?.focus();
        }
      }}
      onfocusin={() => {
        clearTimeout(timer);
        pinned = true;
      }}
      onInteractOutside={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-session-tab]")
        ) {
          event.preventDefault();
        }
      }}
      onneck={(neck) => {
        cardFlush = neck.flush;
      }}
      onOpenAutoFocus={(event) => {
        if (!pinned) {
          event.preventDefault();
        }
      }}
      onpointerdowncapture={() => {
        clearTimeout(timer);
        pinned = true;
      }}
      onpointerenter={() => clearTimeout(timer)}
      onpointerleave={leaveDetails}
      side="bottom"
      sideOffset={0}
      trapFocus={pinned}
      bind:joined={cardJoined}
      bind:ref={cardEl}
    >
      <div
        data-slot="details-morph"
        class="h-(--morph-h) w-full overflow-hidden"
        style:--morph-h={detailsHeight ? `${detailsHeight}px` : undefined}
      >
        <div
          data-slot="details-measure"
          class="flex w-full flex-col"
          bind:offsetHeight={detailsHeight}
        >
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
    </HangCard>
  </Popover.Portal>
</Popover.Root>

<style>
  /* residual: foreign-dom — the details card's own box (HangCard's
     portalled bits-ui content, `data-session-details-popover`), its sizes
     set on the card (`--details-*`, the HangCard's style). */
  /* The card is a HangCard on its tab (`tab`): one silhouette with it, its
     outline, its cast and its open and close the component's. Its content
     runs edge to edge; its head is its tab's surface. Its width is where
     it is placed (`placeOf`): 416px, the screen less its margins at most.
     A phone's card stands a margin in from each side, under its tab, and
     holds clear of the screen's foot. */
  /* css-scope: the details card, HangCard's portalled content, found by its data hook */
  :global(.kit-pop[data-session-details-popover]) {
    display: flex;
    z-index: 60;
    width: var(--hang-width, var(--details-w));
    max-height: var(--details-max-h);
    overflow: hidden;
    overscroll-behavior: contain;
    padding: 0;
    outline: none;

    @media (max-width: 640px) {
      max-height: var(--details-max-h-phone);
    }
  }
  /* residual: foreign-dom — the strip's host rules on the kit's Tabs root
     (`session-tabs`, `hosted`) and on TabsList's track (app.css
     `.ff-tabs-list`): they override the track's size ladder and outrank its
     folder padding by selector. Their literals ride the Tabs root's
     custom properties (`--strip-*`). */
  /* The session track scrolls sideways, and a scroll container clips on both
     axes; its transparent padding grows into an equal negative margin on a
     coarse pointer, so the controls' touch areas above and below the 32px
     tabs sit inside its clip and nothing moves. The root's data-slot is
     in the selector to outrank the component's own folder padding at any
     stylesheet order: dev draws the first paint with the sheets in another
     order than the build, and a tie would flip once the page hydrates. */
  :global(.session-tabs[data-slot="tabs"] .ff-tabs-list.scrollable) {
    @media (pointer: coarse) {
      padding-block: calc(var(--pad) + var(--strip-reach)) var(--strip-reach);
      margin-block: calc(-1 * var(--strip-reach));
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
    /* A tab's height, its inner pad (`--strip-px`, on the root) and its
       flared foot's room at the track's end, shared by the track and the
       "+" after it (`.strip-new`). */
    --strip-item: var(--strip-item-rest);
    --strip-flare: var(--radius-sm);
    display: flex;
    align-items: flex-end;
    flex: 0 0 auto;
    min-inline-size: 0;
    padding-block: var(--space-1) 0;
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
  /* On a phone this row is the app's only bar (Shell, `.top.floating`): the
     bar's height, and its two ends left to the sidebar toggle and to Caw's
     glass (Shell). The toggle's glyph stands c-bar-phone-edge in, and the
     strip starts where the glyph ends, so a scrolled tab never draws under
     it; the track's own flare of room puts the first tab a flare further
     in, and a chosen first tab's foot spreads into that room whole. Caw's
     glass (`c-bar-caw-glass-phone` across) is flush with the other edge,
     and the strip stops c-bar-phone-gap short of it, so the tabs scroll
     between them and never under. */
  @media (max-width: 899px) {
    :global(.session-tabs:not(.hosted)) {
      --strip-item: var(--c-tab-row-h);
      --strip-flare: var(--radius-lg);
      min-block-size: var(--c-top-bar-h);
      padding-block-start: 0;
      padding-inline: calc(var(--c-bar-phone-edge) + var(--c-bar-toggle-glyph))
        calc(var(--c-bar-phone-gap) + var(--c-bar-caw-glass-phone));
    }
  }

  /* The strip takes one step taller than the component's default in a
     bar with room, with the component's own text size and a tighter
     horizontal pad. The shape and the sheet are the component's. The
     data-slot outranks the component's defaults by specificity, not by
     which stylesheet comes last. The hover ghost lifts an unchosen tab's
     card (surface-recess-deep, by day surface-hover's own step) toward
     the chosen sheet's surface; by night it is the hover step. */
  :global(.session-tabs[data-slot="tabs"] .ff-tabs-list) {
    --px: var(--strip-px);
    --text: var(--text-label);
    --item: var(--strip-item);
    /* The chosen tab's sheet: the transcript's head dissolves into the same
       token (HeadFade), so the two are one fill at the shelf's line. */
    --sheet: var(--tab-sheet);
    --tab-hover: light-dark(var(--surface-recess), var(--surface-hover));
    /* The status rim's stroke (`tab-rim-width`, a plain px number), drawn
       on each tab's own path (TabItem). */
    --rim-w: var(--tab-rim-width);

    @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
      --rim-w: 1;
    }
  }
  /* The phone's row: tabs a row's height tall, standing on the bar's
     floor, and the strip's ends fading over a short run so a tab slides
     under the toggle and Caw rather than being cut. The strip runs up to
     the bar's top, so the pad above the tabs is inside its clip and their
     rims' glow is not cut off. Its tabs take a rounder top than the
     desktop's, the next radius up (owner: "round the tabs more on
     mobile"), and their flared foot follows it; they still overlap by the
     desktop's 8px. Where tabs run past an end, that end fades on an
     eased curve, so a tab dissolves into the bar rather than being cut:
     the start over 24px, transparent for its first 6, so a sliver of a
     tab scrolled past it never shows beside the toggle; the end over 16px.
     At rest the strip's start does not fade, so a first tab is drawn
     whole, its foot and all. A chosen tab is brought clear of both fades
     (TabsList `inView`). */
  @media (max-width: 899px) {
    :global(
      .session-tabs:not(.hosted)[data-slot="tabs"] .ff-tabs-list.scrollable
    ) {
      --item: var(--strip-item);
      --pad: 0px;
      --fade-len: var(--strip-fade);
      --edge-room-start: calc(var(--fade-len) * 1.5);
      --radius: var(--radius-lg);
      --overlap: var(--radius-sm);
      padding-block-start: calc(var(--c-top-bar-h) - var(--c-tab-row-h));
      margin-block-start: 0;
      /* Each end's fade cut short at a tab drawn chosen (TabsList
         `--fade-cap-start`/`--fade-cap-end`): the start's runs 1.5 of
         its length. */
      --fade-run-start: min(
        var(--fade-start),
        calc(var(--fade-cap-start, var(--strip-uncapped)) / 1.5)
      );
      --fade-run-end: min(
        var(--fade-end),
        var(--fade-cap-end, var(--strip-uncapped))
      );
      mask-image: linear-gradient(
        to right,
        transparent,
        transparent calc(var(--fade-run-start) * 0.375),
        var(--mask-opaque-a15) calc(var(--fade-run-start) * 0.75),
        var(--mask-opaque-a60) calc(var(--fade-run-start) * 1.125),
        var(--mask-opaque) calc(var(--fade-run-start) * 1.5),
        var(--mask-opaque) calc(100% - var(--fade-run-end)),
        var(--mask-opaque-a90) calc(100% - var(--fade-run-end) * 0.75),
        var(--mask-opaque-a50) calc(100% - var(--fade-run-end) * 0.5),
        var(--mask-opaque-a10) calc(100% - var(--fade-run-end) * 0.25),
        transparent
      );
    }
  }

  /* ── The status rim, on every width ───────────────────────────────
     Each tab's rim wears its session's status (`data-tone`, the rail's
     scale) on the tab's whole outline at one weight, 1.5px: across the
     top, round both shoulders, down both sloped sides, and at the foot out
     round the flare to the shelf's line on every side in front of its
     neighbour (owner: "A curved foot on inactive tabs: their sides curve
     out at the base like the chosen tab's"), with a soft glow following
     the outline at half its strength. The desk keeps its status glyph
     before the title as well (owner: "desktop and mobile should all have
     rims, desktop has icons mobile not").

     Only the chosen tab wears its rim whole. An unchosen tab wears a
     subtler one (`tab-rim-mix-subtle`) when its session is anything but
     idle, and none at all when it is idle: no top, sides, feet or glow
     (owner: the other tabs have no rim "unless they are active, then they
     should have a more subtle rim", "or any other status").

     It is the tab's own path stroked (TabItem `.fold`): one outline with
     its sheet, in the tone (`--rim-ink`, `TONE_INK`), at the tone's
     strength by how chosen the tab is (`--rim-rest` to `--rim-full` by the kit's
     `--pick`, on the choice's clock), each foot narrowing to a point on
     the shelf and its last `tab-rim-taper` px fading out to nothing, so a
     rim never stops on a hard cut (owner: "the rim should
     taper-progress-fade at the very edges"). Each tab is a stack at its
     rank (TabsList), so where two tabs overlap the front one covers the
     other's side, rim and all, as one folder over another. Increase
     Contrast and Reduce Transparency draw a solid 1px outline and no
     glow, on every tab that wears a rim. (The rule that writes the
     strengths is in the residuals at the end.) */

  /* ── The tab its card or its menu hangs from ─────────────────────
     While its card or its menu stands drawn out of it (`data-hung`) a tab
     and its hang are one silhouette (HangCard `tab`, motion/hang-shape):
     one outline over both, drawn by the hang's outline layer, so the tab
     draws no rim of its own then (TabItem `hung`) and its sheet stops
     where the outline's stroke is centred. Its sheet is the hang's head
     surface, whether it is chosen or not, so the tab and the hang under
     it are one fill across the shelf; and it stands over every other tab
     (TabsList), both feet flared but where its hang stands flush with its
     flank (TabItem `flush`, the flank running straight on into the hang's
     side). Its rim's ink and strength (`--hang-rim`) is the outline's
     across the tab, running into the hang's edge down its flanks. (Its
     rule is in the residuals at the end.) */
  /* residual: foreign-dom — the tab's menu (HangCard's portalled
     context-menu content, `data-tab-menu`), its width floor set on the menu
     (`--menu-min`). The menu hanging from its tab is on the tab's own
     surface, as the card's head is, so the two read as one sheet; and it is
     as wide as the shape needs past the tab's span (`menuMin`, `placeOf`). */
  :global(.kit-pop.kit-hang[data-tab-menu]) {
    min-inline-size: var(--menu-min);
    --hang-surface: var(--surface-recess);
  }

  /* residual: foreign-dom — the details card (HangCard's bits-ui content
     and floating wrapper) and the tab's box (TabItem), which other files
     render. The floating layer rewrites where the card may stand (bits-ui's
     `--bits-floating-*` on its wrapper, copied onto the card as
     `--bits-popover-*`) as the card opens and as it follows its tab, a few
     times in a frame. As custom properties they were inherited by
     everything the card holds, and each rewrite restyled all of it. Only
     the card reads them (its `max-height`): they stop at its children,
     which hold values of their own that no rewrite changes. */
  /* css-scope: the same details card's children */
  :global(.kit-pop[data-session-details-popover] > *) {
    --bits-floating-transform-origin: initial;
    --bits-floating-available-width: initial;
    --bits-floating-available-height: initial;
    --bits-floating-anchor-width: initial;
    --bits-floating-anchor-height: initial;
    --bits-popover-content-transform-origin: initial;
    --bits-popover-content-available-width: initial;
    --bits-popover-content-available-height: initial;
    --bits-popover-anchor-width: initial;
    --bits-popover-anchor-height: initial;
  }
  /* A tab's rim's ink at the strength it wears it now: the one outline's
     ink across the tab while a hang stands drawn out of it (HangCard). */
  [data-slot="tab"] :global([data-slot="ff-tab"]) {
    --hang-rim: color-mix(
      in oklab,
      var(--rim-ink)
        calc(
          (
              var(--rim-rest) + (var(--rim-full) - var(--rim-rest)) *
                var(--pick)
            ) *
            100%
        ),
      var(--border-control)
    );
  }
  /* A pinned card follows its tab as the strip scrolls, frame by frame: its
     wrapper moves on its own layer, so each step is the compositor's, not a
     repaint of the card. The glide to another tab: the wrapper's move and
     the card's height together; the outline follows them frame by frame
     (HangCard). */
  /* css-scope: bits-ui's floating wrapper, only while it holds the details card */
  :global(
    [data-bits-floating-content-wrapper]:has(> [data-session-details-popover])
  ) {
    will-change: transform;
  }
  @media (prefers-reduced-motion: no-preference) {
    /* css-scope: the same wrapper, while the card glides between tabs */
    :global(
      [data-bits-floating-content-wrapper]:has(
        > [data-session-details-popover][data-morph]
      )
    ) {
      transition: transform var(--dur-pop) var(--ease-drawer);
    }
  }
  /* Parked on you: the label carries the strong ink whether or not it is
     chosen, so the ask is legible from across the strip. It comes up at
     the panel's pace, the way the tab's glyph turns. */
  [data-slot="tab"][data-needs] :global([data-slot="ff-tab"]) {
    color: var(--ink-strong);

    @media (prefers-reduced-motion: no-preference) {
      transition: color var(--dur-panel) var(--ease-out);
    }
  }
  /* The chevron's and the close's glyphs, and the "+"'s (icon components);
     the chevron turns over while its card is open. */
  [data-slot="tdetails"] :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);

    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-control) var(--ease-out);
    }
  }
  [data-slot="tclose"] :global(svg),
  [data-tnew] :global(svg) {
    display: block;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  [data-slot="tdetails"][data-open] :global(svg) {
    transform: rotate(180deg);
  }

  /* residual: unmapped — no utility says max-height: inherit (the card's
     cap, carried down to the details). */
  [data-slot="details-morph"],
  [data-slot="details-measure"] {
    max-height: inherit;
  }
  /* The card's height on the glide (a run-time `data-morph` on the
     HangCard content above it). */
  @media (prefers-reduced-motion: no-preference) {
    :global([data-session-details-popover][data-morph])
      [data-slot="details-morph"] {
      transition: height var(--dur-pop) var(--ease-drawer);
    }
  }
  /* The chevron comes and goes with the choice; under a gesture's ride it
     follows the finger with no easing. Another tab's slot: kept, empty, and
     part of that tab. The ride's `transition: none` and the idle `scale`
     (one value, the property the transition runs) have no utility that
     computes the same, so the three stay together. */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="tdetails"] {
      transition:
        opacity var(--choose-dur) var(--choose-ease),
        scale var(--choose-dur) var(--choose-ease);
    }
  }
  :global([data-ride]) [data-slot="tdetails"] {
    transition: none;
  }
  [data-slot="tdetails"][data-idle] {
    opacity: 0;
    scale: var(--pop-scale);
  }
  /* The tab's custom properties, by state and medium: no utility sets a
     custom property, and a `style:` one would outrank the media queries
     and states that change them. The tab's end pad, a pixel short of the
     kit's: the width every tab has had (a hidden options button stood in
     its flow and took the pixel; the tab's own Shift+F10 does its work
     now). The strengths a rim takes (`RIM`, written on each tab,
     `--rim-rest` unchosen and `--rim-full` chosen), solid under Increase
     Contrast. */
  [data-slot="tab"] {
    --px-end: calc(var(--px) - 1px);
  }
  /* ── A tab carried along its strip (tab-drag.svelte.ts) ────────────
     The tab itself is what moves. Lifted, it stands over every tab in the
     strip, in front of both neighbours (the track ranks it so: both its
     feet drawn, TabsList), and casts both its edges. It follows the
     pointer with no easing (`data-following`); its neighbours slide into
     the slots it leaves on the strip's own slide (PaneTabs `slide`), and it
     takes the same on its way back. With less motion they stand in their
     slots at once. */
  [data-slot="tab"][data-lifted] {
    --lone-start: 0;
    --lone-end: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    :global(.ff-tabs-list[data-reordering])
      > [data-slot="tab"]:not([data-following]) {
      transition: translate var(--dur-panel) var(--ease-drawer);
    }
  }
  /* The cast fades out over the flare above the foot, gone where the foot
     begins, so the corner shows only what lies under it and the foot's
     curve is the one edge there (owner: "the curve beteween the left of
     the tab's foot and the hover menu has a blur or alias"). No utility
     says mask-image. */
  [data-slot="shade"] {
    mask-image: linear-gradient(
      to bottom,
      var(--mask-opaque) calc(100% - 2 * var(--flare)),
      transparent calc(100% - var(--flare))
    );
  }
  [data-slot="tab"] {
    --rim-subtle: var(--tab-rim-mix-subtle);
    --rim-chosen: var(--tab-rim-mix-chosen);
    --rim-idle: var(--tab-rim-mix-idle);
    --rim-ink: var(--tone);

    @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
      --rim-subtle: 1;
      --rim-chosen: 1;
      --rim-idle: 1;
    }
  }
  /* The phone's row: a title's room at each end clears the overlap, so a
     neighbour tucked over either end never touches it: a lead past the
     overlap before it, the chosen sheet's flare past the overlap after it.
     The same on every tab, chosen or not, so a choice never resizes a tab
     and moves the ones after it (owner: "switching between them kinda
     shifts things around"). */
  @media (max-width: 899px) {
    [data-slot="tab"] {
      --px-start: calc(var(--overlap) + var(--c-tab-lead));
      --px-end: calc(var(--overlap) + var(--radius-lg) - 1px);
    }
  }
  [data-slot="tab"][data-hung] {
    --sheet: var(--surface-recess);
    --tab-fill: var(--surface-recess);
    --tab-hover: var(--surface-recess);
  }
  /* residual: pseudo — where a drop would land: a 2px rule in the gap, on
     the near side. */
  [data-slot="tab"][data-drop-before]::before,
  [data-slot="tab"][data-drop-after]::after {
    content: "";
    position: absolute;
    inset-block: 2px;
    inline-size: 2px;
    border-radius: var(--radius-pill);
    background: var(--ink-strong);
    z-index: 4;
  }
  [data-slot="tab"][data-drop-before]::before {
    inset-inline-start: -2px;
  }
  [data-slot="tab"][data-drop-after]::after {
    inset-inline-end: -2px;
  }
</style>
