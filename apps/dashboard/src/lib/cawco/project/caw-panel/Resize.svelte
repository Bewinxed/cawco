<script lang="ts">
  /**
   * Making Caw's panel bigger on a desk (pin 11). The panel hangs from the
   * top bar's glass at its top trailing corner, so that corner holds and the
   * free sides are the leading edge and the foot. A drag follows the pointer
   * 1:1 with nothing animating; a double press goes back to 380 × 640.
   * Width runs 380 to 720 (the room less --space-3 each side at most),
   * height 400 to the room under the glass.
   *
   * - `edges`: the rail's own grip (Shell `.grip`: a 6px strip across the
   *   edge, drawn in `border-control` only under the pointer) on the leading
   *   edge and the foot, their corner taking both.
   * - `corner`: an L of 20px legs in a 1.5px `border-control` line, 4px
   *   outside the free corner and concentric with its radius (the canvas's
   *   corner grip, DESIGN.md, Artifact panel), always drawn, on the page.
   */
  let {
    mode,
    rest,
    onsize,
  }: {
    mode: "edges" | "corner";
    rest: { w: number; h: number };
    onsize: (next: { w: number; h: number } | null) => void;
  } = $props();

  let drag: {
    axes: "x" | "y" | "xy";
    h: number;
    room: { h: number; w: number };
    w: number;
    x: number;
    y: number;
  } | null = null;

  function down(event: PointerEvent, axes: "x" | "y" | "xy") {
    const handle = event.currentTarget as HTMLElement;
    const panel = handle.closest<HTMLElement>("[data-panel]");
    const page = panel?.parentElement;
    if (!(panel && page) || event.button !== 0) {
      return;
    }
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const box = panel.getBoundingClientRect();
    const field = page.getBoundingClientRect();
    const inset = Number.parseFloat(getComputedStyle(page).paddingInlineEnd);
    drag = {
      axes,
      x: event.clientX,
      y: event.clientY,
      w: box.width,
      h: box.height,
      room: {
        w: Math.min(720, field.width - 2 * inset),
        h: Math.max(rest.h, window.innerHeight - box.top - inset),
      },
    };
  }

  function move(event: PointerEvent) {
    if (!drag) {
      return;
    }
    const grow = (from: number, by: number, least: number, most: number) =>
      Math.round(Math.min(Math.max(from + by, least), Math.max(least, most)));
    onsize({
      w:
        drag.axes === "y"
          ? drag.w
          : grow(drag.w, drag.x - event.clientX, rest.w, drag.room.w),
      h:
        drag.axes === "x"
          ? drag.h
          : grow(drag.h, event.clientY - drag.y, 400, drag.room.h),
    });
  }

  const up = () => {
    drag = null;
  };
  const handlers = (axes: "x" | "y" | "xy") => ({
    onpointerdown: (event: PointerEvent) => down(event, axes),
    onpointermove: move,
    onpointerup: up,
    onpointercancel: up,
    ondblclick: () => onsize(null),
  });
</script>

{#if mode === "edges"}
  <div
    aria-hidden="true"
    class="absolute inset-y-0 -start-[3px] z-10 w-1.5 cursor-col-resize touch-none transition-colors hover:bg-(--border-control)"
    data-panel-grip="edge"
    {...handlers("x")}
  ></div>
  <div
    aria-hidden="true"
    class="absolute inset-x-0 -bottom-[3px] z-10 h-1.5 cursor-row-resize touch-none transition-colors hover:bg-(--border-control)"
    data-panel-grip="foot"
    {...handlers("y")}
  ></div>
  <div
    aria-hidden="true"
    class="absolute -start-[3px] -bottom-[3px] z-10 size-(--space-3) cursor-nesw-resize touch-none"
    data-panel-grip="corner"
    {...handlers("xy")}
  ></div>
{:else}
  <div
    aria-hidden="true"
    class="absolute -start-(--space-3) -bottom-(--space-3) z-10 size-6 cursor-nesw-resize touch-none"
    data-panel-grip="corner"
    {...handlers("xy")}
  >
    <span
      class="absolute start-[5.5px] bottom-[5.5px] block size-5 rounded-bl-[calc(var(--radius-lg)+4px)] border-(--border-control) border-b-[1.5px] border-s-[1.5px]"
    ></span>
  </div>
{/if}
