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

<div
  data-slot="edge-pull"
  aria-hidden="true"
  class="edge"
  data-side={side}
  onpointerdown={press}
></div>

<style>
  /* The screen's edge under the row: a press there is the pull's, not the
     page's. */
  .edge {
    position: absolute;
    inset-block: var(--c-top-bar-h) 0;
    inset-inline: 0 auto;
    z-index: 15;
    inline-size: var(--c-edge-pull);
    touch-action: none;
  }
  .edge[data-side="right"] {
    inset-inline: auto 0;
  }
</style>
