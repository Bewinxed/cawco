<script lang="ts">
  /**
   * The delegate tray as the canvas draws it under SessionWaitingFixture's
   * composer: one running delegate's chip, on DelegateTray's own recipe
   * (ui/chip `tray`, the session's mark, its title, the running dot), since
   * the live tray reads the hub's store. It takes DelegateTray's props, so
   * the composer's fleet mounts it in the tray's place.
   */
  import { chipVariants } from "#lib/components/ui/chip/index.js";

  let {
    held: _held = false,
    parentId: _parentId,
  }: { held?: boolean; parentId: string } = $props();

  // golar-ignore-next-line house/fixture-mounts -- DelegateTray reads its chips from the work-items store by its parent's id, and a `preview/` fixture may import no store (biome.jsonc, "The fleet store is the live app"), so its one chip is drawn here on the tray's recipe
  const chip = chipVariants({
    variant: "tray",
    class: "touch-hit min-w-c-tray-chip-min max-w-c-tray-chip-max flex-initial",
  });
</script>

<div class="pointer-events-none pe-(--ring-room,0px)">
  <div
    class="pointer-events-auto flex flex-nowrap items-center gap-space-2 pb-c-tray-gap"
  >
    <!-- golar-ignore-next-line house/fixture-mounts -- the chip's own button, for the same reason -->
    <button
      aria-label="Design the Comments rail and sheet whole, working"
      class={chip}
      data-tray-chip
      type="button"
    >
      <span
        aria-hidden="true"
        class="grid size-c-row-mark flex-none place-items-center rounded-xs bg-mark-3"
        data-box
      ></span>
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >Design the Comments rail and sheet whole</span
      >
      <span
        aria-hidden="true"
        class="size-space-1 flex-none rounded-pill bg-status-live-glyph"
        data-box
      ></span>
    </button>
  </div>
</div>
