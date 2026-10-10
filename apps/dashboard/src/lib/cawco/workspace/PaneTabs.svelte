<script lang="ts" module>
  /** The x of a floating wrapper's `translate(Xpx, Ypx)`. */
  const TRANSLATE_X = /translate(?:3d)?\(\s*(-?[\d.]+)px/;
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
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
    type TabsTravel,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconArrowRight, IconChevronDown, IconClose } from "#lib/icons.js";
  import { page } from "$app/state";
  import AccountSubmenu from "../accounts/AccountSubmenu.svelte";
  import {
    ACTIVITY_LABEL,
    type Activity,
    FAILED_LABEL,
    UNKNOWN_LABEL,
  } from "../activity";
  import { cawco, isFailed, isStale } from "../client.svelte";
  import { continueInNewSession, continueSourceOf } from "../continue.svelte";
  import CawFace from "../home/CawFace.svelte";
  import type { HubRead } from "../hub-read";
  import { conversationHref } from "../links";
  import { integrate, type Sample, sampleAt } from "../motion/spring";
  import { sessionName } from "../session-name";
  import { isThreadTab } from "../thread-tabs";
  import { runIdOf } from "../workflow-runs";
  import { workingSet } from "../working-set.svelte";
  import { dragSession, dropHint, tabDropTarget } from "./dnd.svelte";
  import SessionDetails from "./SessionDetails.svelte";
  import SessionStatus from "./SessionStatus.svelte";
  import { rebuildScheduler } from "./scheduler.svelte";
  import { type StatusTone, sessionStatus } from "./session-status";
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
    const state = isThreadTab(id) ? null : sessionStatus(id);
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
  /**
   * A swipe carrying the choice (`travel`): the tab it is heading to and how
   * far, 0 to 1. At rest the choice is all on the chosen tab (`f` 0).
   */
  const scrub = $derived.by(() => {
    const to = travel ? tabs.findIndex((tab) => tab.id === travel.toward) : -1;
    if (!travel || chosenAt < 0 || to < 0 || to === chosenAt) {
      return { to: chosenAt, f: 0 };
    }
    return { to, f: Math.min(1, Math.max(0, travel.fraction)) };
  });
  /**
   * How a tab on the phone's row is drawn, between how it is drawn with the
   * choice on the chosen tab and with it on the one a swipe is heading to,
   * by how far the swipe has gone, so every tab moves with the finger and
   * the landing changes nothing. At rest it is the chosen tab's alone.
   * - `pick`: how chosen it is, 0 to 1 (its rim's strength, its title's ink).
   * - `fillFrom`/`fillTo`: its card's recede step either way, mixed by `f`.
   *   A tab steps back toward the shelf for each tab between it and the
   *   chosen one, to three; the chosen tab's own card, under its sheet, is
   *   one step back. With none chosen every tab is one step back.
   * Nothing here sizes a tab: choosing one never moves the others.
   */
  const look = (i: number) => {
    const { to, f } = scrub;
    const step = (at: number) =>
      at < 0 ? 1 : Math.max(1, Math.min(Math.abs(i - at), 3));
    const pick = (at: number) => (i === at ? 1 : 0);
    return {
      pick: pick(chosenAt) + (pick(to) - pick(chosenAt)) * f,
      fillFrom: `var(--tab-recede-${step(chosenAt)})`,
      fillTo: `var(--tab-recede-${step(to)})`,
      f,
    };
  };

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
      detailAnchor = anchor;
      neck = neckOf(anchor);
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
        neck = neckOf(anchor);
      });
    });
  }

  /* ── The card hangs from its tab ──────────────────────────────────
     The card's anchor is the tab's whole box (`.tab`), however it was
     opened: hover, a click on the tab or its chevron, the keyboard, the
     menu. Its top edge is the tab's foot (no side offset), and its
     leading edge stands one flare, one card corner and 4px before the
     tab, so its outline runs corner → short run → the chosen sheet's
     concave flare → up the tab's flank: one folder. Its top border is
     cut across the tab's flared span (`--neck-start`, `--neck-end`,
     `--neck-flare-start`, `--neck-flare-end`, in the card's own
     coordinates), and a stroke runs up
     the tab's flanks instead (`.neck`). A phone's card stands at the
     screen's 12px margin; collision does the rest.

     Where that leading edge would cross its pane's own leading edge (the
     sidebar's border, a split's seam: the strip's box, measured), the card
     stands flush with the tab instead (owner: "when the popover overlays
     the sidebar it should sit flush with the left border of the tab
     instead of overlapping the sidebar"): its left edge on the tab's,
     square, so the outline runs straight down the tab's flank into the
     card's side, with no flare and no corner on that side; the other side
     keeps its flare. */
  /** Round the card's corner, and the 4px run before the flare begins. */
  const CARD_CORNER = 12;
  const CARD_RUN = 4;
  /** The card's width (`.session-details-popover`) and its margin to the viewport. */
  const CARD_W = 416;
  const CARD_MARGIN = 12;
  const flareOf = (anchor: HTMLElement) =>
    Number.parseFloat(getComputedStyle(anchor).getPropertyValue("--flare")) ||
    0;
  /** Whether the card's usual leading edge would cross its pane's. */
  function flushAt(anchor: HTMLElement) {
    const pane = anchor.closest(".session-tabs");
    if (!pane) {
      return false;
    }
    const offset = touch.current
      ? -CARD_MARGIN
      : -(flareOf(anchor) + CARD_CORNER + CARD_RUN);
    return (
      anchor.getBoundingClientRect().left + offset <
      pane.getBoundingClientRect().left
    );
  }
  /** The card's leading edge's offset from its tab's, before collision. */
  function alignFor(anchor: HTMLElement | null) {
    if (!anchor || flushAt(anchor)) {
      return 0;
    }
    return touch.current
      ? -CARD_MARGIN
      : -(flareOf(anchor) + CARD_CORNER + CARD_RUN);
  }
  /**
   * The tab's span in the card's coordinates, from where the card stands (or
   * will), and the flare each side of it: none on a side the card is flush
   * with.
   */
  interface Neck {
    end: number;
    flareEnd: number;
    flareStart: number;
    flush: boolean;
    start: number;
  }
  let neck = $state<Neck>({
    start: 0,
    end: 0,
    flareStart: 0,
    flareEnd: 0,
    flush: false,
  });
  function neckOf(anchor: HTMLElement, cardLeft?: number): Neck {
    const box = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(CARD_W, vw - 2 * CARD_MARGIN);
    const flush = flushAt(anchor);
    const left =
      cardLeft ??
      Math.min(
        Math.max(box.left + alignFor(anchor), CARD_MARGIN),
        vw - CARD_MARGIN - width
      );
    // Only a chosen tab wears the sheet's flared foot; another tab's card
    // (hovered open) meets the card square.
    const flare = anchor.hasAttribute("data-chosen") ? flareOf(anchor) : 0;
    return {
      start: box.left - left,
      end: box.right - left,
      flareStart: flush ? 0 : flare,
      flareEnd: flare,
      flush,
    };
  }
  /** The tab's box, the card's anchor, by the tab's id. */
  function anchorOf(id: string): HTMLElement | null {
    return (
      document
        .querySelector(`[data-session-tab="${CSS.escape(id)}"]`)
        ?.closest<HTMLElement>(".tab") ?? null
    );
  }
  /**
   * Keeps the neck where the card really stands once bits-ui has placed it:
   * every placement (open, a glide, a resize, the strip scrolling) is a
   * write to its wrapper's transform.
   */
  const trackNeck: Attachment<HTMLElement> = (node) => {
    const wrapper = node.parentElement;
    if (!wrapper) {
      return;
    }
    const motion = cardMotion(node);
    const sync = () =>
      untrack(() => {
        const at = TRANSLATE_X.exec(wrapper.style.transform);
        if (!(at && detailAnchor)) {
          return;
        }
        const next = neckOf(detailAnchor, Number(at[1]));
        // Placed: the card can grow out of its tab now, measured where it
        // stands and after the frame that mounted it.
        motion.placed(next);
        if (
          Math.abs(next.start - neck.start) > 0.5 ||
          Math.abs(next.end - neck.end) > 0.5 ||
          next.flareStart !== neck.flareStart ||
          next.flareEnd !== neck.flareEnd ||
          next.flush !== neck.flush
        ) {
          neck = next;
        }
      });
    const observer = new MutationObserver(sync);
    observer.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
    sync();
    // Beside bits-ui's own handlers in the content's props, not over them.
    node.addEventListener("pointerdown", swipeCardShut);
    return () => {
      observer.disconnect();
      motion.stop();
      node.removeEventListener("pointerdown", swipeCardShut);
    };
  };

  /* ── The card's open and close ────────────────────────────────────
     A clip that grows down out of the tab's foot and widens to the card as
     it deepens, revealing what is in it as the foot passes; nothing inside
     fades. Open over --dur-pop, close over --dur-exit (The Fast Exit Rule),
     both on --ease-out: an entrance and an exit, so the strong ease-out
     (Emil Kowalski, "Entering or exiting → ease-out"; transitions.dev's
     dropdown, 250ms open and 150ms close on cubic-bezier(0.22, 1, 0.36, 1),
     the same family).

     It runs on the compositor: a WAAPI animation of an inset() in px only.
     Chromium composites a clip-path animation whose shapes are plain
     lengths and paints one with calc() or a percentage on the main thread
     every frame (a trace: compositeFailed, unsupportedProperties
     clip-path), which is what dropped frames before. So the shapes are
     written in px from the card's measured box. The card is held shut
     (`data-shown` absent) until bits-ui has placed it, and starts growing
     only then: started with the mount, the frame that mounted it ate the
     first part of the growth (33ms at full speed, 200ms on a slow CPU).

     Interruptible (The Interruptible Rule): a close caught mid-open, or an
     open caught mid-close, turns back from the clip it has reached. bits-ui
     holds the card mounted until the close animation ends (it waits on the
     content's getAnimations()). With reduced motion nothing here runs and
     the kit's fade does. A card the finger folded into its tab
     (`swipeCardShut`) is already shut and leaves at once. */
  /** Room past the card's sides and foot for its whole overlay shadow, px. */
  const CLIP_ROOM = 120;
  /** The event the card fires once it stands open. */
  const GROWN = "grown";
  /** What a shut clip keeps of the card's height, px: see `shut`. */
  const CLIP_SLIVER = 1;
  /** The card's foot corners, px (radius-lg). */
  const CLIP_ROUND = "round 0px 0px 12px 12px";
  /** Set by the finger that folded the card into its tab: nothing left to play. */
  let folded = false;
  function cardMotion(node: HTMLElement) {
    let run: Animation | null = null;
    let at: Neck | null = null;
    const open = `inset(0px -${CLIP_ROOM}px -${CLIP_ROOM}px -${CLIP_ROOM}px ${CLIP_ROUND})`;
    // Shut leaves a pixel of the head under the tab's foot, the tab's
    // own surface, so nothing shows: a keyframe with no height at all is a
    // shape Chromium will not composite, and the whole animation then
    // paints on the main thread every frame.
    const shut = (neckNow: Neck) => {
      // The box's own fractional size: offsetHeight rounds, and a sliver
      // rounded away is the degenerate shape again.
      const { width: w, height: h } = node.getBoundingClientRect();
      const right = Math.max(0, w - neckNow.end);
      const left = Math.max(0, neckNow.start);
      const bottom = Math.max(0, h - CLIP_SLIVER);
      return `inset(0px ${right}px ${bottom}px ${left}px ${CLIP_ROUND})`;
    };
    /** Where the clip is drawn now, mid-animation or at rest. */
    const drawn = (fallback: string) =>
      run ? getComputedStyle(node).clipPath : fallback;
    const play = (from: string, to: string, ms: number) => {
      const next = node.animate([{ clipPath: from }, { clipPath: to }], {
        duration: ms,
        easing: ease("--ease-out"),
        fill: "forwards",
      });
      run?.cancel();
      run = next;
      return next;
    };
    const grow = () => {
      if (!at) {
        return;
      }
      node.dataset.shown = "";
      // What waits on the card standing open (SessionDetails asks for its
      // context reading then) hears `grown`.
      if (!motionOk.current) {
        node.dispatchEvent(new Event(GROWN));
        return;
      }
      const growth = play(drawn(shut(at)), open, dur("--dur-pop"));
      growth.finished
        .then(() => {
          if (run === growth) {
            // At rest the card's own rules hold it open.
            growth.cancel();
            run = null;
            node.dispatchEvent(new Event(GROWN));
          }
        })
        .catch(() => undefined);
    };
    const fold = () => {
      if (folded || !motionOk.current || !at) {
        folded = false;
        return;
      }
      play(drawn(open), shut(at), dur("--dur-exit"));
    };
    let frame = 0;
    const state = new MutationObserver(() => {
      if (node.dataset.state === "closed") {
        cancelAnimationFrame(frame);
        fold();
      } else if (node.dataset.state === "open" && "shown" in node.dataset) {
        grow();
      }
    });
    state.observe(node, { attributes: true, attributeFilter: ["data-state"] });
    return {
      placed(neckNow: Neck) {
        const first = !at;
        at = neckNow;
        if (first) {
          // After the frame that lays the placed card out, so the growth
          // starts on a frame of its own.
          frame = requestAnimationFrame(grow);
        }
      },
      stop() {
        cancelAnimationFrame(frame);
        state.disconnect();
        run?.cancel();
      },
    };
  }
  function hoverTab(id: string, event: PointerEvent) {
    if (touch.current || event.pointerType !== "mouse" || pinned || menuOpen) {
      return;
    }
    // The tab came under a pointer at rest: nobody pointed at it. Clicking a
    // tab and then splitting (`mod+\`) slid its neighbour under the pointer
    // and opened that neighbour's card, which nothing had asked for.
    if (movedTo?.x === event.clientX && movedTo.y === event.clientY) {
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
  /** Past fully out, a third of the finger's travel shows, and no more than a fifth. */
  const PULL_RESIST = 0.35;
  const PULL_RESIST_MAX = 0.2;

  /** Room past the menu's sides and foot for its whole overlay shadow, px. */
  const SHADOW_ROOM = 120;

  /** The menu openings this strip made itself, already at the tab's foot. */
  const anchored = new WeakSet<Event>();

  /** Opens tab's menu hanging from its foot, under the row. */
  function openMenu(tabNode: HTMLElement) {
    const hit = tabNode.querySelector("[data-session-tab]") ?? tabNode;
    const box = tabNode.getBoundingClientRect();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: box.left,
      clientY: box.bottom,
    });
    anchored.add(event);
    hit.dispatchEvent(event);
  }

  /**
   * Under a finger the menu has one place, whatever opened it: hanging from
   * the tab's foot under the row, where a pull brings it, never over the
   * row at the finger. A long press's menu is moved there; a mouse's right
   * click opens where it was clicked.
   */
  function anchorMenu(event: MouseEvent) {
    if (!touch.current || anchored.has(event)) {
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

  /** Draws the menu `at` of the way out of the tab's foot: 0 tucked under it, 1 out. */
  function drawPull(el: HTMLElement, at: number) {
    const h = el.offsetHeight;
    const over = Math.max(0, at - 1);
    const hidden = (1 - Math.min(Math.max(at, 0), 1)) * h;
    const stretch = Math.min(over * h * PULL_RESIST, h * PULL_RESIST_MAX);
    el.style.transition = "none";
    el.style.opacity = "1";
    el.style.scale = "1";
    el.style.translate = `0 ${stretch - hidden}px`;
    // Cut at the tab's foot only. Its overlay shadow (0 18px 48px) reaches
    // past the other edges by more than its blur: cut any closer, the cut
    // shows as a square patch round the card's rounded corners.
    el.style.clipPath = `inset(${hidden}px ${-SHADOW_ROOM}px ${-SHADOW_ROOM}px)`;
  }

  /** Hands the menu back to its own rules, at rest. */
  function releasePull(el: HTMLElement) {
    for (const prop of [
      "transition",
      "opacity",
      "scale",
      "translate",
      "clip-path",
    ]) {
      el.style.removeProperty(prop);
    }
  }

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
    if (target === 1) {
      releasePull(el);
    } else {
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
      !(event.target instanceof Element && event.target.closest(".head"))
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
     is drawn as chosen. -->
<Tabs
  class="session-tabs {hosted ? "hosted" : ""}"
  onValueChange={(id) => workspace.activate(id, leaf.id)}
  {travel}
  value={leaf.active ?? ""}
  variant="folder"
>
  <TabsList aria-label="Open sessions in this group" scrollable>
    {#each tabs as tab, i (tab.key)}
      {@const chosen = leaf.active === tab.id}
      {@const drawn = look(i)}
      <!-- The caret marks where a drop would land, drawn on the side the
           pointer is nearest. Graphite, like every structural mark here:
           the one loud colour belongs to a session asking for something. -->
      <!-- Hovering the whole tab (its buttons too) times the details card;
           the keyboard reaches the same card from the tab's link. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="tab"
        data-chosen={chosen ? "" : undefined}
        data-details-open={detailsOpen && detailId === tab.id ? "" : undefined}
        data-flush={detailsOpen && detailId === tab.id && neck.flush
          ? "start"
          : undefined}
        data-tone={tab.tone}
        oncontextmenucapture={anchorMenu}
        onpointerdown={(event) => pullMenu(tab.id, event)}
        onpointerenter={(event) => {
          rebuildScheduler.prepare(tab.id);
          hoverTab(tab.id, event);
        }}
        onpointerleave={leaveDetails}
        style:--f={drawn.f}
        style:--fill-from={drawn.fillFrom}
        style:--fill-to={drawn.fillTo}
        style:--pick={drawn.pick}
        class:drop-after={dropHint.tabIndexIn(leaf.id) === i + 1 &&
          i === tabs.length - 1}
        class:drop-before={dropHint.tabIndexIn(leaf.id) === i}
        class:needs={tab.activity === "blocked"}
        use:dragSession={{ sessionId: tab.id, from: leaf.id }}
        use:tabDropTarget={{ leafId: leaf.id, index: i, sessionId: tab.id }}
        out:leavingTab={tab.id}
        {@attach attachmentsOf(tab.id).enter}
        {@attach attachmentsOf(tab.id).land}
      >
        <ContextMenu.Root
          bind:open={() => menuFor === tab.id, (open) => setMenu(tab.id, open)}
        >
          <ContextMenu.Trigger class="contents">
            <TabItem
              aria-expanded={detailsOpen && detailId === tab.id}
              aria-haspopup="dialog"
              aria-label={`${tab.label}, ${tab.statusLabel}${chosen ? " — open session details" : ""}`}
              data-session-tab={tab.id}
              href={tab.href}
              label={tab.label}
              onclick={(event) => clickTab(tab.id, event)}
              onkeydown={(event) => {
                if (event.key === "ArrowDown" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  const anchor = anchorOf(tab.id);
                  if (anchor) {
                    showDetails(tab.id, anchor, true);
                  }
                }
              }}
              onpointerdown={() => rebuildScheduler.prepare(tab.id)}
              value={tab.id}
            >
              {#snippet lead()}
                <!-- The status glyph, on the desk beside the rim: the
                     phone's row draws none (owner: "why does it still have
                     the icon if the rim is there"; "desktop has icons
                     mobile not"); the tab's label says the status in words
                     either way. -->
                <span class="tglyph">
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
                     slot at all: the tab's menu is its long press. -->
                {#if !(runIdOf(tab.id) || isThreadTab(tab.id))}
                  <button
                    aria-expanded={chosen
                      ? detailsOpen && detailId === tab.id
                      : undefined}
                    aria-haspopup={chosen ? "dialog" : undefined}
                    aria-hidden={chosen ? undefined : "true"}
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
                {/if}
                <!-- A mouse's close. A finger's is in the tab's options,
                     held or pulled down from the tab, and the phone's row
                     draws none. -->
                <button
                  aria-label="Close {tab.label}"
                  class="tclose touch-hit pointer-hit pressable"
                  onclick={() => {
                    closeDetails();
                    workspace.close(tab.id);
                  }}
                  type="button"
                >
                  <IconClose />
                </button>
                <!-- The options as an action a screen reader reaches
                     (VoiceOver, TalkBack): the same menu a held or pulled
                     finger opens. Out of the tab order, which the strip's
                     arrows own; a keyboard has the menu key. -->
                <button
                  aria-haspopup="menu"
                  aria-label="Options for {tab.label}"
                  class="sr-only"
                  onclick={(event) => {
                    const node = (event.currentTarget as HTMLElement).closest(
                      ".tab"
                    );
                    if (node instanceof HTMLElement) {
                      openMenu(node);
                    }
                  }}
                  tabindex={-1}
                  type="button"
                ></button>
              {/snippet}
            </TabItem>
          </ContextMenu.Trigger>
          <!-- Under a finger it hangs below the tab's foot, from its
               leading edge, shifted left only when it would pass the
               screen's edge less 12px (as TabOptionsSheet on iOS); a
               mouse's opens beside the pointer. -->
          <ContextMenu.Content
            align="start"
            collisionPadding={12}
            side={touch.current ? "bottom" : "right"}
          >
            {#if !(runIdOf(tab.id) || isThreadTab(tab.id))}
              <ContextMenu.Item
                onSelect={() => {
                  const anchor = anchorOf(tab.id);
                  if (anchor) {
                    showDetails(tab.id, anchor, true);
                  }
                }}
                >Session details</ContextMenu.Item
              >
              <ContextMenu.Item
                onSelect={() =>
                  continueInNewSession(continueSourceOf(tab.id, tab.label))}
              >
                <IconArrowRight />
                Continue in new session…
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
          </ContextMenu.Content>
        </ContextMenu.Root>
        <!-- The status rim, drawn on the tab's own outline, on every width. -->
        <span aria-hidden="true" class="rim"></span>
        <!-- The stroke up the tab's flanks while its card hangs from it:
             the rim owns the top, the neck the foot. -->
        <span aria-hidden="true" class="neck"></span>
      </div>
    {/each}
  </TabsList>
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
    <Popover.Content
      align="start"
      alignOffset={alignFor(detailAnchor)}
      aria-label="Session details"
      class="kit-pop session-details-popover"
      collisionPadding={12}
      customAnchor={detailAnchor}
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
    >
      {#snippet child({
        props,
        wrapperProps,
      })}
        <div {...wrapperProps}>
          <!-- The morph mark changes as the surface retargets. It is set
                 here, on the element: as a prop of Popover.Content the change
                 re-mounts bits-ui's focus scope, which runs its close
                 auto-focus on a surface that is still open. -->
          <div
            {...props}
            data-flush={neck.flush ? "start" : undefined}
            data-morph={morphing ? "" : undefined}
            style:--neck-end={`${neck.end}px`}
            style:--neck-flare-end={`${neck.flareEnd}px`}
            style:--neck-flare-start={`${neck.flareStart}px`}
            style:--neck-start={`${neck.start}px`}
            {@attach trackNeck}
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
          </div>
        </div>
      {/snippet}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  /* The card is a kit floating surface (app.css `.kit-pop`): its surface,
     its shadow and its fade with reduced motion. Its content runs edge to
     edge. It hangs from its tab's foot (PaneTabs script, "The card hangs
     from its tab"): its edge is drawn by `::after` rather than its border,
     so the top can be cut across the tab's flared span, and its shadow is
     cut at its top edge, so none falls on the strip or darkens the tab's
     foot into a seam. */
  @property --neck-start {
    syntax: "<length>";
    inherits: true;
    initial-value: 0px;
  }
  @property --neck-end {
    syntax: "<length>";
    inherits: true;
    initial-value: 0px;
  }
  :global(.kit-pop.session-details-popover) {
    /* Open: cut at its top edge only, with room for the whole overlay
       shadow past the others (as the pulled menu's `drawPull`). Shut, held
       until it is placed and grows (`cardMotion`): the tab's span at the
       card's top edge, no height at all. */
    --clip-open: inset(
      0 -120px -120px round 0 0 var(--radius-lg) var(--radius-lg)
    );
    --clip-shut: inset(
      0 calc(100% - var(--neck-end)) 100% var(--neck-start) round 0 0
        var(--radius-lg) var(--radius-lg)
    );
    position: relative;
    display: flex;
    z-index: 60;
    width: min(416px, calc(100vw - 24px));
    max-height: min(760px, var(--bits-popover-content-available-height, 85dvh));
    overflow: hidden;
    overscroll-behavior: contain;
    padding: 0;
    border: 0;
    clip-path: var(--clip-open);
    outline: none;

    /* Flush with its tab on the leading side: square there. */
    &[data-flush="start"] {
      border-start-start-radius: 0;
    }

    /* A phone's card stands a margin in from each side, under its tab,
       and holds clear of the screen's foot. */
    @media (max-width: 640px) {
      max-height: min(
        calc(100dvh - var(--c-top-bar-h) - 24px - var(--safe-bottom)),
        var(--bits-popover-content-available-height, 85dvh)
      );
    }
  }
  /* Open and close are the card's own (`cardMotion`): the kit's rise,
     scale and fade do not apply, and until it is placed it is held shut.
     With reduced motion the kit's fade runs and the card stands open. */
  @media (prefers-reduced-motion: no-preference) {
    :global(.kit-pop.session-details-popover),
    :global(.kit-pop.session-details-popover[data-state="closed"]) {
      opacity: 1;
      translate: none;
      scale: none;
      transition: none;
    }
    :global(.kit-pop.session-details-popover:not([data-shown])) {
      clip-path: var(--clip-shut);
    }
    @starting-style {
      :global(.kit-pop.session-details-popover[data-state="open"]) {
        opacity: 1;
        translate: none;
        scale: none;
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
  /* The glide to another tab: the wrapper's move, the card's height and the
     cut in its top edge, together. */
  @media (prefers-reduced-motion: no-preference) {
    :global(
      [data-bits-floating-content-wrapper]:has(
        > .session-details-popover[data-morph]
      )
    ) {
      transition: transform var(--dur-pop) var(--ease-drawer);
    }
    :global(.session-details-popover[data-morph]) .details-morph {
      transition: height var(--dur-pop) var(--ease-drawer);
    }
    :global(.kit-pop.session-details-popover[data-morph]) {
      transition:
        --neck-start var(--dur-pop) var(--ease-drawer),
        --neck-end var(--dur-pop) var(--ease-drawer);
    }
  }
  /* The trailing controls sit 4px after the title and 4px apart, on every
     pointer (owner: "a lot of wasted space until the x button"); where the
     chevron stands beside the close, their hit areas meet between them. */
  .tdetails,
  .tclose {
    --hit-gap-x: 4px;
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
    /* Its 12px glyph 4px clear of the title's end, as the close's is. */
    inline-size: 20px;
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
    /* A phone's tabs have no chevron: a long press opens the tab's menu
       (Session details first), and a tap on the chosen tab its details. */
    @media (max-width: 899px) {
      display: none;
    }
    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;

      @media (prefers-reduced-motion: no-preference) {
        transition: transform var(--dur-control) var(--ease-out);
      }
    }
    @media (hover: hover) {
      &:hover {
        background: var(--surface-fill);
      }
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
      min-block-size: var(--c-top-bar-h);
      padding-block-start: 0;
      padding-inline: calc(var(--c-bar-phone-edge) + var(--c-bar-toggle-glyph))
        calc(
          var(--c-bar-phone-gap) +
          var(--c-bar-caw-glass-phone) +
          env(safe-area-inset-right, 0px)
        );
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
    --px: 12px;
    --text: var(--text-label);
    --item: 32px;
    --sheet: var(--surface-recess);
    --tab-hover: light-dark(var(--surface-recess), var(--surface-hover));
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
      --item: var(--c-tab-row-h);
      --pad: 0px;
      --fade-len: 16px;
      --edge-room-start: calc(var(--fade-len) * 1.5);
      --radius: var(--radius-lg);
      --overlap: var(--radius-sm);
      padding-block-start: calc(var(--c-top-bar-h) - var(--c-tab-row-h));
      margin-block-start: 0;
      mask-image: linear-gradient(
        to right,
        transparent,
        transparent calc(var(--fade-start) * 0.375),
        rgb(0 0 0 / 0.15) calc(var(--fade-start) * 0.75),
        rgb(0 0 0 / 0.6) calc(var(--fade-start) * 1.125),
        #000 calc(var(--fade-start) * 1.5),
        #000 calc(100% - var(--fade-end)),
        rgb(0 0 0 / 0.9) calc(100% - var(--fade-end) * 0.75),
        rgb(0 0 0 / 0.5) calc(100% - var(--fade-end) * 0.5),
        rgb(0 0 0 / 0.1) calc(100% - var(--fade-end) * 0.25),
        transparent
      );
    }
  }

  /* As wide as its title, its pad and its controls, up to the cap; only a
     title past the cap ends in an ellipsis, and a strip that will not fit
     scrolls (TabsList) rather than squeezing its tabs. */
  .tab {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    min-inline-size: 0;
    max-inline-size: var(--c-tab-max-w);

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
      border-radius: var(--radius-pill);
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
  /* A finger's sideways drag is the strip's scroll; a downward one is the
     tab's (`pullMenu`), never the page's. */
  .tab {
    touch-action: pan-x;
  }

  /* ── The status rim, on every width ───────────────────────────────
     Each tab's rim wears its session's status (`data-tone`, the rail's
     scale): the tab's own outline, a 1.5px stroke across the top and round
     both shoulders, tapering to 0.5px down the sides, gone by 90% of its
     height, with a soft glow outside at half its strength. A status change
     cross-fades it. Increase Contrast and Reduce Transparency draw it a
     solid 1px rim. How chosen a tab is (`--pick`, `look`) sets its
     strength. The desk keeps its status glyph before the title as well
     (owner: "desktop and mobile should all have rims, desktop has icons
     mobile not").

     It is drawn on the tab's card, edge for edge (TabsList
     `--card-in-start`, `--card-in-end`; the shoulders' `--r-start`,
     `--r-end`). On the desk a card tucked under a neighbour starts where
     that neighbour's edge stands, its own shoulder rounded there, so the
     rim does too, and its side on that edge stops below the shoulder: the
     neighbour's side is the one outline where the two meet, and nothing of
     it is drawn under the neighbour. The phone's row runs a tucked card
     under its neighbour square (`--tuck: 0px`), where the neighbour's card
     covers that side. */
  .tab {
    --tone: var(--ink-muted);
    --rim-mix: calc(
      var(--tab-rim-mix) +
      (var(--tab-rim-mix-chosen) - var(--tab-rim-mix)) *
      var(--pick)
    );
  }
  @media (min-width: 900px) {
    .tab[data-tucked="start"] {
      --side-start: 0px;
    }
    .tab[data-tucked="end"] {
      --side-end: 0px;
    }
  }
  .tab[data-tone="working"] {
    --tone: var(--status-live-glyph);
  }
  .tab[data-tone="attention"] {
    --tone: var(--status-attn-glyph);
  }
  .tab[data-tone="failed"] {
    --tone: var(--status-fail-glyph);
  }
  .tab:is([data-tone="quiet"], [data-tone="done"]) {
    --rim-mix: var(--tab-rim-mix-idle);
  }
  /* Under a swipe the rim is where its fraction puts it, frame by frame:
     no transition lags the finger. */
  :global([data-ride]) .rim::before,
  :global([data-ride]) .rim::after {
    transition: none;
  }
  .rim {
    /* 6px of room round the outline for the glow, inside the mask. */
    --spill: 6px;
    display: block;
    position: absolute;
    inset-block: calc(-1 * var(--spill)) 0;
    inset-inline: calc(var(--card-in-start, 0px) - var(--spill))
      calc(var(--card-in-end, 0px) - var(--spill));
    z-index: 2;
    pointer-events: none;
    mask-image: linear-gradient(
      #000 var(--spill),
      transparent calc(var(--spill) + 0.9 * var(--item))
    );

    /* Both on the tab's own outline: the glow outside it (a box shadow
       is drawn only outside its box), the stroke inside it. */
    &::before,
    &::after {
      content: "";
      position: absolute;
      inset: var(--spill) var(--spill) 0;
    }
    &::before {
      border-radius: var(--r-start, var(--radius)) var(--r-end, var(--radius)) 0
        0;
      box-shadow: 0 0 6px
        color-mix(in oklab, var(--tone) calc(var(--rim-mix) / 2), transparent);
      transition: box-shadow var(--dur-panel) var(--ease-out);
    }
    /* The stroke as a shape, so it holds its full width across the top
       and round both shoulders, where a shadow's would thin with the
       corner's radius, and only then tapers, over the next --spill down
       each side, to its side width (`--side-start`, `--side-end`, none on
       a desk tab's tucked edge). Each shoulder takes its own radius
       (`--r-start`, `--r-end`, the strip's `--radius` unless the host
       squares it); the stroke's inner edge turns on one `--top` less, none
       on a square shoulder (`--in-*`). */
    &::after {
      --top: 1.5px;
      --side: 0.5px;
      --rs: var(--r-start, var(--radius));
      --re: var(--r-end, var(--radius));
      --ss: var(--side-start, var(--side));
      --se: var(--side-end, var(--side));
      --in-start: max(var(--rs), var(--top));
      --in-end: max(var(--re), var(--top));
      background: color-mix(in oklab, var(--tone) var(--rim-mix), transparent);
      clip-path: shape(
        from 0 100%,
        line to 0 var(--rs),
        arc to var(--rs) 0 of var(--rs) cw,
        line to calc(100% - var(--re)) 0,
        arc to 100% var(--re) of var(--re) cw,
        line to 100% 100%,
        line to calc(100% - var(--se)) 100%,
        line to calc(100% - var(--se)) calc(var(--in-end) + var(--spill)),
        line to calc(100% - var(--top)) var(--in-end),
        arc to calc(100% - var(--in-end)) var(--top) of
          calc(var(--in-end) - var(--top)) ccw,
        line to var(--in-start) var(--top),
        arc to var(--top) var(--in-start) of calc(var(--in-start) - var(--top))
          ccw,
        line to var(--ss) calc(var(--in-start) + var(--spill)),
        line to var(--ss) 100%,
        close
      );
      transition: background-color var(--dur-panel) var(--ease-out);
    }

    @media (prefers-contrast: more), (prefers-reduced-transparency: reduce) {
      mask-image: none;

      &::before {
        box-shadow: none;
      }
      &::after {
        --top: 1px;
        --side: 1px;
        background: var(--tone);
      }
    }
  }

  /* ── The phone's row: receding tabs ───────────────────────────────
     The chosen tab is the page it opens; every other tab recedes one step
     toward the shelf per tab of distance from it, to three. The rim is the
     status: the row draws no status glyph.

     A swipe carries the choice from tab to tab with the finger (`look`):
     how chosen a tab is (`--pick`) sets its rim's strength and its title's
     ink, its card mixes between its recede steps either side of the swipe
     (`--fill-from`, `--fill-to`, by `--f`). At rest they are the chosen
     tab's alone. None of them sizes a tab: choosing one never moves the
     others. */
  @media (max-width: 899px) {
    .tab {
      --tab-fill: color-mix(
        in oklab,
        var(--fill-to) calc(var(--f) * 100%),
        var(--fill-from)
      );
    }
    /* The rim is the status: no glyph beside the title. */
    .tglyph {
      display: none;
    }
    /* A title's room at each end clears the overlap, so a neighbour
       tucked over either end never touches it: a lead past the overlap
       before it, the chosen sheet's flare past the overlap after it. The
       same on every tab, chosen or not, so a choice never resizes a tab
       and moves the ones after it (owner: "switching between them kinda
       shifts things around"); before, a tab after the chosen one took the
       overlap at its start and gave it up when the choice passed it. */
    .tab {
      --px-start: calc(var(--overlap) + var(--c-tab-lead));
      --px-end: calc(var(--overlap) + var(--radius-lg));
    }
    /* A shoulder tucked under its neighbour (TabsList `data-tucked`) is
       square, card and rim: the neighbour over it is rounder than the
       overlap is deep, so a round shoulder would rise out of the notch and
       its rim cross the neighbour's, a double stroke at the junction.
       Square, its top runs on under the neighbour and meets its shoulder
       at the top, as the mockup's tabs do, whose radius is their overlap.
       The kit's card reads the same two radii, and runs under the
       neighbour in full (`--tuck`): here the rim draws the outline. */
    .tab {
      --r-start: var(--radius);
      --r-end: var(--radius);
      --tuck: 0px;
    }
    .tab[data-tucked="start"] {
      --r-start: 0px;
    }
    .tab[data-tucked="end"] {
      --r-end: 0px;
    }
    /* The title's ink follows how chosen its tab is; parked on you, it
       stays strong (`.needs`). */
    .tab:not(.needs) :global(.ff-tab) {
      color: color-mix(
        in oklab,
        var(--ink-strong) calc(var(--pick) * 100%),
        var(--ink-muted)
      );
    }
    /* Under a swipe the title's ink is where its fraction puts it, frame
       by frame: no transition lags the finger. */
    :global([data-ride]) .tab :global(.ff-tab) {
      transition: none;
    }
  }

  /* ── The tab its card hangs from ─────────────────────────────────
     While its card is open a tab keeps the card head's surface (the
     chosen sheet already is it; a hovered tab's card would light to the
     hover step instead), and the chosen tab draws a 1px stroke in the
     card's edge from the flare's outer end, up the concave flare and up
     each flank, fading out by 60% of the tab's height where the rim's
     taper takes over. It is drawn like the rim's stroke, as a shape on a
     box one flare wider than the tab each side, and reaches 1px under the
     tab so it meets the card's own top edge. */
  .tab[data-details-open] {
    --tab-fill: var(--surface-recess);
    --tab-hover: var(--surface-recess);
  }
  /* Flush with the pane's edge (`flushAt`): the sheet's foot is square on
     the leading side while its card hangs there, so the tab's flank runs
     straight down into the card's side. */
  .tab[data-flush="start"] :global(.ff-tab.selected)::after {
    clip-path: shape(
      from var(--flare) 100%,
      line to var(--flare) var(--radius),
      arc to calc(var(--flare) + var(--radius)) 0 of var(--radius) cw,
      line to calc(100% - var(--flare) - var(--radius)) 0,
      arc to calc(100% - var(--flare)) var(--radius) of var(--radius) cw,
      line to calc(100% - var(--flare)) calc(100% - var(--flare)),
      arc to 100% 100% of var(--flare) ccw,
      close
    );
  }
  .neck {
    display: none;
  }
  .tab[data-details-open][data-chosen] .neck {
    --f: var(--flare);
    --h: calc(100% - 1px);
    display: block;
    position: absolute;
    inset-block: 0 -1px;
    inset-inline: calc(-1 * var(--flare));
    z-index: 2;
    pointer-events: none;
    background: var(--border-control);
    clip-path: shape(
      from 0 100%,
      arc to calc(var(--f) + 1px) calc(var(--h) - var(--f)) of
        calc(var(--f) + 1px) ccw,
      line to calc(var(--f) + 1px) 0,
      line to var(--f) 0,
      line to var(--f) calc(var(--h) - var(--f)),
      arc to 0 var(--h) of var(--f) cw,
      close,
      move to 100% 100%,
      arc to calc(100% - var(--f) - 1px) calc(var(--h) - var(--f)) of
        calc(var(--f) + 1px) cw,
      line to calc(100% - var(--f) - 1px) 0,
      line to calc(100% - var(--f)) 0,
      line to calc(100% - var(--f)) calc(var(--h) - var(--f)),
      arc to 100% var(--h) of var(--f) ccw,
      close
    );
    mask-image: linear-gradient(
      to top,
      #000 calc(var(--f) + 2px),
      transparent 60%
    );
  }
  /* Flush: the leading stroke runs straight down the flank to the card's
     own side; the trailing one keeps its flare. */
  .tab[data-details-open][data-chosen][data-flush="start"] .neck {
    clip-path: shape(
      from var(--f) 100%,
      line to var(--f) 0,
      line to calc(var(--f) + 1px) 0,
      line to calc(var(--f) + 1px) 100%,
      close,
      move to 100% 100%,
      arc to calc(100% - var(--f) - 1px) calc(var(--h) - var(--f)) of
        calc(var(--f) + 1px) cw,
      line to calc(100% - var(--f) - 1px) 0,
      line to calc(100% - var(--f)) 0,
      line to calc(100% - var(--f)) calc(var(--h) - var(--f)),
      arc to 100% var(--h) of var(--f) ccw,
      close
    );
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
    /* 4px from the title's end to the glyph: the 16px glyph stands 2px
       inside its 20px box. */
    margin-inline-start: 2px;

    /* A finger closes a tab from its options (owner: "remove the x make
       it close on hold menu then close"). */
    @media (max-width: 899px), (pointer: coarse) {
      display: none;
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
        transform: scale(var(--press-scale));
      }
    }
  }
  .tdetails[aria-expanded="true"] :global(svg) {
    transform: rotate(180deg);
  }
  /* The card's edge, with its top cut across the tab's flared span
     (`.session-details-popover` above). Last, after the rim's own. */
  :global(.kit-pop.session-details-popover)::after {
    --gap-from: calc(var(--neck-start) - var(--neck-flare-start, 0px));
    --gap-to: calc(var(--neck-end) + var(--neck-flare-end, 0px));
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    border: 1px solid var(--border-control);
    border-radius: inherit;
    pointer-events: none;
    mask:
      linear-gradient(
        to right,
        #000 var(--gap-from),
        transparent var(--gap-from) var(--gap-to),
        #000 var(--gap-to)
      )
      top / 100% 1px no-repeat,
      linear-gradient(#000 0 0) 0 1px / 100% calc(100% - 1px) no-repeat;
  }
</style>
