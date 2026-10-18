<script lang="ts">
  /**
   * The phone's frame: a 390×844 screen with the plan in the kit's Drawer
   * (the bottom sheet the composer's ring opens), placed in this screen
   * rather than the page's viewport. The screen takes a finger's sizes
   * (`data-coarse`), as a phone draws them.
   */
  import type { Snippet } from "svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { IconChevronRight } from "#lib/icons.js";
  import type { PlanFixture } from "./fixtures";

  let {
    plan,
    title = "Plan",
    ring = true,
    children,
  }: {
    plan: PlanFixture;
    title?: string;
    ring?: boolean;
    children: Snippet;
  } = $props();

  let host = $state<HTMLElement>();
</script>

<div bind:this={host} data-coarse class="phone" data-slot="phone-screen">
  <!-- The conversation the sheet stands over, quiet behind the scrim. -->
  <div class="behind" aria-hidden="true">
    <span class="line" style:--w="62%"></span>
    <span class="line" style:--w="84%"></span>
    <span class="line" style:--w="48%"></span>
  </div>
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
        style="inset-inline:0;bottom:0;max-height:85%"
        trapFocus={false}
      >
        <Drawer.Header>
          <Drawer.Title class="sheet-title">
            <span>{title}</span>
            {#if ring}
              <span class="ring"
                ><TaskRing done={plan.done} total={plan.total} /></span
              >
              <span data-num class="num figure"
                >{plan.done} of {plan.total}</span
              >
            {/if}
          </Drawer.Title>
        </Drawer.Header>
        {#if plan.task && ring}
          <button
            aria-label="Open {plan.task.id}, {plan.task.stage}"
            class="task touch-hit"
            type="button"
          >
            <span class="ref">{plan.task.id}</span>
            <span class="stage">· {plan.task.stage}</span>
            <IconChevronRight aria-hidden="true" />
          </button>
        {/if}
        <div class="scroll kit-sheet-scroll">
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
    block-size: 844px;
    overflow: clip;
    /* Fixed descendants (the sheet, its scrim) stand in this screen. */
    contain: layout paint;
    border-radius: var(--radius-panel);
    background: var(--background);
    box-shadow: var(--shadow-xs);
  }
  .behind {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: 72px var(--space-5);
  }
  .line {
    inline-size: var(--w);
    block-size: 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-fill);
  }
  .phone :global(.sheet-title) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .ring {
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
    font: var(--type-meta);
    cursor: pointer;

    & :global(svg) {
      margin-inline-start: auto;
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
  }
  .ref {
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-strong);
  }
  .scroll {
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
</style>
