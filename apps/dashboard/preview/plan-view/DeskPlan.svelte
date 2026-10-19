<script lang="ts">
  /**
   * The desk's frame: the conversation, quiet, with the side card beside it
   * (the real SideSurface at the split's 360px) holding the plan. The card's
   * head carries the title with the ring and its figure, on a task attempt
   * the task's title and stage, then Expand and Close, as the split gives
   * them (`setSideExpand`; Expand does nothing on this page).
   */
  import type { Snippet } from "svelte";
  import { setSideExpand } from "#lib/cawco/side/expand.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { IconChevronRight } from "#lib/icons.js";
  // Page-local Solar glyph the proposal adds (not in $lib/icons.ts yet).
  import GlyphTask from "~icons/solar/clipboard-check-bold-duotone";
  import { type PlanFixture, progress } from "./fixtures";

  let {
    plan,
    today = false,
    focus,
    fit = false,
    narrow = "card",
    bare = false,
    conversation,
    children,
  }: {
    plan: PlanFixture;
    /** Draw the head as it is now: the title alone. */
    today?: boolean;
    /** The row the card stands scrolled to (its id), near its top. */
    focus?: string;
    /** The frame grows to its plan's whole height, so nothing is cut at its foot. */
    fit?: boolean;
    /**
     * Under 700px of page: the side card alone ("card"), or what the
     * conversation shows stacked over it ("stack"), each at the page's width.
     */
    narrow?: "card" | "stack";
    /** The side card alone, at its 360px, with no conversation beside it. */
    bare?: boolean;
    /** What the conversation shows; quiet lines when nothing is given. */
    conversation?: Snippet;
    children: Snippet;
  } = $props();

  setSideExpand({
    available: true,
    backLabel: "Back to conversation",
    collapse: () => false,
    expanded: false,
    toggle: () => undefined,
  });

  const got = $derived(progress(plan));

  /** Holds the scroller on the focused row while what is in it lays out. */
  function foot(node: HTMLElement) {
    if (!focus) {
      return;
    }
    const hold = () => {
      const row = node.querySelector<HTMLElement>(
        `[data-row="${CSS.escape(focus)}"]`
      );
      if (row) {
        node.scrollTop +=
          row.getBoundingClientRect().top -
          node.getBoundingClientRect().top -
          8;
      }
    };
    const sizes = new ResizeObserver(hold);
    for (const child of node.children) {
      sizes.observe(child);
    }
    hold();
    // The person's own scroll takes over from the first wheel or touch.
    const stop = () => sizes.disconnect();
    node.addEventListener("wheel", stop, { once: true, passive: true });
    node.addEventListener("touchstart", stop, { once: true, passive: true });
    node.addEventListener("pointerdown", stop, { once: true });
    return () => {
      sizes.disconnect();
      node.removeEventListener("wheel", stop);
      node.removeEventListener("touchstart", stop);
      node.removeEventListener("pointerdown", stop);
    };
  }
</script>

<!-- Narrower than the frame on a wide page, it scrolls sideways at full size
     inside its own box, its edges fading where more lies past them; the page
     never does. On a phone's page the frame stacks at the page's width. -->
<div class="desk-scroll kit-edge-fade" data-slot="desk-scroll">
  <div
    class="desk-frame"
    data-slot="desk-frame"
    data-bare={bare || undefined}
    data-fit={fit || undefined}
    data-narrow={narrow}
  >
    <div
      class="conversation"
      aria-hidden={conversation ? undefined : "true"}
      data-slot="conversation"
      data-quiet={conversation ? undefined : ""}
    >
      {#if conversation}
        {@render conversation()}
      {:else}
        <span class="line" style:--w="72%"></span>
        <span class="line" style:--w="90%"></span>
        <span class="line" style:--w="54%"></span>
        <span class="gap"></span>
        <span class="line" style:--w="80%"></span>
        <span class="line" style:--w="66%"></span>
        <span class="composer"></span>
      {/if}
    </div>
    <div class="desk" data-slot="side-card">
      <SideSurface label="Plan" onclose={() => undefined} recessed={false}>
        {#snippet titleControl()}
          <span class="head mark-line">
            <span class="title">Plan</span>
            {#if !today}
              <span class="progress" data-slot="progress" data-box
                ><TaskRing done={got.done} total={got.total} /></span
              >
              <span data-num class="num figure">{got.done} of {got.total}</span>
            {/if}
          </span>
        {/snippet}
        {#snippet actions()}
          {#if plan.task && !today}
            <button
              aria-label="Open the task {plan.task.title}, {plan.task.stage}"
              class="task mark-line"
              type="button"
            >
              <GlyphTask aria-hidden="true" class="task-glyph" />
              <span class="task-title">{plan.task.title}</span>
              <span class="stage">· {plan.task.stage}</span>
              <IconChevronRight aria-hidden="true" />
            </button>
          {/if}
        {/snippet}
        <div class="body kit-edge-fade-block" {@attach foot}>
          {@render children()}
        </div>
      </SideSurface>
    </div>
  </div>
</div>

<style>
  .desk-scroll {
    display: flex;
    max-inline-size: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding-block-end: var(--space-1);
  }
  /* The split: the conversation takes what the card leaves. */
  .desk-frame {
    display: flex;
    gap: var(--space-3);
    flex: none;
    inline-size: 780px;
    block-size: 680px;
    padding: var(--space-3);
    border-radius: var(--radius-panel);
    background: var(--background);
    box-shadow: var(--shadow-xs);

    &[data-fit] {
      block-size: auto;
      min-block-size: 680px;
    }
  }
  .conversation {
    flex: 1 1 0;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-4) var(--space-3);
    overflow: clip;
  }
  .line {
    inline-size: var(--w);
    block-size: 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-fill);
  }
  .gap {
    block-size: var(--space-5);
  }
  .composer {
    margin-block-start: auto;
    block-size: 48px;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
  }
  .desk {
    flex: none;
    inline-size: 360px;
    max-inline-size: 100%;
    min-block-size: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    padding-inline-start: var(--space-2);
  }
  .title {
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .progress {
    display: grid;
    color: var(--ink-muted);
  }
  .figure {
    color: var(--ink-muted);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* The head's names in one size, on one line (the head recipe's label
     role): "Plan", the task's title, its stage. */
  .task-title,
  .stage {
    font: var(--type-label);
    font-weight: var(--weight-body);
    white-space: nowrap;
  }
  .task-title {
    color: var(--ink-strong);
  }
  /* The task badge's glyph, grown to the head with the task's title. */
  .desk :global(.task-glyph) {
    flex: none;
    inline-size: 12px;
    block-size: 12px;
    color: var(--ink-muted);
  }
  .stage {
    color: var(--ink-muted);
  }
  /* A phone's page: no sideways scroll; the card at the page's width, and
     the conversation over it only where it has something to show. */
  @media (width < 700px) {
    .desk-scroll {
      overflow-x: visible;
      padding-block-end: 0;
    }
    .desk-frame,
    .desk-frame[data-fit] {
      flex: 1 1 auto;
      flex-direction: column;
      inline-size: 100%;
      block-size: auto;
      min-block-size: 0;
      padding: var(--space-2);
    }
    /* What the conversation shows stands on the card's own edges, so the
       cards above and the plan card below share one inset. */
    .conversation {
      flex: none;
      padding: var(--space-2) 0 var(--space-3);
    }
    .desk-frame[data-narrow="card"] .conversation,
    .conversation[data-quiet] {
      display: none;
    }
    .desk {
      inline-size: 100%;
      block-size: 640px;
    }
  }
  .body {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-1) var(--space-2) var(--space-4);
  }
  .desk-frame[data-bare] {
    inline-size: auto;
    padding: 0;
    background: none;
    box-shadow: none;

    & .conversation {
      display: none;
    }
  }
</style>
