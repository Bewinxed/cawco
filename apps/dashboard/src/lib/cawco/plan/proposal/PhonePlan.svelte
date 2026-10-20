<script lang="ts">
  /**
   * The phone's frame: the plan in the kit's Drawer (the bottom sheet the
   * composer's ring opens) on a 390px phone, at the sheet's own height, 85%
   * of an 844px screen, placed in this frame rather than the page's
   * viewport. What stands behind the sheet is the conversation, drawn here
   * as nothing: the frame is the sheet. The screen takes a finger's sizes
   * (`data-coarse`), as a phone draws them.
   */
  import type { Snippet } from "svelte";
  import { capEdgeFades } from "#lib/cawco/edge-fade-caps.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { IconChevronRight } from "#lib/icons.js";
  // Page-local Solar glyph the proposal adds (not in $lib/icons.ts yet).
  import GlyphTask from "~icons/solar/clipboard-check-bold-duotone";
  import { type PlanFixture, progress } from "./fixtures";
  import { holdOn } from "./focus";

  let {
    plan,
    focus,
    children,
  }: {
    plan: PlanFixture;
    /** The row the sheet stands scrolled to (a step a story opens). */
    focus?: string;
    children: Snippet;
  } = $props();

  let host = $state<HTMLElement>();
  const got = $derived(progress(plan));
</script>

<div bind:this={host} data-coarse class="phone" data-slot="phone-screen">
  {#if host}
    <Drawer.Root
      container={host}
      dismissible={false}
      modal={false}
      noBodyStyles
      open
      shouldScaleBackground={false}
    >
      <Drawer.Content
        class="plan-sheet"
        hosted
        modal={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        style="inset-inline:0;bottom:0;max-height:100%"
        trapFocus={false}
      >
        <Drawer.Header>
          <Drawer.Title class="sheet-title mark-line">
            <span>Plan</span>
            <span class="progress" data-box data-slot="progress"
              ><TaskRing done={got.done} total={got.total} /></span
            >
            <span data-num class="num figure">{got.done} of {got.total}</span>
          </Drawer.Title>
        </Drawer.Header>
        <button
          aria-label="Open the task {plan.task.title}, {plan.task.stage}"
          class="task touch-hit mark-line"
          type="button"
        >
          <GlyphTask aria-hidden="true" class="task-glyph" data-box />
          <span class="task-title">{plan.task.title}</span>
          <span class="stage">· {plan.task.stage}</span>
          <IconChevronRight aria-hidden="true" />
        </button>
        <!-- Where the list runs on past the sheet's foot, it fades there
             (the house edge fade) rather than cutting a line in half. -->
        <div
          class="scroll kit-sheet-scroll kit-edge-fade-block"
          {@attach holdOn(focus)}
          {@attach capEdgeFades}
        >
          {@render children()}
        </div>
      </Drawer.Content>
    </Drawer.Root>
  {/if}
</div>

<style>
  .phone {
    position: relative;
    inline-size: 390px;
    max-inline-size: 100%;
    /* The sheet's height on an 844px screen (its 85%). */
    block-size: 717px;
    overflow: clip;
    /* Fixed descendants (the sheet, its scrim) stand in this screen. */
    contain: layout paint;
    border-radius: var(--radius-panel);
    background: var(--background);
    box-shadow: var(--shadow-xs);
  }
  .phone :global(.sheet-title) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .progress {
    display: grid;
    color: var(--ink-muted);
  }
  .figure {
    color: var(--ink-muted);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
  }
  .task {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-block-size: 44px;
    margin-block-end: var(--space-1);
    padding: 0;
    border: 0;
    border-block-end: 1px solid var(--border-hairline);
    background: none;
    color: var(--ink-muted);
    font: var(--type-label);
    text-align: start;
    cursor: pointer;

    & :global(svg) {
      flex: none;
      margin-inline-start: auto;
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
  }
  .task :global(.task-glyph) {
    margin-inline-start: 0;
    inline-size: 12px;
    block-size: 12px;
  }
  .task-title {
    min-inline-size: 0;
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .stage {
    flex: none;
    font: var(--type-meta);
  }
  .scroll {
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
</style>
