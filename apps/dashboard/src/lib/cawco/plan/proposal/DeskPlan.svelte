<script lang="ts">
  /**
   * The desk's side card: the real SideSurface at the split's 360px, as tall
   * as the split gives it, holding the plan. Its head carries the title with
   * the ring and its figure, the task's badge (its glyph, title and stage),
   * then Expand and Close, as the split gives them (`setSideExpand`; Expand
   * does nothing here). The plan scrolls inside it.
   */
  import type { Snippet } from "svelte";
  import { capEdgeFades } from "#lib/cawco/edge-fade-caps.js";
  import { setSideExpand } from "#lib/cawco/side/expand.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { IconChevronRight } from "#lib/icons.js";
  // Page-local Solar glyph the proposal adds (not in $lib/icons.ts yet).
  import GlyphTask from "~icons/solar/clipboard-check-bold-duotone";
  import { type PlanFixture, progress } from "./fixtures";
  import { holdOn } from "./focus";
  import { standWhole } from "./whole";

  let {
    plan,
    focus,
    whole = false,
    children,
  }: {
    plan: PlanFixture;
    /** The row the card stands scrolled to (a step a story opens). */
    focus?: string;
    /** Show the whole plan, the frame as tall as it is (standWhole): a decision page's drawing. */
    whole?: boolean;
    children: Snippet;
  } = $props();

  let desk = $state<HTMLElement>();

  setSideExpand({
    available: true,
    backLabel: "Back to conversation",
    collapse: () => false,
    expanded: false,
    toggle: () => undefined,
  });

  const got = $derived(progress(plan));
  /** The split's height the card stands at (its block size, c-plan-card-h). */
  const DESK_TALL = 680;
</script>

<!-- One cell the card fills: as a flex item it shrank to its words'
     narrowest width inside its 360px box. It stands at the split's 680px
     whatever holds it: capped at the viewport's height, inside a decision
     page's embed (its frame's own viewport, sized to what it draws) it
     shrank to the frame's first height and the frame then held there. -->
<div
  bind:this={desk}
  class="grid h-c-plan-card-h w-c-plan-card-w max-w-full grid-cols-1 grid-rows-1"
  data-slot="side-card"
>
  <SideSurface label="Plan" onclose={() => undefined} recessed={false}>
    {#snippet titleControl()}
      <!-- "Plan", its ring and its count are the name's lead (`name-lead`),
           the width SideSurface keeps: none of them gives, so the count is
           never cut. -->
      <span
        class="mark-line flex min-w-0 items-center gap-space-2 ps-space-2"
        data-slot="name-lead"
      >
        <span class="flex-none type-label text-ink-strong" data-slot="plan-name"
          >Plan</span
        >
        <span
          class="grid flex-none text-ink-muted"
          data-box
          data-slot="progress"
          ><TaskRing done={got.done} total={got.total} /></span
        >
        <span
          class="num flex-none type-meta whitespace-nowrap text-ink-muted"
          data-num
          data-slot="plan-count">{got.done} of {got.total}</span
        >
      </span>
    {/snippet}
    {#snippet actions()}
      <!-- A box of its own, because SideSurface's direct-child
           `:is(button, a) { flex: none }` is for fixed actions, and this
           chip is the one control in the head that gives way. -->
      <!-- The head's names in one size, on one line (the head recipe's label
           role): "Plan", the task's title, its stage. The task's badge
           stands a step clear of the name and gives way first, its title
           ending in an ellipsis; its slot is the box that shrinks. -->
      <span class="ms-space-3 flex min-w-0 flex-initial">
        <button
          aria-label="Open the task {plan.task.title}, {plan.task.stage}"
          class="mark-line flex min-w-0 items-center gap-space-1 [&_svg]:flex-none"
          type="button"
        >
          <GlyphTask
            aria-hidden="true"
            class="size-icon-sm text-ink-muted"
            data-box
            data-slot="task-glyph"
          />
          <span
            class="min-w-0 overflow-clip type-label font-normal text-ellipsis whitespace-nowrap text-ink-strong"
            data-slot="task-title">{plan.task.title}</span
          >
          <span
            class="flex-none type-label font-normal whitespace-nowrap text-ink-muted"
            data-slot="task-stage">· {plan.task.stage}</span
          >
          <IconChevronRight aria-hidden="true" />
        </button>
      </span>
    {/snippet}
    <div
      class="kit-edge-fade-block min-h-0 flex-auto overflow-y-auto overscroll-contain px-space-2 pt-space-1 pb-space-4"
      data-slot="plan-scroll"
      {@attach holdOn(focus)}
      {@attach capEdgeFades}
      {@attach whole && standWhole(() => desk, DESK_TALL)}
    >
      {@render children()}
    </div>
  </SideSurface>
</div>
