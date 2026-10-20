<script lang="ts">
  /**
   * A finger from the screen's edge pulls a sheet out: a press in the edge's
   * strip, under the bar, that travels inward more than 24px, and more than
   * it travels down, opens it. The sidebar from the left edge (Shell); a
   * mouse is not a finger, and goes by.
   */
  let {
    side,
    onpull,
  }: {
    side: "left" | "right";
    /** The pull passed the threshold: open the sheet. */
    onpull: () => void;
  } = $props();

  function press(event: PointerEvent) {
    if (event.pointerType === "mouse") {
      return;
    }
    const zone = event.currentTarget as HTMLElement;
    const x0 = event.clientX;
    const y0 = event.clientY;
    zone.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const inward = side === "left" ? e.clientX - x0 : x0 - e.clientX;
      if (inward > 24 && inward > Math.abs(e.clientY - y0)) {
        onpull();
        stop();
      }
    };
    const stop = () => {
      zone.removeEventListener("pointermove", move);
      zone.removeEventListener("pointerup", stop);
      zone.removeEventListener("pointercancel", stop);
    };
    zone.addEventListener("pointermove", move);
    zone.addEventListener("pointerup", stop);
    zone.addEventListener("pointercancel", stop);
  }
</script>

<!-- The screen's edge under the row: a press there is the pull's, not the
     page's. A finger that goes down the edge scrolls the page under it; one
     that goes inward is the pull's. -->
<div
  data-slot="edge-pull"
  aria-hidden="true"
  class="absolute start-0 end-auto top-c-top-bar-h bottom-0 z-(--layer-pull) w-c-edge-pull touch-pan-y side-right:start-auto side-right:end-0"
  data-side={side}
  onpointerdown={press}
></div>
