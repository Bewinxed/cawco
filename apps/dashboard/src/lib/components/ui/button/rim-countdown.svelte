<script lang="ts">
  /**
   * The time an armed button has left before it disarms, drawn along its
   * rim (owner's pick, 2026-11-24: "a ring that draws alongside the rims
   * that shows how much time left before acting"), drawn as the focus
   * halo is but inside the edge (owner, 2026-11-24): a 3px band of the
   * button's ink (`currentColor`) at 35%, hugging the edge from within,
   * whole as it arms and running out over --duration-arm.
   *
   * CSS and markup alone (owner, 2026-11-24: no script for what CSS can
   * draw). An SVG laid over the button's border box (`-inset-px`, over
   * its 1px edge), a box of its own (`data-box`) so the mark line's trim
   * pads none of it, holds one rect as large as itself, its corner the
   * button's own (`--rim-radius`, the small radius unless the shape sets
   * its own). Its 6px stroke straddles the rect's outline and the SVG is
   * clipped to that same rounded box, so only its inner 3px are drawn, the
   * focus halo's width: from the outer edge in, over the edge, on its own
   * curve, with no gap between the band and the button's outer line
   * (owner, 2026-11-24). `pathLength` 1 runs the
   * line out at one speed along every side and round every corner, and the
   * run is a CSS animation (`animate-run-out`) that starts each time the
   * button arms (`data-armed`).
   */
  let { armed }: { armed: boolean } = $props();
</script>

<svg
  aria-hidden="true"
  class="pointer-events-none absolute -inset-px size-[calc(100%+2px)] opacity-0 transition-[opacity] duration-(--duration-fast) ease-out [--rim-r:var(--rim-radius,var(--radius-sm))] [clip-path:inset(0_round_var(--rim-r))] data-armed:opacity-100"
  data-armed={armed || undefined}
  data-box
  data-slot="rim-countdown"
  fill="none"
>
  <rect
    class="size-full [rx:var(--rim-r)] in-data-armed:animate-run-out"
    pathLength="1"
    stroke="currentColor"
    stroke-dasharray="1 1"
    stroke-opacity="0.35"
    stroke-width="6"
  />
</svg>
