<script lang="ts">
  /**
   * A conversation and the surface beside it (PRD §5.2): the transcript in
   * one side of a resizable split, and on the other, inset on the preview
   * sheet's recipe, what the conversation has to show — its plan, its
   * preview, or both under a switch. On a desk it is the split. Under 900px
   * each rises on its own: the preview as a sheet standing on the composer
   * (SideSheet), so the reader can write while it is up; the plan as the
   * house bottom sheet (the kit Drawer), from the screen's foot over the
   * composer, as tall as what it holds. A session and a thread (whose plan
   * is its project's lead's) draw it alike.
   *
   * The split opens when there is something to show and the reader or the
   * agent asked for it: an agent showing a preview opens it on Preview, the
   * plan's ring (`openPlan`) opens it on Plan. Each pane closes its own
   * content; with nothing left the split collapses. Its width is the
   * conversation's own, kept across visits.
   *
   * On a desk the surface can take the whole split, in place, so a page is
   * drawn at the full width: the handle dragged past the conversation's
   * narrowest collapses it to nothing, and the head's Expand (expand.ts)
   * moves the handle there. Both are one state, expanded. Back to
   * conversation, Esc once the pane's own Esc has nothing left to close, or
   * the handle dragged back out gives the split back: at the last width
   * beside it, or from the conversation's narrowest under the pointer.
   * Expanded is the conversation's own too, kept beside its width; closing
   * the surface ends it.
   *
   * Motion is the preview's, as it was: opening or closing in front of the
   * reader grows one side into the other (`sliding`); a preview opening out
   * of its tool row clips open from the row (`preview:<id>`); a split sized
   * off screen takes its size at once.
   */
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Resizable from "#lib/components/ui/resizable/index.js";
  import { cawco } from "../client.svelte";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { waiting as departing, land } from "../motion/share.svelte";
  import PlanPane, { planShows } from "../plan/PlanPane.svelte";
  import PreviewPane from "../preview/PreviewPane.svelte";
  import RegionBoundary from "../RegionBoundary.svelte";
  import { setSideExpand } from "./expand";
  import SideSheet from "./SideSheet.svelte";

  let {
    viewId,
    planOf,
    previewOf,
    visible,
    active,
    phone,
    share = $bindable(0),
    side,
    sideOpen = false,
    onsideclose,
    children,
  }: {
    /** The conversation: its preview, and the key its width is kept under. */
    viewId: string;
    /** The session whose plan shows here; null when the conversation has none. */
    planOf: string | null;
    /**
     * The session whose preview shows here, when it is not the conversation
     * itself: a thread shows its project's lead's (his setup page).
     */
    previewOf?: string | null;
    /**
     * The conversation is its group's active tab. A phone's sheet is laid
     * over the whole screen, outside the pane, so only the active tab's
     * stands there; a neighbour the swipe strip keeps shown has none.
     */
    active: boolean;
    visible: boolean;
    /** Under 900px: the surface is a sheet, not a split. */
    phone: boolean;
    /** The surface's share of the width, in percent: 0 while closed or a sheet. */
    share?: number;
    /**
     * A page's own surface in place of the plan and preview (a project's
     * Caw dock): drawn in the split on a desk, in the kit's bottom sheet
     * under 900px (`true`: in the sheet). Open while `sideOpen`; the sheet
     * dismissed says so through `onsideclose`.
     */
    side?: Snippet<[boolean]>;
    sideOpen?: boolean;
    onsideclose?: () => void;
    /** The transcript's side. */
    children: Snippet;
  } = $props();

  let root = $state<HTMLDivElement>();
  let width = $state(0);
  /** The preview on show, for the sheet's Escape (its Comment mode and card). */
  let previewPane = $state<ReturnType<typeof PreviewPane>>();
  let sidePane = $state<ReturnType<typeof Resizable.Pane>>();
  /** The conversation's own width for the surface, in percent: read untracked. */
  let savedWidth = 45;
  let resizing = $state(false);
  /** The kept width when the handle was taken: a drag that ends expanded gives it back. */
  let dragFrom = 45;
  /**
   * The conversation's narrowest share beside the surface. Dragged past it,
   * the conversation collapses to nothing: the surface is expanded.
   */
  const CONVERSATION_MIN = 30;
  /** The surface's widest share beside the conversation. */
  const SIDE_MAX = 100 - CONVERSATION_MIN;
  /** The surface's share at the far edge: the whole split. */
  const WHOLE = 99.99;
  /**
   * The divider's width (the kit handle's `w-px`): the panes share what is
   * left of the split beside it, so their percentages are of that.
   */
  const DIVIDER = 1;
  /** The surface's floor, 320px, as a share of the panes' room; null until measured. */
  const sideMin = $derived(
    width > DIVIDER ? (320 / (width - DIVIDER)) * 100 : null
  );
  /** The split can hold the surface at its floor. */
  const fits = $derived(sideMin !== null && sideMin <= SIDE_MAX);

  // --- what the surface holds --------------------------------------------------

  const previewId = $derived(previewOf ?? viewId);
  const previewOpen = $derived(cawco.previews[previewId]?.state === "open");
  const plan = $derived(planOf ? cawco.planOf(planOf) : undefined);
  const hasPlan = $derived(planShows(plan));
  /** The reader asked for the plan (its ring) and has not closed it. */
  let planAsked = $state(false);
  const planOpen = $derived(planAsked && hasPlan);
  const open = $derived(side ? sideOpen : previewOpen || planOpen);
  let tab = $state<"plan" | "preview">("plan");
  /** The one on show: the one chosen while both are there, else the one there is. */
  const shown = $derived.by((): "plan" | "preview" => {
    if (previewOpen && planOpen) {
      return tab;
    }
    return previewOpen ? "preview" : "plan";
  });
  // An agent showing a preview brings it to the front.
  let previewWas = untrack(() => previewOpen);
  $effect(() => {
    const now = previewOpen;
    if (now && !previewWas) {
      tab = "preview";
    }
    previewWas = now;
  });

  /** Opens the surface on the plan: the plan's ring. */
  export function openPlan(): void {
    planAsked = true;
    tab = "plan";
  }

  /** The plan is on show beside the conversation (its ring is pressed). */
  export function planShowing(): boolean {
    return planOpen && (phone || shown === "plan");
  }

  // --- the split ---------------------------------------------------------------

  /**
   * The surface beside the transcript, on screen or not. A pane going off
   * screen keeps its split: collapsing it there and opening it again on the
   * way back narrowed the transcript, the surface and the group's composer
   * over 300ms on every visit.
   */
  const desktopOpen = $derived(open && !phone);
  /**
   * The surface has the whole split, by Expand or by the handle dragged to
   * the far edge: one state, kept per conversation beside its width. Read
   * as the split is made, so its first layout is the kept one.
   */
  let expandAsked = $state(
    typeof localStorage !== "undefined" &&
      localStorage.getItem(
        `cawco.preview.expanded.${untrack(() => viewId)}`
      ) === "1"
  );
  /** The surface has the whole split: asked, and on a desk with it open. */
  const expanded = $derived(expandAsked && desktopOpen && fits);
  /** The last width beside the conversation, kept for the next visit and for going back. */
  function keepWidth(size: number): void {
    savedWidth = size;
    localStorage.setItem(`cawco.preview.width.${viewId}`, String(size));
  }
  function setExpanded(next: boolean): void {
    expandAsked = next;
    const key = `cawco.preview.expanded.${viewId}`;
    if (next) {
      localStorage.setItem(key, "1");
    } else {
      localStorage.removeItem(key);
    }
  }
  setSideExpand({
    get available() {
      return desktopOpen && fits;
    },
    get expanded() {
      return expanded;
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
  // conversation. Only a close counts; a page still reading its previews
  // after a reload has not closed anything.
  let openWas = untrack(() => open);
  $effect(() => {
    const now = open;
    if (openWas && !now && untrack(() => expandAsked)) {
      setExpanded(false);
    }
    openWas = now;
  });
  /**
   * Esc puts the expansion away, after the preview's own Esc: an open pin
   * card closes first, then Comment mode (PreviewPane `parentEscape`, which
   * marks the key as used). Heard from this conversation's own split, or
   * with nothing focused; a key in another group's pane is that one's.
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
    previewPane?.parentEscape(event);
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
   * The surface's share while it is open: the conversation's own width, held
   * to the 320px floor and the conversation's narrowest, or all of it while
   * expanded.
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
    if (!(desktopOpen && fits && sideMin !== null)) {
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
  let mounted = $state(false);
  /** A preview opening out of its tool row: the surface clips open from it. */
  let fromRow = $state(false);
  let sheetMounted = $state(false);
  $effect(() => {
    if (phone && previewOpen && visible && active) {
      sheetMounted = true;
      return;
    }
    const timer = setTimeout(
      () => {
        sheetMounted = false;
      },
      motionOk.current ? dur("--dur-panel") : 1
    );
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const id = viewId;
    const stored = Number(localStorage.getItem(`cawco.preview.width.${id}`));
    savedWidth = stored > 0 ? Math.min(SIDE_MAX, stored) : 45;
    expandAsked = localStorage.getItem(`cawco.preview.expanded.${id}`) === "1";
  });
  $effect(() => {
    const opening = desktopOpen && fits;
    // Expanding or going back is a change of size in front of the reader: it
    // slides as opening does.
    const full = expanded;
    const pane = sidePane;
    // The handle reaching the edge or leaving it is the drag's own size:
    // nothing slides under the pointer.
    if (!pane || untrack(() => resizing)) {
      return;
    }
    if (opening) {
      fromRow = untrack(() => !mounted) && departing(`preview:${viewId}`);
      mounted = true;
    }
    const snapped = snapNext;
    snapNext = false;
    const seen =
      untrack(() => visible && !fromRow) && motionOk.current && !snapped;
    sliding = seen;
    let settle = 0;
    let gone = false;
    // The size is this conversation's own, held to the floor (`sideSize`):
    // paneforge refuses a resize under a pane's `minSize` outright rather
    // than clamping it, so the size asked for is one it takes.
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
   * The surface mounting already open slides 25px in from the edge it opens
   * against and fades up (--dur-panel, --ease-out), the same move its class
   * transition makes when it opens later. Reduced motion keeps the fade.
   */
  function surfaceIn(_node: Element): TransitionConfig {
    if (!desktopOpen || fromRow) {
      return { duration: 0 };
    }
    const still = !motionOk.current;
    return {
      duration: dur("--dur-panel"),
      easing: easeOut,
      css: (t, u) =>
        still
          ? `opacity: ${t}`
          : `opacity: ${t}; transform: translateX(${u * 25}px);`,
    };
  }
</script>

<!-- The Plan | Preview switch, while both have something to show. -->
{#snippet switcher()}
  <Tabs
    onValueChange={(next) => {
      tab = next as "plan" | "preview";
    }}
    size="compact"
    value={shown}
  >
    <TabsList aria-label="Beside the conversation">
      <TabItem label="Plan" value="plan" />
      <TabItem label="Preview" value="preview" />
    </TabsList>
  </Tabs>
{/snippet}

{#snippet surface()}
  {#if side}
    {@render side(false)}
  {:else if shown === "plan" && planOf && planOpen}
    <PlanPane
      instanceId={planOf}
      onclose={() => {
        planAsked = false;
      }}
      switcher={previewOpen ? switcher : undefined}
    />
  {:else if previewOpen}
    <PreviewPane
      instanceId={previewId}
      linkSession={previewId !== viewId}
      switcher={planOpen ? switcher : undefined}
      bind:this={previewPane}
    />
  {/if}
{/snippet}

<svelte:window onkeydown={escapeExpanded} />

<div
  class={["side-split", { expanded, open: desktopOpen, resizing, sliding }]}
  bind:this={root}
  bind:clientWidth={width}
>
  <Resizable.PaneGroup class="side-group" direction="horizontal">
    <!-- Dragged past its narrowest, the conversation collapses to nothing
         (expanded); dragged back out of the edge it stands at its
         narrowest, then follows the pointer. Collapsed, it is put away:
         nothing in it takes a press or the keyboard. -->
    <Resizable.Pane
      class="transcript-pane"
      collapsedSize={0}
      collapsible
      defaultSize={100 - sideSize}
      inert={expanded}
      minSize={CONVERSATION_MIN}
    >
      {@render children()}
    </Resizable.Pane>
    <!-- Expanded, the handle stays on the far edge: it is how the
         conversation is dragged back out. -->
    <Resizable.Handle
      class={desktopOpen ? "side-divider" : "side-divider hidden"}
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
      class="side-pane"
      collapsedSize={0}
      collapsible
      defaultSize={sideSize}
      maxSize={100}
      minSize={Math.min(SIDE_MAX, sideMin ?? CONVERSATION_MIN)}
      onResize={(size) => {
        share = size;
        if (!(size > 0 && desktopOpen && fits)) {
          return;
        }
        // At the far edge the surface is expanded, however it got there.
        if (size >= WHOLE) {
          if (!expandAsked) {
            setExpanded(true);
          }
          return;
        }
        // Off the edge it is not: dragged back out, or Back to conversation.
        if (expandAsked) {
          setExpanded(false);
        }
        // The reader's width is kept; the floor holding it up in a narrow
        // split is not, so a wider one opens at the width they chose.
        if (resizing || size > (sideMin ?? 0) + 0.01) {
          keepWidth(size);
        }
      }}
      bind:this={sidePane}
    >
      {#if mounted && !phone}
        <div
          class="side-surface"
          class:shown={desktopOpen}
          in:surfaceIn
          {@attach land(() => `preview:${viewId}`, {
            mode: "clip",
            ms: dur("--dur-panel"),
          })}
        >
          <RegionBoundary region="side panel">
            {@render surface()}
          </RegionBoundary>
        </div>
      {/if}
    </Resizable.Pane>
  </Resizable.PaneGroup>
  {#if sheetMounted && phone && visible && active}
    <SideSheet
      content={root}
      instanceId={previewId}
      onkeyescape={(event) => previewPane?.parentEscape(event)}
      open={previewOpen}
    >
      <RegionBoundary region="preview">
        <PreviewPane
          instanceId={previewId}
          linkSession={previewId !== viewId}
          sheet
          bind:this={previewPane}
        />
      </RegionBoundary>
    </SideSheet>
  {/if}
  {#if side && phone && visible && active}
    <Drawer.Root
      onOpenChange={(next) => {
        if (!next) {
          onsideclose?.();
        }
      }}
      open={sideOpen}
    >
      <Drawer.Content class="side-sheet">
        <RegionBoundary region="side sheet">
          {@render side(true)}
        </RegionBoundary>
      </Drawer.Content>
    </Drawer.Root>
  {/if}
  {#if phone && visible && active && planOf && hasPlan}
    <Drawer.Root
      onOpenChange={(next) => {
        planAsked = next;
      }}
      open={planAsked}
    >
      <Drawer.Content class="plan-sheet">
        <RegionBoundary region="plan">
          <PlanPane
            instanceId={planOf}
            onclose={() => {
              planAsked = false;
            }}
            sheet
          />
        </RegionBoundary>
      </Drawer.Content>
    </Drawer.Root>
  {/if}
</div>

<style>
  .side-split {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .side-split :global(.transcript-pane),
  .side-split :global(.side-pane) {
    display: flex;
    min-width: 0;
    min-height: 0;
  }
  /* Opening or closing in front of the reader grows one side into the
     other: the split's size change is the information. Opening decelerates
     into place on the drawer curve; closing is a morph on --ease-in-out.
     Any other size — a drag, a pane sized off screen — is taken at once. */
  @media (prefers-reduced-motion: no-preference) {
    .sliding :global(.transcript-pane),
    .sliding :global(.side-pane) {
      transition: flex-grow var(--dur-panel) var(--ease-in-out);
    }
    .sliding.open :global(.transcript-pane),
    .sliding.open :global(.side-pane) {
      transition-timing-function: var(--ease-drawer);
    }
  }
  .side-surface {
    width: 100%;
    min-width: 320px;
    padding: var(--space-3);
    opacity: 0;
    transform: translateX(var(--space-7));
    transition: opacity var(--dur-panel) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) {
      transition:
        opacity var(--dur-panel) var(--ease-out),
        transform var(--dur-panel) var(--ease-out);
    }
  }
  .side-surface.shown {
    opacity: 1;
    transform: translateX(0);
    transition-timing-function: var(--ease-out);
  }
  /* Expanded, the card meets the split's edges (SideSurface), so the page
     is drawn at the full width; its inset goes on the slide's clock. */
  .expanded .side-surface {
    padding: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    .sliding .side-surface.shown {
      transition:
        opacity var(--dur-panel) var(--ease-out),
        transform var(--dur-panel) var(--ease-out),
        padding var(--dur-panel) var(--ease-drawer);
    }
  }
  .side-split :global(.side-divider) {
    z-index: 2;
    background: var(--border-hairline);
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .side-split :global(.side-divider.hidden) {
    display: none;
  }
  /* Expanded, the handle stands on the session area's edge, where the
     sidebar's own grip (Shell.svelte `.grip`, 6px over the edge) takes the
     pointer: its hit area stands just inside the surface instead, past the
     grip, so the conversation can be dragged back out. */
  .expanded :global(.side-divider::after) {
    left: var(--space-1);
    width: 6px;
    transform: none;
  }
  .resizing :global(iframe) {
    pointer-events: none;
  }
  .side-split :global(.side-divider[data-active]) {
    background: var(--ink-muted);
  }
  @media (hover: hover) {
    .side-split :global(.side-divider:hover) {
      background: var(--border-control);
    }
  }
</style>
