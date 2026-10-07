<script lang="ts">
  /**
   * A conversation and the surface beside it (PRD §5.2): the transcript in
   * one side of a resizable split, and on the other, inset on the preview
   * sheet's recipe, what the conversation has to show — its plan, its
   * preview, or both under a switch. On a desk it is the split; under 900px
   * the same surface rises as a sheet over the transcript. A session and a
   * thread (whose plan is its project's lead's) draw it alike.
   *
   * The split opens when there is something to show and the reader or the
   * agent asked for it: an agent showing a preview opens it on Preview, the
   * plan's ring (`openPlan`) opens it on Plan. Each pane closes its own
   * content; with nothing left the split collapses. Its width is the
   * conversation's own, kept across visits.
   *
   * Motion is the preview's, as it was: opening or closing in front of the
   * reader grows one side into the other (`sliding`); a preview opening out
   * of its tool row clips open from the row (`preview:<id>`); a split sized
   * off screen takes its size at once.
   */
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
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
  import type { CapturedSelection } from "../preview/selection";
  import SideSheet from "./SideSheet.svelte";

  let {
    viewId,
    planOf,
    visible,
    phone,
    onselect,
    onescape,
    share = $bindable(0),
    children,
  }: {
    /** The conversation: its preview, and the key its width is kept under. */
    viewId: string;
    /** The session whose plan shows here; null when the conversation has none. */
    planOf: string | null;
    visible: boolean;
    /** Under 900px: the surface is a sheet, not a split. */
    phone: boolean;
    onselect: (
      selection: CapturedSelection
    ) => "added" | "duplicate" | "full" | undefined;
    onescape: () => boolean;
    /** The surface's share of the width, in percent: 0 while closed or a sheet. */
    share?: number;
    /** The transcript's side. */
    children: Snippet;
  } = $props();

  let root = $state<HTMLDivElement>();
  let width = $state(0);
  /** The preview on show, for the sheet's Escape (its selection mode). */
  let previewPane = $state<ReturnType<typeof PreviewPane>>();
  let sidePane = $state<ReturnType<typeof Resizable.Pane>>();
  let savedWidth = 45;
  let resizing = $state(false);

  // --- what the surface holds --------------------------------------------------

  const previewOpen = $derived(cawco.previews[viewId]?.state === "open");
  const plan = $derived(planOf ? cawco.planOf(planOf) : undefined);
  const hasPlan = $derived(planShows(plan));
  /** The reader asked for the plan (its ring) and has not closed it. */
  let planAsked = $state(false);
  const planOpen = $derived(planAsked && hasPlan);
  const open = $derived(previewOpen || planOpen);
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
    return open && shown === "plan";
  }

  // --- the split ---------------------------------------------------------------

  /**
   * The surface beside the transcript, on screen or not. A pane going off
   * screen keeps its split: collapsing it there and opening it again on the
   * way back narrowed the transcript, the surface and the group's composer
   * over 300ms on every visit.
   */
  const desktopOpen = $derived(open && !phone);
  /** The split is sliding: the reader is watching it open or close. */
  let sliding = $state(false);
  let mounted = $state(false);
  /** A preview opening out of its tool row: the surface clips open from it. */
  let fromRow = $state(false);
  let sheetMounted = $state(false);
  $effect(() => {
    if (phone && open && visible) {
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
    savedWidth = stored > 0 ? Math.min(70, stored) : 45;
  });
  $effect(() => {
    const opening = desktopOpen;
    const pane = sidePane;
    if (!pane) {
      return;
    }
    if (opening) {
      fromRow = untrack(() => !mounted) && departing(`preview:${viewId}`);
      mounted = true;
    }
    const seen = untrack(() => visible && !fromRow) && motionOk.current;
    sliding = seen;
    let settle = 0;
    // The size is this conversation's own (`savedWidth`); the split's
    // `minSize` holds the surface to its 320px floor.
    const frame = requestAnimationFrame(() => {
      if (opening) {
        pane.resize(savedWidth);
      } else {
        pane.collapse();
      }
      settle = requestAnimationFrame(() => {
        fromRow = false;
      });
    });
    const slid = seen
      ? setTimeout(() => {
          sliding = false;
        }, 300)
      : undefined;
    const timer = opening
      ? undefined
      : setTimeout(
          () => {
            mounted = false;
          },
          motionOk.current ? dur("--dur-panel") : 1
        );
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settle);
      clearTimeout(slid);
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
  {#if shown === "plan" && planOf && planOpen}
    <PlanPane
      instanceId={planOf}
      onclose={() => {
        planAsked = false;
      }}
      switcher={previewOpen ? switcher : undefined}
    />
  {:else if previewOpen}
    <PreviewPane
      instanceId={viewId}
      {onescape}
      {onselect}
      switcher={planOpen ? switcher : undefined}
      bind:this={previewPane}
    />
  {/if}
{/snippet}

<div
  class="side-split"
  bind:this={root}
  class:open={desktopOpen}
  class:resizing={resizing}
  class:sliding={sliding}
  bind:clientWidth={width}
>
  <Resizable.PaneGroup class="side-group" direction="horizontal">
    <Resizable.Pane class="transcript-pane" defaultSize={100} minSize={30}>
      {@render children()}
    </Resizable.Pane>
    <Resizable.Handle
      class={desktopOpen ? "side-divider" : "side-divider hidden"}
      onDraggingChange={(dragging) => {
        resizing = dragging;
      }}
    />
    <Resizable.Pane
      class="side-pane"
      collapsedSize={0}
      collapsible
      defaultSize={0}
      maxSize={70}
      minSize={width ? Math.min(70, (320 / width) * 100) : 30}
      onResize={(size) => {
        share = size;
        if (size > 0 && desktopOpen) {
          savedWidth = size;
          localStorage.setItem(`cawco.preview.width.${viewId}`, String(size));
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
          {@render surface()}
        </div>
      {/if}
    </Resizable.Pane>
  </Resizable.PaneGroup>
  {#if sheetMounted && phone && visible}
    <SideSheet
      content={root}
      instanceId={viewId}
      onkeyescape={(event) => previewPane?.parentEscape(event)}
      {open}
    >
      {@render surface()}
    </SideSheet>
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
  .side-split :global(.side-divider) {
    z-index: 2;
    background: var(--border-hairline);
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .side-split :global(.side-divider.hidden) {
    display: none;
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
