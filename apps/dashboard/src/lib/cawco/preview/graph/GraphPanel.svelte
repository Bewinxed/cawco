<script lang="ts">
  /**
   * The design graph's panel over a component canvas's page (Projects spec
   * §5.10, "The design graph"): a tab per component under review, its
   * graph (StateGraph), the graph's zoom and Hide. On a pane at least twice
   * its width it floats at the page's inline end, the house floating panel
   * (the raised surface, the control edge, the hung overlay's cast, the
   * panel radius); on a narrower pane it is a drawer across the page's foot.
   * Hide and Show are one object (pin 29, The One Object Rule): Hide folds
   * the panel into its own Show pill, its contents fading as it goes, and
   * Show opens the pill back into the panel, on one clip that turns back
   * from where it stands. It tells the page the room it takes, so the
   * component stands clear of it and never moves when it folds.
   */
  import { sheetWords } from "@cawco/core";
  import { untrack } from "svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconEye, IconEyeClosed, IconFit, IconZoomIn, IconZoomOut } from "#lib/icons.js";
  import type { DesignGraph } from "./design-graph.svelte";
  import StateGraph from "./StateGraph.svelte";

  let {
    end = false,
    graph,
  }: {
    /** The sheet's inspector stands beside the page: the graph stands clear of it, as the page does. */
    end?: boolean;
    graph: DesignGraph;
  } = $props();

  let host = $state<HTMLElement>();
  let hostWidth = $state(0);
  let hostHeight = $state(0);
  let panel = $state<HTMLElement>();
  let panelHeight = $state(0);
  let hide = $state<HTMLButtonElement>();
  let hideWords = $state<HTMLElement>();
  let zoom = $state(1);
  let stateGraph = $state<ReturnType<typeof StateGraph>>();

  /** A pane at least twice the panel's width holds it beside the page; a narrower one as a drawer at its foot. */
  const desk = $derived(
    hostWidth > 0 && hostWidth >= 2 * numberOf("--c-graph-panel-w")
  );
  /** How far the panel stands in from the pane's edges. */
  const inset = $derived(numberOf(desk ? "--space-3" : "--space-2"));
  /** The drawer's height while open: its stop, never past most of the pane. */
  const drawerHeight = $derived(
    Math.round(
      Math.min(
        numberOf("--c-graph-drawer-stop") || 0,
        hostHeight * 0.6,
        hostHeight - inset
      )
    )
  );

  // The room it takes, said to the page: a desk's panel its width at the inline end whether folded or not (the
  // component never moves as it folds); a drawer its height at the foot, its head's alone when folded.
  $effect(() => {
    if (!panel || hostWidth === 0) {
      return;
    }
    const end = desk ? panel.offsetWidth + 2 * inset : 0;
    const bottom = desk ? 0 : panelHeight;
    untrack(() => graph.room(end, bottom));
  });

  /**
   * The pill the panel folds into: the Hide button's box once it has grown
   * into Show graph (its words' width added), as a clip of the panel's
   * border box. Set before the fold starts, so the clip runs to where the
   * pill will stand.
   */
  let pillClip = $state("");
  function measurePill(): void {
    if (!(panel && hide && hideWords)) {
      return;
    }
    const p = panel.getBoundingClientRect();
    const b = hide.getBoundingClientRect();
    // Grown: its edges, the pill's inset either side, the eye, the gap and its words.
    const grown =
      2 +
      numberOf("--space-3") * 2 +
      numberOf("--icon-md") +
      numberOf("--space-2") +
      hideWords.scrollWidth;
    const top = b.top - p.top;
    const right = p.right - b.right;
    const bottom = p.bottom - b.bottom;
    const left = Math.max(0, b.right - grown - p.left);
    pillClip = `inset(${top}px ${right}px ${bottom}px ${left}px round var(--radius-md))`;
  }
  function toggle(): void {
    if (graph.open) {
      measurePill();
    }
    graph.open = !graph.open;
  }

  const sections = $derived(graph.model?.sections ?? []);
  const zoomLabel = $derived(`${Math.round(zoom * 100)}%`);
</script>

<div
  bind:this={host}
  bind:clientWidth={hostWidth}
  bind:clientHeight={hostHeight}
  class="pointer-events-none absolute inset-0 z-(--layer-dock) overflow-hidden data-end:end-(--c-sheet-inspector-w)"
  data-design-graph-host
  data-end={end || undefined}
>
  {#if graph.section && graph.graph}
    <aside
      bind:this={panel}
      bind:clientHeight={panelHeight}
      aria-label={sheetWords.graph}
      class="panel pointer-events-auto absolute flex flex-col border border-border-control bg-surface-raised p-space-2 text-ink-strong shadow-overlay-hung"
      class:desk
      class:drawer={!desk}
      data-graph-panel={desk ? "desk" : "drawer"}
      data-open={graph.open}
      style:--pill-clip={pillClip || undefined}
      style:--inset={`${inset}px`}
      style:--drawer-h={`${drawerHeight}px`}
    >
      <div class="toolbar mb-space-2 flex flex-wrap items-center gap-space-2">
        {#if sections.length > 1}
          <div class="fades min-w-0 flex-[1_1_auto]">
            <Tabs
              onValueChange={(file) => graph.show(file)}
              size="compact"
              value={graph.file ?? undefined}
            >
              <TabsList aria-label={sheetWords.graphComponents}>
                {#each sections as section (section.file)}
                  <TabItem label={section.name} value={section.file} />
                {/each}
              </TabsList>
            </Tabs>
          </div>
        {/if}
        <div class="bar-end relative ms-auto flex flex-none items-center gap-space-1">
          <div
            aria-label={sheetWords.graphZoom}
            class="fades flex items-center gap-space-row rounded-sm border border-border-control bg-surface-raised p-[calc(var(--radius-sm)-var(--radius-xs)-1px)]"
            role="group"
          >
            <button
              aria-label={sheetWords.zoomOut}
              class="zoom-button"
              onclick={() => stateGraph?.zoomBy(1 / 1.2)}
              title={sheetWords.zoomOutTip}
              type="button"><IconZoomOut /></button
            >
            <output
              aria-live="polite"
              class="min-w-[4ch] text-center type-code tabular-nums text-ink-strong"
              data-zoom-level>{zoomLabel}</output
            >
            <button
              aria-label={sheetWords.zoomIn}
              class="zoom-button"
              onclick={() => stateGraph?.zoomBy(1.2)}
              title={sheetWords.zoomInTip}
              type="button"><IconZoomIn /></button
            >
            <button
              aria-label={sheetWords.zoomFit}
              class="zoom-button"
              onclick={() => stateGraph?.fit()}
              title={sheetWords.zoomFit}
              type="button"><IconFit /></button
            >
          </div>
          <!-- Hide, which is Show once folded: the panel folds into this button and opens back out of it. -->
          <button
            bind:this={hide}
            aria-expanded={graph.open}
            aria-label={graph.open ? sheetWords.hideGraph : sheetWords.showGraph}
            class="hide touch-hit"
            data-hide-graph
            onclick={toggle}
            title={graph.open ? sheetWords.hideGraph : sheetWords.showGraph}
            type="button"
          >
            <span class="glyph closed" aria-hidden="true"><IconEyeClosed /></span>
            <span class="glyph opened" aria-hidden="true"><IconEye /></span>
            <span bind:this={hideWords} class="words">{sheetWords.showGraph}</span>
          </button>
        </div>
      </div>
      <div class="body flex min-h-0 flex-1 flex-col">
        {#if graph.section.state === "waiting" && graph.section.stories.length === 0}
          <p class="m-0 p-space-3 type-meta text-ink-muted" role="status">
            {sheetWords.graphWaiting}
          </p>
        {:else if graph.section.state === "failed"}
          <p class="m-0 p-space-3 type-body text-status-fail-ink text-pretty" role="status">
            {sheetWords.graphFailed}
          </p>
        {:else}
          <StateGraph
            bind:this={stateGraph}
            bind:zoom
            file={graph.section.file}
            graph={graph.graph}
            kept={graph.keptHere}
            onkeep={(point) => graph.keepAt(point)}
            onpreview={(point) => graph.preview(point)}
            peek={graph.peek}
            sectionName={graph.section.name}
          />
        {/if}
      </div>
    </aside>
  {/if}
</div>

<style>
  /* The desk's panel: at the page's inline end, the panel width (less where the pane is narrow), as tall as its graph
     up to the pane's height. */
  .panel.desk {
    inset-block-start: var(--inset);
    inset-inline-end: var(--inset);
    inline-size: min(var(--c-graph-panel-w), calc(100% - 2 * var(--inset)));
    max-block-size: calc(100% - 2 * var(--inset));
    border-radius: var(--radius-panel);
  }
  /* The drawer: across the page's foot, its stop's height, its top corners the panel's. Folded, its head alone. */
  .panel.drawer {
    inset-inline: 0;
    inset-block-end: 0;
    block-size: var(--drawer-h);
    border-inline: 0;
    border-block-end: 0;
    border-start-start-radius: var(--radius-panel);
    border-start-end-radius: var(--radius-panel);
  }
  .panel.drawer[data-open="false"] {
    block-size: auto;
  }
  .panel.drawer[data-open="false"] .body {
    display: none;
  }
  .panel.drawer[data-open="false"] .toolbar {
    margin-block-end: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    .panel.drawer {
      transition: block-size var(--dur-panel) var(--ease-drawer);
    }
  }

  /* The zoom group's buttons: 24px items, their glyph at the small icon size. */
  .zoom-button {
    all: unset;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    inline-size: var(--c-btn-h-xs);
    block-size: var(--c-btn-h-xs);
    border-radius: var(--radius-xs);
    color: var(--ink-row);
    cursor: pointer;
    transition: var(--transition-control);

    & :global(svg) {
      inline-size: var(--icon-sm);
      block-size: var(--icon-sm);
    }
    @media (hover: hover) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    &:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-inset);
    }
  }

  /* Hide: the kit's sm icon button (30px, the input's radius, the button outline), its glyph at the md icon size; folded,
     its words unfold beside the eye and it is the Show graph pill. It stands over a reserved slot at the bar's end, so its
     growing moves nothing. */
  .bar-end {
    min-block-size: var(--c-btn-h-sm);
    padding-inline-end: calc(var(--c-btn-h-sm) + var(--space-1));
  }
  .hide {
    all: unset;
    box-sizing: border-box;
    position: absolute;
    inset-inline-end: 0;
    inset-block: 0;
    margin-block: auto;
    display: inline grid;
    grid-template-columns: var(--icon-md) 0fr;
    column-gap: 0;
    align-items: center;
    justify-items: start;
    block-size: var(--c-btn-h-sm);
    min-inline-size: var(--c-btn-h-sm);
    padding-inline: calc((var(--c-btn-h-sm) - var(--icon-md)) / 2 - 1px);
    border: 1px solid var(--border-button-outline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    color: var(--ink-row);
    white-space: nowrap;
    cursor: pointer;
    pointer-events: auto;
    transition:
      var(--transition-control),
      grid-template-columns var(--dur-exit) var(--ease-out),
      column-gap var(--dur-exit) var(--ease-out),
      padding var(--dur-exit) var(--ease-out);

    @media (hover: hover) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    &:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-offset);
    }
  }
  .glyph {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    transition:
      opacity var(--dur-control) var(--ease-out),
      scale var(--dur-control) var(--ease-out),
      filter var(--dur-control) var(--ease-out);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  .glyph.opened {
    opacity: 0;
    scale: var(--pop-scale);
    filter: blur(var(--c-recall-cross-blur));
  }
  .words {
    grid-area: 1 / 2;
    justify-self: stretch;
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  .panel[data-open="false"] .hide {
    grid-template-columns: var(--icon-md) 1fr;
    column-gap: var(--space-2);
    padding-inline: var(--space-3);
    border-color: var(--border-control);
    transition:
      var(--transition-control),
      grid-template-columns var(--dur-exit) var(--ease-out) calc(var(--dur-exit) / 2),
      column-gap var(--dur-exit) var(--ease-out) calc(var(--dur-exit) / 2),
      padding var(--dur-exit) var(--ease-out) calc(var(--dur-exit) / 2);
  }
  .panel[data-open="false"] .glyph.closed {
    opacity: 0;
    scale: var(--pop-scale);
    filter: blur(var(--c-recall-cross-blur));
  }
  .panel[data-open="false"] .glyph.opened {
    opacity: 1;
    scale: 1;
    filter: none;
    color: var(--ink-muted);
  }
  .panel[data-open="false"] .words {
    opacity: 1;
    transition-delay: calc(var(--dur-exit) / 2);
  }

  /* The desk's fold (pin 29): one clip from the panel's box to the pill's, its contents blurring away on the first half;
     Show opens the clip back out over --dur-panel on the drawer curve. Open, the clip stands well outside the panel, so
     its shadow is never cut. One clip-path transition, so a press mid-fold turns back from where it stands. */
  .panel.desk {
    clip-path: inset(-64px round var(--radius-panel));
  }
  .panel.desk[data-open="false"] {
    clip-path: var(--pill-clip, inset(0 round var(--radius-md)));
    box-shadow: var(--shadow-raised);
    pointer-events: none;
  }
  @media (prefers-reduced-motion: no-preference) {
    .panel.desk {
      transition:
        clip-path var(--dur-panel) var(--ease-drawer),
        box-shadow var(--dur-panel) var(--ease-drawer);
    }
    .panel.desk[data-open="false"] {
      transition:
        clip-path var(--dur-exit) var(--ease-out),
        box-shadow var(--dur-exit) var(--ease-out);
    }
  }
  .panel.desk :is(.body, .fades) {
    transition:
      opacity var(--dur-control) var(--ease-out) calc(var(--dur-panel) / 2),
      filter var(--dur-control) var(--ease-out) calc(var(--dur-panel) / 2);
  }
  .panel.desk[data-open="false"] :is(.body, .fades) {
    opacity: 0;
    filter: blur(var(--c-recall-cross-blur));
    transition:
      opacity calc(var(--dur-exit) / 2) var(--ease-out),
      filter calc(var(--dur-exit) / 2) var(--ease-out);
  }
</style>
