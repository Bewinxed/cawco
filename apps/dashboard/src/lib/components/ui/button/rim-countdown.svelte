<script lang="ts">
  /**
   * The time an armed button has left before it disarms, drawn along its
   * rim (owner's pick, 2026-11-24: "a ring that draws alongside the rims
   * that shows how much time left before acting"): a 1px line in the
   * button's ink (`currentColor`) on the first pixel inside its edge, whole
   * as it arms and running out over --duration-arm.
   *
   * CSS and markup alone (owner, 2026-11-24: no script for what CSS can
   * draw). An SVG laid over the button's padding box (inside its 1px
   * edge), a box of its own (`data-box`) so the mark line's trim pads none
   * of it, holds one rect as large as itself, its corner the padding box's
   * own (the button's radius less the edge, `--rim-radius` the small radius
   * unless the shape sets its own). Its 2px stroke straddles the rect's
   * outline and the SVG is clipped to that same rounded box, so only the
   * inner pixel is drawn, on the edge's own curve. `pathLength` 1 runs the
   * line out at one speed along every side and round every corner, and the
   * run is a CSS animation (`animate-run-out`) that starts each time the
   * button arms (`data-armed`).
   */
  let { armed }: { armed: boolean } = $props();
</script>

<svg
  aria-hidden="true"
  class="pointer-events-none absolute inset-0 size-full opacity-0 transition-[opacity] duration-(--duration-fast) ease-out [--rim-in:calc(var(--rim-radius,var(--radius-sm))-1px)] [clip-path:inset(0_round_var(--rim-in))] data-armed:opacity-100"
  data-armed={armed || undefined}
  data-box
  data-slot="rim-countdown"
  fill="none"
>
  <rect
    class="size-full [rx:var(--rim-in)] in-data-armed:animate-run-out"
    pathLength="1"
    stroke="currentColor"
    stroke-dasharray="1 1"
    stroke-width="2"
  />
</svg>
