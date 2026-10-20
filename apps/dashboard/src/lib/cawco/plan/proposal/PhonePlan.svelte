<script lang="ts">
  /**
   * The phone's frame: the plan in the kit's Drawer (the bottom sheet the
   * composer's ring opens) on a 390px phone, at the sheet's own height, 85%
   * of an 844px screen, placed in this frame rather than the page's
   * viewport. What stands behind the sheet is the conversation, drawn here
   * as nothing: the frame is the sheet. The screen takes a finger's sizes
   * (`data-coarse`), as a phone draws them.
   *
   * The sheet is hosted (the kit's `hosted`: it fills this frame, which
   * draws its surface and its one header), since the kit's own placement
   * reads the window's visible area, not the frame's. The frame draws them
   * on the kit's recipe (DESIGN.md, Drawer): the grabber, then the title in
   * the title role, its ring and count beside it, and Close at the trailing
   * edge (`grabberVariants`, `sheetHeadVariants`); a bottom sheet's surface
   * is rounded at the top, its hairline along the top edge only. The kit
   * reads the title out.
   */
  import type { Snippet } from "svelte";
  import { capEdgeFades } from "#lib/cawco/edge-fade-caps.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { sheetHeadVariants } from "#lib/components/ui/drawer/sheet-head.js";
  import { IconChevronRight, IconClose } from "#lib/icons.js";
  // Page-local Solar glyph the proposal adds (not in $lib/icons.ts yet).
  import GlyphTask from "~icons/solar/clipboard-check-bold-duotone";
  import { cropWhole } from "./crop";
  import { type PlanFixture, progress } from "./fixtures";
  import { holdOn } from "./focus";

  let {
    plan,
    focus,
    crop = false,
    children,
  }: {
    plan: PlanFixture;
    /** The row the sheet stands scrolled to (a step a story opens). */
    focus?: string;
    /** Cut only between lines (cropWhole): a decision page's drawing. */
    crop?: boolean;
    children: Snippet;
  } = $props();
  /** The sheet's height the frame stands at (its block size, c-plan-sheet-h). */
  const SHEET_TALL = 717;

  let host = $state<HTMLElement>();
  const got = $derived(progress(plan));
  const head = sheetHeadVariants();
</script>

<!-- The phone's screen: fixed descendants (the sheet, its scrim) stand in
     it, as its own containing block. -->
<div
  bind:this={host}
  class="relative h-c-plan-sheet-h w-c-bench-phone-w max-w-full overflow-clip rounded-t-lg border-t border-border bg-surface-raised shadow-xs contain-layout contain-paint"
  data-coarse
  data-slot="phone-screen"
>
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
        hosted
        modal={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        title="Plan"
        trapFocus={false}
      >
        <!-- The sheet's own padding, on a plain box: the kit's content owns
             its spacing. -->
        <div class="flex min-h-0 flex-1 flex-col px-space-4 pb-space-4">
          <div class={grabberVariants()} data-slot="drawer-grabber"></div>
          <div class={head.head()} data-slot="drawer-header">
            <span class="mark-line flex min-w-0 items-center gap-space-2">
              <span
                aria-hidden="true"
                class={head.title()}
                data-slot="plan-name">Plan</span
              >
              <span class="grid text-ink-muted" data-box data-slot="progress"
                ><TaskRing done={got.done} total={got.total} /></span
              >
              <span
                class="num type-meta text-ink-muted"
                data-num
                data-slot="plan-count">{got.done} of {got.total}</span
              >
            </span>
            <!-- The recipe's Close, drawn as the kit's head draws it; the frame
               stands open, so it closes nothing. -->
            <button
              aria-label="Close"
              class={head.close()}
              title="Close"
              type="button"
            >
              <IconClose aria-hidden="true" />
            </button>
          </div>
          <button
            aria-label="Open the task {plan.task.title}, {plan.task.stage}"
            class="touch-hit mark-line focus-inset mb-space-1 flex min-h-c-touch-floor items-center gap-space-1 border-b border-border-hairline p-0 type-label text-start text-ink-muted [&>svg]:flex-none [&>svg:last-child]:ms-auto [&>svg:last-child]:size-icon-md"
            type="button"
          >
            <GlyphTask
              aria-hidden="true"
              class="size-icon-sm"
              data-box
              data-slot="task-glyph"
            />
            <span
              class="min-w-0 wrap-anywhere text-ink-strong"
              data-slot="task-title">{plan.task.title}</span
            >
            <span class="flex-none type-meta" data-slot="task-stage"
              >· {plan.task.stage}</span
            >
            <IconChevronRight aria-hidden="true" />
          </button>
          <!-- Where the list runs on past the sheet's foot, it fades there
             (the house edge fade) rather than cutting a line in half. -->
          <div
            class="kit-sheet-scroll kit-edge-fade-block min-h-0 overflow-y-auto overscroll-contain"
            data-slot="plan-scroll"
            {@attach holdOn(focus)}
            {@attach capEdgeFades}
            {@attach crop && cropWhole(() => host, SHEET_TALL)}
          >
            {@render children()}
          </div>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  {/if}
</div>
