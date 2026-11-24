<script lang="ts">
  /**
   * The time an armed button has left before it disarms, drawn along its
   * rim (owner's pick, 2026-11-24: "a ring that draws alongside the rims
   * that shows how much time left before acting"): a 1px line in the
   * button's ink (`currentColor`) just inside its edge, whole as it arms
   * and running out over --duration-arm.
   *
   * Declarative and drawn by CSS alone: an SVG rect laid over the button's
   * border box, its geometry CSS (inset by the edge and half the line, its
   * corner the button's own radius less that inset, `--rim-radius`, the
   * small radius unless the shape sets its own), `pathLength` 1 so the line
   * runs out at one speed along every side and round every corner, and the
   * run a CSS animation (`animate-run-out`) that starts each time the button
   * arms (`data-armed`). It is a box of its own (`data-box`), so the mark
   * line's trim pads none of it.
   */
  let { armed }: { armed: boolean } = $props();
</script>

<svg
  aria-hidden="true"
  class="pointer-events-none absolute -inset-px size-[calc(100%+2px)] overflow-visible opacity-0 transition-[opacity] duration-(--duration-fast) ease-out data-armed:opacity-100"
  data-armed={armed || undefined}
  data-box
  data-slot="rim-countdown"
  fill="none"
>
  <rect
    class="[x:1.5px] [y:1.5px] h-[calc(100%-3px)] w-[calc(100%-3px)] [rx:calc(var(--rim-radius,var(--radius-sm))-1.5px)] in-data-armed:animate-run-out"
    pathLength="1"
    stroke="currentColor"
    stroke-dasharray="1 1"
    stroke-width="1"
  />
</svg>
