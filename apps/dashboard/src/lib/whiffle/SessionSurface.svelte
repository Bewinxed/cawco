<script lang="ts">
  /**
   * The workspace surface: the fleet board, and the groups of conversations
   * arranged over it.
   *
   * What this file owns is small, deliberately. It reconciles the URL with
   * the workspace, holds the server's answer for whichever conversation the
   * page was entered with, and decides whether the reader gets a grid or a
   * single group. Everything about a group — its tabs, its identity bar, its
   * swipe — belongs to `PaneLeaf`, once per group rather than once per app.
   * That is what makes a split two workstations instead of one view showing
   * two things. The conversations themselves belong to `PaneHost`, mounted
   * once each and docked into whichever group holds them.
   *
   * The active conversation is `workspace.activeSessionId`, a plain piece of
   * state, not `page.params.id`. Showing one assigns it and re-renders in the
   * same frame; the URL is written afterwards with `pushState`, which runs no
   * load. Because no load runs, `page.data` cannot change on a switch, so the
   * server tail cannot land late and rebuild a transcript already on screen —
   * which is what the View-Transition suppression flag and the one-frame
   * animation guards used to be hiding.
   *
   * It is not a route's layout: the Shell mounts it the first time a
   * `/session` page shows and keeps it mounted from then on, parked under
   * whichever spoke is showing instead (`shown` false). Coming back finds
   * every transcript where it was scrolled and every disclosure as it was
   * left, because nothing was rebuilt.
   */
  import { onMount, untrack } from "svelte";
  import { browser } from "$app/environment";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { IsMobile, IsTouchPortrait } from "$lib/hooks/is-mobile.svelte";
  import {
    type HistorySource,
    preloadHistory,
    syncSubscriptions,
    whiffle,
  } from "$lib/whiffle/client.svelte";
  import FleetBoard from "$lib/whiffle/FleetBoard.svelte";
  import { instanceForSession } from "$lib/whiffle/links";
  import { dur, ease, motionOk } from "$lib/whiffle/motion/curves.svelte";
  import PaneDeck from "$lib/whiffle/workspace/PaneDeck.svelte";
  import PaneGrid from "$lib/whiffle/workspace/PaneGrid.svelte";
  import PaneHost from "$lib/whiffle/workspace/PaneHost.svelte";
  import { workspace } from "$lib/whiffle/workspace/workspace.svelte";

  /** Whether a `/session` page is showing, rather than another spoke over this one parked. */
  let { shown }: { shown: boolean } = $props();

  /** 900px is this app's desktop line, not the 768 the hook defaults to. */
  const mobile = new IsMobile(900);
  /**
   * A tablet held upright is the deck too, however wide it is.
   *
   * The width line alone was drawn for phones, and a tablet clears it: every
   * iPad is 1024 CSS px or more in landscape, and the 12.9" is 1024 in
   * portrait as well. So an iPad got the grid, and with the grid it got
   * neither gesture — the two-finger paging lives on the deck, and the
   * one-finger tab swipe was armed only for the deck's focused group. Held
   * upright there is one conversation's worth of room anyway, which is what
   * the deck is for, so the same orientation that makes the grid cramped is
   * the one that turns the gestures on. Turned landscape it is a desk again:
   * the grid comes back, and the tab swipe is armed there instead (PaneGrid).
   */
  const touchPortrait = new IsTouchPortrait();
  /**
   * The media query cannot run on the server, so its answer there is the
   * `whiffle-narrow` cookie this browser wrote last time (or, on a first
   * visit, what its headers suggest). On the client the query is right
   * synchronously, so hydration on a phone finds the deck already painted.
   */
  const deck = $derived(mobile.current || touchPortrait.current);
  const narrow = $derived(browser ? deck : (page.data.narrow as boolean));

  const onBoard = $derived(workspace.activeSessionId === null);

  /* ── The server's answer, claimed once ───────────────────────────────
     `page.data` only changes on a REAL navigation — a cold load, a deep
     link, an arrival from another route. It is captured by value at the two
     moments it can differ, and handed to the one pane it belongs to. Read
     reactively, it was the mechanism by which a late-landing tail rebuilt a
     transcript mid-animation. */

  interface EntryData {
    history: Promise<HistorySource | null> | null;
    id: string;
    tail: unknown;
  }

  const captureEntry = (): EntryData => ({
    id: page.params.id ?? "",
    tail: (page.data as { tail?: unknown }).tail ?? null,
    history:
      (page.data as { history?: Promise<HistorySource | null> | null })
        .history ?? null,
  });

  let entry = $state<EntryData>(captureEntry());
  // Only a `/session` page carries a conversation's server answer; a trip to
  // another spoke leaves the one this surface holds alone.
  afterNavigate(({ to }) => {
    if (to?.url.pathname.startsWith("/session")) {
      entry = captureEntry();
    }
    reconcileFromUrl();
  });

  /* ── URL → workspace ─────────────────────────────────────────────────
     Deliberately NOT a `$effect` on `page.url`. A shallow `pushState` does
     not re-run this layout's effects — measured, not assumed: an
     instrumented effect fired twice at mount and never again across three
     tab clicks and two back presses, leaving the store a whole history entry
     behind the address bar. There are exactly two ways the URL can move
     without this store having moved first, and both are events: the browser
     walking history, and a real navigation from another route. */

  function reconcileFromUrl(): void {
    const url = new URL(location.href);
    const parts = url.pathname.split("/").filter(Boolean);
    // Another route entirely — leave the workspace holding what it holds, so
    // a trip to Usage and back does not cost the reader their place.
    if (parts[0] !== "session") {
      return;
    }
    const urlId = parts[1] ?? null;
    if (urlId === workspace.activeSessionId) {
      return;
    }
    // Only carry context when the URL actually names a machine. A stored
    // conversation's machine and folder are how it is addressed at all, and
    // `workingSet.visit` SPREADS what it is given over what it holds — so a
    // blank context from a URL with no query string erases the real one, and
    // a pane that was reading a transcript reports itself unreachable.
    const machine = url.searchParams.get("machine");
    workspace.reveal(
      urlId,
      urlId && machine
        ? {
            machine,
            cwd: url.searchParams.get("cwd") ?? "",
            harness: url.searchParams.get("harness") ?? "claude",
          }
        : undefined
    );
  }

  // Synchronously, during the first client render. The store restores what
  // was open from localStorage at module load, so without this the first
  // paint showed whatever conversation was last active and only corrected to
  // the URL's answer on mount — the view visibly changing under the reader a
  // frame after it appeared. The URL is the address; it wins before anything
  // is drawn, not after.
  if (browser) {
    reconcileFromUrl();
  }

  onMount(() => {
    reconcileFromUrl();
    const onPop = () => reconcileFromUrl();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });

  /* ── Session id → instance ──────────────────────────────────────────
     A tab opened by a conversation's session id is re-addressed to its
     instance once the instance list names one — the address every link in
     the app already uses. Until then the pane and its details cannot tell the
     conversation is running, so nothing that only a live session answers is
     ever asked. The list arrives over the socket after the first paint, so
     this follows the list rather than checking once. */
  $effect(() => {
    const index = whiffle.instanceIndex;
    untrack(() => {
      for (const id of workspace.openIds) {
        if (index.byId.has(id)) {
          continue;
        }
        const row = instanceForSession(index, id);
        if (row) {
          workspace.retarget(id, row.id);
        }
      }
    });
  });

  const queued = new Set<string>();
  const historyQueue: string[] = [];
  let preloadReady = false;
  let preloading = false;

  async function drainHistory(): Promise<void> {
    if (!preloadReady || preloading) {
      return;
    }
    preloading = true;
    while (preloadReady && historyQueue.length > 0) {
      const [id] = historyQueue;
      historyQueue.shift();
      if (id !== workspace.activeSessionId && workspace.openIds.includes(id)) {
        // biome-ignore lint/performance/noAwaitInLoops: background reads deliberately run one at a time
        await preloadHistory(id);
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    preloading = false;
  }

  // The other tabs read behind the active one, not behind a clock: the loop
  // starts the moment the active conversation has its first chunk (or at once,
  // when the store already holds it), so the only tap that can still find a
  // skeleton is one that beats the active tab's own read.
  $effect(() => {
    const active = workspace.activeSessionId;
    const held = active ? whiffle.session(active) : null;
    const ready =
      active === null ||
      (held !== null && (held.initialized || held.messages.length > 0));
    if (!ready) {
      return;
    }
    untrack(() => {
      preloadReady = true;
      drainHistory();
    });
  });

  $effect(() => {
    const ids = workspace.openIds;
    untrack(() => {
      for (const id of ids) {
        if (!queued.has(id)) {
          queued.add(id);
          historyQueue.push(id);
        }
      }
      drainHistory();
    });
  });

  $effect(() => {
    syncSubscriptions();
  });

  /* ── Board ↔ conversation ───────────────────────────────────────────
     The board is the home the groups push in over: opening a conversation
     slides the groups in from 8% toward the inline end as the board recedes
     8% the other way and dims to 0.6, over --dur-pop on the drawer curve;
     going back to the board slides the groups off the way they came as the
     board returns. The one leaving stays drawn until its slide ends, then
     is hidden (below); input goes to the one arriving at once. Parked under
     another spoke, the swap is instant: nobody is watching it. */
  let boardEl = $state<HTMLElement | null>(null);
  let groupsEl = $state<HTMLElement | null>(null);
  let boardHidden = $state(untrack(() => !onBoard));
  let groupsHidden = $state(untrack(() => onBoard));
  let pushing: Animation[] = [];

  /** A surface's drawn transform and opacity, a slide in flight included. */
  const drawn = (el: HTMLElement): Keyframe => {
    const style = getComputedStyle(el);
    return { transform: style.transform, opacity: style.opacity };
  };

  function push(toBoard: boolean, board: HTMLElement, groups: HTMLElement) {
    const from = { board: drawn(board), groups: drawn(groups) };
    for (const animation of pushing) {
      animation.cancel();
    }
    boardHidden = false;
    groupsHidden = false;
    const side =
      getComputedStyle(document.documentElement).direction === "rtl" ? -1 : 1;
    const timing: KeyframeAnimationOptions = {
      duration: dur("--dur-pop"),
      easing: ease("--ease-drawer"),
      fill: "forwards",
    };
    const home: Keyframe = { transform: "none", opacity: 1 };
    const receded: Keyframe = {
      transform: `translateX(${-8 * side}%)`,
      opacity: 0.6,
    };
    const away: Keyframe = {
      transform: `translateX(${8 * side}%)`,
      opacity: 0,
    };
    const leaving = toBoard ? groups : board;
    pushing = [
      board.animate([from.board, toBoard ? home : receded], timing),
      groups.animate([from.groups, toBoard ? away : home], timing),
    ];
    const mine = pushing;
    pushing[0].finished.then(
      () => {
        if (pushing !== mine) {
          return;
        }
        if (leaving === groups) {
          groupsHidden = true;
        } else {
          boardHidden = true;
        }
        for (const animation of mine) {
          animation.cancel();
        }
        pushing = [];
      },
      () => {
        /* a newer swap took over from where this one had got to */
      }
    );
  }

  let seenBoard = untrack(() => onBoard);
  $effect(() => {
    const toBoard = onBoard;
    untrack(() => {
      if (toBoard === seenBoard) {
        return;
      }
      seenBoard = toBoard;
      if (shown && motionOk.current && boardEl && groupsEl) {
        push(toBoard, boardEl, groupsEl);
        return;
      }
      for (const animation of pushing) {
        animation.cancel();
      }
      pushing = [];
      boardHidden = !toBoard;
      groupsHidden = toBoard;
    });
  });
</script>

<div class="surface">
  <!-- The board is a HOME rather than a peer: it is what is there when no
       conversation is, and it holds its scroll position underneath the
       groups rather than being rebuilt on every visit. -->
  <div
    class="board"
    inert={!onBoard}
    bind:this={boardEl}
    class:hidden-surface={boardHidden}
  >
    <FleetBoard active={onBoard && shown} />
  </div>

  <div
    class="groups"
    inert={onBoard}
    bind:this={groupsEl}
    class:hidden-surface={groupsHidden}
  >
    <!-- A phone shows one group at a time; the grid is a desktop arrangement.
         The tree still holds whatever splits were made at a desk, and the
         deck makes them reachable: the groups are a vertical stack that two
         fingers page through, so widening the window restores the grid and
         narrowing it loses nothing. -->
    {#if narrow}
      <PaneDeck />
    {:else}
      <PaneGrid node={workspace.root} />
    {/if}
    <!-- After the groups on purpose: their slots register first, so a pane
         is born straight into the group that asked for it. -->
    <PaneHost
      entryHistory={entry.history}
      entryId={entry.id}
      entryTail={entry.tail}
    />
  </div>
</div>

<style>
  .surface {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .board,
  .groups {
    position: absolute;
    inset: 0;
    display: flex;
    min-width: 0;
    min-height: 0;
  }

  /* Never `display`: a surface put away keeps its layout, so the
     virtualisers inside it keep their measurements, its scroll stays where
     it was, and revealing it costs nothing. */
  .hidden-surface {
    pointer-events: none;
  }
  /* The board under a conversation is skipped outright: its style, layout
     and paint leave every frame, and its rendering state — layout, scroll
     offsets — is kept for its return. `visibility: hidden` left the whole
     board in each restyle, reflow and layerize of the page while the
     conversation above it streamed. A skipped subtree cannot be painted by
     a descendant either, which `visibility` allowed. */
  .board.hidden-surface {
    content-visibility: hidden;
  }
  /* The groups under the board keep laying out while it is shown, so a
     conversation streaming behind it is measured and current when it comes
     back. Only the HIDDEN state is declared: `visibility` inherits, but a
     descendant re-declaring `visible` un-hides itself through a hidden
     ancestor, so a single `visibility: visible` deeper in the tree would
     paint a surface that is supposed to be put away. */
  .groups.hidden-surface {
    visibility: hidden;
  }
</style>
