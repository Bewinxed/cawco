<script lang="ts">
  /**
   * A page and the surface beside it, in one resizable split (paneforge):
   * the page's own content on one side, and on the other what it opened —
   * a conversation's plan or preview (SideSplit), a project's task (the
   * project page). The page stays live beside it (DESIGN.md, The Open Page
   * Rule): nothing in it is put away while the surface is open.
   *
   * The surface's width is the page's own, kept across visits under
   * `keys.width`. It can take the whole split, in place: the handle dragged
   * past the page's narrowest collapses the page to nothing, and the head's
   * Expand (expand.ts) moves the handle there. Both are one state,
   * expanded, kept under `keys.expanded`. Back (`backLabel`), Esc once the
   * surface's own Esc has nothing left to close (`onescape`), or the handle
   * dragged back out gives the split back: at the last width beside it, or
   * from the page's narrowest under the pointer. Closing the surface ends
   * the expansion.
   *
   * Motion: opening or closing in front of the reader grows one side into
   * the other (`sliding`); a surface opening out of a row the page departed
   * (`landKey`, motion/share) clips open from it; a split sized off screen
   * takes its size at once.
   */
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import * as Resizable from "#lib/components/ui/resizable/index.js";
  import { frameSize } from "../frame-observer";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { waiting as departing, land } from "../motion/share.svelte";
  import { store, stored, unstore } from "../storage";
  import { setSideExpand } from "./expand";
  import { SIDE_FLOOR_PX } from "./floor";

  let {
    open,
    keys,
    backLabel,
    visible = true,
    active = true,
    defaultWidth = 45,
    landKey,
    onescape,
    share = $bindable(0),
    root = $bindable(),
    main,
    side,
    after,
  }: {
    /** The surface is open beside the page: on a desk, with something to show. */
    open: boolean;
    /** Where the surface's width and its expansion are kept for this page. */
    keys: { expanded: string; width: string };
    /** What Expand's way back says: "Back to conversation", "Back to board". */
    backLabel: string;
    /** The page is on screen: a split sized off screen takes its size at once. */
    visible?: boolean;
    /** The page is its group's active tab: Esc is heard only there. */
    active?: boolean;
    /** The surface's share when none is kept, in percent. */
    defaultWidth?: number;
    /** A share key (motion/share) the surface lands from when it was departed. */
    landKey?: string;
    /** The surface's own Esc, before the split's: it marks the key used when it took it. */
    onescape?: (event: KeyboardEvent) => void;
    /** The surface's share of the width, in percent: 0 while closed. */
    share?: number;
    root?: HTMLDivElement;
    /** The page's side. */
    main: Snippet;
    /** The surface. */
    side: Snippet;
    /** What stands in the split beside its panes: a phone's sheets. */
    after?: Snippet;
  } = $props();

  let sidePane = $state<ReturnType<typeof Resizable.Pane>>();
  /** The page's own width for the surface, in percent: read untracked. */
  let savedWidth = untrack(() => defaultWidth);
  let resizing = $state(false);
  /** The kept width when the handle was taken: a drag that ends expanded gives it back. */
  let dragFrom = untrack(() => defaultWidth);
  /**
   * A key on the handle is moving it (the APG window splitter's arrows, Home
   * and End), for the task the key's resize lands in: with `resizing` (the
   * pointer's), what says the reader moved the handle.
   */
  let keyed = false;
  /**
   * End from the far edge collapsed the surface in one step: ending the
   * expansion changes the pane's `defaultSize` (`sideSize`), and paneforge
   * rebuilds the layout from it on the width kept. Set for the key's task,
   * the split collapses it again when that rebuild lands, before anything
   * paints, as End asked.
   */
  let collapseAgain = false;
  function handleKey(event: KeyboardEvent): void {
    if (
      event.target instanceof Element &&
      event.target.closest('[role="separator"]')
    ) {
      keyed = true;
      setTimeout(() => {
        keyed = false;
        collapseAgain = false;
      });
    }
  }
  /**
   * The page's narrowest share beside the surface. Dragged past it, the page
   * collapses to nothing: the surface is expanded.
   */
  const MAIN_MIN = 30;
  /** The surface's widest share beside the page. */
  const SIDE_MAX = 100 - MAIN_MIN;
  /** The surface's share at the far edge: the whole split. */
  const WHOLE = 99.99;
  /**
   * The divider's width (the kit handle's `w-px`): the panes share what is
   * left of the split beside it, so their percentages are of that.
   */
  const DIVIDER = 1;
  /**
   * The split's width as the panes are sized from it: read as the split
   * mounts, so the first frame painted stands the panes at their sizes, and a
   * change in the next frame (frameSize). Read inside a ResizeObserver
   * delivery, the floor and the panes' sizes it sets resized the panes inside
   * that delivery.
   */
  let laidWidth = $state(0);
  const measureSplit = frameSize<HTMLElement>((node) => {
    laidWidth = node.clientWidth;
  });
  /** The surface's floor (SIDE_FLOOR_PX), as a share of the panes' room; null until measured. */
  const sideMin = $derived(
    laidWidth > DIVIDER ? (SIDE_FLOOR_PX / (laidWidth - DIVIDER)) * 100 : null
  );
  /** The split can hold the surface at its floor. */
  const fits = $derived(sideMin !== null && sideMin <= SIDE_MAX);

  /**
   * The surface has the whole split, by Expand or by the handle dragged to
   * the far edge: one state, kept per page beside its width. Read as the
   * split is made, so its first layout is the kept one.
   */
  let expandAsked = $state(
    stored(
      "local",
      untrack(() => keys.expanded)
    ) === "1"
  );
  /** The surface has the whole split: asked, and open on a desk. */
  const expanded = $derived(expandAsked && open && fits);
  /** The last width beside the page, kept for the next visit and for going back. */
  function keepWidth(size: number): void {
    savedWidth = size;
    store("local", keys.width, String(size));
  }
  function setExpanded(next: boolean): void {
    expandAsked = next;
    if (next) {
      store("local", keys.expanded, "1");
    } else {
      unstore("local", keys.expanded);
    }
  }
  setSideExpand({
    get available() {
      return open && fits;
    },
    get expanded() {
      return expanded;
    },
    get backLabel() {
      return backLabel;
    },
    toggle: () => setExpanded(!expanded),
    collapse: () => {
      if (!expanded) {
        return false;
      }
      collapseByKey();
      return true;
    },
  });
  /** The next change of size is the keyboard's: it is taken at once. */
  let snapNext = false;
  /**
   * Esc gives the split back at once: a keyboard action is not watched, and
   * it repeats (emil-design-eng). The control and the drag keep the slide.
   */
  function collapseByKey(): void {
    snapNext = true;
    setExpanded(false);
  }
  // Closing the surface ends the expansion: what opens next opens beside the
  // page. Only a close counts; a page still reading what it shows after a
  // reload has not closed anything.
  let openWas = untrack(() => open);
  $effect(() => {
    const now = open;
    if (openWas && !now && untrack(() => expandAsked)) {
      setExpanded(false);
    }
    openWas = now;
  });
  /**
   * Esc puts the expansion away, after the surface's own Esc. Heard from
   * this split, or with nothing focused; a key in another group's pane is
   * that one's.
   */
  function escapeExpanded(event: KeyboardEvent): void {
    if (!(event.key === "Escape" && expanded && visible && active)) {
      return;
    }
    const { target } = event;
    if (!(
      target instanceof Node &&
      (root?.contains(target) || target === document.body)
    )) {
      return;
    }
    onescape?.(event);
    if (
      event.defaultPrevented ||
      (target instanceof Element && target.closest("dialog[open]"))
    ) {
      return;
    }
    event.preventDefault();
    collapseByKey();
  }
  /**
   * The surface's share while it is open: the page's own width, held to the
   * 320px floor and the page's narrowest, or all of it while expanded.
   * Closed, or in a split too narrow to hold the floor at all, it is 0: the
   * pane collapses.
   *
   * It is also the pane's `defaultSize`, which is what paneforge (1.0.2)
   * rebuilds the group's layout from whenever a pane's constraints change
   * (`panesArrayChanged`): the floor is a share of the measured width, so a
   * change of width is one, and with a fixed default of 0 the surface
   * snapped shut on it. Its own Reactive Size example keeps `defaultSize`
   * with a pixel floor for this reason (paneforge.com/docs/examples/reactive-size).
   * `savedWidth` is read untracked, so a drag never rebuilds the layout.
   * Expanding or going back changes it, so the rebuild lands on the whole
   * split, or on the width kept; one the handle reached is where it stands.
   */
  const sideSize = $derived.by(() => {
    if (!(open && fits && sideMin !== null)) {
      return 0;
    }
    if (expanded) {
      return 100;
    }
    return Math.min(
      SIDE_MAX,
      Math.max(
        untrack(() => savedWidth),
        sideMin
      )
    );
  });
  /** The split is sliding: the reader is watching it open or close. */
  let sliding = $state(false);
  /** The surface's share as its pane was last laid out, in percent. */
  let laidShare = $state(untrack(() => share));
  /**
   * The surface open with no room: the handle taken to the far edge, by the
   * keyboard's End or the pointer alike, collapses its pane to nothing (the
   * APG window splitter's End "may completely collapse the secondary pane").
   * Its card is not drawn then, nor reached by the keyboard: held at its
   * narrowest it stood past the screen's edge (1440..1760 at 1440). Opening
   * and closing slide as they did; a share coming back draws it again.
   */
  const squeezed = $derived(open && laidShare === 0 && !sliding);
  let mounted = $state(false);
  /** A surface opening out of a departed row: it clips open from it. */
  let fromRow = $state(false);

  $effect(() => {
    const kept = Number(stored("local", keys.width));
    savedWidth = kept > 0 ? Math.min(SIDE_MAX, kept) : defaultWidth;
    expandAsked = stored("local", keys.expanded) === "1";
  });
  $effect(() => {
    const opening = open && fits;
    // Expanding or going back is a change of size in front of the reader: it
    // slides as opening does.
    const full = expanded;
    const pane = sidePane;
    // The handle reaching the edge or leaving it is the hand's own size, the
    // pointer's or a key's: nothing slides under it, nor puts it back.
    if (!pane || untrack(() => resizing) || keyed) {
      return;
    }
    if (opening) {
      fromRow =
        untrack(() => !mounted) && landKey !== undefined && departing(landKey);
      mounted = true;
    }
    const snapped = snapNext;
    snapNext = false;
    const seen =
      untrack(() => visible && !fromRow) && motionOk.current && !snapped;
    sliding = seen;
    let settle = 0;
    let gone = false;
    // The size is this page's own, held to the floor (`sideSize`): paneforge
    // refuses a resize under a pane's `minSize` outright rather than
    // clamping it, so the size asked for is one it takes.
    const frame = requestAnimationFrame(() => {
      if (opening) {
        pane.resize(full ? 100 : untrack(() => sideSize));
      } else {
        pane.collapse();
      }
      settle = requestAnimationFrame(() => {
        fromRow = false;
        // The slide ends when the panes land, on their own clock: a timer
        // beside it took the transition away from under a run held still.
        if (seen) {
          const runs = (root?.getAnimations({ subtree: true }) ?? []).filter(
            (run) =>
              run instanceof CSSTransition &&
              run.transitionProperty === "flex-grow"
          );
          Promise.allSettled(runs.map((run) => run.finished)).then(() => {
            if (!gone) {
              sliding = false;
            }
          });
        }
      });
    });
    const timer = opening
      ? undefined
      : setTimeout(
          () => {
            mounted = false;
          },
          motionOk.current ? dur("--dur-panel") : 1
        );
    return () => {
      gone = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settle);
      clearTimeout(timer);
    };
  });

  /**
   * The surface mounting already open slides --pop-rise in from the edge it opens
   * against and fades up (--dur-panel, --ease-out), the same move its class
   * transition makes when it opens later. Reduced motion keeps the fade.
   */
  function surfaceIn(_node: Element): TransitionConfig {
    if (!open || fromRow) {
      return { duration: 0 };
    }
    const still = !motionOk.current;
    return {
      duration: dur("--dur-panel"),
      easing: easeOut,
      css: (t, u) =>
        still
          ? `opacity: ${t}`
          : `opacity: ${t}; transform: translateX(calc(var(--pop-rise) * ${u}));`,
    };
  }
</script>

<svelte:window onkeydown={escapeExpanded} />

<!-- Opening or closing in front of the reader grows one side into the
     other: the split's size change is the information. Opening decelerates
     into place on the drawer curve; closing is a morph on --ease-in-out.
     Any other size — a drag, a pane sized off screen — is taken at once. -->
<div
  data-slot="side-split"
  data-split-expanded={expanded || undefined}
  data-split-open={open || undefined}
  data-split-opening={(sliding && open) || undefined}
  data-split-resizing={resizing || undefined}
  data-split-sliding={sliding || undefined}
  class="group/split flex min-h-0 min-w-0 flex-1"
  onkeydowncapture={handleKey}
  role="presentation"
  bind:this={root}
  {@attach measureSplit}
>
  <Resizable.PaneGroup direction="horizontal">
    <!-- Dragged past its narrowest, the page collapses to nothing
         (expanded); dragged back out of the edge it stands at its
         narrowest, then follows the pointer. Collapsed, it is put away:
         nothing in it takes a press or the keyboard. -->
    <Resizable.Pane
      data-main-pane
      data-opening={(sliding && open) || undefined}
      data-sliding={sliding || undefined}
      collapsedSize={0}
      collapsible
      defaultSize={100 - sideSize}
      inert={expanded}
      look="split"
      minSize={MAIN_MIN}
    >
      {@render main()}
    </Resizable.Pane>
    <!-- Expanded, the handle stays on the far edge: it is how the page is
         dragged back out. Expanded, the handle stands on the page area's
         edge, where the sidebar's own grip (Shell.svelte `.grip`, 6px over
         the edge) takes the pointer: its hit area stands just inside the
         surface instead, past the grip, so the page can be dragged back
         out. -->
    <Resizable.Handle
      data-expanded={expanded || undefined}
      data-side-divider={open || !open || undefined}
      data-hidden={!open || undefined}
      class="z-2"
      look="split"
      onDraggingChange={(dragging) => {
        resizing = dragging;
        if (dragging) {
          dragFrom = savedWidth;
        } else if (expandAsked) {
          // A drag that ends at the edge was never a width: going back
          // gives the one it started from.
          keepWidth(dragFrom);
        }
      }}
    />
    <Resizable.Pane
      data-opening={(sliding && open) || undefined}
      data-side-pane
      data-sliding={sliding || undefined}
      collapsedSize={0}
      collapsible
      defaultSize={sideSize}
      look="split"
      maxSize={100}
      minSize={Math.min(SIDE_MAX, sideMin ?? MAIN_MIN)}
      onResize={(size) => {
        share = size;
        laidShare = size;
        // Collapsed by the reader's hand (End, or the handle to the near edge)
        // is a size like any other; collapsed by the split (it closes, or
        // opens from nothing) is none of theirs.
        const byHand = resizing || keyed;
        if (collapseAgain && size > 0) {
          collapseAgain = false;
          queueMicrotask(() => sidePane?.collapse());
          return;
        }
        if (!(open && fits && (size > 0 || byHand))) {
          return;
        }
        // At the far edge the surface is expanded, however it got there.
        if (size >= WHOLE) {
          if (!expandAsked) {
            setExpanded(true);
          }
          return;
        }
        // Off the edge it is not: dragged back out, Back, or collapsed. End
        // from the far edge lands here in one step, with no size between;
        // the pointer passes through them, and both end the expansion here.
        if (expandAsked) {
          collapseAgain = size === 0 && keyed;
          setExpanded(false);
        }
        if (size === 0) {
          return;
        }
        // The reader's width is kept; the floor holding it up in a narrow
        // split is not, so a wider one opens at the width they chose.
        if (resizing || size > (sideMin ?? 0) + 0.01) {
          keepWidth(size);
        }
      }}
      bind:this={sidePane}
    >
      {#if mounted}
        <!-- Expanded, the card meets the split's edges (SideSurface), so the
             page is drawn at the full width; its inset goes on the slide's
             clock. -->
        <div
          data-split-shown={open || undefined}
          hidden={squeezed}
          class="w-full min-w-c-side-surface-min p-space-3 opacity-0 transform-(--surface-off) transition-[opacity] duration-(--dur-panel) ease-out group-data-split-expanded/split:p-0 motion-safe:transition-[opacity,transform] motion-safe:duration-(--dur-panel) data-split-shown:opacity-100 data-split-shown:transform-(--surface-on) data-split-shown:ease-out motion-safe:in-data-split-sliding:data-split-shown:transition-split-surface"
          style:--surface-off="translateX(var(--space-7))"
          style:--surface-on="translateX(0)"
          in:surfaceIn
          {@attach landKey
            ? land(() => landKey, {
                mode: "clip",
                ms: dur("--dur-panel"),
              })
            : undefined}
        >
          {@render side()}
        </div>
      {/if}
    </Resizable.Pane>
  </Resizable.PaneGroup>
  {@render after?.()}
</div>
