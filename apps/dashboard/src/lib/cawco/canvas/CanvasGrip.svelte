<script lang="ts">
  /**
   * One of a canvas's resize handles over the composer (CanvasStages): the
   * top grab, the drawer's grabber laid flat, or a top corner's grip, the
   * typical corner grip (DESIGN.md, The canvas's entrance): an L whose
   * `c-corner-grip-leg` legs run along the corner's two edges in a
   * `c-corner-grip-stroke` line of `border-control`, `c-corner-grip-inset`
   * inside the corner and concentric with its radius. A focusable separator
   * (WAI-ARIA window splitter): it takes focus, arrows and a drag.
   */
  import { appearOnMount } from "../motion/curves.svelte";
  import type { GrabValue, Handle } from "./stage.svelte";

  const LABELS: Record<Handle, string> = {
    top: "Canvas height",
    "top-left": "Canvas size, top-left corner",
    "top-right": "Canvas size, top-right corner",
  };

  let {
    handle,
    value,
    text,
    corner,
    ondown,
    onkey,
  }: {
    handle: Handle;
    /** Its value for a screen reader, px: the top's the height, a corner's the width. */
    value: GrabValue | undefined;
    /** A corner's value in words: both sizes. */
    text: string | undefined;
    /** Where the shape's top corners stand, px: how far in from the stage's sides, and their radius. */
    corner: { inset: number; radius: number };
    ondown: (handle: Handle, event: PointerEvent) => void;
    onkey: (handle: Handle, event: KeyboardEvent) => void;
  } = $props();

  /**
   * A corner's grip fades up over --dur-grow as the canvas grows to take
   * it, with or without motion (`appearOnMount`, never `@starting-style`,
   * which WebKit sometimes skips); the top's grab is simply there.
   */
  const comesIn = appearOnMount({
    motion: { over: "--dur-grow" },
    reduced: { over: "--dur-grow" },
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -- a focusable separator is a widget (WAI-ARIA window splitter): it takes focus, arrows and a drag. -->
<!-- biome-ignore lint/a11y/useSemanticElements: a resize handle is a focusable separator (WAI-ARIA window splitter); <hr> takes no focus or keys. -->
<div
  data-slot="grab"
  aria-label={LABELS[handle]}
  aria-orientation={handle === "top" ? "horizontal" : "vertical"}
  aria-valuemax={Math.round(value?.max ?? 0)}
  aria-valuemin={Math.round(value?.min ?? 0)}
  aria-valuenow={Math.round(value?.now ?? 0)}
  aria-valuetext={handle === "top" ? undefined : text}
  class={[
    "group/grab absolute flex touch-none select-none outline-off",
    handle === "top" &&
      "start-1/2 top-0 h-c-btn-h-lg w-c-canvas-grab-w -translate-x-1/2 cursor-ns-resize justify-center pt-space-1",
    handle === "top-left" &&
      "top-0 size-c-btn-h-lg start-(--corner-in) cursor-nwse-resize",
    handle === "top-right" &&
      "top-0 size-c-btn-h-lg end-(--corner-in) cursor-nesw-resize justify-end",
  ]}
  data-canvas-stages-grab={handle}
  {@attach handle === "top" ? undefined : comesIn}
  onkeydown={(event) => onkey(handle, event)}
  onpointerdown={(event) => ondown(handle, event)}
  role="separator"
  tabindex="0"
  style:--corner-in={`${corner.inset}px`}
  style:--corner-r={`${corner.radius}px`}
>
  <!-- A corner's L is an inset ring on a box twice the leg's size, its far
       sides clipped away by the leg's box: a ring's spread holds its
       fractional width on every screen, where a border's width is snapped
       to whole device pixels (1.5px drew 1px). The ring's outer edge runs
       on the box's radius, so it stays concentric with the corner. -->
  <span
    aria-hidden="true"
    data-slot="grip"
    class={[
      "group-focus-visible/grab:outline-(length:--focus-ring-width) group-focus-visible/grab:outline-offset-2 group-focus-visible/grab:outline-focus-ring group-focus-visible/grab:outline-solid",
      handle === "top" &&
        "h-c-grabber-h w-c-grabber-w rounded-pill bg-border-control",
      handle !== "top" &&
        "relative m-c-corner-grip-inset size-c-corner-grip-leg overflow-clip",
      handle === "top-left" && "rounded-ss-(--grip-r)",
      handle === "top-right" && "rounded-se-(--grip-r)",
    ]}
    style:--grip-box="calc(2 * var(--c-corner-grip-leg))"
    style:--grip-r={"max(0px, calc(var(--corner-r) - var(--c-corner-grip-inset)))"}
  >
    {#if handle !== "top"}
      <span
        class={[
          "absolute top-0 size-(--grip-box) rounded-(--grip-r) inset-ring-(length:--c-corner-grip-stroke) inset-ring-border-control",
          handle === "top-left" ? "start-0" : "end-0",
        ]}
      ></span>
    {/if}
  </span>
</div>
