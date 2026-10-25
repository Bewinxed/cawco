<script lang="ts">
  /**
   * The phone's frame: the plan in the kit's Drawer (the bottom sheet the
   * composer's ring opens) on a 390px phone, at the sheet's own height, 85%
   * of an 844px screen, placed in this frame rather than the page's
   * viewport. What stands behind the sheet is the conversation, drawn here
   * as nothing: the frame is the sheet. The screen takes a finger's sizes
   * (`data-coarse`), as a phone draws them.
   *
   * The sheet is hosted (the kit's `hosted`: it fills this frame), since the
   * kit's own placement reads the window's visible area, not the frame's.
   * Its head is one row (DESIGN.md, The Title Bars Follow Liquid Glass
   * Rule): opened from the plan's ring, which names it, it carries no title,
   * no count and no task; the grabber stands at its top and Close floats at
   * the row's trailing edge, a bare symbol in one capsule of the panel's
   * glass, the plan running under it. A bottom sheet's surface is rounded at
   * the top, its hairline along the top edge only. The kit reads the
   * sheet's name ("Plan") out.
   */
  import type { Snippet } from "svelte";
  import { capEdgeFades } from "#lib/cawco/edge-fade-caps.js";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { IconClose } from "#lib/icons.js";
  import { holdOn } from "./focus";
  import { standWhole } from "./whole";

  let {
    focus,
    whole = false,
    children,
  }: {
    /** The row the sheet stands scrolled to (a step a story opens). */
    focus?: string;
    /** Show the whole plan, the frame as tall as it is (standWhole): a decision page's drawing. */
    whole?: boolean;
    children: Snippet;
  } = $props();
  /** The sheet's height the frame stands at (its block size, c-plan-sheet-h). */
  const SHEET_TALL = 717;

  let host = $state<HTMLElement>();
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
          <!-- The head's one row: the grabber, and Close floating at its
               trailing edge in the glass; the frame stands open, so it
               closes nothing. -->
          <div
            class="relative min-h-(--head-h)"
            data-slot="drawer-header"
            style:--head-h="calc(var(--c-btn-h) + var(--space-3))"
          >
            <div class={grabberVariants()} data-slot="drawer-grabber"></div>
            <div
              class="absolute end-0 top-space-2 z-2 flex items-center gap-c-bar-group-pad h-c-btn-h p-c-bar-group-pad rounded-pill before:absolute before:inset-0 before:rounded-inherit before:border before:border-border-hairline before:bg-material-panel before:shadow-tile before:glass-backdrop before:pointer-events-none contrast-more:before:border-border-contrast contrast-more:before:bg-surface-raised contrast-more:before:backdrop-filter-none reduced-transparency:before:border-border-contrast reduced-transparency:before:bg-surface-raised reduced-transparency:before:backdrop-filter-none"
              data-bar-group
              data-slot="tools"
            >
              <button
                aria-label="Close"
                class="touch-hit press-tint"
                data-bar-item
                data-slot="close"
                title="Close"
                type="button"
              >
                <IconClose aria-hidden="true" data-slot="bar-symbol" />
              </button>
            </div>
          </div>
          <!-- Where the list runs on past the sheet's foot, it fades there
             (the house edge fade) rather than cutting a line in half. -->
          <div
            class="kit-sheet-scroll kit-edge-fade-block min-h-0 flex-1 overflow-y-auto overscroll-contain"
            data-slot="plan-scroll"
            {@attach holdOn(focus)}
            {@attach capEdgeFades}
            {@attach whole && standWhole(() => host, SHEET_TALL)}
          >
            {@render children()}
          </div>
        </div>
      </Drawer.Content>
    </Drawer.Root>
  {/if}
</div>
