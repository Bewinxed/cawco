<script lang="ts">
  /**
   * A project's page and Caw's panel docked beside it (CawFloat, `dock`):
   * beside the page where it has the room for both, under it where it has
   * not; the page yields the panel its room, so it never covers a column or
   * the head. On a phone the panel is the bottom sheet, and the page keeps
   * it all.
   *
   * The side column (`@project-dock`) stands from the width where one board
   * column and the pane's padding leave the panel a phone's composer width:
   * the panel at its full width where that fits, narrower down to there, so
   * a project in a desk's split keeps its board beside him. Where the page
   * has no room beside it: a row of its own under the page, at most half
   * the height. Both from 640px: under it the panel is the sheet, so a
   * phone's page keeps its whole width. On his Preview tab
   * (`preview`, CawLead `tab`) the panel widens for what he shows: its
   * column takes two conversations' widths while a board column still
   * stands beside it, its row three quarters of the height; the grid tweens
   * to it on the drawer curve, and lands at once with less motion.
   */
  import type { Snippet } from "svelte";

  let {
    docked,
    preview,
    page,
    dock,
  }: {
    /** His panel is open and docked (not a phone's sheet). */
    docked: boolean;
    /** His panel is on Preview: it widens. */
    preview: boolean;
    page: Snippet;
    /** Caw's panel (CawFloat), which places itself in the dock's area. */
    dock: Snippet;
  } = $props();
</script>

<div class="@container flex h-full min-h-0 min-w-0 flex-1 flex-col">
  <div
    class="grid min-h-0 flex-1 grid-areas-(--docked-areas) grid-cols-(--docked-cols) grid-rows-(--docked-rows) motion-safe:transition-[grid-template-columns,grid-template-rows] motion-safe:duration-(--duration-panel) motion-safe:ease-drawer phone:data-caw-open:grid-areas-(--docked-areas-row) phone:data-caw-open:grid-rows-(--docked-rows-row) phone:@project-dock:data-caw-open:grid-areas-(--docked-areas-side) phone:@project-dock:data-caw-open:grid-cols-(--docked-cols-side) phone:@project-dock:data-caw-open:grid-rows-(--docked-rows)"
    data-caw-open={docked || undefined}
    data-caw-preview={(docked && preview) || undefined}
    style:--docked-areas={'"page"'}
    style:--docked-areas-row={'"page" "dock"'}
    style:--docked-areas-side={'"page dock"'}
    style:--docked-cols="minmax(0, 1fr)"
    style:--docked-cols-side={preview
      ? "minmax(0, 1fr) min(calc(2 * var(--spacing-c-panel-w) + var(--spacing-space-6)), calc(100% - var(--spacing-c-board-col-min) - var(--spacing-space-7)))"
      : "minmax(0, 1fr) min(calc(var(--spacing-c-panel-w) + var(--spacing-space-6)), calc(100% - var(--spacing-c-board-col-min) - var(--spacing-space-7) - var(--spacing-space-6)))"}
    style:--docked-rows="minmax(0, 1fr)"
    style:--docked-rows-row={preview
      ? "minmax(0, 1fr) 75%"
      : "minmax(0, 1fr) min(var(--spacing-c-caw-panel-h), 50%)"}
  >
    <div class="grid-area-page flex min-h-0 min-w-0 flex-col">
      {@render page()}
    </div>
    {@render dock()}
  </div>
</div>
